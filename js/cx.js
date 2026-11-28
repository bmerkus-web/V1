// Veldrit: een baan op een plattegrond. Het parcours is een lus van hoekpunten met afgeronde bochten
// (x = oost, y = noord, in meter). Elk wegsegment krijgt een plek en richting op de kaart; de render
// tekent dan een draaiende vloer (zie render.js) in plaats van de gewone weg. Voor de rest van het spel
// is het een gewone baan: afstand langs het parcours plus positie links/rechts.
import { mulberry, hashStr, mod } from './util.js';

const SEG = 5, ROAD_W = 4.5; // zelfde als track.js (niet importeren: dat zou een kringverwijzing geven)
export const SURF = { // weerstand (x de gewone rolweerstand), extra gevoel op de trainer, wiebelen van het stuur
  asphalt: { k: 1, feel: 0, wob: 0 },
  cobble: { k: 1.6, feel: 2, wob: 0.12 },
  grass: { k: 2.4, feel: 1, wob: 0.03 },
  mud: { k: 3.6, feel: 2.5, wob: 0.16 },
  sand: { k: 4.4, feel: 3.5, wob: 0.22 },
  wood: { k: 1.2, feel: 0, wob: 0 },
};
export const STAIRS_V = 2.4; // trappen: lopen met de fiets op de schouder (m/s)
export const PLANK_V = 4.2; // (niet meer gebruikt voor de speler: zie springen/afstappen)
// Springen en afstappen (één knop): snel genoeg bij een balk = springen; langzamer, of bij een trap = afstappen
// en rennen; nog een keer drukken = weer opstappen. Zonder te drukken tegen een balk of de trap op = een klap.
export const JUMP_V = 4.2; // vanaf ~15 km/u kun je springen
export const AIR = 0.45; // zo lang ben je in de lucht (s)
export const RUN_V = 2.78; // rennen met de fiets op je schouder: hooguit 10 km/u
export const RUN_P = 220; // rennen: met zoveel watt haal je 10 km/u, met de helft ga je half zo snel (op de trap 1,5× zoveel nodig)
export const RUN_FEEL = 6; // extra helling op de trainer tijdens het rennen (%)
export const CX_LOOK = 14; // zo ver vooruit kijkt de knop naar een balk of trap (m)

const wrap = (a) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
const smooth = (k) => k * k * (3 - 2 * k);

