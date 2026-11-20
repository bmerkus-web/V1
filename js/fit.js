// Minimale FIT-schrijver (het bestandsformaat van Garmin/Wahoo) voor een fietsrit.
// points: [{ t: ms sinds 1970, d: afstand m, alt: m, w: watt, cad, hr, v: m/s, lat?, lon? }]
const EPOCH = 631065600; // FIT telt seconden vanaf 31-12-1989
const BT = { enum: 0x00, uint8: 0x02, uint16: 0x84, sint32: 0x85, uint32: 0x86, uint32z: 0x8c };
const SIZE = { 0x00: 1, 0x02: 1, 0x84: 2, 0x85: 4, 0x86: 4, 0x8c: 4 };
const INVALID = { 0x00: 0xff, 0x02: 0xff, 0x84: 0xffff, 0x85: 0x7fffffff, 0x86: 0xffffffff, 0x8c: 0 };
const CRC_T = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
function crc16(bytes, crc = 0) {
  for (const b of bytes) {
    let t = CRC_T[crc & 0xf]; crc = (crc >> 4) & 0x0fff; crc ^= t ^ CRC_T[b & 0xf];
    t = CRC_T[crc & 0xf]; crc = (crc >> 4) & 0x0fff; crc ^= t ^ CRC_T[(b >> 4) & 0xf];
  }
  return crc;
}

export const SUB_SPORT = { generic: 0, indoor: 6, virtual: 58 };

export function buildFit(points, { subSport = SUB_SPORT.virtual } = {}) {
  const out = [];
  const defs = new Map();
  let nextLocal = 0;
  const msg = (global, fields) => { // fields: [[nummer, type, waarde], ...]
    const key = global + ':' + fields.map((f) => f[0] + '/' + f[1]).join(',');
    let local = defs.get(key);
    if (local == null) {
      local = nextLocal++ % 16;
      defs.set(key, local);
      out.push(0x40 | local, 0, 0, global & 0xff, global >> 8, fields.length);
      for (const [num, bt] of fields) out.push(num, SIZE[bt], bt);
    }
    out.push(local);
    for (const [, bt, val] of fields) {
      const n = SIZE[bt], v = val == null || Number.isNaN(val) ? INVALID[bt] : Math.round(val);
      const dv = new DataView(new ArrayBuffer(n));
      if (n === 1) dv.setUint8(0, v & 0xff); else if (n === 2) dv.setUint16(0, v & 0xffff, true);
      else if (bt === BT.sint32) dv.setInt32(0, v, true); else dv.setUint32(0, v >>> 0, true);
      out.push(...new Uint8Array(dv.buffer));
    }
  };
  const ts = (ms) => Math.round(ms / 1000) - EPOCH;
  const semi = (deg) => (deg * 2147483648) / 180;
  const p0 = points[0], pn = points[points.length - 1];
  const dur = (pn.t - p0.t) / 1000;
  let asc = 0, sumW = 0, sumHr = 0, nHr = 0, sumCad = 0, maxW = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i && p.alt > points[i - 1].alt) asc += p.alt - points[i - 1].alt;
    sumW += p.w; sumCad += p.cad; maxW = Math.max(maxW, p.w);
    if (p.hr > 0) { sumHr += p.hr; nHr++; }
  }
  const n = points.length;
  msg(0, [[0, BT.enum, 4], [1, BT.uint16, 255], [2, BT.uint16, 1], [3, BT.uint32z, 20261120], [4, BT.uint32, ts(p0.t)]]); // file_id: activiteit, 'development'
  msg(12, [[0, BT.enum, 2], [1, BT.enum, subSport]]); // sport: fietsen
  msg(21, [[253, BT.uint32, ts(p0.t)], [0, BT.enum, 0], [1, BT.enum, 0]]); // timer start
  for (const p of points) {
    const f = [[253, BT.uint32, ts(p.t)]];
    if (p.lat != null) f.push([0, BT.sint32, semi(p.lat)], [1, BT.sint32, semi(p.lon)]);
    f.push([2, BT.uint16, (p.alt + 500) * 5], [3, BT.uint8, p.hr > 0 ? p.hr : null], [4, BT.uint8, p.cad], [5, BT.uint32, p.d * 100], [6, BT.uint16, p.v * 1000], [7, BT.uint16, p.w]);
    msg(20, f);
  }
  msg(21, [[253, BT.uint32, ts(pn.t)], [0, BT.enum, 0], [1, BT.enum, 4]]); // timer stop
  const common = [[2, BT.uint32, ts(p0.t)], [7, BT.uint32, dur * 1000], [8, BT.uint32, dur * 1000], [9, BT.uint32, pn.d * 100]];
  msg(19, [[253, BT.uint32, ts(pn.t)], [0, BT.enum, 9], [1, BT.enum, 1], ...common, [21, BT.uint16, asc], [25, BT.enum, 2], [39, BT.enum, subSport]]); // lap
  msg(18, [[253, BT.uint32, ts(pn.t)], [0, BT.enum, 8], [1, BT.enum, 1], ...common, [5, BT.enum, 2], [6, BT.enum, subSport],
    [16, BT.uint8, nHr ? sumHr / nHr : null], [18, BT.uint8, sumCad / n], [20, BT.uint16, sumW / n], [21, BT.uint16, maxW], [22, BT.uint16, asc], [25, BT.uint16, 0], [26, BT.uint16, 1]]); // session
  msg(34, [[253, BT.uint32, ts(pn.t)], [0, BT.uint32, dur * 1000], [1, BT.uint16, 1], [2, BT.enum, 0], [3, BT.enum, 26], [4, BT.enum, 1]]); // activity
  const data = Uint8Array.from(out);
  const head = new Uint8Array(14), hv = new DataView(head.buffer);
  hv.setUint8(0, 14); hv.setUint8(1, 0x20); hv.setUint16(2, 2132, true); hv.setUint32(4, data.length, true);
  head.set([0x2e, 0x46, 0x49, 0x54], 8);
  hv.setUint16(12, crc16(head.subarray(0, 12)), true);
  const file = new Uint8Array(14 + data.length + 2);
  file.set(head); file.set(data, 14);
  new DataView(file.buffer).setUint16(14 + data.length, crc16(file.subarray(0, 14 + data.length)), true);
  return file;
}

// Virtuele GPS: een cirkel midden in de Zuid-Atlantische Oceaan (geen land, wegen of Strava-segmenten).
export const OCEAN = { lat: -12, lon: -25 };
export function oceanPos(d, loop = 4000) {
  const r = loop / (2 * Math.PI), a = (d / loop) * 2 * Math.PI;
  const dy = r * Math.sin(a), dx = r * (1 - Math.cos(a));
  return { lat: OCEAN.lat + dy / 111320, lon: OCEAN.lon + dx / (111320 * Math.cos((OCEAN.lat * Math.PI) / 180)) };
}
