// DOM user interface: HUD, panels (inventory, merchant, chest, quests, portal, pause, settings,
// help), title and death screens, toasts, tooltips. Rendering of panels is template based and
// re-done whenever `dirty` is set by the game.

import { GAME_TITLE, GAME_SUBTITLE, VERSION, MAX_POTIONS, xpForLevel, RARITIES, RARITY_INDEX, INVENTORY_SLOTS } from '../config.js';
import { SLOTS, SLOT_NAMES, SPELLS, buyPrice, sellPrice, potionPrice, LEGENDARY_POWERS } from '../gen/items.js';
import { questProgressText } from '../gen/quests.js';
import { seedToText } from '../core/rng.js';
import { formatNumber } from '../core/math.js';
import { itemIcon, potionIcon } from '../fx/icons.js';
import { getSprite, NPC_LOOKS, weaponSprite } from '../fx/sprites.js';
import { themeForDepth } from '../data/themes.js';
import { armorReduction } from '../systems/stats.js';
import { esc, slotHtml, tooltipHtml, isUpgrade } from './tooltip.js';
import { Minimap } from '../render/minimap.js';

const $ = (sel, root = document) => root.querySelector(sel);
/** True while the touch controls are active (ui/touch.js), for touch-specific hints. */
const touchUi = () => document.documentElement.classList.contains('touch-mode');

const WARDEN_LINES = {
  first: 'Another lantern-bearer. Good. The Gloam Stair beneath our village breathes darker every night, and the things below grow bold. I keep a ledger of tasks — pick one, and Wickhollow will pay what it can.',
  idle: 'The notice board never empties. Choose your work, lantern-bearer.',
  active: 'Your task is not finished. The Stair waits beyond the plaza.',
  done: 'You\'ve done it — I can see it in your eyes. Here, you\'ve earned this.',
};

