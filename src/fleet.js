import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { merge } from './utils.js';

/*
 * Bigger road vehicles: pickup, box truck, school bus, city bus and motorbike.
 * Each builder returns the same mesh record as car.js buildCarMesh so the
 * physics, traffic and LOD code can treat every vehicle alike.
 */

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const rbox = (w, h, d, x, y, z, r = 0.08, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r).translate(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);

/** Cylinder between two points. */
function rod(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}

function extrude(shape, width, bevel = 0.08) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.75, bevelSegments: 4, curveSegments: 20 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

/**
 * Side silhouette with wheel arches, extruded across the vehicle.
 * pts: outline in (z, y) from the front bottom round the top to the rear.
 */
function sideBody(start, arches, pts, width, base, bevel) {
  const s = new THREE.Shape();
  s.moveTo(start, base);
  for (const [z, r, cy] of arches) {
    s.lineTo(z - r, base);
    s.absarc(z, cy, r, Math.PI, 0, true);
    s.lineTo(z + r, base);
  }
  for (const [z, y] of pts) s.lineTo(z, y);
  s.closePath();
  return extrude(s, width, bevel);
}

/** Glass panel tilted between two (z, y) points, centred on x. */
function pane(w, x, z0, y0, z1, y1, out = 0.02) {
  const len = Math.hypot(z1 - z0, y1 - y0);
  const g = new THREE.BoxGeometry(w, len, 0.03);
  g.rotateX(-Math.atan2(z0 - z1, y1 - y0));
  return g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2 + out);
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let FM = null;
function fleetMats() {
  if (FM) return FM;
  const schoolSign = canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = '#f2b705';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#111';
    g.font = 'bold 66px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SCHOOL BUS', w / 2, h / 2 + 3);
  });
  const dest = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#050505';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb02e';
    g.font = 'bold 44px "Courier New", monospace';
    g.textBaseline = 'middle';
    g.fillText('42', 18, h / 2 + 2);
    g.textAlign = 'center';
    g.fillText('DOWNTOWN', w / 2 + 40, h / 2 + 2);
  });
  const freight = canvasTex(1024, 432, (g, w, h) => {
    g.fillStyle = '#f4f3ef';
    g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, h, w, 0);
    gr.addColorStop(0, '#ff3fa4');
    gr.addColorStop(1, '#38c8ff');
    g.fillStyle = gr;
    g.fillRect(0, h - 70, w, 40);
    g.fillStyle = '#1b2440';
    g.font = 'bold 120px Arial';
    g.textBaseline = 'middle';
    g.fillText('PALM', 260, 150);
    g.font = '600 74px Arial';
    g.fillText('FREIGHT CO.', 262, 262);
    // palm logo
    g.strokeStyle = '#1b2440';
    g.lineWidth = 16;
    g.beginPath();
    g.moveTo(140, 330);
    g.quadraticCurveTo(160, 220, 140, 120);
    g.stroke();
    g.fillStyle = '#2f8f5b';
    for (let i = 0; i < 6; i++) {
      g.save();
      g.translate(140, 120);
      g.rotate(-2.6 + i * 0.75);
      g.beginPath();
      g.ellipse(55, 0, 60, 16, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  });
  FM = {
    white: new THREE.MeshStandardMaterial({ color: 0xf1f0ea, roughness: 0.45, metalness: 0.1 }),
    grey: new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.5, metalness: 0.4 }),
    stop: new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.5 }),
    engine: new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.45, metalness: 0.7 }),
    schoolSign: new THREE.MeshStandardMaterial({ map: schoolSign, roughness: 0.5 }),
    dest: new THREE.MeshStandardMaterial({ map: dest, emissiveMap: dest, emissive: 0xffffff, emissiveIntensity: 1.2 }),
    freight: new THREE.MeshStandardMaterial({ map: freight, roughness: 0.5 }),
  };
  return FM;
}

