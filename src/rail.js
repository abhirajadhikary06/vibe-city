import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { HALF, lineAt, N, CELL } from './world.js';
import { merge, clamp, damp, lerp } from './utils.js';
import { crashDamage } from './car.js';

/*
 * Rail transport: a tram running down the central avenue under overhead wires,
 * and a commuter train on a U-shaped line around the edge of the city.
 * Both shuttle between stops on their own, and the player can take the controls.
 */

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const rbox = (w, h, d, x, y, z, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, r).translate(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);
function rod(a, b, r, seg = 6) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}

/* ---------- Track: a polyline resampled every STEP metres ---------- */
const STEP = 0.5;
class Track {
  constructor(corners, radius) {
    // Round each interior corner with a quadratic curve
    const pts = [corners[0]];
    for (let i = 1; i < corners.length - 1; i++) {
      const [a, p, b] = [corners[i - 1], corners[i], corners[i + 1]];
      const la = Math.hypot(p[0] - a[0], p[1] - a[1]);
      const lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const r = Math.min(radius, la / 2, lb / 2);
      const s = [p[0] - ((p[0] - a[0]) / la) * r, p[1] - ((p[1] - a[1]) / la) * r];
      const e = [p[0] + ((b[0] - p[0]) / lb) * r, p[1] + ((b[1] - p[1]) / lb) * r];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const u = 1 - t;
        pts.push([u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]]);
      }
    }
    pts.push(corners[corners.length - 1]);
    this.x = [];
    this.z = [];
    let carry = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      let d = carry;
      while (d < l) {
        this.x.push(ax + ((bx - ax) * d) / l);
        this.z.push(az + ((bz - az) * d) / l);
        d += STEP;
      }
      carry = d - l;
    }
    const last = pts[pts.length - 1];
    this.x.push(last[0]);
    this.z.push(last[1]);
    this.len = (this.x.length - 1) * STEP;
  }
  at(s, out) {
    const f = clamp(s, 0, this.len) / STEP;
    const i = Math.min(Math.floor(f), this.x.length - 2);
    const t = f - i;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    out.z = this.z[i] + (this.z[i + 1] - this.z[i]) * t;
    out.tx = this.x[i + 1] - this.x[i];
    out.tz = this.z[i + 1] - this.z[i];
    return out;
  }
  nearest(x, z) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.x.length; i++) {
      const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best * STEP;
  }
}

/** Boxes laid along the track every `step` metres (rails, ballast, sleepers). */
function alongTrack(track, step, make) {
  const out = [];
  const p = {};
  const q = {};
  for (let s = 0; s < track.len - 1e-3; s += step) {
    const e = Math.min(track.len, s + step);
    track.at(s, p);
    track.at(e, q);
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const yaw = Math.atan2(q.x - p.x, q.z - p.z);
    for (const g of make(len)) {
      g.rotateY(yaw);
      g.translate((p.x + q.x) / 2, 0, (p.z + q.z) / 2);
      out.push(g);
    }
  }
  return out;
}

function signTexture(text, sub) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#123a6b';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ffffff';
  g.font = 'bold 58px Arial';
  g.textAlign = 'center';
  g.fillText(text, 256, 66);
  g.font = '600 26px Arial';
  g.fillStyle = '#9fd8ff';
  g.fillText(sub, 256, 106);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- Rolling stock ---------- */
const KINDS = {
  tram: { label: 'Tram', L: 9.6, gap: 0.6, cars: 3, hw: 1.2, floor: 0.35, roof: 3.35, base: 0.3, top: 14, accel: 1.3, dec: 1.8, y: 0, seatY: -0.1, camDist: 9, camH: 3.5, engine: 0.7, color: 0xd8336b, look: 22 },
  train: { label: 'Commuter Train', L: 17, gap: 0.9, cars: 3, hw: 1.45, floor: 1.15, roof: 4.05, base: 0.75, top: 24, accel: 0.9, dec: 1.1, y: 0.3, seatY: 0.62, camDist: 16, camH: 6, engine: 0.45, color: 0x24c3d6, look: 60 },
};

