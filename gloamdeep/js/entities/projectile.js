// Projectiles for both teams. Positions live on the ground plane; `z` is a visual height.

import { TAU } from '../core/math.js';
import { P } from '../fx/particles.js';
import { Lighting } from '../fx/lighting.js';
import { GroundEffect } from './effects.js';

export class Projectile {
  constructor(o) {
    this.team = o.team;
    this.kind = o.kind;
    this.x = o.x; this.y = o.y; this.z = o.z ?? 8;
    this.angle = o.angle;
    this.speed = o.speed;
    this.vx = Math.cos(o.angle) * o.speed;
    this.vy = Math.sin(o.angle) * o.speed;
    this.r = o.r ?? 3;
    this.dmg = o.dmg;
    this.life = o.life ?? 1.5;
    this.maxLife = this.life;
    this.pierce = o.pierce ?? 0;
    this.color = o.color || '#ffffff';
    this.slow = o.slow || 0;
    this.burn = o.burn || 0;
    this.explodeR = o.explodeR || 0;
    this.shatter = !!o.shatter;
    this.tick = o.tick || 0;
    this.implode = !!o.implode;
    this.homing = o.homing || 0;
    this.owner = o.owner || null;
    this.level = o.level || 1;
    this.element = o.element || null;
    this.unparryable = !!o.unparryable;
    this.hitSet = new Set();
    this.tickMap = new Map();
    this.dead = false;
    this.spin = 0;
    this.trailT = 0;
  }

  update(dt, game) {
    if (this.dead) return;
    this.life -= dt;
    if (this.life <= 0) { this.expire(game); return; }
    if (this.homing && this.team === 'enemy' && game.player.alive) {
      const want = Math.atan2(game.player.y - this.y, game.player.x - this.x);
      let d = want - this.angle;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      this.angle += Math.max(-this.homing * dt, Math.min(this.homing * dt, d));
      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
    }
    this.spin += dt * 14;
    const steps = Math.max(1, Math.ceil((this.speed * dt) / 4));
    for (let i = 0; i < steps && !this.dead; i++) {
      this.x += (this.vx * dt) / steps;
      this.y += (this.vy * dt) / steps;
      if (game.area.map.blocksProjectileAt(this.x, this.y)) { this.hitWall(game); return; }
      this.collide(game);
    }
    this.trail(dt, game);
  }

  collide(game) {
    if (this.team === 'player') {
      for (const e of game.area.enemies) {
        if (e.dead) continue;
        const dx = e.x - this.x, dy = e.y - e.height * 0.3 - this.y;
        const rr = this.r + e.radius + 2;
        if (dx * dx + dy * dy > rr * rr) continue;
        if (this.tick) {
          const last = this.tickMap.get(e) || 0;
          if (game.time - last < this.tick) continue;
          this.tickMap.set(e, game.time);
          game.combat.hitEnemy(e, this.dmg * 0.45, { angle: this.angle, knock: 10, element: 'void', source: 'spell', quiet: true });
          // gentle pull toward the orb
          e.kx += (this.x - e.x) * 2; e.ky += (this.y - e.y) * 2;
          continue;
        }
        if (this.hitSet.has(e)) continue;
        this.hitSet.add(e);
        const crit = Math.random() < game.stats.crit * 0.5;
        game.combat.hitEnemy(e, this.dmg * (crit ? game.stats.critMult : 1), {
          crit, angle: this.angle, knock: this.kind === 'wave' ? 90 : 60, element: this.kind === 'frost' || this.kind === 'shard' ? 'frost' : this.kind === 'ember' ? 'fire' : null,
          slow: this.slow, burn: this.burn, source: 'spell',
        });
        if (this.pierce-- <= 0) { this.expire(game, true); return; }
      }
      for (const p of game.area.props) {
        if (!p.hittable || p.broken || this.hitSet.has(p)) continue;
        const dx = p.x - this.x, dy = p.y - 4 - this.y;
        if (dx * dx + dy * dy < (this.r + (p.r || 5)) ** 2) {
          this.hitSet.add(p);
          p.damage(game, this.dmg, this.angle);
          if (!this.tick && this.pierce-- <= 0) { this.expire(game, true); return; }
        }
      }
    } else if (game.player.alive) {
      const pl = game.player;
      const dx = pl.x - this.x, dy = pl.y - 5 - this.y;
      const rr = this.r + 5;
      if (dx * dx + dy * dy < rr * rr) {
        if (pl.invulnerable()) {
          if (pl.dashT > 0 && !pl.dodgeShown) { pl.dodgeShown = true; game.floaters.add(pl.x, pl.y - 26, 'DODGE', '#8ae0ff', 1); }
          return;
        }
        game.combat.hitPlayer(this.dmg, { angle: this.angle, knock: 70, source: this.owner, level: this.level, element: this.element });
        this.expire(game, true);
      }
    }
  }

