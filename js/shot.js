// Ritfoto: een momentopname van het spel net na de start, met het Watt Blitz-logo en de cijfers
// van de rit eronder. Bedoeld om bij je Strava-rit te zetten.
const W = 1600, H = 900;

export function grab(canvas) {
  const c = document.createElement('canvas');
  c.width = W; c.height = Math.round((W * canvas.height) / canvas.width);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

function logo(g, x, y, size) {
  g.save();
  g.font = `italic 900 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.textBaseline = 'top';
  g.shadowColor = 'rgba(255,63,164,.9)'; g.shadowBlur = size * 0.35;
  const w1 = g.measureText('WATT').width, gap = size * 0.18;
  g.fillStyle = '#6a2bff'; g.fillText('WATT', x + size * 0.06, y + size * 0.06);
  g.fillStyle = '#f5f5ff'; g.fillText('WATT', x, y);
  g.fillStyle = '#6a2bff'; g.fillText('BLITZ', x + w1 + gap + size * 0.06, y + size * 0.06);
  g.fillStyle = '#ffd166'; g.fillText('BLITZ', x + w1 + gap, y);
  const w2 = g.measureText('BLITZ').width;
  g.shadowBlur = 0; g.fillStyle = '#ffe26b';
  const bx = x + w1 + gap + w2 + gap * 0.6, s = size / 100; // bliksemschicht
  g.beginPath(); g.moveTo(bx + 58 * s, y); g.lineTo(bx + 12 * s, y + 58 * s); g.lineTo(bx + 42 * s, y + 58 * s);
  g.lineTo(bx + 30 * s, y + 100 * s); g.lineTo(bx + 80 * s, y + 38 * s); g.lineTo(bx + 50 * s, y + 38 * s); g.closePath(); g.fill();
  g.restore();
}

// stats: [[waarde, label], ...]; title: bv. "Neon Polder · 20 nov 2026"
export function compose(shot, title, stats) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#12032e'; g.fillRect(0, 0, W, H);
  if (shot) { // vullen en centreren
    const s = Math.max(W / shot.width, H / shot.height);
    g.drawImage(shot, (W - shot.width * s) / 2, (H - shot.height * s) / 2, shot.width * s, shot.height * s);
  }
  let grd = g.createLinearGradient(0, 0, 0, 200); // donkere rand boven voor het logo
  grd.addColorStop(0, 'rgba(18,3,46,.85)'); grd.addColorStop(1, 'rgba(18,3,46,0)');
  g.fillStyle = grd; g.fillRect(0, 0, W, 200);
  logo(g, 44, 34, 86);
  g.font = '700 30px system-ui, sans-serif'; g.fillStyle = '#7df9ff'; g.textBaseline = 'top';
  g.fillText(title, 48, 136);
  if (stats.length) { // cijferbalk onder
    grd = g.createLinearGradient(0, H - 230, 0, H);
    grd.addColorStop(0, 'rgba(18,3,46,0)'); grd.addColorStop(0.45, 'rgba(18,3,46,.88)'); grd.addColorStop(1, 'rgba(18,3,46,.95)');
    g.fillStyle = grd; g.fillRect(0, H - 230, W, 230);
    const cw = (W - 96) / stats.length;
    stats.forEach(([v, l], i) => {
      const x = 48 + i * cw;
      g.textBaseline = 'alphabetic';
      g.font = 'italic 900 58px system-ui, sans-serif'; g.fillStyle = '#f5f5ff'; g.fillText(v, x, H - 72);
      g.font = '700 24px system-ui, sans-serif'; g.fillStyle = '#a9a3c9'; g.fillText(l.toUpperCase(), x + 2, H - 36);
    });
  }
  g.strokeStyle = '#ff3fa4'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8);
  return c;
}
