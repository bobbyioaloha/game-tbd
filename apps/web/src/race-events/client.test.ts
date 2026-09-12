import test from 'node:test';
import assert from 'node:assert/strict';
import { raceEventFixtures, proceduralFixtures } from '@sky/shared';
import { raceEventClient } from './client';
const complete={type:'complete',spec:raceEventFixtures[0].spec,elapsedMs:200,metrics:[]};
test('event client validates v3, rejects legacy responses and sends only explicit attempts',async()=>{
  const original=globalThis.fetch;let calls=0;
  try {
    globalThis.fetch=async(url,options)=>{
      calls++;assert.equal(url,'/api/lab/events');assert.ok(options?.signal);
      const request=JSON.parse(String(options?.body));assert.equal(request.profileId,'mock');assert.equal(request.paidAttempt,undefined);
      return new Response(JSON.stringify(calls===1?complete:{...complete,spec:proceduralFixtures[0].spec})+'\n');
    };
    const request={text:'hungry purple planet',profileId:'mock'};
    assert.equal((await raceEventClient.generate(request,new AbortController().signal)).version,3);
    await assert.rejects(raceEventClient.generate(request,new AbortController().signal));assert.equal(calls,2);
  } finally {globalThis.fetch=original;}
});
test('voice event client uses its dedicated endpoint and surfaces failure without retry',async()=>{
  const original=globalThis.fetch;let calls=0;
  try {
    globalThis.fetch=async(url,options)=>{
      calls++;assert.equal(url,'/api/voice/events');assert.ok(options?.body instanceof FormData);
      const metadata=JSON.parse(String(options.body.get('options')));assert.equal(metadata.mockText,'hungry purple planet');assert.equal(metadata.captureMs,1000);
      return new Response(JSON.stringify({type:'failed',elapsedMs:10,error:{code:'INVALID_TRANSCRIPT',message:'Use one to ten words.'}})+'\n');
    };
    await assert.rejects(raceEventClient.generateVoice({blob:new Blob(['fake clip']),captureMs:1000},
      {profileId:'mock',mockText:'hungry purple planet'},new AbortController().signal),/INVALID_TRANSCRIPT/);assert.equal(calls,1);
  } finally {globalThis.fetch=original;}
});
