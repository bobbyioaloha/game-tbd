import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SafetyDrillDesignSchema, SafetyDrillRecipeSchema, SafetyDrillSpecSchema, RaceEncounterSchema,
  compileSafetyDrill, encounterDurationSeconds, encounterInstruction, encounterLabel, SAFETY_DRILL_LIMITS,
} from './safety-drills.js';
import { safetyDrillFixtures, mockSafetyDrillForText } from './safety-drill-fixtures.js';
import { raceEventFixtures } from './race-event-fixtures.js';
import { RaceEventCreationSchema } from './race-events.js';
import { fixtures } from './fixtures.js';
import { GeneratedCreationSchema, PipelineEventSchema } from './pipeline.js';
import { VoiceEventSchema } from './voice.js';
import { RaceEventPipelineEventSchema, RaceEventVoiceEventSchema } from './race-event-pipeline.js';
import { SafetyDrillPipelineEventSchema, SafetyDrillVoiceEventSchema } from './safety-drill-pipeline.js';

const angry = safetyDrillFixtures[0];
test('safety fixtures validate and descriptions truthfully explain the compiled recipe', () => {
  for (const item of safetyDrillFixtures) {
    SafetyDrillDesignSchema.parse(item.design);
    SafetyDrillSpecSchema.parse(item.spec);
    assert.deepEqual(RaceEncounterSchema.parse(item.spec), item.spec);
    assert.equal(item.spec.description, encounterInstruction(item.spec));
    assert.equal(encounterDurationSeconds(item.spec), 10);
    assert.equal(compileSafetyDrill(item.spec.drill).maxActors, SAFETY_DRILL_LIMITS.maxActors);
    assert.ok(item.spec.description.length <= 160);
  }
  assert.deepEqual(safetyDrillFixtures[0].spec.appearance, safetyDrillFixtures[1].spec.appearance);
  assert.deepEqual(safetyDrillFixtures[0].spec.appearance, safetyDrillFixtures[2].spec.appearance);
  assert.notDeepEqual(safetyDrillFixtures[0].spec.drill, safetyDrillFixtures[1].spec.drill);
});
test('drill recipes reject arbitrary behavior, numerics, incompatible combinations and extra effects', () => {
  for (const invalid of [
    {...angry.spec.drill, reaction: 'teleport'}, {...angry.spec.drill, strength: 1},
    {...angry.spec.drill, durationSeconds: 100}, {...angry.spec.drill, target: 'opponents'},
    {...angry.spec.drill, code: 'movePlayer()'}, {...angry.spec.drill, formation: 'convoy'},
    {family: 'rapids', layout: 'winding', flow: 'steady', modifier: 'draft'},
    {family: 'rapids', layout: 'winding', flow: 'steady', modifier: 'none', reaction: 'charge'},
  ]) {
    assert.equal(SafetyDrillRecipeSchema.safeParse(invalid).success, false);
    assert.throws(() => compileSafetyDrill(invalid));
  }
  assert.equal(SafetyDrillSpecSchema.safeParse({...angry.spec, effect: raceEventFixtures[0].spec.effect}).success, false);
  assert.equal(SafetyDrillSpecSchema.safeParse({...angry.spec, appearance: {...angry.spec.appearance, collider: 100}}).success, false);
});
test('v3 remains v3, and v4 cannot be mistaken for the legacy event contract', () => {
  for (const item of raceEventFixtures) {
    assert.deepEqual(RaceEncounterSchema.parse(item.spec), RaceEventCreationSchema.parse(item.spec));
    assert.equal(encounterDurationSeconds(item.spec), item.spec.effect.durationSeconds);
    assert.equal(SafetyDrillSpecSchema.safeParse(item.spec).success, false);
  }
  assert.equal(RaceEventCreationSchema.safeParse(angry.spec).success, false);
  const complete = {type: 'complete', spec: angry.spec, elapsedMs: 10, metrics: []};
  SafetyDrillPipelineEventSchema.parse(complete);
  assert.equal(SafetyDrillPipelineEventSchema.safeParse({...complete, spec: raceEventFixtures[0].spec}).success, false);
  SafetyDrillVoiceEventSchema.parse({type: 'generation', event: complete});
});
test('free drill mocks vary behavior independently of appearance without an unknown-object fallback', () => {
  for (const item of safetyDrillFixtures) assert.deepEqual(mockSafetyDrillForText(item.prompt)?.spec, item.spec);
  const calm = mockSafetyDrillForText('sleepy hippos drifting together')!;
  const nervous = mockSafetyDrillForText('nervous hippos scatter when approached')!;
  assert.notDeepEqual(calm.spec.drill, nervous.spec.drill);
  assert.deepEqual(calm.spec.appearance, nervous.spec.appearance);
  const ducks = mockSafetyDrillForText('angry ducks charge when approached')!;
  assert.deepEqual(ducks.spec.drill, angry.spec.drill);
  assert.notDeepEqual(ducks.spec.appearance, angry.spec.appearance);
  const river = mockSafetyDrillForText('hippos in a pulsing river with eddies')!;
  assert.equal(river.spec.drill.family, 'rapids');
  assert.deepEqual(river.spec.appearance, angry.spec.appearance);
  assert.equal(mockSafetyDrillForText('nervous hippos charge when approached')?.spec.drill.family, 'stampede');
  const charging = mockSafetyDrillForText('jellyfish charge when approached')!.spec.drill;
  assert.ok(charging.family === 'stampede' && charging.reaction === 'charge');
  const drifting = mockSafetyDrillForText('angry hippos drift together')!.spec.drill;
  assert.ok(drifting.family === 'stampede' && drifting.reaction === 'steady');
  assert.equal(mockSafetyDrillForText('teleporting spaghetti bicycle'), undefined);
});

