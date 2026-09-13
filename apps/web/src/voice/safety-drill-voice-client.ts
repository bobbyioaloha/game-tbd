import type { SafetyDrillSpec, VoiceRequest } from '@sky/shared';
import { safetyDrillClient, type SafetyDrillGenerationClient } from '../race-events/drill-client';
import type { AudioCreationClient } from './voice-client';

export function createAudioSafetyDrillClient(
  configuration:()=>Omit<VoiceRequest,'captureMs'>,
  client:SafetyDrillGenerationClient=safetyDrillClient,
):AudioCreationClient<SafetyDrillSpec> {
  return {generateAudio(recording,options) {
    return client.generateVoice(recording,configuration(),options.signal,event=>{
      if(event.type==='transcript')options.onProgress('generating','The department is reviewing your hazard…',event.result.text);
      if(event.type==='generation'&&event.event.type==='stage')options.onProgress('generating',
        {design:'Designing the safety drill…',geometry:'Reproducing your concern…',validation:'Inspecting the equipment…'}[event.event.stage]);
    });
  }};
}
