import * as THREE from 'three';
import * as T from './textures.js';
import { merge, clamp, damp, lerp } from './utils.js';
import { buildFleetMesh } from './fleet.js';

/* =========================================================
   Vehicle definitions
   ========================================================= */
const BASE = { wr: 0.36, tw: 0.84, offs: [-1.5, 0, 1.5], rad: 1.0, mass: 1, hw: 0.97, hl: 2.45, h: 1.45, seatX: 0.38, camDist: 0, camH: 0, headZ: 2.36, headY: 0.75, engine: 1, hp: 100, nitro: true };
export const TYPES = {
  coupe: { label: 'Sports Coupe', wz: 1.45, accel: 19, top: 62, grip: 11, steer: 0.6, seatZ: -0.35, seatY: -0.42 },
  convertible: { label: 'Convertible', wz: 1.45, accel: 16, top: 56, grip: 10.5, steer: 0.6, seatZ: -0.3, seatY: -0.42 },
  sedan: { label: 'Sedan', wz: 1.5, accel: 13, top: 50, grip: 10, steer: 0.55, seatZ: -0.2, seatY: -0.38 },
  // Hindustan Ambassador: Kolkata's yellow taxi, and the white sarkari car
  taxi: { label: 'Ambassador Taxi', wz: 1.24, tw: 0.74, accel: 9.5, top: 36, grip: 8.5, steer: 0.5, seatZ: -0.25, seatY: -0.3, hw: 0.86, hl: 2.2, h: 1.62, headZ: 2.17, headY: 0.8, engine: 0.8, offs: [-1.35, 0, 1.35], rad: 0.9 },
  ambassador: { label: 'Ambassador', wz: 1.24, tw: 0.74, accel: 9.5, top: 36, grip: 8.5, steer: 0.5, seatZ: -0.25, seatY: -0.3, hw: 0.86, hl: 2.2, h: 1.62, headZ: 2.17, headY: 0.8, engine: 0.8, offs: [-1.35, 0, 1.35], rad: 0.9 },
  van: { label: 'Van', wz: 1.65, accel: 10, top: 42, grip: 9, steer: 0.5, seatZ: 0.75, seatY: -0.05, hw: 1.02, hl: 2.6, h: 2.1, mass: 1.4, camDist: 1.2, camH: 0.6, headZ: 2.5, headY: 0.85, hp: 130, engine: 0.85 },
  pickup: { label: 'Pickup Truck', axles: [1.75, -1.65], accel: 12, top: 47, grip: 9.5, steer: 0.52, seatZ: 0.15, seatY: 0.02, wr: 0.42, tw: 0.86, hw: 1.0, hl: 2.78, h: 1.95, offs: [-1.7, 0, 1.7], rad: 1.05, mass: 1.6, camDist: 1, camH: 0.5, headZ: 2.72, headY: 1.0, hp: 140, engine: 0.75 },
  truck: { label: 'Box Truck', axles: [2.85, -2.2], dual: true, accel: 7, top: 33, grip: 8, steer: 0.45, seatX: 0.5, seatZ: 2.75, seatY: 0.62, wr: 0.52, tw: 0.92, hw: 1.25, hl: 4.0, h: 3.6, offs: [-3, -1, 1, 3], rad: 1.3, mass: 4, camDist: 5, camH: 2, headZ: 3.98, headY: 1.0, hp: 220, engine: 0.55, nitro: false },
  schoolbus: { label: 'School Bus', axles: [4.35, -2.7], dual: true, accel: 6, top: 30, grip: 8, steer: 0.42, seatX: 0.55, seatZ: 3.25, seatY: 0.4, wr: 0.52, tw: 0.92, hw: 1.25, hl: 5.62, h: 3.1, offs: [-4.4, -2.2, 0, 2.2, 4.4], rad: 1.3, mass: 5, camDist: 7, camH: 2.2, headZ: 5.62, headY: 1.25, hp: 260, engine: 0.5, nitro: false },
  bus: { label: 'City Bus', axles: [3.9, -2.3], dual: true, accel: 6, top: 30, grip: 8, steer: 0.42, seatX: 0.55, seatZ: 4.85, seatY: 0.42, wr: 0.52, tw: 0.92, hw: 1.27, hl: 6.05, h: 3.25, offs: [-4.6, -2.3, 0, 2.3, 4.6], rad: 1.3, mass: 6, camDist: 7.5, camH: 2.4, headZ: 6.05, headY: 0.8, hp: 280, engine: 0.45, nitro: false },
  // Auto-rickshaw: three wheels, the driver up front, a bench behind
  auto: { label: 'Auto Rickshaw', axles: [1.05, -0.62], wr: 0.25, tw: 0.6, accel: 6.5, top: 15, grip: 8, steer: 0.6, seatX: 0, seatZ: 0.32, seatY: -0.22, hw: 0.72, hl: 1.45, h: 1.8, offs: [-0.7, 0.7], rad: 0.75, mass: 0.55, camDist: -0.6, camH: 0.1, headZ: 1.45, headY: 0.95, hp: 70, engine: 1.6, nitro: false, pass: [0, -0.5, -0.12] },
  // Hand-pulled rickshaw: two big wooden wheels, the puller between the shafts
  rickshaw: { label: 'Hand-pulled Rickshaw', axles: [1.6, -0.25], wr: 0.62, tw: 0.78, accel: 2.4, top: 5, grip: 9, steer: 0.7, seatX: 0, seatZ: -0.25, seatY: 0.3, hw: 0.75, hl: 1.7, h: 1.9, offs: [-0.45, 0.95], rad: 0.75, mass: 0.45, camDist: 0.6, camH: 0.3, headZ: 2.2, headY: 1.3, hp: 50, engine: 0, nitro: false },
  bike: { label: 'Motorbike', axles: [0.74, -0.72], accel: 22, top: 66, grip: 12, steer: 0.55, seatX: 0, seatZ: -0.2, seatY: -0.04, wr: 0.33, tw: 0, hw: 0.42, hl: 1.1, h: 1.2, offs: [-0.55, 0.55], rad: 0.55, mass: 0.4, camDist: -1.6, camH: -0.4, headZ: 0.98, headY: 1.0, hp: 60, engine: 1.45, lean: true },
};
for (const k of Object.keys(TYPES)) {
  const d = (TYPES[k] = { ...BASE, ...TYPES[k] });
  d.axles ||= [d.wz, -d.wz];
  d.wz ??= d.axles[0];
}
/** Vehicle types that use the bigger builders in fleet.js. */
const FLEET = new Set(['pickup', 'truck', 'schoolbus', 'bus', 'bike', 'rickshaw', 'auto']);
export const hooks = { explode: null, burning: null };

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function extrude(shape, width, bevel = 0.1) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.75, bevelSegments: 6, curveSegments: 24 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

