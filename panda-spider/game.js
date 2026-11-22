(() => {
  'use strict';

  const SUITS = Object.freeze({
    spade: { symbol: '♠', color: 'black', name: 'Pik' },
    heart: { symbol: '♥', color: 'red', name: 'Herz' },
    diamond: { symbol: '♦', color: 'red', name: 'Karo' },
    club: { symbol: '♣', color: 'black', name: 'Kreuz' }
  });
  const MODE_SUITS = Object.freeze({ 1: ['spade'], 2: ['spade', 'heart'], 4: ['spade', 'heart', 'diamond', 'club'] });
  const RANK_LABELS = Object.freeze({ 1: 'A', 11: 'B', 12: 'D', 13: 'K' });
  const columnSizes = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5];

  const SUITS_KEY = 'panda-spider-suits';
  const SAVE_KEY = 'panda-spider-save-v1';
  const STATS_KEY = 'panda-spider-stats-v1';

  const els = {
    tableau: document.querySelector('#tableau'),
    mode: document.querySelector('#suit-mode'),
    newGame: document.querySelector('#new-game'),
    undo: document.querySelector('#undo'),
    deal: document.querySelector('#deal-stock'),
    score: document.querySelector('#score'),
    bestScore: document.querySelector('#best-score'),
    moves: document.querySelector('#moves'),
    time: document.querySelector('#time'),
    completed: document.querySelector('#completed'),
    stock: document.querySelector('#stock-count'),
    message: document.querySelector('#message'),
    result: document.querySelector('#result'),
    resultTitle: document.querySelector('#result-title'),
    resultText: document.querySelector('#result-text'),
    resultNew: document.querySelector('#result-new'),
    resultUndo: document.querySelector('#result-undo')
  };

  const state = {
    columns: [],
    stock: [],
    completed: 0,
    moves: 0,
    score: 500,
    history: [],
    selected: null,
    mode: 1,
    elapsedMs: 0,
    runningSince: 0,
    status: 'playing',
    resultRecorded: false
  };

  let stats = loadStats();
  let timerId = 0;

  function defaultModeStats() {
    return { wins: 0, bestScore: 0, bestTimeSec: null };
  }

  function loadStats() {
    const base = { 1: defaultModeStats(), 2: defaultModeStats(), 4: defaultModeStats() };
    try {
      const raw = window.localStorage.getItem(STATS_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      [1, 2, 4].forEach(m => {
        const entry = parsed[m] || parsed[String(m)];
        if (!entry || typeof entry !== 'object') return;
        base[m] = {
          wins: Math.max(0, Number(entry.wins) || 0),
          bestScore: Math.max(0, Number(entry.bestScore) || 0),
          bestTimeSec: Number.isFinite(Number(entry.bestTimeSec)) && Number(entry.bestTimeSec) >= 0 ? Math.round(Number(entry.bestTimeSec)) : null
        };
      });
    } catch (_error) { /* Speicher optional */ }
    return base;
  }

  function saveStats() {
    try { window.localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (_error) { /* Speicher optional */ }
  }

  function readSavedMode() {
    try {
      const v = Number(window.localStorage.getItem(SUITS_KEY));
      if (v === 1 || v === 2 || v === 4) return v;
    } catch (_error) { /* optional */ }
    return 1;
  }

  function persistMode(mode) {
    try { window.localStorage.setItem(SUITS_KEY, String(mode)); } catch (_error) { /* optional */ }
  }

  function totalWins() {
    return [1, 2, 4].reduce((sum, m) => sum + (stats[m].wins || 0), 0);
  }

  function overallBestScore() {
    return [1, 2, 4].reduce((best, m) => Math.max(best, stats[m].bestScore || 0), 0);
  }

  function overallBestTime() {
    const times = [1, 2, 4].map(m => stats[m].bestTimeSec).filter(v => v != null);
    return times.length ? Math.min(...times) : null;
  }

  function buildScoreLabel(best, wins) {
    const parts = [];
    if (best > 0) parts.push(`Bestwert ${best.toLocaleString('de-DE')}`);
    if (wins > 0) parts.push(`${wins} ${wins === 1 ? 'Sieg' : 'Siege'}`);
    return parts.join(' · ');
  }

  function syncSharedScores() {
    if (!window.GameScores) return;
    const best = overallBestScore();
    const wins = totalWins();
    if (!best && !wins) return;
    const bestTime = overallBestTime();
    window.GameScores.sync('panda-spider', {
      score: best || undefined,
      timeSec: bestTime != null ? bestTime : undefined,
      label: buildScoreLabel(best, wins)
    });
  }

  function currentElapsedMs() {
    return state.runningSince ? state.elapsedMs + (Date.now() - state.runningSince) : state.elapsedMs;
  }
  function currentElapsedSec() {
    return Math.max(0, Math.floor(currentElapsedMs() / 1000));
  }
  function pauseClock() {
    if (state.runningSince) {
      state.elapsedMs += Date.now() - state.runningSince;
      state.runningSince = 0;
    }
  }
  function resumeClock() {
    if (state.status === 'playing' && !state.runningSince && !document.hidden) {
      state.runningSince = Date.now();
    }
  }

  function rankName(rank) { return RANK_LABELS[rank] || String(rank); }
  function cloneCard(card) { return card ? { ...card } : card; }
  function cloneColumns(columns) { return columns.map(column => column.map(cloneCard)); }

  function snapshot() {
    return {
      columns: cloneColumns(state.columns),
      stock: state.stock.map(cloneCard),
      completed: state.completed,
      moves: state.moves,
      score: state.score,
      status: state.status
    };
  }
  function saveHistory() {
    state.history.push(snapshot());
    if (state.history.length > 120) state.history.shift();
  }
  function restore(item) {
    pauseClock();
    state.columns = cloneColumns(item.columns);
    state.stock = item.stock.map(cloneCard);
    state.completed = item.completed;
    state.moves = item.moves;
    state.score = item.score;
    state.status = item.status;
    state.selected = null;
    hideResult();
    resumeClock();
    render();
    saveGame();
  }

  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: 1,
        mode: state.mode,
        columns: state.columns,
        stock: state.stock,
        completed: state.completed,
        moves: state.moves,
        score: state.score,
        elapsedMs: currentElapsedMs(),
        status: state.status,
        resultRecorded: state.resultRecorded
      }));
    } catch (_error) { /* Speicher optional */ }
  }

  function isValidSavedCard(card) {
    return card && typeof card === 'object' && Number.isInteger(card.id) &&
      Number.isInteger(card.rank) && card.rank >= 1 && card.rank <= 13 &&
      Boolean(SUITS[card.suit]) && typeof card.faceUp === 'boolean';
  }

  function loadGame() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || !MODE_SUITS[data.mode]) return false;
      if (!Array.isArray(data.columns) || data.columns.length !== 10 || !Array.isArray(data.stock)) return false;
      const allCards = [...data.columns.flat(), ...data.stock];
      if (!allCards.every(isValidSavedCard)) return false;
      if (!Number.isInteger(data.completed) || data.completed < 0 || data.completed > 8) return false;
      if (allCards.length + data.completed * 13 !== 104) return false;
      if (!['playing', 'won', 'lost'].includes(data.status)) return false;

      state.mode = data.mode;
      els.mode.value = String(state.mode);
      state.columns = cloneColumns(data.columns);
      state.stock = data.stock.map(cloneCard);
      state.completed = data.completed;
      state.moves = Math.max(0, Number(data.moves) || 0);
      state.score = Math.max(0, Number(data.score) || 0);
      state.elapsedMs = Number.isFinite(Number(data.elapsedMs)) && Number(data.elapsedMs) >= 0 ? Number(data.elapsedMs) : 0;
      state.runningSince = 0;
      state.status = data.status;
      state.resultRecorded = Boolean(data.resultRecorded);
      state.history = [];
      state.selected = null;
      hideResult();
      if (state.status === 'playing') resumeClock();
      skipFlip = true;
      render();
      skipFlip = false;
      announce('Gespeichertes Spiel fortgesetzt.');
      if (state.status !== 'playing') showResult();
      return true;
    } catch (_error) {
      try { window.localStorage.removeItem(SAVE_KEY); } catch (_ignored) { /* optional */ }
      return false;
    }
  }

  function buildDeck(mode) {
    const suits = MODE_SUITS[mode];
    const cards = [];
    const copies = 8 / suits.length;
    let id = 0;
    suits.forEach(suit => {
      for (let copy = 0; copy < copies; copy += 1) {
        for (let rank = 13; rank >= 1; rank -= 1) cards.push({ id: id++, rank, suit, faceUp: false });
      }
    });
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  function newGame() {
    pauseClock();
    state.mode = Number(els.mode.value);
    persistMode(state.mode);
    const deck = buildDeck(state.mode);
    state.columns = Array.from({ length: 10 }, () => []);
    columnSizes.forEach((size, columnIndex) => {
      for (let i = 0; i < size; i += 1) {
        const card = deck.pop();
        card.faceUp = i === size - 1;
        state.columns[columnIndex].push(card);
      }
    });
    state.stock = deck;
    state.completed = 0;
    state.moves = 0;
    state.score = 500;
    state.history = [];
    state.selected = null;
    state.elapsedMs = 0;
    state.runningSince = 0;
    state.status = 'playing';
    state.resultRecorded = false;
    hideResult();
    resumeClock();
    announce('Neues Spiel gestartet. Wähle eine offene Karte.');
    skipFlip = true;
    render();
    skipFlip = false;
    if (window.GameCards) GameCards.deal(els.tableau);
    saveGame();
  }

  function isMovableSequence(column, index) {
    if (index < 0 || index >= column.length || !column[index].faceUp) return false;
    for (let i = index; i < column.length - 1; i += 1) {
      const current = column[i];
      const next = column[i + 1];
      if (!next.faceUp || current.suit !== next.suit || current.rank !== next.rank + 1) return false;
    }
    return true;
  }

  function canPlace(moving, target) {
    return !target || (target.faceUp && target.rank === moving.rank + 1);
  }

  function totalTableauCards() {
    return state.columns.reduce((sum, col) => sum + col.length, 0);
  }

  function canDealStock() {
    if (state.status !== 'playing' || !state.stock.length) return false;
    if (state.columns.every(column => column.length > 0)) return true;
    return totalTableauCards() < 10;
  }

  function completeRuns() {
    let removed = 0;
    state.columns.forEach(column => {
      // Nach jedem Abräumen erneut prüfen: zwei direkt gestapelte K–A-Folgen
      // müssen in derselben Aktion beide entfernt werden.
      while (column.length >= 13) {
        const run = column.slice(-13);
        const complete = run.every((card, i) => card.faceUp && card.rank === 13 - i && card.suit === run[0].suit);
        if (!complete) break;
        column.splice(-13, 13);
        removed += 1;
      }
    });
    state.completed += removed;
    state.score += removed * 100;
    return removed;
  }

  function revealTops() {
    state.columns.forEach(column => { if (column.length) column[column.length - 1].faceUp = true; });
  }

  function moveTo(columnIndex) {
    if (!state.selected || state.status !== 'playing') return false;
    const from = state.selected.column;
    const start = state.selected.index;
    const source = state.columns[from];
    const moving = source.slice(start);
    const targetColumn = state.columns[columnIndex];
    const target = targetColumn[targetColumn.length - 1];
    if (from === columnIndex || !canPlace(moving[0], target)) return false;
    saveHistory();
    source.splice(start);
    targetColumn.push(...moving);
    revealTops();
    state.moves += 1;
    state.score = Math.max(0, state.score - 1);
    state.selected = null;
    const removed = completeRuns();
    revealTops();
    if (removed) {
      sfx('success');
      announce(`${removed} vollständige Reihe${removed > 1 ? 'n' : ''} entfernt (+${removed * 100} Punkte).`);
    } else {
      sfx('place');
      announce('Guter Zug.');
    }
    checkEnd();
    render();
    saveGame();
    return true;
  }

  function selectCard(columnIndex, cardIndex) {
    if (state.status !== 'playing') return;
    const column = state.columns[columnIndex];
    const card = column[cardIndex];
    if (!card || !card.faceUp) return;
    if (!state.selected) {
      if (isMovableSequence(column, cardIndex)) {
        state.selected = { column: columnIndex, index: cardIndex };
        sfx('select');
        announce('Karte ausgewählt. Wähle eine passende Zielspalte.');
        render();
      } else {
        sfx('error');
        announce('Diese Karte kann nicht als Folge bewegt werden.');
      }
      return;
    }
    if (state.selected.column === columnIndex && state.selected.index === cardIndex) {
      state.selected = null;
      announce('Auswahl aufgehoben.');
      render();
      return;
    }
    if (state.selected.column === columnIndex) {
      if (isMovableSequence(column, cardIndex)) {
        state.selected = { column: columnIndex, index: cardIndex };
        sfx('select');
        announce('Auswahl in der Spalte angepasst.');
        render();
      } else {
        sfx('error');
        announce('Diese Karte bildet keine durchgehende gleichfarbige Folge.');
      }
      return;
    }
    if (moveTo(columnIndex)) return;
    // Ungültiges Ziel in anderer Spalte -> wenn dort beweglich, sanft Auswahl wechseln.
    if (isMovableSequence(column, cardIndex)) {
      state.selected = { column: columnIndex, index: cardIndex };
      sfx('select');
      announce('Auswahl auf die neue Spalte gewechselt.');
      render();
      return;
    }
    state.selected = null;
    sfx('error');
    announce('Dort darf die ausgewählte Karte nicht liegen.');
    render();
  }

  function dealStock() {
    if (state.status !== 'playing' || !state.stock.length) return;
    if (!canDealStock()) {
      sfx('error');
      announce('Fülle zuerst alle leeren Spalten, bevor du austeilst.');
      return;
    }
    saveHistory();
    for (let i = 0; i < 10; i += 1) {
      const card = state.stock.pop();
      if (!card) break;
      card.faceUp = true;
      state.columns[i].push(card);
    }
    state.moves += 1;
    state.score = Math.max(0, state.score - 1);
    state.selected = null;
    const removed = completeRuns();
    revealTops();
    sfx(removed ? 'success' : 'deal');
    announce(removed ? `${removed} vollständige Reihe${removed > 1 ? 'n' : ''} entfernt.` : 'Je eine offene Karte wurde auf jede Spalte gelegt.');
    checkEnd();
    render();
    saveGame();
  }

  function hasAnyMove() {
    for (let from = 0; from < 10; from += 1) {
      const column = state.columns[from];
      for (let index = 0; index < column.length; index += 1) {
        if (!isMovableSequence(column, index)) continue;
        const moving = column[index];
        for (let to = 0; to < 10; to += 1) {
          if (to !== from && canPlace(moving, state.columns[to].at(-1))) return true;
        }
      }
    }
    return false;
  }

  function recordResult(won) {
    if (state.resultRecorded) return;
    state.resultRecorded = true;
    const elapsedSec = currentElapsedSec();
    const mStats = stats[state.mode];
    if (state.score > mStats.bestScore) mStats.bestScore = state.score;
    if (won) {
      mStats.wins += 1;
      if (mStats.bestTimeSec == null || elapsedSec < mStats.bestTimeSec) mStats.bestTimeSec = elapsedSec;
    }
    saveStats();
    if (window.GameScores) {
      window.GameScores.record('panda-spider', {
        score: state.score,
        timeSec: won ? elapsedSec : undefined,
        won,
        label: buildScoreLabel(overallBestScore(), totalWins())
      });
    }
  }

  function showResult() {
    const won = state.status === 'won';
    const elapsedSec = currentElapsedSec();
    const mStats = stats[state.mode];
    els.resultTitle.textContent = won ? 'Panda Spider gewonnen!' : 'Keine Züge mehr';
    els.resultText.textContent =
      (won ? 'Alle acht Reihen sind komplett abgeräumt.' : 'Es ist kein weiterer Zug möglich.') +
      ` Punkte: ${state.score.toLocaleString('de-DE')} · Bestwert: ${mStats.bestScore.toLocaleString('de-DE')} · Züge: ${state.moves} · Zeit: ${formatTime(elapsedSec)}.`;
    els.resultUndo.disabled = state.history.length === 0;
    els.result.hidden = false;
    window.setTimeout(() => els.resultNew.focus({ preventScroll: true }), 0);
  }

  function hideResult() {
    els.result.hidden = true;
  }

  function checkEnd() {
    if (state.completed === 8) {
      pauseClock();
      state.status = 'won';
      sfx('win');
      if (window.GameFX) window.GameFX.celebrate();
      recordResult(true);
      announce('Gewonnen! Alle acht Reihen sind entfernt.');
      showResult();
      return;
    }
    if (!canDealStock() && !hasAnyMove()) {
      pauseClock();
      state.status = 'lost';
      sfx('lose');
      recordResult(false);
      announce('Keine Züge mehr. Starte ein neues Spiel oder gehe einen Zug zurück.');
      showResult();
    }
  }

  function announce(text) { els.message.textContent = text; }
  function sfx(name) { if (window.GameAudio) window.GameAudio.play(name); }
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function updateStats() {
    const mBest = Math.max(stats[state.mode].bestScore, state.status === 'won' ? state.score : 0);
    els.score.textContent = state.score.toLocaleString('de-DE');
    els.bestScore.textContent = mBest.toLocaleString('de-DE');
    els.moves.textContent = String(state.moves);
    els.time.textContent = formatTime(currentElapsedSec());
    els.completed.textContent = `${state.completed} / 8`;
    els.stock.textContent = String(state.stock.length);
    els.undo.disabled = state.history.length === 0;
    els.deal.disabled = !canDealStock();
  }

  function cardData(card) {
    return { id: card.id, rank: card.rank, suit: SUITS[card.suit].symbol, label: rankName(card.rank), faceDown: !card.faceUp };
  }

  function makeCardButton(card, columnIndex, index, top, height) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card';
    button.style.top = `${top}px`;
    button.style.height = `${height}px`;
    button.style.zIndex = String(index + 1);
    button.dataset.column = String(columnIndex);
    button.dataset.index = String(index);
    button.dataset.focusKey = `card-${card.id}`;
    button.setAttribute('aria-label', card.faceUp ? `${rankName(card.rank)} ${SUITS[card.suit].name}, Spalte ${columnIndex + 1}` : 'Verdeckte Karte');
    GameCards.face(button, cardData(card));
    if (!card.faceUp) {
      button.classList.add('face-down');
      button.disabled = true;
      return button;
    }
    button.classList.toggle('is-red', SUITS[card.suit].color === 'red');
    if (state.selected && state.selected.column === columnIndex && index >= state.selected.index) {
      button.classList.add('is-selected');
    }
    button.addEventListener('click', () => selectCard(columnIndex, index));
    return button;
  }

  // Kartengeometrie aus der realen Spaltenbreite: echtes Verhältnis 0,72 auf allen Bildschirmen.
  function geometry() {
    const style = getComputedStyle(els.tableau);
    const gap = Number.parseFloat(style.columnGap) || 2;
    const width = Math.max(260, els.tableau.clientWidth || 700);
    const columnWidth = (width - gap * 9) / 10;
    const maxCardW = window.innerWidth >= 1920 ? 116 : 96;
    const cardWidth = Math.min(maxCardW, Math.max(24, columnWidth - 2));
    const cardHeight = cardWidth / 0.72;
    return {
      cardHeight,
      labelHeight: 20,
      upStep: Math.max(14, Math.min(36, cardHeight * 0.32)),
      downStep: Math.max(6, Math.min(16, cardHeight * 0.14))
    };
  }

  // Jedes Rendering läuft als FLIP-Animation: Karten fliegen sichtbar an ihren neuen Platz.
  let flipOverrides = null;
  let skipFlip = false;
  function render() {
    if (skipFlip || !window.GameCards) { renderNow(); return; }
    const overrides = flipOverrides;
    flipOverrides = null;
    GameCards.flip(els.tableau, renderNow, { overrides, appearNew: true });
  }

  function renderNow() {
    const active = document.activeElement;
    const focusKey = active && els.tableau.contains(active) ? active.dataset.focusKey : '';
    els.tableau.replaceChildren();
    const wrappers = [];
    const g = geometry();
    const selectedMoving = state.selected ? state.columns[state.selected.column][state.selected.index] : null;
    let maximumHeight = 280;

    state.columns.forEach((column, columnIndex) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'column';
      wrapper.dataset.column = String(columnIndex);
      wrapper.dataset.dropColumn = String(columnIndex);
      wrapper.dataset.focusKey = `column-${columnIndex}`;
      wrapper.setAttribute('role', 'group');
      wrapper.setAttribute('aria-label', `Spalte ${columnIndex + 1}, ${column.length} Karten`);
      const label = document.createElement('span');
      label.className = 'column-label';
      label.textContent = String(columnIndex + 1);
      wrapper.append(label);
      wrapper.tabIndex = 0;

      if (selectedMoving && state.selected.column !== columnIndex && canPlace(selectedMoving, column.at(-1))) {
        wrapper.classList.add('selected-target');
      }

      let top = g.labelHeight;
      column.forEach((card, index) => {
        wrapper.append(makeCardButton(card, columnIndex, index, top, g.cardHeight));
        top += card.faceUp ? g.upStep : g.downStep;
      });
      const colBottom = column.length ? top - (column.at(-1).faceUp ? g.upStep : g.downStep) + g.cardHeight + 12 : g.labelHeight + g.cardHeight + 12;
      maximumHeight = Math.max(maximumHeight, colBottom);
      wrappers.push(wrapper);
      wrapper.addEventListener('click', event => {
        if (state.selected && !event.target.closest('.card')) moveTo(columnIndex);
      });
      wrapper.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && state.selected) {
          event.preventDefault();
          moveTo(columnIndex);
        }
      });
      els.tableau.append(wrapper);
    });

    els.tableau.style.minHeight = `${Math.ceil(maximumHeight)}px`;
    wrappers.forEach(wrapper => { wrapper.style.minHeight = `${Math.ceil(maximumHeight - 6)}px`; });
    updateStats();
    if (focusKey) els.tableau.querySelector(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  function tick() {
    if (state.status === 'playing') {
      els.time.textContent = formatTime(currentElapsedSec());
    }
  }

  function clearSelectionVisuals() {
    state.selected = null;
    els.tableau.querySelectorAll('.card.is-selected').forEach(el => el.classList.remove('is-selected'));
    els.tableau.querySelectorAll('.column.selected-target').forEach(el => el.classList.remove('selected-target'));
  }

  function undoMove() {
    const previous = state.history.pop();
    if (!previous) return;
    restore(previous);
    sfx('undo');
    announce('Letzten Zug rückgängig gemacht.');
  }

  els.newGame.addEventListener('click', newGame);
  els.resultNew.addEventListener('click', newGame);
  els.mode.addEventListener('change', newGame);
  els.deal.addEventListener('click', dealStock);
  els.undo.addEventListener('click', undoMove);
  els.resultUndo.addEventListener('click', undoMove);

  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!els.result.hidden) return;
    if (event.target instanceof Element && event.target.matches('input, select, textarea')) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      if (state.selected) {
        clearSelectionVisuals();
        announce('Auswahl aufgehoben.');
      }
      return;
    }
    if (key === 'n') { event.preventDefault(); newGame(); }
    else if (key === 'u') { event.preventDefault(); undoMove(); }
    else if (key === 'd') { event.preventDefault(); dealStock(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pauseClock(); saveGame(); }
    else resumeClock();
  });
  window.addEventListener('pagehide', () => { pauseClock(); saveGame(); });
  window.addEventListener('pageshow', resumeClock);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderNow, 120);
  });

  // Drag & Drop mit Kartenvorschau (Maus, Stift, Touch) – ergänzt das Antippen.
  if (window.GameCards) {
    GameCards.makeDraggable({
      root: els.tableau,
      cardSelector: '.card',
      targetSelector: '[data-drop-column]',
      start(element) {
        if (state.status !== 'playing') return null;
        const column = Number(element.dataset.column);
        const index = Number(element.dataset.index);
        return isMovableSequence(state.columns[column], index) ? { column, index } : null;
      },
      cards(payload) { return state.columns[payload.column].slice(payload.index).map(cardData); },
      sourceElements(payload) {
        return state.columns[payload.column].slice(payload.index)
          .map(card => els.tableau.querySelector(`[data-focus-key="card-${card.id}"]`))
          .filter(Boolean);
      },
      canDrop(payload, target) {
        const column = Number(target.dataset.dropColumn);
        if (column === payload.column) return false;
        return canPlace(state.columns[payload.column][payload.index], state.columns[column].at(-1));
      },
      drop(payload, target, ghostRects) {
        state.selected = payload;
        flipOverrides = ghostRects;
        const moved = moveTo(Number(target.dataset.dropColumn));
        flipOverrides = null;
        if (!moved) { clearSelectionVisuals(); }
        return moved;
      },
      cancel(_payload, hadTarget) {
        // Kein render() während der Rückflug-Animation!
        clearSelectionVisuals();
        if (!hadTarget) announce('Karte zurückgelegt.');
      }
    });
  }

  els.mode.value = String(readSavedMode());
  syncSharedScores();
  timerId = window.setInterval(tick, 500);
  void timerId;
  if (!loadGame()) newGame();
})();
