import * as THREE from 'three';
import * as T from './textures.js';
import { MAP } from './geo.js';

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  },
};

// Time trial round central Kolkata: each checkpoint snaps to the nearest main road
const RACE_START = 'Esplanade';
const RACE_ROUTE = ['Park Street', 'Victoria Memorial', "Saint Paul's Anglican Cathedral", 'Eden Gardens', 'BBD Bagh', 'Nakhoda Mosque', 'Esplanade'];
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

function labelSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '86px "Bebas Neue", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(text, 256, 68);
  g.fillStyle = color;
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(16, 4, 1);
  return s;
}

export class Gameplay {
  constructor(scene, world, hud, audio) {
    this.scene = scene;
    this.world = world;
    this.hud = hud;
    this.audio = audio;
    // Pocket money for fares and food when you're broke
    this.money = Math.max(store.get('nt_money', 0), 500);
    this.best = store.get('kol_best', null);
    hud.setMoney(this.money, true);
    const beamTex = T.beam();

    /* ---- Cash pickups ---- */
    const coinGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.14, 28).rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd36b, metalness: 1, roughness: 0.25, emissive: 0x6b4a00, emissiveIntensity: 1.2 });
    const beamGeo = new THREE.CylinderGeometry(0.9, 0.9, 36, 16, 1, true).translate(0, 18, 0);
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: new THREE.Color(0.4, 3, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55 });
    this.pickups = [];
    const spots = [...world.pickupSpots].sort(() => Math.random() - 0.5);
    this.spots = spots;
    for (let i = 0; i < 28; i++) {
      const g = new THREE.Group();
      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.position.y = 1.3;
      coin.castShadow = true;
      const b = new THREE.Mesh(beamGeo, beamMat);
      g.add(coin, b);
      scene.add(g);
      const p = { g, coin, active: true, timer: 0 };
      this.place(p, i);
      this.pickups.push(p);
    }

    /* ---- Ammo crates ---- */
    const crateGeo = new THREE.BoxGeometry(1.1, 0.7, 0.7);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.7, metalness: 0.2, emissive: 0x1a2a08, emissiveIntensity: 0.6 });
    const bandGeo = new THREE.BoxGeometry(1.12, 0.12, 0.72);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0x6b4a00, emissiveIntensity: 1.2 });
    const ammoBeam = new THREE.MeshBasicMaterial({ map: beamTex, color: new THREE.Color(3, 2.2, 0.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.45 });
    this.crates = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const crate = new THREE.Mesh(crateGeo, crateMat);
      crate.position.y = 0.9;
      crate.castShadow = true;
      crate.add(new THREE.Mesh(bandGeo, bandMat));
      g.add(crate, new THREE.Mesh(beamGeo, ammoBeam));
      scene.add(g);
      const p = { g, coin: crate, active: true, timer: 0 };
      this.place(p, 28 + i * 3);
      this.crates.push(p);
    }

    /* ---- Time trial ---- */
    const ringGeo = new THREE.CylinderGeometry(7, 7, 7, 40, 1, true).translate(0, 3.5, 0);
    this.startMarker = new THREE.Group();
    this.startMarker.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: beamTex, color: new THREE.Color(2, 0.3, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    const sl = labelSprite('TIME TRIAL', '#ff3fa4');
    sl.position.y = 10;
    this.startMarker.add(sl);
    const onRoad = (name) => {
      const p = MAP.pois.find((q) => q.n === name) || MAP.stations.find((q) => q.n.startsWith(name));
      const n = p && world.graph.nearest(p.x, p.z, 400, (e) => e.c <= 3 && !e.br);
      return n ? new THREE.Vector3(n.x, 0, n.z) : new THREE.Vector3();
    };
    this.startPos = onRoad(RACE_START);
    this.route = RACE_ROUTE.map(onRoad);
    this.startMarker.position.copy(this.startPos);
    scene.add(this.startMarker);

    this.cpMarker = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: beamTex, color: new THREE.Color(2, 1.5, 0.25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.cpMarker.visible = false;
    scene.add(this.cpMarker);

    // Floating arrow over the car pointing to the next checkpoint
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 1.2);
    arrowShape.lineTo(0.8, 0);
    arrowShape.lineTo(0.3, 0);
    arrowShape.lineTo(0.3, -0.9);
    arrowShape.lineTo(-0.3, -0.9);
    arrowShape.lineTo(-0.3, 0);
    arrowShape.lineTo(-0.8, 0);
    arrowShape.closePath();
    const ag = new THREE.ExtrudeGeometry(arrowShape, { depth: 0.2, bevelEnabled: false }).rotateX(-Math.PI / 2);
    this.arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.3, 0.3) }));
    this.arrow.visible = false;
    scene.add(this.arrow);

    this.race = { state: 'idle', t: 0, cp: 0, cd: 0, cooldown: 0 };
    this.drift = { active: false, score: 0, time: 0, grace: 0 };
  }

  place(p, i) {
    const s = this.spots[(i ?? Math.floor(Math.random() * this.spots.length)) % this.spots.length];
    p.g.position.set(s[0], s[1], s[2]);
    p.value = [100, 150, 250, 250, 500][Math.floor(Math.random() * 5)];
  }

  addMoney(v, note = null) {
    this.money += v;
    this.hud.setMoney(this.money);
    store.set('nt_money', this.money);
    if (note) {
      this.hud.notify(note, '', '#7dffb0');
      this.audio.pickup();
    }
  }

  blips() {
    const out = [];
    for (const p of this.pickups) if (p.active) out.push({ x: p.g.position.x, z: p.g.position.z, color: '#5dff9e', r: 6 });
    for (const p of this.crates) if (p.active) out.push({ x: p.g.position.x, z: p.g.position.z, color: '#ffd36b', r: 6 });
    if (this.race.state === 'idle') out.push({ x: this.startPos.x, z: this.startPos.z, color: '#ff3fa4', r: 10, always: true, label: 'T' });
    else if (this.cpMarker.visible) out.push({ x: this.cpMarker.position.x, z: this.cpMarker.position.z, color: '#ffd36b', r: 10, always: true, label: String(this.race.cp + 1) });
    return out;
  }

  update(dt, t, pl) {
    const f = pl.focus;
    const v = pl.driving ? pl.vehicle : null;
    /* ---- Pickups ---- */
    for (const p of this.pickups) {
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) {
          this.place(p);
          p.active = true;
          p.g.visible = true;
        }
        continue;
      }
      p.coin.rotation.y = t * 2.5 + p.g.position.x;
      p.coin.position.y = 1.3 + Math.sin(t * 2 + p.g.position.z) * 0.2;
      const dx = p.g.position.x - f.x;
      const dz = p.g.position.z - f.z;
      if (dx * dx + dz * dz < 9 && Math.abs(p.g.position.y - f.y) < 3) {
        p.active = false;
        p.g.visible = false;
        p.timer = 25;
        this.addMoney(p.value);
        this.audio.pickup();
        this.hud.notify(`+$${p.value}`, 'Cash collected', '#7dffb0');
      }
    }

    for (const p of this.crates) {
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) {
          this.place(p);
          p.active = true;
          p.g.visible = true;
        }
        continue;
      }
      p.coin.rotation.y = t * 1.2 + p.g.position.x;
      p.coin.position.y = 0.9 + Math.sin(t * 2 + p.g.position.z) * 0.12;
      const dx = p.g.position.x - f.x;
      const dz = p.g.position.z - f.z;
      if (!v && !pl.dead && dx * dx + dz * dz < 4 && Math.abs(p.g.position.y - f.y) < 3) {
        p.active = false;
        p.g.visible = false;
        p.timer = 45;
        pl.arsenal.refill();
        this.audio.reload();
        this.hud.notify('AMMO', 'Every gun topped up', '#ffd36b');
      }
    }

    /* ---- Drift scoring ---- */
    const d = this.drift;
    const player = v || { speed: 0, slip: 0, vf: 0, impact: 0 };
    const drifting = !!v && player.speed > 11 && player.slip > 0.22 && player.vf > 0;
    if (player.impact > 7 && d.active) {
      d.active = false;
      this.hud.drift(false);
      this.hud.notify('DRIFT LOST', 'You crashed', '#ff5f6d');
    }
    if (drifting) {
      if (!d.active) {
        d.active = true;
        d.score = 0;
        d.time = 0;
      }
      d.grace = 0.7;
      d.time += dt;
      const mult = 1 + Math.min(4, d.time * 0.6);
      d.score += dt * player.speed * player.slip * 18 * mult;
      player.nitro = Math.min(1, player.nitro + dt * 0.08);
      this.hud.drift(true, d.score, mult);
    } else if (d.active) {
      d.grace -= dt;
      if (d.grace <= 0) {
        d.active = false;
        this.hud.drift(false);
        const cash = Math.floor(d.score / 10);
        if (cash >= 10) {
          this.addMoney(cash);
          this.hud.notify(`DRIFT +$${cash}`, `${Math.floor(d.score).toLocaleString()} pts`, '#38f3ff');
        }
      }
    }

    /* ---- Time trial ---- */
    const r = this.race;
    this.startMarker.rotation.y = t * 0.3;
    this.cpMarker.rotation.y = -t * 0.5;
    r.cooldown -= dt;
    const distStart = Math.hypot(f.x - this.startPos.x, f.z - this.startPos.z);
    if (r.state === 'idle') {
      this.startMarker.visible = true;
      if (distStart < 7 && r.cooldown <= 0 && !v) {
        if (!this.footWarned) this.hud.notify('TIME TRIAL', 'Grab a vehicle first', '#ff3fa4');
        this.footWarned = true;
      } else if (distStart > 12) this.footWarned = false;
      if (distStart < 7 && r.cooldown <= 0 && v) {
        this.raceCar = v;
        r.state = 'countdown';
        r.cd = 3.999;
        r.lastBeep = 4;
        v.locked = true;
        this.startMarker.visible = false;
        this.hud.notify('TIME TRIAL', 'Hit all 8 checkpoints. Any route you like.', '#ff3fa4');
      }
    } else if (r.state === 'countdown') {
      r.cd -= dt;
      const n = Math.ceil(r.cd);
      if (n !== r.lastBeep) {
        r.lastBeep = n;
        if (n > 0) {
          this.hud.countdown(String(n));
          this.audio.beep(false);
        } else {
          this.hud.countdown('GO!');
          this.audio.beep(true);
        }
      }
      if (r.cd <= 0) {
        r.state = 'run';
        r.t = 0;
        r.cp = 0;
        this.raceCar.locked = false;
        this.setCheckpoint();
      }
    } else if (r.state === 'run') {
      r.t += dt;
      const cp = this.cpMarker.position;
      const dist = Math.hypot(f.x - cp.x, f.z - cp.z);
      if (dist < 8.5) {
        r.cp++;
        this.audio.beep(true);
        if (r.cp >= RACE_ROUTE.length) this.finishRace();
        else this.setCheckpoint();
      }
      this.hud.mission(`TIME TRIAL<span class="cp">CP ${Math.min(r.cp + 1, RACE_ROUTE.length)}/${RACE_ROUTE.length}</span><span class="t">${fmt(r.t)}</span>${this.best ? `<span class="cp" style="color:#aaa">BEST ${fmt(this.best)}</span>` : ''}`);
      // Arrow
      this.arrow.visible = true;
      this.arrow.position.set(f.x, f.y + 3.4 + Math.sin(t * 4) * 0.1, f.z);
      this.arrow.rotation.y = Math.atan2(cp.x - f.x, cp.z - f.z) + Math.PI;
      if (r.t > 720) this.cancelRace('Out of time');
    }
  }

  setCheckpoint() {
    this.cpMarker.position.copy(this.route[this.race.cp]);
    this.cpMarker.visible = true;
  }

  finishRace() {
    const r = this.race;
    const t = r.t;
    const record = !this.best || t < this.best;
    if (record) {
      this.best = t;
      store.set('kol_best', t);
    }
    const reward = Math.max(500, Math.round(9000 - t * 15));
    this.addMoney(reward);
    this.audio.fanfare();
    this.hud.notify(record ? 'NEW RECORD!' : 'FINISHED', `${fmt(t)} · +$${reward}`, '#ffd36b');
    this.endRace();
  }

  cancelRace(why) {
    this.hud.notify('TRIAL FAILED', why, '#ff5f6d');
    this.endRace();
  }

  endRace() {
    const r = this.race;
    r.state = 'idle';
    r.cooldown = 8;
    this.cpMarker.visible = false;
    this.arrow.visible = false;
    this.hud.mission(null);
  }
}
