import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  appearanceToRecipe, proceduralFixtures, raceEventFixtures, meshFixture,
  PipelineEventSchema, RaceEventPipelineEventSchema, VoiceEventSchema, RaceEventVoiceEventSchema,
  type PipelineEvent, type RaceEventPipelineEvent, type VoiceEvent, type RaceEventVoiceEvent,
} from '@sky/shared';
import {
  moderationDecision, openAIContentGuard, mockContentGuard, screenContent, type ContentGuard,
} from './generation/content-guard.js';
import { CONTENT_REFUSAL_MESSAGE, MODERATION_CATEGORIES, CONTENT_POLICY_INSTRUCTIONS } from './generation/content-policy.js';
import { CreationPipeline } from './generation/pipeline.js';
import { pipelineProfiles } from './generation/pipeline-config.js';
import { buildPipeline } from './generation/pipeline-bootstrap.js';
import { PipelineFailure } from './generation/pipeline-errors.js';
import { openAITransport, type ModelStageRequest } from './generation/stage-transport.js';
import { buildApp } from './app.js';

const fixture = proceduralFixtures[0], eventFixture = raceEventFixtures[0];
const paidAttempt = () => ({id: randomUUID(), confirmed: true as const});
const request = () => ({text: fixture.prompt, profileId: 'sol-direct', geometryMode: 'primitives' as const, paidAttempt: paidAttempt()});
const voiceRequest = () => ({profileId: 'sol-direct', geometryMode: 'primitives' as const, captureMs: 1000, paidAttempt: paidAttempt()});
const failure = (code: string) => (error: unknown) => error instanceof PipelineFailure && error.code === code;
const approved: ContentGuard = {async check() {return 'allow';}};
const blocked: ContentGuard = {async check() {return 'block';}};
const audio = {bytes: Buffer.from('RIFF1234WAVEaudio'), mimeType: 'audio/wav'};
type Event = PipelineEvent | RaceEventPipelineEvent | VoiceEvent | RaceEventVoiceEvent;

function moderation(flags: string[] = []) {
  return {flagged: flags.length > 0, categories: {
    ...Object.fromEntries(MODERATION_CATEGORIES.map(category => [category, false])),
    ...Object.fromEntries(flags.map(category => [category, true])),
  }};
}
function harness(guard: ContentGuard, options: {
  totalMs?: number; design?: unknown; guardLive?: boolean; generation?: (request: ModelStageRequest) => Promise<{data: unknown}>;
} = {}) {
  const calls: ModelStageRequest[] = [];
  const transport = {async run(request: ModelStageRequest) {
    calls.push(request);
    if (options.generation) return options.generation(request);
    const creation = request.product === 'race-event' ? eventFixture.spec : fixture.spec;
    if (request.stage === 'design') return {data: options.design ?? (request.product === 'race-event' ? eventFixture.design : fixture.design)};
    if (request.geometryMode === 'primitives') {
      assert.ok(creation.appearance.type === 'primitives');
      return {data: appearanceToRecipe(creation.appearance)};
    }
    const appearance = meshFixture.appearance;
    assert.ok(appearance.type === 'mesh');
    return {data: {
      vertices: appearance.vertices.map(([x,y,z]) => ({x,y,z})),
      faces: appearance.triangles.map(([a,b,c],i) => ({a,b,c,color:appearance.faceColors[i]})),
    }};
  }};
  const speech = {model: 'mock-speech', async transcribe() {return fixture.prompt;}};
  return {calls, pipeline: new CreationPipeline(
    pipelineProfiles({OPENAI_API_KEY: 'fake-key'}, true), {mock: transport, live: transport},
    {totalMs: options.totalMs ?? 30_000, designMs: 8_000}, {enabled: true, maxAttempts: 3},
    {mock: speech, live: speech}, {mock: guard, ...(options.guardLive === false ? {} : {live: guard})},
  )};
}

