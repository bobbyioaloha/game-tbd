import {
  PIPELINE_DEADLINE_MS, TRANSCRIPTION_DEADLINE_MS, PipelineRequestSchema, VoiceRequestSchema, PipelineErrorSchema,
  RaceEventPipelineEventSchema, RaceEventVoiceEventSchema,
  type PipelineRequest, type VoiceRequest, type RaceEventCreation, type RaceEventPipelineEvent, type RaceEventVoiceEvent,
} from '@sky/shared';
import { readEventStream } from '../generation/pipeline-client';
import type { Recording } from '../voice/recorder';
export class RaceEventRequestError extends Error {
  constructor(readonly detail:import('@sky/shared').PipelineErrorData){super(detail.code+': '+detail.message);}
}
async function checked(response:Response) {
  if(response.ok)return response;
  const body:unknown=await response.json().catch(()=>undefined);
  const error=PipelineErrorSchema.safeParse(body&&typeof body==='object'&&'error'in body?body.error:undefined);
  throw new RaceEventRequestError(error.success?error.data:{code:'PROVIDER_ERROR',message:'The server rejected the event request.'});
}
export interface RaceEventGenerationClient {
  generate(request:PipelineRequest,signal:AbortSignal,onEvent?:(event:RaceEventPipelineEvent)=>void):Promise<RaceEventCreation>;
  generateVoice(recording:Recording,request:Omit<VoiceRequest,'captureMs'>,signal:AbortSignal,onEvent?:(event:RaceEventVoiceEvent)=>void):Promise<RaceEventCreation>;
}
export const raceEventClient:RaceEventGenerationClient = {
  async generate(request,signal,onEvent) {
    const input=PipelineRequestSchema.parse(request);
    const response=await checked(await fetch('/api/lab/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),
      signal:AbortSignal.any([signal,AbortSignal.timeout(PIPELINE_DEADLINE_MS+5000)])}));
    let spec:RaceEventCreation|undefined,failure:RaceEventRequestError|undefined;
    await readEventStream(response,RaceEventPipelineEventSchema.parse,event=>{
      onEvent?.(event);if(event.type==='complete')spec=event.spec;if(event.type==='failed')failure=new RaceEventRequestError(event.error);
    },event=>event.type==='complete'||event.type==='failed');
    if(failure)throw failure;if(!spec)throw new Error('Event generation ended without a result.');return spec;
  },
  async generateVoice(recording,request,signal,onEvent) {
    const input=VoiceRequestSchema.parse({...request,captureMs:recording.captureMs});
    const form=new FormData();form.append('options',JSON.stringify(input));form.append('audio',recording.blob,'recording');
    const response=await checked(await fetch('/api/voice/events',{method:'POST',body:form,
      signal:AbortSignal.any([signal,AbortSignal.timeout(TRANSCRIPTION_DEADLINE_MS+PIPELINE_DEADLINE_MS+5000)])}));
    let spec:RaceEventCreation|undefined,failure:RaceEventRequestError|undefined;
    await readEventStream(response,RaceEventVoiceEventSchema.parse,event=>{
      onEvent?.(event);if(event.type==='complete')spec=event.spec;if(event.type==='failed')failure=new RaceEventRequestError(event.error);
    },event=>event.type==='complete'||event.type==='failed');
    if(failure)throw failure;if(!spec)throw new Error('Voice event generation ended without a result.');return spec;
  },
};
