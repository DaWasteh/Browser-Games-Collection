// Item generation: bases, affixes, rarities, legendary powers, naming, pricing, comparison.
// Pure module (no DOM) so it can be unit tested in Node.

import { RNG } from '../core/rng.js';
import { RARITIES, RARITY_INDEX } from '../config.js';

export const SLOTS = ['weapon', 'focus', 'helm', 'armor', 'boots', 'ring', 'amulet'];
export const SLOT_NAMES = {
  weapon: 'Weapon', focus: 'Focus', helm: 'Helm', armor: 'Armor', boots: 'Boots', ring: 'Ring', amulet: 'Amulet',
};

/** Weapon feel: damage range, swings per second, arc (radians), reach (world px). */
export const WEAPON_BASES = {
  sword:  { names: ['Shortsword', 'Longsword', 'Broadsword', 'Falchion'], dmg: [6, 10], speed: 1.9, arc: 1.95, reach: 27, knock: 70, desc: 'Balanced sweeping cuts' },
  axe:    { names: ['Hatchet', 'War Axe', 'Cleaver', 'Bearded Axe'], dmg: [9, 15], speed: 1.35, arc: 2.3, reach: 27, knock: 90, desc: 'Wide, heavy cleaves' },
  dagger: { names: ['Dirk', 'Stiletto', 'Kris', 'Shiv'], dmg: [4, 7], speed: 2.8, arc: 1.35, reach: 21, knock: 35, crit: 0.06, desc: 'Rapid strikes, +6% crit' },
  mace:   { names: ['Cudgel', 'Flail', 'Morningstar', 'Maul'], dmg: [8, 13], speed: 1.5, arc: 1.7, reach: 25, knock: 150, stagger: true, desc: 'Staggering blows' },
  spear:  { names: ['Pike', 'Glaive', 'Partisan', 'Halberd'], dmg: [7, 12], speed: 1.65, arc: 0.7, reach: 40, knock: 80, desc: 'Long-reaching thrusts' },
};

/** Spell foci. The equipped focus decides the right-click spell. */
export const FOCUS_BASES = {
  ember: { names: ['Ember Orb', 'Cinder Lens', 'Pyre Heart'], spell: 'ember', desc: 'Ember Bolt: explodes and ignites' },
  frost: { names: ['Frost Shard', 'Rime Crystal', 'Glacial Eye'], spell: 'frost', desc: 'Frost Lance: pierces and chills' },
  storm: { names: ['Storm Prism', 'Thunder Coil', 'Static Idol'], spell: 'storm', desc: 'Chain Lightning: arcs between foes' },
  void:  { names: ['Void Stone', 'Null Pearl', 'Abyssal Eye'], spell: 'void', desc: 'Void Orb: grinding, piercing orb' },
};

export const SPELLS = {
  ember: { name: 'Ember Bolt', cost: 11, cooldown: 0.42, power: 1.0, color: '#ff8a2e' },
  frost: { name: 'Frost Lance', cost: 9, cooldown: 0.34, power: 0.8, color: '#8ae0ff' },
  storm: { name: 'Chain Lightning', cost: 14, cooldown: 0.55, power: 0.85, color: '#c8d8ff' },
  void:  { name: 'Void Orb', cost: 22, cooldown: 1.1, power: 0.55, color: '#b36bff' },
};

const ARMOR_BASES = {
  helm:   { names: ['Hood', 'Coif', 'Sallet', 'Great Helm'], armor: 3 },
  armor:  { names: ['Jerkin', 'Brigandine', 'Hauberk', 'Plate Coat'], armor: 7, hp: 6 },
  boots:  { names: ['Wraps', 'Sabatons', 'Treads', 'Greaves'], armor: 2, moveSpd: 4 },
  ring:   { names: ['Band', 'Signet', 'Loop', 'Seal'] },
  amulet: { names: ['Pendant', 'Talisman', 'Charm', 'Locket'] },
};

export const MATERIALS = ['Rusty', 'Iron', 'Steel', 'Darksteel', 'Runic', 'Obsidian', 'Starforged'];
export const materialTier = (ilvl) => Math.min(MATERIALS.length - 1, Math.floor((ilvl - 1) / 4));

