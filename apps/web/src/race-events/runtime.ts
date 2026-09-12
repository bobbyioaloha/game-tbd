import {
  RaceEventCreationSchema, RACE_EVENT_LIMITS as limits,
  type EventVector, type EventRacer, type EventSpawn, type EventStepInputs, type RacerSegment,
  type RacerEventInput, type RaceEventSnapshot, type RaceEventPort,
} from '@sky/shared';
import { add, subtract, scale, length, direction, clampLength, contactTime, seededRandom, finiteVector } from './math';

type Particle={id:number;velocity:EventVector;collidable:boolean};
const emptyInput=():RacerEventInput=>({acceleration:[0,0,0],velocityDelta:[0,0,0],obstacleProtection:false});

/** No DOM, rendering, networking, timers or movement writes. The host owns the clock. */
export class RaceEventRuntime implements RaceEventPort {
  private instance?:EventSpawn;
  private phase:RaceEventSnapshot['phase']='empty';
  private age=0;
  private previousAge=0;
  private drift:EventVector=[0,0,0];
  private triggerer?:string;
  private racers:EventRacer[]=[];
  private particles:Particle[]=[];
  private hit=new Set<string>();
  private affected=new Set<string>();
  private pending=new Map<string,EventVector>();
  private awaitingContacts=false;
  private expirationReason?:RaceEventSnapshot['expirationReason'];

