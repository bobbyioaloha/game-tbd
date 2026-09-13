import test from 'node:test';
import assert from 'node:assert/strict';
import { raceEventFixtures, type RaceEventCreation } from '@sky/shared';
import { FreefallController } from './freefall-controller';
import { PracticeRace } from './practice-race';
import { RaceEventHost } from './race-event-host';
import { RACE_CREATION_PICKUP_RADIUS, raceEventSpawnPosition, raceVoiceStarLeadMeters } from './race-event-config';
import { RaceEventRuntime } from '../race-events/runtime';

const dt=1/120,flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const vortex=raceEventFixtures.find(item=>item.spec.effect.type==='gravityWell')!.spec;
const sun=raceEventFixtures.find(item=>item.spec.effect.type==='repulsionBurst')!.spec;
function setup() {
  const race=new PracticeRace(false,()=>0.42,new RaceEventRuntime({pickupContactRadius:RACE_CREATION_PICKUP_RADIUS}));
  const requests:Array<{signal:AbortSignal;resolve:(spec:RaceEventCreation)=>void;reject:(error:Error)=>void}>=[];
  let captures=0;
  const host=new RaceEventHost(race,{kind:'audio',async start(){captures++;},async stop(){return {blob:new Blob(['fake audio']),captureMs:500};},cancel(){}},
    {generateAudio:async(_,options)=>new Promise((resolve,reject)=>requests.push({signal:options.signal,resolve,reject}))});
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
    assert.equal(host.loop.getSnapshot().phase,'prompted');
  };
  const submit=async()=>{
    host.loop.startRecording();await flush();
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
    position(id,x,-y-RACE_CREATION_PICKUP_RADIUS+0.1,z);step();
    assert.equal(race.events!.getSnapshot().phase,'active');
    assert.equal(race.events!.getSnapshot().triggererId,String(id));
  };
  return {host,race,requests,step,collect,submit,position,trigger,captures:()=>captures};
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
  const game=await firstCreation();game.trigger(1);expireEvent(game);game.step(4.1);
  assert.equal(game.host.attemptNumber,2);assert.ok(game.host.voice);
  assert.equal(game.race.events!.getSnapshot().instance!.instanceId,game.firstInstance.instanceId);
  assert.equal(game.race.events!.getSnapshot().phase,'expired');
  return game;
}
async function occupiedSecondOpportunity() {
  const game=await secondOpportunity();
  // Deliberately fill the shared slot after the star is offered to keep the
  // ready-result safeguard covered independently of normal star scheduling.
  game.host.spawn(vortex,'occupied-shared-slot');game.trigger(1);
  return {...game,occupiedInstance:game.race.events!.getSnapshot().instance!};
}

test('a rival-triggered first event stays intact and the next star waits four full seconds after expiry',async()=>{
  const game=await firstCreation();game.trigger(1);game.step(4.1);
  const active=game.race.events!.getSnapshot();
  assert.equal(active.phase,'active');assert.equal(active.triggererId,'1');
  assert.equal(active.instance!.instanceId,game.firstInstance.instanceId);
  assert.equal(active.instance!.seed,game.firstInstance.seed);
  assert.equal(game.host.attemptNumber,1);assert.equal(game.host.voice,undefined);
  expireEvent(game);
  assert.equal(game.host.voice,undefined);game.step(4-dt);
  assert.equal(game.host.voice,undefined);assert.equal(game.host.attemptNumber,1);
  game.step(2*dt);assert.ok(game.host.voice);assert.equal(game.host.attemptNumber,2);
  assert.equal(game.race.events!.getSnapshot().phase,'expired');
  assert.equal(game.race.events!.getSnapshot().instance!.instanceId,game.firstInstance.instanceId);
  assert.equal(game.requests.length,1);assert.equal(game.captures(),1);game.host.dispose();
});

test('two ordinary creations use separate attempts after the first event has finished',async()=>{
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
  assert.equal(game.host.creation!.spec.id,vortex.id);
  game.step(6.1);
  assert.equal(game.host.loop.getSnapshot().phase,'spawned');
  const next=game.race.events!.getSnapshot().instance!;
  assert.equal(next.spec.id,sun.id);assert.notEqual(next.instanceId,game.occupiedInstance.instanceId);
  assert.notEqual(next.seed,game.occupiedInstance.seed);
  game.host.loop.placeReadyCreation();assert.equal(game.host.creation!.instanceId,next.instanceId);
  game.trigger();game.step(12);
  assert.equal(game.requests.length,2);assert.equal(game.captures(),2);
  assert.equal(game.host.voice,undefined);assert.equal(game.host.opportunitiesRemaining,0);game.host.dispose();
});

