import {
  PIPELINE_DEADLINE_MS, TRANSCRIPTION_DEADLINE_MS, PipelineRequestSchema, VoiceRequestSchema, PipelineErrorSchema,
  type PipelineRequest, type VoiceRequest, type PipelineErrorData,
} from '@sky/shared';
import { readEventStream } from '../generation/pipeline-client';
import type { Recording } from '../voice/recorder';

export class RaceEventRequestError extends Error {
  constructor(readonly detail: PipelineErrorData) {
    super(detail.code === 'REFUSED' ? detail.message : `${detail.code}: ${detail.message}`);
  }
}
type StreamEvent<S> =
  | {type:'complete';spec:S}
  | {type:'failed';error:PipelineErrorData}
  | {type:'stage'|'design'|'geometry'|'transcribing'|'transcript'|'generation'};
export interface EncounterClient<S, E, V> {
  generate(request:PipelineRequest,signal:AbortSignal,onEvent?:(event:E)=>void):Promise<S>;
  generateVoice(recording:Recording,request:Omit<VoiceRequest,'captureMs'>,signal:AbortSignal,onEvent?:(event:V)=>void):Promise<S>;
}

async function consume<S,E extends StreamEvent<S>>(response:Response,parse:(data:unknown)=>E,onEvent?: (event:E)=>void):Promise<S> {
  if (!response.ok) {
    const body:unknown = await response.json().catch(()=>undefined);
    const error = PipelineErrorSchema.safeParse(body && typeof body === 'object' && 'error' in body ? body.error : undefined);
    throw new RaceEventRequestError(error.success ? error.data : {code:'PROVIDER_ERROR',message:'The server rejected the event request.'});
  }
  let spec:S|undefined, failure:RaceEventRequestError|undefined;
  await readEventStream(response,parse,event=>{
    onEvent?.(event);
    if (event.type === 'complete') spec = event.spec;
    if (event.type === 'failed') failure = new RaceEventRequestError(event.error);
  },event=>event.type === 'complete' || event.type === 'failed');
  if (failure) throw failure;
  if (!spec) throw new Error('Event generation ended without a result.');
  return spec;
}

/** Version-specific parsers keep old clients strict while sharing transport and deadlines. */
export function createEncounterClient<S,E extends StreamEvent<S>,V extends StreamEvent<S>>(options:{
  textUrl:string;voiceUrl:string;parseEvent:(data:unknown)=>E;parseVoiceEvent:(data:unknown)=>V;
}):EncounterClient<S,E,V> {
  return {
    async generate(request,signal,onEvent) {
      const input = PipelineRequestSchema.parse(request);
      const response = await fetch(options.textUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),
        signal:AbortSignal.any([signal,AbortSignal.timeout(PIPELINE_DEADLINE_MS+5000)])});
      return consume<S,E>(response,options.parseEvent,onEvent);
    },
    async generateVoice(recording,request,signal,onEvent) {
      const input = VoiceRequestSchema.parse({...request,captureMs:recording.captureMs});
      const form = new FormData();
      form.append('options',JSON.stringify(input));form.append('audio',recording.blob,'recording');
      const response = await fetch(options.voiceUrl,{method:'POST',body:form,
        signal:AbortSignal.any([signal,AbortSignal.timeout(TRANSCRIPTION_DEADLINE_MS+PIPELINE_DEADLINE_MS+5000)])});
      return consume<S,V>(response,options.parseVoiceEvent,onEvent);
    },
  };
}
