import { SAFETY_DRILL_LIMITS, RACE_EVENT_LIMITS, type SafetyDrillRecipe, type EventRacer,
  type EventVector, type RacerSegment, type DrillSnapshot, type DrillActor } from '@sky/shared';
import { createDrillBands, emptyDrillImpact, emptyStepInputs, increment, inDrillCourse, type DrillMechanic } from './drill-mechanics';
import { add, subtract, scale, direction, clampLength, contactTime, seededRandom } from './math';

type Recipe = Extract<SafetyDrillRecipe, {family:'reconstruction'}>;
type Sample = {age:number;position:EventVector;fallSpeed:number};
type Echo = {id:number;position:EventVector;born:number;hit:Set<string>};
export const RECONSTRUCTION_LIMITS = Object.freeze({maxSources:16,samplesPerSource:12,sampleInterval:0.15,
  delaySeconds:0.9,aheadMeters:70,maxAheadMeters:150,approachSeconds:0.6,warningSeconds:0.7,lifetimeSeconds:2.8,radius:2.5,
  steadyInterval:0.65,burstInterval:1.5,collisionImpulse:17});

/** Only short in-memory paths are retained. Spawned echoes freeze their world positions permanently. */
export class ReconstructionDrill implements DrillMechanic {
  private readonly bands;
  private readonly paths=new Map<string,Sample[]>();
  private readonly echoes:Echo[]=[];
  private readonly report=emptyDrillImpact();
  private nextSample=0;
  private nextSpawn=SAFETY_DRILL_LIMITS.warningSeconds+RECONSTRUCTION_LIMITS.delaySeconds;
  private nextId=0;
  private sourceCursor:number;
  private age=0;
  constructor(private readonly recipe:Recipe,seed:number,racers:readonly EventRacer[]) {
    this.bands=createDrillBands(racers);
    const sources=[...racers].filter(racer=>!racer.finished).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,RECONSTRUCTION_LIMITS.maxSources);
    for(const racer of sources)this.paths.set(racer.id,[]);
    this.sourceCursor=Math.floor(seededRandom(seed)()*Math.max(1,sources.length));
  }
  private withinBands(position:EventVector) {
    return this.bands.some(band=>position[1]<=band.origin[1]+SAFETY_DRILL_LIMITS.bandLeadMeters
      &&position[1]>=band.origin[1]-SAFETY_DRILL_LIMITS.bandLengthMeters);
  }
  private capture(racers:readonly EventRacer[]) {
    const byId=new Map(racers.map(racer=>[racer.id,racer]));
    for(const [id,path] of this.paths) {
      const racer=byId.get(id);
      if(!racer||racer.finished){this.paths.delete(id);continue;}
      if(!this.withinBands(racer.position))continue;
      path.push({age:this.age,position:[...racer.position],fallSpeed:Math.max(0,Math.min(90,-racer.velocity[1]))});
      if(path.length>RECONSTRUCTION_LIMITS.samplesPerSource)path.shift();
    }
  }
  private spawn() {
    const sources=[...this.paths.values()].filter(path=>path.some(sample=>sample.age<=this.age-RECONSTRUCTION_LIMITS.delaySeconds));
    if(!sources.length)return;
    const groups=this.recipe.cadence==='bursts'?3:1;
    for(let group=0;group<groups;group++) {
      const path=sources[this.sourceCursor++%sources.length];
      const past=path.filter(sample=>sample.age<=this.age-RECONSTRUCTION_LIMITS.delaySeconds);
      const end=past.length-Math.floor(group/sources.length)*3;
      const leadFor=(sample:Sample)=>path[path.length-1].fallSpeed*(this.age-sample.age
        +RECONSTRUCTION_LIMITS.warningSeconds+RECONSTRUCTION_LIMITS.approachSeconds);
      const samples=(end>0?past.slice(Math.max(0,end-3),end):[])
        .filter(sample=>leadFor(sample)<=RECONSTRUCTION_LIMITS.maxAheadMeters);
      if(!samples.length)continue;
      // Translate the whole recorded trail equally so the replay retains its shape.
      const requiredLead=leadFor(samples[0]);
      const ahead=Math.max(RECONSTRUCTION_LIMITS.aheadMeters,requiredLead);
      for(const sample of samples) {
        if(this.echoes.length>=SAFETY_DRILL_LIMITS.maxActors)return;
        const x=this.recipe.pattern==='mirror'?-sample.position[0]:sample.position[0];
        const z=this.recipe.pattern==='mirror'?-sample.position[2]:sample.position[2];
        const position=inDrillCourse([x,sample.position[1]-ahead,z],RECONSTRUCTION_LIMITS.radius);
        if(!this.withinBands(position))continue;
        this.echoes.push({id:this.nextId++,position,born:this.age,hit:new Set()});
        this.report.reactions++;
      }
    }
  }
  prepareStep(age:number,_dt:number,racers:readonly EventRacer[]) {
    this.age=age;
    for(let index=this.echoes.length-1;index>=0;index--)
      if(age-this.echoes[index].born>=RECONSTRUCTION_LIMITS.lifetimeSeconds)this.echoes.splice(index,1);
    if(age>=SAFETY_DRILL_LIMITS.durationSeconds){this.paths.clear();this.echoes.length=0;return emptyStepInputs(racers);}
    if(age>=this.nextSample){this.capture(racers);this.nextSample=age+RECONSTRUCTION_LIMITS.sampleInterval;}
    if(age>=this.nextSpawn){this.spawn();this.nextSpawn=age+(this.recipe.cadence==='bursts'
      ?RECONSTRUCTION_LIMITS.burstInterval:RECONSTRUCTION_LIMITS.steadyInterval);}
    return emptyStepInputs(racers);
  }
  private actor(echo:Echo):DrillActor {
    return {id:echo.id,kind:'echo',position:[...echo.position],velocity:[0,0,0],radius:RECONSTRUCTION_LIMITS.radius,
      state:this.age-echo.born<RECONSTRUCTION_LIMITS.warningSeconds?'warning':'moving'};
  }
  resolveContacts(segments:readonly RacerSegment[],racers:readonly EventRacer[]) {
    const pending=new Map<string,EventVector>(),byId=new Map(racers.map(racer=>[racer.id,racer]));
    if(this.age<SAFETY_DRILL_LIMITS.warningSeconds||this.age>=SAFETY_DRILL_LIMITS.durationSeconds)return pending;
    for(const echo of this.echoes) {
      if(this.actor(echo).state==='warning')continue;
      for(const segment of segments) {
        const racer=byId.get(segment.id);if(!racer||racer.finished||echo.hit.has(racer.id))continue;
        const time=contactTime(segment.from,segment.to,echo.position,RECONSTRUCTION_LIMITS.radius+RACE_EVENT_LIMITS.racerRadius);
        if(time===undefined||time>(segment.endFraction??1))continue;
        echo.hit.add(racer.id);
        if(racer.protected){increment(this.report.blockedCollisions,racer.id);continue;}
        const side=subtract(segment.from,echo.position);
        const impulse=scale(direction([Math.abs(side[0])<0.1?(echo.id%2?1:-1):side[0],1.5,side[2]*0.4]),RECONSTRUCTION_LIMITS.collisionImpulse);
        pending.set(racer.id,clampLength(add(pending.get(racer.id)??[0,0,0],impulse),RACE_EVENT_LIMITS.maxVelocityDelta));
        increment(this.report.collisions,racer.id);
      }
    }
    return pending;
  }
  getSnapshot():DrillSnapshot {return {actors:this.echoes.map(echo=>this.actor(echo)),currents:[],
    warningSeconds:Math.max(0,SAFETY_DRILL_LIMITS.warningSeconds-this.age)};}
  getImpact(){return {...this.report,collisions:{...this.report.collisions},blockedCollisions:{...this.report.blockedCollisions}};}
}