/** Affix definitions: value range at ilvl 1 and growth per ilvl. `pct` values are percentages. */
export const AFFIXES = {
  dmgFlat:   { label: '+{v} Damage', pre: 'Honed', suf: 'of Ruin', min: 1, max: 3, grow: 0.55, slots: ['weapon', 'ring', 'amulet'] },
  dmgPct:    { label: '+{v}% Physical Damage', pre: 'Cruel', suf: 'of Slaughter', min: 5, max: 12, grow: 0.7, slots: ['weapon', 'ring', 'amulet', 'helm'] },
  atkSpd:    { label: '+{v}% Attack Speed', pre: 'Swift', suf: 'of Fury', min: 4, max: 9, grow: 0.25, cap: 40, slots: ['weapon', 'ring', 'boots'] },
  crit:      { label: '+{v}% Critical Chance', pre: 'Keen', suf: 'of Precision', min: 2, max: 5, grow: 0.12, cap: 25, slots: ['weapon', 'ring', 'helm', 'amulet'] },
  critDmg:   { label: '+{v}% Critical Damage', pre: 'Vicious', suf: 'of Carnage', min: 10, max: 22, grow: 1.1, slots: ['weapon', 'amulet', 'ring'] },
  hp:        { label: '+{v} Maximum Life', pre: 'Stalwart', suf: 'of the Bear', min: 8, max: 18, grow: 2.6, slots: ['armor', 'helm', 'boots', 'amulet', 'ring'] },
  mp:        { label: '+{v} Maximum Mana', pre: 'Lucid', suf: 'of the Owl', min: 6, max: 14, grow: 1.6, slots: ['focus', 'helm', 'amulet', 'ring'] },
  armor:     { label: '+{v} Armor', pre: 'Warded', suf: 'of the Bulwark', min: 3, max: 7, grow: 1.1, slots: ['armor', 'helm', 'boots'] },
  hpRegen:   { label: '+{v} Life per Second', pre: 'Mending', suf: 'of the Troll', min: 0.5, max: 1.5, grow: 0.18, dec: 1, slots: ['armor', 'amulet', 'ring', 'helm'] },
  mpRegen:   { label: '+{v} Mana per Second', pre: 'Focused', suf: 'of Clarity', min: 0.8, max: 2, grow: 0.15, dec: 1, slots: ['focus', 'amulet', 'ring', 'helm'] },
  moveSpd:   { label: '+{v}% Movement Speed', pre: 'Fleet', suf: 'of the Wind', min: 4, max: 8, grow: 0.12, cap: 25, slots: ['boots'] },
  lifeOnHit: { label: '+{v} Life on Hit', pre: 'Leeching', suf: 'of the Leech', min: 1, max: 2, grow: 0.3, slots: ['weapon', 'ring', 'amulet'] },
  spellPct:  { label: '+{v}% Spell Damage', pre: 'Arcane', suf: 'of Sorcery', min: 6, max: 14, grow: 0.8, slots: ['focus', 'amulet', 'ring', 'helm'] },
  cdr:       { label: '-{v}% Spell Cooldown', pre: 'Quickened', suf: 'of Haste', min: 4, max: 8, grow: 0.15, cap: 30, slots: ['focus', 'helm', 'amulet'] },
  str:       { label: '+{v} Strength', pre: 'Mighty', suf: 'of Strength', min: 1, max: 3, grow: 0.3, slots: ['weapon', 'armor', 'ring', 'amulet', 'helm', 'boots'] },
  int:       { label: '+{v} Intellect', pre: 'Wise', suf: 'of the Sage', min: 1, max: 3, grow: 0.3, slots: ['focus', 'helm', 'ring', 'amulet'] },
  vit:       { label: '+{v} Vitality', pre: 'Hale', suf: 'of Vigor', min: 1, max: 3, grow: 0.3, slots: ['armor', 'helm', 'boots', 'amulet', 'ring'] },
  dex:       { label: '+{v} Dexterity', pre: 'Deft', suf: 'of the Fox', min: 1, max: 3, grow: 0.3, slots: ['weapon', 'boots', 'ring', 'amulet'] },
  fireDmg:   { label: '+{v} Fire Damage to Attacks', pre: 'Burning', suf: 'of Embers', min: 1, max: 3, grow: 0.45, slots: ['weapon', 'ring'] },
  thorns:    { label: 'Reflect {v} Damage to Attackers', pre: 'Barbed', suf: 'of Thorns', min: 2, max: 5, grow: 0.6, slots: ['armor', 'helm'] },
  goldFind:  { label: '+{v}% Gold Found', pre: 'Gilded', suf: 'of Greed', min: 8, max: 20, grow: 0.6, slots: ['ring', 'amulet', 'helm', 'boots'] },
  magicFind: { label: '+{v}% Magic Find', pre: 'Lucky', suf: 'of Fortune', min: 5, max: 12, grow: 0.4, slots: ['ring', 'amulet', 'helm', 'boots'] },
  light:     { label: '+{v}% Lantern Radius', pre: 'Radiant', suf: 'of the Lantern', min: 6, max: 14, grow: 0.3, cap: 50, slots: ['helm', 'amulet', 'focus'] },
  xpBonus:   { label: '+{v}% Experience', pre: 'Learned', suf: 'of Insight', min: 3, max: 7, grow: 0.15, slots: ['helm', 'amulet', 'ring'] },
};

