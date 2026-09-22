import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22 || typeof fetch !== 'function' || typeof WebSocket !== 'function') {
  throw new Error('browser-smoke-test.mjs requires Node.js 22 or newer (global fetch and WebSocket).');
}

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const games = ['panda-bubbles', 'des-pandas-juwelen', 'panda-spider', 'pandacell', 'pandadoku', 'pandakreuzwort', 'pandataire', 'panndike', 'texttl', 'pahjong'];
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.cjs', 'text/javascript; charset=utf-8']
]);

function findBrowser() {
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(
      resolve(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
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

function delay(ms) { return new Promise(resolveDelay => setTimeout(resolveDelay, ms)); }

async function getAvailablePort() {
  const probe = createServer();
  await new Promise((resolveListen, rejectListen) => {
    probe.once('error', rejectListen);
    probe.listen(0, '127.0.0.1', resolveListen);
  });
  const port = probe.address().port;
  await new Promise(resolveClose => probe.close(resolveClose));
  return port;
}

function createCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const waiters = new Map();
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
    const methodWaiters = waiters.get(message.method);
    if (methodWaiters?.length) methodWaiters.shift()(message.params);
  });

  function ready() {
    return new Promise((resolveReady, rejectReady) => {
      socket.addEventListener('open', resolveReady, { once: true });
      socket.addEventListener('error', () => rejectReady(new Error('CDP WebSocket failed')), { once: true });
    });
  }

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolveSend, rejectSend) => {
      pending.set(id, { resolve: resolveSend, reject: rejectSend });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function waitEvent(method, timeout = 10000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const list = waiters.get(method) || [];
      const timer = setTimeout(() => rejectEvent(new Error(`Timed out waiting for ${method}`)), timeout);
      list.push(params => { clearTimeout(timer); resolveEvent(params); });
      waiters.set(method, list);
    });
  }

  return { socket, events, ready, send, waitEvent };
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
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const httpPort = server.address().port;
const debugPort = await getAvailablePort();
const profile = resolve(tmpdir(), `browser-games-smoke-${process.pid}-${Date.now()}`);
const browser = spawn(browserPath, [
  '--headless',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--no-first-run',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore' });

