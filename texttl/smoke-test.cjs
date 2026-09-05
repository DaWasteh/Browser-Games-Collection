/* === Texttl — Smoke-Test (Node) ===
   Prüft die DOM-freie Logik (texttl-logic.js) und statische Konventionen
   der HTML/JS/CSS-Dateien. Kein Browser nötig.
   Aufruf:  node smoke-test.cjs   (erwartet Ausgabe "smoke ok") */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const logic = require('./texttl-logic.js');

// ============================================================
// 1) Konstanten
// ============================================================
assert.equal(logic.WORD_LENGTH, 5);
assert.equal(logic.MAX_ATTEMPTS, 6);
assert.ok(Object.isFrozen(logic.VALID_GUESS_WORDS), 'VALID_GUESS_WORDS eingefroren');
assert.ok(Object.isFrozen(logic.KEYBOARD_ROWS), 'KEYBOARD_ROWS eingefroren');
assert.ok(Object.isFrozen(logic.KEYBOARD_ROWS[0]), 'Tastatur-Reihe eingefroren');

// ============================================================
// 2) Wortlisten-Integrität: jedes Wort exakt 5 Grapheme,
//    normalisiert (Großschreibung mit ÷), eindeutig,
//    Lösungen sind Teilmenge der gültigen Ratewörter.
// ============================================================
assert.equal(logic.assertListsSane(), true);
const solSet = new Set(logic.SOLUTION_WORDS);
const valSet = new Set(logic.VALID_GUESS_WORDS);
assert.equal(solSet.size, logic.SOLUTION_WORDS.length, 'Lösungen eindeutig');
assert.ok(logic.SOLUTION_WORDS.length >= 700, 'deutlich erweiterte Lösungsbank (' + logic.SOLUTION_WORDS.length + ')');
assert.equal(logic.DAILY_WORDS_V1.length, 463, 'historischer v1-Tagespool bleibt eingefroren');
assert.equal(
    crypto.createHash('sha256').update(JSON.stringify(logic.DAILY_WORDS_V1)).digest('hex'),
    'fa107a8ec86fa952d9ae4848f1a3be067dec0cc1a4bfc1bb7a394e475f603936',
    'vollständiger v1-Tagespool bleibt in Inhalt und Reihenfolge eingefroren'
);
assert.equal(logic.DAILY_WORDS_V2.length, 739, 'v2-Tagespool bleibt eingefroren');
assert.equal(logic.DAILY_WORDS_V3.length, logic.SOLUTION_WORDS.length, 'v3-Tagespool enthält die v1.9-Erweiterung');
assert.ok(logic.SOLUTION_WORDS.length >= 1000, 'über 1000 Lösungen (' + logic.SOLUTION_WORDS.length + ')');
assert.equal(logic.dailyPool(new Date(Date.UTC(2026, 8, 9))).length, 739, 'v2-Pool bis 09.09.2026');
assert.equal(logic.dailyPool(new Date(Date.UTC(2026, 8, 10))).length, logic.SOLUTION_WORDS.length, 'v3-Pool ab 10.09.2026');
{
    const hint = logic.pickHint(['ABEND'], 'ADLER', () => 0.3);
    assert.ok(hint && hint.letter === Array.from('ADLER')[hint.index], 'Tipp liefert Lösungsbuchstabe');
    assert.notEqual(hint.index, 0, 'Tipp meidet bereits grüne Stellen');
    assert.equal(logic.pickHint(['ADLER'], 'ADLER'), null, 'kein Tipp bei gelöstem Wort');
    assert.ok(logic.msUntilNextDaily(new Date(Date.UTC(2026, 8, 4, 23, 30))) === 30 * 60 * 1000, 'Countdown bis Mitternacht UTC');
    assert.match(logic.buildShareText({ mode: 'daily', puzzleNumber: 1, won: true, attempts: 2, rows: [], hintUsed: true }), /💡/, 'Tipp im Teilen-Text markiert');
}
assert.ok(logic.VALID_GUESS_WORDS.length >= logic.SOLUTION_WORDS.length, 'gültige ≥ Lösungen');

// Jede Lösung muss gültig sein
for (const w of logic.SOLUTION_WORDS) assert.ok(valSet.has(w), 'Lösung in Valid: ' + w);

