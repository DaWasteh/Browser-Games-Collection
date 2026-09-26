// Soak test: runs the real game logic in the browser at accelerated speed.
// A simple bot fights through 20 floors (all biomes, all four guardians through both phases),
// exercising every enemy behaviour, projectile, trap and legendary power. Fails on exceptions,
// NaN values or entity counts exceeding their caps.
// Run with: node tests/soak.mjs

import { openBrowser } from './harness.mjs';

const b = await openBrowser({ width: 1280, height: 720 });
if (!b) { console.log('SKIP: no browser found'); process.exit(0); }
const G = 'window.__gloam.game';
await b.send('Page.navigate', { url: b.base });
await b.waitFor(`window.__gloam && ${G}.state === 'title'`, 10000);
await b.evaluate(`localStorage.clear(); document.getElementById('seed-input').value='SOAK'; document.getElementById('btn-new').click(); return true;`);
await b.waitFor(`${G}.state === 'play' && !${G}.trans`, 6000);

// equip every legendary power so their code paths run too
await b.evaluate(`const g=${G}; const m=await import('./js/gen/items.js'); const {RNG}=await import('./js/core/rng.js');
  const r=new RNG(99); const mk=(slot,power,base)=>{ const it=m.generateItem(r, 12, {slot, rarity:'legendary', base}); it.power=power; return it; };
  const eq=g.profile.equipment; eq.weapon=mk('weapon','echoStrike','sword'); eq.ring=mk('ring','corpseBlast'); eq.boots=mk('boots','emberTrail');
  eq.armor=mk('armor','frostNova'); eq.helm=mk('helm','manaShield'); eq.amulet=mk('amulet','lanternHeart'); eq.focus=mk('focus','splitBolt','ember');
  g.profile.level=14; g.refreshStats(); return [...g.stats.powers];`);

const BOT = `
  const g=${G}; const p=g.player;
  const tick=(dt)=>{
    // bot: keep the player alive, aim at the nearest enemy, swing, cast and dash
    p.hp=Math.max(p.hp, g.stats.maxHp*0.6); p.mp=Math.max(p.mp, 40);
    let best=null, bd=1e9; for(const e of g.area.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-p.x,e.y-p.y); if(d<bd){bd=d;best=e;} }
    if(best){
      g.mouseWorld.x=best.x; g.mouseWorld.y=best.y-6;
      if(bd>40){ const a=Math.atan2(best.y-p.y,best.x-p.x); g.area.map.move(p, Math.cos(a)*90*dt, Math.sin(a)*90*dt, p.radius); }
      if(p.attackCd<=0 && !p.swing && bd<50) p.startSwing(g);
      if(p.spellCd<=0 && bd<200 && Math.random()<0.3) p.castSpell(g);
      if(p.dashCd<=0 && Math.random()<0.01) p.startDash(g,{x:Math.random()-0.5,y:Math.random()-0.5});
    }
    g.updateWorld(dt);
    g.floaters.update(dt);
  };`;

async function simulate(seconds, label) {
  const r = await b.evaluate(`${BOT}
    const t0=performance.now(); const steps=Math.round(${seconds}*60); let maxP=0,maxE=0,maxProj=0;
    for(let i=0;i<steps;i++){
      tick(1/60);
      if(g.state!=='play'){ return {error:'player died or state changed: '+g.state}; }
      maxP=Math.max(maxP,g.particles.count); maxE=Math.max(maxE,g.area.enemies.length); maxProj=Math.max(maxProj,g.area.projectiles.length);
      for(const e of g.area.enemies){ if(!Number.isFinite(e.x)||!Number.isFinite(e.y)||!Number.isFinite(e.hp)) return {error:'NaN enemy '+e.name}; }
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.hp)||!Number.isFinite(p.mp)) return {error:'NaN player'};
    }
    const ms=performance.now()-t0;
    return {ms:Math.round(ms), simSec:${seconds}, maxP, maxE, maxProj, kills:g.profile.stats.kills, level:g.profile.level, left:g.area.enemies.length, boss:g.area.boss?{hp:Math.round(g.area.boss.hp),max:g.area.boss.maxHp,phase:g.area.boss.phase,dead:g.area.boss.dead}:null};`);
  if (r.error) throw new Error(`${label}: ${r.error}`);
  if (r.maxP > 3200 || r.maxProj > 260 || r.maxE > 145) throw new Error(`${label}: caps exceeded ${JSON.stringify(r)}`);
  return r;
}

let failures = 0;
for (let depth = 1; depth <= 20; depth++) {
  try {
    await b.evaluate(`${G}.loadDungeon(${depth}); return true;`);
    await b.waitFor(`${G}.area.depth === ${depth} && !${G}.trans`, 6000);
    const boss = await b.evaluate(`return !!${G}.area.boss;`);
    if (boss) {
      await b.evaluate(`const g=${G}; const bo=g.area.boss; g.player.place(bo.x, bo.y+60); g.snapCamera(); bo.awaken(g); return true;`);
      const r = await simulate(60, `floor ${depth} guardian`);
      const patterns = await b.evaluate(`return ${G}.area.boss ? ${G}.area.boss.lastPattern : 'dead';`);
      console.log(`  floor ${String(depth).padStart(2)} guardian: ${JSON.stringify(r.boss)} kills=${r.kills} lvl=${r.level} maxParticles=${r.maxP} maxProj=${r.maxProj} (${r.ms}ms for ${r.simSec}s) last=${patterns}`);
      if (r.boss && !r.boss.dead && r.boss.phase < 2) throw new Error('guardian never reached phase 2');
    } else {
      // walk the bot to the densest room and fight
      await b.evaluate(`const g=${G}; const rooms=g.area.floor.rooms.filter(r=>r.kind!=='start'); let best=null,bc=-1; for(const r of rooms){ const c=g.area.enemies.filter(e=>Math.abs(e.x/16-r.cx)<r.w/2+1&&Math.abs(e.y/16-r.cy)<r.h/2+1).length; if(c>bc){bc=c;best=r;} } g.player.place(best.cx*16+8,best.cy*16+8); g.area.map.resolveCircle(g.player,5); return true;`);
      const r = await simulate(25, `floor ${depth}`);
      console.log(`  floor ${String(depth).padStart(2)}: enemies left ${r.left}, kills=${r.kills} lvl=${r.level} maxParticles=${r.maxP} maxProj=${r.maxProj} maxEnemies=${r.maxE} (${r.ms}ms for ${r.simSec}s)`);
    }
  } catch (e) {
    failures++;
    console.log(`  ✗ floor ${depth}: ${e.message}`);
  }
}
console.log(`\nsoak finished: ${failures} failing floor(s), ${b.errors.length} console error(s)`);
if (b.errors.length) console.log(b.errors.slice(0, 10).join('\n'));
await b.close();
process.exit(failures || b.errors.length ? 1 : 0);
