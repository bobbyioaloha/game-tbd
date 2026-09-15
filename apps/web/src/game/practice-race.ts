import { raceLineup, type PlayableCharacter } from './characters';
import { itemForPlace, RivalDodgeReaction } from './race-balance';
// Race item boxes have a forgiving pickup volume independent of model size.
import { planRival } from './rival-planner';
import { TargetLock } from './target-lock';
import { RACE_EVENT_LIMITS, type EventRacer, type RaceEventPort, type RaceEventSnapshot, type RacerSegment, type PowerUpEffect } from '@sky/shared';
import { RaceEventBridge } from '../race-events/bridge';
import { FreefallController } from './freefall-controller';
import type { PlayerSnapshot, SteeringInput, Position } from './player-controller';
import { makeCourse, seededRandom, makeItemBoxes, makeFuelRings, obstacleHit, obstaclePose, OBSTACLE_RULES, ITEM_NAMES, segmentSphere, type Item, type Obstacle } from './race-course';

export const FINISH_DEPTH = 3600;
export const LANE_HALF_WIDTH = 36;
export const ITEM_PICKUP_RADIUS = 3.5;
export const DODGE_COOLDOWN = 15;
export const AIR_CANISTER_DURATION = 2;
export const BOOST_CAPACITY = 4;
export type RaceStanding={id:number;name:string;color:string;place:number;progress:number;gap:number;finished:boolean};
export type Racer = {
  id:number;name:string;color:string;model:PlayableCharacter|null;incidents:number;controller:FreefallController;landed?:PlayerSnapshot;finishTime?:number;
  aiRandom:()=>number;temperament:number;wander:[number,number];maneuverUntil:number;target:[number,number];decision:number;brakeUntil:number;item:Item|null;
  creationSlowUntil:number;creationSlowMultiplier:number;creationShieldUntil:number;eventObstacleProtection:boolean;
  slowUntil:number;shieldUntil:number;boostUntil:number;flailUntil:number;immuneUntil:number;airCanisterUntil:number;nextUse:number;aiLock:TargetLock;dodgeReaction:RivalDodgeReaction;danger:boolean;boostFuel:number;boosting:boolean;dodgeUntil:number;dodgeReady:number;dodgeDirection:SteeringInput;
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
  private drillIncidentInstance?:string;
  private readonly recordedDrillCollisions=new Map<string,number>();
  readonly eventBridge?:RaceEventBridge;
  movementSegments:readonly RacerSegment[]=[];
  private completedEvent?:RaceEventSnapshot;
  get finalEventSnapshot(){return this.completedEvent;}
  constructor(private courseEnabled=true,private seedSource:()=>number=Math.random,readonly events?:RaceEventPort) {
    this.eventBridge=events?new RaceEventBridge(events):undefined;this.reset();
  }
  eventRacers():EventRacer[] {
    return this.racers.map(racer=>({id:String(racer.id),position:this.snapshot(racer).position,
      velocity:racer.finishTime===undefined?racer.controller.getWorldVelocity():[0,0,0],
      finished:racer.finishTime!==undefined,protected:this.protected(racer)}));
  }
  private random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  private selectedCharacter:PlayableCharacter='greg';
  selectCharacter(character:PlayableCharacter){
    if(this.elapsed!==0)throw new Error('Reset the race before changing personnel');
    const lineup=raceLineup(character);
    this.selectedCharacter=character;
    // Identity only: preserve prepared course, fixtures, controllers and run consent.
    this.racers.forEach((racer,index)=>{
      const person=lineup[index];
      racer.name=person.name;racer.color=person.color;racer.model=person.model;
    });
  }
  reset(){
    this.eventBridge?.reset();this.movementSegments=[];this.completedEvent=undefined;
    this.drillIncidentInstance=undefined;this.recordedDrillCollisions.clear();
    this.feedback='';this.feedbackUntil=0;this.elapsed=0;this.seed=Math.floor(this.seedSource()*4294967296)>>>0;this.shotId=0;this.projectiles=[];
    this.racers=raceLineup(this.selectedCharacter).map((person,id)=>({
      id,name:person.name,color:person.color,model:person.model,incidents:0,controller:new FreefallController(LANE_HALF_WIDTH,(id-1.5)*5,0),
      aiRandom:seededRandom(this.seed^(id*0x45d9f3b)),temperament:id===1?0.25:id===2?0.6:0.95,wander:[0,0],maneuverUntil:0,target:[0,0],decision:0,brakeUntil:0,item:null,
      creationSlowUntil:0,creationSlowMultiplier:1,creationShieldUntil:0,eventObstacleProtection:false,
      slowUntil:0,shieldUntil:0,boostUntil:0,flailUntil:0,immuneUntil:0,airCanisterUntil:0,nextUse:0,aiLock:new TargetLock(),dodgeReaction:new RivalDodgeReaction(),danger:false,boostFuel:0,boosting:false,dodgeUntil:0,dodgeReady:0,dodgeDirection:{x:1,z:0},
    }));
    this.obstacles=this.courseEnabled?makeCourse(seededRandom(this.seed^0x51f15e)):[];
    this.boxes=this.courseEnabled?makeItemBoxes(this.obstacles,()=>this.random()):[];
    this.rings=this.courseEnabled?[
      ...makeFuelRings(this.obstacles,seededRandom(this.seed^0x713a)),
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
    if(shot)return {kind:'PARACHUTE INCOMING',position:shot.position};
    const targeting=this.racers.find(r=>r.id!==owner&&r.item==='parachute'&&r.aiLock.target===owner&&r.aiLock.progress>0);
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
      return {id:racer.id,name:racer.name,color:racer.color,place:index+1,progress:Math.max(0,Math.min(1,depth/FINISH_DEPTH)),gap:depth-playerDepth,finished:racer.finishTime!==undefined};
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
    if(item==='bubbleWrap')racer.shieldUntil=this.elapsed+5;
    if(item==='airCanister'){
      racer.airCanisterUntil=this.elapsed+AIR_CANISTER_DURATION;
      if(owner===0)this.announce('AIR CANISTER - RESERVE THRUST');
    }

    if(item==='parachute'){
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
  private recordDrillIncidents(){
    const event=this.events?.getSnapshot();
    if(event?.instance?.spec.version!==4)return;
    if(this.drillIncidentInstance!==event.instance.instanceId){
      this.drillIncidentInstance=event.instance.instanceId;this.recordedDrillCollisions.clear();
    }
    // Runtime totals survive expiration; consume only new unprotected contacts.
    for(const racer of this.racers){
      const id=String(racer.id),total=event.impact?.drill?.collisions[id]??0;
      const recorded=this.recordedDrillCollisions.get(id)??0;
      racer.incidents+=Math.max(0,total-recorded);
      this.recordedDrillCollisions.set(id,Math.max(recorded,total));
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
          racer.decision=this.elapsed+0.20+racer.aiRandom()*0.22+(1-racer.temperament)*0.10;
        }
        const p=this.snapshot(racer).position;
        steering={x:(racer.target[0]-p[0])*0.8,z:(racer.target[1]-p[2])*0.8};
        racer.controller.braking=this.elapsed<racer.brakeUntil;
        const rival=this.racers.filter(r=>r.id!==racer.id&&r.finishTime===undefined&&Math.max(r.shieldUntil,r.creationShieldUntil)<=this.elapsed)
          .filter(r=>this.eligibleTarget(racer.id,r.id,this.snapshot(r).position[1]>p[1]))
          .sort((a,b)=>this.snapshot(a).position[1]-this.snapshot(b).position[1])[0];
        const up=rival?this.snapshot(rival).position[1]>p[1]:false;
        const currentEligible=racer.aiLock.target===undefined||this.eligibleTarget(racer.id,racer.aiLock.target,up);
        const locked=racer.item==='parachute'?racer.aiLock.update(rival?.id,dt,up,currentEligible):undefined;
        if(racer.item!=='parachute')racer.aiLock.reset();
        if(racer.item&&this.elapsed>=racer.nextUse){
          const clearForThrust=!racer.danger&&!racer.controller.braking&&this.elapsed>=Math.max(racer.slowUntil,racer.creationSlowUntil,racer.flailUntil,racer.airCanisterUntil);
          const use=racer.item==='parachute'?locked!==undefined:racer.item==='bubbleWrap'?racer.danger:clearForThrust;
          if(use){this.useItem(racer.id,up,locked);racer.nextUse=this.elapsed+1;racer.aiLock.reset();}
        }
      }
      if(racer.id!==0&&racer.dodgeReaction.update(racer.id,this.snapshot(racer).position,this.projectiles,this.elapsed,racer.dodgeReady,racer.aiRandom))
        this.dodge(racer.id,{x:racer.id%2?1:-1,z:0});
      if(racer.controller.braking)racer.airCanisterUntil=0;
      // Reserve thrust funds the start of this tick; normal boost pays only for
      // the remainder after expiry. Both use the same acceleration and speed cap.
      const reserveSeconds=Math.min(dt,Math.max(0,racer.airCanisterUntil-this.elapsed));
      const wantsBoost=racer.id===0?boost:!racer.danger&&this.elapsed>=racer.slowUntil;
      const fuelSeconds=wantsBoost&&!racer.controller.braking?Math.min(dt-reserveSeconds,racer.boostFuel):0;
      const boostSeconds=reserveSeconds+fuelSeconds;
      racer.boostFuel=Math.max(0,racer.boostFuel-fuelSeconds);
      racer.boosting=boostSeconds>0;
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
          if(racer.id===0)this.announce('PICKED UP — '+ITEM_NAMES[racer.item]);
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
        racer.airCanisterUntil=0;racer.boostUntil=0;racer.boosting=false;
        racer.finishTime=this.elapsed+dt*t;racer.landed={fallSpeed:0,position:[
          motion.previousPosition[0]+(motion.position[0]-motion.previousPosition[0])*t,-FINISH_DEPTH,
          motion.previousPosition[2]+(motion.position[2]-motion.previousPosition[2])*t]};
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
          if(shot.owner===0)this.announce(this.protected(victim)?'SHOT BLOCKED':'PARACHUTE HIT — '+victim.name);
          shot.expires=0;break;
        }
      }
    }
    this.movementSegments=segments;
    this.eventBridge?.afterStep(this.eventRacers(),segments);
    this.recordDrillIncidents();
    if(this.events?.getSnapshot().phase!=='active')for(const racer of this.racers)racer.eventObstacleProtection=false;
    if(this.finished) {
      // Contacts on the landing tick still count. Save only report data before
      // clearing live effects, so the host can observe that tick after step().
      const event=this.events?.getSnapshot();
      if(event?.instance)this.completedEvent={...event,debris:[],drill:undefined,
        phase:'expired',remainingSeconds:0,
        expirationReason:event.expirationReason??'complete'};
      this.eventBridge?.reset();
      for(const racer of this.racers)racer.eventObstacleProtection=false;
    }
    this.elapsed+=dt;
    this.projectiles=this.projectiles.filter(shot=>shot.expires>this.elapsed);
  }
}