let RM = null;
function railMats() {
  if (RM) return RM;
  RM = {
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.35, metalness: 0.15 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.3, metalness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0c1218, metalness: 0.9, roughness: 0.06 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.6, metalness: 0.4 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8b8e93, roughness: 0.35, metalness: 0.9 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 1 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a2a, emissiveIntensity: 0.6 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.9 }),
    ballast: new THREE.MeshStandardMaterial({ color: 0x8a7f72, map: T.asphalt(false).map, roughness: 1 }),
    sleeper: new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.9 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.6 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.5, metalness: 0.6 }),
  };
  return RM;
}

/** One rail car. cabF / cabB put a sloped driver's cab on the front / back end. */
function buildRailCar(kind, cabF, cabB, paint, middle) {
  const K = KINDS[kind];
  const M = railMats();
  const { L, hw, base, roof, floor } = K;
  const W = hw * 2;
  const h2 = L / 2;
  const nose = kind === 'tram' ? 0.6 : 1.4;
  const s = new THREE.Shape();
  const lo = base;
  s.moveTo(-h2 + (cabB ? nose * 0.5 : 0), lo);
  s.lineTo(h2 - (cabF ? nose * 0.5 : 0), lo);
  if (cabF) {
    s.lineTo(h2, lo + 0.45);
    s.lineTo(h2 + 0.05, floor + 0.9);
    s.quadraticCurveTo(h2 - nose * 0.2, roof - 0.3, h2 - nose, roof);
  } else {
    s.lineTo(h2, lo);
    s.lineTo(h2, roof);
  }
  if (cabB) {
    s.lineTo(-h2 + nose, roof);
    s.quadraticCurveTo(-h2 + nose * 0.2, roof - 0.3, -h2 - 0.05, floor + 0.9);
    s.lineTo(-h2, lo + 0.45);
  } else {
    s.lineTo(-h2, roof);
    s.lineTo(-h2, lo);
  }
  s.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: W - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 12 });
  bodyGeo.translate(0, 0, -(W - 0.16) / 2);
  bodyGeo.rotateY(-Math.PI / 2);

  const glass = [];
  const dark = [];
  const winLo = floor + 0.85;
  const winHi = roof - 0.55;
  const winY = (winLo + winHi) / 2;
  const winH = winHi - winLo;
  const span = L - (cabF ? nose + 1.2 : 0.6) - (cabB ? nose + 1.2 : 0.6);
  const zc = ((cabB ? nose + 1.2 : 0.6) - (cabF ? nose + 1.2 : 0.6)) / 2;
  const doors = kind === 'tram' ? [-L / 4, L / 4] : [-L / 3, L / 3];
  for (const sx of [1, -1]) {
    glass.push(box(0.03, winH, span, sx * (hw + 0.005), winY, zc));
    const nm = Math.floor(span / 1.4);
    for (let i = 0; i <= nm; i++) dark.push(box(0.035, winH, 0.07, sx * (hw + 0.008), winY, zc - span / 2 + (i * span) / nm));
    for (const dz of doors) {
      glass.push(box(0.03, roof - 0.5 - (floor + 0.05), 1.3, sx * (hw + 0.012), (roof - 0.5 + floor + 0.05) / 2, dz));
      dark.push(box(0.036, roof - 0.5 - floor, 0.04, sx * (hw + 0.014), (roof - 0.5 + floor) / 2, dz));
    }
    if (cabF) glass.push(box(0.03, winH * 0.8, 0.7, sx * (hw + 0.005), winY, h2 - nose - 0.4));
    if (cabB) glass.push(box(0.03, winH * 0.8, 0.7, sx * (hw + 0.005), winY, -h2 + nose + 0.4));
  }
  const head = [];
  const tail = [];
  const cabEnd = (sign) => {
    // windscreen following the nose curve
    const z0 = sign * (h2 - 0.02);
    const z1 = sign * (h2 - nose * 0.85);
    const y0 = floor + 1.0;
    const y1 = roof - 0.15;
    const len = Math.hypot(z1 - z0, y1 - y0);
    const g = new THREE.BoxGeometry(W - 0.5, len, 0.04);
    g.rotateX(sign * -Math.atan2(Math.abs(z0 - z1), y1 - y0));
    g.translate(0, (y0 + y1) / 2, (z0 + z1) / 2 + sign * 0.06);
    glass.push(g);
    for (const sx of [1, -1]) {
      head.push(box(0.32, 0.14, 0.06, sx * (hw - 0.4), lo + 0.75, sign * (h2 + 0.03)));
      tail.push(box(0.14, 0.14, 0.06, sx * (hw - 0.12), lo + 0.75, sign * (h2 + 0.02)));
    }
    dark.push(box(W - 0.3, 0.25, 0.15, 0, lo + 0.15, sign * (h2 - 0.05)));
  };
  if (cabF) cabEnd(1);
  if (cabB) cabEnd(-1);
  // Bogies and wheels
  const bz = h2 - (kind === 'tram' ? 1.7 : 2.6);
  const wheels = [];
  for (const z of [bz, -bz]) {
    dark.push(box(W - 0.5, 0.35, 2.6, 0, kind === 'tram' ? 0.32 : 0.55, z));
    for (const dz of [-0.85, 0.85]) {
      for (const sx of [1, -1]) wheels.push(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16).rotateZ(Math.PI / 2).translate(sx * 0.72, 0.42 - (kind === 'tram' ? 0.12 : 0), z + dz));
    }
  }
  if (kind === 'train') {
    dark.push(box(W - 0.7, 0.5, L * 0.35, 0, 0.75, 0));
  }
  // Gangway / articulation bellows behind this car
  if (!cabB) dark.push(box(W - 0.35, roof - floor - 0.3, K.gap + 0.1, 0, (roof + floor) / 2, -h2 - K.gap / 2));
  // Roof gear
  const roofGeo = [];
  if (kind === 'train') roofGeo.push(rbox(1.6, 0.32, 2.4, 0, roof + 0.15, L * 0.22), rbox(1.6, 0.32, 2.4, 0, roof + 0.15, -L * 0.22));
  else roofGeo.push(rbox(1.5, 0.35, 3.2, 0, roof + 0.17, 0));
  const panto = [];
  if (kind === 'tram' && middle) {
    // Pantograph reaching up to the contact wire at 6 m
    const py = roof + 0.35;
    panto.push(rod([0.45, py, -0.6], [0.0, py + 1.25, 0.25], 0.03), rod([-0.45, py, -0.6], [0.0, py + 1.25, 0.25], 0.03), rod([0, py + 1.25, 0.25], [0.0, 5.95, -0.2], 0.03), box(1.5, 0.05, 0.08, 0, 5.98, -0.2));
  }
  // Lower livery stripe
  const stripe = [];
  for (const sx of [1, -1]) stripe.push(box(0.02, 0.32, L - (cabF ? 0.4 : 0) - (cabB ? 0.4 : 0), sx * (hw + 0.008), floor + 0.45, ((cabB ? 0.4 : 0) - (cabF ? 0.4 : 0)) / 2));

  const root = new THREE.Group();
  const add = (geo, mat) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    root.add(m);
    return m;
  };
  add(bodyGeo, kind === 'train' ? M.silver : M.white);
  add(merge(glass), M.glass);
  add(merge([...dark, ...roofGeo]), M.dark);
  add(merge(wheels), M.steel);
  add(merge(stripe), paint);
  if (panto.length) add(merge(panto), M.wire);
  const meshes = {};
  if (head.length) {
    meshes.head = add(merge(head), M.head);
    meshes.tail = add(merge(tail), M.tail);
  }
  return { root, meshes };
}

