// Clubsound: rijke muziek die toch licht is. Bij de start "bakt" het spel per stijl een setje klanken
// (met galm, echo, filters en drive erin) in een OfflineAudioContext; daarna speelt het die alleen nog af.
// Vier stijlen: space disco, krautrock, electro (Justice/Soulwax) en techno. Een dirigent kiest per maat
// het deel (intro, groove, break, drop, variatie) op basis van wat er in de race of de workout gebeurt.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const ST = (k) => Math.pow(2, k / 12);

// ---------- synthese (alleen gebruikt om te bakken) ----------
function makeEngine(ctx, out) {
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.15;
  comp.connect(master); master.connect(out);
  const rev = ctx.createConvolver(), revOut = ctx.createGain(); revOut.gain.value = 0.32;
  { const len = Math.floor(ctx.sampleRate * 1.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    rev.buffer = ir; }
  rev.connect(revOut); revOut.connect(comp);
  const dly = ctx.createDelay(2), fb = ctx.createGain(), dlf = ctx.createBiquadFilter(), dlyOut = ctx.createGain();
  fb.gain.value = 0.38; dlf.type = 'lowpass'; dlf.frequency.value = 2600; dlyOut.gain.value = 0.35;
  dly.connect(dlf); dlf.connect(fb); fb.connect(dly); dlf.connect(dlyOut); dlyOut.connect(comp);
  const curve = (k) => { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); } return c; };
  const drive = ctx.createWaveShaper(); drive.curve = curve(6); drive.connect(comp);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  function route(node, { pan = 0, rv = 0, dl = 0, dr = false } = {}) {
    const p = ctx.createStereoPanner(); p.pan.value = pan; node.connect(p);
    p.connect(dr ? drive : comp);
    if (rv) { const g = ctx.createGain(); g.gain.value = rv; p.connect(g); g.connect(rev); }
    if (dl) { const g = ctx.createGain(); g.gain.value = dl; p.connect(g); g.connect(dly); }
  }
  function voice(t, { f, type = 'sawtooth', dur = 0.2, vol = 0.2, a = 0.005, r = 0.08, glide, glideT = 0.06, det = 0, lp, q = 1, env, bp, pan, rv, dl, dr, fm } = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (det) o.detune.value = det;
    if (glide) o.frequency.setTargetAtTime(glide, t, glideT);
    let node = o;
    if (fm) { const m = ctx.createOscillator(), mg = ctx.createGain(); m.frequency.value = f * fm.ratio; mg.gain.value = f * fm.depth; m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(t + dur + r + 0.05); }
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = q; fl.frequency.setValueAtTime(env ? env[0] : lp, t); if (env) fl.frequency.setTargetAtTime(lp, t, env[1]); node.connect(fl); node = fl; }
    if (bp) { const mix = ctx.createGain(); for (const [bf, bq, bg] of bp) { const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = bf; fl.Q.value = bq; const g = ctx.createGain(); g.gain.value = bg; node.connect(fl); fl.connect(g); g.connect(mix); } node = mix; }
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + Math.max(a, dur)); g.gain.setTargetAtTime(0, t + Math.max(a, dur), r / 3);
    node.connect(g); route(g, { pan, rv, dl, dr });
    o.start(t); o.stop(t + dur + r * 2 + 0.05);
  }
  function noise(t, { dur = 0.05, vol = 0.1, hp, bp, q = 1, lp, pan, rv, dl, sweep, a = 0.001 } = {}) {
    const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = bp ? 'bandpass' : lp ? 'lowpass' : 'highpass'; fl.frequency.setValueAtTime(bp || lp || hp || 1000, t); fl.Q.value = q;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setTargetAtTime(0, t + a, Math.max(0.005, dur / 3));
    s.connect(fl); fl.connect(g); route(g, { pan, rv, dl });
    s.start(t, Math.random()); s.stop(t + dur * 2 + 0.1);
  }
  // Bas en orgel met meerdere oscillatoren, sub en (voor Moog) een steiler filter; gaat direct naar de uitgang.
  function layered(t, o) {
    const sum = ctx.createGain();
    for (const os of o.oscs) {
      const x = ctx.createOscillator(); x.type = os.type; x.frequency.value = o.f * (os.mult || 1); if (os.det) x.detune.value = os.det;
      const g = ctx.createGain(); g.gain.value = os.vol; x.connect(g); g.connect(sum); x.start(t); x.stop(t + o.dur + o.r * 3 + 0.05);
    }
    let node = sum;
    for (let p = 0; p < (o.poles || 2) / 2; p++) {
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = p === 0 ? o.q || 0.7 : 0.6;
      fl.frequency.setValueAtTime(o.env ? o.env[0] : o.lp, t); if (o.env) fl.frequency.setTargetAtTime(o.lp, t, o.env[1]);
      node.connect(fl); node = fl;
    }
    if (o.drive) { const w = ctx.createWaveShaper(), cv = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; cv[i] = Math.tanh(x * o.drive) / Math.tanh(o.drive); } w.curve = cv; node.connect(w); node = w; }
    const amp = ctx.createGain(); amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(o.vol, t + o.a);
    amp.gain.setTargetAtTime(o.vol * (o.sus ?? 0.8), t + o.a, o.dec || 0.15); amp.gain.setValueAtTime(o.vol * (o.sus ?? 0.8), t + o.dur); amp.gain.setTargetAtTime(0, t + o.dur, o.r / 3);
    node.connect(amp); amp.connect(out);
    if (o.click) noise(t, { dur: 0.012, vol: o.click, hp: 1800 });
  }
  const D = {
    kick: (t, { v = 1, len = 0.35, drv = false, hi = 160 } = {}) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(hi, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09); o.frequency.exponentialRampToValueAtTime(40, t + len);
      g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      o.connect(g); route(g, { dr: drv }); o.start(t); o.stop(t + len + 0.05);
      noise(t, { dur: 0.008, vol: 0.25 * v, hp: 3000 });
    },
    clap: (t, v = 1, rv = 0.35) => { for (let i = 0; i < 3; i++) noise(t + i * 0.011, { dur: 0.012, vol: 0.18 * v, bp: 1300, q: 1.2 }); noise(t + 0.033, { dur: 0.18, vol: 0.16 * v, bp: 1200, q: 1, rv }); },
    hat: (t, v = 1, pan = 0.2) => noise(t, { dur: 0.03, vol: 0.075 * v, hp: 8000, pan }),
    ohat: (t, v = 1) => noise(t, { dur: 0.22, vol: 0.06 * v, hp: 7000, pan: -0.15, rv: 0.1 }),
    tom: (t, f, v = 1) => voice(t, { f, type: 'sine', dur: 0.15, vol: 0.4 * v, glide: f * 0.5, glideT: 0.08, r: 0.15, rv: 0.2 }),
    tamb: (t, v = 1) => noise(t, { dur: 0.06, vol: 0.05 * v, bp: 9000, q: 2, pan: 0.35 }),
    zap: (t, f = 2400) => voice(t, { f, type: 'sine', dur: 0.12, vol: 0.12, glide: 180, glideT: 0.05, r: 0.05, dl: 0.6, pan: 0.4 }),
  };
  return { n: midi, voice, noise, layered, D, setDelay: (sec) => { dly.delayTime.value = sec; } };
}

