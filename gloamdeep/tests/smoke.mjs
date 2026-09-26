// End-to-end browser smoke test without dependencies.
//  - serves the project with a tiny built-in static server (random free port)
//  - launches a locally installed Chrome / Edge headless and drives it over the DevTools protocol
//  - uses real keyboard and mouse events for movement, combat and interaction
//  - walks through the full game loop, takes screenshots, and fails on any console error
//
// Run with:  node tests/smoke.mjs [path-to-chrome-or-edge]
// Screenshots are written to tests/screenshots/.

import { openBrowser, sleep, SHOTS } from './harness.mjs';

const W = 1280, H = 720;
const b = await openBrowser({ width: W, height: H, browserPath: process.argv[2] });
if (!b) { console.log('SKIP: no Chrome/Edge found for the browser smoke test'); process.exit(0); }
const { send, evaluate, key, mouse, shot, waitFor, errors } = b;
const BASE = b.base;
const BROWSER = b.browserName;

const results = [];
async function step(name, fn) {
  const before = errors.length;
  try {
    await fn();
    if (errors.length > before) throw new Error(errors.slice(before).join(' | '));
    results.push([name, true]);
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    results.push([name, false, e.message]);
    console.log(`  \u2717 ${name}\n      ${e.message.split('\n')[0]}`);
  }
}
async function cleanup(code) {
  await b.close();
  process.exit(code);
}

const G = 'window.__gloam.game';
/** Screen coordinates (CSS px) of a world position. */
const toScreen = (wx, wy) => evaluate(`const g=${G}; const r=document.getElementById('view').getBoundingClientRect(); const s=r.width/g.renderer.vw; return [r.left+(${wx}-Math.round(g.cam.x))*s, r.top+(${wy}-Math.round(g.cam.y))*s];`);
const teleport = (x, y) => evaluate(`const g=${G}; g.player.place(${x}, ${y}); g.snapCamera(); return true;`);

console.log(`\nBrowser smoke test (${BROWSER}, ${W}x${H})`);

await step('page loads, modules start, title screen shows', async () => {
  await send('Page.navigate', { url: BASE });
  await waitFor(`window.__gloam && ${G}.state === 'title'`, 10000);
  await sleep(1200);
  await shot('01-title');
});

await step('canvas is 16:9 with integer pixel scaling', async () => {
  const r = await evaluate(`const c=document.getElementById('view'); const b=c.getBoundingClientRect(); const st=document.getElementById('stage').getBoundingClientRect(); return {cw:c.width,ch:c.height,bw:b.width,bh:b.height,sw:st.width,sh:st.height};`);
  if (Math.abs(r.sw / r.sh - 16 / 9) > 0.01) throw new Error(`stage not 16:9: ${JSON.stringify(r)}`);
  const sc = r.bw / r.cw;
  if (Math.abs(sc - Math.round(sc)) > 0.001) throw new Error(`non-integer scale ${sc}`);
});

await step('new game starts in town', async () => {
  await evaluate(`localStorage.clear(); document.getElementById('seed-input').value='SMOKE1'; document.getElementById('btn-new').click(); return true;`);
  await waitFor(`${G}.state === 'play' && ${G}.area.type === 'town' && !${G}.trans`, 6000);
  await sleep(700);
  await shot('02-town');
});

await step('player sprite occupies 8-12% of the view height', async () => {
  const r = await evaluate(`const g=${G}; const s=g.player.sprite(); const d=s.c.getContext('2d').getImageData(0,0,s.w,s.h).data; let top=s.h,bot=0; for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++){ if(d[(y*s.w+x)*4+3]>0){top=Math.min(top,y);bot=Math.max(bot,y);} } return {h: bot-top+1, vh: g.renderer.vh};`);
  const pct = r.h / r.vh * 100;
  if (pct < 8 || pct > 12.5) throw new Error(`player height ${r.h}px of ${r.vh}px = ${pct.toFixed(1)}%`);
  console.log(`      player ${r.h}px of ${r.vh}px view = ${pct.toFixed(1)}%`);
});

