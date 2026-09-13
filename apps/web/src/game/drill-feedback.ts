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
  if ((impact.observationFlags?.[racerId] ?? 0) > 0) return 'Employee moved during inspection. Authorization for this movement was not on file.';
  if ((impact.blockedObservations?.[racerId] ?? 0) > 0) return 'Issued protection intercepted the inspection penalty. The finding remains on file.';
  if ((impact.bounces?.[racerId] ?? 0) > 0) return 'Employee ricocheted off company equipment. This method of travel has not been approved.';
  if ((impact.orbitReleases?.[racerId] ?? 0) > 0) return 'Employee exited the assigned orbit. The department was not consulted.';
  if ((impact.orbitSeconds?.[racerId] ?? 0) >= 0.5) return 'Employee spent time going in circles. This has been recorded as procedural compliance.';
  if ((impact.tetherSeconds?.[racerId] ?? 0) >= 0.5) return 'Employee experienced mandatory teamwork. Individual credit is unavailable.';
  if ((impact.draftSeconds[racerId] ?? 0) >= 0.5) return 'Employee gained speed by following moving equipment. The department has mixed feelings about this success.';
  if ((impact.currentSeconds[racerId] ?? 0) >= 0.5) return 'Employee rode the current. The department has mixed feelings about this success.';
  return 'No equipment contacts recorded. The department accepts this paperwork.';
}
