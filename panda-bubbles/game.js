(() => {
  'use strict';

  const Logic = window.BubbleLogic;
  if (!Logic) throw new Error('BubbleLogic konnte nicht geladen werden.');

  const $ = id => document.getElementById(id);
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const currentPreview = $('current-preview');
  const nextPreview = $('next-preview');
  const currentCtx = currentPreview.getContext('2d');
  const nextCtx = nextPreview.getContext('2d');
  const WIDTH = Logic.CONFIG.width;
  const HEIGHT = 760;
  const RADIUS = Logic.CONFIG.radius;
  const SHOOTER = Object.freeze({ x: WIDTH / 2, y: 708 });
  const WALL = 30;
  const SHOT_SPEED = 900;
  const STORAGE_KEY = 'panda-bubbles-settings-v1';
  const COLOR_HEX = Object.freeze({
    rose: '#ef5d83',
    gold: '#f3b53f',
    mint: '#33b982',
    sky: '#3c9ee8',
    violet: '#8d6be8',
    coral: '#ee7357',
    rainbow: '#f7f2df'
  });
  const SYMBOLS = Object.freeze({ rose: '●', gold: '✦', mint: '▲', sky: '◆', violet: '✿', coral: '⬟' });
  const COLOR_NAMES = Object.freeze({ rose: 'Rosa', gold: 'Gold', mint: 'Grün', sky: 'Blau', violet: 'Violett', coral: 'Koralle', rainbow: 'Bambusblase' });
  const THEMES = Object.freeze({
    panda: { top: '#effcf6', bottom: '#ccebdc', ink: '#17332d', grid: 'rgba(22,114,90,.11)', line: '#be3951', cannon: '#277b60' },
    night: { top: '#0b3238', bottom: '#061c23', ink: '#f3f7f5', grid: 'rgba(255,255,255,.08)', line: '#ff8797', cannon: '#e5b94f' },
    contrast: { top: '#000000', bottom: '#000000', ink: '#ffffff', grid: 'rgba(255,255,255,.18)', line: '#ffffff', cannon: '#ffea00' }
  });

  let random = Logic.seededRandom('boot');
  let fxRandom = Logic.seededRandom('fx-boot');
  let audioContext = null;
  let masterGain = null;
  let animationFrame = 0;
  let previousTime = performance.now();
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastPointerAim = null;
  let saveTimer = 0;

  const state = {
    board: [],
    topParity: 0,
    current: 'rose',
    next: 'sky',
    score: 0,
    highScore: 0,
    misses: Logic.CONFIG.missesPerRow,
    power: 0,
    shots: 0,
    streak: 0,
    status: 'playing',
    aim: 0,
    projectile: null,
    particles: [],
    falling: [],
    flash: 0,
    shake: 0,
    sound: true,
    seed: '',
    swapped: false
  };

  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return;
      state.highScore = Number.isFinite(saved.highScore) ? Math.max(0, Math.floor(saved.highScore)) : 0;
      state.sound = saved.sound !== false;
    } catch (_error) { /* local storage is optional */ }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ highScore: state.highScore, sound: state.sound }));
    } catch (_error) { /* local storage is optional */ }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveSettings, 180);
  }

  function formatScore(value) {
    return Math.max(0, Math.floor(value)).toLocaleString('de-DE');
  }

  function theme() {
    return THEMES[document.documentElement.dataset.gameStyle] || THEMES.panda;
  }

  function setupCanvas(target, context, width, height) {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    target.width = Math.round(width * dpr);
    target.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
  }

  function setupCanvases() {
    setupCanvas(canvas, ctx, WIDTH, HEIGHT);
    setupCanvas(currentPreview, currentCtx, 72, 72);
    setupCanvas(nextPreview, nextCtx, 72, 72);
    drawPreviews();
  }

  function pickColor() {
    const available = Logic.availableColors(state.board);
    const palette = available.length ? available : Logic.COLORS.slice(0, 5);
    return palette[Math.floor(random() * palette.length)];
  }

  function initAudio() {
    if (!state.sound) return null;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioCtor();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 1;
        masterGain.connect(audioContext.destination);
      }
      if (masterGain) masterGain.gain.value = 1;
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      return audioContext;
    } catch (_error) {
      return null;
    }
  }

  function tone(frequency, duration, options = {}) {
    const ac = initAudio();
    if (!ac || !masterGain) return;
    const start = ac.currentTime + (options.delay || 0);
    const oscillator = ac.createOscillator();
    const gain = ac.createGain();
    oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    if (options.to) oscillator.frequency.exponentialRampToValueAtTime(options.to, start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.gain || .055, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  function playSound(name, amount = 1) {
    if (!state.sound) return;
    if (name === 'shoot') tone(260, .11, { to: 520, type: 'triangle', gain: .035 });
    else if (name === 'bounce') tone(620, .055, { to: 500, type: 'sine', gain: .025 });
    else if (name === 'pop') {
      const notes = [540, 680, 820];
      const count = Math.min(3, Math.max(1, Math.ceil(amount / 3)));
      for (let i = 0; i < count; i++) tone(notes[i], .12, { delay: i * .035, to: notes[i] * 1.12, type: 'triangle', gain: .045 });
    } else if (name === 'drop') tone(330, .22, { to: 90, type: 'sine', gain: .045 });
    else if (name === 'pressure') tone(170, .3, { to: 105, type: 'sawtooth', gain: .035 });
    else if (name === 'special') {
      [440, 554, 659, 880].forEach((note, index) => tone(note, .26, { delay: index * .06, type: 'triangle', gain: .04 }));
    } else if (name === 'win') {
      [523, 659, 784, 1047].forEach((note, index) => tone(note, .3, { delay: index * .08, type: 'sine', gain: .05 }));
    } else if (name === 'lose') tone(310, .55, { to: 92, type: 'triangle', gain: .055 });
    else if (name === 'swap') tone(440, .08, { to: 660, type: 'sine', gain: .025 });
  }

  function announce(text) {
    $('message').textContent = text;
  }

  function aimDescription() {
    const degrees = Math.round(Math.abs(state.aim) * 180 / Math.PI);
    if (degrees < 2) return 'geradeaus';
    return degrees + ' Grad nach ' + (state.aim < 0 ? 'links' : 'rechts');
  }

  function describeBoard() {
    const rows = state.board.map((row, rowIndex) => {
      const cells = row.map((color, colIndex) => 'Spalte ' + (colIndex + 1) + ' ' + (color ? COLOR_NAMES[color] : 'frei'));
      return 'Reihe ' + (rowIndex + 1) + ': ' + cells.join(', ');
    });
    return 'Blasenraster mit ' + state.board.length + ' Reihen. ' + rows.join('. ') + '.';
  }

  function updateAccessibility(updateBoard) {
    const currentName = COLOR_NAMES[state.current] || state.current;
    const nextName = COLOR_NAMES[state.next] || state.next;
    $('current-name').textContent = currentName;
    $('next-name').textContent = nextName;
    $('swap-btn').setAttribute('aria-label', currentName + ' und ' + nextName + ' tauschen');
    canvas.setAttribute('aria-label', 'Blasenfeld. Aktuell ' + currentName + ', danach ' + nextName + '. Zielrichtung ' + aimDescription() + '. ' + state.shots + ' Schüsse, ' + state.score + ' Punkte.');
    if (updateBoard) $('board-description').textContent = describeBoard();
  }

  function updateUi() {
    $('score').textContent = formatScore(state.score);
    $('high-score').textContent = formatScore(state.highScore);
    $('misses').textContent = Array.from({ length: Logic.CONFIG.missesPerRow }, (_, index) => index < state.misses ? '●' : '○').join(' ');
    $('power-label').textContent = state.power >= 100 ? 'Bereit!' : Math.round(state.power) + ' %';
    $('power-fill').style.width = Math.min(100, state.power) + '%';
    document.querySelector('.power-stat').classList.toggle('ready', state.power >= 100 || state.current === 'rainbow');
    $('swap-btn').disabled = state.status !== 'playing' || !!state.projectile || state.current === 'rainbow';
    $('pause-btn').disabled = state.status === 'won' || state.status === 'lost';
    $('pause-btn').textContent = state.status === 'paused' ? '▶ Weiter' : '⏸ Pause';
    $('sound-btn').setAttribute('aria-pressed', String(state.sound));
    $('sound-btn').textContent = state.sound ? '🔊 Ton an' : '🔇 Ton aus';
    updateAccessibility(true);
    drawPreviews();
    scheduleSave();
  }

  function newGame(seed, shouldFocus = true) {
    state.seed = String(seed || ('runde-' + Date.now() + '-' + Math.floor(Math.random() * 1000000)));
    random = Logic.seededRandom(state.seed);
    fxRandom = Logic.seededRandom(state.seed + '-effects');
    state.board = Logic.createInitialBoard({ rows: Logic.CONFIG.initialRows, colorCount: 5, topParity: 0, random });
    state.topParity = 0;
    state.current = pickColor();
    state.next = pickColor();
    state.score = 0;
    state.misses = Logic.CONFIG.missesPerRow;
    state.power = 0;
    state.shots = 0;
    state.streak = 0;
    state.status = 'playing';
    state.aim = 0;
    state.projectile = null;
    state.particles = [];
    state.falling = [];
    state.flash = 0;
    state.shake = 0;
    state.swapped = false;
    lastPointerAim = null;
    $('pause-overlay').hidden = true;
    $('result').hidden = true;
    announce('Zielen und die erste Blase abschießen.');
    updateUi();
    if (shouldFocus) canvas.focus({ preventScroll: true });
  }

  function setAim(angle) {
    if (!Number.isFinite(angle)) return state.aim;
    state.aim = Math.max(-1.24, Math.min(1.24, angle));
    updateAccessibility(false);
    return state.aim;
  }

  function aimAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * WIDTH / rect.width;
    const y = (clientY - rect.top) * HEIGHT / rect.height;
    const dx = x - SHOOTER.x;
    const dy = Math.min(-12, y - SHOOTER.y);
    setAim(Math.atan2(dx, -dy));
    lastPointerAim = { x, y };
  }

  function shoot() {
    if (state.status !== 'playing' || state.projectile) return false;
    initAudio();
    const color = state.current;
    state.power = Logic.powerAfterLaunch(state.power, color);
    const trajectory = Logic.traceShot(state.board, state.topParity, state.aim, {
      startX: SHOOTER.x,
      startY: SHOOTER.y - 9,
      wall: WALL,
      step: 4
    });
    state.projectile = {
      x: SHOOTER.x,
      y: SHOOTER.y - 9,
      color,
      banked: false,
      path: trajectory.points,
      pathStep: trajectory.step,
      progress: 0,
      lastIndex: 0
    };
    state.shots++;
    state.swapped = false;
    playSound('shoot');
    announce(color === 'rainbow' ? 'Die Bambusblase ist unterwegs!' : 'Blase abgeschossen …');
    updateUi();
    return true;
  }

  function swapBubbles() {
    if (state.status !== 'playing' || state.projectile || state.current === 'rainbow') return false;
    initAudio();
    const temp = state.current;
    state.current = state.next;
    state.next = temp;
    state.swapped = !state.swapped;
    playSound('swap');
    announce('Aktuelle und nächste Blase getauscht.');
    updateUi();
    return true;
  }

  function createBurst(cells, falling) {
    if (reducedMotion) return;
    for (const cell of cells) {
      const center = Logic.cellCenter(cell.row, cell.col, state.topParity);
      if (falling) {
        state.falling.push({ x: center.x, y: center.y, color: cell.color, vx: (fxRandom() - .5) * 85, vy: 35 + fxRandom() * 75, spin: (fxRandom() - .5) * 5, angle: 0, life: 1 });
      } else {
        for (let i = 0; i < 5; i++) {
          const angle = fxRandom() * Math.PI * 2;
          const speed = 50 + fxRandom() * 145;
          state.particles.push({ x: center.x, y: center.y, color: cell.color, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .45 + fxRandom() * .3, size: 2.5 + fxRandom() * 4 });
        }
      }
    }
  }

  function advanceQueue(usedColor) {
    if (Logic.shouldQueueRainbow(state.power, usedColor)) {
      state.current = 'rainbow';
      playSound('special');
      announce('Bambusblase bereit – sie findet beim Auftreffen die stärkste Farbe!');
      return;
    }
    state.current = state.next;
    state.next = pickColor();
  }

  function finishRound(won) {
    state.status = won ? 'won' : 'lost';
    state.projectile = null;
    if (state.score > state.highScore) state.highScore = state.score;
    saveSettings();
    $('result-icon').textContent = won ? '🐼🎋' : '🐼';
    $('result-title').textContent = won ? 'Bambushain gerettet!' : 'Die Blasen waren schneller';
    $('result-text').textContent = won
      ? 'Alle Blasen sind weg. ' + formatScore(state.score) + ' Punkte in ' + state.shots + ' Schüssen.'
      : 'Du hast ' + formatScore(state.score) + ' Punkte erreicht. Ein neuer Versuch startet mit einem frischen Feld.';
    $('result').hidden = false;
    updateUi();
    playSound(won ? 'win' : 'lose');
    queueMicrotask(() => $('result-new-btn').focus());
  }

  function settleProjectile() {
    const projectile = state.projectile;
    if (!projectile) return;
    const target = Logic.nearestAttachableCell(state.board, state.topParity, projectile.x, projectile.y);
    state.projectile = null;
    if (!target) {
      finishRound(false);
      return;
    }

    let result;
    try {
      result = Logic.resolvePlacement(state.board, target.row, target.col, projectile.color, state.topParity);
    } catch (_error) {
      finishRound(false);
      return;
    }

    const successful = result.popped >= 3;
    if (successful) {
      createBurst(result.matched, false);
      createBurst(result.dropped, true);
      const bonus = projectile.banked ? 250 : 0;
      state.streak++;
      const streakBonus = Math.max(0, state.streak - 1) * 75;
      state.score += result.score + bonus + streakBonus;
      state.power = Logic.chargePower(state.power, result.popped, result.dropped.length, projectile.banked);
      state.misses = Logic.CONFIG.missesPerRow;
      state.flash = .24;
      state.shake = result.dropped.length ? .22 : .1;
      playSound('pop', result.popped);
      if (result.dropped.length) playSound('drop');
      announce(result.popped + ' Blasen geplatzt' + (result.dropped.length ? ', ' + result.dropped.length + ' gefallen' : '') + (projectile.banked ? ' – Panda-Bandenbonus!' : '') + '.');
    } else {
      state.streak = 0;
      state.misses--;
      announce('Knapp daneben – noch ' + state.misses + ' Fehlwürfe bis zur nächsten Reihe.');
    }

    state.board = result.board;
    if (state.score > state.highScore) state.highScore = state.score;

    if (result.cleared) {
      finishRound(true);
      return;
    }

    // A shot that already reaches the danger row ends immediately; do not
    // shift the board once more or overlap the pressure and loss feedback.
    if (Logic.isLoss(state.board)) {
      finishRound(false);
      return;
    }

    if (!successful && state.misses <= 0) {
      const pressure = Logic.addPressureRow(state.board, state.topParity, Logic.availableColors(state.board), random);
      state.board = pressure.board;
      state.topParity = pressure.topParity;
      state.misses = Logic.CONFIG.missesPerRow;
      state.shake = .34;
      state.flash = .15;
      playSound('pressure');
      announce('Die Decke rückt nach – eine neue Blasenreihe!');
    }

    if (Logic.isLoss(state.board)) {
      finishRound(false);
      return;
    }

    advanceQueue(projectile.color);
    updateUi();
  }

  function updateProjectile(dt) {
    const projectile = state.projectile;
    if (!projectile || state.status !== 'playing') return;
    const speed = reducedMotion ? SHOT_SPEED * 2.5 : SHOT_SPEED;
    const last = projectile.path.length - 1;
    projectile.progress = Math.min(last, projectile.progress + speed * dt / projectile.pathStep);
    const reached = Math.floor(projectile.progress);
    for (let index = projectile.lastIndex + 1; index <= reached; index++) {
      if (projectile.path[index].bounced) {
        projectile.banked = true;
        playSound('bounce');
      }
    }
    projectile.lastIndex = Math.max(projectile.lastIndex, reached);
    const from = projectile.path[reached];
    const to = projectile.path[Math.min(last, reached + 1)];
    const fraction = projectile.progress - reached;
    projectile.x = from.x + (to.x - from.x) * fraction;
    projectile.y = from.y + (to.y - from.y) * fraction;
    if (projectile.progress >= last) {
      projectile.x = projectile.path[last].x;
      projectile.y = projectile.path[last].y;
      projectile.banked = projectile.banked || projectile.path[last].banked;
      settleProjectile();
    }
  }

  function updateEffects(dt) {
    state.flash = Math.max(0, state.flash - dt);
    state.shake = Math.max(0, state.shake - dt);
    for (const particle of state.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 180 * dt;
    }
    state.particles = state.particles.filter(particle => particle.life > 0);
    for (const bubble of state.falling) {
      bubble.life -= dt * .7;
      bubble.x += bubble.vx * dt;
      bubble.y += bubble.vy * dt;
      bubble.vy += 690 * dt;
      bubble.angle += bubble.spin * dt;
    }
    state.falling = state.falling.filter(bubble => bubble.y < HEIGHT + 80 && bubble.life > 0);
  }

  function drawBubble(context, x, y, radius, color, alpha = 1, angle = 0) {
    const hex = COLOR_HEX[color] || COLOR_HEX.rose;
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, alpha));
    context.translate(x, y);
    context.rotate(angle);
    context.shadowColor = color === 'rainbow' ? 'rgba(255,205,70,.7)' : 'rgba(10,40,32,.28)';
    context.shadowBlur = radius * .28;
    context.shadowOffsetY = radius * .12;
    const gradient = context.createRadialGradient(-radius * .32, -radius * .42, radius * .08, 0, 0, radius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(.16, hex);
    gradient.addColorStop(1, shadeColor(hex, -.25));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, radius - 1, 0, Math.PI * 2);
    context.fill();
    context.shadowColor = 'transparent';
    context.lineWidth = Math.max(1.5, radius * .075);
    context.strokeStyle = color === 'rainbow' ? '#d99f1c' : shadeColor(hex, -.38);
    context.stroke();

    context.globalAlpha *= .85;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.ellipse(-radius * .3, -radius * .38, radius * .19, radius * .11, -.55, 0, Math.PI * 2);
    context.fill();

    context.globalAlpha = Math.min(1, alpha);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `800 ${Math.max(11, radius * .62)}px system-ui`;
    context.fillStyle = color === 'rainbow' ? '#27694e' : 'rgba(255,255,255,.72)';
    context.fillText(color === 'rainbow' ? '🎋' : SYMBOLS[color], 0, radius * .08);
    context.restore();
  }

  function shadeColor(hex, amount) {
    const value = parseInt(hex.slice(1), 16);
    const target = amount < 0 ? 0 : 255;
    const factor = Math.abs(amount);
    const red = value >> 16;
    const green = value >> 8 & 255;
    const blue = value & 255;
    const next = (channel) => Math.round(channel + (target - channel) * factor);
    return '#' + [next(red), next(green), next(blue)].map(channel => channel.toString(16).padStart(2, '0')).join('');
  }

  function drawBackground(currentTheme) {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, currentTheme.top);
    gradient.addColorStop(1, currentTheme.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = currentTheme.grid;
    ctx.lineWidth = 2;
    for (let x = 44; x < WIDTH; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + 16, HEIGHT * .45, x - 8, HEIGHT);
      ctx.stroke();
    }
    ctx.fillStyle = currentTheme.grid;
    for (let i = 0; i < 16; i++) {
      const x = (i * 97 + 41) % WIDTH;
      const y = 95 + (i * 137) % 500;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((i % 3 - 1) * .6);
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function aimPath() {
    const trace = Logic.traceShot(state.board, state.topParity, state.aim, {
      startX: SHOOTER.x,
      startY: SHOOTER.y - 9,
      wall: WALL,
      step: 4
    });
    return trace.points.filter((_point, index) => index > 0 && (index % 8 === 0 || index === trace.points.length - 1));
  }

  function drawAim(currentTheme) {
    if (state.status !== 'playing' || state.projectile) return;
    const points = aimPath();
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      ctx.globalAlpha = .22 + .65 * (1 - i / Math.max(1, points.length));
      ctx.fillStyle = point.banked ? '#e7a82f' : currentTheme.ink;
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.banked ? 3.2 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawShooter(currentTheme) {
    ctx.save();
    ctx.translate(SHOOTER.x, SHOOTER.y + 20);
    ctx.fillStyle = 'rgba(0,0,0,.13)';
    ctx.beginPath();
    ctx.ellipse(0, 30, 72, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#171d1b';
    ctx.beginPath(); ctx.arc(-35, -1, 23, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(35, -1, 23, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7f4e9';
    ctx.beginPath(); ctx.ellipse(0, 12, 58, 49, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#202725';
    ctx.beginPath(); ctx.ellipse(-22, 6, 13, 17, -.25, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(22, 6, 13, 17, .25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7f4e9';
    ctx.beginPath(); ctx.arc(-19, 3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(19, 3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = currentTheme.cannon;
    ctx.beginPath();
    ctx.roundRect(-17, -63, 34, 70, 13);
    ctx.fill();
    ctx.restore();

    if (!state.projectile) drawBubble(ctx, SHOOTER.x, SHOOTER.y - 9, RADIUS - 1, state.current);
  }

  function drawScene() {
    const currentTheme = theme();
    ctx.save();
    if (state.shake > 0 && !reducedMotion) {
      const intensity = 7 * Math.min(1, state.shake / .2);
      ctx.translate((fxRandom() - .5) * intensity, (fxRandom() - .5) * intensity);
    }
    drawBackground(currentTheme);

    const dangerY = Logic.cellCenter(Logic.CONFIG.dangerRow, 0, state.topParity).y;
    ctx.save();
    ctx.setLineDash([9, 8]);
    ctx.strokeStyle = currentTheme.line;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(20, dangerY);
    ctx.lineTo(WIDTH - 20, dangerY);
    ctx.stroke();
    ctx.restore();

    drawAim(currentTheme);
    for (let row = 0; row < state.board.length; row++) {
      for (let col = 0; col < state.board[row].length; col++) {
        const color = state.board[row][col];
        if (!color) continue;
        const center = Logic.cellCenter(row, col, state.topParity);
        drawBubble(ctx, center.x, center.y, RADIUS, color);
      }
    }

    for (const bubble of state.falling) drawBubble(ctx, bubble.x, bubble.y, RADIUS, bubble.color, bubble.life, bubble.angle);
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, particle.life * 1.7);
      ctx.fillStyle = COLOR_HEX[particle.color] || '#ffffff';
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawShooter(currentTheme);
    if (state.projectile) drawBubble(ctx, state.projectile.x, state.projectile.y, RADIUS - 1, state.projectile.color);
    if (state.flash > 0 && !reducedMotion) {
      ctx.globalAlpha = state.flash * .45;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawPreview(context, color) {
    context.clearRect(0, 0, 72, 72);
    drawBubble(context, 36, 36, 27, color);
  }

  function drawPreviews() {
    if (!currentCtx || !nextCtx) return;
    drawPreview(currentCtx, state.current);
    drawPreview(nextCtx, state.next);
  }

  function loop(now) {
    const dt = Math.min(.025, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    updateProjectile(dt);
    updateEffects(dt);
    drawScene();
    animationFrame = requestAnimationFrame(loop);
  }

  function togglePause(options = {}) {
    if (state.status === 'won' || state.status === 'lost') return false;
    if (!options.silent) initAudio();
    if (state.status === 'playing') {
      state.status = 'paused';
      $('pause-overlay').hidden = false;
      announce('Spiel pausiert.');
      updateUi();
      if (options.focus !== false) queueMicrotask(() => $('resume-btn').focus());
    } else {
      state.status = 'playing';
      $('pause-overlay').hidden = true;
      announce('Weiter geht’s – der Bambushain wartet.');
      updateUi();
      if (options.focus !== false) queueMicrotask(() => canvas.focus({ preventScroll: true }));
    }
    return true;
  }

  function toggleSound() {
    state.sound = !state.sound;
    if (state.sound) {
      initAudio();
      playSound('swap');
      announce('Sound eingeschaltet.');
    } else {
      if (masterGain && audioContext) {
        masterGain.gain.cancelScheduledValues(audioContext.currentTime);
        masterGain.gain.value = 0;
      }
      announce('Sound ausgeschaltet.');
    }
    updateUi();
  }

  canvas.addEventListener('pointermove', event => {
    if (state.status !== 'playing' || state.projectile) return;
    aimAt(event.clientX, event.clientY);
  });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    aimAt(event.clientX, event.clientY);
    shoot();
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('keydown', event => {
    if (state.status !== 'playing') return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setAim(state.aim + (event.key === 'ArrowLeft' ? -.055 : .055));
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      shoot();
    }
  });

  $('swap-btn').addEventListener('click', swapBubbles);
  $('pause-btn').addEventListener('click', togglePause);
  $('resume-btn').addEventListener('click', togglePause);
  $('sound-btn').addEventListener('click', toggleSound);
  $('new-btn').addEventListener('click', () => newGame());
  $('result-new-btn').addEventListener('click', () => newGame());
  $('result-close-btn').addEventListener('click', () => {
    $('result').hidden = true;
  });

  document.addEventListener('keydown', event => {
    if (!$('result').hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        $('result').hidden = true;
      }
      return;
    }
    if (state.status === 'paused') {
      if (event.key.toLowerCase() === 'p' || event.key === 'Escape') {
        event.preventDefault();
        togglePause();
      }
      return;
    }
    const tag = event.target?.tagName || '';
    if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'A') return;
    const key = event.key.toLowerCase();
    if (key === 's') { event.preventDefault(); swapBubbles(); }
    else if (key === 'p') { event.preventDefault(); togglePause(); }
    else if (key === 'n') { event.preventDefault(); newGame(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.status === 'playing') togglePause({ silent: true, focus: false });
  });
  window.addEventListener('pagehide', saveSettings);
  window.addEventListener('resize', setupCanvases);
  new MutationObserver(drawPreviews).observe(document.documentElement, { attributes: true, attributeFilter: ['data-game-style'] });
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion = event => { reducedMotion = event.matches; };
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', syncMotion);

  readSettings();
  setupCanvases();
  newGame(undefined, false);
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(loop);

  window.PandaBubbles = Object.freeze({
    newGame,
    shoot,
    swap: swapBubbles,
    setAim,
    togglePause,
    getAimPath: () => aimPath().map(point => ({ ...point })),
    getState: () => ({
      board: Logic.cloneBoard(state.board),
      topParity: state.topParity,
      current: state.current,
      next: state.next,
      score: state.score,
      highScore: state.highScore,
      misses: state.misses,
      power: state.power,
      shots: state.shots,
      streak: state.streak,
      status: state.status,
      aim: state.aim,
      projectile: state.projectile ? {
        x: state.projectile.x,
        y: state.projectile.y,
        color: state.projectile.color,
        banked: state.projectile.banked,
        progress: state.projectile.progress
      } : null,
      particles: state.particles.length,
      falling: state.falling.length,
      sound: state.sound,
      audioMuted: !state.sound && (!masterGain || masterGain.gain.value === 0),
      seed: state.seed
    })
  });
})();
