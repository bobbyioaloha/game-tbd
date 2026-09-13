import test from 'node:test';
import assert from 'node:assert/strict';
import { RACE_EVENT_LIMITS, SAFETY_DRILL_LIMITS, type EventRacer, type EventVector, type RacerSegment } from '@sky/shared';
import { PinballDrill } from './pinball-drill';
import { OrbitDrill } from './orbit-drill';
import { add, length, subtract } from './math';
import { FreefallController } from '../game/freefall-controller';

const racer=(id:string,position:EventVector=[0,0,0],velocity:EventVector=[0,-30,0]):EventRacer=>({id,position,velocity,finished:false});
const pinball=(bounce:'springy'|'ricochet'='springy',racers=[racer('creator')],layout:'staggered'|'funnel'='staggered')=>
  new PinballDrill({family:'pinball',layout,bounce},42,racers);
const orbit=(pull:'gentle'|'clingy'='gentle',direction:'clockwise'|'counterclockwise'='clockwise',racers=[racer('creator')])=>
  new OrbitDrill({family:'orbit',direction,pull},42,racers);
const crossing=(id:string,position:EventVector):RacerSegment=>({id,from:add(position,[0,15,0]),to:add(position,[0,-15,0])});

test('pinball has frozen seeded shared bumpers, distinct layouts, and bounded actor counts',()=>{
  const racers=Array.from({length:8},(_,index)=>racer(String(index),[0,-index*300,0]));
  const a=pinball('springy',racers),b=pinball('springy',[...racers].reverse());
  assert.equal(a.getSnapshot().actors.length,SAFETY_DRILL_LIMITS.maxActors);
  assert.deepEqual(a.getSnapshot(),b.getSnapshot());
  assert.notDeepEqual(a.getSnapshot().actors.map(actor=>actor.position),pinball('springy',racers,'funnel').getSnapshot().actors.map(actor=>actor.position));
  const positions=a.getSnapshot().actors.map(actor=>actor.position);
  a.prepareStep(2,1/120,[racer('new',[900,-9000,900])]);
  assert.deepEqual(a.getSnapshot().actors.map(actor=>actor.position),positions);
});

test('pinball uses swept entry normals, preserves protected racers, and excludes post-finish contacts',()=>{
  const runtime=pinball(),body=runtime.getSnapshot().actors[0];
  const racers=[racer('creator',body.position),{...racer('protected',body.position),protected:true},
    racer('after-finish',body.position),{...racer('finished',body.position),finished:true}];
  const segments=racers.map(racer=>({...crossing(racer.id,body.position),...(racer.id==='after-finish'?{endFraction:0.1}:{})}));
  runtime.prepareStep(0.9,1/120,racers);
  assert.equal(runtime.resolveContacts(segments,racers).size,0,'warning bodies are harmless');
  runtime.prepareStep(1,1/120,racers);
  const kicks=runtime.resolveContacts(segments,racers);
  assert.ok(kicks.get('creator')![1]>0,'a tunneled top entry rebounds upward, not toward its end point');
  assert.deepEqual(kicks.get('creator'),kicks.get('protected'));
  assert.equal(kicks.has('after-finish'),false);assert.equal(kicks.has('finished'),false);
  assert.equal(runtime.getImpact().bounces?.creator,1);
  assert.deepEqual(runtime.getImpact().collisions,{},'a bumper is not an equipment safety violation');
  assert.deepEqual(runtime.getImpact().blockedCollisions,{});
  for(const kick of kicks.values())assert.ok(length(kick)<=RACE_EVENT_LIMITS.maxVelocityDelta);
});

