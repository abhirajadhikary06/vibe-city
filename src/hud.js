import { N, lineAt, ROAD, HALF, COAST_X, SHORE_X, BOUND, PIER } from './world.js';
import * as THREE from 'three';
import { clamp } from './utils.js';
import { EMOTE_LIST, EMOTE_LABELS } from './character.js';
import { SLOTS, WEAPONS } from './weapons.js';

const $ = (id) => document.getElementById(id);
const MAP_SIZE = 1400; // 1px = 1m, centred on the origin
const MAP_HALF = MAP_SIZE / 2;

export class HUD {
  constructor(world) {
    this.el = {
      hud: $('hud'),
      money: $('money'),
      clock: $('clock'),
      mission: $('mission'),
      notify: $('notify'),
      drift: $('drift'),
      countdown: $('countdown'),
      hint: $('hint'),
      title: $('title'),
      loading: $('loading'),
      play: $('play'),
      pause: $('pause'),
    };
    this.mm = $('minimap').getContext('2d');
    this.sp = $('speedo').getContext('2d');
    this.shownMoney = 0;
    this.targetMoney = 0;
    this.map = this.buildMap(world);
    this.mapHalf = MAP_HALF;
    this.route = null;
    this.waypointEl = $('wpdist');
    this.driftEls = { score: this.el.drift.querySelector('.score'), mult: this.el.drift.querySelector('.mult') };
    this.bubbleRoot = $('bubbles');
    this.bubbles = [];
    this.promptEl = $('prompt');
    this.speedoEl = $('speedo');
    this.v3 = new THREE.Vector3();
    this.buildWheel();
    this.cw = {
      weapon: $('weapon'),
      wname: $('weapon').querySelector('.wname'),
      wammo: $('weapon').querySelector('.wammo'),
      health: $('health'),
      hfill: $('health').querySelector('.fill'),
      cross: $('crosshair'),
      hit: $('hitmark'),
      scope: $('scope'),
      dmg: $('dmg'),
      dmgdir: $('dmgdir'),
    };
    this.dmgFlash = 0;
  }

  /** Rail lines, the metro and their stations drawn onto the map. */
  drawTransit(lines, stations) {
    const g = this.map.getContext('2d');
    const X = (v) => v + MAP_HALF;
    for (const { pts, color, width, dash } of lines) {
      g.save();
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(dash || []);
      g.beginPath();
      pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
      g.stroke();
      g.restore();
    }
    for (const { x, z, color, label } of stations) {
      g.beginPath();
      g.arc(X(x), X(z), 6, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#fff';
      g.stroke();
      if (label) {
        g.fillStyle = '#fff';
        g.font = 'bold 9px Rajdhani';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, X(x), X(z) + 0.5);
      }
    }
  }
  waypoint(dist) {
    const t = dist == null ? '' : dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
    if (t !== this._wp) {
      this.waypointEl.textContent = this._wp = t;
      this.waypointEl.classList.toggle('hidden', !t);
    }
  }

  /* ---------- Weapon wheel ---------- */
  setWeaponIcons(icons) {
    this.icons = icons;
    const w = $('wwheel');
    this.wwEl = w;
    this.wwName = w.querySelector('.wwname');
    this.wwAmmo = w.querySelector('.wwammo');
    this.wwItems = SLOTS.map((id, i) => {
      const a = (i / SLOTS.length) * Math.PI * 2 - Math.PI / 2;
      const el = document.createElement('div');
      el.className = 'wwitem';
      el.innerHTML = `<span class="wwk">${i + 1}</span><img src="${icons[id] || ''}" alt="" /><span class="wwa"></span>`;
      el.style.left = `${50 + Math.cos(a) * 37}%`;
      el.style.top = `${50 + Math.sin(a) * 37}%`;
      w.appendChild(el);
      return { id, a, el, ammo: el.querySelector('.wwa') };
    });
  }
  /** Radial weapon picker. Returns the highlighted weapon id. */
  weaponWheel(open, vec, arsenal) {
    if (!this.wwEl) return null;
    this.wwEl.classList.toggle('hidden', !open);
    if (!open) return this._wwSel || null;
    let sel = this._wwOpen ? this._wwSel : arsenal.cur;
    this._wwOpen = true;
    if (Math.hypot(vec.x, vec.y) > 30) {
      const a = Math.atan2(vec.y, vec.x);
      let best = 9;
      for (const it of this.wwItems) {
        const d = Math.abs(Math.atan2(Math.sin(a - it.a), Math.cos(a - it.a)));
        if (d < best) {
          best = d;
          sel = it.id;
        }
      }
    }
    this._wwSel = sel;
    for (const it of this.wwItems) {
      it.el.classList.toggle('sel', it.id === sel);
      it.el.classList.toggle('cur', it.id === arsenal.cur);
      const c = arsenal.ammo[it.id];
      it.ammo.textContent = c ? `${c.mag} / ${c.reserve}` : '∞';
      it.el.classList.toggle('empty', !!c && c.mag + c.reserve === 0);
    }
    const w = WEAPONS[sel];
    this.wwName.textContent = w.name.toUpperCase();
    const c = arsenal.ammo[sel];
    this.wwAmmo.textContent = c ? `${c.mag + c.reserve} rounds` : w.kind === 'melee' ? 'Melee' : '';
    return sel;
  }
  closeWeaponWheel() {
    this._wwOpen = false;
    this._wwSel = null;
    if (this.wwEl) this.wwEl.classList.add('hidden');
  }

