import * as THREE from 'three';
import { MAP, polygon, inPoly } from './geo.js';
import { terminusRoutes, dressBus } from './busroutes.js';
import { merge, paint } from './utils.js';

/*
 * The Esplanade (Dharmatala) bus terminus beside Shaheed Minar: buses in WBTC
 * and private liveries waiting in their bays under the shelters, each with its
 * route board: real routes that start or end at Esplanade. Board one (V) and it
 * takes you the way that route really runs.
 */

const BAYS = 6;

const box = (w, h, d, x, y, z, hex) => {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  g.deleteAttribute('uv');
  return paint(g, hex);
};

function signTex(lines, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 200;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 200);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 76px "Kohinoor Bangla", "Bangla MN", "Noto Sans Bengali", Arial';
  g.fillText(lines[0], 512, 64, 980);
  g.font = 'bold 56px Arial';
  g.fillText(lines[1], 512, 150, 980);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BusStand {
  constructor(scene, world) {
    this.buses = [];
    const area = MAP.areas.find((a) => a.k === 'bus_station' && /esplanade/i.test(a.name || ''));
    if (!area) return;
    const P = polygon(area.p);
    // main axis of the terminus
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < P.n; i++) {
      cx += P.xs[i];
      cz += P.zs[i];
    }
    cx /= P.n;
    cz /= P.n;
    let sxx = 0;
    let szz = 0;
    let sxz = 0;
    for (let i = 0; i < P.n; i++) {
      const dx = P.xs[i] - cx;
      const dz = P.zs[i] - cz;
      sxx += dx * dx;
      szz += dz * dz;
      sxz += dx * dz;
    }
    const a = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    const W = (u, v) => [cx + ux * u - uz * v, cz + uz * u + ux * v];
    this.centre = { x: cx, z: cz };
    // Bays: buses side by side across the long axis, nose to the road
    const parts = [];
    const busYaw = Math.atan2(-uz, ux) + Math.PI / 2;
    const runs = terminusRoutes(world.graph, /^esplanade$/i, BAYS);
    let k = 0;
    for (let u = -runs.length * 2.6; k < runs.length && u < 60; u += 5.2) {
      const [x, z] = W(u, 0);
      if (!inPoly(P, x, z) || world.collideCircle(x, z, 2)) continue;
      this.buses.push({ run: runs[k], x, z, yaw: busYaw });
      // a numbered post at the head of each bay
      const [px, pz] = W(u, -7.4);
      parts.push(box(0.12, 2.4, 0.12, px, 1.2, pz, '#2a2b2e'));
      k++;
    }
    // Long shelter roofs either side of the bays, on posts, with benches
    for (const v of [-9.5, 9.5]) {
      const [x, z] = W(0, v);
      const len = Math.max(20, this.buses.length * 5.2 + 6);
      const g = new THREE.BoxGeometry(len, 0.14, 3.2).rotateY(-a).translate(x, 3.4, z);
      g.deleteAttribute('uv');
      parts.push(paint(g, '#2f6b4a'));
      for (let u = -len / 2 + 1; u <= len / 2 - 1; u += 4) {
        const [px, pz] = W(u, v);
        parts.push(box(0.12, 3.4, 0.12, px, 1.7, pz, '#3a3b3e'));
        world.addCircle(px, pz, 0.12);
        // tube lights under the roof, one per bay
        if (u + 2 <= len / 2 - 1) {
          const [lx, lz] = W(u + 2, v);
          world.addStationLamp(lx, 3.27, lz, Math.PI / 2 - a, 2.6, 0, 5);
        }
        if (Math.abs(u) % 8 < 4) {
          const b = new THREE.BoxGeometry(2.4, 0.08, 0.5).rotateY(-a).translate(px + ux * 2, 0.5, pz + uz * 2);
          b.deleteAttribute('uv');
          parts.push(paint(b, '#6b5a48'));
        }
      }
    }
    // Ticket and enquiry booth
    {
      const [x, z] = W(-BAYS * 2.6 - 6, -9.5);
      parts.push(box(3, 2.6, 2.6, x, 1.3, z, '#e8e2d4'), box(3.4, 0.15, 3, x, 2.7, z, '#9a3a2a'));
      world.addCircle(x, z, 1.8);
    }
    const mesh = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // The terminus sign on two tall posts
    {
      const [x, z] = W(0, -13);
      const tex = signTex(['ধর্মতলা বাস টার্মিনাস', 'ESPLANADE BUS TERMINUS'], '#1f3f9a', '#ffffff');
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.8), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
      sign.position.set(x, 5.2, z);
      sign.rotation.y = -a;
      scene.add(sign);
      const posts = merge([...[-4, 4].map((o) => box(0.15, 5.2, 0.15, x + ux * o, 2.6, z + uz * o, '#2a2b2e'))]);
      scene.add(new THREE.Mesh(posts, new THREE.MeshStandardMaterial({ vertexColors: true })));
    }
  }

  /** Put the waiting buses in their bays (called once vehicles can be created). */
  spawn(make, graph) {
    for (const b of this.buses) {
      const { route, back } = b.run;
      const v = make('bus', route.livery, b.x, b.z, b.yaw);
      v.busRoute = route;
      v.busBack = back;
      dressBus(v.car.body, graph, route);
    }
  }
}
