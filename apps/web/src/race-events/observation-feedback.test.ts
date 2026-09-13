import test from 'node:test';
import assert from 'node:assert/strict';
import { SAFETY_DRILL_LIMITS, safetyDrillFixtures, type DrillObserver, type EventRacer,
  type EventVector, type RacerSegment } from '@sky/shared';
import { ObservationDrill, OBSERVATION_LIMITS } from './observation-drill';
import { RaceEventRuntime } from './runtime';
import { add, scale } from './math';

const recipe={family:'observation',scan:'alternating',temperament:'strict'} as const;
const racer=(id='watched',position:EventVector=[0,0,0],velocity:EventVector=[6,-30,0]):EventRacer=>
  ({id,position,velocity,finished:false});
const makeDrill=(racers=[racer()])=>new ObservationDrill(recipe,1,racers);
const inCone=(observer:DrillObserver,distance=25)=>add(observer.position,scale(observer.direction,distance));
const stationary=(racers:readonly EventRacer[])=>racers.map(racer=>({id:racer.id,from:racer.position,to:racer.position}));
const feedback=(drill:ObservationDrill,id='watched')=>drill.getSnapshot().observations![id];
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-9,actual+' should equal '+expected);
function observerAt(drill:ObservationDrill,age:number) {
  drill.prepareStep(age,1/120,[]);
  return drill.getSnapshot().observers![0];
}
function step(drill:ObservationDrill,age:number,dt:number,racers:readonly EventRacer[],segments:readonly RacerSegment[]=stationary(racers)) {
  drill.prepareStep(age,dt,racers);
  return drill.resolveContacts(segments,racers);
}

test('inspection feedback is available at activation and harmless warnings use local finite cone coverage',()=>{
  const drill=makeDrill([racer(),{...racer('finished'),finished:true}]);
  assert.deepEqual(Object.keys(drill.getSnapshot().observations!),['watched']);
  assert.equal(feedback(drill).exposureFraction,0);
  assert.equal(feedback(drill).cooldownSeconds,0);
  const observer=observerAt(drill,0.5),inside=inCone(observer);
  const racers=[{...racer('watched',inside),protected:true},
    racer('behind',inCone(observer,-1)),racer('beyond',inCone(observer,observer.range+1)),
    racer('beside',add(inside,[0,0,100]))];
  assert.equal(step(drill,0.5,1/30,racers).size,0);
  assert.deepEqual(feedback(drill),{
    watching:false,warning:true,moving:true,exposureFraction:0,cooldownSeconds:0,protected:true,penaltyBlocked:false,
  });
  for(const id of ['behind','beyond','beside']) {
    assert.equal(feedback(drill,id).warning,false);
    assert.equal(feedback(drill,id).watching,false);
  }
  assert.deepEqual(drill.getImpact().observationFlags,{});
});

test('inspection feedback distinguishes watching, rest, and the harmless turn warning at the current cone',()=>{
  const phases=[
    {age:1.1,watching:true,warning:false},
    {age:SAFETY_DRILL_LIMITS.warningSeconds+OBSERVATION_LIMITS.strictWatch+0.1,watching:false,warning:false},
    {age:SAFETY_DRILL_LIMITS.warningSeconds+OBSERVATION_LIMITS.strictWatch+OBSERVATION_LIMITS.strictRest-0.1,watching:false,warning:true},
  ];
  for(const phase of phases) {
    const drill=makeDrill(),observer=observerAt(drill,phase.age);
    step(drill,phase.age,1/120,[racer('watched',inCone(observer),[0,-70,0])]);
    assert.equal(feedback(drill).watching,phase.watching);
    assert.equal(feedback(drill).warning,phase.warning);
    assert.equal(feedback(drill).moving,false);
    assert.equal(feedback(drill).exposureFraction,0);
  }
});

