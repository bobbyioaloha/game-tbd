import test from 'node:test';
import assert from 'node:assert/strict';
import { safetyDrillFixtures, raceEventFixtures, type VoiceRequest } from '@sky/shared';
import { safetyDrillClient } from './drill-client';
import { raceEventClient } from './client';
import { RaceEventRequestError } from './encounter-client';
import { createAudioSafetyDrillClient } from '../voice/safety-drill-voice-client';

const spec = safetyDrillFixtures[0].spec;
const recording = {blob: new Blob(['fake clip']), captureMs: 500};
const signal = () => new AbortController().signal;
const complete = (result: unknown) => new Response(JSON.stringify({
  type: 'complete', spec: result, elapsedMs: 200, metrics: [],
}) + '\n');

test('drill client accepts both families and rejects legacy results and unknown mechanics without retry', async t => {
  let calls = 0;
  for (const result of [spec, safetyDrillFixtures[3].spec, raceEventFixtures[0].spec,
    {...spec, drill: {...spec.drill, code: 'execute()'}}]) {
    const fetch = t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
      calls++;
      assert.equal(url, '/api/lab/drills');
      assert.ok(options?.signal);
      assert.equal(JSON.parse(String(options?.body)).paidAttempt, undefined);
      return complete(result);
    });
    const pending = safetyDrillClient.generate({text: safetyDrillFixtures[0].prompt, profileId: 'mock'}, signal());
    if (result === spec || result === safetyDrillFixtures[3].spec) assert.deepEqual(await pending, result);
    else await assert.rejects(pending);
    fetch.mock.restore();
  }
  assert.equal(calls, 4);
});

test('shared transport preserves the v3 boundary when a v4 drill is returned', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => complete(spec));
  await assert.rejects(raceEventClient.generate({text: 'friendly vampire', profileId: 'mock'}, signal()));
  assert.equal(fetch.mock.callCount(), 1);
});

test('voice drill failure surfaces once and uses the voice endpoint and bounded capture metadata', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    assert.equal(url, '/api/voice/drills');
    assert.ok(options?.body instanceof FormData);
    assert.equal(JSON.parse(String(options.body.get('options'))).captureMs, 500);
    return new Response(JSON.stringify({
      type: 'failed', error: {code: 'TIMEOUT', message: 'Attempt deadline reached.'}, elapsedMs: 100,
    }) + '\n');
  });
  await assert.rejects(safetyDrillClient.generateVoice(recording, {profileId: 'mock'}, signal()), /TIMEOUT/);
  assert.equal(fetch.mock.callCount(), 1);
});

test('invalid text or capture metadata never dispatch a request', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {throw new Error('Unexpected request');});
  await assert.rejects(safetyDrillClient.generate({text: '', profileId: 'mock'}, signal()));
  await assert.rejects(safetyDrillClient.generateVoice({...recording, captureMs: 8001}, {profileId: 'mock'}, signal()));
  assert.equal(fetch.mock.callCount(), 0);
});

test('transport preserves structured refusal errors and hides non-protocol error bodies', async t => {
  const message = 'That request is not suitable for this game.';
  for (const body of [{error: {code: 'REFUSED', message}}, {stack: 'private provider details'}]) {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(body), {status: 400}));
    await assert.rejects(
      safetyDrillClient.generate({text: 'friendly vampire', profileId: 'mock'}, signal()),
      error => {
        assert.ok(error instanceof RaceEventRequestError);
        assert.equal(error.detail.code, 'error' in body ? 'REFUSED' : 'PROVIDER_ERROR');
        assert.equal(error.message, 'error' in body ? message : 'PROVIDER_ERROR: The server rejected the event request.');
        return true;
      },
    );
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});

test('audio adapter reads fresh consent, forwards each transcript and signal, and never makes a second request', async () => {
  const configurations: Omit<VoiceRequest, 'captureMs'>[] = [
    {profileId: 'mock', mockText: safetyDrillFixtures[0].prompt},
    {profileId: 'live', paidAttempt: {id: '9341229e-58ca-4d82-9862-1ac6d8939ca7', confirmed: true}},
  ];
  const specs = [spec, safetyDrillFixtures[3].spec];
  const transcripts = [safetyDrillFixtures[0].prompt, 'friendly vampire'];
  let attempt = 0, calls = 0;
  const expectedSignals = [signal(), signal()];
  const progress: {message: string; transcript?: string}[] = [];
  const client = createAudioSafetyDrillClient(() => configurations[attempt], {
    generate: async () => {throw new Error('Unexpected typed request');},
    generateVoice: async (clip, request, abortSignal, onEvent) => {
      calls++;
      assert.equal(clip, recording);
      assert.equal(request, configurations[attempt]);
      assert.equal(abortSignal, expectedSignals[attempt]);
      onEvent?.({type: 'transcript', result: {text: transcripts[attempt], metric: {model: 'fake-transcriber', durationMs: 1}}});
      onEvent?.({type: 'generation', event: {type: 'stage', stage: 'design', elapsedMs: 0}});
      return specs[attempt];
    },
  });
  for (attempt = 0; attempt < configurations.length; attempt++) {
    const result = await client.generateAudio(recording, {
      signal: expectedSignals[attempt],
      onProgress: (_phase, message, transcript) => {progress.push({message, transcript});},
    });
    assert.equal(result, specs[attempt]);
  }
  assert.equal(calls, 2);
  assert.deepEqual(progress.flatMap(event => event.transcript ? [event.transcript] : []), transcripts);
  assert.match(progress.map(event => event.message).join(' '), /safety drill/);
});
