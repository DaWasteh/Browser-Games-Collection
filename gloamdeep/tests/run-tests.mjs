// Dependency-free unit tests for the pure game modules.
// Run with:  node tests/run-tests.mjs

import { RNG, floorSeed, hashString, seedToText, textToSeed, mixSeed } from '../js/core/rng.js';
import { generateFloor, validateFloor, layoutHash, bfs, isBossDepth } from '../js/gen/dungeon.js';
import { generateItem, sanitizeItem, SLOTS, AFFIXES, compareItems, describeItem, WEAPON_BASES, FOCUS_BASES, starterKit, rollRarity } from '../js/gen/items.js';
import { questOffers, trackQuest, sanitizeQuest, makeQuest } from '../js/gen/quests.js';
import { defaultProfile, serialize, deserialize, SaveStore, migrate } from '../js/systems/save.js';
import { computeStats, armorReduction } from '../js/systems/stats.js';
import { buildTown } from '../js/gen/town.js';
import { T, isWalkableId } from '../js/world/tiles.js';
import { TileMap } from '../js/world/map.js';
import { Lighting } from '../js/fx/lighting.js';
import { RARITIES, INVENTORY_SLOTS, STORAGE_SLOTS, TILE, xpForLevel } from '../js/config.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push([name, e]);
    console.log(`  ✗ ${name}\n      ${e && e.message}`);
  }
}

function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'values differ'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

/** JSON with sorted keys so field order does not matter. */
function canon(v) {
  return JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map((key) => [key, val[key]])) : val));
}

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

console.log('\nRNG');
test('same seed produces identical sequences', () => {
  const a = new RNG(1234), b = new RNG(1234);
  for (let i = 0; i < 1000; i++) eq(a.next(), b.next());
});
test('different seeds diverge', () => {
  const a = new RNG(1), b = new RNG(2);
  let same = 0;
  for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
  assert(same < 3, `too many equal values: ${same}`);
});
test('int() stays inside inclusive bounds and covers them', () => {
  const r = new RNG(99);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) { const v = r.int(3, 7); assert(v >= 3 && v <= 7); seen.add(v); }
  eq(seen.size, 5, 'all values seen');
});
test('floor seeds depend on seed and depth', () => {
  assert(floorSeed(1, 1) !== floorSeed(1, 2));
  assert(floorSeed(1, 1) !== floorSeed(2, 1));
  eq(floorSeed(77, 5), floorSeed(77, 5));
});
test('seed text round-trips', () => {
  for (const s of [0, 1, 123456, 0xffffffff, hashString('gloam')]) eq(textToSeed(seedToText(s)), s >>> 0);
  eq(textToSeed('Wickhollow'), textToSeed('Wickhollow'));
});

