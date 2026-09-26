// Touch controls for tablets and phones: a floating move stick, thumb buttons (attack with
// auto-aim, spell, dash, potion, interact) and touch-to-attack on the world. They only drive the
// Input state that keyboard and mouse use, so the game logic is untouched.
// Setting `touch`: 'auto' (shown after touch input or on touch-first devices), 'on' or 'off'.

const ATTACK_REACH = 110;
const SPELL_REACH = 230;
const PROP_REACH = 40;
const TAP_HOLD = 0.22; // a quick tap keeps its button held this long so it always lands on a frame
const STICK_DEAD = 0.18;
// touches starting on these are left to the DOM interface
const UI_SELECTOR = 'button, a, input, select, label, textarea, .panel, .backdrop, #hud-buttons, #title-screen, #death-screen, #minimap, #file-warning';

export class TouchControls {
  constructor(game, input, stage) {
    this.game = game;
    this.input = input;
    this.stage = stage;
    this.pointers = new Map(); // pointerId -> { kind, el?, x, y, ox?, oy? }
    this.touchIds = new Set(); // Touch identifiers handled here (their emulated mouse events and click are cancelled)
    this.lastInput = null; // 'touch' | 'mouse' once either has been used
    this.coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.active = false;
    this.portrait = false;
    this.aimAngle = Math.PI / 2;
    this.attackUntil = 0;
    this.spellUntil = 0;
    this.time = 0;
    this.hinted = false;
    this.build();
    this.bind();
  }

  // ================================================================== DOM

  build() {
    const ui = document.createElement('div');
    ui.id = 'touch-ui';
    ui.className = 'hidden';
    ui.setAttribute('aria-hidden', 'true');
    ui.innerHTML = `<div id="touch-stick-zone"><div class="stick-base"><div class="stick-knob"></div></div></div>
      <div id="touch-buttons"><div class="t-interact" role="button" aria-label="Interact"><span>✋</span></div></div>`;
    this.stage.appendChild(ui);
    const rot = document.createElement('div');
    rot.id = 'touch-rotate';
    rot.className = 'hidden';
    rot.innerHTML = `<div class="rot-icon" aria-hidden="true">⟳</div><h2>Rotate your device</h2><p>Gloamdeep is played in landscape.</p>
      <a class="btn ui-hit game-collection-link" href="../index.html" aria-label="Zur Spieleauswahl">← Spieleauswahl</a>`;
    document.body.appendChild(rot);
    this.ui = ui;
    this.rotate = rot;
    this.zone = ui.querySelector('#touch-stick-zone');
    this.base = ui.querySelector('.stick-base');
    this.knob = ui.querySelector('.stick-knob');
    this.buttons = ui.querySelector('#touch-buttons');
    this.interactBtn = ui.querySelector('.t-interact');
    this.actionbar = document.getElementById('actionbar');
    this.skills = this.actionbar.querySelector('.skills');
    this.orbMp = document.getElementById('orb-mp');
  }

  bind() {
    this.stage.addEventListener('pointerdown', (e) => this.onDown(e), { passive: false });
    // Cancelling the Touch Events stops the browser's emulated mouse events and the trailing
    // click, which would otherwise land on a panel that the tap just opened and close it again.
    this.stage.addEventListener('touchstart', (e) => {
      if (!this.active || !this.playing() || !this.classify(e.target)) return;
      for (const t of e.changedTouches) this.touchIds.add(t.identifier);
      e.preventDefault();
    }, { passive: false });
    const touchEnd = (e) => {
      let ours = false;
      for (const t of e.changedTouches) if (this.touchIds.delete(t.identifier)) ours = true;
      if (ours && e.cancelable) e.preventDefault();
    };
    this.stage.addEventListener('touchend', touchEnd, { passive: false });
    this.stage.addEventListener('touchcancel', touchEnd, { passive: false });
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    // a real mouse or trackpad hands control back to the pointer (setting 'auto')
    const mouse = (e) => { if (e.pointerType === 'mouse') this.lastInput = 'mouse'; };
    window.addEventListener('pointerdown', mouse, true);
    window.addEventListener('pointermove', mouse, true);
    // a hardware keyboard (tablet + keyboard): hide the idle stick, WASD moves
    window.addEventListener('keydown', (e) => {
      if (/^(Key[WASD]|Arrow)/.test(e.code)) document.documentElement.classList.add('touch-kb');
    });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    window.addEventListener('resize', () => this.refresh());
  }

