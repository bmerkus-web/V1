// Watt Blitz – menu's, HUD en de hoofdlus.
import { TRACK_DEFS, getTrack } from './track.js';
import { Race, ITEMS, BOT_NAMES, juryWhat } from './game.js';
import { Renderer } from './render.js';
import { Trainer, Sterzo, HeartRate, ZwiftPad, bleSupported } from './ble.js';
import { input, bindTouch } from './input.js';
import { audio } from './audio.js';
import { store, save, COLORS, getTime, getGhost, levelOf } from './storage.js';
import { Room, makeCode } from './net.js';
import { fmtTime, fmtDelta, clamp, mod } from './util.js';
import { buildTcx, tcxFilename } from './export.js';
import { grab, compose } from './shot.js';
import { GEARS, getGear, shift, gearOffset } from './gears.js';
import { boardKeys, boardRows, mergeEntry, entriesToShare } from './board.js';
import { BUILTIN, parseWorkout, loadWorkouts, saveWorkouts, at as wkAt, targetW, blockName, blockFrac, zoneColor, cueAt, metrics, plannedTss, raceEnd } from './workout.js';

const $ = (id) => document.getElementById(id);
// Alleen naar de pagina schrijven als er echt iets verandert: elke schrijfactie kost de browser
// een nieuwe opmaakronde, en de HUD wordt elk beeld bijgewerkt (zwaar voor oude tablets).
const setText = (el, v) => { v = String(v); if (el._v !== v) { el._v = v; el.textContent = v; } };
const setHTML = (el, v) => { if (el._v !== v) { el._v = v; el.innerHTML = v; } };
const P = store.profile;
const trainer = new Trainer();
const sterzo = new Sterzo();
const hrm = new HeartRate();
const pads = []; // gekoppelde Zwift-knoppen
const HOSTED = !!window.claude?.use; // draait als Claude-artifact
const renderer = new Renderer($('game'));
let race = null, room = null, paused = false, lastCfg = null, resultsTimer = null, rerenderResults = null, lobbyReady = false;
const WARM_SECS = +new URLSearchParams(location.search).get('warm') || 420; // 7 minuten in- en uitrijden
const T = (store.training ||= { plan: [{ track: 'polder', laps: 1 }, { track: 'vulkaan', laps: 1 }, { track: 'kosmo', laps: 1 }], warm: true, cool: true });
const sel = { track: 'polder', laps: 2, botsOn: true, bots: 5, diff: 'normaal', fair: P.fair, rubber: false, mode: 'race', plan: T.plan, warm: T.warm, cool: T.cool };
let training = null; // lopende training: { stages, idx, courseLen, gone }
// Workouts: ingebouwd + zelf geïmporteerd. wk = de lopende workout.
let myWorkouts = loadWorkouts();
const allWorkouts = () => [...BUILTIN, ...myWorkouts];
Object.assign(sel, { wk: store.wkSel || 'b-kennis', erg: store.wkErg ?? true, wkMode: store.wkMode || (store.wkZen ? 'zen' : 'ride'), wkObj: null });
let wk = null; // { w, bias, erg, log: [{t,p,tgt,hr,cad}], sec, bi, p3, chartAt }
const clock = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = String(sec % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };

// ---------- hulpjes ----------
// Kleine groene trui (strepen + bliksem) voor meldingen en het lijstje rechtsboven.
const JERSEY_SVG = '<svg class="jersey" viewBox="0 0 32 28" aria-hidden="true"><defs><clipPath id="jc"><path d="M10 1l-9 6 4 7 4-3v16h14V11l4 3 4-7-9-6c-1 3-3 4-6 4s-5-1-6-4z"/></clipPath></defs><g clip-path="url(#jc)"><rect width="32" height="28" fill="#15a34a"/><rect x="6" width="3.5" height="28" fill="#7cf0a6"/><rect x="13" width="3.5" height="28" fill="#7cf0a6"/><rect x="20" width="3.5" height="28" fill="#7cf0a6"/><path d="M18 8l-6 9h4l-2 8 7-10h-4l2-7z" fill="#ffe26b" stroke="#0b3d1f" stroke-width=".8"/></g><path d="M10 1l-9 6 4 7 4-3v16h14V11l4 3 4-7-9-6c-1 3-3 4-6 4s-5-1-6-4z" fill="none" stroke="#0b3d1f" stroke-width="1"/></svg>';
const POLKA_SVG = '<svg class="jersey" viewBox="0 0 32 28" aria-hidden="true"><defs><clipPath id="pc"><path d="M10 1l-9 6 4 7 4-3v16h14V11l4 3 4-7-9-6c-1 3-3 4-6 4s-5-1-6-4z"/></clipPath></defs><g clip-path="url(#pc)"><rect width="32" height="28" fill="#fbfbff"/><g fill="#e8262c"><circle cx="5" cy="9" r="1.8"/><circle cx="11" cy="6" r="1.8"/><circle cx="21" cy="6" r="1.8"/><circle cx="27" cy="9" r="1.8"/><circle cx="11" cy="14" r="1.8"/><circle cx="22" cy="13" r="1.8"/><circle cx="11" cy="22" r="1.8"/><circle cx="21" cy="21" r="1.8"/></g><path d="M18 8l-6 9h4l-2 8 7-10h-4l2-7z" fill="#ffd166" stroke="#7a0f12" stroke-width=".8"/></g><path d="M10 1l-9 6 4 7 4-3v16h14V11l4 3 4-7-9-6c-1 3-3 4-6 4s-5-1-6-4z" fill="none" stroke="#7a0f12" stroke-width="1"/></svg>';
const CASS_SVG = '<svg class="jersey" viewBox="0 0 32 28" aria-hidden="true"><path d="M5 9l4-5h14l4 5v12l-4 4H9l-4-4z" fill="#ffc93c" stroke="#7a5a10" stroke-width="1.4"/><path d="M9 7h9l-2 4H8z" fill="#fff2b0"/><path d="M12 25l1-6 6-2 4 4" fill="none" stroke="#c98a12" stroke-width="1.2"/></svg>';
const ICONS = { jersey: JERSEY_SVG, polka: POLKA_SVG, cass: CASS_SVG };

