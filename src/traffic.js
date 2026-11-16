import * as THREE from 'three';
import { buildCarMesh, setCarLOD, TYPES, crashDamage } from './car.js';
import { N, lineAt, LANE, ROAD } from './world.js';
import { clamp, dampAngle } from './utils.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const COLORS = [0xf5f5f5, 0x1d1f24, 0x8a8f96, 0x2a4fa8, 0xb8262e, 0x3fa7c9, 0xe8c547, 0x2f6b46, 0x6b3fa0, 0xf08a3a, 0xc9c2b0, 0x14324d, 0xff7eb3, 0x5fd3e8];
const TYPE_POOL = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'coupe', 'sedan', 'taxi', 'pickup', 'pickup', 'truck', 'bus', 'schoolbus', 'sedan', 'van'];
const FIXED_COLOR = { taxi: 0xffcf2e, schoolbus: 0xf2b705, truck: 0x1b2440, bus: [0x1f8a8a, 0xd8336b, 0x2f5fb3] };
const inside = (i, k) => i >= 0 && i <= N && k >= 0 && k <= N;
const right = (d) => [-d[1], d[0]];

function laneStart(i, k, d) {
  const r = right(d);
  return { x: lineAt(i) + d[0] * (ROAD / 2 + 0.5) + r[0] * LANE, z: lineAt(k) + d[1] * (ROAD / 2 + 0.5) + r[1] * LANE };
}
function laneEnd(i, k, d) {
  const r = right(d);
  return { x: lineAt(i) - d[0] * (ROAD / 2 + 0.5) + r[0] * LANE, z: lineAt(k) - d[1] * (ROAD / 2 + 0.5) + r[1] * LANE };
}
function line(a, b) {
  return { a, b, c: null, len: Math.hypot(b.x - a.x, b.z - a.z) };
}
function curve(a, c, b) {
  let len = 0;
  let px = a.x;
  let pz = a.z;
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x;
    const z = (1 - t) * (1 - t) * a.z + 2 * (1 - t) * t * c.z + t * t * b.z;
    len += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  return { a, b, c, len };
}
function evalSeg(seg, t, out) {
  const { a, b, c } = seg;
  if (!c) {
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    out.tx = b.x - a.x;
    out.tz = b.z - a.z;
  } else {
    const u = 1 - t;
    out.x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
    out.z = u * u * a.z + 2 * u * t * c.z + t * t * b.z;
    out.tx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x);
    out.tz = 2 * u * (c.z - a.z) + 2 * t * (b.z - c.z);
  }
}

/**
 * AI traffic following the road graph. When a car is hijacked or knocked
 * hard, it is "released" into a free physics Vehicle via onRelease().
 */
export class Traffic {
  constructor(scene, world, effects, count = 24) {
    this.scene = scene;
    this.world = world;
    this.fx = effects;
    this.cars = [];
    this.count = count;
    this.tmp = { x: 0, z: 0, tx: 0, tz: 1 };
    this.onRelease = null;
    this.honk = null;
    for (let n = 0; n < count; n++) this.cars.push(this.makeCar(null));
  }

  makeCar(near) {
    const type = TYPE_POOL[Math.floor(Math.random() * TYPE_POOL.length)];
    const fixed = FIXED_COLOR[type];
    const color = fixed === undefined ? COLORS[Math.floor(Math.random() * COLORS.length)] : Array.isArray(fixed) ? fixed[Math.floor(Math.random() * fixed.length)] : fixed;
    const mesh = buildCarMesh(type, color);
    this.scene.add(mesh.root);
    const def = TYPES[type];
    const car = { mesh, type, def, color, x: 0, z: 0, yaw: 0, speed: 0, cruise: 0, vel: new THREE.Vector2(), stopT: 0, ghost: 0, spin: 0, honkT: 0, panicT: 0 };
    this.spawn(car, near);
    return car;
  }

