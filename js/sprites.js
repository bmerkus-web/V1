// Decor en objecten, allemaal met de hand getekend op canvas (geen plaatjes nodig).
const PX = 22; // pixels per meter in de voorgetekende sprites

const P = {
  windmill: { w: 9, h: 14, draw(c, w, h) {
    c.fillStyle = '#2a1458'; c.beginPath(); c.moveTo(w * 0.38, h); c.lineTo(w * 0.44, h * 0.3); c.lineTo(w * 0.56, h * 0.3); c.lineTo(w * 0.62, h); c.fill();
    c.strokeStyle = '#ff3fa4'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#ffd166'; c.fillRect(w * 0.47, h * 0.55, w * 0.06, h * 0.07);
    c.translate(w / 2, h * 0.3); c.rotate(0.4);
    c.strokeStyle = '#7df9ff'; c.lineWidth = 5;
    for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -h * 0.28); c.stroke(); c.fillStyle = 'rgba(125,249,255,.25)'; c.fillRect(0, -h * 0.28, w * 0.1, h * 0.2); }
  } },
  poplar: { w: 3.5, h: 11, draw(c, w, h) {
    c.fillStyle = '#1a0f33'; c.fillRect(w * 0.45, h * 0.7, w * 0.1, h * 0.3);
    c.fillStyle = '#0f5a52'; c.beginPath(); c.ellipse(w / 2, h * 0.42, w * 0.36, h * 0.42, 0, 0, 7); c.fill();
    c.fillStyle = '#19877a'; c.beginPath(); c.ellipse(w * 0.42, h * 0.36, w * 0.16, h * 0.3, 0, 0, 7); c.fill();
  } },
  tulips: { w: 4, h: 1.3, draw(c, w, h) {
    const cols = ['#ff3fa4', '#ffd166', '#ff5f5f', '#b28dff'];
    for (let i = 0; i < 9; i++) {
      const x = w * (0.08 + i * 0.105), y = h * (0.25 + (i % 3) * 0.12);
      c.strokeStyle = '#1f9a6a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, h); c.lineTo(x, y); c.stroke();
      c.fillStyle = cols[i % 4]; c.beginPath(); c.ellipse(x, y, 5, 7, 0, 0, 7); c.fill();
    }
  } },
  lamp: { w: 2, h: 7, draw(c, w, h) {
    c.fillStyle = '#3a3555'; c.fillRect(w * 0.46, h * 0.1, w * 0.08, h * 0.9);
    const g = c.createRadialGradient(w / 2, h * 0.1, 1, w / 2, h * 0.1, w * 0.5);
    g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.3, 'rgba(125,249,255,.7)'); g.addColorStop(1, 'rgba(125,249,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h * 0.3);
  } },
  billboard: { w: 9, h: 6.5, draw(c, w, h) {
    c.fillStyle = '#2b2540'; c.fillRect(w * 0.15, h * 0.5, w * 0.05, h * 0.5); c.fillRect(w * 0.8, h * 0.5, w * 0.05, h * 0.5);
    const g = c.createLinearGradient(0, 0, w, h * 0.6); g.addColorStop(0, '#ff3fa4'); g.addColorStop(1, '#6a2bff');
    c.fillStyle = g; c.fillRect(0, 0, w, h * 0.6);
    c.strokeStyle = '#7df9ff'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h * 0.6 - 4);
    c.fillStyle = '#fff'; c.font = `900 ${h * 0.2}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('WATT', w / 2, h * 0.2); c.fillStyle = '#ffe26b'; c.fillText('BLITZ ⚡', w / 2, h * 0.42);
  } },
  rock: { w: 6, h: 4.5, draw(c, w, h) {
    c.fillStyle = '#1c1116'; c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.12, h * 0.45); c.lineTo(w * 0.35, h * 0.1); c.lineTo(w * 0.62, h * 0.22); c.lineTo(w * 0.9, h * 0.6); c.lineTo(w, h); c.fill();
    c.strokeStyle = '#ff7b1c'; c.lineWidth = 3; c.beginPath(); c.moveTo(w * 0.35, h * 0.1); c.lineTo(w * 0.42, h * 0.5); c.lineTo(w * 0.3, h * 0.8); c.moveTo(w * 0.42, h * 0.5); c.lineTo(w * 0.65, h * 0.75); c.stroke();
  } },
  deadtree: { w: 5, h: 7, draw(c, w, h) {
    c.strokeStyle = '#120a0d'; c.lineCap = 'round';
    const br = (x, y, a, len, lw) => { if (lw < 1.5) return; const x2 = x + Math.sin(a) * len, y2 = y - Math.cos(a) * len; c.lineWidth = lw; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); br(x2, y2, a - 0.55, len * 0.68, lw * 0.6); br(x2, y2, a + 0.45, len * 0.7, lw * 0.6); };
    br(w / 2, h, 0.05, h * 0.36, 12);
  } },
  crystal: { w: 2.6, h: 4, draw(c, w, h) {
    const gem = (x, top, bw, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x, h * top); c.lineTo(x + bw, h * (top + 0.25)); c.lineTo(x + bw * 0.7, h); c.lineTo(x - bw * 0.7, h); c.lineTo(x - bw, h * (top + 0.25)); c.fill(); };
    gem(w * 0.5, 0, w * 0.22, '#7df9ff'); gem(w * 0.25, 0.4, w * 0.15, '#ff5fd2'); gem(w * 0.78, 0.5, w * 0.13, '#b9fff4');
    c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(w * 0.46, h * 0.1, 3, h * 0.6);
  } },
  lavavent: { w: 5, h: 3, draw(c, w, h) {
    const g = c.createRadialGradient(w / 2, h * 0.4, 2, w / 2, h * 0.4, w * 0.5); g.addColorStop(0, 'rgba(255,200,80,.9)'); g.addColorStop(1, 'rgba(255,90,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1c1116'; c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.35, h * 0.45); c.lineTo(w * 0.65, h * 0.45); c.lineTo(w, h); c.fill();
    c.fillStyle = '#ffb347'; c.fillRect(w * 0.37, h * 0.42, w * 0.26, h * 0.08);
  } },
  antenna: { w: 5, h: 13, draw(c, w, h) {
    c.strokeStyle = '#5b6bb5'; c.lineWidth = 3; c.beginPath(); c.moveTo(w * 0.3, h); c.lineTo(w / 2, h * 0.08); c.lineTo(w * 0.7, h);
    for (let i = 1; i < 7; i++) { const y = h * (0.08 + i * 0.13), s = i * 0.029; c.moveTo(w * (0.5 - s), y); c.lineTo(w * (0.5 + s), y); } c.stroke();
    c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(w / 2, h * 0.06, 7, 0, 7); c.fill();
    c.strokeStyle = '#39ffb0'; c.lineWidth = 4; c.beginPath(); c.arc(w / 2, h * 0.3, w * 0.3, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  } },
  dome: { w: 9, h: 5, draw(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(57,208,200,.75)'); g.addColorStop(1, 'rgba(27,47,138,.85)');
    c.fillStyle = g; c.beginPath(); c.ellipse(w / 2, h, w * 0.48, h * 0.95, 0, Math.PI, 0); c.fill();
    c.strokeStyle = '#b9fff4'; c.lineWidth = 2; c.stroke();
    for (let i = 1; i < 4; i++) { c.beginPath(); c.ellipse(w / 2, h, w * 0.48 * (i / 4), h * 0.95, 0, Math.PI, 0); c.stroke(); }
    c.fillStyle = '#ffd166'; for (let i = 0; i < 5; i++) c.fillRect(w * (0.2 + i * 0.14), h * 0.82, w * 0.05, h * 0.08);
  } },
  rocketpad: { w: 5, h: 12, draw(c, w, h) {
    c.strokeStyle = '#3b4a8a'; c.lineWidth = 4; c.strokeRect(w * 0.1, h * 0.25, w * 0.18, h * 0.75);
    c.fillStyle = '#eef'; c.beginPath(); c.moveTo(w * 0.55, 0); c.quadraticCurveTo(w * 0.78, h * 0.2, w * 0.72, h * 0.85); c.lineTo(w * 0.38, h * 0.85); c.quadraticCurveTo(w * 0.32, h * 0.2, w * 0.55, 0); c.fill();
    c.fillStyle = '#ff3fa4'; c.beginPath(); c.moveTo(w * 0.38, h * 0.7); c.lineTo(w * 0.2, h); c.lineTo(w * 0.42, h * 0.88); c.moveTo(w * 0.72, h * 0.7); c.lineTo(w * 0.9, h); c.lineTo(w * 0.68, h * 0.88); c.fill();
    c.fillStyle = '#39d0c8'; c.beginPath(); c.arc(w * 0.55, h * 0.3, w * 0.09, 0, 7); c.fill();
  } },
  // Obstakels op de weg (verkeerseiland, paaltjes, wegwerkzaamheden)
  bollard: { w: 0.9, h: 1.5, draw(c, w, h) {
    c.fillStyle = '#f5f5ff'; c.fillRect(w * 0.32, h * 0.22, w * 0.36, h * 0.78);
    c.fillStyle = '#ff7b1c'; for (let y = h * 0.28; y < h; y += h * 0.22) c.fillRect(w * 0.32, y, w * 0.36, h * 0.1);
    c.fillStyle = '#1f6fff'; c.beginPath(); c.arc(w / 2, h * 0.14, w * 0.36, 0, 7); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, w * 0.08); c.beginPath(); c.moveTo(w * 0.36, h * 0.07); c.lineTo(w * 0.6, h * 0.2); c.lineTo(w * 0.4, h * 0.2); c.stroke();
  } },
  barrier: { w: 2.6, h: 1.2, draw(c, w, h) {
    c.fillStyle = '#2a2a3a'; c.fillRect(w * 0.08, h * 0.5, w * 0.06, h * 0.5); c.fillRect(w * 0.86, h * 0.5, w * 0.06, h * 0.5);
    c.fillStyle = '#f5f5ff'; c.fillRect(0, h * 0.12, w, h * 0.42);
    c.fillStyle = '#ff2e4a'; for (let x = -w; x < w; x += w * 0.25) { c.beginPath(); c.moveTo(x, h * 0.54); c.lineTo(x + w * 0.12, h * 0.12); c.lineTo(x + w * 0.24, h * 0.12); c.lineTo(x + w * 0.12, h * 0.54); c.fill(); }
    c.fillStyle = '#ffd166'; c.beginPath(); c.arc(w * 0.5, h * 0.06, w * 0.05, 0, 7); c.fill();
  } },
  cone: { w: 0.7, h: 0.9, draw(c, w, h) {
    c.fillStyle = '#ff7b1c'; c.beginPath(); c.moveTo(w * 0.5, 0); c.lineTo(w * 0.85, h * 0.9); c.lineTo(w * 0.15, h * 0.9); c.fill();
    c.fillStyle = '#f5f5ff'; c.fillRect(w * 0.3, h * 0.45, w * 0.4, h * 0.14);
    c.fillStyle = '#222'; c.fillRect(0, h * 0.88, w, h * 0.12);
  } },
  worksign: { w: 1.6, h: 2.2, draw(c, w, h) {
    c.fillStyle = '#555'; c.fillRect(w * 0.47, h * 0.5, w * 0.06, h * 0.5);
    c.fillStyle = '#ff2e4a'; c.beginPath(); c.moveTo(w * 0.5, h * 0.02); c.lineTo(w * 0.98, h * 0.55); c.lineTo(w * 0.02, h * 0.55); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(w * 0.5, h * 0.12); c.lineTo(w * 0.84, h * 0.5); c.lineTo(w * 0.16, h * 0.5); c.fill();
    c.fillStyle = '#111'; c.fillRect(w * 0.4, h * 0.3, w * 0.2, h * 0.14); c.fillRect(w * 0.3, h * 0.44, w * 0.4, h * 0.04);
  } },
  // Veldrit
  crowd: { w: 3, h: 2.6, draw(c, w, h) { // publiek achter het lint (groepje van drie), met een vlaggetje
    const cols = ['#ff3fa4', '#7df9ff', '#ffd166', '#39ffb0', '#f5f5ff', '#ff8a1c'];
    for (let i = 0; i < 3; i++) {
      const x = (i + 0.5) * w / 3, y = h * (0.45 + (i % 3) * 0.06), u = w / 3;
      c.fillStyle = cols[(i * 2 + 1) % cols.length]; c.fillRect(x - u * 0.18, y, u * 0.36, h - y);
      c.fillStyle = '#e8b58f'; c.beginPath(); c.arc(x, y - h * 0.06, u * 0.13, 0, 7); c.fill();
      if (i === 1) { c.fillStyle = '#ffd400'; c.fillRect(x, y - h * 0.42, u * 0.42, h * 0.18); c.fillStyle = '#111'; c.fillRect(x + u * 0.12, y - h * 0.38, u * 0.15, h * 0.1); c.fillStyle = '#ddd'; c.fillRect(x - 1, y - h * 0.42, 2, h * 0.36); }
      if (i === 2) { c.fillStyle = '#e8b58f'; c.fillRect(x - u * 0.24, y - h * 0.18, u * 0.09, h * 0.16); }
    }
  } },
  frites: { w: 6, h: 4.2, draw(c, w, h) { // frietkot
    c.fillStyle = '#f5f5ff'; c.fillRect(w * 0.08, h * 0.4, w * 0.84, h * 0.6);
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#ff3b3b' : '#f5f5ff'; c.beginPath(); c.moveTo(w * (0.04 + i * 0.153), h * 0.4); c.lineTo(w * (0.115 + i * 0.153), h * 0.2); c.lineTo(w * (0.19 + i * 0.153), h * 0.4); c.fill(); }
    c.fillStyle = '#ff3b3b'; c.fillRect(0, h * 0.18, w, h * 0.06);
    c.fillStyle = '#ffd166'; c.fillRect(w * 0.18, h * 0.5, w * 0.64, h * 0.2);
    c.fillStyle = '#7a2a10'; c.font = `bold ${h * 0.15}px sans-serif`; c.textAlign = 'center'; c.fillText('FRIETEN', w / 2, h * 0.65);
  } },
  oak: { w: 6, h: 8, draw(c, w, h) {
    c.fillStyle = '#2a1a14'; c.fillRect(w * 0.44, h * 0.55, w * 0.12, h * 0.45);
    c.fillStyle = '#123a24'; c.beginPath(); c.ellipse(w / 2, h * 0.4, w * 0.46, h * 0.36, 0, 0, 7); c.fill();
    c.fillStyle = '#1d5534'; c.beginPath(); c.ellipse(w * 0.4, h * 0.32, w * 0.24, h * 0.2, 0, 0, 7); c.fill();
  } },
};

export const SCENERY = {};
if (typeof document !== 'undefined') {
  for (const [k, p] of Object.entries(P)) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(p.w * PX); cv.height = Math.round(p.h * PX);
    const c = cv.getContext('2d');
    c.save(); p.draw(c, cv.width, cv.height); c.restore();
    SCENERY[k] = { w: p.w, h: p.h, cv };
  }
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f + (f > 1 ? 255 * (f - 1) * 0.6 : 0))));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// Renner van achteren. (X,Y) = contactpunt met de weg, u = pixels per meter.
const GREEN_DARK = '#15a34a', GREEN_LIGHT = '#7cf0a6';

export function drawRider(c, X, Y, u, r, t, opts = {}) {
  const m = r.mask || 0;
  c.save();
  c.translate(X, Y - (m & 2048 ? Math.abs(Math.sin(t * 38 + X)) * 0.04 * u : 0)); // stuiteren op de kasseien
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.beginPath(); c.ellipse(0, 0, 0.5 * u, 0.1 * u, 0, 0, 7); c.fill();
  if (opts.ghost || opts.fade) c.globalAlpha = 0.38;
  c.rotate((opts.lean ?? r.steer ?? 0) * 0.2 + (m & 32 ? Math.sin(t * 25) * 0.45 : 0));
  if (m & 1) { // turbovlammen
    for (const s of [-1, 1]) {
      const len = (0.5 + Math.random() * 0.5) * u;
      c.fillStyle = Math.random() < 0.5 ? '#ffd166' : '#ff7b1c';
      c.beginPath(); c.moveTo(s * 0.05 * u, -0.25 * u); c.lineTo(s * 0.3 * u, -0.1 * u + len * 0.2); c.lineTo(s * 0.12 * u, -0.05 * u); c.fill();
    }
    c.fillStyle = 'rgba(255,209,102,.5)'; c.beginPath(); c.ellipse(0, -0.1 * u, 0.4 * u, 0.14 * u, 0, 0, 7); c.fill();
  }
  // achterwiel
  if (m & 4096) { // antilekband (Gouden Kassei): band in de voegkleur van de kasseien, met een zachte gloed
    c.fillStyle = (opts.tire || '#ffd166') + '55'; c.fillRect(-0.075 * u, -0.73 * u, 0.15 * u, 0.76 * u);
    c.fillStyle = opts.tire || '#ffd166';
  } else c.fillStyle = '#0c0c14';
  c.fillRect(-0.045 * u, -0.7 * u, 0.09 * u, 0.7 * u);
  c.fillStyle = '#c9c9d9'; c.fillRect(-0.012 * u, -0.66 * u, 0.024 * u, 0.62 * u);
  if (m & 2) { c.fillStyle = '#b44dff'; c.beginPath(); c.ellipse(0, -0.05 * u, 0.3 * u, 0.1 * u, 0, 0, 7); c.fill(); }
  if (m & 128) { // lekke band: witte straaltjes lucht die aan één kant uit het achterwiel spuiten
    if (r._flatSide == null) r._flatSide = Math.random() < 0.5 ? -1 : 1; // per lekke band links of rechts
    const side = r._flatSide;
    c.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const k = (t * 3 + i / 9) % 1;
      const ang = 0.1 + (i % 5) * 0.22 + Math.sin(t * 17 + i) * 0.08; // schuin omhoog en naar buiten
      const r0 = (0.05 + k * 0.55) * u, len = (0.2 + 0.14 * (1 - k)) * u;
      const x0 = side * Math.cos(ang) * r0, y0 = -0.1 * u - Math.sin(ang) * r0 * 0.9;
      c.strokeStyle = `rgba(255,255,255,${0.95 * (1 - k * 0.85)})`; c.lineWidth = Math.max(1.5, 0.045 * u * (1 - k * 0.5));
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + side * Math.cos(ang) * len, y0 - Math.sin(ang) * len * 0.9); c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(side * 0.08 * u, -0.07 * u, (0.12 + 0.03 * Math.sin(t * 20)) * u, 0.05 * u, 0, 0, 7); c.fill();
  } else r._flatSide = null;
  // benen
  const ph = r._ph || 0;
  c.lineCap = 'round';
  for (const s of [-1, 1]) {
    const foot = -0.3 * u + s * Math.sin(ph) * 0.15 * u, knee = foot - 0.36 * u;
    c.strokeStyle = '#e8b58f'; c.lineWidth = 0.09 * u; c.beginPath(); c.moveTo(s * 0.14 * u, knee); c.lineTo(s * 0.12 * u, foot); c.stroke();
    c.strokeStyle = '#15152a'; c.lineWidth = 0.13 * u; c.beginPath(); c.moveTo(s * 0.1 * u, -0.98 * u); c.lineTo(s * 0.14 * u, knee); c.stroke();
    c.fillStyle = '#f5f5ff'; c.fillRect(s * 0.12 * u - 0.05 * u, foot - 0.02 * u, 0.1 * u, 0.07 * u);
  }
  // stuur (achter de romp, zodat alleen de uiteinden naast het lichaam te zien zijn)
  c.strokeStyle = '#23233a'; c.lineWidth = 0.05 * u; c.beginPath(); c.moveTo(-0.34 * u, -1.08 * u); c.lineTo(0.34 * u, -1.08 * u); c.stroke();
  // romp
  // Ploegen: trui in de ploegkleur; de groene trui en bolletjestrui houden hun patroon, met mouwen en rand in de ploegkleur.
  const jersey = opts.green ? GREEN_DARK : opts.polka ? '#fbfbff' : opts.team || r.color;
  c.fillStyle = jersey;
  c.beginPath(); c.moveTo(-0.19 * u, -0.92 * u); c.quadraticCurveTo(-0.3 * u, -1.25 * u, -0.22 * u, -1.45 * u);
  c.lineTo(0.22 * u, -1.45 * u); c.quadraticCurveTo(0.3 * u, -1.25 * u, 0.19 * u, -0.92 * u); c.fill();
  if (opts.green) { // groene trui: lichtgroene strepen en een bliksem op de rug
    c.save(); c.clip();
    c.fillStyle = GREEN_LIGHT;
    for (const sx of [-0.2, -0.08, 0.04, 0.16]) c.fillRect(sx * u, -1.46 * u, 0.06 * u, 0.56 * u);
    c.fillStyle = '#ffe26b'; c.strokeStyle = '#0b3d1f'; c.lineWidth = Math.max(1, 0.012 * u);
    c.beginPath(); c.moveTo(0.05 * u, -1.38 * u); c.lineTo(-0.08 * u, -1.17 * u); c.lineTo(-0.005 * u, -1.17 * u);
    c.lineTo(-0.05 * u, -0.99 * u); c.lineTo(0.09 * u, -1.22 * u); c.lineTo(0.015 * u, -1.22 * u); c.closePath(); c.fill(); c.stroke();
    c.restore();
  } else if (opts.polka) { // bolletjestrui: wit met rode stippen en een bliksem op de rug
    c.save(); c.clip();
    c.fillStyle = '#e8262c';
    for (let row = 0; row < 6; row++) for (let col = 0; col < 5; col++) {
      const px = (-0.24 + col * 0.12 + (row % 2) * 0.06) * u, py = (-1.43 + row * 0.1) * u;
      c.beginPath(); c.arc(px, py, 0.026 * u, 0, 7); c.fill();
    }
    c.fillStyle = '#ffd166'; c.strokeStyle = '#7a0f12'; c.lineWidth = Math.max(1, 0.012 * u);
    c.beginPath(); c.moveTo(0.05 * u, -1.38 * u); c.lineTo(-0.08 * u, -1.17 * u); c.lineTo(-0.005 * u, -1.17 * u);
    c.lineTo(-0.05 * u, -0.99 * u); c.lineTo(0.09 * u, -1.22 * u); c.lineTo(0.015 * u, -1.22 * u); c.closePath(); c.fill(); c.stroke();
    c.restore();
  } else if (!opts.team) { c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(-0.035 * u, -1.44 * u, 0.07 * u, 0.5 * u); }
  if (opts.team && (opts.green || opts.polka)) { // rand in de ploegkleur
    c.beginPath(); c.moveTo(-0.19 * u, -0.92 * u); c.quadraticCurveTo(-0.3 * u, -1.25 * u, -0.22 * u, -1.45 * u);
    c.lineTo(0.22 * u, -1.45 * u); c.quadraticCurveTo(0.3 * u, -1.25 * u, 0.19 * u, -0.92 * u);
    c.strokeStyle = opts.team; c.lineWidth = Math.max(1.5, 0.045 * u); c.stroke();
  }
  if (opts.bib != null) { // rugnummers: links en rechts onderop de rug (geel voor de leidende ploeg)
    for (const sx of [-1, 1]) {
      const bx = sx * 0.115 * u - 0.075 * u, by = -1.16 * u, bw = 0.15 * u, bh = 0.13 * u;
      c.fillStyle = opts.leadBib ? '#ffd166' : '#f7f7fb'; c.fillRect(bx, by, bw, bh);
      if (u > 16) { c.fillStyle = '#111'; c.font = `800 ${0.095 * u}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(opts.bib), bx + bw / 2, by + bh / 2 + 0.005 * u); c.textBaseline = 'alphabetic'; }
    }
  }
  c.fillStyle = '#15152a'; c.fillRect(-0.19 * u, -0.98 * u, 0.38 * u, 0.1 * u);
  // armen + stuur
  c.strokeStyle = opts.team && (opts.green || opts.polka) ? opts.team : jersey; c.lineWidth = 0.09 * u; // mouwen in de ploegkleur
  c.lineJoin = 'round';
  const elb = r.elbow > 0 ? Math.min(1, r.elbow * 3, (1.6 - r.elbow) * 6) : 0; // elleboogje: linkerarm naar buiten, wapperend
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(s * 0.22 * u, -1.4 * u);
    if (s < 0 && elb > 0) { const w = Math.sin(t * 18) * 0.03 * elb; c.lineTo((-0.31 - 0.24 * elb + w) * u, (-1.27 - 0.03 * elb) * u); } // elleboog uit
    c.lineTo(s * 0.31 * u, -1.1 * u); c.stroke();
  }
  // helm
  c.fillStyle = shade(r.color, 1.35); c.beginPath(); c.ellipse(0, -1.62 * u, 0.15 * u, 0.16 * u, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(0,0,0,.35)'; for (const s of [-1, 0, 1]) c.fillRect(s * 0.07 * u - 0.015 * u, -1.74 * u, 0.03 * u, 0.16 * u);
  c.globalAlpha = 1;
  if (m & 4) { // schild
    c.strokeStyle = `rgba(125,249,255,${0.6 + 0.3 * Math.sin(t * 8)})`; c.lineWidth = 0.05 * u;
    c.fillStyle = 'rgba(125,249,255,.13)'; c.beginPath(); c.arc(0, -0.9 * u, 1.05 * u, 0, 7); c.fill(); c.stroke();
  }
  if (m & 8) { // stormwolk
    c.fillStyle = 'rgba(70,75,100,.9)';
    for (const [dx, rr] of [[-0.25, 0.2], [0, 0.26], [0.25, 0.2]]) { c.beginPath(); c.arc(dx * u, -2.15 * u, rr * u, 0, 7); c.fill(); }
    c.strokeStyle = '#9ad'; c.lineWidth = 0.02 * u;
    for (let i = 0; i < 4; i++) { const x = (-0.3 + i * 0.2) * u, y = (-1.95 + ((t * 2 + i * 0.3) % 0.3)) * u; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 0.04 * u, y + 0.1 * u); c.stroke(); }
  }
  if (m & 16) { c.font = `${0.4 * u}px sans-serif`; c.textAlign = 'center'; c.fillText('🧲', 0, -2.0 * u); }

  if (r.kwakAt != null && t - r.kwakAt < 0.9) { // kwak: sterretjes, en het blitzje dat wegvliegt
    const k = (t - r.kwakAt) / 0.9;
    c.fillStyle = '#fff36b';
    for (let i = 0; i < 5; i++) { const a = i * 1.26 + k * 2; c.beginPath(); c.arc(Math.cos(a) * (0.3 + k) * u, -1.0 * u + Math.sin(a) * (0.3 + k) * u, 0.06 * u, 0, 7); c.fill(); }
    if (r.kwakLost) { c.globalAlpha = 1 - k; c.font = `${0.6 * u}px sans-serif`; c.textAlign = 'center'; c.fillText('⚡', 0.2 * u * Math.sin(k * 9), (-1.9 - k * 1.3) * u); c.globalAlpha = 1; }
  }
  if (r.hitAt != null && t - r.hitAt < 0.5) {
    c.fillStyle = '#fff'; const k = (t - r.hitAt) * 2;
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + k * 3; c.beginPath(); c.arc(Math.cos(a) * k * 1.2 * u, -0.9 * u + Math.sin(a) * k * 1.2 * u, 0.07 * u, 0, 7); c.fill(); }
  }
  c.restore();
  if (opts.label && u > 7) {
    c.font = `700 ${Math.max(10, Math.min(18, u * 0.3))}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)';
    c.strokeText(opts.label, X, Y - 2.25 * u); c.fillStyle = opts.ghost ? 'rgba(255,255,255,.6)' : r.color; c.fillText(opts.label, X, Y - 2.25 * u);
    if (opts.cass) { // Gouden Kassei: een gouden keitje voor de naam
      const fs = Math.max(10, Math.min(18, u * 0.3)), s = fs * 0.75, x = X - c.measureText(opts.label).width / 2 - s - 4, y = Y - 2.25 * u - fs * 0.78;
      c.fillStyle = '#7a5a10'; c.fillRect(x - 1, y - 1, s + 2, s + 2);
      c.fillStyle = '#ffc93c'; c.fillRect(x, y, s, s);
      c.fillStyle = '#fff2b0'; c.fillRect(x + s * 0.15, y + s * 0.15, s * 0.35, s * 0.25);
    }
  }
}

export function drawBox(c, X, Y, u, t, id) {
  const s = 0.9 * u, y = Y - 0.55 * u - s / 2 + Math.sin(t * 3 + id) * 0.08 * u;
  c.save(); c.translate(X, y); c.rotate(Math.sin(t * 2 + id) * 0.25);
  const hue = (t * 140 + id * 47) % 360;
  c.fillStyle = `hsla(${hue},95%,60%,.25)`; c.fillRect(-s * 0.65, -s * 0.65, s * 1.3, s * 1.3);
  c.fillStyle = `hsl(${hue},95%,58%)`; c.fillRect(-s / 2, -s / 2, s, s);
  c.strokeStyle = '#fff'; c.lineWidth = Math.max(1, s * 0.07); c.strokeRect(-s / 2, -s / 2, s, s);
  c.fillStyle = '#fff'; c.font = `900 ${s * 0.75}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, s * 0.04);
  c.restore();
}