function profile(pts, wheels, wr = 0.5) {
  // pts: outline after the wheel arches, from front bottom round to rear bottom
  const s = new THREE.Shape();
  const [rear, front] = wheels;
  s.moveTo(pts.rearBottom, 0.42);
  s.lineTo(rear - wr - 0.03, 0.42);
  s.absarc(rear, 0.38, wr, Math.PI, 0, true);
  s.lineTo(front - wr - 0.03, 0.42);
  s.absarc(front, 0.38, wr, Math.PI, 0, true);
  for (const p of pts.path) {
    if (p.length === 2) s.lineTo(p[0], p[1]);
    else s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
  }
  s.closePath();
  return s;
}

let WG = null;
function wheelGeos() {
  if (WG) return WG;
  // Tyre with rounded sidewalls
  const prof = [[0.23, -0.125], [0.29, -0.133], [0.335, -0.127], [0.355, -0.106], [0.362, -0.06], [0.364, 0], [0.362, 0.06], [0.355, 0.106], [0.335, 0.127], [0.29, 0.133], [0.23, 0.125]];
  const tire = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32).rotateZ(Math.PI / 2);
  // Ten-spoke alloy with lip, barrel, hub and lug nuts
  const rp = [
    new THREE.TorusGeometry(0.226, 0.016, 8, 32).rotateY(Math.PI / 2).translate(0.105, 0, 0),
    new THREE.CylinderGeometry(0.224, 0.224, 0.2, 24, 1, true).rotateZ(Math.PI / 2),
    new THREE.CylinderGeometry(0.062, 0.07, 0.06, 16).rotateZ(Math.PI / 2).translate(0.1, 0, 0),
  ];
  for (let i = 0; i < 10; i++) rp.push(new THREE.BoxGeometry(0.028, 0.165, 0.024).translate(0.1, 0.135, 0).rotateX((i / 10) * Math.PI * 2));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    rp.push(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6).rotateZ(Math.PI / 2).translate(0.133, Math.cos(a) * 0.036, Math.sin(a) * 0.036));
  }
  const rim = merge(rp);
  // Brake disc + caliper (doesn't spin)
  const brake = (col) =>
    merge([
      paintV(new THREE.CylinderGeometry(0.19, 0.19, 0.024, 28).rotateZ(Math.PI / 2).translate(-0.01, 0, 0), '#8d9095'),
      paintV(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12).rotateZ(Math.PI / 2).translate(-0.01, 0, 0), '#55585c'),
      paintV(new THREE.BoxGeometry(0.075, 0.1, 0.13).translate(0.01, 0.125, -0.1), col),
    ]);
  const simple = [];
  WG = { tire, rim, brakeRed: brake('#d4262e'), brakeGrey: brake('#4a4d52'), simple };
  return WG;
}
function paintV(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/* Body details per type: panel seams, belt trim, handles, bezels, grille slats, plates, exhausts */
const DIMS = {
  coupe: { front: 2.42, rear: -2.44, hw: 0.97, belt: 1.0, seams: [0.9, -0.5], glassHW: 0.8, cab: [0.95, -2.0], head: [0.62, 0.74, 2.33, 0.54, 0.14], plateF: 0.5, plateR: 0.62, grille: [0.5, 2.44, 1.0, 2] },
  sedan: { front: 2.44, rear: -2.46, hw: 0.96, belt: 1.0, seams: [1.0, -0.08, -1.2], glassHW: 0.81, cab: [1.08, -1.72], head: [0.66, 0.78, 2.39, 0.46, 0.2], plateF: 0.48, plateR: 0.66, grille: [0.62, 2.47, 1.1, 3] },
  van: { front: 2.55, rear: -2.6, hw: 1.02, belt: 1.2, seams: [1.5, 0.45, -1.15], glassHW: 1.03, cab: [2.0, -2.5], head: [0.72, 0.85, 2.47, 0.42, 0.22], plateF: 0.52, plateR: 0.7, grille: [0.82, 2.56, 1.15, 4] },
};
DIMS.convertible = { ...DIMS.coupe, cab: [0.6, -1.6] };
DIMS.taxi = { front: 2.17, rear: -2.16, hw: 0.84, belt: 1.0, seams: [0.92, -0.12, -1.18], glassHW: 0.74, cab: [0.92, -1.32], head: [0.56, 0.8, 2.15, 0.27, 0.27], plateF: 0.36, plateR: 0.6, grille: [0.78, 2.19, 0.62, 6] };
DIMS.ambassador = DIMS.taxi;

function details(type) {
  const d = DIMS[type];
  const trim = [];
  const chrome = [];
  for (const s of [1, -1]) {
    for (const z of d.seams) trim.push(box(0.01, d.belt - 0.5, 0.012, s * (d.hw + 0.005), 0.5 + (d.belt - 0.5) / 2, z));
    trim.push(box(0.025, 0.035, d.cab[0] - d.cab[1], s * d.glassHW, d.belt + 0.02, (d.cab[0] + d.cab[1]) / 2));
    chrome.push(box(0.02, 0.022, 0.13, s * (d.hw + 0.012), d.belt - 0.12, d.seams[0] - 0.32));
    if (d.seams.length > 2) chrome.push(box(0.02, 0.022, 0.13, s * (d.hw + 0.012), d.belt - 0.12, d.seams[1] - 0.32));
    const [hx, hy, hz, hw, hh] = d.head;
    chrome.push(box(hw + 0.05, hh + 0.04, 0.05, s * hx, hy, hz));
  }
  const [gy, gz, gw, n] = d.grille;
  for (let i = 0; i < n; i++) chrome.push(box(gw - 0.1, 0.014, 0.02, 0, gy - 0.06 + (i * 0.12) / Math.max(1, n - 1), gz));
  for (const s of [1, -1]) chrome.push(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 12).rotateX(Math.PI / 2).translate(s * 0.45, 0.42, d.rear - 0.04));
  return { trim, chrome: merge(chrome), plate: fixRearPlate(d) };
}
function fixRearPlate(d) {
  const f = box(0.52, 0.12, 0.015, 0, d.plateF, d.front + 0.03);
  const r = new THREE.BoxGeometry(0.52, 0.12, 0.015).rotateY(Math.PI).translate(0, d.plateR, d.rear - 0.03);
  return merge([f, r]);
}

