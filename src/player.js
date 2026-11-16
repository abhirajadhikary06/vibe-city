import * as THREE from 'three';
import { Character, PLAYER_LOOK, playerMaterial, EMOTE_LIST } from './character.js';
import { LINES } from './peds.js';
import { clamp, damp, dampAngle, lerp } from './utils.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const NO_INPUT = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };

/**
 * The player: an on-foot character who can get into any vehicle.
 * mode: foot | entering | driving | exiting
 */
export class Player {
  constructor(scene, world, game) {
    this.world = world;
    this.game = game; // { peds, traffic, vehicles, hud, audio, adoptTrafficCar, gameplay }
    this.ch = new Character(scene, PLAYER_LOOK, playerMaterial());
    this.pos = new THREE.Vector3();
    this.yaw = Math.PI;
    this.vy = 0;
    this.grounded = true;
    this.mode = 'foot';
    this.vehicle = null;
    this.anim = null;
    this.downT = 0;
    this.speed = 0;
    this.prompt = null;
  }

  spawn(x, z, yaw) {
    this.pos.set(x, this.world.height(x, z), z);
    this.yaw = yaw;
  }

  /** The point the world should follow (camera, streaming, minimap). */
  get focus() {
    return this.vehicle && this.mode !== 'foot' ? this.vehicle.pos : this.pos;
  }
  get driving() {
    return this.mode === 'driving';
  }

