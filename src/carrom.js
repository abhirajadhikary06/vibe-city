import * as THREE from 'three';
import { Character, randomLook, POSE } from './character.js';
import { ADDA_SPOTS } from './adda.js';
import { clamp, damp } from './utils.js';

/**
 * Kolkata Adda Carrom Mini-Game
 * Authentic Indian carrom board beside the bench at selected Adda spots
 * (Esplanade, College Square, Allen Park) with uncle NPCs, 2D circle physics,
 * Queen cover rule, AI opponent, ₹20->₹50 stakes, and top-down view.
 */

export const CARROM_CONFIGS = {
  collegesq: { uncle: 'Bikash-babu', title: 'College Street Champion', diff: 'hard', stake: 20, prize: 50, errorAngle: 0.035 },
  esplanade: { uncle: 'Subhas-da', title: 'Tram Para Veteran', diff: 'medium', stake: 20, prize: 50, errorAngle: 0.065 },
  allenpark: { uncle: 'Pradip-kaku', title: 'Park Street Veteran', diff: 'medium', stake: 20, prize: 50, errorAngle: 0.06 },
};

const UNCLE_QUOTES = {
  start: [
    'Aay aay dada, ek haat carrom hoye jaak! Cha kheye kheye khelbo.',
    'Boshun dada, board-e powder dewa ache. Tumi age break nao.',
    'College Street-er purono champion ami, dekhi tomader jor kemon!',
  ],
  goodShot: [
    'Besh shot! Eke bole control!',
    'Arre darun pocket! Haat to besh bhalo!',
    'Shabash dada! Direct cut maarle!',
  ],
  miss: [
    'Dhuttor, angle-ta ektu bhenge gelo...',
    'Ektu beshi jore hoye gelo, bujhlen!',
    'Board-e ektu powder chhoriye dite hobe.',
  ],
  queenPocket: [
    'Queen ta to nilam, ebar cover dekho!',
    'Lal guti pocket-e! Ebar cover koro dada!',
  ],
  queenCovered: [
    'Queen cover hoye gelo! Baji to jite nile!',
    'Lal guti secured! Darun khelchen!',
  ],
  foul: [
    'Arre striker pocket-e fele dile! Due holo dada!',
    'Striker foul! Ekta guti center-e fire ashbe!',
  ],
  aiWin: [
    'Bohu bochor dhore adda-te carrom khelchi dada, aro practice dorkar!',
    'Aj baji amar holo! Pore abar khela hobe!',
  ],
  playerWin: [
    'Bhabte parini dada tumi erom player! Shob baji jite nile!',
    'Tomar striker-er shot darun! Ekdom Carrom King!',
  ],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate high-res carrom board canvas texture */
function createBoardCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // 1. Natural lacquered plywood background
  ctx.fillStyle = '#edd8b7';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle wood grain lines
  ctx.strokeStyle = 'rgba(180, 140, 95, 0.16)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 1024; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y * 0.05) * 3);
    ctx.lineTo(1024, y + Math.cos(y * 0.03) * 4);
    ctx.stroke();
  }

  // 2. 4 Corner Pockets
  const pocketR = 64;
  const pocketOffset = 82;
  const pockets = [
    [pocketOffset, pocketOffset],
    [1024 - pocketOffset, pocketOffset],
    [pocketOffset, 1024 - pocketOffset],
    [1024 - pocketOffset, 1024 - pocketOffset],
  ];

  for (const [px, py] of pockets) {
    ctx.beginPath();
    ctx.arc(px, py, pocketR + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#9e7534';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px, py, pocketR, 0, Math.PI * 2);
    ctx.fillStyle = '#141416';
    ctx.fill();
  }

  // 3. Outer boundary double lines
  const pad = 120;
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 6;
  ctx.strokeRect(pad, pad, 1024 - pad * 2, 1024 - pad * 2);
  ctx.lineWidth = 2;
  ctx.strokeRect(pad + 16, pad + 16, 1024 - (pad + 16) * 2, 1024 - (pad + 16) * 2);

  // 4. Center concentric circles & rosette
  const cx = 512, cy = 512;
  ctx.beginPath();
  ctx.arc(cx, cy, 140, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1b1b1b';
  ctx.stroke();

  // Rosette petals
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const px = cx + Math.cos(a) * 85;
    const py = cy + Math.sin(a) * 85;
    ctx.beginPath();
    ctx.arc(px, py, 45, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(214, 40, 40, 0.25)' : 'rgba(27, 27, 27, 0.15)';
    ctx.fill();
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, 50, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1b1b1b';
  ctx.stroke();

  // Red Queen circle
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.fillStyle = '#d62828';
  ctx.fill();
  ctx.strokeStyle = '#800f12';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 5. Baselines on all 4 sides with red circular endpoints
  const bInset = 210;
  const bLen = 500;
  const bLeft = (1024 - bLen) / 2;
  const bRight = bLeft + bLen;
  const bR = 24;

  const drawBaseline = (y, isHoriz) => {
    ctx.save();
    if (!isHoriz) {
      ctx.translate(512, 512);
      ctx.rotate(Math.PI / 2);
      ctx.translate(-512, -512);
    }
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bLeft, y - 9);
    ctx.lineTo(bRight, y - 9);
    ctx.moveTo(bLeft, y + 9);
    ctx.lineTo(bRight, y + 9);
    ctx.stroke();

    for (const bx of [bLeft, bRight]) {
      ctx.beginPath();
      ctx.arc(bx, y, bR, 0, Math.PI * 2);
      ctx.fillStyle = '#d62828';
      ctx.fill();
      ctx.strokeStyle = '#1b1b1b';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#1b1b1b';
      ctx.fill();
    }
    ctx.restore();
  };

  drawBaseline(1024 - bInset, true);
  drawBaseline(bInset, true);
  drawBaseline(bInset, false);
  drawBaseline(1024 - bInset, false);

  // 6. Corner arrows pointing to pockets
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 180);
    ctx.lineTo(0, 410);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 420);
    ctx.lineTo(-12, 395);
    ctx.lineTo(12, 395);
    ctx.closePath();
    ctx.fillStyle = '#1b1b1b';
    ctx.fill();
    ctx.restore();
  }

  return canvas;
}

