import test from 'node:test';
import assert from 'node:assert/strict';
import { PracticeRace, FINISH_DEPTH, LANE_HALF_WIDTH } from './practice-race';
test('race bounds steering, locks finishes, and resets every racer', () => {
  const race = new PracticeRace(false);
  for(let i=0;i<15000;i++) race.step(1/120,{x:1,z:-1},false);
  const player = race.racers[0];
  assert.ok(player.finishTime !== undefined);
  assert.ok(Math.abs(player.finishTime!-121.52905)<0.01);
  assert.deepEqual(race.snapshot(player).position,[LANE_HALF_WIDTH,-FINISH_DEPTH,-LANE_HALF_WIDTH]);
  const finish = player.finishTime;
  const position = [...race.snapshot(player).position];
  for(let i=0;i<12000;i++) race.step(1/120,{x:-1,z:1},true);
  assert.equal(player.finishTime,finish);
  assert.deepEqual(race.snapshot(player).position,position);
  assert.equal(race.order()[0].id,0);
  assert.equal(race.finished,true);
  race.reset();
  assert.equal(race.elapsed,0);
  assert.ok(race.racers.every(racer => racer.finishTime === undefined));
});
test('simulated racers steer and brake with repeatable random decisions', () => {
  const a = new PracticeRace(false), b = new PracticeRace(false);
  let braking = false;
  for(let i=0;i<2400;i++) {
    a.step(1/120,{x:0,z:0},false); b.step(1/120,{x:0,z:0},false);
    braking ||= a.racers.slice(1).some(r => r.controller.braking);
  }
  assert.ok(braking);
  assert.deepEqual(a.racers.map(r=>a.snapshot(r)),b.racers.map(r=>b.snapshot(r)));
  assert.ok(a.racers.slice(1).some(r=> Math.abs(a.snapshot(r).position[2])>1));
});
