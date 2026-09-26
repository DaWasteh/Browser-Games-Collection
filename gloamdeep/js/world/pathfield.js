// Dijkstra/BFS flow field from the player's tile. All enemies share it, so pathfinding cost is
// independent of the number of enemies. Recomputed only when the player changes tile.

import { TILE } from '../config.js';
import { T, isWalkableId } from './tiles.js';

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

export class FlowField {
  constructor(map) {
    this.map = map;
    this.W = map.W;
    this.H = map.H;
    this.dist = new Int32Array(this.W * this.H).fill(-1);
    this.queue = new Int32Array(this.W * this.H);
    this.pass = new Uint8Array(this.W * this.H);
    for (let i = 0; i < this.pass.length; i++) {
      const id = map.tiles[i];
      this.pass[i] = isWalkableId(id) && id !== T.LIQUID ? 1 : 0;
    }
    this.srcX = -1;
    this.srcY = -1;
    this.maxDist = 60;
  }

  update(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx === this.srcX && ty === this.srcY) return;
    this.srcX = tx; this.srcY = ty;
    const { W, H, dist, queue, pass } = this;
    dist.fill(-1);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
    let head = 0, tail = 0;
    const s = ty * W + tx;
    dist[s] = 0;
    queue[tail++] = s;
    while (head < tail) {
      const i = queue[head++];
      const d = dist[i];
      if (d >= this.maxDist) continue;
      const x = i % W, y = (i / W) | 0;
      if (x > 0 && dist[i - 1] < 0 && pass[i - 1]) { dist[i - 1] = d + 1; queue[tail++] = i - 1; }
      if (x < W - 1 && dist[i + 1] < 0 && pass[i + 1]) { dist[i + 1] = d + 1; queue[tail++] = i + 1; }
      if (y > 0 && dist[i - W] < 0 && pass[i - W]) { dist[i - W] = d + 1; queue[tail++] = i - W; }
      if (y < H - 1 && dist[i + W] < 0 && pass[i + W]) { dist[i + W] = d + 1; queue[tail++] = i + W; }
    }
  }

  distanceAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return -1;
    return this.dist[ty * this.W + tx];
  }

  /**
   * Next waypoint (world px) towards the player, or null if unreachable.
   * Diagonal steps are only allowed when both orthogonal neighbours are open (no corner cutting).
   */
  next(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const { W, H, dist, pass } = this;
    const here = tx >= 0 && ty >= 0 && tx < W && ty < H ? dist[ty * W + tx] : -1;
    let best = -1, bestD = here >= 0 ? here : 1e9;
    for (let k = 0; k < 8; k++) {
      const nx = tx + N8[k][0], ny = ty + N8[k][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      const d = dist[ni];
      if (d < 0) continue;
      if (k >= 4 && (!pass[ty * W + nx] || !pass[ny * W + tx])) continue;
      if (d < bestD) { bestD = d; best = ni; }
    }
    if (best < 0) return null;
    return { x: (best % W) * TILE + TILE / 2, y: ((best / W) | 0) * TILE + TILE / 2, d: bestD };
  }

  /** Waypoint leading away from the player (for kiting ranged enemies). */
  away(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const { W, H, dist, pass } = this;
    let best = -1, bestD = tx >= 0 && ty >= 0 && tx < W && ty < H ? dist[ty * W + tx] : -1;
    for (let k = 0; k < 8; k++) {
      const nx = tx + N8[k][0], ny = ty + N8[k][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (!pass[ni] || dist[ni] < 0) continue;
      if (k >= 4 && (!pass[ty * W + nx] || !pass[ny * W + tx])) continue;
      if (dist[ni] > bestD) { bestD = dist[ni]; best = ni; }
    }
    if (best < 0) return null;
    return { x: (best % W) * TILE + TILE / 2, y: ((best / W) | 0) * TILE + TILE / 2 };
  }
}