test('game policy permits ordinary fictional violence but blocks every other category and unknown flags', () => {
  for (const flags of [[], ['violence']]) assert.equal(moderationDecision({results: [moderation(flags)]}, 1), 'allow');
  for (const category of [...MODERATION_CATEGORIES.filter(value => value !== 'violence'), 'new-risk-category']) {
    assert.equal(moderationDecision({results: [moderation(['violence', category])]}, 1), 'block');
  }
  // Do not trust a false aggregate flag over a positive category.
  assert.equal(moderationDecision({results: [{...moderation(['sexual']), flagged: false}]}, 1), 'block');
});

test('missing, malformed or incomplete moderation results fail closed', () => {
  const categories = {...moderation().categories};
  delete categories.sexual;
  for (const response of [
    null, {}, {results: []}, {results: [moderation(), moderation()]},
    {results: [{flagged: false, categories}]},
    {results: [{flagged: false, categories: {...moderation().categories, hate: 'false'}}]},
    {results: [{flagged: true, categories: moderation().categories}]},
  ]) assert.throws(() => moderationDecision(response, 1), failure('PROVIDER_UNAVAILABLE'));
});

test('moderation SDK sends normalized individual fields without retries or provider text leakage', async () => {
  let calls = 0;
  const guard = openAIContentGuard('fake-moderation-key', async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://api.openai.com/v1/moderations');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'omni-moderation-latest');
    assert.deepEqual(body.input, ['cartoon bomb', 'toy rocket']);
    assert.ok(init?.signal);
    return new Response(JSON.stringify({results: [moderation(['violence']), moderation()]}), {headers: {'content-type': 'application/json'}});
  });
  await screenContent(guard, ['ｃａｒｔｏｏｎ bomb', 'toy\u200B rocket'], new AbortController().signal);
  assert.equal(calls, 1);
  for (const status of [401, 429, 500]) {
    let failures = 0;
    const unavailable = openAIContentGuard('fake-moderation-key', async () => {
      failures++;
      return new Response(JSON.stringify({error: {message: 'private prompt fake-moderation-key', code: 'private'}}), {status, headers: {'content-type': 'application/json'}});
    });
    await assert.rejects(screenContent(unavailable, ['private prompt'], new AbortController().signal), error => {
      assert.ok(error instanceof PipelineFailure);
      assert.equal(error.code, 'PROVIDER_UNAVAILABLE');
      assert.ok(!error.message.includes('private'));
      assert.ok(!error.message.includes('fake-moderation-key'));
      return true;
    });
    assert.equal(failures, 1);
  }
});

test('guard timeout and abort enforce a deadline on adapters that ignore signals', async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    let upstream: AbortSignal | undefined;
    let started!: () => void;
    const ready = new Promise<void>(resolve => {started = resolve;});
    const guard: ContentGuard = {check(_texts, signal) {upstream = signal; started(); return new Promise(() => {});}};
    const running = screenContent(guard, ['toy rocket'], controller.signal, cancel ? 1000 : 20);
    const rejected = assert.rejects(running, failure(cancel ? 'CANCELLED' : 'PROVIDER_UNAVAILABLE'));
    await ready;
    if (cancel) controller.abort(new PipelineFailure('CANCELLED', 'Attempt cancelled.'));
    await rejected;
    assert.equal(upstream?.aborted, true);
  }
});

test('SDK moderation aborts both pending headers and response body without retries', async () => {
  for (const phase of ['headers', 'body']) {
    let upstream: AbortSignal | undefined, calls = 0;
    const guard = openAIContentGuard('fake-key', async (_url, init) => {
      calls++; upstream = init?.signal ?? undefined;
      assert.ok(upstream);
      const signal = upstream;
      if (phase === 'headers') return new Promise<Response>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true});
      });
      return new Response(new ReadableStream({start(controller) {
        signal.addEventListener('abort', () => controller.error(signal.reason), {once: true});
      }}), {headers: {'content-type': 'application/json'}});
    });
    await assert.rejects(screenContent(guard, ['rocket'], new AbortController().signal, 40), failure('PROVIDER_UNAVAILABLE'));
    assert.equal(calls, 1); assert.equal(upstream?.aborted, true);
  }
});

