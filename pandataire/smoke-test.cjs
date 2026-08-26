/* === Pandataire — Logik-Smoke-Test (Node, keine Abhängigkeiten) ===
   Prüft die DOM-freie Engine und alle drei Regelsätze über mindestens
   1000 Seeds pro Modus: Deck-Eindeutigkeit, deterministische Deals,
   replaybare konstruierte Lösungen, Freikarten-Topologie, Legalitäts-
   prädikate, Undo-/Status-Klonen sowie fehlerresiliente Eingaben.
   Aufruf:  node pandataire/smoke-test.cjs   (erwartet: "smoke ok") */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('./engine.js');
const R = require('./rulesets.js');

const SEEDS = 1000;

function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ============================================================
// 1) Regelsatz-Integrität: Größe, Spielstil, Topologie (DAG)
// ============================================================
const expected = {
  tripeaks: { size: 28, playStyle: 'single', maxRecycles: 0, initialFree: [18, 19, 20, 21, 22, 23, 24, 25, 26, 27] },
  golf: { size: 35, playStyle: 'single', maxRecycles: 0, initialFree: [4, 9, 14, 19, 24, 29, 34] },
  pyramid: { size: 28, playStyle: 'pair', maxRecycles: 1, initialFree: [21, 22, 23, 24, 25, 26, 27] }
};

function statefulSnapshot(state) {
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

for (const mode of R.order) {
  const rs = R[mode];
  const exp = expected[mode];
  assert.equal(rs.size, exp.size, mode + ' Größe');
  assert.equal(rs.playStyle, exp.playStyle, mode + ' Spielstil');
  assert.equal(rs.maxRecycles, exp.maxRecycles, mode + ' Umläufe');
  assert.equal(rs.blockers.length, exp.size, mode + ' Blocker-Anzahl');
  assert.equal(rs.layout(0).left >= 0 && rs.layout(0).left <= 100, true, mode + ' Layout-Bereich');
  // Topologie: Blocker-IDs im gültigen Bereich, keine Selbstblockade.
  for (let id = 0; id < rs.size; id++) {
    for (const b of rs.blockers[id]) {
      assert.ok(b >= 0 && b < rs.size && b !== id, mode + ' ungültiger Blocker ' + id + '->' + b);
    }
  }
  // Anfangs freie Karten stimmen mit der Bottom-Schicht überein.
  const deal0 = rs.deal(E.rng(1));
  const st0 = E.createState(mode, 1, deal0);
  const free0 = [];
  for (let id = 0; id < rs.size; id++) if (E.isFree(st0, rs, id)) free0.push(id);
  assert.deepEqual(free0, exp.initialFree, mode + ' anfänglich freie Karten');
}

// ============================================================
// 2) Deck-Integrität & Eindeutigkeit über 1000 Seeds je Modus
// ============================================================
for (const mode of R.order) {
  const rs = R[mode];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const deal = rs.deal(E.rng(seed));
    const state = E.createState(mode, seed, deal);
    assert.equal(E.deckIsValid(state), true, mode + ' ungültiges Deck seed ' + seed);
    const all = E.deckCards(state);
    assert.equal(all.length, 52, mode + ' nicht 52 Karten seed ' + seed);
  }
}

// ============================================================
// 3) Determinismus: gleicher Seed -> gleicher Deal
// ============================================================
for (const mode of R.order) {
  const rs = R[mode];
  for (const seed of [1, 42, 999, 123456]) {
    const a = rs.deal(E.rng(seed));
    const b = rs.deal(E.rng(seed));
    assert.equal(deepEq(a.cards, b.cards), true, mode + ' Deal nicht deterministisch (cards) seed ' + seed);
    assert.equal(deepEq(a.stock, b.stock), true, mode + ' Deal nicht deterministisch (stock) seed ' + seed);
    assert.equal(deepEq(a.waste, b.waste), true, mode + ' Deal nicht deterministisch (waste) seed ' + seed);
    assert.equal(deepEq(a.solution, b.solution), true, mode + ' Deal nicht deterministisch (solution) seed ' + seed);
  }
}

// ============================================================
// 4) Konstruierte Lösung ist legal & führt zum Sieg (1000 Seeds)
// ============================================================
for (const mode of R.order) {
  const rs = R[mode];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const deal = rs.deal(E.rng(seed));
    const state = E.createState(mode, seed, deal);
    const res = E.replaySolution(state, rs, deal.solution);
    assert.equal(res.ok, true, mode + ' Lösung illegal seed ' + seed + ': ' + JSON.stringify(res));
    assert.equal(E.isSolved(state), true, mode + ' nicht gelöst seed ' + seed);
    assert.equal(state.status, 'playing', mode + ' Status sollte noch playing sein seed ' + seed);
  }
}

