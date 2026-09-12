import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { meshFixture, GeneratedCreationSchema, PipelineEventSchema, type PipelineEvent } from '@sky/shared';
import { CreationPipeline } from './generation/pipeline.js';
import { pipelineProfiles, resolveAPIKey } from './generation/pipeline-config.js';
import { PipelineFailure } from './generation/pipeline-errors.js';
import type { ModelStageRequest, StageTransport } from './generation/stage-transport.js';
import { buildApp } from './app.js';

const design = {displayName:'Wind crystal',description:'Slow descent.',visualBrief:'A cyan crystal with pointed ends.',effect:{type:'reduceFallSpeed',multiplier:0.5,durationSeconds:8}};
const appearance = meshFixture.appearance;
if (appearance.type !== 'mesh') throw new Error('Expected mesh fixture');
const geometry = {vertices:appearance.vertices.map(([x,y,z]) => ({x,y,z})),faces:appearance.triangles.map(([a,b,c],i) => ({a,b,c,color:appearance.faceColors[i]}))};
function harness(run:StageTransport['run'],budget?:{totalMs:number;designMs:number}) {
  return new CreationPipeline(pipelineProfiles({}),{mock:{run}},budget);
}
test('pipeline hands only visual brief to geometry and assembles one effect',async () => {
  const calls:ModelStageRequest[] = [], events:PipelineEvent[] = [];
  const pipeline = harness(async request => {
    calls.push(request);
    return {data:request.stage === 'design' ? design : geometry,usage:{inputTokens:10,outputTokens:20}};
  });
  const spec = await pipeline.run({text:'wind crystal',profileId:'mock'},{emit:event => events.push(event)});
  assert.equal(calls.length,2);
  assert.equal(calls[0].input,'wind crystal');
  assert.equal(calls[1].input,design.visualBrief);
  assert.equal(calls[1].input.includes('reduceFallSpeed'),false);
  assert.deepEqual(spec.effects,[design.effect]);
  assert.equal(spec.appearance.type,'mesh');
  assert.ok(GeneratedCreationSchema.safeParse(spec).success);
  assert.deepEqual(events.map(event => event.type),['stage','design','stage','geometry','stage','complete']);
  events.forEach(event => assert.ok(PipelineEventSchema.safeParse(event).success));
});
test('invalid input/design stops before geometry, without retry',async () => {
  let calls = 0;
  const pipeline = harness(async () => {calls++;return {data:{...design,effect:{type:'fly'}}};});
  await assert.rejects(pipeline.run({text:'',profileId:'mock'}),error => error instanceof PipelineFailure && error.code === 'INVALID_REQUEST');
  assert.equal(calls,0);
  await assert.rejects(pipeline.run({text:'crystal',profileId:'mock'}),error => error instanceof PipelineFailure && error.code === 'INVALID_DESIGN');
  assert.equal(calls,1);
});
test('geometry cannot override effects; invalid mesh fails without repair calls',async () => {
  for (const bad of [{...geometry,effect:{type:'invulnerability',durationSeconds:5}},
    {...geometry,faces:[{a:0,b:0,c:1,color:'#ffffff'}]}]) {
    let calls = 0;
    const pipeline = harness(async request => {calls++;return {data:request.stage === 'design' ? design : bad};});
    await assert.rejects(pipeline.run({text:'crystal',profileId:'mock'}),error => error instanceof PipelineFailure && error.code === 'INVALID_MESH');
    assert.equal(calls,2);
  }
});
test('design timeout aborts stage even if transport ignores signal',async () => {
  let calls = 0, signal:AbortSignal | undefined;
  const pipeline = harness(async request => {calls++;signal=request.signal;return new Promise(() => {});},{totalMs:200,designMs:10});
  await assert.rejects(pipeline.run({text:'crystal',profileId:'mock'}),error => error instanceof PipelineFailure && error.code === 'TIMEOUT');
  assert.equal(calls,1);assert.ok(signal?.aborted);
});
test('geometry shares total deadline and cannot start a fresh full budget',async () => {
  let calls = 0, geometrySignal:AbortSignal | undefined;
  const pipeline = harness(async request => {
    calls++;
    if (request.stage === 'design') {await delay(20);return {data:design};}
    geometrySignal=request.signal;return new Promise(() => {});
  },{totalMs:70,designMs:50});
  await assert.rejects(pipeline.run({text:'crystal',profileId:'mock'}),error => error instanceof PipelineFailure && error.code === 'TIMEOUT');
  assert.equal(calls,2);assert.ok(geometrySignal?.aborted);
});
test('cancelled attempt never emits complete and starts no further stages',async () => {
  const controller = new AbortController(), events:PipelineEvent[] = [];
  let calls = 0;
  const pipeline = harness(async () => {calls++;controller.abort();return {data:design};});
  await assert.rejects(pipeline.run({text:'crystal',profileId:'mock'},{signal:controller.signal,emit:event => events.push(event)}));
  assert.equal(calls,1);
  assert.equal(events.some(event => event.type === 'complete'),false);
  const last=events.at(-1);assert.ok(last?.type === 'failed' && last.error.code === 'CANCELLED');
});
test('missing key prevents live calls, and secrets are never exposed in profiles',async () => {
  const profiles = pipelineProfiles({OPENAI_API_KEY:'test-secret'});
  assert.equal(JSON.stringify(profiles).includes('test-secret'),false);
  const pipeline = harness(async () => {assert.fail('Must not call provider');});
  await assert.rejects(pipeline.run({text:'crystal',profileId:'sol-astra'}),error => error instanceof PipelineFailure && error.code === 'NOT_CONFIGURED');
});
test('lab stream carries validated progress and preserves raw-spec endpoint',async () => {
  const pipeline = harness(async request => ({data:request.stage === 'design' ? design : geometry}));
  const app = buildApp({pipeline});
  try {
    const response = await app.inject({method:'POST',url:'/api/lab/creations',payload:{text:'crystal',profileId:'mock'}});
    assert.equal(response.statusCode,200);
    assert.match(String(response.headers['content-type']),/ndjson/);
    const events=response.body.trim().split('\n').map(line => PipelineEventSchema.parse(JSON.parse(line)));
    assert.equal(events[1].type,'design');assert.equal(events.at(-1)?.type,'complete');
    const final=await app.inject({method:'POST',url:'/api/creations',payload:{text:'crystal'}});
    assert.ok(GeneratedCreationSchema.safeParse(final.json()).success);
    const unavailable=await app.inject({method:'POST',url:'/api/lab/creations',payload:{text:'crystal',profileId:'sol-astra'}});
    assert.equal(unavailable.statusCode,503);
    const invalid=await app.inject({method:'POST',url:'/api/lab/creations',payload:{text:'crystal',profileId:'unknown'}});
    assert.equal(invalid.statusCode,400);
  } finally {await app.close();}
});
test('stream failure identifies its stage without exposing provider internals',async () => {
  const pipeline=harness(async request => {
    if(request.stage==='geometry') throw new Error('secret provider message');
    return {data:design};
  });
  const app=buildApp({pipeline});
  try {
    const response=await app.inject({method:'POST',url:'/api/lab/creations',payload:{text:'crystal',profileId:'mock'}});
    const last=JSON.parse(response.body.trim().split('\n').at(-1)!);
    assert.equal(last.stage,'geometry');assert.equal(last.type,'failed');
    assert.equal(response.body.includes('secret provider'),false);
  } finally {await app.close();}
});

