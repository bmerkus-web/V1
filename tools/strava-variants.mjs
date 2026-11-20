// Maakt van een Watt Blitz-TCX drie testvarianten voor Strava.
// Gebruik: node tools/strava-variants.mjs <rit.tcx> <uitvoermap>
import fs from 'node:fs';
import path from 'node:path';
import { buildFit, oceanPos, SUB_SPORT } from '../js/fit.js';

const [src, outDir] = process.argv.slice(2);
const xml = fs.readFileSync(src, 'utf8');
const num = (s, tag) => { const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(s); return m ? +m[1] : null; };
const points = [...xml.matchAll(/<Trackpoint>([\s\S]*?)<\/Trackpoint>/g)].map(([, tp]) => ({
  t: Date.parse(/<Time>([^<]+)<\/Time>/.exec(tp)[1]),
  alt: num(tp, 'AltitudeMeters') ?? 0,
  d: num(tp, 'DistanceMeters') ?? 0,
  hr: num(tp.replace(/<\/?HeartRateBpm>/g, ''), 'Value') ?? 0,
  cad: num(tp, 'Cadence') ?? 0,
  v: num(tp, 'ns3:Speed') ?? 0,
  w: num(tp, 'ns3:Watts') ?? 0,
}));
if (points.length < 2) throw new Error('Geen trackpoints gevonden');
const minAlt = Math.min(...points.map((p) => p.alt));
if (minAlt < 0) for (const p of points) p.alt += 50 - minAlt; // oude export: hoogte kon onder 0 komen
const withGps = points.map((p) => ({ ...p, ...oceanPos(p.d) }));
fs.mkdirSync(outDir, { recursive: true });
const base = path.basename(src, '.tcx');

// A: TCX met virtuele GPS en "with barometer"
let a = xml.replace(/<Trackpoint><Time>([^<]+)<\/Time>/g, (m, time) => {
  const p = withGps[points.findIndex((q) => q.t === Date.parse(time))] || withGps[0];
  return `<Trackpoint><Time>${time}</Time><Position><LatitudeDegrees>${p.lat.toFixed(7)}</LatitudeDegrees><LongitudeDegrees>${p.lon.toFixed(7)}</LongitudeDegrees></Position>`;
});
let i = 0;
a = a.replace(/<AltitudeMeters>[^<]*<\/AltitudeMeters>/g, () => `<AltitudeMeters>${points[i++].alt.toFixed(1)}</AltitudeMeters>`);
if (!a.includes('with barometer')) a = a.replace(/<Name>Watt Blitz<\/Name>/, '<Name>Watt Blitz with barometer</Name>');
fs.writeFileSync(path.join(outDir, `${base}-A-tcx-gps.tcx`), a);
// B: FIT, virtuele rit, met virtuele GPS
fs.writeFileSync(path.join(outDir, `${base}-B-fit-virtueel-gps.fit`), buildFit(withGps, { subSport: SUB_SPORT.virtual }));
// C: FIT, virtuele rit, zonder GPS
fs.writeFileSync(path.join(outDir, `${base}-C-fit-virtueel.fit`), buildFit(points, { subSport: SUB_SPORT.virtual }));
const asc = points.reduce((s, p, k) => s + (k && p.alt > points[k - 1].alt ? p.alt - points[k - 1].alt : 0), 0);
console.log(`${points.length} punten, ${(points[points.length - 1].d / 1000).toFixed(2)} km, ${Math.round(asc)} hm, ${Math.round((points[points.length - 1].t - points[0].t) / 60000)} min`);
