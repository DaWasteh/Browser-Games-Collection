/* Panndike v1.5 – DOM-freie Regel-, Zustands- und Shell-Tests. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const E = require('./engine.js');

for (const file of ['engine.js', 'game.js']) {
  execFileSync(process.execPath, ['--check', path.join(__dirname, file)], { stdio: 'pipe' });
}

// Deterministische, vollständige Deals in beiden festen Ziehmodi.
for (let seed = 0; seed < 1000; seed += 1) {
  for (const drawCount of [1, 3]) {
    const first = E.createState({ seed: `deal-${seed}`, drawCount });
    const second = E.createState({ seed: `deal-${seed}`, drawCount });
    assert.deepEqual(first, second, `Deal ${seed}/${drawCount} ist deterministisch`);
    assert.equal(E.validateState(first), true, `Deal ${seed}/${drawCount} ist gültig`);
    assert.deepEqual(first.tableau.map(column => column.length), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(first.stock.length, 24);
    assert.equal(first.drawCount, drawCount);
    const all = [...first.tableau.flat(), ...first.stock];
    assert.equal(all.length, 52);
    assert.equal(new Set(all.map(card => card.id)).size, 52);
    first.tableau.forEach(column => {
      assert.equal(column.filter(card => card.faceUp).length, 1);
      assert.equal(column.at(-1).faceUp, true);
    });
  }
}
assert.notDeepEqual(E.createState({ seed: 'a' }).tableau, E.createState({ seed: 'b' }).tableau);

function card(id, suit, rank, faceUp = true) { return { id, suit, rank, faceUp }; }
function fixture() {
  return {
    version: 1, seed: 'fixture', dealType: 'random', drawCount: 1,
    tableau: Array.from({ length: 7 }, () => []), stock: [], waste: [],
    foundations: { S: [], H: [], D: [], C: [] }, moves: 0, score: 0,
    passes: 0, status: 'playing'
  };
}

// Tableau-Folgen: absteigend und wechselnde Farbe.
assert.equal(E.isValidSequence([card(1, 'S', 9), card(2, 'H', 8), card(3, 'C', 7)]), true);
assert.equal(E.isValidSequence([card(1, 'S', 9), card(2, 'C', 8)]), false);
assert.equal(E.isValidSequence([card(1, 'S', 9), card(2, 'H', 7)]), false);
assert.equal(E.isValidSequence([card(1, 'S', 9, false)]), false);

{
  const state = fixture();
  state.tableau[0] = [card(1, 'S', 9, false), card(2, 'H', 8)];
  state.tableau[1] = [card(3, 'C', 9)];
  assert.equal(E.canMoveToTableau(state, { zone: 'tableau', col: 0, index: 1 }, 1), true);
  const result = E.move(state, { zone: 'tableau', col: 0, index: 1 }, { zone: 'tableau', col: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.revealed, true);
  assert.equal(state.tableau[0][0].faceUp, true);
  assert.deepEqual(state.tableau[1].map(c => c.rank), [9, 8]);
  assert.equal(state.score, 5, 'Aufdecken gibt Punkte');
}

// Nur Könige dürfen in leere Spalten.
{
  const state = fixture();
  state.tableau[0] = [card(1, 'H', 13)];
  state.tableau[1] = [card(2, 'S', 12)];
  assert.equal(E.canMoveToTableau(state, { zone: 'tableau', col: 0, index: 0 }, 2), true);
  assert.equal(E.canMoveToTableau(state, { zone: 'tableau', col: 1, index: 0 }, 2), false);
}

// Fundamente sind farbgebunden und lückenlos; Rückzug ins Tableau bleibt legal.
{
  const state = fixture();
  state.tableau[0] = [card(1, 'H', 1)];
  assert.equal(E.canMoveToFoundation(state, { zone: 'tableau', col: 0, index: 0 }, 'H'), true);
  assert.equal(E.canMoveToFoundation(state, { zone: 'tableau', col: 0, index: 0 }, 'D'), false);
  assert.equal(E.move(state, { zone: 'tableau', col: 0, index: 0 }, { zone: 'foundation', suit: 'H' }).ok, true);
  assert.equal(state.foundations.H.length, 1);
  state.tableau[1] = [card(2, 'S', 2)];
  assert.equal(E.move(state, { zone: 'foundation', suit: 'H' }, { zone: 'tableau', col: 1 }).ok, true);
  assert.equal(state.foundations.H.length, 0);
}

// Zieh-3-Reihenfolge und Recycling sind stabil, der aktive Ziehmodus liegt im State.
{
  const state = fixture();
  state.drawCount = 3;
  state.stock = [card(1, 'S', 1, false), card(2, 'H', 2, false), card(3, 'D', 3, false), card(4, 'C', 4, false)];
  let result = E.draw(state);
  assert.deepEqual(result, { ok: true, kind: 'draw', count: 3 });
  assert.deepEqual(state.waste.map(c => c.id), [4, 3, 2]);
  assert.deepEqual(state.stock.map(c => c.id), [1]);
  E.draw(state);
  assert.deepEqual(state.waste.map(c => c.id), [4, 3, 2, 1]);
  result = E.draw(state);
  assert.equal(result.kind, 'recycle');
  assert.deepEqual(state.stock.map(c => c.id), [1, 2, 3, 4]);
  assert.equal(state.stock.every(c => !c.faceUp), true);
  E.draw(state);
  assert.deepEqual(state.waste.map(c => c.id), [4, 3, 2]);
}

// Hinweise dürfen ausschließlich legale Aktionen liefern; Zustände bleiben valide.
for (let seed = 0; seed < 250; seed += 1) {
  const state = E.createState({ seed: `hint-${seed}`, drawCount: seed % 2 ? 3 : 1 });
  for (let step = 0; step < 80 && state.status === 'playing'; step += 1) {
    const hint = E.findHint(state);
    if (!hint) break;
    if (hint.kind === 'draw' || hint.kind === 'recycle') {
      assert.equal(E.draw(state).ok, true);
    } else {
      assert.equal(E.move(state, hint.source, hint.destination).ok, true, `legaler Hinweis ${seed}/${step}`);
    }
    assert.equal(E.validateState(state), true, `gültiger Zustand nach Hinweis ${seed}/${step}`);
  }
}

// Defensive Speicherprüfung verwirft Duplikate, falsche Stapel und Regelwerte.
{
  const state = E.createState({ seed: 'sanitize', drawCount: 1 });
  const duplicate = E.clone(state);
  duplicate.stock[0].id = duplicate.stock[1].id;
  assert.equal(E.validateState(duplicate), false);
  const badDraw = E.clone(state); badDraw.drawCount = 2;
  assert.equal(E.validateState(badDraw), false);
  const faceUpStock = E.clone(state); faceUpStock.stock[0].faceUp = true;
  assert.equal(E.validateState(faceUpStock), false);
  const badFoundation = E.clone(state);
  const aceIndex = badFoundation.stock.findIndex(c => c.suit === 'S' && c.rank === 1);
  const [ace] = badFoundation.stock.splice(aceIndex, 1); ace.faceUp = true;
  badFoundation.foundations.S.push(ace);
  assert.equal(E.validateState(badFoundation), true);
  badFoundation.foundations.S[0].rank = 2;
  assert.equal(E.validateState(badFoundation), false);
}

// Tagesdeal und sichtbarer Deal-Code sind reproduzierbar.
assert.equal(E.dailySeed(new Date(2026, 0, 2)), 'daily-2026-01-02');
assert.equal(E.dealCode(E.createState({ seed: 'same' })), E.dealCode(E.createState({ seed: 'same' })));

// Statische Offline-/A11y-/Feature-Verträge.
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
for (const pattern of [
  /lang="de"/, /engine\.js/, /game\.js" defer/, /\.\.\/shared\/game-shell\.js/,
  /role="status"[^>]*aria-live="polite"/, /role="dialog"[^>]*aria-modal="true"/,
  /id="hint"/, /id="daily"/, /id="restart"/, /id="draw-mode"/
]) assert.match(html, pattern);
assert.doesNotMatch(html, /onclick=/);
assert.doesNotMatch(html, /https?:\/\//);
assert.doesNotMatch(js, /\.innerHTML\s*=/);
// Seit v2.0 liegt der Pointer-Drag im gemeinsamen Kartenmodul; das Spiel bindet ihn ein.
const cardDeck = fs.readFileSync(path.join(__dirname, '..', 'shared', 'card-deck.js'), 'utf8');
assert.match(js, /GameCards\.makeDraggable/);
assert.match(js, /GameCards\.flip/);
assert.match(cardDeck, /pointercancel/);
assert.match(cardDeck, /setPointerCapture/);
assert.match(html, /shared\/card-deck\.js/);
assert.match(js, /visibilitychange/);
assert.match(js, /localStorage/);
assert.match(css, /grid-template-columns:\s*repeat\(7/);
assert.match(css, /prefers-reduced-motion/);
for (const file of ['index.html', 'styles.css', 'engine.js', 'game.js', 'README.md']) {
  assert.equal(fs.existsSync(path.join(__dirname, file)), true, `${file} vorhanden`);
}

console.log('smoke ok (1000×2 Deals, Regeln, Ziehen/Recycling, 250 Hinweis-Pfade, Speicher/Shell)');
