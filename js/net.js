// Multiplayer: de host is het middelpunt (ster). Transport is WebRTC via PeerJS,
// of BroadcastChannel (?net=local) om met meerdere tabbladen op één computer te testen.
const PREFIX = 'wattblitz-v1-';
const LOCAL = new URLSearchParams(location.search).get('net') === 'local';

export const makeCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');

function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/peerjs.min.js';
    s.onload = res;
    s.onerror = () => rej(new Error('PeerJS laden mislukt'));
    document.head.appendChild(s);
  });
}

// --- Transports: beide leveren { send(to|null, msg), close() } en roepen cb.open/peer/data/gone/error aan ---
function bcTransport(code, isHost, cb) {
  const ch = new BroadcastChannel(PREFIX + code);
  const me = isHost ? 'host' : 'c' + Math.random().toString(36).slice(2, 8);
  const peers = new Set();
  ch.onmessage = ({ data }) => {
    if (data.to && data.to !== me) return;
    if (!data.to && !isHost) return; // ongeadresseerd = voor de host
    if (data.sys === 'join' && isHost) { peers.add(data.from); cb.peer(data.from); ch.postMessage({ to: data.from, from: me, sys: 'ok' }); }
    else if (data.sys === 'ok') cb.open();
    else if (data.sys === 'bye') { if (isHost) { peers.delete(data.from); cb.gone(data.from); } else cb.gone('host'); }
    else cb.data(data.from, data.msg);
  };
  setTimeout(() => {
    if (isHost) cb.open();
    else {
      ch.postMessage({ from: me, sys: 'join' });
      setTimeout(() => cb.timeout?.(), 2500);
    }
  }, 30);
  addEventListener('pagehide', () => ch.postMessage({ from: me, sys: 'bye', to: isHost ? undefined : 'host' }));
  return {
    send(to, msg) {
      if (isHost && !to) for (const p of peers) ch.postMessage({ to: p, from: me, msg });
      else ch.postMessage({ to: isHost ? to : 'host', from: me, msg });
    },
    close() {
      if (isHost) for (const p of peers) ch.postMessage({ to: p, from: me, sys: 'bye' });
      else ch.postMessage({ to: 'host', from: me, sys: 'bye' });
      ch.close();
    },
  };
}

async function peerTransport(code, isHost, cb) {
  await loadPeerJS();
  const peer = isHost ? new window.Peer(PREFIX + code) : new window.Peer();
  const conns = new Map();
  let closed = false;
  const wire = (conn) => {
    conn.on('data', (d) => cb.data(conn.peer, d));
    conn.on('close', () => { conns.delete(conn.peer); if (!closed) cb.gone(isHost ? conn.peer : 'host'); });
    conn.on('error', () => {});
  };
  peer.on('error', (e) => {
    const msg = e.type === 'unavailable-id' ? 'Deze kamercode is al in gebruik' :
      e.type === 'peer-unavailable' ? 'Kamer niet gevonden' : 'Verbindingsfout (' + e.type + ')';
    cb.error(msg);
  });
  peer.on('disconnected', () => { if (!closed) peer.reconnect(); });
  peer.on('open', () => {
    if (isHost) cb.open();
    else {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conns.set('host', conn);
      conn.on('open', () => cb.open());
      wire(conn);
      setTimeout(() => { if (!conn.open) cb.timeout?.(); }, 12000);
    }
  });
  if (isHost) peer.on('connection', (conn) => {
    conn.on('open', () => { conns.set(conn.peer, conn); cb.peer(conn.peer); });
    wire(conn);
  });
  return {
    send(to, msg) {
      if (isHost && !to) { for (const c of conns.values()) if (c.open) c.send(msg); }
      else { const c = conns.get(isHost ? to : 'host'); if (c?.open) c.send(msg); }
    },
    close() { closed = true; peer.destroy(); },
  };
}