// Bakt alle klanken van een stijl in één offline render en knipt ze los (stille staarten eraf).
async function bakeKit(defs, sr) {
  const total = defs.reduce((s, d) => s + d.len + 0.05, 0);
  const off = new OfflineAudioContext(2, Math.ceil(total * sr), sr), E = makeEngine(off, off.destination);
  let t = 0; const slots = [];
  for (const d of defs) { d.play(E, t + 0.005); slots.push([d.name, t, d.len]); t += d.len + 0.05; }
  const big = await off.startRendering(), L = big.getChannelData(0), R = big.getChannelData(1), kit = {};
  for (const [name, t0, len] of slots) {
    const a = Math.floor(t0 * sr); let n = Math.floor(len * sr);
    while (n > 64 && Math.abs(L[a + n - 1]) < 0.001 && Math.abs(R[a + n - 1]) < 0.001) n--;
    const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
    b.getChannelData(0).set(L.subarray(a, a + n)); b.getChannelData(1).set(R.subarray(a, a + n));
    kit[name] = b;
  }
  return kit;
}

// ---------- gedeelde klanken: aanloop en inslag voor de drop ----------
const dropDefs = (s) => [
  { name: 'roll', len: 0.25, play: (E, t) => { E.noise(t, { dur: 0.09, vol: 0.2, hp: 1100 }); E.voice(t, { f: 210, type: 'triangle', dur: 0.03, vol: 0.12, glide: 150, r: 0.03 }); } },
  { name: 'impact', len: 2.6, play: (E, t) => { E.voice(t, { f: 70, type: 'sine', dur: 0.05, vol: 0.55, glide: 38, glideT: 0.25, r: 1.4 }); E.noise(t, { dur: 1.6, vol: 0.12, hp: 3500, rv: 0.6 }); E.noise(t, { dur: 0.6, vol: 0.1, lp: 300, rv: 0.4 }); } },
  { name: 'uplift', len: 16 * s + 0.3, play: (E, t) => { E.noise(t, { dur: 16 * s, vol: 0.13, hp: 250, sweep: 10000, a: 16 * s * 0.97, rv: 0.3 }); E.voice(t, { f: 110, type: 'sawtooth', dur: 16 * s, vol: 0.03, a: 16 * s * 0.9, glide: 880, glideT: 16 * s * 0.6, lp: 3000, r: 0.02 }); } },
  { name: 'crash', len: 2.2, play: (E, t) => E.noise(t, { dur: 1.3, vol: 0.08, hp: 5000, rv: 0.35 }) },
];
// Aanloop: roffel van achtsten → zestienden → tweeëndertigsten met een sweep; het laatste kwart blijft stil.
function buildRoll(P, k, t0, s, vol = 0.6) {
  P.play(k.uplift, t0, { vol: 0.75 });
  for (let i = 0; i < 12; i++) {
    const dens = i < 4 ? 2 : i < 8 ? 1 : 0.5;
    if (dens === 2 && i % 2) continue;
    for (let j = 0; j < (dens === 0.5 ? 2 : 1); j++) P.play(k.roll, t0 + (i + j * 0.5) * s, { vol: vol * (0.35 + 0.65 * i / 12) });
  }
}