  /* ---------- Combat ---------- */
  /** Weapon name + ammo readout, crosshair and scope. state from Player each frame. */
  combat({ name, mag, reserve, gun, reloading, cross, dot, target, aiming, scoped, spread, hp, dead }) {
    const c = this.cw;
    if (name !== this._wname) {
      c.wname.textContent = this._wname = name;
      const id = SLOTS.find((k) => WEAPONS[k].name.toUpperCase() === name);
      if (this.icons && id) c.weapon.querySelector('.wicon').src = this.icons[id];
      c.weapon.classList.remove('flash');
      void c.weapon.offsetWidth;
      c.weapon.classList.add('flash');
    }
    const ammo = gun ? (reloading ? 'RELOADING' : `${mag}<span> / ${reserve}</span>`) : '';
    if (ammo !== this._ammo) {
      c.wammo.innerHTML = this._ammo = ammo;
      c.wammo.classList.toggle('low', gun && !reloading && mag <= 2);
    }
    if (cross !== this._cross) c.cross.classList.toggle('hidden', !(this._cross = cross));
    if (dot !== this._dot) c.cross.classList.toggle('dot', (this._dot = dot));
    if (target !== this._target) c.cross.classList.toggle('target', (this._target = target));
    if (cross) {
      const gap = Math.round(aiming ? 3 + spread * 300 : 7 + spread * 500);
      if (gap !== this._gap) c.cross.style.setProperty('--gap', `${(this._gap = gap)}px`);
    }
    if (scoped !== this._scoped) c.scope.classList.toggle('hidden', !(this._scoped = scoped));
    const hpw = Math.max(0, Math.round(hp));
    if (hpw !== this._hp) {
      c.hfill.style.width = `${(this._hp = hpw)}%`;
      c.health.classList.toggle('low', hpw < 30);
    }
    if (dead !== this._dead) this.el.hud.classList.toggle('dead', (this._dead = dead));
  }
  hitmark(kill) {
    const h = this.cw.hit;
    h.classList.remove('on', 'kill');
    void h.offsetWidth;
    h.classList.add('on');
    if (kill) h.classList.add('kill');
  }
  /** Red edge flash plus an arc pointing at where the damage came from (angle relative to the camera). */
  damage(angle, amount) {
    this.dmgFlash = Math.min(1, this.dmgFlash + amount / 30);
    if (!Number.isFinite(angle) || amount < 2) return;
    const a = document.createElement('div');
    a.className = 'dmgarc';
    a.style.transform = `rotate(${-angle}rad)`;
    this.cw.dmgdir.appendChild(a);
    while (this.cw.dmgdir.children.length > 4) this.cw.dmgdir.firstChild.remove();
    setTimeout(() => a.remove(), 1100);
  }

