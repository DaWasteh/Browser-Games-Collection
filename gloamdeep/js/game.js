// Game orchestration: state machine (title / play / dead), area transitions, per-frame update,
// rewards, quests, merchant and storage actions, saving. Rendering lives in render/, UI in ui/.

import { TILE, INVENTORY_SLOTS, STORAGE_SLOTS, MAX_POTIONS, MERCHANT_STOCK, xpForLevel, rarityColor, RARITY_INDEX, BOSS_INTERVAL } from './config.js';
import { RNG, runtimeRng, textToSeed, randomSeed, seedToText, mixSeed } from './core/rng.js';
import { damp, clamp, TAU } from './core/math.js';
import { Particles, P } from './fx/particles.js';
import { Area } from './world/area.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Loot } from './entities/loot.js';
import { Prop } from './entities/props.js';
import { Bolt, Flash, Floaters } from './entities/effects.js';
import { Combat } from './systems/combat.js';
import { computeStats } from './systems/stats.js';
import { defaultProfile } from './systems/save.js';
import { generateItem, buyPrice, sellPrice, potionPrice } from './gen/items.js';
import { questOffers, trackQuest } from './gen/quests.js';
import { isBossDepth } from './gen/dungeon.js';
import { themeForDepth } from './data/themes.js';

export class Game {
  constructor({ renderer, input, audio, store }) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.store = store;
    this.ui = null;
    this.settings = store.loadSettings();
    this.audio.volume = this.settings.volume;
    this.audio.musicVolume = this.settings.music;
    this.audio.muted = this.settings.muted;

