import { gameRequest, subscribe } from './transport.js';
import { cities } from './cities.js';
import { renderAdventure, clearAdventure, releaseAdventureInput } from './adventures.js';
import { setupMobileUI, closeMobileUI, incomingMessages } from './mobile-ui.js';
import { journeyMap, bindMaps, setGeography, drawPostcardMap } from './journey-map.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const avatars = {fox:'🦊',rabbit:'🐰',bear:'🐻',cat:'🐱'};
const icons = {Sun:'☀',Moon:'☾',Leaf:'❧',Heart:'♡',Flower:'✿',Cloud:'☁',Plank:'━',Arch:'⌒',Rope:'〰'};
const revisedNames = ['Paper Plane Delivery','Lantern Trails','Bridge Maze','Our Constellation'];
let names = revisedNames;
const stamps = ['💌','🏮','🌉','✨'];
const starNames = ['Luna','Nova','Sol','Vega','Lyra','Orion'];
let session = null, state = null, stream = null, mode = 'create', selectedAvatar = 'fox';
let world = null, miles = false, connected = false, sound = false, audio = null;
let holdTimer = null, holding = false, holdEpoch = 0, toastTimer = null;
let mapExpanded = false;
let lastPuzzle = '', lastMap = '', lastPeople = '', lastMessages = '', queue = Promise.resolve();
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4200);}
function chime(){if(!sound)return; try{audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume();[523,659,784].forEach((freq,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=freq;g.gain.setValueAtTime(0,audio.currentTime+i*.12);g.gain.linearRampToValueAtTime(.045,audio.currentTime+i*.12+.02);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+i*.12+.5);o.start(audio.currentTime+i*.12);o.stop(audio.currentTime+i*.12+.5);});}catch{}}
$('#sound').onclick=()=>{sound=!sound;$('#sound').textContent=sound?'Sound on':'Sound off';$('#sound').setAttribute('aria-pressed',String(sound));if(sound)chime();};
function reactCouple(){const couple=$('.couple');if(couple){couple.classList.remove('reacting');void couple.offsetWidth;couple.classList.add('reacting');}}
function burst(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<14;i++){const e=document.createElement('span');e.className='particle';e.textContent=['♥','✦','✧'][i%3];e.style.left=(10+Math.random()*80)+'%';e.style.color=['#e7a795','#e6ba55','#547d66'][i%3];e.style.animationDelay=(Math.random()*.25)+'s';$('#particles').append(e);setTimeout(()=>e.remove(),2500);}}
function fmt(km){return new Intl.NumberFormat(undefined,{maximumFractionDigits:km<1?1:0}).format(miles?km*.621371:km)+(miles?' mi':' km');}
function completed(s=state){return s.phase==='victory'?4:s.stage+(s.phase==='checkpoint'?1:0);}
function mapSvg(players,progress=0){return journeyMap(players,progress,avatars);}
fetch('/world.geojson').then(r=>r.json()).then(data=>{world=data;setGeography(data);lastMap='';if(state)renderState();else if($('#intro-map'))$('#intro-map').innerHTML=mapSvg([{lat:19.4326,lon:-99.1332,avatar:'fox',city:'Mexico City'},{lat:40.4168,lon:-3.7038,avatar:'rabbit',city:'Madrid'}]);bindMaps();}).catch(()=>toast('Map artwork is unavailable; distance and games still work.'));

