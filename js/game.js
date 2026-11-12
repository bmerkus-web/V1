// Race-logica: renners, items, bots, zones/PR's, spook en netwerk-synchronisatie.
import { SEG } from './track.js';
import { stepSpeed, fxMask, REF_FTP, REF_KG, FX } from './physics.js';
import { clamp, mod, lerp, mulberry, fmtTime, fmtDelta } from './util.js';
import { submitTime, getTime, setGhost, submitPower, store, save } from './storage.js';

export const ITEMS = {
  turbo: { name: 'Turbo', icon: '⚡', hint: 'Korte megaversnelling' },
  shield: { name: 'Schild', icon: '🛡️', hint: 'Blokkeert één aanval' },
  rocket: { name: 'Vuurpijl', icon: '🚀', hint: 'Zoekt de renner vóór je' },
  glue: { name: 'Lijmklodder', icon: '🟣', hint: 'Plakt achter je op de weg' },
  magnet: { name: 'Magneet', icon: '🧲', hint: 'Trekt je naar de renner vóór je' },
  storm: { name: 'Tegenwind', icon: '🌪️', hint: 'Storm voor iedereen vóór je' },
};

export const BOT_NAMES = ['Turbo Tess', 'Watt Wout', 'Sprint Sanne', 'Klim Kees', 'Demarrage Daan', 'Bidon Bram', 'Kopman Koen'];
export const DIFFICULTY = { makkelijk: 0.7, normaal: 0.82, zwaar: 0.93, beul: 1.05 };

function pickItem(rng, rank, total) {
  if (total <= 1) return rng() < 0.7 ? 'turbo' : 'shield';
  const f = (rank - 1) / (total - 1);
  const first = rank === 1;
  const w = {
    turbo: 2 + 2 * f, shield: 3 - 1.5 * f, glue: 3 - 2.5 * f,
    rocket: first ? 0 : 1 + 3 * f, magnet: first ? 0 : 0.5 + 2.5 * f, storm: f > 0.45 ? 2.2 * f : 0,
  };
  let sum = 0;
  for (const k in w) sum += w[k];
  let r = rng() * sum;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return 'turbo';
}

export class Race {
  constructor(cfg) {
    Object.assign(this, cfg); // track, laps, room, isHost, ns, profile, getPower, getSteer, difficulty, ghost, emit
    this.L = this.track.length;
    this.total = this.L * this.laps;
    this.rng = mulberry((cfg.seed || 1) ^ 0x9e3779b9);
    this.time = 0;
    this.clock = 0; // loopt altijd (animaties)
    this.countdown = 5;
    this.state = 'countdown';
    this.riders = cfg.riders.map((r, i) => this._mkRider(r, i));
    this.me = this.riders.find((r) => r.kind === 'me');
    this.hazards = [];
    this.rockets = [];
    this.objCool = new Float32Array(this.track.objects.length);
    this.feed = [];
    this.activeZone = null;
    this.zoneStart = {};
    this.lapStart = 0;
    this.lastLap = null;
    this.prs = []; // behaalde PR's deze race
    this.ghostDelta = null;
    this.ghostRider = this.ghost ? { id: 'ghost', name: 'PR', color: '#ffffff', kind: 'ghost', dist: -3, x: 0, v: 0, mask: 0, bolts: 0, cadence: 80 } : null;
    this.rec = [];
    this.recAt = 0;
    this.stats = { sumP: 0, n: 0, maxP: 0, secs: [], secAcc: 0, secN: 0, secT: 0, best: { 5: 0, 60: 0, 300: 0 }, maxV: 0, sumHr: 0, nHr: 0, maxHr: 0, log: [] };
    this.launch = 0;
    this.netAt = 0;
    this.trainerGrade = 0;
    this._hid = 0;
    this._lastCount = 6;
    this.rank();
  }

