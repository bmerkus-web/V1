// Klassement: beste ronde- en segmenttijden van jou en van iedereen met wie je in een kamer hebt gezeten.
// Er is geen centrale server; spelers wisselen hun tijden uit zodra ze samen in een kamer zitten,
// en geven ook door wat ze van anderen weten. Alleen ritten met een echte trainer tellen mee.
import { store, save } from './storage.js';
import { TRACK_DEFS, getTrack } from './track.js';

store.pid ||= 'r' + Math.random().toString(36).slice(2, 12);
store.board ||= {};

export function boardKeys() {
  const out = [];
  for (const d of TRACK_DEFS) {
    out.push({ key: `${d.id}|lap`, track: d.id, label: 'Ronde' });
    for (const z of getTrack(d.id).zones) out.push({ key: `${d.id}|seg|${z.id}`, track: d.id, label: (z.type === 'sprint' ? '⚡ ' : '⛰️ ') + z.name });
  }
  return out;
}

export function myEntry() {
  const recs = {};
  for (const { key } of boardKeys()) { const t = store.pr.real[key]?.t; if (t) recs[key] = t; }
  return { pid: store.pid, name: store.profile.name, recs };
}

// Neemt de tijden van een andere speler over (invoer van buitenaf: streng controleren).
export function mergeEntry(e) {
  if (!e || typeof e.pid !== 'string' || e.pid.length > 40 || e.pid === store.pid || typeof e.recs !== 'object' || !e.recs) return false;
  if (!store.board[e.pid] && Object.keys(store.board).length >= 200) return false;
  const cur = (store.board[e.pid] ||= { name: '', recs: {} });
  cur.name = String(e.name || 'Renner').slice(0, 14);
  let changed = false;
  for (const { key } of boardKeys()) {
    const t = e.recs[key];
    if (typeof t !== 'number' || !(t > 3) || !(t < 36000)) continue;
    if (!(cur.recs[key] <= t)) { cur.recs[key] = Math.round(t * 100) / 100; changed = true; }
  }
  save();
  return changed;
}

export function entriesToShare() {
  return [myEntry(), ...Object.entries(store.board).slice(0, 24).map(([pid, v]) => ({ pid, name: v.name, recs: v.recs }))];
}

export function boardRows(key) {
  const rows = [];
  const mine = store.pr.real[key]?.t;
  if (mine) rows.push({ name: store.profile.name, t: mine, me: true });
  for (const v of Object.values(store.board)) if (v.recs[key]) rows.push({ name: v.name, t: v.recs[key], me: false });
  return rows.sort((a, b) => a.t - b.t);
}
