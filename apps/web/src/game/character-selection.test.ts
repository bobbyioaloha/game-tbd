import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, raceLineup } from './characters';
import { PracticeRace } from './practice-race';

for(const player of ['greg','linda','steve'] as const){
  test(`${player}: selection, race and restart preserve a unique roster and player identity`,()=>{
    const race=new PracticeRace(false,()=>.5);
    const controllers=race.racers.map(racer=>racer.controller);
    const obstacles=race.obstacles;
    race.selectCharacter(player);
    assert.equal(race.obstacles,obstacles);
    assert.deepEqual(race.racers.map(racer=>racer.controller),controllers);
    const expected=raceLineup(player);
    assert.equal(race.racers[0].model,player);
    assert.equal(new Set(race.racers.map(racer=>racer.name)).size,4);
    assert.deepEqual(race.racers.map(racer=>racer.name),expected.map(person=>person.name));
    for(const standing of race.standings()){
      assert.equal(standing.name,expected[standing.id].name);
      assert.equal(standing.color,expected[standing.id].color);
    }
    const baseline=new PracticeRace(false,()=>.5);
    for(let tick=0;tick<120;tick++){
      race.step(1/120,{x:1,z:0},false,false);
      baseline.step(1/120,{x:1,z:0},false,false);
    }
    assert.deepEqual(race.snapshot(race.racers[0]),baseline.snapshot(baseline.racers[0]));
    assert.throws(()=>race.selectCharacter('greg'),/Reset/);
    race.reset();
    assert.equal(race.elapsed,0);
    assert.equal(race.racers[0].model,player);
    assert.deepEqual(race.racers.map(racer=>racer.name),expected.map(person=>person.name));
    assert.equal(race.racers[3].name,'Susan');
    assert.equal(race.racers[3].model,null);
  });
}
test('all completed dinosaurs are playable and Susan remains unavailable',()=>{
  assert.deepEqual(CHARACTERS.filter(character=>character.ready).map(character=>character.id),['greg','linda','steve']);
});
