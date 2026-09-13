import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAFETY_DRILL_LIMITS, RACE_EVENT_LIMITS, type EventRacer, type EventVector, type RacerSegment } from '@sky/shared';
import { BuddyDrill, BUDDY_LIMITS } from './buddy-drill';
import { ReconstructionDrill, RECONSTRUCTION_LIMITS } from './reconstruction-drill';
import { ObservationDrill, OBSERVATION_LIMITS } from './observation-drill';
import { insideObservationCone } from './drill-mechanics';
import { add, scale, length } from './math';

const racer=(id:string,position:EventVector=[0,0,0],velocity:EventVector=[0,-30,0]):EventRacer=>({id,position,velocity,finished:false});
const stationary=(racers:readonly EventRacer[]):RacerSegment[]=>racers.map(racer=>({id:racer.id,from:racer.position,to:racer.position}));

test('buddy pairing is deterministic, capped, and nearest versus crossfield changes the partners',()=>{
  const racers=[racer('a',[-15,0,0]),racer('b',[-8,0,0]),racer('c',[8,0,0]),racer('d',[15,0,0])];
  const nearest=new BuddyDrill({family:'buddy',pairing:'nearest',tether:'elastic'},1,racers);
  const reordered=new BuddyDrill({family:'buddy',pairing:'nearest',tether:'elastic'},1,[...racers].reverse());
  const crossfield=new BuddyDrill({family:'buddy',pairing:'crossfield',tether:'elastic'},1,racers);
  const pairs=(drill:BuddyDrill)=>drill.getSnapshot().tethers!.map(tether=>tether.racerIds);
  assert.deepEqual(pairs(nearest),[['a','b'],['c','d']]);
  assert.deepEqual(nearest.getSnapshot(),reordered.getSnapshot());
  assert.deepEqual(pairs(crossfield),[['a','d'],['b','c']]);
  const before=pairs(crossfield);
  crossfield.prepareStep(2,1/120,racers.map(racer=>({...racer,position:[-racer.position[0],0,0]})));
  assert.deepEqual(pairs(crossfield),before,'racer movement does not silently reassign buddies');
  const many=Array.from({length:80},(_,index)=>racer(String(index),[index%30,0,0]));
  assert.equal(new BuddyDrill({family:'buddy',pairing:'nearest',tether:'elastic'},2,many).getSnapshot().tethers!.length,BUDDY_LIMITS.maxPairs);
});

test('buddy selection follows horizontal lanes while preserving its vertical pairing limit',()=>{
  const racers=[racer('a',[0,0,0]),racer('b',[20,0,0]),racer('c',[1,-75,0]),racer('d',[31,-100,0])];
  const nearest=new BuddyDrill({family:'buddy',pairing:'nearest',tether:'elastic'},1,racers);
  const crossfield=new BuddyDrill({family:'buddy',pairing:'crossfield',tether:'elastic'},1,racers);
  assert.deepEqual(nearest.getSnapshot().tethers![0].racerIds,['a','c']);
  assert.deepEqual(crossfield.getSnapshot().tethers![0].racerIds,['a','b'],
    'crossfield picks the other lane, not the vertically distant same-lane racer or an ineligible racer');
  assert.ok(crossfield.prepareStep(1.2,1/120,racers).a.acceleration[0]>0,
    'the crossfield assignment creates an actual horizontal interaction');
  assert.deepEqual(nearest.prepareStep(1.2,1/120,racers).a.acceleration,[0,0,0]);
  assert.equal(BUDDY_LIMITS.maxPairs,SAFETY_DRILL_LIMITS.maxTethers);
});

