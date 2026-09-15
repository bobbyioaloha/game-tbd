import test from 'node:test';
import assert from 'node:assert/strict';
import { PracticeRace } from './practice-race';
import { makeCourse } from './race-course';
import { FreefallController } from './freefall-controller';
const idle={x:0,z:0};
test('boost is stored, consumed on demand, and braking preserves fuel',()=>{
  const race=new PracticeRace(false),p=race.racers[0];
  p.boostFuel=4;
  race.step(0.1,idle,false);assert.equal(p.boostFuel,4);assert.equal(p.boosting,false);
  const before=race.snapshot(p).fallSpeed;
  race.step(0.1,idle,false,true);assert.ok(Math.abs(p.boostFuel-3.9)<1e-8);
  assert.ok(race.snapshot(p).fallSpeed>before&&race.snapshot(p).fallSpeed<60);
  race.step(0.1,idle,true,true);assert.ok(Math.abs(p.boostFuel-3.9)<1e-8);assert.equal(p.boosting,false);
  race.reset();assert.equal(race.racers[0].boostFuel,0);
});
test('brief boost taps cannot outperform holding boost or retain unpaid speed',()=>{
  const run=(tap:boolean)=>{
    const race=new PracticeRace(false),p=race.racers[0];
    p.boostFuel=2;p.controller.setFallSpeed(30);
    for(let i=0;i<1200;i++){
      const powered=!tap||i%60===0;
      race.step(1/120,idle,false,powered);
      if(!powered)assert.ok(race.snapshot(p).fallSpeed<=30);
    }
    return {depth:-race.snapshot(p).position[1],fuel:p.boostFuel};
  };
  const held=run(false),tapped=run(true);
  assert.ok(held.depth>tapped.depth+30);
  assert.equal(held.fuel,0);assert.ok(tapped.fuel>1.8);
});
test('obstacle slowdown recovers gradually while boost remains held',()=>{
  const race=new PracticeRace(false),p=race.racers[0],dt=1/120;
  p.boostFuel=2;p.controller.setFallSpeed(60);
  race.obstacles=[{id:0,kind:'fridge',position:[-7.5,-2,0],rotation:[0,0,0],active:true,hitAt:-1}];
  race.step(dt,idle,false,true);
  const hitSpeed=race.snapshot(p).fallSpeed;
  assert.ok(p.flailUntil>race.elapsed);assert.ok(hitSpeed<30);
  race.step(dt,idle,false,true);
  assert.ok(race.snapshot(p).fallSpeed>hitSpeed&&race.snapshot(p).fallSpeed<30);
});
test('fuel exhaustion within a step and braking cannot retain unpaid boost speed',()=>{
  for(const brake of [false,true]){
    const race=new PracticeRace(false),p=race.racers[0];
    p.boostFuel=0.005;p.controller.setFallSpeed(60);
    race.step(0.1,idle,brake,true);
    assert.equal(p.boostFuel,brake?0.005:0);
    assert.ok(race.snapshot(p).fallSpeed<=30);
    assert.ok(-race.snapshot(p).position[1]<=3.15+1e-8);
    race.step(0.1,idle,brake,true);
    assert.equal(p.boosting,false);
  }
});
test('dodge has locked direction, cooldown, short immunity, and breaks homing',()=>{
  const race=new PracticeRace(false),p=race.racers[0];
  race.projectiles=[{id:0,owner:1,target:0,position:[0,-10,0],velocity:[0,75,0],expires:8}];
  assert.equal(race.dodge(0,{x:1,z:0}),true);assert.equal(race.projectiles[0].target,undefined);
  assert.equal(race.dodge(0,{x:-1,z:0}),false);
  assert.equal(race.protected(p),true);
  const x=race.snapshot(p).position[0];
  race.step(0.1,{x:-1,z:0},false);
  assert.ok(race.snapshot(p).position[0]>x);
  race.elapsed=0.26;assert.equal(race.protected(p),false);
  race.elapsed=14.99;assert.equal(race.dodge(0,idle),false);race.elapsed=15;assert.equal(race.dodge(0,idle),true);
});
test('dodge prevents obstacle impact inside its invincibility window',()=>{
  const race=new PracticeRace(false),p=race.racers[0],position=race.snapshot(p).position;
  race.obstacles=[{id:0,kind:'fridge',position:[position[0],-1,0],rotation:[0,0,0],active:true,hitAt:-1}];
  race.dodge(0,idle);race.step(0.05,idle,false);
  assert.equal(p.flailUntil,0);assert.equal(race.obstacles[0].active,true);
});

test('threat detection separates lock acquisition from incoming parachutes',()=>{
  const race=new PracticeRace(false),rival=race.racers[1];
  rival.item='parachute';rival.aiLock.update(0,0.1,false,true);
  assert.equal(race.threat(0)?.kind,'BEING TARGETED');
  race.projectiles=[{id:0,owner:1,target:0,position:[0,-10,0],velocity:[0,75,0],expires:8}];
  assert.equal(race.threat(0)?.kind,'PARACHUTE INCOMING');
  race.dodge(0,idle);
  assert.notEqual(race.threat(0)?.kind,'PARACHUTE INCOMING');
});
test('course has varied junk and non-row box arrangements',()=>{
  const kinds=new Set(makeCourse().map(o=>o.kind));
  for(const kind of ['cone','extinguisher','barrier','crate','capsule'])assert.ok(kinds.has(kind as never));
  const race=new PracticeRace();assert.equal(race.rings.length,4);
  assert.ok(new Set(race.boxes.slice(0,5).map(b=>b.position[2])).size>2);
});

test('expired projectiles cannot damage a racer',()=>{
  const race=new PracticeRace(false),victim=race.racers[0];
  race.elapsed=1;
  race.projectiles=[{id:0,owner:1,target:0,position:[...race.snapshot(victim).position],velocity:[0,0,0],expires:1}];
  race.step(0.01,idle,false);
  assert.equal(victim.slowUntil,0);
  assert.equal(race.projectiles.length,0);
});
test('pipe rings award twice normal fuel, respect capacity, and cannot be collected twice',()=>{
  for(const fuel of [2,4])for(const initial of [0,3]){
    const race=new PracticeRace(false),player=race.racers[0];
    const x=race.snapshot(player).position[0];
    player.boostFuel=initial;player.controller.setFallSpeed(30);
    race.rings=[{id:1,position:[x,-1,0],used:new Set(),fuel}];
    race.step(0.1,idle,false);
    assert.equal(player.boostFuel,Math.min(4,initial+fuel));
    assert.ok(race.rings[0].used.has(0));
    player.controller=new FreefallController(36,x,0);player.controller.setFallSpeed(30);player.boostFuel=0;
    race.step(0.1,idle,false);assert.equal(player.boostFuel,0);
  }
});
