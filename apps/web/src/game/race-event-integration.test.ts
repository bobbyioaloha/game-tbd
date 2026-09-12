import test from 'node:test';
import assert from 'node:assert/strict';
import { raceEventFixtures, type RaceEventCreation, type RacerEventInput } from '@sky/shared';
import { PracticeRace } from './practice-race';
import { FreefallController } from './freefall-controller';
import { RACE_CREATION_PICKUP_RADIUS } from './race-event-config';
import { RaceEventRuntime } from '../race-events/runtime';
import { RaceEventHost, eventPlacement } from './race-event-host';
import type { AudioCreationClient } from '../voice/voice-client';

const dt=1/120,idle={x:0,z:0},normal={fallSpeedMultiplier:1};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const creation=(type:RaceEventCreation['effect']['type'])=>raceEventFixtures.find(item=>item.spec.effect.type===type)!.spec;
function makeRace(course=false) {
  return new PracticeRace(course,()=>0.42,new RaceEventRuntime({pickupContactRadius:RACE_CREATION_PICKUP_RADIUS}));
}
function place(race:PracticeRace,id:number,x:number,depth:number,z=0) {
  const racer=race.racers[id];
  racer.controller=new FreefallController(36,x,z);racer.controller.setFallSpeed(30);
  racer.controller.step(depth/30,idle,normal);
  racer.decision=Infinity;racer.nextUse=Infinity;racer.target=[x,z];
}
function step(race:PracticeRace,host?:RaceEventHost,ticks=1) {
  for(let i=0;i<ticks;i++) {
    const from=race.snapshot(race.racers[0]).position;
    race.step(dt,idle,false);
    host?.step(dt,from,race.snapshot(race.racers[0]).position);
  }
}
function activeRace(type:RaceEventCreation['effect']['type'],radius?:number) {
  const race=makeRace();[-8,0,8,26].forEach((x,id)=>place(race,id,x,120-RACE_CREATION_PICKUP_RADIUS));
  race.events!.spawn({instanceId:'event',creatorId:'0',spec:radius!==undefined&&'radiusMeters'in creation(type).effect?{...creation(type),effect:{...creation(type).effect,radiusMeters:radius}} as RaceEventCreation:creation(type),position:[0,-120,0],seed:7});
  step(race);
  assert.equal(race.events!.getSnapshot().triggererId,'1');
  // Test effects at the same relative positions after the rival wins the larger pickup.
  [-8,0,8,26].forEach((x,id)=>place(race,id,x,117));
  return race;
}

