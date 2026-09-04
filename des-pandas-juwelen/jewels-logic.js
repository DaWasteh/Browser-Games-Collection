(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JewelsLogic = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  var GEM_TYPES = Object.freeze(['jade', 'amber', 'ruby', 'sapphire', 'amethyst', 'pearl']);
  var SPECIALS = Object.freeze(['row', 'column', 'bomb', 'prism']);
  var CONFIG = Object.freeze({ rows: 8, cols: 8, colorCount: 6, moves: 24, target: 9000, pandaCharge: 5 });

  function safeRandom(random) {
    var value = typeof random === 'function' ? Number(random()) : Math.random();
    if (!Number.isFinite(value)) return 0;
    value %= 1;
    return value < 0 ? value + 1 : value;
  }

  function seededRandom(seed) {
    var text = String(seed == null ? '' : seed);
    var state = 2166136261;
    for (var i = 0; i < text.length; i++) {
      state ^= text.charCodeAt(i);
      state = Math.imul(state, 16777619);
    }
    state >>>= 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeGem(color, special) {
    var normalizedSpecial = special == null ? null : special;
    if (SPECIALS.indexOf(normalizedSpecial) === -1 && normalizedSpecial !== null) throw new TypeError('Unbekannter Spezialstein');
    if (normalizedSpecial === 'prism') return { color: null, special: 'prism' };
    if (GEM_TYPES.indexOf(color) === -1) throw new TypeError('Unbekannte Juwelenfarbe');
    return { color: color, special: normalizedSpecial };
  }

  function cloneGem(gem) {
    return gem ? { color: gem.color, special: gem.special || null } : null;
  }

  function cloneBoard(board) {
    if (!Array.isArray(board)) return [];
    return board.map(function (row) { return Array.isArray(row) ? row.map(cloneGem) : []; });
  }

  function createEmptyBoard(rows, cols) {
    var height = Number.isInteger(rows) && rows > 0 ? rows : CONFIG.rows;
    var width = Number.isInteger(cols) && cols > 0 ? cols : CONFIG.cols;
    return Array.from({ length: height }, function () { return new Array(width).fill(null); });
  }

  function dimensions(board) {
    return { rows: Array.isArray(board) ? board.length : 0, cols: Array.isArray(board) && board[0] ? board[0].length : 0 };
  }

  function inBounds(board, position) {
    var size = dimensions(board);
    return !!position && Number.isInteger(position.row) && Number.isInteger(position.col) &&
      position.row >= 0 && position.row < size.rows && position.col >= 0 && position.col < size.cols;
  }

  function key(row, col) { return row + ':' + col; }

  function parseKey(value) {
    var parts = value.split(':');
    return { row: Number(parts[0]), col: Number(parts[1]) };
  }

  function samePosition(a, b) { return a && b && a.row === b.row && a.col === b.col; }

  function isAdjacent(a, b) {
    return !!a && !!b && Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
  }

  function findMatches(board) {
    var size = dimensions(board);
    var groups = [];
    var cells = new Map();

    function addRun(orientation, positions) {
      if (positions.length < 3) return;
      var group = { orientation: orientation, cells: positions.map(function (cell) { return { row: cell.row, col: cell.col }; }) };
      groups.push(group);
      for (var i = 0; i < positions.length; i++) cells.set(key(positions[i].row, positions[i].col), { row: positions[i].row, col: positions[i].col });
    }

    for (var row = 0; row < size.rows; row++) {
      var start = 0;
      while (start < size.cols) {
        var gem = board[row][start];
        if (!gem || gem.color == null) { start++; continue; }
        var end = start + 1;
        while (end < size.cols && board[row][end] && board[row][end].color === gem.color) end++;
        if (end - start >= 3) {
          var horizontal = [];
          for (var col = start; col < end; col++) horizontal.push({ row: row, col: col });
          addRun('row', horizontal);
        }
        start = end;
      }
    }

    for (var col = 0; col < size.cols; col++) {
      var top = 0;
      while (top < size.rows) {
        var verticalGem = board[top][col];
        if (!verticalGem || verticalGem.color == null) { top++; continue; }
        var bottom = top + 1;
        while (bottom < size.rows && board[bottom][col] && board[bottom][col].color === verticalGem.color) bottom++;
        if (bottom - top >= 3) {
          var vertical = [];
          for (var r = top; r < bottom; r++) vertical.push({ row: r, col: col });
          addRun('column', vertical);
        }
        top = bottom;
      }
    }

    return {
      groups: groups,
      cells: Array.from(cells.values()).sort(function (a, b) { return a.row - b.row || a.col - b.col; })
    };
  }

  function swapCells(board, from, to) {
    if (!inBounds(board, from) || !inBounds(board, to)) throw new RangeError('Tauschposition außerhalb des Spielfelds');
    var next = cloneBoard(board);
    var temp = next[from.row][from.col];
    next[from.row][from.col] = next[to.row][to.col];
    next[to.row][to.col] = temp;
    return next;
  }

  function matchTouches(matches, position) {
    return matches.cells.some(function (cell) { return samePosition(cell, position); });
  }

  function isProductiveSwap(board, from, to, allowRemote) {
    if (!inBounds(board, from) || !inBounds(board, to) || samePosition(from, to)) return false;
    if (!allowRemote && !isAdjacent(from, to)) return false;
    var first = board[from.row][from.col];
    var second = board[to.row][to.col];
    if (!first || !second) return false;
    if (first.special === 'prism' || second.special === 'prism') return true;
    var swapped = swapCells(board, from, to);
    var matches = findMatches(swapped);
    return matchTouches(matches, from) || matchTouches(matches, to);
  }

  function findValidMoves(board) {
    var size = dimensions(board);
    var moves = [];
    for (var row = 0; row < size.rows; row++) {
      for (var col = 0; col < size.cols; col++) {
        var from = { row: row, col: col };
        var candidates = [{ row: row, col: col + 1 }, { row: row + 1, col: col }];
        for (var i = 0; i < candidates.length; i++) {
          if (inBounds(board, candidates[i]) && isProductiveSwap(board, from, candidates[i], false)) {
            moves.push({ from: from, to: candidates[i] });
          }
        }
      }
    }
    return moves;
  }

  function chooseColor(board, row, col, palette, random, offset) {
    var start = (Math.floor(safeRandom(random) * palette.length) + (offset || 0)) % palette.length;
    for (var attempt = 0; attempt < palette.length; attempt++) {
      var color = palette[(start + attempt) % palette.length];
      var horizontalBad = col >= 2 && board[row][col - 1] && board[row][col - 2] && board[row][col - 1].color === color && board[row][col - 2].color === color;
      var verticalBad = row >= 2 && board[row - 1][col] && board[row - 2][col] && board[row - 1][col].color === color && board[row - 2][col].color === color;
      if (!horizontalBad && !verticalBad) return color;
    }
    return palette[start];
  }

  function buildCandidate(rows, cols, colorCount, random, offset) {
    var board = createEmptyBoard(rows, cols);
    var palette = GEM_TYPES.slice(0, colorCount);
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        board[row][col] = makeGem(chooseColor(board, row, col, palette, random, offset + row + col), null);
      }
    }
    return board;
  }

  function createBoard(options) {
    options = options || {};
    var rows = Number.isInteger(options.rows) ? Math.max(3, options.rows) : CONFIG.rows;
    var cols = Number.isInteger(options.cols) ? Math.max(3, options.cols) : CONFIG.cols;
    var colorCount = Number.isInteger(options.colorCount) ? Math.max(4, Math.min(GEM_TYPES.length, options.colorCount)) : CONFIG.colorCount;
    var random = options.random;
    for (var attempt = 0; attempt < 180; attempt++) {
      var candidate = buildCandidate(rows, cols, colorCount, random, attempt);
      if (!findMatches(candidate).cells.length && findValidMoves(candidate).length) return candidate;
    }
    var fallbackRandom = seededRandom('jewels-playable-fallback-' + rows + 'x' + cols + '-' + colorCount);
    for (var fallback = 0; fallback < 500; fallback++) {
      var fixed = buildCandidate(rows, cols, colorCount, fallbackRandom, fallback);
      if (!findMatches(fixed).cells.length && findValidMoves(fixed).length) return fixed;
    }
    throw new Error('Kein spielbares Juwelenfeld erzeugt');
  }

  function mostCommonColor(board) {
    var counts = new Map();
    GEM_TYPES.forEach(function (color) { counts.set(color, 0); });
    for (var row = 0; row < board.length; row++) {
      for (var col = 0; col < board[row].length; col++) {
        var gem = board[row][col];
        if (gem && gem.color != null) counts.set(gem.color, (counts.get(gem.color) || 0) + 1);
      }
    }
    var best = GEM_TYPES[0];
    for (var i = 1; i < GEM_TYPES.length; i++) {
      if ((counts.get(GEM_TYPES[i]) || 0) > (counts.get(best) || 0)) best = GEM_TYPES[i];
    }
    return best;
  }

  function planCreations(board, matches, preferred) {
    var creations = [];
    var claimed = new Set();
    var memberships = new Map();
    for (var g = 0; g < matches.groups.length; g++) {
      var group = matches.groups[g];
      for (var i = 0; i < group.cells.length; i++) {
        var cellKey = key(group.cells[i].row, group.cells[i].col);
        var entry = memberships.get(cellKey) || new Set();
        entry.add(group.orientation);
        memberships.set(cellKey, entry);
      }
    }

    var intersections = Array.from(memberships.entries()).filter(function (entry) { return entry[1].size > 1; }).map(function (entry) { return parseKey(entry[0]); });
    intersections.sort(function (a, b) {
      var ai = preferred.findIndex(function (cell) { return samePosition(cell, a); });
      var bi = preferred.findIndex(function (cell) { return samePosition(cell, b); });
      ai = ai < 0 ? 999 : ai;
      bi = bi < 0 ? 999 : bi;
      return ai - bi || a.row - b.row || a.col - b.col;
    });
    for (var x = 0; x < intersections.length; x++) {
      var intersection = intersections[x];
      var gem = board[intersection.row][intersection.col];
      if (gem && !gem.special) {
        claimed.add(key(intersection.row, intersection.col));
        creations.push({ row: intersection.row, col: intersection.col, gem: makeGem(gem.color, 'bomb') });
      }
    }

    for (var groupIndex = 0; groupIndex < matches.groups.length; groupIndex++) {
      var run = matches.groups[groupIndex];
      if (run.cells.length < 4) continue;
      if (run.cells.some(function (cell) { return claimed.has(key(cell.row, cell.col)); })) continue;
      var candidates = preferred.concat(run.cells[Math.floor((run.cells.length - 1) / 2)], run.cells);
      var chosen = null;
      for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
        var candidate = candidates[candidateIndex];
        if (!candidate || !run.cells.some(function (cell) { return samePosition(cell, candidate); })) continue;
        var candidateGem = board[candidate.row][candidate.col];
        if (candidateGem && !candidateGem.special && !claimed.has(key(candidate.row, candidate.col))) {
          chosen = candidate;
          break;
        }
      }
      if (!chosen) continue;
      var sourceGem = board[chosen.row][chosen.col];
      var special = run.cells.length >= 5 ? 'prism' : run.orientation;
      claimed.add(key(chosen.row, chosen.col));
      creations.push({ row: chosen.row, col: chosen.col, gem: makeGem(sourceGem.color, special) });
    }
    return creations;
  }

  function expandSpecials(board, initialKeys, protectedKeys) {
    var clear = new Set(initialKeys);
    var protectedSet = protectedKeys || new Set();
    protectedSet.forEach(function (protectedKey) { clear.delete(protectedKey); });
    var queue = Array.from(clear);
    var processed = new Set();
    var size = dimensions(board);

    function add(row, col) {
      var cellKey = key(row, col);
      if (row < 0 || row >= size.rows || col < 0 || col >= size.cols || !board[row][col] || protectedSet.has(cellKey) || clear.has(cellKey)) return;
      clear.add(cellKey);
      queue.push(cellKey);
    }

    while (queue.length) {
      var currentKey = queue.shift();
      if (processed.has(currentKey)) continue;
      processed.add(currentKey);
      var current = parseKey(currentKey);
      var gem = board[current.row][current.col];
      if (!gem || !gem.special) continue;
      if (gem.special === 'row') {
        for (var col = 0; col < size.cols; col++) add(current.row, col);
      } else if (gem.special === 'column') {
        for (var row = 0; row < size.rows; row++) add(row, current.col);
      } else if (gem.special === 'bomb') {
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) add(current.row + dr, current.col + dc);
      } else if (gem.special === 'prism') {
        var targetColor = mostCommonColor(board);
        for (var r = 0; r < size.rows; r++) for (var c = 0; c < size.cols; c++) if (board[r][c] && board[r][c].color === targetColor) add(r, c);
      }
    }
    return clear;
  }

  function collapseAndRefillDetailed(board, random, colorCount) {
    var size = dimensions(board);
    var next = createEmptyBoard(size.rows, size.cols);
    var palette = GEM_TYPES.slice(0, colorCount || CONFIG.colorCount);
    var movements = [];
    for (var col = 0; col < size.cols; col++) {
      var writeRow = size.rows - 1;
      for (var row = size.rows - 1; row >= 0; row--) {
        if (!board[row][col]) continue;
        next[writeRow][col] = cloneGem(board[row][col]);
        movements.push({
          from: { row: row, col: col },
          to: { row: writeRow, col: col },
          distance: writeRow - row,
          spawned: false
        });
        writeRow--;
      }
      var spawnCount = writeRow + 1;
      while (writeRow >= 0) {
        next[writeRow][col] = makeGem(palette[Math.floor(safeRandom(random) * palette.length)], null);
        movements.push({
          from: { row: writeRow - spawnCount, col: col },
          to: { row: writeRow, col: col },
          distance: spawnCount,
          spawned: true
        });
        writeRow--;
      }
    }
    return { board: next, movements: movements };
  }

  function collapseAndRefill(board, random, colorCount) {
    return collapseAndRefillDetailed(board, random, colorCount).board;
  }

  function createClearStep(board, initialKeys, creations, cascade, random, colorCount, matchedCells) {
    var protectedKeys = new Set(creations.map(function (creation) { return key(creation.row, creation.col); }));
    var clearKeys = expandSpecials(board, initialKeys, protectedKeys);
    var before = cloneBoard(board);
    var afterClear = cloneBoard(board);
    var cleared = [];
    clearKeys.forEach(function (cellKey) {
      var cell = parseKey(cellKey);
      if (afterClear[cell.row][cell.col]) cleared.push({ row: cell.row, col: cell.col, gem: cloneGem(afterClear[cell.row][cell.col]) });
      afterClear[cell.row][cell.col] = null;
    });
    for (var i = 0; i < creations.length; i++) afterClear[creations[i].row][creations[i].col] = cloneGem(creations[i].gem);
    var collapse = collapseAndRefillDetailed(afterClear, random, colorCount);
    var afterFall = collapse.board;
    var specialTriggers = cleared.filter(function (cell) { return !!cell.gem.special; }).length;
    var points = cleared.length * 60 * cascade + specialTriggers * 120 + creations.length * 90;
    return {
      cascade: cascade,
      matched: (matchedCells || []).map(function (cell) { return { row: cell.row, col: cell.col }; }),
      cleared: cleared,
      created: creations.map(function (creation) { return { row: creation.row, col: creation.col, gem: cloneGem(creation.gem) }; }),
      before: before,
      afterClear: afterClear,
      afterFall: afterFall,
      falls: collapse.movements.map(function (movement) {
        return {
          from: { row: movement.from.row, col: movement.from.col },
          to: { row: movement.to.row, col: movement.to.col },
          distance: movement.distance,
          spawned: movement.spawned
        };
      }),
      score: points
    };
  }

  function prismClearKeys(board, from, to) {
    var first = board[from.row][from.col];
    var second = board[to.row][to.col];
    var clear = new Set([key(from.row, from.col), key(to.row, to.col)]);
    if (first.special === 'prism' && second.special === 'prism') {
      for (var row = 0; row < board.length; row++) for (var col = 0; col < board[row].length; col++) if (board[row][col]) clear.add(key(row, col));
      return clear;
    }
    var target = first.special === 'prism' ? second.color : first.color;
    for (var r = 0; r < board.length; r++) {
      for (var c = 0; c < board[r].length; c++) {
        if (board[r][c] && board[r][c].color === target) clear.add(key(r, c));
      }
    }
    return clear;
  }

  function shuffleArray(values, random) {
    for (var i = values.length - 1; i > 0; i--) {
      var j = Math.floor(safeRandom(random) * (i + 1));
      var temp = values[i]; values[i] = values[j]; values[j] = temp;
    }
    return values;
  }

  function reshuffleBoard(board, random) {
    var size = dimensions(board);
    var gems = board.flat().filter(Boolean).map(cloneGem);
    if (gems.length !== size.rows * size.cols) return { board: createBoard({ rows: size.rows, cols: size.cols, random: random }), changed: true, preserved: false };
    for (var attempt = 0; attempt < 400; attempt++) {
      var shuffled = shuffleArray(gems.map(cloneGem), random);
      var candidate = createEmptyBoard(size.rows, size.cols);
      for (var index = 0; index < shuffled.length; index++) candidate[Math.floor(index / size.cols)][index % size.cols] = shuffled[index];
      if (!findMatches(candidate).cells.length && findValidMoves(candidate).length) return { board: candidate, changed: true, preserved: true };
    }
    return { board: createBoard({ rows: size.rows, cols: size.cols, random: random }), changed: true, preserved: false };
  }

  function resolveTurn(board, from, to, options) {
    options = options || {};
    var allowRemote = options.allowRemote === true;
    var random = options.random;
    var colorCount = Number.isInteger(options.colorCount) ? Math.max(4, Math.min(GEM_TYPES.length, options.colorCount)) : CONFIG.colorCount;
    if (!inBounds(board, from) || !inBounds(board, to)) return { valid: false, reason: 'bounds', board: cloneBoard(board), steps: [], score: 0 };
    if (samePosition(from, to)) return { valid: false, reason: 'same', board: cloneBoard(board), steps: [], score: 0 };
    if (!allowRemote && !isAdjacent(from, to)) return { valid: false, reason: 'distance', board: cloneBoard(board), steps: [], score: 0 };
    if (!board[from.row][from.col] || !board[to.row][to.col]) return { valid: false, reason: 'empty', board: cloneBoard(board), steps: [], score: 0 };
    if (!isProductiveSwap(board, from, to, allowRemote)) return { valid: false, reason: 'no-match', board: cloneBoard(board), steps: [], score: 0 };

    var work = swapCells(board, from, to);
    var steps = [];
    var score = 0;
    var clearedTotal = 0;
    var createdTotal = 0;
    var cascade = 1;
    var firstGem = work[from.row][from.col];
    var secondGem = work[to.row][to.col];

    if (firstGem.special === 'prism' || secondGem.special === 'prism') {
      var prismStep = createClearStep(work, prismClearKeys(work, from, to), [], cascade, random, colorCount, [from, to]);
      steps.push(prismStep);
      score += prismStep.score;
      clearedTotal += prismStep.cleared.length;
      work = prismStep.afterFall;
      cascade++;
    }

    var matches = findMatches(work);
    var guard = 0;
    while (matches.cells.length && guard++ < 40) {
      var preferred = cascade === 1 ? [to, from] : [];
      var creations = planCreations(work, matches, preferred);
      var initialKeys = new Set(matches.cells.map(function (cell) { return key(cell.row, cell.col); }));
      var step = createClearStep(work, initialKeys, creations, cascade, random, colorCount, matches.cells);
      steps.push(step);
      score += step.score;
      clearedTotal += step.cleared.length;
      createdTotal += step.created.length;
      work = step.afterFall;
      cascade++;
      matches = findMatches(work);
    }

    if (matches.cells.length) work = createBoard({ rows: work.length, cols: work[0].length, colorCount: colorCount, random: random });
    var reshuffled = false;
    var preserved = true;
    if (!findValidMoves(work).length) {
      var shuffleResult = reshuffleBoard(work, random);
      work = shuffleResult.board;
      reshuffled = true;
      preserved = shuffleResult.preserved;
    }

    return {
      valid: true,
      reason: null,
      board: cloneBoard(work),
      swapped: { from: { row: from.row, col: from.col }, to: { row: to.row, col: to.col } },
      steps: steps,
      score: score,
      cleared: clearedTotal,
      cascades: steps.length,
      created: createdTotal,
      usedPower: allowRemote && !isAdjacent(from, to),
      reshuffled: reshuffled,
      shufflePreserved: preserved
    };
  }

  function boardSignature(board) {
    return board.map(function (row) {
      return row.map(function (gem) { return gem ? (gem.color || '*') + (gem.special ? '/' + gem.special : '') : '-'; }).join(',');
    }).join('|');
  }

  return Object.freeze({
    GEM_TYPES: GEM_TYPES,
    SPECIALS: SPECIALS,
    CONFIG: CONFIG,
    seededRandom: seededRandom,
    makeGem: makeGem,
    cloneGem: cloneGem,
    cloneBoard: cloneBoard,
    createEmptyBoard: createEmptyBoard,
    dimensions: dimensions,
    inBounds: inBounds,
    isAdjacent: isAdjacent,
    findMatches: findMatches,
    swapCells: swapCells,
    isProductiveSwap: isProductiveSwap,
    findValidMoves: findValidMoves,
    createBoard: createBoard,
    mostCommonColor: mostCommonColor,
    planCreations: planCreations,
    expandSpecials: expandSpecials,
    collapseAndRefill: collapseAndRefill,
    collapseAndRefillDetailed: collapseAndRefillDetailed,
    reshuffleBoard: reshuffleBoard,
    resolveTurn: resolveTurn,
    boardSignature: boardSignature
  });
});
