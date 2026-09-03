/* === Minenräumkommando Foxtrott — UI / DOM-Schicht ===
   Nutzt ausschließlich MinesweeperLogic (globales Modul). Keine Inline-Handler,
   kein innerHTML für dynamische/inhaltliche Daten. */
(function () {
    'use strict';

    var L = window.MinesweeperLogic;
    var STATE = L.STATE;
    var DIFF = L.DIFFICULTY;

    // --- DOM-Referenzen ---
    var boardEl = document.getElementById('board');
    var mineCountEl = document.getElementById('mine-count');
    var timerEl = document.getElementById('timer');
    var statusTextEl = document.getElementById('status-text');
    var smileyEl = document.getElementById('smiley');
    var menuOverlay = document.getElementById('menu-overlay');
    var resultOverlay = document.getElementById('result-overlay');
    var gameEl = document.getElementById('game');
    // Focus-Containment für Modale: Hintergrund inert setzen, damit
    // Tastatur-/Screenreader-Nutzer nicht ins dahinterliegende Spiel tabben.
    function setGameInert(inert) {
        var background = [gameEl, document.querySelector('.back-link'), soundToggle];
        background.forEach(function (element) {
            if (!element) return;
            try { element.inert = inert; } catch (e) { /* inert evtl. nicht unterstützt */ }
        });
    }
    function focusFirstIn(overlay) {
        var f = overlay.querySelector('button, [href], input, select, textarea');
        if (f) f.focus();
    }
    function visibleModal() {
        if (resultOverlay.classList.contains('show')) return resultOverlay;
        if (window.getComputedStyle(menuOverlay).display !== 'none') return menuOverlay;
        return null;
    }
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        var overlay = visibleModal();
        if (!overlay) return;
        var focusables = Array.prototype.slice.call(overlay.querySelectorAll(
            'button:not([disabled]):not([hidden]), [href], input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"])'
        )).filter(function (element) { return !element.closest('[hidden]'); });
        if (!focusables.length) { e.preventDefault(); return; }
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }, true);
    var resultTitle = document.getElementById('result-title');
    var resultText = document.getElementById('result-text');
    var resultReplay = document.getElementById('result-replay');
    var resultMenu = document.getElementById('result-menu');
    var customToggle = document.getElementById('custom-toggle');
    var customForm = document.getElementById('custom-form');
    var customError = document.getElementById('custom-error');
    var custRows = document.getElementById('cust-rows');
    var custCols = document.getElementById('cust-cols');
    var custMines = document.getElementById('cust-mines');
    var soundToggle = document.getElementById('sound-toggle');
    var ariaStatus = document.getElementById('aria-status');
    var bestTimesList = document.getElementById('best-times-list');

    // --- Spielzustand ---
    var state = {
        board: null,
        config: null,          // {rows, cols, mines, key, label}
        minesPlaced: false,
        gameOver: false,
        won: false,
        startTime: 0,
        elapsedMs: 0,
        timerId: null,
        cursorR: 0,
        cursorC: 0,
        detonatedCell: null    // {r,c} der Mine, die das Spiel beendet hat
    };

    var soundEnabled = true;
    var audioCtx = null;

    // --- localStorage (defensiv, Safari-Privatmodus wirft) ---
    var LS_PREFIX = 'mf_';
    function lsGet(key) {
        try { return window.localStorage.getItem(LS_PREFIX + key); }
        catch (e) { return null; }
    }
    function lsSet(key, value) {
        try { window.localStorage.setItem(LS_PREFIX + key, value); return true; }
        catch (e) { return false; }
    }

    function bestTimeKey(diffKey, config) {
        if (diffKey === 'custom' && config) return 'best_custom_' + config.rows + 'x' + config.cols + 'x' + config.mines;
        return 'best_' + diffKey;
    }

    function getBestTime(diffKey, config) {
        var raw = lsGet(bestTimeKey(diffKey, config));
        var n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) return null;
        return Math.floor(n);
    }
    function recordBestTime(diffKey, seconds, config) {
        var prev = getBestTime(diffKey, config);
        if (prev === null || seconds < prev) {
            lsSet(bestTimeKey(diffKey, config), String(seconds));
            return true;
        }
        return false;
    }

    function renderBestTimes() {
        bestTimesList.textContent = '';
        L.DIFFICULTY_ORDER.forEach(function (key) {
            var cfg = DIFF[key];
            var li = document.createElement('li');
            var name = document.createElement('span');
            name.textContent = cfg.label;
            var val = document.createElement('span');
            val.className = 'bt-val';
            var best = getBestTime(key);
            val.textContent = best === null ? '—' : (best + 's');
            li.appendChild(name);
            li.appendChild(val);
            bestTimesList.appendChild(li);
        });
        // Benutzerdefiniert nur für die aktuell gewählte, exakt vergleichbare
        // Zeilen×Spalten×Minen-Konfiguration anzeigen.
        var customConfig = state.config && state.config.key === 'custom' ? state.config : null;
        var customBest = customConfig ? getBestTime('custom', customConfig) : null;
        if (customBest !== null) {
            var liC = document.createElement('li');
            var nameC = document.createElement('span');
            nameC.textContent = customConfig.rows + '×' + customConfig.cols + ' · ' + customConfig.mines + ' Minen';
            var valC = document.createElement('span');
            valC.className = 'bt-val';
            valC.textContent = customBest + 's';
            liC.appendChild(nameC);
            liC.appendChild(valC);
            bestTimesList.appendChild(liC);
        }
    }

    // --- Web-Audio (osc.onended Cleanup wie im Tetris-Vorbild) ---
    function initAudio() {
        if (!audioCtx) {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (AC) audioCtx = new AC();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(function () {});
        }
    }
    function playTone(freq, duration, type, volume) {
        if (!soundEnabled || !audioCtx) return;
        type = type || 'square';
        volume = (typeof volume === 'number') ? volume : 0.12;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.onended = function () {
            osc.disconnect();
            gain.disconnect();
        };
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }
    function sndReveal() { playTone(440, 0.05, 'square', 0.07); }
    function sndFlag()   { playTone(660, 0.06, 'triangle', 0.09); }
    function sndChord()  { playTone(330, 0.07, 'sawtooth', 0.08); }
    function sndBoom() {
        if (!soundEnabled || !audioCtx) return;
        playTone(110, 0.5, 'sawtooth', 0.2);
        window.setTimeout(function () { playTone(70, 0.4, 'square', 0.18); }, 80);
    }
    function sndWin() {
        if (!soundEnabled || !audioCtx) return;
        var notes = [523, 659, 784, 1047];
        notes.forEach(function (f, i) {
            window.setTimeout(function () { playTone(f, 0.22, 'square', 0.16); }, i * 110);
        });
    }

    // --- Hilfsfunktionen ---
    function pad3(n) {
        n = Math.max(-99, Math.min(999, Math.trunc(n)));
        var neg = n < 0;
        var s = String(Math.abs(n));
        while (s.length < 3) s = '0' + s;
        return (neg ? '-' : '') + s;
    }
    function announce(msg) {
        if (ariaStatus) {
            ariaStatus.textContent = '';
            // kurzer Tick, damit Screenreader den Wechsel mitbekommen
            window.setTimeout(function () { ariaStatus.textContent = msg; }, 30);
        }
    }
    function setSmiley(face) { smileyEl.textContent = face; }
    function setStatus(text) { statusTextEl.textContent = text; }

    function updateMineCounter() {
        // Die konfigurierte Minenzahl ist schon vor dem sicheren Erstklick bekannt;
        // nur die Positionen werden erst beim ersten Reveal ausgelost.
        var total = state.config ? state.config.mines : 0;
        var remaining = total - L.countFlags(state.board);
        mineCountEl.textContent = pad3(remaining);
    }

    // --- Timer ---
    function startTimer() {
        state.startTime = Date.now();
        if (state.timerId) window.clearInterval(state.timerId);
        state.timerId = window.setInterval(tickTimer, 250);
    }
    function stopTimer() {
        if (state.timerId) { window.clearInterval(state.timerId); state.timerId = null; }
        state.elapsedMs = Date.now() - state.startTime;
        timerEl.textContent = pad3(Math.floor(state.elapsedMs / 1000));
    }
    function tickTimer() {
        state.elapsedMs = Date.now() - state.startTime;
        timerEl.textContent = pad3(Math.floor(state.elapsedMs / 1000));
    }
    function resetTimer() {
        if (state.timerId) { window.clearInterval(state.timerId); state.timerId = null; }
        state.startTime = 0;
        state.elapsedMs = 0;
        timerEl.textContent = '000';
    }

    // --- Board-Rendering ---
    function buildBoardDom() {
        boardEl.textContent = '';
        boardEl.style.gridTemplateColumns = 'repeat(' + state.config.cols + ', var(--cell-size))';
        var grid = state.board.grid;
        for (var r = 0; r < state.board.rows; r++) {
            for (var c = 0; c < state.board.cols; c++) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cell';
                btn.dataset.r = String(r);
                btn.dataset.c = String(c);
                btn.setAttribute('role', 'gridcell');
                btn.tabIndex = (r === 0 && c === 0) ? 0 : -1; // roving tabindex
                btn.setAttribute('aria-label', cellAriaLabel(grid[r][c]));
                boardEl.appendChild(btn);
            }
        }
        state.cursorR = 0;
        state.cursorC = 0;
    }

    function cellButton(r, c) {
        return boardEl.children[r * state.board.cols + c];
    }

    function cellAriaLabel(cell) {
        var name = L.cellLabel(state.board, cell.r, cell.c);
        if (cell.state === STATE.FLAGGED) return name + ', markiert';
        if (cell.state === STATE.REVEALED) {
            if (cell.mine) return name + ', Mine, aufgedeckt';
            if (cell.adjacent === 0) return name + ', leer, aufgedeckt';
            return name + ', ' + cell.adjacent + ' Minen benachbart, aufgedeckt';
        }
        return name + ', verborgen';
    }

    function renderCell(r, c) {
        var cell = state.board.grid[r][c];
        var btn = cellButton(r, c);
        if (!btn) return;
        // Klassen zurücksetzen, relevante neu setzen
        btn.className = 'cell';
        btn.textContent = '';
        if (cell.state === STATE.REVEALED) {
            btn.classList.add('revealed');
            if (cell.mine) {
                btn.classList.add('mine');
                btn.textContent = '💣';
                if (state.detonatedCell &&
                    state.detonatedCell.r === r && state.detonatedCell.c === c) {
                    btn.classList.add('detonated');
                }
            } else if (cell.adjacent > 0) {
                btn.classList.add('n' + cell.adjacent);
                btn.textContent = String(cell.adjacent);
            }
        } else if (cell.state === STATE.FLAGGED) {
            btn.classList.add('flagged');
            btn.textContent = '🚩';
        }
        // Bei Niederlage falsche Flaggen markieren
        if (state.gameOver && !state.won && cell.state === STATE.FLAGGED && !cell.mine) {
            btn.classList.add('wrong-flag');
        }
        btn.setAttribute('aria-label', cellAriaLabel(cell));
    }

    function renderAll() {
        for (var r = 0; r < state.board.rows; r++) {
            for (var c = 0; c < state.board.cols; c++) {
                renderCell(r, c);
            }
        }
    }

    // --- Cursor / Fokus (roving tabindex) ---
    function moveCursor(dr, dc) {
        var nr = state.cursorR + dr;
        var nc = state.cursorC + dc;
        if (nr < 0 || nr >= state.board.rows || nc < 0 || nc >= state.board.cols) return;
        setCursor(nr, nc);
    }
    function setCursor(r, c) {
        var old = cellButton(state.cursorR, state.cursorC);
        if (old) old.tabIndex = -1;
        state.cursorR = r;
        state.cursorC = c;
        var btn = cellButton(r, c);
        if (btn) {
            btn.tabIndex = 0;
            btn.focus();
        }
    }

    // --- Spielaktionen ---
    function ensureMinesPlaced(safeR, safeC) {
        if (state.minesPlaced) return;
        L.placeMines(state.board, { mines: state.config.mines, safeR: safeR, safeC: safeC });
        state.minesPlaced = true;
        startTimer();
        updateMineCounter();
    }

    function doReveal(r, c) {
        if (state.gameOver) return;
        var cell = state.board.grid[r][c];
        if (cell.state !== STATE.HIDDEN) return; // nur hidden aufdeckbar
        ensureMinesPlaced(r, c);
        var res = L.reveal(state.board, r, c);
        renderRevealed(res.revealed);
        sndReveal();
        if (res.hitMine) {
            state.detonatedCell = { r: r, c: c };
            endGame(false);
        } else {
            updateMineCounter();
            if (L.checkWin(state.board)) endGame(true);
        }
    }

    function doFlag(r, c) {
        if (state.gameOver) return;
        var cell = state.board.grid[r][c];
        if (cell.state === STATE.REVEALED) return;
        // Vor dem ersten Reveal KEINE Minen platzieren (auch nicht beim Flaggen).
        var prev = cell.state;
        L.toggleFlag(state.board, r, c);
        renderCell(r, c);
        if (prev !== cell.state) {
            sndFlag();
            announce(cell.state === STATE.FLAGGED ? 'Flagge gesetzt' : 'Flagge entfernt');
        }
        updateMineCounter();
    }

    function doChord(r, c) {
        if (state.gameOver) return;
        var cell = state.board.grid[r][c];
        if (cell.state !== STATE.REVEALED || cell.adjacent === 0) return;
        var res = L.chord(state.board, r, c);
        if (res.revealed.length === 0) return;
        renderRevealed(res.revealed);
        sndChord();
        if (res.hitMine) {
            // Detonation in einem der aufgedeckten Nachbarn finden
            for (var i = 0; i < res.revealed.length; i++) {
                var p = res.revealed[i];
                if (state.board.grid[p.r][p.c].mine) {
                    state.detonatedCell = { r: p.r, c: p.c };
                    break;
                }
            }
            endGame(false);
        } else {
            updateMineCounter();
            if (L.checkWin(state.board)) endGame(true);
        }
    }

    function renderRevealed(list) {
        for (var i = 0; i < list.length; i++) {
            renderCell(list[i].r, list[i].c);
        }
    }

    function endGame(won) {
        state.gameOver = true;
        state.won = won;
        stopTimer();
        // Ergebnis, HUD und gespeicherte Bestzeit verwenden dieselbe volle-Sekunden-Regel.
        var seconds = Math.max(0, Math.floor(state.elapsedMs / 1000));
        if (won) {
            setSmiley('😎');
            setStatus('Sieg!');
            sndWin();
            var isNew = recordBestTime(state.config.key, seconds, state.config);
            resultOverlay.className = 'show win';
            resultTitle.textContent = 'Sieg!';
            resultText.textContent = isNew
                ? 'Zeit: ' + seconds + ' s — neue Bestzeit! 🎉'
                : 'Zeit: ' + seconds + ' s';
            announce('Sieg nach ' + seconds + ' Sekunden.');
        } else {
            setSmiley('😵');
            setStatus('Niederlage');
            sndBoom();
            // Alle Minen aufdecken + falsche Flaggen markieren
            for (var r = 0; r < state.board.rows; r++) {
                for (var c = 0; c < state.board.cols; c++) {
                    var cell = state.board.grid[r][c];
                    if (cell.mine && cell.state !== STATE.REVEALED && cell.state !== STATE.FLAGGED) {
                        cell.state = STATE.REVEALED;
                    }
                }
            }
            renderAll();
            resultOverlay.className = 'show lose';
            resultTitle.textContent = 'Niederlage';
            resultText.textContent = 'Du hast eine Mine ausgelöst. Zeit: ' + seconds + ' s';
            announce('Niederlage. Mine ausgelöst nach ' + seconds + ' Sekunden.');
        }
        renderBestTimes();
        setGameInert(true); // Hintergrund inert, solange das Ergebnis-Modal offen ist
        // Fokus auf Replay-Button für Tastatur-Nutzer
        window.setTimeout(function () { resultReplay.focus(); }, 50);
    }

    // --- Eingabe-Handler (alle via addEventListener, kein Inline) ---

    // Linke/rechte/mittlere Maustaste
    boardEl.addEventListener('mousedown', function (e) {
        var btn = e.target.closest ? e.target.closest('.cell') : null;
        if (!btn) return;
        initAudio();
        var r = Number(btn.dataset.r);
        var c = Number(btn.dataset.c);
        if (e.button === 0) {
            // Linksklick: auf revealed Zahl → Chord, sonst Reveal
            var cell = state.board.grid[r][c];
            if (cell.state === STATE.REVEALED && cell.adjacent > 0) {
                doChord(r, c);
            } else {
                doReveal(r, c);
            }
        } else if (e.button === 1) {
            // Mittelklick = Chord
            e.preventDefault();
            doChord(r, c);
        }
        // button 2 (rechts) vom contextmenu-Handler erfasst
    });

    // Rechtsklick = Flagge (Kontextmenü unterdrücken)
    // Auf Mobilgeräten feuert ein Lang-Druck zusätzlich das contextmenu-Ereignis
    // (touchstart ist passive und kann es nicht unterdrücken). Daher hier mit dem
    // Long-Press-Flag koordinieren, damit nicht doppelt geflaggt wird.
    boardEl.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        if (longPressTimer) { window.clearTimeout(longPressTimer); longPressTimer = null; }
        if (longPressFired || Date.now() < suppressContextMenuUntil) {
            // longPressFired bis touchend gesetzt lassen, damit diese Geste
            // keinesfalls zusätzlich als Tap/Reveal verarbeitet wird.
            return;
        }
        var btn = e.target.closest ? e.target.closest('.cell') : null;
        if (!btn) return;
        initAudio();
        var r = Number(btn.dataset.r);
        var c = Number(btn.dataset.c);
        doFlag(r, c);
    });

    // Touch: Tap = Reveal, Long-Press (~500ms) = Flagge
    var longPressTimer = null;
    var longPressFired = false;
    var suppressContextMenuUntil = 0;
    var touchStartPos = null;
    var touchMoved = false;

    boardEl.addEventListener('touchstart', function (e) {
        var btn = e.target.closest ? e.target.closest('.cell') : null;
        if (!btn) return;
        initAudio();
        longPressFired = false;
        touchMoved = false;
        var r = Number(btn.dataset.r);
        var c = Number(btn.dataset.c);
        var t = e.touches[0];
        touchStartPos = { x: t.clientX, y: t.clientY };
        longPressTimer = window.setTimeout(function () {
            longPressFired = true;
            suppressContextMenuUntil = Date.now() + 1200;
            doFlag(r, c);
            if (navigator.vibrate) navigator.vibrate(15);
        }, 500);
    }, { passive: true });

    boardEl.addEventListener('touchmove', function (e) {
        if (!touchStartPos) return;
        var t = e.touches[0];
        var dx = t.clientX - touchStartPos.x;
        var dy = t.clientY - touchStartPos.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            // Scroll/Geste → Long-Press und spätere Tap-Aktion abbrechen.
            touchMoved = true;
            if (longPressTimer) { window.clearTimeout(longPressTimer); longPressTimer = null; }
        }
    }, { passive: true });

    boardEl.addEventListener('touchend', function (e) {
        if (longPressTimer) { window.clearTimeout(longPressTimer); longPressTimer = null; }
        if (longPressFired) {
            // Long-Press hat bereits geflaggt → kein zusätzliches Reveal
            e.preventDefault();
            longPressFired = false;
            touchStartPos = null;
            return;
        }
        if (touchMoved) {
            // Die Geste diente dem Scrollen eines breiten Felds.
            touchMoved = false;
            touchStartPos = null;
            return;
        }
        var btn = e.target.closest ? e.target.closest('.cell') : null;
        if (!btn) return;
        var r = Number(btn.dataset.r);
        var c = Number(btn.dataset.c);
        var cell = state.board.grid[r][c];
        if (cell.state === STATE.REVEALED && cell.adjacent > 0) {
            doChord(r, c);
        } else {
            doReveal(r, c);
        }
        touchStartPos = null;
        e.preventDefault();
    });

    boardEl.addEventListener('touchcancel', function () {
        if (longPressTimer) { window.clearTimeout(longPressTimer); longPressTimer = null; }
        longPressFired = false;
        touchMoved = false;
        touchStartPos = null;
    });

    // Tastatur: Pfeile bewegen, Enter/Space = Reveal, F = Flag, C = Chord
    boardEl.addEventListener('keydown', function (e) {
        var focused = document.activeElement;
        if (!focused || !focused.classList || !focused.classList.contains('cell')) return;
        var r = Number(focused.dataset.r);
        var c = Number(focused.dataset.c);
        switch (e.key) {
            case 'ArrowLeft':  e.preventDefault(); moveCursor(0, -1); break;
            case 'ArrowRight': e.preventDefault(); moveCursor(0, 1); break;
            case 'ArrowUp':    e.preventDefault(); moveCursor(-1, 0); break;
            case 'ArrowDown':  e.preventDefault(); moveCursor(1, 0); break;
            case 'Home':       e.preventDefault(); setCursor(r, 0); break;
            case 'End':        e.preventDefault(); setCursor(r, state.board.cols - 1); break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                initAudio();
                doReveal(r, c);
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                initAudio();
                doFlag(r, c);
                break;
            case 'c':
            case 'C':
                e.preventDefault();
                doChord(r, c);
                break;
        }
    });

    // Beim Fokus einer Zelle Cursor nachziehen (Maus-Klick setzt Fokus)
    boardEl.addEventListener('focus', function (e) {
        var btn = e.target;
        if (btn && btn.classList && btn.classList.contains('cell')) {
            var r = Number(btn.dataset.r);
            var c = Number(btn.dataset.c);
            if (state.cursorR !== r || state.cursorC !== c) {
                var old = cellButton(state.cursorR, state.cursorC);
                if (old) old.tabIndex = -1;
                state.cursorR = r;
                state.cursorC = c;
                btn.tabIndex = 0;
            }
        }
    }, true);

    // --- Spielstart / Neustart ---
    function startGame(config) {
        state.config = config;
        state.board = L.createBoard(config.rows, config.cols);
        state.minesPlaced = false;
        state.gameOver = false;
        state.won = false;
        state.detonatedCell = null;
        resetTimer();
        mineCountEl.textContent = pad3(0);
        setSmiley('🙂');
        setStatus('Bereit');
        resultOverlay.className = '';
        menuOverlay.style.display = 'none';
        setGameInert(false);
        buildBoardDom();
        updateMineCounter();
        renderBestTimes();
        // Fokus aufs Board
        var first = cellButton(0, 0);
        if (first) first.focus();
        announce('Neues Spiel gestartet: ' + config.label + '.');
    }

    function startPreset(diffKey) {
        var cfg = DIFF[diffKey];
        startGame({
            rows: cfg.rows, cols: cfg.cols, mines: cfg.mines,
            key: diffKey, label: cfg.label
        });
    }

    function startCustom() {
        customError.textContent = '';
        var rows = parseInt(custRows.value, 10);
        var cols = parseInt(custCols.value, 10);
        var mines = parseInt(custMines.value, 10);
        if (!Number.isInteger(rows) || rows < 5 || rows > 40) {
            customError.textContent = 'Zeilen müssen zwischen 5 und 40 liegen.';
            custRows.focus();
            return;
        }
        if (!Number.isInteger(cols) || cols < 5 || cols > 40) {
            customError.textContent = 'Spalten müssen zwischen 5 und 40 liegen.';
            custCols.focus();
            return;
        }
        var maxMines = rows * cols - 9; // garantiert: 3×3-Safe-Zone immer möglich
        var minMines = 1;
        if (!Number.isInteger(mines) || mines < minMines || mines > maxMines) {
            customError.textContent = 'Minen müssen zwischen ' + minMines + ' und ' + maxMines + ' liegen.';
            custMines.focus();
            return;
        }
        startGame({ rows: rows, cols: cols, mines: mines, key: 'custom', label: 'Benutzerdefiniert' });
    }

    function showMenu() {
        if (state.timerId) { window.clearInterval(state.timerId); state.timerId = null; }
        resultOverlay.className = '';
        menuOverlay.style.display = 'flex';
        renderBestTimes();
        setGameInert(true);
        focusFirstIn(menuOverlay);
    }

    // --- Event-Bindings (Buttons) ---
    Array.prototype.forEach.call(
        document.querySelectorAll('[data-difficulty]'),
        function (btn) {
            btn.addEventListener('click', function () {
                var key = btn.dataset.difficulty;
                // Der «Spielen»-Submit-Button im Custom-Formular wird vom
                // submit-Handler behandelt; hier nicht zusätzlich auslösen
                // (sonst würde startCustom() zweimal laufen).
                if (btn.type === 'submit') return;
                if (key === 'custom') {
                    if (btn.id === 'custom-toggle') {
                        var open = customForm.hidden;
                        customForm.hidden = !open;
                        customToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                        if (open) { updateCustomMinesMax(); custRows.focus(); }
                    } else {
                        startCustom();
                    }
                } else {
                    startPreset(key);
                }
            });
        }
    );

    function updateCustomMinesMax() {
        var rows = parseInt(custRows.value, 10);
        var cols = parseInt(custCols.value, 10);
        if (Number.isInteger(rows) && Number.isInteger(cols) && rows >= 5 && cols >= 5) {
            var maxMines = rows * cols - 9;
            custMines.max = String(maxMines);
            var cur = parseInt(custMines.value, 10);
            if (Number.isInteger(cur) && cur > maxMines) custMines.value = String(maxMines);
        }
    }
    custRows.addEventListener('input', updateCustomMinesMax);
    custCols.addEventListener('input', updateCustomMinesMax);

    customForm.addEventListener('submit', function (e) {
        e.preventDefault();
        startCustom();
    });

    smileyEl.addEventListener('click', function () {
        // Neustart mit gleicher Konfiguration
        if (state.config) startGame(state.config);
        else showMenu();
    });

    resultReplay.addEventListener('click', function () {
        if (state.config) startGame(state.config);
        else showMenu();
    });
    resultMenu.addEventListener('click', showMenu);

    soundToggle.addEventListener('click', function () {
        soundEnabled = !soundEnabled;
        soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
        soundToggle.setAttribute('aria-label', soundEnabled ? 'Ton ausschalten' : 'Ton einschalten');
        if (soundEnabled) initAudio();
    });

    // --- Initialisierung ---
    renderBestTimes();
    menuOverlay.style.display = 'flex';
    setGameInert(true);
    focusFirstIn(menuOverlay);
})();
