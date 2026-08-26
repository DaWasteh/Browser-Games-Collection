(() => {
  'use strict';
  const SUITS = ['♣', '♦', '♥', '♠'];
  const NAMES = ['—', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const RED = new Set([1, 2]);
  const $ = id => document.getElementById(id);
  const state = { deal: 1, tableau: Array.from({ length: 8 }, () => []), free: [null, null, null, null], foundations: [0, 0, 0, 0], cards: new Map(), history: [], moves: 0, startedAt: 0, elapsed: 0, status: 'playing', selected: null };

  function normalizeDeal(value) { const n = Number(value); return Number.isFinite(n) ? Math.min(32000, Math.max(1, Math.floor(n))) : 1; }
  function rng(seed) {
    let value = (seed >>> 0) || 1;
    return () => { value = (Math.imul(1664525, value) + 1013904223) >>> 0; return value / 4294967296; };
  }
  function makeDeck() {
    const deck = [];
    for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) deck.push({ id: suit * 13 + rank - 1, suit, rank });
    return deck;
  }
  function deal(number) {
    const random = rng(number);
    const deck = makeDeck();
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    state.cards = new Map(deck.map(card => [card.id, card]));
    state.tableau = Array.from({ length: 8 }, () => []);
    deck.forEach((card, index) => state.tableau[index % 8].push(card.id));
  }
  function emptySnapshot() { return { tableau: state.tableau.map(c => c.slice()), free: state.free.slice(), foundations: state.foundations.slice(), moves: state.moves, elapsed: currentElapsed(), status: state.status }; }
  function restore(snapshot) { state.tableau = snapshot.tableau.map(c => c.slice()); state.free = snapshot.free.slice(); state.foundations = snapshot.foundations.slice(); state.moves = snapshot.moves; state.elapsed = snapshot.elapsed; state.status = snapshot.status; state.selected = null; render(); }
  function currentElapsed() { return state.startedAt ? state.elapsed + Math.floor((Date.now() - state.startedAt) / 1000) : state.elapsed; }
  function reset(number) { state.deal = normalizeDeal(number); deal(state.deal); state.free = [null, null, null, null]; state.foundations = [0, 0, 0, 0]; state.history = []; state.moves = 0; state.elapsed = 0; state.startedAt = Date.now(); state.status = 'playing'; state.selected = null; $('deal-number').value = String(state.deal); $('result').hidden = true; render(); announce(`Deal ${state.deal}: Wähle eine Karte und ihr Ziel.`); }
  function nextDeal() { reset(state.deal >= 32000 ? 1 : state.deal + 1); }
  function isRed(id) { return RED.has(state.cards.get(id).suit); }
  function canFollow(upperId, lowerId) { const upper = state.cards.get(upperId); const lower = state.cards.get(lowerId); return upper.rank === lower.rank + 1 && isRed(upperId) !== isRed(lowerId); }
  function isSequence(ids) { for (let i = 1; i < ids.length; i++) if (!canFollow(ids[i - 1], ids[i])) return false; return true; }
  function emptyColumns() { return state.tableau.filter(column => column.length === 0).length; }
  function supermoveLimit(destinationEmpty = false) { const free = state.free.filter(id => id === null).length; const columns = Math.max(0, emptyColumns() - (destinationEmpty ? 1 : 0)); return Math.max(1, (free + 1) * (2 ** columns)); }
  function selectedIds() { if (!state.selected) return []; if (state.selected.zone === 'free') return state.free[state.selected.index] === null ? [] : [state.free[state.selected.index]]; const column = state.tableau[state.selected.index]; return column.slice(state.selected.cardIndex); }
  function selectTableau(columnIndex, cardIndex) {
    if (state.status !== 'playing') return;
    const ids = state.tableau[columnIndex].slice(cardIndex);
    if (!ids.length || !isSequence(ids)) { announce('Diese Karten bilden keine gültige absteigende Farbfolge.'); return; }
    state.selected = { zone: 'tableau', index: columnIndex, cardIndex };
    announce(`${cardText(ids[0])} ausgewählt. Wähle ein Ziel.`); render();
  }
  function selectFree(index) {
    if (state.status !== 'playing' || state.free[index] === null) return;
    state.selected = { zone: 'free', index }; announce(`${cardText(state.free[index])} ausgewählt. Wähle ein Ziel.`); render();
  }
  function acceptOnTableau(columnIndex) {
    if (!state.selected) return;
    const ids = selectedIds();
    if (!ids.length) return;
    if (state.selected.zone === 'tableau' && state.selected.index === columnIndex) { state.selected = null; render(); return; }
    const target = state.tableau[columnIndex];
    if (target.length && !canFollow(target[target.length - 1], ids[0])) { announce('Nur absteigend und mit wechselnden Farben bauen.'); return; }
    const limit = supermoveLimit(target.length === 0);
    if (ids.length > limit) { announce(`Diese Sequenz ist zu lang. Maximal ${limit} Karten sind hier bewegbar.`); return; }
    performTableauMove(columnIndex, ids);
  }
  function performTableauMove(destination, ids) {
    state.history.push(emptySnapshot());
    if (state.selected.zone === 'free') state.free[state.selected.index] = null;
    else state.tableau[state.selected.index].splice(state.selected.cardIndex, ids.length);
    state.tableau[destination].push(...ids); state.selected = null; state.moves++; afterMove('Sequenz verschoben.');
  }
  function acceptFree(index) {
    if (!state.selected || state.free[index] !== null) return;
    const ids = selectedIds();
    if (ids.length !== 1) { announce('In eine freie Zelle passt nur eine Karte.'); return; }
    state.history.push(emptySnapshot());
    if (state.selected.zone === 'free') state.free[state.selected.index] = null;
    else state.tableau[state.selected.index].splice(state.selected.cardIndex, 1);
    state.free[index] = ids[0]; state.selected = null; state.moves++; afterMove('Karte in freie Zelle gelegt.');
  }
  function foundationCanReceive(id) { const card = state.cards.get(id); return state.foundations[card.suit] + 1 === card.rank; }
  function acceptFoundation(suit) {
    if (!state.selected) return;
    const ids = selectedIds();
    if (ids.length !== 1 || state.cards.get(ids[0]).suit !== suit || !foundationCanReceive(ids[0])) { announce('Diese Karte passt noch nicht auf diese Foundation.'); return; }
    moveToFoundation(ids[0], suit);
  }
  function moveToFoundation(id, suit) {
    state.history.push(emptySnapshot());
    if (state.selected && state.selected.zone === 'free') state.free[state.selected.index] = null;
    else if (state.selected) state.tableau[state.selected.index].splice(state.selected.cardIndex, 1);
    state.foundations[suit]++; state.selected = null; state.moves++; afterMove(`${cardText(id)} auf Foundation gelegt.`);
  }
  function afterMove(message) {
    render(); announce(message);
    if (state.foundations.every(rank => rank === 13)) win();
  }
  function undo() {
    if (!state.history.length) { announce('Kein Zug zum Rückgängigmachen.'); return; }
    state.elapsed = currentElapsed(); state.startedAt = Date.now();
    restore(state.history.pop());
    $('result').hidden = true;
    announce('Letzten Zug rückgängig gemacht.');
  }
  function isSafeFoundation(id) {
    const card = state.cards.get(id); const rank = card.rank; const foundation = state.foundations[card.suit];
    if (foundation + 1 !== rank) return false;
    if (rank <= 2) return true;
    const opposite = card.suit === 0 || card.suit === 3 ? [1, 2] : [0, 3];
    return opposite.every(suit => state.foundations[suit] >= rank - 1);
  }
  function autoMove() {
    if (state.status !== 'playing') return;
    let count = 0; let changed = true;
    while (changed) {
      changed = false;
      const candidates = state.tableau.map(column => column[column.length - 1]).filter(id => id !== undefined).concat(state.free.filter(id => id !== null));
      for (const id of candidates) {
        const card = state.cards.get(id);
        if (!isSafeFoundation(id)) continue;
        const source = sourceFor(id); state.selected = source; moveToFoundation(id, card.suit); count++; changed = true; break;
      }
    }
    if (!count) announce('Kein sicherer Auto-Move verfügbar.'); else announce(`${count} sichere Foundation-Züge ausgeführt.`);
  }
  function sourceFor(id) { for (let i = 0; i < 4; i++) if (state.free[i] === id) return { zone: 'free', index: i }; for (let i = 0; i < 8; i++) { const index = state.tableau[i].indexOf(id); if (index >= 0) return { zone: 'tableau', index: i, cardIndex: index }; } return null; }
  function isAccessible(id) { const source = sourceFor(id); if (!source) return false; if (source.zone === 'free') return true; return source.cardIndex === state.tableau[source.index].length - 1; }
  function doubleClick(id) { if (state.status !== 'playing' || !isAccessible(id) || !isSafeFoundation(id)) { announce('Nur die oberste, freie Karte lässt sich per Doppelklick auf die Foundation legen.'); return; } state.selected = sourceFor(id); moveToFoundation(id, state.cards.get(id).suit); }
  function win() { state.status = 'won'; state.elapsed = currentElapsed(); state.startedAt = 0; render(); $('result-title').textContent = 'PandaCell gewonnen!'; $('result-text').textContent = `Deal ${state.deal} geschafft – ${state.moves} Züge in ${formatTime(state.elapsed)}.`; $('result').hidden = false; $('result-new').focus(); }
  function cardText(id) { const card = state.cards.get(id); return `${NAMES[card.rank]}${SUITS[card.suit]}`; }
  function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  function announce(text) { $('message').textContent = text; }
  function cardButton(id, extra = '') { const card = state.cards.get(id); const button = document.createElement('button'); button.type = 'button'; button.className = `card${isRed(id) ? ' red' : ''}${extra}`; button.dataset.id = String(id); button.dataset.focusKey = `card-${id}`; button.setAttribute('aria-label', cardText(id)); const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = NAMES[card.rank]; const suit = document.createElement('span'); suit.className = 'suit'; suit.textContent = SUITS[card.suit]; button.append(rank, suit); return button; }
  function renderPile(button, id, label) { button.replaceChildren(); const foundationClass = button.classList.contains('foundation') ? ' foundation' : ''; button.className = `pile${foundationClass}` + (id === null ? '' : ` occupied${isRed(id) ? ' red' : ''}`); button.setAttribute('aria-label', label + (id === null ? ' leer' : `: ${cardText(id)}`)); if (id === null) { const placeholder = document.createElement('span'); placeholder.className = 'placeholder'; placeholder.textContent = '＋'; button.append(placeholder); } else { const card = state.cards.get(id); const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = NAMES[card.rank]; const suit = document.createElement('span'); suit.className = 'suit'; suit.textContent = SUITS[card.suit]; button.append(rank, suit); } }
  function render() {
    const table = $('tableau');
    const active = document.activeElement;
    const focusKey = active && (table.contains(active) || $('free-cells').contains(active) || $('foundations').contains(active)) ? active.dataset.focusKey : '';

    const free = $('free-cells');
    free.replaceChildren();
    state.free.forEach((id, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pile';
      button.dataset.focusKey = `free-${index}`;
      renderPile(button, id, `Freie Zelle ${index + 1}`);
      button.addEventListener('click', () => state.selected ? acceptFree(index) : selectFree(index));
      free.append(button);
    });

    const foundations = $('foundations');
    foundations.replaceChildren();
    state.foundations.forEach((rankValue, suit) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pile foundation';
      button.dataset.focusKey = `foundation-${suit}`;
      const id = rankValue ? suit * 13 + rankValue - 1 : null;
      renderPile(button, id, `Foundation ${SUITS[suit]}`);
      button.addEventListener('click', () => acceptFoundation(suit));
      foundations.append(button);
    });

    table.replaceChildren();
    const tableStyle = getComputedStyle(table);
    const gap = Number.parseFloat(tableStyle.columnGap) || 3;
    const columnWidth = Math.max(26, (table.clientWidth - gap * 7) / 8);
    const cardHeight = Math.max(50, Math.min(108, columnWidth / .68));
    const cardStep = Math.max(24, Math.min(49, cardHeight * .45));
    let maximumBottom = 220;
    const wrappers = [];
    state.tableau.forEach((column, columnIndex) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'column';
      wrapper.dataset.column = String(columnIndex);
      wrapper.dataset.focusKey = `column-${columnIndex}`;
      if (column.length === 0) {
        wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'button');
      }
      wrapper.setAttribute('aria-label', `Tableau-Spalte ${columnIndex + 1}${column.length ? '' : ', leer'}`);
      if (state.selected && state.selected.zone === 'tableau' && state.selected.index !== columnIndex) wrapper.classList.add('target');
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
        if (state.selected && state.selected.zone === 'tableau' && state.selected.index === columnIndex && cardIndex >= state.selected.cardIndex) button.classList.add('selected');
        button.addEventListener('click', event => {
          event.stopPropagation();
          if (state.selected) acceptOnTableau(columnIndex); else selectTableau(columnIndex, cardIndex);
        });
        button.addEventListener('dblclick', event => { event.stopPropagation(); doubleClick(id); });
        wrapper.append(button);
      });
      const bottom = column.length ? (column.length - 1) * cardStep + cardHeight + 10 : cardHeight + 10;
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
    $('undo').disabled = !state.history.length;
    if (focusKey) document.querySelector(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true });
  }
  $('undo').addEventListener('click', undo); $('restart').addEventListener('click', () => reset(state.deal)); $('new-game').addEventListener('click', nextDeal); $('auto').addEventListener('click', autoMove); $('result-new').addEventListener('click', nextDeal); $('result-undo').addEventListener('click', undo); $('deal-number').addEventListener('change', event => reset(event.target.value));
  document.addEventListener('keydown', event => { const target = event.target; if (target && typeof target.matches === 'function' && target.matches('input,textarea') && event.key !== 'Escape') return; const key = event.key.toLowerCase(); if (key === 'u') { event.preventDefault(); undo(); } else if (key === 'n') { event.preventDefault(); reset(state.deal); } else if (key === 'd') { event.preventDefault(); nextDeal(); } else if (key === 'a') { event.preventDefault(); autoMove(); } else if (key === 'escape') { state.selected = null; render(); announce('Auswahl aufgehoben.'); } });
  setInterval(() => { if (state.status === 'playing') { $('time').textContent = formatTime(currentElapsed()); } }, 1000);
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(render, 120);
  });
  window.PandaCell = { supermoveLimit, canFollow, isSequence, getState: () => ({ deal: state.deal, tableau: state.tableau.map(c => c.slice()), free: state.free.slice(), foundations: state.foundations.slice(), moves: state.moves, status: state.status, selected: state.selected ? { ...state.selected } : null, elapsed: currentElapsed(), historyLength: state.history.length }), newGame: reset, undo, autoMove };
  reset(1);
})();
