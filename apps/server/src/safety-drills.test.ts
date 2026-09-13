import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  safetyDrillFixtures, appearanceToRecipe, SafetyDrillSpecSchema,
  SafetyDrillPipelineEventSchema, SafetyDrillVoiceEventSchema, type SafetyDrillPipelineEvent, type SafetyDrillVoiceEvent,
} from '@sky/shared';
import { CreationPipeline } from './generation/pipeline.js';
import { pipelineProfiles } from './generation/pipeline-config.js';
import { mockStageTransport, openAITransport, type ModelStageRequest } from './generation/stage-transport.js';
import { mockContentGuard } from './generation/content-guard.js';
import { PipelineFailure } from './generation/pipeline-errors.js';
import { buildApp } from './app.js';
import { drillFormat } from './generation/generation-formats.js';

const fixture = safetyDrillFixtures[0];
function harness(live = false) {
  const calls: ModelStageRequest[] = [];
  const transport = {run: async (request: ModelStageRequest) => {
    calls.push(request);
    assert.equal(fixture.spec.appearance.type, 'primitives');
    return {data: request.stage === 'design' ? fixture.design : appearanceToRecipe(fixture.spec.appearance)};
  }};
  return {calls, pipeline: new CreationPipeline(pipelineProfiles(live ? {OPENAI_API_KEY: 'test-fake-key'} : {}, live),
    {mock: transport, live: transport}, undefined, {enabled: live, maxAttempts: 3},
    {mock: {model: 'mock', transcribe: async () => fixture.prompt}, live: {model: 'test-speech', transcribe: async () => fixture.prompt}},
    {mock: mockContentGuard, live: mockContentGuard})};
}
test('drill design controls recipe; geometry receives only appearance and exactly two calls run', async () => {
  const {pipeline, calls} = harness();
  const events: SafetyDrillPipelineEvent[] = [];
  const spec = await pipeline.runDrill({text: fixture.prompt, profileId: 'mock', geometryMode: 'primitives'}, {emit: event => events.push(event)});
  SafetyDrillSpecSchema.parse(spec);
  assert.deepEqual(spec.drill, fixture.spec.drill);
  assert.equal(spec.description, fixture.spec.description);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].input, fixture.design.visualBrief);
  assert.equal(calls[1].product, 'safety-drill');
  assert.equal(calls[1].input.includes('charge'), false);
  events.forEach(event => SafetyDrillPipelineEventSchema.parse(event));
});
test('drill numeric overrides and unsupported combinations fail before geometry without repair', async () => {
  for (const drill of [{...fixture.design.drill, strength: 20}, {...fixture.design.drill, formation: 'convoy'},
    {...fixture.design.drill, reaction: 'teleport'}, {...fixture.design.drill, target: 'everyone-except-me'}]) {
    let calls = 0;
    const pipeline = new CreationPipeline(pipelineProfiles({}), {mock: {run: async () => {
      calls++; return {data: {...fixture.design, drill}};
    }}});
    await assert.rejects(pipeline.runDrill({text: fixture.prompt, profileId: 'mock'}), error => error instanceof PipelineFailure && error.code === 'INVALID_DESIGN');
    assert.equal(calls, 1);
  }
});
test('real free mock stages preserve the six fixture recipes and distinct object appearances', async () => {
  const pipeline = new CreationPipeline(pipelineProfiles({}), {mock: mockStageTransport});
  await Promise.all(safetyDrillFixtures.map(async item => {
    const spec = await pipeline.runDrill({text: item.prompt, profileId: 'mock', geometryMode: 'primitives'});
    assert.deepEqual(spec.drill, item.spec.drill);
    assert.deepEqual(spec.appearance, item.spec.appearance);
  }));
  await assert.rejects(pipeline.runDrill({text: 'spaghetti bicycle', profileId: 'mock', geometryMode: 'primitives'}),
    error => error instanceof PipelineFailure && error.code === 'INVALID_REQUEST');
});
test('drill routes share paid consent, origin checks and duplicate admission with older routes', async () => {
  const {pipeline, calls} = harness(true);
  const app = buildApp({pipeline});
  const request = {text: fixture.prompt, profileId: 'sol-direct', geometryMode: 'primitives'};
  try {
    const blocked = await app.inject({method: 'POST', url: '/api/lab/drills', payload: request});
    assert.equal(blocked.statusCode, 400); assert.equal(calls.length, 0);
    const paidAttempt = {id: randomUUID(), confirmed: true as const};
    const foreign = await app.inject({method: 'POST', url: '/api/lab/drills', headers: {origin: 'https://other.example'}, payload: {...request, paidAttempt}});
    assert.equal(foreign.statusCode, 403); assert.equal(calls.length, 0);
    const response = await app.inject({method: 'POST', url: '/api/lab/drills', payload: {...request, paidAttempt}});
    const events = response.body.trim().split('\n').map(line => SafetyDrillPipelineEventSchema.parse(JSON.parse(line)));
    assert.equal(events.at(-1)?.type, 'complete'); assert.equal(pipeline.liveUsage.attemptsUsed, 1);
    await assert.rejects(pipeline.runEvent({...request, geometryMode: 'primitives', paidAttempt}), /already/);
    const form = new FormData();
    form.append('options', JSON.stringify({profileId: 'sol-direct', geometryMode: 'primitives', captureMs: 1000, paidAttempt: {id: randomUUID(), confirmed: true}}));
    form.append('audio', new Blob(['RIFF1234WAVEaudio'], {type: 'audio/wav'}), 'recording');
    const upload = new Request('http://localhost', {method: 'POST', body: form});
    const voice = await app.inject({method: 'POST', url: '/api/voice/drills', headers: {'content-type': upload.headers.get('content-type')!}, payload: Buffer.from(await upload.arrayBuffer())});
    const voiceEvents = voice.body.trim().split('\n').map(line => SafetyDrillVoiceEventSchema.parse(JSON.parse(line)));
    assert.equal(voiceEvents.at(-1)?.type, 'complete'); assert.equal(calls.length, 4);
    assert.equal(pipeline.liveUsage.attemptsUsed, 2); assert.equal(pipeline.liveUsage.busy, false);
  } finally {await app.close();}
});
test('v4 uses real SDK structured output through an intercepted transport without network or live calls', async () => {
  let calls = 0;
  const transport = openAITransport('test-fake-drill-key', async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.equal(fixture.spec.appearance.type, 'primitives');
    if (calls === 1) assert.deepEqual(body.text.format.schema, drillFormat.schema);
    else assert.equal(body.input, fixture.design.visualBrief);
    const data = calls === 1 ? fixture.design : appearanceToRecipe(fixture.spec.appearance);
    return new Response(JSON.stringify({object: 'response', id: 'resp_test', status: 'completed', output: [
      {type: 'message', role: 'assistant', content: [{type: 'output_text', text: JSON.stringify(data)}]},
    ]}), {headers: {'content-type': 'application/json'}});
  });
  const pipeline = new CreationPipeline(pipelineProfiles({}), {mock: transport});
  const spec = await pipeline.runDrill({text: fixture.prompt, profileId: 'mock', geometryMode: 'primitives'});
  SafetyDrillSpecSchema.parse(spec); assert.equal(calls, 2);
});
test('successive live voice attempts preserve fresh transcripts and different recipes without using the mock prompt', async () => {
  // Prepared provider replies prove transport isolation, not live model interpretation.
  const attempts = [safetyDrillFixtures[1], safetyDrillFixtures[3]];
  const inputs: string[] = [];
  let speechCalls = 0;
  const transport = openAITransport('test-fake-drill-key', async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const item = attempts[Math.floor(inputs.length / 2)];
    const designStage = inputs.length % 2 === 0;
    assert.equal(body.input, designStage ? item.prompt : item.design.visualBrief);
    inputs.push(body.input);
    assert.equal(item.spec.appearance.type, 'primitives');
    const data = designStage ? item.design : appearanceToRecipe(item.spec.appearance);
    return new Response(JSON.stringify({object: 'response', id: 'resp_test', status: 'completed', output: [
      {type: 'message', role: 'assistant', content: [{type: 'output_text', text: JSON.stringify(data)}]},
    ]}), {headers: {'content-type': 'application/json'}});
  });
  const pipeline = new CreationPipeline(pipelineProfiles({OPENAI_API_KEY: 'test-fake-key'}, true),
    {mock: mockStageTransport, live: transport}, undefined, {enabled: true, maxAttempts: 3},
    {live: {model: 'test-speech', transcribe: async (_audio, _signal, mockText) => {
      assert.equal(mockText, undefined, 'live speech must ignore the prepared mock prompt');
      return attempts[speechCalls++].prompt;
    }}, mock: {model: 'unused-mock', transcribe: async () => {throw new Error('Unexpected mock speech');}}},
    {mock: mockContentGuard, live: mockContentGuard});
  const resultIds: string[] = [];
  for (const item of attempts) {
    const events: SafetyDrillVoiceEvent[] = [];
    const result = await pipeline.runVoiceDrill({bytes: Buffer.from('RIFF1234WAVEaudio'), mimeType: 'audio/wav'},
      {profileId: 'sol-direct', geometryMode: 'primitives', captureMs: 500, mockText: fixture.prompt,
        paidAttempt: {id: randomUUID(), confirmed: true}}, {emit: event => events.push(event)});
    assert.equal(result.result.text, item.prompt);
    assert.ok(result.spec);
    assert.deepEqual(result.spec.drill, item.spec.drill);
    assert.equal(result.spec.description, item.spec.description);
    assert.deepEqual(events.filter(event => event.type === 'transcript').map(event => event.result.text), [item.prompt]);
    events.forEach(event => SafetyDrillVoiceEventSchema.parse(event));
    resultIds.push(result.spec.id);
  }
  assert.equal(new Set(resultIds).size, 2);
  assert.equal(speechCalls, 2);
  assert.deepEqual(inputs, attempts.flatMap(item => [item.prompt, item.design.visualBrief]));
  assert.equal(pipeline.liveUsage.attemptsUsed, 2);
  assert.equal(pipeline.liveUsage.busy, false);
});

