import * as THREE from 'three';
import { METRO_DEPTH, PLATFORM_H, SIDEWALK_H, inTiles } from './world.js';
import { Consist, Track, railMats, signTexture, KINDS } from './rail.js';
import { MAP, nodeXZ, Poly, inPoly } from './geo.js';
import { merge, clamp } from './utils.js';

/*
 * Kolkata Metro: the Blue Line under Chowringhee and Central Avenue, and the
 * Green Line from Howrah under the Hooghly to Esplanade and Sealdah, on their
 * real routes. Each station is a tiled hall lined up with the track, with a
 * stairway up to the street; tunnels follow the line between them.
 *
 * Below street level the player moves through "rooms": oriented boxes with a
 * floor and a ceiling. Anywhere outside every room is solid ground.
 */

const HALL_H = 6.5;
const TUNNEL_H = 5.5;
const HALL_HL = 48; // half length of a station hall: a four-car train fits
const PLAT0 = 1.9; // platform edge, from the track centre
const PLAT1 = 9; // back wall
const STAIR_V = 6; // stair centre line, from the track centre
const STAIR_HW = 1.3;
const STAIR_RUN = 22;
const LINES = [
  { re: /blue line/i, name: 'Blue Line', color: 0x1f4fbf, css: '#2f6fe0', depth: METRO_DEPTH },
  { re: /green line/i, name: 'Green Line', color: 0x1f9e4a, css: '#2fbf5a', depth: METRO_DEPTH - 14 },
];
/** Station names in Bengali, for the signs. */
const BN = {
  'howrah maidan': 'হাওড়া ময়দান',
  howrah: 'হাওড়া',
  mahakaran: 'মহাকরণ',
  esplanade: 'এসপ্ল্যানেড',
  sealdah: 'শিয়ালদহ',
  'park street': 'পার্ক স্ট্রিট',
  maidan: 'ময়দান',
  'rabindra sadan': 'রবীন্দ্র সদন',
  'chandni chowk': 'চাঁদনি চক',
  central: 'সেন্ট্রাল',
  'mahatma gandhi road': 'মহাত্মা গান্ধী রোড',
  'girish park': 'গিরিশ পার্ক',
  'shobhabazar sutanuti': 'শোভাবাজার সুতানুটি',
};
const bn = (n) => BN[n.toLowerCase()] || n;
const FONT_BN = '"Kohinoor Bangla", "Bangla MN", "Noto Sans Bengali", Arial';

