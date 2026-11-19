import MAP from './data/kolkata.json';
import { clamp } from './utils.js';

/*
 * Map data and the geometry built on it: polylines, polygons, a spatial grid,
 * the road graph (traffic lanes, route-finding) and the sidewalks people walk.
 * Coordinates are metres: x east, z south, origin at the centre of the map.
 */

export { MAP };
export const NODES = MAP.nodes;
export const nodeXZ = (i) => [NODES[i * 2], NODES[i * 2 + 1]];

/* ---------- Spatial hash ---------- */
export class Grid {
  constructor(size = 24) {
    this.size = size;
    this.map = new Map();
    this.stamp = 0;
  }
  key(ix, iz) {
    return (ix + 2048) * 8192 + (iz + 2048);
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

/* ---------- Polygons ---------- */
/** [x0, z0, x1, z1, ...] -> { xs, zs, n, x0, x1, z0, z1 } */
export function polygon(flat) {
  const n = flat.length / 2;
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    xs[i] = flat[i * 2];
    zs[i] = flat[i * 2 + 1];
    x0 = Math.min(x0, xs[i]);
    x1 = Math.max(x1, xs[i]);
    z0 = Math.min(z0, zs[i]);
    z1 = Math.max(z1, zs[i]);
  }
  return { xs, zs, n, x0, x1, z0, z1 };
}
export function inPoly(p, x, z) {
  if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return false;
  let c = false;
  const { xs, zs, n } = p;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (zs[i] > z !== zs[j] > z && x < ((xs[j] - xs[i]) * (z - zs[i])) / (zs[j] - zs[i]) + xs[i]) c = !c;
  }
  return c;
}
/** Nearest point on a polygon's outline: { x, z, d, nx, nz } (normal points out of the edge's left side). */
export function nearestOnRing(p, x, z, out = {}) {
  const { xs, zs, n } = p;
  let bd = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = xs[j];
    const az = zs[j];
    const dx = xs[i] - ax;
    const dz = zs[i] - az;
    const l2 = dx * dx + dz * dz || 1e-9;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const qx = ax + dx * t;
    const qz = az + dz * t;
    const d = (x - qx) ** 2 + (z - qz) ** 2;
    if (d < bd) {
      bd = d;
      out.x = qx;
      out.z = qz;
      const l = Math.sqrt(l2);
      out.ex = dx / l;
      out.ez = dz / l;
    }
  }
  out.d = Math.sqrt(bd);
  return out;
}
export function polyArea(p) {
  let a = 0;
  for (let i = 0, j = p.n - 1; i < p.n; j = i++) a += p.xs[j] * p.zs[i] - p.xs[i] * p.zs[j];
  return a / 2;
}
/** Fraction along a->b where it first crosses the polygon outline, with the edge normal; or null. */
export function rayPoly(p, ax, az, bx, bz, best = 1) {
  const { xs, zs, n } = p;
  const dx = bx - ax;
  const dz = bz - az;
  let hit = null;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ex = xs[i] - xs[j];
    const ez = zs[i] - zs[j];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const fx = xs[j] - ax;
    const fz = zs[j] - az;
    const t = (fx * ez - fz * ex) / den;
    const u = (fx * dz - fz * dx) / den;
    if (t < 0 || t >= best || u < 0 || u > 1) continue;
    best = t;
    const l = Math.hypot(ex, ez) || 1;
    let nx = ez / l;
    let nz = -ex / l;
    if (nx * dx + nz * dz > 0) {
      nx = -nx;
      nz = -nz;
    }
    hit = { t, nx, nz };
  }
  return hit;
}