await step('WASD movement with wall collision in all four directions', async () => {
  const p0 = await evaluate(`return {x:${G}.player.x,y:${G}.player.y};`);
  await key('KeyD', 400);
  const p1 = await evaluate(`return {x:${G}.player.x,y:${G}.player.y};`);
  if (!(p1.x > p0.x + 10)) throw new Error(`D did not move right ${p0.x}->${p1.x}`);
  await key('KeyA', 400); await key('KeyS', 300); await key('KeyW', 300);
  // walk into the northern cliff for a long time: must never enter a blocked tile
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
    await key(k, 1600);
    const ok = await evaluate(`const g=${G}; const m=g.area.map; const p=g.player; const r=p.radius-0.6; return [[p.x-r,p.y],[p.x+r,p.y],[p.x,p.y-r],[p.x,p.y+r]].every(([x,y])=>m.walkable(Math.floor(x/16),Math.floor(y/16)));`);
    if (!ok) throw new Error(`player overlapped a wall after holding ${k}`);
  }
});

await step('talk to quest giver and accept a quest (E key)', async () => {
  const w = await evaluate(`const n=${G}.area.npcs.find(n=>n.role==='quest'); return {x:n.x,y:n.y};`);
  await teleport(w.x, w.y + 18);
  await sleep(200);
  await key('KeyE');
  await waitFor(`${G}.modal === 'quest'`, 2000);
  await sleep(300);
  await shot('03-quest-giver');
  await evaluate(`document.querySelector('[data-action="accept"]').click(); return true;`);
  await waitFor(`${G}.profile.quest`, 2000);
  await key('Escape');
  await waitFor(`!${G}.modal`, 2000);
});

await step('storage chest moves items and persists them', async () => {
  const c = await evaluate(`const p=${G}.area.props.find(p=>p.type==='storageChest'); return {x:p.x,y:p.y};`);
  await teleport(c.x, c.y + 16);
  await sleep(150);
  await key('KeyE');
  await waitFor(`${G}.modal === 'chest'`, 2000);
  await evaluate(`const g=${G}; const mod=await import('./js/gen/items.js'); const {RNG}=await import('./js/core/rng.js'); g.profile.inventory[0]=mod.generateItem(new RNG(7), 3, {rarity:'rare'}); g.ui.dirty=true; return true;`);
  await sleep(150);
  await evaluate(`document.querySelector('.slot[data-src="inv"][data-i="0"]').click(); return true;`);
  await waitFor(`${G}.profile.storage.filter(Boolean).length === 1 && !${G}.profile.inventory[0]`, 2000, 'item moved to storage');
  const saved = await evaluate(`return JSON.parse(localStorage.getItem('gloamdeep.save')).storage.filter(Boolean).length;`);
  if (saved !== 1) throw new Error('storage not saved');
  await shot('04-chest');
  await key('Escape');
});

await step('merchant: buy and sell with gold checks', async () => {
  const m = await evaluate(`const n=${G}.area.npcs.find(n=>n.role==='merchant'); return {x:n.x,y:n.y};`);
  await teleport(m.x, m.y + 30);
  await sleep(150);
  await key('KeyE');
  await waitFor(`${G}.modal === 'merchant'`, 2000);
  const r1 = await evaluate(`const g=${G}; g.profile.gold=0; const e=g.buyItem(0); return e;`);
  if (!/gold/i.test(r1 || '')) throw new Error('purchase without gold was not refused');
  await evaluate(`const g=${G}; g.profile.gold=100000; g.ui.dirty=true; return true;`);
  const before = await evaluate(`const g=${G}; return {inv:g.profile.inventory.filter(Boolean).length, stock:g.profile.merchant.stock.length, gold:g.profile.gold};`);
  await sleep(150);
  await evaluate(`document.querySelector('.slot[data-src="shop"][data-i="0"]').click(); return true;`);
  await sleep(100);
  await evaluate(`document.querySelector('[data-action="buy"]').click(); return true;`);
  const after = await evaluate(`const g=${G}; return {inv:g.profile.inventory.filter(Boolean).length, stock:g.profile.merchant.stock.length, gold:g.profile.gold};`);
  if (after.inv !== before.inv + 1 || after.stock !== before.stock - 1 || after.gold >= before.gold) throw new Error(`buy failed ${JSON.stringify([before, after])}`);
  const idx = await evaluate(`return ${G}.profile.inventory.findIndex(Boolean);`);
  await evaluate(`document.querySelector('.slot[data-src="inv"][data-i="${idx}"]').click(); return true;`);
  await sleep(100);
  await shot('05-merchant');
  await evaluate(`const b=document.querySelector('[data-action="sell"]'); b.click(); return true;`);
  await sleep(100);
  await evaluate(`const c=document.querySelector('[data-action="confirm-yes"]'); if(c) c.click(); return true;`);
  const sold = await evaluate(`const g=${G}; return {inv:g.profile.inventory.filter(Boolean).length, gold:g.profile.gold};`);
  if (sold.inv !== before.inv || sold.gold <= after.gold) throw new Error(`sell failed ${JSON.stringify(sold)}`);
  await evaluate(`${G}.buyPotion(); return true;`);
  await key('Escape');
});

