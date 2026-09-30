// Presentation only. The server still decides positions, hits, and collected stamps.
// Predict at most 120 ms, then ease corrections each animation frame. Duplicate
// action/SSE snapshots must not restart the prediction clock.
export class FlightMotion {
  reset(){this.latest=null;this.display=null;this.frameTime=null;}
  constructor(){this.reset();}
  accept(a,now,speed){
    const old=this.latest;
    if(old&&a.clock===old.clock&&a.running===old.running&&a.bumps===old.bumps)return;
    const snap=!old||a.clock<old.clock||a.running!==old.running||a.bumps!==old.bumps;
    const dt=old?a.clock-old.clock:0;
    const vy=!snap&&dt>0?Math.max(-180,Math.min(180,(a.y-old.y)/dt)):0;
    this.latest={x:a.x,y:a.y,clock:a.clock,running:a.running,bumps:a.bumps,received:now,speed,vy};
    if(snap){this.display={x:a.x,y:a.y};this.frameTime=now;}
  }
  sample(now){
    const a=this.latest;if(!a)return null;
    const dt=Math.max(0,Math.min(.1,(now-this.frameTime)/1000));this.frameTime=now;
    const ahead=a.running?Math.max(0,Math.min(.12,(now-a.received)/1000)):0;
    const target={x:a.x+ahead*a.speed,y:Math.max(35,Math.min(365,a.y+ahead*a.vy))};
    const blend=1-Math.exp(-dt/.045);
    for(const axis of ['x','y'])this.display[axis]+=(target[axis]-this.display[axis])*blend;
    return {...this.display,ahead};
  }
}
