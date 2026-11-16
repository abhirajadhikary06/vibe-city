import * as THREE from 'three';
import { clamp, damp, lerp } from './utils.js';

/*
 * Procedural humanoid: rigid body parts skinned to a bone hierarchy, merged into
 * ONE SkinnedMesh per character (one draw call). Animation is fully procedural:
 * locomotion cycles + keyframe-free gesture functions blended with damping.
 */

// name, parent index, local offset in bind pose
const DEF = [
  ['root', -1, 0, 0, 0],
  ['hips', 0, 0, 0.95, 0],
  ['spine', 1, 0, 0.1, 0],
  ['chest', 2, 0, 0.22, 0],
  ['neck', 3, 0, 0.25, 0],
  ['head', 4, 0, 0.08, 0],
  ['shL', 3, 0.19, 0.19, 0],
  ['elL', 6, 0, -0.29, 0],
  ['haL', 7, 0, -0.25, 0],
  ['shR', 3, -0.19, 0.19, 0],
  ['elR', 9, 0, -0.29, 0],
  ['haR', 10, 0, -0.25, 0],
  ['hipL', 1, 0.1, -0.06, 0],
  ['knL', 12, 0, -0.43, 0],
  ['ftL', 13, 0, -0.41, 0],
  ['hipR', 1, -0.1, -0.06, 0],
  ['knR', 15, 0, -0.43, 0],
  ['ftR', 16, 0, -0.41, 0],
];
const NAMES = DEF.map((d) => d[0]);
const IDX = Object.fromEntries(NAMES.map((n, i) => [n, i]));

/* ---------- Print textures (atlas: left half = print, right half = plain white) ---------- */
function printAtlas(base, flowers, leaf) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.save();
  g.beginPath();
  g.rect(0, 0, 256, 256);
  g.clip();
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const a = rnd() * Math.PI;
    g.fillStyle = leaf;
    g.save();
    g.translate(x + 10, y + 8);
    g.rotate(a);
    g.beginPath();
    g.ellipse(0, 0, 22, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  for (let i = 0; i < 22; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 9 + rnd() * 9;
    g.fillStyle = flowers[i % flowers.length];
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2 + i;
      g.beginPath();
      g.ellipse(x + Math.cos(pa) * r * 0.7, y + Math.sin(pa) * r * 0.7, r * 0.62, r * 0.4, pa, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fff3b0';
    g.beginPath();
    g.arc(x, y, r * 0.25, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let NPC_MAT = null;
function npcMaterial() {
  if (!NPC_MAT) {
    NPC_MAT = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: printAtlas('#ffffff', ['#9a9a9a', '#c8c8c8', '#7a7a7a'], '#b4b4b4'),
      roughness: 0.68,
    });
  }
  return NPC_MAT;
}
export function playerMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: printAtlas('#1fb5b0', ['#ff4f9a', '#ffd166', '#ff8a5b', '#ffffff'], '#0d6f62'),
    roughness: 0.7,
  });
}

/* ---------- Look randomiser ---------- */
const SKINS = ['#f1c7a5', '#e0a882', '#c98e6a', '#a86f4c', '#7d4e33', '#5a3524', '#f5d2b8'];
const SHIRTS = ['#ff6fa8', '#39d0d8', '#ffd166', '#ffffff', '#9be37a', '#b57bff', '#ff8a5b', '#5aa9ff', '#f5f1e6', '#e84a5f', '#2d2d33'];
const PANTS = ['#f2f0ea', '#d8c7a3', '#5b7fa8', '#2b2f38', '#c9b8e8', '#a8e6cf', '#3d3b39', '#e9dcc0'];
const HAIR = ['#1f1611', '#3b2618', '#6b4a2b', '#c9a36a', '#e8d6a8', '#2a2a2a', '#8a3b22'];

export function randomLook(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const female = rng() < 0.45;
  return {
    female,
    skin: pick(SKINS),
    shirt: pick(SHIRTS),
    print: rng() < 0.35,
    pants: pick(PANTS),
    shoes: pick(['#1c1c1c', '#f0f0f0', '#7a5230', '#d9c3a1']),
    hair: pick(HAIR),
    longHair: female ? rng() < 0.8 : rng() < 0.08,
    skirt: female && rng() < 0.4,
    shorts: rng() < 0.3,
    longSleeve: rng() < 0.15,
    eyes: pick(['#3b2a1e', '#2f4f7a', '#3f6b3a', '#5a3a1e']),
    glasses: rng() < 0.35,
    scale: female ? 0.93 + rng() * 0.06 : 0.97 + rng() * 0.08,
  };
}

