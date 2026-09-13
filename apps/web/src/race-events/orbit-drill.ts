import {
  RACE_EVENT_LIMITS, SAFETY_DRILL_LIMITS,
  type DrillImpact, type DrillSnapshot, type EventRacer, type EventVector,
  type RacerEventInput, type RacerSegment, type SafetyDrillRecipe,
} from '@sky/shared';
import { add, clampLength, direction, dot, length, scale, seededRandom, subtract } from './math';
import { createDrillBands, emptyDrillImpact, emptyStepInputs, increment, inDrillCourse, type DrillMechanic } from './drill-mechanics';

type OrbitRecipe = Extract<SafetyDrillRecipe, {family:'orbit'}>;
type OrbitField = NonNullable<DrillSnapshot['orbits']>[number];
type Capture = {field:OrbitField;enteredAt:number};
const ORBIT_RADIUS = 20;
const ORBIT_HEIGHT = 180;
const CORE_RADIUS = 4;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

/** Loose horizontal orbits preserve descent and ordinary steering, with a bounded automatic release. */
export class OrbitDrill implements DrillMechanic {
  private readonly fields:OrbitField[]=[];
  private readonly captures=new Map<string,Capture>();
  private readonly released=new Set<string>();
  private readonly seconds:Record<string,number>={};
  private readonly releases:Record<string,number>={};
  private age=0;

  constructor(private readonly recipe:OrbitRecipe,seed:number,racers:readonly EventRacer[]) {
    const random=seededRandom(seed);
    for(const band of createDrillBands(racers).slice(0,SAFETY_DRILL_LIMITS.maxOrbits)) {
      this.fields.push({id:band.id,
        position:inDrillCourse(add(band.origin,[(random()-0.5)*10,-70,(random()-0.5)*10]),ORBIT_RADIUS),
        radius:ORBIT_RADIUS,coreRadius:CORE_RADIUS,height:ORBIT_HEIGHT,
        direction:recipe.direction==='clockwise'?1:-1,active:false});
    }
  }

  private key(racerId:string,field:OrbitField) {return JSON.stringify([racerId,field.id]);}
  private contains(position:EventVector,field:OrbitField) {
    return Math.hypot(position[0]-field.position[0],position[2]-field.position[2])<=field.radius
      &&Math.abs(position[1]-field.position[1])<=field.height/2;
  }
  private axes(position:EventVector,field:OrbitField) {
    const offset=subtract(position,field.position);
    const radial=direction(Math.hypot(offset[0],offset[2])<1e-6?[1,0,0]:[offset[0],0,offset[2]]);
    const tangent:EventVector=[-radial[2]*field.direction,0,radial[0]*field.direction];
    return {radial,tangent,radius:Math.hypot(offset[0],offset[2])};
  }

  prepareStep(age:number,dt:number,racers:readonly EventRacer[]):Record<string,RacerEventInput> {
    this.age=age;
    const inputs=emptyStepInputs(racers);
    const activeIds=new Set(racers.filter(racer=>!racer.finished).map(racer=>racer.id));
    for(const id of this.captures.keys())if(!activeIds.has(id))this.captures.delete(id);
    if(age<SAFETY_DRILL_LIMITS.warningSeconds||age>=SAFETY_DRILL_LIMITS.durationSeconds||dt<=0)return inputs;
    for(const racer of racers) {
      if(racer.finished)continue;
      const input=inputs[racer.id];
      let capture=this.captures.get(racer.id);
      if(!capture) {
        // An overlapping band cannot multiply forces or recapture a racer who
        // already escaped that field. Selection uses geometry, never racer roles.
        const field=this.fields.filter(field=>!this.released.has(this.key(racer.id,field))&&this.contains(racer.position,field))
          .sort((a,b)=>length(subtract(racer.position,a.position))-length(subtract(racer.position,b.position))||a.id-b.id)[0];
        if(!field)continue;
        capture={field,enteredAt:age};this.captures.set(racer.id,capture);
      }
      const {field,enteredAt}=capture;
      const {radial,tangent,radius}=this.axes(racer.position,field);
      const maximumCapture=this.recipe.pull==='clingy'?3:2;
      if(!this.contains(racer.position,field)||age-enteredAt>=maximumCapture) {
        input.velocityDelta=clampLength(add(add(scale(tangent,20),scale(radial,6)),[0,-10,0]),RACE_EVENT_LIMITS.maxVelocityDelta);
        this.captures.delete(racer.id);this.released.add(this.key(racer.id,field));
        increment(this.releases,racer.id);
        continue;
      }
      const clingy=this.recipe.pull==='clingy';
      const preferredRadius=clingy?8:12;
      // A central repulsion prevents a singularity. Radial force stays below
      // sustained steering authority, so even a clingy orbit has a manual exit.
      const radialAcceleration=clamp((preferredRadius-radius)*(clingy?1.8:1.2)-dot(racer.velocity,radial)*0.35,
        clingy?-12:-8,16);
      const tangentAcceleration=clamp(((clingy?19:15)-dot(racer.velocity,tangent))*1.2,-10,24);
      input.acceleration=clampLength(add(scale(radial,radialAcceleration),scale(tangent,tangentAcceleration)),RACE_EVENT_LIMITS.maxAcceleration);
      increment(this.seconds,racer.id,dt);
    }
    return inputs;
  }

  resolveContacts(_segments:readonly RacerSegment[],_racers:readonly EventRacer[]):Map<string,EventVector> {return new Map();}
  getSnapshot():DrillSnapshot {
    return {actors:[],currents:[],warningSeconds:Math.max(0,SAFETY_DRILL_LIMITS.warningSeconds-this.age),
      orbits:this.fields.map(field=>({...field,active:this.age>=SAFETY_DRILL_LIMITS.warningSeconds&&this.age<SAFETY_DRILL_LIMITS.durationSeconds}))};
  }
  getImpact():DrillImpact {return {...emptyDrillImpact(),orbitSeconds:{...this.seconds},orbitReleases:{...this.releases}};}
}
