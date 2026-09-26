// Runtime props (interactables, breakables, lights, decoration with colliders) and floor traps.

import { runtimeRng } from '../core/rng.js';
import { TAU } from '../core/math.js';
import { P } from '../fx/particles.js';
import { propSprite, SHRINE_COLORS } from '../fx/propArt.js';
import { Lighting } from '../fx/lighting.js';
import { GroundEffect } from './effects.js';
import { generateItem } from '../gen/items.js';
import { MAX_POTIONS } from '../config.js';

const SOLID = {
  brazier: 6, glowcap: 5, crystal: 6, geodeCluster: 6, coffin: 6, grave: 5, statue: 6, obelisk: 5, sporeStalk: 5, stump: 6, anvil: 7, ingotPile: 5,
  urn: 4, crate: 6, barrel: 5, powderKeg: 5, sporepod: 5, geode: 5, chest: 7, shrine: 7,
  well: 10, noticeBoard: 8, storageChest: 10, lampPost: 3, fence: 6, woodpile: 8, cart: 11, signpost: 3, bench: 8, hayBale: 7, trainingDummy: 5, campfire: 9, tree: 7,
};
const BREAKABLE = { urn: 6, crate: 10, barrel: 12, powderKeg: 6, sporepod: 5, geode: 14 };
const FLAT = new Set(['stairsUp', 'stairsDown']);

const SHRINES = {
  might: { name: 'Shrine of Might', text: '+35% damage for 60s' },
  haste: { name: 'Shrine of Haste', text: '+25% move and attack speed for 60s' },
  warding: { name: 'Shrine of Warding', text: '+50% armor for 60s' },
  fortune: { name: 'Shrine of Fortune', text: '+50% gold and magic find for 60s' },
  renewal: { name: 'Shrine of Renewal', text: 'Fully restores life and mana' },
};

export class Prop {
  constructor(d) {
    Object.assign(this, d);
    this.r = SOLID[d.type] || 0;
    this.solid = !!SOLID[d.type] && !FLAT.has(d.type);
    this.breakable = !!BREAKABLE[d.type];
    this.hp = BREAKABLE[d.type] || 0;
    this.hittable = this.breakable || d.type === 'trainingDummy';
    this.broken = false;
    this.flat = FLAT.has(d.type);
    this.anim = runtimeRng.next() * 10;
    this.shake = 0;
    this.fuse = 0;
    this.isLarge = d.type === 'house' || d.type === 'hall' || d.type === 'stall' || d.type === 'gloamGate';
    if (this.isLarge) { this.solid = false; this.baseY = d.y + (d.h || 0); }
  }

  get sortY() { return this.isLarge ? (this.type === 'gloamGate' ? this.y : this.y + this.h) : this.y; }

  /** Interaction descriptor for the "E" prompt, or null. */
  interaction(game) {
    switch (this.type) {
      case 'chest': return this.open ? null : { label: this.tier === 'gilded' ? 'Open gilded chest' : 'Open chest', act: () => this.openChest(game) };
      case 'shrine': return this.used ? null : { label: `Touch ${SHRINES[this.kind].name}`, act: () => this.useShrine(game) };
      case 'stairsDown': return { label: this.sealed ? 'Sealed — defeat the guardian' : `Descend to floor ${game.area.depth + 1}`, act: () => (this.sealed ? game.toast('The stair is sealed by the guardian\'s power.', 'warn') : game.descend()) };
      case 'stairsUp': return { label: 'Return to Wickhollow', act: () => game.returnToTown() };
      case 'storageChest': return { label: 'Open your storage chest', act: () => game.openModal('chest') };
      case 'gloamGate': return { label: 'Enter the Gloam Stair', act: () => game.openModal('portal') };
      case 'noticeBoard': return { label: 'Read the notice board', act: () => game.talkTo('warden') };
      case 'well': return { label: 'Drink from the well', act: () => { game.player.hp = game.stats.maxHp; game.player.mp = game.stats.maxMp; game.toast('Cold, clear water. You feel restored.', 'info'); game.audio.play('potion'); } };
      case 'campfire': return { label: 'Warm your hands', act: () => game.toast('The fire crackles. Wickhollow is safe — for now.', 'info') };
      case 'trainingDummy': return null;
      default: return null;
    }
  }

