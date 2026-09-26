// Endless procedural dungeon floors.
// Pure module: generateFloor(worldSeed, depth) returns plain data (tiles + descriptors).
// The same (seed, depth) always yields the same floor. Separate RNG streams are used for
// layout, features, population and decoration so tweaking one never shifts the others.

import { RNG, floorSeed } from '../core/rng.js';
import { T, isWalkableId } from '../world/tiles.js';
import { themeForDepth, themeIndexForDepth } from '../data/themes.js';
import { ARCHETYPES, ELITE_MODS, eliteChance, unlockedArchetypes } from '../data/enemies.js';
import { BOSS_INTERVAL, TILE } from '../config.js';

export const isBossDepth = (depth) => depth > 0 && depth % BOSS_INTERVAL === 0;

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Breadth-first distances over tiles accepted by `pass(id)`. Returns Int32Array (-1 = unreachable). */
export function bfs(tiles, W, H, sx, sy, pass = isWalkableId) {
  const dist = new Int32Array(W * H).fill(-1);
  const queue = new Int32Array(W * H);
  const start = sy * W + sx;
  if (!pass(tiles[start])) return dist;
  let head = 0, tail = 0;
  queue[tail++] = start;
  dist[start] = 0;
  while (head < tail) {
    const i = queue[head++];
    const x = i % W, y = (i / W) | 0;
    const d = dist[i] + 1;
    if (x > 0 && dist[i - 1] < 0 && pass(tiles[i - 1])) { dist[i - 1] = d; queue[tail++] = i - 1; }
    if (x < W - 1 && dist[i + 1] < 0 && pass(tiles[i + 1])) { dist[i + 1] = d; queue[tail++] = i + 1; }
    if (y > 0 && dist[i - W] < 0 && pass(tiles[i - W])) { dist[i - W] = d; queue[tail++] = i - W; }
    if (y < H - 1 && dist[i + W] < 0 && pass(tiles[i + W])) { dist[i + W] = d; queue[tail++] = i + W; }
  }
  return dist;
}

const passSafe = (id) => isWalkableId(id) && id !== T.LIQUID;

function countReachable(dist) {
  let n = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] >= 0) n++;
  return n;
}

// ---------------------------------------------------------------- rooms

function overlaps(a, b, pad) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

function chooseShape(rng, w, h) {
  const opts = [['rect', 38]];
  if (w >= 7 && h >= 7) opts.push(['cave', 18], ['round', 13]);
  if (w >= 9 && h >= 7) opts.push(['pillars', 14]);
  if (w >= 9 && h >= 9) opts.push(['cross', 9]);
  if (w >= 10 && h >= 8) opts.push(['hall', 8]);
  return rng.weighted(opts);
}

function carveRoom(grid, zone, W, room, rng) {
  const { x, y, w, h, shape, id } = room;
  const set = (tx, ty, v = T.FLOOR) => { grid[ty * W + tx] = v; zone[ty * W + tx] = id; };
  if (shape === 'round') {
    const rx = w / 2, ry = h / 2, cx = x + rx - 0.5, cy = y + ry - 0.5;
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) {
      const dx = (tx - cx) / rx, dy = (ty - cy) / ry;
      if (dx * dx + dy * dy <= 1.05) set(tx, ty);
    }
  } else if (shape === 'cave') {
    let cells = new Uint8Array(w * h);
    for (let i = 0; i < cells.length; i++) {
      const cx = i % w, cy = (i / w) | 0;
      const edge = cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1;
      cells[i] = edge ? 0 : rng.chance(0.6) ? 1 : 0;
    }
    for (let it = 0; it < 4; it++) {
      const next = new Uint8Array(w * h);
      for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
        let walls = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox, ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !cells[ny * w + nx]) walls++;
        }
        next[cy * w + cx] = walls >= 5 ? 0 : 1;
      }
      cells = next;
    }
    const mx = w >> 1, my = h >> 1;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) cells[(my + oy) * w + mx + ox] = 1;
    // keep only the region connected to the centre
    const keep = new Uint8Array(w * h);
    const stack = [my * w + mx];
    keep[my * w + mx] = 1;
    while (stack.length) {
      const i = stack.pop();
      const cx = i % w, cy = (i / w) | 0;
      for (const [dx, dy] of DIRS4) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (cells[j] && !keep[j]) { keep[j] = 1; stack.push(j); }
      }
    }
    for (let i = 0; i < keep.length; i++) if (keep[i]) set(x + (i % w), y + ((i / w) | 0));
  } else if (shape === 'cross') {
    const bw = Math.max(3, Math.round(w / 3)), bh = Math.max(3, Math.round(h / 3));
    const bx = x + ((w - bw) >> 1), by = y + ((h - bh) >> 1);
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) {
      if ((tx >= bx && tx < bx + bw) || (ty >= by && ty < by + bh)) set(tx, ty);
    }
  } else {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) set(tx, ty);
    if (shape === 'pillars' || shape === 'hall') {
      const step = shape === 'hall' ? 4 : 3;
      for (let ty = y + 2; ty < y + h - 2; ty += step) for (let tx = x + 2; tx < x + w - 2; tx += step) {
        const cx = x + (w >> 1), cy = y + (h >> 1);
        if (Math.abs(tx - cx) <= 1 && Math.abs(ty - cy) <= 1) continue;
        grid[ty * W + tx] = T.WALL;
      }
    }
    if (shape === 'arena') {
      // four pillar clusters as cover, a rug ring around the centre
      const cx = x + (w >> 1), cy = y + (h >> 1);
      for (const [px, py] of [[x + 3, y + 3], [x + w - 4, y + 3], [x + 3, y + h - 4], [x + w - 4, y + h - 4]]) {
        grid[py * W + px] = T.WALL;
      }
      for (let ty = cy - 3; ty <= cy + 3; ty++) for (let tx = cx - 4; tx <= cx + 4; tx++) {
        const edge = Math.abs(ty - cy) === 3 || Math.abs(tx - cx) === 4;
        if (edge) grid[ty * W + tx] = T.RUG;
      }
    }
  }
}

