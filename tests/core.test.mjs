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
  const idle = { left: 0, right: 0, item: false, bell: false, up: false, down: false };
  let a = parseZwiftPad(u(0x07, 0x08, 1, 0x10, 1, 0x18, 0, 0x20, 1, 0x28, 1, 0x30, 1, 0x38, 1));
  assert.deepEqual(a, { ...idle, kind: 'play', left: 1 });
  // Play rechts (veld 1 = 0), A ingedrukt (veld 4 = 0), flipper half (zigzag 100 = 50)
  a = parseZwiftPad(u(0x07, 0x08, 0, 0x10, 1, 0x18, 1, 0x20, 0, 0x28, 1, 0x30, 1, 0x38, 1, 0x40, 100));
  assert.equal(a.item, true); assert.equal(a.bell, false); assert.equal(a.right, 0.5);
  // Alles los
  a = parseZwiftPad(u(0x07, 0x08, 0, 0x10, 1, 0x18, 1, 0x20, 1, 0x28, 1, 0x30, 1, 0x38, 1));
  assert.deepEqual(a, { ...idle, kind: 'play' });
  assert.equal(parseZwiftPad(u(0x07, 0x08, 0, 0x10, 1, 0x18, 1, 0x20, 1, 0x28, 1, 0x30, 1, 0x38, 0)).up, true); // zijknop rechts
  assert.equal(parseZwiftPad(u(0x07, 0x08, 1, 0x10, 1, 0x18, 1, 0x20, 1, 0x28, 1, 0x30, 1, 0x38, 0)).down, true); // zijknop links
  // Click: plus = rechts, beide = power-up
  a = parseZwiftPad(u(0x37, 0x08, 0, 0x10, 1));
  assert.ok(a.right === 1 && a.up && !a.down);
  assert.equal(parseZwiftPad(u(0x37, 0x08, 0, 0x10, 0)).item, true);
  // Ride: alle bits aan = niets ingedrukt; bit 0x1 uit = links
  assert.deepEqual(parseZwiftPad(u(0x23, 0x08, 0xff, 0xff, 0x0f)), { ...idle, kind: 'ride' });
  assert.equal(parseZwiftPad(u(0x23, 0x08, 0xfe, 0xff, 0x0f)).left, 1); // pijl links
  assert.equal(parseZwiftPad(u(0x23, 0x08, 0xef, 0xff, 0x0f)).right, 1); // A (0x10) = rechts sturen
  assert.equal(parseZwiftPad(u(0x23, 0x08, 0xff, 0xfe, 0x0f)).left, 1); // Z (0x80) = links sturen
  assert.equal(parseZwiftPad(u(0x23, 0x08, 0xbf, 0xff, 0x0f)).item, true); // Y (0x40)
  a = parseZwiftPad(u(0x23, 0x08, 0xff, 0xdf, 0x0f)); // + rechts (0x1000)
  assert.ok(a.up && !a.down && !a.item);
  a = parseZwiftPad(u(0x23, 0x08, 0xff, 0xfd, 0x0f)); // − links (0x100)
  assert.ok(a.down && !a.up && !a.item);
  assert.equal(parseZwiftPad(u(0x23, 0x08, 0xff, 0xf7, 0x0f)).item, true); // power-up-knop links (0x400)
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
  // gemeten als tijd over hetzelfde stuk: minder tijd = sneller
  const timeOver = (follow, hopAt) => {
    const { race } = simulate({ track: 'kosmo', laps: 1, bots: 0, maxTime: 10, useItems: false });
    const cut = race.track.cut, me = race.me, side = cut.side;
    me.dist = cut.start - 4; me.v = 10; me.x = side * 0.8;
    const t0 = race.time; let berm = 0, valid = null;
    while (me.dist < cut.start + 110) {
      const s = race.track.segAt(me.dist + 0.5).cut;
      if (follow === 'path' && s && (hopAt == null || me.dist > cut.start + hopAt)) me.x = (s.a + s.b) / 2;
      else me.x = side * (follow === 'path' ? 0.95 : follow);
      me.v = 10; race.update(0.04);
      if (me.berm) berm++;
      if (me.onCut && valid == null && me.dist > cut.start + 15) valid = me.cutValid;
    }
    return { t: race.time - t0, berm, valid };
  };
  const viaRamp = timeOver('path'), edge = timeOver(0.95), hop = timeOver('path', 40), berm = timeOver(1.08);
  assert.equal(viaRamp.valid, true, 'via de oprit telt');
  assert.equal(hop.valid, false, 'dwars door de berm het pad op telt niet');
  assert.ok(viaRamp.t < edge.t * 0.93, `pad ${viaRamp.t} vs binnenkant weg ${edge.t}`);
  assert.ok(hop.t > edge.t * 0.99 && hop.t > viaRamp.t * 1.05, `inspringen ${hop.t} levert niets op (rand ${edge.t}, oprit ${viaRamp.t})`);
  assert.ok(berm.t > edge.t * 1.4, 'in de berm verlies je 40%');
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

