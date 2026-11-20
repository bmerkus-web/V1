// Virtueel schakelen (voor een Zwift Cog, Zwift Ride of een fiets met één versnelling op de trainer).
// De echte versnelling verandert niet; wij laten de trainer zwaarder of lichter remmen door de
// helling die we sturen per versnelling een stapje te verschuiven. Op de snelheid in het spel
// heeft dit geen invloed: die volgt uit je watts. Het verandert hoe zwaar trappen voelt.
export const GEARS = 24;
export const NEUTRAL = 12; // in deze versnelling voelt de trainer precies de helling van de baan
export const STEP = 0.5; // procent helling per versnelling

let gear = NEUTRAL;
export const getGear = () => gear;
export function shift(d) {
  const g = Math.max(1, Math.min(GEARS, gear + d));
  const moved = g !== gear;
  gear = g;
  return moved;
}
export const gearOffset = (g = gear) => (g - NEUTRAL) * STEP;