export function drawBolt(c, X, Y, u, t, id) {
  const y = Y - 0.35 * u + Math.sin(t * 4 + id) * 0.06 * u, s = 0.7 * u * (0.75 + 0.25 * Math.abs(Math.cos(t * 3 + id)));
  c.fillStyle = 'rgba(255,226,107,.3)'; c.beginPath(); c.arc(X, y - 0.35 * u, 0.42 * u, 0, 7); c.fill();
  c.fillStyle = '#ffe26b';
  c.beginPath(); c.moveTo(X + s * 0.1, y - 0.7 * u); c.lineTo(X - s * 0.3, y - 0.3 * u); c.lineTo(X - s * 0.02, y - 0.3 * u);
  c.lineTo(X - s * 0.12, y); c.lineTo(X + s * 0.3, y - 0.42 * u); c.lineTo(X + s * 0.02, y - 0.42 * u); c.fill();
}

export function drawGlue(c, X, Y, u, t) {
  c.fillStyle = '#7a1fd1'; c.beginPath(); c.ellipse(X, Y, 0.9 * u, 0.22 * u, 0, 0, 7); c.fill();
  c.fillStyle = '#c56bff'; c.beginPath(); c.ellipse(X, Y - 0.08 * u, 0.6 * u, (0.2 + 0.04 * Math.sin(t * 5)) * u, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(X - 0.2 * u, Y - 0.14 * u, 0.12 * u, 0.05 * u, 0, 0, 7); c.fill();
}

// Muur: neonmuur met waarschuwingsstrepen. hw = halve breedte in pixels.
export function drawWall(c, X, Y, u, hw, t) {
  const h = 1.3 * u, x0 = X - hw, w = hw * 2;
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x0 + 0.1 * u, Y - 0.08 * u, w, 0.16 * u);
  c.fillStyle = '#3a1d5c'; c.fillRect(x0, Y - h, w, h);
  c.fillStyle = '#5a2d8c'; // stenen
  const bh = h / 4, bw = 0.9 * u;
  for (let row = 0; row < 4; row++) for (let x = (row % 2) * -bw / 2; x < w; x += bw) {
    const a = Math.max(0, x), b = Math.min(w, x + bw - 0.08 * u);
    if (b > a) c.fillRect(x0 + a, Y - h + row * bh + 0.05 * u, b - a, bh - 0.1 * u);
  }
  c.save(); c.beginPath(); c.rect(x0, Y - h - 0.35 * u, w, 0.35 * u); c.clip(); // waarschuwingsstrepen
  c.fillStyle = '#ffd166'; c.fillRect(x0, Y - h - 0.35 * u, w, 0.35 * u); c.fillStyle = '#15152a';
  for (let x = -0.35 * u; x < w; x += 0.5 * u) { c.beginPath(); c.moveTo(x0 + x, Y - h); c.lineTo(x0 + x + 0.25 * u, Y - h); c.lineTo(x0 + x + 0.6 * u, Y - h - 0.35 * u); c.lineTo(x0 + x + 0.35 * u, Y - h - 0.35 * u); c.fill(); }
  c.restore();
  c.strokeStyle = `rgba(255,63,164,${0.7 + 0.3 * Math.sin(t * 6)})`; c.lineWidth = Math.max(1, 0.06 * u); c.strokeRect(x0, Y - h - 0.35 * u, w, h + 0.35 * u);
}

