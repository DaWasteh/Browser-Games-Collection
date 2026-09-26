// Tile map queries: collision, line of sight and ray casting. No rendering here.

import { TILE } from '../config.js';
import { T, isWalkableId, isOpaqueId, blocksProjectileId } from './tiles.js';

export class TileMap {
  constructor(W, H, tiles) {
    this.W = W;
    this.H = H;
    this.tiles = tiles;
    this.solidProps = new Map(); // tile index -> [{x, y, r}]
  }

  id(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return T.WALL;
    return this.tiles[ty * this.W + tx];
  }

  idAt(x, y) { return this.id(Math.floor(x / TILE), Math.floor(y / TILE)); }
  walkable(tx, ty) { return isWalkableId(this.id(tx, ty)); }
  opaque(tx, ty) { return isOpaqueId(this.id(tx, ty)); }
  blocksProjectileAt(x, y) { return blocksProjectileId(this.idAt(x, y)); }

  addSolidProp(p) {
    const k = Math.floor(p.y / TILE) * this.W + Math.floor(p.x / TILE);
    if (!this.solidProps.has(k)) this.solidProps.set(k, []);
    this.solidProps.get(k).push(p);
  }

  removeSolidProp(p) {
    const k = Math.floor(p.y / TILE) * this.W + Math.floor(p.x / TILE);
    const arr = this.solidProps.get(k);
    if (!arr) return;
    const i = arr.indexOf(p);
    if (i >= 0) arr.splice(i, 1);
  }

  /** Push a circle out of blocking tiles. `avoid` adds extra blocking ids (e.g. hazards for AI). */
  resolveCircle(e, r, avoidHazard = false) {
    const x0 = Math.floor((e.x - r) / TILE), x1 = Math.floor((e.x + r) / TILE);
    const y0 = Math.floor((e.y - r) / TILE), y1 = Math.floor((e.y + r) / TILE);
    let hit = false;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const id = this.id(tx, ty);
      const blocked = !isWalkableId(id) || (avoidHazard && id === T.LIQUID);
      if (!blocked) continue;
      const nx = Math.max(tx * TILE, Math.min(e.x, tx * TILE + TILE));
      const ny = Math.max(ty * TILE, Math.min(e.y, ty * TILE + TILE));
      let dx = e.x - nx, dy = e.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        e.x += (dx / d) * (r - d);
        e.y += (dy / d) * (r - d);
      } else {
        // centre inside the tile: push out along the shortest axis
        const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
        dx = e.x - cx; dy = e.y - cy;
        if (Math.abs(dx) > Math.abs(dy)) e.x = dx > 0 ? tx * TILE + TILE + r : tx * TILE - r;
        else e.y = dy > 0 ? ty * TILE + TILE + r : ty * TILE - r;
      }
    }
    // solid props (circle vs circle)
    const ctx0 = Math.floor(e.x / TILE), cty0 = Math.floor(e.y / TILE);
    for (let ty = cty0 - 1; ty <= cty0 + 1; ty++) for (let tx = ctx0 - 1; tx <= ctx0 + 1; tx++) {
      const arr = this.solidProps.get(ty * this.W + tx);
      if (!arr) continue;
      for (const p of arr) {
        const dx = e.x - p.x, dy = e.y - p.y;
        const rr = r + p.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.01;
        e.x = p.x + (dx / d) * rr;
        e.y = p.y + (dy / d) * rr;
        hit = true;
      }
    }
    return hit;
  }

  /** Move a circle with sub-stepping so fast movement never tunnels through walls. */
  move(e, dx, dy, r, avoidHazard = false) {
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 3));
    const sx = dx / steps, sy = dy / steps;
    let blocked = false;
    for (let i = 0; i < steps; i++) {
      e.x += sx;
      if (this.resolveCircle(e, r, avoidHazard)) blocked = true;
      e.y += sy;
      if (this.resolveCircle(e, r, avoidHazard)) blocked = true;
    }
    return blocked;
  }

  /** True when a straight line between two points is not blocked by opaque tiles. */
  lineOfSight(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1) return true;
    const steps = Math.ceil(len / 6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (isOpaqueId(this.idAt(x0 + dx * t, y0 + dy * t))) return false;
    }
    return true;
  }

  /** Distance a ray travels before hitting an opaque tile (DDA), capped at maxDist. */
  castRay(x, y, ang, maxDist) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (tx + 1) * TILE - x : x - tx * TILE) / Math.abs(dx)) : Infinity;
    let tMaxY = dy !== 0 ? ((dy > 0 ? (ty + 1) * TILE - y : y - ty * TILE) / Math.abs(dy)) : Infinity;
    let t = 0;
    for (let guard = 0; guard < 200; guard++) {
      if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDeltaX; tx += stepX; }
      else { t = tMaxY; tMaxY += tDeltaY; ty += stepY; }
      if (t >= maxDist) return maxDist;
      if (isOpaqueId(this.id(tx, ty))) return t;
    }
    return maxDist;
  }

  /** Visibility polygon for a light: array of [x, y] points. `pen` lets light bleed onto wall faces. */
  lightPolygon(x, y, radius, rays = 96, pen = 10) {
    const pts = new Array(rays);
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const d = Math.min(radius, this.castRay(x, y, a, radius) + pen);
      pts[i] = [x + Math.cos(a) * d, y + Math.sin(a) * d];
    }
    return pts;
  }

  /** Visit tiles along rays (used for fog-of-war exploration). */
  revealFrom(x, y, radius, explored, rays = 72) {
    let changed = false;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const d = this.castRay(x, y, a, radius);
      const dx = Math.cos(a), dy = Math.sin(a);
      for (let s = 0; s <= d + TILE * 0.9; s += TILE * 0.5) {
        const tx = Math.floor((x + dx * s) / TILE), ty = Math.floor((y + dy * s) / TILE);
        if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) break;
        const k = ty * this.W + tx;
        if (!explored[k]) { explored[k] = 1; changed = true; }
      }
    }
    // also reveal wall faces two tiles above visible floor (tall walls)
    return changed;
  }

  randomWalkableNear(x, y, rng, radius = 3) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let k = 0; k < 30; k++) {
      const nx = tx + Math.round((rng() - 0.5) * 2 * radius), ny = ty + Math.round((rng() - 0.5) * 2 * radius);
      if (this.walkable(nx, ny) && this.id(nx, ny) !== T.LIQUID) return { x: nx * TILE + TILE / 2, y: ny * TILE + TILE / 2 };
    }
    return { x, y };
  }
}
