import * as THREE from 'three';
import { merge, paint } from './utils.js';

/*
 * Weapons: definitions, procedural gun models and the player's inventory.
 * Gun models are built with the grip at the origin, the barrel along +z and
 * the top along +y, so they can be placed in a hand and pointed with lookAt().
 */

export const WEAPONS = {
  fists: { name: 'Fists', kind: 'melee', hold: 'fists', dmg: 18 },
  bat: { name: 'Baseball Bat', kind: 'melee', hold: 'bat', dmg: 48 },
  pistol: { name: 'Pistol', kind: 'gun', hold: 'pistol', dmg: 34, head: 2.5, rate: 0.2, mag: 12, reserve: 96, spread: 0.02, aim: 0.005, range: 120, recoil: 0.03, reload: 1.3, sound: 'pistol' },
  smg: { name: 'SMG', kind: 'gun', hold: 'rifle', dmg: 21, head: 2, rate: 0.07, auto: true, mag: 30, reserve: 240, spread: 0.045, aim: 0.016, range: 90, recoil: 0.014, reload: 1.6, sound: 'smg' },
  shotgun: { name: 'Shotgun', kind: 'gun', hold: 'rifle', dmg: 15, head: 1.5, pellets: 9, rate: 0.85, mag: 6, reserve: 36, spread: 0.07, aim: 0.055, range: 45, recoil: 0.1, reload: 2.4, sound: 'shotgun' },
  rifle: { name: 'Assault Rifle', kind: 'gun', hold: 'rifle', dmg: 32, head: 2.5, rate: 0.11, auto: true, mag: 30, reserve: 180, spread: 0.03, aim: 0.006, range: 220, recoil: 0.022, reload: 2.0, sound: 'rifle' },
  sniper: { name: 'Sniper Rifle', kind: 'gun', hold: 'rifle', dmg: 150, head: 3, rate: 1.3, mag: 5, reserve: 30, spread: 0.04, aim: 0, range: 600, recoil: 0.11, reload: 2.8, scope: true, sound: 'sniper' },
};
export const SLOTS = ['fists', 'bat', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper'];

/* ---------- Models ---------- */
const B = (g, w, h, d, x, y, z, c) => g.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c));
const C = (g, rt, rb, len, x, y, z, c, seg = 12) => g.push(paint(new THREE.CylinderGeometry(rt, rb, len, seg).rotateX(Math.PI / 2).translate(x, y, z), c));

const STEEL = '#2a2c30';
const DARK = '#141518';
const POLY = '#1d1e20';
const WOOD = '#6b4026';