export const CX_DEF = {
  id: 'modder',
  name: 'Moddermolen',
  desc: 'Veldrit (test): smal, bochtig, zand, modder, balken, een trap en een brug.',
  cx: true,
  music: 'kosmo',
  theme: {
    sky: ['#070512', '#1d1240', '#6a2a6a', '#ff9a5a'],
    sun: '#ffcf6b',
    stars: true,
    bg: 'mountains',
    bgColor: ['#1b1838', '#100d24'],
    grass: ['#173d25', '#14361f'],
    road: ['#2e2a3a', '#292534'],
    rumble: ['#ff3fa4', '#f5f5ff'],
    lane: '#ffd166',
    fog: '#3a2a5a',
    tape: ['#ff3fa4', '#f5f5ff'],
    surf: { asphalt: '#2e2a3a', cobble: '#5d566c', grass: '#3f6a2c', mud: '#4a3022', sand: '#c8a466', wood: '#8a5a3a' },
  },
  // [x, y, straal, {s: ondergrond, w: halve breedte}] – de ondergrond geldt vanaf de uitgang van deze bocht.
  wp: [
    [-5, 0, 5, { s: 'asphalt', w: 0.75 }], // 0: finishstraat naar het oosten
    [140, 0, 8, { s: 'grass', w: 0.42 }], // 1: noord, met de trap en het talud
    [140, 76, 6, { s: 'grass', w: 0.4 }], // 2: haarspeld
    [128, 76, 6, { s: 'mud', w: 0.33 }], // 3: zuid door de modder
    [128, 26, 6, { s: 'grass', w: 0.4 }],
    [116, 26, 6, { s: 'sand', w: 0.36 }], // 5: noord door de zandbak
    [116, 76, 6, { s: 'grass', w: 0.4 }],
    [104, 76, 6, { s: 'grass', w: 0.36 }], // 7: zuid over de balken
    [104, 26, 6, { s: 'grass', w: 0.4 }],
    [92, 26, 6, { s: 'grass', w: 0.42 }], // 9: noord langs de strobalen
    [92, 100, 7, { s: 'grass', w: 0.45 }], // 10: west
    [60, 100, 5, { s: 'mud', w: 0.36 }], // 11: zuid door de plassen
    [60, 30, 5, { s: 'cobble', w: 0.4 }], // 12: west over de kasseien
    [40, 30, 5, { s: 'grass', w: 0.4 }], // 13: noord over de boomstam
    [40, 55, 4, { s: 'grass', w: 0.36 }], // 14: oost over de brug
    [78, 55, 4, { s: 'sand', w: 0.36 }], // 15: zuid door het zand
    [78, 15, 5, { s: 'grass', w: 0.4 }], // 16: west door de bandenchicane
    [20, 15, 5, { s: 'grass', w: 0.38 }], // 17: noord, slalom
    [24, 32, 4], [16, 46, 4], [24, 60, 4], [16, 74, 4],
    [20, 100, 6, { s: 'asphalt', w: 0.45 }], // 22: west over een stukje weg
    [-5, 100, 6, { s: 'grass', w: 0.45 }], // 23: zuid terug naar de finish
  ],
  // Hoogte: per been (vanaf de uitgang van de bocht), stukken [van, tot, hoogte aan het eind]. open = brug (je kunt eronderdoor).
  heights: [
    { leg: 1, pts: [[13, 0], [21, 2.6], [29, 2.6], [43, 0]], name: 'Trappenmuur' },
    { leg: 14, pts: [[0, 0], [11, 4.2], [21, 4.2], [30, 0]], open: [11, 21], name: 'De Brug' }, // hoog genoeg om eronderdoor te kijken
  ],
  // Obstakels per been: at = meter vanaf de uitgang van de bocht; x en w in halve wegbreedtes.
  obs: [
    { leg: 1, at: 13, len: 8, type: 'stairs' },
    { leg: 3, at: 10, len: 6, type: 'puddle', x: -0.08, w: 0.22 }, { leg: 3, at: 26, len: 5, type: 'puddle', x: 0.1, w: 0.2 },
    { leg: 7, at: 12, type: 'plank' }, { leg: 7, at: 16, type: 'plank' },
    { leg: 9, at: 15, len: 4, type: 'bale', x: 0, w: 0.13 }, { leg: 9, at: 42, len: 4, type: 'bale', x: -0.2, w: 0.14 },
    { leg: 11, at: 12, len: 6, type: 'puddle', x: 0.05, w: 0.24 }, { leg: 11, at: 30, len: 7, type: 'puddle', x: -0.1, w: 0.22 }, { leg: 11, at: 46, len: 5, type: 'puddle', x: 0.08, w: 0.2 },
    { leg: 13, at: 8, len: 1.2, type: 'log', x: 0.16, w: 0.2 },
    { leg: 16, at: 12, len: 2.5, type: 'tyres', x: -0.2, w: 0.16 }, { leg: 16, at: 22, len: 2.5, type: 'tyres', x: 0.2, w: 0.16 }, { leg: 16, at: 32, len: 2.5, type: 'tyres', x: -0.2, w: 0.16 },
    { leg: 23, at: 30, len: 4, type: 'bale', x: 0.18, w: 0.14 }, { leg: 23, at: 55, type: 'plank' },
  ],
  boxes: [[0, 92], [9, 28], [16, 42], [23, 14]],
  bolts: [[0, 75], [17, 4], [23, 64]],
  pads: [[0, 58, 0], [9, 54, 0.15], [23, 78, 0]],
  start: 45,
  sprint: { leg: 0, from: 55, to: 125, name: 'Finishstraat' },
};

