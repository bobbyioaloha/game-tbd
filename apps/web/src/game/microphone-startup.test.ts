import test from 'node:test';
import assert from 'node:assert/strict';
import { safetyDrillFixtures, type RaceEncounter } from '@sky/shared';
import { PracticeRace, FINISH_DEPTH } from './practice-race';
import { RaceEventHost } from './race-event-host';
import { RACE_CREATION_PICKUP_RADIUS } from './race-event-config';
import { RaceEventRuntime } from '../race-events/runtime';
import { MicrophoneRecorder, type RecorderDependencies } from '../voice/recorder';

const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));

async function setup(setupTimeoutMs=10_000) {
  let stoppedTracks=0,recordings=0,acquisitions=0,submissions=0;
  let resolveDevice!:(stream:MediaStream)=>void;
  const stream={getTracks:()=>[{stop:()=>{stoppedTracks++;}}]} as unknown as MediaStream;
  const deps:RecorderDependencies={
    media:async()=>stream,
    recorder:()=>{recordings++;throw new Error('A stale microphone must not start recording.');},
  };
  const recorder=new MicrophoneRecorder(deps,8000,setupTimeoutMs);
  const race=new PracticeRace(false,()=>.42,new RaceEventRuntime({pickupContactRadius:RACE_CREATION_PICKUP_RADIUS}));
  const host=new RaceEventHost(race,recorder,{
    generateAudio:async()=>{submissions++;throw new Error('An unopened microphone must not submit audio.');},
  },()=>.5);
  await recorder.prepare();
  deps.media=()=>{acquisitions++;return new Promise(resolve=>{resolveDevice=resolve;});};
  host.start();
  const collect=()=>{
    assert.ok(host.voice);
    const [x,y,z]=host.voice.position;
    host.step(1/120,[x,y+4,z],[x,y-4,z]);
    assert.equal(host.loop.getSnapshot().phase,'prompted');
  };
  collect();
  return {host,race,recorder,collect,resolveDevice:()=>resolveDevice(stream),counts:()=>({stoppedTracks,recordings,acquisitions,submissions})};
}

test('a stalled first-star microphone fails the attempt without submission or automatic retry', {timeout:2000}, async t=>{
  const game=await setup(50);t.after(()=>game.host.dispose());
  const failed=new Promise<void>(resolve=>{
    const unsubscribe=game.host.loop.subscribe(()=>{
      if(game.host.loop.getSnapshot().phase==='failed'){unsubscribe();resolve();}
    });
  });
  game.host.loop.startRecording();
  assert.equal(game.host.loop.getSnapshot().phase,'preparing');
  await failed;
  const state=game.host.loop.getSnapshot();
  assert.equal(state.running,true,'the race remains playable after microphone startup fails');
  assert.match(state.message,/Microphone did not respond.*Attempt consumed/);
  assert.equal(game.host.creation,undefined);
  assert.equal(game.host.opportunitiesRemaining,1,'the separately authored second star remains available');
  assert.deepEqual(game.counts(),{stoppedTracks:1,recordings:0,acquisitions:1,submissions:0});

  game.host.loop.startRecording();await game.host.loop.finishRecording();await flush();
  assert.equal(game.host.loop.getSnapshot(),state,'a consumed star cannot retry capture');
  game.resolveDevice();await flush();
  assert.equal(game.host.loop.getSnapshot(),state,'a late device cannot revive the failed attempt');
  assert.equal(game.host.creation,undefined);
  assert.deepEqual(game.counts(),{stoppedTracks:2,recordings:0,acquisitions:1,submissions:0});
});

for(const action of ['pause','reset'] as const)test(action+' during main-race microphone startup discards the late stream',async t=>{
  const game=await setup();t.after(()=>game.host.dispose());
  game.host.loop.startRecording();await flush();
  assert.equal(game.host.loop.getSnapshot().phase,'preparing');
  assert.equal(game.recorder.getSnapshot().phase,'preparing');
  const run=game.host.runId;
  if(action==='pause') {
    game.host.pause();
    assert.equal(game.host.loop.getSnapshot().phase,'failed');
    assert.match(game.host.loop.getSnapshot().message,/Input cancelled/);
  } else {
    game.race.reset();game.host.reset();game.host.start();game.collect();
    assert.notEqual(game.host.runId,run);
    assert.equal(game.host.loop.getSnapshot().phase,'prompted');
  }
  await flush();
  const state=game.host.loop.getSnapshot();
  assert.equal(game.recorder.getSnapshot().phase,'ready');
  game.resolveDevice();await flush();
  assert.equal(game.host.loop.getSnapshot(),state,'old microphone completion cannot modify the current attempt');
  assert.equal(game.recorder.getSnapshot().phase,'ready');
  assert.equal(game.host.creation,undefined);
  assert.deepEqual(game.counts(),{stoppedTracks:2,recordings:0,acquisitions:1,submissions:0});
});


