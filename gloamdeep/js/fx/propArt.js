// Procedural pixel art for props (dungeon furniture, town buildings) and flat floor decor.
// Static art is cached per (type, variant); animated parts (flames, runes) are drawn at runtime.

import { shade } from '../core/math.js';
import { makeCanvas, outline, box, dot, ellipseFill } from './pixel.js';

const cache = new Map();

function hash(a, b = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const SHRINE_COLORS = { might: '#ff5a3a', haste: '#6affb0', warding: '#6aa8ff', fortune: '#ffd24a', renewal: '#ff7ad8' };
export { SHRINE_COLORS };

/** Returns {c, ax, ay} — (ax, ay) is the ground anchor inside the canvas. */
export function propSprite(type, v = 0, opts = {}) {
  const key = `${type}|${v}|${opts.open ? 1 : 0}|${opts.kind || ''}|${opts.tier || ''}|${opts.w || ''}|${opts.roof || ''}|${opts.sealed ? 1 : 0}|${opts.used ? 1 : 0}`;
  let s = cache.get(key);
  if (s) return s;
  s = paintProp(type, v, opts);
  cache.set(key, s);
  return s;
}

function paintProp(type, v, o) {
  let c, g, ax, ay, noOutline = false;
  switch (type) {
    case 'urn': {
      [c, g] = makeCanvas(12, 14); ax = 6; ay = 13;
      const col = ['#8a5a3a', '#7a6a5a', '#6a4a3a', '#8a7a5a'][v & 3];
      ellipseFill(g, 6, 8, 4, 4, col);
      dot(g, 4, 2, col, 4, 3); dot(g, 3, 2, shade(col, 1.2), 6, 1);
      dot(g, 3, 7, shade(col, 1.3), 1, 3); dot(g, 3, 9, shade(col, 0.7), 7, 1);
      dot(g, 4, 12, shade(col, 0.6), 4, 1);
      break;
    }
    case 'crate': {
      [c, g] = makeCanvas(14, 14); ax = 7; ay = 13;
      box(g, 1, 3, 12, 10, '#7a5a38'); box(g, 1, 1, 12, 3, '#9a7448');
      dot(g, 1, 7, '#5a4028', 12, 1); dot(g, 2, 4, '#5a4028', 1, 8); dot(g, 11, 4, '#5a4028', 1, 8);
      dot(g, 3, 5, '#5a4028'); dot(g, 5, 9, '#5a4028'); dot(g, 8, 6, '#5a4028'); dot(g, 9, 10, '#5a4028');
      break;
    }
    case 'barrel': case 'powderKeg': {
      [c, g] = makeCanvas(12, 16); ax = 6; ay = 15;
      const col = type === 'powderKeg' ? '#8a2a22' : '#7a5230';
      box(g, 1, 3, 10, 12, col); ellipseFill(g, 6, 3, 5, 2, shade(col, 1.25)); dot(g, 3, 3, shade(col, 0.8), 6, 1);
      dot(g, 1, 6, '#4a4a52', 10, 1); dot(g, 1, 12, '#4a4a52', 10, 1);
      if (type === 'powderKeg') { dot(g, 4, 8, '#f0e0c0', 4, 3); dot(g, 5, 9, '#2a1010', 1, 1); dot(g, 7, 9, '#2a1010', 1, 1); dot(g, 6, 1, '#d8c070', 1, 2); }
      break;
    }
    case 'sporepod': {
      [c, g] = makeCanvas(14, 14); ax = 7; ay = 13;
      ellipseFill(g, 7, 8, 5, 5, '#a04a7a'); ellipseFill(g, 6, 7, 3, 3, '#d06aa0');
      dot(g, 5, 5, '#ffc0e0', 2, 1); dot(g, 9, 10, '#ffb0ff', 1, 1); dot(g, 4, 10, '#ffb0ff', 1, 1);
      break;
    }
    case 'geode': {
      [c, g] = makeCanvas(14, 13); ax = 7; ay = 12;
      ellipseFill(g, 7, 7, 6, 5, '#5a5468'); ellipseFill(g, 7, 7, 3, 3, '#2a1a4a');
      dot(g, 6, 5, '#c59bff', 1, 3); dot(g, 8, 6, '#e8d0ff', 1, 2); dot(g, 5, 7, '#9a6aff', 1, 2);
      dot(g, 3, 4, '#7a7488', 3, 1);
      break;
    }
    case 'chest': {
      const gilded = o.tier === 'gilded';
      [c, g] = makeCanvas(18, 16); ax = 9; ay = 15;
      const wood = gilded ? '#5a2a3a' : '#7a4a2a', band = gilded ? '#e8c050' : '#6a6a72';
      box(g, 1, 7, 16, 8, wood);
      if (o.open) {
        box(g, 1, 1, 16, 5, shade(wood, 0.7)); dot(g, 2, 6, '#1a1008', 14, 2);
        dot(g, 4, 6, '#ffd84a', 3, 1); dot(g, 10, 6, '#ffe890', 2, 1);
      } else {
        box(g, 1, 3, 16, 5, shade(wood, 1.15)); dot(g, 2, 2, shade(wood, 1.3), 14, 1);
      }
      dot(g, 1, 7, band, 16, 1); dot(g, 4, 3, band, 1, 12); dot(g, 13, 3, band, 1, 12);
      if (!o.open) { dot(g, 8, 6, band, 2, 3); dot(g, 8, 7, '#1a1008', 2, 1); }
      break;
    }
    case 'storageChest': {
      [c, g] = makeCanvas(24, 20); ax = 12; ay = 19;
      box(g, 1, 8, 22, 11, '#5a3a24'); box(g, 1, 3, 22, 6, '#6e4a2c'); dot(g, 2, 2, '#8a5e38', 20, 1);
      for (const x of [3, 11, 19]) dot(g, x, 3, '#b8a060', 2, 16);
      dot(g, 1, 8, '#b8a060', 22, 1);
      box(g, 10, 7, 4, 5, '#e8c050'); dot(g, 11, 9, '#1a1008', 2, 1);
      break;
    }
    case 'shrine': {
      [c, g] = makeCanvas(20, 30); ax = 10; ay = 29;
      const col = SHRINE_COLORS[o.kind] || '#ffffff';
      box(g, 2, 22, 16, 7, '#5a5664'); box(g, 5, 10, 10, 13, '#6a6674'); box(g, 3, 8, 14, 3, '#7a7686');
      dot(g, 7, 13, o.used ? '#3a3640' : col, 6, 1); dot(g, 9, 12, o.used ? '#3a3640' : col, 2, 6); dot(g, 7, 17, o.used ? '#3a3640' : col, 6, 1);
      if (!o.used) { ellipseFill(g, 10, 4, 3, 3, col); dot(g, 9, 3, '#ffffff', 2, 1); }
      break;
    }
    case 'stairsUp': {
      [c, g] = makeCanvas(28, 30); ax = 14; ay = 26;
      box(g, 1, 6, 26, 22, '#4a4654');
      for (let i = 0; i < 5; i++) { box(g, 4, 8 + i * 4, 20, 4, shade('#8a8494', 1 - i * 0.1)); dot(g, 4, 11 + i * 4, '#2a2630', 20, 1); }
      box(g, 0, 0, 5, 26, '#5a5664'); box(g, 23, 0, 5, 26, '#5a5664');
      dot(g, 0, 0, '#7a7686', 28, 3);
      dot(g, 12, 1, '#ffd9a0', 4, 1);
      break;
    }
    case 'stairsDown': {
      [c, g] = makeCanvas(30, 26); ax = 15; ay = 18;
      ellipseFill(g, 15, 13, 14, 11, '#3a3644');
      ellipseFill(g, 15, 13, 12, 9, '#1a1822');
      for (let i = 0; i < 4; i++) { dot(g, 7 + i, 8 + i * 3, shade('#6a6474', 1 - i * 0.2), 16 - i * 2, 2); }
      ellipseFill(g, 15, 18, 4, 2, '#050408');
      const rc = o.sealed ? '#ff4a3a' : '#6ab0ff';
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; dot(g, Math.round(15 + Math.cos(a) * 13), Math.round(13 + Math.sin(a) * 10), rc); }
      noOutline = true;
      break;
    }
    case 'wallTorch': {
      [c, g] = makeCanvas(8, 12); ax = 4; ay = 11;
      dot(g, 2, 8, '#4a4a52', 4, 2); dot(g, 3, 3, '#6a4a2a', 2, 6); dot(g, 2, 2, '#3a2a1a', 4, 2);
      break;
    }
    case 'brazier': {
      [c, g] = makeCanvas(16, 18); ax = 8; ay = 17;
      dot(g, 3, 10, '#3a3640', 1, 7); dot(g, 12, 10, '#3a3640', 1, 7); dot(g, 7, 11, '#3a3640', 2, 6);
      box(g, 1, 6, 14, 5, '#5a5664'); dot(g, 2, 5, '#7a7686', 12, 1); dot(g, 3, 6, '#ff7a2e', 10, 1);
      break;
    }
    case 'candles': {
      [c, g] = makeCanvas(14, 12); ax = 7; ay = 11;
      const hs = [7, 5, 8, 4];
      for (let i = 0; i < 4; i++) { const x = 1 + i * 3 + (i & 1); dot(g, x, 11 - hs[(i + v) & 3], '#e8e0c8', 2, hs[(i + v) & 3]); dot(g, x, 11, '#b8b098', 2, 1); }
      break;
    }
    case 'glowcap': {
      [c, g] = makeCanvas(18, 16); ax = 9; ay = 15;
      const caps = [[5, 9, 4], [11, 6, 5], [14, 11, 3]];
      for (const [x, y, r] of caps) {
        dot(g, x - 1, y, '#c8d8c8', 2, 15 - y);
        ellipseFill(g, x, y, r, Math.max(1, r - 2), '#2fa08f');
        dot(g, x - r + 1, y - 1, '#7affe0', r, 1);
      }
      break;
    }
    case 'crystal': case 'geodeCluster': {
      [c, g] = makeCanvas(18, 24); ax = 9; ay = 23;
      const cols = type === 'crystal' ? ['#7b4fd6', '#b88cff', '#e0d0ff'] : ['#5a7ab0', '#8ae0ff', '#e0ffff'];
      const shards = [[4, 12, 3], [8, 2, 4], [13, 9, 3], [11, 15, 2]];
      for (const [x, y, w] of shards) {
        for (let yy = y; yy < 23; yy++) dot(g, x - (yy - y < 2 ? 0 : 1), yy, yy - y < 2 ? cols[2] : cols[0], yy - y < 2 ? 1 : w, 1);
        dot(g, x, y + 2, cols[1], 1, 23 - y - 3);
      }
      dot(g, 2, 21, '#3a3448', 14, 2);
      break;
    }
    case 'coffin': {
      [c, g] = makeCanvas(14, 22); ax = 7; ay = 21;
      box(g, 2, 1, 10, 20, '#4a3024'); dot(g, 1, 5, '#4a3024', 12, 6);
      dot(g, 6, 5, '#a8a090', 2, 8); dot(g, 4, 7, '#a8a090', 6, 2);
      break;
    }
    case 'grave': {
      [c, g] = makeCanvas(14, 18); ax = 7; ay = 17;
      const col = ['#6a6874', '#5a5a64', '#74707e'][v % 3];
      box(g, 2, 3, 10, 14, col); ellipseFill(g, 7, 4, 5, 3, col);
      dot(g, 5, 7, shade(col, 0.6), 4, 1); dot(g, 6, 6, shade(col, 0.6), 2, 5);
      dot(g, 1, 16, '#3a4a2a', 12, 1);
      break;
    }
    case 'statue': {
      [c, g] = makeCanvas(16, 32); ax = 8; ay = 31;
      box(g, 1, 25, 14, 6, '#5a5664');
      box(g, 4, 11, 8, 15, '#7a7686'); dot(g, 3, 20, '#7a7686', 10, 6);
      box(g, 5, 3, 6, 9, '#8a8696'); dot(g, 6, 7, '#3a3640', 4, 3);
      dot(g, 3, 13, '#6a6674', 2, 8); dot(g, 11, 13, '#6a6674', 2, 8);
      dot(g, 5, 14, '#4a7a3a', 2, 2); dot(g, 9, 22, '#4a7a3a', 3, 1);
      break;
    }
    case 'obelisk': {
      [c, g] = makeCanvas(12, 34); ax = 6; ay = 33;
      box(g, 1, 28, 10, 5, '#3a3448'); box(g, 3, 4, 6, 25, '#4c4466'); dot(g, 4, 1, '#4c4466', 4, 3);
      for (let i = 0; i < 5; i++) dot(g, 5, 8 + i * 4, '#b36bff', 2, 2);
      break;
    }
    case 'sporeStalk': {
      [c, g] = makeCanvas(20, 30); ax = 10; ay = 29;
      dot(g, 8, 10, '#c8d0b8', 4, 19); dot(g, 9, 10, '#e0e8d0', 1, 19);
      ellipseFill(g, 10, 8, 9, 5, '#8a3a6a'); dot(g, 2, 8, '#6a2a52', 17, 2);
      dot(g, 5, 5, '#ffb0e0', 2, 1); dot(g, 12, 4, '#ffb0e0', 2, 1); dot(g, 8, 7, '#ffb0e0', 1, 1);
      break;
    }
    case 'stump': {
      [c, g] = makeCanvas(16, 14); ax = 8; ay = 13;
      box(g, 2, 5, 12, 8, '#5a4028'); ellipseFill(g, 8, 5, 6, 2, '#8a6a48'); dot(g, 6, 5, '#6a4a30', 4, 1);
      dot(g, 3, 9, '#2f8f7f', 2, 2); dot(g, 11, 8, '#5fe0c0', 1, 1);
      break;
    }
    case 'anvil': {
      [c, g] = makeCanvas(18, 14); ax = 9; ay = 13;
      box(g, 5, 8, 8, 5, '#3a3640'); box(g, 1, 3, 16, 5, '#5a5664'); dot(g, 0, 4, '#5a5664', 3, 2); dot(g, 1, 3, '#8a8696', 16, 1);
      break;
    }
    case 'ingotPile': {
      [c, g] = makeCanvas(16, 10); ax = 8; ay = 9;
      for (const [x, y] of [[1, 6], [6, 6], [11, 6], [3, 3], [8, 3], [5, 0]]) { box(g, x, y, 5, 3, '#c8903a'); dot(g, x, y, '#ffd890', 5, 1); }
      break;
    }
    // ------------------------------------------------------------- town
    case 'tree': {
      [c, g] = makeCanvas(34, 44); ax = 17; ay = 42;
      dot(g, 14, 30, '#3a2a1e', 6, 13); dot(g, 15, 30, '#4e3a28', 2, 13); dot(g, 11, 41, '#3a2a1e', 12, 2);
      const greens = [['#1f3a2a', '#2c4e36', '#3e6a44', '#5a8a52'], ['#233a26', '#34502e', '#4a6a36', '#6a8a48'], ['#1c3432', '#284a44', '#3a6258', '#548072']][v % 3];
      const blobs = [[17, 20, 14, 11], [9, 22, 8, 7], [25, 22, 8, 7], [17, 11, 10, 8], [12, 15, 7, 6], [23, 14, 7, 6]];
      for (const [x, y, rx, ry] of blobs) ellipseFill(g, x, y, rx, ry, greens[0]);
      for (const [x, y, rx, ry] of blobs) ellipseFill(g, x - 1, y - 1, rx - 2, ry - 2, greens[1]);
      for (const [x, y, rx, ry] of blobs.slice(3)) ellipseFill(g, x - 2, y - 2, rx - 4, ry - 3, greens[2]);
      for (let i = 0; i < 14; i++) dot(g, 6 + Math.floor(hash(i, v) * 22), 6 + Math.floor(hash(v, i) * 18), greens[3]);
      break;
    }
    case 'house': case 'hall': {
      const w = o.w || 96;
      const roofH = type === 'hall' ? 22 : 30;
      const wallH = type === 'hall' ? 18 : 24;
      const H = (o.h || 48) + roofH;
      [c, g] = makeCanvas(w + 8, H + 2); ax = (w + 8) >> 1; ay = H;
      const wallCol = o.wall || '#8a6a4a', roof = o.roof || '#6b3a2e';
      // front wall
      const wy = H - wallH;
      box(g, 4, wy, w, wallH, wallCol);
      for (let x = 6; x < w + 2; x += 7) dot(g, x, wy + 2, shade(wallCol, 0.85), 1, wallH - 3);
      dot(g, 4, wy, '#4a3424', 2, wallH); dot(g, w + 2, wy, '#4a3424', 2, wallH);
      dot(g, 4, wy + wallH - 2, '#5a5048', w, 2);
      // door
      const dx = 4 + (w >> 1) - 6;
      box(g, dx, wy + wallH - 16, 12, 16, '#4a2e1c'); dot(g, dx + 1, wy + wallH - 15, '#5e3a24', 10, 1); dot(g, dx + 9, wy + wallH - 8, '#e8c050');
      // windows (lit)
      for (const wx of [12, w - 14]) {
        if (Math.abs(wx - (w >> 1)) < 14) continue;
        box(g, wx, wy + 5, 9, 8, '#3a2618');
        dot(g, wx + 1, wy + 6, '#ffd070', 7, 6); dot(g, wx + 4, wy + 6, '#3a2618', 1, 6); dot(g, wx + 1, wy + 9, '#3a2618', 7, 1);
        dot(g, wx + 1, wy + 6, '#fff0b0', 3, 1);
      }
      // roof
      for (let y = 0; y < roofH + (o.h || 48) - wallH; y++) {
        const inset = Math.max(0, Math.round((roofH - y) * 0.35));
        const rowCol = (y % 5 === 4) ? shade(roof, 0.7) : y < 3 ? shade(roof, 1.25) : roof;
        dot(g, inset, y, rowCol, w + 8 - inset * 2, 1);
      }
      for (let y = 4; y < roofH + (o.h || 48) - wallH; y += 5) for (let x = (y * 3) % 7; x < w + 8; x += 7) dot(g, x, y - 1, shade(roof, 0.8), 1, 2);
      dot(g, 0, wy - 2, shade(roof, 0.55), w + 8, 2);
      if (o.chimney) { box(g, w - 16, 2, 7, 12, '#6a5a52'); dot(g, w - 17, 1, '#7a6a62', 9, 2); }
      if (o.sign) { box(g, dx + 16, wy + 2, 12, 7, '#8a6a3a'); dot(g, dx + 18, wy + 4, '#e8c050', 3, 3); dot(g, dx + 22, wy + 5, '#c8c8d0', 3, 2); }
      break;
    }
    case 'stall': {
      [c, g] = makeCanvas(52, 40); ax = 26; ay = 38;
      dot(g, 3, 8, '#5a3a24', 2, 30); dot(g, 47, 8, '#5a3a24', 2, 30);
      box(g, 1, 24, 50, 13, '#7a5230'); dot(g, 1, 24, '#9a7048', 50, 2);
      // goods
      for (let i = 0; i < 6; i++) { const x = 5 + i * 7; box(g, x, 19, 5, 5, ['#c84a3a', '#e8c050', '#5a8ac8', '#8ac850', '#c8c8d0', '#a060c8'][i]); }
      dot(g, 20, 17, '#c8c8d0', 1, 7); dot(g, 30, 16, '#8a6a3a', 6, 2);
      // awning
      for (let x = 0; x < 52; x += 6) { dot(g, x, 2, (x / 6) % 2 ? '#e8e0d0' : (o.awning || '#b0402e'), 6, 8); }
      for (let x = 0; x < 52; x += 6) dot(g, x + 1, 10, (x / 6) % 2 ? '#e8e0d0' : (o.awning || '#b0402e'), 4, 2);
      dot(g, 0, 1, '#5a2a1a', 52, 1);
      break;
    }
    case 'gloamGate': {
      [c, g] = makeCanvas(64, 58); ax = 32; ay = 56;
      box(g, 4, 10, 14, 46, '#4a4658'); box(g, 46, 10, 14, 46, '#4a4658');
      for (let y = 14; y < 54; y += 8) { dot(g, 4, y, '#34303e', 14, 1); dot(g, 46, y, '#34303e', 14, 1); }
      // arch
      for (let i = 0; i < 40; i++) {
        const a = Math.PI + (i / 39) * Math.PI;
        const x = Math.round(32 + Math.cos(a) * 21), y = Math.round(22 + Math.sin(a) * 16);
        box(g, x - 4, y - 3, 8, 7, '#5a566a');
      }
      dot(g, 18, 22, '#08060c', 28, 34);
      ellipseFill(g, 32, 22, 13, 11, '#08060c');
      for (let i = 0; i < 5; i++) dot(g, 20 + i, 36 + i * 4, shade('#5a566a', 1 - i * 0.15), 24 - i * 2, 2);
      box(g, 27, 1, 10, 9, '#6a6680');
      dot(g, 0, 54, '#3a3648', 64, 3);
      noOutline = false;
      break;
    }
    case 'campfire': {
      [c, g] = makeCanvas(22, 14); ax = 11; ay = 11;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(g, Math.round(11 + Math.cos(a) * 8) - 2, Math.round(8 + Math.sin(a) * 4) - 1, 4, 3, '#6a6674'); }
      dot(g, 5, 7, '#5a3a24', 12, 2); dot(g, 8, 5, '#6a4a2e', 2, 6); dot(g, 13, 5, '#6a4a2e', 2, 6);
      dot(g, 7, 8, '#ff6a1f', 8, 1);
      break;
    }
    case 'well': {
      [c, g] = makeCanvas(24, 34); ax = 12; ay = 32;
      ellipseFill(g, 12, 25, 10, 6, '#6a6674'); ellipseFill(g, 12, 24, 7, 4, '#0a1420'); dot(g, 9, 23, '#3a5a7a', 3, 1);
      dot(g, 3, 6, '#5a3a24', 2, 20); dot(g, 19, 6, '#5a3a24', 2, 20);
      for (let y = 0; y < 7; y++) dot(g, y, 6 - y + 1, '#6b3a2e', 24 - y * 2, 1);
      dot(g, 5, 12, '#8a6a48', 14, 2); dot(g, 11, 14, '#c8c0a0', 1, 6);
      break;
    }
    case 'noticeBoard': {
      [c, g] = makeCanvas(24, 26); ax = 12; ay = 25;
      dot(g, 3, 10, '#4a2e1c', 2, 16); dot(g, 19, 10, '#4a2e1c', 2, 16);
      box(g, 1, 2, 22, 14, '#7a5230'); dot(g, 0, 1, '#5a3a24', 24, 2);
      dot(g, 3, 5, '#e8e0c8', 6, 7); dot(g, 11, 4, '#f0e8d0', 5, 5); dot(g, 17, 6, '#e0d0b0', 4, 6);
      dot(g, 4, 7, '#6a5a4a', 4, 1); dot(g, 4, 9, '#6a5a4a', 3, 1); dot(g, 12, 6, '#8a2a2a', 3, 1);
      dot(g, 13, 11, '#ffd24a', 2, 3);
      break;
    }
    case 'lampPost': {
      [c, g] = makeCanvas(10, 30); ax = 5; ay = 29;
      dot(g, 4, 8, '#2e2a30', 2, 21); dot(g, 2, 27, '#2e2a30', 6, 2);
      box(g, 2, 2, 6, 7, '#3a3440'); dot(g, 3, 3, '#ffe08a', 4, 5); dot(g, 3, 1, '#2e2a30', 4, 1);
      break;
    }
    case 'fence': {
      [c, g] = makeCanvas(18, 12); ax = 9; ay = 11;
      dot(g, 2, 2, '#6a4a30', 2, 10); dot(g, 14, 2, '#6a4a30', 2, 10);
      dot(g, 0, 4, '#8a6440', 18, 2); dot(g, 0, 8, '#7a5838', 18, 2);
      break;
    }
    case 'woodpile': {
      [c, g] = makeCanvas(20, 12); ax = 10; ay = 11;
      for (const [x, y] of [[1, 7], [7, 7], [13, 7], [4, 3], [10, 3], [7, 0]]) { box(g, x, y, 6, 4, '#6a4a2e'); dot(g, x + 1, y + 1, '#c8a878', 2, 2); }
      break;
    }
    case 'cart': {
      [c, g] = makeCanvas(28, 18); ax = 14; ay = 17;
      box(g, 3, 4, 22, 8, '#7a5230'); dot(g, 3, 4, '#9a7048', 22, 1);
      ellipseFill(g, 7, 13, 4, 4, '#3a2a1e'); ellipseFill(g, 7, 13, 1, 1, '#8a6a48');
      ellipseFill(g, 21, 13, 4, 4, '#3a2a1e'); ellipseFill(g, 21, 13, 1, 1, '#8a6a48');
      dot(g, 25, 7, '#5a3a24', 3, 2);
      dot(g, 6, 1, '#c8a050', 5, 3); dot(g, 13, 2, '#a05a3a', 6, 2);
      break;
    }
    case 'signpost': {
      [c, g] = makeCanvas(18, 22); ax = 9; ay = 21;
      dot(g, 8, 4, '#5a3a24', 2, 18);
      box(g, 2, 3, 14, 5, '#8a6440'); dot(g, 16, 4, '#8a6440', 1, 3);
      box(g, 3, 10, 12, 4, '#7a5838'); dot(g, 2, 11, '#7a5838', 1, 2);
      break;
    }
    case 'bench': {
      [c, g] = makeCanvas(24, 12); ax = 12; ay = 11;
      dot(g, 2, 7, '#4a2e1c', 2, 5); dot(g, 20, 7, '#4a2e1c', 2, 5);
      box(g, 0, 4, 24, 4, '#8a6440');
      break;
    }
    case 'hayBale': {
      [c, g] = makeCanvas(18, 14); ax = 9; ay = 13;
      box(g, 1, 3, 16, 10, '#c8a048'); dot(g, 1, 3, '#e8c870', 16, 2);
      dot(g, 6, 3, '#8a6a2a', 1, 10); dot(g, 12, 3, '#8a6a2a', 1, 10);
      break;
    }
    case 'trainingDummy': {
      [c, g] = makeCanvas(16, 28); ax = 8; ay = 27;
      dot(g, 7, 12, '#5a3a24', 2, 16);
      box(g, 3, 8, 10, 10, '#c8a060'); dot(g, 1, 10, '#c8a060', 14, 3);
      ellipseFill(g, 8, 5, 4, 4, '#d8b070'); dot(g, 6, 5, '#8a2a2a', 4, 1);
      break;
    }
    default: {
      [c, g] = makeCanvas(10, 10); ax = 5; ay = 9;
      box(g, 1, 1, 8, 8, '#ff00ff');
    }
  }
  if (!noOutline) outline(c);
  return { c, ax, ay };
}

