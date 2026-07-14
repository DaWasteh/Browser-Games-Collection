(() => {
'use strict';
const $ = id => document.getElementById(id);
const cards = [];
let selected = null, history = [], moves = 0, started = 0, status = 'playing', hintIds = [], timerId, lastPlan = [];
function rand(n){ return Math.floor(Math.random()*n); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=rand(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function makeSlots(){
  const out=[]; let id=0;
  const add=(z,w,h,ox=0)=>{ for(let y=0;y<h;y++) for(let x=0;x<w;x++) out.push({id:id++,x:x+ox,y,z,removed:false,face:null}); };
  add(0,12,7); add(1,8,5,2); add(2,4,3,4); add(3,4,2,4);
  return out;
}
const slots=makeSlots();
function covers(a,b){ return b.z>a.z && Math.abs(b.x-a.x)<=1 && Math.abs(b.y-a.y)<=1; }
function occupied(o, remaining){ return remaining ? remaining.has(o.id) : !o.removed; }
function freeIn(c,remaining){
  if(!c || (remaining ? !remaining.has(c.id) : c.removed)) return false;
  const top=cards.some(o=>occupied(o,remaining)&&covers(c,o));
  const left=cards.some(o=>occupied(o,remaining)&&o.z===c.z&&o.y===c.y&&o.x===c.x-1);
  const right=cards.some(o=>occupied(o,remaining)&&o.z===c.z&&o.y===c.y&&o.x===c.x+1);
  return !top && (!left || !right);
}
function isFree(c){ return freeIn(c,null); }
function isMatch(a,b){ return !!a&&!!b&&a!==b&&((a.face.group==='flower'&&b.face.group==='flower')||(a.face.group==='season'&&b.face.group==='season')||a.face.id===b.face.id); }
function faces(){
  const a=[]; const suits=['●','🎋','萬'];
  suits.forEach((s,si)=>{for(let n=0;n<9;n++)for(let k=0;k<4;k++)a.push({id:`${si}-${n}`,group:'normal',label:`${n+1}${s}`,className:'normal'});});
  ['東','南','西','北'].forEach((s,si)=>{for(let k=0;k<4;k++)a.push({id:`w-${si}`,group:'normal',label:s,className:'normal'});});
  ['中','發','白'].forEach((s,si)=>{for(let k=0;k<4;k++)a.push({id:`d-${si}`,group:'normal',label:s,className:'normal'});});
  ['🌸','🌼','🌺','🌷'].forEach((s,i)=>a.push({id:`f-${i}`,group:'flower',label:s,className:'flower'}));
  ['🌱','☀','🍂','❄'].forEach((s,i)=>a.push({id:`s-${i}`,group:'season',label:s,className:'season'}));
  return a;
}
function pairFaces(){
  const all=faces(), pairs=[], normal=all.filter(f=>f.group==='normal');
  for(let i=0;i<normal.length;i+=2) pairs.push([normal[i],normal[i]]);
  for(let i=0;i<4;i+=2) pairs.push([all.find(f=>f.id===`f-${i}`),all.find(f=>f.id===`f-${i+1}`)]);
  for(let i=0;i<4;i+=2) pairs.push([all.find(f=>f.id===`s-${i}`),all.find(f=>f.id===`s-${i+1}`)]);
  return shuffle(pairs);
}
/* Build a real pair-removal plan. The temporary Set is the simulated board;
   it is deliberately not confused with cards[].removed. Every pair is free
   at the same moment before both members are removed. */
function buildPairPlan(ids, attempts=1200){
  const source=cards.filter(c=>ids.has(c.id));
  for(let attempt=0;attempt<attempts;attempt++){
    const remaining=new Set(ids), plan=[];
    while(remaining.size){
      const free=source.filter(c=>freeIn(c,remaining));
      const pairs=[];
      for(let i=0;i<free.length;i++) for(let j=i+1;j<free.length;j++) pairs.push([free[i],free[j]]);
      if(!pairs.length) break;
      shuffle(pairs);
      // Prefer a pair that does not leave an odd singleton when only two remain.
      const pair=remaining.size===2 ? pairs.find(p=>p.length===2) : pairs[0];
      if(!pair) break;
      plan.push([pair[0].id,pair[1].id]); remaining.delete(pair[0].id); remaining.delete(pair[1].id);
    }
    if(!remaining.size) return plan;
  }
  return null;
}
function verifyPairPlan(plan,ids){
  if(!Array.isArray(plan)) return false;
  const remaining=new Set(ids);
  for(const pair of plan){
    if(!Array.isArray(pair)||pair.length!==2||pair[0]===pair[1]||!remaining.has(pair[0])||!remaining.has(pair[1])) return false;
    const a=cards[pair[0]], b=cards[pair[1]];
    if(!freeIn(a,remaining)||!freeIn(b,remaining)) return false;
    remaining.delete(pair[0]); remaining.delete(pair[1]);
  }
  return remaining.size===0;
}
function assignPlan(plan,pairs){ plan.forEach((p,i)=>{ cards[p[0]].face=pairs[i][0]; cards[p[1]].face=pairs[i][1]; }); }
function deal(){
  cards.splice(0,cards.length,...slots.map(s=>({...s})));
  const ids=new Set(cards.map(c=>c.id));
  const plan=buildPairPlan(ids);
  if(!plan || !verifyPairPlan(plan,ids)) throw new Error('Kein gültiger Paarplan für dieses Layout.');
  assignPlan(plan,pairFaces()); lastPlan=plan.map(pair=>pair.slice());
  selected=null; hintIds=[]; history=[]; moves=0; status='playing'; started=Date.now();
  $('result').hidden=true; render(); announce('Neues Spiel: Wähle einen freien Stein.');
}
function snapshot(){ return {faces:cards.map(c=>c.face),removed:cards.map(c=>c.removed),moves,status}; }
function restore(s){ cards.forEach((c,i)=>{c.face=s.faces[i];c.removed=s.removed[i];}); moves=s.moves;status=s.status==='blocked'?'playing':s.status;lastPlan=[];selected=null;hintIds=[];$('result').hidden=true;render(); }
function announce(t){ $('message').textContent=t; }
function format(t){ return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`; }
function findHint(){ const free=cards.filter(isFree); for(let i=0;i<free.length;i++)for(let j=i+1;j<free.length;j++)if(isMatch(free[i],free[j]))return [free[i].id,free[j].id]; return null; }
function render(){
  const board=$('board');
  if(board.children.length!==cards.length){ board.replaceChildren(); cards.forEach(c=>{const b=document.createElement('button');b.type='button';b.className='tile';b.addEventListener('click',()=>choose(c.id));board.append(b);}); }
  cards.forEach(c=>{const b=board.children[c.id];b.style.left=`calc(${(c.x+1)*7.2}% + ${c.z*3}px)`;b.style.top=`calc(${(c.y+1)*12.5}% - ${c.z*5}px)`;b.style.zIndex=String(c.z*200+c.y*10+c.x);b.className=`tile ${c.face.className}${c.removed?' removed':''}${isFree(c)?' free':''}${selected===c.id||hintIds.includes(c.id)?' selected':''}`;b.disabled=c.removed||!isFree(c)||status!=='playing';b.textContent=c.removed?'':c.face.label;b.setAttribute('aria-label',c.removed?'entfernt':`${c.face.label}, ${isFree(c)?'frei':'verdeckt'}`);b.title=b.getAttribute('aria-label');});
  $('remaining').textContent=String(cards.filter(c=>!c.removed).length);$('moves').textContent=String(moves);$('undo').disabled=!history.length||status==='won';$('shuffle').disabled=status==='won'||cards.every(c=>c.removed);$('hint').disabled=status==='won';$('time').textContent=format(Math.floor((Date.now()-started)/1000));
}
function choose(id){
  if(status!=='playing') return; const c=cards[id]; if(!isFree(c)) return;
  if(selected===null){selected=id;hintIds=[];announce('Nun einen passenden freien Stein wählen.');render();return;}
  if(selected===id){selected=null;render();return;}
  const a=cards[selected];
  if(isMatch(a,c)){history.push(snapshot());a.removed=true;c.removed=true;selected=null;hintIds=[];moves++;render();announce('Paar entfernt.');checkEnd();}
  else{selected=id;announce('Diese Steine passen nicht zusammen.');render();}
}
function hint(){ const h=findHint(); hintIds=h||[]; if(h){status='playing';announce('Hinweis: Die markierten Steine bilden ein freies Paar.');}else{status='blocked';announce('Kein freies Paar – nutze Rückgängig oder Mischen.');} render(); }
function doShuffle(){
  if(status==='won') return;
  const live=cards.filter(c=>!c.removed), ids=new Set(live.map(c=>c.id));
  const plan=buildPairPlan(ids);
  if(!plan || !verifyPairPlan(plan,ids)){status='blocked';announce('Die Geometrie hat keine sichere Fortsetzung. Rückgängig macht den letzten Zug möglich.');render();return;}
  const pool=live.map(c=>c.face), groups={};
  pool.forEach(f=>(groups[f.group==='normal'?f.id:f.group]??=[]).push(f));
  const pairs=[];Object.values(groups).forEach(g=>{shuffle(g);while(g.length>1)pairs.push([g.pop(),g.pop()]);});
  if(pairs.length*2!==live.length){announce('Mischen nicht möglich: Reststeine sind nicht paarweise.');return;}
  history.push(snapshot()); assignPlan(plan,pairs); lastPlan=plan.map(pair=>pair.slice()); moves++; selected=null;hintIds=[];status='playing'; render(); announce('Restliche Steine wurden in eine nachweisbar lösbare Fortsetzung gemischt.');
}
function undo(){ if(!history.length||status==='won')return; restore(history.pop()); announce('Letzten Zug rückgängig gemacht.'); }
function checkEnd(){ if(cards.every(c=>c.removed)){status='won';render();finish('Geschafft! Alle 144 Steine entfernt.');return;} if(!findHint()){status='blocked';render();announce('Kein freies Paar – nutze Rückgängig oder Mischen.');} }
function finish(text){$('result-title').textContent='Pahjong gewonnen!';$('result-text').textContent=`${text} Züge: ${moves} · Zeit: ${format(Math.floor((Date.now()-started)/1000))}.`;$('result').hidden=false;$('result-button').focus();}
function newGame(){deal();}
function testPlan(rounds=25){
  const original=cards.map(c=>({...c})), ok=[];
  for(let i=0;i<rounds;i++){cards.splice(0,cards.length,...slots.map(s=>({...s})));const ids=new Set(cards.map(c=>c.id));const p=buildPairPlan(ids,2500);ok.push(!!p&&verifyPairPlan(p,ids));}
  cards.splice(0,cards.length,...original); render(); return {rounds,passed:ok.filter(Boolean).length,allPassed:ok.every(Boolean)};
}
$('hint').addEventListener('click',hint);$('shuffle').addEventListener('click',doShuffle);$('undo').addEventListener('click',undo);$('new-game').addEventListener('click',newGame);$('result-button').addEventListener('click',newGame);
document.addEventListener('keydown',e=>{if(e.target.matches('button,a,summary'))return;const k=e.key.toLowerCase();if(k==='h'){e.preventDefault();hint();}if(k==='m'){e.preventDefault();doShuffle();}if(k==='u'){e.preventDefault();undo();}if(k==='n'){e.preventDefault();newGame();}});
timerId=setInterval(()=>{if(status==='playing'||status==='blocked')render();},1000);
window.Pahjong={isFree,isMatch,findHint,getState:()=>({count:cards.length,remaining:cards.filter(c=>!c.removed).length,moves,status}),newGame,shuffleRemaining:doShuffle,getSolutionPlan:()=>lastPlan.map(pair=>pair.slice()),buildPairPlan:(ids=cards.filter(c=>!c.removed).map(c=>c.id))=>buildPairPlan(new Set(ids)),verifyPairPlan:(plan,ids=cards.filter(c=>!c.removed).map(c=>c.id))=>verifyPairPlan(plan,new Set(ids)),testPlan};
deal();
})();
