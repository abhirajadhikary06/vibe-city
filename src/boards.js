import * as THREE from 'three';
import { MAP } from './geo.js';

/*
 * Departure boards: next trains at the railway stations (a big one on Howrah's
 * concourse), next Metro at each platform, next tram at each stop. Destinations
 * and numbers follow the real services out of Howrah and Sealdah; times are
 * worked out from where each train actually is, against the real Kolkata clock.
 */

const DEST = {
  howrah: ['BANDEL', 'BARDHAMAN', 'TARAKESWAR', 'KHARAGPUR', 'MECHEDA', 'ULUBERIA', 'PANSKURA', 'ARAMBAGH'],
  sealdah: ['KRISHNANAGAR', 'BANGAON', 'RANAGHAT', 'NAIHATI', 'BARASAT', 'HASNABAD', 'SHANTIPUR'],
  'sealdah-south': ['CANNING', 'DIAMOND HARBOUR', 'NAMKHANA', 'BUDGE BUDGE', 'SONARPUR', 'BARUIPUR'],
};
const EXPRESS = { howrah: ['12301 RAJDHANI', 'NEW DELHI'], sealdah: ['12313 RAJDHANI', 'NEW DELHI'] };
const hash = (s) => {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};

/** Give every service a number and its two destinations: [towards s=0, towards s=end]. */
function describe(rail, metro) {
  let n = 0;
  const nearestName = (x, z, kinds) => {
    let best = null;
    for (const p of MAP.pois) {
      if (!kinds.includes(p.k)) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (!best || d < best.d) best = { d, n: p.n };
    }
    return best ? best.n.replace(/\s*\(.*?\)/, '').toUpperCase() : 'DEPOT';
  };
  for (const cs of rail.consists) {
    const a = cs.track.at(0, {});
    const b = cs.track.at(cs.track.len, {});
    n++;
    if (cs.kind === 'metro') continue;
    if (cs.kind === 'tram') {
      cs.svc = { no: ['5', '18', '25'][rail.trams.indexOf(cs) >> 1] || '5', dest: [nearestName(a.x, a.z, ['area', 'landmark', 'market']), nearestName(b.x, b.z, ['area', 'landmark', 'market'])], label: 'TRAM' };
      continue;
    }
    if (cs.circular) {
      // the Circular Railway runs between Dum Dum and Majerhat
      const north = a.z < b.z;
      cs.svc = { no: `3${1100 + n}`, dest: north ? ['DUM DUM JN', 'MAJERHAT'] : ['MAJERHAT', 'DUM DUM JN'], label: 'CIRCULAR' };
      continue;
    }
    const home = cs.origin === 'howrah' ? 'HOWRAH' : 'SEALDAH';
    if (cs.kind === 'express') {
      const [no, to] = EXPRESS[cs.origin] || EXPRESS.howrah;
      cs.svc = { no, dest: [home, to], label: 'EXPRESS' };
    } else {
      const list = DEST[cs.origin] || DEST.howrah;
      const to = list[hash(`${cs.origin}${n}`) % list.length];
      cs.svc = { no: `${cs.origin === 'howrah' ? 3 : 3}${(hash(to + n) % 9000) + 1000}`, dest: [home, to], label: 'LOCAL' };
    }
  }
  for (const L of metro.lines) {
    const a = L.track.at(0, {});
    const b = L.track.at(L.track.len, {});
    const blue = /blue/i.test(L.name);
    const ends = blue ? ['DAKSHINESWAR', 'KAVI SUBHASH'] : ['HOWRAH MAIDAN', 'SECTOR V'];
    // which end of our track is which: north (smaller z) / west (smaller x)
    const firstIsNorthWest = blue ? a.z < b.z : a.x < b.x;
    const dest = firstIsNorthWest ? ends : [ends[1], ends[0]];
    for (const cs of metro.trains) if (cs.track === L.track) cs.svc = { no: blue ? 'BLUE LINE' : 'GREEN LINE', dest, label: 'METRO' };
    // Up trains run towards the far end of the track, Down trains back
    L.dest = { up: dest[1], down: dest[0] };
  }
}

/** Seconds until a service reaches arc length sT, and which way it'll be going. */
function eta(cs, sT) {
  const v = Math.max(3, cs.K.top * 0.55);
  const dwellOf = cs.kind === 'tram' ? 9 : cs.kind === 'express' ? 30 : cs.kind === 'train' ? 18 : 14;
  const here = Math.abs(sT - cs.s) < cs.K.L * 0.8;
  if (here && cs.state === 'dwell') return { t: 0, dir: cs.dir, here: true };
  const stopsBetween = (from, to) => cs.stops.filter((st) => (st - from) * (to - from) > 0 && Math.abs(st - from) < Math.abs(to - from) - 2).length;
  const ahead = (sT - cs.s) * cs.dir;
  let t = cs.state === 'dwell' ? cs.dwell : 0;
  if (ahead >= 0) {
    t += ahead / v + stopsBetween(cs.s, sT) * dwellOf;
    return { t, dir: cs.dir };
  }
  // going away: out to the end, turn round, and back
  const end = cs.dir > 0 ? cs.endB : cs.endA;
  t += Math.abs(end - cs.s) / v + stopsBetween(cs.s, end) * dwellOf + (cs.termDwell || dwellOf) + Math.abs(end - sT) / v + stopsBetween(end, sT) * dwellOf;
  return { t, dir: -cs.dir };
}

