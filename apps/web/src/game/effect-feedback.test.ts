import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RACE_EVENT_LIMITS, SAFETY_DRILL_LIMITS, raceEventFixtures, safetyDrillFixtures,
  type DrillActor, type DrillCurrent, type DrillSnapshot, type EventRacer,
  type EventVector, type RaceEncounter, type RaceEventSnapshot, type SafetyDrillRecipe,
} from '@sky/shared';
import { SafetyDrillRuntime } from '../race-events/drill-runtime';
import { effectFeedback } from './effect-feedback';

const origin:EventVector=[0,0,0];
const racers:EventRacer[]=[
  {id:'0',position:origin,velocity:[0,-30,0],finished:false},
  {id:'1',position:[16,0,0],velocity:[0,-30,0],finished:false},
];
const recipe=(family:SafetyDrillRecipe['family'])=>safetyDrillFixtures.find(item=>item.spec.drill.family===family)!.spec;
function snapshot(spec:RaceEncounter,drill?:DrillSnapshot):RaceEventSnapshot {
  return {phase:'active',instance:{instanceId:'feedback',creatorId:'0',spec,position:origin,seed:1},position:origin,
    elapsedSeconds:2,remainingSeconds:8,radius:0,debris:[],affectedRacerIds:[],drill};
}
const drill=(fields:Partial<DrillSnapshot>={}):DrillSnapshot=>({actors:[],currents:[],warningSeconds:0,...fields});
const actor=(fields:Partial<DrillActor>={}):DrillActor=>({id:0,position:[0,-12,0],radius:2.2,velocity:[0,0,0],state:'moving',...fields});
function current(kind:DrillCurrent['kind'],id=0):DrillCurrent {
  return {id,bandId:0,pathId:0,position:[0,-5,0],from:[0,0,0],to:[0,-10,0],radius:4,direction:kind==='eddy'?[0,1,0]:[0,-1,0],kind,strength:20};
}

test('every free drill and legacy effect explains an action before any impact',()=>{
  for(const item of safetyDrillFixtures) {
    const runtime=new SafetyDrillRuntime(item.spec.drill,1,racers);
    const event=snapshot(item.spec,runtime.getSnapshot());
    assert.equal(event.impact,undefined);
    const cue=effectFeedback(event,origin);
    assert.ok(cue,item.spec.id);
    assert.ok(cue.title.length&&cue.detail.length,item.spec.id);
    assert.ok(cue.controls,item.spec.id);
    assert.equal(cue.tone,'warning',item.spec.id);
    runtime.prepareStep(2,1/120,racers);
    assert.ok(effectFeedback(snapshot(item.spec,runtime.getSnapshot()),origin),item.spec.id);
  }
  for(const item of raceEventFixtures) {
    const cue=effectFeedback(snapshot(item.spec),origin);
    assert.ok(cue?.title&&cue.detail&&cue.controls,item.spec.id);
  }
});

test('inactive, missing, reset and expired events never retain instructions',()=>{
  const event=snapshot(recipe('pinball'),drill());
  for(const phase of ['empty','collectible','expired'] as const)assert.equal(effectFeedback({...event,phase},origin),null);
  assert.equal(effectFeedback({...event,instance:undefined},origin),null);
});

test('charge cues use nearby committed telegraphs, not reactions elsewhere in the race',()=>{
  const spec=recipe('stampede');
  const local=actor({state:'warning',telegraph:{from:[0,-12,0],to:[0,8,0]}});
  assert.match(effectFeedback(snapshot(spec,drill({actors:[local]})),origin)!.title,/DIRECTION LOCKED/);
  assert.doesNotMatch(effectFeedback(snapshot(spec,drill({actors:[local]})),origin)!.detail,/aim(?:ed|ing) at you/i);
  const far=actor({state:'warning',position:[0,-1000,0],telegraph:{from:[0,-1000,0],to:[0,-980,0]}});
  assert.match(effectFeedback(snapshot(spec,drill({actors:[far]})),origin)!.title,/BAIT A CHARGE/);
  assert.match(effectFeedback(snapshot(spec,drill({actors:[actor({state:'warning'})]})),origin)!.title,/BAIT A CHARGE/);
  assert.equal(effectFeedback(snapshot(spec,drill({actors:[{...local,state:'charging'}]})),origin)!.tone,'danger');
  assert.match(effectFeedback(snapshot(spec,drill({actors:[local],warningSeconds:0.5})),origin)!.title,/BAIT A CHARGE/);
});

