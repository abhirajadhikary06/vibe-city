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
    this.skidmarks = new Skidmarks(scene);
  }
  setScale(h) {
    for (const p of [this.smokeP, this.sparkP, this.flameP]) p.mat.uniforms.uScale.value = h * 0.5;
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
    this.smokeP.update(dt);
    this.sparkP.update(dt);
    this.flameP.update(dt);
  }
}
