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
    var activeEntries = DATA.entries;
    var activeDatasetVersion = DATA.datasetVersion;
    var $ = function (id) { return document.getElementById(id); };

    var KEYBOARD_ROWS = [
        ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['BACK', 'Y', 'X', 'C', 'V', 'B', 'N', 'M', 'DIR']
    ];

    var STORAGE_KEY = 'pandakreuzwort-save-v3';

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
    var composingWord = false;

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
        var milliseconds = runningSince != null ? elapsed + (Date.now() - runningSince) : elapsed;
        return Math.floor(milliseconds / 1000);
    }
    function pauseTimer() {
        if (runningSince != null) {
            elapsed += Date.now() - runningSince;
            runningSince = null;
        }
    }
    function formatTime(sec) {
        var total = Math.max(0, Math.floor(sec));
        var h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
        var p = function (n) { return String(n).padStart(2, '0'); };
        return h ? (p(h) + ':' + p(m) + ':' + p(s)) : (p(Math.floor(total / 60)) + ':' + p(s));
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
        boardEl.style.minWidth = Math.max(0, puzzle.cols * 30 + (puzzle.cols - 1) * 2 + 4) + 'px';
        boardEl.setAttribute('aria-rowcount', String(puzzle.rows));
        boardEl.setAttribute('aria-colcount', String(puzzle.cols));
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
        requestAnimationFrame(updateScrollHint);
    }

    function updateScrollHint() {
        var scroller = $('board-scroll');
        var hint = $('scroll-hint');
        if (!scroller || !hint) return;
        var scrollable = scroller.scrollWidth > scroller.clientWidth + 1 || scroller.scrollHeight > scroller.clientHeight + 1;
        hint.hidden = !scrollable;
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
        if (info) {
            info.btn.focus({ preventScroll: true });
            info.btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
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
        var reachedEnd = false;
        for (var i = 0; i < letters.length; i++) {
            if (!L.isGridLetter(letters[i]) || !selected) continue;
            var k = selected.r + ',' + selected.c;
            board[k] = letters[i];
            delete errors[k];
            var moved = advance();
            if (!moved) {
                reachedEnd = true;
                if (i + 1 < letters.length) break;
            }
        }
        syncWordInput();
        render();
        checkWin();
        if (status === 'playing' && reachedEnd) selectNextUnsolvedPlacement();
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

    function selectNextUnsolvedPlacement() {
        var current = activePlacement();
        var start = current ? puzzle.placements.indexOf(current) : -1;
        for (var offset = 0; offset < puzzle.placements.length; offset++) {
            var index = ((start < 0 ? 0 : start) + offset) % puzzle.placements.length;
            var candidate = puzzle.placements[index];
            var cells = placementCells(candidate);
            var target = null;
            for (var i = 0; i < cells.length; i++) {
                var k = cells[i].r + ',' + cells[i].c;
                if (board[k] !== puzzle.cells[k].letter) { target = cells[i]; break; }
            }
            if (target) {
                direction = candidate.dir;
                selected = { r: target.r, c: target.c };
                syncWordInput();
                render();
                focusSelected();
                announce('Weiter mit ' + candidate.number + ' ' + (candidate.dir === 'across' ? 'waagrecht' : 'senkrecht') + '.');
                return true;
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

    function parseWordDraft(value, length) {
        var slots = [];
        var chars = Array.from(String(value || '').normalize('NFC'));
        for (var i = 0; i < chars.length && slots.length < length; i++) {
            if (chars[i] === '·' || chars[i] === '_' || chars[i] === '.') {
                slots.push(null);
                continue;
            }
            // Natürliche Leerzeichen/Bindestriche werden bei komplett
            // eingegebenen Antworten ignoriert; sichtbare Lücken sind ·.
            if (/^[\s\-'’]$/.test(chars[i])) continue;
            var mapped = L.graphemes(chars[i]);
            for (var j = 0; j < mapped.length && slots.length < length; j++) {
                if (L.isGridLetter(mapped[j])) slots.push(mapped[j]);
            }
        }
        while (slots.length < length) slots.push(null);
        return slots;
    }

    function onWordInput(event) {
        if (status !== 'playing' || composingWord || (event && event.isComposing)) return;
        var pl = activePlacement();
        if (!pl) return;
        var cells = placementCells(pl);
        var letters = parseWordDraft(wordInput.value, cells.length);
        for (var i = 0; i < cells.length; i++) {
            var k = cells[i].r + ',' + cells[i].c;
            if (letters[i]) board[k] = letters[i];
            else delete board[k];
            delete errors[k];
        }
        // Während der Nutzer tippt, darf der Eingabewert nicht mit Platzhaltern
        // zurückgeschrieben werden: Das würde den Cursor ans Ende versetzen und IME
        // (z. B. Bildschirmtastaturen oder Spracheingabe) unterbrechen.
        render();
        checkWin();
        scheduleSave();
    }

    function syncWordInput(force) {
        if (!force && document.activeElement === wordInput) return;
        var pl = activePlacement();
        if (!pl) { wordInput.value = ''; wordInput.removeAttribute('maxlength'); wordLabel.textContent = 'Aktuelles Wort vollständig eingeben'; return; }
        var cells = placementCells(pl);
        var slots = [];
        for (var i = 0; i < cells.length; i++) slots.push(board[cells[i].r + ',' + cells[i].c] || '·');
        wordInput.value = slots.join('');
        wordInput.maxLength = Math.max(pl.length * 2, pl.length + 4); // ß/Um­laute dürfen beim Einfügen expandieren.
        var label = pl.number + ' ' + (pl.dir === 'across' ? 'waagrecht' : 'senkrecht') + ' (' + pl.length + ' Buchstaben)';
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
        // Falls gerade eine neue asynchrone Generierung angefordert wurde,
        // gehört „Neustart“ weiterhin zum tatsächlich sichtbaren Rätsel.
        seed = puzzle.seed;
        language = puzzle.language;
        difficulty = puzzle.difficulty;
        activeDatasetVersion = puzzle.datasetVersion;
        activeEntries = activeDatasetVersion === DATA.datasetVersion
            ? DATA.entries
            : DATA.legacyDatasets[activeDatasetVersion];
        $('lang-select').value = language;
        for (var profile of L.PROFILE_NAMES) $('diff-' + profile).setAttribute('aria-pressed', String(profile === difficulty));
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
        activeEntries = DATA.entries;
        activeDatasetVersion = DATA.datasetVersion;
        generate();
    }

    function generate() {
        var token = ++genToken;
        announce('Generiere neues Rätsel …');
        setTimeout(function () {
            if (token !== genToken) return;
            var p = L.generatePuzzle({
                seed: seed, language: language, difficulty: difficulty,
                entries: activeEntries, datasetVersion: activeDatasetVersion
            });
            var v = L.validatePuzzle(p, activeEntries);
            if (!v.ok || !p.qualityPassed) {
                // Sicherheitsnetz: sollte nie passieren; Fallback mit anderem Seed.
                seed = generateSeed();
                p = L.generatePuzzle({
                    seed: seed, language: language, difficulty: difficulty,
                    entries: activeEntries, datasetVersion: activeDatasetVersion
                });
                v = L.validatePuzzle(p, activeEntries);
                if (!v.ok || !p.qualityPassed) {
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
            announce('Neues Rätsel: ' + (language === 'de' ? 'Deutsch' : 'Bairisch') + ', ' + difficulty + ', ' + p.placements.length + ' Wörter · ' + Math.round(p.metrics.density * 100) + ' % Gitterdichte.');
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
                saveVersion: 3,
                seed: seed, language: language, difficulty: difficulty,
                datasetVersion: activeDatasetVersion, generatorVersion: L.GENERATOR_VERSION,
                board: board, errors: errors, hinted: hinted,
                selected: selected ? { r: selected.r, c: selected.c } : null,
                direction: direction,
                hintsLeft: hintsLeft, hintsUsed: hintsUsed, mistakes: mistakes,
                status: status,
                elapsed: getElapsed()
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
            if (!data || data.saveVersion !== 3 || data.generatorVersion !== L.GENERATOR_VERSION) return false;
            if (data.datasetVersion === DATA.datasetVersion) {
                activeEntries = DATA.entries;
                activeDatasetVersion = DATA.datasetVersion;
            } else if (DATA.legacyDatasets && Array.isArray(DATA.legacyDatasets[data.datasetVersion])) {
                activeEntries = DATA.legacyDatasets[data.datasetVersion];
                activeDatasetVersion = data.datasetVersion;
            } else {
                return false;
            }
            if (typeof data.seed !== 'string' || !data.seed || data.seed.length > 128) return false;
            language = data.language === 'bar' ? 'bar' : data.language === 'de' ? 'de' : '';
            difficulty = L.PROFILES[data.difficulty] ? data.difficulty : '';
            if (!language || !difficulty) return false;
            seed = data.seed;
            puzzle = L.generatePuzzle({
                seed: seed, language: language, difficulty: difficulty,
                entries: activeEntries, datasetVersion: activeDatasetVersion
            });
            var validation = L.validatePuzzle(puzzle, activeEntries);
            if (!validation.ok || !puzzle.qualityPassed) return false;

            board = {}; errors = {}; hinted = {};
            var savedBoard = data.board && typeof data.board === 'object' ? data.board : {};
            var savedErrors = data.errors && typeof data.errors === 'object' ? data.errors : {};
            var savedHinted = data.hinted && typeof data.hinted === 'object' ? data.hinted : {};
            for (var key in puzzle.cells) {
                if (L.isGridLetter(savedBoard[key])) board[key] = savedBoard[key];
                if (savedErrors[key] === true && board[key]) errors[key] = true;
                if (savedHinted[key] === true && board[key] === puzzle.cells[key].letter) hinted[key] = true;
            }
            var profileHints = L.PROFILES[difficulty].hints;
            hintsLeft = Number.isInteger(data.hintsLeft) ? Math.max(0, Math.min(profileHints, data.hintsLeft)) : profileHints;
            hintsUsed = Number.isInteger(data.hintsUsed) ? Math.max(0, Math.min(profileHints, data.hintsUsed)) : 0;
            mistakes = Number.isInteger(data.mistakes) ? Math.max(0, Math.min(1000000, data.mistakes)) : 0;
            elapsed = Number.isFinite(data.elapsed) ? Math.max(0, Math.min(604800, data.elapsed)) * 1000 : 0;
            direction = data.direction === 'down' ? 'down' : 'across';
            selected = null;
            if (data.selected && Number.isInteger(data.selected.r) && Number.isInteger(data.selected.c) && puzzle.cells[data.selected.r + ',' + data.selected.c]) {
                selected = { r: data.selected.r, c: data.selected.c };
            }
            var complete = true;
            for (var cellKey in puzzle.cells) {
                if (board[cellKey] !== puzzle.cells[cellKey].letter) { complete = false; break; }
            }
            status = data.status === 'won' && complete ? 'won' : 'playing';
            runningSince = status === 'playing' ? Date.now() : null;
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

        if (active) {
            $('active-clue-label').textContent = active.number + ' ' + (active.dir === 'across' ? 'waagrecht' : 'senkrecht') + ' · ' + active.length + ' Buchstaben';
            var activeText = active.clue;
            if (active.standardGerman) activeText += ' · Hochdeutsch: ' + active.standardGerman;
            $('active-clue-text').textContent = activeText;
        } else {
            $('active-clue-label').textContent = 'Aktueller Hinweis';
            $('active-clue-text').textContent = status === 'won' ? 'Rätsel vollständig gelöst.' : 'Wähle ein weißes Feld oder einen Hinweis.';
        }

        var filledCount = 0, totalCount = 0;
        for (var progressKey in puzzle.cells) { totalCount++; if (board[progressKey]) filledCount++; }
        $('mistakes').textContent = String(mistakes);
        $('hints-left').textContent = String(hintsLeft);
        $('progress').textContent = (totalCount ? Math.round(filledCount / totalCount * 100) : 0) + ' %';
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
        wordInput.addEventListener('compositionstart', function () { composingWord = true; });
        wordInput.addEventListener('compositionend', function () {
            composingWord = false;
            // CompositionEvent.isComposing kann am Ende noch true melden. Ohne
            // Event verarbeiten, sobald der IME-Text vollständig feststeht.
            onWordInput();
        });
        wordInput.addEventListener('input', onWordInput);
        wordInput.addEventListener('focus', function () { syncWordInput(true); wordInput.select(); });

        document.addEventListener('keydown', function (e) {
            var tag = (e.target && e.target.tagName) || '';
            if (!$('result').hidden) {
                if (e.key === 'Escape') { e.preventDefault(); $('result').hidden = true; }
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
        window.addEventListener('pagehide', function () { pauseTimer(); flushSave(); });
        window.addEventListener('pageshow', function () { if (status === 'playing' && runningSince == null) runningSince = Date.now(); });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') { pauseTimer(); flushSave(); }
            else if (status === 'playing' && runningSince == null) runningSince = Date.now();
        });
        window.addEventListener('resize', updateScrollHint);
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
            if (selected && cellMap[selected.r + ',' + selected.c]) {
                normalizeDirection();
                syncWordInput();
                render();
            } else if (first) selectCell(first.r, first.c, false);
            updateTimer();
            render();
            if (status === 'won') {
                $('result-text').textContent = 'Zeit: ' + formatTime(getElapsed()) + ' · Fehler: ' + mistakes + ' · Hinweise: ' + hintsUsed + '.';
                $('result').hidden = false;
            }
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
        getPuzzle: function () { return puzzle ? JSON.parse(JSON.stringify(puzzle)) : null; },
        getBoard: function () { return Object.assign({}, board); },
        parseWordDraft: parseWordDraft,
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
                metrics: puzzle ? Object.assign({}, puzzle.metrics) : null,
                datasetSize: DATA.entries.length,
                elapsed: getElapsed()
            };
        }
    };
})();
