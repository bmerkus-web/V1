// Watt Blitz – menu's, HUD en de hoofdlus.
import { TRACK_DEFS, getTrack } from './track.js';
import { Race, ITEMS, BOT_NAMES } from './game.js';
import { Renderer } from './render.js';
import { Trainer, Sterzo, HeartRate, ZwiftPad, bleSupported } from './ble.js';
import { input, bindTouch } from './input.js';
import { audio } from './audio.js';
import { store, save, COLORS, getTime, getGhost, levelOf } from './storage.js';
import { Room, makeCode } from './net.js';
import { fmtTime, fmtDelta, clamp, mod } from './util.js';

const $ = (id) => document.getElementById(id);
const P = store.profile;
const trainer = new Trainer();
const sterzo = new Sterzo();
const hrm = new HeartRate();
const pads = []; // gekoppelde Zwift-knoppen
const HOSTED = !!window.claude?.use; // draait als Claude-artifact
const renderer = new Renderer($('game'));
let race = null, room = null, paused = false, lastCfg = null, resultsTimer = null;
const sel = { track: 'polder', laps: 2, botsOn: true, bots: 5, diff: 'normaal', fair: P.fair, ghost: true };

// ---------- hulpjes ----------
function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== 's-' + name);
  $('ui').scrollTop = 0;
  if (name === 'home') renderHome();
  if (name === 'records') renderRecords();
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
  if (!bleSupported()) $('ble-note').textContent = 'Deze browser ondersteunt geen Bluetooth. Gebruik Chrome op Android of Mac (via https). Tot dan: demo-modus met ↑ / Shift / ←→.';
}
trainer.onstatus = sterzo.onstatus = hrm.onstatus = devStatus;
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
  let was = { item: false, bell: false };
  pad.onpad = (a) => {
    input.setPad(pad, a.left, a.right);
    if (a.item && !was.item) input.trigger('item');
    if (a.bell && !was.bell) input.trigger('bell');
    was = a;
  };
  pad.onstatus = () => { if (!pad.connected) input.setPad(pad, 0, 0); devStatus(); };
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
$('b-help').onclick = () => show('help');
$('b-settings').onclick = () => {
  $('p-feel').value = P.trainerFeel; $('p-feel-v').textContent = P.trainerFeel + '%';
  $('p-assist').checked = P.assist; $('p-music').checked = P.music; $('p-sfx').checked = P.sfx;
  show('settings');
};
$('p-feel').oninput = (e) => { P.trainerFeel = +e.target.value; $('p-feel-v').textContent = P.trainerFeel + '%'; save(); };
for (const k of ['assist', 'music', 'sfx']) $('p-' + k).onchange = (e) => { P[k] = e.target.checked; save(); audio.setOptions(P.music, P.sfx); };
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
    c.fillStyle = s.zone === 'sprint' ? '#39ffb0' : s.zone === 'climb' ? '#ff7b1c' : '#7a5cff';
    c.fillRect(x, Y(s.y1), w / track.n + 1, h);
  }
  if (dots) dots.Y = Y;
}