/** Model Edge opening the device once, then stalling on another acquisition.
 * Clips contain synthetic bytes only; the provider is an in-memory fixture. */
async function preparedGame() {
  let acquisitions=0,recordings=0,stoppedTracks=0;
  const createTracks=()=>Array.from({length:2},()=>Object.assign(new EventTarget(),{
    kind:'audio',readyState:'live',enabled:true,
    stop(){stoppedTracks++;this.readyState='ended';},
  }));
  const tracks:ReturnType<typeof createTracks>=[];
  const newStream=()=>{
    const currentTracks=createTracks();tracks.push(...currentTracks);
    return {getTracks:()=>currentTracks,getAudioTracks:()=>currentTracks} as unknown as MediaStream;
  };
  let stream=newStream(),allowNextAcquisition=false;
  class FakeRecorder {
    state='inactive';mimeType='audio/webm;codecs=opus';
    ondataavailable:((event:{data:Blob})=>void)|null=null;
    onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;
    start(){recordings++;this.state='recording';}
    stop(){
      if(this.state==='inactive')return;
      this.state='inactive';
      queueMicrotask(()=>{
        this.ondataavailable?.({data:new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,1])])});
        this.onstop?.();
      });
    }
  }
  const recorder=new MicrophoneRecorder({
    media:()=>{
      acquisitions++;
      if(acquisitions===1||allowNextAcquisition){allowNextAcquisition=false;return Promise.resolve(stream);}
      return new Promise(()=>{});
    },
    recorder:current=>{
      assert.equal(current,stream,'recording uses the device opened during setup');
      assert.ok(current.getAudioTracks().every(track=>track.readyState==='live'));
      return new FakeRecorder() as unknown as MediaRecorder;
    },
  },8000,50,{retainPreparedStream:true});
  const requests:Array<{signal:AbortSignal;resolve:(spec:RaceEncounter)=>void;reject:(error:Error)=>void}>=[];
  const race=new PracticeRace(false,()=>.42,new RaceEventRuntime({pickupContactRadius:RACE_CREATION_PICKUP_RADIUS}));
  const host=new RaceEventHost(race,recorder,{
    generateAudio:async(clip,options)=>{
      assert.ok(clip.blob.size>0);
      options.onProgress?.('generating','Generating a local fixture');
      return new Promise((resolve,reject)=>requests.push({signal:options.signal,resolve,reject}));
    },
  },()=>.5);
  await recorder.prepare();host.start();
  const collect=()=>{
    assert.ok(host.voice);
    const [x,y,z]=host.voice.position;
    host.step(1/120,[x,y+4,z],[x,y-4,z]);
    assert.equal(host.loop.getSnapshot().phase,'prompted');
  };
  const submit=async()=>{
    const previouslyStopped=stoppedTracks;
    host.loop.startRecording();await flush();
    assert.equal(host.loop.getSnapshot().phase,'recording','the prepared device starts without reopening');
    const pending=host.loop.finishRecording();await flush();
    assert.ok(requests.length>0);
    assert.equal(stoppedTracks,previouslyStopped,'finishing the clip keeps the prepared device available');
    return {pending,request:requests.at(-1)!};
  };
  const spawn=()=>{
    host.loop.advanceTime(2.1);
    const position=race.snapshot(race.racers[0]).position;
    host.step(0,position,position);
    assert.equal(host.loop.getSnapshot().phase,'spawned');
  };
  const collectSecond=()=>{
    const [x,,z]=race.snapshot(race.racers[0]).position;
    const y=-FINISH_DEPTH*.65;
    host.step(1/120,[x,y+4,z],[x,y-4,z]);
    assert.equal(host.attemptNumber,2);
    assert.equal(host.loop.getSnapshot().phase,'prompted');
  };
  const restoreDevice=()=>{stream=newStream();allowNextAcquisition=true;};
  return {host,race,recorder,tracks,requests,collect,submit,spawn,collectSecond,restoreDevice,
    counts:()=>({acquisitions,recordings,stoppedTracks})};
}

async function assertPreparedCaptureReleased(game:Awaited<ReturnType<typeof preparedGame>>) {
  assert.equal(game.recorder.getSnapshot().ready,false,'released devices must not remain marked ready');
  const before=game.counts(),submissions=game.requests.length;
  await assert.rejects(game.recorder.start(),/Enable the microphone/);
  assert.deepEqual(game.counts(),before,'capture refuses a missing prepared device without reopening it');
  assert.equal(game.requests.length,submissions,'missing devices never submit audio');
}