await step('inventory: equip an item and see stat comparison tooltip', async () => {
  await evaluate(`const g=${G}; const mod=await import('./js/gen/items.js'); const {RNG}=await import('./js/core/rng.js'); g.profile.inventory[2]=mod.generateItem(new RNG(11), 4, {slot:'weapon', rarity:'epic'}); g.profile.inventory[3]=mod.generateItem(new RNG(12), 4, {slot:'focus', base:'storm', rarity:'magic'}); return true;`);
  await key('KeyI');
  await waitFor(`${G}.modal === 'inventory'`, 2000);
  await sleep(150);
  const r = await evaluate(`const b=document.querySelector('.slot[data-src="inv"][data-i="2"]').getBoundingClientRect(); return [b.left+b.width/2, b.top+b.height/2];`);
  await mouse('mouseMoved', r[0], r[1]);
  await sleep(200);
  const tt = await evaluate(`const t=document.getElementById('tooltip'); return !t.classList.contains('hidden') && t.textContent.includes('Compared to');`);
  if (!tt) throw new Error('comparison tooltip not shown');
  await shot('06-inventory');
  const name = await evaluate(`return ${G}.profile.inventory[2].name;`);
  await evaluate(`document.querySelector('.slot[data-src="inv"][data-i="2"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); return true;`);
  const eq = await evaluate(`return ${G}.profile.equipment.weapon.name;`);
  if (eq !== name) throw new Error('weapon not equipped');
  await evaluate(`document.querySelector('.slot[data-src="inv"][data-i="3"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true})); return true;`);
  const spell = await evaluate(`return ${G}.stats.spell;`);
  if (spell !== 'storm') throw new Error('focus did not change the spell');
  await key('Escape');
});

await step('dungeon entrance: Gloam Stair leads to floor 1', async () => {
  const gpos = await evaluate(`const p=${G}.area.props.find(p=>p.type==='gloamGate'); return {x:p.x,y:p.y};`);
  await teleport(gpos.x, gpos.y + 14);
  await sleep(150);
  await key('KeyE');
  await waitFor(`${G}.modal === 'portal'`, 2000);
  await evaluate(`document.querySelector('[data-action="enter"]').click(); return true;`);
  await waitFor(`${G}.area.type === 'dungeon' && ${G}.area.depth === 1 && !${G}.trans`, 5000);
  await sleep(900);
  await shot('07-dungeon-floor1');
});

