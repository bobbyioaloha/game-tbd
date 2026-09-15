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

test('a stalled repeat permission check times out, allows recovery, and releases a late stream',async()=>{
  const fake=device(),recorder=new MicrophoneRecorder(fake.deps,8000,20);
  await recorder.prepare();
  let resolve!:(stream:MediaStream)=>void,calls=0;
  fake.deps.media=()=>{calls++;return new Promise(done=>{resolve=done;});};
  await recorder.prepare();
  assert.equal(recorder.getSnapshot().phase,'error');
  assert.equal(recorder.getSnapshot().ready,false);
  assert.match(recorder.getSnapshot().message,/Microphone did not respond/);
  assert.equal(calls,1);assert.equal(fake.counts().starts,0);
  fake.deps.media=async()=>fake.stream;
  await recorder.prepare();
  const recovered=recorder.getSnapshot();
  assert.equal(recovered.phase,'ready');assert.equal(recovered.ready,true);
  resolve(fake.stream);await flush();
  assert.equal(recorder.getSnapshot(),recovered);
  assert.equal(fake.counts().stopped,3);
});
test('stalled capture startup fails once before recording and releases a late stream',async()=>{
  const fake=device(),recorder=new MicrophoneRecorder(fake.deps,8000,20);
  await recorder.prepare();
  let resolve!:(stream:MediaStream)=>void,calls=0;
  fake.deps.media=()=>{calls++;return new Promise(done=>{resolve=done;});};
  const errors:Error[]=[];
  await assert.rejects(recorder.start(()=>assert.fail('Unopened microphone submitted'),error=>errors.push(error)),/Microphone did not respond/);
  assert.equal(errors.length,1);assert.equal(calls,1);
  assert.equal(recorder.getSnapshot().phase,'error');assert.equal(fake.counts().starts,0);
  const failed=recorder.getSnapshot();
  resolve(fake.stream);await flush();
  assert.equal(recorder.getSnapshot(),failed);assert.equal(errors.length,1);
  assert.equal(fake.counts().stopped,2);assert.equal(fake.counts().starts,0);
  recorder.cancel();
});
test('cancelling an unanswered permission check settles immediately and releases its late stream',async()=>{
  const fake=device(),recorder=new MicrophoneRecorder(fake.deps);
  let resolve!:(stream:MediaStream)=>void;
  fake.deps.media=()=>new Promise(done=>{resolve=done;});
  let settled=false;
  const preparing=recorder.prepare().then(()=>{settled=true;});
  recorder.cancel();await flush();
  assert.equal(settled,true);assert.equal(recorder.getSnapshot().phase,'idle');
  resolve(fake.stream);await preparing;await flush();
  assert.equal(recorder.getSnapshot().ready,false);
  assert.equal(fake.counts().stopped,1);assert.equal(fake.counts().starts,0);
});
test('cancelling unanswered capture startup settles without a device error or late recording',async()=>{
  const fake=device(),recorder=new MicrophoneRecorder(fake.deps);await recorder.prepare();
  let resolve!:(stream:MediaStream)=>void;
  fake.deps.media=()=>new Promise(done=>{resolve=done;});
  let settled=false;
  const rejected=assert.rejects(recorder.start(undefined,()=>assert.fail('Cancellation reported as device failure')),/cancelled/).then(()=>{settled=true;});
  recorder.cancel();await flush();
  assert.equal(settled,true);assert.equal(recorder.getSnapshot().phase,'ready');
  resolve(fake.stream);await rejected;await flush();
  assert.equal(fake.counts().stopped,2);assert.equal(fake.counts().starts,0);
});
test('cancellation between acquired stream resolution and continuation cannot restore readiness or record',async()=>{
  for(const mode of ['prepare','start'] as const){
    const fake=device(),recorder=new MicrophoneRecorder(fake.deps);
    if(mode==='start')await recorder.prepare();
    let resolve!:(stream:MediaStream)=>void;
    fake.deps.media=()=>new Promise(done=>{resolve=done;});
    const pending=mode==='prepare'?recorder.prepare():recorder.start(undefined,()=>assert.fail('Stale acquisition reported as failure'));
    const settled=mode==='start'?assert.rejects(pending,/cancelled/):pending;
    resolve(fake.stream);
    // The acquisition has resolved, but prepare/start has not resumed from await.
    await Promise.resolve();
    recorder.cancel();await settled;
    assert.equal(recorder.getSnapshot().phase,mode==='prepare'?'idle':'ready');
    assert.equal(recorder.getSnapshot().ready,mode==='start');
    assert.equal(fake.counts().starts,0);assert.equal(fake.counts().stopped,mode==='prepare'?1:2);
  }
});

