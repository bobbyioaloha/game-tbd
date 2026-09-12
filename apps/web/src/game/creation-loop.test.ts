import test from 'node:test';
import assert from 'node:assert/strict';
import { meshFixture, type CreationClient, type CreationResult } from '@sky/shared';
import { CreationLoop, type CreationHost } from './creation-loop';
import { createSimulatedTranscriber } from '../voice/simulated-transcriber';

const host = (): CreationHost => ({spawnCreation() {}, applyEffects() {}});
function setup(client: CreationClient, text = 'wind crystal', world = host()) {
  const loop = new CreationLoop(client, createSimulatedTranscriber(() => text), world);
  loop.start(); loop.collectVoice();
  return loop;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('lifecycle works without a player and ignores duplicate or unrelated pickup events', async () => {
  let calls = 0, activations = 0, spawned = '';
  const loop = setup({generate: async () => {calls++; return {ok: true, spec: meshFixture};}}, 'wind crystal', {
    spawnCreation(id) { spawned = id; },
    applyEffects(effects) { activations++; assert.equal(effects[0].type, 'reduceFallSpeed'); },
  });
  loop.collectVoice(); loop.startRecording();
  const pending = loop.finishRecording();
  loop.startRecording(); await loop.finishRecording(); await pending;
  assert.equal(calls, 1); assert.equal(loop.getSnapshot().phase, 'spawned');
  loop.collectCreation('wrong-id'); assert.equal(activations, 0);
  loop.collectCreation(spawned); loop.collectCreation(spawned);
  assert.equal(activations, 1); assert.equal(loop.getSnapshot().phase, 'activated');
  assert.equal('player' in loop.getSnapshot(), false);
});
test('invalid speech consumes opportunity without calling provider', async () => {
  let calls = 0;
  const loop = setup({generate: async () => {calls++; return {ok: true, spec: meshFixture};}}, '');
  loop.startRecording(); await loop.finishRecording();
  loop.collectVoice(); loop.startRecording(); await loop.finishRecording();
  assert.equal(loop.getSnapshot().phase, 'failed'); assert.equal(calls, 0);
});
test('provider failure is not retried', async () => {
  let calls = 0;
  const loop = setup({generate: async () => {calls++; throw new Error('failed');}});
  loop.startRecording(); await loop.finishRecording();
  loop.startRecording(); await loop.finishRecording();
  assert.equal(loop.getSnapshot().phase, 'failed'); assert.equal(calls, 1);
});
test('late result after reset never reaches the world', async () => {
  let resolve!: (result: CreationResult) => void, spawns = 0;
  const loop = setup({generate: () => new Promise(done => {resolve = done;})}, 'wind crystal',
    {spawnCreation() {spawns++;}, applyEffects() {}});
  loop.startRecording(); const pending = loop.finishRecording(); await flush();
  loop.reset(); loop.start();
  resolve({ok: true, spec: meshFixture}); await pending;
  assert.equal(loop.getSnapshot().phase, 'available'); assert.equal(spawns, 0);
});
test('expired prompt and missed creation cannot be reused', async () => {
  const client: CreationClient = {generate: async () => ({ok: true, spec: meshFixture})};
  const loop = setup(client);
  loop.advanceTime(11); loop.startRecording();
  assert.equal(loop.getSnapshot().phase, 'failed');
  let id = '';
  const other = setup(client, 'wind crystal', {spawnCreation(value) {id = value;}, applyEffects() {assert.fail('Missed creation activated');}});
  other.startRecording(); await other.finishRecording();
  other.missCreation(id); other.collectCreation(id);
  assert.equal(other.getSnapshot().phase, 'missed');
});
