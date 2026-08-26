/* Sand Game Pro v2.2 – statische Verträge + reine Diagnosefunktionen. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'sand_game.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 1, 'genau ein Inline-Script');
const source = scripts[0][1];
assert.doesNotThrow(() => new Function(source), 'Inline-JavaScript ist syntaktisch gültig');

// Das Script wird ohne init() in einem minimalen DOM-Kontext geladen. Dadurch
// lassen sich die reinen Budget-/Crop-Funktionen aus der echten Datei prüfen.
const windowStub = {
  addEventListener() {},
  setInterval() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() {},
  localStorage: { getItem() { return null; }, setItem() {} }
};
const documentStub = {
  readyState: 'loading',
  addEventListener() {},
  getElementById() { return null; },
  createElement() { return {}; }
};
const context = vm.createContext({
  window: windowStub, document: documentStub, console,
  Math, Date, Object, Array, Map, Set, WeakMap, JSON,
  Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array,
  Number, String, Boolean, RegExp, parseInt, setTimeout() { return 0; }, clearTimeout() {},
  requestAnimationFrame() {}, performance: { now: () => 0 },
  localStorage: windowStub.localStorage,
  WebGL2RenderingContext: undefined,
  alert() {}
});
vm.runInContext(source, context, { filename: 'sand_game.inline.js' });
const API = windowStub.SandGame;
assert.ok(API, 'window.SandGame Diagnose-API vorhanden');

// Feste Simulationsrate, aber nie mehr als acht Ticks pro Callback.
const sixty = API.computeTickBudget(0, 1000 / 60, 5);
assert.equal(sixty.ticks, 5);
const highA = API.computeTickBudget(0, 1000 / 120, 5);
const highB = API.computeTickBudget(highA.accumulator, 1000 / 120, 5);
assert.equal(highA.ticks + highB.ticks, 5, '120 Hz ergibt dieselbe Tickrate wie 60 Hz');
const stalled = API.computeTickBudget(0, 1000, 8);
assert.equal(stalled.ticks, 8);
assert.ok(stalled.dropped >= 80, 'Stall-Zeit wird verworfen');
assert.ok(stalled.accumulator >= 0 && stalled.accumulator < 1);
assert.equal(API.computeTickBudget(-100, -1, -5).ticks, 0, 'defensive Eingaben');

// Cover-Cropping bleibt innerhalb des Quellbilds – unabhängig vom Seitenverhältnis.
for (const [iw, ih, tw, th] of [[1, 10000, 1080, 720], [10000, 1, 1080, 720], [4000, 3000, 320, 568]]) {
  const crop = API.computeCoverSourceRect(iw, ih, tw, th);
  assert.ok(crop.sx >= 0 && crop.sy >= 0 && crop.sw > 0 && crop.sh > 0);
  assert.ok(crop.sx + crop.sw <= iw + 1e-8 && crop.sy + crop.sh <= ih + 1e-8);
  assert.ok(Math.abs(crop.sw / crop.sh - tw / th) < 1e-8);
}

// Kritische Implementierungsverträge.
assert.match(source, /function resetCellState\(idx\)/);
for (const grid of ['salinityGrid', 'radiationGrid', 'colorSeedGrid', 'plantHealthGrid', 'soilNutrientGrid', 'nitrogenGrid', 'myceliumGrid']) {
  assert.match(source, new RegExp(grid + '\\[idx\\] = 0'), `${grid} wird zurückgesetzt`);
}
assert.match(source, /function switchVisibleCanvasToCPU\(reason\)/);
assert.match(source, /webglcontextlost/);
assert.match(source, /oldCanvas\.replaceWith\(replacement\)/);
assert.match(source, /const MAX_TICKS_PER_FRAME = 8/);
assert.match(source, /if \(simulated \|\| renderDirty\)/, 'dirty-gesteuertes Rendering');
assert.match(source, /windActiveVisits \+= activeCellsCount/);
const windBlock = source.slice(source.indexOf('// === GLOBALE WIND-ADVEKTION'), source.indexOf('// === PASS 1'));
assert.doesNotMatch(windBlock, /for \(let yy = 0; yy < H/, 'Wind darf keinen Vollraster-Scan enthalten');
assert.match(source, /gridControl\.oninput/);
assert.match(source, /setTimeout\(applyGridResize, 180\)/, 'Auflösungsregler entprellt');
assert.match(source, /const yOffset = H - oldH/, 'Resize unten verankert');
assert.match(source, /const xOffset = Math\.floor\(\(W - oldW\) \/ 2\)/, 'Resize horizontal zentriert');
assert.match(source, /pointercancel/);
assert.match(source, /lostpointercapture/);
assert.match(source, /activePointerId/);
assert.match(source, /imgCanvas\.width = W;\s*imgCanvas\.height = H;/, 'Import-Zwischencanvas auf Weltgröße begrenzt');
assert.match(source, /nearestMaterialCache/);
assert.match(source, /new Map\(\)/);

// Markup/Touch-Verträge.
assert.match(html, /<canvas id="c" role="img"/);
assert.match(html, /id="gpuToggle"/);
assert.match(html, /id="gpuStatus"/);
assert.match(html, /@media \(max-width: 720px\)[\s\S]*button \{ min-height: 44px/);
assert.match(html, /prefers-reduced-motion/);
assert.doesNotMatch(html, /<script[^>]+src=/, 'keine externen Scripts');

console.log('smoke ok (Tickbudget, Crop, Zellreset, Wind-Aktivliste, Fallback, Pointer, Resize)');
