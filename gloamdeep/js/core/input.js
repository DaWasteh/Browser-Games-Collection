// Keyboard and mouse state. Prevents browser defaults (scrolling, context menu) while playing.

const BLOCKED_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1', 'F3', 'AltLeft', 'AltRight']);

export class Input {
  constructor(root) {
    this.root = root;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { cx: 0, cy: 0, inside: false, buttons: [false, false, false], clicked: [false, false, false], moved: false };
    this.enabled = true;
    this.lastDevice = 'mouse';

    const isTyping = (e) => {
      const t = e.target;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };

    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });

    const pos = (e) => {
      this.mouse.cx = e.clientX;
      this.mouse.cy = e.clientY;
      this.mouse.moved = true;
    };
    window.addEventListener('mousemove', pos);
    root.addEventListener('mousedown', (e) => {
      pos(e);
      if (e.button <= 2) {
        this.mouse.buttons[e.button] = true;
        this.mouse.clicked[e.button] = true;
      }
      if (e.button === 1) e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button <= 2) this.mouse.buttons[e.button] = false;
    });
    // no context menu anywhere inside the game
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // no page scrolling / zooming by wheel while playing
    root.addEventListener('wheel', (e) => { if (!e.target.closest('.panel, .scroll')) e.preventDefault(); }, { passive: false });
    // no accidental text selection or drag of images
    root.addEventListener('dragstart', (e) => e.preventDefault());
  }

  reset() {
    this.down.clear();
    this.mouse.buttons = [false, false, false];
  }

  isDown(code) { return this.enabled && this.down.has(code); }
  wasPressed(code) { return this.enabled && this.pressed.has(code); }
  consume(code) { this.pressed.delete(code); }
  mouseDown(b = 0) { return this.enabled && this.mouse.buttons[b]; }
  mouseClicked(b = 0) { return this.enabled && this.mouse.clicked[b]; }

  /** Movement vector from WASD / arrow keys (normalised). */
  moveVector() {
    let x = 0, y = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = [false, false, false];
    this.mouse.moved = false;
  }
}
