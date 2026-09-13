import test from 'node:test';
import assert from 'node:assert/strict';
import { raceEventFixtures, type RaceEventCreation } from '@sky/shared';
import { FreefallController } from './freefall-controller';
import { FINISH_DEPTH, PracticeRace } from './practice-race';
import { RaceEventHost } from './race-event-host';
import { RACE_CREATION_PICKUP_RADIUS, raceEventSpawnPosition, raceVoiceStarLeadMeters } from './race-event-config';
import { RaceEventRuntime } from '../race-events/runtime';

const dt=1/120,flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const secondDepth=FINISH_DEPTH*.65;
const vortex=raceEventFixtures.find(item=>item.spec.effect.type==='gravityWell')!.spec;
const sun=raceEventFixtures.find(item=>item.spec.effect.type==='repulsionBurst')!.spec;
// These focused lifecycle tests use explicit contacts/positions. Representative
// travel, recording, latency and natural contacts live in second-star-scheduling.test.ts.
function setup(starRandom:()=>number=()=>.5) {
  const race=new PracticeRace(false,()=>.42,new RaceEventRuntime({pickupContactRadius:RACE_CREATION_PICKUP_RADIUS}));
  const requests:Array<{signal:AbortSignal;resolve:(spec:RaceEventCreation)=>void;reject:(error:Error)=>void;progress:(phase:'transcribing'|'generating',message:string)=>void}>=[];
  let captures=0;
  const host=new RaceEventHost(race,{kind:'audio',async start(){captures++;},async stop(){return {blob:new Blob(['fake audio']),captureMs:500};},cancel(){}},
    {generateAudio:async(_,options)=>new Promise((resolve,reject)=>requests.push({signal:options.signal,resolve,reject,progress:options.onProgress??(()=>{})}))},starRandom);
  host.start();
  const step=(seconds=dt)=>{
    for(let tick=0;tick<Math.round(seconds/dt);tick++) {
      const from=race.snapshot(race.racers[0]).position;
      race.step(dt,{x:0,z:0},false);
      host.step(dt,from,race.snapshot(race.racers[0]).position);
    }
  };
  const collect=()=>{
    assert.ok(host.voice,'a star must be offered');
    const [x,y,z]=host.voice.position;
    host.step(dt,[x,y+4,z],[x,y-4,z]);
  };
  const submit=async()=>{
    assert.equal(host.loop.getSnapshot().phase,'prompted');
    host.loop.startRecording();await flush();
    assert.equal(host.loop.getSnapshot().phase,'recording');
    const pending=host.loop.finishRecording();await flush();
    return {pending,request:requests.at(-1)!};
  };
  const position=(id:number,x:number,depth:number,z=0)=>{
    const racer=race.racers[id];
    racer.controller=new FreefallController(36,x,z);racer.controller.setFallSpeed(30);
    racer.controller.step(depth/30,{x:0,z:0},{fallSpeedMultiplier:1});
    racer.decision=Infinity;racer.nextUse=Infinity;racer.target=[x,z];
  };
  const trigger=(id=0)=>{
    const [x,y,z]=host.creation!.position;
    position(id,x,-y-RACE_CREATION_PICKUP_RADIUS+.1,z);step();
    assert.equal(race.events!.getSnapshot().phase,'active');
    assert.equal(race.events!.getSnapshot().triggererId,String(id));
  };
  const offerSecond=()=>{
    position(0,0,secondDepth-120);step();
    assert.equal(host.getSnapshot().secondStar,'offered');assert.ok(host.voice);
    assert.ok(Math.abs(host.voice.position[1]+secondDepth)<1e-8);
  };
  return {host,race,requests,step,collect,submit,position,trigger,offerSecond,captures:()=>captures};
}
async function firstCreation() {
  const game=setup();game.collect();
  const first=await game.submit();first.request.resolve(vortex);await first.pending;game.step(2.1);
  return {...game,firstInstance:game.race.events!.getSnapshot().instance!};
}
function expireEvent(game:ReturnType<typeof setup>) {
  for(let tick=0;tick<1200&&game.race.events!.getSnapshot().phase==='active';tick++)game.step();
  assert.equal(game.race.events!.getSnapshot().phase,'expired');
}
async function secondOpportunity() {
  const game=await firstCreation();game.trigger(1);expireEvent(game);game.offerSecond();
  assert.equal(game.host.attemptNumber,1,'offering a star does not replace the current attempt');
  assert.equal(game.race.events!.getSnapshot().instance!.instanceId,game.firstInstance.instanceId);
  return game;
}
async function occupiedSecondOpportunity() {
  const game=await firstCreation();game.offerSecond();game.trigger(1);
  return {...game,occupiedInstance:game.race.events!.getSnapshot().instance!};
}

