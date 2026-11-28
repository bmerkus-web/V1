// Telefoon als stuur en afstandsbediening voor de tablet of laptop.
// De game (tablet/laptop) luistert met een code; de telefoon verbindt, stuurt met zijn gyroscoop en
// stuurt knoppen door (power-up, elleboogje, schakelen, pauze). De game stuurt terug wat er op de telefoon
// te zien moet zijn (welke power-up je hebt). Los van een race-kamer, dus het werkt ook in multiplayer.
import { openLink, makeCode } from './net.js';

// Acties die de telefoon mag sturen (de rest negeren we).
export const REMOTE_ACTIONS = ['item', 'elbow', 'hop', 'gearUp', 'gearDown', 'pause', 'track'];

// ---------- in de game ----------
export class RemoteHost {
  constructor() {
    this.code = null; this.listening = false; this.t = null;
    this.steerV = 0; this.steering = false; this.ctlName = ''; this.lastMsg = -1e9; this.range = 20;
    this.onaction = () => {}; this.onstatus = () => {}; this.onconnect = () => {}; this.onlost = () => {};
    this._was = false;
    setInterval(() => this._check(), 500);
  }
  get connected() { return this.listening && performance.now() - this.lastMsg < 2500; }
  get steer() { return this.connected && this.steering ? this.steerV : 0; }
  // Begin met luisteren. Probeert eerst de vorige code (dan vindt een telefoon de game na verversen terug).
  async start(prefer) {
    if (this.listening) return this.code;
    for (const code of [prefer, makeCode(), makeCode()].filter(Boolean)) {
      try { await this._listen(code); return code; } catch (e) { this._err = e; }
    }
    throw this._err || new Error('Kan niet luisteren');
  }
  _listen(code) {
    return new Promise((resolve, reject) => {
      let done = false;
      const cb = {
        open: () => { done = true; this.code = code; this.listening = true; this.onstatus(); resolve(); },
        peer: () => {},
        data: (from, m) => this._recv(m),
        gone: () => { this.lastMsg = -1e9; this._check(); },
        error: (msg) => { if (!done) { done = true; reject(new Error(/in gebruik/.test(msg) ? 'code bezet' : msg)); } },
        timeout: () => {},
      };
      openLink(code, true, cb).then((t) => { this.t = t; if (done && !this.listening) t.close(); }, (e) => { if (!done) { done = true; reject(e); } });
    });
  }
  _recv(m) {
    if (!m || typeof m !== 'object') return;
    this.lastMsg = performance.now();
    if (m.t === 'hi') { this.ctlName = String(m.name || 'telefoon').slice(0, 20); }
    else if (m.t === 's') {
      // Met hoek (graden): de gevoeligheid van deze game; anders de waarde van de telefoon zelf.
      if (typeof m.a === 'number') { const a = m.a, dead = 1.5; this.steerV = Math.abs(a) < dead ? 0 : Math.max(-1, Math.min(1, (a - Math.sign(a) * dead) / Math.max(4, this.range - dead))); }
      else this.steerV = Math.max(-1, Math.min(1, +m.v || 0)); if (this.steering !== !!m.g) { this.steering = !!m.g; this.onstatus(); } }
    else if (m.t === 'b' && REMOTE_ACTIONS.includes(m.a)) this.onaction(m.a);
    this._check();
  }
  _check() {
    const c = this.connected;
    if (c !== this._was) { this._was = c; if (c) this.onconnect(); else if (this.listening) this.onlost(); this.onstatus(); }
  }
  send(msg) { if (this.connected) this.t?.send(null, msg); }
  stop() { this.listening = false; this.t?.close(); this.t = null; this.lastMsg = -1e9; this._check(); this.onstatus(); }
}

// ---------- op de telefoon ----------
export class RemoteCtl {
  constructor(gyro) {
    this.gyro = gyro; this.code = null; this.t = null; this.on = false; this.useGyro = true;
    this.linked = false; this.lastState = -1e9; this.state = {};
    this.onstate = () => {}; this.onstatus = () => {};
    this._timer = null; this._lastSent = { v: null, at: 0 };
  }
  get connected() { return this.linked && performance.now() - this.lastState < 4000; }
  async connect(code, name) {
    this.code = code.toUpperCase(); this.name = name; this.on = true;
    await this._join();
    clearInterval(this._timer);
    this._timer = setInterval(() => this._tick(), 33); // ~30x per seconde stuur doorgeven
  }
  _join() {
    return new Promise((resolve, reject) => {
      let done = false;
      this.t?.close(); this.t = null; this.linked = false;
      const cb = {
        open: () => { done = true; this.linked = true; this.lastState = performance.now(); this.t?.send(null, { t: 'hi', name: this.name }); this.onstatus(); resolve(); },
        peer: () => {},
        data: (from, m) => { if (m?.t === 'st') { this.state = m; this.lastState = performance.now(); this.onstate(m); } },
        gone: () => { this.linked = false; this.onstatus(); },
        error: (msg) => { if (!done) { done = true; reject(new Error(/niet gevonden/.test(msg) ? 'Geen game gevonden met deze code' : msg)); } else { this.linked = false; this.onstatus(); } },
        timeout: () => { if (!done) { done = true; reject(new Error('Geen game gevonden met deze code')); } },
      };
      openLink(this.code, false, cb).then((t) => { this.t = t; }, (e) => { if (!done) { done = true; reject(e); } });
    });
  }
  _tick() {
    if (!this.on) return;
    const now = performance.now();
    if (!this.connected) { // verbinding kwijt: elke 3 s opnieuw proberen
      if (!this._retryAt || now > this._retryAt) { this._retryAt = now + 3000; this.onstatus(); this._join().catch(() => {}); }
      return;
    }
    const g = this.useGyro && this.gyro.active, v = g ? Math.round(this.gyro.steer * 100) / 100 : 0, a = g ? Math.round(this.gyro.angle * 10) / 10 : 0;
    if (a !== this._lastSent.a || now - this._lastSent.at > 300) { this.t?.send(null, { t: 's', v, a, g }); this._lastSent = { a, at: now }; }
  }
  press(a) { if (this.linked) this.t?.send(null, { t: 'b', a }); }
  stop() { this.on = false; clearInterval(this._timer); this.t?.close(); this.t = null; this.linked = false; this.onstatus(); }
}
