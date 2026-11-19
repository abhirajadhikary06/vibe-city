import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import * as TX from './textures.js';
import { lerp, smoothstep } from './utils.js';

const C = (h) => new THREE.Color(h);
const FOG_DAY = C('#9db8d6');
const FOG_SUNSET = C('#e7a179');
const FOG_NIGHT = C('#0b1224');
const HEMI_DAY = C('#cfe0ff');
const HEMI_SUNSET = C('#ffb489');
const HEMI_NIGHT = C('#2a3560');
const SUN_LOW = C('#ff8a4a');
const SUN_HIGH = C('#fff4e4');
const MOON = C('#8fa8ff');
const LIT_DAY = new THREE.Color(1.05, 1.04, 1.0);
const LIT_DUSK = new THREE.Color(1.6, 0.62, 0.55);
const LIT_NIGHT = new THREE.Color(0.06, 0.065, 0.1);
const SHADE_DAY = new THREE.Color(0.48, 0.55, 0.68);
const SHADE_DUSK = new THREE.Color(0.42, 0.24, 0.48);
const SHADE_NIGHT = new THREE.Color(0.025, 0.025, 0.05);
const GROUND_NIGHT = new THREE.Color(0.05, 0.05, 0.08);

const CLOUD_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = wp.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * wp;
    gl_Position.z = gl_Position.w * 0.99999;
  }`;
const CLOUD_FRAG = /* glsl */ `
  uniform float uTime, uCover, uOpacity;
  uniform vec3 uSunDir, uLit, uShade, uGlow;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
  }
  void main() {
    vec3 d = normalize(vDir);
    if (d.y < 0.0) discard;
    vec2 uv = d.xz / (d.y + 0.12) * 1.4 + vec2(uTime * 0.012, uTime * 0.005);
    float n = fbm(uv) * 0.75 + fbm(uv * 2.3 + 4.0) * 0.35;
    float c = smoothstep(uCover, uCover + 0.28, n);
    vec2 sd = normalize(uSunDir.xz + 1e-4);
    float ns = fbm(uv + sd * 0.18) * 0.75 + fbm((uv + sd * 0.18) * 2.3 + 4.0) * 0.35;
    float lit = clamp((n - ns) * 3.5 + 0.55, 0.0, 1.0);
    float sunAmt = pow(max(dot(d, uSunDir), 0.0), 5.0);
    vec3 col = mix(uShade, uLit, lit) + uGlow * sunAmt * (1.2 - c * 0.6);
    float horizon = smoothstep(0.0, 0.2, d.y);
    gl_FragColor = vec4(col, c * horizon * uOpacity);
  }`;

function hexTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 60);
  gr.addColorStop(0, 'rgba(255,255,255,0.25)');
  gr.addColorStop(0.8, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58);
  }
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _f = new THREE.Vector3();

export class DayCycle {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 17.4;
    this.speed = 1 / 40; // game hours per real second
    this.warp = 1;
    this.sunDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.night = 0;
    this.envTimer = 0;
    this.lastEnvY = 99;

    const sky = new Sky();
    sky.scale.setScalar(10000);
    scene.add(sky);
    this.sky = sky;
    const u = sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 2.2;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.86;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x3b3229, 0.8);
    scene.add(this.hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -110;
    sc.right = 110;
    sc.top = 110;
    sc.bottom = -110;
    sc.near = 10;
    sc.far = 900;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);
    this.sun = sun;

    // Stars
    const n = 2600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.95);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 5000;
      pos[i * 3 + 1] = Math.cos(ph) * 5000;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 5000;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // Separate scene used to bake the environment map (sky + city glow + dark ground)
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.glowRing = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 12, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }));
    this.envScene.add(this.glowRing);
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(60, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
    this.envGround.position.y = -4;
    this.envScene.add(this.envGround);
    this.envRT = null;

    // Procedural cloud dome, lit by the sun
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uCover: { value: 0.5 },
          uOpacity: { value: 0.9 },
          uSunDir: { value: this.sunDir },
          uLit: { value: new THREE.Color() },
          uShade: { value: new THREE.Color() },
          uGlow: { value: new THREE.Color() },
        },
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.clouds.renderOrder = -1;
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);
    this.stars.renderOrder = -2;

    // Sun lens flare
    this.flareAnchor = new THREE.Object3D();
    const flare = new Lensflare();
    const glowTex = TX.glow();
    const hex = hexTexture();
    flare.addElement(new LensflareElement(glowTex, 520, 0, new THREE.Color(1, 0.75, 0.55)));
    flare.addElement(new LensflareElement(hex, 50, 0.45, new THREE.Color(0.6, 0.8, 1)));
    flare.addElement(new LensflareElement(hex, 80, 0.6, new THREE.Color(1, 0.5, 0.8)));
    flare.addElement(new LensflareElement(hex, 120, 0.8, new THREE.Color(0.5, 1, 0.8)));
    flare.addElement(new LensflareElement(hex, 60, 1.0, new THREE.Color(1, 0.8, 0.5)));
    this.flareAnchor.add(flare);
    this.flare = flare;
    scene.add(this.flareAnchor);

    this.fog = new THREE.FogExp2(FOG_SUNSET.clone(), 0.0011);
    scene.fog = this.fog;
  }

  get hours() {
    return this.time;
  }

  update(dt, focus, camPos) {
    this.time = (this.time + dt * this.speed * this.warp) % 24;
    const phi = ((this.time - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(phi), Math.sin(phi) * 0.92, Math.sin(phi) * 0.39).normalize();
    const sE = this.sunDir.y;
    const day = smoothstep(-0.04, 0.12, sE);
    const high = smoothstep(0.0, 0.5, sE);
    const night = 1 - smoothstep(-0.14, 0.06, sE);
    const dusk = 1 - smoothstep(0.02, 0.35, Math.abs(sE));
    this.night = night;
    this.day = day;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.rayleigh.value = lerp(3.2, 2.6, high);
    u.mieCoefficient.value = lerp(0.004, 0.0018, high);
    u.turbidity.value = lerp(8, 1.6, high);
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);
    this.stars.material.opacity = night * 0.9;
    this.clouds.position.copy(camPos);
    const cu = this.clouds.material.uniforms;
    cu.uTime.value += dt * (this.warp > 1 ? 12 : 1);
    cu.uCover.value = lerp(lerp(0.66, 0.5, dusk), 0.55, night);
    cu.uLit.value.copy(LIT_DAY).lerp(LIT_DUSK, dusk).lerp(LIT_NIGHT, night);
    cu.uShade.value.copy(SHADE_DAY).lerp(SHADE_DUSK, dusk).lerp(SHADE_NIGHT, night);
    cu.uGlow.value.copy(this.sun.color).multiplyScalar(lerp(0.4, 2.2, dusk) * day);
    this.flareAnchor.position.copy(camPos).addScaledVector(this.sunDir, 2000);
    this.flare.visible = sE > -0.01 && this.flareEnabled !== false;
    this.stars.rotation.y = this.time * 0.02;

    // Sun / moon light
    const sun = this.sun;
    if (sE > -0.02) {
      this.lightDir.copy(this.sunDir);
      sun.color.copy(SUN_LOW).lerp(SUN_HIGH, high);
      sun.intensity = day * lerp(1.8, 3.4, high);
    } else {
      this.lightDir.copy(this.sunDir).negate();
      sun.color.copy(MOON);
      sun.intensity = smoothstep(0.02, 0.2, -sE) * 0.35;
    }
    // Keep the shadow lightmap near the player, snapped to whole shadow texels in light
    // space so shadow edges don't shimmer as the player moves
    const L = this.lightDir;
    const sc = sun.shadow.camera;
    const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
    const rx = -L.z;
    const rz = L.x;
    const rl = Math.hypot(rx, rz) || 1;
    const R = _r.set(rx / rl, 0, rz / rl);
    const U = _u.crossVectors(L, R).normalize();
    const pr = focus.x * R.x + focus.y * R.y + focus.z * R.z;
    const pu = focus.x * U.x + focus.y * U.y + focus.z * U.z;
    const snapped = _f.set(focus.x, focus.y, focus.z)
      .addScaledVector(R, Math.round(pr / texel) * texel - pr)
      .addScaledVector(U, Math.round(pu / texel) * texel - pu);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(L, 400);
    sun.target.updateMatrixWorld();

    // Ambient
    const hc = this.hemi.color.copy(HEMI_DAY).lerp(HEMI_SUNSET, dusk).lerp(HEMI_NIGHT, night);
    this.hemi.groundColor.setRGB(0.23, 0.2, 0.17).lerp(GROUND_NIGHT, night);
    this.hemi.intensity = lerp(lerp(1.0, 0.75, dusk), 0.5, night);
    void hc;

    // Fog
    this.fog.color.copy(FOG_DAY).lerp(FOG_SUNSET, dusk).lerp(FOG_NIGHT, night);
    this.fog.density = lerp(lerp(0.00055, 0.0012, dusk), 0.0011, night);

    this.renderer.toneMappingExposure = lerp(lerp(0.4, 0.55, dusk), 0.75, night);

    // Environment map refresh
    this.envTimer -= dt;
    if (Math.abs(sE - this.lastEnvY) > 0.03 && this.envTimer <= 0) this.bakeEnv(sE);
    this.scene.environmentIntensity = lerp(1, 0.55, night);
  }

  bakeEnv(sE) {
    this.lastEnvY = sE;
    this.envTimer = 4;
    const su = this.sky.material.uniforms;
    const eu = this.envSky.material.uniforms;
    for (const k of ['sunPosition', 'rayleigh', 'turbidity', 'mieCoefficient', 'mieDirectionalG', 'up']) {
      if (eu[k].value.copy) eu[k].value.copy(su[k].value);
      else eu[k].value = su[k].value;
    }
    const n = this.night;
    this.glowRing.material.color.setRGB(0.9 * n, 0.45 * n, 0.25 * n);
    this.envGround.material.color.setRGB(lerp(0.12, 0.01, n), lerp(0.11, 0.01, n), lerp(0.1, 0.015, n));
    const rt = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 2000);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }
}
