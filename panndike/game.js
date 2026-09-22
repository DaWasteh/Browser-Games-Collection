(() => {
  'use strict';

  const E = window.PanndikeEngine;
  if (!E) throw new Error('PanndikeEngine fehlt.');

  const $ = id => document.getElementById(id);
  const ui = {
    table: document.querySelector('.game-table'), tableau: $('tableau'), foundations: $('foundations'), stock: $('stock'), waste: $('waste'),
    stockCount: $('stock-count'), moves: $('moves'), score: $('score'), time: $('time'),
    foundationCount: $('foundation-count'), drawLabel: $('draw-label'), dealCode: $('deal-code'),
    message: $('message'), drawMode: $('draw-mode'), undo: $('undo'), hint: $('hint'), auto: $('auto'),
    restart: $('restart'), newGame: $('new-game'), daily: $('daily'),
    confirm: $('confirm'), confirmText: $('confirm-text'), confirmCancel: $('confirm-cancel'), confirmOk: $('confirm-ok'),
    result: $('result'), resultText: $('result-text'), resultNew: $('result-new'), resultDaily: $('result-daily'), resultUndo: $('result-undo'),
    bestScore: $('best-score'), wins: $('wins'), streak: $('streak')
  };

  const SAVE_KEY = 'panndike-save-v3';
  const STATS_KEY = 'panndike-stats-v1';
  const PREF_KEY = 'panndike-draw-mode';
  const MAX_HISTORY = 150;

  let state = null;
  let selected = null;
  let history = [];
  let elapsedMs = 0;
  let runningSince = null;
  let hintMove = null;
  let hintTimer = 0;
  let pendingAction = null;
  let confirmReturnFocus = null;
  let pendingFocusKey = '';
  let winRecorded = false;
  let resizeTimer = 0;
  let stats = loadStats();

  function say(text) { ui.message.textContent = text; }
  function sfx(name) { if (window.GameAudio) window.GameAudio.play(name); }

  function randomSeed() {
    try {
      const values = new Uint32Array(2);
      crypto.getRandomValues(values);
      return `${values[0].toString(36)}-${values[1].toString(36)}`;
    } catch (_error) {
      return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
    }
  }

  function preferredDrawCount() {
    try { return localStorage.getItem(PREF_KEY) === '3' ? 3 : 1; }
    catch (_error) { return 1; }
  }

  function storeDrawPreference(value) {
    try { localStorage.setItem(PREF_KEY, String(E.normalizeDrawCount(value))); }
    catch (_error) { /* Speicher kann blockiert sein. */ }
  }

  function loadStats() {
    const fallback = { wins: 0, bestScore: 0, bestTimeMs: null, dailyStreak: 0, lastDailyWin: '' };
    try {
      const value = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
      if (!value || typeof value !== 'object') return fallback;
      return {
        wins: Number.isInteger(value.wins) && value.wins >= 0 ? Math.min(value.wins, 1000000) : 0,
        bestScore: Number.isFinite(value.bestScore) && value.bestScore >= 0 ? Math.floor(value.bestScore) : 0,
        bestTimeMs: Number.isFinite(value.bestTimeMs) && value.bestTimeMs >= 0 ? value.bestTimeMs : null,
        dailyStreak: Number.isInteger(value.dailyStreak) && value.dailyStreak >= 0 ? Math.min(value.dailyStreak, 100000) : 0,
        lastDailyWin: /^\d{4}-\d{2}-\d{2}$/.test(value.lastDailyWin || '') ? value.lastDailyWin : ''
      };
    } catch (_error) { return fallback; }
  }

  function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); }
    catch (_error) { /* Speicher kann blockiert sein. */ }
  }

  function currentElapsedMs() {
    return runningSince == null ? elapsedMs : elapsedMs + (Date.now() - runningSince);
  }

  function pauseClock() {
    if (runningSince != null) {
      elapsedMs += Date.now() - runningSince;
      runningSince = null;
    }
  }

  function resumeClock() {
    if (state && state.status === 'playing' && runningSince == null && !document.hidden) runningSince = Date.now();
  }

  function formatTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const seconds = totalSeconds % 60;
    if (hours) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function snapshot() {
    return { state: E.clone(state), elapsedMs: currentElapsedMs() };
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > MAX_HISTORY) history.shift();
  }

  function clearHint() {
    hintMove = null;
    if (hintTimer) window.clearTimeout(hintTimer);
    hintTimer = 0;
  }

  function saveGame() {
    if (!state) return;
    const payload = { version: 3, state, elapsedMs: currentElapsedMs(), winRecorded };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); }
    catch (_error) { /* Private Modi dürfen localStorage verweigern. */ }
  }

  function loadGame() {
    try {
      const payload = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!payload || payload.version !== 3 || !E.validateState(payload.state)) return false;
      state = payload.state;
      elapsedMs = Number.isFinite(payload.elapsedMs) && payload.elapsedMs >= 0 && payload.elapsedMs < 31536000000 ? payload.elapsedMs : 0;
      winRecorded = payload.winRecorded === true;
      selected = null;
      history = [];
      runningSince = null;
      ui.drawMode.value = String(state.drawCount);
      storeDrawPreference(state.drawCount);
      if (state.status === 'playing') resumeClock();
      skipFlip = true;
      render();
      skipFlip = false;
      say(state.status === 'won' ? 'Gelöste Partie wiederhergestellt.' : 'Laufende Partie wiederhergestellt.');
      if (state.status === 'won') showResult();
      return true;
    } catch (_error) {
      try { localStorage.removeItem(SAVE_KEY); } catch (_ignored) { /* leer */ }
      return false;
    }
  }

  function startGame(options) {
    pauseClock();
    clearHint();
    state = E.createState(options);
    selected = null;
    history = [];
    elapsedMs = 0;
    runningSince = null;
    winRecorded = false;
    pendingFocusKey = 'stock';
    ui.drawMode.value = String(state.drawCount);
    storeDrawPreference(state.drawCount);
    ui.confirm.hidden = true;
    ui.result.hidden = true;
    resumeClock();
    skipFlip = true;
    render();
    skipFlip = false;
    if (window.GameCards) GameCards.deal(ui.tableau);
    say(state.dealType === 'daily'
      ? `Tagesdeal ${dailyKeyForState(state)} gestartet. Viel Erfolg!`
      : 'Neue Partie: Wähle eine offene Karte oder ziehe vom Talon.');
    saveGame();
  }

  function todayKey(dateValue) {
    const date = dateValue || new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function dailyKeyForState(gameState) {
    const match = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(String(gameState && gameState.seed || ''));
    return match ? match[1] : todayKey();
  }

  function previousDayKey(dateKey) {
    const parts = String(dateKey).split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setDate(date.getDate() - 1);
    return todayKey(date);
  }

  function executeAction(action) {
    const drawCount = E.normalizeDrawCount(action.drawCount == null ? ui.drawMode.value : action.drawCount);
    if (action.kind === 'restart') {
      startGame({ seed: state.seed, dealType: state.dealType, drawCount });
    } else if (action.kind === 'daily') {
      startGame({ seed: E.dailySeed(new Date()), dealType: 'daily', drawCount });
    } else {
      startGame({ seed: randomSeed(), dealType: 'random', drawCount });
    }
  }

  function requestAction(action) {
    if (state && state.status === 'playing' && state.moves > 0) {
      pendingAction = action;
      confirmReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      ui.confirmText.textContent = action.kind === 'restart'
        ? 'Alle Züge dieser Partie werden verworfen und derselbe Deal wird neu ausgeteilt.'
        : 'Die aktuelle Partie wird durch einen neuen Deal ersetzt.';
      ui.confirm.hidden = false;
      return;
    }
    executeAction(action);
  }

  function sameSource(a, b) {
    return !!a && !!b && a.zone === b.zone && a.col === b.col && a.index === b.index && a.suit === b.suit;
  }

  function sourceFocusKey(source) {
    if (source.zone === 'waste') return 'waste';
    if (source.zone === 'foundation') return `foundation-${source.suit}`;
    const cards = E.sourceCards(state, source);
    return cards && cards.length ? `card-${cards[0].id}` : '';
  }

  function destinationFocusKey(destination) {
    if (destination.zone === 'foundation') return `foundation-${destination.suit}`;
    const column = state.tableau[destination.col];
    return column.length ? `card-${column[column.length - 1].id}` : `column-${destination.col}`;
  }

  function performMove(source, destination) {
    if (!source || !destination || state.status !== 'playing') return false;
    pushHistory();
    const result = E.move(state, source, destination);
    if (!result.ok) {
      history.pop();
      sfx('error');
      say('Dieser Zug ist nach den Klondike-Regeln nicht möglich.');
      return false;
    }
    selected = null;
    clearHint();
    pendingFocusKey = destinationFocusKey(destination);
    render();
    sfx(destination.zone === 'foundation' ? 'success' : (result.revealed ? 'flip' : 'place'));
    if (result.revealed) say('Zug ausgeführt und eine verdeckte Karte aufgedeckt.');
    else if (destination.zone === 'foundation') say('Karte auf das passende Fundament gelegt.');
    else say(result.cards > 1 ? `${result.cards} Karten als Folge verschoben.` : 'Karte verschoben.');
    if (result.won) finishWin();
    saveGame();
    return true;
  }

  function drawFromStock() {
    if (state.status !== 'playing') return;
    pushHistory();
    const result = E.draw(state);
    if (!result.ok) {
      history.pop();
      say('Talon und Ablage sind leer.');
      return;
    }
    selected = null;
    clearHint();
    pendingFocusKey = result.kind === 'draw' ? 'waste' : 'stock';
    sfx(result.kind === 'draw' ? 'flip' : 'shuffle');
    render();
    say(result.kind === 'draw'
      ? `${result.count} Karte${result.count === 1 ? '' : 'n'} aufgedeckt.`
      : 'Ablage umgedreht – der Talon ist wieder bereit.');
    saveGame();
  }

  function undo() {
    const previous = history.pop();
    if (!previous) { say('Noch kein Zug zum Rückgängigmachen.'); return; }
    pauseClock();
    sfx('undo');
    state = previous.state;
    elapsedMs = previous.elapsedMs;
    selected = null;
    clearHint();
    ui.result.hidden = true;
    ui.confirm.hidden = true;
    pendingFocusKey = 'undo';
    resumeClock();
    render();
    say('Letzten Zug rückgängig gemacht.');
    saveGame();
  }

  function tryAutoFoundation(source) {
    const cards = E.sourceCards(state, source);
    if (!cards || cards.length !== 1) return false;
    const card = cards[0];
    if (!E.canMoveToFoundation(state, source, card.suit)) {
      say('Diese Karte ist noch nicht für das Fundament bereit.');
      return false;
    }
    return performMove(source, { zone: 'foundation', suit: card.suit });
  }

  function runAutoFoundation() {
    if (state.status !== 'playing') return;
    pushHistory();
    const result = E.autoFoundation(state);
    if (!result.moved) {
      history.pop();
      say('Derzeit gibt es keinen sicheren Fundament-Zug.');
      return;
    }
    selected = null;
    clearHint();
    pendingFocusKey = 'auto';
    render();
    say(`${result.moved} sichere${result.moved === 1 ? 'r' : ''} Fundament-Zug${result.moved === 1 ? '' : 'e'} ausgeführt.`);
    if (result.won) finishWin();
    saveGame();
  }

  function describeHint(moveInfo) {
    if (moveInfo.kind === 'draw') return 'Ziehe eine Karte vom Talon.';
    if (moveInfo.kind === 'recycle') return 'Drehe die Ablage um und beginne den Talon erneut.';
    const cards = E.sourceCards(state, moveInfo.source);
    const card = cards && cards[0];
    const sourceName = E.cardName(card);
    if (moveInfo.destination.zone === 'foundation') return `Lege ${sourceName} auf das Fundament ${E.SUIT_NAMES[moveInfo.destination.suit]}.`;
    return `Verschiebe ${sourceName} in Tableau-Spalte ${moveInfo.destination.col + 1}.`;
  }

  function showHint() {
    if (state.status !== 'playing') return;
    clearHint();
    hintMove = E.findHint(state);
    if (!hintMove) {
      say('Kein legaler Zug gefunden. Nutze Rückgängig oder starte eine neue Partie.');
      return;
    }
    sfx('hint');
    say(`Hinweis: ${describeHint(hintMove)}`);
    render();
    hintTimer = window.setTimeout(() => { hintMove = null; hintTimer = 0; render(); }, 3600);
  }

  function chooseSource(source, event) {
    if (state.status !== 'playing') return;
    if (event && event.detail >= 2 && tryAutoFoundation(source)) return;

    if (selected) {
      if (sameSource(selected, source)) {
        selected = null;
        render();
        say('Auswahl aufgehoben.');
        return;
      }
      if (source.zone === 'tableau' && selected.zone !== 'tableau' || source.zone === 'tableau' && selected.col !== source.col) {
        if (performMove(selected, { zone: 'tableau', col: source.col })) return;
      }
      if (source.zone === 'foundation' && performMove(selected, { zone: 'foundation', suit: source.suit })) return;
    }

    const cards = E.sourceCards(state, source);
    if (!cards) {
      selected = null;
      render();
      say('Diese Karte kann nicht bewegt werden.');
      return;
    }
    selected = source;
    clearHint();
    pendingFocusKey = sourceFocusKey(source);
    render();
    say(cards.length > 1
      ? `${cards.length} Karten gewählt – tippe oder ziehe sie auf ein markiertes Ziel.`
      : `${E.cardName(cards[0])} gewählt – wähle ein markiertes Ziel.`);
  }

  function cardButton(card, source, top, zIndex) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `card${E.RED.has(card.suit) ? ' red' : ''}${card.faceUp ? '' : ' face-down'}`;
    button.style.top = `${top}px`;
    button.style.zIndex = String(zIndex);
    button.dataset.focusKey = `card-${card.id}`;
    button.dataset.cardId = String(card.id);
    button.setAttribute('aria-label', card.faceUp
      ? `${E.cardName(card)}, Tableau-Spalte ${source.col + 1}${E.sourceCards(state, source)?.length > 1 ? `, Folge mit ${E.sourceCards(state, source).length} Karten` : ''}`
      : 'Verdeckte Karte');
    GameCards.face(button, cardData(card));
    if (!card.faceUp) {
      button.disabled = true;
      return button;
    }
    if (selected && selected.zone === 'tableau' && selected.col === source.col && source.index >= selected.index) button.classList.add('selected');
    if (hintMove && hintMove.source && sameSource(hintMove.source, source)) button.classList.add('hinted');
    button.dataset.dragSource = 'tableau';
    button.dataset.col = String(source.col);
    button.dataset.index = String(source.index);
    button.addEventListener('click', event => chooseSource(source, event));
    button.addEventListener('keydown', event => navigateCards(event, source));
    return button;
  }

  function cardData(card) {
    return { id: card.id, rank: card.rank, suit: card.suit, label: E.RANK_NAMES[card.rank], faceDown: !card.faceUp };
  }

  function tableauGeometry() {
    const style = getComputedStyle(ui.tableau);
    const gap = Number.parseFloat(style.columnGap) || 3;
    const width = Math.max(210, ui.tableau.clientWidth || 700);
    const columnWidth = (width - gap * 6) / 7;
    const cardWidth = Math.min(88, Math.max(28, columnWidth - 2));
    const cardHeight = cardWidth / .72;
    return {
      cardHeight,
      downStep: Math.max(11, Math.min(27, cardHeight * .22)),
      upStep: Math.max(18, Math.min(38, cardHeight * .36))
    };
  }

  function renderTableau() {
    ui.tableau.replaceChildren();
    const geometry = tableauGeometry();
    const columns = [];
    let maximumBottom = 260;

    state.tableau.forEach((column, col) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'column';
      wrapper.dataset.col = String(col);
      wrapper.dataset.dropTableau = String(col);
      wrapper.dataset.focusKey = `column-${col}`;
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'button');
      wrapper.setAttribute('aria-label', `Tableau-Spalte ${col + 1}, ${column.length ? `${column.length} Karten` : 'leer, nimmt nur einen König auf'}`);
      if (selected && E.canMoveToTableau(state, selected, col)) wrapper.classList.add('legal-target');
      if (hintMove && hintMove.destination && hintMove.destination.zone === 'tableau' && hintMove.destination.col === col) wrapper.classList.add('hinted');

      let top = 0;
      column.forEach((card, index) => {
        const source = { zone: 'tableau', col, index };
        wrapper.appendChild(cardButton(card, source, top, index + 1));
        if (index < column.length - 1) top += card.faceUp ? geometry.upStep : geometry.downStep;
      });
      const bottom = column.length ? top + geometry.cardHeight + 8 : geometry.cardHeight + 8;
      maximumBottom = Math.max(maximumBottom, bottom);
      columns.push(wrapper);
      ui.tableau.appendChild(wrapper);
    });

    const height = Math.ceil(maximumBottom);
    ui.tableau.style.minHeight = `${height}px`;
    columns.forEach(column => { column.style.minHeight = `${height - 4}px`; });

    columns.forEach((wrapper, col) => {
      wrapper.addEventListener('click', event => {
        if (event.target === wrapper && selected) performMove(selected, { zone: 'tableau', col });
      });
      wrapper.addEventListener('keydown', event => {
        if (selected && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          performMove(selected, { zone: 'tableau', col });
        }
      });
    });
  }

  function renderFoundations() {
    ui.foundations.replaceChildren();
    for (const suit of E.SUITS) {
      const pile = state.foundations[suit];
      const card = pile[pile.length - 1];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `foundation${E.RED.has(suit) ? ' red' : ''}${card ? ' filled' : ''}`;
      button.dataset.dropFoundation = suit;
      button.dataset.focusKey = `foundation-${suit}`;
      if (card) {
        GameCards.face(button, cardData(card));
        button.dataset.dragSource = 'foundation';
        button.dataset.suit = suit;
      } else {
        GameCards.clear(button);
        button.textContent = E.SYMBOLS[suit];
      }
      button.setAttribute('aria-label', card
        ? `Fundament ${E.SUIT_NAMES[suit]}, oben ${E.cardName(card)}. Aktivieren zum Auswählen oder Ablegen.`
        : `Leeres Fundament ${E.SUIT_NAMES[suit]}`);
      if (selected && E.canMoveToFoundation(state, selected, suit)) button.classList.add('legal-target');
      if (selected && selected.zone === 'foundation' && selected.suit === suit) button.classList.add('selected');
      if (hintMove && hintMove.destination && hintMove.destination.zone === 'foundation' && hintMove.destination.suit === suit) button.classList.add('hinted');
      if (hintMove && hintMove.source && hintMove.source.zone === 'foundation' && hintMove.source.suit === suit) button.classList.add('hinted');
      button.addEventListener('click', event => {
        if (selected && !sameSource(selected, { zone: 'foundation', suit })) {
          if (performMove(selected, { zone: 'foundation', suit })) return;
        }
        chooseSource({ zone: 'foundation', suit }, event);
      });
      ui.foundations.appendChild(button);
    }
  }

  function renderWaste() {
    ui.waste.replaceChildren();
    ui.waste.className = `pile waste${state.waste.length ? '' : ' empty'}${selected && selected.zone === 'waste' ? ' selected' : ''}`;
    ui.waste.dataset.focusKey = 'waste';
    const visibleCount = Math.min(state.drawCount, state.waste.length, 3);
    const visible = state.waste.slice(-visibleCount);
    visible.forEach((card, index) => {
      const face = document.createElement('span');
      const preview = visible.length - index - 1;
      face.className = `waste-card${preview ? ` preview-${preview}` : ''}`;
      face.setAttribute('aria-hidden', 'true');
      // Nur die oberste Ablagekarte trägt die Karten-ID (für Flug-Animationen).
      GameCards.face(face, Object.assign(cardData(card), { id: preview ? null : card.id }));
      ui.waste.appendChild(face);
    });
    const top = state.waste[state.waste.length - 1];
    if (top) ui.waste.dataset.dragSource = 'waste'; else delete ui.waste.dataset.dragSource;
    ui.waste.disabled = !top || state.status !== 'playing';
    ui.waste.setAttribute('aria-label', top ? `Ablage, oben ${E.cardName(top)}. Aktivieren zum Auswählen.` : 'Ablage ist leer');
    ui.waste.classList.toggle('hinted', !!(hintMove && hintMove.source && hintMove.source.zone === 'waste'));
  }

  function renderStock() {
    const hasStock = state.stock.length > 0;
    const recyclable = !hasStock && state.waste.length > 0;
    ui.stock.className = `pile stock${hasStock ? ' pc-card pc-back' : ' empty'}`;
    ui.stock.dataset.focusKey = 'stock';
    ui.stock.disabled = state.status !== 'playing' || (!hasStock && !recyclable);
    ui.stockCount.textContent = hasStock ? String(state.stock.length) : recyclable ? '↻' : '0';
    ui.stock.setAttribute('aria-label', hasStock
      ? `Talon mit ${state.stock.length} Karten. ${state.drawCount} Karte${state.drawCount === 1 ? '' : 'n'} ziehen.`
      : recyclable ? `Talon leer. Ablage mit ${state.waste.length} Karten umdrehen.` : 'Talon und Ablage leer');
    ui.stock.classList.toggle('hinted', !!(hintMove && hintMove.source && hintMove.source.zone === 'stock'));
  }

  // Jedes Rendering läuft als FLIP-Animation: Karten fliegen sichtbar an ihren neuen Platz.
  let flipOverrides = null;
  let skipFlip = false;
  function render() {
    if (!state) return;
    if (skipFlip || !window.GameCards) { renderNow(); return; }
    const overrides = flipOverrides;
    flipOverrides = null;
    GameCards.flip(ui.table, renderNow, { overrides });
  }

  function renderNow() {
    if (!state) return;
    const active = document.activeElement;
    const activeKey = active && active.dataset ? active.dataset.focusKey : '';

    ui.moves.textContent = String(state.moves);
    ui.score.textContent = String(state.score);
    ui.time.textContent = formatTime(currentElapsedMs());
    ui.foundationCount.textContent = `${E.foundationCount(state)} / 52`;
    ui.drawLabel.textContent = `Zieh ${state.drawCount}`;
    ui.dealCode.textContent = state.dealType === 'daily' ? `☀ ${dailyKeyForState(state).slice(5)}` : E.dealCode(state);
    ui.dealCode.title = `Deal-Code ${E.dealCode(state)}`;
    ui.drawMode.value = String(state.drawCount);
    ui.drawMode.disabled = state.moves > 0 || state.status !== 'playing';
    ui.undo.disabled = history.length === 0;
    ui.hint.disabled = state.status !== 'playing';
    ui.auto.disabled = state.status !== 'playing';

    renderStock();
    renderWaste();
    renderFoundations();
    renderTableau();

    const key = pendingFocusKey || activeKey;
    pendingFocusKey = '';
    if (key) document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }

  function finishWin() {
    pauseClock();
    sfx('win');
    if (window.GameFX) window.GameFX.celebrate();
    if (!winRecorded) {
      const total = currentElapsedMs();
      stats.wins += 1;
      stats.bestScore = Math.max(stats.bestScore, state.score);
      if (stats.bestTimeMs == null || total < stats.bestTimeMs) stats.bestTimeMs = total;
      if (state.dealType === 'daily') {
        const dealDay = dailyKeyForState(state);
        // Ein wiederhergestelltes älteres Tagesdeal darf eine neuere Serie nicht zurückdatieren.
        if ((!stats.lastDailyWin || dealDay > stats.lastDailyWin) && stats.lastDailyWin !== dealDay) {
          stats.dailyStreak = stats.lastDailyWin === previousDayKey(dealDay) ? stats.dailyStreak + 1 : 1;
          stats.lastDailyWin = dealDay;
        }
      }
      winRecorded = true;
      saveStats();
    }
    showResult();
    saveGame();
  }

  function showResult() {
    ui.resultText.textContent = `Gelöst in ${state.moves} Zügen, ${formatTime(currentElapsedMs())} und mit ${state.score} Punkten.`;
    ui.bestScore.textContent = String(stats.bestScore);
    ui.wins.textContent = String(stats.wins);
    ui.streak.textContent = String(stats.dailyStreak);
    ui.resultUndo.disabled = history.length === 0;
    ui.result.hidden = false;
  }

  function navigateCards(event, source) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    let col = source.col;
    let index = source.index;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const step = event.key === 'ArrowLeft' ? -1 : 1;
      for (let next = col + step; next >= 0 && next < 7; next += step) {
        const column = state.tableau[next];
        if (!column.length) continue;
        let targetIndex = Math.min(index, column.length - 1);
        while (targetIndex >= 0 && !column[targetIndex].faceUp) targetIndex -= 1;
        if (targetIndex >= 0) { document.querySelector(`[data-focus-key="card-${column[targetIndex].id}"]`)?.focus(); return; }
      }
      return;
    }
    const column = state.tableau[col];
    const step = event.key === 'ArrowUp' ? -1 : 1;
    for (let next = index + step; next >= 0 && next < column.length; next += step) {
      if (column[next].faceUp) { document.querySelector(`[data-focus-key="card-${column[next].id}"]`)?.focus(); return; }
    }
  }

  // Drag & Drop mit Kartenvorschau (Maus, Stift, Touch) über das gemeinsame Kartenmodul.
  // Antippen-und-Ziel-wählen bleibt parallel verfügbar.
  function dragSourceFor(element) {
    const kind = element.dataset.dragSource;
    if (kind === 'tableau') return { zone: 'tableau', col: Number(element.dataset.col), index: Number(element.dataset.index) };
    if (kind === 'waste') return { zone: 'waste' };
    if (kind === 'foundation') return { zone: 'foundation', suit: element.dataset.suit };
    return null;
  }
  function dropDestination(target) {
    if (target.dataset.dropTableau != null) return { zone: 'tableau', col: Number(target.dataset.dropTableau) };
    if (target.dataset.dropFoundation) return { zone: 'foundation', suit: target.dataset.dropFoundation };
    return null;
  }
  if (window.GameCards) {
    GameCards.makeDraggable({
      root: ui.table,
      cardSelector: '[data-drag-source]',
      targetSelector: '[data-drop-tableau], [data-drop-foundation]',
      start(element) {
        if (!state || state.status !== 'playing') return null;
        const source = dragSourceFor(element);
        return source && E.sourceCards(state, source) ? source : null;
      },
      cards(source) { return (E.sourceCards(state, source) || []).map(cardData); },
      sourceElements(source) {
        const cards = E.sourceCards(state, source) || [];
        if (source.zone === 'waste') return [ui.waste];
        if (source.zone === 'foundation') return [document.querySelector(`[data-focus-key="foundation-${source.suit}"]`)].filter(Boolean);
        return cards.map(card => ui.tableau.querySelector(`[data-card-id="${card.id}"]`)).filter(Boolean);
      },
      canDrop(source, target) {
        const destination = dropDestination(target);
        if (!destination) return false;
        if (destination.zone === 'tableau') return !(source.zone === 'tableau' && source.col === destination.col) && E.canMoveToTableau(state, source, destination.col);
        return E.canMoveToFoundation(state, source, destination.suit);
      },
      onStart(source) {
        if (selected && !sameSource(selected, source)) { selected = null; render(); }
      },
      drop(source, target, ghostRects) {
        const destination = dropDestination(target);
        if (!destination) return false;
        flipOverrides = ghostRects;
        const ok = performMove(source, destination);
        flipOverrides = null;
        return ok;
      },
      cancel(source, hadTarget) { if (!hadTarget) say('Karte losgelassen – kein Ziel gewählt.'); }
    });
  }

  ui.stock.addEventListener('click', drawFromStock);
  ui.waste.addEventListener('click', event => chooseSource({ zone: 'waste' }, event));
  ui.undo.addEventListener('click', undo);
  ui.hint.addEventListener('click', showHint);
  ui.auto.addEventListener('click', runAutoFoundation);
  ui.restart.addEventListener('click', () => requestAction({ kind: 'restart', drawCount: state.drawCount }));
  ui.newGame.addEventListener('click', () => requestAction({ kind: 'random', drawCount: ui.drawMode.value }));
  ui.daily.addEventListener('click', () => requestAction({ kind: 'daily', drawCount: ui.drawMode.value }));
  ui.drawMode.addEventListener('change', () => {
    const drawCount = E.normalizeDrawCount(ui.drawMode.value);
    storeDrawPreference(drawCount);
    startGame({ seed: state.seed, dealType: state.dealType, drawCount });
    say(`Partie mit Zieh-${drawCount}-Regel neu ausgeteilt.`);
  });

  function closeConfirm() {
    pendingAction = null;
    ui.confirm.hidden = true;
    if (confirmReturnFocus && confirmReturnFocus.isConnected) confirmReturnFocus.focus({ preventScroll: true });
    confirmReturnFocus = null;
  }

  ui.confirmCancel.addEventListener('click', closeConfirm);
  ui.confirmOk.addEventListener('click', () => {
    const action = pendingAction;
    pendingAction = null;
    confirmReturnFocus = null;
    ui.confirm.hidden = true;
    if (action) executeAction(action);
  });
  ui.resultNew.addEventListener('click', () => executeAction({ kind: 'random', drawCount: state.drawCount }));
  ui.resultDaily.addEventListener('click', () => executeAction({ kind: 'daily', drawCount: state.drawCount }));
  ui.resultUndo.addEventListener('click', undo);

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderNow, 100);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pauseClock(); saveGame(); }
    else { resumeClock(); render(); }
  });
  window.addEventListener('pagehide', () => { pauseClock(); saveGame(); });

  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (!ui.confirm.hidden || !ui.result.hidden) {
      if (key === 'escape' && !ui.confirm.hidden) { event.preventDefault(); closeConfirm(); }
      return;
    }
    if (event.target instanceof Element && event.target.matches('input, select, textarea, button, a')) return;
    if (key === 'escape') {
      if (selected) { selected = null; render(); say('Auswahl aufgehoben.'); }
      return;
    }
    if (key === 'u') { event.preventDefault(); undo(); }
    else if (key === 'h') { event.preventDefault(); showHint(); }
    else if (key === 'a') { event.preventDefault(); runAutoFoundation(); }
    else if (key === 'r') { event.preventDefault(); requestAction({ kind: 'restart', drawCount: state.drawCount }); }
    else if (key === 'n') { event.preventDefault(); requestAction({ kind: 'random', drawCount: state.drawCount }); }
    else if (key === 'd') { event.preventDefault(); drawFromStock(); }
  });

  window.setInterval(() => {
    if (state && state.status === 'playing') ui.time.textContent = formatTime(currentElapsedMs());
  }, 250);

  window.Panndike = {
    getState: () => ({
      ...E.clone(state),
      ended: state.status === 'won',
      selected: selected ? { ...selected } : null,
      elapsedMs: currentElapsedMs(),
      historyLength: history.length
    }),
    newGame: options => startGame(typeof options === 'object' && options ? options : { seed: randomSeed(), drawCount: preferredDrawCount(), dealType: 'random' }),
    restart: () => startGame({ seed: state.seed, drawCount: state.drawCount, dealType: state.dealType }),
    hint: () => E.findHint(state),
    engine: E
  };

  if (!loadGame()) startGame({ seed: randomSeed(), drawCount: preferredDrawCount(), dealType: 'random' });
})();
