const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const logic = require('./minesweeper-logic.js');

// ============================================================
// 1) Konstanten / Konfiguration
// ============================================================
assert.equal(logic.STATE.HIDDEN, 0);
assert.equal(logic.STATE.REVEALED, 1);
assert.equal(logic.STATE.FLAGGED, 2);
assert.equal(logic.DIFFICULTY.easy.rows, 9);
assert.equal(logic.DIFFICULTY.easy.cols, 9);
assert.equal(logic.DIFFICULTY.easy.mines, 10);
assert.equal(logic.DIFFICULTY.medium.rows, 16);
assert.equal(logic.DIFFICULTY.medium.mines, 40);
assert.equal(logic.DIFFICULTY.hard.rows, 16);
assert.equal(logic.DIFFICULTY.hard.cols, 30);
assert.equal(logic.DIFFICULTY.hard.mines, 99);
assert.equal(logic.DIFFICULTY.insane.rows, 24);
assert.equal(logic.DIFFICULTY.insane.cols, 24);
assert.equal(logic.DIFFICULTY.insane.mines, 150);
assert.deepEqual(logic.DIFFICULTY_ORDER, ['easy', 'medium', 'hard', 'insane']);

// Object.freeze prüfen (Konvention aus Tetris-Vorbild)
assert.ok(Object.isFrozen(logic.DIFFICULTY));
assert.ok(Object.isFrozen(logic.DIFFICULTY.easy));

// ============================================================
// 2) createBoard
// ============================================================
const b0 = logic.createBoard(5, 7);
assert.equal(b0.rows, 5);
assert.equal(b0.cols, 7);
assert.equal(b0.grid.length, 5);
assert.equal(b0.grid[0].length, 7);
for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 7; c++) {
        const cell = b0.grid[r][c];
        assert.equal(cell.mine, false, 'mine default false');
        assert.equal(cell.state, logic.STATE.HIDDEN, 'state default HIDDEN');
        assert.equal(cell.adjacent, 0, 'adjacent default 0');
    }
}

// ============================================================
// 3) Safe-3×3-Erstklick (Ecke): safeR:0, safeC:0 → nur 4 sichere Zellen
// ============================================================
const bCorner = logic.createBoard(9, 9);
logic.placeMines(bCorner, { mines: 10, safeR: 0, safeC: 0 }, () => 0);
let mineCount = countMines(bCorner);
assert.equal(mineCount, 10, 'genau 10 Minen platziert');
// 2×2-Eck-Safe-Zone (Ränder beschnitten): (0,0)(0,1)(1,0)(1,1)
assert.equal(bCorner.grid[0][0].mine, false);
assert.equal(bCorner.grid[0][1].mine, false);
assert.equal(bCorner.grid[1][0].mine, false);
assert.equal(bCorner.grid[1][1].mine, false);

// ============================================================
// 4) Safe-3×3-Erstklick (Mitte): safeR:4, safeC:4 → alle 9 Zellen minenfrei
// ============================================================
const bMid = logic.createBoard(9, 9);
logic.placeMines(bMid, { mines: 10, safeR: 4, safeC: 4 }, () => 0);
for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
        assert.equal(bMid.grid[4 + dr][4 + dc].mine, false, 'Mitte Safe-Zone minenfrei');
    }
}
assert.equal(bMid.grid[4][4].adjacent, 0, 'angeklickte Zelle = 0 (Nachbarn minenfrei)');
assert.equal(countMines(bMid), 10);

// ============================================================
// 5) Safe-3×3-Erstklick (Kante): safeR:0, safeC:4 → 6 sichere Zellen
// ============================================================
const bEdge = logic.createBoard(9, 9);
logic.placeMines(bEdge, { mines: 10, safeR: 0, safeC: 4 }, () => 0);
// Safe-Zone: r in {0,1}, c in {3,4,5} → 6 Zellen
for (let r = 0; r <= 1; r++) {
    for (let c = 3; c <= 5; c++) {
        assert.equal(bEdge.grid[r][c].mine, false, 'Kanten-Safe-Zone minenfrei');
    }
}
assert.equal(bEdge.grid[0][4].adjacent, 0);
assert.equal(countMines(bEdge), 10);