test('blocked typed requests across both versions and geometry modes stop before design and consume one attempt', async () => {
  for (const eventMode of [false, true]) for (const geometryMode of ['mesh', 'primitives'] as const) {
    const {pipeline, calls} = harness(blocked);
    const events: Event[] = [], input = {...request(), geometryMode};
    const run = () => eventMode
      ? pipeline.runEvent(input, {emit: event => events.push(event)})
      : pipeline.run(input, {emit: event => events.push(event)});
    await assert.rejects(run(), failure('REFUSED'));
    assert.equal(calls.length, 0);
    assert.equal(events.length, 1);
    const terminal = events[0];
    assert.ok(terminal.type === 'failed');
    assert.equal(terminal.error.message, CONTENT_REFUSAL_MESSAGE);
    assert.deepEqual(pipeline.liveUsage, {enabled:true,maxAttempts:3,attemptsUsed:1,attemptsRemaining:2,busy:false});
    await assert.rejects(run(), failure('DUPLICATE_ATTEMPT'));
    assert.equal(calls.length, 0);
  }
});

test('every generated text field is screened separately before design emission and geometry', async () => {
  for (const eventMode of [false, true]) {
    const base = eventMode ? eventFixture.design : fixture.design;
    for (const field of eventMode ? ['displayName', 'visualBrief'] : ['displayName', 'description', 'visualBrief']) {
      const inputs: string[][] = [];
      const guard: ContentGuard = {async check(texts) {
        inputs.push([...texts]);
        return texts.includes('rejected generated text') ? 'block' : 'allow';
      }};
      const {pipeline, calls} = harness(guard, {design: {...base, [field]: 'rejected generated text'}});
      const events: Event[] = [];
      const input = request();
      await assert.rejects(eventMode
        ? pipeline.runEvent(input, {emit: event => events.push(event)})
        : pipeline.run(input, {emit: event => events.push(event)}), failure('REFUSED'));
      assert.equal(calls.length, 1);
      assert.equal(inputs.length, 2);
      assert.deepEqual(inputs[0], [input.text]);
      assert.deepEqual(inputs[1], eventMode
        ? [field === 'displayName' ? 'rejected generated text' : base.displayName, field === 'visualBrief' ? 'rejected generated text' : base.visualBrief]
        : [field === 'displayName' ? 'rejected generated text' : fixture.design.displayName, field === 'description' ? 'rejected generated text' : fixture.design.description, field === 'visualBrief' ? 'rejected generated text' : fixture.design.visualBrief]);
      assert.ok(!events.some(event => event.type === 'design' || event.type === 'complete'));
      assert.ok(!JSON.stringify(events).includes('rejected generated text'));
    }
  }
});

test('approved designs keep one effect and hand only the screened visual brief to geometry', async () => {
  for (const eventMode of [false, true]) for (const geometryMode of ['mesh','primitives'] as const) {
    const {pipeline, calls} = harness(approved);
    const input = {...request(), geometryMode};
    const spec = eventMode ? await pipeline.runEvent(input) : await pipeline.run(input);
    assert.equal(spec.version, eventMode ? 3 : 2);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].input, eventMode ? eventFixture.design.visualBrief : fixture.design.visualBrief);
    calls.forEach(call => assert.ok(call.instructions.includes(CONTENT_POLICY_INSTRUCTIONS)));
  }
});

test('missing live guard cannot fall back to the mock guard or dispatch speech/generation', async () => {
  const {pipeline, calls} = harness(approved, {guardLive: false});
  await assert.rejects(pipeline.run(request()), failure('NOT_CONFIGURED'));
  await assert.rejects(pipeline.runVoice(audio, voiceRequest()), failure('NOT_CONFIGURED'));
  assert.equal(calls.length, 0); assert.equal(pipeline.liveUsage.attemptsUsed, 0);
});

