// Muziek: alles live gemaakt met WebAudio (geen bestanden). Elke baan heeft een eigen sfeer, de muziek gaat
// mee met de race (sprint, klim, kasseien, laatste ronde) en met je workout (rustig in herstel, opzwepend in
// intervallen, een opbouw voor elk nieuw blok). Akkoordenreeksen en melodieën wisselen elkaar af.
//
// makeMusic(ctx, dest) werkt met een gewone én een offline AudioContext (handig om te testen of op te nemen).

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CH = { m: [0, 3, 7], M: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], s4: [0, 5, 7] };

// Per thema: tempo, klanken, akkoordenreeksen (per maat: [grondtoon (midi), akkoord]) en melodieën
// (8 stappen per maat; getal = toon uit de toonladder, -1 = rust).
export const THEMES = {
  polder: { // vrolijke synthwave
    bpm: [112, 142], bass: 'sawtooth', arp: 'square', pad: 'sawtooth', padLp: 1100, lead: 'square', arpVol: 0.085, padVol: 0.035, drums: 1,
    scale: [57, 60, 62, 64, 67, 69, 72, 74, 76, 79],
    progs: [
      [[45, 'm'], [45, 'm'], [41, 'M'], [41, 'M'], [48, 'M'], [48, 'M'], [43, 'M'], [43, 'M']],
      [[41, 'M'], [43, 'M'], [45, 'm'], [45, 'm'], [41, 'M'], [43, 'M'], [40, 'M'], [40, 'M']],
      [[45, 'm'], [48, 'M'], [43, 'M'], [41, 'M'], [45, 'm'], [48, 'M'], [43, 'M'], [43, 's4']],
      [[38, 'm'], [38, 'm'], [41, 'M'], [41, 'M'], [45, 'm'], [45, 'm'], [40, 'M'], [40, 'M']],
    ],
    arps: [[0, 7, 12, 7, 15, 12, 7, 12], [0, 12, 7, 12, 0, 15, 12, 7], [0, 3, 7, 12, 7, 3, 12, 15]],
    leads: [[0, -1, 2, -1, 4, 3, 2, -1], [4, -1, 4, 5, 7, -1, 5, 4], [7, 5, 4, 2, 4, -1, 2, 0], [2, 4, 5, 7, 8, 7, 5, 4]],
  },
  vulkaan: { // donkerder, lager, zwaardere bas en drums
    bpm: [100, 130], bass: 'square', bassLp: 520, pulse: true, arp: 'sawtooth', arpLp: 1600, pad: 'sawtooth', padLp: 700, lead: 'sawtooth', arpVol: 0.06, padVol: 0.04, drums: 1.25, toms: true,
    scale: [50, 51, 53, 55, 57, 58, 60, 62, 63, 65],
    progs: [
      [[38, 'm'], [38, 'm'], [39, 'M'], [39, 'M'], [38, 'm'], [38, 'm'], [36, 'm'], [36, 'm']],
      [[38, 'm'], [34, 'M'], [36, 'M'], [38, 'm'], [38, 'm'], [34, 'M'], [33, 'M'], [33, 'M']],
      [[38, 'm'], [38, 'm'], [41, 'M'], [39, 'M'], [38, 'm'], [38, 'm'], [36, 'm'], [39, 'M']],
    ],
    arps: [[0, 12, 0, 12, 0, 13, 0, 12], [0, 7, 12, 7, 0, 7, 13, 12], [0, 3, 0, 7, 0, 3, 12, 10]],
    leads: [[0, -1, 1, 0, -1, 4, 3, 1], [7, -1, 6, 5, 4, -1, 3, 1], [0, 0, 1, -1, 3, 1, 0, -1]],
  },
  kosmo: { // zweverig en ruimtelijk: lange klanken en snelle arpeggio's
    bpm: [118, 146], bass: 'sine', arp: 'triangle', fastArp: true, pad: 'triangle', padLp: 2400, lead: 'triangle', echo: true, arpVol: 0.07, padVol: 0.07, drums: 0.7,
    scale: [64, 66, 67, 69, 71, 74, 76, 78, 79, 83],
    progs: [
      [[40, 'm7'], [40, 'm7'], [36, 'M7'], [36, 'M7'], [43, 'M7'], [43, 'M7'], [38, 'M'], [38, 'M']],
      [[36, 'M7'], [36, 'M7'], [38, 'M'], [38, 'M'], [40, 'm7'], [40, 'm7'], [35, 'm7'], [35, 'm7']],
      [[40, 'm7'], [43, 'M7'], [45, 'm7'], [42, 'm7'], [40, 'm7'], [43, 'M7'], [38, 'M'], [38, 's4']],
    ],
    arps: [[0, 7, 12, 14, 19, 14, 12, 7], [0, 12, 19, 24, 19, 12, 7, 12], [0, 4, 7, 11, 14, 11, 7, 4]],
    leads: [[4, -1, -1, 5, -1, -1, 7, -1], [9, -1, 7, -1, 5, -1, 4, -1], [2, -1, 4, 5, -1, 4, 2, -1]],
  },
  zen: { // rustig en zacht: vooral lange klanken, weinig drums
    bpm: [92, 112], bass: 'sine', arp: 'triangle', pad: 'triangle', padLp: 1800, lead: 'triangle', echo: true, arpVol: 0.045, padVol: 0.08, drums: 0.45, zen: true,
    scale: [57, 60, 62, 64, 67, 69, 72, 74, 76, 79],
    progs: [
      [[45, 'm7'], [45, 'm7'], [41, 'M7'], [41, 'M7'], [48, 'M7'], [48, 'M7'], [43, 's4'], [43, 'M']],
      [[41, 'M7'], [41, 'M7'], [43, 'M'], [43, 'M'], [45, 'm7'], [45, 'm7'], [40, 'm7'], [40, 'm7']],
    ],
    arps: [[0, 7, 12, 7, 14, 12, 7, 4], [0, 12, 7, 14, 12, 7, 4, 7]],
    leads: [[4, -1, -1, -1, 5, -1, -1, -1], [7, -1, -1, 5, -1, -1, 4, -1]],
  },
};

