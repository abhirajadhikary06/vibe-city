import * as THREE from 'three';
import * as T from './textures.js';

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

export class Gameplay {
  constructor(scene, world, hud, audio) {
    this.scene = scene;
    this.world = world;
    this.hud = hud;
    this.audio = audio;
    // Pocket money for fares and food when you're broke + job earnings
    let earned = 0;
    try {
      const p = JSON.parse(localStorage.getItem('kol_progress'));
      if (p && p.earned) earned = p.earned;
    } catch {
      /* ignore */
    }
    this.money = Math.max(store.get('nt_money', 0), 500 + earned);
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
        this.hud.notify(`+₹${p.value}`, 'Cash collected', '#7dffb0');
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
  }
}
