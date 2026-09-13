import type { PracticeRace, Racer } from './practice-race';
import { obstacleHit } from './race-course';
import { contactTime, subtract } from '../race-events/math';
import { insideObservationCone } from '../race-events/drill-mechanics';
import type { EventVector } from '@sky/shared';
import { STEER_SPEED } from './freefall-controller';
import type { Position } from './player-controller';

// Bounded lookahead, not perfect knowledge of future opponent inputs.
export function planRival(race:PracticeRace,racer:Racer){
  const state=race.snapshot(racer),p=state.position,speed=Math.max(8,state.fallSpeed);
  const risk=racer.temperament;
  if(race.elapsed>=racer.maneuverUntil){
    // Commit for several seconds: lively route changes without per-tick jitter.
    racer.wander=[racer.aiRandom()*56-28,racer.aiRandom()*56-28];
    racer.maneuverUntil=race.elapsed+2+racer.aiRandom()*3;
  }
  const nearby=race.obstacles.filter(o=>o.active&&p[1]-o.position[1]>-16&&p[1]-o.position[1]<85);
  const inDuct=nearby.find(o=>o.kind==='duct'&&Math.abs(o.position[1]-p[1])<14&&Math.abs(o.position[0]-p[0])<6&&Math.abs(o.position[2]-p[2])<6);
  const options:[number,number,number][]=[[p[0],p[2],0]];
  const event = race.events?.getSnapshot();
  const drill = event?.phase === 'active' ? event.drill : undefined;
  const actors = drill?.actors.filter(actor => Math.abs(p[1]-actor.position[1])<75) ?? [];
  const hazards=actors.filter(actor=>actor.kind!=='bumper');
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
  for(const actor of actors)if(actor.kind==='bumper'&&actor.state!=='warning') {
    const x=actor.position[0]+actor.radius*0.75;
    opportunity([x,actor.position[1]+actor.radius,actor.position[2]],[x,actor.position[1]-actor.radius,actor.position[2]],10*risk);
  }
  for(const link of drill?.tethers??[])if(link.active&&link.racerIds.includes(String(racer.id))) {
    const buddy=link.racerIds[0]===String(racer.id)?link.to:link.from;
    options.push([Math.max(-36,Math.min(36,buddy[0])),Math.max(-36,Math.min(36,buddy[2])),18*Math.min(1,link.tension)]);
  }
  for(const orbit of drill?.orbits??[])if(orbit.active) {
    const x=orbit.position[0]+orbit.radius*0.65;
    opportunity([x,orbit.position[1]+orbit.height/2,orbit.position[2]],[x,orbit.position[1]-orbit.height/2,orbit.position[2]],8*risk);
  }
  for(const item of [...race.boxes.filter(b=>b.active&&!racer.item),...race.rings.filter(r=>racer.boostFuel<4&&!r.used.has(racer.id))]){
    const vertical=p[1]-item.position[1],travel=Math.hypot(item.position[0]-p[0],item.position[2]-p[2])/STEER_SPEED;
    if(vertical>0&&vertical<140&&travel<vertical/speed+0.6){
      const ring='used' in item;
      options.push([item.position[0],item.position[2],(ring?10*risk:14)/(1+vertical/80)]);
    }
  }
  options.push([racer.wander[0],racer.wander[1],1.5+risk*2]);
  // Overtake alongside a nearby racer; never steer directly into their body.
  const opponent=race.racers.find(other=>other.id!==racer.id&&other.finishTime===undefined&&
    Math.abs(race.snapshot(other).position[1]-p[1])<40);
  if(opponent&&risk>0.4){
    const q=race.snapshot(opponent).position;
    options.push([Math.max(-30,Math.min(30,q[0]+(racer.id%2?8:-8))),q[2],3*risk]);
  }
  if(inDuct){
    const next=nearby.filter(o=>o.kind==='duct'&&Math.floor((o.id-1000)/3)===Math.floor((inDuct.id-1000)/3)&&o.position[1]<inDuct.position[1]).sort((a,b)=>b.position[1]-a.position[1])[0];
    options.unshift([next?.position[0]??inDuct.position[0],next?.position[2]??inDuct.position[2],30]);
  }
  for(const dx of [-12,0,12])for(const dz of [-12,0,12])options.push([Math.max(-36,Math.min(36,p[0]+dx)),Math.max(-36,Math.min(36,p[2]+dz)),0]);
  let best=options[0],bestScore=-Infinity;
  for(const option of options){
    const [x,z,reward]=option;
    const duration=Math.min(2,Math.max(0.6,Math.hypot(x-p[0],z-p[2])/STEER_SPEED));
    const distance=Math.hypot(x-p[0],z-p[2]),fraction=Math.min(1,STEER_SPEED*duration/(distance||1));
    const end:Position=[p[0]+(x-p[0])*fraction,p[1]-speed*duration,p[2]+(z-p[2])*fraction];
    const collisions=nearby.reduce((n,o)=>n+Number(obstacleHit(p,end,o,race.elapsed+duration/2)!==null),0);
    const equipmentContacts=hazards.reduce((count,actor)=>{
      const future:EventVector=[actor.position[0]+actor.velocity[0]*Math.min(duration,0.4),actor.position[1]+actor.velocity[1]*Math.min(duration,0.4),actor.position[2]+actor.velocity[2]*Math.min(duration,0.4)];
      return count+Number(contactTime(subtract(p,actor.position),subtract(end,future),[0,0,0],actor.radius+1)!==undefined);
    },0);
    const moving=Math.hypot(end[0]-p[0],end[2]-p[2])>1;
    const inspected=moving&&(drill?.observers??[]).some(observer=>(observer.watching||observer.warning)&&[0,0.35,0.7].some(t=>
      insideObservationCone([p[0]+(end[0]-p[0])*t,p[1]+(end[1]-p[1])*t,p[2]+(end[2]-p[2])*t],observer)));
    const score=reward-collisions*(34-risk*10)-equipmentContacts*(26-risk*8)-(inspected?22:0)-Math.hypot(x-p[0],z-p[2])*0.06;
    if(score>bestScore){best=option;bestScore=score;}
  }
  racer.target=[best[0],best[1]];
  const threat=nearby.some(o=>obstacleHit(p,[p[0],p[1]-speed*0.7,p[2]],o,race.elapsed+0.35)!==null)||hazards.some(actor=>contactTime(p,[p[0],p[1]-speed*0.7,p[2]],actor.position,actor.radius+1)!==undefined);
  const remaining=Math.hypot(best[0]-p[0],best[1]-p[2]);
  racer.brakeUntil=threat&&remaining>5?race.elapsed+0.3:0;
  return threat;
}