console.log('\nDungeon generation');
test('same seed + depth reproduces the same layout', () => {
  for (const depth of [1, 4, 5, 12]) {
    const a = generateFloor(424242, depth), b = generateFloor(424242, depth);
    eq(layoutHash(a), layoutHash(b), `depth ${depth}`);
    eq(a.W, b.W); eq(a.H, b.H);
    eq(JSON.stringify(a.props), JSON.stringify(b.props), 'props identical');
  }
});
test('different seeds produce different layouts', () => {
  const hashes = new Set();
  for (let s = 1; s <= 30; s++) hashes.add(layoutHash(generateFloor(s * 7919, 3)));
  assert(hashes.size >= 29, `only ${hashes.size} unique layouts out of 30`);
});
test('different depths produce different layouts', () => {
  assert(layoutHash(generateFloor(5, 1)) !== layoutHash(generateFloor(5, 2)));
});
test('400 floors (40 seeds x 10 consecutive depths) are valid and reachable', () => {
  let n = 0;
  for (let s = 0; s < 40; s++) {
    const seed = mixSeed(s, 0xabc);
    for (let depth = 1; depth <= 10; depth++) {
      const f = generateFloor(seed, depth);
      const problems = validateFloor(f);
      assert(problems.length === 0, `seed ${seed} depth ${depth}: ${problems.join(', ')}`);
      n++;
    }
  }
  eq(n, 400);
});
test('deep floors (depth 11..60) stay valid', () => {
  for (let depth = 11; depth <= 60; depth++) {
    const f = generateFloor(987654321, depth);
    const problems = validateFloor(f);
    assert(problems.length === 0, `depth ${depth}: ${problems.join(', ')}`);
  }
});
test('exit is reachable and away from the start', () => {
  for (let s = 0; s < 25; s++) {
    const f = generateFloor(s + 100, 1 + (s % 9));
    const d = bfs(f.tiles, f.W, f.H, f.start.x, f.start.y);
    const de = d[f.exit.y * f.W + f.exit.x];
    assert(de > 10, `exit too close (${de}) for seed ${s}`);
  }
});
test('required rooms, props and enemies are inside bounds', () => {
  for (let s = 0; s < 20; s++) {
    const f = generateFloor(s * 31 + 7, 1 + s);
    for (const r of f.rooms) assert(r.x >= 1 && r.y >= 1 && r.x + r.w <= f.W - 1 && r.y + r.h <= f.H - 1, 'room bounds');
    for (const p of [...f.props, ...f.enemies, ...f.hazards]) {
      assert(p.x >= 0 && p.y >= 0 && p.x < f.W * TILE && p.y < f.H * TILE, `${p.type || p.arch} out of bounds`);
    }
  }
});
test('floors contain entrance, exit, enemies, loot containers, props and hazards', () => {
  const f = generateFloor(2024, 3);
  assert(f.props.some((p) => p.type === 'stairsUp'), 'entrance');
  assert(f.props.some((p) => p.type === 'stairsDown'), 'exit');
  assert(f.enemies.length >= 10, `enemies ${f.enemies.length}`);
  assert(f.props.some((p) => p.type === 'chest'), 'chest');
  assert(f.hazards.length > 0, 'hazards');
  assert(f.lights.length > 3, 'lights');
  assert(f.decor.length > 10, 'decor');
});
test('boss floors every 5th depth with a guardian and a sealed exit', () => {
  for (const depth of [5, 10, 15, 20, 25]) {
    assert(isBossDepth(depth));
    const f = generateFloor(31337, depth);
    assert(f.bossSpawn, `guardian on ${depth}`);
    assert(f.props.find((p) => p.type === 'stairsDown').sealed, 'sealed exit');
  }
  assert(!generateFloor(31337, 4).bossSpawn, 'no guardian on 4');
});
test('difficulty scales: deeper floors have more enemies and elites appear', () => {
  let shallow = 0, deep = 0, elites = 0;
  for (let s = 0; s < 10; s++) {
    shallow += generateFloor(s, 1).enemies.length;
    const d = generateFloor(s, 18);
    deep += d.enemies.length;
    elites += d.enemies.filter((e) => e.elite).length;
  }
  assert(deep > shallow * 1.5, `deep ${deep} vs shallow ${shallow}`);
  assert(elites > 0, 'elites on deep floors');
});

console.log('\nTown');
test('town services are reachable from the spawn', () => {
  const t = buildTown();
  const tx = (p) => Math.floor(p.x / TILE), ty = (p) => Math.floor(p.y / TILE);
  const d = bfs(t.tiles, t.W, t.H, tx(t.spawn), ty(t.spawn));
  const reach = (x, y) => {
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (d[(y + oy) * t.W + x + ox] >= 0) return true;
    return false;
  };
  for (const n of t.npcs.filter((n) => n.role !== 'villager')) assert(reach(tx(n), ty(n)), `${n.name} unreachable`);
  assert(reach(tx(t.chest), ty(t.chest)), 'chest');
  assert(reach(tx(t.gate), ty(t.gate) + 1), 'gate');
});
test('town is compact: services within ~16 tiles of the spawn', () => {
  const t = buildTown();
  for (const p of [t.chest, t.gate, ...t.npcs.filter((n) => n.role === 'quest' || n.role === 'merchant')]) {
    const dd = Math.hypot(p.x - t.spawn.x, p.y - t.spawn.y) / TILE;
    assert(dd < 16, `service ${dd.toFixed(1)} tiles away`);
  }
});