export const LEGENDARY_POWERS = {
  splitBolt:   { slots: ['focus'], names: ['Trinity Lens', 'The Threefold Eye'], text: 'Your spells split into three.' },
  emberTrail:  { slots: ['boots'], names: ['Cinderstriders', 'Ashwalkers'], text: 'Dashing leaves a trail of fire.' },
  corpseBlast: { slots: ['weapon', 'ring'], names: ['Pyre of the Fallen', 'Gravebloom'], text: 'Slain enemies explode for 35% of their life.' },
  vampiric:    { slots: ['weapon', 'ring'], names: ['Nightthirst', 'The Red Kiss'], text: '5% of damage dealt heals you.' },
  stormcaller: { slots: ['weapon'], names: ['Skyrender', 'Thunderwake'], text: 'Critical strikes call down lightning.' },
  frostNova:   { slots: ['armor'], names: ['Rimeheart Mail', 'Winter\'s Embrace'], text: 'Being struck releases a frost nova (4s cooldown).' },
  lanternHeart:{ slots: ['amulet', 'helm'], names: ['Heart of the Lantern', 'Wickfire Crown'], text: 'Your lantern light burns nearby enemies.' },
  echoStrike:  { slots: ['weapon'], names: ['Echoing Fang', 'Resonance'], text: 'Every 3rd swing releases a piercing wave.' },
  manaShield:  { slots: ['armor', 'helm'], names: ['Aegis of Thought', 'Mindward'], text: '25% of damage taken is drained from mana.' },
  phoenix:     { slots: ['amulet'], names: ['Phoenix Ember', 'Last Light'], text: 'Once per floor, lethal damage restores 40% life.' },
};

const RARE_WORDS_A = ['Grim', 'Dusk', 'Hollow', 'Ember', 'Gloom', 'Storm', 'Bone', 'Ash', 'Night', 'Wraith', 'Rune', 'Blood', 'Frost', 'Cinder', 'Moon', 'Shade', 'Iron', 'Soul'];
const RARE_WORDS_B = {
  weapon: ['Bite', 'Fang', 'Edge', 'Song', 'Reaver', 'Cleaver', 'Sting', 'Thorn', 'Wail'],
  focus: ['Gaze', 'Heart', 'Spark', 'Eye', 'Whisper', 'Omen', 'Star'],
  helm: ['Crown', 'Visage', 'Brow', 'Cowl', 'Mask', 'Veil'],
  armor: ['Shell', 'Mantle', 'Bastion', 'Hide', 'Carapace', 'Ward'],
  boots: ['Stride', 'Track', 'Path', 'Step', 'Trail', 'March'],
  ring: ['Coil', 'Loop', 'Promise', 'Knot', 'Circle', 'Oath'],
  amulet: ['Charm', 'Token', 'Tear', 'Relic', 'Sigil', 'Idol'],
};

let uidCounter = 0;
export function makeUid(rng) {
  uidCounter = (uidCounter + 1) % 1e6;
  const r = rng ? Math.floor(rng.next() * 1e9) : Math.floor(Math.random() * 1e9);
  return `i${Date.now().toString(36)}${uidCounter.toString(36)}${r.toString(36)}`;
}

/** Roll a rarity index for an item level, with magic find (in %) and a floor rarity. */
export function rollRarity(rng, ilvl, magicFind = 0, minRarity = 0) {
  const mf = 1 + magicFind / 100;
  const d = ilvl;
  const w = [
    Math.max(12, 60 - d * 1.1),
    (28 + d * 0.5) * mf,
    (9 + d * 0.35) * mf,
    (2.6 + d * 0.14) * mf,
    (0.55 + d * 0.05) * mf,
  ];
  for (let i = 0; i < minRarity; i++) w[i] = 0;
  const entries = w.map((x, i) => [i, x]);
  return rng.weighted(entries);
}

