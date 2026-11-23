// Sturen met de telefoon: zet hem vast op je stuur, en de draaiing om de verticale as wordt je stuuruitslag.
// We gebruiken 'deviceorientation' (gyroscoop + versnellingsmeter, door het toestel zelf samengevoegd; zonder kompas,
// dat raakt in de war door de magneten van een trainer). Uit de hoeken maken we een draaimatrix en nemen de
// windrichting van een as die ongeveer horizontaal ligt: de schermnormaal als de telefoon rechtop hangt, anders de lange as.
// Zo maakt het niet uit of de telefoon liggend, rechtop of plat op het stuur zit.

const D = Math.PI / 180;

// Assen van het toestel in wereldcoördinaten (oost, noord, omhoog), volgens de W3C-definitie (Z-X'-Y'').
export function axes(alpha, beta, gamma) {
  const cA = Math.cos(alpha * D), sA = Math.sin(alpha * D), cB = Math.cos(beta * D), sB = Math.sin(beta * D), cG = Math.cos(gamma * D), sG = Math.sin(gamma * D);
  return {
    y: [-cB * sA, cA * cB, sB], // lange as (bovenkant van het toestel)
    z: [cA * sG + cG * sA * sB, sA * sG - cA * cG * sB, cB * cG], // schermnormaal
  };
}
// Windrichting (graden, met de klok mee) van een as, en hoe horizontaal die ligt (0..1).
export function heading(v) { return { deg: Math.atan2(v[0], v[1]) / D, flat: Math.hypot(v[0], v[1]) }; }
export const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

export class GyroSteer {
  constructor() {
    this.on = false; this.axis = 'z'; this.yaw = 0; this.center = null; this.angle = 0; this.last = 0; this.range = 20;
    this._h = (e) => this._event(e);
  }
  static available() { return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window; }
  static needsPermission() { return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'; }
  // Aanzetten. Op een iPhone moet dit vanuit een tik gebeuren (toestemming). Geeft true als er sensordata binnenkomt.
  async start() {
    if (!GyroSteer.available()) throw new Error('Dit toestel heeft geen bewegingssensor');
    if (GyroSteer.needsPermission()) {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') throw new Error('Geen toestemming voor beweging en stand');
    }
    window.addEventListener('deviceorientation', this._h);
    this.on = true; this.center = null; this.last = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) { if (this.last) return true; await new Promise((r) => setTimeout(r, 50)); }
    this.stop();
    throw new Error('Geen gegevens van de bewegingssensor');
  }
  stop() { window.removeEventListener('deviceorientation', this._h); this.on = false; this.angle = 0; }
  get active() { return this.on && performance.now() - this.last < 1000; }
  _event(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const A = axes(e.alpha, e.beta, e.gamma);
    // As kiezen bij het rechtzetten; ligt die (bijna) verticaal, dan de andere.
    if (this.center == null || heading(A[this.axis]).flat < 0.2) { this.axis = heading(A.z).flat >= heading(A.y).flat ? 'z' : 'y'; this.center = null; }
    const h = heading(A[this.axis]).deg;
    const now = performance.now(), dt = this.last ? Math.min(0.2, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.center == null) this.center = h;
    let a = wrap(h - this.center);
    // Verloop: kleine afwijkingen lopen in ~45 s vanzelf terug naar het midden (rechtdoor rijden zet het stuur recht).
    if (Math.abs(a) < 5) { this.center = wrap(this.center + a * (dt / 45)); a = wrap(h - this.center); }
    // Trillingen van het trappen eruit filteren.
    this.angle += (a - this.angle) * Math.min(1, dt / 0.06 || 1);
  }
  calibrate() { this.center = null; this.angle = 0; }
  // -1..1, zelfde gevoel als de Sterzo: kleine dode zone, volledig sturen bij 'range' graden.
  get steer() {
    if (!this.active) return 0;
    const a = this.angle, dead = 1.5;
    if (Math.abs(a) < dead) return 0;
    return Math.max(-1, Math.min(1, (a - Math.sign(a) * dead) / Math.max(4, this.range - dead)));
  }
}
