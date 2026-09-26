// Dungeon biomes. Every five floors the biome changes and ends with a guardian.
// Pure data module (colours are plain hex strings).

export const THEMES = [
  {
    id: 'catacombs',
    name: 'Mossbound Catacombs',
    ambient: [34, 30, 44],
    fog: [30, 26, 44],
    floor: ['#3b3843', '#37343f', '#403c48', '#34313b'],
    floorLine: '#2a2730',
    floorHi: '#4a4653',
    accent: '#5f7a35',       // moss
    accent2: '#7d9a45',
    wallFace: '#56505e',
    wallFaceDark: '#3a3541',
    wallMortar: '#2b2731',
    wallCap: '#221f28',
    wallCapHi: '#6a6373',
    liquid: 'water',
    hazardLiquid: { name: 'Brackish Rot', color: '#3f6b2a', glow: '#8fd14f', damage: 5 },
    trap: 'spikes',
    torch: '#ffae55',
    lightProps: ['torch', 'candles', 'brazier'],
    decor: ['bones', 'skull', 'rubble', 'cobweb', 'moss', 'crack', 'bones', 'coffin', 'urnpile', 'grave'],
    breakables: ['urn', 'crate', 'urn', 'barrel'],
    enemySkin: 'crypt',
    boss: 'ossuary',
  },
  {
    id: 'fungal',
    name: 'Glowcap Hollows',
    ambient: [22, 34, 40],
    fog: [16, 40, 44],
    floor: ['#2d3a3a', '#2a3535', '#324040', '#283232'],
    floorLine: '#1f2a2a',
    floorHi: '#3d4d4b',
    accent: '#2f8f7f',
    accent2: '#5fe0c0',
    wallFace: '#3f4e4a',
    wallFaceDark: '#2b3634',
    wallMortar: '#1f2826',
    wallCap: '#18201f',
    wallCapHi: '#557068',
    liquid: 'water',
    hazardLiquid: { name: 'Caustic Ooze', color: '#5f9a1f', glow: '#c6ff3a', damage: 6 },
    trap: 'spores',
    torch: '#62ffd8',
    lightProps: ['glowcap', 'glowcap', 'torch'],
    decor: ['mushrooms', 'moss', 'rubble', 'roots', 'mushrooms', 'bones', 'crack', 'sporepod'],
    breakables: ['sporepod', 'crate', 'urn'],
    enemySkin: 'fungal',
    boss: 'mycelia',
  },
  {
    id: 'forge',
    name: 'Cinder Forge',
    ambient: [42, 24, 22],
    fog: [54, 20, 12],
    floor: ['#3d302b', '#382b26', '#43352f', '#342824'],
    floorLine: '#261c19',
    floorHi: '#54423a',
    accent: '#c2461c',
    accent2: '#ffb02e',
    wallFace: '#5a443b',
    wallFaceDark: '#3b2c26',
    wallMortar: '#261b17',
    wallCap: '#1e1512',
    wallCapHi: '#76584a',
    liquid: 'lava',
    hazardLiquid: { name: 'Molten Slag', color: '#d4480f', glow: '#ffb347', damage: 10 },
    trap: 'firevent',
    torch: '#ff8a2e',
    lightProps: ['brazier', 'torch', 'brazier'],
    decor: ['anvil', 'chains', 'rubble', 'ashpile', 'crack', 'grate', 'bones', 'ingots'],
    breakables: ['barrel', 'crate', 'barrel'],
    enemySkin: 'ember',
    boss: 'colossus',
  },
  {
    id: 'crystal',
    name: 'Shattered Geode',
    ambient: [28, 22, 44],
    fog: [34, 18, 60],
    floor: ['#312c42', '#2c283c', '#363048', '#29253a'],
    floorLine: '#201c2e',
    floorHi: '#463f5c',
    accent: '#7b4fd6',
    accent2: '#c59bff',
    wallFace: '#4c4466',
    wallFaceDark: '#342e48',
    wallMortar: '#221e32',
    wallCap: '#1a1726',
    wallCapHi: '#6f64a0',
    liquid: 'void',
    hazardLiquid: { name: 'Void Ichor', color: '#3a1b6b', glow: '#b36bff', damage: 9 },
    trap: 'spikes',
    torch: '#b38cff',
    lightProps: ['crystal', 'crystal', 'torch'],
    decor: ['crystals', 'rubble', 'shards', 'crack', 'bones', 'crystals', 'geode'],
    breakables: ['geode', 'urn', 'crate'],
    enemySkin: 'void',
    boss: 'seer',
  },
];

export function themeIndexForDepth(depth) {
  return Math.floor((Math.max(1, depth) - 1) / 5) % THEMES.length;
}

export function themeForDepth(depth) {
  return THEMES[themeIndexForDepth(depth)];
}

/** Every full cycle through all biomes adds an "echo" tier with a harsher name. */
export function floorTitle(depth) {
  const theme = themeForDepth(depth);
  const cycle = Math.floor((depth - 1) / (5 * THEMES.length));
  const echo = cycle > 0 ? ` ${['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][Math.min(cycle, 7)]}` : '';
  return `${theme.name}${echo}`;
}