// Hoeveel energie de muziek heeft (0 = heel rustig, 1 = vol, >1 = alles erop).
export function energy(st) {
  if (st.done) return 0.25;
  if (st.wkLevel != null || st.wkFree) { // workout: volgt het blok
    const f = st.wkFree ? 0.6 : st.wkLevel;
    let e = f < 0.6 ? 0.2 : f < 0.76 ? 0.45 : f < 0.9 ? 0.7 : f < 1.06 ? 1 : 1.2;
    if (st.finale) e += 0.15;
    return e;
  }
  let e = 0.35 + 0.65 * Math.min(1, st.intensity || 0);
  if (st.zone) e += 0.25;
  if (st.lastLap || st.finale) e += 0.2;
  return Math.min(1.5, e);
}

export function makeMusic(ctx, dest) {
  let theme = THEMES.polder, step = 0, nextAt = 0, prog = 0, arpN = 0, leadN = 0, section = 0, riserUntil = 0;
  const st = { intensity: 0.5, zone: null, lastLap: false, finale: false, wkLevel: null, wkFree: false, riser: 0, done: false };

  function tone(freq, t, dur, type, vol, { slideTo, lp, attack = 0.01, detune = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (detune) o.detune.value = detune;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = o;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); out = f; }
    out.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(t, dur, vol, { hp = 1000, bp, sweep } = {}) {
    if (!noiseBuf) { const n = Math.floor(ctx.sampleRate * 2); noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = bp ? 'bandpass' : 'highpass'; f.frequency.setValueAtTime(bp || hp, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain();
    if (sweep) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    else { g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  const kick = (t, v) => tone(130, t, 0.14, 'sine', 0.5 * v, { slideTo: 38 });
  const snare = (t, v) => { noise(t, 0.12, 0.16 * v, { hp: 1500 }); tone(190, t, 0.08, 'triangle', 0.12 * v, { slideTo: 120 }); };
  const hat = (t, v) => noise(t, 0.035, 0.07 * v, { hp: 6500 });
  const tom = (t, f, v) => tone(f, t, 0.22, 'sine', 0.32 * v, { slideTo: f * 0.55 });

  function bar(t, spb) {
    // Nieuwe sectie elke 8 maten: andere akkoordenreeks, arpeggio en melodie (niet twee keer hetzelfde na elkaar).
    if (step % 64 === 0) {
      section++;
      const pick = (n, cur) => (n < 2 ? 0 : (cur + 1 + Math.floor(Math.random() * (n - 1))) % n);
      if (section > 1) { prog = pick(theme.progs.length, prog); arpN = pick(theme.arps.length, arpN); leadN = pick(theme.leads.length, leadN); }
    }
    const [root, q] = theme.progs[prog][Math.floor(step / 8) % 8];
    const e = energy(st);
    // pad: lange akkoordklank over de hele maat
    const pv = theme.padVol * (theme.zen || theme === THEMES.kosmo ? 1 : 0.6 + 0.4 * Math.min(1, e));
    for (const iv of CH[q]) for (const dt of [-7, 7]) tone(midi(root + (theme.fastArp || theme.zen ? 24 : 12) + iv), t, spb * 8.4, theme.pad, pv / CH[q].length, { lp: theme.padLp, attack: Math.min(0.5, spb * 2), detune: dt });
    return { root, q, e };
  }

  function stepAt(t, spb) {
    const s = step % 8, info = step % 8 === 0 ? (stepAt.last = bar(t, spb)) : stepAt.last || bar(t, spb);
    const { root, q } = info, e = energy(st), th = theme, d = th.drums;
    const chord = CH[q];
    // bas
    if (th.pulse) tone(midi(root + (s % 2 ? 12 : 0)), t, spb * 0.9, th.bass, 0.16, { lp: th.bassLp + 400 * Math.min(1, e) });
    else if (s % 2 === 0) tone(midi(th.bass === 'sine' ? root : root - 12), t, spb * 1.6, th.bass, th.bass === 'sine' ? 0.32 : 0.2, { lp: th.bassLp });
    // arpeggio (kosmo: dubbel zo snel)
    if (e > 0.15) {
      const pat = th.arps[arpN], av = th.arpVol * (0.55 + 0.45 * Math.min(1, e));
      const ao = th.fastArp || th.zen ? 24 : 12;
      const n1 = root + ao + pat[s] + (pat[s] === 3 || pat[s] === 15 ? (chord.includes(3) ? 0 : 1) : 0);
      tone(midi(n1), t, spb * 0.9, th.arp, av, { lp: th.arpLp });
      if (th.fastArp && e > 0.4) tone(midi(root + ao + pat[(s + 4) % 8]), t + spb / 2, spb * 0.45, th.arp, av * 0.7, { lp: th.arpLp });
    }
    // drums
    if (e > 0.3 && (s === 0 || s === 4 || (e > 0.75 && (s === 2 || s === 6)))) kick(t, d * (th.zen ? 0.6 : 1));
    if (e > 0.25 && !th.zen && (s % 2 === 1 || e > 0.95)) hat(t, d * (s % 2 ? 1 : 0.5));
    if ((st.zone === 'sprint' || e > 0.85) && (s === 2 || s === 6) && !th.zen) snare(t, d);
    if ((st.zone === 'climb' || (th.toms && e > 1)) && (s === 5 || s === 7)) tom(t, s === 5 ? 160 : 120, d);
    // kasseien: grof geratel en een grommende bas
    if (st.zone === 'cobble') { noise(t, spb * 0.5, 0.05, { bp: 900 + Math.random() * 600 }); if (s % 2 === 0) tone(midi(root), t, spb, 'square', 0.07, { lp: 380 }); }
    // melodie: in sprints en klimmen, de laatste ronde, de finale en zware blokken
    if (st.zone === 'sprint' || st.zone === 'climb' || st.lastLap || st.finale || e > 1.05) {
      const deg = th.leads[leadN][s];
      if (deg >= 0) {
        const f = midi(th.scale[deg % th.scale.length] + (st.lastLap || st.finale ? 12 : 0));
        tone(f, t, spb * 1.4, th.lead, 0.07, { lp: th.lead === 'sawtooth' ? 2200 : undefined });
        if (th.echo) tone(f, t + spb * 3, spb * 1.2, th.lead, 0.025);
      }
    }
    // opbouw naar een nieuw workoutblok: ruis die opzwelt en een snaredrumroffel
    if (st.riser > 0) {
      if (t >= riserUntil) { riserUntil = t + st.riser; noise(t, st.riser, 0.12, { hp: 300, sweep: 7000 }); }
      if (st.riser < 2.2) { snare(t, 0.5 + (2.2 - st.riser) * 0.3); if (st.riser < 1.2) snare(t + spb / 2, 0.6); }
    }
  }

  return {
    state: st,
    setTheme(name) { const th = THEMES[name] || THEMES.polder; if (th !== theme) { theme = th; step = 0; section = 0; prog = arpN = leadN = 0; stepAt.last = null; } },
    reset(t) { nextAt = t; step = 0; section = 0; stepAt.last = null; riserUntil = 0; },
    bpm() { const e = energy(st); return theme.bpm[0] + (theme.bpm[1] - theme.bpm[0]) * Math.min(1, Math.max(0, (e - 0.2) / 0.8)) + (st.lastLap || st.finale ? 8 : 0); },
    // Plant noten in tot 'until' (seconden in de AudioContext-tijd).
    schedule(until) {
      while (nextAt < until) {
        const spb = 60 / this.bpm() / 2;
        stepAt(nextAt, spb);
        nextAt += spb;
        step++;
      }
    },
  };
}
