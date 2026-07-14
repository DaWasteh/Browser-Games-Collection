/* === Texttl — UI / DOM-Schicht ===
   Nutzt ausschließlich TexttlLogic (globales Modul). Keine Inline-Handler,
   kein innerHTML. Vollständig tastaturbedienbar inkl. Ä Ö Ü ß. */
(function () {
    'use strict';

    var L = window.TexttlLogic;
    if (!L) { return; } // Logik fehlt → still verlassen (defensiv)

    var WORD_LEN = L.WORD_LENGTH;
    var MAX_ROWS = L.MAX_ATTEMPTS;

    // --- DOM-Referenzen ---
    var boardEl = document.getElementById('board');
    var keyboardEl = document.getElementById('keyboard');
    var statusEl = document.getElementById('status');
    var modeLabelEl = document.getElementById('mode-label');
    var modeDailyBtn = document.getElementById('mode-daily');
    var modeRandomBtn = document.getElementById('mode-random');
    var restartBtn = document.getElementById('restart-btn');
    var helpBtn = document.getElementById('help-btn');
    var statsBtn = document.getElementById('stats-btn');
    var rulesEl = document.getElementById('rules');
    var overlayEl = document.getElementById('result-overlay');
    var resultTitleEl = document.getElementById('result-title');
    var resultBodyEl = document.getElementById('result-body');
    var shareBtn = document.getElementById('share-btn');
    var resultNextBtn = document.getElementById('result-next');
    var resultCloseBtn = document.getElementById('result-close');
    var hudStreakEl = document.getElementById('hud-streak');
    var hudWinsEl = document.getElementById('hud-wins');

    // --- localStorage (defensiv, Safari-Privatmodus wirft) ---
    var LS_STATS = 'texttl_stats';
    var LS_DAILY = 'texttl_daily';
    function lsGet(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    function lsSet(key, value) {
        try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
    }
    function lsRemove(key) {
        try { window.localStorage.removeItem(key); } catch (e) { return false; }
    }

    function loadStats() {
        var raw = lsGet(LS_STATS);
        if (!raw) return L.emptyStats();
        try {
            var parsed = JSON.parse(raw);
            return L.cloneStats(parsed); // validiert & ergänzt Felder
        } catch (e) {
            return L.emptyStats();
        }
    }
    function saveStats(stats) {
        return lsSet(LS_STATS, JSON.stringify(stats));
    }

    function loadDaily() {
        var raw = lsGet(LS_DAILY);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function validateDailySave(saved, key, solution) {
        if (!saved || typeof saved !== 'object') return null;
        if (saved.key !== key || saved.solution !== solution) return null;
        if (saved.status !== 'playing' && saved.status !== 'won' && saved.status !== 'lost') return null;
        var guesses = L.sanitizeGuesses(saved.guesses, solution);
        if (!guesses) return null;
        if (saved.status === 'playing' && guesses.length >= MAX_ROWS) return null;
        if (saved.status === 'won') {
            if (guesses.length < 1 || guesses[guesses.length - 1] !== solution) return null;
        }
        if (saved.status === 'lost') {
            if (guesses.length !== MAX_ROWS || L.isWin(L.evaluate(guesses[guesses.length - 1], solution))) return null;
        }
        return { key: key, puzzleNumber: saved.puzzleNumber, solution: solution, guesses: guesses, status: saved.status };
    }
    function saveDaily(state) {
        if (!state) return lsRemove(LS_DAILY);
        return lsSet(LS_DAILY, JSON.stringify(state));
    }

    // --- Spielzustand ---
    var state = {
        mode: 'daily',              // 'daily' | 'random'
        solution: '',               // Lösungswort (kanonisch)
        guesses: [],                // Array von Wort-Strings (committed)
        current: [],                // aktuelle Eingabe (Graphem-Array)
        status: 'playing',          // 'playing' | 'won' | 'lost'
        keyStates: Object.create(null), // Buchstabe -> 'correct'|'present'|'absent'
        dailyKey: null,             // epochDays für Tagesmodus
        puzzleNumber: null,         // kosmetisch
        accepting: true             // Eingaben erlaubt?
    };
    var lastGame = null;            // {mode,puzzleNumber,won,attempts,rows,solution} für Teilen
    var toastTimer = null;

    // --- Bewegungs-Präferenz ---
    var reducedMotion = false;
    function refreshReducedMotion() {
        reducedMotion = !!(window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // ============================================================
    // DOM-Aufbau
    // ============================================================
    function buildBoard() {
        boardEl.textContent = '';
        for (var r = 0; r < MAX_ROWS; r++) {
            var row = document.createElement('div');
            row.className = 'row';
            row.setAttribute('role', 'row');
            row.setAttribute('aria-label', 'Reihe ' + (r + 1));
            for (var c = 0; c < WORD_LEN; c++) {
                var tile = document.createElement('div');
                tile.className = 'tile';
                tile.setAttribute('role', 'gridcell');
                tile.setAttribute('aria-label', 'leer');
                row.appendChild(tile);
            }
            boardEl.appendChild(row);
        }
    }

    function buildKeyboard() {
        keyboardEl.textContent = '';
        var rows = L.KEYBOARD_ROWS;
        for (var r = 0; r < rows.length; r++) {
            var rowEl = document.createElement('div');
            rowEl.className = 'kbd-row';
            for (var c = 0; c < rows[r].length; c++) {
                var key = rows[r][c];
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'key';
                btn.setAttribute('data-key', key);
                if (key === 'ENTER' || key === 'BACK') {
                    btn.classList.add('wide');
                    btn.textContent = (key === 'ENTER') ? 'Enter' : '⌫';
                    btn.setAttribute('aria-label', (key === 'ENTER') ? 'Eingabe bestätigen' : 'Letztes Zeichen löschen');
                } else {
                    btn.textContent = key;
                    btn.setAttribute('aria-label', 'Buchstabe ' + key);
                }
                btn.addEventListener('click', makeKeyHandler(key));
                rowEl.appendChild(btn);
            }
            keyboardEl.appendChild(rowEl);
        }
    }

    function makeKeyHandler(key) {
        return function () {
            if (key === 'ENTER') submitGuess();
            else if (key === 'BACK') backspace();
            else typeLetter(key);
        };
    }

    // ============================================================
    // Rendern
    // ============================================================
    function rowEls() { return boardEl.children; }

    function clearTileClasses(tile) {
        tile.classList.remove('filled', 'correct', 'present', 'absent', 'flip', 'bounce', 'pop');
        tile.style.animationDelay = '';
    }

    function setTile(tile, letter, grade) {
        clearTileClasses(tile);
        if (letter) {
            tile.textContent = letter;
            tile.setAttribute('aria-label', letter);
        } else {
            tile.textContent = '';
            tile.setAttribute('aria-label', 'leer');
        }
        if (grade) {
            tile.classList.add(grade);
        } else if (letter) {
            tile.classList.add('filled');
        }
    }

    function renderAll() {
        var rows = rowEls();
        for (var r = 0; r < MAX_ROWS; r++) {
            var tiles = rows[r].children;
            for (var c = 0; c < WORD_LEN; c++) {
                clearTileClasses(tiles[c]);
                tiles[c].textContent = '';
                tiles[c].setAttribute('aria-label', 'leer');
            }
        }
        // committed guesses (mit Farben)
        for (var g = 0; g < state.guesses.length; g++) {
            var word = L.graphemes(state.guesses[g]);
            var grades = L.evaluate(state.guesses[g], state.solution);
            var row = rows[g];
            for (var cc = 0; cc < WORD_LEN; cc++) {
                setTile(row.children[cc], word[cc], grades[cc]);
            }
        }
        // aktuelle Eingabe
        if (state.status === 'playing') {
            var activeRow = rows[state.guesses.length];
            if (activeRow) {
                for (var i = 0; i < WORD_LEN; i++) {
                    var t = activeRow.children[i];
                    if (state.current[i]) {
                        clearTileClasses(t);
                        t.textContent = state.current[i];
                        t.classList.add('filled');
                        t.setAttribute('aria-label', state.current[i]);
                    } else {
                        clearTileClasses(t);
                        t.textContent = '';
                        t.setAttribute('aria-label', 'leer');
                    }
                }
            }
        }
        renderKeyboardColors();
        renderHud();
    }

    function renderKeyboardColors() {
        var buttons = keyboardEl.querySelectorAll('button[data-key]');
        for (var i = 0; i < buttons.length; i++) {
            var b = buttons[i];
            var key = b.getAttribute('data-key');
            if (key === 'ENTER' || key === 'BACK') continue;
            b.classList.remove('correct', 'present', 'absent');
            var st = state.keyStates[key];
            if (st) b.classList.add(st);
        }
    }

    function renderHud() {
        var stats = loadStats();
        hudStreakEl.textContent = String(stats.currentStreak || 0);
        hudWinsEl.textContent = String(stats.won || 0);
    }

    // ============================================================
    // Eingabe
    // ============================================================
    function typeLetter(ch) {
        if (!state.accepting || state.status !== 'playing') return;
        if (!L.isValidLetter(ch)) return;
        var letter = L.toUpperDe(L.graphemes(ch)[0]);
        if (state.current.length >= WORD_LEN) return;
        state.current.push(letter);
        renderAll();
        // Pop-Animation nur für das gerade getippte Zeichen
        if (!reducedMotion) {
            var row = rowEls()[state.guesses.length];
            if (row) {
                var tile = row.children[state.current.length - 1];
                if (tile) {
                    tile.classList.add('pop');
                    setTimeout(function () { tile.classList.remove('pop'); }, 130);
                }
            }
        }
    }

    function backspace() {
        if (!state.accepting || state.status !== 'playing') return;
        if (state.current.length === 0) return;
        state.current.pop();
        renderAll();
    }

    function submitGuess() {
        if (!state.accepting || state.status !== 'playing') return;
        if (state.current.length !== WORD_LEN) {
            flashError('Zu wenige Buchstaben');
            return;
        }
        var guess = state.current.join('');
        if (!L.isValidGuess(guess)) {
            flashError('Nicht im Wörterbuch');
            return;
        }

        var grades = L.evaluate(guess, state.solution);
        state.accepting = false; // während Animation keine Eingaben
        animateRow(state.guesses.length, grades, state.current.slice(), function () {
            state.guesses.push(guess);
            state.current = [];
            state.accepting = true;

            // Tagesfortschritt laufend sichern (Moduswechsel/Reload-safe)
            if (state.mode === 'daily') {
                saveDaily({
                    key: state.dailyKey,
                    puzzleNumber: state.puzzleNumber,
                    solution: state.solution,
                    guesses: state.guesses.slice(),
                    status: 'playing'
                });
            }

            if (L.isWin(grades)) {
                finishGame(true);
            } else if (state.guesses.length >= MAX_ROWS) {
                finishGame(false);
            } else {
                renderAll();
                announce('Neuer Versuch – Reihe ' + (state.guesses.length + 1) + ' von ' + MAX_ROWS);
            }
        });
    }

    function animateRow(rowIndex, grades, letters, done) {
        var row = rowEls()[rowIndex];
        if (!row) { done(); return; }
        var tiles = row.children;

        if (reducedMotion) {
            for (var i = 0; i < WORD_LEN; i++) {
                setTile(tiles[i], letters[i], grades[i]);
                updateKeyState(letters[i], grades[i]);
            }
            renderKeyboardColors();
            done();
            return;
        }

        var step = 280;        // ms Versatz zwischen Kacheln
        var half = 240;        // ms bis zur Farbmitte (Kachel unsichtbar)
        var last = 0;
        for (var j = 0; j < WORD_LEN; j++) {
            (function (idx) {
                var tile = tiles[idx];
                tile.style.animationDelay = (idx * step) + 'ms';
                tile.classList.add('flip');
                setTimeout(function () {
                    tile.classList.remove('filled');
                    tile.classList.add(grades[idx]);
                    updateKeyState(letters[idx], grades[idx]);
                    renderKeyboardColors();
                }, idx * step + half);
            })(j);
            last = j * step + half;
        }
        setTimeout(done, last + 80);
    }

    function updateKeyState(letter, grade) {
        state.keyStates[letter] = L.mergeKeyState(state.keyStates[letter], grade);
    }

    // ============================================================
    // Spielende
    // ============================================================
    function finishGame(won) {
        state.status = won ? 'won' : 'lost';
        state.accepting = false;
        var attempts = state.guesses.length;

        var stats = loadStats();
        var already = (state.mode === 'daily')
            ? L.dailyAlreadySolved(stats, state.dailyKey)
            : false;

        if (!already) {
            stats = L.recordResult(stats, {
                mode: state.mode,
                won: won,
                attempts: attempts,
                dayKey: (state.mode === 'daily') ? state.dailyKey : null
            });
            saveStats(stats);
        }

        // rows für Teilen (jeweils Bewertung pro Versuch)
        var rows = state.guesses.map(function (g) { return L.evaluate(g, state.solution); });
        lastGame = {
            mode: state.mode,
            puzzleNumber: state.puzzleNumber,
            won: won,
            attempts: attempts,
            rows: rows,
            solution: state.solution
        };

        if (state.mode === 'daily') {
            saveDaily({
                key: state.dailyKey,
                puzzleNumber: state.puzzleNumber,
                solution: state.solution,
                guesses: state.guesses.slice(),
                status: state.status
            });
        }

        renderHud();

        // Sieg-Bounce (nur bei Bewegung)
        if (won && !reducedMotion) {
            var row = rowEls()[state.guesses.length - 1];
            if (row) {
                var tiles = row.children;
                for (var i = 0; i < tiles.length; i++) {
                    (function (t, idx) {
                        setTimeout(function () { t.classList.add('bounce'); }, idx * 90);
                    })(tiles[i], i);
                }
            }
        }

        announce(won ? 'Gewonnen! Das Wort war ' + state.solution + '.'
                     : 'Verloren. Das Wort war ' + state.solution + '.');

        // Modal leicht verzögert anzeigen, damit die Flip-Animation enden kann
        setTimeout(function () { showResultModal(won, stats); }, reducedMotion ? 150 : 500);
    }

    // ============================================================
    // Modal / Statistik
    // ============================================================
    function showResultModal(won, stats) {
        resultTitleEl.textContent = won ? '🎉 Gewonnen!' : '😔 Verloren!';
        resultBodyEl.textContent = '';

        var word = document.createElement('div');
        word.className = 'solution-word';
        word.textContent = 'Lösung: ' + state.solution;
        resultBodyEl.appendChild(word);

        var sub = document.createElement('p');
        if (state.mode === 'daily') {
            sub.textContent = won
                ? ('Tagesrätsel #' + (state.puzzleNumber || '') + ' in ' + state.guesses.length + ' Versuchen gelöst.')
                : ('Tagesrätsel #' + (state.puzzleNumber || '') + ' – schau morgen wieder vorbei.');
        } else {
            sub.textContent = won
                ? ('Zufallswort in ' + state.guesses.length + ' Versuchen gelöst.')
                : 'Beim nächsten Versuch klappt es.';
        }
        resultBodyEl.appendChild(sub);

        resultBodyEl.appendChild(buildStatGrid(stats));
        resultBodyEl.appendChild(buildDistribution(stats, won ? (state.guesses.length - 1) : -1));

        shareBtn.hidden = false;
        resultNextBtn.hidden = false;
        resultNextBtn.textContent = (state.mode === 'daily') ? 'Neues Zufallsspiel' : 'Neues Wort';
        resultCloseBtn.hidden = false;
        resultCloseBtn.textContent = 'Schließen';
        overlayEl.hidden = false;
        // Fokus auf den primären Button legen (Tastatur-Bedienung)
        setTimeout(function () { shareBtn.focus(); }, 0);
    }

    function showStatsOnlyModal() {
        var stats = loadStats();
        resultTitleEl.textContent = '📊 Statistik';
        resultBodyEl.textContent = '';

        var info = document.createElement('p');
        info.textContent = 'Deine gesammelten Texttl-Ergebnisse.';
        resultBodyEl.appendChild(info);

        resultBodyEl.appendChild(buildStatGrid(stats));
        resultBodyEl.appendChild(buildDistribution(stats, -1));

        // Nur „Schließen"; kein Neustart aus der reinen Statistik-Anzeige
        shareBtn.hidden = true;
        resultNextBtn.hidden = true;
        resultCloseBtn.hidden = false;
        resultCloseBtn.textContent = 'Schließen';
        overlayEl.hidden = false;
        setTimeout(function () { resultCloseBtn.focus(); }, 0);
    }

    function buildStatGrid(stats) {
        var wrap = document.createElement('div');
        wrap.className = 'stat-grid';
        var s = stats || L.emptyStats();
        var rate = Math.round(L.winRate(s) * 100);
        var items = [
            { b: s.played, l: 'Gespielt' },
            { b: rate + '%', l: 'Trefferquote' },
            { b: s.currentStreak, l: 'Aktuelle Serie' },
            { b: s.maxStreak, l: 'Längste Serie' }
        ];
        for (var i = 0; i < items.length; i++) {
            var cell = document.createElement('div');
            cell.className = 'cell';
            var b = document.createElement('b');
            b.textContent = String(items[i].b);
            var small = document.createElement('small');
            small.textContent = items[i].l;
            cell.appendChild(b);
            cell.appendChild(small);
            wrap.appendChild(cell);
        }
        return wrap;
    }

    function buildDistribution(stats, highlightIndex) {
        var wrap = document.createElement('div');
        wrap.className = 'dist';
        var s = stats || L.emptyStats();
        var max = 1;
        for (var i = 0; i < s.dist.length; i++) if (s.dist[i] > max) max = s.dist[i];
        var highlight = (typeof highlightIndex === 'number') ? highlightIndex : -1;
        for (var d = 0; d < s.dist.length; d++) {
            var row = document.createElement('div');
            row.className = 'dist-row';
            var lbl = document.createElement('span');
            lbl.textContent = String(d + 1);
            var bar = document.createElement('div');
            bar.className = 'dist-bar' + (d === highlight ? ' highlight' : '');
            bar.style.width = Math.round((s.dist[d] / max) * 100) + '%';
            bar.textContent = String(s.dist[d]);
            row.appendChild(lbl);
            row.appendChild(bar);
            wrap.appendChild(row);
        }
        return wrap;
    }

    function hideOverlay() {
        overlayEl.hidden = true;
    }

    // ============================================================
    // Teilen (spoilerfrei) mit Clipboard-Fallback
    // ============================================================
    function shareResult() {
        if (!lastGame) { hideOverlay(); return; }
        var text = L.buildShareText({
            mode: lastGame.mode,
            puzzleNumber: lastGame.puzzleNumber,
            won: lastGame.won,
            attempts: lastGame.attempts,
            rows: lastGame.rows
        });
        copyToClipboard(text).then(function (ok) {
            announce(ok ? 'In die Zwischenablage kopiert!' : 'Kopieren fehlgeschlagen – Text zum Teilen in der Statusmeldung.');
            if (!ok) {
                // Fallback: Text in der Statuszeile sichtbar machen
                statusEl.classList.add('toast');
                statusEl.textContent = text;
            }
        });
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text)
                .then(function () { return true; })
                .catch(function () { return fallbackCopy(text); });
        }
        return Promise.resolve(fallbackCopy(text));
    }

    function fallbackCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch (e) {
            return false;
        }
    }

    // ============================================================
    // Spielverwaltung: Start / Modus / Neustart
    // ============================================================
    function resetBoardState() {
        state.guesses = [];
        state.current = [];
        state.status = 'playing';
        state.keyStates = Object.create(null);
        state.accepting = true;
    }

    function startDaily() {
        state.mode = 'daily';
        var now = new Date();
        state.dailyKey = L.dayKey(now);
        state.puzzleNumber = L.puzzleNumber(now);
        state.solution = L.dailyWord(now);

        var saved = validateDailySave(loadDaily(), state.dailyKey, state.solution);
        if (saved) {
            // Tagesfortschritt erst nach vollständiger Validierung wiederherstellen.
            state.guesses = saved.guesses.slice();
            state.current = [];
            state.status = saved.status;
            state.accepting = (state.status === 'playing');
            // keyStates aus gespeicherten guesses ableiten
            state.keyStates = Object.create(null);
            for (var i = 0; i < state.guesses.length; i++) {
                var grades = L.evaluate(state.guesses[i], state.solution);
                var word = L.graphemes(state.guesses[i]);
                for (var j = 0; j < word.length; j++) {
                    state.keyStates[word[j]] = L.mergeKeyState(state.keyStates[word[j]], grades[j]);
                }
            }
            renderAll();
            modeLabelEl.textContent = 'Tagesrätsel #' + (state.puzzleNumber || '') + ' · 5 Buchstaben · 6 Versuche';
            setModeButtons('daily');
            if (state.status !== 'playing') {
                // lastGame wiederherstellen, damit Teilen funktioniert
                lastGame = {
                    mode: 'daily',
                    puzzleNumber: state.puzzleNumber,
                    won: state.status === 'won',
                    attempts: state.guesses.length,
                    rows: state.guesses.map(function (g) { return L.evaluate(g, state.solution); }),
                    solution: state.solution
                };
                announce(state.status === 'won'
                    ? 'Tagesrätsel bereits gelöst. Morgen gibt es ein neues Wort.'
                    : 'Tagesrätsel heute nicht gelöst. Morgen geht es weiter.');
            }
        } else {
            // Veraltete oder korrupte Daten nicht erneut laden; der frische
            // Zustand wird sofort persistiert und bleibt reload-konsistent.
            lsRemove(LS_DAILY);
            resetBoardState();
            saveDaily({
                key: state.dailyKey,
                puzzleNumber: state.puzzleNumber,
                solution: state.solution,
                guesses: [],
                status: 'playing'
            });
            renderAll();
            modeLabelEl.textContent = 'Tagesrätsel #' + (state.puzzleNumber || '') + ' · 5 Buchstaben · 6 Versuche';
            setModeButtons('daily');
            announce('Tagesrätsel geladen. Rate das ' + WORD_LEN + '-Buchstaben-Wort.');
        }
    }

    function startRandom() {
        state.mode = 'random';
        state.solution = L.randomWord();
        state.dailyKey = null;
        state.puzzleNumber = null;
        resetBoardState();
        renderAll();
        modeLabelEl.textContent = 'Zufallsmodus · 5 Buchstaben · 6 Versuche';
        setModeButtons('random');
        announce('Neues Zufallswort gezogen. Viel Erfolg!');
    }

    function restartCurrent() {
        // Gleiche Lösung noch einmal üben (keine Statistikänderung beim bloßen Reset).
        if (!state.solution) return;
        resetBoardState();
        if (state.mode === 'daily') {
            // Auch nach Reload bleibt der Neustart frisch; die Statistik wird
            // ausschließlich in finishGame/recordResult verändert.
            saveDaily({
                key: state.dailyKey,
                puzzleNumber: state.puzzleNumber,
                solution: state.solution,
                guesses: [],
                status: 'playing'
            });
        }
        lastGame = null;
        hideOverlay();
        renderAll();
        announce('Neustart – dasselbe Wort, frische Versuche.');
    }

    function setModeButtons(mode) {
        var daily = (mode === 'daily');
        modeDailyBtn.classList.toggle('active', daily);
        modeRandomBtn.classList.toggle('active', !daily);
        modeDailyBtn.setAttribute('aria-pressed', daily ? 'true' : 'false');
        modeRandomBtn.setAttribute('aria-pressed', daily ? 'false' : 'true');
    }

    // ============================================================
    // Statusmeldungen
    // ============================================================
    function announce(msg) {
        statusEl.classList.remove('toast');
        statusEl.textContent = msg;
    }

    function flashError(msg) {
        announce(msg);
        statusEl.classList.add('error');
        var row = rowEls()[state.guesses.length];
        if (row && !reducedMotion) {
            row.classList.add('shake');
            setTimeout(function () { row.classList.remove('shake'); }, 420);
        }
        setTimeout(function () { statusEl.classList.remove('error'); }, 1500);
    }

    // ============================================================
    // Physische Tastatur
    // ============================================================
    function onKeydown(e) {
        // Modifikatoren durchreichen
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // Wenn ein Button fokussiert ist, Enter/Space dem Button überlassen
        var ae = document.activeElement;
        var tag = ae && ae.tagName;
        if (tag === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;

        if (e.key === 'Enter') {
            if (!overlayEl.hidden) { return; } // Modal offen → nicht raten
            submitGuess();
            e.preventDefault();
            return;
        }
        if (e.key === 'Backspace') {
            if (!overlayEl.hidden) return;
            backspace();
            e.preventDefault();
            return;
        }
        if (e.key === 'Escape') {
            if (!overlayEl.hidden) hideOverlay();
            return;
        }
        if (!overlayEl.hidden) return; // bei offenem Modal keine Buchstaben

        if (e.key && e.key.length === 1 && L.isValidLetter(e.key)) {
            typeLetter(e.key);
        }
    }

    // ============================================================
    // Event-Wiring
    // ============================================================
    function wire() {
        modeDailyBtn.addEventListener('click', function () {
            if (state.mode === 'daily') return;
            startDaily();
        });
        modeRandomBtn.addEventListener('click', function () {
            if (state.mode === 'random') return;
            startRandom();
        });
        restartBtn.addEventListener('click', restartCurrent);

        helpBtn.addEventListener('click', function () {
            var open = !rulesEl.open;
            rulesEl.open = open;
            helpBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        statsBtn.addEventListener('click', showStatsOnlyModal);

        shareBtn.addEventListener('click', shareResult);
        resultNextBtn.addEventListener('click', function () {
            hideOverlay();
            startRandom();
        });
        resultCloseBtn.addEventListener('click', hideOverlay);

        // Overlay durch Klick auf den Hintergrund schließen
        overlayEl.addEventListener('click', function (e) {
            if (e.target === overlayEl) hideOverlay();
        });

        document.addEventListener('keydown', onKeydown);

        if (window.matchMedia) {
            var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
            var onChange = function () { refreshReducedMotion(); };
            if (mq.addEventListener) mq.addEventListener('change', onChange);
            else if (mq.addListener) mq.addListener(onChange);
        }
    }

    // ============================================================
    // Start
    // ============================================================
    function init() {
        refreshReducedMotion();
        buildBoard();
        buildKeyboard();
        wire();
        renderHud();
        startDaily();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
