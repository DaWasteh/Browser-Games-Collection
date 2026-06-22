const assert = require('node:assert/strict');
const fs = require('node:fs');
const logic = require('./tetris-logic.js');

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
assert.equal(logic.dropSpeedForLevel('hard', 99), 50);

const html = fs.readFileSync('tetris.html', 'utf8');
assert.match(html, /<script src="tetris-logic\.js"><\/script>/);
assert.doesNotMatch(html, /onclick=/);
assert.match(html, /data-difficulty="easy"/);
assert.match(html, /osc\.onended =/);
assert.match(html, /resetGameInterval\(\);/);

const workflow = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
assert.doesNotMatch(workflow, /htmlhint.*\|\| true/);
assert.match(workflow, /htmlhint@1\.9\.2/);
assert.match(workflow, /node-version: '24'/);
assert.match(workflow, /tetris-logic\.js/);
assert.match(workflow, /permissions:\n  contents: read/);
assert.match(workflow, /concurrency:\n      group: pages\n      cancel-in-progress: false/);
assert.doesNotMatch(workflow, /uses:\s+[^@\s]+@v\d+\b/);
assert.doesNotMatch(workflow, /echo "Branch: \$\{\{ github\.ref_name \}\}"/);
assert.doesNotMatch(workflow, /tetris-\$\{\{ github\.event\.release\.tag_name \}\}\.zip/);
assert.doesNotMatch(workflow, /gh release upload "\$\{\{ github\.event\.release\.tag_name \}\}"/);

console.log('smoke ok');