// Hoekpunten met afgeronde bochten → stukken (rechte lijnen en bogen).
function pieces(wp) {
  const m = wp.length, P = (i) => wp[mod(i, m)];
  const corners = [];
  for (let i = 0; i < m; i++) {
    const [ax, ay] = P(i - 1), [bx, by, r] = P(i), [cx, cy] = P(i + 1);
    let d1x = bx - ax, d1y = by - ay, d2x = cx - bx, d2y = cy - by;
    const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
    d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
    const h1 = Math.atan2(d1x, d1y), turn = wrap(Math.atan2(d2x, d2y) - h1); // > 0 = rechtsaf
    const t = r * Math.tan(Math.abs(turn) / 2);
    corners.push({ h1, turn, r, t1: [bx - d1x * t, by - d1y * t], t2: [bx + d2x * t, by + d2y * t] });
  }
  const out = [];
  for (let i = 0; i < m; i++) {
    const a = corners[i], b = corners[(i + 1) % m];
    const len = Math.hypot(b.t1[0] - a.t2[0], b.t1[1] - a.t2[1]);
    out.push({ leg: i, kind: 'line', p: a.t2, h: a.h1 + a.turn, len });
    out.push({ leg: i, kind: 'arc', p: b.t1, h: b.h1, turn: b.turn, r: b.r, len: Math.abs(b.turn) * b.r });
  }
  return out;
}
// Punt op een stuk: plek en richting (0 = noord, met de klok mee).
function at(pc, s) {
  if (pc.kind === 'line') return { x: pc.p[0] + Math.sin(pc.h) * s, y: pc.p[1] + Math.cos(pc.h) * s, h: pc.h };
  const sg = Math.sign(pc.turn), a = s / pc.r, h = pc.h + sg * a;
  const cx = pc.p[0] + Math.cos(pc.h) * pc.r * sg, cy = pc.p[1] - Math.sin(pc.h) * pc.r * sg; // middelpunt (rechts of links van de richting)
  return { x: cx - Math.cos(h) * pc.r * sg, y: cy + Math.sin(h) * pc.r * sg, h };
}