function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== 's-' + name);
  $('ui').scrollTop = 0;
  if (name === 'home') renderHome();
  if (name === 'records') renderRecords();
  if (name === 'board') renderBoard();
}
let toastT = null;
function toast(msg) {
  $('toast').textContent = msg;
  $('toast').classList.remove('hidden');
  clearTimeout(toastT);
  toastT = setTimeout(() => $('toast').classList.add('hidden'), 4000);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ns = () => (trainer.connected ? 'real' : 'demo');

// ---------- startscherm ----------
function renderHome() {
  $('p-name').value = P.name;
  $('p-ftp').value = P.ftp;
  $('p-weight').value = P.weight;
  const s = store.stats;
  $('p-level').textContent = `Level ${levelOf(s.xp)} · ${s.km.toFixed(1)} km · ${s.races} races · ${s.wins} gewonnen`;
  $('p-colors').innerHTML = '';
  for (const col of COLORS) {
    const b = document.createElement('button');
    b.style.background = col;
    b.className = col === P.color ? 'sel' : '';
    b.setAttribute('aria-label', 'Kleur ' + col);
    b.onclick = () => { P.color = col; save(); renderHome(); };
    $('p-colors').appendChild(b);
  }
  devStatus();
}
$('p-name').onchange = (e) => { P.name = e.target.value.trim().slice(0, 14) || 'Renner'; save(); };
$('p-weight').onchange = (e) => { P.weight = clamp(Math.round(+e.target.value) || 75, 40, 150); e.target.value = P.weight; save(); };
$('p-ftp').onchange = (e) => { P.ftp = clamp(Math.round(+e.target.value) || 200, 80, 500); e.target.value = P.ftp; save(); };

function devStatus() {
  $('b-trainer').classList.toggle('on', trainer.connected);
  $('st-trainer').textContent = trainer.connected ? `${trainer.name} ✓${trainer.canControl ? ' · weerstand aan' : ''}` : trainer.device ? 'Verbinding kwijt…' : 'Niet verbonden';
  $('b-sterzo').classList.toggle('on', sterzo.connected);
  $('st-sterzo').textContent = sterzo.connected ? `${sterzo.name} ✓` : sterzo.device ? 'Verbinding kwijt…' : 'Niet verbonden';
  $('b-hr').classList.toggle('on', hrm.connected);
  $('st-hr').textContent = hrm.connected ? `${hrm.name} ✓` : hrm.device ? 'Verbinding kwijt…' : 'Niet verbonden';
  const np = pads.filter((p) => p.connected).length;
  $('b-pads').classList.toggle('on', np > 0);
  $('st-pads').textContent = np ? `${np} verbonden ✓ · tik voor nog één` : pads.length ? 'Verbinding kwijt…' : 'Niet verbonden';
  $('b-center').classList.toggle('hidden', !sterzo.connected);
  $('t-pedal').classList.toggle('on', !trainer.connected);
  // Met een Sterzo of Zwift-knoppen zijn de stuurknoppen op het scherm niet nodig.
  const ownSteer = sterzo.connected || pads.some((p) => p.connected);
  $('t-left').classList.toggle('on', !ownSteer); $('t-right').classList.toggle('on', !ownSteer);
  if (!bleSupported()) $('ble-note').textContent = 'Deze browser ondersteunt geen Bluetooth. Gebruik Chrome op Android of Mac (via https). Tot dan: demo-modus met ↑ / Shift / ←→.';
}
trainer.onstatus = sterzo.onstatus = hrm.onstatus = devStatus;
// Meldingen als een apparaat onverwacht wegvalt en weer terugkomt.
function watchDevice(d) {
  d.onlost = () => toast(`${d.label}: verbinding kwijt – opnieuw verbinden…${d instanceof ZwiftPad ? ' (druk op een knop als hij slaapt)' : ''}`);
  d.onback = () => toast(`${d.label} weer verbonden ✓`);
}
[trainer, sterzo, hrm].forEach(watchDevice);
// Zwarte doos: tijdens een rit leggen we elke 5 s lokaal vast waar je was en hoe soepel het liep.
// Stopt de rit netjes (einde, stoppen, pagina sluiten), dan wissen we het. Staat er bij het openen
// nog iets, dan is de vorige rit onverwacht gestopt (bijv. een crash) en tonen we wat er net daarvoor gebeurde.
const BOX = 'wb-blackbox';
let crashed = null, boxT = 0, boxFrames = 0, boxWorst = 0;
try { crashed = JSON.parse(localStorage.getItem(BOX) || 'null'); localStorage.removeItem(BOX); } catch {}
if (crashed && Date.now() - crashed.at > 6 * 3600e3) crashed = null;
function crashText(c) {
  const at = new Date(c.at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return `Vorige rit stopte onverwacht (${at}): ${c.track}, ${(c.dist / 1000).toFixed(2).replace(".", ",")} km, ${c.state}${c.cobble ? ', op de kasseien' : ''} · ${c.fps} fps (traagste beeld ${c.worst} ms)${c.heap ? ` · geheugen ${c.heap} MB` : ''} · ${c.min} min onderweg`;
}
function boxTick(dt) {
  boxFrames++; boxWorst = Math.max(boxWorst, dt);
  if ((boxT += dt) < 5) return;
  try {
    localStorage.setItem(BOX, JSON.stringify({ at: Date.now(), track: race.track.name, dist: Math.round(Math.max(0, race.me.dist)), state: paused ? 'pauze' : race.state,
      cobble: !!race.me.onCobble, fps: Math.round(boxFrames / boxT), worst: Math.round(boxWorst * 1000), min: Math.round((race.time - race.t0) / 60),
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null }));
  } catch {}
  boxT = 0; boxFrames = 0; boxWorst = 0;
}
const boxClear = () => { try { localStorage.removeItem(BOX); } catch {} };
addEventListener('pagehide', boxClear);
if (crashed) setTimeout(() => toast(crashText(crashed)), 800);

$('b-diag').onclick = () => {
  const t = (ms) => new Date(ms).toLocaleTimeString('nl-NL');
  const devs = [trainer, sterzo, hrm, ...pads].filter((d) => d.device);
  const body = devs.length ? devs.map((d) => `<p><b>${esc(d.label)} – ${esc(d.name)}</b> ${d.connected ? '✓ verbonden' : d._wantConnected ? '⚠️ opnieuw verbinden…' : 'losgekoppeld'}</p><div class="diag">${d.log.map(([ms, ev]) => `${t(ms)}  ${esc(ev)}`).join('\n') || '–'}</div>`).join('')
    : '<p class="small">Nog geen apparaten gekoppeld.</p>';
  overlay(`<h2>Verbindingen</h2>${crashed ? `<p class="small">⚠️ ${esc(crashText(crashed))}</p>` : ''}${body}<p class="small">Valt er iets weg, maak dan een schermafbeelding van dit scherm; dan zie ik wat er gebeurde.</p><div class="menu"><button class="big" id="ov-close">Sluiten</button></div>`);
  $('ov-close').onclick = hideOverlay;
};
async function connect(dev, label) {
  audio.unlock();
  if (dev.connected) { dev.disconnect(); dev.device = null; devStatus(); return; }
  if (!bleSupported()) { toast('Bluetooth werkt alleen in Chrome (Android / Mac) via https.'); return; }
  try { await dev.connect(); toast(`${label} verbonden: ${dev.name}`); }
  catch (e) { if (e.name !== 'NotFoundError') toast(`${label}: ${e.message}`); dev.device = null; }
  devStatus();
}
$('b-trainer').onclick = () => connect(trainer, 'Trainer');
$('b-sterzo').onclick = () => connect(sterzo, 'Sterzo');
$('b-hr').onclick = () => connect(hrm, 'Hartslagmeter');
$('b-pads').onclick = async () => {
  audio.unlock();
  if (!bleSupported()) { toast('Bluetooth werkt alleen in Chrome (Android / Mac) via https.'); return; }
  const pad = new ZwiftPad();
  let was = {};
  pad.onpad = (raw) => {
    const a = { ...raw };
    if (P.vshift) {
      if (a.kind === 'click') a.left = a.right = 0; // eerste Click: + en − schakelen in plaats van sturen
    } else if (a.kind !== 'click') {
      a.item = a.item || a.up || a.down; // geen virtueel schakelen: schakelknoppen = power-up
      a.up = a.down = false;
    } else a.up = a.down = false;
    input.setPad(pad, a.left, a.right);
    if (a.item && !was.item) input.trigger('item');
    if (a.bell && !was.bell) input.trigger('bell');
    if (a.up && !was.up) input.trigger('gearUp');
    if (a.down && !was.down) input.trigger('gearDown');
    was = a;
  };
  pad.onstatus = () => { if (!pad.connected) input.setPad(pad, 0, 0); devStatus(); };
  watchDevice(pad);
  try {
    await pad.connect();
    if (pads.some((p) => p.device?.id === pad.device.id)) { toast('Deze knop was al gekoppeld'); return; }
    pads.push(pad);
    toast(`Zwift-knop verbonden: ${pad.name}. Druk op een knop om te testen.`);
  } catch (e) { if (e.name !== 'NotFoundError') toast('Zwift-knoppen: ' + e.message); }
  devStatus();
};
$('b-fs').onclick = $('h-fs').onclick = () => toggleFullscreen();
$('b-center').onclick = () => { sterzo.calibrate(); toast('Stuur staat nu recht'); };

for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => show(b.dataset.go);
$('b-records').onclick = () => show('records');
$('b-board').onclick = () => show('board');
$('b-help').onclick = () => show('help');
$('b-settings').onclick = () => {
  $('p-feel').value = P.trainerFeel; $('p-feel-v').textContent = P.trainerFeel + '%';
  $('p-vshift').checked = P.vshift; $('p-music').checked = P.music; $('p-sfx').checked = P.sfx;
  show('settings');
};
$('p-feel').oninput = (e) => { P.trainerFeel = +e.target.value; $('p-feel-v').textContent = P.trainerFeel + '%'; save(); };
for (const k of ['vshift', 'music', 'sfx']) $('p-' + k).onchange = (e) => { P[k] = e.target.checked; save(); audio.setOptions(P.music, P.sfx); };
audio.setOptions(P.music, P.sfx);
$('help-items').innerHTML = Object.values(ITEMS).map((i) => `<div>${i.icon} <b>${i.name}</b> – ${i.hint}</div>`).join('');

// ---------- race-instellingen / lobby ----------
function drawProfile(cv, track, dots) {
  const c = cv.getContext('2d'), w = cv.width, h = cv.height;
  c.clearRect(0, 0, w, h);
  let lo = 1e9, hi = -1e9;
  for (const s of track.segs) { lo = Math.min(lo, s.y1); hi = Math.max(hi, s.y1); }
  const span = Math.max(12, hi - lo);
  const Y = (y) => h - 5 - ((y - lo) / span) * (h - 14);
  for (let i = 0; i < track.n; i++) {
    const s = track.segs[i], x = (i / track.n) * w;
    c.fillStyle = s.zone === 'sprint' ? '#39ffb0' : s.zone === 'climb' ? (s.cobble ? '#c9631a' : '#ff7b1c') : s.cobble ? '#b8b0c8' : '#7a5cff';
    c.fillRect(x, Y(s.y1), w / track.n + 1, h);
  }
  if (dots) dots.Y = Y;
}

function renderSetup() {
  const lobby = !!room, canEdit = !room || room.isHost;
  const tr_ = sel.mode === 'training', wk_ = sel.mode === 'workout';
  if (lobby) sel.wkMode = 'game'; // samen een workout = altijd de Game-modus
  $('setup-title').textContent = lobby ? 'Kamer' : tr_ ? 'Training' : wk_ ? 'Workout' : 'Solo race';
  $('m-race').classList.toggle('sel', !tr_ && !wk_); $('m-training').classList.toggle('sel', tr_); $('m-workout').classList.toggle('sel', wk_);
  $('m-race').disabled = $('m-training').disabled = !canEdit;
  $('m-workout').disabled = !canEdit;
  $('tracks').classList.toggle('hidden', tr_); $('plan-box').classList.toggle('hidden', !tr_);
  $('wk-box').classList.toggle('hidden', !wk_);
  $('o-laps-l').classList.toggle('hidden', tr_ || wk_);
  if (wk_) renderWorkouts();
  renderPlan(canEdit);
  $('lobby-box').classList.toggle('hidden', !lobby);
  if (lobby) {
    $('room-code').textContent = room.code;
    $('players').innerHTML = room.players.map((p) => `<span style="border-color:${esc(p.color)}">${esc(p.name)}${p.id === room.me.id ? ' (jij)' : ''}</span>`).join('');
    $('lobby-note').textContent = room.isHost ? 'Deel de code met je vrienden. Lege plekken kun je vullen met bots.' : 'Wacht tot de host start…';
  }
  $('tracks').innerHTML = '';
  for (const d of TRACK_DEFS) {
    const tr = getTrack(d.id);
    const b = document.createElement('button');
    b.className = 'track' + (sel.track === d.id ? ' sel' : '');
    b.disabled = !canEdit;
    const pr = getTime(ns(), `${d.id}|race|${sel.laps}`);
    b.innerHTML = `<b>${d.name}</b><canvas width="300" height="54"></canvas><span>${(tr.length / 1000).toFixed(1)} km · ${Math.round(tr.climbTotal)} hm per ronde</span><span class="small">${d.desc}</span><span class="pr">${pr ? '🏆 PR ' + fmtTime(pr) : 'Nog geen PR'}</span>`;
    b.onclick = () => { sel.track = d.id; pushSettings(); };
    $('tracks').appendChild(b);
    drawProfile(b.querySelector('canvas'), tr);
  }
  const maxBots = lobby ? Math.max(0, 6 - room.players.length) : 5;
  $('o-botson').checked = sel.botsOn && maxBots > 0;
  $('o-botson').disabled = !canEdit || maxBots === 0;
  for (const o of $('o-bots').options) o.disabled = +o.value > maxBots;
  const game = wk_ && sel.wkMode === 'game';
  const botsShown = wk_ ? game : $('o-botson').checked; // bij een workout horen bots bij de Game-modus
  $('o-botson').parentElement.classList.toggle('hidden', wk_);
  $('o-bots-l').classList.toggle('hidden', !botsShown);
  $('o-diff-l').classList.toggle('hidden', !botsShown);
  $('o-fair').parentElement.classList.toggle('hidden', wk_); // een workout-game is altijd eerlijk (t.o.v. FTP)
  $('o-rubber').parentElement.classList.toggle('hidden', wk_ && !game);
  $('o-fair-note').classList.toggle('hidden', wk_);
  document.querySelector('.ghosts').classList.toggle('hidden', wk_);
  $('o-erg').checked = store.wkErg ?? true; // ERG is een eigen keuze, ook in een kamer
  // Stuurhulp alleen bij rustig rijden (workout Ride, solo training). In races en multiplayer stuurt iedereen zelf.
  const assistOk = (wk_ && sel.wkMode === 'ride') || (tr_ && !lobby);
  $('o-assist-wk-l').classList.toggle('hidden', !(wk_ && sel.wkMode === 'ride'));
  $('o-assist-tr-l').classList.toggle('hidden', !(tr_ && !lobby));
  $('o-assist-wk').checked = $('o-assist-tr').checked = !!P.assist;
  const steers = !(wk_ && sel.wkMode === 'zen') && !(assistOk && P.assist);
  const hasWheel = sterzo.connected || pads.some((d) => d.connected);
  $('o-steer-note').textContent = steers && !hasWheel ? '🎮 Geen stuur gekoppeld: je stuurt met ← → of met de knoppen op het scherm. In bochten word je naar buiten geduwd als je niet stuurt.' : '';
  for (const b of $('wk-modes').children) { b.classList.toggle('sel', b.dataset.m === sel.wkMode); b.setAttribute('aria-checked', b.dataset.m === sel.wkMode); b.disabled = !canEdit || (lobby && b.dataset.m !== 'game'); }
  $('wk-mode-note').textContent = { zen: 'Zen: geen wereld, alleen je klok, wattages en grafiek.', ride: 'Ride: alleen op de baan, zonder bots en power-ups.',
    game: 'Game: samen (of met bots) dezelfde workout, ieder op zijn eigen FTP, met power-ups. Alles in het spel raakt alleen je snelheid; je trainer doet gewoon de workout. Je snelheid volgt hoe goed je je doel haalt. De race eindigt na het laatste zware blok (🏁).' }[sel.wkMode];
  $('tracks').classList.toggle('hidden', tr_ || (wk_ && sel.wkMode === 'zen')); // zen: geen baan te kiezen
  $('wk-track-note').classList.toggle('hidden', sel.wkMode === 'zen');
  $('wk-import').parentElement.classList.toggle('hidden', !canEdit);
  $('o-fair-note').textContent = sel.fair ? 'Iedereen die op zijn eigen FTP rijdt is even snel.' : 'Uit: snelheid volgt je watt per kilo (vul je gewicht in bij Renner).';
  $('o-laps').value = sel.laps; $('o-bots').value = Math.max(1, Math.min(sel.bots, maxBots || 1)); $('o-diff').value = sel.diff; $('o-fair').checked = sel.fair;
  $('o-ghost').checked = P.ghostRace; $('o-ghost-lap').checked = P.ghostLap; $('o-ghost-seg').checked = P.ghostSeg;
  $('o-rubber').checked = !!sel.rubber;
  for (const id of ['o-laps', 'o-bots', 'o-diff', 'o-fair', 'o-rubber']) $(id).disabled = !canEdit;
  $('o-ghost-l').classList.toggle('hidden', tr_); // een training heeft geen race-PR
  $('b-start').classList.toggle('hidden', !canEdit);
  $('b-back').textContent = lobby ? '← Kamer verlaten' : '← Terug';
}
function renderPlan(canEdit) {
  const dis = canEdit ? '' : ' disabled';
  $('plan').innerHTML = sel.plan.map((st, i) => `<div class="stage"><b>Etappe ${i + 1}</b>
    <select data-i="${i}" data-k="track" aria-label="Baan etappe ${i + 1}"${dis}>${TRACK_DEFS.map((d) => `<option value="${d.id}"${d.id === st.track ? ' selected' : ''}>${d.name}</option>`).join('')}</select>
    <select class="n" data-i="${i}" data-k="laps" aria-label="Rondes etappe ${i + 1}"${dis}>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${n === st.laps ? ' selected' : ''}>${n} ronde${n > 1 ? 's' : ''}</option>`).join('')}</select>
    <button class="ghost" data-del="${i}" aria-label="Etappe ${i + 1} verwijderen"${canEdit && sel.plan.length > 1 ? '' : ' disabled'}>✕</button></div>`).join('');
  $('t-warm').checked = sel.warm; $('t-cool').checked = sel.cool;
  $('t-warm').disabled = $('t-cool').disabled = $('t-add').disabled = !canEdit;
  $('t-add').classList.toggle('hidden', !canEdit || sel.plan.length >= 8);
  let km = 0, hm = 0;
  for (const st of sel.plan) { const t = getTrack(st.track); km += (t.length * st.laps) / 1000; hm += t.climbTotal * st.laps; }
  const extra = ((sel.warm ? 1 : 0) + (sel.cool ? 1 : 0)) * Math.round(WARM_SECS / 60);
  $('plan-sum').textContent = `${sel.plan.length} etappe${sel.plan.length > 1 ? 's' : ''} · ${km.toFixed(1)} km · ${Math.round(hm)} hm${extra ? ` · plus ${extra} min in- en uitrijden` : ''}. Tussen de etappes rijd je door een teleportboog.`;
}
function planChanged() {
  store.training = { plan: sel.plan, warm: sel.warm, cool: sel.cool };
  save();
  pushSettings();
}
$('plan').onchange = (e) => {
  const el = e.target, st = sel.plan[+el.dataset.i];
  if (!st) return;
  if (el.dataset.k === 'track') st.track = el.value; else st.laps = +el.value;
  planChanged();
};
$('plan').onclick = (e) => {
  const d = e.target.closest('[data-del]');
  if (!d || sel.plan.length < 2) return;
  sel.plan.splice(+d.dataset.del, 1);
  planChanged();
};
$('t-add').onclick = () => { if (sel.plan.length < 8) { sel.plan.push({ track: TRACK_DEFS[sel.plan.length % TRACK_DEFS.length].id, laps: 1 }); planChanged(); } };
$('t-warm').onchange = (e) => { sel.warm = e.target.checked; planChanged(); };
$('t-cool').onchange = (e) => { sel.cool = e.target.checked; planChanged(); };
$('m-race').onclick = () => { sel.mode = 'race'; pushSettings(); };
$('m-training').onclick = () => { sel.mode = 'training'; pushSettings(); };
$('m-workout').onclick = () => { sel.mode = 'workout'; pushSettings(); };
$('o-erg').onchange = (e) => { store.wkErg = e.target.checked; save(); };
for (const id of ['o-assist-wk', 'o-assist-tr']) $(id).onchange = (e) => { P.assist = e.target.checked; save(); renderSetup(); };
$('wk-modes').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b || b.disabled) return; sel.wkMode = store.wkMode = b.dataset.m; save(); pushSettings(); };

// ---------- workouts kiezen en importeren ----------
// Workout als staafjes in zonekleuren (kaartje, HUD-grafiek en nabespreking).
function drawWorkout(cv, w, o = {}) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height, pad = o.pad ?? 0, top = o.top ?? 2, base = H - (o.bottom ?? 0);
  const ftp = P.ftp, maxF = Math.max(1.3, ...w.blocks.map((b) => (b.a == null ? 0 : Math.max(b.a, b.b) * (w.unit === 'w' ? 1 / ftp : 1)))) * 1.05;
  const x = (t) => pad + (t / w.total) * (W - 2 * pad), y = (f) => base - (f / maxF) * (base - top);
  c.clearRect(0, 0, W, H);
  for (const b of w.blocks) {
    const n = b.a === b.b || b.a == null ? 1 : Math.max(2, Math.round((x(b.t0 + b.dur) - x(b.t0)) / 4));
    for (let i = 0; i < n; i++) {
      const t0 = b.t0 + (b.dur * i) / n, t1 = b.t0 + (b.dur * (i + 1)) / n;
      const f = b.a == null ? 0.5 : (b.a + ((b.b - b.a) * (i + 0.5)) / n) * (w.unit === 'w' ? 1 / ftp : 1);
      c.fillStyle = b.a == null ? '#5b5675' : zoneColor(f);
      c.globalAlpha = o.now != null && t1 <= o.now ? 0.32 : 0.92;
      c.fillRect(x(t0), y(f), x(t1) - x(t0) + 0.6, base - y(f));
    }
  }
  c.globalAlpha = 1;
  if (o.ftpLine) { c.setLineDash([8, 8]); c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 2; c.beginPath(); c.moveTo(pad, y(1)); c.lineTo(W - pad, y(1)); c.stroke(); c.setLineDash([]); }
  if (o.log?.length) { // gereden vermogen
    c.strokeStyle = '#fff'; c.lineWidth = o.line || 2.5; c.beginPath();
    let k = 0, acc = 0, n = 0;
    o.log.forEach((e, i) => { acc += e.p; n++; if (n >= (o.avg || 5) || i === o.log.length - 1) { const px = x(e.t), py = y(acc / n / ftp); if (k++) c.lineTo(px, py); else c.moveTo(px, py); acc = 0; n = 0; } });
    c.stroke();
  }
  if (o.finish && o.finish < w.total - 1) { // 🏁 waar de race eindigt (Game-modus)
    const fx = x(o.finish), sq = Math.max(3, Math.round((base - top) / 14));
    for (let k = 0; top + k * sq < base; k++) { c.fillStyle = k % 2 ? '#fff' : '#111'; c.fillRect(fx - sq / 2, top + k * sq, sq, sq); }
    c.font = `${Math.max(12, (base - top) * 0.32)}px sans-serif`; c.textAlign = 'center'; c.fillText('🏁', fx, Math.max(12, top + (base - top) * 0.3)); c.textAlign = 'start';
  }
  if (o.now != null) { c.fillStyle = '#fff'; c.fillRect(x(o.now) - 2, top - 6, 4, base - top + 6); c.beginPath(); c.moveTo(x(o.now) - 9, top - 12); c.lineTo(x(o.now) + 9, top - 12); c.lineTo(x(o.now), top - 1); c.fill(); }
}
function renderWorkouts() {
  const guest = room && !room.isHost;
  const list = guest ? (sel.wkObj ? [sel.wkObj] : []) : allWorkouts();
  if (!guest && !list.some((w) => w.id === sel.wk)) sel.wk = list[0].id;
  if (guest && !list.length) { $('wk-list').innerHTML = '<p class="small">De host kiest nog een workout…</p>'; return; }
  const game = sel.wkMode === 'game';
  $('wk-list').innerHTML = list.map((w) => `<button class="wk-card${w.id === sel.wk ? ' sel' : ''}" data-id="${esc(w.id)}"><b>${esc(w.name)}</b><canvas width="420" height="80"></canvas>
    <span>${clock(w.total)} · TSS ${Math.round(plannedTss(w, P.ftp))}${w.unit === 'w' ? ' · vaste watts' : ''}${game ? ` · 🏁 na ${clock(raceEnd(w, P.ftp).t)}` : ''}</span>${w.desc ? `<span>${esc(w.desc).slice(0, 90)}</span>` : ''}
    ${w.id.startsWith('u-') ? `<span class="ghost del" data-del="${esc(w.id)}" role="button" aria-label="${esc(w.name)} verwijderen">✕</span>` : ''}</button>`).join('');
  [...$('wk-list').querySelectorAll('canvas')].forEach((cv, i) => drawWorkout(cv, list[i], game ? { finish: raceEnd(list[i], P.ftp).t } : {}));
}
$('wk-list').onclick = (e) => {
  const d = e.target.closest('[data-del]');
  if (d) {
    const w = myWorkouts.find((x) => x.id === d.dataset.del);
    myWorkouts = myWorkouts.filter((x) => x.id !== d.dataset.del); saveWorkouts(myWorkouts);
    toast(`${w?.name || 'Workout'} verwijderd`); renderWorkouts(); return;
  }
  const c = e.target.closest('.wk-card');
  if (c && !(room && !room.isHost)) { sel.wk = store.wkSel = c.dataset.id; save(); pushSettings(); }
};
async function importFiles(files) {
  const ok = [], bad = [];
  for (const f of files) {
    try {
      if (f.size > 2e6) throw new Error('bestand is te groot');
      const w = parseWorkout(await f.text(), f.name);
      w.id = 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); w.added = Date.now();
      myWorkouts.push(w); ok.push(w);
    } catch (err) { bad.push(`${f.name}: ${err.message}`); }
  }
  if (ok.length && !saveWorkouts(myWorkouts)) bad.push('Opslaan lukte niet (opslag vol?)');
  if (ok.length) { sel.wk = store.wkSel = ok[ok.length - 1].id; save(); }
  $('wk-msg').textContent = [ok.length ? `✓ ${ok.map((w) => `${w.name} (${clock(w.total)})`).join(', ')} toegevoegd` : '', ...bad].filter(Boolean).join(' · ');
  renderWorkouts();
}
$('wk-import').onclick = () => $('wk-file').click();
$('wk-file').onchange = (e) => { importFiles([...e.target.files]); e.target.value = ''; };
for (const ev of ['dragenter', 'dragover']) $('wk-box').addEventListener(ev, (e) => { e.preventDefault(); $('wk-box').classList.add('drop'); });
$('wk-box').addEventListener('dragleave', () => $('wk-box').classList.remove('drop'));
$('wk-box').addEventListener('drop', (e) => { e.preventDefault(); $('wk-box').classList.remove('drop'); importFiles([...e.dataTransfer.files]); });
function pushSettings() {
  if (room?.isHost) {
    const w = sel.mode === 'workout' ? allWorkouts().find((x) => x.id === sel.wk) : null;
    sel.wkObj = w ? JSON.parse(JSON.stringify(w)) : null;
    room.setSettings({ ...sel });
  }
  renderSetup();
}
$('o-laps').onchange = (e) => { sel.laps = +e.target.value; pushSettings(); };
$('o-bots').onchange = (e) => { sel.bots = +e.target.value; pushSettings(); };
$('o-botson').onchange = (e) => { sel.botsOn = e.target.checked; pushSettings(); };
$('o-diff').onchange = (e) => { sel.diff = e.target.value; pushSettings(); };
$('o-rubber').onchange = (e) => { sel.rubber = e.target.checked; pushSettings(); };
$('o-fair').onchange = (e) => { sel.fair = e.target.checked; if (!room) { P.fair = sel.fair; save(); } pushSettings(); };
for (const [id, k] of [['o-ghost', 'ghostRace'], ['o-ghost-lap', 'ghostLap'], ['o-ghost-seg', 'ghostSeg']]) $(id).onchange = (e) => { P[k] = e.target.checked; save(); };
$('b-solo').onclick = () => { audio.unlock(); show('setup'); renderSetup(); };
$('b-back').onclick = () => { leaveRoom(); show('home'); };
$('b-start').onclick = () => {
  audio.unlock();
  const roster = room ? room.players.map((p) => ({ id: p.id, name: p.name, color: p.color })) : [{ id: 'p0', name: P.name, color: P.color }];
  const nb = (sel.mode === 'workout' ? sel.wkMode === 'game' && sel.botsOn : sel.botsOn) ? Math.min(sel.bots, 6 - roster.length) : 0;
  const used = new Set(roster.map((p) => p.color));
  const free = COLORS.filter((c) => !used.has(c));
  const off = Math.floor(Math.random() * BOT_NAMES.length);
  const bots = Array.from({ length: nb }, (_, i) => ({
    id: 'b' + i, name: BOT_NAMES[(off + i) % BOT_NAMES.length], color: free[i % Math.max(1, free.length)] || COLORS[i],
    skill: nb > 1 ? i / (nb - 1) : 0.6,
  }));
  const cfg = { track: sel.track, laps: sel.laps, diff: sel.diff, fair: sel.fair, rubber: !!sel.rubber, seed: (Math.random() * 1e9) | 0, roster, bots };
  if (sel.mode === 'training') Object.assign(cfg, { plan: sel.plan.map((s) => ({ track: s.track, laps: s.laps })), warm: sel.warm, cool: sel.cool });
  if (sel.mode === 'workout') {
    const w = allWorkouts().find((x) => x.id === sel.wk) || BUILTIN[0], mode = room ? 'game' : sel.wkMode;
    Object.assign(cfg, { workout: JSON.parse(JSON.stringify(w)), wkMode: mode, wgame: mode === 'game', zen: mode === 'zen', fair: true, laps: 999,
      rubber: mode === 'game' && !!sel.rubber, track: mode === 'zen' ? 'polder' : sel.track, wkFinish: mode === 'game' ? raceEnd(w, P.ftp).t : 0 });
  }
  room?.start(cfg);
  startRace(cfg);
};

// ---------- multiplayer ----------
function leaveRoom() {
  if (room) { room.onClosed = () => {}; room.close(); room = null; }
}
function wireRoom() {
  room.onRoster = () => { if (!race) renderSetup(); shareBoard(); };
  room.onSettings = (s) => { Object.assign(sel, s); if (!race) renderSetup(); };
  room.onStart = (cfg) => startRace(cfg);
  room.onGame = (m) => { if (m.t === 'board') { mergeEntry(m.e); return; } if (m.t === 'left') training?.gone.add(m.id); race?.onNet(m); };
  // De host gaat terug naar de kamer: wie nog rijdt rijdt uit, wie de uitslag bekijkt houdt die in beeld.
  room.onLobby = () => {
    if (race && !race.free) {
      lobbyReady = true;
      if (race.state === 'done') rerenderResults?.();
      else toast('De host is terug in de kamer – rij je race gerust uit');
      return;
    }
    endRace(); show('setup'); renderSetup();
  };
  // Kamer weg (bijv. de host is vertrokken): uitslag blijft staan, en een lopende rit kun je uitrijden (en opslaan).
  room.onClosed = (why) => {
    room = null;
    if (race) {
      race.room = null;
      toast(race.state === 'done' ? (why || 'Verbinding verbroken') : `${why || 'Verbinding verbroken'} – je kunt je rit uitrijden`);
      if (race.state === 'done') rerenderResults?.();
      return;
    }
    endRace(); show('home'); toast(why || 'Verbinding verbroken');
  };
}
$('b-host').onclick = async () => {
  audio.unlock();
  $('b-host').disabled = true;
  room = new Room(makeCode(), true, { name: P.name, color: P.color });
  try {
    await room.open();
    wireRoom();
    room.setSettings({ ...sel });
    show('setup'); renderSetup();
  } catch (e) { room = null; toast('Kamer maken mislukt: ' + e.message); }
  $('b-host').disabled = false;
};
$('b-join').onclick = () => { audio.unlock(); $('j-msg').textContent = ''; show('join'); $('j-code').focus(); };
$('b-dojoin').onclick = async () => {
  const code = $('j-code').value.trim().toUpperCase();
  if (code.length !== 4) { $('j-msg').textContent = 'Vul de 4 letters van de kamercode in.'; return; }
  $('j-msg').textContent = 'Verbinden…';
  $('b-dojoin').disabled = true;
  room = new Room(code, false, { name: P.name, color: P.color });
  wireRoom();
  const r = room;
  r.onClosed = () => {};
  try {
    await r.open();
    wireRoom();
    show('setup'); renderSetup();
  } catch (e) { r.close(); room = null; $('j-msg').textContent = e.message; }
  $('b-dojoin').disabled = false;
};
$('b-copy').onclick = async () => {
  const url = HOSTED ? room.code : `${location.origin}${location.pathname}?join=${room.code}`;
  try { await navigator.clipboard.writeText(url); toast('Link gekopieerd'); } catch (e) { toast(url); }
};

// ---------- klassement ----------
// Stuurt mijn tijden (en wat ik van anderen weet) naar de kamer, rustig één voor één.
let boardTimer = null;
function shareBoard() {
  if (!room) return;
  clearInterval(boardTimer);
  const list = entriesToShare();
  boardTimer = setInterval(() => {
    const e = list.shift();
    if (!e || !room) { clearInterval(boardTimer); return; }
    room.send({ t: 'board', e });
  }, 450);
}
function renderBoard() {
  const keys = boardKeys();
  $('board').innerHTML = TRACK_DEFS.map((d) => `<div class="card board"><h2>${d.name}</h2>${keys.filter((k) => k.track === d.id).map((k) => {
    const rows = boardRows(k.key).slice(0, 8);
    return `<h3>${esc(k.label)}</h3>` + (rows.length ? '<table>' + rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}${r.me ? ' (jij)' : ''}</td><td>${fmtTime(r.t, 2)}</td></tr>`).join('') + '</table>' : '<p class="small">Nog geen tijden.</p>');
  }).join('')}</div>`).join('');
}

// ---------- records ----------
function renderRecords() {
  const n = $('r-ns').value;
  const book = store.pr[n];
  let html = '';
  for (const d of TRACK_DEFS) {
    const tr = getTrack(d.id);
    const rows = [];
    for (const l of [1, 2, 3, 5]) { const t = book[`${d.id}|race|${l}`]?.t; if (t) rows.push([`Race · ${l} ronde${l > 1 ? 's' : ''}`, t]); }
    const lap = book[`${d.id}|lap`]?.t; if (lap) rows.push(['Snelste ronde', lap]);
    for (const z of tr.zones) { const t = book[`${d.id}|seg|${z.id}`]?.t; if (t) rows.push([({ sprint: '⚡ ', climb: '⛰️ ', cobble: '🪨 ' }[z.type] || '') + z.name, t]); }
    html += `<div class="card"><h2>${d.name}</h2>${rows.length ? '<table>' + rows.map(([a, t]) => `<tr><td>${a}</td><td>${fmtTime(t, 2)}</td></tr>`).join('') + '</table>' : '<p class="small">Nog geen tijden.</p>'}</div>`;
  }
  const pw = store.power, names = { 5: '5 seconden', 60: '1 minuut', 300: '5 minuten' };
  const prow = Object.keys(names).filter((k) => pw[k]).map((k) => `<tr><td>${names[k]}</td><td>${pw[k].w} W</td></tr>`).join('');
  html += `<div class="card"><h2>Vermogen (trainer)</h2>${prow ? '<table>' + prow + '</table>' : '<p class="small">Rijd een race met je trainer voor vermogensrecords.</p>'}</div>`;
  $('records').innerHTML = html;
}
$('r-ns').onchange = renderRecords;

// ---------- race ----------
const banners = [];
let bannerT = 0, wake = null;
function emit(type, data) {
  switch (type) {
    case 'count': popCount(data); audio.sfx('count'); break;
    case 'go': popCount('GO!'); audio.sfx('go'); break;
    case 'banner': if (banners.length < 3) banners.push(data); break;
    case 'sfx': audio.sfx(data); break;
    case 'shake': renderer.shake = Math.max(renderer.shake, data); break;
    case 'flash': renderer.flash = { color: data, a: 1 }; break;
    case 'stage': if (wk) finishWorkout(); else nextStage(); break;
    case 'finish': {
      audio.sfx('finish'); renderer.party();
      const r = race;
      if (wk?.game) { // workout-game: finish na het laatste zware blok; de uitslag volgt na de cooling-down
        banners.push({ text: `🏁 FINISH! ${r.me.rank}e plaats`, sub: 'nu rustig uitrijden · de uitslag volgt na je workout', color: '#ffd166' });
        break;
      }
      // Na de laatste etappe eerst nog uitrijden; de uitslag komt daarna.
      if (training && training.stages[training.idx + 1]?.kind === 'cool') {
        banners.push({ text: r.riders.length > 1 ? `🏁 ${r.me.rank}e plaats!` : '🏁 Finish!', sub: fmtTime(r.me.finishTime, 2), color: '#ffd166' });
        setTimeout(() => { if (race === r) nextStage(); }, 3500);
      } else setTimeout(showResults, 1800);
      break;
    }
  }
}
function popCount(v) {
  const el = $('h-count');
  el.textContent = v;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}

function getPower(dt) {
  if (trainer.connected) {
    const stale = performance.now() - trainer.lastData > 3000;
    return { power: stale ? 0 : trainer.power, cadence: stale ? 0 : trainer.cadence, hr: hrm.value };
  }
  if (wk && race?.state === 'race') { // demo-workout: het vermogen volgt vanzelf het doel
    const tg = wkTarget() ?? P.ftp * 0.6, s = performance.now() / 1000;
    wk.demo = (wk.demo ?? tg) + (tg * (1 + 0.025 * Math.sin(s * 1.3) + 0.015 * Math.sin(s * 0.37)) - (wk.demo ?? tg)) * Math.min(1, dt * 1.5);
    return { power: wk.demo, cadence: 88 + 4 * Math.sin(s / 3), hr: hrm.value };
  }
  const p = input.demoPower(dt, P.ftp);
  return { power: p, cadence: p > 20 ? 60 + (p / P.ftp) * 28 : 0, hr: hrm.value };
}
// Muziek: vertel de muziekmotor wat er gebeurt (sprint, klim, kasseien, laatste ronde, workoutblok, opbouw).
function musicState() {
  const r = race, me = r.me, az = r.activeZone?.zone?.type;
  const st = {
    intensity: me.power / (P.ftp * 1.5),
    zone: me.onCobble || me.inGutter ? 'cobble' : az === 'sprint' || az === 'climb' ? az : null,
    lastLap: r.laps > 1 && r.laps < 900 && !me.finished && Math.floor(Math.max(0, me.dist) / r.L) === r.laps - 1,
    finale: false, wkLevel: null, wkFree: false, riser: 0,
    done: r.state === 'done' && !(wk && !wk.ended),
  };
  if (wk && !wk.ended) {
    const p = wkAt(wk.w, wkTime());
    if (p.done) st.done = true;
    else {
      const f = blockFrac(wk.w, p.b, P.ftp), nx = p.next[0];
      st.wkLevel = f; st.wkFree = f == null;
      st.finale = wk.game && p.i === wk.finalIdx && !me.finished;
      // opbouw in de laatste 4 seconden vóór een zwaarder blok
      if (nx && p.left <= 4 && (blockFrac(wk.w, nx, P.ftp) ?? 0.6) > (f ?? 0.6) + 0.1) st.riser = p.left;
    }
  }
  audio.setState(st);
}

// ---------- workout tijdens de rit ----------
const wkTime = () => (race ? Math.max(0, race.time - race.t0 + race.wkOffset) : 0);
function wkTarget() { if (!wk || !race || wk.ended) return null; const p = wkAt(wk.w, wkTime()); return p.done ? null : targetW(wk.w, p.b, p.tIn, P.ftp, wk.bias); }
// Elke frame: piepjes bij de blokwissel, gemiddeld vermogen en een logregel per seconde.
function wkTick(dt) {
  if (!wk || wk.ended || paused || !(race.state === 'race' || (wk.game && race.state === 'done'))) return;
  const t = wkTime(), p = wkAt(wk.w, t), me = race.me;
  wk.p3 += (me.power - wk.p3) * Math.min(1, dt / 1.5); // ~3 s gemiddeld
  if (p.i !== wk.bi) {
    if (wk.bi >= 0) { audio.sfx('zone'); wk.flash = 1; }
    wk.bi = p.i; wk.beep = 4;
    if (wk.game && p.i === wk.finalIdx && !race.me.finished) banners.push({ text: '🏁 FINALE!', sub: 'laatste zware blok · aan het eind ligt de streep', color: '#ff3fa4' });
  }
  const l = Math.ceil(p.left);
  if (l <= 3 && l >= 1 && l < wk.beep && p.i < wk.w.blocks.length - 1) { wk.beep = l; audio.sfx('count'); }
  const sec = Math.floor(t);
  if (sec > wk.sec) { wk.sec = sec; wk.log.push({ t: sec, p: Math.round(me.power), tgt: targetW(wk.w, p.b, p.tIn, P.ftp, wk.bias), hr: me.hr || 0, cad: Math.round(me.cadence), bi: p.i }); }
}
function wkBias(d) {
  wk.bias = clamp(Math.round((wk.bias + d) * 100) / 100, -0.3, 0.3);
  audio.sfx('tick'); toast(wk.bias ? `Doel ${wk.bias > 0 ? '+' : ''}${Math.round(wk.bias * 100)}%` : 'Doel weer zoals gepland');
}
function wkErg() {
  if (!wk) return;
  wk.erg = !wk.erg;
  toast(wk.erg ? 'ERG aan: de trainer houdt het doel vast' : 'ERG uit: je voelt weer de helling');
}
// Knoppen op het scherm (reageren meteen, ook als er al een vinger op TRAP staat). Overslaan vraagt een tweede tik.
let skipArm = 0;
$('wk-easy').addEventListener('pointerdown', (e) => { e.preventDefault(); if (wk) wkBias(-0.05); });
$('wk-hard').addEventListener('pointerdown', (e) => { e.preventDefault(); if (wk) wkBias(0.05); });
$('wk-skip').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const b = $('wk-skip');
  if (performance.now() < skipArm) { skipArm = 0; b.classList.remove('confirm'); b.textContent = '⏭'; wkSkip(); return; }
  skipArm = performance.now() + 3000; b.classList.add('confirm'); b.textContent = 'Zeker? ⏭';
  setTimeout(() => { if (performance.now() >= skipArm) { b.classList.remove('confirm'); b.textContent = '⏭'; } }, 3100);
});
function wkSkip() {
  if (!wk || !race || race.state !== 'race') return;
  if (room) { toast('In een kamer rijdt iedereen tegelijk: overslaan kan niet'); return; }
  const p = wkAt(wk.w, wkTime());
  if (p.done) return;
  race.wkOffset += p.left + 0.01;
  toast(`${blockName(p.b)} overgeslagen`);
}
function wkHud() {
  const r = race, me = r.me, w = wk.w, t = Math.min(w.total, wkTime()), p = wkAt(w, t), b = p.b;
  const tg = p.done ? null : targetW(w, b, p.tIn, P.ftp, wk.bias), f = blockFrac(w, b, P.ftp);
  const bias = wk.bias ? ` (${wk.bias > 0 ? '+' : ''}${Math.round(wk.bias * 100)}%)` : '';
  setText($('wk-blk'), `${blockName(b).toUpperCase()}${f != null ? ` · ${w.unit === 'w' ? Math.round((b.a + b.b) / 2) + ' W' : Math.round(f * 100) + '% FTP'}` : ''}${bias}${wk.erg && tg != null && trainer.connected ? '' : tg != null && trainer.connected ? ' · ERG uit' : ''}`);
  const cue = cueAt(w, t);
  setText($('wk-cue'), cue ? cue.text : b.a == null ? 'Vrij rijden: trap wat je wilt' : b.cad ? `Cadans rond de ${b.cad}` : '');
  setText($('wk-cd'), clock(p.left));
  $('wk-bar').style.width = `${(p.tIn / b.dur) * 100}%`;
  const pw = Math.round(wk.p3), now = $('wk-now');
  setHTML(now, `${pw}<small>W</small>`);
  const dev = tg ? pw / tg - 1 : 0;
  now.className = tg == null ? 'free' : Math.abs(dev) <= 0.05 ? '' : dev < 0 ? 'low' : 'high';
  setHTML($('wk-tgt'), tg == null ? '–' : `${tg}<small>W</small>`);
  setText($('wk-tgt-l'), `DOEL${bias}`);
  $('wk-c').classList.toggle('free', tg == null);
  if (wk.zen && wk.zc !== p.i) { wk.zc = p.i; $('zen-bg').style.setProperty('--zc', b.a == null ? '#5b5675' : zoneColor(f)); } // zen: achtergrond gloeit in de zonekleur
  $('wk-gauge').style.left = `${clamp(50 + (dev / 0.4) * 100, 0, 100)}%`;
  const cad = Math.round(me.cadence);
  setHTML($('wk-cad'), b.cad && Math.abs(cad - b.cad) > 8 ? `<span class="warn">${cad}</span>` : String(cad));
  setText($('wk-hr'), me.hr ? me.hr : '–');
  setText($('wk-tot1'), `WORKOUT · ${clock(t)} / ${clock(w.total)}`);
  setText($('wk-tot2'), `nog ${clock(w.total - t)}`);
  setHTML($('wk-next'), p.next.map((n, i) => { const nt = targetW(w, n, 0, P.ftp, wk.bias), nt2 = targetW(w, n, n.dur, P.ftp, wk.bias);
    return `<div><i style="background:${zoneColor(blockFrac(w, n, P.ftp))}"></i>${i ? 'dan' : 'straks'} ${esc(blockName(n).toLowerCase())} · ${clock(n.dur)}${nt == null ? '' : ` · ${nt === nt2 ? nt : nt + '→' + nt2} W`}</div>`; }).join(''));
  if (performance.now() - (wk.chartAt || 0) > 500) { wk.chartAt = performance.now(); drawWorkout($('wk-chart'), w, { pad: 14, top: 18, bottom: 6, now: t, log: wk.log, ftpLine: true, line: 3, finish: wk.finish }); }
}
// Zen: je ziet de weg niet, dus de renner stuurt zelf netjes over het midden.
const getSteer = (dt) => (wk?.zen && race ? clamp(-race.me.x * 2.5, -1, 1) : clamp(input.steer(dt) + sterzo.steer, -1, 1));

let profDots = {};
function startRace(cfg) {
  rideShot = null; lobbyReady = false; rerenderResults = null;
  wk = cfg.workout ? { w: cfg.workout, mode: cfg.wkMode || (cfg.zen ? 'zen' : cfg.wgame ? 'game' : 'ride'), bias: 0, erg: store.wkErg ?? true, zen: !!cfg.zen, game: !!cfg.wgame,
    finish: cfg.wkFinish || 0, finalIdx: cfg.wkFinish ? cfg.workout.blocks.findIndex((b) => Math.abs(b.t0 + b.dur - cfg.wkFinish) < 0.5) : -1, log: [], sec: -1, bi: -1, p3: 0, beep: 4 } : null;
  $('hud').classList.toggle('zen', !!wk?.zen); document.body.classList.toggle('zen', !!wk?.zen);
  const chart = $('wk-chart'), zc = !!wk?.zen; if (chart.width !== (zc ? 2400 : 1640)) { chart.width = zc ? 2400 : 1640; chart.height = zc ? 440 : 180; }
  $('hud').classList.toggle('workout', !!wk); $('hud').classList.toggle('wkgame', !!wk && !!cfg.wgame);
  $('wk').classList.toggle('hidden', !wk);
  $('wk-skip').classList.toggle('hidden', !!room); // in een kamer rijdt iedereen tegelijk
  lastCfg = cfg;
  hideOverlay();
  training = null;
  if (cfg.plan) {
    const stages = [];
    if (cfg.warm) stages.push({ kind: 'warm', track: cfg.plan[0].track, laps: 1 });
    cfg.plan.forEach((s, i) => stages.push({ kind: 'stage', track: s.track, laps: s.laps, n: i + 1 }));
    if (cfg.cool) stages.push({ kind: 'cool', track: cfg.plan[cfg.plan.length - 1].track, laps: 1 });
    training = { stages, idx: 0, gone: new Set(), count: cfg.plan.length, courseLen: cfg.plan.reduce((a, s) => a + getTrack(s.track).length * s.laps, 0) };
  }
  paused = false;
  banners.length = 0; bannerT = 0;
  input.clear();
  renderer.confetti = [];
  launch(cfg, null);
  $('ui').classList.add('ingame');
  $('hud').classList.remove('hidden');
  $('h-count').textContent = '';
  renderer.resize();
  if (P.vshift && trainer.connected && !trainer.canControl) toast('Je trainer accepteert geen weerstandsopdrachten, dus virtueel schakelen werkt niet.');
  if (P.music) audio.startMusic();
  navigator.wakeLock?.request('screen').then((w) => { wake = w; }).catch(() => {});
}

// Start één race, of de huidige etappe van een training (carry = toestand uit de vorige etappe).
function launch(cfg, carry) {
  const st = training ? training.stages[training.idx] : { kind: 'race', track: cfg.track, laps: cfg.laps };
  const track = getTrack(st.track);
  const meId = room ? room.me.id : 'p0';
  const iRunBots = !room || room.isHost;
  const riders = [
    ...cfg.roster.filter((p) => !training?.gone.has(p.id)).map((p) => ({ ...p, kind: p.id === meId ? 'me' : 'remote' })),
    ...cfg.bots.map((b) => ({ ...b, kind: iRunBots ? 'bot' : 'remote' })),
  ];
  const n = ns();
  const ghost = !training && P.ghostRace ? getGhost(n, `${track.id}|ghost|${cfg.laps}`) : null;
  let extra = {};
  if (cfg.workout) extra = { mode: 'workout', timed: cfg.workout.total, wgame: !!cfg.wgame, wk: cfg.workout, wkFinish: cfg.wkFinish || 0 };
  if (training) {
    const all = training.stages, i = training.idx;
    const next = all.slice(i + 1).find((s) => s.kind === 'stage');
    const before = all.slice(0, i).filter((s) => s.kind === 'stage').reduce((a, s) => a + getTrack(s.track).length * s.laps, 0);
    const free = st.kind !== 'stage';
    extra = {
      mode: st.kind, training: true, stageIdx: i, stageN: st.n, stageCount: training.count, carry,
      open: st.kind === 'stage' && !!next,
      timed: free ? WARM_SECS : 0,
      rolling: free || (!!carry && all[i - 1].kind === 'stage'), // eerste etappe: aftellen; daarna vliegend door
      distOffset: st.kind === 'warm' ? -1e6 : st.kind === 'cool' ? training.courseLen : before,
      courseLen: training.courseLen,
      portalArch: next ? { text: '⚡ TELEPORT → ' + getTrack(next.track).name.toUpperCase(), color: '#7df9ff', portal: true } : null,
    };
    const mins = Math.round(WARM_SECS / 60);
    banners.push(st.kind === 'warm' ? { text: 'WARMING-UP', sub: `${mins} minuten rustig indraaien`, color: '#7df9ff' }
      : st.kind === 'cool' ? { text: 'COOLING-DOWN', sub: `${mins} minuten uitrijden`, color: '#7df9ff' }
      : { text: `ETAPPE ${st.n}/${training.count} · ${track.name.toUpperCase()}`, sub: `${st.laps} ronde${st.laps > 1 ? 's' : ''}`, color: '#ffd166' });
    if (carry) { renderer.flash = { color: '#ffffff', a: 1.4 }; audio.sfx('boost'); }
  }
  race = new Race({
    track, laps: st.laps, seed: cfg.seed + (training ? training.idx : 0), riders, room, isHost: iRunBots, ns: n,
    profile: { ...P, fair: cfg.fair, assist: !!P.assist && ((cfg.workout && cfg.wkMode === 'ride') || (!!cfg.plan && !room)) /* stuurhulp alleen bij Ride en solo training */ }, difficulty: cfg.diff, rubber: !!cfg.rubber, ghost, ghostLap: P.ghostLap, ghostSeg: P.ghostSeg, getPower, getSteer, emit, ...extra,
  });
  race.multi = !!room;
  audio.setScene(wk?.zen ? 'zen' : track.id); // elke baan zijn eigen muziek
  drawProfile($('h-prof'), track, profDots);
  $('h-dots').innerHTML = '';
}

function nextStage() {
  if (!race || !training) return;
  const carry = race.carryOut();
  training.idx++;
  if (training.idx >= training.stages.length) { training.idx--; race.state = 'done'; showResults(); return; }
  launch(lastCfg, carry);
}

function endRace() {
  boxClear();
  wk = null; $('wk').classList.add('hidden'); $('hud').classList.remove('workout', 'wkgame', 'zen'); document.body.classList.remove('zen');
  rerenderResults = null; lobbyReady = false;
  if (race) race.savePower();
  training = null;
  race = null;
  clearInterval(resultsTimer);
  hideOverlay();
  audio.stopMusic();
  $('hud').classList.add('hidden');
  $('ui').classList.remove('ingame');
  trainer.setGrade(0);
  wake?.release().catch(() => {}); wake = null;
}

function quitToMenu() {
  endRace();
  if (room?.isHost) { room.toLobby(); show('setup'); renderSetup(); }
  else if (room) { leaveRoom(); show('home'); }
  else { show('setup'); renderSetup(); }
}

function overlay(html) { const c = $('overlay-card'); c.innerHTML = html; c._v = null; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); clearInterval(resultsTimer); }

