/* === Pandakreuzwort — Smoke-Test (Node) ===
   Prüft die DOM-freie Logik (pandakreuzwort-logic.js), die Wortbank
   (pandakreuzwort-data.js) und statische Konventionen der HTML/CSS/JS.
   Aufruf:  node smoke-test.cjs   (erwartet "smoke ok") */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('./pandakreuzwort-logic.js');
const DATA = require('./pandakreuzwort-data.js');

// ============================================================
// 1) Klassische Kreuzworträtsel-Umschrift
// ============================================================
assert.equal(L.toUpperDe('ß'), 'SS');
assert.equal(L.toUpperDe('ä'), 'AE');
assert.deepEqual(L.graphemes('straße'), ['S', 'T', 'R', 'A', 'S', 'S', 'E']);
assert.equal(L.normalizeGridAnswer('Maß'), 'MASS');
assert.equal(L.normalizeGridAnswer('größer'), 'GROESSER');
assert.equal(L.normalizeGridAnswer('für Öl'), 'FUER OEL');
assert.equal(L.normalizeGridAnswer('Apfel'), 'APFEL');
assert.equal(L.isGridLetter('ß'), false);
assert.equal(L.isGridLetter('Ä'), false);
assert.equal(L.isGridLetter('1'), false);
assert.equal(L.isGridLetter('ab'), false);

// ============================================================
// 2) Datenintegrität
// ============================================================
const dv = L.validateDataset(DATA);
assert.equal(dv.ok, true, 'Dataset gültig: ' + JSON.stringify(dv.errors));
const deEntries = DATA.entries.filter(e => e.language === 'de');
const barEntries = DATA.entries.filter(e => e.language === 'bar');
assert.ok(deEntries.length >= 80, 'mindestens 80 Deutsch-Einträge (' + deEntries.length + ')');
assert.ok(barEntries.length >= 80, 'mindestens 80 Bairisch-Einträge (' + barEntries.length + ')');

// Eindeutige IDs und Antworten, NFC, erlaubte Grapheme, Hinweis vorhanden,
// reviewed, ausschließlich project-editorial; Bairisch mit Region + Standarddeutsch.
const ids = new Set(); const seenAnswer = new Set();
for (const e of DATA.entries) {
    assert.ok(!ids.has(e.id), 'eindeutige id ' + e.id); ids.add(e.id);
    const ga = e.gridAnswer;
    assert.equal(ga, L.normalizeGridAnswer(e.displayAnswer), 'gridAnswer normalisiert ' + e.id);
    const ak = e.language + '|' + ga;
    assert.ok(!seenAnswer.has(ak), 'eindeutige Antwort je Sprache ' + e.id); seenAnswer.add(ak);
    assert.ok(typeof e.clue === 'string' && e.clue.trim(), 'Hinweis vorhanden ' + e.id);
    assert.equal(e.reviewed, true, 'reviewed ' + e.id);
    assert.deepEqual(e.source, { kind: 'project-editorial' }, 'Quelle ' + e.id);
    for (const ch of Array.from(ga)) assert.match(ch, /^[A-Z]$/, 'Zeichen erlaubt ' + ch + ' in ' + e.id);
    if (e.language === 'bar') {
        assert.ok(typeof e.region === 'string' && e.region.trim(), 'Region ' + e.id);
        assert.ok(typeof e.standardGerman === 'string' && e.standardGerman.trim(), 'Standarddeutsch ' + e.id);
    }
}