// ============================================================
// 6) countAdjacentMines (hart-codiertes Fixture)
// ============================================================
const bAdj = logic.createBoard(3, 3);
bAdj.grid[0][0].mine = true;
bAdj.grid[2][2].mine = true;
logic.recomputeAdjacency(bAdj);
assert.equal(logic.countAdjacentMines(bAdj, 1, 1), 2);
assert.equal(bAdj.grid[1][1].adjacent, 2);
assert.equal(bAdj.grid[0][1].adjacent, 1);
assert.equal(bAdj.grid[2][1].adjacent, 1); // Nachbar (2,2) ist Mine

// ============================================================
// 7) Flood-Fill: 0-Zelle → deckt verbundene 0-Region + Ring auf
// ============================================================
const bFlood = logic.createBoard(5, 5);
// Minen so platzieren, dass (0,0) eine 0 ist und sich Flood ausbreitet.
// Nur in der unteren rechten Ecke Minen, sodass obere linke Region frei.
bFlood.grid[4][4].mine = true;
bFlood.grid[4][3].mine = true;
logic.recomputeAdjacency(bFlood);
const beforeRevealed = logic.countRevealed(bFlood);
assert.equal(beforeRevealed, 0);
const res = logic.reveal(bFlood, 0, 0);
assert.equal(res.hitMine, false);
assert.ok(res.revealed.length > 1, 'Flood deckt mehrere Zellen auf');
assert.equal(logic.countRevealed(bFlood), res.revealed.length);
assert.equal(bFlood.grid[4][4].state, logic.STATE.HIDDEN, 'Mine nicht aufgedeckt');
assert.equal(bFlood.grid[4][3].state, logic.STATE.HIDDEN);

// ============================================================
// 8) Chord: passende Flaggenzahl → deckt ungeflaggte Nachbarn auf
// ============================================================
const bChord = logic.createBoard(3, 3);
bChord.grid[0][0].mine = true;
bChord.grid[0][2].mine = true;
logic.recomputeAdjacency(bChord);
// (0,1) ist REVEALED mit adjacent=2; beide Nachbarn minenbefüllt.
logic.reveal(bChord, 1, 1); // deckt (1,1) auf, ist 0? Nein — prüfen:
// (1,1)-Nachbarn: alle 8 = (0,0)..(2,2); davon (0,0) und (0,2) Minen → adjacent=2,
// also kein Flood. Reveal von (1,1) deckt nur (1,1) auf.
assert.equal(bChord.grid[1][1].adjacent, 2);
// Beide Minen-Nachbarn flaggen, dann Chord auf (1,1)
logic.toggleFlag(bChord, 0, 0);
logic.toggleFlag(bChord, 0, 2);
const chordRes = logic.chord(bChord, 1, 1);
// (0,0) und (0,2) sind geflaggt → Chord deckt nur UNgeflaggte Nachbarn auf.
// Ungeflaggte Nachbarn von (1,1): (0,1),(1,0),(1,2),(2,0),(2,1),(2,2) — keine Mine → kein Treffer.
assert.equal(chordRes.hitMine, false, 'Chord deckt nur ungeflaggte Nachbarn, keine Minen hier');
assert.ok(chordRes.revealed.length >= 5, 'Chord deckt mehrere ungeflaggte Nachbarn');

// Falsche Flaggenzahl → keine Aktion
const bChord2 = logic.createBoard(3, 3);
bChord2.grid[0][0].mine = true;
logic.recomputeAdjacency(bChord2);
logic.reveal(bChord2, 1, 1); // adjacent=1
const noChord = logic.chord(bChord2, 1, 1); // 0 Flags, benötigt 1 → keine Aktion
assert.equal(noChord.revealed.length, 0);
assert.equal(noChord.hitMine, false);