/* ---------- Polylines with arc length ---------- */
export class Poly {
  /** pts: flat [x, z, ...] */
  constructor(pts) {
    const n = pts.length / 2;
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.cum = new Float32Array(n);
    let L = 0;
    for (let i = 0; i < n; i++) {
      this.x[i] = pts[i * 2];
      this.z[i] = pts[i * 2 + 1];
      if (i) L += Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
      this.cum[i] = L;
    }
    this.n = n;
    this.len = L;
    this.hint = 0;
  }
  seg(s) {
    const c = this.cum;
    let i = this.hint;
    if (i > this.n - 2 || c[i] > s) i = 0;
    while (i < this.n - 2 && c[i + 1] < s) i++;
    this.hint = i;
    return i;
  }
  /** out.{x, z, tx, tz} at arc length s (tangent is unit length). */
  at(s, out) {
    s = clamp(s, 0, this.len);
    const i = this.seg(s);
    const l = this.cum[i + 1] - this.cum[i] || 1e-6;
    const t = (s - this.cum[i]) / l;
    const dx = this.x[i + 1] - this.x[i];
    const dz = this.z[i + 1] - this.z[i];
    out.x = this.x[i] + dx * t;
    out.z = this.z[i] + dz * t;
    out.tx = dx / l;
    out.tz = dz / l;
    return out;
  }
  /** Arc length of the closest point, and the distance to it. */
  project(x, z) {
    let bs = 0;
    let bd = Infinity;
    for (let i = 0; i < this.n - 1; i++) {
      const ax = this.x[i];
      const az = this.z[i];
      const dx = this.x[i + 1] - ax;
      const dz = this.z[i + 1] - az;
      const l2 = dx * dx + dz * dz || 1e-9;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const d = (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
      if (d < bd) {
        bd = d;
        bs = this.cum[i] + t * Math.sqrt(l2);
      }
    }
    return { s: bs, d: Math.sqrt(bd) };
  }
  bounds() {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < this.n; i++) {
      x0 = Math.min(x0, this.x[i]);
      x1 = Math.max(x1, this.x[i]);
      z0 = Math.min(z0, this.z[i]);
      z1 = Math.max(z1, this.z[i]);
    }
    return { x0, x1, z0, z1 };
  }
}

/** Offset a flat polyline sideways (+ = left of travel, i.e. x/z rotated by +90° seen from above). */
export function offsetLine(pts, off) {
  const n = pts.length / 2;
  const out = new Array(pts.length);
  for (let i = 0; i < n; i++) {
    const pi = Math.max(0, i - 1);
    const ni = Math.min(n - 1, i + 1);
    // averaged direction of the two neighbouring segments, with a capped miter
    let ax = pts[i * 2] - pts[pi * 2];
    let az = pts[i * 2 + 1] - pts[pi * 2 + 1];
    let bx = pts[ni * 2] - pts[i * 2];
    let bz = pts[ni * 2 + 1] - pts[i * 2 + 1];
    const la = Math.hypot(ax, az) || 1;
    const lb = Math.hypot(bx, bz) || 1;
    ax /= la;
    az /= la;
    bx /= lb;
    bz /= lb;
    if (i === 0) [ax, az] = [bx, bz];
    if (i === n - 1) [bx, bz] = [ax, az];
    let tx = ax + bx;
    let tz = az + bz;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const miter = 1 / Math.max(0.5, tx * bx + tz * bz);
    // left of direction (tx, tz) with x east / z south is (tz, -tx)
    out[i * 2] = pts[i * 2] + tz * off * miter;
    out[i * 2 + 1] = pts[i * 2 + 1] - tx * off * miter;
  }
  return out;
}

