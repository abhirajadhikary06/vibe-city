import * as THREE from 'three';
import * as T from './textures.js';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(uColor * t.rgb, t.a * vAlpha);
  }`;

class Particles {
  constructor(scene, { max, map, color, blending = THREE.NormalBlending, gravity = 0, drag = 1 }) {
    this.max = max;
    this.gravity = gravity;
    this.drag = drag;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.idx = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uColor: { value: new THREE.Color(color) }, uScale: { value: 500 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, a0) {
    const i = this.idx;
    this.idx = (this.idx + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.a0[i] = a0;
  }
  update(dt) {
    const dr = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const j = i * 3;
      this.vel[j] *= dr;
      this.vel[j + 1] = this.vel[j + 1] * dr - this.gravity * dt;
      this.vel[j + 2] *= dr;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.alpha[i] = this.a0[i] * (1 - k) * Math.min(1, k * 8);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
  }
}

class Skidmarks {
  constructor(scene, max = 1800) {
    this.max = max;
    this.idx = 0;
    const g = new THREE.PlaneGeometry(0.26, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), max);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, zero);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.last = [null, null, null, null];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }
  add(w, x, y, z) {
    const l = this.last[w];
    if (!l) {
      this.last[w] = [x, y, z];
      return;
    }
    const dx = x - l[0];
    const dz = z - l[2];
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return;
    if (d > 4) {
      this.last[w] = [x, y, z];
      return;
    }
    this.q.setFromAxisAngle(this.up, Math.atan2(dx, dz));
    this.v.set((x + l[0]) / 2, (y + l[1]) / 2 + 0.035, (z + l[2]) / 2);
    this.s.set(1, 1, d + 0.05);
    this.m.compose(this.v, this.q, this.s);
    this.mesh.setMatrixAt(this.idx, this.m);
    this.idx = (this.idx + 1) % this.max;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.last[w] = [x, y, z];
  }
  lift(w) {
    this.last[w] = null;
  }
}

export class Effects {
  constructor(scene) {
    const glow = T.glow();
    this.smokeP = new Particles(scene, { max: 420, map: T.smoke(), color: 0xd8d8d8, drag: 1.2 });
    this.sparkP = new Particles(scene, { max: 300, map: glow, color: new THREE.Color(6, 3, 0.8), blending: THREE.AdditiveBlending, gravity: 14, drag: 0.6 });
    this.flameP = new Particles(scene, { max: 200, map: glow, color: new THREE.Color(1.5, 2.5, 8), blending: THREE.AdditiveBlending, drag: 3 });
    this.fireP = new Particles(scene, { max: 500, map: T.smoke(), color: new THREE.Color(9, 3.4, 0.7), blending: THREE.AdditiveBlending, gravity: -4, drag: 1.6 });
    this.darkP = new Particles(scene, { max: 500, map: T.smoke(), color: 0x161412, gravity: -1.2, drag: 0.9 });
    this.dustP = new Particles(scene, { max: 200, map: T.smoke(), color: 0x9a8f80, gravity: 2, drag: 3 });
    this.bloodP = new Particles(scene, { max: 220, map: glow, color: 0x6e0505, gravity: 9, drag: 1.5 });
    this.skidmarks = new Skidmarks(scene);
    this.systems = [this.smokeP, this.sparkP, this.flameP, this.fireP, this.darkP, this.dustP, this.bloodP];
  }
  setScale(h) {
    for (const p of this.systems) p.mat.uniforms.uScale.value = h * 0.5;
  }
  /** Bullet hitting a hard surface: a puff of dust and a few sparks. */
  impact(x, y, z, nx, ny, nz, metal = false) {
    for (let i = 0; i < 3; i++) this.dustP.spawn(x, y, z, nx * 2 + (Math.random() - 0.5) * 1.5, ny * 2 + Math.random(), nz * 2 + (Math.random() - 0.5) * 1.5, 0.5 + Math.random() * 0.4, 0.15, 1.1, 0.55);
    const n = metal ? 10 : 3;
    for (let i = 0; i < n; i++) this.sparkP.spawn(x, y, z, nx * 4 + (Math.random() - 0.5) * 6, ny * 4 + Math.random() * 4, nz * 4 + (Math.random() - 0.5) * 6, 0.15 + Math.random() * 0.25, 0.12, 0.03, 1);
  }
  blood(x, y, z, dx, dz, amount = 1) {
    const n = Math.round(8 * amount);
    for (let i = 0; i < n; i++) this.bloodP.spawn(x, y, z, dx * 2.5 + (Math.random() - 0.5) * 2.4, Math.random() * 2.5, dz * 2.5 + (Math.random() - 0.5) * 2.4, 0.35 + Math.random() * 0.35, 0.16, 0.06, 0.9);
  }
  muzzle(x, y, z, dx, dy, dz, big = false) {
    const n = big ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const s = 4 + Math.random() * 6;
      this.fireP.spawn(x, y, z, dx * s, dy * s, dz * s, 0.05, big ? 0.55 : 0.32, 0.05, 1);
    }
    this.smokeP.spawn(x, y, z, dx * 1.5, 0.4, dz * 1.5, 0.8, 0.15, 1.4, 0.18);
  }
  /** Burning vehicle or debris: call every frame while it burns. */
  burn(x, y, z, k = 1) {
    if (Math.random() < 0.7 * k) this.fireP.spawn(x + (Math.random() - 0.5) * 1.2, y, z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.4, 0.9, 0.2, 0.9);
    if (Math.random() < 0.5 * k) this.darkP.spawn(x, y + 0.8, z, (Math.random() - 0.5) * 0.8, 1.5 + Math.random(), (Math.random() - 0.5) * 0.8, 3 + Math.random() * 2, 1.2, 7, 0.55);
  }
  /** Light grey engine smoke from a damaged vehicle. */
  engineSmoke(x, y, z, dark) {
    if (dark) this.darkP.spawn(x, y, z, (Math.random() - 0.5) * 0.5, 1.2 + Math.random(), (Math.random() - 0.5) * 0.5, 2 + Math.random(), 0.6, 4, 0.45);
    else this.smokeP.spawn(x, y, z, (Math.random() - 0.5) * 0.4, 1 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, 1.4 + Math.random(), 0.5, 3, 0.3);
  }
  explosion(x, y, z, size = 1) {
    for (let i = 0; i < 60 * size; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const s = (4 + Math.random() * 9) * size;
      this.fireP.spawn(x, y + 0.6, z, Math.cos(a) * r * s, Math.abs(u) * s * 0.9 + 2, Math.sin(a) * r * s, 0.5 + Math.random() * 0.6, 2.2 * size, 4.5 * size, 1);
    }
    for (let i = 0; i < 40 * size; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (2 + Math.random() * 5) * size;
      this.darkP.spawn(x + Math.cos(a), y + 1 + Math.random() * 2, z + Math.sin(a), Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s, 3 + Math.random() * 3, 2.5 * size, 11 * size, 0.7);
    }
    this.sparks(x, y + 0.8, z, 40);
    this.sparks(x, y + 0.8, z, 40);
  }
  smoke(x, y, z, vx, vz) {
    this.smokeP.spawn(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, vx + (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), vz + (Math.random() - 0.5) * 1.5, 1.6 + Math.random(), 1.2, 6.5, 0.4);
  }
  sparks(x, y, z, strength) {
    const n = Math.min(40, 6 + strength * 2);
    for (let i = 0; i < n; i++) {
      this.sparkP.spawn(x, y, z, (Math.random() - 0.5) * 12, Math.random() * 7, (Math.random() - 0.5) * 12, 0.35 + Math.random() * 0.5, 0.25, 0.05, 1);
    }
  }
  flame(x, y, z, vx, vz) {
    this.flameP.spawn(x, y, z, vx + (Math.random() - 0.5), (Math.random() - 0.5) * 0.5, vz + (Math.random() - 0.5), 0.14, 0.7, 0.15, 0.9);
  }
  update(dt) {
    for (const p of this.systems) p.update(dt);
  }
}
