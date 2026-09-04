const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Logic = require('./jewels-logic.js');

const C = {
  A: 'jade', B: 'amber', C: 'ruby', D: 'sapphire', E: 'amethyst', F: 'pearl'
};

function boardFromRows(rows) {
  return rows.map(row => [...row].map(letter => letter === '-' ? null : Logic.makeGem(C[letter], null)));
}

function gemMultiset(board) {
  return board.flat().filter(Boolean).map(gem => `${gem.color || '*'}:${gem.special || '-'}`).sort();
}

// Stable public contract.
assert.deepEqual(Logic.GEM_TYPES, ['jade', 'amber', 'ruby', 'sapphire', 'amethyst', 'pearl']);
assert.deepEqual(Logic.SPECIALS, ['row', 'column', 'bomb', 'prism']);
assert.equal(Logic.CONFIG.rows, 8);
assert.equal(Logic.CONFIG.cols, 8);
assert.equal(Logic.CONFIG.moves, 24);
assert.equal(Logic.CONFIG.target, 9000);
assert.equal(Logic.CONFIG.pandaCharge, 5);
assert.ok(Object.isFrozen(Logic.GEM_TYPES));
assert.ok(Object.isFrozen(Logic.CONFIG));
assert.ok(Object.isFrozen(Logic));
assert.deepEqual(Logic.makeGem('jade', 'row'), { color: 'jade', special: 'row' });
assert.deepEqual(Logic.makeGem('ruby', 'prism'), { color: null, special: 'prism' });
assert.throws(() => Logic.makeGem('unknown'), TypeError);
assert.throws(() => Logic.makeGem('jade', 'laser'), TypeError);

// Generated fields are deterministic, full, match-free and always playable.
for (let seed = 0; seed < 250; seed++) {
  const randomA = Logic.seededRandom(`board-${seed}`);
  const randomB = Logic.seededRandom(`board-${seed}`);
  const a = Logic.createBoard({ random: randomA });
  const b = Logic.createBoard({ random: randomB });
  assert.equal(Logic.boardSignature(a), Logic.boardSignature(b), 'same seed must create same board');
  assert.deepEqual(Logic.dimensions(a), { rows: 8, cols: 8 });
  assert.ok(a.every(row => row.length === 8 && row.every(Boolean)), 'board is full');
  assert.equal(Logic.findMatches(a).cells.length, 0, 'board begins without free matches');
  assert.ok(Logic.findValidMoves(a).length > 0, 'board begins with a valid move');
}
const constantBoard = Logic.createBoard({ random: () => 0 });
assert.equal(Logic.findMatches(constantBoard).cells.length, 0, 'constant RNG still yields stable board');
assert.ok(Logic.findValidMoves(constantBoard).length > 0, 'constant RNG still yields playable board');

// Match detection finds full runs and de-duplicates an overlapping T intersection.
const matchBoard = boardFromRows([
  'BCADB',
  'CAAAC',
  'DBACD',
  'ACBDB',
  'BADCB'
]);
const matches = Logic.findMatches(matchBoard);
assert.equal(matches.groups.length, 2);
assert.deepEqual(matches.groups.map(group => group.orientation).sort(), ['column', 'row']);
assert.equal(matches.cells.length, 5, 'T intersection belongs to both groups but is returned once');
assert.ok(matches.cells.some(cell => cell.row === 1 && cell.col === 2));

// Swaps clone deeply and adjacency is strictly orthogonal.
const base = Logic.createBoard({ random: Logic.seededRandom('clone') });
const baseSignature = Logic.boardSignature(base);
const swapped = Logic.swapCells(base, { row: 0, col: 0 }, { row: 0, col: 1 });
assert.equal(Logic.boardSignature(base), baseSignature, 'swap must not mutate input');
assert.notEqual(swapped[0][0], base[0][1], 'gems are cloned, not aliased');
swapped[0][0].color = 'ruby';
assert.equal(Logic.boardSignature(base), baseSignature, 'nested gem mutation cannot leak back');
assert.equal(Logic.isAdjacent({ row: 1, col: 1 }, { row: 1, col: 2 }), true);
assert.equal(Logic.isAdjacent({ row: 1, col: 1 }, { row: 2, col: 2 }), false);
assert.equal(Logic.isAdjacent({ row: 1, col: 1 }, { row: 1, col: 1 }), false);
assert.throws(() => Logic.swapCells(base, { row: -1, col: 0 }, { row: 0, col: 0 }), RangeError);

