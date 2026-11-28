// Bluetooth: Wahoo KICKR (FTMS + Cycling Power) en Elite Sterzo Smart, via Web Bluetooth.
// Standaard-UUID's voluit geschreven: niet elke Web Bluetooth-browser (bijv. Bluefy op iPhone) snapt de korte getallen.
export const uuid16 = (n) => `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
const FTMS = uuid16(0x1826), CPS = uuid16(0x1818), HRS = uuid16(0x180d);
const INDOOR_BIKE_DATA = uuid16(0x2ad2), FTMS_CONTROL = uuid16(0x2ad9), CP_MEASUREMENT = uuid16(0x2a63), HR_MEASUREMENT = uuid16(0x2a37);
const STERZO_SVC = '347b0001-7635-408b-8918-8ff3949ce592';
const STERZO_ANGLE = '347b0030-7635-408b-8918-8ff3949ce592';
const STERZO_RX = '347b0031-7635-408b-8918-8ff3949ce592';
const STERZO_TX = '347b0032-7635-408b-8918-8ff3949ce592';

export const bleSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Leesbare foutmelding, ook als een browser iets anders dan een Error gooit (Bluefy doet dat soms).
export function errText(e) {
  if (e == null) return 'onbekende fout';
  if (typeof e === 'string') return e;
  return e.message || e.name || (e.code != null ? 'foutcode ' + e.code : '') || String(e) || 'onbekende fout';
}
// Gooit opnieuw met de stap erbij ("verbinden: ..."), zodat we zien waar het misging. De naam blijft (NotFoundError = geannuleerd).
function stepError(step, e) {
  const err = new Error(`${step}: ${errText(e)}`);
  err.name = (e && e.name) || 'Error';
  return err;
}

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

// Breekt een Bluetooth-stap af als die blijft hangen (dat gebeurt soms bij een slapend apparaat).
function withTimeout(p, ms, what) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(what)), ms); })]).finally(() => clearTimeout(t));
}

class Device {
  constructor(label = 'Apparaat') {
    this.device = null;
    this.connected = false;
    this.name = '';
    this.label = label;
    this.log = []; // [tijd, gebeurtenis] voor het diagnosescherm
    this.onstatus = () => {};
    this.onlost = () => {}; // verbinding onverwacht weg
    this.onback = () => {}; // weer terug na herverbinden
    this._wantConnected = false;
    this._refreshing = false;
    this._reconnecting = false;
  }
  _log(ev) {
    this.log.push([Date.now(), ev]);
    if (this.log.length > 60) this.log.shift();
  }
  async _open(options) {
    try { this.device = await navigator.bluetooth.requestDevice(options); }
    catch (e) { if (e?.name !== 'NotFoundError') this._log('kiezen mislukt: ' + errText(e)); throw stepError('kiezen', e); }
    this.name = this.device.name || 'apparaat';
    this._wantConnected = true;
    this.device.addEventListener('gattserverdisconnected', () => this._onDisconnect());
    try { await this._attach(); }
    catch (e) { this._wantConnected = false; this._log('mislukt: ' + errText(e)); throw e; }
    this._log('verbonden');
  }
  async _attach() {
    let step = 'verbinden';
    try {
      const server = await withTimeout(this.device.gatt.connect(), 10000, 'duurt te lang');
      step = 'opstarten';
      await withTimeout(this._setup(server), 10000, 'duurt te lang');
    } catch (e) {
      try { this.device.gatt.disconnect(); } catch (_) { /* negeer */ }
      const err = stepError(step, e);
      // Gevonden maar niet te verbinden: meestal hangt hij nog aan een andere app (bijv. Wahoo of Zwift op je telefoon).
      if (step === 'verbinden') err.message += ' – is hij nog verbonden met een andere app of telefoon? Verbreek die verbinding en probeer opnieuw.';
      throw err;
    }
    this.connected = true;
    this.onstatus();
  }
  _onDisconnect() {
    if (this._refreshing || !this._wantConnected) return; // zelf verbroken: geen alarm
    this._log('verbinding verbroken');
    this.connected = false;
    this.onstatus();
    this.onlost();
    this._reconnect();
  }
  // Blijft opnieuw proberen zolang de verbinding gewenst is: eerst snel, daarna elke 5 seconden.
  async _reconnect() {
    if (this._reconnecting) return;
    this._reconnecting = true;
    for (let i = 0; this._wantConnected; i++) {
      await sleep([300, 1000, 2000, 3000][i] ?? 5000);
      if (!this._wantConnected) break;
      try {
        await this._attach();
        this._log(`weer verbonden (poging ${i + 1})`);
        this.onback();
        break;
      } catch (e) {
        if (i < 5 || i % 12 === 0) this._log(`poging ${i + 1} mislukt: ${errText(e)}`);
      }
    }
    this._reconnecting = false;
  }
  // Verbreekt de verbinding en maakt hem meteen opnieuw, zonder alarm (voor de Click v2).
  async refresh(reason) {
    if (!this.connected || this._refreshing || this._reconnecting) return;
    this._refreshing = true;
    this._log('vernieuwen: ' + reason);
    try {
      try { this.device.gatt.disconnect(); } catch (_) { /* negeer */ }
      await sleep(250);
      await this._attach();
      this._log('vernieuwd');
      this._refreshing = false;
    } catch (e) {
      this._log('vernieuwen mislukt: ' + errText(e));
      this._refreshing = false;
      this.connected = false;
      this.onstatus();
      this.onlost();
      this._reconnect();
    }
  }
  disconnect() {
    this._wantConnected = false;
    this._log('losgekoppeld');
    try { this.device?.gatt?.disconnect(); } catch (e) { /* negeer */ }
    this.connected = false;
    this.onstatus();
  }
}

export class Trainer extends Device {
  constructor() {
    super('Trainer');
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
        this._lastGrade = null; this._lastTarget = null; // na (opnieuw) verbinden alles opnieuw sturen
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
    this._queue = this._queue.then(() => (cp.writeValueWithResponse ? cp.writeValueWithResponse(data) : cp.writeValue(data))).catch(() => {});
    return this._queue;
  }
  // Helling (%) naar de trainer; max 1x per seconde en alleen bij verandering.
  setGrade(pct) {
    if (!this._cp || !this.connected) return;
    const now = performance.now();
    const g = Math.round(pct * 10) / 10;
    if (g === this._lastGrade || now - this._lastGradeAt < 250) return; // vaak genoeg om schakelen direct te voelen
    this._lastGrade = g;
    this._lastGradeAt = now;
    this._lastTarget = null; // terug in hellingsmodus: een volgend ERG-doel moet opnieuw verstuurd worden
    this._write(simParamsCommand(g));
  }
  // ERG: de trainer houdt zelf dit vermogen vast (FTMS 'Set Target Power').
  // Bij verandering meteen (een nieuw blok), anders hooguit eens per 2 s (hellingen in een blok).
  setTargetPower(watts) {
    if (!this._cp || !this.connected) return;
    const w = Math.max(0, Math.min(2000, Math.round(watts)));
    const now = performance.now();
    if (w === this._lastTarget) return;
    if (this._lastTarget != null && Math.abs(w - this._lastTarget) < 10 && now - this._lastTargetAt < 2000) return;
    this._lastTarget = w;
    this._lastTargetAt = now;
    this._lastGrade = null; // terug naar hellingsmodus stuurt dan meteen weer de helling
    this._write(targetPowerCommand(w));
  }
}
export function targetPowerCommand(watts) {
  const b = new DataView(new ArrayBuffer(3));
  b.setUint8(0, 0x05);
  b.setInt16(1, Math.round(watts), true);
  return new Uint8Array(b.buffer);
}

export class HeartRate extends Device {
  constructor() {
    super('Hartslagmeter');
    this.bpm = 0;
    this.lastData = 0;
  }
  async connect() {
    await this._open({ filters: [{ services: [HRS] }] });
  }
  async _setup(server) {
    const svc = await server.getPrimaryService(HRS);
    const ch = await svc.getCharacteristic(HR_MEASUREMENT);
    ch.addEventListener('characteristicvaluechanged', (e) => {
      this.bpm = parseHeartRate(e.target.value);
      this.lastData = performance.now();
    });
    await ch.startNotifications();
  }
  // Actuele hartslag, of 0 als er (even) geen meting is.
  get value() { return this.connected && performance.now() - this.lastData < 5000 ? this.bpm : 0; }
}

// --- Zwift-knoppen (Play, Click, Ride/Click v2) ---
// Na het schrijven van "RideOn" sturen de knoppen hun toestand als protobuf-berichtje.
const ZWIFT_SVC = '00000001-19ca-4651-86e5-fa29dcdd09d1', ZWIFT_SVC_RIDE = uuid16(0xfc82);
const ZWIFT_ASYNC = '00000002-19ca-4651-86e5-fa29dcdd09d1';
const ZWIFT_RX = '00000003-19ca-4651-86e5-fa29dcdd09d1';
const ZWIFT_TX = '00000004-19ca-4651-86e5-fa29dcdd09d1';
const RIDE_BITS = {
  left: 0x1, up: 0x2, right: 0x4, down: 0x8, a: 0x10, b: 0x20, y: 0x40, z: 0x80,
  shiftUpL: 0x100, shiftDnL: 0x200, powerL: 0x400, shiftUpR: 0x1000, shiftDnR: 0x2000, powerR: 0x4000,
};

function pbFields(bytes) {
  const out = [];
  let i = 0;
  const varint = () => {
    let v = 0, s = 1, b;
    do { b = bytes[i++]; v += (b & 0x7f) * s; s *= 128; } while (b & 0x80 && i < bytes.length);
    return v;
  };
  while (i < bytes.length) {
    const tag = varint(), f = Math.floor(tag / 8), w = tag & 7;
    if (w === 0) out.push([f, varint()]);
    else if (w === 2) { const n = varint(); out.push([f, bytes.subarray(i, i + n)]); i += n; }
    else if (w === 5) i += 4;
    else if (w === 1) i += 8;
    else break;
  }
  return out;
}
const zigzag = (v) => (v % 2 ? -(v + 1) / 2 : v / 2);

// Vertaalt een knoppenbericht naar spelacties, of null:
// { kind, left, right (0..1), item, elbow, up, down }. up/down = de schakelknoppen (zwaarder/lichter);
// wat die doen (schakelen of power-up) bepaalt main.js aan de hand van de instelling.
export function parseZwiftPad(bytes) {
  const type = bytes[0];
  if (type !== 0x07 && type !== 0x37 && type !== 0x23) return null;
  const fields = pbFields(bytes.subarray(1));
  const m = new Map(fields.filter(([, v]) => typeof v === 'number'));
  const on = (f) => (m.get(f) ?? 0) === 0; // 0 (of weggelaten, de protobuf-standaard) = ingedrukt
  const out = { kind: type === 0x07 ? 'play' : type === 0x37 ? 'click' : 'ride', left: 0, right: 0, item: false, elbow: false, up: false, down: false, hop: false };
  if (type === 0x07) { // Zwift Play
    const rightPad = on(1), paddle = Math.min(1, Math.abs(zigzag(m.get(8) || 0)) / 100);
    if (rightPad) {
      out.item = on(4) || on(3) || on(6); // A, Z, aan/uit-knop
      out.up = on(7); // zijknop rechts = zwaarder
      out.elbow = on(2); // Y
      out.hop = on(5); // B: springen (veldrit); elders het elleboogje
      out.right = paddle;
    } else {
      out.left = on(3) ? 1 : paddle; // pijl links of flipper
      out.right = on(4) ? 1 : 0;
      out.item = on(2) || on(6); // pijl omhoog, aan/uit-knop
      out.down = on(7); // zijknop links = lichter
      out.elbow = on(5);
    }
  } else if (type === 0x37) { // Zwift Click: + en -
    const plus = on(1), minus = on(2);
    if (plus && minus) out.item = true;
    else { out.right = plus ? 1 : 0; out.left = minus ? 1 : 0; out.up = plus; out.down = minus; }
  } else { // Zwift Ride / Click v2: bitmasker, 0 = ingedrukt
    if (!m.has(1)) return null;
    // Elk knopje werkt ook los: links ←/→ sturen, ↑ power-up, ↓ elleboogje;
    // rechts Z/A sturen, Y power-up, B springen (veldrit; elders het elleboogje). De schakelknoppen: links = lichter, rechts = zwaarder.
    const map = m.get(1), p = (k) => (map & RIDE_BITS[k]) === 0;
    out.left = p('left') || p('z') ? 1 : 0;
    out.right = p('right') || p('a') ? 1 : 0;
    out.item = p('up') || p('y') || p('powerL') || p('powerR');
    out.down = p('shiftUpL') || p('shiftDnL');
    out.up = p('shiftUpR') || p('shiftDnR');
    out.elbow = p('down');
    out.hop = p('b');
    for (const [f, v] of fields) {
      if (f !== 3 || typeof v === 'number') continue;
      const pm = new Map(pbFields(v)), val = Math.min(1, Math.abs(zigzag(pm.get(2) || 0)) / 100);
      if ((pm.get(1) || 0) === 0) out.left = Math.max(out.left, val); else if (pm.get(1) === 1) out.right = Math.max(out.right, val);
    }
  }
  return out;
}

// De Click v2 stopt in andere apps dan Zwift na ongeveer een minuut met berichten sturen.
// Het rechter knopje blijft werken als we hem op tijd opnieuw verbinden; dat doen we ongemerkt
// elke 50 seconden, op een moment dat er geen knop is ingedrukt.
export const PAD_REFRESH_MS = 50000;

export class ZwiftPad extends Device {
  constructor() {
    super('Zwift-knop');
    this.onpad = () => {};
    this.kind = null; // 'play' | 'click' | 'ride' (Ride of Click v2), zodra er een bericht is geweest
    this.pressed = false;
    this.lastData = 0;
    this._lastRefresh = 0;
    // Vaste functie: zo wordt hij bij herverbinden niet dubbel aan dezelfde kenmerken gehangen.
    this._onData = (e) => {
      const v = e.target.value, bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      if (bytes[0] === 0xff) { this._log('stopbericht van de knop'); this.refresh('stopbericht'); return; }
      const a = parseZwiftPad(bytes);
      if (!a) return;
      this.kind = a.kind;
      this.pressed = a.left > 0 || a.right > 0 || a.item || a.elbow || a.up || a.down;
      this.lastData = performance.now();
      if (this.pressed) this.lastPress = this.lastData;
      this.onpad(a);
    };
    this._timer = null;
    // Wakker houden (proef): de knop valt na een tijd zonder knopdruk in slaap om zijn batterij te sparen.
    // De eerste keer meten we na hoeveel tijd (T); daarna sturen we ~10 s daarvoor een seintje (de begroeting
    // opnieuw). Valt hij toch in slaap terwijl er net een seintje was, dan werkt het bij deze knop niet: dan stoppen we.
    this.wake = { on: false, T: 0, bad: false };
    this.onwake = () => {};
    this.lastPress = performance.now();
    this._lastPing = 0;
    this._rx = null;
  }
  _onDisconnect() {
    if (!this._refreshing && this._wantConnected && this.wake.on && !this.wake.bad) {
      const now = performance.now(), idle = now - this.lastPress;
      if (this.wake.T && this._lastPing && now - this._lastPing < this.wake.T - 3000) { this.wake.bad = true; this._log('wakker houden werkt niet bij deze knop'); }
      else if (idle > 15000 && (!this.wake.T || idle < this.wake.T)) { this.wake.T = Math.round(idle); this._log(`in slaap na ${Math.round(idle / 1000)} s zonder knopdruk`); }
      this.onwake();
    }
    super._onDisconnect();
  }
  _ping(now) {
    if (!this._rx) return;
    this._lastPing = now;
    const msg = new TextEncoder().encode('RideOn');
    (this._rx.writeValueWithoutResponse ? this._rx.writeValueWithoutResponse(msg) : this._rx.writeValue(msg)).then(() => this._log('seintje (wakker houden)'), () => {});
  }
  get needsRefresh() {
    return /click/i.test(this.name) && this.kind !== 'click'; // Click v2 (de eerste Click heeft dit niet nodig)
  }
  // Wordt elke paar seconden aangeroepen.
  keepAlive(now = performance.now()) {
    const w = this.wake;
    if (this.connected && w.on && !w.bad && w.T && now - Math.max(this.lastPress, this._lastPing) > Math.max(5000, w.T - 10000)) this._ping(now);
    if (!this.connected || !this.needsRefresh || this.pressed) return false;
    if (now - this._lastRefresh < PAD_REFRESH_MS) return false;
    this.refresh('elke minuut (Click v2)');
    return true;
  }
  async connect() {
    await this._open({
      filters: [{ namePrefix: 'Zwift' }, { services: [ZWIFT_SVC] }, { services: [ZWIFT_SVC_RIDE] }],
      optionalServices: [ZWIFT_SVC, ZWIFT_SVC_RIDE],
    });
    clearInterval(this._timer);
    this._timer = setInterval(() => this.keepAlive(), 3000);
  }
  disconnect() {
    clearInterval(this._timer);
    super.disconnect();
  }
  async _setup(server) {
    let svc;
    try { svc = await server.getPrimaryService(ZWIFT_SVC_RIDE); } catch (e) { svc = await server.getPrimaryService(ZWIFT_SVC); }
    const async_ = await svc.getCharacteristic(ZWIFT_ASYNC), rx = await svc.getCharacteristic(ZWIFT_RX), tx = await svc.getCharacteristic(ZWIFT_TX); // na elkaar: niet elke browser kan GATT-stappen tegelijk
    async_.addEventListener('characteristicvaluechanged', this._onData);
    tx.addEventListener('characteristicvaluechanged', this._onData);
    await async_.startNotifications();
    await tx.startNotifications().catch(() => {});
    await (rx.writeValueWithoutResponse ? rx.writeValueWithoutResponse(new TextEncoder().encode('RideOn')) : rx.writeValue(new TextEncoder().encode('RideOn')));
    this._rx = rx;
    this.pressed = false;
    this._lastRefresh = performance.now();
  }
}

let codesPromise = null;
const loadCodes = () => (codesPromise ||= fetch('data/sterzo-challenge-codes.dat').then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)));

export class Sterzo extends Device {
  constructor() {
    super('Sterzo');
    this.angle = 0; // graden, + = rechts
    this.center = 0;
    this.range = 24; // graden voorbij de dode zone voor volle uitslag (stuurgevoeligheid)
    this.lastData = 0;
  }
  async connect() {
    await this._open({ filters: [{ namePrefix: 'STERZO' }, { services: [STERZO_SVC] }], optionalServices: [STERZO_SVC] });
  }
  async _setup(server) {
    const codes = await loadCodes();
    const svc = await server.getPrimaryService(STERZO_SVC);
    const angle = await svc.getCharacteristic(STERZO_ANGLE), rx = await svc.getCharacteristic(STERZO_RX), tx = await svc.getCharacteristic(STERZO_TX);
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
    return Math.max(-1, Math.min(1, (a - Math.sign(a) * dead) / this.range));
  }
}
