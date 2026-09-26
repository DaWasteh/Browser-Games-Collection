// Tile rendering: pre-rendered ground chunks (floors, wall faces, caps, pits, decor, decals)
// plus per-frame overlays (wall lips for occlusion, animated liquids).

import { TILE } from '../config.js';
import { T, isWalkableId } from '../world/tiles.js';
import { shade, hexToRgb } from '../core/math.js';
import { makeCanvas } from './sprites.js';
import { paintDecor } from './propArt.js';

const CHUNK = 16; // tiles per chunk side
const LIP = 6;

export const TOWN_THEME = {
  id: 'town',
  floor: ['#2f4a2c', '#2b4428', '#34502e', '#304a2a'],
  floorLine: '#243a22', floorHi: '#46663c',
  accent: '#5a8a3a', accent2: '#8aba5a',
  wallFace: '#5e5866', wallFaceDark: '#443f4c', wallMortar: '#2e2a34', wallCap: '#2a3a26', wallCapHi: '#4a6a3a',
  hazardLiquid: { color: '#1a3a5a', glow: '#4a8aba' },
};

function h2(x, y, s = 0) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ tile painters (16x16)

function paintFloorTile(g, x0, y0, theme, tx, ty) {
  const v = h2(tx, ty, 1);
  const base = theme.floor[Math.floor(v * theme.floor.length)];
  g.fillStyle = base;
  g.fillRect(x0, y0, TILE, TILE);
  const line = theme.floorLine;
  const pattern = Math.floor(h2(tx >> 1, ty >> 1, 7) * 4);
  g.fillStyle = line;
  if (pattern === 0) {
    // large slabs spanning 2x2 tiles
    if ((tx & 1) === 0) g.fillRect(x0, y0, 1, TILE);
    if ((ty & 1) === 0) g.fillRect(x0, y0, TILE, 1);
  } else if (pattern === 1) {
    // brick rows
    g.fillRect(x0, y0, TILE, 1); g.fillRect(x0, y0 + 8, TILE, 1);
    g.fillRect(x0 + ((ty & 1) ? 4 : 11), y0, 1, 8); g.fillRect(x0 + ((ty & 1) ? 12 : 3), y0 + 8, 1, 8);
  } else if (pattern === 2) {
    // square tiles
    g.fillRect(x0, y0, TILE, 1); g.fillRect(x0, y0, 1, TILE);
    g.fillRect(x0 + 8, y0, 1, TILE); g.fillRect(x0, y0 + 8, TILE, 1);
  } else {
    // irregular flagstones
    g.fillRect(x0, y0, TILE, 1); g.fillRect(x0, y0, 1, TILE);
    const cx = 5 + Math.floor(h2(tx, ty, 3) * 6);
    g.fillRect(x0 + cx, y0 + 1, 1, 7 + Math.floor(h2(tx, ty, 4) * 5));
    g.fillRect(x0 + 1, y0 + 9, cx, 1);
  }
  // grain
  for (let i = 0; i < 7; i++) {
    const px = Math.floor(h2(tx, ty, 10 + i) * TILE), py = Math.floor(h2(tx, ty, 20 + i) * TILE);
    g.fillStyle = i < 3 ? theme.floorHi : shade(base, 0.82);
    g.fillRect(x0 + px, y0 + py, 1, 1);
  }
  // bevel highlight on slab edges
  g.fillStyle = shade(base, 1.08);
  g.fillRect(x0 + 1, y0 + 1, TILE - 2, 1);
}

