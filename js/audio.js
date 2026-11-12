// Geluid: alles gesynthetiseerd met WebAudio (geen bestanden nodig).
let ctx = null, master = null, musicGain = null, sfxGain = null;
let musicOn = true, sfxOn = true, musicTimer = null, step = 0, nextAt = 0;
let intensity = 0.5;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
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
  hit: (t) => { tone(300, t, 0.4, 'sawtooth', 0.4, sfxGain, 50); noise(t, 0.3, 0.3, sfxGain, 200); },
  shield: (t) => tone(500, t, 0.3, 'sine', 0.3, sfxGain, 1000),
  block: (t) => { tone(1500, t, 0.12, 'triangle', 0.3); tone(1000, t + 0.08, 0.15, 'triangle', 0.25); },
  fire: (t) => { noise(t, 0.4, 0.25, sfxGain, 500); tone(900, t, 0.3, 'sawtooth', 0.15, sfxGain, 200); },
  drop: (t) => tone(400, t, 0.2, 'sine', 0.3, sfxGain, 120),
  storm: (t) => { noise(t, 1.2, 0.3, sfxGain, 100); tone(60, t, 1, 'sawtooth', 0.3); },
  bell: (t) => { tone(2100, t, 0.5, 'sine', 0.3); tone(2100, t + 0.18, 0.6, 'sine', 0.3); },
  pr: (t) => { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.1, 0.25, 'square', 0.25)); },
  zone: (t) => { tone(784, t, 0.12, 'square', 0.2); tone(1047, t + 0.12, 0.2, 'square', 0.2); },
  finish: (t) => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.13, 0.3, 'square', 0.25)); },
  lap: (t) => { tone(660, t, 0.1, 'triangle', 0.3); tone(880, t + 0.1, 0.25, 'triangle', 0.3); },
};

// Simpele synthwave-lus: bas + arpeggio + hihat.
const BASS = [110, 110, 87.3, 87.3, 130.8, 130.8, 98, 98];
const ARP = [0, 7, 12, 7, 15, 12, 7, 12];
function schedule() {
  if (!ctx || !musicOn) return;
  const spb = 60 / (112 + intensity * 30) / 2;
  while (nextAt < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 8) % BASS.length, s = step % 8;
    const root = BASS[bar];
    if (s % 2 === 0) tone(root / 2, nextAt, spb * 1.6, 'sawtooth', 0.35, musicGain);
    tone(root * 2 * Math.pow(2, ARP[s] / 12), nextAt, spb * 0.9, 'square', 0.12 + intensity * 0.1, musicGain);
    if (s % 2 === 1) noise(nextAt, 0.04, 0.12, musicGain, 6000);
    if (s % 4 === 0) tone(120, nextAt, 0.12, 'sine', 0.5, musicGain, 40);
    nextAt += spb;
    step++;
  }
}

export const audio = {
  unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
  sfx(name) {
    if (!sfxOn || !ensure() || ctx.state !== 'running') return;
    SFX[name]?.(ctx.currentTime + 0.005);
  },
  setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); },
  startMusic() {
    if (!ensure() || musicTimer) return;
    nextAt = ctx.currentTime + 0.1;
    musicTimer = setInterval(schedule, 80);
  },
  stopMusic() { clearInterval(musicTimer); musicTimer = null; },
  setOptions(music, sfx) { musicOn = music; sfxOn = sfx; },
};