// Invalid adjacent moves return an unchanged board and no animation steps/score.
const invalidPair = (() => {
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const from = { row, col };
    for (const to of [{ row, col: col + 1 }, { row: row + 1, col }]) {
      if (Logic.inBounds(base, to) && !Logic.isProductiveSwap(base, from, to, false)) return { from, to };
    }
  }
  throw new Error('expected at least one invalid adjacent pair');
})();
const invalid = Logic.resolveTurn(base, invalidPair.from, invalidPair.to, { random: Logic.seededRandom('unused') });
assert.equal(invalid.valid, false);
assert.equal(invalid.reason, 'no-match');
assert.equal(invalid.score, 0);
assert.equal(invalid.steps.length, 0);
assert.equal(Logic.boardSignature(invalid.board), baseSignature);
assert.equal(Logic.resolveTurn(base, { row: 0, col: 0 }, { row: 2, col: 2 }).reason, 'distance');
assert.equal(Logic.resolveTurn(base, { row: 0, col: 0 }, { row: 0, col: 0 }).reason, 'same');
assert.equal(Logic.resolveTurn(base, { row: -1, col: 0 }, { row: 0, col: 0 }).reason, 'bounds');

// A standard valid move clears at least three, scores, and leaves a stable playable board.
const validMove = Logic.findValidMoves(base)[0];
const valid = Logic.resolveTurn(base, validMove.from, validMove.to, { random: Logic.seededRandom('resolve-valid') });
assert.equal(valid.valid, true);
assert.ok(valid.cleared >= 3);
assert.ok(valid.score >= 180);
assert.ok(valid.steps.length >= 1);
assert.equal(valid.steps[0].falls.length, 64, 'every settled destination has motion metadata');
assert.equal(new Set(valid.steps[0].falls.map(move => `${move.to.row}:${move.to.col}`)).size, 64, 'fall destinations are unique');
assert.equal(Logic.findMatches(valid.board).cells.length, 0);
assert.ok(Logic.findValidMoves(valid.board).length > 0);
assert.equal(Logic.boardSignature(base), baseSignature, 'valid resolution must not mutate input');

// Four in a row creates the expected horizontal line jewel at the moved destination.
const fourBoard = boardFromRows([
  'ABAAC',
  'BACDB',
  'CDBCD',
  'DCDBA',
  'BDCAB'
]);
assert.equal(Logic.findMatches(fourBoard).cells.length, 0);
const four = Logic.resolveTurn(fourBoard, { row: 1, col: 1 }, { row: 0, col: 1 }, { random: Logic.seededRandom('four'), colorCount: 5 });
assert.equal(four.valid, true);
assert.ok(four.steps[0].created.some(item => item.row === 0 && item.col === 1 && item.gem.special === 'row'));
assert.equal(four.steps[0].matched.length, 4);

// Five in a row creates a color-clearing prism.
const fiveBoard = boardFromRows([
  'AABAAC',
  'BCADBE',
  'CDBECD',
  'DCDEAB',
  'BEDABC',
  'EDCBED'
]);
assert.equal(Logic.findMatches(fiveBoard).cells.length, 0);
const five = Logic.resolveTurn(fiveBoard, { row: 1, col: 2 }, { row: 0, col: 2 }, { random: Logic.seededRandom('five') });
assert.equal(five.valid, true);
assert.ok(five.steps[0].created.some(item => item.row === 0 && item.col === 2 && item.gem.special === 'prism'));
assert.equal(five.steps[0].matched.length, 5);

// A T formation creates the 3×3 Pfotenbombe at its intersection.
const tBoard = boardFromRows([
  'BCADB',
  'AABAC',
  'DBACD',
  'CDBCA',
  'BADDB'
]);
assert.equal(Logic.findMatches(tBoard).cells.length, 0);
const tee = Logic.resolveTurn(tBoard, { row: 1, col: 3 }, { row: 1, col: 2 }, { random: Logic.seededRandom('tee'), colorCount: 5 });
assert.equal(tee.valid, true);
assert.ok(tee.steps[0].created.some(item => item.row === 1 && item.col === 2 && item.gem.special === 'bomb'));
assert.equal(tee.steps[0].matched.length, 5);

