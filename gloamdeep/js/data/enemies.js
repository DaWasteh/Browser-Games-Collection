// Enemy archetypes (behaviour + base stats), biome skins (names + palettes),
// elite modifiers and guardian definitions. Pure data module.

export const ARCHETYPES = {
  grunt: {
    ai: 'melee', hp: 34, dmg: 9, speed: 44, radius: 6, xp: 14, gold: [2, 6],
    attackRange: 20, windup: 0.5, recover: 0.55, cooldown: 1.1, arc: 1.7, reach: 24,
    aggro: 150, minDepth: 1, weight: 10, height: 20,
  },
  archer: {
    ai: 'ranged', hp: 22, dmg: 8, speed: 40, radius: 5, xp: 16, gold: [2, 7],
    preferMin: 70, preferMax: 120, windup: 0.7, recover: 0.4, cooldown: 1.9, projSpeed: 150,
    aggro: 190, minDepth: 1, weight: 7, height: 20,
  },
  skitter: {
    ai: 'pounce', hp: 13, dmg: 6, speed: 88, radius: 4, xp: 9, gold: [1, 4],
    attackRange: 58, windup: 0.32, recover: 0.5, cooldown: 1.2, leapSpeed: 210, leapTime: 0.28,
    aggro: 170, minDepth: 1, weight: 8, height: 12, pack: [3, 5],
  },
  bloater: {
    ai: 'exploder', hp: 26, dmg: 22, speed: 36, radius: 7, xp: 15, gold: [3, 8],
    attackRange: 24, fuse: 0.85, blast: 38,
    aggro: 150, minDepth: 2, weight: 4, height: 20,
  },
  brute: {
    ai: 'brute', hp: 90, dmg: 18, speed: 30, radius: 9, xp: 34, gold: [6, 14],
    attackRange: 30, windup: 0.95, recover: 0.8, cooldown: 2.2, slamRadius: 36,
    aggro: 150, minDepth: 3, weight: 4, height: 28, knockResist: 0.7,
  },
  caster: {
    ai: 'caster', hp: 24, dmg: 10, speed: 38, radius: 5, xp: 20, gold: [4, 10],
    preferMin: 85, preferMax: 140, windup: 0.85, recover: 0.5, cooldown: 2.6, projSpeed: 75,
    aggro: 200, minDepth: 4, weight: 4, height: 22, blink: true,
  },
};

/** Skins give each archetype a biome-specific identity. */
export const SKINS = {
  crypt: {
    grunt:   { name: 'Hollow',          body: '#8c8a78', dark: '#4f4c42', accent: '#b8e070', eye: '#d6ff7a' },
    archer:  { name: 'Bone Archer',     body: '#d8d0b8', dark: '#7e7662', accent: '#9a6a3a', eye: '#ff5a3a' },
    skitter: { name: 'Crypt Bat',       body: '#4a3a52', dark: '#2a2030', accent: '#8f6aa6', eye: '#ff3a3a' },
    bloater: { name: 'Corpse Bloat',    body: '#8a9a5a', dark: '#566236', accent: '#c7d66a', eye: '#fff27a' },
    brute:   { name: 'Grave Warden',    body: '#6e6a74', dark: '#403c46', accent: '#a09aa8', eye: '#6affd0' },
    caster:  { name: 'Hex Acolyte',     body: '#5a2f5f', dark: '#341a38', accent: '#c05ad0', eye: '#ff7af0' },
  },
  fungal: {
    grunt:   { name: 'Sporeling',       body: '#6f8c6a', dark: '#3f5540', accent: '#d9c16a', eye: '#fff4a0' },
    archer:  { name: 'Acid Spitter',    body: '#4f7a5a', dark: '#2c4a36', accent: '#b7ff4a', eye: '#e8ff5a' },
    skitter: { name: 'Cave Skitter',    body: '#4a5a66', dark: '#28343c', accent: '#62ffd8', eye: '#62ffd8' },
    bloater: { name: 'Puffcap',         body: '#b06a8a', dark: '#6a3a52', accent: '#ffb0d8', eye: '#ffffff' },
    brute:   { name: 'Mossback',        body: '#56704a', dark: '#33452c', accent: '#8fbf5a', eye: '#ffd24a' },
    caster:  { name: 'Lumen Wisp',      body: '#3a8a8a', dark: '#1f4f52', accent: '#8affff', eye: '#ffffff' },
  },
  ember: {
    grunt:   { name: 'Ashen Thrall',    body: '#6a5a52', dark: '#3a2e2a', accent: '#ff7a2e', eye: '#ffcc4a' },
    archer:  { name: 'Cinder Slinger',  body: '#8a4a34', dark: '#4a241a', accent: '#ffb347', eye: '#fff07a' },
    skitter: { name: 'Magma Imp',       body: '#c2461c', dark: '#6a1f0c', accent: '#ffd24a', eye: '#ffffa0' },
    bloater: { name: 'Slag Bloat',      body: '#7a3a2a', dark: '#431c14', accent: '#ff8a2e', eye: '#ffe07a' },
    brute:   { name: 'Forge Golem',     body: '#5a4a44', dark: '#2e2522', accent: '#ff6a1f', eye: '#ffb02e' },
    caster:  { name: 'Pyre Priest',     body: '#7a2a2a', dark: '#401414', accent: '#ffa03a', eye: '#ffe0a0' },
  },
  void: {
    grunt:   { name: 'Shard Husk',      body: '#6a6488', dark: '#3a3654', accent: '#c59bff', eye: '#e8d8ff' },
    archer:  { name: 'Prism Caster',    body: '#4f7ab0', dark: '#2a4266', accent: '#8ae0ff', eye: '#ffffff' },
    skitter: { name: 'Glass Stalker',   body: '#8a7ad0', dark: '#4a3f7a', accent: '#e0d0ff', eye: '#ff6af0' },
    bloater: { name: 'Unstable Geode',  body: '#6a4a9a', dark: '#3a2858', accent: '#ff7aff', eye: '#ffffff' },
    brute:   { name: 'Geode Colossus',  body: '#50487a', dark: '#2c2648', accent: '#9a7aff', eye: '#7affff' },
    caster:  { name: 'Void Seer',       body: '#2a1f4a', dark: '#140e28', accent: '#b36bff', eye: '#ff4af0' },
  },
};

