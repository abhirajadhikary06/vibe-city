import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Vehicle, crashDamage } from './car.js';
import { WATER_Y, BOUNDS } from './world.js';
import { MAP, inPoly, nearestOnRing, polygon, Poly } from './geo.js';
import { merge, paint, clamp, damp, wrapAngle } from './utils.js';

/*
 * Boats on the Hooghly: ferry launches on the real routes between the ghats,
 * wooden country boats, a speedboat and a jet ski. They reuse Vehicle's damage
 * model (smoke, fire, explosion) but float, plane and slide on the river, and
 * can't cross the banks, the jetties or Howrah Bridge's piers.
 */

export { WATER_Y };
const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };

const base = (o) => {
  const d = { hw: o.B / 2, hl: o.L / 2, rad: o.B / 2, headZ: o.L / 2, headY: o.free, seatX: 0, camDist: 0, camH: 0, engine: 1, nitro: false, wr: 0.36, tw: 0, axles: [0, 0], ...o };
  // Collision circles along the hull
  const n = Math.max(1, Math.ceil(o.L / o.B));
  d.offs = [];
  for (let i = 0; i < n; i++) d.offs.push(n === 1 ? 0 : -d.hl + d.hw + ((o.L - o.B) * i) / (n - 1));
  return d;
};
export const BOATS = {
  jetski: base({ label: 'Jet Ski', L: 3.2, B: 1.15, keel: 0.32, free: 0.45, bow: 0.25, h: 1.0, top: 30, accel: 15, turn: 2.3, grip: 2.2, drag: 0.012, mass: 0.5, seatZ: -0.3, seatY: -0.15, lean: true, camDist: -1.4, camH: -0.4, lift: 0.07, hp: 60, engine: 1.5 }),
  speedboat: base({ label: 'Speedboat', L: 7, B: 2.5, keel: 0.55, free: 0.85, bow: 0.35, h: 1.8, top: 32, accel: 9.5, turn: 1.35, grip: 2.6, drag: 0.009, mass: 1.6, seatX: 0.45, seatZ: -0.3, seatY: 0.4, camDist: 2.5, camH: 0.8, lift: 0.09, hp: 120, engine: 1.0 }),
  yacht: base({ label: 'Yacht', L: 16, B: 4.8, keel: 1.2, free: 1.6, bow: 0.8, h: 6, top: 16, accel: 3.2, turn: 0.55, grip: 3.5, drag: 0.02, mass: 8, seatX: 0.6, seatZ: 2.4, seatY: 1.8, camDist: 11, camH: 3.5, lift: 0.035, hp: 420, engine: 0.55 }),
  launch: base({ label: 'Ganga Ferry Launch', L: 24, B: 6, keel: 1.3, free: 1.3, bow: 0.6, h: 7, top: 9, accel: 1.6, turn: 0.42, grip: 4, drag: 0.035, mass: 18, seatZ: 8.6, seatY: 3.8, camDist: 22, camH: 7, lift: 0.01, hp: 700, engine: 0.4 }),
  nouka: base({ label: 'Country Boat (Nouka)', L: 9, B: 2.2, keel: 0.5, free: 0.6, bow: 0.9, h: 2.2, top: 6.5, accel: 2.2, turn: 0.75, grip: 3, drag: 0.05, mass: 1.2, seatZ: -3.4, seatY: 0.45, camDist: 4, camH: 1, lift: 0.02, hp: 150, engine: 0.3 }),
  ferry: base({ label: 'Harbor Ferry', L: 34, B: 9, keel: 2.0, free: 2.4, bow: 1.2, h: 10, top: 11, accel: 1.5, turn: 0.32, grip: 4, drag: 0.04, mass: 30, seatZ: 9.6, seatY: 7.6, camDist: 30, camH: 10, lift: 0.01, hp: 900, engine: 0.35 }),
  trawler: base({ label: 'Fishing Trawler', L: 21, B: 5.6, keel: 1.4, free: 1.5, bow: 1.1, h: 6.8, top: 11, accel: 2.0, turn: 0.48, grip: 3.8, drag: 0.03, mass: 14, seatX: 0, seatZ: 3.5, seatY: 3.0, camDist: 18, camH: 6, lift: 0.012, hp: 650, engine: 0.5 }),
  ship: base({ label: 'River Cargo Ship', L: 58, B: 11.5, keel: 2.6, free: 2.2, bow: 1.4, h: 12.5, top: 8.5, accel: 1.0, turn: 0.22, grip: 4.5, drag: 0.04, mass: 65, seatX: 0, seatZ: -18, seatY: 8.5, camDist: 48, camH: 15, lift: 0.005, hp: 1800, engine: 0.3 }),
};

/* ---------- Hull: lofted sections from the transom to a pointed bow ---------- */
function hull(L, B, keel, free, bowRise, cols) {
  const NS = 26;
  const ring = [];
  for (let s = 0; s <= NS; s++) {
    const t = s / NS;
    const z = -L / 2 + t * L;
    const hb = (B / 2) * (t < 0.55 ? 1 : Math.pow(Math.max(0, Math.cos(((t - 0.55) / 0.45) * (Math.PI / 2))), 0.7));
    const k = keel * (t < 0.6 ? 1 : 1 - 0.75 * ((t - 0.6) / 0.4));
    const sh = free + bowRise * t * t;
    const side = [[hb * 0.98, sh], [hb, sh * 0.45], [hb * 0.92, -k * 0.12], [hb * 0.55, -k * 0.62]];
    const pts = [...side.map(([x, y]) => [-x, y]), [0, -k], ...[...side].reverse()];
    ring.push(pts.map(([x, y]) => [x, y, z]));
  }
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const colorAt = (y, sh) => (y < 0.05 ? cols.bottom : y > sh - 0.28 && y < sh - 0.1 ? cols.stripe : cols.hull);
  const tri = (a, b, d, sh) => {
    for (const p of [a, b, d]) {
      pos.push(...p);
      c.set(colorAt(p[1], sh));
      col.push(c.r, c.g, c.b);
    }
  };
  const deckTri = (a, b, d) => {
    for (const p of [a, b, d]) {
      pos.push(...p);
      c.set(cols.deck);
      col.push(c.r, c.g, c.b);
    }
  };
  for (let s = 0; s < NS; s++) {
    const A = ring[s];
    const Bq = ring[s + 1];
    const sh = free + bowRise * (s / NS) ** 2;
    for (let j = 0; j < A.length - 1; j++) {
      tri(A[j], Bq[j], Bq[j + 1], sh);
      tri(A[j], Bq[j + 1], A[j + 1], sh);
    }
    // deck between the gunwales
    deckTri(A[0], A[A.length - 1], Bq[A.length - 1]);
    deckTri(A[0], Bq[A.length - 1], Bq[0]);
  }
  // transom
  const T = ring[0];
  const mid = [0, (free - keel) / 2, -L / 2];
  for (let j = 0; j < T.length - 1; j++) tri(mid, T[j + 1], T[j], free);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const box = (w, h, d, x, y, z, hex) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const rbox = (w, h, d, x, y, z, hex, r = 0.1) => {
  const g = new RoundedBoxGeometry(w, h, d, 3, r).translate(x, y, z);
  g.deleteAttribute('uv');
  return paint(g, hex);
};
const cyl = (rt, rb, h, x, y, z, hex, seg = 12) => paint(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), hex);
const torus = (r, tube, x, y, z, hex, rx = 0, ry = 0, rz = 0, radSeg = 10, tubeSeg = 6) => {
  const g = new THREE.TorusGeometry(r, tube, radSeg, tubeSeg);
  if (rx || ry || rz) g.rotateX(rx).rotateY(ry).rotateZ(rz);
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  return paint(g, hex);
};
const GLASS = '#0d1820';
const WHITE = '#f4f4f0';

/** Rails along both gunwales between z0 and z1. */
function railing(parts, hw, y, z0, z1, col = '#d8dade') {
  for (const s of [1, -1]) {
    parts.push(box(0.04, 0.04, z1 - z0, s * hw, y + 0.9, (z0 + z1) / 2, col));
    parts.push(box(0.03, 0.03, z1 - z0, s * hw, y + 0.45, (z0 + z1) / 2, col));
    for (let z = z0; z <= z1; z += 1.2) parts.push(box(0.035, 0.9, 0.035, s * hw, y + 0.45, z, col));
  }
}

/** Lifebuoy ring in marine orange with reflective white quadrant bands. */
function lifebuoy(parts, x, y, z, rx = 0, ry = 0, rz = 0, r = 0.36, tube = 0.08) {
  parts.push(torus(r, tube, x, y, z, '#ff5722', rx, ry, rz));
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
    const band = new THREE.TorusGeometry(r * 1.01, tube * 1.05, 4, 4, Math.PI * 0.18).rotateZ(a);
    if (rx || ry || rz) band.rotateX(rx).rotateY(ry).rotateZ(rz);
    band.translate(x, y, z);
    band.deleteAttribute('uv');
    parts.push(paint(band, '#ffffff'));
  }
}