function paintTownGround(g, x0, y0, id, tx, ty, get) {
  const r = (s) => h2(tx, ty, s);
  if (id === T.GRASS || id === T.BLOCK) {
    const cols = TOWN_THEME.floor;
    g.fillStyle = cols[Math.floor(r(1) * cols.length)];
    g.fillRect(x0, y0, TILE, TILE);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = i < 4 ? '#3e6034' : i < 7 ? '#243a20' : '#4e7440';
      g.fillRect(x0 + Math.floor(r(10 + i) * 16), y0 + Math.floor(r(30 + i) * 16), 1, i < 4 ? 2 : 1);
    }
  } else if (id === T.COBBLE) {
    g.fillStyle = '#3a3640';
    g.fillRect(x0, y0, TILE, TILE);
    const stones = [[1, 1, 6, 5], [8, 1, 7, 4], [1, 7, 4, 4], [6, 6, 5, 5], [12, 6, 3, 5], [1, 12, 7, 3], [9, 12, 6, 3]];
    for (let i = 0; i < stones.length; i++) {
      const [sx, sy, sw, sh] = stones[i];
      const c = ['#5e5a64', '#56525c', '#66626c', '#524e58'][Math.floor(r(40 + i) * 4)];
      g.fillStyle = c; g.fillRect(x0 + sx, y0 + sy, sw, sh);
      g.fillStyle = shade(c, 1.18); g.fillRect(x0 + sx, y0 + sy, sw, 1);
      g.fillStyle = shade(c, 0.78); g.fillRect(x0 + sx, y0 + sy + sh - 1, sw, 1);
    }
  } else if (id === T.DIRT) {
    g.fillStyle = ['#4e3e2e', '#4a3a2a', '#524232'][Math.floor(r(1) * 3)];
    g.fillRect(x0, y0, TILE, TILE);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i < 4 ? '#5e4c38' : '#3e3024';
      g.fillRect(x0 + Math.floor(r(10 + i) * 16), y0 + Math.floor(r(30 + i) * 16), 1 + (i & 1), 1);
    }
  } else if (id === T.PLANK) {
    g.fillStyle = '#6a4a2e';
    g.fillRect(x0, y0, TILE, TILE);
    g.fillStyle = '#4a3220';
    for (let x = 0; x < 16; x += 4) g.fillRect(x0 + x, y0, 1, TILE);
    g.fillStyle = '#8a6a44';
    for (let x = 1; x < 16; x += 4) g.fillRect(x0 + x, y0, 1, TILE);
  } else if (id === T.DEEPWATER) {
    g.fillStyle = '#122236';
    g.fillRect(x0, y0, TILE, TILE);
    for (let i = 0; i < 3; i++) { g.fillStyle = '#1e3650'; g.fillRect(x0 + Math.floor(r(50 + i) * 12), y0 + Math.floor(r(60 + i) * 15), 4, 1); }
    // shore
    g.fillStyle = '#3a5a6a';
    if (get(tx, ty - 1) !== T.DEEPWATER) g.fillRect(x0, y0, TILE, 2);
    g.fillStyle = '#0a1420';
    if (get(tx, ty - 1) !== T.DEEPWATER) g.fillRect(x0, y0 + 2, TILE, 2);
  }
  // soft grass fringe over neighbouring ground types
  if (id === T.COBBLE || id === T.DIRT || id === T.PLANK) {
    g.fillStyle = '#34502e';
    const edges = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (let e = 0; e < 4; e++) {
      const [dx, dy] = edges[e];
      const n = get(tx + dx, ty + dy);
      if (n !== T.GRASS && n !== T.BLOCK) continue;
      for (let i = 0; i < 16; i++) {
        const depth = Math.floor(h2(tx * 3 + e, ty * 5 + i, 77) * 3);
        for (let k = 0; k < depth; k++) {
          const px = dx === 0 ? i : dx < 0 ? k : 15 - k;
          const py = dy === 0 ? i : dy < 0 ? k : 15 - k;
          g.fillRect(x0 + px, y0 + py, 1, 1);
        }
      }
    }
  }
}

function paintWallCap(g, x0, y0, theme, tx, ty, get) {
  g.fillStyle = theme.wallCap;
  g.fillRect(x0, y0, TILE, TILE);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i < 3 ? shade(theme.wallCap, 1.25) : shade(theme.wallCap, 0.75);
    g.fillRect(x0 + Math.floor(h2(tx, ty, 90 + i) * 15), y0 + Math.floor(h2(tx, ty, 100 + i) * 15), 2, 1);
  }
  g.fillStyle = theme.wallCapHi;
  const open = (x, y) => get(x, y) !== T.WALL;
  if (open(tx - 1, ty)) g.fillRect(x0, y0, 1, TILE);
  if (open(tx + 1, ty)) g.fillRect(x0 + TILE - 1, y0, 1, TILE);
  if (open(tx, ty + 1)) g.fillRect(x0, y0 + TILE - 1, TILE, 1);
}