function renderSetup() {
  const lobby = !!room, canEdit = !room || room.isHost;
  $('setup-title').textContent = lobby ? 'Kamer' : 'Solo race';
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
  $('o-bots-l').classList.toggle('hidden', !$('o-botson').checked);
  $('o-diff-l').classList.toggle('hidden', !$('o-botson').checked);
  $('o-fair-note').textContent = sel.fair ? 'Iedereen die op zijn eigen FTP rijdt is even snel.' : 'Uit: snelheid volgt je watt per kilo (vul je gewicht in bij Renner).';
  $('o-laps').value = sel.laps; $('o-bots').value = Math.max(1, Math.min(sel.bots, maxBots || 1)); $('o-diff').value = sel.diff; $('o-fair').checked = sel.fair; $('o-ghost').checked = sel.ghost;
  for (const id of ['o-laps', 'o-bots', 'o-diff', 'o-fair']) $(id).disabled = !canEdit;
  $('o-ghost-l').classList.toggle('hidden', lobby);
  $('b-start').classList.toggle('hidden', !canEdit);
  $('b-back').textContent = lobby ? '← Kamer verlaten' : '← Terug';
}
function pushSettings() {
  if (room?.isHost) room.setSettings({ ...sel });
  renderSetup();
}
$('o-laps').onchange = (e) => { sel.laps = +e.target.value; pushSettings(); };
$('o-bots').onchange = (e) => { sel.bots = +e.target.value; pushSettings(); };
$('o-botson').onchange = (e) => { sel.botsOn = e.target.checked; pushSettings(); };
$('o-diff').onchange = (e) => { sel.diff = e.target.value; pushSettings(); };
$('o-fair').onchange = (e) => { sel.fair = e.target.checked; if (!room) { P.fair = sel.fair; save(); } pushSettings(); };
$('o-ghost').onchange = (e) => { sel.ghost = e.target.checked; };
$('b-solo').onclick = () => { audio.unlock(); show('setup'); renderSetup(); };
$('b-back').onclick = () => { leaveRoom(); show('home'); };
$('b-start').onclick = () => {
  audio.unlock();
  const roster = room ? room.players.map((p) => ({ id: p.id, name: p.name, color: p.color })) : [{ id: 'p0', name: P.name, color: P.color }];
  const nb = sel.botsOn ? Math.min(sel.bots, 6 - roster.length) : 0;
  const used = new Set(roster.map((p) => p.color));
  const free = COLORS.filter((c) => !used.has(c));
  const off = Math.floor(Math.random() * BOT_NAMES.length);
  const bots = Array.from({ length: nb }, (_, i) => ({
    id: 'b' + i, name: BOT_NAMES[(off + i) % BOT_NAMES.length], color: free[i % Math.max(1, free.length)] || COLORS[i],
    skill: nb > 1 ? i / (nb - 1) : 0.6,
  }));
  const cfg = { track: sel.track, laps: sel.laps, diff: sel.diff, fair: sel.fair, seed: (Math.random() * 1e9) | 0, roster, bots };
  room?.start(cfg);
  startRace(cfg);
};

// ---------- multiplayer ----------
function leaveRoom() {
  if (room) { room.onClosed = () => {}; room.close(); room = null; }
}
function wireRoom() {
  room.onRoster = () => { if (!race) renderSetup(); };
  room.onSettings = (s) => { Object.assign(sel, s); if (!race) renderSetup(); };
  room.onStart = (cfg) => startRace(cfg);
  room.onGame = (m) => race?.onNet(m);
  room.onLobby = () => { endRace(); show('setup'); renderSetup(); };
  room.onClosed = (why) => { room = null; endRace(); show('home'); toast(why || 'Verbinding verbroken'); };
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
    for (const z of tr.zones) { const t = book[`${d.id}|seg|${z.id}`]?.t; if (t) rows.push([(z.type === 'sprint' ? '⚡ ' : '⛰️ ') + z.name, t]); }
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
    case 'finish': audio.sfx('finish'); renderer.party(); setTimeout(showResults, 1800); break;
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
  const p = input.demoPower(dt, P.ftp);
  return { power: p, cadence: p > 20 ? 60 + (p / P.ftp) * 28 : 0, hr: hrm.value };
}
const getSteer = (dt) => clamp(input.steer(dt) + sterzo.steer, -1, 1);

let profDots = {};
function startRace(cfg) {
  lastCfg = cfg;
  hideOverlay();
  const track = getTrack(cfg.track);
  const meId = room ? room.me.id : 'p0';
  const iRunBots = !room || room.isHost;
  const riders = [
    ...cfg.roster.map((p) => ({ ...p, kind: p.id === meId ? 'me' : 'remote' })),
    ...cfg.bots.map((b) => ({ ...b, kind: iRunBots ? 'bot' : 'remote' })),
  ];
  const n = ns();
  const ghost = !room && sel.ghost ? getGhost(n, `${track.id}|ghost|${cfg.laps}`) : null;
  race = new Race({
    track, laps: cfg.laps, seed: cfg.seed, riders, room, isHost: iRunBots, ns: n,
    profile: { ...P, fair: cfg.fair }, difficulty: cfg.diff, ghost, getPower, getSteer, emit,
  });
  paused = false;
  banners.length = 0; bannerT = 0;
  input.clear();
  renderer.confetti = [];
  $('ui').classList.add('ingame');
  $('hud').classList.remove('hidden');
  $('h-count').textContent = '';
  drawProfile($('h-prof'), track, profDots);
  $('h-dots').innerHTML = '';
  renderer.resize();
  if (P.music) audio.startMusic();
  navigator.wakeLock?.request('screen').then((w) => { wake = w; }).catch(() => {});
}

function endRace() {
  if (race) race.savePower();
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

function overlay(html) { $('overlay-card').innerHTML = html; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); clearInterval(resultsTimer); }

