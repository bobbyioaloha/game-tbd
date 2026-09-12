import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceEventCreationSchema, raceEventPreset } from './race-events.js';
import { raceEventFixtures } from './race-event-fixtures.js';
import { CreationSpecSchema } from './creation.js';
import { createNoopRaceEvents } from './race-event-protocol.js';

test('four v3 fixtures validate and cannot be mistaken for legacy creations',()=>{
  assert.equal(raceEventFixtures.length,4);
  for(const fixture of raceEventFixtures) {
    assert.ok(RaceEventCreationSchema.safeParse(fixture.spec).success);
    assert.equal(CreationSpecSchema.safeParse(fixture.spec).success,false);
  }
});
test('event schemas reject unknown behaviour, invalid numbers, extra effects and mesh-owned collision',()=>{
  const spec=raceEventFixtures[0].spec;
  for(const bad of [{...spec,effect:{type:'execute',code:'hello'}},{...spec,effects:[spec.effect]},
    {...spec,effect:{...spec.effect,durationSeconds:Infinity}}, {...spec,effect:{...spec.effect,acceleration:-1}},
    {...spec,appearance:{...spec.appearance,collider:20}}, {...spec,effect:{...spec.effect,target:'creator'}}]) {
    assert.equal(RaceEventCreationSchema.safeParse(bad).success,false);
  }
  const debris=raceEventFixtures[1].spec;
  assert.equal(RaceEventCreationSchema.safeParse({...debris,effect:{...debris.effect,collidableCount:21}}).success,false);
});
test('preset consumers cannot mutate shared balance and a noop adapter needs no game',()=>{
  const preset=raceEventPreset('gravityWell');preset.effect.durationSeconds=1;
  assert.equal(raceEventPreset('gravityWell').effect.durationSeconds,6);
  const port=createNoopRaceEvents();assert.deepEqual(port.prepareStep(1/120,[]),{});port.resolveContacts([]);port.reset();
  assert.equal(port.getSnapshot().phase,'empty');
});
