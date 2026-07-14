(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MinesweeperLogic = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    'use strict';

    // --- Zell-Zustände ---
    var HIDDEN = 0;
    var REVEALED = 1;
    var FLAGGED = 2;

    var STATE = Object.freeze({
        HIDDEN: HIDDEN,
        REVEALED: REVEALED,
        FLAGGED: FLAGGED
    });

    // --- Schwierigkeitsstufen (eingefroren, analog Tetris DIFFICULTY) ---
    var DIFFICULTY = Object.freeze({
        easy:   Object.freeze({ rows: 9,  cols: 9,  mines: 10,  label: 'Rekrut' }),
        medium: Object.freeze({ rows: 16, cols: 16, mines: 40,  label: 'Feldwebel' }),
        hard:   Object.freeze({ rows: 16, cols: 30, mines: 99,  label: 'Hauptmann' }),
        insane: Object.freeze({ rows: 24, cols: 24, mines: 150, label: 'General' })
    });

    var DIFFICULTY_ORDER = Object.freeze(['easy', 'medium', 'hard', 'insane']);

    // --- Board-Erzeugung ---
    function createBoard(rows, cols) {
        if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
            throw new RangeError('rows und cols müssen positive ganze Zahlen sein');
        }
        var grid = [];
        for (var r = 0; r < rows; r++) {
            var row = [];
            for (var c = 0; c < cols; c++) {
                row.push({ r: r, c: c, mine: false, state: HIDDEN, adjacent: 0 });
            }
            grid.push(row);
        }
        return { rows: rows, cols: cols, grid: grid };
    }

    function inBounds(board, r, c) {
        return r >= 0 && r < board.rows && c >= 0 && c < board.cols;
    }

    // Iteriert über die 8 Nachbarn (Moore-Nachbarschaft), nur existierende Zellen.
    function forEachNeighbor(board, r, c, fn) {
        for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                var nr = r + dr;
                var nc = c + dc;
                if (inBounds(board, nr, nc)) fn(nr, nc);
            }
        }
    }

    function countAdjacentMines(board, r, c) {
        var count = 0;
        forEachNeighbor(board, r, c, function (nr, nc) {
            if (board.grid[nr][nc].mine) count++;
        });
        return count;
    }

    function recomputeAdjacency(board) {
        for (var r = 0; r < board.rows; r++) {
            for (var c = 0; c < board.cols; c++) {
                board.grid[r][c].adjacent = countAdjacentMines(board, r, c);
            }
        }
    }

    // --- Minen-Platzierung mit injizierbarem RNG ---
    // Platzieren darf erst beim ersten Reveal passieren (nie beim Flaggen).
    // Die 3×3-Zone um (safeR, safeC) bleibt minenfrei (an Rändern beschnitten).
    function placeMines(board, opts, random) {
        opts = opts || {};
        var rng = typeof random === 'function' ? random : Math.random;
        var mines = opts.mines;
        var safeR = opts.safeR;
        var safeC = opts.safeC;
        var total = board.rows * board.cols;

        if (!Number.isInteger(mines) || mines < 0) {
            throw new RangeError('mines muss eine nicht-negative ganze Zahl sein');
        }
        if (!inBounds(board, safeR, safeC)) {
            throw new RangeError('safeR/safeC müssen innerhalb des Boards liegen');
        }

        // Safe-Zone = 3×3 um (safeR, safeC), beschnitten an Rändern.
        var candidates = [];
        for (var r = 0; r < board.rows; r++) {
            for (var c = 0; c < board.cols; c++) {
                if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
                candidates.push({ r: r, c: c });
            }
        }

        if (mines > candidates.length) {
            throw new RangeError(
                'Zu viele Minen (' + mines + ') für ' + candidates.length +
                ' verfügbare Zellen (Board ' + total + ' minus 3×3-Safe-Zone)'
            );
        }

        // Fisher-Yates-Shuffle mit injizierbarem RNG → deterministisch testbar.
        for (var i = candidates.length - 1; i > 0; i--) {
            var j = Math.floor(rng() * (i + 1));
            var tmp = candidates[i];
            candidates[i] = candidates[j];
            candidates[j] = tmp;
        }

        // Alle Minen zurücksetzen (idempotent).
        for (var rr = 0; rr < board.rows; rr++) {
            for (var cc = 0; cc < board.cols; cc++) {
                board.grid[rr][cc].mine = false;
            }
        }

        for (var k = 0; k < mines; k++) {
            var pick = candidates[k];
            board.grid[pick.r][pick.c].mine = true;
        }

        recomputeAdjacency(board);
        return mines;
    }

    function isFlagged(cell) { return cell.state === FLAGGED; }
    function isRevealed(cell) { return cell.state === REVEALED; }
    function isHidden(cell) { return cell.state === HIDDEN; }

    // --- Reveal mit iterativem Flood-Fill (kein Stack-Overflow auf großen Boards) ---
    function reveal(board, r, c) {
        if (!inBounds(board, r, c)) return { revealed: [], hitMine: false };
        var start = board.grid[r][c];
        if (isRevealed(start) || isFlagged(start)) {
            return { revealed: [], hitMine: false };
        }

        if (start.mine) {
            start.state = REVEALED;
            return { revealed: [{ r: r, c: c }], hitMine: true };
        }

        var revealed = [];
        var stack = [[r, c]];
        while (stack.length > 0) {
            var pos = stack.pop();
            var cr = pos[0];
            var cc = pos[1];
            var cell = board.grid[cr][cc];
            if (isRevealed(cell) || isFlagged(cell)) continue;
            cell.state = REVEALED;
            revealed.push({ r: cr, c: cc });
            // adjacent===0 bedeutet per Definition: alle Nachbarn sind minenfrei.
            // Flood-Fill: alle hidden+ungeflaggten Nachbarn auf den Stack legen.
            if (cell.adjacent === 0 && !cell.mine) {
                forEachNeighbor(board, cr, cc, function (nr, nc) {
                    var n = board.grid[nr][nc];
                    if (!isRevealed(n) && !isFlagged(n)) {
                        stack.push([nr, nc]);
                    }
                });
            }
        }
        return { revealed: revealed, hitMine: false };
    }

    // --- Flagge toggeln (nur hidden <-> flagged, nie auf revealed) ---
    function toggleFlag(board, r, c) {
        if (!inBounds(board, r, c)) return HIDDEN;
        var cell = board.grid[r][c];
        if (cell.state === HIDDEN) cell.state = FLAGGED;
        else if (cell.state === FLAGGED) cell.state = HIDDEN;
        return cell.state;
    }

    // --- Chording: Zahl mit passender Flaggenanzahl deckt ungeflaggte Nachbarn auf ---
    function chord(board, r, c) {
        if (!inBounds(board, r, c)) return { revealed: [], hitMine: false };
        var cell = board.grid[r][c];
        if (!isRevealed(cell) || cell.adjacent === 0 || cell.mine) {
            return { revealed: [], hitMine: false };
        }
        var flags = 0;
        forEachNeighbor(board, r, c, function (nr, nc) {
            if (isFlagged(board.grid[nr][nc])) flags++;
        });
        if (flags !== cell.adjacent) return { revealed: [], hitMine: false };

        var revealed = [];
        var hitMine = false;
        forEachNeighbor(board, r, c, function (nr, nc) {
            var n = board.grid[nr][nc];
            if (isHidden(n) && !isFlagged(n)) {
                var res = reveal(board, nr, nc);
                for (var i = 0; i < res.revealed.length; i++) {
                    revealed.push(res.revealed[i]);
                }
                if (res.hitMine) hitMine = true;
            }
        });
        return { revealed: revealed, hitMine: hitMine };
    }

    function countFlags(board) {
        var n = 0;
        for (var r = 0; r < board.rows; r++) {
            for (var c = 0; c < board.cols; c++) {
                if (isFlagged(board.grid[r][c])) n++;
            }
        }
        return n;
    }

    function countRevealed(board) {
        var n = 0;
        for (var r = 0; r < board.rows; r++) {
            for (var c = 0; c < board.cols; c++) {
                if (isRevealed(board.grid[r][c])) n++;
            }
        }
        return n;
    }

    // Sieg: alle Nicht-Minen-Zellen aufgedeckt (Flags allein gewinnen nicht).
    function checkWin(board) {
        for (var r = 0; r < board.rows; r++) {
            for (var c = 0; c < board.cols; c++) {
                var cell = board.grid[r][c];
                if (!cell.mine && !isRevealed(cell)) return false;
            }
        }
        return true;
    }

    // Spalte als Tabellen-Buchstabe (A, B, ..., Z, AA, AB, ...), Zeile 1-basiert —
    // für eindeutige, sprechende aria-labels auch bei >26 Spalten (z. B. 16×30).
    function cellLabel(board, r, c) {
        var colName = '';
        var n = c;
        do {
            colName = String.fromCharCode('A'.charCodeAt(0) + (n % 26)) + colName;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return 'Z' + (r + 1) + colName;
    }

    return {
        STATE: STATE,
        HIDDEN: HIDDEN,
        REVEALED: REVEALED,
        FLAGGED: FLAGGED,
        DIFFICULTY: DIFFICULTY,
        DIFFICULTY_ORDER: DIFFICULTY_ORDER,
        createBoard: createBoard,
        inBounds: inBounds,
        forEachNeighbor: forEachNeighbor,
        countAdjacentMines: countAdjacentMines,
        recomputeAdjacency: recomputeAdjacency,
        placeMines: placeMines,
        reveal: reveal,
        toggleFlag: toggleFlag,
        chord: chord,
        countFlags: countFlags,
        countRevealed: countRevealed,
        checkWin: checkWin,
        isFlagged: isFlagged,
        isRevealed: isRevealed,
        isHidden: isHidden,
        cellLabel: cellLabel
    };
});