// ============================================================
// 3) PRNG-Determinismus
// ============================================================
const prngA = L.createPrng('panda-seed-42');
const prngB = L.createPrng('panda-seed-42');
const seqA = [prngA(), prngA(), prngA()];
const seqB = [prngB(), prngB(), prngB()];
assert.deepEqual(seqA, seqB, 'createPrng deterministisch');
for (const v of seqA) assert.ok(v >= 0 && v < 1, 'PRNG in [0,1)');
// Verschiedene Seeds → andere Sequenz
assert.notDeepEqual([L.createPrng('a')(), L.createPrng('a')()], [L.createPrng('a')(), L.createPrng('b')()]);
assert.equal(L.deriveAttemptSeed('x', 0, '1', 1), L.deriveAttemptSeed('x', 0, '1', 1), 'Versuchs-Seed stabil');
assert.notEqual(L.deriveAttemptSeed('x', 0, '1', 1), L.deriveAttemptSeed('x', 1, '1', 1), 'Versuch ändert Seed');

// ============================================================
// 4) Generator-Determinismus + kanonische Serialisierung
// ============================================================
const baseKey = { seed: 'determinismus-test', language: 'de', difficulty: 'mittel', entries: DATA.entries, datasetVersion: DATA.datasetVersion };
const p1 = L.generatePuzzle(baseKey);
const p2 = L.generatePuzzle(baseKey);
assert.equal(L.canonicalizePuzzle(p1), L.canonicalizePuzzle(p2), 'gleicher Schlüssel → gleiches kanonisches Puzzle');
assert.equal(L.GENERATOR_VERSION, 2);

// ============================================================
// 5) Strukturelle Gültigkeit für Seed-Samples je Sprache × Profil
// ============================================================
const SAMPLE_SEEDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
for (const language of ['de', 'bar']) {
    for (const difficulty of L.PROFILE_NAMES) {
        const profile = L.PROFILES[difficulty];
        for (const seed of SAMPLE_SEEDS) {
            const puzzle = L.generatePuzzle({ seed, language, difficulty, entries: DATA.entries, datasetVersion: DATA.datasetVersion });
            const v = L.validatePuzzle(puzzle, DATA.entries);
            assert.ok(v.ok, 'validatePuzzle ' + language + '/' + difficulty + '/' + seed + ': ' + JSON.stringify(v.errors));
            const m = puzzle.metrics;
            assert.ok(m.wordCount >= profile.minWords, language + '/' + difficulty + '/' + seed + ' Wortzahl ' + m.wordCount + ' < ' + profile.minWords);
            assert.ok(m.crossingCells >= 1, language + '/' + difficulty + ' hat Kreuzung');
            assert.ok(m.rows <= 16 && m.cols <= 16, language + '/' + difficulty + ' Bounding-Box ' + m.rows + 'x' + m.cols);
            assert.ok(m.wordCount <= profile.targetWords, 'Wortzahl überschreitet Ziel');
            // keine doppelte entryId
            const used = new Set(puzzle.placements.map(p => p.entryId));
            assert.equal(used.size, puzzle.placements.length, 'keine doppelte entryId ' + language + '/' + difficulty);
        }
    }
}

// ============================================================
// 6) Profilunterschied: schwer hat im Mittel mehr Wörter als leicht
// ============================================================
const PROF_SEEDS = [];
for (let i = 0; i < 12; i++) PROF_SEEDS.push('prof-' + i);
function avgWords(language, difficulty) {
    let sum = 0;
    for (const s of PROF_SEEDS) sum += L.generatePuzzle({ seed: s, language, difficulty, entries: DATA.entries, datasetVersion: DATA.datasetVersion }).metrics.wordCount;
    return sum / PROF_SEEDS.length;
}
const deLeicht = avgWords('de', 'leicht');
const deSchwer = avgWords('de', 'schwer');
const deExperte = avgWords('de', 'experte');
assert.ok(deSchwer > deLeicht, 'schwer (' + deSchwer.toFixed(2) + ') > leicht (' + deLeicht.toFixed(2) + ')');
assert.ok(deExperte > deSchwer, 'experte (' + deExperte.toFixed(2) + ') > schwer (' + deSchwer.toFixed(2) + ')');