test('buddy forces are balanced and bounded, honor visible slack, and release finished or distant racers',()=>{
  const racers=[racer('creator',[-20,0,0]),racer('rival',[20,0,0])];
  const elastic=new BuddyDrill({family:'buddy',pairing:'nearest',tether:'elastic'},2,racers);
  const pulsing=new BuddyDrill({family:'buddy',pairing:'nearest',tether:'pulsing'},2,racers);
  assert.deepEqual(elastic.prepareStep(0.5,1/120,racers).creator.acceleration,[0,0,0]);
  assert.equal(elastic.getSnapshot().tethers![0].active,false);
  const pull=elastic.prepareStep(1.2,1/120,racers),slack=pulsing.prepareStep(1.2,1/120,racers);
  assert.ok(pull.creator.acceleration[0]>0);
  assert.deepEqual(add(pull.creator.acceleration,pull.rival.acceleration),[0,0,0]);
  assert.ok(length(pull.creator.acceleration)<=RACE_EVENT_LIMITS.maxAcceleration);
  assert.deepEqual(slack.creator.acceleration,[0,0,0]);assert.equal(pulsing.getSnapshot().tethers![0].active,false);
  assert.ok(pulsing.prepareStep(2,1/120,racers).creator.acceleration[0]>0);
  assert.ok(pulsing.getImpact().tetherSeconds.creator>0);
  elastic.prepareStep(2,1/120,[racers[0],{...racers[1],finished:true}]);
  assert.equal(elastic.getSnapshot().tethers!.length,0);
  assert.deepEqual(elastic.prepareStep(3,1/120,racers).creator.acceleration,[0,0,0],'released pairs never reattach');
  const distant=new BuddyDrill({family:'buddy',pairing:'nearest',tether:'elastic'},2,racers);
  distant.prepareStep(2,1/120,[racers[0],racer('rival',[0,-500,0])]);
  assert.equal(distant.getSnapshot().tethers!.length,0);
  assert.deepEqual(pulsing.prepareStep(10,1/120,racers).creator.acceleration,[0,0,0]);
});

function recordPath(drill:ReconstructionDrill,until=2) {
  for(let tick=0;tick<=Math.round(until*120);tick++) {
    const age=tick/120;drill.prepareStep(age,1/120,[racer('creator',[6+age*2,-age*30,4])]);
  }
}

test('reconstruction uses delayed real paths, warning ghosts, and frozen positions with distinct mirror and burst variants',()=>{
  const start=[racer('creator',[6,0,4])];
  const trail=new ReconstructionDrill({family:'reconstruction',pattern:'trail',cadence:'steady'},9,start);
  const mirror=new ReconstructionDrill({family:'reconstruction',pattern:'mirror',cadence:'steady'},9,start);
  const bursts=new ReconstructionDrill({family:'reconstruction',pattern:'trail',cadence:'bursts'},9,start);
  for(const drill of [trail,mirror,bursts])recordPath(drill);
  const actors=trail.getSnapshot().actors,reflected=mirror.getSnapshot().actors;
  assert.ok(actors.length>0);assert.ok(actors.every(actor=>actor.kind==='echo'&&actor.state==='warning'));
  assert.ok(actors.every(actor=>actor.position[1]<-60),'replicas appear ahead of the current falling player');
  assert.equal(reflected[0].position[0],-actors[0].position[0]);assert.equal(reflected[0].position[2],-actors[0].position[2]);
  assert.ok(bursts.getSnapshot().actors.length>actors.length);
  const burstPoints=bursts.getSnapshot().actors.map(actor=>JSON.stringify(actor.position));
  assert.equal(new Set(burstPoints).size,burstPoints.length,'a single source never creates stacked duplicate hazards in a burst');
  const collider=racer('other',actors[0].position,[0,0,0]);
  assert.equal(trail.resolveContacts(stationary([collider]),[collider]).size,0,'new echoes remain harmless during their visible warning');
  trail.prepareStep(2.1,1/120,[racer('creator',[29,-400,28])]);
  assert.deepEqual(trail.getSnapshot().actors.map(actor=>actor.position),actors.map(actor=>actor.position),'replayed paths never follow the source');
});

