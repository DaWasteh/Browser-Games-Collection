// Enemies and guardians. Each archetype has its own state machine with readable telegraphs:
//  melee   – pursues, winds up a visible arc, strikes
//  ranged  – keeps a distance band, strafes, telegraphs a firing line
//  pounce  – fast, crouches then leaps
//  exploder– walks up, lights a fuse (growing circle), detonates (also on death → chain reactions)
//  brute   – slow, long wind-up ground slam with a circle telegraph and knockback
//  caster  – floats at range, fires homing orbs, blinks away when cornered

import { TAU, angleDiff, dir4, clamp } from '../core/math.js';
import { runtimeRng } from '../core/rng.js';
import { ARCHETYPES, SKINS, ELITE_MODS, BOSSES, depthScaling } from '../data/enemies.js';
import { getSprite, enemyLook, bossLook, silhouette } from '../fx/sprites.js';
import { BOSS_GLOW } from '../fx/bossArt.js';
import { P } from '../fx/particles.js';
import { Lighting } from '../fx/lighting.js';
import { drawText } from '../fx/font.js';
import { Projectile } from './projectile.js';
import { GroundEffect, Slash, Shockwave, Meteor, Ghost, Corpse, Flash } from './effects.js';
import { TILE } from '../config.js';

const BLOOD = {
  crypt: ['#5a1414', '#7a1a1a', '#3a0c0c'],
  fungal: ['#3a7a2a', '#5aa03a', '#2a5a1a'],
  ember: ['#c2461c', '#ff7a2e', '#6a1f0c'],
  void: ['#6a3aba', '#9a6aff', '#3a1a6a'],
};
const PROJ_KIND = { crypt: 'arrow', fungal: 'acid', ember: 'cinder', void: 'prism' };
const tintCache = new WeakMap();
function tinted(spr, color) {
  let m = tintCache.get(spr.c);
  if (!m) { m = new Map(); tintCache.set(spr.c, m); }
  let c = m.get(color);
  if (!c) { c = silhouette(spr.c, color); m.set(color, c); }
  return c;
}

function eyeOffset(L) {
  switch (L.plan) {
    case 'human': return L.big ? -34 : L.hunch ? -16 : -17;
    case 'bat': return -8;
    case 'spider': return -5;
    case 'blob': return L.big ? -18 : -9;
    case 'hulk': return L.big ? -36 : -22;
    case 'wisp': return -12;
    case 'boss': return -52;
    default: return -10;
  }
}

export class Enemy {
  constructor(desc, depth, skinId) {
    const def = ARCHETYPES[desc.arch];
    const pal = SKINS[skinId][desc.arch];
    const sc = depthScaling(depth);
    this.arch = desc.arch;
    this.def = def;
    this.skin = skinId;
    this.x = desc.x; this.y = desc.y;
    this.homeX = desc.x; this.homeY = desc.y;
    this.level = depth;
    this.elite = desc.elite && desc.elite.length ? desc.elite : null;
    this.mods = {};
    if (this.elite) for (const m of this.elite) this.mods[m] = true;
    const em = this.elite ? 1 : 0;
    this.maxHp = Math.round(def.hp * sc.hp * (em ? 2.7 : 1));
    this.hp = this.maxHp;
    this.dmg = def.dmg * sc.dmg * (em ? 1.2 : 1) * (this.mods.brutal ? 1.5 : 1);
    this.speed = def.speed * sc.speed * (this.mods.swift ? 1.35 : 1);
    this.cdMul = this.mods.swift ? 0.8 : 1;
    this.radius = def.radius + (em ? 1 : 0);
    this.height = def.height;
    this.knockResist = def.knockResist || (em ? 0.3 : 0);
    this.xp = Math.round(def.xp * sc.xp * (em ? 3 : 1));
    this.gold = [Math.round(def.gold[0] * sc.gold * (em ? 3 : 1)), Math.round(def.gold[1] * sc.gold * (em ? 3 : 1))];
    this.name = this.elite ? `${this.elite.map((m) => ELITE_MODS.find((x) => x.id === m).name).join(' ')} ${pal.name}` : pal.name;
    this.eliteColor = this.elite ? ELITE_MODS.find((x) => x.id === this.elite[0]).color : null;
    this.look = enemyLook(desc.arch, skinId, pal);
    this.eyeCol = pal.eye;
    this.accent = pal.accent;
    this.blood = BLOOD[skinId];
    this.pack = desc.pack;
    this.wander = !!desc.wander;
    this.state = 'idle';
    this.stateT = 0;
    this.cd = 0.4 + runtimeRng.next() * 1.2;
    this.aggroed = false;
    this.alertT = 0;
    this.kx = 0; this.ky = 0;
    this.flash = 0; this.slowT = 0; this.burnT = 0; this.burnDps = 0; this.burnTick = 0; this.stunT = 0;
    this.animT = runtimeRng.next() * 4;
    this.dir = 0;
    this.moving = false;
    this.strafeSign = runtimeRng.sign(); this.strafeT = 1;
    this.losT = 0; this.hasLos = false;
    this.tele = null;
    this.lockAngle = 0;
    this.wanderT = runtimeRng.float(0.5, 3);
    this.wanderTo = null;
    this.modT = runtimeRng.float(1, 3);
    this.frenzy = false;
    this.leapHit = false;
    this.blinkCd = 0;
    this.dead = false;
    this.isBoss = false;
  }

  canStagger() { return this.state === 'windup' && this.arch !== 'brute' && this.arch !== 'bloater'; }

  interrupt(t) {
    this.state = 'recover';
    this.stateT = t;
    this.tele = null;
  }

  provoke(game) {
    if (this.aggroed) return;
    this.aggroed = true;
    this.alertT = 0.8;
    // wake the pack
    for (const o of game.area.enemies) {
      if (o !== this && !o.aggroed && !o.dead && (o.pack === this.pack || Math.hypot(o.x - this.x, o.y - this.y) < 90)) {
        o.aggroed = true;
        o.alertT = 0.8;
      }
    }
  }

