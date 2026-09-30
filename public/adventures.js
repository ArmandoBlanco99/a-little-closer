const titles=['Paper Plane Delivery','Lantern Trails','Bridge Maze','Our Constellation'];
const counts=[2,3,3,3];
const emoji={fox:'🦊',rabbit:'🐰',bear:'🐻',cat:'🐱'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current=null, sceneKey='', repeat=null, animation=null, transport=null, lastFrame=0, received=0;
const $=s=>document.querySelector(s);
const me=()=>current.players.findIndex(p=>p.id===current.me);
const allowed=()=>current?.phase==='playing'&&!current.paused&&!!$('#adventure-board');
const isPilot=()=>me()===current.adventure.pilot;
const isGunner=()=>!isPilot()||current.practice;
let inputBusy=false;
let trailView='own';
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
async function control(action,extra={}){
  if(!allowed()||inputBusy)return;
  inputBusy=true;
  try{await transport(action,extra);}finally{inputBusy=false;}
}
function stopInput(){clearInterval(repeat);repeat=null;if(allowed()&&current.adventure.kind==='plane'&&isPilot())transport('steer',{value:0});}
export function releaseAdventureInput(){stopInput();}
export function clearAdventure(){clearInterval(repeat);repeat=null;cancelAnimationFrame(animation);animation=null;current=null;sceneKey='';}
window.addEventListener('blur',stopInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopInput();});
window.addEventListener('keydown',e=>{
  if(!allowed()||document.querySelector('dialog[open]')||e.target.closest('input,textarea,select,button,[contenteditable]'))return;
  const directions={ArrowUp:'up',w:'up',ArrowDown:'down',s:'down',ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right'};
  if(current.adventure.kind==='plane'){
    if(['ArrowUp','ArrowDown','w','s'].includes(e.key)&&isPilot()){
      e.preventDefault();if(e.repeat)return;clearInterval(repeat);const value=['ArrowUp','w'].includes(e.key)?-1:1;
      control('steer',{value});repeat=setInterval(()=>control('steer',{value}),200);
    }else if(e.code==='Space'&&isGunner()){e.preventDefault();control('fire');}
    else if(e.key.toLowerCase()==='e'&&isGunner()){e.preventDefault();control('shield');}
  }else if(directions[e.key]){e.preventDefault();if(!e.repeat)control('move',{direction:directions[e.key]});}
});
window.addEventListener('keyup',e=>{if(['ArrowUp','ArrowDown','w','s'].includes(e.key)&&current?.adventure.kind==='plane')stopInput();});

function directions(){return `<div class="direction-pad" aria-label="Movement controls">${[['up','↑'],['left','←'],['down','↓'],['right','→']].map(([dir,icon])=>`<button data-move="${dir}" aria-label="Move ${dir}">${icon}</button>`).join('')}</div>`;}
function leverIcon(){return '<svg class="lever-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M8 20v-4h8v4M12 16l5-10"/><circle cx="18" cy="4" r="3"/></svg>';}
function mount(s,el,send){
  const a=s.adventure,idx=me();
  if(a.kind==='stars'&&a.complete){
    const used=new Set(a.threads.flat());
    el.innerHTML=`<div class="constellation-reveal"><div class="eyebrow">Constellation ${s.step+1} of 3 · complete</div><h2>${esc(a.name)}</h2><p>You brought this little piece of the sky to life, together.</p><div id="adventure-board" class="adventure-board stars"><div class="star-chart completed-chart"><svg viewBox="0 0 500 375" role="img" aria-label="Completed constellation: ${esc(a.name)}"><g class="completed-threads">${a.threads.map(([i,j])=>`<path d="M${a.points[i]}L${a.points[j]}"/>`).join('')}</g>${a.points.map(([x,y],i)=>`<circle class="${used.has(i)?'completed-star':'quiet-star'}" cx="${x}" cy="${y}" r="${used.has(i)?6:2}"/>`).join('')}</svg></div></div><p id="adventure-status" class="adventure-status" role="status"></p><button class="primary wide" id="continue-stars">${s.step===2?'Celebrate our journey':'Continue together'}</button></div>`;
    $('#continue-stars').onclick=()=>control('continue_stars');
    return;
  }
  const role=a.kind==='plane'?(isPilot()?'You steer':'You fire & shield'):a.kind==='stars'?(idx===0?'First endpoint':'Second endpoint'):'You move your companion';
  const descriptions={
    plane:'A letter, a little courage, and two pairs of hands. Dodge clouds, clear rocky obstacles, and collect at least three golden stamps to seal your letter. '+(s.practice?'You pilot both practice flights with an automatic copilot.':'You swap jobs on the next flight.'),
    garden:'Your trail is hidden, but your partner can read its map. Describe turns to each other. Walk onto a lantern switch to open your partner’s gate.',
    bridge:'One holds the pressure plate; the other crosses to the matching lever. The lever keeps the gate open so your partner can follow. Bring both companions to the flag.',
    stars:'A constellation is hiding here. Your private clue describes your partner’s endpoint. Trade clues, choose your own star, and build the drawing one thread at a time.'
  };
  el.innerHTML=`<div class="puzzle-head"><div><div class="eyebrow">Chapter ${s.stage+1} · ${s.step+1} of ${counts[s.stage]}</div><h2>${titles[s.stage]}</h2></div><span class="role">${role}</span></div><p>${descriptions[a.kind]}</p><div id="adventure-board" class="adventure-board ${a.kind}" tabindex="0" aria-label="${titles[s.stage]} game board"></div><div id="adventure-status" class="adventure-status" role="status"></div><div id="adventure-controls" class="adventure-controls"></div><div id="adventure-feedback" class="feedback" role="status" hidden></div><div class="adventure-bottom"><p class="hint">${s.practice?'Practice: your copilot fires and shields automatically. You can also try those controls.':'No lives to lose. Your completed puzzles stay saved.'}</p><button class="quiet-link" id="retry-adventure">Restart this ${a.kind==='plane'?'flight':'puzzle'}</button></div>`;
  $('#retry-adventure').onclick=()=>{if(confirm('Restart this puzzle? Earlier completed puzzles stay saved.')){stopInput();send('retry');}};
  if(a.kind==='plane'){
    $('#adventure-board').innerHTML='<canvas id="flight-canvas" width="720" height="400" aria-label="Paper plane flight: dodge clouds and rocks; collect golden stamps"></canvas>';
    $('#adventure-controls').innerHTML=`${isPilot()?'<button class="primary" id="launch-flight">Launch our letter</button><button class="flight-key" data-steer="-1" aria-label="Steer up">↑ Up</button><button class="flight-key" data-steer="1" aria-label="Steer down">↓ Down</button>':''}${isGunner()?'<button class="gold flight-key" id="fire-pellet">✧ Fire</button><button class="quiet" id="flight-shield">◌ Shield</button>':''}<p class="hint control-help">${isPilot()?'Hold ↑ / ↓ or W / S to steer. ':''}${isGunner()?'Space fires · E shields. ':''}Clouds need dodging or a shield; pellets clear rocks. Focus the board for keyboard play.</p>`;
    if($('#launch-flight'))$('#launch-flight').onclick=()=>{send('launch');$('#adventure-board').focus({preventScroll:true});};
    document.querySelectorAll('[data-steer]').forEach(b=>{
      const begin=()=>{clearInterval(repeat);const value=Number(b.dataset.steer);control('steer',{value});repeat=setInterval(()=>control('steer',{value}),200);};
      b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);begin();};
      b.onpointerup=b.onpointercancel=b.onlostpointercapture=stopInput;
      b.onkeydown=e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();if(!e.repeat)begin();}};
      b.onkeyup=b.onblur=stopInput;
    });
    if($('#fire-pellet')){
      const b=$('#fire-pellet');b.onclick=()=>control('fire');
      b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);control('fire');repeat=setInterval(()=>control('fire'),300);};
      b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>{clearInterval(repeat);repeat=null;};
      $('#flight-shield').onclick=()=>control('shield');
    }
    const loop=t=>{if(!$('#flight-canvas'))return;if(t-lastFrame>15){drawFlight(t);lastFrame=t;}animation=requestAnimationFrame(loop);};
    animation=requestAnimationFrame(loop);
  }else if(a.kind==='garden'||a.kind==='bridge'){
    $('#adventure-controls').innerHTML=directions()+(a.bridge?'<button class="quiet" id="turn-bridge">↻ Turn bridge</button>':'')+'<p class="hint">Arrow keys / WASD or tap a direction. Focus the board for keyboard play.</p>';
    document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>control('move',{direction:b.dataset.move}));
    if($('#turn-bridge'))$('#turn-bridge').onclick=()=>control('turn_bridge');
  }
}

