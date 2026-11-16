import { N, lineAt, HALF } from './world.js';
import { clamp } from './utils.js';

/*
 * Full-screen map (M): drag to pan, scroll to zoom, click to drop a waypoint,
 * right-click to clear it. A route along the street grid is found from the
 * player to the waypoint and drawn here and on the minimap.
 */

const ROUTE_TURN = 25; // metres of penalty per turn, so routes prefer fewer corners

/** Nearest point on the road grid: { x, z, k (road index), alongX (road runs along x) }. */
function snapToRoad(x, z) {
  const kx = clamp(Math.round((x + HALF) / ((2 * HALF) / N)), 0, N);
  const kz = clamp(Math.round((z + HALF) / ((2 * HALF) / N)), 0, N);
  const cx = clamp(z, lineAt(0), lineAt(N));
  const cz = clamp(x, lineAt(0), lineAt(N));
  const dV = Math.hypot(x - lineAt(kx), z - cx); // road running along z at x = lineAt(kx)
  const dH = Math.hypot(z - lineAt(kz), x - cz); // road running along x at z = lineAt(kz)
  return dV <= dH ? { x: lineAt(kx), z: cx, k: kx, alongZ: true } : { x: cz, z: lineAt(kz), k: kz, alongZ: false };
}

/** Grid intersections at the two ends of the block the snapped point sits on. */
function ends(p) {
  const cell = (2 * HALF) / N;
  const t = ((p.alongZ ? p.z : p.x) + HALF) / cell;
  const a = clamp(Math.floor(t), 0, N - 1);
  return p.alongZ ? [[p.k, a], [p.k, a + 1]] : [[a, p.k], [a + 1, p.k]];
}

/** Road route from (ax, az) to (bx, bz) as a list of [x, z] points. */
export function findRoute(ax, az, bx, bz) {
  const s = snapToRoad(ax, az);
  const e = snapToRoad(bx, bz);
  const pts = [[ax, az], [s.x, s.z]];
  const sameRoad = s.alongZ === e.alongZ && s.k === e.k;
  if (sameRoad) {
    pts.push([e.x, e.z], [bx, bz]);
    return pts;
  }
  // Dijkstra over (intersection, heading) so turns cost extra
  const key = (i, j, d) => (i * (N + 1) + j) * 5 + d;
  const dist = new Map();
  const prev = new Map();
  const open = [];
  const P = (i, j) => [lineAt(i), lineAt(j)];
  const push = (k, d, info) => {
    if (d < (dist.get(k) ?? Infinity)) {
      dist.set(k, d);
      prev.set(k, info);
      open.push([d, k]);
    }
  };
  for (const [i, j] of ends(s)) push(key(i, j, 4), Math.hypot(lineAt(i) - s.x, lineAt(j) - s.z), null);
  const goal = new Set(ends(e).map(([i, j]) => i * (N + 1) + j));
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let best = null;
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, k] = open.shift();
    if (d > (dist.get(k) ?? Infinity)) continue;
    const node = Math.floor(k / 5);
    const hd = k % 5;
    const i = Math.floor(node / (N + 1));
    const j = node % (N + 1);
    if (goal.has(node)) {
      const [gx, gz] = P(i, j);
      const total = d + Math.hypot(gx - e.x, gz - e.z);
      if (!best || total < best.total) best = { total, k };
    }
    DIRS.forEach(([di, dj], nd) => {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni > N || nj > N) return;
      const cost = (2 * HALF) / N + (hd !== 4 && hd !== nd ? ROUTE_TURN : 0);
      push(key(ni, nj, nd), d + cost, k);
    });
  }
  if (!best) return [[ax, az], [bx, bz]];
  const chain = [];
  for (let k = best.k; k != null; k = prev.get(k)) {
    const node = Math.floor(k / 5);
    chain.push(P(Math.floor(node / (N + 1)), node % (N + 1)));
  }
  chain.reverse();
  pts.push(...chain, [e.x, e.z], [bx, bz]);
  // Drop repeated and collinear points
  const out = [pts[0]];
  for (let n = 1; n < pts.length; n++) {
    const p = pts[n];
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5) continue;
    if (out.length >= 2) {
      const o = out[out.length - 2];
      if (Math.abs((q[0] - o[0]) * (p[1] - q[1]) - (q[1] - o[1]) * (p[0] - q[0])) < 1e-3) out.pop();
    }
    out.push(p);
  }
  return out;
}

