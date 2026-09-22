/* === Gemeinsames Kartenmodul (seit v2.0) ===
   window.GameCards liefert für alle Kartenspiele
   - face(element, card): baut ein Kartengesicht (Index, Pips, Bildkarte) oder eine Rückseite,
   - flip(container, mutate, options): FLIP-Animation – Karten fliegen sichtbar
     zwischen zwei Renderings (Tap-Züge, Auto-Züge, Undo, Austeilen),
   - makeDraggable(config): Pointer-Drag mit echter Kartenvorschau unter dem
     Finger, Zielhervorhebung und Rückfeder-Animation bei ungültigem Ziel,
   - deal(container): gestaffeltes Einblenden nach einem neuen Deal,
   - Vierfarb-Schalter (♦ blau, ♣ grün) in der gemeinsamen Toolbar.
   Ohne Abhängigkeiten; respektiert prefers-reduced-motion. */
(() => {
  'use strict';

  const DECK_KEY = 'browser-games-deck';
  const SUIT_KEYS = {
    S: 'S', H: 'H', D: 'D', C: 'C',
    '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C',
    spade: 'S', heart: 'H', diamond: 'D', club: 'C',
    spades: 'S', hearts: 'H', diamonds: 'D', clubs: 'C'
  };
  const SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const CRESTS = { 11: '🎋', 12: '🌸', 13: '👑' };
  const DEFAULT_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];
  // Pip-Positionen in Prozent; drittes Feld = um 180° gedrehte untere Hälfte.
  // Das Pip-Feld liegt zwischen 29,5 % und 70,5 % der Kartenhöhe, damit es sich
  // weder mit dem oberen noch mit dem gespiegelten unteren Eckindex überschneidet.
  const PIPS = {
    2: [[50, 29.5], [50, 70.5, 1]],
    3: [[50, 29.5], [50, 50], [50, 70.5, 1]],
    4: [[31, 29.5], [69, 29.5], [31, 70.5, 1], [69, 70.5, 1]],
    5: [[31, 29.5], [69, 29.5], [50, 50], [31, 70.5, 1], [69, 70.5, 1]],
    6: [[31, 29.5], [69, 29.5], [31, 50], [69, 50], [31, 70.5, 1], [69, 70.5, 1]],
    7: [[31, 29.5], [69, 29.5], [50, 40], [31, 50], [69, 50], [31, 70.5, 1], [69, 70.5, 1]],
    8: [[31, 29.5], [69, 29.5], [50, 40], [31, 50], [69, 50], [50, 60, 1], [31, 70.5, 1], [69, 70.5, 1]],
    9: [[31, 29.5], [69, 29.5], [31, 43.2], [69, 43.2], [50, 50], [31, 56.8, 1], [69, 56.8, 1], [31, 70.5, 1], [69, 70.5, 1]],
    10: [[31, 29.5], [69, 29.5], [50, 36.4], [31, 43.2], [69, 43.2], [31, 56.8, 1], [69, 56.8, 1], [50, 63.6, 1], [31, 70.5, 1], [69, 70.5, 1]]
  };

  const reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !!(reduceQuery && reduceQuery.matches); }

  function suitKey(suit) {
    return SUIT_KEYS[suit] || SUIT_KEYS[String(suit).toLowerCase()] || 'S';
  }

  function span(className, text) {
    const node = document.createElement('span');
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function pipNode(symbol, x, y, inverted) {
    const pip = document.createElement('i');
    pip.textContent = symbol;
    pip.style.left = `${x}%`;
    pip.style.top = `${y}%`;
    if (inverted) pip.classList.add('pc-inv');
    return pip;
  }

  /* Räumt alle Kartenmerkmale von einem Element (z. B. leere Ablage). */
  function clear(element) {
    element.classList.remove('pc-card', 'pc-back', 'pc-ace', 'pc-court-card', 'pc-dense');
    delete element.dataset.suit;
    delete element.dataset.cardId;
    element.replaceChildren();
  }

  /* card: { rank: 1–13, suit: 'S'|'♠'|'spade'…, label?: 'K', faceDown?: bool, id?: string|number } */
  function face(element, card) {
    element.classList.add('pc-card');
    element.replaceChildren();
    if (card && card.id != null) element.dataset.cardId = String(card.id);
    else delete element.dataset.cardId;
    if (!card || card.faceDown) {
      element.classList.add('pc-back');
      element.classList.remove('pc-ace', 'pc-court-card', 'pc-dense');
      delete element.dataset.suit;
      return element;
    }
    element.classList.remove('pc-back');
    const key = suitKey(card.suit);
    const symbol = SYMBOLS[key];
    const rank = Number(card.rank);
    const label = card.label != null ? String(card.label) : DEFAULT_LABELS[rank] || String(rank);
    element.dataset.suit = key;
    element.classList.toggle('pc-ace', rank === 1);
    element.classList.toggle('pc-court-card', rank >= 11);
    element.classList.toggle('pc-dense', rank >= 9 && rank <= 10);

    const top = span('pc-index pc-index-top');
    top.append(span('pc-rank', label), span('pc-pip', symbol));
    const bottom = span('pc-index pc-index-bottom');
    bottom.append(span('pc-rank', label), span('pc-pip', symbol));
    const center = span('pc-center');
    if (rank === 1) {
      center.append(pipNode(symbol, 50, 50, false));
    } else if (rank >= 11) {
      const court = span('pc-court');
      court.append(span('pc-crest', CRESTS[rank] || ''), span('pc-letter', label));
      center.append(court);
    } else {
      (PIPS[rank] || []).forEach(([x, y, inverted]) => center.append(pipNode(symbol, x, y, inverted)));
    }
    element.append(top, center, bottom);
    return element;
  }

  /* --- FLIP: Karten fliegen zwischen zwei Renderings ------------------------ */
  function collect(roots) {
    const map = new Map();
    roots.forEach(root => {
      if (!root) return;
      root.querySelectorAll('[data-card-id]').forEach(el => {
        const id = el.dataset.cardId;
        // Karten in laufender Deal-/Erschein-Animation liefern keine stabilen Rechtecke.
        if (map.has(id) || el.classList.contains('pc-deal-in') || el.classList.contains('pc-appear')) return;
        map.set(id, { el, rect: el.getBoundingClientRect(), back: el.classList.contains('pc-back') });
      });
    });
    return map;
  }

  function finishFlight(el) {
    el.classList.remove('pc-flying', 'pc-flying-settle');
    el.style.translate = '';
    el.style.zIndex = el.dataset.pcZ != null ? el.dataset.pcZ : '';
    delete el.dataset.pcZ;
    if (el._pcTimer) { window.clearTimeout(el._pcTimer); el._pcTimer = 0; }
  }

  function fly(el, dx, dy, settle) {
    if (el._pcTimer) finishFlight(el);
    el.dataset.pcZ = el.style.zIndex || '';
    el.style.transition = 'none';
    el.style.translate = `${dx}px ${dy}px`;
    void el.offsetWidth;
    el.style.transition = '';
    el.classList.add('pc-flying');
    if (settle) el.classList.add('pc-flying-settle');
    el.style.translate = '0px 0px';
    const done = event => {
      if (event && event.target !== el) return;
      el.removeEventListener('transitionend', done);
      finishFlight(el);
    };
    el.addEventListener('transitionend', done);
    el._pcTimer = window.setTimeout(done, settle ? 320 : 460);
  }

  function reveal(el) {
    el.classList.remove('pc-reveal');
    void el.offsetWidth;
    el.classList.add('pc-reveal');
    el.addEventListener('animationend', () => el.classList.remove('pc-reveal'), { once: true });
  }

  function appear(el) {
    el.classList.add('pc-appear');
    el.addEventListener('animationend', () => el.classList.remove('pc-appear'), { once: true });
  }

  /* container: Element oder Array; mutate(): Rendering; options: { overrides: Map<id, DOMRect>, appearNew: bool } */
  function flip(container, mutate, options) {
    const opts = options || {};
    if (reducedMotion() || document.visibilityState === 'hidden') { mutate(); return; }
    const roots = Array.isArray(container) ? container : [container];
    const first = collect(roots);
    if (opts.overrides) opts.overrides.forEach((rect, id) => first.set(String(id), { rect, back: false, override: true }));
    mutate();
    const last = collect(roots);
    last.forEach((entry, id) => {
      const prev = first.get(id);
      if (!prev) { if (opts.appearNew) appear(entry.el); return; }
      const dx = prev.rect.left - entry.rect.left;
      const dy = prev.rect.top - entry.rect.top;
      const moved = Math.abs(dx) > 1 || Math.abs(dy) > 1;
      if (moved) fly(entry.el, dx, dy, !!prev.override);
      else if (prev.override) appear(entry.el);
      if (prev.back && !entry.back) reveal(entry.el);
    });
  }

  function deal(container, options) {
    if (reducedMotion() || !container) return;
    const limit = (options && options.limit) || 48;
    const cards = [...container.querySelectorAll('.pc-card')];
    cards.forEach((el, index) => {
      el.style.setProperty('--pc-i', String(Math.min(index, limit)));
      el.classList.add('pc-deal-in');
      el.addEventListener('animationend', () => { el.classList.remove('pc-deal-in'); el.style.removeProperty('--pc-i'); }, { once: true });
    });
  }

  function vanish(elements) {
    if (reducedMotion()) return;
    elements.forEach(el => el.classList.add('pc-vanish'));
  }

  /* --- Drag & Drop mit Kartenvorschau --------------------------------------
     config: {
       root, cardSelector, targetSelector,
       start(cardEl, event) -> payload | null,
       cards(payload) -> [{ rank, suit, label, id }],
       sourceElements?(payload) -> [Element],
       canDrop?(payload, targetEl) -> bool,
       drop(payload, targetEl, ghostRects: Map<id, DOMRect>) -> bool,
       cancel?(payload, hadTarget), onStart?(payload)
     } */
  function makeDraggable(config) {
    const root = config.root;
    const threshold = config.threshold || 7;
    let drag = null;
    let frame = 0;
    let suppressUntil = 0;

    function clearHover() {
      if (drag && drag.hover) { drag.hover.classList.remove('pc-drop-hover'); drag.hover = null; }
    }
    function clearLegal(current) {
      (current.legal || []).forEach(el => el.classList.remove('pc-legal'));
      current.legal = [];
    }
    function restoreSources(current) {
      current.sources.forEach(el => el.classList.remove('pc-drag-source'));
    }

    function findTarget(current, x, y) {
      const under = document.elementFromPoint(x, y);
      let target = under ? under.closest(config.targetSelector) : null;
      if (!target && current.ghost) {
        const rect = current.ghost.getBoundingClientRect();
        const probe = document.elementFromPoint(rect.left + rect.width / 2, Math.min(rect.top + rect.width * .6, window.innerHeight - 1));
        target = probe ? probe.closest(config.targetSelector) : null;
      }
      if (target && config.canDrop && !config.canDrop(current.payload, target)) return null;
      return target;
    }

    function begin() {
      drag.started = true;
      const cards = config.cards(drag.payload) || [];
      const sources = config.sourceElements ? config.sourceElements(drag.payload) : [drag.el];
      drag.sources = sources;
      const base = drag.el.getBoundingClientRect();
      drag.rect = base;
      const ghost = document.createElement('div');
      ghost.className = 'pc-ghost';
      ghost.style.width = `${base.width}px`;
      let height = base.height;
      cards.forEach((card, index) => {
        const faceEl = document.createElement('div');
        faceEl.className = 'card';
        face(faceEl, card);
        let offset = 0;
        if (sources[index]) offset = sources[index].getBoundingClientRect().top - base.top;
        else if (index) offset = index * base.height * .32;
        faceEl.style.top = `${offset}px`;
        faceEl.style.height = `${base.height}px`;
        height = Math.max(height, offset + base.height);
        ghost.append(faceEl);
      });
      ghost.style.height = `${height}px`;
      document.body.append(ghost);
      document.body.classList.add('pc-dragging');
      drag.ghost = ghost;
      drag.grabX = drag.startX - base.left;
      drag.grabY = drag.startY - base.top;
      drag.lift = drag.pointerType === 'touch' ? Math.min(28, base.height * .3) : 0;
      sources.forEach(el => el.classList.add('pc-drag-source'));
      drag.legal = [];
      if (config.canDrop) {
        document.querySelectorAll(config.targetSelector).forEach(el => {
          if (config.canDrop(drag.payload, el)) { el.classList.add('pc-legal'); drag.legal.push(el); }
        });
      }
      if (config.onStart) config.onStart(drag.payload);
    }

    function paint() {
      frame = 0;
      if (!drag || !drag.ghost) return;
      const x = drag.x - drag.grabX;
      const y = drag.y - drag.grabY - drag.lift;
      const velocity = drag.x - drag.paintX;
      drag.paintX = drag.x;
      drag.tilt = drag.tilt * .7 + Math.max(-7, Math.min(7, velocity * .35)) * .3;
      drag.ghost.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${drag.tilt.toFixed(2)}deg) scale(1.04)`;
      const target = findTarget(drag, drag.x, drag.y);
      if (target !== drag.hover) {
        clearHover();
        if (target) { target.classList.add('pc-drop-hover'); drag.hover = target; }
      }
    }

    function onDown(event) {
      if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const el = event.target.closest(config.cardSelector);
      if (!el || !root.contains(el)) return;
      const payload = config.start(el, event);
      if (!payload) return;
      drag = { pointerId: event.pointerId, pointerType: event.pointerType, el, payload, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, paintX: event.clientX, tilt: 0, started: false, ghost: null, sources: [], legal: [], hover: null };
      try { el.setPointerCapture(event.pointerId); } catch (_error) { /* optional */ }
    }

    function onMove(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!drag.started) {
        if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < threshold) return;
        begin();
      }
      event.preventDefault();
      if (!frame) frame = requestAnimationFrame(paint);
    }

    function returnGhost(current) {
      const ghost = current.ghost;
      const rect = current.rect;
      const finish = () => {
        ghost.remove();
        restoreSources(current);
      };
      if (reducedMotion()) { finish(); return; }
      ghost.classList.add('pc-ghost-return');
      ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) rotate(0deg) scale(1)`;
      ghost.addEventListener('transitionend', finish, { once: true });
      window.setTimeout(finish, 300);
    }

    function release(current, event) {
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      try { current.el.releasePointerCapture(event.pointerId); } catch (_error) { /* optional */ }
      document.body.classList.remove('pc-dragging');
      if (current.hover) current.hover.classList.remove('pc-drop-hover');
      clearLegal(current);
    }

    function onUp(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const current = drag;
      drag = null;
      release(current, event);
      if (!current.started) return;
      event.preventDefault();
      suppressUntil = performance.now() + 500;
      const target = findTarget(current, event.clientX, event.clientY);
      let ok = false;
      if (target) {
        const ghostRects = new Map();
        current.ghost.querySelectorAll('[data-card-id]').forEach(el => ghostRects.set(el.dataset.cardId, el.getBoundingClientRect()));
        ok = !!config.drop(current.payload, target, ghostRects);
      }
      if (ok) {
        current.ghost.remove();
        restoreSources(current);
      } else {
        returnGhost(current);
        if (config.cancel) config.cancel(current.payload, !!target);
      }
    }

    function onCancel(event) {
      if (!drag || (event && event.pointerId != null && event.pointerId !== drag.pointerId)) return;
      const current = drag;
      drag = null;
      release(current, event || {});
      if (!current.started) return;
      if (current.ghost) returnGhost(current);
      if (config.cancel) config.cancel(current.payload, false);
    }

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('click', event => {
      if (performance.now() < suppressUntil) { event.stopPropagation(); event.preventDefault(); }
    }, true);
    root.addEventListener('contextmenu', event => { if (drag) event.preventDefault(); });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: false });
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', () => onCancel(null));

    return {
      isDragging: () => !!(drag && drag.started),
      cancel: () => onCancel(null)
    };
  }

  /* --- Vierfarb-Deck ---------------------------------------------------------- */
  function readDeck() {
    try { return window.localStorage.getItem(DECK_KEY) === 'four' ? 'four' : 'classic'; }
    catch (_error) { return 'classic'; }
  }
  function applyDeck(value, persist) {
    const next = value === 'four' ? 'four' : 'classic';
    document.documentElement.dataset.cardDeck = next;
    document.querySelectorAll('.pc-deck-toggle').forEach(button => syncToggle(button));
    if (persist) {
      try { window.localStorage.setItem(DECK_KEY, next); } catch (_error) { /* Speicher optional */ }
    }
  }
  function syncToggle(button) {
    const four = document.documentElement.dataset.cardDeck === 'four';
    button.setAttribute('aria-pressed', four ? 'true' : 'false');
    button.setAttribute('aria-label', four ? 'Vierfarbiges Kartendeck ausschalten' : 'Vierfarbiges Kartendeck einschalten');
    button.title = four ? 'Karten: vierfarbig (♦ blau, ♣ grün)' : 'Karten: klassisch rot/schwarz';
    button.querySelector('.game-sound-text').textContent = four ? 'Vierfarbig' : 'Zweifarbig';
  }
  function createDeckToggle() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'game-sound-toggle pc-deck-toggle';
    const icon = span('game-sound-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.append(span('pc-deck-red', '♥'), span('pc-deck-blue', '♦'), span('pc-deck-green', '♣'));
    button.append(icon, span('game-sound-text', ''));
    button.addEventListener('click', () => {
      applyDeck(document.documentElement.dataset.cardDeck === 'four' ? 'classic' : 'four', true);
      if (window.GameAudio) window.GameAudio.play('tap');
    });
    syncToggle(button);
    return button;
  }
  function boot() {
    const controls = document.querySelector('.game-toolbar-controls');
    if (controls && !controls.querySelector('.pc-deck-toggle')) controls.prepend(createDeckToggle());
  }
  applyDeck(readDeck(), false);
  window.addEventListener('storage', event => { if (event.key === DECK_KEY) applyDeck(event.newValue, false); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.GameCards = Object.freeze({
    face, clear, flip, deal, vanish, makeDraggable, reducedMotion,
    suitKey, SYMBOLS, applyDeck, readDeck
  });
})();
