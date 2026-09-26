// Transient world effects: ground hazards (fire, poison), shockwaves, meteor markers, lightning
// bolts, weapon slashes, explosion flashes, damage numbers, afterimages and corpses.

import { TAU, dist2 } from '../core/math.js';
import { P } from '../fx/particles.js';
import { Lighting } from '../fx/lighting.js';
import { drawText } from '../fx/font.js';
import { MAX_FLOATERS } from '../config.js';

export class GroundEffect {
  /** kind: fire | poison | void */
  constructor(kind, x, y, r, life, dps, team) {
    this.kind = kind; this.x = x; this.y = y; this.r = r; this.life = life; this.maxLife = life;
    this.dps = dps; this.team = team; this.tick = 0; this.dead = false;
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const ps = game.particles;
    const n = this.r * this.r * dt * 0.02;
    for (let i = 0; i < n || Math.random() < n; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * this.r;
      const x = this.x + Math.cos(a) * d, y = this.y + Math.sin(a) * d * 0.8;
      if (this.kind === 'fire') ps.spawn(P.FIRE, x, y, 1, (Math.random() - 0.5) * 8, 0, 18 + Math.random() * 20, 0.5 + Math.random() * 0.4, 2, Math.random() < 0.5 ? '#ff9a2e' : '#ffcf4a', 1, 10);
      else if (this.kind === 'poison') ps.spawn(P.SMOKE, x, y, 2, (Math.random() - 0.5) * 6, 0, 6, 1.0, 3, Math.random() < 0.5 ? '#6ad02a' : '#a8ff4a', 1, 4);
      else ps.spawn(P.MAGIC, x, y, 2, 0, 0, 10, 0.6, 2, '#b36bff', 1, 0);
      if (i > 20) break;
    }
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.25;
    const dmg = this.dps * 0.25;
    const r2 = this.r * this.r;
    if (this.team !== 'player' && game.player.alive && dist2(this.x, this.y, game.player.x, game.player.y) < r2) {
      game.combat.hitPlayer(dmg, { element: this.kind, dot: true });
    }
    if (this.team !== 'enemy') {
      for (const e of game.area.enemies) {
        if (!e.dead && dist2(this.x, this.y, e.x, e.y) < r2 + e.radius * e.radius) game.combat.hitEnemy(e, dmg, { element: this.kind, dot: true, quiet: true });
      }
    }
  }

  light() {
    const k = Math.min(1, this.life / 0.5);
    const col = this.kind === 'fire' ? '#ff8a2e' : this.kind === 'poison' ? '#8aff3a' : '#b36bff';
    return { x: this.x, y: this.y, radius: this.r * 2.4, color: col, intensity: 0.55 * k };
  }