test('pinball allows deliberate later rebounds without repeated overlap impulses',()=>{
  const runtime=pinball(),body=runtime.getSnapshot().actors[0],r=racer('creator',body.position);
  runtime.prepareStep(1,1/120,[r]);
  const segment=crossing(r.id,body.position);
  assert.ok(runtime.resolveContacts([segment],[r]).has(r.id));
  assert.equal(runtime.resolveContacts([segment],[r]).size,0,'the same tick cannot double-bounce');
  runtime.prepareStep(2,1/120,[r]);
  assert.equal(runtime.resolveContacts([{id:r.id,from:body.position,to:body.position}],[r]).size,0,'waiting inside is not another contact');
  assert.ok(runtime.resolveContacts([segment],[r]).has(r.id),'leaving and returning permits another bounce');
  assert.equal(runtime.getImpact().bounces?.creator,2);
  runtime.prepareStep(3,1/120,[r]);
  const outward={...r,velocity:[0,30,0] as EventVector};
  assert.equal(runtime.resolveContacts([{id:r.id,from:add(body.position,[0,1,0]),to:add(body.position,[0,15,0])}],[outward]).size,0);
});

test('springy and ricochet rebounds produce different bounded outgoing velocities at normal fall speed',()=>{
  const results=(['springy','ricochet'] as const).map(bounce=>{
    const runtime=pinball(bounce),body=runtime.getSnapshot().actors[0],r=racer('r',body.position);
    runtime.prepareStep(1,1/120,[r]);
    const kick=runtime.resolveContacts([crossing(r.id,body.position)],[r]).get(r.id)!;
    assert.ok(add(r.velocity,kick)[1]>0,'both settings rebound away from the top surface');
    return kick;
  });
  assert.ok(results[0][1]>results[1][1]);
});

test('orbit bands share exact finite field bounds and never follow or multiply around participants',()=>{
  const racers=Array.from({length:8},(_,index)=>racer(String(index),[0,-index*300,0]));
  const runtime=orbit('gentle','clockwise',racers),snapshot=runtime.getSnapshot();
  assert.equal(snapshot.orbits?.length,SAFETY_DRILL_LIMITS.maxOrbits);
  assert.deepEqual(snapshot,orbit('gentle','clockwise',[...racers].reverse()).getSnapshot());
  const field=snapshot.orbits![0];
  const inside=racer('inside',add(field.position,[field.radius-0.01,0,0]));
  const outside=racer('outside',add(field.position,[field.radius+0.01,0,0]));
  const above=racer('above',add(field.position,[0,field.height/2+0.01,0]));
  const inputs=runtime.prepareStep(1,1/120,[inside,outside,above]);
  assert.ok(length(inputs.inside.acceleration)>0);
  assert.deepEqual(inputs.outside.acceleration,[0,0,0]);assert.deepEqual(inputs.above.acceleration,[0,0,0]);
  assert.deepEqual(runtime.getSnapshot().orbits!.map(({active,...field})=>field),snapshot.orbits!.map(({active,...field})=>field));
});

test('orbit direction mirrors its tangent, pull changes its force, and descent stays under gameplay control',()=>{
  const runtimes=[orbit(),orbit('gentle','counterclockwise'),orbit('clingy')];
  const field=runtimes[0].getSnapshot().orbits![0];
  const r=racer('creator',add(field.position,[15,0,0]),[0,-30,0]);
  const [clockwise,counterclockwise,clingy]=runtimes.map(runtime=>runtime.prepareStep(1,1/120,[r]).creator.acceleration);
  assert.equal(clockwise[0],counterclockwise[0]);assert.equal(clockwise[2],-counterclockwise[2]);
  assert.notDeepEqual(clockwise,clingy);
  for(const force of [clockwise,counterclockwise,clingy]) {
    assert.equal(force[1],0,'orbiting does not suspend or teleport the falling racer');
    assert.ok(length(force)<=RACE_EVENT_LIMITS.maxAcceleration);
  }
  const center=orbit(),centerField=center.getSnapshot().orbits![0];
  const centerInput=center.prepareStep(1,1/120,[racer('r',centerField.position)]).r;
  assert.ok(centerInput.acceleration.every(Number.isFinite),'the exact field center has no singularity');
});

