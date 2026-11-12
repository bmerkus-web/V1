// Bluetooth: Wahoo KICKR (FTMS + Cycling Power) en Elite Sterzo Smart, via Web Bluetooth.
const FTMS = 0x1826, CPS = 0x1818;
const INDOOR_BIKE_DATA = 0x2ad2, FTMS_CONTROL = 0x2ad9, CP_MEASUREMENT = 0x2a63;
const STERZO_SVC = '347b0001-7635-408b-8918-8ff3949ce592';
const STERZO_ANGLE = '347b0030-7635-408b-8918-8ff3949ce592';
const STERZO_RX = '347b0031-7635-408b-8918-8ff3949ce592';
const STERZO_TX = '347b0032-7635-408b-8918-8ff3949ce592';

export const bleSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Parsers (los getest in tests/) ---
export function parseIndoorBikeData(dv) {
  const flags = dv.getUint16(0, true);
  let o = 2;
  const out = {};
  if (!(flags & 1)) { out.speedKmh = dv.getUint16(o, true) / 100; o += 2; }
  if (flags & 2) o += 2;
  if (flags & 4) { out.cadence = dv.getUint16(o, true) / 2; o += 2; }
  if (flags & 8) o += 2;
  if (flags & 16) o += 3;
  if (flags & 32) o += 2;
  if (flags & 64) { out.power = dv.getInt16(o, true); o += 2; }
  return out;
}

export function parseCyclingPower(dv, prev) {
  const flags = dv.getUint16(0, true);
  const out = { power: dv.getInt16(2, true) };
  let o = 4;
  if (flags & 1) o += 1;
  if (flags & 4) o += 2;
  if (flags & 16) o += 6;
  if (flags & 32 && dv.byteLength >= o + 4) {
    const revs = dv.getUint16(o, true), time = dv.getUint16(o + 2, true);
    out.crank = { revs, time };
    if (prev) {
      const dr = (revs - prev.revs) & 0xffff, dt = ((time - prev.time) & 0xffff) / 1024;
      if (dr > 0 && dt > 0) out.cadence = (dr / dt) * 60;
      else if (dr === 0) out.cadenceStale = true;
    }
  }
  return out;
}

export function parseHeartRate(dv) {
  return dv.getUint8(0) & 1 ? dv.getUint16(1, true) : dv.getUint8(1);
}

export function simParamsCommand(gradePct, crr = 0.004, cw = 0.51) {
  const b = new DataView(new ArrayBuffer(7));
  b.setUint8(0, 0x11);
  b.setInt16(1, 0, true); // wind
  b.setInt16(3, Math.round(Math.max(-20, Math.min(20, gradePct)) * 100), true);
  b.setUint8(5, Math.round(crr * 10000));
  b.setUint8(6, Math.round(cw * 100));
  return b;
}

class Device {
  constructor() {
    this.device = null;
    this.connected = false;
    this.name = '';
    this.onstatus = () => {};
    this._wantConnected = false;
  }
  async _open(options) {
    this.device = await navigator.bluetooth.requestDevice(options);
    this.name = this.device.name || 'apparaat';
    this._wantConnected = true;
    this.device.addEventListener('gattserverdisconnected', () => this._lost());
    await this._attach();
  }
  async _attach() {
    const server = await this.device.gatt.connect();
    await this._setup(server);
    this.connected = true;
    this.onstatus();
  }
  async _lost() {
    this.connected = false;
    this.onstatus();
    for (let i = 0; this._wantConnected && i < 30; i++) {
      await sleep(Math.min(8000, 1000 + i * 1000));
      if (!this._wantConnected) return;
      try { await this._attach(); return; } catch (e) { /* opnieuw proberen */ }
    }
  }
  disconnect() {
    this._wantConnected = false;
    try { this.device?.gatt?.disconnect(); } catch (e) { /* negeer */ }
    this.connected = false;
    this.onstatus();
  }
}