  die(game) {
    this.dead = true;
    this.tele = null;
    const ps = game.particles;
    ps.burst(P.BLOOD, this.x, this.y, this.isBoss ? 80 : 18, { speed: 80, z: this.height * 0.5, vz: 60, vzRand: 80, life: 1.4, colors: this.blood, size: 1 });
    ps.burst(P.BLOOD, this.x, this.y, this.isBoss ? 20 : 5, { speed: 50, z: this.height * 0.5, vz: 80, vzRand: 40, life: 1.4, colors: this.blood, size: 2 });
    ps.burst(P.DEBRIS, this.x, this.y, 6, { speed: 60, z: 8, vz: 70, vzRand: 50, life: 1.4, colors: [this.look.dark || '#3a3440', this.look.body || '#5a5460'] });
    if (this.skin === 'ember' || this.skin === 'void') ps.burst(P.EMBER, this.x, this.y, 16, { speed: 40, z: 8, grav: 30, life: 1.2, colors: this.blood });
    // blood pool decal
    for (let i = 0; i < (this.isBoss ? 60 : 10); i++) {
      const a = runtimeRng.next() * TAU, d = runtimeRng.next() * (this.isBoss ? 18 : 6);
      game.area.tiles.decal(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d * 0.7, this.blood[i % 3], 2, 1, 0.7);
    }
    game.effects.push(new Corpse(this.sprite(), this.x, this.y, this.isBoss ? 1.2 : 0.45));
    game.audio.play('enemyDie', 0.8);
    if (this.arch === 'bloater' && !this.detonated) {
      this.detonated = true;
      const x = this.x, y = this.y, r = this.def.blast, d = this.dmg * 0.8;
      game.later(0.22, () => game.combat.explode(x, y, r, d, { team: 'enemy', color: this.accent, poison: this.skin === 'fungal', fire: this.skin === 'ember', owner: this, shake: 4 }));
    }
  }

  // ------------------------------------------------------------------ movement helpers

  seekDir(game) {
    const pl = game.player;
    const d = Math.hypot(pl.x - this.x, pl.y - this.y);
    if (this.hasLos && d < 130) return Math.atan2(pl.y - this.y, pl.x - this.x);
    const wp = game.area.field ? game.area.field.next(this.x, this.y) : null;
    if (wp) return Math.atan2(wp.y - this.y, wp.x - this.x);
    return Math.atan2(pl.y - this.y, pl.x - this.x);
  }

  fleeDir(game) {
    const pl = game.player;
    const wp = game.area.field ? game.area.field.away(this.x, this.y) : null;
    if (wp) return Math.atan2(wp.y - this.y, wp.x - this.x);
    return Math.atan2(this.y - pl.y, this.x - pl.x);
  }

  // ------------------------------------------------------------------ update