function rollAffixValue(rng, def, ilvl, rarityMult) {
  const lo = def.min + def.grow * (ilvl - 1) * 0.6;
  const hi = def.max + def.grow * (ilvl - 1);
  let v = rng.float(lo, hi) * rarityMult;
  if (def.cap) v = Math.min(def.cap * 0.6, v);
  return def.dec ? Math.round(v * 10) / 10 : Math.max(1, Math.round(v));
}

/**
 * Generate an item.
 * opts: { slot, base, rarity (index or id), minRarity, magicFind }
 */
export function generateItem(rng, ilvl, opts = {}) {
  ilvl = Math.max(1, Math.floor(ilvl));
  const slot = opts.slot || rng.weighted([['weapon', 22], ['focus', 10], ['helm', 13], ['armor', 14], ['boots', 13], ['ring', 14], ['amulet', 12]]);
  let rarityIdx = typeof opts.rarity === 'string' ? RARITY_INDEX[opts.rarity] : opts.rarity;
  if (rarityIdx == null) rarityIdx = rollRarity(rng, ilvl, opts.magicFind || 0, opts.minRarity || 0);
  const rarity = RARITIES[rarityIdx];
  const tier = materialTier(ilvl);
  const scale = 1 + (ilvl - 1) * 0.13;

  const item = { uid: makeUid(rng), slot, rarity: rarity.id, ilvl, tier, affixes: [], v: rng.int(0, 3) };

  let baseName;
  if (slot === 'weapon') {
    const baseId = opts.base && WEAPON_BASES[opts.base] ? opts.base : rng.pick(Object.keys(WEAPON_BASES));
    const b = WEAPON_BASES[baseId];
    item.base = baseId;
    const m = rarity.mult;
    item.dmgMin = Math.max(1, Math.round(b.dmg[0] * scale * m * rng.float(0.9, 1.08)));
    item.dmgMax = Math.max(item.dmgMin + 1, Math.round(b.dmg[1] * scale * m * rng.float(0.94, 1.1)));
    item.speed = Math.round(b.speed * rng.float(0.95, 1.06) * 100) / 100;
    baseName = b.names[Math.min(b.names.length - 1, Math.floor(tier * b.names.length / MATERIALS.length))];
  } else if (slot === 'focus') {
    const baseId = opts.base && FOCUS_BASES[opts.base] ? opts.base : rng.pick(Object.keys(FOCUS_BASES));
    const b = FOCUS_BASES[baseId];
    item.base = baseId;
    item.spell = b.spell;
    item.spellPower = Math.round((6 + ilvl * 2.1) * rarity.mult * rng.float(0.92, 1.08));
    baseName = b.names[Math.min(b.names.length - 1, Math.floor(tier * b.names.length / MATERIALS.length))];
  } else {
    const b = ARMOR_BASES[slot];
    item.base = slot;
    if (b.armor) item.armor = Math.max(1, Math.round(b.armor * scale * rarity.mult * rng.float(0.9, 1.1)));
    if (b.hp) item.hp = Math.round(b.hp * scale * rng.float(0.9, 1.1));
    if (b.moveSpd) item.moveSpd = b.moveSpd;
    if (slot === 'ring' || slot === 'amulet') {
      // jewellery always carries one implicit stat
      const implicit = slot === 'ring' ? rng.pick(['crit', 'dmgFlat', 'mp', 'hp']) : rng.pick(['hp', 'mp', 'spellPct', 'dmgPct']);
      item.implicit = { stat: implicit, value: rollAffixValue(rng, AFFIXES[implicit], ilvl, 0.8) };
    }
    baseName = b.names[Math.min(b.names.length - 1, Math.floor(tier * b.names.length / MATERIALS.length))];
  }
  item.baseName = baseName;

  // affixes
  const [aMin, aMax] = rarity.affixes;
  const nAff = rng.int(aMin, aMax);
  const pool = Object.keys(AFFIXES).filter((k) => AFFIXES[k].slots.includes(slot));
  rng.shuffle(pool);
  for (let i = 0; i < nAff && i < pool.length; i++) {
    item.affixes.push({ stat: pool[i], value: rollAffixValue(rng, AFFIXES[pool[i]], ilvl, rarity.mult) });
  }

  // legendary power
  if (rarity.id === 'legendary') {
    const powers = Object.keys(LEGENDARY_POWERS).filter((k) => LEGENDARY_POWERS[k].slots.includes(slot));
    if (powers.length) {
      item.power = rng.pick(powers);
      item.name = rng.pick(LEGENDARY_POWERS[item.power].names);
    }
  }

  // naming
  const material = MATERIALS[tier];
  if (!item.name) {
    if (rarity.id === 'common') {
      item.name = `${material} ${baseName}`;
    } else if (rarity.id === 'magic') {
      const a = item.affixes[0] && AFFIXES[item.affixes[0].stat];
      const b = item.affixes[1] && AFFIXES[item.affixes[1].stat];
      item.name = `${a ? a.pre + ' ' : ''}${baseName}${b ? ' ' + b.suf : ''}`;
    } else {
      item.name = `${rng.pick(RARE_WORDS_A)} ${rng.pick(RARE_WORDS_B[slot])}`;
    }
  }
  item.value = itemValue(item);
  return item;
}