export function renderAdventure(s,el,send){
  const key=[s.code,s.stage,s.step,s.epoch].join(':');
  if(key!==sceneKey||!$('#adventure-board')){
    clearAdventure();current=s;transport=send;sceneKey=key;mount(s,el,send);
  }else current=s;
  received=performance.now();
  const a=s.adventure,idx=me();
  if(a.kind==='stars'&&a.complete){
    $('#continue-stars').disabled=a.continued[idx];
    $('#continue-stars').textContent=a.continued[idx]?'Waiting for your partner…':s.step===2?'Celebrate our journey':'Continue together';
    $('#adventure-status').textContent=a.continued[1-idx]?'Your partner is ready when you are.':'Take a moment to enjoy it. Continue when you’re both ready.';
    return;
  }
  if(a.kind==='plane'){
    if($('#launch-flight'))$('#launch-flight').hidden=a.running;
    document.querySelectorAll('[data-steer],#fire-pellet').forEach(b=>b.disabled=!a.running);
    if($('#flight-shield')){$('#flight-shield').disabled=!a.running||a.shield_wait>0;$('#flight-shield').textContent=a.shield>0?'Shield active':a.shield_wait>0?`Shield in ${Math.ceil(a.shield_wait)}s`:'◌ Shield';}
    $('#adventure-status').textContent=a.running?`${Math.min(100,Math.floor(a.x/a.length*100))}% flown · ${a.stamps.filter(x=>x.got).length}/5 stamps (need 3)`:(isPilot()?'Ready when you are. Launch to begin.':'Waiting for your pilot to launch.');
  }else if(a.kind==='garden'){
    const other=1-idx,focusedTrail=document.activeElement?.dataset.trail;
    $('#adventure-board').innerHTML=`<div class="trail-charts"><section><h3>Your trail <span>${emoji[s.players[idx].avatar]}</span></h3>${gardenGrid(a,idx,false,s)}<p class="hint">Mist hides the safe stepping stones. Ask your partner.</p></section><section><h3>Your partner’s map <span>${emoji[s.players[other].avatar]}</span></h3>${gardenGrid(a,other,true,s)}<p class="hint">Describe this route to ${esc(s.players[other].name)}. Up is always up.</p></section></div><div class="board-legend">▣ switch lantern · ▥ gate · ✦ firefly · ⚑ meeting point</div>`;
    const charts=$('.trail-charts');charts.dataset.view=trailView;
    charts.insertAdjacentHTML('beforebegin',`<div class="trail-tabs" role="group" aria-label="Choose a trail map"><button data-trail="own" aria-pressed="${trailView==='own'}">My trail</button><button data-trail="partner" aria-pressed="${trailView==='partner'}">Partner’s map</button></div>`);
    document.querySelectorAll('[data-trail]').forEach(b=>b.onclick=()=>{trailView=b.dataset.trail;charts.dataset.view=trailView;document.querySelectorAll('[data-trail]').forEach(t=>t.setAttribute('aria-pressed',String(t.dataset.trail===trailView)));});
    if(focusedTrail)$(`[data-trail="${focusedTrail}"]`)?.focus({preventScroll:true});
    $('#adventure-status').textContent=s.step===0?'Find your way to both meeting points.':`Your switch: ${a.lit[idx]?'lit':'unlit'} · Partner’s switch: ${a.lit[other]?'lit':'unlit'}${s.step===2?` · Your fireflies: ${a.collected[idx].length}/2`:''}`;
  }else if(a.kind==='bridge'){
    $('#adventure-board').innerHTML=bridgeGrid(a,s)+`<div class="board-legend">◉ pressure plate · ▥ gate · ${leverIcon()} lever · ↔ rotating bridge · ⚑ exit</div>`;
    $('#adventure-status').textContent=`Gates latched open: ${a.opened.join(', ')||'none yet'}${a.bridge?` · Bridge: ${a.horizontal?'across':'turned away'}`:''}`;
  }else{
    const lastFocus=document.activeElement?.dataset.star;
    $('#adventure-board').innerHTML=`<div class="clue"><div class="clue-title">TELL YOUR PARTNER</div><strong>Choose ${esc(a.clue)}.</strong></div><div class="star-chart"><svg viewBox="0 0 500 375" aria-hidden="true">${a.threads.map(([i,j])=>`<path d="M${a.points[i]}L${a.points[j]}"/>`).join('')}</svg>${a.points.map(([x,y],i)=>`<button class="chart-star ${a.selected===i?'chosen':''}" style="left:${x/5}%;top:${y/3.75}%" data-star="${i}" aria-pressed="${a.selected===i}" aria-label="Select ${a.names[i]}"><span>✦</span>${a.names[i]}</button>`).join('')}</div>`;
    document.querySelectorAll('[data-star]').forEach(b=>b.onclick=()=>control('star',{value:Number(b.dataset.star)}));
    if(lastFocus!==undefined)$(`[data-star="${lastFocus}"]`)?.focus({preventScroll:true});
    $('#adventure-status').textContent=`Thread ${a.edge+1} of ${a.total} · ${a.selected!=null?'Your endpoint is set.':'Choose the star your partner describes.'} ${a.partner_selected?'Your partner has chosen.':''}`;
  }
  const feedback=$('#adventure-feedback');feedback.hidden=!s.feedback;feedback.textContent=s.feedback;
}