test('a failed first request consumes its star but allows a separate second opportunity',async()=>{
  const game=setup();game.collect();const first=await game.submit();
  first.request.reject(new Error('Simulated provider failure'));await first.pending;
  assert.equal(game.host.loop.getSnapshot().phase,'failed');
  game.step(4.1);assert.equal(game.host.attemptNumber,2);assert.ok(game.host.voice);
  assert.equal(game.requests.length,1,'another star must not automatically dispatch');
  game.collect();const second=await game.submit();second.request.resolve(sun);await second.pending;game.step(2.1);
  assert.equal(game.host.loop.getSnapshot().phase,'spawned');assert.equal(game.requests.length,2);
  game.host.dispose();
});

test('missing a star consumes only that opportunity; no recording or request starts',()=>{
  const game=setup(),[x,y,z]=game.host.voice!.position;
  game.host.step(dt,[x+10,y+5,z],[x+10,y-6,z]);
  assert.equal(game.host.loop.getSnapshot().phase,'missed');game.step(4.1);
  assert.equal(game.host.attemptNumber,2);assert.ok(game.host.voice);
  assert.equal(game.requests.length,0);assert.equal(game.captures(),0);game.host.dispose();
});

for(const action of ['pause','reset','finish','dispose'] as const)test(action+' discards a queued second creation without replacing the occupied event',async()=>{
  const game=await occupiedSecondOpportunity();game.collect();const second=await game.submit();
  second.request.resolve(sun);await second.pending;game.step(2.1);assert.equal(game.host.loop.getSnapshot().phase,'ready');
  if(action==='pause')game.host.pause();
  if(action==='reset'){game.race.reset();game.host.reset();}
  if(action==='finish'){game.race.racers[0].finishTime=game.race.elapsed;game.step();}
  if(action==='dispose')game.host.dispose();
  game.host.loop.placeReadyCreation();
  assert.notEqual(game.host.creation?.spec.id,sun.id);
  if(action==='pause'||action==='finish')assert.equal(game.host.creation?.instanceId,game.occupiedInstance.instanceId);
  else assert.equal(game.host.creation,undefined);
  assert.ok(second.request.signal.aborted);game.host.dispose();
});

test('reset during the second request discards its late result and restores two opportunities',async()=>{
  const game=await secondOpportunity();game.collect();const second=await game.submit();
  const run=game.host.runId;
  game.race.reset();game.host.reset();game.host.start();
  assert.notEqual(game.host.runId,run);assert.equal(game.host.attemptNumber,1);
  assert.equal(game.host.opportunitiesRemaining,1);
  second.request.resolve(sun);await second.pending;
  assert.ok(second.request.signal.aborted);assert.equal(game.host.creation,undefined);
  assert.equal(game.host.loop.getSnapshot().phase,'available');assert.ok(game.host.voice);game.host.dispose();
});

test('a late star is not offered and braking cannot extend the admission estimate',()=>{
  const game=setup();game.collect();game.host.pause();
  game.position(0,0,3000);game.race.racers[0].controller.setFallSpeed(8);game.step(4.1);
  assert.equal(game.host.attemptNumber,1);assert.equal(game.host.opportunitiesRemaining,0);
  assert.equal(game.host.voice,undefined);assert.match(game.host.nextOpportunityMessage,/Not enough race/);
  assert.equal(game.requests.length,0);game.host.dispose();
});

test('late expiry of the first event safely closes the second opportunity',async()=>{
  const game=await firstCreation();game.trigger(1);game.position(0,0,2500);expireEvent(game);
  assert.equal(game.host.voice,undefined);game.step(4.1);
  assert.equal(game.host.attemptNumber,1);assert.equal(game.host.opportunitiesRemaining,0);
  assert.equal(game.host.voice,undefined);assert.match(game.host.nextOpportunityMessage,/Not enough race/);
  assert.equal(game.race.events!.getSnapshot().instance!.instanceId,game.firstInstance.instanceId);
  assert.equal(game.race.events!.getSnapshot().phase,'expired');
  assert.equal(game.requests.length,1);assert.equal(game.captures(),1);game.host.dispose();
});

test('time checks reject recording before capture and recheck before audio dispatch',async()=>{
  for(const stage of ['recording','submission'] as const) {
    const game=setup();game.collect();
    if(stage==='submission'){game.host.loop.startRecording();await flush();}
    game.position(0,0,3000);
    if(stage==='recording'){game.host.loop.startRecording();await flush();}
    else await game.host.loop.finishRecording();
    assert.equal(game.host.loop.getSnapshot().phase,'failed');
    assert.match(game.host.loop.getSnapshot().message,/Not enough race/);
    assert.equal(game.requests.length,0);assert.equal(game.captures(),stage==='recording'?0:1);game.host.dispose();
  }
});