// Rit als .tcx-bestand opslaan; dat bestand kun je bij Strava uploaden.
const SAVE_BTN = '<button class="ghost" id="ov-save">💾 Rit opslaan voor Strava</button>';
const SHOT_BTN = '<button class="ghost" id="ov-shot">📸 Ritfoto opslaan</button>';
let rideShot = null; // momentopname net na de start

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function rideImage(r) {
  const st = r.stats, me = r.me, secs = st.secs.length;
  const avgP = secs ? st.secs.reduce((a, w) => a + w, 0) / secs : 0;
  const when = new Date(r.startedAt || Date.now()).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  const where = r.wkName ? `Workout · ${r.wkName}` : r.training ? `Training · ${training ? training.count : ''} etappes` : r.track.name;
  const stats = [[`${(st.km || 0).toFixed(1)} km`, 'afstand'], [fmtTime(secs, 0), 'tijd'], [`${Math.round(avgP)} W`, 'gemiddeld'], [`${Math.round(st.hm || 0)} m`, 'hoogtemeters']];
  if (me.finished && r.riders.length > 1) stats.push([`${me.rank}/${r.riders.length}`, 'plaats']);
  return compose(rideShot || (r.zenShot ? r.zenShot : grab($('game'))), `${where} · ${when}`, stats); // te vroeg gestopt: het beeld van nu
}
const canSave = (r) => r.ns === 'real' && r.stats.log.length > 5;
function wireSave(r) {
  const sb = $('ov-shot');
  if (sb) sb.onclick = () => rideImage(r).toBlob((blob) => {
    download(blob, tcxFilename(r.startedAt || Date.now()).replace('.tcx', '.jpg'));
    sb.textContent = '📸 Ritfoto opgeslagen ✓';
  }, 'image/jpeg', 0.92);
  const b = $('ov-save');
  if (!b) return;
  b.onclick = () => {
    const tcx = buildTcx({ startedAt: r.startedAt, log: r.stats.log, name: `Watt Blitz – ${r.wkName || r.track.name}` });
    if (!tcx) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([tcx], { type: 'application/vnd.garmin.tcx+xml' }));
    a.download = tcxFilename(r.startedAt);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    b.outerHTML = '<p class="small" id="ov-saved">Opgeslagen in je downloads. Upload het bestand op <a href="https://www.strava.com/upload/select" target="_blank" rel="noopener">strava.com/upload/select</a>.</p>';
    r.saved = true;
  };
}

