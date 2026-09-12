import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCourse,makeDucts,obstacleHit } from './race-course';
import { PracticeRace } from './practice-race';
import { planRival } from './rival-planner';
import { FreefallController } from './freefall-controller';
test('ducts have open centers, solid walls and an offset exit',()=>{
  const ducts=makeDucts(),first=ducts[0],last=ducts[2];
  const [x,y,z]=first.position;
  assert.equal(obstacleHit([x,y+13,z],[x,y-13,z],first,0),null);
  assert.equal(obstacleHit([x+6.5,y+13,z],[x+6.5,y-13,z],first,0),0.5);
  assert.equal(last.position[0]-x,8);
  assert.ok(makeCourse().length>150);
});
test('pipe passages contain rare fuel rings with room inside their walls',()=>{
  const race=new PracticeRace();
  const boosts=race.rings.filter(r=>r.id>=1000);
  assert.equal(boosts.length,2);
  assert.ok(boosts.every(r=>r.radius===3));
  for(const boost of boosts){
    const duct=race.obstacles.find(o=>o.id===boost.id)!;
    assert.equal(obstacleHit([boost.position[0],boost.position[1]+1,boost.position[2]],boost.position,duct,0),null);
  }
});
test('planner seeks reachable items instead of crossing the lane for impossible pickups',()=>{
  const race=new PracticeRace(false),racer=race.racers[1],p=race.snapshot(racer).position;
  racer.controller.setFallSpeed(30);
  race.boxes=[{id:0,position:[p[0]+4,-35,0],active:true},{id:1,position:[35,-2,30],active:true}];
  planRival(race,racer);
  assert.deepEqual(racer.target,[p[0]+4,0]);
});
test('rivals save defensive items in clear air and use sun near junk',()=>{
  const race=new PracticeRace(false),racer=race.racers[1],p=race.snapshot(racer).position;
  racer.item='sun';race.step(0.01,{x:0,z:0},false);assert.equal(racer.item,'sun');
  race.obstacles=[{id:0,kind:'fridge',position:[p[0],-8,0],rotation:[0,0,0],active:true,hitAt:-1}];
  race.step(0.01,{x:0,z:0},false);
  assert.equal(racer.item,null);assert.equal(race.obstacles[0].active,false);
});
test('rivals acquire a lock before using umbrellas',()=>{
  const race=new PracticeRace(false),racer=race.racers[1];
  racer.controller=new FreefallController(40,0,0);
  race.racers[0].controller=new FreefallController(40,0,0);
  race.racers[0].controller.step(2,{x:0,z:0},{fallSpeedMultiplier:1});
  racer.item='umbrella';
  for(let i=0;i<30;i++)race.step(1/120,{x:0,z:0},false);
  assert.equal(racer.item,'umbrella');
  for(let i=0;i<60;i++)race.step(1/120,{x:0,z:0},false);
  assert.equal(racer.item,null);
});
