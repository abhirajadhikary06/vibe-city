import * as THREE from 'three';
import { Character, randomLook } from './character.js';
import { COAST_X, SHORE_X, HALF } from './world.js';
import { clamp, damp, dampAngle } from './utils.js';
import { OFFS } from './car.js';

export const LINES = {
  greet: ['Hey there, sunshine!', 'Nice shirt, man.', 'Lookin’ sharp!', 'What’s up?', 'Beautiful night, huh?', 'Hey! Love the shades.', 'Totally radical!'],
  talk: [
    'Heard the Ferris wheel lights up like a disco at night.',
    'This town never sleeps, and neither do I.',
    'I’m saving up for a convertible. Pink, obviously.',
    'Don’t drive on the pier too fast. Trust me.',
    'You look like you’re from out of town.',
    'Someone’s been drifting on Ocean Drive again.',
    'They say the best sunsets are from the beach.',
    'My cousin runs time trials. Says the record is unbeatable.',
    'Have you tried the radio? Pure synth heaven.',
    'Is it just me or is everything neon here?',
  ],
  tip: ['Here, buy yourself something nice.', 'Take this, you made my day!', 'You seem cool. Have a few bucks.'],
  playerTalk: ['Hey, how’s it going?', 'Nice evening, right?', 'What’s good around here?', 'Love this city.', 'You come here often?'],
  flee: ['Aaah!', 'Somebody help!', 'Are you crazy?!', 'Get away from me!', 'Call the cops!'],
  hijack: ['Hey! That’s my car!', 'Not my ride!', 'I just washed that!', 'Unbelievable!'],
  honk: ['Watch it!', 'Learn to drive!', 'Whoa, buddy!', 'Hey, careful!'],
  punch: ['Ow!', 'What was that for?!', 'Ugh!'],
  dance: ['Ooh, I love this one!', 'Let’s go!', 'Party time!', 'Yeah!'],
  wave: ['Hey!', 'Hi there!', 'Yo!', 'Heyyy!'],
  cheer: ['Woo!', 'Yeah, baby!', 'Alright!'],
  flex: ['Okay, Mr. Muscles.', 'Impressive!', 'Wow, gym much?'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* ---------- Walking paths ---------- */
function rectPath(b) {
  const d = 2.4;
  const x0 = b.x0 + d;
  const x1 = b.x1 - d;
  const z0 = b.z0 + d;
  const z1 = b.z1 - d;
  const L = x1 - x0;
  const D = z1 - z0;
  return {
    len: 2 * (L + D),
    at(s, out) {
      s = ((s % this.len) + this.len) % this.len;
      if (s < L) out.set(x0 + s, z0);
      else if (s < L + D) out.set(x1, z0 + s - L);
      else if (s < 2 * L + D) out.set(x1 - (s - L - D), z1);
      else out.set(x0, z1 - (s - 2 * L - D));
      return out;
    },
    nearest(x, z) {
      const cx = clamp(x, x0, x1);
      const cz = clamp(z, z0, z1);
      const opts = [
        [Math.abs(z - z0), cx - x0],
        [Math.abs(x - x1), L + (cz - z0)],
        [Math.abs(z - z1), L + D + (x1 - cx)],
        [Math.abs(x - x0), 2 * L + D + (z1 - cz)],
      ];
      opts.sort((a, b) => a[0] - b[0]);
      return opts[0][1];
    },
  };
}
function beachPath() {
  const x = COAST_X + 6 + Math.random() * (SHORE_X - COAST_X - 12);
  const z0 = -HALF;
  const len = HALF * 2;
  return {
    len: len * 2,
    at(s, out) {
      s = ((s % this.len) + this.len) % this.len;
      return out.set(x, s < len ? z0 + s : z0 + 2 * len - s);
    },
    nearest(px, pz) {
      return clamp(pz - z0, 0, len);
    },
  };
}

/* =========================================================
   Pedestrians
   ========================================================= */
export class Peds {
  constructor(scene, world, hud, audio, count = 38) {
    this.scene = scene;
    this.world = world;
    this.hud = hud;
    this.audio = audio;
    this.list = [];
    this.tmp = new THREE.Vector2();
    this.paths = world.blocks.map((b) => ({ path: rectPath(b), cx: b.cx, cz: b.cz }));
    for (let i = 0; i < count; i++) {
      const ch = new Character(scene, randomLook());
      const n = { ch, x: 0, z: 0, y: 0, yaw: 0, state: 'walk', timer: 0, vx: 0, vz: 0, speed: 1.3, dir: 1, s: 0, path: null, frame: i };
      this.list.push(n);
    }
    this.focus = null;
  }

  spawnAll(focus) {
    for (const n of this.list) this.respawn(n, focus, 0, 140);
  }

  respawn(n, focus, minD = 50, maxD = 150) {
    let p = null;
    for (let tries = 0; tries < 30 && !p; tries++) {
      if (Math.random() < 0.18 && focus.x > 150) {
        p = beachPath();
        break;
      }
      const c = this.paths[Math.floor(Math.random() * this.paths.length)];
      const d = Math.hypot(c.cx - focus.x, c.cz - focus.z);
      if (d >= minD && d <= maxD) p = c.path;
    }
    if (!p) p = this.paths[Math.floor(Math.random() * this.paths.length)].path;
    n.path = p;
    n.s = Math.random() * p.len;
    n.dir = Math.random() < 0.5 ? 1 : -1;
    n.speed = 1.1 + Math.random() * 0.5;
    n.state = 'walk';
    n.timer = 4 + Math.random() * 14;
    p.at(n.s, this.tmp);
    n.x = this.tmp.x;
    n.z = this.tmp.y;
    n.ch.mode = 'move';
    n.ch.stopEmote();
    n.ch.mesh.visible = true;
  }

  say(n, text, dur = 2.6) {
    this.hud.say(n.ch, text, dur);
  }

  nearest(x, z, r, filter = null) {
    let best = null;
    let bd = r * r;
    for (const n of this.list) {
      if (filter && !filter(n)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /* ---------- Reactions ---------- */
  face(n, x, z) {
    n.faceYaw = Math.atan2(x - n.x, z - n.z);
  }
  react(n, kind, from) {
    if (n.state === 'down' || n.state === 'flee') return;
    this.face(n, from.x, from.z);
    n.state = 'react';
    n.ch.speed = 0;
    n.timer = 2.6;
    const delay = 0.35;
    setTimeout(() => {
      if (n.state !== 'react') return;
      if (kind === 'wave') {
        n.ch.play('wave');
        this.say(n, pick(LINES.wave));
      } else if (kind === 'cheer') {
        n.ch.play('cheer');
        this.say(n, pick(LINES.cheer));
      } else if (kind === 'flex') {
        n.ch.play(Math.random() < 0.5 ? 'laugh' : 'thumbsUp');
        this.say(n, pick(LINES.flex));
      } else if (kind === 'point' || kind === 'shrug' || kind === 'laugh' || kind === 'thumbsUp') {
        n.ch.play(pick(['shrug', 'laugh', 'thumbsUp', 'wave']));
      }
    }, delay * 1000);
  }
  talk(n, from) {
    if (n.state === 'down' || n.state === 'flee') return null;
    this.face(n, from.x, from.z);
    n.state = 'react';
    n.ch.speed = 0;
    n.timer = 4.5;
    const tip = Math.random() < 0.18;
    const line = tip ? pick(LINES.tip) : Math.random() < 0.4 ? pick(LINES.greet) : pick(LINES.talk);
    setTimeout(() => {
      if (n.state !== 'react') return;
      n.ch.play('talk');
      this.say(n, line, 3.2);
    }, 1300);
    setTimeout(() => {
      if (n.state !== 'react') return;
      n.ch.play(pick(['wave', 'laugh', 'thumbsUp', 'shrug']));
    }, 3600);
    return tip ? 20 + Math.floor(Math.random() * 6) * 10 : 0;
  }
  danceParty(x, z, r) {
    let n = 0;
    for (const p of this.list) {
      if (p.state === 'down' || p.state === 'flee') continue;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 > r * r) continue;
      this.face(p, x, z);
      p.state = 'dance';
      p.timer = 9 + Math.random() * 3;
      p.ch.speed = 0;
      setTimeout(() => p.state === 'dance' && p.ch.play('dance'), 200 + Math.random() * 700);
      if (Math.random() < 0.5) setTimeout(() => this.say(p, pick(LINES.dance)), Math.random() * 1500);
      n++;
    }
    return n;
  }
  stopParty() {
    for (const p of this.list) if (p.state === 'dance') p.timer = Math.min(p.timer, Math.random() * 1.2);
  }
  panic(x, z, r, scream = true) {
    for (const p of this.list) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > r) continue;
      this.flee(p, x, z);
      if (scream && Math.random() < 0.35) this.say(p, pick(LINES.flee));
    }
  }
  flee(n, x, z) {
    n.state = 'flee';
    n.timer = 5 + Math.random() * 3;
    n.fleeYaw = Math.atan2(n.x - x, n.z - z) + (Math.random() - 0.5) * 0.8;
    n.ch.stopEmote();
  }
  knock(n, vx, vz, line = null) {
    n.state = 'down';
    n.timer = 3 + Math.random();
    n.vx = vx;
    n.vz = vz;
    n.ch.mode = 'down';
    n.ch.stopEmote();
    if (line) this.say(n, line);
  }
  /** Car-jacked driver: grab the farthest ped and drop them at the door. */
  spawnEjected(x, z, yaw, focus) {
    let far = null;
    let fd = -1;
    for (const n of this.list) {
      const d = Math.hypot(n.x - focus.x, n.z - focus.z);
      if (d > fd) {
        fd = d;
        far = n;
      }
    }
    far.x = x;
    far.z = z;
    far.yaw = yaw;
    const p = this.paths.reduce((a, b) => (Math.hypot(b.cx - x, b.cz - z) < Math.hypot(a.cx - x, a.cz - z) ? b : a));
    far.path = p.path;
    this.knock(far, Math.cos(yaw) * 3, -Math.sin(yaw) * 3, pick(LINES.hijack));
    far.timer = 1.4;
    return far;
  }

  /* ---------- Update ---------- */
  update(dt, T, ctx) {
    const { focus, foot, vehicles, camPos } = ctx;
    const tmp = this.tmp;
    for (const n of this.list) {
      const dFocus = Math.hypot(n.x - focus.x, n.z - focus.z);
      if (dFocus > 170 && n.state !== 'down') {
        this.respawn(n, focus);
        continue;
      }
      let moveSpeed = 0;
      let wantYaw = n.yaw;
      n.timer -= dt;
      switch (n.state) {
        case 'walk': {
          n.s += n.dir * n.speed * dt;
          n.path.at(n.s, tmp);
          const dx = tmp.x - n.x;
          const dz = tmp.y - n.z;
          if (dx * dx + dz * dz > 1e-6) wantYaw = Math.atan2(dx, dz);
          n.x = tmp.x;
          n.z = tmp.y;
          moveSpeed = n.speed;
          if (n.timer <= 0) {
            n.state = 'idle';
            n.timer = 3 + Math.random() * 6;
            const r = Math.random();
            if (r < 0.3) n.ch.play('phone');
            else if (r < 0.4 && n.path.len > 900) n.ch.play('dance');
          }
          break;
        }
        case 'idle':
          if (n.timer <= 0) {
            n.ch.stopEmote();
            n.state = 'walk';
            n.timer = 6 + Math.random() * 14;
            if (Math.random() < 0.3) n.dir *= -1;
          }
          break;
        case 'react':
        case 'dance':
          if (n.faceYaw !== undefined) wantYaw = n.faceYaw;
          if (n.timer <= 0) {
            n.ch.stopEmote();
            n.state = 'walk';
            n.timer = 5 + Math.random() * 10;
          }
          break;
        case 'flee': {
          wantYaw = n.fleeYaw;
          moveSpeed = 5.2;
          n.x += Math.sin(n.fleeYaw) * moveSpeed * dt;
          n.z += Math.cos(n.fleeYaw) * moveSpeed * dt;
          const hit = this.world.collideCircle(n.x, n.z, 0.35);
          if (hit) {
            n.x += hit.px;
            n.z += hit.pz;
            n.fleeYaw += (Math.random() < 0.5 ? 1 : -1) * 0.9;
          }
          if (n.timer <= 0) {
            n.state = 'return';
            n.s = n.path.nearest(n.x, n.z);
          }
          break;
        }
        case 'return': {
          n.path.at(n.s, tmp);
          const dx = tmp.x - n.x;
          const dz = tmp.y - n.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.3 || d > 80) {
            n.state = 'walk';
            n.timer = 5 + Math.random() * 10;
          } else {
            wantYaw = Math.atan2(dx, dz);
            moveSpeed = 1.6;
            n.x += (dx / d) * moveSpeed * dt;
            n.z += (dz / d) * moveSpeed * dt;
            const hit = this.world.collideCircle(n.x, n.z, 0.35);
            if (hit) {
              n.x += hit.px;
              n.z += hit.pz;
            }
          }
          break;
        }
        case 'down': {
          n.vx *= Math.exp(-3 * dt);
          n.vz *= Math.exp(-3 * dt);
          n.x += n.vx * dt;
          n.z += n.vz * dt;
          const hit = this.world.collideCircle(n.x, n.z, 0.4);
          if (hit) {
            n.x += hit.px;
            n.z += hit.pz;
          }
          if (n.timer <= 0) {
            n.ch.mode = 'move';
            n.state = 'flee';
            n.timer = 4;
            n.fleeYaw = n.yaw + Math.PI + (Math.random() - 0.5);
          }
          break;
        }
      }

      // Threat from moving physics vehicles: dodge-dive or get knocked
      if (n.state !== 'down') {
        for (const v of vehicles) {
          if (v.speed < 3.5) continue;
          const rx = n.x - v.pos.x;
          const rz = n.z - v.pos.z;
          const d2 = rx * rx + rz * rz;
          if (d2 > 200) continue;
          const fx = Math.sin(v.yaw);
          const fz = Math.cos(v.yaw);
          let hitCar = false;
          for (const o of OFFS) {
            if ((n.x - v.pos.x - fx * o) ** 2 + (n.z - v.pos.z - fz * o) ** 2 < 1.6) hitCar = true;
          }
          if (hitCar) {
            this.knock(n, v.vel.x * 0.7, v.vel.y * 0.7, pick(LINES.punch));
            v.vel.multiplyScalar(0.92);
            this.panic(n.x, n.z, 14, false);
            break;
          }
          const vv = v.speed * v.speed;
          const tc = -(-rx * v.vel.x + -rz * v.vel.y) / vv;
          if (tc > 0 && tc < 1.1) {
            const cx = rx - v.vel.x * tc;
            const cz = rz - v.vel.y * tc;
            if (cx * cx + cz * cz < 6.5) {
              // dive perpendicular to the car's path, away from it
              const px = -v.vel.y;
              const pz = v.vel.x;
              const side = cx * px + cz * pz > 0 ? 1 : -1;
              const l = Math.hypot(px, pz) || 1;
              this.knock(n, (px / l) * side * 7, (pz / l) * side * 7, Math.random() < 0.5 ? pick(LINES.honk) : null);
              n.timer = 1.3;
              break;
            }
          }
        }
      }

      // Keep out of the on-foot player
      if (foot) {
        const dx = n.x - foot.x;
        const dz = n.z - foot.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7 && d > 1e-3) {
          n.x += (dx / d) * (0.7 - d);
          n.z += (dz / d) * (0.7 - d);
        }
      }

      if (n.state !== 'down') n.yaw = dampAngle(n.yaw, wantYaw, 8, dt);
      n.ch.speed = damp(n.ch.speed, moveSpeed, 8, dt);
      n.y = damp(n.y, this.world.height(n.x, n.z), 12, dt);
      const m = n.ch.mesh;
      m.position.set(n.x, n.y, n.z);
      m.rotation.y = n.yaw;
      // Animation LOD: far peds update at lower rate
      const dc = Math.hypot(n.x - camPos.x, n.z - camPos.z);
      n.acc = (n.acc || 0) + dt;
      const vis = dc < 150;
      m.visible = vis;
      m.castShadow = dc < 45;
      const every = dc > 80 ? 4 : dc > 40 ? 3 : dc > 18 ? 2 : 1;
      if (vis && (ctx.frame + n.frame) % every === 0) {
        n.ch.update(n.acc, T);
        n.acc = 0;
      }
    }
  }
}
