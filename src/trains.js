import * as THREE from 'three';
import { merge } from './utils.js';

/*
 * Indian rolling stock and the Kolkata tram, built light: a rounded body shell
 * in the livery colour, with windows, doors, bars, stripes and lettering painted
 * onto side and end textures (rich detail at a handful of draw calls per car).
 *
 *  - EMU local (Howrah / Sealdah divisions): silver with a maroon band, three
 *    open doorways a side, barred windows, the flat yellow cab with its red band.
 *  - Rajdhani Express: a WAP-7 electric locomotive and red LHB coaches with a
 *    cream stripe.
 *  - Kolkata tram (WBTC): white over blue, grilled windows, an open middle door,
 *    the white chevron on the blue front, a red rounded roof and a trolley pole.
 */

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);
function rod(a, b, r, seg = 6) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---------- Side and end artwork (texture u runs along the car, v up) ---------- */
const PX = 48; // texture pixels per metre
function bars(g, x, y, w, h, gap = 7) {
  g.fillStyle = 'rgba(30,30,30,0.85)';
  for (let k = x + gap / 2; k < x + w; k += gap) g.fillRect(k, y, 2, h);
  g.fillRect(x, y + h * 0.5, w, 2);
}
function windowPane(g, x, y, w, h, lit = false) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, lit ? '#3d4a55' : '#26313a');
  gr.addColorStop(1, '#10161c');
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2;
  g.strokeRect(x, y, w, h);
}
function grime(g, w, h, amt = 0.08) {
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w;
    const gr = g.createLinearGradient(0, h * 0.4, 0, h);
    gr.addColorStop(0, 'rgba(60,45,30,0)');
    gr.addColorStop(1, `rgba(60,45,30,${amt})`);
    g.fillStyle = gr;
    g.fillRect(x, h * 0.4, 6 + Math.random() * 30, h * 0.6);
  }
}

