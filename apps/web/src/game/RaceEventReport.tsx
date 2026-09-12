import { raceEventPreset, type RaceEventSnapshot } from '@sky/shared';
import type { RaceEventHost } from './race-event-host';

type Props = {
  host: RaceEventHost;
  canReplay: boolean;
  onReplay: () => void;
};

function resultLabel(report: RaceEventSnapshot): string {
  if (report.phase === 'collectible') return 'Waiting for someone to collect it';
  if (report.phase === 'active') return `ACTIVE · ${report.remainingSeconds.toFixed(1)} s`;
  switch (report.expirationReason) {
    case 'reset': return 'Stopped by restart';
    case 'passed': return 'Missed by every racer';
    case 'lifetime': return 'Pickup expired';
    default: return 'Finished';
  }
}

function total(counts: Record<string, number> = {}): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

export function RaceEventReport({host, canReplay, onReplay}: Props) {
  const report = host.report;
  const spec = report?.instance?.spec;
  const impact = report?.impact;
  const label = spec ? raceEventPreset(spec.effect.type).label : 'No creation yet';
  const names = (ids: readonly string[]) => ids.map(id =>
    host.race.racers.find(racer => String(racer.id) === id)?.name ?? id
  ).join(', ') || 'Nobody yet';
  const participants = impact?.participants.length ?? 0;

  return <details className="race-detail event-report" open>
    <summary>Event result <small>{label}</small></summary>
    {report && spec ? <>
      <strong>{spec.displayName} · {label}</strong>
      <p>{spec.description}</p>
      <p role="status">
        {resultLabel(report)}<br/>
        Activated by: {report.triggererId ? names([report.triggererId]) : 'Nobody yet'}<br/>
        Affected: {names(impact?.affectedRacerIds ?? [])}
        {participants > 0 && ` (${impact?.affectedRacerIds.length ?? 0}/${participants})`}
      </p>
      <p>
        Impulses delivered: {total(impact?.impulseCounts)} · Debris hits: {total(impact?.debrisHits)}
        {' · '}Blocked debris: {total(impact?.blockedDebrisHits)} · Obstacles blocked: {total(impact?.obstacleBlocks)}
      </p>
      <button disabled={!canReplay} onClick={onReplay}>Restart &amp; replay this creation nearby · free</button>
      <small>Reuses the exact mesh and effect with a new race. No recording or API call. Last result stays here until another creation replaces it.</small>
    </> : <p>Generate an object or load a fixture. This panel retains the chosen effect, activation, and actual impact counters.</p>}
  </details>;
}
