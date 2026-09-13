import test from 'node:test';
import assert from 'node:assert/strict';
import { proceduralFixtures, type PipelineProfile } from '@sky/shared';
import { summarizeAttempts, attemptMetrics, serializeLabHistory, type LabAttempt } from './lab-history';
const profile: PipelineProfile = {id: 'test', label: 'Test', mode: 'live', available: true,
  design: {model: 'design', reasoning: 'low', maxOutputTokens: 2048},
  geometry: {model: 'geometry', reasoning: 'low', maxOutputTokens: 12000}};
const attempt: LabAttempt = {id: 1, prompt: 'duck', geometryMode: 'primitives', profile,
  outcome: 'ready', elapsedMs: 4000, message: 'Ready', events: [], recognition: 'unrated'};
test('comparison counts failures and cancellations and separates methods, configs, and mocks', () => {
  const attempts: LabAttempt[] = [
    attempt, {...attempt, id: 2, outcome: 'failed'}, {...attempt, id: 3, outcome: 'cancelled'},
    {...attempt, id: 4, elapsedMs: 8000},
    {...attempt, id: 5, geometryMode: 'mesh'},
    {...attempt, id: 6, profile: {...profile, mode: 'mock'}},
    {...attempt, id: 7, profile: {...profile, geometry: {...profile.geometry, maxOutputTokens: 4096}}},
  ];
  const summary = summarizeAttempts(attempts);
  assert.equal(summary.length, 4);
  assert.deepEqual(summary[0], {label: 'Test / Procedural parts / live',
    attempts: 4, ready: 2, failed: 1, cancelled: 1, transcribed:0, medianMs: 6000});
  const exported = JSON.parse(serializeLabHistory(attempts));
  assert.equal(exported.attempts.length, 7);
  assert.equal(exported.attempts[2].outcome, 'cancelled');
  assert.equal(exported.attempts[6].profile.geometry.maxOutputTokens, 4096);
  assert.equal(summarizeAttempts([{...attempt, outcome: 'failed'}])[0].medianMs, null);
});
test('partial usage survives a local cancellation without becoming zero usage', () => {
  const metric = {stage: 'design' as const, model: 'design', durationMs: 100};
  assert.deepEqual(attemptMetrics([{type: 'design', design: proceduralFixtures[0].design, metric}]), [metric]);
  assert.equal(attemptMetrics([]).length, 0);
});

test('failed speech attempts retain their configured model in comparison labels',()=>{
  const summary=summarizeAttempts([{...attempt,outcome:'failed',inputSource:'voice',
    voice:{mode:'create',captureMs:1000,transcriptionModel:'gpt-transcribe',events:[]}}]);
  assert.match(summary[0].label,/gpt-transcribe/);
  assert.equal(summary[0].failed,1);
});

test('rejected history drops prompts, designs, specs and transcripts while keeping failure metrics', async () => {
  const {sanitizeLabAttempt} = await import('./lab-history');
  const metric = {stage:'design' as const,model:'design',durationMs:100};
  const error = {code:'REFUSED' as const,message:'That request is not suitable for this game.'};
  const failed = {type:'failed' as const,stage:'design' as const,error,metrics:[metric],elapsedMs:150};
  const design = {type:'design' as const,design:{...proceduralFixtures[0].design,visualBrief:'private design'},metric};
  const transcript = {text:'private transcript',metric:{model:'test-speech',durationMs:30}};
  const rejected: LabAttempt = {...attempt,prompt:'private prompt',outcome:'failed',spec:proceduralFixtures[0].spec,
    events:[design,failed],voice:{mode:'create',captureMs:1000,transcription:transcript,error,
      events:[{type:'transcript',result:transcript},{type:'generation',event:design},{type:'failed',error,elapsedMs:150}]}};
  const safe = sanitizeLabAttempt(rejected);
  assert.equal(safe.prompt,'[Content rejected]');
  assert.equal(safe.spec,undefined);assert.equal(safe.voice?.transcription,undefined);
  assert.deepEqual(attemptMetrics(safe.events),[metric]);
  assert.deepEqual(safe.events,[failed]);
  for (const serialized of [JSON.stringify(safe),serializeLabHistory([rejected])]) {
    for (const forbidden of ['private prompt','private transcript','private design','visualBrief','appearance']) assert.ok(!serialized.includes(forbidden));
  }
  assert.equal(sanitizeLabAttempt(attempt),attempt,'Approved history preserves comparison content');
});
