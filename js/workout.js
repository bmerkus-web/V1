// Workouts: inlezen (.zwo van Zwift, .erg/.mrc van onder andere TrainerRoad en Golden Cheetah),
// de tijdlijn (welk blok, welk doel, hoe lang nog), ingebouwde workouts, opslag en nabespreking.
//
// Een workout: { id, name, desc, unit: 'ftp' | 'w', blocks: [{ dur, a, b, cad, kind, label }], cues: [{ t, text, dur }] }
//   dur in seconden; a en b het doel aan het begin en eind van het blok (gelijk = vlak, anders een helling),
//   als deel van je FTP (unit 'ftp', 0.9 = 90%) of in watt (unit 'w'). a = null: vrij rijden.

// ---------- zones ----------
export const ZONES = [
  { max: 0.55, color: '#8a8fa8', name: 'Herstel' },
  { max: 0.75, color: '#3b8cff', name: 'Duur' },
  { max: 0.87, color: '#39d98a', name: 'Tempo' },
  { max: 0.94, color: '#39d98a', name: 'Sweet spot' },
  { max: 1.05, color: '#ffd166', name: 'Drempel' },
  { max: 1.2, color: '#ff8a3d', name: 'VO2max' },
  { max: 1.5, color: '#ff4d6d', name: 'Anaeroob' },
  { max: 99, color: '#ff4d6d', name: 'Sprint' },
];
export const zoneOf = (f) => ZONES.find((z) => f <= z.max) || ZONES[ZONES.length - 1];
export const zoneColor = (f) => (f == null ? '#5b5675' : zoneOf(f).color);