function togglePause() {
  if (!race || race.state === 'done') return;
  if (!$('overlay').classList.contains('hidden')) { paused = false; hideOverlay(); return; }
  paused = !room;
  overlay(`<h2>${room ? 'Race verlaten?' : 'Pauze'}</h2><div class="menu">
    <button class="big" id="ov-resume">Verder rijden</button>
    ${room ? '' : '<button class="ghost" id="ov-restart">Opnieuw</button>'}
    <button class="ghost" id="ov-quit">Stoppen</button></div>`);
  $('ov-resume').onclick = () => { paused = false; hideOverlay(); };
  if (!room) $('ov-restart').onclick = () => startRace({ ...lastCfg, seed: (Math.random() * 1e9) | 0 });
  $('ov-quit').onclick = quitToMenu;
}

function showResults() {
  if (!race) return;
  const r = race;
  const render = () => {
    if (race !== r) return;
    const res = r.results(), st = r.stats, me = r.me;
    const avgP = st.n ? st.sumP / st.n : 0;
    const win = me.rank === 1 && res.length > 1;
    const rows = res.map((x) => `<tr class="${x.me ? 'me' : ''}"><td>${x.rank}</td><td><span style="color:${esc(x.color)}">●</span> ${esc(x.name)}</td><td>${x.time != null ? fmtTime(x.time, 2) : '…'}</td></tr>`).join('');
    const prs = r.prs.map((p) => `<li>${esc(p.label)}: ${fmtTime(p.t, 2)}${p.prev ? ` (${fmtDelta(p.t - p.prev)})` : ''}</li>`);
    const pn = { 5: '5 s', 60: '1 min', 300: '5 min' };
    for (const w of r.powerPRs || []) prs.push(`<li>Vermogen ${pn[w]}: ${Math.round(st.best[w])} W</li>`);
    overlay(`<h2>${win ? '🥇 GEWONNEN!' : me.rank + 'e plaats'}</h2>
      <table>${rows}</table>
      ${prs.length ? `<p><b>🏆 Nieuwe records</b></p><ul class="prlist">${prs.join('')}</ul>` : ''}
      <div class="statgrid">
        <div><b>${Math.round(avgP)} W</b>gemiddeld</div><div><b>${Math.round(st.maxP)} W</b>piek</div>
        <div><b>${Math.round(st.best[5])} W</b>beste 5 s</div><div><b>${((r.total / me.finishTime) * 3.6).toFixed(1)}</b>km/u gem.</div>
        <div><b>${(st.maxV * 3.6).toFixed(0)}</b>km/u top</div>${st.nHr ? `<div><b>${Math.round(st.sumHr / st.nHr)}</b>❤ gemiddeld</div><div><b>${st.maxHr}</b>❤ max</div>` : ''}<div><b>${Math.round((avgP * me.finishTime) / 1000)} kJ</b>arbeid</div>
      </div>
      ${r.ns === 'demo' ? '<p class="small">Demo-modus: tijden tellen apart van je trainer-records.</p>' : ''}
      <div class="menu">${room ? (room.isHost ? '<button class="big" id="ov-lobby">Terug naar kamer</button>' : '<p class="small">Wacht op de host voor de volgende race…</p><button class="ghost" id="ov-quit">Verlaten</button>')
        : '<button class="big" id="ov-again">Nog een keer</button><button class="ghost" id="ov-quit">Menu</button>'}</div>`);
    if ($('ov-lobby')) $('ov-lobby').onclick = quitToMenu;
    if ($('ov-again')) $('ov-again').onclick = () => startRace({ ...lastCfg, seed: (Math.random() * 1e9) | 0 });
    if ($('ov-quit')) $('ov-quit').onclick = quitToMenu;
  };
  render();
  clearInterval(resultsTimer);
  resultsTimer = setInterval(() => { if (r.riders.some((x) => !x.finished)) render(); }, 1500);
}