test('empty events preserve the full race, inventory RNG, steering, boost, and braking',()=>{
  const legacy=new PracticeRace(true,()=>0.42),events=makeRace(true);
  for(let i=0;i<1800;i++) {
    const input={x:Math.sin(i/120),z:Math.cos(i/180)},brake=i%400<30,boost=i%120<60;
    legacy.step(dt,input,brake,boost);events.step(dt,input,brake,boost);
  }
  assert.deepEqual(events.racers.map(r=>events.snapshot(r)),legacy.racers.map(r=>legacy.snapshot(r)));
  assert.deepEqual(events.racers.map(r=>[r.item,r.boostFuel,r.dodgeReady]),legacy.racers.map(r=>[r.item,r.boostFuel,r.dodgeReady]));
});
test('a rival triggers first and the vortex moves the creator and racers on both sides',()=>{
  // Rivals steer back toward their targets, so observe sustained force over four seconds.
  const race=activeRace('gravityWell');step(race,undefined,480);
  assert.ok(Math.hypot(race.snapshot(race.racers[0]).position[0]+8,race.snapshot(race.racers[0]).position[2])>3);
  assert.ok(Math.hypot(race.snapshot(race.racers[2]).position[0]-8,race.snapshot(race.racers[2]).position[2])>3);
  assert.deepEqual(race.events!.getSnapshot().impact?.affectedRacerIds,['0','1','2','3']);
  assert.equal(race.events!.getSnapshot().triggererId,'1');
});
test('repulsion produces outward motion for multiple racers without replacing steering',()=>{
  const race=activeRace('repulsionBurst');step(race,undefined,100);
  assert.ok(race.snapshot(race.racers[0]).position[0]<-8);
  assert.ok(race.snapshot(race.racers[2]).position[0]>8);
  assert.equal(race.events!.getSnapshot().triggererId,'1');
});
test('protection blocks obstacles only while inside and does not grant weapon immunity',()=>{
  const race=activeRace('protectiveZone',12);
  const player=race.racers[0],p=race.snapshot(player).position;
  race.obstacles=[{id:77,kind:'fridge',rotation:[0,0,0],hitAt:-Infinity,position:[...p],active:true}];
  step(race);
  assert.equal(player.eventObstacleProtection,true);assert.equal(player.flailUntil,0);
  assert.equal(race.protected(player),false);assert.equal(race.obstacles[0].active,true);
  race.projectiles=[{id:99,owner:2,position:[...race.snapshot(player).position],velocity:[0,0,0],expires:race.elapsed+1}];
  step(race);assert.ok(player.slowUntil>race.elapsed);
  place(race,0,-30,120);
  race.obstacles=[{id:78,kind:'fridge',rotation:[0,0,0],hitAt:-Infinity,position:[...race.snapshot(player).position],active:true}];
  step(race);assert.equal(player.eventObstacleProtection,false);assert.ok(player.flailUntil>race.elapsed);
});
test('seeded debris changes actual velocity and never touches inventory randomness',()=>{
  const a=activeRace('debrisShower'),b=activeRace('debrisShower');
  // Keep the player on the initial trajectory while the finite debris waves fall.
  for(const race of [a,b])place(race,0,0,120);
  let collision=false;
  for(let i=0;i<500;i++) {
    step(a);step(b);
    collision ||= a.racers.some(r=>Math.abs(r.controller.getWorldVelocity()[0])>0.01);
    assert.deepEqual(a.events!.getSnapshot().debris,b.events!.getSnapshot().debris);
  }
  assert.ok(collision,'a fragment must hit an actual racer');
  assert.deepEqual(a.racers.map(r=>a.snapshot(r)),b.racers.map(r=>b.snapshot(r)));
});
test('every event expires, clears protection/fragments, and a full course still finishes',()=>{
  for(const fixture of raceEventFixtures) {
    const race=makeRace(true);
    race.events!.spawn({instanceId:'one',creatorId:'0',spec:fixture.spec,position:[-7.5,-10,0],seed:42});
    for(let i=0;i<40000&&!race.finished;i++)step(race);
    assert.equal(race.finished,true,fixture.spec.displayName);
    assert.equal(race.events!.getSnapshot().phase,'empty');
    assert.ok(race.racers.every(r=>!r.eventObstacleProtection));
    assert.ok(race.racers.every(r=>r.controller.getWorldVelocity().every(Number.isFinite)));
  }
});
test('external impulses are applied once, decay, and stop pushing into lane walls',()=>{
  const controller=new FreefallController(36,35.9,0);
  const eventInput:RacerEventInput={acceleration:[0,0,0],velocityDelta:[12,6,0],obstacleProtection:false};
  controller.step(dt,idle,{...normal,eventInput});
  assert.ok(controller.getWorldVelocity()[0]>0);
  for(let i=0;i<1200;i++)controller.step(dt,idle,normal);
  assert.ok(Math.abs(controller.getWorldVelocity()[0])<0.001);
  assert.ok(controller.getSnapshot().position[0]<=36);
  controller.step(dt,{x:-1,z:0},normal);
  assert.ok(controller.getSnapshot().position[0]<36);
  controller.reset();assert.deepEqual(controller.getWorldVelocity(),[0,0,0]);
});
test('impulse integration is timestep independent and uses signed vertical velocity',()=>{
  const results=[30,60,120].map(rate=>{
    const c=new FreefallController();c.setFallSpeed(30);
    const eventInput:RacerEventInput={acceleration:[0,0,0],velocityDelta:[10,6,0],obstacleProtection:false};
    for(let i=0;i<rate;i++)c.step(1/rate,idle,{...normal,...(i===0?{eventInput}:{})});
    return c;
  });
  for(const c of results) {
    assert.ok(c.getWorldVelocity()[1]>-30);
    c.getSnapshot().position.forEach((v,i)=>assert.ok(Math.abs(v-results[0].getSnapshot().position[i])<1e-8));
  }
});
test('safe late-course placement preserves obstacles and budgets travel with braking',()=>{
  const race=makeRace();place(race,0,0,200);
  race.obstacles=[{id:1,kind:'fridge',rotation:[0,0,0],hitAt:-Infinity,position:[0,-2160,0],active:true}];
  const placement=eventPlacement(race);
  assert.equal(placement.position[1],-2160);assert.notEqual(placement.position[0]+placement.position[2],0);
  assert.ok(placement.pickupLifetimeSeconds>=2160/8);
  assert.equal(race.obstacles[0].active,true);
  place(race,0,0,3520);assert.throws(()=>eventPlacement(race),/finish/);
});

