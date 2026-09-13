import {
  RACE_EVENT_LIMITS, SAFETY_DRILL_LIMITS,
  type DrillActor, type DrillImpact, type DrillSnapshot, type EventRacer,
  type EventVector, type RacerEventInput, type RacerSegment, type SafetyDrillRecipe,
} from '@sky/shared';
import { add, clampLength, contactTime, direction, dot, length, scale, seededRandom, subtract } from './math';
import { createDrillBands, emptyDrillImpact, emptyStepInputs, increment, inDrillCourse, type DrillMechanic } from './drill-mechanics';

type PinballRecipe = Extract<SafetyDrillRecipe, {family:'pinball'}>;
const BUMPER_RADIUS = 5;
const REBOUND_COOLDOWN = 0.45;
const EXIT_MARGIN = 0.25;

/** Static shared bumpers return impulses; player movement remains in the race controller. */
export class PinballDrill implements DrillMechanic {
  private readonly actors:DrillActor[]=[];
  private readonly lastBounce=new Map<string,number>();
  private readonly bounces:Record<string,number>={};
  private age=0;

  constructor(private readonly recipe:PinballRecipe,seed:number,racers:readonly EventRacer[]) {
    const random=seededRandom(seed);
    for(const band of createDrillBands(racers)) {
      for(let index=0;index<SAFETY_DRILL_LIMITS.actorCount&&this.actors.length<SAFETY_DRILL_LIMITS.maxActors;index++) {
        const row=Math.floor(index/4),column=index%4;
        const spread=recipe.layout==='funnel'?(row===0?11:5):11;
        const stagger=recipe.layout==='staggered'?(row%2?3:-3):0;
        const offset:EventVector=[(column-1.5)*spread+stagger,-row*95,(random()-0.5)*4];
        this.actors.push({id:this.actors.length,kind:'bumper',
          position:inDrillCourse(add(band.origin,offset),BUMPER_RADIUS),radius:BUMPER_RADIUS,
          velocity:[0,0,0],state:'warning'});
      }
    }
  }

  prepareStep(age:number,_dt:number,racers:readonly EventRacer[]):Record<string,RacerEventInput> {
    this.age=age;
    return emptyStepInputs(racers);
  }

  resolveContacts(segments:readonly RacerSegment[],racers:readonly EventRacer[]):Map<string,EventVector> {
    const impulses=new Map<string,EventVector>();
    if(this.age<SAFETY_DRILL_LIMITS.warningSeconds||this.age>=SAFETY_DRILL_LIMITS.durationSeconds)return impulses;
    const byId=new Map(racers.map(racer=>[racer.id,racer]));
    for(const segment of segments) {
      const racer=byId.get(segment.id);
      if(!racer||racer.finished)continue;
      for(const actor of this.actors) {
        const radius=actor.radius+RACE_EVENT_LIMITS.racerRadius;
        const key=JSON.stringify([actor.id,racer.id]);
        const last=this.lastBounce.get(key);
        // Leaving the body is required before a later bounce: a slow or blocked
        // racer cannot accumulate impulses by remaining inside the same bumper.
        if(last!==undefined&&(this.age-last<REBOUND_COOLDOWN||length(subtract(segment.from,actor.position))<=radius+EXIT_MARGIN))continue;
        const t=contactTime(segment.from,segment.to,actor.position,radius);
        if(t===undefined||t>(segment.endFraction??1))continue;
        const contact=add(segment.from,scale(subtract(segment.to,segment.from),t));
        const offset=subtract(contact,actor.position);
        const normal=direction(length(offset)>1e-6?offset:scale(racer.velocity,-1));
        const inward=dot(racer.velocity,normal);
        // Already moving away from an overlapping bumper is not a fresh impact.
        if(inward>=0)continue;
        const restitution=this.recipe.bounce==='springy'?1.25:0.1;
        const minimumKick=this.recipe.bounce==='springy'?24:12;
        const magnitude=Math.max(minimumKick,-(1+restitution)*inward);
        const kick=scale(normal,magnitude);
        impulses.set(racer.id,clampLength(add(impulses.get(racer.id)??[0,0,0],kick),RACE_EVENT_LIMITS.maxVelocityDelta));
        this.lastBounce.set(key,this.age);
        increment(this.bounces,racer.id);
      }
    }
    return impulses;
  }

  getSnapshot():DrillSnapshot {
    return {actors:this.actors.map(actor=>({...actor,state:this.age<SAFETY_DRILL_LIMITS.warningSeconds?'warning':'moving'})),
      currents:[],warningSeconds:Math.max(0,SAFETY_DRILL_LIMITS.warningSeconds-this.age)};
  }

  getImpact():DrillImpact {return {...emptyDrillImpact(),bounces:{...this.bounces}};}
}
