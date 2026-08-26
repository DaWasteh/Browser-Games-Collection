/* === Pandataire — Controller & Ansicht ===
   Verbindet die DOM-freie Engine (PandataireEngine) mit den Regelsätzen
   (PandataireRulesets): Moduswahl, Rendering, Eingabe (Maus/Touch/Tastatur),
   Undo, Neustart, Timer und HUD. Framework-frei, semantisch, touch-freundlich. */
(function () {
  'use strict';
  var E = window.PandataireEngine;
  var R = window.PandataireRulesets;
  var $ = function (id) { return document.getElementById(id); };

  var SUITS = E.SUITS;
  var NAMES = E.NAMES;
  var MODE_KEY = 'pandataire-mode';
  var MODES = R.order; // ['tripeaks','golf','pyramid']

  var mode = readMode();
  var ruleset = R.get(mode);
  var seed = 0;
  var state = null;
  var initialDeal = null;
  var history = [];
  var timer = 0; // bisher aktiv gespielte Sekunden
  var started = 0; // Start des aktuellen aktiven Abschnitts
  var intervalId = 0;

  function currentTimer() {
    return started ? timer + Math.floor((Date.now() - started) / 1000) : timer;
  }
  function pauseClock() {
    if (started) { timer = currentTimer(); started = 0; }
  }
  function resumeClock() {
    if (state && state.status === 'playing' && !started && !document.hidden) started = Date.now();
  }

  function readMode() {
    try {
      var saved = window.localStorage.getItem(MODE_KEY);
      if (saved && R.all[saved]) return saved;
    } catch (_e) { /* Speicher nicht verfügbar */ }
    return 'tripeaks';
  }

  function persistMode() {
    try { window.localStorage.setItem(MODE_KEY, mode); } catch (_e) { /* Speicher nicht verfügbar */ }
  }

  function randomSeed() {
    return (Math.floor(Math.random() * 0x10000000)) + 1;
  }

  function newGame(modeOpt, seedOpt) {
    if (modeOpt && R.all[modeOpt] && modeOpt !== mode) {
      mode = modeOpt;
      ruleset = R.get(mode);
      persistMode();
      syncModeButtons();
    }
    seed = (typeof seedOpt === 'number' && seedOpt > 0) ? (seedOpt >>> 0) : randomSeed();
    var deal = ruleset.deal(E.rng(seed));
    initialDeal = deal;
    state = E.createState(mode, seed, deal);
    history = [];
    timer = 0;
    started = Date.now();
    setStatus('playing');
    hideResult();
    render();
    announce(modeIntro());
  }

  function restart() {
    if (!initialDeal) { newGame(); return; }
    state = E.createState(mode, seed, initialDeal);
    history = [];
    timer = 0;
    started = Date.now();
    setStatus('playing');
    hideResult();
    render();
    announce('Runde neu gestartet – gleiche Austeilung.');
  }

  function setStatus(value) { state.status = value; }

  function pushHistory() { history.push({ state: E.snapshot(state), timer: currentTimer() }); }

  function undo() {
    if (!history.length) return;
    pauseClock();
    var snap = history.pop();
    E.restore(state, snap.state);
    timer = snap.timer;
    started = 0;
    hideResult();
    resumeClock();
    render();
    announce('Letzten Zug rückgängig gemacht.');
  }

  // --- Eingabe: einzelne Karte -------------------------------------------
  function cardClick(id) {
    if (state.status !== 'playing') return;
    var card = state.cards[id];
    if (!E.isFree(state, ruleset, id)) return;
    if (ruleset.playStyle === 'single') {
      var top = E.wasteTop(state);
      if (!top) return;
      if (!E.legal(card.rank, top.rank)) {
        announce(NAMES[card.rank] + ' passt nicht auf ' + NAMES[top.rank] + '.');
        return;
      }
      pushHistory();
      E.applyMove(state, ruleset, { type: 'play', id: id });
      announce(state.streak > 1 ? 'Serie ' + state.streak + '! Weiter so.' : 'Guter Zug.');
      render();
      checkEnd();
      return;
    }
    // Pyramid: Paar-Auswahl
    if (card.rank === 13) {
      pushHistory();
      E.applyMove(state, ruleset, { type: 'king', id: id });
      announce('König allein entfernt.');
      render();
      checkEnd();
      return;
    }
    if (state.selectedId === null) {
      state.selectedId = id;
      render();
      announce(NAMES[card.rank] + ' gewählt. Wähle eine Karte mit Summe 13.');
      return;
    }
    if (state.selectedId === id) {
      state.selectedId = null;
      render();
      announce('Auswahl aufgehoben.');
      return;
    }
    var other = state.cards[state.selectedId];
    if (E.sumsTo13(other.rank, card.rank)) {
      pushHistory();
      var sel = state.selectedId;
      E.applyMove(state, ruleset, { type: 'pairCards', a: sel, b: id });
      announce('Paar entfernt.');
      render();
      checkEnd();
      return;
    }
    // keine gültige Paarung -> neu wählen
    state.selectedId = id;
    render();
    announce(NAMES[card.rank] + ' gewählt. Summe mit ' + NAMES[other.rank] + ' ist nicht 13.');
  }

  function wasteClick() {
    if (state.status !== 'playing' || ruleset.playStyle !== 'pair') return;
    if (state.selectedId === null) return;
    var top = E.wasteTop(state);
    if (!top) return;
    var card = state.cards[state.selectedId];
    if (!E.isFree(state, ruleset, state.selectedId)) { state.selectedId = null; render(); return; }
    if (!E.sumsTo13(card.rank, top.rank)) {
      announce(NAMES[card.rank] + ' und Ablage ' + NAMES[top.rank] + ' summieren nicht auf 13.');
      return;
    }
    pushHistory();
    var sel = state.selectedId;
    E.applyMove(state, ruleset, { type: 'pairWaste', id: sel });
    announce('Paar mit Ablage entfernt.');
    render();
    checkEnd();
  }

  function stockClick() {
    if (state.status !== 'playing') return;
    if (state.stock.length) {
      pushHistory();
      E.applyMove(state, ruleset, { type: 'draw' });
      render();
      announce('Gezogen: ' + NAMES[E.wasteTop(state).rank] + '.');
      checkEnd();
      return;
    }
    if (ruleset.maxRecycles > 0 && state.recyclesUsed < ruleset.maxRecycles && state.waste.length) {
      pushHistory();
      E.applyMove(state, ruleset, { type: 'recycle' });
      render();
      announce('Ablage zurück in den Talon umgelagert.');
      checkEnd();
    }
  }

  function checkEnd() {
    if (E.isSolved(state)) {
      setStatus('won');
      pauseClock();
      render();
      finish();
      return;
    }
    if (E.isLost(state, ruleset)) {
      setStatus('lost');
      pauseClock();
      render();
      finish();
    }
  }

  // --- Rendering ----------------------------------------------------------
  function cardLabel(card) {
    var free = E.isFree(state, ruleset, card.id);
    if (card.removed) return 'Entfernte Karte';
    if (mode === 'tripeaks' && !free) return 'Verdeckte TriPeaks-Karte';
    return NAMES[card.rank] + SUITS[card.suit] + (free ? ' – frei' : ' – blockiert');
  }

  function render() {
    var tableau = $('tableau');
    if (tableau.children.length !== state.cards.length) {
      tableau.replaceChildren();
      state.cards.forEach(function (card) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'card';
        btn.dataset.id = String(card.id);
        btn.addEventListener('click', function () { cardClick(card.id); });
        tableau.append(btn);
      });
    }
    state.cards.forEach(function (card) {
      var btn = tableau.children[card.id];
      var pos = ruleset.layout(card.id);
      btn.style.left = pos.left + '%';
      btn.style.top = pos.top + '%';
      var red = card.suit === 1 || card.suit === 2;
      var free = E.isFree(state, ruleset, card.id);
      var faceDown = mode === 'tripeaks' && !card.removed && !free;
      var cls = 'card' + (red ? ' red' : '') + (card.removed ? ' removed' : '') +
        (!card.removed && !free ? ' covered' : '') + (faceDown ? ' face-down' : '') +
        (state.selectedId === card.id ? ' selected' : '');
      btn.className = cls;
      btn.disabled = card.removed || !free || state.status !== 'playing';
      btn.setAttribute('aria-label', cardLabel(card));
      btn.setAttribute('aria-pressed', state.selectedId === card.id ? 'true' : 'false');
      btn.replaceChildren();
      if (!card.removed && !faceDown) {
        var r = document.createElement('span');
        r.className = 'rank';
        r.textContent = NAMES[card.rank];
        var s = document.createElement('span');
        s.className = 'suit';
        s.textContent = SUITS[card.suit];
        btn.append(r, s);
      }
    });

    var w = $('waste');
    w.replaceChildren();
    var top = E.wasteTop(state);
    var pyramid = ruleset.playStyle === 'pair';
    if (top) {
      var wr = document.createElement('span');
      wr.className = 'rank';
      wr.textContent = NAMES[top.rank];
      var ws = document.createElement('span');
      ws.className = 'suit';
      ws.textContent = SUITS[top.suit];
      w.append(wr, ws);
      w.className = 'pile waste' + ((top.suit === 1 || top.suit === 2) ? ' red' : '');
      w.setAttribute('aria-label', 'Ablage: ' + NAMES[top.rank] + SUITS[top.suit] +
        (pyramid && state.selectedId !== null ? ' – antippen zum Paaren' : ''));
    } else {
      w.className = 'pile waste empty';
      w.setAttribute('aria-label', 'Ablage leer');
    }
    w.disabled = !pyramid || !top || state.status !== 'playing';

    var stockBtn = $('talon');
    var canRecycle = pyramid && !state.stock.length && state.recyclesUsed < ruleset.maxRecycles && state.waste.length;
    $('talon-count').textContent = canRecycle ? '↻' : String(state.stock.length);
    stockBtn.disabled = !state.stock.length && !canRecycle || state.status !== 'playing';
    stockBtn.setAttribute('aria-label',
      state.stock.length ? 'Nächste Karte vom Talon ziehen' :
      (canRecycle ? 'Ablage zurück in den Talon umlagern' : 'Talon leer'));

    $('moves').textContent = String(state.moves);
    $('streak').textContent = String(state.streak);
    $('remaining').textContent = String(state.cards.filter(function (c) { return !c.removed; }).length);
    $('undo').disabled = history.length === 0;
    updateRecycleLabel();
  }

  function updateRecycleLabel() {
    var cell = $('recycle-cell');
    if (!cell) return;
    if (ruleset.maxRecycles > 0) {
      cell.style.display = '';
      $('recycle').textContent = state.recyclesUsed + '/' + ruleset.maxRecycles;
    } else {
      cell.style.display = 'none';
    }
  }

  function announce(text) { $('message').textContent = text; }

  function modeIntro() {
    if (mode === 'tripeaks') return 'TriPeaks: Räume die drei Gipfel ab – eine freie Karte mit Rang ±1.';
    if (mode === 'golf') return 'Golf: Spiele die freien Spaltenböden – Rang ±1, Ass und König benachbart.';
    return 'Pyramid: Entferne Paare mit Rangsumme 13 (König allein).';
  }

  function finish() {
    $('result-title').textContent = state.status === 'won' ? ruleset.name + ' geschafft!' : 'Runde beendet';
    $('result-text').textContent =
      (state.status === 'won' ? 'Alle Karten sind abgeräumt.' : 'Kein gültiger Zug mehr möglich.') +
      ' Züge: ' + state.moves + ' · Zeit: ' + formatTime(timer) + '.';
    showResult();
  }

  function showResult() {
    $('result').hidden = false;
    window.setTimeout(function () { $('result-button').focus({ preventScroll: true }); }, 0);
  }
  function hideResult() { $('result').hidden = true; }

  function formatTime(sec) {
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }

  function syncModeButtons() {
    MODES.forEach(function (m) {
      var btn = $('mode-' + m);
      if (btn) {
        btn.setAttribute('aria-pressed', m === mode ? 'true' : 'false');
        btn.className = 'mode-btn' + (m === mode ? ' active' : '');
      }
    });
  }

  function setMode(next) {
    if (!R.all[next] || next === mode) return;
    newGame(next);
  }

  // --- Event-Wiring -------------------------------------------------------
  MODES.forEach(function (m) {
    var btn = $('mode-' + m);
    if (btn) btn.addEventListener('click', function () { setMode(m); });
  });
  $('talon').addEventListener('click', stockClick);
  $('waste').addEventListener('click', wasteClick);
  $('undo').addEventListener('click', undo);
  $('restart').addEventListener('click', restart);
  $('new-game').addEventListener('click', function () { newGame(); });
  $('result-undo').addEventListener('click', undo);
  $('result-button').addEventListener('click', function () { newGame(); });

  document.addEventListener('keydown', function (e) {
    var target = e.target;
    if (target && typeof target.matches === 'function') {
      if (target.matches('input,select,textarea')) return;
      if (target.matches('button,a,summary') && (e.key === ' ' || e.key === 'Enter')) return;
    }
    var key = e.key.toLowerCase();
    if (key === 'u') { e.preventDefault(); undo(); }
    else if (key === 'r') { e.preventDefault(); restart(); }
    else if (key === 'n') { e.preventDefault(); newGame(); }
    else if (key === 'd') { e.preventDefault(); stockClick(); }
    else if (key === '1') { e.preventDefault(); setMode('tripeaks'); }
    else if (key === '2') { e.preventDefault(); setMode('golf'); }
    else if (key === '3') { e.preventDefault(); setMode('pyramid'); }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pauseClock();
    else resumeClock();
  });
  window.addEventListener('pagehide', pauseClock);
  window.addEventListener('pageshow', resumeClock);

  intervalId = window.setInterval(function () {
    if (state && state.status === 'playing') $('time').textContent = formatTime(currentTimer());
  }, 1000);

  newGame();
  syncModeButtons();

  window.Pandataire = {
    MODES: MODES,
    getMode: function () { return mode; },
    getState: function () {
      return {
        mode: mode,
        seed: seed,
        cards: state.cards.map(function (c) { return { id: c.id, rank: c.rank, suit: c.suit, removed: c.removed }; }),
        stock: state.stock.map(function (c) { return { rank: c.rank, suit: c.suit }; }),
        waste: state.waste.map(function (c) { return { rank: c.rank, suit: c.suit }; }),
        moves: state.moves,
        streak: state.streak,
        status: state.status,
        selectedId: state.selectedId,
        recyclesUsed: state.recyclesUsed,
        elapsed: currentTimer()
      };
    },
    setMode: setMode,
    newGame: newGame,
    restart: restart,
    undo: undo,
    draw: stockClick,
    selectCard: cardClick
  };
})();
