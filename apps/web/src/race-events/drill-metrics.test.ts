import test from 'node:test';
import assert from 'node:assert/strict';
import { safetyDrillFixtures } from '@sky/shared';
import { emptyDrillImpact } from './drill-mechanics';
import { drillMetricSummary } from './drill-metrics';

test('every family reports measured local and aggregate outcomes, including old metric shapes',()=>{
  const impact=emptyDrillImpact();
  impact.bounces={you:2,rival:3};impact.tetherSeconds={you:1.25,rival:2};
  assert.equal(drillMetricSummary('pinball',impact,'you'),'2 bumper bounces');
  assert.equal(drillMetricSummary('pinball',impact),'5 bumper bounces');
  assert.equal(drillMetricSummary('buddy',impact,'you'),'1.3 s under buddy tension');
  assert.equal(drillMetricSummary('buddy',impact),'3.3 s under buddy tension');
  const old={collisions:{},blockedCollisions:{},draftSeconds:{},currentSeconds:{},reactions:0};
  for(const fixture of safetyDrillFixtures) {
    const summary=drillMetricSummary(fixture.spec.drill.family,old,'you');
    assert.match(summary,/^0/);assert.doesNotMatch(summary,/undefined|NaN/);
  }
});
