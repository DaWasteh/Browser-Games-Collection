// 16x16 pixel-art item icons for the DOM interface (cached as data URLs).

import { makeCanvas, outline, dot } from './pixel.js';
import { metalColors } from './sprites.js';
import { rarityColor } from '../config.js';
import { SPELLS } from '../gen/items.js';
import { shade } from '../core/math.js';

const cache = new Map();

function diag(g, x0, y0, len, col, w = 1) {
  for (let i = 0; i < len; i++) dot(g, x0 + i, y0 - i, col, w, w);
}

function paintIcon(g, item) {
  const [m, hi] = metalColors(item.tier || 0);
  const gem = rarityColor(item.rarity);
  const grip = '#5a3a24';
  switch (item.slot === 'weapon' ? item.base : item.slot === 'focus' ? 'focus' : item.slot) {
    case 'sword':
      diag(g, 5, 10, 9, m, 2); diag(g, 6, 9, 8, hi, 1);
      dot(g, 3, 11, '#c9a45a', 4, 1); dot(g, 5, 9, '#c9a45a', 1, 4);
      diag(g, 2, 14, 3, grip, 1); dot(g, 1, 14, gem, 2, 2);
      break;
    case 'axe':
      diag(g, 3, 14, 11, grip, 1); diag(g, 4, 14, 10, shade(grip, 1.3), 1);
      dot(g, 8, 2, m, 6, 6); dot(g, 13, 2, hi, 1, 6); dot(g, 9, 1, m, 3, 1); dot(g, 9, 8, m, 3, 1);
      dot(g, 9, 4, gem, 1, 1);
      break;
    case 'dagger':
      diag(g, 7, 8, 6, m, 2); diag(g, 8, 7, 5, hi, 1);
      dot(g, 5, 9, '#c9a45a', 4, 1); dot(g, 6, 8, '#c9a45a', 1, 3);
      diag(g, 3, 12, 3, grip, 2); dot(g, 2, 13, gem, 1, 1);
      break;
    case 'mace':
      diag(g, 2, 14, 8, grip, 1);
      dot(g, 8, 2, m, 6, 6); dot(g, 8, 2, hi, 6, 1); dot(g, 7, 4, hi, 1, 2); dot(g, 14, 4, hi, 1, 2); dot(g, 10, 1, hi, 2, 1); dot(g, 10, 8, hi, 2, 1);
      dot(g, 10, 4, gem, 2, 2);
      break;
    case 'spear':
      diag(g, 1, 15, 11, grip, 1);
      dot(g, 11, 2, m, 3, 3); dot(g, 12, 1, hi, 2, 1); dot(g, 14, 1, hi, 1, 2); dot(g, 10, 5, '#c9a45a', 2, 1);
      dot(g, 9, 6, gem, 1, 1);
      break;
    case 'focus': {
      const col = SPELLS[item.spell] ? SPELLS[item.spell].color : '#ff8a2e';
      if (item.base === 'frost') {
        dot(g, 7, 1, hi, 2, 2); dot(g, 6, 3, col, 4, 8); dot(g, 5, 5, col, 6, 4); dot(g, 7, 3, '#ffffff', 1, 6); dot(g, 7, 11, col, 2, 2);
      } else if (item.base === 'storm') {
        dot(g, 4, 4, col, 8, 8); dot(g, 3, 6, col, 10, 4); dot(g, 6, 5, '#ffffff', 2, 2); dot(g, 8, 7, '#ffffff', 2, 3);
        dot(g, 5, 12, '#5a5a64', 6, 2);
      } else if (item.base === 'void') {
        dot(g, 4, 4, '#2a1a3a', 8, 8); dot(g, 3, 6, '#2a1a3a', 10, 4); dot(g, 6, 6, col, 4, 4); dot(g, 7, 7, '#ffffff', 2, 2);
      } else {
        dot(g, 4, 3, col, 8, 9); dot(g, 3, 5, col, 10, 5); dot(g, 5, 4, '#ffd070', 3, 3); dot(g, 6, 5, '#fff4c0', 1, 1);
        dot(g, 5, 12, '#6a4a2a', 6, 2);
      }
      break;
    }
    case 'helm':
      dot(g, 4, 3, m, 8, 9); dot(g, 3, 5, m, 10, 6); dot(g, 5, 2, hi, 6, 1); dot(g, 4, 3, hi, 1, 5);
      dot(g, 5, 7, '#141018', 6, 2); dot(g, 7, 9, '#141018', 2, 3);
      dot(g, 7, 1, gem, 2, 2);
      break;
    case 'armor':
      dot(g, 3, 3, m, 10, 10); dot(g, 1, 3, m, 3, 5); dot(g, 12, 3, m, 3, 5);
      dot(g, 3, 3, hi, 10, 1); dot(g, 6, 2, '#141018', 4, 2);
      dot(g, 7, 5, shade(m, 0.7), 2, 7); dot(g, 3, 9, '#5a3a24', 10, 1); dot(g, 7, 9, gem, 2, 1);
      break;
    case 'boots':
      dot(g, 3, 2, m, 4, 9); dot(g, 3, 10, m, 8, 3); dot(g, 9, 11, m, 4, 2); dot(g, 3, 2, hi, 4, 1);
      dot(g, 3, 13, '#2e2420', 10, 1); dot(g, 3, 6, gem, 4, 1);
      break;
    case 'ring':
      dot(g, 4, 6, '#d8b04a', 8, 1); dot(g, 3, 7, '#d8b04a', 1, 4); dot(g, 12, 7, '#d8b04a', 1, 4); dot(g, 4, 11, '#d8b04a', 8, 1);
      dot(g, 4, 7, '#fff0a0', 1, 1);
      dot(g, 6, 3, gem, 4, 4); dot(g, 7, 3, '#ffffff', 1, 1);
      break;
    case 'amulet':
      diag(g, 3, 8, 5, '#b8a060'); for (let i = 0; i < 5; i++) dot(g, 8 + i, 4 + i, '#b8a060');
      dot(g, 6, 9, '#d8b04a', 4, 5); dot(g, 7, 10, gem, 2, 3); dot(g, 7, 10, '#ffffff', 1, 1);
      break;
    case 'potion':
      dot(g, 6, 1, '#8a6a4a', 4, 2); dot(g, 6, 3, '#c8d8e8', 4, 2);
      dot(g, 4, 5, '#c8d8e8', 8, 9); dot(g, 5, 6, '#d02a3a', 6, 7); dot(g, 5, 6, '#ff6a7a', 2, 3);
      break;
    default:
      dot(g, 4, 4, gem, 8, 8);
  }
}