function renderSetup(){
  app.innerHTML=`<section class="setup"><div class="intro"><div><div class="eyebrow">Different cities. Same little adventure.</div><h1>A world between you.<br>A little closer,<br>together.</h1><p>Trade clues, light the way, and turn the miles into a memory for two.</p></div><div id="intro-map">${mapSvg([{lat:19.4326,lon:-99.1332,avatar:'fox',city:'Mexico City'},{lat:40.4168,lon:-3.7038,avatar:'rabbit',city:'Madrid'}])}</div><div class="intro-bottom"><div><strong>2 players</strong>One shared journey</div><div><strong>4 chapters</strong>No rush. No lives.</div><div><strong>1 keepsake</strong>A moment to save</div></div></div><div class="setup-form"><div class="tabs" aria-label="Room setup"><button id="create-tab" class="${mode==='create'?'active':''}">Create a room</button><button id="join-tab" class="${mode==='join'?'active':''}">Join a room</button></div><h2>${mode==='create'?'Your journey starts here.':'Someone is waiting for you.'}</h2><form id="setup-form">${mode==='join'?'<label class="field">Room code<input id="room-code" class="code-input" maxlength="6" minlength="6" placeholder="ABC123" required autocomplete="off"></label>':''}<label class="field">Your name<input id="name" maxlength="28" placeholder="What should we call you?" required autocomplete="given-name"></label><label class="field">Your city<input id="city" list="cities" placeholder="Start typing a city…" required autocomplete="off"><datalist id="cities">${cities.map(c=>`<option value="${esc(c[0])}"></option>`).join('')}</datalist></label><details class="custom-location"><summary>My city isn’t listed</summary><p class="hint">Keep your city name above and enter its approximate city-center coordinates.</p><div class="coordinates"><label class="field">Latitude<input id="lat" type="number" min="-90" max="90" step="any" placeholder="19.4326"></label><label class="field">Longitude<input id="lon" type="number" min="-180" max="180" step="any" placeholder="-99.1332"></label></div></details><label class="field">Your travel companion</label><div class="avatar-options" role="group" aria-label="Choose an avatar">${Object.entries(avatars).map(([key,emoji])=>`<button type="button" data-avatar="${key}" aria-label="${key}" aria-pressed="${key===selectedAvatar}" class="${key===selectedAvatar?'selected':''}">${emoji}</button>`).join('')}</div><div id="setup-error" role="alert"></div><button type="submit" class="primary wide">${mode==='create'?'Create our room':'Join the journey'}</button></form><p class="hint">No account needed. Use a voice call or the in-game chat to share your clues.</p><button type="button" class="quiet wide" id="practice-plane">Try Paper Plane solo</button><div class="local-note">Local testing: open a second browser tab to play both roles. Each tab keeps its own player seat.</div></div></section>`;
  bindMaps();
  $('#practice-plane').onclick=async()=>{try{session=await request('create',{name:$('#name').value.trim()||'You',city:'Mexico City, Mexico',lat:19.4326,lon:-99.1332,avatar:selectedAvatar,practice:true});sessionStorage.setItem('closer-session',JSON.stringify(session));connect();}catch(e){toast(e.message);}};
  $('#create-tab').onclick=()=>{mode='create';renderSetup();};$('#join-tab').onclick=()=>{mode='join';renderSetup();};
  document.querySelectorAll('[data-avatar]').forEach(b=>b.onclick=()=>{selectedAvatar=b.dataset.avatar;document.querySelectorAll('[data-avatar]').forEach(e=>{e.classList.toggle('selected',e.dataset.avatar===selectedAvatar);e.setAttribute('aria-pressed',String(e.dataset.avatar===selectedAvatar));});});
  $('#setup-form').onsubmit=async e=>{
    e.preventDefault();const btn=e.submitter;btn.disabled=true;$('#setup-error').innerHTML='';
    try{
      const city=$('#city').value.trim();const match=cities.find(c=>c[0].toLowerCase()===city.toLowerCase());
      let lat,lon;if(match){[,lat,lon]=match;}else{if(!$('#lat').value||!$('#lon').value)throw Error('Select a city from the list, or open “My city isn’t listed” and enter its coordinates.');lat=Number($('#lat').value);lon=Number($('#lon').value);}
      session=await request(mode,{name:$('#name').value,city:match?match[0]:city,lat,lon,avatar:selectedAvatar,code:$('#room-code')?.value});
      sessionStorage.setItem('closer-session',JSON.stringify(session));connect();
    }catch(err){$('#setup-error').innerHTML=`<div class="error">${esc(err.message)}</div>`;btn.disabled=false;}
  };
}
async function request(op,body,auth=false){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);try{return await gameRequest(op,body,auth?session:null,{signal:controller.signal});}catch(e){if(e.name==='AbortError')throw Error('The server did not respond. Your saved progress is safe; try again.');throw e;}finally{clearTimeout(timer);}}
function send(action,extra={}){
  const d={code:session.code,action,id:id(),epoch:state?.epoch,...extra};
  const run=async()=>{try{const result=await request('action',d,true);accept(result);return true;}catch(e){if(action!=='hold'&&action!=='release')toast(e.message);return false;}};
  queue=queue.then(run,run);return queue;
}
function connect(){
  closeMobileUI();clearAdventure();stream?.close();state=null;lastPuzzle=lastMap=lastPeople=lastMessages='';
  app.innerHTML='<div class="card"><h2>Finding your little journey…</h2><p class="note">Connecting to your room.</p><button class="quiet" id="reset-connection">Return to setup</button></div>';
  $('#reset-connection').onclick=leave;
  stream=subscribe(session);
  stream.onopen=()=>{connected=true;updateConnection();};
  stream.onmessage=e=>{connected=true;accept(JSON.parse(e.data));};
  stream.onerror=()=>{connected=false;endHold();clearAdventure();updateConnection();if(!state&&$('#reset-connection')){const note=$('.note');if(note)note.textContent='Cannot reach this room. Check that the server is running, or return to setup if the room expired.';}};
}
// A cached history entry must not keep an absent player online.
window.addEventListener('pagehide',()=>{endHold();clearAdventure();stream?.close();});
window.addEventListener('pageshow',e=>{if(e.persisted&&session)connect();});
function leave(){if(!confirm('Return to setup? Your room stays saved, but this tab will forget its player seat.'))return;closeMobileUI();clearAdventure();stream?.close();endHold();sessionStorage.removeItem('closer-session');session=null;state=null;renderSetup();}
function accept(s){if(state&&s.version<state.version)return;const old=state;state=s;names=s.edition===2?revisedNames:['Postcards, Please','Lantern Duet','The Little Bridge','Our Constellation'];if(old&&(old.epoch!==s.epoch||s.paused||s.phase!=='playing'))endHold(false);if(!$('#game-shell'))shell();if(old&&(completed(s)>completed(old)||s.step>old.step||(s.constellations?.length||0)>(old.constellations?.length||0))){chime();if(s.phase==='victory')burst();}renderState();}
function shell(){
  app.innerHTML=`<div id="game-shell"><div class="roombar"><div class="left"><span class="room-label">Our room</span><button class="quiet code" id="copy-code">${esc(session.code)}</button><span class="status" id="network-status">Connected</span></div><div class="row"><button class="quiet" id="pause">Pause</button><button class="quiet-link" id="leave">Exit</button></div></div><div id="connection-banner"></div><div class="game-layout"><div><section class="journey" id="journey"></section><section class="puzzle" id="puzzle" aria-live="polite"></section></div><aside class="sidebar"><section class="card" id="people"></section><div id="chat-home"><section class="card chat" id="chat-panel"><h3>A little conversation</h3><p class="note">On a call? Share your clues out loud. Otherwise, leave them here.</p><div class="chat-log" id="chat-log" role="log" aria-live="polite"></div><div class="quick"><button data-chat="Ready!">Ready!</button><button data-chat="Again?">Again?</button><button data-chat="Your turn ♥">Your turn ♥</button></div><form class="chat-form" id="chat-form"><input id="chat-input" maxlength="240" aria-label="Message your partner" placeholder="A clue, a little hello…"><button class="primary" aria-label="Send message">Send</button></form></section></div></aside></div><button id="chat-toggle" class="chat-toggle" aria-controls="mobile-chat" aria-expanded="false">Chat</button><dialog id="mobile-chat" class="chat-dialog" aria-labelledby="mobile-chat-title"><div class="chat-dialog-heading"><h2 id="mobile-chat-title">A little conversation</h2><button id="close-chat" class="quiet" aria-label="Close chat">Close</button></div></dialog></div>`;
  setupMobileUI(()=>{endHold();releaseAdventureInput();});
  $('#pause').onclick=()=>send('pause');$('#leave').onclick=leave;
  $('#copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(session.code);toast('Room code copied.');}catch{toast('Your room code: '+session.code);}};
  document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>send('chat',{text:b.dataset.chat}));
  $('#chat-form').onsubmit=async e=>{e.preventDefault();const input=$('#chat-input'),text=input.value.trim();if(!text)return;input.value='';if(!await send('chat',{text})){if(!input.value)input.value=text;}};
}
function updateConnection(){if(!$('#network-status'))return;$('#network-status').textContent=connected?'Connected · live':'Reconnecting…';$('#connection-banner').innerHTML=connected?'':'<div class="connected-banner">Reconnecting to your room. Your completed objectives are saved.</div>';}
function renderState(){
  if(!state||!$('#game-shell'))return;
  updateConnection();$('#game-shell').classList.toggle('is-playing',state.phase==='playing');const s=state,me=s.players.find(p=>p.id===s.me);
  $('#pause').hidden=s.phase!=='playing'||s.paused;
  const mk=JSON.stringify([s.phase,s.stage,s.players.map(p=>[p.name,p.city,p.lat,p.lon,p.avatar]),miles]);
  if(mk!==lastMap){lastMap=mk;const remaining=s.distance*(1-completed()/4);$('#journey').innerHTML=`<div class="journey-top"><div><div class="eyebrow">${s.phase==='victory'?'You made it':'Our little journey'}</div><h2>${s.players.length<2?'Waiting for your person':s.distance<.01?'Already close, still an adventure':fmt(remaining)+' to go'}</h2><small>${s.players.length<2?'Share your room code to meet here.':`${fmt(s.distance)} between your cities · ${completed()}/4 stamps collected`}</small></div><button class="quiet" id="units">${miles?'mi → km':'km → mi'}</button></div><button class="map-toggle quiet" id="map-toggle" aria-expanded="${mapExpanded}">${mapExpanded?'Hide map':'Explore our map'}</button>${mapSvg(s.players,completed()/4)}<div class="stamps">${names.map((n,i)=>`<div class="stamp ${i<completed()?'done':i===s.stage?'current':''}"><span>${i<completed()?'✓':stamps[i]}</span>${(s.edition===2?['Paper plane','Lantern trails','Bridge maze','Our stars']:['Postcards','Lanterns','The bridge','Our stars'])[i]}</div>`).join('')}</div>`;$('#units').onclick=()=>{miles=!miles;renderState();};$('#map-toggle').onclick=()=>{mapExpanded=!mapExpanded;$('#journey').classList.toggle('map-expanded',mapExpanded);$('#map-toggle').setAttribute('aria-expanded',String(mapExpanded));$('#map-toggle').textContent=mapExpanded?'Hide map':'Explore our map';};$('#journey').classList.toggle('map-expanded',mapExpanded);bindMaps();}
  const pk=JSON.stringify(s.players);
  if(pk!==lastPeople){lastPeople=pk;$('#people').innerHTML=`<h3>Two seats. One adventure.</h3><div class="people">${s.players.map(p=>`<div class="person"><div class="emoji">${avatars[p.avatar]}</div><div><h3>${esc(p.name)} ${p.id===s.me?'· you':''}</h3><p>${esc(p.city)}</p><div class="connection">${p.online?'Here with you':'Reconnecting…'}${p.ready?' · Ready':''}</div></div></div>`).join('')}${s.players.length<2?'<div class="person"><div class="emoji">♡</div><div><h3>A seat for your person</h3><p>Waiting for them to join…</p></div></div>':''}</div><p class="note">Both of you bring something the other needs. Take your time.</p>`;}
  const messages=JSON.stringify(s.messages);if(messages!==lastMessages){const before=lastMessages;incomingMessages(before,s.messages,s.me);lastMessages=messages;const log=$('#chat-log');log.innerHTML=s.messages.length?s.messages.map(m=>`<div class="message"><b>${esc(m.name)}</b>${esc(m.text)}</div>`).join(''):'<p class="note">Your shared conversation starts here.</p>';log.scrollTop=log.scrollHeight;if(before&&s.messages.at(-1)?.text==='♥'){burst();reactCouple();}}
  const myIndex=s.players.findIndex(p=>p.id===s.me);
  const puzzleKey=JSON.stringify([s.phase,s.stage,s.step,s.epoch,s.paused,s.relaxed,s.clue,s.placed,s.feedback,s.selection[String(myIndex)],me.ready,s.players.length]);
  if(s.edition===2&&s.phase==='playing'&&!s.paused){renderAdventure(s,$('#puzzle'),send);lastPuzzle='';}
  else {clearAdventure();if(puzzleKey!==lastPuzzle){lastPuzzle=puzzleKey;if(holding)endHold();renderPuzzle();}}
  updateLanternControls();
  document.querySelectorAll('[data-holding]').forEach(e=>e.classList.toggle('lit',!!s.holding[Number(e.dataset.holding)]));
}
function slots(values,total){return `<div class="slots">${Array.from({length:total},(_,i)=>`<div class="slot"><b>${icons[values[i]]||'·'}</b>${esc(values[i]||String(i+1))}</div>`).join('')}</div>`;}
function tile(value,selected=false,star=false){return `<button class="tile ${selected?'selected':''}" data-choice="${esc(value)}" aria-pressed="${selected}"><span class="symbol">${star?'✦':icons[value]}</span>${esc(value)}</button>`;}
function constellationSvg(threads=[]){const points=[[65,75],[150,25],[250,80],[345,30],[430,80],[255,145]];return `<svg viewBox="0 0 500 175" width="100%" role="img" aria-label="Your shared constellation, ${threads.length} threads connected">${threads.map(pair=>{const a=points[starNames.indexOf(pair[0])],b=points[starNames.indexOf(pair[1])];return a&&b?`<path d="M${a}L${b}" fill="none" stroke="#ffda92" stroke-width="2"/>`:'';}).join('')}${points.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="5" fill="#fff2d1"/><text x="${x}" y="${y+20}" font-size="12" text-anchor="middle" fill="#f4dfb8">${starNames[i]}</text>`).join('')}</svg>`;}
function constellationKeepsakes(shapes=[]){
  return `<div class="constellation-keepsakes">${shapes.map(shape=>`<figure><svg viewBox="0 0 500 375" role="img" aria-label="${esc(shape.name)}">${shape.threads.map(([i,j])=>`<path d="M${shape.points[i]}L${shape.points[j]}"/>`).join('')}${shape.points.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="5"/>`).join('')}</svg><figcaption>${esc(shape.name)}</figcaption></figure>`).join('')}</div>`;
}
function renderPuzzle(){
  const s=state,me=s.players.find(p=>p.id===s.me),idx=s.players.findIndex(p=>p.id===s.me),el=$('#puzzle');
  if(s.phase==='practice_complete'){el.innerHTML='<div class="checkpoint"><div class="big">&#9992;</div><h2>Practice delivery complete!</h2><p>You flew both routes. Create a room with your partner to try all four chapters.</p><button class="primary wide" id="practice-exit">Back to setup</button></div>';$('#practice-exit').onclick=leave;return;}
  if(s.phase==='lobby'){
    el.innerHTML=`<div class="eyebrow">Before we set off</div><h2>A little time, just for you two.</h2><p>${s.players.length===2?'Your cities are on the map. When you’re both ready, your first postcard is waiting.':'Send your partner the room code above. For a solo test, open this address in another tab and join with the code.'}</p><p class="note">${s.practice?'Two practice flights with an automatic copilot':'Four chapters of movement, teamwork, and discovery'}</p><label class="row note"><input type="checkbox" id="relaxed" ${s.relaxed?'checked':''} style="width:20px;min-height:20px;margin:0"> ${s.edition===2?'Relaxed flight speed':'Relaxed lantern timing'}</label><button class="primary wide" id="ready" ${me.ready||s.players.length<2?'disabled':''}>${me.ready?'Waiting for your partner…':'I’m ready'}</button><p class="hint">Refresh this tab to reconnect to the same seat. A new tab starts a new player.</p>`;
    $('#relaxed').onchange=e=>send('relaxed',{value:e.target.checked});bindReady();return;
  }
  if(s.paused){el.innerHTML=`<div class="checkpoint"><div class="big">☕</div><div class="eyebrow">A little breather</div><h2>Your journey can wait.</h2><p>Your completed puzzles are safe. Both tap Ready when you’re back.</p><button class="primary wide" id="ready" ${me.ready?'disabled':''}>${me.ready?'Waiting for your partner…':'Ready to continue'}</button></div>`;bindReady();return;}
  if(s.phase==='checkpoint'){
    el.innerHTML=`<div class="checkpoint"><div class="big">${stamps[s.stage]}</div><div class="eyebrow">Stamp ${s.stage+1} collected</div><h2>A little less distance.<br>A little more us.</h2><p>${fmt(s.distance/4)} of your journey crossed together.</p><p class="note">Next: ${names[s.stage+1]}</p><button class="primary wide" id="ready" ${me.ready?'disabled':''}>${me.ready?'Waiting for your partner…':'Ready for the next chapter'}</button></div>`;bindReady();return;
  }
  if(s.phase==='victory'){
    el.innerHTML=`<div class="victory"><div class="eyebrow">Four stamps. Zero distance left.</div><h2>Right here, together.</h2><div class="couple"><span>${avatars[s.players[0].avatar]}</span><span>♥</span><span>${avatars[s.players[1].avatar]}</span></div><p>${esc(s.players[0].name)} & ${esc(s.players[1].name)}, you found a little way closer.</p><p class="note">${esc(s.players[0].city)} · ${esc(s.players[1].city)}<br>${fmt(s.distance)} bridged together · ${esc(s.date)} (UTC)</p><div class="row" style="justify-content:center;margin-top:24px"><button class="gold" id="heart">Send a little love ♥</button><button class="primary" id="download">Save our postcard</button></div><div class="constellation">${s.edition===2?constellationKeepsakes(s.constellations):constellationSvg(s.threads)}</div><p class="hint">Your cities and route, your companions, and four earned stamps.</p>${s.discoveries?.length?`<p class="note">Discovered together: ${s.discoveries.map(esc).join(' &middot; ')}</p>`:''}</div>`;
    $('#heart').onclick=()=>{burst();reactCouple();chime();send('heart');};$('#download').onclick=download;return;
  }
  let body='',role='';
  if(s.stage===0){role=s.role==='guide'?'You describe':'You arrange';body=`<p>${s.role==='guide'?'Describe these four stamps from left to right. Your partner can place them, but cannot see your postcard.':'Your partner sees a secret postcard. Ask them which stamps go where, then place them from left to right.'}</p>${s.role==='guide'?`<div class="clue"><div class="clue-title">YOUR PRIVATE POSTCARD</div>${slots(s.clue,4)}</div><p class="note">Partner’s postcard so far:</p>${slots(s.placed,4)}`:`${slots(s.placed,4)}<div class="tiles">${Object.keys(icons).slice(0,6).map(x=>tile(x)).join('')}</div><div class="row"><button id="undo" class="quiet">Undo last stamp</button><button id="check" class="primary">Send our postcard</button></div>`}`;}
  else if(s.stage===1){role=s.role==='symbol'?'You know the symbol':'You know the glow';body=`<p>Combine your clues. Both choose the same lantern, then light it together. Hold the button, or use &ldquo;Keep my lantern lit&rdquo; to take turns on one computer.</p><div class="clue"><div class="clue-title">YOUR PRIVATE CLUE</div><strong>${s.role==='symbol'?`${icons[s.clue.symbol]} Light the ${s.clue.symbol} lantern.`:`${s.clue.duration<2?'Short':'Long'} glow · hold together for ${s.relaxed?(s.clue.duration*.65).toFixed(1):s.clue.duration} seconds.`}</strong></div><div class="tiles">${Object.keys(icons).slice(0,6).map(x=>tile(x,s.selection[String(idx)]===x)).join('')}</div><button class="hold" id="hold" ${!s.selection[String(idx)]?'disabled':''}>Hold to light our lantern</button><button class="quiet lantern-toggle" id="latch" aria-pressed="false">Keep my lantern lit</button><div class="hold-label">${s.players.map((p,i)=>`<span data-holding="${i}">${esc(p.name)} · holding</span>`).join('')}</div><p class="hint">Hold with touch or Space, or tap &ldquo;Keep my lantern lit&rdquo; in each tab. Tap again to release. Each new lantern starts unlit.</p>`;}
  else if(s.stage===2){role=s.role==='guide'?'You scout':'You build';const desc={Plank:'A calm stream: use a straight plank.',Arch:'A boat passes below: leave an arch.',Rope:'A wide ravine: use a rope bridge.'};body=`<p>${s.role==='guide'?'Only you can see what lies below each crossing. Describe the constraints to your builder.':'Your partner can see what lies below each gap. Ask which bridge piece it needs, then build left to right.'}</p>${s.role==='guide'?`<div class="clue"><div class="clue-title">YOUR PRIVATE SCOUTING NOTES</div>${s.clue.map((x,i)=>`<p>${i+1}. ${desc[x]}</p>`).join('')}</div><p class="note">Your partner’s bridge:</p>${slots(s.placed,3)}`:`${slots(s.placed,3)}<div class="tiles">${['Plank','Arch','Rope'].map(x=>tile(x)).join('')}</div><div class="row"><button class="quiet" id="undo">Undo last piece</button><button class="primary" id="check">Cross together</button></div>`}`;}
  else{role=idx===0?'Left endpoint':'Right endpoint';body=`<p>Your clue names the star your <strong>partner</strong> must select. Tell them its name, then ask which star you should choose. Both selections connect the thread.</p><div class="clue"><div class="clue-title">A CLUE FOR YOUR PARTNER</div><strong>“Your star is ${esc(s.clue)}.”</strong></div><div class="constellation">${constellationSvg(s.threads)}<div class="tiles">${starNames.map(x=>tile(x,s.selection[String(idx)]===x,true)).join('')}</div></div><p class="note">${s.selection[String(idx)]?'Your endpoint is set. Waiting for your partner’s star.':'Choose the star named by your partner.'}</p>`;}
  el.innerHTML=`<div class="puzzle-head"><div><div class="eyebrow">Chapter ${s.stage+1} · ${s.step+1} of ${[2,6,2,5][s.stage]}</div><h2>${names[s.stage]}</h2></div><span class="role">${role}</span></div>${body}${s.feedback?`<div class="feedback" role="status">${esc(s.feedback)}</div>`:''}<p class="hint">No timer, no lost progress. Talk it through and try as often as you like.</p>`;
  document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>send(s.stage===0||s.stage===2?'place':'select',{value:b.dataset.choice}));
  if($('#undo'))$('#undo').onclick=()=>send('undo');if($('#check'))$('#check').onclick=()=>send('check');
  if($('#latch'))$('#latch').onclick=()=>{const i=state.players.findIndex(p=>p.id===state.me);send(state.latched?.[i]?'release':'latch');};
  if($('#hold')){
    const b=$('#hold');b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);startHold();};b.onpointerup=()=>endHold();b.onpointercancel=()=>endHold();b.onlostpointercapture=()=>endHold();b.oncontextmenu=e=>e.preventDefault();
    b.onkeydown=e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();if(!e.repeat)startHold();}};b.onkeyup=e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();endHold();}};b.onblur=()=>endHold();
  }
}
function updateLanternControls(){
  const toggle=$('#latch'),button=$('#hold');
  if(!toggle||!button)return;
  const i=state.players.findIndex(p=>p.id===state.me),latched=!!state.latched?.[i],selected=!!state.selection[String(i)];
  toggle.disabled=!connected||!selected;
  toggle.setAttribute('aria-pressed',String(latched));
  toggle.textContent=latched?'Lantern stays lit - tap to release':'Keep my lantern lit';
  button.disabled=!connected||!selected||latched;
}
function bindReady(){if($('#ready'))$('#ready').onclick=()=>send('ready');}
function startHold(){if(holding||!connected)return;holding=true;holdEpoch=state.epoch;$('#hold')?.classList.add('pressed');$('#hold').textContent='Holding… wait for your partner';send('hold');holdTimer=setInterval(()=>{if(holding)send('hold');},450);}
function endHold(release=true){clearInterval(holdTimer);holdTimer=null;if(!holding)return;holding=false;$('#hold')?.classList.remove('pressed');if($('#hold'))$('#hold').textContent='Hold to light our lantern';if(release&&state?.epoch===holdEpoch&&state?.phase==='playing'&&!state.paused)send('release',{epoch:holdEpoch});}
window.addEventListener('blur',()=>endHold());document.addEventListener('visibilitychange',()=>{if(document.hidden)endHold();});