// ---------- inlezen ----------
const num = (v, d = null) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const attrs = (s) => { const o = {}; for (const m of s.matchAll(/([A-Za-z_]+)\s*=\s*"([^"]*)"/g)) o[m[1].toLowerCase()] = m[2]; return o; };
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();

export function parseZwo(text) {
  const tag = (n) => unxml((text.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`, 'i')) || [])[1] || '');
  const body = (text.match(/<workout>([\s\S]*?)<\/workout>/i) || [])[1];
  if (body == null) throw new Error('Geen <workout> gevonden in dit .zwo-bestand');
  const blocks = [], cues = [];
  let t = 0;
  const re = /<(\w+)([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
  for (const m of body.matchAll(re)) {
    const el = m[1].toLowerCase(), a = attrs(m[2]), inner = m[4] || '';
    if (el === 'textevent') { const tt = num(a.timeoffset, 0); if (a.message) cues.push({ t: tt, text: unxml(a.message), dur: num(a.duration, 10) }); continue; }
    const start = t, dur = num(a.duration, 0), cad = num(a.cadence);
    const lo = num(a.powerlow), hi = num(a.powerhigh), p = num(a.power, lo);
    if (el === 'warmup') blocks.push({ dur, a: Math.min(lo ?? 0.4, hi ?? 0.7), b: Math.max(lo ?? 0.4, hi ?? 0.7), cad, kind: 'warm' });
    else if (el === 'cooldown') blocks.push({ dur, a: Math.max(lo ?? 0.7, hi ?? 0.4), b: Math.min(lo ?? 0.7, hi ?? 0.4), cad, kind: 'cool' });
    else if (el === 'ramp') blocks.push({ dur, a: lo ?? 0.5, b: hi ?? lo ?? 0.5, cad, kind: 'ramp' });
    else if (el === 'steadystate') blocks.push({ dur, a: p ?? 0.6, b: num(a.powerhigh, p) ?? p ?? 0.6, cad, kind: 'steady' });
    else if (el === 'freeride') blocks.push({ dur, a: null, b: null, cad, kind: 'free' });
    else if (el === 'maxeffort') blocks.push({ dur, a: 1.6, b: 1.6, cad, kind: 'max' });
    else if (el === 'intervalst') {
      const n = Math.max(1, Math.round(num(a.repeat, 1))), on = num(a.onduration, 60), off = num(a.offduration, 60);
      const pOn = num(a.onpower, num(a.poweronhigh, 1)), pOff = num(a.offpower, num(a.powerofflow, 0.5));
      for (let i = 0; i < n; i++) {
        blocks.push({ dur: on, a: pOn, b: pOn, cad, kind: 'on', set: [i + 1, n] });
        blocks.push({ dur: off, a: pOff, b: pOff, cad: num(a.cadenceresting), kind: 'off' });
      }
    } else continue;
    for (const c of inner.matchAll(/<textevent([^>]*)\/?>/gi)) { const ca = attrs(c[1]); if (ca.message) cues.push({ t: start + num(ca.timeoffset, 0), text: unxml(ca.message), dur: num(ca.duration, 10) }); }
    t = blocks.reduce((s, b) => s + b.dur, 0);
  }
  return { name: tag('name') || 'Workout', desc: tag('description'), unit: 'ftp', blocks, cues };
}

export function parseErg(text) {
  const head = (k) => (text.match(new RegExp(`^\\s*${k}\\s*=\\s*(.+)$`, 'im')) || [])[1]?.trim();
  const pct = /MINUTES\s+PERCENT/i.test(text);
  const data = (text.match(/\[COURSE DATA\]([\s\S]*?)\[END COURSE DATA\]/i) || [])[1];
  if (!data) throw new Error('Geen [COURSE DATA] gevonden in dit bestand');
  const pts = [];
  for (const line of data.split(/\r?\n/)) { const m = line.trim().match(/^(-?[\d.]+)[\s,;]+(-?[\d.]+)/); if (m) pts.push([+m[1] * 60, +m[2]]); }
  if (pts.length < 2) throw new Error('Te weinig punten in dit bestand');
  const blocks = [];
  for (let i = 1; i < pts.length; i++) {
    const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
    if (t1 - t0 < 0.5) continue; // stap: zelfde tijd, nieuw niveau
    const f = (v) => (pct ? v / 100 : v);
    blocks.push({ dur: Math.round(t1 - t0), a: f(v0), b: f(v1), kind: v0 === v1 ? 'steady' : 'ramp' });
  }
  const cues = [];
  const txt = (text.match(/\[COURSE TEXT\]([\s\S]*?)\[END COURSE TEXT\]/i) || [])[1];
  if (txt) for (const line of txt.split(/\r?\n/)) { const m = line.match(/^\s*(\d+)\s+(.+?)(?:\s+(\d+))?\s*$/); if (m) cues.push({ t: +m[1], text: m[2].trim(), dur: m[3] ? +m[3] : 10 }); }
  return { name: head('DESCRIPTION') || head('FILE NAME') || 'Workout', desc: '', unit: pct ? 'ftp' : 'w', blocks, cues };
}

// Leest een bestand in op basis van naam en inhoud. Gooit een nette Nederlandse fout als het niet lukt.
export function parseWorkout(text, filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  let w;
  if (ext === 'zwo' || /<workout_file|<workout>/i.test(text)) w = parseZwo(text);
  else if (ext === 'erg' || ext === 'mrc' || /\[COURSE DATA\]/i.test(text)) w = parseErg(text);
  else if (ext === 'fit') throw new Error('.fit-workouts kan ik nog niet lezen. Exporteer de workout als .zwo, .erg of .mrc.');
  else throw new Error('Onbekend bestandstype. Gebruik een .zwo-, .erg- of .mrc-bestand.');
  w.blocks = w.blocks.filter((b) => b.dur > 0);
  if (!w.blocks.length) throw new Error('Er staan geen blokken in deze workout');
  if (!w.name || w.name === 'Workout') w.name = filename.replace(/\.[^.]+$/, '') || 'Workout';
  return finish(w);
}

// Tijden, labels en nummering ("Sweet spot 2/3") invullen.
export function finish(w) {
  let t = 0;
  const avgF = (b) => (b.a == null ? null : (b.a + b.b) / 2 / (w.unit === 'w' ? w.ftpRef || 250 : 1));
  for (const b of w.blocks) {
    b.t0 = t; t += b.dur;
    const f = avgF(b);
    b.label = b.label || (b.kind === 'warm' ? 'Warming-up' : b.kind === 'cool' ? 'Cooling-down' : b.kind === 'free' ? 'Vrij rijden' : b.kind === 'max' ? 'Alles geven'
      : b.kind === 'ramp' ? (b.b > b.a ? 'Opbouw' : 'Afbouw') : b.kind === 'off' || f < 0.6 ? 'Herstel' : zoneOf(f).name);
  }
  // nummeren: gelijke soorten inspanning (geen herstel/warming-up) krijgen 1/n, 2/n …
  const work = (b) => !['warm', 'cool', 'free', 'off'].includes(b.kind) && b.label !== 'Herstel';
  const count = {};
  for (const b of w.blocks) if (work(b)) count[b.label] = (count[b.label] || 0) + 1;
  const seen = {};
  for (const b of w.blocks) if (work(b) && count[b.label] > 1) b.n = [(seen[b.label] = (seen[b.label] || 0) + 1), count[b.label]];
  w.total = t;
  w.cues = (w.cues || []).sort((a, b) => a.t - b.t);
  return w;
}

// ---------- tijdlijn ----------
export const blockName = (b) => (b.n ? `${b.label} ${b.n[0]}/${b.n[1]}` : b.label);
// Doel in watt op tijdstip tIn in blok b (null bij vrij rijden). bias: +0.05 = 5% zwaarder.
export function targetW(w, b, tIn, ftp, bias = 0) {
  if (!b || b.a == null) return null;
  const f = b.a + (b.b - b.a) * Math.min(1, Math.max(0, tIn / b.dur));
  return Math.round((w.unit === 'w' ? f : f * ftp) * (1 + bias));
}
export const blockFrac = (w, b, ftp) => (b.a == null ? null : ((b.a + b.b) / 2) * (w.unit === 'w' ? 1 / ftp : 1));
// Waar zit je op tijdstip t (s sinds de start van de workout)?
export function at(w, t) {
  const bs = w.blocks;
  let i = bs.findIndex((b) => t < b.t0 + b.dur);
  const done = i < 0;
  if (done) i = bs.length - 1;
  const b = bs[i], tIn = Math.min(b.dur, Math.max(0, t - b.t0));
  return { i, b, tIn, left: done ? 0 : b.dur - tIn, done, next: bs.slice(i + 1, i + 3) };
}
export const cueAt = (w, t) => w.cues.filter((c) => t >= c.t && t < c.t + (c.dur || 10)).pop() || null;

// ---------- nabespreking ----------
// NP (genormaliseerd vermogen), IF en TSS uit vermogen per seconde.
export function metrics(secs, ftp) {
  const n = secs.length;
  if (!n) return { avg: 0, np: 0, if: 0, tss: 0 };
  const avg = secs.reduce((a, b) => a + b, 0) / n;
  let np = avg;
  if (n >= 30) {
    let sum = 0, acc = 0, cnt = 0;
    for (let i = 0; i < n; i++) { acc += secs[i]; if (i >= 30) acc -= secs[i - 30]; if (i >= 29) { sum += (acc / 30) ** 4; cnt++; } }
    np = (sum / cnt) ** 0.25;
  }
  const IF = np / Math.max(1, ftp);
  return { avg, np, if: IF, tss: (n * np * IF) / (Math.max(1, ftp) * 3600) * 100 };
}
// Geplande TSS van een workout (vrij rijden telt als 60%).
export function plannedTss(w, ftp) {
  const secs = [];
  for (const b of w.blocks) for (let s = 0; s < b.dur; s++) secs.push(targetW(w, b, s, ftp) ?? ftp * 0.6);
  return metrics(secs, ftp).tss;
}

// ---------- ingebouwde workouts ----------
const S = (dur, f, extra = {}) => ({ dur, a: f, b: f, kind: 'steady', ...extra });
const R = (dur, a, b, kind) => ({ dur, a, b, kind });
const reps = (n, ...bs) => Array.from({ length: n }, () => bs.map((b) => ({ ...b }))).flat();
export const BUILTIN = [
  { id: 'b-kennis', name: 'Kennismaking', desc: 'Kort en simpel: even voelen hoe ERG en blokken werken.', unit: 'ftp',
    blocks: [R(180, 0.45, 0.65, 'warm'), ...reps(4, S(60, 1.0), S(60, 0.55, { kind: 'off' })), R(240, 0.6, 0.4, 'cool')],
    cues: [{ t: 180, text: 'Eerste blok! De trainer regelt de weerstand, jij houdt je cadans', dur: 8 }, { t: 540, text: 'Laatste! Nog één keer', dur: 6 }] },
  { id: 'b-duur', name: 'Rustige duurrit', desc: '45 minuten lekker doortrappen in zone 2.', unit: 'ftp',
    blocks: [R(300, 0.45, 0.65, 'warm'), S(2100, 0.68), R(300, 0.6, 0.4, 'cool')],
    cues: [{ t: 300, text: 'Rustig tempo: je moet nog kunnen praten', dur: 10 }] },
  { id: 'b-ss', name: 'Sweet Spot 3×10', desc: 'De klassieker: drie keer tien minuten net onder je drempel.', unit: 'ftp',
    blocks: [R(600, 0.5, 0.75, 'warm'), S(600, 0.9), S(300, 0.55, { kind: 'off' }), S(600, 0.9), S(300, 0.55, { kind: 'off' }), S(600, 0.9), R(600, 0.6, 0.4, 'cool')],
    cues: [{ t: 600, text: 'Sweet spot: stevig maar vol te houden', dur: 8 }, { t: 2700, text: 'Laatste blok! Hou hem vast 💪', dur: 8 }] },
  { id: 'b-drempel', name: 'Drempel 2×15', desc: 'Twee keer een kwartier op je FTP.', unit: 'ftp',
    blocks: [R(600, 0.5, 0.75, 'warm'), S(900, 0.97), S(300, 0.55, { kind: 'off' }), S(900, 0.97), R(600, 0.6, 0.4, 'cool')],
    cues: [{ t: 600, text: 'Op je drempel: rustig ademen, niet te hard beginnen', dur: 8 }] },
  { id: 'b-vo2', name: 'VO2max 5×3', desc: 'Vijf keer drie minuten diep, met evenveel herstel.', unit: 'ftp',
    blocks: [R(600, 0.5, 0.75, 'warm'), ...reps(5, S(180, 1.15, { kind: 'on' }), S(180, 0.5, { kind: 'off' })), R(420, 0.6, 0.4, 'cool')],
    cues: [{ t: 600, text: 'Hoge cadans helpt: probeer boven de 95 te blijven', dur: 8 }] },
  { id: 'b-ou', name: 'Over-unders 3×12', desc: 'Afwisselend net boven en net onder je drempel.', unit: 'ftp',
    blocks: [R(600, 0.5, 0.75, 'warm'), ...[0, 1, 2].flatMap((k) => [...reps(4, S(90, 1.05), S(90, 0.9)), ...(k < 2 ? [S(300, 0.55, { kind: 'off' })] : [])]), R(480, 0.6, 0.4, 'cool')],
    cues: [{ t: 600, text: 'Over: even door de pijn. Under: herstellen op tempo', dur: 8 }] },
].map(finish);

// ---------- opslag van eigen workouts ----------
const KEY = 'wattblitz-workouts';
export function loadWorkouts() {
  try { return (JSON.parse(localStorage.getItem(KEY) || '[]') || []).map(finish); } catch (e) { return []; }
}
export function saveWorkouts(list) {
  const slim = list.map(({ id, name, desc, unit, blocks, cues, added }) => ({ id, name, desc, unit, added, cues, blocks: blocks.map(({ dur, a, b, cad, kind, set }) => ({ dur, a, b, cad, kind, set })) }));
  try { localStorage.setItem(KEY, JSON.stringify(slim)); return true; } catch (e) { return false; }
}
