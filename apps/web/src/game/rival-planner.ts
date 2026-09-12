import type { PracticeRace, Racer } from './practice-race';
import { obstacleHit } from './race-course';
import { STEER_SPEED } from './freefall-controller';
import type { Position } from './player-controller';

// Bounded lookahead, not perfect knowledge of future opponent inputs.
export function planRival(race:PracticeRace,racer:Racer){
  const state=race.snapshot(racer),p=state.position,speed=Math.max(8,state.fallSpeed);
  const risk=racer.id===1?0.3:racer.id===2?0.65:1;
  const nearby=race.obstacles.filter(o=>o.active&&p[1]-o.position[1]>-16&&p[1]-o.position[1]<85);
  const inDuct=nearby.find(o=>o.kind==='duct'&&Math.abs(o.position[1]-p[1])<14&&Math.abs(o.position[0]-p[0])<6&&Math.abs(o.position[2]-p[2])<6);
  const options:[number,number,number][]=[[p[0],p[2],0]];
  for(const item of [...race.boxes.filter(b=>b.active&&!racer.item),...race.rings.filter(r=>racer.boostFuel<4&&!r.used.has(racer.id))]){
    const vertical=p[1]-item.position[1],travel=Math.hypot(item.position[0]-p[0],item.position[2]-p[2])/STEER_SPEED;
    if(vertical>0&&vertical<140&&travel<vertical/speed+0.6){
      const ring='used' in item;
      options.push([item.position[0],item.position[2],(ring?10*risk:14)/(1+vertical/80)]);
    }
  }
  if(inDuct){
    const next=nearby.filter(o=>o.kind==='duct'&&o.position[1]<inDuct.position[1]).sort((a,b)=>b.position[1]-a.position[1])[0];
    options.unshift([next?.position[0]??inDuct.position[0],next?.position[2]??inDuct.position[2],30]);
  }
  for(const dx of [-12,0,12])for(const dz of [-12,0,12])options.push([Math.max(-36,Math.min(36,p[0]+dx)),Math.max(-36,Math.min(36,p[2]+dz)),0]);
  let best=options[0],bestScore=-Infinity;
  for(const option of options){
    const [x,z,reward]=option;
    const duration=Math.min(2,Math.max(0.6,Math.hypot(x-p[0],z-p[2])/STEER_SPEED));
    const end:Position=[x,p[1]-speed*duration,z];
    const collisions=nearby.reduce((n,o)=>n+Number(obstacleHit(p,end,o,race.elapsed+duration/2)!==null),0);
    const score=reward-collisions*(26-risk*8)-Math.hypot(x-p[0],z-p[2])*0.06;
    if(score>bestScore){best=option;bestScore=score;}
  }
  racer.target=[best[0],best[1]];
  const threat=nearby.some(o=>obstacleHit(p,[p[0],p[1]-speed*0.7,p[2]],o,race.elapsed+0.35)!==null);
  const remaining=Math.hypot(best[0]-p[0],best[1]-p[2]);
  racer.brakeUntil=threat&&remaining>5?race.elapsed+0.3:0;
  return threat;
}
