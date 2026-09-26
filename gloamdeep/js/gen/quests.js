// Repeatable, procedurally parameterised quests. Pure module.
// Quest offers are deterministic for (world seed, completed count, level) so reopening the
// dialogue never rerolls them.

import { RNG, mixSeed } from '../core/rng.js';
import { xpForLevel, BOSS_INTERVAL } from '../config.js';
import { unlockedArchetypes, BOSSES } from '../data/enemies.js';
import { themeForDepth } from '../data/themes.js';

export const FAMILY = {
  grunt: { name: 'Shamblers', kin: 'Hollows, Sporelings and Thralls' },
  archer: { name: 'Marksmen', kin: 'Bone Archers, Spitters and Slingers' },
  skitter: { name: 'Skitterers', kin: 'Bats, Imps and Stalkers' },
  bloater: { name: 'Bloaters', kin: 'Bloats, Puffcaps and Geodes' },
  brute: { name: 'Hulks', kin: 'Wardens, Mossbacks and Golems' },
  caster: { name: 'Hexers', kin: 'Acolytes, Wisps and Seers' },
};

const RELICS = [
  { name: 'Gloam Shards', one: 'Gloam Shard', color: '#9a8cff' },
  { name: 'Lantern Wicks', one: 'Lantern Wick', color: '#ffc36a' },
  { name: 'Sigil Fragments', one: 'Sigil Fragment', color: '#7affd0' },
  { name: 'Hollow Hearts', one: 'Hollow Heart', color: '#ff6a7a' },
  { name: 'Ember Seeds', one: 'Ember Seed', color: '#ff9a3c' },
];

const TITLES = {
  kill: ['Cull the {f}', 'A Reckoning for the {f}', 'Thin the {f}', 'The {f} Must Fall'],
  collect: ['Recover the {r}', 'Whispers of {r}', 'The Lost {r}', 'Gather the {r}'],
  depth: ['Into the Gloam', 'Deeper Still', 'The Long Descent', 'Beneath the Beneath'],
  elite: ['Champions of the Deep', 'Crowned in Darkness', 'Hunt the Exalted'],
  boss: ['Break the Guardian', 'The Warden Below', 'Silence the Guardian'],
};

/** Next guardian depth strictly deeper than `depth`. */
export const nextBossDepth = (depth) => (Math.floor(depth / BOSS_INTERVAL) + 1) * BOSS_INTERVAL;

function rewardFor(rng, level, difficulty) {
  const gold = Math.round((45 + level * 22) * difficulty * rng.float(0.9, 1.15));
  const xp = Math.round(xpForLevel(level) * 0.32 * difficulty);
  const roll = rng.next();
  let item = null;
  if (roll < 0.25 + difficulty * 0.3) {
    item = difficulty >= 1.6 ? (rng.chance(0.3) ? 'epic' : 'rare') : difficulty >= 1.2 ? 'rare' : 'magic';
  }
  return { gold, xp, item, potions: rng.chance(0.4) ? 2 : 0 };
}

export function makeQuest(rng, type, level, maxDepth) {
  const reachDepth = Math.max(1, maxDepth);
  const q = { id: `q${Math.floor(rng.next() * 1e9).toString(36)}`, type, progress: 0, level, done: false };
  if (type === 'kill') {
    const pool = unlockedArchetypes(Math.max(1, reachDepth));
    q.target = rng.pick(pool);
    q.required = Math.min(40, 6 + Math.floor(level * 0.9) + rng.int(0, 4));
    const f = FAMILY[q.target];
    q.title = rng.pick(TITLES.kill).replace('{f}', f.name);
    q.desc = `Slay ${q.required} ${f.name} in the dungeon. ${f.kin} all count.`;
    q.difficulty = 1 + q.required / 30 + (q.target === 'brute' || q.target === 'caster' ? 0.25 : 0);
  } else if (type === 'collect') {
    const relic = rng.pick(RELICS);
    q.target = relic.one;
    q.relicColor = relic.color;
    q.required = Math.min(14, 4 + Math.floor(level / 3) + rng.int(0, 2));
    q.title = rng.pick(TITLES.collect).replace('{r}', relic.name);
    q.desc = `Monsters in the dungeon carry ${relic.name}. Recover ${q.required} of them.`;
    q.difficulty = 1.05 + q.required / 18;
  } else if (type === 'depth') {
    q.target = Math.max(2, reachDepth + rng.int(1, 3));
    q.required = 1;
    q.title = rng.pick(TITLES.depth);
    q.desc = `Descend to floor ${q.target} of the Gloamdeep and live to tell of it.`;
    q.difficulty = 1 + Math.max(0, q.target - reachDepth) * 0.2;
  } else if (type === 'elite') {
    q.required = Math.min(8, 2 + Math.floor(level / 5) + rng.int(0, 1));
    q.title = rng.pick(TITLES.elite);
    q.desc = `Slay ${q.required} champions — elite monsters wreathed in coloured auras.`;
    q.difficulty = 1.25 + q.required * 0.08;
  } else if (type === 'boss') {
    q.target = nextBossDepth(Math.max(0, maxDepth));
    const theme = themeForDepth(q.target);
    const boss = BOSSES[theme.boss];
    q.required = 1;
    q.bossName = boss.name;
    q.title = rng.pick(TITLES.boss);
    q.desc = `${boss.name} guards floor ${q.target}. Defeat it.`;
    q.difficulty = 1.8;
  }
  q.reward = rewardFor(rng, level, q.difficulty);
  return q;
}

