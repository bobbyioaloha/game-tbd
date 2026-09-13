import { RaceEventCreationSchema, mockRaceEventForText, type RaceEventCreation, type RaceEventSnapshot, type RaceEventPort, type VoicePickup } from '@sky/shared';
import { CreationAttempt } from './creation-attempt';
import { PracticeRace, ITEM_PICKUP_RADIUS, LANE_HALF_WIDTH } from './practice-race';
import { BRAKE_SPEED } from './freefall-controller';
import { RACE_CREATION_PICKUP_RADIUS, RACE_VOICE_ATTEMPTS, VOICE_STAR_DELAY_SECONDS, CREATION_REVEAL_DELAY_SECONDS, raceEventSpawnPosition, raceCreationTimeRemaining, raceVoiceTimeRequired, raceVoiceStarLeadMeters } from './race-event-config';
import { obstaclePose, segmentSphere } from './race-course';
import type { Position } from './player-controller';
import type { PromptCapture } from '../voice/types';
import type { AudioCreationClient } from '../voice/voice-client';

/** Course-owned placement. Never delete obstacles as a side effect of generation. */
export function eventPlacement(race:PracticeRace,durationSeconds=10):{position:Position;pickupLifetimeSeconds:number} {
  const player=race.snapshot(race.racers[0]);
  const desired=raceEventSpawnPosition(player.position,player.fallSpeed,durationSeconds);
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

/** Schedules voice opportunities and placement; never moves racers or resets a shared event between attempts. */
export class RaceEventHost {
  readonly loop:CreationAttempt<RaceEventCreation>;
  voice?:VoicePickup;
  private spawnSerial=0;
  runId=0;
  attemptNumber=1;
  private nextStarAt?:number;
  private opportunitiesClosed=false;
  get opportunitiesRemaining() { return this.opportunitiesClosed?0:RACE_VOICE_ATTEMPTS-this.attemptNumber; }
  get nextOpportunityMessage() {
    if(this.loop.getSnapshot().phase==='ended')return this.loop.getSnapshot().message;
    if(this.opportunitiesClosed)return 'Not enough race remains for another voice attempt.';
    return this.opportunitiesRemaining>0?'Another star can appear while enough race remains.':'No more voice stars this run.';
  }
  requestBlockedReason(stage:'star'|'recording'|'submission'='recording'):string|undefined {
    const player=this.race.racers[0];
    if(player.finishTime!==undefined)return 'You have landed. No new creation can be requested.';
    const {position,fallSpeed}=this.race.snapshot(player);
    if(raceCreationTimeRemaining(position,fallSpeed)<raceVoiceTimeRequired(stage))return 'Not enough race remains to create and collect another object.';
  }
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
      spawnCreation:(id,spec)=>{
        // Check even while queued: speed changes must not leave a ready result
        // waiting until the finish, or replace an event other racers still use.
        if(this.creation||this.loop.getSnapshot().phaseSeconds<CREATION_REVEAL_DELAY_SECONDS){
          const player=this.race.snapshot(this.race.racers[0]);
          raceEventSpawnPosition(player.position,player.fallSpeed,spec.effect.durationSeconds);
          return 'queued';
        }
        this.spawn(spec,id);
      },
      checkRequest:stage=>this.requestBlockedReason(stage),
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
    const placement=quick?{position:[player.position[0],player.position[1]-30,player.position[2]] as Position,pickupLifetimeSeconds:60}:eventPlacement(this.race,spec.effect.durationSeconds);
    // Separate deterministic stream: debris never consumes the inventory/rival RNG.
    const seed=Math.imul(++this.spawnSerial,2654435761)>>>0;
    this.events.spawn({instanceId,creatorId:'0',spec,seed,...placement});this.remember();
  }
  loadFixture(spec:RaceEventCreation,quick=false) {
    // Called only by the development fixture panel while paused, before starting.
    this.opportunitiesClosed=true;this.nextStarAt=undefined;
    this.loop.end('Local event fixture loaded. No microphone or API calls.');this.voice=undefined;
    this.spawn(spec,'fixture-'+this.loop.getSnapshot().session,quick);
  }
  reset() {
    this.remember();
    if(this.lastEvent&&this.lastEvent.phase!=='expired')this.lastEvent={...this.lastEvent,phase:'expired',remainingSeconds:0,expirationReason:'reset'};
    this.runId++;this.attemptNumber=1;this.nextStarAt=undefined;this.opportunitiesClosed=false;
    this.loop.reset();this.race.eventBridge!.reset();this.spawnSerial=0;
    const player=this.race.snapshot(this.race.racers[0]);
    this.voice={kind:'voice',instanceId:'voice-'+this.loop.getSnapshot().session,position:[player.position[0],-180,player.position[2]]};
  }
  disableForRun() {
    if (this.race.elapsed !== 0 || this.loop.getSnapshot().running || this.creation) {
      throw new Error('Voice can only be disabled before the race.');
    }
    this.voice = undefined;this.opportunitiesClosed=true;this.nextStarAt=undefined;
    this.loop.end('Voice creation is off for this run.');
  }
  start(){this.loop.start();}
  pause(){this.loop.cancelRecording();}
  dispose(){this.opportunitiesClosed=true;this.nextStarAt=undefined;this.loop.dispose();this.voice=undefined;this.race.eventBridge!.reset();}
  private offerNextStar() {
    if(this.voice||this.opportunitiesRemaining===0||!this.loop.getSnapshot().running)return;
    if(!['activated','missed','failed'].includes(this.loop.getSnapshot().phase))return;
    // Start recovery only after the shared encounter ends for every racer.
    if(this.creation){this.nextStarAt=undefined;return;}
    this.nextStarAt??=this.race.elapsed+VOICE_STAR_DELAY_SECONDS;
    if(this.race.elapsed<this.nextStarAt)return;
    if(this.requestBlockedReason('star')){this.opportunitiesClosed=true;return;}
    const {position:[x,y,z],fallSpeed}=this.race.snapshot(this.race.racers[0]);
    this.attemptNumber++;this.nextStarAt=undefined;
    // Reset only the completed attempt, never the shared event or its RNG.
    this.loop.reset();
    this.voice={kind:'voice',instanceId:'voice-'+this.loop.getSnapshot().session,position:[x,y-raceVoiceStarLeadMeters(fallSpeed),z]};
    this.loop.start();
  }
  step(dt:number,from:Position,to:Position) {
    const event=this.events.getSnapshot();
    this.remember(event);
    if(event.instance&&event.phase==='active')this.loop.collectCreation(event.instance.instanceId);
    if(event.instance&&event.phase==='expired')this.loop.missCreation(event.instance.instanceId);
    if(this.race.racers[0].finishTime!==undefined) {
      if(this.loop.getSnapshot().running)this.loop.end('You landed. Shared events remain for the racers still falling.');
      this.voice=undefined;this.opportunitiesClosed=true;return;
    }
    if(this.voice&&this.loop.getSnapshot().phase!=='available')this.voice=undefined;
    this.loop.placeReadyCreation();
    if(this.voice&&segmentSphere(from,to,this.voice.position,ITEM_PICKUP_RADIUS)) {
      this.voice=undefined;this.loop.collectVoice();
    }
    if(this.voice&&to[1]<this.voice.position[1]-5){this.voice=undefined;this.loop.missVoice();}
    this.loop.advanceTime(dt);
    this.offerNextStar();
  }
}