const GEO = {};
function geosFor(type) {
  if (GEO[type]) return GEO[type];
  let paint;
  let glass;
  let trim;
  let head;
  let tail;
  let extra = null;
  let interior = null;
  if (type === 'coupe' || type === 'convertible') {
    const body = extrude(
      profile(
        {
          rearBottom: -2.25,
          path: [[2.28, 0.42], [2.42, 0.56], [2.4, 0.72], [2.25, 0.86, 1.9, 0.9], [0.8, 1.0], [-1.3, 1.04], [-2.05, 1.02], [-2.38, 1.0, -2.42, 0.8], [-2.38, 0.5]],
        },
        [-1.45, 1.45],
      ),
      1.94,
      0.12,
    );
    trim = merge([box(1.0, 0.16, 0.08, 0, 0.5, 2.42), box(1.72, 0.26, 4.1, 0, 0.42, 0), box(1.5, 0.14, 0.12, 0, 0.42, -2.42), box(0.06, 0.12, 1.85, 0.99, 0.43, 0), box(0.06, 0.12, 1.85, -0.99, 0.43, 0)]);
    head = merge([box(0.48, 0.09, 0.1, 0.62, 0.74, 2.36), box(0.48, 0.09, 0.1, -0.62, 0.74, 2.36)]);
    tail = merge([box(0.52, 0.08, 0.08, 0.6, 0.86, -2.42), box(0.52, 0.08, 0.08, -0.6, 0.86, -2.42), box(0.7, 0.035, 0.06, 0, 0.86, -2.43)]);
    if (type === 'coupe') {
      const cs = new THREE.Shape();
      cs.moveTo(0.95, 0.98);
      cs.quadraticCurveTo(0.35, 1.36, -0.15, 1.42);
      cs.lineTo(-0.95, 1.4);
      cs.quadraticCurveTo(-1.55, 1.3, -2.0, 1.02);
      cs.closePath();
      glass = extrude(cs, 1.6, 0.08);
      paint = merge([body, box(1.5, 0.05, 0.95, 0, 1.47, -0.55), box(0.22, 0.1, 0.14, 0.95, 1.05, 0.62), box(0.22, 0.1, 0.14, -0.95, 1.05, 0.62), box(0.08, 0.42, 0.08, 0.78, 1.18, -0.3), box(0.08, 0.42, 0.08, -0.78, 1.18, -0.3)]);
      extra = merge([box(1.8, 0.05, 0.38, 0, 1.28, -2.08), box(0.06, 0.26, 0.2, 0.55, 1.14, -2.05), box(0.06, 0.26, 0.2, -0.55, 1.14, -2.05)]);
    } else {
      // Open-top: raked windscreen, seats, dash and steering wheel visible
      glass = box(1.62, 0.5, 0.04, 0, 0, 0).rotateX(-0.95).translate(0, 1.22, 0.62);
      paint = merge([body, box(1.66, 0.05, 0.05, 0, 1.43, 0.47), box(0.22, 0.1, 0.14, 0.95, 1.05, 0.62), box(0.22, 0.1, 0.14, -0.95, 1.05, 0.62)]);
      interior = merge([
        box(0.55, 0.12, 0.55, 0.38, 0.72, -0.3),
        box(0.55, 0.12, 0.55, -0.38, 0.72, -0.3),
        box(0.55, 0.6, 0.12, 0.38, 1.0, -0.6).rotateX(0),
        box(0.55, 0.6, 0.12, -0.38, 1.0, -0.6),
        box(1.6, 0.2, 0.3, 0, 1.0, 0.45),
        box(1.5, 0.12, 0.6, 0, 1.0, -1.25),
      ]);
      extra = new THREE.TorusGeometry(0.17, 0.025, 6, 18).rotateX(-0.5).translate(0.38, 1.08, 0.25);
    }
  } else if (type === 'taxi' || type === 'ambassador') {
    // Hindustan Ambassador: round nose and boot, upright glasshouse, domed roof
    const body = extrude(
      profile(
        {
          rearBottom: -1.95,
          path: [[2.02, 0.42], [2.15, 0.5], [2.17, 0.78], [2.1, 0.92, 1.82, 0.98], [1.2, 1.02], [0.92, 1.01], [-1.3, 1.01], [-1.62, 1.0, -1.9, 0.94], [-2.12, 0.86, -2.16, 0.66], [-2.12, 0.48]],
        },
        [-1.24, 1.24],
        0.46,
      ),
      1.68,
      0.15,
    );
    const ws = new THREE.Shape();
    ws.moveTo(0.92, 1.0);
    ws.lineTo(0.52, 1.44);
    ws.lineTo(-0.78, 1.48);
    ws.lineTo(-1.34, 1.0);
    ws.closePath();
    glass = extrude(ws, 1.5, 0.05);
    const roof = new THREE.Shape();
    roof.moveTo(0.58, 1.4);
    roof.quadraticCurveTo(0.45, 1.6, -0.1, 1.63);
    roof.quadraticCurveTo(-0.72, 1.62, -0.9, 1.42);
    roof.closePath();
    const pillars = [];
    for (const s of [1, -1]) {
      pillars.push(box(0.07, 0.48, 0.1, s * 0.75, 1.24, -0.12), box(0.07, 0.48, 0.12, s * 0.74, 1.22, -1.08));
    }
    paint = merge([body, extrude(roof, 1.54, 0.1), ...pillars, box(1.5, 0.05, 0.12, 0, 1.44, 0.5)]);
    trim = merge([box(1.5, 0.22, 3.6, 0, 0.42, -0.05)]);
    // chrome bumpers, grille surround, round lamps with chrome rings
    const lamps = [];
    const rings = [];
    for (const s of [1, -1]) {
      lamps.push(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 18).rotateX(Math.PI / 2).translate(s * 0.58, 0.8, 2.17));
      rings.push(new THREE.TorusGeometry(0.13, 0.025, 6, 18).translate(s * 0.58, 0.8, 2.18));
      lamps.push(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10).rotateX(Math.PI / 2).translate(s * 0.4, 0.6, 2.17));
    }
    head = merge(lamps);
    tail = merge([box(0.12, 0.2, 0.06, 0.66, 0.76, -2.15), box(0.12, 0.2, 0.06, -0.66, 0.76, -2.15)]);
    extra = merge([
      ...rings,
      box(1.78, 0.13, 0.14, 0, 0.5, 2.22),
      box(1.78, 0.13, 0.14, 0, 0.5, -2.2),
      box(0.12, 0.25, 0.16, 0.32, 0.6, 2.25),
      box(0.12, 0.25, 0.16, -0.32, 0.6, 2.25),
      box(0.8, 0.32, 0.04, 0, 0.78, 2.17),
      box(0.04, 0.035, 3.1, 0.855, 0.98, -0.1),
      box(0.04, 0.035, 3.1, -0.855, 0.98, -0.1),
    ]);
    if (type === 'taxi') interior = merge([box(0.025, 0.07, 3.7, 0.86, 0.66, -0.05), box(0.025, 0.07, 3.7, -0.86, 0.66, -0.05)]);
  } else {
    // van
    const body = extrude(
      profile(
        {
          rearBottom: -2.5,
          path: [[2.45, 0.42], [2.55, 0.7], [2.5, 1.05], [2.05, 1.2], [1.35, 2.05], [-2.45, 2.1], [-2.55, 2.0], [-2.55, 0.5]],
        },
        [-1.65, 1.65],
        0.52,
      ),
      2.04,
      0.1,
    );
    paint = body;
    glass = merge([
      box(1.84, 1.0, 0.04, 0, 0, 0).rotateX(-0.74).translate(0, 1.62, 1.74),
      box(0.04, 0.5, 0.95, 1.03, 1.62, 1.0),
      box(0.04, 0.5, 0.95, -1.03, 1.62, 1.0),
      box(0.04, 0.45, 1.6, 1.03, 1.65, -0.8),
      box(0.04, 0.45, 1.6, -1.03, 1.65, -0.8),
      box(1.4, 0.5, 0.04, 0, 1.6, -2.57),
    ]);
    trim = merge([box(1.8, 0.28, 4.6, 0, 0.45, 0), box(2.06, 0.18, 0.14, 0, 0.52, 2.55), box(2.06, 0.18, 0.14, 0, 0.52, -2.58), box(1.2, 0.25, 0.06, 0, 0.82, 2.53)]);
    head = merge([box(0.36, 0.16, 0.08, 0.72, 0.85, 2.5), box(0.36, 0.16, 0.08, -0.72, 0.85, 2.5)]);
    tail = merge([box(0.16, 0.4, 0.08, 0.88, 1.0, -2.6), box(0.16, 0.4, 0.08, -0.88, 1.0, -2.6)]);
    extra = box(1.6, 0.04, 2.8, 0, 2.15, -0.6);
  }
  const det = details(type);
  trim = merge([trim, ...det.trim]);
  const wz = TYPES[type].wz;
  const tw = TYPES[type].tw;
  const lodWheels = merge([[tw, wz], [-tw, wz], [tw, -wz], [-tw, -wz]].map(([x, z]) => new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12).rotateZ(Math.PI / 2).translate(x, 0.36, z)));
  GEO[type] = { paint, glass, trim, head, tail, extra, interior, chrome: det.chrome, plate: det.plate, lodWheels, ...wheelGeos(), shadow: new THREE.PlaneGeometry(2.6, 5.6).rotateX(-Math.PI / 2) };
  return GEO[type];
}

