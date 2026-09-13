import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safetyDrillFixtures, raceEventFixtures, type SafetyDrillRecipe } from '@sky/shared';
import { EventSandboxModel, SANDBOX_RACERS } from './sandbox-model';
import { length } from './math';

const dt=1/120;
const fixture=(family:SafetyDrillRecipe['family'])=>{
  const fixture=safetyDrillFixtures.find(fixture=>fixture.spec.drill.family===family);
  assert.ok(fixture);return fixture.spec;
};

test('free buddy examples demonstrate real tether tension while preserving deterministic pickup and replay',()=>{
  for(const triggerer of SANDBOX_RACERS) {
    const first=new EventSandboxModel(fixture('buddy'),triggerer.id,42);
    const replay=new EventSandboxModel(fixture('buddy'),triggerer.id,42);
    let maximumTension=0,forceTicks=0;
    for(let tick=0;tick<1200;tick++) {
      first.step(dt);replay.step(dt);
      const snapshot=first.events.getSnapshot();
      for(const tether of snapshot.drill?.tethers??[])maximumTension=Math.max(maximumTension,tether.tension);
      if(Object.values(first.inputs).some(input=>length(input.acceleration)>0))forceTicks++;
    }
    const snapshot=first.events.getSnapshot();
    assert.equal(snapshot.triggererId,triggerer.id);
    assert.ok(maximumTension>0.1,'the selected demonstration must stretch a visible tether');
    assert.ok(forceTicks>60,'event forces must actually oppose the scripted steering');
    assert.ok(Object.values(snapshot.impact!.drill!.tetherSeconds!).some(seconds=>seconds>1));
    assert.deepEqual(first.racers,replay.racers);assert.deepEqual(snapshot,replay.events.getSnapshot());
  }
});

test('free observation examples compare straight descent with lateral movement and actual inspection penalties',()=>{
  for(const triggerer of SANDBOX_RACERS) {
    const model=new EventSandboxModel(fixture('observation'),triggerer.id,42);
    let watchedMovingTicks=0;
    for(let tick=0;tick<1200;tick++) {
      model.step(dt);
      const watching=model.events.getSnapshot().drill?.observers?.some(observer=>observer.watching);
      if(watching&&model.racers.some(racer=>racer.id!=='creator'&&Math.abs(racer.velocity[0])>3))watchedMovingTicks++;
    }
    const snapshot=model.events.getSnapshot(),flags=snapshot.impact!.drill!.observationFlags!;
    assert.equal(snapshot.triggererId,triggerer.id);
    assert.equal(flags.creator,undefined,'straight descent remains permitted');
    assert.ok(Object.values(flags).some(count=>count>0),'a lane-changing rival must visibly receive an inspection penalty');
    assert.ok(watchedMovingTicks>60);
    assert.ok(Object.values(model.impulseCounts).some(count=>count>0),'the demonstration must consume the event penalty');
  }
});

test('scripted motion preserves the existing straight lab approach for legacy events and other drill families',()=>{
  const v3=raceEventFixtures[0].spec;
  for(const spec of [v3,fixture('stampede'),fixture('rapids'),fixture('pinball'),fixture('orbit'),fixture('reconstruction')]) {
    const model=new EventSandboxModel(spec,'rival-b',42);
    const initial=model.racers.map(racer=>({position:[...racer.position],velocity:[...racer.velocity]}));
    for(let tick=0;tick<12;tick++)model.step(dt);
    for(let index=0;index<model.racers.length;index++) {
      const racer=model.racers[index],start=initial[index];
      assert.deepEqual(racer.velocity,start.velocity);
      assert.equal(racer.position[0],start.position[0]);assert.equal(racer.position[2],start.position[2]);
      assert.ok(Math.abs(racer.position[1]-(start.position[1]+start.velocity[1]*0.1))<1e-8);
    }
  }
});
