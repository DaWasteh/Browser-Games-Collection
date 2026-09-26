// Low-level pixel painting helpers shared by all procedural art modules.

import { shade } from '../core/math.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

/** Fill rect with simple volumetric shading (lit from the top-left). */
export function box(g, x, y, w, h, base, flat = false) {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  if (flat || w < 2 || h < 2) return;
  g.fillStyle = shade(base, 1.22);
  g.fillRect(x, y, w, 1);
  g.fillStyle = shade(base, 1.1);
  g.fillRect(x, y + 1, 1, h - 1);
  g.fillStyle = shade(base, 0.72);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillStyle = shade(base, 0.82);
  g.fillRect(x + w - 1, y, 1, h - 1);
}

export function dot(g, x, y, col, w = 1, h = 1) {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

/** Filled pixel ellipse (row spans). */
export function ellipseFill(g, cx, cy, rx, ry, col) {
  g.fillStyle = col;
  for (let y = -ry; y <= ry; y++) {
    const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    g.fillRect(cx - span, cy + y, span * 2 + 1, 1);
  }
}

/** Add a 1px dark outline around all opaque pixels. */
export function outline(c, col = [12, 8, 16]) {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (src[i]) continue;
    if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (y > 0 && src[i - w]) || (y < h - 1 && src[i + w])) {
      d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 235;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Solid-colour silhouette of a sprite (hit flash, tints). */
export function silhouette(c, color = '#ffffff') {
  const [f, g] = makeCanvas(c.width, c.height);
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return f;
}

export function mirror(c) {
  const [m, g] = makeCanvas(c.width, c.height);
  g.translate(c.width, 0);
  g.scale(-1, 1);
  g.drawImage(c, 0, 0);
  return m;
}