export function itemValue(item) {
  const r = RARITY_INDEX[item.rarity] || 0;
  const base = 12 + item.ilvl * 6;
  const rarityMult = [1, 2.4, 5, 9, 16][r];
  return Math.max(4, Math.round(base * rarityMult * (1 + item.affixes.length * 0.12)));
}

export const buyPrice = (item) => Math.round(item.value * 1.0);
export const sellPrice = (item) => Math.max(1, Math.round(item.value * 0.3));

export function potionPrice(level) {
  return 20 + level * 4;
}

/** Aggregated numeric stat contributions of one item. */
export function itemStats(item) {
  const s = {};
  const add = (k, v) => { s[k] = (s[k] || 0) + v; };
  if (item.armor) add('armor', item.armor);
  if (item.hp) add('hp', item.hp);
  if (item.moveSpd) add('moveSpd', item.moveSpd);
  if (item.spellPower) add('spellPower', item.spellPower);
  if (item.implicit) add(item.implicit.stat, item.implicit.value);
  for (const a of item.affixes) add(a.stat, a.value);
  if (item.slot === 'weapon' && WEAPON_BASES[item.base] && WEAPON_BASES[item.base].crit) add('crit', WEAPON_BASES[item.base].crit * 100);
  return s;
}

export function affixText(stat, value) {
  const def = AFFIXES[stat];
  if (!def) return `${stat}: ${value}`;
  return def.label.replace('{v}', String(value));
}

/** Lines describing an item (used by tooltips). */
export function describeItem(item) {
  const lines = [];
  if (item.slot === 'weapon') {
    const b = WEAPON_BASES[item.base];
    lines.push({ k: 'base', t: `${item.dmgMin}–${item.dmgMax} Damage` });
    lines.push({ k: 'base', t: `${item.speed.toFixed(2)} Attacks per Second` });
    if (b) lines.push({ k: 'note', t: b.desc });
  }
  if (item.slot === 'focus') {
    const sp = SPELLS[item.spell];
    lines.push({ k: 'base', t: `Grants: ${sp.name}` });
    lines.push({ k: 'base', t: `+${item.spellPower} Spell Power` });
    lines.push({ k: 'note', t: FOCUS_BASES[item.base].desc });
  }
  if (item.armor) lines.push({ k: 'base', t: `${item.armor} Armor` });
  if (item.hp) lines.push({ k: 'base', t: `+${item.hp} Maximum Life` });
  if (item.moveSpd) lines.push({ k: 'base', t: `+${item.moveSpd}% Movement Speed` });
  if (item.implicit) lines.push({ k: 'implicit', t: affixText(item.implicit.stat, item.implicit.value) });
  for (const a of item.affixes) lines.push({ k: 'affix', t: affixText(a.stat, a.value) });
  if (item.power) lines.push({ k: 'power', t: LEGENDARY_POWERS[item.power].text });
  return lines;
}

