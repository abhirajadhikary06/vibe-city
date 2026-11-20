import * as THREE from 'three';
import { clamp } from './utils.js';

/*
 * Kolkata's real weather, near enough live. The current conditions come from
 * Open-Meteo (free, no API key, CORS-enabled), refreshed every 10 minutes while
 * the tab is visible and cached in localStorage so a reload doesn't fetch again.
 * The sky, light, haze and rain then ease towards them over half a minute.
 *
 * Rain is one draw call: a fixed buffer of streaks animated entirely in the vertex
 * shader (no per-frame uploads), wrapped round the camera, with only as many drawn
 * as the rain is heavy. Nothing is drawn when it's dry or you're underground.
 */

const URL = 'https://api.open-meteo.com/v1/forecast?latitude=22.5726&longitude=88.3639&current=temperature_2m,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&timezone=Asia%2FKolkata';
const CACHE = 'kol_weather';
const REFRESH = 10 * 60 * 1000;

/** WMO weather code -> how cloudy, rainy, foggy and stormy, and what to call it. */
function fromCode(c) {
  if (c === 0) return { cloud: 0.05, rain: 0, fog: 0, storm: 0, label: 'Clear', icon: '☀️' };
  if (c === 1) return { cloud: 0.25, rain: 0, fog: 0, storm: 0, label: 'Mostly clear', icon: '🌤️' };
  if (c === 2) return { cloud: 0.55, rain: 0, fog: 0, storm: 0, label: 'Partly cloudy', icon: '⛅' };
  if (c === 3) return { cloud: 0.9, rain: 0, fog: 0, storm: 0, label: 'Overcast', icon: '☁️' };
  if (c === 45 || c === 48) return { cloud: 0.7, rain: 0, fog: 0.85, storm: 0, label: 'Fog', icon: '🌫️' };
  if (c >= 51 && c <= 57) return { cloud: 0.9, rain: 0.2 + (c - 51) * 0.05, fog: 0.2, storm: 0, label: 'Drizzle', icon: '🌦️' };
  if (c >= 61 && c <= 67) return { cloud: 1, rain: c >= 65 ? 1 : c >= 63 ? 0.7 : 0.45, fog: 0.25, storm: 0, label: c >= 65 ? 'Heavy rain' : 'Rain', icon: '🌧️' };
  if (c >= 71 && c <= 77) return { cloud: 1, rain: 0.5, fog: 0.3, storm: 0, label: 'Rain', icon: '🌧️' };
  if (c >= 80 && c <= 82) return { cloud: 0.95, rain: c === 82 ? 1 : c === 81 ? 0.75 : 0.5, fog: 0.2, storm: 0, label: 'Showers', icon: '🌦️' };
  if (c >= 95) return { cloud: 1, rain: c === 95 ? 0.8 : 1, fog: 0.3, storm: c === 95 ? 0.7 : 1, label: 'Thunderstorm', icon: '⛈️' };
  return { cloud: 0.3, rain: 0, fog: 0, storm: 0, label: 'Fair', icon: '🌤️' };
}
const MANUAL = {
  clear: { cloud: 0.05, rain: 0, fog: 0, storm: 0, label: 'Clear', icon: '☀️' },
  rain: { cloud: 1, rain: 0.75, fog: 0.25, storm: 0, label: 'Rain', icon: '🌧️' },
  storm: { cloud: 1, rain: 1, fog: 0.3, storm: 1, label: 'Thunderstorm', icon: '⛈️' },
};

const RAIN_VERT = /* glsl */ `
  attribute vec4 drop; // x, z offset in the box, phase, end (0 top, 1 bottom of the streak)
  uniform float uTime, uBox, uHeight, uSpeed, uLen;
  uniform vec3 uCam;
  uniform vec2 uWind;
  varying float vEnd;
  varying float vFade;
  void main() {
    // stationary in the world, wrapped into a box that follows the camera
    vec2 xz = uCam.xz + mod(drop.xy - uCam.xz, uBox) - uBox * 0.5;
    float y = uCam.y - uHeight * 0.35 + mod(drop.z * uHeight - uTime * uSpeed, uHeight);
    vec3 p = vec3(xz.x, y, xz.y);
    // the streak trails up-wind of the drop
    p += drop.w * vec3(-uWind.x, uSpeed, -uWind.y) * uLen;
    vEnd = drop.w;
    vFade = 1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(xz - uCam.xz));
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const RAIN_FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying float vEnd;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity * vFade * mix(1.0, 0.15, vEnd));
  }`;