/* =========================================================
   Consist: a set of rail cars that moves as one along a track.
   Implements the same interface as a road Vehicle so the player
   can drive it and the camera/HUD can follow it.
   ========================================================= */
class Consist {
  constructor(scene, track, kind, stops, fx) {
    const K = KINDS[kind];
    this.K = K;
    this.kind = kind;
    this.rail = true;
    this.type = kind;
    this.track = track;
    this.fx = fx;
    this.paint = new THREE.MeshStandardMaterial({ color: K.color, roughness: 0.4, metalness: 0.3 });
    this.cars = [];
    for (let i = 0; i < K.cars; i++) {
      const c = buildRailCar(kind, i === 0, i === K.cars - 1, this.paint, i === 1);
      scene.add(c.root);
      this.cars.push({ ...c, x: 0, z: 0, yaw: 0 });
    }
    this.car = { root: this.cars[0].root, meshes: this.cars[0].meshes };
    this.pitch = 0;
    this.roll = 0;
    this.span = (K.cars - 1) * (K.L + K.gap);
    this.sMin = this.span + K.L / 2 + 1;
    this.sMax = track.len - K.L / 2 - 1;
    // Stops are stored as lead-car positions
    this.stops = [this.sMin, ...stops.map((c) => c + this.span / 2), this.sMax].filter((s) => s >= this.sMin && s <= this.sMax).sort((a, b) => a - b);
    this.s = this.stops[Math.floor(this.stops.length / 2)];
    this.v = 0;
    this.dir = 1;
    this.state = 'dwell';
    this.dwell = 3 + Math.random() * 4;
    this.blockedT = 0;
    this.ignoreT = 0;
    this.hornT = 0;
    this.def = { label: K.label, seatX: 0, seatZ: K.L / 2 - (kind === 'tram' ? 1.2 : 1.9), seatY: K.seatY, hw: K.hw, hl: K.L / 2, h: K.roof, camDist: K.camDist, camH: K.camH, headZ: K.L / 2, headY: K.base + 0.75, mass: 60, engine: K.engine, offs: [0], rad: K.hw, top: K.top };
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.yaw = 0;
    this.steer = 0;
    this.impact = 0;
    this.nitro = 0;
    this.nitroOn = false;
    this.slip = 0;
    this.skid = 0;
    this.rpm = 0;
    this.gear = 1;
    this.braking = false;
    this.driven = false;
    this.locked = false;
    this.asleep = false;
    this.wrecked = false;
    this.tmp = {};
    this.place();
  }
  get label() {
    return this.K.label;
  }
  get speed() {
    return Math.abs(this.v);
  }
  get vf() {
    return this.v;
  }
  local(x, z) {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    return { x: this.pos.x + x * c + z * s, z: this.pos.z - x * s + z * c };
  }
  setDriven(on) {
    this.driven = on;
    if (on) this.state = 'run';
  }
  damage() {}

