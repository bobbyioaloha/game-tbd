import test from 'node:test';
import assert from 'node:assert/strict';
import { TargetLock } from './target-lock';
import { PracticeRace, LANE_HALF_WIDTH, ITEM_PICKUP_RADIUS } from './practice-race';
import { FreefallController } from './freefall-controller';

test('lock requires acquisition time, tolerates a brief slip, and cancels on view/range changes',()=>{
  const lock=new TargetLock();
  assert.equal(lock.update(1,0.3,false,true),undefined);
  assert.equal(lock.update(1,0.3,false,true),1);
  assert.equal(lock.update(undefined,0.1,false,true),1);
  assert.equal(lock.update(undefined,0.1,false,true),undefined);
  lock.update(1,0.6,false,true);
  assert.equal(lock.update(1,0.01,true,true),undefined);
  assert.ok(lock.progress<1);
  lock.update(1,0.6,true,true);
  assert.equal(lock.update(undefined,0.01,true,false),undefined);
});
test('changing targets cannot transfer a confirmed lock',()=>{
  const lock=new TargetLock();lock.update(1,0.6,false,true);
  assert.equal(lock.update(2,0.1,false,true),undefined);
  assert.ok(lock.progress<0.2);
  lock.reset();assert.equal(lock.target,undefined);assert.equal(lock.progress,0);
});
test('locked parachute intercepts distant boosted rivals moving laterally in either view',()=>{
  for(const up of [false,true]){
    const race=new PracticeRace(false);
    race.racers.forEach((r,i)=>{
      r.controller=new FreefallController(LANE_HALF_WIDTH,i<2?0:38,i<2?0:38);
      r.dodgeReady=Infinity;r.decision=Infinity;r.nextUse=Infinity;r.target=[35,25];
    });
    race.racers[up?0:1].controller.step(6,{x:0,z:0},{fallSpeedMultiplier:1});
    const victim=race.racers[1];victim.boostFuel=4;victim.controller.setFallSpeed(60);
    race.racers[0].item='parachute';assert.ok(race.useItem(0,up,1));
    for(let i=0;i<1200&&victim.slowUntil===0;i++)race.step(1/120,{x:0,z:0},false);
    assert.ok(victim.slowUntil>race.elapsed,'Locked shot should catch normal boosted steering');
  }
});
test('forgiving swept pickups report full inventory and successful collection',()=>{
  const race=new PracticeRace(false);
  race.racers.slice(1).forEach(r=>{r.finishTime=0;});
  const x=race.snapshot(race.racers[0]).position[0];
  race.boxes=[{id:0,position:[x+ITEM_PICKUP_RADIUS-0.1,-1,0],active:true}];
  race.racers[0].item='bubbleWrap';
  race.step(0.5,{x:0,z:0},false);
  assert.equal(race.feedback,'ITEM SLOT FULL');assert.ok(race.boxes[0].active);
  race.racers[0].item=null;
  race.step(0.01,{x:0,z:0},false);
  assert.match(race.feedback,/PICKED UP/);assert.equal(race.boxes[0].active,false);
});
test('air canister announces reserve thrust without clearing obstacles',()=>{
  const race=new PracticeRace(false),player=race.racers[0],p=race.snapshot(player).position;
  race.obstacles=[{id:0,kind:'fridge',position:[p[0],-3,0],rotation:[0,0,0],active:true,hitAt:-1}];
  player.item='airCanister';assert.equal(race.useItem(0,false),true);
  assert.match(race.feedback,/AIR CANISTER.*RESERVE THRUST/);
  assert.equal(race.obstacles[0].active,true);
});
test('arena and course opportunities match the expanded prototype',()=>{
  const race=new PracticeRace();
  assert.equal(LANE_HALF_WIDTH,36);
  assert.equal(race.boxes.length,70);assert.equal(race.rings.length,4);
  assert.equal(race.boxes[5].position[1]-race.boxes[0].position[1],-250);

});

test('incidents count actual collisions once, ignore protected contact, and reset',()=>{
  const race=new PracticeRace(false);
  race.racers.slice(1).forEach(r=>{r.finishTime=0;});
  const player=race.racers[0],position=race.snapshot(player).position;
  race.obstacles=[{id:700,kind:'fridge',position:[position[0],-1,0],rotation:[0,0,0],active:true,hitAt:-1}];
  race.step(1/120,{x:0,z:0},false);
  assert.equal(player.incidents,1);
  race.obstacles[0].active=true;
  race.step(1/120,{x:0,z:0},false);
  assert.equal(player.incidents,1,'immunity prevents another incident');
  race.reset();
  assert.equal(race.racers[0].incidents,0);
});
