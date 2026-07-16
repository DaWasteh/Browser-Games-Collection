(() => {
'use strict';
const $ = id => document.getElementById(id);
const suits = ['♠','♥','♦','♣'];
const names = ['','A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const positions = [
  [1,0],[5,0],[9,0], [0,1],[2,1],[4,1],[6,1],[8,1],[10,1],
  [0,2],[1,2],[2,2],[4,2],[5,2],[6,2],[8,2],[9,2],[10,2],
  [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3]
];
const blockers = [
  [3,4],[5,6],[7,8], [9,10],[10,11],[12,13],[13,14],[15,16],[16,17],
  [18,19],[19,20],[20,21],[21,22],[22,23],[23,24],[24,25],[25,26],[26,27],
  [],[],[],[],[],[],[],[],[],[]
];
const removalOrder = [18,19,20,21,22,23,24,25,26,27,9,10,11,12,13,14,15,16,17,3,4,5,6,7,8,0,1,2];
let cards = [], talon = [], waste = null, initialDeal = null, history = [], moves = 0, streak = 0, started = 0, status = 'playing', timer = 0;
const rankPath = [1,2,3,4,5,6,7,8,9,10,11,12,13,12,11,10,9,8,7,6,5,4,3,2,1,2,3,4];
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function legal(a,b){return Math.abs(a-b)===1 || (a===1&&b===13) || (a===13&&b===1);}
function snapshot(){return {removed:cards.map(c=>c.removed),talon:talon.slice(),waste,moves,streak,status};}
function restore(s){cards.forEach((c,i)=>{c.removed=s.removed[i];});talon=s.talon.slice();waste=s.waste;moves=s.moves;streak=s.streak;status=s.status;render();}
function makeDeck(){const d=[];for(let r=1;r<=13;r++)for(let s=0;s<4;s++)d.push({rank:r,suit:s});return d;}
function deal(){
  const deck=shuffle(makeDeck());
  // The tableau is assigned along a legal bottom-to-top removal path: every fresh round is solvable.
  const wanted=rankPath.slice(); if(Math.random()<.5) wanted.reverse();
  const byRank=Array.from({length:14},()=>[]); deck.forEach(c=>byRank[c.rank].push(c));
  cards=positions.map((p,id)=>({id,x:p[0],y:p[1],removed:false,rank:0,suit:'',blockers:blockers[id]}));
  const tableauDeckCards=[];
  removalOrder.forEach((id,i)=>{const c=byRank[wanted[i]].pop();tableauDeckCards.push(c);cards[id].rank=c.rank;cards[id].suit=suits[c.suit];});
  // Keep the waste as a real 52-card-deck card: 28 tableau + 1 waste + 23 talon.
  const remaining=deck.filter(c=>!tableauDeckCards.includes(c));
  const wasteIndex=remaining.findIndex(c=>legal(c.rank,wanted[0]));
  if(wasteIndex<0) throw new Error('Kein legaler Start-Waste im Restdeck');
  const wasteCard=remaining.splice(wasteIndex,1)[0];
  talon=remaining.map(c=>({rank:c.rank,suit:suits[c.suit]}));
  shuffle(talon); waste={rank:wasteCard.rank,suit:suits[wasteCard.suit]};
}
function cloneCards(source){return source.map(c=>({...c,blockers:c.blockers.slice()}));}
function saveInitialDeal(){initialDeal={cards:cloneCards(cards),talon:talon.map(c=>({...c})),waste:{...waste}};}
function resetCounters(){history=[];moves=0;streak=0;timer=0;status='playing';started=Date.now();$('time').textContent='00:00';}
function setup(){
  deal(); saveInitialDeal(); resetCounters(); render(); announce('Neue Runde: Wähle eine freie Karte.');
}
function restartRound(){
  if(!initialDeal){setup();return;}
  cards=cloneCards(initialDeal.cards);talon=initialDeal.talon.map(c=>({...c}));waste={...initialDeal.waste};resetCounters();$('result').hidden=true;render();announce('Runde neu gestartet – gleiche Austeilung.');
}
function free(c){return !c.removed && c.blockers.every(i=>cards[i].removed);}
function hasMove(){return cards.some(c=>free(c)&&legal(c.rank,waste.rank));}
function cardLabel(c){return `${names[c.rank]}${c.suit}${free(c)?' – frei':' – verdeckt'}`;}
function render(){
  const tableau=$('tableau');
  if(tableau.children.length!==cards.length){tableau.replaceChildren();cards.forEach(c=>{const b=document.createElement('button');b.type='button';b.className='card';b.dataset.id=String(c.id);b.addEventListener('click',()=>play(c.id));tableau.append(b);});}
  cards.forEach(c=>{const b=tableau.children[c.id];b.style.left=`${(c.x+0.5)*8.9}%`;b.style.top=`${c.y*25+1}%`;b.className='card'+(c.suit==='♥'||c.suit==='♦'?' red':'')+(c.removed?' removed':'')+(!c.removed&&!free(c)?' covered':'');b.disabled=c.removed||!free(c)||status!=='playing';b.setAttribute('aria-label',cardLabel(c));b.setAttribute('aria-pressed','false');b.replaceChildren();if(!c.removed){const r=document.createElement('span');r.className='rank';r.textContent=names[c.rank];const s=document.createElement('span');s.className='suit';s.textContent=c.suit;b.append(r,s);}});
  const w=$('waste');w.replaceChildren();const wr=document.createElement('span');wr.className='rank';wr.textContent=names[waste.rank];const ws=document.createElement('span');ws.className='suit';ws.textContent=waste.suit;w.append(wr,ws);w.className='pile waste'+(waste.suit==='♥'||waste.suit==='♦'?' red':'');w.setAttribute('aria-label',`Ablage: ${names[waste.rank]}${waste.suit}`);
  $('talon-count').textContent=String(talon.length);$('talon').disabled=talon.length===0||status!=='playing';$('moves').textContent=String(moves);$('streak').textContent=String(streak);$('remaining').textContent=String(cards.filter(c=>!c.removed).length);$('undo').disabled=history.length===0;
}
function announce(text){$('message').textContent=text;}
function play(id){if(status!=='playing')return;const c=cards[id];if(!free(c))return;if(!legal(c.rank,waste.rank)){announce(`${names[c.rank]} passt nicht auf ${names[waste.rank]}.`);return;}history.push(snapshot());c.removed=true;waste={rank:c.rank,suit:c.suit};moves++;streak++;render();announce(streak>1?`Serie ${streak}! Weiter so.`:'Guter Zug.');checkEnd();}
function draw(){if(status!=='playing'||!talon.length)return;history.push(snapshot());waste=talon.pop();moves++;streak=0;render();announce(`Gezogen: ${names[waste.rank]}${waste.suit}.`);checkEnd();}
function undo(){if(!history.length)return;$('result').hidden=true;restore(history.pop());announce('Letzten Zug rückgängig gemacht.');}
function checkEnd(){if(cards.every(c=>c.removed)){status='won';render();finish('Geschafft! Alle 28 Karten sind abgeräumt.');return;}if(talon.length===0&&!hasMove()){status='lost';render();finish('Keine passenden freien Karten mehr – der Talon ist leer.');}}
function finish(text){$('result-title').textContent=status==='won'?'TriPeaks geschafft!':'Runde beendet';$('result-text').textContent=`${text} Züge: ${moves} · Zeit: ${formatTime(timer)}.`;$('result').hidden=false;$('result-button').focus();}
function formatTime(sec){return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
function newRound(){ $('result').hidden=true;setup(); }
$('talon').addEventListener('click',draw);$('undo').addEventListener('click',undo);$('restart').addEventListener('click',restartRound);$('new-game').addEventListener('click',newRound);$('result-undo').addEventListener('click',undo);$('result-button').addEventListener('click',newRound);
document.addEventListener('keydown',e=>{if(e.target.matches('button,a,summary')&&(e.key===' '||e.key==='Enter'))return;const key=e.key.toLowerCase();if(key==='u'){e.preventDefault();undo();}else if(key==='r'){e.preventDefault();restartRound();}else if(key==='n'){e.preventDefault();newRound();}else if(key==='d'){e.preventDefault();draw();}else if(e.key==='escape'&&!$('result').hidden){$('result').hidden=true;}});
setInterval(()=>{if(status==='playing'){timer=Math.floor((Date.now()-started)/1000);$('time').textContent=formatTime(timer);}},1000);
setup();
window.Pandataire={legal,free,play,draw,undo,setup,getState:()=>({cards,talon,waste,moves,streak,status})};
})();