/* ---------- Shared materials ---------- */
let M = null;
function taxiSign() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#ffe14a';
  g.fillRect(0, 0, 128, 48);
  g.fillStyle = '#111';
  g.font = 'bold 34px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('TAXI', 64, 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function treadTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1b1c';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#0b0b0c';
  for (let x = 0; x < 256; x += 8) {
    g.fillRect(x, 22, 3, 20);
    g.fillRect(x + 4, 12, 2, 10);
    g.fillRect(x + 4, 42, 2, 10);
  }
  g.fillRect(0, 31, 256, 2);
  g.fillStyle = '#262628';
  g.fillRect(0, 0, 256, 6);
  g.fillRect(0, 58, 256, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 1);
  return t;
}
let PLATE = null;
function plateTexture() {
  if (PLATE) return PLATE;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, '#f1f1ee');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#111111';
  g.lineWidth = 4;
  g.strokeRect(3, 3, 250, 58);
  // West Bengal plate: a small IND badge and the registration
  g.fillStyle = '#1f3f9a';
  g.fillRect(8, 8, 24, 48);
  g.fillStyle = '#ffffff';
  g.font = 'bold 10px Arial';
  g.textAlign = 'center';
  g.fillText('IND', 20, 52);
  g.fillStyle = '#111111';
  g.font = 'bold 34px Arial';
  g.fillText('WB 06 K 1985', 142, 44);
  PLATE = new THREE.CanvasTexture(c);
  PLATE.colorSpace = THREE.SRGBColorSpace;
  return PLATE;
}
function mats() {
  if (M) return M;
  const sign = taxiSign();
  M = {
    glass: new THREE.MeshStandardMaterial({ color: 0x0b1016, metalness: 0.9, roughness: 0.06 }),
    clearGlass: new THREE.MeshStandardMaterial({ color: 0x88aacc, metalness: 0.9, roughness: 0.04, transparent: true, opacity: 0.35 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x121315, roughness: 0.6, metalness: 0.2 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e8ec, metalness: 1, roughness: 0.12 }),
    interior: new THREE.MeshStandardMaterial({ color: 0xe8dcc6, roughness: 0.6 }),
    tire: new THREE.MeshStandardMaterial({ color: 0xffffff, map: treadTexture(), roughness: 0.88, side: THREE.DoubleSide }),
    rim: new THREE.MeshStandardMaterial({ color: 0xd8dade, metalness: 1, roughness: 0.2, side: THREE.DoubleSide }),
    brake: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.35 }),
    plate: new THREE.MeshStandardMaterial({ map: plateTexture(), emissiveMap: plateTexture(), emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.4, metalness: 0.2 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 1 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a2a, emissiveIntensity: 0.6 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 1 }),
    taxiStripe: new THREE.MeshStandardMaterial({ color: 0x2849a0, roughness: 0.5 }),
    shadow: new THREE.MeshBasicMaterial({ map: T.glow(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }),
  };
  return M;
}