async function download(){
  await document.fonts.ready;
  const s=state,c=document.createElement('canvas');c.width=1600;c.height=1100;const g=c.getContext('2d');
  g.fillStyle='#fffaf1';g.fillRect(0,0,1600,1100);g.fillStyle='#193747';g.fillRect(55,55,1490,770);
  drawPostcardMap(g,s.players);
  for(let i=0;i<55;i++){g.fillStyle=i%3?'#b8c7c1':'#fbd899';g.beginPath();g.arc(90+(i*197)%1420,90+(i*113)%390,i%4?2:3,0,Math.PI*2);g.fill();}
  g.textAlign='center';g.fillStyle='#ffd687';g.font='22px sans-serif';g.fillText('A LITTLE CLOSER · A JOURNEY FOR TWO',800,135);
  g.fillStyle='#fffaf1';g.font='64px Georgia';g.fillText('Right here, together.',800,245);
  g.font='160px sans-serif';g.fillText(avatars[s.players[0].avatar],650,485);g.fillText(avatars[s.players[1].avatar],950,485);g.font='68px sans-serif';g.fillStyle='#e7ac95';g.fillText('♥',800,470);
  g.strokeStyle='#ffdb91';g.lineWidth=3;g.beginPath();[[460,530],[670,585],[830,520],[1010,585],[1140,530]].forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();g.fillStyle='#ffe7b4';[[460,530],[670,585],[830,520],[1010,585],[1140,530]].forEach(([x,y])=>{g.beginPath();g.arc(x,y,7,0,Math.PI*2);g.fill();});
  g.font='48px sans-serif';stamps.forEach((x,i)=>g.fillText(x,560+i*160,704));g.fillStyle='#ccdad5';g.font='23px sans-serif';g.fillText('Four little chapters. One shared memory.',800,769);
  function fit(text,y,size,max){g.fillStyle='#193747';g.font=`${size}px Georgia`;while(g.measureText(text).width>max&&size>16){size--;g.font=`${size}px Georgia`;}g.fillText(text,800,y);}
  fit(s.players.map(p=>p.name).join(' & '),884,46,1430);s.players.forEach((p,i)=>fit(p.city,932+i*34,25,1430));
  g.font='22px sans-serif';g.fillStyle='#667b74';g.fillText(`${new Intl.NumberFormat('en',{maximumFractionDigits:1}).format(s.distance)} km bridged together  ·  ${s.date} (UTC)`,800,1005);g.font='italic 23px Georgia';g.fillText('We found a little way closer.',800,1053);
  c.toBlob(async blob=>{if(!blob){toast('Could not create the postcard. Please try again.');return;}const file=new File([blob],'a-little-closer-postcard.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})&&/Android|iPhone|iPad/i.test(navigator.userAgent)){try{await navigator.share({files:[file],title:'Our little journey'});return;}catch(e){if(e.name==='AbortError')return;}}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Your postcard is ready to save.');},'image/png');
}
try{session=JSON.parse(sessionStorage.getItem('closer-session'));}catch{sessionStorage.removeItem('closer-session');}
if(session?.code&&session?.token)connect();else renderSetup();
