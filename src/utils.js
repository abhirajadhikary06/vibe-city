import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const wrapAngle = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
export const dampAngle = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));

const KEEP = ['position', 'normal', 'uv', 'color'];

/** Merge geometries, normalising index / attribute sets so mixed sources work. */
export function merge(geos) {
  if (!geos.length) return null;
  const nonIndexed = geos.some((g) => !g.index);
  const allUv = geos.every((g) => g.attributes.uv);
  const list = geos.map((g) => {
    const q = nonIndexed && g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(q.attributes)) {
      if (!KEEP.includes(k) || (k === 'uv' && !allUv)) q.deleteAttribute(k);
    }
    return q;
  });
  return mergeGeometries(list, false);
}

export function paint(g, hex) {
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

export function colorBox(list, w, h, d, x, y, z, hex, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  list.push(paint(g, hex));
  return g;
}

export function colorCyl(list, rt, rb, h, x, y, z, hex, seg = 10) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  list.push(paint(g, hex));
  return g;
}

/** "4 min", "1 h 10 min" */
export const etaText = (sec) => {
  const m = Math.max(1, Math.round(sec / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
