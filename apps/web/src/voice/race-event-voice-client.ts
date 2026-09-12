import type { RaceEventCreation, VoiceRequest } from '@sky/shared';
import { raceEventClient, type RaceEventGenerationClient } from '../race-events/client';
import type { AudioCreationClient } from './voice-client';

export function createAudioRaceEventClient(
  configuration:()=>Omit<VoiceRequest,'captureMs'>,
  client:RaceEventGenerationClient=raceEventClient,
):AudioCreationClient<RaceEventCreation> {
  return {generateAudio(recording,options) {
    return client.generateVoice(recording,configuration(),options.signal,event=>{
      if(event.type==='transcript')options.onProgress('generating','Creating while you fall…',event.result.text);
      if(event.type==='generation'&&event.event.type==='stage')options.onProgress('generating',
        {design:'Choosing the shared effect…',geometry:'Building your creation…',validation:'Validating creation…'}[event.event.stage]);
    });
  }};
}
