import test from 'node:test';
import assert from 'node:assert/strict';
import { meshFixture, type CreationResult } from '@sky/shared';
import { DemoGame } from './demo-game';
import { SimplePlayerController, type PlayerController, type Position } from './player-controller';
import { applyEffect, initialEffects, stepEffects, type EffectWorld } from './effects';
import { sweptPickup } from './world-geometry';
import { createSimulatedTranscriber } from '../voice/simulated-transcriber';

test('demo still falls, detects voice pickup, spawns ahead, and activates on collision', async () => {
  let resolve!: (result: CreationResult) => void;
  const game = new DemoGame({generate: () => new Promise(done => {resolve = done;})}, createSimulatedTranscriber(() => 'crystal'));
  game.startNewRun();
  for (let i=0; i<24; i++) game.step(0.1, {x:0,z:0});
  assert.equal(game.getSnapshot().phase, 'prompted');
  game.creations.startRecording(); const pending = game.creations.finishRecording();
  await new Promise(done => setImmediate(done));
  for (let i=0; i<20; i++) game.step(0.1, {x:0,z:0});
  const currentY = game.getSnapshot().player[1];
  resolve({ok:true,spec:meshFixture}); await pending;
  assert.equal(game.getSnapshot().creation?.position[1], currentY-30);
  for (let i=0; i<30; i++) game.step(0.1, {x:0,z:0});
  assert.equal(game.getSnapshot().phase, 'activated');
  assert.equal(game.getSnapshot().creation, undefined);
  game.step(0.1, {x:0,z:0});
  assert.equal(game.getSnapshot().fallSpeed, 5);
});
test('custom movement controller supplies current position and speed with no lifecycle changes', async () => {
  let position: Position = [0,0,0];
  const controller: PlayerController = {
    reset() {position = [0,0,0];},
    getSnapshot() {return {position, fallSpeed: 6};},
    step() {const previousPosition = position; position = [2,position[1]-2,1]; return {previousPosition,position,fallSpeed:6};},
  };
  const game = new DemoGame({generate: async () => ({ok:true,spec:meshFixture})}, createSimulatedTranscriber(() => 'crystal'), controller);
  game.startNewRun();
  game.creations.collectVoice();
  game.step(0.1, {x:0,z:0});
  game.creations.startRecording(); await game.creations.finishRecording();
  assert.deepEqual(game.getSnapshot().creation?.position, [2,-20,1]);
});
test('simple controller owns steering, fall integration, modifiers, and reset', () => {
  const player = new SimplePlayerController();
  const motion = player.step(0.1, {x:1,z:-1}, {fallSpeedMultiplier:0.5});
  assert.deepEqual(motion.previousPosition, [0,0,0]);
  assert.ok(Math.abs(motion.position[0]-0.7) < 1e-10);
  assert.equal(motion.position[1], -0.5);
  assert.equal(motion.fallSpeed, 5);
  player.reset(); assert.deepEqual(player.getSnapshot().position, [0,0,0]);
});
test('collision uses the actual 3D movement segment', () => {
  assert.ok(sweptPickup([-3,3,0], [3,-3,0], [0,0,0], 1));
  assert.equal(sweptPickup([-3,3,0], [3,-3,0], [3,3,0], 1), false);
});
test('world effect handlers refresh durations, expire, and clear nearby obstacles', () => {
  const world: EffectWorld = {effects: initialEffects(), obstacles: [{id:1,position:[0,-2,0]}, {id:2,position:[0,-30,0]}]};
  applyEffect(world, [0,0,0], {type:'reduceFallSpeed',multiplier:0.5,durationSeconds:8});
  applyEffect(world, [0,0,0], {type:'reduceFallSpeed',multiplier:0.7,durationSeconds:1});
  assert.equal(world.effects.slow.multiplier, 0.7);
  assert.equal(world.effects.slow.remaining, 1);
  applyEffect(world, [0,0,0], {type:'invulnerability',durationSeconds:1});
  applyEffect(world, [0,0,0], {type:'clearNearbyObstacles',radiusMeters:12});
  assert.deepEqual(world.obstacles.map(obstacle => obstacle.id), [2]);
  stepEffects(world.effects, 1);
  assert.equal(world.effects.slow.remaining, 0);
  assert.equal(world.effects.protectionSeconds, 0);
});