export const PLAYER_LOOK = {
  female: false,
  skin: '#c98e6a',
  shirt: '#ffffff',
  print: true,
  pants: '#f4f2ec',
  shoes: '#d9c3a1',
  hair: '#2a1c14',
  longHair: false,
  skirt: false,
  glasses: true,
  shorts: false,
  longSleeve: false,
  scale: 1.02,
  player: true,
};

/* ---------- Geometry ---------- */
// Joint heights in the bind pose (metres)
const J = { hip: 0.89, knee: 0.46, ankle: 0.07, waist: 1.05, chest: 1.24, neck: 1.52, head: 1.6, sh: 1.44, elbow: 1.17, wrist: 0.92 };

// Skin weights: blend between consecutive bones of a chain around each joint height.
const chain = (bones, joints, r) => (y) => {
  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    if (y > j + r) return [[IDX[bones[i]], 1]];
    if (y >= j - r) {
      const wl = (j + r - y) / (2 * r);
      return [[IDX[bones[i]], 1 - wl], [IDX[bones[i + 1]], wl]];
    }
  }
  return [[IDX[bones[bones.length - 1]], 1]];
};
const rigid = (bone) => () => [[IDX[bone], 1]];

const V2 = (r, y) => new THREE.Vector2(r, y);
function lathe(points, seg) {
  return new THREE.LatheGeometry(points.map(([r, y]) => V2(r, y)), seg);
}

