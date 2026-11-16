import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import * as T from './textures.js';
import { merge, colorBox, colorCyl, clamp, lerp, smoothstep } from './utils.js';

/* City layout: an N x N grid of blocks with roads between them, ocean to the east. */
export const N = 8;
export const BLOCK = 60;
export const ROAD = 14;
export const CELL = BLOCK + ROAD;
export const HALF = (N * CELL) / 2; // 296
export const LANE = 3.5;
export const COAST_X = HALF + ROAD / 2; // 303
export const SHORE_X = 326;
export const BOUND = HALF + 30;
export const PIER = { x0: 312, x1: 440, hw: 6.2, deck: 1.2, plat0: 439.5, plat1: 470.5, phw: 15.4 };
export const lineAt = (k) => -HALF + k * CELL;
const SIDEWALK_H = 0.18;
const beachY = (x) => -Math.max(0, x - COAST_X) * 0.031;

/* ---------- Simple value noise for mountains ---------- */
function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) & 0xffff) / 65535;
}
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 5) {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < o; i++) {
    s += vnoise(x, y) * a;
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return s;
}

/* ---------- Spatial hash for colliders ---------- */
class Grid {
  constructor(size = 24) {
    this.size = size;
    this.map = new Map();
    this.stamp = 0;
  }
  key(ix, iz) {
    return (ix + 1024) * 4096 + (iz + 1024);
  }
  insert(o, x0, x1, z0, z1) {
    const s = this.size;
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++) {
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const k = this.key(ix, iz);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, (arr = []));
        arr.push(o);
      }
    }
  }
  query(x0, x1, z0, z1, cb) {
    const s = this.size;
    const st = ++this.stamp;
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++) {
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const arr = this.map.get(this.key(ix, iz));
        if (!arr) continue;
        for (const o of arr) {
          if (o._s === st) continue;
          o._s = st;
          cb(o);
        }
      }
    }
  }
}

/* ---------- Geometry helpers ---------- */
function facadeBox(w, h, d, x, y, z, uOff) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      let u = uv.getX(i);
      let v = uv.getY(i);
      if (f === 2 || f === 3) {
        u = 0.003;
        v = 0.003;
      } else {
        const span = f < 2 ? d : w;
        u = (u * span) / 32 + uOff + f * 0.375;
        v = (v * h) / 28;
      }
      uv.setXY(i, u, v);
    }
  }
  g.translate(x, y + h / 2, z);
  return g;
}

function shopBox(w, h, d, x, y, z, uOff) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) uv.setXY(i, 0.003, 0.003);
      else uv.setXY(i, (uv.getX(i) * (f < 2 ? d : w)) / 24 + uOff, uv.getY(i));
    }
  }
  g.translate(x, y + h / 2, z);
  return g;
}

function strip(cx, cz, w, len, alongX, vRepeat, y) {
  const g = new THREE.PlaneGeometry(w, len);
  g.rotateX(-Math.PI / 2);
  if (alongX) g.rotateY(Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * vRepeat);
  g.translate(cx, y, cz);
  return g;
}

function scaleUv(g, s) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  return g;
}

/* ---------- Palm tree template ---------- */
function palmGeometries() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.25, 3, 0),
    new THREE.Vector3(0.8, 6, 0),
    new THREE.Vector3(1.5, 8.6, 0),
  ]);
  const TUB = 20;
  const RAD = 7;
  const trunk = new THREE.TubeGeometry(curve, TUB, 0.26, RAD, false);
  const pos = trunk.attributes.position;
  const uv = trunk.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.floor(i / (RAD + 1)) / TUB;
    const c = curve.getPointAt(t);
    const k = 1.2 - 0.55 * t;
    pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k);
    const u0 = uv.getX(i);
    uv.setXY(i, uv.getY(i), u0 * 6);
  }
  trunk.computeVertexNormals();

  const top = curve.getPointAt(1);
  const fronds = [];
  const r = T.makeRng(7);
  const COUNT = 11;
  for (let f = 0; f < COUNT; f++) {
    const g = new THREE.PlaneGeometry(1.6, 4.8, 1, 8);
    const p = g.attributes.position;
    const az = (f / COUNT) * Math.PI * 2 + r.range(-0.2, 0.2);
    const tilt = r.range(0.15, 0.6);
    const droop = r.range(1.8, 2.6);
    for (let i = 0; i < p.count; i++) {
      const across = p.getX(i);
      const s = (p.getY(i) + 2.4) / 4.8;
      const L = s * 4.8;
      const fwd = L * Math.cos(tilt);
      const up = L * Math.sin(tilt) - droop * s * s - Math.abs(across) * 0.35;
      const x = across * Math.cos(az) + fwd * Math.sin(az);
      const z = -across * Math.sin(az) + fwd * Math.cos(az);
      p.setXYZ(i, top.x + x, top.y + up, top.z + z);
    }
    g.computeVertexNormals();
    fronds.push(g);
  }
  const coconuts = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.SphereGeometry(0.2, 8, 6);
    const a = (i / 4) * Math.PI * 2;
    s.translate(top.x + Math.cos(a) * 0.25, top.y - 0.25, top.z + Math.sin(a) * 0.25);
    coconuts.push(s);
  }
  return { trunk: merge([trunk, ...coconuts]), fronds: merge(fronds) };
}

/* =========================================================
   World
   ========================================================= */
export class World {
  constructor(scene) {
    this.scene = scene;
    this.grid = new Grid(24);
    this.updaters = [];
    this.pickupSpots = [];
    this.blocks = [];
    this.pads = [];
    this.time = { value: 0 };
    this.build();
  }

  addBox(x0, x1, z0, z1, tall = true) {
    const o = { t: 0, x0, x1, z0, z1, tall };
    this.grid.insert(o, x0, x1, z0, z1);
  }
  addCircle(x, z, r) {
    const o = { t: 1, x, z, r };
    this.grid.insert(o, x - r, x + r, z - r, z + r);
  }

