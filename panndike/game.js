(() => {
'use strict';
const suits=['♠','♥','♦','♣'], ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const red=new Set(['♥','♦']);
const el=id=>document.getElementById(id); const ui={tableau:el('tableau'),foundations:el('foundations'),stock:el('stock'),waste:el('waste'),stockCount:el('stock-count'),moves:el('moves'),time:el('time'),fcount:el('foundation-count'),draw:el('draw-label'),message:el('message'),undo:el('undo'),result:el('result'),resultText:el('result-text')};
let state, selected=null, history=[], started=Date.now(), timer=null;
function card(id,suit,rank,faceUp=false){return {id,suit,rank,color:red.has(suit)?'red':'black',faceUp};}
function clone(x){return JSON.parse(JSON.stringify(x));}
function snapshot(){return clone({tableau:state.tableau,stock:state.stock,waste:state.waste,foundations:state.foundations,moves:state.moves,ended:state.ended});}
function restore(s){Object.assign(state,clone(s));selected=null;render();}
function say(text){ui.message.textContent=text;}
function rank(c){return ranks.indexOf(c.rank)+1;}
function makeDeck(){const d=[];let id=0;for(const s of suits)for(const r of ranks)d.push(card(id++,s,r));for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d;}
function newGame(){const d=makeDeck();state={tableau:Array.from({length:7},()=>[]),stock:[],waste:[],foundations:{'♠':[],'♥':[],'♦':[],'♣':[]},moves:0,ended:false};let n=0;for(let col=0;col<7;col++){for(let row=0;row<=col;row++){const c=d[n++];c.faceUp=row===col;state.tableau[col].push(c)}}state.stock=d.slice(n);history=[];started=Date.now();ui.result.hidden=true;say('Wähle eine Karte und danach ihr Ziel.');render();}
function selectedCards(){if(!selected)return null;if(selected.zone==='tableau')return state.tableau[selected.col].slice(selected.index);if(selected.zone==='waste')return state.waste.length?[state.waste[state.waste.length-1]]:null;if(selected.zone==='foundation'){const f=state.foundations[selected.col];return f.length?[f[f.length-1]]:null;}return null;}
function validSequence(cards){if(!cards?.length||!cards[0].faceUp)return false;for(let i=1;i<cards.length;i++)if(!cards[i].faceUp||cards[i-1].color===cards[i].color||rank(cards[i-1])!==rank(cards[i])+1)return false;return true;}
function canTableau(cards,dest){if(!cards?.length)return false;const top=dest.length?dest[dest.length-1]:null;if(!validSequence(cards))return false;return top?top.faceUp&&top.color!==cards[0].color&&rank(top)===rank(cards[0])+1:rank(cards[0])===13;}
function canFoundation(c,s){const f=state.foundations[s];return c&&c.suit===s&&c.faceUp&&rank(c)===(f.length+1);}
function safeForAuto(c){if(!c||!canFoundation(c,c.suit))return false;const value=rank(c);if(value<=2)return true;const opposite=suits.filter(s=>red.has(s)!==red.has(c.suit));return opposite.every(s=>state.foundations[s].length>=value-1);}
function takeSelection(){const cards=selectedCards();if(!cards)return null;if(selected.zone==='tableau'){state.tableau[selected.col].splice(selected.index);const col=state.tableau[selected.col];if(col.length&&!col[col.length-1].faceUp)col[col.length-1].faceUp=true;}else if(selected.zone==='waste'){state.waste.pop();}else if(selected.zone==='foundation'){state.foundations[selected.col].pop();}return cards;}
function commit(before){history.push(before);state.moves++;selected=null;render();checkWin();}
function moveToTableau(col){const cards=selectedCards();if(!canTableau(cards,state.tableau[col])){say('Dieser Zug ist nicht erlaubt.');return false;}const before=snapshot();takeSelection().forEach(c=>state.tableau[col].push(c));commit(before);say('Sequenz verschoben.');return true;}
function moveToFoundation(s){const cards=selectedCards();if(!cards||cards.length!==1||!canFoundation(cards[0],s)){say('Nur die nächste Karte derselben Farbe darf auf die Foundation.');return false;}const before=snapshot();const c=takeSelection()[0];state.foundations[s].push(c);commit(before);say('Karte sicher auf Foundation gelegt.');return true;}
function choose(zone,index,col){if(state.ended)return;if(selected){if(zone==='foundation'){moveToFoundation(col);return}if(zone==='tableau'){if(moveToTableau(col))return;}if(selected.zone===zone&&selected.index===index&&selected.col===col){selected=null;render();return;}selected=null;render();say('Ziel nicht möglich. Wähle erneut eine gültige Karte.');return;}if(zone==='tableau'){const c=state.tableau[col][index];if(!c?.faceUp){say('Diese Karte ist noch verdeckt.');return}if(validSequence(state.tableau[col].slice(index))){selected={zone,index,col};render();say('Karte oder Sequenz gewählt – wähle ein Tableau oder eine Foundation.')}else say('Diese Karten bilden keine gültige Sequenz.');}else if(zone==='waste'&&state.waste.length){selected={zone:'waste',index:0};render();say('Waste-Karte gewählt – wähle ihr Ziel.');}else if(zone==='foundation'&&state.foundations[col].length){selected={zone:'foundation',index:0,col};render();say('Foundation-Karte gewählt – wähle ein gültiges Tableau-Ziel.');}}
function draw(){if(state.stock.length){history.push(snapshot());const count=Number(document.querySelector('input[name=draw]:checked').value);for(let i=0;i<count&&state.stock.length;i++)state.waste.push(state.stock.pop());state.moves++;selected=null;render();say('Karte(n) gezogen.');}else if(state.waste.length){history.push(snapshot());state.stock=state.waste.reverse();state.waste=[];state.moves++;render();say('Waste wurde in den Stock recycelt.');}else say('Stock und Waste sind leer.');}
function autoFoundation(){let moved=0,again=true;while(again){again=false;for(let col=0;col<7;col++){const a=state.tableau[col],c=a[a.length-1];if(c?.faceUp&&safeForAuto(c)){history.push(snapshot());a.pop();state.foundations[c.suit].push(c);state.moves++;if(a.length&&!a[a.length-1].faceUp)a[a.length-1].faceUp=true;moved++;again=true;break;}}if(!again&&state.waste.length){const c=state.waste[state.waste.length-1];if(safeForAuto(c)){history.push(snapshot());state.waste.pop();state.foundations[c.suit].push(c);state.moves++;moved++;again=true;}}}selected=null;render();checkWin();say(moved?`${moved} sichere Foundation-Züge ausgeführt.`:'Kein sicherer Foundation-Zug verfügbar.');}
function undo(){if(!history.length){say('Nichts rückgängig zu machen.');return}restore(history.pop());say('Letzten Zug rückgängig gemacht.');}
function checkWin(){const count=Object.values(state.foundations).reduce((n,f)=>n+f.length,0);if(count===52){state.ended=true;ui.resultText.textContent=`Gewonnen in ${state.moves} Zügen und ${ui.time.textContent}.`;ui.result.hidden=false;render();}}
function cardButton(c,zone,index,col){const b=document.createElement('button');b.type='button';b.className='card '+(c.color==='red'?'red ':'')+(c.faceUp?'':'face-down')+(selected&&selected.zone===zone&&selected.index===index&&selected.col===col?' selected':'');b.style.top=`${index*34}px`;b.dataset.focusKey=`card-${c.id}`;b.setAttribute('aria-label',c.faceUp?`${c.rank}${c.suit}, ${zone==='tableau'?'Tableau':'Karte'}`:'Verdeckte Karte');b.disabled=!c.faceUp;b.addEventListener('click',()=>choose(zone,index,col));if(c.faceUp){const r=document.createElement('span');r.className='rank';r.textContent=c.rank;const s=document.createElement('span');s.className='suit';s.textContent=c.suit;b.append(r,s)}return b;}
function render(){
const active=document.activeElement;
const focusKey=active&&(ui.tableau.contains(active)||ui.foundations.contains(active))?active.dataset.focusKey:'';
ui.moves.textContent=state.moves;
ui.stockCount.textContent=state.stock.length;
ui.draw.textContent=document.querySelector('input[name=draw]:checked').value;
const fc=Object.values(state.foundations).reduce((n,f)=>n+f.length,0);
ui.fcount.textContent=`${fc} / 52`;
ui.tableau.replaceChildren();
for(let col=0;col<7;col++){
const wrap=document.createElement('div');
const column=state.tableau[col];
wrap.className='column';
wrap.dataset.col=String(col);
wrap.dataset.focusKey=`column-${col}`;
wrap.setAttribute('aria-label',`Tableau-Spalte ${col+1}${column.length?'':', leer'}`);
if(column.length===0){wrap.tabIndex=0;wrap.setAttribute('role','button');}
if(selected)wrap.classList.add('target');
column.forEach((c,i)=>wrap.appendChild(cardButton(c,'tableau',i,col)));
wrap.addEventListener('click',e=>{if(e.target===wrap&&selected)moveToTableau(col)});
wrap.addEventListener('keydown',e=>{if(selected&&(e.key==='Enter'||e.key===' ')){e.preventDefault();moveToTableau(col)}});
ui.tableau.appendChild(wrap);
}
ui.foundations.replaceChildren();
for(const s of suits){
const f=state.foundations[s],b=document.createElement('button');
b.type='button';
b.dataset.focusKey=`foundation-${s}`;
b.className='foundation '+(red.has(s)?'red':'')+(selected&&selected.zone==='foundation'&&selected.col===s?' selected':'');
b.textContent=f.length?`${f[f.length-1].rank}${s}`:s;
b.setAttribute('aria-label',f.length?`Foundation ${s}, oberste Karte ${f[f.length-1].rank}${s}. Zum Zurücklegen ins Tableau auswählen.`:`Leere Foundation ${s}`);
b.addEventListener('click',()=>choose('foundation',0,s));
ui.foundations.appendChild(b);
}
if(state.waste.length){const c=state.waste[state.waste.length-1];ui.waste.className='pile '+(c.color==='red'?'red':'');ui.waste.textContent=`${c.rank}${c.suit}`;ui.waste.onclick=()=>choose('waste',0);}else{ui.waste.className='pile empty';ui.waste.textContent='';ui.waste.onclick=null}
ui.stock.disabled=state.ended;
ui.undo.disabled=!history.length;
if(focusKey)document.querySelector(`[data-focus-key="${focusKey}"]`)?.focus({preventScroll:true});
}
ui.stock.addEventListener('click',draw);ui.undo.addEventListener('click',undo);el('new-game').addEventListener('click',newGame);el('result-new').addEventListener('click',newGame);el('auto').addEventListener('click',autoFoundation);document.querySelectorAll('input[name=draw]').forEach(x=>x.addEventListener('change',()=>{ui.draw.textContent=x.value;render()}));document.addEventListener('keydown',e=>{if(e.target.matches('input'))return;if(e.key.toLowerCase()==='u')undo();if(e.key.toLowerCase()==='n')newGame();if(e.key.toLowerCase()==='a')autoFoundation();});timer=setInterval(()=>{if(!state?.ended){const sec=Math.floor((Date.now()-started)/1000);ui.time.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}},1000);newGame();
})();
