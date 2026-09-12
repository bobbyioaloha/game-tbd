import test from 'node:test';
import assert from 'node:assert/strict';
import { raceEventFixtures, type VoiceRequest } from '@sky/shared';
import { createAudioRaceEventClient } from './race-event-voice-client';
import type { RaceEventGenerationClient } from '../race-events/client';

test('game voice adapter forwards consent, audio and cancellation to v3 once and reports progress',async()=>{
  const request:Omit<VoiceRequest,'captureMs'>={profileId:'mock',geometryMode:'primitives',mockText:raceEventFixtures[0].prompt};
  const signal=new AbortController().signal,recording={blob:new Blob(['audio']),captureMs:1000};
  const phases:string[]=[];let calls=0;
  const transport:RaceEventGenerationClient={
    async generate(){throw new Error('Voice must not call the typed pipeline too.');},
    async generateVoice(clip,options,abort,onEvent){
      calls++;assert.equal(clip,recording);assert.equal(options,request);assert.equal(abort,signal);
      onEvent?.({type:'generation',event:{type:'stage',stage:'design',elapsedMs:0}});
      return raceEventFixtures[0].spec;
    },
  };
  const result=await createAudioRaceEventClient(()=>request,transport).generateAudio(recording,{signal,onProgress:phase=>phases.push(phase)});
  assert.equal(result.version,3);assert.equal(calls,1);assert.deepEqual(phases,['generating']);
});