console.log('\nItems');
test('generated items have valid rarity, slot and finite stats', () => {
  const rng = new RNG(5);
  for (let i = 0; i < 3000; i++) {
    const it = generateItem(rng, 1 + (i % 60), { magicFind: i % 3 === 0 ? 50 : 0 });
    assert(SLOTS.includes(it.slot), 'slot');
    assert(RARITIES.some((r) => r.id === it.rarity), 'rarity');
    assert(typeof it.name === 'string' && it.name.length > 2, 'name');
    assert(it.value > 0 && Number.isFinite(it.value), 'value');
    for (const a of it.affixes) {
      assert(AFFIXES[a.stat], `unknown affix ${a.stat}`);
      assert(Number.isFinite(a.value) && a.value > 0, `affix value ${a.value}`);
      assert(AFFIXES[a.stat].slots.includes(it.slot), `affix ${a.stat} not allowed on ${it.slot}`);
    }
    const stats = new Set(it.affixes.map((a) => a.stat));
    eq(stats.size, it.affixes.length, 'no duplicate affixes');
    if (it.slot === 'weapon') {
      assert(WEAPON_BASES[it.base], 'weapon base');
      assert(it.dmgMin >= 1 && it.dmgMax > it.dmgMin, `damage ${it.dmgMin}-${it.dmgMax}`);
      assert(it.speed > 0.5 && it.speed < 4, 'speed');
    }
    if (it.slot === 'focus') assert(FOCUS_BASES[it.base] && it.spellPower > 0, 'focus');
    if (it.rarity === 'legendary' && ['weapon', 'focus', 'boots', 'armor', 'amulet'].includes(it.slot)) assert(it.power, 'legendary power');
  }
});
test('rarity affix counts match their tier', () => {
  const rng = new RNG(8);
  for (const r of RARITIES) {
    for (let i = 0; i < 100; i++) {
      const it = generateItem(rng, 10, { rarity: r.id });
      assert(it.affixes.length >= r.affixes[0] && it.affixes.length <= r.affixes[1], `${r.id} has ${it.affixes.length}`);
    }
  }
});
test('rarity distribution favours common items but produces all tiers', () => {
  const rng = new RNG(77);
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < 20000; i++) counts[rollRarity(rng, 10)]++;
  assert(counts[0] > counts[1] && counts[1] > counts[2] && counts[2] > counts[3] && counts[3] > counts[4], counts.join(','));
  assert(counts[4] > 0, 'legendaries exist');
});
test('higher item levels give stronger weapons on average', () => {
  const rng = new RNG(3);
  const avg = (lvl) => { let s = 0; for (let i = 0; i < 300; i++) { const w = generateItem(rng, lvl, { slot: 'weapon', rarity: 'common' }); s += w.dmgMin + w.dmgMax; } return s / 300; };
  assert(avg(20) > avg(1) * 2, 'scaling');
});
test('item comparison and descriptions work', () => {
  const rng = new RNG(10);
  const a = generateItem(rng, 5, { slot: 'weapon', rarity: 'rare' });
  const b = generateItem(rng, 5, { slot: 'weapon', rarity: 'common' });
  const rows = compareItems(a, b);
  assert(rows.find((r) => r.label === 'Weapon DPS'), 'dps row');
  assert(describeItem(a).length >= 3, 'description lines');
  assert(compareItems(a, null).length > 0, 'comparison against empty slot');
});
test('sanitizeItem repairs or rejects bad data', () => {
  eq(sanitizeItem(null), null);
  eq(sanitizeItem({ slot: 'hat', rarity: 'common' }), null);
  eq(sanitizeItem({ slot: 'ring', rarity: 'mythic' }), null);
  const fixed = sanitizeItem({ slot: 'weapon', rarity: 'rare', dmgMin: 'x', dmgMax: -5, affixes: [{ stat: 'nope', value: 3 }, { stat: 'crit', value: 4 }] });
  assert(fixed && fixed.dmgMin >= 1 && fixed.dmgMax > fixed.dmgMin, 'weapon repaired');
  eq(fixed.affixes.length, 1, 'bad affix dropped');
});