export const ELITE_MODS = [
  { id: 'swift',    name: 'Swift',    color: '#7affd8', desc: 'Moves and attacks faster' },
  { id: 'brutal',   name: 'Brutal',   color: '#ff5a4a', desc: 'Deals heavy damage' },
  { id: 'armored',  name: 'Armored',  color: '#c0c8d8', desc: 'Takes reduced damage' },
  { id: 'molten',   name: 'Molten',   color: '#ff9a2e', desc: 'Leaves burning ground' },
  { id: 'vampiric', name: 'Vampiric', color: '#ff3a6a', desc: 'Heals when it strikes' },
  { id: 'arcane',   name: 'Arcane',   color: '#b36bff', desc: 'Periodically fires arcane orbs' },
  { id: 'frenzied', name: 'Frenzied', color: '#ffd24a', desc: 'Enrages at low health' },
];

export const BOSSES = {
  ossuary: {
    name: 'The Ossuary Knight', title: 'Warden of the Bone Stair',
    hp: 900, dmg: 20, speed: 46, radius: 13, xp: 420, gold: [120, 180],
    body: '#cfc6ae', dark: '#6a6252', accent: '#7affb0', eye: '#7affb0',
    patterns: ['charge', 'sweep', 'boneRing', 'summon'],
  },
  mycelia: {
    name: 'Mother Mycelia', title: 'Heart of the Glowcap',
    hp: 1050, dmg: 18, speed: 26, radius: 15, xp: 520, gold: [150, 220],
    body: '#a0588a', dark: '#5a2a4a', accent: '#62ffd8', eye: '#fffcaa',
    patterns: ['sporeSpiral', 'sporeRing', 'summon', 'slam'],
  },
  colossus: {
    name: 'The Cinder Colossus', title: 'Engine of the Deep Forge',
    hp: 1300, dmg: 26, speed: 30, radius: 16, xp: 640, gold: [180, 260],
    body: '#5a463c', dark: '#2a1e1a', accent: '#ff7a1f', eye: '#ffd24a',
    patterns: ['slam', 'meteors', 'fireWave', 'charge'],
  },
  seer: {
    name: 'The Hollow Seer', title: 'Eye Behind the Geode',
    hp: 1150, dmg: 22, speed: 40, radius: 13, xp: 700, gold: [200, 300],
    body: '#2a1f4a', dark: '#120c24', accent: '#b36bff', eye: '#ff4af0',
    patterns: ['voidSpiral', 'blink', 'boneRing', 'meteors'],
  },
};

/** Health / damage multipliers for an enemy on a given depth. */
export function depthScaling(depth) {
  const d = Math.max(0, depth - 1);
  return {
    hp: 1 + d * 0.24 + d * d * 0.006,
    dmg: 1 + d * 0.11 + d * d * 0.0015,
    xp: 1 + d * 0.16,
    gold: 1 + d * 0.14,
    speed: 1 + Math.min(0.25, d * 0.008),
  };
}

export function eliteChance(depth) {
  return Math.min(0.32, 0.05 + depth * 0.012);
}

export function unlockedArchetypes(depth) {
  return Object.entries(ARCHETYPES).filter(([, a]) => depth >= a.minDepth).map(([id]) => id);
}
