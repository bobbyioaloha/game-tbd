import test from 'node:test';
import assert from 'node:assert/strict';
import { raceEventFixtures, RACE_EVENT_LIMITS, type EventRacer, type RacerSegment, type RaceEventCreation } from '@sky/shared';
import { RaceEventRuntime } from './runtime';
import { contactTime, length } from './math';
const racer=(id:string,x=0,y=0):EventRacer=>({id,position:[x,y,0],velocity:[0,-10,0],finished:false});
const still=(racers:EventRacer[]):RacerSegment[]=>racers.map(r=>({id:r.id,from:r.position,to:r.position}));
function setup(index=0,seed=7,radius?:number) {
  const runtime=new RaceEventRuntime();
  runtime.spawn({instanceId:'one',creatorId:'creator',seed,position:[0,0,0],spec:radius!==undefined?{...raceEventFixtures[index].spec,effect:{...raceEventFixtures[index].spec.effect,radiusMeters:radius}} as RaceEventCreation:raceEventFixtures[index].spec});
  return runtime;
}
function activate(runtime:RaceEventRuntime,racers=[racer('creator'),racer('rival',5)]) {
  runtime.prepareStep(1/120,racers);runtime.resolveContacts(still(racers));
  assert.equal(runtime.getSnapshot().phase,'active');
}
test('swept first contact differs from closest approach and handles starting inside',()=>{
  assert.equal(contactTime([0,3,0],[0,-3,0],[0,0,0],1),1/3);
  assert.equal(contactTime([0,0,0],[0,2,0],[0,0,0],1),0);
  assert.equal(contactTime([5,3,0],[5,-3,0],[0,0,0],1),undefined);
});
test('earliest contact wins once even when the creator is listed first',()=>{
  const runtime=setup();runtime.prepareStep(1/120,[racer('creator',0,5),racer('rival',0,2)]);
  runtime.resolveContacts([{id:'creator',from:[0,5,0],to:[0,-5,0]},{id:'rival',from:[0,2,0],to:[0,-5,0]}]);
  assert.equal(runtime.getSnapshot().triggererId,'rival');
  runtime.prepareStep(1/120,[racer('creator'),racer('rival')]);runtime.resolveContacts(still([racer('creator'),racer('rival')]));
  assert.equal(runtime.getSnapshot().triggererId,'rival');
});
test('simultaneous contacts break ties by racer ID independent of array order; finished racers cannot trigger',()=>{
  for(const reverse of [false,true]) {
    const runtime=setup();let racers=[racer('b'),racer('a'),{...racer('0'),finished:true}];if(reverse)racers=racers.reverse();
    activate(runtime,racers);assert.equal(runtime.getSnapshot().triggererId,'a');
  }
});
test('creator passing or finishing does not remove a collectible another racer can reach',()=>{
  const runtime=setup();runtime.prepareStep(1/120,[racer('creator',0,-10),racer('rival',0,4)]);
  runtime.resolveContacts(still([racer('creator',0,-10),racer('rival',0,4)]));assert.equal(runtime.getSnapshot().phase,'collectible');
  runtime.prepareStep(1/120,[{...racer('creator'),finished:true},racer('rival',0,4)]);
  runtime.resolveContacts([{id:'rival',from:[0,4,0],to:[0,-4,0]}]);assert.equal(runtime.getSnapshot().triggererId,'rival');
});
test('all racers passing expires a collectible and lifetime is bounded',()=>{
  const passed=setup();passed.prepareStep(1/120,[racer('rival',5,-10)]);passed.resolveContacts(still([racer('rival',5,-10)]));
  assert.equal(passed.getSnapshot().expirationReason,'passed');
  const lifetime=setup();for(let i=0;i<601;i++){lifetime.prepareStep(1/30,[racer('rival',5,4)]);lifetime.resolveContacts(still([racer('rival',5,4)]));}
  assert.equal(lifetime.getSnapshot().expirationReason,'lifetime');
});
test('gravity is finite at its centre, bounded near it, and applies equally to creator and rivals',()=>{
  const runtime=setup();activate(runtime);
  const racers=[racer('creator',24),racer('rival',-24),racer('centre',0,-10/120),racer('outside',5000)];
  const input=runtime.prepareStep(1/120,racers);
  assert.ok(input.creator.acceleration[0]<0);assert.ok(input.rival.acceleration[0]>0);
  assert.equal(length(input.creator.acceleration),length(input.rival.acceleration));
  assert.ok(input.centre.acceleration.every(Number.isFinite));assert.deepEqual(input.outside.acceleration,[0,0,0]);
  for(const modifier of Object.values(input))assert.ok(length(modifier.acceleration)<=RACE_EVENT_LIMITS.maxAcceleration);
  runtime.resolveContacts(still(racers));
});
test('persistent anchor drifts once per tick and protection follows spatial entry and exit',()=>{
  const runtime=setup(3,7,12);activate(runtime);
  const racers=[racer('creator',4),racer('rival',-4),racer('outside',20)];
  const input=runtime.prepareStep(1/30,racers);runtime.resolveContacts(still(racers));
  assert.equal(input.creator.obstacleProtection,true);assert.equal(input.rival.obstacleProtection,true);assert.equal(input.outside.obstacleProtection,false);
  assert.equal(runtime.getSnapshot().position[1],-10/30);
  const next=[racer('creator',30),racer('rival',0)];const changed=runtime.prepareStep(1/120,next);runtime.resolveContacts(still(next));
  assert.equal(changed.creator.obstacleProtection,false);assert.equal(changed.rival.obstacleProtection,true);
});
test('shockwave hits each racer once, including the triggerer, and remains at its activation depth',()=>{
  const runtime=setup(2);activate(runtime);const racers=[racer('creator'),racer('rival',2)];const hits={creator:0,rival:0};
  for(let i=0;i<310;i++) {
    const inputs=runtime.prepareStep(1/120,racers);runtime.resolveContacts(still(racers));
    for(const id of ['creator','rival'] as const)if(length(inputs[id].velocityDelta)>0)hits[id]++;
  }
  assert.deepEqual(hits,{creator:1,rival:1});assert.equal(runtime.getSnapshot().position[1],0);assert.equal(runtime.getSnapshot().phase,'expired');
});
test('debris waves are reproducible, bounded, telegraphed, and hit stationary racers',()=>{
  const a=setup(1),b=setup(1);const racers=[racer('creator'),racer('rival',50)];activate(a,racers);activate(b,racers);
  assert.ok(a.getSnapshot().debris.every(p=>p.position[1]>=24),'incoming rocks start visibly above racers');
  let maxFragments=0;
  for(let tick=0;tick<1000;tick++) {
    for(const runtime of [a,b]){runtime.prepareStep(1/120,racers);runtime.resolveContacts(still(racers));}
    assert.deepEqual(a.getSnapshot().debris,b.getSnapshot().debris);
    maxFragments=Math.max(maxFragments,a.getSnapshot().debris.length);
  }
  const report=a.getSnapshot();
  assert.equal(report.phase,'expired');assert.ok(maxFragments<=RACE_EVENT_LIMITS.maxDebris);
  assert.ok(report.impact!.debrisHits.creator>=3);assert.ok(report.impact!.debrisHits.rival>=3);
  assert.deepEqual(report.impact,b.getSnapshot().impact);
});
test('debris respects protection, allows steering out of its path, and ignores cosmetic fragments',()=>{
  const runtime=setup(1);let racers=[{...racer('creator'),protected:true},racer('rival',50)];activate(runtime,racers);
  let protectedImpulse=false;
  for(let tick=0;tick<120;tick++) {
    const input=runtime.prepareStep(1/120,racers);runtime.resolveContacts(still(racers));
    protectedImpulse ||= length(input.creator.velocityDelta)>0;
  }
  assert.equal(protectedImpulse,false);assert.ok(runtime.getSnapshot().impact!.blockedDebrisHits.creator>0);
  assert.ok(runtime.getSnapshot().impact!.debrisHits.rival>0);
  const dodged=setup(1);activate(dodged,[racer('creator')]);
  for(let tick=0;tick<100;tick++) {
    const from=[tick/120*30,0,0] as const,to=[(tick+1)/120*30,0,0] as const;
    dodged.prepareStep(1/120,[racer('creator',from[0])]);dodged.resolveContacts([{id:'creator',from,to}]);
  }
  assert.equal(dodged.getSnapshot().impact!.debrisHits.creator,undefined,'moving away avoids the aimed opening wave');
});
test('reset discards forces, contacts and replay state; pausing needs no runtime clock',()=>{
  const runtime=setup();activate(runtime);const before=runtime.getSnapshot();assert.deepEqual(runtime.getSnapshot(),before);
  runtime.reset();assert.equal(runtime.getSnapshot().phase,'empty');
  const result=runtime.prepareStep(1/120,[racer('creator')]);runtime.resolveContacts(still([racer('creator')]));
  assert.deepEqual(result.creator,{acceleration:[0,0,0],velocityDelta:[0,0,0],obstacleProtection:false});
});
test('adapter rejects invalid steps, duplicate IDs and unvalidated specs',()=>{
  const runtime=setup();assert.throws(()=>runtime.prepareStep(0,[]));assert.throws(()=>runtime.prepareStep(1,[]));
  assert.throws(()=>runtime.prepareStep(1/120,[racer('same'),racer('same')]));
  assert.throws(()=>runtime.resolveContacts([]));runtime.prepareStep(1/120,[]);assert.throws(()=>runtime.prepareStep(1/120,[]));runtime.resolveContacts([]);
  runtime.reset();assert.throws(()=>runtime.spawn({instanceId:'bad',creatorId:'creator',position:[0,0,0],seed:0,
    spec:{...raceEventFixtures[0].spec,effect:{type:'script'}} as unknown as RaceEventCreation}));
});

