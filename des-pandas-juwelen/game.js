(() => {
  'use strict';

  const Logic = window.JewelsLogic;
  if (!Logic) throw new Error('JewelsLogic konnte nicht geladen werden.');

  const $ = id => document.getElementById(id);
  const boardEl = $('board');
  const effectsEl = $('board-effects');
  // Gleicher Schlüssel wie bis v2.4: Bestwert und Ton bleiben erhalten, Schatzbeutel und
  // gesehene Tipps kommen als zusätzliche Felder hinzu.
  const STORAGE_KEY = 'des-pandas-juwelen-settings-v1';
  const SYMBOLS = Object.freeze({ jade: '▲', amber: '✦', ruby: '●', sapphire: '◆', amethyst: '✿', pearl: '⬟' });
  const PRISM_SYMBOL = '★';
  const NAMES = Object.freeze({ jade: 'Jade', amber: 'Bernstein', ruby: 'Rubin', sapphire: 'Saphir', amethyst: 'Amethyst', pearl: 'Perle' });
  const GEM_HEX = Object.freeze({ jade: '#42d69e', amber: '#f5b72d', ruby: '#f05273', sapphire: '#3aa8ef', amethyst: '#966be8', pearl: '#dceaf1', prism: '#fff3a3' });
  const SPECIAL_INFO = Object.freeze({
    row: { name: 'Linienjuwel ↔', label: 'waagerechtes Linienjuwel', effect: 'räumt die ganze Zeile', how: 'Vier gleiche in einer Reihe' },
    column: { name: 'Linienjuwel ↕', label: 'senkrechtes Linienjuwel', effect: 'räumt die ganze Spalte', how: 'Vier gleiche in einer Reihe' },
    bomb: { name: 'Pfotenbombe', label: 'Pfotenbombe', effect: 'sprengt das 3 × 3-Feld um sich herum', how: 'T- oder L-Form aus gleichen Juwelen' },
    prism: { name: 'Panda-Prisma', label: 'Panda-Prisma', effect: 'mit einem Nachbarn tauschen – alle Juwelen dieser Farbe verschwinden', how: 'Fünf gleiche in einer Reihe' }
  });
  const BOOSTER_INFO = Object.freeze({
    hammer: { icon: '🔨', name: 'Bambushammer', effect: 'zerschlägt ein beliebiges Juwel' },
    cross: { icon: '✚', name: 'Sternkreuz', effect: 'räumt Zeile und Spalte des Ziels' },
    color: { icon: '🌈', name: 'Farbfunke', effect: 'entfernt alle Juwelen einer Farbe' }
  });
  const STARTER_BOOSTERS = Object.freeze({ hammer: 1, cross: 0, color: 0 });
  const TREASURE_CHANCE = .014;
  const STEP_MS = 46;
  const BOOSTER_LEAD = 300;

  let random = Logic.seededRandom('boot');
  let treasureRandom = Logic.seededRandom('boot:fund');
  let audioContext = null;
  let masterGain = null;
  let noiseBuffer = null;
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let saveTimer = 0;
  let hintTimer = 0;
  let comboTimer = 0;
  let entranceTimer = 0;
  let effectTimer = 0;
  let impactTimer = 0;
  let tipTimer = 0;
  let tipShownAt = 0;
  let scoreFrame = 0;
  let shownScore = 0;
  let suppressClick = false;
  let pointerGesture = null;
  let hoverIndex = null;
  let turnToken = 0;
  const tipQueue = [];

  const state = {
    board: [],
    score: 0,
    highScore: 0,
    moves: Logic.CONFIG.moves,
    target: Logic.CONFIG.target,
    charge: 0,
    selected: null,
    focusIndex: 0,
    powerMode: false,
    boosterMode: null,
    boosters: { hammer: 0, cross: 0, color: 0 },
    seen: new Set(),
    status: 'playing',
    sound: true,
    seed: '',
    turns: 0,
    largestCascade: 0
  };

  const visual = {
    clearing: new Set(),
    clearDelay: new Map(),
    merging: new Map(),
    falling: new Map(),
    swapping: new Map(),
    invalid: new Map(),
    created: new Set(),
    entering: new Set(),
    victory: new Set(),
    hinted: new Set(),
    hintDir: new Map(),
    range: new Set()
  };

  const cells = [];
  const slots = {};
  let enterPitch = 0;

  function positionKey(position) { return position.row + ':' + position.col; }
  function indexOf(position) { return position.row * Logic.CONFIG.cols + position.col; }
  function positionOf(index) { return { row: Math.floor(index / Logic.CONFIG.cols), col: index % Logic.CONFIG.cols }; }
  function parseKey(value) { const parts = value.split(':'); return { row: Number(parts[0]), col: Number(parts[1]) }; }
  function gemColor(gem) { return GEM_HEX[gem && gem.special === 'prism' ? 'prism' : gem && gem.color] || '#ffffff'; }

  function buildBoard() {
    for (let row = 0; row < Logic.CONFIG.rows; row++) {
      const rowElement = document.createElement('div');
      rowElement.className = 'grid-row';
      rowElement.setAttribute('role', 'row');
      rowElement.setAttribute('aria-rowindex', String(row + 1));
      for (let col = 0; col < Logic.CONFIG.cols; col++) {
        const index = row * Logic.CONFIG.cols + col;
        const position = { row, col };
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cell';
        button.dataset.index = String(index);
        button.dataset.row = String(position.row);
        button.dataset.col = String(position.col);
        button.setAttribute('role', 'gridcell');
        button.setAttribute('aria-rowindex', String(row + 1));
        button.setAttribute('aria-colindex', String(col + 1));
        button.setAttribute('aria-selected', 'false');
        button.tabIndex = index === 0 ? 0 : -1;
        const gem = document.createElement('span');
        gem.className = 'gem';
        gem.setAttribute('aria-hidden', 'true');
        const mark = document.createElement('span');
        mark.className = 'gem-mark';
        const symbol = document.createElement('span');
        symbol.className = 'gem-symbol';
        gem.append(mark, symbol);
        const badge = document.createElement('span');
        badge.className = 'treasure-badge';
        badge.setAttribute('aria-hidden', 'true');
        button.append(gem, badge);
        button.addEventListener('click', event => handleCellClick(event, index));
        button.addEventListener('keydown', event => handleCellKeydown(event, index));
        button.addEventListener('pointerdown', event => handlePointerDown(event, index));
        button.addEventListener('pointerup', event => handlePointerUp(event, index));
        button.addEventListener('pointercancel', () => { pointerGesture = null; });
        button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') setHover(index); });
        button.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') setHover(null); });
        button.addEventListener('focus', () => { if (state.boosterMode && state.status === 'playing') render(); });
        cells.push({ button, gem, symbol, badge });
        rowElement.append(button);
      }
      boardEl.append(rowElement);
    }
    for (const slot of document.querySelectorAll('.bag-slot')) {
      slots[slot.dataset.booster] = slot;
      slot.addEventListener('click', () => toggleBooster(slot.dataset.booster));
    }
  }

  function readSettings() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_error) { /* local storage is optional */ }
    state.boosters = { ...STARTER_BOOSTERS };
    if (!saved || typeof saved !== 'object') return;
    state.highScore = Number.isFinite(saved.highScore) ? Math.max(0, Math.floor(saved.highScore)) : 0;
    state.sound = saved.sound !== false;
    if (saved.boosters && typeof saved.boosters === 'object') {
      for (const type of Logic.BOOSTERS) {
        const count = Math.floor(Number(saved.boosters[type]));
        state.boosters[type] = Number.isFinite(count) ? Math.max(0, Math.min(Logic.CONFIG.boosterMax, count)) : 0;
      }
    }
    if (Array.isArray(saved.seen)) state.seen = new Set(saved.seen.filter(item => typeof item === 'string').slice(0, 40));
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ highScore: state.highScore, sound: state.sound, boosters: state.boosters, seen: [...state.seen] }));
    } catch (_error) { /* local storage is optional */ }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveSettings, 180);
  }

  function formatScore(value) { return Math.max(0, Math.floor(value)).toLocaleString('de-DE'); }
  function announce(text) { $('message').textContent = text; }
  function motionTime(milliseconds) { return reducedMotion ? Math.min(12, milliseconds) : milliseconds; }
  function wait(milliseconds) { return new Promise(resolve => window.setTimeout(resolve, motionTime(milliseconds))); }

  async function waitForMotion(names, fallback) {
    if (reducedMotion || typeof boardEl.getAnimations !== 'function') {
      await wait(fallback);
      return;
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const wanted = new Set(names);
    const animations = boardEl.getAnimations({ subtree: true }).filter(animation => wanted.has(animation.animationName));
    if (!animations.length) {
      await wait(fallback);
      return;
    }
    await Promise.race([
      Promise.all(animations.map(animation => animation.finished.catch(() => {}))),
      new Promise(resolve => window.setTimeout(resolve, fallback + 120))
    ]);
  }

  function cellMotion(destination, source, amount = 1) {
    const destinationRect = cells[indexOf(destination)].button.getBoundingClientRect();
    const sourceRect = cells[indexOf(source)].button.getBoundingClientRect();
    return {
      x: (sourceRect.left - destinationRect.left) * amount,
      y: (sourceRect.top - destinationRect.top) * amount
    };
  }

  function rowPitch() {
    const first = cells[0].button.getBoundingClientRect();
    const second = cells[Logic.CONFIG.cols].button.getBoundingClientRect();
    return Math.max(first.height, second.top - first.top);
  }

  // ---------------------------------------------------------------- Effekte

  function cellEffectPoint(position) {
    const cellRect = cells[indexOf(position)].button.getBoundingClientRect();
    const hostRect = effectsEl.getBoundingClientRect();
    return {
      x: cellRect.left + cellRect.width / 2 - hostRect.left,
      y: cellRect.top + cellRect.height / 2 - hostRect.top,
      size: cellRect.width
    };
  }

  function gridBounds() {
    const host = effectsEl.getBoundingClientRect();
    const first = cells[0].button.getBoundingClientRect();
    const last = cells[cells.length - 1].button.getBoundingClientRect();
    return {
      left: first.left - host.left,
      top: first.top - host.top,
      right: last.right - host.left,
      bottom: last.bottom - host.top,
      pitch: (last.left - first.left) / (Logic.CONFIG.cols - 1) || first.width
    };
  }

  function addEffect(className, point, properties = {}) {
    if (reducedMotion) return null;
    const effect = document.createElement('span');
    effect.className = className;
    effect.style.left = point.x + 'px';
    effect.style.top = point.y + 'px';
    effect.style.setProperty('--effect-size', point.size + 'px');
    for (const [name, value] of Object.entries(properties)) effect.style.setProperty(name, String(value));
    effectsEl.append(effect);
    effect.addEventListener('animationend', () => effect.remove(), { once: true });
    window.setTimeout(() => effect.remove(), 2400);
    return effect;
  }

  function spawnEffect(className, x, y, properties = {}) {
    const effect = document.createElement('span');
    effect.className = className;
    effect.style.left = x + 'px';
    effect.style.top = y + 'px';
    for (const [name, value] of Object.entries(properties)) effect.style.setProperty(name, String(value));
    effectsEl.append(effect);
    return effect;
  }

  function runEffect(effect, keyframes, timing) {
    if (typeof effect.animate !== 'function') {
      effect.remove();
      return;
    }
    const animation = effect.animate(keyframes, { fill: 'both', easing: 'linear', ...timing });
    animation.finished.then(() => effect.remove(), () => effect.remove());
    window.setTimeout(() => effect.remove(), (timing.delay || 0) + timing.duration + 500);
  }

  // Kristallsplitter fliegen auf einer Wurfparabel davon und fallen zurück.
  function burstShards(point, color, count, delay, power = 1) {
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2 + Math.random() * .7;
      const speed = point.size * (.75 + Math.random() * .85) * power;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - point.size * .5 * power;
      const gravity = point.size * 2.4;
      const spin = (Math.random() < .5 ? -1 : 1) * (220 + Math.random() * 380);
      const shard = spawnEffect('jewel-shard', point.x, point.y, { '--spark-color': color, '--effect-size': point.size + 'px' });
      const frames = [];
      for (let sample = 0; sample <= 4; sample++) {
        const t = sample / 4;
        frames.push({
          transform: 'translate(-50%, -50%) translate(' + (vx * t).toFixed(1) + 'px, ' + (vy * t + gravity * t * t).toFixed(1) + 'px) rotate(' + Math.round(spin * t) + 'deg) scale(' + (1 - .72 * t).toFixed(2) + ')',
          opacity: t < .62 ? 1 : 1 - (t - .62) / .38
        });
      }
      runEffect(shard, frames, { duration: 540 + Math.random() * 180, delay });
    }
  }

  function emitPop(point, color, delay) {
    const ring = spawnEffect('pop-ring', point.x, point.y, { '--spark-color': color, '--effect-size': point.size + 'px' });
    runEffect(ring, [
      { transform: 'translate(-50%, -50%) scale(.35)', opacity: .95 },
      { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 }
    ], { duration: 340, delay, easing: 'cubic-bezier(.2, .7, .3, 1)' });
  }

  function emitBeam(point, axis, delay, color, bounds) {
    const thickness = Math.max(6, point.size * .34);
    const halves = axis === 'row'
      ? [
          { left: bounds.left, top: point.y, width: point.x - bounds.left, height: thickness, origin: 'right center', horizontal: true },
          { left: point.x, top: point.y, width: bounds.right - point.x, height: thickness, origin: 'left center', horizontal: true }
        ]
      : [
          { left: point.x, top: bounds.top, width: thickness, height: point.y - bounds.top, origin: 'center bottom', horizontal: false },
          { left: point.x, top: point.y, width: thickness, height: bounds.bottom - point.y, origin: 'center top', horizontal: false }
        ];
    for (const half of halves) {
      const length = half.horizontal ? half.width : half.height;
      if (length < 2) continue;
      const beam = spawnEffect('beam-half ' + axis, half.left, half.top, { '--spark-color': color });
      beam.style.width = half.width + 'px';
      beam.style.height = half.height + 'px';
      beam.style.transformOrigin = half.origin;
      // Der Strahlkopf erreicht jede Zelle genau dann, wenn sie zerspringt.
      const reach = Math.max(60, length / bounds.pitch * STEP_MS);
      const total = reach + 300;
      const center = half.horizontal ? 'translateY(-50%) ' : 'translateX(-50%) ';
      const grow = value => half.horizontal ? 'scaleX(' + value + ')' : 'scaleY(' + value + ')';
      const thin = half.horizontal ? ' scaleY(.12)' : ' scaleX(.12)';
      runEffect(beam, [
        { transform: center + grow(0), opacity: 1 },
        { transform: center + grow(1), opacity: 1, offset: reach / total },
        { transform: center + grow(1) + thin, opacity: 0 }
      ], { duration: total, delay });
    }
    const core = spawnEffect('beam-core', point.x, point.y, { '--spark-color': color, '--effect-size': point.size + 'px' });
    runEffect(core, [
      { transform: 'translate(-50%, -50%) scale(.2)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(1.5)', opacity: .95, offset: .3 },
      { transform: 'translate(-50%, -50%) scale(2.3)', opacity: 0 }
    ], { duration: 440, delay, easing: 'ease-out' });
  }

  function emitBlast(point, delay, color, bounds) {
    const flash = spawnEffect('blast-flash', point.x, point.y, { '--spark-color': color });
    flash.style.width = flash.style.height = bounds.pitch * 3.1 + 'px';
    runEffect(flash, [
      { transform: 'translate(-50%, -50%) scale(.25) rotate(-8deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.02) rotate(0)', opacity: .95, offset: .28 },
      { transform: 'translate(-50%, -50%) scale(1.12)', opacity: 0 }
    ], { duration: 480, delay, easing: 'ease-out' });
    const wave = spawnEffect('shockwave', point.x, point.y, { '--spark-color': color });
    wave.style.width = wave.style.height = bounds.pitch + 'px';
    runEffect(wave, [
      { transform: 'translate(-50%, -50%) scale(.3)', opacity: 1, borderWidth: '7px' },
      { transform: 'translate(-50%, -50%) scale(4.4)', opacity: 0, borderWidth: '1px' }
    ], { duration: 640, delay, easing: 'cubic-bezier(.12, .7, .3, 1)' });
    burstShards(point, '#ffd27a', 9, delay, 1.7);
    burstShards(point, color, 6, delay + 40, 1.25);
  }

  function emitRays(activation, index, step, delay, lead) {
    const source = cellEffectPoint(activation);
    const rainbow = activation.special === 'prism' && !activation.targetColor;
    const rayColor = activation.targetColor ? GEM_HEX[activation.targetColor] : GEM_HEX.prism;
    const burst = spawnEffect('prism-burst', source.x, source.y, { '--spark-color': rayColor, '--effect-size': source.size + 'px' });
    runEffect(burst, [
      { transform: 'translate(-50%, -50%) scale(.2) rotate(0)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(2.2) rotate(120deg)', opacity: .9, offset: .45 },
      { transform: 'translate(-50%, -50%) scale(3.4) rotate(200deg)', opacity: 0 }
    ], { duration: 760, delay, easing: 'ease-out' });
    for (const cell of step.cleared) {
      if (cell.cause !== index || (cell.row === activation.row && cell.col === activation.col)) continue;
      const target = cellEffectPoint(cell);
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const ray = spawnEffect('prism-ray' + (rainbow ? ' rainbow' : ''), source.x, source.y, { '--spark-color': rayColor });
      ray.style.width = Math.hypot(dx, dy) + 'px';
      const angle = Math.atan2(dy, dx).toFixed(3) + 'rad';
      const travel = Math.max(80, (cell.delay - activation.time) * STEP_MS);
      const total = travel + 240;
      runEffect(ray, [
        { transform: 'translateY(-50%) rotate(' + angle + ') scaleX(0)', opacity: 1 },
        { transform: 'translateY(-50%) rotate(' + angle + ') scaleX(1)', opacity: 1, offset: travel / total },
        { transform: 'translateY(-50%) rotate(' + angle + ') scaleX(1)', opacity: 0 }
      ], { duration: total, delay, easing: 'ease-out' });
    }
    if (lead && activation.booster) emitCharge(source, lead, rayColor);
  }

  function emitCharge(point, lead, color) {
    const charge = spawnEffect('booster-charge', point.x, point.y, { '--spark-color': color, '--effect-size': point.size + 'px' });
    runEffect(charge, [
      { transform: 'translate(-50%, -50%) scale(2.6) rotate(0)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.4) rotate(90deg)', opacity: 1, offset: .5 },
      { transform: 'translate(-50%, -50%) scale(.4) rotate(180deg)', opacity: 0 }
    ], { duration: lead + 60, delay: 0, easing: 'ease-in' });
  }

  function emitHammer(point, lead) {
    const hammer = spawnEffect('hammer-strike', point.x, point.y, { '--effect-size': point.size + 'px' });
    hammer.textContent = BOOSTER_INFO.hammer.icon;
    runEffect(hammer, [
      { transform: 'translate(-20%, -160%) rotate(-75deg) scale(1.15)', opacity: 0 },
      { transform: 'translate(-20%, -150%) rotate(-80deg) scale(1.2)', opacity: 1, offset: .35 },
      { transform: 'translate(-50%, -78%) rotate(18deg) scale(1.1)', opacity: 1, offset: .82 },
      { transform: 'translate(-50%, -84%) rotate(8deg) scale(1)', opacity: 0 }
    ], { duration: lead + 180, delay: 0, easing: 'cubic-bezier(.5, 0, .9, .5)' });
  }

  function emitBorn(position, color) {
    if (reducedMotion) return;
    const point = cellEffectPoint(position);
    const ring = spawnEffect('born-ring', point.x, point.y, { '--spark-color': color, '--effect-size': point.size + 'px' });
    runEffect(ring, [
      { transform: 'translate(-50%, -50%) scale(1.9) rotate(0)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1) rotate(60deg)', opacity: 1, offset: .55 },
      { transform: 'translate(-50%, -50%) scale(.7) rotate(90deg)', opacity: 0 }
    ], { duration: 420, delay: 0, easing: 'ease-out' });
    burstShards(point, '#ffffff', 6, 180, .8);
  }

  function boardImpact(heavy, delay) {
    if (reducedMotion) return;
    const token = turnToken;
    clearTimeout(impactTimer);
    impactTimer = window.setTimeout(() => {
      if (token !== turnToken) return;
      boardEl.classList.remove('cascade-impact', 'heavy-impact');
      void boardEl.offsetWidth;
      boardEl.classList.add(heavy ? 'heavy-impact' : 'cascade-impact');
      window.setTimeout(() => boardEl.classList.remove('cascade-impact', 'heavy-impact'), heavy ? 460 : 360);
    }, delay);
  }

  function emitClearEffects(step, timing, lead) {
    if (reducedMotion || !step.cleared.length) return;
    const bounds = gridBounds();
    const count = step.cleared.length;
    const shardsPerCell = count > 30 ? 2 : count > 14 ? 3 : 5;
    let sumX = 0;
    let sumY = 0;
    for (const cell of step.cleared) {
      const key = positionKey(cell);
      const point = cellEffectPoint(cell);
      const color = gemColor(cell.gem);
      const delay = timing.delays.get(key) || 0;
      sumX += point.x;
      sumY += point.y;
      if (timing.merges.has(key)) continue;
      emitPop(point, color, delay + 60);
      burstShards(point, color, shardsPerCell, delay + 80);
    }
    let heavy = false;
    let firstActivation = Infinity;
    step.activations.forEach((activation, index) => {
      const delay = lead + Math.round(activation.time * STEP_MS);
      const point = cellEffectPoint(activation);
      const color = activation.special === 'prism' ? GEM_HEX.prism : GEM_HEX[activation.color] || '#ffffff';
      firstActivation = Math.min(firstActivation, delay);
      heavy = true;
      if (activation.special === 'row' || activation.special === 'column') emitBeam(point, activation.special, delay, color, bounds);
      else if (activation.special === 'cross') {
        emitCharge(point, lead, '#ffe28a');
        emitBeam(point, 'row', delay, '#ffe28a', bounds);
        emitBeam(point, 'column', delay, '#ffe28a', bounds);
      } else if (activation.special === 'bomb') emitBlast(point, delay, color, bounds);
      else if (activation.special === 'prism' || activation.special === 'color') emitRays(activation, index, step, delay, lead);
      else if (activation.special === 'hammer') {
        emitHammer(point, lead);
        burstShards(point, '#c9a46a', 6, delay + 20, 1.2);
      }
    });
    boardImpact(heavy, heavy ? firstActivation + 40 : 40);
    const level = Math.min(5, step.cascade);
    addEffect('score-burst level-' + level, {
      x: sumX / count,
      y: sumY / count,
      size: cellEffectPoint(step.cleared[0]).size
    }, { '--score-text': '"+' + formatScore(step.score) + '"', '--burst-delay': (timing.maxDelay * .5) + 'ms' });
  }

  function emitLanding(points) {
    if (reducedMotion) return;
    for (const landing of points) {
      const dust = spawnEffect('land-dust', landing.x, landing.y, { '--effect-size': landing.size + 'px' });
      runEffect(dust, [
        { transform: 'translate(-50%, -50%) scale(.3, .3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1, .55)', opacity: .7, offset: .3 },
        { transform: 'translate(-50%, -50%) scale(1.5, .35)', opacity: 0 }
      ], { duration: 360, delay: landing.delay, easing: 'ease-out' });
    }
  }

  function pulseSlot(type) {
    const slot = slots[type];
    if (!slot) return;
    slot.classList.remove('got');
    void slot.offsetWidth;
    slot.classList.add('got');
    window.setTimeout(() => slot.classList.remove('got'), 700);
  }

  function flyTreasure(position, type, delay) {
    const slot = slots[type];
    if (reducedMotion || !slot) {
      pulseSlot(type);
      return;
    }
    const from = cells[indexOf(position)].button.getBoundingClientRect();
    const to = slot.getBoundingClientRect();
    const startX = from.left + from.width / 2;
    const startY = from.top + from.height / 2;
    const dx = to.left + to.width / 2 - startX;
    const dy = to.top + to.height / 2 - startY;
    const flyer = document.createElement('span');
    flyer.className = 'fly-treasure';
    flyer.textContent = BOOSTER_INFO[type].icon;
    flyer.setAttribute('aria-hidden', 'true');
    flyer.style.left = startX + 'px';
    flyer.style.top = startY + 'px';
    document.body.append(flyer);
    if (typeof flyer.animate !== 'function') {
      flyer.remove();
      pulseSlot(type);
      return;
    }
    const lift = Math.min(120, 40 + Math.hypot(dx, dy) * .15);
    const animation = flyer.animate([
      { transform: 'translate(-50%, -50%) scale(.3)', opacity: 0 },
      { transform: 'translate(-50%, -50%) translateY(-24px) scale(1.6)', opacity: 1, offset: .18 },
      { transform: 'translate(-50%, -50%) translate(' + (dx * .5) + 'px, ' + (dy * .5 - lift) + 'px) scale(1.2)', opacity: 1, offset: .55 },
      { transform: 'translate(-50%, -50%) translate(' + dx + 'px, ' + dy + 'px) scale(.6)', opacity: .3 }
    ], { duration: 820, delay: delay + 120, easing: 'cubic-bezier(.4, 0, .5, 1)', fill: 'both' });
    animation.finished.then(() => { flyer.remove(); pulseSlot(type); }, () => flyer.remove());
    window.setTimeout(() => flyer.remove(), delay + 1600);
  }

  // ---------------------------------------------------------------- Audio

  function initAudio() {
    if (!state.sound) return null;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioCtor();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 1;
        masterGain.connect(audioContext.destination);
        noiseBuffer = null;
      }
      if (masterGain) masterGain.gain.value = 1;
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      return audioContext;
    } catch (_error) {
      return null;
    }
  }

  function tone(frequency, duration, options = {}) {
    const ac = initAudio();
    if (!ac || !masterGain) return;
    const start = ac.currentTime + (options.delay || 0);
    const oscillator = ac.createOscillator();
    const gain = ac.createGain();
    oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    if (options.to) oscillator.frequency.exponentialRampToValueAtTime(options.to, start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.gain || .045, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  function noise(duration, options = {}) {
    const ac = initAudio();
    if (!ac || !masterGain) return;
    if (!noiseBuffer) {
      noiseBuffer = ac.createBuffer(1, Math.floor(ac.sampleRate * .8), ac.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
    }
    const start = ac.currentTime + (options.delay || 0);
    const source = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.cutoff || 1200, start);
    if (options.cutoffTo) filter.frequency.exponentialRampToValueAtTime(options.cutoffTo, start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.gain || .06, start + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(start);
    source.stop(start + duration + .02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  function playSound(name, level = 1, delay = 0) {
    if (!state.sound) return;
    if (name === 'select') tone(460, .07, { to: 560, type: 'sine', gain: .025, delay });
    else if (name === 'swap') {
      tone(330, .11, { to: 520, type: 'sine', gain: .026, delay });
      tone(520, .1, { delay: delay + .045, to: 390, type: 'triangle', gain: .02 });
    } else if (name === 'invalid') tone(190, .14, { to: 145, type: 'triangle', gain: .035, delay });
    else if (name === 'match') {
      const base = 430 + Math.min(5, level) * 55;
      tone(base, .14, { to: base * 1.14, type: 'triangle', gain: .04, delay });
      tone(base * 1.25, .12, { delay: delay + .045, type: 'sine', gain: .03 });
    } else if (name === 'special') {
      [523, 659, 784].forEach((note, index) => tone(note, .25, { delay: delay + index * .055, type: 'triangle', gain: .04 }));
    } else if (name === 'line') {
      tone(1500, .3, { to: 240, type: 'sawtooth', gain: .018, delay });
      tone(760, .26, { to: 190, type: 'triangle', gain: .03, delay: delay + .02 });
      noise(.22, { gain: .025, cutoff: 5200, cutoffTo: 700, delay });
    } else if (name === 'bomb') {
      noise(.48, { gain: .1, cutoff: 1600, cutoffTo: 120, delay });
      tone(130, .42, { to: 40, type: 'sine', gain: .1, delay });
    } else if (name === 'prism') {
      [880, 1175, 1397, 1760, 2093].forEach((note, index) => tone(note, .24, { delay: delay + index * .045, type: 'sine', gain: .026 }));
    } else if (name === 'hammer') {
      tone(170, .14, { to: 80, type: 'triangle', gain: .08, delay });
      noise(.14, { gain: .07, cutoff: 2600, cutoffTo: 400, delay });
    } else if (name === 'collect') {
      [988, 1319, 1760].forEach((note, index) => tone(note, .2, { delay: delay + index * .07, type: 'triangle', gain: .035 }));
    } else if (name === 'land') tone(210, .07, { to: 140, type: 'sine', gain: .02, delay });
    else if (name === 'booster') tone(520, .2, { to: 1040, type: 'triangle', gain: .035, delay });
    else if (name === 'power') {
      [392, 523, 659, 784].forEach((note, index) => tone(note, .3, { delay: delay + index * .06, type: 'sine', gain: .045 }));
    } else if (name === 'shuffle') tone(260, .24, { to: 620, type: 'triangle', gain: .035, delay });
    else if (name === 'win') [523, 659, 784, 1047].forEach((note, index) => tone(note, .32, { delay: delay + index * .08, type: 'sine', gain: .05 }));
    else if (name === 'lose') tone(320, .55, { to: 105, type: 'triangle', gain: .05, delay });
  }

  function playStepSounds(step, lead) {
    playSound(step.created.length ? 'special' : 'match', step.cascade, lead / 1000);
    const played = new Set();
    for (const activation of step.activations) {
      const name = activation.special === 'row' || activation.special === 'column' || activation.special === 'cross' ? 'line'
        : activation.special === 'prism' || activation.special === 'color' ? 'prism' : activation.special;
      const delay = (lead + activation.time * STEP_MS) / 1000;
      const slot = name + ':' + Math.round(delay * 10);
      if (played.has(slot) || played.size >= 5) continue;
      played.add(slot);
      playSound(name, step.cascade, name === 'hammer' ? Math.max(0, lead - 40) / 1000 : delay);
    }
  }

  // ---------------------------------------------------------------- Darstellung

  function clearVisual(exceptHint = false) {
    visual.clearing.clear();
    visual.clearDelay.clear();
    visual.merging.clear();
    visual.falling.clear();
    visual.swapping.clear();
    visual.invalid.clear();
    visual.created.clear();
    visual.entering.clear();
    visual.victory.clear();
    if (!exceptHint) {
      visual.hinted.clear();
      visual.hintDir.clear();
    }
  }

  function gemLabel(position, gem) {
    let label = 'Zeile ' + (position.row + 1) + ', Spalte ' + (position.col + 1) + ': ';
    if (!gem) return label + 'leer';
    label += gem.special === 'prism' ? SPECIAL_INFO.prism.label : NAMES[gem.color];
    if (gem.special && gem.special !== 'prism') label += ', ' + SPECIAL_INFO[gem.special].label + ' (' + SPECIAL_INFO[gem.special].effect + ')';
    if (gem.special === 'prism') label += ' (' + SPECIAL_INFO.prism.effect + ')';
    if (gem.treasure) label += ', trägt Fundstück ' + BOOSTER_INFO[gem.treasure].name;
    if (state.selected && state.selected.row === position.row && state.selected.col === position.col) label += ', ausgewählt';
    return label;
  }

  function chainRange(keys) {
    return Logic.expandSpecials(state.board, keys, new Set());
  }

  function boosterRange(type, position) {
    const gem = state.board[position.row]?.[position.col];
    if (!gem) return new Set();
    const keys = new Set([positionKey(position)]);
    if (type === 'cross') {
      for (let col = 0; col < Logic.CONFIG.cols; col++) keys.add(position.row + ':' + col);
      for (let row = 0; row < Logic.CONFIG.rows; row++) keys.add(row + ':' + position.col);
    } else if (type === 'color') {
      const color = gem.special === 'prism' ? Logic.mostCommonColor(state.board) : gem.color;
      state.board.forEach((line, row) => line.forEach((item, col) => { if (item && item.color === color) keys.add(row + ':' + col); }));
    }
    return chainRange(keys);
  }

  // Zeigt vor dem Auslösen, welche Felder ein Spezialjuwel oder Booster treffen würde.
  function computeRange() {
    if (state.status !== 'playing') return new Set();
    if (state.boosterMode) {
      const focusedCell = document.activeElement?.classList?.contains('cell');
      const index = hoverIndex != null ? hoverIndex : focusedCell ? state.focusIndex : null;
      return index == null ? new Set() : boosterRange(state.boosterMode, positionOf(index));
    }
    const source = state.selected || (hoverIndex != null ? positionOf(hoverIndex) : null);
    if (!source) return new Set();
    const gem = state.board[source.row]?.[source.col];
    if (!gem || !gem.special || gem.special === 'prism') return new Set();
    return chainRange(new Set([positionKey(source)]));
  }

  function setHover(index) {
    if (hoverIndex === index) return;
    hoverIndex = index;
    if (state.status === 'playing') render();
  }

  function updateScoreDisplay() {
    const element = $('score');
    if (reducedMotion || state.score < shownScore) {
      cancelAnimationFrame(scoreFrame);
      scoreFrame = 0;
      shownScore = state.score;
      element.textContent = formatScore(state.score);
      return;
    }
    if (scoreFrame) return;
    const stepScore = () => {
      const difference = state.score - shownScore;
      if (difference <= 0) {
        scoreFrame = 0;
        shownScore = state.score;
        element.textContent = formatScore(state.score);
        return;
      }
      shownScore += Math.max(7, Math.ceil(difference * .16));
      if (shownScore > state.score) shownScore = state.score;
      element.textContent = formatScore(shownScore);
      scoreFrame = requestAnimationFrame(stepScore);
    };
    scoreFrame = requestAnimationFrame(stepScore);
  }

  function render() {
    const locked = state.status !== 'playing';
    visual.range = computeRange();
    boardEl.classList.toggle('locked', locked);
    boardEl.classList.toggle('booster-aim', !!state.boosterMode && !locked);
    boardEl.dataset.phase = state.status;
    for (let index = 0; index < cells.length; index++) {
      const position = positionOf(index);
      const key = positionKey(position);
      const gemData = state.board[position.row]?.[position.col] || null;
      const cell = cells[index];
      const selected = !!state.selected && state.selected.row === position.row && state.selected.col === position.col;
      cell.button.className = 'cell';
      if (selected) cell.button.classList.add('selected');
      for (const name of ['clearing', 'created', 'entering', 'victory', 'hinted']) {
        if (visual[name].has(key)) cell.button.classList.add(name);
      }
      if (visual.range.has(key)) cell.button.classList.add('in-range');
      const fall = visual.falling.get(key);
      const swap = visual.swapping.get(key);
      const invalid = visual.invalid.get(key);
      const merge = visual.merging.get(key);
      if (fall) {
        cell.button.classList.add('falling');
        if (fall.spawned) cell.button.classList.add('spawned');
      }
      if (swap) cell.button.classList.add('swapping');
      if (swap && swap.lead) cell.button.classList.add('swap-lead');
      if (invalid) cell.button.classList.add('invalid');
      if (merge) cell.button.classList.add('merging');
      cell.button.tabIndex = index === state.focusIndex ? 0 : -1;
      cell.button.setAttribute('aria-selected', String(selected));
      cell.button.setAttribute('aria-label', gemLabel(position, gemData));
      cell.button.setAttribute('aria-disabled', String(locked));

      cell.gem.className = 'gem';
      for (const property of ['--move-x', '--move-y', '--swap-duration', '--swap-lift', '--fall-y', '--fall-delay', '--fall-duration', '--bounce', '--victory-delay', '--enter-y', '--enter-delay', '--shuffle-delay', '--clear-delay', '--merge-x', '--merge-y', '--hint-x', '--hint-y']) {
        cell.gem.style.removeProperty(property);
      }
      cell.gem.style.setProperty('--idle-delay', ((index * 137) % 1900) + 'ms');
      cell.gem.style.setProperty('--shuffle-delay', (((position.row * 3 + position.col * 5) % 11) * 18) + 'ms');
      if (visual.entering.has(key)) {
        cell.gem.style.setProperty('--enter-y', (-(enterPitch || 48) * (Logic.CONFIG.rows + .6)) + 'px');
        cell.gem.style.setProperty('--enter-delay', (position.col * 34 + (Logic.CONFIG.rows - 1 - position.row) * 16) + 'ms');
      }
      if (fall) {
        cell.gem.style.setProperty('--fall-y', (-fall.pixels) + 'px');
        cell.gem.style.setProperty('--fall-delay', fall.delay + 'ms');
        cell.gem.style.setProperty('--fall-duration', fall.duration + 'ms');
        cell.gem.style.setProperty('--bounce', String(fall.bounce));
      }
      const exchange = swap || invalid;
      if (exchange) {
        cell.gem.style.setProperty('--move-x', exchange.x + 'px');
        cell.gem.style.setProperty('--move-y', exchange.y + 'px');
        cell.gem.style.setProperty('--swap-duration', (exchange.duration || 270) + 'ms');
        cell.gem.style.setProperty('--swap-lift', String(exchange.lead ? 1.16 : .9));
      }
      if (visual.clearing.has(key)) cell.gem.style.setProperty('--clear-delay', (visual.clearDelay.get(key) || 0) + 'ms');
      if (merge) {
        cell.gem.style.setProperty('--merge-x', merge.x + 'px');
        cell.gem.style.setProperty('--merge-y', merge.y + 'px');
      }
      const hintDir = visual.hintDir.get(key);
      if (hintDir) {
        cell.gem.style.setProperty('--hint-x', hintDir.x + '%');
        cell.gem.style.setProperty('--hint-y', hintDir.y + '%');
      }
      if (visual.victory.has(key)) {
        cell.gem.style.setProperty('--victory-delay', ((position.row + position.col) * 42) + 'ms');
      }
      if (gemData) {
        if (gemData.special === 'prism') cell.gem.classList.add('gem-prism');
        else cell.gem.classList.add('gem-' + gemData.color);
        if (gemData.special && gemData.special !== 'prism') cell.gem.classList.add('special-' + gemData.special);
        if (gemData.special) cell.button.classList.add('aura-' + gemData.special);
        cell.button.style.setProperty('--gem-color', gemColor(gemData));
        cell.symbol.textContent = gemData.special === 'prism' ? PRISM_SYMBOL : SYMBOLS[gemData.color];
        cell.gem.hidden = false;
        if (gemData.treasure) {
          cell.button.classList.add('has-treasure', 'treasure-' + gemData.treasure);
          cell.badge.textContent = BOOSTER_INFO[gemData.treasure].icon;
        } else cell.badge.textContent = '';
      } else {
        cell.symbol.textContent = '';
        cell.badge.textContent = '';
        cell.gem.hidden = true;
      }
    }

    updateScoreDisplay();
    $('target').textContent = formatScore(state.target);
    $('moves').textContent = String(state.moves);
    $('high-score').textContent = formatScore(state.highScore);
    const goal = Math.min(100, state.score / state.target * 100);
    $('goal-fill').style.width = goal + '%';
    document.querySelector('.goal-track').setAttribute('aria-valuenow', String(Math.min(state.target, state.score)));
    document.querySelector('.goal-track').setAttribute('aria-valuemax', String(state.target));

    const leaves = [...$('power-leaves').children];
    leaves.forEach((leaf, index) => {
      leaf.classList.toggle('filled', index < state.charge);
      leaf.textContent = index < state.charge ? '◆' : '◇';
    });
    $('power-leaves').setAttribute('aria-label', 'Panda-Pfote: ' + state.charge + ' von ' + Logic.CONFIG.pandaCharge + ' geladen');
    const powerReady = state.charge >= Logic.CONFIG.pandaCharge;
    document.querySelector('.panda-power').classList.toggle('ready', powerReady);
    document.querySelector('.panda-power').classList.toggle('active', state.powerMode);
    $('power-btn').disabled = !powerReady || state.status !== 'playing';
    $('power-btn').setAttribute('aria-pressed', String(state.powerMode));
    $('power-btn').textContent = state.powerMode ? '🐾 Zwei wählen' : '🐾 Fern-Tausch';
    $('power-copy').textContent = state.powerMode ? 'Zwei beliebige Juwelen wählen' : powerReady ? 'Fern-Tausch bereit' : 'Kaskaden sammeln';

    let stock = 0;
    for (const type of Logic.BOOSTERS) {
      const slot = slots[type];
      if (!slot) continue;
      const count = state.boosters[type] || 0;
      const active = state.boosterMode === type;
      stock += count;
      slot.querySelector('.slot-count').textContent = '×' + count;
      slot.classList.toggle('empty', count === 0);
      slot.classList.toggle('active', active);
      slot.setAttribute('aria-pressed', String(active));
      slot.setAttribute('aria-label', BOOSTER_INFO[type].name + ': ' + count + ' von ' + Logic.CONFIG.boosterMax + ' – ' + BOOSTER_INFO[type].effect + ', kostet keinen Zug');
      slot.disabled = state.status !== 'playing';
    }
    document.querySelector('.treasure-bag').classList.toggle('aiming', !!state.boosterMode);
    $('bag-copy').textContent = state.boosterMode
      ? 'Ziel-Juwel antippen · Esc bricht ab'
      : stock ? 'Antippen, dann Ziel wählen – kostet keinen Zug' : 'Juwelen mit Fundstück abräumen';

    const blocked = state.status !== 'playing';
    $('hint-btn').disabled = blocked;
    $('new-btn').disabled = state.status === 'resolving' || state.status === 'celebrating';
    $('sound-btn').setAttribute('aria-pressed', String(state.sound));
    $('sound-btn').textContent = state.sound ? '🔊 Ton an' : '🔇 Ton aus';
    boardEl.setAttribute('aria-busy', String(state.status === 'resolving' || state.status === 'celebrating'));
    scheduleSave();
  }

  // ---------------------------------------------------------------- Tipps

  function gemPreview(colorName, special) {
    const gem = document.createElement('span');
    gem.className = 'gem ' + (special === 'prism' ? 'gem-prism' : 'gem-' + colorName + (special ? ' special-' + special : ''));
    gem.setAttribute('aria-hidden', 'true');
    const mark = document.createElement('span');
    mark.className = 'gem-mark';
    const symbol = document.createElement('span');
    symbol.className = 'gem-symbol';
    symbol.textContent = special === 'prism' ? PRISM_SYMBOL : SYMBOLS[colorName];
    gem.append(mark, symbol);
    return gem;
  }

  function queueTip(id, build) {
    if (state.seen.has(id)) return;
    state.seen.add(id);
    saveSettings();
    tipQueue.push(build);
    if ($('special-tip').hidden && !tipTimer) showNextTip();
  }

  function showNextTip() {
    const tip = $('special-tip');
    tipTimer = 0;
    const build = tipQueue.shift();
    if (!build) {
      tip.hidden = true;
      return;
    }
    const content = build();
    $('tip-visual').replaceChildren(content.visual);
    $('tip-title').textContent = content.title;
    $('tip-text').textContent = content.text;
    tip.hidden = false;
    tip.classList.remove('show');
    void tip.offsetWidth;
    tip.classList.add('show');
    tipShownAt = Date.now();
    tipTimer = window.setTimeout(hideTip, 5600);
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tipTimer = 0;
    $('special-tip').hidden = true;
    if (tipQueue.length) tipTimer = window.setTimeout(showNextTip, 260);
  }

  function tipForSpecial(gem) {
    const kind = gem.special === 'row' || gem.special === 'column' ? 'line' : gem.special;
    queueTip('special-' + kind, () => {
      const info = SPECIAL_INFO[gem.special];
      const text = gem.special === 'prism'
        ? 'Tausche das Prisma mit einem Nachbarn: Alle Juwelen dieser Farbe verschwinden.'
        : 'Bilde damit eine Reihe oder triff es mit einer Explosion – dann ' + info.effect + '.';
      return { visual: gemPreview(gem.color || 'amber', gem.special), title: 'Neu: ' + info.name, text: info.how + ' erzeugen es. ' + text };
    });
  }

  function tipForTreasure(type) {
    queueTip('treasure-' + type, () => {
      const icon = document.createElement('span');
      icon.className = 'tip-icon';
      icon.textContent = BOOSTER_INFO[type].icon;
      return {
        visual: icon,
        title: 'Fundstück: ' + BOOSTER_INFO[type].name,
        text: 'Liegt jetzt im Schatzbeutel. Einsetzen, Ziel antippen – ' + BOOSTER_INFO[type].effect + ', ohne einen Zug zu kosten.'
      };
    });
  }

  // ---------------------------------------------------------------- Spielablauf

  function treasureOptions() {
    return { random: treasureRandom, chance: TREASURE_CHANCE, max: 1 };
  }

  function newGame(seed, shouldFocus = true) {
    const token = ++turnToken;
    clearTimeout(hintTimer);
    clearTimeout(comboTimer);
    clearTimeout(entranceTimer);
    clearTimeout(effectTimer);
    clearTimeout(impactTimer);
    comboTimer = 0;
    entranceTimer = 0;
    effectTimer = 0;
    pointerGesture = null;
    effectsEl.replaceChildren();
    boardEl.classList.remove('cascade-impact', 'heavy-impact', 'shuffle-out', 'shuffle-in', 'level-complete', 'level-cleared', 'round-lost');
    $('level-banner').hidden = true;
    state.seed = String(seed || ('juwelen-' + Date.now() + '-' + Math.floor(Math.random() * 1000000)));
    random = Logic.seededRandom(state.seed);
    treasureRandom = Logic.seededRandom(state.seed + ':fund');
    state.board = Logic.createBoard({ random });
    state.score = 0;
    state.moves = Logic.CONFIG.moves;
    state.target = Logic.CONFIG.target;
    state.charge = 0;
    state.selected = null;
    state.focusIndex = 0;
    state.powerMode = false;
    state.boosterMode = null;
    state.status = 'playing';
    state.turns = 0;
    state.largestCascade = 0;
    clearVisual();
    enterPitch = rowPitch();
    for (let index = 0; index < Logic.CONFIG.rows * Logic.CONFIG.cols; index++) visual.entering.add(positionKey(positionOf(index)));
    $('result').hidden = true;
    $('result').classList.remove('won', 'lost');
    $('combo-pop').hidden = true;
    announce('Wähle zwei benachbarte Juwelen.');
    render();
    entranceTimer = window.setTimeout(() => {
      if (token !== turnToken) return;
      visual.entering.clear();
      entranceTimer = 0;
      render();
    }, motionTime(1150));
    if (shouldFocus) queueMicrotask(() => cells[0].button.focus({ preventScroll: true }));
  }

  function selectPosition(position) {
    if (state.status !== 'playing' || !Logic.inBounds(state.board, position)) return false;
    state.selected = { row: position.row, col: position.col };
    state.focusIndex = indexOf(position);
    visual.hinted.clear();
    visual.hintDir.clear();
    playSound('select');
    const gem = state.board[position.row][position.col];
    if (state.powerMode) announce('Erstes Juwel für den Fern-Tausch gewählt.');
    else if (gem && gem.special) {
      const info = SPECIAL_INFO[gem.special];
      announce(gem.special === 'prism'
        ? info.name + ': Tausche es mit einem Nachbarn – alle Juwelen dieser Farbe verschwinden.'
        : info.name + ' ' + info.effect + ' (markiert), sobald es Teil einer Reihe ist. Jetzt einen Nachbarn wählen.');
    } else announce('Juwel gewählt – jetzt einen Nachbarn auswählen.');
    render();
    return true;
  }

  function activatePower() {
    if (state.status !== 'playing' || state.charge < Logic.CONFIG.pandaCharge) return false;
    initAudio();
    state.powerMode = !state.powerMode;
    state.boosterMode = null;
    state.selected = null;
    visual.hinted.clear();
    visual.hintDir.clear();
    if (state.powerMode) {
      playSound('power');
      announce('Panda-Pfote aktiv: Wähle zwei beliebige Juwelen.');
    } else announce('Panda-Pfote abgebrochen.');
    render();
    return state.powerMode;
  }

  function toggleBooster(type) {
    if (state.status !== 'playing' || !BOOSTER_INFO[type]) return false;
    initAudio();
    const info = BOOSTER_INFO[type];
    if (state.boosterMode === type) {
      state.boosterMode = null;
      announce(info.name + ' wieder eingepackt.');
      render();
      return false;
    }
    if ((state.boosters[type] || 0) <= 0) {
      announce('Noch kein ' + info.name + ' im Schatzbeutel – räume ein Juwel mit ' + info.icon + '-Fundstück ab.');
      pulseSlot(type);
      return false;
    }
    state.boosterMode = type;
    state.powerMode = false;
    state.selected = null;
    visual.hinted.clear();
    visual.hintDir.clear();
    playSound('booster');
    announce(info.name + ' bereit: Tippe das Ziel-Juwel an – ' + info.effect + '. Kostet keinen Zug.');
    render();
    return true;
  }

  function showCombo(cascade) {
    if (cascade < 2) return;
    const popup = $('combo-pop');
    clearTimeout(comboTimer);
    popup.textContent = cascade + '× Kaskade!';
    popup.dataset.level = String(Math.min(5, cascade));
    popup.hidden = false;
    popup.style.animation = 'none';
    void popup.offsetWidth;
    popup.style.animation = '';
    comboTimer = window.setTimeout(() => {
      popup.hidden = true;
      comboTimer = 0;
    }, motionTime(760));
  }

  function exchangeMotions(from, to, amount = 1) {
    const first = cellMotion(from, to, amount);
    const second = cellMotion(to, from, amount);
    const duration = Math.min(520, 260 + Math.hypot(first.x, first.y) * .42);
    first.duration = duration;
    second.duration = duration;
    first.lead = true;
    return new Map([
      [positionKey(from), first],
      [positionKey(to), second]
    ]);
  }

  async function animateInvalid(from, to, token) {
    visual.swapping.clear();
    visual.invalid = exchangeMotions(from, to, state.powerMode ? .34 : .5);
    state.selected = null;
    playSound('invalid');
    announce(state.powerMode ? 'Dieser Fern-Tausch bildet keine Reihe – die Panda-Pfote bleibt geladen.' : 'Dieser Tausch springt zurück und kostet keinen Zug.');
    render();
    await waitForMotion(['jewel-reject'], 430);
    if (token !== turnToken) return;
    visual.invalid.clear();
    state.status = 'playing';
    render();
    cells[indexOf(to)].button.focus({ preventScroll: true });
  }

  async function animateShuffle(nextBoard, token) {
    clearVisual();
    boardEl.classList.remove('shuffle-in');
    boardEl.classList.add('shuffle-out');
    render();
    playSound('shuffle');
    announce('Keine Züge mehr – der Panda mischt den Schatzgarten neu …');
    await waitForMotion(['jewel-shuffle-out'], 460);
    if (token !== turnToken) return false;
    state.board = Logic.cloneBoard(nextBoard);
    boardEl.classList.remove('shuffle-out');
    boardEl.classList.add('shuffle-in');
    render();
    await waitForMotion(['jewel-shuffle-in'], 520);
    boardEl.classList.remove('shuffle-in');
    return token === turnToken;
  }

  function emitVictoryEffects() {
    if (reducedMotion) return;
    const host = effectsEl.getBoundingClientRect();
    const board = boardEl.getBoundingClientRect();
    const colors = Object.values(GEM_HEX);
    for (let index = 0; index < 30; index++) {
      addEffect('victory-confetti', {
        x: board.left - host.left + board.width * ((index * 37) % 101) / 100,
        y: board.top - host.top + board.height * (.12 + ((index * 19) % 24) / 100),
        size: 8 + index % 5
      }, {
        '--spark-color': colors[index % colors.length],
        '--confetti-x': ((index % 2 ? 1 : -1) * (24 + index % 7 * 8)) + 'px',
        '--confetti-delay': ((index * 31) % 280) + 'ms',
        '--confetti-turn': (180 + (index * 47) % 420) + 'deg'
      });
    }
  }

  async function celebrateWin(token) {
    state.status = 'celebrating';
    state.selected = null;
    state.powerMode = false;
    state.boosterMode = null;
    clearTimeout(comboTimer);
    comboTimer = 0;
    $('combo-pop').hidden = true;
    clearVisual();
    for (let index = 0; index < cells.length; index++) {
      const position = positionOf(index);
      if (state.board[position.row]?.[position.col]) visual.victory.add(positionKey(position));
    }
    boardEl.classList.add('level-complete');
    $('level-banner').hidden = false;
    announce('Ziel erreicht! Der Panda lässt den Schatzgarten aufleuchten.');
    emitVictoryEffects();
    render();
    playSound('win');
    await waitForMotion(['jewel-victory'], 1350);
    if (token !== turnToken) return false;
    state.board = Logic.createEmptyBoard(Logic.CONFIG.rows, Logic.CONFIG.cols);
    clearVisual();
    effectsEl.replaceChildren();
    boardEl.classList.remove('level-complete');
    boardEl.classList.add('level-cleared');
    render();
    await wait(180);
    if (token !== turnToken) return false;
    finishRound(true, { sound: false });
    return true;
  }

  // Bei neuen Spezialsteinen fliegen die übrigen Steine der Reihe in den neuen Stein hinein.
  function computeMerges(step) {
    const merges = new Map();
    if (!step.created.length) return merges;
    const matched = new Set(step.matched.map(positionKey));
    const cleared = new Set(step.cleared.map(positionKey));
    for (const creation of step.created) {
      const color = step.before[creation.row]?.[creation.col]?.color;
      if (!color) continue;
      const seen = new Set([positionKey(creation)]);
      const queue = [creation];
      while (queue.length) {
        const current = queue.shift();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const next = { row: current.row + dr, col: current.col + dc };
          const key = positionKey(next);
          if (seen.has(key) || !matched.has(key) || step.before[next.row]?.[next.col]?.color !== color) continue;
          seen.add(key);
          queue.push(next);
          if (cleared.has(key) && !merges.has(key)) merges.set(key, cellMotion(next, creation));
        }
      }
    }
    return merges;
  }

  function clearTiming(step, lead) {
    const merges = computeMerges(step);
    const delays = new Map();
    let maxDelay = 0;
    for (const cell of step.cleared) {
      const key = positionKey(cell);
      const delay = merges.has(key) ? lead : lead + Math.round(cell.delay * STEP_MS);
      delays.set(key, delay);
      maxDelay = Math.max(maxDelay, delay);
    }
    return { merges, delays, maxDelay };
  }

  // Schwerkraft: Fallzeit wächst mit der Wurzel der Fallhöhe, Steine einer Spalte starten von
  // unten nach oben versetzt und landen mit Stauchung, kleinem Rückprall und Staubwolke.
  function fallPlan(step) {
    const pitch = rowPitch();
    const fallMap = new Map();
    const landings = [];
    const rank = new Map();
    let fallFallback = 340;
    let firstLanding = Infinity;
    const movements = (step.falls || [])
      .filter(movement => movement.spawned || movement.distance > 0)
      .sort((a, b) => a.to.col - b.to.col || b.to.row - a.to.row);
    for (const movement of movements) {
      const col = movement.to.col;
      const order = rank.get(col) || 0;
      rank.set(col, order + 1);
      const delay = col * 11 + order * 26;
      const duration = Math.round(230 + Math.sqrt(movement.distance) * 165);
      fallFallback = Math.max(fallFallback, delay + duration);
      firstLanding = Math.min(firstLanding, delay + duration * .7);
      fallMap.set(positionKey(movement.to), {
        pixels: Math.max(pitch * movement.distance, pitch * .7),
        distance: movement.distance,
        spawned: movement.spawned,
        bounce: Math.min(1, .35 + movement.distance * .22).toFixed(2),
        delay,
        duration
      });
      if (order === 0 && movement.distance >= 2) {
        const point = cellEffectPoint(movement.to);
        landings.push({ x: point.x, y: point.y + point.size * .42, size: point.size, delay: delay + duration * .7 });
      }
    }
    return { fallMap, landings, fallFallback, firstLanding };
  }

  async function playSteps(result, token, lead) {
    for (let stepIndex = 0; stepIndex < result.steps.length; stepIndex++) {
      const step = result.steps[stepIndex];
      const stepLead = stepIndex === 0 ? lead : 0;
      if (token !== turnToken) return false;
      state.board = Logic.cloneBoard(step.before);
      const timing = clearTiming(step, stepLead);
      visual.clearing = new Set(step.cleared.map(cell => positionKey(cell)));
      visual.clearDelay = timing.delays;
      visual.merging = timing.merges;
      visual.falling.clear();
      visual.created.clear();
      state.score += step.score;
      if (state.score > state.highScore) state.highScore = state.score;
      state.largestCascade = Math.max(state.largestCascade, step.cascade);
      showCombo(step.cascade);
      announce(step.cascade > 1
        ? step.cascade + '× Kaskade – der Schatzgarten funkelt weiter!'
        : step.cleared.length + ' Juwelen leuchten auf …');
      for (const found of step.collected) {
        const type = found.treasure;
        if ((state.boosters[type] || 0) < Logic.CONFIG.boosterMax) state.boosters[type]++;
        flyTreasure(found, type, timing.delays.get(positionKey(found)) || stepLead);
        playSound('collect', 1, ((timing.delays.get(positionKey(found)) || stepLead) + 900) / 1000);
        tipForTreasure(type);
      }
      if (step.collected.length) saveSettings();
      playStepSounds(step, stepLead);
      render();
      emitClearEffects(step, timing, stepLead);
      const scoreStat = $('score').parentElement;
      scoreStat.classList.remove('score-pop');
      void scoreStat.offsetWidth;
      scoreStat.classList.add('score-pop');
      clearTimeout(effectTimer);
      effectTimer = window.setTimeout(() => scoreStat.classList.remove('score-pop'), motionTime(420));
      await waitForMotion(['jewel-crack', 'jewel-merge'], timing.maxDelay + 400);
      if (token !== turnToken) return false;

      state.board = Logic.cloneBoard(step.afterClear);
      visual.clearing.clear();
      visual.clearDelay.clear();
      visual.merging.clear();
      visual.created = new Set(step.created.map(creation => positionKey(creation)));
      render();
      for (const creation of step.created) {
        emitBorn(creation, gemColor(creation.gem));
        tipForSpecial(creation.gem);
      }
      if (step.created.length) await waitForMotion(['special-born'], 340);
      else await wait(70);
      if (token !== turnToken) return false;

      const plan = fallPlan(step);
      const createdDestinations = new Set();
      for (const creation of step.created) {
        const movement = (step.falls || []).find(item => !item.spawned && item.from.row === creation.row && item.from.col === creation.col);
        createdDestinations.add(positionKey(movement ? movement.to : creation));
      }
      state.board = Logic.cloneBoard(step.afterFall);
      visual.falling = plan.fallMap;
      visual.created = createdDestinations;
      render();
      emitLanding(plan.landings);
      if (plan.fallMap.size && Number.isFinite(plan.firstLanding)) playSound('land', 1, motionTime(plan.firstLanding) / 1000);
      await waitForMotion(['jewel-fall'], plan.fallFallback + 80);
      if (token !== turnToken) return false;
      visual.falling.clear();
      visual.created.clear();
      render();
      await wait(40);
    }
    return token === turnToken;
  }

  async function concludeTurn(result, token, booster) {
    if (token !== turnToken) return false;
    const settledBoard = Logic.cloneBoard(result.board);
    if (result.reshuffled) {
      if (!await animateShuffle(settledBoard, token)) return false;
    } else {
      state.board = settledBoard;
    }
    state.charge = Math.min(Logic.CONFIG.pandaCharge, state.charge + result.cascades);
    clearVisual();
    saveSettings();

    if (state.score >= state.target) {
      await celebrateWin(token);
    } else if (state.moves <= 0) {
      finishRound(false);
    } else {
      state.status = 'playing';
      render();
      const lead = booster ? BOOSTER_INFO[booster].name + ': ' : '';
      const specialText = result.created ? ' · ' + result.created + ' Spezialjuwel' + (result.created === 1 ? '' : 'e') : '';
      const foundText = result.collected && result.collected.length
        ? ' · Fundstück' + (result.collected.length === 1 ? '' : 'e') + ': ' + result.collected.map(found => BOOSTER_INFO[found.treasure].name).join(', ')
        : '';
      const powerText = state.charge >= Logic.CONFIG.pandaCharge ? ' Die Panda-Pfote ist bereit!' : '';
      const shuffleText = result.reshuffled ? ' Feld frisch gemischt.' : '';
      announce(lead + '+' + formatScore(result.score) + ' Punkte · ' + result.cascades + ' Kaskadenstufe' + (result.cascades === 1 ? '' : 'n') + specialText + foundText + '.' + shuffleText + powerText);
      queueMicrotask(() => cells[state.focusIndex].button.focus({ preventScroll: true }));
    }
    return true;
  }

  async function attemptSwap(from, to) {
    if (state.status !== 'playing' || !Logic.inBounds(state.board, from) || !Logic.inBounds(state.board, to)) return false;
    initAudio();
    const token = ++turnToken;
    const usingPower = state.powerMode;
    state.status = 'resolving';
    state.focusIndex = indexOf(to);
    clearTimeout(hintTimer);
    clearTimeout(entranceTimer);
    hintTimer = 0;
    entranceTimer = 0;
    clearVisual();

    const result = Logic.resolveTurn(state.board, from, to, { allowRemote: usingPower, random, treasure: treasureOptions() });
    if (!result.valid) {
      await animateInvalid(from, to, token);
      return false;
    }

    state.board = Logic.cloneBoard(result.steps[0]?.before || Logic.swapCells(state.board, from, to));
    visual.swapping = exchangeMotions(from, to);
    announce(usingPower ? 'Die Panda-Pfote tauscht zwei Juwelen …' : 'Juwelen tauschen …');
    playSound('swap');
    render();
    await waitForMotion(['jewel-swap'], usingPower ? 520 : 300);
    if (token !== turnToken) return false;

    state.moves--;
    state.turns++;
    state.selected = null;
    state.powerMode = false;
    if (result.usedPower) state.charge = 0;
    visual.swapping.clear();

    if (!await playSteps(result, token, 0)) return false;
    return concludeTurn(result, token, null);
  }

  async function applyBooster(position) {
    const type = state.boosterMode;
    if (!type || state.status !== 'playing' || !Logic.inBounds(state.board, position)) return false;
    if ((state.boosters[type] || 0) <= 0) {
      state.boosterMode = null;
      render();
      return false;
    }
    const result = Logic.useBooster(state.board, type, position, { random, treasure: treasureOptions() });
    if (!result.valid) return false;
    initAudio();
    const token = ++turnToken;
    clearTimeout(hintTimer);
    clearTimeout(entranceTimer);
    hintTimer = 0;
    entranceTimer = 0;
    state.status = 'resolving';
    state.focusIndex = indexOf(position);
    state.boosters[type]--;
    state.boosterMode = null;
    state.selected = null;
    hoverIndex = null;
    clearVisual();
    saveSettings();
    announce(BOOSTER_INFO[type].name + ' kommt zum Einsatz …');
    if (!await playSteps(result, token, BOOSTER_LEAD)) return false;
    return concludeTurn(result, token, type);
  }

  function finishRound(won, options = {}) {
    clearTimeout(hintTimer);
    clearTimeout(comboTimer);
    clearTimeout(entranceTimer);
    clearTimeout(effectTimer);
    clearTimeout(impactTimer);
    hintTimer = 0;
    comboTimer = 0;
    entranceTimer = 0;
    effectTimer = 0;
    pointerGesture = null;
    $('combo-pop').hidden = true;
    effectsEl.replaceChildren();
    clearVisual();
    boardEl.classList.remove('cascade-impact', 'heavy-impact', 'shuffle-out', 'shuffle-in', 'level-complete');
    boardEl.classList.toggle('round-lost', !won);
    if (!won) $('level-banner').hidden = true;
    state.status = won ? 'won' : 'lost';
    state.selected = null;
    state.powerMode = false;
    state.boosterMode = null;
    if (state.score > state.highScore) state.highScore = state.score;
    saveSettings();
    const summary = won
      ? formatScore(state.score) + ' Punkte mit ' + state.moves + ' übrigen Zügen. Größte Kaskade: ' + Math.max(1, state.largestCascade) + '×.'
      : formatScore(state.score) + ' von ' + formatScore(state.target) + ' Punkten. Beim nächsten Versuch wartet ein neues Feld.';
    announce(won ? 'Runde geschafft – der Schatzgarten ist vollständig erleuchtet.' : 'Runde beendet – diesmal fehlten noch ein paar Funken.');
    $('result-icon').textContent = won ? '🐼💎' : '🐼';
    $('result-title').textContent = won ? 'Schatzgarten erleuchtet!' : 'Fast geschafft';
    $('result-text').textContent = summary;
    $('result').classList.toggle('won', won);
    $('result').classList.toggle('lost', !won);
    $('result').hidden = false;
    render();
    if (options.sound !== false) playSound(won ? 'win' : 'lose');
    queueMicrotask(() => $('result-new-btn').focus());
  }

  // ---------------------------------------------------------------- Eingabe

  function handleCellClick(_event, index) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (state.status !== 'playing') return;
    initAudio();
    const position = positionOf(index);
    if (state.boosterMode) {
      applyBooster(position);
      return;
    }
    if (!state.selected) {
      selectPosition(position);
      return;
    }
    if (state.selected.row === position.row && state.selected.col === position.col) {
      state.selected = null;
      announce(state.powerMode ? 'Auswahl aufgehoben – Panda-Pfote bleibt aktiv.' : 'Auswahl aufgehoben.');
      render();
      return;
    }
    if (state.powerMode || Logic.isAdjacent(state.selected, position)) {
      const from = state.selected;
      attemptSwap(from, position);
      return;
    }
    selectPosition(position);
  }

  function moveFocus(index, deltaRow, deltaCol) {
    const current = positionOf(index);
    const row = Math.max(0, Math.min(Logic.CONFIG.rows - 1, current.row + deltaRow));
    const col = Math.max(0, Math.min(Logic.CONFIG.cols - 1, current.col + deltaCol));
    state.focusIndex = row * Logic.CONFIG.cols + col;
    render();
    cells[state.focusIndex].button.focus({ preventScroll: true });
  }

  function handleCellKeydown(event, index) {
    if (state.status === 'resolving' || state.status === 'celebrating') {
      if (event.key.startsWith('Arrow') || event.key === 'Enter' || event.key === ' ') event.preventDefault();
      return;
    }
    if (event.key === 'ArrowLeft') { event.preventDefault(); moveFocus(index, 0, -1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); moveFocus(index, 0, 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(index, -1, 0); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(index, 1, 0); }
    else if ((event.key === 'Enter' || event.key === ' ') && state.status === 'playing') {
      event.preventDefault();
      handleCellClick(event, index);
    }
  }

  function handlePointerDown(event, index) {
    if (!$('special-tip').hidden && Date.now() - tipShownAt > 1200) hideTip();
    if (state.status !== 'playing' || event.button !== 0 || state.boosterMode) return;
    pointerGesture = { index, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    try { cells[index].button.setPointerCapture(event.pointerId); } catch (_error) { /* capture is optional */ }
  }

  function handlePointerUp(event, index) {
    if (!pointerGesture || pointerGesture.pointerId !== event.pointerId || state.status !== 'playing') {
      pointerGesture = null;
      return;
    }
    const start = pointerGesture;
    pointerGesture = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const threshold = Math.max(14, cells[index].button.getBoundingClientRect().width * .22);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    event.preventDefault();
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 0);
    const from = positionOf(start.index);
    const to = { row: from.row, col: from.col };
    if (Math.abs(dx) > Math.abs(dy)) to.col += dx > 0 ? 1 : -1;
    else to.row += dy > 0 ? 1 : -1;
    if (Logic.inBounds(state.board, to)) attemptSwap(from, to);
  }

  function hint() {
    if (state.status !== 'playing') return null;
    initAudio();
    const moves = Logic.findValidMoves(state.board);
    if (!moves.length) {
      const shuffled = Logic.reshuffleBoard(state.board, random);
      state.board = shuffled.board;
      announce('Das Feld wurde gemischt – jetzt gibt es wieder einen Zug.');
      playSound('shuffle');
      render();
      return null;
    }
    clearTimeout(hintTimer);
    const choice = moves[(state.turns + state.focusIndex) % moves.length];
    const dRow = choice.to.row - choice.from.row;
    const dCol = choice.to.col - choice.from.col;
    visual.hinted = new Set([positionKey(choice.from), positionKey(choice.to)]);
    visual.hintDir = new Map([
      [positionKey(choice.from), { x: dCol * 16, y: dRow * 16 }],
      [positionKey(choice.to), { x: -dCol * 16, y: -dRow * 16 }]
    ]);
    state.selected = null;
    state.boosterMode = null;
    announce('Tipp: Tausche die beiden wackelnden Juwelen miteinander.');
    playSound('select');
    render();
    hintTimer = window.setTimeout(() => {
      visual.hinted.clear();
      visual.hintDir.clear();
      render();
    }, 2600);
    return { from: { ...choice.from }, to: { ...choice.to } };
  }

  function toggleSound() {
    state.sound = !state.sound;
    if (state.sound) {
      initAudio();
      playSound('select');
      announce('Sound eingeschaltet.');
    } else {
      if (masterGain && audioContext) {
        masterGain.gain.cancelScheduledValues(audioContext.currentTime);
        masterGain.gain.value = 0;
      }
      announce('Sound ausgeschaltet.');
    }
    render();
  }

  $('power-btn').addEventListener('click', activatePower);
  $('hint-btn').addEventListener('click', hint);
  $('sound-btn').addEventListener('click', toggleSound);
  $('new-btn').addEventListener('click', () => newGame());
  $('result-new-btn').addEventListener('click', () => newGame());
  $('result-close-btn').addEventListener('click', () => { $('result').hidden = true; });
  $('special-tip').addEventListener('click', hideTip);

  document.addEventListener('keydown', event => {
    if (!$('result').hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        $('result').hidden = true;
      }
      return;
    }
    const tag = event.target?.tagName || '';
    const isCell = event.target?.classList?.contains('cell');
    if ((tag === 'BUTTON' && !isCell) || tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'A') return;
    if (state.status !== 'playing') return;
    const key = event.key.toLowerCase();
    if (key === 'h') { event.preventDefault(); hint(); }
    else if (key === 'n') { event.preventDefault(); newGame(); }
    else if (key === '1' || key === '2' || key === '3') { event.preventDefault(); toggleBooster(Logic.BOOSTERS[Number(key) - 1]); }
    else if (event.key === 'Escape') {
      event.preventDefault();
      state.selected = null;
      state.powerMode = false;
      state.boosterMode = null;
      visual.hinted.clear();
      visual.hintDir.clear();
      if (!$('special-tip').hidden) hideTip();
      announce('Auswahl aufgehoben.');
      render();
    }
  });

  window.addEventListener('pagehide', saveSettings);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion = event => { reducedMotion = event.matches; };
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', syncMotion);

  buildBoard();
  readSettings();
  newGame(undefined, false);

  window.PandaJewels = Object.freeze({
    newGame,
    hint,
    activatePower,
    toggleBooster,
    select: (row, col) => selectPosition({ row, col }),
    swap: (from, to) => attemptSwap(from, to),
    useBooster: (type, position) => {
      if (state.boosterMode !== type && !toggleBooster(type)) return Promise.resolve(false);
      return applyBooster(position);
    },
    // Diagnose: ein vorbereitetes Feld laden (z. B. für Spezialstein-Ansichten in Tests).
    loadBoard: board => {
      if (state.status !== 'playing' || !Array.isArray(board) || board.length !== Logic.CONFIG.rows) return false;
      let next;
      try {
        next = board.map(row => {
          if (!Array.isArray(row) || row.length !== Logic.CONFIG.cols) throw new RangeError('Zeilenlänge');
          return row.map(gem => Logic.makeGem(gem.color, gem.special, gem.treasure));
        });
      } catch (_error) {
        return false;
      }
      state.board = next;
      state.selected = null;
      clearVisual();
      render();
      return true;
    },
    getState: () => ({
      board: Logic.cloneBoard(state.board),
      score: state.score,
      highScore: state.highScore,
      moves: state.moves,
      target: state.target,
      charge: state.charge,
      selected: state.selected ? { ...state.selected } : null,
      focusIndex: state.focusIndex,
      powerMode: state.powerMode,
      boosterMode: state.boosterMode,
      boosters: { ...state.boosters },
      status: state.status,
      sound: state.sound,
      audioMuted: !state.sound && (!masterGain || masterGain.gain.value === 0),
      seed: state.seed,
      turns: state.turns,
      largestCascade: state.largestCascade
    })
  });
})();
