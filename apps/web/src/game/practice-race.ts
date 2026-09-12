import { COLLECTIBLE_RADIUS_METERS } from '@sky/shared';
import { FreefallController } from './freefall-controller';
import type { PlayerSnapshot, SteeringInput, Position } from './player-controller';
import { makeCourse, obstacleHit, obstaclePose, OBSTACLE_RULES, segmentSphere, type Item, type Obstacle } from './race-course';

export const FINISH_DEPTH = 3600;
export const LANE_HALF_WIDTH = 20;
export const RACER_COLORS = ['#ff9875','#a7f179','#c7a0ff','#ffe175'];
export type Racer = {
  id:number;name:string;controller:FreefallController;landed?:PlayerSnapshot;finishTime?:number;
  target:[number,number];decision:number;brakeUntil:number;item:Item|null;
  slowUntil:number;shieldUntil:number;boostUntil:number;flailUntil:number;immuneUntil:number;sunUntil:number;nextUse:number;
};
export type Projectile={id:number;owner:number;position:Position;velocity:Position;target?:number;expires:number};
export type Pickup={id:number;position:Position;active:boolean};
export type Ring={id:number;position:Position;used:Set<number>};
const distance=(a:Position,b:Position)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export class PracticeRace {
  elapsed=0;racers:Racer[]=[];obstacles:Obstacle[]=[];boxes:Pickup[]=[];rings:Ring[]=[];projectiles:Projectile[]=[];
  private seed=42;private shotId=0;
  constructor(private courseEnabled=true) {this.reset();}
  private random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  reset(){
    this.elapsed=0;this.seed=42;this.shotId=0;this.projectiles=[];
    this.racers=['You','Lime','Lilac','Lemon'].map((name,id)=>({
      id,name,controller:new FreefallController(LANE_HALF_WIDTH,(id-1.5)*5,0),
      target:[0,0],decision:0,brakeUntil:0,item:null,
      slowUntil:0,shieldUntil:0,boostUntil:0,flailUntil:0,immuneUntil:0,sunUntil:0,nextUse:0,
    }));
    this.obstacles=this.courseEnabled?makeCourse():[];
    this.boxes=this.courseEnabled?[120,950,1800,2650].flatMap((depth,section)=>
      [-12,0,12].map((x,index)=>({id:section*3+index,position:[x,-depth,section%2?8:0] as Position,active:true}))):[];
    this.rings=this.courseEnabled?[600,1550,2450].map((depth,id)=>({id,position:[id%2?-11:11,-depth,id%2?10:-10] as Position,used:new Set()})):[];
  }
  snapshot(racer:Racer){return racer.landed??racer.controller.getSnapshot();}
  get finished(){return this.racers.every(r=>r.finishTime!==undefined);}
  order(){return [...this.racers].sort((a,b)=>{
    if(a.finishTime!==undefined||b.finishTime!==undefined)return (a.finishTime??Infinity)-(b.finishTime??Infinity)||a.id-b.id;
    return this.snapshot(a).position[1]-this.snapshot(b).position[1]||a.id-b.id;
  });}
  eligibleTarget(owner:number,target:number,lookUp:boolean){
    const a=this.racers[owner],b=this.racers[target];
    if(!a||!b||a===b||b.finishTime!==undefined)return false;
    const p=this.snapshot(a).position,q=this.snapshot(b).position;
    return (lookUp?q[1]>p[1]:q[1]<p[1])&&distance(p,q)<=180;
  }
  useItem(owner:number,lookUp:boolean,target?:number){
    const racer=this.racers[owner];
    if(!racer||racer.finishTime!==undefined||!racer.item)return false;
    const item=racer.item;racer.item=null;
    if(item==='cloak')racer.shieldUntil=this.elapsed+5;
    if(item==='sun'){
      racer.sunUntil=this.elapsed+0.5;
      const p=this.snapshot(racer).position;
      for(const obstacle of this.obstacles)if(obstacle.active&&distance(p,obstaclePose(obstacle,this.elapsed).position)<=12){
        obstacle.active=false;obstacle.hitAt=this.elapsed;
      }
    }
    if(item==='umbrella'){
      const state=this.snapshot(racer);
      const targetId=target!==undefined&&this.eligibleTarget(owner,target,lookUp)?target:undefined;
      const velocity:Position=[0,(lookUp?60:-60)-state.fallSpeed,0];
      this.projectiles.push({id:this.shotId++,owner,position:[...state.position],velocity,target:targetId,expires:this.elapsed+4});
    }
    return true;
  }
  step(dt:number,input:SteeringInput,brake:boolean){
    if(this.finished||dt<=0||!Number.isFinite(dt))return;
    const old=this.racers.map(r=>this.snapshot(r).position);
    for(const racer of this.racers){
      if(racer.finishTime!==undefined)continue;
      let steering=input;
      if(racer.id===0)racer.controller.braking=brake;
      else {
        if(this.elapsed>=racer.decision){
          racer.target=[(this.random()*2-1)*18,(this.random()*2-1)*18];
          const p=this.snapshot(racer).position;
          const opportunity=[...this.boxes.filter(box=>box.active&&!racer.item),...this.rings.filter(r=>!r.used.has(racer.id))]
            .filter(o=>p[1]-o.position[1]>0&&p[1]-o.position[1]<100).sort((a,b)=>b.position[1]-a.position[1])[0];
          if(opportunity)racer.target=[opportunity.position[0],opportunity.position[2]];
          racer.decision=this.elapsed+1+this.random()*2;
          if(this.random()<0.22)racer.brakeUntil=this.elapsed+0.3+this.random()*0.7;
        }
        const p=this.snapshot(racer).position;
        steering={x:(racer.target[0]-p[0])*0.6,z:(racer.target[1]-p[2])*0.6};
        const danger=this.obstacles.find(o=>o.active&&p[1]-o.position[1]>0&&p[1]-o.position[1]<20&&Math.hypot(p[0]-o.position[0],p[2]-o.position[2])<6);
        if(danger)steering={x:p[0]>danger.position[0]?1:-1,z:p[2]>danger.position[2]?1:-1};
        racer.controller.braking=this.elapsed<racer.brakeUntil;
        if(racer.item&&this.elapsed>racer.nextUse){
          const rival=this.racers.filter(r=>r.id!==racer.id&&r.finishTime===undefined).sort((a,b)=>distance(p,this.snapshot(a).position)-distance(p,this.snapshot(b).position))[0];
          const up=rival?this.snapshot(rival).position[1]>p[1]:false;
          if(racer.item!=='umbrella'||(rival&&this.eligibleTarget(racer.id,rival.id,up)))this.useItem(racer.id,up,rival?.id);
          racer.nextUse=this.elapsed+2;
        }
      }
      const flailing=this.elapsed<racer.flailUntil;
      const motion=racer.controller.step(dt,{x:steering.x*(flailing?0.3:1),z:steering.z*(flailing?0.3:1)},{
        fallSpeedMultiplier:this.elapsed<racer.slowUntil?0.5:1,maxFallSpeed:this.elapsed<racer.boostUntil?45:30,
      });
      for(const box of this.boxes)if(box.active&&!racer.item&&segmentSphere(motion.previousPosition,motion.position,box.position,COLLECTIBLE_RADIUS_METERS)){
        box.active=false;racer.item=(['umbrella','cloak','sun'] as Item[])[Math.floor(this.random()*3)];
      }
      for(const ring of this.rings)if(!ring.used.has(racer.id)&&motion.previousPosition[1]>ring.position[1]&&motion.position[1]<=ring.position[1]){
        const t=(ring.position[1]-motion.previousPosition[1])/(motion.position[1]-motion.previousPosition[1]);
        const x=motion.previousPosition[0]+(motion.position[0]-motion.previousPosition[0])*t,z=motion.previousPosition[2]+(motion.position[2]-motion.previousPosition[2])*t;
        if(Math.hypot(x-ring.position[0],z-ring.position[2])<=3){ring.used.add(racer.id);racer.boostUntil=this.elapsed+4;}
      }
      if(this.elapsed>=racer.shieldUntil&&this.elapsed>=racer.immuneUntil)for(const obstacle of this.obstacles){
        if(!obstacle.active||Math.abs(obstacle.position[1]-motion.position[1])>20)continue;
        const penalty=obstacleHit(motion.previousPosition,motion.position,obstacle,this.elapsed);
        if(penalty!==null){
          const rules=OBSTACLE_RULES[obstacle.kind];
          racer.controller.impact(penalty,[(motion.position[0]>=obstacle.position[0]?1:-1)*rules.knockback,0,(motion.position[2]>=obstacle.position[2]?1:-1)*rules.knockback]);
          racer.flailUntil=this.elapsed+rules.flail;racer.immuneUntil=this.elapsed+1.5;
          obstacle.active=false;obstacle.hitAt=this.elapsed;break;
        }
      }
      if(motion.position[1]<=-FINISH_DEPTH){
        const t=(-FINISH_DEPTH-motion.previousPosition[1])/(motion.position[1]-motion.previousPosition[1]);
        racer.finishTime=this.elapsed+dt*t;racer.landed={fallSpeed:0,position:[
          motion.previousPosition[0]+(motion.position[0]-motion.previousPosition[0])*t,-FINISH_DEPTH,
          motion.previousPosition[2]+(motion.position[2]-motion.previousPosition[2])*t]};
      }
    }
    for(const shot of this.projectiles){
      const before:Position=[...shot.position];
      const target=shot.target===undefined?undefined:this.racers[shot.target];
      if(target&&target.finishTime===undefined){
        const q=this.snapshot(target).position;
        // Limited lateral correction, not an unavoidable homing missile.
        const blend=Math.min(1,dt*2);
        for(const axis of [0,2])shot.velocity[axis]+=(Math.max(-14,Math.min(14,(q[axis]-shot.position[axis])*1.5))-shot.velocity[axis])*blend;
      }
      shot.position=shot.position.map((v,i)=>v+shot.velocity[i]*dt) as Position;
      for(const victim of this.racers){
        if(victim.id===shot.owner||victim.finishTime!==undefined)continue;
        const now=this.snapshot(victim).position;
        const a=before.map((v,i)=>v-old[victim.id][i]) as Position;
        const b=shot.position.map((v,i)=>v-now[i]) as Position;
        if(segmentSphere(a,b,[0,0,0],1.1)){
          if(this.elapsed>=victim.shieldUntil&&this.elapsed>=victim.immuneUntil)victim.slowUntil=this.elapsed+3;
          shot.expires=0;break;
        }
      }
    }
    this.elapsed+=dt;
    this.projectiles=this.projectiles.filter(shot=>shot.expires>this.elapsed);
  }
}
