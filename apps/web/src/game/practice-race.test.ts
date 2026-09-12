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
  const a = new PracticeRace(true,()=>0.42), b = new PracticeRace(true,()=>0.42);

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
test('restarts change opening box positions and orientations with fresh seeds',()=>{
  let seed=0.1;
  const race=new PracticeRace(true,()=>seed);
  const before=race.boxes.slice(0,5).map(box=>({position:box.position,rotation:box.rotation}));
  seed=0.7;race.reset();
  assert.notDeepEqual(race.boxes.slice(0,5).map(box=>box.position),before.map(box=>box.position));
  assert.notDeepEqual(race.boxes.slice(0,5).map(box=>box.rotation),before.map(box=>box.rotation));
});

test('randomized boxes stay inside the lane and clear of obstacles and neighboring boxes',()=>{
  for(let seed=0;seed<20;seed++){
    const race=new PracticeRace(true,()=>seed/20);
    assert.equal(race.boxes.length,70);
    for(const box of race.boxes){
      assert.ok(Math.abs(box.position[0])<=28&&Math.abs(box.position[2])<=28);
      for(const obstacle of race.obstacles){
        if(Math.abs(box.position[1]-obstacle.position[1])<=(obstacle.kind==='duct'?30:12))
          assert.ok(Math.hypot(box.position[0]-obstacle.position[0],box.position[2]-obstacle.position[2])>(obstacle.kind==='duct'?19:10));
      }
      for(const other of race.boxes){
        if(other!==box&&Math.abs(other.position[1]-box.position[1])<20)
          assert.ok(Math.hypot(other.position[0]-box.position[0],other.position[2]-box.position[2])>=9);
      }
    }
  }
});