/** Livery painters: (g, w, h, L) draw one side of a car of length L metres. */
const SIDES = {
  emu(g, w, h, L) {
    g.fillStyle = '#c3c7cc';
    g.fillRect(0, 0, w, h);
    // ribbed stainless look
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
    g.fillStyle = '#7a1f2b';
    g.fillRect(0, h * 0.62, w, h * 0.09);
    g.fillStyle = '#b8322a';
    g.fillRect(0, h * 0.73, w, h * 0.025);
    // three wide doorways (always open on a Kolkata local), windows between
    const doors = [L * 0.2, L * 0.5, L * 0.8];
    const dw = 1.3 * PX;
    for (const d of doors) {
      const x = d * PX - dw / 2;
      g.fillStyle = '#1a1c1e';
      g.fillRect(x, h * 0.08, dw, h * 0.86);
      g.fillStyle = '#e8c21b';
      g.fillRect(x + dw / 2 - 2, h * 0.12, 4, h * 0.75);
      g.strokeStyle = '#8a8d90';
      g.lineWidth = 4;
      g.strokeRect(x, h * 0.08, dw, h * 0.86);
    }
    const ww = 0.95 * PX;
    for (let k = 0; k < doors.length + 1; k++) {
      const a = (k === 0 ? 0.6 : doors[k - 1] + 0.9) * PX;
      const b = (k === doors.length ? L - 0.6 : doors[k] - 0.9) * PX;
      for (let x = a + 6; x + ww <= b; x += ww + 10) {
        windowPane(g, x, h * 0.2, ww, h * 0.36, true);
        bars(g, x, h * 0.2, ww, h * 0.36);
      }
    }
    g.fillStyle = '#1b1b1b';
    g.font = `bold ${h * 0.07}px Arial`;
    g.fillText('HWH 4002B', 0.8 * PX, h * 0.8);
    grime(g, w, h);
  },
  coach(g, w, h, L) {
    // Rajdhani LHB: red, with a cream stripe under a dark window band
    g.fillStyle = '#a8252b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#121418';
    g.fillRect(2.2 * PX, h * 0.3, w - 4.4 * PX, h * 0.26);
    for (let x = 2.4 * PX; x < w - 2.4 * PX - 1.1 * PX; x += 1.6 * PX) windowPane(g, x, h * 0.32, 1.1 * PX, h * 0.22, true);
    g.fillStyle = '#f0dcb0';
    g.fillRect(0, h * 0.6, w, h * 0.05);
    g.fillStyle = '#e8b84a';
    g.fillRect(0, h * 0.67, w, h * 0.015);
    for (const x of [0.9 * PX, w - 0.9 * PX - 0.9 * PX]) {
      g.fillStyle = '#7e1a1f';
      g.fillRect(x, h * 0.1, 0.9 * PX, h * 0.8);
      windowPane(g, x + 10, h * 0.2, 0.9 * PX - 20, h * 0.18);
    }
    g.fillStyle = '#f0dcb0';
    g.font = `bold ${h * 0.08}px Arial`;
    g.fillText('RAJDHANI EXPRESS', w / 2 - 3.4 * PX, h * 0.83);
    grime(g, w, h, 0.05);
  },
  loco(g, w, h, L) {
    // WAP-7: white body, red skirt and roof band, louvres along the engine room
    g.fillStyle = '#ece9e2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c0282b';
    g.fillRect(0, h * 0.66, w, h * 0.34);
    g.fillRect(0, 0, w, h * 0.08);
    g.fillStyle = '#1f3f9a';
    g.fillRect(0, h * 0.62, w, h * 0.03);
    for (let x = 4 * PX; x < w - 4 * PX; x += 0.8 * PX) {
      g.fillStyle = '#9da2a6';
      g.fillRect(x, h * 0.18, 0.6 * PX, h * 0.36);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let y = h * 0.2; y < h * 0.52; y += 6) g.fillRect(x, y, 0.6 * PX, 2);
    }
    for (const x of [1.2 * PX, w - 2.2 * PX]) windowPane(g, x, h * 0.18, 1.0 * PX, h * 0.3, true);
    g.fillStyle = '#1b1b1b';
    g.font = `bold ${h * 0.08}px Arial`;
    g.fillText('WAP-7  30269  HWH', w / 2 - 2.2 * PX, h * 0.6);
    grime(g, w, h);
  },
  tram(g, w, h, L) {
    g.fillStyle = '#f2efe6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f56b8';
    g.fillRect(0, h * 0.56, w, h * 0.44);
    g.fillStyle = '#f2efe6';
    g.fillRect(0, h * 0.6, w, h * 0.02);
    // the open entrance in the middle
    const dx = L * 0.5 * PX - 0.6 * PX;
    // windows with wire-mesh grilles
    for (let x = 0.5 * PX; x < w - 0.9 * PX; x += 1.05 * PX) {
      if (x + 0.85 * PX > dx - 4 && x < dx + 1.2 * PX + 4) continue;
      windowPane(g, x, h * 0.16, 0.85 * PX, h * 0.34);
      g.strokeStyle = 'rgba(40,40,40,0.7)';
      g.lineWidth = 1;
      for (let k = 0; k < 0.85 * PX; k += 5) {
        g.beginPath();
        g.moveTo(x + k, h * 0.16);
        g.lineTo(x + k, h * 0.5);
        g.stroke();
      }
      for (let k = h * 0.16; k < h * 0.5; k += 5) {
        g.beginPath();
        g.moveTo(x, k);
        g.lineTo(x + 0.85 * PX, k);
        g.stroke();
      }
    }
    g.fillStyle = '#16181a';
    g.fillRect(dx, h * 0.06, 1.2 * PX, h * 0.9);
    g.fillStyle = '#c9a43a';
    g.fillRect(dx + 0.6 * PX - 2, h * 0.1, 4, h * 0.8);
    g.fillStyle = '#ffffff';
    g.font = `bold ${h * 0.1}px Arial`;
    g.fillText('WBTC', 0.8 * PX, h * 0.82);
    g.fillText('222', w - 2.0 * PX, h * 0.82);
    grime(g, w, h, 0.06);
  },
};
/** Cab and end faces: (g, w, h). */
const ENDS = {
  emu(g, w, h) {
    g.fillStyle = '#f2c21b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c3c7cc';
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = '#b8322a';
    g.fillRect(0, h * 0.7, w, h * 0.06);
    for (const x of [w * 0.08, w * 0.54]) {
      windowPane(g, x, h * 0.16, w * 0.38, h * 0.3, true);
      g.strokeStyle = '#2a2a2a';
      g.lineWidth = 6;
      g.strokeRect(x, h * 0.16, w * 0.38, h * 0.3);
    }
    g.fillStyle = '#111';
    g.fillRect(w * 0.38, h * 0.54, w * 0.24, h * 0.07);
    g.fillStyle = '#f2c21b';
    g.font = `bold ${h * 0.05}px Arial`;
    g.textAlign = 'center';
    g.fillText('4002B', w * 0.5, h * 0.595);
  },
  coach(g, w, h) {
    g.fillStyle = '#a8252b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2a2a';
    g.fillRect(w * 0.3, h * 0.08, w * 0.4, h * 0.84);
  },
  loco(g, w, h) {
    g.fillStyle = '#ece9e2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c0282b';
    g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = '#1f3f9a';
    g.fillRect(0, h * 0.58, w, h * 0.04);
    for (const x of [w * 0.07, w * 0.53]) windowPane(g, x, h * 0.14, w * 0.4, h * 0.3, true);
    g.fillStyle = '#e8c21b';
    // the yellow-black hazard chevrons on the buffer beam
    for (let x = 0; x < w; x += 24) {
      g.fillStyle = (x / 24) % 2 ? '#1b1b1b' : '#e8c21b';
      g.fillRect(x, h * 0.9, 24, h * 0.1);
    }
  },
  tram(g, w, h) {
    g.fillStyle = '#f2efe6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f56b8';
    g.fillRect(0, h * 0.56, w, h * 0.44);
    windowPane(g, w * 0.12, h * 0.16, w * 0.76, h * 0.32);
    g.strokeStyle = 'rgba(40,40,40,0.75)';
    g.lineWidth = 1;
    for (let k = w * 0.12; k < w * 0.88; k += 5) {
      g.beginPath();
      g.moveTo(k, h * 0.16);
      g.lineTo(k, h * 0.48);
      g.stroke();
    }
    // the white chevron
    g.strokeStyle = '#ffffff';
    g.lineWidth = h * 0.03;
    g.beginPath();
    g.moveTo(w * 0.1, h * 0.86);
    g.lineTo(w * 0.5, h * 0.68);
    g.lineTo(w * 0.9, h * 0.86);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `bold ${h * 0.08}px Arial`;
    g.textAlign = 'center';
    g.fillText('WBTC', w * 0.5, h * 0.64);
    // route board
    g.fillStyle = '#16233d';
    g.fillRect(w * 0.18, h * 0.02, w * 0.64, h * 0.11);
    g.fillStyle = '#ffffff';
    g.font = `bold ${h * 0.055}px Arial`;
    g.fillText('5  SHYAMBAZAR', w * 0.5, h * 0.09);
  },
};

