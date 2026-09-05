/* === Gemeinsame Sieg- und Feedback-Effekte ===
   window.GameFX.confetti() legt kurz ein Canvas über die Seite und lässt
   Panda-farbene Partikel fallen. window.GameFX.pulse(element) hebt ein
   Element kurz hervor. Beide respektieren prefers-reduced-motion und
   sind ohne Abhängigkeiten sicher aufrufbar. */
(() => {
  'use strict';

  const reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !!(reduceQuery && reduceQuery.matches); }

  let canvas = null;
  let ctx = null;
  let particles = [];
  let frame = 0;
  let lastTime = 0;

  const PALETTES = {
    panda: ['#176b59', '#2fa07f', '#ffd166', '#f4f1e8', '#b83246', '#5aa9e6'],
    night: ['#ffd166', '#f3f7f5', '#5aa9e6', '#ff7b86', '#2fa07f'],
    contrast: ['#ffea00', '#ffffff', '#ff6678', '#00e5ff']
  };

  function ensureCanvas() {
    if (canvas && canvas.isConnected) return canvas;
    canvas = document.createElement('canvas');
    canvas.className = 'game-fx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '9999'
    });
    document.body.append(canvas);
    ctx = canvas.getContext('2d');
    return canvas;
  }

  function fitCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function step(now) {
    frame = 0;
    if (!canvas || !ctx) return;
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    fitCanvas();
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const gravity = 900;
    const alive = [];
    for (const p of particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += gravity * dt;
      p.vx *= 0.995;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.y > window.innerHeight + 40) continue;
      const alpha = Math.min(1, p.life / 0.6);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(0, -p.size / 2); ctx.lineTo(p.size / 2, p.size / 2); ctx.lineTo(-p.size / 2, p.size / 2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      alive.push(p);
    }
    particles = alive;
    if (particles.length) {
      frame = requestAnimationFrame(step);
    } else {
      canvas.remove();
      canvas = null;
      ctx = null;
    }
  }

  function palette() {
    const style = document.documentElement.dataset.gameStyle;
    return PALETTES[style] || PALETTES.panda;
  }

  /* options: { count, origin: {x,y} in CSS px oder {x:0..1,y:0..1 relativ}, spread, colors, power } */
  function confetti(options) {
    const opts = options || {};
    if (reducedMotion() && !opts.force) return false;
    if (document.visibilityState === 'hidden') return false;
    ensureCanvas();
    fitCanvas();
    const count = Math.max(8, Math.min(400, opts.count || 140));
    const colors = opts.colors || palette();
    const width = window.innerWidth;
    const height = window.innerHeight;
    let ox = width / 2;
    let oy = height * 0.35;
    if (opts.origin) {
      ox = opts.origin.x <= 1 ? opts.origin.x * width : opts.origin.x;
      oy = opts.origin.y <= 1 ? opts.origin.y * height : opts.origin.y;
    }
    const power = opts.power || 1;
    const spread = opts.spread == null ? Math.PI * 0.9 : opts.spread;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const speed = (260 + Math.random() * 420) * power;
      particles.push({
        x: ox + (Math.random() - 0.5) * 40,
        y: oy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 12,
        size: 6 + Math.random() * 8,
        life: 1.6 + Math.random() * 1.4,
        color: colors[i % colors.length],
        shape: i % 3
      });
    }
    if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(step);
    }
    return true;
  }

  /* Zwei versetzte Kanonen von links und rechts unten – für große Siege. */
  function celebrate(options) {
    const opts = options || {};
    const done = confetti(Object.assign({}, opts, { origin: { x: 0.18, y: 0.7 }, spread: Math.PI * 0.55, count: opts.count || 90 }));
    confetti(Object.assign({}, opts, { origin: { x: 0.82, y: 0.7 }, spread: Math.PI * 0.55, count: opts.count || 90 }));
    if (!reducedMotion()) {
      window.setTimeout(() => confetti(Object.assign({}, opts, { origin: { x: 0.5, y: 0.3 }, count: Math.round((opts.count || 90) * 0.8) })), 260);
    }
    return done;
  }

  function pulse(element, className) {
    if (!element || reducedMotion()) return;
    const name = className || 'game-fx-pulse';
    element.classList.remove(name);
    void element.offsetWidth;
    element.classList.add(name);
    const clear = () => element.classList.remove(name);
    element.addEventListener('animationend', clear, { once: true });
    window.setTimeout(clear, 900);
  }

  function shake(element) { pulse(element, 'game-fx-shake'); }

  function clear() {
    particles = [];
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (canvas) canvas.remove();
    canvas = null;
    ctx = null;
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') clear(); });

  window.GameFX = Object.freeze({ confetti, celebrate, pulse, shake, clear, reducedMotion });
})();
