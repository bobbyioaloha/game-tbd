import type { RaceEventCreation } from './race-events.js';

/** World meters, +Y up. Velocity/delta velocity in m/s, acceleration in m/s². */
export type EventVector = readonly [number,number,number];
export type EventRacer = {
  id:string; position:EventVector; velocity:EventVector; finished:boolean;
  /** Existing inventory/immunity protection, supplied by the game. */
  protected?:boolean;
};
export type RacerSegment = {
  id:string;from:EventVector;to:EventVector;
  /** Ignore contacts after this fraction of the tick (e.g. crossing the finish). */
  endFraction?:number;
};
export type RacerEventInput = {
  acceleration:EventVector;
  /** Consume once this tick; never multiply this value by dt. */
  velocityDelta:EventVector;
  /** OR with existing protection. Never replace inventory timers. */
  obstacleProtection:boolean;
};
export type EventStepInputs = Readonly<Record<string,RacerEventInput>>;
export type EventSpawn = {
  instanceId:string;creatorId:string;spec:RaceEventCreation;position:EventVector;seed:number;
  /** Game-authored pickup budget; independent of the generated effect duration. */
  pickupLifetimeSeconds?:number;
};
export type EventDebris = {id:number;position:EventVector;collidable:boolean};
export type RaceEventImpact = {
  participants:string[];
  affectedRacerIds:string[];
  impulseCounts:Record<string,number>;
  debrisHits:Record<string,number>;
  blockedDebrisHits:Record<string,number>;
  obstacleBlocks:Record<string,number>;
};
export type RaceEventSnapshot = {
  phase:'empty'|'collectible'|'active'|'expired';
  instance?:EventSpawn; triggererId?:string; position:EventVector;
  elapsedSeconds:number;remainingSeconds:number;radius:number;
  debris:readonly EventDebris[];affectedRacerIds:readonly string[];
  expirationReason?:'passed'|'lifetime'|'complete'|'reset';
  impact?:RaceEventImpact;
};
/** Call both methods once per existing fixed tick, in this order. No internal clock. */
export interface RaceEventPort {
  spawn(input:EventSpawn):void;
  prepareStep(dt:number,racers:readonly EventRacer[]):EventStepInputs;
  resolveContacts(segments:readonly RacerSegment[]):void;
  getSnapshot():RaceEventSnapshot;
  recordObstacleBlock?(racerId:string,obstacleId:number):void;
  reset():void;
}
export function createNoopRaceEvents():RaceEventPort {
  return {spawn(){},prepareStep(){return {};},resolveContacts(){},reset(){},
    getSnapshot:()=>({phase:'empty',position:[0,0,0],elapsedSeconds:0,remainingSeconds:0,radius:0,debris:[],affectedRacerIds:[]})};
}
