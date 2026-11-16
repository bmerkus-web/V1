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

test('Zwift-knoppen: Play, Click en Ride', async () => {
  const { parseZwiftPad } = await import('../js/ble.js');
  const u = (...b) => Uint8Array.from(b);
  // Play links (veld 1 = 1), pijl links ingedrukt (veld 3 = 0), rest los
  let a = parseZwiftPad(u(0x07, 0x08, 1, 0x10, 1, 0x18, 0, 0x20, 1, 0x28, 1, 0x30, 1, 0x38, 1));
  assert.deepEqual(a, { left: 1, right: 0, item: false, bell: false });
  // Play rechts (veld 1 = 0), A ingedrukt (veld 4 = 0), flipper half (zigzag 100 = 50)
  a = parseZwiftPad(u(0x07, 0x08, 0, 0x10, 1, 0x18, 1, 0x20, 0, 0x28, 1, 0x30, 1, 0x38, 1, 0x40, 100));
  assert.equal(a.item, true); assert.equal(a.bell, false); assert.equal(a.right, 0.5);
  // Alles los
  a = parseZwiftPad(u(0x07, 0x08, 0, 0x10, 1, 0x18, 1, 0x20, 1, 0x28, 1, 0x30, 1, 0x38, 1));
  assert.deepEqual(a, { left: 0, right: 0, item: false, bell: false });
  // Click: plus = rechts, beide = power-up
  assert.equal(parseZwiftPad(u(0x37, 0x08, 0, 0x10, 1)).right, 1);
  assert.equal(parseZwiftPad(u(0x37, 0x08, 0, 0x10, 0)).item, true);
  // Ride: alle bits aan = niets ingedrukt; bit 0x1 uit = links
  assert.deepEqual(parseZwiftPad(u(0x23, 0x08, 0xff, 0xff, 0x0f)), { left: 0, right: 0, item: false, bell: false });
  assert.equal(parseZwiftPad(u(0x23, 0x08, 0xfe, 0xff, 0x0f)).left, 1); // pijl links
  assert.equal(parseZwiftPad(u(0x23, 0x08, 0xef, 0xff, 0x0f)).right, 1); // A (0x10) = rechts sturen
  assert.equal(parseZwiftPad(u(0x23, 0x08, 0xff, 0xfe, 0x0f)).left, 1); // Z (0x80) = links sturen
  assert.equal(parseZwiftPad(u(0x23, 0x08, 0xbf, 0xff, 0x0f)).item, true); // Y (0x40)
  assert.equal(parseZwiftPad(u(0x23, 0x08, 0xff, 0xdf, 0x0f)).item, true); // + (0x1000)
  assert.equal(parseZwiftPad(u(0x23, 0x08, 0xdf, 0xff, 0x0f)).bell, true); // B (0x20)
  // Onbekend type (bv. batterij) wordt genegeerd
  assert.equal(parseZwiftPad(u(0x19, 0x10, 80)), null);
});

test('TCX-export: geldig bestand met vermogen, hartslag en afstand', async () => {
  const { buildTcx, tcxFilename } = await import('../js/export.js');
  const { race } = simulate({ laps: 1, bots: 0, useItems: false });
  assert.ok(race.startedAt > 0);
  const log = race.stats.log;
  assert.ok(log.length > 300 && log[log.length - 1][1] > 3900);
  log[10][4] = 150;
  const tcx = buildTcx({ startedAt: Date.UTC(2026, 0, 2, 3, 4, 5), log, name: 'Test <&>' });
  assert.equal((tcx.match(/<Trackpoint>/g) || []).length, log.length);
  assert.ok(tcx.includes('<Id>2026-01-02T03:04:05Z</Id>'));
  assert.ok(tcx.includes('<ns3:Watts>184</ns3:Watts>'));
  assert.ok(tcx.includes('<HeartRateBpm><Value>150</Value></HeartRateBpm>'));
  assert.ok(!tcx.includes('Test <&>'));
  assert.match(tcxFilename(Date.now()), /^watt-blitz-\d{8}-\d{4}\.tcx$/);
  assert.equal(buildTcx({ startedAt: 0, log: [], name: '' }), null);
});

