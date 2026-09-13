import test from 'node:test';
import assert from 'node:assert/strict';
import { safetyDrillFixtures, type RaceEventSnapshot, type DrillImpact } from '@sky/shared';
import { drillAssessment } from './drill-feedback';
function report(metrics:Partial<DrillImpact>={},reason:RaceEventSnapshot['expirationReason']='complete'):RaceEventSnapshot {
  return {phase:'expired',expirationReason:reason,elapsedSeconds:10,remainingSeconds:0,position:[0,0,0],radius:0,debris:[],affectedRacerIds:[],
    instance:{instanceId:'drill',creatorId:'0',position:[0,0,0],seed:1,spec:safetyDrillFixtures[0].spec},
    impact:{participants:['0'],affectedRacerIds:[],impulseCounts:{},debrisHits:{},blockedDebrisHits:{},obstacleBlocks:{},
      drill:{collisions:{},blockedCollisions:{},draftSeconds:{},currentSeconds:{},reactions:0,...metrics}}};
}
test('assessment reflects measured contacts and opportunities, without grading cancelled or missed drills',()=>{
  assert.match(drillAssessment(report({collisions:{'0':2}}))!,/2 equipment contacts/);
  assert.match(drillAssessment(report({blockedCollisions:{'0':2}}))!,/2 equipment contacts intercepted/);
  assert.match(drillAssessment(report({draftSeconds:{'0':1}}))!,/gained speed by following moving equipment/);
  assert.match(drillAssessment(report({currentSeconds:{'0':2}}))!,/wet floor/);
  assert.doesNotMatch(drillAssessment(report({draftSeconds:{'1':3}}))!,/gained speed by following moving equipment/);
  for(const reason of ['reset','passed','lifetime'] as const)assert.equal(drillAssessment(report({},reason)),undefined);
});