function togglePause() {
  if (!race || race.state === 'done') return;
  if (!$('overlay').classList.contains('hidden')) { paused = false; hideOverlay(); return; }
  paused = !room;
  overlay(`<h2>${room ? 'Race verlaten?' : 'Pauze'}</h2><div class="menu">
    <button class="big" id="ov-resume">Verder rijden</button>
    ${room ? '' : '<button class="ghost" id="ov-restart">Opnieuw</button>'}
    ${race.timed && (race.mode === 'cool' || race.mode === 'warm') && (race.mode === 'cool' || !room) ? `<button class="ghost" id="ov-skip">${race.mode === 'warm' ? 'Warming-up' : 'Cooling-down'} overslaan</button>` : ''}
    ${wk ? `${room ? '' : '<button class="ghost" id="ov-wkskip">⏭ Blok overslaan</button>'}<button class="ghost" id="ov-erg">ERG ${wk.erg ? 'uitzetten' : 'aanzetten'}</button><button class="ghost" id="ov-easy">−5%</button><button class="ghost" id="ov-hard">+5%</button>` : ''}
    <button class="ghost" id="ov-quit">Stoppen</button></div><div class="menu">${canSave(race) ? SAVE_BTN : ''}${race.stats.secs.length > 5 ? SHOT_BTN : ''}</div>`);
  wireSave(race);
  $('ov-resume').onclick = () => { paused = false; hideOverlay(); };
  if (!room) $('ov-restart').onclick = () => startRace({ ...lastCfg, seed: (Math.random() * 1e9) | 0 });
  $('ov-quit').onclick = quitToMenu;
  if ($('ov-skip')) $('ov-skip').onclick = () => { const r = race; paused = false; hideOverlay(); r.timed = 0.001; };
  if (wk) {
    if ($('ov-wkskip')) $('ov-wkskip').onclick = () => { paused = false; hideOverlay(); wkSkip(); };
    $('ov-erg').onclick = () => { paused = false; hideOverlay(); wkErg(); };
    $('ov-easy').onclick = () => wkBias(-0.05);
    $('ov-hard').onclick = () => wkBias(0.05);
    if (race.time - race.t0 > 60 && !room) $('ov-quit').onclick = () => finishWorkout(true); // gestopt: toch even nabespreken
  }
}

