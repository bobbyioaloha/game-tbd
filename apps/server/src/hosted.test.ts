import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PipelineProfilesSchema, proceduralFixtures, appearanceToRecipe } from '@sky/shared';
import { setTimeout as delay } from 'node:timers/promises';
import { buildApp } from './app.js';
import { buildHostedApp } from './hosted.js';
import { CreationPipeline } from './generation/pipeline.js';
import { pipelineProfiles } from './generation/pipeline-config.js';
import { RedisAttempts, READ_LIVE_STATUS } from './generation/redis-attempts.js';
import { PipelineFailure } from './generation/pipeline-errors.js';

const env = {VERCEL_ENV:'production',HOSTED_LIVE_ENABLED:'true',APP_ORIGIN:'https://game.example',
  OPENAI_API_KEY:'fake-provider-secret',UPSTASH_REDIS_REST_URL:'https://redis.example',UPSTASH_REDIS_REST_TOKEN:'fake-redis-secret'};
const paidAttempt = () => ({id:randomUUID(),confirmed:true as const});
const input = () => ({text:'red rocket with fins',profileId:'sol-astra',geometryMode:'primitives' as const,paidAttempt:paidAttempt()});
const failure = (code:string) => (error:unknown) => error instanceof PipelineFailure && error.code === code;

test('hosted builds stay mock-only without explicit production enablement; health never calls a provider',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('Unexpected network');};
  try {
    for (const settings of [{},{...env,VERCEL_ENV:'preview'},{...env,VERCEL_ENV:'development'},{...env,HOSTED_LIVE_ENABLED:'false'}]) {
      const app=buildHostedApp(settings);
      try {
        assert.equal((await app.inject('/api/health')).json().mode,'mock');
        const profiles=PipelineProfilesSchema.parse((await app.inject('/api/lab/profiles')).json());
        assert.equal(profiles.liveUsage.enabled,false);
        assert.ok(profiles.profiles.filter(p=>p.mode==='live').every(p=>!p.available));
        const mock=await app.inject({method:'POST',url:'/api/lab/events',payload:{...input(),text:'hungry purple planet',profileId:'mock'}});
        assert.equal(JSON.parse(mock.body.trim().split('\n').at(-1)!).type,'complete');
      } finally {await app.close();}
    }
    assert.equal(calls,0);
  } finally {globalThis.fetch=original;}
});

test('hosted live configuration requires secrets and one exact HTTPS origin',()=>{
  for (const field of ['OPENAI_API_KEY','APP_ORIGIN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN']) {
    assert.throws(()=>buildHostedApp({...env,[field]:''}));
  }
  for (const origin of ['http://game.example','https://game.example/','https://game.example/path','https://user:pass@game.example']) {
    assert.throws(()=>buildHostedApp({...env,APP_ORIGIN:origin}),/APP_ORIGIN/);
  }
});

test('hosted typed and voice requests reject missing/foreign origins; shared disabled gate prevents dispatch',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,options)=>{
    assert.equal(String(url),env.UPSTASH_REDIS_REST_URL);calls++;
    const command=JSON.parse(String(options?.body));
    return Response.json({result:command[1]===READ_LIVE_STATUS ? [0,100,12,0] : 'LIVE_DISABLED'});
  };
  const app=buildHostedApp(env);
  try {
    assert.equal((await app.inject('/api/health')).json().mode,'live');assert.equal(calls,0);
    for (const origin of [undefined,'http://localhost:5173','https://game.example.evil','https://other.vercel.app']) {
      const headers=origin ? {origin} : {};
      const text=await app.inject({method:'POST',url:'/api/lab/events',headers,payload:input()});
      assert.equal(text.statusCode,403);
      const body=new FormData();
      body.append('options',JSON.stringify({profileId:'sol-astra',captureMs:1000,paidAttempt:paidAttempt()}));
      body.append('audio',new Blob(['RIFF1234WAVEaudio'],{type:'audio/wav'}),'clip.wav');
      const request=new Request('https://game.example',{method:'POST',body});
      const voice=await app.inject({method:'POST',url:'/api/voice/events',headers:{...headers,'content-type':request.headers.get('content-type')!},payload:Buffer.from(await request.arrayBuffer())});
      assert.equal(voice.statusCode,403);
    }
    assert.equal(calls,0);
    const profilesResponse=await app.inject('/api/lab/profiles');
    const profiles=PipelineProfilesSchema.parse(profilesResponse.json());
    assert.deepEqual(profiles.liveUsage,{enabled:false,maxAttempts:100,attemptsUsed:12,attemptsRemaining:88,busy:false});
    assert.equal(profiles.transcription?.available,false);
    const response=await app.inject({method:'POST',url:'/api/lab/events',headers:{origin:env.APP_ORIGIN},payload:input()});
    assert.equal(JSON.parse(response.body.trim()).error.code,'LIVE_DISABLED');
    for (const text of [profilesResponse.body,response.body]) {
      assert.ok(!text.includes(env.OPENAI_API_KEY));assert.ok(!text.includes(env.UPSTASH_REDIS_REST_TOKEN));
    }
  } finally {await app.close();globalThis.fetch=original;}
});

