// Item tooltip markup (with comparison against the equipped item) and slot markup helpers.

import { RARITIES, RARITY_INDEX } from '../config.js';
import { describeItem, compareItems, SLOT_NAMES, sellPrice, buyPrice, WEAPON_BASES } from '../gen/items.js';
import { itemIcon, slotGhost } from '../fx/icons.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function slotHtml(item, src, i, opts = {}) {
  const cls = ['slot', 'ui-hit'];
  if (!item) cls.push('empty');
  else cls.push(`r-${item.rarity}`);
  if (opts.selected) cls.push('selected');
  if (opts.disabled) cls.push('disabled');
  if (opts.unaffordable) cls.push('unaffordable');
  if (opts.upgrade) cls.push('upgrade');
  const label = item ? `${item.name} (${RARITIES[RARITY_INDEX[item.rarity]].name} ${SLOT_NAMES[item.slot]})` : opts.ghost ? `Empty ${SLOT_NAMES[opts.ghost]} slot` : 'Empty slot';
  const inner = item
    ? `<img src="${itemIcon(item)}" alt="" draggable="false"><span class="ilvl">${item.ilvl}</span>${opts.price != null ? `<span class="price${opts.unaffordable ? ' bad' : ''}">${opts.price}</span>` : ''}${opts.upgrade ? '<span class="up">▲</span>' : ''}`
    : opts.ghost ? `<img class="ghost" src="${slotGhost(opts.ghost)}" alt="" draggable="false">` : '';
  return `<button class="${cls.join(' ')}" data-src="${src}" data-i="${i}" aria-label="${esc(label)}" title="">${inner}</button>`;
}

function fmt(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * opts: { equipped, context: 'sell'|'buy'|'store'|'take'|'equip'|'none', hint }
 */
export function tooltipHtml(item, opts = {}) {
  const r = RARITIES[RARITY_INDEX[item.rarity]];
  const lines = describeItem(item);
  let typeName = SLOT_NAMES[item.slot];
  if (item.slot === 'weapon' && WEAPON_BASES[item.base]) typeName = `${item.baseName} · ${item.base[0].toUpperCase()}${item.base.slice(1)}`;
  else if (item.baseName) typeName = `${item.baseName} · ${SLOT_NAMES[item.slot]}`;
  let h = `<div class="tt-name r-${item.rarity}">${esc(item.name)}</div>`;
  h += `<div class="tt-type"><span class="r-${item.rarity}">${r.name}</span> ${esc(typeName)} <span class="tt-ilvl">iLvl ${item.ilvl}</span></div>`;
  h += '<div class="tt-lines">';
  for (const l of lines) h += `<div class="tt-${l.k}">${esc(l.t)}</div>`;
  h += '</div>';
  if (opts.showCompare !== false) {
    const eq = opts.equipped;
    if (eq === item) {
      h += '<div class="tt-equipped">Currently equipped</div>';
    } else {
      const rows = compareItems(item, eq || null).filter((x) => Math.abs(x.diff) > 0.001);
      h += `<div class="tt-compare"><div class="tt-cmp-head">${eq ? `Compared to <span class="r-${eq.rarity}">${esc(eq.name)}</span>` : 'Slot is empty'}</div>`;
      if (!rows.length) h += '<div class="tt-cmp-row neutral">No difference</div>';
      for (const row of rows.slice(0, 9)) {
        const up = row.diff > 0;
        const good = row.label === 'Spell Cooldown' ? !up : up;
        h += `<div class="tt-cmp-row ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${fmt(row.diff)} ${esc(row.label)}</div>`;
      }
      h += '</div>';
    }
  }
  const price = opts.context === 'buy' ? `Price: <b>${buyPrice(item)}</b> gold` : `Sells for <b>${sellPrice(item)}</b> gold`;
  h += `<div class="tt-price">${price}</div>`;
  if (opts.hint) h += `<div class="tt-hint">${opts.hint}</div>`;
  return h;
}

/** Is the item an upgrade over what is equipped (rough heuristic for the ▲ badge). */
export function isUpgrade(item, equipped) {
  if (!item) return false;
  if (!equipped) return true;
  const rows = compareItems(item, equipped);
  const dps = rows.find((r) => r.label === 'Weapon DPS');
  if (dps) return dps.diff > 0.5;
  const score = (it) => {
    let s = RARITY_INDEX[it.rarity] * 4 + it.ilvl * 0.5 + (it.armor || 0) * 0.6 + (it.spellPower || 0) * 0.5 + it.affixes.length * 2;
    if (it.power) s += 6;
    return s;
  };
  return score(item) > score(equipped) + 1;
}