// Kamer: houdt de spelerslijst bij en routeert berichten.
// Events: onRoster(players), onSettings(s), onStart(cfg), onGame(msg), onLobby(), onClosed(reden)
export class Room {
  constructor(code, isHost, me) {
    this.code = code;
    this.isHost = isHost;
    this.me = { ...me, id: isHost ? 'p0' : null };
    this.players = isHost ? [this.me] : [];
    this.settings = null;
    this.inRace = false;
    this._nextId = 1;
    this._ids = new Map(); // transport-peer -> spelers-id
    this._seen = new Map(); // transport-peer -> laatst gehoord
    this.onRoster = this.onSettings = this.onStart = this.onGame = this.onLobby = this.onClosed = () => {};
  }
  open() {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (m) => { if (!done) { done = true; reject(new Error(m)); } else this.onClosed(m); };
      const cb = {
        open: () => {
          if (this.isHost) { done = true; resolve(); }
          else this.t.send(null, { t: 'hello', name: this.me.name, color: this.me.color });
        },
        peer: () => {},
        data: (from, msg) => {
          this._seen.set(this.isHost ? from : 'host', Date.now());
          if (msg.t === 'ping') return;
          if (!this.isHost && msg.t === 'welcome') { this.me.id = msg.id; done = true; resolve(); }
          if (!this.isHost && msg.t === 'full' && !done) { fail(msg.why); return; }
          this._recv(from, msg);
        },
        gone: (from) => this._gone(from),
        error: fail,
        timeout: () => { if (!done) fail('Kamer niet gevonden'); },
      };
      Promise.resolve(LOCAL ? bcTransport(this.code, this.isHost, cb) : peerTransport(this.code, this.isHost, cb))
        .then((t) => { this.t = t; }, (e) => fail(e.message));
      // Hartslag: zo merken we ook een weggevallen verbinding (wifi uit, tab dicht).
      this._beat = setInterval(() => {
        if (!this.t || !done) return;
        this.t.send(null, { t: 'ping' });
        const now = Date.now();
        for (const [peer, at] of this._seen) {
          if (now - at < 10000) continue;
          this._seen.delete(peer);
          this._gone(peer);
        }
      }, 2000);
    });
  }
  _recv(from, msg) {
    if (this.isHost) {
      if (msg.t === 'hello') {
        if (this.players.length >= 6 || this.inRace) { this.t.send(from, { t: 'full', why: this.inRace ? 'De race is al bezig' : 'De kamer is vol' }); return; }
        const id = 'p' + this._nextId++;
        this._ids.set(from, id);
        this.players.push({ id, name: String(msg.name).slice(0, 14), color: msg.color });
        this.t.send(from, { t: 'welcome', id });
        if (this.settings) this.t.send(from, { t: 'settings', s: this.settings });
        this._roster();
        return;
      }
      const id = this._ids.get(from);
      if (!id) return;
      // Doorsturen naar de andere spelers.
      for (const [peer, pid] of this._ids) if (pid !== id) this.t.send(peer, msg);
      this.onGame(msg);
      return;
    }
    switch (msg.t) {
      case 'welcome': break;
      case 'full': this.onClosed(msg.why); break;
      case 'roster': this.players = msg.players; this.onRoster(this.players); break;
      case 'settings': this.settings = msg.s; this.onSettings(msg.s); break;
      case 'start': this.inRace = true; this.onStart(msg.cfg); break;
      case 'lobby': this.inRace = false; this.onLobby(); break;
      default: this.onGame(msg);
    }
  }
  _gone(from) {
    this._seen.delete(from);
    if (!this.isHost) { clearInterval(this._beat); this.onClosed('De host heeft de kamer verlaten'); return; }
    const id = this._ids.get(from);
    if (!id) return;
    this._ids.delete(from);
    this.players = this.players.filter((p) => p.id !== id);
    this._roster();
    this.send({ t: 'left', id });
    this.onGame({ t: 'left', id });
  }
  _roster() {
    this.t.send(null, { t: 'roster', players: this.players });
    this.onRoster(this.players);
  }
  // Host-acties
  setSettings(s) { this.settings = s; this.t.send(null, { t: 'settings', s }); }
  start(cfg) { this.inRace = true; this.t.send(null, { t: 'start', cfg }); }
  toLobby() { this.inRace = false; this.t.send(null, { t: 'lobby' }); }
  // Spelbericht naar alle anderen.
  send(msg) { this.t?.send(null, msg); }
  close() { clearInterval(this._beat); this.t?.close(); this.t = null; }
}
