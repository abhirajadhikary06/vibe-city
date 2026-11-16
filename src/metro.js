import * as THREE from 'three';
import { METRO_PARKS, METRO_DEPTH, PLATFORM_H, SIDEWALK_H, metroStation } from './world.js';
import { Consist, Track, alongTrack, railMats, signTexture } from './rail.js';
import { merge, clamp } from './utils.js';

/*
 * Underground metro: one line running east–west beneath a row of parks.
 * Each park has a stairway down to a tiled station hall; tunnels link the
 * stations. Below street level the player uses this layer's floors and walls
 * instead of the city's (see World.groundAt / collideAt).
 */

const D = METRO_DEPTH;
const HALL_H = 6.5;
const TUNNEL_H = 5.5;
const HALL_HL = 32; // half length of a station hall
const NAMES = ['HARBOR WEST', 'MIDTOWN', 'CENTRAL PARK', 'OCEAN DRIVE'];

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** Axis-aligned box from min/max corners. */
const slab = (x0, x1, y0, y1, z0, z1) => box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c9c4b8';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const v = 236 + Math.floor(Math.random() * 14);
      g.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
      g.fillRect(x * 64 + 2, y * 32 + 2, 60, 28);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Box UVs in world metres so tiles stay square on any wall. */
function worldUV(g, scale) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const u = ax > 0.5 ? p.getZ(i) : p.getX(i);
    const v = ay > 0.5 ? p.getZ(i) : p.getY(i);
    uv.setXY(i, u / scale, v / scale);
  }
  return g;
}