// Two disjoint T/L intersections in one Panda-Pfote move each create a bomb.
const multiTBoard = boardFromRows([
  'AACDEFA',
  'ABAEFAB',
  'CAEFABC',
  'DEFABCD',
  'EFABCBE',
  'FABCBAB',
  'ABCDEBA'
]);
assert.equal(Logic.findMatches(multiTBoard).cells.length, 0);
const multiT = Logic.resolveTurn(multiTBoard, { row: 1, col: 1 }, { row: 5, col: 5 }, { allowRemote: true, random: Logic.seededRandom('multi-tee') });
assert.equal(multiT.valid, true);
assert.deepEqual(multiT.steps[0].created.map(item => `${item.row}:${item.col}:${item.gem.special}`).sort(), ['1:1:bomb', '5:5:bomb']);
assert.equal(multiT.steps[0].matched.length, 10);

// Special expansion is recursive: row, column, bomb and prism all reach the right cells.
const specialBoard = boardFromRows([
  'ABCD',
  'BCDA',
  'CDAB',
  'DABC'
]);
specialBoard[1][1] = Logic.makeGem('ruby', 'row');
specialBoard[1][3] = Logic.makeGem('jade', 'column');
specialBoard[3][3] = Logic.makeGem('sapphire', 'bomb');
let expanded = Logic.expandSpecials(specialBoard, new Set(['1:1']), new Set());
assert.ok(['1:0', '1:1', '1:2', '1:3', '0:3', '2:3', '3:3', '2:2', '2:3', '3:2'].every(key => expanded.has(key)), 'specials trigger each other recursively');
const prismBoard = boardFromRows([
  'AAAB',
  'ACDB',
  'BCDA',
  'DABC'
]);
prismBoard[3][3] = Logic.makeGem('amber', 'prism');
expanded = Logic.expandSpecials(prismBoard, new Set(['3:3']), new Set());
assert.ok(expanded.has('0:0') && expanded.has('0:1') && expanded.has('0:2'), 'prism clears most common color');
assert.ok(expanded.has('3:3'));

// Gravity keeps the vertical order of survivors and retains their special type.
const gravityBoard = Logic.createEmptyBoard(4, 3);
gravityBoard[0][0] = Logic.makeGem('jade', 'row');
gravityBoard[2][0] = Logic.makeGem('ruby', null);
gravityBoard[1][1] = Logic.makeGem('amber', null);
const collapsed = Logic.collapseAndRefill(gravityBoard, () => 0, 4);
const gravityDetail = Logic.collapseAndRefillDetailed(gravityBoard, () => 0, 4);
assert.deepEqual(gravityDetail.board, collapsed, 'detailed gravity preserves the public board result');
assert.equal(collapsed[2][0].color, 'jade');
assert.equal(collapsed[2][0].special, 'row');
assert.equal(collapsed[3][0].color, 'ruby');
assert.equal(collapsed[3][1].color, 'amber');
assert.ok(collapsed.flat().every(Boolean));
assert.equal(gravityDetail.movements.length, 12);
assert.equal(gravityDetail.movements.filter(move => move.spawned).length, 9);
assert.ok(gravityDetail.movements.filter(move => move.spawned).every(move => move.from.row < 0 && move.distance > 0));
assert.deepEqual(
  gravityDetail.movements.find(move => !move.spawned && move.from.row === 0 && move.from.col === 0),
  { from: { row: 0, col: 0 }, to: { row: 2, col: 0 }, distance: 2, spawned: false }
);
assert.equal(new Set(gravityDetail.movements.map(move => `${move.to.row}:${move.to.col}`)).size, 12, 'gravity destinations are unique');

