// Persistence: profile schema, validation, migration and a localStorage adapter.
// The pure functions (defaultProfile, serialize, deserialize, migrate) are unit tested in Node.

import { SAVE_KEY, SETTINGS_KEY, SAVE_VERSION, INVENTORY_SLOTS, STORAGE_SLOTS, MAX_POTIONS, xpForLevel } from '../config.js';
import { SLOTS, sanitizeItem, starterKit } from '../gen/items.js';
import { sanitizeQuest } from '../gen/quests.js';
import { randomSeed } from '../core/rng.js';

export function defaultProfile(seed = randomSeed()) {
  const kit = starterKit(seed);
  const equipment = Object.fromEntries(SLOTS.map((s) => [s, null]));
  equipment.weapon = kit.weapon;
  equipment.armor = kit.armor;
  equipment.focus = kit.focus;
  return {
    version: SAVE_VERSION,
    seed: seed >>> 0,
    createdAt: Date.now(),
    savedAt: Date.now(),
    level: 1,
    xp: 0,
    gold: 60,
    potions: 3,
    inventory: new Array(INVENTORY_SLOTS).fill(null),
    storage: new Array(STORAGE_SLOTS).fill(null),
    equipment,
    maxDepth: 0,
    location: { type: 'town' },
    quest: null,
    questsCompleted: 0,
    merchant: { stock: [], potions: 5, key: '' },
    runs: 0,
    stats: { kills: 0, elites: 0, bosses: 0, deaths: 0, goldEarned: 0, playTime: 0, itemsFound: 0 },
    tutorial: { talked: false },
  };
}

export const DEFAULT_SETTINGS = {
  volume: 0.7,
  music: 0.5,
  muted: false,
  shake: true,
  damageNumbers: true,
  showMinimap: true,
  touch: 'auto', // touch controls: 'auto' (shown after touch input), 'on' or 'off'
};
export const TOUCH_MODES = ['auto', 'on', 'off'];

export function serialize(profile) {
  return JSON.stringify({ ...profile, version: SAVE_VERSION, savedAt: Date.now() });
}

/**
 * Upgrade older save layouts to the current one. Unknown versions are rejected.
 *  v1: flat { seed, level, xp, gold, potions, items:[], equipped:{weapon,armor,accessory}, chest:[], depth }
 *  v2: like v3 but `equipment.accessory` instead of ring/amulet and no merchant block.
 */
export function migrate(data) {
  if (!data || typeof data !== 'object') throw new Error('save is not an object');
  let v = Number(data.version) || 1;
  let d = { ...data };
  if (v > SAVE_VERSION) throw new Error(`save version ${v} is newer than supported ${SAVE_VERSION}`);
  if (v === 1) {
    d = {
      version: 2,
      seed: d.seed,
      level: d.level,
      xp: d.xp,
      gold: d.gold,
      potions: d.potions,
      inventory: d.items || [],
      storage: d.chest || [],
      equipment: d.equipped || {},
      maxDepth: d.depth || d.maxDepth || 0,
      quest: d.quest || null,
    };
    v = 2;
  }
  if (v === 2) {
    const eq = { ...(d.equipment || {}) };
    if (eq.accessory && !eq.ring) {
      eq[eq.accessory.slot === 'amulet' ? 'amulet' : 'ring'] = { ...eq.accessory, slot: eq.accessory.slot === 'amulet' ? 'amulet' : 'ring' };
    }
    delete eq.accessory;
    d = { ...d, equipment: eq, version: 3 };
    v = 3;
  }
  return d;
}

