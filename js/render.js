// Pseudo-3D wegweergave op canvas (licht genoeg voor een oude Mac of tablet).
import { SEG, ROAD_W, KERB, GUTTER } from './track.js';
import { mod, clamp, mulberry } from './util.js';
import { M7 } from './floor7.js';
import { SCENERY, drawRider, drawBox, drawBolt, drawGlue, drawRocket, drawWall, drawTacks, drawScooter, drawCar, drawBottleArm } from './sprites.js';

const ZS = 1.6, YS = 2.3, CURVE_VIS = 1.8; // visuele rek: diepte, hoogte, bochten
const DRAW = 150, NEAR = 1.2, CAM_H = 3.4;
const DEPTH = 1 / Math.tan((80 * Math.PI) / 360);
const COBBLE_LOOK = { joint: '#4e4858', stones: ['#8b8496', '#7e778a', '#98919f'] }; // kasseien zonder eigen thema

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext('2d', { alpha: false });
    this.bgOff = 0;
    this.shake = 0;
    this.flash = null;
    this.confetti = [];
    this.bg = null;
    this.resize();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 1280 / Math.max(1, r.width));
    const W = Math.max(320, Math.round(r.width * scale)), H = Math.max(200, Math.round(r.height * scale));
    // Alleen opnieuw opbouwen als het formaat echt verandert: Android (vooral in fullscreen) meldt vaak
    // een 'resize' zonder verschil, en elke keer nieuwe achtergrondcanvassen maken liep vol en haperde.
    if (W === this.W && H === this.H) return;
    this.W = this.cv.width = W;
    this.H = this.cv.height = H;
    this.bg = null;
  }

  _buildBg(theme) {
    const { W, H } = this, hz = Math.round(H * 0.44);
    const rng = mulberry(theme.bg.length * 7919 + 13);
    const sky = document.createElement('canvas'); sky.width = W; sky.height = H;
    let c = sky.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, hz + 10);
    theme.sky.forEach((col, i) => g.addColorStop(i / (theme.sky.length - 1), col));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (theme.stars) for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.7})`; const s = rng() < 0.1 ? 2 : 1; c.fillRect(rng() * W, rng() * hz * 0.75, s, s); }
    // zon met strepen: een eigen laagje, zodat hij in bochten mee kan schuiven
    const sr = H * 0.17, sy = hz - sr * 0.35;
    const sun = document.createElement('canvas'); sun.width = sun.height = Math.ceil(sr * 2) + 2;
    const sc = sun.getContext('2d'), sx = sun.width / 2, scy = sun.height / 2;
    const sg = sc.createLinearGradient(0, scy - sr, 0, scy + sr); sg.addColorStop(0, theme.sun); sg.addColorStop(1, theme.sky[2]);
    sc.beginPath(); sc.arc(sx, scy, sr, 0, 7); sc.clip(); sc.fillStyle = sg; sc.fillRect(0, 0, sun.width, sun.height);
    sc.fillStyle = theme.sky[2]; sc.globalAlpha = 0.85;
    for (let i = 0; i < 6; i++) sc.fillRect(sx - sr, scy + sr * (0.05 + i * 0.16), sr * 2, sr * (0.03 + i * 0.012));
    // silhouetlagen (2x breed, herhalend)
    const layers = [0, 1].map((li) => {
      const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = Math.round(H * 0.3);
      const k = cv.getContext('2d'), h = cv.height;
      k.fillStyle = theme.bgColor[li];
      if (theme.bg === 'city') {
        for (let x = 0; x < cv.width;) {
          const bw = W * (0.02 + rng() * 0.04), bh = h * (0.15 + rng() * (li ? 0.45 : 0.75));
          k.fillStyle = theme.bgColor[li]; k.fillRect(x, h - bh, bw, bh);
          k.fillStyle = li ? 'rgba(255,226,107,.5)' : 'rgba(255,63,164,.35)';
          for (let wy = h - bh + 4; wy < h - 4; wy += 7) for (let wx = x + 3; wx < x + bw - 3; wx += 6) if (rng() < 0.3) k.fillRect(wx, wy, 2, 3);
          x += bw + rng() * W * 0.01;
        }
      } else {
        k.beginPath(); k.moveTo(0, h);
        const base = h * (li ? 0.6 : 0.3), amp = h * (li ? 0.3 : 0.55);
        const pts = 28;
        const ys = Array.from({ length: pts }, () => rng());
        for (let i = 0; i <= pts; i++) k.lineTo((i / pts) * cv.width, base + (1 - ys[i % pts]) * amp * (theme.bg === 'space' ? 0.5 : 1) - (theme.bg === 'mountains' && !li && i % 9 === 4 ? h * 0.25 : 0));
        k.lineTo(cv.width, h); k.fill();
        if (theme.bg === 'space' && !li) { // planeet
          const pg = k.createRadialGradient(cv.width * 0.3, h * 0.25, 4, cv.width * 0.3, h * 0.3, h * 0.3);
          pg.addColorStop(0, '#ff9de6'); pg.addColorStop(1, '#5b2bb5');
          k.globalCompositeOperation = 'destination-over'; k.fillStyle = pg; k.beginPath(); k.arc(cv.width * 0.3, h * 0.3, h * 0.26, 0, 7); k.fill();
          k.strokeStyle = 'rgba(185,255,244,.7)'; k.lineWidth = 3; k.beginPath(); k.ellipse(cv.width * 0.3, h * 0.3, h * 0.42, h * 0.08, -0.3, 0, 7); k.stroke();
          k.globalCompositeOperation = 'source-over';
        }
      }
      return cv;
    });
    this.bg = { sky, layers, theme, hz, sun, sunY: sy };
  }

  // Projecteert een punt op segment `seg`, fractie t langs het segment, lateraal in wegbreedtes.
  _pt(seg, t, lat, lift = 0) {
    if (this.cam7) return this._pt7(seg, t, lat, lift); // veldrit: draaiende vloer
    const s = seg.scr;
    const z = Math.max(NEAR, s.z1 + (s.z2 - s.z1) * t);
    const k = (DEPTH / z) * (this.W / 2);
    return {
      X: this.W / 2 + k * (s.xw1 + s.h1 * t + 0.5 * s.c * t * t + lat * ROAD_W - this.camX),
      Y: this.hz - k * ((seg.y1 + (seg.y2 - seg.y1) * t) * YS + lift - this.camY),
      u: k,
    };
  }

  draw(race, dt) {
    const { c, W, H } = this;
    const tr = race.track, th = tr.theme, me = race.me, t = race.clock;
    if (!this.bg || this.bg.theme !== th) this._buildBg(th);
    const hz = (this.hz = this.bg.hz);
    const playerZ = (DEPTH * CAM_H * (W / 2)) / (H * 0.85 - hz);
    const camD = me.dist - playerZ / ZS;
    this.camX = me.x * ROAD_W * 0.8;
    this.camY = tr.yAt(me.dist) * YS + CAM_H;
    const L = tr.length;
    const base = Math.floor(mod(camD, L) / SEG) % tr.n;
    const basePct = mod(camD, SEG) / SEG;

    c.save();
    if (this.shake > 0.3) { c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake); this.shake *= Math.pow(0.02, dt); }

    const frame = (this.frame = (this.frame || 0) + 1);
    if (tr.m7) this._floor7(race, dt, frame); // veldrit: draaiende vloer (floor7.js)
    else {
    this.cam7 = null;
    // --- achtergrond ---
    this.bgOff += tr.segAt(me.dist).curve * me.v * dt * 3;
    c.drawImage(this.bg.sky, 0, 0);
    // De zon schuift in een bocht naar de buitenkant en komt daarna terug: zo voel je de bocht.
    this.turn = (this.turn || 0) + (tr.segAt(me.dist).curve - (this.turn || 0)) * Math.min(1, dt * 1.2);
    const sun = this.bg.sun, sunX = W * 0.5 - Math.max(-W * 0.42, Math.min(W * 0.42, this.turn * W * 0.05));
    c.drawImage(sun, sunX - sun.width / 2, this.bg.sunY - sun.height / 2);
    this.bg.layers.forEach((cv, i) => {
      const off = mod(this.bgOff * (i ? 1.6 : 0.8) * W * 0.004, cv.width);
      c.drawImage(cv, -off, hz - cv.height + 2);
      c.drawImage(cv, cv.width - off, hz - cv.height + 2);
    });

    // --- weg ---
    // De weg is een vloeiende kromme die precies bij de camera recht vooruit begint (positie 0,
    // richting 0). Zo verspringt het beeld niet wanneer de camera een segmentgrens passeert.
    const c0 = tr.segs[base].curve * CURVE_VIS;
    let x = 0.5 * c0 * basePct * basePct, h = -c0 * basePct, maxy = H;
    c.fillStyle = th.grass[0]; c.fillRect(0, hz, W, H - hz);
    for (let n = 0; n < DRAW; n++) {
      const seg = tr.segs[(base + n) % tr.n], s = seg.scr;
      s.z1 = (n - basePct) * SEG * ZS; s.z2 = s.z1 + SEG * ZS;
      s.c = seg.curve * CURVE_VIS; s.xw1 = x; s.h1 = h; s.frame = frame; s.clip = maxy; s.n = n;
      x += h + 0.5 * s.c; h += s.c;
      if (s.z2 <= NEAR) continue;
      const a = this._pt(seg, 0, 0), b = this._pt(seg, 1, 0);
      if (b.Y >= maxy || a.Y <= b.Y) continue;
      const alt = seg.i % 2;
      const w1 = a.u * ROAD_W * seg.wA, w2 = b.u * ROAD_W * seg.wB;
      c.fillStyle = th.grass[alt]; c.fillRect(0, b.Y - 0.5, W, a.Y - b.Y + 1);
      // Kerbstones: korte blokjes in de lijnkleur, afgewisseld met niets. Wie erop rijdt, zit in de berm.
      // Bij de op- en afrit van de short cut ontbreken ze: dat is de enige aanwijzing.
      c.fillStyle = seg.zone === 'sprint' ? '#39ffb0' : seg.zone === 'climb' ? '#ff7b1c' : th.rumble[0];
      const kh = (KERB - 1) / 2;
      for (let q = 0; q < 2; q++) { // twee blokjes per wegsegment, met evenveel ruimte ertussen
        const t1 = q ? 0.5 : 0, t2 = t1 + 0.25;
        const k1 = q ? this._pt(seg, 0.5, 0) : a, k2 = this._pt(seg, t2, 0);
        for (const sd of [-1, 1]) {
          const cu = seg.cut && Math.sign(seg.cut.a) === sd ? seg.cut : null;
          if (cu) { // tweede rij kerbstones langs de andere kant van het short-cut-pad
            const o1 = cu.a + (cu.b - cu.a) * t1 + sd * (cu.hw + kh), o2 = cu.a + (cu.b - cu.a) * t2 + sd * (cu.hw + kh);
            this._quad(k1.X + k1.u * ROAD_W * o1, k1.Y, k1.u * ROAD_W * kh, k2.X + k2.u * ROAD_W * o2, k2.Y, k2.u * ROAD_W * kh);
            if (cu.ramp) continue; // het gat: hier steek je over
          }
          const c1 = seg.wA + (seg.wB - seg.wA) * t1 + kh, c2 = seg.wA + (seg.wB - seg.wA) * t2 + kh; // kerbstones schuiven mee met de wegbreedte
          this._quad(k1.X + sd * k1.u * ROAD_W * c1, k1.Y, k1.u * ROAD_W * kh, k2.X + sd * k2.u * ROAD_W * c2, k2.Y, k2.u * ROAD_W * kh);
        }
      }
      c.fillStyle = seg.i < 2 ? (alt ? '#f5f5ff' : '#15152a') : seg.cobble ? (th.cobble || COBBLE_LOOK).joint : th.road[alt];
      this._quad(a.X, a.Y, w1, b.X, b.Y, w2);
      if (seg.cobble) this._cobbles(seg, a, b, w1, w2, n, th.road[alt], th.cobble || COBBLE_LOOK);
      else if (alt && n < 90) {
        c.fillStyle = th.lane; c.globalAlpha = 0.55;
        for (const l of [-1 / 3, 1 / 3]) this._quad(a.X + w1 * l, a.Y, w1 * 0.014, b.X + w2 * l, b.Y, w2 * 0.014);
        c.globalAlpha = 1;
      }
      if (seg.obs) { // obstakels op het wegdek
        const o = seg.obs, u1 = a.u * ROAD_W, u2 = b.u * ROAD_W, d0 = seg.i * SEG, d1 = d0 + SEG;
        if (o.type === 'bump') { // drempel: geel-zwart over de hele weg
          c.fillStyle = '#ffd166'; this._quad(a.X, a.Y, w1, b.X, b.Y, w2);
          c.fillStyle = '#15152a'; for (let q = -5; q <= 5; q += 2) this._quad(a.X + w1 * q / 6, a.Y, w1 / 12, b.X + w2 * q / 6, b.Y, w2 / 12);
        } else if (o.type === 'island' || o.type === 'works') {
          const end = (d) => Math.min(1, Math.max(0.3, Math.min(d - o.at, o.at + o.len - d) / 4)); // afgeronde kopjes
          const h1 = o.w * (o.type === 'island' ? end(d0) : 1), h2 = o.w * (o.type === 'island' ? end(d1) : 1);
          c.fillStyle = o.type === 'island' ? th.rumble[alt ? 1 : 0] : alt ? '#ff7b1c' : '#3a2a20';
          this._quad(a.X + u1 * o.x, a.Y, u1 * h1, b.X + u2 * o.x, b.Y, u2 * h2);
          if (o.type === 'island') { c.fillStyle = th.grass[alt]; this._quad(a.X + u1 * o.x, a.Y, u1 * h1 * 0.78, b.X + u2 * o.x, b.Y, u2 * h2 * 0.78); }
        }
      }
      if (seg.pad) {
        const p = seg.pad, blink = (Math.floor(t * 8) + seg.i) % 3;
        c.fillStyle = blink === 0 ? '#fff36b' : blink === 1 ? '#ff9a1c' : '#ff5a1c';
        this._quad(a.X + w1 * p.x, a.Y, w1 * p.w, b.X + w2 * p.x, b.Y, w2 * p.w);
      }
      maxy = b.Y;
    }
    // nevel bij de horizon
    const fg = c.createLinearGradient(0, hz - H * 0.03, 0, hz + H * 0.1);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.3, th.fog + '77'); fg.addColorStop(1, th.fog + '00');
    c.fillStyle = fg; c.fillRect(0, hz - H * 0.03, W, H * 0.13);

    }
    // --- dynamische objecten per segment verzamelen ---
    const dyn = new Map();
    const put = (d, o) => {
      const rel = mod(d - camD, L);
      if (!tr.m7 && rel > (DRAW - 2) * SEG) return;
      const idx = Math.floor(mod(d, L) / SEG) % tr.n;
      o.t = mod(d, SEG) / SEG;
      (dyn.get(idx) || dyn.set(idx, []).get(idx)).push(o);
    };
    for (const r of race.riders) {
      r._ph = (r._ph || 0) + ((r.cadence || 0) / 60) * Math.PI * 2 * dt;
      put(r.dist, { rider: r });
    }
    for (const gr of race.ghostRiders) if (!gr.hidden) { gr._ph = (gr._ph || 0) + 8 * dt; put(gr.dist, { rider: gr, ghost: true }); }
    for (const h of race.hazards) put(h.d, { haz: h });
    for (const r of race.riders) {
      const m = r.mask || 0;
      if (r.fx?.scooter > 0 || m & 1024) { const hd = race.byId(r.scooterFor) || r; put(hd.dist + 7, { scooter: { x: r.scooterX ?? hd.x, color: r.color } }); } // vóór de kop van de rij
      const tow = r.fx?.tow > 0 || m & 512;
      if (tow || r.fx?.wheel > 0 || m & 256) { const side = (tow ? r.towSide : 0) || Math.sign(r.x || 1); put(r.dist + 0.3, { car: { x: side * 1.34, side, rider: r, tow } }); }
    }
    for (const p of race.rockets) put(p.d, { rocket: p });

    // --- sprites van ver naar dichtbij ---
    const drawSeg = (seg) => {
      const s = seg.scr;
      if (s.z1 < NEAR * 0.5 && !dyn.has(seg.i)) return;
      const clipped = s.clip < H;
      if (clipped) { c.save(); c.beginPath(); c.rect(0, 0, W, s.clip); c.clip(); }
      if (tr.m7) this._seg7(seg, t);
      const ar = seg.i === 0 && race.portal ? race.portal : seg.arch;
      if (ar && s.z1 > NEAR) this._arch(seg, ar, t);
      if (s.z1 > NEAR) {
        for (const sp of seg.sprites) {
          const def = SCENERY[sp.k]; if (!def) continue;
          const p = this._pt(seg, 0, sp.x + (Math.sign(sp.x) * def.w) / 2 / ROAD_W);
          const w = def.w * p.u, h = def.h * p.u;
          if (h < 3 || p.X + w < 0 || p.X - w > W || p.Y - h > s.clip) continue;
          c.drawImage(def.cv, p.X - w / 2, p.Y - h, w, h);
        }
        if (!(race.mode === 'workout' && race.free)) for (const o of seg.objs) { // rustige workout: geen boxen en blitzjes
          if (race.coolFor(me)[o.id] > race.time || (o.type === 'box' && race.noItems)) continue; // tijdrit: eigen boxen per ploeg, of helemaal geen
          const p = this._pt(seg, (o.d % SEG) / SEG, o.x);
          if (p.u < 2) continue;
          if (o.type === 'box') drawBox(c, p.X, p.Y, p.u, t, o.id); else if (o.type === 'bolt') drawBolt(c, p.X, p.Y, p.u, t, o.id);
        }
      }
      const list = dyn.get(seg.i);
      if (list) {
        list.sort((p, q) => q.t - p.t);
        for (const o of list) {
          if (o.haz) {
            const h = o.haz, p = this._pt(seg, o.t, h.x);
            if (h.type === 'wall') drawWall(c, p.X, p.Y, p.u, 0.5 * ROAD_W * p.u, t);
            else if (h.type === 'tacks') drawTacks(c, p.X, p.Y, p.u, 0.5 * ROAD_W * p.u, (h.id || '').length * 7919 + 13);
            else drawGlue(c, p.X, p.Y, p.u, t);
          }
          else if (o.scooter) { const p = this._pt(seg, o.t, o.scooter.x); drawScooter(c, p.X, p.Y, p.u * 1.5, o.scooter.color); }
          else if (o.car) {
            const p = this._pt(seg, o.t, o.car.x), cr = o.car.rider;
            drawCar(c, p.X, p.Y, p.u * 1.15, cr.color);
            if (o.car.tow) { // arm met bidon naar de renner (die iets dichterbij rijdt)
              const rs = tr.segAt(cr.dist), rp = rs.scr.frame === this.frame && rs.scr.z1 + (rs.scr.z2 - rs.scr.z1) * (mod(cr.dist, SEG) / SEG) > NEAR ? this._pt(rs, mod(cr.dist, SEG) / SEG, cr.x) : null;
              if (rp) drawBottleArm(c, p.X, p.Y, p.u * 1.15, rp.X, rp.Y, rp.u * 1.2, -o.car.side, t);
            }
          }
          else if (o.rocket) { const p = this._pt(seg, o.t, o.rocket.x); drawRocket(c, p.X, p.Y, p.u); }
          else {
            const r = o.rider, p = this._pt(seg, o.t, r.x);
            if (s.z1 + (s.z2 - s.z1) * o.t < NEAR) continue;
            const tm = !o.ghost && race.teams && r.team != null ? race.teams.find((x) => x.id === r.team) : null; // ploegtrui en rugnummer
            drawRider(c, p.X, p.Y, p.u * 1.2, r, t, { ghost: o.ghost, fade: !o.ghost && !!race.ttt && r !== me && !race.mate(me, r), // tijdrit: andere ploegen als spoken green: !o.ghost && r.id === race.greenId, polka: !o.ghost && r.id === race.komId && r.id !== race.greenId, cass: !o.ghost && r.id === race.cassId, tire: (th.cobble || COBBLE_LOOK).joint, label: r === me ? null : r.name,
              team: tm?.color, bib: tm ? r.bib : null, leadBib: !!tm && race.teamLead === r.team });
            if (r === me) this.meScr = p;
          }
        }
      }
      if (clipped) c.restore();
    };
    if (tr.m7) this._sprites7(race, drawSeg); else for (let n = DRAW - 1; n >= 0; n--) drawSeg(tr.segs[(base + n) % tr.n]);

    this._overlay(race, dt);
    c.restore();
  }

  // Kasseien: rijen stenen in een verband, met langs beide randen een glad gootje.
  _cobbles(seg, a, b, w1, w2, n, smooth, look) {
    const c = this.c, g1 = w1 * GUTTER / seg.wA, g2 = w2 * GUTTER / seg.wB;
    c.fillStyle = smooth; // gootjes
    for (const sd of [-1, 1]) this._quad(a.X + sd * (w1 - g1 / 2), a.Y, g1 / 2, b.X + sd * (w2 - g2 / 2), b.Y, g2 / 2);
    if (n > 24) return; // ver weg: alleen de grondkleur (de voegen); zo blijft het licht
    // Kleine, ongeveer vierkante keitjes (~32 cm) in halfsteensverband. Elke steen is een trapezium
    // langs de perspectieflijnen, zodat de voegen naar de horizon lopen; elke hoek wijkt een beetje
    // af (alleen naar binnen, dus de stenen overlappen nooit) voor de hobbelige look.
    const S = 0.32, uMid = (a.u + b.u) / 2, pxH = a.Y - b.Y;
    const rows = Math.max(1, Math.min(14, Math.round(pxH / Math.max(4, S * uMid)))); // rijen minstens 4 px hoog
    const inner = (seg.wA + seg.wB) / 2 - GUTTER;
    // stenen minstens ~6 px breed: in de verte dus minder (en grotere) stenen per rij
    const across = Math.max(4, Math.min(Math.round((inner * ROAD_W * 2) / S), Math.floor((inner * ROAD_W * 2 * b.u) / 6)));
    const shades = look.stones;
    const stones = [[], [], []];
    const halfAt = (t) => seg.wA + (seg.wB - seg.wA) * t - GUTTER; // in wegbreedtes
    for (let r = 0; r < rows; r++) {
      const t1 = r / rows, t2 = (r + 1) / rows;
      const p1 = this._pt(seg, t1, 0), p2 = this._pt(seg, t2, 0); // p1 dichtbij (onder), p2 verder (boven)
      const rowH = p1.Y - p2.Y;
      if (rowH < 3 || p2.Y > this.H) continue; // te klein, of helemaal onder in beeld (niet zichtbaar)
      const k1 = p1.u * ROAD_W, k2 = p2.u * ROAD_W, h1 = halfAt(t1), h2 = halfAt(t2);
      const sw1 = (2 * h1) / across, sw2 = (2 * h2) / across;
      const gx = Math.max(0.09, 0.7 / (sw2 * k2)); // dunne voeg als deel van een steen, minstens ~0,7 px
      const gy = Math.max(0.6, rowH * 0.08), off = ((seg.i * rows + r) % 2) * 0.5;
      const yb = p1.Y - gy * 0.5, yt = p2.Y + gy * 0.5;
      for (let k = -1; k < across; k++) {
        const f0 = (k + off) / across, f1 = (k + off + 1 - gx) / across; // positie over de weg, 0..1
        if (f1 <= 0 || f0 >= 1) continue;
        const a0 = Math.max(0, f0), a1 = Math.min(1, f1);
        let hsh = (seg.i * 73856093) ^ (r * 19349663) ^ ((k + 7) * 83492791);
        hsh = (hsh ^ (hsh >>> 13)) * 1274126177;
        const j = (bit) => ((hsh >>> bit) & 7) / 7; // 0..1
        const jx = 0.1, jy = rowH * 0.12; // tot 10% van een steenbreedte en 12% van de rijhoogte
        // hoeken: linksonder, rechtsonder, rechtsboven, linksboven
        const L1 = a0 + (f0 >= 0 ? j(0) * jx / across : 0), R1 = a1 - (f1 <= 1 ? j(3) * jx / across : 0);
        const L2 = a0 + (f0 >= 0 ? j(6) * jx / across : 0), R2 = a1 - (f1 <= 1 ? j(9) * jx / across : 0);
        stones[(seg.i * 7 + r * 13 + k * 5 + 99) % 3].push(
          p1.X + k1 * (L1 * 2 - 1) * h1, yb - j(12) * jy,
          p1.X + k1 * (R1 * 2 - 1) * h1, yb - j(15) * jy,
          p2.X + k2 * (R2 * 2 - 1) * h2, yt + j(18) * jy,
          p2.X + k2 * (L2 * 2 - 1) * h2, yt + j(21) * jy);
      }
    }
    for (let sh = 0; sh < 3; sh++) {
      const q = stones[sh];
      if (!q.length) continue;
      c.fillStyle = shades[sh];
      c.beginPath();
      for (let i = 0; i < q.length; i += 8) {
        c.moveTo(q[i], q[i + 1]); c.lineTo(q[i + 2], q[i + 3]); c.lineTo(q[i + 4], q[i + 5]); c.lineTo(q[i + 6], q[i + 7]); c.closePath();
      }
      c.fill();
    }
  }

  _quad(x1, y1, w1, x2, y2, w2) {
    const c = this.c;
    c.beginPath(); c.moveTo(x1 - w1, y1); c.lineTo(x2 - w2, y2 - 0.6); c.lineTo(x2 + w2, y2 - 0.6); c.lineTo(x1 + w1, y1); c.fill();
  }

  _arch(seg, a, t) {
    const c = this.c;
    const l = this._pt(seg, 0, -1.22), r = this._pt(seg, 0, 1.22), u = l.u;
    if (u < 1.5) return;
    const top = 7 * u, beam = 1.5 * u;
    if (a.portal) { // teleportboog: een gloeiend, golvend veld tussen de palen
      const x0 = l.X + 0.25 * u, wv = r.X - l.X - 0.5 * u, bands = 7;
      for (let i = 0; i < bands; i++) {
        const k = (i + (t * 1.5) % 1) / bands;
        c.fillStyle = `hsla(${185 + 60 * Math.sin(t * 2 + i)}, 100%, 65%, ${0.16 + 0.12 * Math.sin(t * 5 + i * 1.7)})`;
        c.fillRect(x0, l.Y - (top - beam) * (1 - k), wv, ((top - beam) / bands) * 0.8);
      }
      c.fillStyle = 'rgba(125,249,255,.18)'; c.fillRect(x0, l.Y - top + beam, wv, top - beam);
    }
    c.fillStyle = '#23233a';
    c.fillRect(l.X - 0.25 * u, l.Y - top, 0.5 * u, top); c.fillRect(r.X - 0.25 * u, r.Y - top, 0.5 * u, top);
    c.fillStyle = '#15152a'; c.fillRect(l.X - 0.25 * u, l.Y - top, r.X - l.X + 0.5 * u, beam);
    c.strokeStyle = a.color; c.lineWidth = Math.max(1, 0.12 * u); c.strokeRect(l.X - 0.25 * u, l.Y - top, r.X - l.X + 0.5 * u, beam);
    if (u > 4) {
      c.fillStyle = a.color; c.font = `900 ${beam * 0.62}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(a.text, (l.X + r.X) / 2, l.Y - top + beam * 0.54, r.X - l.X);
      c.textBaseline = 'alphabetic';
    }
  }

  _overlay(race, dt) {
    const { c, W, H } = this, me = race.me, m = me.mask, t = race.clock;
    if (m & 1 || me.v > 17) { // snelheidsstrepen
      c.strokeStyle = m & 1 ? 'rgba(255,240,180,.55)' : 'rgba(255,255,255,.22)'; c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < (m & 1 ? 26 : 10); i++) {
        const a = Math.random() * 6.28, r1 = H * (0.45 + Math.random() * 0.3), r2 = r1 + H * (0.1 + Math.random() * 0.25);
        c.moveTo(W / 2 + Math.cos(a) * r1 * 1.4, H * 0.5 + Math.sin(a) * r1); c.lineTo(W / 2 + Math.cos(a) * r2 * 1.4, H * 0.5 + Math.sin(a) * r2);
      }
      c.stroke();
    }
    if (m & 64 && this.meScr) { // slipstream
      c.strokeStyle = 'rgba(125,249,255,.5)'; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < 6; i++) { const x = this.meScr.X + (Math.random() - 0.5) * W * 0.16, y = this.meScr.Y - Math.random() * H * 0.3; c.moveTo(x, y); c.lineTo(x, y + H * 0.06); }
      c.stroke();
    }
    if (m & 8 || race.stormFlash > 0) { // storm
      c.fillStyle = `rgba(20,25,50,${m & 8 ? 0.35 : 0.2})`; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(180,210,255,.5)'; c.lineWidth = 1.5; c.beginPath();
      for (let i = 0; i < 40; i++) { const x = Math.random() * W, y = Math.random() * H; c.moveTo(x, y); c.lineTo(x - 14, y + 34); }
      c.stroke();
      if (race.stormFlash > 0) { race.stormFlash -= dt * 1.5; if (race.stormFlash > 0.8) { c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(0, 0, W, H); } }
    }
    if (m & 2) { c.fillStyle = 'rgba(150,60,255,.18)'; c.fillRect(0, 0, W, H); }
    if (this.flash) {
      c.globalAlpha = clamp(this.flash.a, 0, 1) * 0.5; c.fillStyle = this.flash.color; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
      this.flash.a -= dt * 2.5; if (this.flash.a <= 0) this.flash = null;
    }
    if (this.confetti.length) {
      for (const p of this.confetti) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.5 * dt; p.r += p.vr * dt;
        c.save(); c.translate(p.x * W, p.y * H); c.rotate(p.r); c.fillStyle = p.col; c.fillRect(-5, -3, 10, 6); c.restore();
      }
      this.confetti = this.confetti.filter((p) => p.y < 1.1);
    }
  }

  party() {
    const cols = ['#ff3fa4', '#39ffb0', '#7df9ff', '#ffd166', '#b28dff'];
    for (let i = 0; i < 160; i++) this.confetti.push({ x: Math.random(), y: -Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.2, vy: 0.1 + Math.random() * 0.3, r: Math.random() * 6, vr: (Math.random() - 0.5) * 10, col: cols[i % 5] });
  }
}

Object.assign(Renderer.prototype, M7);
