(async()=>{
  const {FlightMotion}=await import('/flight-motion.js');
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const state=(clock,x,y,extra={})=>({clock,x,y,running:true,bumps:0,...extra});
  const motion=new FlightMotion(),duplicate=new FlightMotion();
  motion.accept(state(0,0,200),0,66);duplicate.accept(state(0,0,200),0,66);
  motion.sample(50);duplicate.sample(50);
  duplicate.accept(state(0,0,200),70,66);
  check(motion.sample(90).x===duplicate.sample(90).x,'Duplicate snapshots rewind flight');
  let previous=motion.sample(100),maxJump=0,movingFrames=0;
  for(let frame=1;frame<=60;frame++){
    const now=100+frame*1000/60;
    if(frame%6===0){const clock=frame/60;motion.accept(state(clock,clock*66,200-clock*140),now,66);}
    const next=motion.sample(now);
    const jump=Math.abs(next.y-previous.y);maxJump=Math.max(maxJump,jump);
    if(jump>.05)movingFrames++;
    previous=next;
  }
  check(maxJump<8,'Steering still jumps a full server tick');
  check(movingFrames>45,'Plane only moves when a snapshot arrives');
  const stalled=motion.sample(10000);
  check(stalled.x<=66+66*.12&&stalled.y>=35,'Prediction runs away during a stall');
  motion.accept(state(1.1,20,80,{bumps:1}),10010,66);
  check(motion.sample(10010).x===20,'Collision correction ignored');
  motion.accept(state(1.1,20,80,{bumps:1,running:false}),10020,66);
  check(motion.sample(11000).x===20,'Stopped flight keeps moving');
  motion.reset();check(motion.sample(12000)===null,'Scene reset retains stale motion');
  motion.accept(state(0,0,200),12000,48);
  check(motion.sample(13000).x<=48*.12,'Relaxed flight predicts at the wrong speed');
  return {maxJump,movingFrames};
})()