export function setTrafficLights(night) {
  const m = mats();
  m.head.emissiveIntensity = lerp(0.6, 6, night);
  m.tail.emissiveIntensity = lerp(0.5, 3, night);
  m.sign.emissiveIntensity = lerp(0.4, 2.5, night);
  m.plate.emissiveIntensity = lerp(0.05, 0.6, night);
}

const amby0 = (type) => type === 'taxi' || type === 'ambassador';
export function buildCarMesh(type, color) {
  if (FLEET.has(type)) return buildFleetMesh(type, color, { mats: mats(), wheels: wheelGeos(), paintV, def: TYPES[type] });
  const g = geosFor(type);
  const m = mats();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // the Ambassadors are old, plain enamel; modern cars get metallic clearcoat
  const paint = amby0(type) ? new THREE.MeshPhysicalMaterial({ color, metalness: 0.15, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.2 }) : new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  const parts = [
    [g.paint, paint],
    [g.glass, type === 'convertible' ? m.clearGlass : m.glass],
    [g.trim, m.trim],
    [g.head, m.head],
    [g.tail, m.tail],
  ];
  parts.push([g.chrome, m.chrome], [g.plate, m.plate]);
  const amby = type === 'taxi' || type === 'ambassador';
  if (g.extra) parts.push([g.extra, amby ? m.chrome : type === 'convertible' ? m.trim : paint]);
  // on the taxi the "interior" slot carries the blue side stripe
  if (g.interior) parts.push([g.interior, type === 'taxi' ? m.taxiStripe : m.interior]);
  const meshes = {};
  for (const [geo, mat] of parts) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    body.add(mesh);
    if (geo === g.head) meshes.head = mesh;
    if (geo === g.tail) meshes.tail = mesh;
  }
  const wheels = [];
  const wz = TYPES[type].wz;
  const tw = TYPES[type].tw;
  for (const [x, z] of [[tw, wz], [-tw, wz], [tw, -wz], [-tw, -wz]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36, z);
    const spin = new THREE.Group();
    if (x < 0) spin.scale.x = -1;
    const t = new THREE.Mesh(g.tire, m.tire);
    t.castShadow = true;
    spin.add(t, new THREE.Mesh(g.rim, m.rim));
    const br = new THREE.Mesh(type === 'coupe' || type === 'convertible' ? g.brakeRed : g.brakeGrey, m.brake);
    if (x < 0) br.scale.x = -1;
    pivot.add(spin, br);
    root.add(pivot);
    wheels.push({ pivot, spin, front: z > 0 });
  }
  const lodWheels = new THREE.Mesh(g.lodWheels, m.tire);
  lodWheels.visible = false;
  root.add(lodWheels);
  const sh = new THREE.Mesh(g.shadow, m.shadow);
  sh.position.y = 0.03;
  sh.renderOrder = 1;
  root.add(sh);
  const detail = body.children.filter((c) => c.material === m.chrome || c.material === m.plate || c.material === m.interior);
  return { root, body, wheels, paint, meshes, type, color, lodWheels, detail, near: true };
}