export class Metro {
  constructor(scene, world, fx) {
    this.world = world;
    this.stations = METRO_PARKS.map(([i, j], k) => ({ ...metroStation(i, j), name: NAMES[k % NAMES.length] }));
    const S = this.stations;
    const tz = S[0].tz;
    this.tz = tz;
    const xa = S[0].cx - HALL_HL - 40;
    const xb = S[S.length - 1].cx + HALL_HL + 40;
    this.xa = xa;
    this.xb = xb;
    this.walls = [];
    this.floors = [];
    this.ceilings = [];

    const M = railMats();
    const tiles = new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.35, metalness: 0.05, envMapIntensity: 0.6 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x77736d, roughness: 0.95, envMapIntensity: 0.4 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.5 });
    const band = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.4, emissive: 0x2a1450, emissiveIntensity: 0.6 });
    this.lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.5, 2.3) });
    const tile = [];
    const conc = [];
    const flo = [];
    const bands = [];
    const lamps = [];
    const yellow = [];
    const darkG = [];
    const wall = (x0, x1, z0, z1) => this.walls.push({ x0, x1, z0, z1 });

    /* ---- Tunnels between and beyond the stations ---- */
    const spans = [[xa, S[0].cx - HALL_HL]];
    for (let k = 0; k < S.length - 1; k++) spans.push([S[k].cx + HALL_HL, S[k + 1].cx - HALL_HL]);
    spans.push([S[S.length - 1].cx + HALL_HL, xb]);
    for (const [a, b] of spans) {
      conc.push(slab(a, b, D - 0.4, D, tz - 3, tz + 3)); // floor
      conc.push(slab(a, b, D + TUNNEL_H, D + TUNNEL_H + 0.4, tz - 3.4, tz + 3.4)); // roof
      conc.push(slab(a, b, D, D + TUNNEL_H, tz - 3.4, tz - 3), slab(a, b, D, D + TUNNEL_H, tz + 3, tz + 3.4));
      wall(a, b, tz - 4, tz - 3);
      wall(a, b, tz + 3, tz + 4);
      this.floors.push({ x0: a, x1: b, z0: tz - 3, z1: tz + 3, h: D });
      this.ceilings.push({ x0: a, x1: b, z0: tz - 3.4, z1: tz + 3.4, h: D + TUNNEL_H });
      for (let x = a + 6; x < b; x += 12) {
        lamps.push(box(0.6, 0.12, 0.08, x, D + 3.6, tz - 2.95), box(0.6, 0.12, 0.08, x, D + 3.6, tz + 2.95));
      }
      // cable runs
      darkG.push(slab(a, b, D + 2.6, D + 2.68, tz - 3, tz - 2.9), slab(a, b, D + 2.8, D + 2.88, tz - 3, tz - 2.9));
    }
    // Dead ends with buffer stops
    for (const x of [xa, xb]) {
      conc.push(slab(x - 0.4, x + 0.4, D, D + TUNNEL_H, tz - 3.4, tz + 3.4));
      wall(x - 1, x + (x === xa ? 0.4 : 1), tz - 4, tz + 4);
      yellow.push(box(2.6, 1.1, 0.6, 0, 0, 0).rotateY(Math.PI / 2).translate(x + (x === xa ? 1 : -1), D + 0.55, tz));
    }

    /* ---- Stations ---- */
    for (const st of S) {
      const { cx, stair } = st;
      const x0 = cx - HALL_HL;
      const x1 = cx + HALL_HL;
      const zb = tz - 3.5; // track-side wall
      const zp0 = tz + 1.9; // platform edge
      const zf = tz + 9; // back wall
      const top = D + HALL_H;
      // Floor, platform and ceiling (with the stair opening)
      flo.push(slab(x0, x1, D - 0.4, D, zb, zf));
      flo.push(slab(x0 + 2, x1 - 2, D, D + PLATFORM_H, zp0, zf));
      yellow.push(slab(x0 + 2, x1 - 2, D + PLATFORM_H, D + PLATFORM_H + 0.01, zp0, zp0 + 0.35));
      const ceil = [[x0, x1, zb - 0.4, stair.z0], [x0, x1, stair.z1, zf + 0.4], [x0, stair.x0, stair.z0, stair.z1], [stair.x1, x1, stair.z0, stair.z1]];
      for (const [a, b, c, d] of ceil) conc.push(slab(a, b, top, top + 0.4, c, d));
      this.floors.push({ x0: x0 + 2, x1: x1 - 2, z0: zp0, z1: zf, h: D + PLATFORM_H });
      this.floors.push({ x0, x1, z0: zb, z1: zf, h: D });
      this.ceilings.push({ x0, x1, z0: zb, z1: zf, h: top });
      // Tiled walls with a coloured band
      tile.push(slab(x0, x1, D, top, zb - 0.3, zb), slab(x0, x1, D + PLATFORM_H, top, zf, zf + 0.3));
      bands.push(slab(x0, x1, D + 2.7, D + 3.1, zb + 0.005, zb + 0.02), slab(x0, x1, D + PLATFORM_H + 2.1, D + PLATFORM_H + 2.5, zf - 0.02, zf - 0.005));
      wall(x0, x1, zb - 1, zb);
      wall(x0, x1, zf, zf + 1);
      // End walls: solid beside the platform, a portal over the track
      for (const x of [x0, x1]) {
        const w0 = x === x0 ? x - 0.3 : x;
        const w1 = w0 + 0.3;
        tile.push(slab(w0, w1, D, top, tz + 3, zf), slab(w0, w1, D, top, zb, tz - 3), slab(w0, w1, D + TUNNEL_H, top, tz - 3, tz + 3));
        wall(w0 - (x === x0 ? 0.7 : 0), w1 + (x === x1 ? 0.7 : 0), tz + 3, zf);
        wall(w0 - (x === x0 ? 0.7 : 0), w1 + (x === x1 ? 0.7 : 0), zb, tz - 3);
      }
      // Ceiling light strips
      for (let x = x0 + 4; x < x1 - 2; x += 8) {
        if (x > stair.x0 - 1 && x < stair.x1 + 1) continue;
        lamps.push(box(3.2, 0.06, 0.3, x, top - 0.04, tz + 5.4), box(3.2, 0.06, 0.3, x, top - 0.04, tz));
      }
      // Columns along the platform, benches against the back wall
      for (let x = x0 + 6; x < x1 - 4; x += 9) {
        if (x > stair.x0 - 2 && x < stair.x1 + 2) continue;
        tile.push(box(0.6, top - D - PLATFORM_H, 0.6, x, (top + D + PLATFORM_H) / 2, tz + 3.6));
        wall(x - 0.3, x + 0.3, tz + 3.3, tz + 3.9);
        darkG.push(box(2.2, 0.08, 0.5, x + 4.5, D + PLATFORM_H + 0.45, zf - 0.45), box(2.2, 0.5, 0.06, x + 4.5, D + PLATFORM_H + 0.7, zf - 0.2));
      }
      // Stairway: a stepped block from the platform up to the park, walled on both sides
      const steps = 28;
      const run = (stair.x1 - stair.x0) / steps;
      const hTop = SIDEWALK_H;
      const hBot = D + PLATFORM_H;
      for (let k = 0; k < steps; k++) {
        const sx0 = stair.x0 + k * run;
        const yTop = hBot + ((k + 1) / steps) * (hTop - hBot);
        flo.push(slab(sx0, sx0 + run, hBot, yTop, stair.z0, stair.z1));
        yellow.push(slab(sx0 + run - 0.06, sx0 + run, yTop, yTop + 0.005, stair.z0, stair.z1));
      }
      this.world.addRamp(stair.x0, stair.x1, stair.z0, stair.z1, hBot, hTop);
      for (const [z0, z1] of [[stair.z0 - 0.25, stair.z0], [stair.z1, stair.z1 + 0.25]]) {
        tile.push(slab(stair.x0, stair.x1, hBot, hTop + 1.0, z0, z1));
        wall(stair.x0, stair.x1, z0, z1);
      }
      // Shaft end above the stair foot, and the wall under the top step
      tile.push(slab(stair.x0 - 0.25, stair.x0, top, hTop + 1.0, stair.z0 - 0.25, stair.z1 + 0.25));
      wall(stair.x1, stair.x1 + 0.3, stair.z0, stair.z1);
      this.ceilings.unshift({ x0: stair.x0, x1: stair.x1, z0: stair.z0, z1: stair.z1, h: 40 });
      // Handrails
      for (const z of [stair.z0 + 0.12, stair.z1 - 0.12]) {
        const len = Math.hypot(stair.x1 - stair.x0, hTop - hBot);
        const g = new THREE.CylinderGeometry(0.03, 0.03, len, 6).rotateZ(Math.PI / 2 - Math.atan2(hTop - hBot, stair.x1 - stair.x0));
        darkG.push(g.translate((stair.x0 + stair.x1) / 2, (hTop + hBot) / 2 + 0.9, z));
      }
      // Street level: railings round the opening, a canopy and the M sign
      world.addBox(stair.x0 - 0.15, stair.x1, stair.z0 - 0.3, stair.z0, false);
      world.addBox(stair.x0 - 0.15, stair.x1, stair.z1, stair.z1 + 0.3, false);
      world.addBox(stair.x0 - 0.4, stair.x0, stair.z0 - 0.3, stair.z1 + 0.3, false);
      world.addCircle(stair.x1 + 0.4, (stair.z0 + stair.z1) / 2, 0.2);
      darkG.push(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 8).translate(stair.x1 + 0.4, hTop + 0.5, (stair.z0 + stair.z1) / 2));
      for (const z of [stair.z0 - 0.4, stair.z1 + 0.4]) {
        darkG.push(slab(stair.x0 - 0.4, stair.x1, hTop + 0.95, hTop + 1.05, z - 0.04, z + 0.04));
        for (let x = stair.x0; x <= stair.x1; x += 2) darkG.push(box(0.06, 1.0, 0.06, x, hTop + 0.5, z));
        for (const x of [stair.x1 - 0.2, stair.x1 - 6]) darkG.push(box(0.12, 3.2, 0.12, x, hTop + 1.6, z));
      }
      darkG.push(slab(stair.x1 - 6.4, stair.x1 + 0.2, hTop + 3.2, hTop + 3.35, stair.z0 - 0.7, stair.z1 + 0.7));
      st.sign = { x: stair.x1 + 1.6, z: stair.z1 + 1.4, top: hTop + 3.6 };
      darkG.push(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8).translate(st.sign.x, hTop + 1.6, st.sign.z));
    }

    const meshes = [
      [merge(tile.map((g) => worldUV(g, 1.2))), tiles],
      [merge(conc), concrete],
      [merge(flo), floorMat],
      [merge(bands), band],
      [merge(lamps), this.lampMat],
      [merge(yellow), M.yellow],
      [merge(darkG), M.dark],
    ];
    this.statics = [];
    for (const [g, m] of meshes) {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = m !== this.lampMat;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.statics.push(mesh);
    }
    // Station name boards on the track wall, and the glowing M at each entrance
    const mTex = mSignTexture();
    for (const st of S) {
      const tex = signTexture(st.name, 'VIBE METRO');
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
      for (let x = st.cx - 24; x <= st.cx + 24; x += 24) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), mat);
        sign.position.set(x, D + 3.6, tz - 3.47);
        scene.add(sign);
        this.statics.push(sign);
      }
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ map: mTex, emissive: 0xffffff, emissiveMap: mTex, emissiveIntensity: 1.5 }));
      m.position.set(st.sign.x, st.sign.top, st.sign.z);
      scene.add(m);
      this.statics.push(m);
    }
    // Rails on a concrete bed
    this.track = new Track([[xa + 1, tz], [xb - 1, tz]], 1);
    const rails = alongTrack(this.track, 10, (len) => [box(0.075, 0.12, len, 0.7175, D + 0.06, 0), box(0.075, 0.12, len, -0.7175, D + 0.06, 0), box(0.12, 0.1, len, 1.25, D + 0.05, 0)]);
    const rm = new THREE.Mesh(merge(rails), M.steel);
    scene.add(rm);
    this.statics.push(rm);
    for (const m of this.statics) {
      m.updateMatrixWorld(true);
      m.matrixAutoUpdate = false;
    }
    this.train = new Consist(scene, this.track, 'metro', S.map((s) => s.cx - (xa + 1)), fx, 0x8b5cf6);
    world.under = this;
  }

  floorAt(x, z) {
    for (const f of this.floors) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) return f.h;
    return null;
  }
  ceilingAt(x, z) {
    for (const c of this.ceilings) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return c.h;
    return D + TUNNEL_H;
  }
  /** Is this point inside the metro (below street level)? */
  inside(x, z) {
    return this.floorAt(x, z) !== null;
  }

  collideCircle(x, z, r) {
    let px = 0;
    let pz = 0;
    let hit = false;
    for (const o of this.walls) {
      const cx = x + px;
      const cz = z + pz;
      if (cx < o.x0 - r || cx > o.x1 + r || cz < o.z0 - r || cz > o.z1 + r) continue;
      const qx = clamp(cx, o.x0, o.x1);
      const qz = clamp(cz, o.z0, o.z1);
      const dx = cx - qx;
      const dz = cz - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
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
    }
    if (!hit) return null;
    const l = Math.hypot(px, pz) || 1;
    return { px, pz, nx: px / l, nz: pz / l };
  }

  /** 2D segment vs walls; fraction of the first hit (1 = clear). */
  raycast(ax, az, bx, bz) {
    const h = this.raycastHit(ax, az, bx, bz);
    return h ? h.t : 1;
  }
  raycastHit(ax, az, bx, bz) {
    let best = 1;
    let nx = 0;
    let nz = 0;
    const dx = bx - ax;
    const dz = bz - az;
    for (const o of this.walls) {
      let t0 = 0;
      let t1 = 1;
      let ax0 = 0;
      let ok = true;
      for (const [p, d, lo, hi, axis] of [[ax, dx, o.x0, o.x1, 0], [az, dz, o.z0, o.z1, 1]]) {
        if (Math.abs(d) < 1e-9) {
          if (p < lo || p > hi) ok = false;
        } else {
          let ta = (lo - p) / d;
          let tb = (hi - p) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          if (ta > t0) {
            t0 = ta;
            ax0 = axis;
          }
          t1 = Math.min(t1, tb);
          if (t0 > t1) ok = false;
        }
        if (!ok) break;
      }
      if (ok && t0 > 0 && t0 < best) {
        best = t0;
        nx = ax0 === 0 ? -Math.sign(dx) : 0;
        nz = ax0 === 1 ? -Math.sign(dz) : 0;
      }
    }
    return best < 1 ? { t: best, nx, nz } : null;
  }

  update(night) {
    this.lampMat.color.setScalar(2.2 + night * 0.6);
  }
}

function mSignTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#8b5cf6';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffffff';
  g.font = 'bold 96px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('M', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
