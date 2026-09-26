// Entry point: sizes the 16:9 stage with integer pixel scaling, wires modules together and runs
// the requestAnimationFrame loop with delta time.

import { VIEW_TARGET_H } from './config.js';
import { Input } from './core/input.js';
import { AudioSystem } from './core/audio.js';
import { SaveStore } from './systems/save.js';
import { Renderer } from './render/renderer.js';
import { Game } from './game.js';
import { UI } from './ui/ui.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('view');

function safeStorage() {
  try {
    const s = window.localStorage;
    const k = '__gloam_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

const input = new Input(stage);
const audio = new AudioSystem();
const store = new SaveStore(safeStorage());
const renderer = new Renderer(canvas);
const game = new Game({ renderer, input, audio, store });
const ui = new UI(game, stage);
game.ui = ui;

let canvasRect = canvas.getBoundingClientRect();

/**
 * Fit the largest 16:9 stage into the window. The world is rendered into a low-resolution
 * buffer whose height stays close to VIEW_TARGET_H world pixels and is upscaled by an integer
 * factor with nearest-neighbour filtering (crisp pixels at 1280x720, 1920x1080, ...).
 */
function resize() {
  const ww = window.innerWidth, wh = window.innerHeight;
  let sw = ww, sh = Math.round(ww * 9 / 16);
  if (sh > wh) { sh = wh; sw = Math.round(wh * 16 / 9); }
  stage.style.width = `${sw}px`;
  stage.style.height = `${sh}px`;
  const scale = Math.max(1, Math.round(sh / VIEW_TARGET_H));
  const vw = Math.ceil(sw / scale), vh = Math.ceil(sh / scale);
  renderer.resize(vw, vh);
  canvas.style.width = `${vw * scale}px`;
  canvas.style.height = `${vh * scale}px`;
  stage.style.fontSize = `${Math.max(11, Math.min(22, sh / 54)).toFixed(2)}px`;
  canvasRect = canvas.getBoundingClientRect();
  if (game.state !== 'title' && game.area && game.player) game.snapCamera();
}
window.addEventListener('resize', resize);
resize();

// audio needs a user gesture
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

stage.addEventListener('mousemove', (e) => {
  game.pointerOverUi = !!e.target.closest('.ui-hit, #hud-buttons, .panel, #title-screen, #death-screen');
});
stage.addEventListener('mouseleave', () => { game.mouseInside = false; });

// save when the tab is hidden or closed
document.addEventListener('visibilitychange', () => { if (document.hidden && game.profile && game.state !== 'title') game.save(); });
window.addEventListener('beforeunload', () => { if (game.profile && game.state !== 'title') game.save(); });

game.showTitle();

let last = performance.now();
let errorShown = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, (now - last) / 1000);
  last = now;
  try {
    game.update(dt, canvasRect);
    ui.update(Math.min(dt, 0.1));
    game.render();
  } catch (err) {
    // never let one bad frame kill the loop; report once
    console.error(err);
    if (!errorShown) { errorShown = true; ui.toast(`Unexpected error: ${err.message}`, 'warn'); }
  }
}
requestAnimationFrame(frame);

// Debug / automation hook (used by tests/smoke.mjs). Harmless for players.
window.__gloam = { game, ui, renderer, input, audio, store };