test('v3 microphone generation keeps falling, validates, spawns from latest position, and calls once',async()=>{
  const race=makeRace();let resolve!:(value:RaceEventCreation)=>void,calls=0;
  const client:AudioCreationClient<RaceEventCreation>={generateAudio:async(_,options)=>{
    calls++;options.onProgress('generating','Creating…','hungry purple planet');
    return new Promise(done=>{resolve=done;});
  }};
  const host=new RaceEventHost(race,{kind:'audio',async start(){},async stop(){return {blob:new Blob(['clip']),captureMs:1000};},cancel(){}},client);
  host.start();host.loop.collectVoice();host.loop.startRecording();await flush();
  const pending=host.loop.finishRecording();await flush();step(race,host,120);
  const before=race.snapshot(race.racers[0]).position[1];assert.ok(before<0);
  resolve(creation('gravityWell'));await pending;
  assert.equal(calls,1);assert.equal(host.loop.getSnapshot().phase,'spawned');
  assert.equal(host.creation?.spec.version,3);assert.equal(host.creation?.position[1],-2160);
  assert.equal(race.racers[0].creationSlowUntil,0);
  // Waiting for a distant pickup must not expire at the lab's old 20-second TTL.
  step(race,host,120*25);assert.equal(race.events!.getSnapshot().phase,'collectible');
  host.dispose();
});
for(const action of ['pause','reset','finish','dispose'] as const)test(action+' aborts pending v3 generation and ignores late completion',async()=>{
  const race=makeRace();let resolve!:(value:RaceEventCreation)=>void,signal:AbortSignal|undefined;
  const host=new RaceEventHost(race,{kind:'audio',async start(){},async stop(){return {blob:new Blob(['clip']),captureMs:500};},cancel(){}},
    {generateAudio:async(_,options)=>{signal=options.signal;return new Promise(done=>{resolve=done;});}});
  host.start();host.loop.collectVoice();host.loop.startRecording();await flush();const pending=host.loop.finishRecording();await flush();
  if(action==='pause')host.pause();
  if(action==='reset'){race.reset();host.reset();}
  if(action==='finish'){race.racers[0].finishTime=race.elapsed;step(race,host);}
  if(action==='dispose')host.dispose();
  assert.ok(signal?.aborted);resolve(creation('gravityWell'));await pending;
  assert.equal(host.creation,undefined);host.dispose();
});
test('shared creation survives its creator finishing and a rival can still activate it',()=>{
  const race=makeRace();
  const host=new RaceEventHost(race,{async start(){},async stop(){return 'hungry purple planet';},cancel(){}});
  host.start();host.spawn(creation('gravityWell'),'shared');
  place(race,1,host.creation!.position[0],2157);
  race.racers[0].finishTime=race.elapsed;
  step(race,host);
  assert.equal(race.events!.getSnapshot().triggererId,'1');
  assert.equal(race.events!.getSnapshot().phase,'active');
  host.pause();const paused=race.events!.getSnapshot();assert.deepEqual(race.events!.getSnapshot(),paused);
  race.reset();host.reset();assert.equal(race.events!.getSnapshot().phase,'empty');host.dispose();
});

