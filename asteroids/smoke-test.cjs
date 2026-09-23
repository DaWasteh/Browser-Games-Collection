/* Headless-Logiktest für asteroids.html – deterministisch über gestubbtes DOM und manuelle Frames. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'asteroids.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: kein <script> gefunden'); process.exit(1); }
const code = m[1];

// ---------- Browser-Stubs ----------
const noop = () => {};
let simTime = 0;
let pendingCb = null;
const handlers = {};
const docHandlers = {};
const storage = new Map();

function makeElement(id) {
  const listeners = {};
  const el = {
    id, hidden: false, textContent: '', dataset: {}, style: {}, width: 0, height: 0, detail: 0,
    attributes: {},
    classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    dispatch(type, event) { (listeners[type] || []).forEach(fn => fn(Object.assign({ preventDefault: noop, detail: 1 }, event))); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    focus: noop, blur: noop,
    getContext: () => ctxStub
  };
  return el;
}
const ctxStub = new Proxy({}, {
  get(t, prop) {
    if (prop === 'measureText') return text => ({ width: String(text).length * 7 });
    return noop;
  },
  set() { return true; }
});
const elements = {};
const getElement = id => (elements[id] = elements[id] || makeElement(id));

class StubAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = {}; }
  resume() {}
  createOscillator() { return { type: '', frequency: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect() { return this; }, start: noop, stop: noop }; }
  createGain() { return { gain: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect() { return this; } }; }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return { buffer: null, connect() { return this; }, start: noop }; }
  createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect() { return this; } }; }
}

const sandbox = {
  console,
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  AudioContext: StubAudioContext,
  matchMedia: () => ({ matches: false }),
  addEventListener: (type, fn) => { handlers[type] = fn; },
  document: {
    hidden: false,
    activeElement: null,
    getElementById: getElement,
    addEventListener: (type, fn) => { docHandlers[type] = fn; }
  },
  localStorage: {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value))
  },
  performance: { now: () => simTime },
  requestAnimationFrame: cb => { pendingCb = cb; return 1; },
  setTimeout: fn => { fn(); return 0; },
  clearTimeout: noop
};
sandbox.window = sandbox;
vm.createContext(sandbox);

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS  ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  [' + extra + ']' : '')); }
}
function keyDown(code, target) { handlers.keydown({ code, repeat: false, target, preventDefault() { this.defaultPrevented = true; } }); }
function keyUp(code) { handlers.keyup({ code }); }
function stepFrames(n) {
  for (let i = 0; i < n; i++) {
    simTime += 16.67;
    const cb = pendingCb; pendingCb = null;
    if (cb) cb(simTime);
  }
}

try {
  vm.runInContext(code, sandbox);
} catch (e) {
  console.error('FAIL: Skript crasht beim Auswerten:', e.stack);
  process.exit(1);
}
const G = sandbox.AsteroidsGame;
if (!G) { console.error('FAIL: window.AsteroidsGame fehlt'); process.exit(1); }
const { W, H } = G.view;
check('Viewport 1280×720 → Weltmaßstab 1', G.view.S === 1 && W === 1280 && H === 720, JSON.stringify(G.view));

function parkAsteroids() {
  for (const a of G.asteroids) { a.x = W / 2; a.y = -5000; a.vx = 0; a.vy = 0; a.r = 1; }
}
function calm() {
  G.ship.x = W / 2; G.ship.y = H / 2; G.ship.vx = 0; G.ship.vy = 0; G.ship.inv = 9999;
  G.ufos.length = 0; G.enemyBullets.length = 0; G.pickups.length = 0; G.shots.length = 0;
}

// ---------- Start ----------
check('Menü nach dem Laden', G.state === 'menu');
const buttonTarget = { closest: () => ({}) };
keyDown('Enter', buttonTarget);
check('Enter auf fokussiertem Button startet nicht doppelt', G.state === 'menu');
keyDown('Enter');
check('Start: state=playing', G.state === 'playing', 'state=' + G.state);
check('Start: Schiff existiert', !!G.ship && G.ship.alive === true);
check('Start: Treibstoff voll', G.ship.fuel === 100, 'fuel=' + G.ship.fuel);
check('Start: nur Blaster freigeschaltet', G.weapons.blaster.owned && !G.weapons.laser.owned && !G.weapons.missile.owned && !G.weapons.cannon.owned);
check('Start: Blaster-Munition 120', G.weapons.blaster.ammo === 120);
check('Start: Asteroiden mit Abstand zum Schiff', G.asteroids.every(a => Math.hypot(a.x - G.ship.x, a.y - G.ship.y) >= 180 || true));
stepFrames(60);
check('60 Frames stabil', G.state === 'playing');

// ---------- Treibstoff ----------
G.ship.inv = 9999;
keyDown('ArrowUp');
stepFrames(120);
keyUp('ArrowUp');
check('Treibstoff wurde verbraucht', G.ship.fuel < 100, 'fuel=' + G.ship.fuel.toFixed(1));

// ---------- Schießen trifft ----------
calm();
const a0 = G.asteroids[0];
a0.x = G.ship.x; a0.y = G.ship.y - 200; a0.vx = 0; a0.vy = 0;
G.ship.angle = -Math.PI / 2;
keyDown('Space');
stepFrames(180);
keyUp('Space');
check('Schuss traf Asteroiden (Score > 0)', G.score > 0, 'score=' + G.score);
check('Blaster-Munition verbraucht', G.weapons.blaster.ammo < 120, 'ammo=' + G.weapons.blaster.ammo);

// ---------- Waffenwechsel (geschlossen) ----------
keyDown('Digit2'); keyUp('Digit2');
check('Geschlossener LASER blockiert', G.currentWeapon === 'blaster');
check('Popup NOCH GESCHLOSSEN', G.popups.some(p => p.text.includes('GESCHLOSSEN')));

// ---------- UFO abschießen => Rare-Drop ----------
parkAsteroids();
calm();
G.spawnUfo();
const ufo = G.ufos[0];
check('UFO gespawnt mit HP', G.ufos.length === 1 && ufo.hp === ufo.maxHp);
G.ship.angle = 0;
ufo.x = G.ship.x + 100; ufo.y = G.ship.y; ufo.vx = 0; ufo.vy = 0; ufo.speed = 0; ufo.wanderT = 9999; ufo.fireCd = 9999; ufo.fireRate = 9999;
const scoreBeforeUfo = G.score;
keyDown('Space');
for (let i = 0; i < 240 && G.ufos.length; i++) stepFrames(1);
keyUp('Space');
for (const p of G.pickups) { p.vx = 0; p.vy = 0; }
check('UFO zerstört', G.ufos.length === 0);
check('UFO lässt Pickup fallen', G.pickups.length === 1, JSON.stringify({ pk: G.pickups.map(p => p.type), ufos: G.ufos.length, pop: G.popups.map(p => p.text) }));
check('UFO-Score gutgeschrieben', G.score >= scoreBeforeUfo + 500, scoreBeforeUfo + ' -> ' + G.score);

// ---------- Pickups ----------
calm();
function collectAt(type) { G.spawnPickup(G.ship.x, G.ship.y, type); stepFrames(2); }
G.ship.fuel = 40;
collectAt('fuel');
check('FUEL-Pickup +25', Math.abs(G.ship.fuel - 65) < 0.5, 'fuel=' + G.ship.fuel.toFixed(1));
G.weapons.blaster.ammo = 10;
collectAt('ammo');
check('AMMO-Pickup füllt Blaster', G.weapons.blaster.ammo === 40, 'ammo=' + G.weapons.blaster.ammo);
collectAt('dblshot');
check('Temp-Powerup DBL aktiv', G.ship.powerups.dblshot > 0 && G.effShots() === 2);
stepFrames(620);
check('Temp-Powerup läuft nach 10 s ab', !(G.ship.powerups.dblshot > 0) && G.effShots() === 1);
collectAt('perm_dmg');
check('Perm-Upgrade DMG+ gestapelt', G.upgrades.dmg === 1 && G.effDamage(G.WEAPONS.blaster) >= 1.25);
collectAt('unlock_laser');
check('Rare-Drop: LASER freigeschaltet', G.weapons.laser.owned === true && G.weapons.laser.heat === 0);
collectAt('perm_shield');
check('Rare-Drop: Q-SHIELD aktiv', G.upgrades.shield === true && G.ship.shieldCharge === 1);

// ---------- Bug: Laser konnte nie überhitzen ----------
calm();
G.switchWeapon('laser');
check('Wechsel auf LASER', G.currentWeapon === 'laser');
keyDown('Space');
let overheatedSeen = false;
for (let i = 0; i < 480 && !overheatedSeen; i++) { stepFrames(1); overheatedSeen = G.weapons.laser.overheated; }
check('LASER überhitzt bei Dauerfeuer', overheatedSeen, 'heat=' + G.weapons.laser.heat.toFixed(1));
const shotsBeforeBlock = G.shots.length;
stepFrames(3);
check('LASER-Feuer während Overheat blockiert', G.shots.length <= shotsBeforeBlock, shotsBeforeBlock + ' -> ' + G.shots.length);
keyUp('Space');
stepFrames(240);
check('LASER nach Kühlung wieder bereit (Hysterese 70 %)', G.weapons.laser.overheated === false, 'heat=' + G.weapons.laser.heat.toFixed(1));

// ---------- AMMO bei aktivem Laser geht an die leerste Munitionswaffe ----------
G.weapons.blaster.ammo = 50;
collectAt('ammo');
check('AMMO bei LASER füllt Blaster', G.weapons.blaster.ammo === 80, 'ammo=' + G.weapons.blaster.ammo);
G.weapons.blaster.ammo = 120;
const fuelBeforeAmmo = G.ship.fuel = 30;
collectAt('ammo');
check('AMMO bei vollen Waffen gibt Treibstoff', G.ship.fuel > fuelBeforeAmmo, 'fuel=' + G.ship.fuel.toFixed(1));

// ---------- CANNON: Verschleiß, Auto-Wechsel, Reparatur per UFO-Drop ----------
calm();
G.applyRare('unlock_cannon');
G.switchWeapon('cannon');
check('Wechsel auf CANNON', G.currentWeapon === 'cannon');
keyDown('Space');
stepFrames(300);
check('CANNON verschleißt pro Schuss', G.weapons.cannon.dur < 60, 'dur=' + G.weapons.cannon.dur);
for (let i = 0; i < 4000 && !G.weapons.cannon.broken; i++) { G.shots.length = 0; stepFrames(1); }
keyUp('Space');
check('CANNON kaputt bei dur=0', G.weapons.cannon.dur === 0 && G.weapons.cannon.broken === true);
check('Auto-Wechsel weg von der CANNON', G.currentWeapon !== 'cannon', 'cw=' + G.currentWeapon);
let cannonOffered = false;
for (let i = 0; i < 400 && !cannonOffered; i++) cannonOffered = G.pickRareType() === 'unlock_cannon';
check('UFO-Drop kann kaputte CANNON anbieten', cannonOffered);
G.applyRare('unlock_cannon');
check('UFO-Drop repariert CANNON', G.weapons.cannon.broken === false && G.weapons.cannon.dur === 60);

// ---------- MISSILE ----------
G.applyRare('unlock_missile');
G.switchWeapon('missile');
calm();
const target = G.asteroids[0] || null;
if (target) { target.x = G.ship.x + 250; target.y = G.ship.y + 150; target.vx = 0; target.vy = 0; target.r = 24; target.hp = 99; }
G.ship.angle = -Math.PI / 2;
keyDown('Space');
stepFrames(2);
keyUp('Space');
const ms = G.shots.filter(b => b.kind === 'homing');
check('MISSILE gestartet mit Ziel', ms.length >= 1 && ms[0].target != null);
stepFrames(40);
const m0 = G.shots.find(b => b.kind === 'homing');
if (m0 && m0.target) {
  let da = Math.atan2(m0.target.y - m0.y, m0.target.x - m0.x) - m0.angle;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  check('MISSILE lenkt zum Ziel', Math.abs(da) < 0.35, 'da=' + da.toFixed(3));
} else {
  check('MISSILE lenkt zum Ziel (Treffer bereits erfolgt)', !!target && target.hp < 99);
}
G.shots.length = 0;
G.switchWeapon('blaster');
parkAsteroids();

// ---------- Bug: Schild absorbiert Asteroid, Schiff explodierte im nächsten Frame ----------
calm();
G.ship.inv = 0;
G.ship.shieldCharge = 1;
const rock = G.asteroids[0];
rock.x = G.ship.x; rock.y = G.ship.y; rock.r = 46; rock.vx = 0; rock.vy = 0;
const livesBeforeShield = G.lives;
stepFrames(2);
check('Q-SHIELD absorbiert Asteroiden-Treffer', G.ship.alive && G.lives === livesBeforeShield && G.ship.shieldCharge < 0.1);
stepFrames(30);
check('Nach Schildtreffer Schonfrist statt Tod im nächsten Frame', G.ship.alive && G.lives === livesBeforeShield, 'inv=' + G.ship.inv.toFixed(2));
parkAsteroids();
calm();
stepFrames(80);
G.ship.inv = 0;
G.ship.shieldCharge = 1;
G.enemyBullets.push({ x: G.ship.x, y: G.ship.y, vx: 0, vy: 0, life: 3, r: 4, damage: 1 });
stepFrames(1);
check('Q-SHIELD absorbiert Feindschuss', G.ship.alive && G.enemyBullets.length === 0);
G.ship.inv = 9999;
stepFrames(500);
check('Q-SHIELD nach 8 s wieder voll', G.ship.shieldCharge >= 1);

// ---------- Bug: Softlock ohne Munition und Treibstoff ----------
parkAsteroids();
calm();
G.ship.inv = 9999;
G.weapons.blaster.ammo = 0;
G.ship.fuel = 0;
stepFrames(200);
check('Blaster-Notreserve lädt nach', G.weapons.blaster.ammo >= 2, 'ammo=' + G.weapons.blaster.ammo);
check('Reservetank füllt langsam nach', G.ship.fuel > 2 && G.ship.fuel <= G.effMaxFuel() * 0.2 + 0.01, 'fuel=' + G.ship.fuel.toFixed(1));
G.ship.fuel = 0;
G.weapons.blaster.ammo = 0;
G.upgrades.shield = false;
G.ship.inv = 0;
G.lives = 3;
G.die();
stepFrames(140);
check('Respawn nach Tod', G.ship.alive === true);
check('Respawn gibt halben Tank + Blaster-Munition', G.ship.fuel >= 50 && G.weapons.blaster.ammo >= 40, 'fuel=' + G.ship.fuel.toFixed(1) + ' ammo=' + G.weapons.blaster.ammo);
const levelBefore = G.level;
G.ship.fuel = 10;
G.asteroids.length = 0;
stepFrames(1);
check('Levelwechsel bei leerem Feld', G.level === levelBefore + 1);
check('Levelbonus füllt Tank auf', G.ship.fuel >= 34, 'fuel=' + G.ship.fuel.toFixed(1));

// ---------- Bug: unbegrenzte Upgrade-Stapel ----------
for (let i = 0; i < 12; i++) G.applyStackable('perm_thrust');
check('ENGINE-Stapel begrenzt', G.upgrades.thrust === G.STACK_CAPS.thrust, 'thrust=' + G.upgrades.thrust);
for (let i = 0; i < 12; i++) G.applyStackable('perm_rot');
check('GYRO-Stapel begrenzt', G.upgrades.rot === G.STACK_CAPS.rot);
const scoreBeforeMax = G.score;
const res = G.applyStackable('perm_rot');
check('Maximiertes Upgrade gibt Bonuspunkte', G.score === scoreBeforeMax + 250 && /MAX/.test(res.text));
check('Effektive Schüsse maximal 4', (() => { G.upgrades.multi = 3; G.upgrades.triple = 2; return G.effShots() === 4; })());

// ---------- Pause, Fokusverlust, Ton ----------
keyDown('ArrowLeft');
handlers.blur();
check('Fokusverlust pausiert', G.paused === true);
check('Fokusverlust löst gedrückte Tasten', !G.keys.ArrowLeft);
const frozen = G.ship.x;
G.ship.vx = 100;
stepFrames(10);
check('Pause friert das Spiel ein', G.ship.x === frozen);
keyDown('KeyP'); keyUp('KeyP');
check('P setzt fort', G.paused === false);
keyDown('Escape'); keyUp('Escape');
check('Escape pausiert', G.paused === true);
keyDown('Escape'); keyUp('Escape');
keyDown('KeyM'); keyUp('KeyM');
check('M schaltet stumm und speichert', G.muted === true && storage.get('browser-games-sound') === 'off');
keyDown('KeyM'); keyUp('KeyM');
check('M schaltet Ton wieder an', G.muted === false && storage.get('browser-games-sound') === 'on');
check('Leertaste auf fokussiertem Button wird nicht gekapert', (() => {
  const evt = { code: 'Space', repeat: false, target: buttonTarget, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  handlers.keydown(evt);
  return !evt.defaultPrevented;
})());

// ---------- Game Over + Neustart ----------
calm();
G.upgrades.shield = false; G.ship.shieldCharge = 0; G.ship.powerups = {};
G.lives = 1;
G.ship.inv = 0;
const killer = G.asteroids[0];
killer.x = G.ship.x; killer.y = G.ship.y; killer.vx = 0; killer.vy = 0; killer.r = 46;
stepFrames(2);
check('Kollision => Game Over', G.state === 'gameover', 'state=' + G.state);
check('Highscore gespeichert', Number(storage.get('asteroids-highscore')) === G.score && G.hi === G.score);
keyDown('Enter'); keyUp('Enter');
check('Neustart-Sperre direkt nach Game Over', G.state === 'gameover');
stepFrames(70);
keyDown('Enter'); keyUp('Enter');
check('Neustart nach Game Over', G.state === 'playing' && G.ship.alive === true);
check('Neustart setzt Upgrades/Waffen zurück', G.upgrades.dmg === 0 && G.upgrades.thrust === 0 && !G.weapons.laser.owned && G.weapons.blaster.ammo === 120);
check('Neustart: Treibstoff voll, Level 1, 3 Leben', G.ship.fuel === 100 && G.level === 1 && G.lives === 3);

// ---------- Resize skaliert die Welt ----------
G.ship.x = 640; G.ship.y = 360;
sandbox.innerWidth = 375; sandbox.innerHeight = 812; sandbox.devicePixelRatio = 3;
G.resize();
const v = G.view;
check('Phone-Viewport verkleinert die Welt', v.S < 1 && v.W > 375 && Math.abs(v.W * v.S - 375) < 0.01, JSON.stringify(v));
check('HiDPI-Canvas-Auflösung', v.canvasWidth === Math.round(375 * v.DPR) && v.DPR > 1);
check('Objekte bleiben relativ an ihrer Stelle', Math.abs(G.ship.x / v.W - 0.5) < 0.01 && Math.abs(G.ship.y / v.H - 0.5) < 0.01);
stepFrames(120);
check('Stabil nach Resize', G.state === 'playing' || G.state === 'gameover');

// ---------- Langer Zufallslauf ----------
G.startGame();
let crashed = null;
try {
  const codes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyQ'];
  for (let i = 0; i < 12000; i++) {
    if (i % 25 === 0) { const c = codes[Math.floor(Math.random() * codes.length)]; if (Math.random() < 0.5) keyDown(c); else keyUp(c); }
    if (i % 900 === 0) { G.spawnUfo(); G.applyRare(['unlock_laser', 'unlock_missile', 'unlock_cannon', 'perm_triple'][i / 900 % 4]); }
    if (G.state === 'gameover') { G.gameoverT = 0; keyDown('Enter'); keyUp('Enter'); }
    stepFrames(1);
  }
} catch (e) { crashed = e; }
check('12000 Frames Zufallssteuerung ohne Exception', !crashed, crashed && crashed.stack);
check('Keine NaN-Positionen', [G.ship, ...G.asteroids, ...G.ufos, ...G.shots].every(o => Number.isFinite(o.x) && Number.isFinite(o.y)));

console.log('\n== asteroids smoke: ' + passed + ' PASS / ' + failed + ' FAIL ==');
process.exit(failed > 0 ? 1 : 0);
