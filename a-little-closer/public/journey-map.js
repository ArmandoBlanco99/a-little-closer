const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cameras=new Map();
const journeys=new Map();
let geography=null;
export function setGeography(data){geography=data;}
const wrap=x=>((x+180)%360+360)%360-180;
function geometry(players){
  const center=players.length>1?players[0].lon+wrap(players[1].lon-players[0].lon)/2:players[0]?.lon||0;
  const project=(lat,lon)=>[360+wrap(lon-center)*2,180-lat*2];
  const vector=p=>{const lat=p.lat*Math.PI/180,lon=p.lon*Math.PI/180;return [Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];};
  const route=[];
  if(players.length>1){
    const u=vector(players[0]),v=vector(players[1]),angle=Math.acos(Math.max(-1,Math.min(1,u.reduce((n,x,i)=>n+x*v[i],0))));
    for(let j=0;j<=100;j++){
      const t=j/100;let w;
      if(angle<1e-6)w=u;
      else if(Math.PI-angle<1e-5){const axis=Math.abs(u[2])<.9?[0,0,1]:[1,0,0],dot=axis.reduce((n,x,i)=>n+x*u[i],0),q=axis.map((x,i)=>x-dot*u[i]),norm=Math.hypot(...q);w=u.map((x,i)=>x*Math.cos(Math.PI*t)+q[i]/norm*Math.sin(Math.PI*t));}
      else w=u.map((x,i)=>(Math.sin((1-t)*angle)*x+Math.sin(t*angle)*v[i])/Math.sin(angle));
      route.push(project(Math.atan2(w[2],Math.hypot(w[0],w[1]))*180/Math.PI,Math.atan2(w[1],w[0])*180/Math.PI));
    }
  }
  const pins=players.map(p=>project(p.lat,p.lon)),points=route.length?route:pins;
  let minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  if(!points.length){minX=0;maxX=720;minY=0;maxY=360;}
  const width=Math.min(720,Math.max(125,(maxX-minX+75),(maxY-minY+65)*2)),height=width/2;
  const home=[(minX+maxX-width)/2,(minY+maxY-height)/2,width,height];
  return {project,route,pins,home};
}
function landPath(project){
  if(!geography)return '';
  let d='';
  // Natural Earth polygons already split at +/-180 longitude. Keep each ring
  // continuous and repeat the world instead of wrapping individual vertices:
  // filled paths otherwise close across the seam with a spurious diagonal.
  const origin=project(0,0)[0];
  for(const feature of geography.features){
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    for(const offset of [-720,0,720])for(const polygon of polygons)for(const ring of polygon){
      ring.forEach(([lon,lat],i)=>{d+=`${i?'L':'M'}${(origin+lon*2+offset).toFixed(2)},${project(lat,0)[1].toFixed(2)} `;});d+='Z ';
    }
  }
  return d;
}
function linePath(points){let prev=null;return points.map(p=>{const command=!prev||Math.abs(prev[0]-p[0])>360?'M':'L';prev=p;return `${command}${p[0]},${p[1]}`;}).join(' ');}
export function journeyMap(players,progress,avatars){
  const geo=geometry(players),key=players.map(p=>`${p.lat},${p.lon}`).join(';'),camera=cameras.get(key)||geo.home;
  const previous=journeys.get(key)??progress;journeys.set(key,progress);
  const travel=i=>{
    if(progress<=previous||!geo.route.length||matchMedia('(prefers-reduced-motion: reduce)').matches)return '';
    const values=Array.from({length:21},(_,j)=>{const p=previous+(progress-previous)*j/20,t=i===0?p/2:1-p/2,[x,y]=geo.route[Math.round(t*100)];return `${x+(p===1?(i?-12:12)*geo.home[2]/720:0)} ${y-16*geo.home[2]/720}`;}).join(';');
    return `<animateTransform attributeName="transform" type="translate" values="${values}" dur="2s" repeatCount="1"/>`;
  };
  const route=linePath(geo.route),scale=geo.home[2]/720;
  const pins=players.map((p,i)=>{const [x,y]=geo.pins[i],point=geo.route[Math.round((i===0?progress/2:1-progress/2)*100)]||[x,y];return `<g transform="translate(${x} ${y})"><circle class="city-glow" r="${10*scale}"/><circle class="map-pin" r="${3*scale}"/><text class="city-label" y="${(i?24:36)*scale}" text-anchor="middle" font-size="${12*scale}">${esc((p.city||'').split(',')[0])}</text></g><g class="map-traveler" transform="translate(${point[0]+(progress===1?(i?-12:12)*scale:0)} ${point[1]-16*scale})">${travel(i)}<circle class="avatar-disc" r="${15*scale}"/><text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="${21*scale}">${avatars[p.avatar]||'♥'}</text></g>`;}).join('');
  const landmarks=geo.route.length?[.125,.375,.625,.875].map((t,i)=>{const p=geo.route[Math.round(t*100)];return `<text class="route-landmark ${progress>i/4?'earned':''}" x="${p[0]}" y="${p[1]+20*scale}" text-anchor="middle" font-size="${16*scale}">${['✉','♧','⌁','✦'][i]}</text>`;}).join(''):'';
  return `<div class="interactive-map" data-camera="${esc(key)}" data-home="${geo.home.join(' ')}"><svg class="map" viewBox="${camera.join(' ')}" tabindex="0" role="img" aria-label="Interactive map of your cities. Drag to pan, use plus or minus to zoom, and zero to fit the route."><rect x="-720" y="-360" width="2160" height="1080" fill="#193c4c"/><path class="land" d="${landPath(geo.project)}"/><path class="route moving-route" d="${route}" vector-effect="non-scaling-stroke"/>${landmarks}${pins}<g class="map-clouds" opacity=".10" pointer-events="none"><ellipse cx="${geo.home[0]+geo.home[2]*.25}" cy="${geo.home[1]+geo.home[3]*.22}" rx="${20*scale}" ry="${5*scale}"/><ellipse cx="${geo.home[0]+geo.home[2]*.7}" cy="${geo.home[1]+geo.home[3]*.72}" rx="${30*scale}" ry="${7*scale}"/></g></svg><div class="map-tools"><span>Drag to explore</span><button data-zoom="in" aria-label="Zoom in">+</button><button data-zoom="out" aria-label="Zoom out">−</button><button data-zoom="fit">Our route</button></div></div>`;
}
export function bindMaps(root=document){
  root.querySelectorAll('.interactive-map').forEach(box=>{
    if(box.dataset.bound)return;box.dataset.bound='true';
    const svg=box.querySelector('svg'),key=box.dataset.camera,home=box.dataset.home.split(' ').map(Number);let view=svg.getAttribute('viewBox').split(' ').map(Number),drag=null;
    const apply=()=>{view[0]=Math.max(-360,Math.min(720,view[0]));view[1]=Math.max(-180,Math.min(360,view[1]));svg.setAttribute('viewBox',view.join(' '));cameras.set(key,[...view]);};
    const zoom=factor=>{const width=Math.max(65,Math.min(1100,view[2]*factor)),height=width/2;view=[view[0]+(view[2]-width)/2,view[1]+(view[3]-height)/2,width,height];apply();};
    box.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{if(b.dataset.zoom==='fit'){view=[...home];apply();}else zoom(b.dataset.zoom==='in'?.75:1.33);});
    svg.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,view:[...view]};svg.setPointerCapture(e.pointerId);svg.classList.add('dragging');};
    svg.onpointermove=e=>{if(!drag)return;const rect=svg.getBoundingClientRect();view=[drag.view[0]-(e.clientX-drag.x)/rect.width*drag.view[2],drag.view[1]-(e.clientY-drag.y)/rect.height*drag.view[3],...drag.view.slice(2)];apply();};
    svg.onpointerup=svg.onpointercancel=svg.onlostpointercapture=()=>{drag=null;svg.classList.remove('dragging');};
    svg.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();zoom(e.deltaY>0?1.12:.88);},{passive:false});
    svg.onkeydown=e=>{if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='0'){view=[...home];apply();}else if(['+','=','-'].includes(e.key))zoom(e.key==='-'?1.25:.8);else{view[e.key==='ArrowLeft'||e.key==='ArrowRight'?0:1]+=view[2]*.06*(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1);apply();}}};
  });
}
export function drawPostcardMap(g,players){
  const geo=geometry(players),[vx,vy,vw,vh]=geo.home;
  g.save();g.beginPath();g.rect(90,280,1420,365);g.clip();
  const scale=365/vh;
  g.translate(800,280);g.scale(scale,scale);g.translate(-vx-vw/2,-vy);
  g.fillStyle='#c4d2be';g.globalAlpha=.24;g.fill(new Path2D(landPath(geo.project)));
  g.globalAlpha=.85;g.strokeStyle='#ffdb92';g.lineWidth=vw/400;g.setLineDash([vw/150,vw/160]);g.stroke(new Path2D(linePath(geo.route)));g.setLineDash([]);
  const size=22/scale;
  players.forEach((p,i)=>{const [x,y]=geo.pins[i];g.fillStyle='#ffe0a6';g.beginPath();g.arc(x,y,size*.23,0,Math.PI*2);g.fill();g.font=`${size}px sans-serif`;g.textAlign='center';let label=(p.city||'').split(',')[0];const chars=Array.from(label);while(g.measureText(label).width>240/scale&&chars.length>1){chars.pop();label=chars.join('')+'\u2026';}g.fillText(label,x,y+size*(i?2.5:1.5));});
  g.restore();
}