// Swapping a prism clears its partner color and can trigger special jewels of that color.
const prismSwapBoard = Logic.createBoard({ random: Logic.seededRandom('prism-swap-board') });
prismSwapBoard[0][0] = Logic.makeGem('jade', 'prism');
const targetColor = prismSwapBoard[0][1].color;
const targetBefore = prismSwapBoard.flat().filter(gem => gem && gem.color === targetColor).length;
const prismTurn = Logic.resolveTurn(prismSwapBoard, { row: 0, col: 0 }, { row: 0, col: 1 }, { random: Logic.seededRandom('prism-refill') });
assert.equal(prismTurn.valid, true);
assert.ok(prismTurn.steps[0].cleared.length >= targetBefore + 1);
assert.ok(prismTurn.steps[0].cleared.some(item => item.gem.special === 'prism'));

const prismChainBoard = boardFromRows(['ABCD', 'BCDA', 'CDAB', 'DABC']);
prismChainBoard[0][0] = Logic.makeGem('jade', 'prism');
prismChainBoard[2][3] = Logic.makeGem('amber', 'row');
const prismChain = Logic.resolveTurn(prismChainBoard, { row: 0, col: 0 }, { row: 0, col: 1 }, { random: Logic.seededRandom('prism-chain'), colorCount: 4 });
assert.ok(prismChain.steps[0].cleared.some(item => item.row === 2 && item.col === 3 && item.gem.special === 'row'));
assert.ok([0, 1, 2, 3].every(col => prismChain.steps[0].cleared.some(item => item.row === 2 && item.col === col)), 'prism-triggered line clears its row');

const doublePrismBoard = boardFromRows(['ABCD', 'BCDA', 'CDAB', 'DABC']);
doublePrismBoard[0][0] = Logic.makeGem('jade', 'prism');
doublePrismBoard[0][1] = Logic.makeGem('amber', 'prism');
const doublePrism = Logic.resolveTurn(doublePrismBoard, { row: 0, col: 0 }, { row: 0, col: 1 }, { random: Logic.seededRandom('double-prism'), colorCount: 4 });
assert.equal(doublePrism.steps[0].cleared.length, 16, 'two prisms clear the complete board');

// Panda-Pfote supports exactly the promised non-adjacent productive swap.
let remoteFixture = null;
for (let seed = 0; seed < 30 && !remoteFixture; seed++) {
  const board = Logic.createBoard({ random: Logic.seededRandom('remote-' + seed) });
  const positions = board.flatMap((row, r) => row.map((_gem, c) => ({ row: r, col: c })));
  for (let i = 0; i < positions.length && !remoteFixture; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (!Logic.isAdjacent(positions[i], positions[j]) && Logic.isProductiveSwap(board, positions[i], positions[j], true)) {
        remoteFixture = { board, from: positions[i], to: positions[j] };
        break;
      }
    }
  }
}
assert.ok(remoteFixture, 'a productive non-adjacent Panda-Pfote fixture exists');
assert.equal(Logic.isProductiveSwap(remoteFixture.board, remoteFixture.from, remoteFixture.to, false), false);
const remoteTurn = Logic.resolveTurn(remoteFixture.board, remoteFixture.from, remoteFixture.to, { allowRemote: true, random: Logic.seededRandom('remote-refill') });
assert.equal(remoteTurn.valid, true);
assert.equal(remoteTurn.usedPower, true);
assert.ok(remoteTurn.cleared >= 3);

// Reshuffling preserves the exact gem multiset whenever the bounded shuffle succeeds.
const shuffleSource = Logic.createBoard({ random: Logic.seededRandom('shuffle-source') });
shuffleSource[0][0] = Logic.makeGem('jade', 'row');
shuffleSource[1][1] = Logic.makeGem('amber', 'bomb');
const shuffledResult = Logic.reshuffleBoard(shuffleSource, Logic.seededRandom('shuffle-order'));
assert.equal(shuffledResult.changed, true);
if (shuffledResult.preserved) assert.deepEqual(gemMultiset(shuffledResult.board), gemMultiset(shuffleSource));
assert.equal(Logic.findMatches(shuffledResult.board).cells.length, 0);
assert.ok(Logic.findValidMoves(shuffledResult.board).length > 0);