// Punaises: glimmende puntjes over de breedte van de strook.
export function drawTacks(c, X, Y, u, hw, seed) {
  if (u < 3) return;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const px = X + (rnd() * 2 - 1) * hw, py = Y + (rnd() - 0.5) * 0.5 * u, r = 0.07 * u;
    c.fillStyle = '#9aa3b5'; c.beginPath(); c.moveTo(px, py - r * 1.6); c.lineTo(px + r, py); c.lineTo(px - r, py); c.fill();
    c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(px, py - r * 1.6, r * 0.55, 0, 7); c.fill();
  }
}

// Scooter (gangmaker) van achteren, met bestuurder.
export function drawScooter(c, X, Y, u, color = '#7df9ff') {
  c.save(); c.translate(X, Y);
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, 0, 0.5 * u, 0.1 * u, 0, 0, 7); c.fill();
  c.fillStyle = '#0c0c14'; c.fillRect(-0.07 * u, -0.45 * u, 0.14 * u, 0.45 * u); // achterwiel
  c.fillStyle = '#ff3fa4'; c.beginPath(); c.moveTo(-0.3 * u, -0.4 * u); c.lineTo(0.3 * u, -0.4 * u); c.lineTo(0.24 * u, -0.85 * u); c.lineTo(-0.24 * u, -0.85 * u); c.fill(); // kap
  c.fillStyle = '#ff3b3b'; c.fillRect(-0.12 * u, -0.6 * u, 0.24 * u, 0.08 * u); // achterlicht
  c.fillStyle = '#ffe26b'; c.fillRect(-0.2 * u, -0.92 * u, 0.4 * u, 0.1 * u); // nummerplaat
  c.fillStyle = shade(color, 1.3); c.beginPath(); c.moveTo(-0.24 * u, -0.85 * u); c.quadraticCurveTo(-0.3 * u, -1.4 * u, -0.18 * u, -1.55 * u); c.lineTo(0.18 * u, -1.55 * u); c.quadraticCurveTo(0.3 * u, -1.4 * u, 0.24 * u, -0.85 * u); c.fill(); // bestuurder
  c.fillStyle = '#f5f5ff'; c.beginPath(); c.ellipse(0, -1.72 * u, 0.17 * u, 0.18 * u, 0, 0, 7); c.fill(); // helm
  c.fillStyle = '#15152a'; c.fillRect(-0.14 * u, -1.74 * u, 0.28 * u, 0.06 * u);
  c.restore();
}

