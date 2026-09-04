const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Logic = require('./bubble-logic.js');

function emptyBoard(rows, topParity = 0) {
  return Array.from({ length: rows }, (_, row) => Logic.emptyRow(row, topParity));
}

function countBubbles(board) {
  return board.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
}

// Public constants are stable and immutable.
assert.deepEqual(Logic.COLORS, ['rose', 'gold', 'mint', 'sky', 'violet', 'coral']);
assert.equal(Logic.CONFIG.cols, 10);
assert.equal(Logic.CONFIG.initialRows, 6);
assert.equal(Logic.CONFIG.dangerRow, 12);
assert.equal(Logic.CONFIG.missesPerRow, 5);
assert.ok(Object.isFrozen(Logic.COLORS));
assert.ok(Object.isFrozen(Logic.CONFIG));
assert.ok(Object.isFrozen(Logic));

// Staggered rows keep the intended 10/9-cell honeycomb geometry.
assert.deepEqual([0, 1, 2, 3].map(row => Logic.rowLength(row, 0)), [10, 9, 10, 9]);
assert.deepEqual([0, 1, 2, 3].map(row => Logic.rowLength(row, 1)), [9, 10, 9, 10]);
assert.deepEqual([0, 1, 2, 3].map(row => Logic.rowParity(row, 0)), [0, 1, 0, 1]);

// Every reported neighbor relationship is symmetric and bounded to a real row shape.
for (const topParity of [0, 1]) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < Logic.rowLength(row, topParity); col++) {
      const around = Logic.neighbors(row, col, topParity);
      assert.ok(around.length >= 2 && around.length <= 6);
      assert.equal(new Set(around.map(cell => `${cell.row}:${cell.col}`)).size, around.length, 'neighbors unique');
      for (const cell of around) {
        assert.ok(cell.row >= 0);
        assert.ok(cell.col >= 0 && cell.col < Logic.rowLength(cell.row, topParity));
        assert.ok(Logic.neighbors(cell.row, cell.col, topParity).some(other => other.row === row && other.col === col), 'neighbor symmetry');
      }
    }
  }
}

// Seeded board generation is reproducible, correctly shaped and palette-limited.
for (let seed = 0; seed < 100; seed++) {
  const a = Logic.createInitialBoard({ rows: 6, colorCount: 5, random: Logic.seededRandom(`seed-${seed}`) });
  const b = Logic.createInitialBoard({ rows: 6, colorCount: 5, random: Logic.seededRandom(`seed-${seed}`) });
  assert.deepEqual(a, b, 'same seed must yield the same board');
  assert.deepEqual(a.map(row => row.length), [10, 9, 10, 9, 10, 9]);
  assert.equal(countBubbles(a), 57);
  assert.ok(a.flat().every(color => Logic.COLORS.slice(0, 5).includes(color)));
}

// Connected-component lookup follows diagonal hex neighbors, not square-grid corners.
const clusterBoard = emptyBoard(3);
clusterBoard[0][0] = 'rose';
clusterBoard[0][1] = 'rose';
clusterBoard[1][0] = 'rose';
clusterBoard[2][2] = 'rose';
assert.equal(Logic.getCluster(clusterBoard, 1, 0, 'rose', 0).length, 3);
assert.equal(Logic.getCluster(clusterBoard, 2, 2, 'rose', 0).length, 1);
assert.equal(Logic.getCluster(clusterBoard, 2, 2, 'sky', 0).length, 0);

// A matching placement pops its whole group and drops all bubbles disconnected from the ceiling.
const dropBoard = emptyBoard(3);
dropBoard[0][0] = 'rose';
dropBoard[0][1] = 'rose';
dropBoard[1][0] = 'rose';
dropBoard[2][0] = 'sky'; // connected only through row 1, col 0
const beforeDrop = JSON.stringify(dropBoard);
const dropResult = Logic.resolvePlacement(dropBoard, 1, 1, 'rose', 0);
assert.equal(JSON.stringify(dropBoard), beforeDrop, 'resolvePlacement must not mutate its input');
assert.equal(dropResult.popped, 4);
assert.equal(dropResult.dropped.length, 1);
assert.equal(dropResult.dropped[0].color, 'sky');
assert.equal(dropResult.score, 4 * 100 + 150);
assert.equal(dropResult.cleared, true);
assert.equal(countBubbles(dropResult.board), 0);