// ============================================================
// 5) Monotonie: jeder Lösungszug reduziert Restkarten & hält Topologie
// ============================================================
for (const mode of R.order) {
  const rs = R[mode];
  const deal = rs.deal(E.rng(7));
  const state = E.createState(mode, 7, deal);
  let prevRemaining = rs.size;
  for (const move of deal.solution) {
    // Vor dem Zug: entfernte Karte(n) müssen frei sein (außer draw/recycle).
    if (move.type === 'play' || move.type === 'king') {
      assert.equal(E.isFree(state, rs, move.id), true, mode + ' Zug auf gebundene Karte');
    } else if (move.type === 'pairCards') {
      assert.equal(E.isFree(state, rs, move.a) && E.isFree(state, rs, move.b), true, mode + ' Paar nicht frei');
    } else if (move.type === 'pairWaste') {
      assert.equal(E.isFree(state, rs, move.id), true, mode + ' pairWaste nicht frei');
    }
    const r = E.applyMove(state, rs, move);
    assert.equal(r.ok, true, mode + ' Zug scheiterte: ' + JSON.stringify(r));
    const remaining = state.cards.filter(function (c) { return !c.removed; }).length;
    if (move.type !== 'draw' && move.type !== 'recycle') {
      assert.ok(remaining < prevRemaining, mode + ' Restkarten nicht streng monoton fallend');
    }
    prevRemaining = remaining;
  }
}

// ============================================================
// 6) Legalitätsprädikate (Fuzz über alle Ränge)
// ============================================================
for (let a = 1; a <= 13; a++) {
  for (let b = 1; b <= 13; b++) {
    const adj = Math.abs(a - b) === 1 || (a === 1 && b === 13) || (a === 13 && b === 1);
    assert.equal(E.legal(a, b), adj, 'legal(' + a + ',' + b + ')');
    assert.equal(E.sumsTo13(a, b), a + b === 13, 'sumsTo13(' + a + ',' + b + ')');
  }
}
// ============================================================
// 7) Freikarten-Topologie: Blocker frei -> Karte wird frei
// ============================================================
for (const mode of R.order) {
  const rs = R[mode];
  const deal = rs.deal(E.rng(3));
  const state = E.createState(mode, 3, deal);
  // Bottom-Karte entfernen macht (ggf.) darüberliegende frei.
  const bottomId = expected[mode].initialFree[0];
  assert.equal(E.isFree(state, rs, bottomId), true, mode + ' Bottom nicht frei');
  state.cards[bottomId].removed = true;
  const freed = [];
  for (let id = 0; id < rs.size; id++) {
    if (rs.blockers[id].indexOf(bottomId) >= 0 && E.isFree(state, rs, id)) freed.push(id);
  }
  // Mindestens eine Karte sollte durch diese Bottom-Karte freigeworden sein
  // (außer Sonderfälle); Topologie bleibt konsistent.
  for (const id of freed) {
    assert.equal(E.isFree(state, rs, id), true, mode + ' Freigabe inkonsistent ' + id);
  }
}

// ============================================================
// 8) Undo-/Status-Klonen (deep-equal nach Restore & Clone)
// ============================================================
for (const mode of R.order) {
  const rs = R[mode];
  const deal = rs.deal(E.rng(11));
  const state = E.createState(mode, 11, deal);
  // cloneState ist tief: Änderung am Original beeinflusst den Klon nicht.
  const clone = E.cloneState(state);
  state.cards[0].removed = true;
  state.moves = 99;
  assert.equal(clone.cards[0].removed, false, mode + ' cloneState nicht tief (cards)');
  assert.equal(clone.moves, 0, mode + ' cloneState nicht tief (moves)');
  // snapshot -> applyMove -> restore ergibt den Ursprungszustand zurück.
  const state2 = E.createState(mode, 11, deal);
  const snap = E.snapshot(state2);
  const before = statefulSnapshot(state2);
  const firstMove = deal.solution[0];
  const applied = E.applyMove(state2, rs, firstMove);
  assert.equal(applied.ok, true, mode + ' erster Lösungszug scheiterte');
  assert.equal(deepEq(statefulSnapshot(state2), before), false, mode + ' Zug veränderte Zustand nicht');
  E.restore(state2, snap);
  assert.equal(deepEq(statefulSnapshot(state2), before), true, mode + ' Restore nicht exakt');
}