function roomCenter(room) {
  return { x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) };
}

// ---------------------------------------------------------------- corridors

function carveBrush(grid, W, H, x, y, size) {
  const o = size >> 1;
  for (let oy = 0; oy < size; oy++) for (let ox = 0; ox < size; ox++) {
    const tx = x - o + ox, ty = y - o + oy;
    if (tx < 2 || ty < 2 || tx >= W - 2 || ty >= H - 2) continue;
    if (grid[ty * W + tx] === T.WALL) grid[ty * W + tx] = T.FLOOR;
  }
}

function carveCorridor(grid, W, H, a, b, rng) {
  const size = rng.weighted([[1, 30], [2, 55], [3, 15]]);
  const style = rng.weighted([['L', 55], ['Z', 28], ['wander', 17]]);
  let x = a.x, y = a.y;
  const stepTo = (tx, ty, xFirst) => {
    if (xFirst) {
      while (x !== tx) { x += Math.sign(tx - x); carveBrush(grid, W, H, x, y, size); }
      while (y !== ty) { y += Math.sign(ty - y); carveBrush(grid, W, H, x, y, size); }
    } else {
      while (y !== ty) { y += Math.sign(ty - y); carveBrush(grid, W, H, x, y, size); }
      while (x !== tx) { x += Math.sign(tx - x); carveBrush(grid, W, H, x, y, size); }
    }
  };
  carveBrush(grid, W, H, x, y, size);
  if (style === 'L') {
    stepTo(b.x, b.y, rng.chance(0.5));
  } else if (style === 'Z') {
    if (Math.abs(b.x - a.x) > Math.abs(b.y - a.y)) {
      const mx = a.x + Math.round((b.x - a.x) * rng.float(0.3, 0.7));
      stepTo(mx, y, true); stepTo(mx, b.y, false); stepTo(b.x, b.y, true);
    } else {
      const my = a.y + Math.round((b.y - a.y) * rng.float(0.3, 0.7));
      stepTo(x, my, false); stepTo(b.x, my, true); stepTo(b.x, b.y, false);
    }
  } else {
    let guard = (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) * 4 + 20;
    while ((x !== b.x || y !== b.y) && guard-- > 0) {
      const dx = b.x - x, dy = b.y - y;
      if (rng.chance(0.72)) {
        if (rng.next() * (Math.abs(dx) + Math.abs(dy)) < Math.abs(dx)) x += Math.sign(dx); else y += Math.sign(dy);
      } else if (rng.chance(0.5)) {
        x = Math.min(W - 4, Math.max(3, x + rng.sign()));
      } else {
        y = Math.min(H - 4, Math.max(3, y + rng.sign()));
      }
      carveBrush(grid, W, H, x, y, size);
    }
    stepTo(b.x, b.y, rng.chance(0.5));
  }
}