  /* ---------- Speech bubbles ---------- */
  say(ch, text, dur = 2.6) {
    const old = this.bubbles.find((b) => b.ch === ch);
    if (old) {
      old.el.remove();
      this.bubbles.splice(this.bubbles.indexOf(old), 1);
    }
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    this.bubbleRoot.appendChild(el);
    this.bubbles.push({ ch, el, until: performance.now() + dur * 1000 });
  }
  updateBubbles(camera) {
    const now = performance.now();
    const w = innerWidth;
    const h = innerHeight;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      if (now > b.until) {
        b.el.remove();
        this.bubbles.splice(i, 1);
        continue;
      }
      const p = b.ch.bones.head.getWorldPosition(this.v3);
      p.y += 0.45;
      const dist = p.distanceTo(camera.position);
      p.project(camera);
      const vis = p.z < 1 && dist < 45 && b.ch.mesh.visible;
      b.el.style.display = vis ? 'block' : 'none';
      if (vis) {
        const sc = clamp(14 / dist, 0.55, 1.1);
        b.el.style.transform = `translate(${(p.x * 0.5 + 0.5) * w}px, ${(-p.y * 0.5 + 0.5) * h}px) translate(-50%, -100%) scale(${sc})`;
      }
    }
  }

  /* ---------- Context prompt ---------- */
  prompt(p) {
    const html = p ? `<span class="key">${p.key}</span>${p.text}${p.key2 ? `<span class="key k2">${p.key2}</span>${p.text2}` : ''}` : '';
    if (html !== this._prompt) {
      this.promptEl.innerHTML = html;
      this.promptEl.classList.toggle('hidden', !p);
      this._prompt = html;
    }
  }

  /* ---------- Gesture wheel ---------- */
  buildWheel() {
    const w = $('wheel');
    this.wheelEl = w;
    this.wheelItems = EMOTE_LIST.map((name, i) => {
      const a = (i / EMOTE_LIST.length) * Math.PI * 2 - Math.PI / 2;
      const el = document.createElement('div');
      el.className = 'witem';
      el.textContent = EMOTE_LABELS[name];
      el.style.left = `${50 + Math.cos(a) * 36}%`;
      el.style.top = `${50 + Math.sin(a) * 36}%`;
      w.appendChild(el);
      return { name, a, el };
    });
  }
  wheel(open, vec) {
    this.wheelEl.classList.toggle('hidden', !open);
    let sel = null;
    if (Math.hypot(vec.x, vec.y) > 30) {
      const a = Math.atan2(vec.y, vec.x);
      let best = 9;
      for (const it of this.wheelItems) {
        const d = Math.abs(Math.atan2(Math.sin(a - it.a), Math.cos(a - it.a)));
        if (d < best) {
          best = d;
          sel = it.name;
        }
      }
    }
    for (const it of this.wheelItems) it.el.classList.toggle('sel', it.name === sel);
    return sel;
  }

  buildMap(world) {
    const c = document.createElement('canvas');
    c.width = c.height = MAP_SIZE;
    const g = c.getContext('2d');
    const X = (x) => x + MAP_HALF;
    g.fillStyle = '#1e2a1c';
    g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    g.fillStyle = '#c9ad7a';
    g.fillRect(X(COAST_X), 0, SHORE_X - COAST_X, MAP_SIZE);
    g.fillStyle = '#123651';
    g.fillRect(X(SHORE_X), 0, MAP_SIZE, MAP_SIZE);
    for (const b of world.blocks) {
      g.fillStyle = b.type === 'park' ? '#2f5a2a' : b.type === 'downtown' ? '#3a3f4b' : b.type === 'beach' ? '#5a4552' : '#363a42';
      g.fillRect(X(b.x0), X(b.z0), b.x1 - b.x0, b.z1 - b.z0);
    }
    g.fillStyle = '#9aa0aa';
    for (let k = 0; k <= N; k++) {
      g.fillRect(X(lineAt(k) - ROAD / 2), X(-HALF - ROAD / 2), ROAD, HALF * 2 + ROAD);
      g.fillRect(X(-HALF - ROAD / 2), X(lineAt(k) - ROAD / 2), HALF * 2 + ROAD, ROAD);
    }
    g.fillStyle = '#9b7b5a';
    g.fillRect(X(PIER.x0), X(-PIER.hw), PIER.x1 - PIER.x0, PIER.hw * 2);
    g.fillRect(X(PIER.plat0), X(-PIER.phw), PIER.plat1 - PIER.plat0, PIER.phw * 2);
    g.strokeStyle = '#2f4a22';
    g.lineWidth = 3;
    g.strokeRect(X(-BOUND), X(-BOUND), COAST_X + BOUND, BOUND * 2);
    return c;
  }

  /* ---------- Title / loading ---------- */
  setLoading(p, text) {
    this.el.loading.querySelector('.fill').style.width = `${Math.round(p * 100)}%`;
    this.el.loading.querySelector('.text').textContent = text;
  }
  ready() {
    this.el.loading.classList.add('hidden');
    this.el.play.classList.remove('hidden');
  }
  start() {
    this.el.title.classList.add('out');
    this.el.hud.classList.remove('hidden');
    setTimeout(() => this.el.hint.classList.add('fade'), 12000);
  }
  setPaused(p) {
    this.el.pause.classList.toggle('hidden', !p);
  }

  /* ---------- Messages ---------- */
  setMoney(v, instant = false) {
    this.targetMoney = v;
    if (instant) this.shownMoney = v;
    this.el.money.classList.add('bump');
    clearTimeout(this._bump);
    this._bump = setTimeout(() => this.el.money.classList.remove('bump'), 160);
  }
  notify(title, sub = '', color = '#ffd36b') {
    const n = document.createElement('div');
    n.className = 'note';
    n.innerHTML = `<div class="nt" style="color:${color}">${title}</div>${sub ? `<div class="ns">${sub}</div>` : ''}`;
    this.el.notify.appendChild(n);
    while (this.el.notify.children.length > 3) this.el.notify.firstChild.remove();
    setTimeout(() => n.remove(), 3300);
  }
  mission(html) {
    if (!html) {
      this.el.mission.classList.add('hidden');
      return;
    }
    this.el.mission.classList.remove('hidden');
    if (this._mission !== html) {
      this.el.mission.innerHTML = html;
      this._mission = html;
    }
  }
  countdown(text) {
    const c = this.el.countdown;
    c.textContent = text;
    c.classList.remove('pop');
    void c.offsetWidth;
    if (text) c.classList.add('pop');
  }
  drift(show, score = 0, mult = 1) {
    this.el.drift.classList.toggle('hidden', !show);
    if (show) {
      this.driftEls.score.textContent = Math.floor(score).toLocaleString();
      this.driftEls.mult.textContent = `x${mult.toFixed(1)}`;
    }
  }

  /* ---------- Per-frame ---------- */
  update(dt, player, hours, blips, vehicle, camera) {
    if (this.dmgFlash > 0.001 || this._flash) {
      this.dmgFlash *= Math.exp(-2.5 * dt);
      const o = this.dmgFlash.toFixed(2);
      if (o !== this._flash) this.cw.dmg.style.opacity = this._flash = o;
    }
    if (this.shownMoney !== this.targetMoney) {
      const d = this.targetMoney - this.shownMoney;
      this.shownMoney += Math.sign(d) * Math.max(1, Math.abs(d) * Math.min(1, dt * 6));
      if (Math.abs(this.targetMoney - this.shownMoney) < 1) this.shownMoney = this.targetMoney;
    }
    const money = `$${Math.round(this.shownMoney).toLocaleString()}`;
    if (money !== this._money) this.el.money.textContent = this._money = money;
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const clock = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    if (clock !== this._clock) this.el.clock.textContent = this._clock = clock;
    // Canvas widgets redraw at ~30 Hz — plenty for a HUD, half the CPU
    this._hudT = (this._hudT || 0) + dt;
    if (this._hudT >= 1 / 30) {
      this._hudT = 0;
      this.drawMinimap(player, blips());
      if (!!vehicle !== this._veh) {
        this._veh = !!vehicle;
        this.speedoEl.classList.toggle('hidden', !vehicle);
      }
      if (vehicle) this.drawSpeedo(vehicle);
    }
    if (this.bubbles.length) this.updateBubbles(camera);
  }

  drawMinimap(p, blips) {
    const g = this.mm;
    const S = 440;
    const C = S / 2;
    const zoom = 1.7 - clamp(p.speed / 60, 0, 1) * 0.6;
    const rot = -Math.PI / 2 - Math.atan2(Math.cos(p.yaw), Math.sin(p.yaw));
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(C, C, C, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#123651';
    g.fillRect(0, 0, S, S);
    g.translate(C, C);
    g.rotate(rot);
    g.scale(zoom, zoom);
    g.translate(-(p.pos.x + MAP_HALF), -(p.pos.z + MAP_HALF));
    g.drawImage(this.map, 0, 0);
    // GPS route to the waypoint
    if (this.route && this.route.length > 1) {
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const [w, col] of [[11, 'rgba(0,0,0,0.5)'], [6, '#ff3fa4']]) {
        g.strokeStyle = col;
        g.lineWidth = w / zoom;
        g.beginPath();
        this.route.forEach(([x, z], i) => (i ? g.lineTo(x + MAP_HALF, z + MAP_HALF) : g.moveTo(x + MAP_HALF, z + MAP_HALF)));
        g.stroke();
      }
    }
    g.restore();

    // Blips (clamped to the rim)
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    for (const b of blips) {
      const dx = (b.x - p.pos.x) * zoom;
      const dz = (b.z - p.pos.z) * zoom;
      let sx = dx * cs - dz * sn;
      let sy = dx * sn + dz * cs;
      const d = Math.hypot(sx, sy);
      const maxR = C - 16;
      const edge = d > maxR;
      if (edge) {
        if (!b.always) continue;
        sx *= maxR / d;
        sy *= maxR / d;
      }
      g.beginPath();
      g.arc(C + sx, C + sy, b.r || 8, 0, Math.PI * 2);
      g.fillStyle = b.color;
      g.shadowColor = b.color;
      g.shadowBlur = 12;
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 2.5;
      g.strokeStyle = '#000';
      g.stroke();
      if (b.label) {
        g.fillStyle = '#000';
        g.font = 'bold 13px Rajdhani';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(b.label, C + sx, C + sy + 1);
      }
    }
    // Player arrow
    g.save();
    g.translate(C, C);
    g.beginPath();
    g.moveTo(0, -16);
    g.lineTo(11, 12);
    g.lineTo(0, 6);
    g.lineTo(-11, 12);
    g.closePath();
    g.fillStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = 10;
    g.fill();
    g.restore();
    // North marker
    const nx = sn * (C - 18);
    const ny = -cs * (C - 18);
    g.fillStyle = '#fff';
    g.font = 'bold 22px Rajdhani';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', C + nx, C + ny);
  }

  drawSpeedo(p) {
    const g = this.sp;
    const S = 460;
    const C = S / 2;
    const R = 180;
    const kmh = p.speed * 3.6;
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    const t = clamp(kmh / 300, 0, 1);
    g.clearRect(0, 0, S, S);
    const bg = g.createRadialGradient(C, C, 40, C, C, R + 30);
    bg.addColorStop(0, 'rgba(10,8,20,0.65)');
    bg.addColorStop(1, 'rgba(10,8,20,0)');
    g.fillStyle = bg;
    g.beginPath();
    g.arc(C, C, R + 30, 0, Math.PI * 2);
    g.fill();
    g.lineCap = 'round';
    g.lineWidth = 16;
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.beginPath();
    g.arc(C, C, R, a0, a1);
    g.stroke();
    const grad = g.createLinearGradient(C - R, C, C + R, C);
    grad.addColorStop(0, '#38f3ff');
    grad.addColorStop(0.6, '#b45bff');
    grad.addColorStop(1, '#ff3fa4');
    g.strokeStyle = grad;
    g.shadowColor = '#ff3fa4';
    g.shadowBlur = 20;
    g.beginPath();
    g.arc(C, C, R, a0, a0 + (a1 - a0) * t);
    g.stroke();
    g.shadowBlur = 0;
    // ticks
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 3;
    for (let i = 0; i <= 15; i++) {
      const a = a0 + ((a1 - a0) * i) / 15;
      const r0 = i % 5 === 0 ? R - 34 : R - 26;
      g.beginPath();
      g.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
      g.lineTo(C + Math.cos(a) * (R - 16), C + Math.sin(a) * (R - 16));
      g.stroke();
    }
    // nitro arc
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.arc(C, C, R - 52, a0, a1);
    g.stroke();
    g.strokeStyle = p.nitroOn ? '#7fd8ff' : '#3a8bff';
    g.shadowColor = '#3a8bff';
    g.shadowBlur = p.nitroOn ? 18 : 6;
    g.beginPath();
    g.arc(C, C, R - 52, a0, a0 + (a1 - a0) * p.nitro);
    g.stroke();
    g.shadowBlur = 0;
    // numbers
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '110px "Bebas Neue"';
    g.fillText(String(Math.round(kmh)), C, C + 4);
    g.font = '600 26px Rajdhani';
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText('KM/H', C, C + 64);
    g.font = '44px "Bebas Neue"';
    g.fillStyle = '#ffd36b';
    g.fillText(p.gear < 0 ? 'R' : p.speed < 0.5 ? 'N' : String(p.gear), C, C + 120);
    g.font = '600 18px Rajdhani';
    g.fillStyle = '#7fd8ff';
    g.fillText('NITRO', C, C - 78);
  }
}