// ============================================================
// 7) Sprachtrennung: Deutsch erzeugt nur de-Einträge, Bairisch nur bar
// ============================================================
for (const language of ['de', 'bar']) {
    const p = L.generatePuzzle({ seed: 'lang-sep', language, difficulty: 'mittel', entries: DATA.entries, datasetVersion: DATA.datasetVersion });
    for (const pl of p.placements) {
        const entry = DATA.entries.find(e => e.id === pl.entryId);
        assert.equal(entry.language, language, 'Sprachtrennung ' + pl.entryId);
    }
}

// ============================================================
// 8) Varianz: verschiedene Seeds → verschiedene kanonische Puzzles
// ============================================================
const VAR_SEEDS = [];
for (let i = 0; i < 30; i++) VAR_SEEDS.push('var-' + i);
for (const language of ['de', 'bar']) {
    const sigs = new Set();
    for (const s of VAR_SEEDS) {
        const p = L.generatePuzzle({ seed: s, language, difficulty: 'mittel', entries: DATA.entries, datasetVersion: DATA.datasetVersion });
        sigs.add(L.canonicalizePuzzle(p));
    }
    assert.ok(sigs.size >= 27, language + ' Varianz: ' + sigs.size + '/30 verschiedene Puzzles');
}

// ============================================================
// 9) Negativtests: ungültige Puzzles werden erkannt
// ============================================================
function makeBasePuzzle() {
    return L.generatePuzzle({ seed: 'neg', language: 'de', difficulty: 'mittel', entries: DATA.entries, datasetVersion: DATA.datasetVersion });
}
// 9a Buchstabenkonflikt
{
    const p = makeBasePuzzle();
    const cells = JSON.parse(JSON.stringify(p.cells));
    const first = Object.keys(cells)[0];
    const orig = cells[first].letter;
    cells[first].letter = orig === 'A' ? 'B' : 'A';
    const conflict = { ...p, cells };
    assert.equal(L.validatePuzzle(conflict, DATA.entries).ok, false, 'Konflikt erkannt (über gridAnswer-Rekonstruktion)');
}
// 9b Run-on: verschiebe ein Wort um eine Spalte (gleichgerichtet daneben)
{
    const p = makeBasePuzzle();
    const placements = p.placements.map(pl => ({ ...pl }));
    const across = placements.find(pl => pl.dir === 'across' && pl.length >= 4);
    assert.ok(across, 'Anker gefunden');
    across.col = across.col + 1; // Run-on erzeugen
    assert.equal(L.validatePuzzle({ ...p, placements }, DATA.entries).ok, false, 'Run-on erkannt');
}
// 9c Getrennte Insel: verschiebe ein Wort weit weg
{
    const p = makeBasePuzzle();
    const placements = p.placements.map(pl => ({ ...pl }));
    placements[placements.length - 1].row += 30;
    placements[placements.length - 1].col += 30;
    assert.equal(L.validatePuzzle({ ...p, placements }, DATA.entries).ok, false, 'Getrennte Insel erkannt');
}
// 9d Fehlender Hinweis
{
    const p = makeBasePuzzle();
    const placements = p.placements.map(pl => ({ ...pl }));
    placements[0].clue = '';
    assert.equal(L.validatePuzzle({ ...p, placements }, DATA.entries).ok, false, 'Fehlender Hinweis erkannt');
}
// 9e Doppelte entryId
{
    const p = makeBasePuzzle();
    const placements = p.placements.map(pl => ({ ...pl }));
    if (placements.length >= 2) {
        placements[1].entryId = placements[0].entryId;
        assert.equal(L.validatePuzzle({ ...p, placements }, DATA.entries).ok, false, 'Doppelte entryId erkannt');
    }
}