export class Carrom {
  constructor(game, scene, world, hud, audio) {
    this.game = game;
    this.scene = scene;
    this.world = world;
    this.hud = hud;
    this.audio = audio;

    this.active = false;
    this.currentSpot = null;
    this.config = null;
    this.spots = [];

    // Board geometry constants (in metres)
    this.BOARD_SIZE = 0.74; // playing surface inner width (-0.37 to +0.37)
    this.HALF_BOARD = 0.37;
    this.DISC_R = 0.0155;
    this.STRIKER_R = 0.0215;
    this.POCKET_R = 0.0265;
    this.POCKET_POS = [
      [-0.332, -0.332],
      [0.332, -0.332],
      [-0.332, 0.332],
      [0.332, 0.332],
    ];

    // Pieces and board objects
    this.pieces = [];
    this.boardMesh = null;
    this.guideMesh = null;

    // Game state
    this.turn = 'player'; // 'player' | 'ai'
    this.subState = 'aiming'; // 'aiming' | 'charging' | 'moving' | 'evaluating' | 'game_over'
    this.queenPending = false;
    this.queenHolder = null;
    this.queenCovered = false;

    // Striker controls
    this.strikerX = 0;
    this.aimAngle = -Math.PI / 2; // pointing forward (-Z)
    this.power = 0;
    this.chargeT = 0;

    // AI state
    this.aiTimer = 0;
    this.aiAimAngle = 0;
    this.aiPower = 0;

    // Camera
    this.camTargetPos = new THREE.Vector3();
    this.camTargetLook = new THREE.Vector3();

    // DOM UI
    this.ui = null;
  }

  init() {
    this.buildSpots();
    this.buildUI();
  }

  buildSpots() {
    // Find adda spots matching our carrom configs
    for (const a of ADDA_SPOTS) {
      const cfg = CARROM_CONFIGS[a.id];
      if (!cfg) continue;

      const c = Math.cos(a.yaw);
      const s = Math.sin(a.yaw);
      // Place carrom table on the open side beside the bench (lx: -1.75, lz: 0.65)
      const lx = -1.75;
      const lz = 0.65;
      const bx = a.x + lx * c + lz * s;
      const bz = a.z - lx * s + lz * c;
      const by = this.world.height(bx, bz);

      const spot = {
        id: a.id,
        name: a.name,
        uncle: cfg.uncle,
        title: cfg.title,
        stake: cfg.stake,
        prize: cfg.prize,
        errorAngle: cfg.errorAngle,
        bx, by, bz,
        yaw: a.yaw,
      };

      this.createStandMesh(spot);
      this.world.addCircle(bx, bz, 0.7);
      this.spots.push(spot);
    }
  }