/** Black rubber tire fender hung on the gunwale with a hanging rope. */
function tireFender(parts, x, y, z, rx = 0, ry = 0, rz = 0, r = 0.32) {
  parts.push(torus(r, 0.09, x, y, z, '#18191b', rx, ry, rz));
  parts.push(box(0.03, 0.4, 0.03, x, y + r + 0.18, z, '#8d785a'));
}

/** Marine searchlight with swivel mount, housing, and glowing lens. */
function searchlight(parts, x, y, z, ry = 0) {
  parts.push(cyl(0.06, 0.08, 0.18, x, y + 0.09, z, '#78909c', 8));
  const lamp = new THREE.CylinderGeometry(0.18, 0.18, 0.28, 10).rotateX(Math.PI / 2);
  if (ry) lamp.rotateY(ry);
  lamp.translate(x, y + 0.24, z);
  lamp.deleteAttribute('uv');
  parts.push(paint(lamp, '#eceff1'));
  const lens = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10).rotateX(Math.PI / 2);
  if (ry) lens.rotateY(ry);
  lens.translate(x, y + 0.24, z + 0.14);
  lens.deleteAttribute('uv');
  parts.push(paint(lens, '#ffffd0'));
}

/** Rotating open-array marine radar scanner bar on pedestal. */
function radarScanner(parts, x, y, z, angle = 0.35) {
  parts.push(cyl(0.08, 0.1, 0.35, x, y + 0.18, z, '#cfd8dc', 8));
  const bar = new THREE.BoxGeometry(1.3, 0.1, 0.16).rotateY(angle);
  bar.translate(x, y + 0.4, z);
  bar.deleteAttribute('uv');
  parts.push(paint(bar, '#ffffff'));
  const stripe = new THREE.BoxGeometry(1.32, 0.03, 0.17).rotateY(angle);
  stripe.translate(x, y + 0.4, z);
  stripe.deleteAttribute('uv');
  parts.push(paint(stripe, '#1e293b'));
}

/** Brass marine trumpet horn. */
function marineHorn(parts, x, y, z) {
  const horn = new THREE.CylinderGeometry(0.12, 0.04, 0.4, 8).rotateX(Math.PI / 2);
  horn.translate(x, y, z + 0.15);
  horn.deleteAttribute('uv');
  parts.push(paint(horn, '#d4af37'));
  parts.push(box(0.04, 0.15, 0.04, x, y - 0.08, z, '#d4af37'));
}

