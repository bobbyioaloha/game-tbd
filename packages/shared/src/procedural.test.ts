import test from 'node:test';
import assert from 'node:assert/strict';
import { proceduralFixtures, generationEvaluationPrompts, mockProceduralForText } from './procedural-fixtures.js';
import { appearanceToRecipe, recipeToAppearance, PrimitiveRecipeWireSchema } from './procedural.js';
import { CreationSpecSchema, MeshAppearanceSchema } from './creation.js';
import { GeneratedCreationSchema, PipelineEventSchema, PipelineRequestSchema } from './pipeline.js';

test('procedural fixtures round-trip and cover the three supported effects', () => {
  assert.deepEqual(new Set(proceduralFixtures.map(fixture => fixture.spec.effects[0].type)),
    new Set(['reduceFallSpeed', 'clearNearbyObstacles', 'invulnerability']));
  for (const fixture of proceduralFixtures) {
    assert.deepEqual(recipeToAppearance(appearanceToRecipe(fixture.appearance)), fixture.appearance);
    assert.ok(CreationSpecSchema.safeParse(fixture.spec).success);
    assert.ok(PipelineEventSchema.safeParse({type: 'complete', spec: fixture.spec, elapsedMs: 1, metrics: []}).success);
    assert.equal(GeneratedCreationSchema.safeParse({...fixture.spec, effects: []}).success, false);
    assert.equal(GeneratedCreationSchema.safeParse({...fixture.spec, effects: [fixture.spec.effects[0], fixture.spec.effects[0]]}).success, false);
  }
});
test('recipe rejects unsupported geometry, transforms, counts, colliders and effects', () => {
  const recipe = appearanceToRecipe(proceduralFixtures[0].appearance), part = recipe.parts[0];
  const invalid = [
    {parts: []}, {parts: Array(25).fill(part)},
    {parts: [{...part, type: 'torus'}]}, {parts: [{...part, color: 'yellow'}]},
    {parts: [{...part, scale: {x: 0, y: 1, z: 1}}]},
    {parts: [{...part, rotation: {x: 0, y: 4, z: 0}}]},
    {parts: [{...part, position: {x: Infinity, y: 0, z: 0}}]},
    {parts: [{...part, position: {x: 0, y: 0, z: 4}}]},
    {parts: [{...part, segments: 10000}]},
    {...recipe, effect: {type: 'invulnerability', durationSeconds: 5}},
    {...recipe, collider: {radius: 100}}, {...recipe, code: 'alert(1)'},
  ];
  for (const value of invalid) {
    assert.equal(PrimitiveRecipeWireSchema.safeParse(value).success, false);
    assert.throws(() => recipeToAppearance(value));
  }
  assert.equal(PipelineRequestSchema.safeParse({text: 'duck', profileId: 'mock', geometryMode: 'blender'}).success, false);
  assert.equal(MeshAppearanceSchema.safeParse({type: 'mesh', vertices: Array(257).fill([0, 0, 0]),
    triangles: [[0, 1, 2]], faceColors: ['#ffffff']}).success, false);
});

test('every offered prompt resolves to its own mock through the design handoff', () => {
  const selected = generationEvaluationPrompts.map(prompt => {
    const fixture = mockProceduralForText(prompt);
    assert.ok(fixture, 'Missing mock for '+prompt);
    assert.equal(fixture.prompt, prompt);
    assert.equal(mockProceduralForText(fixture.design.visualBrief)?.spec.id, fixture.spec.id);
    return fixture;
  });
  assert.equal(new Set(selected.map(fixture => fixture.spec.id)).size, generationEvaluationPrompts.length);
  assert.equal(mockProceduralForText('red rocket with fins')?.design.displayName, 'Red rocket');
  assert.equal(mockProceduralForText('  RED   ROCKET WITH FINS  ')?.design.displayName, 'Red rocket');
  assert.equal(mockProceduralForText('a bicycle made from spaghetti'), undefined);
});
