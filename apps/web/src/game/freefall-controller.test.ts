import test from 'node:test';
import assert from 'node:assert/strict';
import { FreefallController, GRAVITY, TERMINAL_SPEED, BRAKE_SPEED, STEER_SPEED } from './freefall-controller';

const idle = {x: 0, z: 0};
const modifiers = {fallSpeedMultiplier: 1};
const close = (a: number, b: number) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);

test('freefall accelerates from rest, caps speed, and integrates across the cap', () => {
  const player = new FreefallController();
  const first = player.step(1, idle, modifiers);
  close(first.fallSpeed, GRAVITY);
  close(first.position[1], -GRAVITY/2);
  const final = player.step(9, idle, modifiers);
  close(final.fallSpeed, TERMINAL_SPEED);
  const ramp = TERMINAL_SPEED / GRAVITY;
  close(-final.position[1], GRAVITY/2*ramp*ramp + TERMINAL_SPEED*(10-ramp));
});
test('braking approaches eight, release accelerates, reset restores rest', () => {
  const player = new FreefallController();
  player.step(5, idle, modifiers);
  player.braking = true;
  close(player.step(0.5, idle, modifiers).fallSpeed, 20);
  close(player.step(2, idle, modifiers).fallSpeed, BRAKE_SPEED);
  player.braking = false;
  close(player.step(0.1, idle, modifiers).fallSpeed, BRAKE_SPEED + GRAVITY*0.1);
  player.reset();
  assert.deepEqual(player.getSnapshot(), {position: [0,0,0], fallSpeed: 0});
  player.braking = true;
  assert.ok(player.step(0.1, idle, modifiers).fallSpeed < BRAKE_SPEED);
});
test('motion is timestep independent and diagonal steering is normalized', () => {
  const one = new FreefallController(), many = new FreefallController();
  const a = one.step(10, {x:1,z:-1}, modifiers);
  for (let i=0; i<1200; i++) many.step(1/120, {x:1,z:-1}, modifiers);
  const b = many.getSnapshot();
  a.position.forEach((value, i) => close(value, b.position[i]));
  close(Math.hypot(a.position[0], a.position[2]), STEER_SPEED*10);
  close(a.fallSpeed, b.fallSpeed);
});