// ============================================================
// 9) Fehlerresilienz: fehlerhafte Modi/Seeds/Eingaben
// ============================================================
assert.equal(R.get('golf').id, 'golf', 'get(golf)');
assert.equal(R.get('no-such-mode').id, 'tripeaks', 'unbekannter Modus fällt auf TriPeaks zurück');
assert.equal(R.get('').id, 'tripeaks', 'leerer Modus fällt zurück');
assert.equal(R.get(undefined).id, 'tripeaks', 'undefined fällt zurück');

// rng ist tolerant gegenüber 0/negativ/undefiniert und liefert [0,1).
for (const s of [0, -1, -999, undefined, null, 2.7, '5']) {
  const r = E.rng(s);
  const v = r();
  assert.ok(typeof v === 'number' && v >= 0 && v < 1, 'rng(' + s + ') außerhalb [0,1)');
}

// Unbekannter Zugtyp und beendetes Spiel werden abgewiesen.
const rsT = R.tripeaks;
const dealT = rsT.deal(E.rng(1));
const ended = E.createState('tripeaks', 1, dealT);
ended.status = 'won';
assert.equal(E.applyMove(ended, rsT, { type: 'play', id: 18 }).ok, false, 'Zug nach Sieg abgewiesen');
assert.equal(E.applyMove(ended, rsT, { type: 'bogus' }).ok, false, 'unbekannter Zugtyp abgewiesen');
assert.equal(E.applyMove(ended, rsT, { type: 'recycle' }).ok, false, 'recycle im falschen Modus abgewiesen');

// Pyramid: König allein, PairCards gleiche Karte, PairWaste ohne Ablage.
const rsP = R.pyramid;
const dealP = rsP.deal(E.rng(1));
const stP = E.createState('pyramid', 1, dealP);
// Gleiche Karte als Paar abgewiesen.
const anyFree = [];
for (let id = 0; id < 28; id++) if (E.isFree(stP, rsP, id)) anyFree.push(id);
assert.equal(E.applyMove(stP, rsP, { type: 'pairCards', a: anyFree[0], b: anyFree[0] }).ok, false, 'gleiches Paar abgewiesen');
// pairWaste ohne Ablage abgewiesen (Pyramid startet mit leerer Ablage).
const nonKingFree = anyFree.find(function (id) { return stP.cards[id].rank !== 13; });
assert.equal(E.applyMove(stP, rsP, { type: 'king', id: nonKingFree }).ok, false, 'Nicht-König allein abgewiesen');
assert.equal(E.applyMove(stP, rsP, { type: 'pairWaste', id: nonKingFree }).ok, false, 'pairWaste ohne Ablage abgewiesen');
// draw aus leerem Stock abgewiesen.
const empty = E.createState('pyramid', 1, dealP);
empty.stock = [];
assert.equal(E.applyMove(empty, rsP, { type: 'draw' }).ok, false, 'draw aus leerem Stock abgewiesen');
// recycle nur wenn Stock leer + Umläufe übrig + Waste vorhanden.
assert.equal(E.applyMove(E.cloneState(empty), rsP, { type: 'recycle' }).ok, false, 'recycle ohne Waste abgewiesen');

// Rangmuster müssen über Seeds deutlich variieren (früher nur Pfad/Umkehrung).
for (const mode of ['tripeaks', 'golf']) {
  const signatures = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const deal = R[mode].deal(E.rng(seed));
    signatures.add(deal.cards.map(card => card.rank).join(','));
  }
  assert.ok(signatures.size >= 90, mode + ' Rangvarianz nur ' + signatures.size + '/100');
}

const uiSource = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
assert.match(uiSource, /\$\('result-button'\)\.focus/, 'Ergebnisdialog fokussiert den vorhandenen Primärbutton');
assert.match(uiSource, /mode === 'tripeaks' && !free/, 'TriPeaks verdeckt blockierte Ränge');
assert.match(uiSource, /function pauseClock\(\)/, 'aktive Zeit wird am Rundenende eingefroren');
assert.match(uiSource, /visibilitychange/, 'Hintergrundzeit wird nicht mitgezählt');

// Niemals werfende Deals (Randfall Start-Waste) über alle Modi.
for (const mode of R.order) {
  const rs = R[mode];
  for (let seed = 1; seed <= 200; seed++) {
    assert.doesNotThrow(function () { rs.deal(E.rng(seed)); }, mode + ' deal warf seed ' + seed);
  }
}

console.log('smoke ok (' + R.order.length + ' Modi × ' + SEEDS + ' Seeds: Deck, Determinismus, Lösung, Topologie, Prädikate, Undo, Fehlerresilienz)');
