// Loot lying on the ground: gold, potions, quest relics and equipment.

import { runtimeRng } from '../core/rng.js';
import { rarityColor, RARITY_INDEX, MAX_POTIONS } from '../config.js';
import { itemIconCanvas } from '../fx/icons.js';
import { Lighting } from '../fx/lighting.js';
import { drawText } from '../fx/font.js';
import { P } from '../fx/particles.js';

export class Loot {
  constructor(kind, x, y, data = {}) {
    this.kind = kind;
    this.x = x; this.y = y; this.z = 6;
    const a = runtimeRng.next() * Math.PI * 2;
    const sp = runtimeRng.float(20, data.spread || 55);
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp * 0.7;
    this.vz = runtimeRng.float(70, 120);
    this.amount = data.amount || 0;
    this.item = data.item || null;
    this.relicColor = data.color || '#9a8cff';
    this.relicName = data.name || 'Relic';
    this.t = runtimeRng.next() * 5;
    this.dead = false;
    this.radius = 2;
    this.magnet = false;
    this.rarityIdx = this.item ? RARITY_INDEX[this.item.rarity] : 0;
  }

  update(dt, game) {
    this.t += dt;
    const map = game.area.map;
    if (this.z > 0 || this.vz !== 0) {
      this.vz -= 320 * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        if (this.vz < -50) { this.vz *= -0.38; this.vx *= 0.6; this.vy *= 0.6; if (this.kind === 'gold') game.audio.play('gold', 0.25); }
        else this.vz = 0;
      }
    }
    const fr = Math.exp(-3 * dt);
    this.vx *= fr; this.vy *= fr;
    if (!this.magnet) map.move(this, this.vx * dt, this.vy * dt, 2);