  /** Push a circle out of all static colliders. Returns null or push vector + normal. */
  collideCircle(x, z, r) {
    let px = 0;
    let pz = 0;
    let hit = false;
    this.grid.query(x - r, x + r, z - r, z + r, (o) => {
      const cx = x + px;
      const cz = z + pz;
      if (o.t === 0) {
        const qx = clamp(cx, o.x0, o.x1);
        const qz = clamp(cz, o.z0, o.z1);
        const dx = cx - qx;
        const dz = cz - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) return;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          px += (dx / d) * (r - d);
          pz += (dz / d) * (r - d);
        } else {
          const l = cx - o.x0;
          const rr = o.x1 - cx;
          const t = cz - o.z0;
          const b = o.z1 - cz;
          const m = Math.min(l, rr, t, b);
          if (m === l) px -= l + r;
          else if (m === rr) px += rr + r;
          else if (m === t) pz -= t + r;
          else pz += b + r;
        }
        hit = true;
      } else {
        const dx = cx - o.x;
        const dz = cz - o.z;
        const rr = r + o.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-9) return;
        const d = Math.sqrt(d2);
        px += (dx / d) * (rr - d);
        pz += (dz / d) * (rr - d);
        hit = true;
      }
    });
    if (!hit) return null;
    const l = Math.hypot(px, pz) || 1;
    return { px, pz, nx: px / l, nz: pz / l };
  }

  /** 2D segment vs tall boxes; returns fraction [0..1] of first hit. */
  raycast(ax, az, bx, bz) {
    let best = 1;
    const dx = bx - ax;
    const dz = bz - az;
    this.grid.query(Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), (o) => {
      if (o.t !== 0 || !o.tall) return;
      let t0 = 0;
      let t1 = 1;
      for (const [p, d, lo, hi] of [[ax, dx, o.x0, o.x1], [az, dz, o.z0, o.z1]]) {
        if (Math.abs(d) < 1e-9) {
          if (p < lo || p > hi) return;
        } else {
          let ta = (lo - p) / d;
          let tb = (hi - p) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) return;
        }
      }
      if (t0 < best) best = t0;
    });
    return best;
  }

  /** Raised walkable area (station platforms). */
  addPad(x0, x1, z0, z1, h) {
    this.pads.push({ x0, x1, z0, z1, h });
  }

  /**
   * Bullet ray in 2D against tall boxes and poles/trunks. Returns the first hit as
   * { t (fraction of the segment), nx, nz } or null.
   */
  raycastHit(ax, az, bx, bz) {
    let best = 1;
    let nx = 0;
    let nz = 0;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    this.grid.query(Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), (o) => {
      if (o.t === 1) {
        const fx = ax - o.x;
        const fz = az - o.z;
        const b = fx * dx + fz * dz;
        const c = fx * fx + fz * fz - o.r * o.r;
        const disc = b * b - len2 * c;
        if (disc < 0 || c < 0) return;
        const t = (-b - Math.sqrt(disc)) / len2;
        if (t >= 0 && t < best) {
          best = t;
          const hx = ax + dx * t - o.x;
          const hz = az + dz * t - o.z;
          const l = Math.hypot(hx, hz) || 1;
          nx = hx / l;
          nz = hz / l;
        }
        return;
      }
      if (!o.tall) return;
      let t0 = 0;
      let t1 = 1;
      let ax0 = 0;
      for (const [p, d, lo, hi, axis] of [[ax, dx, o.x0, o.x1, 0], [az, dz, o.z0, o.z1, 1]]) {
        if (Math.abs(d) < 1e-9) {
          if (p < lo || p > hi) return;
        } else {
          let ta = (lo - p) / d;
          let tb = (hi - p) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          if (ta > t0) {
            t0 = ta;
            ax0 = axis;
          }
          t1 = Math.min(t1, tb);
          if (t0 > t1) return;
        }
      }
      if (t0 > 0 && t0 < best) {
        best = t0;
        nx = ax0 === 0 ? -Math.sign(dx) : 0;
        nz = ax0 === 1 ? -Math.sign(dz) : 0;
      }
    });
    return best < 1 ? { t: best, nx, nz } : null;
  }

  height(x, z) {
    for (const p of this.pads) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return p.h;
    const az = Math.abs(z);
    if (x > PIER.x0 && x < PIER.x1 && az < PIER.hw) {
      return x < 330 ? lerp(beachY(PIER.x0), PIER.deck, (x - PIER.x0) / (330 - PIER.x0)) : PIER.deck;
    }
    if (x >= PIER.plat0 && x <= PIER.plat1 && az < PIER.phw) return PIER.deck;
    if (x > COAST_X) return beachY(x);
    if (Math.abs(x) <= COAST_X && az <= COAST_X) {
      const mx = (((x + HALF) % CELL) + CELL) % CELL;
      const mz = (((z + HALF) % CELL) + CELL) % CELL;
      const onRoad = mx < ROAD / 2 || mx > CELL - ROAD / 2 || mz < ROAD / 2 || mz > CELL - ROAD / 2;
      return onRoad ? 0 : SIDEWALK_H;
    }
    return 0;
  }

  /* ---------------------------------------------------- */
  build() {
    const scene = this.scene;
    const before = new Set(scene.children);
    const rng = T.makeRng(2026);
    this.rng = rng;

    /* ---- Materials ---- */
    const asphaltLines = T.asphalt(true);
    const asphaltPlain = T.asphalt(false);
    const roadMat = new THREE.MeshStandardMaterial({ map: asphaltLines.map, roughnessMap: asphaltLines.rough, roughness: 1, metalness: 0 });
    const interMat = new THREE.MeshStandardMaterial({ map: asphaltPlain.map, roughnessMap: asphaltPlain.rough, roughness: 1, metalness: 0 });
    const crossMat = new THREE.MeshStandardMaterial({ map: T.crosswalk(asphaltPlain.canvas), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ map: T.sidewalk(), roughness: 0.9 });
    const grassTex = T.grass();
    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
    const sandTex = T.sand();
    const sandMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 });
    const propsMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 });
    const neonMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    this.mats = { roadMat, interMat, neonMat, redMat };

    const facadeDefs = {
      glassBlue: ['glass', { frame: '#1c2633', slab: '#2a3442', glassA: '#8fb0cc', glassB: '#4b6a88', lit: 0.35 }],
      glassTeal: ['glass', { frame: '#14211f', slab: '#22302d', glassA: '#7fbfb5', glassB: '#2f5f5a', lit: 0.3 }],
      glassGold: ['glass', { frame: '#2a2218', slab: '#3b3022', glassA: '#d8c08a', glassB: '#7a6440', lit: 0.3 }],
      concrete: ['concrete', { wall: '#bdb5a8', lit: 0.4 }],
      concreteDark: ['concrete', { wall: '#7d7a78', lit: 0.4 }],
      decoPink: ['deco', { wall: '#f1b6c6', lit: 0.45 }],
      decoMint: ['deco', { wall: '#a9e4cf', lit: 0.45 }],
      decoCream: ['deco', { wall: '#f4e4c4', band: '#ff9fbf', lit: 0.45 }],
      decoSky: ['deco', { wall: '#a8d4ee', lit: 0.45 }],
      resTerra: ['residential', { wall: '#d4a582', lit: 0.5 }],
      resSand: ['residential', { wall: '#e2cfa8', lit: 0.5 }],
    };
    this.facadeMats = {};
    let seed = 100;
    for (const [k, [kind, o]] of Object.entries(facadeDefs)) {
      const t = T.facade(kind, o, seed++);
      this.facadeMats[k] = new THREE.MeshStandardMaterial({
        map: t.map,
        emissiveMap: t.emissive,
        emissive: 0xffffff,
        emissiveIntensity: 0.05,
        roughnessMap: t.rm,
        metalnessMap: t.rm,
        roughness: 1,
        metalness: 1,
      });
    }
    const shop = T.storefront();
    this.shopMat = new THREE.MeshStandardMaterial({ map: shop.map, emissiveMap: shop.emissive, emissive: 0xffffff, emissiveIntensity: 0.4, roughnessMap: shop.rm, metalnessMap: shop.rm, roughness: 1, metalness: 1 });

    const buckets = {};
    const add = (k, g) => (buckets[k] ||= []).push(g);
    const props = [];
    const neon = [];
    const reds = [];
    const palms = [];
    const lights = [];

    /* ---- Roads ---- */
    const roadGeos = [];
    const interGeos = [];
    const crossGeos = [];
    for (let k = 0; k <= N; k++) {
      for (let i = 0; i < N; i++) {
        const mid = lineAt(i) + CELL / 2;
        const a = lineAt(i) + ROAD / 2;
        const b = lineAt(i + 1) - ROAD / 2;
        roadGeos.push(strip(mid, lineAt(k), ROAD, BLOCK, true, BLOCK / ROAD, 0.01));
        roadGeos.push(strip(lineAt(k), mid, ROAD, BLOCK, false, BLOCK / ROAD, 0.01));
        crossGeos.push(strip(a + 1.8, lineAt(k), ROAD, 3.2, true, 1, 0.02));
        crossGeos.push(strip(b - 1.8, lineAt(k), ROAD, 3.2, true, 1, 0.02));
        crossGeos.push(strip(lineAt(k), a + 1.8, ROAD, 3.2, false, 1, 0.02));
        crossGeos.push(strip(lineAt(k), b - 1.8, ROAD, 3.2, false, 1, 0.02));
      }
      for (let m = 0; m <= N; m++) interGeos.push(strip(lineAt(k), lineAt(m), ROAD, ROAD, false, 1, 0.01));
    }
    const roads = new THREE.Mesh(merge(roadGeos), roadMat);
    const inters = new THREE.Mesh(merge(interGeos), interMat);
    const cross = new THREE.Mesh(merge(crossGeos), crossMat);
    for (const m of [roads, inters, cross]) {
      m.receiveShadow = true;
      scene.add(m);
    }

    /* ---- Blocks ---- */
    const sideGeos = [];
    const grassGeos = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x0 = lineAt(i) + ROAD / 2;
        const x1 = lineAt(i + 1) - ROAD / 2;
        const z0 = lineAt(j) + ROAD / 2;
        const z1 = lineAt(j + 1) - ROAD / 2;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const dist = Math.hypot(cx + 40, cz);
        let type;
        if ((i === 3 && j === 4) || (i === 1 && j === 6)) type = 'park';
        else if (i === N - 1) type = 'beach';
        else if (dist < 175) type = 'downtown';
        else if (rng() < 0.07) type = 'park';
        else type = 'mixed';
        this.blocks.push({ i, j, x0, x1, z0, z1, cx, cz, type });

        const sw = new THREE.BoxGeometry(BLOCK, SIDEWALK_H, BLOCK);
        scaleUv(sw, BLOCK / 4);
        sw.translate(cx, SIDEWALK_H / 2, cz);
        sideGeos.push(sw);

        if (type === 'park') {
          const gp = new THREE.PlaneGeometry(BLOCK - 8, BLOCK - 8);
          gp.rotateX(-Math.PI / 2);
          scaleUv(gp, 6);
          gp.translate(cx, SIDEWALK_H + 0.02, cz);
          grassGeos.push(gp);
          for (let p = 0; p < 12; p++) {
            const px = cx + rng.range(-24, 24);
            const pz = cz + rng.range(-24, 24);
            palms.push([px, SIDEWALK_H, pz, rng.range(0.8, 1.3), rng() * 6.28]);
            this.addCircle(px, pz, 0.45);
          }
          // fountain
          colorCyl(props, 6, 6.4, 0.6, cx, SIDEWALK_H + 0.3, cz, '#d9d2c4', 28);
          colorCyl(props, 5.4, 5.4, 0.05, cx, SIDEWALK_H + 0.58, cz, '#2b6f8c', 28);
          colorCyl(props, 0.6, 0.9, 2.4, cx, SIDEWALK_H + 1.2, cz, '#e8e2d4', 12);
          this.addCircle(cx, cz, 6.4);
          this.pickupSpots.push([cx + 10, SIDEWALK_H, cz + 10]);
        } else {
          this.buildLots(type, x0, x1, z0, z1, dist, add, props, neon, reds, rng);
        }

        // Street lights and street palms along the four sidewalks
        const sides = [
          [0, -1, x0, z0, 1, 0],
          [0, 1, x0, z1, 1, 0],
          [-1, 0, x0, z0, 0, 1],
          [1, 0, x1, z0, 0, 1],
        ];
        for (const [nx, nz, sx, sz, tx, tz] of sides) {
          for (const f of [0.25, 0.75]) {
            const px = sx + tx * BLOCK * f - nx * 0.9 + (nx > 0 ? 0 : 0);
            const pz = sz + tz * BLOCK * f - nz * 0.9;
            lights.push([px, SIDEWALK_H, pz, Math.atan2(nx, nz)]);
            this.addCircle(px, pz, 0.22);
          }
          if (type !== 'downtown' && rng() < 0.7) {
            for (const f of [0.12, 0.5, 0.88]) {
              const px = sx + tx * BLOCK * f - nx * 1.2;
              const pz = sz + tz * BLOCK * f - nz * 1.2;
              palms.push([px, SIDEWALK_H, pz, rng.range(0.85, 1.25), rng() * 6.28]);
              this.addCircle(px, pz, 0.4);
            }
          }
        }
      }
    }
    const sidewalks = new THREE.Mesh(merge(sideGeos), sidewalkMat);
    sidewalks.receiveShadow = true;
    scene.add(sidewalks);
    const parks = new THREE.Mesh(merge(grassGeos), grassMat);
    parks.receiveShadow = true;
    scene.add(parks);

    /* ---- Ground outside the city ---- */
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 3600, 48, 72), new THREE.MeshStandardMaterial({ map: grassTex, color: 0xc8c0a0, roughness: 1 }));
    ground.geometry.rotateX(-Math.PI / 2);
    scaleUv(ground.geometry, 220);
    ground.position.set(COAST_X - 1200, -0.08, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    // Hedge + palm line at the edge of the drivable world
    colorBox(props, 2, 1.4, BOUND * 2 + 2, -BOUND, 0.7, 0, '#2f4a22');
    this.addBox(-BOUND - 40, -BOUND + 1, -2000, 2000, false);
    for (const s of [-1, 1]) {
      colorBox(props, BOUND + COAST_X, 1.4, 2, (COAST_X - BOUND) / 2, 0.7, s * BOUND, '#2f4a22');
      this.addBox(-2000, SHORE_X + 400, s > 0 ? BOUND - 1 : -BOUND - 40, s > 0 ? BOUND + 40 : -BOUND + 1, false);
      for (let t = -BOUND; t <= BOUND; t += 16) {
        if (s < 0) palms.push([-(BOUND + 4), 0, t + rng.range(-3, 3), rng.range(0.9, 1.4), rng() * 6.28]);
        if (t < COAST_X - 10) palms.push([t + rng.range(-3, 3), 0, s * (BOUND + 4), rng.range(0.9, 1.4), rng() * 6.28]);
      }
    }

    /* ---- Beach ---- */
    const sandGeo = new THREE.PlaneGeometry(260, 3600, 40, 1);
    sandGeo.rotateX(-Math.PI / 2);
    scaleUv(sandGeo, 40);
    sandGeo.translate(COAST_X + 130, 0, 0);
    const sp = sandGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) sp.setY(i, beachY(sp.getX(i)) + 0.005);
    sandGeo.computeVertexNormals();
    const sandMesh = new THREE.Mesh(sandGeo, sandMat);
    sandMesh.receiveShadow = true;
    scene.add(sandMesh);

    for (let z = -HALF; z <= HALF; z += 13) {
      if (Math.abs(z) < 10) continue;
      palms.push([COAST_X + 3, beachY(COAST_X + 3), z + rng.range(-1.5, 1.5), rng.range(0.95, 1.35), rng() * 6.28]);
      this.addCircle(COAST_X + 3, z, 0.4);
    }
    for (let i = 0; i < 46; i++) {
      const z = rng.range(-HALF, HALF);
      if (Math.abs(z) < 14) continue;
      const x = rng.range(COAST_X + 7, SHORE_X - 4);
      palms.push([x, beachY(x), z, rng.range(0.8, 1.2), rng() * 6.28]);
      this.addCircle(x, z, 0.4);
    }
    // Lifeguard towers
    const towerCols = ['#ff7eb3', '#5fd3e8', '#ffd166', '#9be37a'];
    for (let t = 0; t < 4; t++) {
      const z = -230 + t * 150 + (t >= 2 ? 30 : 0);
      const x = 316;
      const y = beachY(x);
      for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) colorBox(props, 0.18, 2.6, 0.18, x + lx, y + 1.3, z + lz, '#f5f1e6');
      colorBox(props, 3, 0.15, 3.4, x, y + 2.6, z, '#f5f1e6');
      colorBox(props, 2.6, 1.8, 2.6, x, y + 3.5, z, towerCols[t]);
      colorBox(props, 3.2, 0.2, 3.2, x, y + 4.5, z, '#ffffff');
      colorBox(props, 2.4, 0.5, 0.2, x + 0.5, y + 1.3, z - 1.8, '#f5f1e6', 0.0);
      this.addCircle(x, z, 2.0);
    }
    // Umbrellas
    const umb = ['#ff5f8a', '#38c8ff', '#ffd166', '#ffffff', '#b57bff'];
    for (let i = 0; i < 26; i++) {
      const z = rng.range(-HALF, HALF);
      if (Math.abs(z) < 14) continue;
      const x = rng.range(COAST_X + 9, SHORE_X - 3);
      const y = beachY(x);
      colorCyl(props, 0.04, 0.04, 2.4, x, y + 1.2, z, '#eeeeee', 6);
      const cone = new THREE.ConeGeometry(1.6, 0.6, 10);
      cone.translate(x, y + 2.5, z);
      cone.deleteAttribute('uv');
      props.push(paintGeo(cone, umb[i % umb.length]));
    }

    /* ---- Water ---- */
    const water = new Water(new THREE.PlaneGeometry(9000, 9000), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: T.waterNormals(),
      sunDirection: new THREE.Vector3(0, 1, 0),
      sunColor: 0xffffff,
      waterColor: 0x0e5672,
      distortionScale: 2.4,
      fog: true,
    });
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.6;
    water.material.uniforms.size.value = 1.2;
    scene.add(water);
    this.water = water;

    /* ---- Pier + Ferris wheel ---- */
    this.buildPier(props, neon, lights);

    /* ---- Mountains ---- */
    this.buildMountains();

    /* ---- Palms (instanced) ---- */
    const palmGeo = palmGeometries();
    const leafTex = T.leaf();
    const trunkMat = new THREE.MeshStandardMaterial({ map: T.trunk(), roughness: 0.95 });
    const frondMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
    const time = this.time;
    const sway = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
          #else
            float ph = 0.0;
          #endif
          float sw = max(0.0, position.y - 7.0);
          transformed.x += sin(uTime * 1.3 + ph) * 0.06 * sw;
          transformed.z += cos(uTime * 1.1 + ph) * 0.05 * sw;`,
        );
    };
    frondMat.onBeforeCompile = sway;
    const frondDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.45 });
    const trunks = new THREE.InstancedMesh(palmGeo.trunk, trunkMat, palms.length);
    const fronds = new THREE.InstancedMesh(palmGeo.fronds, frondMat, palms.length);
    fronds.customDepthMaterial = frondDepth;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    palms.forEach(([x, y, z, s, ry], i) => {
      e.set(rng.range(-0.05, 0.05), ry, rng.range(-0.05, 0.05));
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, m4);
      fronds.setMatrixAt(i, m4);
    });
    for (const m of [trunks, fronds]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      scene.add(m);
    }

    /* ---- Street lights (instanced) ---- */
    const pole = merge([
      new THREE.CylinderGeometry(0.09, 0.14, 7.6, 8).translate(0, 3.8, 0),
      new THREE.CylinderGeometry(0.26, 0.3, 0.5, 8).translate(0, 0.25, 0),
      new THREE.BoxGeometry(0.1, 0.1, 2.4).translate(0, 7.5, 1.15),
    ]);
    const head = new THREE.BoxGeometry(0.42, 0.14, 0.85).translate(0, 7.42, 2.3);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.7, roughness: 0.45 });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const poolMat = new THREE.MeshBasicMaterial({ map: T.glow(), color: 0xffa860, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const poolGeo = new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2);
    const poles = new THREE.InstancedMesh(pole, poleMat, lights.length);
    const heads = new THREE.InstancedMesh(head, headMat, lights.length);
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, lights.length);
    lights.forEach(([x, y, z, ry], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
      m4.makeTranslation(x + Math.sin(ry) * 2.3, y + 0.04, z + Math.cos(ry) * 2.3);
      pools.setMatrixAt(i, m4);
    });
    poles.castShadow = true;
    pools.renderOrder = 2;
    // Fake volumetric light cones under each lamp
    const coneGeo = new THREE.CylinderGeometry(0.25, 3.4, 7.2, 20, 1, true).translate(0, 3.75, 2.3);
    this.coneMat = lightConeMaterial(new THREE.Color(1.0, 0.68, 0.38));
    const cones = new THREE.InstancedMesh(coneGeo, this.coneMat, lights.length);
    lights.forEach(([x, y, z, ry], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
      cones.setMatrixAt(i, m4);
    });
    cones.renderOrder = 4;
    cones.computeBoundingSphere();
    scene.add(cones);
    for (const m of [poles, heads, pools]) {
      m.computeBoundingSphere();
      scene.add(m);
    }
    this.lampHeadMat = headMat;
    this.poolMat = poolMat;

    /* ---- Merge buildings & props ---- */
    for (const [k, geos] of Object.entries(buckets)) {
      const mat = k === 'shop' ? this.shopMat : this.facadeMats[k];
      const mesh = new THREE.Mesh(merge(geos), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    const propsMesh = new THREE.Mesh(merge(props), propsMat);
    propsMesh.castShadow = true;
    propsMesh.receiveShadow = true;
    scene.add(propsMesh);
    if (neon.length) scene.add(new THREE.Mesh(merge(neon), neonMat));
    if (reds.length) scene.add(new THREE.Mesh(merge(reds), redMat));

    // Spawn spots on road lanes
    for (let k = 0; k <= N; k++) {
      for (let i = 0; i < N; i++) {
        const mid = lineAt(i) + CELL / 2 + rng.range(-20, 20);
        const lane = rng() < 0.5 ? -LANE : LANE;
        this.pickupSpots.push(rng() < 0.5 ? [mid, 0, lineAt(k) + lane] : [lineAt(k) + lane, 0, mid]);
      }
    }
    for (let i = 0; i < 10; i++) {
      const x = rng.range(COAST_X + 6, SHORE_X - 4);
      this.pickupSpots.push([x, beachY(x), rng.range(-HALF, HALF)]);
    }
    this.pickupSpots.push([400, PIER.deck, 0], [455, PIER.deck, 9], [455, PIER.deck, -9]);

    // Static geometry never moves: skip per-frame matrix recomputation
    for (const o of scene.children) {
      if (before.has(o) || o === this.ferrisGroup) continue;
      o.updateMatrixWorld(true);
      o.traverse((c) => (c.matrixAutoUpdate = false));
    }
  }

  buildLots(type, x0, x1, z0, z1, dist, add, props, neon, reds, rng) {
    const IN = 3.5;
    const ax = x0 + IN;
    const az = z0 + IN;
    const W = x1 - x0 - IN * 2;
    const quad = [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
    let lots;
    const pr = rng();
    if (type === 'downtown') lots = pr < 0.4 ? [[0, 0, 1, 1]] : pr < 0.7 ? [[0, 0, 0.5, 1], [0.5, 0, 1, 1]] : quad;
    else if (type === 'beach') lots = pr < 0.5 ? quad : [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 2 / 3], [0, 2 / 3, 1, 1]];
    else lots = pr < 0.55 ? quad : pr < 0.85 ? [[0, 0, 1, 0.5], [0, 0.5, 1, 1]] : [[0, 0, 1, 1]];

    const neonCols = ['#ff3fa4', '#38f3ff', '#b45bff', '#ff9a3c', '#5dff9e'];
    for (const [u0, v0, u1, v1] of lots) {
      const gap = 1.3;
      const lx0 = ax + u0 * W + (u0 > 0 ? gap : 0);
      const lx1 = ax + u1 * W - (u1 < 1 ? gap : 0);
      const lz0 = az + v0 * W + (v0 > 0 ? gap : 0);
      const lz1 = az + v1 * W - (v1 < 1 ? gap : 0);
      const shrink = rng.range(0, 2.5);
      const w = lx1 - lx0 - shrink;
      const d = lz1 - lz0 - shrink;
      const x = (lx0 + lx1) / 2;
      const z = (lz0 + lz1) / 2;
      const y0 = SIDEWALK_H;
      let h;
      let style;
      if (type === 'downtown') {
        const base = 40 + 160 * Math.max(0, 1 - dist / 175);
        h = base * rng.range(0.55, 1.15) * (lots.length === 4 ? 0.65 : 1);
        style = rng.pick(['glassBlue', 'glassBlue', 'glassTeal', 'glassGold', 'concrete', 'concreteDark']);
      } else if (type === 'beach') {
        h = rng.range(9, 28);
        style = rng.pick(['decoPink', 'decoMint', 'decoCream', 'decoSky']);
      } else {
        h = rng.range(10, 42);
        style = rng.pick(['concrete', 'concreteDark', 'resTerra', 'resSand', 'decoCream', 'decoMint', 'resTerra', 'glassTeal']);
        if (style.startsWith('res')) h = Math.min(h, 26);
      }
      h = Math.round(h / 3.5) * 3.5 + 0.5;
      const uOff = rng.int(0, 7) / 8;

      const shopFront = type !== 'beach' && !style.startsWith('res');
      if (shopFront) add('shop', shopBox(w + 0.5, 4.2, d + 0.5, x, y0, z, rng.int(0, 3) / 4));
      add(style, facadeBox(w, h, d, x, y0, z, uOff));
      this.addBox(x - w / 2 - 0.3, x + w / 2 + 0.3, z - d / 2 - 0.3, z + d / 2 + 0.3);

      let top = y0 + h;
      let tw = w;
      let td = d;
      // Setback tiers on towers
      if (h > 70 && rng() < 0.7) {
        const tiers = rng() < 0.5 ? 1 : 2;
        for (let t = 0; t < tiers; t++) {
          tw *= rng.range(0.62, 0.8);
          td *= rng.range(0.62, 0.8);
          const th = Math.round((h * rng.range(0.15, 0.3)) / 3.5) * 3.5;
          add(style, facadeBox(tw, th, td, x, top, z, uOff));
          top += th;
        }
      }
      // Rooftop crown lights / spires
      if (type === 'downtown' && h > 60) {
        if (rng() < 0.55) {
          const c = rng.pick(['#ffffff', '#38f3ff', '#ffd36b', '#ff3fa4']);
          for (const [bw, bd, bx, bz] of [[tw, 0.25, 0, td / 2], [tw, 0.25, 0, -td / 2], [0.25, td, tw / 2, 0], [0.25, td, -tw / 2, 0]]) {
            colorBox(neon, bw + 0.3, 0.35, bd + 0.3, x + bx, top - 0.4, z + bz, c);
          }
        }
        if (rng() < 0.5) {
          const sh = rng.range(10, 30);
          colorCyl(props, 0.25, 0.6, sh, x, top + sh / 2, z, '#8d939a', 8);
          colorBox(reds, 0.8, 0.8, 0.8, x, top + sh + 0.4, z, '#ff2020');
        } else {
          for (const [cx, cz] of [[tw / 2, td / 2], [-tw / 2, -td / 2]]) colorBox(reds, 0.6, 0.6, 0.6, x + cx * 0.9, top + 0.3, z + cz * 0.9, '#ff2020');
        }
      } else {
        // Rooftop clutter
        const n = rng.int(1, 3);
        for (let a = 0; a < n; a++) {
          const bw = rng.range(2, 5);
          const bd = rng.range(2, 5);
          colorBox(props, bw, rng.range(1.2, 2.5), bd, x + rng.range(-w / 2 + bw, w / 2 - bw) * 0.7, top + 0.8, z + rng.range(-d / 2 + bd, d / 2 - bd) * 0.7, rng.pick(['#9aa0a6', '#7d8288', '#b8b8b0']));
        }
        colorBox(props, w + 0.3, 0.6, 0.3, x, top + 0.3, z + d / 2, '#8a857c');
        colorBox(props, w + 0.3, 0.6, 0.3, x, top + 0.3, z - d / 2, '#8a857c');
        colorBox(props, 0.3, 0.6, d, x + w / 2, top + 0.3, z, '#8a857c');
        colorBox(props, 0.3, 0.6, d, x - w / 2, top + 0.3, z, '#8a857c');
        if (style.startsWith('res') && rng() < 0.5) {
          colorCyl(props, 1.4, 1.4, 2.6, x, top + 3.4, z, '#6d5a48', 12);
          for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) colorBox(props, 0.15, 2, 0.15, x + lx, top + 1, z + lz, '#3a3a3a');
        }
      }
      // Neon outlines on deco buildings
      if (style.startsWith('deco') && rng() < 0.75) {
        const c = rng.pick(neonCols);
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          colorBox(neon, 0.22, h - 1, 0.22, x + (sx * (w + 0.2)) / 2, y0 + h / 2 + 0.5, z + (sz * (d + 0.2)) / 2, c);
        }
        const c2 = rng.pick(neonCols);
        for (const yy of [y0 + h - 0.6, y0 + 4.6]) {
          colorBox(neon, w + 0.4, 0.22, 0.22, x, yy, z + d / 2 + 0.12, c2);
          colorBox(neon, w + 0.4, 0.22, 0.22, x, yy, z - d / 2 - 0.12, c2);
          colorBox(neon, 0.22, 0.22, d + 0.4, x + w / 2 + 0.12, yy, z, c2);
          colorBox(neon, 0.22, 0.22, d + 0.4, x - w / 2 - 0.12, yy, z, c2);
        }
      }
    }
  }

  buildPier(props, neon, lights) {
    const P = PIER;
    const wood = '#8a6a4a';
    const y = P.deck;
    // ramp
    const rampLen = 330 - P.x0;
    const y0 = beachY(P.x0);
    const ramp = new THREE.BoxGeometry(Math.hypot(rampLen, y - y0) + 0.4, 0.4, P.hw * 2);
    ramp.rotateZ(Math.atan2(y - y0, rampLen));
    ramp.translate((P.x0 + 330) / 2, (y0 + y) / 2 - 0.2, 0);
    ramp.deleteAttribute('uv');
    props.push(paintGeo(ramp, wood));
    colorBox(props, P.x1 - 330 + 1, 0.5, P.hw * 2, (330 + P.x1) / 2, y - 0.25, 0, wood);
    colorBox(props, P.plat1 - P.plat0, 0.5, P.phw * 2, (P.plat0 + P.plat1) / 2, y - 0.25, 0, wood);
    for (let x = 330; x < P.plat1; x += 8) {
      const zs = x < P.plat0 ? [-P.hw + 0.3, P.hw - 0.3] : [-P.phw + 0.4, 0, P.phw - 0.4];
      for (const z of zs) colorCyl(props, 0.3, 0.3, 8, x, y - 4.2, z, '#5b4632', 8);
    }
    // railings
    for (const s of [-1, 1]) {
      colorBox(props, P.plat0 - 322, 0.12, 0.12, (322 + P.plat0) / 2, y + 1.0, s * (P.hw + 0.05), '#f2efe8');
      colorBox(props, P.plat1 - P.plat0, 0.12, 0.12, (P.plat0 + P.plat1) / 2, y + 1.0, s * (P.phw + 0.05), '#f2efe8');
      colorBox(props, 0.12, 0.12, P.phw - P.hw, P.plat0, y + 1.0, s * (P.hw + P.phw) / 2, '#f2efe8');
      for (let x = 322; x < P.plat1; x += 3) {
        const z = x < P.plat0 ? P.hw : P.phw;
        colorBox(props, 0.1, 1.0, 0.1, x, y + 0.5, s * (z + 0.05), '#f2efe8');
      }
    }
    colorBox(props, 0.12, 0.12, P.phw * 2, P.plat1, y + 1.0, 0, '#f2efe8');
    for (let x = 340; x < P.plat0; x += 24) {
      lights.push([x, y, -P.hw + 0.4, 0]);
      lights.push([x + 12, y, P.hw - 0.4, Math.PI]);
      this.addCircle(x, -P.hw + 0.4, 0.22);
      this.addCircle(x + 12, P.hw - 0.4, 0.22);
    }

    // Colliders: water edge + pier rails
    this.addBox(SHORE_X, P.plat0, P.hw, 2000, false);
    this.addBox(SHORE_X, P.plat0, -2000, -P.hw, false);
    this.addBox(P.plat0 - 0.5, P.plat1 + 2, P.phw, 2000, false);
    this.addBox(P.plat0 - 0.5, P.plat1 + 2, -2000, -P.phw, false);
    this.addBox(P.plat1, 3000, -2000, 2000, false);
    this.addBox(P.x0, 330, P.hw + 0.2, P.hw + 0.6, false);
    this.addBox(P.x0, 330, -P.hw - 0.6, -P.hw - 0.2, false);

    // Ferris wheel
    const fw = new THREE.Group();
    const cx = 458;
    const cy = y + 27;
    fw.position.set(cx, cy, 0);
    const R = 23;
    const frame = [];
    const lamps = [];
    for (const s of [-1.3, 1.3]) {
      const rim = new THREE.TorusGeometry(R, 0.28, 8, 96);
      rim.rotateY(Math.PI / 2);
      rim.translate(s, 0, 0);
      rim.deleteAttribute('uv');
      frame.push(paintGeo(rim, '#eef2f6'));
      const glowRim = new THREE.TorusGeometry(R + 0.35, 0.12, 6, 128);
      glowRim.rotateY(Math.PI / 2);
      glowRim.translate(s, 0, 0);
      glowRim.deleteAttribute('uv');
      lamps.push(paintGeo(glowRim, '#ffffff'));
    }
    const SPOKES = 18;
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      for (const s of [-1.3, 1.3]) {
        const sg = new THREE.BoxGeometry(0.16, R, 0.16);
        sg.translate(0, R / 2, 0);
        sg.rotateX(a);
        sg.translate(s, 0, 0);
        sg.deleteAttribute('uv');
        frame.push(paintGeo(sg, '#dfe5ea'));
      }
      const lg = new THREE.BoxGeometry(0.1, R - 2, 0.1);
      lg.translate(0, R / 2 + 1, 0);
      lg.rotateX(a + Math.PI / SPOKES);
      lg.deleteAttribute('uv');
      lamps.push(paintGeo(lg, '#ffffff'));
    }
    const hub = new THREE.CylinderGeometry(1.6, 1.6, 3.6, 16);
    hub.rotateZ(Math.PI / 2);
    hub.deleteAttribute('uv');
    frame.push(paintGeo(hub, '#c9ced4'));
    const wheel = new THREE.Group();
    const frameMesh = new THREE.Mesh(merge(frame), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.35 }));
    frameMesh.castShadow = true;
    const wheelNeonMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    wheel.add(frameMesh, new THREE.Mesh(merge(lamps), wheelNeonMat));
    fw.add(wheel);

    const cabins = [];
    const cabinCols = ['#ff5f8a', '#38c8ff', '#ffd166', '#9be37a', '#b57bff', '#ff9a3c'];
    const cabinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      const list = [];
      colorBox(list, 1.8, 1.8, 2.2, 0, -1.6, 0, cabinCols[i % cabinCols.length]);
      colorBox(list, 1.9, 0.2, 2.4, 0, -0.6, 0, '#ffffff');
      colorBox(list, 0.1, 0.8, 0.1, 0, -0.2, 0, '#cccccc');
      const cab = new THREE.Mesh(merge(list), cabinMat);
      cab.position.set(0, Math.cos(a) * R, Math.sin(a) * R);
      cab.castShadow = true;
      wheel.add(cab);
      cabins.push(cab);
    }
    // A-frame supports
    const legs = [];
    for (const s of [-3, 3]) {
      for (const lz of [-14, 14]) {
        const len = Math.hypot(cy - y, lz);
        const lg = new THREE.BoxGeometry(0.7, len, 0.7);
        lg.rotateX(Math.atan2(lz, cy - y) * -1);
        lg.translate(s, -(cy - y) / 2, lz / 2);
        lg.deleteAttribute('uv');
        legs.push(paintGeo(lg, '#d6dbe0'));
        this.addCircle(cx + s, lz, 0.8);
      }
    }
    const axle = new THREE.CylinderGeometry(0.5, 0.5, 7, 10);
    axle.rotateZ(Math.PI / 2);
    axle.deleteAttribute('uv');
    legs.push(paintGeo(axle, '#9aa0a6'));
    const legMesh = new THREE.Mesh(merge(legs), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.4 }));
    legMesh.castShadow = true;
    fw.add(legMesh);
    this.scene.add(fw);
    this.ferrisGroup = fw;
    this.ferris = { wheel, cabins, mat: wheelNeonMat };
  }

  buildMountains() {
    const S = 4000;
    const g = new THREE.PlaneGeometry(S, S, 180, 180);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const cLow = new THREE.Color('#4c5a37');
    const cMid = new THREE.Color('#6d6352');
    const cHigh = new THREE.Color('#8f8c88');
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z);
      const m = smoothstep(650, 1150, r) * (1 - smoothstep(150, 650, x));
      let h = -4;
      if (m > 0.001) {
        const n = fbm(x / 300 + 10, z / 300 + 3, 6);
        const ridge = 1 - Math.abs(fbm(x / 520, z / 520, 3) * 2 - 1);
        h = m * (n * 330 + ridge * 160) - 4;
      }
      p.setY(i, h);
      const t = clamp(h / 260, 0, 1);
      if (t < 0.5) tmp.copy(cLow).lerp(cMid, t * 2);
      else tmp.copy(cMid).lerp(cHigh, (t - 0.5) * 2);
      cols[i * 3] = tmp.r;
      cols[i * 3 + 1] = tmp.g;
      cols[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    mesh.receiveShadow = false;
    this.scene.add(mesh);
  }

  update(dt, t, night, sunDir) {
    this.time.value = t;
    for (const m of Object.values(this.facadeMats)) m.emissiveIntensity = lerp(0.04, 0.8, night);
    this.shopMat.emissiveIntensity = lerp(0.35, 1.4, night);
    this.mats.neonMat.color.setScalar(lerp(1.3, 3, night));
    const blink = Math.sin(t * 3) > 0.55 ? 1 : 0.15;
    this.mats.redMat.color.setRGB(blink * lerp(2, 9, night), 0.05, 0.05);
    this.lampHeadMat.color.setRGB(lerp(0.75, 5, night), lerp(0.75, 3.8, night), lerp(0.72, 2.4, night));
    this.poolMat.opacity = night * 0.4;
    this.coneMat.uniforms.uIntensity.value = night * 0.13;
    // Streets look rain-slick at night
    this.mats.roadMat.roughness = lerp(1, 0.55, night);
    this.mats.interMat.roughness = lerp(1, 0.55, night);
    const f = this.ferris;
    f.wheel.rotation.x += dt * 0.06;
    for (const c of f.cabins) c.rotation.x = -f.wheel.rotation.x;
    const hue = (t * 0.05) % 1;
    f.mat.color.setHSL(hue, 0.9, 0.6).multiplyScalar(lerp(1.4, 3.5, night));
    const wu = this.water.material.uniforms;
    wu.time.value = t * 0.6;
    wu.sunDirection.value.copy(sunDir);
    wu.waterColor.value.setRGB(lerp(0.016, 0.004, night), lerp(0.1, 0.018, night), lerp(0.15, 0.035, night));
  }
}

function paintGeo(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Additive view-dependent cone used for fake volumetric light shafts. */
export function lightConeMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uIntensity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vH;
      void main() {
        #ifdef USE_INSTANCING
          mat4 m = modelMatrix * instanceMatrix;
        #else
          mat4 m = modelMatrix;
        #endif
        vec4 wp = m * vec4(position, 1.0);
        vN = normalize(mat3(m) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vH = uv.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vN;
      varying vec3 vV;
      varying float vH;
      void main() {
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
        float a = f * pow(vH, 1.5) * uIntensity;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
