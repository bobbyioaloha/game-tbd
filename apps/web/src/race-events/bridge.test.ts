import test from 'node:test';
import assert from 'node:assert/strict';
import { raceEventFixtures, type EventRacer } from '@sky/shared';
import { RaceEventRuntime } from './runtime';
import { RaceEventBridge } from './bridge';
import { EventSandboxModel } from './sandbox-model';
test('bridge spawns ahead using latest downward velocity and captures segments before host mutation',()=>{
  const events=new RaceEventRuntime(),bridge=new RaceEventBridge(events);
  const racers:EventRacer[]=[{id:'creator',position:[2,100,0],velocity:[0,-20,0],finished:false},
    {id:'rival',position:[2,45,0],velocity:[0,-20,0],finished:false}];
  bridge.spawnAhead(raceEventFixtures[0].spec,racers[0],'one',7);
  assert.deepEqual(events.getSnapshot().position,[2,40,0]);
  bridge.beforeStep(1/120,racers);racers[1].position=[2,35,0];bridge.afterStep(racers);
  assert.equal(events.getSnapshot().triggererId,'rival');
  bridge.reset();assert.equal(events.getSnapshot().phase,'empty');
});
test('every sandbox fixture activates through real collision checks and expires',()=>{
  for(const fixture of raceEventFixtures) {
    const model=new EventSandboxModel(fixture.spec,'rival-b',7);
    for(let i=0;i<120;i++)model.step(1/120);
    assert.equal(model.events.getSnapshot().triggererId,'rival-b');
    for(let i=0;i<1100;i++)model.step(1/120);
    assert.equal(model.events.getSnapshot().phase,'expired');
    for(const racer of model.racers)assert.ok([...racer.position,...racer.velocity].every(Number.isFinite));
  }
});

test('explicit movement excludes teleport knockback and contacts after finish',()=>{
  const events=new RaceEventRuntime(),bridge=new RaceEventBridge(events);
  const racer:EventRacer={id:'a',position:[0,5,0],velocity:[0,-30,0],finished:false};
  const spawn=()=>events.spawn({instanceId:'contact',creatorId:'a',position:[0,0,0],seed:1,spec:raceEventFixtures[0].spec});
  spawn();bridge.beforeStep(1/120,[racer]);
  // Final position is inside only because an obstacle displaced the racer.
  bridge.afterStep([{...racer,position:[0,0,0]}],[{id:'a',from:[5,5,0],to:[5,-5,0]}]);
  assert.equal(events.getSnapshot().phase,'collectible');
  bridge.reset();spawn();bridge.beforeStep(1/120,[racer]);
  bridge.afterStep([{...racer,finished:true}],[{id:'a',from:[0,5,0],to:[0,-5,0],endFraction:0.2}]);
  assert.equal(events.getSnapshot().phase,'collectible');
  bridge.reset();spawn();bridge.beforeStep(1/120,[racer]);
  bridge.afterStep([{...racer,finished:true}],[{id:'a',from:[0,5,0],to:[0,-5,0],endFraction:0.7}]);
  assert.equal(events.getSnapshot().triggererId,'a');
});
