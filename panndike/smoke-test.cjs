/* === Panndike — Smoke-Test (Node) ===
   Statische + Logik-Prüfungen für panndike/game.js und index.html.
   (Das Spiel ist ein Browser-IIFE; daher hier statische Konventions- und
   Fix-Prüfungen plus node --check.) Aufruf: node smoke-test.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Syntax intakt
require('node:child_process').execSync('node --check "' + path.join(__dirname, 'game.js') + '"', { stdio: 'pipe' });

const js = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');

// ============================================================
// 1) Undo ist hinter einem gewonnenen Spiel zustandsgeschützt
//    (keine Mutation hinter stalem "Gewonnen!"-Modal).
// ============================================================
assert.ok(/function undo\(\)\{if\(state\.ended\)\{return\}/.test(js), 'undo prüft state.ended zuerst');

// ============================================================
// 2) draw und autoFoundation haben explizite ended-Guards
//    (konsistent mit pandacell).
// ============================================================
assert.ok(/function draw\(\)\{if\(state\.ended\)return;/.test(js), 'draw hat ended-Guard');
assert.ok(/function autoFoundation\(\)\{if\(state\.ended\)return;/.test(js), 'autoFoundation hat ended-Guard');

// ============================================================
// 3) Gleich-Karten-Abwahl geschieht VOR einem Zugversuch
//    (keine irreführende "nicht erlaubt"-Meldung beim Abwählen).
// ============================================================
assert.ok(
    /if\(selected\)\{if\(selected\.zone===zone&&selected\.index===index&&selected\.col===col\)\{selected=null;render\(\);say\('Auswahl aufgehoben\.'\);return;\}/.test(js),
    'choose wählt gleiche Karte direkt ab (vor moveToTableau/moveToFoundation)'
);

// ============================================================
// 4) Test-API exponiert (konsistent mit anderen Spielen)
// ============================================================
assert.match(js, /window\.Panndike=/, 'window.Panndike exponiert');

// ============================================================
// 5) HTML-Konventionen der Collection
// ============================================================
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert.match(html, /lang="de"/, 'lang=de');
assert.match(html, /<script src="game\.js" defer><\/script>/, 'game.js mit defer');
assert.match(html, /href="styles\.css"/, 'CSS referenziert');
assert.match(html, /\.\.\/index\.html/, 'Back-Link zur Collection');
assert.match(html, /href="\.\.\/index\.html"[^>]*>[^<]*Spieleübersicht/, 'Back-Link zur Spieleübersicht');
assert.match(html, /\.\.\/shared\/game-shell\.js/, 'gemeinsame Shell');
assert.match(html, /role="status"[\s\S]*aria-live="polite"/, 'aria-live Status-Region');
assert.match(html, /role="dialog"[\s\S]*aria-modal="true"/, 'Modal role/aria-modal');
assert.doesNotMatch(html, /onclick=/, 'keine Inline-Handler');
assert.doesNotMatch(html, /innerHTML/, 'kein innerHTML');
assert.doesNotMatch(html, /https?:\/\//, 'keine externen URLs');

// UI-Konventionen
assert.doesNotMatch(js, /\.innerHTML\s*=/, 'kein innerHTML im UI-Code');
assert.match(js, /addEventListener\('keydown'/, 'Tastatur angebunden');
assert.match(js, /dataset\.focusKey/, 'Fokus-Erhaltung über Neurendern');

// Datei-Existenz & Back-Link-Ziel
assert.ok(fs.existsSync(path.join(__dirname, 'game.js')), 'game.js');
assert.ok(fs.existsSync(path.join(__dirname, 'index.html')), 'index.html');
assert.ok(fs.existsSync(path.join(__dirname, 'styles.css')), 'styles.css');
assert.ok(fs.existsSync(path.join(__dirname, 'README.md')), 'README');
assert.ok(fs.existsSync(path.join(__dirname, '..', 'index.html')), 'Collection-Index');

console.log('smoke ok');