function gardenGrid(a,player,chart,s){
  const key=c=>c.join(','),same=(x,y)=>x&&y&&key(x)===key(y);
  const layout=chart?a.partner_chart:{gate:a.gate,switch:a.switch,lights:a.lights};
  const safe=new Set(chart?layout.path.map(key):a.visited);
  return `<div class="tile-board garden-grid" role="img" aria-label="${chart?'Partner route chart':'Your misty garden'}">${Array.from({length:49},(_,j)=>{
    const c=[j%7,Math.floor(j/7)],k=key(c),pos=same(c,a.positions[player]);
    let type=safe.has(k)?'path':chart?'hedge':'mist',mark='';
    if(same(c,layout.switch)){mark='▣';type+=' switch '+(a.lit[player]?'active':'');}
    if(same(c,layout.gate)){mark='▥';type+=' gate '+(a.lit[1-player]?'active':'');}
    if(layout.lights.some(l=>same(l,c))&&!a.collected[player].includes(k))mark='✦';
    if(same(c,[6,3]))mark='⚑';
    return `<div class="board-cell ${type}" title="Column ${c[0]+1}, row ${c[1]+1}">${pos?`<span class="pawn">${emoji[s.players[player].avatar]}</span>`:mark||(!chart&&!safe.has(k)?'·':'')}</div>`;
  }).join('')}</div>`;
}
function bridgeGrid(a,s){
  const same=(x,y)=>x&&y&&x.join(',')===y.join(',');
  return `<div class="tile-board bridge-grid" role="img" aria-label="Shared bridge maze">${Array.from({length:63},(_,j)=>{
    const c=[j%9,Math.floor(j/9)],walk=a.cells.some(p=>same(p,c));let type=walk?'island':'water',mark='';
    for(const g of a.gates){
      const open=a.opened.includes(g.label)||a.positions.some(p=>same(p,g.plate));
      if(same(c,g.cell)){type+=' gate '+(open?'active':'');mark=`▥${g.label}`;}
      if(same(c,g.plate)){type+=' plate '+(open?'active':'');mark=`◉${g.label}`;}
      if(same(c,g.lever)){type+=' lever';mark=`${leverIcon()}<span>${g.label}</span>`;}
    }
    if(same(c,a.bridge)){type+=' rotating';mark=a.horizontal?'↔':'↕';}
    if(same(c,a.exit)){type+=' exit';mark='⚑';}
    const pawns=a.positions.map((p,i)=>same(p,c)?`<span class="pawn ${s.me===s.players[i].id?'mine':''}">${emoji[s.players[i].avatar]}</span>`:'').join('');
    return `<div class="board-cell ${type}" title="Column ${c[0]+1}, row ${c[1]+1}">${pawns||mark}</div>`;
  }).join('')}</div>`;
}

