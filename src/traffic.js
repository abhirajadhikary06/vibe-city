import * as THREE from 'three';
import { buildCarMesh, setCarLOD, TYPES, crashDamage } from './car.js';
import { clamp, dampAngle } from './utils.js';

// Kolkata traffic: yellow taxis everywhere, buses in WBTC blue, private-bus colours and CTC green
const COLORS = [0xf5f5f5, 0xf5f5f5, 0x1d1f24, 0x8a8f96, 0x2a4fa8, 0xb8262e, 0xc9c2b0, 0x14324d, 0xd9d4c5, 0x6b6f75];
const TYPE_POOL = ['taxi', 'taxi', 'taxi', 'taxi', 'taxi', 'ambassador', 'ambassador', 'sedan', 'sedan', 'van', 'bus', 'bus', 'bus', 'pickup', 'truck', 'rickshaw', 'rickshaw', 'bike', 'auto', 'auto', 'auto'];
const FIXED_COLOR = { taxi: 0xf2c21b, ambassador: [0xf4f4f0, 0xf4f4f0, 0x1d1f24, 0xe8e2d0], rickshaw: [0x2b4a8a, 0xffffff], schoolbus: 0xf2b705, truck: [0xd8682a, 0x2f6b46, 0x1b4f9a], bus: [0x2f5fb3, 0xd99a22, 0x2f8a4a, 0xc8382c, 0x2f5fb3, 0xd99a22] };

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
function curveLen(a, c, b) {
  let len = 0;
  let px = a.x;
  let pz = a.z;
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const u = 1 - t;
    const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
    const z = u * u * a.z + 2 * u * t * c.z + t * t * b.z;
    len += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  return len;
}
const trimOf = (lane) => Math.min(6, lane.len * 0.3);

/**
 * AI traffic on the real street graph (keeping left, obeying one-way streets).
 * When a car is hijacked or knocked hard, it is "released" into a free physics
 * Vehicle via onRelease().
 */
export class Traffic {
  constructor(scene, world, effects, count = 24) {
    this.scene = scene;
    this.world = world;
    this.graph = world.graph;
    this.fx = effects;
    this.cars = [];
    this.count = count;
    this.tmp = { x: 0, z: 0, tx: 0, tz: 1 };
    this.near = [];
    this.onRelease = null;
    this.honk = null;
    const start = world.spawn || { x: 0, z: 0 };
    for (let n = 0; n < count; n++) this.cars.push(this.makeCar(start, 0));
  }

  makeCar(near, minD = 120) {
    const type = TYPE_POOL[Math.floor(Math.random() * TYPE_POOL.length)];
    const fixed = FIXED_COLOR[type];
    const color = fixed === undefined ? COLORS[Math.floor(Math.random() * COLORS.length)] : Array.isArray(fixed) ? fixed[Math.floor(Math.random() * fixed.length)] : fixed;
    const mesh = buildCarMesh(type, color);
    this.scene.add(mesh.root);
    const def = TYPES[type];
    const car = { mesh, type, def, color, x: 0, z: 0, y: 0, yaw: 0, speed: 0, cruise: 0, vel: new THREE.Vector2(), stopT: 0, ghost: 0, spin: 0, honkT: 0, panicT: 0 };
    this.spawn(car, near, minD);
    return car;
  }

  spawn(car, near, minD = 120, maxD = 280) {
    const list = this.graph.edgesNear(near.x, near.z, maxD, this.near);
    for (let tries = 0; tries < 60; tries++) {
      const e = list[Math.floor(Math.random() * list.length)];
      if (!e || e.c > 4 || e.len < 25) continue;
      // rickshaws keep to the side streets, buses to the main roads
      if (car.type === 'rickshaw' && e.c < 3) continue;
      if (car.type === 'auto' && e.c < 2) continue;
      if (car.type === 'bus' && e.c > 3) continue;
      const dirs = [1, -1].filter((d) => e.lanes[d]);
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      const lane = e.lanes[dir];
      const trim = trimOf(lane);
      const s = trim + Math.random() * (lane.len - trim * 2);
      lane.at(s, this.tmp);
      const dist = Math.hypot(this.tmp.x - near.x, this.tmp.z - near.z);
      if (dist < minD || dist > maxD) continue;
      if (this.cars.some((o) => o !== car && Math.hypot(o.x - this.tmp.x, o.z - this.tmp.z) < 25)) continue;
      car.e = e;
      car.dir = dir;
      car.lane = lane;
      car.seg = null;
      car.s = s;
      car.sEnd = lane.len - trim;
      car.cruise = (0.85 + Math.random() * 0.3) * (car.def.mass > 3 ? 0.8 : 1);
      car.speed = Math.min(e.speed, 12) * car.cruise;
      car.ghost = 0;
      car.x = this.tmp.x;
      car.z = this.tmp.z;
      car.yaw = Math.atan2(this.tmp.tx, this.tmp.tz);
      return true;
    }
    return false;
  }

