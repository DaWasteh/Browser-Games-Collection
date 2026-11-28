/* === Pandakreuzwort — DOM-/UI-Schicht (v2.7) ===
   Baut Gitter, Lösungswort-Leiste, Hinweislisten (Deutsch & Bairisch verbunden),
   Tagesrätsel, Wort-Eingabe und adaptive Bildschirmtastatur ausschließlich über
   createElement (kein innerHTML mit Nutzdaten, kein Fetch, keine externen Abhängigkeiten). */
(() => {
    'use strict';
    if (typeof window === 'undefined') return;
    var L = window.PandakreuzwortLogic;
    var DATA = window.PandakreuzwortData;
    var activeEntries = DATA.entries;
    var activeDatasetVersion = DATA.datasetVersion;
    var $ = function (id) { return document.getElementById(id); };
    var BEST_KEY = 'pandakreuzwort-best-v1';
    var STATS_KEY = 'pandakreuzwort-stats-v1';
    var STORAGE_KEY = 'pandakreuzwort-save-v3';
    var PROFILE_LABELS = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer', experte: 'Experte' };
    var LANGUAGE_LABELS = { mix: 'Deutsch & Bairisch', de: 'Deutsch', bar: 'Bairisch' };
    var bestTimes = loadBestTimes();
    var stats = loadStats();

    function sfx(name) { if (window.GameAudio) window.GameAudio.play(name); }
    function languageLabel(lang) { return LANGUAGE_LABELS[lang] || 'Deutsch & Bairisch'; }

    function todayKey() {
        var now = new Date();
        var y = now.getFullYear();
        var m = String(now.getMonth() + 1).padStart(2, '0');
        var d = String(now.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    function dailySeedFor(dateStr) {
        return 'tagesraetsel-' + (dateStr || todayKey());
    }

    function loadBestTimes() {
        try {
            var raw = window.localStorage.getItem(BEST_KEY);
            var parsed = raw ? JSON.parse(raw) : null;
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (_e) { return {}; }
    }
    function saveBestTimes() {
        try { window.localStorage.setItem(BEST_KEY, JSON.stringify(bestTimes)); } catch (_e) { /* optional */ }
    }
    function loadStats() {
        var fallback = { wins: 0, bestScore: 0, streak: 0, bestStreak: 0, solutionWordsSolved: 0, dailyDates: [] };
        try {
            var raw = window.localStorage.getItem(STATS_KEY);
            var p = raw ? JSON.parse(raw) : null;
            if (!p || typeof p !== 'object') return fallback;
            var dailyDates = Array.isArray(p.dailyDates)
                ? p.dailyDates.filter(function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }).slice(-365)
                : [];
            return {
                wins: Number.isInteger(p.wins) && p.wins >= 0 ? Math.min(p.wins, 1000000) : 0,
                bestScore: Number.isFinite(p.bestScore) && p.bestScore >= 0 ? Math.floor(p.bestScore) : 0,
                streak: Number.isInteger(p.streak) && p.streak >= 0 ? Math.min(p.streak, 100000) : 0,
                bestStreak: Number.isInteger(p.bestStreak) && p.bestStreak >= 0 ? Math.min(p.bestStreak, 100000) : 0,
                solutionWordsSolved: Number.isInteger(p.solutionWordsSolved) && p.solutionWordsSolved >= 0 ? Math.min(p.solutionWordsSolved, 1000000) : 0,
                dailyDates: dailyDates
            };
        } catch (_e) { return fallback; }
    }
    function saveStats() {
        try { window.localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (_e) { /* optional */ }
    }
    function bestKeyFor(lang, diff) { return lang + '|' + diff; }
    function bestTimeFor(lang, diff) {
        var entry = bestTimes[bestKeyFor(lang, diff)];
        return (entry && typeof entry.time === 'number' && entry.time >= 0) ? entry : null;
    }

    var KEYBOARD_ROWS = [
        ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['DIR', 'Y', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK']
    ];

    // Spielzustand
    var puzzle = null;
    var board = {};            // "r,c" -> eingegebenes Graphem
    var errors = {};           // "r,c" -> true (falsch markiert)
    var verified = {};         // "r,c" -> true (per Prüfen als korrekt bestätigt)
    var hinted = {};           // "r,c" -> true (per Hinweis gesetzt)
    var selected = null;       // {r, c}
    var direction = 'across';
    var lastTypedCell = null;  // {r, c} direkt nach Auto-Vorschub, damit Backspace nie fremde Kreuzungsbuchstaben löscht
    var hintsLeft = 3, hintsUsed = 0, mistakes = 0;
    var status = 'playing';
    var language = 'mix';      // Standard in v2.7: Deutsch & Bairisch verbunden
    var difficulty = 'mittel';
    var seed = '';
    var cellMap = {};
    var clueButtons = { across: [], down: [] };
    var solutionSlots = [];
    var solutionAnnounced = false;
    var genToken = 0;
    var elapsed = 0, runningSince = null, timerId = null;
    var composingWord = false;
    var keyboardPref = null;   // null = automatisch (Touch an, Desktop aus), true/false = manuell
    var lastScrolledClueKey = '';

    // DOM-Referenzen
    var boardEl, messageEl, wordInput, wordLabel, keyboardEl, acrossList, downList, kbdToggleBtn;

    function announce(text) { messageEl.textContent = text; }

    function isDailyPuzzle() {
        return !!(puzzle && puzzle.language === 'mix' && puzzle.seed === dailySeedFor(todayKey()));
    }

    function isTodayDailySolved() {
        return stats.dailyDates.indexOf(todayKey()) !== -1;
    }

    function solutionWordsFor(lang) {
        if (DATA && DATA.solutionWords) {
            if (Array.isArray(DATA.solutionWords[lang])) return DATA.solutionWords[lang];
            if (Array.isArray(DATA.solutionWords.mix)) return DATA.solutionWords.mix;
        }
        return [];
    }

    function isSolutionWordSolved() {
        if (!puzzle || !puzzle.solutionWord || !puzzle.solutionWord.cells || !puzzle.solutionWord.cells.length) return false;
        for (var i = 0; i < puzzle.solutionWord.cells.length; i++) {
            var c = puzzle.solutionWord.cells[i];
            if (board[c.key] !== c.letter) return false;
        }
        return true;
    }

    function isPlacementSolved(pl) {
        if (!puzzle || !pl) return false;
        var cells = placementCells(pl);
        for (var j = 0; j < cells.length; j++) {
            var key = cells[j].r + ',' + cells[j].c;
            if (board[key] !== puzzle.cells[key].letter) return false;
        }
        return true;
    }

    function solvedPlacementSet() {
        var set = Object.create(null);
        if (!puzzle) return set;
        for (var i = 0; i < puzzle.placements.length; i++) {
            if (isPlacementSolved(puzzle.placements[i])) set[i] = true;
        }
        return set;
    }

    function flashSolvedPlacements(beforeSet) {
        if (!puzzle) return false;
        var anyNew = false;
        for (var i = 0; i < puzzle.placements.length; i++) {
            if (!beforeSet[i] && isPlacementSolved(puzzle.placements[i])) {
                anyNew = true;
                var cells = placementCells(puzzle.placements[i]);
                cells.forEach(function (pos) {
                    var cm = cellMap[pos.r + ',' + pos.c];
                    if (!cm) return;
                    cm.btn.classList.remove('just-solved');
                    void cm.btn.offsetWidth;
                    cm.btn.classList.add('just-solved');
                    setTimeout(function () {
                        if (cm && cm.btn) cm.btn.classList.remove('just-solved');
                    }, 460);
                });
            }
        }
        return anyNew;
    }

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

    function perpendicularPlacement() {
        if (!selected) return null;
        var info = cellMap[selected.r + ',' + selected.c];
        if (!info || info.across == null || info.down == null) return null;
        var idx = direction === 'across' ? info.down : info.across;
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

    function formatClueMeta(clue, solved) {
        if (clue.language !== 'bar' && !clue.region && !clue.standardGerman) return '';
        var parts = [];
        if (clue.region) parts.push('Region: ' + clue.region);
        var showStd = clue.standardGerman && (solved || L.shouldDisplayStandardGerman(clue));
        if (showStd) {
            var normDisp = L.normalizeGridAnswer(clue.displayAnswer || '');
            var normStd = L.normalizeGridAnswer(clue.standardGerman);
            if (!solved || normDisp !== normStd) {
                parts.push('Hochdeutsch: ' + clue.standardGerman);
            }
        }
        return parts.join(' · ');
    }

    // ============================================================
    // Gitter, Lösungswort & Tastatur aufbauen
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
                if (info.solutionIndex) {
                    var solNum = document.createElement('span');
                    solNum.className = 'sol-num';
                    solNum.textContent = String(info.solutionIndex);
                    solNum.setAttribute('aria-hidden', 'true');
                    btn.appendChild(solNum);
                }
                btn.addEventListener('click', onCellClick);
                boardEl.appendChild(btn);
                cellMap[k] = {
                    btn: btn, letter: letter, num: num,
                    across: info.across, down: info.down,
                    solutionIndex: info.solutionIndex || 0
                };
            }
        }
        buildSolutionBar();
        requestAnimationFrame(updateScrollHint);
    }

    function buildSolutionBar() {
        var box = $('solution-word-box');
        var slotsEl = $('solution-slots');
        var clueEl = $('solution-clue');
        var langEl = $('solution-lang');
        solutionSlots = [];
        slotsEl.replaceChildren();
        if (!puzzle || !puzzle.solutionWord || !puzzle.solutionWord.cells || !puzzle.solutionWord.cells.length) {
            box.hidden = true;
            if (langEl) langEl.hidden = true;
            return;
        }
        box.hidden = false;
        clueEl.textContent = puzzle.solutionWord.clue || '';
        if (langEl) {
            if (puzzle.solutionWord.language === 'bar') {
                langEl.textContent = 'Bairisch';
                langEl.hidden = false;
            } else {
                langEl.textContent = '';
                langEl.hidden = true;
            }
        }
        puzzle.solutionWord.cells.forEach(function (sc) {
            var slotBtn = document.createElement('button');
            slotBtn.type = 'button';
            slotBtn.className = 'sol-slot';
            slotBtn.dataset.r = String(sc.r);
            slotBtn.dataset.c = String(sc.c);
            var idxSpan = document.createElement('span');
            idxSpan.className = 'sol-slot-idx';
            idxSpan.textContent = String(sc.index);
            var charSpan = document.createElement('span');
            charSpan.className = 'sol-slot-char';
            slotBtn.append(idxSpan, charSpan);
            slotBtn.addEventListener('click', function () {
                selectCell(sc.r, sc.c, false);
            });
            slotsEl.appendChild(slotBtn);
            solutionSlots.push({ btn: slotBtn, charSpan: charSpan, cell: sc });
        });
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
        lastScrolledClueKey = '';
        function makeBtn(clue, dir) {
            var li = document.createElement('li');
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'clue-btn' + (clue.language === 'bar' ? ' is-bar' : '');
            btn.dataset.dir = dir;
            btn.dataset.number = String(clue.number);
            var head = document.createElement('span');
            head.className = 'clue-head';
            var textSpan = document.createElement('span');
            textSpan.className = 'clue-text';
            textSpan.textContent = clue.number + '. ' + clue.clue + ' (' + clue.length + ')';
            head.appendChild(textSpan);
            if (clue.language === 'bar') {
                var pill = document.createElement('span');
                pill.className = 'lang-pill';
                pill.textContent = 'Bairisch';
                head.appendChild(pill);
            }
            btn.appendChild(head);
            btn.dataset.label = clue.number + (dir === 'across' ? ' waagrecht' : ' senkrecht');
            var metaEl = null;
            var metaText = formatClueMeta(clue, false);
            if (clue.language === 'bar' || metaText) {
                metaEl = document.createElement('span');
                metaEl.className = 'meta';
                metaEl.textContent = metaText || 'Bairisch';
                btn.appendChild(metaEl);
            }
            btn.addEventListener('click', function () { onClueClick(dir, clue.number); });
            li.appendChild(btn);
            return { btn: btn, clue: clue, metaEl: metaEl };
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
        var holdTimer = 0;
        var repeatInterval = 0;
        function stopRepeat() {
            if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
            if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = 0; }
        }
        KEYBOARD_ROWS.forEach(function (row) {
            var rowEl = document.createElement('div');
            rowEl.className = 'kbd-row';
            rowEl.style.gridTemplateColumns = 'repeat(' + row.length + ', minmax(0, 1fr))';
            row.forEach(function (key) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'key' + (key === 'BACK' ? ' wide key-back' : (key === 'DIR' ? ' wide' : ''));
                btn.textContent = key === 'BACK' ? '⌫' : (key === 'DIR' ? '↔' : key);
                btn.setAttribute('aria-label', key === 'BACK' ? 'Löschen' : (key === 'DIR' ? 'Richtung wechseln' : key));
                // preventDefault bei pointerdown hält den Fokus stabil auf der Gitterzelle,
                // sodass nichts springt oder die Systemtastatur aufklappt.
                btn.addEventListener('pointerdown', function (ev) {
                    ev.preventDefault();
                    if (key === 'BACK') {
                        stopRepeat();
                        holdTimer = setTimeout(function () {
                            repeatInterval = setInterval(function () { backspace(); }, 85);
                        }, 380);
                    }
                });
                btn.addEventListener('pointerup', stopRepeat);
                btn.addEventListener('pointercancel', stopRepeat);
                btn.addEventListener('pointerleave', stopRepeat);
                btn.addEventListener('click', function () {
                    stopRepeat();
                    if (key === 'BACK') backspace();
                    else if (key === 'DIR') { sfx('tap'); toggleDirection(); }
                    else typeLetter(key);
                });
                rowEl.appendChild(btn);
            });
            keyboardEl.appendChild(rowEl);
        });
        syncKeyboardVisibility();
    }

    function shouldShowOnScreenKeyboard() {
        if (keyboardPref !== null) return keyboardPref;
        if (window.GameShell && window.GameShell.isTouchMode()) return true;
        return window.innerWidth <= 768;
    }

    function syncKeyboardVisibility() {
        if (!keyboardEl || !kbdToggleBtn) return;
        var visible = shouldShowOnScreenKeyboard();
        keyboardEl.hidden = !visible;
        kbdToggleBtn.setAttribute('aria-pressed', String(visible));
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
                // Erstes noch leeres Feld im Wort anspringen, sonst Wortanfang.
                var target = cells[0];
                for (var j = 0; j < cells.length; j++) {
                    if (!board[cells[j].r + ',' + cells[j].c]) { target = cells[j]; break; }
                }
                selected = { r: target.r, c: target.c };
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
        lastTypedCell = null;
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
        var solvedBefore = solvedPlacementSet();
        var solBefore = isSolutionWordSolved();
        var typed = false;
        lastTypedCell = null;
        for (var i = 0; i < letters.length; i++) {
            if (!L.isGridLetter(letters[i]) || !selected) continue;
            var cur = { r: selected.r, c: selected.c };
            var k = cur.r + ',' + cur.c;
            if (board[k] !== letters[i]) {
                delete hinted[k];
                delete verified[k];
            }
            board[k] = letters[i];
            delete errors[k];
            typed = true;
            var moved = advance();
            lastTypedCell = moved ? cur : null;
            if (!moved && i + 1 < letters.length) break;
        }
        syncWordInput();
        render();
        var newlySolvedWord = flashSolvedPlacements(solvedBefore);
        var solAfter = isSolutionWordSolved();
        if (typed) {
            if (solAfter && !solBefore && !solutionAnnounced) {
                solutionAnnounced = true;
                sfx('fanfare');
                if (window.GameFX) window.GameFX.pulse($('solution-word-box'));
                announce('🔑 Lösungswort gefunden: ' + puzzle.solutionWord.display + '!');
            } else if (newlySolvedWord) {
                sfx('success');
                if (window.GameFX) window.GameFX.pulse($('active-clue'));
            } else {
                sfx('type');
            }
        }
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

    function orderedPlacements() {
        if (!puzzle) return [];
        return puzzle.clues.across.concat(puzzle.clues.down);
    }

    function jumpWord(step) {
        if (!puzzle) return false;
        var list = orderedPlacements();
        if (!list.length) return false;
        var current = activePlacement();
        var idx = -1;
        if (current) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].dir === current.dir && list[i].number === current.number) { idx = i; break; }
            }
        }
        for (var offset = 1; offset <= list.length; offset++) {
            var nextIdx = (idx + step * offset + list.length * 4) % list.length;
            var cand = list[nextIdx];
            var cells = placementCells(cand);
            var target = null;
            for (var j = 0; j < cells.length; j++) {
                var ck = cells[j].r + ',' + cells[j].c;
                if (!board[ck]) { target = cells[j]; break; }
            }
            if (!target && offset === list.length) target = cells[0];
            if (target) {
                direction = cand.dir;
                selected = { r: target.r, c: target.c };
                syncWordInput();
                render();
                focusSelected();
                announce(cand.number + ' ' + (cand.dir === 'across' ? 'waagrecht' : 'senkrecht') +
                    (cand.language === 'bar' ? ' (Bairisch)' : '') + ': ' + cand.clue);
                return true;
            }
        }
        var fallback = list[(idx + step + list.length) % list.length];
        if (fallback) {
            var fcells = placementCells(fallback);
            direction = fallback.dir;
            selected = { r: fcells[0].r, c: fcells[0].c };
            syncWordInput();
            render();
            focusSelected();
            return true;
        }
        return false;
    }

    function clearCurrentCell() {
        if (status !== 'playing' || !selected) return;
        var k = selected.r + ',' + selected.c;
        if (board[k]) {
            delete board[k];
            delete errors[k];
            delete verified[k];
            delete hinted[k];
            sfx('tap');
            syncWordInput();
            render();
            scheduleSave();
        }
    }

    function backspace() {
        if (status !== 'playing' || !selected) return;
        var k = selected.r + ',' + selected.c;
        var changed = false;
        if (lastTypedCell) {
            var ltKey = lastTypedCell.r + ',' + lastTypedCell.c;
            if (board[ltKey]) {
                selected = { r: lastTypedCell.r, c: lastTypedCell.c };
                delete board[ltKey];
                delete errors[ltKey];
                delete verified[ltKey];
                delete hinted[ltKey];
                changed = true;
            }
            lastTypedCell = null;
        } else if (board[k]) {
            delete board[k];
            delete errors[k];
            delete verified[k];
            delete hinted[k];
            changed = true;
        } else {
            var pl = activePlacement();
            if (pl) {
                var cells = placementCells(pl);
                for (var i = 0; i < cells.length; i++) {
                    if (cells[i].r === selected.r && cells[i].c === selected.c && i > 0) {
                        selected = { r: cells[i - 1].r, c: cells[i - 1].c };
                        var prevK = selected.r + ',' + selected.c;
                        delete board[prevK];
                        delete errors[prevK];
                        delete verified[prevK];
                        delete hinted[prevK];
                        changed = true;
                        break;
                    }
                }
            }
        }
        if (changed) sfx('tap');
        syncWordInput();
        render();
        focusSelected();
        scheduleSave();
    }

    function moveBy(dr, dc) {
        if (!selected) return;
        lastTypedCell = null;
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
        var solvedBefore = solvedPlacementSet();
        var cells = placementCells(pl);
        var letters = parseWordDraft(wordInput.value, cells.length);
        var solBefore = isSolutionWordSolved();
        for (var i = 0; i < cells.length; i++) {
            var k = cells[i].r + ',' + cells[i].c;
            if (letters[i]) {
                if (board[k] !== letters[i]) {
                    delete hinted[k];
                    delete verified[k];
                }
                board[k] = letters[i];
            } else {
                delete board[k];
                delete hinted[k];
                delete verified[k];
            }
            delete errors[k];
        }
        // Während der Nutzer tippt, darf der Eingabewert nicht mit Platzhaltern
        // zurückgeschrieben werden (Cursor + IME bleiben stabil).
        render();
        var newlySolvedWord = flashSolvedPlacements(solvedBefore);
        if (!solBefore && isSolutionWordSolved() && !solutionAnnounced) {
            solutionAnnounced = true;
            sfx('fanfare');
            if (window.GameFX) window.GameFX.pulse($('solution-word-box'));
            announce('🔑 Lösungswort gefunden: ' + puzzle.solutionWord.display + '!');
        } else if (newlySolvedWord) {
            sfx('success');
            if (window.GameFX) window.GameFX.pulse($('active-clue'));
        }
        checkWin();
        scheduleSave();
    }

    function syncWordInput(force) {
        if (!force && document.activeElement === wordInput) return;
        var pl = activePlacement();
        if (!pl) { wordInput.value = ''; wordInput.removeAttribute('maxlength'); wordLabel.textContent = 'Wort direkt eintippen'; return; }
        var cells = placementCells(pl);
        var slots = [];
        var hasAny = false;
        for (var i = 0; i < cells.length; i++) {
            var ch = board[cells[i].r + ',' + cells[i].c];
            if (ch) hasAny = true;
            slots.push(ch || '·');
        }
        // Wenn noch kein Buchstabe steht, Feld leer lassen (kein ·-Salat beim Tippen).
        // Trailing-Punkte am Ende abschneiden, damit Backspace direkt den letzten Buchstaben löscht.
        var text = hasAny ? slots.join('').replace(/·+$/, '') : '';
        wordInput.value = text;
        wordInput.maxLength = Math.max(pl.length * 2, pl.length + 4);
        var label = pl.number + ' ' + (pl.dir === 'across' ? 'waagrecht' : 'senkrecht') + ' (' + pl.length + ' Buchstaben)';
        if (pl.language === 'bar') label += ' · Bairisch';
        if (pl.region) label += ' (' + pl.region + ')';
        wordLabel.textContent = label;
    }

    // ============================================================
    // Aktionen
    // ============================================================
    function hintAction() {
        if (status !== 'playing') return;
        if (hintsLeft <= 0) { announce('Keine Hinweise mehr übrig.'); return; }
        var target = null;
        // 1) Aktuell gewähltes Feld, falls noch leer oder falsch
        if (selected) {
            var k = selected.r + ',' + selected.c;
            if (board[k] !== puzzle.cells[k].letter) target = k;
        }
        // 2) Sonst nächstes offenes/falsches Feld im gerade aktiven Wort
        if (!target) {
            var pl = activePlacement();
            if (pl) {
                var pcells = placementCells(pl);
                for (var pi = 0; pi < pcells.length; pi++) {
                    var pk = pcells[pi].r + ',' + pcells[pi].c;
                    if (board[pk] !== puzzle.cells[pk].letter) { target = pk; break; }
                }
            }
        }
        // 3) Fallback: zufälliges offenes/falsches Feld irgendwo im Gitter
        if (!target) {
            var wrong = [];
            for (var ck in puzzle.cells) {
                if (board[ck] !== puzzle.cells[ck].letter) wrong.push(ck);
            }
            if (!wrong.length) { announce('Alles ist korrekt – kein Hinweis nötig.'); return; }
            target = wrong[Math.floor(Math.random() * wrong.length)];
        }
        var solvedBefore = solvedPlacementSet();
        var parts = target.split(',');
        board[target] = puzzle.cells[target].letter;
        hinted[target] = true;
        delete errors[target];
        delete verified[target];
        hintsLeft--; hintsUsed++;
        selected = { r: +parts[0], c: +parts[1] };
        normalizeDirection();
        syncWordInput();
        render();
        flashSolvedPlacements(solvedBefore);
        sfx('hint');
        if (window.GameFX && cellMap[target]) window.GameFX.pulse(cellMap[target].btn);
        focusSelected();
        checkWin();
        saveGame();
        if (status === 'playing') announce('Hinweis eingesetzt. Noch ' + hintsLeft + ' übrig.');
    }

    function checkAction() {
        if (status !== 'playing') return;
        var previousErrors = errors;
        errors = {};
        verified = {};
        var wrongCount = 0;
        var rightCount = 0;
        for (var ck in puzzle.cells) {
            if (!board[ck]) continue;
            if (board[ck] !== puzzle.cells[ck].letter) {
                errors[ck] = true;
                wrongCount++;
                if (!previousErrors[ck]) mistakes++;
            } else {
                verified[ck] = true;
                rightCount++;
            }
        }
        saveGame();
        render();
        if (wrongCount === 0) {
            sfx('success');
            announce(rightCount > 0 ? ('Alle ' + rightCount + ' eingetragenen Buchstaben stimmen.') : 'Noch keine Buchstaben eingetragen.');
        } else {
            sfx('error');
            if (window.GameFX) window.GameFX.shake(boardEl);
            announce(wrongCount + (wrongCount === 1 ? ' falscher Buchstabe markiert.' : ' falsche Buchstaben markiert.'));
        }
    }

    function clearErrorsAction() {
        if (status !== 'playing') return;
        var keys = Object.keys(errors);
        if (!keys.length) return;
        for (var i = 0; i < keys.length; i++) {
            delete board[keys[i]];
            delete errors[keys[i]];
            delete verified[keys[i]];
        }
        sfx('undo');
        syncWordInput(true);
        render();
        focusSelected();
        saveGame();
        announce(keys.length + (keys.length === 1 ? ' falsches Feld geleert.' : ' falsche Felder geleert.'));
    }

    function renderResultGlossary() {
        var box = $('result-glossary');
        var listEl = $('result-glossary-list');
        if (!box || !listEl || !puzzle) return;
        listEl.replaceChildren();
        var seen = Object.create(null);
        var items = [];
        for (var i = 0; i < puzzle.placements.length; i++) {
            var pl = puzzle.placements[i];
            if (pl.language !== 'bar' || !pl.standardGerman) continue;
            if (seen[pl.gridAnswer]) continue;
            seen[pl.gridAnswer] = true;
            items.push({ bar: pl.displayAnswer, de: pl.standardGerman });
        }
        if (!items.length) {
            box.hidden = true;
            return;
        }
        items.sort(function (a, b) { return a.bar.localeCompare(b.bar, 'de'); });
        items.forEach(function (it) {
            var li = document.createElement('li');
            var strong = document.createElement('strong');
            strong.textContent = it.bar;
            var sep = document.createElement('span');
            sep.textContent = ' = ' + it.de;
            li.append(strong, sep);
            listEl.appendChild(li);
        });
        box.hidden = false;
    }

    function checkWin() {
        if (status !== 'playing') return;
        for (var ck in puzzle.cells) {
            if (board[ck] !== puzzle.cells[ck].letter) return;
        }
        status = 'won';
        pauseTimer();
        var elapsedSec = getElapsed();
        var solSolved = isSolutionWordSolved();
        var score = L.computeScore({
            wordCount: puzzle.placements.length,
            solutionWordSolved: solSolved,
            elapsedSec: elapsedSec,
            mistakes: mistakes,
            hintsUsed: hintsUsed,
            difficulty: difficulty
        });

        var previousBest = bestTimeFor(language, difficulty);
        var isRecord = !previousBest || elapsedSec < previousBest.time;
        if (isRecord) {
            bestTimes[bestKeyFor(language, difficulty)] = {
                time: elapsedSec, mistakes: mistakes, hints: hintsUsed, score: score,
                date: new Date().toISOString().slice(0, 10)
            };
            saveBestTimes();
        }

        stats.wins += 1;
        stats.streak += 1;
        stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
        stats.bestScore = Math.max(stats.bestScore, score);
        if (solSolved) stats.solutionWordsSolved += 1;
        if (isDailyPuzzle() && !isTodayDailySolved()) {
            stats.dailyDates.push(todayKey());
            if (stats.dailyDates.length > 365) stats.dailyDates = stats.dailyDates.slice(-365);
        }
        saveStats();

        if (window.GameScores) {
            window.GameScores.record('pandakreuzwort', {
                score: score,
                timeSec: elapsedSec,
                won: true,
                label: 'Bestwert ' + score.toLocaleString('de-DE') + ' · ' + stats.wins + ' gelöst'
            });
        }

        saveGame();
        render();
        sfx('win');
        if (window.GameFX) window.GameFX.celebrate();
        var recordText = isRecord
            ? ' 🏆 Neue Bestzeit für ' + languageLabel(language) + ' (' + (PROFILE_LABELS[difficulty] || difficulty) + ')!'
            : (previousBest ? ' Bestzeit: ' + formatTime(previousBest.time) + '.' : '');
        $('result-title').textContent = isDailyPuzzle() ? 'Tagesrätsel gelöst! 🎉' : 'Pandakreuzwort gelöst! 🎉';
        var solBox = $('result-solution');
        if (puzzle.solutionWord) {
            solBox.hidden = false;
            solBox.textContent = '🔑 Lösungswort: ' + puzzle.solutionWord.display + (puzzle.solutionWord.clue ? ' – ' + puzzle.solutionWord.clue : '');
        } else {
            solBox.hidden = true;
        }
        $('result-text').textContent = 'Zeit: ' + formatTime(elapsedSec) + ' · Fehler: ' + mistakes + ' · Hinweise: ' + hintsUsed + '.' + recordText;
        $('result-score').textContent = score.toLocaleString('de-DE');
        $('result-best-score').textContent = stats.bestScore.toLocaleString('de-DE');
        $('result-wins').textContent = String(stats.wins);
        renderResultGlossary();
        $('result').hidden = false;
        $('result-new-btn').focus();
    }

    function restart() {
        genToken++;
        if (!puzzle) return;
        seed = puzzle.seed;
        language = puzzle.language;
        difficulty = puzzle.difficulty;
        activeDatasetVersion = puzzle.datasetVersion;
        activeEntries = activeDatasetVersion === DATA.datasetVersion
            ? DATA.entries
            : DATA.legacyDatasets[activeDatasetVersion];
        $('lang-select').value = language;
        for (var profile of L.PROFILE_NAMES) $('diff-' + profile).setAttribute('aria-pressed', String(profile === difficulty));
        board = {}; errors = {}; verified = {}; hinted = {};
        selected = null; direction = 'across'; solutionAnnounced = false;
        hintsLeft = L.PROFILES[difficulty].hints; hintsUsed = 0; mistakes = 0;
        status = 'playing'; elapsed = 0; runningSince = Date.now();
        $('result').hidden = true;
        updateTimer();
        sfx('undo');
        var first = firstCell();
        if (first) selectCell(first.r, first.c, false);
        saveGame();
        render();
        announce('Rätsel neu gestartet.');
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
        sfx('deal');
        seed = newSeed;
        activeEntries = DATA.entries;
        activeDatasetVersion = DATA.datasetVersion;
        generate();
    }

    function startDaily() {
        language = 'mix';
        $('lang-select').value = 'mix';
        newGame(dailySeedFor(todayKey()));
    }

    function generate() {
        var token = ++genToken;
        announce('Neues Rätsel wird erstellt …');
        setTimeout(function () {
            if (token !== genToken) return;
            var p = L.generatePuzzle({
                seed: seed, language: language, difficulty: difficulty,
                entries: activeEntries, datasetVersion: activeDatasetVersion,
                solutionWords: solutionWordsFor(language)
            });
            var v = L.validatePuzzle(p, activeEntries);
            if (!v.ok || !p.qualityPassed) {
                seed = generateSeed();
                p = L.generatePuzzle({
                    seed: seed, language: language, difficulty: difficulty,
                    entries: activeEntries, datasetVersion: activeDatasetVersion,
                    solutionWords: solutionWordsFor(language)
                });
                v = L.validatePuzzle(p, activeEntries);
                if (!v.ok || !p.qualityPassed) {
                    // Beide Versuche ungültig → sicher scheitern, kein kaputtes Rätsel zeigen.
                    announce('Rätsel konnte nicht erstellt werden. Bitte erneut versuchen.');
                    return;
                }
            }
            puzzle = p;
            board = {}; errors = {}; verified = {}; hinted = {};
            selected = null; direction = 'across'; solutionAnnounced = false;
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
            var mixNote = language === 'mix' && p.metrics
                ? (' (' + p.metrics.deCount + ' Deutsch, ' + p.metrics.barCount + ' Bairisch)')
                : '';
            var prefix = isDailyPuzzle() ? 'Tagesrätsel: ' : 'Neues Rätsel: ';
            announce(prefix + languageLabel(language) + ', ' + (PROFILE_LABELS[difficulty] || difficulty) + ', ' +
                p.placements.length + ' Wörter' + mixNote + (p.solutionWord ? ' + Lösungswort.' : '.'));
        }, 20);
    }

    function setLanguage(lang) {
        if (!L.isSupportedLanguage(lang)) return;
        language = lang;
        $('lang-select').value = lang;
        newGame();
    }
    function setDifficulty(diff) {
        if (!L.PROFILES[diff]) return;
        var keepDaily = isDailyPuzzle();
        difficulty = diff;
        for (var d of L.PROFILE_NAMES) {
            $('diff-' + d).setAttribute('aria-pressed', String(d === diff));
        }
        newGame(keepDaily ? dailySeedFor(todayKey()) : undefined);
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
                board: board, errors: errors, verified: verified, hinted: hinted,
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
            language = L.isSupportedLanguage(data.language) ? data.language : '';
            difficulty = L.PROFILES[data.difficulty] ? data.difficulty : '';
            if (!language || !difficulty) return false;
            seed = data.seed;
            puzzle = L.generatePuzzle({
                seed: seed, language: language, difficulty: difficulty,
                entries: activeEntries, datasetVersion: activeDatasetVersion,
                solutionWords: solutionWordsFor(language)
            });
            var validation = L.validatePuzzle(puzzle, activeEntries);
            if (!validation.ok || !puzzle.qualityPassed) return false;

            board = {}; errors = {}; verified = {}; hinted = {};
            var savedBoard = data.board && typeof data.board === 'object' ? data.board : {};
            var savedErrors = data.errors && typeof data.errors === 'object' ? data.errors : {};
            var savedVerified = data.verified && typeof data.verified === 'object' ? data.verified : {};
            var savedHinted = data.hinted && typeof data.hinted === 'object' ? data.hinted : {};
            for (var key in puzzle.cells) {
                if (L.isGridLetter(savedBoard[key])) board[key] = savedBoard[key];
                if (savedErrors[key] === true && board[key]) errors[key] = true;
                if (savedVerified[key] === true && board[key] === puzzle.cells[key].letter) verified[key] = true;
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
            solutionAnnounced = isSolutionWordSolved();
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
            if (c.solutionIndex) cls += ' has-sol';
            if (activeKeys[k]) cls += ' word';
            if (verified[k]) cls += ' ok';
            if (selected && selected.r === +k.split(',')[0] && selected.c === +k.split(',')[1]) cls += ' sel';
            if (errors[k]) cls += ' err';
            if (hinted[k]) cls += ' hint';
            c.btn.className = cls;
            c.letter.textContent = v || '';
            c.btn.tabIndex = (k === tabKey) ? 0 : -1;
            if (k === tabKey) anyFocused = true;
            c.btn.disabled = status !== 'playing';
            var r = +k.split(',')[0], col = +k.split(',')[1];
            var dirTxt = active && activeKeys[k] ? (active.dir === 'across' ? 'waagrecht' : 'senkrecht') : '';
            var solTxt = c.solutionIndex ? (', Lösungswort-Buchstabe ' + c.solutionIndex) : '';
            c.btn.setAttribute('aria-label', 'Zeile ' + (r + 1) + ', Spalte ' + (col + 1) + ': ' + (v || 'leer') +
                (dirTxt ? ', aktiv ' + dirTxt : '') + solTxt + (errors[k] ? ', falsch' : verified[k] ? ', bestätigt' : ''));
        }
        if (!anyFocused) {
            var firstK = null;
            for (var fk in cellMap) { firstK = fk; break; }
            if (firstK) { cellMap[firstK].btn.tabIndex = 0; if (!selected) selected = { r: +firstK.split(',')[0], c: +firstK.split(',')[1] }; }
        }

        // Lösungswort-Leiste aktualisieren
        if (puzzle.solutionWord && solutionSlots.length) {
            var solFilled = 0;
            var solSolved = isSolutionWordSolved();
            solutionSlots.forEach(function (item) {
                var letter = board[item.cell.key] || '';
                if (letter) solFilled++;
                item.charSpan.textContent = letter;
                var isCur = selected && selected.r === item.cell.r && selected.c === item.cell.c;
                item.btn.classList.toggle('is-active', !!isCur);
                item.btn.classList.toggle('is-filled', !!letter);
                item.btn.classList.toggle('is-correct', solSolved);
                item.btn.setAttribute('aria-label', 'Lösungswort Stelle ' + item.cell.index + ': ' + (letter || 'leer'));
            });
            var solBox = $('solution-word-box');
            solBox.classList.toggle('is-solved', solSolved);
            $('solution-badge').textContent = solSolved ? ('✓ ' + puzzle.solutionWord.display) : (solFilled + ' / ' + solutionSlots.length);
        }

        var activeClueBtn = null;
        var activeClueKey = active ? (active.dir + ':' + active.number) : '';
        function markClues(list, dir) {
            var solvedCount = 0;
            list.forEach(function (item) {
                var solved = isPlacementSolved(item.clue);
                if (solved) solvedCount++;
                item.btn.classList.toggle('solved', solved);
                if (item.metaEl) {
                    item.metaEl.textContent = formatClueMeta(item.clue, solved) || 'Bairisch';
                }
                var isActive = active && active.dir === dir && active.number === item.clue.number;
                item.btn.classList.toggle('active', !!isActive);
                if (isActive) activeClueBtn = item.btn;
            });
            return solvedCount;
        }
        var solvedAcross = markClues(clueButtons.across, 'across');
        var solvedDown = markClues(clueButtons.down, 'down');
        if ($('across-count')) $('across-count').textContent = solvedAcross + ' / ' + clueButtons.across.length;
        if ($('down-count')) $('down-count').textContent = solvedDown + ' / ' + clueButtons.down.length;

        // Auf breiten Desktop-Spalten den aktiven Hinweis sanft im sichtbaren Bereich halten
        if (activeClueBtn && activeClueKey !== lastScrolledClueKey) {
            lastScrolledClueKey = activeClueKey;
            var colEl = activeClueBtn.closest('.clue-col');
            if (colEl && colEl.scrollHeight > colEl.clientHeight + 4) {
                activeClueBtn.scrollIntoView({ block: 'nearest' });
            }
        }

        var langPill = $('active-clue-lang');
        var crossBtn = $('cross-switch-btn');
        if (active) {
            $('active-clue-label').textContent = active.number + ' ' + (active.dir === 'across' ? 'waagrecht' : 'senkrecht') + ' · ' + active.length + ' Buchstaben';
            if (langPill) {
                if (active.language === 'bar') {
                    langPill.textContent = active.region ? ('Bairisch · ' + active.region) : 'Bairisch';
                    langPill.hidden = false;
                } else {
                    langPill.textContent = '';
                    langPill.hidden = true;
                }
            }
            var activeText = active.clue;
            if (active.standardGerman && (isPlacementSolved(active) || L.shouldDisplayStandardGerman(active))) {
                var normD = L.normalizeGridAnswer(active.displayAnswer || '');
                var normS = L.normalizeGridAnswer(active.standardGerman);
                if (normD !== normS) activeText += ' · Hochdeutsch: ' + active.standardGerman;
            }
            $('active-clue-text').textContent = activeText;
            var perp = perpendicularPlacement();
            if (crossBtn) {
                if (perp) {
                    crossBtn.hidden = false;
                    crossBtn.textContent = '↔ ' + perp.number + (perp.dir === 'across' ? ' →' : ' ↓');
                    crossBtn.setAttribute('aria-label', 'Zu ' + perp.number + ' ' + (perp.dir === 'across' ? 'waagrecht' : 'senkrecht') + ' wechseln');
                } else {
                    crossBtn.hidden = true;
                }
            }
        } else {
            $('active-clue-label').textContent = 'Aktueller Hinweis';
            if (langPill) langPill.hidden = true;
            if (crossBtn) crossBtn.hidden = true;
            $('active-clue-text').textContent = status === 'won' ? 'Rätsel vollständig gelöst.' : 'Wähle ein weißes Feld oder einen Hinweis.';
        }

        var errCount = Object.keys(errors).length;
        var errBar = $('error-bar');
        if (errBar) {
            if (errCount > 0 && status === 'playing') {
                errBar.hidden = false;
                $('error-bar-text').textContent = errCount + (errCount === 1 ? ' Fehler markiert' : ' Fehler markiert');
            } else {
                errBar.hidden = true;
            }
        }

        var filledCount = 0, totalCount = 0;
        for (var progressKey in puzzle.cells) { totalCount++; if (board[progressKey]) filledCount++; }
        $('mistakes').textContent = String(mistakes);
        $('hints-left').textContent = String(hintsLeft);
        var bestEntry = bestTimeFor(language, difficulty);
        $('best-time').textContent = bestEntry ? formatTime(bestEntry.time) : '–';
        $('best-time').title = bestEntry ? ('Bestzeit ' + languageLabel(language) + ' (' + (PROFILE_LABELS[difficulty] || difficulty) + ') vom ' + bestEntry.date) : 'Noch keine Bestzeit für diese Stufe';
        $('best-score').textContent = stats.bestScore > 0 ? stats.bestScore.toLocaleString('de-DE') : '–';
        $('progress').textContent = (totalCount ? Math.round(filledCount / totalCount * 100) : 0) + ' %';
        $('status').textContent = status === 'playing' ? 'Läuft' : status === 'won' ? 'Gelöst' : '';
        $('hint-btn').disabled = hintsLeft <= 0 || status !== 'playing';
        $('check-btn').disabled = status !== 'playing';

        for (var d of L.PROFILE_NAMES) {
            $('diff-' + d).setAttribute('aria-pressed', String(d === difficulty));
        }
        $('lang-select').value = language;
        var dailyBtn = $('daily-btn');
        if (dailyBtn) {
            var dailyNow = isDailyPuzzle();
            var dailyDone = isTodayDailySolved();
            dailyBtn.setAttribute('aria-pressed', String(dailyNow));
            dailyBtn.classList.toggle('is-done', dailyDone);
            dailyBtn.textContent = dailyDone ? '✓ Tagesrätsel' : '📅 Tagesrätsel';
        }
    }

    // ============================================================
    // VisualViewport: verhindert, dass die Systemtastatur das Gitter verdeckt
    // ============================================================
    function syncVisualViewport() {
        var vv = window.visualViewport;
        if (!vv) return;
        var root = document.documentElement;
        root.style.setProperty('--vv-height', Math.round(vv.height) + 'px');
        var kbOpen = (window.innerHeight - vv.height) > 120 && document.activeElement === wordInput;
        root.classList.toggle('kb-open', kbOpen);
        if (kbOpen && selected && cellMap[selected.r + ',' + selected.c]) {
            cellMap[selected.r + ',' + selected.c].btn.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
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
        $('daily-btn').addEventListener('click', function () { startDaily(); });
        $('cross-switch-btn').addEventListener('click', function () { sfx('tap'); toggleDirection(); });
        $('clear-errors-btn').addEventListener('click', clearErrorsAction);
        $('prev-word-btn').addEventListener('click', function () { sfx('tap'); jumpWord(-1); });
        $('next-word-btn').addEventListener('click', function () { sfx('tap'); jumpWord(1); });
        $('dir-btn').addEventListener('click', function () { sfx('tap'); toggleDirection(); });
        $('hint-btn').addEventListener('click', hintAction);
        $('check-btn').addEventListener('click', checkAction);
        $('restart-btn').addEventListener('click', restart);
        $('new-btn').addEventListener('click', function () { newGame(); });
        $('help-btn').addEventListener('click', function () { $('help').hidden = false; $('help-close').focus(); });
        $('help-close').addEventListener('click', function () { $('help').hidden = true; });
        $('result-new-btn').addEventListener('click', function () { newGame(); });
        $('result-close-btn').addEventListener('click', function () { $('result').hidden = true; });
        kbdToggleBtn.addEventListener('click', function () {
            sfx('tap');
            keyboardPref = !shouldShowOnScreenKeyboard();
            syncKeyboardVisibility();
        });

        wordInput.addEventListener('compositionstart', function () { composingWord = true; });
        wordInput.addEventListener('compositionend', function () {
            composingWord = false;
            onWordInput();
        });
        wordInput.addEventListener('input', onWordInput);
        wordInput.addEventListener('focus', function () {
            syncWordInput(true);
            requestAnimationFrame(syncVisualViewport);
        });
        wordInput.addEventListener('blur', function () {
            document.documentElement.classList.remove('kb-open');
            syncWordInput(true);
        });
        wordInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                jumpWord(1);
                syncWordInput(true);
                wordInput.focus();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                wordInput.blur();
                focusSelected();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
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
            var inGrid = !!(e.target && e.target.closest && e.target.closest('#board'));
            var k = e.key;
            if (k === 'ArrowLeft') { e.preventDefault(); moveBy(0, -1); return; }
            if (k === 'ArrowRight') { e.preventDefault(); moveBy(0, 1); return; }
            if (k === 'ArrowUp') { e.preventDefault(); moveBy(-1, 0); return; }
            if (k === 'ArrowDown') { e.preventDefault(); moveBy(1, 0); return; }
            if (k === 'Tab' && inGrid) { e.preventDefault(); jumpWord(e.shiftKey ? -1 : 1); return; }
            if (k === 'Backspace') { e.preventDefault(); backspace(); return; }
            if (k === 'Delete') { e.preventDefault(); clearCurrentCell(); return; }
            if ((k === 'Enter' || k === ' ') && (inGrid || tag === 'BODY')) { e.preventDefault(); toggleDirection(); return; }
            if (k.length === 1 && /^[a-zA-ZäöüÄÖÜß]$/.test(k)) {
                e.preventDefault();
                typeLetter(k);
            }
        });

        timerId = setInterval(function () { if (status === 'playing') updateTimer(); }, 1000);

        window.addEventListener('pagehide', function () { pauseTimer(); flushSave(); });
        window.addEventListener('pageshow', function () { if (status === 'playing' && runningSince == null) runningSince = Date.now(); });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') { pauseTimer(); flushSave(); }
            else if (status === 'playing' && runningSince == null) runningSince = Date.now();
        });
        window.addEventListener('resize', function () {
            updateScrollHint();
            syncKeyboardVisibility();
            syncVisualViewport();
        });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', syncVisualViewport);
            window.visualViewport.addEventListener('scroll', syncVisualViewport);
        }
        if (window.GameShell) {
            window.GameShell.onInputModeChange(syncKeyboardVisibility);
        }
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
        kbdToggleBtn = $('kbd-toggle-btn');
        buildKeyboard();
        wire();
        if (window.GameScores && stats.wins > 0) {
            window.GameScores.sync('pandakreuzwort', {
                score: stats.bestScore,
                label: 'Bestwert ' + stats.bestScore.toLocaleString('de-DE') + ' · ' + stats.wins + ' gelöst'
            });
        }
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
                $('result-best-score').textContent = stats.bestScore.toLocaleString('de-DE');
                $('result-wins').textContent = String(stats.wins);
                renderResultGlossary();
                $('result').hidden = false;
            }
            announce('Gespeichertes Rätsel fortgesetzt.');
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
        startDaily: startDaily,
        restart: restart,
        hint: hintAction,
        check: checkAction,
        clearErrors: clearErrorsAction,
        setLanguage: setLanguage,
        setDifficulty: setDifficulty,
        toggleDirection: toggleDirection,
        backspace: backspace,
        generatePuzzle: function (opts) {
            var o = Object.assign({}, opts);
            if (!o.solutionWords) o.solutionWords = solutionWordsFor(o.language || 'mix');
            return L.generatePuzzle(o);
        },
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
                isDaily: isDailyPuzzle(),
                selected: selected ? { r: selected.r, c: selected.c } : null,
                direction: direction,
                hintsLeft: hintsLeft,
                hintsUsed: hintsUsed,
                mistakes: mistakes,
                errorCount: Object.keys(errors).length,
                verifiedCount: Object.keys(verified).length,
                wordCount: puzzle ? puzzle.placements.length : 0,
                deCount: puzzle && puzzle.metrics ? puzzle.metrics.deCount : 0,
                barCount: puzzle && puzzle.metrics ? puzzle.metrics.barCount : 0,
                rows: puzzle ? puzzle.rows : 0,
                cols: puzzle ? puzzle.cols : 0,
                metrics: puzzle ? Object.assign({}, puzzle.metrics) : null,
                solutionWord: puzzle && puzzle.solutionWord ? puzzle.solutionWord.display : null,
                solutionWordSolved: isSolutionWordSolved(),
                datasetSize: DATA.entries.length,
                elapsed: getElapsed(),
                stats: Object.assign({}, stats)
            };
        }
    };
})();