// Ploegwagen van achteren in de kleur van de renner, met fietsen op het dak.
export function drawCar(c, X, Y, u, color = '#f5f5ff') {
  c.save(); c.translate(X, Y);
  c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(0, 0, 1.0 * u, 0.15 * u, 0, 0, 7); c.fill();
  c.fillStyle = '#0c0c14'; c.fillRect(-0.85 * u, -0.35 * u, 0.25 * u, 0.35 * u); c.fillRect(0.6 * u, -0.35 * u, 0.25 * u, 0.35 * u);
  c.fillStyle = color; c.fillRect(-0.95 * u, -1.0 * u, 1.9 * u, 0.7 * u); // carrosserie
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(-0.95 * u, -0.45 * u, 1.9 * u, 0.15 * u); // bumper
  c.fillStyle = '#9fe9ff'; c.beginPath(); c.moveTo(-0.75 * u, -1.0 * u); c.lineTo(0.75 * u, -1.0 * u); c.lineTo(0.6 * u, -1.42 * u); c.lineTo(-0.6 * u, -1.42 * u); c.fill(); // achterruit
  c.fillStyle = color; c.fillRect(-0.62 * u, -1.47 * u, 1.24 * u, 0.06 * u); // dak
  c.fillStyle = '#f5f5ff'; c.fillRect(-0.95 * u, -0.74 * u, 1.9 * u, 0.1 * u); // witte ploegstreep
  c.fillStyle = '#ff3b3b'; c.fillRect(-0.9 * u, -0.92 * u, 0.2 * u, 0.12 * u); c.fillRect(0.7 * u, -0.92 * u, 0.2 * u, 0.12 * u); // achterlichten
  c.fillStyle = '#15152a'; c.fillRect(-0.6 * u, -1.52 * u, 1.2 * u, 0.05 * u); // dakdrager
  for (const [bx, fc] of [[-0.42, '#ff3fa4'], [-0.14, '#7df9ff'], [0.14, '#ffd166'], [0.42, '#39ffb0']]) { // vier fietsen rechtop, van achteren gezien
    const x = bx * u, y = -1.52 * u;
    c.fillStyle = '#0c0c14'; c.beginPath(); c.ellipse(x, y - 0.3 * u, 0.045 * u, 0.3 * u, 0, 0, 7); c.fill(); // achterband
    c.fillStyle = '#9aa3b5'; c.beginPath(); c.ellipse(x, y - 0.3 * u, 0.015 * u, 0.24 * u, 0, 0, 7); c.fill(); // velg
    c.strokeStyle = fc; c.lineWidth = Math.max(1.5, 0.06 * u); // zitbuis
    c.beginPath(); c.moveTo(x, y - 0.32 * u); c.lineTo(x, y - 0.74 * u); c.stroke();
    c.fillStyle = '#15152a'; c.fillRect(x - 0.06 * u, y - 0.8 * u, 0.12 * u, 0.06 * u); // zadel
    c.strokeStyle = '#2b2540'; c.lineWidth = Math.max(1, 0.035 * u); // stuur met beugels
    c.beginPath(); c.moveTo(x - 0.11 * u, y - 0.6 * u); c.lineTo(x - 0.11 * u, y - 0.68 * u); c.lineTo(x + 0.11 * u, y - 0.68 * u); c.lineTo(x + 0.11 * u, y - 0.6 * u); c.stroke();
  }
  c.restore();
}