const fmtClock = (h) => {
  h = ((h % 24) + 24) % 24;
  const H = Math.floor(h);
  const M = Math.floor((h - H) * 60);
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
};

export class Boards {
  constructor(scene, world, rail, metro) {
    this.scene = scene;
    this.list = [];
    this.t = 0;
    describe(rail, metro);
    const pick = (consists, x, z, r = 70) => {
      const out = [];
      for (const cs of consists) {
        if (!cs.svc) continue;
        const s = cs.track.nearest(x, z);
        const q = cs.track.at(s, {});
        if (Math.hypot(q.x - x, q.z - z) < r) out.push({ cs, s });
      }
      return out;
    };
    const trains = rail.consists.filter((c) => c.kind === 'train' || c.kind === 'express');
    // Howrah: the big concourse board
    const st = world.station;
    if (st) {
      const { headCentre: hc, ux, uz, depth: D } = st;
      const x = hc.x - ux * (D / 2 + 0.6);
      const z = hc.z - uz * (D / 2 + 0.6);
      const svc = trains.filter((c) => c.origin === 'howrah').map((cs, i) => ({ cs, s: cs.sMin, pf: i + 1 }));
      this.add({ kind: 'big', title: 'হাওড়া · HOWRAH · DEPARTURES', x, y: 9, z, yaw: Math.atan2(-ux, -uz), w: 10, h: 4.4, svc, rows: 8 });
    }
    // other stations: one board per platform
    for (const p of rail.platforms) {
      if (p.covered) continue;
      const svc = pick(trains, p.cx, p.cz, 60);
      if (!svc.length) continue;
      const q = p.spine.at(p.len * 0.5, {});
      this.add({ kind: 'station', title: p.name, x: q.x, y: 3.8, z: q.z, yaw: Math.atan2(q.tx, q.tz) + Math.PI / 2, w: 3.2, h: 1.7, svc, rows: 3, twoSided: true, post: true });
    }
    // Metro platforms: the next two trains from this platform, counting down
    this.metro = metro;
    for (const pf of metro.platforms) {
      const towards = pf.lineRef && pf.lineRef.dest ? pf.lineRef.dest[pf.bound] : '';
      for (const d of pf.displays) this.add({ kind: 'metro', pf, towards, title: `PLATFORM ${pf.no} · ${pf.o.name.toUpperCase()}`, x: d.x, y: d.y, z: d.z, yaw: d.yaw, w: 4.2, h: 1.5, svc: [], rows: 2, twoSided: true, under: true, color: pf.color });
    }
    // Tram stops
    for (const ts of rail.tramStops) {
      const svc = pick(rail.trams, ts.x, ts.z, 25);
      if (!svc.length) continue;
      const tr = svc[0].cs.track.at(svc[0].s, {});
      const l = Math.hypot(tr.tx, tr.tz) || 1;
      this.add({ kind: 'tram', title: ts.name.toUpperCase(), x: ts.x + (tr.tz / l) * 3.6, y: 3.2, z: ts.z - (tr.tx / l) * 3.6, yaw: Math.atan2(tr.tx, tr.tz) + Math.PI / 2, w: 1.5, h: 0.75, svc, rows: 2, twoSided: true });
    }
  }

