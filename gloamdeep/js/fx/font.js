// Tiny 3x5 pixel font for in-world text (damage numbers, loot labels, alerts).
// Text is rendered once into small cached canvases with a dark outline.

const G = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '+': '000010111010000', '-': '000000111000000', '!': '010010010000010', '?': '110001010000010',
  '.': '000000000000010', ',': '000000000010100', ':': '000010000010000', "'": '010010000000000',
  '%': '101001010100101', '/': '001001010100100', '(': '010100100100010', ')': '010001001001010',
  ' ': '000000000000000', '*': '101010101000000', '>': '100010001010100', '<': '001010100010001',
};

const cache = new Map();

/** Returns a cached canvas with the text rendered at 1px per font pixel (scale multiplies). */
export function textCanvas(text, color, scale = 1, outline = '#0b0710') {
  text = String(text).toUpperCase();
  const key = `${text}|${color}|${scale}|${outline}`;
  let c = cache.get(key);
  if (c) return c;
  const gw = 4 * scale;
  const w = text.length * gw - scale + 2;
  const h = 5 * scale + 2;
  c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = h;
  const g = c.getContext('2d');
  const drawGlyphs = (ox, oy, col) => {
    g.fillStyle = col;
    for (let i = 0; i < text.length; i++) {
      const bits = G[text[i]] || G['?'];
      for (let p = 0; p < 15; p++) {
        if (bits[p] === '1') g.fillRect(1 + ox + i * gw + (p % 3) * scale, 1 + oy + Math.floor(p / 3) * scale, scale, scale);
      }
    }
  };
  if (outline) {
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) drawGlyphs(ox, oy, outline);
  }
  drawGlyphs(0, 0, color);
  if (cache.size > 600) cache.clear();
  cache.set(key, c);
  return c;
}

/** Draw text centred at (x, y) (y = top). */
export function drawText(ctx, text, x, y, color, scale = 1, align = 'center') {
  const c = textCanvas(text, color, scale);
  const dx = align === 'center' ? Math.round(x - c.width / 2) : align === 'right' ? Math.round(x - c.width) : Math.round(x);
  ctx.drawImage(c, dx, Math.round(y));
  return c.width;
}