const canvasCache = new Map();

/** Icon as a canvas (used for items lying on the ground). */
export function itemIconCanvas(item) {
  const key = `${item.slot}|${item.base}|${item.tier}|${item.rarity}|${item.spell || ''}`;
  let c = canvasCache.get(key);
  if (c) return c;
  let g;
  [c, g] = makeCanvas(16, 16);
  paintIcon(g, item);
  outline(c, [10, 6, 12]);
  canvasCache.set(key, c);
  return c;
}

export function itemIcon(item) {
  const key = `${item.slot}|${item.base}|${item.tier}|${item.rarity}|${item.spell || ''}`;
  let url = cache.get(key);
  if (url) return url;
  url = itemIconCanvas(item).toDataURL();
  cache.set(key, url);
  return url;
}

export function potionIcon() {
  return itemIcon({ slot: 'potion', base: 'potion', tier: 0, rarity: 'common' });
}

const SLOT_GHOSTS = {};
/** Faint placeholder icon for empty equipment slots. */
export function slotGhost(slot) {
  if (SLOT_GHOSTS[slot]) return SLOT_GHOSTS[slot];
  const base = slot === 'weapon' ? 'sword' : slot === 'focus' ? 'ember' : slot;
  const [c, g] = makeCanvas(16, 16);
  paintIcon(g, { slot, base, tier: 1, rarity: 'common', spell: 'ember' });
  const d = g.getImageData(0, 0, 16, 16);
  for (let i = 0; i < d.data.length; i += 4) {
    const l = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = l * 0.5;
    d.data[i + 3] = d.data[i + 3] ? 90 : 0;
  }
  g.putImageData(d, 0, 0);
  SLOT_GHOSTS[slot] = c.toDataURL();
  return SLOT_GHOSTS[slot];
}