test('drill cancellation discards geometry and reports exactly one terminal failure', async () => {
  const controller = new AbortController();
  const events: SafetyDrillPipelineEvent[] = [];
  let calls = 0;
  const pipeline = new CreationPipeline(pipelineProfiles({}), {mock: {run: async request => {
    calls++;
    if (request.stage === 'design') return {data: fixture.design};
    controller.abort();
    return new Promise(() => {});
  }}});
  await assert.rejects(pipeline.runDrill({text: fixture.prompt, profileId: 'mock', geometryMode: 'primitives'},
    {signal: controller.signal, emit: event => events.push(event)}), error => error instanceof PipelineFailure && error.code === 'CANCELLED');
  assert.equal(calls, 2); assert.equal(events.filter(event => event.type === 'failed').length, 1);
  assert.equal(events.some(event => event.type === 'complete'), false);
});

test('drill content checks screen the input and design before exposing a result or generating geometry', async () => {
  for (const blockOn of [1, 2]) {
    let checks = 0, calls = 0;
    const events: SafetyDrillPipelineEvent[] = [];
    const pipeline = new CreationPipeline(pipelineProfiles({}), {mock: {run: async () => {
      calls++; return {data: fixture.design};
    }}}, undefined, undefined, undefined, {mock: {check: async texts => {
      checks++;
      assert.deepEqual(texts, checks === 1 ? [fixture.prompt] : [fixture.design.displayName, fixture.design.visualBrief]);
      return checks === blockOn ? 'block' : 'allow';
    }}});
    await assert.rejects(pipeline.runDrill({text: fixture.prompt, profileId: 'mock'}, {emit: event => events.push(event)}),
      error => error instanceof PipelineFailure && error.code === 'REFUSED');
    assert.equal(calls, blockOn - 1);
    assert.equal(events.some(event => event.type === 'design' || event.type === 'complete'), false);
  }
});
test('the shared drill deadline terminates a stalled geometry call without retries', async () => {
  let calls = 0;
  const events: SafetyDrillPipelineEvent[] = [];
  const pipeline = new CreationPipeline(pipelineProfiles({}), {mock: {run: async request => {
    calls++;
    if (request.stage === 'design') return {data: fixture.design};
    return new Promise(() => {});
  }}}, {totalMs: 100, designMs: 80});
  await assert.rejects(pipeline.runDrill({text: fixture.prompt, profileId: 'mock'}, {emit: event => events.push(event)}),
    error => error instanceof PipelineFailure && error.code === 'TIMEOUT');
  assert.equal(calls, 2);
  assert.equal(events.filter(event => event.type === 'failed').length, 1);
  assert.equal(events.some(event => event.type === 'complete'), false);
});

