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
export function drawRider(c, X, Y, u, r, t, opts = {}) {
  const m = r.mask || 0;
  c.save();
  c.translate(X, Y);
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.beginPath(); c.ellipse(0, 0, 0.5 * u, 0.1 * u, 0, 0, 7); c.fill();
  if (opts.ghost || opts.fade) c.globalAlpha = 0.38;
  c.rotate((r.steer || 0) * 0.2 + (m & 32 ? Math.sin(t * 25) * 0.45 : 0));
  if (m & 1) { // turbovlammen
    for (const s of [-1, 1]) {
      const len = (0.5 + Math.random() * 0.5) * u;
      c.fillStyle = Math.random() < 0.5 ? '#ffd166' : '#ff7b1c';
      c.beginPath(); c.moveTo(s * 0.05 * u, -0.25 * u); c.lineTo(s * 0.3 * u, -0.1 * u + len * 0.2); c.lineTo(s * 0.12 * u, -0.05 * u); c.fill();
    }
    c.fillStyle = 'rgba(255,209,102,.5)'; c.beginPath(); c.ellipse(0, -0.1 * u, 0.4 * u, 0.14 * u, 0, 0, 7); c.fill();
  }
  // achterwiel
  c.fillStyle = '#0c0c14'; c.fillRect(-0.045 * u, -0.7 * u, 0.09 * u, 0.7 * u);
  c.fillStyle = '#c9c9d9'; c.fillRect(-0.012 * u, -0.66 * u, 0.024 * u, 0.62 * u);
  if (m & 2) { c.fillStyle = '#b44dff'; c.beginPath(); c.ellipse(0, -0.05 * u, 0.3 * u, 0.1 * u, 0, 0, 7); c.fill(); }
  // benen
  const ph = r._ph || 0;
  c.lineCap = 'round';
  for (const s of [-1, 1]) {
    const foot = -0.3 * u + s * Math.sin(ph) * 0.15 * u, knee = foot - 0.36 * u;
    c.strokeStyle = '#e8b58f'; c.lineWidth = 0.09 * u; c.beginPath(); c.moveTo(s * 0.14 * u, knee); c.lineTo(s * 0.12 * u, foot); c.stroke();
    c.strokeStyle = '#15152a'; c.lineWidth = 0.13 * u; c.beginPath(); c.moveTo(s * 0.1 * u, -0.98 * u); c.lineTo(s * 0.14 * u, knee); c.stroke();
    c.fillStyle = '#f5f5ff'; c.fillRect(s * 0.12 * u - 0.05 * u, foot - 0.02 * u, 0.1 * u, 0.07 * u);
  }
  // romp
  c.fillStyle = r.color;
  c.beginPath(); c.moveTo(-0.19 * u, -0.92 * u); c.quadraticCurveTo(-0.3 * u, -1.25 * u, -0.22 * u, -1.45 * u);
  c.lineTo(0.22 * u, -1.45 * u); c.quadraticCurveTo(0.3 * u, -1.25 * u, 0.19 * u, -0.92 * u); c.fill();
  c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(-0.035 * u, -1.44 * u, 0.07 * u, 0.5 * u);
  c.fillStyle = '#15152a'; c.fillRect(-0.19 * u, -0.98 * u, 0.38 * u, 0.1 * u);
  // armen + stuur
  c.strokeStyle = r.color; c.lineWidth = 0.09 * u;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.22 * u, -1.4 * u); c.lineTo(s * 0.31 * u, -1.1 * u); c.stroke(); }
  c.strokeStyle = '#23233a'; c.lineWidth = 0.05 * u; c.beginPath(); c.moveTo(-0.34 * u, -1.08 * u); c.lineTo(0.34 * u, -1.08 * u); c.stroke();
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
  if (r.bell > 0) { c.font = `${0.45 * u}px sans-serif`; c.textAlign = 'center'; c.fillText('🔔', 0.4 * u, -1.9 * u); }
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

export function drawRocket(c, X, Y, u) {
  const y = Y - 0.8 * u;
  c.fillStyle = 'rgba(255,160,60,.5)'; c.beginPath(); c.arc(X, y, (0.45 + Math.random() * 0.2) * u, 0, 7); c.fill();
  c.fillStyle = '#ff3b3b'; c.beginPath(); c.ellipse(X, y, 0.22 * u, 0.3 * u, 0, 0, 7); c.fill();
  c.fillStyle = '#ffe26b'; c.beginPath(); c.arc(X, y, 0.12 * u, 0, 7); c.fill();
}