    this.state = 'title';
    this.modal = null;
    this.mapOpen = false;
    this.debugOpen = false;
    this.profile = null;
    this.stats = null;
    this.player = null;
    this.area = null;
    this.particles = new Particles();
    this.floaters = new Floaters();
    this.combat = new Combat(this);
    this.time = 0;
    this.cam = { x: 0, y: 0 };
    this.shakeAmt = 0; this.shakeT = 0; this.shakeDur = 1; this.shakeX = 0; this.shakeY = 0;
    this.hitstop = 0;
    this.timeScale = 1;
    this.lightningFlash = 0;
    this.timers = [];
    this.trans = null;
    this.mouseScreen = { x: 0, y: 0 };
    this.mouseWorld = { x: 0, y: 0 };
    this.mouseInside = false;
    this.pointerOverUi = false;
    this.interactTarget = null;
    this.autosaveT = 20;
    this.exploreT = 0;
    this.deathT = 0;
    this.titleLight = null;
    this.buyback = [];
    this.fps = 60;
    this.particles.decalSink = (x, y, c, w, h, a) => { if (this.area) this.area.tiles.decal(x, y, c, w, h, a); };
  }

  get effects() { return this.area.effects; }

  // ================================================================== lifecycle

  showTitle() {
    this.state = 'title';
    this.modal = null;
    this.timeScale = 1;
    this.mapOpen = false;
    this.profile = null;
    this.player = null;
    const depth = [3, 7, 12, 17][Math.floor(Math.random() * 4)];
    this.area = Area.dungeon(0xc0ffee, depth);
    this.area.explored.fill(1);
    this.area.exploreVersion++;
    for (const e of this.area.enemies) e.aggroed = false;
    const f = this.area.floor;
    const rooms = f.rooms.slice().sort((a, b) => a.cx - b.cx);
    this.titlePath = rooms.map((r) => ({ x: r.cx * TILE + 8, y: r.cy * TILE + 8 }));
    this.titleT = 0;
    this.cam.x = this.titlePath[0].x - this.renderer.vw / 2;
    this.cam.y = this.titlePath[0].y - this.renderer.vh / 2;
    this.particles.clear();
    this.audio.setMode('dungeon');
    if (this.ui) this.ui.showTitle();
  }

  newGame(seedText) {
    const seed = seedText && seedText.trim() ? textToSeed(seedText) : randomSeed();
    this.store.clear();
    this.profile = defaultProfile(seed);
    this.startSession();
    this.save();
  }

  continueGame() {
    const r = this.store.load();
    if (!r || r.error || !r.profile) {
      this.ui.alert(r && r.error ? `Your save could not be loaded (${r.error}). Start a new game instead.` : 'No saved game found.');
      return false;
    }
    if (r.warnings && r.warnings.length) console.warn('Save repaired:', r.warnings);
    this.profile = r.profile;
    this.startSession();
    return true;
  }

  startSession() {
    const p = this.profile;
    this.player = new Player(0, 0);
    this.buyback = [];
    this.refreshStats();
    this.player.hp = this.stats.maxHp;
    this.player.mp = this.stats.maxMp;
    this.state = 'play';
    this.modal = null;
    this.timeScale = 1;
    this.mapOpen = false;
    this.ui.showGame();
    if (p.location && p.location.type === 'dungeon') this.loadDungeon(p.location.depth, true);
    else this.loadTown(false, true);
    if (!p.tutorial.talked) this.later(1.2, () => this.toast('Welcome to Wickhollow. Speak with Warden Isolde (the ! marker) to begin.', 'info'));
  }

  quitToTitle() {
    if (this.profile && this.state !== 'title') this.save();
    this.closeModal(true);
    this.transition(() => this.showTitle(), null);
  }

  // ================================================================== areas

  transition(fn, banner) {
    if (this.trans) return;
    this.trans = { t: 0, dur: 0.32, phase: 'out', fn, banner };
    this.audio.play('stairs', 0.6);
  }

  loadTown(fromDungeon, instant = false) {
    const go = () => {
      this.clearWorld();
      this.area = Area.town();
      const sp = fromDungeon ? this.area.gateSpawn : this.area.spawn;
      this.player.place(sp.x, sp.y);
      this.player.dead = false;
      this.profile.location = { type: 'town' };
      if (fromDungeon) this.profile.runs++;
      this.ensureMerchantStock();
      this.snapCamera();
      this.audio.setMode('town');
      this.ui.onAreaChanged();
      this.save();
    };
    if (instant) { go(); this.ui.banner('Wickhollow', 'The last lit village above the Gloamdeep'); }
    else this.transition(go, ['Wickhollow', 'The last lit village above the Gloamdeep']);
  }

  loadDungeon(depth, instant = false) {
    const go = () => {
      this.clearWorld();
      this.area = Area.dungeon(this.profile.seed, depth);
      this.player.place(this.area.spawn.x, this.area.spawn.y);
      this.player.dead = false;
      const p = this.profile;
      p.location = { type: 'dungeon', depth };
      p.maxDepth = Math.max(p.maxDepth, depth);
      this.questEvent({ type: 'depth', depth });
      this.snapCamera();
      this.area.explore(this.player.x, this.player.y - 4, 150 * this.stats.light);
      this.audio.setMode('dungeon');
      this.ui.onAreaChanged();
      this.save();
      if (isBossDepth(depth)) this.later(0.8, () => this.toast('A guardian stirs on this floor. The way down is sealed.', 'boss'));
    };
    const theme = themeForDepth(depth);
    const banner = [`Floor ${depth}`, this.areaSubtitle(depth, theme)];
    if (instant) { go(); this.ui.banner(...banner); } else this.transition(go, banner);
  }

  areaSubtitle(depth, theme) {
    const cycle = Math.floor((depth - 1) / 20);
    return `${theme.name}${cycle ? ` · Echo ${cycle + 1}` : ''}${isBossDepth(depth) ? ' · Guardian Floor' : ''}`;
  }

  clearWorld() {
    this.particles.clear();
    this.floaters.list = [];
    this.timers = [];
    this.interactTarget = null;
    this.hitstop = 0;
    this.lightningFlash = 0;
    if (this.ui) this.ui.hideBoss();
  }

  descend() {
    const next = this.area.depth + 1;
    this.loadDungeon(next);
  }

  returnToTown() {
    this.loadTown(true);
  }

  enterDungeonAt(depth) {
    this.closeModal(true);
    this.loadDungeon(Math.max(1, Math.min(depth, Math.max(1, this.profile.maxDepth))));
  }

  /** Floors the Gloam Stair can take the player to. */
  portalFloors() {
    const max = Math.max(1, this.profile.maxDepth);
    const set = new Set([1]);
    for (let d = BOSS_INTERVAL + 1; d <= max; d += BOSS_INTERVAL) set.add(d);
    set.add(max);
    return [...set].sort((a, b) => a - b);
  }

  // ================================================================== stats / progression

  refreshStats() {
    const b = this.player ? this.player.buffs : {};
    const buffs = { might: b.might > 0, haste: b.haste > 0, warding: b.warding > 0, fortune: b.fortune > 0 };
    this.stats = computeStats(this.profile, buffs);
    if (this.player) {
      this.player.refreshLook(this.profile);
      this.player._maxHp = this.stats.maxHp;
      this.player.hp = Math.min(this.player.hp, this.stats.maxHp);
      this.player.mp = Math.min(this.player.mp, this.stats.maxMp);
    }
    if (this.ui) this.ui.dirty = true;
  }

  gainXp(n) {
    const p = this.profile;
    p.xp += n;
    let leveled = false;
    while (p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level++;
      leveled = true;
    }
    if (leveled) {
      this.refreshStats();
      this.player.hp = this.stats.maxHp;
      this.player.mp = this.stats.maxMp;
      this.audio.play('levelUp');
      this.floaters.add(this.player.x, this.player.y - 36, 'LEVEL UP!', '#ffe04a', 2, -26);
      this.toast(`Level ${p.level}! Strength, Intellect, Vitality and Dexterity increase.`, 'level');
      for (let i = 0; i < 50; i++) {
        const a = (i / 50) * TAU;
        this.particles.spawn(P.MAGIC, this.player.x + Math.cos(a) * 6, this.player.y + Math.sin(a) * 4, 4, Math.cos(a) * 50, Math.sin(a) * 35, 50, 1, 2, i & 1 ? '#ffe04a' : '#fff4c0', 1.5, -20);
      }
      this.effects.push(new Flash(this.player.x, this.player.y - 10, 26, '#ffe04a', 0.5));
      this.save();
    }
    this.ui.dirty = true;
  }

  addGold(n) {
    this.profile.gold += n;
    this.profile.stats.goldEarned += n;
    this.ui.dirty = true;
  }

  // ================================================================== loot

  dropGold(x, y, amount, piles = 1) {
    piles = Math.max(1, Math.min(piles, amount));
    const per = Math.floor(amount / piles);
    for (let i = 0; i < piles; i++) {
      const a = i === piles - 1 ? amount - per * (piles - 1) : per;
      if (a > 0) this.area.loot.push(new Loot('gold', x, y, { amount: a, spread: piles > 3 ? 90 : 50 }));
    }
  }

  dropItem(x, y, item) {
    const l = new Loot('item', x, y, { item, spread: 45 });
    this.area.loot.push(l);
    const r = RARITY_INDEX[item.rarity];
    if (r >= 4) { this.audio.play('legendaryDrop'); this.toast(`A legendary item! ${item.name}`, 'legendary'); }
    else if (r >= 2) this.audio.play('rareDrop', 0.7);
    this.profile.stats.itemsFound++;
  }

  dropPotion(x, y) { this.area.loot.push(new Loot('potion', x, y)); }

  dropRelic(x, y, quest) { this.area.loot.push(new Loot('relic', x, y, { color: quest.relicColor, name: quest.target })); }

  countGroundPotions() { return this.area.loot.filter((l) => l.kind === 'potion').length; }

  collectRelic(loot) {
    this.questEvent({ type: 'collect' });
    this.floaters.add(loot.x, loot.y - 12, `+1 ${loot.relicName.toUpperCase()}`, loot.relicColor, 1, -26);
    this.audio.play('pickup');
  }

  firstFree(arr) { return arr.indexOf(null); }

  addToInventory(item) {
    const i = this.firstFree(this.profile.inventory);
    if (i < 0) return false;
    this.profile.inventory[i] = item;
    this.ui.dirty = true;
    return true;
  }

  // ================================================================== quests

  questEvent(ev) {
    const q = this.profile.quest;
    if (!q || q.done) return;
    if (trackQuest(q, ev)) {
      this.ui.dirty = true;
      if (q.done) {
        this.audio.play('quest');
        this.toast(`Quest complete: ${q.title}. Return to Warden Isolde.`, 'quest');
        this.save();
      } else if (q.type !== 'depth') {
        this.ui.pulseQuest();
      }
    }
  }

  currentOffers() {
    const p = this.profile;
    return questOffers(p.seed, p.questsCompleted, p.level, p.maxDepth);
  }

  acceptQuest(i) {
    const offers = this.currentOffers();
    const q = offers[i];
    if (!q || this.profile.quest) return;
    this.profile.quest = q;
    // an already-satisfied depth quest should not complete instantly from old progress
    this.audio.play('quest', 0.6);
    this.toast(`Quest accepted: ${q.title}`, 'quest');
    this.save();
    this.ui.dirty = true;
  }

  abandonQuest() {
    this.profile.quest = null;
    this.save();
    this.ui.dirty = true;
  }

  turnInQuest() {
    const p = this.profile;
    const q = p.quest;
    if (!q || !q.done) return null;
    const rw = q.reward;
    const result = { gold: rw.gold, xp: rw.xp, potions: 0, item: null };
    this.addGold(rw.gold);
    if (rw.potions) { const n = Math.min(rw.potions, MAX_POTIONS - p.potions); p.potions += n; result.potions = n; }
    if (rw.item) {
      const it = generateItem(runtimeRng, Math.max(p.level, p.maxDepth) + 1, { rarity: rw.item, magicFind: this.stats.magicFind });
      if (!this.addToInventory(it)) {
        const s = this.firstFree(p.storage);
        if (s >= 0) { p.storage[s] = it; result.stored = true; }
      }
      result.item = it;
    }
    p.quest = null;
    p.questsCompleted++;
    this.gainXp(rw.xp);
    this.audio.play('quest');
    this.save();
    this.ui.dirty = true;
    return result;
  }

  // ================================================================== merchant & storage

  ensureMerchantStock() {
    const p = this.profile;
    const key = `${p.runs}|${p.level}`;
    if (p.merchant.key === key && p.merchant.stock.length) return;
    const rng = new RNG(mixSeed(p.seed, p.runs, p.level, 0x5ab));
    const ilvl = Math.max(1, Math.round(p.level * 0.8 + p.maxDepth * 0.4));
    const stock = [];
    const slots = ['weapon', 'weapon', 'focus', 'helm', 'armor', 'boots', 'ring', 'amulet'];
    for (let i = 0; i < MERCHANT_STOCK; i++) {
      stock.push(generateItem(rng, ilvl, { slot: i < slots.length ? slots[i] : undefined, magicFind: 80, minRarity: i < 3 ? 1 : 0 }));
    }
    p.merchant.stock = stock;
    p.merchant.potions = 5 + Math.floor(p.level / 4);
    p.merchant.key = key;
  }

  buyItem(i) {
    const p = this.profile;
    const it = p.merchant.stock[i];
    if (!it) return 'Item not found.';
    const price = buyPrice(it);
    if (p.gold < price) { this.audio.play('deny'); return 'Not enough gold.'; }
    if (this.firstFree(p.inventory) < 0) { this.audio.play('deny'); return 'Your pack is full.'; }
    p.gold -= price;
    p.merchant.stock.splice(i, 1);
    this.addToInventory(it);
    this.audio.play('buy');
    this.save();
    return null;
  }

  buyPotion() {
    const p = this.profile;
    const price = potionPrice(p.level);
    if (p.merchant.potions <= 0) { this.audio.play('deny'); return 'Sold out until the next expedition.'; }
    if (p.potions >= MAX_POTIONS) { this.audio.play('deny'); return `You can carry at most ${MAX_POTIONS} potions.`; }
    if (p.gold < price) { this.audio.play('deny'); return 'Not enough gold.'; }
    p.gold -= price;
    p.potions++;
    p.merchant.potions--;
    this.audio.play('buy');
    this.save();
    this.ui.dirty = true;
    return null;
  }

  sellItem(i) {
    const p = this.profile;
    const it = p.inventory[i];
    if (!it) return 'Nothing to sell.';
    const price = sellPrice(it);
    p.inventory[i] = null;
    p.gold += price;
    this.buyback.unshift({ item: it, price });
    if (this.buyback.length > 6) this.buyback.pop();
    this.audio.play('sell');
    this.save();
    this.ui.dirty = true;
    return null;
  }

  buyBack(i) {
    const p = this.profile;
    const b = this.buyback[i];
    if (!b) return 'Nothing to buy back.';
    if (p.gold < b.price) { this.audio.play('deny'); return 'Not enough gold.'; }
    if (this.firstFree(p.inventory) < 0) { this.audio.play('deny'); return 'Your pack is full.'; }
    p.gold -= b.price;
    this.buyback.splice(i, 1);
    this.addToInventory(b.item);
    this.audio.play('buy');
    this.save();
    return null;
  }

  sellAllCommon() {
    const p = this.profile;
    let total = 0, n = 0;
    p.inventory.forEach((it, i) => {
      if (it && it.rarity === 'common') { total += sellPrice(it); p.inventory[i] = null; n++; }
    });
    if (!n) return 'You carry no common items.';
    p.gold += total;
    this.audio.play('sell');
    this.save();
    this.ui.dirty = true;
    return `Sold ${n} common item${n > 1 ? 's' : ''} for ${total} gold.`;
  }

  storeItem(i) {
    const p = this.profile;
    const it = p.inventory[i];
    if (!it) return null;
    const s = this.firstFree(p.storage);
    if (s < 0) { this.audio.play('deny'); return 'Your storage chest is full.'; }
    p.storage[s] = it;
    p.inventory[i] = null;
    this.audio.play('click');
    this.save();
    return null;
  }

  takeItem(i) {
    const p = this.profile;
    const it = p.storage[i];
    if (!it) return null;
    const s = this.firstFree(p.inventory);
    if (s < 0) { this.audio.play('deny'); return 'Your pack is full.'; }
    p.inventory[s] = it;
    p.storage[i] = null;
    this.audio.play('click');
    this.save();
    return null;
  }

  depositAll() {
    const p = this.profile;
    let moved = 0;
    for (let i = 0; i < p.inventory.length; i++) {
      if (!p.inventory[i]) continue;
      const s = this.firstFree(p.storage);
      if (s < 0) break;
      p.storage[s] = p.inventory[i]; p.inventory[i] = null; moved++;
    }
    this.save();
    return moved ? null : 'Nothing to deposit.';
  }

  sortStorage() {
    const p = this.profile;
    const items = p.storage.filter(Boolean).sort((a, b) => (RARITY_INDEX[b.rarity] - RARITY_INDEX[a.rarity]) || a.slot.localeCompare(b.slot) || b.ilvl - a.ilvl);
    p.storage = items.concat(new Array(STORAGE_SLOTS - items.length).fill(null));
    this.save();
  }

  // ================================================================== equipment

  equip(i) {
    const p = this.profile;
    const it = p.inventory[i];
    if (!it) return;
    const prev = p.equipment[it.slot];
    p.equipment[it.slot] = it;
    p.inventory[i] = prev || null;
    this.refreshStats();
    this.audio.play('equip');
    this.save();
  }

  unequip(slot) {
    const p = this.profile;
    const it = p.equipment[slot];
    if (!it) return null;
    const s = this.firstFree(p.inventory);
    if (s < 0) { this.audio.play('deny'); return 'Your pack is full.'; }
    p.inventory[s] = it;
    p.equipment[slot] = null;
    this.refreshStats();
    this.audio.play('equip');
    this.save();
    return null;
  }

  dropFromInventory(i) {
    const p = this.profile;
    const it = p.inventory[i];
    if (!it) return;
    p.inventory[i] = null;
    const l = new Loot('item', this.player.x, this.player.y, { item: it, spread: 30 });
    l.t = -1.5;
    this.area.loot.push(l);
    this.audio.play('close');
    this.save();
  }

  // ================================================================== modals

  openModal(name) {
    if (this.state !== 'play' && name !== 'help' && name !== 'settings') return;
    if (name === 'merchant') this.ensureMerchantStock();
    this.modal = name;
    this.input.reset();
    this.audio.play('open');
    this.ui.openModal(name);
  }

  closeModal(silent = false) {
    if (!this.modal) return;
    this.modal = null;
    this.input.reset();
    if (!silent) this.audio.play('close');
    this.ui.closeModal();
  }

  talkTo(id) {
    if (id === 'warden') {
      this.profile.tutorial.talked = true;
      this.openModal('quest');
    }
  }

  openDialog(d) {
    this.dialog = d;
    this.openModal('dialog');
  }

  toast(text, kind = 'info') { if (this.ui) this.ui.toast(text, kind); }

  later(delay, fn) { this.timers.push({ t: delay, fn }); }

  shake(amount, dur) {
    if (!this.settings.shake) return;
    if (amount >= this.shakeAmt * (this.shakeT / this.shakeDur || 0)) { this.shakeAmt = amount; this.shakeDur = dur; this.shakeT = dur; }
  }

  // ================================================================== combat helpers

  spawnBolt(points, color = '#cfe0ff', width = 1) {
    this.effects.push(new Bolt(points, color, 0.22, width));
  }

  chainLightning(x, y, aim, dmg, jumps, targets) {
    const area = this.area;
    const range = 210;
    const m = this.mouseWorld;
    const cands = area.enemies.filter((e) => !e.dead && Math.hypot(e.x - x, e.y - y) < range && area.map.lineOfSight(x, y, e.x, e.y - 6));
    const score = (e) => {
      let da = Math.abs(Math.atan2(e.y - y, e.x - x) - aim);
      if (da > Math.PI) da = TAU - da;
      return Math.hypot(e.x - m.x, e.y - m.y) * 0.6 + da * 120;
    };
    cands.sort((a, b) => score(a) - score(b));
    const firsts = cands.filter((e) => {
      let da = Math.abs(Math.atan2(e.y - y, e.x - x) - aim);
      if (da > Math.PI) da = TAU - da;
      return da < 0.9 || Math.hypot(e.x - m.x, e.y - m.y) < 40;
    }).slice(0, targets);
    this.lightningFlash = 0.1;
    if (!firsts.length) {
      const d = area.map.castRay(x, y, aim, range);
      const ex = x + Math.cos(aim) * d, ey = y + Math.sin(aim) * d;
      this.spawnBolt([[x, y], [ex, ey]], '#cfe0ff');
      this.particles.burst(P.SPARK, ex, ey, 10, { speed: 120, life: 0.3, colors: ['#ffffff', '#cfe0ff'] });
      return;
    }
    const hit = new Set();
    for (const first of firsts) {
      let cur = first;
      let d = dmg;
      const pts = [[x, y], [cur.x, cur.y - cur.height * 0.4]];
      hit.add(cur);
      this.combat.hitEnemy(cur, d, { element: 'storm', source: 'spell', stagger: true, angle: aim, knock: 30 });
      this.effects.push(new Flash(cur.x, cur.y - 8, 8, '#cfe0ff', 0.15));
      for (let j = 0; j < jumps; j++) {
        let best = null, bd = 85;
        for (const e of area.enemies) {
          if (e.dead || hit.has(e)) continue;
          const dd = Math.hypot(e.x - cur.x, e.y - cur.y);
          if (dd < bd && area.map.lineOfSight(cur.x, cur.y - 6, e.x, e.y - 6)) { bd = dd; best = e; }
        }
        if (!best) break;
        hit.add(best);
        d *= 0.85;
        pts.push([best.x, best.y - best.height * 0.4]);
        this.combat.hitEnemy(best, d, { element: 'storm', source: 'spell', stagger: true, quiet: true, knock: 20, angle: Math.atan2(best.y - cur.y, best.x - cur.x) });
        this.effects.push(new Flash(best.x, best.y - 8, 7, '#cfe0ff', 0.15));
        cur = best;
      }
      this.spawnBolt(pts, '#dfe8ff', 1);
    }
  }

  spawnMinion(arch, x, y, skin) {
    const map = this.area.map;
    if (!map.walkable(Math.floor(x / TILE), Math.floor(y / TILE))) return null;
    if (this.area.enemies.length > 140) return null;
    const e = new Enemy({ arch, x, y, elite: null, pack: 9999 }, this.area.depth, skin);
    e.aggroed = true;
    e.xp = Math.round(e.xp * 0.5);
    this.area.enemies.push(e);
    this.particles.burst(P.MAGIC, x, y, 20, { speed: 50, z: 8, life: 0.6, size: 2, colors: [e.accent, '#ffffff'] });
    this.particles.burst(P.DEBRIS, x, y, 8, { speed: 40, z: 2, vz: 60, life: 1, colors: ['#5a5460', '#3a3440'] });
    return e;
  }

  onBossAwake(boss) {
    this.ui.showBoss(boss);
    this.audio.setMode('boss');
    this.toast(`${boss.name} — ${boss.title}`, 'boss');
  }

  onBossDefeated(boss) {
    this.ui.hideBoss();
    this.profile.stats.bosses++;
    this.audio.play('bossDie');
    this.shake(8, 1);
    this.hitstop = 0.18;
    for (const p of this.area.props) if (p.type === 'stairsDown') p.sealed = false;
    this.toast(`${boss.name} has fallen! The seal on the stair is broken.`, 'boss');
    this.dropGold(boss.x, boss.y, Math.round(runtimeRng.int(boss.gold[0], boss.gold[1]) * (1 + this.stats.goldFind / 100)), 14);
    this.effects.push(new Flash(boss.x, boss.y - 20, 60, boss.accent, 1.2));
    this.particles.burst(P.EMBER, boss.x, boss.y, 90, { speed: 140, z: 20, life: 2, colors: [boss.accent, '#ffffff'], grav: 20 });
    // guardian's hoard
    const chest = { type: 'chest', tier: 'gilded', x: boss.x, y: boss.y + 20 };
    this.later(1.4, () => {
      if (!this.area.map.walkable(Math.floor(chest.x / TILE), Math.floor(chest.y / TILE))) chest.y = boss.y;
      this.area.addProp(new Prop(chest));
      this.particles.burst(P.GLINT, chest.x, chest.y, 30, { speed: 70, z: 8, life: 1, colors: ['#ffd84a'] });
    });
    this.later(3, () => { if (this.area && this.area.type === 'dungeon') this.audio.setMode('dungeon'); });
    this.save();
  }

  onPlayerDeath() {
    if (this.player.dead) return;
    this.player.dead = true;
    this.state = 'dead';
    this.deathT = 0;
    const p = this.profile;
    p.stats.deaths++;
    const lost = Math.floor(p.gold * 0.1);
    p.gold -= lost;
    this.deathInfo = { depth: this.area.depth, lost, where: this.area.name };
    this.audio.play('death');
    this.audio.setMode(null);
    this.timeScale = 0.35;
    this.particles.burst(P.BLOOD, this.player.x, this.player.y, 40, { speed: 90, z: 10, vz: 60, vzRand: 80, life: 1.4, colors: ['#8a1a1a', '#b02a2a', '#5a0a0a'], size: 2 });
    this.ui.hideBoss();
    // the dungeon floor is lost, progression is kept: return point is the town
    p.location = { type: 'town' };
    this.save();
    this.later(1.1, () => this.ui.showDeath(this.deathInfo));
  }

  respawn() {
    this.state = 'play';
    this.timeScale = 1;
    this.ui.hideDeath();
    this.player.dead = false;
    this.refreshStats();
    this.player.hp = this.stats.maxHp;
    this.player.mp = this.stats.maxMp;
    this.player.buffs = {};
    this.refreshStats();
    this.loadTown(false);
  }

  // ================================================================== saving

  save() {
    if (!this.profile) return;
    const ok = this.store.save(this.profile);
    if (!ok && !this.saveWarned) { this.saveWarned = true; this.toast('Warning: the game could not be saved (storage unavailable).', 'warn'); }
    this.autosaveT = 20;
  }

  saveSettings() {
    this.store.saveSettings(this.settings);
    this.audio.volume = this.settings.volume;
    this.audio.musicVolume = this.settings.music;
    this.audio.setMuted(this.settings.muted);
    this.audio.applyVolumes();
  }

  // ================================================================== frame

  setView(vw, vh) {
    this.vw = vw; this.vh = vh;
  }

  snapCamera() {
    this.updateCamera(1, true);
  }

  updateCamera(dt, snap = false) {
    const vw = this.renderer.vw, vh = this.renderer.vh;
    const a = this.area;
    let tx, ty;
    if (this.state === 'title') return;
    const pl = this.player;
    const mx = this.mouseInside ? clamp((this.mouseScreen.x - vw / 2) * 0.12, -26, 26) : 0;
    const my = this.mouseInside ? clamp((this.mouseScreen.y - vh / 2) * 0.12, -18, 18) : 0;
    tx = pl.x - vw / 2 + (this.modal ? 0 : mx);
    ty = pl.y - 10 - vh / 2 + (this.modal ? 0 : my);
    const mw = a.W * TILE, mh = a.H * TILE;
    tx = mw <= vw ? (mw - vw) / 2 : clamp(tx, 0, mw - vw);
    ty = mh <= vh ? (mh - vh) / 2 : clamp(ty, 0, mh - vh);
    if (snap) { this.cam.x = tx; this.cam.y = ty; return; }
    this.cam.x = damp(this.cam.x, tx, 9, dt);
    this.cam.y = damp(this.cam.y, ty, 9, dt);
  }

  updateMouse(rect) {
    const m = this.input.mouse;
    const vw = this.renderer.vw, vh = this.renderer.vh;
    this.mouseInside = m.cx >= rect.left && m.cx <= rect.right && m.cy >= rect.top && m.cy <= rect.bottom;
    this.mouseScreen.x = ((m.cx - rect.left) / rect.width) * vw;
    this.mouseScreen.y = ((m.cy - rect.top) / rect.height) * vh;
    this.mouseWorld.x = this.cam.x + this.mouseScreen.x;
    this.mouseWorld.y = this.cam.y + this.mouseScreen.y;
  }

  handleKeys() {
    const inp = this.input;
    if (this.state === 'title') {
      if (inp.wasPressed('Escape') && this.ui.current) this.ui.back();
      return;
    }
    if (inp.wasPressed('F3')) this.debugOpen = !this.debugOpen;
    if (inp.wasPressed('KeyN')) { this.settings.muted = !this.settings.muted; this.saveSettings(); this.toast(this.settings.muted ? 'Sound muted' : 'Sound on', 'info'); }
    if (this.state === 'dead') return;
    if (inp.wasPressed('Escape')) {
      if (this.mapOpen) this.mapOpen = false;
      else if (this.modal) this.ui.back();
      else this.openModal('pause');
      return;
    }
    if (inp.wasPressed('KeyI')) {
      if (this.modal === 'inventory') this.closeModal();
      else if (!this.modal) this.openModal('inventory');
    }
    if (inp.wasPressed('KeyM') && !this.modal) this.mapOpen = !this.mapOpen;
    if ((inp.wasPressed('F1') || inp.wasPressed('KeyH')) && !this.modal) this.openModal('help');
    if (inp.wasPressed('KeyE') && !this.modal && this.interactTarget) {
      const t = this.interactTarget;
      if (t.obj instanceof Loot) t.obj.pickupItem(this);
      else if (t.act) t.act();
    }
  }

  findInteraction() {
    const pl = this.player;
    if (!pl || pl.dead) { this.interactTarget = null; return; }
    let best = null, bd = Infinity;
    for (const l of this.area.loot) {
      if (l.kind !== 'item' || l.z > 2) continue;
      const d = Math.hypot(l.x - pl.x, l.y - pl.y);
      if (d < 22 && d < bd) { bd = d; best = { obj: l, label: `Pick up ${l.item.name}`, color: rarityColor(l.item.rarity) }; }
    }
    if (!best) {
      for (const n of this.area.npcs) {
        const d = Math.hypot(n.x - pl.x, n.y - pl.y);
        if (d < 34 && d < bd) { const it = n.interaction(this); if (it) { bd = d; best = { obj: n, ...it }; } }
      }
      for (const p of this.area.props) {
        if (p.broken) continue;
        const px = p.x, py = p.type === 'gloamGate' ? p.y + 4 : p.y;
        const d = Math.hypot(px - pl.x, py - pl.y);
        const r = p.type === 'gloamGate' ? 34 : p.type === 'stairsDown' || p.type === 'stairsUp' ? 22 : 26;
        if (d < r && d < bd) { const it = p.interaction(this); if (it) { bd = d; best = { obj: p, ...it }; } }
      }
    }
    this.interactTarget = best;
  }

  update(rawDt, rect) {
    const dt = Math.min(rawDt, 1 / 20);
    this.time += dt;
    this.fps = this.fps * 0.95 + (1 / Math.max(rawDt, 1e-3)) * 0.05;
    this.updateMouse(rect);
    this.audio.update(dt);

    if (this.trans) {
      const tr = this.trans;
      tr.t += dt;
      if (tr.phase === 'out') {
        this.ui.setFade(Math.min(1, tr.t / tr.dur));
        if (tr.t >= tr.dur) {
          tr.fn();
          tr.phase = 'in'; tr.t = 0;
          if (tr.banner) this.ui.banner(tr.banner[0], tr.banner[1]);
        }
      } else {
        this.ui.setFade(Math.max(0, 1 - tr.t / tr.dur));
        if (tr.t >= tr.dur) this.trans = null;
      }
      this.input.endFrame();
      return;
    }

    this.handleKeys();

    if (this.state === 'title') {
      this.updateTitle(dt);
      this.input.endFrame();
      return;
    }

    // death slow motion keeps the world running briefly
    const paused = !!this.modal;
    if (!paused) {
      if (this.hitstop > 0) {
        this.hitstop -= dt;
      } else {
        this.updateWorld(dt * this.timeScale);
      }
    }
    this.floaters.update(dt);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT / this.shakeDur);
      this.shakeX = (Math.random() - 0.5) * 2 * this.shakeAmt * k;
      this.shakeY = (Math.random() - 0.5) * 2 * this.shakeAmt * k;
    } else { this.shakeX = 0; this.shakeY = 0; this.shakeAmt = 0; }
    this.lightningFlash = Math.max(0, this.lightningFlash - dt);
    this.updateCamera(dt);
    if (this.state === 'play' && !paused) {
      this.autosaveT -= dt;
      this.profile.stats.playTime += dt;
      if (this.autosaveT <= 0) this.save();
    }
    this.input.endFrame();
  }

  updateWorld(dt) {
    const area = this.area;
    const pl = this.player;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    if (this.area !== area) return;
    pl.update(dt, this);
    // NPC bodies block the player
    for (const n of area.npcs) {
      const dx = pl.x - n.x, dy = pl.y - n.y, rr = pl.radius + n.radius;
      const d = Math.hypot(dx, dy);
      if (d < rr && d > 0.01) { pl.x = n.x + (dx / d) * rr; pl.y = n.y + (dy / d) * rr; area.map.resolveCircle(pl, pl.radius); }
    }
    if (area.field && pl.alive) area.field.update(pl.x, pl.y);
    this.exploreT -= dt;
    if (this.exploreT <= 0 && area.type === 'dungeon') {
      this.exploreT = 0.12;
      area.explore(pl.x, pl.y - 4, 150 * this.stats.light);
    }
    for (const e of area.enemies) e.update(dt, this);
    for (const p of area.projectiles) p.update(dt, this);
    for (const t of area.traps) t.update(dt, this);
    for (const p of area.props) p.update(dt, this);
    for (const g of area.groundEffects) g.update(dt, this);
    for (const e of area.effects) e.update(dt, this);
    for (const l of area.loot) l.update(dt, this);
    for (const n of area.npcs) n.update(dt, this);
    this.particles.update(dt);
    area.cleanup();
    if (this.state === 'play') this.findInteraction();
    else this.interactTarget = null;
    // ambient dungeon motes
    if (area.type === 'dungeon' && Math.random() < dt * 6) {
      const x = this.cam.x + Math.random() * this.renderer.vw, y = this.cam.y + Math.random() * this.renderer.vh;
      this.particles.spawn(P.EMBER, x, y, 4 + Math.random() * 20, (Math.random() - 0.5) * 6, 0, 3, 3 + Math.random() * 2, 1, area.theme.id === 'forge' ? '#ff9a4a' : area.theme.id === 'fungal' ? '#7affd0' : area.theme.id === 'crystal' ? '#c8a8ff' : '#d8c8a8', 0.2, 1);
    }
    if (area.type === 'town' && Math.random() < dt * 3) {
      // fireflies
      const x = this.cam.x + Math.random() * this.renderer.vw, y = this.cam.y + Math.random() * this.renderer.vh;
      this.particles.spawn(P.GLINT, x, y, 6 + Math.random() * 10, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, 3, 1, '#d8ff8a', 0.3, 0);
    }
  }

  updateTitle(dt) {
    const path = this.titlePath;
    if (!path || path.length < 2) return;
    this.titleT += dt * 0.08;
    const n = path.length;
    const seg = Math.floor(this.titleT) % (n - 1);
    const k = this.titleT - Math.floor(this.titleT);
    const s = k * k * (3 - 2 * k);
    const a = path[seg], b = path[seg + 1];
    const x = a.x + (b.x - a.x) * s, y = a.y + (b.y - a.y) * s;
    const vw = this.renderer.vw, vh = this.renderer.vh;
    this.cam.x = damp(this.cam.x, clamp(x - vw / 2, 0, this.area.W * TILE - vw), 1.5, dt);
    this.cam.y = damp(this.cam.y, clamp(y - vh / 2, 0, this.area.H * TILE - vh), 1.5, dt);
    this.titleLight = { x: this.cam.x + vw / 2, y: this.cam.y + vh / 2, radius: 170, color: '#ffe0b0', intensity: 0.8, poly: this.area.map.lightPolygon(this.cam.x + vw / 2, this.cam.y + vh / 2, 170, 100, 12) };
    for (const p of this.area.props) p.update(dt, this);
    for (const e of this.area.enemies) e.animT += dt * 2;
    this.particles.update(dt);
    if (Math.random() < dt * 8) {
      const px = this.cam.x + Math.random() * vw, py = this.cam.y + Math.random() * vh;
      this.particles.spawn(P.EMBER, px, py, 4 + Math.random() * 20, (Math.random() - 0.5) * 6, 0, 3, 4, 1, '#ffcf8a', 0.2, 1);
    }
  }

  render() {
    this.renderer.render(this);
  }

  // ================================================================== debug hooks (used by the smoke test)

  debugInfo() {
    const a = this.area;
    return {
      state: this.state, modal: this.modal, area: a ? a.type : null, depth: a ? a.depth : 0,
      seed: this.profile ? seedToText(this.profile.seed) : null,
      enemies: a ? a.enemies.length : 0, projectiles: a ? a.projectiles.length : 0, particles: this.particles.count,
      loot: a ? a.loot.length : 0, fps: Math.round(this.fps),
      player: this.player ? { x: Math.round(this.player.x), y: Math.round(this.player.y), hp: Math.round(this.player.hp), mp: Math.round(this.player.mp), dead: this.player.dead } : null,
      level: this.profile ? this.profile.level : 0, gold: this.profile ? this.profile.gold : 0,
      quest: this.profile && this.profile.quest ? { type: this.profile.quest.type, progress: this.profile.quest.progress, required: this.profile.quest.required, done: this.profile.quest.done } : null,
    };
  }
}

export { INVENTORY_SLOTS, STORAGE_SLOTS };