console.log('\nStats');
test('starter character has sensible stats', () => {
  const p = defaultProfile(1);
  const s = computeStats(p);
  eq(s.maxHp, 100 + (p.equipment.armor.hp || 0), 'hp');
  eq(s.maxMp, 60, 'mp');
  assert(s.dmgMin > 0 && s.dmgMax > s.dmgMin, 'damage');
  eq(s.spell, 'ember');
});
test('levelling raises attributes and life', () => {
  const p = defaultProfile(1);
  const s1 = computeStats(p);
  p.level = 10;
  const s10 = computeStats(p);
  assert(s10.attrs.str > s1.attrs.str && s10.maxHp > s1.maxHp && s10.maxMp > s1.maxMp);
});
test('equipment changes combat values', () => {
  const p = defaultProfile(1);
  const before = computeStats(p);
  p.equipment.ring = { ...generateItem(new RNG(4), 5, { slot: 'ring', rarity: 'rare' }), affixes: [{ stat: 'hp', value: 40 }], implicit: null };
  const after = computeStats(p);
  eq(after.maxHp, before.maxHp + 40);
  p.equipment.focus = generateItem(new RNG(4), 5, { slot: 'focus', base: 'storm' });
  eq(computeStats(p).spell, 'storm');
});
test('armor reduction has diminishing returns and a cap', () => {
  assert(armorReduction(0, 5) === 0);
  assert(armorReduction(50, 5) < armorReduction(100, 5));
  assert(armorReduction(1e6, 1) <= 0.75);
});

console.log('\nQuests');
test('quest offers are deterministic and use at least three templates overall', () => {
  const a = questOffers(55, 0, 3, 2), b = questOffers(55, 0, 3, 2);
  eq(JSON.stringify(a), JSON.stringify(b));
  eq(a.length, 3);
  const types = new Set();
  for (let i = 0; i < 20; i++) for (const q of questOffers(i, i, 1 + i, i)) types.add(q.type);
  for (const t of ['kill', 'collect', 'depth']) assert(types.has(t), `template ${t}`);
});
test('quest progress tracking and completion', () => {
  const rng = new RNG(1);
  const kill = makeQuest(rng, 'kill', 3, 3);
  for (let i = 0; i < kill.required; i++) trackQuest(kill, { type: 'kill', arch: kill.target, depth: 2 });
  assert(kill.done, 'kill quest done');
  const other = makeQuest(rng, 'kill', 3, 3);
  trackQuest(other, { type: 'kill', arch: other.target === 'grunt' ? 'archer' : 'grunt' });
  eq(other.progress, 0, 'wrong type does not count');
  const col = makeQuest(rng, 'collect', 3, 3);
  for (let i = 0; i < col.required; i++) trackQuest(col, { type: 'collect' });
  assert(col.done);
  const dep = makeQuest(rng, 'depth', 3, 3);
  trackQuest(dep, { type: 'depth', depth: dep.target - 1 });
  assert(!dep.done);
  trackQuest(dep, { type: 'depth', depth: dep.target });
  assert(dep.done);
});
test('quest rewards scale with level', () => {
  const low = makeQuest(new RNG(9), 'kill', 1, 1), high = makeQuest(new RNG(9), 'kill', 20, 20);
  assert(high.reward.gold > low.reward.gold && high.reward.xp > low.reward.xp);
});
test('sanitizeQuest rejects garbage', () => {
  eq(sanitizeQuest({ type: 'dance' }), null);
  const q = sanitizeQuest({ type: 'kill', target: 'grunt', required: 5, progress: 99 });
  eq(q.progress, 5); assert(q.done);
});