test('drill labels expose actual reaction and route differences instead of repeating a family title', () => {
  const hippos = safetyDrillFixtures.slice(0,3).map(item=>encounterLabel(item.spec));
  assert.equal(new Set(hippos).size,3,'charge, scatter and drafting convoy must have distinct labels');
  assert.match(hippos[0],/Charge/);assert.match(hippos[1],/Scatter/);assert.match(hippos[2],/Slipstream/);
  const ducks = mockSafetyDrillForText('angry ducks charge when approached')!;
  assert.equal(encounterLabel(ducks.spec),hippos[0],'the label describes behavior independently of appearance');
  assert.notEqual(encounterLabel(safetyDrillFixtures[3].spec),encounterLabel(safetyDrillFixtures[4].spec),'forked and pulsing routes must be distinguishable');
});

test('shared stream envelopes preserve all three API payload boundaries and strict fields', () => {
  const legacy = GeneratedCreationSchema.parse({...fixtures[0], version: 2,
    appearance: {type: 'primitives', ...fixtures[0].appearance}});
  const cases = [
    {spec: legacy, pipeline: PipelineEventSchema, voice: VoiceEventSchema},
    {spec: raceEventFixtures[0].spec, pipeline: RaceEventPipelineEventSchema, voice: RaceEventVoiceEventSchema},
    {spec: angry.spec, pipeline: SafetyDrillPipelineEventSchema, voice: SafetyDrillVoiceEventSchema},
  ];
  const result = {text: 'friendly vampire', metric: {model: 'fake-transcriber', durationMs: 1}};
  for (const target of cases) {
    for (const source of cases) {
      const expected = target === source;
      const event = {type: 'complete', spec: source.spec, elapsedMs: 1, metrics: []};
      assert.equal(target.pipeline.safeParse(event).success, expected);
      assert.equal(target.voice.safeParse({type: 'generation', event}).success, expected);
      assert.equal(target.voice.safeParse({type: 'complete', result, spec: source.spec, elapsedMs: 1}).success, expected);
    }
    assert.equal(target.pipeline.safeParse({type: 'stage', stage: 'design', elapsedMs: 0, code: 'execute()'}).success, false);
    assert.equal(target.voice.safeParse({type: 'transcript', result, audio: 'unexpected'}).success, false);
  }
});

