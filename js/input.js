// Invoer: toetsenbord, touch en (demo) gesimuleerd vermogen.
import { clamp } from './util.js';

const keys = new Set();
const pressed = new Set(); // eenmalige acties sinds de vorige frame
const touch = { left: false, right: false, pedal: false };
const pads = new Map(); // externe knoppen (Zwift): bron -> { left, right }
let kbSteer = 0;
let demoPower = 0;

const ACTIONS = {
  Space: 'item', Enter: 'item', Digit1: 'item', KeyX: 'item',
  KeyB: 'bell', Digit2: 'bell',
  KeyC: 'center', KeyM: 'music', Escape: 'pause', KeyP: 'pause', KeyF: 'fullscreen',
};

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (!e.repeat && ACTIONS[e.code]) pressed.add(ACTIONS[e.code]);
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

export function bindTouch(el, name) {
  const on = (e) => { e.preventDefault(); touch[name] = true; };
  const off = (e) => { e.preventDefault(); touch[name] = false; };
  el.addEventListener('pointerdown', on);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, off);
}

export const input = {
  trigger(action) { pressed.add(action); },
  take(action) { return pressed.delete(action); },
  setPad(src, left, right) { if (left || right) pads.set(src, { left, right }); else pads.delete(src); },
  clear() { pressed.clear(); },
  // Stuuruitslag -1..1 uit toetsen/touch (loopt soepel op).
  steer(dt) {
    const l = keys.has('ArrowLeft') || keys.has('KeyA') || touch.left;
    const r = keys.has('ArrowRight') || keys.has('KeyD') || touch.right;
    let target = (r ? 1 : 0) - (l ? 1 : 0);
    for (const p of pads.values()) target += p.right - p.left;
    target = clamp(target, -1, 1);
    kbSteer += clamp(target - kbSteer, -dt * 6, dt * 6);
    return kbSteer;
  },
  // Demo-vermogen: pijl-omhoog/W = trappen, Shift = sprinten.
  demoPower(dt, ftp) {
    const go = keys.has('ArrowUp') || keys.has('KeyW') || touch.pedal;
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const target = go ? ftp * (sprint ? 2.6 : 1.0) : 0;
    demoPower += (target - demoPower) * Math.min(1, dt * 3);
    return demoPower;
  },
  demoPedalling() { return demoPower > 20; },
};
