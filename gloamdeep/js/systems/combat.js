// Damage resolution, explosions and kill rewards. All combat numbers flow through here so that
// feedback (numbers, particles, sounds, shake, hit-stop) is consistent.

import { runtimeRng } from '../core/rng.js';
import { P } from '../fx/particles.js';
import { armorReduction } from './stats.js';
import { generateItem } from '../gen/items.js';
import { GroundEffect, Flash, Shockwave } from '../entities/effects.js';
import { MAX_POTIONS } from '../config.js';

export class Combat {
  constructor(game) {
    this.game = game;
  }

  /** Damage an enemy. opts: {crit, angle, knock, element, source, stagger, dot, quiet, slow, burn} */
  hitEnemy(e, dmg, opts = {}) {
    if (e.dead || e.invulnerable) return 0;
    const g = this.game;
    let amount = dmg;
    if (e.mods.armored) amount *= 0.6;
    if (e.isBoss && e.shielded) amount *= 0.3;
    amount = Math.max(1, Math.round(amount));
    e.hp -= amount;
    e.flash = opts.dot ? Math.max(e.flash, 0.04) : 0.1;
    e.provoke(g);
    const ang = opts.angle ?? Math.atan2(e.y - g.player.y, e.x - g.player.x);
    if (opts.knock) {
      const k = opts.knock * (1 - (e.knockResist || 0)) * (e.isBoss ? 0.15 : 1);
      e.kx += Math.cos(ang) * k;
      e.ky += Math.sin(ang) * k;
    }
    if ((opts.stagger || opts.crit) && !e.isBoss && e.canStagger()) e.interrupt(0.25);
    if (opts.slow) { e.slowT = Math.max(e.slowT, opts.slow); }
    if (opts.burn) { e.burnT = 3; e.burnDps = Math.max(e.burnDps, opts.burn); }
    // feedback
    const ps = g.particles;
    if (!opts.dot) {
      ps.burst(P.BLOOD, e.x, e.y, opts.crit ? 10 : 5, { speed: 70, angle: ang, spread: 1.4, z: e.height * 0.5, vz: 40, vzRand: 60, life: 1.2, colors: e.blood, size: 1 });
      ps.burst(P.SPARK, e.x, e.y - e.height * 0.4, opts.crit ? 8 : 3, { speed: 140, angle: ang, spread: 1.2, z: 0, life: 0.2, colors: opts.element === 'frost' ? ['#bff4ff', '#ffffff'] : opts.element === 'fire' ? ['#ffcf6a', '#ff8a2e'] : ['#fff2c0', '#ffffff'] });
      if (!opts.quiet) g.audio.play(opts.crit ? 'crit' : 'hit', 0.8);
      if (opts.crit) g.shake(2.5, 0.12);
    }
    if (g.settings.damageNumbers) {
      const col = opts.dot ? (opts.element === 'poison' ? '#9aff5a' : '#ffa04a') : opts.crit ? '#ffe04a' : opts.element === 'frost' ? '#9ae8ff' : opts.element === 'storm' ? '#dfe8ff' : '#ffffff';
      if (!opts.dot || Math.random() < 0.5) g.floaters.add(e.x, e.y - e.height - 4, opts.crit ? `${amount}!` : amount, col, opts.crit ? 2 : 1);
    }
    // player sustain
    if (opts.source === 'melee' || opts.source === 'spell') {
      const s = g.stats;
      let heal = 0;
      if (opts.source === 'melee' && s.lifeOnHit) heal += s.lifeOnHit;
      if (s.powers.has('vampiric')) heal += amount * 0.05;
      if (heal > 0) g.player.heal(heal, true);
      if (opts.crit && s.powers.has('stormcaller') && !opts.chained) this.stormStrike(e, amount * 0.8);
    }
    if (e.hp <= 0) this.killEnemy(e, opts);
    return amount;
  }