test('five new drill families keep appearance separate, variant choices strict, and authored limits finite', () => {
  const newFixtures = safetyDrillFixtures.slice(6);
  assert.deepEqual(newFixtures.map(item => item.spec.drill.family), ['pinball', 'buddy', 'orbit', 'reconstruction', 'observation']);
  assert.equal(new Set(newFixtures.map(item => encounterLabel(item.spec))).size, 5);
  assert.equal(SAFETY_DRILL_LIMITS.maxTethers, 8);
  assert.equal(SAFETY_DRILL_LIMITS.maxOrbits, 4);
  assert.equal(SAFETY_DRILL_LIMITS.maxObservers, 8);
  for (const item of newFixtures) {
    assert.ok(item.prompt.split(/\s+/u).length <= 10);
    const compiled = compileSafetyDrill(item.spec.drill);
    for (const [key, value] of Object.entries(compiled)) {
      if (key !== 'recipe') assert.ok(typeof value === 'number' && Number.isFinite(value) && value > 0);
    }
    for (const extra of [{target: 'opponents'}, {strength: 100}, {durationSeconds: 100}, {code: 'launch()'}, {modifier: 'draft'}]) {
      assert.equal(SafetyDrillRecipeSchema.safeParse({...item.spec.drill, ...extra}).success, false);
    }
    assert.equal(SafetyDrillSpecSchema.safeParse({...item.spec, appearance: {...item.spec.appearance, collider: 50}}).success, false);
  }
});

test('free new-family mock traits and explicit behaviors select the intended mechanics and variants', () => {
  const cases = [
    ['springy avocado', {family: 'pinball', layout: 'staggered', bounce: 'springy'}],
    ['angry avocado', {family: 'pinball', layout: 'staggered', bounce: 'springy'}],
    ['nervous avocado', {family: 'pinball', layout: 'staggered', bounce: 'springy'}],
    ['avocado ricochets through a narrow funnel', {family: 'pinball', layout: 'funnel', bounce: 'ricochet'}],
    ['clingy stapler', {family: 'buddy', pairing: 'nearest', tether: 'elastic'}],
    ['stapler tethers distant buddies in pulses', {family: 'buddy', pairing: 'crossfield', tether: 'pulsing'}],
    ['gentle planet', {family: 'orbit', direction: 'clockwise', pull: 'gentle'}],
    ['clingy planet', {family: 'orbit', direction: 'clockwise', pull: 'clingy'}],
    ['hippos orbit counterclockwise with clingy gravity', {family: 'orbit', direction: 'counterclockwise', pull: 'clingy'}],
    ['haunted photocopier', {family: 'reconstruction', pattern: 'trail', cadence: 'steady'}],
    ['ducks replay mirrored paths in bursts', {family: 'reconstruction', pattern: 'mirror', cadence: 'bursts'}],
    ['watchful goose', {family: 'observation', scan: 'sweep', temperament: 'strict'}],
    ['friendly goose', {family: 'observation', scan: 'sweep', temperament: 'patient'}],
    ['patient avocado inspects everyone with alternating scans', {family: 'observation', scan: 'alternating', temperament: 'patient'}],
  ] as const;
  for (const [prompt, expected] of cases) {
    const result = mockSafetyDrillForText(prompt);
    assert.ok(result, prompt);
    assert.deepEqual(result.spec.drill, expected, prompt);
    SafetyDrillSpecSchema.parse(result.spec);
  }
  const charging = mockSafetyDrillForText('bouncy avocado charges when approached')!;
  assert.equal(charging.spec.drill.family, 'stampede', 'an explicit charge beats inferred bounciness');
  assert.deepEqual(charging.spec.appearance, safetyDrillFixtures[6].spec.appearance);
  const river = mockSafetyDrillForText('suspicious goose in pulsing rapids')!;
  assert.equal(river.spec.drill.family, 'rapids', 'explicit currents beat inferred inspection');
  const bouncing = mockSafetyDrillForText('clingy stapler bounces between racers')!;
  assert.equal(bouncing.spec.drill.family, 'pinball', 'an explicit bounce beats inferred tethering');
  const tethered = mockSafetyDrillForText('clingy planet tethers everyone')!;
  assert.equal(tethered.spec.drill.family, 'buddy', 'explicit tethering beats a planet association');
  assert.equal(mockSafetyDrillForText('bouncing unknown bicycle'), undefined, 'unknown geometry never becomes a known fixture');
});