const preparedFixture=safetyDrillFixtures.find(item=>item.spec.drill.family==='stampede')!.spec;

for(const firstOutcome of ['success','failure'] as const)test('main-race setup and both stars share one device after provider '+firstOutcome,async t=>{
  const game=await preparedGame();t.after(()=>game.host.dispose());
  await game.recorder.prepare();await game.recorder.prepare();
  assert.equal(game.recorder.getSnapshot().ready,true);
  assert.deepEqual(game.counts(),{acquisitions:1,recordings:0,stoppedTracks:0});
  game.collect();
  const first=await game.submit();
  if(firstOutcome==='success')first.request.resolve(preparedFixture);
  else first.request.reject(new Error('Local provider failure'));
  await first.pending;
  if(firstOutcome==='success')game.spawn();
  else assert.equal(game.host.loop.getSnapshot().phase,'failed');
  assert.deepEqual(game.counts(),{acquisitions:1,recordings:1,stoppedTracks:0});
  const session=game.host.loop.getSnapshot().session;
  const firstCreation=game.host.creation?.instanceId;
  game.collectSecond();
  assert.notEqual(game.host.loop.getSnapshot().session,session,'second star gets a fresh attempt');
  assert.equal(game.host.creation?.instanceId,firstCreation,'rearming preserves the shared event');
  const second=await game.submit();
  second.request.resolve(preparedFixture);await second.pending;
  assert.equal(game.host.loop.getSnapshot().phase,'ready');
  assert.equal(game.requests.length,2);
  assert.notEqual(first.request.signal,second.request.signal);
  assert.deepEqual(game.counts(),{acquisitions:1,recordings:2,stoppedTracks:0});
  game.host.dispose();
  assert.ok(game.tracks.every(track=>track.readyState==='ended'));
  assert.equal(game.counts().stoppedTracks,2);
});

for(const phase of ['available','spawned'] as const)test('pausing in '+phase+' releases every prepared microphone track',async t=>{
  const game=await preparedGame();t.after(()=>game.host.dispose());
  if(phase==='spawned'){
    game.collect();const first=await game.submit();
    first.request.resolve(preparedFixture);await first.pending;game.spawn();
  }
  assert.equal(game.host.loop.getSnapshot().phase,phase);
  game.host.pause();
  assert.equal(game.counts().stoppedTracks,2);
  assert.ok(game.tracks.every(track=>track.readyState==='ended'));
  assert.equal(game.host.loop.getSnapshot().phase,phase,'pause keeps the completed or uncollected attempt state');
  await assertPreparedCaptureReleased(game);
});

for(const action of ['restart','finish','dispose'] as const)test(action+' releases a prepared microphone even before the first star',async t=>{
  const game=await preparedGame();t.after(()=>game.host.dispose());
  if(action==='restart'){
    game.race.reset();game.host.reset();game.host.start();
  }else if(action==='finish'){
    game.race.racers[0].finishTime=0;
    const position=game.race.snapshot(game.race.racers[0]).position;
    game.host.step(1/120,position,position);
    assert.equal(game.host.loop.getSnapshot().phase,'ended');
  }else game.host.dispose();
  assert.deepEqual(game.counts(),{acquisitions:1,recordings:0,stoppedTracks:2});
  assert.ok(game.tracks.every(track=>track.readyState==='ended'));
  await assertPreparedCaptureReleased(game);
});


for(const phase of ['available','spawned'] as const)test('explicit setup after pausing in '+phase+' prepares a new device for the next voice star',async t=>{
  const game=await preparedGame();t.after(()=>game.host.dispose());
  if(phase==='spawned'){
    game.collect();const first=await game.submit();
    first.request.resolve(preparedFixture);await first.pending;game.spawn();
  }
  game.host.pause();await assertPreparedCaptureReleased(game);
  game.restoreDevice();
  await game.recorder.prepare();
  assert.equal(game.recorder.getSnapshot().ready,true);
  assert.equal(game.counts().acquisitions,2,'only explicit setup opens the replacement device');
  if(phase==='available')game.collect();
  else game.collectSecond();
  const next=await game.submit();
  next.request.resolve(preparedFixture);await next.pending;
  assert.equal(game.host.loop.getSnapshot().phase,'ready');
  assert.deepEqual(game.counts(),{acquisitions:2,recordings:phase==='available'?1:2,stoppedTracks:2});
  game.host.dispose();
  assert.equal(game.counts().stoppedTracks,4);
  assert.ok(game.tracks.every(track=>track.readyState==='ended'));
});
