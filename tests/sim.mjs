// Hulpmiddel: rijdt een complete race zonder beeld. Gebruikt door de tests en om de balans te bekijken.
import { getTrack } from '../js/track.js';
import { Race } from '../js/game.js';

export function simulate({ track = 'polder', laps = 1, bots = 5, diff = 'normaal', effort = 0.92, ftp = 200, weight = 75, fair = true, seed = 7, useItems = true, maxTime = 3600 } = {}) {
  const riders = [{ id: 'p0', name: 'Ik', color: '#fff', kind: 'me' }];
  for (let i = 0; i < bots; i++) riders.push({ id: 'b' + i, name: 'Bot' + i, color: '#000', kind: 'bot', skill: bots > 1 ? i / (bots - 1) : 0.6 });
  const events = [];
  const race = new Race({
    track: getTrack(track), laps, seed, riders, room: null, isHost: true, ns: 'demo',
    profile: { ftp, fair, weight, assist: true, trainerFeel: 50 }, difficulty: diff, ghost: null,
    getPower: () => ({ power: ftp * effort, cadence: 90 }), getSteer: () => 0,
    emit: (type, data) => events.push([type, data]),
  });
  const dt = 0.04;
  let t = 0;
  while (t < maxTime && race.riders.some((r) => !r.finished)) {
    race.update(dt);
    if (useItems && race.me.item) race.useItem();
    t += dt;
  }
  return { race, events, results: race.results() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const track of ['polder', 'vulkaan', 'kosmo']) for (const diff of ['makkelijk', 'normaal', 'zwaar', 'beul']) {
    const { results, race } = simulate({ track, diff });
    const me = results.find((r) => r.me);
    console.log(track.padEnd(8), diff.padEnd(10), `ik: plek ${me.rank}, ${me.time?.toFixed(0)}s`, '| bots:', results.filter((r) => !r.me).map((r) => r.time?.toFixed(0)).join(' '), '| bolts', race.me.bolts);
  }
}