const MODELS = {
  /** Kolkata's river launch: an open lower deck under a roof, a smaller upper deck and wheelhouse. */
  launch(color) {
    const d = BOATS.launch;
    const f = d.free;
    const parts = [hull(d.L, d.B, d.keel, f, d.bow, { hull: WHITE, bottom: '#6e1a1e', stripe: color, deck: '#7d6a55' })];
    // Rubbing strakes / bumper guards along sides
    for (const s of [1, -1]) {
      parts.push(box(0.1, 0.12, 21, s * 2.85, f + 0.55, -1, '#37474f'));
      for (let z = -10; z <= 8; z += 2.25) parts.push(box(0.12, 2.3, 0.12, s * 2.75, f + 1.15, z, '#e8e8e4'));
      parts.push(box(0.06, 0.9, 18.5, s * 2.78, f + 0.45, -1, color));
      for (const z of [-6, -1, 4]) tireFender(parts, s * 2.92, f + 0.42, z, 0, Math.PI / 2, 0);
    }
    // Lower roof = upper deck with colorful valance trim
    parts.push(box(5.9, 0.2, 19.5, 0, f + 2.4, -1, '#f2f2ee'));
    parts.push(box(6.0, 0.12, 19.6, 0, f + 2.3, -1, color));
    // Slatted passenger benches with backrests
    for (let z = -9; z <= 6; z += 2.2) {
      parts.push(box(4.6, 0.45, 0.55, 0, f + 0.45, z, '#5a4636'));
      parts.push(box(4.6, 0.35, 0.06, 0, f + 0.8, z + 0.25, '#4a3626'));
    }
    // Lifejacket locker box on lower deck
    parts.push(rbox(1.4, 0.7, 0.9, 0, f + 0.45, 7.5, '#c49a45', 0.08));
    // Mooring bollards & anchor winch on foredeck
    parts.push(cyl(0.24, 0.24, 0.45, 0, f + 0.35, 9.6, '#37474f', 8));
    for (const s of [1, -1]) {
      parts.push(cyl(0.08, 0.08, 0.25, s * 1.5, f + 0.25, 9.8, '#263238', 6));
      parts.push(cyl(0.08, 0.08, 0.25, s * 2.4, f + 0.25, -11.2, '#263238', 6));
    }
    // Upper deck columns, roof, and wheelhouse
    for (const s of [1, -1]) for (let z = -8; z <= 2; z += 2.5) parts.push(box(0.1, 1.9, 0.1, s * 2.5, f + 3.4, z, '#e8e8e4'));
    parts.push(box(5.2, 0.16, 12, 0, f + 4.4, -3, color)); // upper roof
    parts.push(rbox(3.2, 1.9, 2.8, 0, f + 3.4, 4.6, WHITE, 0.15)); // wheelhouse
    parts.push(box(3.3, 0.08, 0.4, 0, f + 4.15, 5.9, color)); // windshield sun visor
    parts.push(rbox(3.25, 0.7, 2.85, 0, f + 3.7, 4.6, GLASS, 0.1));
    for (const s of [1, -1]) parts.push(box(0.04, 1.5, 0.7, s * 1.62, f + 3.2, 4.4, '#5d4037')); // doors
    railing(parts, 2.75, f + 2.5, -10.5, 8.5);
    // Lifebuoys mounted on railings and cabin sides
    for (const s of [1, -1]) {
      lifebuoy(parts, s * 2.8, f + 2.9, -4, 0, Math.PI / 2, 0);
      lifebuoy(parts, s * 1.64, f + 3.7, 3.8, 0, Math.PI / 2, 0);
    }
    // Roof searchlight, horns, radar mast and Indian river flag
    searchlight(parts, 0, f + 4.4, 5.6);
    marineHorn(parts, -0.7, f + 4.5, 5.2);
    marineHorn(parts, 0.7, f + 4.5, 5.2);
    parts.push(cyl(0.07, 0.09, 2.0, 0, f + 5.3, 4.0, '#cfd8dc', 8));
    parts.push(box(1.5, 0.05, 0.05, 0, f + 5.7, 4.0, '#cfd8dc'));
    radarScanner(parts, 0, f + 6.3, 4.0);
    // River pennant
    parts.push(box(0.02, 0.15, 0.45, 0, f + 6.25, 3.7, '#ff9933'));
    parts.push(box(0.02, 0.15, 0.45, 0, f + 6.1, 3.7, '#ffffff'));
    parts.push(box(0.02, 0.15, 0.45, 0, f + 5.95, 3.7, '#138808'));
    // Heavy exhaust stack with red top rim
    parts.push(cyl(0.32, 0.32, 2.2, 0, f + 5.4, -9, '#263238', 10));
    parts.push(cyl(0.36, 0.33, 0.3, 0, f + 6.4, -9, '#d32f2f', 10));
    return { parts, nav: [[1.7, f + 4.6, 5.8]], name: true };
  },
  /** Wooden country boat with upswept ends, bamboo chhoi, clay chula, and lantern. */
  nouka(color) {
    const d = BOATS.nouka;
    const f = d.free;
    const parts = [hull(d.L, d.B, d.keel, f, d.bow, { hull: '#5d3c1e', bottom: '#1f1610', stripe: color, deck: '#7c5a36' })];
    // Raised stern seating platform & stem posts
    parts.push(box(1.4, 0.35, 1.2, 0, f + 0.6, -d.L / 2 + 0.7, '#4e3423'));
    parts.push(box(0.12, 0.9, 0.2, 0, f + 0.8, d.L / 2 - 0.2, '#3e271a'));
    // Bamboo Chhoi (canopy of woven bamboo) with curved bamboo rib arches
    const canopy = new THREE.CylinderGeometry(1.02, 1.02, 3.2, 14, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
    canopy.rotateY(Math.PI / 2).translate(0, f + 0.15, -0.2);
    canopy.deleteAttribute('uv');
    parts.push(paint(canopy, '#c29b4e'));
    for (const z of [-1.6, -0.2, 1.2]) parts.push(torus(1.04, 0.035, 0, f + 0.15, z, '#5c401e', Math.PI / 2, 0, 0));
    parts.push(box(0.06, 0.06, 3.4, 0, f + 1.2, -0.2, '#4e3423')); // canopy ridge pole
    for (const s of [1, -1]) parts.push(box(0.05, 0.05, 3.2, s * 1.02, f + 0.2, -0.2, '#4e3423'));
    // Clay Chula (earthen stove) & tea kettle on foredeck
    parts.push(cyl(0.2, 0.24, 0.26, -0.38, f + 0.2, 1.8, '#a0522d', 8));
    parts.push(cyl(0.11, 0.13, 0.16, -0.38, f + 0.4, 1.8, '#d4af37', 8));
    parts.push(box(0.03, 0.07, 0.1, -0.38, f + 0.42, 1.9, '#d4af37'));
    // Coiled coir mooring rope on bow
    parts.push(torus(0.26, 0.065, 0.32, f + 0.1, 2.2, '#9e8156', Math.PI / 2, 0, 0));
    parts.push(torus(0.14, 0.055, 0.32, f + 0.12, 2.2, '#8a6e45', Math.PI / 2, 0, 0));
    // Kerosene lantern hanging at prow
    parts.push(box(0.04, 0.65, 0.04, 0, f + 1.2, 3.2, '#3e271a'));
    parts.push(cyl(0.07, 0.08, 0.05, 0, f + 1.1, 3.05, '#c99e32', 8));
    parts.push(cyl(0.06, 0.06, 0.13, 0, f + 1.2, 3.05, '#ffe082', 8));
    parts.push(cyl(0.05, 0.03, 0.06, 0, f + 1.3, 3.05, '#c99e32', 8));
    // Bamboo poling pole (logi) resting along gunwale
    parts.push(box(0.05, 0.05, 5.0, 0.88, f + 0.25, 0.4, '#d7b36a'));
    // Mast & steering oar
    parts.push(box(0.07, 2.5, 0.07, 0, f + 1.25, 2.5, '#4a3626'));
    parts.push(box(0.08, 0.08, 3.6, 0.55, f + 0.75, -d.L / 2 - 1.0, '#4a3626'));
    parts.push(box(0.02, 0.32, 0.9, 0.55, f + 0.4, -d.L / 2 - 2.2, '#3e271a'));
    return { parts, nav: [[0.5, f + 0.3, 3.5]] };
  },
  jetski(color) {
    const d = BOATS.jetski;
    const parts = [hull(d.L, d.B, d.keel, d.free, d.bow, { hull: color, bottom: '#1b1d22', stripe: WHITE, deck: '#2a2c30' })];
    parts.push(rbox(0.42, 0.24, 1.25, 0, d.free + 0.16, -0.25, '#1c1c1e', 0.08)); // seat
    parts.push(rbox(0.7, 0.35, 0.85, 0, d.free + 0.15, 0.7, color, 0.15)); // nose cowl
    parts.push(box(0.78, 0.05, 0.06, 0, d.free + 0.55, 0.35, '#202022')); // bars
    parts.push(box(0.06, 0.25, 0.06, 0, d.free + 0.42, 0.42, '#202022'));
    parts.push(box(0.2, 0.08, 0.04, 0, d.free + 0.56, 0.4, '#00e5ff')); // digital gauge
    // Footwell traction pads
    for (const s of [1, -1]) parts.push(box(0.18, 0.02, 1.4, s * 0.36, d.free + 0.06, -0.2, '#111214'));
    // Jet pump nozzle at stern
    const jet = new THREE.CylinderGeometry(0.12, 0.14, 0.35, 8).rotateX(Math.PI / 2);
    jet.translate(0, d.free - 0.05, -d.L / 2 - 0.15);
    jet.deleteAttribute('uv');
    parts.push(paint(jet, '#1a1a1c'));
    return { parts, nav: [[0.3, d.free + 0.35, 1.0]] };
  },
  speedboat(color) {
    const d = BOATS.speedboat;
    const f = d.free;
    const parts = [hull(d.L, d.B, d.keel, f, d.bow, { hull: WHITE, bottom: '#7a1c22', stripe: color, deck: '#d7c4a0' })];
    // Console with steering wheel and throttle
    parts.push(rbox(1.0, 0.7, 0.7, 0.45, f + 0.35, 0.6, WHITE, 0.12));
    parts.push(torus(0.14, 0.025, 0.45, f + 0.72, 0.45, '#212121', -0.5, 0, 0));
    parts.push(box(0.04, 0.12, 0.04, 0.82, f + 0.72, 0.6, '#cfd8dc'));
    parts.push(paint(new THREE.BoxGeometry(2.1, 0.5, 0.04).rotateX(-0.6).translate(0, f + 0.85, 1.05), GLASS)); // windscreen
    // Front cushioned seats
    for (const x of [0.45, -0.45]) {
      parts.push(rbox(0.6, 0.45, 0.6, x, f + 0.22, -0.3, '#efe7d6', 0.1));
      parts.push(box(0.62, 0.1, 0.62, x, f + 0.3, -0.3, color)); // seat piping
    }
    parts.push(rbox(2.0, 0.4, 0.9, 0, f + 0.2, -2.3, '#efe7d6', 0.12)); // rear bench
    // Twin outboards at stern
    for (const x of [0.45, -0.45]) {
      parts.push(rbox(0.42, 0.85, 0.55, x, f + 0.22, -3.6, '#1b1c1f', 0.08));
      parts.push(box(0.43, 0.12, 0.56, x, f + 0.48, -3.6, color));
      parts.push(box(0.12, 0.7, 0.25, x, f - 0.35, -3.75, '#2a2b2e'));
      parts.push(cyl(0.07, 0.07, 0.1, x, f - 0.6, -3.85, '#cfd8dc', 6));
    }
    // Stainless wakeboard/radar tower arch
    for (const s of [1, -1]) parts.push(box(0.05, 1.5, 0.05, s * 1.1, f + 0.9, -1.0, '#cfd8dc'));
    parts.push(box(2.25, 0.06, 0.06, 0, f + 1.65, -1.0, '#cfd8dc'));
    searchlight(parts, 0, f + 1.68, -1.0);
    marineHorn(parts, -0.35, f + 1.7, -1.0);
    lifebuoy(parts, -1.18, f + 0.5, 0, 0, Math.PI / 2, 0, 0.26, 0.06);
    railing(parts, d.B / 2 - 0.05, f, 0.8, 2.6);
    return { parts, nav: [[0.6, f + 0.4, 2.8]] };
  },
  yacht(color) {
    const d = BOATS.yacht;
    const f = d.free;
    const parts = [hull(d.L, d.B, d.keel, f, d.bow, { hull: WHITE, bottom: '#1d2b4a', stripe: color, deck: '#c9a774' })];
    parts.push(rbox(3.9, 2.0, 8.5, 0, f + 1.0, 0.0, WHITE, 0.3)); // main cabin
    parts.push(rbox(3.95, 0.7, 8.0, 0, f + 1.25, 0.0, GLASS, 0.2)); // window band
    parts.push(rbox(3.2, 1.4, 4.5, 0, f + 2.7, -0.5, WHITE, 0.3)); // flybridge deck
    parts.push(rbox(3.25, 0.5, 4.0, 0, f + 2.8, -0.5, GLASS, 0.15));
    parts.push(paint(new THREE.BoxGeometry(3.6, 0.9, 0.06).rotateX(-0.5).translate(0, f + 1.6, 4.4), GLASS)); // windscreen
    // Sunbed on foredeck
    parts.push(rbox(2.2, 0.15, 2.4, 0, f + 1.0, 5.0, '#e8eaf6', 0.08));
    // Bow anchor winch & roller
    parts.push(box(0.5, 0.3, 0.5, 0, f + 1.0, 7.2, '#cfd8dc'));
    // Teak swim platform at stern with ladder
    parts.push(box(4.2, 0.12, 1.2, 0, f + 0.1, -8.3, '#c9a774'));
    parts.push(box(0.4, 0.6, 0.04, 1.4, f - 0.15, -8.9, '#cfd8dc'));
    // Radar mast, scanner bar, satellite radome, searchlight
    parts.push(cyl(0.08, 0.08, 2.4, 0, f + 4.4, -1.2, '#d8dade', 8), box(1.2, 0.08, 0.3, 0, f + 5.1, -1.2, '#d8dade'));
    radarScanner(parts, 0, f + 5.6, -1.2);
    parts.push(cyl(0.24, 0.26, 0.35, 0.8, f + 4.5, -1.2, '#ffffff', 10)); // satellite dome
    searchlight(parts, 0, f + 3.8, 1.8);
    marineHorn(parts, -0.6, f + 3.8, 1.6);
    // Lifebuoys on flybridge
    for (const s of [1, -1]) lifebuoy(parts, s * 1.68, f + 3.2, -1.2, 0, Math.PI / 2, 0, 0.28, 0.07);
    railing(parts, d.B / 2 - 0.1, f, 4.5, 7.0);
    railing(parts, 1.5, f + 3.4, -2.6, 1.5);
    return { parts, nav: [[1.9, f + 0.6, 4.6]] };
  },
  ferry(color) {
    const d = BOATS.ferry;
    const f = d.free;
    const parts = [hull(d.L, d.B, d.keel, f, d.bow, { hull: color, bottom: '#6e1a1e', stripe: WHITE, deck: '#9ba0a6' })];
    parts.push(rbox(8.2, 2.6, 24, 0, f + 1.3, -2, WHITE, 0.2)); // lower deck house
    parts.push(rbox(8.25, 1.0, 23.4, 0, f + 1.5, -2, GLASS, 0.1));
    parts.push(rbox(7.4, 2.4, 16, 0, f + 3.8, -3, WHITE, 0.2)); // upper deck house
    parts.push(rbox(7.45, 0.9, 15.4, 0, f + 4.0, -3, GLASS, 0.1));
    // Bridge with extended bridge wings
    parts.push(rbox(8.4, 1.8, 3.4, 0, f + 5.9, 9.6, WHITE, 0.2));
    parts.push(rbox(8.45, 0.8, 3.45, 0, f + 6.1, 9.6, GLASS, 0.1));
    for (const s of [1, -1]) searchlight(parts, s * 4.1, f + 6.9, 9.6);
    radarScanner(parts, 0, f + 7.4, 9.6);
    marineHorn(parts, -1.2, f + 6.9, 9.6);
    parts.push(cyl(1.0, 1.2, 3.6, 0, f + 6.8, -8, '#e8e8e8', 16), cyl(1.02, 1.02, 0.8, 0, f + 8.0, -8, color, 16), cyl(1.04, 1.04, 0.4, 0, f + 8.7, -8, '#181818', 16)); // funnel
    for (const s of [1, -1]) {
      for (const z of [-9, -2, 5]) parts.push(rbox(1.2, 0.9, 4.2, s * 3.9, f + 5.4, z, '#ff7a1a', 0.35)); // lifeboats
      for (const z of [-6, 1]) lifebuoy(parts, s * 3.75, f + 5.2, z, 0, Math.PI / 2, 0);
    }
    railing(parts, d.B / 2 - 0.15, f, 11, 15.5);
    railing(parts, 3.6, f + 5.0, -11, 5);
    return { parts, nav: [[4.4, f + 6.2, 11]], name: true };
  },
  /** Bay of Bengal River Fishing Trawler: swept bow, aft A-frame trawl gantry, net drum, outriggers, fish crates. */
  trawler(color = '#2d5a44') {
    const d = BOATS.trawler;
    const f = d.free;
    const parts = [hull(d.L, d.B, d.keel, f, d.bow, { hull: color, bottom: '#7a1c1d', stripe: '#f4f4f0', deck: '#4e5349' })];
    // Heavy timber/rubber rub rails
    for (const s of [1, -1]) {
      parts.push(box(0.12, 0.14, 18, s * (d.B / 2 + 0.05), f + 0.6, -1, '#263238'));
      for (const z of [-5, 0, 4]) tireFender(parts, s * (d.B / 2 + 0.12), f + 0.5, z, 0, Math.PI / 2, 0);
    }
    // Forward-set wheelhouse
    parts.push(rbox(3.8, 2.2, 3.6, 0, f + 1.2, 3.8, '#f5f5f0', 0.2));
    parts.push(rbox(3.85, 0.8, 3.65, 0, f + 1.55, 3.8, GLASS, 0.1));
    parts.push(box(3.9, 0.12, 0.5, 0, f + 2.0, 5.7, '#263238')); // brow visor
    parts.push(box(4.0, 0.15, 3.8, 0, f + 2.35, 3.8, '#263238')); // roof
    for (const s of [1, -1]) parts.push(box(0.04, 1.5, 0.7, s * 1.92, f + 1.0, 3.5, '#455a64')); // side doors
    searchlight(parts, 0, f + 2.45, 5.4);
    marineHorn(parts, -0.8, f + 2.5, 5.2);
    // Radar mast & scanner
    parts.push(cyl(0.08, 0.1, 2.2, 0, f + 3.5, 3.4, '#cfd8dc', 8));
    parts.push(box(1.4, 0.05, 0.05, 0, f + 3.9, 3.4, '#cfd8dc'));
    radarScanner(parts, 0, f + 4.7, 3.4);
    // Exhaust stack with rain flap
    parts.push(cyl(0.22, 0.22, 2.8, 1.2, f + 2.6, 2.4, '#263238', 8));
    parts.push(cyl(0.26, 0.23, 0.2, 1.2, f + 4.0, 2.4, '#e53935', 8));
    for (const s of [1, -1]) lifebuoy(parts, s * 1.94, f + 1.5, 3.2, 0, Math.PI / 2, 0);

    // Stern A-Frame Trawl Gantry
    for (const s of [1, -1]) {
      const leg = new THREE.BoxGeometry(0.18, 4.2, 0.18);
      leg.rotateZ(s * -0.15);
      leg.translate(s * 2.2, f + 2.2, -8.5);
      leg.deleteAttribute('uv');
      parts.push(paint(leg, '#37474f'));
      parts.push(cyl(0.18, 0.18, 0.12, s * 1.2, f + 3.9, -8.5, '#cfd8dc', 8)); // trawl blocks/sheaves
    }
    parts.push(box(3.8, 0.22, 0.22, 0, f + 4.2, -8.5, '#37474f')); // top crossbeam

    // Net Winch Drum on aft deck with wound trawl net
    parts.push(cyl(0.65, 0.65, 0.1, -1.3, f + 0.8, -3.2, '#263238', 12));
    parts.push(cyl(0.65, 0.65, 0.1, 1.3, f + 0.8, -3.2, '#263238', 12));
    const drum = new THREE.CylinderGeometry(0.55, 0.55, 2.5, 12).rotateZ(Math.PI / 2);
    drum.translate(0, f + 0.8, -3.2);
    drum.deleteAttribute('uv');
    parts.push(paint(drum, '#2e4d3a'));

    // Outrigger Stabilizer Trolling Booms
    for (const s of [1, -1]) {
      const boom = new THREE.CylinderGeometry(0.06, 0.08, 4.8, 6).rotateZ(s * -0.55);
      boom.translate(s * 2.5, f + 2.5, 1.0);
      boom.deleteAttribute('uv');
      parts.push(paint(boom, '#455a64'));
    }

    // Deck Details: Central fish hold hatch & colorful stacked fish crates
    parts.push(box(2.2, 0.4, 2.0, 0, f + 0.35, -0.6, '#3e2723'));
    parts.push(box(2.3, 0.1, 2.1, 0, f + 0.58, -0.6, '#cfd8dc'));
    parts.push(box(0.9, 0.55, 0.7, -1.6, f + 0.4, -0.4, '#f57c00')); // orange fish crates
    parts.push(box(0.9, 0.55, 0.7, -1.6, f + 0.4, 0.5, '#0288d1')); // blue fish crates
    parts.push(box(0.9, 0.55, 0.7, 1.6, f + 0.4, -0.4, '#388e3c')); // green fish crates
    parts.push(box(1.2, 0.55, 0.8, 0, f + 0.4, 7.5, '#37474f')); // bow anchor windlass
    railing(parts, d.B / 2 - 0.1, f, 6.0, 9.2);
    return { parts, nav: [[2.0, f + 2.2, 5.0]], name: true };
  },
  /** Hooghly River Cargo / Container Ship: loaded container bays, deck crane, island bridge, and funnel. */
  ship(color = '#1e293b') {
    const d = BOATS.ship;
    const f = d.free;
    const parts = [hull(d.L, d.B, d.keel, f, d.bow, { hull: color, bottom: '#6e1a1e', stripe: '#f8fafc', deck: '#334155' })];
    // Forecastle deck at bow
    parts.push(box(8.6, 0.6, 0.2, 0, f + 0.8, 22, '#475569')); // breakwater
    parts.push(box(2.6, 1.0, 1.4, 0, f + 0.7, 23.5, '#1e293b')); // anchor windlass
    parts.push(cyl(0.06, 0.08, 2.4, 0, f + 1.8, 26, '#e2e8f0', 6)); // forward jackstaff
    for (const s of [1, -1]) {
      parts.push(box(0.2, 0.9, 0.6, s * 5.2, f - 0.2, 22, '#0f172a')); // hawsehole anchor
      parts.push(box(0.15, 0.15, 48, s * (d.B / 2 + 0.06), f + 0.8, -3, '#334155')); // rub rail
    }

    // Container Stacks (20ft & 40ft containers in authentic shipping line colors)
    const bayColors = [
      ['#0284c7', '#15803d', '#dc2626'],
      ['#eab308', '#0284c7', '#15803d'],
      ['#dc2626', '#eab308', '#0284c7'],
      ['#15803d', '#dc2626', '#eab308'],
    ];
    // Bay 1 (forward container bay, z = 8 to 18)
    for (let row = 0; row < 2; row++) {
      const z = 10.5 + row * 6.5;
      for (const [colIdx, x] of [-2.6, 0, 2.6].entries()) {
        const c1 = bayColors[row][colIdx];
        const c2 = bayColors[row + 2][colIdx];
        parts.push(rbox(2.4, 2.3, 6.0, x, f + 1.25, z, c1, 0.08));
        parts.push(rbox(2.4, 2.3, 6.0, x, f + 3.6, z, c2, 0.08));
        for (const sx of [-1.15, 1.15]) {
          for (const sz of [-2.9, 2.9]) {
            parts.push(box(0.12, 4.6, 0.12, x + sx, f + 2.4, z + sz, '#f8fafc'));
          }
        }
      }
    }
    // Bay 2 (aft container bay, z = -7 to 3)
    for (let row = 0; row < 2; row++) {
      const z = -4.5 + row * 6.5;
      for (const [colIdx, x] of [-2.6, 0, 2.6].entries()) {
        const c1 = bayColors[row + 1][colIdx];
        const c2 = bayColors[row][colIdx];
        parts.push(rbox(2.4, 2.3, 6.0, x, f + 1.25, z, c1, 0.08));
        parts.push(rbox(2.4, 2.3, 6.0, x, f + 3.6, z, c2, 0.08));
        for (const sx of [-1.15, 1.15]) {
          for (const sz of [-2.9, 2.9]) {
            parts.push(box(0.12, 4.6, 0.12, x + sx, f + 2.4, z + sz, '#f8fafc'));
          }
        }
      }
    }

    // Heavy Cargo Derrick Crane (between bays at z = 5.0)
    parts.push(cyl(0.9, 1.0, 3.4, 0, f + 1.7, 5.0, '#f8fafc', 12));
    parts.push(rbox(2.4, 1.8, 2.2, 0, f + 3.9, 5.0, '#f8fafc', 0.2));
    parts.push(box(0.8, 1.2, 1.0, 1.25, f + 4.0, 5.4, GLASS));
    const boom = new THREE.BoxGeometry(0.65, 0.65, 13).rotateX(0.24);
    boom.translate(0, f + 5.2, 10.8);
    boom.deleteAttribute('uv');
    parts.push(paint(boom, '#eab308'));
    parts.push(cyl(0.18, 0.18, 0.6, 0, f + 3.5, 16.5, '#0f172a', 8));

    // Aft Island Bridge Superstructure (z = -14 to -23)
    parts.push(rbox(9.2, 2.6, 8.5, 0, f + 1.3, -18.5, '#f8fafc', 0.3)); // Tier 1
    parts.push(rbox(8.8, 2.4, 7.8, 0, f + 3.8, -18.5, '#f8fafc', 0.3)); // Tier 2
    parts.push(box(8.85, 0.5, 7.2, 0, f + 4.0, -18.5, GLASS));
    // Tier 3: Navigation Bridge with extended wings
    parts.push(rbox(11.2, 2.2, 5.4, 0, f + 6.1, -17.5, '#f8fafc', 0.2));
    parts.push(rbox(11.25, 0.9, 5.45, 0, f + 6.3, -17.5, GLASS, 0.1));
    for (const s of [1, -1]) searchlight(parts, s * 5.4, f + 7.3, -17.5);
    // Funnel (smokestack)
    parts.push(cyl(1.1, 1.3, 4.2, 0, f + 8.8, -22.5, '#f8fafc', 14));
    parts.push(cyl(1.12, 1.12, 1.2, 0, f + 9.6, -22.5, '#dc2626', 14));
    parts.push(cyl(1.15, 1.15, 0.5, 0, f + 10.6, -22.5, '#0f172a', 14));
    for (const s of [-0.4, 0.4]) parts.push(cyl(0.2, 0.2, 0.9, s, f + 11.2, -22.5, '#0f172a', 8));
    // Radar mast & instruments
    parts.push(cyl(0.12, 0.16, 4.2, 0, f + 9.2, -16.5, '#e2e8f0', 8));
    parts.push(box(3.2, 0.08, 0.08, 0, f + 9.6, -16.5, '#e2e8f0'));
    radarScanner(parts, 0, f + 11.4, -16.5);
    parts.push(cyl(0.45, 0.48, 0.6, 0.9, f + 8.2, -18.5, '#ffffff', 10)); // satellite dome
    // Enclosed lifeboats in gravity davits
    for (const s of [1, -1]) {
      parts.push(rbox(1.2, 0.9, 3.8, s * 5.0, f + 5.0, -20.5, '#ea580c', 0.3));
      parts.push(box(0.12, 1.8, 0.12, s * 4.9, f + 5.2, -19.2, '#64748b'));
      parts.push(box(0.12, 1.8, 0.12, s * 4.9, f + 5.2, -21.8, '#64748b'));
      lifebuoy(parts, s * 5.65, f + 6.3, -17.5, 0, Math.PI / 2, 0);
    }
    railing(parts, 4.4, f + 4.9, -22.5, -14.5);
    return { parts, nav: [[5.6, f + 6.8, -15.0]], name: true };
  },
};

let MAT = null;
function boatMats() {
  if (MAT) return MAT;
  MAT = {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.1, side: THREE.DoubleSide }),
    red: new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 1.5 }),
    green: new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x22ff55, emissiveIntensity: 1.5 }),
  };
  return MAT;
}

