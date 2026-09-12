import test from 'node:test';
import assert from 'node:assert/strict';
import { proceduralFixtures, type CreationSpec } from '@sky/shared';
import { RaceCreationHost, raceCreationSpawnPosition } from './race-creation-host';
import { PracticeRace } from './practice-race';

const fixture=proceduralFixtures[0];
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup() {
  const race=new PracticeRace(false);
  let resolve!:(spec:CreationSpec)=>void,signal:AbortSignal|undefined,calls=0;
  const host=new RaceCreationHost(race,{kind:'audio',async start(){},async stop(){return {blob:new Blob(['audio']),captureMs:1000};},cancel(){}},
    {generateAudio:async(_recording,options)=>{calls++;signal=options.signal;options.onProgress('generating','Creating…',fixture.prompt);return new Promise(done=>{resolve=done;});}});
  const step=()=>{const from=race.snapshot(race.racers[0]).position;race.step(1/120,{x:0,z:0},false);host.step(1/120,from,race.snapshot(race.racers[0]).position);};
  host.start();
  for(let i=0;i<3000&&host.loop.getSnapshot().phase==='available';i++)step();
  assert.equal(host.loop.getSnapshot().phase,'prompted');assert.equal(host.voice,undefined);
  return {race,host,step,resolve:()=>resolve(fixture.spec),signal:()=>signal,calls:()=>calls};
}
test('main race keeps falling while generating, spawns from latest position, and applies effects only on collection',async()=>{
  const game=setup();game.host.loop.startRecording();await flush();const pending=game.host.loop.finishRecording();await flush();
  const before=game.race.snapshot(game.race.racers[0]).position[1];
  for(let i=0;i<120;i++)game.step();
  const current=game.race.snapshot(game.race.racers[0]);assert.ok(current.position[1]<before);
  game.resolve();await pending;
  assert.deepEqual(game.host.creation?.position,raceCreationSpawnPosition(current.position));
  assert.equal(game.race.racers[0].creationSlowUntil,0);
  for(let i=0;i<10000&&game.host.creation;i++)game.step();
  assert.equal(game.host.loop.getSnapshot().phase,'activated');assert.ok(game.race.racers[0].creationSlowUntil>game.race.elapsed);
  assert.equal(game.calls(),1);game.host.dispose();
});
for(const action of ['reset','pause','finish'] as const){
  test('main race '+action+' cancels active generation and discards a late creation',async()=>{
    const game=setup();game.host.loop.startRecording();await flush();const pending=game.host.loop.finishRecording();await flush();
    if(action==='reset'){game.race.reset();game.host.reset();}
    else if(action==='pause')game.host.pause();
    else {game.race.racers[0].finishTime=game.race.elapsed;game.step();}
    assert.ok(game.signal()?.aborted);game.resolve();await pending;assert.equal(game.host.creation,undefined);game.host.dispose();
  });
}
test('generated slow honors its multiplier and expiry without multiplying existing slow effects',()=>{
  const race=new PracticeRace(false);
  for(let i=0;i<1200;i++)race.step(1/120,{x:0,z:0},false);
  race.applyCreationEffects([{type:'reduceFallSpeed',multiplier:0.25,durationSeconds:4}]);
  race.racers[0].slowUntil=race.elapsed+4;
  for(let i=0;i<180;i++)race.step(1/120,{x:0,z:0},false);
  assert.ok(race.snapshot(race.racers[0]).fallSpeed<=7.51);
  assert.ok(race.snapshot(race.racers[0]).fallSpeed>4);
  for(let i=0;i<600;i++)race.step(1/120,{x:0,z:0},false);
  assert.ok(race.snapshot(race.racers[0]).fallSpeed>20);
});

test('race creations target the last 40 percent with a 300 m lead and safe late cutoff',()=>{
  assert.deepEqual(raceCreationSpawnPosition([12,-200,-8]),[12,-2160,-8]);
  assert.deepEqual(raceCreationSpawnPosition([12,-2400,-8]),[12,-2700,-8]);
  assert.deepEqual(raceCreationSpawnPosition([12,-3500,-8]),[12,-3540,-8]);
  assert.throws(()=>raceCreationSpawnPosition([0,-3520,0]),/finish is too close/);
});

test('voice star uses the forgiving box-sized swept pickup without collecting outside it',()=>{
  for(const offset of [3.4,3.6]){
    const race=new PracticeRace(false);
    const host=new RaceCreationHost(race,{async start(){},async stop(){return 'rubber duck';},cancel(){}});
    host.start();const [x,y,z]=host.voice!.position;
    host.step(1/120,[x+offset,y+20,z],[x+offset,y-20,z]);
    assert.equal(host.loop.getSnapshot().phase,offset<3.5?'prompted':'missed');
    host.dispose();
  }
});

test('generated pickup accepts a glancing high-speed crossing and applies effects only once',async()=>{
  const game=setup();game.host.loop.startRecording();await flush();
  const pending=game.host.loop.finishRecording();await flush();game.resolve();await pending;
  const [x,y,z]=game.host.creation!.position;
  game.host.step(1/120,[x+3.4,y+20,z],[x+3.4,y-20,z]);
  assert.equal(game.host.loop.getSnapshot().phase,'activated');
  assert.equal(game.host.creation,undefined);
  const expiry=game.race.racers[0].creationSlowUntil;
  game.race.elapsed+=1;
  game.host.step(1/120,[x,y+20,z],[x,y-20,z]);
  assert.equal(game.race.racers[0].creationSlowUntil,expiry);
  game.host.dispose();
});