test('the second star appears while the first object remains collectible, without changing its identity or RNG',async()=>{
  const game=await firstCreation();game.offerSecond();
  const event=game.race.events!.getSnapshot();
  assert.equal(event.phase,'collectible');assert.equal(game.host.attemptNumber,1);
  assert.equal(event.instance!.instanceId,game.firstInstance.instanceId);
  assert.equal(event.instance!.seed,game.firstInstance.seed);
  game.collect();assert.equal(game.host.attemptNumber,2);
  assert.equal(game.host.loop.getSnapshot().phase,'prompted');
  assert.equal(game.race.events!.getSnapshot().phase,'collectible');
  assert.equal(game.host.creation!.instanceId,game.firstInstance.instanceId);
  assert.equal(game.requests.length,1);assert.equal(game.captures(),1);game.host.dispose();
});

test('collecting a second star during the first active effect permits recording without resetting the effect',async()=>{
  const game=await occupiedSecondOpportunity();game.collect();const second=await game.submit();
  const event=game.race.events!.getSnapshot();
  assert.equal(event.phase,'active');assert.equal(event.triggererId,'1');
  assert.equal(event.instance!.instanceId,game.firstInstance.instanceId);
  assert.equal(event.instance!.seed,game.firstInstance.seed);
  assert.equal(game.host.attemptNumber,2);assert.equal(game.requests.length,2);
  assert.notEqual(second.request.signal,game.requests[0].signal);
  game.host.dispose();second.request.resolve(sun);await second.pending;
});

test('two ordinary creations use distinct attempts, object identities and seeds with no third star',async()=>{
  const game=await secondOpportunity();game.collect();const second=await game.submit();
  second.request.resolve(sun);await second.pending;game.step(2.1);
  assert.equal(game.host.loop.getSnapshot().phase,'spawned');
  const next=game.race.events!.getSnapshot().instance!;
  assert.equal(next.spec.id,sun.id);assert.notEqual(next.instanceId,game.firstInstance.instanceId);
  assert.notEqual(next.seed,game.firstInstance.seed);
  game.trigger();game.step(12);
  assert.equal(game.requests.length,2);assert.equal(game.captures(),2);
  assert.equal(game.host.voice,undefined);assert.equal(game.host.opportunitiesRemaining,0);game.host.dispose();
});

test('a second result waits for an occupied shared slot without replacing its event',async()=>{
  const game=await occupiedSecondOpportunity();game.collect();const second=await game.submit();
  second.request.resolve(sun);await second.pending;game.step(2.1);
  assert.equal(game.host.loop.getSnapshot().phase,'ready');
  assert.equal(game.race.events!.getSnapshot().phase,'active');
  assert.equal(game.host.creation!.instanceId,game.occupiedInstance.instanceId);
  game.step(6.1);assert.equal(game.host.loop.getSnapshot().phase,'spawned');
  const next=game.race.events!.getSnapshot().instance!;
  assert.equal(next.spec.id,sun.id);assert.notEqual(next.instanceId,game.occupiedInstance.instanceId);
  assert.notEqual(next.seed,game.occupiedInstance.seed);
  game.host.loop.placeReadyCreation();assert.equal(game.host.creation!.instanceId,next.instanceId);
  assert.equal(game.requests.length,2);game.host.dispose();
});

