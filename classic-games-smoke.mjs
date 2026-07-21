// Comprehensive headless CDP smoke path for the classic/canvas games.
// Checks boot, zero runtime/console errors, 320/375/414 portrait + landscape
// resize/orientation, no body overflow, keyboard controls not hijacking form
// fields, and key fixed regressions. Zero dependencies (Node 22+ + Chrome CDP).
//
// Scope: game-of-life, sandgame, pong, snake-ultimate, tetris,
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

  async function setViewport(width, height, orientation) {
    const params = { width, height, deviceScaleFactor: 1, mobile: true };
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
        // Tatsächlich ein Spiel starten und den fixen 60-Hz-Loop ohne Fehler laufen lassen.
        const started = await evaluate(`(() => {
          if (typeof selectMode === 'function') selectMode('ai');
          const btn = [...document.querySelectorAll('#screen-main-menu button')].find(b => /starten/i.test(b.textContent));
          if (btn) btn.click();
          return document.getElementById('ui-overlay').classList.contains('hidden');
        })()`);
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
        const roles = await evaluate(`(() => ['mainMenu','pauseOverlay','gameOver'].map(id => document.getElementById(id).getAttribute('aria-modal')).join(','))()`);
        assert(roles === 'true,true,true', 'snake-ultimate: Overlay-Dialog-Semantik fehlt');
        const gamepadStart = await evaluate(`(() => {
          const buttons = Array.from({length: 16}, () => ({ pressed: false }));
          const pad = { index: 0, axes: [0, 0, 0, 0], buttons };
          startGame();
          buttons[9].pressed = true; handleGamepadInput(pad); const paused = gameState;
          handleGamepadInput(pad); const stillPaused = gameState;
          buttons[9].pressed = false; handleGamepadInput(pad);
          buttons[9].pressed = true; handleGamepadInput(pad); const resumed = gameState;
          showMenu();
          return { paused, stillPaused, resumed };
        })()`);
        assert(gamepadStart.paused === 'PAUSED' && gamepadStart.stillPaused === 'PAUSED' && gamepadStart.resumed === 'PLAYING', 'snake-ultimate: Gamepad-Start hat keine Flankenerkennung');
      }
    },
    {
      name: 'tetris', path: 'tetris/tetris.html',
      regression: async () => {
        const sem = await evaluate(`(() => ({
          ariaLive: !!document.getElementById('game-status'),
          menuDialog: document.getElementById('menu-overlay').getAttribute('aria-modal') === 'true',
          hs: typeof highScore !== 'undefined'
        }))()`);
        assert(sem.ariaLive, 'tetris: aria-live-Region fehlt');
        assert(sem.menuDialog, 'tetris: Menü-Dialog-Semantik fehlt');
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
      }
    },
    {
      name: 'panda-lemmings', path: 'panda-lemmings/panda_lemmings.html',
      regression: async () => {
        const a11y = await evaluate(`(() => {
          const cv = document.getElementById('gameCanvas');
          const stats = document.getElementById('stats');
          return {
            canvasRole: cv ? cv.getAttribute('role') : null,
            canvasLabel: cv ? cv.getAttribute('aria-label') : null,
            statsLive: stats ? stats.getAttribute('aria-live') : null
          };
        })()`);
        assert(a11y.canvasRole === 'img' && a11y.canvasLabel, 'panda-lemmings: Canvas-Barrierefreiheit fehlt');
        assert(a11y.statsLive === 'polite', 'panda-lemmings: Stats aria-live fehlt');
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

  const portraitWidths = [320, 375, 414];
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

    // Portrait: 320/375/414 ohne Body-Überlauf.
    for (const w of portraitWidths) {
      await setViewport(w, 812, 'portraitPrimary');
      const ov = await bodyOverflows();
      assert(!ov.overflow, `${game.name}: Body-Überlauf im Portrait bei ${w}px ${JSON.stringify(ov.offenders)}`);
    }
    // Landscape + Orientierungswechsel ohne Überlauf/Fehler.
    await setViewport(812, 375, 'landscapePrimary');
    let ov = await bodyOverflows();
    assert(!ov.overflow, `${game.name}: Body-Überlauf im Landscape ${JSON.stringify(ov.offenders)}`);
    await setViewport(375, 812, 'portraitPrimary'); // zurück (orientationchange-Pfad)

    // Keine Runtime-/Console-Fehler über die ganze Session (inkl. Resize/Orientation).
    const errors = collectErrors(eventStart);
    assert(errors.length === 0, `${game.name}: Laufzeit-/Console-Fehler: ${JSON.stringify(errors).slice(0, 600)}`);
  }

  console.log(`classic-games-smoke ok (${games.length} Spiele, Boot, 0 Fehler, Portrait 320/375/414 + Landscape, kein Überlauf, Tastatur-Nicht-Hijack, Regressionen)`);
  await cdp.send('Browser.close').catch(() => {});
} finally {
  cdp?.socket.close();
  server.close();
  if (!browser.killed) browser.kill();
  await delay(200);
  rmSync(profile, { recursive: true, force: true });
}
