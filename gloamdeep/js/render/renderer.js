// Frame composition: ground → y-sorted world (with wall-lip occlusion) → lit particles →
// multiplicative lighting → emissive layer + bloom → fog of war → post-light overlays.

import { TILE } from '../config.js';
import { Lighting } from '../fx/lighting.js';
import { drawText } from '../fx/font.js';

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.lighting = new Lighting();
    this.vw = 0; this.vh = 0;
    this.fogTex = this._makeFogTexture();
  }

  resize(vw, vh) {
    this.vw = vw; this.vh = vh;
    this.canvas.width = vw;
    this.canvas.height = vh;
    this.ctx.imageSmoothingEnabled = false;
    this.lighting.resize(vw, vh);
    this.vignette = this._makeVignette(vw, vh);
  }

  _makeVignette(w, h) {
    const [c, g] = mk(w, h);
    const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    return c;
  }

  _makeFogTexture() {
    // soft value noise tile, used for drifting mist
    const S = 128;
    const [c, g] = mk(S, S);
    const img = g.createImageData(S, S);
    const grid = 8;
    const rnd = [];
    for (let i = 0; i < (grid + 1) * (grid + 1); i++) rnd.push(Math.random());
    const at = (x, y) => rnd[(y % grid) * (grid + 1) + (x % grid)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const fx = (x / S) * grid, fy = (y / S) * grid;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const v = (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
      const a = Math.max(0, v - 0.35) * 1.6;
      const i = (y * S + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  render(game) {
    const ctx = this.ctx;
    const area = game.area;
    const { vw, vh } = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, vw, vh);
    if (!area) return;
    const cam = game.cam;
    const camX = Math.round(cam.x + game.shakeX), camY = Math.round(cam.y + game.shakeY);
    const time = game.time;
    const pl = game.player;
    const showPlayer = game.state !== 'title' && pl;

    // ---- ground
    area.tiles.drawGround(ctx, camX, camY, vw, vh);
    area.tiles.drawWater(ctx, camX, camY, vw, vh, time);
    for (const t of area.traps) t.drawGround(ctx, camX, camY);
    for (const g of area.groundEffects) g.drawGround(ctx, camX, camY);
    for (const p of area.props) if (p.flat) p.draw(ctx, camX, camY, time);

    // contact shadows
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    const shadow = (x, y, r) => { ctx.beginPath(); ctx.ellipse(Math.round(x - camX), Math.round(y - camY), r, Math.max(1.5, r * 0.45), 0, 0, Math.PI * 2); ctx.fill(); };
    if (showPlayer && pl.alive) shadow(pl.x, pl.y, 5);
    for (const e of area.enemies) if (!e.dead && !e.hidden) shadow(e.x, e.y, e.radius + 1);
    for (const n of area.npcs) shadow(n.x, n.y, n.radius);

    // ---- y-sorted world with wall lips
    const items = [];
    const x0 = camX - 64, x1 = camX + vw + 64, y0 = camY - 80, y1 = camY + vh + 80;
    const vis = (x, y) => x > x0 && x < x1 && y > y0 && y < y1;
    for (const p of area.props) {
      if (p.flat || p.broken) continue;
      if (p.isLarge ? (p.x + (p.w || 64) > x0 && p.x - 64 < x1 && p.sortY > y0 && p.sortY - 120 < y1) : vis(p.x, p.y)) items.push([p.sortY, 0, p]);
    }
    for (const e of area.enemies) if (!e.dead && vis(e.x, e.y)) items.push([e.y, 1, e]);
    for (const n of area.npcs) if (vis(n.x, n.y)) items.push([n.y, 2, n]);
    for (const l of area.loot) if (vis(l.x, l.y)) items.push([l.y - 1, 3, l]);
    for (const p of area.projectiles) if ((p.kind === 'arrow' || p.kind === 'bone') && vis(p.x, p.y)) items.push([p.y, 4, p]);
    for (const e of area.effects) if (e.draw && vis(e.x, e.y)) items.push([e.y, 5, e]);
    if (showPlayer && pl.alive) items.push([pl.y, 6, pl]);
    items.sort((a, b) => a[0] - b[0]);
    const tx0 = Math.floor(camX / TILE) - 1, tx1 = Math.floor((camX + vw) / TILE) + 1;
    const ty0 = Math.max(0, Math.floor(camY / TILE)), ty1 = Math.min(area.H - 1, Math.floor((camY + vh) / TILE) + 2);
    let k = 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      const limit = ty * TILE;
      while (k < items.length && items[k][0] < limit) { items[k][2].draw(ctx, camX, camY, game); k++; }
      area.tiles.drawLipRow(ctx, ty, camX, camY, tx0, tx1);
    }
    while (k < items.length) { items[k][2].draw(ctx, camX, camY, game); k++; }

    game.particles.drawNormal(ctx, camX, camY, vw, vh);

    // drifting mist (lit by the light pass)
    const [fr, fg, fb] = area.fogColor || [30, 30, 40];
    ctx.save();
    ctx.globalAlpha = area.type === 'town' ? 0.1 : 0.16;
    ctx.globalCompositeOperation = 'screen';
    const ox = ((camX * 0.6 + time * 6) % 128 + 128) % 128, oy = ((camY * 0.6 + time * 2.5) % 128 + 128) % 128;
    const pat = this._tintedFog(fr, fg, fb);
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, vw + 128, vh + 128);
    ctx.restore();

    // ---- lighting
    const dyn = [];
    if (showPlayer && pl.alive) dyn.push(pl.light(game));
    else if (game.titleLight) dyn.push(game.titleLight);
    const add = (L) => { if (L && L.radius > 0) dyn.push(L); };
    for (const p of area.projectiles) add(p.light());
    for (const e of area.effects) if (e.light) add(e.light());
    for (const g of area.groundEffects) add(g.light());
    for (const l of area.loot) add(l.light());
    for (const p of area.props) if (vis(p.x, p.y)) add(p.light());
    for (const t of area.traps) if (vis(t.x, t.y)) add(t.light());
    for (const e of area.enemies) if (!e.dead && vis(e.x, e.y)) add(e.light());
    if (area.liquidGlow) for (const L of area.liquidGlow) if (vis(L.x, L.y)) dyn.push(L);
    const amb = area.ambient;
    const flashBoost = game.lightningFlash > 0 ? game.lightningFlash * 120 : 0;
    const ambient = flashBoost ? [Math.min(255, amb[0] + flashBoost), Math.min(255, amb[1] + flashBoost), Math.min(255, amb[2] + flashBoost * 1.2)] : amb;
    // torches, lamp posts, braziers, campfire and windows: baked once per loaded area
    this.lighting.useArea(area);
    this.lighting.apply(ctx, camX, camY, ambient, dyn, time);

    // enemy under the cursor (outlined, name + life shown)
    let hover = null;
    if (showPlayer && game.mouseInside && !game.modal) {
      const m = game.mouseWorld;
      let bd = 1e9;
      for (const e of area.enemies) {
        if (e.dead || e.hidden) continue;
        const dx = Math.abs(m.x - e.x), top = e.y - (e.isBoss ? 56 : e.height + 4);
        if (dx < e.radius + 5 && m.y > top && m.y < e.y + 4) { const d = dx + Math.abs(m.y - (e.y - e.height / 2)); if (d < bd) { bd = d; hover = e; } }
      }
    }
    game.hoverEnemy = hover;

    // ---- emissive + bloom
    const g = this.lighting.beginEmissive();
    area.tiles.drawLiquidGlow(g, camX, camY, vw, vh, time);
    for (const p of area.props) if (vis(p.x, p.y) || p.isLarge) p.drawEmissive(g, camX, camY, time);
    for (const t of area.traps) if (vis(t.x, t.y)) t.drawEmissive(g, camX, camY, time);
    for (const ge of area.groundEffects) ge.drawEmissive(g, camX, camY);
    for (const l of area.loot) if (vis(l.x, l.y)) l.drawEmissive(g, camX, camY, time);
    for (const e of area.enemies) if (!e.dead && vis(e.x, e.y)) e.drawEmissive(g, camX, camY, time);
    if (hover) hover.drawHover(g, camX, camY);
    for (const n of area.npcs) n.drawEmissive(g, camX, camY, game);
    for (const p of area.projectiles) if (vis(p.x, p.y)) p.drawEmissive(g, camX, camY);
    for (const e of area.effects) if (e.drawEmissive) e.drawEmissive(g, camX, camY);
    if (showPlayer) pl.drawEmissive(g, camX, camY, time);
    game.particles.drawGlow(g, camX, camY, vw, vh);
    this.lighting.endEmissive(ctx, area.type === 'town' ? 0.8 : 1);

    // ---- fog of war
    if (area.type === 'dungeon') {
      const fog = area.fogCanvas();
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(fog, camX / TILE, camY / TILE, vw / TILE, vh / TILE, 0, 0, vw, vh);
      ctx.restore();
      ctx.imageSmoothingEnabled = false;
    }

    // ---- overlays (unlit)
    ctx.drawImage(this.vignette, 0, 0);
    for (const e of area.enemies) if (!e.dead && vis(e.x, e.y) && this._explored(area, e.x, e.y)) e.drawOverlay(ctx, camX, camY, game, e === hover);
    for (const n of area.npcs) if (vis(n.x, n.y)) n.drawOverlay(ctx, camX, camY, game);
    if (showPlayer && pl.alive) {
      const target = game.interactTarget;
      for (const l of area.loot) {
        if (l.kind !== 'item' || !vis(l.x, l.y)) continue;
        const d = Math.hypot(l.x - pl.x, l.y - pl.y);
        if (d < 70 || game.input.isDown('AltLeft') || game.input.isDown('AltRight')) l.drawLabel(ctx, camX, camY, target && target.obj === l);
      }
      if (target && target.obj && !(target.obj.kind === 'item')) {
        const o = target.obj;
        const bob = Math.round(Math.sin(time * 6) * 1.5);
        const top = o.isLarge ? o.y - 64 : o.y - (o.look ? (o.role === 'panda' ? 26 : 44) : 30);
        drawText(ctx, 'E', Math.round(o.x - camX), Math.round(top - camY) + bob, '#ffe08a', 1);
      }
    }
    game.floaters.draw(ctx, camX, camY);

    // reticle
    if (game.state === 'play' && !game.modal && game.mouseInside && !game.pointerOverUi) {
      const mx = Math.round(game.mouseScreen.x), my = Math.round(game.mouseScreen.y);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(mx - 4, my - 1, 9, 3); ctx.fillRect(mx - 1, my - 4, 3, 9);
      ctx.fillStyle = pl.swing || pl.attackCd > 0 ? '#ffcf6a' : '#f4ecdc';
      ctx.fillRect(mx - 3, my, 2, 1); ctx.fillRect(mx + 2, my, 2, 1);
      ctx.fillRect(mx, my - 3, 1, 2); ctx.fillRect(mx, my + 2, 1, 2);
    }
  }

  _explored(area, x, y) {
    if (area.type === 'town') return true;
    return area.explored[Math.floor(y / TILE) * area.W + Math.floor(x / TILE)] === 1;
  }

  _tintedFog(r, g, b) {
    const key = `${r},${g},${b}`;
    if (this._fogKey === key) return this._fogPat;
    const [c, x] = mk(128, 128);
    x.drawImage(this.fogTex, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = `rgb(${Math.min(255, r * 3)},${Math.min(255, g * 3)},${Math.min(255, b * 3)})`;
    x.fillRect(0, 0, 128, 128);
    this._fogKey = key;
    this._fogPat = this.ctx.createPattern(c, 'repeat');
    return this._fogPat;
  }
}

export { Lighting };
