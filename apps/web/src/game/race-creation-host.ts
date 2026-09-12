import { COLLECTIBLE_RADIUS_METERS, type CreationPickup, type VoicePickup } from '@sky/shared';
import { CreationLoop } from './creation-loop';
import { PracticeRace, FINISH_DEPTH } from './practice-race';
import { creationSpawnPosition, sweptPickup, distance } from './world-geometry';
import { obstaclePose } from './race-course';
import { mockCreationClient } from '../generation/creation-client';
import type { PromptCapture } from '../voice/types';
import type { AudioCreationClient } from '../voice/voice-client';
import type { Position } from './player-controller';

// World integration only; the race still owns all movement and its fixed-step clock.
export class RaceCreationHost {
  readonly loop:CreationLoop;
  voice?:VoicePickup;
  creation?:CreationPickup;
  constructor(readonly race:PracticeRace,capture:PromptCapture,client?:AudioCreationClient) {
    this.loop=new CreationLoop(mockCreationClient,capture,{
      spawnCreation:(instanceId,spec)=>{
        const player=race.snapshot(race.racers[0]);
        if (race.racers[0].finishTime!==undefined) return;
        const position=creationSpawnPosition(player.position,player.fallSpeed);
        if (position[1]<=-FINISH_DEPTH+5) throw new Error('The finish is too close to spawn a reachable creation.');
        for (const obstacle of race.obstacles) if (obstacle.active && distance(obstaclePose(obstacle,race.elapsed).position,position)<8) {
          obstacle.active=false;obstacle.hitAt=race.elapsed;
        }
        this.creation={kind:'creation',instanceId,spec,position};
      },
      applyEffects:effects=>race.applyCreationEffects(effects),
    },client);
    this.reset();
  }
  reset() {
    this.loop.reset();this.creation=undefined;
    const player=this.race.snapshot(this.race.racers[0]);
    this.voice={kind:'voice',instanceId:'voice-'+this.loop.getSnapshot().session,position:[player.position[0],-180,player.position[2]]};
  }
  start() {this.loop.start();}
  pause() {this.loop.cancelRecording();}
  dispose() {this.loop.dispose();this.voice=undefined;this.creation=undefined;}
  step(dt:number,from:Position,to:Position) {
    if (this.race.racers[0].finishTime!==undefined) {
      if (this.loop.getSnapshot().running) this.loop.end('Race finished. Pending creations discarded.');
      this.voice=undefined;this.creation=undefined;return;
    }
    const touched=(position:Position)=>sweptPickup(from,to,position,COLLECTIBLE_RADIUS_METERS);
    if (this.voice && touched(this.voice.position)) {this.voice=undefined;this.loop.collectVoice();}
    if (this.voice && to[1]<this.voice.position[1]-5) {this.voice=undefined;this.loop.missVoice();}
    if (this.creation && touched(this.creation.position)) {
      const id=this.creation.instanceId;this.creation=undefined;this.loop.collectCreation(id);
    }
    if (this.creation && to[1]<this.creation.position[1]-5) {
      const id=this.creation.instanceId;this.creation=undefined;this.loop.missCreation(id);
    }
    this.loop.advanceTime(dt);
  }
}
