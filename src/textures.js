import * as THREE from 'three';

// All textures are generated procedurally on canvases — no image assets needed.

let ANISO = 8;
export function setAniso(a) {
  ANISO = a;
}

export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}

function mk(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  return t;
}

function grain(g, w, h, amp, rng) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amp;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Soft radial blob, drawn wrapped so the texture still tiles.
function blotch(g, S, x, y, r, color) {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const cx = x + ox * S;
      const cy = y + oy * S;
      if (cx + r < 0 || cx - r > S || cy + r < 0 || cy - r > S) continue;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
}

/* ---------------- Ground ---------------- */

export function asphalt(lines) {
  const S = 512;
  const r = makeRng(lines ? 11 : 12);
  const [c, g] = mk(S);
  const [rc, rg] = mk(S);
  g.fillStyle = '#3a3c40';
  g.fillRect(0, 0, S, S);
  rg.fillStyle = 'rgb(0,215,0)';
  rg.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = r.range(15, 80);
    blotch(g, S, x, y, rad, r() < 0.65 ? `rgba(14,14,18,${r.range(0.05, 0.15)})` : `rgba(95,95,100,${r.range(0.03, 0.08)})`);
    blotch(rg, S, r() * S, r() * S, rad, `rgba(0,120,0,${r.range(0.1, 0.35)})`);
  }
  if (lines) {
    // Polished tyre tracks in each lane
    for (const x of [128, 384]) {
      for (const o of [-30, 30]) {
        const gr = g.createLinearGradient(x + o - 14, 0, x + o + 14, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(0.5, 'rgba(8,8,10,0.24)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x + o - 14, 0, 28, S);
        const gr2 = rg.createLinearGradient(x + o - 14, 0, x + o + 14, 0);
        gr2.addColorStop(0, 'rgba(0,0,0,0)');
        gr2.addColorStop(0.5, 'rgba(0,90,0,0.55)');
        gr2.addColorStop(1, 'rgba(0,0,0,0)');
        rg.fillStyle = gr2;
        rg.fillRect(x + o - 14, 0, 28, S);
      }
    }
    g.fillStyle = '#d8a93a';
    g.fillRect(247, 0, 5, S);
    g.fillRect(260, 0, 5, S);
    g.fillStyle = '#e6e6e2';
    g.fillRect(26, 0, 6, S);
    g.fillRect(480, 0, 6, S);
    rg.fillStyle = 'rgb(0,150,0)';
    for (const [x, w] of [[247, 5], [260, 5], [26, 6], [480, 6]]) rg.fillRect(x, 0, w, S);
  }
  g.strokeStyle = 'rgba(10,10,10,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    let x = r() * S;
    let y = r() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += r.range(-14, 14);
      y += r.range(-14, 14);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  grain(g, S, S, 30, r);
  grain(rg, S, S, 50, r);
  return { map: tex(c), rough: tex(rc, { srgb: false }), canvas: c };
}

export function crosswalk(plainCanvas) {
  const r = makeRng(5);
  const [c, g] = mk(512, 128);
  g.drawImage(plainCanvas, 0, 0, 512, 128, 0, 0, 512, 128);
  g.fillStyle = 'rgba(236,236,232,0.95)';
  for (let x = 34; x + 20 <= 480; x += 42) g.fillRect(x, 8, 20, 112);
  grain(g, 512, 128, 28, r);
  return tex(c, { repeat: false });
}

export function sidewalk() {
  const S = 512;
  const r = makeRng(21);
  const [c, g] = mk(S);
  g.fillStyle = '#a29d94';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r.range(0.02, 0.07)})`;
    g.fillRect((i % 2) * 256, Math.floor(i / 2) * 256, 256, 256);
  }
  for (let i = 0; i < 30; i++) blotch(g, S, r() * S, r() * S, r.range(10, 50), `rgba(40,35,30,${r.range(0.03, 0.1)})`);
  g.fillStyle = 'rgba(40,38,35,0.5)';
  g.fillRect(0, 0, S, 3);
  g.fillRect(0, 255, S, 3);
  g.fillRect(0, 0, 3, S);
  g.fillRect(255, 0, 3, S);
  grain(g, S, S, 22, r);
  return tex(c);
}

export function grass() {
  const S = 512;
  const r = makeRng(31);
  const [c, g] = mk(S);
  g.fillStyle = '#3d5524';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) blotch(g, S, r() * S, r() * S, r.range(30, 90), r() < 0.5 ? 'rgba(90,110,40,0.18)' : 'rgba(20,35,10,0.2)');
  const cols = ['#4e6b2c', '#5b7a33', '#36501f', '#6b8a3c', '#2f4419', '#7d9a45'];
  g.lineWidth = 1.4;
  for (let i = 0; i < 18000; i++) {
    const x = r() * S;
    const y = r() * S;
    const len = r.range(3, 8);
    const a = -Math.PI / 2 + r.range(-0.6, 0.6);
    g.strokeStyle = r.pick(cols);
    g.globalAlpha = r.range(0.4, 0.9);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  g.globalAlpha = 1;
  grain(g, S, S, 18, r);
  return tex(c);
}

export function sand() {
  const S = 512;
  const r = makeRng(41);
  const [c, g] = mk(S);
  g.fillStyle = '#dcc398';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) blotch(g, S, r() * S, r() * S, r.range(20, 80), r() < 0.5 ? 'rgba(255,240,210,0.12)' : 'rgba(150,115,70,0.12)');
  g.strokeStyle = 'rgba(140,110,70,0.1)';
  g.lineWidth = 2;
  for (let y = 0; y < S; y += 9) {
    g.beginPath();
    for (let x = 0; x <= S; x += 8) {
      const yy = y + Math.sin((x / S) * Math.PI * 6 + y * 0.1) * 3;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  grain(g, S, S, 34, r);
  return tex(c);
}

/* ---------------- Vegetation ---------------- */

export function trunk() {
  const r = makeRng(51);
  const [c, g] = mk(128, 256);
  g.fillStyle = '#7a5a3c';
  g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = 'rgba(45,28,14,0.6)';
    for (let x = 0; x < 128; x += 4) g.fillRect(x, y + Math.sin(x * 0.2) * 2, 4, 3 + r() * 3);
    g.fillStyle = 'rgba(255,225,190,0.08)';
    g.fillRect(0, y + 6, 128, 4);
  }
  g.strokeStyle = 'rgba(30,20,10,0.15)';
  for (let i = 0; i < 40; i++) {
    const x = r() * 128;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + r.range(-4, 4), 256);
    g.stroke();
  }
  grain(g, 128, 256, 28, r);
  return tex(c);
}

export function leaf() {
  const r = makeRng(61);
  const [c, g] = mk(256, 512);
  g.clearRect(0, 0, 256, 512);
  const greens = ['#2f6b2a', '#3d7d31', '#4b8a36', '#5c943b', '#356f2c', '#6b9e40'];
  g.lineCap = 'round';
  for (let i = 0; i < 74; i++) {
    const t = i / 74;
    const y = 500 - t * 488;
    const L = 118 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.06)), 0.75);
    for (const side of [-1, 1]) {
      g.strokeStyle = r.pick(greens);
      g.lineWidth = 5.5 * (1 - t * 0.6) + 1.5;
      g.beginPath();
      g.moveTo(128, y);
      g.quadraticCurveTo(128 + side * L * 0.5, y - 4, 128 + side * L, y - 18 - t * 8);
      g.stroke();
    }
  }
  g.strokeStyle = '#5a6a2a';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(128, 512);
  g.lineTo(128, 6);
  g.stroke();
  return tex(c, { repeat: false });
}

/* ---------------- FX ---------------- */

export function glow() {
  const [c, g] = mk(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false });
}

export function beam() {
  const [c, g] = mk(16, 256);
  const gr = g.createLinearGradient(0, 256, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.15, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 16, 256);
  return tex(c, { repeat: false });
}

export function smoke() {
  const r = makeRng(71);
  const [c, g] = mk(128);
  for (let i = 0; i < 14; i++) {
    const x = 64 + r.range(-22, 22);
    const y = 64 + r.range(-22, 22);
    const rad = r.range(22, 40);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  return tex(c, { repeat: false });
}

/** Tileable ocean normal map built from integer-frequency sine waves. */
export function waterNormals() {
  const S = 256;
  const [c, g] = mk(S);
  const img = g.createImageData(S, S);
  const d = img.data;
  const r = makeRng(99);
  const waves = [];
  for (let i = 0; i < 28; i++) {
    const kx = r.int(-14, 14);
    const ky = r.int(-14, 14);
    if (!kx && !ky) continue;
    waves.push([kx, ky, 1 / Math.pow(Math.hypot(kx, ky), 1.1), r() * Math.PI * 2]);
  }
  const strength = 3.2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let dx = 0;
      let dy = 0;
      for (const [kx, ky, a, p] of waves) {
        const cs = Math.cos(((kx * x + ky * y) / S) * Math.PI * 2 + p) * a;
        dx += cs * kx;
        dy += cs * ky;
      }
      let nx = -dx * strength * 0.05;
      let ny = -dy * strength * 0.05;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * S + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

/* ---------------- Buildings ---------------- */

const LIGHTS = ['#ffd49a', '#ffe2b8', '#fff1d8', '#d8e8ff', '#ffc27a', '#fff8ea', '#ffe9c9'];

/**
 * Facade texture set. One tile = 8x8 window cells, a cell = 4m wide x 3.5m tall.
 * Returns colour, emissive (lit windows) and roughness/metalness (G/B channels) maps.
 */
export function facade(kind, o, seed) {
  const S = 512;
  const C = 64;
  const r = makeRng(seed);
  const [c, g] = mk(S);
  const [e, ge] = mk(S);
  const [m, mg] = mk(S);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, S, S);
  const litWin = (x, y, w, h, p) => {
    if (r() < p) {
      ge.globalAlpha = r.range(0.45, 1);
      ge.fillStyle = r.pick(LIGHTS);
      ge.fillRect(x, y, w, h);
      ge.globalAlpha = 1;
    }
  };
  const rowP = () => (r() < 0.22 ? 0.85 : o.lit * r.range(0.3, 1.3));

  if (kind === 'glass') {
    g.fillStyle = o.frame;
    g.fillRect(0, 0, S, S);
    mg.fillStyle = 'rgb(0,140,40)';
    mg.fillRect(0, 0, S, S);
    for (let row = 0; row < 8; row++) {
      const p = rowP();
      for (let col = 0; col < 8; col++) {
        const x = col * C + 2;
        const y = row * C + 2;
        const w = C - 4;
        const h = C - 9;
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, o.glassA);
        gr.addColorStop(1, o.glassB);
        g.fillStyle = gr;
        g.fillRect(x, y, w, h);
        g.fillStyle = o.frame;
        g.fillRect(x + w / 2 - 1, y, 2, h);
        mg.fillStyle = `rgb(0,${r.int(10, 30)},255)`;
        mg.fillRect(x, y, w, h);
        litWin(x, y, w, h, p);
      }
      g.fillStyle = o.slab;
      g.fillRect(0, row * C + C - 7, S, 7);
    }
  } else if (kind === 'concrete') {
    g.fillStyle = o.wall;
    g.fillRect(0, 0, S, S);
    mg.fillStyle = 'rgb(0,235,0)';
    mg.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      const x = r() * S;
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, 'rgba(0,0,0,0.07)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x, 0, r.range(4, 20), S);
    }
    for (let row = 0; row < 8; row++) {
      const p = rowP();
      g.fillStyle = 'rgba(0,0,0,0.1)';
      g.fillRect(0, row * C + C - 3, S, 2);
      for (let col = 0; col < 8; col++) {
        const x = col * C + 10;
        const y = row * C + 12;
        const w = 44;
        const h = 36;
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, '#41505d');
        gr.addColorStop(1, '#1a2027');
        g.fillStyle = gr;
        g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(255,255,255,0.28)';
        g.lineWidth = 2;
        g.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(x - 3, y + h + 2, w + 6, 3);
        mg.fillStyle = 'rgb(0,30,200)';
        mg.fillRect(x, y, w, h);
        litWin(x, y, w, h, p);
      }
    }
  } else if (kind === 'deco') {
    g.fillStyle = o.wall;
    g.fillRect(0, 0, S, S);
    mg.fillStyle = 'rgb(0,220,0)';
    mg.fillRect(0, 0, S, S);
    for (let col = 0; col < 8; col += 2) {
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(col * C - 3, 0, 6, S);
    }
    for (let row = 0; row < 8; row++) {
      const p = rowP();
      g.fillStyle = o.band || '#f7f3ea';
      g.fillRect(0, row * C + C - 10, S, 6);
      for (let col = 0; col < 8; col++) {
        const x = col * C + 5;
        const y = row * C + 16;
        const w = C - 10;
        const h = 28;
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, '#4f7d86');
        gr.addColorStop(1, '#1d3a42');
        g.fillStyle = gr;
        g.fillRect(x, y, w, h);
        mg.fillStyle = 'rgb(0,25,210)';
        mg.fillRect(x, y, w, h);
        litWin(x, y, w, h, p);
      }
    }
  } else {
    // residential
    g.fillStyle = o.wall;
    g.fillRect(0, 0, S, S);
    mg.fillStyle = 'rgb(0,230,0)';
    mg.fillRect(0, 0, S, S);
    for (let row = 0; row < 8; row++) {
      const p = rowP();
      for (let col = 0; col < 8; col++) {
        const x = col * C + 18;
        const y = row * C + 10;
        const w = 28;
        const h = 36;
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, '#3c4852');
        gr.addColorStop(1, '#1b2228');
        g.fillStyle = gr;
        g.fillRect(x, y, w, h);
        g.strokeStyle = '#efe6d8';
        g.lineWidth = 3;
        g.strokeRect(x, y, w, h);
        mg.fillStyle = 'rgb(0,35,180)';
        mg.fillRect(x, y, w, h);
        litWin(x + 2, y + 2, w - 4, h - 4, p);
        if ((col + row) % 2 === 0) {
          g.fillStyle = 'rgba(255,255,255,0.55)';
          g.fillRect(col * C + 8, row * C + 50, 48, 4);
          g.fillStyle = 'rgba(30,30,30,0.75)';
          g.fillRect(col * C + 8, row * C + 38, 48, 2);
          for (let k = 0; k <= 48; k += 4) g.fillRect(col * C + 8 + k, row * C + 38, 1, 12);
        }
      }
    }
  }
  grain(g, S, S, 12, r);
  return { map: tex(c), emissive: tex(e), rm: tex(m, { srgb: false }) };
}

/** Ground-floor shop fronts: 4 shops per tile (24m) x 4m height. */
export function storefront() {
  const r = makeRng(81);
  const [c, g] = mk(512, 128);
  const [e, ge] = mk(512, 128);
  const [m, mg] = mk(512, 128);
  g.fillStyle = '#1d1e22';
  g.fillRect(0, 0, 512, 128);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 512, 128);
  mg.fillStyle = 'rgb(0,170,60)';
  mg.fillRect(0, 0, 512, 128);
  const signs = ['#c43d5a', '#2d6f8f', '#e0a43a', '#3f8f6a', '#7a4fb0', '#d0d0d0', '#ff5f8a', '#38c8ff'];
  for (let s = 0; s < 4; s++) {
    const x0 = s * 128;
    const sc = r.pick(signs);
    g.fillStyle = sc;
    g.fillRect(x0 + 6, 6, 116, 24);
    if (r() < 0.75) {
      ge.fillStyle = sc;
      ge.fillRect(x0 + 6, 6, 116, 24);
    }
    const gr = g.createLinearGradient(0, 36, 0, 120);
    gr.addColorStop(0, '#56636e');
    gr.addColorStop(1, '#262f37');
    g.fillStyle = gr;
    g.fillRect(x0 + 8, 36, 112, 84);
    mg.fillStyle = 'rgb(0,15,230)';
    mg.fillRect(x0 + 8, 36, 112, 84);
    if (r() < 0.85) {
      const eg = ge.createLinearGradient(0, 36, 0, 120);
      const lc = r.pick(LIGHTS);
      eg.addColorStop(0, lc);
      eg.addColorStop(1, 'rgba(255,190,120,0.55)');
      ge.fillStyle = eg;
      ge.fillRect(x0 + 8, 36, 112, 84);
    }
    g.fillStyle = '#18191c';
    g.fillRect(x0 + 62, 36, 4, 84);
    ge.fillStyle = '#000';
    ge.fillRect(x0 + 62, 36, 4, 84);
  }
  grain(g, 512, 128, 10, r);
  return { map: tex(c), emissive: tex(e), rm: tex(m, { srgb: false }) };
}
