(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BubbleLogic = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  var COLORS = Object.freeze(['rose', 'gold', 'mint', 'sky', 'violet', 'coral']);
  var CONFIG = Object.freeze({
    cols: 10,
    initialRows: 6,
    radius: 27,
    rowHeight: 47,
    width: 600,
    top: 12,
    dangerRow: 12,
    missesPerRow: 5
  });

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

  function rowParity(row, topParity) {
    return (row + (topParity ? 1 : 0)) & 1;
  }

  function rowLength(row, topParity, cols) {
    var width = Number.isInteger(cols) && cols >= 2 ? cols : CONFIG.cols;
    return width - rowParity(row, topParity);
  }

  function emptyRow(row, topParity, cols) {
    return new Array(rowLength(row, topParity, cols)).fill(null);
  }

  function cloneBoard(board) {
    if (!Array.isArray(board)) return [];
    return board.map(function (row) { return Array.isArray(row) ? row.slice() : []; });
  }

  function inBounds(board, row, col) {
    return Array.isArray(board) && Number.isInteger(row) && Number.isInteger(col) &&
      row >= 0 && row < board.length && Array.isArray(board[row]) && col >= 0 && col < board[row].length;
  }

  function getCell(board, row, col) {
    return inBounds(board, row, col) ? board[row][col] : null;
  }

  function cellKey(row, col) { return row + ':' + col; }

  function neighbors(row, col, topParity, cols) {
    var result = [];
    var parity = rowParity(row, topParity);
    var candidates = [
      [row, col - 1], [row, col + 1],
      [row - 1, parity ? col : col - 1],
      [row - 1, parity ? col + 1 : col],
      [row + 1, parity ? col : col - 1],
      [row + 1, parity ? col + 1 : col]
    ];
    for (var i = 0; i < candidates.length; i++) {
      var r = candidates[i][0];
      var c = candidates[i][1];
      if (r < 0 || c < 0 || c >= rowLength(r, topParity, cols)) continue;
      result.push({ row: r, col: c });
    }
    return result;
  }

  function ensureRow(board, row, topParity, cols) {
    while (board.length <= row) board.push(emptyRow(board.length, topParity, cols));
    var expected = rowLength(row, topParity, cols);
    if (board[row].length > expected) board[row].length = expected;
    while (board[row].length < expected) board[row].push(null);
  }

  function createInitialBoard(options) {
    options = options || {};
    var rows = Number.isInteger(options.rows) ? Math.max(1, options.rows) : CONFIG.initialRows;
    var cols = Number.isInteger(options.cols) ? Math.max(2, options.cols) : CONFIG.cols;
    var colorCount = Number.isInteger(options.colorCount) ? Math.max(3, Math.min(COLORS.length, options.colorCount)) : 5;
    var topParity = options.topParity ? 1 : 0;
    var random = options.random;
    var board = [];
    for (var r = 0; r < rows; r++) {
      var row = emptyRow(r, topParity, cols);
      for (var c = 0; c < row.length; c++) {
        row[c] = COLORS[Math.floor(safeRandom(random) * colorCount)];
      }
      board.push(row);
    }
    return board;
  }

  function getCluster(board, startRow, startCol, color, topParity, cols) {
    var wanted = color || getCell(board, startRow, startCol);
    if (!wanted || !inBounds(board, startRow, startCol)) return [];
    var found = [];
    var queue = [{ row: startRow, col: startCol }];
    var visited = new Set();
    while (queue.length) {
      var current = queue.shift();
      var key = cellKey(current.row, current.col);
      if (visited.has(key)) continue;
      visited.add(key);
      if (getCell(board, current.row, current.col) !== wanted) continue;
      found.push(current);
      var around = neighbors(current.row, current.col, topParity, cols);
      for (var i = 0; i < around.length; i++) queue.push(around[i]);
    }
    return found;
  }

  function getCeilingConnected(board, topParity, cols) {
    var connected = new Set();
    var queue = [];
    if (!board.length) return connected;
    for (var c = 0; c < board[0].length; c++) {
      if (board[0][c]) queue.push({ row: 0, col: c });
    }
    while (queue.length) {
      var current = queue.shift();
      var key = cellKey(current.row, current.col);
      if (connected.has(key) || !getCell(board, current.row, current.col)) continue;
      connected.add(key);
      var around = neighbors(current.row, current.col, topParity, cols);
      for (var i = 0; i < around.length; i++) {
        if (getCell(board, around[i].row, around[i].col)) queue.push(around[i]);
      }
    }
    return connected;
  }

  function availableColors(board) {
    var seen = new Set();
    for (var r = 0; r < board.length; r++) {
      for (var c = 0; c < board[r].length; c++) {
        if (COLORS.indexOf(board[r][c]) !== -1) seen.add(board[r][c]);
      }
    }
    return COLORS.filter(function (color) { return seen.has(color); });
  }

  function bestRainbowColor(board, row, col, topParity, cols) {
    var candidates = [];
    var around = neighbors(row, col, topParity, cols);
    for (var i = 0; i < around.length; i++) {
      var neighborColor = getCell(board, around[i].row, around[i].col);
      if (neighborColor && candidates.indexOf(neighborColor) === -1) candidates.push(neighborColor);
    }
    if (!candidates.length) candidates = availableColors(board);
    if (!candidates.length) return COLORS[0];

    var work = cloneBoard(board);
    ensureRow(work, row, topParity, cols);
    var best = candidates[0];
    var bestSize = -1;
    for (var k = 0; k < candidates.length; k++) {
      work[row][col] = candidates[k];
      var size = getCluster(work, row, col, candidates[k], topParity, cols).length;
      if (size > bestSize || (size === bestSize && COLORS.indexOf(candidates[k]) < COLORS.indexOf(best))) {
        best = candidates[k];
        bestSize = size;
      }
    }
    work[row][col] = null;
    return best;
  }

  function trimBottom(board) {
    while (board.length > 1 && board[board.length - 1].every(function (cell) { return !cell; })) board.pop();
    return board;
  }

  function resolvePlacement(board, row, col, bubble, topParity, options) {
    options = options || {};
    var cols = Number.isInteger(options.cols) ? options.cols : CONFIG.cols;
    var next = cloneBoard(board);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || col >= rowLength(row, topParity, cols)) {
      throw new RangeError('Ungültige Zielzelle');
    }
    ensureRow(next, row, topParity, cols);
    if (next[row][col]) throw new Error('Zielzelle ist bereits belegt');

    var placedColor = bubble === 'rainbow' ? bestRainbowColor(next, row, col, topParity, cols) : bubble;
    if (COLORS.indexOf(placedColor) === -1) throw new TypeError('Unbekannte Blasenfarbe');
    next[row][col] = placedColor;

    var cluster = getCluster(next, row, col, placedColor, topParity, cols);
    var matched = [];
    var dropped = [];
    if (cluster.length >= 3) {
      matched = cluster;
      for (var i = 0; i < cluster.length; i++) next[cluster[i].row][cluster[i].col] = null;
      var connected = getCeilingConnected(next, topParity, cols);
      for (var r = 0; r < next.length; r++) {
        for (var c = 0; c < next[r].length; c++) {
          if (next[r][c] && !connected.has(cellKey(r, c))) {
            dropped.push({ row: r, col: c, color: next[r][c] });
            next[r][c] = null;
          }
        }
      }
    }
    trimBottom(next);
    return {
      board: next,
      row: row,
      col: col,
      placedColor: placedColor,
      matched: matched.map(function (cell) { return { row: cell.row, col: cell.col, color: placedColor }; }),
      dropped: dropped,
      popped: matched.length,
      score: matched.length * 100 + dropped.length * 150,
      cleared: availableColors(next).length === 0
    };
  }

  function addPressureRow(board, topParity, colors, random, options) {
    options = options || {};
    var cols = Number.isInteger(options.cols) ? options.cols : CONFIG.cols;
    var palette = Array.isArray(colors) && colors.length ? colors.filter(function (color) { return COLORS.indexOf(color) !== -1; }) : availableColors(board);
    if (!palette.length) palette = COLORS.slice(0, 5);
    var nextParity = topParity ? 0 : 1;
    var row = emptyRow(0, nextParity, cols);
    for (var c = 0; c < row.length; c++) row[c] = palette[Math.floor(safeRandom(random) * palette.length)];
    var next = cloneBoard(board);
    next.unshift(row);
    return { board: next, topParity: nextParity, added: row.slice() };
  }

  function isLoss(board, dangerRow) {
    var limit = Number.isInteger(dangerRow) ? dangerRow : CONFIG.dangerRow;
    for (var r = Math.max(0, limit); r < board.length; r++) {
      if (board[r].some(function (cell) { return !!cell; })) return true;
    }
    return false;
  }

  function powerGain(popped, dropped, banked) {
    if (!Number.isFinite(popped) || popped < 3) return 0;
    var fallCount = Number.isFinite(dropped) ? Math.max(0, Math.floor(dropped)) : 0;
    return 24 + Math.min(16, fallCount * 2) + (banked ? 20 : 0);
  }

  function chargePower(current, popped, dropped, banked) {
    var safeCurrent = Number.isFinite(current) ? Math.max(0, Math.min(100, current)) : 0;
    return Math.min(100, safeCurrent + powerGain(popped, dropped, banked));
  }

  function shouldQueueRainbow(power, usedColor) {
    return Number.isFinite(power) && power >= 100 && usedColor !== 'rainbow';
  }

  function powerAfterLaunch(power, color) {
    if (color === 'rainbow') return 0;
    return Number.isFinite(power) ? Math.max(0, Math.min(100, power)) : 0;
  }

  function cellCenter(row, col, topParity, options) {
    options = options || {};
    var cols = Number.isInteger(options.cols) ? options.cols : CONFIG.cols;
    var radius = Number.isFinite(options.radius) ? options.radius : CONFIG.radius;
    var width = Number.isFinite(options.width) ? options.width : CONFIG.width;
    var top = Number.isFinite(options.top) ? options.top : CONFIG.top;
    var rowHeight = Number.isFinite(options.rowHeight) ? options.rowHeight : CONFIG.rowHeight;
    var diameter = radius * 2;
    var left = (width - cols * diameter) / 2;
    return {
      x: left + radius + col * diameter + rowParity(row, topParity) * radius,
      y: top + radius + row * rowHeight
    };
  }

  function traceShot(board, topParity, angle, options) {
    options = options || {};
    var width = Number.isFinite(options.width) ? options.width : CONFIG.width;
    var radius = Number.isFinite(options.radius) ? options.radius : CONFIG.radius;
    var top = Number.isFinite(options.top) ? options.top : CONFIG.top;
    var wall = Number.isFinite(options.wall) ? options.wall : radius + 3;
    var step = Number.isFinite(options.step) ? Math.max(1, options.step) : 4;
    var maxSteps = Number.isInteger(options.maxSteps) ? Math.max(1, options.maxSteps) : 2000;
    var startX = Number.isFinite(options.startX) ? options.startX : width / 2;
    var startY = Number.isFinite(options.startY) ? options.startY : 699;
    var safeAngle = Number.isFinite(angle) ? Math.max(-1.24, Math.min(1.24, angle)) : 0;
    var body = { x: startX, y: startY, vx: Math.sin(safeAngle), vy: -Math.cos(safeAngle) };
    var points = [{ x: body.x, y: body.y, banked: false, bounced: false, hit: null }];
    var banked = false;
    var contact = null;
    var collisionDistanceSq = Math.pow(radius * 2 - 3, 2);

    for (var index = 0; index < maxSteps; index++) {
      body.x += body.vx * step;
      body.y += body.vy * step;
      var bounced = false;
      if (body.x <= wall) {
        body.x = wall + (wall - body.x);
        body.vx = Math.abs(body.vx);
        bounced = true;
      } else if (body.x >= width - wall) {
        body.x = width - wall - (body.x - (width - wall));
        body.vx = -Math.abs(body.vx);
        bounced = true;
      }
      if (bounced) banked = true;

      if (body.y <= top + radius) {
        contact = { type: 'ceiling', x: body.x, y: body.y };
      } else {
        outer: for (var row = 0; row < board.length; row++) {
          for (var col = 0; col < board[row].length; col++) {
            if (!board[row][col]) continue;
            var center = cellCenter(row, col, topParity, options);
            var dx = center.x - body.x;
            var dy = center.y - body.y;
            if (dx * dx + dy * dy <= collisionDistanceSq) {
              contact = { type: 'bubble', row: row, col: col, x: body.x, y: body.y };
              break outer;
            }
          }
        }
      }
      points.push({ x: body.x, y: body.y, banked: banked, bounced: bounced, hit: contact ? contact.type : null });
      if (contact) break;
    }
    return { points: points, contact: contact, banked: banked, step: step };
  }

  function getAttachableCells(board, topParity, options) {
    options = options || {};
    var cols = Number.isInteger(options.cols) ? options.cols : CONFIG.cols;
    var dangerRow = Number.isInteger(options.dangerRow) ? options.dangerRow : CONFIG.dangerRow;
    var lastRow = Math.min(dangerRow, Math.max(0, board.length));
    var result = [];
    for (var r = 0; r <= lastRow; r++) {
      var length = rowLength(r, topParity, cols);
      for (var c = 0; c < length; c++) {
        if (getCell(board, r, c)) continue;
        var attachable = r === 0;
        if (!attachable) {
          var around = neighbors(r, c, topParity, cols);
          attachable = around.some(function (cell) { return !!getCell(board, cell.row, cell.col); });
        }
        if (attachable) result.push({ row: r, col: c });
      }
    }
    return result;
  }

  function nearestAttachableCell(board, topParity, x, y, options) {
    var cells = getAttachableCells(board, topParity, options);
    if (!cells.length) return null;
    var best = cells[0];
    var bestDistance = Infinity;
    for (var i = 0; i < cells.length; i++) {
      var center = cellCenter(cells[i].row, cells[i].col, topParity, options);
      var dx = center.x - x;
      var dy = center.y - y;
      var distance = dx * dx + dy * dy;
      if (distance < bestDistance || (distance === bestDistance && (cells[i].row < best.row || (cells[i].row === best.row && cells[i].col < best.col)))) {
        best = cells[i];
        bestDistance = distance;
      }
    }
    return { row: best.row, col: best.col, distance: Math.sqrt(bestDistance) };
  }

  return Object.freeze({
    COLORS: COLORS,
    CONFIG: CONFIG,
    seededRandom: seededRandom,
    rowParity: rowParity,
    rowLength: rowLength,
    emptyRow: emptyRow,
    cloneBoard: cloneBoard,
    inBounds: inBounds,
    getCell: getCell,
    neighbors: neighbors,
    createInitialBoard: createInitialBoard,
    getCluster: getCluster,
    getCeilingConnected: getCeilingConnected,
    availableColors: availableColors,
    bestRainbowColor: bestRainbowColor,
    resolvePlacement: resolvePlacement,
    addPressureRow: addPressureRow,
    isLoss: isLoss,
    powerGain: powerGain,
    chargePower: chargePower,
    shouldQueueRainbow: shouldQueueRainbow,
    powerAfterLaunch: powerAfterLaunch,
    cellCenter: cellCenter,
    traceShot: traceShot,
    getAttachableCells: getAttachableCells,
    nearestAttachableCell: nearestAttachableCell
  });
});