  _mkRider(r, i) {
    const row = Math.floor(i / 3), col = i % 3;
    const rider = {
      id: r.id, name: r.name, color: r.color, kind: r.kind,
      dist: -3 - row * 4, x: [-0.5, 0, 0.5][col], v: 0, power: 0, cadence: 0, steer: 0,
      item: null, roulette: 0, bolts: 0, draft: false, mask: 0,
      fx: { boost: 0, slow: 0, shield: 0, storm: 0, magnet: 0, spin: 0 },
      finished: false, finishTime: null, rank: i + 1, bell: 0, net: null,
    };
    if (r.kind === 'bot') {
      const ref = this.profile.fair ? REF_FTP : (this.profile.ftp * REF_KG) / (this.profile.weight || REF_KG);
      rider.ai = {
        base: ref * (DIFFICULTY[this.difficulty] || 0.82) * (0.88 + 0.2 * (r.skill ?? 0.5)),
        ph: this.rng() * 10, lane: rider.x, tx: rider.x, think: 0, itemT: 0, laneT: 3 + this.rng() * 6,
      };
    }
    return rider;
  }

  byId(id) { return this.riders.find((r) => r.id === id); }
  local(r) { return r.kind === 'me' || r.kind === 'bot'; }
  say(text) { this.feed.push({ text, at: this.clock }); if (this.feed.length > 4) this.feed.shift(); }

  rank() {
    const s = [...this.riders].sort((a, b) =>
      a.finished && b.finished ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.dist - a.dist);
    s.forEach((r, i) => { r.rank = i + 1; });
    this.order = s;
  }

  // ---------- hoofdlus ----------
  update(dt) {
    this.clock += dt;
    const me = this.me;
    const inp = this.getPower(dt);
    me.power = inp.power;
    me.cadence = inp.cadence;
    me.hr = inp.hr || 0;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      this.launch = lerp(this.launch, me.power, Math.min(1, dt * 2.5));
      const c = Math.ceil(this.countdown);
      if (c !== this._lastCount && c > 0 && c <= 3) this.emit('count', c);
      this._lastCount = c;
      if (this.countdown <= 0) {
        this.state = 'race';
        this.startedAt = Date.now();
        this.emit('go');
        if (this.launch > this.profile.ftp * 1.2) {
          me.fx.boost = 2.5;
          this.emit('banner', { text: 'RAKETSTART!', color: '#ffd166' });
          this.emit('sfx', 'boost');
        }
      }
      for (const r of this.riders) r.mask = fxMask(r);
      this._net(dt);
      return;
    }
    this.time += dt;

    // Ik
    // Eerlijk: vermogen t.o.v. FTP. Anders: watt per kilo (omgerekend naar een renner van 75 kg).
    const eff = this.profile.fair ? (me.power * REF_FTP) / Math.max(80, this.profile.ftp) : (me.power * REF_KG) / clamp(this.profile.weight || REF_KG, 40, 150);
    if (me.finished) this._stepLocal(me, 110, clamp(-me.x * 2, -1, 1), dt, true);
    else {
      this._stepLocal(me, eff, this.getSteer(dt), dt, false);
      this._meProgress(dt);
    }

    // Bots (alleen als ik ze beheer) en renners op afstand
    for (const r of this.riders) {
      if (r.kind === 'bot') this._bot(r, dt);
      else if (r.kind === 'remote') this._remote(r, dt);
    }
    this._rockets(dt);
    for (const h of this.hazards) h.age += dt;
    this.hazards = this.hazards.filter((h) => h.age < 45);
    this.rank();
    this._ghost(dt);