// ---------- de vier stijlen, per maat ----------
// bar(P, k, x): x = { tb (starttijd), s (zestiende), sec, n (maat in het deel), len (lengte van het deel), g (maatteller),
//   lead (solo-synth aan), hype (extra energie), build (aanloop in deze maat), impact (eerste maat van de drop) }
const M = { kick: 1, snare: 0.8, clap: 0.75, hat: 0.7, perc: 0.55, bass: 0.6, pad: 0.45, hi: 0.5, lead: 0.3, acid: 0.4 };
export const CLUB = {
  disco: {
    name: 'Space disco', bpm: 118, gain: 2.2, // zachtere kick dan de rest: wat harder afspelen
    bake(s) {
      const d = [];
      d.push({ name: 'kick', len: 0.4, play: (E, t) => E.D.kick(t, { v: 0.95 }) });
      d.push({ name: 'clap', len: 0.9, play: (E, t) => E.D.clap(t, 0.9) });
      d.push({ name: 'hat', len: 0.08, play: (E, t) => E.D.hat(t, 0.8, 0) });
      d.push({ name: 'ohat', len: 0.5, play: (E, t) => E.D.ohat(t) });
      d.push({ name: 'shaker', len: 0.1, play: (E, t) => E.noise(t, { dur: 0.05, vol: 0.05, bp: 7000, q: 1.5, a: 0.015 }) });
      d.push({ name: 'bass', len: s * 0.8 + 0.12, play: (E, t) => E.layered(t, { f: midi(33), oscs: [{ type: 'square', vol: 0.35 }, { type: 'sawtooth', vol: 0.2, det: 5 }, { type: 'sine', vol: 0.6 }], lp: 600, env: [2400, 0.035], q: 2.5, dur: s * 0.7, a: 0.003, dec: 0.08, sus: 0.5, r: 0.04, vol: 0.1 }) });
      d.push({ name: 'blip', len: s + 0.9, play: (E, t) => { E.setDelay(s * 3); E.voice(t, { f: midi(81), type: 'triangle', dur: s * 0.5, vol: 0.05, dl: 0.5, rv: 0.2 }); } });
      d.push({ name: 'lead', len: s * 1.7 + 1.2, play: (E, t) => { E.setDelay(s * 3); E.voice(t, { f: midi(76), type: 'sawtooth', dur: s * 1.6, vol: 0.05, lp: 2400, q: 1.5, dl: 0.4, rv: 0.3, det: 6 }); } });
      for (const [k, ch] of Object.entries({ Am: [57, 60, 64], F: [57, 60, 65], G: [55, 59, 62], E: [56, 59, 64], Dm: [57, 62, 65] }))
        d.push({ name: 'pad' + k, len: s * 32 + 1.2, play: (E, t) => { for (const m of ch) for (const det of [-12, 12]) E.voice(t, { f: midi(m), type: 'sawtooth', dur: s * 31, vol: 0.022, a: 0.5, r: 0.6, det, lp: 1800, env: [400, 1.5], pan: det / 18, rv: 0.5 }); } });
      d.push({ name: 'zap', len: 1.2, play: (E, t) => { E.setDelay(s * 3); E.D.zap(t, 2200); } });
      return d;
    },
    bar(P, k, x) {
      const { tb, s, sec, n } = x;
      const prog = sec === 'B' ? [['F', 41], ['G', 43], ['Am', 45], ['Dm', 38]] : [['Am', 45], ['F', 41], ['G', 43], ['E', 40]];
      const [ck, root] = prog[Math.floor(n / 2) % 4];
      const lead = [76, -1, 74, 76, -1, 79, 76, -1, 74, -1, 72, 74, -1, 71, 72, -1];
      const notes = { Am: [69, 72, 76], F: [69, 72, 77], G: [67, 71, 74], E: [68, 71, 76], Dm: [69, 74, 77] }[ck];
      if (n % 2 === 0 && !x.build) P.play(k['pad' + ck], tb, { vol: M.pad * (sec === 'break' ? 1.4 : sec === 'intro' ? 0.7 : 1) });
      for (let i = 0; i < 16; i++) {
        const t = tb + i * s, full = sec !== 'break';
        if (x.build && i >= 12) break;
        if (full && (sec !== 'intro' || n >= 2) && i % 4 === 0) P.play(k.kick, t, { vol: M.kick });
        if (full && i % 4 === 2 && sec !== 'intro') P.play(k.ohat, t, { vol: M.hat });
        if (full && sec !== 'intro' && (i === 4 || i === 12)) P.play(k.clap, t, { vol: M.clap });
        if (sec !== 'intro' && !x.build) P.play(k.shaker, t, { vol: M.perc * (i % 2 ? 1 : 0.6) });
        if (full && sec !== 'intro' && i % 2 === 1 && (n % 8 >= 4 || x.hype)) P.play(k.hat, t, { vol: M.hat * 0.7 });
        if (full && (sec !== 'intro' || n >= 2)) P.play(k.bass, t, { rate: ST(root - 33 + (i % 2 ? 12 : 0)), vol: M.bass });
        if (i % 4 === 0 || (sec === 'break' && i % 2 === 0)) P.play(k.blip, t, { rate: ST(notes[(Math.floor(i / 2) + n) % 3] - 81 + 12), vol: M.hi });
        if (x.lead && lead[i] > 0) P.play(k.lead, t, { rate: ST(lead[i] - 76), vol: M.lead });
      }
      if (n % 4 === 3 && full_(sec) && !x.build) P.play(k.zap, tb + s * 14, { vol: 0.5 });
    },
  },
  kraut: {
    name: 'Krautrock', bpm: 140,
    bake(s) {
      const d = [];
      d.push({ name: 'kick', len: 0.3, play: (E, t) => E.D.kick(t, { v: 1, len: 0.24, hi: 140, drv: true }) });
      d.push({ name: 'snare', len: 0.6, play: (E, t) => { E.noise(t, { dur: 0.2, vol: 0.26, hp: 900, rv: 0.25 }); E.voice(t, { f: 220, type: 'triangle', dur: 0.05, vol: 0.18, glide: 140, r: 0.05 }); } });
      d.push({ name: 'hat', len: 0.1, play: (E, t) => E.noise(t, { dur: 0.05, vol: 0.08, hp: 6500 }) });
      d.push({ name: 'ohat', len: 0.4, play: (E, t) => E.D.ohat(t, 1) });
      d.push({ name: 'tamb', len: 0.12, play: (E, t) => E.D.tamb(t, 1) });
      d.push({ name: 'tom', len: 0.5, play: (E, t) => E.D.tom(t, 150, 1) });
      d.push({ name: 'bass', len: s * 1.5 + 0.25, play: (E, t) => E.layered(t, { f: midi(28), oscs: [{ type: 'triangle', vol: 0.7 }, { type: 'sine', vol: 0.55 }, { type: 'sawtooth', vol: 0.12 }], lp: 520, env: [1400, 0.04], q: 0.8, dur: s * 1.5, a: 0.004, dec: 0.18, sus: 0.6, r: 0.06, vol: 0.32, click: 0.05 }) });
      d.push({ name: 'chug', len: s + 0.15, play: (E, t) => { for (const [iv, det] of [[0, -7], [7, 7], [12, 0]]) E.voice(t, { f: midi(40 + iv), type: 'sawtooth', dur: s * 0.7, vol: 0.05, lp: 1300, env: [2600, 0.03], q: 1.2, det, dr: true }); } });
      d.push({ name: 'chord', len: s * 4 + 0.6, play: (E, t) => { for (const [iv, det] of [[0, -9], [7, 9], [12, 0], [19, 5]]) E.voice(t, { f: midi(40 + iv), type: 'sawtooth', dur: s * 3.6, vol: 0.04, lp: 2600, q: 1, det, dr: true, rv: 0.2, pan: det / 14 }); } });
      d.push({ name: 'organ', len: s * 1.8 + 0.4, play: (E, t) => { for (const [m, det] of [[52, -6], [55, 6], [59, 0]]) E.layered(t, { f: midi(m), oscs: [{ type: 'square', vol: 0.3, det }, { type: 'square', vol: 0.18, mult: 2, det: -det }, { type: 'sawtooth', vol: 0.08, mult: 1.5 }], lp: 2200, q: 0.7, dur: s * 1.4, a: 0.006, dec: 0.2, sus: 0.85, r: 0.08, vol: 0.06 }); } });
      return d;
    },
    bar(P, k, x) {
      const { tb, s, sec, n } = x, mx = { bass: 0.42, chug: 0.26, chord: 0.18, organ: 0.36 };
      const root = (sec === 'C' && n < 4 ? [38, 38, 43, 43] : sec === 'B' ? [40, 40, 43, 38] : [40, 40, 40, 38])[n % 4];
      const chugP = [1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 2, 2];
      const drums = sec !== 'break', drop = sec === 'B' || x.hype;
      if (sec === 'break' && !x.build) { P.play(k.chord, tb, { rate: ST(root - 40), vol: mx.chord * 1.6 }); P.play(k.chord, tb + 8 * s, { rate: ST(root - 40 + (n === x.len - 2 ? 3 : 0)), vol: mx.chord * 1.6 }); }
      for (let i = 0; i < 16; i++) {
        const t = tb + i * s;
        if (x.build && i >= 12) break;
        if (drums && (i % 4 === 0 || (sec !== 'intro' && (i === 6 || (i === 14 && n % 2))))) P.play(k.kick, t, { vol: M.kick });
        if (drums && sec !== 'intro' && (i === 4 || i === 12)) P.play(k.snare, t, { vol: 0.75 });
        if (drums) P.play(k.hat, t, { vol: 0.55 * (i % 2 ? (drop ? 0.8 : 0.45) : 1) });
        if (sec === 'break' && n >= x.len - 3 && i % 2 === 0 && !x.build) P.play(k.hat, t, { vol: 0.28 });
        if (drums && sec !== 'intro' && i % 8 === 6) P.play(k.ohat, t, { vol: 0.4 });
        if ((drop || sec === 'C') && i % 2 === 1) P.play(k.tamb, t, { vol: 0.45 });
        if ((sec !== 'intro' || n >= 2) && drums && i % 2 === 0) P.play(k.bass, t, { rate: ST(root - 40 + 12 + (i % 8 === 6 ? 12 : 0)), vol: mx.bass });
        if (drop && drums && i % 2 === 1) P.play(k.bass, t, { rate: ST(root - 40 + 12), vol: mx.bass * 0.6 });
        if (sec === 'A' && n >= 4 && chugP[i] === 2) P.play(k.chug, t, { rate: ST(root - 40 + (i > 12 ? 3 : 0)), vol: mx.chug });
        if ((drop || sec === 'C') && drums && chugP[i]) P.play(k.chug, t, { rate: ST(root - 40 + (chugP[i] === 2 && i > 12 ? 3 : 0)), vol: mx.chug * (chugP[i] === 2 ? 1.3 : 0.85) });
        if (((sec === 'break' && !x.build) || sec === 'C' || x.lead) && (i === 2 || i === 10)) P.play(k.organ, t, { rate: ST(root - 40 + (n % 4 === 3 && i === 10 ? 3 : 0)), vol: mx.organ });
      }
      if (x.fill && drums) for (let q = 0; q < 4; q++) P.play(k.tom, tb + (12 + q) * s, { rate: ST(-q * 3), vol: 0.75 });
    },
  },
  electro: {
    name: 'Electro', bpm: 124,
    bake(s) {
      const d = [];
      d.push({ name: 'kick', len: 0.4, play: (E, t) => E.D.kick(t, { v: 1, len: 0.3, hi: 150, drv: true }) });
      d.push({ name: 'clap', len: 0.8, play: (E, t) => { E.D.clap(t, 1, 0.3); E.noise(t, { dur: 0.12, vol: 0.12, hp: 1500 }); } });
      d.push({ name: 'hat', len: 0.08, play: (E, t) => E.D.hat(t, 0.9, 0) });
      d.push({ name: 'ohat', len: 0.5, play: (E, t) => E.D.ohat(t, 1) });
      const moog = (a) => (E, t) => E.layered(t, { f: midi(33), oscs: [{ type: 'sawtooth', vol: 0.4, det: -7 }, { type: 'sawtooth', vol: 0.4, det: 7 }, { type: 'square', vol: 0.45, mult: 0.5 }], lp: 420, env: [2600, 0.06], q: 3.5, poles: 4, dur: s * 1.7, a, dec: 0.12, sus: 0.7, r: 0.05, vol: 0.3, drive: 1.8 });
      d.push({ name: 'bass', len: s * 1.7 + 0.2, play: moog(0.004) });
      d.push({ name: 'bassDuck', len: s * 1.7 + 0.2, play: moog(s * 1.4) });
      d.push({ name: 'stab', len: s * 2 + 0.4, play: (E, t) => { for (const [m, det] of [[57, -10], [60, 10], [64, 0], [69, -5]]) E.voice(t, { f: midi(m), type: 'sawtooth', dur: s * 1.2, vol: 0.04, lp: 900, env: [5000, 0.05], q: 3, det, dr: true, rv: 0.15, pan: det / 14 }); } });
      d.push({ name: 'stabDuck', len: s * 4 + 0.4, play: (E, t) => { for (const [m, det] of [[57, -10], [60, 10], [64, 0], [69, -5]]) E.voice(t, { f: midi(m), type: 'sawtooth', dur: s * 3.6, vol: 0.035, a: s * 1.6, lp: 1600, q: 2, det, dr: true, rv: 0.2, pan: det / 14 }); } });
      d.push({ name: 'riff', len: s * 1.1 + 0.3, play: (E, t) => { E.setDelay(s * 3); E.voice(t, { f: midi(69), type: 'square', dur: s * 0.9, vol: 0.035, lp: 2200, env: [4500, 0.04], q: 4, dr: true, dl: 0.2 }); } });
      d.push({ name: 'blip', len: s + 0.6, play: (E, t) => { E.setDelay(s * 3); E.voice(t, { f: midi(93), type: 'square', dur: s * 0.3, vol: 0.025, lp: 5000, dl: 0.4 }); } });
      return d;
    },
    bar(P, k, x) {
      const { tb, s, sec, n } = x, mx = { bass: 0.5, stab: 0.28, pad: 0.16, riff: 0.18, blip: 0.3 };
      const [root, sh] = [[45, 0], [45, 0], [41, -4], [43, -2]][Math.floor(n / 2) % 4];
      const beat = sec !== 'break', drop = sec === 'B' || (sec === 'C' && n >= 4) || x.hype;
      const bp = drop ? [0, -1, 12, 0, -1, 0, 12, -1, 0, -1, 10, 12, -1, 7, 5, 3] : [0, -1, -1, 0, -1, -1, 12, -1, 0, -1, -1, 0, -1, -1, 10, -1];
      const riff = [12, -1, 12, 15, -1, 12, 10, -1, 12, -1, 15, 17, -1, 15, 12, -1];
      if (sec === 'break' && !x.build) { P.play(k.stabDuck, tb, { rate: ST(sh), vol: mx.pad }); P.play(k.stabDuck, tb + 8 * s, { rate: ST(sh), vol: mx.pad }); }
      for (let i = 0; i < 16; i++) {
        const t = tb + i * s;
        if (x.build && i >= 12) break;
        if (beat && (sec !== 'intro' || n >= 2) && i % 4 === 0) P.play(k.kick, t, { vol: M.kick });
        if (beat && sec !== 'intro' && (i === 4 || i === 12)) P.play(k.clap, t, { vol: 0.7 });
        if (beat && i % 4 === 2) P.play(k.ohat, t, { vol: 0.4 });
        if (beat && sec !== 'intro' && (i % 2 === 1 || drop)) P.play(k.hat, t, { vol: 0.5 * (i % 2 ? 0.5 : 0.3) });
        if (beat && bp[i] >= 0 && (sec !== 'intro' || n >= 1)) P.play(i % 4 === 0 ? k.bassDuck : k.bass, t, { rate: ST(root - 33 + bp[i]), vol: mx.bass });
        if ((drop || sec === 'C') && beat && (i === 2 || i === 10 || (n % 2 && i === 13))) P.play(k.stab, t, { rate: ST(sh), vol: mx.stab });
        if ((sec === 'intro' || (sec === 'A' && n % 4 === 3) || (sec === 'break' && !x.build)) && i % 2 === 0) P.play(k.blip, t, { rate: ST([0, 7, 12, 3][(i / 2) % 4] + sh), vol: mx.blip });
        if (x.lead && riff[i] >= 0) P.play(k.riff, t, { rate: ST(riff[i] - 12 + sh), vol: mx.riff });
      }
    },
  },
  techno: {
    name: 'Techno', bpm: 134,
    bake(s) {
      const d = [];
      d.push({ name: 'kick', len: 0.4, play: (E, t) => E.D.kick(t, { v: 1, drv: true, len: 0.32 }) });
      d.push({ name: 'rumble', len: s * 2 + 0.25, play: (E, t) => E.voice(t, { f: midi(33), type: 'sine', dur: s * 2, vol: 0.2, lp: 160, r: 0.1, rv: 0.2 }) });
      d.push({ name: 'hat', len: 0.08, play: (E, t) => E.D.hat(t, 1, 0) });
      d.push({ name: 'ohat', len: 0.5, play: (E, t) => E.D.ohat(t, 0.9) });
      d.push({ name: 'clap', len: 1.0, play: (E, t) => E.D.clap(t, 1, 0.45) });
      d.push({ name: 'ride', len: 0.6, play: (E, t) => E.noise(t, { dur: 0.35, vol: 0.035, bp: 9500, q: 3 }) });
      d.push({ name: 'perc', len: 1.0, play: (E, t) => { E.setDelay(s * 3); E.voice(t, { f: 1250, type: 'sine', dur: 0.02, vol: 0.07, r: 0.06, dl: 0.45, fm: { ratio: 2.4, depth: 1.2 } }); } });
      d.push({ name: 'bass', len: s * 0.9 + 0.06, play: (E, t) => E.voice(t, { f: midi(33), type: 'sawtooth', dur: s * 0.8, vol: 0.11, lp: 260, env: [700, 0.03], q: 3, r: 0.03 }) });
      for (let lv = 0; lv < 4; lv++) for (const ac of [0, 1]) {
        const cut = 280 + 520 * lv + (ac ? 600 : 0);
        d.push({ name: `acid${lv}${ac}`, len: s * 1.2 + 0.1, play: (E, t) => E.voice(t, { f: midi(45), type: 'sawtooth', dur: s * 1.1, vol: ac ? 0.11 : 0.08, lp: cut * 0.35, env: [cut, 0.06], q: 11, r: 0.03 }) });
      }
      d.push({ name: 'stab', len: 1.6, play: (E, t) => { E.setDelay(s * 3); for (const m of [57, 60, 64]) E.voice(t, { f: midi(m), type: 'sawtooth', dur: s * 0.5, vol: 0.022, lp: 1200, env: [2400, 0.03], dl: 0.55, rv: 0.25 }); } });
      return d;
    },
    bar(P, k, x) {
      const { tb, s, sec, n } = x, mx = { bass: 0.95, hi: 0.4 };
      const acid = [0, 0, 12, 0, 3, 0, 15, 0, 0, 12, 0, 7, 10, 0, 12, 3], acc = [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0], sl = [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0];
      const bassP = [0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0];
      const acidOn = (sec === 'A' && n >= 4) || sec === 'B' || x.lead;
      for (let i = 0; i < 16; i++) {
        const t = tb + i * s, beat = sec !== 'break';
        if (x.build && i >= 12) break;
        if (beat && i % 4 === 0) { P.play(k.kick, t, { vol: M.kick }); P.play(k.rumble, t + s * 0.5, { vol: mx.bass * 0.8 }); }
        if (sec !== 'intro' || n >= 2) P.play(k.hat, t, { vol: M.hat * (i % 4 === 2 ? 1 : 0.5) });
        if (beat && sec !== 'intro' && i % 4 === 2) P.play(k.ohat, t, { vol: M.hat });
        if (beat && sec !== 'intro' && (i === 4 || i === 12)) P.play(k.clap, t, { vol: M.clap });
        if ((sec === 'B' || sec === 'C' || x.hype) && i % 4 === 0) P.play(k.ride, t, { vol: M.perc });
        if (beat && sec !== 'intro' && bassP[i]) P.play(k.bass, t, { rate: ST(i === 14 ? 3 : 0), vol: mx.bass });
        if ((sec === 'A' || (sec === 'break' && !x.build) || sec === 'C') && (i === 2 || i === 9) && n % 2 === 1) P.play(k.perc, t, { rate: ST(i === 9 ? 5 : 0), vol: mx.hi });
        if (acidOn && beat) {
          const lv = Math.min(3, Math.floor(((n % 8) / 8) * 4 * (0.7 + 0.3 * Math.sin(i * 0.4) ** 2)));
          P.play(k[`acid${lv}${acc[i]}`], t, { rate: ST(acid[i]), glide: sl[i] ? ST(acid[(i + 1) % 16]) : null, dur: s * (sl[i] ? 1.05 : 0.55), vol: M.acid });
        }
        if (((sec === 'break' && !x.build) || sec === 'C') && (i === 3 || i === 11) && n % 2 === 0) P.play(k.stab, t, { vol: M.lead * 1.5 });
      }
    },
  },
};
function full_(sec) { return sec !== 'break' && sec !== 'intro'; }
export const CLUB_ORDER = ['disco', 'kraut', 'electro', 'techno'];
const LEN = { intro: 4, A: 8, break: 4, B: 8, C: 8 };

