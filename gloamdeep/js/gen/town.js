// The hand-designed hub village "Wickhollow". Pure data builder (deterministic, no DOM).
// Compact on purpose: every service is 2–3 seconds of walking from the plaza.

import { RNG } from '../core/rng.js';
import { T } from '../world/tiles.js';
import { TILE } from '../config.js';

export const TOWN_NAME = 'Wickhollow';

export function buildTown() {
  const W = 46, H = 30;
  const tiles = new Uint8Array(W * H).fill(T.GRASS);
  const rng = new RNG(0x7a11);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = v; };
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.BLOCK : tiles[y * W + x]);
  const rect = (x0, y0, w, h, v) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, v); };
  const ellipse = (cx, cy, rx, ry, v, test = () => true) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1 && test(x, y)) set(x, y, v);
    }
  };
  const wp = (t) => t * TILE + TILE / 2;

  const props = [];
  const decor = [];
  const lights = [];

  // ---- forest border (irregular, 2–4 tiles thick)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    const thick = 2 + ((x * 7 + y * 13) % 5 === 0 ? 1 : 0) + ((x * 3 + y * 5) % 11 === 0 ? 1 : 0);
    if (edge < thick) set(x, y, T.BLOCK);
  }

  // ---- northern cliff with the Gloam Stair
  for (let x = 13; x <= 32; x++) {
    const bottom = 5 + ((x === 13 || x === 32) ? -1 : (x === 14 || x === 31) ? 0 : 1);
    for (let y = 1; y <= bottom; y++) set(x, y, T.WALL);
  }

  // ---- ground: plaza, paths
  ellipse(23, 15, 8.5, 5.6, T.COBBLE);
  rect(21, 7, 5, 4, T.COBBLE);       // road to the stair
  rect(8, 14, 8, 3, T.DIRT);         // west path to the cottage
  rect(31, 14, 9, 3, T.DIRT);        // east path to the shop
  rect(22, 20, 3, 8, T.DIRT);        // south road into the woods
  rect(12, 17, 3, 5, T.DIRT);        // path to the cemetery
  ellipse(8, 22, 4.2, 3.2, T.DIRT, (x, y) => get(x, y) === T.GRASS);

  // ---- pond with a jetty
  ellipse(37.5, 23.5, 4.6, 3.1, T.DEEPWATER);
  rect(33, 23, 3, 1, T.PLANK);
  for (let x = 30; x <= 33; x++) if (get(x, 23) === T.GRASS) set(x, 23, T.DIRT);

  // ---- buildings (BLOCK footprints; sprites drawn by the renderer)
  const building = (type, x, y, w, h, extra = {}) => {
    rect(x, y, w, h, T.BLOCK);
    props.push({ type, x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE, ...extra });
  };
  building('house', 5, 10, 6, 3, { roof: '#6b3a2e', wall: '#8a6a4a', name: 'Your Cottage', chimney: true });
  building('house', 35, 10, 6, 3, { roof: '#3e4d6b', wall: '#7c6a56', name: "Pell's Curiosities", sign: true });
  building('house', 11, 22, 5, 3, { roof: '#4d5e3a', wall: '#7a6450' });
  building('house', 27, 22, 5, 3, { roof: '#6b4a2e', wall: '#846a50', chimney: true });
  building('hall', 16, 7, 4, 2, { roof: '#5a2e3a', wall: '#6e5a4a', name: 'Watch Post' });

  // market stall in front of the shop
  building('stall', 33, 14, 3, 1, { awning: '#b0402e' });

  // ---- small props with colliders
  const prop = (type, tx, ty, extra = {}) => { props.push({ type, x: wp(tx), y: wp(ty), ...extra }); };
  prop('gloamGate', 23, 5, { x: 23 * TILE, y: 6 * TILE });
  prop('campfire', 23, 15);
  prop('well', 17, 17);
  prop('noticeBoard', 19, 10);
  prop('storageChest', 12, 13);
  for (const [lx, ly] of [[15, 11], [31, 11], [15, 19], [31, 19], [21, 8], [26, 8], [8, 17], [38, 17], [23, 24]]) {
    prop('lampPost', lx, ly);
    lights.push({ x: wp(lx), y: wp(ly) - 18, color: '#ffc46b', radius: 120, intensity: 0.95, flicker: 0.35 });
  }
  lights.push({ x: wp(23), y: wp(15) - 4, color: '#ff9a3c', radius: 170, intensity: 1.15, flicker: 1 });
  lights.push({ x: 23 * TILE, y: 6 * TILE - 6, color: '#7a9aff', radius: 150, intensity: 1.0, flicker: 0.4 });
  lights.push({ x: wp(12), y: wp(13) - 4, color: '#ffd9a0', radius: 60, intensity: 0.6, flicker: 0.1 });
  // windows glow
  for (const [wx, wy] of [[8, 12], [38, 12], [13, 24], [29, 24], [18, 8]]) {
    lights.push({ x: wp(wx), y: wy * TILE + 4, color: '#ffb35c', radius: 64, intensity: 0.7, flicker: 0.15 });
  }

  // cemetery
  for (const [gx, gy] of [[5, 20], [7, 20], [9, 20], [5, 23], [7, 23], [9, 23]]) prop('grave', gx, gy, { v: (gx + gy) % 3 });
  for (let x = 3; x <= 11; x++) if (get(x, 25) !== T.BLOCK) prop('fence', x, 25);
  prop('candles', 7, 22);
  lights.push({ x: wp(7), y: wp(22), color: '#ffcf7a', radius: 56, intensity: 0.7, flicker: 1 });

  // fences, crates, barrels, carts
  for (let x = 31; x <= 33; x++) prop('fence', x, 20);
  for (let x = 36; x <= 40; x++) prop('fence', x, 19);
  prop('crate', 36, 14); prop('barrel', 37, 14); prop('crate', 36, 15, { v: 1 });
  prop('barrel', 4, 13); prop('woodpile', 11, 11);
  prop('cart', 28, 12);
  prop('signpost', 25, 21);
  prop('bench', 20, 20);
  prop('hayBale', 32, 25); prop('hayBale', 33, 26);
  prop('trainingDummy', 29, 18);

  // trees inside the village (non-border)
  for (const [tx, ty] of [[4, 6], [9, 5], [36, 6], [41, 7], [42, 12], [18, 25], [26, 26], [41, 26], [3, 16], [34, 5]]) {
    if (get(tx, ty) === T.GRASS) { set(tx, ty, T.BLOCK); prop('tree', tx, ty, { v: (tx * 3 + ty) % 3 }); }
  }
  // border trees (drawn on BLOCK tiles that are not buildings)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (get(x, y) !== T.BLOCK) continue;
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (edge > 3) continue;
    if ((x + y * 2) % 2 === 0 || rng.chance(0.3)) props.push({ type: 'tree', x: wp(x) + rng.int(-4, 4), y: wp(y) + rng.int(-3, 3), v: rng.int(0, 2), border: true });
  }

  // ---- floor decor: flowers, tufts, stones, puddles
  for (let i = 0; i < 260; i++) {
    const x = rng.int(2, W - 3), y = rng.int(2, H - 3);
    const t = get(x, y);
    if (t === T.GRASS) decor.push({ type: rng.pick(['flowers', 'tuft', 'tuft', 'tuft', 'stones', 'mushroomRing', 'flowers']), x: x * TILE + rng.int(1, 15), y: y * TILE + rng.int(1, 15), v: rng.int(0, 7) });
    else if (t === T.COBBLE && rng.chance(0.25)) decor.push({ type: 'cobbleCrack', x: x * TILE + rng.int(2, 14), y: y * TILE + rng.int(2, 14), v: rng.int(0, 7) });
    else if (t === T.DIRT && rng.chance(0.4)) decor.push({ type: 'pebbles', x: x * TILE + rng.int(2, 14), y: y * TILE + rng.int(2, 14), v: rng.int(0, 7) });
  }

  // ---- NPCs
  const npcs = [
    { id: 'warden', name: 'Warden Isolde', role: 'quest', x: wp(21), y: wp(10) + 2, look: 'warden', stand: true },
    { id: 'merchant', name: 'Pell Brasswick', role: 'merchant', x: wp(34), y: wp(13) + 4, look: 'merchant', stand: true },
    { id: 'villager1', name: 'Marra the Baker', role: 'villager', x: wp(27), y: wp(17), look: 'villagerA',
      path: [[27, 17], [30, 17], [30, 21], [25, 21], [25, 18]], lines: ['Bread\'s cold again. Nobody bakes when the Stair hums.', 'My brother went down in spring. Bring back his lantern if you see it.'] },
    { id: 'villager2', name: 'Old Tobin', role: 'villager', x: wp(20), y: wp(20), look: 'villagerB', stand: true, sit: true,
      lines: ['Forty years I kept the lamps. The dark below keeps growing, lad.', 'Every fifth landing, something old waits. Mark my words.'] },
    { id: 'child', name: 'Wren', role: 'villager', x: wp(18), y: wp(14), look: 'child',
      path: [[18, 14], [19, 18], [16, 19], [15, 15]], lines: ['Is it true the monsters glow down there?', 'Bao likes you! Bao never likes anyone.'] },
    { id: 'bao', name: 'Bao', role: 'panda', x: wp(25), y: wp(18), look: 'redpanda',
      path: [[25, 18], [28, 16], [26, 13], [21, 13], [19, 16], [22, 19]], lines: ['The red panda sniffs your lantern approvingly.', 'Bao curls its striped tail around your boot. You feel oddly brave.'] },
  ];

  return {
    W, H, tiles, props, decor, lights, npcs,
    spawn: { x: wp(23), y: wp(18) },
    gateSpawn: { x: 23 * TILE, y: 8 * TILE },
    gate: { x: 23 * TILE, y: 6 * TILE + 6 },
    chest: { x: wp(12), y: wp(13) },
  };
}
