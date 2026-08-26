/* Pahjong v1.5 – Turtle-Geometrie, Deals, Paare, Shuffle und Shell. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const E = require('./engine.js');

for (const file of ['engine.js', 'game.js']) execFileSync(process.execPath, ['--check', path.join(__dirname, file)], { stdio: 'pipe' });

assert.equal(E.SLOTS.length, 144);
const layers = E.SLOTS.reduce((counts, slot) => { counts[slot.z] = (counts[slot.z] || 0) + 1; return counts; }, {});
assert.deepEqual(layers, { 0: 87, 1: 36, 2: 16, 3: 4, 4: 1 }, 'klassische 87+36+16+4+1 Turtle-Ebenen');
assert.equal(new Set(E.SLOTS.map(slot => `${slot.x},${slot.y},${slot.z}`)).size, 144, 'eindeutige Plätze');
assert.ok(E.SLOTS.some(slot => slot.x % 2 || slot.y % 2), 'Halbstein-Koordinaten vorhanden');

// Geometrie und Renderfläche verwenden dieselben Rechtecke.
const top = E.SLOTS.find(slot => slot.z === 4);
const directlyCovered = E.SLOTS.filter(slot => slot.z === 3 && E.covers(slot, top));
assert.equal(directlyCovered.length, 4, 'oberster Stein überdeckt vier Halbstein-Flächen');
for (const lower of directlyCovered) assert.equal(E.overlaps(lower.x, top.x) && E.overlaps(lower.y, top.y), true);

const started = performance.now();
for (let seed = 0; seed < 1000; seed += 1) {
  const first = E.createState({ seed: `deal-${seed}` });
  const second = E.createState({ seed: `deal-${seed}` });
  assert.deepEqual(first, second, `Deal ${seed} deterministisch`);
  assert.equal(E.validateState(first), true, `Deal ${seed} gültig`);
  assert.equal(new Set(first.cards.map(card => card.face.uid)).size, 144, '144 physisch eindeutige Steine');
  assert.equal(first.solutionPlan.length, 72);
  assert.equal(E.verifyRemovalPlan(first.cards, first.solutionPlan, new Set(first.cards.map(card => card.id))), true);
  for (const [a, b] of first.solutionPlan) {
    assert.equal(E.isFree(first, a), true, `Planstein ${a} frei`);
    assert.equal(E.isFree(first, b), true, `Planstein ${b} frei`);
    assert.equal(E.isMatch(first.cards[a], first.cards[b]), true, `Planpaar ${a}/${b} passend`);
    assert.equal(E.removePair(first, a, b).ok, true);
  }
  assert.equal(first.status, 'won');
  assert.equal(first.cards.every(card => card.removed), true);
}
assert.ok(performance.now() - started < 15000, '1000 Deals bleiben in einem begrenzten Testbudget');

// Sondergruppen: beliebige Blumen bzw. Jahreszeiten, normale Motive nur identisch.
{
  const state = E.createState({ seed: 'matches' });
  const flowers = state.cards.filter(card => card.face.group === 'flower');
  const seasons = state.cards.filter(card => card.face.group === 'season');
  const normal = state.cards.filter(card => card.face.group === 'normal');
  flowers.forEach(card => { card.removed = false; });
  assert.equal(E.isMatch(flowers[0], flowers[1]), true);
  assert.equal(E.isMatch(seasons[0], seasons[1]), true);
  assert.equal(E.isMatch(flowers[0], seasons[0]), false);
  const same = normal.find(card => card.id !== normal[0].id && card.face.key === normal[0].face.key);
  const different = normal.find(card => card.face.key !== normal[0].face.key);
  assert.equal(E.isMatch(normal[0], same), true);
  assert.equal(E.isMatch(normal[0], different), false);
}

// Nach legalen Teilzügen bewahrt Mischen das Gesichtsmultiset und liefert einen
// vollständig verifizierten Fortsetzungsplan.
for (let seed = 0; seed < 120; seed += 1) {
  const state = E.createState({ seed: `shuffle-${seed}` });
  for (let move = 0; move < 12 && state.status === 'playing'; move += 1) {
    const pairs = E.matchingPairs(state);
    const pair = pairs[(seed + move * 7) % pairs.length];
    assert.ok(pair, `freies Paar ${seed}/${move}`);
    assert.equal(E.removePair(state, pair[0], pair[1]).ok, true);
  }
  const before = state.cards.filter(card => !card.removed).map(card => card.face.uid).sort();
  const result = E.shuffleRemaining(state);
  assert.equal(result.ok, true, `Shuffle ${seed}`);
  const after = state.cards.filter(card => !card.removed).map(card => card.face.uid).sort();
  assert.deepEqual(after, before, 'Shuffle erhält alle Reststeine');
  const ids = new Set(state.cards.filter(card => !card.removed).map(card => card.id));
  assert.equal(E.verifyRemovalPlan(state.cards, result.plan, ids), true, 'Shuffle-Fortsetzung geometrisch gültig');
  for (const [a, b] of result.plan) assert.equal(E.isMatch(state.cards[a], state.cards[b]), true, 'Shuffle-Planpaare passen');
}

// Defensive Zustandsprüfung.
{
  const good = E.createState({ seed: 'validate' });
  const duplicateFace = E.clone(good); duplicateFace.cards[0].face.uid = duplicateFace.cards[1].face.uid;
  assert.equal(E.validateState(duplicateFace), false);
  const badSlot = E.clone(good); badSlot.cards[0].x += 1;
  assert.equal(E.validateState(badSlot), false);
  const odd = E.clone(good); odd.cards[0].removed = true;
  assert.equal(E.validateState(odd), false);
  const falseWin = E.clone(good); falseWin.status = 'won';
  assert.equal(E.validateState(falseWin), false);
}

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
for (const pattern of [
  /lang="de"/, /engine\.js/, /game\.js" defer/, /\.\.\/shared\/game-shell\.js/,
  /role="status"[^>]*aria-live="polite"/, /role="grid"/, /role="dialog"[^>]*aria-modal="true"/,
  /id="quick-guide-title"/, /id="zoom-in"/, /id="tile-legend"/, /id="result-undo"/
]) assert.match(html, pattern);
assert.doesNotMatch(html, /onclick=/);
assert.doesNotMatch(html, /https?:\/\//);
assert.doesNotMatch(js, /\.innerHTML\s*=/);
assert.match(js, /ArrowLeft/);
assert.match(js, /selected = null; \/\/ genau zwei/);
assert.match(js, /localStorage/);
assert.match(js, /visibilitychange/);
assert.match(css, /aspect-ratio:\s*1\.52 \/ 1/);
assert.match(css, /\.tile:not\(\.free\)/);
assert.match(css, /\.tile\.hinted/);
assert.match(css, /prefers-reduced-motion/);

for (const file of ['index.html', 'styles.css', 'engine.js', 'game.js', 'README.md']) assert.ok(fs.existsSync(path.join(__dirname, file)), file);
console.log('smoke ok (1000 Turtle-Deals, 120 Rest-Shuffles, Geometrie, Sonderpaare, Speicher/Shell)');
