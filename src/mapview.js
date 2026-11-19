import { clamp } from './utils.js';
import { routeLength, MAP } from './geo.js';

/*
 * Full-screen map (M): drag to pan, scroll to zoom, click to drop a waypoint,
 * right-click to clear it. The route along Kolkata's streets (one-way rules
 * included) is found by the road graph and drawn here and on the minimap.
 */

export { routeLength };

export class MapView {
  constructor(hud) {
    this.hud = hud;
    this.el = document.getElementById('bigmap');
    this.canvas = this.el.querySelector('canvas');
    this.g = this.canvas.getContext('2d');
    this.open = false;
    this.cx = 0;
    this.cz = 0;
    this.scale = 1;
    this.drag = null;
    this.hover = null;
    this.onWaypoint = null; // (point | null) => void
    // Place names: neighbourhoods when zoomed out, landmarks, stations and ghats closer in
    const seen = new Set();
    const tier = { town: 0, area: 0, airport: 0, landmark: 1, stadium: 1, station: 1, metro: 1, ghat: 2, market: 2, culture: 2, college: 3, hospital: 3, worship: 3, park: 3 };
    this.labels = [...MAP.pois, ...((MAP.region && MAP.region.places) || [])]
      .filter((p) => p.k in tier && !/^(drinking water|toilet)/i.test(p.n))
      .filter((p) => {
        const key = p.n.replace(/\s*\(.*?\)/, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((p) => ({ ...p, n: p.n.replace(/\s*\(line \d\)/i, ''), tier: tier[p.k] }));
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      this.hover = this.toWorld(e.clientX, e.clientY);
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
      this.cx = this.drag.cx - dx / this.scale;
      this.cz = this.drag.cz - dy / this.scale;
    });
    c.addEventListener('pointerup', (e) => {
      if (this.drag && !this.drag.moved && this.onWaypoint) this.onWaypoint(this.toWorld(e.clientX, e.clientY));
      this.drag = null;
    });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.onWaypoint) this.onWaypoint(null);
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.toWorld(e.clientX, e.clientY);
      this.scale = clamp(this.scale * Math.exp(-e.deltaY * 0.0015), 0.025, 8);
      const after = this.toWorld(e.clientX, e.clientY);
      this.cx += before.x - after.x;
      this.cz += before.z - after.z;
    });
    // Search: places, stations, ghats, landmarks
    const box = document.createElement('div');
    box.className = 'msearch';
    box.innerHTML = '<input type="text" placeholder="Search Kolkata: Esplanade, Howrah, College Street…" spellcheck="false" /><div class="mresults"></div>';
    this.el.appendChild(box);
    this.searchInput = box.querySelector('input');
    this.results = box.querySelector('.mresults');
    this.searchInput.addEventListener('input', () => this.search(this.searchInput.value));
    this.searchInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && this.hits && this.hits[0]) this.go(this.hits[0]);
      if (e.key === 'Escape') this.searchInput.blur();
    });
    for (const [sel, f] of [['.zin', 1.4], ['.zout', 1 / 1.4]]) this.el.querySelector(sel).addEventListener('click', () => (this.scale = clamp(this.scale * f, 0.025, 8)));
  }

  /** Destination-picking mode (hiring a ride): a banner, and the next click is the answer. */
  setPick(text) {
    if (!this.pickEl) {
      this.pickEl = document.createElement('div');
      this.pickEl.className = 'mpick';
      this.el.appendChild(this.pickEl);
    }
    this.pickEl.textContent = text || '';
    this.pickEl.classList.toggle('hidden', !text);
    if (text) setTimeout(() => this.searchInput.focus(), 50);
  }

  /** More places for labels and search: metro stations, tram stops, railway stations. */
  addPlaces(list) {
    const have = new Set(this.labels.map((l) => l.n.toLowerCase()));
    for (const p of list) {
      if (have.has(p.n.toLowerCase())) continue;
      have.add(p.n.toLowerCase());
      this.labels.push(p);
    }
  }

  search(q) {
    q = q.trim().toLowerCase();
    this.results.innerHTML = '';
    this.hits = [];
    if (q.length < 2) return;
    const KIND = { town: 'Town', airport: 'Airport', culture: 'Culture', metro: 'Metro', station: 'Railway', tram: 'Tram stop', ghat: 'Ghat', landmark: 'Landmark', area: 'Area', market: 'Market', worship: 'Place of worship', park: 'Park', stadium: 'Stadium', hotel: 'Hotel', college: 'College', hospital: 'Hospital', food: 'Food' };
    const score = (n) => {
      const l = n.toLowerCase();
      return l === q ? 0 : l.startsWith(q) ? 1 : l.split(/\s+/).some((w) => w.startsWith(q)) ? 2 : l.includes(q) ? 3 : 9;
    };
    this.hits = this.searchable()
      .map((p) => ({ p, s: score(p.n) }))
      .filter((h) => h.s < 9)
      .sort((a, b) => a.s - b.s || a.p.n.length - b.p.n.length)
      .slice(0, 8)
      .map((h) => h.p);
    for (const p of this.hits) {
      const row = document.createElement('div');
      row.className = 'mres';
      row.innerHTML = `<b></b><span>${KIND[p.k] || ''}</span>`;
      row.querySelector('b').textContent = p.n;
      row.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.go(p);
      });
      this.results.appendChild(row);
    }
  }
  searchable() {
    if (!this._all) {
      const seen = new Set();
      this._all = [...this.labels, ...MAP.pois].filter((p) => {
        const k = p.n.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return this._all;
  }
  /** Fly the map to a place and route there. */
  go(p) {
    this.cx = p.x;
    this.cz = p.z;
    this.scale = Math.max(this.scale, 1.6);
    this.results.innerHTML = '';
    this.searchInput.value = p.n;
    this.searchInput.blur();
    if (this.onWaypoint) this.onWaypoint({ x: p.x, z: p.z });
  }

  toWorld(sx, sy) {
    return { x: this.cx + (sx - innerWidth / 2) / this.scale, z: this.cz + (sy - innerHeight / 2) / this.scale };
  }

  show(on, focus) {
    this.open = on;
    this.el.classList.toggle('hidden', !on);
    if (!on) {
      this.searchInput.blur();
      this.results.innerHTML = '';
    }
    if (on) {
      this.cx = focus.x;
      this.cz = focus.z;
      this.scale = clamp(Math.min(innerWidth, innerHeight) / 1600, 0.3, 3);
    }
  }

  draw(player, blips, waypoint, route) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const c = this.canvas;
    const W = innerWidth;
    const H = innerHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = this.scale;
    const ox = W / 2 - this.cx * S;
    const oy = H / 2 - this.cz * S;
    g.save();
    g.translate(ox, oy);
    g.scale(S, S);
    this.hud.drawMapView(g, -ox / S, -oy / S, (W - ox) / S, (H - oy) / S, 1 / S, true);
    g.restore();
    const X = (x) => ox + x * S;
    const Y = (z) => oy + z * S;
    // Place names
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const maxTier = S < 0.35 ? 0 : S < 0.8 ? 1 : S < 1.6 ? 2 : 3;
    // keep labels from piling on top of each other: a coarse grid of taken cells
    const taken = new Set();
    for (const l of this.labels) {
      if (l.tier > maxTier) continue;
      // far out, only towns and the main suburbs
      if (S < 0.08 && l.k === 'area') continue;
      const x = X(l.x);
      const y = Y(l.z);
      if (x < -100 || x > W + 100 || y < -20 || y > H + 20) continue;
      const cx = Math.floor(x / 120);
      const cy = Math.floor(y / 22);
      if (taken.has(cx * 1000 + cy) || taken.has((cx + 1) * 1000 + cy)) continue;
      taken.add(cx * 1000 + cy);
      g.font = l.tier === 0 ? '600 15px Rajdhani' : l.k === 'metro' ? 'bold 12px Rajdhani' : '600 12px Rajdhani';
      const text = l.tier === 0 ? l.n.toUpperCase() : l.n;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(text, x, y);
      g.fillStyle = l.tier === 0 ? '#e8dcc0' : l.k === 'metro' ? '#9fc4ff' : l.k === 'station' ? '#f4c51c' : l.k === 'ghat' ? '#8fd3ff' : '#ffffff';
      g.fillText(text, x, y);
    }
    // Route
    if (route && route.length > 1) {
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const [w, col] of [[9, 'rgba(0,0,0,0.55)'], [5, '#ff3fa4']]) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        route.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
        g.stroke();
      }
    }
    // Blips
    for (const b of blips) {
      g.beginPath();
      g.arc(X(b.x), Y(b.z), (b.r || 8) * 0.8, 0, Math.PI * 2);
      g.fillStyle = b.color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#000';
      g.stroke();
      if (b.label) {
        g.fillStyle = '#000';
        g.font = 'bold 11px Rajdhani';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(b.label, X(b.x), Y(b.z) + 1);
      }
    }
    // Waypoint flag
    if (waypoint) {
      const x = X(waypoint.x);
      const y = Y(waypoint.z);
      g.fillStyle = '#ff3fa4';
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 9, y - 18);
      g.arc(x, y - 22, 10, Math.PI * 0.8, Math.PI * 0.2);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x, y - 22, 4, 0, Math.PI * 2);
      g.fill();
    }
    // Player arrow
    const p = player.focus;
    const yaw = player.vehicle && player.mode !== 'foot' ? player.vehicle.yaw : player.yaw;
    g.save();
    g.translate(X(p.x), Y(p.z));
    g.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw)) + Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(9, 10);
    g.lineTo(0, 5);
    g.lineTo(-9, 10);
    g.closePath();
    g.fillStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = 10;
    g.fill();
    g.restore();
    // Cursor read-out
    const info = this.el.querySelector('.minfo');
    const txt = waypoint && route ? `Waypoint · ${Math.round(routeLength(route))} m by road` : 'Click to set a waypoint';
    if (info.textContent !== txt) info.textContent = txt;
  }
}