test('game-authored pickup bounds are independent of model size and lifetime stays bounded',()=>{
  for(const offset of [3.4,3.6])for(const size of [0.2,3]) {
    const runtime=new RaceEventRuntime({pickupContactRadius:3.5});
    runtime.spawn({instanceId:'game',creatorId:'a',seed:1,position:[0,0,0],spec:{...raceEventFixtures[0].spec,appearance:{type:'primitives',primitives:[{type:'box',position:[0,0,0],rotation:[0,0,0],scale:[size,size,size],color:'#ffcc00'}]}},pickupLifetimeSeconds:300});
    runtime.prepareStep(1/120,[racer('a',offset,5)]);
    runtime.resolveContacts([{id:'a',from:[offset,5,0],to:[offset,-5,0]}]);
    assert.equal(runtime.getSnapshot().phase,offset<3.5?'active':'collectible');
  }
  for(const radius of [0,6,NaN])assert.throws(()=>new RaceEventRuntime({pickupContactRadius:radius}));
  for(const lifetime of [0,601,Infinity])assert.throws(()=>new RaceEventRuntime().spawn({instanceId:'bad',creatorId:'a',seed:0,
    position:[0,0,0],spec:raceEventFixtures[0].spec,pickupLifetimeSeconds:lifetime}));
});
