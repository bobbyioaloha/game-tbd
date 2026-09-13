import { SAFETY_DRILL_LIMITS, RACE_EVENT_LIMITS, type SafetyDrillRecipe, type EventRacer,
  type EventVector, type RacerSegment, type DrillSnapshot, type DrillObserver } from '@sky/shared';
import { createDrillBands, emptyDrillImpact, emptyStepInputs, increment, inDrillCourse,
  insideObservationCone, type DrillMechanic } from './drill-mechanics';
import { add, subtract, scale, direction, dot, clampLength, seededRandom } from './math';

type Recipe = Extract<SafetyDrillRecipe, {family:'observation'}>;
type Inspector = {id:number;position:EventVector;phase:number;side:number};
export const OBSERVATION_LIMITS = Object.freeze({range:85,halfAngle:Math.PI/6,maxObservers:SAFETY_DRILL_LIMITS.maxObservers,
  patientGrace:0.35,strictGrace:0.12,patientThreshold:3,strictThreshold:2,
  patientWatch:1.2,strictWatch:1.45,patientRest:1.4,strictRest:0.75,cooldownSeconds:1.5,
  turnWarningSeconds:0.3,impulse:18});

type ContactInterval = readonly [number,number];
/** Eligible fractions of a swept center segment inside the exact rendered finite cone. */
function coneContactIntervals(segment:RacerSegment,observer:DrillObserver):ContactInterval[] {
  const upper=Math.max(0,Math.min(1,segment.endFraction??1));if(upper===0)return [];
  const offset=subtract(segment.from,observer.position),delta=subtract(segment.to,segment.from);
  const axial=dot(offset,observer.direction),speed=dot(delta,observer.direction);
  const cuts=[0,upper];
  if(Math.abs(speed)>1e-9)cuts.push(-axial/speed,(observer.range-axial)/speed);
  const inverseCosSquared=1/(observer.cosHalfAngle*observer.cosHalfAngle);
  const a=dot(delta,delta)-speed*speed*inverseCosSquared;
  const b=2*(dot(offset,delta)-axial*speed*inverseCosSquared);
  const c=dot(offset,offset)-axial*axial*inverseCosSquared;
  if(Math.abs(a)<1e-9){if(Math.abs(b)>1e-9)cuts.push(-c/b);}
  else {
    const discriminant=b*b-4*a*c;
    if(discriminant>=0){const root=Math.sqrt(discriminant);cuts.push((-b-root)/(2*a),(-b+root)/(2*a));}
  }
  const times=cuts.filter(time=>time>=0&&time<=upper).sort((a,b)=>a-b);
  const inside=(time:number)=>insideObservationCone(add(segment.from,scale(delta,time)),observer);
  const intervals:ContactInterval[]=[];
  for(let index=0;index+1<times.length;index++) {
    const from=times[index],to=times[index+1];
    if(to>from&&inside((from+to)/2))intervals.push([from,to]);
  }
  return intervals;
}
/** Overlapping inspectors share exposure time; neither overlap nor post-finish travel multiplies it. */
function watchedFraction(segment:RacerSegment,observers:readonly DrillObserver[]):number {
  const intervals=observers.flatMap(observer=>coneContactIntervals(segment,observer)).sort((a,b)=>a[0]-b[0]);
  let total=0,coveredUntil=0;
  for(const [from,to] of intervals) {
    total+=Math.max(0,to-Math.max(from,coveredUntil));
    coveredUntil=Math.max(coveredUntil,to);
  }
  return total;
}