  /** Position every car from the lead car's track distance. */
  place() {
    const K = this.K;
    const a = this.tmp;
    const b = {};
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      const sc = this.s - i * (K.L + K.gap);
      this.track.at(sc + K.L * 0.35, a);
      const fx = a.x;
      const fz = a.z;
      this.track.at(sc - K.L * 0.35, b);
      c.x = (fx + b.x) / 2;
      c.z = (fz + b.z) / 2;
      c.yaw = Math.atan2(fx - b.x, fz - b.z);
      c.root.position.set(c.x, K.y, c.z);
      c.root.rotation.y = c.yaw;
    }
    const c0 = this.cars[0];
    this.pos.set(c0.x, K.y, c0.z);
    this.yaw = c0.yaw;
    this.vel.set(Math.sin(this.yaw) * this.v, Math.cos(this.yaw) * this.v);
  }

  /** Nearest thing on the track ahead in the direction of travel. */
  scanAhead(objs, dir) {
    const K = this.K;
    const front = dir > 0 ? this.s + K.L / 2 : this.s - this.span - K.L / 2;
    const p = this.track.at(front, {});
    const tl = Math.hypot(p.tx, p.tz) || 1;
    const tx = (p.tx / tl) * dir;
    const tz = (p.tz / tl) * dir;
    let best = Infinity;
    for (const o of objs) {
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      const ahead = dx * tx + dz * tz;
      if (ahead < -1 || ahead > K.look) continue;
      if (Math.abs(dx * tz - dz * tx) < K.hw + (o.r || 1.2)) best = Math.min(best, ahead);
    }
    return best;
  }

  update(dt, inp, night, ctx = null) {
    const K = this.K;
    this.impact = 0;
    if (this.driven && inp) {
      const th = this.locked ? 0 : inp.throttle;
      const br = this.locked ? 0 : inp.brake;
      this.braking = false;
      if (th > 0) this.v += (this.v < -0.3 ? K.dec * 2 : K.accel * 1.6 * (1 - Math.max(0, this.v) / K.top)) * th * dt;
      if (br > 0) {
        if (this.v > 0.3) {
          this.v -= K.dec * 2 * br * dt;
          this.braking = true;
        } else this.v = Math.max(-5, this.v - K.accel * br * dt);
      }
      if (inp.handbrake) this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), K.dec * 3 * dt);
      if (!th && !br) this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 0.15 * dt);
    } else {
      this.updateAI(dt, ctx);
    }
    // Buffer stops at the ends of the line
    let ns = this.s + this.v * dt;
    if (ns > this.sMax || ns < this.sMin) {
      if (Math.abs(this.v) > 2) {
        this.impact = Math.abs(this.v);
        const p = this.track.at(ns > this.sMax ? this.track.len : 0, {});
        this.fx.sparks(p.x, K.floor + 0.5, p.z, this.impact);
      }
      ns = clamp(ns, this.sMin, this.sMax);
      this.v = 0;
    }
    this.s = ns;
    this.rpm = damp(this.rpm, clamp(0.2 + Math.abs(this.v) / K.top, 0, 1), 6, dt);
    this.gear = this.v < -0.3 ? -1 : 1;
    this.place();
    const lightOn = lerp(0.6, 6, night);
    for (const c of [this.cars[0], this.cars[this.cars.length - 1]]) {
      if (c.meshes.head) c.meshes.head.material.emissiveIntensity = lightOn;
    }
  }

  updateAI(dt, ctx) {
    const K = this.K;
    this.braking = false;
    if (this.state === 'dwell') {
      this.v = damp(this.v, 0, 6, dt);
      this.dwell -= dt;
      if (this.dwell <= 0) {
        this.state = 'run';
        if ((this.dir > 0 && this.s >= this.sMax - 0.5) || (this.dir < 0 && this.s <= this.sMin + 0.5)) this.dir *= -1;
        if (ctx && ctx.near(this.pos) < 70) this.kind === 'tram' ? ctx.audio.tramBell(ctx.near(this.pos)) : ctx.audio.trainHorn(ctx.near(this.pos));
      }
      return;
    }
    // Next stop in the direction of travel
    let target = this.dir > 0 ? this.sMax : this.sMin;
    for (const st of this.dir > 0 ? this.stops : [...this.stops].reverse()) {
      if ((st - this.s) * this.dir > 0.4) {
        target = st;
        break;
      }
    }
    const dist = Math.abs(target - this.s);
    let want = Math.min(K.top, Math.sqrt(2 * K.dec * 0.85 * dist));
    // Obstacles on the line
    this.ignoreT -= dt;
    this.hornT -= dt;
    if (ctx && this.ignoreT <= 0) {
      const ahead = this.scanAhead(ctx.objs, this.dir);
      if (ahead < K.look) {
        if (this.kind === 'tram') want = Math.min(want, Math.max(0, (ahead - 3) * 0.7));
        else want = Math.min(want, Math.max(0, ahead - 6) * 0.5);
        if (this.hornT <= 0 && ctx.near(this.pos) < 90) {
          this.kind === 'tram' ? ctx.audio.tramBell(ctx.near(this.pos)) : ctx.audio.trainHorn(ctx.near(this.pos));
          this.hornT = 3.5;
        }
        if (Math.abs(this.v) < 0.3) this.blockedT += dt;
      } else this.blockedT = 0;
      // Waited long enough: nudge through
      if (this.blockedT > 6) {
        this.ignoreT = 4;
        this.blockedT = 0;
      }
    }
    const sp = this.v * this.dir;
    if (sp < want) this.v += this.dir * Math.min(want - sp, K.accel * dt);
    else {
      this.v -= this.dir * Math.min(sp - want, K.dec * 1.6 * dt);
      this.braking = true;
    }
    if (dist < 0.4 && Math.abs(this.v) < 0.6) {
      this.v = 0;
      this.state = 'dwell';
      this.dwell = this.kind === 'tram' ? 7 : 10;
    }
  }

  /** Each car as a capsule: segment endpoints + radius. */
  capsules(out) {
    const K = this.K;
    for (const c of this.cars) {
      const hl = K.L / 2 - K.hw;
      const fx = Math.sin(c.yaw) * hl;
      const fz = Math.cos(c.yaw) * hl;
      out.push({ ax: c.x - fx, az: c.z - fz, bx: c.x + fx, bz: c.z + fz, r: K.hw, consist: this });
    }
  }
}

