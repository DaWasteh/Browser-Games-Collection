const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const logic = require('./maulkorbraupen-logic.js');

assert.equal(logic.VERSION, 1);
assert.equal(logic.STORAGE_KEY, 'maulkorbraupen-save-v1');
assert.equal(Object.keys(logic.SCENES).length, 10);
assert.equal(logic.CHAPTERS.length, 7);
assert.ok(Object.isFrozen(logic.SCENES));
assert.ok(Object.isFrozen(logic.SCENES.gas.choices));

for (const scene of Object.values(logic.SCENES)) {
  assert.equal(scene.id.length > 0, true, 'scene id');
  assert.equal(scene.narrative.length > 0, true, `${scene.id}: narration`);
  assert.equal(scene.audio.endsWith('.mp3'), true, `${scene.id}: audio`);
  assert.ok(fs.existsSync(path.join(__dirname, scene.image)), `${scene.id}: image exists`);
  assert.ok(fs.existsSync(path.join(__dirname, scene.audio)), `${scene.id}: audio exists`);
  if (scene.next) assert.ok(logic.SCENES[scene.next], `${scene.id}: next scene exists`);
}
assert.ok(fs.existsSync(path.join(__dirname, 'assets', 'werkskarte.webp')), 'map asset exists');

let state = logic.createState();
assert.equal(state.sceneId, 'intro');
assert.equal(logic.progress(state).percent, 0);

state = logic.advance(state);
assert.equal(state.sceneId, 'gas');
let result = logic.submitChoice(state, 'shelf');
assert.equal(result.correct, false);
assert.equal(logic.isSolved(result.state, 'gas'), false);
result = logic.submitChoice(result.state, 'reserve');
assert.equal(result.correct, true);
state = result.state;
assert.equal(state.tokens.gas, '7');
assert.ok(state.inventory.includes('Prüfgasflasche'));

state = logic.advance(state);
assert.equal(state.sceneId, 'valves');
result = logic.submitChoice(state, 'v1');
assert.equal(result.correct, true);
state = logic.advance(result.state);
assert.equal(state.tokens.valves, '2');
assert.equal(state.sceneId, 'meter');

result = logic.submitChoice(state, '147');
assert.equal(result.correct, true);
state = logic.advance(result.state);
assert.equal(state.tokens.pressure, '1');
assert.equal(state.sceneId, 'chaos');
state = logic.advance(state);
assert.equal(state.sceneId, 'lab');

result = logic.submitLab(state, { A: '78,1 %', B: '20,9 %', C: '0,9 %', D: '0,1 %' });
assert.equal(result.correct, true);
state = logic.advance(result.state);
assert.equal(state.tokens.analyses, '9');
assert.equal(state.sceneId, 'gate');
state = logic.advance(state);
assert.equal(state.sceneId, 'code');

result = logic.submitCode(state, '2719');
assert.equal(result.correct, false);
result = logic.submitCode(result.state, '2179');
assert.equal(result.correct, true);
state = logic.advance(result.state);
assert.equal(state.tokens.code, '2179');
assert.equal(state.sceneId, 'finale');
state = logic.advance(state);
assert.equal(state.sceneId, 'epilogue');
assert.equal(logic.progress(state).percent, 100);
assert.equal(logic.advance(state).sceneId, 'epilogue');

const restored = logic.restoreState(JSON.parse(JSON.stringify(state)));
assert.equal(restored.sceneId, 'epilogue');
assert.deepEqual(restored.tokens, state.tokens);
assert.equal(logic.restoreState({ version: 999, sceneId: 'gas' }).sceneId, 'intro');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert.match(html, /lang="de"/);
assert.match(html, /name="viewport"/);
assert.match(html, /aria-label="Zur Spieleauswahl"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /<dialog id="map-dialog"/);
assert.match(html, /\.\.\/index\.html/);
assert.match(html, /<script src="maulkorbraupen-logic\.js"><\/script>/);
assert.match(html, /<script src="game\.js"><\/script>/);
assert.doesNotMatch(html, /onclick=/);

const ui = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
assert.doesNotMatch(ui, /\.innerHTML\s*=/);
assert.match(ui, /localStorage/);
assert.match(ui, /speechSynthesis/);
assert.match(ui, /new Audio\(\)/);

const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /focus-visible/);

const launcher = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.match(launcher, /maulkorbraupen-das-spiel\/index\.html/);
const rootReadme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
assert.match(rootReadme, /Maulkorbraupen – Das Spiel/);

console.log('smoke ok');