  openChest(game) {
    if (this.open) return;
    this.open = true;
    game.audio.play('chest');
    const depth = game.area.depth || 1;
    const s = game.stats;
    const gilded = this.tier === 'gilded';
    game.dropGold(this.x, this.y + 4, Math.round((8 + depth * 5) * (gilded ? 3 : 1) * runtimeRng.float(0.8, 1.3) * (1 + s.goldFind / 100)), gilded ? 8 : 4);
    const n = gilded ? runtimeRng.int(2, 3) : runtimeRng.int(1, 2);
    for (let i = 0; i < n; i++) {
      game.dropItem(this.x, this.y + 4, generateItem(runtimeRng, depth + (gilded ? 1 : 0), { magicFind: s.magicFind + (gilded ? 60 : 0), minRarity: gilded && i === 0 ? 2 : 0 }));
    }
    if (runtimeRng.chance(gilded ? 0.8 : 0.4) && game.profile.potions + game.countGroundPotions() < MAX_POTIONS) game.dropPotion(this.x, this.y + 4);
    game.particles.burst(P.GLINT, this.x, this.y - 6, 24, { speed: 60, z: 6, life: 0.9, colors: ['#ffd84a', '#fff0a0'] });
    game.profile.stats.itemsFound += n;
  }

  useShrine(game) {
    if (this.used) return;
    this.used = true;
    const pl = game.player;
    if (this.kind === 'renewal') {
      pl.hp = game.stats.maxHp;
      pl.mp = game.stats.maxMp;
    } else {
      pl.buffs[this.kind] = 60;
      game.refreshStats();
    }
    game.toast(`${SHRINES[this.kind].name}: ${SHRINES[this.kind].text}`, 'shrine');
    game.audio.play('shrine');
    const col = SHRINE_COLORS[this.kind];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      game.particles.spawn(P.MAGIC, this.x + Math.cos(a) * 10, this.y + Math.sin(a) * 6, 10, Math.cos(a) * 30, Math.sin(a) * 20, 40, 1, 2, col, 1, 0);
    }
  }

  damage(game, amount, angle) {
    if (this.type === 'trainingDummy') {
      this.shake = 0.2;
      if (game.settings.damageNumbers) game.floaters.add(this.x, this.y - 26, Math.round(amount), '#ffffff', 1);
      game.audio.play('hit', 0.5);
      game.particles.burst(P.DEBRIS, this.x, this.y - 12, 4, { speed: 40, angle, spread: 1, z: 12, vz: 30, life: 0.8, colors: ['#c8a060', '#e8c880'] });
      return;
    }
    if (!this.breakable || this.broken) return;
    this.hp -= amount;
    this.shake = 0.15;
    if (this.hp > 0) { game.audio.play('hit', 0.4); return; }
    this.break(game, angle);
  }

  break(game, angle = 0) {
    if (this.broken) return;
    this.broken = true;
    game.area.map.removeSolidProp(this);
    game.audio.play('break');
    const cols = {
      urn: ['#8a5a3a', '#6a4a2a', '#a07050'], crate: ['#7a5a38', '#9a7448', '#5a4028'], barrel: ['#7a5230', '#4a4a52', '#5a3a22'],
      powderKeg: ['#8a2a22', '#4a4a52'], sporepod: ['#a04a7a', '#d06aa0'], geode: ['#5a5468', '#c59bff', '#9a6aff'],
    }[this.type];
    game.particles.burst(P.DEBRIS, this.x, this.y - 4, 18, { speed: 70, angle, spread: 3, z: 6, vz: 70, vzRand: 60, life: 1.4, colors: cols });
    game.particles.burst(P.DUST, this.x, this.y, 6, { speed: 30, life: 0.6, size: 3, colors: ['#6a6070'] });
    if (this.type === 'powderKeg') {
      game.later(0.35, () => game.combat.explode(this.x, this.y, 42, 26 + (game.area.depth || 1) * 5, { team: 'neutral', color: '#ff9a2e', fire: true, shake: 6 }));
      game.particles.burst(P.SPARK, this.x, this.y - 6, 12, { speed: 60, life: 0.4, colors: ['#ffcf4a'] });
      return;
    }
    if (this.type === 'sporepod') {
      game.area.groundEffects.push(new GroundEffect('poison', this.x, this.y, 22, 3.5, 6 + (game.area.depth || 1), 'neutral'));
      return;
    }
    // small loot chance
    const r = runtimeRng.next();
    if (r < 0.45) game.dropGold(this.x, this.y, Math.round((2 + (game.area.depth || 1) * 1.5) * runtimeRng.float(0.6, 1.4)), 2);
    else if (r < 0.52 && game.profile.potions + game.countGroundPotions() < MAX_POTIONS) game.dropPotion(this.x, this.y);
    else if (r < 0.58) game.dropItem(this.x, this.y, generateItem(runtimeRng, game.area.depth || 1, { magicFind: game.stats.magicFind }));
  }

  update(dt, game) {
    this.anim += dt;
    this.shake = Math.max(0, this.shake - dt);
    const ps = game.particles;
    const sp = runtimeRng.next();
    switch (this.type) {
      case 'wallTorch': case 'brazier': case 'campfire':
        if (sp < dt * (this.type === 'wallTorch' ? 9 : 16)) {
          const z = this.type === 'wallTorch' ? 10 : this.type === 'brazier' ? 12 : 4;
          ps.spawn(P.FIRE, this.x + (runtimeRng.next() - 0.5) * (this.type === 'campfire' ? 8 : 3), this.y, z, (runtimeRng.next() - 0.5) * 6, 0, 18 + runtimeRng.next() * 14, 0.5, this.type === 'campfire' ? 3 : 2, '#ff9a2e', 1, 12);
        }
        if (sp > 1 - dt * 2.5) ps.spawn(P.EMBER, this.x, this.y, 14, (runtimeRng.next() - 0.5) * 10, 0, 25, 1.6, 1, '#ffb347', 0.4, 8);
        break;
      case 'glowcap': case 'crystal':
        if (sp < dt * 1.2) ps.spawn(P.GLINT, this.x + (runtimeRng.next() - 0.5) * 14, this.y - runtimeRng.next() * 6, 8, 0, 0, 8, 1.4, 1, this.type === 'glowcap' ? '#7affe0' : '#d8b8ff', 0.5, 3);
        break;
      case 'stairsDown':
        if (sp < dt * 5) ps.spawn(this.sealed ? P.EMBER : P.GLINT, this.x + (runtimeRng.next() - 0.5) * 24, this.y + (runtimeRng.next() - 0.5) * 14, 2, 0, 0, 16, 1.4, 1, this.sealed ? '#ff5a3a' : '#8ac8ff', 0.3, 4);
        break;
      case 'gloamGate':
        if (sp < dt * 8) ps.spawn(P.GLINT, this.x + (runtimeRng.next() - 0.5) * 28, this.y - 10 - runtimeRng.next() * 30, 0, 0, -4, 0, 1.6, 1, '#8ab0ff', 0.3, 0);
        break;
      case 'house':
        if (this.chimney && sp < dt * 3) ps.spawn(P.SMOKE, this.x + this.w - 12, this.y - 26, 0, 4, -8, 6, 2.2, 3, '#4a4450', 0.3, 2);
        break;
      default: break;
    }
  }

  draw(ctx, cx, cy, time) {
    if (this.broken) return;
    let spr;
    if (this.isLarge) {
      spr = propSprite(this.type, this.v || 0, { w: this.w, h: this.h, roof: this.roof, wall: this.wall, chimney: this.chimney, sign: this.sign, awning: this.awning });
      const bx = this.type === 'gloamGate' ? this.x : this.x + this.w / 2;
      const by = this.type === 'gloamGate' ? this.y : this.y + this.h;
      ctx.drawImage(spr.c, Math.round(bx - spr.ax - cx), Math.round(by - spr.ay - cy));
      return;
    }
    spr = propSprite(this.type, this.v || 0, { open: this.open, kind: this.kind, tier: this.tier, sealed: this.sealed, used: this.used });
    let ox = 0;
    if (this.shake > 0) ox = Math.round(Math.sin(this.shake * 80) * 1.5);
    if (this.type === 'trainingDummy' && this.shake > 0) ox = Math.round(Math.sin(this.shake * 60) * 2);
    ctx.drawImage(spr.c, Math.round(this.x - spr.ax - cx + ox), Math.round(this.y - spr.ay - cy));
    void time;
  }

  drawEmissive(g, cx, cy, time) {
    if (this.broken) return;
    const x = this.x - cx, y = this.y - cy;
    const f = 0.8 + 0.2 * Math.sin(time * 11 + this.anim) * Math.sin(time * 7 + this.anim * 2);
    switch (this.type) {
      case 'wallTorch':
        Lighting.glow(g, x, y - 11, 8 * f, '#ff9a3c', 0.45);
        g.fillStyle = '#fff0b0'; g.fillRect(Math.round(x - 1), Math.round(y - 13), 2, 3);
        g.fillStyle = '#ffb347'; g.fillRect(Math.round(x - 1), Math.round(y - 15 + (f > 0.9 ? 0 : 1)), 2, 2);
        break;
      case 'brazier':
        Lighting.glow(g, x, y - 13, 11 * f, '#ff8a2e', 0.42);
        g.fillStyle = '#ffcf6a'; g.fillRect(Math.round(x - 3), Math.round(y - 14), 6, 2);
        g.fillStyle = '#fff0b0'; g.fillRect(Math.round(x - 1), Math.round(y - 16 - (f > 0.95 ? 1 : 0)), 2, 3);
        break;
      case 'campfire':
        Lighting.glow(g, x, y - 6, 15 * f, '#ff8a2e', 0.5);
        g.fillStyle = '#ffcf6a'; g.fillRect(Math.round(x - 3), Math.round(y - 8), 6, 4);
        g.fillStyle = '#fff4c0'; g.fillRect(Math.round(x - 1), Math.round(y - 11), 2, 4);
        break;
      case 'candles':
        for (let i = 0; i < 4; i++) {
          const hs = [7, 5, 8, 4][(i + (this.v || 0)) & 3];
          const cxp = Math.round(x - 7 + 1 + i * 3 + (i & 1)), cyp = Math.round(y - hs - 1);
          g.fillStyle = '#ffd88a'; g.fillRect(cxp, cyp - 1, 1, 2);
          Lighting.glow(g, cxp, cyp, 4 * f, '#ffb04a', 0.5);
        }
        break;
      case 'glowcap':
        Lighting.glow(g, x, y - 8, 12, '#3affc8', 0.25 * f + 0.1);
        break;
      case 'crystal': case 'geodeCluster': case 'obelisk':
        Lighting.glow(g, x, y - 12, 12, this.type === 'geodeCluster' ? '#8ae0ff' : '#b88cff', 0.2);
        break;
      case 'shrine':
        if (!this.used) {
          const col = SHRINE_COLORS[this.kind];
          Lighting.glow(g, x, y - 25 + Math.sin(time * 2) * 1.5, 12, col, 0.8);
          g.fillStyle = '#ffffff'; g.fillRect(Math.round(x - 1), Math.round(y - 26 + Math.sin(time * 2) * 1.5), 2, 2);
        }
        break;
      case 'stairsDown': {
        const col = this.sealed ? '#ff4a3a' : '#6ab0ff';
        Lighting.glow(g, x, y - 4, 20, col, 0.35 + 0.1 * Math.sin(time * 3));
        g.fillStyle = col;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + time * 0.4;
          if ((i + Math.floor(time * 4)) % 3 === 0) g.fillRect(Math.round(x + Math.cos(a) * 13), Math.round(y - 5 + Math.sin(a) * 10), 1, 1);
        }
        if (this.sealed) {
          g.globalAlpha = 0.35 + 0.2 * Math.sin(time * 6);
          g.fillStyle = '#ff3a2a';
          g.beginPath(); g.ellipse(x, y - 5, 12, 9, 0, 0, TAU); g.fill();
          g.globalAlpha = 1;
        }
        break;
      }
      case 'stairsUp':
        Lighting.glow(g, x, y - 16, 10, '#ffd9a0', 0.3);
        break;
      case 'gloamGate': {
        const rx = x, ry = y - 34;
        Lighting.glow(g, rx, ry + 8, 26, '#5a7aff', 0.35 + 0.1 * Math.sin(time * 2));
        g.fillStyle = '#9ab8ff';
        for (let i = 0; i < 9; i++) {
          const a = Math.PI + (i / 8) * Math.PI;
          const on = (i + Math.floor(time * 3)) % 4 !== 0;
          if (on) g.fillRect(Math.round(rx + Math.cos(a) * 21), Math.round(ry + 22 + Math.sin(a) * 16 - 16), 2, 2);
        }
        break;
      }
      case 'lampPost':
        Lighting.glow(g, x, y - 24, 10 * f, '#ffc46b', 0.55);
        g.fillStyle = '#fff0c0'; g.fillRect(Math.round(x - 1), Math.round(y - 25), 2, 3);
        break;
      case 'house': case 'hall': {
        // lit windows
        const wy = this.y + this.h - (this.type === 'hall' ? 18 : 24) + 5;
        for (const wx of [12, this.w - 14]) {
          if (Math.abs(wx - (this.w >> 1)) < 14) continue;
          const px = this.x - 4 + wx + 1 - cx + 4, py = wy + 1 - cy;
          Lighting.glow(g, px + 3, py + 3, 10, '#ffb04a', 0.35 * f);
        }
        break;
      }
      case 'powderKeg':
        if (this.fuse > 0) Lighting.glow(g, x, y - 16, 5, '#ffcf4a', 0.9);
        break;
      default: break;
    }
  }

  light() {
    if (this.broken) return null;
    switch (this.type) {
      case 'shrine': return this.used ? null : { x: this.x, y: this.y - 20, radius: 70, color: SHRINE_COLORS[this.kind], intensity: 0.7 };
      case 'chest': return this.open ? null : { x: this.x, y: this.y - 4, radius: 34, color: this.tier === 'gilded' ? '#ffd84a' : '#d8a060', intensity: 0.5 };
      default: return null;
    }
  }
}