/** Minimum spanning tree over room centres (Prim) plus a few extra loops. */
function connectRooms(rooms, rng) {
  const n = rooms.length;
  const edges = [];
  const inTree = new Array(n).fill(false);
  inTree[0] = true;
  const d = (i, j) => Math.hypot(rooms[i].cx - rooms[j].cx, rooms[i].cy - rooms[j].cy);
  for (let added = 1; added < n; added++) {
    let best = null;
    for (let i = 0; i < n; i++) if (inTree[i]) for (let j = 0; j < n; j++) if (!inTree[j]) {
      const dd = d(i, j);
      if (!best || dd < best.d) best = { a: i, b: j, d: dd };
    }
    inTree[best.b] = true;
    edges.push([best.a, best.b]);
  }
  const has = (a, b) => edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  for (let i = 0; i < n; i++) {
    if (!rng.chance(0.3)) continue;
    const near = [];
    for (let j = 0; j < n; j++) if (j !== i) near.push([j, d(i, j)]);
    near.sort((p, q) => p[1] - q[1]);
    const cand = near.slice(0, 3).map((e) => e[0]).filter((j) => !has(i, j));
    if (cand.length) edges.push([i, rng.pick(cand)]);
  }
  return edges;
}

// ---------------------------------------------------------------- blobs (water, liquid, pits)

function blob(rng, cx, cy, size) {
  const cells = new Set([`${cx},${cy}`]);
  const list = [[cx, cy]];
  while (list.length < size) {
    const [bx, by] = rng.pick(list);
    const [dx, dy] = rng.pick(DIRS4);
    const k = `${bx + dx},${by + dy}`;
    if (!cells.has(k)) { cells.add(k); list.push([bx + dx, by + dy]); }
  }
  return list;
}

// ---------------------------------------------------------------- main