const TEX = new Map();
function art(kind, L) {
  const key = `${kind}:${L}`;
  if (!TEX.has(key)) {
    const side = canvas(Math.round(L * PX), 192, (g, w, h) => SIDES[kind](g, w, h, L));
    const end = canvas(256, 256, (g, w, h) => ENDS[kind](g, w, h));
    TEX.set(key, {
      side: new THREE.MeshStandardMaterial({ map: side, roughness: kind === 'emu' ? 0.35 : 0.5, metalness: kind === 'emu' ? 0.45 : 0.1 }),
      end: new THREE.MeshStandardMaterial({ map: end, roughness: 0.45, metalness: 0.1 }),
    });
  }
  return TEX.get(key);
}
const MATS = {};
function mat(name, opts) {
  return (MATS[name] ||= new THREE.MeshStandardMaterial(opts));
}

/** Rounded-roof shell cross-section extruded along the car. */
function shell(hw, base, roof, L, roundness) {
  const s = new THREE.Shape();
  const r = Math.min(roundness, hw);
  s.moveTo(-hw, base);
  s.lineTo(hw, base);
  s.lineTo(hw, roof - r);
  s.quadraticCurveTo(hw, roof, hw - r, roof);
  s.lineTo(-hw + r, roof);
  s.quadraticCurveTo(-hw, roof, -hw, roof - r);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false, curveSegments: 8 });
  return g.translate(0, 0, -L / 2);
}

