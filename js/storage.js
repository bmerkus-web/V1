// Profiel, PR's, spoken en statistieken in localStorage.
const KEY = 'wattblitz1';
const COLORS = ['#ff3fa4', '#39ffb0', '#7df9ff', '#ffd166', '#b28dff', '#ff7b1c'];
export { COLORS };

const defaults = () => ({
  profile: { name: 'Renner', color: COLORS[0], ftp: 200, weight: 75, fair: true, trainerFeel: 50, assist: true, music: true, sfx: true },
  pr: { real: {}, demo: {} },
  power: {},
  stats: { km: 0, races: 0, wins: 0, xp: 0 },
});

let data = defaults();
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (raw) {
    const d = defaults();
    data = { ...d, ...raw, profile: { ...d.profile, ...raw.profile }, pr: { ...d.pr, ...raw.pr }, stats: { ...d.stats, ...raw.stats } };
  }
} catch (e) { /* geen opslag beschikbaar */ }

export const store = data;
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* vol of geblokkeerd */ }
}

// Probeert een tijd-PR te zetten. Geeft { best, prev, isPR } terug.
export function submitTime(ns, key, t) {
  const book = data.pr[ns];
  const prev = book[key]?.t ?? null;
  const isPR = prev == null || t < prev;
  if (isPR) book[key] = { t: Math.round(t * 100) / 100, date: Date.now() };
  return { prev, isPR };
}
export const getTime = (ns, key) => data.pr[ns][key]?.t ?? null;
export const setGhost = (ns, key, ghost) => { data.pr[ns][key] = ghost; };
export const getGhost = (ns, key) => data.pr[ns][key] || null;

export function submitPower(secs, watts) {
  const prev = data.power[secs]?.w ?? 0;
  if (watts > prev) { data.power[secs] = { w: Math.round(watts), date: Date.now() }; return true; }
  return false;
}

export const levelOf = (xp) => Math.floor(Math.sqrt(xp / 60)) + 1;
