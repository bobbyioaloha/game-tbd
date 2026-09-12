import test from 'node:test';
import assert from 'node:assert/strict';
import { proceduralFixtures } from '@sky/shared';
import { compilePrimitiveAppearance, MAX_COMPILED_TRIANGLES } from './compile-primitives';

test('compiled parts preserve scale, XYZ rotation, translation, color and normals', () => {
  const data = compilePrimitiveAppearance({type: 'primitives', primitives: [{
    type: 'box', position: [1, 2, -1], scale: [2, 3, 4], rotation: [0, 0, Math.PI / 2], color: '#ff0000',
  }]});
  const axes = [0, 1, 2].map(axis => Array.from(data.positions).filter((_, index) => index % 3 === axis));
  assert.deepEqual(axes.map(values => [Math.min(...values), Math.max(...values)]), [[-0.5, 2.5], [1, 3], [-3, 1]]);
  assert.equal(data.triangleCount, 12);
  for (let i = 0; i < data.normals.length; i += 3) {
    assert.ok(Math.abs(Math.hypot(...data.normals.slice(i, i + 3)) - 1) < 1e-6);
    assert.deepEqual(Array.from(data.colors.slice(i, i + 3)), [1, 0, 0]);
  }
});
test('all fixtures and the maximum sphere recipe compile deterministically within budget', () => {
  for (const fixture of proceduralFixtures) {
    const result = compilePrimitiveAppearance(fixture.appearance);
    assert.deepEqual(result, compilePrimitiveAppearance(fixture.appearance));
    assert.equal(result.positions.length, result.normals.length);
    assert.equal(result.positions.length, result.colors.length);
    assert.ok(result.positions.every(Number.isFinite));
    assert.ok(result.triangleCount > 0 && result.triangleCount <= MAX_COMPILED_TRIANGLES);
  }
  const sphere = {type: 'sphere', position: [3, 3, 3], rotation: [1, 2, 3], scale: [4, 4, 4], color: '#ffffff'};
  const result = compilePrimitiveAppearance({type: 'primitives', primitives: Array(24).fill(sphere)});
  assert.ok(result.triangleCount <= MAX_COMPILED_TRIANGLES);
  assert.throws(() => compilePrimitiveAppearance({type: 'primitives', primitives: Array(25).fill(sphere)}));
  assert.throws(() => compilePrimitiveAppearance({type: 'primitives', primitives: [{...sphere, scale: [0, 1, 1]}]}));
});