  spawn(input:EventSpawn) {
    if(this.phase==='collectible'||this.phase==='active')throw new Error('An event creation is already present.');
    if(!input.instanceId||!input.creatorId||!finiteVector(input.position)||!Number.isInteger(input.seed)||input.seed<0||input.seed>0xffffffff)throw new Error('Invalid event spawn metadata.');
    const spec=RaceEventCreationSchema.parse(input.spec);
    this.reset();this.instance={...input,spec,position:[...input.position]};this.phase='collectible';
  }
  reset() {
    this.instance=undefined;this.phase='empty';this.age=0;this.previousAge=0;this.drift=[0,0,0];
    this.triggerer=undefined;this.racers=[];this.particles=[];this.hit.clear();this.affected.clear();
    this.pending.clear();this.awaitingContacts=false;this.expirationReason=undefined;
  }
  private center(age=this.age):EventVector {
    return this.instance?add(this.instance.position,scale(this.drift,age)):[0,0,0];
  }
  private particlePosition(particle:Particle,age=this.age):EventVector {
    return add(this.center(age),scale(particle.velocity,age));
  }
  private expire(reason:NonNullable<RaceEventSnapshot['expirationReason']>) {
    this.phase='expired';this.expirationReason=reason;this.pending.clear();this.particles=[];this.affected.clear();
  }
  private activate(racerId:string) {
    this.phase='active';this.triggerer=racerId;this.age=0;this.previousAge=0;this.affected.clear();
    const effect=this.instance!.spec.effect;
    // A burst stays at contact depth. Persistent fields descend at the pack's activation-time velocity.
    if(effect.type!=='repulsionBurst') {
      const average=this.racers.reduce((sum,racer)=>sum+racer.velocity[1],0)/Math.max(1,this.racers.length);
      this.drift=[0,Math.max(-limits.maxAnchorSpeed,Math.min(0,average)),0];
    }
    if(effect.type==='debrisShower') {
      const random=seededRandom(this.instance!.seed);
      this.particles=Array.from({length:effect.collidableCount+effect.visualCount},(_,id)=>{
        const y=random()*2-1,angle=random()*Math.PI*2,r=Math.sqrt(1-y*y);
        return {id,collidable:id<effect.collidableCount,
          velocity:scale([r*Math.cos(angle),y,r*Math.sin(angle)],effect.speed*(0.45+random()*0.55))};
      });
    }
  }
  prepareStep(dt:number,racers:readonly EventRacer[]):EventStepInputs {
    if(!Number.isFinite(dt)||dt<=0||dt>limits.maxStepSeconds)throw new Error('Use a fixed event step in (0, 1/30] seconds.');
    if(this.awaitingContacts)throw new Error('Resolve contacts before preparing the next event tick.');
    const ids=new Set<string>();
    for(const racer of racers) {
      if(!racer.id||ids.has(racer.id)||!finiteVector(racer.position)||!finiteVector(racer.velocity))throw new Error('Invalid or duplicate racer snapshot.');
      ids.add(racer.id);
    }
    this.racers=racers.filter(racer=>!racer.finished).map(racer=>({...racer,position:[...racer.position],velocity:[...racer.velocity]}));
    this.awaitingContacts=true;this.affected.clear();
    const inputs:Record<string,RacerEventInput>=Object.create(null);
    for(const racer of this.racers) {
      inputs[racer.id]={...emptyInput(),velocityDelta:this.pending.get(racer.id)??[0,0,0]};
      if(length(inputs[racer.id].velocityDelta)>0)this.affected.add(racer.id);
    }
    this.pending.clear();
    if(!this.instance||this.phase==='empty'||this.phase==='expired')return inputs;
    if(!this.racers.length){this.expire('complete');return inputs;}
    this.previousAge=this.age;this.age+=dt;
    if(this.phase==='collectible') {
      if(this.age>=limits.collectibleLifetime)this.expire('lifetime');
      return inputs;
    }
    const effect=this.instance.spec.effect;
    this.age=Math.min(this.age,effect.durationSeconds);
    const center=this.center();
    for(const racer of this.racers) {
      const offset=subtract(racer.position,center),distance=length(offset),input=inputs[racer.id];
      if(effect.type==='gravityWell'&&distance<effect.radiusMeters&&distance>1e-8) {
        // Softened linear field avoids singular forces at the centre.
        input.acceleration=clampLength(scale(offset,-effect.acceleration*(1-distance/effect.radiusMeters)/distance),limits.maxAcceleration);
        this.affected.add(racer.id);
      }
      if(effect.type==='protectiveZone'&&distance<=effect.radiusMeters) {
        input.obstacleProtection=true;this.affected.add(racer.id);
      }
      if(effect.type==='repulsionBurst'&&!this.hit.has(racer.id)&&distance<=effect.radiusMeters*this.age/effect.durationSeconds) {
        input.velocityDelta=clampLength(add(input.velocityDelta,scale(direction(offset),effect.impulse)),limits.maxVelocityDelta);
        this.hit.add(racer.id);this.affected.add(racer.id);
      }
    }
    return inputs;
  }
  resolveContacts(segments:readonly RacerSegment[]) {
    if(!this.awaitingContacts)throw new Error('Prepare the event tick before resolving contacts.');
    this.awaitingContacts=false;
    const byId=new Map(this.racers.map(racer=>[racer.id,racer]));
    const seen=new Set<string>();
    for(const segment of segments) {
      if(seen.has(segment.id)||!finiteVector(segment.from)||!finiteVector(segment.to))throw new Error('Invalid or duplicate movement segment.');
      seen.add(segment.id);
    }
    const active=segments.filter(segment=>byId.has(segment.id));
    if(!this.instance)return;
    if(this.phase==='collectible') {
      const contacts=active.flatMap(segment=>{
        const t=contactTime(segment.from,segment.to,this.instance!.position,limits.collectibleRadius+limits.racerRadius);
        return t===undefined?[]:[{id:segment.id,t}];
      }).sort((a,b)=>a.t-b.t||(a.id<b.id?-1:a.id>b.id?1:0));
      if(contacts[0])this.activate(contacts[0].id);
      else if(this.racers.length&&this.racers.every(racer=>{
        const position=active.find(segment=>segment.id===racer.id)?.to??racer.position;
        return position[1]<this.instance!.position[1]-limits.collectibleRadius-5;
      }))this.expire('passed');
      return;
    }
    if(this.phase!=='active')return;
    const effect=this.instance.spec.effect;
    if(effect.type==='debrisShower')for(const particle of this.particles) {
      if(!particle.collidable)continue;
      for(const segment of active) {
        const key=JSON.stringify([particle.id,segment.id]);
        if(this.hit.has(key))continue;
        const t=contactTime(subtract(segment.from,this.particlePosition(particle,this.previousAge)),
          subtract(segment.to,this.particlePosition(particle)),[0,0,0],limits.debrisRadius+limits.racerRadius);
        if(t===undefined)continue;
        this.hit.add(key);
        if(byId.get(segment.id)?.protected)continue;
        this.pending.set(segment.id,clampLength(add(this.pending.get(segment.id)??[0,0,0],scale(direction(particle.velocity),effect.impulse)),limits.maxVelocityDelta));
        this.affected.add(segment.id);
      }
    }
    if(this.age>=effect.durationSeconds)this.expire('complete');
  }
  getSnapshot():RaceEventSnapshot {
    const active=this.phase==='active';
    const effect=this.instance?.spec.effect;
    return {phase:this.phase,instance:this.instance,triggererId:this.triggerer,position:this.center(),
      elapsedSeconds:this.age,remainingSeconds:this.phase==='collectible'?Math.max(0,limits.collectibleLifetime-this.age):active&&effect?Math.max(0,effect.durationSeconds-this.age):0,
      radius:active&&effect&&'radiusMeters'in effect?effect.radiusMeters*(effect.type==='repulsionBurst'?this.age/effect.durationSeconds:1):0,
      debris:active?this.particles.map(particle=>({id:particle.id,position:this.particlePosition(particle),collidable:particle.collidable})):[],
      affectedRacerIds:[...this.affected].sort(),expirationReason:this.expirationReason};
  }
}
