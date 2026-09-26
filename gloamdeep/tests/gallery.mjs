// Visual gallery: screenshots of every biome, a guardian, and a busy combat scene.
// Run with: node tests/gallery.mjs [width] [height]

import { openBrowser, sleep, SHOTS } from './harness.mjs';

const W = Number(process.argv[2]) || 1280, H = Number(process.argv[3]) || 720;
const b = await openBrowser({ width: W, height: H });
if (!b) { console.log('SKIP: no browser found'); process.exit(0); }
const G = 'window.__gloam.game';
await b.send('Page.navigate', { url: b.base });
await b.waitFor(`window.__gloam && ${G}.state === 'title'`, 10000);
await b.evaluate(`localStorage.clear(); document.getElementById('seed-input').value='GALLERY'; document.getElementById('btn-new').click(); return true;`);
await b.waitFor(`${G}.state === 'play' && !${G}.trans`, 6000);
await b.evaluate(`const g=${G}; g.profile.maxDepth=40; g.profile.level=12; g.refreshStats(); g.player.hp=g.stats.maxHp; return true;`);

async function floor(depth, name, setup = '') {
  await b.evaluate(`${G}.loadDungeon(${depth}); return true;`);
  await b.waitFor(`${G}.area.depth === ${depth} && !${G}.trans`, 6000);
  await b.evaluate(`const g=${G}; g.player.hp=1e5; g.player.iframes=999; ${setup} g.snapCamera(); return true;`);
  await sleep(1400);
  await b.shot(name);
}

// place the player in the most populated room so enemies are on screen
const crowd = `const rooms=g.area.floor.rooms.filter(r=>r.kind!=='start'); let best=null,bc=-1; for(const r of rooms){ const c=g.area.enemies.filter(e=>Math.abs(e.x/16-r.cx)<r.w/2+1&&Math.abs(e.y/16-r.cy)<r.h/2+1).length; if(c>bc){bc=c;best=r;} } g.player.place(best.cx*16+8,(best.cy+Math.floor(best.h/2)-1)*16+8); for(const e of g.area.enemies) e.aggroed=false;`;

await floor(2, 'g1-catacombs', crowd);
await floor(7, 'g2-fungal', crowd);
await floor(12, 'g3-forge', crowd);
await floor(17, 'g4-crystal', crowd);
await floor(10, 'g5-guardian-mycelia', `const bo=g.area.boss; g.player.place(bo.x, bo.y+70);`);
await b.evaluate(`const g=${G}; g.area.boss.awaken(g); return true;`);
await sleep(2500);
await b.shot('g6-guardian-fight');
// busy combat on floor 3
await b.evaluate(`${G}.loadDungeon(3); return true;`);
await b.waitFor(`${G}.area.depth === 3 && !${G}.trans`, 6000);
await b.evaluate(`const g=${G}; g.player.hp=1e5; ${crowd} for(const e of g.area.enemies){ if(Math.hypot(e.x-g.player.x,e.y-g.player.y)<220) e.provoke(g);} g.snapCamera(); return true;`);
await sleep(1200);
await b.evaluate(`const g=${G}; g.player.castSpell(g); return true;`);
await sleep(250);
await b.shot('g7-combat');
// every guardian, awake, seen from the arena
for (const [d, n] of [[5, 'g8-boss-ossuary'], [15, 'g9-boss-colossus'], [20, 'g10-boss-seer']]) {
  await floor(d, n, `const bo=g.area.boss; g.player.place(bo.x, bo.y+64); for (const e of g.area.enemies) if (!e.isBoss) e.dead=true;`);
  await b.evaluate(`const g=${G}; g.area.boss.awaken(g); g.player.iframes=999; return true;`);
  await sleep(1800);
  await b.shot(n + '-fight');
}
// elites lined up for inspection
await b.evaluate(`${G}.loadDungeon(9); return true;`);
await b.waitFor(`${G}.area.depth === 9 && !${G}.trans`, 6000);
await b.evaluate(`const g=${G}; g.player.hp=1e5; g.player.iframes=999; const {Enemy}=await import('./js/entities/enemy.js'); for (const e of g.area.enemies) e.dead=true; g.area.enemies=[]; const archs=['grunt','archer','skitter','bloater','brute','caster']; const mods=[['molten'],['arcane'],['swift'],['vampiric'],['armored','brutal'],['frenzied']]; archs.forEach((a,i)=>{ const x=g.player.x-75+i*30, y=g.player.y-30; const e=new Enemy({arch:a,x,y,elite:mods[i],pack:1}, 9, g.area.theme.enemySkin); g.area.enemies.push(e); }); g.snapCamera(); return true;`);
await sleep(700);
await b.shot('g11-elites');
// town at night in full HD
await b.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await b.evaluate(`${G}.loadTown(false); return true;`);
await b.waitFor(`${G}.area.type === 'town' && !${G}.trans`, 6000);
await sleep(3800);
await b.shot('g12-town-1080p');
console.log(`errors: ${b.errors.length}${b.errors.length ? '\n' + b.errors.join('\n') : ''}`);
console.log(`gallery written to ${SHOTS}`);
await b.close();
process.exit(0);
