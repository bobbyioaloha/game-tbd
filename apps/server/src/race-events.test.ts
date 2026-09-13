import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { raceEventFixtures, appearanceToRecipe, RaceEventCreationSchema, RaceEventPipelineEventSchema, RaceEventVoiceEventSchema, proceduralFixtures } from '@sky/shared';
import { CreationPipeline } from './generation/pipeline.js';
import { pipelineProfiles } from './generation/pipeline-config.js';
import { mockStageTransport, type ModelStageRequest } from './generation/stage-transport.js';
import { buildApp } from './app.js';
const fixture=raceEventFixtures[0];
function harness(live=false) {
  const calls:ModelStageRequest[]=[];
  const transport={run:async(request:ModelStageRequest)=>{
    calls.push(request);
    const appearance=fixture.spec.appearance;assert.equal(appearance.type,'primitives');
    return {data:request.stage==='design'?fixture.design:appearanceToRecipe(appearance)};
  }};
  return {calls,pipeline:new CreationPipeline(pipelineProfiles(live?{OPENAI_API_KEY:'test-fake-key'}:{},live),{mock:transport,live:transport},undefined,
    {enabled:live,maxAttempts:3},{mock:{model:'mock',transcribe:async()=>fixture.prompt},live:{model:'test-speech',transcribe:async()=>fixture.prompt}})};
}
test('event design selects a type; server resolves balance and geometry sees only the visual brief',async()=>{
  const {pipeline,calls}=harness();const events:unknown[]=[];
  const spec=await pipeline.runEvent({text:fixture.prompt,profileId:'mock',geometryMode:'primitives'},{emit:event=>events.push(event)});
  RaceEventCreationSchema.parse(spec);assert.deepEqual(spec.effect,fixture.spec.effect);assert.equal(spec.description,fixture.spec.description);
  assert.equal(calls.length,2);assert.equal(calls[1].input,fixture.design.visualBrief);assert.equal(calls[1].product,'race-event');
  events.forEach(event=>RaceEventPipelineEventSchema.parse(event));
});
test('model cannot invent an event or override preset balance; rejection precedes geometry',async()=>{
  for(const design of [{...fixture.design,effectType:'killEveryone'},{...fixture.design,durationSeconds:100}]) {
    let calls=0;const pipeline=new CreationPipeline(pipelineProfiles({}),{mock:{run:async()=>{calls++;return {data:design};}}});
    await assert.rejects(pipeline.runEvent({text:'planet',profileId:'mock'}),/valid visual brief/);assert.equal(calls,1);
  }
});
test('new typed and voice routes return v3 and preserve the shared paid gate across legacy routes',async()=>{
  const {pipeline,calls}=harness(true),app=buildApp({pipeline});
  const request={text:fixture.prompt,profileId:'sol-direct',geometryMode:'primitives'};
  try {
    const blocked=await app.inject({method:'POST',url:'/api/lab/events',payload:request});assert.equal(blocked.statusCode,400);assert.equal(calls.length,0);
    const paidAttempt={id:randomUUID(),confirmed:true as const};
    const response=await app.inject({method:'POST',url:'/api/lab/events',payload:{...request,paidAttempt}});
    const events=response.body.trim().split('\n').map(line=>RaceEventPipelineEventSchema.parse(JSON.parse(line)));
    assert.equal(events.at(-1)?.type,'complete');assert.equal((await pipeline.liveUsage).attemptsUsed,1);
    await assert.rejects(pipeline.run({...request,geometryMode:'primitives',paidAttempt}),/already/);
    const form=new FormData();form.append('options',JSON.stringify({profileId:'sol-direct',geometryMode:'primitives',captureMs:1000,paidAttempt:{id:randomUUID(),confirmed:true}}));
    form.append('audio',new Blob(['RIFF1234WAVEaudio'],{type:'audio/wav'}),'recording');
    const upload=new Request('http://localhost',{method:'POST',body:form});
    const voice=await app.inject({method:'POST',url:'/api/voice/events',headers:{'content-type':upload.headers.get('content-type')!},payload:Buffer.from(await upload.arrayBuffer())});
    const voiceEvents=voice.body.trim().split('\n').map(line=>RaceEventVoiceEventSchema.parse(JSON.parse(line)));
    assert.equal(voiceEvents.at(-1)?.type,'complete');assert.equal(calls.length,4);assert.equal((await pipeline.liveUsage).attemptsUsed,2);
  } finally {await app.close();}
});
test('real mock handoff resolves all four distinct events and keeps legacy mocks v2',async()=>{
  const pipeline=new CreationPipeline(pipelineProfiles({}),{mock:mockStageTransport});
  await Promise.all(raceEventFixtures.map(async fixture=>{
    const spec=await pipeline.runEvent({text:fixture.prompt,profileId:'mock',geometryMode:'primitives'});
    assert.deepEqual(spec.appearance,fixture.spec.appearance);assert.equal(spec.effect.type,fixture.spec.effect.type);
  }));
  const legacy=await pipeline.run({text:proceduralFixtures[0].prompt,profileId:'mock',geometryMode:'primitives'});assert.equal(legacy.version,2);
});
