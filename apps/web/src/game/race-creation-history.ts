import type { RaceEncounter, RaceEventSnapshot } from '@sky/shared';

export type RaceCreationRecord = Readonly<{
  instanceId: string;
  spec: RaceEncounter;
  source: 'voice' | 'fixture' | 'prepared';
  attemptNumber?: number;
  status: 'ready' | 'collectible' | 'active' | 'expired' | 'discarded';
  snapshot?: RaceEventSnapshot;
  discardReason?: string;
}>;

/** Run-local inspection records. Audio and transcripts never enter this history. */
export class RaceCreationHistory {
  private records: readonly RaceCreationRecord[] = [];
  get creations(): readonly RaceCreationRecord[] { return this.records; }

  add(instanceId: string, spec: RaceEncounter, source: RaceCreationRecord['source'], attemptNumber?: number) {
    if (source === 'voice' && this.records.some(record => record.instanceId === instanceId)) return;
    // A development fixture is a single preview, even when loaded repeatedly.
    const previous = source === 'fixture' ? this.records.filter(record => record.source !== 'fixture') : this.records;
    this.records = [...previous, { instanceId, spec, source, attemptNumber, status: 'ready' }];
  }

  observe(current: RaceEventSnapshot, raceFinished: boolean) {
    const record = this.records.find(item => item.instanceId === current.instance?.instanceId);
    if (record && current.phase !== 'empty') {
      const previous = record.snapshot;
      if (previous?.phase === current.phase && previous.elapsedSeconds === current.elapsedSeconds &&
        previous.remainingSeconds === current.remainingSeconds && previous.triggererId === current.triggererId &&
        previous.expirationReason === current.expirationReason) return;
      // Keep cumulative impact totals and metadata, without transient render geometry.
      const snapshot = { ...current, debris: [], drill: undefined };
      const status = current.phase;
      this.records = this.records.map(item => item === record ? { ...item, status, snapshot } : item);
    } else if (!current.instance && raceFinished) {
      // PracticeRace resets its shared event port once every racer has landed.
      this.records = this.records.map(item => item.snapshot && (item.status === 'collectible' || item.status === 'active')
        ? { ...item, status: 'expired', snapshot: { ...item.snapshot, phase: 'expired', remainingSeconds: 0, expirationReason: 'complete' } }
        : item);
    }
  }

  discardReady(reason: string) {
    this.records = this.records.map(record => record.status === 'ready'
      ? { ...record, status: 'discarded', discardReason: reason }
      : record);
  }

  clear() { this.records = []; }
}
