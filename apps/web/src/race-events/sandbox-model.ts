import type { EventRacer, EventVector, RaceEncounter, RacerEventInput } from '@sky/shared';
import { RaceEventBridge } from './bridge';
import { RaceEventRuntime } from './runtime';
import { add, scale, contactTime, length } from './math';
export const SANDBOX_RACERS=[{id:'creator',label:'Creator',color:'#82d9ff'},{id:'rival-a',label:'Rival A',color:'#ff8fbe'},
  {id:'rival-b',label:'Rival B',color:'#f7d76d'},{id:'rival-c',label:'Rival C',color:'#b1ee89'}];
/** Deliberately simple lab-only kinematics. Never imported by the actual race. */
export class EventSandboxModel {
  readonly events=new RaceEventRuntime();
  readonly bridge=new RaceEventBridge(this.events);
  racers:EventRacer[];
  inputs:Readonly<Record<string,RacerEventInput>>={};
  readonly obstacles:{position:EventVector;hit:boolean}[];
  elapsed=0;
  obstacleHits=0;
  readonly impulseCounts:Record<string,number>=Object.create(null);
  constructor(spec:RaceEncounter,triggerer:string,seed:number) {
    let lane=0;
    this.racers=SANDBOX_RACERS.map(item=>({id:item.id,finished:false,
      position:item.id===triggerer?[0,10,0]:[[-8,7,14][lane++],16,0],velocity:[0,spec.version===4?-30:-10,0]}));
    this.obstacles=[-8,0,7,14].flatMap(x=>[-15,-35].map(y=>({position:[x,y,0] as EventVector,hit:false})));
    this.events.spawn({instanceId:'sandbox-'+seed,creatorId:'creator',spec,position:[0,0,0],seed});
  }
  step(dt:number) {
    this.inputs=this.bridge.beforeStep(dt,this.racers);
    this.racers=this.racers.map(racer=>{
      const input=this.inputs[racer.id];
      if(length(input.velocityDelta)>0)this.impulseCounts[racer.id]=(this.impulseCounts[racer.id]??0)+1;
      const velocity=add(add(racer.velocity,scale(input.acceleration,dt)),input.velocityDelta);
      const position=add(racer.position,scale(velocity,dt));
      // The sandbox demonstrates protection against ordinary world obstacles too.
      if(!input.obstacleProtection)for(const obstacle of this.obstacles) {
        if(!obstacle.hit&&contactTime(racer.position,position,obstacle.position,1.3)!==undefined){obstacle.hit=true;this.obstacleHits++;}
      }
      return {...racer,position,velocity,protected:input.obstacleProtection};
    });
    this.bridge.afterStep(this.racers);this.elapsed+=dt;
  }
}