function closestOnSeg(c, x, z) {
  const dx = c.bx - c.ax;
  const dz = c.bz - c.az;
  const t = clamp(((x - c.ax) * dx + (z - c.az) * dz) / (dx * dx + dz * dz), 0, 1);
  return { x: c.ax + dx * t, z: c.az + dz * t };
}

/* =========================================================
   Rail network
   ========================================================= */
export class Rail {
  constructor(scene, world, fx) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    const M = railMats();
    const statics = [];

    /* ---- Tram line: single track down the middle of the central avenue ---- */
    const tx = lineAt(N / 2);
    const tEnd = HALF - 10;
    this.tramTrack = new Track([[tx, -tEnd], [tx, tEnd]], 1);
    const tramRails = alongTrack(this.tramTrack, 8, (len) => [box(0.09, 0.025, len, 0.72, 0.012, 0), box(0.09, 0.025, len, -0.72, 0.012, 0)]);
    const tramGroove = alongTrack(this.tramTrack, 8, (len) => [box(0.035, 0.03, len, 0.77, 0.013, 0), box(0.035, 0.03, len, -0.77, 0.013, 0)]);
    statics.push(new THREE.Mesh(merge(tramRails), M.steel), new THREE.Mesh(merge(tramGroove), M.dark));
    // Overhead wire: poles on both kerbs, span wires, contact wire
    const wire = [];
    for (let k = 0; k < N; k++) {
      for (const f of [18.5, 55.5]) {
        const z = lineAt(k) + f;
        if (Math.abs(z) > tEnd) continue;
        for (const sx of [1, -1]) {
          wire.push(new THREE.CylinderGeometry(0.09, 0.13, 7.2, 8).translate(tx + sx * 7.7, 0.18 + 3.6, z));
          this.world.addCircle(tx + sx * 7.7, z, 0.16);
        }
        wire.push(box(15.4, 0.03, 0.03, tx, 6.75, z), rod([tx, 6.75, z], [tx, 6.02, z], 0.012, 4));
      }
    }
    wire.push(...alongTrack(this.tramTrack, 20, (len) => [box(0.025, 0.025, len, 0, 6.0, 0)]));
    statics.push(new THREE.Mesh(merge(wire), M.wire));
    const tramStops = [];
    for (const k of [0, 2, 4, 6, 7]) tramStops.push(lineAt(k) + CELL / 2 + tEnd);
    this.tram = new Consist(scene, this.tramTrack, 'tram', tramStops, fx);

