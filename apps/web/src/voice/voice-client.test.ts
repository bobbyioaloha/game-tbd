import test from 'node:test';
import assert from 'node:assert/strict';
import { proceduralFixtures, type VoiceEvent } from '@sky/shared';
import { requestVoice, VoiceRequestError } from './voice-client';
const recording={blob:new Blob(['audio'],{type:'audio/webm'}),captureMs:1000};
const request={profileId:'mock',geometryMode:'primitives' as const,mockText:'red rocket with fins'};
const result={text:'red rocket with fins',metric:{model:'mock-transcription',durationMs:250}};
const call=()=>requestVoice(recording,request,new AbortController().signal);

test('voice client accepts validated completion and rejects incomplete or malformed streams',async()=>{
  const original=globalThis.fetch;
  const complete:VoiceEvent={type:'complete',result,spec:proceduralFixtures[0].spec,elapsedMs:1000};
  try {
    globalThis.fetch=async(_url,init)=>{
      assert.ok(init?.body instanceof FormData);
      assert.equal(JSON.parse(String(init.body.get('options'))).captureMs,1000);
      return new Response(JSON.stringify(complete)+'\n');
    };
    assert.equal((await call()).result.text,result.text);
    for(const data of [
      {type:'transcript',result},
      {...complete,spec:{...complete.spec,effects:[{type:'executeJavaScript',code:'invalid'}]}},
      {...complete,result:{...result,text:'one two three four five six seven eight nine ten eleven'}},
    ]){
      globalThis.fetch=async()=>new Response(JSON.stringify(data)+'\n');
      await assert.rejects(call());
    }
    globalThis.fetch=async()=>new Response(JSON.stringify(complete)+'\n'+JSON.stringify(complete)+'\n');
    await assert.rejects(call(),/Unexpected data/);
  } finally {globalThis.fetch=original;}
});
test('voice client reports structured speech errors and speech-only sends no creation request',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({type:'failed',error:{code:'INVALID_TRANSCRIPT',message:'Use up to ten words.'},elapsedMs:500})+'\n');
    await assert.rejects(call(),error=>error instanceof VoiceRequestError&&error.detail.code==='INVALID_TRANSCRIPT');
    let calls=0;
    globalThis.fetch=async(url)=>{calls++;assert.equal(url,'/api/voice/transcriptions');return new Response(JSON.stringify(result));};
    const response=await requestVoice(recording,request,new AbortController().signal,{transcribeOnly:true});
    assert.deepEqual(response,{result});assert.equal(calls,1);
  } finally {globalThis.fetch=original;}
});
