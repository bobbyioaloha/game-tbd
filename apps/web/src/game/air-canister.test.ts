import test from 'node:test';
import assert from 'node:assert/strict';
import { AIR_CANISTER_DURATION, BOOST_CAPACITY, FINISH_DEPTH, PracticeRace } from './practice-race';
import { BOOST_SPEED, FreefallController, TERMINAL_SPEED } from './freefall-controller';

const idle={x:0,z:0};
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} should equal ${expected}`);
function setup(){
  const race=new PracticeRace(false,()=>0.42),player=race.racers[0];
  player.controller.setFallSpeed(TERMINAL_SPEED);
  player.item='airCanister';
  return {race,player};
}

test('reserve thrust works with empty or full fuel and holding boost cannot stack speed',()=>{
  for(const fuel of [0,BOOST_CAPACITY])for(const holdBoost of [false,true]){
    const {race,player}=setup();player.boostFuel=fuel;
    assert.equal(race.useItem(0,false),true);
    assert.equal(player.item,null);assert.equal(player.airCanisterUntil,AIR_CANISTER_DURATION);
    race.step(0.5,idle,false,holdBoost);
    close(race.snapshot(player).fallSpeed,45);
    for(let tick=0;tick<3;tick++){
      race.step(0.5,idle,false,holdBoost);
      assert.ok(race.snapshot(player).fallSpeed<=BOOST_SPEED);
      assert.equal(player.boostFuel,fuel);
    }
    close(-race.snapshot(player).position[1],105);
    race.step(0.01,idle,false);
    assert.equal(player.boosting,false);
    assert.equal(race.snapshot(player).fallSpeed,TERMINAL_SPEED);
  }
});

test('expiry within a tick funds only reserve time and any requested remaining fuel',()=>{
  for(const holdBoost of [false,true])for(const fuel of [0.05,BOOST_CAPACITY]){
    const {race,player}=setup();race.useItem(0,false);
    race.elapsed=AIR_CANISTER_DURATION-0.005;
    player.controller.setFallSpeed(BOOST_SPEED);player.boostFuel=fuel;
    race.step(0.1,idle,false,holdBoost);
    const fuelSeconds=holdBoost?Math.min(0.095,fuel):0;
    const powered=0.005+fuelSeconds;
    close(player.boostFuel,fuel-fuelSeconds);
    close(-race.snapshot(player).position[1],powered*BOOST_SPEED+(0.1-powered)*TERMINAL_SPEED);
    close(race.snapshot(player).fallSpeed,powered<0.1?TERMINAL_SPEED:BOOST_SPEED);
  }
});

test('braking cancels reserve thrust permanently without consuming stored fuel',()=>{
  const {race,player}=setup();player.boostFuel=BOOST_CAPACITY;race.useItem(0,false);
  race.step(0.5,idle,false,true);assert.equal(player.boosting,true);
  race.step(0.1,idle,true,true);
  assert.equal(player.airCanisterUntil,0);assert.equal(player.boosting,false);
  assert.equal(player.boostFuel,BOOST_CAPACITY);
  assert.ok(race.snapshot(player).fallSpeed<=TERMINAL_SPEED);
  race.step(0.1,idle,false);
  assert.equal(player.boosting,false);assert.equal(player.boostFuel,BOOST_CAPACITY);
  race.step(0.1,idle,false,true);
  assert.equal(player.boosting,true);close(player.boostFuel,BOOST_CAPACITY-0.1);
});

test('reserve thrust preserves steering and existing slows without granting protection',()=>{
  for(const generatedSlow of [false,true]){
    const {race,player}=setup();
    if(generatedSlow){player.creationSlowUntil=3;player.creationSlowMultiplier=0.5;}
    else player.slowUntil=3;
    player.flailUntil=0.2;
    race.useItem(0,false);
    assert.equal(race.protected(player),false);
    const x=race.snapshot(player).position[0];
    race.step(0.1,{x:1,z:0},false);
    close(race.snapshot(player).position[0]-x,0.6);
    close(race.snapshot(player).fallSpeed,30);
    assert.equal(player.flailUntil,0.2);
    assert.equal(generatedSlow?player.creationSlowUntil:player.slowUntil,3);
    race.step(0.1,idle,false);
    const before=race.snapshot(player).position[0];
    race.step(0.1,{x:1,z:0},false);
    close(race.snapshot(player).position[0]-before,2);
  }
});

test('canister neither clears obstacles nor prevents impacts, and recovery stays gradual',()=>{
  const {race,player}=setup();player.controller.setFallSpeed(BOOST_SPEED);
  const x=race.snapshot(player).position[0];
  race.obstacles=[{id:0,kind:'fridge',position:[x,-2,0],rotation:[0,0,0],active:true,hitAt:-1}];
  race.useItem(0,false);assert.equal(race.obstacles[0].active,true);
  race.step(1/120,idle,false);
  const hitSpeed=race.snapshot(player).fallSpeed;
  assert.equal(player.incidents,1);assert.ok(hitSpeed<TERMINAL_SPEED);
  assert.ok(player.flailUntil>race.elapsed);
  race.step(1/120,idle,false);
  assert.ok(race.snapshot(player).fallSpeed>hitSpeed&&race.snapshot(player).fallSpeed<TERMINAL_SPEED);
});

test('reserve duration follows simulation time, survives zero-time pause ticks, and resets',()=>{
  const {race,player}=setup();race.useItem(0,false);
  race.step(0.5,idle,false);
  const paused=race.snapshot(player),until=player.airCanisterUntil;
  for(let tick=0;tick<300;tick++)race.step(0,idle,false,true);
  assert.deepEqual(race.snapshot(player),paused);
  assert.equal(race.elapsed,0.5);assert.equal(player.airCanisterUntil,until);
  race.step(0.5,idle,false);assert.equal(player.boosting,true);
  close(player.airCanisterUntil-race.elapsed,1);
  race.reset();
  assert.equal(race.elapsed,0);assert.equal(race.racers[0].airCanisterUntil,0);
  assert.equal(race.racers[0].item,null);assert.equal(race.racers[0].boosting,false);
});

test('finishing clears reserve thrust even while other racers continue',()=>{
  const {race,player}=setup();
  player.controller.step((FINISH_DEPTH-1)/TERMINAL_SPEED,idle,{fallSpeedMultiplier:1});
  race.useItem(0,false);race.step(0.1,idle,false);
  assert.ok(player.finishTime!==undefined);assert.equal(race.finished,false);
  assert.equal(player.airCanisterUntil,0);assert.equal(player.boostUntil,0);assert.equal(player.boosting,false);
  const landed=race.snapshot(player);
  race.step(0.1,idle,false,true);assert.deepEqual(race.snapshot(player),landed);
});

test('rivals use reserve thrust in clear air and save it while the route is dangerous',()=>{
  for(const danger of [false,true]){
    const race=new PracticeRace(false,()=>0.42),rival=race.racers[1];
    rival.controller.setFallSpeed(TERMINAL_SPEED);rival.item='airCanister';rival.boostFuel=BOOST_CAPACITY;
    const p=race.snapshot(rival).position;
    if(danger)race.obstacles=[{id:0,kind:'fridge',position:[p[0],-12,p[2]],rotation:[0,0,0],active:true,hitAt:-1}];
    race.step(1/120,idle,false);
    assert.equal(rival.danger,danger);
    assert.equal(rival.item,danger?'airCanister':null);
    assert.equal(rival.airCanisterUntil,danger?0:AIR_CANISTER_DURATION);
    assert.equal(rival.boostFuel,BOOST_CAPACITY);
  }
});

test('rivals wait out braking, slowing, flailing, and an existing reserve burst',()=>{
  for(const effect of ['brakeUntil','slowUntil','creationSlowUntil','flailUntil','airCanisterUntil'] as const){
    const race=new PracticeRace(false,()=>0.42),rival=race.racers[1];
    rival.controller=new FreefallController(36,0,0);rival.controller.setFallSpeed(TERMINAL_SPEED);
    rival.item='airCanister';rival.decision=Infinity;rival.target=[0,0];rival[effect]=0.5;
    race.step(0.1,idle,false);
    assert.equal(rival.item,'airCanister');
    race.elapsed=0.5;race.step(0.1,idle,false);
    assert.equal(rival.item,null);assert.equal(rival.airCanisterUntil,0.5+AIR_CANISTER_DURATION);
  }
});
