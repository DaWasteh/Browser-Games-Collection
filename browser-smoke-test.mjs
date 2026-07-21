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

    if (game === 'pandataire' || game === 'pandakreuzwort' || game === 'texttl') {
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

    for (const width of [320, 375, 414, 600]) {
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

      // Regression: Jede Eingabe wird persistiert (Debounce + pagehide) und
      // überlebt einen Neuladen; der Won-Status + eingefrorene Zeit werden restauriert.
      await evaluate(`Pandakreuzwort.newGame('persist-seed')`);
      await delay(400);
      const persist = await evaluate(`(() => {
        // Erste wählbare Zelle ansteuern und einen Buchstaben tippen.
        const cell = document.querySelector('#board .cell[tabindex="0"]') || document.querySelector('#board .cell');
        if (!cell) return { ok: false, reason: 'no cell' };
        cell.click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }));
        return { ok: true, letter: (document.querySelector('#board .cell.sel .letter') || {}).textContent || '' };
      })()`);
      assert(persist.ok, 'pandakreuzwort: cell should be focusable for input');
      await delay(450); // Entprell-Timer (300 ms) abwarten
      const savedRaw = await evaluate(`localStorage.getItem('pandakreuzwort-save-v2') || ''`);
      assert(savedRaw.includes(persist.letter), 'pandakreuzwort: typed letter was persisted to storage');

      // Won-Status + Timer restaurieren: Das Rätsel durch korrektes Ausfüllen
      // wirklich lösen (setzt den In-Memory-Zustand 'won', den pagehide dann
      // konsistent persistiert), neu laden und Status + eingefrorene Zeit prüfen.
      await evaluate(`(async () => {
        Pandakreuzwort.newGame('won-seed');
        await new Promise(r => setTimeout(r, 350));
        const data = JSON.parse(localStorage.getItem('pandakreuzwort-save-v2'));
        const solution = {};
        for (const k in data.cells) solution[k] = data.cells[k].letter;
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
          perMode[m] = {
            mode: Pandataire.getMode(),
            deckUnique: deckUnique(),
            deterministic: before === after,
            cardCount: st.cards.length,
            stockCount: st.stock.length,
            status: st.status
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
    }

    if (game === 'panndike') {
      // Regression: erneutes Antippen der bereits gewählten Karte wählt ab,
      // OHNE vorher eine irreführende „nicht erlaubt“-Meldung auszugeben.
      const deselect = await evaluate(`(() => {
        Panndike.newGame();
        const topCardOfCol0 = document.querySelector('#tableau .column:nth-child(1) .card:last-child');
        if (!topCardOfCol0) return { ok: false, reason: 'no top card' };
        topCardOfCol0.click(); // auswählen
        const selectedAfterFirst = !!document.querySelector('#tableau .column:nth-child(1) .card:last-child.selected');
        // gleiche Karte erneut antippen → Abwahl
        document.querySelector('#tableau .column:nth-child(1) .card:last-child').click();
        const stillSelected = !!document.querySelector('#tableau .column:nth-child(1) .card:last-child.selected');
        const msg = document.getElementById('message').textContent;
        return { selectedAfterFirst, stillSelected, msg, noSpuriousError: msg !== 'Dieser Zug ist nicht erlaubt.' };
      })()`);
      assert(deselect.selectedAfterFirst, 'panndike: top card should be selectable');
      assert(!deselect.stillSelected, 'panndike: re-clicking the selected card should deselect');
      assert(deselect.noSpuriousError, `panndike: deselection announced a spurious invalid-move error: "${deselect.msg}"`);
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

  // Regression: Dokumentierte Kurzbefehle (H/M/U/N) wirken auch, wenn ein
  // Stein (button) fokussiert ist – früher wurden sie bei Fokus auf einem
  // Button verschluckt. Native Space/Enter bleiben unangetastet.
  const pahjongKeys = await evaluate(`(() => {
    // 1) 'n' bei fokussiertem Stein muss neu mischen (frisches Spiel: 144 Steine).
    const tile = document.querySelector('#board .tile:not(:disabled)');
    if (tile) tile.focus();
    const beforeN = Pahjong.getState().remaining;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    const afterN = Pahjong.getState().remaining;
    const reshuffledOnN = afterN === 144 && beforeN === 144;
    // 2) 'u' nach einem Zug muss rückgängig machen, selbst bei fokussiertem Stein.
    const hint = Pahjong.findHint();
    let undoWorked = false;
    if (hint) {
      document.querySelector('#board .tile:nth-child(' + (hint[0] + 1) + ')').click();
      document.querySelector('#board .tile:nth-child(' + (hint[1] + 1) + ')').click();
      const movesAfterPair = Pahjong.getState().moves;
      const t2 = document.querySelector('#board .tile:not(:disabled)');
      if (t2) t2.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true }));
      undoWorked = Pahjong.getState().moves < movesAfterPair;
    }
    return { reshuffledOnN, undoWorked, hadHint: !!hint };
  })()`);
  assert(pahjongKeys.reshuffledOnN, 'pahjong: N shortcut did not redeal while a tile was focused');
  assert(pahjongKeys.hadHint, 'pahjong: a free hint pair should exist for the undo test');
  assert(pahjongKeys.undoWorked, 'pahjong: U shortcut did not undo while a tile was focused');

  console.log(`browser smoke ok (${games.length} styled games plus Pahjong UI, 4 viewports × 3 styles, navigation, contrast, focus)`);
  await cdp.send('Browser.close').catch(() => {});
} finally {
  cdp?.socket.close();
  server.close();
  if (!browser.killed) browser.kill();
  await delay(200);
  rmSync(profile, { recursive: true, force: true });
}
