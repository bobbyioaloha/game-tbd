import type { PracticeRace, Racer } from './practice-race';
import { obstacleHit } from './race-course';
import { contactTime, subtract } from '../race-events/math';
import type { EventVector } from '@sky/shared';
import { STEER_SPEED } from './freefall-controller';
import type { Position } from './player-controller';

// Bounded lookahead, not perfect knowledge of future opponent inputs.
export function planRival(race:PracticeRace,racer:Racer){
  const state=race.snapshot(racer),p=state.position,speed=Math.max(8,state.fallSpeed);
  const risk=racer.id===1?0.3:racer.id===2?0.65:1;
  const nearby=race.obstacles.filter(o=>o.active&&p[1]-o.position[1]>-16&&p[1]-o.position[1]<85);
  const inDuct=nearby.find(o=>o.kind==='duct'&&Math.abs(o.position[1]-p[1])<14&&Math.abs(o.position[0]-p[0])<6&&Math.abs(o.position[2]-p[2])<6);
  const options:[number,number,number][]=[[p[0],p[2],0]];
  const event = race.events?.getSnapshot();
  const drill = event?.phase === 'active' ? event.drill : undefined;
  const actors = drill?.actors.filter(actor => Math.abs(p[1]-actor.position[1])<75) ?? [];
  // Use the same visible volumes as players. Decisions still run at the normal
  // rival cadence; no knowledge of future reactions or hidden escape routes.
  const opportunity = (from:EventVector,to:EventVector,reward:number) => {
    const y = p[1]-speed*0.7;
    if (y > Math.max(from[1],to[1])+5 || y < Math.min(from[1],to[1])-5) return;
    const t = Math.abs(to[1]-from[1])<0.01 ? 0.5 : Math.max(0,Math.min(1,(y-from[1])/(to[1]-from[1])));
    const x=from[0]+(to[0]-from[0])*t,z=from[2]+(to[2]-from[2])*t;
    if(Math.hypot(x-p[0],z-p[2])<STEER_SPEED*1.2) options.push([x,z,reward]);
  };
  for(const actor of actors)if(actor.wake)opportunity(actor.wake.from,actor.wake.to,8+4*risk);
  for(const current of drill?.currents ?? []) {
    if(current.kind!=='eddy')opportunity(current.from,current.to,current.kind==='fast'?14*risk:8);
  }
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
    const equipmentContacts=actors.reduce((count,actor)=>{
      const future:EventVector=[actor.position[0]+actor.velocity[0]*Math.min(duration,0.4),actor.position[1]+actor.velocity[1]*Math.min(duration,0.4),actor.position[2]+actor.velocity[2]*Math.min(duration,0.4)];
      return count+Number(contactTime(subtract(p,actor.position),subtract(end,future),[0,0,0],actor.radius+1)!==undefined);
    },0);
    const score=reward-(collisions+equipmentContacts)*(26-risk*8)-Math.hypot(x-p[0],z-p[2])*0.06;
    if(score>bestScore){best=option;bestScore=score;}
  }
  racer.target=[best[0],best[1]];
  const threat=nearby.some(o=>obstacleHit(p,[p[0],p[1]-speed*0.7,p[2]],o,race.elapsed+0.35)!==null)||actors.some(actor=>contactTime(p,[p[0],p[1]-speed*0.7,p[2]],actor.position,actor.radius+1)!==undefined);
  const remaining=Math.hypot(best[0]-p[0],best[1]-p[2]);
  racer.brakeUntil=threat&&remaining>5?race.elapsed+0.3:0;
  return threat;
}