export function buildCx(def) {
  const rng = mulberry(hashStr(def.id));
  const pcs = pieces(def.wp);
  const L = pcs.reduce((s, p) => s + p.len, 0);
  const n = Math.round(L / SEG), step = L / n, total = n * SEG;
  const legStart = [];
  { let s = 0; for (const p of pcs) { if (p.kind === 'line' && legStart[p.leg] == null) legStart[p.leg] = s; s += p.len; } }
  const toD = (s) => (s * SEG) / step; // wereldmeters → afstand in het spel
  const off = def.start || 0; // de start/finishlijn ligt zoveel meter na het begin van been 0 (dan staat het startvak op het rechte stuk)
  const legD = (leg, m) => mod(toD(legStart[leg] - off + m), total);
  // Monsterpunten
  const pts = [];
  for (let k = 0; k <= n; k++) { const s = mod(k * step + off, L); let pi = 0, acc = 0; while (pi < pcs.length - 1 && s > acc + pcs[pi].len) { acc += pcs[pi].len; pi++; } pts.push({ ...at(pcs[pi], Math.min(pcs[pi].len, s - acc)), leg: pcs[pi].leg }); }
  // Ondergrond en breedte per been (geldt tot de volgende instelling)
  const legProps = []; let cur = { s: 'grass', w: 0.4 };
  for (let i = 0; i < def.wp.length; i++) { if (def.wp[i][3]) cur = { ...cur, ...def.wp[i][3] }; legProps[i] = cur; }
  if (!def.wp[0][3]) legProps[0] = cur;
  let width = pts.map((p) => legProps[p.leg].w);
  for (let pass = 0; pass < 3; pass++) width = width.map((w, k) => (width[mod(k - 1, n)] + w + width[mod(k + 1, n)]) / 3); // zachte overgang
  // Hoogte
  const y = new Float32Array(n + 1), open = new Uint8Array(n);
  for (const hf of def.heights || []) {
    for (let j = 1; j < hf.pts.length; j++) {
      const [s0, h0] = hf.pts[j - 1], [s1, h1] = hf.pts[j], d0 = legD(hf.leg, s0), d1 = legD(hf.leg, s1);
      for (let k = Math.floor(d0 / SEG); k <= Math.ceil(d1 / SEG); k++) { const d = k * SEG; if (d < d0 || d > d1) continue; y[k % n] = h0 + (h1 - h0) * smooth((d - d0) / (d1 - d0)); }
    }
    if (hf.open) for (let k = Math.floor(legD(hf.leg, hf.open[0]) / SEG); k < Math.ceil(legD(hf.leg, hf.open[1]) / SEG); k++) open[k % n] = 1; // elk segment dat (deels) boven het lagere stuk ligt
  }
  y[n] = y[0];
  const segs = [];
  for (let k = 0; k < n; k++) {
    const p = pts[k], q = pts[k + 1];
    const kap = wrap(q.h - p.h) / step; // kromming (1/m), > 0 = rechtsaf
    segs.push({
      i: k, curve: Math.max(-3, Math.min(3, kap * 19)), grade: Math.max(-10, Math.min(10, ((y[k + 1] - y[k]) / step) * 100)), y1: y[k], y2: y[k + 1], // steile stukjes: op de trainer hooguit 10%
      sprites: [], objs: [], zone: null, pad: null, arch: null, scr: {}, wA: width[k], wB: width[(k + 1) % n], cobble: false,
      surf: open[k] ? 'wood' : legProps[p.leg].s, wx: p.x, wy: p.y, hd: p.h, open: !!open[k], leg: p.leg,
    });
  }
  // Zones en bogen
  const zones = [];
  if (def.sprint) { const s = def.sprint; zones.push({ id: s.name.toLowerCase(), type: 'sprint', name: s.name, start: Math.round(legD(s.leg, s.from) / SEG) * SEG, end: Math.round(legD(s.leg, s.to) / SEG) * SEG }); }
  for (const hf of def.heights || []) if (hf.name && !hf.open) zones.push({ id: hf.name.toLowerCase(), type: 'climb', name: hf.name, start: Math.round(legD(hf.leg, hf.pts[0][0]) / SEG) * SEG, end: Math.round(legD(hf.leg, hf.pts[2][0]) / SEG) * SEG });
  for (const z of zones) {
    for (let k = z.start / SEG; k < z.end / SEG; k++) segs[k % n].zone = z.type;
    segs[(z.start / SEG) % n].arch = { text: z.name.toUpperCase(), color: z.type === 'sprint' ? '#39ffb0' : '#ff7b1c' };
    if (z.type === 'sprint') segs[(z.end / SEG - 1) % n].arch = { text: 'EINDE SPRINT', color: '#f5f5ff' };
  }
  segs[0].arch = { text: 'START · FINISH', color: '#ff3fa4' };
  // Obstakels (zelfde vorm als bij de gewone banen; block = je kunt er niet doorheen)
  const obstacles = (def.obs || []).map((o) => {
    const d = legD(o.leg, o.at), len = toD(o.len ?? 0.6);
    const block = !['plank', 'stairs', 'puddle', 'bump'].includes(o.type);
    return { type: o.type, at: d, len, x: o.x ?? 0, w: o.w ?? 1.2, block };
  });
  for (const o of obstacles) {
    const k0 = Math.floor(o.at / SEG), k1 = Math.max(k0 + 1, Math.ceil((o.at + o.len) / SEG));
    o.k0 = k0 % n;
    for (let k = k0; k < k1; k++) { const s = segs[k % n]; if (o.type === 'stairs') s.stairs = true; else if (o.type === 'puddle') s.puddle = o; else if (!s.obs || o.block) s.obs = o; }
  }
  const inObs = (d, x, m = 0.1) => obstacles.some((o) => d > o.at - 6 && d < o.at + o.len + 6 && (o.type === 'stairs' || (o.block && Math.abs(x - o.x) < o.w + m)));
  // Items: rijtjes boxen, blitzjes in slalom, turbostroken
  const objects = [];
  const wAt = (d) => { const m = mod(d, total), s = segs[Math.floor(m / SEG) % n]; return s.wA + (s.wB - s.wA) * ((m % SEG) / SEG); };
  const add = (type, d, x) => { d = mod(d, total); if (inObs(d, x) || segs[Math.floor(d / SEG) % n].y1 > 0.2) return; const o = { id: objects.length, type, d, x }; objects.push(o); segs[Math.floor(d / SEG) % n].objs.push(o); };
  for (const [leg, m] of def.boxes || []) { const d = legD(leg, m), w = wAt(d) * 0.7; for (const f of [-1, -1 / 3, 1 / 3, 1]) add('box', d, f * w); }
  for (const [leg, m] of def.bolts || []) { const d0 = legD(leg, m), side = rng() < 0.5 ? 1 : -1; for (let b = 0; b < 5; b++) { const d = d0 + b * 9; add('bolt', d, side * (b % 2 ? -1 : 1) * wAt(d) * 0.55); } }
  for (const [leg, m, x] of def.pads || []) {
    const d = legD(leg, m), s = Math.floor(d / SEG);
    for (let k = 0; k < 3; k++) segs[(s + k) % n].pad = { x, w: 0.12 };
    objects.push({ id: objects.length, type: 'pad', d: s * SEG, x, len: 3 * SEG, w: 0.12 });
  }
  // Decor op de kaart: alleen waar het niet op (of vlak naast) het parcours staat
  const clear = (x, yy, m) => segs.every((s) => Math.hypot(s.wx - x, s.wy - yy) > s.wA * ROAD_W + m);
  const free = [];
  // Plaatjes draaien altijd naar je toe: houd de hele breedte (plus wat ruimte) vrij van élk stuk parcours.
  const SIZE = { crowd: 3, billboard: 9, frites: 6 };
  const near = (k, side, sp, extra = 0) => {
    const s = segs[k % n], half = SIZE[sp] / 2, o = side * (s.wA * ROAD_W + 0.9 + half + extra), x = s.wx + Math.cos(s.hd) * o, yy = s.wy - Math.sin(s.hd) * o;
    if (s.y1 < 0.2 && clear(x, yy, half + 0.7)) free.push({ k: sp, x, y: yy });
  };
  const legK = (leg, m) => Math.floor(legD(leg, m) / SEG);
  for (let m = 4; m < 125; m += 4) { near(legK(0, m), -1, 'crowd'); if (m % 8 === 4) near(legK(0, m), 1, m % 32 === 4 ? 'billboard' : 'crowd'); }
  for (const [leg, a, b] of [[1, 6, 30], [14, 2, 28], [7, 4, 22], [3, 4, 30], [11, 4, 50], [9, 6, 60], [16, 4, 46]]) for (let m = a; m < b; m += 4) near(legK(leg, m), leg % 2 ? 1 : -1, 'crowd');
  near(legK(0, 30), 1, 'frites', 3); near(legK(23, 70), -1, 'frites', 2);
  for (let i = 0; i < 260; i++) { // bomen en lichtmasten verspreid over het veld en eromheen
    const x = -40 + rng() * 225, yy = -30 + rng() * 165, k = rng() < 0.12 ? 'lamp' : 'oak';
    if (clear(x, yy, 6)) free.push({ k, x, y: yy });
  }
  const minX = Math.min(...segs.map((s) => s.wx)) - 50, maxX = Math.max(...segs.map((s) => s.wx)) + 50;
  const minY = Math.min(...segs.map((s) => s.wy)) - 50, maxY = Math.max(...segs.map((s) => s.wy)) + 50;
  return {
    id: def.id, name: def.name, desc: def.desc, theme: def.theme, music: def.music,
    segs, n, length: total, zones, objects, cut: null, cobbles: [], obstacles, m7: true, free, bounds: { minX, maxX, minY, maxY }, step,
    obsAt(d, x) { const o = this.segAt(d).obs; return o && o.block && Math.abs(x - o.x) < o.w ? o : null; },
    wAt,
    segAt(d) { return segs[Math.floor(mod(d, total) / SEG) % n]; },
    yAt(d) { const m = mod(d, total), s = segs[Math.floor(m / SEG) % n]; return s.y1 + (s.y2 - s.y1) * ((m % SEG) / SEG); },
    // Plek op de kaart: afstand + positie links/rechts (halve wegbreedtes) → x, y (meter), hoogte en richting
    world(d, lat = 0) {
      const m = mod(d, total), k = Math.floor(m / SEG) % n, t = (m % SEG) / SEG, s = segs[k], q = segs[(k + 1) % n];
      const h = s.hd + wrap(q.hd - s.hd) * t, o = lat * ROAD_W;
      return { x: s.wx + (q.wx - s.wx) * t + Math.cos(h) * o, y: s.wy + (q.wy - s.wy) * t - Math.sin(h) * o, z: s.y1 + (s.y2 - s.y1) * t, h };
    },
    climbTotal: segs.reduce((s, g) => s + Math.max(0, g.y2 - g.y1), 0),
  };
}
