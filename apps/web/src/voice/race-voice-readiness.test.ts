import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { raceEventFixtures, PipelineProfilesSchema, type VoiceRequest } from '@sky/shared';
import { PracticeRace } from '../game/practice-race';
import { RaceEventRuntime } from '../race-events/runtime';
import { RaceEventHost } from '../game/race-event-host';
import { RACE_VOICE_ATTEMPTS } from '../game/race-event-config';
import { paidVoiceAvailable, raceVoiceReadiness } from './race-voice-readiness';
import type { RaceVoiceController } from './RaceVoiceControls';

const stage = {model:'fake-model',reasoning:'low',maxOutputTokens:256};
const profiles = PipelineProfilesSchema.parse({
  profiles:[
    {id:'mock',label:'Mock',mode:'mock',available:true,design:stage,geometry:stage},
    {id:'fake-live',label:'Live',mode:'live',available:true,design:stage,geometry:stage},
  ],
  transcription:{model:'fake-speech',available:true},
  liveUsage:{enabled:true,busy:false,maxAttempts:3,attemptsUsed:0,attemptsRemaining:3},
  deadlineMs:30000,designBudgetMs:8000,
});
const ready = {enabled:true,microphone:{ready:true,phase:'ready' as const},profiles,profileId:'fake-live',armed:true,error:''};

test('mock needs microphone readiness but never paid consent or live availability', () => {
  const mock = {...ready,profileId:'mock',armed:false,profiles:{...profiles,liveUsage:{...profiles.liveUsage,enabled:false}}};
  assert.equal(raceVoiceReadiness(mock).ready,true);
  for (const microphone of [{ready:false,phase:'idle'}, {ready:true,phase:'preparing'}, {ready:true,phase:'error'}] as const) {
    assert.equal(raceVoiceReadiness({...mock,microphone}).ready,false);
  }
});

test('live readiness requires fresh consent, a usable profile, transcription, and capacity', () => {
  assert.equal(raceVoiceReadiness(ready).ready,true);
  for (const change of [
    {enabled:false}, {armed:false}, {profiles:undefined}, {profileId:'missing'}, {error:'Connection failed'},
    {profiles:{...profiles,profiles:profiles.profiles.map(profile=>({...profile,available:false}))}},
    {profiles:{...profiles,transcription:undefined}},
    ...[{enabled:false},{busy:true},{attemptsRemaining:0}].map(change=>({profiles:{...profiles,liveUsage:{...profiles.liveUsage,...change}}})),
  ]) assert.equal(raceVoiceReadiness({...ready,...change}).ready,false,JSON.stringify(change));
  assert.equal(paidVoiceAvailable(undefined),false);
});

