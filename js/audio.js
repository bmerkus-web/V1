// Geluid: alles gesynthetiseerd met WebAudio (geen bestanden nodig).
import { makeMusic } from './music.js';
import { makeClub, CLUB_ORDER } from './clubsound.js';
let ctx = null, master = null, musicGain = null, sfxGain = null;
let musicOn = true, sfxOn = true, musicTimer = null, step = 0, nextAt = 0;
let intensity = 0.5, musicVol = 1, sfxVol = 1; // volumeschuiven (0..1)

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.22 * musicVol; musicGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5 * sfxVol; sfxGain.connect(master);
  return true;
}

function tone(freq, t, dur, type = 'square', vol = 0.3, dest = sfxGain, slideTo = null) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(t, dur, vol = 0.2, dest = sfxGain, hp = 1000) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t);
}

const SFX = {
  count: (t) => tone(440, t, 0.15, 'square', 0.3),
  go: (t) => { tone(880, t, 0.5, 'square', 0.35); tone(1320, t, 0.5, 'triangle', 0.2); },
  bolt: (t) => { tone(1200, t, 0.06, 'square', 0.15); tone(1800, t + 0.05, 0.08, 'square', 0.15); },
  box: (t) => { for (let i = 0; i < 4; i++) tone(600 + i * 200, t + i * 0.05, 0.07, 'triangle', 0.25); },
  tick: (t) => tone(900, t, 0.03, 'square', 0.08),
  item: (t) => { tone(660, t, 0.1, 'square', 0.25); tone(990, t + 0.1, 0.2, 'square', 0.25); },
  boost: (t) => { tone(200, t, 0.6, 'sawtooth', 0.3, sfxGain, 1400); noise(t, 0.5, 0.15); },
  kwak: (t) => { tone(160, t, 0.18, 'square', 0.4, sfxGain, 70); noise(t, 0.12, 0.35, sfxGain, 800); tone(900, t + 0.05, 0.12, 'triangle', 0.2, sfxGain, 300); },
  alarm: (t) => { for (let i = 0; i < 3; i++) tone(1400, t + i * 0.14, 0.08, 'square', 0.25); },
  psst: (t) => { noise(t, 1.1, 0.35, sfxGain, 3000); tone(220, t, 0.25, 'square', 0.2, sfxGain, 90); },
  whistle: (t) => { tone(2600, t, 0.18, 'sine', 0.35); tone(2600, t + 0.24, 0.45, 'sine', 0.35); },
  scooter: (t) => { tone(70, t, 0.7, 'sawtooth', 0.3, sfxGain, 140); tone(140, t, 0.7, 'square', 0.12, sfxGain, 260); },
  rattle: (t) => { noise(t, 0.06, 0.09, sfxGain, 1200); },
  hit: (t) => { tone(300, t, 0.4, 'sawtooth', 0.4, sfxGain, 50); noise(t, 0.3, 0.3, sfxGain, 200); },
  shield: (t) => tone(500, t, 0.3, 'sine', 0.3, sfxGain, 1000),
  block: (t) => { tone(1500, t, 0.12, 'triangle', 0.3); tone(1000, t + 0.08, 0.15, 'triangle', 0.25); },
  fire: (t) => { noise(t, 0.4, 0.25, sfxGain, 500); tone(900, t, 0.3, 'sawtooth', 0.15, sfxGain, 200); },
  drop: (t) => tone(400, t, 0.2, 'sine', 0.3, sfxGain, 120),
  storm: (t) => { noise(t, 1.2, 0.3, sfxGain, 100); tone(60, t, 1, 'sawtooth', 0.3); },
  elbow: (t) => { tone(330, t, 0.07, 'square', 0.12); tone(495, t + 0.08, 0.1, 'square', 0.12); }, // kort 'hup-hup': overnemen!
  pr: (t) => { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.1, 0.25, 'square', 0.25)); },
  zone: (t) => { tone(784, t, 0.12, 'square', 0.2); tone(1047, t + 0.12, 0.2, 'square', 0.2); },
  finish: (t) => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.13, 0.3, 'square', 0.25)); },
  lap: (t) => { tone(660, t, 0.1, 'triangle', 0.3); tone(880, t + 0.1, 0.25, 'triangle', 0.3); },
};