/** Build a valid profile from untrusted data. Never throws for malformed fields: it repairs them. */
export function sanitizeProfile(raw) {
  const warnings = [];
  const seed = Number.isFinite(raw.seed) ? raw.seed >>> 0 : randomSeed();
  const p = defaultProfile(seed);
  const int = (v, lo, hi, def) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : def);

  p.createdAt = int(raw.createdAt, 0, 9e15, Date.now());
  p.level = int(raw.level, 1, 200, 1);
  p.xp = int(raw.xp, 0, xpForLevel(p.level) - 1, 0);
  p.gold = int(raw.gold, 0, 1e9, 0);
  p.potions = int(raw.potions, 0, MAX_POTIONS, 0);
  p.maxDepth = int(raw.maxDepth, 0, 100000, 0);
  p.questsCompleted = int(raw.questsCompleted, 0, 1e6, 0);
  p.runs = int(raw.runs, 0, 1e7, 0);

  const fillSlots = (arr, n, label) => {
    const out = new Array(n).fill(null);
    if (!Array.isArray(arr)) { if (arr != null) warnings.push(`${label} was not a list`); return out; }
    let k = 0;
    for (const raw of arr) {
      if (raw == null) { k++; continue; }
      const it = sanitizeItem(raw);
      if (!it) { warnings.push(`dropped invalid ${label} item`); k++; continue; }
      if (k < n) out[k++] = it;
      else {
        const free = out.indexOf(null);
        if (free >= 0) out[free] = it; else warnings.push(`${label} overflow`);
      }
    }
    return out;
  };
  p.inventory = fillSlots(raw.inventory, INVENTORY_SLOTS, 'inventory');
  p.storage = fillSlots(raw.storage, STORAGE_SLOTS, 'storage');

  const eqRaw = raw.equipment && typeof raw.equipment === 'object' ? raw.equipment : {};
  for (const slot of SLOTS) {
    if (!(slot in eqRaw)) continue; // keep starter item for missing slot keys
    const it = eqRaw[slot] ? sanitizeItem(eqRaw[slot]) : null;
    if (eqRaw[slot] && (!it || it.slot !== slot)) { warnings.push(`invalid ${slot} equipment`); p.equipment[slot] = null; continue; }
    p.equipment[slot] = it;
  }

  const loc = raw.location;
  if (loc && loc.type === 'dungeon' && Number.isFinite(loc.depth) && loc.depth >= 1) {
    p.location = { type: 'dungeon', depth: Math.min(Math.floor(loc.depth), Math.max(1, p.maxDepth)) };
  }

  p.quest = raw.quest ? sanitizeQuest(raw.quest) : null;

  if (raw.merchant && typeof raw.merchant === 'object') {
    p.merchant.stock = Array.isArray(raw.merchant.stock) ? raw.merchant.stock.map(sanitizeItem).filter(Boolean).slice(0, 16) : [];
    p.merchant.potions = int(raw.merchant.potions, 0, 20, 5);
    p.merchant.key = typeof raw.merchant.key === 'string' ? raw.merchant.key.slice(0, 40) : '';
  }
  if (raw.stats && typeof raw.stats === 'object') {
    for (const k of Object.keys(p.stats)) p.stats[k] = int(raw.stats[k], 0, 1e12, 0);
  }
  if (raw.tutorial && typeof raw.tutorial === 'object') p.tutorial.talked = !!raw.tutorial.talked;
  return { profile: p, warnings };
}

/** Parse + migrate + sanitise. Returns { profile, warnings } or { error }. */
export function deserialize(text) {
  if (typeof text !== 'string' || !text.trim()) return { error: 'empty save' };
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'save data is corrupted (invalid JSON)' }; }
  try {
    const migrated = migrate(data);
    return sanitizeProfile(migrated);
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const f = (v, d) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
  s.volume = f(raw.volume, s.volume);
  s.music = f(raw.music, s.music);
  for (const k of ['muted', 'shake', 'damageNumbers', 'showMinimap']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
  if (TOUCH_MODES.includes(raw.touch)) s.touch = raw.touch;
  return s;
}

/** Thin wrapper around a Storage-like object (localStorage in the browser, a Map-backed mock in tests). */
export class SaveStore {
  constructor(storage) {
    this.storage = storage || null;
    this.lastError = null;
  }

  _get(key) {
    try { return this.storage ? this.storage.getItem(key) : null; } catch (e) { this.lastError = e; return null; }
  }

  _set(key, value) {
    try { if (this.storage) this.storage.setItem(key, value); return true; } catch (e) { this.lastError = e; return false; }
  }

  hasSave() {
    const r = this.load();
    return !!(r && r.profile);
  }

  load() {
    const text = this._get(SAVE_KEY);
    if (text == null) return null;
    return deserialize(text);
  }

  save(profile) {
    return this._set(SAVE_KEY, serialize(profile));
  }

  clear() {
    try { if (this.storage) this.storage.removeItem(SAVE_KEY); } catch (e) { this.lastError = e; }
  }

  loadSettings() {
    const text = this._get(SETTINGS_KEY);
    if (!text) return { ...DEFAULT_SETTINGS };
    try { return sanitizeSettings(JSON.parse(text)); } catch { return { ...DEFAULT_SETTINGS }; }
  }

  saveSettings(settings) {
    return this._set(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
  }
}
