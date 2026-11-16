import * as THREE from 'three';
import { setAniso } from './textures.js';
import { World, lineAt, LANE, PIER, N, HALF, SHORE_X, lightConeMaterial } from './world.js';
import { DayCycle } from './sky.js';
import { Vehicle, setTrafficLights, collideVehicles, setCarLOD, hooks } from './car.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Player } from './player.js';
import { Effects } from './effects.js';
import { createPost } from './post.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Gameplay } from './gameplay.js';
import { Input } from './input.js';
import { Rail } from './rail.js';
import { Metro } from './metro.js';
import { Combat } from './combat.js';
import { weaponIcons } from './weapons.js';
import { Boat, Freighter } from './boats.js';
import { MapView, findRoute, routeLength } from './mapview.js';
import * as T from './textures.js';
import { clamp, damp, dampAngle, lerp } from './utils.js';

/* ---------- Quality presets ---------- */
const PRESETS = {
  ultra: { pr: 2, minPr: 1, shadow: 4096, ao: true, peds: 44, traffic: 26 },
  high: { pr: 1.5, minPr: 0.75, shadow: 2048, ao: false, peds: 38, traffic: 24 },
  medium: { pr: 1, minPr: 0.6, shadow: 1024, ao: false, peds: 26, traffic: 18 },
};
let quality = 'high';
try {
  quality = localStorage.getItem('nt_quality') || 'high';
} catch {
  /* storage unavailable */
}
if (!PRESETS[quality]) quality = 'high';
let preset = PRESETS[quality];

/* ---------- Renderer ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
let pixelRatio = Math.min(window.devicePixelRatio, preset.pr);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
document.getElementById('app').appendChild(renderer.domElement);
setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.2, 7000);
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

let world, day, fx, post, hud, gameplay, traffic, peds, player, rail, combat, metro, freighter, mapView;
const vehicles = [];
const audio = new AudioEngine();
const input = new Input(renderer.domElement);
let state = 'loading';
let elapsed = 0;
let frameNo = 0;

/* ---------- Game context shared with the player controller ---------- */
const game = {
  vehicles,
  audio,
  camera,
  night: 0,
  partyOn: false,
  camYaw: 0,
  get player() {
    return player;
  },
  get rail() {
    return rail;
  },
  get combat() {
    return combat;
  },
  get fx() {
    return fx;
  },
  get peds() {
    return peds;
  },
  get traffic() {
    return traffic;
  },
  get hud() {
    return hud;
  },
  get gameplay() {
    return gameplay;
  },
  adoptTrafficCar(car, vel, angVel, released = false) {
    if (!released) traffic.release(car, player.focus);
    const v = new Vehicle(scene, world, fx, car.type, car.color, car.mesh);
    v.place(car.x, car.z, car.yaw, vel);
    v.angVel = angVel || 0;
    vehicles.push(v);
    pruneVehicles();
    return v;
  },
  onEnterVehicle(v) {
    attachHeadlights(v);
    if (v.rail) cam.mode = v.kind === 'metro' ? 2 : 0;
    hud.notify(v.label.toUpperCase(), v.rail ? 'W / S to drive along the line' : '', '#38f3ff');
  },
  onExitVehicle() {
    attachHeadlights(null);
  },
  shake(a) {
    cam.shake = Math.min(1, cam.shake + a);
  },
  recoil(a) {
    cam.pitch -= a;
    cam.recoil = Math.min(0.15, (cam.recoil || 0) + a * 0.6);
    cam.shake = Math.min(1, cam.shake + a * 0.6);
  },
  onPlayerDown() {
    cam.mode = 0;
  },
  respawnPlayer() {
    // Wake up on the sidewalk of the nearest block, a little poorer
    const p = player.pos;
    let best = world.blocks[0];
    for (const b of world.blocks) if (b.type !== 'beach' && Math.hypot(b.cx - p.x, b.cz - p.z) < Math.hypot(best.cx - p.x, best.cz - p.z)) best = b;
    player.revive(best.x0 + 2.4, best.z0 + 2.4, Math.PI / 4);
    const fee = Math.min(gameplay.money, 100 + Math.floor(gameplay.money * 0.05));
    if (fee > 0) gameplay.addMoney(-fee);
    hud.notify('BACK ON YOUR FEET', fee > 0 ? `Medical bill -$${fee}` : 'Take it easy', '#5dff9e');
  },
  endParty() {
    game.partyOn = false;
    peds.stopParty();
  },
};

function pruneVehicles() {
  while (vehicles.length > 16) {
    let far = null;
    let fd = 120;
    for (const v of vehicles) {
      if (v === player.vehicle || v.keep) continue;
      const d = Math.hypot(v.pos.x - player.focus.x, v.pos.z - player.focus.z);
      if (d > fd) {
        fd = d;
        far = v;
      }
    }
    if (!far) break;
    scene.remove(far.car.root);
    vehicles.splice(vehicles.indexOf(far), 1);
  }
}