// ---------- workout klaar: nabespreking ----------
function finishWorkout(partial = false) {
  if (!race || !wk || wk.ended) return;
  const r = race, w = wk.w, log = wk.log;
  wk.ended = true; wk.partial = partial;
  r.state = 'done'; r.ended = true; r.wkName = w.name; paused = false;
  hideOverlay();
  const st = store.stats;
  st.km += Math.max(0, r.stats.km || 0); st.xp += Math.round((log.length / 60) * 3);
  if (wk.game && r.me.finished && r.riders.length > 1) { st.races++; if (r.me.rank === 1) st.wins++; }
  r.savePower(); save();
  if (wk.game && r.me.finished) { audio.sfx('lap'); showResults(); return; } // game: eerst de uitslag (met jury), de nabespreking zit eronder
  audio.sfx('finish'); if (!partial) renderer.party();
  showWkSummary();
}
// Nabespreking van de workout (ook bereikbaar vanaf de uitslag in de Game-modus).
function showWkSummary() {
  const r = race, w = wk.w, log = wk.log, partial = wk.partial;
  const ftp = P.ftp, m = metrics(log.map((e) => e.p), ftp);
  const hrs = log.filter((e) => e.hr > 0).map((e) => e.hr);
  const work = (b) => !['warm', 'cool', 'free'].includes(b.kind) && b.label !== 'Herstel' && b.dur >= 30;
  const rows = [];
  let inAll = 0, nAll = 0;
  w.blocks.forEach((b, i) => {
    const es = log.filter((e) => e.bi === i);
    if (!es.length) return;
    const tg = es.filter((e) => e.tgt), avg = es.reduce((a, e) => a + e.p, 0) / es.length;
    const inZ = tg.length ? tg.filter((e) => Math.abs(e.p / e.tgt - 1) <= 0.05).length / tg.length : null;
    if (work(b) && inZ != null) { inAll += inZ * tg.length; nAll += tg.length; }
    const medal = !work(b) || inZ == null ? '' : inZ >= 0.9 ? '🥇' : inZ >= 0.75 ? '🥈' : inZ >= 0.5 ? '🥉' : '';
    const tAvg = tg.length ? Math.round(tg.reduce((a, e) => a + e.tgt, 0) / tg.length) : null;
    rows.push(`<tr><td><i class="wk-sw" style="background:${zoneColor(blockFrac(w, b, ftp))}"></i>${esc(blockName(b))}</td><td>${clock(es.length)}</td><td>${tAvg ?? '–'}${tAvg ? ' W' : ''}</td><td><b>${Math.round(avg)} W</b></td><td>${inZ == null ? '–' : Math.round(inZ * 100) + '%'}</td><td class="wk-medal">${medal}</td></tr>`);
  });
  const zone = nAll ? Math.round((inAll / nAll) * 100) : null;
  overlay(`<h2>${partial ? '⏹ Workout gestopt' : '✅ Workout klaar!'}</h2><p class="rv-sub">${esc(w.name)} · ${clock(log.length)}${partial ? ` van ${clock(w.total)}` : ''}${zone != null ? ` · ${zone}% in de zone` : ''}</p>
    <canvas id="wk-sum-chart" width="1200" height="220" style="width:100%;height:auto;border-radius:12px;background:#0d0626"></canvas>
    <div class="statgrid">
      <div><b>${Math.round(m.avg)} W</b>gemiddeld</div><div><b>${Math.round(m.np)} W</b>NP</div><div><b>${m.if.toFixed(2)}</b>IF</div><div><b>${Math.round(m.tss)}</b>TSS</div>
      <div><b>${Math.round(log.reduce((a, e) => a + e.p, 0) / 1000)} kJ</b>arbeid</div>${hrs.length ? `<div><b>${Math.round(hrs.reduce((a, h) => a + h, 0) / hrs.length)}</b>❤ gemiddeld</div><div><b>${Math.max(...hrs)}</b>❤ max</div>` : ''}<div><b>${(r.stats.km || 0).toFixed(1)}</b>km</div>
    </div>
    <p><b>Per blok</b></p><table class="wk-sum"><tr><th>Blok</th><th>Tijd</th><th>Doel</th><th>Gereden</th><th>In zone</th><th></th></tr>${rows.join('')}</table>
    <p class="small">In de zone = binnen 5% van je doel. 🥇 90% of meer · 🥈 75% · 🥉 50%. NP, IF en TSS zeggen hoe zwaar de workout was (een uur op je FTP = 100 TSS).</p>
    ${r.ns === 'demo' ? '<p class="small">Demo-modus: het vermogen volgde vanzelf het doel.</p>' : ''}
    <div class="menu">${canSave(r) ? (r.saved ? '<p class="small">Rit opgeslagen.</p>' : SAVE_BTN) : ''}${SHOT_BTN}</div>
    <div class="menu">${wk.game && r.me.finished ? '<button class="big" id="ov-res">🏆 Uitslag</button>' : ''}${room ? '' : `<button class="${wk.game && r.me.finished ? 'ghost' : 'big'}" id="ov-again">Nog een keer</button>`}<button class="ghost" id="ov-quit">${room ? 'Kamer verlaten' : 'Menu'}</button></div>`);
  drawWorkout($('wk-sum-chart'), w, { pad: 16, top: 14, bottom: 8, log, ftpLine: true, line: 3, avg: 10, finish: wk.finish });
  if ($('ov-res')) $('ov-res').onclick = () => showResults('final');
  if (wk.zen) { // zen: de grafiek is de ritfoto
    const shot = document.createElement('canvas'); shot.width = 1600; shot.height = 900;
    const g = shot.getContext('2d'), ch = document.createElement('canvas'); ch.width = 1400; ch.height = 520;
    drawWorkout(ch, w, { pad: 10, top: 16, bottom: 4, log, ftpLine: true, line: 4, avg: 10 });
    g.fillStyle = '#0a0418'; g.fillRect(0, 0, 1600, 900); g.drawImage(ch, 100, 190);
    r.zenShot = shot;
  }
  if ($('ov-again')) $('ov-again').onclick = () => startRace({ ...lastCfg, seed: (Math.random() * 1e9) | 0 });
  $('ov-quit').onclick = quitToMenu;
  wireSave(r);
}