test('provider schema matches every shared recipe combination and rejects unsupported fields', () => {
  // The SDK emits local references for repeated fields; inspect those as well as inline enums/literals.
  type Choice = {type?: string; enum?: string[]; const?: string; $ref?: string};
  type Branch = {type: string; additionalProperties: boolean; required: string[]; properties: Record<string, Choice>};
  const schema = drillFormat.schema as {
    type: string; additionalProperties: boolean; required: string[];
    properties: {drill: {anyOf: Branch[]}}; definitions: Record<string, Choice>;
  };
  const choices = (node: Choice): string[] => {
    if (node.$ref) {
      assert.ok(node.$ref.startsWith('#/definitions/'));
      const target = schema.definitions[node.$ref.slice('#/definitions/'.length)];
      assert.ok(target, 'the provider schema must retain every referenced definition');
      return choices(target);
    }
    assert.equal(node.type, 'string');
    if (node.const !== undefined) return [node.const];
    assert.ok(node.enum);
    return node.enum;
  };
  assert.equal(schema.type, 'object'); assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['displayName', 'visualBrief', 'drill']);
  const branches = schema.properties.drill.anyOf;
  const permitted = (recipe: Record<string, unknown>) => branches.some(branch =>
    branch.required.every(key => key in recipe) && Object.keys(recipe).length === branch.required.length &&
    Object.entries(branch.properties).every(([key, node]) => choices(node).some(value => value === recipe[key])));
  const expectBoth = (recipe: Record<string, unknown>, expected: boolean) => {
    assert.equal(permitted(recipe), expected, JSON.stringify(recipe));
    assert.equal(Boolean(drillFormat.readDesign({...fixture.design, drill: recipe})), expected, JSON.stringify(recipe));
  };
  for (const formation of ['line', 'split', 'convoy']) for (const reaction of ['steady', 'charge', 'scatter']) {
    for (const direction of ['left', 'right', 'alternating']) for (const modifier of ['none', 'draft']) {
      expectBoth({family: 'stampede', formation, direction, reaction, modifier}, formation !== 'convoy' || reaction === 'steady');
    }
  }
  for (const layout of ['winding', 'forked', 'alternating']) for (const flow of ['steady', 'pulsing']) {
    for (const modifier of ['none', 'eddies']) expectBoth({family: 'rapids', layout, flow, modifier}, true);
  }
  for (const branch of branches) {
    assert.equal(branch.type, 'object'); assert.equal(branch.additionalProperties, false);
    assert.deepEqual([...branch.required].sort(), Object.keys(branch.properties).sort());
  }
  for (const item of safetyDrillFixtures) {
    expectBoth(item.design.drill, true);
    expectBoth({...item.design.drill, family: 'teleport'}, false);
    expectBoth({...item.design.drill, strength: 100}, false);
    for (const key of Object.keys(item.design.drill)) {
      const missing: Record<string, unknown> = {...item.design.drill};
      delete missing[key];
      expectBoth(missing, false);
      expectBoth({...item.design.drill, [key]: 'unsupported'}, false);
      expectBoth({...item.design.drill, [key]: 1}, false);
    }
  }
});