// ---------- speler + dirigent ----------
export function makeClub(ctx, dest) {
  const bus = ctx.createGain(); bus.gain.value = 0.5; bus.connect(dest); // ongeveer even hard als de arcade-muziek
  const gains = new Map();
  const shared = (vol) => { const key = Math.round(vol * 40); let g = gains.get(key); if (!g) { g = ctx.createGain(); g.gain.value = key / 40; g.connect(bus); gains.set(key, g); } return g; };
  const P = {
    play(buf, t, { rate = 1, vol = 1, glide, glideT = 0.04, dur } = {}) {
      if (!buf || t < ctx.currentTime - 0.01) return;
      const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
      if (glide) s.playbackRate.setTargetAtTime(glide, t, glideT);
      if (dur) { const g = ctx.createGain(); g.gain.value = vol; g.gain.setValueAtTime(vol, t + dur); g.gain.setTargetAtTime(0, t + dur, 0.02); s.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.15); }
      else { s.connect(shared(vol)); s.start(t); }
    },
  };
  const kits = new Map(); // hooguit twee stijlen tegelijk in het geheugen
  let style = null, kit = null, pending = null, fresh = true, nextAt = 0, sec = 'intro', n = 0, g = 0, cycle = 0, riserFor = -1;
  const st = { intensity: 0.5, zone: null, lastLap: false, finale: false, wkLevel: null, wkFree: false, riser: 0, done: false };
  const dropKits = new Set();

  async function prepare(name) {
    if (kits.has(name)) return kits.get(name);
    const S = CLUB[name], s = 60 / S.bpm / 4;
    const k = await bakeKit([...S.bake(s), ...dropDefs(s)], ctx.sampleRate);
    kits.set(name, k);
    while (kits.size > 2) { const first = [...kits.keys()].find((x) => x !== name && x !== style); if (!first) break; kits.delete(first); }
    return k;
  }
  // Welk deel past bij wat er nu gebeurt?
  function wanted() {
    if (st.done) return 'break';
    if (st.wkLevel != null || st.wkFree) {
      const f = st.wkFree ? 0.7 : st.wkLevel;
      return f < 0.56 ? 'intro' : f < 0.85 ? 'A' : null; // null = zwaar blok: drop/variatie
    }
    return undefined; // race: gewone volgorde
  }
  function advance() {
    n++;
    const w = wanted();
    if (w === 'intro' || w === 'A' || (w === 'break' && sec !== 'break')) { if (sec !== w) { sec = w; n = 0; } else if (n >= LEN[sec]) n = 0; return; }
    if (w === null) { if (sec !== 'B' && sec !== 'C') { sec = 'B'; n = 0; } else if (n >= LEN[sec]) { sec = sec === 'B' ? 'C' : 'B'; n = 0; } return; }
    if (w === 'break') { if (n >= LEN.break) n = 0; return; }
    if (n < LEN[sec]) return;
    n = 0;
    const order = ['A', 'break', 'B', 'C'];
    let next = sec === 'intro' ? 'A' : order[(order.indexOf(sec) + 1) % 4];
    if (next === 'break' && (st.lastLap || st.finale)) next = 'B'; // laatste ronde/finale: geen rustmoment
    if (next === 'A' && sec === 'C') cycle++;
    sec = next;
  }
  function scheduleBar(tb) {
    const S = CLUB[style], s = 60 / S.bpm / 4, len = LEN[sec];
    const hype = st.zone === 'sprint' || st.zone === 'climb' || st.lastLap || st.finale || (st.wkLevel != null && st.wkLevel >= 1.05);
    const nextIsDrop = st.wkLevel == null && !st.done && sec === 'break' && n === len - 1;
    const x = { tb, s, sec, n, len, g, hype, build: nextIsDrop, impact: sec === 'B' && n === 0,
      lead: hype || (sec === 'B' && n >= 4) || (sec === 'C' && n >= 4 && n < 7 && cycle % 2 === 0), fill: n === len - 1 && sec !== 'break' && sec !== 'intro' };
    if (x.impact && Math.abs(tb - riserFor) > 2) { P.play(kit.impact, tb, { vol: 0.9 }); P.play(kit.crash, tb, { vol: 0.65 }); } // (niet dubbel na een workout-aanloop)
    else if (n === 0 && (sec === 'A' || sec === 'C')) P.play(kit.crash, tb, { vol: 0.5 });
    if (x.build) buildRoll(P, kit, tb, s);
    S.bar(P, kit, x);
    // workout: aanloop naar een zwaarder blok, getimed op het begin van dat blok
    if (st.riser > 0) {
      const target = ctx.currentTime + st.riser;
      if (Math.abs(target - riserFor) > 1.5) {
        riserFor = target;
        const t0 = Math.max(ctx.currentTime + 0.05, target - 16 * s);
        buildRoll(P, kit, t0, s);
        P.play(kit.impact, target, { vol: 0.9 }); P.play(kit.crash, target, { vol: 0.6 });
      }
    }
  }
  return {
    state: st,
    get style() { return style; },
    name: (k) => CLUB[k]?.name || k,
    prepare,
    // Wissel van stijl (meteen of op de volgende maat zodra de klanken klaar zijn).
    async setStyle(name) {
      if (!CLUB[name]) return;
      pending = name;
      const k = await prepare(name);
      if (pending !== name) return;
      const first = !style || fresh;
      if (name === style && !first) { pending = null; return; }
      fresh = false;
      style = name; kit = k; pending = null;
      bus.gain.setTargetAtTime(0.5 * (CLUB[name].gain || 1), ctx.currentTime, 0.3);
      if (first) { sec = 'intro'; n = 0; g = 0; nextAt = Math.max(nextAt, ctx.currentTime + 0.1); }
      else { sec = st.done ? 'break' : 'A'; n = 0; }
    },
    reset(t) { nextAt = t; sec = 'intro'; n = 0; g = 0; cycle = 0; riserFor = -1; fresh = true; },
    schedule(until) {
      if (!kit) return;
      const barLen = (4 * 60) / CLUB[style].bpm;
      if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05; // na een hapering niet alles inhalen
      while (nextAt < until) { scheduleBar(nextAt); nextAt += barLen; g++; advance(); }
    },
  };
}