export class Trainer extends Device {
  constructor() {
    super();
    this.power = 0;
    this.cadence = 0;
    this.lastData = 0;
    this.canControl = false;
    this._cp = null;
    this._queue = Promise.resolve();
    this._lastGrade = null;
    this._lastGradeAt = 0;
    this._crank = null;
    this._crankStale = 0;
  }
  async connect() {
    await this._open({
      filters: [{ services: [FTMS] }, { services: [CPS] }, { namePrefix: 'KICKR' }],
      optionalServices: [FTMS, CPS],
    });
  }
  async _setup(server) {
    this._cp = null;
    this.canControl = false;
    let got = false;
    try {
      const svc = await server.getPrimaryService(FTMS);
      const ch = await svc.getCharacteristic(INDOOR_BIKE_DATA);
      ch.addEventListener('characteristicvaluechanged', (e) => {
        const d = parseIndoorBikeData(e.target.value);
        if (d.power != null) this.power = Math.max(0, d.power);
        if (d.cadence != null) this.cadence = d.cadence;
        this.lastData = performance.now();
      });
      await ch.startNotifications();
      got = true;
      try {
        this._cp = await svc.getCharacteristic(FTMS_CONTROL);
        await this._cp.startNotifications().catch(() => {});
        await this._write(new Uint8Array([0x00])); // request control
        await this._write(new Uint8Array([0x07])); // start
        this.canControl = true;
        this._lastGrade = null;
      } catch (e) { this._cp = null; }
    } catch (e) { /* geen FTMS: val terug op Cycling Power */ }
    try {
      const svc = await server.getPrimaryService(CPS);
      const ch = await svc.getCharacteristic(CP_MEASUREMENT);
      ch.addEventListener('characteristicvaluechanged', (e) => {
        const d = parseCyclingPower(e.target.value, this._crank);
        this.power = Math.max(0, d.power);
        if (d.crank) this._crank = d.crank;
        if (d.cadence != null) { this.cadence = d.cadence; this._crankStale = 0; }
        else if (d.cadenceStale && ++this._crankStale > 3) this.cadence = 0;
        this.lastData = performance.now();
      });
      await ch.startNotifications();
      got = true;
    } catch (e) { /* geen CPS */ }
    if (!got) throw new Error('Geen vermogensdata gevonden op dit apparaat');
  }
  _write(data) {
    const cp = this._cp;
    this._queue = this._queue.then(() => cp.writeValueWithResponse(data)).catch(() => {});
    return this._queue;
  }
  // Helling (%) naar de trainer; max 1x per seconde en alleen bij verandering.
  setGrade(pct) {
    if (!this._cp || !this.connected) return;
    const now = performance.now();
    const g = Math.round(pct * 10) / 10;
    if (g === this._lastGrade || now - this._lastGradeAt < 1000) return;
    this._lastGrade = g;
    this._lastGradeAt = now;
    this._write(simParamsCommand(g));
  }
}

export class HeartRate extends Device {
  constructor() {
    super();
    this.bpm = 0;
    this.lastData = 0;
  }
  async connect() {
    await this._open({ filters: [{ services: [0x180d] }] });
  }
  async _setup(server) {
    const svc = await server.getPrimaryService(0x180d);
    const ch = await svc.getCharacteristic(0x2a37);
    ch.addEventListener('characteristicvaluechanged', (e) => {
      this.bpm = parseHeartRate(e.target.value);
      this.lastData = performance.now();
    });
    await ch.startNotifications();
  }
  // Actuele hartslag, of 0 als er (even) geen meting is.
  get value() { return this.connected && performance.now() - this.lastData < 5000 ? this.bpm : 0; }
}

let codesPromise = null;
const loadCodes = () => (codesPromise ||= fetch('data/sterzo-challenge-codes.dat').then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)));

export class Sterzo extends Device {
  constructor() {
    super();
    this.angle = 0; // graden, + = rechts
    this.center = 0;
    this.lastData = 0;
  }
  async connect() {
    await this._open({ filters: [{ namePrefix: 'STERZO' }, { services: [STERZO_SVC] }], optionalServices: [STERZO_SVC] });
  }
  async _setup(server) {
    const codes = await loadCodes();
    const svc = await server.getPrimaryService(STERZO_SVC);
    const [angle, rx, tx] = await Promise.all([svc.getCharacteristic(STERZO_ANGLE), svc.getCharacteristic(STERZO_RX), svc.getCharacteristic(STERZO_TX)]);
    const challenge = new Promise((resolve, reject) => {
      const h = (e) => {
        const v = e.target.value;
        if (v.byteLength >= 4 && v.getUint8(0) === 0x03 && v.getUint8(1) === 0x10) {
          tx.removeEventListener('characteristicvaluechanged', h);
          resolve(v.getUint16(2, false));
        }
      };
      tx.addEventListener('characteristicvaluechanged', h);
      setTimeout(() => reject(new Error('Sterzo reageert niet')), 8000);
    });
    await tx.startNotifications();
    angle.addEventListener('characteristicvaluechanged', (e) => {
      const a = e.target.value.getFloat32(0, true);
      if (isFinite(a)) { this.angle = a; this.lastData = performance.now(); }
    });
    await angle.startNotifications();
    await rx.writeValue(new Uint8Array([0x03, 0x10]));
    const c = await challenge;
    await rx.writeValue(new Uint8Array([0x03, 0x11, codes[c * 2], codes[c * 2 + 1]]));
    await sleep(600);
    await rx.writeValue(new Uint8Array([0x02, 0x02])).catch(() => {});
  }
  calibrate() { this.center = this.angle; }
  // Genormaliseerde stuuruitslag -1..1 met kleine dode zone.
  get steer() {
    if (!this.connected) return 0;
    const a = this.angle - this.center;
    const dead = 1.5;
    if (Math.abs(a) < dead) return 0;
    return Math.max(-1, Math.min(1, (a - Math.sign(a) * dead) / 24));
  }
}
