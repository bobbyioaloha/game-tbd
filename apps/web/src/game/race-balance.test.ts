import test from 'node:test';
import assert from 'node:assert/strict';
import { itemForPlace, RivalDodgeReaction } from './race-balance';
import { PracticeRace, type Projectile } from './practice-race';
import { FreefallController } from './freefall-controller';

const shot=(id=1):Projectile=>({id,owner:0,target:1,position:[0,-20,0],velocity:[0,0,0],expires:8});
test('placement odds match the agreed percentages across the entire random range',()=>{
  const expected=[{umbrella:10,sun:35,cloak:55},{umbrella:20,sun:50,cloak:30},{umbrella:45,sun:40,cloak:15},{umbrella:65,sun:25,cloak:10}];
  for(let place=1;place<=4;place++){
    const count={umbrella:0,sun:0,cloak:0};
    for(let i=0;i<100;i++)count[itemForPlace(place,(i+0.5)/100)]++;
    assert.deepEqual(count,expected[place-1]);
  }
});
test('the same collection roll favors jellyfish at the back for players and rivals',()=>{
  for(const owner of [0,1])for(const place of [1,4]){
    const race=new PracticeRace(false,()=>0);
    const others=race.racers.map(r=>r.id).filter(id=>id!==owner);
    const order=place===1?[owner,...others]:[...others,owner];
    order.forEach((id,index)=>{
      const racer=race.racers[id];
      racer.controller=new FreefallController(36,-24+id*16,0);
      racer.controller.step(4-index,{x:0,z:0},{fallSpeedMultiplier:1});
      racer.decision=Infinity;racer.nextUse=Infinity;racer.target=[-24+id*16,0];
    });
    assert.equal(race.order().findIndex(r=>r.id===owner)+1,place);
    race.boxes=[{id:0,position:race.snapshot(race.racers[owner]).position,active:true}];
    race.step(1/120,{x:0,z:0},false);
    assert.equal(race.boxes[0].active,false);
    assert.equal(race.racers[owner].item,place===1?'sun':'umbrella');
  }
});
test('rivals wait for their reaction time and only dodge once per projectile',()=>{
  const reaction=new RivalDodgeReaction(),shots=[shot()];
  assert.equal(reaction.update(1,[0,0,0],shots,0,0,()=>0),false);
  assert.equal(reaction.update(1,[0,0,0],shots,0.17,0,()=>{throw Error('rerolled');}),false);
  assert.equal(reaction.update(1,[0,0,0],shots,0.18,0,()=>{throw Error('rerolled');}),true);
  assert.equal(reaction.update(1,[0,0,0],shots,0.5,0,()=>{throw Error('rerolled');}),false);
});
test('a failed reaction does not reroll when a threat leaves and reenters detection range',()=>{
  const reaction=new RivalDodgeReaction(),shots=[shot()];
  reaction.update(1,[0,0,0],shots,0,0,()=>0.9);
  reaction.update(1,[100,0,0],shots,0.1,0,()=>{throw Error('rerolled');});
  for(let tick=0;tick<500;tick++)assert.equal(reaction.update(1,[0,0,0],shots,0.4+tick/120,0,()=>{throw Error('rerolled');}),false);
});
test('rivals cannot dodge during cooldown or react to expired/untargeted shots',()=>{
  const reaction=new RivalDodgeReaction(),shots=[shot()];
  reaction.update(1,[0,0,0],shots,0,15,()=>0);
  assert.equal(reaction.update(1,[0,0,0],shots,0.4,15,()=>0),false);
  assert.equal(reaction.update(1,[0,0,0],[{...shot(2),expires:0},{...shot(3),target:undefined}],1,0,()=>{throw Error('invalid threat');}),false);
});
test('rival reactions attempt 55 percent of new shots and recognize replacement threats',()=>{
  let dodges=0;
  const reaction=new RivalDodgeReaction();
  for(let i=0;i<100;i++){
    let draws=0;const random=()=>draws++===0?0.5:(i+0.5)/100;
    const shots=[shot(i)];
    reaction.update(1,[0,0,0],shots,0,0,random);
    if(reaction.update(1,[0,0,0],shots,0.36,0,random))dodges++;
  }
  assert.equal(dodges,55);
});