/* ---------- Common assembly ---------- */
function assemble(type, color, kit, parts, wheelsSpec, opts = {}) {
  const m = kit.mats;
  const def = kit.def;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.08 });
  const meshes = {};
  const detail = [];
  for (const [geo, matKey, isDetail] of parts) {
    if (!geo) continue;
    const mat = matKey === 'paint' ? paint : typeof matKey === 'string' ? m[matKey] || fleetMats()[matKey] : matKey;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    body.add(mesh);
    if (matKey === 'head') meshes.head = mesh;
    if (matKey === 'tail') meshes.tail = mesh;
    if (isDetail) detail.push(mesh);
  }
  const W = kit.wheels;
  const s = def.wr / 0.364;
  const wheels = [];
  const lod = [];
  const wheelParent = opts.wheelsInBody ? body : root;
  for (const { x, z, front, dual, sx = 1, extra } of wheelsSpec) {
    const pivot = new THREE.Group();
    pivot.position.set(x, def.wr, z);
    const spin = new THREE.Group();
    spin.scale.set((x < 0 ? -1 : 1) * sx, s, s);
    const t = new THREE.Mesh(W.tire, m.tire);
    t.castShadow = true;
    spin.add(t, new THREE.Mesh(W.rim, m.rim));
    if (dual) {
      const t2 = new THREE.Mesh(W.tire, m.tire);
      t2.position.x = -0.3;
      t2.castShadow = true;
      const r2 = new THREE.Mesh(W.rim, m.rim);
      r2.position.x = -0.3;
      spin.add(t2, r2);
    }
    const br = new THREE.Mesh(W.brakeGrey, m.brake);
    br.scale.set((x < 0 ? -1 : 1) * sx, s, s);
    pivot.add(spin, br);
    if (extra) for (const e of extra) pivot.add(e);
    wheelParent.add(pivot);
    wheels.push({ pivot, spin, front });
    lod.push(new THREE.CylinderGeometry(def.wr, def.wr, 0.26 * sx * (dual ? 2 : 1), 12).rotateZ(Math.PI / 2).translate(x - (dual ? Math.sign(x) * 0.15 : 0), def.wr, z));
  }
  const lodWheels = new THREE.Mesh(merge(lod), m.tire);
  lodWheels.visible = false;
  wheelParent.add(lodWheels);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(def.hw * 2 + 0.7, def.hl * 2 + 0.8).rotateX(-Math.PI / 2), m.shadow);
  sh.position.y = 0.03;
  sh.renderOrder = 1;
  root.add(sh);
  return { root, body, wheels, paint, meshes, type, color, lodWheels, detail, near: true };
}

function axleWheels(def, frontSteer = true) {
  const out = [];
  def.axles.forEach((z, i) => {
    const front = i === 0 && frontSteer;
    const dual = def.dual && i > 0;
    for (const side of [1, -1]) out.push({ x: side * (def.tw + (dual ? 0.15 : 0)), z, front, dual, sx: def.dual ? 1.05 : 1 });
  });
  return out;
}

/** Half-torus fender flares around a wheel arch, on both sides. */
function arch(z, r, x, cy) {
  return [1, -1].map((side) => new THREE.TorusGeometry(r, 0.045, 6, 18, Math.PI).rotateY(Math.PI / 2).translate(side * x, cy, z));
}

/* =========================================================
   Pickup truck
   ========================================================= */