export function generateFloor(worldSeed, depth) {
  const seed = floorSeed(worldSeed, depth);
  const master = new RNG(seed);
  const layoutRng = master.fork(11);
  const featureRng = master.fork(23);
  const popRng = master.fork(37);
  const decoRng = master.fork(51);

  const theme = themeForDepth(depth);
  const boss = isBossDepth(depth);

  const W = 58 + Math.min(34, depth * 2) + layoutRng.int(0, 6);
  const H = 42 + Math.min(24, Math.floor(depth * 1.4)) + layoutRng.int(0, 4);
  const grid = new Uint8Array(W * H).fill(T.WALL);
  const zone = new Int16Array(W * H).fill(-1);

  // ---- rooms
  const rooms = [];
  if (boss) {
    const aw = layoutRng.int(19, 22), ah = layoutRng.int(15, 17);
    const ax = layoutRng.chance(0.5) ? W - aw - 3 : 3;
    const ay = layoutRng.int(3, H - ah - 3);
    rooms.push({ x: ax, y: ay, w: aw, h: ah, shape: 'arena', kind: 'arena' });
  }
  const target = 8 + Math.min(10, Math.floor(depth / 2)) + layoutRng.int(0, 3);
  for (let attempt = 0; attempt < 900 && rooms.length < target; attempt++) {
    const big = layoutRng.chance(0.2);
    const w = big ? layoutRng.int(11, 16) : layoutRng.int(5, 11);
    const h = big ? layoutRng.int(9, 12) : layoutRng.int(5, 9);
    const x = layoutRng.int(3, W - w - 3);
    const y = layoutRng.int(3, H - h - 3);
    const room = { x, y, w, h };
    if (rooms.some((r) => overlaps(room, r, 2))) continue;
    room.shape = chooseShape(layoutRng, w, h);
    room.kind = 'normal';
    rooms.push(room);
  }
  rooms.forEach((r, i) => {
    r.id = i;
    const c = roomCenter(r);
    r.cx = c.x; r.cy = c.y;
  });
  for (const r of rooms) carveRoom(grid, zone, W, r, layoutRng);
  // make sure every centre is open floor (pillars / caves never block the centre)
  for (const r of rooms) {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const i = (r.cy + oy) * W + r.cx + ox;
      if (grid[i] === T.WALL) grid[i] = T.FLOOR;
      zone[i] = r.id;
    }
  }

  // ---- corridors
  const edges = connectRooms(rooms, layoutRng);
  for (const [a, b] of edges) {
    carveCorridor(grid, W, H, { x: rooms[a].cx, y: rooms[a].cy }, { x: rooms[b].cx, y: rooms[b].cy }, layoutRng);
  }
  const degree = new Array(rooms.length).fill(0);
  for (const [a, b] of edges) { degree[a]++; degree[b]++; }
  rooms.forEach((r, i) => { r.degree = degree[i]; });

  // ---- choose start & exit by path distance
  let startRoom;
  if (boss) {
    const dArena = bfs(grid, W, H, rooms[0].cx, rooms[0].cy);
    startRoom = rooms.slice(1).reduce((best, r) => (dArena[r.cy * W + r.cx] > dArena[best.cy * W + best.cx] ? r : best), rooms[1]);
  } else {
    startRoom = rooms[layoutRng.int(0, rooms.length - 1)];
  }
  startRoom.kind = 'start';
  let dist = bfs(grid, W, H, startRoom.cx, startRoom.cy);

  // remove unreachable pockets
  for (let i = 0; i < grid.length; i++) if (grid[i] !== T.WALL && dist[i] < 0) { grid[i] = T.WALL; zone[i] = -1; }

  let exitRoom;
  if (boss) {
    exitRoom = rooms[0];
    // the sealed stair sits at the far end of the arena, the guardian stands in its middle
    exitRoom.bossX = exitRoom.cx; exitRoom.bossY = exitRoom.cy;
    exitRoom.cy = exitRoom.y + 2;
    for (let ox = -1; ox <= 1; ox++) for (let oy = 0; oy <= 1; oy++) {
      const i = (exitRoom.cy + oy) * W + exitRoom.cx + ox;
      if (grid[i] === T.WALL) grid[i] = T.FLOOR;
    }
  } else {
    exitRoom = rooms.reduce((best, r) => (r !== startRoom && dist[r.cy * W + r.cx] > (best ? dist[best.cy * W + best.cx] : -1) ? r : best), null);
    exitRoom.kind = 'exit';
  }

  // special rooms: treasure in dead ends, one shrine room
  const others = rooms.filter((r) => r.kind === 'normal');
  const deadEnds = others.filter((r) => r.degree === 1);
  const treasureRoom = deadEnds.length ? featureRng.pick(deadEnds) : null;
  if (treasureRoom) treasureRoom.kind = 'treasure';
  const shrineCands = rooms.filter((r) => r.kind === 'normal');
  const shrineRoom = shrineCands.length && featureRng.chance(0.55) ? featureRng.pick(shrineCands) : null;
  if (shrineRoom) shrineRoom.kind = 'shrine';

  // ---- features: water, hazard liquid, pits, rugs (each validated for connectivity)
  const reserved = new Uint8Array(W * H); // tiles that must stay plain floor
  const reserve = (tx, ty, r = 1) => {
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const nx = tx + ox, ny = ty + oy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) reserved[ny * W + nx] = 1;
    }
  };
  for (const r of rooms) reserve(r.cx, r.cy, 1);
  reserve(startRoom.cx, startRoom.cy, 3);
  reserve(exitRoom.cx, exitRoom.cy, 2);

  const roomCentersReachable = (pass) => {
    const dd = bfs(grid, W, H, startRoom.cx, startRoom.cy, pass);
    return rooms.every((r) => dd[r.cy * W + r.cx] >= 0);
  };

  for (const r of rooms) {
    if (r.kind === 'arena') continue;
    const area = r.w * r.h;
    // shallow water puddles
    if (featureRng.chance(theme.liquid === 'water' ? 0.35 : 0.12)) {
      const px = featureRng.int(r.x + 1, r.x + r.w - 2), py = featureRng.int(r.y + 1, r.y + r.h - 2);
      for (const [bx, by] of blob(featureRng, px, py, featureRng.int(4, Math.max(5, area / 5)))) {
        const i = by * W + bx;
        if (bx > 1 && by > 1 && bx < W - 2 && by < H - 2 && grid[i] === T.FLOOR && !reserved[i]) grid[i] = T.WATER;
      }
    }
    // hazardous liquid pools (must keep a dry path everywhere)
    if (r.kind !== 'start' && featureRng.chance(Math.min(0.5, 0.18 + depth * 0.02))) {
      const px = featureRng.int(r.x + 1, r.x + r.w - 2), py = featureRng.int(r.y + 1, r.y + r.h - 2);
      const changed = [];
      for (const [bx, by] of blob(featureRng, px, py, featureRng.int(3, Math.max(4, area / 6)))) {
        const i = by * W + bx;
        if (bx > 1 && by > 1 && bx < W - 2 && by < H - 2 && (grid[i] === T.FLOOR || grid[i] === T.WATER) && !reserved[i]) {
          changed.push([i, grid[i]]); grid[i] = T.LIQUID;
        }
      }
      if (!roomCentersReachable(passSafe)) for (const [i, v] of changed) grid[i] = v;
    }
    // chasms in larger rooms
    if (area >= 70 && r.kind !== 'start' && featureRng.chance(0.3)) {
      const before = countReachable(bfs(grid, W, H, startRoom.cx, startRoom.cy));
      const px = featureRng.int(r.x + 2, r.x + r.w - 3), py = featureRng.int(r.y + 2, r.y + r.h - 3);
      const changed = [];
      for (const [bx, by] of blob(featureRng, px, py, featureRng.int(4, Math.max(5, area / 7)))) {
        const i = by * W + bx;
        if (bx > 1 && by > 1 && bx < W - 2 && by < H - 2 && grid[i] === T.FLOOR && !reserved[i] && zone[i] === r.id) {
          changed.push([i, grid[i]]); grid[i] = T.PIT;
        }
      }
      const after = countReachable(bfs(grid, W, H, startRoom.cx, startRoom.cy));
      if (after !== before - changed.length || !roomCentersReachable(passSafe)) for (const [i, v] of changed) grid[i] = v;
    }
    // rugs in special rooms
    if (r.kind === 'treasure' || r.kind === 'shrine' || (r.shape === 'hall' && featureRng.chance(0.6))) {
      for (let ty = r.cy - 1; ty <= r.cy + 1; ty++) for (let tx = r.cx - 2; tx <= r.cx + 2; tx++) {
        if (grid[ty * W + tx] === T.FLOOR) grid[ty * W + tx] = T.RUG;
      }
    }
  }

  dist = bfs(grid, W, H, startRoom.cx, startRoom.cy);

  // ---- occupancy helpers for props / enemies
  const occupied = new Uint8Array(W * H);
  for (let i = 0; i < reserved.length; i++) if (reserved[i]) occupied[i] = 1;
  const at = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= H ? T.WALL : grid[ty * W + tx]);
  const isPlainFloor = (tx, ty) => { const v = at(tx, ty); return v === T.FLOOR || v === T.RUG; };
  const wp = (t) => t * TILE + TILE / 2; // tile -> world pixel centre
  const spawnDist = (tx, ty) => Math.hypot(tx - startRoom.cx, ty - startRoom.cy);

  const props = [];
  const decor = [];
  const lights = [];
  const hazards = [];
  const enemies = [];

  // stairs
  props.push({ type: 'stairsUp', x: wp(startRoom.cx), y: wp(startRoom.cy) });
  props.push({ type: 'stairsDown', x: wp(exitRoom.cx), y: wp(exitRoom.cy), sealed: boss });
  occupied[startRoom.cy * W + startRoom.cx] = 2;
  occupied[exitRoom.cy * W + exitRoom.cx] = 2;
  const spawn = { x: wp(startRoom.cx), y: wp(startRoom.cy + 1) + 4 };
  if (!isWalkableId(at(startRoom.cx, startRoom.cy + 1))) spawn.y = wp(startRoom.cy);

  // ---- wall mounted lights and banners (on wall tiles whose south neighbour is floor)
  const lightKind = theme.lightProps;
  const lit = [];
  const faceCands = [];
  for (let ty = 1; ty < H - 1; ty++) for (let tx = 1; tx < W - 1; tx++) {
    if (grid[ty * W + tx] === T.WALL && isPlainFloor(tx, ty + 1) && grid[(ty - 1) * W + tx] === T.WALL) faceCands.push([tx, ty]);
  }
  decoRng.shuffle(faceCands);
  for (const [tx, ty] of faceCands) {
    if (lit.some(([lx, ly]) => Math.abs(lx - tx) + Math.abs(ly - ty) < 7)) continue;
    const inRoom = zone[(ty + 1) * W + tx] >= 0;
    if (!inRoom && !decoRng.chance(0.35)) continue;
    lit.push([tx, ty]);
    const color = theme.torch;
    props.push({ type: 'wallTorch', x: wp(tx), y: ty * TILE + TILE, color });
    lights.push({ x: wp(tx), y: ty * TILE + TILE + 4, color, radius: 118, intensity: 1.0, flicker: 1 });
  }
  for (const [tx, ty] of faceCands) {
    if (lit.some(([lx, ly]) => lx === tx && ly === ty)) continue;
    if (decoRng.chance(0.07)) decor.push({ type: 'banner', x: wp(tx), y: ty * TILE + TILE, v: decoRng.int(0, 3) });
    else if (decoRng.chance(0.06)) decor.push({ type: 'wallChains', x: wp(tx), y: ty * TILE + TILE, v: decoRng.int(0, 2) });
  }

  // ---- per-room population of props
  const randomTileIn = (r, rng, test, tries = 30) => {
    for (let k = 0; k < tries; k++) {
      const tx = rng.int(r.x + 1, r.x + r.w - 2), ty = rng.int(r.y + 1, r.y + r.h - 2);
      if (zone[ty * W + tx] !== r.id && r.shape !== 'arena') continue;
      if (test(tx, ty)) return [tx, ty];
    }
    return null;
  };
  const freeFloor = (tx, ty) => isPlainFloor(tx, ty) && !occupied[ty * W + tx];
  const freeFloorClear = (tx, ty) => {
    if (!freeFloor(tx, ty)) return false;
    // keep props from sealing narrow passages: require most neighbours to be walkable
    let open = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (isWalkableId(at(tx + ox, ty + oy))) open++;
    return open >= 8;
  };

  for (const r of rooms) {
    const area = r.w * r.h;
    // free-standing lights
    if (r.kind !== 'arena') {
      const nLights = area > 80 ? 2 : 1;
      for (let k = 0; k < nLights; k++) {
        if (!decoRng.chance(0.65)) continue;
        const kind = decoRng.pick(lightKind);
        if (kind === 'torch') continue;
        const p = randomTileIn(r, decoRng, freeFloorClear);
        if (!p) continue;
        occupied[p[1] * W + p[0]] = 1;
        props.push({ type: kind, x: wp(p[0]), y: wp(p[1]), v: decoRng.int(0, 3) });
        const col = kind === 'glowcap' ? '#5fffd0' : kind === 'crystal' ? '#b88cff' : kind === 'candles' ? '#ffcf7a' : '#ff9a3c';
        const rad = kind === 'candles' ? 70 : kind === 'brazier' ? 130 : 96;
        lights.push({ x: wp(p[0]), y: wp(p[1]) - 6, color: col, radius: rad, intensity: kind === 'candles' ? 0.75 : 0.95, flicker: kind === 'brazier' || kind === 'candles' ? 1 : 0.25 });
      }
    } else {
      // arena braziers at the corners
      for (const [tx, ty] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) {
        if (!isPlainFloor(tx, ty)) continue;
        occupied[ty * W + tx] = 1;
        props.push({ type: 'brazier', x: wp(tx), y: wp(ty), v: 0 });
        lights.push({ x: wp(tx), y: wp(ty) - 6, color: '#ff9a3c', radius: 140, intensity: 1, flicker: 1 });
      }
    }

    // breakables clustered near walls
    if (r.kind !== 'start') {
      const nBreak = decoRng.int(0, Math.min(5, 1 + Math.floor(area / 25)));
      for (let k = 0; k < nBreak; k++) {
        const p = randomTileIn(r, decoRng, (tx, ty) => freeFloorClear(tx, ty) && (!isWalkableId(at(tx - 2, ty)) || !isWalkableId(at(tx + 2, ty)) || !isWalkableId(at(tx, ty - 2))));
        if (!p) continue;
        occupied[p[1] * W + p[0]] = 1;
        let type = decoRng.pick(theme.breakables);
        if (type === 'barrel' && decoRng.chance(theme.id === 'forge' ? 0.55 : 0.25)) type = 'powderKeg';
        props.push({ type, x: wp(p[0]) + decoRng.int(-3, 3), y: wp(p[1]) + decoRng.int(-2, 2), v: decoRng.int(0, 3) });
      }
    }

    // standing decor with colliders
    if (r.kind !== 'arena' && decoRng.chance(0.55)) {
      const standing = { catacombs: ['coffin', 'grave', 'statue'], fungal: ['sporeStalk', 'statue', 'stump'], forge: ['anvil', 'statue', 'ingotPile'], crystal: ['geodeCluster', 'statue', 'obelisk'] }[theme.id];
      const p = randomTileIn(r, decoRng, freeFloorClear);
      if (p) { occupied[p[1] * W + p[0]] = 1; props.push({ type: decoRng.pick(standing), x: wp(p[0]), y: wp(p[1]), v: decoRng.int(0, 3) }); }
    }

    // floor decor (no collision, baked into the floor layer)
    const nDecor = Math.floor(area / 7) + decoRng.int(0, 3);
    for (let k = 0; k < nDecor; k++) {
      const p = randomTileIn(r, decoRng, (tx, ty) => isWalkableId(at(tx, ty)) && at(tx, ty) !== T.LIQUID, 12);
      if (!p) continue;
      decor.push({ type: decoRng.pick(theme.decor), x: p[0] * TILE + decoRng.int(2, 14), y: p[1] * TILE + decoRng.int(2, 14), v: decoRng.int(0, 7) });
    }
  }

  // cobwebs / roots in inner corners anywhere
  for (let ty = 2; ty < H - 2; ty++) for (let tx = 2; tx < W - 2; tx++) {
    if (!isPlainFloor(tx, ty)) continue;
    const n = at(tx, ty - 1) === T.WALL, w = at(tx - 1, ty) === T.WALL, e = at(tx + 1, ty) === T.WALL;
    if (n && (w || e) && decoRng.chance(0.3)) decor.push({ type: theme.id === 'fungal' ? 'roots' : 'cobweb', x: tx * TILE + (w ? 0 : TILE), y: ty * TILE, v: w ? 0 : 1, corner: true });
  }

  // ---- chests
  const chestRooms = [];
  if (treasureRoom) chestRooms.push([treasureRoom, 'gilded']);
  const chestCount = 1 + popRng.int(0, 2);
  for (let k = 0; k < chestCount; k++) {
    const r = popRng.pick(rooms.filter((q) => q.kind !== 'start' && q.kind !== 'arena'));
    if (r) chestRooms.push([r, popRng.chance(0.12 + depth * 0.01) ? 'gilded' : 'wood']);
  }
  for (const [r, tier] of chestRooms) {
    const p = (r === treasureRoom ? [r.cx, r.cy - 1] : null) || randomTileIn(r, popRng, freeFloorClear);
    const tp = p && freeFloor(p[0], p[1]) ? p : randomTileIn(r, popRng, freeFloorClear);
    if (!tp) continue;
    occupied[tp[1] * W + tp[0]] = 1;
    props.push({ type: 'chest', tier, x: wp(tp[0]), y: wp(tp[1]) });
  }

  // ---- shrine
  if (shrineRoom) {
    const kinds = ['might', 'haste', 'warding', 'fortune', 'renewal'];
    const kind = popRng.pick(kinds);
    occupied[shrineRoom.cy * W + shrineRoom.cx] = 1;
    props.push({ type: 'shrine', kind, x: wp(shrineRoom.cx), y: wp(shrineRoom.cy) });
  }

  // ---- traps / hazards
  const trapCount = Math.min(16, 3 + Math.floor(depth * 0.6) + popRng.int(0, 3));
  let placedTraps = 0;
  for (let k = 0; k < trapCount * 6 && placedTraps < trapCount; k++) {
    const tx = popRng.int(2, W - 3), ty = popRng.int(2, H - 3);
    if (!freeFloor(tx, ty) || dist[ty * W + tx] < 0 || spawnDist(tx, ty) < 7) continue;
    const r = zone[ty * W + tx] >= 0 ? rooms[zone[ty * W + tx]] : null;
    if (r && r.kind === 'arena') continue;
    occupied[ty * W + tx] = 1;
    const kind = theme.trap;
    hazards.push({ type: kind, x: wp(tx), y: wp(ty), phase: popRng.float(0, 3) });
    placedTraps++;
    // spike traps like to come in short rows inside corridors
    if (kind === 'spikes' && !r && popRng.chance(0.5)) {
      for (const [dx, dy] of DIRS4) {
        if (freeFloor(tx + dx, ty + dy) && popRng.chance(0.5)) {
          occupied[(ty + dy) * W + tx + dx] = 1;
          hazards.push({ type: kind, x: wp(tx + dx), y: wp(ty + dy), phase: hazards[hazards.length - 1].phase });
        }
      }
    }
  }

  // ---- enemies
  const pool = unlockedArchetypes(depth);
  const themeBias = {
    catacombs: { grunt: 1.3, archer: 1.2, skitter: 1.0, bloater: 0.8, brute: 0.8, caster: 0.8 },
    fungal: { grunt: 1.0, archer: 1.1, skitter: 1.3, bloater: 1.4, brute: 0.9, caster: 0.9 },
    forge: { grunt: 1.0, archer: 1.0, skitter: 1.3, bloater: 1.1, brute: 1.4, caster: 1.0 },
    crystal: { grunt: 0.9, archer: 1.2, skitter: 1.1, bloater: 1.0, brute: 1.1, caster: 1.5 },
  }[theme.id];
  const weights = pool.map((id) => [id, ARCHETYPES[id].weight * (themeBias[id] || 1)]);
  const budget = Math.min(78, Math.round((12 + depth * 2.3) * (boss ? 0.6 : 1))) + popRng.int(0, 4);
  const eChance = eliteChance(depth);
  const rollElite = () => {
    const n = 1 + (depth >= 8 && popRng.chance(0.45) ? 1 : 0) + (depth >= 16 && popRng.chance(0.4) ? 1 : 0);
    const mods = popRng.shuffle(ELITE_MODS.map((m) => m.id)).slice(0, n);
    return mods;
  };
  const spawnRooms = rooms.filter((r) => r.kind !== 'start' && r.kind !== 'arena');
  const totalArea = spawnRooms.reduce((s, r) => s + r.w * r.h, 0) || 1;
  let spawned = 0;
  let packId = 0;
  for (const r of popRng.shuffle(spawnRooms.slice())) {
    if (spawned >= budget) break;
    const share = Math.max(1, Math.round(budget * (r.w * r.h) / totalArea * popRng.float(0.7, 1.3)));
    let left = Math.min(share, budget - spawned);
    while (left > 0) {
      const arch = popRng.weighted(weights);
      const def = ARCHETYPES[arch];
      const packSize = def.pack ? popRng.int(def.pack[0], def.pack[1]) : popRng.int(1, 3);
      const elite = popRng.chance(eChance);
      packId++;
      for (let m = 0; m < packSize && left > 0; m++) {
        const p = randomTileIn(r, popRng, (tx, ty) => {
          const v = at(tx, ty);
          return (v === T.FLOOR || v === T.RUG || v === T.WATER) && !occupied[ty * W + tx] && spawnDist(tx, ty) > 9;
        });
        if (!p) { left = 0; break; }
        occupied[p[1] * W + p[0]] = 1;
        const memberArch = m === 0 || arch === 'skitter' ? arch : (popRng.chance(0.6) ? arch : popRng.weighted(weights));
        enemies.push({ arch: memberArch, x: wp(p[0]), y: wp(p[1]), elite: m === 0 && elite ? rollElite() : null, pack: packId });
        left--; spawned++;
      }
    }
  }
  // a few corridor wanderers
  const wanderers = Math.floor(depth / 3) + popRng.int(0, 2);
  for (let k = 0, tries = 0; k < wanderers && tries < 200; tries++) {
    const tx = popRng.int(2, W - 3), ty = popRng.int(2, H - 3);
    if (zone[ty * W + tx] !== -1 || !freeFloor(tx, ty) || dist[ty * W + tx] < 0 || spawnDist(tx, ty) < 12) continue;
    occupied[ty * W + tx] = 1;
    enemies.push({ arch: popRng.weighted(weights), x: wp(tx), y: wp(ty), elite: null, pack: ++packId, wander: true });
    k++;
  }

  let bossSpawn = null;
  if (boss) {
    const arena = rooms[0];
    bossSpawn = { id: theme.boss, x: wp(arena.bossX), y: wp(arena.bossY) };
  }

  // exit-room glow
  lights.push({ x: wp(exitRoom.cx), y: wp(exitRoom.cy), color: boss ? '#ff5a3a' : '#7ab8ff', radius: 110, intensity: 0.9, flicker: 0.2 });
  lights.push({ x: wp(startRoom.cx), y: wp(startRoom.cy), color: '#ffd9a0', radius: 90, intensity: 0.7, flicker: 0.1 });

  return {
    seed, worldSeed, depth, W, H,
    tiles: grid,
    zone,
    themeIndex: themeIndexForDepth(depth),
    themeId: theme.id,
    boss,
    rooms: rooms.map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, cx: r.cx, cy: r.cy, shape: r.shape, kind: r.kind })),
    start: { x: startRoom.cx, y: startRoom.cy },
    exit: { x: exitRoom.cx, y: exitRoom.cy },
    spawn,
    props, decor, lights, hazards, enemies, bossSpawn,
  };
}