for(const result of ['failure','success'] as const)test('a second grant is saved while the first request is pending, then opens after '+result,async()=>{
  const game=setup();game.collect();const first=await game.submit();game.offerSecond();
  const session=game.host.loop.getSnapshot().session;
  game.collect();assert.equal(game.host.getSnapshot().secondStar,'collected');
  assert.equal(game.host.attemptNumber,1);assert.equal(game.host.loop.getSnapshot().session,session);
  assert.equal(first.request.signal.aborted,false);assert.equal(game.requests.length,1);
  assert.match(game.host.getSnapshot().message,/sav|wait/i);
  game.host.loop.startRecording();await flush();assert.equal(game.captures(),1);
  if(result==='failure')first.request.reject(new Error('Simulated provider failure'));
  else first.request.resolve(vortex);
  await first.pending;
  if(result==='success'){
    assert.equal(game.host.loop.getSnapshot().phase,'ready');
    assert.equal(game.host.getSnapshot().secondStar,'collected');
    game.step(1.9);assert.equal(game.host.attemptNumber,1);
    game.step(.2);assert.equal(game.host.creation!.spec.id,vortex.id);
  }else game.step();
  assert.equal(game.host.attemptNumber,2);assert.equal(game.host.loop.getSnapshot().phase,'prompted');
  assert.equal(game.host.getSnapshot().secondStar,'consumed');
  const activeSession=game.host.loop.getSnapshot().session;
  first.request.progress('generating','Stale callback from the first request');
  assert.equal(game.host.loop.getSnapshot().session,activeSession);assert.equal(game.host.loop.getSnapshot().phase,'prompted');
  assert.doesNotMatch(game.host.loop.getSnapshot().message,/Stale callback/);
  assert.equal(game.requests.length,1,'the saved grant must not automatically dispatch');
  const second=await game.submit();assert.equal(game.requests.length,2);
  second.request.reject(new Error('Simulated second failure'));await second.pending;game.step();
  assert.equal(game.host.opportunitiesRemaining,0);assert.equal(game.host.voice,undefined);game.host.dispose();
});

test('missing either star consumes only that opportunity and never starts capture or a request',()=>{
  const game=setup(),[x,y,z]=game.host.voice!.position;
  game.host.step(dt,[x+10,y+5,z],[x+10,y-6,z]);
  assert.equal(game.host.loop.getSnapshot().phase,'missed');game.step(4.1);
  assert.equal(game.host.voice,undefined);game.offerSecond();
  const second=game.host.voice!.position;
  game.host.step(dt,[second[0]+10,second[1]+5,second[2]],[second[0]+10,second[1]-6,second[2]]);
  assert.equal(game.host.getSnapshot().secondStar,'missed');assert.equal(game.host.voice,undefined);
  assert.equal(game.host.opportunitiesRemaining,0);assert.equal(game.requests.length,0);assert.equal(game.captures(),0);game.host.dispose();
});

for(const action of ['pause','reset','finish','dispose'] as const)test(action+' discards a collected second grant and ignores the first request’s late reply',async()=>{
  const game=setup();game.collect();const first=await game.submit();game.offerSecond();game.collect();
  assert.equal(game.host.getSnapshot().secondStar,'collected');
  if(action==='pause')game.host.pause();
  if(action==='reset'){game.race.reset();game.host.reset();game.host.start();}
  if(action==='finish'){game.race.racers[0].finishTime=game.race.elapsed;game.step();}
  if(action==='dispose')game.host.dispose();
  first.request.resolve(vortex);await first.pending;game.step();
  assert.ok(first.request.signal.aborted);assert.equal(game.host.creation,undefined);
  assert.equal(game.requests.length,1);assert.equal(game.host.attemptNumber,1);
  assert.notEqual(game.host.getSnapshot().secondStar,'collected');
  assert.notEqual(game.host.loop.getSnapshot().phase,'prompted');game.host.dispose();
});

for(const action of ['pause','reset','finish','dispose'] as const)test(action+' discards a queued second creation without replacing the occupied event',async()=>{
  const game=await occupiedSecondOpportunity();game.collect();const second=await game.submit();
  second.request.resolve(sun);await second.pending;game.step(2.1);assert.equal(game.host.loop.getSnapshot().phase,'ready');
  if(action==='pause')game.host.pause();
  if(action==='reset'){game.race.reset();game.host.reset();}
  if(action==='finish'){game.race.racers[0].finishTime=game.race.elapsed;game.step();}
  if(action==='dispose')game.host.dispose();
  game.host.loop.placeReadyCreation();assert.notEqual(game.host.creation?.spec.id,sun.id);
  if(action==='pause'||action==='finish')assert.equal(game.host.creation?.instanceId,game.occupiedInstance.instanceId);
  else assert.equal(game.host.creation,undefined);
  assert.ok(second.request.signal.aborted);game.host.dispose();
});