/* ---------- Headlight rig (moves to whatever the player drives) ---------- */
const headlights = new THREE.Group();
const spots = [];
const beamMat = lightConeMaterial(new THREE.Color(1.0, 0.92, 0.78));
for (const x of [0.62, -0.62]) {
  const sp = new THREE.SpotLight(0xfff0d8, 0, 90, 0.48, 0.55, 1.4);
  sp.position.set(x, 0.75, 2.3);
  sp.target.position.set(x * 1.5, 0, 22);
  headlights.add(sp, sp.target);
  spots.push(sp);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 2.6, 15, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 7.5), beamMat);
  cone.position.set(x, 0.74, 2.42);
  cone.rotation.x = 0.06;
  cone.renderOrder = 4;
  headlights.add(cone);
}
function attachHeadlights(v) {
  headlights.removeFromParent();
  if (!v) return;
  // The rig is laid out for a car; shift it to this vehicle's lamps
  // A rail vehicle driven from its rear cab carries the lights on its back end
  const flip = v.rail && v.cab < 0;
  headlights.position.set(0, v.def.headY - 0.75, (flip ? -1 : 1) * (v.def.headZ - 2.36));
  headlights.rotation.y = flip ? Math.PI : 0;
  v.car.root.add(headlights);
}

/* ---------- Camera rig ---------- */
const cam = { mode: 0, yaw: Math.PI, pitch: 0.18, look: 0, lookPitch: 0, lookTimer: 0, shake: 0, fov: 62, pos: new THREE.Vector3(), init: false };
const CAR_CAMS = [
  { dist: 7.4, height: 2.5, look: 1.2 },
  { dist: 12, height: 4.2, look: 1.4 },
  { dist: 0, height: 1.22, look: 0 },
];