/** Inspectors react to measured lateral motion, never keyboard state or ordinary straight descent. */
export class ObservationDrill implements DrillMechanic {
  private readonly inspectors:Inspector[]=[];
  private readonly report=emptyDrillImpact();
  private readonly exposure=new Map<string,number>();
  private readonly cooldown=new Map<string,number>();
  private age=0;
  private dt=0;
  private resolved=true;
  constructor(private readonly recipe:Recipe,seed:number,racers:readonly EventRacer[]) {
    const random=seededRandom(seed);
    for(const band of createDrillBands(racers))for(let row=0;row<2&&this.inspectors.length<OBSERVATION_LIMITS.maxObservers;row++) {
      const side=row%2?1:-1;
      this.inspectors.push({id:this.inspectors.length,side,phase:random()*Math.PI*2,
        position:inDrillCourse(add(band.origin,[side*12,30-row*120,row?5:-5]),3)});
    }
  }
  private observer(inspector:Inspector):DrillObserver {
    const strict=this.recipe.temperament==='strict';
    const watch=strict?OBSERVATION_LIMITS.strictWatch:OBSERVATION_LIMITS.patientWatch;
    const rest=strict?OBSERVATION_LIMITS.strictRest:OBSERVATION_LIMITS.patientRest;
    const time=Math.max(0,this.age-SAFETY_DRILL_LIMITS.warningSeconds),cycle=Math.floor(time/(watch+rest));
    const phase=time%(watch+rest),enabled=this.age>=SAFETY_DRILL_LIMITS.warningSeconds&&this.age<SAFETY_DRILL_LIMITS.durationSeconds;
    const turning=phase>=watch+rest-OBSERVATION_LIMITS.turnWarningSeconds;
    // Alternating inspectors reveal the next direction during the harmless turn warning.
    const scanCycle=cycle+(turning?1:0);
    const x=this.recipe.scan==='sweep'?Math.sin(time*0.9+inspector.phase)*0.6:(scanCycle%2?0.45:-0.45);
    return {id:inspector.id,position:[...inspector.position],direction:direction([x-inspector.side*0.18,-1,0]),
      range:OBSERVATION_LIMITS.range,cosHalfAngle:Math.cos(OBSERVATION_LIMITS.halfAngle),
      watching:enabled&&phase<watch,
      warning:this.age<SAFETY_DRILL_LIMITS.warningSeconds||(enabled&&turning)};
  }
  prepareStep(age:number,dt:number,racers:readonly EventRacer[]) {
    this.age=age;this.dt=dt;this.resolved=false;
    const active=new Set(racers.filter(racer=>!racer.finished).map(racer=>racer.id));
    for(const id of this.exposure.keys())if(!active.has(id))this.exposure.delete(id);
    for(const id of this.cooldown.keys())if(!active.has(id))this.cooldown.delete(id);
    return emptyStepInputs(racers);
  }
  resolveContacts(segments:readonly RacerSegment[],racers:readonly EventRacer[]) {
    const pending=new Map<string,EventVector>();
    if(this.resolved||this.age<SAFETY_DRILL_LIMITS.warningSeconds||this.age>=SAFETY_DRILL_LIMITS.durationSeconds)return pending;
    this.resolved=true;
    const observers=this.inspectors.map(inspector=>this.observer(inspector)).filter(observer=>observer.watching);
    const byId=new Map(racers.map(racer=>[racer.id,racer]));
    const strict=this.recipe.temperament==='strict';
    const threshold=strict?OBSERVATION_LIMITS.strictThreshold:OBSERVATION_LIMITS.patientThreshold;
    const grace=strict?OBSERVATION_LIMITS.strictGrace:OBSERVATION_LIMITS.patientGrace;
    for(const segment of segments) {
      const racer=byId.get(segment.id);if(!racer||racer.finished)continue;
      const moving=Math.hypot(racer.velocity[0],racer.velocity[2])>threshold;
      const fraction=moving?watchedFraction(segment,observers):0;
      if(fraction===0||this.age<(this.cooldown.get(racer.id)??0)){this.exposure.delete(racer.id);continue;}
      const exposure=(this.exposure.get(racer.id)??0)+this.dt*fraction;
      this.exposure.set(racer.id,exposure);if(exposure<grace)continue;
      this.exposure.delete(racer.id);this.cooldown.set(racer.id,this.age+OBSERVATION_LIMITS.cooldownSeconds);
      if(racer.protected){increment(this.report.blockedObservations,racer.id);continue;}
      const lateral:EventVector=[-racer.velocity[0],8,-racer.velocity[2]];
      pending.set(racer.id,clampLength(scale(direction(lateral),OBSERVATION_LIMITS.impulse),RACE_EVENT_LIMITS.maxVelocityDelta));
      increment(this.report.observationFlags,racer.id);
    }
    return pending;
  }
  getSnapshot():DrillSnapshot {return {actors:[],currents:[],observers:this.inspectors.map(inspector=>this.observer(inspector)),
    warningSeconds:Math.max(0,SAFETY_DRILL_LIMITS.warningSeconds-this.age)};}
  getImpact(){return {...this.report,observationFlags:{...this.report.observationFlags},blockedObservations:{...this.report.blockedObservations}};}
}