/** Distance LOD: far cars drop wheel/brake/trim detail meshes to save draw calls. */
/** Distance (m) inside which cars get their full wheels and trim; the Low preset pulls it in. */
export const carLOD = { near: 70 };
export function setCarLOD(car, dist) {
  if (car.noLod) return;
  const near = dist < carLOD.near;
  if (near === car.near) return;
  car.near = near;
  for (const w of car.wheels) w.pivot.visible = near;
  car.lodWheels.visible = !near;
  for (const d of car.detail) d.visible = near;
}

/* =========================================================
   Vehicle — arcade physics in the XZ plane. Used by every
   driveable car (player-driven, parked, or knocked out of traffic).
   ========================================================= */
export const OFFS = [-1.5, 0, 1.5];
const GEARS = [0, 9, 18, 28, 40, 54, 200];
const PARKED = { throttle: 0, brake: 0, steer: 0, handbrake: true, nitro: false };
const DARK_LIGHT = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });

export class Vehicle {
  constructor(scene, world, fx, type, color, mesh = null) {
    this.world = world;
    this.fx = fx;
    this.type = type;
    this.def = TYPES[type];
    this.car = mesh || buildCarMesh(type, color);
    if (!this.car.root.parent) scene.add(this.car.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.yaw = 0;
    this.angVel = 0;
    this.steer = 0;
    this.steerIn = 0;
    this.nitro = 1;
    this.pitch = 0;
    this.roll = 0;
    this.vfPrev = 0;
    this.wheelSpin = 0;
    this.impact = 0;
    this.speed = 0;
    this.vf = 0;
    this.vl = 0;
    this.slip = 0;
    this.skid = 0;
    this.gear = 1;
    this.rpm = 0;
    this.nitroOn = false;
    this.braking = false;
    this.driven = false;
    this.locked = false;
    this.asleep = false;
    this.ownLights = null;
    // Damage: hp -> smoking -> on fire (fuse) -> explodes into a wreck
    this.hp = this.def.hp;
    this.fuse = 0;
    this.burnT = 0;
    this.wrecked = false;
    this.hy = 0;
    this.hvy = 0;
  }

  get label() {
    return this.wrecked ? `Burnt-out ${this.def.label}` : this.def.label;
  }

  place(x, z, yaw, vel = null, y = null) {
    this.pos.set(x, y ?? this.world.height(x, z), z);
    this.yaw = yaw;
    if (vel) this.vel.copy(vel);
    else this.vel.set(0, 0);
    this.angVel = 0;
    this.steer = 0;
    this.steerIn = 0;
    this.asleep = false;
    this.applyVisuals(0, 0);
  }

  /** Give this vehicle its own light materials so brake lights work. */
  setDriven(on) {
    this.driven = on;
    this.asleep = false;
    if (this.wrecked) return;
    const mm = this.car.meshes;
    if (on && !this.ownLights) {
      this.ownLights = { head: mm.head.material.clone(), tail: mm.tail.material.clone() };
      mm.head.material = this.ownLights.head;
      mm.tail.material = this.ownLights.tail;
    } else if (!on && this.ownLights) {
      const m = mats();
      mm.head.material = m.head;
      mm.tail.material = m.tail;
      this.ownLights = null;
    }
  }

  local(x, z) {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    return { x: this.pos.x + x * c + z * s, z: this.pos.z - x * s + z * c };
  }

  /** Bullets, crashes and blasts all land here. */
  damage(amount) {
    if (this.wrecked || amount <= 0) return;
    this.hp -= amount;
    this.asleep = false;
    if (this.hp <= 0 && this.fuse <= 0) {
      this.hp = 0;
      this.fuse = 3 + Math.random() * 2.5;
      if (hooks.burning) hooks.burning(this);
    }
  }

  /** Launch upward (explosions). */
  pop(vy) {
    this.hvy = Math.max(this.hvy, vy);
    this.asleep = false;
  }

  wreck() {
    this.wrecked = true;
    this.fuse = 0;
    this.burnT = 14;
    this.setDriven(false);
    const c = this.car;
    c.paint.color.setHex(0x1d1b1a);
    c.paint.metalness = 0.2;
    c.paint.roughness = 0.95;
    c.paint.clearcoat = 0;
    c.meshes.head.material = DARK_LIGHT;
    c.meshes.tail.material = DARK_LIGHT;
    for (const w of c.wheels) if (w.spin.children[0]) w.spin.children[0].visible = false;
    this.ownLights = null;
  }

  updateDamage(dt) {
    const d = this.def;
    if (this.hp < d.hp * 0.45 && !this.wrecked) {
      const p = this.local(0, d.hl * 0.7);
      const dark = this.hp < d.hp * 0.2;
      if (Math.random() < (dark ? 0.6 : 0.3)) this.fx.engineSmoke(p.x, this.pos.y + d.h * 0.6, p.z, dark);
    }
    if (this.fuse > 0) {
      const p = this.local(0, d.hl * 0.6);
      this.fx.burn(p.x, this.pos.y + d.h * 0.55, p.z, 1);
      this.fuse -= dt;
      if (this.fuse <= 0) {
        this.wreck();
        if (hooks.explode) hooks.explode(this.pos.x, this.pos.y, this.pos.z, Math.min(1.6, 0.8 + d.mass * 0.15), this);
      }
    }
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.fx.burn(this.pos.x, this.pos.y + d.h * 0.5, this.pos.z, Math.min(1, this.burnT / 6));
    }
  }

