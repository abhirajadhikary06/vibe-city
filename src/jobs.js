import { Character, randomLook } from './character.js';
import { LINES, pick } from './lines.js';
import { MAP, routeLength } from './geo.js';
import { inTiles } from './world.js';
import { passengerSeat } from './ride.js';
import { clamp, dampAngle } from './utils.js';

/*
 * Taxi duty. In a yellow Ambassador or an auto, press B to go on duty: someone
 * waves you down on the pavement, you pull up beside them, they get in and name a
 * place across town. Get them there before the clock runs out without knocking them
 * about, and they pay the fare plus a tip. Fares in a row build a streak bonus.
 */

const CABS = { taxi: { base: 60, perKm: 45, speed: 9, label: 'TAXI' }, auto: { base: 40, perKm: 35, speed: 6.5, label: 'AUTO' } };
const DEST_KINDS = new Set(['landmark', 'station', 'metro', 'market', 'hospital', 'hotel', 'college', 'park', 'stadium', 'worship', 'ghat', 'area']);

const fmt = (t) => {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export class TaxiJobs {
  constructor(game, scene, world, progress) {
    this.game = game;
    this.scene = scene;
    this.world = world;
    this.progress = progress;
    this.on = false;
    this.job = null;
    this.streak = 0;
    this.waitT = 0;
    this.hintT = 0;
    this.lastVehicle = null;
    this.dests = null;
  }

  eligible(v) {
    return !!v && !v.rail && !v.boat && !v.wrecked && !!CABS[v.type];
  }

  /** Named places a fare might ask for, each with the road point to stop at. */
  destinations() {
    if (this.dests) return this.dests;
    const seen = new Set();
    this.dests = [];
    for (const p of MAP.pois) {
      if (!DEST_KINDS.has(p.k) || !inTiles(p.x, p.z, -150)) continue;
      if (/hostel|guest house|residence/i.test(p.n) || /^\S+ hall$/i.test(p.n)) continue;
      const n = p.n.replace(/\s*\(.*?\)/, '').trim();
      if (n.length < 3 || seen.has(n)) continue;
      const r = this.world.graph.nearest(p.x, p.z, 120, (e) => !e.br);
      if (!r || r.d > 120) continue;
      seen.add(n);
      this.dests.push({ n, x: r.x, z: r.z });
    }
    return this.dests;
  }

  /* ---------- Going on and off duty ---------- */
  start(v) {
    this.on = true;
    this.cab = CABS[v.type];
    this.game.hud.notify(`ON DUTY · ${this.cab.label}`, 'Look for the yellow marker: someone wants a ride', '#ffd21f');
    this.spawnFare(v);
  }
  stop(why = 'B to go back on duty') {
    if (this.job) this.dropPassenger(true);
    this.on = false;
    this.job = null;
    this.game.clearWaypoint();
    this.game.hud.mission(null);
    this.game.hud.notify('OFF DUTY', why, '#ffd21f');
  }

  /** Someone on a pavement a short drive away flags you down. */
  spawnFare(v) {
    const W = this.world;
    const cand = W.pickupSpots.filter(([x, , z]) => {
      const d = Math.hypot(x - v.pos.x, z - v.pos.z);
      return d > 120 && d < 550 && inTiles(x, z, -100);
    });
    if (!cand.length) {
      this.waitT = 5;
      return;
    }
    const [x, , z] = cand[Math.floor(Math.random() * cand.length)];
    const ch = new Character(this.scene, randomLook());
    ch.acc = 0;
    const road = W.graph.nearest(x, z, 30);
    const yaw = road ? Math.atan2(road.x - x, road.z - z) : 0;
    ch.mesh.position.set(x, W.height(x, z), z);
    ch.mesh.rotation.y = yaw;
    this.job = { state: 'pickup', ch, x, z, yaw, t: 0, waveT: 0, hailed: false };
    this.game.setWaypointQuiet({ x, z, job: true });
  }

  /** The passenger leaves: removed now, or after a short walk away. */
  dropPassenger(now = false) {
    const j = this.job;
    if (!j || !j.ch) return;
    const ch = j.ch;
    j.ch = null;
    const gone = () => {
      this.scene.remove(ch.mesh);
      ch.mesh.geometry.dispose();
    };
    if (now) gone();
    else setTimeout(gone, 3500);
  }

  pay(j, v) {
    const g = this.game;
    const late = j.t > j.allowed;
    const n = clamp(5 - Math.min(3, j.knocks) - (late ? 1 : 0) - (j.t > j.allowed * 1.4 ? 1 : 0), 1, 5);
    const fare = Math.round(this.cab.base + this.cab.perKm * j.km);
    // a good ride earns a tip, and up to half again for time to spare
    const spare = clamp((j.allowed - j.t) / j.allowed, 0, 0.5);
    const tip = n >= 4 ? Math.round(fare * (n === 5 ? 0.3 : 0.15) * (1 + spare)) : 0;
    this.streak++;
    const bonus = Math.min(100, (this.streak - 1) * 10);
    g.gameplay.addMoney(fare + tip + bonus);
    g.audio.pickup();
    g.hud.notify(`${stars(n)}  ₹${fare + tip + bonus}`, `Fare ₹${fare}${tip ? ` · tip ₹${tip}` : ''}${bonus ? ` · streak ×${this.streak} +₹${bonus}` : ''}`, '#ffd21f');
    g.hud.say(j.ch, pick(n >= 4 ? LINES.happy : late ? LINES.late : LINES.thanks), 2.6);
    this.progress.fare({ paid: fare + tip + bonus, tip, stars: n, km: j.km, streak: this.streak });
  }

  lose(j, why) {
    const g = this.game;
    g.hud.say(j.ch, pick(LINES.quit), 2.4);
    g.hud.notify('FARE LOST', why, '#ff5f6d');
    this.streak = 0;
    this.progress.fare({ lost: true });
  }

  /** Stepping out of the cab on the kerb side. */
  alight(j, v) {
    const off = v.def.hw + 0.9;
    let p = v.local(off, -0.4);
    if (this.world.collideCircle(p.x, p.z, 0.4)) p = v.local(-off, -0.4);
    j.ch.mode = 'move';
    j.ch.mesh.position.set(p.x, this.world.height(p.x, p.z), p.z);
    j.ch.mesh.rotation.y = v.yaw + Math.PI / 2;
    j.walkYaw = v.yaw + Math.PI / 2;
  }

  /* ---------- Every frame ---------- */
  update(dt, T, input) {
    const g = this.game;
    const pl = g.player;
    const v = pl.mode === 'driving' ? pl.vehicle : null;
    const ok = this.eligible(v);
    // a hint each time you get into a cab
    if (v !== this.lastVehicle) {
      this.lastVehicle = v;
      this.hintT = ok && !this.on ? 7 : 0;
    }
    if (!ok) {
      if (this.on && this.job && this.job.state === 'ride') this.lose(this.job, 'You left your passenger');
      if (this.on) this.stop(v && v.wrecked ? 'The cab is wrecked' : 'You left the cab');
      else if (this.hintT > 0) {
        this.hintT = 0;
        g.hud.mission(null);
      }
      return;
    }
    if (input.hit('KeyB')) {
      if (this.on) this.stop();
      else {
        this.hintT = 0;
        this.start(v);
      }
      return;
    }
    if (!this.on) {
      if (this.hintT > 0) {
        this.hintT -= dt;
        g.hud.mission(this.hintT > 0 ? `${CABS[v.type].label}<span class="cp">B · go on duty and pick up fares</span>` : null);
      }
      return;
    }
    const j = this.job;
    if (!j) {
      this.waitT -= dt;
      g.hud.mission(`${this.cab.label} DUTY<span class="cp">Waiting for a fare…</span>`);
      if (this.waitT <= 0) this.spawnFare(v);
      return;
    }
    j.t += dt;
    const ch = j.ch;
    if (ch) {
      ch.acc += dt;
      if (ch.acc > 1 / 30) {
        ch.update(ch.acc, T);
        ch.acc = 0;
      }
    }
    const dCar = Math.hypot(v.pos.x - j.x, v.pos.z - j.z);
    switch (j.state) {
      case 'pickup': {
        // waving you down
        j.waveT -= dt;
        if (j.waveT <= 0 && dCar < 120) {
          ch.play('wave');
          j.waveT = 3;
        }
        if (!j.hailed && dCar < 45) {
          j.hailed = true;
          g.hud.say(ch, pick(LINES.hail), 2.2);
        }
        if (j.t > 240) {
          g.hud.notify('THE FARE GAVE UP', 'They found another taxi', '#ffd36b');
          this.dropPassenger(true);
          this.job = null;
          this.waitT = 2;
          break;
        }
        g.hud.mission(`${this.cab.label} DUTY<span class="cp">Pick up the fare</span><span class="t">${Math.round(dCar)} m</span>`);
        if (dCar < 9 && v.speed < 1.5) {
          ch.stopEmote();
          j.state = 'boarding';
          j.bt = 0;
          j.from = ch.mesh.position.clone();
        }
        break;
      }
      case 'boarding': {
        // walk to the rear door, then in
        j.bt += dt;
        const door = v.local(-(v.def.hw + 0.5), -0.6);
        const k = clamp(j.bt / 1.4, 0, 1);
        ch.speed = k < 1 ? 1.4 : 0;
        ch.mesh.position.set(j.from.x + (door.x - j.from.x) * k, ch.mesh.position.y, j.from.z + (door.z - j.from.z) * k);
        ch.mesh.rotation.y = dampAngle(ch.mesh.rotation.y, Math.atan2(door.x - j.from.x, door.z - j.from.z), 10, dt);
        if (v.speed > 3) {
          // drove off without them
          j.state = 'pickup';
          ch.speed = 0;
          break;
        }
        if (k >= 1) this.depart(j, v);
        break;
      }
      case 'ride': {
        const [sx, sz, sy] = passengerSeat(v);
        const s = v.local(sx, sz);
        ch.mode = 'sit';
        ch.mesh.position.set(s.x, v.pos.y + sy, s.z);
        ch.mesh.rotation.set(0, v.yaw, 0);
        j.knockT -= dt;
        if (v.impact > 4 && j.knockT <= 0) {
          j.knocks++;
          j.knockT = 2;
          g.hud.say(ch, pick(LINES.bump), 1.8);
        }
        if (!j.hurried && j.t > j.allowed * 0.75) {
          j.hurried = true;
          g.hud.say(ch, pick(LINES.hurry), 2);
        }
        const left = j.allowed - j.t;
        const dDest = Math.hypot(v.pos.x - j.dx, v.pos.z - j.dz);
        g.hud.mission(`${this.cab.label}<span class="cp">To ${j.dest}</span><span class="t" style="color:${left < 0 ? '#ff5f6d' : left < 20 ? '#ffd36b' : ''}">${left < 0 ? `LATE ${fmt(-left)}` : fmt(left)}</span>`);
        if (j.t > j.allowed * 2) {
          // they've had enough: out at the next standstill, or right away if stopped
          if (v.speed < 2) {
            this.alight(j, v);
            this.lose(j, 'Far too slow: they got out');
            this.finish();
          }
          break;
        }
        if (dDest < 20 && v.speed < 1.5) {
          this.alight(j, v);
          this.pay(j, v);
          this.finish();
        }
        break;
      }
    }
    // the passenger walks off after getting out
    if (this.leaving) {
      const l = this.leaving;
      l.t += dt;
      l.ch.speed = 1.3;
      l.ch.mesh.position.x += Math.sin(l.yaw) * 1.3 * dt;
      l.ch.mesh.position.z += Math.cos(l.yaw) * 1.3 * dt;
      l.ch.acc += dt;
      if (l.ch.acc > 1 / 30) {
        l.ch.update(l.ch.acc, T);
        l.ch.acc = 0;
      }
      if (l.t > 3.4) this.leaving = null;
    }
  }

  /** In the back seat: name a place across town and start the clock. */
  depart(j, v) {
    const g = this.game;
    const all = this.destinations();
    const far = all.filter((d) => {
      const km = Math.hypot(d.x - v.pos.x, d.z - v.pos.z);
      return km > 700 && km < 2600;
    });
    const list = far.length ? far : all;
    const d = list[Math.floor(Math.random() * list.length)];
    const route = this.world.graph.route(v.pos.x, v.pos.z, d.x, d.z);
    const len = Math.max(300, routeLength(route));
    j.state = 'ride';
    j.dest = d.n;
    j.dx = d.x;
    j.dz = d.z;
    j.km = len / 1000;
    j.allowed = Math.round(len / this.cab.speed + 25);
    j.t = 0;
    j.knocks = 0;
    j.knockT = 0;
    j.hurried = false;
    this.game.setWaypointQuiet({ x: d.x, z: d.z, job: true });
    g.hud.say(j.ch, pick(LINES.fareIn), 2.6);
    g.hud.notify(`TO ${d.n.toUpperCase()}`, `${j.km.toFixed(1)} km by road · ${fmt(j.allowed)} on the clock · ₹${Math.round(this.cab.base + this.cab.perKm * j.km)} fare`, '#ffd21f');
  }

  /** Passenger out; the next fare turns up shortly. */
  finish() {
    const j = this.job;
    if (j.ch) {
      this.leaving = { ch: j.ch, t: 0, yaw: j.walkYaw };
      this.dropPassenger(false);
    }
    this.job = null;
    this.waitT = 4;
    this.game.clearWaypoint();
  }

  blips() {
    const j = this.job;
    if (!this.on || !j || j.state !== 'pickup') return [];
    return [{ x: j.x, z: j.z, color: '#ffd21f', r: 8, always: true }];
  }
}
