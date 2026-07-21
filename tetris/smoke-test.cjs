const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const gameDir = __dirname;
const repoRoot = path.resolve(gameDir, '..');
const logic = require(path.join(gameDir, 'tetris-logic.js'));

assert.equal(logic.COLS, 10);
assert.equal(logic.ROWS, 20);
assert.equal(logic.createBoard().length, 20);

const iPiece = logic.randomPiece(() => 0);
assert.equal(iPiece.id, 1);
assert.deepEqual(logic.rotate([[1, 2, 3]]), [[1], [2], [3]]);

const board = logic.createBoard();
board[19].fill(1);
const cleared = logic.clearCompletedRows(board);
assert.equal(cleared.cleared, 1);
assert.deepEqual(cleared.board[0], Array(logic.COLS).fill(0));
assert.deepEqual(cleared.clearedRows[0].cells, Array(logic.COLS).fill(1));

assert.equal(logic.collides(logic.createBoard(), iPiece, 0, 0), false);
assert.equal(logic.collides(logic.createBoard(), iPiece, -1, 0), true);
assert.equal(logic.lineScore(4, 2), 1600);
assert.equal(logic.lineScore(0, 1), 0, 'lineScore(0) darf nicht zu 800 werden');
assert.equal(logic.lineScore(0, 5), 0, 'lineScore(0) bei Level 5 bleibt 0');
assert.equal(logic.lineScore(2, 3), 900);
assert.equal(logic.dropSpeedForLevel('hard', 99), 50);

const html = fs.readFileSync(path.join(gameDir, 'tetris.html'), 'utf8');
assert.match(html, /<script src="tetris-logic\.js"><\/script>/);
assert.doesNotMatch(html, /onclick=/);
assert.match(html, /data-difficulty="easy"/);
assert.match(html, /osc\.onended =/);
assert.match(html, /resetGameInterval\(\);/);
assert.match(html, /href="\.\.\/index\.html"/);
// Tastatur-Pfeile und Game-Over/High-Score aus dem Audit
assert.match(html, /aria-live="polite"/, 'aria-live-Ansage für Spielzustand');
assert.match(html, /tetris_highscore/, 'High-Score-Persistenz');
assert.match(html, /role="dialog" aria-modal="true"/, 'Menü-Dialog-Semantik');
assert.match(html, /function setMenuModal\(open\)/, 'Menü setzt den Hintergrund inert');
assert.match(html, /const newBest = saveHighScore\(\)/, 'Game-Over-Ansage unterscheidet Rekord und Gleichstand');

const launcher = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
assert.match(launcher, /href="tetris\/tetris\.html"/);

const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/pages.yml'), 'utf8');
assert.match(workflow, /permissions:\n  contents: read/);
assert.match(workflow, /uses: actions\/upload-pages-artifact@v3/);
assert.match(workflow, /path: \./);

console.log('smoke ok');