test('failed or uncertain Redis reservation makes exactly one request and exposes no credentials',async()=>{
  for (const transport of [async()=>{throw new Error(env.UPSTASH_REDIS_REST_TOKEN);},async()=>Response.json({error:env.UPSTASH_REDIS_REST_TOKEN}),async()=>Response.json({result:'bad-response'})]) {
    let calls=0;
    const attempts=new RedisAttempts(env.UPSTASH_REDIS_REST_URL,env.UPSTASH_REDIS_REST_TOKEN,async()=>{calls++;return transport();});
    await assert.rejects(attempts.acquire(input()),error=>failure('NOT_CONFIGURED')(error) && !String(error).includes(env.UPSTASH_REDIS_REST_TOKEN));
    assert.equal(calls,1);
  }
});

test('cancellation during asynchronous reservation releases the slot without starting providers',async()=>{
  let reserved!:()=>void,finish!:()=>void,released=0,calls=0;
  const started=new Promise<void>(resolve=>{reserved=resolve;});
  const waiting=new Promise<void>(resolve=>{finish=resolve;});
  const pipeline=new CreationPipeline(pipelineProfiles(env,true),{mock:{run:async()=>{throw new Error('Unexpected mock');}},live:{run:async()=>{calls++;throw new Error('Unexpected provider');}}},
    undefined,{enabled:true,maxAttempts:3},undefined,{
      readStatus:async()=>({enabled:true,maxAttempts:100,attemptsUsed:1,attemptsRemaining:99,busy:true}),
      acquire:async()=>{reserved();await waiting;return async()=>{released++;};},
    });
  const controller=new AbortController();
  const running=pipeline.run(input(),{signal:controller.signal});
  await started;controller.abort();finish();
  await assert.rejects(running,failure('CANCELLED'));
  assert.equal(calls,0);assert.equal(released,1);
});

test('the slot stays reserved across both generation stages and awaits release',async()=>{
  let active=false,released=false;
  const fixture=proceduralFixtures.find(item=>item.prompt==='red rocket with fins')!;
  const pipeline=new CreationPipeline(pipelineProfiles(env,true),{mock:{run:async()=>{throw new Error('Unexpected mock');}},live:{run:async request=>{
    assert.equal(active,true);return {data:request.stage==='design'?fixture.design:appearanceToRecipe(fixture.appearance)};
  }}},undefined,{enabled:true,maxAttempts:3},undefined,{
    readStatus:async()=>({enabled:true,maxAttempts:100,attemptsUsed:0,attemptsRemaining:100,busy:active}),
    acquire:async()=>{active=true;return async()=>{await Promise.resolve();active=false;released=true;};},
  });
  await pipeline.run(input());assert.equal(released,true);assert.equal(active,false);
});

test('HTTP progress streams before generation finishes and disconnect cancels work', {timeout:5000},async t=>{
  let upstreamSignal:AbortSignal|undefined,released!:()=>void;
  const releaseDone=new Promise<void>(resolve=>{released=resolve;});
  const pipeline=new CreationPipeline(pipelineProfiles(env,true),{
    mock:{run:async()=>{throw new Error('Unexpected mock');}},
    live:{run:async request=>{upstreamSignal=request.signal;return new Promise(()=>{});}},
  },undefined,{enabled:true,maxAttempts:3},undefined,{
    readStatus:async()=>({enabled:true,maxAttempts:100,attemptsUsed:1,attemptsRemaining:99,busy:true}),
    acquire:async()=>async()=>{released();},
  });
  const app=buildApp({pipeline,allowedOrigin:origin=>origin===env.APP_ORIGIN});
  const controller=new AbortController();
  try {
    const address=await app.listen({host:'127.0.0.1',port:0});
    const response=await fetch(address+'/api/lab/creations',{method:'POST',headers:{'Content-Type':'application/json',Origin:env.APP_ORIGIN},body:JSON.stringify(input()),signal:AbortSignal.any([controller.signal,t.signal])});
    const reader=response.body!.getReader();
    const first=await reader.read();
    assert.match(new TextDecoder().decode(first.value),/"stage":"design"/);
    assert.equal(upstreamSignal?.aborted,false);
    await reader.cancel();controller.abort();
    await Promise.race([releaseDone,delay(1000).then(()=>{throw new Error('Disconnect did not release the attempt');})]);
    assert.equal(upstreamSignal?.aborted,true);
  } finally {controller.abort();app.server.closeAllConnections();await app.close();}
});
