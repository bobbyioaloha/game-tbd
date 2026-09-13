import type { RaceEventSnapshot } from '@sky/shared';

/** Assess actual local telemetry only; no provider request or invented performance claims. */
export function drillAssessment(report:RaceEventSnapshot|undefined,racerId='0'):string|undefined {
  if (report?.instance?.spec.version !== 4 || report.phase !== 'expired' || report.expirationReason !== 'complete') return;
  const impact = report.impact?.drill;
  if (!impact) return;
  const collisions = impact.collisions[racerId] ?? 0;
  if (collisions > 0) return `${collisions} equipment contact${collisions === 1 ? '' : 's'} recorded. Refresher training assigned.`;
  const blocked = impact.blockedCollisions[racerId] ?? 0;
  if (blocked > 0) return `${blocked} equipment contact${blocked === 1 ? '' : 's'} intercepted by issued protection. PPE inspection passed.`;
  if ((impact.draftSeconds[racerId] ?? 0) >= 0.5) return 'Employee gained speed by following moving equipment. The department has mixed feelings.';
  if ((impact.currentSeconds[racerId] ?? 0) >= 0.5) return 'Employee participated in wet floor assessment. Floor remains unavailable.';
  return 'No equipment contacts recorded. The department accepts this paperwork.';
}