// ============================================================
// 9) toggleFlag: nur hidden <-> flagged, nie revealed
// ============================================================
const bFlag = logic.createBoard(2, 2);
assert.equal(logic.toggleFlag(bFlag, 0, 0), logic.STATE.FLAGGED);
assert.equal(logic.toggleFlag(bFlag, 0, 0), logic.STATE.HIDDEN);
logic.reveal(bFlag, 1, 1); // revealed
const stateBefore = bFlag.grid[1][1].state;
logic.toggleFlag(bFlag, 1, 1);
assert.equal(bFlag.grid[1][1].state, stateBefore, 'auf revealed kein Flag-Toggle');
assert.equal(logic.countFlags(bFlag), 0);

// ============================================================
// 10) checkWin: true wenn alle Nicht-Minen aufgedeckt (Flags egal)
// ============================================================
const bWin = logic.createBoard(3, 3);
bWin.grid[2][2].mine = true;
logic.recomputeAdjacency(bWin);
assert.equal(logic.checkWin(bWin), false);
logic.reveal(bWin, 0, 0); // Flood deckt fast alles auf (Mine bei (2,2) stoppt Ring)
// Alle Nicht-Minen aufdecken (Mine bleibt zu)
for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
        if (!bWin.grid[r][c].mine && bWin.grid[r][c].state === logic.STATE.HIDDEN) {
            logic.reveal(bWin, r, c);
        }
    }
}
assert.equal(logic.checkWin(bWin), true, 'Sieg auch ohne gesetzte Flags');

// ============================================================
// 11) Edge/Dichte-Guard: zu viele Minen werfen sauber (kein Endlosloop)
// ============================================================
const bTiny = logic.createBoard(2, 2);
assert.throws(
    () => logic.placeMines(bTiny, { mines: 5, safeR: 0, safeC: 0 }, () => 0),
    RangeError
);

// ============================================================
// 11b) cellLabel: eindeutige aria-labels auch bei >26 Spalten (z. B. 16×30)
// ============================================================
assert.equal(logic.cellLabel(logic.createBoard(1, 1), 0, 0), 'Z1A');
assert.equal(logic.cellLabel(logic.createBoard(1, 30), 0, 25), 'Z1Z');
// Spalten >= 26 bekommen Zwei-Buchstaben-Namen (keine Kollision mit A..Z)
assert.equal(logic.cellLabel(logic.createBoard(1, 30), 0, 26), 'Z1AA');
assert.equal(logic.cellLabel(logic.createBoard(1, 30), 0, 29), 'Z1AD');
assert.equal(logic.cellLabel(logic.createBoard(1, 53), 0, 52), 'Z1BA');
assert.equal(logic.cellLabel(logic.createBoard(40, 40), 39, 39), 'Z40AN');
// Eindeutigkeit über alle Zellen eines 16×30-Boards (Expertenstufe)
const bWide = logic.createBoard(16, 30);
const wideLabels = new Set();
for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 30; c++) {
        wideLabels.add(logic.cellLabel(bWide, r, c));
    }
}
assert.equal(wideLabels.size, 16 * 30, 'alle 480 Zell-Labels eindeutig');

// ============================================================
// 12) Determinismus: () => 0 vs () => 0.999 → reproduzierbar, Safe-Zone respektiert
// ============================================================
function snapshot(b) {
    const out = [];
    for (let r = 0; r < b.rows; r++) {
        const row = [];
        for (let c = 0; c < b.cols; c++) row.push(b.grid[r][c].mine ? 1 : 0);
        out.push(row.join(''));
    }
    return out.join('|');
}
const dA1 = logic.createBoard(9, 9);
logic.placeMines(dA1, { mines: 10, safeR: 4, safeC: 4 }, () => 0);
const dA2 = logic.createBoard(9, 9);
logic.placeMines(dA2, { mines: 10, safeR: 4, safeC: 4 }, () => 0);
assert.equal(snapshot(dA1), snapshot(dA2), 'gleicher RNG → gleiches Board');

const dB = logic.createBoard(9, 9);
logic.placeMines(dB, { mines: 10, safeR: 4, safeC: 4 }, () => 0.999);
// Beide Boards respektieren Safe-Zone
for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
        assert.equal(dA1.grid[4 + dr][4 + dc].mine, false);
        assert.equal(dB.grid[4 + dr][4 + dc].mine, false);
    }
}
assert.equal(countMines(dA1), 10);
assert.equal(countMines(dB), 10);