function paintWallFace(g, x0, y0, theme, tx, ty, upper, get) {
  const face = upper ? shade(theme.wallFace, 0.86) : theme.wallFace;
  g.fillStyle = theme.wallMortar;
  g.fillRect(x0, y0, TILE, TILE);
  // bricks: 4px rows, 8px long, offset every other row
  for (let row = 0; row < 4; row++) {
    const off = ((row + ty * 4) & 1) ? 4 : 0;
    for (let bx = -off; bx < TILE; bx += 8) {
      const w = Math.min(7, TILE - Math.max(0, bx)) - (bx < 0 ? -bx : 0);
      const sx = Math.max(0, bx);
      if (w <= 0) continue;
      const k = h2(tx * 4 + ((bx + 8) >> 3), ty * 4 + row, 5);
      const col = k < 0.25 ? theme.wallFaceDark : k > 0.85 ? shade(face, 1.12) : face;
      g.fillStyle = col;
      g.fillRect(x0 + sx, y0 + row * 4, w, 3);
      g.fillStyle = shade(col, 1.18);
      g.fillRect(x0 + sx, y0 + row * 4, w, 1);
    }
  }
  // vertical light falloff: darker towards the floor for lower faces
  if (!upper) {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(x0, y0 + 13, TILE, 3);
  } else {
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(x0, y0, TILE, TILE);
  }
  // corners: side faces
  if (get(tx - 1, ty) !== T.WALL) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0, y0, 2, TILE); }
  if (get(tx + 1, ty) !== T.WALL) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x0 + TILE - 2, y0, 2, TILE); }
  // top edge where the face meets the cap
  if (upper || get(tx, ty - 1) !== T.WALL) {
    g.fillStyle = theme.wallCapHi;
    if (get(tx, ty - 1) !== T.WALL) g.fillRect(x0, y0, TILE, 1);
  }
  // moss / drips
  if (theme.accent && h2(tx, ty, 44) < 0.3) {
    g.fillStyle = theme.accent;
    const mx = Math.floor(h2(tx, ty, 45) * 12);
    g.fillRect(x0 + mx, y0, 3, 1);
    g.fillRect(x0 + mx + 1, y0 + 1, 1, 2 + Math.floor(h2(tx, ty, 46) * 4));
  }
}

function paintPit(g, x0, y0, theme, tx, ty, get) {
  g.fillStyle = '#040306';
  g.fillRect(x0, y0, TILE, TILE);
  if (isWalkableId(get(tx, ty - 1))) {
    g.fillStyle = theme.wallFaceDark;
    g.fillRect(x0, y0, TILE, 6);
    g.fillStyle = shade(theme.wallFaceDark, 0.6);
    g.fillRect(x0, y0 + 6, TILE, 3);
    g.fillStyle = shade(theme.wallFaceDark, 0.35);
    g.fillRect(x0, y0 + 9, TILE, 2);
    g.fillStyle = theme.floorHi;
    g.fillRect(x0, y0, TILE, 1);
  }
  g.fillStyle = shade(theme.floorHi, 0.8);
  if (isWalkableId(get(tx - 1, ty))) g.fillRect(x0, y0, 1, TILE);
  if (isWalkableId(get(tx + 1, ty))) g.fillRect(x0 + TILE - 1, y0, 1, TILE);
  if (isWalkableId(get(tx, ty + 1))) g.fillRect(x0, y0 + TILE - 1, TILE, 1);
  // dust motes far below
  g.fillStyle = '#16121c';
  g.fillRect(x0 + Math.floor(h2(tx, ty, 8) * 14), y0 + 10 + Math.floor(h2(tx, ty, 9) * 5), 1, 1);
}

function paintWater(g, x0, y0, tx, ty, get) {
  g.fillStyle = '#1c2c3c';
  g.fillRect(x0, y0, TILE, TILE);
  g.fillStyle = '#243a4e';
  for (let i = 0; i < 3; i++) g.fillRect(x0 + Math.floor(h2(tx, ty, 60 + i) * 12), y0 + Math.floor(h2(tx, ty, 70 + i) * 15), 4, 1);
  g.fillStyle = '#4a6a80';
  if (get(tx, ty - 1) !== T.WATER) g.fillRect(x0, y0, TILE, 1);
  if (get(tx - 1, ty) !== T.WATER) g.fillRect(x0, y0, 1, TILE);
  if (get(tx + 1, ty) !== T.WATER) g.fillRect(x0 + TILE - 1, y0, 1, TILE);
  if (get(tx, ty + 1) !== T.WATER) g.fillRect(x0, y0 + TILE - 1, TILE, 1);
}

