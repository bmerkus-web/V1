import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseIndoorBikeData, parseCyclingPower, simParamsCommand } from '../js/ble.js';
import { TRACK_DEFS, getTrack, SEG } from '../js/track.js';
import { steadySpeed } from '../js/physics.js';
import { simulate } from './sim.mjs';

const dv = (bytes) => new DataView(Uint8Array.from(bytes).buffer);

test('FTMS Indoor Bike Data: snelheid, cadans en vermogen', () => {
  // flags 0x0044 = cadans + vermogen (snelheid aanwezig want bit0 = 0)
  const d = parseIndoorBikeData(dv([0x44, 0x00, 0x10, 0x0e, 0xb4, 0x00, 0xfa, 0x00]));
  assert.equal(d.speedKmh, 36);
  assert.equal(d.cadence, 90);
  assert.equal(d.power, 250);
});

test('FTMS Indoor Bike Data: tussenliggende velden worden overgeslagen', () => {
  // flags: gem. snelheid(2) + cadans(4) + afstand(16) + weerstand(32) + vermogen(64) = 0x76
  const d = parseIndoorBikeData(dv([0x76, 0x00, 0, 0, 9, 9, 0xa0, 0x00, 1, 2, 3, 5, 0, 0x2c, 0x01]));
  assert.equal(d.cadence, 80);
  assert.equal(d.power, 300);
});

test('Cycling Power: vermogen en cadans uit crankomwentelingen', () => {
  const a = parseCyclingPower(dv([0x20, 0x00, 0xc8, 0x00, 10, 0, 0x00, 0x04]), null);
  assert.equal(a.power, 200);
  // 1 omwenteling later, 682/1024 s verder => ~90 rpm
  const b = parseCyclingPower(dv([0x20, 0x00, 0xd2, 0x00, 11, 0, 0xaa, 0x06]), a.crank);
  assert.equal(b.power, 210);
  assert.ok(Math.abs(b.cadence - 90) < 0.5);
});

test('Helling-commando voor de trainer (FTMS 0x11)', () => {
  const b = new Uint8Array(simParamsCommand(4.5).buffer);
  assert.deepEqual([...b], [0x11, 0, 0, 0xc2, 0x01, 40, 51]);
  assert.equal(new DataView(simParamsCommand(-3).buffer).getInt16(3, true), -300);
  assert.equal(new DataView(simParamsCommand(99).buffer).getInt16(3, true), 2000);
});

test('Sterzo-codetabel is compleet', () => {
  assert.equal(fs.statSync(new URL('../data/sterzo-challenge-codes.dat', import.meta.url)).size, 131072);
});

test('Banen sluiten als lus en hebben zones en objecten', () => {
  for (const d of TRACK_DEFS) {
    const t = getTrack(d.id);
    assert.equal(t.n * SEG, t.length);
    assert.ok(Math.abs(t.segs[t.n - 1].y2) < 0.01, `${d.id} sluit niet`);
    assert.ok(t.zones.length >= 2);
    assert.ok(t.objects.some((o) => o.type === 'box') && t.objects.some((o) => o.type === 'bolt') && t.objects.some((o) => o.type === 'pad'));
    for (const s of t.segs) assert.ok(Math.abs(s.grade) < 12);
  }
});

test('Fysica: meer watt is sneller, klimmen is trager', () => {
  const v200 = steadySpeed(200), v300 = steadySpeed(300);
  assert.ok(v200 > 8 && v200 < 11, `200 W op vlak = ${v200} m/s`);
  assert.ok(v300 > v200);
  assert.ok(steadySpeed(200, 8) < v200 * 0.75);
});

test('Complete race: iedereen finisht, PR en spook worden opgeslagen', () => {
  const { race, results, events } = simulate({ track: 'polder', laps: 1 });
  assert.ok(results.every((r) => r.time > 200 && r.time < 900));
  assert.equal(race.state, 'done');
  assert.ok(race.prs.some((p) => p.label === 'Race'));
  assert.ok(race.prs.some((p) => p.label === 'Dijksprint'));
  assert.ok(race.rec.length > 100);
  assert.ok(events.some(([t]) => t === 'finish'));
});

test('Items: vuurpijl raakt de voorganger, schild blokt', () => {
  const { race } = simulate({ laps: 1, maxTime: 30, useItems: false });
  const [first, second] = race.order;
  second.item = 'rocket';
  const v = first.v;
  race.useItem(second);
  for (let i = 0; i < 400 && race.rockets.length; i++) race.update(0.04);
  assert.equal(race.rockets.length, 0);
  assert.ok(first.fx.spin > 0 || first.v < v * 0.8, 'voorganger is geraakt');
  first.fx.shield = 5;
  race.hit(first, 'glue', second.id);
  assert.equal(first.fx.shield, 0);
  assert.equal(first.fx.slow, 0);
});

test('Hartslagmeting: 8- en 16-bits', async () => {
  const { parseHeartRate } = await import('../js/ble.js');
  assert.equal(parseHeartRate(dv([0x00, 142])), 142);
  assert.equal(parseHeartRate(dv([0x01, 0x2c, 0x01])), 300);
});

test('Watt per kilo: zwaardere renner is trager bij gelijk vermogen', () => {
  const light = simulate({ fair: false, weight: 65, bots: 0, useItems: false }).results[0].time;
  const heavy = simulate({ fair: false, weight: 90, bots: 0, useItems: false }).results[0].time;
  assert.ok(heavy > light * 1.05, `${light} vs ${heavy}`);
});
