// Comprehensive headless CDP smoke path for the classic/canvas games.
// Checks boot, zero runtime/console errors, 320/375/414 portrait + landscape
// resize/orientation, no body overflow, keyboard controls not hijacking form
// fields, and key fixed regressions. Zero dependencies (Node 22+ + Chrome CDP).
//
// Scope: game-of-life, sandgame, pong, asteroids, snake-ultimate, tetris,
//        minenraeumkommando-foxtrott, panda-lemmings und Maulkorbraupen.
// (Card/word games and PandaTaire are intentionally excluded.)
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22 || typeof fetch !== 'function' || typeof WebSocket !== 'function') {
  throw new Error('classic-games-smoke.mjs requires Node.js 22+ (global fetch and WebSocket).');
}

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.cjs', 'text/javascript; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.mp3', 'audio/mpeg']
]);

function findBrowser() {
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(
      resolve(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
      resolve(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
      resolve(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
      resolve(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft/Edge/Application/msedge.exe')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    const pathEntries = (process.env.PATH || '').split(delimiter).filter(Boolean);
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      pathEntries.forEach(entry => candidates.push(resolve(entry, name)));
    }
  }
  return candidates.find(candidate => candidate && existsSync(candidate));
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function getAvailablePort() {
  const probe = createServer();
  await new Promise((res, rej) => { probe.once('error', rej); probe.listen(0, '127.0.0.1', res); });
  const port = probe.address().port;
  await new Promise(r => probe.close(r));
  return port;
}

function createCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    events.push(message);
  });
  function ready() {
    return new Promise((res, rej) => {
      socket.addEventListener('open', res, { once: true });
      socket.addEventListener('error', () => rej(new Error('CDP WebSocket failed')), { once: true });
    });
  }
  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((res, rej) => {
      pending.set(id, { resolve: res, reject: rej });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  return { socket, events, ready, send };
}

const browserPath = findBrowser();
if (!browserPath) throw new Error('Chrome, Edge or Chromium was not found.');

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
  const relative = pathname.replace(/^\/+/, '') || 'index.html';
  const file = resolve(repoRoot, relative);
  if (file !== repoRoot && !file.startsWith(repoRoot + sep)) { response.writeHead(403).end(); return; }
  try {
    const content = readFileSync(file);
    response.writeHead(200, { 'Content-Type': mime.get(extname(file)) || 'application/octet-stream' });
    response.end(content);
  } catch (_error) {
    response.writeHead(404).end('Not found');
  }
});
await new Promise(res => server.listen(0, '127.0.0.1', res));
const httpPort = server.address().port;
const debugPort = await getAvailablePort();
const profile = resolve(tmpdir(), `classic-games-smoke-${process.pid}-${Date.now()}`);
const browser = spawn(browserPath, [
  '--headless=new',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--no-first-run',
  '--enable-webgl',
  '--use-gl=angle',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore' });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let cdp;
try {
  let targets;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const found = await response.json();
        if (found.some(t => t.type === 'page')) { targets = found; break; }
      }
    } catch (_error) { /* browser starting */ }
    await delay(100);
  }
  const page = targets?.find(t => t.type === 'page');
  if (!page) throw new Error('Chrome DevTools page target did not start.');
  cdp = createCdp(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  async function evaluate(expression) {
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
    return result.result.value;
  }

  async function navigate(pathname) {
    const loaded = cdp.waitEvent ? cdp.waitEvent('Page.loadEventFired') : null;
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/${pathname}` });
    // Fallback: poll for readyState if waitEvent is unavailable.
    if (loaded) {
      try { await loaded; } catch (_e) { /* timeout */ }
    }
    for (let i = 0; i < 60; i++) {
      const ready = await evaluate('document.readyState');
      if (ready === 'complete') break;
      await delay(50);
    }
    await delay(350); // allow game boot / RAF startup
  }

  async function setViewport(width, height, orientation, mobile = true, deviceScaleFactor = 1) {
    const params = { width, height, deviceScaleFactor, mobile };
    if (orientation) params.screenOrientation = { type: orientation, angle: orientation === 'landscapePrimary' ? 90 : 0 };
    await cdp.send('Emulation.setDeviceMetricsOverride', params);
    await delay(260); // debounce windows in the games are 150–200ms
  }

  function collectErrors(fromIndex) {
    return cdp.events.slice(fromIndex).filter(ev =>
      ev.method === 'Runtime.exceptionThrown' ||
      (ev.method === 'Runtime.consoleAPICalled' && ev.params?.type === 'error') ||
      (ev.method === 'Log.entryAdded' && ev.params?.entry?.level === 'error')
    );
  }

  // Dispatch a key on the document with a given element focused and report
  // whether the page's handler called preventDefault (i.e. hijacked the key).
  async function keyHijacked(key, code, focusSelector) {
    return evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(focusSelector)});
      if (el) { try { el.focus(); } catch (e) {} }
      const evt = new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code || '')}, bubbles: true, cancelable: true });
      document.dispatchEvent(evt);
      return { defaultPrevented: evt.defaultPrevented, hasFocus: !!el };
    })()`);
  }

  async function bodyOverflows() {
    return evaluate(`(() => {
      const de = document.documentElement;
      const overflow = de.scrollWidth > de.clientWidth + 1;
      const offenders = [...document.querySelectorAll('body *')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.right > de.clientWidth + 1 || r.left < -1;
      }).slice(0, 5).map(el => ({ tag: el.tagName, id: el.id || '', cls: String(el.className || '').slice(0, 40) }));
      return { overflow, offenders };
    })()`);
  }

  const games = [
    {
      name: 'game-of-life', path: 'game-of-life/game_of_life.html',
      formControl: '#startStop',
      regression: async () => {
        // Space must NOT be hijacked while a button/select is focused.
        const hij = await keyHijacked(' ', 'Space', '#startStop');
        assert(hij.hasFocus && !hij.defaultPrevented, 'game-of-life: Space wird auf fokussiertem Control gehijackt');
        // Cycle-check (hash) darf über viele Schritte keinen Fehler werfen;
        // 120 FPS müssen auch auf einem 60-Hz-Display mehrere Schritte/Frame erlauben.
        const generationStart = await evaluate(`(() => {
          const fps = document.getElementById('fps'); fps.value = '120'; fps.dispatchEvent(new Event('input'));
          const s = document.getElementById('startStop'); if (s) s.click();
          return Number(document.getElementById('generation').textContent.replace(/\D/g, '')) || 0;
        })()`);
        await delay(650);
        const generationEnd = await evaluate(`Number(document.getElementById('generation').textContent.replace(/\D/g, '')) || 0`);
        assert(generationEnd - generationStart >= 55, `game-of-life: 120-FPS-Modus erreicht nur ${generationEnd - generationStart} Schritte in 650 ms`);
        const resizeKeptRunning = await evaluate(`(() => {
          const before = document.getElementById('startStop').textContent;
          window.dispatchEvent(new Event('resize'));
          return before === 'Pause' && document.getElementById('startStop').textContent === 'Pause';
        })()`);
        assert(resizeKeptRunning, 'game-of-life: größenneutraler Resize stoppt die laufende Simulation');
        const ratioRestore = await evaluate(`(() => {
          document.getElementById('startStop').click();
          const ratio = document.getElementById('ratio');
          ratio.value = '1'; ratio.dispatchEvent(new Event('change'));
          document.getElementById('save').click();
          const savedSize = document.getElementById('gridSize').textContent;
          ratio.value = '3'; ratio.dispatchEvent(new Event('change'));
          document.getElementById('load').click();
          return { savedSize, loadedSize: document.getElementById('gridSize').textContent, status: document.getElementById('status').textContent };
        })()`);
        assert(ratioRestore.savedSize === ratioRestore.loadedSize && !ratioRestore.status.includes('stimmt nicht'), 'game-of-life: Save ist nach Ratio-Wechsel nicht ladbar');
      }
    },
    {
      name: 'sandgame', path: 'sandgame/sand_game.html',
      formControl: '#pauseBtn',
      regression: async () => {
        const hij = await keyHijacked(' ', 'Space', '#pauseBtn');
        assert(hij.hasFocus && !hij.defaultPrevented, 'sandgame: Space wird auf fokussiertem Control gehijackt');
        await setViewport(375, 812, 'portraitPrimary', true, 3);
        const report = await evaluate(`(async () => {
          if (!window.SandGame) return { api: false };
          const initial = SandGame.getDiagnostics();
          const sixty = SandGame.computeTickBudget(0, 1000 / 60, 5);
          const highA = SandGame.computeTickBudget(0, 1000 / 120, 5);
          const highB = SandGame.computeTickBudget(highA.accumulator, 1000 / 120, 5);
          const stalled = SandGame.computeTickBudget(0, 1000, 8);
          const reset = SandGame.verifyCellReset();
          const tall = SandGame.computeCoverSourceRect(1, 10000, 1080, 720);
          const wide = SandGame.computeCoverSourceRect(10000, 1, 1080, 720);

          const rendererAfterFallback = SandGame.forceCpuFallback();
          const canvas = document.getElementById('c');
          const rect = canvas.getBoundingClientRect();
          canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 41, pointerType: 'touch', button: 0, clientX: rect.left + 4, clientY: rect.top + 4, bubbles: true, cancelable: true }));
          canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 42, pointerType: 'touch', button: 0, clientX: rect.left + 8, clientY: rect.top + 8, bubbles: true, cancelable: true }));
          const pointerDuring = SandGame.getDiagnostics();
          window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 41, pointerType: 'touch', bubbles: true }));
          const pointerAfter = SandGame.getDiagnostics();
          const pointerPainted = SandGame.findMaterial(SandGame.materials.SAND).length > 0;

          SandGame.clear();
          canvas.blur();
          canvas.focus();
          await new Promise(requestAnimationFrame);
          const cursor = document.getElementById('keyboard-cursor');
          const cursorLeftBefore = parseFloat(cursor.style.left);
          canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
          const cursorLeftAfter = parseFloat(cursor.style.left);
          canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
          const keyboardCanvas = {
            role: canvas.getAttribute('role'),
            tabbable: canvas.tabIndex === 0,
            focused: document.activeElement === canvas,
            cursorOpacity: getComputedStyle(cursor).opacity,
            cursorClass: cursor.className,
            cursorStyle: cursor.getAttribute('style'),
            cursorVisible: getComputedStyle(cursor).opacity === '1',
            moved: cursorLeftAfter > cursorLeftBefore,
            painted: SandGame.findMaterial(SandGame.materials.SAND).length > 0,
            announced: /Spalte/.test(document.getElementById('canvas-status').textContent)
          };

          SandGame.setPaused(true);
          SandGame.renderNow();
          const framesBeforePause = SandGame.getDiagnostics().renderedFrames;
          await new Promise(resolve => setTimeout(resolve, 140));
          const framesAfterPause = SandGame.getDiagnostics().renderedFrames;

          SandGame.setResolution(120);
          SandGame.clear();
          let dimensions = SandGame.getDiagnostics();
          SandGame.placeMaterial(Math.floor(dimensions.width / 2), dimensions.height - 1, SandGame.materials.STONE);
          SandGame.setResolution(80);
          dimensions = SandGame.getDiagnostics();
          const marker = SandGame.findMaterial(SandGame.materials.STONE)[0];

          SandGame.clear();
          SandGame.placeMaterial(Math.floor(dimensions.width / 2), Math.floor(dimensions.height / 2), SandGame.materials.SMOKE);
          SandGame.setWind(true);
          const windBefore = SandGame.getDiagnostics();
          SandGame.simulateTicks(1);
          const windAfter = SandGame.getDiagnostics();
          SandGame.setWind(false);
          SandGame.setResolution(initial.width);
          SandGame.setPaused(false);
          return {
            api: true, initial, sixty, highA, highB, stalled, reset, tall, wide,
            rendererAfterFallback, pointerDuring, pointerAfter, pointerPainted, keyboardCanvas,
            pausedUploads: framesAfterPause - framesBeforePause,
            marker, resized: dimensions,
            windVisits: windAfter.windActiveVisits - windBefore.windActiveVisits
          };
        })()`);
        assert(report.api, 'sandgame: Diagnose-API fehlt');
        assert(report.sixty.ticks === 5, `sandgame: 60-Hz-Tickbudget falsch ${JSON.stringify(report.sixty)}`);
        assert(report.highA.ticks + report.highB.ticks === 5, `sandgame: 120-Hz-Tickbudget falsch ${JSON.stringify([report.highA, report.highB])}`);
        assert(report.stalled.ticks === 8 && report.stalled.dropped > 0 && report.stalled.accumulator < 1, `sandgame: Stall-Catch-up nicht begrenzt ${JSON.stringify(report.stalled)}`);
        assert(report.reset.material === 2 && report.reset.salinity === 0 && report.reset.radiation === 0 && report.reset.age === 0 && report.reset.plantType === 0 && report.reset.plantHealth === 0 && report.reset.soil === 0 && report.reset.nitrogen === 0 && report.reset.mycelium === 0 && report.reset.colorSeed > 0, `sandgame: Zellzustand wird nicht vollständig zurückgesetzt ${JSON.stringify(report.reset)}`);
        assert(report.tall.sw <= 1 && report.tall.sh <= 10000 && report.wide.sw <= 10000 && report.wide.sh <= 1, `sandgame: Extremformat-Crop ungültig ${JSON.stringify([report.tall, report.wide])}`);
        assert(report.rendererAfterFallback === 'cpu', 'sandgame: WebGL→Canvas2D-Fallback schlug fehl');
        assert(report.pointerDuring.activePointerId === 41 && report.pointerDuring.drawing && report.pointerAfter.activePointerId === null && !report.pointerAfter.drawing && report.pointerPainted, `sandgame: Pointer-Cancel/Mehrfingergeste fehlerhaft ${JSON.stringify([report.pointerDuring, report.pointerAfter])}`);
        assert(report.keyboardCanvas.role === 'application' && report.keyboardCanvas.tabbable && report.keyboardCanvas.cursorVisible && report.keyboardCanvas.moved && report.keyboardCanvas.painted && report.keyboardCanvas.announced, `sandgame: keyboard drawing alternative failed ${JSON.stringify(report.keyboardCanvas)}`);
        assert(report.pausedUploads === 0, `sandgame: pausierte Szene rendert weiter (${report.pausedUploads} Frames)`);
        assert(report.marker && report.marker.y === report.resized.height - 1 && Math.abs(report.marker.x - report.resized.width / 2) <= 1, `sandgame: Resize erhält Boden nicht unten/zentriert ${JSON.stringify(report.marker)}`);
        assert(report.windVisits < report.resized.cells / 4, `sandgame: Wind scannt weiterhin zu viele Zellen (${report.windVisits}/${report.resized.cells})`);
      }
    },
    {
      name: 'pong', path: 'pong/pong.html',
      regression: async () => {
        // P2-Score-Span darf nach Moduswechsel nicht vom DOM abgetrennt sein.
        const spanOk = await evaluate(`(() => {
          if (typeof selectMode === 'function') selectMode('2p');
          const span = document.getElementById('ai-score');
          const label = document.getElementById('ai-score-label');
          const connected = !!(span && span.isConnected && label && label.isConnected);
          return { connected, labelText: label ? label.textContent : null };
        })()`);
        assert(spanOk.connected, 'pong: ai-score-Span ist nach 2P-Moduswechsel abgetrennt');
        // overlay hat Dialog-Semantik
        const dialog = await evaluate(`(document.getElementById('ui-overlay').getAttribute('aria-modal') === 'true')`);
        assert(dialog, 'pong: ui-overlay fehlt aria-modal');
        const corruptStorageSafe = await evaluate(`(() => {
          localStorage.setItem('pongScoreboard', '{}');
          const loaded = loadScoreboardData();
          localStorage.removeItem('pongScoreboard');
          return Array.isArray(loaded) && loaded.length === 0;
        })()`);
        assert(corruptStorageSafe, 'pong: valide JSON-Daten mit falscher Form werden nicht verworfen');
        const resultContract = await evaluate(`(() => {
          scoreboardData = [];
          player1Name = 'Testspieler'; player2Name = 'Spieler 2';
          selectMode('ai'); player1Score = 0; player2Score = 5;
          endGame(2);
          const entry = scoreboardData.at(-1);
          const resultText = document.getElementById('score-result').textContent;
          showMainMenuScreen();
          const controls = [...document.querySelectorAll('#ui-overlay button, #name-input input')].filter(element => element.getBoundingClientRect().height > 0);
          const minHeight = Math.min(...controls.map(element => element.getBoundingClientRect().height));
          const minFont = Math.min(...controls.map(element => parseFloat(getComputedStyle(element).fontSize)));
          lastFrameTime = performance.now() - 5000; simAccumulator = 123;
          startGame();
          return {
            winner: entry && entry.winner,
            score: entry && entry.score,
            resultText,
            minHeight,
            minFont,
            accumulatorReset: simAccumulator === 0
          };
        })()`);
        assert(resultContract.winner === 'CPU' && resultContract.score === '5-0' && /CPU: 5/.test(resultContract.resultText), `pong: Spieler-2/CPU-Ergebnis vertauscht ${JSON.stringify(resultContract)}`);
        assert(resultContract.minHeight >= 44 && resultContract.minFont >= 14, `pong: mobile Menüsteuerung zu klein ${JSON.stringify(resultContract)}`);
        assert(resultContract.accumulatorReset, 'pong: Replay übernimmt alten Fixed-Step-Akkumulator');
        const keyboard2p = await evaluate(`(() => {
          selectMode('2p');
          const p1Before = player1.y, p2Before = player2.y;
          handleKeyDown(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true }));
          handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
          for (let i = 0; i < 10; i++) { movePlayer1(); movePlayer2(); }
          handleKeyUp(new KeyboardEvent('keyup', { key: 'w' }));
          handleKeyUp(new KeyboardEvent('keyup', { key: 'ArrowUp' }));
          return { p1Moved: player1.y < p1Before, p2Moved: player2.y < p2Before };
        })()`);
        assert(keyboard2p.p1Moved && keyboard2p.p2Moved, `pong: 2P keyboard controls incomplete ${JSON.stringify(keyboard2p)}`);
        // Tatsächlich den fixen 60-Hz-Loop ohne Fehler laufen lassen.
        const started = await evaluate(`document.getElementById('ui-overlay').classList.contains('hidden')`);
        assert(started, 'pong: Spiel startet nicht (Overlay bleibt sichtbar)');
        await delay(500); // Loop läuft einige Frames
      }
    },
    {
      name: 'snake-ultimate', path: 'snake-ultimate/snake_ultimate.html',
      formControl: '#themeSelectOverlay',
      regression: async () => {
        // Pfeiltasten dürfen das Theme-Select nicht hijacken (Früher: Schwierigkeit geändert).
        const hij = await keyHijacked('ArrowDown', 'ArrowDown', '#themeSelectOverlay');
        assert(hij.hasFocus && !hij.defaultPrevented, 'snake-ultimate: Pfeiltaste hijackt fokussiertes Select');
        const roles = await evaluate(`(() => ({
          dialogs: ['mainMenu','pauseOverlay','gameOver'].map(id => document.getElementById(id).getAttribute('aria-modal')).join(','),
          canvas: document.getElementById('gameCanvas').getAttribute('role'),
          canvasTabbable: document.getElementById('gameCanvas').tabIndex === 0
        }))()`);
        assert(roles.dialogs === 'true,true,true' && roles.canvas === 'application' && roles.canvasTabbable, 'snake-ultimate: Dialog-/Canvas-Semantik fehlt');
        const modalExit = await evaluate(`(() => ({
          allDialogs: ['mainMenu','pauseOverlay','gameOver'].every(id => !!document.querySelector('#' + id + ' a[href="../index.html"]')),
          outerHidden: getComputedStyle(document.querySelector('body > .game-collection-link')).visibility === 'hidden',
          innerVisible: getComputedStyle(document.querySelector('#mainMenu .game-collection-link')).visibility === 'visible'
        }))()`);
        assert(modalExit.allDialogs && modalExit.outerHidden && modalExit.innerVisible, `snake-ultimate: modal overview navigation failed ${JSON.stringify(modalExit)}`);
        const gamepadStart = await evaluate(`(() => {
          const buttons = Array.from({length: 16}, () => ({ pressed: false }));
          const pad = { index: 0, axes: [0, 0, 0, 0], buttons };
          startGame();
          const canvasFocused = document.activeElement === document.getElementById('gameCanvas');
          buttons[9].pressed = true; handleGamepadInput(pad); const paused = gameState;
          handleGamepadInput(pad); const stillPaused = gameState;
          buttons[9].pressed = false; handleGamepadInput(pad);
          buttons[9].pressed = true; handleGamepadInput(pad); const resumed = gameState;
          showMenu();
          return { paused, stillPaused, resumed, canvasFocused };
        })()`);
        assert(gamepadStart.paused === 'PAUSED' && gamepadStart.stillPaused === 'PAUSED' && gamepadStart.resumed === 'PLAYING' && gamepadStart.canvasFocused, 'snake-ultimate: Gamepad-Flankenerkennung oder Canvas-Fokus fehlerhaft');
        const cadence = await evaluate(`(() => {
          startGame();
          stopLoop();
          tickAccumulator = 0;
          lastFrameTime = 1000;
          const before = frameCount;
          runLoop(1250);
          stopLoop();
          const steps = frameCount - before;
          showMenu();
          return { steps, remainder: tickAccumulator, speed: gameSpeed };
        })()`);
        assert(cadence.steps === 2 && cadence.remainder === 50 && cadence.remainder < cadence.speed, `snake-ultimate: RAF accumulator loses elapsed ticks ${JSON.stringify(cadence)}`);
      }
    },
    {
      name: 'asteroids', path: 'asteroids/asteroids.html',
      formControl: '#btn-pause',
      regression: async () => {
        const boot = await evaluate(`(() => {
          const G = window.AsteroidsGame;
          const canvas = document.getElementById('game');
          return {
            api: !!G, state: G && G.state,
            role: canvas.getAttribute('role'), label: !!canvas.getAttribute('aria-label'), tabbable: canvas.tabIndex === 0,
            live: document.getElementById('status').getAttribute('aria-live'),
            back: !!document.querySelector('a.game-collection-link[href="../index.html"]') && !document.getElementById('back-link').hidden,
            hiDpi: canvas.width === Math.round(innerWidth * G.view.DPR)
          };
        })()`);
        assert(boot.api && boot.state === 'menu', `asteroids: Boot/Diagnose-API fehlerhaft ${JSON.stringify(boot)}`);
        assert(boot.role === 'application' && boot.label && boot.tabbable && boot.live === 'polite' && boot.back && boot.hiDpi, `asteroids: Canvas-Semantik, Rücklink oder HiDPI fehlen ${JSON.stringify(boot)}`);
        // Tippen startet, Touch-Steuerung erscheint und der Feuerknopf schießt.
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 187, y: 400, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await delay(150);
        const started = await evaluate(`(() => {
          const G = window.AsteroidsGame;
          G.ship.inv = 9999;
          const fire = document.querySelector('.pad-btn.fire').getBoundingClientRect();
          return { state: G.state, touchMode: G.touchMode, padVisible: !document.getElementById('touch').hidden, backHidden: document.getElementById('back-link').hidden,
            fireX: fire.left + fire.width / 2, fireY: fire.top + fire.height / 2, fireSize: Math.min(fire.width, fire.height), shots: G.shots.length };
        })()`);
        assert(started.state === 'playing' && started.touchMode && started.padVisible && started.backHidden, `asteroids: Tippen startet nicht mit Touch-Steuerung ${JSON.stringify(started)}`);
        assert(started.fireSize >= 44, `asteroids: Touch-Buttons zu klein ${JSON.stringify(started)}`);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: started.fireX, y: started.fireY, id: 2 }] });
        await delay(260);
        const firing = await evaluate('({ shots: AsteroidsGame.shots.length, ammo: AsteroidsGame.weapons.blaster.ammo, held: !!AsteroidsGame.keys.Space })');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await delay(60);
        const released = await evaluate('!AsteroidsGame.keys.Space');
        assert(firing.held && firing.ammo < 120 && released, `asteroids: Feuerknopf schießt nicht oder bleibt hängen ${JSON.stringify({ firing, released })}`);
        const flow = await evaluate(`(() => {
          const G = window.AsteroidsGame;
          window.dispatchEvent(new Event('blur'));
          const pausedOnBlur = G.paused && !document.getElementById('back-link').hidden && document.getElementById('touch').hidden;
          G.setPaused(false);
          G.applyRare('unlock_laser');
          G.switchWeapon('laser');
          G.keys.Space = true;
          for (let i = 0; i < 480 && !G.weapons.laser.overheated; i++) G.update(1 / 60);
          G.keys.Space = false;
          const overheated = G.weapons.laser.overheated;
          G.lives = 1; G.upgrades.shield = false; G.ship.powerups = {}; G.ship.inv = 0; G.die();
          return { pausedOnBlur, overheated, state: G.state, hi: Number(localStorage.getItem('asteroids-highscore')) === G.hi };
        })()`);
        assert(flow.pausedOnBlur && flow.overheated && flow.state === 'gameover' && flow.hi, `asteroids: Pause/Laser-Overheat/Game-Over fehlerhaft ${JSON.stringify(flow)}`);
      }
    },
    {
      name: 'tetris', path: 'tetris/tetris.html',
      regression: async () => {
        const sem = await evaluate(`(() => ({
          ariaLive: !!document.getElementById('game-status'),
          menuDialog: document.getElementById('menu-overlay').getAttribute('aria-modal') === 'true',
          modalExit: !!document.querySelector('#menu-overlay a[href="../index.html"]'),
          outerHidden: getComputedStyle(document.querySelector('body > .game-collection-link')).visibility === 'hidden',
          hs: typeof highScore !== 'undefined'
        }))()`);
        assert(sem.ariaLive, 'tetris: aria-live-Region fehlt');
        assert(sem.menuDialog, 'tetris: Menü-Dialog-Semantik fehlt');
        assert(sem.modalExit && sem.outerHidden, 'tetris: sichtbarer, aber inerter Außenlink statt Modal-Navigation');
      }
    },
    {
      name: 'minenraeumkommando-foxtrott', path: 'minenraeumkommando-foxtrott/index.html',
      regression: async () => {
        // Menü offen → Hintergrund (main#game) muss inert sein (Focus-Containment).
        const inert = await evaluate(`(() => {
          const m = document.getElementById('menu-overlay');
          const game = document.getElementById('game');
          return { menuVisible: m && getComputedStyle(m).display !== 'none', gameInert: !!(game && game.inert) };
        })()`);
        assert(inert.menuVisible && inert.gameInert, 'minesweeper: Hintergrund ist bei offenem Menü nicht inert');
        const roles = await evaluate(`(document.getElementById('menu-overlay').getAttribute('aria-modal') === 'true' && document.getElementById('result-overlay').getAttribute('aria-modal') === 'true')`);
        assert(roles, 'minesweeper: Overlay-Dialog-Semantik fehlt');
        const modalExit = await evaluate(`(() => ({
          menu: !!document.querySelector('#menu-overlay a[href="../index.html"]'),
          result: !!document.querySelector('#result-overlay a[href="../index.html"]'),
          outerHidden: getComputedStyle(document.querySelector('body > .back-link')).visibility === 'hidden'
        }))()`);
        assert(modalExit.menu && modalExit.result && modalExit.outerHidden, `minesweeper: Modal-Navigation unvollständig ${JSON.stringify(modalExit)}`);
        const touchStart = await evaluate(`(() => {
          document.querySelector('[data-difficulty="hard"]').click();
          const wrap = document.getElementById('board-wrap');
          const cell = document.querySelector('#board .cell');
          const a = wrap.getBoundingClientRect(), b = cell.getBoundingClientRect();
          return { x: Math.min(a.right - 20, a.left + 220), y: b.top + b.height / 2, scrollLeft: wrap.scrollLeft, revealed: document.querySelectorAll('#board .cell.revealed').length };
        })()`);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchStart.x, y: touchStart.y, radiusX: 5, radiusY: 5, force: 1, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchStart.x - 90, y: touchStart.y, radiusX: 5, radiusY: 5, force: 1, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await delay(120);
        const touchEnd = await evaluate(`(() => ({ scrollLeft: document.getElementById('board-wrap').scrollLeft, revealed: document.querySelectorAll('#board .cell.revealed').length }))()`);
        assert(touchEnd.revealed === touchStart.revealed, `minesweeper: Scrollgeste deckte ein Feld auf ${JSON.stringify({ touchStart, touchEnd })}`);
        const timerConsistent = await evaluate(`(async () => {
          document.querySelector('#board .cell').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
          await new Promise(resolve => setTimeout(resolve, 1800));
          for (let attempt = 0; attempt < 600; attempt++) {
            if (document.getElementById('result-overlay').classList.contains('show')) break;
            const cell = document.querySelector('#board .cell:not(.revealed):not(.flagged)');
            if (!cell) break;
            cell.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
          }
          const hud = Number(document.getElementById('timer').textContent);
          const text = document.getElementById('result-text').textContent;
          const result = Number((text.match(/Zeit: (\\d+) s/) || [])[1]);
          document.getElementById('result-menu').click();
          return { hud, result };
        })()`);
        assert(timerConsistent.hud >= 1 && timerConsistent.hud === timerConsistent.result, `minesweeper: HUD/result timer rounding mismatch ${JSON.stringify(timerConsistent)}`);
      }
    },
    {
      name: 'panda-lemmings', path: 'panda-lemmings/panda_lemmings.html',
      regression: async () => {
        const a11y = await evaluate(`(() => {
          const cv = document.getElementById('gameCanvas');
          const stats = document.getElementById('stats');
          const start = document.getElementById('btn-start');
          game.togglePause();
          const introPauseBlocked = !game.paused;
          start.focus();
          const space = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
          start.dispatchEvent(space);
          return {
            canvasRole: cv ? cv.getAttribute('role') : null,
            canvasLabel: cv ? cv.getAttribute('aria-label') : null,
            canvasTabbable: cv ? cv.tabIndex === 0 : false,
            canvasHelp: !!document.getElementById('canvas-help'),
            statsLive: stats ? stats.getAttribute('aria-live') : null,
            introPauseBlocked,
            nativeSpacePreserved: !space.defaultPrevented
          };
        })()`);
        assert(a11y.canvasRole === 'application' && a11y.canvasLabel && a11y.canvasTabbable && a11y.canvasHelp, 'panda-lemmings: interaktive Canvas-Tastatursemantik fehlt');
        assert(a11y.statsLive === 'polite' && a11y.nativeSpacePreserved && a11y.introPauseBlocked, 'panda-lemmings: Live-Status, Pause-Guard oder native Button-Aktivierung fehlerhaft');
        const keyboardAssignment = await evaluate(`(async () => {
          game.paused = true;
          document.getElementById('btn-start').click();
          const startUnpaused = !game.paused;
          if (!game.world.pandas.length) game.world.spawn();
          game.selectSkill('bomber');
          const canvas = document.getElementById('gameCanvas');
          canvas.focus();
          canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
          const selectedId = game.keyboardPandaId;
          const before = game.world.pool.bomber;
          canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          const assigned = game.world.pool.bomber === before - 1;
          const idAnnounced = selectedId === 1 && /Panda 1/.test(document.getElementById('game-announcement').textContent);
          game.completed.add(0); game.totalSaved = 12; game.totalLost = 1; game.levelSaved.set(0, 12); game.levelLost.set(0, 1); game.saveProgress();
          const stored = JSON.parse(localStorage.getItem('panda-lemmings-progress-v1'));
          return { selectedId, assigned, idAnnounced, startUnpaused, focused: document.activeElement === canvas, stored: stored && stored.completed.includes(0) && stored.totalSaved === 12 };
        })()`);
        assert(keyboardAssignment.selectedId != null && keyboardAssignment.assigned && keyboardAssignment.focused && keyboardAssignment.startUnpaused && keyboardAssignment.idAnnounced, `panda-lemmings: keyboard-only assignment/start/ID failed ${JSON.stringify(keyboardAssignment)}`);
        assert(keyboardAssignment.stored, 'panda-lemmings: campaign progress was not persisted');
        for (const viewport of [{width:375,height:667},{width:414,height:736},{width:667,height:375},{width:736,height:414}]) {
          await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: true });
          const overlaps = await evaluate(`(() => {
            const link = document.querySelector('.game-collection-link');
            const a = link.getBoundingClientRect();
            return [...document.querySelectorAll('#tray button,#tray select,#tray input')].filter(element => {
              const b = element.getBoundingClientRect();
              return b.width > 0 && b.height > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            }).map(element => element.id || element.className);
          })()`);
          assert(overlaps.length === 0, `panda-lemmings: Zurück-Link überlappt Controls bei ${viewport.width}×${viewport.height}: ${overlaps}`);
        }
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
      }
    },
    {
      name: 'maulkorbraupen-das-spiel', path: 'maulkorbraupen-das-spiel/index.html',
      regression: async () => {
        const report = await evaluate(`(async () => {
          const images = ['01-intro','02-pruefgas','03-ventile','04-gasmesser','05-chaoslabor','06-analysen','07-tor-verschlossen','08-feierabendtor','09-finale','10-epilog','werkskarte'];
          const audio = ['01-intro','02-pruefgas','03-ventile','04-gasmesser','05-chaoslabor','06-analysen','07-tor-verschlossen','08-feierabendtor','09-finale','10-epilog'];
          const urls = images.map(name => 'assets/' + name + '.webp').concat(audio.map(name => 'audio/' + name + '.mp3'));
          const responses = await Promise.all(urls.map(url => fetch(url)));
          return {
            logic: !!window.MaulkorbraupenLogic,
            sceneLoaded: !!document.querySelector('#scene-image[src]'),
            progress: document.querySelector('#progress-percent')?.textContent || '',
            assetsOk: responses.every(response => response.ok),
            assetCount: responses.length
          };
        })()`);
        assert(report.logic && report.sceneLoaded, 'maulkorbraupen: Spiel bootet nicht vollständig');
        assert(report.progress.includes('0'), 'maulkorbraupen: Startfortschritt ist ungültig');
        assert(report.assetsOk && report.assetCount === 21, 'maulkorbraupen: Bild-/Audio-Assets unvollständig');
      }
    }
  ];

  const responsiveViewports = [
    { width: 320, height: 568, orientation: 'portraitPrimary', mobile: true, dpr: 2 },
    { width: 375, height: 812, orientation: 'portraitPrimary', mobile: true, dpr: 3 },
    { width: 414, height: 896, orientation: 'portraitPrimary', mobile: true, dpr: 1 },
    { width: 812, height: 375, orientation: 'landscapePrimary', mobile: true },
    { width: 768, height: 1024, orientation: 'portraitPrimary', mobile: false },
    { width: 1024, height: 768, orientation: 'landscapePrimary', mobile: false },
    { width: 1366, height: 768, orientation: 'landscapePrimary', mobile: false },
    { width: 1920, height: 1080, orientation: 'landscapePrimary', mobile: false },
    { width: 2560, height: 1080, orientation: 'landscapePrimary', mobile: false },
    { width: 3440, height: 1440, orientation: 'landscapePrimary', mobile: false }
  ];
  for (const game of games) {
    const eventStart = cdp.events.length;
    await setViewport(375, 812, 'portraitPrimary');
    await navigate(game.path);

    // Boot + key regressions.
    if (game.regression) await game.regression();

    // Keyboard-not-hijacking-form-fields (generisch für Spiele mit Form-Control).
    if (game.formControl) {
      const hij = await keyHijacked(' ', 'Space', game.formControl);
      if (hij.hasFocus) assert(!hij.defaultPrevented, `${game.name}: Leertaste hijackt ${game.formControl}`);
    }

    // Phone, Landscape, Tablet und Desktop ohne Dokument-Überlauf.
    for (const viewport of responsiveViewports) {
      await setViewport(viewport.width, viewport.height, viewport.orientation, viewport.mobile, viewport.dpr || 1);
      const ov = await bodyOverflows();
      assert(!ov.overflow, `${game.name}: Body-Überlauf bei ${viewport.width}×${viewport.height} ${JSON.stringify(ov.offenders)}`);
    }
    await setViewport(375, 812, 'portraitPrimary', true); // Orientierungspfad zurück

    // Keine Runtime-/Console-Fehler über die ganze Session (inkl. Resize/Orientation).
    const errors = collectErrors(eventStart);
    assert(errors.length === 0, `${game.name}: Laufzeit-/Console-Fehler: ${JSON.stringify(errors).slice(0, 600)}`);
  }

  console.log(`classic-games-smoke ok (${games.length} Spiele, 10 Phone/Tablet/Desktop/Widescreen/Ultrawide-Viewports, Boot, 0 Fehler, kein Überlauf, Tastatur-Nicht-Hijack, Regressionen)`);
  await cdp.send('Browser.close').catch(() => {});
} finally {
  cdp?.socket.close();
  server.close();
  if (!browser.killed) browser.kill();
  await delay(200);
  rmSync(profile, { recursive: true, force: true });
}
