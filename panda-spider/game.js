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
  const els = {
    tableau: document.querySelector('#tableau'), mode: document.querySelector('#suit-mode'), newGame: document.querySelector('#new-game'), undo: document.querySelector('#undo'),
    deal: document.querySelector('#deal-stock'), moves: document.querySelector('#moves'), time: document.querySelector('#time'), completed: document.querySelector('#completed'), stock: document.querySelector('#stock-count'), message: document.querySelector('#message')
  };
  const state = { columns: [], stock: [], completed: 0, moves: 0, history: [], selected: null, mode: 1, startedAt: 0, elapsed: 0, status: 'playing' };
  let timerId = 0;

  function rankName(rank) { return RANK_LABELS[rank] || String(rank); }
  function cloneCard(card) { return card ? { ...card } : card; }
  function cloneColumns(columns) { return columns.map(column => column.map(cloneCard)); }
  function snapshot() { return { columns: cloneColumns(state.columns), stock: state.stock.map(cloneCard), completed: state.completed, moves: state.moves, elapsed: state.elapsed, status: state.status }; }
  function saveHistory() { state.history.push(snapshot()); if (state.history.length > 100) state.history.shift(); }
  function restore(item) { state.columns = cloneColumns(item.columns); state.stock = item.stock.map(cloneCard); state.completed = item.completed; state.moves = item.moves; state.elapsed = item.elapsed; state.status = item.status; state.startedAt = Date.now() - item.elapsed * 1000; state.selected = null; render(); }

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
    for (let i = cards.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
    return cards;
  }

  function newGame() {
    state.mode = Number(els.mode.value);
    const deck = buildDeck(state.mode);
    state.columns = Array.from({ length: 10 }, () => []);
    columnSizes.forEach((size, columnIndex) => {
      for (let i = 0; i < size; i += 1) { const card = deck.pop(); card.faceUp = i === size - 1; state.columns[columnIndex].push(card); }
    });
    state.stock = deck; state.completed = 0; state.moves = 0; state.history = []; state.selected = null; state.elapsed = 0; state.status = 'playing'; state.startedAt = Date.now();
    announce('Neues Spiel gestartet. Wähle eine offene Karte.'); skipFlip = true; render(); skipFlip = false; if (window.GameCards) GameCards.deal(els.tableau);
  }

  function isMovableSequence(column, index) {
    if (index < 0 || index >= column.length || !column[index].faceUp) return false;
    for (let i = index; i < column.length - 1; i += 1) {
      const current = column[i]; const next = column[i + 1];
      if (!next.faceUp || current.suit !== next.suit || current.rank !== next.rank + 1) return false;
    }
    return true;
  }
  function canPlace(moving, target) { return !target || (target.faceUp && target.rank === moving.rank + 1); }
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
    return removed;
  }
  function revealTops() { state.columns.forEach(column => { if (column.length) column[column.length - 1].faceUp = true; }); }

  function moveTo(columnIndex) {
    if (!state.selected || state.status !== 'playing') return false;
    const from = state.selected.column; const start = state.selected.index; const source = state.columns[from];
    const moving = source.slice(start);
    const targetColumn = state.columns[columnIndex]; const target = targetColumn[targetColumn.length - 1];
    if (from === columnIndex || !canPlace(moving[0], target)) return false;
    saveHistory(); source.splice(start); targetColumn.push(...moving); revealTops(); state.moves += 1; state.selected = null;
    const removed = completeRuns(); revealTops();
    if (removed) { sfx('success'); announce(`${removed} vollständige Reihe${removed > 1 ? 'n' : ''} entfernt.`); } else { sfx('place'); announce('Guter Zug.'); }
    checkEnd(); render(); return true;
  }

  function selectCard(columnIndex, cardIndex) {
    if (state.status !== 'playing') return;
    const column = state.columns[columnIndex]; const card = column[cardIndex];
    if (!card || !card.faceUp) return;
    if (!state.selected) {
      if (isMovableSequence(column, cardIndex)) { state.selected = { column: columnIndex, index: cardIndex }; sfx('select'); announce('Karte ausgewählt. Wähle eine passende Zielkarte oder leere Spalte.'); render(); }
      else { sfx('error'); announce('Diese Karte kann nicht als Folge bewegt werden.'); }
      return;
    }
    if (state.selected.column === columnIndex && state.selected.index === cardIndex) { state.selected = null; announce('Auswahl aufgehoben.'); render(); return; }
    if (state.selected.column === columnIndex && cardIndex > state.selected.index) { state.selected = null; selectCard(columnIndex, cardIndex); return; }
    if (!moveTo(columnIndex)) { state.selected = null; sfx('error'); announce('Dort darf die ausgewählte Karte nicht liegen.'); render(); }
  }

  function dealStock() {
    if (state.status !== 'playing' || !state.stock.length) return;
    if (state.columns.some(column => column.length === 0)) { announce('Der Stock darf nicht mit einer leeren Spalte ausgeteilt werden.'); return; }
    saveHistory(); for (let i = 0; i < 10; i += 1) { const card = state.stock.pop(); if (!card) break; card.faceUp = true; state.columns[i].push(card); }
    state.moves += 1; const removed = completeRuns(); revealTops(); sfx(removed ? 'success' : 'deal'); announce(removed ? `${removed} vollständige Reihe${removed > 1 ? 'n' : ''} entfernt.` : 'Je eine offene Karte wurde auf jede Spalte gelegt.'); checkEnd(); render();
  }

  function hasAnyMove() {
    for (let from = 0; from < 10; from += 1) {
      const column = state.columns[from];
      for (let index = 0; index < column.length; index += 1) if (isMovableSequence(column, index)) {
        const moving = column[index];
        for (let to = 0; to < 10; to += 1) if (to !== from && canPlace(moving, state.columns[to].at(-1))) return true;
      }
    }
    return false;
  }
  function checkEnd() {
    if (state.completed === 8) { state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000); state.startedAt = 0; state.status = 'won'; sfx('win'); if (window.GameFX) window.GameFX.celebrate(); announce('Gewonnen! Alle acht Reihen sind entfernt.'); return; }
    if (!state.stock.length && !hasAnyMove()) { state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000); state.startedAt = 0; state.status = 'lost'; sfx('lose'); announce('Keine Züge mehr. Starte ein neues Spiel oder gehe einen Zug zurück.'); }
  }
  function announce(text) { els.message.textContent = text; }
  function sfx(name) { if (window.GameAudio) window.GameAudio.play(name); }
  function formatTime(seconds) { const mins = Math.floor(seconds / 60); const secs = seconds % 60; return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`; }
  function updateStats() { els.moves.textContent = String(state.moves); els.time.textContent = formatTime(state.elapsed); els.completed.textContent = `${state.completed} / 8`; els.stock.textContent = String(state.stock.length); els.undo.disabled = state.history.length === 0; els.deal.disabled = !state.stock.length || state.columns.some(column => column.length === 0) || state.status !== 'playing'; }

  function cardData(card) { return { id: card.id, rank: card.rank, suit: SUITS[card.suit].symbol, label: rankName(card.rank), faceDown: !card.faceUp }; }
  function makeCardButton(card, columnIndex, index, top, height) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'card'; button.style.top = `${top}px`; button.style.height = `${height}px`; button.style.zIndex = String(index + 1);
    button.dataset.column = String(columnIndex); button.dataset.index = String(index); button.dataset.focusKey = `card-${card.id}`; button.setAttribute('aria-label', card.faceUp ? `${rankName(card.rank)} ${SUITS[card.suit].name}, Spalte ${columnIndex + 1}` : 'Verdeckte Karte');
    GameCards.face(button, cardData(card));
    if (!card.faceUp) { button.classList.add('face-down'); button.disabled = true; return button; }
    button.classList.toggle('is-red', SUITS[card.suit].color === 'red');
    if (state.selected && state.selected.column === columnIndex && index >= state.selected.index) button.classList.add('is-selected');
    button.addEventListener('click', () => selectCard(columnIndex, index)); return button;
  }

  // Kartengeometrie aus der realen Spaltenbreite: Karten behalten überall das Seitenverhältnis 0,72.
  function geometry() {
    const style = getComputedStyle(els.tableau);
    const gap = Number.parseFloat(style.columnGap) || 4;
    const width = Math.max(300, els.tableau.clientWidth || 700);
    const columnWidth = (width - gap * 9) / 10;
    const cardWidth = Math.max(26, columnWidth - 4);
    const cardHeight = Math.min(120, cardWidth / .72);
    return { cardHeight, labelHeight: 22, upStep: Math.max(16, Math.min(40, cardHeight * .38)), downStep: Math.max(8, Math.min(18, cardHeight * .18)) };
  }

  // Jedes Rendering läuft als FLIP-Animation: Karten fliegen sichtbar an ihren neuen Platz.
  let flipOverrides = null;
  let skipFlip = false;
  function render() {
    if (skipFlip || !window.GameCards) { renderNow(); return; }
    const overrides = flipOverrides; flipOverrides = null;
    GameCards.flip(els.tableau, renderNow, { overrides, appearNew: true });
  }

  function renderNow() {
    const active = document.activeElement;
    const focusKey = active && els.tableau.contains(active) ? active.dataset.focusKey : '';
    els.tableau.replaceChildren();
    const wrappers = [];
    const g = geometry();
    let maximumHeight = 320;
    state.columns.forEach((column, columnIndex) => {
      const wrapper = document.createElement('div'); wrapper.className = 'column'; wrapper.dataset.column = String(columnIndex); wrapper.dataset.dropColumn = String(columnIndex); wrapper.dataset.focusKey = `column-${columnIndex}`; wrapper.setAttribute('role', 'group'); wrapper.setAttribute('aria-label', `Spalte ${columnIndex + 1}, ${column.length} Karten`);
      const label = document.createElement('span'); label.className = 'column-label'; label.textContent = String(columnIndex + 1); wrapper.append(label);
      wrapper.tabIndex = 0;
      if (state.selected && state.selected.column !== columnIndex && column.length === 0) wrapper.classList.add('selected-target');
      let top = g.labelHeight;
      column.forEach((card, index) => { wrapper.append(makeCardButton(card, columnIndex, index, top, g.cardHeight)); top += card.faceUp ? g.upStep : g.downStep; });
      maximumHeight = Math.max(maximumHeight, top + g.cardHeight + 12);
      wrappers.push(wrapper);
      wrapper.addEventListener('click', event => {
        if (state.selected && !event.target.closest('.card')) moveTo(columnIndex);
      });
      wrapper.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && state.selected) { event.preventDefault(); moveTo(columnIndex); } });
      els.tableau.append(wrapper);
    });
    els.tableau.style.minHeight = `${Math.ceil(maximumHeight)}px`;
    wrappers.forEach(wrapper => { wrapper.style.minHeight = `${Math.ceil(maximumHeight - 6)}px`; });
    updateStats();
    if (focusKey) els.tableau.querySelector(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true });
  }
  function tick() { if (state.status === 'playing' && state.startedAt) state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000); els.time.textContent = formatTime(state.elapsed); }

  els.newGame.addEventListener('click', newGame); els.mode.addEventListener('change', newGame); els.deal.addEventListener('click', dealStock);
  els.undo.addEventListener('click', () => { const previous = state.history.pop(); if (previous) { restore(previous); sfx('undo'); announce('Letzten Zug rückgängig gemacht.'); } });
  document.addEventListener('keydown', event => { if (event.target instanceof Element && event.target.matches('input, select, textarea')) return; if (event.key.toLowerCase() === 'n') newGame(); if (event.key.toLowerCase() === 'u') els.undo.click(); });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { window.clearTimeout(resizeTimer); resizeTimer = window.setTimeout(renderNow, 120); });

  // Drag & Drop mit Kartenvorschau (Maus, Stift, Touch) – ergänzt das Antippen.
  if (window.GameCards) {
    GameCards.makeDraggable({
      root: els.tableau,
      cardSelector: '.card',
      targetSelector: '[data-drop-column]',
      start(element) {
        if (state.status !== 'playing') return null;
        const column = Number(element.dataset.column); const index = Number(element.dataset.index);
        return isMovableSequence(state.columns[column], index) ? { column, index } : null;
      },
      cards(payload) { return state.columns[payload.column].slice(payload.index).map(cardData); },
      sourceElements(payload) { return state.columns[payload.column].slice(payload.index).map(card => els.tableau.querySelector(`[data-focus-key="card-${card.id}"]`)).filter(Boolean); },
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
        if (!moved) { state.selected = null; render(); }
        return moved;
      },
      cancel(payload, hadTarget) { state.selected = null; render(); if (!hadTarget) announce('Karte losgelassen – kein Ziel gewählt.'); }
    });
  }

  timerId = window.setInterval(tick, 1000); void timerId; newGame();
})();
