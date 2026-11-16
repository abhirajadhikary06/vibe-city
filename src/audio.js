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

  update({ rpm, throttle, speed, skid, nitro, engineOn = true, pitch = 1 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = (42 + rpm * 150) * pitch;
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

  /** Filtered noise burst routed to the master bus. */
  burst(t, { type = 'lowpass', freq = 1000, endFreq = null, q = 0.8, vol = 0.3, dur = 0.3 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** Gunshot: a sharp crack, a body thump and a couple of quieter street echoes. */
  gunshot(kind, dist = 0) {
    if (!this.ctx) return;
    const S = {
      pistol: { crack: 2600, body: 900, vol: 0.5, dur: 0.16, thump: 120, echo: 0.35 },
      smg: { crack: 3200, body: 1100, vol: 0.38, dur: 0.1, thump: 140, echo: 0.2 },
      shotgun: { crack: 1500, body: 600, vol: 0.75, dur: 0.38, thump: 70, echo: 0.5 },
      rifle: { crack: 3000, body: 1000, vol: 0.55, dur: 0.15, thump: 100, echo: 0.4 },
      sniper: { crack: 3600, body: 700, vol: 0.85, dur: 0.32, thump: 60, echo: 0.8 },
    }[kind] || { crack: 2600, body: 900, vol: 0.5, dur: 0.16, thump: 120, echo: 0.3 };
    const att = 1 / (1 + dist * 0.05);
    const t = this.ctx.currentTime;
    const v = S.vol * att;
    this.burst(t, { type: 'highpass', freq: S.crack, q: 0.7, vol: v * 0.9, dur: 0.05 + S.dur * 0.25 });
    this.burst(t, { type: 'lowpass', freq: S.body * (dist > 40 ? 0.5 : 1), endFreq: 120, vol: v, dur: S.dur });
    this.tone(S.thump, S.dur * 1.2, 'sine', v * 0.8, 35);
    for (let i = 1; i <= 2; i++) this.burst(t + 0.09 * i + Math.random() * 0.05, { type: 'bandpass', freq: 700, q: 0.6, vol: v * S.echo * (0.45 / i), dur: S.dur * 2 });
  }
  dryFire() {
    this.tone(1800, 0.03, 'square', 0.05);
  }
  reload() {
    if (!this.ctx) return;
    [0, 0.35, 0.7].forEach((d, i) => {
      this.tone(i === 1 ? 900 : 1400, 0.04, 'square', 0.05, null, d);
      this.burst(this.ctx.currentTime + d, { type: 'highpass', freq: 3000, vol: 0.08, dur: 0.05 });
    });
  }
  swing() {
    if (!this.ctx) return;
    this.burst(this.ctx.currentTime, { type: 'bandpass', freq: 600, endFreq: 1800, q: 1.5, vol: 0.12, dur: 0.18 });
  }
  hitFlesh(strong = false) {
    if (!this.ctx) return;
    this.burst(this.ctx.currentTime, { type: 'lowpass', freq: strong ? 700 : 1100, vol: strong ? 0.5 : 0.3, dur: 0.12 });
    this.tone(strong ? 90 : 140, 0.12, 'sine', 0.3, 50);
  }
  ricochet(dist = 0) {
    if (!this.ctx || Math.random() > 0.35) return;
    const v = 0.06 / (1 + dist * 0.05);
    this.tone(2400 + Math.random() * 1500, 0.22, 'sine', v, 700);
  }
  metalHit(dist = 0) {
    if (!this.ctx) return;
    const v = 0.18 / (1 + dist * 0.05);
    this.tone(1300 + Math.random() * 600, 0.15, 'triangle', v, 600);
    this.burst(this.ctx.currentTime, { type: 'highpass', freq: 2500, vol: v, dur: 0.06 });
  }
  explosion(dist = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, 1.6 / (1 + dist * 0.03));
    this.burst(t, { type: 'lowpass', freq: 1400, endFreq: 80, vol: v, dur: 1.8 });
    this.burst(t, { type: 'highpass', freq: 1500, vol: v * 0.4, dur: 0.12 });
    this.tone(55, 1.2, 'sine', v * 0.9, 25);
    this.burst(t + 0.25, { type: 'bandpass', freq: 400, q: 0.5, vol: v * 0.3, dur: 1.4 });
  }
  trainHorn(dist = 0) {
    if (!this.ctx) return;
    const v = Math.min(0.12, 2.5 / Math.max(dist, 8));
    for (const f of [277, 349, 415]) this.tone(f, 1.3, 'sawtooth', v * 0.5);
  }
  tramBell(dist = 0) {
    if (!this.ctx) return;
    const v = Math.min(0.12, 2 / Math.max(dist, 6));
    [0, 0.28].forEach((d) => {
      this.tone(1568, 0.6, 'sine', v, null, d);
      this.tone(3136, 0.3, 'sine', v * 0.4, null, d);
    });
  }
  metroChime(dist = 0) {
    if (!this.ctx) return;
    const v = Math.min(0.1, 2 / Math.max(dist, 6));
    [[988, 0], [784, 0.32], [659, 0.64]].forEach(([f, d]) => this.tone(f, 0.5, 'sine', v, null, d));
  }
  hurt() {
    this.tone(220, 0.18, 'sawtooth', 0.06, 110);
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