await step('dungeon frame is lit (not black) and fog of war reveals around the player', async () => {
  const lum = await evaluate(`const c=document.getElementById('view'); const g=c.getContext('2d'); const d=g.getImageData(0,0,c.width,c.height).data; let s=0; for(let i=0;i<d.length;i+=16) s+=d[i]+d[i+1]+d[i+2]; return s/(d.length/16)/3;`);
  const center = await evaluate(`const c=document.getElementById('view'); const g=c.getContext('2d'); const d=g.getImageData(c.width/2-40,c.height/2-40,80,80).data; let s=0; for(let i=0;i<d.length;i+=4) s+=d[i]+d[i+1]+d[i+2]; return s/(d.length/4)/3;`);
  if (lum < 6) throw new Error(`frame too dark: ${lum.toFixed(1)}`);
  if (center < 20) throw new Error(`area around the player too dark: ${center.toFixed(1)}`);
  const explored = await evaluate(`return ${G}.area.explored.reduce((a,b)=>a+b,0);`);
  if (explored < 20) throw new Error('nothing explored');
  console.log(`      mean luminance ${lum.toFixed(1)}, around player ${center.toFixed(1)}, explored tiles ${explored}`);
});

await step('combat: melee (LMB), spell (RMB), dash (Space), damage, potion (Q)', async () => {
  // bring a real enemy next to the player
  const e = await evaluate(`const g=${G}; const e=g.area.enemies.find(e=>!e.isBoss); e.x=g.player.x+18; e.y=g.player.y; g.area.map.resolveCircle(e,e.radius,true); e.aggroed=true; return {x:e.x,y:e.y,hp:e.hp,n:g.area.enemies.indexOf(e)};`);
  const sp = await toScreen(e.x, e.y - 6);
  await mouse('mouseMoved', sp[0], sp[1]);
  await mouse('mousePressed', sp[0], sp[1], 'left', 1);
  await sleep(700);
  await mouse('mouseReleased', sp[0], sp[1], 'left', 0);
  const hurt = await evaluate(`const g=${G}; const en=g.area.enemies[${e.n}]; return !en || en.dead || en.hp < ${e.hp} || g.profile.stats.kills > 0;`);
  if (!hurt) throw new Error('melee did not damage the enemy');
  const mp0 = await evaluate(`return ${G}.player.mp;`);
  await mouse('mousePressed', sp[0], sp[1], 'right', 2);
  await sleep(120);
  await mouse('mouseReleased', sp[0], sp[1], 'right', 0);
  const mp1 = await evaluate(`return ${G}.player.mp;`);
  if (!(mp1 < mp0)) throw new Error('spell did not spend mana');
  await key('Space');
  const dash = await evaluate(`return ${G}.player.dashCd > 0;`);
  if (!dash) throw new Error('dash did not trigger');
  await sleep(400);
  const hp0 = await evaluate(`const g=${G}; g.player.iframes=0; g.player.dashInv=0; g.combat.hitPlayer(30); return g.player.hp;`);
  const pots = await evaluate(`return ${G}.profile.potions;`);
  await sleep(1100);
  await key('KeyQ');
  const hp1 = await evaluate(`return ${G}.player.hp;`);
  const pots1 = await evaluate(`return ${G}.profile.potions;`);
  if (!(hp1 > hp0 && pots1 === pots - 1)) throw new Error(`potion failed hp ${hp0}->${hp1}, potions ${pots}->${pots1}`);
  await shot('08-combat');
});

await step('killing enemies gives experience, gold and loot; items can be picked up with E', async () => {
  const xp0 = await evaluate(`return ${G}.profile.xp + ${G}.profile.level * 100000;`);
  await evaluate(`const g=${G}; const {generateItem}=await import('./js/gen/items.js'); const {RNG}=await import('./js/core/rng.js'); for (const e of g.area.enemies.slice(0,6)) { e.x=g.player.x+30; e.y=g.player.y; g.combat.killEnemy(e); } g.dropItem(g.player.x+4, g.player.y, generateItem(new RNG(3), 2, {rarity:'rare'})); return true;`);
  await sleep(1400);
  const xp1 = await evaluate(`return ${G}.profile.xp + ${G}.profile.level * 100000;`);
  if (!(xp1 > xp0)) throw new Error('no experience gained');
  const loot = await evaluate(`return ${G}.area.loot.filter(l=>l.kind==='item').length;`);
  if (!loot) throw new Error('no item dropped');
  await shot('09-loot');
  const inv0 = await evaluate(`return ${G}.profile.inventory.filter(Boolean).length;`);
  const it = await evaluate(`const g=${G}; const l=g.area.loot.find(l=>l.kind==='item'); return {x:l.x,y:l.y};`);
  await teleport(it.x, it.y + 2);
  await sleep(200);
  await key('KeyE');
  const inv1 = await evaluate(`return ${G}.profile.inventory.filter(Boolean).length;`);
  if (inv1 !== inv0 + 1) throw new Error(`pick up failed ${inv0}->${inv1}`);
});

