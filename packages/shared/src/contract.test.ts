import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures, PowerUpSpecSchema, GenerationRequestSchema } from './index.js';
test('all three fixtures validate',()=>{assert.equal(fixtures.length,3);fixtures.forEach(spec=>assert.ok(PowerUpSpecSchema.safeParse(spec).success));});
test('reject unknown effects, unbounded values, and executable fields',()=>{
  const base=fixtures[0];
  for(const effects of [
    [{type:'execute',code:'alert(1)'}],
    [{type:'reduceFallSpeed',multiplier:0,durationSeconds:8}],
    [{type:'invulnerability',durationSeconds:Infinity}],
    [{type:'clearNearbyObstacles',radiusMeters:21}],
    [{type:'invulnerability',durationSeconds:3,script:'evil'}],
  ]) assert.equal(PowerUpSpecSchema.safeParse({...base,effects}).success,false);
});
test('reject malformed geometry and unsupported versions',()=>{
  const base=fixtures[0], part=base.appearance.primitives[0];
  for(const invalid of [
    {...base,version:2},
    {...base,appearance:{primitives:Array(25).fill(part)}},
    {...base,appearance:{primitives:[{...part,scale:[-1,1,1]}]}},
    {...base,appearance:{primitives:[{...part,position:[NaN,0,0]}]}},
    {...base,appearance:{primitives:[{...part,color:'red'}]}},
    {...base,effects:[base.effects[0],base.effects[0]]},
  ]) assert.equal(PowerUpSpecSchema.safeParse(invalid).success,false);
});
test('requests accept ten whitespace-separated words, reject eleven and empty text',()=>{
  assert.ok(GenerationRequestSchema.safeParse({text:'one two three four five six seven eight nine ten'}).success);
  for(const text of ['  ','one two three four five six seven eight nine ten eleven']) assert.equal(GenerationRequestSchema.safeParse({text}).success,false);
});