  spawn(car, near) {
    for (let tries = 0; tries < 60; tries++) {
      const i = Math.floor(Math.random() * (N + 1));
      const k = Math.floor(Math.random() * (N + 1));
      const dirs = DIRS.filter((d) => inside(i + d[0], k + d[1]));
      const d = dirs[Math.floor(Math.random() * dirs.length)];
      const p = { x: lineAt(i), z: lineAt(k) };
      if (near) {
        const dist = Math.hypot(p.x - near.x, p.z - near.z);
        if (dist < 120 || dist > 280) continue;
      }
      if (this.cars.some((o) => o !== car && Math.hypot(o.x - p.x, o.z - p.z) < 30)) continue;
      car.J = [i + d[0], k + d[1]];
      car.d = d;
      car.seg = line(laneStart(i, k, d), laneEnd(car.J[0], car.J[1], d));
      car.next = null;
      car.s = Math.random() * car.seg.len * 0.8;
      car.cruise = (11 + Math.random() * 6) * (car.def.mass > 3 ? 0.75 : 1);
      car.speed = car.cruise;
      car.ghost = 0;
      evalSeg(car.seg, car.s / car.seg.len, this.tmp);
      car.x = this.tmp.x;
      car.z = this.tmp.z;
      car.yaw = Math.atan2(this.tmp.tx, this.tmp.tz);
      return;
    }
  }

  advance(car) {
    if (!car.seg.c) {
      const [i, k] = car.J;
      const back = [-car.d[0], -car.d[1]];
      let opts = DIRS.filter((d) => inside(i + d[0], k + d[1]) && !(d[0] === back[0] && d[1] === back[1]));
      if (!opts.length) opts = [DIRS.find((d) => d[0] === back[0] && d[1] === back[1])];
      const straight = opts.find((d) => d[0] === car.d[0] && d[1] === car.d[1]);
      const d2 = straight && Math.random() < 0.5 ? straight : opts[Math.floor(Math.random() * opts.length)];
      const from = car.seg.b;
      const to = laneStart(i, k, d2);
      let ctrl;
      if (d2 === straight) ctrl = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
      else {
        const r1 = right(car.d);
        const r2 = right(d2);
        ctrl = { x: lineAt(i) + (r1[0] + r2[0]) * LANE, z: lineAt(k) + (r1[1] + r2[1]) * LANE };
      }
      car.seg = curve(from, ctrl, to);
      car.next = line(to, laneEnd(i + d2[0], k + d2[1], d2));
      car.d = d2;
      car.J = [i + d2[0], k + d2[1]];
    } else {
      car.seg = car.next;
      car.next = null;
    }
  }

  /** Remove a car from AI control; a fresh car spawns elsewhere to keep density. */
  release(car, focus) {
    const i = this.cars.indexOf(car);
    if (i < 0) return null;
    this.cars.splice(i, 1);
    this.cars.push(this.makeCar(focus));
    return car;
  }

  /** Gunfire nearby: drivers floor it for a while. */
  panic(x, z, r) {
    for (const c of this.cars) if ((c.x - x) ** 2 + (c.z - z) ** 2 < r * r) c.panicT = 6 + Math.random() * 4;
  }