function updateCamera(dt) {
  if (state === 'title') {
    const a = elapsed * 0.04;
    camera.position.set(Math.cos(a) * HALF * 1.4 + 80, 120 + Math.sin(elapsed * 0.1) * 15, Math.sin(a) * HALF * 1.4);
    camera.lookAt(40, 25, 0);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    return;
  }
  // Zoomed views turn the mouse down so aiming stays precise
  const sens = camera.fov / 60;
  const mdx = input.mouse.dx * sens;
  const mdy = input.mouse.dy * sens;
  const p = player;
  let targetFov = 60;
  let fovK = 3;
  cam.recoil = Math.max(0, (cam.recoil || 0) - dt * 0.6);
  if (!p.driving && p.scoped) {
    // Sniper scope: look straight out of the player's eyes
    cam.yaw -= mdx * 0.0026;
    cam.pitch = clamp(cam.pitch + mdy * 0.0022, -0.9, 1.1);
    const head = p.ch.bones.head.getWorldPosition(cam.pos);
    const cp = Math.cos(cam.pitch);
    camera.position.set(head.x, head.y + 0.08, head.z);
    camera.lookAt(head.x + Math.sin(cam.yaw) * cp * 10, head.y + 0.08 - Math.sin(cam.pitch) * 10, head.z + Math.cos(cam.yaw) * cp * 10);
    targetFov = 11;
    fovK = 14;
  } else if (!p.driving) {
    // Third-person orbit around the character; tighter over the shoulder when aiming
    cam.yaw -= mdx * 0.0026;
    cam.pitch = clamp(cam.pitch + mdy * 0.0022, p.aiming ? -0.9 : -0.45, 1.1);
    const sprint = p.speed > 5;
    const combatView = p.aiming || p.combatT > 0;
    const dist = p.aiming ? 2.1 : combatView && p.arsenal.def.kind === 'gun' ? 3.3 : (sprint ? 4.9 : 4.3) * (cam.mode === 1 ? 1.5 : 1);
    const tx = p.pos.x;
    const ty = p.pos.y + (p.aiming ? 1.62 : 1.55);
    const tz = p.pos.z;
    const fx = Math.sin(cam.yaw);
    const fz = Math.cos(cam.yaw);
    const cp = Math.cos(cam.pitch);
    // over-the-shoulder offset to the right
    const sh = p.aiming ? 0.62 : 0.45;
    const sx = -fz * sh;
    const sz = fx * sh;
    let cx = tx - fx * cp * dist + sx;
    let cz = tz - fz * cp * dist + sz;
    const py = p.pos.y;
    const hit = world.raycastAt(tx, tz, cx, cz, py);
    if (hit < 1) {
      const f = Math.max(0.1, hit - 0.05);
      cx = tx + (cx - tx) * f;
      cz = tz + (cz - tz) * f;
    }
    // keep the lens out of poles, palms and walls
    for (let i = 0; i < 2; i++) {
      const push = world.collideAt(cx, cz, 0.45, py);
      if (!push) break;
      cx += push.px;
      cz += push.pz;
    }
    let cy = Math.max(ty + Math.sin(cam.pitch) * dist, world.groundAt(cx, cz, py) + 0.3);
    if (p.underground) cy = Math.min(cy, metro.ceilingAt(cx, cz) - 0.35);
    if (!cam.init) cam.pos.set(cx, cy, cz);
    const ck = p.aiming ? 30 : 20;
    cam.pos.set(damp(cam.pos.x, cx, ck, dt), damp(cam.pos.y, cy, ck, dt), damp(cam.pos.z, cz, ck, dt));
    camera.position.copy(cam.pos);
    camera.lookAt(tx + sx, ty, tz + sz);
    targetFov = p.aiming ? 44 : sprint ? 66 : 60;
    if (p.aiming) fovK = 12;
  } else {
    const v = p.vehicle;
    if (mdx || mdy) {
      cam.look -= mdx * 0.004;
      cam.lookPitch = clamp(cam.lookPitch + mdy * 0.003, -0.3, 0.6);
      cam.lookTimer = 1.6;
    }
    cam.lookTimer -= dt;
    if (cam.lookTimer <= 0) {
      cam.look = damp(cam.look, 0, 3, dt);
      cam.lookPitch = damp(cam.lookPitch, 0, 3, dt);
    }
    let heading = v.yaw;
    if (v.speed > 3 && v.vf > -1) heading = dampAngle(v.yaw, Math.atan2(v.vel.x, v.vel.y), 1, 0.35);
    cam.yaw = dampAngle(cam.yaw, heading, 5, dt);
    const m = CAR_CAMS[cam.mode];
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    if (cam.mode === 2) {
      // Rail: ride up front just past the windscreen; road vehicles: the driver's eyes
      const eye = v.rail ? v.local(0, v.def.hl + 0.4) : v.local(v.def.seatX, v.def.seatZ + 0.2);
      camera.position.set(eye.x, v.pos.y + m.height + (v.def.seatY + 0.42) + (v.rail ? 0.3 : 0), eye.z);
      const ly = cam.yaw + cam.look;
      camera.lookAt(camera.position.x + Math.sin(ly) * 20, camera.position.y - 0.4 - cam.lookPitch * 10, camera.position.z + Math.cos(ly) * 20);
    } else {
      const yaw = cam.yaw + cam.look;
      const dist = m.dist + clamp(v.speed / 60, 0, 1) * 1.6 + v.def.camDist;
      const height = m.height + cam.lookPitch * 6 + v.def.camH;
      let tx = v.pos.x - Math.sin(yaw) * dist;
      let tz = v.pos.z - Math.cos(yaw) * dist;
      const hit = world.raycastAt(v.pos.x, v.pos.z, tx, tz, v.pos.y);
      if (hit < 1) {
        const f = Math.max(0.2, hit - 0.08);
        tx = v.pos.x + (tx - v.pos.x) * f;
        tz = v.pos.z + (tz - v.pos.z) * f;
      }
      let ty = Math.max(v.pos.y + height, world.groundAt(tx, tz, v.pos.y) + 0.8);
      if (v.pos.y < -2.5) ty = Math.min(ty, metro.ceilingAt(tx, tz) - 0.4);
      cam.pos.set(damp(cam.pos.x, tx, 14, dt), damp(cam.pos.y, ty, 8, dt), damp(cam.pos.z, tz, 14, dt));
      camera.position.copy(cam.pos);
      camera.lookAt(v.pos.x + fx * 2, v.pos.y + m.look, v.pos.z + fz * 2);
    }
    targetFov = 60 + clamp(v.speed / 70, 0, 1) * 16 + (v.nitroOn ? 8 : 0);
  }
  cam.init = true;
  cam.shake = Math.max(cam.shake - dt * 2.5, 0);
  if (cam.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * cam.shake;
    camera.position.y += (Math.random() - 0.5) * cam.shake;
  }
  cam.fov = damp(cam.fov, targetFov, fovK, dt);
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
}

/* ---------- Resize & quality ---------- */
function resize() {
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (post) post.setSize(innerWidth, innerHeight, pixelRatio);
  if (fx) fx.setScale(innerHeight * pixelRatio);
}
addEventListener('resize', resize);

