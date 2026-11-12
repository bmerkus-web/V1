// Banen: opgebouwd uit secties [lengte m, bocht, helling %, zone].
import { mulberry, hashStr, mod } from './util.js';

export const SEG = 5; // meter per wegsegment
export const ROAD_W = 4.5; // halve wegbreedte in meter

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
      scenery: ['windmill', 'poplar', 'poplar', 'lamp', 'tulips', 'tulips', 'billboard'],
    },
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
      scenery: ['rock', 'rock', 'deadtree', 'crystal', 'lavavent', 'billboard'],
    },
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
    sections: [
      T(300), T(300, 4, 2), T(300, -4, -2), T(250, 5, 3), T(250, -5, -3),
      T(400, 0, 0, sprint('Lanceerbaan')), T(400, 3, 10, climb('Raketmuur')), T(300, -2, 2),
      T(500, -3, -8), T(300, 4, -2), T(300, -6, 1), T(300, 6, -1), T(300, -2), T(300),
    ],
  },
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
  if (!cache.has(id)) cache.set(id, build(TRACK_DEFS.find((d) => d.id === id) || TRACK_DEFS[0]));
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
    segs.push({ i: k, curve: curve[k], grade: g, y1: y, y2, sprites: [], objs: [], zone: null, pad: null, arch: null, scr: {} });
    y = y2;
  }
  for (const z of zones) {
    for (let k = z.start / SEG; k < z.end / SEG; k++) segs[k].zone = z.type;
    segs[z.start / SEG].arch = { text: z.name.toUpperCase(), color: z.type === 'sprint' ? '#39ffb0' : '#ff7b1c' };
    segs[z.end / SEG - 1].arch = { text: 'EINDE ' + (z.type === 'sprint' ? 'SPRINT' : 'KLIM'), color: '#f5f5ff' };
  }
  segs[0].arch = { text: 'START · FINISH', color: '#ff3fa4' };

  // Objecten: itemboxen, boutjes (munten) en turbostroken. Deterministisch per baan.
  const objects = [];
  const add = (type, d, x) => {
    const o = { id: objects.length, type, d, x };
    objects.push(o);
    segs[Math.floor(d / SEG) % n].objs.push(o);
  };
  for (let d = 250; d < total - 120; d += 500) {
    for (const x of [-0.66, -0.22, 0.22, 0.66]) add('box', d, x);
    for (let t = 0; t < 2; t++) {
      const d0 = d + 90 + t * 190;
      const ph = rng() * 6.28;
      const amp = 0.3 + rng() * 0.4;
      for (let b = 0; b < 8; b++) add('bolt', d0 + b * 12, Math.sin(ph + b * 0.5) * amp);
    }
  }
  const padAt = (d, x) => {
    const s = Math.floor(d / SEG);
    for (let k = 0; k < 3; k++) segs[(s + k) % n].pad = { x, w: 0.28 };
    objects.push({ id: objects.length, type: 'pad', d, x, len: 3 * SEG, w: 0.28 });
  };
  for (let d = 520; d < total - 300; d += 900) padAt(d, [-0.5, 0, 0.5][Math.floor(rng() * 3)]);
  for (const z of zones) if (z.type === 'sprint') padAt(z.start + 20, 0);

  // Decor langs de weg.
  const sc = def.theme.scenery;
  for (let k = 2; k < n; k += 3) {
    for (const side of [-1, 1]) {
      if (rng() < 0.75) segs[k].sprites.push({ k: sc[Math.floor(rng() * sc.length)], x: side * (1.25 + rng() * 1.6) });
      if (rng() < 0.3) segs[k].sprites.push({ k: sc[Math.floor(rng() * sc.length)], x: side * (3.8 + rng() * 5) });
    }
  }

  const track = {
    id: def.id, name: def.name, desc: def.desc, theme: def.theme,
    segs, n, length: total, zones, objects,
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
