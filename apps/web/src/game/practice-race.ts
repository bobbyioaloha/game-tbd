import { itemForPlace, RivalDodgeReaction } from './race-balance';
// Race item boxes have a forgiving pickup volume independent of model size.
import { planRival } from './rival-planner';
import { TargetLock } from './target-lock';
import { RACE_EVENT_LIMITS, type EventRacer, type RaceEventPort, type RacerSegment, type PowerUpEffect } from '@sky/shared';
import { RaceEventBridge } from '../race-events/bridge';
import { FreefallController } from './freefall-controller';
import type { PlayerSnapshot, SteeringInput, Position } from './player-controller';
import { makeCourse, makeItemBoxes, obstacleHit, obstaclePose, OBSTACLE_RULES, segmentSphere, type Item, type Obstacle } from './race-course';

export const FINISH_DEPTH = 3600;
export const LANE_HALF_WIDTH = 36;
export const ITEM_PICKUP_RADIUS = 3.5;
export const DODGE_COOLDOWN = 15;
export const SUN_DURATION = 2.5;
export const BOOST_CAPACITY = 4;
export const RACER_COLORS = ['#c47b48','#827491','#598d87','#bca454'];
export type RaceStanding={id:number;name:string;place:number;progress:number;gap:number;finished:boolean};
export type Racer = {
  id:number;name:string;incidents:number;controller:FreefallController;landed?:PlayerSnapshot;finishTime?:number;
  target:[number,number];decision:number;brakeUntil:number;item:Item|null;
  creationSlowUntil:number;creationSlowMultiplier:number;creationShieldUntil:number;eventObstacleProtection:boolean;
  slowUntil:number;shieldUntil:number;boostUntil:number;flailUntil:number;immuneUntil:number;sunUntil:number;sunOrigin:Position|null;nextUse:number;aiLock:TargetLock;dodgeReaction:RivalDodgeReaction;danger:boolean;boostFuel:number;boosting:boolean;dodgeUntil:number;dodgeReady:number;dodgeDirection:SteeringInput;sunVictims:Set<number>;
};
export type Projectile={id:number;owner:number;position:Position;velocity:Position;target?:number;expires:number};
export type Pickup={id:number;position:Position;rotation?:Position;active:boolean};
export type Ring={id:number;position:Position;used:Set<number>;radius?:number;duration?:number;fuel?:number};
const distance=(a:Position,b:Position)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export class PracticeRace {
  elapsed=0;racers:Racer[]=[];obstacles:Obstacle[]=[];boxes:Pickup[]=[];rings:Ring[]=[];projectiles:Projectile[]=[];
  feedback='';feedbackUntil=0;
  private announce(message:string){this.feedback=message;this.feedbackUntil=this.elapsed+2;}
  private seed=42;private shotId=0;
  readonly eventBridge?:RaceEventBridge;
  movementSegments:readonly RacerSegment[]=[];
  constructor(private courseEnabled=true,private seedSource:()=>number=Math.random,readonly events?:RaceEventPort) {
    this.eventBridge=events?new RaceEventBridge(events):undefined;this.reset();
  }
  eventRacers():EventRacer[] {
    return this.racers.map(racer=>({id:String(racer.id),position:this.snapshot(racer).position,
      velocity:racer.finishTime===undefined?racer.controller.getWorldVelocity():[0,0,0],
      finished:racer.finishTime!==undefined,protected:this.protected(racer)}));
  }
  private random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  reset(){
    this.eventBridge?.reset();this.movementSegments=[];
    this.feedback='';this.feedbackUntil=0;this.elapsed=0;this.seed=Math.floor(this.seedSource()*4294967296)>>>0;this.shotId=0;this.projectiles=[];
    this.racers=['Greg','Linda','Steve','Susan'].map((name,id)=>({
      id,name,incidents:0,controller:new FreefallController(LANE_HALF_WIDTH,(id-1.5)*5,0),
      target:[0,0],decision:0,brakeUntil:0,item:null,
      creationSlowUntil:0,creationSlowMultiplier:1,creationShieldUntil:0,eventObstacleProtection:false,
      slowUntil:0,shieldUntil:0,boostUntil:0,flailUntil:0,immuneUntil:0,sunUntil:0,sunOrigin:null,nextUse:0,aiLock:new TargetLock(),dodgeReaction:new RivalDodgeReaction(),danger:false,boostFuel:0,boosting:false,dodgeUntil:0,dodgeReady:0,dodgeDirection:{x:1,z:0},sunVictims:new Set(),
    }));
    this.obstacles=this.courseEnabled?makeCourse():[];
    this.boxes=this.courseEnabled?makeItemBoxes(this.obstacles,()=>this.random()):[];
    this.rings=this.courseEnabled?[
      {id:0,position:[12,-300,0],used:new Set<number>(),fuel:2},
      {id:1,position:[-12,-1200,8],used:new Set<number>(),fuel:2},
      ...this.obstacles.filter(o=>o.kind==='duct'&&(o.id===1004||o.id===1007)).map(o=>({
        id:o.id,position:[o.position[0],o.position[1]-7,o.position[2]] as Position,used:new Set<number>(),radius:3,fuel:4,
      })),
    ]:[];
  }
  dodge(owner:number,input:SteeringInput){
    const racer=this.racers[owner];
    if(!racer||racer.finishTime!==undefined||this.elapsed<racer.dodgeReady)return false;
    const length=Math.hypot(input.x,input.z);
    racer.dodgeDirection=length?{x:input.x/length,z:input.z/length}:{x:1,z:0};
    racer.dodgeUntil=this.elapsed+0.35;racer.dodgeReady=this.elapsed+DODGE_COOLDOWN;
    for(const shot of this.projectiles)if(shot.target===owner)shot.target=undefined;
    return true;
  }
  protected(racer:Racer){
    return this.elapsed<Math.max(racer.shieldUntil,racer.creationShieldUntil)||this.elapsed<racer.immuneUntil||this.elapsed<racer.dodgeUntil-0.1;
  }
  threat(owner:number){
    const p=this.snapshot(this.racers[owner]).position;
    const shot=this.projectiles.filter(s=>s.target===owner).sort((a,b)=>distance(a.position,p)-distance(b.position,p))[0];
    if(shot)return {kind:'MISSILE INCOMING',position:shot.position};
    const targeting=this.racers.find(r=>r.id!==owner&&r.item==='umbrella'&&r.aiLock.target===owner&&r.aiLock.progress>0);
    return targeting?{kind:'BEING TARGETED',position:this.snapshot(targeting).position}:null;
  }
  snapshot(racer:Racer){return racer.landed??racer.controller.getSnapshot();}
  get finished(){return this.racers.every(r=>r.finishTime!==undefined);}
  order(){return [...this.racers].sort((a,b)=>{
    if(a.finishTime!==undefined||b.finishTime!==undefined)return (a.finishTime??Infinity)-(b.finishTime??Infinity)||a.id-b.id;
    return this.snapshot(a).position[1]-this.snapshot(b).position[1]||a.id-b.id;
  });}
  standings():RaceStanding[]{
    const playerDepth=-this.snapshot(this.racers[0]).position[1];
    return this.order().map((racer,index)=>{
      const depth=-this.snapshot(racer).position[1];
      return {id:racer.id,name:racer.name,place:index+1,progress:Math.max(0,Math.min(1,depth/FINISH_DEPTH)),gap:depth-playerDepth,finished:racer.finishTime!==undefined};
    });
  }
  eligibleTarget(owner:number,target:number,lookUp:boolean){
    const a=this.racers[owner],b=this.racers[target];
    if(!a||!b||a===b||b.finishTime!==undefined||this.elapsed<b.dodgeUntil)return false;
    const p=this.snapshot(a).position,q=this.snapshot(b).position;
    return (lookUp?q[1]>p[1]:q[1]<p[1])&&distance(p,q)<=180;
  }
  useItem(owner:number,lookUp:boolean,target?:number){
    const racer=this.racers[owner];
    if(!racer||racer.finishTime!==undefined||!racer.item)return false;
    const item=racer.item;racer.item=null;
    if(item==='cloak')racer.shieldUntil=this.elapsed+5;
    if(item==='sun'){
      racer.sunUntil=this.elapsed+SUN_DURATION;racer.sunVictims.clear();let cleared=0;
      const p=this.snapshot(racer).position;
      racer.sunOrigin=[...p];
      for(const obstacle of this.obstacles)if(obstacle.active&&distance(p,obstaclePose(obstacle,this.elapsed).position)<=12){
        obstacle.active=false;obstacle.hitAt=this.elapsed;cleared++;
      }
      if(owner===0)this.announce(cleared?'SUN BURST — '+cleared+' obstacles cleared':'SUN BURST — No obstacles in range');
    }

    if(item==='umbrella'){
      const state=this.snapshot(racer);
      const targetId=target!==undefined&&this.eligibleTarget(owner,target,lookUp)?target:undefined;
      const velocity:Position=[0,(lookUp?60:-60)-state.fallSpeed,0];
      this.projectiles.push({id:this.shotId++,owner,position:[...state.position],velocity,target:targetId,expires:this.elapsed+(targetId===undefined?4:8)});
    }
    return true;
  }
  applyCreationEffects(effects:PowerUpEffect[]) {
    const player=this.racers[0];
    if (player.finishTime!==undefined) return;
    for (const effect of effects) {
      if (effect.type==='reduceFallSpeed') {
        player.creationSlowUntil=this.elapsed+effect.durationSeconds;
        player.creationSlowMultiplier=effect.multiplier;
      } else if (effect.type==='invulnerability') player.creationShieldUntil=this.elapsed+effect.durationSeconds;
      else {
        const position=this.snapshot(player).position;
        for (const obstacle of this.obstacles) if (obstacle.active && distance(position,obstaclePose(obstacle,this.elapsed).position)<=effect.radiusMeters) {
          obstacle.active=false;obstacle.hitAt=this.elapsed;
        }
      }
    }
  }
  step(dt:number,input:SteeringInput,brake:boolean,boost=false){
    if(this.finished||dt<=0||!Number.isFinite(dt))return;
    // The real scene already supplies 1/120 s. Reject unsupported event ticks before mutation.
    if(this.eventBridge&&dt>RACE_EVENT_LIMITS.maxStepSeconds)throw new Error('Race events require a fixed step of at most 1/30 s.');
    const eventInputs=this.eventBridge?.beforeStep(dt,this.eventRacers())??{};
    const segments:RacerSegment[]=[];
    const old=this.racers.map(r=>this.snapshot(r).position);
    const places=new Map(this.order().map((racer,index)=>[racer.id,index+1]));
    for(const racer of this.racers){
      if(racer.finishTime!==undefined)continue;
      racer.eventObstacleProtection=eventInputs[String(racer.id)]?.obstacleProtection??false;
      let steering=input;
      if(racer.id===0)racer.controller.braking=brake;
      else {
        if(this.elapsed>=racer.decision){
          racer.danger=planRival(this,racer);
          racer.decision=this.elapsed+0.25+(racer.id===1?0.1:0);
        }
        const p=this.snapshot(racer).position;
        steering={x:(racer.target[0]-p[0])*0.8,z:(racer.target[1]-p[2])*0.8};
        racer.controller.braking=this.elapsed<racer.brakeUntil;
        const nearby=this.obstacles.some(o=>o.active&&distance(p,obstaclePose(o,this.elapsed).position)<=12);
        const rival=this.racers.filter(r=>r.id!==racer.id&&r.finishTime===undefined&&Math.max(r.shieldUntil,r.creationShieldUntil)<=this.elapsed)
          .filter(r=>this.eligibleTarget(racer.id,r.id,this.snapshot(r).position[1]>p[1]))
          .sort((a,b)=>this.snapshot(a).position[1]-this.snapshot(b).position[1])[0];
        const up=rival?this.snapshot(rival).position[1]>p[1]:false;
        const currentEligible=racer.aiLock.target===undefined||this.eligibleTarget(racer.id,racer.aiLock.target,up);
        const locked=racer.item==='umbrella'?racer.aiLock.update(rival?.id,dt,up,currentEligible):undefined;
        if(racer.item!=='umbrella')racer.aiLock.reset();
        if(racer.item&&this.elapsed>=racer.nextUse){
          const use=racer.item==='umbrella'?locked!==undefined:racer.item==='cloak'?racer.danger:nearby;
          if(use){this.useItem(racer.id,up,locked);racer.nextUse=this.elapsed+1;racer.aiLock.reset();}
        }
      }
      if(racer.id!==0&&racer.dodgeReaction.update(racer.id,this.snapshot(racer).position,this.projectiles,this.elapsed,racer.dodgeReady,()=>this.random()))
        this.dodge(racer.id,{x:racer.id%2?1:-1,z:0});
      const wantsBoost=racer.id===0?boost:!racer.danger&&this.elapsed>=racer.slowUntil;
      racer.boosting=wantsBoost&&!racer.controller.braking&&racer.boostFuel>0;
      const boostSeconds=racer.boosting?Math.min(dt,racer.boostFuel):0;
      racer.boostFuel=Math.max(0,racer.boostFuel-boostSeconds);
      racer.boostUntil=racer.boosting?this.elapsed+boostSeconds:0;
      const dodging=this.elapsed<racer.dodgeUntil;
      if(dodging)steering=racer.dodgeDirection;
      const flailing=!dodging&&this.elapsed<racer.flailUntil;
      // Match controller input bounds before applying the flail penalty.
      const x=Math.max(-1,Math.min(1,steering.x)),z=Math.max(-1,Math.min(1,steering.z));
      const steeringScale=(flailing?0.3:1)/Math.max(1,Math.hypot(x,z));
      const motion=racer.controller.step(dt,{x:x*steeringScale,z:z*steeringScale},{
        fallSpeedMultiplier:Math.min(this.elapsed<racer.slowUntil?0.5:1,this.elapsed<racer.creationSlowUntil?racer.creationSlowMultiplier:1),boostSeconds,steerSpeed:dodging?36:undefined,eventInput:eventInputs[String(racer.id)],
      });
      const endFraction=motion.position[1]<=-FINISH_DEPTH
        ?Math.max(0,Math.min(1,(-FINISH_DEPTH-motion.previousPosition[1])/(motion.position[1]-motion.previousPosition[1]))):1;
      segments.push({id:String(racer.id),from:motion.previousPosition,to:motion.position,endFraction});
      for(const box of this.boxes)if(box.active&&segmentSphere(motion.previousPosition,motion.position,box.position,ITEM_PICKUP_RADIUS)){
        if(racer.item){
          if(racer.id===0&&this.feedbackUntil<=this.elapsed)this.announce('ITEM SLOT FULL');
        }else{
          box.active=false;racer.item=itemForPlace(places.get(racer.id)!,this.random());
          if(racer.id===0)this.announce('PICKED UP — '+({umbrella:'Jellyfish umbrella',cloak:'Ghost cloak',sun:'Angry sun'})[racer.item]);
        }
      }
      for(const ring of this.rings)if(!ring.used.has(racer.id)&&motion.previousPosition[1]>ring.position[1]&&motion.position[1]<=ring.position[1]){
        const t=(ring.position[1]-motion.previousPosition[1])/(motion.position[1]-motion.previousPosition[1]);
        const x=motion.previousPosition[0]+(motion.position[0]-motion.previousPosition[0])*t,z=motion.previousPosition[2]+(motion.position[2]-motion.previousPosition[2])*t;
        if(Math.hypot(x-ring.position[0],z-ring.position[2])<=(ring.radius??5)){ring.used.add(racer.id);racer.boostFuel=Math.min(BOOST_CAPACITY,racer.boostFuel+(ring.fuel??2));if(racer.id===0)this.announce((ring.fuel??2)>2?'PIPE BONUS · BOOST FUEL +100%':'BOOST FUEL +50%');}
      }
      if(!this.protected(racer))for(const obstacle of this.obstacles){
        if(!obstacle.active||Math.abs(obstacle.position[1]-motion.position[1])>20)continue;
        const penalty=obstacleHit(motion.previousPosition,motion.position,obstacle,this.elapsed);
        if(penalty!==null){
          if(racer.eventObstacleProtection){this.events?.recordObstacleBlock?.(String(racer.id),obstacle.id);continue;}
          const rules=OBSTACLE_RULES[obstacle.kind];
          racer.controller.impact(penalty,[(motion.position[0]>=obstacle.position[0]?1:-1)*rules.knockback,0,(motion.position[2]>=obstacle.position[2]?1:-1)*rules.knockback]);
          racer.incidents++;racer.flailUntil=this.elapsed+rules.flail;racer.immuneUntil=this.elapsed+1.5;
          if(obstacle.kind!=='duct'){obstacle.active=false;obstacle.hitAt=this.elapsed;}break;
        }
      }
      if(motion.position[1]<=-FINISH_DEPTH){
        const t=(-FINISH_DEPTH-motion.previousPosition[1])/(motion.position[1]-motion.previousPosition[1]);
        racer.controller.clearExternalMotion();racer.eventObstacleProtection=false;
        racer.finishTime=this.elapsed+dt*t;racer.landed={fallSpeed:0,position:[
          motion.previousPosition[0]+(motion.position[0]-motion.previousPosition[0])*t,-FINISH_DEPTH,
          motion.previousPosition[2]+(motion.position[2]-motion.previousPosition[2])*t]};
      }
    }
    for(const attacker of this.racers)if(attacker.sunOrigin&&this.elapsed<attacker.sunUntil){
      const radius=12*Math.min(1,(this.elapsed-(attacker.sunUntil-SUN_DURATION))/0.35);
      for(const victim of this.racers){
        if(victim.id===attacker.id||victim.finishTime!==undefined||attacker.sunVictims.has(victim.id))continue;
        const p=this.snapshot(victim).position;
        if(distance(p,attacker.sunOrigin)>radius)continue;
        if(!this.protected(victim)){
          attacker.sunVictims.add(victim.id);
          const dx=p[0]-attacker.sunOrigin[0],dz=p[2]-attacker.sunOrigin[2],length=Math.hypot(dx,dz)||1;
          victim.controller.impact(0.5,[dx/length*4,0,dz/length*4]);
          victim.incidents++;victim.flailUntil=this.elapsed+0.6;victim.immuneUntil=this.elapsed+1.5;
          if(victim.id===0)this.announce('HIT BY ANGRY SUN');
          else if(attacker.id===0)this.announce('SUN HIT — '+victim.name);
        }
      }
    }
    for(const shot of this.projectiles){
      if(shot.expires<=this.elapsed)continue;
      const before:Position=[...shot.position];
      const target=shot.target===undefined?undefined:this.racers[shot.target];
      if(target&&target.finishTime===undefined){
        const q=this.snapshot(target).position;
        // A confirmed lock pursues in all three axes faster than any racer.
        // Clamp travel to the target distance to avoid overshooting nearby targets.
        const d=distance(q,shot.position);
        const speed=Math.min(75,d/dt);
        shot.velocity=q.map((value,i)=>(value-shot.position[i])/(d||1)*speed) as Position;
      }
      shot.position=shot.position.map((v,i)=>v+shot.velocity[i]*dt) as Position;
      for(const victim of this.racers){
        if(victim.id===shot.owner||victim.finishTime!==undefined||(shot.target!==undefined&&victim.id!==shot.target))continue;
        const now=this.snapshot(victim).position;
        const a=before.map((v,i)=>v-old[victim.id][i]) as Position;
        const b=shot.position.map((v,i)=>v-now[i]) as Position;
        if(segmentSphere(a,b,[0,0,0],1.1)){
          if(!this.protected(victim))victim.slowUntil=this.elapsed+3;
          if(shot.owner===0)this.announce(this.protected(victim)?'SHOT BLOCKED':'UMBRELLA HIT — '+victim.name);
          shot.expires=0;break;
        }
      }
    }
    this.movementSegments=segments;
    this.eventBridge?.afterStep(this.eventRacers(),segments);
    if(this.events?.getSnapshot().phase!=='active')for(const racer of this.racers)racer.eventObstacleProtection=false;
    if(this.finished)this.eventBridge?.reset();
    this.elapsed+=dt;
    this.projectiles=this.projectiles.filter(shot=>shot.expires>this.elapsed);
  }
}