  update(dt, inp, night) {
    if (this.fuse > 0 || this.burnT > 0 || this.hp < this.def.hp * 0.45) this.updateDamage(dt);
    if (!this.driven || this.wrecked) {
      if (this.asleep) return;
      inp = PARKED;
    }
    const d = this.def;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const lx = fz;
    const lz = -fx;
    let vf = this.vel.x * fx + this.vel.y * fz;
    let vl = this.vel.x * lx + this.vel.y * lz;
    const lock = this.locked;
    const throttle = lock ? 0 : inp.throttle;
    const brake = lock ? 0 : inp.brake;
    const hand = lock ? true : inp.handbrake;

    this.nitroOn = d.nitro && this.driven && !lock && inp.nitro && this.nitro > 0.02 && throttle > 0 && vf > -1;
    const top = this.nitroOn ? d.top * 1.4 : d.top;
    if (throttle > 0) {
      if (vf < -0.5) vf += 30 * dt;
      else vf += (this.nitroOn ? d.accel * 1.75 : d.accel) * throttle * Math.max(0, 1 - (vf / top) ** 2) * dt;
    }
    this.braking = false;
    // Heavier vehicles brake a little less hard
    const brakeF = 36 / Math.max(1, Math.sqrt(d.mass) * 0.8);
    if (brake > 0) {
      if (vf > 0.5) {
        vf -= brakeF * brake * dt;
        this.braking = true;
      } else vf -= 11 * brake * Math.max(0, 1 + vf / 15) * dt;
    }
    if (!throttle && !brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.5 * dt);
    vf -= vf * 0.04 * dt;
    if (hand) {
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), (this.driven ? 8 : 12) * dt);
      if (Math.abs(vf) > 1) this.braking = true;
    }
    if (this.nitroOn) this.nitro = Math.max(0, this.nitro - dt * 0.28);
    else this.nitro = Math.min(1, this.nitro + dt * 0.05);

    const speed = Math.abs(vf);
    const wb = d.axles[0] - d.axles[d.axles.length - 1];
    // Keys are all-or-nothing: ease the wheel in over ~half a second, let it centre faster
    const want = lock ? 0 : inp.steer;
    const back = Math.abs(want) < Math.abs(this.steerIn) || Math.sign(want) !== Math.sign(this.steerIn);
    const rate = (back ? 4.5 : 2.2) * dt;
    this.steerIn += clamp(want - this.steerIn, -rate, rate);
    // Cap the turn rate by speed: tight when crawling, gentle at speed
    const leng = Math.max(2.7, wb * 0.9);
    const maxYaw = lerp(1.15, 0.5, clamp(speed / 30, 0, 1));
    const maxSteer = Math.min(d.steer, (maxYaw * leng) / Math.max(speed, 1));
    this.steer = this.steerIn * maxSteer;
    const targetYaw = (-this.steer * vf) / leng;
    const drifting = Math.abs(vl) > 4;
    const yawK = hand ? 3.2 : drifting ? 4.5 : 7;
    this.angVel = damp(this.angVel, targetYaw * (hand && this.driven ? 1.45 : drifting ? 1.2 : 1), yawK, dt);
    this.yaw += this.angVel * dt;

    const grip = hand ? (this.driven ? 1.3 : 3) : drifting && throttle > 0 ? 2.6 : drifting ? 4 : d.grip;
    vl *= Math.exp(-grip * dt);
    this.vel.set(fx * vf + lx * vl, fz * vf + lz * vl);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    this.impact = 0;
    const nfx = Math.sin(this.yaw);
    const nfz = Math.cos(this.yaw);
    for (let it = 0; it < 2; it++) {
      for (const off of d.offs) {
        const hit = this.world.collideAt(this.pos.x + nfx * off, this.pos.z + nfz * off, d.rad, this.pos.y);
        if (!hit) continue;
        this.pos.x += hit.px;
        this.pos.z += hit.pz;
        const vn = this.vel.x * hit.nx + this.vel.y * hit.nz;
        if (vn < 0) {
          this.vel.x -= 1.3 * vn * hit.nx;
          this.vel.y -= 1.3 * vn * hit.nz;
          this.vel.multiplyScalar(0.97);
          const cross = nfx * off * hit.nz - nfz * off * hit.nx;
          this.angVel -= (cross * -vn * 0.05) / Math.sqrt(d.mass);
          this.impact = Math.max(this.impact, -vn);
          if (-vn > 4) this.fx.sparks(this.pos.x + nfx * off - hit.nx, this.pos.y + 0.6, this.pos.z + nfz * off - hit.nz, -vn);
        }
      }
    }
    crashDamage(this, this.impact);

    const gy = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y);
    this.hvy -= 22 * dt;
    this.hy = Math.max(0, this.hy + this.hvy * dt);
    if (this.hy === 0) this.hvy = 0;
    this.pos.y = damp(this.pos.y, gy, 16, dt);

    this.vf = vf;
    this.vl = vl;
    this.speed = this.vel.length();
    this.slip = Math.atan2(Math.abs(vl), Math.max(2, Math.abs(vf)));
    const accel = (vf - this.vfPrev) / Math.max(dt, 1e-3);
    this.vfPrev = vf;
    this.pitch = damp(this.pitch, clamp((-accel * 0.0045) / Math.sqrt(d.mass), -0.06, 0.06) + (this.hy > 0 ? -this.hvy * 0.02 : 0), 6, dt);
    // Bikes lean into the turn; four-wheelers roll outward
    if (d.lean) this.roll = damp(this.roll, clamp(-Math.atan((vf * this.angVel) / 9.8), -0.8, 0.8), 8, dt);
    else this.roll = damp(this.roll, clamp(vf * this.angVel * 0.004 * (d.mass > 3 ? 1.4 : 1), -0.07, 0.07), 6, dt);

    let g = 1;
    while (g < GEARS.length - 2 && speed > GEARS[g]) g++;
    this.gear = vf < -0.5 ? -1 : g;
    const r = clamp((speed - GEARS[g - 1]) / (GEARS[g] - GEARS[g - 1]), 0, 1);
    this.rpm = damp(this.rpm, clamp(0.25 + r * 0.75 + (throttle && speed < 2 ? 0.2 : 0), 0, 1), 10, dt);

    this.skid = clamp((Math.abs(vl) - 3) / 6, 0, 1) * clamp(speed / 6, 0, 1);
    if (hand && speed > 6) this.skid = Math.max(this.skid, 0.6);
    this.applyVisuals(dt, night);
    if (!this.driven && this.speed < 0.05 && Math.abs(this.angVel) < 0.01 && this.impact === 0 && this.hy === 0) this.asleep = true;
  }

  applyVisuals(dt, night) {
    const c = this.car;
    const d = this.def;
    c.root.position.copy(this.pos);
    c.root.position.y += this.hy;
    c.root.rotation.y = this.yaw;
    c.body.rotation.x = this.pitch;
    c.body.rotation.z = this.roll;
    this.wheelSpin += (this.vf * dt) / d.wr;
    for (const w of c.wheels) {
      w.spin.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = -this.steer * 1.2;
    }
    if (c.anim) c.anim(this.wheelSpin, this.speed);
    if (this.ownLights) {
      this.ownLights.tail.emissiveIntensity = this.braking ? 8 : lerp(0.6, 3.5, night);
      this.ownLights.head.emissiveIntensity = lerp(0.6, 8, night);
    }
    if (!dt) return;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -fz;
    const rz = fx;
    const wz = -d.axles[d.axles.length - 1];
    const skidId = this.driven ? 0 : 2;
    if (this.skid > 0.15) {
      for (const side of [-1, 1]) {
        const wx = this.pos.x - fx * wz + rx * d.tw * side;
        const wzz = this.pos.z - fz * wz + rz * d.tw * side;
        this.fx.skidmarks.add(skidId + (side < 0 ? 0 : 1), wx, this.pos.y, wzz);
        if (Math.random() < this.skid * 0.9) this.fx.smoke(wx, this.pos.y + 0.3, wzz, this.vel.x * 0.15, this.vel.y * 0.15);
      }
    } else {
      this.fx.skidmarks.lift(skidId);
      this.fx.skidmarks.lift(skidId + 1);
    }
    if (this.nitroOn) {
      for (const side of d.lean ? [0] : [-1, 1]) {
        const ex = this.pos.x - fx * (d.hl + 0.1) + rx * 0.42 * side;
        const ez = this.pos.z - fz * (d.hl + 0.1) + rz * 0.42 * side;
        this.fx.flame(ex, this.pos.y + 0.42, ez, -fx * 6 + this.vel.x, -fz * 6 + this.vel.y);
      }
    }
  }
}

