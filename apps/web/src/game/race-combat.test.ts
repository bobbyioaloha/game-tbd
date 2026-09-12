import test from 'node:test';
import assert from 'node:assert/strict';
import { PracticeRace } from './practice-race';
import { FreefallController } from './freefall-controller';
import { obstacleHit, type Obstacle } from './race-course';
const idle={x:0,z:0};
function advance(race:PracticeRace,seconds:number){for(let i=0;i<Math.round(seconds*120);i++)race.step(1/120,idle,false);}
function duel(up=false){
  const race=new PracticeRace(false);
  race.racers.forEach((r,id)=>{
    r.controller=new FreefallController(20,id>1?19:0,id>1?19:0);
    r.decision=Infinity;r.target=id>1?[19,19]:[0,0];
  });
  race.racers[up?0:1].controller.step(2,idle,{fallSpeedMultiplier:1});
  return race;
}
test('umbrella fires downward and upward, with inherited velocity and delayed impact',()=>{
  for(const up of [false,true]){
    const race=duel(up);race.racers[0].item='umbrella';
    const speed=race.snapshot(race.racers[0]).fallSpeed;
    race.useItem(0,up,1);
    assert.equal(race.racers[0].item,null);
    assert.equal(race.projectiles[0].velocity[1],(up?60:-60)-speed);
    assert.equal(race.racers[1].slowUntil,0);
    advance(race,0.8);
    assert.ok(race.racers[1].slowUntil>race.elapsed);
  }
});
test('ghost blocks jellyfish, lasts five seconds, and finished racers cannot use items',()=>{
  const race=duel();race.racers[1].item='cloak';race.useItem(1,false);
  assert.equal(race.racers[1].shieldUntil,5);
  race.racers[0].item='umbrella';race.useItem(0,false,1);advance(race,0.8);
  assert.equal(race.racers[1].slowUntil,0);
  race.racers[0].finishTime=1;race.racers[0].item='sun';
  assert.equal(race.useItem(0,false),false);
  assert.equal(race.racers[0].item,'sun');
});
test('sun clears only active obstacles within twelve metres',()=>{
  const race=new PracticeRace(false),p=race.snapshot(race.racers[0]).position;
  race.obstacles=[5,30].map((d,id)=>({id,kind:'fridge',position:[p[0],-d,0],rotation:[0,0,0],active:true,hitAt:-1}));
  race.racers[0].item='sun';race.useItem(0,false);
  assert.equal(race.obstacles[0].active,false);assert.equal(race.obstacles[1].active,true);
});
test('item slot does not overwrite held items; rings grant a nonstacking speed boost',()=>{
  const race=new PracticeRace(false);
  race.boxes=[{id:0,position:[-7.5,-1,0],active:true}];
  race.rings=[{id:0,position:[-7.5,-2,0],used:new Set()}];
  race.racers.slice(1).forEach(r=>{r.finishTime=0;}); // Isolate slot behavior from rival pickups.
  race.racers[0].item='cloak';advance(race,0.5);
  assert.equal(race.boxes[0].active,true);assert.equal(race.racers[0].item,'cloak');
  advance(race,1);
  assert.ok(race.rings[0].used.has(0));assert.ok(race.racers[0].boostUntil>race.elapsed);
  advance(race,2.5);
  assert.ok(race.snapshot(race.racers[0]).fallSpeed>30);
});
test('empty slot collects only the supported items and restart clears course effects',()=>{
  const race=new PracticeRace(false);
  race.boxes=[{id:0,position:[-7.5,-1,0],active:true}];
  advance(race,0.5);
  assert.ok(['umbrella','cloak','sun'].includes(race.racers[0].item!));
  assert.equal(race.boxes[0].active,false);
  race.racers[0].slowUntil=99;race.reset();
  assert.equal(race.racers[0].item,null);assert.equal(race.racers[0].slowUntil,0);assert.equal(race.projectiles.length,0);
});
test('rotated obstacle colliders distinguish satellite panels from body',()=>{
  const obstacle:Obstacle={id:0,kind:'satellite',position:[0,0,0],rotation:[0,0,0],active:true,hitAt:-1};
  assert.equal(obstacleHit([4,5,0],[4,-5,0],obstacle,0),0.75);
  assert.equal(obstacleHit([0,5,0],[0,-5,0],obstacle,0),0.4);
  obstacle.rotation=[0,Math.PI/2,0];
  assert.equal(obstacleHit([0,5,4],[0,-5,4],obstacle,0),0.75);
  assert.equal(obstacleHit([10,5,10],[10,-5,10],obstacle,0),null);
});
test('obstacle hits flail and protect against repeat hits; ghosts pass safely',()=>{
  for(const ghost of [false,true]){
    const race=new PracticeRace(false);
    race.obstacles=[{id:0,kind:'fridge',position:[-7.5,-3,0],rotation:[0,0,0],active:true,hitAt:-1}];
    if(ghost)race.racers[0].shieldUntil=5;
    advance(race,0.7);
    assert.equal(race.racers[0].immuneUntil>0,!ghost);
    assert.equal(race.obstacles[0].active,ghost);
  }
});
test('full course remains finite and all racers finish',()=>{
  const race=new PracticeRace();
  advance(race,200);
  assert.ok(race.finished);
  assert.ok(race.racers.every(r=>Number.isFinite(r.finishTime)));
});

test('flailing reduces player and rival steering to thirty percent, then expires',()=>{
  for(const id of [0,1]){
    const race=new PracticeRace(false),racer=race.racers[id];
    racer.decision=Infinity;racer.target=[18,18];
    const dt=1/120,input={x:1,z:1};
    const speed=()=>{
      const before=race.snapshot(racer).position;
      race.step(dt,input,false);
      const after=race.snapshot(racer).position;
      return Math.hypot(after[0]-before[0],after[2]-before[2])/dt;
    };
    assert.ok(Math.abs(speed()-12)<1e-8);
    racer.flailUntil=race.elapsed+dt;
    assert.ok(Math.abs(speed()-3.6)<1e-8);
    assert.ok(Math.abs(speed()-12)<1e-8);
  }
});