  /** Recompute whether touch mode is on and update the DOM; returns the state. */
  refresh() {
    const s = this.game.settings.touch || 'auto';
    const active = s === 'on' || (s === 'auto' && (this.lastInput ? this.lastInput === 'touch' : this.coarse));
    if (active !== this.active) this.setActive(active);
    const portrait = active && window.innerHeight > window.innerWidth && window.innerWidth < 700;
    if (portrait !== this.portrait) {
      this.portrait = portrait;
      this.rotate.classList.toggle('hidden', !portrait);
    }
    return active;
  }

  setActive(on) {
    this.active = on;
    document.documentElement.classList.toggle('touch-mode', on);
    this.ui.classList.toggle('hidden', !on);
    // the HUD skill slots (icons, cooldowns, costs) become the thumb buttons
    if (on) {
      this.buttons.prepend(this.skills);
      this.actionbar.classList.add('touch-split');
    } else {
      this.actionbar.insertBefore(this.skills, this.orbMp);
      this.actionbar.classList.remove('touch-split');
      this.releaseAll();
    }
  }

  // ================================================================== pointer events

  playing() {
    const g = this.game;
    return g.state === 'play' && !g.modal && !g.trans && !!g.player && !g.player.dead;
  }

  /** What a touch on `t` controls, or null when it belongs to the DOM interface. */
  classify(t) {
    if (!t || !t.closest) return null;
    let el;
    if (t.closest('#touch-stick-zone')) return { kind: 'stick', el: null };
    if ((el = t.closest('.t-interact'))) return { kind: 'interact', el };
    if ((el = t.closest('#touch-buttons .skill'))) return { kind: el.id.slice(3), el }; // attack, spell, dash, potion
    if ((el = t.closest('#prompt.show'))) return { kind: 'interact', el };
    if (t.closest(UI_SELECTOR)) return null;
    return { kind: 'world', el: null };
  }