function applyQuality(q) {
  quality = q;
  preset = PRESETS[q];
  try {
    localStorage.setItem('nt_quality', q);
  } catch {
    /* storage unavailable */
  }
  document.querySelectorAll('#quality button').forEach((b) => b.classList.toggle('on', b.dataset.q === q));
  pixelRatio = Math.min(window.devicePixelRatio, preset.pr);
  if (day) {
    const sh = day.sun.shadow;
    sh.mapSize.set(preset.shadow, preset.shadow);
    if (sh.map) {
      sh.map.dispose();
      sh.map = null;
    }
  }
  if (post) post.gtao.enabled = preset.ao;
  resize();
}
document.querySelectorAll('#quality button').forEach((b) => b.addEventListener('click', () => applyQuality(b.dataset.q)));

let perfT = 0;
let perfFrames = 0;
function adaptQuality(dt) {
  perfT += dt;
  perfFrames++;
  if (perfT < 2) return;
  const fps = perfFrames / perfT;
  perfT = 0;
  perfFrames = 0;
  const cap = Math.min(window.devicePixelRatio, preset.pr);
  let next = pixelRatio;
  if (fps < 40) next = Math.max(preset.minPr, pixelRatio - 0.15);
  else if (fps > 57) next = Math.min(cap, pixelRatio + 0.1);
  if (Math.abs(next - pixelRatio) > 0.01) {
    pixelRatio = next;
    resize();
  }
}

/* ---------- Boot ---------- */
async function boot() {
  const setLoading = (p, t) => {
    document.querySelector('#loading .fill').style.width = `${p * 100}%`;
    document.querySelector('#loading .text').textContent = t;
  };
  setLoading(0.1, 'Paving the streets');
  await frame();
  world = new World(scene);
  rail = new Rail(scene, world, null);
  metro = new Metro(scene, world, null);
  rail.consists.push(metro.train);
  setLoading(0.45, 'Painting the sky');
  await frame();
  day = new DayCycle(scene, renderer);
  day.time = 17.7;
  const startHour = parseFloat(new URLSearchParams(location.search).get('t'));
  if (!Number.isNaN(startHour)) day.time = startHour % 24;
  fx = new Effects(scene);
  rail.fx = fx;
  metro.train.fx = fx;
  for (const c of rail.consists) c.fx = fx;
  hud = new HUD(world);
  setLoading(0.6, 'Fuelling the cars');
  await frame();
  traffic = new Traffic(scene, world, fx, preset.traffic);
  traffic.onRelease = (car, vel, ang) => game.adoptTrafficCar(car, vel, ang, true);
  traffic.honk = (car) => audio.honk(Math.hypot(car.x - player.focus.x, car.z - player.focus.z));
  // Parked rides around town
  const parked = [
    ['convertible', 0xff4f9a, lineAt(N) - 5.6, 98, Math.PI],
    ['coupe', 0x22d3e6, PIER.plat0 + 7.5, -7, Math.PI / 2],
    ['taxi', 0xffcf2e, lineAt(4) + 5.6, lineAt(4) + 30, 0],
    ['van', 0xf2f2f2, lineAt(2) - 5.6, lineAt(5) + 25, Math.PI],
    ['convertible', 0x7fffd4, lineAt(N) - 5.6, -150, Math.PI],
    ['coupe', 0x18181d, lineAt(6) + 5.6, lineAt(2) + 25, 0],
    ['sedan', 0x8b5cf6, lineAt(5) - 5.6, lineAt(6) + 30, Math.PI],
    ['bike', 0xff3fa4, lineAt(N) - 5.4, 114, Math.PI],
    ['bike', 0x18181d, lineAt(N) - 5.4, 117, Math.PI],
    ['schoolbus', 0xf2b705, lineAt(N) - 5.6, 140, Math.PI],
    ['pickup', 0x9c2b23, lineAt(7) + 5.6, lineAt(5) + 20, 0],
    ['truck', 0x1b2440, lineAt(6) - 5.6, lineAt(4) + 30, Math.PI],
    ['bus', 0x1f8a8a, lineAt(3) + 5.6, lineAt(6) + 32, 0],
    ['bike', 0x38c8ff, lineAt(2) + 5.4, lineAt(3) + 20, 0],
  ];
  for (const [type, color, x, z, yaw] of parked) {
    const v = new Vehicle(scene, world, fx, type, color);
    v.place(x, z, yaw);
    if (x > PIER.ramp) v.pos.y = PIER.deck;
    v.keep = true;
    vehicles.push(v);
  }
  // Boats: moored along the pier, and a couple pulled up at the water's edge near the start
  const boats = [
    ['speedboat', 0xff3fa4, PIER.x0 + 40, PIER.hw + 2.2, Math.PI / 2],
    ['jetski', 0x38f3ff, PIER.x0 + 52, PIER.hw + 1.4, Math.PI / 2],
    ['yacht', 0x1f8a8a, PIER.x0 + 78, PIER.hw + 3.5, Math.PI / 2],
    ['ferry', 0x24527a, PIER.x0 + 62, -(PIER.hw + 5.6), Math.PI / 2],
    ['jetski', 0xffd166, SHORE_X + 3.4, 124, Math.PI / 2],
    ['speedboat', 0x5dff9e, SHORE_X + 4.2, 136, Math.PI / 2],
  ];
  for (const [type, color, x, z, yaw] of boats) {
    const b = new Boat(scene, world, fx, type, color);
    b.place(x, z, yaw);
    vehicles.push(b);
  }
  freighter = new Freighter(scene);
  setLoading(0.75, 'Waking up the locals');
  await frame();
  player = new Player(scene, world, game);
  player.spawn(lineAt(N) - 8.5, 106, Math.PI);
  peds = new Peds(scene, world, hud, audio, preset.peds);
  peds.spawnAll(player.pos);
  gameplay = new Gameplay(scene, world, hud, audio);
  combat = new Combat(scene, world, fx, audio, game);
  hooks.explode = (x, y, z, size, v) => combat.explode(x, y, z, size, v);
  hooks.burning = (v) => {
    if (v === player.vehicle && player.driving) hud.notify('ON FIRE!', 'Press F to get out', '#ff5f6d');
  };
  post = createPost(renderer, scene, camera);
  applyQuality(quality);
  hideFromReflections();
  setLoading(0.9, 'Compiling shaders');
  await frame();
  day.update(0, player.pos, camera.position);
  day.bakeEnv(day.sunDir.y);
  updateCamera(0);
  renderer.compile(scene, camera);
  setLoading(1, 'Ready');
  hud.ready();
  hud.setWeaponIcons(weaponIcons());
  // Transit lines on the map
  const trackPts = (t) => t.x.filter((_, i) => i % 8 === 0).map((x, i) => [x, t.z[i * 8]]);
  hud.drawTransit(
    [
      ...rail.tramTracks.map(({ track, color }) => ({ pts: trackPts(track), color: '#' + new THREE.Color(color).getHexString(), width: 3 })),
      { pts: trackPts(rail.trainTrack), color: '#c8ccd2', width: 4, dash: [10, 6] },
      { pts: trackPts(metro.track), color: '#8b5cf6', width: 4, dash: [6, 5] },
    ],
    [...rail.stations.map(([, x, z]) => ({ x, z, color: '#24c3d6' })), ...metro.stations.map((s) => ({ x: s.stair.x1, z: (s.stair.z0 + s.stair.z1) / 2, color: '#8b5cf6', label: 'M' }))],
  );
  mapView = new MapView(hud);
  mapView.onWaypoint = setWaypoint;
  input.onWheel = (open, vec, kind) => {
    const can = state === 'play' && player.mode === 'foot' && !player.dead;
    if (kind === 'weapon') {
      const sel = hud.weaponWheel(open && can, vec, player.arsenal);
      if (!open) hud.closeWeaponWheel();
      return can ? sel : null;
    }
    return hud.wheel(open && can, vec);
  };
  state = 'title';
  last = performance.now();
  requestAnimationFrame(loop);
}

