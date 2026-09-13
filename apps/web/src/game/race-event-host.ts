import { RaceEventCreationSchema, mockRaceEventForText, type RaceEventCreation, type RaceEventSnapshot, type RaceEventPort, type VoicePickup } from '@sky/shared';
import { CreationAttempt } from './creation-attempt';
import { PracticeRace, ITEM_PICKUP_RADIUS, LANE_HALF_WIDTH } from './practice-race';
import { BRAKE_SPEED } from './freefall-controller';
import { RACE_CREATION_PICKUP_RADIUS, raceCreationSpawnPosition } from './race-event-config';
import { obstaclePose, segmentSphere } from './race-course';
import type { Position } from './player-controller';
import type { PromptCapture } from '../voice/types';
import type { AudioCreationClient } from '../voice/voice-client';

/** Course-owned placement. Never delete obstacles as a side effect of generation. */
export function eventPlacement(race:PracticeRace):{position:Position;pickupLifetimeSeconds:number} {
  const player=race.snapshot(race.racers[0]);
  const desired=raceCreationSpawnPosition(player.position);
  const offsets=[[0,0],[-10,0],[10,0],[0,-10],[0,10],[-10,-10],[10,10],[-10,10],[10,-10]];
  const position=offsets.map(([x,z]):Position=>[
    Math.max(-LANE_HALF_WIDTH+RACE_CREATION_PICKUP_RADIUS,Math.min(LANE_HALF_WIDTH-RACE_CREATION_PICKUP_RADIUS,desired[0]+x)),desired[1],
    Math.max(-LANE_HALF_WIDTH+RACE_CREATION_PICKUP_RADIUS,Math.min(LANE_HALF_WIDTH-RACE_CREATION_PICKUP_RADIUS,desired[2]+z)),
  ]).find(candidate=>race.obstacles.every(obstacle=>{
    if(!obstacle.active)return true;
    const p=obstaclePose(obstacle,race.elapsed).position;
    return Math.abs(p[1]-candidate[1])>(obstacle.kind==='duct'?30:12)||
      Math.hypot(p[0]-candidate[0],p[2]-candidate[2])>(obstacle.kind==='duct'?19:10);
  }));
  if(!position)throw new Error('No clear, reachable space for this creation.');
  const longestLead=Math.max(0,...race.racers.filter(r=>r.finishTime===undefined).map(r=>race.snapshot(r).position[1]-position[1]));
  return {position,pickupLifetimeSeconds:Math.min(600,Math.max(30,Math.ceil(longestLead/BRAKE_SPEED)+30))};
}

/** Owns the speaking attempt, never movement or the lifetime of an already shared object. */
export class RaceEventHost {
  readonly loop:CreationAttempt<RaceEventCreation>;
  voice?:VoicePickup;
  private spawnSerial=0;
  private lastEvent?:RaceEventSnapshot;
  private readonly events:RaceEventPort;
  get report():RaceEventSnapshot|undefined {
    const current=this.events.getSnapshot();
    return current.instance?current:this.lastEvent;
  }
  private remember(current=this.events.getSnapshot()) {
    // Keep only the latest creation and counters in memory; never retain audio.
    if(current.instance)this.lastEvent={...current,debris:[]};
    else if(this.race.finished&&this.lastEvent)this.lastEvent={...this.lastEvent,phase:'expired',remainingSeconds:0,expirationReason:'complete'};
  }
  constructor(readonly race:PracticeRace,capture:PromptCapture,client?:AudioCreationClient<RaceEventCreation>) {
    if(!race.events)throw new Error('Race event runtime is required.');
    this.events=race.events;
    this.loop=new CreationAttempt({async generate({text}) {
      const fixture=mockRaceEventForText(text);
      return fixture?{ok:true,spec:fixture.spec}:{ok:false,error:{message:'Choose one of the four event mock prompts.'}};
    }},capture,{
      parse:value=>RaceEventCreationSchema.parse(value),
      spawnCreation:(id,spec)=>this.spawn(spec,id),
      // The runtime has already resolved the shared contact and owns activation.
      activate:()=>{},
    },client);
    this.reset();
  }
  get creation() {
    const state=this.events.getSnapshot();
    return state.instance&&(state.phase==='collectible'||state.phase==='active')
      ?{instanceId:state.instance.instanceId,spec:state.instance.spec,position:[...state.position] as Position}:undefined;
  }
  spawn(spec:RaceEventCreation,instanceId:string,quick=false) {
    if(this.race.racers[0].finishTime!==undefined)throw new Error('Race finished before generation completed.');
    const player=this.race.snapshot(this.race.racers[0]);
    const placement=quick?{position:[player.position[0],player.position[1]-30,player.position[2]] as Position,pickupLifetimeSeconds:60}:eventPlacement(this.race);
    // Separate deterministic stream: debris never consumes the inventory/rival RNG.
    const seed=Math.imul(++this.spawnSerial,2654435761)>>>0;
    this.events.spawn({instanceId,creatorId:'0',spec,seed,...placement});this.remember();
  }
  loadFixture(spec:RaceEventCreation,quick=false) {
    // Called only by the development fixture panel while paused, before starting.
    this.loop.end('Local event fixture loaded. No microphone or API calls.');this.voice=undefined;
    this.spawn(spec,'fixture-'+this.loop.getSnapshot().session,quick);
  }
  reset() {
    this.remember();
    if(this.lastEvent&&this.lastEvent.phase!=='expired')this.lastEvent={...this.lastEvent,phase:'expired',remainingSeconds:0,expirationReason:'reset'};
    this.loop.reset();this.race.eventBridge!.reset();this.spawnSerial=0;
    const player=this.race.snapshot(this.race.racers[0]);
    this.voice={kind:'voice',instanceId:'voice-'+this.loop.getSnapshot().session,position:[player.position[0],-180,player.position[2]]};
  }
  disableForRun() {
    if (this.race.elapsed !== 0 || this.loop.getSnapshot().running || this.creation) {
      throw new Error('Voice can only be disabled before the race.');
    }
    this.voice = undefined;
    this.loop.end('Voice creation is off for this run.');
  }
  start(){this.loop.start();}
  pause(){this.loop.cancelRecording();}
  dispose(){this.loop.dispose();this.voice=undefined;this.race.eventBridge!.reset();}
  step(dt:number,from:Position,to:Position) {
    const event=this.events.getSnapshot();
    this.remember(event);
    if(event.instance&&event.phase==='active')this.loop.collectCreation(event.instance.instanceId);
    if(event.instance&&event.phase==='expired')this.loop.missCreation(event.instance.instanceId);
    if(this.race.racers[0].finishTime!==undefined) {
      if(this.loop.getSnapshot().running)this.loop.end('You landed. Shared events remain for the racers still falling.');
      this.voice=undefined;return;
    }
    if(this.voice&&segmentSphere(from,to,this.voice.position,ITEM_PICKUP_RADIUS)) {
      this.voice=undefined;this.loop.collectVoice();
    }
    if(this.voice&&to[1]<this.voice.position[1]-5){this.voice=undefined;this.loop.missVoice();}
    this.loop.advanceTime(dt);
  }
}