test('Kwak: naar een buurman sturen kost hem een blitzje en snelheid', () => {
  const { race } = simulate({ laps: 1, bots: 1, maxTime: 20, useItems: false });
  const me = race.me, o = race.riders[1];
  const place = () => { o.dist = me.dist + 0.5; o.x = 0.2; me.x = 0; o.kwakSafe = 0; me.kwakCd = 0; o.kwakCd = 9; };
  // rechtdoor sturen: niets
  place(); o.bolts = 3;
  race.getSteer = () => 0; race.update(0.04);
  assert.equal(o.fx.kwak, 0);
  // naar rechts sturen (naar hem toe): kwak
  place(); o.bolts = 3; const v = o.v;
  race.getSteer = () => 1; race.update(0.04);
  assert.ok(o.fx.kwak > 2, 'buurman is gekwakt');
  assert.equal(o.bolts, 2);
  assert.ok(o.v < v && o.x > 0.35, 'trager en opzij geduwd');
  // meteen daarna nog eens: beschermd, en ik heb afkoeltijd
  const b = o.bolts; o.x = me.x + 0.2; o.dist = me.dist; race.update(0.04);
  assert.equal(o.bolts, b);
  // schild blokt
  place(); o.fx.shield = 5; o.fx.kwak = 0; o.bolts = 3;
  race.update(0.04);
  assert.equal(o.fx.shield, 0); assert.equal(o.fx.kwak, 0); assert.equal(o.bolts, 3);
  // van de verkeerde kant sturen (van hem af): niets
  place(); o.fx.kwak = 0; race.getSteer = () => -1; race.update(0.04);
  assert.equal(o.fx.kwak, 0);
});

test('Ideale lijn: binnendoor ben je sneller rond dan buitenom', () => {
  const run = (x) => {
    const { race } = simulate({ track: 'kosmo', laps: 1, bots: 0, maxTime: 10, useItems: false });
    const t = race.track, me = race.me;
    const seg = t.segs.reduce((a, s) => (s.curve > a.curve ? s : a)); // scherpste bocht naar rechts
    me.dist = seg.i * 5 - 20; me.v = 10;
    const d0 = me.dist;
    for (let i = 0; i < 50; i++) { me.x = x; race.update(0.04); }
    return me.dist - d0;
  };
  const inside = run(0.8), mid = run(0), outside = run(-0.8);
  assert.ok(inside > mid * 1.03 && mid > outside * 1.03, `${inside} ${mid} ${outside}`);
  assert.ok(inside < mid * 1.12, 'winst blijft bescheiden');
});

test('Zonder stuurhulp duwt een bocht je naar buiten', () => {
  const { race } = simulate({ track: 'kosmo', laps: 1, bots: 0, maxTime: 10, useItems: false });
  race.profile.assist = false;
  const seg = race.track.segs.reduce((a, s) => (s.curve > a.curve ? s : a));
  race.me.dist = seg.i * 5 - 10; race.me.v = 12; race.me.x = 0;
  for (let i = 0; i < 25; i++) race.update(0.04);
  assert.ok(race.me.x < -0.1, `x = ${race.me.x}`); // bocht naar rechts duwt naar links
});

test('Short cut: oprit sluit aan op de weg, pad loont, ernaast is berm', () => {
  for (const d of TRACK_DEFS) {
    const t = getTrack(d.id), cut = t.cut;
    assert.ok(cut && cut.end - cut.start >= 120, d.id);
    const cs = t.segs.filter((s) => s.cut);
    assert.ok(Math.abs(cs[0].cut.a) < 1 && Math.abs(cs[cs.length - 1].cut.b) < 1, 'op- en afrit beginnen op de weg');
    assert.ok(cs.every((s) => Math.sign(s.cut.a) === cut.side && Math.sign(s.curve) === cut.side), 'pad ligt in de binnenbocht');
    // aaneengesloten: einde van elk stukje = begin van het volgende
    for (let i = 1; i < cs.length; i++) assert.ok(Math.abs(cs[i].cut.a - cs[i - 1].cut.b) < 1e-9);
  }
  const run = (x) => {
    const { race } = simulate({ track: 'kosmo', laps: 1, bots: 0, maxTime: 10, useItems: false });
    const cut = race.track.cut, me = race.me;
    me.dist = cut.start + 50; me.v = 10;
    const d0 = me.dist;
    for (let i = 0; i < 40; i++) { me.x = x; race.update(0.04); }
    return { d: me.dist - d0, me };
  };
  const side = getTrack('kosmo').cut.side;
  const path = run(side * 1.28), edge = run(side * 0.95), berm = run(side * 1.08);
  assert.equal(path.me.onCut, true); assert.equal(path.me.berm, false);
  assert.equal(berm.me.onCut, false); assert.equal(berm.me.berm, true);
  assert.ok(path.d > edge.d * 1.08, `pad ${path.d} vs binnenkant weg ${edge.d}`);
  assert.ok(berm.d < edge.d, 'in de berm verlies je');
});