/** Three quest offers, deterministic for the arguments. */
export function questOffers(worldSeed, completed, level, maxDepth) {
  const rng = new RNG(mixSeed(worldSeed, completed, level, 0x9e57));
  const types = ['kill', 'collect', 'depth', 'elite'];
  const next = nextBossDepth(Math.max(0, maxDepth));
  if (next - maxDepth <= 3) types.push('boss', 'boss');
  rng.shuffle(types);
  const chosen = [];
  for (const t of types) if (!chosen.includes(t) && chosen.length < 3) chosen.push(t);
  return chosen.map((t) => makeQuest(rng, t, level, maxDepth));
}

/**
 * Apply a gameplay event to a quest (mutates and returns true when progress changed).
 * Events: {type:'kill', arch, elite, boss, depth} | {type:'collect'} | {type:'depth', depth}
 */
export function trackQuest(q, ev) {
  if (!q || q.done) return false;
  const before = q.progress;
  switch (q.type) {
    case 'kill':
      if (ev.type === 'kill' && ev.arch === q.target) q.progress++;
      break;
    case 'collect':
      if (ev.type === 'collect') q.progress++;
      break;
    case 'depth':
      if (ev.type === 'depth' && ev.depth >= q.target) q.progress = 1;
      break;
    case 'elite':
      if (ev.type === 'kill' && ev.elite) q.progress++;
      break;
    case 'boss':
      if (ev.type === 'kill' && ev.boss && ev.depth >= q.target) q.progress = 1;
      break;
    default:
      break;
  }
  q.progress = Math.min(q.progress, q.required);
  if (q.progress >= q.required) q.done = true;
  return q.progress !== before;
}

export function questProgressText(q) {
  if (!q) return '';
  if (q.type === 'depth') return q.done ? 'Floor reached' : `Reach floor ${q.target}`;
  if (q.type === 'boss') return q.done ? `${q.bossName} slain` : `Slay ${q.bossName} (floor ${q.target})`;
  return `${q.progress} / ${q.required}`;
}

export function sanitizeQuest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!['kill', 'collect', 'depth', 'elite', 'boss'].includes(raw.type)) return null;
  const n = (v, d) => (Number.isFinite(v) ? v : d);
  const q = {
    id: String(raw.id || 'q0').slice(0, 24),
    type: raw.type,
    title: String(raw.title || 'A Task').slice(0, 60),
    desc: String(raw.desc || '').slice(0, 200),
    target: raw.target,
    required: Math.max(1, Math.floor(n(raw.required, 1))),
    progress: Math.max(0, Math.floor(n(raw.progress, 0))),
    level: Math.max(1, Math.floor(n(raw.level, 1))),
    difficulty: n(raw.difficulty, 1),
    done: !!raw.done,
    reward: {
      gold: Math.max(0, Math.floor(n(raw.reward && raw.reward.gold, 50))),
      xp: Math.max(0, Math.floor(n(raw.reward && raw.reward.xp, 30))),
      item: raw.reward && ['magic', 'rare', 'epic'].includes(raw.reward.item) ? raw.reward.item : null,
      potions: Math.max(0, Math.floor(n(raw.reward && raw.reward.potions, 0))),
    },
  };
  if (raw.bossName) q.bossName = String(raw.bossName).slice(0, 40);
  if (raw.relicColor) q.relicColor = String(raw.relicColor).slice(0, 9);
  q.progress = Math.min(q.progress, q.required);
  if (q.progress >= q.required) q.done = true;
  return q;
}

