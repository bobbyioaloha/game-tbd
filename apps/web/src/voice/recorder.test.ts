import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneRecorder, type RecorderDependencies } from './recorder';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function device(empty=false) {
  let stopped=0,starts=0;
  const stream={getTracks:()=>[{stop:()=>{stopped++;}}]} as unknown as MediaStream;
  class FakeRecorder {
    state='inactive';mimeType='audio/webm;codecs=opus';
    ondataavailable:((event:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;
    start(){starts++;this.state='recording';}
    stop(){if(this.state==='inactive')return;this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob([new Uint8Array(empty?[]:[0x1a,0x45,0xdf,0xa3,1])])});this.onstop?.();});}
  }
  let current!:FakeRecorder;
  const deps:RecorderDependencies={media:async()=>stream,recorder:()=>{current=new FakeRecorder();return current as unknown as MediaRecorder;}};
  return {deps,stream,current:()=>current,counts:()=>({stopped,starts})};
}
test('permission setup is separate; release returns the clip and releases every track',async()=>{
  const fake=device(),recorder=new MicrophoneRecorder(fake.deps);
  await assert.rejects(recorder.start(),/Enable the microphone/);
  await recorder.prepare();assert.equal(fake.counts().starts,0);assert.equal(fake.counts().stopped,1);
  await recorder.start();const clip=await recorder.stop();assert.equal(clip.blob.type,'audio/webm');assert.ok(clip.blob.size);assert.equal(fake.counts().stopped,2);
  recorder.cancel();await assert.rejects(recorder.stop(),/No active recording/);
});
test('release during pending media setup invalidates the late stream and never starts recording',async()=>{
  const fake=device(),recorder=new MicrophoneRecorder(fake.deps);await recorder.prepare();
  let resolve!:(stream:MediaStream)=>void;fake.deps.media=()=>new Promise(done=>{resolve=done;});
  const starting=recorder.start();const rejected=assert.rejects(starting,/cancelled/);
  await assert.rejects(recorder.stop(),/before the microphone was ready/);
  resolve(fake.stream);await rejected;assert.equal(fake.counts().starts,0);assert.equal(fake.counts().stopped,2);
});
test('recording auto-stop fires once and exposes the finished clip to the caller',async()=>{
  const fake=device(),recorder=new MicrophoneRecorder(fake.deps,20);await recorder.prepare();
  let calls=0,done!:()=>void;const finished=new Promise<void>(resolve=>{done=resolve;});
  await recorder.start(()=>{calls++;done();});await finished;
  const clip=await recorder.stop();assert.ok(clip.captureMs>0&&clip.captureMs<=20);assert.equal(calls,1);assert.equal(fake.counts().stopped,2);
  recorder.cancel();
});
test('cancellation during permission setup stops late tracks and cannot mark the device ready',async()=>{
  const fake=device();let resolve!:(stream:MediaStream)=>void;fake.deps.media=()=>new Promise(done=>{resolve=done;});
  const recorder=new MicrophoneRecorder(fake.deps);const preparing=recorder.prepare();recorder.cancel();resolve(fake.stream);await preparing;await flush();
  assert.equal(recorder.getSnapshot().ready,false);assert.equal(fake.counts().stopped,1);assert.equal(fake.counts().starts,0);
});

test('device failure notifies the attempt once and releases the microphone',async()=>{
  const fake=device(),recorder=new MicrophoneRecorder(fake.deps);await recorder.prepare();
  const errors:Error[]=[];
  await recorder.start(()=>assert.fail('Failed recording reached submission'),error=>errors.push(error));
  fake.current().onerror?.();await flush();fake.current().onerror?.();
  assert.equal(errors.length,1);assert.match(errors[0].message,/stopped unexpectedly/);
  assert.equal(recorder.getSnapshot().phase,'error');assert.equal(fake.counts().stopped,2);
  await assert.rejects(recorder.stop(),/No active recording/);
});
test('an empty auto-stopped recording reports failure instead of leaving the attempt waiting',async()=>{
  const fake=device(true),recorder=new MicrophoneRecorder(fake.deps,20);await recorder.prepare();
  let done!:(error:Error)=>void;const failed=new Promise<Error>(resolve=>{done=resolve;});
  await recorder.start(()=>assert.fail('Empty recording was submitted'),done);
  assert.match((await failed).message,/recording was empty/);
  assert.equal(recorder.getSnapshot().phase,'error');assert.equal(fake.counts().stopped,2);
});
test('deliberate cancellation does not report a device failure',async()=>{
  const fake=device(),recorder=new MicrophoneRecorder(fake.deps);await recorder.prepare();
  await recorder.start(()=>assert.fail('Cancelled recording was submitted'),()=>assert.fail('Cancellation reported as failure'));
  recorder.cancel();await flush();assert.equal(fake.counts().stopped,2);
});