  hitWall(game) {
    game.particles.burst(P.SPARK, this.x - this.vx * 0.01, this.y - this.vy * 0.01, 5, { speed: 90, angle: this.angle + Math.PI, spread: 2, life: 0.25, colors: [this.color, '#ffffff'] });
    if (this.shatter) this.spawnShards(game);
    this.expire(game, true);
  }

  spawnShards(game) {
    for (let i = 0; i < 4; i++) {
      const a = this.angle + Math.PI + (Math.random() - 0.5) * 2.2;
      game.area.projectiles.push(new Projectile({ team: 'player', kind: 'shard', x: this.x - Math.cos(this.angle) * 4, y: this.y - Math.sin(this.angle) * 4, angle: a, speed: 190, r: 2, dmg: this.dmg * 0.35, life: 0.3, slow: 1.2, color: '#bff4ff' }));
    }
    game.particles.burst(P.SHARD, this.x, this.y, 8, { speed: 70, z: 6, vz: 40, life: 0.6, colors: ['#bff4ff', '#8ae0ff'] });
  }

  expire(game, impact = false) {
    if (this.dead) return;
    this.dead = true;
    const ps = game.particles;
    switch (this.kind) {
      case 'ember':
        game.combat.explode(this.x, this.y, this.explodeR || 26, this.dmg * 0.6, { team: 'player', color: '#ff8a2e', shake: 1.5, knock: 90 });
        break;
      case 'void':
        if (this.implode) {
          for (const e of game.area.enemies) {
            if (e.dead) continue;
            const d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d < 40) { e.kx += (this.x - e.x) * 5; e.ky += (this.y - e.y) * 5; game.combat.hitEnemy(e, this.dmg * 1.1, { element: 'void', source: 'spell', angle: 0 }); }
          }
          ps.burst(P.MAGIC, this.x, this.y, 30, { speed: 120, life: 0.5, size: 2, colors: ['#b36bff', '#e0c0ff', '#6a2aff'], z: 6 });
          game.audio.play('void', 0.6);
          game.shake(2, 0.15);
        }
        break;
      case 'frost':
        if (!impact) this.spawnShards(game);
        ps.burst(P.GLINT, this.x, this.y, 6, { speed: 40, life: 0.5, colors: ['#ffffff', '#8ae0ff'] });
        break;
      case 'acid':
        game.area.groundEffects.push(new GroundEffect('poison', this.x, this.y, 12, 3, this.dmg * 0.35, 'enemy'));
        ps.burst(P.DRIP, this.x, this.y, 8, { speed: 50, z: 4, vz: 40, life: 0.7, colors: ['#8aff3a', '#5ad01a'] });
        break;
      case 'cinder': case 'fireball':
        game.combat.explode(this.x, this.y, this.kind === 'fireball' ? 26 : 16, this.dmg * 0.6, { team: 'enemy', color: '#ff7a2e', shake: 1, scorch: true, owner: this.owner });
        break;
      default:
        ps.burst(P.SPARK, this.x, this.y, 4, { speed: 60, life: 0.2, colors: [this.color] });
    }
  }

  trail(dt, game) {
    const ps = game.particles;
    this.trailT -= dt;
    if (this.trailT > 0) return;
    this.trailT = this.kind === 'void' ? 0.015 : 0.02;
    switch (this.kind) {
      case 'ember': case 'fireball': case 'cinder':
        ps.spawn(P.FIRE, this.x, this.y, this.z, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 10, 0.35, this.kind === 'fireball' ? 4 : 3, Math.random() < 0.5 ? '#ffb347' : '#ff7a2e', 2, 10);
        if (Math.random() < 0.3) ps.spawn(P.SMOKE, this.x, this.y, this.z, 0, 0, 12, 0.6, 2, '#3a2a24', 1, 4);
        break;
      case 'frost': case 'shard':
        ps.spawn(P.GLINT, this.x, this.y, this.z, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 0, 0.3, 1, Math.random() < 0.5 ? '#ffffff' : '#8ae0ff', 1, 0);
        break;
      case 'void': case 'voidOrb': {
        const a = Math.random() * TAU;
        ps.spawn(P.MAGIC, this.x + Math.cos(a) * this.r * 1.4, this.y + Math.sin(a) * this.r * 1.1, this.z, -Math.cos(a) * 20, -Math.sin(a) * 20, 0, 0.4, 2, Math.random() < 0.5 ? '#b36bff' : '#6a2aff', 1, 0);
        break;
      }
      case 'acid':
        if (Math.random() < 0.5) ps.spawn(P.DRIP, this.x, this.y, this.z, 0, 0, 0, 0.6, 1, '#8aff3a', 0, 0);
        break;
      case 'spore':
        ps.spawn(P.SMOKE, this.x, this.y, this.z, 0, 0, 4, 0.5, 2, '#d88ab8', 1, 0);
        break;
      case 'hexOrb': case 'prism': case 'bone': case 'wave':
        ps.spawn(P.MAGIC, this.x, this.y, this.z, 0, 0, 0, 0.25, 2, this.color, 1, 0);
        break;
      default: break;
    }
  }

  light() {
    const big = this.kind === 'void' || this.kind === 'fireball' || this.kind === 'voidOrb';
    return { x: this.x, y: this.y, radius: big ? 64 : this.kind === 'arrow' ? 0 : 42, color: this.color, intensity: big ? 0.9 : 0.65 };
  }

  /** Lit (non-emissive) part: arrows, bones. */
  draw(ctx, cx, cy) {
    if (this.kind !== 'arrow' && this.kind !== 'bone') return;
    const x = this.x - cx, y = this.y - this.z - cy;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(Math.round(this.x - cx) - 1, Math.round(this.y - cy), 3, 1);
    if (this.kind === 'arrow') {
      const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = i < 2 ? '#d8d0c0' : i > 5 ? this.color : '#8a6a4a';
        ctx.fillRect(Math.round(x - dx * i), Math.round(y - dy * i), 1, 1);
      }
    } else {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(this.spin);
      ctx.fillStyle = '#e8e0c8';
      ctx.fillRect(-3, -1, 6, 2);
      ctx.fillRect(-4, -2, 2, 4);
      ctx.fillRect(2, -2, 2, 4);
      ctx.restore();
    }
  }

  drawEmissive(g, cx, cy) {
    const x = this.x - cx, y = this.y - this.z - cy;
    switch (this.kind) {
      case 'arrow': case 'bone':
        Lighting.glow(g, x, y, 5, this.color, 0.4);
        break;
      case 'frost': case 'shard': case 'prism': {
        const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
        Lighting.glow(g, x, y, this.kind === 'shard' ? 5 : 9, this.color, 0.7);
        g.fillStyle = '#ffffff';
        const len = this.kind === 'shard' ? 3 : 6;
        for (let i = 0; i < len; i++) g.fillRect(Math.round(x - dx * i), Math.round(y - dy * i), 1, 1);
        g.fillStyle = this.color;
        g.fillRect(Math.round(x - dx * len), Math.round(y - dy * len), 1, 1);
        break;
      }
      case 'wave': {
        g.strokeStyle = this.color;
        g.globalAlpha = Math.min(1, this.life / this.maxLife * 2);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x - Math.cos(this.angle) * 8, y - Math.sin(this.angle) * 8, 10, this.angle - 1, this.angle + 1);
        g.stroke();
        g.globalAlpha = 1; g.lineWidth = 1;
        break;
      }
      case 'void': case 'voidOrb': {
        Lighting.glow(g, x, y, this.r * 2.6, this.color, 0.7);
        g.fillStyle = '#1a0a2a';
        g.beginPath(); g.arc(x, y, this.r * 0.7, 0, TAU); g.fill();
        g.strokeStyle = '#e0c0ff';
        g.beginPath(); g.arc(x, y, this.r * 0.7 + 1, this.spin, this.spin + 4); g.stroke();
        break;
      }
      default: {
        const r = this.kind === 'fireball' ? 5 : this.kind === 'hexOrb' || this.kind === 'spore' ? 4 : 3;
        Lighting.glow(g, x, y, r * 2.6, this.color, this.team === 'enemy' ? 0.45 : 0.65);
        g.fillStyle = this.color;
        g.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), r, r);
        g.fillStyle = '#ffffff';
        g.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
      }
    }
  }
}
