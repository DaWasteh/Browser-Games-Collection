// An Area is the one loaded location (the town or the current dungeon floor) with all its
// runtime entities. Only the current area is kept in memory.

import { TILE } from '../config.js';
import { TileMap } from './map.js';
import { FlowField } from './pathfield.js';
import { T } from './tiles.js';
import { TileLayer, TOWN_THEME } from '../fx/tiles.js';
import { buildTown, TOWN_NAME } from '../gen/town.js';
import { generateFloor, validateFloor } from '../gen/dungeon.js';
import { THEMES, floorTitle } from '../data/themes.js';
import { Prop, Trap } from '../entities/props.js';
import { Enemy, Boss } from '../entities/enemy.js';
import { Npc } from '../entities/npc.js';

export class Area {
  constructor() {
    this.enemies = [];
    this.projectiles = [];
    this.loot = [];
    this.effects = [];
    this.groundEffects = [];
    this.props = [];
    this.traps = [];
    this.npcs = [];
    this.lights = [];
    this.boss = null;
    this.depth = 0;
    this.exploreVersion = 1;
  }

  static town() {
    const a = new Area();
    const t = buildTown();
    a.type = 'town';
    a.name = TOWN_NAME;
    a.theme = TOWN_THEME;
    a.W = t.W; a.H = t.H;
    a.map = new TileMap(t.W, t.H, t.tiles);
    a.tiles = new TileLayer({ W: t.W, H: t.H, tiles: t.tiles, decor: t.decor, town: true, tallWalls: true });
    a.ambient = [92, 80, 112];
    a.fogColor = [40, 50, 80];
    a.lights = t.lights;
    for (const d of t.props) a.addProp(new Prop(d));
    a.npcs = t.npcs.map((n) => new Npc(n));
    a.spawn = t.spawn;
    a.gateSpawn = t.gateSpawn;
    a.explored = new Uint8Array(t.W * t.H).fill(1);
    return a;
  }

  static dungeon(worldSeed, depth) {
    const a = new Area();
    const f = generateFloor(worldSeed, depth);
    const problems = validateFloor(f);
    if (problems.length) console.warn('Floor validation:', problems);
    const theme = THEMES[f.themeIndex];
    a.type = 'dungeon';
    a.depth = depth;
    a.floor = f;
    a.name = `Floor ${depth} — ${floorTitle(depth)}`;
    a.theme = theme;
    a.W = f.W; a.H = f.H;
    a.map = new TileMap(f.W, f.H, f.tiles);
    a.tiles = new TileLayer({ W: f.W, H: f.H, tiles: f.tiles, decor: f.decor, theme, tallWalls: true });
    const cycle = Math.floor((depth - 1) / 20);
    const dim = Math.max(0.7, 1 - cycle * 0.1);
    a.ambient = theme.ambient.map((v) => Math.round(v * dim * 1.25));
    a.fogColor = theme.fog;
    a.lights = f.lights.slice();
    // liquid tiles glow
    a.liquidGlow = [];
    for (let i = 0; i < f.tiles.length; i++) {
      if (f.tiles[i] === T.LIQUID && (i % 2 === 0)) a.liquidGlow.push({ x: (i % f.W) * TILE + 8, y: Math.floor(i / f.W) * TILE + 8, radius: 34, color: theme.hazardLiquid.glow, intensity: 0.28 });
    }
    for (const d of f.props) a.addProp(new Prop(d));
    for (const d of f.hazards) a.traps.push(new Trap(d, depth));
    for (const d of f.enemies) a.enemies.push(new Enemy(d, depth, theme.enemySkin));
    if (f.bossSpawn) {
      a.boss = new Boss(f.bossSpawn, depth);
      a.enemies.push(a.boss);
    }
    a.field = new FlowField(a.map);
    a.spawn = f.spawn;
    a.explored = new Uint8Array(f.W * f.H);
    return a;
  }

  addProp(p) {
    this.props.push(p);
    if (p.solid && p.r) this.map.addSolidProp(p);
  }

  /** Per-tile exploration canvas (1px per tile) used for fog of war and the minimap. */
  fogCanvas() {
    if (!this._fog) {
      this._fog = document.createElement('canvas');
      this._fog.width = this.W; this._fog.height = this.H;
      this._fogCtx = this._fog.getContext('2d');
      this._fogImg = this._fogCtx.createImageData(this.W, this.H);
    }
    if (this._fogVersion !== this.exploreVersion) {
      this._fogVersion = this.exploreVersion;
      const d = this._fogImg.data;
      const e = this.explored;
      for (let i = 0; i < e.length; i++) {
        d[i * 4 + 3] = e[i] ? 0 : 255;
      }
      this._fogCtx.putImageData(this._fogImg, 0, 0);
    }
    return this._fog;
  }

  /** Mark exploration around a point; returns true if anything new was revealed. */
  explore(x, y, radius) {
    if (this.type === 'town') return false;
    const changed = this.map.revealFrom(x, y, radius, this.explored, 90);
    // reveal wall tiles next to explored floor (so rooms show their outline, including tall faces)
    if (changed) {
      const { W, H } = this;
      const tx0 = Math.max(1, Math.floor((x - radius) / TILE) - 1), tx1 = Math.min(W - 2, Math.floor((x + radius) / TILE) + 1);
      const ty0 = Math.max(1, Math.floor((y - radius) / TILE) - 1), ty1 = Math.min(H - 3, Math.floor((y + radius) / TILE) + 1);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * W + tx;
        if (!this.explored[i] || this.map.tiles[i] === T.WALL) continue;
        for (let oy = -2; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const j = (ty + oy) * W + tx + ox;
          if (this.map.tiles[j] === T.WALL) this.explored[j] = 1;
        }
      }
      this.exploreVersion++;
    }
    return changed;
  }

  /** Remove dead entities and enforce caps (called every frame). */
  cleanup() {
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead);
    if (this.loot.some((l) => l.dead)) this.loot = this.loot.filter((l) => !l.dead);
    if (this.effects.some((e) => e.dead)) this.effects = this.effects.filter((e) => !e.dead);
    if (this.groundEffects.some((e) => e.dead)) this.groundEffects = this.groundEffects.filter((e) => !e.dead);
    if (this.projectiles.length > 260) this.projectiles.splice(0, this.projectiles.length - 260);
    if (this.effects.length > 200) this.effects.splice(0, this.effects.length - 200);
    if (this.groundEffects.length > 80) this.groundEffects.splice(0, this.groundEffects.length - 80);
    if (this.loot.length > 140) {
      // merge away the oldest gold piles first
      const idx = this.loot.findIndex((l) => l.kind === 'gold');
      if (idx >= 0) this.loot.splice(idx, 1); else this.loot.shift();
    }
  }
}