// Jedes Wort: 5 Grapheme, normalisiert, erlaubte Zeichen
for (const w of logic.VALID_GUESS_WORDS) {
    assert.equal(Array.from(w).length, 5, '5 Grapheme: ' + w);
    assert.equal(logic.normalize(w), w, 'normalisiert: ' + w);
    for (const ch of Array.from(w)) assert.match(ch, /^[A-ZÄÖÜß]$/, 'Zeichen erlaubt: ' + ch + ' in ' + w);
}

// ß-Wörter sind als einzelnes Zeichen enthalten (Feature-Nachweis)
assert.ok(logic.SOLUTION_WORDS.includes('GRÖßE'), 'ß-Lösung GRÖßE');
assert.ok(Array.from('GRÖßE').length === 5, 'GRÖßE = 5 Grapheme');

// ============================================================
// 3) Graphem-Handling: ß bleibt ß (kein 'SS'), ÄÖÜ groß
// ============================================================
assert.equal(logic.toUpperDe('ß'), 'ß');
assert.equal(logic.toUpperDe('ä'), 'Ä');
assert.equal(logic.toUpperDe('a'), 'A');
assert.deepEqual(logic.graphemes('straße'), ['S', 'T', 'R', 'A', 'ß', 'E']);
assert.equal(logic.graphemes('straße').length, 6, 'straße = 6 Grapheme');
assert.equal(logic.normalize('größer'), 'GRÖßER');
assert.equal(logic.isValidLetter('ß'), true);
assert.equal(logic.isValidLetter('Ä'), true);
assert.equal(logic.isValidLetter('z'), true);
assert.equal(logic.isValidLetter('1'), false);
assert.equal(logic.isValidLetter('ab'), false);

// Großes ß (ẞ U+1E9E) wird als einzelnes Graphem akzeptiert und zu ß normalisiert.
assert.equal(logic.toUpperDe('ẞ'), 'ß', 'Groß-ß wird zu ß normalisiert');
assert.equal(logic.isValidLetter('ẞ'), true, 'Groß-ß ist ein gültiger Buchstabe');
assert.deepEqual(logic.graphemes('ẞ'), ['ß'], 'Groß-ß → ein Graphem ß');
assert.equal(logic.normalize('ẞIR'), 'ßIR', 'Wort mit Groß-ß wird normalisiert');

// ============================================================
// 4) Bewertung — Zweifachdurchlauf für Doppelbuchstaben
// ============================================================
function ev(g, s) { return logic.evaluate(g, s).join(','); }

// Alles korrekt
assert.equal(ev('ABEND', 'ABEND'), 'correct,correct,correct,correct,correct');
assert.ok(logic.isWin(logic.evaluate('ABEND', 'ABEND')));

// Knifflig-Modus: grüne Positionen und gelbe Pflichtbuchstaben werden erzwungen.
assert.match(logic.hardModeViolation('BODEN', ['ABEND'], 'ABEND'), /Stelle 1/, 'grüner Buchstabe bleibt stehen');
assert.match(logic.hardModeViolation('AHORN', ['ADLER'], 'ABEND'), /D muss mindestens/, 'gelber Buchstabe bleibt enthalten');
assert.equal(logic.hardModeViolation('ABEND', ['ADLER'], 'ABEND'), '', 'regelkonformes Folgewort akzeptiert');

// Doppelbuchstabe: Lösung hat EIN S, Ratewort zwei → zweites absent
// ESSEN(E,S,S,E,N) vs SAUCE(S,A,U,C,E): nur ein S und ein E in Lösung
assert.equal(ev('ESSEN', 'SAUCE'), 'present,present,absent,absent,absent');

// 'correct' hat Vorrang vor 'present' (klassischer Fall)
// STABE vs MASSE(M,A,S,S,E): E an Pos4 correct; A present; S einmal present, zweites absent
assert.equal(ev('STABE', 'MASSE'), 'present,absent,present,absent,correct');

// Zwei gleiche Buchstaben, beide korrekt
assert.equal(ev('KASSE', 'KASSE').split(',').filter(x => x === 'correct').length, 5);

// ß-Bewertung
assert.equal(ev('GRÖßE', 'GRÖßE'), 'correct,correct,correct,correct,correct');
assert.equal(ev('FLÖßE', 'GRÖßE'), 'absent,absent,correct,correct,correct');