  stormStrike(e, dmg) {
    const g = this.game;
    g.effects.push(new Flash(e.x, e.y - 10, 10, '#cfe0ff', 0.2));
    g.spawnBolt([[e.x + (Math.random() - 0.5) * 20, e.y - 120], [e.x, e.y - 6]], '#dfe8ff');
    g.audio.play('storm', 0.6);
    for (const o of g.area.enemies) {
      if (o.dead) continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) < 26) this.hitEnemy(o, dmg, { element: 'storm', chained: true, source: 'proc' });
    }
  }

  killEnemy(e, opts = {}) {
    if (e.dead) return;
    const g = this.game;
    e.die(g);
    const p = g.profile;
    p.stats.kills++;
    if (e.elite) p.stats.elites++;
    // rewards
    const s = g.stats;
    g.gainXp(Math.round(e.xp * (1 + s.xpBonus)));
    const rng = runtimeRng;
    const gold = Math.round(rng.int(e.gold[0], e.gold[1]) * (1 + s.goldFind / 100));
    if (gold > 0 && (rng.chance(0.55) || e.elite || e.isBoss)) g.dropGold(e.x, e.y, gold, e.isBoss ? 14 : e.elite ? 4 : 1);
    const depth = g.area.depth || 1;
    let itemChance = 0.07 + depth * 0.003;
    let items = rng.chance(itemChance) ? 1 : 0;
    let minRarity = 0;
    if (e.elite) { items = rng.chance(0.65) ? 1 : 0; minRarity = 1; if (rng.chance(0.2)) items++; }
    if (e.isBoss) { items = 3; minRarity = 2; }
    for (let i = 0; i < items; i++) {
      const it = generateItem(rng, Math.max(depth, Math.floor(p.level * 0.8)), { magicFind: s.magicFind, minRarity: i === 0 ? minRarity : Math.min(minRarity, 1) });
      if (e.isBoss && i === 0 && rng.chance(0.35)) Object.assign(it, generateItem(rng, depth + 1, { rarity: 'legendary', magicFind: s.magicFind }));
      g.dropItem(e.x, e.y, it);
    }
    if (rng.chance(e.elite ? 0.3 : 0.045) && p.potions + g.countGroundPotions() < MAX_POTIONS) g.dropPotion(e.x, e.y);
    const q = p.quest;
    if (q && !q.done && q.type === 'collect' && (e.elite || e.isBoss || rng.chance(0.28))) g.dropRelic(e.x, e.y, q);
    g.questEvent({ type: 'kill', arch: e.arch, elite: !!e.elite, boss: !!e.isBoss, depth });
    // legendary: corpse explosion
    if (s.powers.has('corpseBlast') && !opts.fromBlast) {
      g.later(0.12, () => this.explode(e.x, e.y, 30, e.maxHp * 0.35, { team: 'player', color: '#ff6a3a', fromBlast: true, shake: 1.5 }));
    }
    if (e.isBoss) g.onBossDefeated(e);
  }

  /** Damage the player. opts: {angle, knock, element, dot, source(enemy), level} */
  hitPlayer(dmg, opts = {}) {
    const g = this.game;
    const pl = g.player;
    if (!pl.alive) return 0;
    if (pl.invulnerable() && !opts.dot) {
      if (pl.dashT > 0 && !pl.dodgeShown) { pl.dodgeShown = true; g.floaters.add(pl.x, pl.y - 26, 'DODGE', '#8ae0ff', 1); }
      return 0;
    }
    if (pl.invulnerable() && opts.dot && pl.dashT > 0) return 0;
    const s = g.stats;
    const lvl = opts.level || g.area.depth || 1;
    let amount = dmg * (1 - armorReduction(s.armor, lvl));
    if (s.powers.has('manaShield') && pl.mp > 0) {
      const absorb = Math.min(pl.mp, amount * 0.25);
      pl.mp -= absorb;
      amount -= absorb;
    }
    amount = Math.max(1, Math.round(amount));
    if (pl.hp - amount <= 0 && s.powers.has('phoenix') && !pl.phoenixUsed) {
      pl.phoenixUsed = true;
      pl.hp = Math.round(s.maxHp * 0.4);
      pl.iframes = 1.5;
      g.effects.push(new Flash(pl.x, pl.y - 10, 30, '#ff9a3a', 0.6));
      g.particles.burst(P.FIRE, pl.x, pl.y, 60, { speed: 120, life: 0.9, size: 3, colors: ['#ffcf4a', '#ff7a2e'], z: 6, drag: 2 });
      g.toast('Phoenix Ember ignites — you rise again!', 'legendary');
      g.audio.play('shrine');
      return 0;
    }
    pl.hp -= amount;
    if (!opts.dot) {
      pl.iframes = 0.3;
      pl.flash = 0.12;
      g.shake(3.5, 0.18);
      g.hitstop = Math.max(g.hitstop, 0.03);
      g.ui.hurtPulse(Math.min(1, amount / (s.maxHp * 0.25)));
      g.audio.play('hurt');
      if (opts.knock) {
        const a = opts.angle ?? 0;
        pl.kx += Math.cos(a) * opts.knock;
        pl.ky += Math.sin(a) * opts.knock;
      }
      g.particles.burst(P.BLOOD, pl.x, pl.y, 8, { speed: 60, angle: opts.angle ?? 0, spread: 2, z: 10, vz: 40, vzRand: 50, life: 1, colors: ['#8a1a1a', '#b02a2a', '#6a1010'] });
      if (opts.source && s.thorns > 0 && !opts.source.dead) this.hitEnemy(opts.source, s.thorns, { element: 'thorns', quiet: true });
      if (s.powers.has('frostNova') && pl.novaCd <= 0) {
        pl.novaCd = 4;
        g.effects.push(new Shockwave(pl.x, pl.y, 70, 260, s.spellPower * s.spellMult * 0.8, 'player', '#9ae8ff'));
        for (const e of g.area.enemies) if (!e.dead && Math.hypot(e.x - pl.x, e.y - pl.y) < 70) e.slowT = Math.max(e.slowT, 3);
        g.audio.play('frost');
      }
    }
    if (g.settings.damageNumbers && (!opts.dot || Math.random() < 0.5)) g.floaters.add(pl.x, pl.y - 28, `-${amount}`, '#ff5a5a', 1);
    if (pl.hp <= 0) {
      pl.hp = 0;
      g.onPlayerDeath(opts);
    }
    return amount;
  }

  /** Area damage. opts: {team: 'player'|'enemy'|'neutral', color, knock, scorch, fire, poison, shake, fromBlast} */
  explode(x, y, r, dmg, opts = {}) {
    const g = this.game;
    const team = opts.team || 'neutral';
    const color = opts.color || '#ff8a2e';
    const ps = g.particles;
    ps.burst(P.FIRE, x, y, 26 + r, { speed: r * 3.2, life: 0.55, size: 3, colors: [color, '#ffcf4a'], z: 4, drag: 4, grav: 20 });
    ps.burst(P.SPARK, x, y, 18, { speed: 220, life: 0.35, colors: ['#fff2c0', color] });
    ps.burst(P.DEBRIS, x, y, 12, { speed: 90, z: 4, vz: 90, vzRand: 60, life: 1.5, colors: ['#3a3440', '#5a5460', '#2a2024'] });
    ps.burst(P.SMOKE, x, y, 14, { speed: 40, life: 1.4, size: 4, colors: ['#2a2428', '#3a3438'], z: 6, grav: 12 });
    g.effects.push(new Flash(x, y, r * 0.8, color, 0.22));
    g.audio.play('explode', Math.min(1, r / 40));
    g.shake(opts.shake ?? Math.min(7, r / 7), 0.28);
    if (opts.scorch !== false) g.area.tiles.scorch(x, y, r * 0.7);
    if (opts.fire) g.area.groundEffects.push(new GroundEffect('fire', x, y, r * 0.6, 2.2, dmg * 0.25, team === 'neutral' ? 'neutral' : team));
    if (opts.poison) g.area.groundEffects.push(new GroundEffect('poison', x, y, r * 0.8, 3.5, dmg * 0.2, team));
    const r2 = r * r;
    if (team !== 'player' && g.player.alive) {
      const d2 = (g.player.x - x) ** 2 + (g.player.y - y) ** 2;
      if (d2 < r2) this.hitPlayer(dmg * (1 - Math.sqrt(d2) / r * 0.4), { angle: Math.atan2(g.player.y - y, g.player.x - x), knock: opts.knock ?? 150 });
    }
    if (team !== 'enemy') {
      for (const e of g.area.enemies) {
        if (e.dead) continue;
        const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d2 < r2 + e.radius * e.radius) this.hitEnemy(e, dmg * (1 - Math.sqrt(d2) / (r + e.radius) * 0.4), { angle: Math.atan2(e.y - y, e.x - x), knock: opts.knock ?? 140, element: 'fire', source: team === 'player' ? 'spell' : 'env', fromBlast: opts.fromBlast, quiet: true });
      }
    } else {
      // enemy explosions (bloaters) still hurt other monsters a little: chaos
      for (const e of g.area.enemies) {
        if (e.dead || e === opts.owner) continue;
        const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d2 < r2) this.hitEnemy(e, dmg * 0.5, { angle: Math.atan2(e.y - y, e.x - x), knock: 120, element: 'fire', quiet: true, source: 'env' });
      }
    }
    for (const p of g.area.props) {
      if (p.breakable && !p.broken && (p.x - x) ** 2 + (p.y - y) ** 2 < r2 + 64) p.damage(g, 999, Math.atan2(p.y - y, p.x - x));
    }
  }
}