  add(b) {
    const c = document.createElement('canvas');
    c.width = b.kind === 'big' ? 1024 : b.kind === 'tram' ? 256 : 512;
    c.height = Math.round((c.width * b.h) / b.w);
    b.canvas = c;
    b.g = c.getContext('2d');
    b.tex = new THREE.CanvasTexture(c);
    b.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: b.tex, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), mat);
    mesh.position.set(b.x, b.y, b.z);
    mesh.rotation.y = b.yaw;
    // two-sided: a second face on the back, so the writing reads the right way round from both sides
    if (b.twoSided) {
      const back = new THREE.Mesh(mesh.geometry, mat);
      back.rotation.y = Math.PI;
      mesh.add(back);
    }
    this.scene.add(mesh);
    b.mesh = mesh;
    if (b.post) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, b.y - b.h / 2, 6), new THREE.MeshStandardMaterial({ color: 0x2a2b2e }));
      post.position.set(b.x, (b.y - b.h / 2) / 2, b.z);
      this.scene.add(post);
    }
    b.dirty = true;
    this.list.push(b);
  }

  /** Redraw boards near the camera once a second. */
  update(dt, camera, hours) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    const c = camera.position;
    for (const b of this.list) {
      const d = Math.hypot(b.x - c.x, b.z - c.z);
      const vis = b.under ? c.y < -2 && d < 140 : d < (b.kind === 'big' ? 400 : 160);
      b.mesh.visible = vis;
      if (vis) this.draw(b, hours);
    }
  }

  /** A Metro platform display: where the trains go, and when the next two come in. */
  drawMetro(b, hours) {
    const g = b.g;
    const W = b.canvas.width;
    const H = b.canvas.height;
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, W, H);
    const head = Math.round(H * 0.24);
    g.fillStyle = b.color || '#2f6fe0';
    g.fillRect(0, 0, W, head);
    g.fillStyle = '#ffffff';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(head * 0.46)}px Arial, sans-serif`;
    g.textAlign = 'left';
    g.fillText(b.pf.terminus ? b.title : `TOWARDS ${b.towards}`, W * 0.025, head / 2, W * 0.72);
    g.textAlign = 'right';
    g.fillText(fmtClock(hours), W * 0.975, head / 2);
    const amber = '#ffb02e';
    const rh = (H - head) / 2;
    if (b.pf.terminus) {
      g.fillStyle = amber;
      g.textAlign = 'center';
      g.font = `bold ${Math.round(rh * 0.42)}px "Courier New", monospace`;
      g.fillText('TERMINUS · TRAINS FROM', W / 2, head + rh * 0.55);
      g.fillText('THE OTHER PLATFORM', W / 2, head + rh * 1.35);
    } else {
      const next = this.metro.nextTrains(b.pf).slice(0, 2);
      next.forEach((r, i) => {
        const y = head + rh * (i + 0.5);
        const secs = Math.round(r.t);
        const soon = r.here || secs < 45;
        g.font = `bold ${Math.round(rh * 0.5)}px "Courier New", monospace`;
        g.fillStyle = amber;
        g.textAlign = 'left';
        g.fillText(i ? 'THEN' : 'NEXT TRAIN', W * 0.03, y);
        g.textAlign = 'right';
        g.fillStyle = soon ? '#5dff9e' : amber;
        g.fillText(r.here ? 'ON PLATFORM' : soon ? 'ARRIVING' : `${Math.floor(secs / 60)} MIN ${String(secs % 60).padStart(2, '0')} S`, W * 0.97, y);
      });
    }
    b.tex.needsUpdate = true;
  }

  draw(b, hours) {
    if (b.kind === 'metro') return this.drawMetro(b, hours);
    const g = b.g;
    const W = b.canvas.width;
    const H = b.canvas.height;
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, W, H);
    const amber = '#ffb02e';
    const rows = b.svc
      .map(({ cs, s, pf }) => {
        const e = eta(cs, s);
        return { cs, t: e.t, here: e.here, to: cs.svc.dest[e.dir > 0 ? 1 : 0], pf };
      })
      // a train at the end of its line isn't going anywhere from here in that direction
      .filter((r) => r.to && !(b.kind !== 'big' && r.to === b.title))
      .sort((a, z) => a.t - z.t)
      .slice(0, b.rows);
    const head = Math.round(H * (b.kind === 'tram' ? 0.3 : 0.2));
    g.fillStyle = b.kind === 'metro' ? b.color || '#2f6fe0' : b.kind === 'tram' ? '#1f56b8' : '#1f3f9a';
    g.fillRect(0, 0, W, head);
    g.fillStyle = '#ffffff';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(head * 0.5)}px Arial, "Kohinoor Bangla", sans-serif`;
    g.textAlign = 'left';
    g.fillText(b.title, W * 0.02, head / 2, W * 0.75);
    g.textAlign = 'right';
    g.fillText(fmtClock(hours), W * 0.98, head / 2);
    const rh = (H - head) / Math.max(1, b.rows);
    g.font = `bold ${Math.round(rh * 0.5)}px "Courier New", monospace`;
    rows.forEach((r, i) => {
      const y = head + rh * (i + 0.5);
      const mins = Math.round(r.t / 60);
      const when = r.here ? (b.kind === 'tram' ? 'HERE' : 'ON PF') : mins < 1 ? 'DUE' : `${mins} min`;
      g.fillStyle = amber;
      g.textAlign = 'left';
      if (b.kind === 'tram') {
        g.fillText(`${r.cs.svc.no} ${r.to}`, W * 0.03, y, W * 0.66);
      } else if (b.kind === 'metro') {
        g.fillText(`TO ${r.to}`, W * 0.03, y, W * 0.66);
      } else {
        g.fillText(fmtClock(hours + r.t / 3600), W * 0.02, y);
        g.fillText(`${r.cs.svc.no}`, W * (b.kind === 'big' ? 0.13 : 0.2), y, W * 0.22);
        g.fillText(`${r.to}${r.cs.kind === 'express' ? '' : ' LOCAL'}`, W * (b.kind === 'big' ? 0.33 : 0.42), y, W * (b.kind === 'big' ? 0.4 : 0.35));
        if (r.pf) {
          g.textAlign = 'right';
          g.fillText(`PF ${r.pf}`, W * 0.84, y);
        }
      }
      g.textAlign = 'right';
      g.fillStyle = r.here || mins < 1 ? '#5dff9e' : amber;
      g.fillText(when, W * 0.98, y);
    });
    if (!rows.length) {
      g.fillStyle = amber;
      g.textAlign = 'center';
      g.fillText('NO SERVICE', W / 2, head + (H - head) / 2);
    }
    b.tex.needsUpdate = true;
  }
}