console.log('\nPersistence');
test('profile serialises and restores losslessly', () => {
  const p = defaultProfile(987);
  const rng = new RNG(1);
  p.level = 7; p.xp = 12; p.gold = 4321; p.potions = 5; p.maxDepth = 9;
  p.inventory[0] = generateItem(rng, 7);
  p.inventory[5] = generateItem(rng, 7, { rarity: 'legendary', slot: 'weapon' });
  p.storage[3] = generateItem(rng, 3);
  p.equipment.ring = generateItem(rng, 7, { slot: 'ring' });
  p.quest = makeQuest(rng, 'collect', 7, 9); p.quest.progress = 2;
  p.location = { type: 'dungeon', depth: 6 };
  const r = deserialize(serialize(p));
  assert(!r.error, r.error);
  const q = r.profile;
  eq(q.level, 7); eq(q.gold, 4321); eq(q.potions, 5); eq(q.maxDepth, 9); eq(q.seed, 987);
  eq(canon(q.inventory[5]), canon(p.inventory[5]), 'legendary preserved');
  eq(canon(q.storage), canon(p.storage), 'storage preserved');
  eq(canon(q.equipment), canon(p.equipment), 'equipment preserved');
  eq(q.quest.progress, 2); eq(q.location.depth, 6);
  eq(q.inventory.length, INVENTORY_SLOTS); eq(q.storage.length, STORAGE_SLOTS);
});
test('restored profile is usable by the stat system', () => {
  const p = defaultProfile(3);
  const q = deserialize(serialize(p)).profile;
  const s = computeStats(q);
  assert(Number.isFinite(s.maxHp) && Number.isFinite(s.dps));
});
test('corrupted / invalid saves are handled gracefully', () => {
  assert(deserialize('{not json').error);
  assert(deserialize('').error);
  assert(deserialize(JSON.stringify({ version: 99 })).error, 'future version rejected');
  const r = deserialize(JSON.stringify({ version: 3, level: 'abc', gold: -50, inventory: 'x', equipment: { weapon: { slot: 'ring', rarity: 'common' } }, potions: 9999 }));
  assert(!r.error);
  eq(r.profile.level, 1); eq(r.profile.gold, 0); eq(r.profile.potions, 12);
  eq(r.profile.equipment.weapon, null, 'mismatched equipment dropped');
  assert(r.warnings.length > 0, 'warnings reported');
});
test('old v1 saves migrate to the current format', () => {
  const v1 = { version: 1, seed: 5, level: 4, xp: 10, gold: 99, potions: 2, depth: 6, items: [generateItem(new RNG(2), 3)], chest: [], equipped: { accessory: generateItem(new RNG(2), 3, { slot: 'ring' }) } };
  const r = deserialize(JSON.stringify(v1));
  assert(!r.error, r.error);
  eq(r.profile.level, 4); eq(r.profile.maxDepth, 6);
  assert(r.profile.inventory[0], 'item migrated');
  assert(r.profile.equipment.ring, 'accessory became ring');
  eq(migrate(v1).version, 3);
});
test('SaveStore round trip through a Storage implementation', () => {
  const store = new SaveStore(new MemoryStorage());
  assert(!store.hasSave());
  const p = defaultProfile(42); p.gold = 777;
  assert(store.save(p));
  assert(store.hasSave());
  eq(store.load().profile.gold, 777);
  store.saveSettings({ volume: 0.3, muted: true, shake: false });
  const s = store.loadSettings();
  eq(s.volume, 0.3); eq(s.muted, true); eq(s.shake, false);
  store.clear();
  assert(!store.hasSave());
});
test('SaveStore survives a throwing storage', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } };
  const store = new SaveStore(bad);
  eq(store.load(), null);
  eq(store.save(defaultProfile(1)), false);
  store.clear();
});
test('xp curve is increasing', () => {
  for (let l = 1; l < 100; l++) assert(xpForLevel(l + 1) > xpForLevel(l));
});