// ======================================================================= traps

export class Trap {
  constructor(d, depth) {
    this.type = d.type;
    this.x = d.x; this.y = d.y;
    this.t = d.phase || 0;
    this.depth = depth;
    this.state = 'idle';
    this.hitPlayer = false;
    this.hitSet = new Set();
    this.cool = 0;
  }

  update(dt, game) {
    const pl = game.player;
    const near = (x, y, r) => (x - this.x) ** 2 + (y - this.y) ** 2 < r * r;
    const dmg = 8 + this.depth * 2.2;
    if (this.type === 'spikes') {
      const period = 3.4;
      this.t = (this.t + dt) % period;
      const prev = this.state;
      this.state = this.t < 2.0 ? 'idle' : this.t < 2.6 ? 'warn' : 'up';
      if (this.state === 'up' && prev !== 'up') {
        this.hitPlayer = false; this.hitSet.clear();
        if (near(pl.x, pl.y, 30)) game.audio.play('spikes', 0.6);
      }
      if (this.state === 'up') {
        if (!this.hitPlayer && pl.alive && near(pl.x, pl.y, 9)) { this.hitPlayer = true; game.combat.hitPlayer(dmg, { knock: 40, angle: Math.atan2(pl.y - this.y, pl.x - this.x) }); }
        for (const e of game.area.enemies) if (!e.dead && !this.hitSet.has(e) && near(e.x, e.y, 9)) { this.hitSet.add(e); game.combat.hitEnemy(e, dmg, { source: 'env', quiet: true }); }
      }
    } else if (this.type === 'firevent') {
      const period = 4.2;
      this.t = (this.t + dt) % period;
      const prev = this.state;
      this.state = this.t < 2.4 ? 'idle' : this.t < 3.1 ? 'warn' : 'up';
      if (this.state === 'warn' && runtimeRng.chance(dt * 12)) game.particles.spawn(P.SMOKE, this.x + (runtimeRng.next() - 0.5) * 6, this.y, 2, 0, 0, 14, 0.9, 3, '#3a2a2a', 1, 4);
      if (this.state === 'up') {
        if (prev !== 'up' && near(pl.x, pl.y, 60)) game.audio.play('flame', 0.7);
        for (let i = 0; i < 3; i++) game.particles.spawn(P.FIRE, this.x + (runtimeRng.next() - 0.5) * 8, this.y + (runtimeRng.next() - 0.5) * 4, 2, (runtimeRng.next() - 0.5) * 10, 0, 50 + runtimeRng.next() * 40, 0.5, 3, runtimeRng.chance(0.5) ? '#ffcf4a' : '#ff7a2e', 1, 10);
        this.cool -= dt;
        if (this.cool <= 0) {
          this.cool = 0.3;
          if (pl.alive && near(pl.x, pl.y, 11)) game.combat.hitPlayer(dmg * 0.5, { element: 'fire', dot: true });
          for (const e of game.area.enemies) if (!e.dead && near(e.x, e.y, 11)) game.combat.hitEnemy(e, dmg * 0.5, { element: 'fire', dot: true, quiet: true });
        }
      }
    } else if (this.type === 'spores') {
      this.cool -= dt;
      if (this.state === 'idle' && this.cool <= 0 && pl.alive && near(pl.x, pl.y, 26)) { this.state = 'warn'; this.t = 0; game.audio.play('telegraph', 0.4); }
      if (this.state === 'warn') {
        this.t += dt;
        if (this.t > 0.55) {
          this.state = 'idle';
          this.cool = 6;
          game.area.groundEffects.push(new GroundEffect('poison', this.x, this.y, 26, 3.2, dmg * 0.8, 'neutral'));
          game.particles.burst(P.SMOKE, this.x, this.y, 20, { speed: 50, life: 1.2, size: 4, colors: ['#8ad04a', '#b8ff6a'], z: 3 });
        }
      }
    }
  }

