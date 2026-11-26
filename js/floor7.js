// Draaiende vloer voor banen op een plattegrond (veldrit). De grond is één platte kaart die we per beeldlijn
// terugrekenen naar de wereld (het "Mode 7"-trucje); renners, decor en obstakels staan er als platte plaatjes
// of eenvoudige blokken op. Zo kan de camera echt draaien: haarspelden, zigzaggen en kruisingen.
// Hoogte (talud, brug) faken we met een dek dat boven de vloer zweeft, en de camera gaat mee omhoog.
import { SEG, ROAD_W } from './track.js';
import { SCENERY } from './sprites.js';
import { mod, clamp } from './util.js';

const DEPTH = 1 / Math.tan((80 * Math.PI) / 360);
const PX = 5; // pixels per meter op de kaart
const CAM_H = 3.4, NEAR = 0.3, FAR = 190;
const wrap = (a) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

export const M7 = {
  // Kaart van de grond tekenen (één keer per baan): gras, parcours met ondergrond, plassen, turbostroken, finishlijn.
  _tex7(tr) {
    const th = tr.theme, b = tr.bounds, W = Math.ceil((b.maxX - b.minX) * PX), H = Math.ceil((b.maxY - b.minY) * PX);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const TX = (x) => (x - b.minX) * PX, TY = (y) => (b.maxY - y) * PX;
    const poly = (pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(TX(x), TY(y)) : c.moveTo(TX(x), TY(y)))); c.closePath(); c.fill(); };
    // gemaaid gras in banen, met wat plekken
    for (let x = 0; x < W; x += 8 * PX) { c.fillStyle = th.grass[(x / (8 * PX)) & 1]; c.fillRect(x, 0, 8 * PX, H); }
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.06})`; c.beginPath(); c.ellipse(rnd() * W, rnd() * H, 6 + rnd() * 30, 4 + rnd() * 18, rnd() * 3, 0, 7); c.fill(); }
    const at = (d, lat) => { const p = tr.world(d, lat); return [p.x, p.y]; };
    const quad = (d0, d1, l0, l1, col) => poly([at(d0, l0), at(d0, l1), at(d1, l1), at(d1, l0)], col);
    for (const s of tr.segs) {
      const d0 = s.i * SEG, d1 = d0 + SEG + 0.4;
      if (s.open) { quad(d0, d1, -s.wA - 0.08, s.wA + 0.08, 'rgba(0,0,0,.35)'); continue; } // schaduw onder de brug
      if (Math.max(s.y1, s.y2) > 0.4) continue; // het talud tekenen we als dek
      const col = th.surf[s.surf] || th.road[0];
      quad(d0, d1, -s.wA, s.wA, col);
      if (s.i % 2) quad(d0, d1, -s.wA, s.wA, 'rgba(0,0,0,.07)');
      // details per ondergrond
      if (s.surf === 'grass' || s.surf === 'mud') for (const l of [-0.2, 0.2]) quad(d0, d1 - 0.4, l * s.wA - 0.035, l * s.wA + 0.035, s.surf === 'mud' ? 'rgba(20,10,5,.5)' : 'rgba(60,45,25,.45)'); // bandensporen
      if (s.surf === 'mud' || s.surf === 'sand') for (let i = 0; i < 18; i++) { const [x, y] = at(d0 + rnd() * SEG, (rnd() * 2 - 1) * s.wA * 0.9); c.fillStyle = s.surf === 'mud' ? `rgba(15,8,4,${0.3 + rnd() * 0.3})` : rnd() < 0.5 ? 'rgba(255,240,200,.35)' : 'rgba(120,90,40,.35)'; c.beginPath(); c.arc(TX(x), TY(y), 1 + rnd() * 2.5, 0, 7); c.fill(); }
      if (s.surf === 'cobble') for (let r = 0; r < 5; r++) for (let q = -3; q < 3; q++) if ((r + q) & 1) quad(d0 + r, d0 + r + 1, (q / 3) * s.wA, ((q + 1) / 3) * s.wA, 'rgba(255,255,255,.12)');
      if (s.surf === 'asphalt' && s.i % 2 === 0) quad(d0, d0 + 2.5, -0.012, 0.012, th.lane);
      if (s.pad) { quad(d0, d1, s.pad.x - s.pad.w, s.pad.x + s.pad.w, '#16c98a'); quad(d0 + 1, d0 + 2.5, s.pad.x - s.pad.w * 0.7, s.pad.x + s.pad.w * 0.7, '#39ffb0'); }
    }
    for (const o of tr.obstacles) if (o.type === 'puddle') { // plassen: donker water met een glimmend randje
      for (let d = o.at; d < o.at + o.len; d += 0.5) { const k = Math.sin(((d - o.at) / o.len) * Math.PI); quad(d, d + 0.6, o.x - o.w * k, o.x + o.w * k, '#1d2234'); }
      quad(o.at + o.len * 0.3, o.at + o.len * 0.5, o.x - o.w * 0.3, o.x + o.w * 0.1, 'rgba(160,200,255,.35)');
    }
    for (let q = -6; q < 6; q++) for (let r = 0; r < 2; r++) quad(r * 0.6, r * 0.6 + 0.6, (q / 6) * tr.segs[0].wA, ((q + 1) / 6) * tr.segs[0].wA, (q + r) & 1 ? '#111' : '#f5f5ff'); // finishlijn
    // Twee resoluties: fijn dichtbij, grof in de verte (minder geflikker)
    const lo = document.createElement('canvas'); lo.width = Math.ceil(W / 4); lo.height = Math.ceil(H / 4);
    lo.getContext('2d').drawImage(cv, 0, 0, lo.width, lo.height);
    const fogC = (() => { const k = document.createElement('canvas').getContext('2d'); k.fillStyle = th.fog; k.fillRect(0, 0, 1, 1); return k.getImageData(0, 0, 1, 1).data; })();
    const grass = (() => { const k = document.createElement('canvas').getContext('2d'); k.fillStyle = th.grass[1]; k.fillRect(0, 0, 1, 1); return new Uint32Array(k.getImageData(0, 0, 1, 1).data.buffer)[0]; })();
    const starts = new Map(); for (const o of tr.obstacles) (starts.get(o.k0) || starts.set(o.k0, []).get(o.k0)).push(o);
    this.t7 = {
      tr, b, grass, fogC, starts,
      hi: { d: new Uint32Array(c.getImageData(0, 0, W, H).data.buffer), w: W, h: H, px: PX },
      lo: { d: new Uint32Array(lo.getContext('2d').getImageData(0, 0, lo.width, lo.height).data.buffer), w: lo.width, h: lo.height, px: PX / 4 },
    };
  },

  // Camera, lucht, bergen en de vloer.
  _floor7(race, dt, frame) {
    const tr = race.track, th = tr.theme, me = race.me, c = this.c, W = this.W, H = this.H;
    if (!this.t7 || this.t7.tr !== tr) { this._tex7(tr); this.yaw7 = null; }
    const T = this.t7, f = (W / 2) * DEPTH, hz0 = this.bg.hz;
    const back = (CAM_H * f) / (H * 0.85 - hz0);
    // Achtervolgcamera: altijd recht achter de renner, kijkend naar een punt een stukje verderop.
    const rp = tr.world(me.dist, me.x), aim = tr.world(me.dist + 9, me.x * 0.4);
    const ty = Math.atan2(aim.x - rp.x, aim.y - rp.y);
    this.yaw7 = this.yaw7 == null ? ty : this.yaw7 + wrap(ty - this.yaw7) * Math.min(1, dt * 5);
    const yaw = this.yaw7, fx = Math.sin(yaw), fy = Math.cos(yaw);
    this.camZ7 = this.camZ7 == null ? rp.z : this.camZ7 + (rp.z - this.camZ7) * Math.min(1, dt * 6);
    const g = tr.segAt(me.dist + 4).grade;
    this.pitch7 = (this.pitch7 || 0) + (clamp(g / 100, -0.3, 0.3) * 0.45 * f - (this.pitch7 || 0)) * Math.min(1, dt * 3); // klimmen: je kijkt omhoog
    const hz = (this.hz = hz0 + this.pitch7);
    const cam = (this.cam7 = { x: rp.x - fx * back, y: rp.y - fy * back, h: CAM_H + this.camZ7, fx, fy, rx: fy, ry: -fx, f, hz, W });
    this.tr7 = tr;
    // lucht, zon en bergen draaien mee
    if (this.pitch7 > 0) { c.fillStyle = th.sky[0]; c.fillRect(0, 0, W, this.pitch7 + 1); }
    c.drawImage(this.bg.sky, 0, this.pitch7);
    const sunA = wrap(2.4 - yaw);
    if (Math.abs(sunA) < 1.2) c.drawImage(this.bg.sun, W / 2 + Math.tan(sunA) * f - this.bg.sun.width / 2, this.bg.sunY + this.pitch7 - this.bg.sun.height / 2);
    this.bg.layers.forEach((cv, i) => {
      const off = mod(yaw * f * (i ? 1 : 0.85), cv.width);
      c.drawImage(cv, -off, hz - cv.height + 2); c.drawImage(cv, cv.width - off, hz - cv.height + 2);
    });
    // vloer op halve resolutie
    const y0 = Math.max(0, Math.ceil(hz)), w2 = W >> 1, h2 = Math.max(1, (H - y0) >> 1);
    if (!this.f7 || this.f7.width !== w2 || this.f7.height !== h2) { this.f7 = document.createElement('canvas'); this.f7.width = w2; this.f7.height = h2; this.f7img = this.f7.getContext('2d').createImageData(w2, h2); }
    const D = new Uint32Array(this.f7img.data.buffer), b = T.b, fc = T.fogC;
    for (let j = 0; j < h2; j++) {
      const sy = y0 + j * 2 + 1 - hz, z = (cam.h * f) / Math.max(0.5, sy), fog = clamp((z - 70) / 130, 0, 1);
      const k = (z / f) * 2, L = k * PX > 1.6 ? T.lo : T.hi, px = L.px, TD = L.d, TW = L.w, TH = L.h;
      const bx = cam.x + fx * z, by = cam.y + fy * z;
      for (let i = 0; i < w2; i++) {
        const o = (i - w2 / 2 + 0.5) * k, wx = bx + cam.rx * o, wy = by + cam.ry * o;
        const tx = ((wx - b.minX) * px) | 0, ty = ((b.maxY - wy) * px) | 0;
        let col = tx >= 0 && ty >= 0 && tx < TW && ty < TH ? TD[ty * TW + tx] : T.grass;
        if (fog > 0) { const r0 = col & 255, g0 = (col >> 8) & 255, b0 = (col >> 16) & 255; col = 0xff000000 | ((b0 + (fc[2] - b0) * fog) << 16) | ((g0 + (fc[1] - g0) * fog) << 8) | (r0 + (fc[0] - r0) * fog); }
        D[j * w2 + i] = col;
      }
    }
    this.f7.getContext('2d').putImageData(this.f7img, 0, 0);
    c.imageSmoothingEnabled = true; c.drawImage(this.f7, 0, y0, W, H - y0 + 1);
    // diepte per segment (voor de volgorde van tekenen)
    for (const s of tr.segs) { const z = (s.wx - cam.x) * fx + (s.wy - cam.y) * fy; s.scr.z1 = s.scr.z2 = z; s.scr.clip = H; s.scr.frame = frame; s.scr.n = 0; }
  },

  // Wereldpunt → scherm
  _p7(x, y, h) {
    const C = this.cam7, dx = x - C.x, dy = y - C.y, z = dx * C.fx + dy * C.fy;
    if (z < NEAR) return { X: -1e5, Y: -1e5, u: 0, z };
    return { X: C.W / 2 + ((dx * C.rx + dy * C.ry) / z) * C.f, Y: C.hz + ((C.h - h) / z) * C.f, u: C.f / z, z };
  },
  _pt7(seg, t, lat, lift = 0) { const p = this.tr7.world(seg.i * SEG + t * SEG, lat); return this._p7(p.x, p.y, p.z + lift / 2.3); },
  // Vlak in de wereld (punten [x, y, h]), geknipt aan de voorkant van de camera.
  _poly7(pts, col) {
    const C = this.cam7, cs = pts.map(([x, y, h]) => { const dx = x - C.x, dy = y - C.y; return [dx * C.rx + dy * C.ry, dx * C.fx + dy * C.fy, h]; });
    const out = [];
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i], b = cs[(i + 1) % cs.length];
      if (a[1] >= NEAR) out.push(a);
      if ((a[1] >= NEAR) !== (b[1] >= NEAR)) { const k = (NEAR - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * k, NEAR, a[2] + (b[2] - a[2]) * k]); }
    }
    if (out.length < 3) return;
    const c = this.c; c.fillStyle = col; c.beginPath();
    out.forEach(([l, z, h], i) => { const X = C.W / 2 + (l / z) * C.f, Y = C.hz + ((C.h - h) / z) * C.f; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.closePath(); c.fill();
  },
  // Blok op het parcours: van afstand d0 tot d1, van lat0 tot lat1 (halve wegbreedtes), hoogte hh.
  _box7(d0, d1, l0, l1, hh, side, top) {
    const tr = this.tr7, C = this.cam7, P = (d, l) => tr.world(d, l);
    const a = P(d0, l0), b = P(d0, l1), cc = P(d1, l1), d = P(d1, l0), bot = [a, b, cc, d];
    const faces = [[0, 1], [1, 2], [2, 3], [3, 0]].map(([i, j]) => {
      const p = bot[i], q = bot[j], z = ((p.x + q.x) / 2 - C.x) * C.fx + ((p.y + q.y) / 2 - C.y) * C.fy;
      return { z, pts: [[p.x, p.y, p.z], [q.x, q.y, q.z], [q.x, q.y, q.z + hh], [p.x, p.y, p.z + hh]] };
    }).sort((u, v) => v.z - u.z);
    if (faces[3].z < 1.5) return; // vlak onder de camera: niet tekenen (geeft rare vlakken)
    for (const fc of faces) this._poly7(fc.pts, side);
    this._poly7(bot.map((p) => [p.x, p.y, p.z + hh]), top);
  },

  // Extra's per segment: talud en brug, linten, obstakels.
  _seg7(seg, t) {
    const tr = this.tr7, th = tr.theme, z = seg.scr.z1, nx = tr.segs[(seg.i + 1) % tr.n], d0 = seg.i * SEG, d1 = d0 + SEG;
    if (z > FAR || z < -SEG * 2) return;
    const W = (d, l) => tr.world(d, l), e = 0.1;
    if (seg.y1 > 0.05 || seg.y2 > 0.05) {
      const w0 = seg.wA + e, w1 = seg.wB + e;
      if (seg.open) { // brug: pilaren onder het dek
        if (seg.i % 2 === 0) for (const sd of [-1, 1]) { const p = W(d0, sd * w0), q = W(d0 + 0.4, sd * w0); this._poly7([[p.x, p.y, 0], [q.x, q.y, 0], [q.x, q.y, p.z], [p.x, p.y, p.z]], '#3a2a20'); }
      } else for (const sd of [-1, 1]) { // talud: schuine kanten naar de grond
        const a = W(d0, sd * w0), b = W(d1, sd * w1), c2 = W(d1, sd * (w1 + (seg.y2 * 1.1) / ROAD_W)), d = W(d0, sd * (w0 + (seg.y1 * 1.1) / ROAD_W));
        this._poly7([[a.x, a.y, a.z], [b.x, b.y, b.z], [c2.x, c2.y, 0], [d.x, d.y, 0]], sd < 0 ? '#1f4a2a' : '#173a20');
      }
      const a = W(d0, -w0), b = W(d0, w0), c2 = W(d1 + 0.3, w1), d = W(d1 + 0.3, -w1);
      this._poly7([[a.x, a.y, a.z], [b.x, b.y, b.z], [c2.x, c2.y, c2.z], [d.x, d.y, d.z]], seg.open ? '#3a2416' : '#24461f');
      const a2 = W(d0, -seg.wA), b2 = W(d0, seg.wA), c3 = W(d1 + 0.3, seg.wB), d3 = W(d1 + 0.3, -seg.wB);
      this._poly7([[a2.x, a2.y, a2.z + 0.01], [b2.x, b2.y, b2.z + 0.01], [c3.x, c3.y, c3.z + 0.01], [d3.x, d3.y, d3.z + 0.01]], th.surf[seg.surf] || th.road[0]);
      if (seg.stairs) for (let q = 0; q < 4; q++) { const s0 = d0 + q * 1.25, p = W(s0, -seg.wA), r = W(s0, seg.wA), p2 = W(s0 + 0.25, seg.wA), r2 = W(s0 + 0.25, -seg.wA); this._poly7([[p.x, p.y, p.z + 0.02], [r.x, r.y, r.z + 0.02], [p2.x, p2.y, p2.z + 0.02], [r2.x, r2.y, r2.z + 0.02]], '#e8e0cc'); }
      if (seg.open && seg.i % 2 === 0) for (let q = 0; q < 5; q++) { const s0 = d0 + q, p = W(s0, -seg.wA), r = W(s0, seg.wA), p2 = W(s0 + 0.12, seg.wA), r2 = W(s0 + 0.12, -seg.wA); this._poly7([[p.x, p.y, p.z + 0.02], [r.x, r.y, r.z + 0.02], [p2.x, p2.y, p2.z + 0.02], [r2.x, r2.y, r2.z + 0.02]], 'rgba(0,0,0,.25)'); }
    }
    // linten (op de finishstraat en de brug: hekken)
    if (z < 95) {
      const c = this.c, hek = seg.surf === 'asphalt' || seg.open, ht = hek ? 1.05 : 0.85;
      for (const sd of [-1, 1]) {
        const p = W(d0, sd * (seg.wA + 0.06)), q = W(d1, sd * (nx.wA + 0.06));
        const A = this._p7(p.x, p.y, p.z), B = this._p7(p.x, p.y, p.z + ht), C2 = this._p7(q.x, q.y, q.z + ht), D2 = this._p7(q.x, q.y, q.z);
        if (!A.u) continue;
        c.fillStyle = hek ? '#b9bccb' : '#e8e8f0'; c.fillRect(A.X - Math.max(1, A.u * 0.03), B.Y, Math.max(2, A.u * 0.06), A.Y - B.Y);
        if (!C2.u) continue;
        if (hek) { c.fillStyle = 'rgba(200,204,216,.55)'; c.beginPath(); c.moveTo(A.X, A.Y); c.lineTo(B.X, B.Y); c.lineTo(C2.X, C2.Y); c.lineTo(D2.X, D2.Y); c.fill(); }
        c.strokeStyle = (th.tape || ['#ff3fa4', '#fff'])[seg.i & 1]; c.lineWidth = Math.max(1, A.u * 0.05);
        c.beginPath(); c.moveTo(B.X, B.Y + A.u * 0.08); c.lineTo(C2.X, C2.Y + C2.u * 0.08); c.stroke();
      }
    }
    // obstakels die hier beginnen
    for (const o of this.t7.starts.get(seg.i) || []) {
      if (o.type === 'plank') this._box7(o.at, o.at + 0.15, -seg.wA, seg.wA, 0.4, '#d8d4e4', '#ffffff');
      else if (o.type === 'bale') { for (let q = 0; q < o.len; q += 1.3) this._box7(o.at + q, o.at + Math.min(o.len, q + 1.2), o.x - o.w, o.x + o.w, 0.55, '#c9a23e', '#ecd06a'); }
      else if (o.type === 'log') this._box7(o.at, o.at + o.len, o.x - o.w, o.x + o.w, 0.45, '#5a3a22', '#8a6040');
      else if (o.type === 'tyres') this._box7(o.at, o.at + o.len, o.x - o.w, o.x + o.w, 0.75, '#1c1c22', '#3a3a44');
    }
  },

  // Alles wat rechtop staat, van ver naar dichtbij: segmenten (met hun renners en objecten) en los decor.
  _sprites7(race, drawSeg) {
    const tr = race.track, C = this.cam7, c = this.c, items = [];
    for (const s of tr.segs) { const z = s.scr.z1; if (z > -SEG * 2 && z < FAR + 20 && Math.abs((s.wx - C.x) * C.rx + (s.wy - C.y) * C.ry) < z * 1.5 + 30) items.push({ z, s }); }
    for (const fr of tr.free) { const z = (fr.x - C.x) * C.fx + (fr.y - C.y) * C.fy; if (z > NEAR && z < FAR) items.push({ z, fr }); }
    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      if (it.s) { drawSeg(it.s); continue; }
      const def = SCENERY[it.fr.k]; if (!def) continue;
      const p = this._p7(it.fr.x, it.fr.y, 0), w = def.w * p.u, h = def.h * p.u;
      if (h < 2 || it.z < 4 || p.X + w < 0 || p.X - w > this.W) continue; // vlak voor de camera: weglaten, anders zie je niks
      if (it.z < 9) c.globalAlpha = (it.z - 4) / 5;
      c.drawImage(def.cv, p.X - w / 2, p.Y - h, w, h);
      c.globalAlpha = 1;
    }
  },
};
