/* === Pahjong — Smoke-Test (Node) ===
   Statische + Konventions-Prüfungen für pahjong/game.js und index.html.
   (Das Spiel ist ein Browser-IIFE; daher hier statische Fix-Prüfungen plus
   node --check. Die Paarplan-Logik wird zusätzlich im Browser-Smoke
   (browser-smoke-test.mjs) über Pahjong.testPlan verifiziert.)
   Aufruf: node smoke-test.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Syntax intakt
require('node:child_process').execSync('node --check "' + path.join(__dirname, 'game.js') + '"', { stdio: 'pipe' });

const js = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');

// ============================================================
// 1) Tastaturkurzbefehle (H/M/U/N) wirken auch bei fokussiertem
//    Stein/Steuerbutton; native Space/Enter werden nicht blockiert.
//    Die alte Wächter-Zeile button,a,summary ist entfernt.
// ============================================================
assert.doesNotMatch(js, /\.matches\('button,a,summary'\)/, 'alter Button-Wächter entfernt');
assert.match(js, /tag==='INPUT'\|\|tag==='SELECT'\|\|tag==='TEXTAREA'/, 'Wächter nur noch für Formularfelder');
assert.doesNotMatch(js, /k==='h'\)\{e\.preventDefault\(\);hint\(\);\}if\(k==='m'/, 'Shortcuts else-if verkettet (kein Doppelabfangen)');
assert.match(js, /function hint\(\)\{ if\(status==='won'\)return;/, 'H verändert den gewonnenen Zustand nicht');

// ============================================================
// 2) Echte modale Ergebnis-Steuerung: Hintergrund inert,
//    Tab-Eindämmung, Escape, Fokus.
// ============================================================
assert.match(js, /function openResultDialog\(\)/, 'openResultDialog vorhanden');
assert.match(js, /function teardownResultDialog\(\)/, 'teardownResultDialog vorhanden');
assert.match(js, /function setBackgroundInert\(/, 'Hintergrund-inert vorhanden');
assert.match(js, /function resultFocusables\(\)/, 'Fokus-Erfassung für Ergebnisdialog');
assert.match(js, /el\.inert=inert/, 'inert wird gesetzt');
assert.match(js, /e\.key==='Escape'/, 'Escape-Policy im Ergebnisdialog');
assert.match(js, /e\.key==='Tab'/, 'Tab-Eindämmung im Ergebnisdialog');

// ============================================================
// 3) Zeit friert im blockierten Zustand ein und bleibt auch bei
//    gedrosselten Browser-Timern über Date.now präzise.
// ============================================================
assert.match(js, /elapsed = 0, activeSince = Date\.now\(\)/, 'präzise Zeitbasis vorhanden');
assert.match(js, /function currentElapsed\(\)/, 'aktuelle Laufzeit wird aus Date.now berechnet');
assert.match(js, /function pauseClock\(\)/, 'Uhr lässt sich beim Blockieren einfrieren');
assert.match(js, /function resumeClock\(\)/, 'Uhr lässt sich nach Fortsetzung starten');
assert.match(js, /if\(status==='playing'\)\$\('time'\)\.textContent=format\(currentElapsed\(\)\)/, 'Tick aktualisiert nur beim Spielen');
assert.doesNotMatch(js, /status==='playing'\|\|status==='blocked'\)render/, 'kein Render-Tick mehr im blockierten Zustand');
assert.match(js, /moves=0; status='playing'; elapsed=0; activeSince=Date\.now\(\)/, 'deal setzt präzise Zeitbasis zurück');

// ============================================================
// 4) HTML-Konventionen der Collection
// ============================================================
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert.match(html, /lang="de"/, 'lang=de');
assert.match(html, /<script src="game\.js" defer><\/script>/, 'game.js mit defer');
assert.match(html, /href="styles\.css"/, 'CSS referenziert');
assert.match(html, /\.\.\/index\.html/, 'Back-Link zur Collection');
assert.match(html, /href="\.\.\/index\.html">[^<]*Spieleauswahl/, 'Back-Link zur Spieleauswahl');
assert.match(html, /role="status"[\s\S]*aria-live="polite"/, 'aria-live Status-Region');
assert.match(html, /role="dialog"[\s\S]*aria-modal="true"/, 'Modal role/aria-modal');
assert.match(html, /<kbd>H<\/kbd>.+<kbd>M<\/kbd>.+<kbd>U<\/kbd>.+<kbd>N<\/kbd>/, 'Kurzbefehle H/M/U/N dokumentiert');
assert.doesNotMatch(html, /onclick=/, 'keine Inline-Handler');
assert.doesNotMatch(html, /innerHTML/, 'kein innerHTML');
assert.doesNotMatch(html, /https?:\/\//, 'keine externen URLs');

// UI-Konventionen
assert.doesNotMatch(js, /\.innerHTML\s*=/, 'kein innerHTML im UI-Code');

// Datei-Existenz & Back-Link-Ziel
assert.ok(fs.existsSync(path.join(__dirname, 'game.js')), 'game.js');
assert.ok(fs.existsSync(path.join(__dirname, 'index.html')), 'index.html');
assert.ok(fs.existsSync(path.join(__dirname, 'styles.css')), 'styles.css');
assert.ok(fs.existsSync(path.join(__dirname, 'README.md')), 'README');
assert.ok(fs.existsSync(path.join(__dirname, '..', 'index.html')), 'Collection-Index');

console.log('smoke ok');
