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
const games = ['panda-spider', 'pandacell', 'pandadoku', 'pandakreuzwort', 'pandataire', 'panndike', 'texttl'];
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

    for (const width of [320, 375, 414]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: true });
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
          const contrasts = cards.map(contrast).filter(value => value != null);
          const controlContrasts = controls.map(contrast).filter(value => value != null);
          const overflowers = [...document.querySelectorAll('body *')].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
          }).slice(0, 5).map(element => ({
            tag: element.tagName,
            id: element.id,
            className: String(element.className || ''),
            left: Math.round(element.getBoundingClientRect().left),
            right: Math.round(element.getBoundingClientRect().right),
            width: Math.round(element.getBoundingClientRect().width)
          }));
          return {
            applied: document.documentElement.dataset.gameStyle,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            overflowers,
            minimumCardContrast: contrasts.length ? Math.min(...contrasts) : null,
            minimumControlContrast: controlContrasts.length ? Math.min(...controlContrasts) : null
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

    if (game === 'pandadoku') {
      const roving = await evaluate(`document.querySelectorAll('#board .cell[tabindex="0"]').length`);
      assert(roving === 1, 'pandadoku: grid must have exactly one tab stop');
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
        await new Promise(resolve => setTimeout(resolve, 350));
        const raced = Pandakreuzwort.getState();
        Pandakreuzwort.setLanguage('bar');
        await new Promise(resolve => setTimeout(resolve, 350));
        const bavarian = Pandakreuzwort.getState();
        const bavarianMetadata = document.querySelectorAll('.clue-btn .meta').length === bavarian.wordCount;
        Pandakreuzwort.setDifficulty('experte');
        await new Promise(resolve => setTimeout(resolve, 600));
        const expert = Pandakreuzwort.getState();
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
          bavarianPlayable: bavarian.language === 'bar' && bavarian.status === 'playing' && bavarian.wordCount > 0,
          bavarianMetadata,
          expertPlayable: expert.difficulty === 'experte' && expert.status === 'playing' && expert.wordCount >= 19,
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
      assert(crossword.bavarianPlayable && crossword.bavarianMetadata, 'pandakreuzwort: Bairisch mode or clue metadata is incomplete');
      assert(crossword.expertPlayable, 'pandakreuzwort: Experte mode did not generate enough words');
    }

    if (game === 'pandataire') {
      const completeDeck = await evaluate(`(() => {
        const state = Pandataire.getState();
        const deck = [...state.cards.filter(card => !card.removed), ...state.talon, state.waste];
        return deck.length === 52 && new Set(deck.map(card => card.rank + ':' + card.suit)).size === 52;
      })()`);
      assert(completeDeck, 'pandataire: deal does not contain 52 unique cards');
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
    }

    if (game === 'texttl') {
      const raceSafe = await evaluate(`(async () => {
        const word = TexttlLogic.dailyWord(new Date());
        function submitSolution() {
          for (const letter of TexttlLogic.graphemes(word)) document.dispatchEvent(new KeyboardEvent('keydown', { key: letter, bubbles: true }));
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
        submitSolution();
        document.querySelector('#restart-btn').click();
        await new Promise(resolve => setTimeout(resolve, 1600));
        const flipSafe = document.querySelectorAll('.tile.correct,.tile.present,.tile.absent').length === 0 && document.querySelector('#result-overlay').hidden;
        submitSolution();
        await new Promise(resolve => setTimeout(resolve, 1470));
        document.querySelector('#restart-btn').click();
        await new Promise(resolve => setTimeout(resolve, 600));
        const bounceSafe = document.querySelectorAll('.tile.bounce,.tile.correct,.tile.present,.tile.absent').length === 0 && document.querySelector('#result-overlay').hidden;
        return flipSafe && bounceSafe;
      })()`);
      assert(raceSafe, 'texttl: stale evaluation timers modified a restarted game');
    }

    if (game === games[0]) {
      const switched = await evaluate(`(() => {
        const picker = document.querySelector('.game-style-control select');
        picker.value = 'night';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
        return document.documentElement.dataset.gameStyle;
      })()`);
      assert(switched === 'night', 'shared style picker did not apply Nacht mode');
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

  await navigate('pahjong/index.html');
  const pahjongUi = await evaluate(`(async () => {
    const result = document.querySelector('#result');
    const back = document.querySelector('nav a[href]');
    const summary = document.querySelector('details > summary');
    const isTopmost = element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === element || element.contains(hit);
    };
    window.scrollTo(0, 0);
    await new Promise(requestAnimationFrame);
    const backClickable = isTopmost(back);
    summary.scrollIntoView({ block: 'center' });
    await new Promise(requestAnimationFrame);
    return {
      resultHidden: result.hidden && getComputedStyle(result).display === 'none',
      backClickable,
      rulesClickable: isTopmost(summary),
      pairPlanValid: Pahjong.testPlan(50).allPassed
    };
  })()`);
  assert(pahjongUi.resultHidden, 'pahjong: hidden result dialog still blocks the page');
  assert(pahjongUi.backClickable, 'pahjong: overview link is covered by another element');
  assert(pahjongUi.rulesClickable, 'pahjong: rules summary is covered by another element');
  assert(pahjongUi.pairPlanValid, 'pahjong: generated pair-removal plan is invalid');

  console.log(`browser smoke ok (${games.length} styled games plus Pahjong UI, 3 viewports × 3 styles, navigation, contrast, focus)`);
  await cdp.send('Browser.close').catch(() => {});
} finally {
  cdp?.socket.close();
  server.close();
  if (!browser.killed) browser.kill();
  await delay(200);
  rmSync(profile, { recursive: true, force: true });
}
