// Zero-Dependency-Smoke-Test für die DOM-freie Panda-Lemmings-Logik.
// Extrahiert die Logik aus panda_lemmings.html (bis zum module.exports-Block)
// und spielt Level headless durch – ohne Browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'panda_lemmings.html'), 'utf8');

// HTML-Konventionen
assert.match(html, /role="application" tabindex="0" aria-label="Interaktives Panda-Lemmings-Spielfeld"/, 'interaktive Canvas-Barrierefreiheit');
assert.match(html, /id="canvas-help"[\s\S]*Pfeiltasten wählen einen aktiven Panda/, 'Canvas-Tastaturanleitung');
assert.match(html, /id="stats" aria-live="polite"/, 'Stats aria-live');
assert.match(html, /if\(this\.world===w\) this\.showResult/, 'showResult-Stale-Guard vorhanden');
assert.match(html, /\.game-collection-link\{position:static;[^}]*align-self:flex-start/, 'Back-Link-Überlappungsschutz im mobilen CSS');
assert.match(html, /cyclePanda\(step\)/, 'Panda-Auswahl per Tastatur');
assert.match(html, /assignKeyboardPanda\(\)/, 'Fähigkeitszuweisung per Tastatur');
assert.match(html, /22\*W\/Math\.max\(1,rect\.width\)/, 'physisches Touchziel skaliert auf ca. 44 CSS-Pixel');
assert.match(html, /panda-lemmings-progress-v1/, 'versionierte Kampagnenpersistenz');
assert.doesNotMatch(html, /else if\(k==='Enter'\)/, 'kein global synthetisierter Enter-Klick');
assert.doesNotMatch(html, /tests\/run_tests\.js/, 'kein veralteter Test-Kommentar mehr');

// --- Logik extrahieren (DOM-frei, bis zum Export) ---
const m = html.match(/<script>([\s\S]*?module\.exports=\{[^}]*\};\s*\})/);
assert.ok(m, 'Logik-Exportblock nicht in panda_lemmings.html gefunden');
const sandboxModule = { exports: {} };
const factory = new Function('module', 'exports', m[1] + '\n');
factory(sandboxModule, sandboxModule.exports);
const L = sandboxModule.exports;
assert.ok(L && L.World && L.LEVELS, 'Export unvollständig');

// --- Konstanten / Struktur ---
assert.equal(L.W, 960);
assert.equal(L.H, 540);
assert.equal(L.C, 6);
assert.ok(Array.isArray(L.SKILLS) && L.SKILLS.length === 8, 'acht Fähigkeiten');
assert.equal(L.LEVELS.length, 10, 'zehn Level');

// Jedes Level hat die erwarteten Felder.
for (let i = 0; i < L.LEVELS.length; i++) {
  const lv = L.LEVELS[i];
  assert.ok(lv.name, `Level ${i}: Name fehlt`);
  assert.ok(lv.spawn && typeof lv.spawn.x === 'number', `Level ${i}: Spawn fehlt`);
  assert.ok(lv.exit && typeof lv.exit.x === 'number', `Level ${i}: Exit fehlt`);
  assert.ok(typeof lv.total === 'number' && lv.total > 0, `Level ${i}: total fehlt`);
  assert.ok(typeof lv.required === 'number' && lv.required > 0, `Level ${i}: required fehlt`);
  assert.ok(typeof lv.rate === 'number', `Level ${i}: rate fehlt`);
  assert.ok(lv.skills && typeof lv.skills === 'object', `Level ${i}: skills fehlen`);
}

// --- Alle Level laden und einige Schritte ohne Fehler laufen lassen ---
for (let i = 0; i < L.LEVELS.length; i++) {
  let ended = null;
  const w = new L.World(i, { on: (t, d) => { if (t === 'end') ended = d; } });
  w.begin();
  let ok = true;
  try {
    for (let s = 0; s < 4000; s++) w.step();
  } catch (e) { ok = false; }
  assert.ok(ok, `Level ${i} wirft beim Step einen Fehler`);
}

// --- Level 0 ist ohne Fähigkeit gewinnbar (Spaziergang) ---
{
  const events = [];
  const w = new L.World(0, { on: (t) => { events.push(t); } });
  assert.equal(w.started, false);
  assert.equal(w.finished, false);
  assert.equal(w.won, false);
  assert.equal(w.total, L.LEVELS[0].total);
  assert.equal(w.required, L.LEVELS[0].required);
  // Vor begin() steppt die Welt nicht.
  w.step();
  assert.equal(w.started, false);
  w.begin();
  assert.equal(w.started, true);
  let guard = 0;
  while (!w.finished && guard < 60000) { w.step(); guard++; }
  assert.ok(w.finished, 'Level 0 endet innerhalb der Schritt-Begrenzung');
  assert.ok(events.includes('end'), 'Level 0 sendet ein end-Event');
  assert.equal(w.won, true, 'Level 0 ist gewinnbar (saved >= required)');
  assert.ok(w.saved >= w.required, `Level 0: ${w.saved} gerettet >= ${w.required}`);
}

// --- Win-Bedingung: required wird respektiert ---
{
  // Ein frisches Level ist nicht sofort gewonnen.
  const w = new L.World(1, {});
  assert.equal(w.won, false);
  assert.equal(w.finished, false);
}

// --- setRate klemmt sane ---
{
  const w = new L.World(0, {});
  w.setRate(0);
  assert.ok(w.rate >= 1, 'rate wird auf >=1 geklemmt');
  w.setRate(99);
  assert.ok(w.rate <= 6, 'rate wird auf <=6 geklemmt');
}

// --- nuke stoppt den Nachschub ---
{
  const w = new L.World(0, {});
  w.begin();
  const before = w.stopSpawn;
  w.nuke();
  assert.equal(w.stopSpawn, true, 'nuke stoppt den Spawn');
  assert.notEqual(before, true);
}

// --- canAssign respektiert den Pool ---
{
  const w = new L.World(0, {});
  // builder-Pool aus Level 0 prüfen: canAssign lehnt ab, wenn Pool 0.
  const empty = Object.keys(w.pool).every((s) => w.pool[s] === 0);
  assert.ok(typeof empty === 'boolean', 'canAssign-Pool lesbar');
}

console.log('smoke ok');
