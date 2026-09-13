import test from 'node:test';
import assert from 'node:assert/strict';
import { safetyDrillFixtures, type RaceEncounter } from '@sky/shared';
import { RaceEventRuntime } from '../race-events/runtime';
import { FreefallController } from './freefall-controller';
import { PracticeRace } from './practice-race';
import { RaceEventHost } from './race-event-host';

const dt=1/120;
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function setup(){
  const runtime=new RaceEventRuntime();
  const race=new PracticeRace(false,()=>0.42,runtime);
  const preparePlayer=()=>{
    race.racers[0].controller=new FreefallController(36,0,0);
    race.racers[0].controller.setFallSpeed(30);
    for(const rival of race.racers.slice(1))rival.finishTime=0;
  };
  const spawn=(instanceId:string)=>{
    preparePlayer();
    runtime.spawn({instanceId,creatorId:'0',spec:safetyDrillFixtures[0].spec,position:[0,0,0],seed:42});
  };
  const step=(ticks=1)=>{for(let tick=0;tick<ticks;tick++)race.step(dt,{x:0,z:0},false);};
  return {race,runtime,spawn,step};
}

test('real drill contacts add to safety incidents once, including after the encounter expires',()=>{
  const game=setup();game.spawn('first');game.race.racers[0].incidents=3;
  for(let tick=0;tick<1202;tick++){
    game.step();
    const collisions=game.runtime.getSnapshot().impact?.drill?.collisions['0']??0;
    assert.equal(game.race.racers[0].incidents,3+collisions);
  }
  const collisions=game.runtime.getSnapshot().impact!.drill!.collisions['0'];
  assert.ok(collisions>0,'the trace must actually contact generated equipment');
  assert.equal(game.runtime.getSnapshot().phase,'expired');
  game.step(120);
  assert.equal(game.race.racers[0].incidents,3+collisions,'expired cumulative totals are not counted again');
  assert.equal(game.race.racers[0].flailUntil,0,'recording an incident adds no extra movement penalty');
});

test('protection blocks drill incidents and a fresh encounter counts its own contacts',()=>{
  const game=setup();game.spawn('protected');game.race.racers[0].creationShieldUntil=20;
  game.step(1202);
  const blocked=game.runtime.getSnapshot().impact!.drill!.blockedCollisions['0'];
  assert.ok(blocked>0);assert.equal(game.race.racers[0].incidents,0);
  game.race.racers[0].creationShieldUntil=0;
  game.spawn('unprotected');game.step(1202);
  const first=game.runtime.getSnapshot().impact!.drill!.collisions['0'];
  assert.ok(first>0);assert.equal(game.race.racers[0].incidents,first);
  game.spawn('another');game.step(1202);
  const second=game.runtime.getSnapshot().impact!.drill!.collisions['0'];
  assert.ok(second>0);assert.equal(game.race.racers[0].incidents,first+second);
});

test('reset clears both drill incident bookkeeping and the safety record for a new run',()=>{
  const game=setup();game.spawn('same-instance');game.step(1202);
  const before=game.race.racers[0].incidents;assert.ok(before>0);
  game.race.reset();assert.equal(game.race.racers[0].incidents,0);
  game.spawn('same-instance');game.step(1202);
  assert.equal(game.race.racers[0].incidents,before,'even a reused test identifier counts freshly after run reset');
});

for(const action of ['pause','reset'] as const)test('v4 voice '+action+' aborts and discards a late mock drill result',async()=>{
  const race=new PracticeRace(false,()=>0.42,new RaceEventRuntime());
  let resolveResult:((spec:RaceEncounter)=>void)|undefined,signal:AbortSignal|undefined;
  const host=new RaceEventHost(race,{kind:'audio',async start(){},async stop(){return {blob:new Blob(['fake']),captureMs:500};},cancel(){}},
    {generateAudio:async(_,options)=>{signal=options.signal;return new Promise(resolve=>{resolveResult=resolve;});}});
  host.start();const [x,y,z]=host.voice!.position;
  host.step(dt,[x,y+4,z],[x,y-4,z]);assert.equal(host.loop.getSnapshot().phase,'prompted');
  host.loop.startRecording();await flush();
  const attempt=host.loop.finishRecording();await flush();
  assert.ok(resolveResult);
  if(action==='pause')host.pause();
  else {race.reset();host.reset();host.start();}
  resolveResult(safetyDrillFixtures[0].spec);await attempt;
  assert.ok(signal?.aborted);assert.equal(host.creation,undefined);
  for(let tick=0;tick<360;tick++){
    const from=race.snapshot(race.racers[0]).position;
    race.step(dt,{x:0,z:0},false);host.step(dt,from,race.snapshot(race.racers[0]).position);
  }
  assert.equal(host.creation,undefined);assert.equal(race.events!.getSnapshot().phase,'empty');
  host.dispose();
});
