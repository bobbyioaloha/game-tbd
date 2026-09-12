import type { EventRacer, EventStepInputs, RaceEventCreation, RaceEventPort } from '@sky/shared';
/** The gameplay-owned integration needs one before/after pair around its existing step. */
export class RaceEventBridge {
  private previous=new Map<string,EventRacer['position']>();
  constructor(readonly events:RaceEventPort){}
  spawnAhead(spec:RaceEventCreation,creator:EventRacer,instanceId:string,seed:number) {
    if(creator.finished)throw new Error('Cannot spawn a new creation for a finished creator.');
    this.events.spawn({instanceId,creatorId:creator.id,seed,spec,
      position:[creator.position[0],creator.position[1]-Math.max(18,Math.abs(creator.velocity[1])*3),creator.position[2]]});
  }
  beforeStep(dt:number,racers:readonly EventRacer[]):EventStepInputs {
    const inputs=this.events.prepareStep(dt,racers);
    this.previous=new Map(racers.map(racer=>[racer.id,[...racer.position] as EventRacer['position']]));
    return inputs;
  }
  afterStep(racers:readonly EventRacer[]) {
    this.events.resolveContacts(racers.filter(racer=>!racer.finished).flatMap(racer=>{
      const from=this.previous.get(racer.id);return from?[{id:racer.id,from,to:racer.position}]:[];
    }));
    this.previous.clear();
  }
  reset(){this.previous.clear();this.events.reset();}
}
