/* === Pandakreuzwort — DOM-/UI-Schicht ===
   Baut das Gitter, die Hinweislisten, die mobile Wort-Eingabe und die
   Gittertastatur ausschließlich über createElement (kein innerHTML mit
   Nutzdaten, kein Fetch, keine externen Abhängigkeiten). Nutzt die reine
   PandakreuzwortLogic-API. Generation-Token schützt vor überholten
   Neustarts. */
(() => {
    'use strict';
    if (typeof window === 'undefined') return;
    var L = window.PandakreuzwortLogic;
    var DATA = window.PandakreuzwortData;
    var $ = function (id) { return document.getElementById(id); };

    var KEYBOARD_ROWS = [
        ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['BACK', 'Y', 'X', 'C', 'V', 'B', 'N', 'M', 'DIR']
    ];

    var STORAGE_KEY = 'pandakreuzwort-save-v2';

    // Spielzustand
    var puzzle = null;
    var board = {};            // "r,c" -> eingegebenes Graphem
    var errors = {};           // "r,c" -> true (falsch markiert)
    var hinted = {};           // "r,c" -> true (per Hinweis gesetzt)
    var selected = null;       // {r, c}
    var direction = 'across';
    var hintsLeft = 3, hintsUsed = 0, mistakes = 0;
    var status = 'playing';
    var language = 'de';
    var difficulty = 'mittel';
    var seed = '';
    var cellMap = {};
    var clueButtons = { across: [], down: [] };
    var genToken = 0;
    var elapsed = 0, runningSince = null, timerId = null;

    // DOM-Referenzen
    var boardEl, messageEl, wordInput, wordLabel, keyboardEl, acrossList, downList;

    function announce(text) { messageEl.textContent = text; }

    function generateSeed() {
        try {
            if (window.crypto && window.crypto.getRandomValues) {
                var a = new Uint32Array(2);
                window.crypto.getRandomValues(a);
                return a[0].toString(36) + '-' + a[1].toString(36);
            }
        } catch (_e) { /* Fallback */ }
        return 'r-' + Math.random().toString(36).slice(2, 10);
    }

    // ============================================================
    // Zeit
    // ============================================================
    function getElapsed() {
        return runningSince != null ? elapsed + Math.floor((Date.now() - runningSince) / 1000) : elapsed;
    }
    function pauseTimer() {
        if (runningSince != null) {
            elapsed += Math.floor((Date.now() - runningSince) / 1000);
            runningSince = null;
        }
    }
    function formatTime(sec) {
        var m = Math.floor(sec / 60) % 60, s = sec % 60;
        var p = function (n) { return String(n).padStart(2, '0'); };
        return p(m) + ':' + p(s);
    }
    function updateTimer() { $('time').textContent = formatTime(getElapsed()); }

    // ============================================================
    // Wort-/Zellen-Hilfen
    // ============================================================
    function placementCells(pl) {
        var g = L.graphemes(pl.gridAnswer);
        var dr = pl.dir === 'across' ? 0 : 1, dc = pl.dir === 'across' ? 1 : 0;
        var out = [];
        for (var i = 0; i < g.length; i++) out.push({ r: pl.row + dr * i, c: pl.col + dc * i });
        return out;
    }

    function activePlacement() {
        if (!selected) return null;
        var info = cellMap[selected.r + ',' + selected.c];
        if (!info) return null;
        var idx = direction === 'across' ? info.across : info.down;
        if (idx == null) idx = direction === 'across' ? info.down : info.across;
        return idx == null ? null : puzzle.placements[idx];
    }

    function normalizeDirection() {
        if (!selected) return;
        var info = cellMap[selected.r + ',' + selected.c];
        if (!info) return;
        var ok = direction === 'across' ? info.across != null : info.down != null;
        if (!ok) direction = direction === 'across' ? 'down' : 'across';
        ok = direction === 'across' ? info.across != null : info.down != null;
        if (!ok) direction = info.across != null ? 'across' : 'down';
    }

    // ============================================================
    // Gitter aufbauen
    // ============================================================
    function buildGrid() {
        boardEl.replaceChildren();
        cellMap = {};
        boardEl.style.gridTemplateColumns = 'repeat(' + puzzle.cols + ', 1fr)';
        boardEl.style.gridTemplateRows = 'repeat(' + puzzle.rows + ', 1fr)';
        for (var r = 0; r < puzzle.rows; r++) {
            for (var c = 0; c < puzzle.cols; c++) {
                var k = r + ',' + c;
                var info = puzzle.cells[k];
                if (!info) {
                    var blk = document.createElement('div');
                    blk.className = 'cell block';
                    blk.setAttribute('aria-hidden', 'true');
                    boardEl.appendChild(blk);
                    continue;
                }
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cell';
                btn.setAttribute('role', 'gridcell');
                btn.dataset.r = String(r);
                btn.dataset.c = String(c);
                btn.tabIndex = -1;
                var num = document.createElement('span');
                num.className = 'num';
                if (info.number) num.textContent = String(info.number);
                var letter = document.createElement('span');
                letter.className = 'letter';
                btn.appendChild(num);
                btn.appendChild(letter);
                btn.addEventListener('click', onCellClick);
                boardEl.appendChild(btn);
                cellMap[k] = { btn: btn, letter: letter, num: num, across: info.across, down: info.down };
            }
        }
    }

    function buildClues() {
        acrossList.replaceChildren();
        downList.replaceChildren();
        clueButtons = { across: [], down: [] };
        function makeBtn(clue, dir) {
            var li = document.createElement('li');
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'clue-btn';
            btn.dataset.dir = dir;
            btn.dataset.number = String(clue.number);
            var head = document.createElement('span');
            head.textContent = clue.number + '. ' + clue.clue + ' (' + clue.length + ')';
            btn.appendChild(head);
            if (dir === 'across') btn.dataset.label = clue.number + ' waagrecht';
            else btn.dataset.label = clue.number + ' senkrecht';
            if (clue.region || clue.standardGerman) {
                var meta = document.createElement('span');
                meta.className = 'meta';
                var parts = [];
                if (clue.region) parts.push('Region: ' + clue.region);
                if (clue.standardGerman) parts.push('Hochdeutsch: ' + clue.standardGerman);
                meta.textContent = parts.join(' · ');
                btn.appendChild(meta);
            }
            btn.addEventListener('click', function () { onClueClick(dir, clue.number); });
            li.appendChild(btn);
            return { btn: btn, clue: clue };
        }
        puzzle.clues.across.forEach(function (cl) {
            var item = makeBtn(cl, 'across');
            acrossList.appendChild(item.btn.parentElement);
            clueButtons.across.push(item);
        });
        puzzle.clues.down.forEach(function (cl) {
            var item = makeBtn(cl, 'down');
            downList.appendChild(item.btn.parentElement);
            clueButtons.down.push(item);
        });
    }

    function buildKeyboard() {
        keyboardEl.replaceChildren();
        KEYBOARD_ROWS.forEach(function (row) {
            var rowEl = document.createElement('div');
            rowEl.className = 'kbd-row';
            rowEl.style.gridTemplateColumns = 'repeat(' + row.length + ', 1fr)';
            row.forEach(function (key) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'key' + ((key === 'BACK' || key === 'DIR') ? ' wide' : '');
                btn.textContent = key === 'BACK' ? '⌫' : (key === 'DIR' ? '↔' : key);
                btn.setAttribute('aria-label', key === 'BACK' ? 'Löschen' : (key === 'DIR' ? 'Richtung wechseln' : key));
                btn.addEventListener('click', function () {
                    if (key === 'BACK') backspace();
                    else if (key === 'DIR') toggleDirection();
                    else typeLetter(key);
                });
                rowEl.appendChild(btn);
            });
            keyboardEl.appendChild(rowEl);
        });
    }

    // ============================================================
    // Auswahl & Eingabe
    // ============================================================
    function onCellClick(e) {
        var btn = e.currentTarget;
        var r = +btn.dataset.r, c = +btn.dataset.c;
        selectCell(r, c, true);
    }

    function onClueClick(dir, number) {
        var list = dir === 'across' ? clueButtons.across : clueButtons.down;
        for (var i = 0; i < list.length; i++) {
            if (list[i].clue.number === number) {
                var cells = placementCells(list[i].clue);
                direction = dir;
                selected = { r: cells[0].r, c: cells[0].c };
                syncWordInput();
                render();
                focusSelected();
                return;
            }
        }
    }

    function selectCell(r, c, toggle) {
        var info = cellMap[r + ',' + c];
        if (!info) return;
        if (selected && selected.r === r && selected.c === c && toggle) {
            if (info.across != null && info.down != null) {
                direction = direction === 'across' ? 'down' : 'across';
            }
        } else {
            selected = { r: r, c: c };
        }
        normalizeDirection();
        syncWordInput();
        render();
        focusSelected();
    }

    function focusSelected() {
        if (!selected) return;
        var info = cellMap[selected.r + ',' + selected.c];
        if (info) info.btn.focus({ preventScroll: true });
    }

    function toggleDirection() {
        if (!selected) return;
        var info = cellMap[selected.r + ',' + selected.c];
        if (!info) return;
        if (info.across != null && info.down != null) {
            direction = direction === 'across' ? 'down' : 'across';
            syncWordInput();
            render();
            focusSelected();
            announce('Richtung: ' + (direction === 'across' ? 'waagrecht' : 'senkrecht') + '.');
        } else {
            announce('An diesem Feld gibt es nur eine Richtung.');
        }
    }

    function typeLetter(ch) {
        if (status !== 'playing' || !selected) return;
        var letters = L.graphemes(ch);
        if (!letters.length) return;
        for (var i = 0; i < letters.length; i++) {
            if (!L.isGridLetter(letters[i]) || !selected) continue;
            var k = selected.r + ',' + selected.c;
            board[k] = letters[i];
            delete errors[k];
            var moved = advance();
            if (!moved && i + 1 < letters.length) break;
        }
        syncWordInput();
        render();
        checkWin();
        scheduleSave();
    }

    function advance() {
        var pl = activePlacement();
        if (!pl) return false;
        var cells = placementCells(pl);
        for (var i = 0; i < cells.length; i++) {
            if (cells[i].r === selected.r && cells[i].c === selected.c) {
                if (i + 1 < cells.length) {
                    selected = { r: cells[i + 1].r, c: cells[i + 1].c };
                    return true;
                }
                return false;
            }
        }
        return false;
    }

    function backspace() {
        if (status !== 'playing' || !selected) return;
        var k = selected.r + ',' + selected.c;
        if (board[k]) {
            delete board[k];
            delete errors[k];
        } else {
            var pl = activePlacement();
            if (pl) {
                var cells = placementCells(pl);
                for (var i = 0; i < cells.length; i++) {
                    if (cells[i].r === selected.r && cells[i].c === selected.c && i > 0) {
                        selected = { r: cells[i - 1].r, c: cells[i - 1].c };
                        delete board[selected.r + ',' + selected.c];
                        delete errors[selected.r + ',' + selected.c];
                        break;
                    }
                }
            }
        }
        syncWordInput();
        render();
        scheduleSave();
    }

    function moveBy(dr, dc) {
        if (!selected) return;
        if (dr !== 0) direction = 'down';
        if (dc !== 0) direction = 'across';
        var r = selected.r, c = selected.c;
        while (true) {
            r += dr; c += dc;
            if (r < 0 || r >= puzzle.rows || c < 0 || c >= puzzle.cols) { normalizeDirection(); render(); return; }
            if (cellMap[r + ',' + c]) {
                selected = { r: r, c: c };
                normalizeDirection();
                syncWordInput();
                render();
                focusSelected();
                return;
            }
        }
    }

    function onWordInput() {
        if (status !== 'playing') return;
        var pl = activePlacement();
        if (!pl) return;
        var cells = placementCells(pl);
        var letters = L.graphemes(wordInput.value);
        for (var i = 0; i < cells.length; i++) {
            var k = cells[i].r + ',' + cells[i].c;
            if (i < letters.length && L.isGridLetter(letters[i])) {
                board[k] = letters[i];
            } else {
                delete board[k];
            }
            delete errors[k];
        }
        render();
        checkWin();
        scheduleSave();
    }

    function syncWordInput() {
        var pl = activePlacement();
        if (!pl) { wordInput.value = ''; wordLabel.textContent = 'Aktuelles Wort'; return; }
        var cells = placementCells(pl);
        var s = '';
        for (var i = 0; i < cells.length; i++) {
            var v = board[cells[i].r + ',' + cells[i].c];
            if (v) s += v;
        }
        wordInput.value = s;
        var label = pl.number + ' ' + (pl.dir === 'across' ? 'waagrecht' : 'senkrecht') + ' (' + pl.length + ')';
        if (pl.region) label += ' · ' + pl.region;
        wordLabel.textContent = label;
    }

    // ============================================================
    // Aktionen
    // ============================================================
    function hintAction() {
        if (status !== 'playing') return;
        if (hintsLeft <= 0) { announce('Keine Hinweise mehr übrig.'); return; }
        var target = null;
        if (selected) {
            var k = selected.r + ',' + selected.c;
            if (board[k] !== puzzle.cells[k].letter) target = k;
        }
        if (!target) {
            var wrong = [];
            for (var ck in puzzle.cells) {
                if (board[ck] !== puzzle.cells[ck].letter) wrong.push(ck);
            }
            if (!wrong.length) { announce('Alles ist korrekt – kein Hinweis nötig.'); return; }
            target = wrong[Math.floor(Math.random() * wrong.length)];
        }
        var parts = target.split(',');
        board[target] = puzzle.cells[target].letter;
        hinted[target] = true;
        delete errors[target];
        hintsLeft--; hintsUsed++;
        selected = { r: +parts[0], c: +parts[1] };
        normalizeDirection();
        syncWordInput();
        render();
        focusSelected();
        saveGame();
        announce('Hinweis eingesetzt. Noch ' + hintsLeft + ' übrig.');
    }

    function checkAction() {
        if (status !== 'playing') return;
        var previousErrors = errors;
        errors = {};
        var wrongCount = 0;
        for (var ck in puzzle.cells) {
            if (board[ck] && board[ck] !== puzzle.cells[ck].letter) {
                errors[ck] = true;
                wrongCount++;
                if (!previousErrors[ck]) mistakes++;
            }
        }
        saveGame();
        render();
        announce(wrongCount === 0 ? 'Alle bisherigen Buchstaben stimmen.' : (wrongCount + ' falsche Buchstaben markiert.'));
    }

    function checkWin() {
        for (var ck in puzzle.cells) {
            if (board[ck] !== puzzle.cells[ck].letter) return;
        }
        status = 'won';
        pauseTimer();
        saveGame();
        render();
        $('result-title').textContent = 'Pandakreuzwort gelöst! 🎉';
        $('result-text').textContent = 'Zeit: ' + formatTime(getElapsed()) + ' · Fehler: ' + mistakes + ' · Hinweise: ' + hintsUsed + '.';
        $('result').hidden = false;
        $('result-new-btn').focus();
    }

    function restart() {
        genToken++;
        if (!puzzle) return;
        board = {}; errors = {}; hinted = {};
        selected = null; direction = 'across';
        hintsLeft = L.PROFILES[difficulty].hints; hintsUsed = 0; mistakes = 0;
        status = 'playing'; elapsed = 0; runningSince = Date.now();
        $('result').hidden = true;
        updateTimer();
        // Erste Zelle auswählen für sofortige Bedienung.
        var first = firstCell();
        if (first) selectCell(first.r, first.c, false);
        saveGame();
        render();
        announce('Neustart: dasselbe Rätsel (Seed ' + seed + ').');
    }

    function firstCell() {
        for (var r = 0; r < puzzle.rows; r++) {
            for (var c = 0; c < puzzle.cols; c++) {
                if (cellMap[r + ',' + c]) return { r: r, c: c };
            }
        }
        return null;
    }

    function newGame(newSeed) {
        if (newSeed == null) newSeed = generateSeed();
        seed = newSeed;
        generate();
    }

    function generate() {
        var token = ++genToken;
        announce('Generiere neues Rätsel …');
        setTimeout(function () {
            if (token !== genToken) return;
            var p = L.generatePuzzle({
                seed: seed, language: language, difficulty: difficulty,
                entries: DATA.entries, datasetVersion: DATA.datasetVersion
            });
            var v = L.validatePuzzle(p, DATA.entries);
            if (!v.ok) {
                // Sicherheitsnetz: sollte nie passieren; Fallback mit anderem Seed.
                seed = generateSeed();
                p = L.generatePuzzle({
                    seed: seed, language: language, difficulty: difficulty,
                    entries: DATA.entries, datasetVersion: DATA.datasetVersion
                });
                v = L.validatePuzzle(p, DATA.entries);
                if (!v.ok) {
                    // Beide Versuche ungültig → sicher scheitern, kein kaputtes Rätsel zeigen.
                    announce('Rätselgenerierung fehlgeschlagen. Bitte „Neues Spiel“ starten.');
                    return;
                }
            }
            puzzle = p;
            board = {}; errors = {}; hinted = {};
            selected = null; direction = 'across';
            hintsLeft = L.PROFILES[difficulty].hints; hintsUsed = 0; mistakes = 0;
            status = 'playing'; elapsed = 0; runningSince = Date.now();
            buildGrid();
            buildClues();
            var first = firstCell();
            if (first) selectCell(first.r, first.c, false);
            $('result').hidden = true;
            updateTimer();
            saveGame();
            render();
            announce('Neues Rätsel: ' + language + ', ' + difficulty + ', ' + p.placements.length + ' Wörter, Seed ' + seed + '.');
        }, 20);
    }

    function setLanguage(lang) {
        if (lang !== 'de' && lang !== 'bar') return;
        language = lang;
        $('lang-select').value = lang;
        newGame();
    }
    function setDifficulty(diff) {
        if (!L.PROFILES[diff]) return;
        difficulty = diff;
        for (var d of L.PROFILE_NAMES) {
            $('diff-' + d).setAttribute('aria-pressed', String(d === diff));
        }
        newGame();
    }

    // ============================================================
    // Speichern / Laden
    // ============================================================
    function saveGame() {
        if (!puzzle) return;
        try {
            var data = {
                seed: seed, language: language, difficulty: difficulty,
                board: board, errors: errors, hinted: hinted,
                hintsLeft: hintsLeft, hintsUsed: hintsUsed, mistakes: mistakes,
                status: status,
                elapsed: getElapsed(),
                puzzleSeed: puzzle.seed, puzzleLanguage: puzzle.language,
                puzzleDifficulty: puzzle.difficulty,
                datasetVersion: puzzle.datasetVersion, generatorVersion: puzzle.generatorVersion,
                placements: puzzle.placements, cells: puzzle.cells,
                rows: puzzle.rows, cols: puzzle.cols, clues: puzzle.clues
            };
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (_e) { /* Storage kann unavailable sein */ }
    }

    var saveTimer = null;
    function scheduleSave() {
        // Entprellt häufige Tastatureingaben; pagehide/visibilitychange leeren den Timer sofort.
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { saveTimer = null; saveGame(); }, 300);
    }
    function flushSave() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        saveGame();
    }

    function loadGame() {
        try {
            var raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            var data = JSON.parse(raw);
            if (!data || !data.placements) return false;
            var restored = L.sanitizeSavedPuzzle(data, DATA.entries);
            if (!restored) return false;
            puzzle = restored;
            seed = data.seed || generateSeed();
            language = (data.language === 'bar') ? 'bar' : 'de';
            difficulty = L.PROFILES[data.difficulty] ? data.difficulty : 'mittel';
            board = data.board || {};
            errors = data.errors || {};
            hinted = data.hinted || {};
            hintsLeft = (typeof data.hintsLeft === 'number') ? data.hintsLeft : L.PROFILES[difficulty].hints;
            hintsUsed = data.hintsUsed || 0;
            mistakes = data.mistakes || 0;
            elapsed = data.elapsed || 0;
            var complete = true;
            for (var cellKey in puzzle.cells) {
                if (board[cellKey] !== puzzle.cells[cellKey].letter) { complete = false; break; }
            }
            status = (data.status === 'won' && complete) ? 'won' : 'playing';
            runningSince = (status === 'playing') ? Date.now() : null;
            return true;
        } catch (_e) { return false; }
    }

    // ============================================================
    // Render
    // ============================================================
    function render() {
        if (!puzzle) return;
        var active = activePlacement();
        var activeKeys = {};
        if (active) {
            placementCells(active).forEach(function (cell) { activeKeys[cell.r + ',' + cell.c] = true; });
        }
        var tabKey = selected ? (selected.r + ',' + selected.c) : null;
        var anyFocused = false;
        for (var k in cellMap) {
            var c = cellMap[k];
            var v = board[k];
            var cls = 'cell';
            if (activeKeys[k]) cls += ' word';
            if (selected && selected.r === +k.split(',')[0] && selected.c === +k.split(',')[1]) cls += ' sel';
            if (errors[k]) cls += ' err';
            if (hinted[k]) cls += ' hint';
            c.btn.className = cls;
            c.letter.textContent = v || '';
            c.btn.tabIndex = (k === tabKey) ? 0 : -1;
            if (k === tabKey) anyFocused = true;
            c.btn.disabled = status !== 'playing';
            var r = +k.split(',')[0], col = +k.split(',')[1];
            var numTxt = c.num.textContent ? (c.num.textContent + ' ') : '';
            var dirTxt = active && activeKeys[k] ? (active.dir === 'across' ? 'waagrecht' : 'senkrecht') : '';
            c.btn.setAttribute('aria-label', 'Zeile ' + (r + 1) + ', Spalte ' + (col + 1) + ': ' + (v || 'leer') +
                (dirTxt ? ', aktiv ' + dirTxt : '') + (errors[k] ? ', falsch' : ''));
        }
        if (!anyFocused) {
            // Sicherstellen, dass genau eine Zelle tabbar ist (roving tabindex).
            var firstK = null;
            for (var fk in cellMap) { firstK = fk; break; }
            if (firstK) { cellMap[firstK].btn.tabIndex = 0; if (!selected) selected = { r: +firstK.split(',')[0], c: +firstK.split(',')[1] }; }
        }

        // Hinweislisten: aktiv/hat-gelöst markieren
        function markClues(list, dir) {
            list.forEach(function (item) {
                var cells = placementCells(item.clue);
                var solved = true;
                for (var i = 0; i < cells.length; i++) {
                    if (board[cells[i].r + ',' + cells[i].c] !== puzzle.cells[cells[i].r + ',' + cells[i].c].letter) { solved = false; break; }
                }
                item.btn.classList.toggle('solved', solved);
                var isActive = active && active.dir === dir && active.number === item.clue.number;
                item.btn.classList.toggle('active', !!isActive);
            });
        }
        markClues(clueButtons.across, 'across');
        markClues(clueButtons.down, 'down');

        $('mistakes').textContent = String(mistakes);
        $('hints-left').textContent = String(hintsLeft);
        $('status').textContent = status === 'playing' ? 'Läuft' : status === 'won' ? 'Gelöst' : '';
        $('hint-btn').disabled = hintsLeft <= 0 || status !== 'playing';
        $('check-btn').disabled = status !== 'playing';

        for (var d of L.PROFILE_NAMES) {
            $('diff-' + d).setAttribute('aria-pressed', String(d === difficulty));
        }
        $('lang-select').value = language;
    }

    // ============================================================
    // Event-Wiring
    // ============================================================
    function wire() {
        $('diff-leicht').addEventListener('click', function () { setDifficulty('leicht'); });
        $('diff-mittel').addEventListener('click', function () { setDifficulty('mittel'); });
        $('diff-schwer').addEventListener('click', function () { setDifficulty('schwer'); });
        $('diff-experte').addEventListener('click', function () { setDifficulty('experte'); });
        $('lang-select').addEventListener('change', function (e) { setLanguage(e.target.value); });
        $('dir-btn').addEventListener('click', toggleDirection);
        $('hint-btn').addEventListener('click', hintAction);
        $('check-btn').addEventListener('click', checkAction);
        $('restart-btn').addEventListener('click', restart);
        $('new-btn').addEventListener('click', function () { newGame(); });
        $('help-btn').addEventListener('click', function () { $('help').hidden = false; $('help-close').focus(); });
        $('help-close').addEventListener('click', function () { $('help').hidden = true; });
        $('result-new-btn').addEventListener('click', function () { newGame(); });
        $('result-close-btn').addEventListener('click', function () { $('result').hidden = true; });
        wordInput.addEventListener('input', onWordInput);
        wordInput.addEventListener('focus', syncWordInput);

        document.addEventListener('keydown', function (e) {
            var tag = (e.target && e.target.tagName) || '';
            if (!$('result').hidden) {
                if (e.key === 'Escape') { e.preventDefault(); $('result').hidden = true; }
                else if (e.key === 'Enter') { e.preventDefault(); newGame(); }
                return;
            }
            if (!$('help').hidden) {
                if (e.key === 'Escape') { e.preventDefault(); $('help').hidden = true; }
                return;
            }
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            var k = e.key;
            if (k === 'ArrowLeft') { e.preventDefault(); moveBy(0, -1); return; }
            if (k === 'ArrowRight') { e.preventDefault(); moveBy(0, 1); return; }
            if (k === 'ArrowUp') { e.preventDefault(); moveBy(-1, 0); return; }
            if (k === 'ArrowDown') { e.preventDefault(); moveBy(1, 0); return; }
            if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); backspace(); return; }
            if (k === 'Enter') { e.preventDefault(); toggleDirection(); return; }
            if (k === ' ') { e.preventDefault(); toggleDirection(); return; }
            if (k.length === 1) { typeLetter(k); }
        });

        timerId = setInterval(function () { if (status === 'playing') updateTimer(); }, 1000);

        // Bei Schließen/Verbergen der Seite den Entprell-Timer sofort leeren,
        // damit jede Eingabe sicher persistiert ist (auch beim mobileen Hintergrund).
        window.addEventListener('pagehide', flushSave);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') flushSave();
        });
    }

    // ============================================================
    // Boot
    // ============================================================
    function boot() {
        boardEl = $('board');
        messageEl = $('message');
        wordInput = $('word-input');
        wordLabel = $('word-input-label');
        keyboardEl = $('keyboard');
        acrossList = $('across-list');
        downList = $('down-list');
        buildKeyboard();
        wire();
        var loaded = loadGame();
        if (loaded) {
            buildGrid();
            buildClues();
            var first = firstCell();
            if (first) selectCell(first.r, first.c, false);
            updateTimer();
            render();
            announce('Gespeichertes Rätsel geladen (Seed ' + seed + ').');
        } else {
            seed = generateSeed();
            generate();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    // ============================================================
    // Öffentliche Test-API
    // ============================================================
    window.Pandakreuzwort = {
        newGame: newGame,
        restart: restart,
        hint: hintAction,
        check: checkAction,
        setLanguage: setLanguage,
        setDifficulty: setDifficulty,
        toggleDirection: toggleDirection,
        generatePuzzle: function (opts) { return L.generatePuzzle(opts); },
        validatePuzzle: function (p) { return L.validatePuzzle(p, DATA.entries); },
        getState: function () {
            return {
                status: status,
                language: language,
                difficulty: difficulty,
                seed: seed,
                selected: selected ? { r: selected.r, c: selected.c } : null,
                direction: direction,
                hintsLeft: hintsLeft,
                hintsUsed: hintsUsed,
                mistakes: mistakes,
                wordCount: puzzle ? puzzle.placements.length : 0,
                rows: puzzle ? puzzle.rows : 0,
                cols: puzzle ? puzzle.cols : 0,
                elapsed: getElapsed()
            };
        }
    };
})();
