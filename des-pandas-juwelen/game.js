(() => {
  'use strict';

  const Logic = window.JewelsLogic;
  if (!Logic) throw new Error('JewelsLogic konnte nicht geladen werden.');

  const $ = id => document.getElementById(id);
  const boardEl = $('board');
  const STORAGE_KEY = 'des-pandas-juwelen-settings-v1';
  const SYMBOLS = Object.freeze({ jade: '▲', amber: '✦', ruby: '●', sapphire: '◆', amethyst: '✿', pearl: '⬟' });
  const NAMES = Object.freeze({ jade: 'Jade', amber: 'Bernstein', ruby: 'Rubin', sapphire: 'Saphir', amethyst: 'Amethyst', pearl: 'Perle' });
  const SPECIAL_NAMES = Object.freeze({ row: 'waagerechtes Linienjuwel', column: 'senkrechtes Linienjuwel', bomb: 'Pfotenbombe', prism: 'Panda-Prisma' });

  let random = Logic.seededRandom('boot');
  let audioContext = null;
  let masterGain = null;
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let saveTimer = 0;
  let hintTimer = 0;
  let comboTimer = 0;
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
    falling: new Set(),
    swapping: new Set(),
    invalid: new Set(),
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
    else if (name === 'invalid') tone(190, .14, { to: 145, type: 'triangle', gain: .035 });
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
    for (let index = 0; index < cells.length; index++) {
      const position = positionOf(index);
      const key = positionKey(position);
      const gemData = state.board[position.row]?.[position.col] || null;
      const cell = cells[index];
      const selected = !!state.selected && state.selected.row === position.row && state.selected.col === position.col;
      cell.button.className = 'cell';
      if (selected) cell.button.classList.add('selected');
      for (const name of ['clearing', 'falling', 'swapping', 'invalid', 'hinted']) {
        if (visual[name].has(key)) cell.button.classList.add(name);
      }
      cell.button.tabIndex = index === state.focusIndex ? 0 : -1;
      cell.button.setAttribute('aria-selected', String(selected));
      cell.button.setAttribute('aria-label', gemLabel(position, gemData));
      cell.button.setAttribute('aria-disabled', String(state.status !== 'playing'));

      cell.gem.className = 'gem';
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
    $('new-btn').disabled = state.status === 'resolving';
    $('sound-btn').setAttribute('aria-pressed', String(state.sound));
    $('sound-btn').textContent = state.sound ? '🔊 Ton an' : '🔇 Ton aus';
    boardEl.setAttribute('aria-busy', String(state.status === 'resolving'));
    scheduleSave();
  }

  function newGame(seed, shouldFocus = true) {
    turnToken++;
    clearTimeout(hintTimer);
    clearTimeout(comboTimer);
    comboTimer = 0;
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
    $('result').hidden = true;
    $('combo-pop').hidden = true;
    announce('Wähle zwei benachbarte Juwelen.');
    render();
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

  async function animateInvalid(from, to, token) {
    visual.swapping.clear();
    visual.invalid = new Set([positionKey(from), positionKey(to)]);
    state.selected = null;
    playSound('invalid');
    announce(state.powerMode ? 'Dieser Fern-Tausch bildet keine Reihe – die Panda-Pfote bleibt geladen.' : 'Dieser Tausch bildet keine Reihe und kostet keinen Zug.');
    render();
    await wait(300);
    if (token !== turnToken) return;
    visual.invalid.clear();
    state.status = 'playing';
    render();
    cells[indexOf(to)].button.focus({ preventScroll: true });
  }

  async function attemptSwap(from, to) {
    if (state.status !== 'playing' || !Logic.inBounds(state.board, from) || !Logic.inBounds(state.board, to)) return false;
    initAudio();
    const token = ++turnToken;
    const usingPower = state.powerMode;
    state.status = 'resolving';
    state.focusIndex = indexOf(to);
    visual.hinted.clear();
    visual.invalid.clear();
    visual.swapping = new Set([positionKey(from), positionKey(to)]);
    render();

    const result = Logic.resolveTurn(state.board, from, to, { allowRemote: usingPower, random });
    await wait(170);
    if (token !== turnToken) return false;
    if (!result.valid) {
      await animateInvalid(from, to, token);
      return false;
    }

    state.board = result.steps[0]?.before || Logic.swapCells(state.board, from, to);
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
      state.score += step.score;
      if (state.score > state.highScore) state.highScore = state.score;
      state.largestCascade = Math.max(state.largestCascade, step.cascade);
      showCombo(step.cascade);
      playSound(step.created.length ? 'special' : 'match', step.cascade);
      render();
      await wait(235);
      if (token !== turnToken) return false;

      state.board = Logic.cloneBoard(step.afterClear);
      visual.clearing.clear();
      render();
      await wait(75);
      if (token !== turnToken) return false;

      state.board = Logic.cloneBoard(step.afterFall);
      visual.falling = new Set(state.board.flatMap((row, rowIndex) => row.map((gem, colIndex) => gem ? rowIndex + ':' + colIndex : null)).filter(Boolean));
      render();
      await wait(285);
      visual.falling.clear();
    }

    if (token !== turnToken) return false;
    state.board = Logic.cloneBoard(result.board);
    state.charge = Math.min(Logic.CONFIG.pandaCharge, state.charge + result.cascades);
    state.status = 'playing';
    clearVisual();
    render();

    if (state.score >= state.target) {
      finishRound(true);
    } else if (state.moves <= 0) {
      finishRound(false);
    } else if (result.reshuffled) {
      playSound('shuffle');
      announce('Keine Züge mehr – der Panda hat das Feld automatisch gemischt.');
    } else {
      const specialText = result.created ? ' · ' + result.created + ' Spezialjuwel' + (result.created === 1 ? '' : 'e') : '';
      const powerText = state.charge >= Logic.CONFIG.pandaCharge ? ' Die Panda-Pfote ist bereit!' : '';
      announce('+' + formatScore(result.score) + ' Punkte · ' + result.cascades + ' Kaskadenstufe' + (result.cascades === 1 ? '' : 'n') + specialText + '.' + powerText);
      queueMicrotask(() => cells[state.focusIndex].button.focus({ preventScroll: true }));
    }
    return true;
  }

  function finishRound(won) {
    state.status = won ? 'won' : 'lost';
    state.selected = null;
    state.powerMode = false;
    if (state.score > state.highScore) state.highScore = state.score;
    saveSettings();
    $('result-icon').textContent = won ? '🐼💎' : '🐼';
    $('result-title').textContent = won ? 'Schatzgarten erleuchtet!' : 'Fast geschafft';
    $('result-text').textContent = won
      ? formatScore(state.score) + ' Punkte mit ' + state.moves + ' übrigen Zügen. Größte Kaskade: ' + Math.max(1, state.largestCascade) + '×.'
      : formatScore(state.score) + ' von ' + formatScore(state.target) + ' Punkten. Beim nächsten Versuch wartet ein neues Feld.';
    $('result').hidden = false;
    render();
    playSound(won ? 'win' : 'lose');
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
