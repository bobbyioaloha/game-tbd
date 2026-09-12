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
test('simulated racers make repeatable course-aware decisions', () => {
  const a = new PracticeRace(), b = new PracticeRace();

  for(let i=0;i<2400;i++) {
    a.step(1/120,{x:0,z:0},false); b.step(1/120,{x:0,z:0},false);

  }

  assert.deepEqual(a.racers.map(r=>a.snapshot(r)),b.racers.map(r=>b.snapshot(r)));
  assert.ok(a.racers.slice(1).some(r=> Math.abs(a.snapshot(r).position[2])>1));
});

test('progress tracker reports order, relative gaps, finish state, and reset',()=>{
  const race=new PracticeRace(false);
  race.racers[1].controller.step(2,{x:0,z:0},{fallSpeedMultiplier:1});
  const standings=race.standings();
  assert.equal(standings[0].id,1);
  assert.ok(Math.abs(standings[0].gap-19.62)<1e-8);
  assert.ok(Math.abs(standings[0].progress-19.62/FINISH_DEPTH)<1e-8);
  race.racers[1].landed={position:[0,-FINISH_DEPTH,0],fallSpeed:0};
  race.racers[1].finishTime=120;
  assert.equal(race.standings()[0].progress,1);
  assert.equal(race.standings()[0].finished,true);
  race.reset();
  assert.ok(race.standings().every(r=>r.progress===0&&r.gap===0&&!r.finished));
});