// Doppel-E im Ratewort bei einzelnen E in Lösung + verschobenes I:
// BIEGE(B,I,E,G,E) vs RHEIN(R,H,E,I,N).
// Pass1: Pos2 E==E -> correct (ein E verbraucht). remaining=[R,H,null,I,N].
// Pass2: B absent; I an Pos1 ist present (I steht in Lösung an Pos3);
//        zweites E an Pos4 absent (kein E mehr frei).
assert.equal(ev('BIEGE', 'RHEIN'), 'absent,present,correct,absent,absent');

// ============================================================
// 5) Gültigkeitsprüfung
// ============================================================
assert.equal(logic.isValidGuess('ABEND'), true);
assert.equal(logic.isValidGuess('abend'), true);
assert.equal(logic.isValidGuess('GRÖßE'), true);
assert.equal(logic.isValidGuess('größer'), false); // 6 Grapheme
assert.equal(logic.isValidGuess('XXXXX'), false);  // nicht im Wörterbuch
assert.equal(logic.isValidGuess('HAUS'), false);   // zu kurz
assert.equal(logic.isValidLength('WELT'), false);
assert.equal(logic.isValidLength('WELPE'), true);
assert.deepEqual(logic.sanitizeGuesses(['abend'], 'ABEND'), ['ABEND']);
assert.equal(logic.sanitizeGuesses(['keinwort'], 'ABEND'), null, 'korrupter Versuch wird verworfen');
assert.equal(logic.sanitizeGuesses(['ABEND', 42], 'ABEND'), null, 'nicht-string Versuch wird verworfen');

// ============================================================
// 6) Determinismus: Tageswort stabil & reproduzierbar
// ============================================================
const d = new Date(Date.UTC(2024, 5, 15)); // 2024-06-15
assert.equal(logic.dailyWord(d), logic.dailyWord(d), 'Tageswort stabil');
assert.equal(logic.dailyWord(d), 'WACHE', 'historisches Tageswort bleibt trotz Wortbank-Erweiterung unverändert');
assert.equal(Array.from(logic.dailyWord(d)).length, 5, 'Tageswort 5 Grapheme');
assert.ok(logic.isSolution(logic.dailyWord(d)), 'Tageswort ist Lösung');
assert.equal(logic.dailyWord(new Date('2026-09-03T00:00:00Z')), 'NEIGE', 'letzter v1-Tag bleibt stabil');
assert.equal(logic.dailyWord(new Date('2026-09-04T00:00:00Z')), 'GRÖßE', 'erster v2-Tag ist fest gepinnt');
// Zwei identische Daten → gleicher Index
assert.equal(logic.dailyIndex(d), logic.dailyIndex(d));
// puzzleNumber monoton wachsend über aufeinanderfolgende Tage
const d2 = new Date(Date.UTC(2024, 5, 16));
assert.equal(logic.puzzleNumber(d2), logic.puzzleNumber(d) + 1, 'puzzleNumber +1 pro Tag');
// UTC-Timestamp darf nicht von der lokalen Zeitzone abhängen.
const utcLatePacific = new Date('2024-06-16T01:30:00-07:00'); // 2024-06-16 08:30Z
const utcLateEast = new Date('2024-06-15T23:30:00+14:00');    // 2024-06-15 09:30Z
assert.equal(logic.dateToEpochDays(utcLatePacific), logic.dateToEpochDays(d2), 'UTC-Timestamp nutzt UTC-Tag');
assert.equal(logic.dateToEpochDays(utcLateEast), logic.dateToEpochDays(d), 'UTC-Timestamp bleibt am UTC-Tag');
assert.equal(logic.dailyWord(utcLatePacific), logic.dailyWord(d2), 'Tageswort über Zeitzonen stabil');
assert.equal(logic.dailyWord(utcLateEast), logic.dailyWord(d), 'Tageswort über Zeitzonen stabil');
assert.ok(logic.puzzleNumber(new Date()) >= 1, 'puzzleNumber heute >= 1');

// mulberry32 reproduzierbar
const rngA = logic.mulberry32(12345);
const rngB = logic.mulberry32(12345);
const seqA = [rngA(), rngA(), rngA()];
const seqB = [rngB(), rngB(), rngB()];
assert.deepEqual(seqA, seqB, 'mulberry32 deterministisch');
for (const v of seqA) assert.ok(v >= 0 && v < 1, 'RNG in [0,1)');