function buildBoatMesh(type, color) {
  const M = boatMats();
  const { parts, nav } = MODELS[type](new THREE.Color(color).getStyle());
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // Each boat gets its own body material so a wreck can char just that one
  const mat = M.body.clone();
  const mesh = new THREE.Mesh(merge(parts), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  body.add(mesh);
  // Port (red, left) and starboard (green, right) running lights
  const [nx, ny, nz] = nav[0];
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.red.clone());
  red.position.set(nx, ny, nz);
  const green = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.green.clone());
  green.position.set(-nx, ny, nz);
  body.add(red, green);
  // The wreck code darkens paint/lights through this record
  const paintProxy = mat;
  paintProxy.clearcoat = 0;
  return { root, body, wheels: [], paint: paintProxy, meshes: { head: green, tail: red }, type, color, lodWheels: new THREE.Object3D(), detail: [], near: true };
}

/* =========================================================
   Boat
   ========================================================= */
export class Boat extends Vehicle {
  constructor(scene, world, fx, type, color) {
    super(scene, world, fx, 'sedan', color, buildBoatMesh(type, color));
    this.type = type;
    this.def = BOATS[type];
    this.hp = this.def.hp;
    this.boat = true;
    this.keep = true;
    this.t = Math.random() * 10;
    this.sink = 0;
  }