/** Hard knocks dent the vehicle; heavier vehicles shrug off more. */
export function crashDamage(v, impact) {
  if (impact > 9) v.damage(((impact - 9) * 2.2) / Math.sqrt(v.def.mass));
}

/** Mass-weighted collision between two physics vehicles. Returns impact speed. */
export function collideVehicles(a, b) {
  const dx0 = a.pos.x - b.pos.x;
  const dz0 = a.pos.z - b.pos.z;
  const reach = a.def.hl + b.def.hl + 2;
  if (dx0 * dx0 + dz0 * dz0 > reach * reach) return 0;
  const afx = Math.sin(a.yaw);
  const afz = Math.cos(a.yaw);
  const bfx = Math.sin(b.yaw);
  const bfz = Math.cos(b.yaw);
  const rr = a.def.rad + b.def.rad;
  let deep = 0;
  let nx = 0;
  let nz = 0;
  for (const p of a.def.offs) {
    for (const q of b.def.offs) {
      const dx = a.pos.x + afx * p - (b.pos.x + bfx * q);
      const dz = a.pos.z + afz * p - (b.pos.z + bfz * q);
      const d = Math.hypot(dx, dz);
      if (d < rr && rr - d > deep && d > 1e-4) {
        deep = rr - d;
        nx = dx / d;
        nz = dz / d;
      }
    }
  }
  if (deep <= 0) return 0;
  const ma = a.def.mass;
  const mb = b.def.mass;
  const ka = mb / (ma + mb);
  a.pos.x += nx * deep * ka;
  a.pos.z += nz * deep * ka;
  b.pos.x -= nx * deep * (1 - ka);
  b.pos.z -= nz * deep * (1 - ka);
  a.asleep = b.asleep = false;
  const vn = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * nz;
  if (vn >= 0) return 0;
  const j = (-1.3 * vn) / (1 / ma + 1 / mb);
  a.vel.x += (nx * j) / ma;
  a.vel.y += (nz * j) / ma;
  b.vel.x -= (nx * j) / mb;
  b.vel.y -= (nz * j) / mb;
  b.angVel += ((Math.random() - 0.5) * -vn * 0.2) / Math.sqrt(mb);
  crashDamage(a, -vn * 2 * ka);
  crashDamage(b, -vn * 2 * (1 - ka));
  return -vn;
}
