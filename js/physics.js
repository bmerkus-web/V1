// Fietsfysica: vermogen (watt) -> snelheid. Bewust iets "arcade": hellingen tellen half.
import { clamp } from './util.js';

export const REF_FTP = 200; // referentie voor de eerlijke modus
export const REF_KG = 75; // referentiegewicht voor watt per kilo
const MASS = 82, INERTIA = 50, G = 9.81, RHO = 1.2, CDA = 0.32, CRR = 0.004;
export const GRADE_FEEL = 0.5;

export const FX = { boost: 1, slow: 2, shield: 4, storm: 8, magnet: 16, spin: 32, draft: 64 };

export function fxMask(r) {
  const e = r.fx;
  return (e.boost > 0 ? 1 : 0) | (e.slow > 0 ? 2 : 0) | (e.shield > 0 ? 4 : 0) | (e.storm > 0 ? 8 : 0) |
    (e.magnet > 0 ? 16 : 0) | (e.spin > 0 ? 32 : 0) | (r.draft ? 64 : 0);
}

// Geeft de nieuwe snelheid (m/s) na dt seconden.
export function stepSpeed(r, power, gradePct, dt, magnetPull = false) {
  const e = r.fx;
  let p = Math.max(0, power);
  let cda = CDA * (1 - 0.02 * Math.min(10, r.bolts || 0));
  let crr = CRR;
  if (e.boost > 0) { p += 320; cda *= 0.55; }
  if (magnetPull) p += 380;
  if (r.draft) cda *= 0.7;
  if (e.storm > 0) cda *= 2.3;
  if (e.slow > 0) { cda *= 3.5; crr *= 12; }
  if (Math.abs(r.x) > 1) crr += 0.035; // berm
  const v = Math.max(r.v, 0);
  const drive = p / Math.max(v, 2.2);
  const res = MASS * G * (gradePct / 100 * GRADE_FEEL + crr) + 0.5 * RHO * cda * v * v;
  let nv = v + ((drive - res) / INERTIA) * dt; // lichtere massa bij versnellen = vlotter gevoel
  if (nv < 0) nv = 0;
  return clamp(nv, 0, 30);
}

// Stabiele snelheid op vlak terrein voor een bepaald vermogen (voor bots/tests).
export function steadySpeed(power, gradePct = 0) {
  const r = { v: 5, x: 0, bolts: 0, fx: {}, draft: false };
  for (let i = 0; i < 600; i++) r.v = stepSpeed(r, power, gradePct, 0.25);
  return r.v;
}