await step('descend by the exit stairs (E) to floor 2', async () => {
  const s = await evaluate(`const p=${G}.area.props.find(p=>p.type==='stairsDown'); return {x:p.x,y:p.y};`);
  await teleport(s.x, s.y + 12);
  await sleep(150);
  await key('KeyE');
  await waitFor(`${G}.area.depth === 2 && !${G}.trans`, 5000);
});

await step('ten consecutive floors load, bosses seal and unseal the exit', async () => {
  for (let d = 3; d <= 12; d++) {
    const boss = await evaluate(`const g=${G}; const b=g.area.boss; if (b) { const st=g.area.props.find(p=>p.type==='stairsDown'); if (!st.sealed) throw new Error('boss floor exit not sealed'); g.player.place(b.x, b.y+60); g.snapCamera(); } return !!b;`);
    if (boss) {
      await sleep(1500);
      await shot(`10-boss-floor-${d - 1}`);
      await evaluate(`const g=${G}; g.combat.killEnemy(g.area.boss); return true;`);
      await sleep(300);
      const sealed = await evaluate(`return ${G}.area.props.find(p=>p.type==='stairsDown').sealed;`);
      if (sealed) throw new Error('exit still sealed after the guardian died');
    }
    await evaluate(`${G}.descend(); return true;`);
    await waitFor(`${G}.area.depth === ${d} && !${G}.trans`, 5000, `floor ${d}`);
    await sleep(250);
  }
  await sleep(500);
  await shot('11-floor-12');
});

await step('quest progress, return to town, turn in and receive a new quest', async () => {
  await evaluate(`const g=${G}; const q=g.profile.quest; let guard=0; while(!q.done && guard++<200){ if(q.type==='kill') g.questEvent({type:'kill',arch:q.target,depth:5}); else if(q.type==='collect') g.questEvent({type:'collect'}); else if(q.type==='elite') g.questEvent({type:'kill',elite:true,arch:'grunt',depth:5}); else if(q.type==='boss') g.questEvent({type:'kill',boss:true,depth:q.target}); else g.questEvent({type:'depth',depth:q.target}); } return q.done;`);
  const up = await evaluate(`const p=${G}.area.props.find(p=>p.type==='stairsUp'); return {x:p.x,y:p.y};`);
  await teleport(up.x, up.y + 10);
  await sleep(150);
  await key('KeyE');
  await waitFor(`${G}.area.type === 'town' && !${G}.trans`, 5000);
  const lvl0 = await evaluate(`return ${G}.profile.level*1e6 + ${G}.profile.xp;`);
  const gold0 = await evaluate(`return ${G}.profile.gold;`);
  await evaluate(`${G}.talkTo('warden'); return true;`);
  await waitFor(`${G}.modal === 'quest'`, 2000);
  await evaluate(`document.querySelector('[data-action="turn-in"]').click(); return true;`);
  await sleep(200);
  await shot('12-quest-reward');
  const done = await evaluate(`const g=${G}; return {q:g.profile.quest, n:g.profile.questsCompleted, gold:g.profile.gold, lvl:g.profile.level*1e6+g.profile.xp};`);
  if (done.q || done.n !== 1 || done.gold <= gold0 || done.lvl <= lvl0) throw new Error(`turn in failed ${JSON.stringify(done)}`);
  await evaluate(`document.querySelector('[data-action="reward-ok"]').click(); return true;`);
  await sleep(100);
  await evaluate(`document.querySelector('[data-action="accept"]').click(); return true;`);
  const q2 = await evaluate(`return !!${G}.profile.quest;`);
  if (!q2) throw new Error('could not accept a new quest');
  await key('Escape');
});