  setDriven(on) {
    this.driven = on;
    this.asleep = false;
  }

  place(x, z, yaw) {
    this.pos.set(x, WATER_Y, z);
    this.yaw = yaw;
    this.vel.set(0, 0);
    this.angVel = 0;
    this.applyBoat(0);
  }

  /** Close enough to step aboard from the pier, beach or water's edge? */
  canBoard(p) {
    const d = this.def;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const along = clamp((p.x - this.pos.x) * fx + (p.z - this.pos.z) * fz, -d.hl, d.hl);
    const edge = Math.hypot(p.x - (this.pos.x + fx * along), p.z - (this.pos.z + fz * along)) - d.hw;
    return edge < 2.4 && p.y > this.pos.y - 1.5 && p.y < this.pos.y + d.free + 4;
  }

  /** Somewhere dry to step off: the pier deck or the beach, within a few metres. */
  landingSpot() {
    const d = this.def;
    const W = this.world;
    // dry = a pontoon/pier deck, or ground that isn't the river (height is 0 under the water too)
    const dry = (x, z, h) => h > 0.15 || !(W.overWater(x, z) || (W.river && inPoly(W.river, x, z)));
    const cands = [];
    for (const side of [1, -1]) {
      for (const along of [0, d.hl * 0.5, -d.hl * 0.5, d.hl * 0.9, -d.hl * 0.9]) for (const out of [0.9, 2, 3.5]) cands.push([side * (d.hw + out), along, out + Math.abs(along) * 0.1]);
    }
    // over the bow or the stern (a launch ties up bow-on to its jetty)
    for (const end of [1, -1]) for (const out of [1.2, 2.5]) for (const lat of [0, 1.5, -1.5]) cands.push([lat, end * (d.hl + out), out]);
    let best = null;
    for (const [lx, lz, score] of cands) {
      const p = this.local(lx, lz);
      const h = W.height(p.x, p.z);
      if (h > WATER_Y + 0.25 && dry(p.x, p.z, h) && !W.collideCircle(p.x, p.z, 0.35)) {
        if (!best || score < best.score) best = { x: p.x, z: p.z, score };
      }
    }
    return best;
  }