test('cancellation from the preparing notification prevents opening a microphone',async()=>{
  for(const mode of ['prepare','start'] as const){
    const fake=device(),recorder=new MicrophoneRecorder(fake.deps);
    if(mode==='start')await recorder.prepare();
    let calls=0;
    fake.deps.media=()=>{calls++;return new Promise(()=>{});};
    const unsubscribe=recorder.subscribe(()=>{
      if(recorder.getSnapshot().phase==='preparing')recorder.cancel();
    });
    let settled=false;
    const pending=mode==='prepare'?recorder.prepare():recorder.start(undefined,()=>assert.fail('Cancellation reported as device failure'));
    const completed=(mode==='start'?assert.rejects(pending,/cancelled/):pending).then(()=>{settled=true;});
    await flush();
    assert.equal(settled,true);assert.equal(calls,0);
    assert.equal(recorder.getSnapshot().phase,mode==='prepare'?'idle':'ready');
    assert.equal(fake.counts().starts,0);
    await completed;unsubscribe();recorder.cancel();
  }
});


function retainedDevice() {
  let acquisitions=0,starts=0,stopped=0,meters=0,closedMeters=0;
  const streams:MediaStream[]=[];
  type Track={readyState:'live'|'ended';enabled:boolean;stop:()=>void;end:()=>void;listeners:Set<()=>void>;addEventListener:(type:string,listener:()=>void)=>void;removeEventListener:(type:string,listener:()=>void)=>void};
  const tracks:Track[]=[];
  class FakeRecorder {
    state='inactive';mimeType='audio/webm;codecs=opus';
    ondataavailable:((event:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;
    clip=0;
    start(){this.clip=++starts;this.state='recording';}
    stop(){if(this.state==='inactive')return;this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob([new Uint8Array([this.clip])])});this.onstop?.();});}
  }
  const recorders:FakeRecorder[]=[];
  const deps:RecorderDependencies={
    media:async()=>{
      acquisitions++;
      const track:Track={readyState:'live',enabled:true,listeners:new Set(),
        stop(){if(this.readyState==='live')stopped++;this.readyState='ended';},
        end(){this.readyState='ended';for(const listener of [...this.listeners])listener();},
        addEventListener(type,listener){if(type==='ended')this.listeners.add(listener);},
        removeEventListener(type,listener){if(type==='ended')this.listeners.delete(listener);},
      };
      const stream={getTracks:()=>[track],getAudioTracks:()=>[track]} as unknown as MediaStream;
      tracks.push(track);streams.push(stream);return stream;
    },
    recorder:stream=>{assert.equal(stream,streams.at(-1));const recorder=new FakeRecorder();recorders.push(recorder);return recorder as unknown as MediaRecorder;},
    meter:(_stream,report)=>{meters++;report(.5);return()=>{closedMeters++;};},
  };
  return {deps,streams,tracks,recorders,counts:()=>({acquisitions,starts,stopped,meters,closedMeters})};
}

test('retained permission stream is reused across checks and two separately encoded clips',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());
  await recorder.prepare();await recorder.prepare();
  assert.deepEqual(fake.counts(),{acquisitions:1,starts:0,stopped:0,meters:0,closedMeters:0});
  assert.equal(fake.tracks[0].enabled,true,'keep the device open between push-to-talk clips');
  await recorder.start();
  const first=await recorder.stop();
  assert.deepEqual([...new Uint8Array(await first.blob.arrayBuffer())],[1]);
  assert.equal(fake.tracks[0].readyState,'live');
  assert.equal(recorder.getSnapshot().level,0);
  recorder.finishAttempt();await assert.rejects(recorder.stop(),/No active recording/);
  await recorder.prepare();await recorder.start();
  const second=await recorder.stop();
  assert.deepEqual([...new Uint8Array(await second.blob.arrayBuffer())],[2],'a new clip cannot include chunks from the first attempt');
  recorder.finishAttempt();
  assert.deepEqual(fake.counts(),{acquisitions:1,starts:2,stopped:0,meters:2,closedMeters:2});
  assert.equal(fake.tracks[0].enabled,true);
  recorder.cancel();
  assert.equal(fake.tracks[0].readyState,'ended');assert.equal(fake.counts().stopped,1);
});