// A non-match remains on the board and does not award points.
const missBoard = emptyBoard(2);
missBoard[0][0] = 'gold';
const missResult = Logic.resolvePlacement(missBoard, 1, 0, 'rose', 0);
assert.equal(missResult.popped, 0);
assert.equal(missResult.dropped.length, 0);
assert.equal(missResult.score, 0);
assert.equal(Logic.getCell(missResult.board, 1, 0), 'rose');
assert.equal(Logic.getCell(missBoard, 1, 0), null, 'input remains unchanged');
assert.throws(() => Logic.resolvePlacement(missResult.board, 1, 0, 'sky', 0), /belegt/);
assert.throws(() => Logic.resolvePlacement(missBoard, -1, 0, 'sky', 0), RangeError);
assert.throws(() => Logic.resolvePlacement(missBoard, 1, 0, 'unknown', 0), TypeError);

// Rainbow chooses the adjacent color producing the largest cluster.
const rainbowBoard = emptyBoard(2);
rainbowBoard[0][0] = 'rose';
rainbowBoard[0][1] = 'rose';
rainbowBoard[0][3] = 'sky';
assert.equal(Logic.bestRainbowColor(rainbowBoard, 1, 0, 0), 'rose');
const rainbowResult = Logic.resolvePlacement(rainbowBoard, 1, 0, 'rainbow', 0);
assert.equal(rainbowResult.placedColor, 'rose');
assert.equal(rainbowResult.popped, 3);

// Ceiling connectivity includes every occupied component touching row zero only.
const supportBoard = emptyBoard(4);
supportBoard[0][4] = 'gold';
supportBoard[1][3] = 'mint';
supportBoard[2][4] = 'sky';
supportBoard[3][0] = 'violet';
const connected = Logic.getCeilingConnected(supportBoard, 0);
assert.ok(connected.has('0:4'));
assert.ok(connected.has('1:3'));
assert.ok(connected.has('2:4'));
assert.ok(!connected.has('3:0'));

// Adding pressure flips the top parity but preserves every existing bubble's x coordinate.
const pressureBoard = Logic.createInitialBoard({ rows: 4, random: Logic.seededRandom('pressure') });
const oldX = Logic.cellCenter(2, 4, 0).x;
const pressure = Logic.addPressureRow(pressureBoard, 0, ['rose', 'sky'], () => .999);
assert.equal(pressure.topParity, 1);
assert.equal(pressure.board.length, pressureBoard.length + 1);
assert.equal(pressure.added.length, 9);
assert.ok(pressure.added.every(color => color === 'sky'));
assert.equal(Logic.cellCenter(3, 4, pressure.topParity).x, oldX, 'old rows must not jump sideways');
assert.equal(Logic.cellCenter(3, 4, pressure.topParity).y - Logic.cellCenter(2, 4, 0).y, Logic.CONFIG.rowHeight);
assert.equal(pressureBoard.length, 4, 'pressure addition must not mutate input');

// Snap candidates are empty, supported cells; nearest choice is deterministic.
const snapBoard = Logic.createInitialBoard({ rows: 2, random: () => 0 });
const attachable = Logic.getAttachableCells(snapBoard, 0);
assert.ok(attachable.length > 0);
assert.ok(attachable.every(cell => !Logic.getCell(snapBoard, cell.row, cell.col)));
assert.ok(attachable.every(cell => cell.row === 0 || Logic.neighbors(cell.row, cell.col, 0).some(n => Logic.getCell(snapBoard, n.row, n.col))));
const expected = attachable[3];
const center = Logic.cellCenter(expected.row, expected.col, 0);
assert.deepEqual(Logic.nearestAttachableCell(snapBoard, 0, center.x, center.y), { row: expected.row, col: expected.col, distance: 0 });
const empty = [];
assert.equal(Logic.getAttachableCells(empty, 0).length, 10, 'empty field accepts ceiling placements');