test('Ronde- en segmentspook: beste poging rijdt mee en geeft het tijdsverschil', async () => {
  const { getGhost, getTime } = await import('../js/storage.js');
  const opts = { track: 'kosmo', laps: 2, bots: 0, useItems: false, extra: { ghostLap: true, ghostSeg: true, ns: 'real' } }; // eigen 'boek', los van de andere tests
  // 1e rit: zet de tijden en de spoken
  const a = simulate({ ...opts, effort: 1.0 });
  const lap = getGhost('real', 'kosmo|lapghost'), seg = getGhost('real', 'kosmo|segghost|lanceerbaan');
  assert.ok(lap && seg, 'spoken opgeslagen');
  assert.ok(Math.abs(lap.t - getTime('real', 'kosmo|lap')) < 0.01, 'rondespook hoort bij het ronde-PR');
  assert.ok(Math.abs(lap.s[lap.s.length - 2] - 4500) < 15 && lap.s[0] === 0, 'spook beslaat één ronde');
  for (let i = 3; i < lap.s.length; i += 3) assert.ok(lap.s[i] > lap.s[i - 3] && lap.s[i + 1] >= lap.s[i - 2]);
  assert.ok(a.race.prs.some((p) => p.label === 'Ronde'));

  // 2e rit, trager: de spoken rijden mee en ik loop achter
  const seen = { lap: 0, seg: 0, lapBehind: 0, segLabel: 0, maxLapDelta: 0 };
  const b = simulate({ ...opts, effort: 0.85, onTick: (r) => {
    const gl = r.ghostRiders.find((g) => g.gk === 'lap'), gs = r.ghostRiders.find((g) => g.gk === 'seg');
    if (gl) { seen.lap++; if (gl.delta > 0) seen.lapBehind++; seen.maxLapDelta = Math.max(seen.maxLapDelta, gl.delta || 0); }
    if (gs) { seen.seg++; if (r.ghostLabel === 'segment') seen.segLabel++; assert.ok(r.activeZone, 'segmentspook alleen binnen het segment'); }
  } });
  assert.ok(seen.lap > 1000 && seen.seg > 100, JSON.stringify(seen));
  assert.ok(seen.lapBehind > seen.lap * 0.8 && seen.maxLapDelta > 5, JSON.stringify(seen));
  assert.ok(seen.segLabel > 50, 'in een segment gaat het segmentverschil voor');
  assert.ok(Math.abs(getGhost('real', 'kosmo|lapghost').t - lap.t) < 1e-9, 'een tragere rit vervangt het spook niet');
  assert.ok(!b.race.prs.some((p) => p.label === 'Ronde'));

  // uitgevinkt: geen spoken
  let any = 0;
  simulate({ ...opts, effort: 0.9, maxTime: 120, extra: { ghostLap: false, ghostSeg: false, ns: 'real' }, onTick: (r) => { any += r.ghostRiders.length; } });
  assert.equal(any, 0);
});

test('Botsing: achterop iemand rijden kost snelheid, ernaast rijden niet', () => {
  const { race, events } = simulate({ laps: 1, bots: 1, maxTime: 20, useItems: false });
  const me = race.me, o = race.riders[1];
  const place = (dx) => { o.dist = me.dist + 1.2; o.x = me.x + dx; o.v = 7; me.v = 11; me.bumpCd = 0; me.fx.bump = 0; o.kwakCd = 9; };
  place(0.4); race.update(0.04);
  assert.equal(me.fx.bump, 0, 'naast elkaar: geen botsing');
  place(0.05); race.update(0.04);
  assert.ok(me.fx.bump > 1 && me.v < 8.5, `achterop: v=${me.v}`); // een kwart van je snelheid kwijt
  assert.ok(events.some(([t, d]) => t === 'banner' && d.text.includes('BOTSING')));
  const v = me.v; place(0.05); me.v = v; me.bumpCd = 2; race.update(0.04);
  assert.ok(me.v > v * 0.9, 'niet twee keer achter elkaar gestraft');
});