// Zufallsmodus: gültiges Lösungswort aus SOLUTION_WORDS
for (let i = 0; i < 50; i++) {
    const w = logic.randomWord(function () { return (i * 0.013) % 1; });
    assert.ok(logic.isSolution(w), 'randomWord ist Lösung: ' + w);
    assert.equal(Array.from(w).length, 5);
}

// ============================================================
// 7) Statistik & Streak (rein, idempotent, defensiv)
// ============================================================
let s = logic.emptyStats();
assert.deepEqual(s.dist, [0, 0, 0, 0, 0, 0]);
assert.equal(s.played, 0);
assert.equal(logic.winRate(s), 0);

const K = 19000, Kp = 19001;
s = logic.recordResult(s, { mode: 'daily', won: true, attempts: 3, dayKey: K });
assert.equal(s.played, 1);
assert.equal(s.won, 1);
assert.equal(s.currentStreak, 1);
assert.equal(s.dist[2], 1);
// Dieselbe Tageswertung nochmal → ignoriert (keine Doppelzählung)
const sDup = logic.recordResult(s, { mode: 'daily', won: true, attempts: 3, dayKey: K });
assert.equal(sDup.played, 1, 'Tagesrätsel nur einmal werten');
assert.equal(sDup.dailySolvedKey, K);
// Aufeinanderfolgender Tag → Streak wächst
const s2 = logic.recordResult(s, { mode: 'daily', won: true, attempts: 1, dayKey: Kp });
assert.equal(s2.currentStreak, 2);
assert.equal(s2.maxStreak, 2);
assert.equal(s2.dist[0], 1);
// Verloren im Tagesmodus → Streak bricht
const sGap = logic.recordResult(s2, { mode: 'daily', won: false, attempts: 6, dayKey: Kp + 5 });
assert.equal(sGap.currentStreak, 0);
// Zufallsmodus beeinflusst Streak nicht, zählt aber in played/won/dist
const sR = logic.recordResult(s, { mode: 'random', won: true, attempts: 4, dayKey: null });
assert.equal(sR.currentStreak, 1, 'Zufall ändert Streak nicht');
assert.equal(sR.played, 2, 'Zufall zählt in played');
assert.equal(sR.dist[3], 1);
// Eingabe bleibt unverändert (Pureness)
const before = JSON.stringify(s);
logic.recordResult(s, { mode: 'random', won: true, attempts: 2, dayKey: null });
assert.equal(JSON.stringify(s), before, 'recordResult mutiert Eingabe nicht');
// cloneStats repariert beschädigte/teilweise Eingaben
const partial = { played: 5, won: 3, dist: [1, 1, 1] }; // fehlt currentStreak etc.
const fixed = logic.cloneStats(partial);
assert.equal(fixed.played, 5);
assert.deepEqual(fixed.dist, [1, 1, 1, 0, 0, 0]);
assert.equal(fixed.currentStreak, 0);
const corruptStats = logic.cloneStats({ played: -7, won: 99, currentStreak: -3, maxStreak: 500, dist: [-1, Infinity] });
assert.equal(corruptStats.played, 0, 'negative Spielzahl wird bereinigt');
assert.equal(corruptStats.won, 0, 'Siege werden auf gespielte Partien begrenzt');
assert.equal(corruptStats.currentStreak, 0, 'negative Serie wird bereinigt');
assert.equal(corruptStats.maxStreak, 0, 'Maximalserie bleibt plausibel');
assert.deepEqual(corruptStats.dist, [0, 0, 0, 0, 0, 0], 'ungültige Verteilung wird bereinigt');

