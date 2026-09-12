import test from 'node:test';
import assert from 'node:assert/strict';
import { CreationSpecSchema, meshFixture, fixtures, adaptPowerUpV1 } from './index.js';
test('mesh and adapted v1 fixtures validate', () => {
  assert.ok(CreationSpecSchema.safeParse(meshFixture).success);
  fixtures.forEach(spec => assert.equal(adaptPowerUpV1(spec).version, 2));
});
test('reject bad topology, dimensions, counts, colors, and degenerate faces', () => {
  const appearance = meshFixture.appearance;
  assert.equal(appearance.type, 'mesh');
  if (appearance.type !== 'mesh') return;
  for (const patch of [
    {vertices: [[Infinity,0,0], [1,0,0], [0,1,0]]},
    {vertices: [[4,0,0], [1,0,0], [0,1,0]]},
    {vertices: Array(257).fill([0,0,0])},
    {triangles: [[0,0,1]]}, {triangles: [[0,1,90]]}, {triangles: [[0,1,1.5]]},
    {vertices: [[0,0,0],[1,0,0],[2,0,0]], triangles: [[0,1,2]], faceColors: ['#ffffff']},
    {triangles: Array(513).fill([0,1,2])}, {faceColors: ['red']}, {faceColors: []},
  ]) assert.equal(CreationSpecSchema.safeParse({...meshFixture, appearance: {...appearance, ...patch}}).success, false);
});
