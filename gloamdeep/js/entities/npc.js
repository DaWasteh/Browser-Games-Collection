// Town NPCs: service providers (quest giver, merchant) and decorative villagers who wander.

import { TILE } from '../config.js';
import { runtimeRng } from '../core/rng.js';
import { dir4 } from '../core/math.js';
import { getSprite, NPC_LOOKS } from '../fx/sprites.js';
import { drawText } from '../fx/font.js';
import { Lighting } from '../fx/lighting.js';
import { P } from '../fx/particles.js';

export class Npc {
  constructor(d) {
    Object.assign(this, d);
    this.look = NPC_LOOKS[d.look];
    this.radius = d.role === 'panda' ? 4 : 5;
    this.dir = 0;
    this.animT = runtimeRng.next() * 4;
    this.moving = false;
    this.pathIdx = 0;
    this.wait = runtimeRng.float(0.5, 2);
    this.lineIdx = 0;
    this.speed = d.role === 'panda' ? 30 : d.look === 'child' ? 32 : 20;
  }

  update(dt, game) {
    const pl = game.player;
    const dp = Math.hypot(pl.x - this.x, pl.y - this.y);
    this.moving = false;
    if (this.path && !(dp < 34 && this.role !== 'panda')) {
      if (this.wait > 0) this.wait -= dt;
      else {
        const [tx, ty] = this.path[this.pathIdx];
        const gx = tx * TILE + TILE / 2, gy = ty * TILE + TILE / 2;
        const dx = gx - this.x, dy = gy - this.y;
        const d = Math.hypot(dx, dy);
        if (d < 2) {
          this.pathIdx = (this.pathIdx + 1) % this.path.length;
          this.wait = runtimeRng.float(1, this.role === 'panda' ? 2.5 : 4);
        } else {
          const step = Math.min(d, this.speed * dt);
          game.area.map.move(this, (dx / d) * step, (dy / d) * step, this.radius);
          this.dir = dir4(Math.atan2(dy, dx));
          this.moving = true;
        }
      }
    }
    if (!this.moving && dp < 60) this.dir = dir4(Math.atan2(pl.y - this.y, pl.x - this.x));
    this.animT += dt * (this.moving ? 7 : 1.6);
  }

  interaction(game) {
    switch (this.role) {
      case 'quest': return { label: `Talk to ${this.name}`, act: () => game.talkTo('warden') };
      case 'merchant': return { label: `Trade with ${this.name}`, act: () => game.openModal('merchant') };
      case 'panda': return { label: `Pet ${this.name}`, act: () => this.speak(game) };
      default: return { label: `Talk to ${this.name}`, act: () => this.speak(game) };
    }
  }

  speak(game) {
    const line = this.lines[this.lineIdx % this.lines.length];
    this.lineIdx++;
    if (this.role === 'panda') {
      game.toast(line, 'info');
      game.audio.play('pickup', 0.5);
      for (let i = 0; i < 6; i++) game.particles.spawn(P.MAGIC, this.x + (runtimeRng.next() - 0.5) * 10, this.y - 6, 8, 0, 0, 25, 1, 2, '#ff7a9a', 1, 0);
      return;
    }
    game.openDialog({ npc: this, text: line, options: [{ label: 'Farewell', act: () => game.closeModal() }] });
  }

  sprite() {
    const pose = this.moving ? 'walk' : 'idle';
    return getSprite(this.look, this.dir, Math.floor(this.animT), pose);
  }

  draw(ctx, cx, cy) {
    const s = this.sprite();
    const sit = this.sit ? 2 : 0;
    ctx.drawImage(s.c, Math.round(this.x - s.ax - cx), Math.round(this.y - s.ay - cy + sit));
  }

  drawOverlay(ctx, cx, cy, game) {
    const x = Math.round(this.x - cx), top = Math.round(this.y - cy - (this.role === 'panda' ? 16 : this.look.dims ? 28 : 34));
    const near = Math.hypot(game.player.x - this.x, game.player.y - this.y) < 70;
    if (this.role === 'quest') {
      const q = game.profile.quest;
      const mark = q && q.done ? '?' : !q ? '!' : null;
      if (mark) {
        const b = Math.round(Math.sin(game.time * 4) * 1.5);
        drawText(ctx, mark, x, top - 12 + b, q && q.done ? '#7aff8a' : '#ffd84a', 2);
      }
    }
    if (near || this.role === 'quest' || this.role === 'merchant') {
      drawText(ctx, this.name, x, top - 2, this.role === 'quest' || this.role === 'merchant' ? '#ffe0a0' : '#c8c0b0', 1);
    }
  }

  drawEmissive(g, cx, cy, game) {
    if (this.role === 'quest') {
      const q = game.profile.quest;
      if (!q || q.done) Lighting.glow(g, this.x - cx, this.y - cy - 44, 10, q && q.done ? '#7aff8a' : '#ffd84a', 0.4);
    }
  }
}