  createStandMesh(spot) {
    const group = new THREE.Group();
    group.position.set(spot.bx, spot.by, spot.bz);
    group.rotation.y = spot.yaw;

    // Stand: 4 black tubular steel legs with crossbars
    const legGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.64, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.65 });
    for (const sx of [-0.34, 0.34]) {
      for (const sz of [-0.34, 0.34]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(sx, 0.32, sz);
        group.add(leg);
      }
    }

    // Outer wooden frame of board
    const frameGeo = new THREE.BoxGeometry(0.84, 0.045, 0.84);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x361c0d, roughness: 0.6 });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.y = 0.64;
    group.add(frameMesh);

    // Carrom board playing surface plane with canvas texture
    if (!Carrom.boardTexture) {
      Carrom.boardTexture = new THREE.CanvasTexture(createBoardCanvas());
      Carrom.boardTexture.anisotropy = 4;
    }
    const surfGeo = new THREE.PlaneGeometry(0.74, 0.74);
    const surfMat = new THREE.MeshStandardMaterial({ map: Carrom.boardTexture, roughness: 0.42 });
    const surfMesh = new THREE.Mesh(surfGeo, surfMat);
    surfMesh.rotation.x = -Math.PI / 2;
    surfMesh.position.y = 0.658;
    group.add(surfMesh);

    // 4 Corner pocket mesh indentations
    const pocketHoleGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.04, 16);
    const pocketHoleMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c });
    for (const [px, pz] of this.POCKET_POS) {
      const ph = new THREE.Mesh(pocketHoleGeo, pocketHoleMat);
      ph.position.set(px, 0.642, pz);
      group.add(ph);
    }

    // Wooden Stools around the board
    const stoolGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.42, 12);
    const stoolMat = new THREE.MeshStandardMaterial({ color: 0x4a2d18, roughness: 0.8 });
    for (const sz of [-0.6, 0.6]) {
      const stool = new THREE.Mesh(stoolGeo, stoolMat);
      stool.position.set(0, 0.21, sz);
      group.add(stool);
    }

    // Uncle Opponent NPC sitting at North side (sz = -0.6)
    const uncleLook = randomLook();
    uncleLook.female = false;
    uncleLook.skin = 0xba7c52;
    const uncle = new Character(this.scene, uncleLook);
    uncle.mesh.position.set(0, -0.42 + 0.64, -0.58);
    uncle.mesh.rotation.y = 0; // facing South (+Z)
    uncle.mode = 'pose';
    uncle.poseFn = (P, T) => {
      for (const side of ['L', 'R']) {
        POSE.leg(P, side, 1.45, 0.08);
        POSE.knee(P, side, 1.35);
        POSE.arm(P, side, 0.5, 0.18);
        POSE.elbow(P, side, 0.95);
      }
      P.spine[0] = 0.08;
      P.head[1] = Math.sin(T * 0.35) * 0.12;
    };
    group.add(uncle.mesh);
    spot.uncleChar = uncle;

    this.scene.add(group);
    spot.group = group;
  }

  buildUI() {
    let el = document.getElementById('carrom');
    if (!el) {
      el = document.createElement('div');
      el.id = 'carrom';
      el.className = 'hidden';
      el.innerHTML = `
        <div class="cm-bug">
          <div class="cm-match">CARROM AT ADDA · <span class="cm-spot"></span></div>
          <div class="cm-score-row">
            <div class="cm-side player">
              <span class="cm-dot white"></span> YOU (WHITE): <b class="cm-left-white">9</b>
            </div>
            <div class="cm-side uncle">
              <span class="cm-dot black"></span> <span class="cm-uname">UNCLE</span> (BLACK): <b class="cm-left-black">9</b>
            </div>
          </div>
          <div class="cm-queen-status">🔴 QUEEN: <span class="cm-qtext">ON BOARD</span></div>
          <div class="cm-turn-badge player">YOUR TURN</div>
        </div>

        <div class="cm-say hidden"></div>

        <div class="cm-meter-wrap">
          <div class="cm-meter">
            <div class="cm-meter-fill"></div>
          </div>
          <div class="cm-meter-label">HOLD SPACE TO CHARGE STRIKE</div>
        </div>

        <div class="cm-help">
          <kbd>A</kbd> <kbd>D</kbd> Slide Striker &nbsp;·&nbsp; Mouse / Arrows Aim &nbsp;·&nbsp; Hold <kbd>SPACE</kbd> Strike &nbsp;·&nbsp; <kbd>ESC</kbd> Leave
        </div>

        <div class="cm-modal hidden">
          <h2 class="cm-mtitle">VICTORY!</h2>
          <p class="cm-mtext"></p>
          <div class="cm-buttons">
            <button class="cm-btn-rematch">PLAY AGAIN (₹20)</button>
            <button class="cm-btn-leave">LEAVE</button>
          </div>
        </div>
      `;
      document.body.appendChild(el);
    }
    this.ui = el;

    el.querySelector('.cm-btn-rematch').addEventListener('click', () => {
      this.resetMatch();
    });
    el.querySelector('.cm-btn-leave').addEventListener('click', () => {
      this.stop();
    });
  }

  blips() {
    return this.spots.map((s) => ({
      x: s.bx,
      z: s.bz,
      color: '#ffd36b',
      r: 10,
      label: '⚪',
      name: `Carrom Adda (${s.uncle})`,
    }));
  }

  near(pos) {
    if (this.active) return null;
    for (const s of this.spots) {
      const d = Math.hypot(pos.x - s.bx, pos.z - s.bz);
      if (d < 2.2) {
        return {
          spot: s,
          text: `Play Carrom with ${s.uncle} · ₹${s.stake} to play`,
          act: (player) => this.start(player, s),
        };
      }
    }
    return null;
  }

  start(player, spot) {
    if (this.active || player.mode === 'driving' || player.dead) return;

    if (this.game.gameplay && this.game.gameplay.money < spot.stake) {
      this.hud.notify('NOT ENOUGH MONEY', `You need ₹${spot.stake} to play carrom with the uncles!`, '#ff5f6d');
      return;
    }

    if (this.game.gameplay) {
      this.game.gameplay.addMoney(-spot.stake, 'Carrom stake');
    }

    this.active = true;
    this.currentSpot = spot;
    this.config = CARROM_CONFIGS[spot.id] || CARROM_CONFIGS.esplanade;

    player.mode = 'carrom';
    player.pos.set(spot.bx, spot.by, spot.bz + 0.65);
    player.yaw = spot.yaw + Math.PI;

    this.initBoardPieces();
    this.setupPieces();

    this.turn = 'player';
    this.subState = 'aiming';
    this.queenPending = false;
    this.queenHolder = null;
    this.queenCovered = false;
    this.strikerX = 0;
    this.aimAngle = -Math.PI / 2;
    this.power = 0;
    this.chargeT = 0;

    this.ui.classList.remove('hidden');
    this.ui.querySelector('.cm-modal').classList.add('hidden');
    this.ui.querySelector('.cm-spot').textContent = spot.name.toUpperCase();
    this.ui.querySelector('.cm-uname').textContent = spot.uncle.toUpperCase();
    this.updateHUD();

    this.showUncleSay(pick(UNCLE_QUOTES.start), 4);
    if (this.audio) this.audio.pickup();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.ui.classList.add('hidden');

    // Remove piece meshes
    if (this.piecesGroup) {
      this.scene.remove(this.piecesGroup);
      this.piecesGroup = null;
    }
    this.pieces = [];

    const pl = this.game.player;
    if (pl && pl.mode === 'carrom') {
      pl.mode = 'foot';
      pl.ch.mode = 'move';
      pl.ch.poseFn = null;
    }
  }

  initBoardPieces() {
    if (this.piecesGroup) {
      this.scene.remove(this.piecesGroup);
    }
    this.piecesGroup = new THREE.Group();
    this.piecesGroup.position.set(this.currentSpot.bx, this.currentSpot.by + 0.662, this.currentSpot.bz);
    this.piecesGroup.rotation.y = this.currentSpot.yaw;

    // Piece geometries & materials
    const discGeo = new THREE.CylinderGeometry(this.DISC_R, this.DISC_R, 0.007, 24);
    const strikerGeo = new THREE.CylinderGeometry(this.STRIKER_R, this.STRIKER_R, 0.0085, 28);

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xfcf8f0, roughness: 0.32 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.35 });
    const queenMat = new THREE.MeshStandardMaterial({ color: 0xd81e35, roughness: 0.28 });
    const strikerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22 });

    this.materials = { white: whiteMat, black: blackMat, queen: queenMat, striker: strikerMat };
    this.geometries = { disc: discGeo, striker: strikerGeo };

    // Aim guide line mesh
    const guideGeo = new THREE.BufferGeometry();
    const guidePositions = new Float32Array(30 * 3);
    guideGeo.setAttribute('position', new THREE.BufferAttribute(guidePositions, 3));
    const guideMat = new THREE.LineDashedMaterial({
      color: 0x38f3ff,
      dashSize: 0.02,
      gapSize: 0.015,
      transparent: true,
      opacity: 0.85,
    });
    this.guideMesh = new THREE.Line(guideGeo, guideMat);
    this.guideMesh.computeLineDistances();
    this.piecesGroup.add(this.guideMesh);

    this.scene.add(this.piecesGroup);
  }

  setupPieces() {
    this.pieces = [];

    // Red Queen in center (0, 0)
    this.addPiece('queen', 0, 0);

    // Inner circle (6 pieces: 3 White, 3 Black alternating)
    const r1 = this.DISC_R * 2.02;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const type = i % 2 === 0 ? 'white' : 'black';
      this.addPiece(type, Math.cos(a) * r1, Math.sin(a) * r1);
    }

    // Outer circle (12 pieces: 6 White, 6 Black alternating)
    const r2 = this.DISC_R * 4.02;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      const type = i % 2 === 0 ? 'black' : 'white';
      this.addPiece(type, Math.cos(a) * r2, Math.sin(a) * r2);
    }

    // Striker
    this.striker = {
      id: 'striker',
      type: 'striker',
      x: 0,
      z: 0.255, // South baseline
      vx: 0,
      vz: 0,
      r: this.STRIKER_R,
      mass: 2.8,
      pocketed: false,
      mesh: new THREE.Mesh(this.geometries.striker, this.materials.striker),
    };
    this.piecesGroup.add(this.striker.mesh);
  }

  addPiece(type, x, z) {
    const mesh = new THREE.Mesh(this.geometries.disc, this.materials[type]);
    mesh.position.set(x, 0.0035, z);
    this.piecesGroup.add(mesh);

    this.pieces.push({
      id: `${type}_${this.pieces.length}`,
      type,
      x,
      z,
      vx: 0,
      vz: 0,
      r: this.DISC_R,
      mass: 1.0,
      pocketed: false,
      mesh,
    });
  }

  resetMatch() {
    if (this.game.gameplay && this.game.gameplay.money < this.config.stake) {
      this.hud.notify('NOT ENOUGH MONEY', `You need ₹${this.config.stake} to play again!`, '#ff5f6d');
      this.stop();
      return;
    }
    if (this.game.gameplay) {
      this.game.gameplay.addMoney(-this.config.stake, 'Carrom stake');
    }

    this.initBoardPieces();
    this.setupPieces();
    this.turn = 'player';
    this.subState = 'aiming';
    this.queenPending = false;
    this.queenHolder = null;
    this.queenCovered = false;
    this.strikerX = 0;
    this.aimAngle = -Math.PI / 2;
    this.power = 0;
    this.chargeT = 0;

    this.ui.querySelector('.cm-modal').classList.add('hidden');
    this.updateHUD();
    this.showUncleSay('Nao dada, nutun baji shuru holo! Bhalo kore khelo.', 3);
  }

  showUncleSay(text, duration = 3.5) {
    const say = this.ui.querySelector('.cm-say');
    say.textContent = `"${text}"`;
    say.classList.remove('hidden');
    clearTimeout(this._sayTimer);
    this._sayTimer = setTimeout(() => say.classList.add('hidden'), duration * 1000);
  }

  updateHUD() {
    const whiteLeft = this.pieces.filter((p) => p.type === 'white' && !p.pocketed).length;
    const blackLeft = this.pieces.filter((p) => p.type === 'black' && !p.pocketed).length;
    const queenPiece = this.pieces.find((p) => p.type === 'queen');

    this.ui.querySelector('.cm-left-white').textContent = whiteLeft;
    this.ui.querySelector('.cm-left-black').textContent = blackLeft;

    let qText = 'ON BOARD';
    if (this.queenCovered) {
      qText = `SECURED BY ${this.queenHolder === 'player' ? 'YOU' : this.config.uncle.toUpperCase()}`;
    } else if (this.queenPending) {
      qText = `PENDING COVER (${this.queenHolder === 'player' ? 'YOU' : this.config.uncle.toUpperCase()})`;
    } else if (queenPiece && queenPiece.pocketed) {
      qText = 'POCKETED';
    }
    this.ui.querySelector('.cm-qtext').textContent = qText;

    const badge = this.ui.querySelector('.cm-turn-badge');
    badge.className = `cm-turn-badge ${this.turn}`;
    badge.textContent = this.turn === 'player' ? 'YOUR TURN' : `${this.config.uncle.toUpperCase()}'S TURN`;

    const fill = this.ui.querySelector('.cm-meter-fill');
    fill.style.width = `${Math.round(this.power * 100)}%`;
  }

  camera(cam, dt) {
    if (!this.active || !this.currentSpot) return false;
    const spot = this.currentSpot;

    // Top-down overhead camera aligned with board
    const camY = spot.by + 1.28;
    const c = Math.cos(spot.yaw);
    const s = Math.sin(spot.yaw);

    // Slight offset towards player side for isometric depth
    const camX = spot.bx + s * 0.12;
    const camZ = spot.bz + c * 0.12;

    this.camTargetPos.set(camX, camY, camZ);
    this.camTargetLook.set(spot.bx, spot.by + 0.66, spot.bz);

    cam.position.copy(this.camTargetPos);
    cam.lookAt(this.camTargetLook);
    cam.fov = damp(cam.fov, 48, 8, dt);
    cam.updateProjectionMatrix();
    return true;
  }

  update(dt, T, input) {
    if (!this.active) return;

    // Update uncle animations
    for (const s of this.spots) {
      if (s.uncleChar) s.uncleChar.update(dt, T);
    }

    if (input.hit('Escape')) {
      this.stop();
      return;
    }

    // State machine
    switch (this.subState) {
      case 'aiming':
      case 'charging':
        if (this.turn === 'player') {
          this.handlePlayerInput(dt, input);
        } else {
          this.handleAITurn(dt);
        }
        break;

      case 'moving':
        this.stepPhysics(dt);
        break;

      case 'evaluating':
        this.evaluateTurn();
        break;
    }

    this.updateVisuals();
  }

  handlePlayerInput(dt, input) {
    // 1. Slide striker along baseline with A/D or Left/Right
    let move = 0;
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) move -= 1;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) move += 1;
    if (move !== 0) {
      this.strikerX = clamp(this.strikerX + move * 0.35 * dt, -0.21, 0.21);
      this.striker.x = this.strikerX;
      this.striker.z = 0.255;
    }

    // 2. Aim with mouse movement
    const { dx } = input.mouse;
    if (dx) {
      this.aimAngle = clamp(this.aimAngle - dx * 0.003, -Math.PI + 0.15, -0.15);
    }

    // 3. Charge power and strike with SPACE
    if (input.keys.has('Space')) {
      this.subState = 'charging';
      this.chargeT += dt;
      // Oscillate power between 0.1 and 1.0
      this.power = 0.1 + 0.9 * (0.5 - 0.5 * Math.cos(this.chargeT * 3.8));
      this.updateHUD();
    } else if (this.subState === 'charging') {
      // Released SPACE: flick striker!
      this.shoot(this.aimAngle, this.power);
    }
  }

  handleAITurn(dt) {
    if (this.subState === 'aiming') {
      this.aiTimer += dt;
      if (this.aiTimer > 1.2) {
        this.calculateAIShot();
        this.subState = 'charging';
        this.chargeT = 0;
      }
    } else if (this.subState === 'charging') {
      this.chargeT += dt;
      const targetCharge = this.aiPower;
      this.power = Math.min(targetCharge, this.chargeT * 1.5);
      this.updateHUD();
      if (this.chargeT > targetCharge / 1.5 + 0.3) {
        this.shoot(this.aiAimAngle, this.aiPower);
      }
    }
  }

  calculateAIShot() {
    // AI Uncle plays as Black from North baseline (z = -0.255)
    const activeBlacks = this.pieces.filter((p) => p.type === 'black' && !p.pocketed);
    const queen = this.pieces.find((p) => p.type === 'queen' && !p.pocketed);

    // Target Queen if pending or open, else Black pieces
    const targets = this.queenPending && this.queenHolder === 'ai' ? activeBlacks : queen ? [queen, ...activeBlacks] : activeBlacks;

    let bestScore = -999;
    let bestX = 0;
    let bestAngle = Math.PI / 2;
    let bestPower = 0.7;

    for (const t of targets) {
      for (const [px, pz] of this.POCKET_POS) {
        // Line from target to pocket
        const dx = px - t.x;
        const dz = pz - t.z;
        const distToPocket = Math.hypot(dx, dz);
        if (distToPocket < 0.001) continue;

        const nx = dx / distToPocket;
        const nz = dz / distToPocket;

        // Ideal contact point for striker
        const hitX = t.x - nx * (this.DISC_R + this.STRIKER_R);
        const hitZ = t.y - nz * (this.DISC_R + this.STRIKER_R);

        // Striker baseline position (z = -0.255)
        const sX = clamp(hitX, -0.21, 0.21);
        const sZ = -0.255;

        // Vector from striker to hit point (must point South: dsz > 0.05)
        const dsx = hitX - sX;
        const dsz = hitZ - sZ;
        if (dsz < 0.04) continue;

        const distToHit = Math.hypot(dsx, dsz);
        const shotAngle = Math.atan2(dsz, dsx);

        // Score based on alignment and closeness to pocket
        const alignment = (dsx / distToHit) * nx + (dsz / distToHit) * nz;
        const score = alignment * 2.0 - distToPocket * 1.2 - distToHit * 0.8;

        if (score > bestScore) {
          bestScore = score;
          bestX = sX;
          bestAngle = shotAngle;
          bestPower = clamp(0.4 + (distToHit + distToPocket) * 0.6, 0.45, 0.95);
        }
      }
    }

    // Apply small humanized error
    const jitter = (Math.random() - 0.5) * this.config.errorAngle;
    this.strikerX = bestX;
    this.striker.x = bestX;
    this.striker.z = -0.255;
    this.aiAimAngle = bestAngle + jitter;
    this.aiPower = bestPower;
  }

  shoot(angle, power) {
    this.subState = 'moving';
    this.guideMesh.visible = false;

    const speed = 0.9 + power * 2.6; // max ~3.5 m/s
    this.striker.vx = Math.cos(angle) * speed;
    this.striker.vz = Math.sin(angle) * speed;

    if (this.audio) this.audio.carromFlick(power);

    // Reset shot tracking
    this.pocketedOnShot = [];
    this.strikerPocketed = false;
  }

  stepPhysics(dt) {
    // Sub-stepping to prevent tunnelling at high speed
    const subSteps = 10;
    const sdt = Math.min(dt, 0.04) / subSteps;
    const allDiscs = [this.striker, ...this.pieces.filter((p) => !p.pocketed)];

    for (let step = 0; step < subSteps; step++) {
      // 1. Move discs & check pockets
      for (const d of allDiscs) {
        if (d.pocketed) continue;
        d.x += d.vx * sdt;
        d.z += d.vz * sdt;

        // Check pockets
        for (const [px, pz] of this.POCKET_POS) {
          if (Math.hypot(d.x - px, d.z - pz) < this.POCKET_R) {
            d.pocketed = true;
            d.vx = 0;
            d.vz = 0;
            if (d.id === 'striker') {
              this.strikerPocketed = true;
            } else {
              this.pocketedOnShot.push(d);
            }
            if (this.audio) this.audio.carromPocket();
            break;
          }
        }

        // 2. Wall cushion rebounds
        const B = this.HALF_BOARD;
        if (d.x - d.r < -B) {
          d.x = -B + d.r;
          d.vx = -d.vx * 0.88;
          d.vz *= 0.95;
          if (this.audio && Math.abs(d.vx) > 0.15) this.audio.carromBumper(Math.abs(d.vx));
        } else if (d.x + d.r > B) {
          d.x = B - d.r;
          d.vx = -d.vx * 0.88;
          d.vz *= 0.95;
          if (this.audio && Math.abs(d.vx) > 0.15) this.audio.carromBumper(Math.abs(d.vx));
        }
        if (d.z - d.r < -B) {
          d.z = -B + d.r;
          d.vz = -d.vz * 0.88;
          d.vx *= 0.95;
          if (this.audio && Math.abs(d.vz) > 0.15) this.audio.carromBumper(Math.abs(d.vz));
        } else if (d.z + d.r > B) {
          d.z = B - d.r;
          d.vz = -d.vz * 0.88;
          d.vx *= 0.95;
          if (this.audio && Math.abs(d.vz) > 0.15) this.audio.carromBumper(Math.abs(d.vz));
        }
      }

      // 3. Disc-to-disc collisions
      for (let i = 0; i < allDiscs.length; i++) {
        const p1 = allDiscs[i];
        if (p1.pocketed) continue;
        for (let j = i + 1; j < allDiscs.length; j++) {
          const p2 = allDiscs[j];
          if (p2.pocketed) continue;

          const dx = p2.x - p1.x;
          const dz = p2.z - p1.z;
          const dist2 = dx * dx + dz * dz;
          const minD = p1.r + p2.r;

          if (dist2 < minD * minD && dist2 > 1e-8) {
            const dist = Math.sqrt(dist2);
            const nx = dx / dist;
            const nz = dz / dist;

            // Separate overlapping discs
            const overlap = (minD - dist) * 0.5;
            p1.x -= nx * overlap;
            p1.z -= nz * overlap;
            p2.x += nx * overlap;
            p2.z += nz * overlap;

            // Elastic momentum exchange
            const rvx = p1.vx - p2.vx;
            const rvz = p1.vz - p2.vz;
            const velNormal = rvx * nx + rvz * nz;

            if (velNormal > 0) {
              const e = 0.92;
              const impulse = (1 + e) * velNormal / (1 / p1.mass + 1 / p2.mass);
              p1.vx -= (impulse / p1.mass) * nx;
              p1.vz -= (impulse / p1.mass) * nz;
              p2.vx += (impulse / p2.mass) * nx;
              p2.vz += (impulse / p2.mass) * nz;

              if (this.audio && Math.abs(velNormal) > 0.08) {
                this.audio.carromClack(Math.abs(velNormal));
              }
            }
          }
        }
      }

      // 4. Surface friction (boric powder smooth glide)
      for (const d of allDiscs) {
        if (d.pocketed) continue;
        const spd = Math.hypot(d.vx, d.vz);
        if (spd > 0) {
          const newSpd = Math.max(0, spd - (0.64 + spd * 0.28) * sdt);
          const f = newSpd / spd;
          d.vx *= f;
          d.vz *= f;
          if (spd < 0.006) {
            d.vx = 0;
            d.vz = 0;
          }
        }
      }
    }

    // Check if all pieces have come to a standstill
    let moving = false;
    for (const d of allDiscs) {
      if (!d.pocketed && Math.hypot(d.vx, d.vz) > 0.005) {
        moving = true;
        break;
      }
    }

    if (!moving) {
      this.subState = 'evaluating';
    }
  }

  evaluateTurn() {
    const isPlayer = this.turn === 'player';
    const myColor = isPlayer ? 'white' : 'black';
    const oppColor = isPlayer ? 'black' : 'white';

    const myPocketed = this.pocketedOnShot.filter((p) => p.type === myColor);
    const oppPocketed = this.pocketedOnShot.filter((p) => p.type === oppColor);
    const queenPocketed = this.pocketedOnShot.find((p) => p.type === 'queen');

    let extraTurn = false;

    // 1. Foul: striker was pocketed
    if (this.strikerPocketed) {
      this.showUncleSay(pick(UNCLE_QUOTES.foul), 3.5);
      // Return 1 of player's pocketed piece to center as penalty
      const myPocketedAll = this.pieces.filter((p) => p.type === myColor && p.pocketed);
      if (myPocketedAll.length > 0) {
        const pen = myPocketedAll[0];
        pen.pocketed = false;
        pen.x = 0;
        pen.z = (Math.random() - 0.5) * 0.06;
      }
      if (this.queenPending) {
        // Queen was not covered: return to center
        const qp = this.pieces.find((p) => p.type === 'queen');
        if (qp) {
          qp.pocketed = false;
          qp.x = 0;
          qp.z = 0;
        }
        this.queenPending = false;
      }
      extraTurn = false;
    } else {
      // 2. Queen Coverage Logic
      if (this.queenPending) {
        if (myPocketed.length > 0) {
          // Successfully covered Queen!
          this.queenCovered = true;
          this.queenPending = false;
          this.showUncleSay(pick(UNCLE_QUOTES.queenCovered), 3.5);
          extraTurn = true;
        } else {
          // Failed to cover Queen: return Queen to center
          const qp = this.pieces.find((p) => p.type === 'queen');
          if (qp) {
            qp.pocketed = false;
            qp.x = 0;
            qp.z = 0;
          }
          this.queenPending = false;
          this.showUncleSay('Queen ta cover korte parle na dada! Board-e fire gelo.', 3.5);
          extraTurn = false;
        }
      } else if (queenPocketed) {
        // Pocketed Queen on this shot: must cover on next shot!
        this.queenPending = true;
        this.queenHolder = this.turn;
        this.showUncleSay(pick(UNCLE_QUOTES.queenPocket), 3.5);
        extraTurn = true;
      } else if (myPocketed.length > 0) {
        // Valid pocket of own piece: gets another turn!
        this.showUncleSay(pick(UNCLE_QUOTES.goodShot), 3.0);
        extraTurn = true;
      } else {
        if (oppPocketed.length > 0) {
          this.showUncleSay('Opponent-er guti pocket-e fele dile!', 3.0);
        }
        extraTurn = false;
      }
    }

    this.updateHUD();

    // 3. Win Condition Check
    const whiteLeft = this.pieces.filter((p) => p.type === 'white' && !p.pocketed).length;
    const blackLeft = this.pieces.filter((p) => p.type === 'black' && !p.pocketed).length;

    if (whiteLeft === 0 && !this.queenPending) {
      this.handleGameOver('player');
      return;
    }
    if (blackLeft === 0 && !this.queenPending) {
      this.handleGameOver('ai');
      return;
    }

    // 4. Turn Transition
    if (!extraTurn) {
      this.turn = this.turn === 'player' ? 'ai' : 'player';
    }

    // Reset striker for next shot
    this.striker.pocketed = false;
    this.striker.vx = 0;
    this.striker.vz = 0;
    this.strikerX = 0;
    this.striker.x = 0;
    this.striker.z = this.turn === 'player' ? 0.255 : -0.255;
    this.aimAngle = this.turn === 'player' ? -Math.PI / 2 : Math.PI / 2;
    this.power = 0;
    this.chargeT = 0;
    this.aiTimer = 0;

    this.subState = 'aiming';
    this.guideMesh.visible = true;
    this.updateHUD();
  }

  handleGameOver(winner) {
    this.subState = 'game_over';
    this.guideMesh.visible = false;

    const modal = this.ui.querySelector('.cm-modal');
    const title = this.ui.querySelector('.cm-mtitle');
    const text = this.ui.querySelector('.cm-mtext');

    if (winner === 'player') {
      title.textContent = '🏆 VICTORY! CARROM CHAMPION';
      title.style.color = 'var(--gold)';
      text.textContent = `You cleared the board and defeated ${this.config.uncle}! You won ₹${this.config.prize} prize money.`;
      if (this.game.gameplay) {
        this.game.gameplay.addMoney(this.config.prize, 'Carrom prize');
      }
      if (this.game.progress) {
        this.game.progress.event('carromKing');
      }
      this.showUncleSay(pick(UNCLE_QUOTES.playerWin), 4.5);
    } else {
      title.textContent = 'DEFEAT!';
      title.style.color = '#ff5f6d';
      text.textContent = `${this.config.uncle} cleared all pieces first. Better luck next time!`;
      this.showUncleSay(pick(UNCLE_QUOTES.aiWin), 4.5);
    }

    modal.classList.remove('hidden');
  }

  updateVisuals() {
    // Sync piece mesh positions
    for (const p of this.pieces) {
      if (p.pocketed) {
        p.mesh.position.y = -0.5; // drop below board
      } else {
        p.mesh.position.set(p.x, 0.0035, p.z);
      }
    }

    // Sync striker mesh
    if (this.striker.pocketed) {
      this.striker.mesh.position.y = -0.5;
    } else {
      this.striker.mesh.position.set(this.striker.x, 0.0042, this.striker.z);
    }

    // Update aim guide line
    if (this.guideMesh && this.guideMesh.visible && (this.subState === 'aiming' || this.subState === 'charging')) {
      const sx = this.striker.x;
      const sz = this.striker.z;
      const angle = this.turn === 'player' ? this.aimAngle : this.aiAimAngle;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);

      const pos = this.guideMesh.geometry.attributes.position.array;
      for (let i = 0; i < 30; i++) {
        const d = (i / 30) * 0.45;
        pos[i * 3] = sx + dx * d;
        pos[i * 3 + 1] = 0.005;
        pos[i * 3 + 2] = sz + dz * d;
      }
      this.guideMesh.geometry.attributes.position.needsUpdate = true;
      this.guideMesh.computeLineDistances();
    }
  }
}
Carrom.boardTexture = null;