// ------------------------------------------------------------------ flat floor decor (baked)

export function paintDecor(g, d, theme) {
  const { x, y } = d;
  const v = d.v | 0;
  const X = Math.round(x), Y = Math.round(y);
  switch (d.type) {
    case 'bones':
      dot(g, X - 3, Y, '#c8c0a8', 6, 1); dot(g, X - 4, Y - 1, '#c8c0a8', 1, 1); dot(g, X + 2, Y + 1, '#c8c0a8', 1, 1);
      if (v & 1) { dot(g, X - 1, Y - 3, '#b8b098', 1, 5); }
      if (v & 2) { dot(g, X + 3, Y - 2, '#b0a890', 3, 1); }
      break;
    case 'skull':
      dot(g, X - 2, Y - 2, '#d8d0b8', 4, 3); dot(g, X - 1, Y + 1, '#d8d0b8', 2, 1);
      dot(g, X - 1, Y - 1, '#1a1418'); dot(g, X + 1, Y - 1, '#1a1418');
      break;
    case 'rubble': case 'ashpile': case 'pebbles': case 'stones': {
      const col = d.type === 'ashpile' ? '#3a3230' : d.type === 'pebbles' ? '#7a6a58' : d.type === 'stones' ? '#6a6a70' : shade(theme ? theme.floorHi : '#5a5660', 1.1);
      for (let i = 0; i < 4 + (v & 3); i++) {
        const ox = Math.round((hash(i, v) - 0.5) * 9), oy = Math.round((hash(v, i + 3) - 0.5) * 6);
        dot(g, X + ox, Y + oy, i & 1 ? col : shade(col, 0.75), 1 + (i % 3 === 0 ? 1 : 0), 1);
      }
      if (d.type === 'ashpile') dot(g, X, Y, '#ff6a1f');
      break;
    }
    case 'cobweb': {
      const dir = v === 0 ? 1 : -1;
      g.fillStyle = 'rgba(210,210,220,0.35)';
      for (let i = 0; i < 9; i++) { g.fillRect(X + dir * i, Y + i, 1, 1); g.fillRect(X + dir * i, Y, 1, 1); g.fillRect(X, Y + i, 1, 1); }
      for (let i = 2; i < 8; i += 3) { g.fillRect(X + dir * i, Y + 2, 1, 1); g.fillRect(X + dir * 2, Y + i, 1, 1); g.fillRect(X + dir * (i - 1), Y + i - 1, 1, 1); }
      break;
    }
    case 'moss':
      for (let i = 0; i < 7; i++) dot(g, X + Math.round((hash(i, v) - 0.5) * 10), Y + Math.round((hash(v, i) - 0.5) * 6), i & 1 ? theme.accent : theme.accent2, 2, 1);
      break;
    case 'crack': case 'cobbleCrack': {
      const col = d.type === 'cobbleCrack' ? '#3a3a42' : shade(theme.floorLine, 0.8);
      let cx = X, cy = Y;
      for (let i = 0; i < 6; i++) { dot(g, cx, cy, col); cx += (hash(i, v) > 0.5 ? 1 : -1); cy += 1; }
      break;
    }
    case 'coffin':
      dot(g, X - 3, Y - 5, '#3a2418', 6, 10); dot(g, X - 2, Y - 4, '#4a3024', 4, 8);
      break;
    case 'urnpile':
      dot(g, X - 3, Y, '#8a5a3a', 2, 1); dot(g, X, Y - 1, '#7a4a2a', 3, 1); dot(g, X + 2, Y + 1, '#8a5a3a', 2, 1);
      break;
    case 'grave': dot(g, X - 2, Y - 3, '#5a5a64', 4, 4); dot(g, X - 1, Y - 2, '#3a3a44', 2, 1); break;
    case 'mushrooms':
      for (let i = 0; i < 3; i++) {
        const ox = X - 3 + i * 3, oy = Y + (i & 1);
        dot(g, ox, oy, '#c8c0b0', 1, 2); dot(g, ox - 1, oy - 1, i === 1 ? theme.accent2 : theme.accent, 3, 1);
      }
      break;
    case 'roots':
      g.fillStyle = '#3a2a1e';
      for (let i = 0; i < 7; i++) g.fillRect(X + (v ? -i : i), Y + Math.round(Math.sin(i) * 2) + 2, 1, 1);
      break;
    case 'sporepod': dot(g, X - 1, Y - 1, '#a04a7a', 3, 3); dot(g, X, Y - 1, '#ffb0e0'); break;
    case 'anvil': dot(g, X - 3, Y - 1, '#4a4652', 6, 2); break;
    case 'chains': g.fillStyle = '#5a5664'; for (let i = 0; i < 6; i++) g.fillRect(X - 3 + i, Y + (i & 1), 1, 1); break;
    case 'grate':
      dot(g, X - 5, Y - 5, '#1a1618', 10, 10);
      for (let i = 0; i < 10; i += 3) dot(g, X - 5 + i, Y - 5, '#4a4452', 1, 10);
      dot(g, X - 5, Y - 5, '#5a5462', 10, 1);
      dot(g, X - 1, Y + 1, '#ff6a1f', 1, 1);
      break;
    case 'ingots': dot(g, X - 2, Y, '#c8903a', 4, 2); dot(g, X - 2, Y, '#ffd890', 4, 1); break;
    case 'crystals': case 'shards': case 'geode':
      for (let i = 0; i < 3; i++) dot(g, X - 2 + i * 2, Y - (i === 1 ? 3 : 1), i === 1 ? theme.accent2 : theme.accent, 1, i === 1 ? 3 : 2);
      break;
    case 'banner': {
      const cols = ['#6a1a1a', '#1a3a5a', '#3a4a1a', '#4a1a4a'];
      box(g, X - 4, Y - 14, 8, 11, cols[v & 3]); dot(g, X - 5, Y - 15, '#6a5a4a', 10, 1);
      dot(g, X - 1, Y - 11, '#c9a45a', 2, 4); dot(g, X - 4, Y - 3, cols[v & 3], 2, 1); dot(g, X + 2, Y - 3, cols[v & 3], 2, 1);
      break;
    }
    case 'wallChains':
      g.fillStyle = '#5a5664';
      for (let i = 0; i < 8; i++) { g.fillRect(X - 3, Y - 14 + i, 1, 1); g.fillRect(X + 3, Y - 12 + i, 1, 1); }
      dot(g, X - 4, Y - 6, '#6a6674', 3, 2);
      break;
    case 'flowers': {
      const cols = ['#e86a8a', '#e8d06a', '#8ab0e8', '#ffffff', '#c88ae8'];
      for (let i = 0; i < 4; i++) { const ox = Math.round((hash(i, v) - 0.5) * 8), oy = Math.round((hash(v, i) - 0.5) * 6); dot(g, X + ox, Y + oy + 1, '#3a6a2a'); dot(g, X + ox, Y + oy, cols[(v + i) % cols.length]); }
      break;
    }
    case 'tuft':
      dot(g, X, Y - 2, '#5a8a3a', 1, 3); dot(g, X - 1, Y - 1, '#4a7a32', 1, 2); dot(g, X + 1, Y - 1, '#6a9a44', 1, 2);
      break;
    case 'mushroomRing':
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; dot(g, Math.round(X + Math.cos(a) * 5), Math.round(Y + Math.sin(a) * 3), '#d8c8b0'); }
      break;
    default: break;
  }
}
