// Minimal dependency-free browser automation over the Chrome DevTools Protocol.
// Serves the project with a built-in static server and drives a local Chrome / Edge headless.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SHOTS = join(ROOT, 'tests', 'screenshots');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

export function findBrowser(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

export async function openBrowser({ width = 1280, height = 720, browserPath } = {}) {
  mkdirSync(SHOTS, { recursive: true });
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = resolve(ROOT, '.' + (url === '/' ? '/index.html' : url));
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;

  const BROWSER = findBrowser(browserPath);
  if (!BROWSER) { server.close(); return null; }
  const profileDir = mkdtempSync(join(tmpdir(), 'gloam-cdp-'));
  const browser = spawn(BROWSER, [
    '--headless=new', `--user-data-dir=${profileDir}`, '--remote-debugging-port=0', `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    await sleep(150);
    const f = join(profileDir, 'DevToolsActivePort');
    if (!existsSync(f)) continue;
    const [port] = readFileSync(f, 'utf8').split('\n');
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* not ready yet */ }
  }
  if (!wsUrl) { browser.kill(); server.close(); throw new Error('could not connect to the browser'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let msgId = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(`exception: ${m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`console.error: ${m.params.args.map((a) => a.value || a.description).join(' ')}`);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`log: ${m.params.entry.text} ${m.params.entry.url || ''}`);
  };
  const send = (method, params = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(`evaluate failed: ${r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text}`);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const KEYS = { KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68], KeyE: ['e', 69], KeyQ: ['q', 81], KeyI: ['i', 73], KeyM: ['m', 77], Space: [' ', 32], Escape: ['Escape', 27] };
  const key = async (code, holdMs = 60) => {
    const [k, vk] = KEYS[code];
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk });
    await sleep(holdMs);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk });
    await sleep(50);
  };
  const mouse = (type, x, y, button = 'none', buttons = 0) => send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  };
  const waitFor = async (cond, ms = 6000, label = cond) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await evaluate(`return !!(${cond});`)) return true;
      await sleep(80);
    }
    throw new Error(`timeout waiting for: ${label}`);
  };
  const close = async () => {
    try { ws.close(); } catch { /* ignore */ }
    try { browser.kill(); } catch { /* ignore */ }
    server.close();
    await sleep(400);
    try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* profile still locked */ }
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  return { base, send, evaluate, key, mouse, shot, waitFor, errors, close, browserName: BROWSER.split(/[\\/]/).pop() };
}