// Muziek: zie music.js (thema per baan, lagen die meegaan met de race en de workout).
// Twee soorten muziek: 'club' (gebakken klanken, standaard) of 'arcade' (de oude 8-bit, live).
let music = null, club = null, scene = 'polder', mode = 'club', userTrack = null;
const ARCADE_ORDER = ['polder', 'vulkaan', 'kosmo', 'zen'];
const CLUB_FOR = { polder: 'disco', vulkaan: 'kraut', kosmo: 'electro', zen: 'techno' };
const ARCADE_NAME = { polder: 'Arcade · Neon', vulkaan: 'Arcade · Vulkaan', kosmo: 'Arcade · Kosmos', zen: 'Arcade · Zen' };
// Radio: tien zenders met elk een eigen sound; per baan een voorkeurszender.
export const STATIONS = {
  fipgroove: { name: 'FIP Groove', sound: 'funk, soul, disco', urls: ['https://icecast.radiofrance.fr/fipgroove-midfi.mp3', 'https://icecast.radiofrance.fr/fipgroove-hifi.aac'] },
  fiprock: { name: 'FIP Rock', sound: 'rock', urls: ['https://icecast.radiofrance.fr/fiprock-midfi.mp3', 'https://icecast.radiofrance.fr/fiprock-hifi.aac'] },
  intergalactic: { name: 'Intergalactic FM', sound: 'electro en italo', urls: ['https://radio.intergalactic.fm/1', 'http://radio.intergalactic.fm/1'] },
  darksynth: { name: 'Nightride Darksynth', sound: 'donkere, stuwende synths', urls: ['https://stream.nightride.fm/darksynth.mp3'] },
  kexp: { name: 'KEXP', sound: 'indie en alternatief', urls: ['https://kexp-mp3-128.streamguys1.com/kexp128.mp3', 'https://kexp.streamguys1.com/kexp160.aac'] },
  fipelectro: { name: 'FIP Electro', sound: 'elektronisch', urls: ['https://icecast.radiofrance.fr/fipelectro-midfi.mp3', 'https://icecast.radiofrance.fr/fipelectro-hifi.aac'] },
  fipjazz: { name: 'FIP Jazz', sound: 'jazz', urls: ['https://icecast.radiofrance.fr/fipjazz-midfi.mp3', 'https://icecast.radiofrance.fr/fipjazz-hifi.aac'] },
  fipworld: { name: 'FIP World', sound: 'wereldmuziek', urls: ['https://icecast.radiofrance.fr/fipworld-midfi.mp3', 'https://icecast.radiofrance.fr/fipworld-hifi.aac'] },
  chillsynth: { name: 'Nightride Chillsynth', sound: 'chill synthwave', urls: ['https://stream.nightride.fm/chillsynth.mp3'] },
  paradise: { name: 'Radio Paradise', sound: 'eclectisch, van rock tot elektronica', urls: ['https://stream.radioparadise.com/mp3-128', 'https://stream.radioparadise.com/aac-128'] },
};
const RADIO_ORDER = Object.keys(STATIONS);
const RADIO_FOR = { polder: 'fipgroove', vulkaan: 'fiprock', kosmo: 'intergalactic', zen: 'darksynth' };
let radio = null, radioTry = 0, radioSkips = 0, notice = () => {};
const currentTrack = () => userTrack || (mode === 'club' ? CLUB_FOR[scene] || 'disco' : mode === 'radio' ? RADIO_FOR[scene] || 'fipgroove' : scene);
// Speelt een zender af; lukt het niet, dan het reserve-adres en daarna de volgende zender.
function playStation(id, fresh = true) {
  const st = STATIONS[id]; if (!st) return;
  if (!radio) {
    radio = new Audio(); radio.preload = 'none';
    radio.addEventListener('error', () => {
      const cur = STATIONS[radio._id]; if (!cur || !radio._on) return;
      if (++radioTry < cur.urls.length) { radio.src = cur.urls[radioTry]; radio.play().catch(() => {}); return; }
      if (++radioSkips >= RADIO_ORDER.length) { notice('📻 Geen enkele zender bereikbaar (internet?)'); return; }
      notice(`📻 ${cur.name} niet bereikbaar – volgende zender`);
      userTrack = RADIO_ORDER[(RADIO_ORDER.indexOf(radio._id) + 1) % RADIO_ORDER.length];
      playStation(userTrack, false);
    });
    radio.addEventListener('playing', () => { radioSkips = 0; });
  }
  if (fresh) radioSkips = 0;
  radio._id = id; radio._on = true; radioTry = 0;
  radio.volume = Math.min(1, 0.55 * musicVol);
  radio.src = st.urls[0];
  radio.play().catch(() => {}); // fouten komen via het 'error'-event
}
function stopRadio() { if (!radio) return; radio._on = false; radio.pause(); radio.removeAttribute('src'); radio.load(); }
function schedule() {
  if (!ctx || !musicOn) return;
  if (mode === 'radio') return;
  if (mode === 'club') club?.schedule(ctx.currentTime + 0.25);
  else music?.schedule(ctx.currentTime + 0.25);
}
function applyTrack() {
  const t = currentTrack();
  if (mode === 'club') { if (club) club.setStyle(t); }
  else if (mode === 'radio') { if (musicTimer) playStation(t); }
  else if (music) music.setTheme(t);
}

