import type { CreationSpec, GeometryMode, PipelineEvent, PipelineProfile, StageMetric, PipelineErrorData, TranscriptResult, VoiceEvent } from '@sky/shared';

export const HISTORY_LIMIT = 60;
export const geometryModeLabels: Record<GeometryMode, string> = {
  primitives: 'Procedural parts', mesh: 'Raw mesh',
};
export type LabAttempt = {
  id: number; prompt: string; geometryMode: GeometryMode; profile: PipelineProfile;
  outcome: 'ready' | 'failed' | 'cancelled' | 'transcribed'; message: string; elapsedMs: number;
  inputSource?:'text'|'voice';
  voice?:{mode:'create'|'transcribe-only';captureMs:number;transcriptionModel?:string;transcription?:TranscriptResult;error?:PipelineErrorData;events:VoiceEvent[]};
  spec?: CreationSpec; events: PipelineEvent[];
  recognition: 'unrated' | 'clear' | 'partial' | 'unclear';
};
export function attemptMetrics(events: PipelineEvent[]): StageMetric[] {
  const terminal = events.find(event => event.type === 'complete' || event.type === 'failed');
  if (terminal) return terminal.metrics;
  // A local cancellation can happen after a stage succeeds but before a terminal event.
  return events.flatMap(event => event.type === 'design' || event.type === 'geometry' ? [event.metric] : []);
}
export function summarizeAttempts(attempts: LabAttempt[]) {
  const groups = new Map<string, {label: string; attempts: number; ready: number; failed: number; cancelled: number; transcribed:number; durations: number[]}>();
  for (const attempt of attempts) {
    const speechModel=attempt.voice?.transcriptionModel??attempt.voice?.transcription?.metric.model;
    const key = JSON.stringify([attempt.profile, attempt.geometryMode,attempt.inputSource??'text',attempt.voice?.mode,speechModel]);
    const group = groups.get(key) ?? {
      label: attempt.profile.label+' / '+geometryModeLabels[attempt.geometryMode]+' / '+attempt.profile.mode+(attempt.voice?' / voice / '+attempt.voice.mode+' / '+(speechModel??'unknown speech model'):''),
      attempts: 0, ready: 0, failed: 0, cancelled: 0, transcribed:0, durations: [],
    };
    group.attempts++;
    group[attempt.outcome]++;
    if (attempt.outcome === 'ready') group.durations.push(attempt.elapsedMs);
    groups.set(key, group);
  }
  return [...groups.values()].map(({durations, ...group}) => {
    durations.sort((a, b) => a-b);
    const middle = Math.floor(durations.length / 2);
    const medianMs = durations.length === 0 ? null : durations.length % 2 ? durations[middle] : (durations[middle-1]+durations[middle])/2;
    return {...group, medianMs};
  });
}
// Rejected attempts retain timing/failure metadata, not their content.
export function sanitizeLabAttempt(attempt: LabAttempt): LabAttempt {
  const refused = attempt.events.some(event => event.type === 'failed' && event.error.code === 'REFUSED')
    || attempt.voice?.error?.code === 'REFUSED'
    || attempt.voice?.events.some(event => event.type === 'failed' && event.error.code === 'REFUSED'
      || event.type === 'generation' && event.event.type === 'failed' && event.event.error.code === 'REFUSED');
  if (!refused) return attempt;
  const metadataOnly = (event: PipelineEvent) => event.type !== 'design' && event.type !== 'complete';
  return {...attempt, prompt:'[Content rejected]', spec:undefined,
    events:attempt.events.filter(metadataOnly),
    voice:attempt.voice ? {...attempt.voice, transcription:undefined,
      events:attempt.voice.events.filter(event => event.type === 'transcribing' || event.type === 'failed'
        || event.type === 'generation' && metadataOnly(event.event))} : undefined};
}
export function serializeLabHistory(attempts: LabAttempt[]) {
  return JSON.stringify({version: 1, exportedAt: new Date().toISOString(), attempts:attempts.map(sanitizeLabAttempt)}, null, 2);
}