// ============================================================
// 10) isLegalPlacement / enumerateLegalPlacements direkt
// ============================================================
{
    const st = L.newState();
    const anchor = DATA.entries.find(e => e.id === 'de-sonne');
    L.ensurePrepared(DATA.entries);
    L.applyPlacement(st, { entry: anchor, row: 0, col: 0, dir: 'across' });
    assert.equal(st.cellCount, L.graphemes(anchor.gridAnswer).length, 'Anker platziert');
    // Ein Wort, das 'E' teilt, sollte legale senkrechte Kreuzungen haben
    const cand = DATA.entries.find(e => e.id === 'de-erde');
    const legal = L.enumerateLegalPlacements(st, cand);
    assert.ok(legal.length >= 1, 'mindestens eine legale Kreuzung für ERDE');
    for (const pl of legal) assert.equal(L.isLegalPlacement(st, pl), true, 'aufgeführte Platzierung legal');
}

// ============================================================
// 10b) Winzige Pools (length 0/1/2) dürfen nicht werfen
// ============================================================
function makeTinyEntry(id, answer) {
    return { id: id, language: 'de', displayAnswer: answer, gridAnswer: L.normalizeGridAnswer(answer), clue: 'Test', difficulty: 1, allowedProfiles: ['leicht', 'mittel', 'schwer'], reviewed: true, source: { kind: 'project-editorial' } };
}
for (const n of [0, 1, 2]) {
    const pool = [];
    for (let i = 0; i < n; i++) pool.push(makeTinyEntry('tiny-' + i, ['AUTO', 'HAUS', 'BAUM'][i]));
    let p, threw = false;
    try {
        p = L.generatePuzzle({ seed: 'tiny-pool', language: 'de', difficulty: 'mittel', entries: pool, datasetVersion: DATA.datasetVersion });
    } catch (e) { threw = true; }
    assert.equal(threw, false, 'pool.length=' + n + ' darf nicht werfen');
    // Wohlgeformtes Ergebnis (validierbar). Leerer Pool → ungültig (sicher abgelehnt),
    // 1–2 Wörter → einzelnes gültiges Ankerwort.
    const v = L.validatePuzzle(p, pool);
    if (n === 0) assert.equal(v.ok, false, 'leerer Pool → kein gültiges Puzzle, aber kein Wurf');
    else assert.equal(v.ok, true, 'pool.length=' + n + ' liefert gültiges Ankerwort-Puzzle');
    assert.ok(p.rows >= 1 && p.cols >= 1, 'wohlgeformte Gitterdimensionen');
}

// ============================================================
// 11) sanitizeSavedPuzzle: kaputte Daten werden verworfen
// ============================================================
const good = L.generatePuzzle({ seed: 'save', language: 'de', difficulty: 'mittel', entries: DATA.entries, datasetVersion: DATA.datasetVersion });
assert.ok(L.sanitizeSavedPuzzle(good, DATA.entries), 'gültiges gespeichertes Puzzle akzeptiert');
assert.equal(L.sanitizeSavedPuzzle(null, DATA.entries), null, 'null verworfen');
assert.equal(L.sanitizeSavedPuzzle({}, DATA.entries), null, 'leeres Objekt verworfen');
{
    const broken = JSON.parse(JSON.stringify(good));
    broken.placements[0].clue = '';
    assert.equal(L.sanitizeSavedPuzzle(broken, DATA.entries), null, 'kaputtes Puzzle verworfen');

    const forged = JSON.parse(JSON.stringify(good));
    const used = new Set(forged.placements.map(p => p.entryId));
    const replacement = DATA.entries.find(e => e.language === forged.language && !used.has(e.id));
    assert.ok(replacement, 'unbenutzter Datensatz für Manipulationstest vorhanden');
    forged.placements[0].entryId = replacement.id;
    assert.equal(L.sanitizeSavedPuzzle(forged, DATA.entries), null, 'gefälschte entryId verworfen');

    const forgedClue = JSON.parse(JSON.stringify(good));
    forgedClue.placements[0].clue = 'Gefälschter Hinweis';
    assert.equal(L.sanitizeSavedPuzzle(forgedClue, DATA.entries), null, 'gefälschter Hinweis verworfen');
}