  /* ---------- Vehicles ---------- */
  findVehicle() {
    const g = this.game;
    let best = null;
    let bd = 4.2;
    for (const v of g.vehicles) {
      const d = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z);
      if (d < bd) {
        bd = d;
        best = { v };
      }
    }
    const t = g.traffic.nearest(this.pos.x, this.pos.z, 4.5);
    if (t) {
      const d = Math.hypot(t.x - this.pos.x, t.z - this.pos.z);
      if (d < bd) best = { traffic: t };
    }
    return best;
  }

  enter(target) {
    const g = this.game;
    let v = target.v;
    let jacked = false;
    if (target.traffic) {
      v = g.adoptTrafficCar(target.traffic, new THREE.Vector2(0, 0), 0);
      jacked = true;
    }
    if (g.vehicles.some((o) => o !== v && o.driven)) return;
    // Pick the closer door, walk there, then climb in
    const sideL = v.local(1.35, 0.1);
    const sideR = v.local(-1.35, 0.1);
    const dl = Math.hypot(sideL.x - this.pos.x, sideL.z - this.pos.z);
    const dr = Math.hypot(sideR.x - this.pos.x, sideR.z - this.pos.z);
    const door = dl <= dr ? sideL : sideR;
    this.vehicle = v;
    v.asleep = false;
    v.locked = true;
    this.mode = 'entering';
    this.ch.stopEmote();
    this.anim = { t: 0, phase: 'walk', door, jacked, side: dl <= dr ? 1 : -1, from: this.pos.clone() };
  }

  exit() {
    const v = this.vehicle;
    const bail = v.speed > 9;
    v.setDriven(false);
    v.locked = false;
    this.game.onExitVehicle(v);
    const side = 1;
    let door = v.local(1.4 * side, 0.1);
    if (this.world.collideCircle(door.x, door.z, 0.4)) door = v.local(-1.4, 0.1);
    this.mode = 'exiting';
    this.anim = { t: 0, door, bail, startYaw: v.yaw };
    if (bail) {
      this.game.hud.notify('BAILED OUT!', '', '#ff5f6d');
    }
  }

  /* ---------- Update ---------- */
  update(dt, T, inp, input, camYaw) {
    const g = this.game;
    this.prompt = null;
    if (this.mode === 'driving') {
      const v = this.vehicle;
      v.update(dt, inp, g.night);
      this.seatCharacter(v);
      this.ch.steer = v.steer / 0.6;
      if (input.hit('KeyF')) this.exit();
      this.ch.update(dt, T);
      return;
    }
    if (this.mode === 'entering') {
      this.updateEntering(dt, T);
      return;
    }
    if (this.mode === 'exiting') {
      this.updateExiting(dt, T);
      return;
    }
    this.updateFoot(dt, T, inp, input, camYaw);
  }

  seatCharacter(v) {
    const d = v.def;
    const p = v.local(0.38, d.seatZ);
    this.pos.set(p.x, v.pos.y + d.seatY, p.z);
    this.yaw = v.yaw;
    this.ch.mode = 'sit';
    const m = this.ch.mesh;
    m.position.copy(this.pos);
    m.rotation.set(v.pitch, v.yaw, 0, 'YXZ');
  }

  updateEntering(dt, T) {
    const a = this.anim;
    const v = this.vehicle;
    a.t += dt;
    if (a.phase === 'walk') {
      const dx = a.door.x - this.pos.x;
      const dz = a.door.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25 || a.t > 2.2) {
        a.phase = 'in';
        a.t = 0;
        a.from = this.pos.clone();
        if (a.jacked) {
          const ped = this.game.peds.spawnEjected(a.door.x, a.door.z, v.yaw + (a.side > 0 ? 0 : Math.PI), this.pos);
          if (ped) this.game.hud.notify('CAR JACKED', v.label, '#ff9a3c');
        }
      } else {
        const sp = Math.min(4.5, d / dt);
        this.pos.x += (dx / d) * sp * dt;
        this.pos.z += (dz / d) * sp * dt;
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt);
        this.ch.speed = damp(this.ch.speed, 4.5, 10, dt);
        this.pos.y = this.world.height(this.pos.x, this.pos.z);
      }
      this.ch.mesh.position.copy(this.pos);
      this.ch.mesh.rotation.set(0, this.yaw, 0);
      this.ch.update(dt, T);
      return;
    }
    // climb in
    const k = clamp(a.t / 0.55, 0, 1);
    const seat = v.local(0.38, v.def.seatZ);
    this.pos.set(lerp(a.from.x, seat.x, k), lerp(a.from.y, v.pos.y + v.def.seatY, k), lerp(a.from.z, seat.z, k));
    this.yaw = dampAngle(this.yaw, v.yaw, 14, dt);
    this.ch.speed = 0;
    if (k > 0.3) this.ch.mode = 'sit';
    this.ch.mesh.position.copy(this.pos);
    this.ch.mesh.rotation.set(0, this.yaw, 0);
    this.ch.update(dt, T);
    if (k >= 1) {
      this.mode = 'driving';
      v.locked = false;
      v.setDriven(true);
      this.game.onEnterVehicle(v);
    }
  }

  updateExiting(dt, T) {
    const a = this.anim;
    const v = this.vehicle;
    a.t += dt;
    v.update(dt, NO_INPUT, this.game.night);
    if (a.bail) {
      // dive out and tumble
      if (a.t < 0.05) {
        const dir = v.local(2, 0);
        this.pos.set(dir.x, v.pos.y, dir.z);
        this.bailVel = new THREE.Vector2(v.vel.x * 0.5 + Math.cos(v.yaw) * 4, v.vel.y * 0.5 - Math.sin(v.yaw) * 4);
        this.ch.mode = 'down';
      }
      this.bailVel.multiplyScalar(Math.exp(-2.5 * dt));
      this.pos.x += this.bailVel.x * dt;
      this.pos.z += this.bailVel.y * dt;
      const hit = this.world.collideCircle(this.pos.x, this.pos.z, 0.4);
      if (hit) {
        this.pos.x += hit.px;
        this.pos.z += hit.pz;
      }
      this.pos.y = this.world.height(this.pos.x, this.pos.z);
      this.ch.mesh.position.copy(this.pos);
      this.ch.mesh.rotation.set(0, this.yaw, 0);
      this.ch.update(dt, T);
      if (a.t > 1.6) this.finishExit();
      return;
    }
    const k = clamp(a.t / 0.5, 0, 1);
    const seat = v.local(0.38, v.def.seatZ);
    const gy = this.world.height(a.door.x, a.door.z);
    this.pos.set(lerp(seat.x, a.door.x, k), lerp(v.pos.y + v.def.seatY, gy, k), lerp(seat.z, a.door.z, k));
    if (k > 0.4) this.ch.mode = 'move';
    this.ch.mesh.position.copy(this.pos);
    this.ch.mesh.rotation.set(0, this.yaw, 0);
    this.ch.update(dt, T);
    if (k >= 1) this.finishExit();
  }

  finishExit() {
    this.mode = 'foot';
    this.ch.mode = 'move';
    this.vehicle = null;
    this.vy = 0;
  }

  updateFoot(dt, T, inp, input, camYaw) {
    const g = this.game;
    const ch = this.ch;
    // Knocked down by a car?
    if (this.downT > 0) {
      this.downT -= dt;
      this.knockVel.multiplyScalar(Math.exp(-3 * dt));
      this.pos.x += this.knockVel.x * dt;
      this.pos.z += this.knockVel.y * dt;
      const hit = this.world.collideCircle(this.pos.x, this.pos.z, 0.4);
      if (hit) {
        this.pos.x += hit.px;
        this.pos.z += hit.pz;
      }
      this.pos.y = this.world.height(this.pos.x, this.pos.z);
      if (this.downT <= 0) ch.mode = 'move';
      ch.mesh.position.copy(this.pos);
      ch.update(dt, T);
      return;
    }

    // Movement relative to camera
    const k = input.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const str = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const sprint = inp.nitro;
    let mx = Math.sin(camYaw) * fwd - Math.cos(camYaw) * str;
    let mz = Math.cos(camYaw) * fwd + Math.sin(camYaw) * str;
    const ml = Math.hypot(mx, mz);
    const busy = ch.punchT >= 0;
    let target = 0;
    if (ml > 0.01 && !busy) {
      mx /= ml;
      mz /= ml;
      target = sprint ? 7.2 : 4.0;
      this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 12, dt);
      if (ch.emote) ch.stopEmote();
      if (g.partyOn) g.endParty();
    }
    this.speed = damp(this.speed, target, target > this.speed ? 8 : 12, dt);
    const vx = Math.sin(this.yaw) * this.speed;
    const vz = Math.cos(this.yaw) * this.speed;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;

    // Collisions: world, vehicles, traffic
    const hit = this.world.collideCircle(this.pos.x, this.pos.z, 0.35);
    if (hit) {
      this.pos.x += hit.px;
      this.pos.z += hit.pz;
    }
    for (const v of g.vehicles) {
      if (v.speed > 5 && this.pushFromCar(v.pos.x, v.pos.z, v.yaw, true)) this.knockDown(v.vel.x * 0.8, v.vel.y * 0.8);
      this.pushFromCar(v.pos.x, v.pos.z, v.yaw);
    }
    for (const c of g.traffic.cars) {
      const hitCar = this.pushFromCar(c.x, c.z, c.yaw);
      if (hitCar && c.speed > 5) this.knockDown(c.vel.x * 0.8, c.vel.y * 0.8);
    }

    // Jump & gravity
    const ground = this.world.height(this.pos.x, this.pos.z);
    if (this.grounded && input.hit('Space') && !busy) {
      this.vy = 5.2;
      this.grounded = false;
      ch.stopEmote();
    }
    if (!this.grounded) {
      this.vy -= 15 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.grounded = true;
        this.vy = 0;
      }
    } else {
      this.pos.y = damp(this.pos.y, ground, 20, dt);
    }
    ch.mode = this.grounded ? 'move' : 'air';
    ch.speed = this.speed;

    // Interactions
    const nearCar = this.findVehicle();
    const nearPed = g.peds.nearest(this.pos.x, this.pos.z, 3.2, (n) => n.state !== 'down');
    if (nearCar) {
      const label = nearCar.v ? nearCar.v.label : `${g.traffic.cars.includes(nearCar.traffic) ? 'Steal ' : ''}${nearCar.traffic.type === 'taxi' ? 'Taxi' : nearCar.traffic.type[0].toUpperCase() + nearCar.traffic.type.slice(1)}`;
      this.prompt = { key: 'F', text: nearCar.v ? `Enter ${label}` : label };
    } else if (nearPed) {
      this.prompt = { key: 'E', text: 'Talk', key2: '1-8', text2: 'Gesture' };
    }
    if (input.hit('KeyF') && nearCar) {
      this.enter(nearCar);
    } else if (input.hit('KeyE') && nearPed) {
      this.talkTo(nearPed);
    }
    if ((input.hit('Mouse0') || input.hit('KeyJ')) && !busy && this.grounded) this.punch();

    // Gestures
    for (let i = 0; i < EMOTE_LIST.length; i++) {
      if (input.hit('Digit' + (i + 1))) this.gesture(EMOTE_LIST[i]);
    }
    if (input.wheelPick) {
      this.gesture(input.wheelPick);
      input.wheelPick = null;
    }

    ch.mesh.position.copy(this.pos);
    ch.mesh.rotation.set(0, this.yaw, 0);
    ch.update(dt, T);
  }

  pushFromCar(cx, cz, yaw, test = false) {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let hit = false;
    for (const o of [-1.5, 0, 1.5]) {
      const dx = this.pos.x - (cx + fx * o);
      const dz = this.pos.z - (cz + fz * o);
      const d = Math.hypot(dx, dz);
      const r = 1.35;
      if (d < r && d > 1e-4) {
        if (!test) {
          this.pos.x += (dx / d) * (r - d);
          this.pos.z += (dz / d) * (r - d);
        }
        hit = true;
      }
    }
    return hit;
  }

  knockDown(vx, vz) {
    if (this.downT > 0) return;
    this.downT = 2.2;
    this.knockVel = new THREE.Vector2(vx, vz);
    this.ch.mode = 'down';
    this.ch.stopEmote();
    this.game.audio.impact(6);
    this.game.hud.notify('OUCH!', 'Watch the traffic', '#ff5f6d');
  }

  punch() {
    if (!this.ch.punch()) return;
    const g = this.game;
    setTimeout(() => {
      const hx = this.pos.x + Math.sin(this.yaw) * 0.9;
      const hz = this.pos.z + Math.cos(this.yaw) * 0.9;
      const n = g.peds.nearest(hx, hz, 0.9, (p) => p.state !== 'down');
      g.audio.tone(140, 0.12, 'triangle', 0.15, 60);
      if (n) {
        g.peds.knock(n, Math.sin(this.yaw) * 4, Math.cos(this.yaw) * 4, pick(LINES.punch));
        g.peds.panic(n.x, n.z, 16);
        g.audio.impact(4);
      }
    }, 170);
  }

  talkTo(n) {
    const g = this.game;
    this.yaw = Math.atan2(n.x - this.pos.x, n.z - this.pos.z);
    this.ch.play('talk');
    g.hud.say(this.ch, pick(LINES.playerTalk), 1.8);
    const tip = g.peds.talk(n, this.pos);
    if (tip) setTimeout(() => g.gameplay.addMoney(tip, `TIP +$${tip}`), 4200);
  }

  gesture(name) {
    const g = this.game;
    if (this.mode !== 'foot' || this.downT > 0) return;
    this.speed = 0;
    this.ch.play(name);
    if (name === 'dance') {
      const n = g.peds.danceParty(this.pos.x, this.pos.z, 14);
      g.partyOn = true;
      if (n > 0) g.hud.notify('DANCE PARTY!', `${n} ${n === 1 ? 'person joins' : 'people join'} in`, '#ff3fa4');
      return;
    }
    const near = g.peds.nearest(this.pos.x, this.pos.z, 9, (p) => p.state !== 'down' && p.state !== 'flee');
    if (near) {
      const facing = Math.cos(Math.atan2(near.x - this.pos.x, near.z - this.pos.z) - this.yaw) > 0.2;
      if (facing || name === 'cheer') g.peds.react(near, name, this.pos);
    }
    if (name === 'point' && near) g.hud.say(this.ch, pick(['Hey, you!', 'Over there!', 'You!']), 1.4);
  }
}
