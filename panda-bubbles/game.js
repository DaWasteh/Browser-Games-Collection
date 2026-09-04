(() => {
  'use strict';

  const Logic = window.BubbleLogic;
  if (!Logic) throw new Error('BubbleLogic konnte nicht geladen werden.');

  const $ = id => document.getElementById(id);
  const canvas = $('game-canvas');
  const canvasWrap = $('canvas-wrap');
  const ctx = canvas.getContext('2d');
  const currentPreview = $('current-preview');
  const nextPreview = $('next-preview');
  const currentCtx = currentPreview.getContext('2d');
  const nextCtx = nextPreview.getContext('2d');
  const WIDTH = Logic.CONFIG.width;
  const HEIGHT = 760;
  const RADIUS = Logic.CONFIG.radius;
  const SHOOTER = Object.freeze({ x: WIDTH / 2, y: 706 });
  const CANNON_PIVOT = Object.freeze({ x: WIDTH / 2, y: 738 });
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
  let swapTimer = 0;
  let roundToken = 0;

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
    popping: [],
    snaps: [],
    ripples: [],
    scoreBursts: [],
    phase: 'idle',
    phaseTime: 0,
    boardShift: null,
    pendingResult: null,
    recoil: 0,
    muzzle: 0,
    intro: 0,
    sceneTime: 0,
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

  function motionSeconds(seconds) {
    return reducedMotion ? Math.min(.012, seconds) : seconds;
  }

  function inputLocked() {
    return state.status !== 'playing' || state.phase !== 'idle' || !!state.projectile;
  }

  function setPhase(name, seconds) {
    state.phase = name;
    state.phaseTime = motionSeconds(seconds);
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3);
  }

  function launchPoint(angle = state.aim, recoil = 0) {
    const distance = 58 - Math.max(0, Math.min(1, recoil)) * 8;
    return {
      x: CANNON_PIVOT.x + Math.sin(angle) * distance,
      y: CANNON_PIVOT.y - Math.cos(angle) * distance
    };
  }

  function deepestOccupiedRow() {
    for (let row = state.board.length - 1; row >= 0; row--) {
      if (state.board[row]?.some(Boolean)) return row;
    }
    return -1;
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
    $('swap-btn').disabled = inputLocked() || state.current === 'rainbow';
    $('pause-btn').disabled = state.status === 'won' || state.status === 'lost' || state.status === 'celebrating';
    $('pause-btn').textContent = state.status === 'paused' ? '▶ Weiter' : '⏸ Pause';
    $('sound-btn').setAttribute('aria-pressed', String(state.sound));
    $('sound-btn').textContent = state.sound ? '🔊 Ton an' : '🔇 Ton aus';
    canvasWrap.dataset.phase = state.phase;
    canvasWrap.classList.toggle('power-ready', state.power >= 100 || state.current === 'rainbow');
    canvasWrap.classList.toggle('danger-close', deepestOccupiedRow() >= Logic.CONFIG.dangerRow - 2);
    canvasWrap.classList.toggle('is-paused', state.status === 'paused');
    canvas.setAttribute('aria-busy', String(state.phase !== 'idle' || !!state.projectile));
    canvas.setAttribute('aria-disabled', String(state.status !== 'playing'));
    updateAccessibility(true);
    drawPreviews();
    scheduleSave();
  }

  function newGame(seed, shouldFocus = true) {
    roundToken++;
    clearTimeout(swapTimer);
    swapTimer = 0;
    document.querySelector('.queue').classList.remove('is-swapping');
    canvasWrap.classList.remove('celebrating', 'round-lost');
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
    state.popping = [];
    state.snaps = [];
    state.ripples = [];
    state.scoreBursts = [];
    state.phase = 'idle';
    state.phaseTime = 0;
    state.boardShift = null;
    state.pendingResult = null;
    state.recoil = 0;
    state.muzzle = 0;
    state.intro = reducedMotion ? 0 : 1;
    state.sceneTime = 0;
    state.flash = 0;
    state.shake = 0;
    state.swapped = false;
    lastPointerAim = null;
    $('pause-overlay').hidden = true;
    $('result').hidden = true;
    $('result').classList.remove('won', 'lost');
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
    if (inputLocked()) return false;
    initAudio();
    const color = state.current;
    const launch = launchPoint();
    state.power = Logic.powerAfterLaunch(state.power, color);
    const trajectory = Logic.traceShot(state.board, state.topParity, state.aim, {
      startX: launch.x,
      startY: launch.y,
      wall: WALL,
      step: 4
    });
    state.projectile = {
      x: launch.x,
      y: launch.y,
      color,
      banked: false,
      path: trajectory.points,
      pathStep: trajectory.step,
      progress: 0,
      lastIndex: 0,
      trail: [],
      lastTrailIndex: 0
    };
    state.phase = 'flying';
    state.phaseTime = 0;
    state.recoil = reducedMotion ? 0 : 1;
    state.muzzle = motionSeconds(.2);
    if (!reducedMotion) state.ripples.push({ x: launch.x, y: launch.y, color, life: .24, maxLife: .24, kind: 'muzzle' });
    state.shots++;
    state.swapped = false;
    playSound('shoot');
    announce(color === 'rainbow' ? 'Die Bambusblase ist unterwegs!' : 'Blase abgeschossen …');
    updateUi();
    return true;
  }

  function swapBubbles() {
    if (inputLocked() || state.current === 'rainbow') return false;
    initAudio();
    const temp = state.current;
    state.current = state.next;
    state.next = temp;
    state.swapped = !state.swapped;
    const queue = document.querySelector('.queue');
    queue.classList.remove('is-swapping');
    void queue.offsetWidth;
    queue.classList.add('is-swapping');
    clearTimeout(swapTimer);
    swapTimer = window.setTimeout(() => queue.classList.remove('is-swapping'), motionSeconds(.42) * 1000);
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
        const life = 1.15 + fxRandom() * .28;
        state.falling.push({
          x: center.x,
          y: center.y,
          color: cell.color,
          vx: (fxRandom() - .5) * 105,
          vy: 28 + fxRandom() * 82,
          spin: (fxRandom() - .5) * 6.5,
          angle: 0,
          life,
          maxLife: life
        });
      } else {
        for (let index = 0; index < 7; index++) {
          const angle = fxRandom() * Math.PI * 2;
          const speed = 62 + fxRandom() * 170;
          const life = .42 + fxRandom() * .28;
          state.particles.push({
            x: center.x,
            y: center.y,
            color: cell.color,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life,
            maxLife: life,
            size: 2.5 + fxRandom() * 4.5,
            angle: fxRandom() * Math.PI,
            spin: (fxRandom() - .5) * 11,
            gravity: 210,
            kind: index % 3 === 0 ? 'glint' : 'shard'
          });
        }
      }
    }
  }

  function createCelebration() {
    if (reducedMotion) return;
    for (let index = 0; index < 42; index++) {
      const life = .9 + fxRandom() * .65;
      state.particles.push({
        x: 55 + fxRandom() * (WIDTH - 110),
        y: 120 + fxRandom() * 360,
        color: Logic.COLORS[index % Logic.COLORS.length],
        vx: (fxRandom() - .5) * 150,
        vy: -120 - fxRandom() * 210,
        life,
        maxLife: life,
        size: 4 + fxRandom() * 7,
        angle: fxRandom() * Math.PI,
        spin: (fxRandom() - .5) * 12,
        gravity: 330,
        kind: index % 4 === 0 ? 'leaf' : 'confetti'
      });
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

  function queueRoundEnd(won, delay) {
    const token = roundToken;
    state.status = 'celebrating';
    state.projectile = null;
    state.pendingResult = { won, token, time: motionSeconds(delay) };
    setPhase(won ? 'celebrating' : 'ending', delay);
    if (state.score > state.highScore) state.highScore = state.score;
    saveSettings();
    canvasWrap.classList.toggle('celebrating', won);
    canvasWrap.classList.toggle('round-lost', !won);
    if (won) {
      createCelebration();
      state.flash = motionSeconds(.38);
      announce('Der Bambushain ist frei – die letzten Blasen tanzen davon!');
    } else {
      state.shake = motionSeconds(.48);
      announce('Die Bambusgrenze ist erreicht – der Panda sammelt sich kurz.');
    }
    updateUi();
  }

  function finishRound(won) {
    state.status = won ? 'won' : 'lost';
    state.phase = 'result';
    state.phaseTime = 0;
    state.pendingResult = null;
    state.projectile = null;
    state.popping = [];
    state.snaps = [];
    state.ripples = [];
    state.scoreBursts = [];
    state.falling = [];
    state.particles = [];
    state.boardShift = null;
    state.flash = 0;
    state.shake = 0;
    if (state.score > state.highScore) state.highScore = state.score;
    saveSettings();
    const summary = won
      ? 'Alle Blasen sind weg. ' + formatScore(state.score) + ' Punkte in ' + state.shots + ' Schüssen.'
      : 'Du hast ' + formatScore(state.score) + ' Punkte erreicht. Ein neuer Versuch startet mit einem frischen Feld.';
    announce(won ? 'Runde geschafft – der Bambushain ist wieder frei.' : 'Runde beendet – die Blasen haben die Bambusgrenze erreicht.');
    $('result-icon').textContent = won ? '🐼🎋' : '🐼';
    $('result-title').textContent = won ? 'Bambushain gerettet!' : 'Die Blasen waren schneller';
    $('result-text').textContent = summary;
    $('result').classList.toggle('won', won);
    $('result').classList.toggle('lost', !won);
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
      queueRoundEnd(false, .58);
      return;
    }

    let result;
    try {
      result = Logic.resolvePlacement(state.board, target.row, target.col, projectile.color, state.topParity);
    } catch (_error) {
      queueRoundEnd(false, .58);
      return;
    }

    const impact = Logic.cellCenter(target.row, target.col, state.topParity);
    const impactColor = result.placedColor || projectile.color;
    if (!reducedMotion) state.ripples.push({ x: impact.x, y: impact.y, color: impactColor, life: .46, maxLife: .46, kind: 'impact' });
    const successful = result.popped >= 3;
    if (successful) {
      if (!reducedMotion) {
        state.popping = result.matched.map((cell, index) => {
          const center = Logic.cellCenter(cell.row, cell.col, state.topParity);
          return {
            x: center.x,
            y: center.y,
            color: cell.color,
            age: -Math.hypot(center.x - impact.x, center.y - impact.y) / 1250 - index * .006,
            duration: .36
          };
        });
      }
      createBurst(result.matched, false);
      createBurst(result.dropped, true);
      const bonus = projectile.banked ? 250 : 0;
      state.streak++;
      const streakBonus = Math.max(0, state.streak - 1) * 75;
      const gained = result.score + bonus + streakBonus;
      state.score += gained;
      if (!reducedMotion) state.scoreBursts.push({ x: impact.x, y: impact.y, text: '+' + formatScore(gained), life: .85, maxLife: .85, banked: projectile.banked });
      state.power = Logic.chargePower(state.power, result.popped, result.dropped.length, projectile.banked);
      state.misses = Logic.CONFIG.missesPerRow;
      state.flash = motionSeconds(.24);
      state.shake = motionSeconds(result.dropped.length ? .26 : .12);
      setPhase(result.dropped.length ? 'drop' : 'impact', result.dropped.length ? .5 : .34);
      const scoreStat = $('score').parentElement;
      scoreStat.classList.remove('score-pop');
      void scoreStat.offsetWidth;
      scoreStat.classList.add('score-pop');
      window.setTimeout(() => scoreStat.classList.remove('score-pop'), motionSeconds(.44) * 1000);
      playSound('pop', result.popped);
      if (result.dropped.length) playSound('drop');
      announce(result.popped + ' Blasen geplatzt' + (result.dropped.length ? ', ' + result.dropped.length + ' gefallen' : '') + (projectile.banked ? ' – Panda-Bandenbonus!' : '') + '.');
    } else {
      if (!reducedMotion) state.snaps.push({ row: target.row, col: target.col, color: impactColor, age: 0, duration: .34 });
      state.streak = 0;
      state.misses--;
      setPhase('impact', .3);
      announce('Knapp daneben – noch ' + state.misses + ' Fehlwürfe bis zur nächsten Reihe.');
    }

    state.board = result.board;
    if (state.score > state.highScore) state.highScore = state.score;

    if (result.cleared) {
      queueRoundEnd(true, result.dropped.length ? 1.05 : .88);
      return;
    }

    // A shot that already reaches the danger row ends immediately; do not
    // shift the board once more or overlap the pressure and loss feedback.
    if (Logic.isLoss(state.board)) {
      queueRoundEnd(false, .62);
      return;
    }

    if (!successful && state.misses <= 0) {
      const pressure = Logic.addPressureRow(state.board, state.topParity, Logic.availableColors(state.board), random);
      state.board = pressure.board;
      state.topParity = pressure.topParity;
      state.misses = Logic.CONFIG.missesPerRow;
      state.boardShift = { elapsed: 0, duration: motionSeconds(.52), distance: Logic.CONFIG.rowHeight };
      setPhase('pressure', .54);
      state.shake = motionSeconds(.34);
      state.flash = motionSeconds(.15);
      playSound('pressure');
      announce('Die Decke rückt nach – eine neue Blasenreihe gleitet herein!');
    }

    if (Logic.isLoss(state.board)) {
      queueRoundEnd(false, state.boardShift ? .68 : .58);
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
      const point = projectile.path[index];
      if (!reducedMotion && index - projectile.lastTrailIndex >= 5) {
        projectile.trail.push({ x: point.x, y: point.y, alpha: 1 });
        if (projectile.trail.length > 14) projectile.trail.shift();
        projectile.lastTrailIndex = index;
      }
      if (point.bounced) {
        projectile.banked = true;
        if (!reducedMotion) {
          state.ripples.push({ x: point.x, y: point.y, color: 'gold', life: .38, maxLife: .38, kind: 'bounce' });
          for (let spark = 0; spark < 7; spark++) {
            const life = .3 + fxRandom() * .25;
            state.particles.push({
              x: point.x,
              y: point.y,
              color: 'gold',
              vx: (point.x < WIDTH / 2 ? 1 : -1) * (35 + fxRandom() * 95),
              vy: (fxRandom() - .5) * 140,
              life,
              maxLife: life,
              size: 2 + fxRandom() * 3,
              angle: 0,
              spin: (fxRandom() - .5) * 8,
              gravity: 120,
              kind: 'glint'
            });
          }
        }
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
    state.sceneTime += dt;
    state.intro = Math.max(0, state.intro - dt / .72);
    state.recoil = Math.max(0, state.recoil - dt * 5.8);
    state.muzzle = Math.max(0, state.muzzle - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.shake = Math.max(0, state.shake - dt);

    if (state.phaseTime > 0) {
      state.phaseTime = Math.max(0, state.phaseTime - dt);
      if (state.phaseTime === 0 && state.status === 'playing' && !state.projectile) {
        state.phase = 'idle';
        updateUi();
      }
    }

    if (state.boardShift) {
      state.boardShift.elapsed = Math.min(state.boardShift.duration, state.boardShift.elapsed + dt);
      if (state.boardShift.elapsed >= state.boardShift.duration) state.boardShift = null;
    }

    if (state.pendingResult) {
      state.pendingResult.time -= dt;
      if (state.pendingResult.time <= 0) {
        const pending = state.pendingResult;
        state.pendingResult = null;
        if (pending.token === roundToken) finishRound(pending.won);
      }
    }

    for (const bubble of state.popping) bubble.age += dt;
    state.popping = state.popping.filter(bubble => bubble.age < bubble.duration);
    for (const snap of state.snaps) snap.age += dt;
    state.snaps = state.snaps.filter(snap => snap.age < snap.duration);
    for (const ripple of state.ripples) ripple.life -= dt;
    state.ripples = state.ripples.filter(ripple => ripple.life > 0);
    for (const burst of state.scoreBursts) burst.life -= dt;
    state.scoreBursts = state.scoreBursts.filter(burst => burst.life > 0);

    for (const particle of state.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += (particle.gravity || 180) * dt;
      particle.angle = (particle.angle || 0) + (particle.spin || 0) * dt;
    }
    state.particles = state.particles.filter(particle => particle.life > 0 && particle.y < HEIGHT + 100);
    for (const bubble of state.falling) {
      bubble.life -= dt;
      bubble.x += bubble.vx * dt;
      bubble.y += bubble.vy * dt;
      bubble.vy += 690 * dt;
      bubble.angle += bubble.spin * dt;
    }
    state.falling = state.falling.filter(bubble => bubble.y < HEIGHT + 80 && bubble.life > 0);
  }

  function drawBubble(context, x, y, radius, color, alpha = 1, angle = 0) {
    if (radius <= 1 || alpha <= 0) return;
    const hex = COLOR_HEX[color] || COLOR_HEX.rose;
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, alpha));
    context.translate(x, y);
    context.rotate(angle);
    context.shadowColor = color === 'rainbow' ? 'rgba(255,205,70,.78)' : 'rgba(10,40,32,.3)';
    context.shadowBlur = radius * (color === 'rainbow' ? .48 : .3);
    context.shadowOffsetY = radius * .12;
    if (color === 'rainbow' && typeof context.createConicGradient === 'function') {
      const rainbow = context.createConicGradient(-Math.PI / 2, 0, 0);
      ['#f16b83', '#f5bd42', '#45c991', '#4aa8ed', '#9b75e8', '#f16b83'].forEach((shade, index, colors) => rainbow.addColorStop(index / (colors.length - 1), shade));
      context.fillStyle = rainbow;
    } else {
      const gradient = context.createRadialGradient(-radius * .32, -radius * .42, radius * .08, 0, 0, radius);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(.16, hex);
      gradient.addColorStop(1, shadeColor(hex, -.25));
      context.fillStyle = gradient;
    }
    context.beginPath();
    context.arc(0, 0, radius - 1, 0, Math.PI * 2);
    context.fill();
    if (color === 'rainbow') {
      const glaze = context.createRadialGradient(-radius * .35, -radius * .42, 0, 0, 0, radius);
      glaze.addColorStop(0, 'rgba(255,255,255,.92)');
      glaze.addColorStop(.28, 'rgba(255,255,255,.2)');
      glaze.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = glaze;
      context.fill();
    }
    context.shadowColor = 'transparent';
    context.lineWidth = Math.max(1.5, radius * .075);
    context.strokeStyle = color === 'rainbow' ? '#d99f1c' : shadeColor(hex, -.38);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, Math.max(1, radius - 4), Math.PI * 1.08, Math.PI * 1.86);
    context.lineWidth = Math.max(1, radius * .045);
    context.strokeStyle = 'rgba(255,255,255,.32)';
    context.stroke();

    context.globalAlpha *= .88;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.ellipse(-radius * .3, -radius * .38, radius * .19, radius * .11, -.55, 0, Math.PI * 2);
    context.fill();

    if (radius >= 11) {
      context.globalAlpha = Math.min(1, alpha);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `800 ${Math.max(7, radius * .62)}px system-ui`;
      context.fillStyle = color === 'rainbow' ? '#174d3a' : 'rgba(255,255,255,.76)';
      context.fillText(color === 'rainbow' ? '🎋' : SYMBOLS[color], 0, radius * .08);
    }
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
    const time = reducedMotion ? 0 : state.sceneTime;
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, currentTheme.top);
    gradient.addColorStop(.58, currentTheme.bottom);
    gradient.addColorStop(1, currentTheme.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const style = document.documentElement.dataset.gameStyle || 'panda';
    const glow = ctx.createRadialGradient(WIDTH * .78, 105, 4, WIDTH * .78, 105, 230);
    glow.addColorStop(0, style === 'night' ? 'rgba(112,213,224,.13)' : style === 'contrast' ? 'rgba(255,255,255,.05)' : 'rgba(255,236,164,.34)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, 360);

    ctx.strokeStyle = currentTheme.grid;
    ctx.lineWidth = 3;
    for (let index = 0, x = 36; x < WIDTH; index++, x += 62) {
      const sway = Math.sin(time * .42 + index * .8) * 5;
      ctx.beginPath();
      ctx.moveTo(x, -10);
      ctx.bezierCurveTo(x + 14 + sway, HEIGHT * .32, x - 13 + sway, HEIGHT * .68, x + sway, HEIGHT + 15);
      ctx.stroke();
      ctx.globalAlpha = .45;
      for (let joint = 1; joint < 5; joint++) {
        const y = joint * 150 + (index % 2) * 42;
        ctx.beginPath();
        ctx.moveTo(x - 8 + sway, y);
        ctx.lineTo(x + 9 + sway, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = currentTheme.grid;
    for (let index = 0; index < 21; index++) {
      const baseX = (index * 97 + 41) % WIDTH;
      const y = 72 + (index * 137) % 555;
      const x = baseX + Math.sin(time * (.34 + index % 4 * .05) + index) * 7;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((index % 3 - 1) * .6 + Math.sin(time * .5 + index) * .08);
      ctx.beginPath();
      ctx.ellipse(0, 0, 11 + index % 3, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (style !== 'contrast') {
      for (let index = 0; index < 12; index++) {
        const x = (index * 83 + 57) % WIDTH;
        const y = (index * 109 + time * (5 + index % 3)) % (HEIGHT - 120) + 45;
        ctx.globalAlpha = .08 + (index % 4) * .025;
        ctx.fillStyle = style === 'night' ? '#d9ffff' : '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + index % 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT * .42, HEIGHT * .18, WIDTH / 2, HEIGHT * .42, HEIGHT * .76);
    vignette.addColorStop(.55, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, style === 'night' ? 'rgba(0,0,0,.28)' : 'rgba(20,70,55,.09)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function aimPath() {
    const start = launchPoint();
    const trace = Logic.traceShot(state.board, state.topParity, state.aim, {
      startX: start.x,
      startY: start.y,
      wall: WALL,
      step: 4
    });
    return trace.points.filter((_point, index) => index > 0 && (index % 8 === 0 || index === trace.points.length - 1));
  }

  function drawAim(currentTheme) {
    if (inputLocked()) return;
    const points = aimPath();
    if (!points.length) return;
    const banked = points.some(point => point.banked);
    ctx.save();
    ctx.strokeStyle = banked ? 'rgba(224,158,27,.48)' : currentTheme.grid;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 10]);
    ctx.lineDashOffset = reducedMotion ? 0 : -state.sceneTime * 30;
    ctx.beginPath();
    const start = launchPoint();
    ctx.moveTo(start.x, start.y);
    for (const point of points) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const pulse = reducedMotion ? 0 : Math.sin(state.sceneTime * 5.5 - index * .55) * .55;
      ctx.globalAlpha = .26 + .58 * (1 - index / Math.max(1, points.length));
      ctx.fillStyle = point.banked ? '#e7a82f' : currentTheme.ink;
      ctx.beginPath();
      ctx.arc(point.x, point.y, (point.banked ? 3.4 : 2.5) + pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    const end = points[points.length - 1];
    const target = Logic.nearestAttachableCell(state.board, state.topParity, end.x, end.y);
    if (target) {
      const center = Logic.cellCenter(target.row, target.col, state.topParity);
      const pulse = reducedMotion ? 0 : Math.sin(state.sceneTime * 4.2) * 1.4;
      drawBubble(ctx, center.x, center.y, RADIUS * .78 + pulse, state.current, .2);
      ctx.globalAlpha = .48;
      ctx.strokeStyle = banked ? '#e7a82f' : currentTheme.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center.x, center.y, RADIUS + 4 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShooter(currentTheme) {
    const faceY = SHOOTER.y + 28;
    const blink = reducedMotion || Math.sin(state.sceneTime * .72 + .8) < .985 ? 1 : .12;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.14)';
    ctx.beginPath();
    ctx.ellipse(SHOOTER.x, faceY + 26, 74, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(CANNON_PIVOT.x, CANNON_PIVOT.y);
    ctx.rotate(state.aim);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath();
    ctx.roundRect(-20, -64, 40, 73, 15);
    ctx.fill();
    const barrel = ctx.createLinearGradient(-18, 0, 18, 0);
    barrel.addColorStop(0, shadeColor(currentTheme.cannon, -.22));
    barrel.addColorStop(.48, currentTheme.cannon);
    barrel.addColorStop(.74, shadeColor(currentTheme.cannon, .18));
    barrel.addColorStop(1, shadeColor(currentTheme.cannon, -.18));
    ctx.fillStyle = barrel;
    ctx.beginPath();
    ctx.roundRect(-17, -66 + state.recoil * 7, 34, 72, 13);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath();
    ctx.roundRect(-9, -59 + state.recoil * 7, 6, 48, 5);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#171d1b';
    ctx.beginPath(); ctx.arc(SHOOTER.x - 36, faceY - 12, 24, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(SHOOTER.x + 36, faceY - 12, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7f4e9';
    ctx.beginPath(); ctx.ellipse(SHOOTER.x, faceY, 59, 48, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#202725';
    ctx.beginPath(); ctx.ellipse(SHOOTER.x - 22, faceY - 5, 13, 17 * blink, -.25, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(SHOOTER.x + 22, faceY - 5, 13, 17 * blink, .25, 0, Math.PI * 2); ctx.fill();
    if (blink > .5) {
      ctx.fillStyle = '#f7f4e9';
      ctx.beginPath(); ctx.arc(SHOOTER.x - 19, faceY - 8, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(SHOOTER.x + 19, faceY - 8, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#202725';
    ctx.beginPath();
    ctx.ellipse(SHOOTER.x, faceY + 12, 6, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#202725';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(SHOOTER.x, faceY + 14, state.streak > 1 ? 13 : 9, .22, Math.PI - .22);
    ctx.stroke();
    ctx.restore();

    if (!state.projectile && state.status !== 'won' && state.status !== 'lost') {
      const loaded = launchPoint(state.aim, state.recoil);
      drawBubble(ctx, loaded.x, loaded.y, RADIUS - 1, state.current);
      if (state.muzzle > 0 && !reducedMotion) {
        const progress = 1 - state.muzzle / .2;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - progress);
        ctx.strokeStyle = '#fff1a6';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(loaded.x, loaded.y, RADIUS + progress * 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawParticle(particle) {
    const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
    const color = COLOR_HEX[particle.color] || '#ffffff';
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.angle || 0);
    ctx.fillStyle = color;
    if (particle.kind === 'glint') {
      ctx.beginPath();
      ctx.moveTo(0, -particle.size * 1.5);
      ctx.lineTo(particle.size * .42, -particle.size * .4);
      ctx.lineTo(particle.size * 1.5, 0);
      ctx.lineTo(particle.size * .42, particle.size * .4);
      ctx.lineTo(0, particle.size * 1.5);
      ctx.lineTo(-particle.size * .42, particle.size * .4);
      ctx.lineTo(-particle.size * 1.5, 0);
      ctx.lineTo(-particle.size * .42, -particle.size * .4);
      ctx.closePath();
      ctx.fill();
    } else if (particle.kind === 'leaf') {
      ctx.beginPath();
      ctx.ellipse(0, 0, particle.size * 1.35, particle.size * .55, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-particle.size * .55, -particle.size, particle.size * 1.1, particle.size * 2);
    }
    ctx.restore();
  }

  function drawScene() {
    const currentTheme = theme();
    ctx.save();
    if (state.shake > 0 && !reducedMotion) {
      const intensity = 7 * Math.min(1, state.shake / .2);
      ctx.translate(Math.sin(state.sceneTime * 73) * intensity * .5, Math.cos(state.sceneTime * 91) * intensity * .5);
    }
    drawBackground(currentTheme);

    const dangerY = Logic.cellCenter(Logic.CONFIG.dangerRow, 0, state.topParity).y;
    const dangerPulse = !reducedMotion && deepestOccupiedRow() >= Logic.CONFIG.dangerRow - 2 ? .55 + Math.sin(state.sceneTime * 8) * .28 : .72;
    ctx.save();
    ctx.globalAlpha = dangerPulse;
    ctx.setLineDash([9, 8]);
    ctx.lineDashOffset = reducedMotion ? 0 : -state.sceneTime * 12;
    ctx.strokeStyle = currentTheme.line;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(20, dangerY);
    ctx.lineTo(WIDTH - 20, dangerY);
    ctx.stroke();
    ctx.restore();

    drawAim(currentTheme);
    let boardOffset = -state.intro * 28;
    let boardAlpha = 1 - state.intro * .58;
    if (state.boardShift) {
      const progress = state.boardShift.duration > 0 ? state.boardShift.elapsed / state.boardShift.duration : 1;
      boardOffset += -state.boardShift.distance * (1 - easeOutCubic(progress));
    }
    const snapKeys = new Set(state.snaps.map(snap => snap.row + ':' + snap.col));
    for (let row = 0; row < state.board.length; row++) {
      for (let col = 0; col < state.board[row].length; col++) {
        const color = state.board[row][col];
        if (!color || snapKeys.has(row + ':' + col)) continue;
        const center = Logic.cellCenter(row, col, state.topParity);
        const breathe = reducedMotion ? 0 : Math.sin(state.sceneTime * 1.9 + row * .71 + col * .43) * .006;
        drawBubble(ctx, center.x, center.y + boardOffset, RADIUS * (1 + breathe), color, boardAlpha);
      }
    }

    for (const snap of state.snaps) {
      const center = Logic.cellCenter(snap.row, snap.col, state.topParity);
      const progress = Math.max(0, Math.min(1, snap.age / snap.duration));
      const scale = .52 + easeOutCubic(progress) * .48 + Math.sin(progress * Math.PI) * .14;
      drawBubble(ctx, center.x, center.y, RADIUS * scale, snap.color, Math.min(1, .35 + progress * 1.2));
    }

    for (const bubble of state.popping) {
      if (bubble.age < 0) continue;
      const progress = Math.max(0, Math.min(1, bubble.age / bubble.duration));
      const scale = progress < .3 ? 1 + Math.sin(progress / .3 * Math.PI) * .18 : Math.max(.04, 1 - easeOutCubic((progress - .3) / .7));
      drawBubble(ctx, bubble.x, bubble.y, RADIUS * scale, bubble.color, 1 - Math.pow(progress, 3), progress * .35);
      ctx.save();
      ctx.globalAlpha = Math.max(0, .52 - progress * .52);
      ctx.strokeStyle = COLOR_HEX[bubble.color] || '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, RADIUS * (1 + progress * 1.25), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const ripple of state.ripples) {
      const progress = 1 - ripple.life / ripple.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, (1 - progress) * (ripple.kind === 'bounce' ? .9 : .62));
      ctx.strokeStyle = ripple.kind === 'bounce' ? '#f7d367' : COLOR_HEX[ripple.color] || '#fff';
      ctx.lineWidth = ripple.kind === 'bounce' ? 4 : 3;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, 8 + progress * (ripple.kind === 'muzzle' ? 38 : 48), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const bubble of state.falling) {
      const alpha = Math.min(1, bubble.life / bubble.maxLife * 1.45);
      ctx.save();
      ctx.globalAlpha = alpha * .16;
      ctx.fillStyle = '#17332d';
      ctx.beginPath();
      ctx.ellipse(bubble.x, bubble.y + RADIUS * 1.25, RADIUS * .7, RADIUS * .2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawBubble(ctx, bubble.x, bubble.y, RADIUS, bubble.color, alpha, bubble.angle);
    }
    for (const particle of state.particles) drawParticle(particle);

    for (const burst of state.scoreBursts) {
      const progress = 1 - burst.life / burst.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - progress * progress);
      ctx.translate(burst.x, burst.y - 22 - progress * 70);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${burst.banked ? 23 : 19}px system-ui`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(18,55,46,.55)';
      ctx.strokeText(burst.text + (burst.banked ? ' BANDENBONUS' : ''), 0, 0);
      ctx.fillStyle = burst.banked ? '#ffd76a' : '#ffffff';
      ctx.fillText(burst.text + (burst.banked ? ' BANDENBONUS' : ''), 0, 0);
      ctx.restore();
    }

    if (state.projectile?.trail?.length) {
      state.projectile.trail.forEach((point, index, trail) => {
        const alpha = (index + 1) / trail.length * (state.projectile.color === 'rainbow' ? .34 : .2);
        drawBubble(ctx, point.x, point.y, 4 + index / trail.length * 5, state.projectile.color, alpha);
      });
    }
    drawShooter(currentTheme);
    if (state.projectile) {
      const pulse = reducedMotion ? 0 : Math.sin(state.sceneTime * 18) * .45;
      drawBubble(ctx, state.projectile.x, state.projectile.y, RADIUS - 1 + pulse, state.projectile.color);
    }
    if (state.flash > 0 && !reducedMotion) {
      const flash = ctx.createRadialGradient(WIDTH / 2, HEIGHT * .35, 20, WIDTH / 2, HEIGHT * .35, WIDTH * .72);
      flash.addColorStop(0, 'rgba(255,255,255,.72)');
      flash.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = Math.min(.32, state.flash * 1.35);
      ctx.fillStyle = flash;
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
    if (state.status !== 'paused') updateEffects(dt);
    drawScene();
    animationFrame = requestAnimationFrame(loop);
  }

  function togglePause(options = {}) {
    if (state.status === 'won' || state.status === 'lost' || state.status === 'celebrating') return false;
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
    if (inputLocked()) return;
    aimAt(event.clientX, event.clientY);
  });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (inputLocked()) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    aimAt(event.clientX, event.clientY);
    shoot();
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('keydown', event => {
    if (inputLocked()) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter') event.preventDefault();
      return;
    }
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
  const syncMotion = event => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      clearTimeout(swapTimer);
      swapTimer = 0;
      document.querySelector('.queue').classList.remove('is-swapping');
      state.particles = [];
      state.falling = [];
      state.popping = [];
      state.snaps = [];
      state.ripples = [];
      state.scoreBursts = [];
      state.recoil = 0;
      state.muzzle = 0;
      state.intro = 0;
      state.flash = 0;
      state.shake = 0;
      state.boardShift = null;
      if (state.phaseTime > .012) state.phaseTime = .012;
      if (state.pendingResult?.time > .012) state.pendingResult.time = .012;
    }
    updateUi();
  };
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
      popping: state.popping.length,
      snaps: state.snaps.length,
      ripples: state.ripples.length,
      visualPhase: state.phase,
      phaseTime: state.phaseTime,
      effectClock: state.sceneTime,
      inputLocked: inputLocked(),
      boardShift: state.boardShift ? {
        progress: state.boardShift.duration > 0 ? state.boardShift.elapsed / state.boardShift.duration : 1,
        offset: -state.boardShift.distance * (1 - easeOutCubic(state.boardShift.duration > 0 ? state.boardShift.elapsed / state.boardShift.duration : 1))
      } : null,
      pendingResult: state.pendingResult ? { won: state.pendingResult.won, time: state.pendingResult.time } : null,
      sound: state.sound,
      audioMuted: !state.sound && (!masterGain || masterGain.gain.value === 0),
      seed: state.seed
    })
  });
})();