// Run the real voice hook, host, and readiness rules with fake React scheduling,
// microphone hardware, and provider transport. No browser permission or API call.
const code = ts.transpileModule(readFileSync(new URL('./RaceVoiceControls.tsx',import.meta.url),'utf8'), {
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const flush = () => new Promise<void>(resolve=>setImmediate(resolve));
async function setup() {
  const hooks:unknown[] = [], effects:Array<()=>void|(()=>void)> = [];
  let cursor=0,mounted=false,captures=0;
  const slot=(initial:()=>unknown)=>{const index=cursor++;if(!(index in hooks))hooks[index]=initial();return index;};
  const React={
    useState(initial:unknown) {
      const index=slot(()=>typeof initial==='function'?initial():initial);
      return [hooks[index],(next:unknown)=>{hooks[index]=typeof next==='function'?next(hooks[index]):next;}];
    },
    useRef(initial:unknown){return hooks[slot(()=>({current:initial}))];},
    useSyncExternalStore(_subscribe:unknown,snapshot:()=>unknown){return snapshot();},
    useEffect(effect:()=>void|(()=>void)){if(!mounted)effects.push(effect);},
  };
  class Recorder {
    readonly kind='audio';
    state={ready:false,phase:'idle',level:0,elapsedMs:0,message:'Enable microphone'};
    getSnapshot=()=>this.state;
    subscribe=()=>()=>{};
    prepare=async()=>{this.state={...this.state,ready:true,phase:'ready'};};
    cancel=()=>{};
    async start(){captures++;}
    async stop(){return {blob:new Blob(['fake clip']),captureMs:500};}
  }
  const requests:Array<Omit<VoiceRequest,'captureMs'>>=[];
  const modules:Record<string,unknown>={
    react:React,'react/jsx-runtime':{},'@sky/shared':{raceEventFixtures},
    '../game/race-event-host':{RaceEventHost},'../game/race-event-config':{RACE_VOICE_ATTEMPTS},'./recorder':{MicrophoneRecorder:Recorder},
    '../generation/pipeline-client':{loadPipelineProfiles:async()=>structuredClone(profiles)},
    './race-voice-readiness':{paidVoiceAvailable,raceVoiceReadiness},'./RecorderControls':{},
    './race-event-voice-client':{createAudioRaceEventClient:(getConfiguration:()=>Omit<VoiceRequest,'captureMs'>)=>({
      async generateAudio(){requests.push(getConfiguration());return raceEventFixtures[0].spec;},
    })},
  };
  const sandbox={exports:{} as {useRaceVoice:(race:PracticeRace)=>RaceVoiceController},
    require:(id:string)=>{assert.ok(id in modules,'Unexpected import: '+id);return modules[id];},
    AbortController,crypto:globalThis.crypto,
  };
  runInNewContext(code,sandbox);
  const race=new PracticeRace(false,()=>0.42,new RaceEventRuntime());
  const render=()=>{cursor=0;return sandbox.exports.useRaceVoice(race);};
  render();const cleanups=effects.map(effect=>effect());mounted=true;
  await flush();
  return {race,render,requests,captures:()=>captures,close:()=>cleanups.forEach(cleanup=>cleanup?.())};
}

test('permission checking dispatches nothing; two-attempt consent survives starting and clears on reset', async () => {
  const ui=await setup();
  let voice=ui.render();voice.reset();voice=ui.render();
  voice.setProfileId('fake-live');await voice.recorder.prepare();voice=ui.render();
  assert.equal(voice.getReadiness().ready,false);
  assert.equal(ui.requests.length,0);assert.equal(ui.captures(),0);
  voice.setArmed(true);voice=ui.render();
  const session=voice.state.session;
  // The prepared countdown starts the existing host without resetting it.
  voice.host.start();voice=ui.render();
  assert.equal(voice.state.session,session);assert.equal(voice.armed,true);
  voice.host.loop.collectVoice();voice=ui.render();voice.start();await flush();
  voice=ui.render();assert.equal(voice.armed,true);assert.equal(voice.paidAttemptsRemaining,1);
  await voice.host.loop.finishRecording();
  assert.equal(ui.captures(),1);assert.equal(ui.requests.length,1);
  assert.equal(ui.requests[0].profileId,'fake-live');assert.equal(ui.requests[0].paidAttempt?.confirmed,true);
  voice.start();assert.equal(ui.captures(),1);
  ui.race.reset();voice.reset();voice=ui.render();
  assert.equal(voice.armed,false);assert.equal(voice.enabled,true);
  voice.host.start();voice.host.loop.collectVoice();voice=ui.render();voice.start();
  assert.equal(ui.captures(),1);assert.equal(ui.requests.length,1);
  ui.close();
});

test('profile and prepared-prompt changes clear consent', async () => {
  const ui=await setup();let voice=ui.render();
  voice.setArmed(true);voice=ui.render();voice.setProfileId('fake-live');
  voice=ui.render();assert.equal(voice.armed,false);
  voice.setArmed(true);voice=ui.render();voice.setMockText(raceEventFixtures[1].prompt);
  assert.equal(ui.render().armed,false);assert.equal(ui.requests.length,0);ui.close();
});

test('playing without voice removes the grant, never captures, and resets for the next run', async () => {
  const ui=await setup();let voice=ui.render();
  voice.setArmed(true);voice=ui.render();voice.skipForRun();voice=ui.render();
  assert.equal(voice.enabled,false);assert.equal(voice.armed,false);assert.equal(voice.host.voice,undefined);
  voice.host.start();voice.host.loop.collectVoice();voice.start();
  for(let tick=0;tick<1800;tick++) {
    const from=ui.race.snapshot(ui.race.racers[0]).position;
    ui.race.step(1/120,{x:0,z:0},false);
    voice.host.step(1/120,from,ui.race.snapshot(ui.race.racers[0]).position);
  }
  assert.ok(ui.race.elapsed>10);assert.equal(ui.captures(),0);assert.equal(ui.requests.length,0);
  assert.equal(voice.host.creation,undefined);assert.equal(voice.host.loop.getSnapshot().phase,'ended');
  ui.race.reset();voice.reset();voice=ui.render();
  assert.equal(voice.enabled,true);assert.ok(voice.host.voice);assert.equal(voice.armed,false);
  ui.close();
});

test('voice cannot be disabled after the run starts or after a fixture is placed', async () => {
  const ui=await setup();const voice=ui.render();
  voice.host.start();assert.throws(()=>voice.host.disableForRun(),/before the race/);
  ui.race.reset();voice.reset();voice.host.loadFixture(raceEventFixtures[0].spec,true);
  assert.throws(()=>voice.host.disableForRun(),/before the race/);ui.close();
});

// Render only the HUD's state-derived copy; no renderer or browser is needed.
test('a pre-pickup Space warning cannot override the collected-star prompt', () => {
  const hudCode=ts.transpileModule(readFileSync(new URL('../game/RaceCreationVisuals.tsx',import.meta.url),'utf8'), {
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},
  }).outputText;
  const jsx=(type:unknown,props:unknown)=>({type,props});
  const modules:Record<string,unknown>={
    react:{useState:(initial:unknown)=>[initial,()=>{}],useEffect:()=>{},useSyncExternalStore:(_:unknown,get:()=>unknown)=>get()},
    'react/jsx-runtime':{jsx,jsxs:jsx},'@react-three/fiber':{},three:{},'@sky/shared':{},
    '../race-events/RaceEventRenderer':{},'./race-event-config':{},'../components/PowerUpModel':{},
  };
  const sandbox={exports:{} as {RaceCreationHud:(props:unknown)=>unknown},
    require:(id:string)=>{assert.ok(id in modules,'Unexpected import: '+id);return modules[id];},
  };
  runInNewContext(hudCode,sandbox);
  const props={enabled:true,paused:false,finished:false,live:false,mockText:'angry orange sun',blockedReason:'',
    microphone:{phase:'ready'},inputNotice:{id:1,text:'Collect the yellow star first.',phase:'available'},
    host:{loop:{subscribe:()=>()=>{},getSnapshot:()=>({phase:'prompted'})},
      race:{elapsed:0,racers:[],events:{getSnapshot:()=>({phase:'empty'})}}},
  };
  const result=JSON.stringify(sandbox.exports.RaceCreationHud(props));
  assert.match(result,/Hold Space/);assert.doesNotMatch(result,/Collect the yellow star first/);
  props.inputNotice={id:2,text:'Enable your microphone.',phase:'prompted'};
  assert.match(JSON.stringify(sandbox.exports.RaceCreationHud(props)),/Enable your microphone/);
});

test('one run consent admits only two separately identified requests, never duplicates on key repeat', async () => {
  const ui=await setup();let voice=ui.render();
  voice.setProfileId('fake-live');await voice.recorder.prepare();voice=ui.render();
  voice.setArmed(true);voice=ui.render();voice.host.start();
  voice.host.loop.collectVoice();voice=ui.render();voice.start();voice.start();await flush();
  await voice.host.loop.finishRecording();
  assert.equal(ui.requests.length,1);
  // The race host rearms only the attempt; this isolates consent from event scheduling.
  voice.host.loop.reset();voice.host.loop.start();voice.host.loop.collectVoice();
  voice=ui.render();voice.start();voice.start();await flush();await voice.host.loop.finishRecording();
  voice=ui.render();assert.equal(voice.paidAttemptsRemaining,0);assert.equal(voice.armed,false);
  assert.equal(ui.requests.length,2);assert.equal(ui.captures(),2);
  assert.notEqual(ui.requests[0].paidAttempt?.id,ui.requests[1].paidAttempt?.id);
  assert.ok(ui.requests.every(request=>request.paidAttempt?.confirmed));
  voice.host.loop.reset();voice.host.loop.start();voice.host.loop.collectVoice();
  voice=ui.render();voice.start();await flush();
  assert.equal(ui.requests.length,2);assert.equal(ui.captures(),2);ui.close();
});