const boundsCache = new WeakMap();
/** Opaque bounding box of a sprite canvas (for tight portrait framing). */
function spriteBounds(spr) {
  let b = boundsCache.get(spr.c);
  if (b) return b;
  const d = spr.c.getContext('2d').getImageData(0, 0, spr.w, spr.h).data;
  let x0 = spr.w, y0 = spr.h, x1 = 0, y1 = 0;
  for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) {
    if (d[(y * spr.w + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  b = x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w: spr.w, h: spr.h };
  boundsCache.set(spr.c, b);
  return b;
}

function fmtTime(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export class UI {
  constructor(game, stage) {
    this.game = game;
    this.stage = stage;
    this.dirty = true;
    this.selected = null;
    this.modalStack = [];
    this.hudCache = {};
    this.toasts = $('#toasts');
    this.modalRoot = $('#modal-root');
    this.tooltip = $('#tooltip');
    this.minimap = new Minimap($('#minimap'), $('#bigmap'));
    this.mapT = 0;
    this.msg = '';
    this.bindStatic();
  }

  // ================================================================== setup

  bindStatic() {
    const g = this.game;
    $('#btn-continue').addEventListener('click', () => { g.audio.unlock(); g.audio.play('click'); g.continueGame(); });
    $('#btn-new').addEventListener('click', () => {
      g.audio.unlock(); g.audio.play('click');
      const seed = $('#seed-input').value;
      if (g.store.hasSave()) {
        this.confirm('Start a new game? Your current character, stash and progress will be permanently erased.', () => g.newGame(seed), 'Erase and start anew');
      } else g.newGame(seed);
    });
    $('#btn-title-help').addEventListener('click', () => { g.audio.unlock(); this.openStandalone('help'); });
    $('#btn-title-settings').addEventListener('click', () => { g.audio.unlock(); this.openStandalone('settings'); });
    $('#seed-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-new').click(); e.stopPropagation(); });

    $('#hud-buttons').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      g.audio.play('click');
      const a = b.dataset.act;
      if (a === 'inventory') g.modal === 'inventory' ? g.closeModal() : !g.modal && g.openModal('inventory');
      else if (a === 'map') g.mapOpen = !g.mapOpen;
      else if (a === 'menu') !g.modal && g.openModal('pause');
      else if (a === 'mute') { g.settings.muted = !g.settings.muted; g.saveSettings(); this.dirty = true; }
      b.blur();
    });

    // panel interaction (event delegation)
    const root = this.modalRoot;
    root.addEventListener('click', (e) => this.onPanelClick(e));
    root.addEventListener('dblclick', (e) => this.onSlotQuick(e));
    // a touch long-press also fires contextmenu: it must not quick-equip or sell
    root.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!this.touchDown) this.onSlotQuick(e); });
    this.bindTouchSlots(root);
    root.addEventListener('mouseover', (e) => this.onSlotHover(e));
    root.addEventListener('mouseout', (e) => { if (e.target.closest('.slot')) this.hideTooltip(); });
    root.addEventListener('input', (e) => this.onSettingInput(e));
    root.addEventListener('change', (e) => this.onSettingInput(e));
    root.addEventListener('focusin', (e) => this.onSlotHover(e));
    root.addEventListener('focusout', () => this.hideTooltip());
    window.addEventListener('mousemove', (e) => this.positionTooltip(e.clientX, e.clientY));
    $('#death-screen').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      g.audio.play('click');
      if (b.dataset.act === 'respawn') g.respawn();
      else if (b.dataset.act === 'title') { this.hideDeath(); g.state = 'play'; g.quitToTitle(); }
    });
  }

  // ================================================================== screens

  showTitle() {
    $('#title-screen').classList.remove('hidden');
    $('#hud').classList.add('hidden');
    $('#death-screen').classList.add('hidden');
    this.closeModal();
    const r = this.game.store.load();
    const cont = $('#btn-continue');
    if (r && r.profile) {
      const p = r.profile;
      cont.disabled = false;
      cont.innerHTML = `Continue <small>Level ${p.level} · Deepest floor ${p.maxDepth || '—'} · ${formatNumber(p.gold)} gold · Seed ${seedToText(p.seed)}</small>`;
    } else {
      cont.disabled = true;
      cont.innerHTML = r && r.error ? `Continue <small>Save unreadable: ${esc(r.error)}</small>` : 'Continue <small>No saved game yet</small>';
    }
    setTimeout(() => (cont.disabled ? $('#btn-new') : cont).focus(), 50);
  }

  showGame() {
    $('#title-screen').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    const p = this.game.profile;
    const hint = $('#controls-hint');
    if (p && p.stats.playTime < 240) {
      hint.classList.remove('hidden', 'fade');
      clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => { hint.classList.add('fade'); setTimeout(() => hint.classList.add('hidden'), 1300); }, 16000);
    } else hint.classList.add('hidden');
    this.hudCache = {};
    this.dirty = true;
  }

  onAreaChanged() {
    this.hudCache = {};
    this.dirty = true;
  }

  banner(title, sub) {
    const b = $('#banner');
    b.innerHTML = `<div class="banner-title">${esc(title)}</div><div class="banner-sub">${esc(sub || '')}</div>`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  setFade(a) { $('#fade').style.opacity = String(a); }

  hurtPulse(k) {
    const h = $('#hurt');
    h.style.transition = 'none';
    h.style.opacity = String(0.25 + k * 0.5);
    void h.offsetWidth;
    h.style.transition = 'opacity 0.45s ease-out';
    h.style.opacity = '0';
  }

  flashPotion() {
    const el = $('#sk-potion');
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  pulseQuest() {
    const el = $('#quest-tracker');
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  toast(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast t-${kind}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 5) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4200);
  }

  alert(text) {
    this.confirm(text, null, null, true);
  }

  showBoss(boss) {
    this.boss = boss;
    const el = $('#bossbar');
    el.innerHTML = `<div class="boss-name">${esc(boss.name)}</div><div class="boss-title">${esc(boss.title)}</div><div class="boss-track"><div class="boss-fill"></div><div class="boss-mark"></div></div>`;
    el.classList.remove('hidden');
  }

  hideBoss() {
    this.boss = null;
    $('#bossbar').classList.add('hidden');
  }

  showDeath(info) {
    const el = $('#death-screen');
    el.innerHTML = `<div class="death-inner">
      <div class="death-title">You Have Fallen</div>
      <div class="death-sub">${esc(info.where || '')}</div>
      <p>Your lantern gutters out in the dark. Wickhollow's wardens drag you home.</p>
      <p class="death-loss">${info.lost ? `You lost <b>${info.lost}</b> gold in the flight.` : 'You carried no gold to lose.'} Your level, equipment, stash and deepest floor are safe.</p>
      <div class="death-buttons"><button class="btn primary ui-hit" data-act="respawn">Return to Wickhollow</button><button class="btn ui-hit" data-act="title">Quit to Title</button></div>
    </div>`;
    el.classList.remove('hidden');
    setTimeout(() => { const b = el.querySelector('[data-act="respawn"]'); if (b) b.focus(); }, 50);
  }

  hideDeath() { $('#death-screen').classList.add('hidden'); }

  // ================================================================== per-frame HUD

  set(key, el, prop, value) {
    if (this.hudCache[key] === value) return;
    this.hudCache[key] = value;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else el.style.setProperty(prop, value);
  }

  update(dt) {
    const g = this.game;
    if (g.state === 'title') return;
    const p = g.profile, s = g.stats, pl = g.player;
    if (!p || !s || !pl) return;
    // orbs
    const hpPct = Math.max(0, pl.hp / s.maxHp);
    const mpPct = Math.max(0, pl.mp / s.maxMp);
    this.set('hp', $('#orb-hp'), '--fill', `${(hpPct * 100).toFixed(1)}%`);
    this.set('mp', $('#orb-mp'), '--fill', `${(mpPct * 100).toFixed(1)}%`);
    this.set('hpt', $('#orb-hp .orb-text'), 'text', `${Math.ceil(pl.hp)} / ${s.maxHp}`);
    this.set('mpt', $('#orb-mp .orb-text'), 'text', `${Math.floor(pl.mp)} / ${s.maxMp}`);
    this.set('low', $('#lowhp'), 'opacity', pl.alive && hpPct < 0.3 ? String(0.35 + (0.3 - hpPct) * 2) : '0');
    // xp
    const need = xpForLevel(p.level);
    this.set('xp', $('#xpbar .fill'), 'width', `${(p.xp / need * 100).toFixed(2)}%`);
    this.set('xpt', $('#xpbar span'), 'text', `Level ${p.level} · ${formatNumber(p.xp)} / ${formatNumber(need)} XP`);
    // skills
    const cdFrac = (t, max) => (t > 0 ? Math.min(1, t / max) : 0);
    this.set('cdA', $('#sk-attack .cd'), '--p', `${(cdFrac(pl.attackCd, 1 / s.atkSpeed) * 100).toFixed(0)}%`);
    this.set('cdS', $('#sk-spell .cd'), '--p', `${(cdFrac(pl.spellCd, s.spellCooldown) * 100).toFixed(0)}%`);
    this.set('cdD', $('#sk-dash .cd'), '--p', `${(cdFrac(pl.dashCd, 0.85) * 100).toFixed(0)}%`);
    this.set('cdP', $('#sk-potion .cd'), '--p', `${(cdFrac(pl.potionCd, 1) * 100).toFixed(0)}%`);
    this.set('pot', $('#sk-potion .count'), 'text', `${p.potions}`);
    $('#sk-spell').classList.toggle('nomana', pl.mp < s.spellCost);
    $('#sk-potion').classList.toggle('empty', p.potions === 0);
    const w = p.equipment.weapon, f = p.equipment.focus;
    const wsrc = w ? itemIcon(w) : '';
    if (this.hudCache.wsrc !== wsrc) { this.hudCache.wsrc = wsrc; $('#sk-attack img').src = wsrc || potionIcon(); $('#sk-attack img').style.visibility = w ? 'visible' : 'hidden'; }
    const fsrc = f ? itemIcon(f) : itemIcon({ slot: 'focus', base: 'ember', tier: 0, rarity: 'common', spell: 'ember' });
    if (this.hudCache.fsrc !== fsrc) { this.hudCache.fsrc = fsrc; $('#sk-spell img').src = fsrc; }
    if (this.hudCache.psrc !== 1) { this.hudCache.psrc = 1; $('#sk-potion img').src = potionIcon(); }
    this.set('cost', $('#sk-spell .cost'), 'text', `${s.spellCost}`);
    this.set('spellLbl', $('#sk-spell .lbl'), 'text', s.spellName);
    this.set('atkLbl', $('#sk-attack .lbl'), 'text', w ? w.baseName : 'Fists');
    // top left
    const a = g.area;
    this.set('loc', $('#loc-name'), 'html', a.type === 'town' ? '<b>Wickhollow</b><small>Safe haven</small>' : `<b>Floor ${a.depth}</b><small>${esc(a.theme.name)}${a.boss ? ' · Guardian' : ''}</small>`);
    const q = p.quest;
    let qh = '';
    if (q) {
      const pct = Math.round((q.progress / q.required) * 100);
      qh = `<div class="qt-title">${esc(q.title)}</div><div class="qt-prog">${q.done ? '✔ Return to Warden Isolde' : esc(questProgressText(q))}</div><div class="qt-bar"><div style="width:${pct}%"></div></div>`;
    } else qh = '<div class="qt-title muted">No active quest</div><div class="qt-prog">Visit Warden Isolde in Wickhollow</div>';
    this.set('quest', $('#quest-tracker'), 'html', qh);
    $('#quest-tracker').classList.toggle('done', !!(q && q.done));
    // buffs
    const bl = Object.entries(pl.buffs).map(([k, t]) => `<span class="buff b-${k}">${k[0].toUpperCase() + k.slice(1)} ${Math.ceil(t)}s</span>`).join('');
    this.set('buffs', $('#buffs'), 'html', bl);
    // resources
    this.set('gold', $('#gold'), 'text', formatNumber(p.gold));
    this.set('depth', $('#depth'), 'text', a.type === 'town' ? `Deepest: ${p.maxDepth || '—'}` : `Depth ${a.depth} / ${p.maxDepth}`);
    this.set('mute', $('#btn-mute'), 'text', g.settings.muted ? '🔇' : '🔊');
    // prompt
    const t = g.interactTarget;
    const promptHtml = t && !g.modal && pl.alive ? `<kbd>E</kbd> ${esc(t.label)}` : '';
    this.set('prompt', $('#prompt'), 'html', promptHtml);
    $('#prompt').classList.toggle('show', !!promptHtml);
    // boss
    if (this.boss) {
      const k = Math.max(0, this.boss.hp / this.boss.maxHp);
      this.set('boss', $('#bossbar .boss-fill'), 'width', `${(k * 100).toFixed(1)}%`);
    }
    // minimap
    this.mapT -= dt;
    const mm = $('#minimap');
    mm.style.display = g.settings.showMinimap ? '' : 'none';
    if (this.mapT <= 0 && g.settings.showMinimap) { this.mapT = 0.1; this.minimap.drawSmall(g); }
    const big = $('#bigmap');
    if (g.mapOpen && !g.modal) {
      big.classList.remove('hidden');
      const want = [Math.round(this.stage.clientWidth), Math.round(this.stage.clientHeight)];
      if (big.width !== want[0] || big.height !== want[1]) { big.width = want[0]; big.height = want[1]; }
      this.minimap.drawBig(g);
    } else big.classList.add('hidden');
    // debug overlay
    const dbg = $('#debug');
    if (g.debugOpen) {
      const d = g.debugInfo();
      dbg.textContent = `FPS ${d.fps} | Seed ${d.seed} | ${d.area} ${d.depth} | enemies ${d.enemies} | proj ${d.projectiles} | particles ${d.particles} | loot ${d.loot} | pos ${d.player.x},${d.player.y}`;
      dbg.style.display = 'block';
    } else dbg.style.display = 'none';
    // panels
    if (this.dirty) {
      this.dirty = false;
      if (g.modal) this.renderModal();
    }
  }

  // ================================================================== modal management

  openModal(name) {
    this.selected = null;
    this.msg = '';
    this.reward = null;
    this.confirmState = null;
    this.current = name;
    this.renderModal();
  }

  openStandalone(name) {
    // settings / help from the title screen (no running game)
    this.current = name;
    this.standalone = true;
    this.renderModal();
  }

  closeModal() {
    this.current = null;
    this.standalone = false;
    this.modalRoot.innerHTML = '';
    this.modalRoot.classList.remove('open');
    this.hideTooltip();
  }

  back() {
    const g = this.game;
    if (this.confirmState) { this.confirmState = null; this.renderModal(); return; }
    if (this.current === 'settings' || this.current === 'help') {
      if (this.standalone) { this.closeModal(); return; }
      if (this.returnTo === 'pause') { this.returnTo = null; g.modal = 'pause'; this.current = 'pause'; this.renderModal(); return; }
    }
    g.closeModal();
  }

  confirm(text, onYes, yesLabel = 'Confirm', infoOnly = false) {
    this.confirmState = { text, onYes, yesLabel, infoOnly };
    if (!this.current) { this.current = 'confirm-only'; }
    this.renderModal();
  }

  renderModal() {
    const g = this.game;
    const name = this.current;
    if (!name) { this.modalRoot.classList.remove('open'); return; }
    let html = '';
    if (this.confirmState) {
      const c = this.confirmState;
      html = `<div class="panel panel-confirm" role="dialog" aria-modal="true"><div class="panel-body"><p>${esc(c.text)}</p>
        <div class="row-buttons">${c.infoOnly ? '<button class="btn primary ui-hit" data-action="confirm-no">OK</button>' : `<button class="btn danger ui-hit" data-action="confirm-yes">${esc(c.yesLabel)}</button><button class="btn ui-hit" data-action="confirm-no">Cancel</button>`}</div></div></div>`;
    } else {
      switch (name) {
        case 'inventory': html = this.panelInventory(); break;
        case 'merchant': html = this.panelMerchant(); break;
        case 'chest': html = this.panelChest(); break;
        case 'quest': html = this.panelQuest(); break;
        case 'dialog': html = this.panelDialog(); break;
        case 'portal': html = this.panelPortal(); break;
        case 'pause': html = this.panelPause(); break;
        case 'settings': html = this.panelSettings(); break;
        case 'help': html = this.panelHelp(); break;
        case 'confirm-only': this.closeModal(); return;
        default: html = '';
      }
    }
    const focused = document.activeElement && this.modalRoot.contains(document.activeElement) ? document.activeElement.dataset : null;
    this.hideTooltip();
    this.modalRoot.innerHTML = `<div class="backdrop"></div>${html}`;
    this.modalRoot.classList.add('open');
    this.drawPortraits();
    // keep keyboard focus stable across re-renders
    let el = null;
    if (focused && focused.src) el = this.modalRoot.querySelector(`[data-src="${focused.src}"][data-i="${focused.i}"]`);
    else if (focused && focused.action) el = this.modalRoot.querySelector(`[data-action="${focused.action}"]`);
    if (!el) el = this.modalRoot.querySelector('.btn.primary, .panel button');
    if (el) el.focus({ preventScroll: true });
    void g;
  }

  drawPortraits() {
    for (const c of this.modalRoot.querySelectorAll('canvas.portrait')) {
      const who = c.dataset.who;
      const g2 = c.getContext('2d');
      g2.imageSmoothingEnabled = false;
      g2.clearRect(0, 0, c.width, c.height);
      const look = who === 'player' ? this.game.player.look : NPC_LOOKS[who];
      const spr = getSprite(look, 0, 0, 'idle');
      const b = spriteBounds(spr);
      const pad = who === 'player' ? 8 : 2;
      const sc = Math.max(1, Math.floor(Math.min((c.width - 8) / (b.w + pad), (c.height - 8) / (b.h + 2))));
      const ox = Math.floor((c.width - b.w * sc) / 2) - b.x * sc - (who === 'player' ? sc * 3 : 0);
      const oy = Math.floor((c.height - b.h * sc) / 2) - b.y * sc;
      g2.drawImage(spr.c, ox, oy, spr.w * sc, spr.h * sc);
      if (who === 'player') {
        const s = this.game.stats;
        const w = this.game.profile.equipment.weapon;
        const ws = weaponSprite(s.weaponBase, w ? w.tier : 0);
        g2.save();
        g2.translate(ox + (spr.ax + 6) * sc, oy + (spr.ay - 8) * sc);
        g2.rotate(-0.9);
        g2.drawImage(ws.c, -ws.gx * sc, -ws.gy * sc, ws.c.width * sc, ws.c.height * sc);
        g2.restore();
      }
    }
  }

  msgHtml() { return this.msg ? `<div class="panel-msg">${esc(this.msg)}</div>` : ''; }

  // ================================================================== panels

  panelHeader(title, sub = '') {
    return `<div class="panel-head"><div><h2>${esc(title)}</h2>${sub ? `<div class="panel-sub">${sub}</div>` : ''}</div><button class="btn close ui-hit" data-action="close" aria-label="Close">✕</button></div>`;
  }

  gridHtml(items, src, opts = {}) {
    const g = this.game;
    return `<div class="grid ${opts.cls || ''}">${items.map((it, i) => {
      const sel = this.selected && this.selected.src === src && this.selected.i === i;
      const o = { selected: sel };
      if (it && opts.priceFn) { o.price = opts.priceFn(it); o.unaffordable = opts.buy && g.profile.gold < o.price; }
      if (it && opts.upgrades && it.slot) o.upgrade = isUpgrade(it, g.profile.equipment[it.slot]);
      return slotHtml(it, src, i, o);
    }).join('')}</div>`;
  }

  statsHtml() {
    const s = this.game.stats, p = this.game.profile;
    const depth = Math.max(1, this.game.area.depth || p.maxDepth || 1);
    const sp = SPELLS[s.spell];
    const row = (k, v, cls = '') => `<div class="st-row ${cls}"><span>${k}</span><b>${v}</b></div>`;
    return `<div class="stats">
      <div class="st-group"><h3>Attributes</h3>
        ${row('Strength', s.attrs.str)}${row('Intellect', s.attrs.int)}${row('Vitality', s.attrs.vit)}${row('Dexterity', s.attrs.dex)}</div>
      <div class="st-group"><h3>Offense</h3>
        ${row('Weapon damage', `${Math.round(s.dmgMin * s.meleeMult)}–${Math.round(s.dmgMax * s.meleeMult)}`)}
        ${row('Attacks / sec', s.atkSpeed.toFixed(2))}${row('Melee DPS', s.dps.toFixed(1), 'hl')}
        ${row('Critical chance', `${(s.crit * 100).toFixed(1)}%`)}${row('Critical damage', `${Math.round(s.critMult * 100)}%`)}
        ${row('Spell', `${sp.name}`)}${row('Spell damage', Math.round(s.spellPower * s.spellMult * sp.power))}
        ${row('Mana cost · cooldown', `${s.spellCost} · ${s.spellCooldown.toFixed(2)}s`)}</div>
      <div class="st-group"><h3>Defense</h3>
        ${row('Life', s.maxHp)}${row('Mana', s.maxMp)}
        ${row('Armor', `${s.armor} (−${Math.round(armorReduction(s.armor, depth) * 100)}% vs floor ${depth})`)}
        ${row('Life regen', `${s.hpRegen.toFixed(1)}/s`)}${row('Mana regen', `${s.mpRegen.toFixed(1)}/s`)}
        ${row('Move speed', `${Math.round(s.moveSpeed / 0.8)}%`)}</div>
      <div class="st-group"><h3>Fortune</h3>
        ${row('Gold find', `+${s.goldFind}%`)}${row('Magic find', `+${s.magicFind}%`)}${row('Lantern radius', `${Math.round(s.light * 100)}%`)}
        ${s.powers.size ? [...s.powers].map((pw) => `<div class="st-power">✦ ${esc(LEGENDARY_POWERS[pw].text)}</div>`).join('') : ''}</div>
    </div>`;
  }

  detailHtml(ctx) {
    const g = this.game;
    const sel = this.selected;
    if (!sel) return `<div class="detail empty">${ctx.emptyHint || 'Select an item to see its details.'}</div>`;
    const item = this.itemAt(sel);
    if (!item) return '<div class="detail empty">—</div>';
    const eq = g.profile.equipment[item.slot];
    let buttons = '';
    for (const b of ctx.buttons(sel, item)) {
      buttons += `<button class="btn ui-hit ${b.cls || ''}" data-action="${b.action}" ${b.disabled ? 'disabled' : ''}>${b.label}</button>`;
    }
    return `<div class="detail"><div class="detail-tt">${tooltipHtml(item, { equipped: sel.src === 'eq' ? item : eq, context: sel.src === 'shop' ? 'buy' : 'sell' })}</div><div class="row-buttons">${buttons}</div></div>`;
  }

  itemAt(sel) {
    const p = this.game.profile;
    if (!sel) return null;
    if (sel.src === 'inv') return p.inventory[sel.i];
    if (sel.src === 'store') return p.storage[sel.i];
    if (sel.src === 'eq') return p.equipment[SLOTS[sel.i]];
    if (sel.src === 'shop') return p.merchant.stock[sel.i];
    if (sel.src === 'bb') return this.game.buyback[sel.i] ? this.game.buyback[sel.i].item : null;
    return null;
  }

  paperdollHtml() {
    const p = this.game.profile;
    const layout = { helm: 'pd-helm', amulet: 'pd-amulet', weapon: 'pd-weapon', focus: 'pd-focus', armor: 'pd-armor', ring: 'pd-ring', boots: 'pd-boots' };
    let h = '<div class="paperdoll"><canvas class="portrait" data-who="player" width="120" height="150"></canvas>';
    SLOTS.forEach((slot, i) => {
      const it = p.equipment[slot];
      const sel = this.selected && this.selected.src === 'eq' && this.selected.i === i;
      h += `<div class="pd-slot ${layout[slot]}"><span class="pd-label">${SLOT_NAMES[slot]}</span>${slotHtml(it, 'eq', i, { selected: sel, ghost: slot })}</div>`;
    });
    return h + '</div>';
  }

  panelInventory() {
    const g = this.game, p = g.profile;
    const used = p.inventory.filter(Boolean).length;
    const ctx = {
      emptyHint: touchUi() ? 'Tap an item to inspect it, then use the buttons. Long-press shows its details.' : 'Click an item to inspect it. Double-click or right-click to equip.',
      buttons: (sel, item) => {
        if (sel.src === 'eq') return [{ action: 'unequip', label: 'Unequip', cls: 'primary' }];
        return [{ action: 'equip', label: `Equip (${SLOT_NAMES[item.slot]})`, cls: 'primary' }, { action: 'drop', label: 'Drop on ground' }];
      },
    };
    return `<div class="panel panel-inventory" role="dialog" aria-modal="true" aria-label="Inventory">
      ${this.panelHeader('Character & Inventory', `Level ${p.level} Lantern-bearer · <span class="gold">${formatNumber(p.gold)} gold</span> · ${p.potions}/${MAX_POTIONS} potions`)}
      <div class="panel-body cols">
        <div class="col col-char">${this.paperdollHtml()}${this.statsHtml()}</div>
        <div class="col col-inv"><h3>Pack <small>${used}/${INVENTORY_SLOTS}</small></h3>${this.gridHtml(p.inventory, 'inv', { upgrades: true })}
          ${this.msgHtml()}${this.detailHtml(ctx)}</div>
      </div>
      <div class="panel-foot">I / Esc close · ▲ marks likely upgrades · Items dropped on the ground can be picked up again</div>
    </div>`;
  }

  panelMerchant() {
    const g = this.game, p = g.profile;
    const pp = potionPrice(p.level);
    const potionBtn = `<div class="potion-row"><img src="${potionIcon()}" alt=""><div><b>Health Potion</b><small>Restores 45% life · ${p.merchant.potions} in stock · you carry ${p.potions}/${MAX_POTIONS}</small></div>
      <button class="btn ui-hit ${p.gold < pp || p.merchant.potions <= 0 || p.potions >= MAX_POTIONS ? 'disabled-look' : ''}" data-action="buy-potion" ${p.merchant.potions <= 0 || p.potions >= MAX_POTIONS ? 'disabled' : ''}>Buy · ${pp} g</button></div>`;
    const bb = g.buyback.length ? `<h3>Buy back</h3><div class="grid grid-bb">${g.buyback.map((b, i) => slotHtml(b.item, 'bb', i, { price: b.price, unaffordable: p.gold < b.price, selected: this.selected && this.selected.src === 'bb' && this.selected.i === i })).join('')}</div>` : '';
    const ctx = {
      emptyHint: touchUi() ? 'Tap an item to inspect it, then buy or sell with the buttons.' : 'Click an item to inspect it. Right-click to buy or sell instantly.',
      buttons: (sel, item) => {
        if (sel.src === 'shop') { const pr = buyPrice(item); return [{ action: 'buy', label: `Buy for ${pr} gold`, cls: 'primary', disabled: p.gold < pr }]; }
        if (sel.src === 'bb') { const b = g.buyback[sel.i]; return [{ action: 'buyback', label: `Buy back for ${b.price} gold`, cls: 'primary', disabled: p.gold < b.price }]; }
        if (sel.src === 'inv') return [{ action: 'sell', label: `Sell for ${sellPrice(item)} gold`, cls: 'primary' }, { action: 'equip', label: 'Equip' }];
        return [];
      },
    };
    return `<div class="panel panel-merchant" role="dialog" aria-modal="true" aria-label="Merchant">
      ${this.panelHeader("Pell's Curiosities", `"Fine steel, cheap magic, no refunds." · <span class="gold">${formatNumber(p.gold)} gold</span>`)}
      <div class="panel-body cols">
        <div class="col"><div class="npc-line"><canvas class="portrait small" data-who="merchant" width="56" height="64"></canvas><p>New wares arrive after every expedition into the Gloamdeep, or when you grow stronger.</p></div>
          <h3>Wares</h3>${this.gridHtml(p.merchant.stock, 'shop', { priceFn: buyPrice, buy: true, upgrades: true, cls: 'grid-shop' })}${potionBtn}${bb}</div>
        <div class="col"><h3>Your pack <small>${p.inventory.filter(Boolean).length}/${INVENTORY_SLOTS}</small></h3>${this.gridHtml(p.inventory, 'inv', { priceFn: sellPrice })}
          <div class="row-buttons"><button class="btn ui-hit" data-action="sell-common">Sell all common items</button></div>
          ${this.msgHtml()}${this.detailHtml(ctx)}</div>
      </div>
    </div>`;
  }

  panelChest() {
    const g = this.game, p = g.profile;
    return `<div class="panel panel-chest" role="dialog" aria-modal="true" aria-label="Storage chest">
      ${this.panelHeader('Your Storage Chest', 'Safe from death and the dark. Contents persist between sessions.')}
      <div class="panel-body cols">
        <div class="col"><h3>Chest <small>${p.storage.filter(Boolean).length}/${p.storage.length}</small></h3>${this.gridHtml(p.storage, 'store', { cls: 'grid-store' })}
          <div class="row-buttons"><button class="btn ui-hit" data-action="sort-store">Sort chest</button></div></div>
        <div class="col"><h3>Your pack <small>${p.inventory.filter(Boolean).length}/${INVENTORY_SLOTS}</small></h3>${this.gridHtml(p.inventory, 'inv')}
          <div class="row-buttons"><button class="btn ui-hit" data-action="deposit-all">Deposit entire pack</button></div>
          ${this.msgHtml()}<div class="hint">${touchUi() ? 'Tap an item to move it. Long-press for details.' : 'Click an item to move it. Hover for details.'}</div></div>
      </div>
    </div>`;
  }

  panelQuest() {
    const g = this.game, p = g.profile;
    const q = p.quest;
    let text, body = '';
    if (this.reward) {
      const r = this.reward;
      text = WARDEN_LINES.done;
      body = `<div class="reward-box"><h3>Rewards received</h3><div class="rw-row"><span class="gold">+${r.gold} gold</span><span class="xp">+${r.xp} XP</span>${r.potions ? `<span>+${r.potions} potions</span>` : ''}</div>
        ${r.item ? `<div class="rw-item">${slotHtml(r.item, 'reward', 0)}<div><b class="r-${r.item.rarity}">${esc(r.item.name)}</b><small>${r.stored ? 'Your pack was full — it was placed in your storage chest.' : 'Added to your pack.'}</small></div></div>` : ''}
        <div class="row-buttons"><button class="btn primary ui-hit" data-action="reward-ok">See new tasks</button></div></div>`;
    } else if (q && q.done) {
      text = WARDEN_LINES.done;
      body = `<div class="quest-card active done"><div class="qc-title">${esc(q.title)}</div><div class="qc-desc">${esc(q.desc)}</div><div class="qc-prog">✔ Complete</div>${this.rewardLine(q)}</div>
        <div class="row-buttons"><button class="btn primary ui-hit" data-action="turn-in">Claim reward</button></div>`;
    } else if (q) {
      text = WARDEN_LINES.active;
      const pct = Math.round((q.progress / q.required) * 100);
      body = `<div class="quest-card active"><div class="qc-title">${esc(q.title)}</div><div class="qc-desc">${esc(q.desc)}</div>
        <div class="qc-prog">${esc(questProgressText(q))}</div><div class="qt-bar big"><div style="width:${pct}%"></div></div>${this.rewardLine(q)}</div>
        <div class="row-buttons"><button class="btn ui-hit" data-action="close">Farewell</button><button class="btn danger ui-hit" data-action="abandon">Abandon quest</button></div>`;
    } else {
      text = p.questsCompleted === 0 && !this.seenIntro ? WARDEN_LINES.first : WARDEN_LINES.idle;
      this.seenIntro = true;
      const offers = g.currentOffers();
      body = `<div class="quest-offers">${offers.map((o, i) => `<div class="quest-card"><div class="qc-type t-${o.type}">${{ kill: 'Hunt', collect: 'Gather', depth: 'Descend', elite: 'Champions', boss: 'Guardian' }[o.type]}</div>
          <div class="qc-title">${esc(o.title)}</div><div class="qc-desc">${esc(o.desc)}</div>${this.rewardLine(o)}
          <button class="btn primary ui-hit" data-action="accept" data-q="${i}">Accept</button></div>`).join('')}</div>`;
    }
    return `<div class="panel panel-quest" role="dialog" aria-modal="true" aria-label="Warden Isolde">
      ${this.panelHeader('Warden Isolde', `Keeper of the Watch · Quests completed: ${p.questsCompleted}`)}
      <div class="panel-body"><div class="npc-line big"><canvas class="portrait" data-who="warden" width="84" height="100"></canvas><p class="speech">${esc(text)}</p></div>${body}</div>
    </div>`;
  }

  rewardLine(q) {
    const r = q.reward;
    const item = r.item ? `<span class="r-${r.item}">${RARITIES[RARITY_INDEX[r.item]].name} item</span>` : '';
    return `<div class="qc-reward">Reward: <span class="gold">${r.gold} gold</span> · <span class="xp">${r.xp} XP</span>${item ? ` · ${item}` : ''}${r.potions ? ` · ${r.potions} potions` : ''}</div>`;
  }

  panelDialog() {
    const d = this.game.dialog;
    if (!d) return '';
    return `<div class="panel panel-dialog" role="dialog" aria-modal="true">
      ${this.panelHeader(d.npc.name, 'Villager of Wickhollow')}
      <div class="panel-body"><div class="npc-line big"><canvas class="portrait" data-who="${d.npc.look.key}" width="84" height="100"></canvas><p class="speech">${esc(d.text)}</p></div>
      <div class="row-buttons">${d.options.map((o, i) => `<button class="btn primary ui-hit" data-action="dialog-opt" data-o="${i}">${esc(o.label)}</button>`).join('')}</div></div>
    </div>`;
  }

  panelPortal() {
    const g = this.game, p = g.profile;
    const floors = g.portalFloors();
    const q = p.quest;
    return `<div class="panel panel-portal" role="dialog" aria-modal="true" aria-label="The Gloam Stair">
      ${this.panelHeader('The Gloam Stair', 'Ancient steps spiral down into the Gloamdeep. Where will you begin?')}
      <div class="panel-body">
        ${q && !q.done ? `<div class="portal-quest">Active quest: <b>${esc(q.title)}</b> — ${esc(questProgressText(q))}</div>` : ''}
        <div class="portal-list">${floors.map((d) => {
          const th = themeForDepth(d);
          const tag = d === 1 ? 'Beginning' : d === p.maxDepth ? 'Deepest reached' : 'Waystone';
          return `<button class="btn portal-btn ui-hit ${d === p.maxDepth && d > 1 ? 'primary' : ''}" data-action="enter" data-d="${d}"><b>Floor ${d}</b><span>${esc(th.name)}${d % 5 === 0 ? ' · Guardian' : ''}</span><small>${tag}</small></button>`;
        }).join('')}</div>
        <p class="hint">Every floor is generated from your world seed (${seedToText(p.seed)}). A guardian waits on every fifth floor; defeating it unlocks a waystone just below.</p>
      </div>
    </div>`;
  }

  panelPause() {
    const g = this.game, p = g.profile;
    const a = g.area;
    return `<div class="panel panel-pause" role="dialog" aria-modal="true" aria-label="Paused">
      ${this.panelHeader('Paused', `${GAME_TITLE} v${VERSION}`)}
      <div class="panel-body cols">
        <div class="col menu-col">
          <button class="btn primary ui-hit" data-action="close">Resume</button>
          <button class="btn ui-hit" data-action="open-inventory">Character & Inventory</button>
          <button class="btn ui-hit" data-action="open-settings">Settings</button>
          <button class="btn ui-hit" data-action="open-help">Controls & Help</button>
          <button class="btn ui-hit" data-action="save-quit">Save & Quit to Title</button>
          <a class="btn ui-hit game-collection-link" data-action="leave" href="../index.html" aria-label="Speichern und zur Spieleauswahl">← Spieleauswahl</a>
          <button class="btn danger ui-hit" data-action="new-game">New Game…</button>
        </div>
        <div class="col info-col">
          <h3>World</h3>
          <div class="st-row"><span>World seed</span><b class="mono">${seedToText(p.seed)}</b></div>
          <div class="st-row"><span>Location</span><b>${a.type === 'town' ? 'Wickhollow' : `Floor ${a.depth}`}</b></div>
          ${a.type === 'dungeon' ? `<div class="st-row"><span>Floor seed</span><b class="mono">${seedToText(a.floor.seed)}</b></div><div class="st-row"><span>Floor size</span><b>${a.W}×${a.H} · ${a.floor.rooms.length} rooms</b></div>` : ''}
          <div class="st-row"><span>Deepest floor</span><b>${p.maxDepth}</b></div>
          <h3>Chronicle</h3>
          <div class="st-row"><span>Monsters slain</span><b>${formatNumber(p.stats.kills)}</b></div>
          <div class="st-row"><span>Champions · Guardians</span><b>${p.stats.elites} · ${p.stats.bosses}</b></div>
          <div class="st-row"><span>Deaths</span><b>${p.stats.deaths}</b></div>
          <div class="st-row"><span>Gold earned</span><b>${formatNumber(p.stats.goldEarned)}</b></div>
          <div class="st-row"><span>Quests completed</span><b>${p.questsCompleted}</b></div>
          <div class="st-row"><span>Time played</span><b>${fmtTime(p.stats.playTime)}</b></div>
        </div>
      </div>
    </div>`;
  }

  panelSettings() {
    const s = this.game.settings;
    const tog = (k, label) => `<label class="toggle ui-hit"><input type="checkbox" data-setting="${k}" ${s[k] ? 'checked' : ''}><span>${label}</span></label>`;
    return `<div class="panel panel-settings" role="dialog" aria-modal="true" aria-label="Settings">
      ${this.panelHeader('Settings', 'Saved automatically')}
      <div class="panel-body">
        <label class="slider">Effects volume <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-setting="volume"></label>
        <label class="slider">Music volume <input type="range" min="0" max="1" step="0.05" value="${s.music}" data-setting="music"></label>
        ${tog('muted', 'Mute all sound (N)')}${tog('shake', 'Screen shake')}${tog('damageNumbers', 'Floating damage numbers')}${tog('showMinimap', 'Show minimap')}
        <label class="select-row ui-hit">Touch controls <select data-setting="touch">${[['auto', 'Automatic'], ['on', 'Always on'], ['off', 'Off']].map(([v, l]) => `<option value="${v}" ${s.touch === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="row-buttons"><button class="btn primary ui-hit" data-action="back">Back</button></div>
      </div>
    </div>`;
  }

  panelHelp() {
    const k = (key, what) => `<div class="key-row"><kbd>${key}</kbd><span>${what}</span></div>`;
    return `<div class="panel panel-help" role="dialog" aria-modal="true" aria-label="Help">
      ${this.panelHeader('How to Play', 'Descend, grow stronger, return home, descend again.')}
      <div class="panel-body cols">
        <div class="col">
          <div class="touch-only">
            <h3>Touch</h3>
            ${k('Left stick', 'Move (or WASD on a keyboard)')}${k('Tap world', 'Attack at that spot — hold to keep swinging')}${k('Big button', 'Attack the nearest foe')}
            ${k('Small buttons', 'Spell, dash, potion — keep a finger on the world to aim the spell there')}${k('✋ / prompt', 'Interact, talk, pick up')}${k('Top right', 'Pack · Map (tap the map to close it) · Menu')}
          </div>
          <h3>Controls</h3>
          ${k('W A S D', 'Move')}${k('Mouse', 'Aim')}${k('Left button', 'Weapon attack (hold to keep swinging)')}${k('Right button', 'Cast your focus spell')}
          ${k('Space', 'Dash — brief invulnerability')}${k('E', 'Interact, talk, use stairs, pick up items')}${k('Q', 'Drink a health potion')}
          ${k('I', 'Inventory & character')}${k('M', 'Toggle the full map')}${k('Esc', 'Pause / close a window')}${k('Alt', 'Show all item labels')}${k('N', 'Mute')}${k('F3', 'Debug info')}
        </div>
        <div class="col">
          <h3>Tips</h3>
          <ul class="tips">
            <li>Red shapes on the ground are <b>telegraphs</b>: step out or dash through before they fill.</li>
            <li>Your weapon swing <b>parries</b> enemy projectiles.</li>
            <li>The equipped <b>focus</b> decides your spell: Ember Bolt, Frost Lance, Chain Lightning or Void Orb.</li>
            <li>Every fifth floor holds a <b>guardian</b>. The stairs stay sealed until it falls.</li>
            <li>Take the <b>up-stairs</b> (where you arrived) to return to Wickhollow at any time.</li>
            <li>Powder kegs, bloaters and spore pods explode — use them against monsters.</li>
            <li>Loot colours: <span class="r-common">Common</span>, <span class="r-magic">Magic</span>, <span class="r-rare">Rare</span>, <span class="r-epic">Epic</span>, <span class="r-legendary">Legendary</span>.</li>
          </ul>
        </div>
      </div>
      <div class="row-buttons"><button class="btn primary ui-hit" data-action="back">Back</button></div>
    </div>`;
  }

  // ================================================================== events

  onPanelClick(e) {
    const g = this.game;
    if (this.longPressed) { this.longPressed = false; return; } // the long press only showed the tooltip
    if (e.target.classList.contains('backdrop')) {
      if (this.confirmState) return;
      this.back();
      return;
    }
    const slot = e.target.closest('.slot');
    if (slot) { this.onSlotClick(slot, e); return; }
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    g.audio.play('click');
    const act = b.dataset.action;
    const sel = this.selected;
    const setMsg = (m) => { this.msg = m || ''; };
    switch (act) {
      case 'close': g.closeModal(); if (this.standalone) this.closeModal(); break;
      case 'back': this.back(); break;
      case 'confirm-yes': { const c = this.confirmState; this.confirmState = null; if (this.current === 'confirm-only') this.closeModal(); else this.renderModal(); if (c && c.onYes) c.onYes(); break; }
      case 'confirm-no': this.confirmState = null; if (this.current === 'confirm-only') this.closeModal(); else this.renderModal(); break;
      case 'equip': if (sel && sel.src === 'inv') { g.equip(sel.i); this.selected = null; setMsg(''); } break;
      case 'unequip': if (sel && sel.src === 'eq') { setMsg(g.unequip(SLOTS[sel.i])); this.selected = null; } break;
      case 'drop': if (sel && sel.src === 'inv') { const it = g.profile.inventory[sel.i]; if (it && RARITY_INDEX[it.rarity] >= 2) { this.confirm(`Drop ${it.name} on the ground?`, () => { g.dropFromInventory(sel.i); this.selected = null; this.dirty = true; }, 'Drop it'); return; } g.dropFromInventory(sel.i); this.selected = null; } break;
      case 'buy': if (sel && sel.src === 'shop') { setMsg(g.buyItem(sel.i)); if (!this.msg) this.selected = null; } break;
      case 'buyback': if (sel && sel.src === 'bb') { setMsg(g.buyBack(sel.i)); if (!this.msg) this.selected = null; } break;
      case 'sell': if (sel && sel.src === 'inv') { const it = g.profile.inventory[sel.i]; if (it && RARITY_INDEX[it.rarity] >= 3) { this.confirm(`Sell ${it.name} for ${sellPrice(it)} gold?`, () => { g.sellItem(sel.i); this.selected = null; this.dirty = true; }, 'Sell'); return; } setMsg(g.sellItem(sel.i)); this.selected = null; } break;
      case 'sell-common': setMsg(g.sellAllCommon()); this.selected = null; break;
      case 'buy-potion': setMsg(g.buyPotion()); break;
      case 'deposit-all': setMsg(g.depositAll()); break;
      case 'sort-store': g.sortStorage(); break;
      case 'accept': g.acceptQuest(Number(b.dataset.q)); break;
      case 'abandon': this.confirm('Abandon this quest? Its progress will be lost.', () => g.abandonQuest(), 'Abandon'); return;
      case 'turn-in': this.reward = g.turnInQuest(); break;
      case 'reward-ok': this.reward = null; break;
      case 'dialog-opt': { const o = g.dialog.options[Number(b.dataset.o)]; if (o) o.act(); return; }
      case 'enter': g.enterDungeonAt(Number(b.dataset.d)); return;
      case 'open-inventory': g.modal = 'inventory'; this.openModal('inventory'); return;
      case 'open-settings': this.returnTo = 'pause'; g.modal = 'settings'; this.current = 'settings'; this.renderModal(); return;
      case 'open-help': this.returnTo = 'pause'; g.modal = 'help'; this.current = 'help'; this.renderModal(); return;
      case 'save-quit': g.quitToTitle(); return;
      case 'leave': g.save(); return; // the link itself navigates back to the collection
      case 'new-game': this.confirm('Abandon this character and start a new game? All progress, items and your stash will be erased.', () => { g.closeModal(true); g.store.clear(); g.profile = null; g.transition(() => g.showTitle()); }, 'Erase everything'); return;
      default: break;
    }
    this.dirty = true;
    this.renderModal();
  }

  onSlotClick(slot, e) {
    const g = this.game;
    const src = slot.dataset.src, i = Number(slot.dataset.i);
    if (src === 'reward') return;
    g.audio.play('click');
    const item = this.itemAt({ src, i });
    if (this.current === 'chest') {
      if (!item) return;
      this.msg = (src === 'inv' ? g.storeItem(i) : g.takeItem(i)) || '';
      this.hideTooltip();
      this.renderModal();
      return;
    }
    if (e.shiftKey && item) { this.quickAction(src, i); return; }
    this.selected = item ? { src, i } : null;
    this.msg = '';
    this.renderModal();
  }

  onSlotQuick(e) {
    const slot = e.target.closest('.slot');
    if (!slot) return;
    this.quickAction(slot.dataset.src, Number(slot.dataset.i));
  }

  quickAction(src, i) {
    const g = this.game;
    const item = this.itemAt({ src, i });
    if (!item) return;
    if (this.current === 'inventory') {
      if (src === 'inv') g.equip(i);
      else if (src === 'eq') this.msg = g.unequip(SLOTS[i]) || '';
    } else if (this.current === 'merchant') {
      if (src === 'shop') this.msg = g.buyItem(i) || '';
      else if (src === 'inv') { if (RARITY_INDEX[item.rarity] >= 3) { this.selected = { src, i }; this.renderModal(); return; } this.msg = g.sellItem(i) || ''; }
      else if (src === 'bb') this.msg = g.buyBack(i) || '';
    } else if (this.current === 'chest') {
      this.msg = (src === 'inv' ? g.storeItem(i) : g.takeItem(i)) || '';
    }
    this.selected = null;
    this.hideTooltip();
    this.renderModal();
  }

  /** Touch: taps select or move without a lingering tooltip; a long press shows the tooltip. */
  bindTouchSlots(root) {
    this.touchDown = false;
    this.touchT = -1e9;
    const cancel = () => { clearTimeout(this.pressTimer); this.pressTimer = 0; };
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.touchDown = true;
      this.touchT = performance.now();
      this.longPressed = false;
      this.hideTooltip();
      cancel();
      const slot = e.target.closest('.slot');
      if (!slot) return;
      const x = e.clientX, y = e.clientY;
      this.pressFrom = [x, y];
      this.pressTimer = setTimeout(() => {
        this.pressTimer = 0;
        this.longPressed = this.showSlotTooltip(slot);
        if (this.longPressed) this.positionTooltip(x, y - 30);
      }, 450);
    });
    root.addEventListener('pointermove', (e) => {
      if (this.pressTimer && this.pressFrom && Math.hypot(e.clientX - this.pressFrom[0], e.clientY - this.pressFrom[1]) > 12) cancel();
    });
    const up = () => { this.touchDown = false; this.touchT = performance.now(); cancel(); };
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
  }

  onSlotHover(e) {
    const slot = e.target.closest && e.target.closest('.slot');
    if (!slot) return;
    // emulated mouseover / focus from a touch tap: the detail box shows the item instead
    if (this.touchDown || performance.now() - this.touchT < 1000) return;
    if (this.showSlotTooltip(slot) && e.type === 'focusin') {
      const r = slot.getBoundingClientRect();
      this.positionTooltip(r.right, r.top);
    }
  }

  /** Fill and show the tooltip for a slot; false when the slot is empty. */
  showSlotTooltip(slot) {
    const src = slot.dataset.src, i = Number(slot.dataset.i);
    const item = src === 'reward' ? null : this.itemAt({ src, i });
    if (!item) { this.hideTooltip(); return false; }
    const g = this.game;
    const eq = src === 'eq' ? item : g.profile.equipment[item.slot];
    let hint = '';
    if (this.touchDown) hint = this.current === 'chest' ? 'Tap: move the item' : 'Tap: select, then use the buttons below';
    else if (this.current === 'inventory') hint = src === 'eq' ? 'Right-click: unequip' : 'Right-click / double-click: equip';
    else if (this.current === 'merchant') hint = src === 'shop' || src === 'bb' ? 'Right-click: buy' : 'Right-click: sell';
    else if (this.current === 'chest') hint = src === 'inv' ? 'Click: move to chest' : 'Click: take into pack';
    this.tooltip.innerHTML = tooltipHtml(item, { equipped: eq, context: src === 'shop' || src === 'bb' ? 'buy' : 'sell', hint });
    this.tooltip.classList.remove('hidden');
    return true;
  }

  positionTooltip(x, y) {
    if (this.tooltip.classList.contains('hidden')) return;
    const st = this.stage.getBoundingClientRect();
    const tw = this.tooltip.offsetWidth, th = this.tooltip.offsetHeight;
    let left = x - st.left + 16, top = y - st.top + 12;
    if (left + tw > st.width - 6) left = x - st.left - tw - 12;
    if (top + th > st.height - 6) top = st.height - th - 6;
    this.tooltip.style.left = `${Math.max(6, left)}px`;
    this.tooltip.style.top = `${Math.max(6, top)}px`;
  }

  hideTooltip() { this.tooltip.classList.add('hidden'); }

  onSettingInput(e) {
    const el = e.target;
    const k = el.dataset && el.dataset.setting;
    if (!k) return;
    const g = this.game;
    g.settings[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : Number(el.value);
    g.saveSettings();
    if (e.type === 'change' && el.type !== 'range') g.audio.play('click');
  }
}