test('Berm: meteen 40% minder voortgang, trainer wordt zwaarder en je krijgt een melding', () => {
  const { race, events } = simulate({ track: 'polder', laps: 1, bots: 0, maxTime: 10, useItems: false });
  const g0 = race.trainerGrade, me = race.me;
  me.x = 1.3; me.v = 10;
  const d0 = me.dist;
  race.update(0.04);
  assert.equal(me.berm, true);
  assert.ok(Math.abs(me.line + 0.4) < 1e-9);
  assert.ok(Math.abs((me.dist - d0) - me.v * 0.04 * 0.6) < 0.02, 'direct 40% minder vooruit');
  race.update(0.04);
  assert.ok(race.trainerGrade > g0 + 3.5, 'trainer voelt de berm');
  assert.ok(events.some(([t, d]) => t === 'banner' && d.text.includes('BERM')));
});

test('Ritstatistiek: kilometers en hoogtemeters lopen mee', () => {
  const { race } = simulate({ track: 'vulkaan', laps: 1, bots: 0, useItems: false });
  assert.ok(Math.abs(race.stats.km - 5) < 0.1, `km ${race.stats.km}`);
  assert.ok(Math.abs(race.stats.hm - getTrack('vulkaan').climbTotal) < 3, `hm ${race.stats.hm}`);
});

test('Klassement: tijden van anderen samenvoegen en sorteren', async () => {
  const { mergeEntry, boardRows, myEntry } = await import('../js/board.js');
  const { store } = await import('../js/storage.js');
  store.pr.real['polder|lap'] = { t: 400 };
  assert.equal(myEntry().recs['polder|lap'], 400);
  assert.equal(mergeEntry({ pid: 'x1', name: 'Tim', recs: { 'polder|lap': 390, 'polder|seg|dijksprint': 31, 'nep|lap': 1, 'polder|race|2': 5 } }), true);
  mergeEntry({ pid: 'x2', name: '<b>Lisa</b> met een veel te lange naam', recs: { 'polder|lap': 410 } });
  mergeEntry({ pid: 'x1', name: 'Tim', recs: { 'polder|lap': 395 } }); // trager: telt niet
  mergeEntry({ pid: 'x3', name: 'Vals', recs: { 'polder|lap': 0.5 } }); // onmogelijke tijd
  assert.equal(mergeEntry({ pid: store.pid, name: 'ik', recs: { 'polder|lap': 1 } }), false);
  const rows = boardRows('polder|lap');
  assert.deepEqual(rows.map((r) => [r.name.slice(0, 3), r.t, r.me]), [['Tim', 390, false], [store.profile.name.slice(0, 3), 400, true], ['<b>', 410, false]]);
  assert.ok(rows[2].name.length <= 14);
  assert.equal(Object.keys(store.board.x1.recs).length, 2, 'alleen bekende ronde- en segmentsleutels');
});

test('TCX: hoogte uit het bestand wordt door Strava gebruikt', async () => {
  const { buildTcx } = await import('../js/export.js');
  const tcx = buildTcx({ startedAt: 0, log: [[1, 0, 200, 90, 0, 8, -0.4], [2, 8, 200, 90, 0, 8, 12.3]], name: 'x' });
  assert.ok(tcx.includes('<Name>Watt Blitz with barometer</Name>'));
  assert.ok(tcx.includes('<AltitudeMeters>49.6</AltitudeMeters>') && tcx.includes('<AltitudeMeters>62.3</AltitudeMeters>'));
});

test('Virtueel schakelen: 24 versnellingen, begrensd, en de trainer voelt het verschil', async () => {
  const { GEARS, NEUTRAL, getGear, shift, gearOffset } = await import('../js/gears.js');
  const { simParamsCommand } = await import('../js/ble.js');
  assert.equal(getGear(), NEUTRAL);
  assert.equal(gearOffset(), 0);
  for (let i = 0; i < 30; i++) shift(1);
  assert.equal(getGear(), GEARS);
  assert.equal(shift(1), false, 'niet verder dan de zwaarste');
  assert.ok(gearOffset() > 5);
  for (let i = 0; i < 30; i++) shift(-1);
  assert.equal(getGear(), 1);
  assert.ok(gearOffset() < -5);
  // zwaarste versnelling op 2% helling gaat als ruim 8% naar de trainer
  const g = new DataView(simParamsCommand(2 + gearOffset(GEARS)).buffer).getInt16(3, true);
  assert.equal(g, 800);
  while (getGear() < NEUTRAL) shift(1);
});