  /** At the end of a lane: pick the next street and build a curve through the junction. */
  advance(car) {
    if (car.seg) {
      // finished the turn: onto the next lane
      car.e = car.next.e;
      car.dir = car.next.dir;
      car.lane = car.e.lanes[car.dir];
      car.s = trimOf(car.lane);
      car.sEnd = car.lane.len - trimOf(car.lane);
      car.seg = null;
      car.next = null;
      return;
    }
    const g = this.graph;
    const node = g.nodes[car.dir > 0 ? car.e.b : car.e.a];
    const t0 = car.lane.at(car.sEnd, {});
    let opts = node.out.filter((o) => o.e !== car.e && o.e.c <= 5);
    if (!opts.length) opts = node.out.filter((o) => o.e === car.e);
    if (!opts.length) opts = [{ e: car.e, dir: -car.dir }].filter((o) => o.e.lanes[o.dir]);
    if (!opts.length) {
      car.respawn = true;
      return;
    }
    // Prefer carrying straight on, and staying on roads at least as big
    let total = 0;
    const w = opts.map((o) => {
      const l = o.e.lanes[o.dir];
      const p = l.at(trimOf(l), {});
      const straight = 0.25 + Math.max(0, p.tx * t0.tx + p.tz * t0.tz);
      const size = o.e.c <= car.e.c ? 1.6 : o.e.c >= 5 ? 0.25 : 0.8;
      const v = straight * size;
      total += v;
      return v;
    });
    let r = Math.random() * total;
    let pick = opts[0];
    for (let i = 0; i < opts.length; i++) {
      r -= w[i];
      if (r <= 0) {
        pick = opts[i];
        break;
      }
    }
    const nl = pick.e.lanes[pick.dir];
    const t1 = nl.at(trimOf(nl), {});
    const a = { x: t0.x, z: t0.z };
    const b = { x: t1.x, z: t1.z };
    // Control point where the two lanes' lines meet; the midpoint if they don't
    let c = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const den = t0.tx * t1.tz - t0.tz * t1.tx;
    if (Math.abs(den) > 0.15) {
      const k = ((b.x - a.x) * t1.tz - (b.z - a.z) * t1.tx) / den;
      const m = ((b.x - a.x) * t0.tz - (b.z - a.z) * t0.tx) / den;
      if (k > 0 && m > 0 && k < 25 && m < 25) c = { x: a.x + t0.tx * k, z: a.z + t0.tz * k };
    }
    car.seg = { a, b, c, len: Math.max(0.5, curveLen(a, c, b)) };
    car.s = 0;
    car.next = pick;
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
      if (distP > 330 || car.respawn) {
        car.respawn = false;
        if (!this.spawn(car, focus)) this.spawn(car, focus, 40, 400);
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
      const roadSpeed = Math.min(car.e.speed * car.cruise, car.def.top * 0.85);
      const cruise = car.panicT > 0 ? Math.min(car.def.top * 0.6, roadSpeed * 1.8) : roadSpeed;
      let target = car.seg ? Math.min(cruise, 6.5) : cruise;
      // ease off before the junction
      if (!car.seg) target = Math.min(target, 6.5 + (car.sEnd - car.s) * 0.6);
      target *= clamp((block - 1.6) / 8, 0, 1);
      car.speed = car.speed < target ? Math.min(target, car.speed + 4 * dt) : Math.max(target, car.speed - 14 * dt);
      car.honkT -= dt;
      if (car.speed < 0.3 && (aiBlock || playerBlock)) {
        car.stopT += dt;
        // Kolkata drivers lean on the horn
        // a driver held up by the player leans on the horn, but not endlessly
        if (playerBlock && car.stopT > 2.5 && car.honkT <= 0 && this.honk && distP < 45) {
          this.honk(car);
          car.honkT = 6 + Math.random() * 6;
        }
        if (aiBlock && car.stopT > 3.5) {
          car.ghost = 2.5;
          car.stopT = 0;
        }
      } else car.stopT = 0;
      car.ghost -= dt;

      car.s += car.speed * dt;
      for (let guard = 0; guard < 4; guard++) {
        const end = car.seg ? car.seg.len : car.sEnd;
        if (car.s < end || car.respawn) break;
        car.s -= end;
        this.advance(car);
      }
      if (car.respawn) continue;
      if (car.seg) {
        evalSeg(car.seg, clamp(car.s / car.seg.len, 0, 1), t);
      } else car.lane.at(car.s, t);
      car.x = t.x;
      car.z = t.z;
      car.yaw = dampAngle(car.yaw, Math.atan2(t.tx, t.tz), 12, dt);
      car.vel.set(Math.sin(car.yaw) * car.speed, Math.cos(car.yaw) * car.speed);
      car.spin += (car.speed * dt) / car.def.wr;
      const onBridge = car.e.br || (car.next && car.next.e.br);
      car.y = onBridge ? (this.world.deckAt(car.x, car.z) ?? 0) : 0;
      const m = car.mesh;
      m.root.position.set(car.x, car.y, car.z);
      m.root.rotation.y = car.yaw;
      const dc = Math.hypot(car.x - camPos.x, car.z - camPos.z);
      setCarLOD(m, dc);
      if (m.near) for (const w of m.wheels) w.spin.rotation.x = car.spin;
      if (m.anim && m.near) m.anim(car.spin, car.speed);
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
      if (dx0 * dx0 + dz0 * dz0 > reach * reach || Math.abs(v.pos.y - car.y) > 3) continue;
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
