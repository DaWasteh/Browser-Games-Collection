(() => {
  'use strict';

  const Logic = window.JewelsLogic;
  if (!Logic) throw new Error('JewelsLogic konnte nicht geladen werden.');

  const $ = id => document.getElementById(id);
  const boardEl = $('board');
  const effectsEl = $('board-effects');
  const STORAGE_KEY = 'des-pandas-juwelen-settings-v1';
  const SYMBOLS = Object.freeze({ jade: '▲', amber: '✦', ruby: '●', sapphire: '◆', amethyst: '✿', pearl: '⬟' });
  const NAMES = Object.freeze({ jade: 'Jade', amber: 'Bernstein', ruby: 'Rubin', sapphire: 'Saphir', amethyst: 'Amethyst', pearl: 'Perle' });
  const GEM_HEX = Object.freeze({ jade: '#42d69e', amber: '#f5b72d', ruby: '#f05273', sapphire: '#3aa8ef', amethyst: '#966be8', pearl: '#dceaf1', prism: '#fff3a3' });
  const SPECIAL_NAMES = Object.freeze({ row: 'waagerechtes Linienjuwel', column: 'senkrechtes Linienjuwel', bomb: 'Pfotenbombe', prism: 'Panda-Prisma' });

  let random = Logic.seededRandom('boot');
  let audioContext = null;
  let masterGain = null;
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let saveTimer = 0;
  let hintTimer = 0;
  let comboTimer = 0;
  let entranceTimer = 0;
  let effectTimer = 0;
  let suppressClick = false;
  let pointerGesture = null;
  let turnToken = 0;

  const state = {
    board: [],
    score: 0,
    highScore: 0,
    moves: Logic.CONFIG.moves,
    target: Logic.CONFIG.target,
    charge: 0,
    selected: null,
    focusIndex: 0,
    powerMode: false,
    status: 'playing',
    sound: true,
    seed: '',
    turns: 0,
    largestCascade: 0
  };

  const visual = {
    clearing: new Set(),
    falling: new Map(),
    swapping: new Map(),
    invalid: new Map(),
    created: new Set(),
    entering: new Set(),
    victory: new Set(),
    hinted: new Set()
  };

  const cells = [];

  function positionKey(position) { return position.row + ':' + position.col; }
  function indexOf(position) { return position.row * Logic.CONFIG.cols + position.col; }
  function positionOf(index) { return { row: Math.floor(index / Logic.CONFIG.cols), col: index % Logic.CONFIG.cols }; }

  function buildBoard() {
    for (let row = 0; row < Logic.CONFIG.rows; row++) {
      const rowElement = document.createElement('div');
      rowElement.className = 'grid-row';
      rowElement.setAttribute('role', 'row');
      rowElement.setAttribute('aria-rowindex', String(row + 1));
      for (let col = 0; col < Logic.CONFIG.cols; col++) {
        const index = row * Logic.CONFIG.cols + col;
        const position = { row, col };
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cell';
        button.dataset.index = String(index);
        button.dataset.row = String(position.row);
        button.dataset.col = String(position.col);
        button.setAttribute('role', 'gridcell');
        button.setAttribute('aria-rowindex', String(row + 1));
        button.setAttribute('aria-colindex', String(col + 1));
        button.setAttribute('aria-selected', 'false');
        button.tabIndex = index === 0 ? 0 : -1;
        const gem = document.createElement('span');
        gem.className = 'gem';
        gem.setAttribute('aria-hidden', 'true');
        const symbol = document.createElement('span');
        symbol.className = 'gem-symbol';
        gem.append(symbol);
        button.append(gem);
        button.addEventListener('click', event => handleCellClick(event, index));
        button.addEventListener('keydown', event => handleCellKeydown(event, index));
        button.addEventListener('pointerdown', event => handlePointerDown(event, index));
        button.addEventListener('pointerup', event => handlePointerUp(event, index));
        button.addEventListener('pointercancel', () => { pointerGesture = null; });
        cells.push({ button, gem, symbol });
        rowElement.append(button);
      }
      boardEl.append(rowElement);
    }
  }

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

  function formatScore(value) { return Math.max(0, Math.floor(value)).toLocaleString('de-DE'); }
  function announce(text) { $('message').textContent = text; }
  function motionTime(milliseconds) { return reducedMotion ? Math.min(12, milliseconds) : milliseconds; }
  function wait(milliseconds) { return new Promise(resolve => window.setTimeout(resolve, motionTime(milliseconds))); }

  async function waitForMotion(names, fallback) {
    if (reducedMotion || typeof boardEl.getAnimations !== 'function') {
      await wait(fallback);
      return;
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const wanted = new Set(names);
    const animations = boardEl.getAnimations({ subtree: true }).filter(animation => wanted.has(animation.animationName));
    if (!animations.length) {
      await wait(fallback);
      return;
    }
    await Promise.race([
      Promise.all(animations.map(animation => animation.finished.catch(() => {}))),
      new Promise(resolve => window.setTimeout(resolve, fallback + 120))
    ]);
  }

  function cellMotion(destination, source, amount = 1) {
    const destinationRect = cells[indexOf(destination)].button.getBoundingClientRect();
    const sourceRect = cells[indexOf(source)].button.getBoundingClientRect();
    return {
      x: (sourceRect.left - destinationRect.left) * amount,
      y: (sourceRect.top - destinationRect.top) * amount
    };
  }

  function cellEffectPoint(position) {
    const cellRect = cells[indexOf(position)].button.getBoundingClientRect();
    const hostRect = effectsEl.getBoundingClientRect();
    return {
      x: cellRect.left + cellRect.width / 2 - hostRect.left,
      y: cellRect.top + cellRect.height / 2 - hostRect.top,
      size: cellRect.width
    };
  }

  function addEffect(className, point, properties = {}) {
    if (reducedMotion) return null;
    const effect = document.createElement('span');
    effect.className = className;
    effect.style.left = point.x + 'px';
    effect.style.top = point.y + 'px';
    effect.style.setProperty('--effect-size', point.size + 'px');
    for (const [name, value] of Object.entries(properties)) effect.style.setProperty(name, String(value));
    effectsEl.append(effect);
    effect.addEventListener('animationend', () => effect.remove(), { once: true });
    window.setTimeout(() => effect.remove(), 1400);
    return effect;
  }

  function emitClearEffects(step) {
    if (reducedMotion || !step.cleared.length) return;
    let sumX = 0;
    let sumY = 0;
    for (const cell of step.cleared) {
      const point = cellEffectPoint(cell);
      const color = GEM_HEX[cell.gem.special === 'prism' ? 'prism' : cell.gem.color] || '#ffffff';
      sumX += point.x;
      sumY += point.y;
      for (let shard = 0; shard < 3; shard++) {
        const angle = ((cell.row * 17 + cell.col * 29 + shard * 120) % 360) + 'deg';
        addEffect('jewel-shard', point, {
          '--spark-color': color,
          '--spark-angle': angle,
          '--spark-distance': (point.size * (.52 + shard * .16)) + 'px',
          '--spark-delay': (shard * 22) + 'ms'
        });
      }
      if (cell.gem.special === 'row' || cell.gem.special === 'column') {
        addEffect('special-beam ' + cell.gem.special, point, { '--spark-color': color });
      } else if (cell.gem.special === 'bomb') {
        addEffect('special-ring bomb', point, { '--spark-color': color });
      } else if (cell.gem.special === 'prism') {
        addEffect('special-ring prism', point, { '--spark-color': color });
      }
    }
    addEffect('score-burst', {
      x: sumX / step.cleared.length,
      y: sumY / step.cleared.length,
      size: cellEffectPoint(step.cleared[0]).size
    }, { '--score-text': '"+' + formatScore(step.score) + '"' });
    boardEl.classList.remove('cascade-impact');
    void boardEl.offsetWidth;
    boardEl.classList.add('cascade-impact');
    window.setTimeout(() => boardEl.classList.remove('cascade-impact'), motionTime(360));
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
    gain.gain.exponentialRampToValueAtTime(options.gain || .045, start + .012);
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

  function playSound(name, level = 1) {
    if (!state.sound) return;
    if (name === 'select') tone(460, .07, { to: 560, type: 'sine', gain: .025 });
    else if (name === 'swap') {
      tone(330, .11, { to: 520, type: 'sine', gain: .026 });
      tone(520, .1, { delay: .045, to: 390, type: 'triangle', gain: .02 });
    } else if (name === 'invalid') tone(190, .14, { to: 145, type: 'triangle', gain: .035 });
    else if (name === 'match') {
      const base = 430 + Math.min(5, level) * 55;
      tone(base, .14, { to: base * 1.14, type: 'triangle', gain: .04 });
      tone(base * 1.25, .12, { delay: .045, type: 'sine', gain: .03 });
    } else if (name === 'special') {
      [523, 659, 784].forEach((note, index) => tone(note, .25, { delay: index * .055, type: 'triangle', gain: .04 }));
    } else if (name === 'power') {
      [392, 523, 659, 784].forEach((note, index) => tone(note, .3, { delay: index * .06, type: 'sine', gain: .045 }));
    } else if (name === 'shuffle') tone(260, .24, { to: 620, type: 'triangle', gain: .035 });
    else if (name === 'win') [523, 659, 784, 1047].forEach((note, index) => tone(note, .32, { delay: index * .08, type: 'sine', gain: .05 }));
    else if (name === 'lose') tone(320, .55, { to: 105, type: 'triangle', gain: .05 });
  }

  function clearVisual(exceptHint = false) {
    visual.clearing.clear();
    visual.falling.clear();
    visual.swapping.clear();
    visual.invalid.clear();
    visual.created.clear();
    visual.entering.clear();
    visual.victory.clear();
    if (!exceptHint) visual.hinted.clear();
  }

  function gemLabel(position, gem) {
    let label = 'Zeile ' + (position.row + 1) + ', Spalte ' + (position.col + 1) + ': ';
    if (!gem) return label + 'leer';
    label += gem.special === 'prism' ? SPECIAL_NAMES.prism : NAMES[gem.color];
    if (gem.special && gem.special !== 'prism') label += ', ' + SPECIAL_NAMES[gem.special];
    if (state.selected && state.selected.row === position.row && state.selected.col === position.col) label += ', ausgewählt';
    return label;
  }

  function render() {
    const locked = state.status !== 'playing';
    boardEl.classList.toggle('locked', locked);
    boardEl.dataset.phase = state.status;
    for (let index = 0; index < cells.length; index++) {
      const position = positionOf(index);
      const key = positionKey(position);
      const gemData = state.board[position.row]?.[position.col] || null;
      const cell = cells[index];
      const selected = !!state.selected && state.selected.row === position.row && state.selected.col === position.col;
      cell.button.className = 'cell';
      if (selected) cell.button.classList.add('selected');
      for (const name of ['clearing', 'created', 'entering', 'victory', 'hinted']) {
        if (visual[name].has(key)) cell.button.classList.add(name);
      }
      const fall = visual.falling.get(key);
      const swap = visual.swapping.get(key);
      const invalid = visual.invalid.get(key);
      if (fall) {
        cell.button.classList.add('falling');
        if (fall.spawned) cell.button.classList.add('spawned');
      }
      if (swap) cell.button.classList.add('swapping');
      if (invalid) cell.button.classList.add('invalid');
      cell.button.tabIndex = index === state.focusIndex ? 0 : -1;
      cell.button.setAttribute('aria-selected', String(selected));
      cell.button.setAttribute('aria-label', gemLabel(position, gemData));
      cell.button.setAttribute('aria-disabled', String(locked));

      cell.gem.className = 'gem';
      for (const property of ['--move-x', '--move-y', '--swap-duration', '--fall-y', '--fall-delay', '--fall-duration', '--victory-delay', '--enter-delay', '--shuffle-delay']) {
        cell.gem.style.removeProperty(property);
      }
      cell.gem.style.setProperty('--idle-delay', ((index * 137) % 1900) + 'ms');
      cell.gem.style.setProperty('--enter-delay', ((position.row + position.col) * 24) + 'ms');
      cell.gem.style.setProperty('--shuffle-delay', (((position.row * 3 + position.col * 5) % 11) * 18) + 'ms');
      if (fall) {
        cell.gem.style.setProperty('--fall-y', (-fall.pixels) + 'px');
        cell.gem.style.setProperty('--fall-delay', fall.delay + 'ms');
        cell.gem.style.setProperty('--fall-duration', fall.duration + 'ms');
      }
      const exchange = swap || invalid;
      if (exchange) {
        cell.gem.style.setProperty('--move-x', exchange.x + 'px');
        cell.gem.style.setProperty('--move-y', exchange.y + 'px');
        cell.gem.style.setProperty('--swap-duration', (exchange.duration || 270) + 'ms');
      }
      if (visual.victory.has(key)) {
        cell.gem.style.setProperty('--victory-delay', ((position.row + position.col) * 42) + 'ms');
      }
      if (gemData) {
        if (gemData.special === 'prism') cell.gem.classList.add('gem-prism');
        else cell.gem.classList.add('gem-' + gemData.color);
        if (gemData.special && gemData.special !== 'prism') cell.gem.classList.add('special-' + gemData.special);
        cell.symbol.textContent = gemData.special === 'prism' ? '✦' : SYMBOLS[gemData.color];
        cell.gem.hidden = false;
      } else {
        cell.symbol.textContent = '';
        cell.gem.hidden = true;
      }
    }

    $('score').textContent = formatScore(state.score);
    $('target').textContent = formatScore(state.target);
    $('moves').textContent = String(state.moves);
    $('high-score').textContent = formatScore(state.highScore);
    const goal = Math.min(100, state.score / state.target * 100);
    $('goal-fill').style.width = goal + '%';
    document.querySelector('.goal-track').setAttribute('aria-valuenow', String(Math.min(state.target, state.score)));
    document.querySelector('.goal-track').setAttribute('aria-valuemax', String(state.target));

    const leaves = [...$('power-leaves').children];
    leaves.forEach((leaf, index) => {
      leaf.classList.toggle('filled', index < state.charge);
      leaf.textContent = index < state.charge ? '◆' : '◇';
    });
    $('power-leaves').setAttribute('aria-label', 'Panda-Pfote: ' + state.charge + ' von ' + Logic.CONFIG.pandaCharge + ' geladen');
    const powerReady = state.charge >= Logic.CONFIG.pandaCharge;
    document.querySelector('.panda-power').classList.toggle('ready', powerReady);
    document.querySelector('.panda-power').classList.toggle('active', state.powerMode);
    $('power-btn').disabled = !powerReady || state.status !== 'playing';
    $('power-btn').setAttribute('aria-pressed', String(state.powerMode));
    $('power-btn').textContent = state.powerMode ? '🐾 Zwei wählen' : '🐾 Fern-Tausch';
    $('power-copy').textContent = state.powerMode ? 'Zwei beliebige Juwelen wählen' : powerReady ? 'Fern-Tausch bereit' : 'Kaskaden sammeln';

    const blocked = state.status !== 'playing';
    $('hint-btn').disabled = blocked;
    $('new-btn').disabled = state.status === 'resolving' || state.status === 'celebrating';
    $('sound-btn').setAttribute('aria-pressed', String(state.sound));
    $('sound-btn').textContent = state.sound ? '🔊 Ton an' : '🔇 Ton aus';
    boardEl.setAttribute('aria-busy', String(state.status === 'resolving' || state.status === 'celebrating'));
    scheduleSave();
  }

  function newGame(seed, shouldFocus = true) {
    const token = ++turnToken;
    clearTimeout(hintTimer);
    clearTimeout(comboTimer);
    clearTimeout(entranceTimer);
    clearTimeout(effectTimer);
    comboTimer = 0;
    entranceTimer = 0;
    effectTimer = 0;
    pointerGesture = null;
    effectsEl.replaceChildren();
    boardEl.classList.remove('cascade-impact', 'shuffle-out', 'shuffle-in', 'level-complete', 'level-cleared', 'round-lost');
    $('level-banner').hidden = true;
    state.seed = String(seed || ('juwelen-' + Date.now() + '-' + Math.floor(Math.random() * 1000000)));
    random = Logic.seededRandom(state.seed);
    state.board = Logic.createBoard({ random });
    state.score = 0;
    state.moves = Logic.CONFIG.moves;
    state.target = Logic.CONFIG.target;
    state.charge = 0;
    state.selected = null;
    state.focusIndex = 0;
    state.powerMode = false;
    state.status = 'playing';
    state.turns = 0;
    state.largestCascade = 0;
    clearVisual();
    for (let index = 0; index < Logic.CONFIG.rows * Logic.CONFIG.cols; index++) visual.entering.add(positionKey(positionOf(index)));
    $('result').hidden = true;
    $('result').classList.remove('won', 'lost');
    $('combo-pop').hidden = true;
    announce('Wähle zwei benachbarte Juwelen.');
    render();
    entranceTimer = window.setTimeout(() => {
      if (token !== turnToken) return;
      visual.entering.clear();
      entranceTimer = 0;
      render();
    }, motionTime(720));
    if (shouldFocus) queueMicrotask(() => cells[0].button.focus({ preventScroll: true }));
  }

  function selectPosition(position) {
    if (state.status !== 'playing' || !Logic.inBounds(state.board, position)) return false;
    state.selected = { row: position.row, col: position.col };
    state.focusIndex = indexOf(position);
    visual.hinted.clear();
    playSound('select');
    announce(state.powerMode ? 'Erstes Juwel für den Fern-Tausch gewählt.' : 'Juwel gewählt – jetzt einen Nachbarn auswählen.');
    render();
    return true;
  }

  function activatePower() {
    if (state.status !== 'playing' || state.charge < Logic.CONFIG.pandaCharge) return false;
    initAudio();
    state.powerMode = !state.powerMode;
    state.selected = null;
    visual.hinted.clear();
    if (state.powerMode) {
      playSound('power');
      announce('Panda-Pfote aktiv: Wähle zwei beliebige Juwelen.');
    } else announce('Panda-Pfote abgebrochen.');
    render();
    return state.powerMode;
  }

  function showCombo(cascade) {
    if (cascade < 2) return;
    const popup = $('combo-pop');
    clearTimeout(comboTimer);
    popup.textContent = cascade + '× Kaskade!';
    popup.hidden = false;
    popup.style.animation = 'none';
    void popup.offsetWidth;
    popup.style.animation = '';
    comboTimer = window.setTimeout(() => {
      popup.hidden = true;
      comboTimer = 0;
    }, motionTime(650));
  }

  function exchangeMotions(from, to, amount = 1) {
    const first = cellMotion(from, to, amount);
    const second = cellMotion(to, from, amount);
    const duration = Math.min(520, 250 + Math.hypot(first.x, first.y) * .42);
    first.duration = duration;
    second.duration = duration;
    return new Map([
      [positionKey(from), first],
      [positionKey(to), second]
    ]);
  }

  async function animateInvalid(from, to, token) {
    visual.swapping.clear();
    visual.invalid = exchangeMotions(from, to, state.powerMode ? .34 : 1);
    state.selected = null;
    playSound('invalid');
    announce(state.powerMode ? 'Dieser Fern-Tausch bildet keine Reihe – die Panda-Pfote bleibt geladen.' : 'Dieser Tausch springt zurück und kostet keinen Zug.');
    render();
    await waitForMotion(['jewel-reject'], 390);
    if (token !== turnToken) return;
    visual.invalid.clear();
    state.status = 'playing';
    render();
    cells[indexOf(to)].button.focus({ preventScroll: true });
  }

  async function animateShuffle(nextBoard, token) {
    clearVisual();
    boardEl.classList.remove('shuffle-in');
    boardEl.classList.add('shuffle-out');
    render();
    playSound('shuffle');
    announce('Keine Züge mehr – der Panda mischt den Schatzgarten neu …');
    await waitForMotion(['jewel-shuffle-out'], 460);
    if (token !== turnToken) return false;
    state.board = Logic.cloneBoard(nextBoard);
    boardEl.classList.remove('shuffle-out');
    boardEl.classList.add('shuffle-in');
    render();
    await waitForMotion(['jewel-shuffle-in'], 520);
    boardEl.classList.remove('shuffle-in');
    return token === turnToken;
  }

  function emitVictoryEffects() {
    if (reducedMotion) return;
    const host = effectsEl.getBoundingClientRect();
    const board = boardEl.getBoundingClientRect();
    const colors = Object.values(GEM_HEX);
    for (let index = 0; index < 30; index++) {
      addEffect('victory-confetti', {
        x: board.left - host.left + board.width * ((index * 37) % 101) / 100,
        y: board.top - host.top + board.height * (.12 + ((index * 19) % 24) / 100),
        size: 8 + index % 5
      }, {
        '--spark-color': colors[index % colors.length],
        '--confetti-x': ((index % 2 ? 1 : -1) * (24 + index % 7 * 8)) + 'px',
        '--confetti-delay': ((index * 31) % 280) + 'ms',
        '--confetti-turn': (180 + (index * 47) % 420) + 'deg'
      });
    }
  }

  async function celebrateWin(token) {
    state.status = 'celebrating';
    state.selected = null;
    state.powerMode = false;
    clearTimeout(comboTimer);
    comboTimer = 0;
    $('combo-pop').hidden = true;
    clearVisual();
    for (let index = 0; index < cells.length; index++) {
      const position = positionOf(index);
      if (state.board[position.row]?.[position.col]) visual.victory.add(positionKey(position));
    }
    boardEl.classList.add('level-complete');
    $('level-banner').hidden = false;
    announce('Ziel erreicht! Der Panda lässt den Schatzgarten aufleuchten.');
    emitVictoryEffects();
    render();
    playSound('win');
    await waitForMotion(['jewel-victory'], 1350);
    if (token !== turnToken) return false;
    state.board = Logic.createEmptyBoard(Logic.CONFIG.rows, Logic.CONFIG.cols);
    clearVisual();
    effectsEl.replaceChildren();
    boardEl.classList.remove('level-complete');
    boardEl.classList.add('level-cleared');
    render();
    await wait(180);
    if (token !== turnToken) return false;
    finishRound(true, { sound: false });
    return true;
  }

  async function attemptSwap(from, to) {
    if (state.status !== 'playing' || !Logic.inBounds(state.board, from) || !Logic.inBounds(state.board, to)) return false;
    initAudio();
    const token = ++turnToken;
    const usingPower = state.powerMode;
    state.status = 'resolving';
    state.focusIndex = indexOf(to);
    clearTimeout(hintTimer);
    clearTimeout(entranceTimer);
    hintTimer = 0;
    entranceTimer = 0;
    clearVisual();

    const result = Logic.resolveTurn(state.board, from, to, { allowRemote: usingPower, random });
    if (!result.valid) {
      await animateInvalid(from, to, token);
      return false;
    }

    state.board = Logic.cloneBoard(result.steps[0]?.before || Logic.swapCells(state.board, from, to));
    visual.swapping = exchangeMotions(from, to);
    announce(usingPower ? 'Die Panda-Pfote tauscht zwei Juwelen …' : 'Juwelen tauschen …');
    playSound('swap');
    render();
    await waitForMotion(['jewel-swap'], usingPower ? 520 : 290);
    if (token !== turnToken) return false;

    state.moves--;
    state.turns++;
    state.selected = null;
    state.powerMode = false;
    if (result.usedPower) state.charge = 0;
    visual.swapping.clear();

    for (const step of result.steps) {
      if (token !== turnToken) return false;
      state.board = Logic.cloneBoard(step.before);
      visual.clearing = new Set(step.cleared.map(cell => positionKey(cell)));
      visual.falling.clear();
      visual.created.clear();
      state.score += step.score;
      if (state.score > state.highScore) state.highScore = state.score;
      state.largestCascade = Math.max(state.largestCascade, step.cascade);
      showCombo(step.cascade);
      announce(step.cascade > 1
        ? step.cascade + '× Kaskade – der Schatzgarten funkelt weiter!'
        : step.cleared.length + ' Juwelen leuchten auf …');
      const activatedSpecial = step.cleared.some(cell => !!cell.gem.special);
      playSound(step.created.length || activatedSpecial ? 'special' : 'match', step.cascade);
      render();
      emitClearEffects(step);
      const scoreStat = $('score').parentElement;
      scoreStat.classList.remove('score-pop');
      void scoreStat.offsetWidth;
      scoreStat.classList.add('score-pop');
      clearTimeout(effectTimer);
      effectTimer = window.setTimeout(() => scoreStat.classList.remove('score-pop'), motionTime(420));
      await waitForMotion(['jewel-crack'], 380);
      if (token !== turnToken) return false;

      state.board = Logic.cloneBoard(step.afterClear);
      visual.clearing.clear();
      visual.created = new Set(step.created.map(creation => positionKey(creation)));
      render();
      if (step.created.length) await waitForMotion(['special-born'], 300);
      else await wait(80);
      if (token !== turnToken) return false;

      const firstRow = cells[0].button.getBoundingClientRect();
      const secondRow = cells[Logic.CONFIG.cols].button.getBoundingClientRect();
      const rowPitch = Math.max(firstRow.height, secondRow.top - firstRow.top);
      const fallMap = new Map();
      let fallFallback = 340;
      for (const movement of step.falls || []) {
        if (!movement.spawned && movement.distance <= 0) continue;
        const delay = movement.to.col * 13 + (movement.spawned ? movement.to.row * 10 : 0);
        const duration = 300 + Math.min(7, movement.distance) * 52;
        fallFallback = Math.max(fallFallback, delay + duration);
        fallMap.set(positionKey(movement.to), {
          pixels: Math.max(rowPitch * movement.distance, rowPitch * .7),
          distance: movement.distance,
          spawned: movement.spawned,
          delay,
          duration
        });
      }
      const createdDestinations = new Set();
      for (const creation of step.created) {
        const movement = (step.falls || []).find(item => !item.spawned && item.from.row === creation.row && item.from.col === creation.col);
        createdDestinations.add(positionKey(movement ? movement.to : creation));
      }
      state.board = Logic.cloneBoard(step.afterFall);
      visual.falling = fallMap;
      visual.created = createdDestinations;
      render();
      await waitForMotion(['jewel-fall'], fallFallback + 80);
      if (token !== turnToken) return false;
      visual.falling.clear();
      visual.created.clear();
      render();
      await wait(45);
    }

    if (token !== turnToken) return false;
    const settledBoard = Logic.cloneBoard(result.board);
    if (result.reshuffled) {
      if (!await animateShuffle(settledBoard, token)) return false;
    } else {
      state.board = settledBoard;
    }
    state.charge = Math.min(Logic.CONFIG.pandaCharge, state.charge + result.cascades);
    clearVisual();

    if (state.score >= state.target) {
      await celebrateWin(token);
    } else if (state.moves <= 0) {
      finishRound(false);
    } else {
      state.status = 'playing';
      render();
      const specialText = result.created ? ' · ' + result.created + ' Spezialjuwel' + (result.created === 1 ? '' : 'e') : '';
      const powerText = state.charge >= Logic.CONFIG.pandaCharge ? ' Die Panda-Pfote ist bereit!' : '';
      const shuffleText = result.reshuffled ? ' Feld frisch gemischt.' : '';
      announce('+' + formatScore(result.score) + ' Punkte · ' + result.cascades + ' Kaskadenstufe' + (result.cascades === 1 ? '' : 'n') + specialText + '.' + shuffleText + powerText);
      queueMicrotask(() => cells[state.focusIndex].button.focus({ preventScroll: true }));
    }
    return true;
  }

  function finishRound(won, options = {}) {
    clearTimeout(hintTimer);
    clearTimeout(comboTimer);
    clearTimeout(entranceTimer);
    clearTimeout(effectTimer);
    hintTimer = 0;
    comboTimer = 0;
    entranceTimer = 0;
    effectTimer = 0;
    pointerGesture = null;
    $('combo-pop').hidden = true;
    effectsEl.replaceChildren();
    clearVisual();
    boardEl.classList.remove('cascade-impact', 'shuffle-out', 'shuffle-in', 'level-complete');
    boardEl.classList.toggle('round-lost', !won);
    if (!won) $('level-banner').hidden = true;
    state.status = won ? 'won' : 'lost';
    state.selected = null;
    state.powerMode = false;
    if (state.score > state.highScore) state.highScore = state.score;
    saveSettings();
    const summary = won
      ? formatScore(state.score) + ' Punkte mit ' + state.moves + ' übrigen Zügen. Größte Kaskade: ' + Math.max(1, state.largestCascade) + '×.'
      : formatScore(state.score) + ' von ' + formatScore(state.target) + ' Punkten. Beim nächsten Versuch wartet ein neues Feld.';
    announce(won ? 'Runde geschafft – der Schatzgarten ist vollständig erleuchtet.' : 'Runde beendet – diesmal fehlten noch ein paar Funken.');
    $('result-icon').textContent = won ? '🐼💎' : '🐼';
    $('result-title').textContent = won ? 'Schatzgarten erleuchtet!' : 'Fast geschafft';
    $('result-text').textContent = summary;
    $('result').classList.toggle('won', won);
    $('result').classList.toggle('lost', !won);
    $('result').hidden = false;
    render();
    if (options.sound !== false) playSound(won ? 'win' : 'lose');
    queueMicrotask(() => $('result-new-btn').focus());
  }

  function handleCellClick(_event, index) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (state.status !== 'playing') return;
    initAudio();
    const position = positionOf(index);
    if (!state.selected) {
      selectPosition(position);
      return;
    }
    if (state.selected.row === position.row && state.selected.col === position.col) {
      state.selected = null;
      announce(state.powerMode ? 'Auswahl aufgehoben – Panda-Pfote bleibt aktiv.' : 'Auswahl aufgehoben.');
      render();
      return;
    }
    if (state.powerMode || Logic.isAdjacent(state.selected, position)) {
      const from = state.selected;
      attemptSwap(from, position);
      return;
    }
    selectPosition(position);
  }

  function moveFocus(index, deltaRow, deltaCol) {
    const current = positionOf(index);
    const row = Math.max(0, Math.min(Logic.CONFIG.rows - 1, current.row + deltaRow));
    const col = Math.max(0, Math.min(Logic.CONFIG.cols - 1, current.col + deltaCol));
    state.focusIndex = row * Logic.CONFIG.cols + col;
    render();
    cells[state.focusIndex].button.focus({ preventScroll: true });
  }

  function handleCellKeydown(event, index) {
    if (state.status === 'resolving' || state.status === 'celebrating') {
      if (event.key.startsWith('Arrow') || event.key === 'Enter' || event.key === ' ') event.preventDefault();
      return;
    }
    if (event.key === 'ArrowLeft') { event.preventDefault(); moveFocus(index, 0, -1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); moveFocus(index, 0, 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(index, -1, 0); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(index, 1, 0); }
    else if ((event.key === 'Enter' || event.key === ' ') && state.status === 'playing') {
      event.preventDefault();
      handleCellClick(event, index);
    }
  }

  function handlePointerDown(event, index) {
    if (state.status !== 'playing' || event.button !== 0) return;
    pointerGesture = { index, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    try { cells[index].button.setPointerCapture(event.pointerId); } catch (_error) { /* capture is optional */ }
  }

  function handlePointerUp(event, index) {
    if (!pointerGesture || pointerGesture.pointerId !== event.pointerId || state.status !== 'playing') {
      pointerGesture = null;
      return;
    }
    const start = pointerGesture;
    pointerGesture = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const threshold = Math.max(14, cells[index].button.getBoundingClientRect().width * .22);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    event.preventDefault();
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 0);
    const from = positionOf(start.index);
    const to = { row: from.row, col: from.col };
    if (Math.abs(dx) > Math.abs(dy)) to.col += dx > 0 ? 1 : -1;
    else to.row += dy > 0 ? 1 : -1;
    if (Logic.inBounds(state.board, to)) attemptSwap(from, to);
  }

  function hint() {
    if (state.status !== 'playing') return null;
    initAudio();
    const moves = Logic.findValidMoves(state.board);
    if (!moves.length) {
      const shuffled = Logic.reshuffleBoard(state.board, random);
      state.board = shuffled.board;
      announce('Das Feld wurde gemischt – jetzt gibt es wieder einen Zug.');
      playSound('shuffle');
      render();
      return null;
    }
    clearTimeout(hintTimer);
    const choice = moves[(state.turns + state.focusIndex) % moves.length];
    visual.hinted = new Set([positionKey(choice.from), positionKey(choice.to)]);
    state.selected = null;
    announce('Tipp: Diese beiden Juwelen können eine Reihe bilden.');
    playSound('select');
    render();
    hintTimer = window.setTimeout(() => {
      visual.hinted.clear();
      render();
    }, 2300);
    return { from: { ...choice.from }, to: { ...choice.to } };
  }

  function toggleSound() {
    state.sound = !state.sound;
    if (state.sound) {
      initAudio();
      playSound('select');
      announce('Sound eingeschaltet.');
    } else {
      if (masterGain && audioContext) {
        masterGain.gain.cancelScheduledValues(audioContext.currentTime);
        masterGain.gain.value = 0;
      }
      announce('Sound ausgeschaltet.');
    }
    render();
  }

  $('power-btn').addEventListener('click', activatePower);
  $('hint-btn').addEventListener('click', hint);
  $('sound-btn').addEventListener('click', toggleSound);
  $('new-btn').addEventListener('click', () => newGame());
  $('result-new-btn').addEventListener('click', () => newGame());
  $('result-close-btn').addEventListener('click', () => { $('result').hidden = true; });

  document.addEventListener('keydown', event => {
    if (!$('result').hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        $('result').hidden = true;
      }
      return;
    }
    const tag = event.target?.tagName || '';
    const isCell = event.target?.classList?.contains('cell');
    if ((tag === 'BUTTON' && !isCell) || tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'A') return;
    if (state.status !== 'playing') return;
    const key = event.key.toLowerCase();
    if (key === 'h') { event.preventDefault(); hint(); }
    else if (key === 'n') { event.preventDefault(); newGame(); }
    else if (event.key === 'Escape') {
      event.preventDefault();
      state.selected = null;
      state.powerMode = false;
      visual.hinted.clear();
      announce('Auswahl aufgehoben.');
      render();
    }
  });

  window.addEventListener('pagehide', saveSettings);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion = event => { reducedMotion = event.matches; };
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', syncMotion);

  buildBoard();
  readSettings();
  newGame(undefined, false);

  window.PandaJewels = Object.freeze({
    newGame,
    hint,
    activatePower,
    select: (row, col) => selectPosition({ row, col }),
    swap: (from, to) => attemptSwap(from, to),
    getState: () => ({
      board: Logic.cloneBoard(state.board),
      score: state.score,
      highScore: state.highScore,
      moves: state.moves,
      target: state.target,
      charge: state.charge,
      selected: state.selected ? { ...state.selected } : null,
      focusIndex: state.focusIndex,
      powerMode: state.powerMode,
      status: state.status,
      sound: state.sound,
      audioMuted: !state.sound && (!masterGain || masterGain.gain.value === 0),
      seed: state.seed,
      turns: state.turns,
      largestCascade: state.largestCascade
    })
  });
})();
