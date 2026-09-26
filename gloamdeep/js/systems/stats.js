// Derive combat statistics from level, attributes and equipment. Pure module.

import { PLAYER_BASE, LEVEL_GAINS } from '../config.js';
import { WEAPON_BASES, SPELLS, itemStats, SLOTS } from '../gen/items.js';

const FISTS = { dmgMin: 2, dmgMax: 4, speed: 2.0 };
const FIST_BASE = { arc: 1.4, reach: 20, knock: 40 };

export function baseAttributes(level) {
  const l = Math.max(0, level - 1);
  return {
    str: PLAYER_BASE.str + l * LEVEL_GAINS.str,
    int: PLAYER_BASE.int + l * LEVEL_GAINS.int,
    vit: PLAYER_BASE.vit + l * LEVEL_GAINS.vit,
    dex: PLAYER_BASE.dex + l * LEVEL_GAINS.dex,
  };
}

export function computeStats(profile, buffs = null) {
  const level = profile.level;
  const attrs = baseAttributes(level);
  const sum = {};
  const powers = new Set();
  for (const slot of SLOTS) {
    const it = profile.equipment[slot];
    if (!it) continue;
    const st = itemStats(it);
    for (const k in st) sum[k] = (sum[k] || 0) + st[k];
    if (it.power) powers.add(it.power);
  }
  attrs.str += sum.str || 0;
  attrs.int += sum.int || 0;
  attrs.vit += sum.vit || 0;
  attrs.dex += sum.dex || 0;

  const weapon = profile.equipment.weapon || FISTS;
  const wb = profile.equipment.weapon ? WEAPON_BASES[weapon.base] || FIST_BASE : FIST_BASE;
  const focus = profile.equipment.focus;
  const spellId = focus ? focus.spell : 'ember';
  const b = buffs || {};

  const s = {
    level,
    attrs,
    maxHp: Math.round(60 + attrs.vit * 4 + (level - 1) * LEVEL_GAINS.hp + (sum.hp || 0)),
    maxMp: Math.round(40 + attrs.int * 2 + (level - 1) * LEVEL_GAINS.mp + (sum.mp || 0)),
    armor: Math.round((sum.armor || 0) * (b.warding ? 1.5 : 1) + (b.warding ? 10 : 0)),
    dmgMin: weapon.dmgMin + (sum.dmgFlat || 0),
    dmgMax: weapon.dmgMax + (sum.dmgFlat || 0),
    meleeMult: (1 + (attrs.str - 10) * 0.025) * (1 + (sum.dmgPct || 0) / 100) * (b.might ? 1.35 : 1),
    atkSpeed: weapon.speed * (1 + Math.min(60, (sum.atkSpd || 0) + (attrs.dex - 10) * 0.5) / 100) * (b.haste ? 1.2 : 1),
    crit: Math.min(0.75, PLAYER_BASE.critChance + ((sum.crit || 0) + (attrs.dex - 10) * 0.2) / 100),
    critMult: PLAYER_BASE.critMult + (sum.critDmg || 0) / 100,
    moveSpeed: PLAYER_BASE.speed * (1 + Math.min(40, sum.moveSpd || 0) / 100) * (b.haste ? 1.25 : 1),
    hpRegen: PLAYER_BASE.hpRegen + (sum.hpRegen || 0) + attrs.vit * 0.02,
    mpRegen: PLAYER_BASE.mpRegen + (sum.mpRegen || 0) + attrs.int * 0.08,
    spell: spellId,
    spellName: SPELLS[spellId].name,
    spellPower: 8 + (focus ? focus.spellPower : 0) + level * 1.5,
    spellMult: (1 + (attrs.int - 10) * 0.03) * (1 + (sum.spellPct || 0) / 100) * (b.might ? 1.35 : 1),
    spellCost: SPELLS[spellId].cost,
    cdr: Math.min(0.4, (sum.cdr || 0) / 100),
    lifeOnHit: sum.lifeOnHit || 0,
    fireDmg: sum.fireDmg || 0,
    thorns: sum.thorns || 0,
    goldFind: (sum.goldFind || 0) + (b.fortune ? 50 : 0),
    magicFind: (sum.magicFind || 0) + (b.fortune ? 50 : 0),
    light: 1 + Math.min(50, sum.light || 0) / 100,
    xpBonus: (sum.xpBonus || 0) / 100,
    arc: wb.arc,
    reach: wb.reach,
    knock: wb.knock,
    stagger: !!wb.stagger,
    weaponBase: profile.equipment.weapon ? weapon.base : 'fists',
    powers,
  };
  s.spellCooldown = SPELLS[spellId].cooldown * (1 - s.cdr);
  s.dps = ((s.dmgMin + s.dmgMax) / 2) * s.meleeMult * s.atkSpeed * (1 + s.crit * (s.critMult - 1));
  return s;
}

/** Damage reduction from armor against an attacker of a given level (diminishing returns). */
export function armorReduction(armor, attackerLevel) {
  return Math.min(0.75, armor / (armor + 40 + attackerLevel * 12));
}