const MODELS = {
  pistol(g) {
    B(g, 0.032, 0.034, 0.19, 0, 0.058, 0.05, STEEL); // slide
    B(g, 0.028, 0.024, 0.15, 0, 0.032, 0.045, POLY); // frame
    g.push(paint(new THREE.BoxGeometry(0.03, 0.11, 0.045).rotateX(0.25).translate(0, -0.02, -0.01), POLY)); // grip
    B(g, 0.012, 0.012, 0.012, 0, 0.081, 0.13, DARK); // front sight
    B(g, 0.03, 0.01, 0.012, 0, 0.081, -0.035, DARK); // rear sight
    g.push(paint(new THREE.TorusGeometry(0.018, 0.004, 4, 10, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI).translate(0, 0.022, 0.035), DARK));
    C(g, 0.008, 0.008, 0.01, 0, 0.058, 0.147, '#050505');
    return 0.15;
  },
  smg(g) {
    B(g, 0.045, 0.07, 0.3, 0, 0.045, 0.08, POLY); // receiver
    C(g, 0.013, 0.013, 0.12, 0, 0.055, 0.28, STEEL); // barrel
    B(g, 0.03, 0.15, 0.05, 0, -0.06, 0.1, DARK); // mag
    g.push(paint(new THREE.BoxGeometry(0.035, 0.1, 0.045).rotateX(0.2).translate(0, -0.03, -0.02), POLY)); // grip
    B(g, 0.015, 0.02, 0.22, 0, 0.04, -0.17, STEEL); // folding stock
    B(g, 0.02, 0.06, 0.02, 0, 0.02, -0.28, STEEL);
    B(g, 0.02, 0.02, 0.18, 0, 0.09, 0.08, DARK); // rail
    return 0.34;
  },
  shotgun(g) {
    C(g, 0.016, 0.016, 0.62, 0, 0.07, 0.36, STEEL); // barrel
    C(g, 0.014, 0.014, 0.5, 0, 0.038, 0.31, STEEL); // tube mag
    C(g, 0.026, 0.026, 0.2, 0, 0.042, 0.33, WOOD); // pump
    B(g, 0.045, 0.07, 0.24, 0, 0.055, 0.02, STEEL); // receiver
    g.push(paint(new THREE.BoxGeometry(0.035, 0.09, 0.04).rotateX(0.35).translate(0, -0.015, -0.1), WOOD));
    g.push(paint(new THREE.BoxGeometry(0.04, 0.1, 0.3).rotateX(-0.12).translate(0, 0.01, -0.26), WOOD)); // stock
    B(g, 0.008, 0.01, 0.01, 0, 0.09, 0.66, '#d9d9d9');
    return 0.67;
  },
  rifle(g) {
    B(g, 0.045, 0.08, 0.32, 0, 0.05, 0.03, STEEL); // receiver
    B(g, 0.05, 0.06, 0.25, 0, 0.055, 0.31, POLY); // handguard
    C(g, 0.011, 0.011, 0.2, 0, 0.06, 0.52, STEEL); // barrel
    C(g, 0.016, 0.016, 0.05, 0, 0.06, 0.62, DARK); // flash hider
    g.push(paint(new THREE.BoxGeometry(0.03, 0.17, 0.05).rotateX(-0.3).translate(0, -0.05, 0.13), DARK)); // curved mag
    g.push(paint(new THREE.BoxGeometry(0.035, 0.1, 0.04).rotateX(0.3).translate(0, -0.03, -0.04), POLY)); // grip
    B(g, 0.04, 0.08, 0.26, 0, 0.035, -0.26, POLY); // stock
    B(g, 0.02, 0.02, 0.36, 0, 0.1, 0.12, DARK); // top rail
    B(g, 0.03, 0.045, 0.07, 0, 0.13, 0.06, DARK); // red dot sight
    B(g, 0.012, 0.03, 0.012, 0, 0.11, 0.42, DARK); // front sight post
    return 0.65;
  },
  sniper(g) {
    C(g, 0.012, 0.016, 0.62, 0, 0.065, 0.48, STEEL); // fluted barrel
    C(g, 0.02, 0.02, 0.06, 0, 0.065, 0.8, DARK); // muzzle brake
    B(g, 0.045, 0.07, 0.3, 0, 0.055, 0.03, STEEL); // action
    B(g, 0.05, 0.075, 0.34, 0, 0.03, 0.25, '#3a3d33'); // forend
    g.push(paint(new THREE.BoxGeometry(0.045, 0.12, 0.42).rotateX(-0.08).translate(0, 0.0, -0.26), '#3a3d33')); // stock
    g.push(paint(new THREE.BoxGeometry(0.035, 0.1, 0.04).rotateX(0.3).translate(0, -0.03, -0.04), DARK));
    B(g, 0.03, 0.06, 0.06, 0, 0.0, 0.08, DARK); // mag
    C(g, 0.024, 0.024, 0.34, 0, 0.14, 0.06, DARK); // scope tube
    C(g, 0.034, 0.024, 0.07, 0, 0.14, 0.25, DARK); // objective bell
    C(g, 0.03, 0.024, 0.05, 0, 0.14, -0.12, DARK); // eyepiece
    B(g, 0.02, 0.03, 0.02, 0, 0.105, 0.0, DARK);
    B(g, 0.02, 0.03, 0.02, 0, 0.105, 0.14, DARK);
    g.push(paint(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 6).rotateZ(Math.PI / 2).translate(0.035, 0.06, -0.06), STEEL)); // bolt handle
    return 0.83;
  },
  bat(g) {
    const pts = [[0.0, -0.02], [0.022, -0.02], [0.016, 0.0], [0.014, 0.25], [0.022, 0.45], [0.032, 0.62], [0.035, 0.78], [0.03, 0.82], [0.0, 0.83]];
    const lathe = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14).rotateX(Math.PI / 2).translate(0, 0, -0.12);
    g.push(paint(lathe, '#c99a62'));
    C(g, 0.019, 0.019, 0.18, 0, 0, -0.03, '#2a2a2a'); // grip tape
    return 0.7;
  },
};