    /* ---- Commuter line: U-shape round the west, north and south edges ---- */
    const R = HALF + 18;
    const east = HALF - 4;
    this.trainTrack = new Track([[east, -R], [-R, -R], [-R, R], [east, R]], 16);
    const tr = this.trainTrack;
    const ballast = alongTrack(tr, 3, (len) => [box(3.4, 0.18, len + 0.05, 0, 0.03, 0)]);
    const sleepers = alongTrack(tr, 0.65, () => [box(2.5, 0.1, 0.24, 0, 0.15, 0)]);
    const rails = alongTrack(tr, 3, (len) => [box(0.075, 0.13, len + 0.02, 0.7175, 0.25, 0), box(0.075, 0.13, len + 0.02, -0.7175, 0.25, 0)]);
    statics.push(new THREE.Mesh(merge(ballast), M.ballast), new THREE.Mesh(merge(sleepers), M.sleeper), new THREE.Mesh(merge(rails), M.steel));
    // Buffer stops
    for (const s of [0, tr.len]) {
      const p = tr.at(s, {});
      const yaw = Math.atan2(p.tx, p.tz);
      const g = merge([box(2.6, 1.1, 0.6, 0, 0.75, 0), box(0.5, 0.5, 0.3, 0.7, 1.1, s > 0 ? -0.4 : 0.4), box(0.5, 0.5, 0.3, -0.7, 1.1, s > 0 ? -0.4 : 0.4)]);
      g.rotateY(yaw).translate(p.x, 0, p.z);
      statics.push(new THREE.Mesh(g, M.yellow));
    }
    // Stations with platforms, shelters and name boards
    const stations = [
      ['BAYSIDE NORTH', east - 30, -R, 0, 1],
      ['NORTH PARK', -110, -R, 0, 1],
      ['WEST END', -R, 0, 1, 0],
      ['SOUTH PARK', -110, R, 0, -1],
      ['BAYSIDE SOUTH', east - 30, R, 0, -1],
    ];
    const plat = [];
    const edge = [];
    const shelter = [];
    const trainStops = [];
    for (const [name, x, z, ix, iz] of stations) {
      trainStops.push(tr.nearest(x, z));
      const alongX = iz !== 0;
      const pl = 52;
      const pw = 4.6;
      const off = KINDS.train.hw + 0.25 + pw / 2;
      const cx = x + ix * off;
      const cz = z + iz * off;
      const hx = alongX ? pl / 2 : pw / 2;
      const hz = alongX ? pw / 2 : pl / 2;
      plat.push(box(hx * 2, 1.1, hz * 2, cx, 0.55, cz));
      const ex = x + ix * (off - pw / 2 + 0.3);
      const ez = z + iz * (off - pw / 2 + 0.3);
      edge.push(box(alongX ? pl : 0.25, 0.01, alongX ? 0.25 : pl, ex, 1.105, ez));
      this.world.addPad(cx - hx, cx + hx, cz - hz, cz + hz, 1.1);
      // Shelter canopy on four posts, with a bench
      const sx = x + ix * (off + 0.8);
      const sz = z + iz * (off + 0.8);
      for (const a of [-6, 6]) {
        for (const b of [-1.2, 1.2]) {
          const px = sx + (alongX ? a : b);
          const pz = sz + (alongX ? b : a);
          shelter.push(new THREE.CylinderGeometry(0.07, 0.07, 2.7, 8).translate(px, 1.1 + 1.35, pz));
          this.world.addCircle(px, pz, 0.12);
        }
      }
      shelter.push(box(alongX ? 14 : 3.2, 0.12, alongX ? 3.2 : 14, sx, 3.85, sz));
      shelter.push(box(alongX ? 6 : 0.45, 0.08, alongX ? 0.45 : 6, sx + ix * 0.6, 1.6, sz + iz * 0.6));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshStandardMaterial({ map: signTexture(name, 'VIBE LINE'), emissive: 0xffffff, emissiveMap: signTexture(name, 'VIBE LINE'), emissiveIntensity: 0.25 }));
      sign.position.set(sx, 3.3, sz);
      sign.rotation.y = Math.atan2(-ix, -iz);
      statics.push(sign);
      const back = sign.clone();
      back.rotation.y += Math.PI;
      back.position.set(sx + ix * 0.02, 3.3, sz + iz * 0.02);
      statics.push(back);
    }
    statics.push(new THREE.Mesh(merge(plat), M.concrete), new THREE.Mesh(merge(edge), M.yellow), new THREE.Mesh(merge(shelter), M.dark));
    this.stations = stations;
    this.train = new Consist(scene, tr, 'train', trainStops, fx);
    this.consists = [this.tram, this.train];

    for (const m of statics) {
      m.receiveShadow = true;
      m.castShadow = m.material !== M.steel;
      scene.add(m);
      m.updateMatrixWorld(true);
      m.matrixAutoUpdate = false;
    }
    this.caps = [];
    this.objs = [];
    this.obstacleList = [];
  }

  /** Traffic treats rail cars as obstacles. */
  obstacles() {
    let i = 0;
    for (const cs of this.consists) {
      for (const c of cs.cars) {
        const o = this.obstacleList[i] || (this.obstacleList[i] = { pos: { x: 0, z: 0 }, def: { hl: 0 } });
        o.pos.x = c.x;
        o.pos.z = c.z;
        o.def.hl = cs.K.L / 2;
        i++;
      }
    }
    this.obstacleList.length = i;
    return this.obstacleList;
  }

  /** Rail cars as oriented boxes, for bullets. */
  boxes(out) {
    for (const cs of this.consists) {
      const K = cs.K;
      for (const c of cs.cars) out.push({ x: c.x, y: K.y + (K.roof + K.base) / 2, z: c.z, yaw: c.yaw, hw: K.hw, hh: (K.roof - K.base) / 2, hl: K.L / 2, rail: cs });
    }
    return out;
  }

  update(dt, night, ctx) {
    const { player, peds, vehicles, traffic, game, audio } = ctx;
    const focus = player.focus;
    const near = (p) => Math.hypot(p.x - focus.x, p.z - focus.z);
    // Things the AI driver brakes for
    const objs = this.objs;
    objs.length = 0;
    if (player.mode === 'foot') objs.push({ x: player.pos.x, z: player.pos.z, r: 0.6 });
    for (const v of vehicles) if (!v.rail) objs.push({ x: v.pos.x, z: v.pos.z, r: v.def.hw + 0.3 });
    for (const c of traffic.cars) objs.push({ x: c.x, z: c.z, r: c.def.hw + 0.3 });
    const aiCtx = { objs, audio, near };
    for (const cs of this.consists) {
      if (cs === player.vehicle && player.mode === 'driving') continue;
      cs.update(dt, null, night, aiCtx);
    }
    // Collisions: rail cars are effectively immovable
    const caps = this.caps;
    caps.length = 0;
    for (const cs of this.consists) cs.capsules(caps);
    for (const c of caps) {
      const cs = c.consist;
      const cvx = cs.vel.x;
      const cvz = cs.vel.y;
      const moving = cs.speed > 2.5;
      // Player on foot
      if (player.mode === 'foot' && !player.dead) {
        const q = closestOnSeg(c, player.pos.x, player.pos.z);
        const dx = player.pos.x - q.x;
        const dz = player.pos.z - q.z;
        const d = Math.hypot(dx, dz);
        const rr = c.r + 0.35;
        if (d < rr && d > 1e-4 && player.pos.y < cs.K.y + cs.K.roof) {
          player.pos.x += (dx / d) * (rr - d);
          player.pos.z += (dz / d) * (rr - d);
          if (moving) {
            player.knockDown(cvx * 0.8 + (dx / d) * 4, cvz * 0.8 + (dz / d) * 4);
            player.hurt(cs.speed * 5, q.x, q.z);
          }
        }
      }
      // Pedestrians
      for (const n of peds.list) {
        if (n.state === 'dead' && !moving) continue;
        const q = closestOnSeg(c, n.x, n.z);
        const dx = n.x - q.x;
        const dz = n.z - q.z;
        const d = Math.hypot(dx, dz);
        const rr = c.r + 0.35;
        if (d >= rr || d < 1e-4) continue;
        n.x += (dx / d) * (rr - d);
        n.z += (dz / d) * (rr - d);
        if (moving && n.state !== 'dead') peds.damage(n, cs.speed * 8, cvx * 0.8 + (dx / d) * 3, cvz * 0.8 + (dz / d) * 3, null, 'vehicle');
      }
      // Road vehicles
      for (const v of vehicles) {
        if (v.rail) continue;
        const fx = Math.sin(v.yaw);
        const fz = Math.cos(v.yaw);
        for (const off of v.def.offs) {
          const px = v.pos.x + fx * off;
          const pz = v.pos.z + fz * off;
          const q = closestOnSeg(c, px, pz);
          const dx = px - q.x;
          const dz = pz - q.z;
          const d = Math.hypot(dx, dz);
          const rr = c.r + v.def.rad;
          if (d >= rr || d < 1e-4) continue;
          const nx = dx / d;
          const nz = dz / d;
          v.pos.x += nx * (rr - d);
          v.pos.z += nz * (rr - d);
          v.asleep = false;
          const vn = (v.vel.x - cvx) * nx + (v.vel.y - cvz) * nz;
          if (vn < 0) {
            v.vel.x -= 1.6 * vn * nx;
            v.vel.y -= 1.6 * vn * nz;
            v.angVel += (Math.random() - 0.5) * -vn * 0.05;
            v.impact = Math.max(v.impact, -vn);
            cs.impact = Math.max(cs.impact, -vn);
            crashDamage(v, -vn * 1.6);
            if (-vn > 4) this.fx.sparks(q.x + nx * c.r, 0.9, q.z + nz * c.r, -vn);
          }
        }
      }
      // AI traffic gets shoved loose
      if (cs.speed > 0.5) {
        for (const t of [...traffic.cars]) {
          const fx = Math.sin(t.yaw);
          const fz = Math.cos(t.yaw);
          let hit = null;
          for (const off of t.def.offs) {
            const q = closestOnSeg(c, t.x + fx * off, t.z + fz * off);
            const dx = t.x + fx * off - q.x;
            const dz = t.z + fz * off - q.z;
            const d = Math.hypot(dx, dz);
            if (d < c.r + t.def.rad && d > 1e-4) hit = { nx: dx / d, nz: dz / d };
          }
          if (!hit) continue;
          const vel = new THREE.Vector2(cvx * 1.1 + hit.nx * 4, cvz * 1.1 + hit.nz * 4);
          const v = game.adoptTrafficCar(t, vel, (Math.random() - 0.5) * 2);
          crashDamage(v, cs.speed * 2);
          this.fx.sparks(t.x, 0.9, t.z, cs.speed);
        }
      }
    }
  }
}
