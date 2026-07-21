/* === Pandataire — DOM-freie Engine (UMD) ===
   Reine, in Node testbare Spiellogik für drei Solitaire-Modi
   (TriPeaks, Golf, Pyramid): seedbarer PRNG, Mischen, Deck-Erzeugung,
   Rang-Adjazenz und Paar-Summe, Freikarten-Prädikat, Zugausführung,
   Snapshot/Restore (Undo), Lösbarkeits- und Deck-Integritätsprüfung.

   Kein DOM-Zugriff, keine Abhängigkeiten. Im Browser als
   window.PandataireEngine, in Node per require('./engine.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PandataireEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  var SUITS = ['♠', '♥', '♦', '♣'];
  var NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // Seedbarer LCG (gleiche Familie wie pandacell) für reproduzierbare Deals.
  function rng(seed) {
    var value = (seed >>> 0) || 1;
    return function () {
      value = (Math.imul(1664525, value) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function makeDeck() {
    var deck = [];
    for (var rank = 1; rank <= 13; rank++) {
      for (var suit = 0; suit < 4; suit++) {
        deck.push({ rank: rank, suit: suit });
      }
    }
    return deck;
  }

  // Fisher-Yates mit übergebenem PRNG; verändert das Original nicht.
  function shuffle(source, random) {
    var a = source.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // Rang-Adjazenz mit A↔K-Wicklung (TriPeaks, Golf).
  function legal(a, b) {
    return Math.abs(a - b) === 1 || (a === 1 && b === 13) || (a === 13 && b === 1);
  }

  // Paar-Summe 13 (Pyramid).
  function sumsTo13(a, b) {
    return a + b === 13;
  }

  function wasteTop(state) {
    return state.waste.length ? state.waste[state.waste.length - 1] : null;
  }

  // Eine Karte ist frei, wenn keine ihrer blockierenden Karten mehr liegt.
  function isFree(state, ruleset, id) {
    var card = state.cards[id];
    if (!card || card.removed) return false;
    var blockers = ruleset.blockers[id];
    for (var i = 0; i < blockers.length; i++) {
      if (!state.cards[blockers[i]].removed) return false;
    }
    return true;
  }

  function freeCards(state, ruleset) {
    var result = [];
    for (var i = 0; i < state.cards.length; i++) {
      if (isFree(state, ruleset, i)) result.push(state.cards[i]);
    }
    return result;
  }

  // Tiefenkopie des Spielzustands.
  function cloneState(state) {
    return {
      mode: state.mode,
      seed: state.seed,
      cards: state.cards.map(function (c) {
        return { id: c.id, rank: c.rank, suit: c.suit, removed: c.removed };
      }),
      stock: state.stock.map(function (c) { return { rank: c.rank, suit: c.suit }; }),
      waste: state.waste.map(function (c) { return { rank: c.rank, suit: c.suit }; }),
      recyclesUsed: state.recyclesUsed,
      selectedId: state.selectedId,
      moves: state.moves,
      streak: state.streak,
      status: state.status
    };
  }

  // Snapshot nur der veränderbaren Felder (für Undo).
  function snapshot(state) {
    return {
      cards: state.cards.map(function (c) { return c.removed; }),
      stock: state.stock.map(function (c) { return { rank: c.rank, suit: c.suit }; }),
      waste: state.waste.map(function (c) { return { rank: c.rank, suit: c.suit }; }),
      recyclesUsed: state.recyclesUsed,
      selectedId: state.selectedId,
      moves: state.moves,
      streak: state.streak,
      status: state.status
    };
  }

  function restore(state, snap) {
    for (var i = 0; i < state.cards.length; i++) state.cards[i].removed = snap.cards[i];
    state.stock = snap.stock.map(function (c) { return { rank: c.rank, suit: c.suit }; });
    state.waste = snap.waste.map(function (c) { return { rank: c.rank, suit: c.suit }; });
    state.recyclesUsed = snap.recyclesUsed;
    state.selectedId = snap.selectedId;
    state.moves = snap.moves;
    state.streak = snap.streak;
    state.status = snap.status;
  }

  // Führt einen Zug aus. Mutiert state nur bei Erfolg. Rückgabe {ok, reason}.
  // Züge:
  //   {type:'draw'}                      Stock→Waste (alle Modi)
  //   {type:'recycle'}                   Waste→Stock (Pyramid)
  //   {type:'play', id}                  Einzelkarte auf Waste (TriPeaks/Golf)
  //   {type:'king', id}                  Freien König allein entfernen (Pyramid)
  //   {type:'pairCards', a, b}           Zwei freie Karten summierend auf 13 (Pyramid)
  //   {type:'pairWaste', id}             Freie Karte + Waste-Spitze = 13 (Pyramid)
  function applyMove(state, ruleset, move) {
    if (state.status !== 'playing') return { ok: false, reason: 'Spiel ist beendet' };
    if (move.type === 'draw') {
      if (!state.stock.length) return { ok: false, reason: 'Stock ist leer' };
      state.waste.push(state.stock.pop());
      state.moves++;
      state.streak = 0;
      state.selectedId = null;
      return { ok: true };
    }
    if (move.type === 'recycle') {
      if (state.stock.length) return { ok: false, reason: 'Stock noch nicht leer' };
      if (state.recyclesUsed >= ruleset.maxRecycles) return { ok: false, reason: 'Kein weiterer Umlauf möglich' };
      if (!state.waste.length) return { ok: false, reason: 'Nichts umzulagern' };
      state.stock = state.waste.slice().reverse();
      state.waste = [];
      state.recyclesUsed++;
      state.moves++;
      state.selectedId = null;
      return { ok: true };
    }
    if (move.type === 'play') {
      var top = wasteTop(state);
      if (!top) return { ok: false, reason: 'Keine Ablagekarte' };
      var card = state.cards[move.id];
      if (!isFree(state, ruleset, move.id)) return { ok: false, reason: 'Karte ist nicht frei' };
      if (!legal(card.rank, top.rank)) return { ok: false, reason: 'Rang passt nicht zur Ablage' };
      card.removed = true;
      state.waste.push({ rank: card.rank, suit: card.suit });
      state.moves++;
      state.streak++;
      state.selectedId = null;
      return { ok: true };
    }
    if (move.type === 'king') {
      var kcard = state.cards[move.id];
      if (!isFree(state, ruleset, move.id)) return { ok: false, reason: 'Karte ist nicht frei' };
      if (kcard.rank !== 13) return { ok: false, reason: 'Nur ein König darf allein entfernt werden' };
      kcard.removed = true;
      state.moves++;
      state.streak++;
      state.selectedId = null;
      return { ok: true };
    }
    if (move.type === 'pairCards') {
      var ca = state.cards[move.a];
      var cb = state.cards[move.b];
      if (move.a === move.b) return { ok: false, reason: 'Dieselbe Karte' };
      if (!isFree(state, ruleset, move.a) || !isFree(state, ruleset, move.b)) return { ok: false, reason: 'Eine Karte ist nicht frei' };
      if (!sumsTo13(ca.rank, cb.rank)) return { ok: false, reason: 'Ränge summieren nicht auf 13' };
      ca.removed = true;
      cb.removed = true;
      state.moves++;
      state.streak++;
      state.selectedId = null;
      return { ok: true };
    }
    if (move.type === 'pairWaste') {
      var wtop = wasteTop(state);
      if (!wtop) return { ok: false, reason: 'Ablage ist leer' };
      var pcard = state.cards[move.id];
      if (!isFree(state, ruleset, move.id)) return { ok: false, reason: 'Karte ist nicht frei' };
      if (!sumsTo13(pcard.rank, wtop.rank)) return { ok: false, reason: 'Ränge summieren nicht auf 13' };
      pcard.removed = true;
      state.waste.pop();
      state.moves++;
      state.streak++;
      state.selectedId = null;
      return { ok: true };
    }
    return { ok: false, reason: 'Unbekannter Zug' };
  }

  // Gibt es irgendeinen legalen Zug?
  function hasMove(state, ruleset) {
    if (ruleset.playStyle === 'single') {
      var top = wasteTop(state);
      if (top) {
        for (var i = 0; i < state.cards.length; i++) {
          if (isFree(state, ruleset, i) && legal(state.cards[i].rank, top.rank)) return true;
        }
      }
    } else {
      var frees = freeCards(state, ruleset);
      for (var f = 0; f < frees.length; f++) {
        if (frees[f].rank === 13) return true; // freier König
      }
      for (var a = 0; a < frees.length; a++) {
        for (var b = a + 1; b < frees.length; b++) {
          if (sumsTo13(frees[a].rank, frees[b].rank)) return true;
        }
      }
      var wtop = wasteTop(state);
      if (wtop) {
        for (var w = 0; w < frees.length; w++) {
          if (sumsTo13(frees[w].rank, wtop.rank)) return true;
        }
      }
    }
    if (state.stock.length) return true;
    if (!state.stock.length && state.recyclesUsed < ruleset.maxRecycles && state.waste.length) return true;
    return false;
  }

  function isSolved(state) {
    for (var i = 0; i < state.cards.length; i++) {
      if (!state.cards[i].removed) return false;
    }
    return true;
  }

  function isLost(state, ruleset) {
    return state.status === 'playing' && !isSolved(state) && !hasMove(state, ruleset);
  }

  // Alle 52 Karten eines frischen Deals (vor dem ersten Spielzug).
  // Entfernte Tableau-Karten bleiben später als Historienplätze erhalten und
  // können zugleich auf der Ablage liegen; diese Prüfung ist daher bewusst
  // nur eine Initialdeal-Invariante.
  function deckCards(state) {
    var all = [];
    state.cards.forEach(function (c) { all.push({ rank: c.rank, suit: c.suit }); });
    state.stock.forEach(function (c) { all.push({ rank: c.rank, suit: c.suit }); });
    state.waste.forEach(function (c) { all.push({ rank: c.rank, suit: c.suit }); });
    return all;
  }

  // Exakt ein 52-Karten-Standarddeck, keine Duplikate, keine Lücken.
  function deckIsValid(state) {
    var all = deckCards(state);
    if (all.length !== 52) return false;
    var keys = new Set();
    for (var i = 0; i < all.length; i++) {
      var card = all[i];
      if (card.rank < 1 || card.rank > 13 || card.suit < 0 || card.suit > 3) return false;
      var key = card.rank + ':' + card.suit;
      if (keys.has(key)) return false;
      keys.add(key);
    }
    return keys.size === 52;
  }

  // Erzeugt den Anfangszustand aus einem Ruleset-Deal und einem Seed.
  function createState(mode, seed, dealResult) {
    return {
      mode: mode,
      seed: seed,
      cards: dealResult.cards.map(function (c) {
        return { id: c.id, rank: c.rank, suit: c.suit, removed: false };
      }),
      stock: dealResult.stock.map(function (c) { return { rank: c.rank, suit: c.suit }; }),
      waste: dealResult.waste.map(function (c) { return { rank: c.rank, suit: c.suit }; }),
      recyclesUsed: 0,
      selectedId: null,
      moves: 0,
      streak: 0,
      status: 'playing'
    };
  }

  // Spielt eine Lösungsschrittfolge legal ein. Liefert {ok, step, reason}.
  function replaySolution(state, ruleset, moves) {
    for (var i = 0; i < moves.length; i++) {
      var res = applyMove(state, ruleset, moves[i]);
      if (!res.ok) return { ok: false, step: i, reason: res.reason, move: moves[i] };
    }
    return { ok: true };
  }

  return {
    SUITS: SUITS,
    NAMES: NAMES,
    rng: rng,
    makeDeck: makeDeck,
    shuffle: shuffle,
    legal: legal,
    sumsTo13: sumsTo13,
    wasteTop: wasteTop,
    isFree: isFree,
    freeCards: freeCards,
    cloneState: cloneState,
    snapshot: snapshot,
    restore: restore,
    applyMove: applyMove,
    hasMove: hasMove,
    isSolved: isSolved,
    isLost: isLost,
    deckCards: deckCards,
    deckIsValid: deckIsValid,
    createState: createState,
    replaySolution: replaySolution
  };
});
