// Banen: opgebouwd uit secties [lengte m, bocht, helling %, zone].
import { mulberry, hashStr, mod } from './util.js';
import { buildCx, CX_DEF } from './cx.js';

export const SEG = 5; // meter per wegsegment
export const ROAD_W = 4.5;
export const CUT_X = 1.28, CUT_HW = 0.115;
// Kasseien: de weg wordt smaller (60%), met langs beide randen een glad gootje.
export const COBBLE_W = 0.6, GUTTER = 0.14, COBBLE_TAPER = 20;
export const KERB = CUT_X - CUT_HW; // buitenrand van de kerbstones = binnenrand van het short-cut-pad // short cut: midden en halve breedte (in halve wegbreedtes) // halve wegbreedte in meter

const T = (len, curve = 0, grade = 0, zone = null) => ({ len, curve, grade, zone });
const sprint = (name) => ({ type: 'sprint', name });
const climb = (name) => ({ type: 'climb', name });

export const TRACK_DEFS = [
  {
    id: 'polder',
    name: 'Neon Polder',
    desc: 'Vlak en bloedsnel. Twee sprints, één brug.',
    theme: {
      sky: ['#12032e', '#5b1a7a', '#ff5f8f', '#ffc46b'],
      sun: '#ffe26b',
      stars: true,
      bg: 'city',
      bgColor: ['#2a0f55', '#170a36'],
      grass: ['#0d3b3a', '#0a302f'],
      road: ['#2b2540', '#262038'],
      rumble: ['#ff3fa4', '#f5f5ff'],
      lane: '#7df9ff',
      fog: '#ff7a90',
      cobble: { joint: '#22f0ff', stones: ['#3a3552', '#332e49', '#423c5c'] }, // neonraster
      scenery: ['windmill', 'poplar', 'poplar', 'lamp', 'tulips', 'tulips', 'billboard'],
    },
    cut: [2950, 150],
    cobbles: [{ name: 'De Hel van de Polder', start: 1680, len: 500, stars: 4 }],
    obstacles: [
      { type: 'bump', at: 200 }, { type: 'island', at: 1200, len: 25 }, { type: 'bump', at: 2320 },
      { type: 'works', at: 3240, len: 30, x: -0.5, w: 0.55 }, { type: 'works', at: 3300, len: 30, x: 0.5, w: 0.55 }, // chicane
      { type: 'bollards', at: 3700, len: 5, w: 0.12 },
    ],
    sections: [
      T(300), T(400, 2), T(300, 0, 0, sprint('Dijksprint')), T(350, -3), T(150, 0, 4), T(150, 0, -4),
      T(500, 2.5), T(300, -1.5, 0.5), T(400, 0, 0, sprint('Molenstraat')), T(450, -3.5, -0.5),
      T(300, 1), T(400, -2),
    ],
  },
  {
    id: 'vulkaan',
    name: 'Vulkaanpas',
    desc: 'Eén lange klim langs de lava, dan vol gas omlaag.',
    theme: {
      sky: ['#0b0612', '#3a0d1d', '#b3321c', '#ff9838'],
      sun: '#ff5a2a',
      stars: true,
      bg: 'mountains',
      bgColor: ['#3b1420', '#1d0a12'],
      grass: ['#2a1a1f', '#23161a'],
      road: ['#33303a', '#2d2a33'],
      rumble: ['#ff7b1c', '#2a1a1f'],
      lane: '#ffd166',
      fog: '#ff6a2a',
      cobble: { joint: '#ff3a1c', stones: ['#3a3236', '#322b2f', '#43393d'] }, // lava tussen basalt
      scenery: ['rock', 'rock', 'deadtree', 'crystal', 'lavavent', 'billboard'],
    },
    cut: [2500, 140],
    cobbles: [{ name: 'Basaltmuur', start: 1580, len: 300, stars: 5 }],
    obstacles: [
      { type: 'works', at: 2150, len: 30, x: 0.5, w: 0.55 }, { type: 'works', at: 2210, len: 30, x: -0.5, w: 0.55 }, // chicane in de afdaling
      { type: 'island', at: 4300, len: 25 }, { type: 'bump', at: 4700 },
    ],
    sections: [
      T(400), T(300, 2, 1), T(350, -4, 6, climb('Lavamuur')), T(250, 5, 8, climb('Lavamuur')),
      T(300, -5, 7, climb('Lavamuur')), T(300, 4, 6, climb('Lavamuur')), T(200, 0, 2),
      T(300, -2, -3), T(400, 3, -7), T(300, -4, -8), T(300, 2, -5),
      T(400, 0, -1, sprint('Asvlakte')), T(400, -3), T(400, 1.5), T(400, -1),
    ],
  },
  {
    id: 'kosmo',
    name: 'Kosmodroom',
    desc: 'Bochtig en golvend, met de steile Raketmuur.',
    theme: {
      sky: ['#01020d', '#07103a', '#1b2f8a', '#39d0c8'],
      sun: '#b9fff4',
      stars: true,
      bg: 'space',
      bgColor: ['#0b1a4a', '#060d2a'],
      grass: ['#101a3d', '#0c1533'],
      road: ['#1d2333', '#191f2d'],
      rumble: ['#39ffb0', '#101a3d'],
      lane: '#ff5fd2',
      fog: '#39d0c8',
      scenery: ['antenna', 'dome', 'rocketpad', 'lamp', 'crystal', 'billboard'],
    },
    cut: [3380, 130],
    obstacles: [
      { type: 'bump', at: 250 }, { type: 'island', at: 1000, len: 25 },
      { type: 'works', at: 2700, len: 30, x: -0.5, w: 0.55 }, { type: 'works', at: 2760, len: 30, x: 0.5, w: 0.55 }, // chicane
      { type: 'bollards', at: 4000, len: 5, w: 0.12 },
    ],
    sections: [
      T(300), T(300, 4, 2), T(300, -4, -2), T(250, 5, 3), T(250, -5, -3),
      T(400, 0, 0, sprint('Lanceerbaan')), T(400, 3, 10, climb('Raketmuur')), T(300, -2, 2),
      T(500, -3, -8), T(300, 4, -2), T(300, -6, 1), T(300, 6, -1), T(300, -2), T(300),
    ],
  },
  CX_DEF,
];

