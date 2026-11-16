// All sound is synthesised with WebAudio — engine, tyres, wind, impacts and a synthwave radio.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.radioOn = true;
  }

  init() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);

    // Noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Engine: detuned saws + sub, amplitude-modulated for a "firing" pulse
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.Q.value = 3;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engAM = ctx.createGain();
    this.engAM.gain.value = 0.7;
    this.engFilter.connect(this.engAM).connect(this.engGain).connect(this.master);
    this.oscs = [
      ['sawtooth', 1, 0.5],
      ['sawtooth', 1.005, 0.4],
      ['square', 0.5, 0.35],
      ['sine', 0.25, 0.6],
    ].map(([type, mul, g]) => {
      const o = ctx.createOscillator();
      o.type = type;
      const gg = ctx.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(this.engFilter);
      o.start();
      return { o, mul };
    });
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    this.lfo.connect(lfoGain).connect(this.engAM.gain);
    this.lfo.start();

    // Tyre screech
    this.screech = this.loopNoise('bandpass', 1900, 5);
    // Wind
    this.wind = this.loopNoise('lowpass', 500, 0.7);

    // Horn
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    this.hornGain.connect(this.master);
    for (const f of [392, 494]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      o.connect(lp).connect(this.hornGain);
      o.start();
    }

    this.initRadio();
  }

  loopNoise(type, freq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return { g, f };
  }

  update({ rpm, throttle, speed, skid, nitro, engineOn = true }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 42 + rpm * 150;
    for (const { o, mul } of this.oscs) o.frequency.setTargetAtTime(f * mul, t, 0.04);
    this.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    this.engFilter.frequency.setTargetAtTime(300 + rpm * 2200 * (0.35 + throttle * 0.65) + (nitro ? 900 : 0), t, 0.05);
    this.engGain.gain.setTargetAtTime(engineOn ? 0.06 + throttle * 0.08 + rpm * 0.04 : 0, t, 0.15);
    this.screech.g.gain.setTargetAtTime(skid * 0.12, t, 0.05);
    this.screech.f.frequency.setTargetAtTime(1700 + skid * 600, t, 0.1);
    this.wind.g.gain.setTargetAtTime(Math.min(1, speed / 70) * 0.12, t, 0.2);
  }

  horn(on) {
    if (!this.ctx) return;
    this.hornGain.gain.setTargetAtTime(on ? 0.09 : 0, this.ctx.currentTime, 0.02);
  }

  impact(strength) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600 + strength * 60;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.9, 0.15 + strength * 0.04), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.5);
    this.tone(70, 0.3, 'sine', Math.min(0.5, strength * 0.03), 30);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, endFreq = null, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  honk(dist = 10) {
    if (!this.ctx) return;
    const v = Math.min(0.08, 0.6 / Math.max(dist, 3));
    [349, 440].forEach((f) => this.tone(f, 0.45, 'square', v));
  }
  pickup() {
    [880, 1109, 1319, 1760].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, null, i * 0.05));
  }
  beep(high = false) {
    this.tone(high ? 1320 : 660, 0.25, 'square', 0.08);
  }
  fanfare() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'square', 0.07, null, i * 0.12));
  }
  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.8);
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }
  toggleRadio() {
    this.radioOn = !this.radioOn;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(this.radioOn ? 0.22 : 0, this.ctx.currentTime, 0.3);
    return this.radioOn;
  }

  /* ---------- Procedural synthwave radio ---------- */
  initRadio() {
    const ctx = this.ctx;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.radioOn ? 0.22 : 0;
    this.musicGain.connect(this.master);
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / 96) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2500;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(this.musicGain);
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.2;
    this.stepDur = 60 / 96 / 4;
    // Am - F - C - G
    this.prog = [
      [57, 60, 64, 69],
      [53, 57, 60, 65],
      [48, 52, 55, 60],
      [55, 59, 62, 67],
    ];
    setInterval(() => this.schedule(), 25);
  }

  schedule() {
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step++;
    }
  }

  note(midi, t, dur, type, vol, cutoff, toDelay = false) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.3), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.musicGain);
    if (toDelay) g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  drum(t, kind) {
    const ctx = this.ctx;
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(this.musicGain);
      o.start(t);
      o.stop(t + 0.4);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 8000 : 1800;
    const g = ctx.createGain();
    const dur = kind === 'hat' ? 0.05 : 0.22;
    g.gain.setValueAtTime(kind === 'hat' ? 0.18 : 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.musicGain);
    if (kind === 'snare') g.connect(this.delay);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  playStep(i, t) {
    const s = i % 16;
    const bar = Math.floor(i / 16) % 4;
    const ch = this.prog[bar];
    const section = Math.floor(i / 128) % 2;
    if (s % 4 === 0) this.drum(t, 'kick');
    if (s === 4 || s === 12) this.drum(t, 'snare');
    if (s % 2 === 1) this.drum(t, 'hat');
    if (s % 2 === 0) this.note(ch[0] - 24, t, this.stepDur * 1.8, 'sawtooth', 0.22, 700);
    const arp = [0, 1, 2, 3, 2, 1, 0, 2];
    const n = ch[arp[s % 8]] + (s >= 8 ? 12 : 0);
    this.note(n, t, this.stepDur * 0.9, section ? 'square' : 'triangle', 0.06, 3200, true);
    if (s === 0) {
      for (const m of ch.slice(0, 3)) this.note(m, t, this.stepDur * 15, 'sawtooth', 0.025, 1400);
    }
  }
}
