// Global constants and balance values. Pure module.

export const GAME_TITLE = 'Gloamdeep';
export const GAME_SUBTITLE = 'The Lantern Below';
export const VERSION = '1.0.0';

/** World units: one tile is 16 world pixels. The screen renders world pixels 1:1 into a low-res buffer. */
export const TILE = 16;

/** Target world-pixel height of the view. Integer upscaling is chosen so the view stays close to this. */
export const VIEW_TARGET_H = 270;

export const MAX_PARTICLES = 3200;
export const MAX_PROJECTILES = 260;
export const MAX_ENEMIES = 140;
export const MAX_GROUND_ITEMS = 120;
export const MAX_FLOATERS = 90;

export const INVENTORY_SLOTS = 30;
export const STORAGE_SLOTS = 60;
export const MAX_POTIONS = 12;
export const MERCHANT_STOCK = 10;

export const BOSS_INTERVAL = 5;

export const PLAYER_BASE = {
  hp: 100,
  mp: 60,
  str: 10,
  int: 10,
  vit: 10,
  dex: 10,
  speed: 80,
  hpRegen: 0.6,
  mpRegen: 5,
  critChance: 0.05,
  critMult: 1.6,
  dashCooldown: 0.85,
  dashSpeed: 285,
  dashTime: 0.17,
  dashInvuln: 0.24,
  potionHeal: 0.45,
  potionCooldown: 1.0,
};

/** Attribute gains per level. */
export const LEVEL_GAINS = { str: 2, int: 2, vit: 2, dex: 1, hp: 8, mp: 4 };

export function xpForLevel(level) {
  return Math.floor(60 * Math.pow(level, 1.55) + 40 * level);
}

export const RARITIES = [
  { id: 'common',    name: 'Common',    color: '#c9c3b6', affixes: [0, 0], mult: 1.0,  weight: 60 },
  { id: 'magic',     name: 'Magic',     color: '#5aa7ff', affixes: [1, 2], mult: 1.12, weight: 28 },
  { id: 'rare',      name: 'Rare',      color: '#ffd84a', affixes: [3, 4], mult: 1.25, weight: 9 },
  { id: 'epic',      name: 'Epic',      color: '#c46bff', affixes: [4, 5], mult: 1.4,  weight: 2.6 },
  { id: 'legendary', name: 'Legendary', color: '#ff8a1f', affixes: [4, 5], mult: 1.6,  weight: 0.55 },
];

export const RARITY_INDEX = Object.fromEntries(RARITIES.map((r, i) => [r.id, i]));
export const rarityColor = (id) => (RARITIES[RARITY_INDEX[id]] || RARITIES[0]).color;

export const SAVE_KEY = 'gloamdeep.save';
export const SETTINGS_KEY = 'gloamdeep.settings';
export const SAVE_VERSION = 3;