// Runtime and preview share one fixed-distance trace, so frame rate/reduced motion
// can alter only duration, never the collision cell or snap contact.
const traceBoard = Logic.createInitialBoard({ rows: 6, random: Logic.seededRandom('trace') });
const straightTrace = Logic.traceShot(traceBoard, 0, 0, { startX: 300, startY: 699, wall: 30, step: 4 });
assert.equal(straightTrace.contact.type, 'bubble');
assert.equal(straightTrace.banked, false);
assert.ok(straightTrace.points.length > 50);
const shallowTrace = Logic.traceShot(traceBoard, 0, 1.24, { startX: 300, startY: 699, wall: 30, step: 4 });
assert.equal(shallowTrace.contact.type, 'bubble', 'maximum valid angle reaches the board');
assert.equal(shallowTrace.banked, true);
assert.ok(shallowTrace.points.some(point => point.bounced), 'wall contact is represented in the shared path');
assert.ok(shallowTrace.points.length < 2000, 'trace terminates at contact');
const repeatedTrace = Logic.traceShot(traceBoard, 0, 1.24, { startX: 300, startY: 699, wall: 30, step: 4 });
assert.deepEqual(shallowTrace, repeatedTrace, 'identical aim and board produce an identical path');
for (let index = 1; index < shallowTrace.points.length; index++) {
  const dx = shallowTrace.points[index].x - shallowTrace.points[index - 1].x;
  const dy = shallowTrace.points[index].y - shallowTrace.points[index - 1].y;
  assert.ok(Math.hypot(dx, dy) <= 4.01, 'trace uses collision-safe substeps');
}

// Loss boundary is exact: row 11 is safe, row 12 ends the round.
const safeBoard = emptyBoard(12);
safeBoard[11][0] = 'coral';
assert.equal(Logic.isLoss(safeBoard), false);
const losingBoard = emptyBoard(13);
losingBoard[12][0] = 'coral';
assert.equal(Logic.isLoss(losingBoard), true);
assert.equal(Logic.isLoss(losingBoard, 13), false);

// Panda power rewards only successful clears and adds a meaningful bank bonus.
assert.equal(Logic.powerGain(2, 20, true), 0);
assert.equal(Logic.powerGain(3, 0, false), 24);
assert.equal(Logic.powerGain(3, 0, true), 44);
assert.equal(Logic.powerGain(3, 99, false), 40, 'drop bonus is capped');
assert.equal(Logic.chargePower(88, 3, 0, false), 100);
assert.equal(Logic.chargePower(-10, 2, 0, true), 0);
assert.equal(Logic.shouldQueueRainbow(100, 'rose'), true);
assert.equal(Logic.shouldQueueRainbow(100, 'rainbow'), false);
assert.equal(Logic.shouldQueueRainbow(99, 'rose'), false);
assert.equal(Logic.powerAfterLaunch(100, 'rose'), 100, 'normal bubble preserves charge until queue advancement');
assert.equal(Logic.powerAfterLaunch(100, 'rainbow'), 0, 'launching the Bamboo bubble consumes charge');

