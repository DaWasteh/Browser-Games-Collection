/* === Pandataire — Spielregeln (UMD) ===
   Drei Regelsätze (TriPeaks, Golf, Pyramid) als reine, DOM-freie Daten:
   Tableau-Topologie (Blocker), Layout-Koordinaten, Spielstil und ein
   jeweils konstruiert-lösbarer Generator. Jeder Deal verwendet exakt
   ein 52-Karten-Deck und trägt eine replaybare Lösung.

   Setzt PandataireEngine voraus. Browser: window.PandataireRulesets,
   Node: require('./rulesets.js'). */
(function (root, factory) {
  var engine = (typeof require === 'function')
    ? require('./engine.js')
    : (root && root.PandataireEngine);
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(engine);
  } else {
    root.PandataireRulesets = factory(engine);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function (engine) {
  'use strict';
  var legal = engine.legal;
  var shuffle = engine.shuffle;
  var makeDeck = engine.makeDeck;

  // Zufälliger, aber deckverträglicher ±1-Rangpfad. Jeder Rang darf höchstens
  // viermal vorkommen; am Ende bleibt mindestens eine passende Startkarte für
  // die Ablage übrig. Dadurch besitzen neue Seeds echte Rangvarianz statt nur
  // eines festen Pfads und seiner Umkehrung.
  function randomRankPath(length, random) {
    for (var attempt = 0; attempt < 200; attempt++) {
      var current = 1 + Math.floor(random() * 13);
      var path = [current];
      var counts = new Array(14).fill(0);
      counts[current] = 1;
      while (path.length < length) {
        var lower = current === 1 ? 13 : current - 1;
        var upper = current === 13 ? 1 : current + 1;
        var choices = [];
        if (counts[lower] < 4) choices.push(lower);
        if (counts[upper] < 4) choices.push(upper);
        if (!choices.length) break;
        current = choices[Math.floor(random() * choices.length)];
        counts[current]++;
        path.push(current);
      }
      if (path.length !== length) continue;
      var first = path[0];
      var before = first === 1 ? 13 : first - 1;
      var after = first === 13 ? 1 : first + 1;
      if (counts[before] < 4 || counts[after] < 4) return path;
    }
    throw new Error('Kein deckverträglicher Rangpfad gefunden');
  }

  // --- TriPeaks: vorhandene Konstanten wörtlich übernommen -----------------
  var tripeaksPositions = [
    [1, 0], [5, 0], [9, 0], [0, 1], [2, 1], [4, 1], [6, 1], [8, 1], [10, 1],
    [0, 2], [1, 2], [2, 2], [4, 2], [5, 2], [6, 2], [8, 2], [9, 2], [10, 2],
    [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3]
  ];
  var tripeaksBlockers = [
    [3, 4], [5, 6], [7, 8], [9, 10], [10, 11], [12, 13], [13, 14], [15, 16], [16, 17],
    [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 24], [24, 25], [25, 26], [26, 27],
    [], [], [], [], [], [], [], [], [], []
  ];
  var tripeaksRemovalOrder = [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 9, 10, 11, 12, 13, 14, 15, 16, 17, 3, 4, 5, 6, 7, 8, 0, 1, 2];

  function tripeaksLayout(id) {
    var p = tripeaksPositions[id];
    return { left: (p[0] + 0.5) * 8.9, top: p[1] * 25 + 1 };
  }

  function tripeaksDeal(random) {
    var deck = shuffle(makeDeck(), random);
    var wanted = randomRankPath(tripeaksRemovalOrder.length, random);
    var byRank = [];
    for (var r = 0; r < 14; r++) byRank.push([]);
    deck.forEach(function (c) { byRank[c.rank].push(c); });
    var cards = [];
    for (var id = 0; id < 28; id++) cards.push({ id: id, rank: 0, suit: 0 });
    var used = [];
    tripeaksRemovalOrder.forEach(function (id, i) {
      var c = byRank[wanted[i]].pop();
      used.push(c);
      cards[id].rank = c.rank;
      cards[id].suit = c.suit;
    });
    var remaining = deck.filter(function (c) { return used.indexOf(c) < 0; });
    var wasteIndex = -1;
    for (var w = 0; w < remaining.length; w++) {
      if (legal(remaining[w].rank, wanted[0])) { wasteIndex = w; break; }
    }
    if (wasteIndex < 0) throw new Error('Kein legaler Start-Waste im Restdeck');
    var wasteCard = remaining.splice(wasteIndex, 1)[0];
    var stock = shuffle(remaining, random).map(function (c) { return { rank: c.rank, suit: c.suit }; });
    var waste = [{ rank: wasteCard.rank, suit: wasteCard.suit }];
    var solution = tripeaksRemovalOrder.map(function (id) { return { type: 'play', id: id }; });
    return { cards: cards, stock: stock, waste: waste, solution: solution };
  }

  var tripeaks = {
    id: 'tripeaks',
    name: 'TriPeaks',
    size: 28,
    maxRecycles: 0,
    playStyle: 'single',
    blockers: tripeaksBlockers,
    layout: tripeaksLayout,
    deal: tripeaksDeal
  };

  // --- Golf: 7 Spalten × 5 Reihen, freie Spaltenböden ----------------------
  // id = col * 5 + row; die unterste Karte einer Spalte (Reihe 4) ist frei.
  var golfBlockers = [];
  for (var gid = 0; gid < 35; gid++) {
    var grow = gid % 5;
    golfBlockers.push(grow < 4 ? [gid + 1] : []);
  }
  var golfRemovalOrder = [];
  for (var gcol = 0; gcol < 7; gcol++) {
    for (var gr = 4; gr >= 0; gr--) golfRemovalOrder.push(gcol * 5 + gr);
  }
  function golfLayout(id) {
    var col = Math.floor(id / 5);
    var row = id % 5;
    return { left: (col + 0.5) * (100 / 7), top: row * 16 + 3 };
  }

  function golfDeal(random) {
    var deck = shuffle(makeDeck(), random);
    var wanted = randomRankPath(golfRemovalOrder.length, random);
    var byRank = [];
    for (var r0 = 0; r0 < 14; r0++) byRank.push([]);
    deck.forEach(function (c) { byRank[c.rank].push(c); });
    var cards = [];
    for (var id = 0; id < 35; id++) cards.push({ id: id, rank: 0, suit: 0 });
    var used = [];
    golfRemovalOrder.forEach(function (id, i) {
      var c = byRank[wanted[i]].pop();
      used.push(c);
      cards[id].rank = c.rank;
      cards[id].suit = c.suit;
    });
    var remaining = deck.filter(function (c) { return used.indexOf(c) < 0; });
    var wasteIndex = -1;
    for (var w = 0; w < remaining.length; w++) {
      if (legal(remaining[w].rank, wanted[0])) { wasteIndex = w; break; }
    }
    if (wasteIndex < 0) throw new Error('Kein legaler Start-Waste im Restdeck');
    var wasteCard = remaining.splice(wasteIndex, 1)[0];
    var stock = shuffle(remaining, random).map(function (c) { return { rank: c.rank, suit: c.suit }; });
    var waste = [{ rank: wasteCard.rank, suit: wasteCard.suit }];
    var solution = golfRemovalOrder.map(function (id) { return { type: 'play', id: id }; });
    return { cards: cards, stock: stock, waste: waste, solution: solution };
  }

  var golf = {
    id: 'golf',
    name: 'Golf',
    size: 35,
    maxRecycles: 0,
    playStyle: 'single',
    blockers: golfBlockers,
    layout: golfLayout,
    deal: golfDeal
  };

  // --- Pyramid: 28-Karten-Pyramide, Paare summierend auf 13 ---------------
  // id = row*(row+1)/2 + pos; Reihe 6 ist der Boden (7 Karten).
  var pyramidBlockers = [];
  (function buildPyramidBlockers() {
    for (var row = 0; row < 7; row++) {
      for (var pos = 0; pos <= row; pos++) {
        if (row === 6) {
          pyramidBlockers.push([]);
        } else {
          var base = (row + 1) * (row + 2) / 2;
          pyramidBlockers.push([base + pos, base + pos + 1]);
        }
      }
    }
  })();
  // Boden-zuerst-Reihenfolge (topologisch gültig).
  var pyramidRemovalOrder = [];
  for (var prow = 6; prow >= 0; prow--) {
    var pbase = prow * (prow + 1) / 2;
    for (var ppos = 0; ppos <= prow; ppos++) pyramidRemovalOrder.push(pbase + ppos);
  }

  function pyramidLayout(id) {
    var row = 0, pos = 0, acc = 0;
    while (acc + row + 1 <= id) { acc += row + 1; row++; }
    pos = id - acc;
    return { left: ((6 - row) / 2 + pos + 0.5) * (100 / 7), top: row * 12 + 2 };
  }

  function pyramidDeal(random) {
    var deck = shuffle(makeDeck(), random);
    var byRank = [];
    for (var r1 = 0; r1 < 14; r1++) byRank.push([]);
    deck.forEach(function (c) { byRank[c.rank].push(c); });
    // Pyramide: alle 4 Könige + je 2 jeder Ränge 1..12 = 28 Karten.
    // Stock: die übrigen je 2 jeder Ränge 1..12 = 24 Karten.
    var pyramidPool = [];
    for (var rk = 1; rk <= 12; rk++) {
      pyramidPool.push(byRank[rk][0]);
      pyramidPool.push(byRank[rk][1]);
    }
    for (var kk = 0; kk < 4; kk++) pyramidPool.push(byRank[13][kk]);
    var stockPool = [];
    for (var rk2 = 1; rk2 <= 12; rk2++) {
      stockPool.push(byRank[rk2][2]);
      stockPool.push(byRank[rk2][3]);
    }
    var arranged = shuffle(pyramidPool, random);
    var cards = [];
    for (var id = 0; id < 28; id++) {
      cards.push({ id: id, rank: arranged[id].rank, suit: arranged[id].suit });
    }
    // Ergänzungskarten nach Rang greifbar halten.
    var byComplement = [];
    for (var rc = 0; rc < 14; rc++) byComplement.push([]);
    stockPool.forEach(function (c) { byComplement[c.rank].push(c); });
    var stock = [];
    var solution = [];
    pyramidRemovalOrder.forEach(function (id) {
      var card = cards[id];
      if (card.rank === 13) {
        solution.push({ type: 'king', id: id });
      } else {
        var comp = byComplement[13 - card.rank].pop();
        stock.unshift(comp); // pop() liefert die erste benötigte Ergänzung zuerst
        solution.push({ type: 'draw' });
        solution.push({ type: 'pairWaste', id: id });
      }
    });
    var stockCards = stock.map(function (c) { return { rank: c.rank, suit: c.suit }; });
    return { cards: cards, stock: stockCards, waste: [], solution: solution };
  }

  var pyramid = {
    id: 'pyramid',
    name: 'Pyramid',
    size: 28,
    maxRecycles: 1,
    playStyle: 'pair',
    blockers: pyramidBlockers,
    layout: pyramidLayout,
    deal: pyramidDeal
  };

  var RULESETS = { tripeaks: tripeaks, golf: golf, pyramid: pyramid };
  var ORDER = ['tripeaks', 'golf', 'pyramid'];

  function get(id) {
    return RULESETS[id] || tripeaks;
  }

  return { tripeaks: tripeaks, golf: golf, pyramid: pyramid, all: RULESETS, order: ORDER, get: get };
});