// Arm uit het autoraam met een bidon, naar de hand van de renner. side = richting van de auto naar de renner.
export function drawBottleArm(c, carX, carY, cu, riderX, riderY, ru, side, t) {
  const sx = carX + side * 0.95 * cu, sy = carY - 1.15 * cu; // raam aan de kant van de renner
  const hx = riderX - side * 0.34 * ru, hy = riderY - 1.12 * ru; // hand van de renner aan de kant van de auto
  const ex = (sx + hx) / 2, ey = Math.min(sy, hy) - 0.06 * ru + Math.sin(t * 9) * 0.01 * ru;
  c.strokeStyle = '#e8b58f'; c.lineWidth = Math.max(2, 0.07 * ru); c.lineCap = 'round';
  c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(ex, ey, hx - side * 0.12 * ru, hy); c.stroke();
  c.strokeStyle = '#f5f5ff'; c.lineWidth = Math.max(2, 0.09 * ru); // mouw
  c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + (ex - sx) * 0.35, sy + (ey - sy) * 0.35); c.stroke();
  const bx = hx - side * 0.06 * ru, by = hy; // bidon, tussen beide handen
  c.fillStyle = '#f5f5ff'; c.fillRect(bx - 0.05 * ru, by - 0.2 * ru, 0.1 * ru, 0.22 * ru);
  c.fillStyle = '#ff3fa4'; c.fillRect(bx - 0.05 * ru, by - 0.12 * ru, 0.1 * ru, 0.05 * ru);
  c.fillStyle = '#15152a'; c.fillRect(bx - 0.025 * ru, by - 0.25 * ru, 0.05 * ru, 0.05 * ru);
}

export function drawRocket(c, X, Y, u) {
  const y = Y - 0.8 * u;
  c.fillStyle = 'rgba(255,160,60,.5)'; c.beginPath(); c.arc(X, y, (0.45 + Math.random() * 0.2) * u, 0, 7); c.fill();
  c.fillStyle = '#ff3b3b'; c.beginPath(); c.ellipse(X, y, 0.22 * u, 0.3 * u, 0, 0, 7); c.fill();
  c.fillStyle = '#ffe26b'; c.beginPath(); c.arc(X, y, 0.12 * u, 0, 7); c.fill();
}