  nearest(x, z, r) {
    let best = null;
    let bd = r * r;
    for (const c of this.cars) {
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  /** obstacles: [{pos:{x,z}}] — the player and every free vehicle */
  update(dt, focus, obstacles, camPos) {
    const t = this.tmp;
    for (let ci = 0; ci < this.cars.length; ci++) {
      const car = this.cars[ci];
      const distP = Math.hypot(car.x - focus.x, car.z - focus.z);
      if (distP > 320) {
        this.spawn(car, focus);
        continue;
      }
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      let block = 99;
      let aiBlock = false;
      let playerBlock = false;
      const half = car.def.hl;
      const check = (ox, oz, kind, oh) => {
        const dx = ox - car.x;
        const dz = oz - car.z;
        const ahead = dx * fx + dz * fz - half - oh;
        if (ahead <= -half || ahead > 14) return;
        const lat = Math.abs(dx * fz - dz * fx);
        if (lat < (kind === 2 ? 1.6 : 2.0) && ahead < block) {
          block = ahead;
          aiBlock = kind === 1;
          playerBlock = kind === 2;
        }
      };
      for (const o of obstacles) check(o.pos.x, o.pos.z, o.isPed ? 2 : 0, o.def ? o.def.hl : o.isPed ? 0 : 2.4);
      if (car.ghost <= 0) for (const o of this.cars) if (o !== car) check(o.x, o.z, 1, o.def.hl);
      car.panicT -= dt;
      const cruise = car.panicT > 0 ? Math.min(car.def.top * 0.6, car.cruise * 1.8) : car.cruise;
      let target = car.seg.c ? Math.min(cruise, 8) : cruise;
      target *= clamp((block - 1.6) / 8, 0, 1);
      car.speed = car.speed < target ? Math.min(target, car.speed + 5 * dt) : Math.max(target, car.speed - 16 * dt);
      car.honkT -= dt;
      if (car.speed < 0.3 && (aiBlock || playerBlock)) {
        car.stopT += dt;
        if (playerBlock && car.stopT > 1.2 && car.honkT <= 0 && this.honk && distP < 40) {
          this.honk(car);
          car.honkT = 4;
        }
        if (aiBlock && car.stopT > 3.5) {
          car.ghost = 2.5;
          car.stopT = 0;
        }
      } else car.stopT = 0;
      car.ghost -= dt;

      car.s += car.speed * dt;
      while (car.s >= car.seg.len) {
        car.s -= car.seg.len;
        this.advance(car);
      }
      evalSeg(car.seg, car.s / car.seg.len, t);
      car.x = t.x;
      car.z = t.z;
      car.yaw = dampAngle(car.yaw, Math.atan2(t.tx, t.tz), 12, dt);
      car.vel.set(Math.sin(car.yaw) * car.speed, Math.cos(car.yaw) * car.speed);
      car.spin += (car.speed * dt) / car.def.wr;
      const m = car.mesh;
      m.root.position.set(car.x, this.world.height(car.x, car.z), car.z);
      m.root.rotation.y = car.yaw;
      const dc = Math.hypot(car.x - camPos.x, car.z - camPos.z);
      setCarLOD(m, dc);
      if (m.near) for (const w of m.wheels) w.spin.rotation.x = car.spin;
      m.root.visible = dc < 260;
      const shadow = dc < 80;
      if (m.shadowOn !== shadow) {
        m.shadowOn = shadow;
        m.body.traverse((o) => (o.castShadow = shadow));
      }
    }
  }

  /** Physics vehicle v vs all AI cars. Hard hits release the AI car into physics. */
  collideVehicle(v, focus) {
    const pfx = Math.sin(v.yaw);
    const pfz = Math.cos(v.yaw);
    const vd = v.def;
    let best = 0;
    for (const car of [...this.cars]) {
      const cd = car.def;
      const dx0 = v.pos.x - car.x;
      const dz0 = v.pos.z - car.z;
      const reach = vd.hl + cd.hl + 2;
      if (dx0 * dx0 + dz0 * dz0 > reach * reach) continue;
      const cfx = Math.sin(car.yaw);
      const cfz = Math.cos(car.yaw);
      const rr = vd.rad + cd.rad;
      let deep = 0;
      let nx = 0;
      let nz = 0;
      let hx = 0;
      let hz = 0;
      for (const a of vd.offs) {
        for (const b of cd.offs) {
          const ax = v.pos.x + pfx * a;
          const az = v.pos.z + pfz * a;
          const bx = car.x + cfx * b;
          const bz = car.z + cfz * b;
          const dx = ax - bx;
          const dz = az - bz;
          const d = Math.hypot(dx, dz);
          if (d < rr && rr - d > deep && d > 1e-4) {
            deep = rr - d;
            nx = dx / d;
            nz = dz / d;
            hx = (ax + bx) / 2;
            hz = (az + bz) / 2;
          }
        }
      }
      if (deep <= 0) continue;
      v.pos.x += nx * deep;
      v.pos.z += nz * deep;
      v.asleep = false;
      const vn = (v.vel.x - car.vel.x) * nx + (v.vel.y - car.vel.y) * nz;
      if (vn < 0) {
        const ma = vd.mass;
        const mb = cd.mass;
        const j = (-1.3 * vn) / (1 / ma + 1 / mb);
        v.vel.x += (nx * j) / ma;
        v.vel.y += (nz * j) / ma;
        v.angVel += ((Math.random() - 0.5) * -vn * 0.04) / Math.sqrt(ma);
        best = Math.max(best, -vn);
        crashDamage(v, (-vn * 2 * mb) / (ma + mb));
        if (-vn > 4) this.fx.sparks(hx, v.pos.y + 0.7, hz, -vn);
        // A light car barely moves a bus; only knock it loose if the hit is big enough for its mass
        if ((-vn * ma) / mb > 2.5 && this.onRelease) {
          const vel = car.vel.clone();
          vel.x -= (nx * j) / mb;
          vel.y -= (nz * j) / mb;
          const released = this.release(car, focus);
          if (released) {
            const nv = this.onRelease(released, vel, ((Math.random() - 0.5) * -vn * 0.25) / Math.sqrt(mb));
            if (nv) crashDamage(nv, (-vn * 2 * ma) / (ma + mb));
          }
        } else car.speed = 0;
      }
    }
    v.impact = Math.max(v.impact, best);
    return best;
  }
}