// ---------- HUD ----------
let hudSlow = 0, rouletteTick = 0;
const itemKeys = Object.keys(ITEMS);
function hud(dt) {
  const r = race, me = r.me;
  $('h-watt').firstChild.nodeValue = Math.round(me.power);
  $('h-spd').textContent = (me.v * 3.6).toFixed(0);
  $('h-time').textContent = fmtTime(r.time);
  const it = $('h-item');
  if (me.roulette > 0) {
    rouletteTick -= dt;
    if (rouletteTick <= 0) { rouletteTick = 0.08; $('h-item-i').textContent = ITEMS[itemKeys[Math.floor(Math.random() * itemKeys.length)]].icon; audio.sfx('tick'); }
    it.classList.remove('has');
  } else {
    $('h-item-i').textContent = me.item ? ITEMS[me.item].icon : '';
    it.classList.toggle('has', !!me.item);
  }
  // banners
  bannerT -= dt;
  const bn = $('h-banner');
  if (bannerT <= 0 && banners.length) {
    const b = banners.shift();
    bn.innerHTML = esc(b.text) + (b.sub ? `<small>${esc(b.sub)}</small>` : '');
    bn.style.color = b.color || '#fff';
    bn.classList.add('show');
    bannerT = 2.2;
  } else if (bannerT <= 0.3) bn.classList.remove('show');

  hudSlow -= dt;
  if (hudSlow > 0) return;
  hudSlow = 0.2;
  const total = r.riders.length;
  $('h-pos').innerHTML = `${me.rank}<small>/${total}</small>`;
  $('h-lap').textContent = `Ronde ${clamp(Math.floor(Math.max(0, me.dist) / r.L) + 1, 1, r.laps)}/${r.laps} · ${(Math.max(0, r.total - me.dist) / 1000).toFixed(2)} km`;
  $('h-cad').textContent = Math.round(me.cadence);
  $('h-grade').textContent = r.track.segAt(me.dist).grade.toFixed(1);
  $('h-bolts').textContent = '⚡ ' + me.bolts;
  $('h-hr').classList.toggle('hidden', !me.hr);
  $('h-hr-v').textContent = me.hr || '';
  $('h-draft').classList.toggle('hidden', !me.draft);
  $('h-item-n').textContent = me.item ? ITEMS[me.item].name : 'spatie';
  const d = $('h-delta');
  if (r.ghostDelta != null) {
    d.textContent = fmtDelta(r.ghostDelta) + ' vs PR';
    d.className = r.ghostDelta <= 0 ? 'ahead' : 'behind';
  } else d.textContent = '';
  const z = $('h-zone');
  z.classList.toggle('hidden', !r.activeZone);
  if (r.activeZone) {
    const a = r.activeZone;
    z.textContent = `${a.zone.name} ${fmtTime(r.time - a.t0)}${a.pr ? ' · PR ' + fmtTime(a.pr) : ''}`;
    z.style.borderColor = a.zone.type === 'sprint' ? '#39ffb0' : '#ff7b1c';
  }
  $('h-rank').innerHTML = r.order.map((x) => {
    const gap = x === me ? '' : x.finished ? ' 🏁' : ` ${x.dist > me.dist ? '+' : '−'}${Math.abs(x.dist - me.dist).toFixed(0)}m`;
    return `<div class="${x === me ? 'me' : ''}"><span style="color:${esc(x.color)}">●</span> ${x.rank}. ${esc(x.name)}${gap}</div>`;
  }).join('');
  $('h-feed').innerHTML = r.feed.filter((f) => r.clock - f.at < 6).map((f) => `<div>${esc(f.text)}</div>`).join('');
  // stippen op het profiel
  const dots = $('h-dots');
  const list = r.ghostRider && !r.ghostRider.hidden ? [...r.riders, r.ghostRider] : r.riders;
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
let last = performance.now();
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
  const frameDt = dt;
  if (!paused) {
    while (dt > 0.0001 && race) { const step = Math.min(dt, 0.04); race.update(step); dt -= step; }
    if (!race) return;
    audio.setIntensity(race.me.power / (P.ftp * 1.5));
    trainer.setGrade(race.state === 'race' ? race.trainerGrade : 0);
  }
  renderer.draw(race, paused ? 0 : frameDt);
  hud(frameDt);
}
requestAnimationFrame(frame);

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
window.addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && race) navigator.wakeLock?.request('screen').then((w) => { wake = w; }).catch(() => {});
});
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touchy');
bindTouch($('t-left'), 'left'); bindTouch($('t-right'), 'right'); bindTouch($('t-pedal'), 'pedal');
$('t-left').classList.add('on'); $('t-right').classList.add('on');
$('h-item').onclick = () => input.trigger('item');
$('h-menu').onclick = () => togglePause();
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

// Start
show('home');
const join = new URLSearchParams(location.search).get('join') || (/^#join-([a-z]{4})$/i.exec(location.hash) || [])[1];
if (join) { $('j-code').value = join.toUpperCase().slice(0, 4); show('join'); }
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (HOSTED) $('b-copy').textContent = 'Code kopiëren';
window.__wb = { get race() { return race; }, sel, trainer, sterzo, hrm }; // voor testen/debuggen