function buildGeometry(look) {
  const hi = !!look.player;
  const S = hi ? 22 : 14; // radial segments
  const parts = [];
  // colour: hex or fn(y) ; print: bool or fn(y)
  const P = (geo, weights, color, print = false) => parts.push({ geo, weights, color, print });
  const sph = (r, x, y, z, sx = 1, sy = 1, sz = 1, ws = S, hs = Math.round(S * 0.7)) => new THREE.SphereGeometry(r, ws, hs).scale(sx, sy, sz).translate(x, y, z);
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const cap = (r, len, x, y, z) => new THREE.CapsuleGeometry(r, len, 3, 8).translate(x, y, z);
  const { skin, shirt, pants, shoes, hair, female } = look;
  const sw = female ? 0.9 : 1;
  const lowerLeg = look.skirt || look.shorts ? skin : pants;
  const lip = new THREE.Color(skin).lerp(new THREE.Color('#b0505a'), 0.45);

  /* Torso: one smooth lathed shape — pants below the waist, shirt above */
  const torsoPts = female
    ? [[0.001, 0.84], [0.11, 0.86], [0.15, 0.9], [0.168, 0.97], [0.15, 1.04], [0.125, 1.1], [0.128, 1.17], [0.15, 1.26], [0.158, 1.33], [0.16, 1.39], [0.15, 1.44], [0.11, 1.49], [0.055, 1.52]]
    : [[0.001, 0.84], [0.115, 0.86], [0.15, 0.9], [0.16, 0.97], [0.152, 1.04], [0.14, 1.1], [0.145, 1.17], [0.165, 1.26], [0.18, 1.33], [0.186, 1.39], [0.175, 1.44], [0.125, 1.49], [0.06, 1.53]];
  const torso = lathe(torsoPts, S + 4).scale(1.16 * sw, 1, 0.72);
  const shirtTop = look.skirt ? 0.84 : 1.035;
  P(torso, chain(['hips', 'spine', 'chest'], [J.waist, J.chest], 0.07), (y) => (y < shirtTop ? pants : shirt), (y) => look.print && y >= shirtTop);
  // Belt + buckle, collar, buttons, open neckline
  if (!look.skirt) {
    P(new THREE.TorusGeometry(0.155, 0.014, 6, S + 4).rotateX(Math.PI / 2).scale(1.16 * sw, 1, 0.74).translate(0, 1.035, 0), rigid('hips'), '#2e2118');
    P(box(0.045, 0.03, 0.012, 0, 1.035, 0.115), rigid('hips'), '#d8b25a');
  }
  if (look.skirt) P(lathe([[0.27, 0.6], [0.24, 0.7], [0.19, 0.84], [0.16, 0.95]], S + 4).scale(1.1, 1, 0.8), rigid('hips'), shirt);
  P(new THREE.TorusGeometry(0.07, 0.016, 6, S, Math.PI * 1.4).rotateX(Math.PI / 2).rotateY(Math.PI * 0.8).scale(1.1, 1, 1).translate(0, 1.5, 0.01), rigid('chest'), shirt);
  P(sph(0.055, 0, 1.445, 0.104, 1, 1.5, 0.32), rigid('chest'), skin);
  for (const by of [1.37, 1.29, 1.21, 1.13]) P(sph(0.007, 0, by, 0.128 - (1.37 - by) * 0.05, 1, 1, 0.5, 6, 4), rigid('chest'), '#f5f1e6');

  /* Neck & head */
  P(lathe([[0.058, 1.49], [0.052, 1.54], [0.05, 1.6], [0.055, 1.64]], S), chain(['chest', 'neck', 'head'], [J.neck, J.head], 0.03), skin);
  const H = 'head';
  P(sph(0.104, 0, 1.712, -0.005, 0.86, 1.05, 1), rigid(H), skin); // cranium
  P(sph(0.078, 0, 1.648, 0.024, 0.95, 0.78, 1), rigid(H), skin); // jaw
  P(sph(0.028, 0, 1.612, 0.07, 1.1, 0.8, 0.9, 10, 8), rigid(H), skin); // chin
  P(new THREE.ConeGeometry(0.017, 0.045, 8).rotateX(Math.PI / 2 + 0.35).translate(0, 1.686, 0.1), rigid(H), skin); // nose
  P(sph(0.021, 0, 1.643, 0.092, 1.45, 0.42, 0.55, 10, 6), rigid(H), lip); // lips
  for (const s of [1, -1]) {
    P(sph(0.026, 0.094 * s, 1.698, -0.002, 0.42, 1, 0.75, 8, 6), rigid(H), skin); // ears
    if (!look.glasses) {
      P(sph(0.0155, 0.034 * s, 1.716, 0.085, 1, 0.8, 0.6, 10, 8), rigid(H), '#f4f1ec'); // sclera
      P(sph(0.009, 0.034 * s, 1.716, 0.094, 1, 1, 0.4, 8, 6), rigid(H), look.eyes || '#3b2a1e'); // iris
    }
    P(box(0.042, 0.009, 0.012, 0.036 * s, 1.742, 0.092).rotateZ(-0.12 * s), rigid(H), hair); // brows
  }
  // Hair
  P(new THREE.SphereGeometry(0.112, S, 12, 0, Math.PI * 2, 0, Math.PI * (look.longHair ? 0.62 : 0.52)).scale(0.9, 1.06, 1.04).translate(0, 1.71, -0.012), rigid(H), hair);
  if (look.longHair) P(cap(0.1, 0.24, 0, 1.58, -0.055).scale(1.08, 1, 0.62), rigid(H), hair);
  else P(sph(0.1, 0, 1.69, -0.03, 0.88, 0.75, 0.9, S, 10), rigid(H), hair); // back of head
  if (look.glasses) {
    for (const s of [1, -1]) P(box(0.072, 0.042, 0.012, 0.038 * s, 1.716, 0.098), rigid(H), '#08080a');
    P(box(0.03, 0.01, 0.01, 0, 1.722, 0.1), rigid(H), '#c9a64a');
    for (const s of [1, -1]) P(box(0.008, 0.012, 0.11, 0.092 * s, 1.722, 0.045), rigid(H), '#c9a64a');
  }

  /* Arms */
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const x = 0.19 * s * sw;
    const armW = chain(['chest', 'sh' + side, 'el' + side, 'ha' + side], [1.47, J.elbow, J.wrist], 0.045);
    P(sph(0.066, x, 1.435, 0, 1, 0.95, 1.05), (y) => [[IDX.chest, 0.35], [IDX['sh' + side], 0.65]], shirt, look.print);
    const upper = lathe([[0.043, 1.15], [0.047, 1.2], [0.053, 1.29], [0.056, 1.36], [0.055, 1.42], [0.04, 1.48]], S).translate(x, 0, 0);
    P(upper, armW, (y) => (y > (look.longSleeve ? 0 : 1.31) ? shirt : skin), (y) => look.print && y > 1.31);
    if (!look.longSleeve) P(lathe([[0.062, 1.3], [0.064, 1.33], [0.063, 1.4]], S).translate(x, 0, 0), armW, shirt, look.print);
    P(lathe([[0.029, 0.9], [0.032, 0.94], [0.04, 1.02], [0.045, 1.09], [0.045, 1.15], [0.043, 1.19]], S).translate(x, 0, 0), armW, look.longSleeve ? shirt : skin);
    if (side === 'L') P(new THREE.TorusGeometry(0.034, 0.008, 6, 14).rotateX(Math.PI / 2).translate(x, 0.945, 0), armW, '#c9a64a');
    // Hand: palm, four fingers, thumb (palm faces the thigh)
    const HB = rigid('ha' + side);
    P(box(0.028, 0.08, 0.072, x, 0.875, 0.004), HB, skin);
    for (let f = 0; f < 4; f++) P(cap(0.0085, 0.045 - Math.abs(f - 1.5) * 0.006, x, 0.81, -0.026 + f * 0.017).rotateX(0.1), HB, skin);
    P(cap(0.01, 0.035, x - 0.008 * s, 0.86, 0.045).rotateX(-0.3).translate(0, 0.25 * 0.86 * 0.0, 0), HB, skin);

    /* Legs */
    const lx = 0.095 * s;
    const legW = chain(['hips', 'hip' + side, 'kn' + side, 'ft' + side], [0.9, J.knee, J.ankle], 0.05);
    P(lathe([[0.058, 0.44], [0.066, 0.52], [0.078, 0.66], [0.085, 0.78], [0.088, 0.86], [0.08, 0.93]], S).translate(lx, 0, 0), legW, look.skirt ? skin : pants);
    const shortsHem = look.shorts ? 0.5 : -1;
    P(lathe([[0.038, 0.07], [0.042, 0.12], [0.055, 0.25], [0.058, 0.33], [0.052, 0.42], [0.058, 0.49]], S).translate(lx, 0, 0), legW, (y) => (y < shortsHem || look.skirt || look.shorts ? skin : pants));
    if (look.shorts) P(lathe([[0.082, 0.5], [0.09, 0.6]], S).translate(lx, 0, 0), legW, pants);
    // Shoe: sole + rounded upper
    const FB = rigid('ft' + side);
    P(box(0.092, 0.028, 0.255, lx, 0.014, 0.045), FB, '#1a1a1a');
    P(sph(0.052, lx, 0.055, 0.05, 0.92, 0.62, 2.1), FB, shoes);
    P(lathe([[0.045, 0.06], [0.048, 0.11]], 12).translate(lx, 0, -0.005), FB, shoes);
  }

  /* Merge — indexed, with up to two bone weights per vertex */
  const pos = [];
  const nor = [];
  const uv = [];
  const col = [];
  const si = [];
  const swt = [];
  const index = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const g = p.geo;
    const a = g.attributes;
    const base = pos.length / 3;
    const colorFn = typeof p.color === 'function' ? p.color : null;
    const printFn = typeof p.print === 'function' ? p.print : null;
    if (!colorFn) c.set(p.color);
    for (let i = 0; i < a.position.count; i++) {
      const x = a.position.getX(i);
      const y = a.position.getY(i);
      const z = a.position.getZ(i);
      pos.push(x, y, z);
      nor.push(a.normal.getX(i), a.normal.getY(i), a.normal.getZ(i));
      const printed = printFn ? printFn(y) : p.print;
      if (printed && a.uv) uv.push(a.uv.getX(i) * 0.48 + 0.01, a.uv.getY(i) * 0.96 + 0.02);
      else uv.push(0.75, 0.5);
      if (colorFn) c.set(colorFn(y));
      col.push(c.r, c.g, c.b);
      const w = p.weights(y);
      si.push(w[0][0], w[1] ? w[1][0] : 0, 0, 0);
      swt.push(w[0][1], w[1] ? w[1][1] : 0, 0, 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(g.index.getX(i) + base);
    else for (let i = 0; i < a.position.count; i++) index.push(base + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(swt, 4));
  geo.setIndex(index);
  return geo;
}

/* ---------- Pose helpers ---------- */
function zeroPose(P) {
  for (const n of NAMES) {
    const b = P[n] || (P[n] = [0, 0, 0]);
    b[0] = b[1] = b[2] = 0;
  }
  P.hipsY = 0;
  return P;
}
// f = raise forward, o = raise outward, t = twist outward (all mirrored for the right side)
const arm = (P, side, f, o = 0, t = 0) => {
  const s = side === 'L' ? 1 : -1;
  const b = P['sh' + side];
  b[0] = -f;
  b[1] = t * s;
  b[2] = o * s;
};
const elbow = (P, side, bend, up = 0) => {
  const s = side === 'L' ? 1 : -1;
  const b = P['el' + side];
  b[0] = -bend;
  b[2] = up * s;
};
const leg = (P, side, f, o = 0) => {
  const s = side === 'L' ? 1 : -1;
  P['hip' + side][0] = -f;
  P['hip' + side][2] = o * s;
};
const knee = (P, side, b) => {
  P['kn' + side][0] = b;
};

function locomotion(P, T, phase, v) {
  const w = clamp(v / 1.6, 0, 1);
  const r = clamp((v - 2.6) / 3, 0, 1);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const ls = lerp(0.42, 0.85, r) * w;
  leg(P, 'L', s * ls);
  leg(P, 'R', -s * ls);
  const kb = lerp(0.55, 1.4, r);
  knee(P, 'L', w * (0.1 + kb * Math.max(0, c)));
  knee(P, 'R', w * (0.1 + kb * Math.max(0, -c)));
  P.ftL[0] = -w * 0.25 * Math.max(0, -s);
  P.ftR[0] = -w * 0.25 * Math.max(0, s);
  const as = lerp(0.35, 0.8, r) * w;
  arm(P, 'L', -s * as, 0.08 + r * 0.05);
  arm(P, 'R', s * as, 0.08 + r * 0.05);
  elbow(P, 'L', 0.12 + lerp(0.2, 1.4, r) * w);
  elbow(P, 'R', 0.12 + lerp(0.2, 1.4, r) * w);
  P.spine[0] = 0.04 + 0.2 * r * w;
  P.chest[1] = s * 0.14 * w;
  P.hips[1] = -s * 0.1 * w;
  P.head[0] = -0.05 * r;
  P.hipsY = (-0.02 + 0.045 * Math.abs(c)) * w - 0.05 * r;
  // idle breathing
  const idle = 1 - w;
  P.chest[0] += Math.sin(T * 1.6) * 0.02 * idle;
  P.head[1] += Math.sin(T * 0.4) * 0.12 * idle;
  arm(P, 'L', P.shL[0] * -1, 0.07 + Math.sin(T * 1.6) * 0.01 * idle);
  arm(P, 'R', P.shR[0] * -1, 0.07 + Math.sin(T * 1.6) * 0.01 * idle);
}

/* ---------- Gestures ---------- */
export const EMOTES = {
  wave: {
    dur: 2.4,
    fn(P, t) {
      arm(P, 'R', 0.25, 1.45);
      elbow(P, 'R', 0.15, 1.25 + Math.sin(t * 9) * 0.38);
      P.head[2] = -0.1;
      P.chest[1] = -0.1;
    },
  },
  dance: {
    dur: 9999,
    loop: true,
    fn(P, t) {
      const b = t * 2.2;
      const sw = Math.sin(b * Math.PI);
      const bounce = Math.abs(sw);
      P.hipsY = -0.07 + bounce * 0.05;
      P.hips[2] = sw * 0.12;
      P.hips[1] = Math.sin(b * Math.PI * 0.5) * 0.25;
      P.chest[2] = -sw * 0.12;
      P.head[2] = sw * 0.14;
      P.head[0] = bounce * 0.1;
      leg(P, 'L', 0.22, 0.08);
      leg(P, 'R', 0.22, 0.08);
      knee(P, 'L', 0.35 + bounce * 0.25 * (sw > 0 ? 1.4 : 0.6));
      knee(P, 'R', 0.35 + bounce * 0.25 * (sw < 0 ? 1.4 : 0.6));
      const seq = Math.floor(b / 4) % 4;
      if (seq === 0 || seq === 1) {
        const up = seq === 0 ? 'R' : 'L';
        const dn = seq === 0 ? 'L' : 'R';
        const hit = Math.floor(b) % 2 === 0;
        arm(P, up, hit ? 0.3 : 0.9, hit ? 2.5 : 0.4, 0);
        elbow(P, up, 0.05);
        arm(P, dn, -0.2, 0.55);
        elbow(P, dn, 1.7);
      } else if (seq === 2) {
        for (const [side, ph] of [['L', 0], ['R', Math.PI]]) {
          arm(P, side, 0.9 + Math.sin(b * Math.PI * 2 + ph) * 0.3, 0.2);
          elbow(P, side, 1.8 + Math.cos(b * Math.PI * 2 + ph) * 0.3);
        }
      } else {
        arm(P, 'L', 0.2, 2.6 + sw * 0.25);
        arm(P, 'R', 0.2, 2.6 - sw * 0.25);
        elbow(P, 'L', 0.2, 0.3);
        elbow(P, 'R', 0.2, 0.3);
      }
    },
  },
  point: {
    dur: 1.8,
    fn(P) {
      arm(P, 'R', 1.5, 0.15);
      elbow(P, 'R', 0.05);
      P.chest[1] = -0.2;
      P.head[1] = -0.1;
      arm(P, 'L', 0, 0.12);
    },
  },
  thumbsUp: {
    dur: 1.9,
    fn(P, t) {
      arm(P, 'R', 0.55, 0.3);
      elbow(P, 'R', 1.55);
      P.haR[1] = -0.6;
      P.head[0] = Math.sin(t * 8) * 0.12;
      P.chest[0] = -0.06;
    },
  },
  cheer: {
    dur: 2.6,
    fn(P, t) {
      arm(P, 'L', 0.15, 2.75 + Math.sin(t * 10) * 0.15);
      arm(P, 'R', 0.15, 2.75 - Math.sin(t * 10) * 0.15);
      elbow(P, 'L', 0.25);
      elbow(P, 'R', 0.25);
      const j = Math.max(0, Math.sin(t * 6));
      P.hipsY = j * 0.14 - 0.03;
      knee(P, 'L', 0.2 + (1 - j) * 0.3);
      knee(P, 'R', 0.2 + (1 - j) * 0.3);
      leg(P, 'L', 0.1 + (1 - j) * 0.15);
      leg(P, 'R', 0.1 + (1 - j) * 0.15);
      P.head[0] = -0.25;
    },
  },
  shrug: {
    dur: 1.7,
    fn(P) {
      for (const side of ['L', 'R']) {
        arm(P, side, 0.3, 0.32, 0.75);
        elbow(P, side, 1.55);
      }
      P.head[2] = 0.22;
      P.chest[0] = -0.06;
      P.hipsY = 0.01;
    },
  },
  flex: {
    dur: 2.2,
    fn(P, t) {
      const sh = Math.sin(t * 22) * 0.03;
      for (const side of ['L', 'R']) {
        arm(P, side, 0.05, 1.45 + sh);
        elbow(P, side, 0.05, 1.95);
      }
      P.chest[0] = -0.12;
      P.head[0] = -0.12;
      leg(P, 'L', 0, 0.12);
      leg(P, 'R', 0, 0.12);
    },
  },
  laugh: {
    dur: 2.2,
    fn(P, t) {
      P.spine[0] = -0.16 + Math.sin(t * 14) * 0.04;
      P.head[0] = -0.3 + Math.sin(t * 14) * 0.05;
      for (const side of ['L', 'R']) {
        arm(P, side, 0.35, 0.1, -0.4);
        elbow(P, side, 1.7);
      }
    },
  },
  talk: {
    dur: 2.2,
    fn(P, t) {
      arm(P, 'R', 0.45 + Math.sin(t * 3) * 0.2, 0.15, 0.3);
      elbow(P, 'R', 1.35 + Math.sin(t * 4.2) * 0.35);
      arm(P, 'L', 0.25 + Math.cos(t * 2.4) * 0.15, 0.12, 0.3);
      elbow(P, 'L', 1.1 + Math.cos(t * 3.1) * 0.3);
      P.head[1] = Math.sin(t * 2) * 0.15;
      P.head[0] = Math.sin(t * 5) * 0.05;
    },
  },
  phone: {
    dur: 9999,
    loop: true,
    fn(P, t) {
      arm(P, 'R', 0.35, 0.45, -0.3);
      elbow(P, 'R', 2.5);
      P.head[2] = -0.15;
      P.head[1] = Math.sin(t * 0.7) * 0.2;
      arm(P, 'L', 0.1, 0.4);
      elbow(P, 'L', 1.6);
    },
  },
  hit: {
    dur: 0.45,
    fn(P, t) {
      const k = Math.sin(Math.min(1, t / 0.45) * Math.PI);
      P.spine[0] = -0.3 * k;
      P.head[0] = -0.45 * k;
      P.chest[1] = 0.25 * k;
      arm(P, 'L', 0.2, 0.5 * k);
      arm(P, 'R', 0.3, 0.6 * k);
      knee(P, 'L', 0.3 * k);
      P.hipsY = -0.05 * k;
    },
  },
  cower: {
    dur: 1.6,
    fn(P) {
      leg(P, 'L', 0.7);
      leg(P, 'R', 0.7);
      knee(P, 'L', 1.1);
      knee(P, 'R', 1.1);
      P.hipsY = -0.25;
      P.spine[0] = 0.45;
      for (const side of ['L', 'R']) {
        arm(P, side, 1.6, 0.3);
        elbow(P, side, 2.0);
      }
      P.head[0] = 0.3;
    },
  },
};
export const EMOTE_LIST = ['wave', 'dance', 'point', 'thumbsUp', 'cheer', 'shrug', 'flex', 'laugh'];
export const EMOTE_LABELS = { wave: 'Wave', dance: 'Dance', point: 'Point', thumbsUp: 'Thumbs Up', cheer: 'Cheer', shrug: 'Shrug', flex: 'Flex', laugh: 'Laugh' };

/* =========================================================
   Character
   ========================================================= */
export class Character {
  constructor(scene, look, material) {
    const geo = buildGeometry(look);
    const mat = material || npcMaterial();
    const bones = DEF.map(([name, , x, y, z]) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x, y, z);
      return b;
    });
    DEF.forEach(([, p], i) => {
      if (p >= 0) bones[p].add(bones[i]);
    });
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.castShadow = true;
    mesh.scale.setScalar(look.scale || 1);
    this.mesh = mesh;
    this.bones = Object.fromEntries(NAMES.map((n, i) => [n, bones[i]]));
    this.look = look;
    scene.add(mesh);

    this.speed = 0;
    this.phase = 0;
    this.mode = 'move'; // move | air | sit | ride | down
    this.emote = null;
    this.emoteT = 0;
    this.atk = null; // jab | cross | kick | swing
    this.atkT = -1;
    this.hold = null; // { kind: pistol | rifle | bat, raised, pitch }
    this.steer = 0;
    this.P = zeroPose({});
    this.hipsY = 0;
  }

  play(name) {
    if (this.emote === name && EMOTES[name].loop) return;
    this.emote = name;
    this.emoteT = 0;
  }
  stopEmote() {
    this.emote = null;
  }
  punch() {
    return this.attack('jab');
  }
  attack(kind) {
    if (this.atkT >= 0) return false;
    this.atk = kind;
    this.atkT = 0;
    this.emote = null;
    return true;
  }
  get attacking() {
    return this.atkT >= 0;
  }
  get busy() {
    return !!this.emote || this.atkT >= 0;
  }

  update(dt, T) {
    const P = zeroPose(this.P);
    let k = 11;
    if (this.mode === 'sit') {
      leg(P, 'L', 1.45, 0.08);
      leg(P, 'R', 1.45, 0.08);
      knee(P, 'L', 1.35);
      knee(P, 'R', 1.35);
      P.spine[0] = -0.12;
      P.chest[2] = -this.steer * 0.1;
      for (const side of ['L', 'R']) {
        arm(P, side, 1.05 + (side === 'L' ? this.steer : -this.steer) * 0.2, 0.12);
        elbow(P, side, 0.65);
      }
      P.head[1] = -this.steer * 0.25;
    } else if (this.mode === 'ride') {
      // Motorbike: knees tucked against the tank, leaning on the bars
      leg(P, 'L', 1.1, 0.22);
      leg(P, 'R', 1.1, 0.22);
      knee(P, 'L', 1.75);
      knee(P, 'R', 1.75);
      P.ftL[0] = -0.4;
      P.ftR[0] = -0.4;
      P.spine[0] = 0.4;
      P.chest[0] = 0.1;
      P.head[0] = -0.45;
      for (const side of ['L', 'R']) {
        arm(P, side, 1.05 + (side === 'L' ? this.steer : -this.steer) * 0.15, 0.32);
        elbow(P, side, 0.55);
      }
    } else if (this.mode === 'down') {
      P.hips[0] = -1.5;
      P.hipsY = -0.8;
      arm(P, 'L', 0.3, 1.0);
      arm(P, 'R', -0.2, 0.8);
      elbow(P, 'L', 0.6);
      knee(P, 'L', 0.5);
      leg(P, 'L', 0.35);
      P.head[0] = -0.3;
      P.head[1] = 0.5;
      k = 7;
    } else if (this.mode === 'air') {
      leg(P, 'L', 0.55);
      leg(P, 'R', 0.15);
      knee(P, 'L', 1.1);
      knee(P, 'R', 0.6);
      arm(P, 'L', 0.4, 0.7);
      arm(P, 'R', -0.2, 0.7);
      elbow(P, 'L', 0.8);
      elbow(P, 'R', 0.5);
      k = 14;
    } else {
      this.phase += (dt * this.speed * Math.PI * 2) / lerp(1.4, 2.5, clamp((this.speed - 2.6) / 3, 0, 1));
      locomotion(P, T, this.phase, this.speed);
      if (this.emote) {
        const e = EMOTES[this.emote];
        this.emoteT += dt;
        e.fn(P, this.emoteT, T);
        if (!e.loop && this.emoteT > e.dur) this.emote = null;
      }
    }
    if (this.mode === 'move' || this.mode === 'air') this.holdPose(P);
    if (this.atkT >= 0) {
      k = 26;
      if (this.attackPose(P, this.atk, this.atkT)) this.atkT = -1;
      else this.atkT += dt;
    }

    // Blend toward target
    const b = this.bones;
    for (const n of NAMES) {
      const r = b[n].rotation;
      const tp = P[n];
      r.x = damp(r.x, tp[0], k, dt);
      r.y = damp(r.y, tp[1], k, dt);
      r.z = damp(r.z, tp[2], k, dt);
    }
    this.hipsY = damp(this.hipsY, P.hipsY, k, dt);
    b.hips.position.y = 0.95 + this.hipsY;
  }

  /** Upper-body pose for whatever is in the hands. */
  holdPose(P) {
    const h = this.hold;
    if (!h || this.atkT >= 0) return;
    const p = clamp(h.pitch || 0, -1, 1);
    if (h.kind === 'pistol') {
      if (h.raised) {
        arm(P, 'R', 1.5 + p, -0.08);
        elbow(P, 'R', 0.05);
        arm(P, 'L', 1.42 + p, -0.42);
        elbow(P, 'L', 0.4);
        P.chest[1] = 0.12;
        P.head[0] = -p * 0.4;
      } else {
        arm(P, 'R', 0.3, 0.1);
        elbow(P, 'R', 0.45);
      }
    } else if (h.kind === 'rifle') {
      if (h.raised) {
        arm(P, 'R', 1.0 + p, 0.35);
        elbow(P, 'R', 1.3);
        arm(P, 'L', 1.35 + p, -0.5);
        elbow(P, 'L', 0.45);
        P.chest[1] = -0.25;
        P.head[1] = 0.25;
        P.head[0] = -p * 0.4;
      } else {
        arm(P, 'R', 0.5, 0.2);
        elbow(P, 'R', 1.3);
        arm(P, 'L', 0.8, -0.45);
        elbow(P, 'L', 1.4);
        P.chest[1] = -0.1;
      }
    } else if (h.kind === 'bat') {
      // resting on the right shoulder
      arm(P, 'R', 0.35, 0.25);
      elbow(P, 'R', 2.1);
    } else if (h.kind === 'fists' && h.raised) {
      // fighting guard
      arm(P, 'L', 0.9, 0.2);
      elbow(P, 'L', 2.1);
      arm(P, 'R', 0.75, 0.25);
      elbow(P, 'R', 2.2);
      P.chest[1] = -0.15;
    }
  }

  /** Strike animations. Returns true when finished. */
  attackPose(P, kind, t) {
    const guard = (side) => {
      arm(P, side, 0.9, 0.2);
      elbow(P, side, 2.1);
    };
    if (kind === 'jab' || kind === 'cross') {
      const S = kind === 'jab' ? 'R' : 'L';
      const O = kind === 'jab' ? 'L' : 'R';
      const tw = kind === 'jab' ? 1 : -1;
      guard(O);
      if (t < 0.1) {
        arm(P, S, 0.6, 0.25);
        elbow(P, S, 2.2);
        P.chest[1] = -0.3 * tw;
      } else if (t < 0.26) {
        arm(P, S, 1.55, 0.35);
        elbow(P, S, 0.05);
        P.chest[1] = 0.45 * tw;
        P.spine[0] = 0.12;
        leg(P, S === 'R' ? 'L' : 'R', 0.25);
      } else {
        arm(P, S, 0.8, 0.2);
        elbow(P, S, 2.0);
      }
      return t > 0.42;
    }
    if (kind === 'kick') {
      guard('L');
      guard('R');
      if (t < 0.16) {
        leg(P, 'R', 1.2);
        knee(P, 'R', 1.7);
        P.spine[0] = -0.1;
      } else if (t < 0.38) {
        leg(P, 'R', 1.5);
        knee(P, 'R', 0.08);
        P.ftR[0] = 0.3;
        P.spine[0] = -0.3;
        P.hipsY = -0.04;
        knee(P, 'L', 0.2);
      } else {
        leg(P, 'R', 0.6);
        knee(P, 'R', 1.0);
      }
      return t > 0.62;
    }
    if (kind === 'swing') {
      // two-handed horizontal swing, right to left
      if (t < 0.18) {
        P.chest[1] = -0.85;
        arm(P, 'R', 1.0, 0.7);
        elbow(P, 'R', 1.6);
        arm(P, 'L', 1.1, -0.1);
        elbow(P, 'L', 1.4);
      } else if (t < 0.34) {
        P.chest[1] = 0.75;
        arm(P, 'R', 1.45, -0.1);
        elbow(P, 'R', 0.3);
        arm(P, 'L', 1.45, -0.5);
        elbow(P, 'L', 0.35);
        P.spine[0] = 0.12;
      } else {
        P.chest[1] = 0.95;
        arm(P, 'R', 1.0, -0.2);
        elbow(P, 'R', 0.9);
        arm(P, 'L', 1.0, -0.5);
        elbow(P, 'L', 0.9);
      }
      return t > 0.62;
    }
    return true;
  }

  get handR() {
    return this.bones.haR.getWorldPosition(new THREE.Vector3());
  }
  get headPos() {
    return this.bones.head.getWorldPosition(new THREE.Vector3());
  }
}