test('malformed v3 result consumes the attempt without spawning or applying legacy effects',async()=>{
  const race=makeRace();let calls=0;
  const host=new RaceEventHost(race,{kind:'audio',async start(){},async stop(){return {blob:new Blob(['clip']),captureMs:100};},cancel(){}},
    {async generateAudio(){calls++;return {...creation('gravityWell'),version:2} as unknown as RaceEventCreation;}});
  host.start();host.loop.collectVoice();host.loop.startRecording();await flush();await host.loop.finishRecording();
  assert.equal(host.loop.getSnapshot().phase,'failed');assert.equal(host.creation,undefined);
  host.loop.collectVoice();host.loop.startRecording();assert.equal(calls,1);host.dispose();
});

test('strong presets reach a spread-out race and have a measurable effect on the player',()=>{
  for(const fixture of raceEventFixtures) {
    const race=makeRace();
    [0,1,2,3].forEach(id=>place(race,id,id*8,117+id*100));
    // Freeze rivals' steering only; all four still use the real movement integrator.
    race.events!.spawn({instanceId:'spread',creatorId:'0',spec:fixture.spec,position:[0,-120,0],seed:2654435761});
    let maxLateral=0,maxSpeed=30;
    for(let tick=0;tick<1100;tick++) {
      step(race);
      const player=race.snapshot(race.racers[0]);
      maxLateral=Math.max(maxLateral,Math.hypot(player.position[0],player.position[2]));
      maxSpeed=Math.max(maxSpeed,player.fallSpeed);
    }
    const report=race.events!.getSnapshot();
    assert.deepEqual(report.impact?.affectedRacerIds,['0','1','2','3'],fixture.spec.effect.type);
    if(fixture.spec.effect.type==='protectiveZone')assert.ok(maxSpeed>50,'slipstream noticeably speeds the safe dive');
    else assert.ok(maxLateral>10,fixture.spec.effect.type+' must cause obvious lateral movement');
    if(fixture.spec.effect.type==='repulsionBurst')assert.deepEqual(report.impact?.impulseCounts,{'0':1,'1':1,'2':1,'3':1});
    if(fixture.spec.effect.type==='debrisShower')for(const id of ['0','1','2','3'])assert.ok((report.impact?.debrisHits[id]??0)>0);
  }
});
test('event results survive restart and exact creations replay nearby without another request',()=>{
  const race=makeRace();let calls=0;
  const host=new RaceEventHost(race,{async start(){calls++;},async stop(){throw Error('No recording expected');},cancel(){}});
  host.loadFixture(creation('repulsionBurst'),true);
  assert.equal(host.creation?.position[1],-30);
  step(race,host,1500);
  const report=host.report!;
  assert.equal(report.phase,'expired');assert.ok(report.impact!.affectedRacerIds.length>0);
  race.reset();host.reset();assert.equal(host.report!.instance!.spec.id,report.instance!.spec.id);
  host.loadFixture(host.report!.instance!.spec,true);
  assert.deepEqual(host.creation!.spec,report.instance!.spec);assert.equal(calls,0);host.dispose();
});
test('slipstream counts actual blocked obstacles once without destroying them',()=>{
  const race=activeRace('protectiveZone');const p=race.snapshot(race.racers[0]).position;
  race.obstacles=[{id:123,kind:'fridge',rotation:[0,0,0],hitAt:-Infinity,position:[...p],active:true}];
  step(race,undefined,3);
  assert.equal(race.events!.getSnapshot().impact?.obstacleBlocks['0'],1);
  assert.equal(race.obstacles[0].active,true);assert.equal(race.racers[0].flailUntil,0);
});

test('main-race creation collects a near miss at full fall speed',()=>{
  const race=makeRace();
  place(race,0,7,80);
  race.racers[0].controller.setFallSpeed(60);
  race.racers[0].boostFuel=2;
  race.racers.slice(1).forEach(racer=>{racer.finishTime=0;});
  race.events!.spawn({instanceId:'forgiving',creatorId:'0',seed:1,
    spec:creation('repulsionBurst'),position:[0,-120,0]});
  for(let tick=0;tick<100;tick++)race.step(dt,idle,false,true);
  const event=race.events!.getSnapshot();
  assert.equal(event.triggererId,'0');
  assert.equal(event.phase,'active');
  assert.equal(event.impact?.impulseCounts['0'],1);
});
