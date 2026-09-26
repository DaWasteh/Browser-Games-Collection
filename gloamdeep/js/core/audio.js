// Procedural sound: every effect and the ambient music are synthesised with the Web Audio API.
// Nothing is loaded from files or the network.

const PENTA_MINOR = [0, 3, 5, 7, 10];
const PENTA_MAJOR = [0, 2, 4, 7, 9];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.musicVolume = 0.5;
    this.muted = false;
    this.lastPlayed = new Map();
    this.mode = null;
    this.musicTimer = 0;
    this.droneNodes = [];
    this.intensity = 0;
  }

  /** Must be called from a user gesture (browsers block audio before one). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 4;
    this.comp.connect(this.master);
    this.sfx = c.createGain();
    this.sfx.connect(this.comp);
    this.music = c.createGain();
    this.music.connect(this.comp);
    // shared reverb
    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(2.8, 2.2);
    this.reverbGain = c.createGain();
    this.reverbGain.gain.value = 0.35;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.comp);
    this.sfxSend = c.createGain();
    this.sfxSend.gain.value = 0.18;
    this.sfxSend.connect(this.reverb);
    this.noiseBuf = this._noiseBuffer(2);
    this.applyVolumes();
    if (this.mode) { const m = this.mode; this.mode = null; this.setMode(m); }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volume * 0.9, t, 0.05);
    this.music.gain.setTargetAtTime(this.musicVolume * 0.55, t, 0.3);
  }

  setVolume(v) { this.volume = v; this.applyVolumes(); }
  setMusicVolume(v) { this.musicVolume = v; this.applyVolumes(); }
  setMuted(m) { this.muted = m; this.applyVolumes(); }

  _noiseBuffer(seconds) {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _impulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /** Oscillator voice with an attack/decay envelope and optional pitch slide + filter. */
  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, attack = 0.005, delay = 0, filter = 0, q = 1, out = null, send = true, detune = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      f.Q.value = q;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out || this.sfx);
    if (send && !out) g.connect(this.sfxSend);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Filtered noise burst. */
  noise(dur, { vol = 0.2, type = 'lowpass', freq = 1200, endFreq = 0, q = 0.8, delay = 0, attack = 0.003, out = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out || this.sfx);
    if (!out) g.connect(this.sfxSend);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  play(name, vol = 1) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const last = this.lastPlayed.get(name) || 0;
    if (now - last < 45) return; // throttle identical sounds
    this.lastPlayed.set(name, now);
    const v = vol;
    const r = () => 0.92 + Math.random() * 0.16;
    switch (name) {
      case 'swing': this.noise(0.13, { vol: 0.16 * v, type: 'bandpass', freq: 900 * r(), endFreq: 2600, q: 1.2 }); break;
      case 'swingHeavy': this.noise(0.2, { vol: 0.2 * v, type: 'bandpass', freq: 500 * r(), endFreq: 1500, q: 1.1 }); break;
      case 'hit':
        this.noise(0.08, { vol: 0.28 * v, freq: 1800 * r(), endFreq: 300 });
        this.tone(140 * r(), 0.09, { type: 'square', vol: 0.09 * v, slide: 0.5, filter: 900 });
        break;
      case 'crit':
        this.noise(0.12, { vol: 0.3 * v, freq: 3200, endFreq: 400 });
        this.tone(220, 0.14, { type: 'sawtooth', vol: 0.1 * v, slide: 0.4, filter: 1600 });
        this.tone(1320, 0.1, { type: 'triangle', vol: 0.06 * v, delay: 0.01 });
        break;
      case 'hurt':
        this.tone(180, 0.22, { type: 'sawtooth', vol: 0.16 * v, slide: 0.45, filter: 1200 });
        this.noise(0.12, { vol: 0.2 * v, freq: 900, endFreq: 200 });
        break;
      case 'enemyDie':
        this.noise(0.3, { vol: 0.22 * v, freq: 1400 * r(), endFreq: 120 });
        this.tone(110 * r(), 0.3, { type: 'square', vol: 0.07 * v, slide: 0.35, filter: 700 });
        break;
      case 'ember':
        this.noise(0.28, { vol: 0.16 * v, type: 'bandpass', freq: 600, endFreq: 1800, q: 0.7 });
        this.tone(320 * r(), 0.22, { type: 'sawtooth', vol: 0.06 * v, slide: 1.8, filter: 1400 });
        break;
      case 'frost':
        this.tone(1760 * r(), 0.16, { type: 'triangle', vol: 0.08 * v, slide: 0.6 });
        this.tone(2640 * r(), 0.12, { type: 'sine', vol: 0.05 * v, delay: 0.02 });
        this.noise(0.14, { vol: 0.1 * v, type: 'highpass', freq: 4000 });
        break;
      case 'storm':
        this.noise(0.22, { vol: 0.28 * v, type: 'highpass', freq: 1800, endFreq: 5000 });
        this.tone(90, 0.2, { type: 'sawtooth', vol: 0.1 * v, slide: 2.2, filter: 3000 });
        break;
      case 'void':
        this.tone(70, 0.6, { type: 'sine', vol: 0.22 * v, slide: 2.5, attack: 0.05 });
        this.tone(140, 0.5, { type: 'sawtooth', vol: 0.05 * v, slide: 2, filter: 600 });
        break;
      case 'explode':
        this.noise(0.7, { vol: 0.45 * v, freq: 2200, endFreq: 60, attack: 0.002 });
        this.tone(70, 0.5, { type: 'sine', vol: 0.35 * v, slide: 0.3 });
        break;
      case 'dash': this.noise(0.16, { vol: 0.14 * v, type: 'bandpass', freq: 1500, endFreq: 500, q: 0.9 }); break;
      case 'potion':
        for (let i = 0; i < 4; i++) this.tone(500 + i * 140 + Math.random() * 40, 0.08, { type: 'sine', vol: 0.07 * v, delay: i * 0.05 });
        this.tone(660, 0.4, { type: 'triangle', vol: 0.06 * v, slide: 1.5, delay: 0.1 });
        break;
      case 'gold':
        this.tone(1568 * r(), 0.07, { type: 'square', vol: 0.035 * v, filter: 5000 });
        this.tone(2093 * r(), 0.12, { type: 'square', vol: 0.03 * v, delay: 0.045, filter: 5000 });
        break;
      case 'pickup': this.tone(660, 0.08, { type: 'triangle', vol: 0.1 * v }); this.tone(990, 0.1, { type: 'triangle', vol: 0.08 * v, delay: 0.06 }); break;
      case 'rareDrop':
        [0, 4, 7, 12, 16].forEach((n, i) => this.tone(midi(76 + n), 0.5, { type: 'triangle', vol: 0.05 * v, delay: i * 0.06 }));
        break;
      case 'legendaryDrop':
        [0, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(midi(69 + n), 0.9, { type: 'sine', vol: 0.07 * v, delay: i * 0.08 }));
        this.tone(midi(45), 1.2, { type: 'sawtooth', vol: 0.05 * v, filter: 500, attack: 0.2 });
        break;
      case 'levelUp':
        [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(midi(67 + n), 0.35, { type: 'triangle', vol: 0.08 * v, delay: i * 0.07 }));
        break;
      case 'quest':
        [0, 5, 9, 12].forEach((n, i) => this.tone(midi(72 + n), 0.5, { type: 'sine', vol: 0.08 * v, delay: i * 0.1 }));
        break;
      case 'click': this.tone(880, 0.04, { type: 'square', vol: 0.03 * v, filter: 3000, send: false }); break;
      case 'open': this.noise(0.12, { vol: 0.08 * v, type: 'bandpass', freq: 700, endFreq: 1400 }); this.tone(330, 0.08, { type: 'triangle', vol: 0.05 * v }); break;
      case 'close': this.noise(0.1, { vol: 0.06 * v, type: 'bandpass', freq: 1200, endFreq: 500 }); break;
      case 'buy': this.tone(1320, 0.06, { type: 'square', vol: 0.04 * v, filter: 4000 }); this.tone(1760, 0.14, { type: 'square', vol: 0.04 * v, delay: 0.06, filter: 4000 }); break;
      case 'sell': this.tone(1760, 0.06, { type: 'square', vol: 0.04 * v, filter: 4000 }); this.tone(1320, 0.14, { type: 'square', vol: 0.04 * v, delay: 0.06, filter: 4000 }); break;
      case 'equip': this.noise(0.08, { vol: 0.14 * v, type: 'bandpass', freq: 2500, q: 3 }); this.tone(440, 0.1, { type: 'triangle', vol: 0.05 * v }); break;
      case 'deny': this.tone(160, 0.14, { type: 'square', vol: 0.06 * v, filter: 800 }); this.tone(120, 0.18, { type: 'square', vol: 0.06 * v, delay: 0.09, filter: 800 }); break;
      case 'stairs':
        for (let i = 0; i < 5; i++) this.noise(0.09, { vol: 0.12 * v, freq: 600 - i * 60, delay: i * 0.11 });
        this.tone(110, 1.2, { type: 'sine', vol: 0.12 * v, slide: 0.5, delay: 0.2, attack: 0.3 });
        break;
      case 'chest':
        this.noise(0.3, { vol: 0.12 * v, type: 'bandpass', freq: 400, endFreq: 900, q: 2 });
        [0, 4, 7, 11].forEach((n, i) => this.tone(midi(72 + n), 0.3, { type: 'triangle', vol: 0.05 * v, delay: 0.15 + i * 0.05 }));
        break;
      case 'break':
        this.noise(0.22, { vol: 0.25 * v, freq: 3000 * r(), endFreq: 300 });
        this.tone(200 * r(), 0.12, { type: 'square', vol: 0.05 * v, slide: 0.5, filter: 1200 });
        break;
      case 'spikes': this.noise(0.1, { vol: 0.14 * v, type: 'highpass', freq: 2500 }); this.tone(900, 0.06, { type: 'square', vol: 0.03 * v, filter: 3000 }); break;
      case 'flame': this.noise(0.5, { vol: 0.14 * v, type: 'bandpass', freq: 500, endFreq: 1200, q: 0.5, attack: 0.05 }); break;
      case 'shrine':
        [0, 7, 12, 19, 24].forEach((n, i) => this.tone(midi(60 + n), 1.2, { type: 'sine', vol: 0.06 * v, delay: i * 0.09, attack: 0.05 }));
        break;
      case 'telegraph': this.tone(300, 0.2, { type: 'sawtooth', vol: 0.04 * v, slide: 1.6, filter: 900 }); break;
      case 'shoot': this.noise(0.1, { vol: 0.1 * v, type: 'bandpass', freq: 1800 * r(), endFreq: 900, q: 1.5 }); break;
      case 'enemyCast': this.tone(260 * r(), 0.3, { type: 'triangle', vol: 0.06 * v, slide: 2.2 }); break;
      case 'bossRoar':
        this.tone(55, 1.4, { type: 'sawtooth', vol: 0.22 * v, slide: 0.7, filter: 400, attack: 0.1 });
        this.noise(1.2, { vol: 0.2 * v, freq: 400, endFreq: 100, attack: 0.1 });
        break;
      case 'bossDie':
        this.noise(2.2, { vol: 0.4 * v, freq: 2000, endFreq: 40 });
        this.tone(80, 2, { type: 'sine', vol: 0.3 * v, slide: 0.25 });
        [0, 3, 7, 12].forEach((n, i) => this.tone(midi(57 + n), 1.6, { type: 'triangle', vol: 0.05 * v, delay: 0.8 + i * 0.15 }));
        break;
      case 'death':
        this.tone(220, 1.6, { type: 'sawtooth', vol: 0.12 * v, slide: 0.25, filter: 800 });
        this.tone(110, 2.2, { type: 'sine', vol: 0.2 * v, slide: 0.5, delay: 0.2 });
        break;
      case 'lanternBurn': this.noise(0.1, { vol: 0.05 * v, type: 'bandpass', freq: 1200, q: 2 }); break;
      default: break;
    }
  }

  // ------------------------------------------------------------ generative music

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!this.ctx) return;
    for (const n of this.droneNodes) {
      try { n.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.6); n.osc.stop(this.ctx.currentTime + 3); } catch { /* already stopped */ }
    }
    this.droneNodes = [];
    this.musicTimer = 0.2;
    const c = this.ctx;
    const drone = (freq, type, vol, cutoff) => {
      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.08;
      const lfoGain = c.createGain();
      lfoGain.gain.value = cutoff * 0.5;
      lfo.connect(lfoGain); lfoGain.connect(f.frequency);
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setTargetAtTime(vol, c.currentTime, 2);
      osc.connect(f); f.connect(gain); gain.connect(this.music);
      gain.connect(this.reverb);
      osc.start(); lfo.start();
      this.droneNodes.push({ osc, gain, lfo });
      const origStop = osc.stop.bind(osc);
      osc.stop = (t) => { origStop(t); lfo.stop(t); };
    };
    if (mode === 'town') {
      drone(midi(43), 'triangle', 0.05, 500);
      drone(midi(50), 'triangle', 0.035, 600);
    } else if (mode === 'dungeon') {
      drone(midi(33), 'sawtooth', 0.045, 180);
      drone(midi(40) * 1.003, 'sawtooth', 0.03, 220);
    } else if (mode === 'boss') {
      drone(midi(31), 'sawtooth', 0.07, 260);
      drone(midi(38), 'square', 0.03, 300);
    }
  }

  update(dt) {
    if (!this.ctx || !this.mode || this.muted) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const out = this.music;
    if (this.mode === 'town') {
      // gentle lute-like arpeggio
      const root = 55;
      const n = root + PENTA_MAJOR[Math.floor(Math.random() * 5)] + (Math.random() < 0.3 ? 12 : 0);
      this.tone(midi(n), 1.4, { type: 'triangle', vol: 0.05, out, attack: 0.004 });
      this.tone(midi(n + 12), 0.5, { type: 'sine', vol: 0.015, out, attack: 0.004 });
      if (Math.random() < 0.25) this.tone(midi(n + 7), 1.2, { type: 'triangle', vol: 0.03, out, delay: 0.25 });
      this.musicTimer = 0.45 + Math.random() * 1.1;
    } else if (this.mode === 'dungeon') {
      const root = 57;
      const n = root + PENTA_MINOR[Math.floor(Math.random() * 5)] + (Math.random() < 0.4 ? 12 : 0);
      this.tone(midi(n), 3.2, { type: 'sine', vol: 0.045, out, attack: 0.01 });
      this.tone(midi(n) * 2.01, 1.6, { type: 'sine', vol: 0.012, out });
      if (Math.random() < 0.15) this.noise(2.5, { vol: 0.03, freq: 200, endFreq: 80, attack: 0.8, out });
      this.musicTimer = 2.2 + Math.random() * 3.5;
    } else if (this.mode === 'boss') {
      const pattern = [0, 0, 3, 0, 7, 0, 5, 3];
      this.bossStep = ((this.bossStep || 0) + 1) % pattern.length;
      this.tone(midi(31 + pattern[this.bossStep]), 0.32, { type: 'sawtooth', vol: 0.09, out, filter: 500 });
      if (this.bossStep % 4 === 0) this.noise(0.2, { vol: 0.12, freq: 180, endFreq: 60, out });
      if (Math.random() < 0.2) this.tone(midi(67 + PENTA_MINOR[Math.floor(Math.random() * 5)]), 0.8, { type: 'triangle', vol: 0.03, out });
      this.musicTimer = 0.27;
    }
  }
}