/**
 * One car. kind: 'train' (EMU), 'express' (car 0 = WAP-7, the rest LHB coaches) or
 * 'tram'. Returns { root, meshes: { head, tail } } like rail.js's cars.
 */
export function buildIndianCar(kind, K, cabF, cabB, index) {
  const look = kind === 'tram' ? 'tram' : kind === 'train' ? 'emu' : index === 0 ? 'loco' : 'coach';
  const { L, hw, base, roof } = K;
  const root = new THREE.Group();
  const add = (geo, m, shadow = true) => {
    if (!geo) return null;
    const me = new THREE.Mesh(geo, m);
    me.castShadow = shadow;
    root.add(me);
    return me;
  };
  const A = art(look, L);
  const sideTop = roof - (look === 'tram' ? 0.32 : 0.35);
  const sideBot = base + 0.05;
  // body shell (roof colour) + painted sides + painted ends
  const roofCol = look === 'tram' ? 0xb5302a : look === 'coach' ? 0x5e5f61 : look === 'loco' ? 0x8f9194 : 0x9a9ea3;
  add(shell(hw - 0.01, base, roof, L, look === 'tram' ? 0.75 : 0.55), mat('roof' + roofCol, { color: roofCol, roughness: 0.6, metalness: 0.2 }));
  const sides = [];
  for (const sx of [1, -1]) {
    const p = new THREE.PlaneGeometry(L, sideTop - sideBot);
    if (sx < 0) {
      p.rotateY(-Math.PI / 2);
      // flip u so the lettering reads correctly on both sides
      const uv = p.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    } else p.rotateY(Math.PI / 2);
    sides.push(p.translate(sx * (hw + 0.012), (sideTop + sideBot) / 2, 0));
  }
  add(merge(sides), A.side);
  const ends = [];
  for (const sz of [1, -1]) {
    const cab = sz > 0 ? cabF : cabB;
    const p = new THREE.PlaneGeometry(hw * 2 - 0.04, roof - base - 0.1);
    if (sz < 0) p.rotateY(Math.PI);
    p.translate(0, (roof + base) / 2 - 0.05, sz * (L / 2 + 0.012));
    if (cab || look === 'tram') ends.push(p);
    else if (look === 'coach' || look === 'emu') ends.push(p);
  }
  add(merge(ends), cabF || cabB || look === 'tram' || look === 'loco' ? A.end : art(look === 'emu' ? 'emu' : 'coach', L).end);
  // underframe, skirts, buffers, couplers
  const dark = [];
  dark.push(box(hw * 2 - 0.3, 0.45, L - 1.2, 0, base - 0.12, 0));
  if (look !== 'tram') {
    dark.push(box(hw * 2 - 0.9, 0.55, L * 0.32, 0, base - 0.45, 0)); // equipment boxes
    for (const sz of [1, -1]) {
      if (!(sz > 0 ? cabF : cabB) && look !== 'loco') {
        // gangway bellows to the next car
        dark.push(box(1.2, roof - base - 0.6, K.gap + 0.1, 0, (roof + base) / 2 - 0.1, sz * (L / 2 + K.gap / 2)));
      } else {
        for (const sx of [1, -1]) dark.push(new THREE.CylinderGeometry(0.16, 0.16, 0.35, 10).rotateX(Math.PI / 2).translate(sx * 0.85, base + 0.15, sz * (L / 2 + 0.15)));
        dark.push(box(hw * 2, 0.35, 0.25, 0, base + 0.05, sz * (L / 2 + 0.05)));
      }
    }
  } else {
    // tram: a fender at each end
    for (const sz of [1, -1]) dark.push(box(hw * 2 - 0.2, 0.3, 0.2, 0, base + 0.05, sz * (L / 2 + 0.08)));
  }
  // bogies and wheels
  const steel = [];
  const bz = L / 2 - (look === 'tram' ? 1.6 : look === 'loco' ? 3.2 : 2.6);
  const wr = look === 'tram' ? 0.34 : 0.46;
  const axles = look === 'loco' ? [-1.0, 0, 1.0] : [-0.85, 0.85];
  for (const z of [bz, -bz]) {
    dark.push(box(hw * 2 - 0.5, 0.35, look === 'loco' ? 3.6 : 2.6, 0, wr + 0.1, z));
    for (const dz of axles) for (const sx of [1, -1]) steel.push(new THREE.CylinderGeometry(wr, wr, 0.12, 16).rotateZ(Math.PI / 2).translate(sx * 0.72, wr, z + dz));
  }
  add(merge(dark), mat('rdark', { color: 0x1d1e20, roughness: 0.7, metalness: 0.3 }));
  add(merge(steel), mat('rsteel', { color: 0x8b8e93, roughness: 0.35, metalness: 0.9 }), false);
  // roof gear: pantograph on the EMU motor cars and the loco; the tram's trolley pole
  const gear = [];
  const ry = roof;
  if ((look === 'emu' && (index % 3 === 1 || index === 0)) || look === 'loco') {
    for (const z of look === 'loco' ? [L * 0.3, -L * 0.3] : [L * 0.15]) {
      gear.push(box(1.6, 0.12, 1.2, 0, ry + 0.06, z));
      gear.push(rod([0.5, ry + 0.15, z - 0.5], [0, ry + 1.2, z + 0.3], 0.035), rod([-0.5, ry + 0.15, z - 0.5], [0, ry + 1.2, z + 0.3], 0.035));
      gear.push(rod([0, ry + 1.2, z + 0.3], [0, 5.55 - K.y, z - 0.4], 0.035), box(1.6, 0.05, 0.12, 0, 5.58 - K.y, z - 0.4));
      for (const sx of [0.4, -0.4]) gear.push(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 8).translate(sx, ry + 0.25, z + 0.8));
    }
  }
  if (look === 'emu' || look === 'coach') for (let z = -L / 2 + 2; z < L / 2 - 1; z += 3) gear.push(box(0.8, 0.12, 0.6, 0, ry + 0.02, z)); // roof vents
  if (look === 'tram' && index === 0) {
    // trolley pole raked back to the overhead wire at 6 m
    gear.push(box(0.6, 0.25, 0.8, 0, ry + 0.12, -0.5), rod([0, ry + 0.25, -0.5], [0, 5.98, -4.8], 0.04), box(0.25, 0.08, 0.3, 0, 5.98, -4.8));
  }
  if (gear.length) add(merge(gear), mat('rgear', { color: 0x3c3f42, roughness: 0.5, metalness: 0.6 }));
  // lights: two headlamps and two marker/tail lamps at each cab end
  const head = [];
  const tail = [];
  for (const sz of [1, -1]) {
    if (!(sz > 0 ? cabF : cabB) && look !== 'tram') continue;
    const z = sz * (L / 2 + 0.03);
    const hy = look === 'tram' ? base + 0.75 : base + 0.95;
    for (const sx of [1, -1]) {
      head.push(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14).rotateX(Math.PI / 2).translate(sx * 0.55, hy, z));
      tail.push(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10).rotateX(Math.PI / 2).translate(sx * (hw - 0.25), hy - 0.25, z));
    }
    if (look === 'emu' || look === 'loco') head.push(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 14).rotateX(Math.PI / 2).translate(0, roof - 0.35, z));
  }
  const meshes = {};
  if (head.length) {
    meshes.head = add(merge(head), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 1 }), false);
    meshes.tail = add(merge(tail), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a2a, emissiveIntensity: 0.6 }), false);
  }
  return { root, meshes };
}

