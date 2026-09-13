import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNoopRaceEvents, safetyDrillFixtures, type SafetyDrillRecipe, type EventRacer,
  type EventVector, type DrillSnapshot, type RaceEventSnapshot } from '@sky/shared';
import { RaceEventRuntime } from '../race-events/runtime';
import { length } from '../race-events/math';
import { FreefallController, EVENT_DRAG } from './freefall-controller';
import { PracticeRace } from './practice-race';
import { planRival } from './rival-planner';

const dt=1/120;
const racer=(id:string,position:EventVector=[0,0,0],velocity:EventVector=[0,-30,0]):EventRacer=>({id,position,velocity,finished:false});
const stationary=(racers:readonly EventRacer[])=>racers.map(racer=>({id:racer.id,from:racer.position,to:racer.position}));
const fixture=(family:SafetyDrillRecipe['family'])=>{
  const fixture=safetyDrillFixtures.find(fixture=>fixture.spec.drill.family===family);
  assert.ok(fixture,'missing fixture for '+family);return fixture.spec;
};
function activate(family:SafetyDrillRecipe['family'],racers=[racer('creator')]) {
  const runtime=new RaceEventRuntime();
  runtime.spawn({instanceId:family,creatorId:racers[0].id,spec:fixture(family),position:racers[0].position,seed:42});
  runtime.prepareStep(dt,racers);runtime.resolveContacts(stationary(racers));
  assert.equal(runtime.getSnapshot().phase,'active');return runtime;
}
const snapshot=(controller:FreefallController)=>racer('creator',controller.getSnapshot().position,controller.getWorldVelocity());
const noMotion={x:0,z:0};
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);

function proveSingleControllerImpulse(runtime:RaceEventRuntime,controller:FreefallController,comparison:FreefallController,maxTicks:number) {
  let forwarded=0,impulseY=0,ticksAfterImpulse=0;
  for(let tick=0;tick<maxTicks;tick++) {
    const input=runtime.prepareStep(dt,[snapshot(controller)]).creator;
    if(length(input.velocityDelta)>0) {
      forwarded++;impulseY=input.velocityDelta[1];ticksAfterImpulse=0;
      assert.equal(forwarded,1,'a single contact/release must not be dispatched again next tick');
      assert.notEqual(impulseY,0,'the fixture must exercise an observable vertical impulse');
    }
    const motion=controller.step(dt,noMotion,{fallSpeedMultiplier:1,eventInput:input});
    comparison.step(dt,noMotion,{fallSpeedMultiplier:1,eventInput:{...input,velocityDelta:[0,0,0]}});
    runtime.resolveContacts([{id:'creator',from:motion.previousPosition,to:motion.position}]);
    if(forwarded) {
      ticksAfterImpulse++;
      // Both controllers receive identical forces; only one receives the one-shot delta.
      // The resulting momentum should decay naturally, rather than vanish or be applied twice.
      near(controller.getWorldVelocity()[1]-comparison.getWorldVelocity()[1],impulseY*Math.exp(-EVENT_DRAG*dt*ticksAfterImpulse));
      if(ticksAfterImpulse===30)break;
    }
  }
  assert.equal(forwarded,1,'the real event adapter must deliver its mechanic impulse to movement');
  assert.equal(ticksAfterImpulse,30);
  assert.equal(runtime.getSnapshot().impact!.impulseCounts.creator,1);
}

test('orbit release passes through the real event adapter into FreefallController exactly once',()=>{
  // Activate 115 m above controller origin so the frozen orbit is centered around Y=0.
  const runtime=activate('orbit',[racer('creator',[0,115,0])]);
  const field=runtime.getSnapshot().drill!.orbits![0];
  const controller=new FreefallController(36,field.position[0]+10,field.position[2]);
  const comparison=new FreefallController(36,field.position[0]+10,field.position[2]);
  controller.setFallSpeed(30);comparison.setFallSpeed(30);
  proveSingleControllerImpulse(runtime,controller,comparison,700);
  assert.equal(runtime.getSnapshot().impact!.drill!.orbitReleases!.creator,1);
  assert.ok(runtime.getSnapshot().impact!.drill!.orbitSeconds!.creator>0);
});

test('pinball swept contacts queue one bounce for the next controller tick without losing or doubling it',()=>{
  const runtime=activate('pinball');const bumper=runtime.getSnapshot().drill!.actors[0];
  const controller=new FreefallController(36,bumper.position[0],bumper.position[2]);
  const comparison=new FreefallController(36,bumper.position[0],bumper.position[2]);
  controller.setFallSpeed(30);comparison.setFallSpeed(30);
  proveSingleControllerImpulse(runtime,controller,comparison,500);
  assert.equal(runtime.getSnapshot().impact!.drill!.bounces!.creator,1);
});