  onDown(e) {
    if (e.pointerType === 'mouse' || this.game.settings.touch === 'off') return;
    this.lastInput = 'touch';
    if (!this.refresh()) return;
    const c = this.classify(e.target);
    if (!c || !this.playing()) return;
    e.preventDefault();
    const { kind, el } = c;
    // the full map covers the HUD buttons: tapping it closes it (like M) instead of attacking
    if (kind === 'world' && this.game.mapOpen) { this.game.mapOpen = false; return; }
    const p = { kind, el, x: e.clientX, y: e.clientY };
    if (el) el.classList.add('pressed');
    const inp = this.input;
    switch (kind) {
      case 'stick': {
        const r = this.zone.getBoundingClientRect();
        p.ox = e.clientX; p.oy = e.clientY;
        this.base.classList.add('active');
        this.base.style.left = `${e.clientX - r.left}px`;
        this.base.style.top = `${e.clientY - r.top}px`;
        break;
      }
      case 'attack': this.attackUntil = this.time + TAP_HOLD; break;
      case 'spell': this.spellUntil = this.time + TAP_HOLD; break;
      case 'dash': inp.pressed.add('Space'); break;
      case 'potion': inp.pressed.add('KeyQ'); break;
      case 'interact': inp.pressed.add('KeyE'); break;
      default: break;
    }
    this.pointers.set(e.pointerId, p);
    this.updateStickVisual();
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX; p.y = e.clientY;
    if (p.kind === 'stick') this.updateStickVisual();
  }

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    this.release(p);
  }

  release(p) {
    if (p.el) p.el.classList.remove('pressed');
    if (p.kind === 'stick') {
      this.base.classList.remove('active');
      this.base.style.left = '';
      this.base.style.top = '';
      this.knob.style.transform = '';
      this.input.stick.x = 0; this.input.stick.y = 0;
    }
  }

  releaseAll() {
    for (const p of this.pointers.values()) this.release(p);
    this.pointers.clear();
    this.attackUntil = 0; this.spellUntil = 0;
    this.input.stick.x = 0; this.input.stick.y = 0;
    this.input.mouse.buttons[0] = false; this.input.mouse.buttons[2] = false;
  }

  stickRadius() {
    return this.base.offsetWidth * 0.5 || 44;
  }

  /** Stick deflection -> knob position and Input.stick (length <= 1, with a dead zone). */
  updateStickVisual() {
    let stick = null;
    for (const p of this.pointers.values()) if (p.kind === 'stick') stick = p;
    if (!stick) return;
    const R = this.stickRadius();
    let dx = stick.x - stick.ox, dy = stick.y - stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; }
    this.knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    const k = Math.min(1, len / R);
    if (k < STICK_DEAD) { this.input.stick.x = 0; this.input.stick.y = 0; return; }
    const mag = Math.min(1, ((k - STICK_DEAD) / (1 - STICK_DEAD)) * 1.35);
    this.input.stick.x = (dx / (len || 1)) * mag;
    this.input.stick.y = (dy / (len || 1)) * mag;
  }

  held(kind) {
    for (const p of this.pointers.values()) if (p.kind === kind) return true;
    return false;
  }

  // ================================================================== per frame

  /** Called every frame before Game.update: feeds aim, buttons and stick into Input. */
  update(dt, rect) {
    this.time += dt;
    if (!this.refresh()) return;
    const g = this.game, inp = this.input, pl = g.player;
    const playing = this.playing();
    this.ui.classList.toggle('off-play', !playing);
    this.interactBtn.classList.toggle('show', !!(playing && g.interactTarget));
    if (!playing) {
      if (this.pointers.size || inp.stick.x || inp.stick.y) this.releaseAll();
      inp.mouse.buttons[0] = false; inp.mouse.buttons[2] = false;
      return;
    }
    if (!this.hinted) {
      this.hinted = true;
      g.toast('Touch controls: left stick moves, tap the world to attack there, the big button attacks the nearest foe.', 'info');
    }
    let world = null;
    for (const p of this.pointers.values()) if (p.kind === 'world') world = p;
    const attack = this.held('attack') || this.time < this.attackUntil;
    const spell = this.held('spell') || this.time < this.spellUntil;
    let aim = null;
    if (world) aim = [world.x, world.y];
    else if (attack || spell) {
      const target = (attack && this.autoTarget(ATTACK_REACH)) || (spell && this.autoTarget(SPELL_REACH)) || this.facingPoint();
      aim = this.worldToClient(target.x, target.y, rect);
    }
    if (aim) {
      inp.mouse.cx = aim[0]; inp.mouse.cy = aim[1];
      g.pointerOverUi = false;
      const w = this.clientToWorld(aim[0], aim[1], rect);
      this.aimAngle = Math.atan2(w.y - (pl.y - 8), w.x - pl.x);
    } else {
      // park the virtual cursor far off-screen along the last aim, so facing is kept but no
      // reticle, hover outline or camera look-ahead shows while nothing is aimed
      const far = this.worldToClient(pl.x + Math.cos(this.aimAngle) * 4000, pl.y - 8 + Math.sin(this.aimAngle) * 4000, rect);
      inp.mouse.cx = far[0]; inp.mouse.cy = far[1];
    }
    inp.mouse.buttons[0] = !!world || attack;
    inp.mouse.buttons[2] = spell;
  }

  worldToClient(wx, wy, rect) {
    const g = this.game;
    return [rect.left + ((wx - g.cam.x) / g.renderer.vw) * rect.width, rect.top + ((wy - g.cam.y) / g.renderer.vh) * rect.height];
  }

  clientToWorld(cx, cy, rect) {
    const g = this.game;
    return { x: g.cam.x + ((cx - rect.left) / rect.width) * g.renderer.vw, y: g.cam.y + ((cy - rect.top) / rect.height) * g.renderer.vh };
  }

  facingAngle() {
    const mv = this.input.moveVector();
    return mv.x || mv.y ? Math.atan2(mv.y, mv.x) : this.aimAngle;
  }

  facingPoint() {
    const pl = this.game.player, a = this.facingAngle();
    return { x: pl.x + Math.cos(a) * 40, y: pl.y - 8 + Math.sin(a) * 40 };
  }

  /** Best visible enemy within reach (nearest, favouring the facing direction); breakables for melee. */
  autoTarget(reach) {
    const g = this.game, pl = g.player, area = g.area;
    const px = pl.x, py = pl.y - 8;
    const face = this.facingAngle();
    let best = null, bs = Infinity;
    for (const e of area.enemies) {
      if (e.dead || e.hidden) continue;
      const ex = e.x, ey = e.y - Math.min(14, (e.height || 16) * 0.45);
      const d = Math.hypot(ex - px, ey - py);
      if (d > reach + (e.radius || 6) || !area.map.lineOfSight(px, py, ex, ey)) continue;
      let da = Math.abs(Math.atan2(ey - py, ex - px) - face);
      if (da > Math.PI) da = Math.PI * 2 - da;
      const s = d + da * 22;
      if (s < bs) { bs = s; best = { x: ex, y: ey }; }
    }
    if (best || reach > ATTACK_REACH) return best;
    for (const p of area.props) {
      if (!p.hittable || p.broken) continue;
      const d = Math.hypot(p.x - px, p.y - 4 - py);
      if (d < PROP_REACH && d < bs) { bs = d; best = { x: p.x, y: p.y - 4 }; }
    }
    return best;
  }
}