// Uitslag in stappen: eerst de voorlopige uitslag (zonder jury), dan de jurybeslissing per renner,
// en dan de definitieve uitslag met wie er stegen of zakten, de segmentwinnaars en de eindtruien.
// Het scherm hangt niet af van de host: gaat die terug naar de kamer of weg, dan blijft het gewoon staan.
const WAIT_MAX = 90, PRE_SECS = 3.5, JURY_STEP = 2.2;
function showResults(jump) {
  if (!race) return;
  shareBoard(); // nieuwe tijden meteen delen met de kamer
  const r = race;
  const rv = { phase: jump || 'wait', t: performance.now(), mine: performance.now(), shown: -1 };
  const go = (phase) => { rv.phase = phase; rv.t = performance.now(); rv.shown = -1; };
  const secs = () => (performance.now() - rv.t) / 1000;
  const fmt = (x) => (x != null ? fmtTime(x, 2) : '…');
  const dot = (x) => `<span style="color:${esc(x.color)}">●</span>`;
  const penList = (x) => {
    const g = {};
    for (const p of x.pens) { const k = juryWhat(p.why, null); (g[k] ||= { n: 0, secs: 0, vic: [] }); g[k].n++; g[k].secs += p.secs; if (p.vic) g[k].vic.push(p.vic); }
    return Object.entries(g).map(([k, v]) => `${v.n > 1 ? v.n + '× ' : ''}${esc(k)}${v.vic.length ? ` <small>(${esc([...new Set(v.vic)].join(', '))})</small>` : ''} <b>+${v.secs} s</b>`).join('<br>');
  };
  const buttons = () => room
    ? room.isHost ? '<button class="big" id="ov-lobby">Terug naar kamer</button>'
      : lobbyReady ? '<button class="big" id="ov-room">Naar de kamer</button><button class="ghost" id="ov-quit">Verlaten</button>'
        : '<p class="small">Wacht op de host voor de volgende race… Dit scherm blijft staan.</p><button class="ghost" id="ov-quit">Verlaten</button>'
    : r.multi ? '<button class="big" id="ov-quit">Menu</button>'
      : '<button class="big" id="ov-again">Nog een keer</button><button class="ghost" id="ov-quit">Menu</button>';
  const render = () => {
    if (race !== r) return;
    const res = r.results(), st = r.stats, me = r.me;
    const done = res.filter((x) => x.finished);
    const pending = res.some((x) => !x.finished && !x.dnf);
    // fases doorlopen
    if (rv.phase === 'wait' && (!pending || (performance.now() - rv.mine) / 1000 > WAIT_MAX)) go('pre');
    const judged = done.filter((x) => x.penalty > 0).sort((a, b) => a.raw - b.raw);
    if (rv.phase === 'pre' && secs() > PRE_SECS) go(judged.length ? 'jury' : 'final');
    if (rv.phase === 'jury') {
      const n = Math.min(judged.length, Math.floor(secs() / JURY_STEP) + 1);
      if (n > rv.shown) { rv.shown = n; audio.sfx('whistle'); }
      if (secs() > judged.length * JURY_STEP + 1.5) go('final');
    }
    const preRank = new Map([...done].sort((a, b) => a.raw - b.raw).map((x, i) => [x.id, i + 1]));
    let body;
    if (rv.phase === 'wait' || rv.phase === 'pre') {
      const rows = [...res].sort((a, b) => (a.finished && b.finished ? a.raw - b.raw : a.finished ? -1 : b.finished ? 1 : 0))
        .map((x) => `<tr class="${x.me ? 'me' : ''}"><td>${x.finished ? preRank.get(x.id) : x.dnf ? '–' : ''}</td><td>${dot(x)} ${esc(x.name)}</td><td>${x.finished ? fmt(x.raw) : x.dnf ? 'gestopt' : 'nog onderweg…'}</td></tr>`).join('');
      body = `<h2>🏁 Binnen!</h2><p class="rv-sub">${rv.phase === 'wait' ? 'Voorlopige uitslag · wachten op de rest van het veld…' : 'Voorlopige uitslag · de jury beraadt zich… ⚖️'}</p>
        <table class="rv-table">${rows}</table>
        <div class="menu"><button class="ghost" id="ov-skip">${rv.phase === 'wait' ? 'Uitslag nu' : 'Overslaan'} ⏭</button></div>`;
    } else if (rv.phase === 'jury') {
      const items = judged.slice(0, rv.shown).map((x, i) => `<div class="jury-item${i === rv.shown - 1 ? ' new' : ''}${x.me ? ' me' : ''}"><div>${dot(x)} <b>${esc(x.name)}</b></div><div>${penList(x)}</div></div>`).join('');
      body = `<div class="jury"><div class="jury-title">⚖️ JURYBESLISSING</div><p class="rv-sub">De jury heeft de beelden bekeken en deelt tijdstraffen uit.</p>${items}</div>
        <div class="menu"><button class="ghost" id="ov-skip">Overslaan ⏭</button></div>`;
    } else {
      const cl = r.classification();
      const icons = (id) => (cl.green?.id === id ? JERSEY_SVG : '') + (cl.kom?.id === id ? POLKA_SVG : '') + (cl.cass?.id === id ? CASS_SVG : '');
      const rows = res.map((x, i) => {
        const mv = x.finished && preRank.get(x.id) != null ? preRank.get(x.id) - x.rank : 0;
        return `<tr class="rv-row${x.me ? ' me' : ''}" style="animation-delay:${(res.length - 1 - i) * 0.25}s"><td>${x.rank ?? '–'}</td><td>${dot(x)} ${esc(x.name)} ${icons(x.id)}</td>
          <td>${x.dnf ? 'gestopt' : fmt(x.time)}${x.penalty ? ` <small class="pen">⚖️ +${x.penalty} s</small>` : ''}</td><td class="mv ${mv > 0 ? 'up' : mv < 0 ? 'down' : ''}">${mv > 0 ? '▲' + mv : mv < 0 ? '▼' + -mv : ''}</td></tr>`;
      }).join('');
      const win = me.rank === 1 && res.length > 1;
      const ico = { sprint: '⚡', climb: '⛰️', cobble: '🪨' };
      const segs = cl.segs.map((g) => `<li>${ico[g.type]} ${esc(g.zone)}: <b>${esc(g.name)}</b> ${g.type === 'sprint' ? `(${g.wins}× gewonnen)` : fmtTime(g.t, 1)}</li>`).join('');
      const jer = [[cl.green, JERSEY_SVG, 'Groene trui', (n) => `${n} sprint${n > 1 ? 's' : ''}`], [cl.kom, POLKA_SVG, 'Bolletjestrui', (n) => `${n} klim${n > 1 ? 'men' : ''}`], [cl.cass, CASS_SVG, 'Gouden Kassei', (n) => `${n} strook${n > 1 ? 'en' : ''}`]]
        .filter(([w]) => w).map(([w, svg, label, what]) => `<div class="jer">${svg}<span>${label}</span><b>${esc(w.name)}</b><small>${what(w.n)}</small></div>`).join('');
      const prs = r.prs.map((p) => `<li>${esc(p.label)}: ${fmtTime(p.t, 2)}${p.prev ? ` (${fmtDelta(p.t - p.prev)})` : ''}</li>`);
      const pn = { 5: '5 s', 60: '1 min', 300: '5 min' };
      for (const w of r.powerPRs || []) prs.push(`<li>Vermogen ${pn[w]}: ${Math.round(st.best[w])} W</li>`);
      const avgP = st.n ? st.sumP / st.n : 0;
      const myPens = res.find((x) => x.me)?.pens.length ? `<p class="small">⚖️ Jouw straffen: ${penList(res.find((x) => x.me))}</p>` : '';
      body = `<h2>${win ? '🥇 GEWONNEN!' : me.rank + 'e plaats'}</h2><p class="rv-sub">Definitieve uitslag${judged.length ? '' : ' · de jury zag niets bijzonders ✓'}${pending ? ' · nog niet iedereen is binnen' : ''}</p>
        ${r.training ? `<p class="small">Training: ${training ? training.count : ''} etappe(s) · ${(r.courseLen / 1000).toFixed(1)} km. De tijd is die van de etappes samen, zonder in- en uitrijden.</p>` : ''}
        <table class="rv-table">${rows}</table>${myPens}
        ${jer ? `<p><b>Eindtruien</b></p><div class="jers">${jer}</div>` : ''}
        ${segs ? `<p><b>Segmenten</b></p><ul class="segs">${segs}</ul>` : ''}
        ${prs.length ? `<p><b>🏆 Nieuwe records</b></p><ul class="prlist">${prs.join('')}</ul>` : ''}
        <div class="statgrid">
          <div><b>${Math.round(avgP)} W</b>gemiddeld</div><div><b>${Math.round(st.maxP)} W</b>piek</div>
          <div><b>${Math.round(st.best[5])} W</b>beste 5 s</div><div><b>${(((r.wk ? me.finishDist || me.dist : r.courseLen) / Math.max(1, r.wk ? r.wkFinish || me.finishTime : me.finishTime)) * 3.6).toFixed(1)}</b>km/u gem.</div>
          <div><b>${(st.maxV * 3.6).toFixed(0)}</b>km/u top</div><div><b>${(st.km || 0).toFixed(1)}</b>km totaal</div><div><b>${Math.round(st.hm || 0)}</b>hoogtemeters</div>${st.nHr ? `<div><b>${Math.round(st.sumHr / st.nHr)}</b>❤ gemiddeld</div><div><b>${st.maxHr}</b>❤ max</div>` : ''}<div><b>${Math.round(st.secs.reduce((a, w) => a + w, 0) / 1000)} kJ</b>arbeid</div>
        </div>
        ${r.ns === 'demo' ? '<p class="small">Demo-modus: tijden tellen apart van je trainer-records.</p>' : ''}
        ${r.rubber ? '<p class="small">Rubber banding stond aan: tijden uit deze race tellen niet voor records.</p>' : ''}
        ${wk?.game ? '<div class="menu"><button class="ghost" id="ov-wksum">📈 Workout-nabespreking</button></div>' : ''}
        <div class="menu">${canSave(r) ? (r.saved ? '<p class="small">Rit opgeslagen. Upload het bestand op <a href="https://www.strava.com/upload/select" target="_blank" rel="noopener">strava.com/upload/select</a>.</p>' : SAVE_BTN) : ''}${SHOT_BTN}</div>
        <div class="menu">${buttons()}</div>`;
    }
    const card = $('overlay-card');
    if (card._v === body && !$('overlay').classList.contains('hidden')) return; // niets veranderd: laten staan (geen animaties opnieuw)
    overlay(body);
    card._v = body;
    if ($('ov-skip')) $('ov-skip').onclick = () => { go(rv.phase === 'wait' ? 'pre' : 'final'); render(); };
    if ($('ov-wksum')) $('ov-wksum').onclick = () => { clearInterval(resultsTimer); showWkSummary(); };
    if ($('ov-lobby')) $('ov-lobby').onclick = quitToMenu;
    if ($('ov-room')) $('ov-room').onclick = () => { endRace(); show('setup'); renderSetup(); };
    if ($('ov-again')) $('ov-again').onclick = () => startRace({ ...lastCfg, seed: (Math.random() * 1e9) | 0 });
    if ($('ov-quit')) $('ov-quit').onclick = quitToMenu;
    wireSave(r);
  };
  rerenderResults = render;
  render();
  clearInterval(resultsTimer);
  resultsTimer = setInterval(render, 250);
}