/** Red station sign over a street entrance, as at Esplanade's Green Line entrance. */
function portalSignTexture(name) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b8312a';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#f4ece0';
  g.lineWidth = 6;
  g.strokeRect(4, 4, 504, 120);
  g.fillStyle = '#f8f2e6';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 46px ${FONT_BN}`;
  g.fillText(`${bn(name)} মেট্রো`, 256, 44, 480);
  g.font = 'bold 32px Arial';
  g.fillText(`${name.toUpperCase()} METRO`, 256, 96, 480);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Blue hanging board listing the stations ahead, as on the Blue Line's platforms. */
function routeBoardTexture(ahead, towards) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#1f4fb0';
  g.fillRect(0, 0, 1024, 320);
  g.fillStyle = '#e8eefc';
  g.fillRect(680, 0, 6, 320);
  g.textBaseline = 'middle';
  const list = ahead.slice(0, 7);
  list.forEach((n, i) => {
    const y = 34 + i * 40;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(24, y, 6, 0, Math.PI * 2);
    g.fill();
    g.font = `bold 26px ${FONT_BN}`;
    g.fillText(bn(n), 42, y, 300);
    g.font = 'bold 24px Arial';
    g.fillText(n.toUpperCase(), 360, y, 310);
  });
  g.font = `bold 34px ${FONT_BN}`;
  g.fillText(`${bn(towards)} যাইবার গাড়ী`, 700, 110, 310);
  g.font = 'bold 30px Arial';
  g.fillText('TRAIN TOWARDS', 700, 180, 310);
  g.fillText(towards.toUpperCase(), 700, 222, 310);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Box from local (u, y, v) extents, in a frame with origin (cx, cz) and axis (ux, uz). */
function slab(list, fr, u0, u1, y0, y1, v0, v1) {
  const g = new THREE.BoxGeometry(u1 - u0, y1 - y0, v1 - v0);
  g.translate((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2);
  g.rotateY(-Math.atan2(fr.uz, fr.ux));
  g.translate(fr.cx, 0, fr.cz);
  list.push(g);
  return g;
}
const toWorld = (fr, u, v) => [fr.cx + fr.ux * u - fr.uz * v, fr.cz + fr.uz * u + fr.ux * v];

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
/** Triplanar-ish UVs in world metres so tiles stay square on any wall. */
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

/** The longest connected run through a route's tunnel ways. */
function routePath(route) {
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
  };
  for (const ri of route.rails) {
    const r = MAP.rails[ri];
    for (let i = 1; i < r.n.length; i++) {
      link(r.n[i - 1], r.n[i]);
      link(r.n[i], r.n[i - 1]);
    }
  }
  let best = null;
  for (const [start, nb] of adj) {
    if (nb.length !== 1) continue;
    const out = [start];
    const seen = new Set(out);
    let cur = start;
    let len = 0;
    for (;;) {
      const next = adj.get(cur).find((n) => !seen.has(n));
      if (next === undefined) break;
      const [ax, az] = nodeXZ(cur);
      const [bx, bz] = nodeXZ(next);
      len += Math.hypot(bx - ax, bz - az);
      out.push(next);
      seen.add(next);
      cur = next;
    }
    if (!best || len > best.len) best = { nodes: out, len };
  }
  return best;
}

export class Metro {
  constructor(scene, world, fx) {
    this.world = world;
    this.rooms = [];
    this.stations = [];
    this.trains = [];
    this.lines = [];
    const M = railMats();
    const tiles = new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.35, metalness: 0.05, envMapIntensity: 0.6 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x77736d, roughness: 0.95, envMapIntensity: 0.4 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.5 });
    this.lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.5, 2.3) });
    const tile = [];
    const conc = [];
    const flo = [];
    const lamps = [];
    const yellow = [];
    const darkG = [];
    const rails = [];
    const bored = [];
    const blueLamps = [];
    const portal = [];
    const boards = [];
    const bands = new Map();
    const signs = [];
    const portals = [];

    for (const L of LINES) {
      const route = MAP.routes.filter((r) => r.k === 'subway' && L.re.test(r.name)).sort((a, b) => b.rails.length - a.rails.length)[0];
      if (!route) continue;
      const D = L.depth;
      // Track: the mapped tunnel ways, or a chain through the stations if they're missing
      const stops = route.stops.filter((s) => s.n && inTiles(s.x, s.z, 200));
      const rp = routePath(route);
      let pts = rp && rp.len > 600 ? rp.nodes.map(nodeXZ) : stops.map((s) => [s.x, s.z]);
      // Trim to the mapped area plus a run-out
      const keep = pts.map(([x, z]) => inTiles(x, z, 250));
      const first = keep.indexOf(true);
      const last = keep.lastIndexOf(true);
      if (first < 0 || last - first < 2) continue;
      pts = pts.slice(first, last + 1);
      // Run the tunnel on past each end so a terminus gets a full hall (and overrun)
      const runout = (a, b) => {
        const l = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
        return [a[0] + ((a[0] - b[0]) / l) * 150, a[1] + ((a[1] - b[1]) / l) * 150];
      };
      pts = [runout(pts[0], pts[1]), ...pts, runout(pts[pts.length - 1], pts[pts.length - 2])];
      const track = new Track(pts, 25);
      const poly = new Poly(pts.flat());
      const D0 = D;
      const color = L.color;
      if (!bands.has(color)) bands.set(color, []);
      const band = bands.get(color);
      // Stations along the line, by distance along the track
      const st = [];
      for (const s of stops) {
        const p = poly.project(s.x, s.z);
        if (p.d > 90 || p.s < HALL_HL + 20 || p.s > poly.len - HALL_HL - 20) continue;
        if (st.some((o) => Math.abs(o.s - p.s) < HALL_HL * 2.4)) continue;
        st.push({ name: s.n.replace(/\s*\(line \d\)/i, '').replace(/\s*\(.*?\)/, ''), s: track.nearest(s.x, s.z) });
      }
      st.sort((a, b) => a.s - b.s);
      const q = {};
      const frameAt = (s) => {
        const a = track.at(s - HALL_HL, {});
        const b = track.at(s + HALL_HL, {});
        const c = track.at(s, q);
        const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        return { cx: c.x, cz: c.z, ux: (b.x - a.x) / l, uz: (b.z - a.z) / l };
      };

      /* ---- Tunnels between stations (pieces every 8 m) ---- */
      const inHall = (s) => st.some((o) => Math.abs(o.s - s) < HALL_HL);
      const a = {};
      const b = {};
      const STEP = 8;
      for (let s = 2; s < track.len - 2; s += STEP) {
        const e = Math.min(track.len - 2, s + STEP);
        if (inHall((s + e) / 2)) continue;
        track.at(s, a);
        track.at(e, b);
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 0.1) continue;
        const fr = { cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len };
        const h = len / 2 + 0.25;
        const wet = !!world.river && inPoly(world.river, fr.cx, fr.cz);
        slab(conc, fr, -h, h, D - 0.4, D, -3, 3);
        if (wet) {
          // Under the Hooghly: a round bored tunnel of segment rings, lit blue-white
          const tube = new THREE.CylinderGeometry(3.4, 3.4, h * 2, 22, 1, true).rotateZ(Math.PI / 2).translate(0, D + 2.3, 0);
          tube.rotateY(-Math.atan2(fr.uz, fr.ux)).translate(fr.cx, 0, fr.cz);
          bored.push(tube);
          const rib = new THREE.TorusGeometry(3.32, 0.09, 6, 22).rotateY(Math.PI / 2).translate(0, D + 2.3, 0);
          rib.rotateY(-Math.atan2(fr.uz, fr.ux)).translate(fr.cx, 0, fr.cz);
          darkG.push(rib);
          slab(blueLamps, fr, -0.6, 0.6, D + 4.6, D + 4.7, -1.4, -1.3);
          slab(blueLamps, fr, -0.6, 0.6, D + 4.6, D + 4.7, 1.3, 1.4);
        } else {
          slab(conc, fr, -h, h, D + TUNNEL_H, D + TUNNEL_H + 0.4, -3.4, 3.4);
          slab(conc, fr, -h, h, D, D + TUNNEL_H, -3.4, -3);
          slab(conc, fr, -h, h, D, D + TUNNEL_H, 3, 3.4);
          slab(lamps, fr, -0.3, 0.3, D + 3.6, D + 3.72, -2.98, -2.9);
        }
        this.rooms.push({ ...fr, hl: h, hw: 3, floor: D, ceil: D + TUNNEL_H, river: wet });
      }
      // Rails
      for (let s = 0; s < track.len - 0.5; s += 10) {
        const e = Math.min(track.len, s + 10);
        track.at(s, a);
        track.at(e, b);
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 0.1) continue;
        const fr = { cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len };
        slab(rails, fr, -len / 2, len / 2, D, D + 0.12, 0.68, 0.755);
        slab(rails, fr, -len / 2, len / 2, D, D + 0.12, -0.755, -0.68);
        slab(rails, fr, -len / 2, len / 2, D, D + 0.1, 1.19, 1.31);
      }
      // Buffer stops at both tunnel ends
      for (const s of [1, track.len - 1]) {
        track.at(s, a);
        const fr = { cx: a.x, cz: a.z, ux: a.tx / (Math.hypot(a.tx, a.tz) || 1), uz: a.tz / (Math.hypot(a.tx, a.tz) || 1) };
        slab(conc, fr, -0.4, 0.4, D, D + TUNNEL_H, -3.4, 3.4);
        slab(yellow, fr, s > 1 ? -1.6 : 1, s > 1 ? -1 : 1.6, D, D + 1.1, -1.3, 1.3);
      }

      /* ---- Station halls ---- */
      for (const o of st) {
        const fr = frameAt(o.s);
        // Platform and stairs on whichever side the street above is clear
        const clear = (side) => {
          let bad = 0;
          for (let u = -2; u <= STAIR_RUN + 2; u += 4) {
            const [x, z] = toWorld(fr, u - STAIR_RUN / 2 + 8, STAIR_V * side);
            if (world.collideCircle(x, z, STAIR_HW + 0.6) || world.overWater(x, z)) bad++;
          }
          return bad;
        };
        const side = clear(1) <= clear(-1) ? 1 : -1;
        // Mirror the frame so the platform is always at +v
        const F = { cx: fr.cx, cz: fr.cz, ux: fr.ux, uz: fr.uz };
        const V = (v) => v * side;
        const vr = (v0, v1) => (side > 0 ? [v0, v1] : [-v1, -v0]);
        const sl = (list, u0, u1, y0, y1, v0, v1) => slab(list, F, u0, u1, y0, y1, ...vr(v0, v1));
        const top = D + HALL_H;
        const zb = -3.5;
        const u0 = -HALL_HL;
        const u1 = HALL_HL;
        sl(flo, u0, u1, D - 0.4, D, zb, PLAT1);
        sl(flo, u0 + 2, u1 - 2, D, D + PLATFORM_H, PLAT0, PLAT1);
        sl(yellow, u0 + 2, u1 - 2, D + PLATFORM_H, D + PLATFORM_H + 0.01, PLAT0, PLAT0 + 0.35);
        // Stairway footprint in hall coordinates (rises towards +u)
        const sU0 = 8 - STAIR_RUN / 2 - STAIR_RUN / 2 + 2;
        const sU1 = sU0 + STAIR_RUN;
        const sV0 = STAIR_V - STAIR_HW;
        const sV1 = STAIR_V + STAIR_HW;
        // Ceiling with the stair opening
        for (const [a0, a1, b0, b1] of [[u0, u1, zb - 0.4, sV0], [u0, u1, sV1, PLAT1 + 0.4], [u0, sU0, sV0, sV1], [sU1, u1, sV0, sV1]]) sl(conc, a0, a1, top, top + 0.4, b0, b1);
        // Walls, coloured band in the line's colour
        sl(tile, u0, u1, D, top, zb - 0.3, zb);
        sl(tile, u0, u1, D + PLATFORM_H, top, PLAT1, PLAT1 + 0.3);
        sl(band, u0, u1, D + 2.7, D + 3.1, zb + 0.005, zb + 0.02);
        sl(band, u0, u1, D + PLATFORM_H + 2.1, D + PLATFORM_H + 2.5, PLAT1 - 0.02, PLAT1 - 0.005);
        for (const u of [u0 - 0.3, u1]) {
          sl(tile, u, u + 0.3, D, top, 3, PLAT1);
          sl(tile, u, u + 0.3, D, top, zb, -3);
          sl(tile, u, u + 0.3, D + TUNNEL_H, top, -3, 3);
        }
        for (let u = u0 + 4; u < u1 - 2; u += 8) {
          if (u > sU0 - 1 && u < sU1 + 1) continue;
          sl(lamps, u - 1.6, u + 1.6, top - 0.1, top - 0.04, 5.25, 5.55);
          sl(lamps, u - 1.6, u + 1.6, top - 0.1, top - 0.04, -0.15, 0.15);
        }
        for (let u = u0 + 6; u < u1 - 4; u += 9) {
          if (u > sU0 - 2 && u < sU1 + 2) continue;
          sl(tile, u - 0.3, u + 0.3, D + PLATFORM_H, top, 3.3, 3.9);
          sl(darkG, u + 3.4, u + 5.6, D + PLATFORM_H + 0.4, D + PLATFORM_H + 0.5, PLAT1 - 0.7, PLAT1 - 0.2);
        }
        // Rooms: the hall over track and platform, the raised platform, the stair shaft
        this.rooms.push({ ...F, hl: HALL_HL, hw: (PLAT1 - zb) / 2, cv: V((PLAT1 + zb) / 2), floor: D, ceil: top });
        this.rooms.push({ ...F, hl: HALL_HL - 2, hw: (PLAT1 - PLAT0) / 2, cv: V((PLAT1 + PLAT0) / 2), floor: D + PLATFORM_H, ceil: top, pillars: true });
        // Stairway: steps from the platform up to the street
        const steps = 30;
        const run = STAIR_RUN / steps;
        const hTop = SIDEWALK_H;
        const hBot = D + PLATFORM_H;
        for (let k = 0; k < steps; k++) {
          const su = sU0 + k * run;
          const yTop = hBot + ((k + 1) / steps) * (hTop - hBot);
          sl(flo, su, su + run, hBot, yTop, sV0, sV1);
          sl(yellow, su + run - 0.06, su + run, yTop, yTop + 0.005, sV0, sV1);
        }
        for (const [w0, w1] of [[sV0 - 0.25, sV0], [sV1, sV1 + 0.25]]) sl(tile, sU0, sU1, hBot, hTop + 1.0, w0, w1);
        sl(tile, sU0 - 0.25, sU0, top, hTop + 1.0, sV0 - 0.25, sV1 + 0.25);
        const sc = toWorld(F, (sU0 + sU1) / 2, V(STAIR_V));
        world.addRamp(sc[0], sc[1], F.ux, F.uz, STAIR_RUN / 2, STAIR_HW, hBot, hTop);
        world.addHole(sc[0], sc[1], F.ux, F.uz, STAIR_RUN / 2 + 0.02, STAIR_HW + 0.02);
        this.rooms.push({ ...F, cx: sc[0], cz: sc[1], hl: STAIR_RUN / 2 + 1.5, hw: STAIR_HW, floor: hBot, ceil: 60, stair: true });
        // Street level: railings round the opening, a canopy and the Metro sign
        const P = (u, v) => toWorld(F, u, V(v));
        for (const v of [sV0 - 0.15, sV1 + 0.15]) {
          const [ax, az] = P(sU0 - 0.3, v);
          const [bx, bz] = P(sU1, v);
          world.addWall(ax, az, bx, bz, 0.15);
          sl(darkG, sU0 - 0.4, sU1, hTop + 0.95, hTop + 1.05, v - 0.04, v + 0.04);
          for (let u = sU0; u <= sU1; u += 2) sl(darkG, u - 0.03, u + 0.03, hTop, hTop + 1.0, v - 0.03, v + 0.03);
          for (const u of [sU1 - 0.2, sU1 - 7]) sl(darkG, u - 0.06, u + 0.06, hTop, hTop + 3.2, v - 0.06, v + 0.06);
        }
        {
          const [ax, az] = P(sU0 - 0.3, sV0 - 0.15);
          const [bx, bz] = P(sU0 - 0.3, sV1 + 0.15);
          world.addWall(ax, az, bx, bz, 0.15);
        }
        // A grey box portal over the stair top, open towards the street, with the red sign
        const p0 = sU1 - 9;
        const p1 = sU1 + 1.2;
        for (const v of [sV0 - 0.75, sV1 + 0.75]) {
          sl(portal, p0, p1, hTop, hTop + 4.4, v - 0.3, v + 0.3);
          const [ax, az] = P(p0, v);
          const [bx, bz] = P(p1, v);
          world.addWall(ax, az, bx, bz, 0.35);
        }
        sl(portal, p0 - 0.4, p1 + 0.4, hTop + 4.4, hTop + 5.0, sV0 - 1.2, sV1 + 1.2);
        sl(portal, p0 - 0.3, p0, hTop + 1.0, hTop + 4.4, sV0 - 0.45, sV1 + 0.45);
        const [sx, sz] = P(sU1 + 1.6, sV1 + 1.4);
        darkG.push(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8).translate(sx, hTop + 1.7, sz));
        world.addCircle(sx, sz, 0.15);
        portals.push({ name: o.name, x: (P(p1 + 0.45, STAIR_V)[0]), z: (P(p1 + 0.45, STAIR_V)[1]), y: hTop + 4.7, yaw: Math.atan2(F.ux, F.uz) });
        // Blue boards over the platform listing the stations ahead, both ways
        const names = st.map((q) => q.name);
        const idx = names.indexOf(o.name);
        for (const [dir, uu] of [[1, -20], [-1, 20]]) {
          const ahead = dir > 0 ? names.slice(idx + 1) : names.slice(0, idx).reverse();
          if (!ahead.length) continue;
          const [bx2, bz2] = P(uu, 5.6);
          boards.push({ x: bx2, z: bz2, y: top - 1.3, yaw: Math.atan2(F.ux, F.uz) + (dir > 0 ? Math.PI : 0), ahead, towards: ahead[ahead.length - 1] });
        }
        signs.push({ x: sx, z: sz, y: hTop + 3.8, color: L.css, name: o.name, line: L.name, wall: P(0, zb + 0.03), yaw: Math.atan2(F.ux, F.uz) + (side > 0 ? Math.PI / 2 : -Math.PI / 2), D });
        this.stations.push({ name: o.name, line: L.name, x: sx, z: sz, color: L.css, frame: F, side, D });
      }
      // Train: four cars, stopping at every station
      const cs = new Consist(scene, track, 'metro', st.map((o) => o.s), fx, color);
      cs.K = { ...KINDS.metro, y: D0 + 0.12 };
      cs.place();
      this.trains.push(cs);
      this.lines.push({ name: L.name, color: L.css, track, stations: st });
    }

    const meshes = [
      [merge(tile.map((g) => worldUV(g, 1.2))), tiles],
      [merge(conc), concrete],
      [merge(flo), floorMat],
      [merge(lamps), this.lampMat],
      [merge(yellow), M.yellow],
      [merge(darkG), M.dark],
      [merge(rails), M.steel],
    ];
    for (const [color, list] of bands) meshes.push([merge(list), new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 })]);
    if (bored.length) meshes.push([merge(bored), new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.85, side: THREE.DoubleSide })]);
    if (blueLamps.length) meshes.push([merge(blueLamps), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.9, 3.2) })]);
    const portalGeo = portal.length ? merge(portal) : null;
    if (portalGeo) meshes.push([portalGeo, new THREE.MeshStandardMaterial({ color: 0x6f7173, roughness: 0.8 })]);
    this.statics = [];
    for (const [g, m] of meshes) {
      if (!g) continue;
      const mesh = new THREE.Mesh(g, m);
      if (g === portalGeo) mesh.userData.surface = true;
      mesh.castShadow = m !== this.lampMat;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.statics.push(mesh);
    }
    // Station boards on the track wall, and the glowing Metro sign at each entrance
    for (const sg of signs) {
      const tex = signTexture(sg.name.toUpperCase(), `KOLKATA METRO · ${sg.line.toUpperCase()}`);
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
      const st = this.stations.find((s) => s.x === sg.x && s.z === sg.z);
      for (const u of [-28, 0, 28]) {
        const [x, z] = toWorld(st.frame, u, st.side * -3.47);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), mat);
        sign.position.set(x, sg.D + 3.6, z);
        // face the platform (+v, mirrored by side)
        sign.rotation.y = Math.atan2(st.frame.ux, st.frame.uz) + (st.side > 0 ? -Math.PI / 2 : Math.PI / 2);
        scene.add(sign);
        this.statics.push(sign);
      }
      const mTex = mSignTexture(sg.color);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), new THREE.MeshStandardMaterial({ map: mTex, emissive: 0xffffff, emissiveMap: mTex, emissiveIntensity: 1.5 }));
      m.position.set(sg.x, sg.y, sg.z);
      m.userData.surface = true;
      scene.add(m);
      this.statics.push(m);
    }
    for (const p of portals) {
      const tex = portalSignTexture(p.name);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
      sign.position.set(p.x, p.y, p.z);
      sign.rotation.y = p.yaw;
      sign.userData.surface = true;
      scene.add(sign);
      this.statics.push(sign);
    }
    for (const b of boards) {
      const tex = routeBoardTexture(b.ahead, b.towards);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.5), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5 }));
      board.position.set(b.x, b.y, b.z);
      board.rotation.y = b.yaw;
      scene.add(board);
      this.statics.push(board);
    }
    for (const m of this.statics) {
      m.updateMatrixWorld(true);
      m.matrixAutoUpdate = false;
    }
    this.train = this.trains[0];
    world.under = this;
  }

  /** Local coordinates of a point in a room, and how far inside it is (negative = outside). */
  inner(r, x, z) {
    const dx = x - r.cx;
    const dz = z - r.cz;
    const u = dx * r.ux + dz * r.uz;
    const v = -dx * r.uz + dz * r.ux - (r.cv || 0);
    return { u, v, d: Math.min(r.hl - Math.abs(u), r.hw - Math.abs(v)) };
  }
  floorAt(x, z) {
    let h = null;
    for (const r of this.rooms) {
      if (Math.abs(x - r.cx) > r.hl + r.hw + 12 || Math.abs(z - r.cz) > r.hl + r.hw + 12) continue;
      if (this.inner(r, x, z).d >= 0 && (h === null || r.floor > h)) h = r.floor;
    }
    return h;
  }
  ceilingAt(x, z) {
    let c = null;
    for (const r of this.rooms) {
      if (Math.abs(x - r.cx) > r.hl + r.hw + 12 || Math.abs(z - r.cz) > r.hl + r.hw + 12) continue;
      if (this.inner(r, x, z).d >= 0 && (c === null || r.ceil > c)) c = r.ceil;
    }
    return c ?? METRO_DEPTH + TUNNEL_H;
  }
  /** In the stretch of tunnel under the Hooghly? */
  underRiver(x, z) {
    for (const r of this.rooms) {
      if (!r.river || Math.abs(x - r.cx) > r.hl + 4 || Math.abs(z - r.cz) > r.hl + 4) continue;
      if (this.inner(r, x, z).d >= 0) return true;
    }
    return false;
  }
  /** Is this point inside the metro (below street level)? */
  inside(x, z) {
    return this.floorAt(x, z) !== null;
  }

  /** Keep a circle inside the union of rooms. */
  collideCircle(x, z, r) {
    let best = null;
    for (const room of this.rooms) {
      if (Math.abs(x - room.cx) > room.hl + room.hw + 12 || Math.abs(z - room.cz) > room.hl + room.hw + 12) continue;
      const q = this.inner(room, x, z);
      if (!best || q.d > best.q.d) best = { room, q };
    }
    if (!best || best.q.d >= r) return null;
    const { room, q } = best;
    // Push back across the nearest wall of the best room
    const pu = room.hl - Math.abs(q.u);
    const pv = room.hw - Math.abs(q.v);
    let lu = 0;
    let lv = 0;
    if (pu < pv) lu = -Math.sign(q.u) * (r - pu);
    else lv = -Math.sign(q.v) * (r - pv);
    const px = room.ux * lu - room.uz * lv;
    const pz = room.uz * lu + room.ux * lv;
    const l = Math.hypot(px, pz) || 1;
    return { px, pz, nx: px / l, nz: pz / l };
  }

  /** 2D segment vs walls; fraction of the first point outside every room (1 = clear). */
  raycast(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.ceil(len / 0.4));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!this.inside(ax + (bx - ax) * t, az + (bz - az) * t)) return Math.max(0, t - 1 / n);
    }
    return 1;
  }
  raycastHit(ax, az, bx, bz) {
    const t = this.raycast(ax, az, bx, bz);
    if (t >= 1) return null;
    const l = Math.hypot(bx - ax, bz - az) || 1;
    return { t, nx: -(bx - ax) / l, nz: -(bz - az) / l };
  }

  update(night) {
    this.lampMat.color.setScalar(2.2 + night * 0.6);
  }
}

function mSignTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = 'bold 84px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('M', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
void clamp;