  drawGround(ctx, cx, cy) {
    const k = Math.min(1, this.life / 0.6);
    ctx.globalAlpha = 0.25 * k;
    ctx.fillStyle = this.kind === 'fire' ? '#2a0a04' : this.kind === 'poison' ? '#1a3a0a' : '#1a0a2a';
    ctx.beginPath();
    ctx.ellipse(this.x - cx, this.y - cy, this.r, this.r * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawEmissive(g, cx, cy) {
    const k = Math.min(1, this.life / 0.6);
    const col = this.kind === 'fire' ? '#ff6a1f' : this.kind === 'poison' ? '#5ad01a' : '#8a4aff';
    g.globalAlpha = 0.35 * k;
    Lighting.glow(g, this.x - cx, this.y - cy, this.r * 1.1, col, 0.8);
    g.globalAlpha = 1;
  }
}

/** Expanding ring that damages whatever it passes over (dodge by dashing through it). */
export class Shockwave {
  constructor(x, y, maxR, speed, dmg, team, color = '#ff9a4a') {
    this.x = x; this.y = y; this.r = 6; this.maxR = maxR; this.speed = speed; this.dmg = dmg; this.team = team;
    this.color = color; this.hitPlayer = false; this.hitSet = new Set(); this.dead = false;
  }

  update(dt, game) {
    this.r += this.speed * dt;
    if (this.r >= this.maxR) { this.dead = true; return; }
    const band = 7;
    if (this.team !== 'player' && !this.hitPlayer && game.player.alive) {
      const d = Math.hypot(game.player.x - this.x, game.player.y - this.y);
      if (Math.abs(d - this.r) < band) {
        this.hitPlayer = true;
        game.combat.hitPlayer(this.dmg, { angle: Math.atan2(game.player.y - this.y, game.player.x - this.x), knock: 160 });
      }
    }
    if (this.team === 'player') {
      for (const e of game.area.enemies) {
        if (e.dead || this.hitSet.has(e)) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (Math.abs(d - this.r) < band + e.radius) { this.hitSet.add(e); game.combat.hitEnemy(e, this.dmg, { angle: Math.atan2(e.y - this.y, e.x - this.x), knock: 120 }); }
      }
    }
    if (Math.random() < 0.8) {
      const a = Math.random() * TAU;
      game.particles.spawn(P.DUST, this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r * 0.8, 1, 0, 0, 5, 0.5, 3, '#8a7a6a', 2, 0);
    }
  }

  drawEmissive(g, cx, cy) {
    const k = 1 - this.r / this.maxR;
    g.strokeStyle = this.color;
    g.globalAlpha = 0.9 * k + 0.1;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(this.x - cx, this.y - cy, this.r, this.r * 0.8, 0, 0, TAU);
    g.stroke();
    g.globalAlpha = 0.35 * k;
    g.lineWidth = 5;
    g.stroke();
    g.globalAlpha = 1;
    g.lineWidth = 1;
  }
}

/** Telegraphed area strike (meteor, eruption). */
export class Meteor {
  constructor(x, y, r, delay, dmg, team, color = '#ff7a2e', kind = 'fire') {
    this.x = x; this.y = y; this.r = r; this.t = 0; this.delay = delay; this.dmg = dmg; this.team = team;
    this.color = color; this.kind = kind; this.dead = false;
  }

  update(dt, game) {
    this.t += dt;
    if (this.t >= this.delay) {
      this.dead = true;
      game.combat.explode(this.x, this.y, this.r, this.dmg, { team: this.team, color: this.color, fire: this.kind === 'fire', scorch: true, shake: 3 });
    }
  }

  drawEmissive(g, cx, cy) {
    const k = this.t / this.delay;
    const x = this.x - cx, y = this.y - cy;
    g.strokeStyle = '#ff4a2a';
    g.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 20);
    g.lineWidth = 1;
    g.beginPath(); g.ellipse(x, y, this.r, this.r * 0.8, 0, 0, TAU); g.stroke();
    g.globalAlpha = 0.35;
    g.fillStyle = '#ff3a1a';
    g.beginPath(); g.ellipse(x, y, this.r * k, this.r * 0.8 * k, 0, 0, TAU); g.fill();
    // falling rock
    if (this.kind === 'fire') {
      g.globalAlpha = 1;
      const fy = y - (1 - k) * 140;
      Lighting.glow(g, x, fy, 6, this.color, 1);
      g.fillStyle = '#fff0b0'; g.fillRect(Math.round(x - 1), Math.round(fy - 1), 3, 3);
    }
    g.globalAlpha = 1;
  }
}

/** Lightning bolt polyline (visual). */
export class Bolt {
  constructor(points, color = '#cfe0ff', life = 0.22, width = 1) {
    this.points = points; this.color = color; this.life = life; this.maxLife = life; this.width = width; this.dead = false;
    this.seg = this._jag(points);
  }

  _jag(pts) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 8));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const j = k === 0 || k === n ? 0 : (Math.random() - 0.5) * 9;
        const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
        out.push([x0 + (x1 - x0) * t + (nx / nl) * j, y0 + (y1 - y0) * t + (ny / nl) * j]);
      }
    }
    return out;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    else if (Math.random() < 0.35) this.seg = this._jag(this.points);
  }

  drawEmissive(g, cx, cy) {
    const k = this.life / this.maxLife;
    g.strokeStyle = this.color;
    g.lineCap = 'round';
    for (const [w, a] of [[5, 0.25], [2, 0.7], [1, 1]]) {
      g.globalAlpha = a * k;
      g.lineWidth = w * this.width;
      g.beginPath();
      g.moveTo(this.seg[0][0] - cx, this.seg[0][1] - cy);
      for (let i = 1; i < this.seg.length; i++) g.lineTo(this.seg[i][0] - cx, this.seg[i][1] - cy);
      g.stroke();
    }
    g.globalAlpha = 1; g.lineWidth = 1;
  }
}

/** Weapon swing crescent. */
export class Slash {
  constructor(x, y, angle, arc, reach, color = '#ffffff', life = 0.14, dirSign = 1) {
    this.x = x; this.y = y; this.angle = angle; this.arc = arc; this.reach = reach; this.color = color;
    this.life = life; this.maxLife = life; this.dead = false; this.dirSign = dirSign;
  }