  wreck() {
    super.wreck();
    this.sinking = true;
  }

  /** Circle vs the river banks, jetties, bridge piers and the ends of the mapped river. */
  collideShore(x, z, r) {
    const W = this.world;
    const river = W.river;
    let px = 0;
    let pz = 0;
    if (river) {
      const q = nearestOnRing(river, x, z, this._q || (this._q = {}));
      const inside = inPoly(river, x, z);
      if (!inside || q.d < r) {
        const d = q.d || 1e-6;
        // outside: back across the bank and r further in; inside but too close: out to r
        const k = inside ? r - d : -(d + r);
        px += ((x - q.x) / d) * k;
        pz += ((z - q.z) / d) * k;
      }
    }
    const cx = x + px;
    const cz = z + pz;
    for (const o of W.boatObstacles || []) {
      const dx = cx - o.x;
      const dz = cz - o.z;
      const d = Math.hypot(dx, dz);
      const rr = r + o.r;
      if (d < rr && d > 1e-6) {
        px += (dx / d) * (rr - d);
        pz += (dz / d) * (rr - d);
      }
    }
    for (const p of W.jetties || []) {
      const ex = x + px;
      const ez = z + pz;
      if (ex < p.x0 - r || ex > p.x1 + r || ez < p.z0 - r || ez > p.z1 + r) continue;
      const q = nearestOnRing(p, ex, ez, {});
      const inside = inPoly(p, ex, ez);
      if (!inside && q.d >= r) continue;
      const d = q.d || 1e-6;
      const k = inside ? -(d + r) : r - d;
      px += ((ex - q.x) / d) * k;
      pz += ((ez - q.z) / d) * k;
    }
    // the river runs on past the mapped area: keep boats near it
    const fx = x + px;
    const fz = z + pz;
    const m = 900;
    const qx = clamp(fx, BOUNDS.x0 - m, BOUNDS.x1 + m);
    const qz = clamp(fz, BOUNDS.z0 - m, BOUNDS.z1 + m);
    px += qx - fx;
    pz += qz - fz;
    if (Math.abs(px) < 1e-6 && Math.abs(pz) < 1e-6) return null;
    const l = Math.hypot(px, pz);
    return { px, pz, nx: px / l, nz: pz / l };
  }

  /** Ferry autopilot: steer for the next point of the route, dock and wait at each end. */
  autopilot(dt) {
    const R = this.route;
    const inp = this._ai || (this._ai = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false });
    if (R.wait > 0) {
      R.wait -= dt;
      inp.throttle = 0;
      inp.brake = this.vf > 0.3 ? 0.6 : 0;
      inp.steer = 0;
      const B = R.berth;
      if (B) {
        // tie up square in the berth, bow against the pontoon, so you can step aboard from its end
        const k = 1 - Math.exp(-1.5 * dt);
        this.pos.x += (B.x - this.pos.x) * k;
        this.pos.z += (B.z - this.pos.z) * k;
        this.yaw += wrapAngle(B.yaw - this.yaw) * k;
        this.vel.multiplyScalar(1 - k);
        this.angVel = 0;
        if (R.wait <= 0) {
          R.berth = null;
          R.backT = 7; // cast off: go astern clear of the jetty before turning for the far bank
        }
      }
      return inp;
    }
    if (R.backT > 0) {
      R.backT -= dt;
      inp.throttle = 0;
      inp.brake = 1;
      inp.steer = R.i % 2 ? 1 : -1;
      return inp;
    }
    const pts = R.pts;
    const [tx, tz] = pts[R.i];
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const last = R.i === (R.dir > 0 ? pts.length - 1 : 0);
    // docked once it's right at the berth, or nosed in against the pontoon and stopped
    if (dist < (last ? 1.5 : 14) || (last && dist < 6 && Math.abs(this.vf) < 0.8)) {
      if (last) {
        if (R.berths) R.berth = R.berths[R.i === pts.length - 1 ? 1 : 0];
        R.wait = 35 + Math.random() * 15; // long enough to walk down the gangway and catch it
        R.dir *= -1;
      }
      R.i = clamp(R.i + R.dir, 0, pts.length - 1);
      return inp;
    }
    const err = wrapAngle(Math.atan2(dx, dz) - this.yaw);
    inp.steer = clamp(-err * 2.2, -1, 1);
    const slow = last ? clamp(dist / 50, 0.12, 0.7) : 0.75;
    inp.throttle = Math.abs(err) > 1.2 ? 0.2 : slow;
    inp.brake = last && dist < 20 && this.vf > 3 ? 0.5 : 0;
    return inp;
  }

  update(dt, inp, night) {
    const d = this.def;
    if (this.fuse > 0 || this.burnT > 0 || this.hp < d.hp * 0.45) this.updateDamage(dt);
    if (this.route && !this.driven && !this.wrecked) inp = this.autopilot(dt);
    else if (!this.driven || this.wrecked) inp = IDLE;
    this.t += dt;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const lx = fz;
    const lz = -fx;
    let vf = this.vel.x * fx + this.vel.y * fz;
    let vl = this.vel.x * lx + this.vel.y * lz;
    const th = this.locked ? 0 : inp.throttle;
    const br = this.locked ? 0 : inp.brake;
    vf += (th * d.accel - br * d.accel * 0.6) * dt;
    // Water drag rises with the square of speed; handbrake = throttle back hard
    vf -= (vf * Math.abs(vf) * d.drag + vf * 0.12 + (inp.handbrake ? vf * 1.2 : 0)) * dt;
    vf = clamp(vf, -d.top * 0.3, d.top);
    vl *= Math.exp(-d.grip * dt);
    this.braking = br > 0 && vf > 0.5;
    this.steer = damp(this.steer, (this.locked ? 0 : inp.steer) * 1, this.driven ? 2.2 : 4, dt);
    const rudder = clamp(Math.abs(vf) / 5, 0.25, 1) * (vf < -0.3 ? -1 : 1);
    this.angVel = damp(this.angVel, -this.steer * d.turn * rudder, 2.5 / Math.max(1, Math.sqrt(d.mass) * 0.6), dt);
    this.yaw += this.angVel * dt;
    this.vel.set(fx * vf + lx * vl, fz * vf + lz * vl);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    // Shore, pier and map edge
    this.impact = 0;
    const nfx = Math.sin(this.yaw);
    const nfz = Math.cos(this.yaw);
    for (const off of d.offs) {
      const hit = this.collideShore(this.pos.x + nfx * off, this.pos.z + nfz * off, d.rad);
      if (!hit) continue;
      this.pos.x += hit.px;
      this.pos.z += hit.pz;
      const vn = this.vel.x * hit.nx + this.vel.y * hit.nz;
      if (vn < 0) {
        this.vel.x -= 1.4 * vn * hit.nx;
        this.vel.y -= 1.4 * vn * hit.nz;
        this.angVel -= ((nfx * off * hit.nz - nfz * off * hit.nx) * -vn * 0.04) / Math.sqrt(d.mass);
        this.impact = Math.max(this.impact, -vn);
        if (-vn > 5) this.fx.foam(this.pos.x + nfx * off, WATER_Y + 0.2, this.pos.z + nfz * off, 0, 0, 2, 3);
      }
    }
    // A ferry on its rounds doesn't wreck itself nudging the jetty
    if (!this.route || this.driven) crashDamage(this, this.impact);

    this.vf = vf;
    this.vl = vl;
    this.speed = this.vel.length();
    this.slip = Math.atan2(Math.abs(vl), Math.max(2, Math.abs(vf)));
    this.gear = vf < -0.5 ? -1 : 1;
    this.rpm = damp(this.rpm, clamp(0.2 + (th ? 0.35 : 0) + Math.abs(vf) / d.top * 0.6, 0, 1), 6, dt);
    this.skid = 0;
    this.applyBoat(dt);
  }

  applyBoat(dt) {
    const d = this.def;
    const t = this.t;
    const calm = d.mass > 5 ? 0.35 : 1;
    const wave = (Math.sin(t * 1.6 + this.pos.x * 0.15) * 0.07 + Math.sin(t * 1.13 + this.pos.z * 0.21) * 0.05) * calm;
    if (this.sinking) this.sink = Math.min(d.keel + d.h + 2, this.sink + dt * 0.35);
    this.pos.y = WATER_Y + wave - this.sink;
    const plane = clamp(this.vf / d.top, 0, 1);
    // Bow lifts as the hull gets up on the plane; it rocks with the swell
    const pitch = -d.lift * Math.sin(plane * Math.PI * 0.9) * 2 + Math.sin(t * 1.4 + this.pos.z * 0.1) * 0.025 * calm + (this.sinking ? this.sink * 0.06 : 0);
    const roll = clamp(-this.angVel * this.vf * (d.lean ? 0.05 : 0.012), -0.5, 0.5) + Math.sin(t * 1.05 + this.pos.x * 0.1) * 0.035 * calm;
    this.pitch = dt ? damp(this.pitch, pitch, 4, dt) : pitch;
    this.roll = dt ? damp(this.roll, roll, 4, dt) : roll;
    const c = this.car;
    c.root.position.copy(this.pos);
    c.root.rotation.y = this.yaw;
    c.body.rotation.x = this.pitch;
    c.body.rotation.z = this.roll;
    c.root.visible = this.sink < d.keel + d.h + 1.5;
    if (!dt || this.speed < 1.5 || this.sinking) return;
    // Wake behind the stern, spray off the bow when fast
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const sz = Math.min(3, 0.6 + d.B * 0.25);
    if (Math.random() < Math.min(1, this.speed / 8)) {
      for (const s of [-1, 1]) {
        const p = this.local(s * d.hw * 0.7, -d.hl);
        this.fx.foam(p.x, WATER_Y + 0.05, p.z, -fx * 2 + this.vel.x * 0.2, -fz * 2 + this.vel.y * 0.2, sz);
      }
    }
    if (this.speed > d.top * 0.45 && Math.random() < 0.6) {
      for (const s of [-1, 1]) {
        const p = this.local(s * d.hw * 0.6, d.hl * 0.55);
        this.fx.foam(p.x, WATER_Y + 0.3, p.z, fz * s * 3, -fx * s * 3, sz * 0.5, 3);
      }
    }
  }
}