  update(dt, game) {
    if (this.dead) return;
    const pl = game.player;
    this.flash = Math.max(0, this.flash - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.alertT = Math.max(0, this.alertT - dt);
    this.stunT = Math.max(0, this.stunT - dt);
    this.cd -= dt;
    this.blinkCd -= dt;
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.5;
        game.combat.hitEnemy(this, this.burnDps * 0.5, { element: 'fire', dot: true, quiet: true });
        game.particles.burst(P.FIRE, this.x, this.y, 3, { speed: 15, z: this.height * 0.5, grav: 30, life: 0.5, size: 2, colors: ['#ff9a2e', '#ffcf4a'] });
        if (this.dead) return;
      }
    }
    const dx = pl.x - this.x, dy = pl.y - this.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.18 + runtimeRng.next() * 0.12;
      this.hasLos = game.area.map.lineOfSight(this.x, this.y - 4, pl.x, pl.y - 4);
    }
    if (!this.aggroed && pl.alive && ((dist < this.def.aggro && this.hasLos) || dist < 40)) this.provoke(game);

    if (this.mods.frenzied && !this.frenzy && this.hp < this.maxHp * 0.4) {
      this.frenzy = true;
      game.floaters.add(this.x, this.y - this.height - 8, 'ENRAGED', '#ffd24a', 1);
    }
    const speedMul = (this.slowT > 0 ? 0.5 : 1) * (this.frenzy ? 1.4 : 1);
    const cdMul = this.cdMul * (this.frenzy ? 0.6 : 1);

    let mvAngle = 0, mvSpeed = 0;
    if (this.stunT > 0) {
      // staggered: no voluntary movement
    } else if (!this.aggroed || !pl.alive) {
      // idle wandering around the spawn point
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = runtimeRng.float(1.5, 4);
        this.wanderTo = runtimeRng.chance(0.6) ? game.area.map.randomWalkableNear(this.homeX, this.homeY, () => runtimeRng.next(), this.wander ? 6 : 3) : null;
      }
      if (this.wanderTo) {
        const wd = Math.hypot(this.wanderTo.x - this.x, this.wanderTo.y - this.y);
        if (wd > 3) { mvAngle = Math.atan2(this.wanderTo.y - this.y, this.wanderTo.x - this.x); mvSpeed = this.speed * 0.35; }
        else this.wanderTo = null;
      }
      this.tele = null;
      if (this.state !== 'idle') this.state = 'idle';
    } else {
      const r = this.think(dt, game, dist, toPlayer, cdMul);
      mvAngle = r[0]; mvSpeed = r[1] * speedMul;
    }

    // elite modifiers
    if (this.aggroed && !this.dead) {
      this.modT -= dt;
      if (this.mods.molten && this.moving && this.modT <= 0) {
        this.modT = 0.35;
        game.area.groundEffects.push(new GroundEffect('fire', this.x, this.y, 9, 2.6, this.dmg * 0.7, 'enemy'));
      } else if (this.mods.arcane && this.modT <= 0) {
        this.modT = 3.6;
        for (let i = 0; i < 6; i++) game.area.projectiles.push(new Projectile({ team: 'enemy', kind: 'hexOrb', x: this.x, y: this.y - 6, angle: (i / 6) * TAU + game.time, speed: 62, r: 3, dmg: this.dmg * 0.6, life: 3, color: '#b36bff', owner: this, level: this.level }));
        game.audio.play('enemyCast', 0.5);
      } else if (!this.mods.molten && !this.mods.arcane && this.modT <= 0) this.modT = 1;
    }

    // separation from other enemies
    let sx = 0, sy = 0;
    for (const o of game.area.enemies) {
      if (o === this || o.dead) continue;
      const ox = this.x - o.x, oy = this.y - o.y;
      const rr = this.radius + o.radius + 1;
      const d2 = ox * ox + oy * oy;
      if (d2 < rr * rr && d2 > 0.01) { const d = Math.sqrt(d2); sx += (ox / d) * (rr - d); sy += (oy / d) * (rr - d); }
    }
    const vx = Math.cos(mvAngle) * mvSpeed, vy = Math.sin(mvAngle) * mvSpeed;
    const kd = Math.exp(-8 * dt);
    this.kx *= kd; this.ky *= kd;
    const bx = this.x, by = this.y;
    game.area.map.move(this, (vx + this.kx) * dt + sx * 0.3, (vy + this.ky) * dt + sy * 0.3, this.radius, true);
    const moved = Math.hypot(this.x - bx, this.y - by);
    this.moving = mvSpeed > 1 && moved > 0.05;
    if (this.moving) this.animT += dt * 8 * clamp(mvSpeed / 40, 0.6, 1.8);
    else this.animT += dt * 2.2;
    if (this.state === 'windup' || this.state === 'fuse' || this.state === 'recover') this.dir = dir4(this.lockAngle);
    else if (this.moving) this.dir = dir4(mvAngle);
    else if (this.aggroed) this.dir = dir4(toPlayer);
    // stuck while strafing -> flip
    if (mvSpeed > 1 && moved < mvSpeed * dt * 0.2) this.strafeSign = -this.strafeSign;
  }

  /** Behaviour tree. Returns [moveAngle, moveSpeed]. */
  think(dt, game, dist, toPlayer, cdMul) {
    const d = this.def;
    const pl = game.player;
    switch (d.ai) {
      case 'melee': return this.thinkMelee(dt, game, dist, toPlayer, cdMul);
      case 'ranged': case 'caster': return this.thinkRanged(dt, game, dist, toPlayer, cdMul);
      case 'pounce': return this.thinkPounce(dt, game, dist, toPlayer, cdMul);
      case 'exploder': return this.thinkExploder(dt, game, dist, toPlayer);
      case 'brute': return this.thinkBrute(dt, game, dist, toPlayer, cdMul);
      default: void pl; return [toPlayer, this.speed];
    }
  }

  thinkMelee(dt, game, dist, toPlayer, cdMul) {
    const d = this.def;
    if (this.state === 'windup') {
      this.stateT -= dt;
      this.tele.progress = 1 - this.stateT / this.tele.dur;
      if (this.stateT <= 0) {
        const pl = game.player;
        const inReach = dist - pl.radius <= d.reach + 2 && Math.abs(angleDiff(this.lockAngle, toPlayer)) <= d.arc / 2 + 0.25;
        game.effects.push(new Slash(this.x, this.y - 6, this.lockAngle, d.arc, d.reach, '#ff6a5a', 0.14, 1));
        if (inReach) this.strike(game, this.dmg, toPlayer, 110);
        this.state = 'recover'; this.stateT = d.recover; this.cd = d.cooldown * cdMul; this.tele = null;
      }
      return [0, 0];
    }
    if (this.state === 'recover') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.state = 'chase';
      return [toPlayer, this.speed * 0.25];
    }
    this.state = 'chase';
    if (dist <= d.attackRange + 4 && this.cd <= 0 && this.hasLos) {
      this.state = 'windup';
      this.lockAngle = toPlayer;
      const w = d.windup * (this.mods.swift ? 0.8 : 1) * (this.frenzy ? 0.75 : 1);
      this.stateT = w;
      this.tele = { type: 'arc', angle: toPlayer, arc: d.arc, r: d.reach, dur: w, progress: 0 };
      return [0, 0];
    }
    if (dist < d.attackRange * 0.7) return [toPlayer, 0];
    return [this.seekDir(game), this.speed];
  }

  thinkRanged(dt, game, dist, toPlayer, cdMul) {
    const d = this.def;
    const caster = d.ai === 'caster';
    if (this.state === 'windup') {
      this.stateT -= dt;
      const k = 1 - this.stateT / this.tele.dur;
      this.tele.progress = k;
      if (k < 0.7) { this.lockAngle = toPlayer; this.tele.angle = toPlayer; }
      if (this.stateT <= 0) {
        this.fire(game);
        this.state = 'recover'; this.stateT = d.recover; this.cd = d.cooldown * cdMul * runtimeRng.float(0.85, 1.2); this.tele = null;
      }
      return [0, 0];
    }
    if (this.state === 'recover') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.state = 'chase';
      return [0, 0];
    }
    this.state = 'chase';
    if (caster && d.blink && dist < 52 && this.blinkCd <= 0) { this.blink(game); return [0, 0]; }
    if (this.hasLos && dist < d.preferMax + 50 && this.cd <= 0) {
      this.state = 'windup';
      this.lockAngle = toPlayer;
      const w = d.windup * (this.frenzy ? 0.7 : 1);
      this.stateT = w;
      this.tele = caster ? { type: 'orb', angle: toPlayer, dur: w, progress: 0 } : { type: 'line', angle: toPlayer, len: Math.min(dist + 30, 190), dur: w, progress: 0 };
      if (caster) game.audio.play('enemyCast', 0.4);
      return [0, 0];
    }
    if (!this.hasLos || dist > d.preferMax) return [this.seekDir(game), this.speed];
    if (dist < d.preferMin) return [this.fleeDir(game), this.speed * 0.9];
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = runtimeRng.float(1.1, 2.2); this.strafeSign = runtimeRng.sign(); }
    return [toPlayer + (Math.PI / 2) * this.strafeSign, this.speed * 0.55];
  }

  thinkPounce(dt, game, dist, toPlayer, cdMul) {
    const d = this.def;
    if (this.state === 'windup') {
      this.stateT -= dt;
      this.tele.progress = 1 - this.stateT / this.tele.dur;
      if (this.stateT <= 0) { this.state = 'leap'; this.stateT = d.leapTime; this.leapHit = false; game.audio.play('dash', 0.5); }
      return [0, 0];
    }
    if (this.state === 'leap') {
      this.stateT -= dt;
      const pl = game.player;
      if (!this.leapHit && Math.hypot(pl.x - this.x, pl.y - this.y) < this.radius + pl.radius + 3) {
        this.leapHit = true;
        this.strike(game, this.dmg, this.lockAngle, 80);
      }
      if (this.stateT <= 0) { this.state = 'recover'; this.stateT = d.recover; this.cd = d.cooldown * cdMul; this.tele = null; }
      return [this.lockAngle, d.leapSpeed];
    }
    if (this.state === 'recover') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.state = 'chase';
      return [toPlayer + Math.PI * 0.6 * this.strafeSign, this.speed * 0.4];
    }
    this.state = 'chase';
    if (dist < d.attackRange && this.cd <= 0 && this.hasLos) {
      this.state = 'windup';
      this.lockAngle = toPlayer;
      this.stateT = d.windup;
      this.tele = { type: 'line', angle: toPlayer, len: d.leapSpeed * d.leapTime, dur: d.windup, progress: 0, thin: true };
      return [0, 0];
    }
    // zig-zag approach
    const wig = Math.sin(game.time * 6 + this.pack) * 0.6;
    return [this.seekDir(game) + (this.hasLos ? wig : 0), this.speed];
  }

  thinkExploder(dt, game, dist, toPlayer) {
    const d = this.def;
    if (this.state === 'fuse') {
      this.stateT -= dt;
      this.tele.progress = 1 - this.stateT / d.fuse;
      this.flash = Math.sin(this.stateT * 40) > 0.3 ? 0.05 : 0;
      if (this.stateT <= 0) {
        this.detonated = true;
        this.dead = true;
        this.tele = null;
        game.effects.push(new Corpse(this.sprite(), this.x, this.y, 0.2));
        game.combat.explode(this.x, this.y, d.blast, this.dmg, { team: 'enemy', color: this.accent, poison: this.skin === 'fungal', fire: this.skin === 'ember', owner: this, shake: 5 });
        for (let i = 0; i < 12; i++) game.area.tiles.decal(this.x + (runtimeRng.next() - 0.5) * 20, this.y + (runtimeRng.next() - 0.5) * 14, this.blood[i % 3], 2, 1, 0.8);
      }
      return [toPlayer, this.speed * 0.3];
    }
    this.state = 'chase';
    if (dist < d.attackRange + 6) {
      this.state = 'fuse';
      this.stateT = d.fuse;
      this.lockAngle = toPlayer;
      this.tele = { type: 'circle', r: d.blast, dur: d.fuse, progress: 0 };
      game.audio.play('telegraph', 0.6);
      return [0, 0];
    }
    return [this.seekDir(game), this.speed];
  }

  thinkBrute(dt, game, dist, toPlayer, cdMul) {
    const d = this.def;
    if (this.state === 'windup') {
      this.stateT -= dt;
      this.tele.progress = 1 - this.stateT / this.tele.dur;
      if (this.stateT <= 0) {
        const pl = game.player;
        const cx = this.tele.x, cy = this.tele.y;
        if (Math.hypot(pl.x - cx, pl.y - cy) < d.slamRadius + pl.radius) this.strike(game, this.dmg, Math.atan2(pl.y - cy, pl.x - cx), 220);
        game.effects.push(new Flash(cx, cy, 18, '#ffcf8a', 0.15));
        game.effects.push(new Shockwave(cx, cy, d.slamRadius + 8, 260, 0, 'none', '#d8b08a'));
        game.particles.burst(P.DEBRIS, cx, cy, 16, { speed: 90, z: 2, vz: 80, vzRand: 60, life: 1.2, colors: ['#5a5460', '#3a3440'] });
        game.particles.burst(P.DUST, cx, cy, 20, { speed: 80, life: 0.8, size: 4, colors: ['#8a8090', '#6a6070'] });
        game.area.tiles.scorch(cx, cy, 10);
        game.shake(4, 0.25);
        game.audio.play('explode', 0.5);
        this.state = 'recover'; this.stateT = d.recover; this.cd = d.cooldown * cdMul; this.tele = null;
      }
      return [0, 0];
    }
    if (this.state === 'recover') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.state = 'chase';
      return [0, 0];
    }
    this.state = 'chase';
    if (dist < d.attackRange + 6 && this.cd <= 0 && this.hasLos) {
      this.state = 'windup';
      this.lockAngle = toPlayer;
      const w = d.windup * (this.frenzy ? 0.7 : 1);
      this.stateT = w;
      this.tele = { type: 'circle', x: this.x + Math.cos(toPlayer) * 10, y: this.y + Math.sin(toPlayer) * 10, r: d.slamRadius, dur: w, progress: 0 };
      game.audio.play('telegraph', 0.5);
      return [0, 0];
    }
    return [this.seekDir(game), this.speed];
  }

  strike(game, dmg, angle, knock) {
    const dealt = game.combat.hitPlayer(dmg, { angle, knock, source: this, level: this.level });
    if (dealt > 0 && this.mods.vampiric) {
      this.hp = Math.min(this.maxHp, this.hp + dealt * 1.5);
      game.particles.burst(P.MAGIC, this.x, this.y, 8, { speed: 30, z: 10, life: 0.5, size: 2, colors: ['#ff3a6a'] });
    }
  }

  fire(game) {
    const d = this.def;
    const a = this.lockAngle;
    const ox = this.x + Math.cos(a) * 6, oy = this.y - 2 + Math.sin(a) * 6;
    if (d.ai === 'caster') {
      for (const off of [-0.35, 0, 0.35]) {
        game.area.projectiles.push(new Projectile({ team: 'enemy', kind: 'hexOrb', x: ox, y: oy, angle: a + off, speed: d.projSpeed, r: 3, dmg: this.dmg, life: 3.2, homing: 1.3, color: this.accent, owner: this, level: this.level }));
      }
      game.audio.play('enemyCast', 0.6);
    } else {
      const kind = PROJ_KIND[this.skin];
      game.area.projectiles.push(new Projectile({ team: 'enemy', kind, x: ox, y: oy, angle: a, speed: d.projSpeed * (kind === 'prism' ? 1.4 : 1), r: kind === 'acid' ? 3 : 2, dmg: this.dmg, life: 2.2, color: kind === 'arrow' ? '#ff9a6a' : this.accent, owner: this, level: this.level, element: kind === 'acid' ? 'poison' : null }));
      game.audio.play('shoot', 0.6);
    }
  }

  blink(game) {
    const map = game.area.map;
    const pl = game.player;
    for (let k = 0; k < 20; k++) {
      const a = runtimeRng.next() * TAU, r = runtimeRng.float(90, 150);
      const nx = pl.x + Math.cos(a) * r, ny = pl.y + Math.sin(a) * r;
      if (!map.walkable(Math.floor(nx / TILE), Math.floor(ny / TILE))) continue;
      if (!map.lineOfSight(this.x, this.y, nx, ny) && k < 12) continue;
      game.effects.push(new Ghost(this.sprite(), this.x, this.y, this.accent, 0.4));
      game.particles.burst(P.MAGIC, this.x, this.y, 16, { speed: 60, z: 10, life: 0.5, size: 2, colors: [this.accent, '#ffffff'] });
      this.x = nx; this.y = ny;
      map.resolveCircle(this, this.radius, true);
      game.particles.burst(P.MAGIC, this.x, this.y, 16, { speed: 60, z: 10, life: 0.5, size: 2, colors: [this.accent, '#ffffff'] });
      this.blinkCd = 4;
      this.cd = Math.min(this.cd, 0.6);
      game.audio.play('void', 0.35);
      return;
    }
    this.blinkCd = 1.5;
  }

  // ------------------------------------------------------------------ rendering

  pose() {
    if (this.state === 'windup' || this.state === 'fuse') return 'windup';
    if (this.state === 'recover' || this.state === 'leap') return 'strike';
    return this.moving ? 'walk' : 'idle';
  }

  sprite() {
    return getSprite(this.look, this.dir, Math.floor(this.animT), this.pose());
  }

  draw(ctx, cx, cy) {
    const s = this.sprite();
    const x = Math.round(this.x - s.ax - cx), y = Math.round(this.y - s.ay - cy);
    if (this.flash > 0) ctx.drawImage(s.flash, x, y);
    else {
      ctx.drawImage(s.c, x, y);
      if (this.slowT > 0) { ctx.globalAlpha = 0.35; ctx.drawImage(tinted(s, '#8ae0ff'), x, y); ctx.globalAlpha = 1; }
      if (this.frenzy) { ctx.globalAlpha = 0.25 + 0.15 * Math.sin(this.animT * 5); ctx.drawImage(tinted(s, '#ff3a1a'), x, y); ctx.globalAlpha = 1; }
    }
  }

  drawEmissive(g, cx, cy, time) {
    const s = this.sprite();
    // elite aura: coloured outline
    if (this.eliteColor) {
      const t = tinted(s, this.eliteColor);
      const x = Math.round(this.x - s.ax - cx), y = Math.round(this.y - s.ay - cy);
      g.globalAlpha = 0.5 + 0.2 * Math.sin(time * 5);
      g.drawImage(t, x - 1, y); g.drawImage(t, x + 1, y); g.drawImage(t, x, y - 1); g.drawImage(t, x, y + 1);
      g.globalAlpha = 1;
      Lighting.glow(g, this.x - cx, this.y - cy - this.height * 0.5, this.height, this.eliteColor, 0.18);
    }
    // eyes
    if (this.dir !== 3) {
      const ey = Math.round(this.y + eyeOffset(this.look) - cy + (this.state === 'windup' ? 1 : 0));
      const ex = Math.round(this.x - cx);
      const col = this.state === 'windup' || this.state === 'fuse' ? '#ffffff' : this.eyeCol;
      g.fillStyle = col;
      const spread = this.look.big ? 4 : this.look.plan === 'hulk' ? 3 : 2;
      if (this.dir === 0) { g.fillRect(ex - spread, ey, 1, 1); g.fillRect(ex + spread - 1, ey, 1, 1); }
      else g.fillRect(ex + (this.dir === 2 ? spread : -spread), ey, 1, 1);
      Lighting.glow(g, ex, ey, 4, this.eyeCol, 0.35);
    }
    this.drawTelegraph(g, cx, cy, time);
  }

  drawTelegraph(g, cx, cy, time) {
    const t = this.tele;
    if (!t) return;
    const k = clamp(t.progress, 0, 1);
    const pulse = 0.55 + 0.45 * Math.sin(time * 24);
    const red = '#ff3a2a';
    g.save();
    if (t.type === 'arc') {
      const x = this.x - cx, y = this.y - 4 - cy;
      g.fillStyle = red;
      g.globalAlpha = 0.12 + 0.1 * k;
      g.beginPath(); g.moveTo(x, y); g.ellipse(x, y, t.r, t.r * 0.82, 0, t.angle - t.arc / 2, t.angle + t.arc / 2); g.closePath(); g.fill();
      g.globalAlpha = 0.35 * k + 0.1;
      g.beginPath(); g.moveTo(x, y); g.ellipse(x, y, t.r * k, t.r * 0.82 * k, 0, t.angle - t.arc / 2, t.angle + t.arc / 2); g.closePath(); g.fill();
      g.globalAlpha = 0.8 * pulse;
      g.strokeStyle = red;
      g.beginPath(); g.ellipse(x, y, t.r, t.r * 0.82, 0, t.angle - t.arc / 2, t.angle + t.arc / 2); g.stroke();
    } else if (t.type === 'circle') {
      const x = (t.x ?? this.x) - cx, y = (t.y ?? this.y) - cy;
      g.fillStyle = red;
      g.globalAlpha = 0.1 + 0.08 * k;
      g.beginPath(); g.ellipse(x, y, t.r, t.r * 0.8, 0, 0, TAU); g.fill();
      g.globalAlpha = 0.3;
      g.beginPath(); g.ellipse(x, y, t.r * k, t.r * 0.8 * k, 0, 0, TAU); g.fill();
      g.globalAlpha = 0.85 * pulse;
      g.strokeStyle = red;
      g.beginPath(); g.ellipse(x, y, t.r, t.r * 0.8, 0, 0, TAU); g.stroke();
    } else if (t.type === 'line') {
      const x = this.x - cx, y = this.y - 6 - cy;
      g.translate(x, y);
      g.rotate(t.angle);
      const w = t.thin ? 4 : 3;
      g.fillStyle = red;
      g.globalAlpha = 0.14;
      g.fillRect(0, -w / 2, t.len, w);
      g.globalAlpha = 0.55 * pulse + 0.2;
      g.fillRect(0, -0.5, t.len * k, 1);
      g.globalAlpha = 0.9;
      g.fillRect(t.len * k - 2, -1, 2, 2);
    } else if (t.type === 'orb') {
      const x = this.x + Math.cos(t.angle) * 8 - cx, y = this.y - 12 + Math.sin(t.angle) * 4 - cy;
      Lighting.glow(g, x, y, 5 + k * 9, this.accent, 0.8);
      g.globalAlpha = 1;
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
    }
    g.restore();
  }

  /** Red outline when the cursor rests on this enemy. */
  drawHover(g, cx, cy) {
    const s = this.sprite();
    const t = tinted(s, '#ff4a3a');
    const x = Math.round(this.x - s.ax - cx), y = Math.round(this.y - s.ay - cy);
    g.globalAlpha = 0.8;
    g.drawImage(t, x - 1, y); g.drawImage(t, x + 1, y); g.drawImage(t, x, y - 1); g.drawImage(t, x, y + 1);
    g.globalAlpha = 1;
  }

  /** HP bar, elite names and alert markers (drawn after lighting for readability). */
  drawOverlay(ctx, cx, cy, game, hovered = false) {
    const top = Math.round(this.y - cy + eyeOffset(this.look) - (this.look.big ? 14 : 9));
    const x = Math.round(this.x - cx);
    if (this.alertT > 0) {
      const bounce = Math.round(Math.sin((0.8 - this.alertT) * 12) * 1.5);
      drawText(ctx, '!', x, top - 9 - bounce, '#ffcf3a', 1);
    }
    if (this.isBoss) return;
    const near = !game || !game.player || Math.hypot(game.player.x - this.x, game.player.y - this.y) < 140;
    if (this.elite && (near || hovered)) drawText(ctx, this.name, x, top - 8, this.eliteColor, 1);
    else if (hovered) drawText(ctx, this.name, x, top - 8, '#f0e0d0', 1);
    if (this.hp < this.maxHp || hovered) {
      const w = this.elite ? 18 : 12;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - w / 2 - 1, top - 1, w + 2, 3);
      ctx.fillStyle = this.elite ? this.eliteColor : '#d8302a';
      ctx.fillRect(x - w / 2, top, Math.max(1, Math.round(w * this.hp / this.maxHp)), 1);
    }
  }

  light() {
    if (this.eliteColor) return { x: this.x, y: this.y - 8, radius: 34, color: this.eliteColor, intensity: 0.35 };
    if (this.skin === 'ember' || this.arch === 'caster') return { x: this.x, y: this.y - 8, radius: 26, color: this.accent, intensity: 0.3 };
    return null;
  }
}

