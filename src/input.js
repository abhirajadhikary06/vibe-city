export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, horn: false };
    this.mouse = { dx: 0, dy: 0, down: false };
    this.locked = false;
    this.wheelOpen = false;
    this.wheelVec = { x: 0, y: 0 };
    this.wheelPick = null;
    this.onWheel = null; // (open, vec) => label | null

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this.pressed.add('Mouse' + e.button);
    });
    addEventListener('mouseup', () => (this.mouse.down = false));
    addEventListener('mousemove', (e) => {
      if (this.wheelOpen) {
        this.wheelVec.x += e.movementX;
        this.wheelVec.y += e.movementY;
        const l = Math.hypot(this.wheelVec.x, this.wheelVec.y);
        if (l > 120) {
          this.wheelVec.x *= 120 / l;
          this.wheelVec.y *= 120 / l;
        }
        return;
      }
      if (this.locked || this.mouse.down) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  lock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch {
        /* pointer lock unavailable */
      }
    }
  }

  poll() {
    const k = this.keys;
    const s = this.state;
    s.throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    s.brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    s.steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    s.handbrake = k.has('Space');
    s.nitro = k.has('ShiftLeft') || k.has('ShiftRight');
    s.horn = k.has('KeyH');

    // Gesture wheel: hold Tab, move mouse, release to pick
    const tab = k.has('Tab');
    if (tab && !this.wheelOpen) {
      this.wheelOpen = true;
      this.wheelVec = { x: 0, y: 0 };
    }
    if (this.onWheel && this.wheelOpen) {
      const sel = this.onWheel(tab, this.wheelVec);
      if (!tab) {
        this.wheelOpen = false;
        if (sel) this.wheelPick = sel;
      }
    } else if (!tab) this.wheelOpen = false;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (gp) {
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.12) s.steer = ax;
      const rt = gp.buttons[7]?.value || 0;
      const lt = gp.buttons[6]?.value || 0;
      if (rt > 0.05) s.throttle = rt;
      if (lt > 0.05) s.brake = lt;
      if (gp.buttons[0]?.pressed) s.handbrake = true;
      if (gp.buttons[1]?.pressed || gp.buttons[5]?.pressed) s.nitro = true;
      const rx = gp.axes[2] || 0;
      const ry = gp.axes[3] || 0;
      if (Math.abs(rx) > 0.15) this.mouse.dx += rx * 14;
      if (Math.abs(ry) > 0.15) this.mouse.dy += ry * 10;
      const edge = (i, code) => {
        const p = !!gp.buttons[i]?.pressed;
        if (p && !this['_gp' + i]) this.pressed.add(code);
        this['_gp' + i] = p;
      };
      edge(3, 'KeyF');
      edge(2, 'KeyE');
      edge(4, 'KeyC');
    }
    return s;
  }

  hit(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
  }
}
