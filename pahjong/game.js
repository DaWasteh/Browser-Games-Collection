(() => {
  'use strict';

  const E = window.PahjongEngine;
  if (!E) throw new Error('PahjongEngine fehlt.');
  const $ = id => document.getElementById(id);
  const ui = {
    board: $('board'),
    boardShell: $('board-shell'),
    remaining: $('remaining'),
    pairs: $('pairs'),
    moves: $('moves'),
    shuffles: $('shuffles'),
    time: $('time'),
    bestTime: $('best-time'),
    wins: $('wins'),
    message: $('message'),
    dealCode: $('deal-code'),
    hint: $('hint'),
    shuffle: $('shuffle'),
    undo: $('undo'),
    newGame: $('new-game'),
    zoomOut: $('zoom-out'),
    zoomIn: $('zoom-in'),
    zoomFit: $('zoom-fit'),
    zoomValue: $('zoom-value'),
    result: $('result'),
    resultText: $('result-text'),
    resultButton: $('result-button'),
    resultUndo: $('result-undo')
  };

  const SAVE_KEY = 'pahjong-save-v2';
  const STATS_KEY = 'pahjong-stats-v1';
  const MAX_HISTORY = 100;
  const ZOOM_LEVELS = [1, 1.35, 1.7, 2.1];

  let state = null;
  let selected = null;
  let hintIds = [];
  let hintTimer = 0;
  let history = [];
  let elapsedMs = 0;
  let runningSince = null;
  let focusId = null;
  let pendingFocus = false;
  let zoomIndex = 0;
  let winRecorded = false;
  let stats = loadStats();

  function loadStats() {
    const base = { wins: 0, bestScore: 0, bestTimeSec: null, bestMoves: null, streak: 0 };
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      return {
        wins: Math.max(0, Number(parsed.wins) || 0),
        bestScore: Math.max(0, Number(parsed.bestScore) || 0),
        bestTimeSec: Number.isFinite(Number(parsed.bestTimeSec)) && Number(parsed.bestTimeSec) >= 0 ? Math.round(Number(parsed.bestTimeSec)) : null,
        bestMoves: Number.isFinite(Number(parsed.bestMoves)) && Number(parsed.bestMoves) > 0 ? Math.round(Number(parsed.bestMoves)) : null,
        streak: Math.max(0, Number(parsed.streak) || 0)
      };
    } catch (_error) {
      return base;
    }
  }

  function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (_error) { /* optional */ }
  }

  function buildScoreLabel() {
    const parts = [];
    if (stats.bestTimeSec != null) parts.push(`Bestzeit ${formatTime(stats.bestTimeSec * 1000)}`);
    if (stats.wins > 0) parts.push(`${stats.wins} ${stats.wins === 1 ? 'Sieg' : 'Siege'}`);
    return parts.join(' · ');
  }

  function syncSharedScores() {
    if (!window.GameScores || (!stats.wins && !stats.bestScore)) return;
    window.GameScores.sync('pahjong', {
      score: stats.bestScore || undefined,
      timeSec: stats.bestTimeSec != null ? stats.bestTimeSec : undefined,
      label: buildScoreLabel()
    });
  }

  function say(text) { ui.message.textContent = text; }
  function randomSeed() {
    try {
      const values = new Uint32Array(2);
      crypto.getRandomValues(values);
      return `${values[0].toString(36)}-${values[1].toString(36)}`;
    } catch (_error) {
      return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
    }
  }

  function currentElapsedMs() { return runningSince == null ? elapsedMs : elapsedMs + Date.now() - runningSince; }
  function pauseClock() { if (runningSince != null) { elapsedMs += Date.now() - runningSince; runningSince = null; } }
  function resumeClock() { if (state && state.status === 'playing' && runningSince == null && !document.hidden) runningSince = Date.now(); }
  function formatTime(milliseconds) {
    const total = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, seconds = total % 60;
    if (hours) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function remember(entry) {
    history.push(entry);
    if (history.length > MAX_HISTORY) history.shift();
  }
  function pairUndoEntry(firstId, secondId) {
    return {
      kind: 'pair',
      firstId,
      secondId,
      moves: state.moves,
      shuffles: state.shuffles,
      status: state.status
    };
  }
  function shuffleUndoEntry() {
    return {
      kind: 'shuffle',
      faceUids: state.cards.map(card => card.face.uid),
      moves: state.moves,
      shuffles: state.shuffles,
      status: state.status,
      solutionPlan: Array.isArray(state.solutionPlan) ? state.solutionPlan.flat() : []
    };
  }
  function clearHint() { hintIds = []; if (hintTimer) clearTimeout(hintTimer); hintTimer = 0; }

  function saveGame() {
    if (!state) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: 2,
        state,
        elapsedMs: currentElapsedMs(),
        zoomIndex,
        winRecorded
      }));
    } catch (_error) { /* Speicher kann blockiert sein. */ }
  }

  function loadGame() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!data || data.version !== 2 || !E.validateState(data.state)) return false;
      state = data.state;
      elapsedMs = Number.isFinite(data.elapsedMs) && data.elapsedMs >= 0 && data.elapsedMs < 31536000000 ? data.elapsedMs : 0;
      zoomIndex = Number.isInteger(data.zoomIndex) ? Math.max(0, Math.min(ZOOM_LEVELS.length - 1, data.zoomIndex)) : 0;
      winRecorded = Boolean(data.winRecorded) || state.status === 'won';
      selected = null;
      hintIds = [];
      history = [];
      focusId = E.freeIds(state)[0] ?? null;
      runningSince = null;
      if (state.status === 'playing') resumeClock();
      render();
      if (state.status === 'won') showResult();
      say(state.status === 'blocked' ? 'Gespeicherte Sackgasse geladen – nutze Neu mischen oder Rückgängig.' : 'Gespeichertes Spiel wiederhergestellt.');
      return true;
    } catch (_error) {
      try { localStorage.removeItem(SAVE_KEY); } catch (_ignored) { /* leer */ }
      return false;
    }
  }

  function newGame(seedValue) {
    pauseClock();
    clearHint();
    state = E.createState({ seed: seedValue == null ? randomSeed() : seedValue });
    selected = null;
    history = [];
    elapsedMs = 0;
    runningSince = null;
    winRecorded = false;
    focusId = E.freeIds(state)[0] ?? null;
    ui.result.hidden = true;
    resumeClock();
    pendingFocus = true;
    render();
    say('Neues Spiel bereit: Wähle einen hellen, freien Stein.');
    saveGame();
  }

  function nearestFree(origin) {
    const ids = E.freeIds(state);
    if (!ids.length) return null;
    if (!origin) return ids[0];
    let best = ids[0], bestDistance = Infinity;
    for (const id of ids) {
      const card = state.cards[id];
      const distance = Math.abs(card.x - origin.x) + Math.abs(card.y - origin.y) + Math.abs(card.z - origin.z) * 1.5;
      if (distance < bestDistance) { bestDistance = distance; best = id; }
    }
    return best;
  }

  function sfx(name) { if (window.GameAudio) window.GameAudio.play(name); }

  function recordWin() {
    if (winRecorded) return { score: stats.bestScore, isNewBestTime: false };
    winRecorded = true;
    const elapsedSec = Math.max(0, Math.floor(currentElapsedMs() / 1000));
    const score = Math.max(100, 2000 - state.shuffles * 150 - Math.floor(elapsedSec * 0.5) - Math.max(0, state.moves - 72) * 10);
    const isNewBestTime = stats.bestTimeSec == null || elapsedSec < stats.bestTimeSec;
    stats.wins += 1;
    stats.streak += 1;
    if (score > stats.bestScore) stats.bestScore = score;
    if (isNewBestTime) stats.bestTimeSec = elapsedSec;
    if (stats.bestMoves == null || state.moves < stats.bestMoves) stats.bestMoves = state.moves;
    saveStats();
    if (window.GameScores) {
      window.GameScores.record('pahjong', {
        score,
        timeSec: elapsedSec,
        won: true,
        label: buildScoreLabel()
      });
    }
    return { score, isNewBestTime };
  }

  function choose(id) {
    if (state.status === 'won') return;
    if (state.status === 'blocked') { say('Keine Paarung mehr möglich – nutze Neu mischen oder Rückgängig.'); return; }
    if (!E.isFree(state, id)) { sfx('error'); say('Dieser Stein ist noch bedeckt oder an beiden Seiten blockiert.'); return; }
    focusId = id;
    clearHint();
    if (selected == null) {
      selected = id;
      const partners = E.matchingPairs(state).filter(pair => pair.includes(id)).length;
      sfx('select');
      render();
      const partnerText = partners === 1 ? '1 freier Partner verfügbar.' : (partners ? `${partners} freie Partner verfügbar.` : 'Kein freier Partner – wähle einen anderen Stein.');
      say(`${state.cards[id].face.name} gewählt. ${partnerText}`);
      return;
    }
    if (selected === id) {
      selected = null;
      render();
      say('Auswahl aufgehoben.');
      return;
    }
    const first = state.cards[selected], second = state.cards[id];
    if (!E.isMatch(first, second)) {
      selected = id;
      sfx('error');
      render();
      say(`${second.face.name} passt nicht zu ${first.face.name}; der neue Stein ist jetzt ausgewählt.`);
      return;
    }

    const undoEntry = pairUndoEntry(selected, id);
    const origin = { x: second.x, y: second.y, z: second.z };
    const result = E.removePair(state, selected, id);
    if (!result.ok) { selected = null; render(); say('Dieses Paar kann gerade nicht entfernt werden.'); return; }
    remember(undoEntry);
    selected = null;
    sfx('match');
    focusId = nearestFree(origin);
    pendingFocus = true;
    if (result.status !== 'playing') pauseClock();
    if (result.status === 'won') {
      const winInfo = recordWin();
      render();
      say('Geschafft – alle 144 Steine sind entfernt!');
      sfx('win');
      if (window.GameFX) window.GameFX.celebrate();
      showResult(winInfo);
    } else if (result.status === 'blocked') {
      render();
      sfx('lose');
      say('Keine freien Paare mehr. Mische die Steine neu oder gehe einen Zug zurück.');
    } else {
      render();
      const pairCount = E.matchingPairs(state).length;
      say(`Paar entfernt. Noch ${result.remaining} Steine und ${pairCount === 1 ? '1 freies Paar' : `${pairCount} freie Paare`}.`);
    }
    saveGame();
  }

  function showHint() {
    if (state.status === 'won') return;
    clearHint();
    selected = null; // genau zwei, eindeutig als Hinweis markierte Steine
    const pair = E.findHint(state);
    if (!pair) {
      state.status = 'blocked';
      pauseClock();
      render();
      say('Kein freies Paar – nutze Neu mischen oder Rückgängig.');
      saveGame();
      return;
    }
    hintIds = pair.slice();
    sfx('hint');
    focusId = pair[0];
    pendingFocus = true;
    render();
    const first = state.cards[pair[0]].face.name;
    const second = state.cards[pair[1]].face.name;
    say(`Hinweis: ${first} und ${second} bilden das gold markierte Paar.`);
    hintTimer = setTimeout(() => { hintIds = []; hintTimer = 0; render(); }, 4200);
  }

  function shuffleRemaining() {
    if (state.status === 'won') return;
    const undoEntry = shuffleUndoEntry();
    const result = E.shuffleRemaining(state);
    if (!result.ok) { say('Die Steine konnten gerade nicht neu gemischt werden.'); return; }
    remember(undoEntry);
    sfx('shuffle');
    selected = null;
    clearHint();
    focusId = E.freeIds(state)[0] ?? null;
    resumeClock();
    pendingFocus = true;
    render();
    say('Steine neu gemischt – es geht weiter.');
    saveGame();
  }

  function undo() {
    const previous = history.pop();
    if (!previous) { say('Noch kein Zug zum Rückgängigmachen.'); return; }
    pauseClock();
    sfx('undo');
    if (previous.kind === 'pair') {
      state.cards[previous.firstId].removed = false;
      state.cards[previous.secondId].removed = false;
    } else if (previous.kind === 'shuffle') {
      const faces = new Map(state.cards.map(card => [card.face.uid, card.face]));
      previous.faceUids.forEach((uid, index) => { state.cards[index].face = faces.get(uid); });
      const flatPlan = previous.solutionPlan;
      state.solutionPlan = [];
      for (let i = 0; i < flatPlan.length; i += 2) state.solutionPlan.push([flatPlan[i], flatPlan[i + 1]]);
    }
    state.moves = previous.moves;
    state.shuffles = previous.shuffles;
    state.status = previous.status;
    selected = null;
    clearHint();
    ui.result.hidden = true;
    focusId = E.freeIds(state)[0] ?? null;
    resumeClock();
    pendingFocus = true;
    render();
    say('Letzte Aktion rückgängig gemacht.');
    saveGame();
  }

  function setZoom(index, persist = true) {
    zoomIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index));
    const zoom = ZOOM_LEVELS[zoomIndex];
    ui.board.style.width = `${Math.round(zoom * 100)}%`;
    ui.zoomValue.value = `${Math.round(zoom * 100)} %`;
    ui.zoomValue.textContent = ui.zoomValue.value;
    ui.zoomOut.disabled = zoomIndex === 0;
    ui.zoomIn.disabled = zoomIndex === ZOOM_LEVELS.length - 1;
    if (persist) saveGame();
  }

  function tileLabel(card, free) {
    return `${card.face.name}, Ebene ${card.z + 1}, ${free ? 'frei und wählbar' : 'noch blockiert'}`;
  }

  function ensureTiles() {
    if (ui.board.children.length === 144) return;
    ui.board.replaceChildren();
    for (let id = 0; id < 144; id += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tile';
      button.dataset.id = String(id);
      button.setAttribute('role', 'gridcell');
      const corner = document.createElement('span'); corner.className = 'tile-corner';
      const symbol = document.createElement('span'); symbol.className = 'tile-symbol';
      const name = document.createElement('span'); name.className = 'tile-name';
      button.append(corner, symbol, name);
      button.addEventListener('click', () => choose(id));
      button.addEventListener('keydown', event => navigateBoard(event, id));
      ui.board.appendChild(button);
    }
  }

  function render() {
    if (!state) return;
    ensureTiles();
    const free = new Set(E.freeIds(state));
    if (focusId == null || !free.has(focusId)) focusId = free.values().next().value ?? null;
    const selectedFace = selected == null ? null : state.cards[selected].face;
    const zoom = ZOOM_LEVELS[zoomIndex];

    state.cards.forEach(card => {
      const button = ui.board.children[card.id];
      const isFree = free.has(card.id);
      const isSelected = selected === card.id;
      const isHinted = hintIds.includes(card.id);
      const matchable = selectedFace && card.id !== selected && isFree && E.isMatch(state.cards[selected], card);
      const nonmatch = selectedFace && card.id !== selected && isFree && !matchable;
      button.style.left = `${(card.x - 1) / E.BOARD_WIDTH_UNITS * 100}%`;
      button.style.top = `${(card.y / E.BOARD_HEIGHT_UNITS) * 100 - card.z * 0.8}%`;
      button.style.zIndex = String(20 + card.z * 200 + card.y * 3 + card.x);
      button.style.setProperty('--depth-x', `${((2 + card.z * 0.7) * Math.sqrt(zoom)).toFixed(2)}px`);
      button.style.setProperty('--depth-y', `${((3 + card.z * 1.0) * Math.sqrt(zoom)).toFixed(2)}px`);
      button.className = `tile${isFree ? ' free' : ''}${card.removed ? ' removed' : ''}${isSelected ? ' selected' : ''}${isHinted ? ' hinted' : ''}${matchable ? ' matchable' : ''}${nonmatch ? ' nonmatch' : ''}`;
      button.dataset.suit = card.face.suit;
      button.disabled = card.removed || !isFree || state.status !== 'playing';
      button.tabIndex = !button.disabled && card.id === focusId ? 0 : -1;
      button.setAttribute('aria-label', card.removed ? 'Entfernter Stein' : tileLabel(card, isFree));
      button.title = card.removed ? '' : tileLabel(card, isFree);
      const corner = button.children[0], symbol = button.children[1], name = button.children[2];
      corner.textContent = card.face.rank > 0 && ['dot', 'bamboo', 'character'].includes(card.face.suit) ? String(card.face.rank) : '';
      symbol.textContent = card.face.symbol;
      name.textContent = card.face.name;
    });

    const remaining = state.cards.filter(card => !card.removed).length;
    const pairCount = E.matchingPairs(state).length;
    ui.remaining.textContent = String(remaining);
    ui.pairs.textContent = String(pairCount);
    ui.moves.textContent = String(state.moves);
    ui.shuffles.textContent = String(state.shuffles);
    ui.time.textContent = formatTime(currentElapsedMs());
    ui.bestTime.textContent = stats.bestTimeSec != null ? formatTime(stats.bestTimeSec * 1000) : '–';
    ui.wins.textContent = String(stats.wins);
    ui.dealCode.textContent = E.dealCode(state);
    ui.undo.disabled = history.length === 0;
    ui.hint.disabled = state.status === 'won';
    ui.shuffle.disabled = state.status === 'won' || remaining === 0;
    ui.resultUndo.disabled = history.length === 0;
    setZoom(zoomIndex, false);

    if (pendingFocus && focusId != null) {
      pendingFocus = false;
      const button = ui.board.children[focusId];
      button?.focus({ preventScroll: true });
      button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function projected(card) { return { x: card.x + card.z * 0.35, y: card.y - card.z * 0.5 }; }
  function navigateBoard(event, id) {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const ids = E.freeIds(state).sort((a, b) => (state.cards[a].y - state.cards[b].y) || (state.cards[a].x - state.cards[b].x));
      focusTile(event.key === 'Home' ? ids[0] : ids.at(-1));
      return;
    }
    const vector = directions[event.key];
    if (!vector) return;
    event.preventDefault();
    const origin = projected(state.cards[id]);
    let best = null, bestScore = Infinity;
    for (const candidateId of E.freeIds(state)) {
      if (candidateId === id) continue;
      const point = projected(state.cards[candidateId]);
      const dx = point.x - origin.x, dy = point.y - origin.y;
      if ((vector[0] < 0 && dx >= 0) || (vector[0] > 0 && dx <= 0) || (vector[1] < 0 && dy >= 0) || (vector[1] > 0 && dy <= 0)) continue;
      const primary = vector[0] ? Math.abs(dx) : Math.abs(dy);
      const secondary = vector[0] ? Math.abs(dy) : Math.abs(dx);
      const score = primary + secondary * 2.4 + Math.abs(state.cards[candidateId].z - state.cards[id].z) * 0.4;
      if (score < bestScore) { bestScore = score; best = candidateId; }
    }
    if (best != null) focusTile(best);
  }

  function focusTile(id) {
    if (id == null) return;
    const previous = focusId == null ? null : ui.board.children[focusId];
    if (previous) previous.tabIndex = -1;
    focusId = id;
    const next = ui.board.children[id];
    if (next && !next.disabled) { next.tabIndex = 0; next.focus(); next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }

  function showResult(winInfo) {
    const shuffleLabel = state.shuffles === 1 ? '1 Mischung' : `${state.shuffles} Mischungen`;
    const bestText = stats.bestTimeSec != null
      ? (winInfo && winInfo.isNewBestTime ? ' (Neue Bestzeit!)' : ` · Bestzeit: ${formatTime(stats.bestTimeSec * 1000)}`)
      : '';
    ui.resultText.textContent =
      `Alle Steine entfernt · ${state.moves} Züge · ${shuffleLabel} · Zeit: ${formatTime(currentElapsedMs())}${bestText} · ${stats.wins} ${stats.wins === 1 ? 'Sieg' : 'Siege'}.`;
    ui.resultUndo.disabled = history.length === 0;
    ui.result.hidden = false;
  }

  ui.hint.addEventListener('click', showHint);
  ui.shuffle.addEventListener('click', shuffleRemaining);
  ui.undo.addEventListener('click', undo);
  ui.newGame.addEventListener('click', () => newGame());
  ui.resultButton.addEventListener('click', () => newGame());
  ui.resultUndo.addEventListener('click', undo);
  ui.zoomOut.addEventListener('click', () => setZoom(zoomIndex - 1));
  ui.zoomIn.addEventListener('click', () => setZoom(zoomIndex + 1));
  ui.zoomFit.addEventListener('click', () => setZoom(0));

  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element && (event.target.matches('input, select, textarea, a') || (event.target.matches('button') && !event.target.matches('#board .tile')))) return;
    const key = event.key.toLowerCase();
    if (!ui.result.hidden) return;
    if (key === 'escape') { if (selected != null) { selected = null; clearHint(); render(); say('Auswahl aufgehoben.'); } return; }
    if (key === 'h') { event.preventDefault(); showHint(); }
    else if (key === 'm') { event.preventDefault(); shuffleRemaining(); }
    else if (key === 'u') { event.preventDefault(); undo(); }
    else if (key === 'n') { event.preventDefault(); newGame(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pauseClock(); saveGame(); }
    else resumeClock();
  });
  window.addEventListener('pagehide', () => { pauseClock(); saveGame(); });
  window.addEventListener('pageshow', resumeClock);
  setInterval(() => { if (state && state.status === 'playing') ui.time.textContent = formatTime(currentElapsedMs()); }, 250);

  window.Pahjong = {
    isFree: cardOrId => E.isFree(state, typeof cardOrId === 'number' ? cardOrId : cardOrId && cardOrId.id),
    isMatch: (a, b) => E.isMatch(a, b),
    findHint: () => E.findHint(state),
    getCards: () => E.clone(state.cards),
    getState: () => ({
      count: state.cards.length,
      remaining: state.cards.filter(card => !card.removed).length,
      moves: state.moves,
      shuffles: state.shuffles,
      pairs: E.matchingPairs(state).length,
      status: state.status,
      seed: state.seed,
      zoom: ZOOM_LEVELS[zoomIndex],
      undoDepth: history.length,
      undoBytes: JSON.stringify(history).length
    }),
    newGame: seed => newGame(seed),
    shuffleRemaining,
    getSolutionPlan: () => state.solutionPlan.filter(pair => !state.cards[pair[0]].removed && !state.cards[pair[1]].removed).map(pair => pair.slice()),
    buildPairPlan: (ids = state.cards.filter(card => !card.removed).map(card => card.id)) => E.buildRemovalPlan(state.cards, new Set(ids), `${state.seed}|api`, 800),
    verifyPairPlan: (plan, ids = state.cards.filter(card => !card.removed).map(card => card.id)) => E.verifyRemovalPlan(state.cards, plan, new Set(ids)),
    testPlan: rounds => E.testPlans(rounds),
    engine: E
  };

  syncSharedScores();
  if (!loadGame()) newGame();
})();