function drawFlight(now){
  const canvas=$('#flight-canvas');if(!canvas||!current)return;
  const a=current.adventure,g=canvas.getContext('2d');
  const delta=a.running?Math.min(.12,(now-received)/1000):0,x=a.x+delta*(current.relaxed?48:66),screenX=v=>v-x+120;
  const sceneryX=reducedMotion.matches?0:x,decorativeTime=reducedMotion.matches?0:now;
  const gradient=g.createLinearGradient(0,0,0,400);gradient.addColorStop(0,'#19354e');gradient.addColorStop(1,'#d6a28a');g.fillStyle=gradient;g.fillRect(0,0,720,400);
  g.fillStyle='#ffdfac';g.beginPath();g.arc(605-sceneryX*.025,75,29,0,Math.PI*2);g.fill();
  for(let layer=0;layer<3;layer++){
    g.fillStyle=['#7b8996','#506d7a','#2d535f'][layer];g.beginPath();g.moveTo(0,400);
    for(let j=0;j<=740;j+=10){const y=310+layer*27+Math.sin((j+sceneryX*(.1+layer*.08))/95+layer)*25;g.lineTo(j,y);}g.lineTo(740,400);g.fill();
  }
  g.strokeStyle='#ffffff22';g.lineWidth=2;
  for(let j=0;j<8;j++){const px=((j*117-sceneryX*.7)%820+820)%820;g.beginPath();g.moveTo(px,60+j%4*75);g.lineTo(px+30,60+j%4*75);g.stroke();}
  for(const s of a.stamps){if(s.got)continue;const px=screenX(s.x);if(px < -30||px>750)continue;g.save();g.translate(px,s.y);g.rotate(Math.sin(decorativeTime/700)*.12);g.fillStyle='#ffda88';g.fillRect(-14,-18,28,36);g.strokeStyle='#a07140';g.strokeRect(-10,-14,20,28);g.fillStyle='#935a42';g.font='21px Georgia';g.textAlign='center';g.fillText('✦',0,8);g.restore();}
  for(const o of a.objects){if(o.gone)continue;const px=screenX(o.x);if(px < -70||px>790)continue;
    if(o.kind==='cloud'){g.fillStyle='#e6dfd4';g.beginPath();g.ellipse(px,o.y,49,24,0,0,Math.PI*2);g.fill();g.beginPath();g.arc(px-12,o.y-15,25,0,Math.PI*2);g.arc(px+18,o.y-9,20,0,Math.PI*2);g.fill();}
    else{g.fillStyle='#64737d';g.strokeStyle='#b6b7b0';g.lineWidth=2;g.beginPath();for(let j=0;j<7;j++){const angle=j/7*Math.PI*2,r=j%2?27:33;const xx=px+Math.cos(angle)*r,yy=o.y+Math.sin(angle)*r;j?g.lineTo(xx,yy):g.moveTo(xx,yy);}g.closePath();g.fill();g.stroke();}
  }
  g.fillStyle='#fff4d7';for(const b of a.bullets){g.beginPath();g.ellipse(screenX(b.x)+delta*360,b.y,8,3,0,0,Math.PI*2);g.fill();}
  if(a.shield>0){g.fillStyle='#bfece42e';g.strokeStyle='#c7fff0';g.lineWidth=3;g.beginPath();g.arc(120,a.y,43,0,Math.PI*2);g.fill();g.stroke();}
  g.save();g.translate(120,a.y);if(a.immune)g.globalAlpha=reducedMotion.matches ? .65 : .55+.3*Math.sin(now/65);
  g.shadowColor='#132b44';g.shadowBlur=10;g.fillStyle='#fff5db';g.beginPath();g.moveTo(39,0);g.lineTo(-29,-19);g.lineTo(-17,1);g.lineTo(-29,20);g.closePath();g.fill();g.shadowBlur=0;
  g.strokeStyle='#ba9a7c';g.lineWidth=1.5;g.beginPath();g.moveTo(39,0);g.lineTo(-17,1);g.lineTo(-7,14);g.stroke();g.restore();
  const finish=screenX(a.length);if(finish<760){g.fillStyle='#ffe0a3';g.fillRect(finish,0,3,400);g.font='34px sans-serif';g.fillText('✉',finish+15,205);}
  if(!a.running){g.fillStyle='#102d46a6';g.fillRect(0,0,720,400);g.fillStyle='#fff4d7';g.textAlign='center';g.font='32px Georgia';g.fillText('A letter worth the journey.',360,180);g.font='16px sans-serif';g.fillText('Pilot steers · Copilot clears the way',360,217);}
}