function blur(arr, win) {
  const n = arr.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -win; k <= win; k++) s += arr[mod(i + k, n)];
    out[i] = s / (2 * win + 1);
  }
  return out;
}

const cache = new Map();

export function getTrack(id) {
  if (!cache.has(id)) { const d = TRACK_DEFS.find((x) => x.id === id) || TRACK_DEFS[0]; cache.set(id, d.cx ? buildCx(d) : build(d)); };
  return cache.get(id);
}

function build(def) {
  const rng = mulberry(hashStr(def.id));
  const total = def.sections.reduce((s, x) => s + x.len, 0);
  const n = Math.round(total / SEG);
  let curve = new Float32Array(n);
  let grade = new Float32Array(n);
  const zones = [];
  let i = 0;
  for (const sec of def.sections) {
    const cnt = Math.round(sec.len / SEG);
    if (sec.zone) {
      const last = zones[zones.length - 1];
      if (last && last.name === sec.zone.name && last.end === i * SEG) last.end = (i + cnt) * SEG;
      else zones.push({ id: sec.zone.name.toLowerCase(), ...sec.zone, start: i * SEG, end: (i + cnt) * SEG });
    }
    for (let k = 0; k < cnt && i < n; k++, i++) {
      curve[i] = sec.curve * 0.06;
      grade[i] = sec.grade;
    }
  }
  curve = blur(blur(curve, 6), 6);
  grade = blur(blur(grade, 5), 5);
  // Sluit de lus: hoogte moet weer op 0 uitkomen.
  let drift = 0;
  for (let k = 0; k < n; k++) drift += (grade[k] / 100) * SEG;
  const corr = (drift / (n * SEG)) * 100;
  const segs = [];
  let y = 0;
  for (let k = 0; k < n; k++) {
    const g = grade[k] - corr;
    const y2 = y + (g / 100) * SEG;
    segs.push({ i: k, curve: curve[k], grade: g, y1: y, y2, sprites: [], objs: [], zone: null, pad: null, arch: null, scr: {}, wA: 1, wB: 1, cobble: false });
    y = y2;
  }
  for (const z of zones) {
    for (let k = z.start / SEG; k < z.end / SEG; k++) segs[k].zone = z.type;
    segs[z.start / SEG].arch = { text: z.name.toUpperCase(), color: z.type === 'sprint' ? '#39ffb0' : '#ff7b1c' };
    segs[z.end / SEG - 1].arch = { text: 'EINDE ' + (z.type === 'sprint' ? 'SPRINT' : 'KLIM'), color: '#f5f5ff' };
  }
  // Kasseienstroken: smallere weg (met een overgang van COBBLE_TAPER m), eigen segment en bogen.
  const cobbles = (def.cobbles || []).map((c) => ({ ...c, end: c.start + c.len }));
  const inCobble = (d, margin = 0) => cobbles.some((c) => d > c.start - margin && d < c.end + margin);
  for (const c of cobbles) {
    const widthAt = (d) => { const k = Math.max(0, Math.min(1, (d - c.start) / COBBLE_TAPER, (c.end - d) / COBBLE_TAPER)); return 1 - (1 - COBBLE_W) * k * k * (3 - 2 * k); };
    for (let k = c.start / SEG; k < c.end / SEG; k++) { const s = segs[k]; s.cobble = true; s.wA = widthAt(k * SEG); s.wB = widthAt((k + 1) * SEG); }
    zones.push({ id: c.name.toLowerCase(), type: 'cobble', name: c.name, start: c.start, end: c.end, stars: c.stars });
    segs[c.start / SEG].arch = { text: `KASSEIEN · ${c.name.toUpperCase()} ${'★'.repeat(c.stars)}`, color: '#d9d2e6' };
    segs[c.end / SEG - 1].arch = { text: 'EINDE KASSEIEN', color: '#f5f5ff' };
  }
  segs[0].arch = { text: 'START · FINISH', color: '#ff3fa4' };

  // Obstakels op de weg: verkeerseiland, paaltjes, wegwerkzaamheden (twee na elkaar = chicane) en drempels.
  // x en w in halve wegbreedtes (zoals de rest). Erop rijden = berm; een drempel voel je alleen op de trainer.
  const obstacles = (def.obstacles || []).map((o) => ({ ...o, len: o.len ?? (o.type === 'bump' ? SEG : 20), x: o.x ?? 0, w: o.w ?? (o.type === 'bump' ? 1.2 : 0.25), block: o.type !== 'bump' }));
  const inObs = (d, x, m = 0.12) => obstacles.some((o) => o.block && d > o.at - 8 && d < o.at + o.len + 8 && Math.abs(x - o.x) < o.w + m);
  for (const o of obstacles) {
    const k0 = Math.floor(o.at / SEG), k1 = Math.max(k0 + 1, Math.ceil((o.at + o.len) / SEG));
    for (let k = k0; k < k1; k++) segs[k % n].obs = o;
    const put = (k, sp) => segs[k % n].sprites.push(sp);
    if (o.type === 'island') { put(k0, { k: 'bollard', x: o.x }); put(k1 - 1, { k: 'bollard', x: o.x }); }
    if (o.type === 'bollards') for (let i = -1; i <= 1; i++) put(k0, { k: 'bollard', x: o.x + i * o.w * 0.8 });
    if (o.type === 'works') {
      const edge = o.x - Math.sign(o.x || 1) * o.w; // rand aan de kant van de vrije weg
      for (let k = k0; k < k1; k += 2) put(k, { k: 'barrier', x: edge });
      put(k0, { k: 'cone', x: edge - Math.sign(o.x || 1) * 0.08 }); put(k0, { k: 'worksign', x: o.x });
    }
  }

  // Objecten: itemboxen, blitzjes (bliksemschichtjes) en turbostroken. Deterministisch per baan.
  const objects = [];
  const add = (type, d, x) => {
    if (inCobble(d, 10) || inObs(d, x)) return; // niets op de kasseien (daar draait het om het gootje) en niet op een obstakel
    const o = { id: objects.length, type, d, x };
    objects.push(o);
    segs[Math.floor(d / SEG) % n].objs.push(o);
  };
  for (let d = 250; d < total - 120; d += 500) {
    for (const x of [-0.66, -0.22, 0.22, 0.66]) add('box', d, x);
    // Eén kort spoor blitzjes per stuk: je moet ervoor sturen en zit niet meteen aan het maximum.
    const d0 = d + 120 + rng() * 180;
    const ph = rng() * 6.28;
    // Slalom: de blitzjes liggen om en om links en rechts, je moet er echt voor sturen.
    const amp = 0.4 + rng() * 0.3, side = rng() < 0.5 ? 1 : -1, mid = (rng() * 2 - 1) * 0.2;
    for (let b = 0; b < 5; b++) add('bolt', d0 + b * 16, mid + side * (b % 2 ? -1 : 1) * amp + Math.sin(ph + b) * 0.06);
  }
  const padAt = (d, x) => {
    if (inCobble(d, 25) || inObs(d, x, 0.3) || inObs(d + 15, x, 0.3)) return;
    const s = Math.floor(d / SEG);
    for (let k = 0; k < 3; k++) segs[(s + k) % n].pad = { x, w: 0.15 };
    objects.push({ id: objects.length, type: 'pad', d, x, len: 3 * SEG, w: 0.15 });
  };
  for (let d = 520; d < total - 300; d += 900) padAt(d, [-0.5, 0, 0.5][Math.floor(rng() * 3)]);
  for (const z of zones) if (z.type === 'sprint') padAt(z.start + 20, 0);

  // Geheime short cut: een smal, onzichtbaar pad vlak buiten de kerbstones van een scherpe bocht. Aan het begin en eind
  // loopt een oprit schuin vanaf de weg, zodat je er zonder berm op en af kunt.
  let cut = null;
  if (def.cut) {
    const [cs, cl] = def.cut, RAMP = 10, s0 = cs / SEG, cn = cl / SEG;
    const side = Math.sign(segs[s0 + (cn >> 1)].curve) || 1;
    const centre = (d) => {
      const k = Math.max(0, Math.min(1, d < RAMP ? d / RAMP : (cl - d) / RAMP));
      return side * (0.86 + (CUT_X - 0.86) * k * k * (3 - 2 * k));
    };
    for (let k = 0; k < cn; k++) {
      const onRamp = k * SEG < RAMP || (k + 1) * SEG > cl - RAMP;
      segs[s0 + k].cut = { a: centre(k * SEG), b: centre((k + 1) * SEG), hw: onRamp ? CUT_HW + 0.02 : CUT_HW, ramp: onRamp };
    }
    cut = { start: cs, end: cs + cl, side };
  }

  // Decor langs de weg.
  const sc = def.theme.scenery;
  for (let k = 2; k < n; k += 3) {
    for (const side of [-1, 1]) {
      const near = rng() < 0.75 ? { k: sc[Math.floor(rng() * sc.length)], x: side * (1.25 + rng() * 1.6) } : null;
      if (near && !(segs[k].cut && cut.side === side)) segs[k].sprites.push(near); // pad vrijhouden
      if (rng() < 0.3) segs[k].sprites.push({ k: sc[Math.floor(rng() * sc.length)], x: side * (3.8 + rng() * 5) });
    }
  }

  const track = {
    id: def.id, name: def.name, desc: def.desc, theme: def.theme,
    segs, n, length: total, zones, objects, cut, cobbles, obstacles,
    // Obstakel waar je op (x) rijdt, of null. Drempels tellen hier niet: die liggen over de hele weg.
    obsAt(d, x) { const o = this.segAt(d).obs; return o && o.block && Math.abs(x - o.x) < o.w ? o : null; },
    wAt(d) { const m = mod(d, total), s = segs[Math.floor(m / SEG) % n]; return s.wA + (s.wB - s.wA) * ((m % SEG) / SEG); },
    segAt(d) { return segs[Math.floor(mod(d, total) / SEG) % n]; },
    yAt(d) {
      const m = mod(d, total);
      const s = segs[Math.floor(m / SEG) % n];
      return s.y1 + (s.y2 - s.y1) * ((m % SEG) / SEG);
    },
    climbTotal: segs.reduce((s, g) => s + Math.max(0, g.y2 - g.y1), 0),
  };
  return track;
}