  update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }

  drawEmissive(g, cx, cy) {
    const k = this.life / this.maxLife;
    const prog = 1 - k;
    const x = this.x - cx, y = this.y - cy;
    const a0 = this.angle - this.arc / 2, a1 = this.angle + this.arc / 2;
    const head = this.dirSign > 0 ? a0 + (a1 - a0) * Math.min(1, prog * 1.6) : a1 - (a1 - a0) * Math.min(1, prog * 1.6);
    const start = this.dirSign > 0 ? a0 : head;
    const end = this.dirSign > 0 ? head : a1;
    g.strokeStyle = this.color;
    for (const [w, a, rr] of [[5, 0.18, 0.78], [3, 0.45, 0.85], [1, 0.95, 0.95]]) {
      g.globalAlpha = a * k;
      g.lineWidth = w;
      g.beginPath();
      g.ellipse(x, y, this.reach * rr, this.reach * rr * 0.82, 0, start, end);
      g.stroke();
    }
    g.globalAlpha = 1; g.lineWidth = 1;
  }
}

export class Flash {
  constructor(x, y, r, color, life = 0.18) { this.x = x; this.y = y; this.r = r; this.color = color; this.life = life; this.maxLife = life; this.dead = false; }
  update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
  light() { return { x: this.x, y: this.y, radius: this.r * 3, color: this.color, intensity: 1.2 * (this.life / this.maxLife) }; }
  drawEmissive(g, cx, cy) {
    const k = this.life / this.maxLife;
    Lighting.glow(g, this.x - cx, this.y - cy, this.r * (1.4 - k * 0.4), this.color, k);
    g.globalAlpha = k;
    g.fillStyle = '#ffffff';
    const r = Math.max(1, Math.round(this.r * 0.35 * k));
    g.beginPath(); g.arc(this.x - cx, this.y - cy, r, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
}

export class Floaters {
  constructor() { this.list = []; }

  add(x, y, text, color = '#ffffff', scale = 1, vy = -38) {
    if (this.list.length >= MAX_FLOATERS) this.list.shift();
    this.list.push({ x: x + (Math.random() - 0.5) * 8, y, text: String(text), color, scale, vy, vx: (Math.random() - 0.5) * 20, life: 0.9, max: 0.9 });
  }

  update(dt) {
    for (const f of this.list) {
      f.life -= dt;
      f.y += f.vy * dt;
      f.x += f.vx * dt;
      f.vy += 50 * dt;
      f.vx *= 0.92;
    }
    this.list = this.list.filter((f) => f.life > 0);
  }

  draw(ctx, cx, cy) {
    for (const f of this.list) {
      const k = f.life / f.max;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      const pop = k > 0.85 ? 1 : 0;
      drawText(ctx, f.text, f.x - cx, f.y - cy - pop, f.color, f.scale);
    }
    ctx.globalAlpha = 1;
  }
}

/** Fading afterimage of a sprite (dash trails, blinks). */
export class Ghost {
  constructor(sprite, x, y, color = '#6ad0ff', life = 0.3) { this.s = sprite; this.x = x; this.y = y; this.color = color; this.life = life; this.maxLife = life; this.dead = false; }
  update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
  drawEmissive(g, cx, cy) {
    g.globalAlpha = 0.45 * (this.life / this.maxLife);
    g.drawImage(this.s.flash, Math.round(this.x - this.s.ax - cx), Math.round(this.y - this.s.ay - cy));
    g.globalAlpha = 1;
  }
}

/** Dying enemy sprite: flashes, sinks and fades. */
export class Corpse {
  constructor(sprite, x, y, life = 0.45) { this.s = sprite; this.x = x; this.y = y; this.life = life; this.maxLife = life; this.dead = false; }
  update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(ctx, cx, cy) {
    const k = this.life / this.maxLife;
    const sink = Math.round((1 - k) * 6);
    const img = k > 0.75 ? this.s.flash : this.s.c;
    const h = this.s.c.height - sink;
    if (h <= 0) return;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.drawImage(img, 0, 0, this.s.c.width, h, Math.round(this.x - this.s.ax - cx), Math.round(this.y - this.s.ay - cy + sink), this.s.c.width, h);
    ctx.globalAlpha = 1;
  }
}