function pickup(color, kit) {
  const d = kit.def;
  const [fa, ra] = d.axles;
  const body = sideBody(
    -2.72,
    [[ra, 0.5, 0.44], [fa, 0.5, 0.44]],
    [[2.62, 0.6], [2.78, 0.72], [2.78, 1.02], [2.68, 1.18], [1.25, 1.28], [1.15, 1.3], [-0.72, 1.32], [-0.75, 1.3], [-2.72, 1.3], [-2.78, 1.22], [-2.78, 0.62]],
    1.98,
    0.6,
    0.06,
  );
  const gs = new THREE.Shape();
  gs.moveTo(1.12, 1.29);
  gs.lineTo(0.48, 1.9);
  gs.lineTo(-0.55, 1.92);
  gs.lineTo(-0.68, 1.31);
  gs.closePath();
  const glass = extrude(gs, 1.86, 0.04);
  const paint = merge([body, box(1.78, 0.07, 1.12, 0, 1.94, -0.03), box(0.07, 0.6, 0.1, 0.9, 1.6, -0.05), box(0.07, 0.6, 0.1, -0.9, 1.6, -0.05), box(0.22, 0.14, 0.08, 1.08, 1.42, 0.95), box(0.22, 0.14, 0.08, -1.08, 1.42, 0.95)]);
  const flares = [];
  for (const z of [fa, ra]) flares.push(...arch(z, 0.52, 0.99, 0.44));
  const trim = merge([
    box(1.7, 0.02, 1.9, 0, 1.31, -1.74),
    box(0.06, 0.03, 2.0, 0.95, 1.315, -1.74),
    box(0.06, 0.03, 2.0, -0.95, 1.315, -1.74),
    box(1.3, 0.3, 0.05, 0, 0.98, 2.79),
    box(0.12, 0.05, 1.9, 1.02, 0.56, 0.25),
    box(0.12, 0.05, 1.9, -1.02, 0.56, 0.25),
    box(1.94, 0.012, 0.02, 0, 1.0, -2.785),
    box(0.012, 0.66, 0.012, 1.0, 0.98, 0.6),
    box(0.012, 0.66, 0.012, -1.0, 0.98, 0.6),
    ...flares,
  ]);
  const chrome = merge([box(1.94, 0.22, 0.14, 0, 0.72, 2.79), box(1.94, 0.18, 0.14, 0, 0.66, -2.8), ...[0, 1, 2].map((i) => box(1.2, 0.03, 0.03, 0, 0.88 + i * 0.1, 2.81)), box(0.03, 0.02, 0.14, 1.0, 1.15, 0.45), box(0.03, 0.02, 0.14, -1.0, 1.15, 0.45)]);
  const head = merge([box(0.34, 0.15, 0.06, 0.68, 1.04, 2.77), box(0.34, 0.15, 0.06, -0.68, 1.04, 2.77)]);
  const tail = merge([box(0.1, 0.36, 0.06, 0.93, 1.08, -2.78), box(0.1, 0.36, 0.06, -0.93, 1.08, -2.78)]);
  const plate = merge([box(0.52, 0.12, 0.015, 0, 0.72, 2.87), new THREE.BoxGeometry(0.52, 0.12, 0.015).rotateY(Math.PI).translate(0, 0.85, -2.79)]);
  return assemble('pickup', color, kit, [[paint, 'paint'], [glass, 'glass'], [trim, 'trim'], [chrome, 'chrome', true], [head, 'head'], [tail, 'tail'], [plate, 'plate', true]], axleWheels(d));
}

/* =========================================================
   Box truck
   ========================================================= */
function truck(color, kit) {
  const d = kit.def;
  const [fa, ra] = d.axles;
  const cab = sideBody(1.55, [[fa, 0.62, 0.54]], [[3.9, 0.75], [4.0, 0.9], [4.0, 1.75], [3.95, 1.85], [3.62, 2.95], [3.45, 3.05], [1.6, 3.05], [1.55, 2.95]], 2.4, 0.75, 0.08);
  const glass = merge([
    pane(2.1, 0, 3.93, 1.95, 3.64, 2.86),
    box(0.03, 0.72, 1.25, 1.205, 2.42, 2.9),
    box(0.03, 0.72, 1.25, -1.205, 2.42, 2.9),
  ]);
  const flares = arch(fa, 0.64, 1.2, 0.54);
  const trim = merge([
    box(1.1, 0.25, 7.6, 0, 0.78, -0.2),
    box(2.45, 0.35, 0.2, 0, 0.75, 4.02),
    box(1.4, 0.62, 0.05, 0, 1.38, 4.01),
    box(2.2, 0.15, 0.1, 0, 0.6, -4.08),
    box(0.32, 0.45, 0.02, 0.95, 0.52, -2.92),
    box(0.32, 0.45, 0.02, -0.95, 0.52, -2.92),
    box(0.012, 1.6, 0.012, 1.205, 1.95, 2.18),
    box(0.012, 1.6, 0.012, -1.205, 1.95, 2.18),
    box(0.06, 0.06, 0.5, 1.35, 2.45, 3.45),
    box(0.06, 0.06, 0.5, -1.35, 2.45, 3.45),
    box(0.08, 0.42, 0.18, 1.5, 2.35, 3.25),
    box(0.08, 0.42, 0.18, -1.5, 2.35, 3.25),
    box(0.02, 2.4, 0.02, 0, 2.35, -4.05),
    ...flares,
  ]);
  const chrome = merge([
    ...[0, 1, 2, 3].map((i) => box(1.3, 0.035, 0.03, 0, 1.15 + i * 0.14, 4.03)),
    new THREE.CylinderGeometry(0.28, 0.28, 1.1, 16).rotateX(Math.PI / 2).translate(1.0, 0.72, 0.8),
    rod([0.85, 2.0, 1.6], [0.85, 3.3, 1.6], 0.06),
    box(0.04, 0.06, 0.3, 0.35, 1.3, -4.08),
    box(0.04, 0.06, 0.3, -0.35, 1.3, -4.08),
  ]);
  const head = merge([box(0.36, 0.2, 0.05, 0.85, 1.05, 4.02), box(0.36, 0.2, 0.05, -0.85, 1.05, 4.02)]);
  const tail = merge([box(0.12, 0.3, 0.05, 1.08, 1.0, -4.1), box(0.12, 0.3, 0.05, -1.08, 1.0, -4.1), box(1.4, 0.04, 0.04, 0, 3.62, -4.09)]);
  const cargo = rbox(2.5, 2.55, 5.6, 0, 2.355, -1.25, 0.06);
  const decal = merge([new THREE.PlaneGeometry(5.2, 2.2).rotateY(Math.PI / 2).translate(1.256, 2.35, -1.25), new THREE.PlaneGeometry(5.2, 2.2).rotateY(-Math.PI / 2).translate(-1.256, 2.35, -1.25)]);
  const plate = box(0.52, 0.12, 0.015, 0, 0.72, 4.13);
  return assemble('truck', color, kit, [[cab, 'paint'], [glass, 'glass'], [trim, 'trim'], [chrome, 'chrome', true], [head, 'head'], [tail, 'tail'], [cargo, 'white'], [decal, 'freight'], [plate, 'plate', true]], axleWheels(d));
}