let reflectFrame = false;
/** Characters, traffic and particles are skipped in the ocean's reflection pass for speed. */
function hideFromReflections() {
  const water = world.water;
  const orig = water.onBeforeRender;
  water.onBeforeRender = (...args) => {
    const hidden = [];
    const hide = (o) => {
      if (o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    };
    for (const n of peds.list) hide(n.ch.mesh);
    for (const c of traffic.cars) hide(c.mesh.root);
    for (const cs of rail.consists) for (const c of cs.cars) hide(c.root);
    hide(combat.tracers.lines);
    hide(day.flareAnchor);
    hide(fx.smokeP.points);
    hide(headlights);
    // The ocean mirror re-renders the whole scene; refreshing it every other frame halves that cost
    reflectFrame = !reflectFrame;
    if (!reflectFrame) {
      for (const o of hidden) o.visible = true;
      return;
    }
    orig(...args);
    for (const o of hidden) o.visible = true;
  };
}

function startGame() {
  if (state !== 'title') return;
  audio.init();
  state = 'play';
  hud.start();
  input.lock();
  cam.yaw = player.yaw;
  setTimeout(() => hud.notify('WELCOME TO VIBE CITY', 'Walk up to any vehicle and press F', '#ff3fa4'), 900);
  setTimeout(() => hud.notify('ARMED & READY', '1–7 or mouse wheel to switch weapons', '#ffd36b'), 4600);
}
document.getElementById('play').addEventListener('click', startGame);
renderer.domElement.addEventListener('click', () => {
  if (state === 'play') input.lock();
});
document.getElementById('pause').addEventListener('click', () => setPaused(false));
let wasLocked = false;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (!locked && wasLocked && state === 'play') setPaused(true);
  wasLocked = locked;
});
/* ---------- Map, waypoint and GPS route ---------- */
let waypoint = null;
let route = null;
let routeT = 0;
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(1.4, 1.4, 160, 16, 1, true).translate(0, 80, 0),
  new THREE.MeshBasicMaterial({ map: T.beam(), color: new THREE.Color(3, 0.4, 1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
);
beacon.visible = false;
scene.add(beacon);
function setWaypoint(p) {
  waypoint = p;
  route = null;
  routeT = 0;
  beacon.visible = !!p;
  if (p) {
    beacon.position.set(p.x, world.height(p.x, p.z), p.z);
    audio.beep(true);
  }
}
function updateRoute(dt) {
  if (!waypoint) {
    hud.route = null;
    hud.waypoint(null);
    return;
  }
  const f = player.focus;
  if (Math.hypot(f.x - waypoint.x, f.z - waypoint.z) < 12) {
    hud.notify('ARRIVED', 'Waypoint reached', '#ff3fa4');
    setWaypoint(null);
    hud.route = null;
    hud.waypoint(null);
    return;
  }
  routeT -= dt;
  if (!route || routeT <= 0) {
    route = findRoute(f.x, f.z, waypoint.x, waypoint.z);
    routeT = 0.5;
  }
  route[0] = [f.x, f.z];
  hud.route = route;
  hud.waypoint(routeLength(route));
}
function setMap(open) {
  if (open && state !== 'play') return;
  if (!open && state !== 'map') return;
  state = open ? 'map' : 'play';
  mapView.show(open, player.focus);
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock();
    if (audio.ctx) audio.ctx.suspend();
  } else {
    input.scroll = 0;
    input.keys.clear();
    if (audio.ctx) audio.ctx.resume();
    input.lock();
  }
}

function setPaused(p) {
  if (p && state !== 'play') return;
  if (!p && state !== 'pause') return;
  state = p ? 'pause' : 'play';
  hud.setPaused(p);
  if (audio.ctx) p ? audio.ctx.suspend() : audio.ctx.resume();
  if (!p) input.lock();
}

/* ---------- Aim assist ---------- */
const _ad = new THREE.Vector3();
let aimTarget = false;
/** Light magnetism toward a person near the crosshair, and a red crosshair over one. */
function aimHelp(dt) {
  aimTarget = false;
  const p = player;
  if (p.mode !== 'foot' || p.dead || player.arsenal.def.kind !== 'gun') return;
  camera.getWorldDirection(_ad);
  const o = camera.position;
  const w = player.arsenal.def;
  let best = null;
  let bestA = p.scoped ? 0.012 : 0.05;
  for (const n of peds.list) {
    if (n.state === 'dead' || !n.ch.mesh.visible) continue;
    const tx = n.x - o.x;
    const ty = n.y + 1.25 - o.y;
    const tz = n.z - o.z;
    const d = Math.hypot(tx, ty, tz);
    if (d < 2 || d > w.range) continue;
    const a = Math.acos(Math.min(1, (tx * _ad.x + ty * _ad.y + tz * _ad.z) / d));
    if (a < bestA) {
      bestA = a;
      best = { n, tx, ty, tz, d };
    }
  }
  if (!best) return;
  const hit = combat.raycast(o, _ad, best.d + 2, { minT: 1 });
  aimTarget = hit.type === 'ped';
  if (!p.aiming) return;
  // Ease the view toward the target's chest; hostile people pull harder
  const hostile = best.n.state === 'shoot' || best.n.state === 'fight';
  const k = (hostile ? 4 : 2) * (p.scoped ? 0.4 : 1) * dt;
  const wantYaw = Math.atan2(best.tx, best.tz);
  const wantPitch = -Math.atan2(best.ty, Math.hypot(best.tx, best.tz));
  const curYaw = Math.atan2(_ad.x, _ad.z);
  cam.yaw += Math.atan2(Math.sin(wantYaw - curYaw), Math.cos(wantYaw - curYaw)) * k;
  cam.pitch += (wantPitch - Math.asin(-_ad.y)) * k;
}

/* ---------- Main loop ---------- */
let last = 0;
const blipsFn = () => {
  const b = gameplay.blips();
  if (waypoint) b.push({ x: waypoint.x, z: waypoint.z, color: '#ff3fa4', r: 9, always: true, label: '★' });
  return b;
};
const movingVehicles = [];
const obstacles = [];
const footObstacle = { pos: null, isPed: true };
const pedObstacles = [];
let nitroWas = false;
let hornWas = false;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  // Cap at ~60 fps: high-refresh displays would otherwise double CPU/GPU work
  if (now - last < 15.5) return;
  let dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  frameNo++;

  if (state === 'title' && input.hit('Enter')) startGame();
  if ((state === 'play' || state === 'pause') && (input.hit('Escape') || input.hit('KeyP'))) {
    if (!input.locked || state === 'pause') setPaused(state === 'play');
  }
  if ((state === 'play' && input.hit('KeyM')) || (state === 'map' && (input.hit('KeyM') || input.hit('Escape')))) setMap(state === 'play');
  if (state === 'map') {
    if (waypoint && !route) route = findRoute(player.focus.x, player.focus.z, waypoint.x, waypoint.z);
    mapView.draw(player, gameplay.blips(), waypoint, route);
    input.endFrame();
    return;
  }
  if (state === 'pause') {
    input.endFrame();
    return;
  }
  const inp = input.poll();
  // Time slows while the weapon wheel is open
  if (state === 'play' && input.wheelOpen && input.wheelKind === 'weapon' && player.mode === 'foot') dt *= 0.25;
  elapsed += dt;
  game.night = day.night;

  if (state === 'play') {
    if (input.hit('KeyC')) cam.mode = (cam.mode + 1) % (player.driving ? 3 : 2);
    if (input.hit('KeyN')) audio.setMuted(!audio.muted);
    if (input.hit('KeyQ')) hud.notify(audio.toggleRadio() ? 'RADIO ON' : 'RADIO OFF', 'Vibe City FM', '#b45bff');
    if (input.hit('KeyR') && player.driving && !player.vehicle.rail) resetToRoad(player.vehicle);
    if (input.hit('Backspace') && gameplay.race.state !== 'idle') gameplay.cancelRace('Cancelled');
    if (input.hit('KeyT')) hud.notify('TIME WARP', 'Hold T to fast-forward', '#38f3ff');
    day.warp = input.keys.has('KeyT') ? 40 : 1;
    const wasDriving = player.driving;
    game.camYaw = cam.yaw;
    player.update(dt, elapsed, inp, input, cam.yaw);
    aimHelp(dt);
    if (player.driving && !wasDriving && cam.mode > 2) cam.mode = 0;
    if (!player.driving && cam.mode > 1) cam.mode = 0;
    // Horn scares nearby people
    const horn = player.driving && inp.horn;
    audio.horn(horn);
    if (horn && !hornWas) {
      const v = player.vehicle;
      for (const n of peds.list) {
        const d = Math.hypot(n.x - v.pos.x, n.z - v.pos.z);
        if (d < 12 && n.state !== 'down' && Math.random() < 0.6) {
          n.ch.play('cower');
          if (Math.random() < 0.5) peds.say(n, ['Watch it!', 'Hey!', 'Easy!', 'Jeez!'][Math.floor(Math.random() * 4)], 1.8);
        }
      }
    }
    hornWas = horn;
    if (player.driving) {
      if (player.vehicle.nitroOn && !nitroWas) audio.whoosh();
      nitroWas = player.vehicle.nitroOn;
    }
  }

  // Free vehicles (parked / knocked loose)
  for (const v of vehicles) {
    if (v === player.vehicle && (player.mode === 'driving' || player.mode === 'exiting')) continue;
    v.update(dt, null, day.night);
  }
  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      const a = vehicles[i];
      const b = vehicles[j];
      if (a.asleep && b.asleep) continue;
      const hit = collideVehicles(a, b);
      if (hit > 3 && (a === player.vehicle || b === player.vehicle)) a.impact = b.impact = Math.max(a.impact, hit);
    }
  }
  const focus = player.focus;
  rail.update(dt, day.night, { player, peds, vehicles, traffic, game, audio });
  obstacles.length = 0;
  for (const v of vehicles) obstacles.push(v);
  for (const o of rail.obstacles()) obstacles.push(o);
  if (player.mode === 'foot') {
    footObstacle.pos = player.pos;
    obstacles.push(footObstacle);
  }
  let pi = 0;
  for (const n of peds.list) {
    if (n.state !== 'down' && n.state !== 'flee') continue;
    const o = pedObstacles[pi] || (pedObstacles[pi] = { pos: { x: 0, z: 0 }, isPed: true });
    o.pos.x = n.x;
    o.pos.z = n.z;
    obstacles.push(o);
    pi++;
  }
  traffic.update(dt, focus, obstacles, camera.position);
  movingVehicles.length = 0;
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    if (!v.asleep || v.driven) traffic.collideVehicle(v, focus);
    if (!v.asleep && v.speed > 3) movingVehicles.push(v);
    setCarLOD(v.car, Math.hypot(v.pos.x - camera.position.x, v.pos.z - camera.position.z));
  }

  const pv = player.driving ? player.vehicle : null;
  if (pv && pv.impact > 3) {
    cam.shake = Math.min(0.6, cam.shake + pv.impact * 0.03);
    audio.impact(pv.impact);
  }
  peds.update(dt, elapsed, {
    focus,
    foot: player.mode === 'foot' && !player.underground ? player.pos : null,
    vehicles: movingVehicles,
    camPos: camera.position,
    frame: frameNo,
    player,
    combat,
  });
  if (state === 'play') gameplay.update(dt, elapsed, player);

  fx.update(dt);
  combat.update(dt);
  if (state === 'play') updateRoute(dt);
  beacon.material.opacity = 0.5 + Math.sin(elapsed * 3) * 0.15;
  fx.smokeP.mat.uniforms.uColor.value.setScalar(lerp(0.85, 0.12, day.night));
  day.update(dt, focus, camera.position);
  world.update(dt, elapsed, day.night, day.sunDir);
  metro.update(day.night);
  freighter.update(dt, elapsed);
  setTrafficLights(day.night);
  for (const s of spots) s.intensity = day.night * 260;
  beamMat.uniforms.uIntensity.value = day.night * 0.35;
  updateCamera(dt);
  hud.prompt(state === 'play' ? player.prompt : null);
  {
    const ars = player.arsenal;
    const w = ars.def;
    const clip = ars.clip;
    const onFoot = player.mode === 'foot' && !player.dead && state === 'play';
    hud.combat({
      name: w.name.toUpperCase(),
      gun: w.kind === 'gun',
      mag: clip ? clip.mag : 0,
      reserve: clip ? clip.reserve : 0,
      reloading: ars.reloadT > 0,
      cross: onFoot && w.kind === 'gun' && !player.scoped,
      dot: !(player.aiming || player.combatT > 0),
      target: aimTarget,
      aiming: player.aiming,
      scoped: onFoot && player.scoped,
      spread: (player.aiming ? w.aim : w.spread) || 0,
      hp: player.hp,
      dead: player.dead,
    });
  }
  const mm = pv ? { pos: pv.pos, yaw: pv.yaw, speed: pv.speed } : { pos: player.pos, yaw: cam.yaw, speed: player.speed };
  hud.update(dt, mm, day.hours, blipsFn, pv, camera);
  audio.update({
    rpm: pv ? pv.rpm : 0.2,
    throttle: pv && state === 'play' ? inp.throttle : 0,
    speed: pv ? pv.speed : 0,
    skid: pv ? pv.skid : 0,
    nitro: pv ? pv.nitroOn : false,
    engineOn: !!pv,
    pitch: pv ? pv.def.engine : 1,
  });

  // Post FX
  const g = post.grade.uniforms;
  const spd = pv ? pv.speed : 0;
  g.uTime.value = elapsed % 100;
  g.uNight.value = day.night;
  g.uBlur.value = pv && pv.nitroOn ? 1.6 : clamp((spd - 35) / 40, 0, 1) * 0.6;
  g.uAberration.value = 0.0012 + (pv && pv.nitroOn ? 0.004 : 0) + cam.shake * 0.01;
  // The midday sky is very bright in linear HDR: keep bloom for real light sources only
  const sunHigh = clamp(day.sunDir.y / 0.4, 0, 1);
  post.bloom.strength = lerp(lerp(0.4, 0.22, sunHigh), 0.6, day.night);
  post.bloom.threshold = lerp(lerp(1.0, 5.0, sunHigh), 0.85, day.night);

  renderer.shadowMap.needsUpdate = true;
  post.composer.render(dt);
  input.endFrame();
  adaptQuality(dt);
}

function resetToRoad(v) {
  if (v.boat) {
    v.place(Math.max(v.pos.x, SHORE_X + 20), v.pos.z, Math.PI / 2);
    hud.notify('RESET', '', '#ffffff');
    return;
  }
  const cell = lineAt(1) - lineAt(0);
  const kx = clamp(Math.round((v.pos.x - lineAt(0)) / cell), 0, N);
  const mz = clamp(Math.round((v.pos.z - lineAt(0)) / cell), 0, N);
  const dx = Math.abs(v.pos.x - lineAt(kx));
  const dz = Math.abs(v.pos.z - lineAt(mz));
  if (dx < dz) v.place(lineAt(kx) + LANE, clamp(v.pos.z, lineAt(0), lineAt(N)), Math.PI);
  else v.place(clamp(v.pos.x, lineAt(0), lineAt(N)), lineAt(mz) + LANE, Math.PI / 2);
  hud.notify('RESET', '', '#ffffff');
}

boot().catch((e) => {
  console.error(e);
  document.querySelector('#loading .text').textContent = `Error: ${e.message}`;
});