test('inspection feedback identifies actual lateral drift and preserves the strict threshold boundary',()=>{
  const drill=makeDrill(),inside=inCone(observerAt(drill,1));
  const racers=[racer('straight',inside,[0,-100,0]),racer('boundary',inside,[OBSERVATION_LIMITS.strictThreshold,-100,0]),
    racer('diagonal-drift',inside,[OBSERVATION_LIMITS.strictThreshold,-100,0.1]),racer('depth-drift',inside,[0,-100,3])];
  step(drill,1,1/120,racers);
  for(const id of ['straight','boundary']) {
    assert.equal(feedback(drill,id).watching,true);
    assert.equal(feedback(drill,id).moving,false);
    assert.equal(feedback(drill,id).exposureFraction,0);
  }
  for(const id of ['diagonal-drift','depth-drift']) {
    assert.equal(feedback(drill,id).moving,true);
    close(feedback(drill,id).exposureFraction,(1/120)/OBSERVATION_LIMITS.strictGrace);
  }
});

test('inspection feedback reports accumulated grace and clears it after steady movement, leaving, or rest',()=>{
  for(const interruption of ['steady','outside','rest'] as const) {
    const drill=makeDrill(),inside=inCone(observerAt(drill,1));
    step(drill,1,0.03,[racer('watched',inside)]);
    close(feedback(drill).exposureFraction,0.25);
    step(drill,1.03,0.03,[racer('watched',inside)]);
    close(feedback(drill).exposureFraction,0.5);
    const age=interruption==='rest'?2.6:1.06;
    const position=interruption==='outside'?add(inside,[0,0,100]):inside;
    step(drill,age,0.03,[racer('watched',position,interruption==='steady'?[0,-30,0]:[6,-30,0])]);
    assert.equal(feedback(drill).exposureFraction,0);
    assert.equal(feedback(drill).cooldownSeconds,0);
    assert.equal(feedback(drill).watching,interruption==='steady');
  }
});

test('inspection coverage follows the swept endpoint while its meter retains only actual exposed time',()=>{
  const drill=makeDrill(),observer=observerAt(drill,1);
  const from=inCone(observer,1),to=inCone(observer,-9),watched=racer('watched',from);
  const segment:RacerSegment={id:'watched',from,to};
  step(drill,1,0.03,[watched],[segment]);
  assert.equal(feedback(drill).watching,false,'crossing out no longer claims the racer is watched');
  close(feedback(drill).exposureFraction,0.003/OBSERVATION_LIMITS.strictGrace);
  step(drill,1.03,0.03,[racer('watched',to)]);
  assert.equal(feedback(drill).exposureFraction,0);
  step(drill,1.06,0.03,[racer('watched',to)],[{id:'watched',from:to,to:from}]);
  assert.equal(feedback(drill).watching,true,'crossing in updates local coverage before the next tick');
  close(feedback(drill).exposureFraction,0.003/OBSERVATION_LIMITS.strictGrace);
});

test('inspection feedback retains the actual blocked or delivered outcome throughout its cooldown',()=>{
  for(const protectedAtPenalty of [false,true]) {
    const drill=makeDrill(),inside=inCone(observerAt(drill,1));
    const watched={...racer('watched',inside),protected:protectedAtPenalty};
    let kicks=0;
    for(let tick=0;tick<4;tick++)kicks+=step(drill,1+tick*0.03,0.03,[watched]).size;
    assert.equal(kicks,protectedAtPenalty?0:1);
    assert.equal(feedback(drill).penaltyBlocked,protectedAtPenalty);
    assert.equal(feedback(drill).protected,protectedAtPenalty);
    assert.equal(feedback(drill).exposureFraction,0);
    close(feedback(drill).cooldownSeconds,OBSERVATION_LIMITS.cooldownSeconds);
    step(drill,1.29,0.03,[{...watched,protected:!protectedAtPenalty}]);
    assert.equal(feedback(drill).protected,!protectedAtPenalty,'protection reports the current supplied state');
    assert.equal(feedback(drill).penaltyBlocked,protectedAtPenalty,'the penalty outcome cannot change with later protection');
    close(feedback(drill).cooldownSeconds,1.3);
    assert.equal(feedback(drill).exposureFraction,0);
    step(drill,2.6,0.03,[{...watched,protected:false}]);
    assert.equal(feedback(drill).cooldownSeconds,0);
    assert.equal(feedback(drill).penaltyBlocked,false);
  }
});

