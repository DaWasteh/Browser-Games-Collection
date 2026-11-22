(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TetrisLogic = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    'use strict';

    const COLS = 10;
    const ROWS = 20;
    const CELL_SIZE = 30;

    const DIFFICULTY = Object.freeze({
        easy:   Object.freeze({ baseSpeed: 1200, speedStep: 50,  label: 'Einfach' }),
        medium: Object.freeze({ baseSpeed: 800,  speedStep: 80,  label: 'Mittel' }),
        hard:   Object.freeze({ baseSpeed: 400,  speedStep: 120, label: 'Schwer' })
    });

    const PIECES = Object.freeze([
        piece(1, [[1,1,1,1]],       '#00f0f0', '#00ffff'),
        piece(2, [[2,2],[2,2]],     '#f0f000', '#ffff00'),
        piece(3, [[0,3,3],[3,3,0]], '#a000c0', '#c040ff'),
        piece(4, [[4,4,0],[0,4,4]], '#e00000', '#ff4040'),
        piece(5, [[5,0,0],[5,5,5]], '#f0a000', '#ff8000'),
        piece(6, [[6,6,6],[0,6,0]], '#00a000', '#00ff00'),
        piece(7, [[0,0,7],[7,7,7]], '#0000f0', '#4040ff')
    ]);

    const PIECE_BY_ID = Object.freeze(Object.fromEntries(PIECES.map(p => [p.id, p])));

    function piece(id, shape, color, glow) {
        return Object.freeze({
            id,
            shape: Object.freeze(shape.map(row => Object.freeze(row.slice()))),
            color,
            glow
        });
    }

    function cloneShape(shape) {
        return shape.map(row => row.slice());
    }

    function createBoard() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    }

    function randomPiece(random = Math.random) {
        const idx = Math.floor(random() * PIECES.length);
        const base = PIECES[Math.min(idx, PIECES.length - 1)];
        return { ...base, shape: cloneShape(base.shape), rotation: 0 };
    }

    function createPieceBag(random = Math.random) {
        let bag = [];
        function refill() {
            bag = PIECES.map((_, i) => i);
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                const tmp = bag[i];
                bag[i] = bag[j];
                bag[j] = tmp;
            }
        }
        return {
            next() {
                if (bag.length === 0) refill();
                const base = PIECES[bag.pop()];
                return { ...base, shape: cloneShape(base.shape), rotation: 0 };
            },
            reset() {
                bag = [];
            }
        };
    }

    const WALL_KICK_DX = Object.freeze([0, -1, 1, -2, 2, -3]);
    const WALL_KICK_DY = Object.freeze([0, -1, -2, -3]);

    function tryRotate(board, piece, px, py) {
        if (!piece || !piece.shape) return null;
        const rotated = rotate(piece.shape);
        for (let yi = 0; yi < WALL_KICK_DY.length; yi++) {
            const dy = WALL_KICK_DY[yi];
            for (let xi = 0; xi < WALL_KICK_DX.length; xi++) {
                const dx = WALL_KICK_DX[xi];
                if (!collides(board, piece, px + dx, py + dy, rotated)) {
                    return { shape: rotated, x: px + dx, y: py + dy, dx, dy };
                }
            }
        }
        return null;
    }

    function rotate(matrix) {
        const height = matrix.length;
        const width = matrix[0].length;
        const result = Array.from({ length: width }, () => Array(height).fill(0));
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                result[x][height - 1 - y] = matrix[y][x];
            }
        }
        return result;
    }

    function collides(board, piece, px, py, shape = piece && piece.shape) {
        if (!piece || !shape) return true;
        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (!shape[y][x]) continue;
                const bx = px + x;
                const by = py + y;
                if (bx < 0 || bx >= COLS || by >= ROWS) return true;
                if (by >= 0 && board[by][bx]) return true;
            }
        }
        return false;
    }

    function clearCompletedRows(board) {
        const kept = [];
        const clearedRows = [];
        board.forEach((row, y) => {
            if (row.every(cell => cell !== 0)) {
                clearedRows.push({ y, cells: row.slice() });
            } else {
                kept.push(row.slice());
            }
        });
        return {
            board: Array.from({ length: clearedRows.length }, () => Array(COLS).fill(0)).concat(kept),
            cleared: clearedRows.length,
            clearedRows
        };
    }

    function lineScore(cleared, level) {
        const points = [0, 100, 300, 500, 800];
        return (points[cleared] ?? 800) * level;
    }

    function dropSpeedForLevel(difficultyKey, level) {
        const difficulty = DIFFICULTY[difficultyKey] || DIFFICULTY.medium;
        return Math.max(50, difficulty.baseSpeed - (level - 1) * difficulty.speedStep);
    }

    return {
        COLS,
        ROWS,
        CELL_SIZE,
        DIFFICULTY,
        PIECES,
        PIECE_BY_ID,
        createBoard,
        randomPiece,
        createPieceBag,
        rotate,
        tryRotate,
        collides,
        clearCompletedRows,
        lineScore,
        dropSpeedForLevel
    };
});