export function routeLength(route) {
  let l = 0;
  for (let i = 1; i < route.length; i++) l += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  return l;
}

export class MapView {
  constructor(hud) {
    this.hud = hud;
    this.el = document.getElementById('bigmap');
    this.canvas = this.el.querySelector('canvas');
    this.g = this.canvas.getContext('2d');
    this.open = false;
    this.cx = 0;
    this.cz = 0;
    this.scale = 1;
    this.drag = null;
    this.hover = null;
    this.onWaypoint = null; // (point | null) => void
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      this.hover = this.toWorld(e.clientX, e.clientY);
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
      this.cx = this.drag.cx - dx / this.scale;
      this.cz = this.drag.cz - dy / this.scale;
    });
    c.addEventListener('pointerup', (e) => {
      if (this.drag && !this.drag.moved && this.onWaypoint) this.onWaypoint(this.toWorld(e.clientX, e.clientY));
      this.drag = null;
    });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.onWaypoint) this.onWaypoint(null);
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.toWorld(e.clientX, e.clientY);
      this.scale = clamp(this.scale * Math.exp(-e.deltaY * 0.0015), 0.35, 8);
      const after = this.toWorld(e.clientX, e.clientY);
      this.cx += before.x - after.x;
      this.cz += before.z - after.z;
    });
    for (const [sel, f] of [['.zin', 1.4], ['.zout', 1 / 1.4]]) this.el.querySelector(sel).addEventListener('click', () => (this.scale = clamp(this.scale * f, 0.35, 8)));
  }

  toWorld(sx, sy) {
    return { x: this.cx + (sx - innerWidth / 2) / this.scale, z: this.cz + (sy - innerHeight / 2) / this.scale };
  }

  show(on, focus) {
    this.open = on;
    this.el.classList.toggle('hidden', !on);
    if (on) {
      this.cx = focus.x;
      this.cz = focus.z;
      this.scale = clamp(Math.min(innerWidth, innerHeight) / 700, 0.6, 3);
    }
  }

  draw(player, blips, waypoint, route) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const c = this.canvas;
    const W = innerWidth;
    const H = innerHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = this.g;
    const half = this.hud.mapHalf;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#123651';
    g.fillRect(0, 0, W, H);
    const S = this.scale;
    const ox = W / 2 - this.cx * S;
    const oy = H / 2 - this.cz * S;
    g.imageSmoothingEnabled = S < 2;
    g.drawImage(this.hud.map, ox - half * S, oy - half * S, this.hud.map.width * S, this.hud.map.height * S);
    const X = (x) => ox + x * S;
    const Y = (z) => oy + z * S;
    // Route
    if (route && route.length > 1) {
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const [w, col] of [[9, 'rgba(0,0,0,0.55)'], [5, '#ff3fa4']]) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        route.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
        g.stroke();
      }
    }
    // Blips
    for (const b of blips) {
      g.beginPath();
      g.arc(X(b.x), Y(b.z), (b.r || 8) * 0.8, 0, Math.PI * 2);
      g.fillStyle = b.color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#000';
      g.stroke();
      if (b.label) {
        g.fillStyle = '#000';
        g.font = 'bold 11px Rajdhani';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(b.label, X(b.x), Y(b.z) + 1);
      }
    }
    // Waypoint flag
    if (waypoint) {
      const x = X(waypoint.x);
      const y = Y(waypoint.z);
      g.fillStyle = '#ff3fa4';
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 9, y - 18);
      g.arc(x, y - 22, 10, Math.PI * 0.8, Math.PI * 0.2);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x, y - 22, 4, 0, Math.PI * 2);
      g.fill();
    }
    // Player arrow
    const p = player.focus;
    const yaw = player.vehicle && player.mode !== 'foot' ? player.vehicle.yaw : player.yaw;
    g.save();
    g.translate(X(p.x), Y(p.z));
    g.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw)) + Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(9, 10);
    g.lineTo(0, 5);
    g.lineTo(-9, 10);
    g.closePath();
    g.fillStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = 10;
    g.fill();
    g.restore();
    // Cursor read-out
    const info = this.el.querySelector('.minfo');
    const txt = waypoint && route ? `Waypoint · ${Math.round(routeLength(route))} m by road` : 'Click to set a waypoint';
    if (info.textContent !== txt) info.textContent = txt;
  }
}
