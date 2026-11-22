(() => {
  'use strict';
  const SUITS = ['♣', '♦', '♥', '♠'];
  const NAMES = ['—', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];
  const RED = new Set([1, 2]);
  const STATS_KEY = 'pandacell-stats-v1';
  const MAX_HISTORY = 200;
  const DOUBLE_TAP_MS = 380;

  const $ = id => document.getElementById(id);
  const state = {
    deal: 1,
    tableau: Array.from({ length: 8 }, () => []),
    free: [null, null, null, null],
    foundations: [0, 0, 0, 0],
    cards: new Map(),
    history: [],
    moves: 0,
    elapsedMs: 0,
    runningSince: 0,
    status: 'playing',
    selected: null,
    winRecorded: false
  };

  let lastTap = { id: null, time: 0 };
  let stats = loadStats();

  function loadStats() {
    const base = { wins: 0, bestScore: 0, bestTimeSec: null, bestMoves: null, lastDeal: 1, streak: 0 };
    try {
      const raw = window.localStorage.getItem(STATS_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      return {
        wins: Math.max(0, Number(parsed.wins) || 0),
        bestScore: Math.max(0, Number(parsed.bestScore) || 0),
        bestTimeSec: Number.isFinite(Number(parsed.bestTimeSec)) && Number(parsed.bestTimeSec) >= 0 ? Math.round(Number(parsed.bestTimeSec)) : null,
        bestMoves: Number.isFinite(Number(parsed.bestMoves)) && Number(parsed.bestMoves) > 0 ? Math.round(Number(parsed.bestMoves)) : null,
        lastDeal: normalizeDeal(parsed.lastDeal),
        streak: Math.max(0, Number(parsed.streak) || 0)
      };
    } catch (_error) {
      return base;
    }
  }

  function saveStats() {
    try { window.localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (_error) { /* optional */ }
  }

  function buildScoreLabel() {
    const parts = [];
    if (stats.bestScore > 0) parts.push(`Bestwert ${stats.bestScore.toLocaleString('de-DE')}`);
    if (stats.wins > 0) parts.push(`${stats.wins} ${stats.wins === 1 ? 'Sieg' : 'Siege'}`);
    return parts.join(' · ');
  }

  function syncSharedScores() {
    if (!window.GameScores || (!stats.wins && !stats.bestScore)) return;
    window.GameScores.sync('pandacell', {
      score: stats.bestScore || undefined,
      timeSec: stats.bestTimeSec != null ? stats.bestTimeSec : undefined,
      label: buildScoreLabel()
    });
  }

  function normalizeDeal(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(32000, Math.max(1, Math.floor(n))) : 1;
  }

  function rng(seed) {
    let value = (seed >>> 0) || 1;
    return () => {
      value = (Math.imul(1664525, value) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function makeDeck() {
    const deck = [];
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = 1; rank <= 13; rank++) deck.push({ id: suit * 13 + rank - 1, suit, rank });
    }
    return deck;
  }

  function deal(number) {
    const random = rng(number);
    const deck = makeDeck();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    state.cards = new Map(deck.map(card => [card.id, card]));
    state.tableau = Array.from({ length: 8 }, () => []);
    deck.forEach((card, index) => state.tableau[index % 8].push(card.id));
  }

  function currentElapsedMs() {
    return state.runningSince ? state.elapsedMs + (Date.now() - state.runningSince) : state.elapsedMs;
  }
  function currentElapsed() {
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

  function emptySnapshot() {
    return {
      tableau: state.tableau.map(c => c.slice()),
      free: state.free.slice(),
      foundations: state.foundations.slice(),
      moves: state.moves,
      status: state.status
    };
  }

  function pushHistory() {
    state.history.push(emptySnapshot());
    if (state.history.length > MAX_HISTORY) state.history.shift();
  }

  function restore(snapshot) {
    pauseClock();
    state.tableau = snapshot.tableau.map(c => c.slice());
    state.free = snapshot.free.slice();
    state.foundations = snapshot.foundations.slice();
    state.moves = snapshot.moves;
    state.status = snapshot.status;
    state.selected = null;
    resumeClock();
    render();
  }

  function reset(number) {
    pauseClock();
    state.deal = normalizeDeal(number);
    stats.lastDeal = state.deal;
    saveStats();
    deal(state.deal);
    state.free = [null, null, null, null];
    state.foundations = [0, 0, 0, 0];
    state.history = [];
    state.moves = 0;
    state.elapsedMs = 0;
    state.runningSince = 0;
    state.status = 'playing';
    state.selected = null;
    state.winRecorded = false;
    lastTap = { id: null, time: 0 };
    $('deal-number').value = String(state.deal);
    $('result').hidden = true;
    resumeClock();
    skipFlip = true;
    render();
    skipFlip = false;
    if (window.GameCards) GameCards.deal($('tableau'));
    announce(`Deal ${state.deal}: Wähle eine Karte und ihr Ziel.`);
  }

  function nextDeal() {
    reset(state.deal >= 32000 ? 1 : state.deal + 1);
  }

  function isRed(id) { return RED.has(state.cards.get(id).suit); }
  function canFollow(upperId, lowerId) {
    const upper = state.cards.get(upperId);
    const lower = state.cards.get(lowerId);
    return upper.rank === lower.rank + 1 && isRed(upperId) !== isRed(lowerId);
  }
  function isSequence(ids) {
    for (let i = 1; i < ids.length; i++) if (!canFollow(ids[i - 1], ids[i])) return false;
    return true;
  }
  function emptyColumns() { return state.tableau.filter(column => column.length === 0).length; }
  function supermoveLimit(destinationEmpty = false) {
    const free = state.free.filter(id => id === null).length;
    const columns = Math.max(0, emptyColumns() - (destinationEmpty ? 1 : 0));
    return Math.max(1, (free + 1) * (2 ** columns));
  }
  function selectedIds() {
    if (!state.selected) return [];
    if (state.selected.zone === 'free') return state.free[state.selected.index] === null ? [] : [state.free[state.selected.index]];
    const column = state.tableau[state.selected.index];
    return column.slice(state.selected.cardIndex);
  }

  function canMoveSelectedToTableau(columnIndex, ids) {
    if (!ids.length) return false;
    if (state.selected && state.selected.zone === 'tableau' && state.selected.index === columnIndex) return false;
    const target = state.tableau[columnIndex];
    if (target.length && !canFollow(target[target.length - 1], ids[0])) return false;
    return ids.length <= supermoveLimit(target.length === 0);
  }

  function checkDoubleTap(id) {
    const now = performance.now();
    const isDouble = lastTap.id === id && (now - lastTap.time) <= DOUBLE_TAP_MS;
    lastTap = { id: isDouble ? null : id, time: isDouble ? 0 : now };
    return isDouble;
  }

  function selectTableau(columnIndex, cardIndex) {
    if (state.status !== 'playing') return;
    const ids = state.tableau[columnIndex].slice(cardIndex);
    if (!ids.length || !isSequence(ids)) {
      sfx('error');
      announce('Diese Karten bilden keine gültige absteigende Farbfolge.');
      return;
    }
    state.selected = { zone: 'tableau', index: columnIndex, cardIndex };
    sfx('select');
    announce(`${cardText(ids[0])} ausgewählt. Wähle ein Ziel.`);
    render();
  }

  function handleTableauCardClick(columnIndex, cardIndex, id) {
    if (state.status !== 'playing') return;
    const isTop = cardIndex === state.tableau[columnIndex].length - 1;
    if (isTop && checkDoubleTap(id) && foundationCanReceive(id)) {
      state.selected = { zone: 'tableau', index: columnIndex, cardIndex };
      moveToFoundation(id, state.cards.get(id).suit);
      return;
    }
    if (state.selected) {
      if (state.selected.zone === 'tableau' && state.selected.index === columnIndex && state.selected.cardIndex === cardIndex) {
        state.selected = null;
        render();
        announce('Auswahl aufgehoben.');
        return;
      }
      acceptOnTableau(columnIndex);
    } else {
      selectTableau(columnIndex, cardIndex);
    }
  }

  function handleFreeCellClick(index) {
    if (state.status !== 'playing') return;
    const id = state.free[index];
    if (id !== null && checkDoubleTap(id) && foundationCanReceive(id)) {
      state.selected = { zone: 'free', index };
      moveToFoundation(id, state.cards.get(id).suit);
      return;
    }
    if (state.selected) {
      if (state.selected.zone === 'free' && state.selected.index === index) {
        state.selected = null;
        render();
        announce('Auswahl aufgehoben.');
        return;
      }
      if (id !== null) {
        state.selected = { zone: 'free', index };
        sfx('select');
        announce(`${cardText(id)} ausgewählt. Wähle ein Ziel.`);
        render();
        return;
      }
      acceptFree(index);
    } else if (id !== null) {
      state.selected = { zone: 'free', index };
      sfx('select');
      announce(`${cardText(id)} ausgewählt. Wähle ein Ziel.`);
      render();
    }
  }

  function acceptOnTableau(columnIndex) {
    if (!state.selected) return;
    const ids = selectedIds();
    if (!ids.length) return;
    if (state.selected.zone === 'tableau' && state.selected.index === columnIndex) {
      state.selected = null;
      render();
      announce('Auswahl aufgehoben.');
      return;
    }
    const target = state.tableau[columnIndex];
    if (target.length && !canFollow(target[target.length - 1], ids[0])) {
      sfx('error');
      announce('Nur absteigend und mit wechselnden Farben bauen.');
      return;
    }
    const limit = supermoveLimit(target.length === 0);
    if (ids.length > limit) {
      sfx('error');
      announce(`Diese Sequenz ist zu lang. Maximal ${limit} Karten sind hier bewegbar.`);
      return;
    }
    performTableauMove(columnIndex, ids);
  }

  function performTableauMove(destination, ids) {
    pushHistory();
    if (state.selected.zone === 'free') state.free[state.selected.index] = null;
    else state.tableau[state.selected.index].splice(state.selected.cardIndex, ids.length);
    state.tableau[destination].push(...ids);
    state.selected = null;
    state.moves++;
    afterMove('Sequenz verschoben.');
  }

  function acceptFree(index) {
    if (!state.selected || state.free[index] !== null) return;
    const ids = selectedIds();
    if (ids.length !== 1) {
      sfx('error');
      announce('In eine freie Zelle passt nur eine Karte.');
      return;
    }
    pushHistory();
    if (state.selected.zone === 'free') state.free[state.selected.index] = null;
    else state.tableau[state.selected.index].splice(state.selected.cardIndex, 1);
    state.free[index] = ids[0];
    state.selected = null;
    state.moves++;
    afterMove('Karte in freie Zelle gelegt.');
  }

  function foundationCanReceive(id) {
    const card = state.cards.get(id);
    return state.foundations[card.suit] + 1 === card.rank;
  }

  function acceptFoundation(suit) {
    if (!state.selected) return;
    const ids = selectedIds();
    if (ids.length !== 1 || state.cards.get(ids[0]).suit !== suit || !foundationCanReceive(ids[0])) {
      sfx('error');
      announce('Diese Karte passt noch nicht auf dieses Fundament.');
      return;
    }
    moveToFoundation(ids[0], suit);
  }

  function moveToFoundation(id, suit) {
    pushHistory();
    if (state.selected && state.selected.zone === 'free') state.free[state.selected.index] = null;
    else if (state.selected) state.tableau[state.selected.index].splice(state.selected.cardIndex, 1);
    state.foundations[suit]++;
    state.selected = null;
    state.moves++;
    sfx('success');
    afterMove(`${cardText(id)} auf das Fundament gelegt.`);
  }

  function afterMove(message) {
    if (!/Fundament/.test(message)) sfx('place');
    render();
    announce(message);
    if (state.foundations.every(rank => rank === 13)) win();
  }

  function undo() {
    if (!state.history.length) {
      announce('Kein Zug zum Rückgängigmachen.');
      return;
    }
    sfx('undo');
    restore(state.history.pop());
    $('result').hidden = true;
    announce('Letzten Zug rückgängig gemacht.');
  }

  function isSafeFoundation(id) {
    const card = state.cards.get(id);
    const rank = card.rank;
    const foundation = state.foundations[card.suit];
    if (foundation + 1 !== rank) return false;
    if (rank <= 2) return true;
    const opposite = card.suit === 0 || card.suit === 3 ? [1, 2] : [0, 3];
    return opposite.every(suit => state.foundations[suit] >= rank - 1);
  }

  function autoMove() {
    if (state.status !== 'playing') return;
    let count = 0;
    let changed = true;
    while (changed) {
      changed = false;
      const candidates = state.tableau
        .map(column => column[column.length - 1])
        .filter(id => id !== undefined)
        .concat(state.free.filter(id => id !== null));
      for (const id of candidates) {
        if (!isSafeFoundation(id)) continue;
        const source = sourceFor(id);
        if (!source) continue;
        if (count === 0) pushHistory();
        if (source.zone === 'free') state.free[source.index] = null;
        else state.tableau[source.index].splice(source.cardIndex, 1);
        state.foundations[state.cards.get(id).suit]++;
        state.moves++;
        count++;
        changed = true;
        break;
      }
    }
    if (!count) {
      announce('Kein sicherer Auto-Zug verfügbar.');
      return;
    }
    state.selected = null;
    sfx('success');
    render();
    if (state.foundations.every(rank => rank === 13)) {
      win();
      return;
    }
    announce(count === 1 ? '1 sicherer Fundament-Zug ausgeführt.' : `${count} sichere Fundament-Züge ausgeführt.`);
  }

  function sourceFor(id) {
    for (let i = 0; i < 4; i++) if (state.free[i] === id) return { zone: 'free', index: i };
    for (let i = 0; i < 8; i++) {
      const index = state.tableau[i].indexOf(id);
      if (index >= 0) return { zone: 'tableau', index: i, cardIndex: index };
    }
    return null;
  }

  function isAccessible(id) {
    const source = sourceFor(id);
    if (!source) return false;
    if (source.zone === 'free') return true;
    return source.cardIndex === state.tableau[source.index].length - 1;
  }

  function doubleClick(id) {
    if (state.status !== 'playing' || !isAccessible(id) || !foundationCanReceive(id)) {
      announce('Nur eine freie, passende Karte lässt sich per Doppelklick auf das Fundament legen.');
      return;
    }
    state.selected = sourceFor(id);
    moveToFoundation(id, state.cards.get(id).suit);
  }

  function win() {
    pauseClock();
    state.status = 'won';
    const elapsedSec = currentElapsed();
    const score = Math.max(100, 1500 - state.moves * 8 - Math.floor(elapsedSec * 0.5) + stats.streak * 50);
    let isNewBest = false;
    if (!state.winRecorded) {
      state.winRecorded = true;
      stats.wins += 1;
      stats.streak += 1;
      if (score > stats.bestScore) { stats.bestScore = score; isNewBest = true; }
      if (stats.bestTimeSec == null || elapsedSec < stats.bestTimeSec) stats.bestTimeSec = elapsedSec;
      if (stats.bestMoves == null || state.moves < stats.bestMoves) stats.bestMoves = state.moves;
      saveStats();
      if (window.GameScores) {
        window.GameScores.record('pandacell', {
          score,
          timeSec: elapsedSec,
          won: true,
          label: buildScoreLabel()
        });
      }
    }
    sfx('win');
    if (window.GameFX) window.GameFX.celebrate();
    render();
    announce(`Deal ${state.deal} gewonnen!`);
    $('result-title').textContent = 'PandaCell gewonnen!';
    $('result-text').textContent =
      `Deal ${state.deal} geschafft – ${score.toLocaleString('de-DE')} Punkte` +
      (isNewBest ? ' (Neuer Bestwert!)' : ` · Bestwert: ${stats.bestScore.toLocaleString('de-DE')}`) +
      ` · ${state.moves} Züge in ${formatTime(elapsedSec)} · ${stats.wins} ${stats.wins === 1 ? 'Sieg' : 'Siege'}.`;
    $('result').hidden = false;
    window.setTimeout(() => $('result-new').focus({ preventScroll: true }), 0);
  }

  function cardText(id) {
    const card = state.cards.get(id);
    return `${NAMES[card.rank]}${SUITS[card.suit]}`;
  }
  function formatTime(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function announce(text) { $('message').textContent = text; }
  function sfx(name) { if (window.GameAudio) window.GameAudio.play(name); }
  function cardData(id) {
    const card = state.cards.get(id);
    return { id, rank: card.rank, suit: SUITS[card.suit], label: NAMES[card.rank] };
  }

  function cardButton(id, extra = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `card${isRed(id) ? ' red' : ''}${extra}`;
    button.dataset.id = String(id);
    button.dataset.focusKey = `card-${id}`;
    button.setAttribute('aria-label', cardText(id));
    GameCards.face(button, cardData(id));
    return button;
  }

  function renderPile(button, id, label, placeholderText) {
    button.replaceChildren();
    const foundationClass = button.classList.contains('foundation') ? ' foundation' : '';
    button.className = `pile${foundationClass}` + (id === null ? '' : ` occupied${isRed(id) ? ' red' : ''}`);
    button.setAttribute('aria-label', label + (id === null ? ' leer' : `: ${cardText(id)}`));
    if (id === null) {
      GameCards.clear(button);
      const placeholder = document.createElement('span');
      placeholder.className = 'placeholder';
      placeholder.textContent = placeholderText || '＋';
      button.append(placeholder);
    } else {
      GameCards.face(button, cardData(id));
    }
  }

  function clearSelectionVisuals() {
    state.selected = null;
    document.querySelectorAll('#game-table .selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#game-table .target').forEach(el => el.classList.remove('target'));
  }

  // Jedes Rendering läuft als FLIP-Animation: Karten fliegen sichtbar an ihren neuen Platz.
  let flipOverrides = null;
  let skipFlip = false;
  function render() {
    if (skipFlip || !window.GameCards) { renderNow(); return; }
    const overrides = flipOverrides;
    flipOverrides = null;
    GameCards.flip($('game-table'), renderNow, { overrides });
  }

  function renderNow() {
    const table = $('tableau');
    const active = document.activeElement;
    const focusKey = active && (table.contains(active) || $('free-cells').contains(active) || $('foundations').contains(active)) ? active.dataset.focusKey : '';
    const selIds = selectedIds();

    const free = $('free-cells');
    free.replaceChildren();
    state.free.forEach((id, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pile';
      button.dataset.focusKey = `free-${index}`;
      button.dataset.drop = 'free';
      button.dataset.index = String(index);
      renderPile(button, id, `Freie Zelle ${index + 1}`);
      if (state.selected && state.selected.zone === 'free' && state.selected.index === index) {
        button.classList.add('selected');
      } else if (selIds.length === 1 && id === null) {
        button.classList.add('target');
      }
      button.addEventListener('click', () => handleFreeCellClick(index));
      if (id !== null) {
        button.addEventListener('dblclick', event => { event.stopPropagation(); doubleClick(id); });
      }
      free.append(button);
    });

    const foundations = $('foundations');
    foundations.replaceChildren();
    state.foundations.forEach((rankValue, suit) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pile foundation';
      button.dataset.focusKey = `foundation-${suit}`;
      button.dataset.drop = 'foundation';
      button.dataset.suitIndex = String(suit);
      const id = rankValue ? suit * 13 + rankValue - 1 : null;
      renderPile(button, id, `Fundament ${SUITS[suit]}`, SUITS[suit]);
      if (selIds.length === 1 && state.cards.get(selIds[0]).suit === suit && foundationCanReceive(selIds[0])) {
        button.classList.add('target');
      }
      button.addEventListener('click', () => acceptFoundation(suit));
      foundations.append(button);
    });

    table.replaceChildren();
    const tableStyle = getComputedStyle(table);
    const gap = Number.parseFloat(tableStyle.columnGap) || 3;
    const maxCardW = window.innerWidth >= 1920 ? 102 : 84;
    const columnWidth = Math.max(26, (table.clientWidth - gap * 7) / 8);
    const cardWidth = Math.min(maxCardW, columnWidth);
    const cardHeight = cardWidth / 0.72;
    const cardStep = Math.max(20, Math.min(40, cardHeight * 0.36));
    let maximumBottom = cardHeight + 24;
    const wrappers = [];

    state.tableau.forEach((column, columnIndex) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'column';
      wrapper.dataset.column = String(columnIndex);
      wrapper.dataset.drop = 'tableau';
      wrapper.dataset.focusKey = `column-${columnIndex}`;
      if (column.length === 0) {
        wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'button');
      }
      wrapper.setAttribute('aria-label', `Tableau-Spalte ${columnIndex + 1}${column.length ? '' : ', leer'}`);
      if (selIds.length && canMoveSelectedToTableau(columnIndex, selIds)) {
        wrapper.classList.add('target');
      }
      wrapper.addEventListener('click', event => { if (event.target === wrapper) acceptOnTableau(columnIndex); });
      wrapper.addEventListener('keydown', event => {
        if (state.selected && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          acceptOnTableau(columnIndex);
        }
      });
      column.forEach((id, cardIndex) => {
        const button = cardButton(id);
        button.style.top = `${cardIndex * cardStep}px`;
        button.style.height = `${cardHeight}px`;
        if (state.selected && state.selected.zone === 'tableau' && state.selected.index === columnIndex && cardIndex >= state.selected.cardIndex) {
          button.classList.add('selected');
        }
        button.addEventListener('click', event => {
          event.stopPropagation();
          handleTableauCardClick(columnIndex, cardIndex, id);
        });
        button.addEventListener('dblclick', event => { event.stopPropagation(); doubleClick(id); });
        wrapper.append(button);
      });
      const bottom = column.length ? (column.length - 1) * cardStep + cardHeight + 12 : cardHeight + 12;
      maximumBottom = Math.max(maximumBottom, bottom);
      wrappers.push(wrapper);
      table.append(wrapper);
    });
    table.style.minHeight = `${Math.ceil(maximumBottom)}px`;
    wrappers.forEach(wrapper => { wrapper.style.minHeight = `${Math.ceil(maximumBottom - 4)}px`; });

    $('moves').textContent = String(state.moves);
    $('time').textContent = formatTime(currentElapsed());
    $('foundation-count').textContent = `${state.foundations.reduce((a, b) => a + b, 0)} / 52`;
    $('move-limit').textContent = String(supermoveLimit(false));
    $('best-score').textContent = stats.bestScore.toLocaleString('de-DE');
    $('wins-count').textContent = String(stats.wins);
    $('undo').disabled = !state.history.length;
    if (focusKey) document.querySelector(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  $('undo').addEventListener('click', undo);
  $('restart').addEventListener('click', () => reset(state.deal));
  $('new-game').addEventListener('click', nextDeal);
  $('auto').addEventListener('click', autoMove);
  $('result-new').addEventListener('click', nextDeal);
  $('result-undo').addEventListener('click', undo);
  $('deal-number').addEventListener('change', event => reset(event.target.value));

  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!$('result').hidden) return;
    const target = event.target;
    if (target && typeof target.matches === 'function' && target.matches('input, select, textarea')) {
      if (event.key === 'Escape') target.blur();
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'u') { event.preventDefault(); undo(); }
    else if (key === 'a') { event.preventDefault(); autoMove(); }
    else if (key === 'r') { event.preventDefault(); reset(state.deal); }
    else if (key === 'n') { event.preventDefault(); nextDeal(); }
    else if (key === 'escape') {
      if (state.selected) {
        state.selected = null;
        render();
        announce('Auswahl aufgehoben.');
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseClock();
    else resumeClock();
  });
  window.addEventListener('pagehide', pauseClock);
  window.addEventListener('pageshow', resumeClock);

  setInterval(() => {
    if (state.status === 'playing') { $('time').textContent = formatTime(currentElapsed()); }
  }, 500);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderNow, 120);
  });

  // Drag & Drop mit Kartenvorschau (Maus, Stift, Touch) – ergänzt das Antippen.
  if (window.GameCards) {
    GameCards.makeDraggable({
      root: $('game-table'),
      cardSelector: '#tableau .card, .free-cells .pile.occupied',
      targetSelector: '[data-drop]',
      start(element) {
        if (state.status !== 'playing') return null;
        if (element.dataset.drop === 'free') {
          const index = Number(element.dataset.index);
          return state.free[index] === null ? null : { zone: 'free', index };
        }
        const column = element.closest('.column');
        if (!column) return null;
        const columnIndex = Number(column.dataset.column);
        const cardIndex = state.tableau[columnIndex].indexOf(Number(element.dataset.id));
        if (cardIndex < 0 || !isSequence(state.tableau[columnIndex].slice(cardIndex))) return null;
        return { zone: 'tableau', index: columnIndex, cardIndex };
      },
      cards(payload) {
        const ids = payload.zone === 'free' ? [state.free[payload.index]] : state.tableau[payload.index].slice(payload.cardIndex);
        return ids.map(cardData);
      },
      sourceElements(payload) {
        if (payload.zone === 'free') return [document.querySelector(`[data-focus-key="free-${payload.index}"]`)].filter(Boolean);
        return state.tableau[payload.index].slice(payload.cardIndex).map(id => document.querySelector(`#tableau [data-id="${id}"]`)).filter(Boolean);
      },
      canDrop(payload, target) {
        const ids = payload.zone === 'free' ? [state.free[payload.index]] : state.tableau[payload.index].slice(payload.cardIndex);
        if (target.dataset.drop === 'free') return ids.length === 1 && state.free[Number(target.dataset.index)] === null;
        if (target.dataset.drop === 'foundation') return ids.length === 1 && state.cards.get(ids[0]).suit === Number(target.dataset.suitIndex) && foundationCanReceive(ids[0]);
        const columnIndex = Number(target.dataset.column);
        if (payload.zone === 'tableau' && payload.index === columnIndex) return false;
        const column = state.tableau[columnIndex];
        if (column.length && !canFollow(column[column.length - 1], ids[0])) return false;
        return ids.length <= supermoveLimit(column.length === 0);
      },
      drop(payload, target, ghostRects) {
        const before = state.moves;
        state.selected = payload;
        flipOverrides = ghostRects;
        if (target.dataset.drop === 'free') acceptFree(Number(target.dataset.index));
        else if (target.dataset.drop === 'foundation') acceptFoundation(Number(target.dataset.suitIndex));
        else acceptOnTableau(Number(target.dataset.column));
        flipOverrides = null;
        if (state.moves === before) { clearSelectionVisuals(); return false; }
        return true;
      },
      cancel(_payload, hadTarget) {
        // Kein render() während der Rückflug-Animation!
        clearSelectionVisuals();
        if (!hadTarget) announce('Karte zurückgelegt.');
      }
    });
  }

  window.PandaCell = {
    supermoveLimit,
    canFollow,
    isSequence,
    getState: () => ({
      deal: state.deal,
      tableau: state.tableau.map(c => c.slice()),
      free: state.free.slice(),
      foundations: state.foundations.slice(),
      moves: state.moves,
      status: state.status,
      selected: state.selected ? { ...state.selected } : null,
      elapsed: currentElapsed(),
      historyLength: state.history.length
    }),
    newGame: reset,
    undo,
    autoMove
  };

  syncSharedScores();
  reset(stats.lastDeal || 1);
})();