// ======================================================================= guardians

export class Boss extends Enemy {
  constructor(spawn, depth) {
    super({ arch: 'brute', x: spawn.x, y: spawn.y, elite: null, pack: -1 }, depth, 'crypt');
    const def = BOSSES[spawn.id];
    this.bossId = spawn.id;
    this.bdef = def;
    this.isBoss = true;
    const cycle = Math.floor((depth - 1) / 20);
    const sc = depthScaling(depth);
    this.maxHp = Math.round(def.hp * (0.55 + depth * 0.09) * (1 + cycle * 0.6));
    this.hp = this.maxHp;
    this.dmg = def.dmg * Math.sqrt(sc.dmg) * (1 + cycle * 0.4);
    this.speed = def.speed;
    this.radius = def.radius;
    this.height = 38;
    this.knockResist = 0.9;
    this.xp = Math.round(def.xp * sc.xp);
    this.gold = [Math.round(def.gold[0] * sc.gold), Math.round(def.gold[1] * sc.gold)];
    this.name = def.name;
    this.title = def.title;
    this.look = bossLook(spawn.id, def);
    this.eyeCol = def.eye;
    this.accent = def.accent;
    this.blood = spawn.id === 'mycelia' ? BLOOD.fungal : spawn.id === 'colossus' ? BLOOD.ember : spawn.id === 'seer' ? BLOOD.void : ['#cfc6ae', '#8a8270', '#4a4436'];
    this.awake = false;
    this.phase = 1;
    this.patternCd = 1.5;
    this.pat = null;
    this.lastPattern = null;
    this.minions = [];
    this.shielded = false;
    this.shieldT = 0;
    this.skin = { ossuary: 'crypt', mycelia: 'fungal', colossus: 'ember', seer: 'void' }[spawn.id];
  }