/* ---------- Ghats: floating pontoon jetties where the ferry routes meet the banks ---------- */
export function buildGhats(world, scene) {
  const river = world.river;
  const docks = [];
  if (!river) return docks;
  world.jetties = [];
  const gangways = (world.gangways = []);
  const parts = [];
  for (const f of MAP.ferries) {
    const pts = [];
    for (let i = 0; i < f.p.length; i += 2) pts.push([f.p[i], f.p[i + 1]]);
    if (pts.length < 2) continue;
    const route = { pts: [], name: f.name };
    const ends = [];
    for (const rev of [false, true]) {
      const list = rev ? [...pts].reverse() : pts;
      // walk in from this end until we're on the water
      const P = new Poly(list.flat());
      const q = {};
      let s = 0;
      while (s < P.len && !inPoly(river, P.at(s, q).x, q.z)) s += 1;
      if (s >= P.len) break;
      P.at(s, q);
      const ux = q.tx;
      const uz = q.tz;
      const bx = q.x;
      const bz = q.z;
      const L = 20;
      const hw = 3.6;
      const ring = [];
      for (const [a, b] of [[-5, -hw], [L, -hw], [L, hw], [-5, hw]]) ring.push(bx + ux * a - uz * b, bz + uz * a + ux * b);
      const p = polygon(ring);
      world.addPad(ring, 0.3);
      world.addOpening(p);
      world.jetties.push(polygon([...[[0, -hw - 0.3], [L + 0.4, -hw - 0.3], [L + 0.4, hw + 0.3], [0, hw + 0.3]].flatMap(([a, b]) => [bx + ux * a - uz * b, bz + uz * a + ux * b])]));
      // railings along the long sides, open at the river end
      for (const sd of [-1, 1]) {
        const ax = bx - uz * hw * sd;
        const az = bz + ux * hw * sd;
        world.addWall(ax, az, ax + ux * (L - 3), az + uz * (L - 3), 0.15);
      }
      // a chain across the river end: you board with V/F, not by stepping off into the Ganga
      world.addWall(bx + ux * L - uz * hw, bz + uz * L + ux * hw, bx + ux * L + uz * hw, bz + uz * L - ux * hw, 0.15);
      const yaw = Math.atan2(ux, uz);
      const mid = [bx + ux * (L - 5) / 2, bz + uz * (L - 5) / 2];
      parts.push(box(hw * 2, 1.1, L + 5, 0, -0.25, 0, '#3c4044').rotateY(yaw).translate(mid[0], 0, mid[1]));
      for (const sd of [-1, 1]) {
        parts.push(box(0.06, 0.06, L - 3, sd * hw, 1.25, -(L + 5) / 2 + (L - 3) / 2 + 5, '#d8d8d0').rotateY(yaw).translate(mid[0], 0, mid[1]));
        for (let k = 0; k < L - 3; k += 2) parts.push(box(0.06, 1.0, 0.06, sd * hw, 0.8, -(L + 5) / 2 + 5 + k, '#d8d8d0').rotateY(yaw).translate(mid[0], 0, mid[1]));
      }
      for (const sd of [-1, 1]) parts.push(box(0.1, 1.0, 0.1, sd * hw, 0.8, (L + 5) / 2 - 0.4, '#d8d8d0').rotateY(yaw).translate(mid[0], 0, mid[1]));
      parts.push(box(hw * 2, 0.05, 0.05, 0, 1.0, (L + 5) / 2 - 0.4, '#c9a43a').rotateY(yaw).translate(mid[0], 0, mid[1]));
      // tin-roofed ticket shed at the landward end
      parts.push(box(hw * 2 + 1, 0.15, 6, 0, 3.2, -(L + 5) / 2 + 3, '#8a3a2c').rotateY(yaw).translate(mid[0], 0, mid[1]));
      for (const [sx, sz] of [[-1, 0], [1, 0], [-1, 5.6], [1, 5.6]]) parts.push(box(0.12, 2.9, 0.12, sx * (hw + 0.3), 1.75, -(L + 5) / 2 + 0.2 + sz, '#2a2b2e').rotateY(yaw).translate(mid[0], 0, mid[1]));
      // Gangway: where the mapped ferry line starts out on the water, a walkway joins the
      // pontoon's landward end to the bank so it can be reached on foot.
      {
        const jx = bx - ux * 5;
        const jz = bz - uz * 5;
        const wet = (x, z) => inPoly(river, x, z) || world.overWater(x, z);
        // walk out from the pontoon both straight back and towards the nearest bank; take the shorter
        const reach = (dx, dz) => {
          const l = Math.hypot(dx, dz) || 1;
          for (let d = 0; d < 200; d += 0.5) if (!wet(jx + (dx / l) * d, jz + (dz / l) * d)) return { d, x: jx + (dx / l) * d, z: jz + (dz / l) * d };
          return null;
        };
        const n = nearestOnRing(river, jx, jz, {});
        const opts = [reach(-ux, -uz), reach(n.x - jx, n.z - jz)].filter(Boolean).sort((a, b) => a.d - b.d);
        const lx = opts.length ? opts[0].x : n.x;
        const lz = opts.length ? opts[0].z : n.z;
        let gx = lx - jx;
        let gz = lz - jz;
        const gl = Math.hypot(gx, gz);
        if (gl > 0.3) {
          gx /= gl;
          gz /= gl;
          const len = gl + 3; // runs 3 m onto the bank
          const gw = 1.6;
          const at = (a, b) => [jx + gx * a - gz * b, jz + gz * a + gx * b];
          const ringG = [];
          for (const [a, b] of [[-0.5, -gw], [len, -gw], [len, gw], [-0.5, gw]]) ringG.push(...at(a, b));
          world.addPad(ringG, 0.3);
          world.addOpening(polygon(ringG));
          world.jetties.push(polygon(ringG)); // boats can't sail through it
          gangways.push({ land: [lx, lz], jetty: [jx, jz], len: gl });
          const gyaw = Math.atan2(gx, gz);
          const [mx, mz] = at(len / 2 - 0.25, 0);
          parts.push(box(gw * 2, 0.5, len + 0.5, 0, 0.05, 0, '#5a5048').rotateY(gyaw).translate(mx, 0, mz));
          for (let k = 0.75; k < len; k += 1.5) parts.push(box(gw * 2 + 0.1, 0.04, 0.12, 0, 0.32, -(len + 0.5) / 2 + k, '#3a332c').rotateY(gyaw).translate(mx, 0, mz));
          for (const sd of [-1, 1]) {
            const [ax, az] = at(0, gw * sd);
            const [ex, ez] = at(len - 1, gw * sd);
            world.addWall(ax, az, ex, ez, 0.12);
            parts.push(box(0.06, 0.06, len - 1, sd * gw, 1.25, -(len + 0.5) / 2 + 0.5 + (len - 1) / 2, '#d8d8d0').rotateY(gyaw).translate(mx, 0, mz));
            for (let k = 0; k <= len - 1; k += 2) parts.push(box(0.06, 1.0, 0.06, sd * gw, 0.8, -(len + 0.5) / 2 + 0.5 + k, '#d8d8d0').rotateY(gyaw).translate(mx, 0, mz));
          }
          // pontoon floats under the walkway every few metres
          for (let k = 4; k < gl - 1; k += 8) parts.push(box(gw * 2 + 0.6, 0.5, 2.2, 0, -0.35, -(len + 0.5) / 2 + k, '#2a2d30').rotateY(gyaw).translate(mx, 0, mz));
        }
      }
      // dock: the launch (24 m) comes in bow-first with its bow against the pontoon's river end
      ends.push({ x: bx, z: bz, ux, uz, dock: [bx + ux * (L + 12.6), bz + uz * (L + 12.6)], yaw });
      void p;
    }
    if (ends.length < 2) continue;
    // Route: dock A, the mapped line across, dock B. Points of the line close to either
    // jetty would lead the launch back into it, so the crossing starts from the docks.
    route.pts.push(ends[0].dock);
    const clear = (pt) => ends.every((e) => Math.hypot(pt[0] - e.x, pt[1] - e.z) > 60);
    for (const pt of pts.slice(1, -1)) if (inPoly(river, pt[0], pt[1]) && clear(pt)) route.pts.push(pt);
    route.pts.push(ends[1].dock);
    route.ends = ends;
    docks.push(route);
  }
  if (parts.length) {
    const m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  return docks;
}

/** A line down the middle of the mapped river, for scenery traffic. */
function riverCentreline(river) {
  const pts = [];
  for (let z = BOUNDS.z0 - 800; z <= BOUNDS.z1 + 800; z += 30) {
    const xs = [];
    for (let i = 0, j = river.n - 1; i < river.n; j = i++) {
      const az = river.zs[j];
      const bz = river.zs[i];
      if (az > z === bz > z) continue;
      xs.push(river.xs[j] + ((z - az) / (bz - az)) * (river.xs[i] - river.xs[j]));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    pts.push((xs[0] + xs[xs.length - 1]) / 2, z);
  }
  return pts.length > 4 ? new Poly(pts) : null;
}

/* ---------- Scenery: cargo ships, fishing trawlers, cruise steamer, and hopper barge working up and down the Hooghly ---------- */
export class RiverTraffic {
  constructor(scene, world) {
    this.line = world.river ? riverCentreline(world.river) : null;
    this.ships = [];
    if (!this.line) return;

    // 1. Cargo Container Ship (58m)
    const cargoMesh = new THREE.Mesh(merge(MODELS.ship('#1e293b').parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }));
    cargoMesh.castShadow = true;

    // 2. Fishing Trawler 1 (21m, Deep Sea Green)
    const trawler1Mesh = new THREE.Mesh(merge(MODELS.trawler('#1e4632').parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
    trawler1Mesh.castShadow = true;

    // 3. Fishing Trawler 2 (21m, Rust Orange & White)
    const trawler2Mesh = new THREE.Mesh(merge(MODELS.trawler('#c85a2b').parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
    trawler2Mesh.castShadow = true;

    // 4. Heritage River Cruise Steamer (48m)
    const steamer = [hull(48, 10, 2.2, 2.2, 1.2, { hull: '#f8fafc', bottom: '#6e1a1e', stripe: '#1f4f8a', deck: '#8b7356' })];
    steamer.push(rbox(9.4, 3.0, 32, 0, 3.7, -2, '#f8fafc', 0.3), rbox(9.45, 1.1, 31.4, 0, 3.9, -2, GLASS, 0.15));
    steamer.push(rbox(8.6, 2.6, 24, 0, 6.5, -3, '#f8fafc', 0.3), rbox(8.65, 1.0, 23.4, 0, 6.7, -3, GLASS, 0.15));
    steamer.push(box(9.2, 0.2, 26, 0, 8.0, -3, '#1f4f8a')); // promenade shade canopy
    steamer.push(rbox(5.4, 2.0, 4.2, 0, 9.1, 7.5, '#f8fafc', 0.2), rbox(5.45, 0.8, 4.25, 0, 9.3, 7.5, GLASS, 0.1)); // bridge
    searchlight(steamer, 0, 10.2, 9.0);
    radarScanner(steamer, 0, 10.8, 7.5);
    steamer.push(cyl(1.1, 1.3, 4.2, 0, 10.2, -10, '#1f4f8a', 14)); // funnel
    steamer.push(cyl(1.15, 1.15, 0.4, 0, 12.1, -10, '#0f172a', 14));
    for (const s of [1, -1]) {
      for (const z of [-9, 3]) lifebuoy(steamer, s * 4.75, 4.2, z, 0, Math.PI / 2, 0);
      steamer.push(rbox(1.2, 0.9, 4.2, s * 4.6, 7.6, -2, '#ff6d00', 0.3)); // lifeboats
    }
    railing(steamer, 4.6, 8.1, -15, 6);
    const steamerMesh = new THREE.Mesh(merge(steamer), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
    steamerMesh.castShadow = true;

    // 5. Hooghly Sand Hopper Barge (56m)
    const barge = [hull(56, 11, 2.5, 1.7, 0.9, { hull: '#374151', bottom: '#5b181b', stripe: '#f59e0b', deck: '#4b5563' })];
    for (const z of [-14, -2, 10]) {
      const sand = new THREE.ConeGeometry(4.2, 2.2, 12);
      sand.translate(0, 2.6, z);
      sand.deleteAttribute('uv');
      barge.push(paint(sand, '#d97706'));
    }
    barge.push(cyl(0.7, 0.8, 2.6, 0, 2.8, -20, '#f59e0b', 8));
    const derrick = new THREE.BoxGeometry(0.5, 0.5, 14).rotateX(-0.35);
    derrick.translate(0, 5.2, -13);
    derrick.deleteAttribute('uv');
    barge.push(paint(derrick, '#f59e0b'));
    barge.push(rbox(7.5, 4.5, 5.5, 0, 4.0, -24, '#e5e7eb', 0.2), rbox(7.55, 1.0, 5.55, 0, 5.4, -24, GLASS, 0.1));
    searchlight(barge, 0, 6.4, -22);
    radarScanner(barge, 0, 7.0, -24);
    for (const s of [1, -1]) {
      for (const z of [-22, -10, 2, 14]) tireFender(barge, s * 5.6, 1.6, z, 0, Math.PI / 2, 0);
    }
    const bargeMesh = new THREE.Mesh(merge(barge), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide }));
    bargeMesh.castShadow = true;

    const fleet = [
      { mesh: cargoMesh, s: 0.2, v: 3.8, dir: 1, offDist: 48, obsOffsets: [-22, -11, 0, 11, 22], obsR: 6.2 },
      { mesh: trawler1Mesh, s: 0.42, v: 4.8, dir: -1, offDist: 34, obsOffsets: [-6, 6], obsR: 3.2 },
      { mesh: steamerMesh, s: 0.65, v: 4.4, dir: 1, offDist: 46, obsOffsets: [-16, 0, 16], obsR: 5.5 },
      { mesh: trawler2Mesh, s: 0.84, v: 4.6, dir: 1, offDist: 34, obsOffsets: [-6, 6], obsR: 3.2 },
      { mesh: bargeMesh, s: 0.12, v: 3.2, dir: -1, offDist: 46, obsOffsets: [-18, -6, 6, 18], obsR: 5.8 },
    ];

    world.boatObstacles = world.boatObstacles || [];
    for (const item of fleet) {
      scene.add(item.mesh);
      const obs = item.obsOffsets.map((off) => ({ x: 0, z: 0, r: item.obsR, off }));
      world.boatObstacles.push(...obs);
      this.ships.push({
        mesh: item.mesh,
        s: this.line.len * item.s,
        v: item.v,
        dir: item.dir,
        offDist: item.offDist,
        obs,
      });
    }
  }
  update(dt, t) {
    const q = {};
    for (const sh of this.ships) {
      sh.s += sh.dir * sh.v * dt;
      if (sh.s < 60 || sh.s > this.line.len - 60) {
        sh.dir *= -1;
        sh.s = clamp(sh.s, 60, this.line.len - 60);
      }
      this.line.at(sh.s, q);
      // keep to the east half going one way, the west going the other
      const off = sh.dir * (sh.offDist || 44);
      sh.mesh.position.set(q.x + q.tz * off, WATER_Y + Math.sin(t * 0.4 + sh.s) * 0.08, q.z - q.tx * off);
      sh.mesh.rotation.y = Math.atan2(q.tx * sh.dir, q.tz * sh.dir);
      sh.mesh.rotation.z = Math.sin(t * 0.3) * 0.008;
      const fx = Math.sin(sh.mesh.rotation.y);
      const fz = Math.cos(sh.mesh.rotation.y);
      for (const o of sh.obs) {
        o.x = sh.mesh.position.x + fx * o.off;
        o.z = sh.mesh.position.z + fz * o.off;
      }
    }
  }
}