test('a speed change near the finish discards a ready result while preserving the active event',async()=>{
  const game=await occupiedSecondOpportunity();game.collect();const second=await game.submit();
  second.request.resolve(sun);await second.pending;
  game.position(0,0,3450);game.race.racers[0].controller.setFallSpeed(60);game.step();
  assert.equal(game.host.loop.getSnapshot().phase,'failed');
  assert.match(game.host.loop.getSnapshot().message,/finish is too close/);
  assert.equal(game.host.creation!.instanceId,game.occupiedInstance.instanceId);game.host.dispose();
});

test('v3 placement starts early, allows reaction time at speed, and reserves room for the effect',()=>{
  assert.deepEqual(raceEventSpawnPosition([12,-200,-8],30,8),[12,-440,-8]);
  assert.deepEqual(raceEventSpawnPosition([12,-200,-8],60,8),[12,-680,-8]);
  assert.throws(()=>raceEventSpawnPosition([0,-3300,0],30,8),/finish is too close/);
});

test('the next star waits four seconds and appears with a longer approach',async()=>{
  const game=setup();game.collect();const first=await game.submit();
  first.request.reject(new Error('Simulated failure'));await first.pending;
  game.step(3.9);assert.equal(Boolean(game.host.voice),false);assert.equal(game.host.attemptNumber,1);
  game.step(.2);assert.ok(game.host.voice);assert.equal(game.host.attemptNumber,2);
  const lead=game.race.snapshot(game.race.racers[0]).position[1]-game.host.voice.position[1];
  assert.ok(lead>115&&lead<=120,'the star starts 120 m ahead and stays fixed as racers approach');
  assert.equal(game.requests.length,1);game.host.dispose();
});

test('the second star uses the current lane and keeps a four-second approach at a higher speed',()=>{
  const game=setup();game.collect();game.host.pause();game.step(3.9);
  game.position(0,12,150,-8);game.race.racers[0].controller.setFallSpeed(40);
  const player=game.race.snapshot(game.race.racers[0]);
  // Advance the host clock without normal movement clamping this instantaneous
  // faster snapshot; the host must use the speed and lane at the moment of offer.
  game.race.elapsed+=.2;game.host.step(.2,player.position,player.position);
  assert.ok(game.host.voice);assert.deepEqual(game.host.voice.position,[12,-310,-8]);
  const offered=[...game.host.voice.position];game.step(.5);
  assert.deepEqual(game.host.voice!.position,offered,'the offered star stays fixed during approach');
  assert.equal(game.requests.length,0);assert.equal(game.captures(),0);game.host.dispose();
});

test('voice star approach scales at boosted speed but keeps the full request admission budget',()=>{
  assert.equal(raceVoiceStarLeadMeters(8),120);
  assert.equal(raceVoiceStarLeadMeters(30),120);
  assert.equal(raceVoiceStarLeadMeters(60),240);
  const game=setup();game.collect();game.host.pause();game.step(3.9);
  game.position(0,0,0);game.race.racers[0].controller.setFallSpeed(60);
  const player=game.race.snapshot(game.race.racers[0]);
  game.race.elapsed+=.2;game.host.step(.2,player.position,player.position);
  assert.equal(game.host.voice,undefined);assert.equal(game.host.opportunitiesRemaining,0);
  assert.match(game.host.nextOpportunityMessage,/Not enough race/);
  assert.equal(game.requests.length,0);assert.equal(game.captures(),0);game.host.dispose();
});

test('a completed creation has a two-second reveal buffer even when the event slot is empty',async()=>{
  const game=setup();game.collect();const first=await game.submit();
  first.request.resolve(vortex);await first.pending;
  assert.equal(game.host.loop.getSnapshot().phase,'ready');assert.equal(Boolean(game.host.creation),false);
  game.step(1.9);assert.equal(Boolean(game.host.creation),false);
  game.step(.2);assert.equal(game.host.loop.getSnapshot().phase,'spawned');
  const lead=game.race.snapshot(game.race.racers[0]).position[1]-game.host.creation!.position[1];
  assert.ok(lead>235&&lead<=240,'reveal places from the current position with an eight-second approach');
  assert.equal(game.requests.length,1);game.host.dispose();
});

test('pausing in the initial reveal buffer discards the ready creation',async()=>{
  const game=setup();game.collect();const first=await game.submit();
  first.request.resolve(vortex);await first.pending;game.step(1);
  game.host.pause();game.step(2);
  assert.equal(Boolean(game.host.creation),false);assert.equal(game.host.loop.getSnapshot().phase,'failed');
  assert.ok(first.request.signal.aborted);game.host.dispose();
});