  canStagger() { return false; }

  provoke(game) {
    if (!this.awake) this.awaken(game);
    this.aggroed = true;
  }

  awaken(game) {
    this.awake = true;
    this.aggroed = true;
    game.onBossAwake(this);
    game.audio.play('bossRoar');
    game.shake(5, 0.6);
    game.effects.push(new Shockwave(this.x, this.y, 90, 200, 0, 'none', this.accent));
  }

  update(dt, game) {
    if (this.dead) return;
    const pl = game.player;
    this.flash = Math.max(0, this.flash - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    const dist = Math.hypot(pl.x - this.x, pl.y - this.y);
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.2; this.hasLos = game.area.map.lineOfSight(this.x, this.y - 8, pl.x, pl.y - 8); }
    if (!this.awake) {
      this.animT += dt * 1.5;
      if (pl.alive && dist < 170 && this.hasLos) this.awaken(game);
      return;
    }
    if (this.burnT > 0) {
      this.burnT -= dt; this.burnTick -= dt;
      if (this.burnTick <= 0) { this.burnTick = 0.5; game.combat.hitEnemy(this, this.burnDps * 0.5, { element: 'fire', dot: true, quiet: true }); if (this.dead) return; }
    }
    if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) this.shielded = false; }
    // phase change
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2;
      this.pat = null;
      this.tele = null;
      this.shielded = true; this.shieldT = 1.4;
      game.audio.play('bossRoar');
      game.shake(6, 0.7);
      game.toast(`${this.name} is enraged!`, 'boss');
      game.effects.push(new Shockwave(this.x, this.y, 160, 170, this.dmg * 0.6, 'enemy', this.accent));
      this.startPattern(game, 'summon');
    }
    this.minions = this.minions.filter((m) => !m.dead);

    // stunned after slamming into a wall: a short window to punish the guardian
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.state = 'stunned';
      this.animT += dt;
      if (runtimeRng.chance(dt * 10)) game.particles.spawn(P.GLINT, this.x + (runtimeRng.next() - 0.5) * 20, this.y - 50, 4, 0, 0, 10, 0.5, 1, '#fff0a0', 1, 0);
      return;
    }

    let mvA = 0, mvS = 0;
    const toPlayer = Math.atan2(pl.y - this.y, pl.x - this.x);
    if (this.pat) {
      const r = this.runPattern(dt, game, dist, toPlayer);
      if (r) { mvA = r[0]; mvS = r[1]; }
    } else {
      this.patternCd -= dt * (this.phase === 2 ? 1.45 : 1);
      const prefer = this.bossId === 'seer' ? 110 : this.bossId === 'mycelia' ? 60 : 26;
      if (dist > prefer + 10) { mvA = this.seekDir(game); mvS = this.speed; }
      else if (dist < prefer - 20 && this.bossId === 'seer') { mvA = toPlayer + Math.PI; mvS = this.speed; }
      else { mvA = toPlayer + Math.PI / 2 * this.strafeSign; mvS = this.speed * 0.4; }
      if (this.patternCd <= 0 && pl.alive) {
        const opts = this.bdef.patterns.filter((p) => p !== this.lastPattern && !(p === 'summon' && this.minions.length >= 5));
        this.startPattern(game, runtimeRng.pick(opts));
      }
    }
    if (this.slowT > 0) mvS *= 0.7;
    const kd = Math.exp(-8 * dt);
    this.kx *= kd; this.ky *= kd;
    const bx = this.x, by = this.y;
    game.area.map.move(this, (Math.cos(mvA) * mvS + this.kx) * dt, (Math.sin(mvA) * mvS + this.ky) * dt, this.radius, true);
    this.moving = Math.hypot(this.x - bx, this.y - by) > 0.05 && mvS > 1;
    this.animT += dt * (this.moving ? 6 : 2);
    this.dir = dir4(this.pat && this.pat.lock != null ? this.pat.lock : toPlayer);
    if (this.bossId === 'mycelia' && runtimeRng.chance(dt * 6)) game.particles.spawn(P.SMOKE, this.x + (runtimeRng.next() - 0.5) * 30, this.y, 20, 0, 0, 8, 1.2, 3, '#c07aa0', 1, 3);
    if (this.bossId === 'colossus' && runtimeRng.chance(dt * 10)) game.particles.spawn(P.EMBER, this.x + (runtimeRng.next() - 0.5) * 24, this.y - 20, 10, 0, 0, 20, 1, 1, '#ffb347', 0.5, 10);
  }

  startPattern(game, name) {
    this.lastPattern = name;
    this.pat = { name, t: 0, step: 0, lock: null, fired: 0 };
    this.tele = null;
  }

  endPattern(cd = 1.6) {
    this.pat = null;
    this.tele = null;
    this.patternCd = cd * runtimeRng.float(0.8, 1.2);
    this.state = 'chase';
  }

  runPattern(dt, game, dist, toPlayer) {
    const p = this.pat;
    p.t += dt;
    const pl = game.player;
    const two = this.phase === 2;
    switch (p.name) {
      case 'charge': {
        if (p.step === 0) {
          if (p.t < 0.45) p.lock = toPlayer;
          this.state = 'windup';
          this.tele = { type: 'line', angle: p.lock, len: 220, dur: 0.75, progress: p.t / 0.75 };
          if (p.t >= 0.75) { p.step = 1; p.t = 0; this.tele = null; game.audio.play('dash'); p.hit = false; }
          return [0, 0];
        }
        this.state = 'leap';
        if (!p.hit && Math.hypot(pl.x - this.x, pl.y - this.y) < this.radius + 7) { p.hit = true; this.strike(game, this.dmg * 1.3, p.lock, 260); }
        if (runtimeRng.chance(0.6)) game.particles.burst(P.DUST, this.x, this.y, 2, { speed: 20, life: 0.5, size: 3, colors: ['#8a8090'] });
        const bx = this.x, by = this.y;
        game.area.map.move(this, Math.cos(p.lock) * 320 * dt, Math.sin(p.lock) * 320 * dt, this.radius, true);
        const blocked = Math.hypot(this.x - bx, this.y - by) < 320 * dt * 0.5;
        if (blocked || p.t > 0.75) {
          if (blocked) {
            game.shake(6, 0.35);
            game.audio.play('explode', 0.6);
            game.particles.burst(P.DEBRIS, this.x + Math.cos(p.lock) * 12, this.y + Math.sin(p.lock) * 12, 20, { speed: 90, z: 12, vz: 60, life: 1.4, colors: ['#5a5460', '#3a3440'] });
            this.stunT = 0.8;
          }
          this.endPattern(blocked ? 2.2 : 1.2);
        }
        return null;
      }
      case 'sweep': {
        if (p.t < 0.3) p.lock = toPlayer;
        this.state = 'windup';
        const w = two ? 0.5 : 0.62;
        this.tele = { type: 'arc', angle: p.lock, arc: 3.4, r: 46, dur: w, progress: p.t / w };
        if (p.t >= w) {
          game.effects.push(new Slash(this.x, this.y - 10, p.lock, 3.4, 46, this.accent, 0.2, 1));
          const inArc = dist < 46 + pl.radius && Math.abs(angleDiff(p.lock, toPlayer)) < 1.8;
          if (inArc) this.strike(game, this.dmg * 1.2, toPlayer, 200);
          game.audio.play('swingHeavy');
          this.endPattern(1.1);
        }
        return [0, 0];
      }
      case 'boneRing': {
        const n = two ? 20 : 14;
        if (p.step === 0 && p.t > 0.45) {
          p.step = 1;
          const kind = this.bossId === 'seer' ? 'voidOrb' : 'bone';
          for (let i = 0; i < n; i++) game.area.projectiles.push(new Projectile({ team: 'enemy', kind, x: this.x, y: this.y - 6, angle: (i / n) * TAU, speed: 105, r: 3, dmg: this.dmg * 0.7, life: 3.5, color: this.accent, owner: this, level: this.level }));
          game.audio.play('enemyCast');
        }
        if (two && p.step === 1 && p.t > 0.85) {
          p.step = 2;
          for (let i = 0; i < n; i++) game.area.projectiles.push(new Projectile({ team: 'enemy', kind: 'bone', x: this.x, y: this.y - 6, angle: ((i + 0.5) / n) * TAU, speed: 90, r: 3, dmg: this.dmg * 0.7, life: 3.5, color: this.accent, owner: this, level: this.level }));
        }
        this.tele = p.step === 0 ? { type: 'circle', r: 26, dur: 0.45, progress: p.t / 0.45 } : null;
        if (p.t > 1.1) this.endPattern(1.3);
        return [0, 0];
      }
      case 'summon': {
        this.tele = { type: 'circle', r: 34, dur: 0.8, progress: p.t / 0.8 };
        if (p.t > 0.8) {
          const n = two ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + runtimeRng.next();
            const x = this.x + Math.cos(a) * 30, y = this.y + Math.sin(a) * 24;
            const m = game.spawnMinion(runtimeRng.pick(['grunt', 'skitter', 'grunt', 'archer']), x, y, this.skin);
            if (m) this.minions.push(m);
          }
          game.audio.play('enemyCast');
          this.endPattern(1.5);
        }
        return [0, 0];
      }
      case 'sporeSpiral': case 'voidSpiral': {
        const dur = 2.4;
        const arms = two ? 3 : 2;
        const rate = p.name === 'voidSpiral' ? 0.12 : 0.08;
        while (p.fired * rate < p.t && p.t < dur) {
          p.fired++;
          const base = p.fired * 0.32;
          for (let a = 0; a < arms; a++) {
            const ang = base + (a / arms) * TAU;
            game.area.projectiles.push(new Projectile({ team: 'enemy', kind: p.name === 'voidSpiral' ? 'voidOrb' : 'spore', x: this.x, y: this.y - 8, angle: ang, speed: p.name === 'voidSpiral' ? 70 : 85, r: 3, dmg: this.dmg * 0.55, life: 3.5, color: this.accent, owner: this, level: this.level }));
          }
        }
        if (p.t >= dur) this.endPattern(1.5);
        return [0, 0];
      }
      case 'sporeRing': {
        if (p.step === 0 && p.t > 0.5) {
          p.step = 1;
          for (let i = 0; i < 12; i++) game.area.projectiles.push(new Projectile({ team: 'enemy', kind: 'spore', x: this.x, y: this.y - 6, angle: (i / 12) * TAU, speed: 80, r: 4, dmg: this.dmg * 0.6, life: 3, color: '#ff9ad8', owner: this, level: this.level }));
          for (let i = 0; i < 3; i++) {
            const a = runtimeRng.next() * TAU;
            game.area.groundEffects.push(new GroundEffect('poison', this.x + Math.cos(a) * 50, this.y + Math.sin(a) * 40, 22, 5, this.dmg * 0.5, 'enemy'));
          }
          game.audio.play('enemyCast');
        }
        this.tele = p.step === 0 ? { type: 'circle', r: 30, dur: 0.5, progress: p.t / 0.5 } : null;
        if (p.t > 0.9) this.endPattern(1.4);
        return [0, 0];
      }
      case 'slam': {
        const w = two ? 0.75 : 0.95;
        this.tele = { type: 'circle', r: 46, dur: w, progress: p.t / w };
        if (p.t >= w) {
          if (dist < 46 + pl.radius) this.strike(game, this.dmg * 1.3, toPlayer, 240);
          game.effects.push(new Shockwave(this.x, this.y, two ? 200 : 170, 150, this.dmg * 0.7, 'enemy', this.accent));
          game.effects.push(new Flash(this.x, this.y, 28, this.accent, 0.25));
          game.particles.burst(P.DEBRIS, this.x, this.y, 30, { speed: 120, z: 4, vz: 90, vzRand: 60, life: 1.5, colors: ['#5a5460', '#3a3440', this.bdef.dark] });
          game.area.tiles.scorch(this.x, this.y, 22);
          game.shake(7, 0.4);
          game.audio.play('explode');
          this.endPattern(1.6);
        }
        return [0, 0];
      }
      case 'meteors': {
        if (p.step === 0) {
          p.step = 1;
          const n = two ? 8 : 5;
          for (let i = 0; i < n; i++) {
            const a = runtimeRng.next() * TAU, r = i === 0 ? 0 : runtimeRng.float(16, 80);
            const mx = pl.x + Math.cos(a) * r, my = pl.y + Math.sin(a) * r * 0.8;
            game.area.effects.push(new Meteor(mx, my, 20, 1.0 + i * 0.12, this.dmg, 'enemy', this.bossId === 'seer' ? '#b36bff' : '#ff7a2e', this.bossId === 'seer' ? 'void' : 'fire'));
          }
          game.audio.play('telegraph');
        }
        if (p.t > 1.2) this.endPattern(1.6);
        return [0, 0];
      }
      case 'fireWave': {
        const volleys = two ? 4 : 3;
        while (p.fired < volleys && p.t > p.fired * 0.38 + 0.3) {
          p.fired++;
          for (let i = -3; i <= 3; i++) game.area.projectiles.push(new Projectile({ team: 'enemy', kind: 'fireball', x: this.x, y: this.y - 8, angle: toPlayer + i * 0.2 + (p.fired % 2 ? 0.1 : 0), speed: 120, r: 4, dmg: this.dmg * 0.65, life: 2.8, color: '#ff8a2e', owner: this, level: this.level }));
          game.audio.play('ember', 0.8);
        }
        this.tele = p.fired === 0 ? { type: 'orb', angle: toPlayer, dur: 0.3, progress: p.t / 0.3 } : null;
        if (p.fired >= volleys && p.t > volleys * 0.38 + 0.5) this.endPattern(1.5);
        return [0, 0];
      }
      case 'blink': {
        if (p.step === 0) {
          p.step = 1;
          game.effects.push(new Ghost(this.sprite(), this.x, this.y, this.accent, 0.5));
          game.particles.burst(P.MAGIC, this.x, this.y, 30, { speed: 80, z: 16, life: 0.6, size: 2, colors: [this.accent, '#ffffff'] });
          this.invulnerable = true;
          this.hidden = true;
          game.audio.play('void');
        }
        if (p.step === 1 && p.t > 0.45) {
          p.step = 2;
          const map = game.area.map;
          for (let k = 0; k < 30; k++) {
            const a = runtimeRng.next() * TAU, r = runtimeRng.float(80, 130);
            const nx = pl.x + Math.cos(a) * r, ny = pl.y + Math.sin(a) * r;
            if (map.walkable(Math.floor(nx / TILE), Math.floor(ny / TILE)) && map.lineOfSight(pl.x, pl.y, nx, ny)) { this.x = nx; this.y = ny; break; }
          }
          map.resolveCircle(this, this.radius, true);
          this.invulnerable = false;
          this.hidden = false;
          game.particles.burst(P.MAGIC, this.x, this.y, 30, { speed: 80, z: 16, life: 0.6, size: 2, colors: [this.accent, '#ffffff'] });
          for (let i = 0; i < 10; i++) game.area.projectiles.push(new Projectile({ team: 'enemy', kind: 'voidOrb', x: this.x, y: this.y - 8, angle: (i / 10) * TAU, speed: 95, r: 3, dmg: this.dmg * 0.6, life: 3, color: this.accent, owner: this, level: this.level }));
        }
        if (p.t > 0.9) this.endPattern(1.3);
        return [0, 0];
      }
      default:
        this.endPattern(1);
        return null;
    }
  }

  pose() {
    if (this.pat && (this.state === 'windup' || (this.tele && this.tele.progress < 1))) return 'windup';
    if (this.state === 'leap') return 'strike';
    return this.moving ? 'walk' : 'idle';
  }

  draw(ctx, cx, cy) {
    if (this.hidden) return;
    super.draw(ctx, cx, cy);
  }

  drawEmissive(g, cx, cy, time) {
    if (this.hidden) return;
    const x = this.x - cx, y = this.y - cy;
    const G = BOSS_GLOW[this.bossId];
    const flick = 0.75 + 0.25 * Math.sin(time * 9) * Math.sin(time * 5.3);
    const hot = this.pat && this.state === 'windup' ? 1.4 : 1;
    Lighting.glow(g, x, y - 24, 34, this.accent, this.awake ? 0.1 : 0.05);
    // signature glow: soul flame / gills / furnace core / eye
    const [kx, ky] = G.core;
    Lighting.glow(g, x + kx, y + ky, G.coreR * 1.8 * hot, this.accent, (this.bossId === 'mycelia' ? 0.25 : 0.55) * flick);
    if (this.bossId === 'ossuary') {
      for (let i = 0; i < 3; i++) { g.fillStyle = i ? '#7affb0' : '#e8fff0'; g.fillRect(Math.round(x - 1 + Math.sin(time * 7 + i) * 1.5), Math.round(y + ky - 2 - i * 2 - (time * 10 + i * 3) % 3), 2, 2); }
    } else if (this.bossId === 'mycelia') {
      g.fillStyle = 'rgba(98,255,216,0.28)';
      g.fillRect(Math.round(x - 26), Math.round(y - 32), 52, 2);
      for (const ox of [-12, 0, 12]) Lighting.glow(g, x + ox, y - 50, 5 * flick, '#62ffd8', 0.4);
    } else if (this.bossId === 'colossus') {
      g.fillStyle = '#fff0a0';
      g.fillRect(Math.round(x - 4), Math.round(y - 36), 8, 4);
      Lighting.glow(g, x - 21, y - 50, 6, '#ff7a1f', 0.5 * flick);
      Lighting.glow(g, x + 21, y - 50, 6, '#ff7a1f', 0.5 * flick);
    } else {
      for (let i = 0; i < 3; i++) {
        const a = time * 1.6 + (i / 3) * TAU;
        const sx = x + Math.cos(a) * 24, sy = y - 30 + Math.sin(a) * 9;
        Lighting.glow(g, sx, sy, 6, this.accent, 0.6);
        g.fillStyle = '#e8d0ff';
        g.fillRect(Math.round(sx), Math.round(sy - 2), 1, 5); g.fillRect(Math.round(sx - 1), Math.round(sy - 1), 3, 3);
      }
    }
    if (this.dir !== 3) {
      for (const [ex, ey] of G.eyes) {
        g.fillStyle = hot > 1 ? '#ffffff' : G.eye;
        g.fillRect(Math.round(x + ex), Math.round(y + ey), 1, 1);
        Lighting.glow(g, x + ex, y + ey, 4, G.eye, 0.5);
      }
    }
    if (this.shielded) {
      g.strokeStyle = this.accent;
      g.globalAlpha = 0.6 + 0.3 * Math.sin(time * 20);
      g.beginPath(); g.ellipse(x, y - 26, 30, 34, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }
    this.drawTelegraph(g, cx, cy, time);
    if (!this.awake) {
      g.globalAlpha = 0.5 + 0.5 * Math.sin(time * 3);
      Lighting.glow(g, x, y - 60, 8, this.accent, 0.8);
      g.globalAlpha = 1;
    }
  }

  light() { return { x: this.x, y: this.y - 12, radius: 90, color: this.accent, intensity: this.awake ? 0.6 : 0.35 }; }
}