test('orbit releases once when leaving its visible bounds, then cannot recapture at that anchor',()=>{
  const runtime=orbit(),field=runtime.getSnapshot().orbits![0];
  const inside=racer('creator',add(field.position,[10,0,0]));
  assert.deepEqual(runtime.prepareStep(0.9,1/120,[inside]).creator.acceleration,[0,0,0]);
  runtime.prepareStep(1,1/120,[inside]);
  const outside=racer('creator',add(field.position,[field.radius+1,0,0]));
  const release=runtime.prepareStep(1.1,1/120,[outside]).creator;
  assert.ok(release.velocityDelta[2]>0);assert.ok(release.velocityDelta[1]<0);
  assert.ok(length(release.velocityDelta)<=RACE_EVENT_LIMITS.maxVelocityDelta);
  assert.deepEqual(release.acceleration,[0,0,0]);
  const repeated=runtime.prepareStep(1.2,1/120,[inside]).creator;
  assert.deepEqual(repeated.acceleration,[0,0,0]);assert.deepEqual(repeated.velocityDelta,[0,0,0]);
  assert.equal(runtime.getImpact().orbitReleases?.creator,1);
  assert.equal(runtime.getImpact().orbitSeconds?.creator,1/120);
  const fresh=orbit();
  assert.ok(length(fresh.prepareStep(1,1/120,[inside]).creator.acceleration)>0,'a new encounter has no old capture state');
});

test('orbit has a bounded automatic exit and ignores finished racers or zero-time ticks',()=>{
  for(const pull of ['gentle','clingy'] as const) {
    const runtime=orbit(pull),field=runtime.getSnapshot().orbits![0];
    const r=racer('r',add(field.position,[10,0,0]));
    runtime.prepareStep(1,1/120,[r]);
    const releaseAt=pull==='clingy'?4:3;
    assert.deepEqual(runtime.prepareStep(releaseAt-0.01,1/120,[r]).r.velocityDelta,[0,0,0]);
    assert.ok(length(runtime.prepareStep(releaseAt,1/120,[r]).r.velocityDelta)>0);
    assert.deepEqual(runtime.prepareStep(releaseAt+0.01,1/120,[r]).r.velocityDelta,[0,0,0]);
  }
  const runtime=orbit(),field=runtime.getSnapshot().orbits![0],r=racer('r',field.position);
  assert.deepEqual(runtime.prepareStep(1,0,[r]).r.acceleration,[0,0,0]);
  runtime.prepareStep(1,1/120,[r]);
  const finished={...r,finished:true,position:add(field.position,[100,0,0])};
  assert.deepEqual(runtime.prepareStep(1.1,1/120,[finished]).r.velocityDelta,[0,0,0]);
  assert.equal(runtime.getImpact().orbitReleases?.r,undefined);
});

test('ordinary steering escapes a clingy orbit while real falling motion continues',()=>{
  const runtime=orbit('clingy'),field=runtime.getSnapshot().orbits![0];
  const start=add(field.position,[14,70,0]);
  const controller=new FreefallController(36,start[0],start[2]);
  controller.setFallSpeed(30);
  // The controller's fixed Y origin is translated only for the test's event view.
  let releasedAt:number|undefined;
  for(let tick=0;tick<300;tick++) {
    const actual=controller.getSnapshot();
    const position=add(actual.position,[0,start[1],0]);
    const r=racer('creator',position,controller.getWorldVelocity());
    const input=runtime.prepareStep(1+tick/120,1/120,[r]).creator;
    if(length(input.velocityDelta)>0){releasedAt=tick/120;break;}
    const offset=subtract(position,field.position);
    const horizontal=Math.hypot(offset[0],offset[2]);
    controller.step(1/120,{x:offset[0]/horizontal,z:offset[2]/horizontal},{fallSpeedMultiplier:1,eventInput:input});
  }
  assert.ok(releasedAt!==undefined&&releasedAt<3,'steering can exit before the automatic safety release');
  assert.ok(controller.getSnapshot().position[1]<-5,'the orbit never stops normal descent');
});