export const audio = {
  unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
  sfx(name) {
    if (!sfxOn || !ensure() || ctx.state !== 'running') return;
    SFX[name]?.(ctx.currentTime + 0.005);
  },
  setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); if (music) music.state.intensity = intensity; },
  // Sfeer van de baan: 'polder', 'vulkaan', 'kosmo' of 'zen'. Een zelfgekozen nummer blijft staan tot de race voorbij is.
  // Club en Arcade wisselen mee na een teleport; de radio niet (die zender ligt vast zodra hij speelt).
  setScene(name) { scene = name; if (!userTrack) applyTrack(); },
  // Wat er in het spel gebeurt: { intensity, zone, lastLap, finale, wkLevel, wkFree, riser, done }
  setState(o) { if (music) Object.assign(music.state, o); if (club) Object.assign(club.state, o); },
  // 'club' of 'arcade'
  setMode(m) {
    if (m === mode) return;
    mode = m; userTrack = null;
    if (musicTimer) { this.stopMusic(); this.startMusic(); }
  },
  // Klanken alvast klaarzetten (bijv. in het menu), zodat de muziek meteen bij de start begint.
  prepare(sceneName) { if (mode === 'club' && ensure()) { club ||= makeClub(ctx, musicGain); club.prepare(CLUB_FOR[sceneName] || 'disco').catch(() => {}); } },
  // Carrousel: naar het volgende nummer. Geeft de naam terug.
  nextTrack() {
    const list = mode === 'club' ? CLUB_ORDER : mode === 'radio' ? RADIO_ORDER : ARCADE_ORDER, cur = currentTrack();
    userTrack = list[(list.indexOf(cur) + 1) % list.length];
    applyTrack();
    return this.trackName();
  },
  trackName() {
    const t = currentTrack();
    if (mode === 'radio') return `📻 ${STATIONS[t].name} · ${STATIONS[t].sound}`;
    return '🎵 ' + (mode === 'club' ? (club ? club.name(t) : t) : ARCADE_NAME[t] || t);
  },
  clearUserTrack() { userTrack = null; },
  startMusic() {
    if (!ensure() || musicTimer) return;
    if (mode === 'radio') {
      userTrack ||= currentTrack(); // zender vastzetten: bij een teleport naar een andere baan blijft hij staan
      playStation(userTrack);
      musicTimer = setInterval(schedule, 1000); // markeert 'speelt'
      return;
    }
    if (mode === 'club') {
      club ||= makeClub(ctx, musicGain);
      club.reset(ctx.currentTime + 0.1);
      club.setStyle(currentTrack());
    } else {
      music ||= makeMusic(ctx, musicGain);
      music.setTheme(currentTrack());
      music.reset(ctx.currentTime + 0.1);
    }
    musicTimer = setInterval(schedule, 80);
  },
  stopMusic() { clearInterval(musicTimer); musicTimer = null; stopRadio(); },
  setOptions(music, sfx) { musicOn = music; sfxOn = sfx; if (!musicOn) stopRadio(); else if (mode === 'radio' && musicTimer && !radio?._on) playStation(currentTrack()); },
  // Meldingen voor de speler (bijv. een zender die niet bereikbaar is).
  onNotice(fn) { notice = fn; },
  // Volumes uit de instellingen (0..1); kwadratisch, zodat de schuif natuurlijker aanvoelt.
  setVolumes(m, s) {
    musicVol = m * m; sfxVol = s * s;
    if (ctx) { musicGain.gain.setTargetAtTime(0.22 * musicVol, ctx.currentTime, 0.05); sfxGain.gain.setTargetAtTime(0.5 * sfxVol, ctx.currentTime, 0.05); }
    if (radio) radio.volume = Math.min(1, 0.55 * musicVol);
  },
};