function paintLiquid(g, x0, y0, theme, tx, ty, get) {
  const col = theme.hazardLiquid.color;
  g.fillStyle = shade(col, 0.75);
  g.fillRect(x0, y0, TILE, TILE);
  g.fillStyle = col;
  for (let i = 0; i < 4; i++) g.fillRect(x0 + Math.floor(h2(tx, ty, 80 + i) * 12), y0 + Math.floor(h2(tx, ty, 85 + i) * 14), 4, 2);
  g.fillStyle = shade(col, 0.45);
  if (get(tx, ty - 1) !== T.LIQUID) g.fillRect(x0, y0, TILE, 2);
  if (get(tx - 1, ty) !== T.LIQUID) g.fillRect(x0, y0, 1, TILE);
  if (get(tx + 1, ty) !== T.LIQUID) g.fillRect(x0 + TILE - 1, y0, 1, TILE);
}

function paintRug(g, x0, y0, tx, ty, get) {
  g.fillStyle = '#5a1a26';
  g.fillRect(x0, y0, TILE, TILE);
  g.fillStyle = '#7a2a36';
  for (let i = 0; i < 16; i += 4) g.fillRect(x0 + i, y0 + ((i >> 2) & 1) * 4 + 4, 2, 2);
  g.fillStyle = '#c9a45a';
  if (get(tx, ty - 1) !== T.RUG) g.fillRect(x0, y0 + 1, TILE, 1);
  if (get(tx, ty + 1) !== T.RUG) g.fillRect(x0, y0 + TILE - 2, TILE, 1);
  if (get(tx - 1, ty) !== T.RUG) g.fillRect(x0 + 1, y0, 1, TILE);
  if (get(tx + 1, ty) !== T.RUG) g.fillRect(x0 + TILE - 2, y0, 1, TILE);
}