/* =========================================================
   School bus (conventional nose)
   ========================================================= */
function schoolbus(color, kit) {
  const d = kit.def;
  const [fa, ra] = d.axles;
  const hood = sideBody(3.7, [[fa, 0.62, 0.54]], [[5.48, 0.72], [5.6, 0.85], [5.6, 1.55], [5.5, 1.72], [3.75, 1.86], [3.7, 1.86]], 2.1, 0.72, 0.1);
  const shell = sideBody(-5.62, [[ra, 0.62, 0.54]], [[3.8, 0.75], [3.82, 1.86], [3.7, 2.95], [3.52, 3.1], [-5.45, 3.1], [-5.62, 2.95]], 2.5, 0.75, 0.08);
  const win = [];
  for (let i = 0; i < 9; i++) {
    const z = 2.75 - i * 0.92;
    for (const s of [1, -1]) if (!(s < 0 && i === 0)) win.push(box(0.03, 0.62, 0.78, s * 1.252, 2.36, z));
  }
  win.push(pane(1.05, 0.56, 3.83, 1.96, 3.71, 2.88), pane(1.05, -0.56, 3.83, 1.96, 3.71, 2.88));
  win.push(box(1.5, 0.6, 0.03, 0, 2.38, -5.636));
  win.push(box(0.03, 1.55, 0.72, -1.252, 1.78, 3.2));
  const flares = [...arch(fa, 0.64, 1.05, 0.54), ...arch(ra, 0.64, 1.25, 0.54)];
  const trim = merge([
    ...[1.18, 1.58, 1.98].flatMap((y) => [box(0.02, 0.08, 9.3, 1.256, y, -0.9), box(0.02, 0.08, 9.3, -1.256, y, -0.9)]),
    box(2.25, 0.3, 0.2, 0, 0.82, 5.66),
    box(2.52, 0.3, 0.15, 0, 0.78, -5.67),
    box(1.1, 0.6, 0.04, 0, 1.16, 5.61),
    box(1.55, 0.02, 0.02, 0, 2.08, -5.64),
    box(0.02, 1.9, 0.02, 0.76, 1.85, -5.64),
    box(0.02, 1.9, 0.02, -0.76, 1.85, -5.64),
    box(0.05, 0.05, 0.7, 1.3, 2.55, 3.95),
    box(0.05, 0.05, 0.7, -1.3, 2.55, 3.95),
    box(0.1, 0.5, 0.22, 1.52, 2.4, 4.25),
    box(0.1, 0.5, 0.22, -1.52, 2.4, 4.25),
    box(0.05, 1.7, 0.03, -1.255, 1.8, 2.83),
    ...flares,
  ]);
  const chrome = merge([...[0, 1, 2, 3, 4].map((i) => box(1.0, 0.03, 0.03, 0, 0.92 + i * 0.12, 5.64)), box(0.03, 0.62, 0.03, 0, 1.16, 5.64)]);
  const heads = [];
  for (const s of [1, -1]) heads.push(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 16).rotateX(Math.PI / 2).translate(s * 0.72, 1.22, 5.6));
  const head = merge(heads);
  const tails = [];
  for (const s of [1, -1]) {
    tails.push(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 14).rotateX(Math.PI / 2).translate(s * 0.95, 1.05, -5.65));
    tails.push(box(0.2, 0.14, 0.05, s * 0.95, 2.98, 3.67), box(0.2, 0.14, 0.05, s * 0.95, 2.98, -5.64));
  }
  const tail = merge(tails);
  const roof = rbox(2.38, 0.05, 9.0, 0, 3.11, -0.86, 0.02);
  const signs = merge([box(1.5, 0.27, 0.04, 0, 3.26, 3.4), new THREE.BoxGeometry(1.5, 0.27, 0.04).rotateY(Math.PI).translate(0, 2.84, -5.64)]);
  const stop = new THREE.CylinderGeometry(0.22, 0.22, 0.02, 8).rotateZ(Math.PI / 2).rotateX(Math.PI / 8).translate(1.29, 2.15, 2.55);
  const plate = new THREE.BoxGeometry(0.52, 0.12, 0.015).rotateY(Math.PI).translate(0, 0.95, -5.66);
  return assemble('schoolbus', color, kit, [[hood, 'paint'], [shell, 'paint'], [merge(win), 'glass'], [trim, 'trim'], [chrome, 'chrome', true], [head, 'head'], [tail, 'tail'], [roof, 'white'], [signs, 'schoolSign'], [stop, 'stop', true], [plate, 'plate', true]], axleWheels(d));
}