    const seg = this.track.segAt(me.dist);
    this.trainerGrade = seg.grade * (this.profile.trainerFeel / 100) + (me.fx.slow > 0 ? 3 : 0) + (me.fx.storm > 0 ? 1.5 : 0) - (me.fx.boost > 0 ? 1.5 : 0);
    this._net(dt);
  }

  // Beweegt een renner die ik beheer (ikzelf of een bot).
  _stepLocal(r, power, steer, dt, auto) {
    const e = r.fx;
    for (const k in e) if (e[k] > 0) e[k] = Math.max(0, e[k] - dt);
    if (r.bell > 0) r.bell -= dt;
    const seg = this.track.segAt(r.dist);
    if (e.spin > 0) steer += Math.sin(this.clock * 22) * 0.9;
    r.steer = lerp(r.steer, steer, Math.min(1, dt * 10));
    const authority = clamp(r.v / 4, 0.25, 1);
    r.x += steer * 1.15 * dt * authority;
    if (!auto) {
      // Zonder stuurhulp duwt de bocht je naar buiten; mét stuurhulp blijf je vanzelf op de weg.
      if (!this.profile.assist) r.x -= seg.curve * r.v * r.v * 0.0045 * dt;
      else if (Math.abs(r.x) > 0.92 && Math.abs(steer) < 0.15) r.x -= Math.sign(r.x) * 0.5 * dt;
    }
    r.x = clamp(r.x, -1.45, 1.45);

    // Slipstream en magneet
    r.draft = false;
    let pull = false;
    for (const o of this.riders) {
      if (o === r) continue;
      const gap = o.dist - r.dist;
      if (gap > 0.8 && gap < 10 && Math.abs(o.x - r.x) < 0.28) r.draft = true;
      if (e.magnet > 0 && gap > 3 && gap < 160) pull = true;
      // Lichte botsing: wie achterop rijdt wijkt uit.
      if (gap > 0 && gap < 1.6 && Math.abs(o.x - r.x) < 0.16) r.x += (r.x >= o.x ? 1 : -1) * dt * 0.8;
    }
    const prev = r.dist;
    r.v = stepSpeed(r, power, seg.grade, dt, pull);
    r.dist += r.v * dt;

    if (r.dist >= 0) this._pickups(r, prev);
    if (r.roulette > 0) {
      r.roulette -= dt;
      if (r.roulette <= 0) {
        r.item = pickItem(this.rng, r.rank, this.riders.length);
        if (r === this.me) this.emit('sfx', 'item');
      }
    }
    if (!r.finished && r.dist >= this.total) {
      r.finished = true;
      r.finishTime = this.time - (r.dist - this.total) / Math.max(r.v, 1);
      this.room?.send({ t: 'fin', id: r.id, time: r.finishTime });
      if (r !== this.me) this.say(`🏁 ${r.name}`);
    }
    r.mask = fxMask(r);
  }

  _pickups(r, prev) {
    const tr = this.track, isMe = r === this.me;
    const s0 = Math.floor(mod(prev, this.L) / SEG), s1 = Math.floor(mod(r.dist, this.L) / SEG);
    const m0 = mod(prev, this.L), m1 = mod(r.dist, this.L);
    for (let s = s0; ; s = (s + 1) % tr.n) {
      const seg = tr.segs[s];
      for (const o of seg.objs) {
        if (this.objCool[o.id] > this.time) continue;
        const passed = m1 >= m0 ? o.d > m0 && o.d <= m1 : o.d > m0 || o.d <= m1;
        if (!passed) continue;
        if (o.type === 'box' && Math.abs(o.x - r.x) < 0.2) {
          this.objCool[o.id] = this.time + 5;
          if (!r.item && r.roulette <= 0) { r.roulette = 1.3; if (isMe) this.emit('sfx', 'box'); }
        } else if (o.type === 'bolt' && Math.abs(o.x - r.x) < 0.17) {
          this.objCool[o.id] = this.time + 15;
          r.bolts = Math.min(10, r.bolts + 1);
          if (isMe) this.emit('sfx', 'bolt');
        }
      }
      if (seg.pad && Math.abs(seg.pad.x - r.x) < seg.pad.w && r.fx.boost < 1.2) {
        if (isMe && r.fx.boost <= 0) { this.emit('sfx', 'boost'); this.emit('shake', 4); }
        r.fx.boost = 1.6;
      }
      if (s === s1) break;
    }
    // Lijmklodders
    for (const h of this.hazards) {
      if (h.gone || (h.owner === r.id && h.age < 1.2)) continue;
      const dd = mod(r.dist - h.d + this.L / 2, this.L) - this.L / 2;
      if (Math.abs(dd) < 1.8 && Math.abs(h.x - r.x) < 0.2) {
        h.gone = true;
        this.room?.send({ t: 'hazgone', hid: h.id });
        this.hit(r, 'glue', h.owner);
      }
    }
    this.hazards = this.hazards.filter((h) => !h.gone);
  }

  // Voortgang van mijzelf: zones, rondes, finish, statistiek.
  _meProgress(dt) {
    const me = this.me, st = this.stats, L = this.L, id = this.track.id;
    st.sumP += me.power; st.n++;
    if (me.hr > 0) { st.sumHr += me.hr; st.nHr++; st.maxHr = Math.max(st.maxHr, me.hr); }
    st.maxP = Math.max(st.maxP, me.power);
    st.maxV = Math.max(st.maxV, me.v);
    st.secAcc += me.power; st.secN++; st.secT += dt;
    if (st.secT >= 1) {
      st.secs.push(st.secAcc / st.secN);
      // Rit-logboek (1x per seconde) voor de export naar Strava e.d.
      st.log.push([Math.round(this.time * 10) / 10, Math.max(0, me.dist), st.secAcc / st.secN, me.cadence, me.hr, me.v, this.track.yAt(me.dist)]);
      st.secAcc = st.secN = 0; st.secT -= 1;
      for (const w of [5, 60, 300]) {
        if (st.secs.length < w) continue;
        let s = 0;
        for (let i = st.secs.length - w; i < st.secs.length; i++) s += st.secs[i];
        st.best[w] = Math.max(st.best[w], s / w);
      }
    }
    // Spook opnemen (2x per seconde)
    this.recAt -= dt;
    if (this.recAt <= 0) { this.recAt += 0.5; this.rec.push(Math.round(me.dist * 10) / 10, Math.round(me.x * 100)); }

    if (me.dist < 0) return;
    const m1 = mod(me.dist, L), m0 = mod(me.dist - me.v * dt, L);
    for (const z of this.track.zones) {
      if (m0 < z.start && m1 >= z.start) {
        this.zoneStart[z.id] = this.time;
        this.activeZone = { zone: z, t0: this.time, pr: getTime(this.ns, `${id}|seg|${z.id}`) };
        this.emit('sfx', 'zone');
        this.emit('banner', { text: (z.type === 'sprint' ? '⚡ SPRINT: ' : '⛰️ KLIM: ') + z.name, sub: this.activeZone.pr ? 'PR ' + fmtTime(this.activeZone.pr) : 'Zet een eerste tijd!', color: z.type === 'sprint' ? '#39ffb0' : '#ff7b1c' });
      }
      if (m0 < z.end && m1 >= z.end && this.zoneStart[z.id] != null) {
        const t = this.time - this.zoneStart[z.id];
        delete this.zoneStart[z.id];
        this.activeZone = null;
        me.bolts = Math.min(10, me.bolts + 2);
        this._time(`${id}|seg|${z.id}`, t, z.name);
      }
    }
    const lap = Math.floor(me.dist / L);
    if (lap > (this._lap || 0)) {
      this._lap = lap;
      const t = this.time - this.lapStart;
      this.lapStart = this.time;
      this.lastLap = t;
      if (this.laps > 1) {
        this._time(`${id}|lap`, t, 'Ronde');
        if (lap < this.laps) this.emit('sfx', 'lap');
        if (lap === this.laps - 1) this.emit('banner', { text: 'LAATSTE RONDE!', color: '#ff3fa4' });
      }
    }
    if (me.finished) {
      const key = `${id}|race|${this.laps}`;
      const res = this._time(key, me.finishTime, 'Race');
      if (res.isPR) setGhost(this.ns, `${id}|ghost|${this.laps}`, { d: this.rec });
      this.state = 'done';
      const s = store.stats;
      s.km += this.total / 1000; s.races++;
      if (me.rank === 1 && this.riders.length > 1) s.wins++;
      s.xp += Math.round(this.total / 100 + (this.riders.length - me.rank) * 15 + this.prs.length * 10);
      this.savePower();
      save();
      this.emit('finish');
    }
  }

  savePower() {
    if (this.ns !== 'real') return;
    const b = this.stats.best;
    this.powerPRs = [5, 60, 300].filter((w) => b[w] > 0 && submitPower(w, b[w]));
    save();
  }

  _time(key, t, label) {
    const res = submitTime(this.ns, key, t);
    if (res.isPR) {
      this.prs.push({ label, t, prev: res.prev });
      this.emit('sfx', 'pr');
      this.emit('banner', { text: `🏆 PR ${label}: ${fmtTime(t)}`, sub: res.prev ? fmtDelta(t - res.prev) : 'Eerste tijd!', color: '#ffd166' });
    } else {
      this.emit('banner', { text: `${label}: ${fmtTime(t)}`, sub: fmtDelta(t - res.prev) + ' t.o.v. PR', color: '#f5f5ff' });
    }
    save();
    return res;
  }

  _ghost() {
    const g = this.ghostRider;
    if (!g) return;
    const d = this.ghost.d, n = d.length / 2;
    const f = this.time / 0.5, i = Math.floor(f);
    if (i >= n - 1) { g.dist = d[(n - 1) * 2]; g.v = 0; this.ghostDelta = null; g.hidden = true; return; }
    g.dist = lerp(d[i * 2], d[i * 2 + 2], f - i);
    g.x = lerp(d[i * 2 + 1], d[i * 2 + 3], f - i) / 100;
    g.v = (d[i * 2 + 2] - d[i * 2]) / 0.5;
    // Tijdsverschil: wanneer was het spook op mijn huidige afstand?
    const md = this.me.dist;
    let lo = 0, hi = n - 1;
    if (md <= d[0] || md > d[hi * 2] || this.me.finished) { if (this.me.finished) return; this.ghostDelta = null; return; }
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (d[mid * 2] < md) lo = mid; else hi = mid; }
    const span = d[hi * 2] - d[lo * 2];
    const tg = (lo + (span > 0 ? (md - d[lo * 2]) / span : 0)) * 0.5;
    this.ghostDelta = this.time - tg;
  }

  // ---------- items ----------
  useItem(r = this.me) {
    if (!r.item || this.state === 'countdown' || r.finished) return;
    const item = r.item;
    r.item = null;
    const isMe = r === this.me;
    const msg = { t: 'use', id: r.id, item };
    switch (item) {
      case 'turbo': r.fx.boost = 4; if (isMe) { this.emit('sfx', 'boost'); this.emit('shake', 6); } break;
      case 'shield': r.fx.shield = 12; if (isMe) this.emit('sfx', 'shield'); break;
      case 'magnet': r.fx.magnet = 6; if (isMe) this.emit('sfx', 'shield'); break;
      case 'glue':
        msg.h = { id: r.id + '-' + this._hid++, d: mod(r.dist - 3, this.L), x: r.x, owner: r.id };
        this.hazards.push({ ...msg.h, age: 0 });
        if (isMe) this.emit('sfx', 'drop');
        break;
      case 'rocket': {
        const target = this.order[r.rank - 2];
        if (!target || target.finished) { r.fx.boost = 2; if (isMe) this.emit('sfx', 'boost'); break; }
        msg.to = target.id;
        this.rockets.push({ from: r.id, to: target.id, d: r.dist + 1, x: r.x, age: 0 });
        if (isMe) this.emit('sfx', 'fire');
        break;
      }
      case 'storm': this._storm(r); break;
    }
    this.room?.send(msg);
  }

  _storm(src) {
    this.emit('sfx', 'storm');
    this.stormFlash = 1;
    this.say(`🌪️ ${src.name} ontketent tegenwind`);
    for (const o of this.riders) if (this.local(o) && o !== src && o.dist > src.dist && !o.finished) this.hit(o, 'storm', src.id);
  }

  hit(r, kind, by) {
    const blocked = r.fx.shield > 0;
    if (blocked) r.fx.shield = 0;
    else if (kind === 'rocket') { r.v *= 0.45; r.fx.spin = 1.2; r.bolts = Math.max(0, r.bolts - 3); }
    else if (kind === 'glue') { r.fx.slow = 2.5; r.bolts = Math.max(0, r.bolts - 1); }
    else if (kind === 'storm') r.fx.storm = 6;
    this.room?.send({ t: 'hit', id: r.id, kind, by, blocked });
    this._hitFx(r, kind, by, blocked);
  }

  _hitFx(r, kind, by, blocked) {
    const src = this.byId(by);
    if (r === this.me) {
      if (blocked) { this.emit('sfx', 'block'); this.emit('banner', { text: '🛡️ GEBLOKT!', color: '#7df9ff' }); }
      else if (kind !== 'storm') { this.emit('sfx', 'hit'); this.emit('shake', 14); this.emit('flash', kind === 'glue' ? '#b44dff' : '#ff3b3b'); }
    } else if (src === this.me && kind !== 'storm') {
      this.emit('banner', { text: blocked ? `${r.name} blokte je aanval` : `RAAK! ${r.name}`, color: blocked ? '#7df9ff' : '#39ffb0' });
      if (!blocked) this.emit('sfx', 'block');
    }
    if (kind !== 'storm' && src && src !== r) this.say(`${src.name} ${blocked ? '🛡️' : kind === 'rocket' ? '🚀' : '🟣'} ${r.name}`);
    r.hitAt = this.clock;
  }

  _rockets(dt) {
    for (const p of this.rockets) {
      const t = this.byId(p.to);
      p.age += dt;
      if (!t || p.age > 15) { p.done = true; continue; }
      p.d += (Math.max(t.v, 4) + 30) * dt;
      p.x = lerp(p.x, t.x, Math.min(1, dt * 4));
      if (p.d >= t.dist - 0.5) {
        p.done = true;
        if (this.local(t)) this.hit(t, 'rocket', p.from);
      }
    }
    this.rockets = this.rockets.filter((p) => !p.done);
  }

  bell() {
    this.me.bell = 1;
    this.emit('sfx', 'bell');
    this.room?.send({ t: 'bell', id: this.me.id });
  }

  // ---------- bots ----------
  _bot(r, dt) {
    const ai = r.ai, me = this.me;
    const seg = this.track.segAt(r.dist);
    let p = ai.base * (1 + 0.08 * Math.sin(this.time * 0.13 + ai.ph) + 0.05 * Math.sin(this.time * 0.47 + ai.ph * 2));
    if (seg.grade > 3) p *= 1.08;
    if (seg.zone === 'sprint') p *= 1.3;
    if (this.total - r.dist < 300) p *= 1.35;
    if (!me.finished) p *= 1 + clamp((me.dist - r.dist) / 400, -0.1, 0.12); // elastiek
    if (r.finished) p = 100;
    r.power = p;
    r.cadence = 85 + 10 * Math.sin(this.time * 0.2 + ai.ph);

    ai.think -= dt;
    if (ai.think <= 0) {
      ai.think = 0.35;
      ai.laneT -= 0.35;
      if (ai.laneT <= 0) { ai.laneT = 5 + this.rng() * 8; ai.lane = (this.rng() * 2 - 1) * 0.7; }
      let tx = ai.lane, best = 1e9;
      const m = mod(r.dist, this.L);
      const s0 = Math.floor(m / SEG);
      for (let k = 2; k < 12; k++) {
        const sg = this.track.segs[(s0 + k) % this.track.n];
        if (sg.pad && k < best) { best = k; tx = sg.pad.x; }
        for (const o of sg.objs) {
          if (this.objCool[o.id] > this.time || (o.type === 'box' && r.item)) continue;
          const cost = k + Math.abs(o.x - r.x) * 12 - (o.type === 'box' ? 6 : 0);
          if (Math.abs(o.x - r.x) < 0.55 && cost < best) { best = cost; tx = o.x; }
        }
      }
      for (const h of this.hazards) {
        const dd = mod(h.d - m, this.L);
        if (dd < 35 && Math.abs(h.x - tx) < 0.26) tx = h.x + (tx >= h.x ? 0.42 : -0.42);
      }
      ai.tx = clamp(tx, -0.85, 0.85);
    }
    const steer = clamp((ai.tx - r.x) * 4, -0.8, 0.8);
    this._stepLocal(r, p, steer, dt, true);

    if (r.item) {
      ai.itemT += dt;
      const ahead = this.order[r.rank - 2];
      const gap = ahead ? ahead.dist - r.dist : 1e9;
      const ready = ai.itemT > 1.5 + (ai.ph % 3);
      const ok = r.item === 'rocket' || r.item === 'magnet' ? gap < 150 || ai.itemT > 12 :
        r.item === 'glue' ? this.riders.some((o) => o !== r && r.dist - o.dist > 2 && r.dist - o.dist < 40) || ai.itemT > 10 : true;
      if (ready && ok) { ai.itemT = 0; this.useItem(r); }
    }
  }

  // ---------- netwerk ----------
  _remote(r, dt) {
    if (r.bell > 0) r.bell -= dt;
    const n = r.net;
    if (!n) return;
    n.age += dt;
    const target = n.d + n.v * Math.min(n.age, 1);
    r.dist = lerp(r.dist + n.v * dt, target, Math.min(1, dt * 6));
    r.x = lerp(r.x, n.x, Math.min(1, dt * 8));
    r.v = n.v;
  }

  _net(dt) {
    if (!this.room) return;
    this.netAt -= dt;
    if (this.netAt > 0) return;
    this.netAt = 0.1;
    const a = [];
    for (const r of this.riders) {
      if (!this.local(r)) continue;
      a.push([r.id, Math.round(r.dist * 10) / 10, Math.round(r.x * 100) / 100, Math.round(r.v * 10) / 10, Math.round(r.power), r.mask, r.bolts, Math.round(r.cadence)]);
    }
    this.room.send({ t: 'st', a });
  }

  onNet(msg) {
    switch (msg.t) {
      case 'st':
        for (const [id, d, x, v, p, mask, bolts, cad] of msg.a) {
          const r = this.byId(id);
          if (!r || this.local(r)) continue;
          if (!r.net) { r.dist = d; r.x = x; }
          r.net = { d, x, v, age: 0 };
          r.power = p; r.mask = mask; r.bolts = bolts; r.cadence = cad;
        }
        break;
      case 'use': {
        const r = this.byId(msg.id);
        if (!r) break;
        if (msg.item === 'glue') this.hazards.push({ ...msg.h, age: 0 });
        else if (msg.item === 'rocket' && msg.to) {
          this.rockets.push({ from: r.id, to: msg.to, d: r.dist + 1, x: r.x, age: 0 });
          if (msg.to === this.me.id) this.emit('banner', { text: '🚀 VUURPIJL OP KOMST!', color: '#ff3b3b' });
        } else if (msg.item === 'storm') this._storm(r);
        break;
      }
      case 'hazgone': this.hazards = this.hazards.filter((h) => h.id !== msg.hid); break;
      case 'hit': { const r = this.byId(msg.id); if (r) this._hitFx(r, msg.kind, msg.by, msg.blocked); break; }
      case 'fin': {
        const r = this.byId(msg.id);
        if (r && !r.finished) { r.finished = true; r.finishTime = msg.time; this.say(`🏁 ${r.name}`); }
        break;
      }
      case 'bell': { const r = this.byId(msg.id); if (r) { r.bell = 1; this.emit('sfx', 'bell'); } break; }
      case 'left': {
        const r = this.byId(msg.id);
        if (r) { this.riders = this.riders.filter((o) => o !== r); this.say(`${r.name} is weg`); this.rank(); }
        break;
      }
    }
  }

  results() {
    this.rank();
    return this.order.map((r) => ({ id: r.id, name: r.name, color: r.color, rank: r.rank, time: r.finishTime, me: r === this.me, kind: r.kind }));
  }
}

export { FX };