/* ---------- Binary heap for route-finding ---------- */
class Heap {
  constructor() {
    this.k = [];
    this.v = [];
  }
  get size() {
    return this.k.length;
  }
  push(key, val) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop() {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop();
    const lv = v.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

/* =========================================================
   Road graph
   ========================================================= */
const NO_TRAFFIC = new Set(['parking_aisle', 'driveway', 'drive-through', 'emergency_access']);
export const KEEP_LEFT = true; // India drives on the left

export class RoadGraph {
  constructor(roads) {
    // Graph nodes: way ends, and points shared by more than one drivable way
    const use = new Map();
    const drivable = roads.filter((r) => !r.foot && !NO_TRAFFIC.has(r.sv) && !r.tn);
    for (const r of drivable) {
      r.n.forEach((id, k) => {
        const end = k === 0 || k === r.n.length - 1;
        use.set(id, (use.get(id) || 0) + (end ? 2 : 1));
      });
    }
    this.nodes = [];
    const gid = new Map();
    const G = (id) => {
      let g = gid.get(id);
      if (g === undefined) {
        g = this.nodes.length;
        gid.set(id, g);
        const [x, z] = nodeXZ(id);
        this.nodes.push({ id: g, x, z, out: [] });
      }
      return g;
    };
    this.edges = [];
    for (const r of drivable) {
      let start = 0;
      for (let k = 1; k < r.n.length; k++) {
        if (k < r.n.length - 1 && (use.get(r.n[k]) || 0) < 2) continue;
        const ids = r.n.slice(start, k + 1);
        start = k;
        const pts = ids.flatMap(nodeXZ);
        const poly = new Poly(pts);
        if (poly.len < 0.5) continue;
        const e = { id: this.edges.length, a: G(ids[0]), b: G(ids[ids.length - 1]), pts, poly, len: poly.len, c: r.c, w: r.w, o: r.o || 0, br: !!r.br, name: r.name || '', hw: r.h };
        this.edges.push(e);
        if (e.o >= 0) this.nodes[e.a].out.push({ e, dir: 1 });
        if (e.o <= 0) this.nodes[e.b].out.push({ e, dir: -1 });
        // incoming lists help find dead ends and U-turns
      }
    }
    // Lanes: for each allowed direction a polyline offset to the left (keep-left) of the centre line
    for (const e of this.edges) {
      const two = e.o === 0;
      const off = two ? clamp(e.w / 4, 1.3, 4.2) : e.w > 9 ? e.w / 4 : 0;
      const side = KEEP_LEFT ? 1 : -1;
      e.lanes = {};
      if (e.o >= 0) e.lanes[1] = new Poly(offsetLine(e.pts, off * side));
      if (e.o <= 0) {
        const rev = [];
        for (let i = e.pts.length - 2; i >= 0; i -= 2) rev.push(e.pts[i], e.pts[i + 1]);
        e.lanes[-1] = new Poly(offsetLine(rev, off * side));
      }
      e.speed = [16, 13.5, 11.5, 10, 7.5, 5.5][Math.min(e.c, 5)];
    }
    // Spatial index of edge segments for snapping
    this.grid = new Grid(60);
    for (const e of this.edges) {
      const b = e.poly.bounds();
      this.grid.insert(e, b.x0 - e.w, b.x1 + e.w, b.z0 - e.w, b.z1 + e.w);
    }
  }

  /** Closest point on a road: { e, s, x, z, d }. maxD bounds the search. */
  nearest(x, z, maxD = 200, filter = null) {
    let best = null;
    for (let r = 30; r <= maxD * 2 && !best; r *= 2) {
      this.grid.query(x - r, x + r, z - r, z + r, (e) => {
        if (filter && !filter(e)) return;
        const p = e.poly.project(x, z);
        if (p.d <= r && (!best || p.d < best.d)) best = { e, s: p.s, d: p.d };
      });
    }
    if (!best) return null;
    const q = best.e.poly.at(best.s, {});
    best.x = q.x;
    best.z = q.z;
    best.tx = q.tx;
    best.tz = q.tz;
    return best;
  }

  /** Edges near a point (for spawning). */
  edgesNear(x, z, r, out = []) {
    out.length = 0;
    this.grid.query(x - r, x + r, z - r, z + r, (e) => out.push(e));
    return out;
  }

  /** Street route between two points as [[x, z], ...], following one-way rules. */
  route(ax, az, bx, bz) {
    const s = this.nearest(ax, az, 400);
    const g = this.nearest(bx, bz, 400);
    if (!s || !g) return [[ax, az], [bx, bz]];
    if (s.e === g.e) return [[ax, az], [s.x, s.z], [g.x, g.z], [bx, bz]];
    for (const strict of [true, false]) {
      const r = this.search(s, g, strict);
      if (r) return [[ax, az], ...r, [bx, bz]];
    }
    return [[ax, az], [bx, bz]];
  }

  search(s, g, strict) {
    const N = this.nodes.length;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const prevE = new Array(N);
    const heap = new Heap();
    const h = (n) => Math.hypot(this.nodes[n].x - g.x, this.nodes[n].z - g.z);
    const seed = (node, cost) => {
      if (cost < dist[node]) {
        dist[node] = cost;
        heap.push(cost + h(node), node);
      }
    };
    const se = s.e;
    if (!strict || se.o >= 0) seed(se.b, se.len - s.s);
    if (!strict || se.o <= 0) seed(se.a, s.s);
    const ge = g.e;
    const goal = new Map();
    if (!strict || ge.o >= 0) goal.set(ge.a, g.s);
    if (!strict || ge.o <= 0) goal.set(ge.b, ge.len - g.s);
    let best = null;
    let bestCost = Infinity;
    const done = new Uint8Array(N);
    while (heap.size) {
      const n = heap.pop();
      if (done[n]) continue;
      done[n] = 1;
      if (dist[n] >= bestCost) break;
      if (goal.has(n) && dist[n] + goal.get(n) < bestCost) {
        bestCost = dist[n] + goal.get(n);
        best = n;
      }
      const list = strict ? this.nodes[n].out : this.allLinks(n);
      for (const { e, dir } of list) {
        const m = dir > 0 ? e.b : e.a;
        // Small preference for bigger roads, like a taxi driver would
        const cost = dist[n] + e.len * (1 + Math.max(0, e.c - 2) * 0.08);
        if (cost < dist[m]) {
          dist[m] = cost;
          prev[m] = n;
          prevE[m] = { e, dir };
          heap.push(cost + h(m), m);
        }
      }
    }
    if (best === null) return null;
    const chain = [];
    for (let n = best; prev[n] >= 0; n = prev[n]) chain.push(prevE[n]);
    chain.reverse();
    const pts = [[s.x, s.z]];
    const push = (x, z) => {
      const q = pts[pts.length - 1];
      if (Math.hypot(q[0] - x, q[1] - z) > 0.5) pts.push([x, z]);
    };
    // walk the start edge to the node we left from
    const first = chain.length ? (chain[0].dir > 0 ? chain[0].e.a : chain[0].e.b) : best;
    this.walk(se, s.s, first === se.a ? 0 : se.len, push);
    for (const { e, dir } of chain) {
      if (dir > 0) for (let i = 0; i < e.pts.length; i += 2) push(e.pts[i], e.pts[i + 1]);
      else for (let i = e.pts.length - 2; i >= 0; i -= 2) push(e.pts[i], e.pts[i + 1]);
    }
    this.walk(ge, best === ge.a ? 0 : ge.len, g.s, push);
    push(g.x, g.z);
    return pts;
  }
  allLinks(n) {
    if (!this._all) {
      this._all = this.nodes.map(() => []);
      for (const e of this.edges) {
        this._all[e.a].push({ e, dir: 1 });
        this._all[e.b].push({ e, dir: -1 });
      }
    }
    return this._all[n];
  }
  /** Feed the points of edge e between arc lengths s0 and s1 (either order). */
  walk(e, s0, s1, push) {
    const P = e.poly;
    const lo = Math.min(s0, s1);
    const hi = Math.max(s0, s1);
    const mid = [];
    for (let i = 0; i < P.n; i++) if (P.cum[i] > lo && P.cum[i] < hi) mid.push([P.x[i], P.z[i]]);
    if (s0 > s1) mid.reverse();
    const a = P.at(s0, {});
    push(a.x, a.z);
    for (const [x, z] of mid) push(x, z);
    const b = P.at(s1, {});
    push(b.x, b.z);
  }
}

export function routeLength(route) {
  let l = 0;
  for (let i = 1; i < route.length; i++) l += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  return l;
}

/* =========================================================
   Walking paths: sidewalks either side of streets, and footpaths.
   A path is walked back and forth, so its period is twice its length.
   ========================================================= */
export function walkPath(pts) {
  const P = new Poly(pts);
  const tmp = {};
  const L = P.len;
  return {
    len: L * 2,
    poly: P,
    at(s, out) {
      s = ((s % this.len) + this.len) % this.len;
      P.at(s < L ? s : 2 * L - s, tmp);
      return out.set(tmp.x, tmp.z);
    },
    nearest(x, z) {
      return P.project(x, z).s;
    },
  };
}