// ---------- HUD ----------
let hudSlow = 0, rouletteTick = 0;
const itemKeys = Object.keys(ITEMS);
function hud(dt) {
  const r = race, me = r.me;
  if (wk) wkHud();
  $('h-watt').firstChild.nodeValue = Math.round(me.power);
  setText($('h-spd'), (me.v * 3.6 * (me.prog ?? 1)).toFixed(0)); // echte voortgang: berm, lijn, truien, lek en bidon tellen mee
  setText($('h-time'), fmtTime(r.time));
  const it = $('h-item');
  if (me.roulette > 0) {
    rouletteTick -= dt;
    if (rouletteTick <= 0) { rouletteTick = 0.08; setText($('h-item-i'), ITEMS[itemKeys[Math.floor(Math.random() * itemKeys.length)]].icon); audio.sfx('tick'); }
    it.classList.remove('has');
  } else {
    setText($('h-item-i'), me.item ? ITEMS[me.item].icon : '');
    it.classList.toggle('has', !!me.item);
  }
  // banners
  bannerT -= dt;
  const bn = $('h-banner');
  if (bannerT <= 0 && banners.length) {
    const b = banners.shift();
    bn.innerHTML = (b.icon ? ICONS[b.icon] || '' : '') + esc(b.text) + (b.sub ? `<small>${esc(b.sub)}</small>` : '');
    bn.style.color = b.color || '#fff';
    bn.classList.add('show');
    bannerT = 2.2;
  } else if (bannerT <= 0.3) bn.classList.remove('show');

  hudSlow -= dt;
  if (hudSlow > 0) return;
  hudSlow = 0.2;
  const total = r.riders.length;
  // Binnen: plaats en stand verbergen, anders verklapt de HUD de uitslag voordat de jury beslist.
  const over = r.state === 'done';
  for (const id of ['h-pos', 'h-rank', 'h-feed']) $(id).classList.toggle('gone', over);
  setHTML($('h-pos'), `${me.rank}<small>/${total}</small>`);
  const left = r.timed ? fmtTime(Math.ceil(Math.max(0, r.timed - (r.time - r.t0))), 0) : '';
  setText($('h-lap'), r.mode === 'warm' ? `WARMING-UP · nog ${left}` : r.mode === 'cool' ? `COOLING-DOWN · nog ${left}`
    : `${r.training ? `Etappe ${r.stageN}/${r.stageCount} · ` : ''}Ronde ${clamp(Math.floor(Math.max(0, me.dist) / r.L) + 1, 1, r.laps)}/${r.laps} · ${(Math.max(0, r.total - me.dist) / 1000).toFixed(2)} km`);
  setText($('h-cad'), Math.round(me.cadence));
  setText($('h-grade'), r.track.segAt(me.dist).grade.toFixed(1));
  setText($('h-bolts'), `⚡ ${me.bolts}/10${me.bolts >= 10 ? ' FULL BLITZ' : ''}`);
  const lost = [trainer, sterzo, hrm, ...pads].filter((d) => d._wantConnected && !d.connected);
  $('h-dev').classList.toggle('hidden', !lost.length);
  setText($('h-dev'), lost.length ? `⚠️ ${lost.map((d) => d.label).join(', ')} kwijt – opnieuw verbinden…` : '');
  const w = r.warn;
  $('h-warn').classList.toggle('hidden', !w);
  if (w) setText($('h-warn'), w.text);
  const kom = r.komId === me.id;
  $('h-kom').classList.toggle('hidden', !kom);
  if (kom) setHTML($('h-kom'), POLKA_SVG + (me.fx.kom > 0 ? `Bolletjestrui · +5% nog ${Math.ceil(me.fx.kom)} s` : 'Bolletjestrui'));
  const cass = r.cassId === me.id;
  $('h-cass').classList.toggle('hidden', !cass);
  if (cass) setHTML($('h-cass'), CASS_SVG + (me.fx.antilek > 0 ? `Gouden Kassei · antilekband nog ${Math.ceil(me.fx.antilek)} s` : 'Gouden Kassei'));
  const green = r.greenId === me.id;
  $('h-green').classList.toggle('hidden', !green);
  if (green) setHTML($('h-green'), JERSEY_SVG + (me.fx.sprint > 0 ? `Groene trui · +5% nog ${Math.ceil(me.fx.sprint)} s` : 'Groene trui'));
  $('h-rubber').classList.toggle('hidden', !(me.rubber > 0.005));
  if (me.rubber > 0.005) setText($('h-rubber'), `🪢 Rubber band +${Math.round(me.rubber * 100)}%`);
  $('h-gear').classList.toggle('hidden', !P.vshift);
  setText($('h-gear'), `⚙ ${getGear()}/${GEARS}`);
  $('h-bolts').title = `${me.bolts * 2}% minder luchtweerstand`;
  $('h-hr').classList.toggle('hidden', !me.hr);
  setText($('h-hr-v'), me.hr || '');
  $('h-draft').classList.toggle('hidden', !me.draft && !me.inScooter);
  setText($('h-draft'), me.inScooter ? '🛵 SLIPSTREAM SCOOTER' : '💨 SLIPSTREAM');
  // Eén regel voor je lijn: berm (kost), short cut (winst) of binnen-/buitenbocht.
  const ln = $('h-line'), gain = me.finished && !r.free ? 0 : me.line || 0;
  const cut = me.onCut && me.cutValid && Math.abs(me.x) > 1;
  ln.classList.toggle('hidden', !me.berm && !me.onCobble && !me.inGutter && Math.abs(gain) < 0.012);
  ln.classList.toggle('bad', me.berm || me.onCobble || (!me.inGutter && gain < 0));
  setText(ln, me.berm ? `⚠️ BERM −${Math.round(-me.line * 100)}%` : me.onCobble ? '🪨 KASSEIEN −15%' : me.inGutter ? '🪨 GOOTJE'
    : cut ? `🔀 SHORT CUT +${(gain * 100).toFixed(0)}%`
    : gain > 0 ? `↪ BINNENBOCHT +${(gain * 100).toFixed(0)}%` : `BUITENBOCHT −${(-gain * 100).toFixed(0)}%`);
  setText($('h-tot'), `${(r.stats.km || 0).toFixed(2)} km · ${Math.round(r.stats.hm || 0)} hm`);
  setText($('h-item-n'), me.item ? ITEMS[me.item].name : 'spatie');
  const d = $('h-delta');
  if (r.ghostDelta != null) {
    setText(d, `${fmtDelta(r.ghostDelta)} vs PR ${r.ghostLabel}`);
    d.className = r.ghostDelta <= 0 ? 'ahead' : 'behind';
  } else setText(d, '');
  const z = $('h-zone');
  z.classList.toggle('hidden', !r.activeZone);
  if (r.activeZone) {
    const a = r.activeZone;
    setText(z, `${a.zone.name} ${fmtTime(r.time - a.t0)}${a.pr ? ' · PR ' + fmtTime(a.pr) : ''}`);
    z.style.borderColor = a.zone.type === 'sprint' ? '#39ffb0' : '#ff7b1c';
  }
  setHTML($('h-rank'), r.order.map((x) => {
    const gap = x === me ? '' : x.finished ? ' 🏁' : ` ${x.dist > me.dist ? '+' : '−'}${Math.abs(x.dist - me.dist).toFixed(0)}m`;
    return `<div class="${x === me ? 'me' : ''}"><span style="color:${esc(x.color)}">●</span> ${x.rank}. ${esc(x.name)}${x.penalty ? ` ⚖️+${x.penalty}s` : ''}${gap}</div>`;
  }).join(''));
  setHTML($('h-feed'), r.feed.filter((f) => r.clock - f.at < 6).map((f) => `<div>${f.icon ? ICONS[f.icon] || '' : ''}${esc(f.text)}</div>`).join(''));
  // stippen op het profiel
  const dots = $('h-dots');
  const list = [...r.riders, ...r.ghostRiders.filter((g) => !g.hidden)];
  while (dots.children.length < list.length) dots.appendChild(document.createElement('i'));
  while (dots.children.length > list.length) dots.lastChild.remove();
  list.forEach((x, i) => {
    const el = dots.children[i], f = mod(x.dist, r.L) / r.L;
    el.style.left = f * 100 + '%';
    el.style.top = (profDots.Y(r.track.yAt(x.dist)) / 46) * 100 + '%';
    el.style.background = x.color;
    el.className = x === me ? 'me' : '';
    el.style.opacity = x.kind === 'ghost' ? 0.5 : 1;
  });
}