test('scatter guidance follows warning and opening without attributing another racer reaction to you',()=>{
  const spec=safetyDrillFixtures.find(item=>item.spec.drill.family==='stampede'&&item.spec.drill.reaction==='scatter')!.spec;
  const warning=actor({state:'warning',telegraph:{from:[0,-12,0],to:[20,-12,0]}});
  assert.match(effectFeedback(snapshot(spec,drill({actors:[warning]})),origin)!.title,/ABOUT TO SCATTER/);
  assert.match(effectFeedback(snapshot(spec,drill({actors:[{...warning,state:'scattering'}]})),origin)!.title,/FIND THE GAP/);
  assert.match(effectFeedback(snapshot(spec,drill()),origin)!.detail,/warn, then scatter/);
});

test('draft feedback follows exact wake capsules including end caps and warning state',()=>{
  const spec=safetyDrillFixtures.find(item=>item.spec.drill.family==='stampede'&&item.spec.drill.modifier==='draft')!.spec;
  const wake={from:[0,0,0] as const,to:[0,-10,0] as const,position:[0,-5,0] as const,radius:4};
  const body=actor({wake});
  const event=snapshot(spec,drill({actors:[body]}));
  for(const point of [[4,-5,0],[0,4,0],[0,-14,0]] as const)assert.equal(effectFeedback(event,point)!.tone,'benefit');
  for(const point of [[4.01,-5,0],[0,4.01,0],[0,-14.01,0]] as const)assert.equal(effectFeedback(event,point)!.tone,'neutral');
  assert.equal(effectFeedback(snapshot(spec,drill({actors:[{...body,state:'warning'}]})),origin)!.tone,'neutral');
  assert.equal(effectFeedback(snapshot(spec,drill({actors:[body],warningSeconds:0.1})),origin)!.tone,'warning');
});

test('rapids match capsule bounds, eddy-fast-flow priority, and actual nonzero force',()=>{
  const spec=recipe('rapids'),flow=current('flow',0),fast=current('fast',1),eddy=current('eddy',2);
  const feedback=(currents:DrillCurrent[],point:EventVector=origin)=>effectFeedback(snapshot(spec,drill({currents})),point)!;
  assert.match(feedback([flow,fast,eddy]).title,/EDDY/);
  assert.match(feedback([flow,fast]).title,/FAST CURRENT/);
  assert.match(feedback([flow]).title,/RIDING THE CURRENT/);
  assert.equal(feedback([flow],[0,4,0]).tone,'benefit');
  assert.equal(feedback([flow],[0,4.001,0]).tone,'neutral');
  assert.equal(feedback([flow],[4.001,-5,0]).tone,'neutral');
  assert.equal(feedback([{...flow,to:flow.from}],origin).tone,'benefit','zero-length segment has spherical bounds');
  assert.equal(feedback([{...flow,strength:0}]).tone,'neutral');
  assert.equal(feedback([{...eddy,strength:0},fast]).tone,'neutral','a lower priority overlapping current is not independently applied');
  assert.equal(feedback([{...flow,strength:0},{...flow,id:4}]).tone,'neutral','same kind chooses the lowest id');
  assert.equal(effectFeedback(snapshot(spec,drill({currents:[flow],warningSeconds:1})),origin)!.tone,'warning');
});