test('reconstruction contacts respect swept finish fractions, protection, and once-per-echo bookkeeping',()=>{
  const drill=new ReconstructionDrill({family:'reconstruction',pattern:'trail',cadence:'steady'},1,[racer('creator')]);
  recordPath(drill);drill.prepareStep(2.8,1/120,[]);
  const actor=drill.getSnapshot().actors[0];assert.equal(actor.state,'moving');
  const from=add(actor.position,[0,12,0]),to=add(actor.position,[0,-12,0]);
  const early=racer('early',from),protectedRacer={...racer('protected',from),protected:true},exposed=racer('exposed',from);
  const segments=[{id:'early',from,to,endFraction:0.1},{id:'protected',from,to},{id:'exposed',from,to}];
  const impulses=drill.resolveContacts(segments,[early,protectedRacer,exposed]);
  assert.equal(impulses.has('early'),false);assert.equal(impulses.has('protected'),false);assert.ok(impulses.has('exposed'));
  assert.ok(length(impulses.get('exposed')!)<=RACE_EVENT_LIMITS.maxVelocityDelta);
  const before=drill.getImpact();
  assert.ok(before.blockedCollisions.protected>=1);assert.ok(before.collisions.exposed>=1);
  drill.resolveContacts(segments,[early,protectedRacer,exposed]);assert.deepEqual(drill.getImpact(),before);
});

test('reconstruction bounds repeated history-driven emissions and drops finished sources and expired echoes',()=>{
  const racers=Array.from({length:80},(_,index)=>racer(String(index),[index%10,0,index%6]));
  const drill=new ReconstructionDrill({family:'reconstruction',pattern:'trail',cadence:'bursts'},21,racers);
  for(let tick=0;tick<=1080;tick++) {
    const age=tick/120;
    drill.prepareStep(age,1/120,racers.map(racer=>({...racer,position:[racer.position[0],-Math.min(age*20,150),racer.position[2]]})));
    assert.ok(drill.getSnapshot().actors.length<=SAFETY_DRILL_LIMITS.maxActors);
  }
  drill.prepareStep(10,1/120,racers);assert.equal(drill.getSnapshot().actors.length,0);
  const finished=new ReconstructionDrill({family:'reconstruction',pattern:'trail',cadence:'steady'},1,[racer('creator')]);
  recordPath(finished);const emitted=finished.getImpact().reactions;
  for(let tick=241;tick<=800;tick++)finished.prepareStep(tick/120,1/120,[{...racer('creator'),finished:true}]);
  assert.equal(finished.getImpact().reactions,emitted);assert.equal(finished.getSnapshot().actors.length,0);
  assert.ok(RECONSTRUCTION_LIMITS.maxSources*RECONSTRUCTION_LIMITS.samplesPerSource<=192);
});

function watch(drill:ObservationDrill,duration:number,velocity:EventVector=[6,-30,0],protectedRacer=false) {
  let total=0;
  for(let tick=0;tick<Math.ceil(duration*120);tick++) {
    const age=1+tick/120;
    const observer=drill.getSnapshot().observers![0];
    const position=add(observer.position,scale(observer.direction,25));
    const watched={...racer('watched',position,velocity),protected:protectedRacer};
    drill.prepareStep(age,1/120,[watched]);
    total+=drill.resolveContacts(stationary([watched]),[watched]).size;
  }
  return total;
}

test('observation cones are deterministic and bounded; warning and ordinary straight descent cause no penalty',()=>{
  const recipe={family:'observation',scan:'sweep',temperament:'strict'} as const;
  const racers=Array.from({length:30},(_,index)=>racer(String(index),[0,-index*300,0]));
  const drill=new ObservationDrill(recipe,1,racers),same=new ObservationDrill(recipe,1,[...racers].reverse());
  assert.deepEqual(drill.getSnapshot(),same.getSnapshot());assert.equal(drill.getSnapshot().observers!.length,OBSERVATION_LIMITS.maxObservers);
  drill.prepareStep(0.5,1/120,[]);const observer=drill.getSnapshot().observers![0];
  const moving=racer('watched',add(observer.position,scale(observer.direction,30)),[20,-30,0]);
  assert.equal(observer.warning,true);assert.equal(observer.watching,false);
  assert.equal(drill.resolveContacts(stationary([moving]),[moving]).size,0);
  const stationaryDrill=new ObservationDrill(recipe,1,[racer('watched')]);
  assert.equal(watch(stationaryDrill,1,[0,-70,0]),0);
  assert.deepEqual(stationaryDrill.getImpact().observationFlags,{});
});

