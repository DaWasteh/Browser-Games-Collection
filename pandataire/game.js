/* === Pandataire — Controller & Ansicht ===
   Verbindet die DOM-freie Engine (PandataireEngine) mit den Regelsätzen
   (PandataireRulesets): Moduswahl, Rendering, Eingabe (Maus/Touch/Tastatur),
   Undo, Neustart, Timer, Punktestand und HUD. */
(function () {
  'use strict';
  var E = window.PandataireEngine;
  var R = window.PandataireRulesets;
  var $ = function (id) { return document.getElementById(id); };

  var SUITS = E.SUITS;
  var NAMES = E.NAMES;
  var MODE_KEY = 'pandataire-mode';
  var STATS_KEY = 'pandataire-stats-v1';
  var MODES = R.order; // ['tripeaks','golf','pyramid']
  var ANIM_CLASSES = ['pc-flying', 'pc-flying-settle', 'pc-deal-in', 'pc-appear', 'pc-reveal', 'pc-drag-source'];

  var mode = readMode();
  var ruleset = R.get(mode);
  var seed = 0;
  var state = null;
  var initialDeal = null;
  var history = [];
  var elapsedMs = 0; // aktiv gespielte Millisekunden (kein Abrunden bei Pause)
  var started = 0; // Zeitstempel des laufenden Abschnitts
  var intervalId = 0;
  var score = 0;
  var bestRunStreak = 0;
  var selectedWaste = false;
  var stats = loadStats();

  function defaultModeStats() {
    return { wins: 0, bestScore: 0, bestStreak: 0, bestTimeSec: null };
  }

  function loadStats() {
    var base = { tripeaks: defaultModeStats(), golf: defaultModeStats(), pyramid: defaultModeStats() };
    try {
      var raw = window.localStorage.getItem(STATS_KEY);
      if (!raw) return base;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      MODES.forEach(function (m) {
        var entry = parsed[m];
        if (!entry || typeof entry !== 'object') return;
        base[m] = {
          wins: Math.max(0, Number(entry.wins) || 0),
          bestScore: Math.max(0, Number(entry.bestScore) || 0),
          bestStreak: Math.max(0, Number(entry.bestStreak) || 0),
          bestTimeSec: Number.isFinite(Number(entry.bestTimeSec)) && Number(entry.bestTimeSec) >= 0 ? Math.round(Number(entry.bestTimeSec)) : null
        };
      });
    } catch (_e) { /* Speicher optional */ }
    return base;
  }

  function saveStats() {
    try { window.localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (_e) { /* Speicher optional */ }
  }

  function totalWins() {
    return MODES.reduce(function (sum, m) { return sum + (stats[m].wins || 0); }, 0);
  }

  function overallBestScore() {
    return MODES.reduce(function (best, m) { return Math.max(best, stats[m].bestScore || 0); }, 0);
  }

  function overallBestTime() {
    var times = MODES.map(function (m) { return stats[m].bestTimeSec; }).filter(function (v) { return v != null; });
    return times.length ? Math.min.apply(null, times) : null;
  }

  function syncSharedScores() {
    if (!window.GameScores) return;
    var best = overallBestScore();
    var wins = totalWins();
    var bestTime = overallBestTime();
    if (!best && !wins) return;
    window.GameScores.sync('pandataire', {
      score: best || undefined,
      timeSec: bestTime != null ? bestTime : undefined,
      label: buildScoreLabel(best, wins)
    });
  }

  function buildScoreLabel(bestScore, wins) {
    var parts = [];
    if (bestScore > 0) parts.push('Bestwert ' + bestScore.toLocaleString('de-DE'));
    if (wins > 0) parts.push(wins + (wins === 1 ? ' Sieg' : ' Siege'));
    return parts.join(' · ');
  }

  function currentTimerMs() {
    return started ? elapsedMs + (Date.now() - started) : elapsedMs;
  }
  function currentTimer() {
    return Math.floor(currentTimerMs() / 1000);
  }
  function pauseClock() {
    if (started) { elapsedMs += Date.now() - started; started = 0; }
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

  function setClassesPreservingAnim(el, baseClasses) {
    var kept = ANIM_CLASSES.filter(function (c) { return el.classList.contains(c); });
    el.className = kept.length ? baseClasses + ' ' + kept.join(' ') : baseClasses;
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
    elapsedMs = 0;
    started = document.hidden ? 0 : Date.now();
    score = 0;
    bestRunStreak = 0;
    selectedWaste = false;
    setStatus('playing');
    hideResult();
    resetWasteOrigins();
    renderFresh();
    announce(modeIntro());
  }

  function restart() {
    if (!initialDeal) { newGame(); return; }
    state = E.createState(mode, seed, initialDeal);
    history = [];
    elapsedMs = 0;
    started = document.hidden ? 0 : Date.now();
    score = 0;
    bestRunStreak = 0;
    selectedWaste = false;
    setStatus('playing');
    hideResult();
    resetWasteOrigins();
    renderFresh();
    announce('Runde neu gestartet – gleiche Austeilung.');
  }

  // Neuer Deal: ohne Flug-Animation rendern, danach gestaffelt einblenden.
  function renderFresh() {
    skipFlip = true;
    render();
    skipFlip = false;
    if (window.GameCards) GameCards.deal($('tableau'));
  }

  function setStatus(value) { state.status = value; }

  function pushHistory() {
    history.push({
      state: E.snapshot(state),
      score: score,
      bestRunStreak: bestRunStreak,
      wasteOrigins: wasteOrigins.slice(),
      drawCounter: drawCounter
    });
    if (history.length > 200) history.shift();
  }

  function undo() {
    if (!history.length) return;
    pauseClock();
    var snap = history.pop();
    sfx('undo');
    E.restore(state, snap.state);
    score = snap.score;
    bestRunStreak = snap.bestRunStreak;
    wasteOrigins = snap.wasteOrigins.slice();
    drawCounter = snap.drawCounter;
    selectedWaste = false;
    hideResult();
    resumeClock();
    render();
    announce('Letzten Zug rückgängig gemacht.');
  }

  // --- Herkunft der Ablagekarten (für Flug-Animationen) --------------------
  // Parallel zu state.waste: 't<id>' für Tableau-Karten, 's<n>' für gezogene Karten.
  var wasteOrigins = [];
  var drawCounter = 0;
  function resetWasteOrigins() {
    wasteOrigins = state.waste.map(function (_c, i) { return 's' + i; });
    drawCounter = state.waste.length;
  }
  function wasteTopKey() { return wasteOrigins.length ? wasteOrigins[wasteOrigins.length - 1] : null; }

  function awardMovePoints(basePoints) {
    var bonus = Math.max(0, state.streak - 1) * 50;
    score += basePoints + bonus;
    if (state.streak > bestRunStreak) bestRunStreak = state.streak;
  }

  // --- Züge (gemeinsam für Antippen und Ziehen) ------------------------------
  function playSingle(id) {
    var card = state.cards[id];
    var top = E.wasteTop(state);
    if (!top || !E.isFree(state, ruleset, id)) return false;
    if (!E.legal(card.rank, top.rank)) {
      sfx('error');
      announce(NAMES[card.rank] + ' passt nicht auf ' + NAMES[top.rank] + '.');
      return false;
    }
    pushHistory();
    E.applyMove(state, ruleset, { type: 'play', id: id });
    awardMovePoints(100);
    wasteOrigins.push('t' + id);
    sfx('place');
    announce(state.streak > 1 ? 'Serie ' + state.streak + '! Weiter so.' : 'Guter Zug.');
    render();
    checkEnd();
    return true;
  }

  function removeKing(id) {
    pushHistory();
    E.applyMove(state, ruleset, { type: 'king', id: id });
    awardMovePoints(150);
    selectedWaste = false;
    sfx('success');
    announce('König allein entfernt.');
    render();
    checkEnd();
    return true;
  }

  function pairCards(a, b) {
    if (!E.sumsTo13(state.cards[a].rank, state.cards[b].rank)) return false;
    pushHistory();
    E.applyMove(state, ruleset, { type: 'pairCards', a: a, b: b });
    awardMovePoints(200);
    state.selectedId = null;
    selectedWaste = false;
    sfx('match');
    announce('Paar entfernt.');
    render();
    checkEnd();
    return true;
  }

  function pairWithWaste(id) {
    var top = E.wasteTop(state);
    if (!top || !E.isFree(state, ruleset, id)) return false;
    var card = state.cards[id];
    if (!E.sumsTo13(card.rank, top.rank)) {
      sfx('error');
      announce(NAMES[card.rank] + ' und Ablage ' + NAMES[top.rank] + ' ergeben nicht 13.');
      return false;
    }
    pushHistory();
    E.applyMove(state, ruleset, { type: 'pairWaste', id: id });
    awardMovePoints(200);
    wasteOrigins.pop();
    state.selectedId = null;
    selectedWaste = false;
    sfx('match');
    announce('Paar mit Ablage entfernt.');
    render();
    checkEnd();
    return true;
  }

  // --- Eingabe: einzelne Karte -------------------------------------------
  function cardClick(id) {
    if (state.status !== 'playing') return;
    var card = state.cards[id];
    if (!E.isFree(state, ruleset, id)) return;
    if (ruleset.playStyle === 'single') { playSingle(id); return; }
    // Pyramid: Paar-Auswahl
    if (card.rank === 13) { removeKing(id); return; }
    if (selectedWaste) {
      var top = E.wasteTop(state);
      if (top && E.sumsTo13(card.rank, top.rank)) { pairWithWaste(id); return; }
      selectedWaste = false;
      state.selectedId = id;
      sfx('select');
      render();
      announce(NAMES[card.rank] + ' gewählt. Wähle eine Karte mit Summe 13.');
      return;
    }
    if (state.selectedId === null) {
      state.selectedId = id;
      sfx('select');
      render();
      announce(NAMES[card.rank] + ' gewählt. Wähle eine passende Karte für Summe 13.');
      return;
    }
    if (state.selectedId === id) {
      state.selectedId = null;
      render();
      announce('Auswahl aufgehoben.');
      return;
    }
    var other = state.cards[state.selectedId];
    if (pairCards(state.selectedId, id)) return;
    // keine gültige Paarung -> neu wählen
    state.selectedId = id;
    sfx('select');
    render();
    announce(NAMES[card.rank] + ' gewählt. Mit ' + NAMES[other.rank] + ' ergibt sich nicht 13.');
  }

  function wasteClick() {
    if (state.status !== 'playing' || ruleset.playStyle !== 'pair') return;
    var top = E.wasteTop(state);
    if (!top) return;
    if (state.selectedId !== null) {
      if (!E.isFree(state, ruleset, state.selectedId)) { state.selectedId = null; render(); return; }
      pairWithWaste(state.selectedId);
      return;
    }
    if (selectedWaste) {
      selectedWaste = false;
      render();
      announce('Ablage abgewählt.');
      return;
    }
    selectedWaste = true;
    sfx('select');
    render();
    announce('Ablage ' + NAMES[top.rank] + ' gewählt. Wähle eine freie Karte mit Rang ' + NAMES[13 - top.rank] + '.');
  }

  function stockClick() {
    if (state.status !== 'playing') return;
    if (state.stock.length) {
      pushHistory();
      E.applyMove(state, ruleset, { type: 'draw' });
      selectedWaste = false;
      wasteOrigins.push('s' + (drawCounter++));
      sfx('flip');
      render();
      announce('Gezogen: ' + NAMES[E.wasteTop(state).rank] + '.');
      checkEnd();
      return;
    }
    if (ruleset.maxRecycles > 0 && state.recyclesUsed < ruleset.maxRecycles && state.waste.length) {
      pushHistory();
      E.applyMove(state, ruleset, { type: 'recycle' });
      selectedWaste = false;
      wasteOrigins = [];
      sfx('shuffle');
      render();
      announce('Ablage zurück in den Talon gelegt.');
      checkEnd();
    }
  }

  function checkEnd() {
    if (E.isSolved(state)) {
      var clearBonus = mode === 'tripeaks' ? 500 : (mode === 'golf' ? 400 : 600);
      score += state.stock.length * 100 + clearBonus;
      setStatus('won');
      sfx('win');
      if (window.GameFX) window.GameFX.celebrate();
      pauseClock();
      render();
      finish();
      return;
    }
    if (E.isLost(state, ruleset)) {
      setStatus('lost');
      sfx('lose');
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

  function cardData(card, id) {
    return { id: id, rank: card.rank, suit: SUITS[card.suit], label: NAMES[card.rank] };
  }

  // Jedes Rendering läuft als FLIP-Animation: Karten fliegen sichtbar zur Ablage,
  // freigelegte TriPeaks-Karten drehen sich um.
  var flipOverrides = null;
  var skipFlip = false;
  function render() {
    if (skipFlip || !window.GameCards) { renderNow(); return; }
    var overrides = flipOverrides;
    flipOverrides = null;
    GameCards.flip(document.querySelector('.table-area'), renderNow, { overrides: overrides });
  }

  function renderNow() {
    var tableau = $('tableau');
    var pyramid = ruleset.playStyle === 'pair';
    tableau.dataset.mode = mode;
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
    var top = E.wasteTop(state);
    var activeRank = null;
    if (pyramid) {
      if (state.selectedId !== null && state.cards[state.selectedId] && !state.cards[state.selectedId].removed) {
        activeRank = state.cards[state.selectedId].rank;
      } else if (selectedWaste && top) {
        activeRank = top.rank;
      }
    }

    state.cards.forEach(function (card) {
      var btn = tableau.children[card.id];
      var pos = ruleset.layout(card.id);
      btn.style.left = pos.left + '%';
      btn.style.top = pos.top + '%';
      btn.style.zIndex = String(card.id + 1);
      var red = card.suit === 1 || card.suit === 2;
      var free = E.isFree(state, ruleset, card.id);
      var faceDown = mode === 'tripeaks' && !card.removed && !free;
      var isPartner = pyramid && free && !card.removed && activeRank !== null &&
        state.selectedId !== card.id && E.sumsTo13(card.rank, activeRank);
      var cls = 'card' + (red ? ' red' : '') + (card.removed ? ' removed' : '') +
        (!card.removed && !free ? ' covered' : '') + (faceDown ? ' face-down' : '') +
        (state.selectedId === card.id ? ' selected' : '') +
        (isPartner ? ' partner' : '');
      setClassesPreservingAnim(btn, cls);
      btn.disabled = card.removed || !free || state.status !== 'playing';
      btn.setAttribute('aria-label', cardLabel(card) + (isPartner ? ' – passender Partner' : ''));
      if (pyramid) btn.setAttribute('aria-pressed', state.selectedId === card.id ? 'true' : 'false');
      else btn.removeAttribute('aria-pressed');
      if (pyramid && free && !card.removed) btn.dataset.drop = 'card'; else delete btn.dataset.drop;
      if (card.removed) {
        GameCards.clear(btn);
      } else if (faceDown) {
        GameCards.face(btn, { faceDown: true, id: 't' + card.id });
      } else {
        GameCards.face(btn, cardData(card, 't' + card.id));
      }
    });

    var w = $('waste');
    var wasteIsPartner = pyramid && top && state.selectedId !== null && activeRank !== null && E.sumsTo13(top.rank, activeRank);
    if (top) {
      GameCards.face(w, cardData(top, wasteTopKey()));
      var wasteCls = 'pile waste pc-card' + ((top.suit === 1 || top.suit === 2) ? ' red' : '') +
        (selectedWaste ? ' selected' : '') + (wasteIsPartner ? ' partner' : '');
      setClassesPreservingAnim(w, wasteCls);
      w.setAttribute('aria-label', 'Ablage: ' + NAMES[top.rank] + SUITS[top.suit] +
        (pyramid ? (wasteIsPartner ? ' – passender Partner, antippen zum Paaren' : ' – antippen zum Auswählen') : ''));
    } else {
      GameCards.clear(w);
      setClassesPreservingAnim(w, 'pile waste empty');
      w.setAttribute('aria-label', 'Ablage leer');
    }
    if (pyramid && top) w.setAttribute('aria-pressed', selectedWaste ? 'true' : 'false');
    else w.removeAttribute('aria-pressed');
    w.dataset.drop = 'waste';
    w.disabled = !pyramid || !top || state.status !== 'playing';

    var stockBtn = $('talon');
    var canRecycle = pyramid && !state.stock.length && state.recyclesUsed < ruleset.maxRecycles && state.waste.length;
    stockBtn.classList.toggle('pc-card', state.stock.length > 0);
    stockBtn.classList.toggle('pc-back', state.stock.length > 0);
    $('talon-count').textContent = canRecycle ? '↻' : String(state.stock.length);
    stockBtn.disabled = (!state.stock.length && !canRecycle) || state.status !== 'playing';
    stockBtn.setAttribute('aria-label',
      state.stock.length ? 'Nächste Karte vom Talon ziehen' :
      (canRecycle ? 'Ablage zurück in den Talon legen' : 'Talon leer'));

    var modeBest = Math.max(stats[mode].bestScore, score);
    $('score').textContent = score.toLocaleString('de-DE');
    $('best-score').textContent = modeBest.toLocaleString('de-DE');
    $('moves').textContent = String(state.moves);
    $('streak').textContent = String(state.streak);
    $('time').textContent = formatTime(currentTimer());
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
  function sfx(name) { if (window.GameAudio) window.GameAudio.play(name); }

  function modeIntro() {
    if (mode === 'tripeaks') return 'TriPeaks: Räume die drei Gipfel ab – eine freie Karte mit Rang ±1.';
    if (mode === 'golf') return 'Golf: Spiele die unterste Karte jeder Spalte – Rang ±1, Ass und König passen zusammen.';
    return 'Pyramid: Entferne Paare mit Rangsumme 13 (König allein).';
  }

  function finish() {
    var won = state.status === 'won';
    var elapsedSec = currentTimer();
    var mStats = stats[mode];
    var isNewBest = score > mStats.bestScore;
    if (score > mStats.bestScore) mStats.bestScore = score;
    if (bestRunStreak > mStats.bestStreak) mStats.bestStreak = bestRunStreak;
    if (won) {
      mStats.wins += 1;
      if (mStats.bestTimeSec == null || elapsedSec < mStats.bestTimeSec) mStats.bestTimeSec = elapsedSec;
    }
    saveStats();
    if (window.GameScores) {
      window.GameScores.record('pandataire', {
        score: score,
        timeSec: won ? elapsedSec : undefined,
        won: won,
        label: buildScoreLabel(overallBestScore(), totalWins())
      });
    }
    $('best-score').textContent = mStats.bestScore.toLocaleString('de-DE');
    $('result-title').textContent = won ? ruleset.name + ' geschafft!' : 'Runde beendet';
    $('result-text').textContent =
      (won ? 'Alle Karten sind abgeräumt.' : 'Kein gültiger Zug mehr möglich.') +
      ' Punkte: ' + score.toLocaleString('de-DE') +
      (isNewBest && score > 0 ? ' (Neuer Bestwert!)' : ' · Bestwert: ' + mStats.bestScore.toLocaleString('de-DE')) +
      ' · Züge: ' + state.moves + ' · Zeit: ' + formatTime(elapsedSec) + '.';
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
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('result').hidden) return;
    var target = e.target;
    if (target && typeof target.matches === 'function') {
      if (target.matches('input,select,textarea')) return;
      if (target.matches('button,a,summary') && (e.key === ' ' || e.key === 'Enter')) return;
    }
    var key = e.key.toLowerCase();
    if (key === 'escape') {
      if (state.selectedId !== null || selectedWaste) {
        state.selectedId = null;
        selectedWaste = false;
        render();
        announce('Auswahl aufgehoben.');
      }
      return;
    }
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
  }, 500);

  // Drag & Drop mit Kartenvorschau: freie Karte auf die Ablage ziehen
  // (TriPeaks/Golf) bzw. auf die Partnerkarte oder die Ablage (Pyramid).
  if (window.GameCards) {
    GameCards.makeDraggable({
      root: document.querySelector('.table-area'),
      cardSelector: '#tableau .card',
      targetSelector: '[data-drop]',
      start: function (element) {
        if (!state || state.status !== 'playing') return null;
        var id = Number(element.dataset.id);
        return E.isFree(state, ruleset, id) && !state.cards[id].removed ? { id: id } : null;
      },
      cards: function (payload) { return [cardData(state.cards[payload.id], 't' + payload.id)]; },
      canDrop: function (payload, target) {
        var card = state.cards[payload.id];
        var top = E.wasteTop(state);
        if (target.dataset.drop === 'waste') {
          if (ruleset.playStyle === 'single') return !!top && E.legal(card.rank, top.rank);
          return card.rank === 13 || (!!top && E.sumsTo13(card.rank, top.rank));
        }
        var other = Number(target.dataset.id);
        return other !== payload.id && E.isFree(state, ruleset, other) && E.sumsTo13(card.rank, state.cards[other].rank);
      },
      drop: function (payload, target, ghostRects) {
        var card = state.cards[payload.id];
        flipOverrides = ghostRects;
        var ok;
        if (target.dataset.drop === 'waste') {
          if (ruleset.playStyle === 'single') ok = playSingle(payload.id);
          else ok = card.rank === 13 ? removeKing(payload.id) : pairWithWaste(payload.id);
        } else {
          ok = pairCards(payload.id, Number(target.dataset.id));
        }
        flipOverrides = null;
        return ok;
      },
      cancel: function (_payload, hadTarget) { if (!hadTarget) announce('Karte zurückgelegt.'); }
    });
  }

  syncSharedScores();
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
        score: score,
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