test('Training: etappes sluiten op elkaar aan via de teleportboog', async () => {
  const { Race } = await import('../js/game.js');
  const mk = (track, extra) => {
    const ev = [];
    const riders = [{ id: 'p0', name: 'Ik', color: '#fff', kind: 'me' }, { id: 'b0', name: 'Bot', color: '#000', kind: 'bot', skill: 0.5 }];
    const race = new Race({ track: getTrack(track), laps: 1, seed: 3, riders, room: null, isHost: true, ns: 'demo', training: true,
      profile: { ftp: 200, fair: true, weight: 75, assist: true, trainerFeel: 50 }, difficulty: 'normaal', ghost: null,
      getPower: () => ({ power: 200, cadence: 90 }), getSteer: () => 0, emit: (t) => ev.push(t), ...extra });
    return { race, ev };
  };
  const run = (o, secs) => { for (let i = 0; i < secs * 25 && !o.race.ended && o.race.state !== 'done'; i++) o.race.update(0.04); };

  // warming-up: tijdgestuurd, geen items, niemand finisht
  const w = mk('polder', { mode: 'warm', timed: 20, rolling: true });
  w.race.me.item = 'turbo'; w.race.useItem();
  assert.equal(w.race.me.item, 'turbo', 'geen power-ups tijdens de warming-up');
  run(w, 60);
  assert.ok(w.ev.includes('stage') && Math.abs(w.race.time - 20) < 0.1);
  assert.ok(w.race.riders.every((r) => !r.finished));
  const c1 = w.race.carryOut();
  assert.equal(c1.time, 0); assert.ok(Math.abs(c1.logT - 20) < 0.1);

  // etappe 1 (open): aftellen, daarna door de boog zonder te finishen
  const s1 = mk('polder', { mode: 'stage', open: true, carry: c1 });
  assert.equal(s1.race.state, 'countdown');
  run(s1, 6);
  const { me } = s1.race, bot = s1.race.riders[1];
  me.dist = s1.race.total - 30; me.v = 10; me.bolts = 3; me.item = 'shield'; bot.dist = me.dist - 12; bot.v = 9;
  run(s1, 30);
  assert.ok(s1.ev.includes('stage') && !me.finished && !bot.finished);
  const c2 = s1.race.carryOut();
  assert.ok(c2.riders.b0.gap < -5 && c2.riders.p0.gap >= 0);

  // etappe 2 (laatste): vliegende start, toestand gaat mee, finish telt
  const s2 = mk('kosmo', { mode: 'stage', rolling: true, carry: c2, courseLen: 8500, distOffset: 4000 });
  assert.equal(s2.race.state, 'race');
  assert.ok(Math.abs(s2.race.time - c2.time) < 1e-9);
  assert.equal(s2.race.me.bolts, c2.riders.p0.bolts); assert.ok(c2.riders.p0.bolts >= 3); assert.equal(s2.race.me.item, 'shield');
  assert.ok(s2.race.riders[1].dist < -5 && s2.race.me.v > 5);
  s2.race.me.dist = s2.race.total - 30; s2.race.riders[1].dist = s2.race.total - 50; s2.race.riders[1].v = 8;
  run(s2, 30);
  assert.ok(s2.ev.includes('finish') && s2.race.me.finished);
  // logboek loopt door over de etappes heen
  const log = s2.race.stats.log;
  for (let i = 1; i < log.length; i++) assert.ok(log[i][0] > log[i - 1][0] && log[i][1] >= log[i - 1][1] - 0.01, `logregel ${i}`);

  // cooling-down: ik ben al gefinisht en rijd vrij; de bot finisht nog op de streep (afstand 0)
  const cd = mk('kosmo', { mode: 'cool', timed: 30, rolling: true, carry: s2.race.carryOut() });
  assert.equal(cd.race.me.finished, true);
  const d0 = cd.race.me.dist;
  run(cd, 12);
  assert.ok(cd.race.me.dist > d0 + 50, 'ik rijd zelf tijdens het uitrijden');
  assert.ok(cd.race.riders[1].finished && cd.race.riders[1].finishTime > cd.race.me.finishTime);
});