test('retained recording limit submits once and closes its meter without reopening the device',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,20,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());await recorder.prepare();
  let calls=0,done!:()=>void;const finished=new Promise<void>(resolve=>{done=resolve;});
  await recorder.start(()=>{calls++;done();});await finished;
  const clip=await recorder.stop();
  assert.equal(calls,1);assert.ok(clip.captureMs>0&&clip.captureMs<=20);
  assert.equal(fake.tracks[0].readyState,'live');
  assert.deepEqual(fake.counts(),{acquisitions:1,starts:1,stopped:0,meters:1,closedMeters:1});
  recorder.finishAttempt();assert.equal(recorder.getSnapshot().phase,'ready');
});

test('full cancellation clears retained readiness until the next explicit preparation',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());await recorder.prepare();
  recorder.cancel();
  assert.equal(fake.tracks[0].readyState,'ended');assert.equal(recorder.getSnapshot().ready,false);
  assert.equal(recorder.getSnapshot().phase,'idle');assert.match(recorder.getSnapshot().message,/Enable the microphone/);
  assert.equal(fake.tracks[0].listeners.size,0);
  await assert.rejects(recorder.start(),/Enable the microphone/);assert.equal(fake.counts().acquisitions,1);
  await recorder.prepare();assert.equal(recorder.getSnapshot().ready,true);
  await recorder.start();assert.equal(fake.counts().acquisitions,2);
  recorder.cancel();await flush();
  assert.deepEqual(fake.counts(),{acquisitions:2,starts:1,stopped:2,meters:1,closedMeters:1});
  await assert.rejects(recorder.stop(),/No active recording/);
});

test('an externally ended retained microphone clears readiness and can be explicitly prepared again',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());await recorder.prepare();
  let notifications=0;const unsubscribe=recorder.subscribe(()=>{notifications++;});t.after(unsubscribe);
  fake.tracks[0].end();
  assert.equal(recorder.getSnapshot().ready,false);assert.match(recorder.getSnapshot().message,/Microphone disconnected/);
  assert.ok(notifications>0);assert.equal(fake.tracks[0].listeners.size,0);
  await assert.rejects(recorder.start(),/Enable the microphone/);assert.equal(fake.counts().acquisitions,1);
  await recorder.prepare();
  assert.equal(fake.counts().acquisitions,2);assert.equal(recorder.getSnapshot().ready,true);
  await recorder.start();await recorder.stop();assert.equal(fake.counts().starts,1);
});

test('a retained stream ending before its event is delivered cannot silently reopen at the star',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());await recorder.prepare();
  fake.tracks[0].readyState='ended';
  await assert.rejects(recorder.start(),/Enable the microphone/);
  assert.equal(recorder.getSnapshot().ready,false);assert.equal(fake.counts().acquisitions,1);assert.equal(fake.counts().starts,0);
  assert.equal(fake.tracks[0].listeners.size,0);
  await recorder.prepare();assert.equal(fake.counts().acquisitions,2);assert.equal(recorder.getSnapshot().ready,true);
});

test('cancelled retained setup releases a late stream instead of retaining it for another run',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());
  const late=await fake.deps.media();
  let resolve!:(stream:MediaStream)=>void;fake.deps.media=()=>new Promise(done=>{resolve=done;});
  let settled=false;const preparing=recorder.prepare().then(()=>{settled=true;});
  recorder.cancel();await flush();assert.equal(settled,true);
  resolve(late);await preparing;await flush();
  assert.equal(fake.tracks[0].readyState,'ended');assert.equal(recorder.getSnapshot().ready,false);
  assert.equal(fake.counts().starts,0);
});

test('retained recording device errors release the stream and notify failure only once',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());await recorder.prepare();
  const errors:Error[]=[];await recorder.start(undefined,error=>errors.push(error));
  fake.recorders[0].onerror?.();fake.recorders[0].onerror?.();await flush();
  assert.equal(errors.length,1);assert.equal(fake.tracks[0].readyState,'ended');
  assert.equal(recorder.getSnapshot().phase,'error');assert.equal(fake.counts().closedMeters,1);
  await assert.rejects(recorder.stop(),/No active recording/);
});