let cdp;
try {
  let targets;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const foundTargets = await response.json();
        if (foundTargets.some(target => target.type === 'page')) { targets = foundTargets; break; }
      }
    } catch (_error) { /* Browser is still starting. */ }
    await delay(100);
  }
  const page = targets?.find(target => target.type === 'page');
  if (!page) throw new Error('Chrome DevTools page target did not start.');

  cdp = createCdp(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });

  async function evaluate(expression) {
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
    return result.result.value;
  }

  async function navigate(pathname) {
    const loaded = cdp.waitEvent('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/${pathname}` });
    await loaded;
    await delay(pathname.startsWith('pandadoku/') || pathname.startsWith('pandakreuzwort/') ? 900 : 250);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  for (const game of games) {
    const eventStart = cdp.events.length;
    await navigate(`${game}/index.html`);
    const shell = await evaluate(`(() => {
      const link = document.querySelector('.game-toolbar a[href]');
      const picker = document.querySelector('.game-style-control select');
      return {
        style: document.documentElement.dataset.gameStyle,
        pickerOptions: picker ? picker.options.length : 0,
        backText: link ? link.textContent.trim() : '',
        backPath: link ? new URL(link.href).pathname : '',
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    })()`);
    assert(shell.style === 'panda', `${game}: Panda hell is not the default`);
    assert(shell.pickerOptions === 3, `${game}: style picker is incomplete`);
    assert(shell.backText.includes('Spieleübersicht'), `${game}: overview link is missing`);
    assert(shell.backPath.endsWith('/index.html'), `${game}: overview target is wrong`);
    assert(!shell.bodyOverflow, `${game}: page has unintended horizontal body overflow at 375px`);
    if (game === 'panda-bubbles' || game === 'des-pandas-juwelen') {
      const bootFocusStayedAtPageStart = await evaluate(`document.activeElement === document.body`);
      assert(bootFocusStayedAtPageStart, `${game}: boot unexpectedly moved focus into the game`);
    }

    if (game === 'panda-bubbles' || game === 'des-pandas-juwelen' || game === 'pandataire' || game === 'pandakreuzwort' || game === 'texttl') {
      const dialogFocus = await evaluate(`(async () => {
        const dialog = document.querySelector('#result, #result-overlay');
        const opener = document.querySelector('#new-game, #new-btn, #stats-btn');
        if (!dialog || !opener) return { available: false };
        opener.focus();
        dialog.hidden = false;
        await new Promise(resolve => setTimeout(resolve, 40));
        const focusedInside = dialog.contains(document.activeElement);
        const backgroundInert = document.querySelectorAll('[inert]').length > 0;
        dialog.hidden = true;
        await new Promise(resolve => setTimeout(resolve, 40));
        return { available: true, focusedInside, backgroundInert, restored: document.activeElement === opener };
      })()`);
      assert(dialogFocus.available && dialogFocus.focusedInside && dialogFocus.backgroundInert && dialogFocus.restored,
        `${game}: shared dialog focus/inert/restore failed ${JSON.stringify(dialogFocus)}`);
    }

    const responsiveViewports = [
      { width: 320, height: 568, mobile: true, deviceScaleFactor: 2 },
      { width: 375, height: 812, mobile: true, deviceScaleFactor: 3 },
      { width: 414, height: 896, mobile: true, deviceScaleFactor: 2 },
      { width: 667, height: 375, mobile: true, deviceScaleFactor: 2 },
      { width: 768, height: 1024, mobile: false, deviceScaleFactor: 1 },
      { width: 1024, height: 768, mobile: false, deviceScaleFactor: 1 },
      { width: 1366, height: 768, mobile: false, deviceScaleFactor: 1 },
      { width: 1920, height: 1080, mobile: false, deviceScaleFactor: 1 },
      { width: 2560, height: 1080, mobile: false, deviceScaleFactor: 1 },
      { width: 3440, height: 1440, mobile: false, deviceScaleFactor: 1 }
    ];
    for (const viewport of responsiveViewports) {
      const { width } = viewport;
      await cdp.send('Emulation.setDeviceMetricsOverride', viewport);
      for (const style of ['panda', 'night', 'contrast']) {
        const appearance = await evaluate(`(() => {
          const picker = document.querySelector('.game-style-control select');
          picker.value = '${style}';
          picker.dispatchEvent(new Event('change', { bubbles: true }));
          function luminance(color) {
            const values = (color.match(/[\\d.]+/g) || []).slice(0, 3).map(Number).map(value => {
              const channel = value / 255;
              return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
            });
            return values.length === 3 ? 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2] : null;
          }
          function contrast(element) {
            const cardStyle = getComputedStyle(element);
            const foreground = luminance(cardStyle.color);
            const background = luminance(cardStyle.backgroundColor);
            if (foreground == null || background == null) return null;
            return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
          }
          const cards = [...document.querySelectorAll('.card:not(.face-down):not(.covered)')].filter(card => getComputedStyle(card).visibility !== 'hidden');
          const controls = [...document.querySelectorAll('select, input[type="number"]')];
          const activeControls = [...document.querySelectorAll('button.primary, button[aria-pressed="true"], .clue-btn.active')]
            .filter(control => {
              const computed = getComputedStyle(control);
              return computed.visibility !== 'hidden' && computed.display !== 'none' && computed.backgroundColor !== 'rgba(0, 0, 0, 0)';
            });
          const contrasts = cards.map(contrast).filter(value => value != null);
          const controlContrasts = controls.map(contrast).filter(value => value != null);
          const activeControlDetails = activeControls.map(control => ({
            label: control.textContent.trim().slice(0, 40),
            className: String(control.className || ''),
            contrast: contrast(control),
            color: getComputedStyle(control).color,
            background: getComputedStyle(control).backgroundColor
          }));
          const activeControlContrasts = activeControlDetails.map(detail => detail.contrast).filter(value => value != null);
          const overflowers = [...document.querySelectorAll('body *')].filter(element => {
            const rect = element.getBoundingClientRect();
            const overflowX = getComputedStyle(element).overflowX;
            const leaksContent = element.clientWidth > 2 && element.scrollWidth > element.clientWidth + 1 && overflowX === 'visible';
            return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1 || leaksContent;
          }).slice(0, 5).map(element => ({
            tag: element.tagName,
            id: element.id,
            className: String(element.className || ''),
            left: Math.round(element.getBoundingClientRect().left),
            right: Math.round(element.getBoundingClientRect().right),
            width: Math.round(element.getBoundingClientRect().width),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth
          }));
          return {
            applied: document.documentElement.dataset.gameStyle,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            overflowers,
            minimumCardContrast: contrasts.length ? Math.min(...contrasts) : null,
            minimumControlContrast: controlContrasts.length ? Math.min(...controlContrasts) : null,
            minimumActiveControlContrast: activeControlContrasts.length ? Math.min(...activeControlContrasts) : null,
            activeControlDetails
          };
        })()`);
        assert(appearance.applied === style, `${game}: ${style} style did not apply`);
        assert(!appearance.overflow, `${game}: body overflow at ${width}px in ${style} style ${JSON.stringify(appearance.overflowers)}`);
        if (appearance.minimumCardContrast != null) {
          assert(appearance.minimumCardContrast >= 3, `${game}: unreadable cards in ${style} style (contrast ${appearance.minimumCardContrast.toFixed(2)})`);
        }
        if (appearance.minimumControlContrast != null) {
          assert(appearance.minimumControlContrast >= 4.5, `${game}: unreadable form control in ${style} style (contrast ${appearance.minimumControlContrast.toFixed(2)})`);
        }
        if (appearance.minimumActiveControlContrast != null) {
          assert(appearance.minimumActiveControlContrast >= 4.5, `${game}: unreadable active control in ${style} style (contrast ${appearance.minimumActiveControlContrast.toFixed(2)}; ${JSON.stringify(appearance.activeControlDetails)})`);
        }
      }
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await evaluate(`(() => {
      const picker = document.querySelector('.game-style-control select');
      picker.value = 'panda';
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

    if (game === 'panda-spider' || game === 'pandacell' || game === 'panndike') {
      const focusKept = await evaluate(`(() => {
        const card = document.querySelector('.card:not(:disabled):not(.face-down)');
        if (!card) return false;
        const key = card.dataset.focusKey;
        card.focus();
        card.click();
        return document.activeElement && document.activeElement.dataset.focusKey === key;
      })()`);
      assert(focusKept, `${game}: card focus was lost after selection`);
    }

    if (game === 'panda-spider') {
      const deepLayout = await evaluate(`(() => {
        for (let i = 0; i < 5; i++) {
          const deal = document.querySelector('#deal-stock');
          if (!deal.disabled) deal.click();
        }
        const cards = [...document.querySelectorAll('#tableau .card')];
        const bottom = Math.max(...cards.map(card => card.getBoundingClientRect().bottom));
        const stockTop = document.querySelector('.stock-row').getBoundingClientRect().top;
        return { cards: cards.length, beforeStock: bottom <= stockTop + 1, tableauHeight: document.querySelector('#tableau').getBoundingClientRect().height };
      })()`);
      assert(deepLayout.cards >= 90 && deepLayout.beforeStock, `panda-spider: deep columns overlap stock/controls ${JSON.stringify(deepLayout)}`);
    }

    if (game === 'panda-bubbles') {
      const bubbles = await evaluate(`(async () => {
        PandaBubbles.newGame('browser-bubbles');
        const first = PandaBubbles.getState();
        const signature = first.board.map(row => row.join(',')).join('|') + '/' + first.current + '/' + first.next;
        PandaBubbles.newGame('browser-bubbles');
        const repeated = PandaBubbles.getState();
        const repeatedSignature = repeated.board.map(row => row.join(',')).join('|') + '/' + repeated.current + '/' + repeated.next;
        const canvas = document.querySelector('#game-canvas');
        const accessibleState = {
          queue: document.querySelector('#current-name').textContent.length > 0 && document.querySelector('#next-name').textContent.length > 0,
          board: /Reihe 1:.*Spalte 1/.test(document.querySelector('#board-description').textContent),
          describedBy: (canvas.getAttribute('aria-describedby') || '').includes('board-description')
        };
        canvas.focus();
        PandaBubbles.setAim(0);
        const left = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
        canvas.dispatchEvent(left);
        const keyboardAim = PandaBubbles.getState().aim;
        const keyboardAimAccessible = /links/.test(canvas.getAttribute('aria-label') || '');
        PandaBubbles.setAim(1.15);
        const bankPath = PandaBubbles.getAimPath();
        const beforeSwap = PandaBubbles.getState();
        const namesBeforeSwap = {
          current: document.querySelector('#current-name').textContent,
          next: document.querySelector('#next-name').textContent
        };
        const swapped = PandaBubbles.swap();
        const afterSwap = PandaBubbles.getState();
        const swapNamesUpdated = document.querySelector('#current-name').textContent === namesBeforeSwap.next &&
          document.querySelector('#next-name').textContent === namesBeforeSwap.current;

        PandaBubbles.newGame('browser-bubbles-shot');
        PandaBubbles.setAim(0);
        canvas.focus();
        const shotKey = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
        canvas.dispatchEvent(shotKey);
        for (let i = 0; i < 50 && PandaBubbles.getState().projectile; i++) await new Promise(resolve => setTimeout(resolve, 60));
        const afterKeyboardShot = PandaBubbles.getState();
        for (let i = 0; i < 40 && PandaBubbles.getState().inputLocked; i++) await new Promise(resolve => setTimeout(resolve, 20));
        const keyboardFeedbackSettled = !PandaBubbles.getState().inputLocked && PandaBubbles.getState().visualPhase === 'idle';

        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 71, pointerType: 'touch', isPrimary: true, button: 0,
          clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height * .25,
          bubbles: true, cancelable: true
        }));
        for (let i = 0; i < 50 && PandaBubbles.getState().projectile; i++) await new Promise(resolve => setTimeout(resolve, 60));
        const afterPointerShot = PandaBubbles.getState();

        PandaBubbles.newGame('pressure-ui-0');
        const pressureAngles = [-1.1, -.55, 0, .55, 1.1];
        let pressureSequenceValid = true;
        for (let index = 0; index < pressureAngles.length; index++) {
          PandaBubbles.setAim(pressureAngles[index]);
          if (!PandaBubbles.shoot()) { pressureSequenceValid = false; break; }
          for (let frame = 0; frame < 80 && PandaBubbles.getState().projectile; frame++) await new Promise(resolve => setTimeout(resolve, 25));
          if (index < pressureAngles.length - 1) {
            for (let frame = 0; frame < 40 && PandaBubbles.getState().inputLocked; frame++) await new Promise(resolve => setTimeout(resolve, 20));
          }
        }
        const pressureStart = PandaBubbles.getState();
        const pressureLocked = pressureSequenceValid && pressureStart.visualPhase === 'pressure' && pressureStart.inputLocked &&
          pressureStart.boardShift?.offset < -1 && !PandaBubbles.shoot() && PandaBubbles.getState().shots === 5;
        await new Promise(resolve => setTimeout(resolve, 700));
        const pressureEnd = PandaBubbles.getState();
        const pressureAnimated = pressureLocked && pressureEnd.visualPhase === 'idle' && !pressureEnd.inputLocked &&
          pressureEnd.boardShift === null && pressureEnd.topParity === 1 && pressureEnd.misses === 5;

        PandaBubbles.newGame('pop-0');
        const bubblesBeforePop = PandaBubbles.getState().board.flat().filter(Boolean).length;
        PandaBubbles.setAim(-1);
        PandaBubbles.shoot();
        for (let i = 0; i < 80 && PandaBubbles.getState().projectile; i++) await new Promise(resolve => setTimeout(resolve, 35));
        const burstState = PandaBubbles.getState();
        const burstAnimated = burstState.particles > 0 && burstState.popping > 0 && burstState.power > 0 && burstState.board.flat().filter(Boolean).length < bubblesBeforePop;
        const feedbackLocked = burstState.inputLocked && !PandaBubbles.shoot() && PandaBubbles.getState().shots === burstState.shots;

        const pause = document.querySelector('#pause-btn');
        pause.focus();
        pause.click();
        await new Promise(resolve => setTimeout(resolve, 30));
        const pausedClock = PandaBubbles.getState().effectClock;
        const pausedPhase = PandaBubbles.getState().visualPhase;
        await new Promise(resolve => setTimeout(resolve, 150));
        const pauseReport = {
          paused: PandaBubbles.getState().status === 'paused',
          focused: document.activeElement?.id === 'resume-btn',
          controlsInert: document.querySelector('.control-card').inert,
          effectsFrozen: PandaBubbles.getState().effectClock === pausedClock && PandaBubbles.getState().visualPhase === pausedPhase
        };
        document.querySelector('#resume-btn').click();
        await new Promise(resolve => setTimeout(resolve, 30));
        pauseReport.resumed = PandaBubbles.getState().status === 'playing';
        pauseReport.controlsRestored = !document.querySelector('.control-card').inert;
        pauseReport.canvasFocused = document.activeElement === canvas;
        await new Promise(resolve => setTimeout(resolve, 900));
        const settledEffects = PandaBubbles.getState();
        const burstSettled = settledEffects.particles === 0 && settledEffects.popping === 0 && !settledEffects.inputLocked;

        const soundButton = document.querySelector('#sound-btn');
        if (!PandaBubbles.getState().sound) soundButton.click();
        soundButton.click();
        const muted = PandaBubbles.getState();
        soundButton.click();
        const audioMute = !muted.sound && muted.audioMuted && PandaBubbles.getState().sound;

        const controlsTallEnough = [...document.querySelectorAll('.queue button, .controls button')]
          .every(button => button.getBoundingClientRect().height >= 44);
        return {
          deterministic: signature === repeatedSignature,
          rows: first.board.map(row => row.length),
          colors: new Set(first.board.flat()).size,
          keyboardAim: left.defaultPrevented && keyboardAim < 0 && keyboardAimAccessible,
          bankPreview: bankPath.length > 5 && bankPath.some(point => point.banked) && bankPath.at(-1)?.hit === 'bubble',
          swap: swapped && afterSwap.current === beforeSwap.next && afterSwap.next === beforeSwap.current && swapNamesUpdated,
          accessibleState,
          audioMute,
          keyboardShot: shotKey.defaultPrevented && afterKeyboardShot.shots === 1 && !afterKeyboardShot.projectile && afterKeyboardShot.status === 'playing' && keyboardFeedbackSettled,
          pointerShot: afterPointerShot.shots === 2 && !afterPointerShot.projectile && afterPointerShot.status === 'playing',
          pressureAnimated,
          burstAnimated,
          feedbackLocked,
          burstSettled,
          pauseReport,
          controlsTallEnough,
          canvasRole: canvas.getAttribute('role'),
          canvasTabbable: canvas.tabIndex === 0
        };
      })()`);
      const motionBeforeReduction = await evaluate(`(async () => {
        PandaBubbles.newGame('pop-0');
        PandaBubbles.setAim(-1);
        PandaBubbles.shoot();
        for (let i = 0; i < 80 && PandaBubbles.getState().projectile; i++) await new Promise(resolve => setTimeout(resolve, 30));
        const state = PandaBubbles.getState();
        return { effects: state.particles + state.popping + state.ripples, locked: state.inputLocked };
      })()`);
      await cdp.send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await delay(80);
      const motionAfterReduction = await evaluate(`(() => {
        const state = PandaBubbles.getState();
        return {
          effects: state.particles + state.falling + state.popping + state.snaps + state.ripples,
          settled: state.visualPhase === 'idle' && !state.inputLocked
        };
      })()`);
      await cdp.send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      await delay(40);
      assert(bubbles.deterministic, 'panda-bubbles: seeded board/queue is not deterministic');
      assert(JSON.stringify(bubbles.rows) === JSON.stringify([10, 9, 10, 9, 10, 9]) && bubbles.colors >= 4, `panda-bubbles: initial field is malformed ${JSON.stringify(bubbles)}`);
      assert(bubbles.keyboardAim && bubbles.bankPreview && bubbles.swap, `panda-bubbles: aim/bank/swap controls failed ${JSON.stringify(bubbles)}`);
      assert(Object.values(bubbles.accessibleState).every(Boolean), `panda-bubbles: nonvisual board/queue state is incomplete ${JSON.stringify(bubbles.accessibleState)}`);
      assert(bubbles.audioMute, 'panda-bubbles: mute did not silence the shared audio bus immediately');
      assert(bubbles.keyboardShot && bubbles.pointerShot, `panda-bubbles: keyboard/touch shot did not settle ${JSON.stringify(bubbles)}`);
      assert(bubbles.pressureAnimated, `panda-bubbles: pressure row did not animate and lock cleanly ${JSON.stringify(bubbles)}`);
      assert(bubbles.burstAnimated && bubbles.feedbackLocked && bubbles.burstSettled, `panda-bubbles: pop animation/phase lock failed ${JSON.stringify(bubbles)}`);
      assert(motionBeforeReduction.effects > 0 && motionBeforeReduction.locked && motionAfterReduction.effects === 0 && motionAfterReduction.settled,
        `panda-bubbles: runtime reduced-motion cleanup failed ${JSON.stringify({ motionBeforeReduction, motionAfterReduction })}`);
      assert(Object.values(bubbles.pauseReport).every(Boolean), `panda-bubbles: pause focus/inert contract failed ${JSON.stringify(bubbles.pauseReport)}`);
      assert(bubbles.controlsTallEnough && bubbles.canvasRole === 'application' && bubbles.canvasTabbable, 'panda-bubbles: accessible controls/canvas contract failed');
    }

    if (game === 'des-pandas-juwelen') {
      await cdp.send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await delay(40);
      const jewels = await evaluate(`(async () => {
        PandaJewels.newGame('browser-check');
        const initial = PandaJewels.getState();
        const signature = JewelsLogic.boardSignature(initial.board);
        PandaJewels.newGame('browser-check');
        const deterministic = signature === JewelsLogic.boardSignature(PandaJewels.getState().board);
        const roving = document.querySelectorAll('#board .cell[tabindex="0"]').length;
        const firstCell = document.querySelector('#board .cell');
        firstCell.focus();
        const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
        firstCell.dispatchEvent(arrow);
        const keyboardMoved = arrow.defaultPrevented && document.activeElement?.dataset.index === '1';
        const selectKey = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
        document.activeElement.dispatchEvent(selectKey);
        const keyboardSelected = selectKey.defaultPrevented && PandaJewels.getState().selected?.col === 1;
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        const escapeCleared = PandaJewels.getState().selected === null;
        const hint = PandaJewels.hint();
        const hinted = document.querySelectorAll('#board .cell.hinted').length;

        let state = PandaJewels.getState();
        let invalidPair = null;
        for (let row = 0; row < 8 && !invalidPair; row++) for (let col = 0; col < 8 && !invalidPair; col++) {
          const from = { row, col };
          for (const to of [{ row, col: col + 1 }, { row: row + 1, col }]) {
            if (JewelsLogic.inBounds(state.board, to) && !JewelsLogic.isProductiveSwap(state.board, from, to, false)) { invalidPair = { from, to }; break; }
          }
        }
        const movesBeforeInvalid = state.moves;
        const pendingInvalid = PandaJewels.swap(invalidPair.from, invalidPair.to);
        await Promise.resolve();
        const validDuringInvalid = JewelsLogic.findValidMoves(state.board)[0];
        const reenteredInvalidAnimation = await PandaJewels.swap(validDuringInvalid.from, validDuringInvalid.to);
        const invalidAccepted = await pendingInvalid;
        const invalidSafe = !invalidAccepted && !reenteredInvalidAnimation && PandaJewels.getState().moves === movesBeforeInvalid &&
          PandaJewels.getState().status === 'playing' && document.querySelectorAll('#board .cell.invalid').length === 0;

        state = PandaJewels.getState();
        const swipeMove = JewelsLogic.findValidMoves(state.board)[0];
        const swipeIndex = swipeMove.from.row * 8 + swipeMove.from.col;
        const swipeCell = document.querySelectorAll('#board .cell')[swipeIndex];
        const swipeRect = swipeCell.getBoundingClientRect();
        const dx = (swipeMove.to.col - swipeMove.from.col) * swipeRect.width * .55;
        const dy = (swipeMove.to.row - swipeMove.from.row) * swipeRect.height * .55;
        const turnsBeforeSwipe = state.turns;
        swipeCell.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 81, pointerType: 'touch', isPrimary: true, button: 0, clientX: swipeRect.left + swipeRect.width / 2, clientY: swipeRect.top + swipeRect.height / 2, bubbles: true, cancelable: true }));
        swipeCell.dispatchEvent(new PointerEvent('pointerup', { pointerId: 81, pointerType: 'touch', isPrimary: true, button: 0, clientX: swipeRect.left + swipeRect.width / 2 + dx, clientY: swipeRect.top + swipeRect.height / 2 + dy, bubbles: true, cancelable: true }));
        for (let i = 0; i < 80 && (PandaJewels.getState().status === 'resolving' || PandaJewels.getState().turns === turnsBeforeSwipe); i++) await new Promise(resolve => setTimeout(resolve, 20));
        const swipeWorked = PandaJewels.getState().turns === turnsBeforeSwipe + 1;

        for (let i = 0; i < 8 && PandaJewels.getState().charge < 5 && PandaJewels.getState().status === 'playing'; i++) {
          const current = PandaJewels.getState();
          const move = JewelsLogic.findValidMoves(current.board)[0];
          await PandaJewels.swap(move.from, move.to);
        }
        const charged = PandaJewels.getState();
        let remote = null;
        let invalidRemote = null;
        if (charged.status === 'playing' && charged.charge >= 5) {
          const positions = charged.board.flatMap((row, rowIndex) => row.map((_gem, colIndex) => ({ row: rowIndex, col: colIndex })));
          outer: for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
            if (!JewelsLogic.isAdjacent(positions[i], positions[j])) {
              if (!remote && JewelsLogic.isProductiveSwap(charged.board, positions[i], positions[j], true)) remote = { from: positions[i], to: positions[j] };
              if (!invalidRemote && !JewelsLogic.isProductiveSwap(charged.board, positions[i], positions[j], true)) invalidRemote = { from: positions[i], to: positions[j] };
              if (remote && invalidRemote) break outer;
            }
          }
        }
        const remoteMovesBefore = charged.moves;
        const activated = remote && invalidRemote ? PandaJewels.activatePower() : false;
        const invalidRemoteAccepted = activated ? await PandaJewels.swap(invalidRemote.from, invalidRemote.to) : true;
        const afterInvalidRemote = PandaJewels.getState();
        const invalidRemotePreserved = !invalidRemoteAccepted && afterInvalidRemote.charge === 5 && afterInvalidRemote.powerMode && afterInvalidRemote.moves === remoteMovesBefore;
        const remoteWorked = remote && invalidRemotePreserved ? await PandaJewels.swap(remote.from, remote.to) : false;
        const final = PandaJewels.getState();
        const soundButton = document.querySelector('#sound-btn');
        if (!PandaJewels.getState().sound) soundButton.click();
        soundButton.click();
        const muted = PandaJewels.getState();
        soundButton.click();
        const audioMute = !muted.sound && muted.audioMuted && PandaJewels.getState().sound;

        async function playRound(seed) {
          PandaJewels.newGame(seed);
          for (let turn = 0; turn < 30 && PandaJewels.getState().status === 'playing'; turn++) {
            const roundState = PandaJewels.getState();
            const move = JewelsLogic.findValidMoves(roundState.board)[0];
            await PandaJewels.swap(move.from, move.to);
          }
          const ended = PandaJewels.getState();
          return {
            status: ended.status,
            moves: ended.moves,
            score: ended.score,
            target: ended.target,
            boardEmpty: ended.board.flat().every(gem => !gem),
            resultVisible: !document.querySelector('#result').hidden,
            bannerVisible: !document.querySelector('#level-banner').hidden,
            comboHidden: document.querySelector('#combo-pop').hidden,
            transientCells: document.querySelectorAll('#board .clearing, #board .falling, #board .swapping, #board .invalid, #board .victory').length,
            terminalMessage: /Runde (geschafft|beendet)/.test(document.querySelector('#message').textContent)
          };
        }
        const lossBranch = await playRound('outcome-0');
        const winBranch = await playRound('outcome-5');

        const controlsTallEnough = [...document.querySelectorAll('.panda-power button, .controls button')].every(button => button.getBoundingClientRect().height >= 44);
        const smallestCell = Math.min(...[...document.querySelectorAll('#board .cell')].map(cell => cell.getBoundingClientRect().width));
        const gridRows = [...document.querySelectorAll('#board > [role="row"]')];
        return {
          deterministic,
          count: initial.board.flat().length,
          matchFree: JewelsLogic.findMatches(initial.board).cells.length === 0,
          playable: JewelsLogic.findValidMoves(initial.board).length > 0,
          roving,
          keyboardMoved,
          keyboardSelected,
          escapeCleared,
          hintValid: !!hint && hinted === 2,
          invalidSafe,
          swipeWorked,
          charged: charged.charge >= 5,
          remoteFound: !!remote && !!invalidRemote,
          invalidRemotePreserved,
          remoteUsed: activated && remoteWorked && final.moves === remoteMovesBefore - 1 && final.charge < 5 && !final.powerMode,
          finalStable: JewelsLogic.findMatches(final.board).cells.length === 0 && JewelsLogic.findValidMoves(final.board).length > 0,
          audioMute,
          lossBranch,
          winBranch,
          controlsTallEnough,
          smallestCell,
          gridStructure: gridRows.length === 8 && gridRows.every(row => row.querySelectorAll(':scope > [role="gridcell"]').length === 8),
          ariaLabels: [...document.querySelectorAll('#board .cell')].every(cell => /Zeile/.test(cell.getAttribute('aria-label') || ''))
        };
      })()`);
      await cdp.send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      await delay(40);
      const comboAnimation = await evaluate(`(async () => {
        PandaJewels.newGame('combo-4');
        const move = JewelsLogic.findValidMoves(PandaJewels.getState().board)[0];
        const turn = PandaJewels.swap(move.from, move.to);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const swapping = [...document.querySelectorAll('#board .cell.swapping')];
        const directionalSwap = swapping.length === 2 && swapping.every(cell => {
          const gem = cell.querySelector('.gem');
          return Math.abs(parseFloat(gem.style.getPropertyValue('--move-x')) || 0) + Math.abs(parseFloat(gem.style.getPropertyValue('--move-y')) || 0) > 1;
        });
        const seen = new Set();
        let selectiveFall = false;
        let maxFallPixels = 0;
        for (let i = 0; i < 140 && PandaJewels.getState().status === 'resolving'; i++) {
          const popup = document.querySelector('#combo-pop');
          if (!popup.hidden) seen.add(popup.textContent);
          const falling = [...document.querySelectorAll('#board .cell.falling')];
          if (falling.length) {
            selectiveFall ||= falling.length < 64;
            maxFallPixels = Math.max(maxFallPixels, ...falling.map(cell => Math.abs(parseFloat(cell.querySelector('.gem').style.getPropertyValue('--fall-y')) || 0)));
          }
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        const accepted = await turn;
        await new Promise(resolve => setTimeout(resolve, 700));
        const cellHeight = document.querySelector('#board .cell').getBoundingClientRect().height;
        return {
          accepted,
          directionalSwap,
          selectiveFall,
          multiCellFall: maxFallPixels > cellHeight,
          seen: [...seen],
          hiddenAfterLatestTimer: document.querySelector('#combo-pop').hidden
        };
      })()`);
      assert(comboAnimation.accepted && comboAnimation.directionalSwap && comboAnimation.selectiveFall && comboAnimation.multiCellFall &&
        comboAnimation.seen.includes('2× Kaskade!') && comboAnimation.seen.includes('3× Kaskade!') && comboAnimation.hiddenAfterLatestTimer,
        `des-pandas-juwelen: combo animation timer race ${JSON.stringify(comboAnimation)}`);
      assert(jewels.deterministic && jewels.count === 64 && jewels.matchFree && jewels.playable, `des-pandas-juwelen: initial board contract failed ${JSON.stringify(jewels)}`);
      assert(jewels.roving === 1 && jewels.keyboardMoved && jewels.keyboardSelected && jewels.escapeCleared && jewels.hintValid, `des-pandas-juwelen: keyboard/hint contract failed ${JSON.stringify(jewels)}`);
      assert(jewels.invalidSafe && jewels.swipeWorked, `des-pandas-juwelen: invalid/touch swap contract failed ${JSON.stringify(jewels)}`);
      assert(jewels.charged && jewels.remoteFound && jewels.invalidRemotePreserved && jewels.remoteUsed, `des-pandas-juwelen: Panda-Pfote remote swap failed ${JSON.stringify(jewels)}`);
      assert(jewels.audioMute, 'des-pandas-juwelen: mute did not silence the shared audio bus immediately');
      assert(jewels.lossBranch.status === 'lost' && jewels.lossBranch.moves === 0 && jewels.lossBranch.score < jewels.lossBranch.target &&
        jewels.lossBranch.resultVisible && jewels.lossBranch.comboHidden && jewels.lossBranch.transientCells === 0 && jewels.lossBranch.terminalMessage &&
        jewels.winBranch.status === 'won' && jewels.winBranch.score >= jewels.winBranch.target && jewels.winBranch.boardEmpty &&
        jewels.winBranch.resultVisible && jewels.winBranch.bannerVisible && jewels.winBranch.comboHidden && jewels.winBranch.transientCells === 0 && jewels.winBranch.terminalMessage,
        `des-pandas-juwelen: terminal win/loss branches failed ${JSON.stringify({ loss: jewels.lossBranch, win: jewels.winBranch })}`);
      assert(jewels.finalStable && jewels.controlsTallEnough && jewels.smallestCell >= 36 && jewels.gridStructure && jewels.ariaLabels, `des-pandas-juwelen: stable/responsive/a11y contract failed ${JSON.stringify(jewels)}`);
    }

    if (game === 'pandadoku') {
      const roving = await evaluate(`document.querySelectorAll('#board .cell[tabindex="0"]').length`);
      assert(roving === 1, 'pandadoku: grid must have exactly one tab stop');
      const resultEnter = await evaluate(`(() => {
        const before = PandaDoku.getState().puzzle.join('');
        const dialog = document.getElementById('result');
        const close = document.getElementById('result-close-btn');
        dialog.hidden = false;
        close.focus();
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        close.dispatchEvent(event);
        const unchanged = PandaDoku.getState().puzzle.join('') === before;
        dialog.hidden = true;
        return { nativeEnter: !event.defaultPrevented, unchanged };
      })()`);
      assert(resultEnter.nativeEnter && resultEnter.unchanged, 'pandadoku: Enter on result Close is hijacked as New Game');
      const pauseFocus = await evaluate(`(async () => {
        const pause = document.querySelector('#pause-btn');
        pause.focus();
        pause.click();
        const focusedImmediately = document.activeElement?.id === 'resume-btn';
        await new Promise(resolve => setTimeout(resolve, 0));
        const sideInertWhileOpen = document.querySelector('.side').inert;
        document.querySelector('#resume-btn').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        return {
          focusedImmediately,
          sideInertWhileOpen,
          focusRestored: document.activeElement?.id === 'pause-btn',
          sideRestored: !document.querySelector('.side').inert
        };
      })()`);
      assert(Object.values(pauseFocus).every(Boolean), `pandadoku: pause dialog focus/inert failure ${JSON.stringify(pauseFocus)}`);
      const generationRaceSafe = await evaluate(`(async () => {
        const before = PandaDoku.getState().puzzle.join('');
        PandaDoku.newGame();
        PandaDoku.restart();
        await new Promise(resolve => setTimeout(resolve, 60));
        const after = PandaDoku.getState();
        return after.puzzle.join('') === before && after.board.join('') === before;
      })()`);
      assert(generationRaceSafe, 'pandadoku: pending generation overwrote a restart');
      const uniquePuzzle = await evaluate(`(() => {
        const puzzle = PandaDoku.getState().puzzle;
        return Array.isArray(puzzle) && PandaDoku.countSolutions(puzzle.slice(), 2) === 1;
      })()`);
      assert(uniquePuzzle, 'pandadoku: generated puzzle is not uniquely solvable');
      const persistedSetup = await evaluate(`(async () => {
        const beforeMs = PandaDoku.getState().elapsedMs;
        for (let i = 0; i < 8; i++) {
          await new Promise(resolve => setTimeout(resolve, 125));
          PandaDoku.togglePause();
          PandaDoku.togglePause();
        }
        const afterMs = PandaDoku.getState().elapsedMs;
        const state = PandaDoku.getState();
        const editable = state.givens.map((given, index) => given ? -1 : index).filter(index => index >= 0);
        const valueCell = editable[0], noteCell = editable[1];
        PandaDoku.selectCell(valueCell);
        const wrong = state.solution[valueCell] === 9 ? 8 : 9;
        PandaDoku.enterNumber(wrong);
        PandaDoku.selectCell(noteCell);
        PandaDoku.toggleNotes();
        PandaDoku.enterNumber(3);
        PandaDoku.togglePause();
        PandaDoku.save();
        const saved = JSON.parse(localStorage.getItem('pandadoku-save-v1'));
        return {
          timerDelta: afterMs - beforeMs,
          puzzle: state.puzzle.join(''),
          valueCell, value: wrong, noteCell,
          historyLength: PandaDoku.getState().historyLength,
          savedStatus: saved && saved.status,
          savedElapsed: saved && saved.elapsedMs
        };
      })()`);
      assert(persistedSetup.timerDelta >= 850, `pandadoku: repeated pauses lost sub-second time (${persistedSetup.timerDelta}ms)`);
      assert(persistedSetup.savedStatus === 'paused' && persistedSetup.savedElapsed > 0 && persistedSetup.historyLength >= 2, 'pandadoku: paused progress/history was not saved');
      await navigate('pandadoku/index.html');
      const restored = await evaluate(`(() => {
        const state = PandaDoku.getState();
        const note = state.notes[${persistedSetup.noteCell}];
        const report = {
          samePuzzle: state.puzzle.join('') === ${JSON.stringify(persistedSetup.puzzle)},
          value: state.board[${persistedSetup.valueCell}],
          noteRestored: note.includes(3),
          paused: state.status === 'paused' && state.elapsedMs >= ${persistedSetup.savedElapsed},
          historyRestored: state.historyLength >= 2,
          focusInPause: document.querySelector('#pause-overlay').contains(document.activeElement)
        };
        PandaDoku.togglePause();
        return report;
      })()`);
      assert(restored.samePuzzle && restored.value === persistedSetup.value && restored.noteRestored && restored.paused && restored.historyRestored && restored.focusInPause, `pandadoku: reload persistence failed ${JSON.stringify(restored)}`);
      await evaluate(`localStorage.setItem('pandadoku-save-v1', JSON.stringify({ version: 1, difficulty: 'mittel', puzzle: Array(81).fill(0), solution: Array(81).fill(1), board: Array(81).fill(9), notes: [], errors: [] }))`);
      await navigate('pandadoku/index.html');
      const corruptRejected = await evaluate(`(() => {
        const state = PandaDoku.getState();
        return state.status === 'playing' && state.puzzle.some(Boolean) && PandaDoku.countSolutions(state.puzzle, 2) === 1;
      })()`);
      assert(corruptRejected, 'pandadoku: corrupt persisted puzzle was not rejected safely');
    }

    if (game === 'pandakreuzwort') {
      const crossword = await evaluate(`(async () => {
        const initial = Pandakreuzwort.getState();
        const tabStops = document.querySelectorAll('#board .cell[tabindex="0"]').length;
        const languages = [...document.querySelectorAll('#lang-select option')].map(option => option.value);
        const difficulties = [...document.querySelectorAll('.diff button')].map(button => button.id);
        const clueCount = document.querySelectorAll('.clue-btn').length;
        Pandakreuzwort.restart();
        const restarted = Pandakreuzwort.getState();
        Pandakreuzwort.newGame('smoke-first');
        Pandakreuzwort.newGame('smoke-final');
        await new Promise(resolve => setTimeout(resolve, 500));
        const raced = Pandakreuzwort.getState();
        const committedSeed = Pandakreuzwort.getPuzzle().seed;
        Pandakreuzwort.newGame('pending-then-restart');
        Pandakreuzwort.restart();
        await new Promise(resolve => setTimeout(resolve, 100));
        const restartedPending = { stateSeed: Pandakreuzwort.getState().seed, puzzleSeed: Pandakreuzwort.getPuzzle().seed };
        Pandakreuzwort.setLanguage('bar');
        await new Promise(resolve => setTimeout(resolve, 500));
        const bavarian = Pandakreuzwort.getState();
        const bavarianMetadata = document.querySelectorAll('.clue-btn .meta').length === bavarian.wordCount;
        Pandakreuzwort.setDifficulty('experte');
        await new Promise(resolve => setTimeout(resolve, 750));
        const expert = Pandakreuzwort.getState();
        const block = document.querySelector('#board .cell.block');
        const inputSlots = Pandakreuzwort.parseWordDraft('A·C', 4);
        const wordField = document.getElementById('word-input');
        wordField.focus();
        wordField.select();
        document.execCommand('insertText', false, 'A');
        const firstTyped = { value: wordField.value, caret: wordField.selectionStart, filled: Object.keys(Pandakreuzwort.getBoard()).length };
        document.execCommand('insertText', false, 'B');
        const secondTyped = { value: wordField.value, caret: wordField.selectionStart, filled: Object.keys(Pandakreuzwort.getBoard()).length };
        wordField.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
        wordField.value = 'Ä';
        wordField.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Ä', inputType: 'insertCompositionText', isComposing: true }));
        const duringComposition = Object.keys(Pandakreuzwort.getBoard()).length;
        wordField.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'Ä' }));
        const afterComposition = { value: wordField.value, filled: Object.keys(Pandakreuzwort.getBoard()).length, letters: Object.values(Pandakreuzwort.getBoard()).join('') };
        const letterWidths = [...document.querySelectorAll('#board .cell:not(.block)')].map(cell => cell.getBoundingClientRect().width);
        return {
          initial,
          tabStops,
          languages,
          difficulties,
          clueCount,
          restartKeptSeed: restarted.seed === initial.seed,
          restartKeptShape: restarted.rows === initial.rows && restarted.cols === initial.cols,
          raceKeptLastSeed: raced.seed === 'smoke-final',
          racePlayable: raced.status === 'playing' && raced.wordCount > 0,
          pendingRestartConsistent: restartedPending.stateSeed === committedSeed && restartedPending.puzzleSeed === committedSeed,
          bavarianPlayable: bavarian.language === 'bar' && bavarian.status === 'playing' && bavarian.wordCount > 0,
          bavarianMetadata,
          expertPlayable: expert.difficulty === 'experte' && expert.status === 'playing' && expert.wordCount >= 19,
          qualityPassed: expert.metrics && expert.metrics.density >= 0.27 && expert.metrics.directionBalance >= 0.28,
          datasetSize: expert.datasetSize,
          blockVisible: !!block && getComputedStyle(block).backgroundColor !== 'rgba(0, 0, 0, 0)',
          slotsPreserved: inputSlots.length === 4 && inputSlots[0] === 'A' && inputSlots[1] === null && inputSlots[2] === 'C' && inputSlots[3] === null,
          naturalTyping: firstTyped.value === 'A' && firstTyped.caret === 1 && firstTyped.filled === 1 && secondTyped.value === 'AB' && secondTyped.caret === 2 && secondTyped.filled === 2,
          imeSafe: duringComposition === 2 && afterComposition.value === 'Ä' && afterComposition.filled === 2 && afterComposition.letters === 'AE',
          imeDetails: { duringComposition, afterComposition },
          minimumCellWidth: letterWidths.length ? Math.min(...letterWidths) : 0,
          boardScrollable: document.getElementById('board-scroll').scrollWidth > document.getElementById('board-scroll').clientWidth,
          finalTabStops: document.querySelectorAll('#board .cell[tabindex="0"]').length
        };
      })()`);
      assert(crossword.initial.status === 'playing', 'pandakreuzwort: game did not boot');
      assert(crossword.initial.wordCount >= 6, 'pandakreuzwort: generated too few words');
      assert(crossword.initial.rows > 0 && crossword.initial.cols > 0, 'pandakreuzwort: generated an empty grid');
      assert(crossword.tabStops === 1 && crossword.finalTabStops === 1, 'pandakreuzwort: grid must have exactly one tab stop');
      assert(crossword.languages.join(',') === 'de,bar', 'pandakreuzwort: language choices are incomplete');
      assert(crossword.difficulties.join(',') === 'diff-leicht,diff-mittel,diff-schwer,diff-experte', 'pandakreuzwort: difficulty choices are incomplete');
      assert(crossword.clueCount === crossword.initial.wordCount, 'pandakreuzwort: clue count does not match word count');
      assert(crossword.restartKeptSeed && crossword.restartKeptShape, 'pandakreuzwort: restart changed the puzzle');
      assert(crossword.raceKeptLastSeed && crossword.racePlayable, 'pandakreuzwort: generation race did not keep the latest request');
      assert(crossword.pendingRestartConsistent, 'pandakreuzwort: restart during pending generation mixed seed and puzzle');
      assert(crossword.bavarianPlayable && crossword.bavarianMetadata, 'pandakreuzwort: Bairisch mode or clue metadata is incomplete');
      assert(crossword.expertPlayable && crossword.qualityPassed, 'pandakreuzwort: Experte mode did not meet its layout contract');
      assert(crossword.datasetSize >= 650, `pandakreuzwort: expanded word bank missing (${crossword.datasetSize})`);
      assert(crossword.blockVisible, 'pandakreuzwort: blocked cells are not visibly rendered');
      assert(crossword.slotsPreserved, 'pandakreuzwort: positional word-input blanks are not preserved');
      assert(crossword.naturalTyping && crossword.imeSafe, `pandakreuzwort: mobile word input disrupts cursor/IME ${JSON.stringify(crossword)}`);
      assert(crossword.minimumCellWidth >= 28 || crossword.boardScrollable, `pandakreuzwort: mobile cells are too small (${crossword.minimumCellWidth}px)`);

      // Bestehende v1.5-Speicherstände werden mit der eingefrorenen damaligen
      // Wortbank rekonstruiert, statt durch die v1.6-Erweiterung zu verschwinden.
      // Vom Launcher aus schreiben, damit pagehide des laufenden Spiels die
      // Fixture nicht unmittelbar wieder überschreibt.
      await navigate('index.html');
      await evaluate(`localStorage.setItem('pandakreuzwort-save-v3', JSON.stringify({
        saveVersion: 3,
        seed: 'v1.5-save-fixture', language: 'de', difficulty: 'mittel',
        datasetVersion: '2026-08-v1.5', generatorVersion: 3,
        board: { '10,6': 'J' }, errors: {}, hinted: { '10,6': true }, selected: { r: 10, c: 6 }, direction: 'across',
        hintsLeft: 2, hintsUsed: 1, mistakes: 0, status: 'playing', elapsed: 17
      }))`);
      await navigate('pandakreuzwort/index.html');
      const legacySave = await evaluate(`(() => ({ state: Pandakreuzwort.getState(), puzzle: Pandakreuzwort.getPuzzle(), board: Pandakreuzwort.getBoard() }))()`);
      assert(legacySave.state.seed === 'v1.5-save-fixture' && legacySave.puzzle.seed === 'v1.5-save-fixture' && legacySave.puzzle.datasetVersion === '2026-08-v1.5', `pandakreuzwort: v1.5 save was not preserved ${JSON.stringify(legacySave.state)}`);
      assert(legacySave.board['10,6'] === 'J' && legacySave.state.hintsLeft === 2 && legacySave.state.hintsUsed === 1 && legacySave.state.selected.r === 10 && legacySave.state.selected.c === 6, 'pandakreuzwort: v1.5 board/hint/focus progress was reset');
      assert(legacySave.state.elapsed >= 17 && legacySave.state.elapsed < 21, 'pandakreuzwort: v1.5 save timer was reset');

      // Regression: Jede Eingabe wird persistiert (Debounce + pagehide) und
      // überlebt einen Neuladen; der Won-Status + eingefrorene Zeit werden restauriert.
      await evaluate(`Pandakreuzwort.newGame('persist-seed')`);
      await delay(400);
      const persist = await evaluate(`(() => {
        // Erste wählbare Zelle ansteuern und einen Buchstaben tippen.
        const cell = document.querySelector('#board .cell[tabindex="0"]') || document.querySelector('#board .cell');
        if (!cell) return { ok: false, reason: 'no cell' };
        cell.click();
        const key = cell.dataset.r + ',' + cell.dataset.c;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }));
        return { ok: true, key, letter: Pandakreuzwort.getBoard()[key] || '' };
      })()`);
      assert(persist.ok, 'pandakreuzwort: cell should be focusable for input');
      await delay(450); // Entprell-Timer (300 ms) abwarten
      const saved = await evaluate(`JSON.parse(localStorage.getItem('pandakreuzwort-save-v3') || 'null')`);
      assert(saved && saved.board[persist.key] === persist.letter, 'pandakreuzwort: typed letter was persisted to storage');
      assert(!('cells' in saved) && !('placements' in saved), 'pandakreuzwort: save must not trust/persist derived grid structures');

      // Won-Status + Timer restaurieren: Das Rätsel durch korrektes Ausfüllen
      // wirklich lösen (setzt den In-Memory-Zustand 'won', den pagehide dann
      // konsistent persistiert), neu laden und Status + eingefrorene Zeit prüfen.
      await evaluate(`(async () => {
        Pandakreuzwort.newGame('won-seed');
        await new Promise(r => setTimeout(r, 500));
        const solution = {};
        const puzzle = Pandakreuzwort.getPuzzle();
        for (const k in puzzle.cells) solution[k] = puzzle.cells[k].letter;
        const cells = [...document.querySelectorAll('#board .cell[role="gridcell"]')];
        for (const btn of cells) {
          const key = btn.dataset.r + ',' + btn.dataset.c;
          btn.click();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: solution[key], bubbles: true }));
        }
      })()`);
      const wonBefore = await evaluate(`Pandakreuzwort.getState()`);
      assert(wonBefore.status === 'won', `pandakreuzwort: filling all cells should win (got ${wonBefore.status})`);
      const elapsedAtWin = wonBefore.elapsed;
      await navigate('pandakreuzwort/index.html');
      const wonState = await evaluate(`Pandakreuzwort.getState()`);
      assert(wonState.status === 'won', `pandakreuzwort: won status not restored after reload (got ${wonState.status})`);
      assert(wonState.elapsed === elapsedAtWin, `pandakreuzwort: frozen timer not restored after reload (got ${wonState.elapsed}, won at ${elapsedAtWin})`);
      await delay(1300); // darf nicht weiterzählen
      const wonElapsedLater = await evaluate(`Pandakreuzwort.getState().elapsed`);
      assert(wonElapsedLater === elapsedAtWin, `pandakreuzwort: won timer advanced while frozen (got ${wonElapsedLater})`);
    }

    if (game === 'pandataire') {
      const report = await evaluate(`(() => {
        function deckUnique() {
          const s = Pandataire.getState();
          const deck = [...s.cards, ...s.stock, ...s.waste];
          return deck.length === 52 && new Set(deck.map(c => c.rank + ':' + c.suit)).size === 52;
        }
        function dealKeys() {
          const s = Pandataire.getState();
          return JSON.stringify({ c: s.cards, s: s.stock, w: s.waste });
        }
        const modes = ['tripeaks', 'golf', 'pyramid'];
        const perMode = {};
        for (const m of modes) {
          Pandataire.newGame(m, 24680);
          const before = dealKeys();
          Pandataire.restart();
          const after = dealKeys();
          const st = Pandataire.getState();
          const covered = [...document.querySelectorAll('#tableau .card.covered')];
          perMode[m] = {
            mode: Pandataire.getMode(),
            deckUnique: deckUnique(),
            deterministic: before === after,
            cardCount: st.cards.length,
            stockCount: st.stock.length,
            status: st.status,
            selectionSemantics: [...document.querySelectorAll('#tableau .card')].some(card => card.hasAttribute('aria-pressed')) === (m === 'pyramid'),
            hiddenInformationSafe: m !== 'tripeaks' || (covered.length > 0 && covered.every(card => card.textContent.trim() === '' && /verdeckte/i.test(card.getAttribute('aria-label') || '')))
          };
        }
        // Tastatur: Moduswechsel über 1/2/3 und ein Zug (Ziehen).
        Pandataire.newGame('tripeaks', 1);
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
        const k2 = Pandataire.getMode();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
        const k3 = Pandataire.getMode();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
        const k1 = Pandataire.getMode();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
        const movesAfterDraw = Pandataire.getState().moves;
        // Pyramid: Auswahlmechanik (deterministisch) + König/Paar falls vorhanden.
        Pandataire.newGame('pyramid', 5);
        const freeBtns = [...document.querySelectorAll('#tableau .card:not(:disabled)')];
        const freeState = Pandataire.getState();
        const pickCard = freeBtns.find(b => freeState.cards[Number(b.dataset.id)].rank !== 13);
        let selectionWorks = false, deselectWorks = false;
        if (pickCard) {
          pickCard.click();
          selectionWorks = Pandataire.getState().selectedId === Number(pickCard.dataset.id);
          pickCard.click();
          deselectWorks = Pandataire.getState().selectedId === null;
        }
        // Freier König allein entfernbar? (über mehrere Seeds suchen.)
        let kingRemoved = false;
        for (const ks of [5, 6, 7, 8, 9, 10, 11, 12]) {
          Pandataire.newGame('pyramid', ks);
          const st2 = Pandataire.getState();
          const freeKingBtn = [...document.querySelectorAll('#tableau .card:not(:disabled)')]
            .find(b => st2.cards[Number(b.dataset.id)].rank === 13);
          if (freeKingBtn) {
            freeKingBtn.click();
            kingRemoved = Pandataire.getState().cards[Number(freeKingBtn.dataset.id)].removed;
            break;
          }
        }
        return { perMode, keys: { k2, k3, k1 }, movesAfterDraw, selectionWorks, deselectWorks, kingRemoved };
      })()`);
      for (const m of ['tripeaks', 'golf', 'pyramid']) {
        const r = report.perMode[m];
        assert(r.mode === m, `pandataire: mode ${m} did not activate`);
        assert(r.deckUnique, `pandataire: ${m} deal is not 52 unique cards`);
        assert(r.deterministic, `pandataire: ${m} restart is not deterministic`);
        assert(r.status === 'playing', `pandataire: ${m} did not start playing`);
        assert(r.hiddenInformationSafe, `pandataire: ${m} leaks covered card ranks/suits`);
        assert(r.selectionSemantics, `pandataire: ${m} exposes incorrect aria-pressed selection semantics`);
        assert(r.cardCount === (m === 'golf' ? 35 : 28), `pandataire: ${m} tableau size is wrong`);
      }
      assert(report.perMode.tripeaks.stockCount === 23, 'pandataire: TriPeaks stock size wrong');
      assert(report.perMode.golf.stockCount === 16, 'pandataire: Golf stock size wrong');
      assert(report.perMode.pyramid.stockCount === 24, 'pandataire: Pyramid stock size wrong');
      assert(report.keys.k2 === 'golf', 'pandataire: key 2 did not switch to Golf');
      assert(report.keys.k3 === 'pyramid', 'pandataire: key 3 did not switch to Pyramid');
      assert(report.keys.k1 === 'tripeaks', 'pandataire: key 1 did not switch to TriPeaks');
      assert(report.movesAfterDraw >= 1, 'pandataire: draw key did not perform a move');
      assert(report.selectionWorks, 'pandataire: Pyramid card selection did not register');
      assert(report.deselectWorks, 'pandataire: Pyramid card deselect did not clear selection');
      assert(report.kingRemoved, 'pandataire: Pyramid free King was not removable alone');

      // Layout: jeder Modus ohne Überlauf bei 320/375/414 px.
      for (const m of ['tripeaks', 'golf', 'pyramid']) {
        for (const width of [320, 375, 414]) {
          await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: true });
          await evaluate(`Pandataire.setMode('${m}')`);
          await delay(40);
          const layout = await evaluate(`(() => {
            const overflowers = [...document.querySelectorAll('body *')].filter(element => {
              const rect = element.getBoundingClientRect();
              return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
            }).slice(0, 5).map(element => ({
              tag: element.tagName, id: element.id, className: String(element.className || ''),
              left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right)
            }));
            return {
              applied: Pandataire.getMode(),
              bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
              overflowers
            };
          })()`);
          assert(layout.applied === m, `pandataire: ${m} did not apply at ${width}px`);
          assert(!layout.bodyOverflow, `pandataire: ${m} body overflow at ${width}px ${JSON.stringify(layout.overflowers)}`);
          assert(layout.overflowers.length === 0, `pandataire: ${m} element overflow at ${width}px ${JSON.stringify(layout.overflowers)}`);
        }
      }
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
      await evaluate(`Pandataire.setMode('tripeaks')`);
    }

    if (game === 'pandacell') {
      const deterministicDeal = await evaluate(`(() => {
        PandaCell.newGame(12345);
        const first = PandaCell.getState().tableau;
        PandaCell.newGame(12345);
        const second = PandaCell.getState().tableau;
        const ids = second.flat();
        return JSON.stringify(first) === JSON.stringify(second) && ids.length === 52 && new Set(ids).size === 52;
      })()`);
      assert(deterministicDeal, 'pandacell: numbered deal replay is not deterministic and unique');

      // Regression: Doppelklick auf eine vergrabene (nicht oberste) „sichere“ Karte
      // darf sie NICHT auf die Foundation heben (nur freie/oberste Karten sind zugänglich).
      const buriedSafe = await evaluate(`(() => {
        for (let d = 1; d <= 80; d++) {
          PandaCell.newGame(d);
          const st = PandaCell.getState();
          for (let col = 0; col < 8; col++) {
            const column = st.tableau[col];
            for (let i = 0; i < column.length - 1; i++) {
              const id = column[i];
              const btn = document.querySelector('[data-id="' + id + '"]');
              if (!btn) continue;
              const label = btn.getAttribute('aria-label') || '';
              if (!/^A/.test(label)) continue; // vergrabenes Ass (zu Beginn stets „safe“)
              const before = st.foundations.join(',');
              btn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
              const after = PandaCell.getState();
              return {
                found: true, deal: d, col, index: i,
                foundationChanged: after.foundations.join(',') !== before,
                stillBuried: after.tableau[col].includes(id)
              };
            }
          }
        }
        return { found: false };
      })()`);
      assert(buriedSafe.found, 'pandacell: a deal with a buried Ace should exist for the regression');
      assert(!buriedSafe.foundationChanged, `pandacell: buried Ace was illegally auto-foundationed on deal ${buriedSafe.deal}`);
      assert(buriedSafe.stillBuried, `pandacell: buried Ace was removed from its column on deal ${buriedSafe.deal}`);
      const responsiveSelection = await evaluate(`(() => {
        PandaCell.newGame(77);
        const card = document.querySelector('#tableau .column .card:last-child');
        card.click();
        const selectedBefore = !!PandaCell.getState().selected;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        const selectedAfter = PandaCell.getState().selected;
        const table = document.querySelector('#tableau').getBoundingClientRect();
        const columns = [...document.querySelectorAll('#tableau .column')].map(column => column.getBoundingClientRect());
        const lastCardBottom = Math.max(...[...document.querySelectorAll('#tableau .card')].map(item => item.getBoundingClientRect().bottom));
        const controlsTop = document.querySelector('.controls').getBoundingClientRect().top;
        return {
          selectedBefore,
          escapeCleared: selectedAfter === null,
          columnsInside: columns.length === 8 && columns.every(column => column.left >= table.left - 1 && column.right <= table.right + 1),
          cardsBeforeControls: lastCardBottom <= controlsTop + 1
        };
      })()`);
      assert(responsiveSelection.selectedBefore && responsiveSelection.escapeCleared, 'pandacell: Escape did not cancel card selection');
      assert(responsiveSelection.columnsInside && responsiveSelection.cardsBeforeControls, `pandacell: responsive/dynamic tableau failed ${JSON.stringify(responsiveSelection)}`);
    }

    if (game === 'panndike') {
      const klondike = await evaluate(`(() => {
        Panndike.newGame({ seed: 'browser-smoke-deal', drawCount: 3, dealType: 'random' });
        const signature = state => JSON.stringify({
          tableau: state.tableau.map(column => column.map(card => card.id)),
          stock: state.stock.map(card => card.id)
        });
        const before = Panndike.getState();
        document.getElementById('stock').click();
        const afterDraw = Panndike.getState();
        const drawLocked = document.getElementById('draw-mode').disabled;
        Panndike.restart();
        const restarted = Panndike.getState();
        const topCardOfCol0 = document.querySelector('#tableau .column:nth-child(1) .card:last-child');
        if (!topCardOfCol0) return { ok: false, reason: 'no top card' };
        topCardOfCol0.focus();
        topCardOfCol0.click();
        const selectedAfterFirst = !!document.querySelector('#tableau .column:nth-child(1) .card:last-child.selected');
        document.querySelector('#tableau .column:nth-child(1) .card:last-child').click();
        const stillSelected = !!document.querySelector('#tableau .column:nth-child(1) .card:last-child.selected');
        const deselectMessage = document.getElementById('message').textContent;
        const tableRect = document.querySelector('.game-table').getBoundingClientRect();
        const columns = [...document.querySelectorAll('#tableau .column')].map(column => column.getBoundingClientRect());
        const controlsRect = document.querySelector('.guide').getBoundingClientRect();
        const lastCardBottom = Math.max(...[...document.querySelectorAll('#tableau .card')].map(card => card.getBoundingClientRect().bottom));

        Panndike.newGame({ seed: 'daily-2026-08-30', drawCount: 1, dealType: 'daily' });
        const restoredDailyLabel = document.getElementById('deal-code').textContent;
        const restoredDailyMessage = document.getElementById('message').textContent;

        Panndike.newGame({ seed: 'modal-shortcut-test', drawCount: 1, dealType: 'random' });
        document.getElementById('stock').click();
        const requestButton = document.getElementById('new-game');
        requestButton.focus();
        requestButton.click();
        const beforeBlockedShortcut = Panndike.getState();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true }));
        const afterBlockedShortcut = Panndike.getState();
        const shortcutBlockedByModal = !document.getElementById('confirm').hidden && beforeBlockedShortcut.moves === afterBlockedShortcut.moves && beforeBlockedShortcut.stock.length === afterBlockedShortcut.stock.length;
        document.getElementById('confirm-cancel').focus();
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        const escapeClosedAndRestored = document.getElementById('confirm').hidden && document.activeElement === requestButton;
        return {
          ok: true,
          deterministicRestart: signature(before) === signature(restarted),
          drawCount: afterDraw.drawCount,
          wasteCount: afterDraw.waste.length,
          drawLocked,
          selectedAfterFirst,
          stillSelected,
          msg: deselectMessage,
          restoredDailyDate: /08-30/.test(restoredDailyLabel) && /2026-08-30/.test(restoredDailyMessage),
          shortcutBlockedByModal,
          escapeClosedAndRestored,
          allColumnsInside: columns.length === 7 && columns.every(rect => rect.left >= tableRect.left - 1 && rect.right <= tableRect.right + 1),
          cardsBeforeGuide: lastCardBottom <= controlsRect.top + 1,
          pointerLifecycle: /pointercancel/.test(String(document.documentElement.innerHTML)) || typeof PointerEvent === 'function'
        };
      })()`);
      assert(klondike.ok, `panndike: setup failed ${JSON.stringify(klondike)}`);
      assert(klondike.deterministicRestart, 'panndike: restarting did not preserve the deal');
      assert(klondike.drawCount === 3 && klondike.wasteCount === 3 && klondike.drawLocked, 'panndike: draw-3 rule is not fixed after the first move');
      assert(klondike.selectedAfterFirst, 'panndike: top card should be selectable');
      assert(!klondike.stillSelected, 'panndike: re-clicking the selected card should deselect');
      assert(!/nicht möglich|nicht erlaubt/i.test(klondike.msg), `panndike: deselection announced a spurious invalid-move error: "${klondike.msg}"`);
      assert(klondike.restoredDailyDate, 'panndike: restored daily deal is labeled with the current date');
      assert(klondike.shortcutBlockedByModal, 'panndike: gameplay shortcut fired behind confirmation modal');
      assert(klondike.escapeClosedAndRestored, 'panndike: Escape did not close confirmation and restore focus');
      assert(klondike.allColumnsInside, 'panndike: all seven tableau columns must fit inside the board');
      assert(klondike.cardsBeforeGuide, 'panndike: cards overlap the following guide/controls');
    }

    if (game === 'texttl') {
      const raceSafe = await evaluate(`(async () => {
        const word = TexttlLogic.dailyWord(new Date());
        function submitSolution() {
          document.activeElement?.blur();
          for (const letter of TexttlLogic.graphemes(word)) document.dispatchEvent(new KeyboardEvent('keydown', { key: letter, bubbles: true }));
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
        submitSolution();
        await new Promise(resolve => setTimeout(resolve, 80));
        const committedSave = JSON.parse(localStorage.getItem('texttl_daily') || 'null');
        const committedBeforeAnimation = committedSave && committedSave.guesses.includes(word) && committedSave.status === 'won';
        const restart = document.querySelector('#restart-btn');
        const blockedDuringFlip = restart.disabled;
        restart.click();
        const saveAfterBlockedClick = JSON.parse(localStorage.getItem('texttl_daily') || 'null');
        await new Promise(resolve => setTimeout(resolve, 1550));
        const statsRecorded = JSON.parse(localStorage.getItem('texttl_stats') || 'null');
        const terminalCommitted = statsRecorded && statsRecorded.played === 1 && statsRecorded.won === 1;
        restart.click();
        await new Promise(resolve => setTimeout(resolve, 120));
        const flipSafe = document.querySelectorAll('.tile.correct,.tile.present,.tile.absent').length === 0 && document.querySelector('#result-overlay').hidden;
        submitSolution();
        await new Promise(resolve => setTimeout(resolve, 1470));
        restart.click();
        await new Promise(resolve => setTimeout(resolve, 600));
        const bounceSafe = document.querySelectorAll('.tile.bounce,.tile.correct,.tile.present,.tile.absent').length === 0 && document.querySelector('#result-overlay').hidden;
        const hard = document.querySelector('#hard-mode');
        hard.click();
        return {
          flipSafe, bounceSafe, committedBeforeAnimation, committedSave,
          blockedDuringFlip,
          blockedClickPreserved: saveAfterBlockedClick && saveAfterBlockedClick.status === 'won',
          terminalCommitted,
          hardMode: hard.getAttribute('aria-pressed') === 'true' && /Knifflig/.test(hard.textContent),
          expandedWords: TexttlLogic.SOLUTION_WORDS.length,
          scheduleFrozen: TexttlLogic.dailyWord(new Date('2024-06-15T00:00:00Z')) === 'WACHE',
          word
        };
      })()`);
      assert(raceSafe.flipSafe && raceSafe.bounceSafe, 'texttl: stale evaluation timers modified a restarted game');
      assert(raceSafe.committedBeforeAnimation, `texttl: committed guess was not persisted before its flip animation ${JSON.stringify(raceSafe)}`);
      assert(raceSafe.blockedDuringFlip && raceSafe.blockedClickPreserved && raceSafe.terminalCommitted, `texttl: final-animation restart lost the daily result ${JSON.stringify(raceSafe)}`);
      assert(raceSafe.hardMode && raceSafe.expandedWords >= 700 && raceSafe.scheduleFrozen, `texttl: Knifflig mode/expanded schedule missing ${JSON.stringify(raceSafe)}`);

      // Regression: ß wird als einzelnes Zeichen gerendert (kein CSS text-transform,
      // das ß zu SS machen würde) – in Kachel und Bildschirmtaste.
      const esszet = await evaluate(`(() => {
        const szKey = document.querySelector('.key[data-key="ß"]');
        const szKeyTransform = szKey ? getComputedStyle(szKey).textTransform : null;
        const szKeyText = szKey ? szKey.textContent : null;
        // ß ins Brett tippen (bereits normalisiert)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ß', bubbles: true }));
        const tile = document.querySelector('.board .tile.filled');
        const tileTransform = tile ? getComputedStyle(tile).textTransform : null;
        const tileText = tile ? tile.textContent : null;
        return { szKeyTransform, szKeyText, tileTransform, tileText };
      })()`);
      assert(esszet.szKeyTransform === 'none', `texttl: ß key must not be uppercased (text-transform ${esszet.szKeyTransform})`);
      assert(esszet.szKeyText === 'ß', 'texttl: ß key label is ß');
      assert(esszet.tileTransform === 'none', `texttl: tile must not be uppercased (text-transform ${esszet.tileTransform})`);
      assert(esszet.tileText === 'ß', 'texttl: ß tile shows ß (single glyph)');

      // Zwei echte gleich-originige Dokumente beenden dasselbe Tagesrätsel
      // widersprüchlich. Der kanonische Reducer muss unabhängig von der
      // Ankunftsreihenfolge genau einen Sieg zählen und im Save bewahren.
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      const multitabStats = await evaluate(`(async () => {
        for (const key of [...Array(localStorage.length)].map((_, i) => localStorage.key(i))) {
          if (key && key.startsWith('texttl_')) localStorage.removeItem(key);
        }
        function addFrame() {
          return new Promise(resolve => {
            const frame = document.createElement('iframe');
            frame.hidden = true;
            frame.addEventListener('load', () => resolve(frame), { once: true });
            frame.src = 'index.html?multitab=' + Math.random();
            document.body.appendChild(frame);
          });
        }
        function submit(frame, word) {
          const doc = frame.contentDocument;
          for (const letter of frame.contentWindow.TexttlLogic.graphemes(word)) {
            doc.dispatchEvent(new KeyboardEvent('keydown', { key: letter, bubbles: true }));
          }
          doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
        const lossFrame = await addFrame();
        const winFrame = await addFrame();
        const logic = lossFrame.contentWindow.TexttlLogic;
        const solution = logic.dailyWord(new Date());
        const wrong = logic.VALID_GUESS_WORDS.find(word => word !== solution);
        for (let i = 0; i < 6; i++) submit(lossFrame, wrong);
        const afterLoss = JSON.parse(localStorage.getItem('texttl_stats') || 'null');
        submit(winFrame, solution);
        const finalStats = JSON.parse(localStorage.getItem('texttl_stats') || 'null');
        const dailySave = JSON.parse(localStorage.getItem('texttl_daily') || 'null');
        lossFrame.remove(); winFrame.remove();
        return { afterLoss, finalStats, dailyStatus: dailySave && dailySave.status };
      })()`);
      await cdp.send('Emulation.setEmulatedMedia', { features: [] });
      assert(multitabStats.afterLoss && multitabStats.afterLoss.played === 1 && multitabStats.afterLoss.won === 0, `texttl: loss setup failed ${JSON.stringify(multitabStats)}`);
      assert(multitabStats.finalStats && multitabStats.finalStats.played === 1 && multitabStats.finalStats.won === 1 && multitabStats.dailyStatus === 'won', `texttl: concurrent daily outcomes depend on tab arrival order ${JSON.stringify(multitabStats)}`);
    }

    if (game === games[0]) {
      const switched = await evaluate(`(() => {
        const picker = document.querySelector('.game-style-control select');
        picker.value = 'night';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
        return document.documentElement.dataset.gameStyle;
      })()`);
      assert(switched === 'night', 'shared style picker did not apply Nacht mode');
      const storageSynced = await evaluate(`(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'browser-games-style', newValue: 'contrast' }));
        const picker = document.querySelector('.game-style-control select');
        const synced = document.documentElement.dataset.gameStyle === 'contrast' && picker.value === 'contrast';
        picker.value = 'night';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
        return synced;
      })()`);
      assert(storageSynced, 'shared style picker did not mirror a cross-tab storage change');
    }

    const pageEvents = cdp.events.slice(eventStart);
    const errors = pageEvents.filter(event =>
      event.method === 'Runtime.exceptionThrown' ||
      (event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error') ||
      (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
    );
    assert(errors.length === 0, `${game}: browser console/runtime errors: ${JSON.stringify(errors)}`);

    const loaded = cdp.waitEvent('Page.loadEventFired');
    await evaluate(`document.querySelector('.game-toolbar a[href]').click()`);
    await loaded;
    const overviewPath = await evaluate('location.pathname');
    assert(overviewPath.endsWith('/index.html'), `${game}: overview click did not navigate to the launcher`);
    if (game === games[0]) {
      const persisted = await evaluate(`(() => {
        const current = document.documentElement.dataset.gameStyle;
        const picker = document.querySelector('.game-style-control select');
        picker.value = 'panda';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
        return current;
      })()`);
      assert(persisted === 'night', 'style selection did not persist on the overview page');
    }
  }

  await navigate('index.html');
  const launcher = await evaluate(`(async () => {
    const cards = [...document.querySelectorAll('main.grid > a.card')];
    const hrefs = cards.map(card => card.getAttribute('href'));
    const responses = await Promise.all(hrefs.map(async href => {
      try { return (await fetch(href, { cache: 'no-store' })).ok; } catch (_error) { return false; }
    }));
    return {
      count: cards.length,
      unique: new Set(hrefs).size,
      allTargetsLoad: responses.every(Boolean),
      hasBubbles: hrefs.includes('panda-bubbles/index.html') && cards.some(card => card.textContent.includes('Panda: Jäger der Blasen')),
      hasJewels: hrefs.includes('des-pandas-juwelen/index.html') && cards.some(card => card.textContent.includes('Des Pandas Juwelen')),
      version: document.querySelector('footer')?.textContent || '',
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  })()`);
  assert(launcher.count === 18 && launcher.unique === 18 && launcher.allTargetsLoad, `launcher: expected 18 unique loadable games ${JSON.stringify(launcher)}`);
  assert(launcher.hasBubbles && launcher.hasJewels && launcher.version.includes('Version 2.1') && !launcher.overflow, `launcher: v2.1 integration is incomplete ${JSON.stringify(launcher)}`);

  // v1.9: Kategorie-Chips, Suche und Ton-Schalter des Launchers.
  const launcherFilters = await evaluate(`(async () => {
    const visibleCards = () => [...document.querySelectorAll('main.grid > a.card')].filter(card => !card.hidden).length;
    const chip = document.querySelector('.chip[data-filter="karten"]');
    chip.click();
    await new Promise(resolve => setTimeout(resolve, 30));
    const cardsOnly = visibleCards();
    const chipPressed = chip.getAttribute('aria-pressed') === 'true';
    document.querySelector('.chip[data-filter="alle"]').click();
    const search = document.querySelector('#search');
    search.value = 'sudoku';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 30));
    const searched = visibleCards();
    search.value = 'zzzz-nichts';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const emptyShown = !document.querySelector('#empty').hidden;
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const restored = visibleCards();
    const sound = document.querySelector('.game-toolbar .game-sound-toggle');
    const before = sound ? sound.getAttribute('aria-pressed') : null;
    if (sound) sound.click();
    const after = sound ? sound.getAttribute('aria-pressed') : null;
    const stored = localStorage.getItem('browser-games-sound');
    if (sound) sound.click();
    return { cardsOnly, chipPressed, searched, emptyShown, restored, soundToggle: !!sound, toggled: before !== after, stored };
  })()`);
  assert(launcherFilters.cardsOnly === 5 && launcherFilters.chipPressed && launcherFilters.searched === 1 && launcherFilters.emptyShown && launcherFilters.restored === 18, `launcher: filter/search broken ${JSON.stringify(launcherFilters)}`);
  assert(launcherFilters.soundToggle && launcherFilters.toggled && (launcherFilters.stored === 'off' || launcherFilters.stored === 'on'), `launcher: sound toggle broken ${JSON.stringify(launcherFilters)}`);

  await navigate('pahjong/index.html');
  const pahjongUi = await evaluate(`(async () => {
    const result = document.querySelector('#result');
    const back = document.querySelector('.game-toolbar a[href], a.back-link[href]');
    const summary = document.querySelector('details > summary');
    const isTopmost = element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === element || element.contains(hit);
    };
    window.scrollTo(0, 0);
    await new Promise(requestAnimationFrame);
    const backClickable = isTopmost(back);
    const initialBoardWidth = document.querySelector('#board').getBoundingClientRect().width;
    document.querySelector('#zoom-in').click();
    document.querySelector('#zoom-in').click();
    const zoomedBoardWidth = document.querySelector('#board').getBoundingClientRect().width;
    const tileWidths = [...document.querySelectorAll('#board .tile:not(.removed)')].map(tile => tile.getBoundingClientRect().width);
    const controlsTallEnough = [...document.querySelectorAll('.controls button, .zoom-controls button')].every(button => button.getBoundingClientRect().height >= 44);
    const freeContract = [...document.querySelectorAll('#board .tile')].every((tile, id) => tile.classList.contains('removed') || tile.disabled === !Pahjong.isFree(id));
    summary.scrollIntoView({ block: 'center' });
    await new Promise(requestAnimationFrame);
    return {
      resultHidden: result.hidden && getComputedStyle(result).display === 'none',
      backClickable,
      rulesClickable: isTopmost(summary),
      pairPlanValid: Pahjong.testPlan(50).allPassed,
      tileCount: document.querySelectorAll('#board > .tile').length,
      layers: Pahjong.engine.SLOTS.reduce((out, slot) => { out[slot.z] = (out[slot.z] || 0) + 1; return out; }, {}),
      guideSteps: document.querySelectorAll('.quick-guide li').length,
      rovingStops: document.querySelectorAll('#board .tile[tabindex="0"]').length,
      freeContract,
      zoomed: zoomedBoardWidth > initialBoardWidth * 1.5 && Math.min(...tileWidths) >= 28,
      boardScrollable: document.querySelector('#board-shell').scrollWidth > document.querySelector('#board-shell').clientWidth,
      controlsTallEnough,
      visualRefresh: parseFloat(getComputedStyle(document.querySelector('.site-header')).borderRadius) > 0 &&
        parseFloat(getComputedStyle(document.querySelector('.board-shell')).borderTopWidth) >= 4 &&
        getComputedStyle(document.querySelector('#board .tile')).boxShadow !== 'none'
    };
  })()`);
  assert(pahjongUi.resultHidden, 'pahjong: hidden result dialog still blocks the page');
  assert(pahjongUi.backClickable, 'pahjong: overview link is covered by another element');
  assert(pahjongUi.rulesClickable, 'pahjong: rules summary is covered by another element');
  assert(pahjongUi.pairPlanValid, 'pahjong: generated pair-removal plan is invalid');
  assert(pahjongUi.tileCount === 144 && JSON.stringify(pahjongUi.layers) === JSON.stringify({ 0: 87, 1: 36, 2: 16, 3: 4, 4: 1 }), `pahjong: Turtle layout is incomplete ${JSON.stringify(pahjongUi.layers)}`);
  assert(pahjongUi.guideSteps === 3, 'pahjong: visible step-by-step instructions are missing');
  assert(pahjongUi.rovingStops === 1 && pahjongUi.freeContract, 'pahjong: free-tile/roving-focus contract failed');
  assert(pahjongUi.zoomed && pahjongUi.boardScrollable, 'pahjong: mobile zoom did not create readable scrollable tiles');
  assert(pahjongUi.controlsTallEnough, 'pahjong: mobile controls are below 44px');
  assert(pahjongUi.visualRefresh, 'pahjong: visual table/tile refresh is not applied');

  // Regression: Dokumentierte Kurzbefehle (H/M/U/N) wirken auch, wenn ein
  // Stein (button) fokussiert ist – früher wurden sie bei Fokus auf einem
  // Button verschluckt. Native Space/Enter bleiben unangetastet.
  const pahjongKeys = await evaluate(`(async () => {
    Pahjong.newGame('browser-keys-start');
    const tile = document.querySelector('#board .tile:not(:disabled)');
    if (tile) tile.focus();
    const seedBeforeN = Pahjong.getState().seed;
    tile?.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }));
    const afterN = Pahjong.getState();
    const reshuffledOnN = afterN.remaining === 144 && afterN.seed !== seedBeforeN;

    // Ein bereits gewählter Fremdstein darf den Hinweis nicht als dritte,
    // gleich aussehende Markierung stehen lassen.
    const hintedPair = Pahjong.findHint();
    const outsider = [...document.querySelectorAll('#board .tile:not(:disabled)')].find(button => !hintedPair.includes(Number(button.dataset.id)));
    outsider?.click();
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true }));
    const exactHintPair = document.querySelectorAll('#board .tile.hinted').length === 2 && document.querySelectorAll('#board .tile.selected').length === 0;

    const hint = Pahjong.findHint();
    let undoWorked = false, focusRecovered = false, arrowMoved = false;
    if (hint) {
      const first = document.querySelector('#board .tile:nth-child(' + (hint[0] + 1) + ')');
      const second = document.querySelector('#board .tile:nth-child(' + (hint[1] + 1) + ')');
      first.click(); second.focus(); second.click();
      const active = document.activeElement;
      focusRecovered = !!active && active.matches('#board .tile:not(:disabled)') && getComputedStyle(active).visibility !== 'hidden';
      const movesAfterPair = Pahjong.getState().moves;
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true, cancelable: true }));
      undoWorked = Pahjong.getState().moves < movesAfterPair;
      const arrowStart = document.activeElement;
      for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
        arrowStart?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        if (document.activeElement !== arrowStart) { arrowMoved = true; break; }
      }
    }

    // Mischen erhält jedes verbleibende physische Motiv.
    const facesBefore = Pahjong.getCards().filter(card => !card.removed).map(card => card.face.uid).sort().join(',');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }));
    const facesAfter = Pahjong.getCards().filter(card => !card.removed).map(card => card.face.uid).sort().join(',');
    const shufflePreserved = facesBefore === facesAfter && Pahjong.getState().shuffles === 1;

    // Vollständigen garantierten Weg durch die echte Click-UI abspielen.
    Pahjong.newGame('browser-full-solution');
    const fullPlan = Pahjong.getSolutionPlan();
    for (const pair of fullPlan) {
      document.querySelector('#board .tile:nth-child(' + (pair[0] + 1) + ')').click();
      document.querySelector('#board .tile:nth-child(' + (pair[1] + 1) + ')').click();
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    const wonState = Pahjong.getState();
    const won = wonState.status === 'won' && wonState.remaining === 0;
    const compactHistory = wonState.undoDepth === 72 && wonState.undoBytes < 50000;
    const resultFocused = document.querySelector('#result').contains(document.activeElement);
    document.querySelector('#result-undo').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const terminalUndo = Pahjong.getState().status === 'playing' && Pahjong.getState().remaining === 2 && document.querySelector('#result').hidden;

    return { reshuffledOnN, exactHintPair, undoWorked, focusRecovered, arrowMoved, shufflePreserved, hadHint: !!hint, won, compactHistory, resultFocused, terminalUndo };
  })()`);
  assert(pahjongKeys.reshuffledOnN, 'pahjong: N shortcut did not create a fresh deal while a tile was focused');
  assert(pahjongKeys.exactHintPair, 'pahjong: hint did not mark exactly two distinct tiles');
  assert(pahjongKeys.hadHint, 'pahjong: a free hint pair should exist for the undo test');
  assert(pahjongKeys.focusRecovered, 'pahjong: focus remained on an invisible removed tile');
  assert(pahjongKeys.undoWorked, 'pahjong: U shortcut did not undo while a tile was focused');
  assert(pahjongKeys.arrowMoved, 'pahjong: spatial arrow-key navigation did not move focus');
  assert(pahjongKeys.shufflePreserved, 'pahjong: shuffle changed the remaining face multiset');
  assert(pahjongKeys.compactHistory, 'pahjong: undo history still stores full 144-tile state clones');
  assert(pahjongKeys.won && pahjongKeys.resultFocused && pahjongKeys.terminalUndo, `pahjong: full solution/result/terminal undo failed ${JSON.stringify(pahjongKeys)}`);

  console.log(`browser smoke ok (${games.length} styled games, 18 launcher games, 10 Phone portrait/landscape, Tablet/Desktop/Widescreen/Ultrawide-Viewports at DPR 1–3 × 3 styles, navigation, contrast, focus)`);
  await cdp.send('Browser.close').catch(() => {});
} finally {
  cdp?.socket.close();
  server.close();
  if (!browser.killed) browser.kill();
  await delay(200);
  rmSync(profile, { recursive: true, force: true });
}
