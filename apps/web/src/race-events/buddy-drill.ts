import { SAFETY_DRILL_LIMITS, RACE_EVENT_LIMITS, type SafetyDrillRecipe, type EventRacer,
  type EventVector, type RacerSegment, type DrillSnapshot, type DrillTether } from '@sky/shared';
import { emptyDrillImpact, emptyStepInputs, increment, type DrillMechanic } from './drill-mechanics';
import { subtract, scale, add, length, dot, clampLength } from './math';

type Recipe = Extract<SafetyDrillRecipe, {family:'buddy'}>;
type Pair = {id:number;ids:readonly [string,string];released:boolean;visual:DrillTether};
export const BUDDY_LIMITS = Object.freeze({maxPairs:SAFETY_DRILL_LIMITS.maxTethers,restLength:8,maxSeparation:180,maxVerticalPairing:90,
  spring:2.6,damping:1.2,maxAcceleration:24,pulsePeriod:2.4,pulseSlack:0.8});

/** Pairs are chosen once. Tethers apply balanced horizontal forces, never position corrections. */
export class BuddyDrill implements DrillMechanic {
  private readonly pairs:Pair[]=[];
  private readonly report=emptyDrillImpact();
  private age=0;
  constructor(private readonly recipe:Recipe,_seed:number,racers:readonly EventRacer[]) {
    const remaining=[...racers].filter(racer=>!racer.finished).sort((a,b)=>a.id.localeCompare(b.id));
    while(remaining.length>1&&this.pairs.length<BUDDY_LIMITS.maxPairs) {
      const first=remaining.shift()!;
      const options=remaining.filter(racer=>Math.abs(racer.position[1]-first.position[1])<=BUDDY_LIMITS.maxVerticalPairing)
        .sort((a,b)=>{
          // Tethers act horizontally; altitude only filters unsafe pairings.
          const across=(racer:EventRacer)=>Math.hypot(racer.position[0]-first.position[0],racer.position[2]-first.position[2]);
          const distance=across(a)-across(b);
          return (recipe.pairing==='nearest'?distance:-distance)||a.id.localeCompare(b.id);
        });
      const second=options[0];if(!second)continue;
      remaining.splice(remaining.indexOf(second),1);
      const ids:readonly [string,string]=[first.id,second.id],id=this.pairs.length;
      this.pairs.push({id,ids,released:false,visual:{id,racerIds:ids,from:[...first.position],to:[...second.position],
        restLength:BUDDY_LIMITS.restLength,tension:0,active:false}});
    }
  }
  prepareStep(age:number,dt:number,racers:readonly EventRacer[]) {
    this.age=age;
    const inputs=emptyStepInputs(racers),byId=new Map(racers.map(racer=>[racer.id,racer]));
    const time=Math.max(0,age-SAFETY_DRILL_LIMITS.warningSeconds);
    const active=age>=SAFETY_DRILL_LIMITS.warningSeconds&&age<SAFETY_DRILL_LIMITS.durationSeconds
      &&(this.recipe.tether==='elastic'||time%BUDDY_LIMITS.pulsePeriod>=BUDDY_LIMITS.pulseSlack);
    for(const pair of this.pairs) {
      const first=byId.get(pair.ids[0]),second=byId.get(pair.ids[1]);
      if(pair.released)continue;
      if(!first||!second||first.finished||second.finished||length(subtract(second.position,first.position))>BUDDY_LIMITS.maxSeparation) {
        pair.released=true;pair.visual={...pair.visual,active:false,tension:0};continue;
      }
      const delta=subtract(second.position,first.position),horizontal:EventVector=[delta[0],0,delta[2]];
      const distance=length(horizontal),axis=distance>1e-6?scale(horizontal,1/distance):[0,0,0] as const;
      const stretch=Math.max(0,distance-BUDDY_LIMITS.restLength);
      const separating=dot(subtract(second.velocity,first.velocity),axis);
      const force=active&&stretch>0?Math.min(BUDDY_LIMITS.maxAcceleration,Math.max(0,
        stretch*BUDDY_LIMITS.spring+separating*BUDDY_LIMITS.damping)):0;
      pair.visual={...pair.visual,from:[...first.position],to:[...second.position],active,
        tension:force/BUDDY_LIMITS.maxAcceleration};
      if(force===0)continue;
      const pull=clampLength(scale(axis,force),RACE_EVENT_LIMITS.maxAcceleration);
      inputs[first.id].acceleration=add(inputs[first.id].acceleration,pull);
      inputs[second.id].acceleration=subtract(inputs[second.id].acceleration,pull);
      increment(this.report.tetherSeconds,first.id,dt);increment(this.report.tetherSeconds,second.id,dt);
    }
    return inputs;
  }
  resolveContacts(_segments:readonly RacerSegment[],_racers:readonly EventRacer[]):Map<string,EventVector> {return new Map();}
  getSnapshot():DrillSnapshot {
    return {actors:[],currents:[],tethers:this.pairs.filter(pair=>!pair.released).map(pair=>({...pair.visual})),
      warningSeconds:Math.max(0,SAFETY_DRILL_LIMITS.warningSeconds-this.age)};
  }
  getImpact(){return {...this.report,tetherSeconds:{...this.report.tetherSeconds}};}
}