// Nep-Bluetooth-knop om het (her)verbinden te testen zonder hardware.
function fakePad(name = 'Zwift Click') {
  const chars = { async: new EventTarget(), tx: new EventTarget(), rx: { writes: 0, writeValueWithoutResponse: async () => { chars.rx.writes++; } } };
  for (const c of [chars.async, chars.tx]) c.startNotifications = async () => {};
  const dev = new EventTarget();
  Object.assign(dev, { name, connects: 0, failNext: 0 });
  const server = { getPrimaryService: async () => ({ getCharacteristic: async (u) => (u.endsWith('2-19ca-4651-86e5-fa29dcdd09d1') ? chars.async : u.startsWith('00000003') ? chars.rx : chars.tx) }) };
  dev.gatt = {
    connected: false,
    connect: async () => { dev.connects++; if (dev.failNext > 0) { dev.failNext--; throw new Error('niet bereikbaar'); } dev.gatt.connected = true; return server; },
    disconnect: () => { if (!dev.gatt.connected) return; dev.gatt.connected = false; setTimeout(() => dev.dispatchEvent(new Event('gattserverdisconnected')), 0); },
  };
  const send = (...bytes) => { const e = new Event('characteristicvaluechanged'); Object.defineProperty(e, 'target', { value: { value: new DataView(Uint8Array.from(bytes).buffer) } }); chars.async.dispatchEvent(e); };
  return { dev, chars, send, drop: () => dev.gatt.disconnect() };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('Zwift-knop: stopbericht en elke minuut ongemerkt vernieuwen, zonder dubbele berichten', async () => {
  const { ZwiftPad, PAD_REFRESH_MS } = await import('../js/ble.js');
  const f = fakePad();
  globalThis.navigator ??= {};
  Object.defineProperty(globalThis.navigator, 'bluetooth', { value: { requestDevice: async () => f.dev }, configurable: true });
  const pad = new ZwiftPad();
  let msgs = 0, lost = 0;
  pad.onpad = () => msgs++;
  pad.onlost = () => lost++;
  await pad.connect();
  assert.ok(pad.connected && f.dev.connects === 1 && f.chars.rx.writes === 1);
  // stopbericht: volledig opnieuw verbinden, zonder alarm
  f.send(0xff, 0x05, 0x00, 0xea, 0x05);
  await wait(400);
  assert.equal(f.dev.connects, 2); assert.equal(f.chars.rx.writes, 2); assert.equal(lost, 0); assert.ok(pad.connected);
  // na herverbinden komt elk bericht één keer binnen
  f.send(0x23, 0x08, 0xbf, 0xff, 0x0f);
  assert.equal(msgs, 1); assert.equal(pad.kind, 'ride'); assert.ok(pad.pressed);
  // elke minuut: niet terwijl een knop is ingedrukt, wel daarna
  assert.equal(pad.keepAlive(performance.now() + PAD_REFRESH_MS + 1), false);
  f.send(0x23, 0x08, 0xff, 0xff, 0x0f);
  assert.equal(pad.keepAlive(performance.now() + PAD_REFRESH_MS + 1), true);
  await wait(400);
  assert.equal(f.dev.connects, 3); assert.equal(lost, 0);
  pad.disconnect();
});

test('Apparaat: na wegvallen blijft het opnieuw proberen tot het lukt', async () => {
  const { ZwiftPad } = await import('../js/ble.js');
  const f = fakePad('Zwift Play');
  Object.defineProperty(globalThis.navigator, 'bluetooth', { value: { requestDevice: async () => f.dev }, configurable: true });
  const pad = new ZwiftPad();
  let lost = 0, back = 0;
  pad.onlost = () => lost++; pad.onback = () => back++;
  await pad.connect();
  f.dev.failNext = 2; // de eerste twee pogingen mislukken (bv. knop slaapt)
  f.drop();
  await wait(50);
  assert.equal(lost, 1); assert.equal(pad.connected, false);
  await wait(3600);
  assert.equal(back, 1); assert.ok(pad.connected); assert.equal(f.dev.connects, 4);
  assert.ok(pad.log.some(([, e]) => e.includes('poging 1 mislukt')) && pad.log.some(([, e]) => e.includes('weer verbonden (poging 3)')));
  assert.equal(pad.needsRefresh, false, 'Play hoeft niet elke minuut vernieuwd');
  pad.disconnect();
});

test('Kwak: geen automatische terugkwak, wel bewust na 2 seconden; botsing blijft mogelijk', async () => {
  const { Race } = await import('../js/game.js');
  const setup = () => {
    const { race } = simulate({ laps: 1, bots: 1, maxTime: 15, useItems: false });
    const me = race.me, o = race.riders[1];
    const hits = [];
    const orig = race.hit.bind(race);
    race.hit = (r, kind, by, dir) => { if (kind === 'kwak') hits.push([+race.time.toFixed(2), r === me ? 'mij' : 'bot']); return orig(r, kind, by, dir); };
    o.ai.kwakT = 0; o.kwakCd = 9; me.kwakCd = 0; me.kwakSafe = 0; o.kwakSafe = 0;
    o.dist = me.dist + 0.3; o.x = -0.15; me.x = 0.05; o.v = me.v = 9;
    race._kwak(o, me, 1); // de bot kwakt mij naar rechts
    return { race, me, o, hits };
  };
  // ik stuur meteen terug naar links (naar de bot toe): geen terugkwak in de eerste 2 s
  let { race, me, o, hits } = setup();
  for (let i = 0; i < 45; i++) { o.x = -0.15; o.dist = me.dist + 0.3; race.getSteer = () => (me.x > o.x + 0.1 ? -1 : 0); race.update(0.04); }
  assert.deepEqual(hits.map((h) => h[1]), ['mij'], JSON.stringify(hits));
  // daarna wel, als ik er bewust naartoe stuur
  for (let i = 0; i < 25; i++) { o.x = me.x - 0.2; o.dist = me.dist + 0.3; race.getSteer = () => -1; race.update(0.04); }
  assert.ok(hits.some((h) => h[1] === 'bot' && h[0] >= race.time - 1.1), JSON.stringify(hits));
  // botsing: de gever rijdt kort na de kwak achterop de ontvanger en wordt wel gestraft
  ({ race, me, o } = setup());
  o.dist = me.dist - 1.2; o.x = me.x; o.v = me.v + 2; o.bumpCd = 0;
  race.update(0.04);
  assert.ok(o.fx.bump > 0, 'gever krijgt botsingsstraf');
});

test('Multiplayer: wat een ander pakt, verdwijnt ook bij mij', async () => {
  const { Race } = await import('../js/game.js');
  const sent = [];
  const room = { send: (m) => sent.push(m) };
  const mk = (meId) => new Race({ track: getTrack('polder'), laps: 1, seed: 1, room, isHost: meId === 'p0', ns: 'demo',
    riders: [{ id: 'p0', name: 'A', color: '#fff', kind: meId === 'p0' ? 'me' : 'remote' }, { id: 'p1', name: 'B', color: '#000', kind: meId === 'p1' ? 'me' : 'remote' }],
    profile: { ftp: 200, fair: true, weight: 75, assist: true, trainerFeel: 50 }, difficulty: 'normaal', ghost: null,
    getPower: () => ({ power: 200, cadence: 90 }), getSteer: () => 0, emit: () => {} });
  const a = mk('p0'), b = mk('p1');
  for (const r of [a, b]) { r.countdown = 0; r.update(0.04); }
  // A rijdt over een blitzje
  const bolt = a.track.objects.find((o) => o.type === 'bolt');
  a.me.dist = bolt.d - 1; a.me.x = bolt.x; a.me.v = 10;
  a.update(0.2);
  assert.equal(a.me.bolts, 1);
  const msg = sent.find((m) => m.t === 'pick');
  assert.ok(msg && msg.o === bolt.id);
  // B ontvangt het bericht: het blitzje is weg, B kan het niet meer pakken
  b.onNet(msg);
  b.me.dist = bolt.d - 1; b.me.x = bolt.x; b.me.v = 10;
  b.update(0.2);
  assert.equal(b.me.bolts, 0);
  // onzin wordt genegeerd
  b.onNet({ t: 'pick', o: 99999, c: 15 }); b.onNet({ t: 'pick', o: 'x', c: 15 }); b.onNet({ t: 'pick', o: 1, c: 15, st: 3 });
  assert.equal(b.objCool[1], 0);
});

test('Groene trui: eerste onder de sprintboog wint, 5% sneller voor 30 s, ook in multiplayer', async () => {
  const { Race } = await import('../js/game.js');
  const sent = [];
  const room = { send: (m) => sent.push(m) };
  const mk = (meId) => new Race({ track: getTrack('polder'), laps: 2, seed: 1, room, isHost: meId === 'p0', ns: 'demo',
    riders: [{ id: 'p0', name: 'A', color: '#fff', kind: meId === 'p0' ? 'me' : 'remote' }, { id: 'p1', name: 'B', color: '#000', kind: meId === 'p1' ? 'me' : 'remote' }],
    profile: { ftp: 200, fair: true, weight: 75, assist: true, trainerFeel: 50 }, difficulty: 'normaal', ghost: null,
    getPower: () => ({ power: 200, cadence: 90 }), getSteer: () => 0, emit: () => {} });
  const a = mk('p0'), b = mk('p1');
  for (const r of [a, b]) { r.countdown = 0; r.update(0.04); }
  const z = a.track.zones.find((q) => q.type === 'sprint');
  // A komt als eerste onder de boog
  a.me.dist = z.end - 1; a.me.v = 10; a.me.x = 0;
  a.update(0.2);
  assert.equal(a.greenId, 'p0'); assert.ok(a.me.fx.sprint > 29);
  const msg = sent.find((m) => m.t === 'sprint');
  assert.ok(msg && msg.id === 'p0');
  // B komt later onder dezelfde boog, maar kreeg het bericht van A al: geen trui voor B
  b.onNet(msg);
  assert.equal(b.greenId, 'p0');
  b.me.dist = z.end - 1; b.me.v = 10; b.update(0.2);
  assert.equal(b.greenId, 'p0'); assert.equal(b.me.fx.sprint, 0);
  // voordeel: 5% meer voortgang
  const d0 = a.me.dist, v = a.me.v; a.update(0.04);
  assert.ok((a.me.dist - d0) / (a.me.v * 0.04) > 1.04 && (a.me.dist - d0) / (a.me.v * 0.04) < 1.07);
  // volgende ronde wint B: trui gaat over
  b.me.dist = a.L + z.end - 1; b.update(0.2);
  assert.equal(b.greenId, 'p1'); assert.ok(b.me.fx.sprint > 29);
  // onzin wordt genegeerd
  b.onNet({ t: 'sprint', key: 5, id: 'p0', at: 1 }); b.onNet({ t: 'sprint', key: 'x', id: 'nobody', at: 1 });
  assert.equal(b.greenId, 'p1');
});

test('Waarschuwing: vuurpijl richt eerst, tegenwind komt na een korte waarschuwing; schild blokt dan nog', async () => {
  const { race, events } = simulate({ laps: 1, bots: 1, maxTime: 20, useItems: false });
  const me = race.me, bot = race.riders[1];
  // vuurpijl van de bot op mij
  bot.dist = me.dist - 20; bot.v = me.v = 9; race.rank();
  bot.item = 'rocket'; race.useItem(bot);
  race.update(0.04);
  assert.match(race.warn?.text || '', /VUURPIJL/);
  assert.ok(events.some(([t, d]) => t === 'sfx' && d === 'alarm'));
  me.item = 'shield'; race.useItem(me); // op tijd het schild erin
  for (let i = 0; i < 100 && race.rockets.length; i++) race.update(0.04);
  assert.equal(me.fx.spin, 0, 'schild hield de vuurpijl tegen');
  // tegenwind
  bot.item = 'storm'; race.useItem(bot);
  race.update(0.04);
  assert.match(race.warn?.text || '', /TEGENWIND/);
  assert.equal(me.fx.storm, 0, 'nog niet meteen');
  for (let i = 0; i < 45; i++) race.update(0.04);
  assert.ok(me.fx.storm > 0, 'na de waarschuwing komt hij');
});

test('Bolletjestrui: snelste klimtijd in de race, af te pakken met een snellere tijd', async () => {
  const { Race } = await import('../js/game.js');
  const sent = [];
  const room = { send: (m) => sent.push(m) };
  const mk = (meId) => new Race({ track: getTrack('vulkaan'), laps: 2, seed: 1, room, isHost: meId === 'p0', ns: 'demo',
    riders: [{ id: 'p0', name: 'A', color: '#fff', kind: meId === 'p0' ? 'me' : 'remote' }, { id: 'p1', name: 'B', color: '#000', kind: meId === 'p1' ? 'me' : 'remote' }],
    profile: { ftp: 200, fair: true, weight: 75, assist: true, trainerFeel: 50 }, difficulty: 'normaal', ghost: null,
    getPower: () => ({ power: 200, cadence: 90 }), getSteer: () => 0, emit: () => {} });
  const a = mk('p0'), b = mk('p1');
  for (const r of [a, b]) { r.countdown = 0; r.update(0.04); }
  const z = a.track.zones.find((q) => q.type === 'climb');
  const climb = (race, secs, lap = 0) => {
    race.me.dist = lap * race.L + z.start - 0.5; race.me.v = 10; race.update(0.1);
    race.time += secs - 0.2;
    race.me.dist = lap * race.L + z.end - 0.5; race.update(0.1);
  };
  climb(a, 240);
  assert.equal(a.komId, 'p0'); assert.ok(a.me.fx.kom > 29);
  const m1 = sent.find((m) => m.t === 'kom');
  assert.ok(m1 && Math.abs(m1.time - 240) < 0.5);
  b.onNet(m1);
  assert.equal(b.komId, 'p0');
  climb(b, 250); // trager: geen trui
  assert.equal(b.komId, 'p0'); assert.equal(b.me.fx.kom, 0);
  climb(b, 230, 1); // sneller: trui over
  assert.equal(b.komId, 'p1'); assert.ok(b.me.fx.kom > 29);
  a.onNet(sent.filter((m) => m.t === 'kom').pop());
  assert.equal(a.komId, 'p1');
  // halverwege de klim instappen telt niet
  const c = mk('p0'); c.countdown = 0; c.update(0.04);
  c.me.dist = z.end - 0.5; c.me.v = 10; c.update(0.1);
  assert.equal(c.komId, undefined);
});

test('Nieuwe power-ups: muur ervoor of erachter, punaises geven lek, schild helpt', () => {
  const { race } = simulate({ track: 'polder', laps: 1, bots: 1, maxTime: 20, useItems: false });
  const me = race.me, bot = race.riders[1];
  // niet op kop: muur 30 m voor de renner vóór je
  bot.dist = me.dist + 20; bot.x = 0.3; race.rank();
  me.item = 'wall'; race.useItem(me);
  let w = race.hazards.find((h) => h.type === 'wall');
  assert.ok(w.front && Math.abs(w.d - (bot.dist + 30) % race.L) < 1 && w.life === 10);
  // de bot knalt erop: 70% snelheid kwijt
  const v = bot.v = 10; bot.dist = w.d - 1; bot.x = w.x + 0.4; bot.fx.shield = 0; race._pickups(bot, w.d - 2);
  assert.ok(bot.v < v * 0.35 && bot.fx.spin > 0, 'muur raakt over de halve weg');
  // ik kom er zelf ook langs: mijn eigen muur ervoor raakt mij ook
  me.v = 10; me.fx.shield = 0; me.dist = w.d - 1; me.x = w.x - 0.4; race._pickups(me, w.d - 2);
  assert.ok(me.v < 3.5, 'eigen muur ervoor raakt je ook');
  // op kop: muur achter je
  race.hazards = []; me.dist = bot.dist + 50; race.rank();
  me.item = 'wall'; race.useItem(me);
  w = race.hazards.find((h) => h.type === 'wall');
  assert.ok(!w.front && w.life === 20 && mod(me.dist - w.d, race.L) < 4);
  // punaises: lek, schild beschermt
  race.hazards = []; bot.item = 'tacks'; race.useItem(bot);
  const tk = race.hazards.find((h) => h.type === 'tacks');
  me.fx.shield = 5; me.fx.flat = me.fx.wheel = 0; me.dist = tk.d - 1; me.x = tk.x + 0.45; race._pickups(me, tk.d - 2);
  assert.equal(me.fx.flat + me.fx.wheel, 0, 'schild houdt punaises tegen');
  tk.hitBy = []; me.fx.shield = 0; race._pickups(me, tk.d - 2);
  assert.ok(me.fx.flat > 0 || me.fx.wheel > 0, 'lek door punaises');
});
function mod(a, n) { return ((a % n) + n) % n; }

test('Lek: 30% trager tot de sealant dicht, kans groeit met berm-tikjes en tijd in de berm', () => {
  const { race } = simulate({ track: 'polder', laps: 1, bots: 0, maxTime: 10, useItems: false });
  const me = race.me;
  race.rng = () => 0.9; // geen wielwissel
  race._flat(me, 'berm');
  assert.equal(me.fx.flat, 6);
  me.x = 0; me.v = 10; const d0 = me.dist; race.update(0.04);
  assert.ok(Math.abs((me.dist - d0) / (me.v * 0.04) - 0.7) < 0.03, '30% trager');
  for (let i = 0; i < 160; i++) race.update(0.04);
  assert.equal(me.fx.flat, 0, 'na 6 s dicht');
  race.rng = () => 0.1; me.fx.flat = 0; race._flat(me, 'berm');
  assert.equal(me.fx.wheel, 3, 'soms een wielwissel');
  // berm-slijtage: elk tikje telt, en de tijd erin ook
  me.fx.wheel = 0; me.bermWear = 0; race.rng = () => 0.99;
  for (let k = 0; k < 5; k++) { me.x = 1.2; race.update(0.04); me.x = 0; race.update(0.04); }
  assert.ok(me.bermWear > 4.5, `5 tikjes: ${me.bermWear}`);
  const w0 = me.bermWear; me.x = 1.2; for (let i = 0; i < 25; i++) { me.x = 1.2; race.update(0.04); }
  assert.ok(me.bermWear > w0 + 1.3, '1 s in de berm telt ook');
});

test('Plakbidon en scooter: voordeel alleen met goed sturen', () => {
  const { race } = simulate({ track: 'polder', laps: 1, bots: 0, maxTime: 10, useItems: false });
  const me = race.me;
  race.rng = () => 0.99; // jury kijkt weg
  me.x = 0.7; me.item = 'bottle'; race.useItem(me);
  assert.equal(me.towSide, 1);
  me.v = 10; let d0 = me.dist; race.update(0.04);
  assert.ok(me.towing && (me.dist - d0) / (me.v * 0.04) > 1.3, 'mee getrokken');
  race.getSteer = () => -1; for (let i = 0; i < 20; i++) race.update(0.04);
  assert.equal(me.fx.tow, 0, 'te ver van de rand: bidon los');
  race.getSteer = () => 0;
  // scooter: halve luchtweerstand recht erachter
  me.x = 0; me.item = 'scooter'; race.useItem(me);
  race.update(0.04);
  assert.ok(me.inScooter);
  me.x = 0.5; race.update(0.04);
  assert.ok(!me.inScooter, 'naast de scooter geen voordeel');
});

test('Jury: tijdstraf bij plakbidon en kwak, telt mee in de eindtijd', () => {
  const { race } = simulate({ track: 'polder', laps: 1, bots: 1, maxTime: 10, useItems: false });
  const me = race.me, o = race.riders[1];
  race.rng = () => 0.01; // jury ziet alles
  me.x = 0.7; me.item = 'bottle'; race.useItem(me);
  assert.equal(me.penalty, 7);
  // vuile kwak (de berm in) en gewone kwak
  o.fx.shield = 0; o.x = 0.85; o.dist = me.dist; race._kwak(me, o, 1);
  assert.equal(me.penalty, 12);
  o.x = 0; o.fx.kwak = 0; o.kwakSafe = 0; race._kwak(me, o, 1);
  assert.equal(me.penalty, 13);
  // eindtijd inclusief straf
  me.dist = race.total - 1; me.v = 10; race.update(0.2);
  assert.ok(me.finished && me.finishTime > race.time + 12.5, `eindtijd ${me.finishTime} bij tijd ${race.time}`);
  assert.equal(race.results().find((x) => x.me).penalty, 13);
});

test('Plakbidon: de ploegwagen houdt je uit de berm aan zijn kant', () => {
  const { race } = simulate({ track: 'polder', laps: 1, bots: 0, maxTime: 10, useItems: false });
  const me = race.me;
  race.rng = () => 0.99;
  me.x = 0.8; me.item = 'bottle'; race.useItem(me);
  race.getSteer = () => 1; // hard naar de berm sturen
  for (let i = 0; i < 25; i++) race.update(0.04);
  assert.ok(me.x <= 0.96 && !me.berm && me.towing, `x=${me.x}`);
});

test('Rubber banding: achterblijvers sneller, koploper niet, tijden tellen dan niet', async () => {
  const { getTime } = await import('../js/storage.js');
  const { race } = simulate({ track: 'kosmo', laps: 1, bots: 1, maxTime: 10, useItems: false, extra: { rubber: true, ns: 'real' } });
  const me = race.me, bot = race.riders[1];
  bot.dist = me.dist + 200; race.rank();
  race.update(0.04);
  assert.ok(Math.abs(me.rubber - 0.1) < 1e-9, `ver achter: ${me.rubber}`);
  assert.equal(bot.rubber, 0, 'koploper krijgt niets');
  bot.dist = me.dist + 85; race.rank(); race.update(0.04);
  assert.ok(me.rubber > 0.04 && me.rubber < 0.06, `halverwege: ${me.rubber}`);
  bot.dist = me.dist + 10; race.rank(); race.update(0.04);
  assert.equal(me.rubber, 0, 'dichtbij geen bonus');
  // tijden tellen niet
  const before = getTime('real', 'kosmo|seg|lanceerbaan');
  race._time('kosmo|seg|lanceerbaan', 1, 'Test');
  assert.equal(getTime('real', 'kosmo|seg|lanceerbaan'), before);
});