test('reset during the second request ignores its late result and restores both opportunities',async()=>{
  const game=await secondOpportunity();game.collect();const second=await game.submit();
  const run=game.host.runId;
  game.race.reset();game.host.reset();game.host.start();
  assert.notEqual(game.host.runId,run);assert.equal(game.host.attemptNumber,1);
  assert.equal(game.host.getSnapshot().secondStar,'scheduled');assert.equal(game.host.opportunitiesRemaining,1);
  second.request.resolve(sun);await second.pending;
  assert.ok(second.request.signal.aborted);assert.equal(game.host.creation,undefined);
  assert.equal(game.host.loop.getSnapshot().phase,'available');assert.ok(game.host.voice);game.host.dispose();
});

for(const offered of [false,true])test('pause preserves a '+(offered?'visible':'future')+' uncollected second star',()=>{
  const game=setup();game.collect();game.host.pause();
  if(offered)game.offerSecond();
  const voice=game.host.voice;const state=game.host.getSnapshot().secondStar;
  game.host.pause();assert.equal(game.host.getSnapshot().secondStar,state);assert.equal(game.host.voice,voice);
  if(!offered)game.offerSecond();
  game.collect();assert.equal(game.host.attemptNumber,2);assert.equal(game.host.loop.getSnapshot().phase,'prompted');game.host.dispose();
});

test('first-attempt admission still rejects late recording and rechecks before audio dispatch',async()=>{
  for(const stage of ['recording','submission'] as const) {
    const game=setup();game.collect();
    if(stage==='submission'){game.host.loop.startRecording();await flush();}
    game.position(0,0,3000);
    if(stage==='recording'){game.host.loop.startRecording();await flush();}
    else await game.host.loop.finishRecording();
    assert.equal(game.host.loop.getSnapshot().phase,'failed');assert.match(game.host.loop.getSnapshot().message,/Not enough race/);
    assert.equal(game.requests.length,0);assert.equal(game.captures(),stage==='recording'?0:1);game.host.dispose();
  }
});

test('second recording is allowed while falling; dispatch requires the minimum playable result time',async()=>{
  for(const depth of [3000,3120]){
    const game=setup();game.collect();game.host.pause();game.offerSecond();game.collect();game.position(0,0,depth);
    game.race.racers[0].controller.setFallSpeed(8);
    game.host.loop.startRecording();await flush();assert.equal(game.host.loop.getSnapshot().phase,'recording');
    const pending=game.host.loop.finishRecording();await flush();
    if(depth===3000){assert.equal(game.requests.length,1);game.requests[0].resolve(sun);}
    else {assert.equal(game.requests.length,0);assert.equal(game.host.loop.getSnapshot().phase,'failed');assert.match(game.host.loop.getSnapshot().message,/close to landing.*Nothing was submitted/);}
    await pending;assert.equal(game.captures(),1);game.host.dispose();
  }
});

test('a speed change near the finish discards a ready result while preserving the active event',async()=>{
  const game=await occupiedSecondOpportunity();game.collect();const second=await game.submit();
  second.request.resolve(sun);await second.pending;
  game.position(0,0,3450);game.race.racers[0].controller.setFallSpeed(60);game.step();
  assert.equal(game.host.loop.getSnapshot().phase,'failed');assert.match(game.host.loop.getSnapshot().message,/finish is too close/);
  assert.equal(game.host.creation!.instanceId,game.occupiedInstance.instanceId);game.host.dispose();
});

test('v3 placement starts early, allows reaction time at speed, and reserves room for the effect',()=>{
  assert.deepEqual(raceEventSpawnPosition([12,-200,-8],30,8),[12,-440,-8]);
  assert.deepEqual(raceEventSpawnPosition([12,-200,-8],60,8),[12,-680,-8]);
  assert.throws(()=>raceEventSpawnPosition([0,-3300,0],30,8),/finish is too close/);
});

test('the authored second-star depth uses a separate random draw once per run',()=>{
  let draws=0;const game=setup(()=>{draws++;return .5;});game.collect();game.host.pause();
  game.step(4.1);assert.equal(draws,1);assert.equal(game.host.voice,undefined);
  game.offerSecond();game.step(.5);assert.equal(draws,1);
  game.race.reset();game.host.reset();assert.equal(draws,2);game.host.dispose();
});