for(const when of ['preparing notification','prepared stream continuation'] as const)test('cancelling retained start during '+when+' never records',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());await recorder.prepare();
  if(when==='preparing notification') {
    const unsubscribe=recorder.subscribe(()=>{if(recorder.getSnapshot().phase==='preparing')recorder.cancel();});
    t.after(unsubscribe);
  }
  const starting=recorder.start(undefined,()=>assert.fail('Cancellation was reported as device failure'));
  const rejected=assert.rejects(starting,/cancelled/);
  if(when==='prepared stream continuation')recorder.cancel();
  await rejected;await flush();
  assert.equal(fake.tracks[0].readyState,'ended');
  assert.deepEqual(fake.counts(),{acquisitions:1,starts:0,stopped:1,meters:0,closedMeters:0});
});


test('stale track-ended callbacks cannot invalidate a newly prepared microphone',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());await recorder.prepare();
  const stale=[...fake.tracks[0].listeners];assert.equal(stale.length,1);
  recorder.cancel();assert.equal(fake.tracks[0].listeners.size,0);
  await recorder.prepare();const ready=recorder.getSnapshot();
  stale.forEach(listener=>listener());
  assert.equal(recorder.getSnapshot(),ready);assert.equal(fake.tracks[1].readyState,'live');
  await recorder.start();await recorder.stop();
  assert.equal(fake.counts().acquisitions,2);assert.equal(fake.counts().starts,1);
});

test('an external track end during recording cancels capture and removes its listeners',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());await recorder.prepare();
  const errors:Error[]=[];await recorder.start(()=>assert.fail('Disconnected microphone submitted'),error=>errors.push(error));
  fake.tracks[0].end();await flush();
  assert.equal(errors.length,1);assert.match(errors[0].message,/Microphone disconnected/);
  assert.equal(recorder.getSnapshot().ready,false);assert.equal(fake.counts().closedMeters,1);
  assert.equal(fake.tracks[0].listeners.size,0);await assert.rejects(recorder.stop(),/No active recording/);
});

test('a stream that already ended when preparation resolves is never advertised ready',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());const stream=await fake.deps.media();fake.tracks[0].readyState='ended';
  fake.deps.media=async()=>stream;
  await recorder.prepare();
  assert.equal(recorder.getSnapshot().ready,false);assert.match(recorder.getSnapshot().message,/Microphone disconnected/);
  assert.equal(fake.tracks[0].listeners.size,0);assert.equal(fake.counts().starts,0);
});

for(const message of ['Starting audio recorder…','Starting microphone level meter…','Starting recording…'])test('cancellation from '+message+' prevents subsequent startup work',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());await recorder.prepare();
  const unsubscribe=recorder.subscribe(()=>{if(recorder.getSnapshot().message===message)recorder.cancel();});t.after(unsubscribe);
  await assert.rejects(recorder.start(undefined,()=>assert.fail('Cancellation reported as device failure')),/cancelled/);
  assert.equal(recorder.getSnapshot().ready,false);assert.equal(fake.counts().acquisitions,1);assert.equal(fake.counts().starts,0);
  assert.equal(fake.counts().meters,message==='Starting recording…'?1:0);assert.equal(fake.counts().meters,fake.counts().closedMeters);
});


test('a device ending after capture clears readiness without cancelling the submitted clip',async t=>{
  const fake=retainedDevice(),recorder=new MicrophoneRecorder(fake.deps,8000,10000,{retainPreparedStream:true});
  t.after(()=>recorder.cancel());await recorder.prepare();
  await recorder.start(undefined,()=>assert.fail('A finished clip was reported as a capture failure'));
  const clip=await recorder.stop();
  fake.tracks[0].end();await flush();
  assert.equal(recorder.getSnapshot().ready,false);assert.equal(fake.tracks[0].listeners.size,0);
  assert.deepEqual([...new Uint8Array(await clip.blob.arrayBuffer())],[1]);
  await assert.rejects(recorder.start(),/Enable the microphone/);assert.equal(fake.counts().acquisitions,1);
});
