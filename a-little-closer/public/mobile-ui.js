const narrow=matchMedia('(max-width: 680px)');
let unread=0;
const $=s=>document.querySelector(s);

function updateBadge(){
  const button=$('#chat-toggle');if(!button)return;
  button.textContent=unread?`Chat (${unread})`:'Chat';
  button.setAttribute('aria-label',unread?`Open chat, ${unread} unread messages`:'Open chat');
}
export function setupMobileUI(releaseControls){
  unread=0;
  const dialog=$('#mobile-chat'),panel=$('#chat-panel'),home=$('#chat-home'),button=$('#chat-toggle');
  button.onclick=()=>{
    releaseControls();unread=0;updateBadge();
    dialog.append(panel);dialog.showModal();document.body.classList.add('chat-open');
    button.setAttribute('aria-expanded','true');$('#chat-input').focus();
    $('#chat-log').scrollTop=$('#chat-log').scrollHeight;
  };
  $('#close-chat').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{
    home.append(panel);document.body.classList.remove('chat-open');button.setAttribute('aria-expanded','false');
    if(narrow.matches)button.focus({preventScroll:true});
  });
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  updateBadge();
}
export function closeMobileUI(){const dialog=$('#mobile-chat');if(dialog?.open)dialog.close();document.body.classList.remove('chat-open');}
export function incomingMessages(previous,messages,player){
  if(!previous||!narrow.matches||$('#mobile-chat')?.open)return;
  const known=new Set(JSON.parse(previous).map(m=>m.id));
  unread+=messages.filter(m=>!known.has(m.id)&&!m.id.startsWith(player+':')).length;
  updateBadge();
}
narrow.addEventListener('change',()=>{if(!narrow.matches)closeMobileUI();});