test('screening stays behind consent and the shared busy slot, including other profiles', async () => {
  let checks = 0, started!: () => void;
  const ready = new Promise<void>(resolve => {started = resolve;});
  const guard: ContentGuard = {check() {checks++; started(); return new Promise(() => {});}};
  const {pipeline, calls} = harness(guard);
  await assert.rejects(pipeline.run({...request(), paidAttempt: undefined}), failure('CONSENT_REQUIRED'));
  assert.equal(checks, 0);
  const controller = new AbortController(), input = request();
  const running = pipeline.run(input, {signal: controller.signal});
  const rejected = assert.rejects(running, failure('CANCELLED'));
  await ready;
  await assert.rejects(pipeline.run({...request(), profileId: 'sol-sol'}), failure('LIVE_BUSY'));
  await assert.rejects(pipeline.run(input), failure('DUPLICATE_ATTEMPT'));
  assert.equal(checks, 1); assert.equal(calls.length, 0);
  controller.abort(); await rejected;
  assert.equal(pipeline.liveUsage.busy, false);
  assert.equal(pipeline.liveUsage.attemptsUsed, 1);
});

test('both screenings share the generation deadline and late approvals never emit a result', async () => {
  for (const blockedStage of [1, 2]) {
    let checks = 0, finish!: (value: 'allow') => void, upstream: AbortSignal | undefined;
    const guard: ContentGuard = {async check(_texts, signal) {
      checks++;
      if (checks !== blockedStage) return 'allow';
      upstream = signal;
      return new Promise(resolve => {finish = resolve;});
    }};
    const {pipeline, calls} = harness(guard, {totalMs: 50}), events: PipelineEvent[] = [];
    await assert.rejects(pipeline.run(request(), {emit: event => events.push(event)}), failure('TIMEOUT'));
    assert.equal(upstream?.aborted, true);
    assert.equal(calls.length, blockedStage - 1);
    finish('allow'); await delay(0);
    assert.ok(!events.some(event => event.type === 'design' || event.type === 'complete'));
    assert.equal(events.filter(event => event.type === 'failed').length, 1);
  }
});

test('screening time reduces the remaining geometry budget', async () => {
  const {pipeline, calls} = harness({async check() {await delay(20); return 'allow';}}, {
    totalMs: 90,
    generation: async input => input.stage === 'design' ? {data: fixture.design} : new Promise(() => {}),
  });
  const started = performance.now();
  await assert.rejects(pipeline.run(request()), failure('TIMEOUT'));
  assert.equal(calls.length, 2);
  assert.ok(performance.now() - started < 500);
  assert.equal(calls[1].signal.aborted, true);
});

test('blocked voice creation transcripts are never emitted in either version', async () => {
  for (const eventMode of [false, true]) {
    const {pipeline, calls} = harness(blocked), events: Event[] = [];
    const input = voiceRequest();
    await assert.rejects(eventMode
      ? pipeline.runVoiceEvent(audio, input, {emit: event => events.push(event)})
      : pipeline.runVoice(audio, input, {emit: event => events.push(event)}), failure('REFUSED'));
    assert.equal(calls.length, 0);
    assert.ok(!events.some(event => event.type === 'transcript' || event.type === 'complete'));
    assert.ok(!JSON.stringify(events).includes(fixture.prompt));
    assert.equal(pipeline.liveUsage.attemptsUsed, 1);
    for (const event of events) (eventMode ? RaceEventVoiceEventSchema : VoiceEventSchema).parse(event);
  }
});

test('malformed and unavailable screening never releases design data or geometry', async () => {
  for (const designCheck of [false, true]) {
    let checks = 0;
    const guard: ContentGuard = {async check() {
      if (designCheck && ++checks === 1) return 'allow';
      throw new Error('private provider detail');
    }};
    const {pipeline, calls} = harness(guard), events: PipelineEvent[] = [];
    await assert.rejects(pipeline.run(request(), {emit: event => events.push(event)}), failure('PROVIDER_UNAVAILABLE'));
    assert.equal(calls.length, designCheck ? 1 : 0);
    assert.ok(!events.some(event => event.type === 'design' || event.type === 'complete'));
    assert.ok(!JSON.stringify(events).includes('private provider detail'));
    assert.equal(pipeline.liveUsage.busy, false);
  }
});