let GUN_MAT = null;
/** A gun model; mesh.userData.muzzle is the barrel tip in local space. */
export function buildWeaponMesh(id) {
  const make = MODELS[id];
  if (!make) return null;
  const g = [];
  const muzzle = make(g);
  GUN_MAT ||= new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.42 });
  const mesh = new THREE.Mesh(merge(g), GUN_MAT);
  mesh.castShadow = true;
  mesh.userData.muzzle = new THREE.Vector3(0, id === 'bat' ? 0 : 0.06, muzzle);
  mesh.visible = false;
  return mesh;
}

/* ---------- Player inventory ---------- */
export class Arsenal {
  constructor(scene) {
    this.scene = scene;
    this.ammo = {};
    this.meshes = {};
    for (const id of SLOTS) {
      const w = WEAPONS[id];
      if (w.kind === 'gun') this.ammo[id] = { mag: w.mag, reserve: w.reserve };
      const m = buildWeaponMesh(id);
      if (m) {
        scene.add(m);
        this.meshes[id] = m;
      }
    }
    this.cur = 'fists';
    this.cool = 0;
    this.reloadT = 0;
    this.combo = 0;
    this.comboT = 0;
  }
  get id() {
    return this.cur;
  }
  get def() {
    return WEAPONS[this.cur];
  }
  get mesh() {
    return this.meshes[this.cur] || null;
  }
  get clip() {
    return this.ammo[this.cur] || null;
  }
  select(id) {
    if (id === this.cur || !WEAPONS[id]) return false;
    if (this.mesh) this.mesh.visible = false;
    this.cur = id;
    this.reloadT = 0;
    this.cool = Math.max(this.cool, 0.25);
    return true;
  }
  cycle(dir) {
    const i = SLOTS.indexOf(this.cur);
    return this.select(SLOTS[(i + dir + SLOTS.length) % SLOTS.length]);
  }
  canReload() {
    const a = this.clip;
    return a && this.reloadT <= 0 && a.mag < this.def.mag && a.reserve > 0;
  }
  startReload() {
    if (!this.canReload()) return false;
    this.reloadT = this.def.reload;
    return true;
  }
  update(dt) {
    this.cool -= dt;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const a = this.clip;
        const n = Math.min(this.def.mag - a.mag, a.reserve);
        a.mag += n;
        a.reserve -= n;
      }
    }
  }
  /** Ammo crate: top every gun up by a couple of magazines. */
  refill() {
    for (const id of SLOTS) {
      const w = WEAPONS[id];
      if (w.kind !== 'gun') continue;
      this.ammo[id].reserve = Math.min(w.reserve * 2, this.ammo[id].reserve + w.mag * 3);
    }
  }
  hideAll() {
    for (const m of Object.values(this.meshes)) m.visible = false;
  }
}

/* ---------- HUD icons: each model rendered once as a light silhouette ---------- */
function fistIcon(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e8ec';
  g.strokeStyle = '#2a2a30';
  g.lineWidth = 3;
  const x = w / 2 - 44;
  const y = h / 2 - 34;
  const rr = (a, b, cw, ch, r) => {
    g.beginPath();
    g.roundRect(a, b, cw, ch, r);
    g.fill();
    g.stroke();
  };
  rr(x + 6, y + 30, 70, 44, 14); // palm
  for (let i = 0; i < 4; i++) rr(x + 14 + i * 16, y + 8, 17, 30, 8); // knuckles
  rr(x - 4, y + 34, 30, 20, 9); // thumb
  rr(x + 22, y + 72, 44, 18, 4); // wrist
  return c.toDataURL();
}

export function weaponIcons() {
  const W = 256;
  const H = 128;
  const out = { fists: fistIcon(W, H) };
  let r;
  try {
    r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  r.setSize(W, H, false);
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6), new THREE.DirectionalLight(0xffffff, 2.2).translateY(3).translateX(-2));
  const mat = new THREE.MeshLambertMaterial({ color: 0xd8dade });
  for (const id of SLOTS) {
    const m = buildWeaponMesh(id);
    if (!m) continue;
    m.material = mat;
    m.visible = true;
    // Side view, barrel pointing right
    m.rotation.y = id === 'bat' ? Math.PI / 2 : Math.PI / 2;
    if (id === 'bat') m.rotation.z = 0.5;
    scene.add(m);
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x / (W / H), size.y) * 0.56;
    const cam = new THREE.OrthographicCamera(-span * (W / H), span * (W / H), span, -span, 0.01, 10);
    cam.position.set(ctr.x, ctr.y, ctr.z + 3);
    cam.lookAt(ctr);
    r.render(scene, cam);
    out[id] = r.domElement.toDataURL();
    scene.remove(m);
    m.geometry.dispose();
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