test('the second star uses the reveal-time lane and speed-aware approach while keeping its authored depth fixed',()=>{
  assert.equal(raceVoiceStarLeadMeters(8),120);assert.equal(raceVoiceStarLeadMeters(30),120);assert.equal(raceVoiceStarLeadMeters(60),240);
  const game=setup();game.collect();game.host.pause();
  game.position(0,12,secondDepth-241,-8);game.race.racers[0].controller.setFallSpeed(60);
  let player=game.race.snapshot(game.race.racers[0]);game.host.step(dt,player.position,player.position);
  assert.equal(game.host.voice,undefined);
  game.position(0,12,secondDepth-240,-8);game.race.racers[0].controller.setFallSpeed(60);
  player=game.race.snapshot(game.race.racers[0]);game.host.step(dt,player.position,player.position);
  assert.equal(game.host.voice!.position[0],12);assert.equal(game.host.voice!.position[2],-8);assert.ok(Math.abs(game.host.voice!.position[1]+secondDepth)<1e-8);
  const offered=[...game.host.voice!.position];game.step(.5);
  assert.deepEqual(game.host.voice!.position,offered);assert.equal(game.requests.length,0);game.host.dispose();
});

test('a completed creation has a two-second reveal buffer even when the event slot is empty',async()=>{
  const game=setup();game.collect();const first=await game.submit();first.request.resolve(vortex);await first.pending;
  assert.equal(game.host.loop.getSnapshot().phase,'ready');assert.equal(Boolean(game.host.creation),false);
  game.step(1.9);assert.equal(Boolean(game.host.creation),false);
  game.step(.2);assert.equal(game.host.loop.getSnapshot().phase,'spawned');
  const lead=game.race.snapshot(game.race.racers[0]).position[1]-game.host.creation!.position[1];
  assert.ok(lead>235&&lead<=240);assert.equal(game.requests.length,1);game.host.dispose();
});

test('pausing in the initial reveal buffer discards the ready creation',async()=>{
  const game=setup();game.collect();const first=await game.submit();first.request.resolve(vortex);await first.pending;game.step(1);
  game.host.pause();game.step(2);assert.equal(Boolean(game.host.creation),false);
  assert.equal(game.host.loop.getSnapshot().phase,'failed');assert.ok(first.request.signal.aborted);game.host.dispose();
});


test('a grant collected during the first reveal buffer waits until that result is placed',async()=>{
  const game=setup();game.collect();const first=await game.submit();first.request.resolve(vortex);await first.pending;
  assert.equal(game.host.loop.getSnapshot().phase,'ready');
  game.offerSecond();game.collect();assert.equal(game.host.getSnapshot().secondStar,'collected');
  assert.equal(game.host.attemptNumber,1);assert.equal(game.host.loop.getSnapshot().phase,'ready');
  game.step(1.9);assert.equal(game.host.attemptNumber,1);assert.equal(game.host.creation,undefined);
  game.step(.2);assert.equal(game.host.creation!.spec.id,vortex.id);
  assert.equal(game.host.attemptNumber,2);assert.equal(game.host.loop.getSnapshot().phase,'prompted');
  assert.equal(game.requests.length,1);game.host.dispose();
});

for(const phase of ['prompted','preparing','recording'] as const)test('collecting the second star while first '+phase+' saves the grant without replacing capture state',async()=>{
  const game=setup();game.collect();
  if(phase!=='prompted')game.host.loop.startRecording();
  if(phase==='recording')await flush();
  assert.equal(game.host.loop.getSnapshot().phase,phase);
  const session=game.host.loop.getSnapshot().session;
  game.offerSecond();game.collect();
  assert.equal(game.host.getSnapshot().secondStar,'collected');assert.equal(game.host.attemptNumber,1);
  assert.equal(game.host.loop.getSnapshot().phase,phase);assert.equal(game.host.loop.getSnapshot().session,session);
  assert.equal(game.requests.length,0);
  if(phase==='prompted'){
    game.step(10.1);assert.equal(game.host.attemptNumber,2);assert.equal(game.host.loop.getSnapshot().phase,'prompted');
    assert.ok(game.host.loop.getSnapshot().phaseSeconds<.2,'second speaking window starts only when its grant becomes usable');
  }
  game.host.dispose();await flush();assert.equal(game.requests.length,0);
});