/* =========================================================
   City bus (low floor)
   ========================================================= */
function bus(color, kit) {
  const d = kit.def;
  const [fa, ra] = d.axles;
  const shell = sideBody(-6.0, [[ra, 0.64, 0.54], [fa, 0.64, 0.54]], [[5.98, 0.38], [6.05, 0.55], [6.05, 1.05], [6.0, 2.95], [5.85, 3.2], [-5.85, 3.2], [-6.05, 3.0], [-6.05, 0.4]], 2.54, 0.38, 0.09);
  const glass = merge([
    box(0.03, 1.3, 8.6, 1.272, 2.15, -1.05),
    box(0.03, 1.3, 8.6, -1.272, 2.15, -1.05),
    box(0.03, 2.25, 1.15, -1.272, 1.58, 4.95),
    box(0.03, 2.25, 1.2, -1.272, 1.58, 0.85),
    box(0.03, 1.15, 1.2, 1.272, 2.2, 4.95),
    pane(2.36, 0, 6.06, 1.08, 6.02, 2.72),
    box(1.9, 0.75, 0.03, 0, 2.35, -6.06),
  ]);
  const trim = merge([
    ...[-5.35, -3.9, -2.45, -1.0, 0.45, 1.9, 3.25].flatMap((z) => [box(0.035, 1.3, 0.08, 1.274, 2.15, z), box(0.035, 1.3, 0.08, -1.274, 2.15, z)]),
    box(0.035, 2.25, 0.05, -1.274, 1.58, 4.95),
    box(0.035, 2.25, 0.05, -1.274, 1.58, 0.85),
    box(2.5, 0.32, 0.18, 0, 0.55, 6.07),
    box(2.5, 0.32, 0.18, 0, 0.55, -6.07),
    box(1.8, 0.6, 0.03, 0, 1.1, -6.07),
    box(0.05, 0.05, 0.6, 1.35, 2.75, 5.85),
    box(0.05, 0.05, 0.6, -1.35, 2.75, 5.85),
    box(0.1, 0.45, 0.2, 1.48, 2.55, 6.15),
    box(0.1, 0.45, 0.2, -1.48, 2.55, 6.15),
  ]);
  const stripe = merge([box(0.02, 0.16, 11.9, 1.274, 1.12, 0), box(0.02, 0.16, 11.9, -1.274, 1.12, 0), box(2.3, 0.16, 0.02, 0, 1.12, 6.06)]);
  const head = merge([box(0.4, 0.14, 0.05, 0.85, 0.82, 6.06), box(0.4, 0.14, 0.05, -0.85, 0.82, 6.06)]);
  const tail = merge([box(0.14, 0.5, 0.05, 1.05, 1.25, -6.07), box(0.14, 0.5, 0.05, -1.05, 1.25, -6.07)]);
  const ac = rbox(1.6, 0.3, 2.6, 0, 3.34, 0.6, 0.08);
  const dest = box(1.9, 0.28, 0.03, 0, 2.88, 6.04);
  const plate = merge([box(0.52, 0.12, 0.015, 0, 0.55, 6.17), new THREE.BoxGeometry(0.52, 0.12, 0.015).rotateY(Math.PI).translate(0, 0.75, -6.08)]);
  return assemble('bus', color, kit, [[shell, 'paint'], [glass, 'glass'], [trim, 'trim'], [stripe, 'white'], [head, 'head'], [tail, 'tail'], [ac, 'grey'], [dest, 'dest'], [plate, 'plate', true]], axleWheels(d));
}