// The round is meaningfully balanced: unlike the minimum possible score, the
// target is not guaranteed, while ordinary deterministic play can still win.
function playFirstMoves(seed) {
  const random = Logic.seededRandom(seed);
  let board = Logic.createBoard({ random });
  let score = 0;
  for (let turn = 0; turn < Logic.CONFIG.moves; turn++) {
    const move = Logic.findValidMoves(board)[0];
    const result = Logic.resolveTurn(board, move.from, move.to, { random });
    score += result.score;
    board = result.board;
  }
  return score;
}
assert.ok(Logic.CONFIG.moves * 3 * 60 < Logic.CONFIG.target, 'the loss branch is mathematically reachable');
assert.ok(playFirstMoves('outcome-0') < Logic.CONFIG.target, 'deterministic ordinary play can lose');
assert.ok(playFirstMoves('outcome-5') >= Logic.CONFIG.target, 'deterministic ordinary play can win');

// Stress thousands of real turn resolutions: no residual match, dead board or mutation leak.
for (let seed = 0; seed < 120; seed++) {
  const random = Logic.seededRandom('stress-' + seed);
  let board = Logic.createBoard({ random });
  for (let turn = 0; turn < 10; turn++) {
    const moves = Logic.findValidMoves(board);
    assert.ok(moves.length, `seed ${seed}, turn ${turn}: valid move exists`);
    const before = Logic.boardSignature(board);
    const result = Logic.resolveTurn(board, moves[turn % moves.length].from, moves[turn % moves.length].to, { random });
    assert.equal(result.valid, true, `seed ${seed}, turn ${turn}: selected move resolves`);
    assert.equal(Logic.boardSignature(board), before, `seed ${seed}, turn ${turn}: input not mutated`);
    assert.equal(Logic.findMatches(result.board).cells.length, 0, `seed ${seed}, turn ${turn}: stable board`);
    assert.ok(Logic.findValidMoves(result.board).length, `seed ${seed}, turn ${turn}: playable board`);
    assert.ok(result.steps.length > 0 && result.steps.length <= 40, `seed ${seed}, turn ${turn}: bounded cascades`);
    board = result.board;
  }
}

// Static page contract: standalone, accessible, animated, audible and collection-linked.
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const game = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
assert.match(html, /<html lang="de">/);
assert.match(html, /<title>Des Pandas Juwelen/);
assert.match(html, /href="\.\.\/index\.html"/);
assert.match(html, /src="jewels-logic\.js" defer/);
assert.match(html, /src="game\.js" defer/);
assert.match(html, /id="board" class="board" role="grid"[^>]+aria-rowcount="8"[^>]+aria-colcount="8"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /role="dialog" aria-modal="true"/);
assert.match(html, /Panda-Pfote/);
assert.match(html, /id="board-effects" class="board-effects"/);
assert.match(html, /id="level-banner" class="level-banner" hidden/);
assert.doesNotMatch(html, /onclick=/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /min-height: 2\.75rem/);
for (const animation of ['jewel-swap', 'jewel-reject', 'jewel-crack', 'jewel-fall', 'special-born', 'jewel-victory', 'jewel-shuffle-out', 'prism-glow']) {
  assert.match(css, new RegExp('@keyframes ' + animation), `${animation} animation exists`);
}
assert.match(game, /AudioContext \|\| window\.webkitAudioContext/);
assert.match(game, /oscillator\.onended =/);
assert.match(game, /masterGain\.gain\.value = 0/);
assert.match(game, /rowElement\.setAttribute\('role', 'row'\)/);
assert.match(game, /addEventListener\('pointerdown'/);
assert.match(game, /setPointerCapture/);
assert.match(game, /preventDefault\(\)/);
assert.match(game, /waitForMotion/);
assert.match(game, /movement\.distance/);
assert.match(game, /state\.status = 'celebrating'/);
assert.match(game, /Logic\.createEmptyBoard\(Logic\.CONFIG\.rows, Logic\.CONFIG\.cols\)/);
assert.match(game, /window\.PandaJewels = Object\.freeze/);
assert.doesNotMatch(game, /\.innerHTML\s*=/);
for (const file of ['jewels-logic.js', 'game.js', 'styles.css', 'README.md']) {
  assert.ok(fs.existsSync(path.join(__dirname, file)), `${file} exists`);
}
assert.ok(fs.existsSync(path.join(__dirname, '..', 'index.html')), 'collection launcher exists');

console.log('panda jewels smoke ok');