// ============================================================
// 8) Spoilerfreies Teilen (keine Buchstaben)
// ============================================================
const share = logic.buildShareText({
    mode: 'daily', puzzleNumber: 42, won: true, attempts: 3,
    rows: [['correct', 'absent', 'present', 'absent', 'absent'],
           ['correct', 'correct', 'correct', 'correct', 'correct']]
});
assert.match(share, /Texttl #42 3\/6/);
assert.ok(share.includes('🟩') && share.includes('🟨') && share.includes('⬛'));
// Keine Buchstaben im geteilten Text (nur Emojis + Kopf)
assert.doesNotMatch(share.replace(/Texttl|#[0-9]+|\/6|X/g, '').trim(), /[A-ZÄÖÜß]/, 'Teilen enthält keine Buchstaben');
const shareLoss = logic.buildShareText({ mode: 'random', won: false, attempts: 6, rows: [] });
assert.match(shareLoss, /Texttl \(Zufall\) X\/6/);
assert.match(logic.buildShareText({ mode: 'random', won: true, attempts: 2, rows: [], hardMode: true }), /2\/6 ◆/, 'Knifflig-Markierung wird geteilt');
assert.equal(logic.shareLine(['correct', 'present', 'absent']), '🟩🟨⬛');

// ============================================================
// 9) Tastatur-Layout: QWERTZ + Ä Ö Ü ß vorhanden
// ============================================================
const allKeys = logic.KEYBOARD_ROWS.flat();
assert.ok(allKeys.includes('Ä'));
assert.ok(allKeys.includes('Ö'));
assert.ok(allKeys.includes('Ü'));
assert.ok(allKeys.includes('ß'));
assert.ok(allKeys.includes('ENTER'));
assert.ok(allKeys.includes('BACK'));
// mergeKeyState: correct > present > absent
assert.equal(logic.mergeKeyState('absent', 'present'), 'present');
assert.equal(logic.mergeKeyState('present', 'correct'), 'correct');
assert.equal(logic.mergeKeyState('correct', 'absent'), 'correct');
assert.equal(logic.mergeKeyState(null, 'absent'), 'absent');

// ============================================================
// 10) HTML-Pattern-Tests (Konventionen der Collection)
// ============================================================
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert.match(html, /lang="de"/, 'lang=de');
assert.match(html, /<script src="texttl-logic\.js"><\/script>/, 'Logik-Script-Tag');
assert.match(html, /<script src="texttl\.js" defer><\/script>/, 'UI-Script-Tag mit defer');
assert.match(html, /href="texttl\.css"/, 'CSS referenziert');
assert.match(html, /\.\.\/index\.html/, 'Back-Link zur Collection');
assert.match(html, /aria-label="Zur Spieleübersicht"/, 'Back-Link aria-label');
assert.match(html, /\.\.\/shared\/game-shell\.js/, 'gemeinsame Stilsteuerung');
assert.match(html, /role="status"[\s\S]*aria-live="polite"/, 'aria-live Status-Region');
assert.match(html, /role="grid"/, 'role=grid für Spielfeld');
assert.match(html, /role="dialog"[\s\S]*aria-modal="true"/, 'Modal role/aria-modal');
assert.match(html, /Regeln &amp; Steuerung/, 'Regeln vorhanden');
assert.match(html, /Tages.*Zufall|Zufall.*Tages|Tagesrätsel/, 'Tages-/Zufallsmodus erwähnt');
assert.doesNotMatch(html, /onclick=/, 'keine Inline-Handler');
assert.doesNotMatch(html, /innerHTML/, 'kein innerHTML');

// ============================================================
// 10b) CSS: ß darf NICHT über text-transform: uppercase zu SS werden.
// Einzig das HUD-Label (.hud .stat span) darf uppercase bleiben;
// .tile und .key zeigen bereits großgeschriebene Grapheme (ß bleibt ß).
// ============================================================
const css = fs.readFileSync(path.join(__dirname, 'texttl.css'), 'utf8');
const upperCount = (css.match(/text-transform:\s*uppercase/g) || []).length;
assert.equal(upperCount, 1, 'nur das HUD-Label darf text-transform: uppercase haben (ß in Kachel/Taste bleibt ß)');
assert.doesNotMatch(css, /\.tile\s*\{[^}]*text-transform:\s*uppercase/, '.tile ohne uppercase');
assert.doesNotMatch(css, /\.key\s*\{[^}]*text-transform:\s*uppercase/, '.key ohne uppercase');

// ============================================================
// 11) JS-UI-Konventionen (kein innerHTML, defensives localStorage,
//     Tastatur-Listener, Clipboard-Fallback)
// ============================================================
const uiJs = fs.readFileSync(path.join(__dirname, 'texttl.js'), 'utf8');
assert.doesNotMatch(uiJs, /\.innerHTML\s*=/, 'kein innerHTML im UI-Code');
assert.match(uiJs, /gameVersion/, 'ausstehende Animationen werden bei Neustart invalidiert');
assert.match(uiJs, /isResolvingGuess\(\)/, 'Neustart und Moduswechsel sind während der Endauswertung gesperrt');
assert.match(uiJs, /hardModeViolation/, 'Knifflig-Regeln sind in der Eingabe angebunden');
assert.doesNotMatch(uiJs, /onclick=/, 'keine Inline-Handler im UI-Code');
assert.match(uiJs, /addEventListener\('keydown'/, 'physische Tastatur angebunden');
assert.match(uiJs, /addEventListener\('click'/, 'Klick-Handler vorhanden');
assert.match(uiJs, /navigator\.clipboard/, 'Clipboard-API genutzt');
assert.match(uiJs, /execCommand\('copy'\)/, 'Clipboard-Fallback vorhanden');
assert.match(uiJs, /localStorage/, 'localStorage genutzt');
assert.match(uiJs, /try\s*{/, 'defensives try/catch vorhanden');
assert.match(uiJs, /prefers-reduced-motion/, 'reduzierte Bewegung berücksichtigt');
assert.match(uiJs, /aria-live|announce/, 'barrierefreie Rückmeldung');
assert.match(uiJs, /TexttlLogic/, 'nutzt Logik-Modul');
assert.match(uiJs, /isValidLetter|typeLetter/, 'Buchstabeneingabe via Graphem-Prüfung');
assert.match(uiJs, /dailyWord/, 'Tageswort genutzt');
assert.match(uiJs, /randomWord/, 'Zufallswort genutzt');
assert.match(uiJs, /recordResult/, 'Statistik-Auswertung angebunden');
assert.match(uiJs, /dailyEvents\[event\.dayKey\]/, 'Tagesresultate mehrerer Tabs werden pro Tag reduziert');
assert.match(uiJs, /event\.won && !previous\.won/, 'Sieg dominiert konkurrierende Tagesniederlage deterministisch');
assert.match(uiJs, /daily-.*win.*loss/, 'Tagesausgänge erhalten getrennte unveränderliche Event-Keys');
assert.match(uiJs, /existing && existing\.status === 'won'/, 'konkurrierender Tages-Save kann einen Sieg nicht herabstufen');
assert.match(uiJs, /validateDailySave/, 'Tagesfortschritt wird validiert');
assert.match(uiJs, /var solvedAt = guesses\.indexOf\(solution\)/, 'Save-Status wird gegen frühere Lösungen geprüft');
assert.match(uiJs, /shareBtn\.hidden = !\(lastGame && state\.status !== 'playing'\)/, 'wiederhergestellte Ergebnisse bleiben teilbar');
assert.match(uiJs, /sanitizeGuesses/, 'gespeicherte Versuche werden defensiv geprüft');
assert.match(uiJs, /saveDaily\(\{[\s\S]*guesses: \[\],[\s\S]*status: 'playing'/, 'Neustart persistiert frischen Tageszustand');
const submitSource = uiJs.slice(uiJs.indexOf('function submitGuess()'), uiJs.indexOf('function animateRow('));
assert.ok(submitSource.indexOf('state.guesses.push(guess)') < submitSource.indexOf('animateRow('), 'bestätigter Versuch wird vor der Animation committed');
assert.ok(submitSource.indexOf('saveDaily({') < submitSource.indexOf('animateRow('), 'bestätigter Tagesversuch wird vor der Animation gespeichert');
assert.match(submitSource, /committedStatus = L\.isWin\(grades\) \? 'won'/, 'terminaler Commit erhält sofort korrekten Status');
assert.match(uiJs, /Reload während der letzten Flip-Animation/, 'Reload stellt terminale Statistik idempotent wieder her');
assert.doesNotMatch(uiJs, /if \(hardMode\)[\s\S]{0,180}hardModeViolation/, 'spät aktiviertes Knifflig verwirft frühere freie Versuche beim Laden nicht');

// ============================================================
// 12) Datei-Existenz & Back-Link-Ziel
// ============================================================
assert.ok(fs.existsSync(path.join(__dirname, 'texttl-logic.js')), 'logic file');
assert.ok(fs.existsSync(path.join(__dirname, 'texttl.js')), 'ui file');
assert.ok(fs.existsSync(path.join(__dirname, 'texttl.css')), 'css file');
assert.ok(fs.existsSync(path.join(__dirname, 'README.md')), 'README');
assert.ok(fs.existsSync(path.join(__dirname, '..', 'index.html')), 'Collection-Index als Back-Link-Ziel');

console.log('smoke ok');