/* ---------- Overhead catenary along the electrified main lines ---------- */
export function buildCatenary(scene, lines, clear = () => true) {
  // lines: arrays of flat [x, z, ...] track centre lines
  const masts = [];
  const wires = [];
  const tmp = {};
  for (const pts of lines) {
    let L = 0;
    const seg = [];
    for (let i = 2; i < pts.length; i += 2) {
      const l = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      seg.push(l);
      L += l;
    }
    const at = (s) => {
      let i = 0;
      while (i < seg.length - 1 && s > seg[i]) s -= seg[i++];
      const k = Math.min(1, s / (seg[i] || 1));
      const ax = pts[i * 2];
      const az = pts[i * 2 + 1];
      const bx = pts[i * 2 + 2];
      const bz = pts[i * 2 + 3];
      const l = seg[i] || 1;
      tmp.x = ax + (bx - ax) * k;
      tmp.z = az + (bz - az) * k;
      tmp.tx = (bx - ax) / l;
      tmp.tz = (bz - az) / l;
      return tmp;
    };
    let prev = null;
    for (let s = 5; s < L; s += 55) {
      const q = at(s);
      const yaw = Math.atan2(q.tx, q.tz);
      // on whichever side has room
      for (const side of [1, -1]) {
        const mx = q.x + q.tz * 3.2 * side;
        const mz = q.z - q.tx * 3.2 * side;
        if (clear(mx, mz)) {
          masts.push([mx, mz, yaw + (side > 0 ? 0 : Math.PI)]);
          break;
        }
      }
      const cur = [q.x, q.z];
      if (prev) wires.push([prev, cur]);
      prev = cur;
    }
  }
  if (!masts.length) return;
  // mast: an H-section pole with a cantilever arm out over the track
  const mastGeo = merge([box(0.25, 7.2, 0.25, 0, 3.6, 0), box(0.08, 0.08, 3.6, 0, 6.6, 0).rotateY(Math.PI / 2).translate(-1.6, 0, 0), new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6).rotateZ(-0.6).translate(-1.4, 6.2, 0)]);
  const im = new THREE.InstancedMesh(mastGeo, mat('mast', { color: 0x6e7175, roughness: 0.6, metalness: 0.5 }), masts.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  masts.forEach(([x, z, yaw], i) => {
    q.setFromAxisAngle(UP, yaw);
    m4.compose(new THREE.Vector3(x, 0, z), q, one);
    im.setMatrixAt(i, m4);
  });
  im.castShadow = true;
  im.computeBoundingSphere();
  // contact wire and messenger, as thin boxes between masts
  const wg = [];
  for (const [[ax, az], [bx, bz]] of wires) {
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    wg.push(new THREE.BoxGeometry(0.03, 0.03, len).rotateY(yaw).translate((ax + bx) / 2, 5.6, (az + bz) / 2));
    wg.push(new THREE.BoxGeometry(0.025, 0.025, len).rotateY(yaw).translate((ax + bx) / 2, 6.6, (az + bz) / 2));
  }
  const wm = new THREE.Mesh(merge(wg), mat('wire', { color: 0x2a2b2e, roughness: 0.5, metalness: 0.6 }));
  return [im, wm];
}