test('buddy guidance follows the local pairing, pull, slack and permanent release',()=>{
  const spec=recipe('buddy'),runtime=new SafetyDrillRuntime(spec.drill,1,racers);
  const read=()=>effectFeedback(snapshot(spec,runtime.getSnapshot()),origin)!;
  assert.match(read().title,/LINK INCOMING/);
  runtime.prepareStep(2,1/120,racers);
  assert.match(read().title,/TETHER PULLING/);
  assert.ok(read().meter!.value>0&&read().meter!.value<=1);
  assert.match(effectFeedback(snapshot(spec,runtime.getSnapshot()),origin,'unpaired')!.title,/NO BUDDY TETHER/);
  runtime.prepareStep(2.1,1/120,[racers[0],{...racers[1],position:[4,0,0]}]);
  assert.match(read().title,/NO PULL/);
  runtime.prepareStep(2.2,1/120,[racers[0],{...racers[1],finished:true}]);
  assert.match(read().title,/NO BUDDY TETHER/);
  assert.equal(read().meter,undefined);
  const tether={id:0,racerIds:['0','1'] as const,from:origin,to:[16,0,0] as const,restLength:8,tension:0,active:false};
  assert.match(effectFeedback(snapshot(spec,drill({tethers:[tether]})),origin)!.title,/SLACK PHASE/);
  assert.equal(effectFeedback(snapshot(spec,drill({tethers:[{...tether,active:true,tension:1.01}]})),origin)!.meter!.value,1);
});

test('orbit presence uses a finite active cylinder and never invents capture or release state',()=>{
  const spec=recipe('orbit'),field={id:0,position:origin,radius:20,coreRadius:4,height:180,direction:1 as const,active:true};
  const event=snapshot(spec,drill({orbits:[field]}));
  for(const point of [[20,0,0],[0,90,0],[0,-90,0],origin] as const)assert.match(effectFeedback(event,point)!.title,/INSIDE/);
  for(const point of [[20.001,0,0],[0,90.001,0],[0,-90.001,0]] as const)assert.doesNotMatch(effectFeedback(event,point)!.title,/INSIDE/);
  assert.doesNotMatch(effectFeedback(snapshot(spec,drill({orbits:[{...field,active:false}]})),origin)!.title,/INSIDE/);
  assert.match(effectFeedback(event,origin)!.detail,/If the orbit/);
});

test('reconstruction warns about relevant ahead copies while keeping frozen placement explicit',()=>{
  const spec=recipe('reconstruction'),copy=actor({kind:'echo',state:'warning',position:[0,-70,0]});
  const feedback=(actors:DrillActor[])=>effectFeedback(snapshot(spec,drill({actors})),origin)!;
  assert.match(feedback([copy]).title,/FORMING AHEAD/);
  assert.match(feedback([copy]).detail,/stay fixed/);
  assert.match(feedback([{...copy,state:'moving'}]).title,/COPIES AHEAD/);
  for(const position of [[0,100,0],[0,-SAFETY_DRILL_LIMITS.bandLengthMeters-1,0],[SAFETY_DRILL_LIMITS.approachRadius+1,-70,0]] as const)
    assert.match(feedback([{...copy,position}]).title,/RECENT PATHS/);
});

test('inspection reuses measured exposure and release controls only while warning or watched',()=>{
  const local={watching:true,warning:false,moving:true,exposureFraction:0.63,cooldownSeconds:0,protected:false,penaltyBlocked:false};
  const event=snapshot(recipe('observation'),drill({observations:{'0':local}}));
  const feedback=effectFeedback(event,origin)!;
  assert.equal(feedback.tone,'danger');
  assert.equal(feedback.meter!.value,0.63);
  assert.match(feedback.meter!.label,/PENALTY BUILDING/);
  for(const state of [{...local,protected:true},{...local,cooldownSeconds:1},{...local,cooldownSeconds:1,penaltyBlocked:true}]) {
    const cue=effectFeedback({...event,drill:drill({observations:{'0':state}})},origin)!;
    assert.equal(cue.meter,undefined,'protection and cooldown never show a reset exposure meter');
    assert.equal(cue.controls!.action,'release-steering');
  }
  const steady=effectFeedback({...event,drill:drill({observations:{'0':{...local,moving:false,exposureFraction:0}}})},origin)!;
  assert.equal(steady.tone,'warning');
  assert.match(steady.meter!.label,/STRAIGHT FALL · NO PENALTY/);
  assert.equal(feedback.controls!.action,'release-steering');
  event.drill=drill({observations:{'0':{...local,watching:false}}});
  assert.equal(effectFeedback(event,origin)!.meter,undefined);
  assert.equal(effectFeedback(event,origin)!.controls!.action,'steer');
});

