// Rit exporteren als TCX-bestand (voor Strava, Garmin Connect, TrainingPeaks, ...).
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const xml = (s) => String(s).replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

// log = [[t (s), afstand (m), watt, cadans, hartslag, snelheid (m/s), hoogte (m)], ...]
export function buildTcx({ startedAt, log, name }) {
  if (!log.length) return null;
  const last = log[log.length - 1];
  const kJ = log.reduce((s, p, i) => s + p[2] * (i ? p[0] - log[i - 1][0] : 1), 0) / 1000;
  const hrs = log.map((p) => p[4]).filter((h) => h > 0);
  const pts = log.map(([t, d, w, cad, hr, v, alt]) =>
    `<Trackpoint><Time>${iso(startedAt + t * 1000)}</Time><AltitudeMeters>${(Math.round(alt * 10) / 10 || 0).toFixed(1)}</AltitudeMeters><DistanceMeters>${d.toFixed(1)}</DistanceMeters>` +
    (hr > 0 ? `<HeartRateBpm><Value>${Math.round(hr)}</Value></HeartRateBpm>` : '') +
    `<Cadence>${Math.round(cad)}</Cadence><Extensions><ns3:TPX><ns3:Speed>${v.toFixed(2)}</ns3:Speed><ns3:Watts>${Math.round(w)}</ns3:Watts></ns3:TPX></Extensions></Trackpoint>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
<Activities><Activity Sport="Biking"><Id>${iso(startedAt)}</Id>
<Lap StartTime="${iso(startedAt)}"><TotalTimeSeconds>${last[0].toFixed(1)}</TotalTimeSeconds><DistanceMeters>${last[1].toFixed(1)}</DistanceMeters><Calories>${Math.round(kJ)}</Calories>` +
    (hrs.length ? `<AverageHeartRateBpm><Value>${Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)}</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>${Math.max(...hrs)}</Value></MaximumHeartRateBpm>` : '') +
    `<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod>
<Track>
${pts}
</Track></Lap><Notes>${xml(name)}</Notes>
<Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>Watt Blitz</Name><UnitId>0</UnitId><ProductID>0</ProductID></Creator>
</Activity></Activities></TrainingCenterDatabase>
`;
}

export function tcxFilename(startedAt) {
  const d = new Date(startedAt), p = (n) => String(n).padStart(2, '0');
  return `watt-blitz-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.tcx`;
}