// Minimal canvas stand-in: every context call is recorded, so the lighting pipeline can run in Node.
function withFakeCanvas(fn) {
  const made = [];
  const makeCanvas = () => {
    const canvas = { width: 300, height: 150 };
    const calls = [];
    const ctx = new Proxy({ canvas, calls }, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
        return (...args) => { calls.push([k, args]); };
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    canvas.getContext = () => ctx;
    made.push(canvas);
    return canvas;
  };
  const prev = globalThis.document;
  globalThis.document = { createElement: makeCanvas };
  try { fn(made); } finally { globalThis.document = prev; }
}

function townArea() {
  const t = buildTown();
  return { map: new TileMap(t.W, t.H, t.tiles), lights: t.lights, W: t.W, H: t.H };
}

console.log('\nLighting');
test('lamp posts, torches and braziers are baked into the static light map once per area', () => withFakeCanvas((made) => {
  const L = new Lighting();
  L.resize(480, 270);
  const town = townArea();
  assert(town.lights.length >= 9, 'town should define lamp post lights');
  L.useArea(town);
  assert(L.static, 'static light map missing after entering the town');
  eq(L.static.width, Math.ceil(town.W * TILE * L.scale), 'static map width');
  eq(L.static.height, Math.ceil(town.H * TILE * L.scale), 'static map height');
  eq(L.flickerLights.length, town.lights.filter((x) => x.flicker > 0).length, 'flicker lights');
  const fills = L.static.getContext('2d').calls.filter(([k]) => k === 'fill').length;
  eq(fills, town.lights.length, 'every light is drawn with its shadow polygon');
  const canvases = made.length;
  L.useArea(town);
  eq(made.length, canvases, 'same area must not be re-baked');
  const f = generateFloor(12345, 1);
  const floor = { map: new TileMap(f.W, f.H, f.tiles), lights: f.lights };
  const torches = f.props.filter((p) => p.type === 'wallTorch');
  assert(torches.length > 0, 'floor 1 should have wall torches');
  for (const t of torches) assert(f.lights.some((l) => l.x === t.x && Math.abs(l.y - t.y) <= 8), `torch at ${t.x},${t.y} has no light`);
  L.useArea(floor);
  assert(L.static && made.length === canvases + 1, 'a new area gets a fresh bake');
  eq(L.flickerLights.length, f.lights.filter((x) => x.flicker > 0).length, 'dungeon flicker lights');
  L.useArea(null);
  eq(L.static, null, 'leaving the area clears the static light map');
}));

test('static light reaches the light buffer, clipped at the area edges', () => withFakeCanvas(() => {
  const L = new Lighting();
  L.resize(480, 270);
  const town = townArea();
  L.useArea(town);
  const scene = document.createElement('canvas').getContext('2d');
  for (const [camX, camY] of [[40, 30], [-6, -4], [town.W * TILE - 470, town.H * TILE - 262]]) {
    const lctx = L.light.getContext('2d');
    lctx.calls.length = 0;
    L.apply(scene, camX, camY, [20, 20, 30], [], 1.5);
    const draw = lctx.calls.find(([k, a]) => k === 'drawImage' && a[0] === L.static);
    assert(draw, `static map not composited at camera ${camX},${camY}`);
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = draw[1];
    assert(sx >= 0 && sy >= 0 && sx + sw <= L.static.width + 1e-9 && sy + sh <= L.static.height + 1e-9, `source rect out of bounds ${draw[1].slice(1)}`);
    assert(sw > 0 && sh > 0 && sw === dw && sh === dh && dx >= 0 && dy >= 0, `bad destination ${draw[1].slice(1)}`);
    // flicker lights are drawn through their shadow polygon, never as unshadowed rectangles
    const rects = lctx.calls.filter(([k]) => k === 'fillRect').length;
    eq(rects, 1, 'only the ambient fill may be a rectangle');
  }
}));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  for (const [n, e] of failures) console.log(`\nFAILED: ${n}\n${e && e.stack}`);
  process.exit(1);
}
