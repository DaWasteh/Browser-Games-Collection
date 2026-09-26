// The player character: movement, melee swings, spells, dash, potions, lantern light.

import { TILE, PLAYER_BASE } from '../config.js';
import { angleDiff, dir4, clamp, TAU } from '../core/math.js';
import { runtimeRng } from '../core/rng.js';
import { T } from '../world/tiles.js';
import { SPELLS } from '../gen/items.js';
import { getSprite, playerLook, weaponSprite } from '../fx/sprites.js';
import { P } from '../fx/particles.js';
import { Lighting } from '../fx/lighting.js';
import { Slash, Ghost, GroundEffect } from './effects.js';
import { Projectile } from './projectile.js';
import { rarityColor } from '../config.js';

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 5;
    this.height = 22;
    this.kx = 0; this.ky = 0;
    this.aim = 0;
    this.dir = 0;
    this.animT = 0;
    this.moving = false;
    this.hp = 100; this.mp = 60;
    this.dead = false;
    this.iframes = 0; this.flash = 0;
    this.dashT = 0; this.dashInv = 0; this.dashCd = 0; this.dashDx = 0; this.dashDy = 0; this.ghostT = 0; this.trailT = 0;
    this.attackCd = 0; this.swing = null; this.swingSign = 1; this.swingCount = 0;
    this.spellCd = 0; this.potionCd = 0; this.manaWarnT = 0;
    this.buffs = {};
    this.phoenixUsed = false; this.novaCd = 0; this.lanternTick = 0; this.liquidTick = 0; this.stepT = 0;
    this.lookKey = '';
    this.look = playerLook();
    this.lastPos = { x, y };
  }

  get alive() { return !this.dead; }

  invulnerable() { return this.iframes > 0 || this.dashInv > 0; }

  place(x, y) {
    this.x = x; this.y = y; this.kx = 0; this.ky = 0; this.swing = null; this.dashT = 0; this.dashInv = 0;
    this.phoenixUsed = false;
  }

  refreshLook(profile) {
    const armor = profile.equipment.armor;
    const helm = profile.equipment.helm;
    const trim = armor ? rarityColor(armor.rarity) : '#8a7a5a';
    const helmCol = helm ? ['#8a5a3a', '#8a8e96', '#9aa6b8', '#4a4e5e', '#5a7ab0', '#3a2a4a', '#d8b04a'][helm.tier || 0] : null;
    const key = `${trim}|${helmCol}`;
    if (key !== this.lookKey) { this.lookKey = key; this.look = playerLook(trim, helmCol); }
  }

  heal(amount, quiet = false) {
    if (this.dead) return;
    const max = this.maxHp;
    this.hp = Math.min(max, this.hp + amount);
    void quiet;
  }

  get maxHp() { return this._maxHp || 100; }

  update(dt, game) {
    const s = game.stats;
    this._maxHp = s.maxHp;
    if (this.dead) return;
    const input = game.input;
    this.iframes = Math.max(0, this.iframes - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.attackCd -= dt; this.spellCd -= dt; this.potionCd -= dt; this.dashCd -= dt; this.novaCd -= dt; this.manaWarnT -= dt;
    this.dashInv = Math.max(0, this.dashInv - dt);

    // buffs
    let buffChanged = false;
    for (const k of Object.keys(this.buffs)) {
      this.buffs[k] -= dt;
      if (this.buffs[k] <= 0) { delete this.buffs[k]; buffChanged = true; }
    }
    if (buffChanged) game.refreshStats();

    // aim
    const m = game.mouseWorld;
    this.aim = Math.atan2(m.y - (this.y - 8), m.x - this.x);

    const canAct = !game.modal && game.state === 'play';
    const mv = canAct ? input.moveVector() : { x: 0, y: 0 };

    // actions
    if (canAct) {
      if (input.wasPressed('Space') && this.dashCd <= 0) this.startDash(game, mv);
      if (input.mouseDown(0) && this.attackCd <= 0 && !this.swing && this.dashT <= 0 && !game.pointerOverUi) this.startSwing(game);
      if (input.mouseDown(2) && this.spellCd <= 0 && this.dashT <= 0 && !game.pointerOverUi) this.castSpell(game);
      if (input.wasPressed('KeyQ')) this.drinkPotion(game);
    }

    // movement
    let speed = s.moveSpeed;
    const tileId = game.area.map.idAt(this.x, this.y);
    if (tileId === T.WATER) speed *= 0.7;
    if (this.swing) speed *= 0.55;
    let vx, vy;
    if (this.dashT > 0) {
      this.dashT -= dt;
      vx = this.dashDx * PLAYER_BASE.dashSpeed;
      vy = this.dashDy * PLAYER_BASE.dashSpeed;
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.035;
        game.effects.push(new Ghost(this.sprite(), this.x, this.y, '#6ad0ff', 0.28));
      }
      if (s.powers.has('emberTrail')) {
        this.trailT -= dt;
        if (this.trailT <= 0) { this.trailT = 0.04; game.area.groundEffects.push(new GroundEffect('fire', this.x, this.y, 9, 2.4, s.spellPower * s.spellMult * 0.6, 'player')); }
      }
    } else {
      vx = mv.x * speed;
      vy = mv.y * speed;
    }
    this.moving = (mv.x !== 0 || mv.y !== 0) && this.dashT <= 0;
    const kd = Math.exp(-9 * dt);
    this.kx *= kd; this.ky *= kd;
    game.area.map.move(this, (vx + this.kx) * dt, (vy + this.ky) * dt, this.radius);

    // facing
    if (this.swing || this.spellCd > s.spellCooldown - 0.25 || !this.moving) this.dir = dir4(this.aim);
    else this.dir = dir4(Math.atan2(mv.y, mv.x));

    // animation + footsteps
    if (this.moving) {
      const prev = Math.floor(this.animT);
      this.animT += dt * 9 * (speed / PLAYER_BASE.speed);
      if (Math.floor(this.animT) !== prev && (Math.floor(this.animT) & 1)) {
        if (tileId === T.WATER) game.particles.burst(P.DRIP, this.x, this.y, 4, { speed: 30, z: 1, vz: 50, vzRand: 30, life: 0.6, colors: ['#8ab0d0', '#6a90b0'] });
        else game.particles.burst(P.DUST, this.x, this.y + 1, 2, { speed: 14, z: 0, life: 0.45, size: 2, colors: game.area.type === 'town' ? ['#4a5a3a'] : ['#6a6070'] });
      }
    } else {
      this.animT += dt * 2;
    }

    // swing
    if (this.swing) {
      const sw = this.swing;
      sw.t += dt;
      if (!sw.resolved && sw.t >= sw.dur * 0.32) { sw.resolved = true; this.resolveSwing(game); }
      if (sw.t >= sw.dur) this.swing = null;
    }

    // regen
    this.hp = Math.min(s.maxHp, this.hp + s.hpRegen * dt);
    this.mp = Math.min(s.maxMp, this.mp + s.mpRegen * dt);

    // hazardous liquid
    if (tileId === T.LIQUID && this.dashT <= 0) {
      this.liquidTick -= dt;
      if (this.liquidTick <= 0) {
        this.liquidTick = 0.4;
        const hz = game.area.theme.hazardLiquid;
        game.combat.hitPlayer(hz.damage * (1 + (game.area.depth || 1) * 0.08) * 0.4, { element: 'fire', dot: true });
        game.particles.burst(P.FIRE, this.x, this.y, 5, { speed: 20, life: 0.5, size: 2, colors: [hz.glow], z: 2, grav: 20 });
      }
    }

    // legendary lantern heart
    if (s.powers.has('lanternHeart')) {
      this.lanternTick -= dt;
      if (this.lanternTick <= 0) {
        this.lanternTick = 0.5;
        const r = 64 * s.light;
        for (const e of game.area.enemies) {
          if (!e.dead && Math.hypot(e.x - this.x, e.y - this.y) < r) game.combat.hitEnemy(e, s.spellPower * 0.18 + 2, { element: 'fire', dot: true, quiet: true, source: 'spell' });
        }
      }
    }
  }

  startDash(game, mv) {
    let dx = mv.x, dy = mv.y;
    if (!dx && !dy) { dx = Math.cos(this.aim); dy = Math.sin(this.aim); }
    const l = Math.hypot(dx, dy) || 1;
    this.dashDx = dx / l; this.dashDy = dy / l;
    this.dashT = PLAYER_BASE.dashTime;
    this.dashInv = PLAYER_BASE.dashInvuln;
    this.dashCd = PLAYER_BASE.dashCooldown;
    this.dodgeShown = false;
    this.swing = null;
    game.audio.play('dash');
    game.particles.burst(P.DUST, this.x, this.y, 8, { speed: 50, angle: Math.atan2(-this.dashDy, -this.dashDx), spread: 1.6, life: 0.5, size: 3, colors: ['#8a8090', '#6a6070'] });
  }

  startSwing(game) {
    const s = game.stats;
    const dur = clamp(0.75 / s.atkSpeed, 0.16, 0.42);
    this.attackCd = 1 / s.atkSpeed;
    this.swingSign = -this.swingSign;
    this.swing = { t: 0, dur, angle: this.aim, resolved: false, sign: this.swingSign };
    const heavy = s.weaponBase === 'axe' || s.weaponBase === 'mace';
    game.audio.play(heavy ? 'swingHeavy' : 'swing');
  }

  resolveSwing(game) {
    const s = game.stats;
    const sw = this.swing;
    const arc = s.arc, reach = s.reach;
    const ox = this.x, oy = this.y - 3;
    const weapon = game.profile.equipment.weapon;
    const col = weapon ? (weapon.rarity === 'common' ? '#e8e4dc' : rarityColor(weapon.rarity)) : '#e8e4dc';
    game.effects.push(new Slash(ox, oy - 3, sw.angle, arc, reach, col, 0.16, sw.sign));
    let hits = 0, crits = 0;
    const inArc = (x, y, r) => {
      const dx = x - ox, dy = y - oy;
      const d = Math.hypot(dx, dy);
      if (d - r > reach) return false;
      if (d < r + 4) return true;
      return Math.abs(angleDiff(sw.angle, Math.atan2(dy, dx))) <= arc / 2 + Math.atan2(r, d);
    };
    for (const e of game.area.enemies) {
      if (e.dead || !inArc(e.x, e.y - e.height * 0.3, e.radius + 2)) continue;
      const crit = runtimeRng.chance(s.crit);
      let dmg = runtimeRng.float(s.dmgMin, s.dmgMax + 0.999) * s.meleeMult;
      if (crit) dmg *= s.critMult;
      const ang = Math.atan2(e.y - this.y, e.x - this.x);
      game.combat.hitEnemy(e, dmg + s.fireDmg, { crit, angle: ang, knock: s.knock, stagger: s.stagger, source: 'melee', element: s.fireDmg > 0 ? 'fire' : null, burn: s.fireDmg > 0 ? s.fireDmg * 0.5 : 0 });
      hits++; if (crit) crits++;
    }
    for (const p of game.area.props) {
      if (!p.hittable || p.broken) continue;
      if (inArc(p.x, p.y - 4, p.r || 5)) { p.damage(game, runtimeRng.float(s.dmgMin, s.dmgMax) * s.meleeMult, Math.atan2(p.y - this.y, p.x - this.x)); hits++; }
    }
    // parry enemy projectiles
    for (const pr of game.area.projectiles) {
      if (pr.team !== 'enemy' || pr.dead || pr.unparryable) continue;
      if (inArc(pr.x, pr.y, pr.r + 3)) {
        pr.dead = true;
        game.particles.burst(P.SPARK, pr.x, pr.y, 10, { speed: 160, life: 0.3, colors: ['#ffffff', '#fff0a0'] });
        if (!this.parryShown || Math.random() < 0.3) { game.floaters.add(pr.x, pr.y - 8, 'PARRY', '#fff0a0', 1); this.parryShown = true; }
        game.audio.play('hit', 0.6);
      }
    }
    if (hits) {
      game.hitstop = Math.max(game.hitstop, crits ? 0.075 : 0.045);
      game.shake(crits ? 2.5 : 1.4, 0.1);
    }
    this.swingCount++;
    if (s.powers.has('echoStrike') && this.swingCount % 3 === 0) {
      const dmg = ((s.dmgMin + s.dmgMax) / 2) * s.meleeMult * 0.9;
      game.area.projectiles.push(new Projectile({ team: 'player', kind: 'wave', x: this.x, y: this.y - 2, angle: sw.angle, speed: 220, r: 7, dmg, life: 0.7, pierce: 99, color: '#e8f0ff' }));
    }
  }

  castSpell(game) {
    const s = game.stats;
    const spell = SPELLS[s.spell];
    if (this.mp < s.spellCost) {
      if (this.manaWarnT <= 0) { this.manaWarnT = 1; game.floaters.add(this.x, this.y - 30, 'NO MANA', '#6aa8ff', 1); game.audio.play('deny', 0.5); }
      this.spellCd = 0.15;
      return;
    }
    this.mp -= s.spellCost;
    this.spellCd = s.spellCooldown;
    const dmg = s.spellPower * s.spellMult * spell.power;
    const split = s.powers.has('splitBolt');
    const angles = split ? [this.aim - 0.22, this.aim, this.aim + 0.22] : [this.aim];
    const ox = this.x + Math.cos(this.aim) * 6, oy = this.y + Math.sin(this.aim) * 6;
    game.particles.burst(P.MAGIC, ox, oy, 8, { speed: 60, angle: this.aim, spread: 1.2, z: 9, life: 0.35, size: 2, colors: [spell.color, '#ffffff'] });
    switch (s.spell) {
      case 'frost':
        for (const a of angles) game.area.projectiles.push(new Projectile({ team: 'player', kind: 'frost', x: ox, y: oy, angle: a, speed: 330, r: 3, dmg, life: 0.9, pierce: 3, slow: 2.5, color: spell.color, shatter: true }));
        game.audio.play('frost');
        break;
      case 'storm':
        game.chainLightning(this.x, this.y - 8, this.aim, dmg, split ? 5 : 3, split ? 3 : 1);
        game.audio.play('storm');
        break;
      case 'void':
        for (const a of angles) game.area.projectiles.push(new Projectile({ team: 'player', kind: 'void', x: ox, y: oy, angle: a, speed: 78, r: 8, dmg, life: 2.5, pierce: 999, tick: 0.2, color: spell.color, implode: true }));
        game.audio.play('void');
        break;
      default:
        for (const a of angles) game.area.projectiles.push(new Projectile({ team: 'player', kind: 'ember', x: ox, y: oy, angle: a, speed: 245, r: 3, dmg, life: 1.1, explodeR: 28, burn: dmg * 0.2, color: spell.color }));
        game.audio.play('ember');
    }
  }

  drinkPotion(game) {
    const p = game.profile;
    if (this.potionCd > 0) return;
    if (p.potions <= 0) { game.floaters.add(this.x, this.y - 30, 'NO POTIONS', '#ff8a8a', 1); game.audio.play('deny', 0.6); this.potionCd = 0.4; return; }
    const s = game.stats;
    if (this.hp >= s.maxHp) { game.floaters.add(this.x, this.y - 30, 'FULL HEALTH', '#aaffaa', 1); this.potionCd = 0.4; return; }
    p.potions--;
    this.potionCd = PLAYER_BASE.potionCooldown;
    const amount = Math.round(s.maxHp * PLAYER_BASE.potionHeal);
    this.hp = Math.min(s.maxHp, this.hp + amount);
    game.floaters.add(this.x, this.y - 30, `+${amount}`, '#6aff8a', 1);
    game.audio.play('potion');
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      game.particles.spawn(P.MAGIC, this.x + Math.cos(a) * 8, this.y + Math.sin(a) * 4, 2, 0, 0, 30 + Math.random() * 30, 0.8, 2, i & 1 ? '#ff5a6a' : '#ffb0b8', 0.5, 0);
    }
    game.ui.flashPotion();
  }

  // ------------------------------------------------------------------ rendering

  sprite() {
    const pose = this.swing ? 'strike' : this.moving ? 'walk' : 'idle';
    return getSprite(this.look, this.dir, Math.floor(this.animT), pose);
  }

  handPos() {
    switch (this.dir) {
      case 0: return [this.x + 6, this.y - 8];
      case 3: return [this.x - 6, this.y - 10];
      case 1: return [this.x - 2, this.y - 9];
      default: return [this.x + 2, this.y - 9];
    }
  }

  weaponAngle() {
    if (this.swing) {
      const sw = this.swing;
      const k = Math.min(1, sw.t / (sw.dur * 0.55));
      const e = 1 - Math.pow(1 - k, 3);
      return sw.angle + (sw.sign * -0.5 + sw.sign * e) * (this._arc || 1.9) * 1.1;
    }
    const facingLeft = Math.cos(this.aim) < 0;
    return this.aim + (facingLeft ? -1 : 1) * 1.05;
  }

  draw(ctx, cx, cy, game) {
    if (this.dead) return;
    const s = game.stats;
    this._arc = s.arc;
    const spr = this.sprite();
    const blink = this.iframes > 0 && this.dashInv <= 0 && Math.floor(this.iframes * 30) % 2 === 0;
    const weapon = game.profile.equipment.weapon;
    const ws = weaponSprite(s.weaponBase, weapon ? weapon.tier : 0);
    const drawWeapon = () => {
      const [hx, hy] = this.handPos();
      let ang = this.weaponAngle();
      let ex = 0;
      if (this.swing && s.weaponBase === 'spear') {
        ang = this.swing.angle;
        const k = this.swing.t / this.swing.dur;
        ex = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 12;
      }
      ctx.save();
      ctx.translate(Math.round(hx - cx + Math.cos(ang) * ex), Math.round(hy - cy + Math.sin(ang) * ex));
      ctx.rotate(ang);
      if (Math.cos(ang) < 0) ctx.scale(1, -1);
      ctx.drawImage(ws.c, -ws.gx, -ws.gy);
      ctx.restore();
    };
    if (this.dir === 3) drawWeapon();
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.drawImage(this.flash > 0 ? spr.flash : spr.c, Math.round(this.x - spr.ax - cx), Math.round(this.y - spr.ay - cy));
    ctx.globalAlpha = 1;
    if (this.dir !== 3) drawWeapon();
  }

  lanternPos() {
    switch (this.dir) {
      case 0: return [this.x - 8, this.y - 9];
      case 3: return [this.x - 6, this.y - 12];
      case 1: return [this.x + 5, this.y - 11];
      default: return [this.x - 5, this.y - 11];
    }
  }

  drawEmissive(g, cx, cy, time) {
    if (this.dead) return;
    const [lx, ly] = this.lanternPos();
    const f = 0.85 + 0.15 * Math.sin(time * 13) * Math.sin(time * 7.3);
    Lighting.glow(g, lx - cx, ly - cy, 9, '#ffb84a', 0.55 * f);
    g.fillStyle = '#fff4c8';
    g.fillRect(Math.round(lx - cx), Math.round(ly - cy), 1, 2);
  }

  light(game) {
    const s = game.stats;
    const r = (game.area.type === 'town' ? 115 : 150) * s.light;
    const [lx, ly] = this.lanternPos();
    const t = game.time;
    const flick = 1 + 0.03 * Math.sin(t * 11) + 0.02 * Math.sin(t * 27);
    return {
      x: lx, y: ly + 4, radius: r * flick, color: '#ffe6c0', intensity: 1.0, flat: true,
      poly: game.area.map.lightPolygon(lx, ly + 4, r * flick, 120, 12),
    };
  }
}

export { TILE };