test('disconnecting the lab stream aborts server-side work',async () => {
  let aborted!: () => void;
  const observed = new Promise<void>(resolve => {aborted=resolve;});
  let calls=0;
  const pipeline=harness(async request => {
    calls++;
    request.signal.addEventListener('abort',() => aborted(),{once:true});
    return new Promise(() => {});
  });
  const app=buildApp({pipeline});
  const controller=new AbortController();
  try {
    const url=await app.listen({port:0,host:'127.0.0.1'});
    const response=await fetch(url+'/api/lab/creations',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:'crystal',profileId:'mock'}),signal:controller.signal,
    });
    const reader=response.body!.getReader();
    await reader.read();
    controller.abort();
    await Promise.race([observed,delay(1000).then(() => {throw new Error('Server did not cancel');})]);
    assert.equal(calls,1);
    await reader.cancel().catch(() => {});
  } finally {controller.abort();app.server.closeAllConnections();await app.close();}
});


test('blank primary API key falls back to the legacy key without exposing it', () => {
  assert.equal(resolveAPIKey({OPENAI_API_KEY: ' primary-test-key ', AI_API_KEY: 'legacy-test-secret'}), 'primary-test-key');
  assert.equal(resolveAPIKey({OPENAI_API_KEY: ' ', AI_API_KEY: ' legacy-test-secret '}), 'legacy-test-secret');
  assert.equal(resolveAPIKey({}), undefined);
  const profiles = pipelineProfiles({OPENAI_API_KEY: '  ', AI_API_KEY: 'legacy-test-secret'});
  assert.ok(profiles.filter(profile => profile.mode === 'live').every(profile => profile.available));
  assert.equal(JSON.stringify(profiles).includes('legacy-test-secret'), false);
  const unavailable = pipelineProfiles({OPENAI_API_KEY: ' ', AI_API_KEY: ' '});
  assert.ok(unavailable.filter(profile => profile.mode === 'live').every(profile => !profile.available));
});