/** Multiply a hex colour by f (keeps hue; the lighting pass darkens everything again). */
function mul(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Dungeon palettes are authored dark; since the scene is multiplied by the light buffer the
 * ground is stored brighter so lit areas read clearly while unlit areas stay gloomy.
 */
function brightenTheme(t) {
  return {
    ...t,
    floor: t.floor.map((c) => mul(c, 1.55)),
    floorLine: mul(t.floorLine, 1.45),
    floorHi: mul(t.floorHi, 1.5),
    wallFace: mul(t.wallFace, 1.5),
    wallFaceDark: mul(t.wallFaceDark, 1.45),
    wallMortar: mul(t.wallMortar, 1.35),
    wallCap: mul(t.wallCap, 1.4),
    wallCapHi: mul(t.wallCapHi, 1.4),
    accent: mul(t.accent, 1.15),
  };
}

// ------------------------------------------------------------------ renderer

export class TileLayer {
  /**
   * area: { W, H, tiles, decor, town:boolean, theme }
   */
  constructor(area) {
    this.area = area;
    this.W = area.W;
    this.H = area.H;
    this.tiles = area.tiles;
    this.theme = area.town ? TOWN_THEME : brightenTheme(area.theme);
    this.cw = Math.ceil(this.W / CHUNK);
    this.ch = Math.ceil(this.H / CHUNK);
    this.chunks = [];
    this.liquids = [];
    this.waters = [];
    this.lipRows = [];
    this.build();
  }

  get(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return T.WALL;
    return this.tiles[ty * this.W + tx];
  }

  build() {
    const get = (x, y) => this.get(x, y);
    const theme = this.theme;
    for (let cy = 0; cy < this.ch; cy++) for (let cx = 0; cx < this.cw; cx++) {
      const [c, g] = makeCanvas(CHUNK * TILE, CHUNK * TILE);
      for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
        const tx = cx * CHUNK + lx, ty = cy * CHUNK + ly;
        if (tx >= this.W || ty >= this.H) continue;
        const id = this.tiles[ty * this.W + tx];
        const x0 = lx * TILE, y0 = ly * TILE;
        if (id === T.WALL) {
          if (get(tx, ty + 1) !== T.WALL) paintWallFace(g, x0, y0, theme, tx, ty, false, get);
          else if (this.area.tallWalls !== false && get(tx, ty + 2) !== T.WALL && get(tx, ty + 1) === T.WALL) paintWallFace(g, x0, y0, theme, tx, ty, true, get);
          else paintWallCap(g, x0, y0, theme, tx, ty, get);
        } else if (this.area.town) {
          paintTownGround(g, x0, y0, id, tx, ty, get);
        } else if (id === T.PIT) {
          paintPit(g, x0, y0, theme, tx, ty, get);
        } else if (id === T.WATER) {
          paintWater(g, x0, y0, tx, ty, get);
        } else if (id === T.LIQUID) {
          paintLiquid(g, x0, y0, theme, tx, ty, get);
        } else if (id === T.RUG) {
          paintFloorTile(g, x0, y0, theme, tx, ty);
          paintRug(g, x0, y0, tx, ty, get);
        } else {
          paintFloorTile(g, x0, y0, theme, tx, ty);
        }
        if (id === T.LIQUID) this.liquids.push(ty * this.W + tx);
        if (id === T.WATER) this.waters.push(ty * this.W + tx);
        // contact shadows cast by walls onto walkable ground
        if (id !== T.WALL && id !== T.PIT && id !== T.DEEPWATER) {
          if (get(tx, ty - 1) === T.WALL) {
            for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(0,0,0,${0.42 - k * 0.07})`; g.fillRect(x0, y0 + k, TILE, 1); }
          }
          if (get(tx - 1, ty) === T.WALL) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x0, y0, 2, TILE); }
          if (get(tx + 1, ty) === T.WALL) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x0 + TILE - 2, y0, 2, TILE); }
        }
      }
      this.chunks.push({ c, g, x: cx * CHUNK * TILE, y: cy * CHUNK * TILE });
    }
    // bake decor
    for (const d of this.area.decor || []) {
      const ch = this.chunkAt(d.x, d.y);
      if (!ch) continue;
      ch.g.save();
      ch.g.translate(-ch.x, -ch.y);
      paintDecor(ch.g, d, theme);
      ch.g.restore();
      // decor near chunk borders may spill: paint into the neighbour too
      const lx = d.x - ch.x, ly = d.y - ch.y;
      if (lx < 10 || ly < 16 || lx > CHUNK * TILE - 10 || ly > CHUNK * TILE - 10) {
        for (const other of this.chunks) {
          if (other === ch) continue;
          if (d.x > other.x - 12 && d.x < other.x + CHUNK * TILE + 12 && d.y > other.y - 18 && d.y < other.y + CHUNK * TILE + 12) {
            other.g.save(); other.g.translate(-other.x, -other.y); paintDecor(other.g, d, theme); other.g.restore();
          }
        }
      }
    }
    // lips: wall tiles whose north neighbour is not a wall get a cap lip drawn over the tile above
    for (let ty = 0; ty < this.H; ty++) {
      const row = [];
      for (let tx = 0; tx < this.W; tx++) {
        if (this.tiles[ty * this.W + tx] === T.WALL && ty > 0 && this.tiles[(ty - 1) * this.W + tx] !== T.WALL) row.push(tx);
      }
      this.lipRows.push(row);
    }
    this.lipCanvas = this._lipSprite();
  }

  _lipSprite() {
    const [c, g] = makeCanvas(TILE * 3, LIP);
    const t = this.theme;
    // three variants: left end, middle, right end are chosen per neighbour
    for (let v = 0; v < 3; v++) {
      const x0 = v * TILE;
      g.fillStyle = t.wallCap; g.fillRect(x0, 0, TILE, LIP);
      g.fillStyle = t.wallCapHi; g.fillRect(x0, 0, TILE, 1);
      g.fillStyle = shade(t.wallCap, 1.2);
      g.fillRect(x0 + 3 + v * 3, 2, 3, 1);
      g.fillStyle = shade(t.wallCap, 0.7); g.fillRect(x0, LIP - 1, TILE, 1);
    }
    return c;
  }

  chunkAt(x, y) {
    const cx = Math.floor(x / (CHUNK * TILE)), cy = Math.floor(y / (CHUNK * TILE));
    if (cx < 0 || cy < 0 || cx >= this.cw || cy >= this.ch) return null;
    return this.chunks[cy * this.cw + cx];
  }

  drawGround(ctx, camX, camY, vw, vh) {
    for (const ch of this.chunks) {
      const sx = ch.x - camX, sy = ch.y - camY;
      if (sx > vw || sy > vh || sx + CHUNK * TILE < 0 || sy + CHUNK * TILE < 0) continue;
      ctx.drawImage(ch.c, sx, sy);
    }
  }

  /** Draw the lips of wall row `ty` (call after entities standing in row ty-1). */
  drawLipRow(ctx, ty, camX, camY, x0, x1) {
    const row = this.lipRows[ty];
    if (!row || !row.length) return;
    const y = ty * TILE - LIP - camY;
    for (const tx of row) {
      if (tx < x0 || tx > x1) continue;
      ctx.drawImage(this.lipCanvas, 16 * ((tx * 7 + ty) % 3), 0, TILE, LIP, tx * TILE - camX, y, TILE, LIP);
      const t = this.theme;
      if (this.get(tx - 1, ty - 1) !== T.WALL && this.get(tx - 1, ty) !== T.WALL) { ctx.fillStyle = t.wallCapHi; ctx.fillRect(tx * TILE - camX, y, 1, LIP); }
      if (this.get(tx + 1, ty - 1) !== T.WALL && this.get(tx + 1, ty) !== T.WALL) { ctx.fillStyle = t.wallCapHi; ctx.fillRect(tx * TILE + TILE - 1 - camX, y, 1, LIP); }
    }
  }

  /** Animated water shimmer (normal layer). */
  drawWater(ctx, camX, camY, vw, vh, t) {
    if (!this.waters.length) return;
    ctx.fillStyle = 'rgba(160,200,230,0.35)';
    for (const i of this.waters) {
      const tx = i % this.W, ty = (i / this.W) | 0;
      const sx = tx * TILE - camX, sy = ty * TILE - camY;
      if (sx < -TILE || sy < -TILE || sx > vw || sy > vh) continue;
      const ph = h2(tx, ty, 3) * 6.28;
      const k = Math.sin(t * 1.7 + ph);
      if (k > 0.3) ctx.fillRect(sx + Math.floor(h2(tx, ty, 4) * 10), sy + 4 + Math.floor(k * 6), 3, 1);
    }
  }

  /** Emissive liquid glow (lava / acid / void ichor), drawn additively after lighting. */
  drawLiquidGlow(ctx, camX, camY, vw, vh, t) {
    if (!this.liquids.length) return;
    const [r, g, b] = hexToRgb(this.theme.hazardLiquid.glow);
    for (const i of this.liquids) {
      const tx = i % this.W, ty = (i / this.W) | 0;
      const sx = tx * TILE - camX, sy = ty * TILE - camY;
      if (sx < -TILE || sy < -TILE || sx > vw || sy > vh) continue;
      const ph = h2(tx, ty, 11) * 6.28;
      const a = 0.16 + 0.1 * Math.sin(t * 1.3 + ph);
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
      const bx = Math.floor(h2(tx, ty, 12) * 13), by = (Math.floor(t * 6 + ph * 3) % 14);
      ctx.fillRect(sx + bx, sy + 14 - by, 2, 1);
      ctx.fillRect(sx + ((bx + 7) % 14), sy + ((by * 3) % 14), 1, 1);
    }
  }

  // ------------------------------------------------------------------ decals

  isGround(x, y) {
    const id = this.get(Math.floor(x / TILE), Math.floor(y / TILE));
    return id !== T.WALL && id !== T.PIT && id !== T.DEEPWATER && id !== T.BLOCK;
  }

  /** Paint a small permanent mark into the ground (blood, debris, scorch). */
  decal(x, y, color, w = 1, h = 1, alpha = 1) {
    if (!this.isGround(x, y)) return;
    const ch = this.chunkAt(x, y);
    if (!ch) return;
    const g = ch.g;
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(Math.floor(x - ch.x), Math.floor(y - ch.y), w, h);
    g.globalAlpha = 1;
  }

  scorch(x, y, r) {
    for (let i = 0; i < r * r * 0.9; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.8;
      this.decal(px, py, d < r * 0.5 ? '#0e0a0a' : '#1e1612', 1, 1, 0.55);
    }
  }
}