  drawGround(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    if (this.type === 'spikes') {
      ctx.fillStyle = '#2a262e'; ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = '#4a4652'; ctx.fillRect(x - 6, y - 6, 12, 1);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const px = x - 4 + i * 4, py = y - 4 + j * 4;
        ctx.fillStyle = '#141018'; ctx.fillRect(px, py, 2, 2);
        if (this.state === 'up') { ctx.fillStyle = '#c8c8d8'; ctx.fillRect(px, py - 4, 2, 5); ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py - 4, 1, 1); }
        else if (this.state === 'warn') { ctx.fillStyle = '#8a8a98'; ctx.fillRect(px, py - 1, 2, 2); }
      }
    } else if (this.type === 'firevent') {
      ctx.fillStyle = '#1a1210'; ctx.fillRect(x - 6, y - 5, 12, 10);
      ctx.fillStyle = '#4a3a34';
      for (let i = 0; i < 12; i += 3) ctx.fillRect(x - 6 + i, y - 5, 1, 10);
      ctx.fillRect(x - 6, y - 5, 12, 1);
    } else if (this.type === 'spores') {
      ctx.fillStyle = '#5a3a4a'; ctx.beginPath(); ctx.ellipse(x, y, 6, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = this.state === 'warn' ? '#e0ff8a' : '#9a6a8a'; ctx.beginPath(); ctx.ellipse(x, y - 1, 4 + (this.state === 'warn' ? 2 : 0), 3, 0, 0, TAU); ctx.fill();
    }
  }

  drawEmissive(g, cx, cy, time) {
    const x = this.x - cx, y = this.y - cy;
    if (this.state === 'warn') {
      const col = this.type === 'spores' ? '#aaff4a' : this.type === 'firevent' ? '#ff7a2e' : '#ff5a3a';
      g.globalAlpha = 0.5 + 0.4 * Math.sin(time * 30);
      g.strokeStyle = col;
      g.strokeRect(Math.round(x - 7) + 0.5, Math.round(y - 7) + 0.5, 13, 13);
      g.globalAlpha = 1;
      Lighting.glow(g, x, y, 10, col, 0.4);
    } else if (this.state === 'up' && this.type === 'firevent') {
      Lighting.glow(g, x, y - 10, 16, '#ff8a2e', 0.8);
    } else if (this.type === 'firevent') {
      g.fillStyle = 'rgba(255,90,30,0.35)';
      g.fillRect(Math.round(x - 4), Math.round(y - 2), 8, 4);
    }
  }

  light() {
    if (this.type === 'firevent' && this.state === 'up') return { x: this.x, y: this.y - 8, radius: 70, color: '#ff8a2e', intensity: 0.9 };
    if (this.state === 'warn') return { x: this.x, y: this.y, radius: 30, color: '#ff5a3a', intensity: 0.4 };
    return null;
  }
}