// ============================================================
// 12) Statische Offline-Shell-Prüfung
// ============================================================
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert.match(html, /lang="de"/, 'lang=de');
assert.match(html, /<script src="pandakreuzwort-logic\.js"><\/script>/, 'Logik-Script');
assert.match(html, /<script src="pandakreuzwort-data\.js"><\/script>/, 'Daten-Script');
assert.match(html, /<script src="pandakreuzwort\.js" defer><\/script>/, 'UI-Script mit defer');
assert.match(html, /href="pandakreuzwort\.css"/, 'CSS referenziert');
assert.match(html, /\.\.\/index\.html/, 'Back-Link zur Collection');
assert.match(html, /aria-label="Zur Spieleübersicht"/, 'Back-Link aria-label');
assert.match(html, /\.\.\/shared\/game-shell\.js/, 'gemeinsame Shell');
assert.match(html, /role="status"[\s\S]*aria-live="polite"/, 'aria-live Status-Region');
assert.match(html, /role="grid"/, 'role=grid für Spielfeld');
assert.match(html, /id="diff-experte"/, 'vierter Schwierigkeitsgrad Experte');
assert.match(html, /role="dialog"[\s\S]*aria-modal="true"/, 'Modal role/aria-modal');
assert.doesNotMatch(html, /onclick=/, 'keine Inline-Handler');
assert.doesNotMatch(html, /innerHTML/, 'kein innerHTML');
assert.doesNotMatch(html, /https?:\/\//, 'keine externen URLs (CDN/Fetch)');

const uiJs = fs.readFileSync(path.join(__dirname, 'pandakreuzwort.js'), 'utf8');
assert.doesNotMatch(uiJs, /\.innerHTML\s*=/, 'kein innerHTML im UI-Code');
assert.doesNotMatch(uiJs, /onclick=/, 'keine Inline-Handler im UI-Code');
assert.doesNotMatch(uiJs, /\bfetch\(/, 'kein fetch im UI-Code');
assert.match(uiJs, /Math\.random|crypto\.getRandomValues/, 'Seed-Erzeugung vorhanden');
assert.match(uiJs, /PandakreuzwortLogic/, 'nutzt Logik-Modul');
assert.match(uiJs, /window\.Pandakreuzwort/, 'exponiert window.Pandakreuzwort');
assert.match(uiJs, /genToken/, 'Generation-Token (Race-Schutz)');
assert.match(uiJs, /aria-live|announce/, 'barrierefreie Rückmeldung');
assert.match(uiJs, /scheduleSave/, 'Eingaben werden entprellt persistiert (scheduleSave)');
assert.match(uiJs, /pagehide/, 'pagehide sichert ausstehende Eingaben');
assert.match(uiJs, /flushSave/, 'flushSave leert den Entprell-Timer');
// Won-Status und verstrichene Zeit werden persistiert (status-Feld im Save).
assert.match(uiJs, /status: status/, 'Won-Status wird gespeichert');
assert.match(uiJs, /data\.status === 'won'/, 'Won-Status wird beim Laden wiederhergestellt');
assert.match(uiJs, /data\.status === 'won' && complete/, 'Won-Status erfordert ein vollständig korrektes Board');
// Fallback-Generierung validiert den zweiten Versuch und scheitert sicher.
assert.match(uiJs, /Beide Versuche ungültig/, 'Fallback-Generierung scheitert sicher');

// Datei-Existenz
assert.ok(fs.existsSync(path.join(__dirname, 'pandakreuzwort-logic.js')), 'logic file');
assert.ok(fs.existsSync(path.join(__dirname, 'pandakreuzwort-data.js')), 'data file');
assert.ok(fs.existsSync(path.join(__dirname, 'pandakreuzwort.js')), 'ui file');
assert.ok(fs.existsSync(path.join(__dirname, 'pandakreuzwort.css')), 'css file');
assert.ok(fs.existsSync(path.join(__dirname, 'README.md')), 'README');
assert.ok(fs.existsSync(path.join(__dirname, '..', 'index.html')), 'Collection-Index als Back-Link-Ziel');

console.log('smoke ok');