test('legacy field boundaries and visible collidable rocks determine current guidance',()=>{
  const legacy=(type:typeof raceEventFixtures[number]['spec']['effect']['type'])=>raceEventFixtures.find(item=>item.spec.effect.type===type)!.spec;
  const gravity=legacy('gravityWell'),safe=legacy('protectiveZone');
  assert.equal(gravity.effect.type,'gravityWell');
  assert.equal(safe.effect.type,'protectiveZone');
  if(gravity.effect.type!=='gravityWell'||safe.effect.type!=='protectiveZone')throw new Error('Expected field fixtures');
  const center:EventVector=[10,25,0];
  assert.match(effectFeedback({...snapshot(gravity),position:center},[10+gravity.effect.radiusMeters,25,0])!.title,/OUTSIDE/);
  assert.equal(effectFeedback({...snapshot(safe),position:center},[10,25+safe.effect.radiusMeters,0])!.tone,'benefit');
  assert.equal(effectFeedback({...snapshot(safe),position:center},[10,25+safe.effect.radiusMeters+0.01,0])!.tone,'neutral');
  const noBoost={...safe,effect:{...safe.effect,descentAcceleration:0}};
  assert.doesNotMatch(effectFeedback(snapshot(noBoost),origin)!.detail,/faster/);
  const debris=snapshot(legacy('debrisShower'));
  debris.debris=[{id:0,position:[0,24,0],collidable:false}];
  assert.equal(effectFeedback(debris,origin)!.tone,'warning');
  debris.debris=[{...debris.debris[0],collidable:true}];
  assert.equal(effectFeedback(debris,origin)!.tone,'danger');
  debris.debris=[{...debris.debris[0],position:[0,-10,0]}];
  assert.equal(effectFeedback(debris,origin)!.tone,'warning');
  debris.debris=[{...debris.debris[0],position:[RACE_EVENT_LIMITS.debrisRadius+RACE_EVENT_LIMITS.racerRadius+4.01,20,0]}];
  assert.equal(effectFeedback(debris,origin)!.tone,'warning');
});

test('cumulative impacts cannot produce stale hits, rewards, drafting, pull or escape claims',()=>{
  for(const item of [...safetyDrillFixtures,...raceEventFixtures]) {
    const event=snapshot(item.spec,drill());
    const before=effectFeedback(event,origin);
    event.affectedRacerIds=['0'];
    event.impact={participants:['0'],affectedRacerIds:['0'],impulseCounts:{'0':4},debrisHits:{'0':3},blockedDebrisHits:{'0':2},obstacleBlocks:{'0':8},
      drill:{collisions:{'0':4},blockedCollisions:{'0':3},draftSeconds:{'0':2},currentSeconds:{'0':3},reactions:7,
        bounces:{'0':3},tetherSeconds:{'0':5},orbitSeconds:{'0':3},orbitReleases:{'0':2},observationFlags:{'0':2},blockedObservations:{'0':1}}};
    assert.deepEqual(effectFeedback(event,origin),before,item.spec.id);
  }
});

test('a steady convoy without draft explains descent instead of crossing traffic',()=>{
  const spec=recipe('stampede');
  const convoy={...spec,drill:{family:'stampede',formation:'convoy',direction:'right',reaction:'steady',modifier:'none'} as const};
  const cue=effectFeedback(snapshot(convoy,drill()),origin)!;
  assert.match(cue.title,/CONVOY/);
  assert.match(cue.detail,/descends together/);
  assert.doesNotMatch(cue.detail,/cross the course|Cyan wake/);
});