/** Key numbers for comparing two items of the same slot. Returns [{label, a, b, diff}] */
export function compareItems(candidate, equipped) {
  const rows = [];
  const push = (label, a, b, fmt = (x) => x) => {
    if (!a && !b) return;
    rows.push({ label, a: a || 0, b: b || 0, diff: (a || 0) - (b || 0), fmt });
  };
  if (candidate.slot === 'weapon') {
    const dpsA = ((candidate.dmgMin + candidate.dmgMax) / 2) * candidate.speed;
    const dpsB = equipped ? ((equipped.dmgMin + equipped.dmgMax) / 2) * equipped.speed : 0;
    push('Weapon DPS', Math.round(dpsA * 10) / 10, Math.round(dpsB * 10) / 10);
  }
  const sa = itemStats(candidate);
  const sb = equipped ? itemStats(equipped) : {};
  const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
  const labels = { armor: 'Armor', hp: 'Life', moveSpd: 'Move %', spellPower: 'Spell Power' };
  for (const k of keys) {
    const label = labels[k] || (AFFIXES[k] ? AFFIXES[k].label.replace(/[+-]?\{v\}%? ?/, '').replace(/^\s+/, '') : k);
    push(label, Math.round((sa[k] || 0) * 10) / 10, Math.round((sb[k] || 0) * 10) / 10);
  }
  return rows;
}

// ---------------------------------------------------------------- validation (used by save loading)

const VALID_SLOTS = new Set(SLOTS);

/** Returns a sanitised copy of an item, or null if it cannot be salvaged. */
export function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!VALID_SLOTS.has(raw.slot)) return null;
  if (RARITY_INDEX[raw.rarity] == null) return null;
  const num = (v, lo, hi, def) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  const item = {
    uid: typeof raw.uid === 'string' && raw.uid ? raw.uid.slice(0, 40) : makeUid(),
    slot: raw.slot,
    rarity: raw.rarity,
    ilvl: Math.floor(num(raw.ilvl, 1, 999, 1)),
    tier: Math.floor(num(raw.tier, 0, MATERIALS.length - 1, 0)),
    v: Math.floor(num(raw.v, 0, 3, 0)),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : 'Unknown Relic',
    baseName: typeof raw.baseName === 'string' ? raw.baseName.slice(0, 40) : '',
    base: typeof raw.base === 'string' ? raw.base : raw.slot,
    affixes: [],
  };
  if (item.slot === 'weapon') {
    if (!WEAPON_BASES[item.base]) item.base = 'sword';
    item.dmgMin = Math.floor(num(raw.dmgMin, 1, 1e5, 2));
    item.dmgMax = Math.floor(num(raw.dmgMax, item.dmgMin + 1, 1e5, item.dmgMin + 2));
    item.speed = num(raw.speed, 0.5, 5, 1.5);
  }
  if (item.slot === 'focus') {
    if (!FOCUS_BASES[item.base]) item.base = 'ember';
    item.spell = FOCUS_BASES[item.base].spell;
    item.spellPower = Math.floor(num(raw.spellPower, 0, 1e5, 5));
  }
  for (const k of ['armor', 'hp', 'moveSpd']) if (Number.isFinite(raw[k])) item[k] = num(raw[k], 0, 1e5, 0);
  if (raw.implicit && AFFIXES[raw.implicit.stat] && Number.isFinite(raw.implicit.value)) {
    item.implicit = { stat: raw.implicit.stat, value: num(raw.implicit.value, 0, 1e5, 0) };
  }
  if (Array.isArray(raw.affixes)) {
    for (const a of raw.affixes.slice(0, 8)) {
      if (a && AFFIXES[a.stat] && Number.isFinite(a.value)) item.affixes.push({ stat: a.stat, value: num(a.value, 0, 1e5, 0) });
    }
  }
  if (raw.power && LEGENDARY_POWERS[raw.power]) item.power = raw.power;
  item.value = Number.isFinite(raw.value) ? num(raw.value, 1, 1e7, 1) : itemValue(item);
  return item;
}

/** Starting equipment for a fresh character. */
export function starterKit(seed) {
  const rng = new RNG(seed ^ 0x5eed);
  const weapon = generateItem(rng, 1, { slot: 'weapon', base: 'sword', rarity: 'common' });
  weapon.name = 'Worn Longsword';
  const armor = generateItem(rng, 1, { slot: 'armor', rarity: 'common' });
  armor.name = 'Patched Jerkin';
  const focus = generateItem(rng, 1, { slot: 'focus', base: 'ember', rarity: 'common' });
  focus.name = 'Cracked Ember Orb';
  return { weapon, armor, focus };
}
