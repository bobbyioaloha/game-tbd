import test from 'node:test';
import assert from 'node:assert/strict';
import { safetyDrillFixtures, type DrillObservation, type RaceEventSnapshot } from '@sky/shared';
import { observationFeedback } from './observation-feedback';

const spec=safetyDrillFixtures.find(item=>item.spec.drill.family==='observation')!.spec;
const clear:DrillObservation={watching:false,warning:false,moving:false,exposureFraction:0,cooldownSeconds:0,protected:false,penaltyBlocked:false};
function snapshot(local:Partial<DrillObservation>={},warningSeconds=0):RaceEventSnapshot {
  return {phase:'active',instance:{instanceId:'inspection',creatorId:'0',spec,position:[0,0,0],seed:1},
    position:[0,0,0],elapsedSeconds:1,remainingSeconds:9,radius:0,debris:[],affectedRacerIds:[],
    drill:{actors:[],currents:[],warningSeconds,observations:{'0':{...clear,...local}},
      observers:[{id:0,position:[0,0,0],direction:[0,-1,0],range:85,cosHalfAngle:Math.cos(Math.PI/6),watching:true,warning:false}]}};
}

test('inspection explains incoming light and being watched before any recorded impact',()=>{
  assert.equal(observationFeedback(snapshot({},1))?.state,'warning');
  const watched=observationFeedback(snapshot({watching:true}));
  assert.equal(watched?.state,'watched');
  assert.equal(watched.watching,true);
  assert.equal(watched.exposureFraction,0);
  assert.match(watched.detail,/Keep steering released/);
  assert.equal(observationFeedback(snapshot({warning:true}))?.state,'warning');
});

test('inspection feedback follows measured movement and exposure, not cumulative hits',()=>{
  const moving=observationFeedback(snapshot({watching:true,moving:true,exposureFraction:0.5}));
  assert.equal(moving?.state,'moving');
  assert.equal(moving.exposureFraction,0.5);
  const recovered=snapshot({watching:true});
  recovered.impact={participants:['0'],affectedRacerIds:['0'],impulseCounts:{'0':1},debrisHits:{},blockedDebrisHits:{},obstacleBlocks:{}};
  assert.equal(observationFeedback(recovered)?.state,'watched');
  assert.equal(observationFeedback(snapshot({moving:true}))?.state,'clear','movement outside the light is allowed');
});

test('penalty and protection explain the actual outcome through cooldown, including after leaving the cone',()=>{
  assert.equal(observationFeedback(snapshot({cooldownSeconds:1}))?.state,'penalty');
  assert.equal(observationFeedback(snapshot({cooldownSeconds:1,penaltyBlocked:true}))?.state,'protected');
  assert.equal(observationFeedback(snapshot({watching:true,moving:true,protected:true}))?.state,'protected');
  assert.equal(observationFeedback(snapshot({watching:true,moving:true}))?.state,'moving');
});

test('steer-now feedback only appears for a rest phase; ended and unrelated events hide it',()=>{
  const resting=snapshot();
  resting.drill!.observers=resting.drill!.observers!.map(observer=>({...observer,watching:false}));
  assert.equal(observationFeedback(resting)?.state,'resting');
  resting.drill!.observers=resting.drill!.observers!.map(observer=>({...observer,warning:true}));
  assert.notEqual(observationFeedback(resting)?.state,'resting');
  assert.equal(observationFeedback({...resting,phase:'expired'}),null);
  assert.equal(observationFeedback({...resting,phase:'collectible'}),null);
  const unrelated=snapshot();
  unrelated.instance={...unrelated.instance!,spec:safetyDrillFixtures.find(item=>item.spec.drill.family==='pinball')!.spec};
  assert.equal(observationFeedback(unrelated),null);
});