// Thousands of complete, trajectory-driven random shots remain bounded and
// exercise pressure, bank shots, ordinary clears and Bamboo-bubble launches.
let simulatedShots = 0;
let simulatedPops = 0;
let simulatedRainbows = 0;
for (let seed = 0; seed < 200; seed++) {
  const random = Logic.seededRandom('stress-' + seed);
  let board = Logic.createInitialBoard({ rows: 6, colorCount: 5, random });
  let topParity = 0;
  let misses = Logic.CONFIG.missesPerRow;
  let power = 0;
  const pick = () => {
    const available = Logic.availableColors(board);
    const palette = available.length ? available : Logic.COLORS.slice(0, 5);
    return palette[Math.floor(random() * palette.length)];
  };
  let current = pick();
  let next = pick();
  let terminal = false;
  for (let shot = 0; shot < 80; shot++) {
    simulatedShots++;
    if (current === 'rainbow') simulatedRainbows++;
    const trace = Logic.traceShot(board, topParity, -1.24 + random() * 2.48, { startX: 300, startY: 699, wall: 30, step: 4 });
    assert.ok(trace.contact, `seed ${seed}, shot ${shot}: trajectory reaches a collision`);
    const point = trace.points.at(-1);
    const target = Logic.nearestAttachableCell(board, topParity, point.x, point.y);
    if (!target) { terminal = true; break; }
    power = Logic.powerAfterLaunch(power, current);
    const result = Logic.resolvePlacement(board, target.row, target.col, current, topParity);
    const successful = result.popped >= 3;
    board = result.board;
    if (successful) {
      simulatedPops++;
      power = Logic.chargePower(power, result.popped, result.dropped.length, trace.banked);
      misses = Logic.CONFIG.missesPerRow;
    } else misses--;
    if (result.cleared || Logic.isLoss(board)) { terminal = true; break; }
    if (!successful && misses <= 0) {
      const pressureResult = Logic.addPressureRow(board, topParity, Logic.availableColors(board), random);
      board = pressureResult.board;
      topParity = pressureResult.topParity;
      misses = Logic.CONFIG.missesPerRow;
    }
    if (Logic.isLoss(board)) { terminal = true; break; }
    if (Logic.shouldQueueRainbow(power, current)) current = 'rainbow';
    else { current = next; next = pick(); }
  }
  assert.equal(terminal, true, `seed ${seed}: random-play round terminates within its bound`);
}
assert.ok(simulatedShots > 3000);
assert.ok(simulatedPops > 300);
assert.ok(simulatedRainbows > 25);

// Static page contract: standalone, accessible, animated, audible and collection-linked.
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const game = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
assert.match(html, /<html lang="de">/);
assert.match(html, /<title>Panda: Jäger der Blasen/);
assert.match(html, /href="\.\.\/index\.html"/);
assert.match(html, /src="bubble-logic\.js" defer/);
assert.match(html, /src="game\.js" defer/);
assert.match(html, /id="game-canvas"[^>]+tabindex="0"[^>]+role="application"[^>]+board-description/);
assert.match(html, /id="board-description" class="sr-only"/);
assert.match(html, /id="current-name"/);
assert.match(html, /id="next-name"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /role="dialog" aria-modal="true"/);
assert.match(html, /Bambusblase/);
assert.doesNotMatch(html, /onclick=/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /min-height: 2\.75rem/);
assert.match(css, /touch-action: none/);
assert.match(css, /@keyframes card-in/);
assert.match(game, /AudioContext \|\| window\.webkitAudioContext/);
assert.match(game, /oscillator\.onended =/);
assert.match(game, /requestAnimationFrame\(loop\)/);
assert.match(game, /Logic\.traceShot/);
assert.match(game, /masterGain\.gain\.value = 0/);
assert.match(game, /addEventListener\('pointerdown'/);
assert.match(game, /preventDefault\(\)/);
assert.match(game, /window\.PandaBubbles = Object\.freeze/);
assert.doesNotMatch(game, /\.innerHTML\s*=/);
for (const file of ['bubble-logic.js', 'game.js', 'styles.css', 'README.md']) {
  assert.ok(fs.existsSync(path.join(__dirname, file)), `${file} exists`);
}
assert.ok(fs.existsSync(path.join(__dirname, '..', 'index.html')), 'collection launcher exists');

console.log('panda bubbles smoke ok');