/** Structural validation used by tests and a runtime self-check. Returns an array of problems. */
export function validateFloor(f) {
  const problems = [];
  const { W, H, tiles } = f;
  if (tiles.length !== W * H) problems.push('tile array size mismatch');
  for (let x = 0; x < W; x++) {
    if (tiles[x] !== T.WALL || tiles[(H - 1) * W + x] !== T.WALL) { problems.push('open border (horizontal)'); break; }
  }
  for (let y = 0; y < H; y++) {
    if (tiles[y * W] !== T.WALL || tiles[y * W + W - 1] !== T.WALL) { problems.push('open border (vertical)'); break; }
  }
  const inB = (p) => p.x >= 1 && p.y >= 1 && p.x < W - 1 && p.y < H - 1;
  if (!inB(f.start)) problems.push('start out of bounds');
  if (!inB(f.exit)) problems.push('exit out of bounds');
  for (const r of f.rooms) {
    if (r.x < 1 || r.y < 1 || r.x + r.w > W - 1 || r.y + r.h > H - 1) problems.push(`room ${r.id} out of bounds`);
  }
  const d = bfs(tiles, W, H, f.start.x, f.start.y);
  if (d[f.exit.y * W + f.exit.x] < 0) problems.push('exit unreachable');
  const safe = bfs(tiles, W, H, f.start.x, f.start.y, passSafe);
  if (safe[f.exit.y * W + f.exit.x] < 0) problems.push('exit only reachable through hazards');
  for (const r of f.rooms) if (d[r.cy * W + r.cx] < 0) problems.push(`room ${r.id} isolated`);
  for (let i = 0; i < tiles.length; i++) if (isWalkableId(tiles[i]) && d[i] < 0) { problems.push('isolated walkable pocket'); break; }
  const tileAtPx = (x, y) => tiles[Math.floor(y / TILE) * W + Math.floor(x / TILE)];
  if (!isWalkableId(tileAtPx(f.spawn.x, f.spawn.y))) problems.push('spawn not walkable');
  for (const e of f.enemies) if (!isWalkableId(tileAtPx(e.x, e.y))) { problems.push('enemy inside wall'); break; }
  if (f.boss && !f.bossSpawn) problems.push('boss floor without guardian');
  return problems;
}

/** Stable fingerprint of a layout (used by determinism tests). */
export function layoutHash(f) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < f.tiles.length; i++) h = Math.imul(h ^ f.tiles[i], 16777619) >>> 0;
  for (const e of f.enemies) h = Math.imul(h ^ (e.x * 31 + e.y), 16777619) >>> 0;
  return h >>> 0;
}
