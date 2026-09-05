/* === Gemeinsames Panda-Audio (prozedural, Web Audio) ===
   Kleine, vorab definierte Klangereignisse ohne externe Assets.
   window.GameAudio.play('name') ist immer sicher aufrufbar: ohne
   AudioContext, im Stumm-Modus oder vor der ersten Nutzergeste passiert
   einfach nichts. Der Stumm-Zustand wird geräteweit in localStorage
   gespeichert und von game-shell.js als Toolbar-Schalter angeboten. */
(() => {
  'use strict';

  const STORAGE_KEY = 'browser-games-sound';
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let muted = readMuted();
  const listeners = new Set();

  function readMuted() {
    try { return window.localStorage.getItem(STORAGE_KEY) === 'off'; } catch (_error) { return false; }
  }

  function persist() {
    try { window.localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on'); } catch (_error) { /* Speicher kann fehlen. */ }
  }

  function ensureContext() {
    if (context || !AudioContextClass) return context;
    try {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
    } catch (_error) {
      context = null;
    }
    return context;
  }

  function unlock() {
    const ctx = ensureContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function getNoise(ctx) {
    if (noiseBuffer) return noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.4);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  /* Einzelner Ton mit Hüllkurve. slide = Zielfrequenz am Ende. */
  function tone(ctx, options) {
    const start = ctx.currentTime + (options.delay || 0);
    const duration = options.duration || 0.12;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(options.freq || 440, start);
    if (options.slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.slide), start + duration);
    const peak = options.gain == null ? 0.5 : options.gain;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + (options.attack || 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function noise(ctx, options) {
    const start = ctx.currentTime + (options.delay || 0);
    const duration = options.duration || 0.15;
    const source = ctx.createBufferSource();
    source.buffer = getNoise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = options.filterType || 'bandpass';
    filter.frequency.setValueAtTime(options.freq || 1800, start);
    if (options.slide) filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.slide), start + duration);
    filter.Q.value = options.q || 0.9;
    const gain = ctx.createGain();
    const peak = options.gain == null ? 0.35 : options.gain;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + (options.attack || 0.005));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  const SOUNDS = {
    tap: ctx => tone(ctx, { freq: 660, slide: 520, duration: 0.06, gain: 0.25, type: 'triangle' }),
    select: ctx => tone(ctx, { freq: 520, slide: 700, duration: 0.07, gain: 0.22, type: 'triangle' }),
    place: ctx => {
      tone(ctx, { freq: 330, slide: 240, duration: 0.09, gain: 0.35, type: 'triangle' });
      noise(ctx, { freq: 900, slide: 300, duration: 0.07, gain: 0.12 });
    },
    flip: ctx => noise(ctx, { freq: 2600, slide: 900, duration: 0.09, gain: 0.2, q: 1.4 }),
    deal: ctx => {
      for (let i = 0; i < 4; i++) noise(ctx, { delay: i * 0.045, freq: 2200 - i * 200, slide: 700, duration: 0.07, gain: 0.16, q: 1.2 });
    },
    shuffle: ctx => {
      for (let i = 0; i < 7; i++) noise(ctx, { delay: i * 0.05, freq: 1400 + (i % 3) * 400, slide: 500, duration: 0.06, gain: 0.14, q: 1.1 });
    },
    pop: ctx => tone(ctx, { freq: 880, slide: 220, duration: 0.09, gain: 0.3, type: 'sine' }),
    success: ctx => {
      tone(ctx, { freq: 523.25, duration: 0.1, gain: 0.28, type: 'triangle' });
      tone(ctx, { freq: 783.99, duration: 0.16, gain: 0.28, type: 'triangle', delay: 0.07 });
    },
    match: ctx => {
      tone(ctx, { freq: 587.33, duration: 0.09, gain: 0.26, type: 'triangle' });
      tone(ctx, { freq: 880, duration: 0.14, gain: 0.24, type: 'triangle', delay: 0.06 });
    },
    error: ctx => {
      tone(ctx, { freq: 220, slide: 150, duration: 0.16, gain: 0.3, type: 'square' });
      tone(ctx, { freq: 165, slide: 120, duration: 0.18, gain: 0.2, type: 'square', delay: 0.05 });
    },
    hint: ctx => {
      tone(ctx, { freq: 740, duration: 0.08, gain: 0.22, type: 'sine' });
      tone(ctx, { freq: 988, duration: 0.12, gain: 0.22, type: 'sine', delay: 0.09 });
      tone(ctx, { freq: 1319, duration: 0.16, gain: 0.18, type: 'sine', delay: 0.18 });
    },
    undo: ctx => tone(ctx, { freq: 480, slide: 320, duration: 0.12, gain: 0.24, type: 'triangle' }),
    tick: ctx => tone(ctx, { freq: 1200, duration: 0.03, gain: 0.12, type: 'square' }),
    type: ctx => tone(ctx, { freq: 900 + Math.random() * 200, slide: 600, duration: 0.04, gain: 0.14, type: 'triangle' }),
    win: ctx => {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((freq, index) => {
        tone(ctx, { freq, duration: 0.22, gain: 0.26, type: 'triangle', delay: index * 0.09 });
        tone(ctx, { freq: freq / 2, duration: 0.3, gain: 0.12, type: 'sine', delay: index * 0.09 });
      });
      noise(ctx, { delay: 0.42, freq: 3000, slide: 800, duration: 0.5, gain: 0.1, q: 0.6 });
    },
    lose: ctx => {
      const notes = [392, 349.23, 311.13, 261.63];
      notes.forEach((freq, index) => tone(ctx, { freq, duration: 0.24, gain: 0.24, type: 'triangle', delay: index * 0.14 }));
    },
    fanfare: ctx => {
      const notes = [392, 523.25, 659.25, 783.99];
      notes.forEach((freq, index) => tone(ctx, { freq, duration: 0.18, gain: 0.24, type: 'square', delay: index * 0.08 }));
      tone(ctx, { freq: 1046.5, duration: 0.5, gain: 0.26, type: 'triangle', delay: 0.34 });
    },
    swoosh: ctx => noise(ctx, { freq: 600, slide: 3000, duration: 0.18, gain: 0.16, q: 0.7 }),
    cascade: ctx => {
      for (let i = 0; i < 5; i++) tone(ctx, { freq: 660 + i * 110, duration: 0.08, gain: 0.18, type: 'triangle', delay: i * 0.05 });
    }
  };

  function play(name, options) {
    if (muted) return false;
    const ctx = ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      if (ctx.state !== 'running') return false;
    }
    const sound = SOUNDS[name];
    if (!sound) return false;
    try {
      if (options && typeof options.volume === 'number') {
        const previous = master.gain.value;
        master.gain.setValueAtTime(Math.max(0, Math.min(1, options.volume)) * 0.32, ctx.currentTime);
        sound(ctx);
        master.gain.setValueAtTime(previous, ctx.currentTime + 0.8);
      } else {
        sound(ctx);
      }
    } catch (_error) {
      return false;
    }
    return true;
  }

  function setMuted(value, persistChoice) {
    const next = !!value;
    if (next === muted) return muted;
    muted = next;
    if (persistChoice !== false) persist();
    if (!muted) unlock();
    listeners.forEach(listener => {
      try { listener(muted); } catch (_error) { /* Zuhörer dürfen nicht stören. */ }
    });
    return muted;
  }

  function onChange(listener) {
    if (typeof listener === 'function') listeners.add(listener);
    return () => listeners.delete(listener);
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach(eventName => {
    document.addEventListener(eventName, () => { if (!muted) unlock(); }, { capture: true, passive: true });
  });

  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) setMuted(event.newValue === 'off', false);
  });

  window.GameAudio = Object.freeze({
    play,
    unlock,
    isMuted: () => muted,
    setMuted,
    toggle: () => setMuted(!muted),
    onChange,
    isSupported: () => !!AudioContextClass,
    names: Object.freeze(Object.keys(SOUNDS))
  });
})();