await step('death screen and town respawn', async () => {
  await evaluate(`const g=${G}; g.enterDungeonAt(1); return true;`);
  await waitFor(`${G}.area.type === 'dungeon' && !${G}.trans`, 5000);
  await evaluate(`const g=${G}; g.player.iframes=0; g.player.dashInv=0; g.combat.hitPlayer(1e9); return true;`);
  await waitFor(`!document.getElementById('death-screen').classList.contains('hidden')`, 4000);
  await shot('13-death');
  await evaluate(`document.querySelector('[data-act="respawn"]').click(); return true;`);
  await waitFor(`${G}.state === 'play' && ${G}.area.type === 'town' && !${G}.trans && ${G}.player.hp > 0`, 5000);
});

await step('map overlay (M) and pause menu (Esc) with seed display', async () => {
  await key('KeyM');
  await sleep(200);
  const open = await evaluate(`return ${G}.mapOpen && !document.getElementById('bigmap').classList.contains('hidden');`);
  if (!open) throw new Error('map did not open');
  await key('KeyM');
  await key('Escape');
  await waitFor(`${G}.modal === 'pause'`, 2000);
  const seed = await evaluate(`return document.querySelector('.panel-pause').textContent.includes('SMOKE1');`);
  if (!seed) throw new Error('seed not shown in pause view');
  await shot('14-pause');
  await key('Escape');
});

await step('reload the page and continue from the save', async () => {
  const before = await evaluate(`const p=${G}.profile; return {level:p.level, gold:p.gold, maxDepth:p.maxDepth, stored:p.storage.filter(Boolean).length, weapon:p.equipment.weapon.name, quests:p.questsCompleted};`);
  await send('Page.reload');
  await sleep(500);
  await waitFor(`window.__gloam && ${G}.state === 'title'`, 10000);
  const enabled = await evaluate(`return !document.getElementById('btn-continue').disabled;`);
  if (!enabled) throw new Error('continue is disabled after reload');
  await evaluate(`document.getElementById('btn-continue').click(); return true;`);
  await waitFor(`${G}.state === 'play' && !${G}.trans`, 5000);
  const after = await evaluate(`const p=${G}.profile; return {level:p.level, gold:p.gold, maxDepth:p.maxDepth, stored:p.storage.filter(Boolean).length, weapon:p.equipment.weapon.name, quests:p.questsCompleted};`);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`state differs\n${JSON.stringify(before)}\n${JSON.stringify(after)}`);
});

await step('1920x1080 layout renders crisply', async () => {
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  await evaluate(`const g=${G}; g.enterDungeonAt(1); return true;`);
  await waitFor(`${G}.area.type === 'dungeon' && !${G}.trans`, 5000);
  await sleep(900);
  await shot('15-dungeon-1080p');
  const r = await evaluate(`const c=document.getElementById('view'); const b=c.getBoundingClientRect(); return b.width/c.width;`);
  if (Math.abs(r - Math.round(r)) > 0.001) throw new Error(`non-integer scale ${r}`);
});

await step('stress: many enemies and particles stay within caps and keep running', async () => {
  await evaluate(`const g=${G}; for (let i=0;i<40;i++) g.spawnMinion(['grunt','archer','skitter','bloater'][i%4], g.player.x+(Math.random()-0.5)*160, g.player.y+(Math.random()-0.5)*120, g.area.theme.enemySkin); for (let i=0;i<30;i++) g.combat.explode(g.player.x+(Math.random()-0.5)*200, g.player.y+(Math.random()-0.5)*200, 30, 1, {team:'neutral'}); g.player.hp=1e6; return true;`);
  await sleep(2500);
  const d = await evaluate(`return ${G}.debugInfo();`);
  if (d.particles > 3200 || d.projectiles > 260) throw new Error(`caps exceeded ${JSON.stringify(d)}`);
  await shot('16-stress');
  console.log(`      after stress: ${JSON.stringify({ enemies: d.enemies, particles: d.particles, fps: d.fps })}`);
});

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${errors.length} console error(s)`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
console.log(`Screenshots: ${SHOTS}`);
await cleanup(failed.length || errors.length ? 1 : 0);
