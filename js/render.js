// Pseudo-3D wegweergave op canvas (licht genoeg voor een oude Mac of tablet).
import { SEG, ROAD_W } from './track.js';
import { mod, clamp, mulberry } from './util.js';
import { SCENERY, drawRider, drawBox, drawBolt, drawGlue, drawRocket } from './sprites.js';

const ZS = 1.6, YS = 2.3, CURVE_VIS = 1.8; // visuele rek: diepte, hoogte, bochten
const DRAW = 150, NEAR = 1.2, CAM_H = 3.4;
const DEPTH = 1 / Math.tan((80 * Math.PI) / 360);

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext('2d', { alpha: false });
    this.bgOff = 0;
    this.shake = 0;
    this.flash = null;
    this.confetti = [];
    this.bg = null;
    this.resize();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 1280 / Math.max(1, r.width));
    this.W = this.cv.width = Math.max(320, Math.round(r.width * scale));
    this.H = this.cv.height = Math.max(200, Math.round(r.height * scale));
    this.bg = null;
  }

  _buildBg(theme) {
    const { W, H } = this, hz = Math.round(H * 0.44);
    const rng = mulberry(theme.bg.length * 7919 + 13);
    const sky = document.createElement('canvas'); sky.width = W; sky.height = H;
    let c = sky.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, hz + 10);
    theme.sky.forEach((col, i) => g.addColorStop(i / (theme.sky.length - 1), col));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (theme.stars) for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.7})`; const s = rng() < 0.1 ? 2 : 1; c.fillRect(rng() * W, rng() * hz * 0.75, s, s); }
    // zon met strepen
    const sr = H * 0.17, sx = W * 0.5, sy = hz - sr * 0.35;
    const sg = c.createLinearGradient(0, sy - sr, 0, sy + sr); sg.addColorStop(0, theme.sun); sg.addColorStop(1, theme.sky[2]);
    c.save(); c.beginPath(); c.arc(sx, sy, sr, 0, 7); c.clip(); c.fillStyle = sg; c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    c.fillStyle = theme.sky[2]; c.globalAlpha = 0.85;
    for (let i = 0; i < 6; i++) c.fillRect(sx - sr, sy + sr * (0.05 + i * 0.16), sr * 2, sr * (0.03 + i * 0.012));
    c.restore();
    // silhouetlagen (2x breed, herhalend)
    const layers = [0, 1].map((li) => {
      const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = Math.round(H * 0.3);
      const k = cv.getContext('2d'), h = cv.height;
      k.fillStyle = theme.bgColor[li];
      if (theme.bg === 'city') {
        for (let x = 0; x < cv.width;) {
          const bw = W * (0.02 + rng() * 0.04), bh = h * (0.15 + rng() * (li ? 0.45 : 0.75));
          k.fillStyle = theme.bgColor[li]; k.fillRect(x, h - bh, bw, bh);
          k.fillStyle = li ? 'rgba(255,226,107,.5)' : 'rgba(255,63,164,.35)';
          for (let wy = h - bh + 4; wy < h - 4; wy += 7) for (let wx = x + 3; wx < x + bw - 3; wx += 6) if (rng() < 0.3) k.fillRect(wx, wy, 2, 3);
          x += bw + rng() * W * 0.01;
        }
      } else {
        k.beginPath(); k.moveTo(0, h);
        const base = h * (li ? 0.6 : 0.3), amp = h * (li ? 0.3 : 0.55);
        const pts = 28;
        const ys = Array.from({ length: pts }, () => rng());
        for (let i = 0; i <= pts; i++) k.lineTo((i / pts) * cv.width, base + (1 - ys[i % pts]) * amp * (theme.bg === 'space' ? 0.5 : 1) - (theme.bg === 'mountains' && !li && i % 9 === 4 ? h * 0.25 : 0));
        k.lineTo(cv.width, h); k.fill();
        if (theme.bg === 'space' && !li) { // planeet
          const pg = k.createRadialGradient(cv.width * 0.3, h * 0.25, 4, cv.width * 0.3, h * 0.3, h * 0.3);
          pg.addColorStop(0, '#ff9de6'); pg.addColorStop(1, '#5b2bb5');
          k.globalCompositeOperation = 'destination-over'; k.fillStyle = pg; k.beginPath(); k.arc(cv.width * 0.3, h * 0.3, h * 0.26, 0, 7); k.fill();
          k.strokeStyle = 'rgba(185,255,244,.7)'; k.lineWidth = 3; k.beginPath(); k.ellipse(cv.width * 0.3, h * 0.3, h * 0.42, h * 0.08, -0.3, 0, 7); k.stroke();
          k.globalCompositeOperation = 'source-over';
        }
      }
      return cv;
    });
    this.bg = { sky, layers, theme, hz };
  }

  // Projecteert een punt op segment `seg`, fractie t langs het segment, lateraal in wegbreedtes.
  _pt(seg, t, lat, lift = 0) {
    const s = seg.scr;
    const z = Math.max(NEAR, s.z1 + (s.z2 - s.z1) * t);
    const k = (DEPTH / z) * (this.W / 2);
    return {
      X: this.W / 2 + k * (s.xw1 + (s.xw2 - s.xw1) * t + lat * ROAD_W - this.camX),
      Y: this.hz - k * ((seg.y1 + (seg.y2 - seg.y1) * t) * YS + lift - this.camY),
      u: k,
    };
  }

  draw(race, dt) {
    const { c, W, H } = this;
    const tr = race.track, th = tr.theme, me = race.me, t = race.clock;
    if (!this.bg || this.bg.theme !== th) this._buildBg(th);
    const hz = (this.hz = this.bg.hz);
    const playerZ = (DEPTH * CAM_H * (W / 2)) / (H * 0.85 - hz);
    const camD = me.dist - playerZ / ZS;
    this.camX = me.x * ROAD_W * 0.8;
    this.camY = tr.yAt(me.dist) * YS + CAM_H;
    const L = tr.length;
    const base = Math.floor(mod(camD, L) / SEG) % tr.n;
    const basePct = mod(camD, SEG) / SEG;

    c.save();
    if (this.shake > 0.3) { c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake); this.shake *= Math.pow(0.02, dt); }

    // --- achtergrond ---
    this.bgOff += tr.segAt(me.dist).curve * me.v * dt * 3;
    c.drawImage(this.bg.sky, 0, 0);
    this.bg.layers.forEach((cv, i) => {
      const off = mod(this.bgOff * (i ? 1.6 : 0.8) * W * 0.004, cv.width);
      c.drawImage(cv, -off, hz - cv.height + 2);
      c.drawImage(cv, cv.width - off, hz - cv.height + 2);
    });

    // --- weg ---
    let x = 0, dx = -tr.segs[base].curve * CURVE_VIS * basePct, maxy = H;
    const frame = (this.frame = (this.frame || 0) + 1);
    c.fillStyle = th.grass[0]; c.fillRect(0, hz, W, H - hz);
    for (let n = 0; n < DRAW; n++) {
      const seg = tr.segs[(base + n) % tr.n], s = seg.scr;
      s.z1 = (n - basePct) * SEG * ZS; s.z2 = s.z1 + SEG * ZS;
      s.xw1 = x; s.xw2 = x + dx; s.frame = frame; s.clip = maxy; s.n = n;
      x += dx; dx += seg.curve * CURVE_VIS;
      if (s.z2 <= NEAR) continue;
      const a = this._pt(seg, 0, 0), b = this._pt(seg, 1, 0);
      if (b.Y >= maxy || a.Y <= b.Y) continue;
      const alt = seg.i % 2;
      const w1 = a.u * ROAD_W, w2 = b.u * ROAD_W;
      c.fillStyle = th.grass[alt]; c.fillRect(0, b.Y - 0.5, W, a.Y - b.Y + 1);
      c.fillStyle = seg.zone === 'sprint' ? (alt ? '#39ffb0' : '#0c6b4a') : seg.zone === 'climb' ? (alt ? '#ff7b1c' : '#7a2a00') : th.rumble[alt];
      this._quad(a.X, a.Y, w1 * 1.1, b.X, b.Y, w2 * 1.1);
      c.fillStyle = seg.i < 2 ? (alt ? '#f5f5ff' : '#15152a') : th.road[alt];
      this._quad(a.X, a.Y, w1, b.X, b.Y, w2);
      if (alt && n < 90) {
        c.fillStyle = th.lane; c.globalAlpha = 0.55;
        for (const l of [-1 / 3, 1 / 3]) this._quad(a.X + w1 * l, a.Y, w1 * 0.014, b.X + w2 * l, b.Y, w2 * 0.014);
        c.globalAlpha = 1;
      }
      if (seg.pad) {
        const p = seg.pad, blink = (Math.floor(t * 8) + seg.i) % 3;
        c.fillStyle = blink === 0 ? '#fff36b' : blink === 1 ? '#ff9a1c' : '#ff5a1c';
        this._quad(a.X + w1 * p.x, a.Y, w1 * p.w, b.X + w2 * p.x, b.Y, w2 * p.w);
      }
      maxy = b.Y;
    }
    // nevel bij de horizon
    const fg = c.createLinearGradient(0, hz - H * 0.03, 0, hz + H * 0.1);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.3, th.fog + '77'); fg.addColorStop(1, th.fog + '00');
    c.fillStyle = fg; c.fillRect(0, hz - H * 0.03, W, H * 0.13);

    // --- dynamische objecten per segment verzamelen ---
    const dyn = new Map();
    const put = (d, o) => {
      const rel = mod(d - camD, L);
      if (rel > (DRAW - 2) * SEG) return;
      const idx = Math.floor(mod(d, L) / SEG) % tr.n;
      o.t = mod(d, SEG) / SEG;
      (dyn.get(idx) || dyn.set(idx, []).get(idx)).push(o);
    };
    for (const r of race.riders) {
      r._ph = (r._ph || 0) + ((r.cadence || 0) / 60) * Math.PI * 2 * dt;
      put(r.dist, { rider: r });
    }
    const gr = race.ghostRider;
    if (gr && !gr.hidden) { gr._ph = (gr._ph || 0) + 8 * dt; put(gr.dist, { rider: gr, ghost: true }); }
    for (const h of race.hazards) put(h.d, { glue: h });
    for (const p of race.rockets) put(p.d, { rocket: p });

    // --- sprites van ver naar dichtbij ---
    for (let n = DRAW - 1; n >= 0; n--) {
      const seg = tr.segs[(base + n) % tr.n], s = seg.scr;
      if (s.z1 < NEAR * 0.5 && !dyn.has(seg.i)) continue;
      const clipped = s.clip < H;
      if (clipped) { c.save(); c.beginPath(); c.rect(0, 0, W, s.clip); c.clip(); }
      if (seg.arch && s.z1 > NEAR) this._arch(seg);
      if (s.z1 > NEAR) {
        for (const sp of seg.sprites) {
          const def = SCENERY[sp.k]; if (!def) continue;
          const p = this._pt(seg, 0, sp.x + (Math.sign(sp.x) * def.w) / 2 / ROAD_W);
          const w = def.w * p.u, h = def.h * p.u;
          if (h < 3 || p.X + w < 0 || p.X - w > W || p.Y - h > s.clip) continue;
          c.drawImage(def.cv, p.X - w / 2, p.Y - h, w, h);
        }
        for (const o of seg.objs) {
          if (race.objCool[o.id] > race.time) continue;
          const p = this._pt(seg, (o.d % SEG) / SEG, o.x);
          if (p.u < 2) continue;
          if (o.type === 'box') drawBox(c, p.X, p.Y, p.u, t, o.id); else if (o.type === 'bolt') drawBolt(c, p.X, p.Y, p.u, t, o.id);
        }
      }
      const list = dyn.get(seg.i);
      if (list) {
        list.sort((p, q) => q.t - p.t);
        for (const o of list) {
          if (o.glue) { const p = this._pt(seg, o.t, o.glue.x); drawGlue(c, p.X, p.Y, p.u, t); }
          else if (o.rocket) { const p = this._pt(seg, o.t, o.rocket.x); drawRocket(c, p.X, p.Y, p.u); }
          else {
            const r = o.rider, p = this._pt(seg, o.t, r.x);
            if (s.z1 + (s.z2 - s.z1) * o.t < NEAR) continue;
            drawRider(c, p.X, p.Y, p.u * 1.2, r, t, { ghost: o.ghost, fade: r !== me && r.dist < me.dist - 0.5 && r.dist > me.dist - 12, label: r === me ? null : r.name });
            if (r === me) this.meScr = p;
          }
        }
      }
      if (clipped) c.restore();
    }

    this._overlay(race, dt);
    c.restore();
  }

  _quad(x1, y1, w1, x2, y2, w2) {
    const c = this.c;
    c.beginPath(); c.moveTo(x1 - w1, y1); c.lineTo(x2 - w2, y2 - 0.6); c.lineTo(x2 + w2, y2 - 0.6); c.lineTo(x1 + w1, y1); c.fill();
  }

  _arch(seg) {
    const c = this.c, a = seg.arch;
    const l = this._pt(seg, 0, -1.22), r = this._pt(seg, 0, 1.22), u = l.u;
    if (u < 1.5) return;
    const top = 7 * u, beam = 1.5 * u;
    c.fillStyle = '#23233a';
    c.fillRect(l.X - 0.25 * u, l.Y - top, 0.5 * u, top); c.fillRect(r.X - 0.25 * u, r.Y - top, 0.5 * u, top);
    c.fillStyle = '#15152a'; c.fillRect(l.X - 0.25 * u, l.Y - top, r.X - l.X + 0.5 * u, beam);
    c.strokeStyle = a.color; c.lineWidth = Math.max(1, 0.12 * u); c.strokeRect(l.X - 0.25 * u, l.Y - top, r.X - l.X + 0.5 * u, beam);
    if (u > 4) {
      c.fillStyle = a.color; c.font = `900 ${beam * 0.62}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(a.text, (l.X + r.X) / 2, l.Y - top + beam * 0.54, r.X - l.X);
      c.textBaseline = 'alphabetic';
    }
  }

  _overlay(race, dt) {
    const { c, W, H } = this, me = race.me, m = me.mask, t = race.clock;
    if (m & 1 || me.v > 17) { // snelheidsstrepen
      c.strokeStyle = m & 1 ? 'rgba(255,240,180,.55)' : 'rgba(255,255,255,.22)'; c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < (m & 1 ? 26 : 10); i++) {
        const a = Math.random() * 6.28, r1 = H * (0.45 + Math.random() * 0.3), r2 = r1 + H * (0.1 + Math.random() * 0.25);
        c.moveTo(W / 2 + Math.cos(a) * r1 * 1.4, H * 0.5 + Math.sin(a) * r1); c.lineTo(W / 2 + Math.cos(a) * r2 * 1.4, H * 0.5 + Math.sin(a) * r2);
      }
      c.stroke();
    }
    if (m & 64 && this.meScr) { // slipstream
      c.strokeStyle = 'rgba(125,249,255,.5)'; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < 6; i++) { const x = this.meScr.X + (Math.random() - 0.5) * W * 0.16, y = this.meScr.Y - Math.random() * H * 0.3; c.moveTo(x, y); c.lineTo(x, y + H * 0.06); }
      c.stroke();
    }
    if (m & 8 || race.stormFlash > 0) { // storm
      c.fillStyle = `rgba(20,25,50,${m & 8 ? 0.35 : 0.2})`; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(180,210,255,.5)'; c.lineWidth = 1.5; c.beginPath();
      for (let i = 0; i < 40; i++) { const x = Math.random() * W, y = Math.random() * H; c.moveTo(x, y); c.lineTo(x - 14, y + 34); }
      c.stroke();
      if (race.stormFlash > 0) { race.stormFlash -= dt * 1.5; if (race.stormFlash > 0.8) { c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(0, 0, W, H); } }
    }
    if (m & 2) { c.fillStyle = 'rgba(150,60,255,.18)'; c.fillRect(0, 0, W, H); }
    if (this.flash) {
      c.globalAlpha = clamp(this.flash.a, 0, 1) * 0.5; c.fillStyle = this.flash.color; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
      this.flash.a -= dt * 2.5; if (this.flash.a <= 0) this.flash = null;
    }
    if (this.confetti.length) {
      for (const p of this.confetti) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.5 * dt; p.r += p.vr * dt;
        c.save(); c.translate(p.x * W, p.y * H); c.rotate(p.r); c.fillStyle = p.col; c.fillRect(-5, -3, 10, 6); c.restore();
      }
      this.confetti = this.confetti.filter((p) => p.y < 1.1);
    }
  }

  party() {
    const cols = ['#ff3fa4', '#39ffb0', '#7df9ff', '#ffd166', '#b28dff'];
    for (let i = 0; i < 160; i++) this.confetti.push({ x: Math.random(), y: -Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.2, vy: 0.1 + Math.random() * 0.3, r: Math.random() * 6, vr: (Math.random() - 0.5) * 10, col: cols[i % 5] });
  }
}
