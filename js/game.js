// Race-logica: renners, items, bots, zones/PR's, spook en netwerk-synchronisatie.
import { SEG, ROAD_W } from './track.js';
import { stepSpeed, fxMask, REF_FTP, REF_KG, FX } from './physics.js';
import { clamp, mod, lerp, mulberry, fmtTime, fmtDelta } from './util.js';
import { submitTime, getTime, setGhost, getGhost, submitPower, store, save } from './storage.js';

export const ITEMS = {
  turbo: { name: 'Turbo', icon: '⚡', hint: 'Korte megaversnelling' },
  shield: { name: 'Schild', icon: '🛡️', hint: 'Blokkeert één aanval' },
  rocket: { name: 'Vuurpijl', icon: '🚀', hint: 'Zoekt de renner vóór je' },
  glue: { name: 'Lijmklodder', icon: '🟣', hint: 'Plakt achter je op de weg' },
  magnet: { name: 'Magneet', icon: '🧲', hint: 'Trekt je naar de renner vóór je' },
  storm: { name: 'Tegenwind', icon: '🌪️', hint: 'Storm voor iedereen vóór je' },
};

export const BOT_NAMES = ['Turbo Tess', 'Watt Wout', 'Sprint Sanne', 'Klim Kees', 'Demarrage Daan', 'Bidon Bram', 'Kopman Koen'];
// Ideale lijn: binnendoor is korter. Echte meetkunde (straal R = SEG²/bocht), iets aangedikt.
const LINE_K = (ROAD_W / (SEG * SEG)) * 1.3;
// Na een kwak kunnen gever en ontvanger elkaar zo lang niet kwakken (een botsing kan wel).
const KWAK_CALM = 2;
const BERM_COST = 0.4; // in de berm kom je meteen 40% minder snel vooruit
const SPRINT_BONUS = 0.05, SPRINT_SECS = 30; // groene trui: 5% sneller, 30 seconden
const ROCKET_ARM = 1.0; // een vuurpijl hangt eerst even stil: tijd om je schild te pakken
const STORM_DELAY = 1.5; // tegenwind komt na een korte waarschuwing
const CUT_BONUS = 0.12; // extra voortgang op het short-cut-pad

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
    // Training: een rit bestaat uit etappes. mode = 'race' (losse race), 'warm', 'stage' of 'cool'.
    this.mode = cfg.mode || 'race';
    this.free = this.mode === 'warm' || this.mode === 'cool'; // vrij rijden: geen items, geen strijd
    this.finishAt = this.mode === 'cool' ? 0 : this.free || this.open ? Infinity : this.total; // waar de eindstreep ligt
    this.distOffset = cfg.distOffset || 0; // afstand van eerdere etappes (voor multiplayer)
    this.logDist = cfg.logDist || 0;
    this.logT = cfg.carry?.logT || 0;
    this.courseLen = cfg.courseLen || this.total;
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
    this.ghostRider = this.ghost ? { id: 'ghost', gk: 'race', name: 'PR race', color: '#ffffff', kind: 'ghost', dist: -3, x: 0, v: 0, mask: 0, bolts: 0, cadence: 80 } : null;
    this.ghostRiders = this.ghostRider ? [this.ghostRider] : []; // alle spoken die nu meerijden (race, ronde, segment)
    this.trace = []; // [tijd, afstand, x] elke halve seconde: grondstof voor ronde- en segmentspoken
    this.zoneGhost = {};
    this.rec = [];
    this.recAt = 0;
    this.stats = { sumP: 0, n: 0, maxP: 0, secs: [], secAcc: 0, secN: 0, secT: 0, best: { 5: 0, 60: 0, 300: 0 }, maxV: 0, sumHr: 0, nHr: 0, maxHr: 0, log: [] };
    this.launch = 0;
    this.netAt = 0;
    this.trainerGrade = 0;
    this._hid = 0;
    this._lastCount = 6;
    const c = cfg.carry; // toestand uit de vorige etappe
    if (c) {
      this.time = c.time; this.stats = c.stats; this.startedAt = c.startedAt; this.prs = c.prs; this.logDist = c.logDist;
      for (const r of this.riders) {
        const o = c.riders[r.id];
        if (!o) continue;
        r.bolts = o.bolts; r.item = this.free ? null : o.item; r.finished = o.finished; r.finishTime = o.finishTime;
        if (cfg.rolling) { r.dist = o.gap; r.x = o.x; r.v = o.v; }
      }
    }
    this.t0 = this.lapStart = this.time;
    if (c?.greenId) this.greenId = c.greenId;
    this.lapD0 = this.me.dist; // waar ik was toen deze ronde begon (t.o.v. de streep)
    if (cfg.rolling) { this.state = 'race'; this.countdown = 0; this.startedAt ||= Date.now(); this._startGhost('lap', `${this.track.id}|lapghost`, 'PR ronde', 0); }
    this.rank();
  }

  _mkRider(r, i) {
    const row = Math.floor(i / 3), col = i % 3;
    const rider = {
      id: r.id, name: r.name, color: r.color, kind: r.kind,
      dist: -3 - row * 4, x: [-0.5, 0, 0.5][col], v: 0, power: 0, cadence: 0, steer: 0,
      item: null, roulette: 0, bolts: 0, draft: false, mask: 0,
      fx: { boost: 0, slow: 0, shield: 0, storm: 0, magnet: 0, spin: 0, kwak: 0, bump: 0, sprint: 0 },
      kwakCd: 0, kwakSafe: 0, bumpCd: 0,
      finished: false, finishTime: null, rank: i + 1, bell: 0, net: null,
    };
    if (r.kind === 'bot') {
      const ref = this.profile.fair ? REF_FTP : (this.profile.ftp * REF_KG) / (this.profile.weight || REF_KG);
      rider.ai = {
        cutP: 0.12 + 0.5 * (r.skill ?? 0.5), skill: r.skill ?? 0.5,
        base: ref * (DIFFICULTY[this.difficulty] || 0.82) * (0.88 + 0.2 * (r.skill ?? 0.5)),
        ph: this.rng() * 10, lane: rider.x, tx: rider.x, think: 0, itemT: 0, laneT: 3 + this.rng() * 6,
      };
    }
    return rider;
  }

  byId(id) { return this.riders.find((r) => r.id === id); }
  local(r) { return r.kind === 'me' || r.kind === 'bot'; }
  say(text, icon = null) { this.feed.push({ text, icon, at: this.clock }); if (this.feed.length > 4) this.feed.shift(); }

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
        this.startedAt ||= Date.now();
        this._startGhost('lap', `${this.track.id}|lapghost`, 'PR ronde', 0);
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
    if (this.timed && !this.ended && this.time - this.t0 >= this.timed) { this.ended = true; this.emit('stage'); return; }
    this.portal = this.open && me.dist >= this.total - this.L ? this.portalArch : null;

    // Ik
    // Eerlijk: vermogen t.o.v. FTP. Anders: watt per kilo (omgerekend naar een renner van 75 kg).
    const eff = this.profile.fair ? (me.power * REF_FTP) / Math.max(80, this.profile.ftp) : (me.power * REF_KG) / clamp(this.profile.weight || REF_KG, 40, 150);
    if (me.finished && !this.free) this._stepLocal(me, 110, clamp(-me.x * 2, -1, 1), dt, true);
    else {
      this._stepLocal(me, eff, this.getSteer(dt), dt, false);
      this._meProgress(dt);
    }
    // Door de teleportboog: volgende etappe.
    if (this.open && !this.ended && me.dist >= this.total) { this.ended = true; this.emit('stage'); return; }

    // Bots (alleen als ik ze beheer) en renners op afstand
    for (const r of this.riders) {
      if (r.kind === 'bot') this._bot(r, dt);
      else if (r.kind === 'remote') this._remote(r, dt);
    }
    this._rockets(dt);
    this._storms();
    this._warnings();
    for (const h of this.hazards) h.age += dt;
    this.hazards = this.hazards.filter((h) => h.age < 45);
    this.rank();
    this._ghost(dt);
    this._ghosts();

    const seg = this.track.segAt(me.dist);
    this.trainerGrade = seg.grade * (this.profile.trainerFeel / 100) + (me.fx.slow > 0 ? 3 : 0) + (me.fx.storm > 0 ? 1.5 : 0) + (me.fx.kwak > 0 ? 1.5 : 0) + (me.fx.bump > 0 ? 2 : 0) + (me.berm ? 4 : 0) - (me.fx.boost > 0 ? 1.5 : 0); // berm: voelbaar zwaarder
    this._net(dt);
  }

  // Beweegt een renner die ik beheer (ikzelf of een bot).
  _stepLocal(r, power, steer, dt, auto) {
    const e = r.fx;
    for (const k in e) if (e[k] > 0) e[k] = Math.max(0, e[k] - dt);
    if (r.bell > 0) r.bell -= dt;
    if (r.kwakCd > 0) r.kwakCd -= dt;
    if (r.kwakSafe > 0) r.kwakSafe -= dt;
    if (r.bumpCd > 0) r.bumpCd -= dt;
    const seg = this.track.segAt(r.dist);
    if (e.spin > 0) steer += Math.sin(this.clock * 22) * 0.9;
    r.steer = lerp(r.steer, steer, Math.min(1, dt * 10));
    const authority = clamp(r.v / 4, 0.25, 1);
    r.x += steer * 1.15 * dt * authority;
    if (!auto) {
      // Zonder stuurhulp duwt de bocht je naar buiten; mét stuurhulp blijf je vanzelf op de weg.
      if (!this.profile.assist) r.x -= seg.curve * r.v * r.v * 0.0055 * dt;
      else if (Math.abs(r.x) > 0.92 && Math.abs(steer) < 0.15 && !r.onCut) r.x -= Math.sign(r.x) * 0.5 * dt;
    }
    // Bij een short cut is er meer berm (ook aan de buitenkant van het pad).
    const lim = seg.cut ? 1.7 : 1.45;
    if (Math.abs(r.x) > lim) r.x -= Math.sign(r.x) * Math.min(Math.abs(r.x) - lim, 1.5 * dt);
    const cc = seg.cut ? seg.cut.a + (seg.cut.b - seg.cut.a) * (mod(r.dist, SEG) / SEG) : 0;
    const wasCut = r.onCut;
    r.onCut = !!seg.cut && Math.abs(r.x - cc) < seg.cut.hw;
    // De short cut telt alleen als je via de oprit (het gat in de kerbstones) op het pad komt.
    if (r.onCut && !wasCut) r.cutValid = !!seg.cut.ramp;
    if (!r.onCut) r.cutValid = false;
    const wasBerm = r.berm;
    r.berm = Math.abs(r.x) > 1 && !r.onCut;
    if (r === this.me) {
      if (r.berm && !wasBerm && !r.finished && this.clock - (this._bermAt || -9) > 4) {
        this._bermAt = this.clock;
        this.emit('banner', { text: '⚠️ BERM!', sub: 'stuur terug naar de weg', color: '#ff6b6b' });
        this.emit('sfx', 'drop'); this.emit('shake', 5);
      }
    }

    // Slipstream en magneet
    r.draft = false;
    let pull = false;
    for (const o of this.riders) {
      if (o === r) continue;
      const gap = o.dist - r.dist;
      if (gap > 0.8 && gap < 10 && Math.abs(o.x - r.x) < 0.28) r.draft = true;
      if (e.magnet > 0 && gap > 3 && gap < 160) pull = true;
      // Kwak: rijd vlak naast iemand en stuur naar hem toe.
      const side = o.x - r.x;
      if (!this.free && r.kwakCd <= 0 && (!r.ai || r.ai.kwakT > 0) && !(o.kwakSafe > 0) && this.time > 3 && !r.finished && !o.finished &&
        Math.abs(gap) < 1.8 && Math.abs(side) > 0.04 && Math.abs(side) < 0.32 && steer * Math.sign(side) > 0.4) this._kwak(r, o, Math.sign(side));
      // Botsing: wie achterop iemand rijdt wijkt uit, en verliest snelheid als hij harder ging.
      // (Een gestuurde kwak van opzij is iets anders: die kost de ander iets, niet jou.)
      if (gap > 0 && gap < 1.6 && Math.abs(o.x - r.x) < 0.16) {
        r.x += (r.x >= o.x ? 1 : -1) * dt * 0.8;
        if (!this.free && r.bumpCd <= 0 && r.v > o.v + 0.4 && !r.finished && !o.finished && this.time > 3) this._bump(r, o);
      }
    }
    const prev = r.dist;
    r.v = stepSpeed(r, power, seg.grade, dt, pull);
    // Voortgang t.o.v. je snelheid: lijn in de bocht, short cut, berm en groene trui.
    const viaCut = r.onCut && r.cutValid;
    r.line = 1 / (1 - (viaCut ? r.x : clamp(r.x, -1, 1)) * seg.curve * LINE_K) - 1;
    if (viaCut && Math.abs(r.x) > 1) r.line += CUT_BONUS;
    if (r.berm) r.line = -BERM_COST;
    const prog = (1 + r.line) * (e.sprint > 0 ? 1 + SPRINT_BONUS : 1);
    r.dist += r.v * dt * prog;
    if (r.dist > prev && !r.finished && !this.free) this._sprintLine(r, prev);

    if (r.dist >= 0 && !this.free) this._pickups(r, prev);
    if (r.roulette > 0) {
      r.roulette -= dt;
      if (r.roulette <= 0) {
        r.item = pickItem(this.rng, r.rank, this.riders.length);
        if (r === this.me) this.emit('sfx', 'item');
      }
    }
    if (!r.finished && r.dist >= this.finishAt) {
      r.finished = true;
      r.finishTime = this.time - (r.dist - this.finishAt) / Math.max(r.v, 1);
      this.room?.send({ t: 'fin', id: r.id, time: r.finishTime });
      if (r !== this.me) this.say(`🏁 ${r.name}`);
    }
    r.mask = fxMask(r);
  }

  // Een box of blitzje is gepakt: hier laten verdwijnen en de anderen laten weten,
  // anders blijft hij op hun scherm liggen en kunnen ze hem nog een keer pakken.
  _took(o, secs) {
    this.objCool[o.id] = this.time + secs;
    this.room?.send({ t: 'pick', o: o.id, c: secs, st: this.stageIdx | 0 });
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
          this._took(o, 5);
          if (!r.item && r.roulette <= 0) { r.roulette = 1.3; if (isMe) this.emit('sfx', 'box'); }
        } else if (o.type === 'bolt' && Math.abs(o.x - r.x) < 0.14) {
          this._took(o, 15);
          if (isMe && r.bolts === 9) this.emit('banner', { text: '⚡ FULL BLITZ! ⚡', sub: '20% minder luchtweerstand', color: '#ffd166' });
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
    // Totaal van de hele rit (ook in- en uitrijden): kilometers en hoogtemeters.
    st.km = (st.km || 0) + (me.v * dt * (1 + (me.line || 0))) / 1000;
    const y = this.track.yAt(me.dist);
    if (this._lastY != null && y > this._lastY && y - this._lastY < 3) st.hm = (st.hm || 0) + y - this._lastY;
    this._lastY = y;
    st.sumP += me.power; st.n++;
    if (me.hr > 0) { st.sumHr += me.hr; st.nHr++; st.maxHr = Math.max(st.maxHr, me.hr); }
    st.maxP = Math.max(st.maxP, me.power);
    st.maxV = Math.max(st.maxV, me.v);
    st.secAcc += me.power; st.secN++; st.secT += dt;
    if (st.secT >= 1) {
      st.secs.push(st.secAcc / st.secN);
      // Rit-logboek (1x per seconde) voor de export naar Strava e.d.
      st.log.push([Math.round((this.logT + this.time) * 10) / 10, this.logDist + Math.max(0, me.dist), st.secAcc / st.secN, me.cadence, me.hr, me.v, this.track.yAt(me.dist)]);
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
    if (this.recAt <= 0) { this.recAt += 0.5; this.rec.push(Math.round(me.dist * 10) / 10, Math.round(me.x * 100)); this.trace.push(this.time, me.dist, me.x); }

    if (me.dist < 0 || this.free) return;
    const m1 = mod(me.dist, L), m0 = mod(me.dist - me.v * dt, L);
    for (const z of this.track.zones) {
      if (m0 < z.start && m1 >= z.start) {
        this.zoneStart[z.id] = this.time;
        this.zoneGhost[z.id] = { d0: m1 - z.start, base: me.dist - m1 + z.start };
        this._startGhost('seg', `${id}|segghost|${z.id}`, 'PR ' + z.name, this.zoneGhost[z.id].base);
        this.activeZone = { zone: z, t0: this.time, pr: getTime(this.ns, `${id}|seg|${z.id}`) };
        this.emit('sfx', 'zone');
        this.emit('banner', { text: (z.type === 'sprint' ? '⚡ SPRINT: ' : '⛰️ KLIM: ') + z.name, sub: this.activeZone.pr ? 'PR ' + fmtTime(this.activeZone.pr) : 'Zet een eerste tijd!', color: z.type === 'sprint' ? '#39ffb0' : '#ff7b1c' });
      }
      if (m0 < z.end && m1 >= z.end && this.zoneStart[z.id] != null) {
        const t = this.time - this.zoneStart[z.id];
        delete this.zoneStart[z.id];
        this.activeZone = null;
        me.bolts = Math.min(10, me.bolts + 1);
        this._time(`${id}|seg|${z.id}`, t, z.name);
        const zg = this.zoneGhost[z.id];
        if (zg) this._saveGhost(`${id}|segghost|${z.id}`, t, this.time - t, zg.base, zg.d0);
        this.ghostRiders = this.ghostRiders.filter((g) => g.gk !== 'seg');
      }
    }
    const lap = Math.floor(me.dist / L);
    if (lap > (this._lap || 0)) {
      this._lap = lap;
      const t = this.time - this.lapStart, key = `${id}|lap`;
      // Ronderecords tellen altijd; ook bij een vliegende start (zoals elke ronde na de eerste).
      if (this.laps > 1 || this.training) {
        this._time(key, t, 'Ronde');
        if (lap < this.laps) this.emit('sfx', 'lap');
        if (lap === this.laps - 1 && this.laps > 1) this.emit('banner', { text: 'LAATSTE RONDE!', color: '#ff3fa4' });
      } else if (submitTime(this.ns, key, t).isPR) this.prs.push({ label: 'Ronde', t, prev: null });
      this._saveGhost(`${id}|lapghost`, t, this.lapStart, (lap - 1) * L, this.lapD0);
      this.lapStart = this.time;
      this.lastLap = t;
      this.lapD0 = me.dist - lap * L;
      if (lap < this.laps || this.open) this._startGhost('lap', `${id}|lapghost`, 'PR ronde', lap * L);
      else this.ghostRiders = this.ghostRiders.filter((g) => g.gk !== 'lap');
    }
    if (me.finished) {
      if (!this.training) {
        const key = `${id}|race|${this.laps}`;
        const res = this._time(key, me.finishTime, 'Race');
        if (res.isPR) setGhost(this.ns, `${id}|ghost|${this.laps}`, { d: this.rec });
      }
      this.state = 'done';
      const s = store.stats;
      s.km += this.courseLen / 1000; s.races++;
      if (me.rank === 1 && this.riders.length > 1) s.wins++;
      s.xp += Math.round(this.courseLen / 100 + (this.riders.length - me.rank) * 15 + this.prs.length * 10);
      this.savePower();
      save();
      this.emit('finish');
    }
  }

  // Toestand die mee moet naar de volgende etappe. Afstanden t.o.v. de streep.
  carryOut() {
    const warm = this.mode === 'warm', riders = {};
    for (const r of this.riders) riders[r.id] = { gap: warm ? 0 : r.dist - this.total, x: r.x, v: r.v, bolts: warm ? 0 : r.bolts, item: this.free ? null : r.item, finished: r.finished, finishTime: r.finishTime };
    return {
      time: warm ? 0 : this.time, logT: warm ? this.logT + this.time : this.logT, logDist: this.logDist + Math.max(0, this.me.dist),
      stats: this.stats, startedAt: this.startedAt, prs: this.prs, riders, greenId: this.greenId,
    };
  }

  // Wat er nu op je afkomt (voor de waarschuwing boven je power-upvak).
  _warnings() {
    const me = this.me;
    const rk = this.rockets.find((p) => p.to === me.id);
    if (rk) {
      if (!rk.warned) { rk.warned = true; this.emit('sfx', 'alarm'); }
      this.warn = { text: '🚀 VUURPIJL OP KOMST', until: this.time + 0.1 };
      return;
    }
    if (this.warn && this.time > this.warn.until) this.warn = null;
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
    if (i >= n - 1) { g.dist = d[(n - 1) * 2]; g.v = 0; g.delta = null; g.hidden = true; return; }
    g.dist = lerp(d[i * 2], d[i * 2 + 2], f - i);
    g.x = lerp(d[i * 2 + 1], d[i * 2 + 3], f - i) / 100;
    g.v = (d[i * 2 + 2] - d[i * 2]) / 0.5;
    // Tijdsverschil: wanneer was het spook op mijn huidige afstand?
    const md = this.me.dist;
    let lo = 0, hi = n - 1;
    if (md <= d[0] || md > d[hi * 2] || this.me.finished) { if (this.me.finished) return; g.delta = null; return; }
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (d[mid * 2] < md) lo = mid; else hi = mid; }
    const span = d[hi * 2] - d[lo * 2];
    const tg = (lo + (span > 0 ? (md - d[lo * 2]) / span : 0)) * 0.5;
    g.delta = this.time - tg;
  }

  // Start een ronde- of segmentspook: mijn beste opgenomen poging, die nu naast me begint.
  _startGhost(gk, key, name, base) {
    this.ghostRiders = this.ghostRiders.filter((g) => g.gk !== gk);
    if (this.free || !(gk === 'lap' ? this.ghostLap : this.ghostSeg)) return;
    const s = getGhost(this.ns, key)?.s;
    if (!s || s.length < 6) return;
    this.ghostRiders.push({ id: 'ghost-' + gk, gk, name, color: '#ffffff', kind: 'ghost', dist: base + s[1], x: s[2] / 100, v: 0, mask: 0, bolts: 0, cadence: 85, s, t0: this.time, base, i: 0, j: 0, delta: null });
  }

  // Bewaart deze poging als spook als hij sneller is dan het spook dat er al was.
  _saveGhost(key, t, tStart, base, d0) {
    const old = getGhost(this.ns, key);
    if (old && old.t <= t) return;
    const tr = this.trace, r1 = (v) => Math.round(v * 10) / 10, s = [0, r1(d0), 0];
    for (let i = 0; i < tr.length; i += 3) if (tr[i] > tStart + 0.01 && tr[i] < tStart + t - 0.01) s.push(Math.round((tr[i] - tStart) * 100) / 100, r1(tr[i + 1] - base), Math.round(tr[i + 2] * 100));
    s.push(Math.round(t * 100) / 100, r1(this.me.dist - base), Math.round(this.me.x * 100));
    s[2] = s[5];
    setGhost(this.ns, key, { t, s });
    save();
  }

  // Beweegt de ronde- en segmentspoken en kiest welk tijdsverschil in beeld komt.
  _ghosts() {
    for (const g of this.ghostRiders) {
      const s = g.s;
      if (!s) continue; // het race-spook loopt via _ghost()
      const n = s.length / 3, tr = this.time - g.t0;
      if (tr >= s[(n - 1) * 3]) { g.hidden = true; g.delta = null; continue; }
      while (g.i < n - 2 && s[(g.i + 1) * 3] <= tr) g.i++;
      const a = g.i * 3, f = clamp((tr - s[a]) / Math.max(1e-6, s[a + 3] - s[a]), 0, 1);
      g.dist = g.base + lerp(s[a + 1], s[a + 4], f);
      g.x = lerp(s[a + 2], s[a + 5], f) / 100;
      g.v = (s[a + 4] - s[a + 1]) / Math.max(1e-6, s[a + 3] - s[a]);
      const md = this.me.dist - g.base; // wanneer was het spook waar ik nu ben?
      if (md > s[1] && md <= s[(n - 1) * 3 + 1]) {
        while (g.j < n - 2 && s[(g.j + 1) * 3 + 1] < md) g.j++;
        const b = g.j * 3, span = s[b + 4] - s[b + 1];
        g.delta = tr - (s[b] + (span > 0 ? (md - s[b + 1]) / span : 0) * (s[b + 3] - s[b]));
      } else g.delta = null;
    }
    this.ghostRiders = this.ghostRiders.filter((g) => !(g.s && g.hidden));
    const pick = ['seg', 'lap', 'race'].map((k) => this.ghostRiders.find((g) => g.gk === k && g.delta != null)).find(Boolean);
    this.ghostDelta = pick ? pick.delta : null;
    this.ghostLabel = pick ? { seg: 'segment', lap: 'ronde', race: 'race' }[pick.gk] : '';
  }

  // ---------- items ----------
  useItem(r = this.me) {
    if (!r.item || this.state === 'countdown' || r.finished || this.free) return;
    const item = r.item;
    r.item = null;
    const isMe = r === this.me;
    const msg = { t: 'use', id: r.id, item };
    switch (item) {
      case 'turbo': r.fx.boost = 4; if (isMe) { this.emit('sfx', 'boost'); this.emit('shake', 6); } break;
      case 'shield': r.fx.shield = 12; if (isMe) this.emit('sfx', 'shield'); break;
      case 'magnet': r.fx.magnet = 6; if (isMe) this.emit('sfx', 'shield'); break;
      case 'glue':
        msg.h = { id: r.id + '-' + this._hid++, d: mod(r.dist - 3, this.L), x: r.x, owner: r.id, st: this.stageIdx | 0 };
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

  // Tegenwind: eerst een waarschuwing voor iedereen die voor de veroorzaker rijdt, na STORM_DELAY de klap.
  _storm(src) {
    const me = this.me;
    this.say(`🌪️ ${src.name} ontketent tegenwind`);
    (this.storms ||= []).push({ src: src.id, d: src.dist, at: this.time + STORM_DELAY });
    if (me !== src && me.dist > src.dist && !me.finished) { this.warn = { text: '🌪️ TEGENWIND OP KOMST', until: this.time + STORM_DELAY }; this.emit('sfx', 'alarm'); }
  }

  _storms() {
    if (!this.storms?.length) return;
    for (const s of this.storms) {
      if (this.time < s.at) continue;
      s.done = true;
      const src = this.byId(s.src);
      this.emit('sfx', 'storm');
      this.stormFlash = 1;
      for (const o of this.riders) if (this.local(o) && o.id !== s.src && o.dist > (src ? src.dist : s.d) && !o.finished) this.hit(o, 'storm', s.src);
    }
    this.storms = this.storms.filter((s) => !s.done);
  }

  // Groene trui: wie per ronde als eerste onder de eindboog van een sprint door rijdt.
  _sprintLine(r, prev) {
    if (this.riders.length < 2) return;
    for (const z of this.track.zones) {
      if (z.type !== 'sprint') continue;
      const lap = Math.floor((r.dist - z.end) / this.L);
      const line = lap * this.L + z.end;
      if (lap < 0 || prev >= line || r.dist < line) continue;
      const key = `${this.stageIdx | 0}|${z.id}|${lap}`;
      const at = this.time - (r.dist - line) / Math.max(r.v, 1);
      if (this.local(r) && this._claimSprint(key, r.id, at, z.name)) this.room?.send({ t: 'sprint', key, id: r.id, at, zone: z.name });
    }
  }

  _claimSprint(key, id, at, zone) {
    const wins = (this.sprintWins ||= {});
    const cur = wins[key];
    if (cur && cur.at <= at) return false;
    const prevId = cur?.id;
    wins[key] = { id, at };
    const r = this.byId(id), me = this.me;
    if (prevId && prevId !== id) { const p = this.byId(prevId); if (p && this.local(p)) p.fx.sprint = 0; } // een ander was toch eerder
    this.greenId = id;
    if (!r) return true;
    if (this.local(r)) r.fx.sprint = SPRINT_SECS;
    if (r === me) { this.emit('banner', { icon: 'jersey', text: 'GROENE TRUI!', sub: `${zone} gewonnen · ${SPRINT_SECS} s lang 5% sneller`, color: '#39ffb0' }); this.emit('sfx', 'pr'); }
    else this.say(`${r.name} wint de ${zone}`, 'jersey');
    return true;
  }

  // r rijdt achterop o: r valt terug tot onder de snelheid van o en moet even herstellen.
  _bump(r, o) {
    r.bumpCd = 2.5;
    r.v = Math.max(o.v * 0.92, r.v * 0.75);
    r.fx.bump = 1.2;
    r.hitAt = this.clock;
    if (r === this.me) {
      this.emit('banner', { text: '💢 BOTSING!', sub: `achterop ${o.name} – snelheid kwijt`, color: '#ff6b6b' });
      this.emit('sfx', 'drop'); this.emit('shake', 7);
    }
  }

  // r geeft o een zet opzij (dir = richting van de zet: -1 links, +1 rechts).
  _kwak(r, o, dir) {
    r.kwakCd = r.kind === 'bot' ? 10 : 2.5; // bots houden zich wat in
    o.kwakSafe = 3;
    r.x -= dir * 0.05;
    if (this.local(o)) this.hit(o, 'kwak', r.id, dir);
    else this.room?.send({ t: 'kwak', id: r.id, to: o.id, dir });
  }

  hit(r, kind, by, dir = 0) {
    const blocked = r.fx.shield > 0;
    if (blocked) r.fx.shield = 0;
    else if (kind === 'rocket') { r.v *= 0.45; r.fx.spin = 1.2; r.bolts = Math.max(0, r.bolts - 3); }
    else if (kind === 'glue') { r.fx.slow = 2.5; r.bolts = Math.max(0, r.bolts - 1); }
    else if (kind === 'storm') r.fx.storm = 6;
    if (kind === 'kwak') {
      r.kwakSafe = 3;
      r.kwakCd = Math.max(r.kwakCd || 0, KWAK_CALM); // terugsturen naar je lijn is geen terugkwak
      if (!blocked) {
        r.fx.kwak = 2.5; r.v *= 0.93; r.x = clamp(r.x + dir * 0.22, -1.45, 1.45);
        if (r.bolts > 0) { r.bolts--; r.blitzLost = true; }
      }
    }
    const lost = !!r.blitzLost;
    r.blitzLost = false;
    this.room?.send({ t: 'hit', id: r.id, kind, by, blocked, lost });
    this._hitFx(r, kind, by, blocked, lost);
  }

  _hitFx(r, kind, by, blocked, lost = false) {
    const src = this.byId(by);
    if (kind === 'kwak') {
      if (src) src.kwakSafe = Math.max(src.kwakSafe || 0, KWAK_CALM); // de gever is even beschermd (op elk scherm)
      if (!blocked) r.kwakAt = this.clock;
      r.kwakLost = lost;
      if (r === this.me) {
        if (blocked) { this.emit('sfx', 'block'); this.emit('banner', { text: '🛡️ GEBLOKT!', color: '#7df9ff' }); }
        else { this.emit('sfx', 'kwak'); this.emit('shake', 9); this.emit('flash', '#ffd166'); this.emit('banner', { text: `💥 KWAK van ${src ? src.name : '?'}`, sub: lost ? '−1 blitz' : '', color: '#ff6b6b' }); }
      } else if (src === this.me) {
        this.emit('sfx', blocked ? 'block' : 'kwak');
        this.emit('banner', { text: blocked ? `${r.name} blokte je kwak` : `💥 KWAK! ${r.name}`, color: blocked ? '#7df9ff' : '#39ffb0' });
      }
      if (src) this.say(`${src.name} ${blocked ? '🛡️' : '💥'} ${r.name}`);
      return;
    }
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
      if (p.age < ROCKET_ARM) continue; // nog aan het richten
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
    if (this.finishAt - r.dist < 300 && this.finishAt > r.dist) p *= 1.35;
    if (!me.finished) p *= 1 + clamp((me.dist - r.dist) / 400, -0.1, 0.12); // elastiek
    if (r.finished) p = 100;
    // Warming-up / uitrijden: rustig meerijden in de buurt van de speler.
    if (this.mode === 'warm' || (this.free && r.finished)) p = ai.base * 0.5 * (1 + clamp((me.dist - 4 - r.dist) / 60, -0.5, 0.6));
    r.power = p;
    r.cadence = 85 + 10 * Math.sin(this.time * 0.2 + ai.ph);

    ai.think -= dt;
    if (ai.think <= 0) {
      ai.think = 0.35;
      ai.kwakT = (ai.kwakT || 0) - 0.35;
      ai.laneT -= 0.35;
      if (ai.laneT <= 0) { ai.laneT = 5 + this.rng() * 8; ai.lane = (this.rng() * 2 - 1) * 0.7; }
      // In een bocht kiest een bot (min of meer) de binnenkant.
      let tx = Math.abs(seg.curve) > 0.06 ? Math.sign(seg.curve) * (0.3 + 0.35 * (ai.ph % 1)) : ai.lane, best = 1e9;
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
      // Af en toe bewust een kwak uitdelen aan wie vlak naast hem rijdt.
      if (r.kwakCd <= 0 && this.rng() < 0.05) {
        const o = this.riders.find((q) => q !== r && !q.finished && Math.abs(q.dist - r.dist) < 1.6 && Math.abs(q.x - r.x) > 0.08 && Math.abs(q.x - r.x) < 0.3);
        if (o) { tx = o.x; ai.kwakT = 0.8; }
      }
      // Niet achterop een tragere renner rijden: eromheen sturen.
      const blk = this.riders.find((q) => q !== r && q.dist - r.dist > 0 && q.dist - r.dist < 8 && Math.abs(q.x - tx) < 0.2 && q.v < r.v + 0.3);
      if (blk && !(ai.kwakT > 0)) tx = blk.x + (r.x >= blk.x ? 0.34 : -0.34);
      ai.tx = clamp(tx, -0.85, 0.85);
      // Short cut: betere bots nemen hem vaker en strakker.
      const cut = this.track.cut;
      if (cut) {
        const toStart = mod(cut.start - m, this.L), lap = Math.floor(r.dist / this.L);
        if (toStart < 50 && ai.cutLap !== lap) { ai.cutLap = lap; ai.takeCut = this.rng() < ai.cutP; }
        if (ai.takeCut) {
          const ahead = this.track.segAt(r.dist + 5).cut;
          if (ahead) ai.tx = (ahead.a + ahead.b) / 2 + (1 - ai.skill) * 0.07 * Math.sin(this.time * 3 + ai.ph);
          else if (toStart > 60) ai.takeCut = false;
        }
      }
    }
    const steer = clamp((ai.tx - r.x) * (ai.takeCut ? 7 : 4), -0.8, 0.8);
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
    if (r.kwakSafe > 0) r.kwakSafe -= dt;
    const n = r.net;
    if (!n) return;
    n.age += dt;
    const target = n.d + n.v * Math.min(n.age, 1);
    if (Math.abs(target - r.dist) > 150) r.dist = target; // andere etappe of teleport: niet schuiven maar springen
    else r.dist = lerp(r.dist + n.v * dt, target, Math.min(1, dt * 6));
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
      a.push([r.id, Math.round((r.dist + this.distOffset) * 10) / 10, Math.round(r.x * 100) / 100, Math.round(r.v * 10) / 10, Math.round(r.power), r.mask, r.bolts, Math.round(r.cadence)]);
    }
    this.room.send({ t: 'st', a });
  }

  onNet(msg) {
    switch (msg.t) {
      case 'st':
        for (const [id, gd, x, v, p, mask, bolts, cad] of msg.a) {
          const r = this.byId(id), d = gd - this.distOffset;
          if (!r || this.local(r)) continue;
          if (!r.net) { r.dist = d; r.x = x; }
          r.net = { d, x, v, age: 0 };
          r.power = p; r.mask = mask; r.bolts = bolts; r.cadence = cad;
        }
        break;
      case 'use': {
        const r = this.byId(msg.id);
        if (!r) break;
        if (msg.item === 'glue') { if ((msg.h.st | 0) === (this.stageIdx | 0)) this.hazards.push({ ...msg.h, age: 0 }); }
        else if (msg.item === 'rocket' && msg.to) {
          this.rockets.push({ from: r.id, to: msg.to, d: r.dist + 1, x: r.x, age: 0 });
          if (msg.to === this.me.id) this.emit('banner', { text: '🚀 VUURPIJL OP KOMST!', color: '#ff3b3b' });
        } else if (msg.item === 'storm') this._storm(r);
        break;
      }
      case 'pick': {
        const id = msg.o;
        if ((msg.st | 0) !== (this.stageIdx | 0) || !Number.isInteger(id) || id < 0 || id >= this.objCool.length) break;
        this.objCool[id] = Math.max(this.objCool[id], this.time + Math.min(20, Math.max(0, +msg.c || 0)));
        break;
      }
      case 'sprint': {
        if (typeof msg.key !== 'string' || msg.key.length > 60 || typeof msg.at !== 'number' || !this.byId(msg.id)) break;
        this._claimSprint(msg.key, msg.id, msg.at, String(msg.zone || 'sprint').slice(0, 30));
        break;
      }
      case 'hazgone': this.hazards = this.hazards.filter((h) => h.id !== msg.hid); break;
      case 'hit': { const r = this.byId(msg.id); if (r) this._hitFx(r, msg.kind, msg.by, msg.blocked, msg.lost); break; }
      case 'kwak': { const r = this.byId(msg.to); if (r && this.local(r) && !(r.kwakSafe > 0) && !r.finished) this.hit(r, 'kwak', msg.id, msg.dir > 0 ? 1 : -1); break; }
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
