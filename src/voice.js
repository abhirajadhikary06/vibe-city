import { bengali } from './lines.js';

/*
 * People speak Bengali out loud. Every line in lines.js was recorded with a
 * Bengali voice (tools/gen-voices.mjs) into public/voices/; clips play through
 * the game's audio graph, panned to the speaker and quieter with distance.
 * Men's voices are the same recording pitched down. Lines without a clip fall
 * back to the browser's Bengali speech voice, if it has one.
 */

const BASE = `${import.meta.env.BASE_URL}voices/`;

const load = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : v === '1';
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, v ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
};

export class Voices {
  constructor(audio) {
    this.audio = audio; // AudioEngine: its context and master bus
    this.enabled = load('kol_voices', true);
    this.muted = false;
    this.index = null;
    this.buffers = new Map();
    this.busyUntil = 0;
    this.current = null;
    fetch(`${BASE}index.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (this.index = j))
      .catch(() => {});
    this.tts = typeof speechSynthesis !== 'undefined';
    this.bnVoice = null;
    if (this.tts) {
      const pick = () => (this.bnVoice = speechSynthesis.getVoices().find((v) => /^bn/i.test(v.lang)) || null);
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    save('kol_voices', on);
    if (!on) this.stop();
  }
  stop() {
    if (this.current) {
      try {
        this.current.stop();
      } catch {
        /* already stopped */
      }
      this.current = null;
    }
    if (this.tts) speechSynthesis.cancel();
  }

  async buffer(file) {
    if (this.buffers.has(file)) return this.buffers.get(file);
    const p = fetch(BASE + file)
      .then((r) => r.arrayBuffer())
      .then((b) => this.audio.ctx.decodeAudioData(b))
      .catch(() => null);
    this.buffers.set(file, p);
    return p;
  }

  /**
   * Say a line. dist: metres from the listener; pan: -1 (left) .. 1 (right).
   * priority lines (said to or by the player) cut in; ambient chatter waits its turn.
   */
  speak(text, { female = false, dist = 5, pan = 0, priority = false, seed = 0 } = {}) {
    if (!this.enabled || this.muted || dist > 30) return;
    const now = performance.now();
    if (!priority && now < this.busyUntil) return;
    // every speaker sounds a little different
    const r = Math.abs(Math.sin(seed * 12.9898 + 1) * 43758.5453) % 1;
    const rate = female ? 0.98 + r * 0.12 : 0.8 + r * 0.1;
    const vol = Math.max(0.12, Math.min(1, 1.25 - dist / 22));
    const file = this.index && this.index[text.trim()];
    const ctx = this.audio.ctx;
    if (file && ctx) {
      this.busyUntil = now + 900;
      this.buffer(file).then((buf) => {
        if (!buf || !this.enabled || this.muted) return;
        if (priority) this.stop();
        else if (this.current) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate;
        const g = ctx.createGain();
        g.gain.value = vol * 1.6;
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
        src.connect(g).connect(p).connect(this.audio.master);
        src.start();
        this.current = src;
        this.busyUntil = performance.now() + (buf.duration / rate) * 1000 + 300;
        src.onended = () => {
          if (this.current === src) this.current = null;
        };
      });
      return;
    }
    // No recording: the browser's Bengali voice, if there is one
    const bn = bengali(text.trim());
    if (!this.tts || !this.bnVoice || !bn) return;
    if (!priority && speechSynthesis.speaking) return;
    if (priority) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(bn);
    u.voice = this.bnVoice;
    u.lang = this.bnVoice.lang;
    u.pitch = female ? 1.1 : 0.7;
    u.rate = 0.95 + r * 0.1;
    u.volume = vol;
    speechSynthesis.speak(u);
    this.busyUntil = now + 1200;
  }
}