// Reveal einer geflaggten Zelle → keine Aktion
const bNoFlagReveal = logic.createBoard(3, 3);
logic.toggleFlag(bNoFlagReveal, 0, 0);
const rfr = logic.reveal(bNoFlagReveal, 0, 0);
assert.equal(rfr.revealed.length, 0);
assert.equal(bNoFlagReveal.grid[0][0].state, logic.STATE.FLAGGED);

// Reveal einer bereits revealed Zelle → keine Aktion
const bDouble = logic.createBoard(3, 3);
logic.reveal(bDouble, 0, 0);
const n1 = logic.countRevealed(bDouble);
logic.reveal(bDouble, 0, 0);
assert.equal(logic.countRevealed(bDouble), n1);

// Hilfsfunktion
function countMines(b) {
    let n = 0;
    for (let r = 0; r < b.rows; r++)
        for (let c = 0; c < b.cols; c++)
            if (b.grid[r][c].mine) n++;
    return n;
}

// ============================================================
// HTML-Pattern-Tests
// ============================================================
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert.match(html, /<script src="minesweeper-logic\.js"><\/script>/, 'Logik-Script-Tag');
assert.match(html, /<script src="minesweeper\.js"><\/script>/, 'UI-Script-Tag');
assert.doesNotMatch(html, /onclick=/, 'keine Inline-Handler');
assert.match(html, /lang="de"/, 'lang=de');
assert.match(html, /aria-label="Zur Spieleauswahl"/, 'Back-Link aria-label');
assert.match(html, /data-difficulty="easy"/);
assert.match(html, /data-difficulty="medium"/);
assert.match(html, /data-difficulty="hard"/);
assert.match(html, /data-difficulty="insane"/, 'vierte Stufe insane');
assert.match(html, /data-difficulty="custom"/, 'benutzerdefiniert');
assert.match(html, /aria-live="polite"/, 'aria-live Region');
assert.match(html, /role="grid"/, 'role=grid für Spielfeld');
assert.match(html, /\.\.\/index\.html/, 'Back-Link zur Collection');

// CSS-Datei referenziert
assert.match(html, /href="minesweeper\.css"/);

// JS-Dateien: Konventionen (Sound-Cleanup, preventDefault, localStorage)
const uiJs = fs.readFileSync(path.join(__dirname, 'minesweeper.js'), 'utf8');
assert.match(uiJs, /osc\.onended =/, 'Sound-Cleanup-Konvention');
assert.match(uiJs, /preventDefault/, 'Kontextmenü/Touch unterdrückt');
assert.match(uiJs, /localStorage/, 'Bestzeiten via localStorage');
assert.match(uiJs, /function visibleModal\(\)/, 'Modaler Tab-Fokus wird eingefangen');
assert.match(uiJs, /longPressFired bis touchend gesetzt lassen/, 'Contextmenu löscht den Long-Press-Schutz nicht vor touchend');
assert.match(uiJs, /case 'F':[\s\S]*?initAudio\(\);[\s\S]*?doFlag/, 'Tastatur-Flag initialisiert Audio');
assert.doesNotMatch(uiJs, /\.innerHTML\s*=/, 'kein innerHTML im UI-Code');

// Datei-Existenz-Prüfungen
assert.ok(fs.existsSync(path.join(__dirname, 'minesweeper-logic.js')), 'logic file');
assert.ok(fs.existsSync(path.join(__dirname, 'minesweeper.js')), 'ui file');
assert.ok(fs.existsSync(path.join(__dirname, 'minesweeper.css')), 'css file');
assert.ok(fs.existsSync(path.join(__dirname, 'README.md')), 'README');

// Back-Link-Ziel existiert (Spieleauswahl)
assert.ok(fs.existsSync(path.join(__dirname, '..', 'index.html')), 'Collection-Index');

console.log('smoke ok');