/* =========================================================
   Motorbike
   ========================================================= */
function bike(color, kit) {
  const d = kit.def;
  const [fa, ra] = d.axles;
  const wr = d.wr;
  const tank = new THREE.SphereGeometry(0.22, 18, 12).scale(0.75, 0.6, 1.25).translate(0, 0.98, 0.18);
  const nose = rbox(0.42, 0.36, 0.42, 0, 1.0, 0.62, 0.12);
  const cowl = rbox(0.26, 0.14, 0.45, 0, 0.98, -0.62, 0.06);
  const paint = merge([tank, nose, cowl, rbox(0.3, 0.2, 0.35, 0, 0.62, 0.35, 0.06)]);
  const seat = rbox(0.28, 0.08, 0.55, 0, 0.93, -0.26, 0.03);
  const screen = new THREE.BoxGeometry(0.3, 0.24, 0.02).rotateX(-0.6).translate(0, 1.24, 0.72);
  const engine = merge([
    rbox(0.34, 0.34, 0.48, 0, 0.55, 0.03, 0.05),
    ...[0, 1, 2].map((i) => box(0.42, 0.02, 0.3, 0, 0.62 + i * 0.06, 0.12)),
    rod([0, 1.08, 0.5], [0, 0.6, -0.22], 0.035),
    rod([0, 1.0, 0.45], [0, 0.4, 0.05], 0.035),
    rod([0.1, wr, ra], [0.1, 0.55, -0.15], 0.03),
    rod([-0.1, wr, ra], [-0.1, 0.55, -0.15], 0.03),
    rod([0, 0.9, -0.35], [0, 0.6, -0.5], 0.025),
  ]);
  const chrome = merge([rod([-0.14, 0.42, 0.15], [-0.18, 0.55, -0.6], 0.035), new THREE.CylinderGeometry(0.065, 0.055, 0.42, 12).rotateX(Math.PI / 2).rotateX(-0.15).translate(-0.19, 0.6, -0.78)]);
  const head = box(0.18, 0.09, 0.05, 0, 0.98, 0.84);
  const tail = box(0.14, 0.05, 0.03, 0, 0.98, -0.86);
  // Fork and bars turn with the front wheel (pivot is at the axle)
  const fm = kit.mats;
  const fork = new THREE.Mesh(merge([rod([0.08, 0, 0], [0.08, 0.72, -0.2], 0.025), rod([-0.08, 0, 0], [-0.08, 0.72, -0.2], 0.025)]), fm.chrome);
  const bars = new THREE.Mesh(merge([rod([-0.33, 0.8, -0.26], [0.33, 0.8, -0.26], 0.018), box(0.08, 0.04, 0.04, 0.33, 0.8, -0.26), box(0.08, 0.04, 0.04, -0.33, 0.8, -0.26)]), fm.trim);
  fork.castShadow = bars.castShadow = true;
  const wheels = [
    { x: 0.0001, z: fa, front: true, sx: 0.6, extra: [fork, bars] },
    { x: 0.0001, z: ra, front: false, sx: 0.75 },
  ];
  return assemble('bike', color, kit, [[paint, 'paint'], [seat, 'trim'], [screen, 'glass'], [engine, 'engine'], [chrome, 'chrome', true], [head, 'head'], [tail, 'tail']], wheels, { wheelsInBody: true });
}

const BUILDERS = { pickup, truck, schoolbus, bus, bike };
export function buildFleetMesh(type, color, kit) {
  return BUILDERS[type](color, kit);
}
