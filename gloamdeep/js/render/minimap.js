// Discovered-map rendering: a corner minimap and a full-screen map overlay (M).

import { TILE } from '../config.js';
import { T } from '../world/tiles.js';

const DUNGEON_COLORS = {
  [T.FLOOR]: [74, 68, 88], [T.RUG]: [96, 52, 64], [T.WATER]: [42, 74, 106], [T.PIT]: [10, 8, 12],
};
const TOWN_COLORS = {
  [T.GRASS]: [42, 70, 40], [T.COBBLE]: [100, 96, 108], [T.DIRT]: [90, 72, 54], [T.DEEPWATER]: [26, 58, 90],
  [T.BLOCK]: [24, 38, 26], [T.PLANK]: [106, 74, 46], [T.WALL]: [70, 66, 80],
};

export class Minimap {
  constructor(small, big) {
    this.small = small;
    this.big = big;
    this.sctx = small.getContext('2d');
    this.bctx = big.getContext('2d');
    this.area = null;
    this.version = -1;
    this.base = null;
  }

  _rebuild(area) {
    if (!this.base || this.area !== area) {
      this.base = document.createElement('canvas');
      this.base.width = area.W; this.base.height = area.H;
      this.bx = this.base.getContext('2d');
      this.img = this.bx.createImageData(area.W, area.H);
      this.area = area;
      this.version = -1;
    }
    if (this.version === area.exploreVersion) return;
    this.version = area.exploreVersion;
    const d = this.img.data;
    const { W, H } = area;
    const tiles = area.map.tiles;
    const town = area.type === 'town';
    const liq = area.theme.hazardLiquid ? area.theme.hazardLiquid.glow : '#ff6a2a';
    const lr = parseInt(liq.slice(1, 3), 16), lg = parseInt(liq.slice(3, 5), 16), lb = parseInt(liq.slice(5, 7), 16);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * 4;
      if (!area.explored[i]) { d[o + 3] = 0; continue; }
      const id = tiles[i];
      let c;
      if (town) c = TOWN_COLORS[id] || [40, 40, 40];
      else if (id === T.WALL) {
        let edge = false;
        for (let oy = -1; oy <= 1 && !edge; oy++) for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox, ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && tiles[ny * W + nx] !== T.WALL && area.explored[ny * W + nx]) { edge = true; break; }
        }
        c = edge ? [150, 140, 164] : [26, 24, 32];
      } else if (id === T.LIQUID) c = [lr * 0.7, lg * 0.7, lb * 0.7];
      else c = DUNGEON_COLORS[id] || [74, 68, 88];
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    this.bx.putImageData(this.img, 0, 0);
  }

  _markers(g, game, ox, oy, s, full) {
    const area = game.area;
    const expl = (x, y) => area.explored[Math.floor(y / TILE) * area.W + Math.floor(x / TILE)];
    const dot = (x, y, col, r = 2) => {
      g.fillStyle = col;
      g.fillRect(Math.round(ox + (x / TILE) * s - r / 2), Math.round(oy + (y / TILE) * s - r / 2), r, r);
    };
    const ms = full ? 4 : 3;
    for (const p of area.props) {
      if (!expl(p.x, p.y)) continue;
      if (p.type === 'stairsDown') dot(p.x, p.y, p.sealed ? '#ff4a3a' : '#6ab0ff', ms + 2);
      else if (p.type === 'stairsUp') dot(p.x, p.y, '#ffd9a0', ms + 1);
      else if (p.type === 'chest' && !p.open) dot(p.x, p.y, '#ffd84a', ms);
      else if (p.type === 'shrine' && !p.used) dot(p.x, p.y, '#ff7ad8', ms);
      else if (p.type === 'gloamGate') dot(p.x, p.y, '#7a9aff', ms + 2);
      else if (p.type === 'storageChest') dot(p.x, p.y, '#ffd84a', ms + 1);
    }
    for (const n of area.npcs) {
      if (n.role === 'quest') dot(n.x, n.y, '#ffe04a', ms + 1);
      else if (n.role === 'merchant') dot(n.x, n.y, '#6aff8a', ms + 1);
    }
    for (const l of area.loot) if (l.kind === 'item' && expl(l.x, l.y)) dot(l.x, l.y, '#e8e0ff', 2);
    const pl = game.player;
    for (const e of area.enemies) {
      if (e.dead || !expl(e.x, e.y)) continue;
      if (Math.hypot(e.x - pl.x, e.y - pl.y) > 200 && !e.isBoss) continue;
      dot(e.x, e.y, e.isBoss ? '#ff2a6a' : e.elite ? e.eliteColor : '#e04a3a', e.isBoss ? ms + 3 : 2);
    }
    // player arrow
    const px = ox + (pl.x / TILE) * s, py = oy + (pl.y / TILE) * s;
    g.save();
    g.translate(px, py);
    g.rotate(pl.aim);
    g.fillStyle = '#ffffff';
    g.beginPath();
    const k = full ? 1.5 : 1;
    g.moveTo(5 * k, 0); g.lineTo(-3 * k, -3 * k); g.lineTo(-1 * k, 0); g.lineTo(-3 * k, 3 * k);
    g.closePath(); g.fill();
    g.restore();
  }

  drawSmall(game) {
    const area = game.area;
    if (!area) return;
    this._rebuild(area);
    const g = this.sctx;
    const W = this.small.width, H = this.small.height;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,6,12,0.72)';
    g.fillRect(0, 0, W, H);
    const s = 3;
    const pl = game.player;
    const ox = Math.round(W / 2 - (pl.x / TILE) * s), oy = Math.round(H / 2 - (pl.y / TILE) * s);
    g.drawImage(this.base, ox, oy, area.W * s, area.H * s);
    this._markers(g, game, ox, oy, s, false);
  }

  drawBig(game) {
    const area = game.area;
    if (!area) return;
    this._rebuild(area);
    const g = this.bctx;
    const W = this.big.width, H = this.big.height;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    const s = Math.max(2, Math.floor(Math.min((W - 40) / area.W, (H - 40) / area.H)));
    const ox = Math.round((W - area.W * s) / 2), oy = Math.round((H - area.H * s) / 2);
    g.fillStyle = 'rgba(6,4,10,0.6)';
    g.fillRect(ox - 6, oy - 6, area.W * s + 12, area.H * s + 12);
    g.drawImage(this.base, ox, oy, area.W * s, area.H * s);
    this._markers(g, game, ox, oy, s, true);
  }
}