export class Weather {
  constructor(scene, maxDrops = 6000, mode = 'live') {
    this.scene = scene;
    this.mode = mode;
    // what the weather is (target), and what's shown (eases towards it)
    this.target = { ...MANUAL.clear, label: '', icon: '' };
    this.now = { cloud: 0, rain: 0, fog: 0, storm: 0 };
    this.live = null; // { temp, wind, windDir, ... } from the last fetch
    this.wind = new THREE.Vector2(0.6, 0.3);
    this.flash = 0;
    this.boltT = 8;
    this.thunder = [];
    this.lastFetch = 0;

    // rain: streaks of two vertices each
    const n = maxDrops;
    const pos = new Float32Array(n * 2 * 3);
    const drop = new Float32Array(n * 2 * 4);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 1000;
      const z = Math.random() * 1000;
      const ph = Math.random();
      for (let k = 0; k < 2; k++) drop.set([x, z, ph, k], (i * 2 + k) * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('drop', new THREE.BufferAttribute(drop, 4));
    g.setDrawRange(0, 0);
    this.maxDrops = n;
    this.rain = new THREE.LineSegments(
      g,
      new THREE.ShaderMaterial({
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uBox: { value: 46 },
          uHeight: { value: 22 },
          uSpeed: { value: 15 },
          uLen: { value: 0.045 },
          uCam: { value: new THREE.Vector3() },
          uWind: { value: new THREE.Vector2() },
          uOpacity: { value: 0.35 },
          uColor: { value: new THREE.Color(0.75, 0.8, 0.88) },
        },
        transparent: true,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    this.applyMode(this.mode);
    // pick the fetching back up when the tab comes back
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.mode === 'live') this.refresh();
    });
  }

  /** 'live' (Kolkata now), or a fixed 'clear' / 'rain' / 'storm'. */
  applyMode(mode) {
    this.mode = MANUAL[mode] ? mode : 'live';
    if (this.mode === 'live') this.refresh();
    else this.target = { ...MANUAL[this.mode] };
  }

  /** Fetch the current conditions (or reuse a fetch under 10 minutes old). */
  async refresh(force = false) {
    if (this.busy) return;
    const now = Date.now();
    if (!force && now - this.lastFetch < REFRESH) return;
    let data = null;
    try {
      const c = JSON.parse(localStorage.getItem(CACHE));
      if (c && now - c.at < REFRESH) data = c.data;
    } catch {
      /* no cache */
    }
    if (!data) {
      this.busy = true;
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(URL, { signal: ctl.signal });
        clearTimeout(to);
        if (r.ok) {
          data = (await r.json()).current;
          try {
            localStorage.setItem(CACHE, JSON.stringify({ at: now, data }));
          } catch {
            /* storage unavailable */
          }
        }
      } catch {
        /* offline or blocked: keep whatever we had */
      }
      this.busy = false;
    }
    this.lastFetch = now;
    if (data) this.setLive(data);
  }

  setLive(d) {
    const w = fromCode(d.weather_code);
    // measured rain and cloud refine the code's picture
    const mm = (d.rain || 0) + (d.showers || 0) || d.precipitation || 0;
    if (mm > 0 && w.rain < 0.2) Object.assign(w, { rain: clamp(0.2 + mm / 4, 0.2, 1), label: 'Light rain', icon: '🌦️' });
    w.cloud = Math.max(w.cloud, (d.cloud_cover || 0) / 100);
    const dir = ((d.wind_direction_10m || 0) * Math.PI) / 180;
    const sp = clamp((d.wind_speed_10m || 0) / 25, 0, 1.5); // km/h -> a lean on the rain
    this.wind.set(-Math.sin(dir) * sp, Math.cos(dir) * sp); // blowing *from* that direction
    this.live = { temp: d.temperature_2m, wind: d.wind_speed_10m, time: d.time };
    if (this.mode === 'live') this.target = w;
  }

  /** For the HUD: icon, temperature and what it's doing. */
  get summary() {
    const t = this.target;
    const temp = this.live && this.mode === 'live' && Number.isFinite(this.live.temp) ? `${Math.round(this.live.temp)}°` : '';
    return { icon: t.icon || '', text: [temp, t.label].filter(Boolean).join(' · '), live: this.mode === 'live' && !!this.live };
  }

  /**
   * Ease towards the target and draw the rain. quality: 0..1 share of the rain buffer to
   * use at full downpour (the Low preset uses a quarter). Returns the lightning flash 0..1.
   */
  update(dt, t, camera, { underground = false, quality = 1, audio = null } = {}) {
    if (this.mode === 'live' && Date.now() - this.lastFetch > REFRESH && document.visibilityState === 'visible') this.refresh();
    const k = 1 - Math.exp(-dt / 12);
    for (const key of ['cloud', 'rain', 'fog', 'storm']) this.now[key] += (this.target[key] - this.now[key]) * k;
    const R = this.now.rain;
    const r = this.rain;
    const drops = Math.floor(this.maxDrops * quality * clamp(R * 1.15, 0, 1));
    r.visible = drops > 30 && !underground;
    if (r.visible) {
      r.geometry.setDrawRange(0, drops * 2);
      const u = r.material.uniforms;
      u.uTime.value = t;
      u.uCam.value.copy(camera.position);
      u.uWind.value.copy(this.wind).multiplyScalar(4 + R * 4);
      u.uOpacity.value = 0.18 + R * 0.25;
    }
    // Lightning in a thunderstorm, the thunder a few seconds later
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.now.storm > 0.3) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 6 + Math.random() * 18 / this.now.storm;
        this.flash = 1;
        setTimeout(() => (this.flash = 0.8), 140);
        if (audio && !underground) audio.thunder(1 + Math.random() * 3.5, 0.5 + Math.random() * 0.5);
      }
    }
    if (audio) audio.rain(underground ? R * 0.15 : R);
    return this.flash;
  }
}