    const pl = game.player;
    if (!pl.alive) return;
    const dx = pl.x - this.x, dy = pl.y - 4 - this.y;
    const d = Math.hypot(dx, dy);
    const auto = this.kind === 'gold' || this.kind === 'relic' || (this.kind === 'potion' && game.profile.potions < MAX_POTIONS);
    if (!auto) return;
    const mr = this.kind === 'gold' ? 42 : 30;
    if (d < mr && this.t > 0.35) this.magnet = true;
    if (this.magnet) {
      const sp = 60 + (mr - Math.min(mr, d)) * 8 + this.t * 20;
      this.x += (dx / (d || 1)) * sp * dt;
      this.y += (dy / (d || 1)) * sp * dt;
      if (d < 7) this.collect(game);
    }
  }

  collect(game) {
    if (this.dead) return;
    this.dead = true;
    const ps = game.particles;
    if (this.kind === 'gold') {
      game.addGold(this.amount);
      game.floaters.add(this.x, this.y - 10, `+${this.amount}`, '#ffd84a', 1, -30);
      game.audio.play('gold', 0.8);
      ps.burst(P.GLINT, this.x, this.y, 4, { speed: 30, z: 4, life: 0.4, colors: ['#ffe890'] });
    } else if (this.kind === 'potion') {
      game.profile.potions = Math.min(MAX_POTIONS, game.profile.potions + 1);
      game.floaters.add(this.x, this.y - 10, '+POTION', '#ff7a8a', 1, -30);
      game.audio.play('pickup');
    } else if (this.kind === 'relic') {
      game.collectRelic(this);
    }
  }

  pickupItem(game) {
    if (this.kind !== 'item' || this.dead) return false;
    if (!game.addToInventory(this.item)) {
      game.toast('Your pack is full.', 'warn');
      game.audio.play('deny');
      return false;
    }
    this.dead = true;
    game.audio.play(this.rarityIdx >= 3 ? 'rareDrop' : 'pickup');
    game.toast(`Picked up ${this.item.name}`, this.item.rarity);
    return true;
  }

  label() {
    if (this.kind === 'item') return { text: this.item.name, color: rarityColor(this.item.rarity) };
    return null;
  }

  draw(ctx, cx, cy) {
    const bob = this.z > 0 ? 0 : Math.round(Math.sin(this.t * 3) * 1);
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy - this.z) - bob;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(Math.round(this.x - cx) - 3, Math.round(this.y - cy) + 1, 7, 2);
    if (this.kind === 'gold') {
      const n = Math.min(5, 1 + Math.floor(this.amount / 8));
      for (let i = 0; i < n; i++) {
        const ox = [0, -2, 2, -1, 1][i], oy = [0, 1, 1, -1, -1][i];
        ctx.fillStyle = '#8a6a1a'; ctx.fillRect(x + ox - 1, y + oy - 1, 3, 2);
        ctx.fillStyle = '#ffd84a'; ctx.fillRect(x + ox - 1, y + oy - 2, 3, 1);
      }
    } else if (this.kind === 'potion') {
      ctx.fillStyle = '#c8d8e8'; ctx.fillRect(x - 1, y - 7, 3, 2);
      ctx.fillStyle = '#d02a3a'; ctx.fillRect(x - 2, y - 5, 5, 5);
      ctx.fillStyle = '#ff8a9a'; ctx.fillRect(x - 1, y - 4, 1, 2);
    } else if (this.kind === 'relic') {
      ctx.fillStyle = this.relicColor;
      ctx.fillRect(x - 1, y - 7, 3, 6); ctx.fillRect(x - 2, y - 5, 5, 2);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y - 6, 1, 2);
    } else if (this.item) {
      const ic = itemIconCanvas(this.item);
      ctx.drawImage(ic, x - 8, y - 14);
    }
  }

  drawEmissive(g, cx, cy, time) {
    const x = this.x - cx, y = this.y - cy - this.z;
    if (this.kind === 'item') {
      const col = rarityColor(this.item.rarity);
      if (this.rarityIdx >= 1) Lighting.glow(g, x, y - 5, 10 + this.rarityIdx * 2, col, 0.35);
      if (this.rarityIdx >= 2) {
        // light pillar for rare and better
        const h = 40 + this.rarityIdx * 14;
        const grad = g.createLinearGradient(0, y - h, 0, y);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, col);
        g.globalAlpha = 0.3 + 0.1 * Math.sin(time * 3 + this.t);
        g.fillStyle = grad;
        g.fillRect(Math.round(x - 1), Math.round(y - h), 3, h);
        g.globalAlpha = 0.12;
        g.fillRect(Math.round(x - 3), Math.round(y - h * 0.7), 7, h * 0.7);
        g.globalAlpha = 1;
        if (Math.sin(time * 5 + this.t * 3) > 0.9) { g.fillStyle = '#ffffff'; g.fillRect(Math.round(x + Math.sin(this.t) * 3), Math.round(y - 10 - (time * 20 % 20)), 1, 1); }
      }
    } else if (this.kind === 'gold') {
      if (Math.sin(time * 4 + this.t * 5) > 0.93) { g.fillStyle = '#fff4c0'; g.fillRect(Math.round(x), Math.round(y - 2), 1, 1); }
      Lighting.glow(g, x, y - 1, 5, '#ffcf4a', 0.18);
    } else if (this.kind === 'potion') {
      Lighting.glow(g, x, y - 3, 7, '#ff3a4a', 0.35);
    } else if (this.kind === 'relic') {
      Lighting.glow(g, x, y - 4, 10, this.relicColor, 0.7);
    }
  }

  drawLabel(ctx, cx, cy, highlight) {
    const l = this.label();
    if (!l) return;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy - this.z - 24);
    const w = l.text.length * 4 + 5;
    ctx.fillStyle = highlight ? 'rgba(40,30,20,0.92)' : 'rgba(8,6,12,0.78)';
    ctx.fillRect(x - Math.ceil(w / 2) - 1, y - 1, w + 1, 9);
    if (highlight) { ctx.fillStyle = l.color; ctx.fillRect(x - Math.ceil(w / 2) - 1, y + 8, w + 1, 1); }
    drawText(ctx, l.text, x, y, l.color, 1);
  }

  light() {
    if (this.kind === 'item' && this.rarityIdx >= 1) return { x: this.x, y: this.y - 6, radius: 30 + this.rarityIdx * 8, color: rarityColor(this.item.rarity), intensity: 0.45 };
    if (this.kind === 'relic') return { x: this.x, y: this.y - 4, radius: 34, color: this.relicColor, intensity: 0.5 };
    return null;
  }
}