test('reset clears a pending bumper impulse before the next movement tick',()=>{
  const runtime=activate('pinball'),bumper=runtime.getSnapshot().drill!.actors[0];
  const controller=new FreefallController(36,bumper.position[0],bumper.position[2]);controller.setFallSpeed(30);
  let contacted=false;
  for(let tick=0;tick<500;tick++) {
    const input=runtime.prepareStep(dt,[snapshot(controller)]).creator;
    const motion=controller.step(dt,noMotion,{fallSpeedMultiplier:1,eventInput:input});
    runtime.resolveContacts([{id:'creator',from:motion.previousPosition,to:motion.position}]);
    if(runtime.getSnapshot().impact?.drill?.bounces?.creator){
      assert.deepEqual(input.velocityDelta,[0,0,0],'contact is still queued for the next tick');contacted=true;break;
    }
  }
  assert.equal(contacted,true);runtime.reset();
  const after=runtime.prepareStep(dt,[snapshot(controller)]).creator;runtime.resolveContacts(stationary([snapshot(controller)]));
  assert.deepEqual(after,{acceleration:[0,0,0],velocityDelta:[0,0,0],obstacleProtection:false});
  assert.equal(runtime.getSnapshot().drill,undefined);assert.equal(runtime.getSnapshot().impact?.drill,undefined);
});

for(const family of ['pinball','buddy','orbit','reconstruction','observation'] as const)
  test(family+' expires and resets through the main event lifecycle with no remaining force volumes',()=>{
    const racers=[racer('creator',[-12,0,0]),racer('rival',[12,0,0])],runtime=activate(family,racers);
    for(let tick=0;tick<1202;tick++){runtime.prepareStep(dt,racers);runtime.resolveContacts(stationary(racers));}
    const ended=runtime.getSnapshot();
    assert.equal(ended.phase,'expired');assert.equal(ended.drill,undefined);assert.ok(ended.impact?.drill);
    const inputs=runtime.prepareStep(dt,racers);runtime.resolveContacts(stationary(racers));
    for(const input of Object.values(inputs))assert.deepEqual(input,{acceleration:[0,0,0],velocityDelta:[0,0,0],obstacleProtection:false});
    runtime.reset();const reset=runtime.getSnapshot();
    assert.equal(reset.phase,'empty');assert.equal(reset.drill,undefined);assert.equal(reset.impact?.drill,undefined);
  });

function rivalTarget(drill:DrillSnapshot) {
  const noop=createNoopRaceEvents();
  const event:RaceEventSnapshot={...noop.getSnapshot(),phase:'active',drill};
  const race=new PracticeRace(false,()=>0.42,{...noop,getSnapshot:()=>event});
  const rival=race.racers[1];rival.controller=new FreefallController(36,0,0);rival.controller.setFallSpeed(30);
  for(const obstacle of race.obstacles)obstacle.active=false;
  for(const box of race.boxes)box.active=false;
  for(const ring of race.rings)ring.used.add(rival.id);
  planRival(race,rival);return rival.target;
}

test('rival planning reacts to visible buddies, inspection cones, and reconstructed path hazards',()=>{
  const empty:DrillSnapshot={actors:[],currents:[],warningSeconds:0};
  const tether={id:0,racerIds:['1','other'] as const,from:[0,0,0] as const,to:[15,0,0] as const,restLength:8,tension:1,active:true};
  assert.deepEqual(rivalTarget(empty),[0,0]);
  assert.deepEqual(rivalTarget({...empty,tethers:[tether]}),[15,0],'a stretched tether prompts the rival to cooperate');
  const inspector={id:0,position:[0,10,0] as const,direction:[0,-1,0] as const,range:100,cosHalfAngle:0.5,watching:true,warning:false};
  assert.deepEqual(rivalTarget({...empty,tethers:[tether],observers:[inspector]}),[0,0],'a watching inspector makes the rival wait before crossing');
  const echo={id:0,kind:'echo' as const,position:[0,-12,0] as const,velocity:[0,0,0] as const,radius:4,state:'warning' as const};
  assert.notDeepEqual(rivalTarget({...empty,actors:[echo]}),[0,0],'a telegraphed replay hazard can be dodged before arming');
});