test('observation strictness changes actual grace; exposed lateral movement is penalized once per cooldown and protection blocks it',()=>{
  const strict=new ObservationDrill({family:'observation',scan:'alternating',temperament:'strict'},1,[racer('watched')]);
  const patient=new ObservationDrill({family:'observation',scan:'alternating',temperament:'patient'},1,[racer('watched')]);
  assert.equal(watch(strict,0.2),1);assert.equal(watch(patient,0.2),0,'patient gives more time to stop steering');
  const cooldown=new ObservationDrill({family:'observation',scan:'alternating',temperament:'strict'},1,[racer('watched')]);
  assert.equal(watch(cooldown,1),1);assert.equal(cooldown.getImpact().observationFlags.watched,1);
  const protectedDrill=new ObservationDrill({family:'observation',scan:'sweep',temperament:'strict'},1,[racer('watched')]);
  assert.equal(watch(protectedDrill,0.5,[7,-30,0],true),0);assert.equal(protectedDrill.getImpact().blockedObservations.watched,1);
});

test('observation uses the visible finite cone, swept contacts, and finish clipping; scan variants move differently',()=>{
  const drill=new ObservationDrill({family:'observation',scan:'alternating',temperament:'strict'},3,[racer('watched')]);
  drill.prepareStep(1.1,0.2,[]);const observer=drill.getSnapshot().observers![0];
  const inside=add(observer.position,scale(observer.direction,30)),beyond=add(observer.position,scale(observer.direction,observer.range+1));
  assert.equal(insideObservationCone(inside,observer),true);assert.equal(insideObservationCone(beyond,observer),false);
  const from=add(observer.position,scale(observer.direction,-20)),to=add(observer.position,scale(observer.direction,40));
  const early=racer('early',from,[8,-30,0]),crossing=racer('crossing',from,[8,-30,0]);
  const kicks=drill.resolveContacts([{id:'early',from,to,endFraction:0.1},{id:'crossing',from,to}],[early,crossing]);
  assert.equal(kicks.has('early'),false);assert.equal(kicks.has('crossing'),true);
  assert.ok(length(kicks.get('crossing')!)<=RACE_EVENT_LIMITS.maxVelocityDelta);
  const sweep=new ObservationDrill({family:'observation',scan:'sweep',temperament:'strict'},3,[racer('watched')]);
  sweep.prepareStep(1.1,1/120,[]);assert.notDeepEqual(sweep.getSnapshot().observers![0].direction,observer.direction);
  drill.prepareStep(10,1/120,[crossing]);assert.equal(drill.resolveContacts(stationary([crossing]),[crossing]).size,0);
  assert.ok(drill.getSnapshot().observers!.every(observer=>!observer.watching));
});


test('boosted racers still receive a warning and approach gap before reaching reconstructed paths',()=>{
  const drill=new ReconstructionDrill({family:'reconstruction',pattern:'trail',cadence:'steady'},2,[racer('creator')]);
  for(let tick=0;tick<=240;tick++) {
    const age=tick/120;drill.prepareStep(age,1/120,[racer('creator',[5,-60*age,0],[0,-60,0])]);
  }
  const echoes=drill.getSnapshot().actors;assert.ok(echoes.length>0);
  for(const echo of echoes)assert.ok(-120-echo.position[1]>60*RECONSTRUCTION_LIMITS.warningSeconds,
    'the recorded velocity supplies enough lead for the complete warning');
});