// ---------- hoofdlus ----------
let last = performance.now(), rattleT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (input.take('fullscreen')) toggleFullscreen();
  if (input.take('center') && sterzo.connected) { sterzo.calibrate(); toast('Stuur staat nu recht'); }
  if (input.take('music')) { P.music = !P.music; save(); audio.setOptions(P.music, P.sfx); if (race && P.music) audio.startMusic(); }
  if (!race) { input.clear(); return; }
  if (input.take('pause')) togglePause();
  if (input.take('item')) race.useItem();
  if (input.take('bell')) race.bell();
  const gu = input.take('gearUp'), gd = input.take('gearDown');
  if (input.take('skip')) wkSkip();
  if (input.take('erg')) wkErg();
  if (wk && (gu || gd)) wkBias(gu ? 0.05 : -0.05); // workout: schakelknoppen maken het 5% zwaarder of lichter
  else if (P.vshift && (gu || gd) && shift(gu ? 1 : -1)) {
    audio.sfx('tick');
    const el = $('h-gear'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  const frameDt = dt;
  if (!paused) {
    while (dt > 0.0001 && race) { const step = Math.min(dt, 0.04); race.update(step); dt -= step; }
    if (!race) return;
    musicState();
    const wkOn = wk && !wk.ended && (race.state === 'race' || (wk.game && race.state === 'done'));
    const ergW = wkOn && wk.erg ? wkTarget() : null;
    if (ergW != null) trainer.setTargetPower(ergW); // ERG: de trainer houdt het doel vast
    else trainer.setGrade(wk?.game ? 0 : (race.state === 'race' ? race.trainerGrade : 0) + (P.vshift && !wk ? gearOffset() : 0)); // game: het spel raakt nooit de weerstand
    wkTick(frameDt);
  }
  if (!paused && race.me.onCobble) { // schudden en geratel op de kasseien
    renderer.shake = Math.max(renderer.shake, 2.2);
    if ((rattleT -= frameDt) <= 0) { rattleT = 0.13; audio.sfx('rattle'); }
  }
  if (!wk?.zen) renderer.draw(race, paused ? 0 : frameDt); // zen: geen wereld tekenen (scheelt ook stroom)
  boxTick(frameDt);
  // Ritfoto: kort na de start (bij een training: na de start van de eerste etappe), op een moment
  // dat er iemand vlak voor je rijdt; lukt dat niet binnen 12 seconden, dan alsnog.
  if (!rideShot && race.state === 'race' && !race.free && !wk?.zen) {
    const t = race.time - race.t0, me = race.me;
    const ahead = race.riders.some((o) => o !== me && o.dist - me.dist > 3 && o.dist - me.dist < 40);
    if ((t >= 3 && ahead) || t >= 12) rideShot = grab($('game'));
  }
  hud(frameDt);
}
requestAnimationFrame(frame);

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
// Formaatwijzigingen samenvoegen: bij fullscreen of in- en uitschuivende balken komen er vaak vele achter elkaar.
let resizeT = 0;
const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(() => renderer.resize(), 200); };
window.addEventListener('resize', onResize);
document.addEventListener('fullscreenchange', onResize);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && race) navigator.wakeLock?.request('screen').then((w) => { wake = w; }).catch(() => {});
});
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touchy');
bindTouch($('t-left'), 'left'); bindTouch($('t-right'), 'right'); bindTouch($('t-pedal'), 'pedal');
$('t-left').classList.add('on'); $('t-right').classList.add('on');
// Power-upknop op 'pointerdown': een 'click' komt op een tablet niet door zolang er al een andere vinger
// op het scherm staat (bijv. op TRAP). De click alleen nog voor toetsenbordbediening (detail 0).
$('h-item').addEventListener('pointerdown', (e) => { e.preventDefault(); input.trigger('item'); });
$('h-item').addEventListener('click', (e) => { if (e.detail === 0) input.trigger('item'); });
$('h-menu').onclick = () => togglePause();
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

// Start
show('home');
const join = new URLSearchParams(location.search).get('join') || (/^#join-([a-z]{4})$/i.exec(location.hash) || [])[1];
if (join) { $('j-code').value = join.toUpperCase().slice(0, 4); show('join'); }
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (HOSTED) $('b-copy').textContent = 'Code kopiëren';
window.__wb = { get race() { return race; }, sel, trainer, sterzo, hrm, renderer, store }; // voor testen/debuggen