test('finished, finish-clipped, absent, and expired racers leave no stale inspection feedback',()=>{
  const drill=makeDrill(),inside=inCone(observerAt(drill,1)),watched=racer('watched',inside);
  step(drill,1,0.03,[watched]);
  assert.ok(feedback(drill).exposureFraction>0);
  step(drill,1.03,0.03,[watched],[{id:'watched',from:inside,to:inside,endFraction:0.5}]);
  assert.deepEqual(drill.getSnapshot().observations,{});
  step(drill,1.06,0.03,[{...watched,finished:true}]);
  assert.deepEqual(drill.getSnapshot().observations,{});
  step(drill,1.09,0.03,[watched]);
  close(feedback(drill).exposureFraction,0.25);
  step(drill,1.12,0.03,[]);
  assert.deepEqual(drill.getSnapshot().observations,{});
  step(drill,SAFETY_DRILL_LIMITS.durationSeconds,0.03,[watched]);
  assert.deepEqual(drill.getSnapshot().observations,{});
});

test('inspection feedback snapshots are independent copies and later ticks do not mutate earlier feedback',()=>{
  const drill=makeDrill(),inside=inCone(observerAt(drill,1)),watched=racer('watched',inside);
  step(drill,1,0.03,[watched]);
  const previous=drill.getSnapshot().observations!,saved={...previous.watched};
  previous.watched.exposureFraction=1;
  previous.watched.penaltyBlocked=true;
  close(feedback(drill).exposureFraction,0.25);
  assert.equal(feedback(drill).penaltyBlocked,false);
  step(drill,1.03,0.03,[{...watched,velocity:[0,-30,0]}]);
  assert.equal(feedback(drill).moving,false);
  assert.equal(previous.watched.moving,saved.moving);
  assert.notEqual(drill.getSnapshot().observations,previous);
});

test('race reset, encounter expiry, and new activation discard inspection feedback and penalty cooldowns',()=>{
  const fixture=safetyDrillFixtures.find(fixture=>fixture.spec.drill.family==='observation');
  assert.ok(fixture);
  const runtime=new RaceEventRuntime();
  const activate=(instanceId:string)=>{
    runtime.spawn({instanceId,creatorId:'watched',seed:1,position:[0,0,0],spec:{...fixture.spec,drill:recipe}});
    const racers=[racer()];
    runtime.prepareStep(1/120,racers);runtime.resolveContacts(stationary(racers));
    assert.equal(runtime.getSnapshot().phase,'active');
    assert.equal(runtime.getSnapshot().drill!.observations!.watched.cooldownSeconds,0);
    assert.equal(runtime.getSnapshot().drill!.observations!.watched.exposureFraction,0);
  };
  const tick=(watched:EventRacer)=>{
    runtime.prepareStep(1/30,[watched]);runtime.resolveContacts(stationary([watched]));
  };
  activate('first');
  let inside=inCone(runtime.getSnapshot().drill!.observers![0]);
  for(let count=0;count<40;count++)tick(racer('watched',inside));
  assert.ok(runtime.getSnapshot().drill!.observations!.watched.cooldownSeconds>0);
  runtime.reset();
  assert.equal(runtime.getSnapshot().drill,undefined);
  activate('second');
  inside=inCone(runtime.getSnapshot().drill!.observers![0]);
  for(let count=0;count<301;count++)tick(racer('watched',inside));
  assert.equal(runtime.getSnapshot().phase,'expired');
  assert.equal(runtime.getSnapshot().drill,undefined);
  activate('third');
});