test('all typed, voice and raw-spec generation routes enforce the guard without exposing rejected text', async () => {
  const {pipeline, calls} = harness(blocked), app = buildApp({pipeline});
  try {
    for (const eventMode of [false, true]) {
      const response = await app.inject({method:'POST',url:eventMode?'/api/lab/events':'/api/lab/creations',payload:{...request(),profileId:'mock'}});
      assert.equal(response.statusCode, 200);
      const events = response.body.trim().split('\n').map(line => (eventMode ? RaceEventPipelineEventSchema : PipelineEventSchema).parse(JSON.parse(line)));
      assert.equal(events.at(-1)?.type, 'failed');
      assert.ok(!response.body.includes(fixture.prompt));
      const form = new FormData();
      form.append('options', JSON.stringify({profileId:'mock',captureMs:1000,geometryMode:'primitives'}));
      form.append('audio', new Blob([audio.bytes], {type:'audio/wav'}), 'clip');
      const upload = new Request('http://localhost', {method:'POST',body:form});
      const voice = await app.inject({method:'POST',url:eventMode?'/api/voice/events':'/api/voice/creations',
        headers:{'content-type':upload.headers.get('content-type')!},payload:Buffer.from(await upload.arrayBuffer())});
      const voiceEvents = voice.body.trim().split('\n').map(line => (eventMode ? RaceEventVoiceEventSchema : VoiceEventSchema).parse(JSON.parse(line)));
      assert.equal(voiceEvents.at(-1)?.type, 'failed');
      assert.ok(!voice.body.includes(fixture.prompt));
    }
    const raw = await app.inject({method:'POST',url:'/api/creations',payload:{text:fixture.prompt}});
    assert.equal(raw.statusCode, 422);
    assert.equal(raw.json().error.code, 'REFUSED');
    assert.equal(raw.json().error.message, CONTENT_REFUSAL_MESSAGE);
    assert.ok(!('appearance' in raw.json()));
    assert.equal(calls.length, 0);
  } finally {await app.close();}
});

test('production bootstrap uses real moderation at both boundaries under one consent', async () => {
  const original = globalThis.fetch, calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith('/moderations')) {
      calls.push('screen');
      return new Response(JSON.stringify({results:body.input.map(() => moderation())}), {headers:{'content-type':'application/json'}});
    }
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    const designStage = body.text.format.name.startsWith('design');
    calls.push(designStage ? 'design' : 'geometry');
    return new Response(JSON.stringify({object:'response',id:'resp_test',status:'completed',output:[
      {type:'message',content:[{type:'output_text',text:JSON.stringify(designStage?fixture.design:appearanceToRecipe(fixture.appearance))}]},
    ]}), {headers:{'content-type':'application/json'}});
  };
  try {
    const pipeline = buildPipeline({OPENAI_API_KEY:'fake-key'}, true);
    const input = request(), spec = await pipeline.run(input);
    assert.equal(spec.version, 2);
    assert.deepEqual(calls, ['screen','design','screen','geometry']);
    assert.equal(pipeline.liveUsage.attemptsUsed, 1);
    await assert.rejects(pipeline.run(input), failure('DUPLICATE_ATTEMPT'));
    assert.equal(calls.length, 4);
  } finally {globalThis.fetch = original;}
});

test('mock refusal and unavailable fixtures are deterministic and make no network calls', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {assert.fail('Mock screening must never call a provider');};
  try {
    const pipeline = buildPipeline({OPENAI_API_KEY:'fake-key'});
    for (const [text, code] of [['blocked mock request','REFUSED'], ['unavailable mock screening','PROVIDER_UNAVAILABLE']]) {
      await assert.rejects(pipeline.run({text,profileId:'mock'}), failure(code));
    }
    await screenContent(mockContentGuard, [fixture.prompt], new AbortController().signal);
  } finally {globalThis.fetch = original;}
});

test('generation-provider refusals use the same fixed player message', async () => {
  const transport = openAITransport('fake-key', async () => new Response(JSON.stringify({
    object:'response',id:'resp_test',status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'private echoed input'}]}],
  }), {headers:{'content-type':'application/json'}}));
  const {pipeline} = harness(approved, {generation: transport.run});
  await assert.rejects(pipeline.run(request()), error => {
    assert.ok(error instanceof PipelineFailure);
    assert.equal(error.code, 'REFUSED'); assert.equal(error.message, CONTENT_REFUSAL_MESSAGE);
    return true;
  });
});
