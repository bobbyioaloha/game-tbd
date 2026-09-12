import { PIPELINE_DEADLINE_MS, TRANSCRIPTION_DEADLINE_MS, PipelineErrorSchema, TranscriptResultSchema, VoiceEventSchema, VoiceRequestSchema, type CreationSpec, type TranscriptResult, type VoiceEvent, type VoiceRequest } from '@sky/shared';
import { readEventStream } from '../generation/pipeline-client';
import type { Recording } from './recorder';

export class VoiceRequestError extends Error {
  constructor(readonly detail:import('@sky/shared').PipelineErrorData) {super(detail.code+': '+detail.message);}
}
export async function requestVoice(recording:Recording,request:Omit<VoiceRequest,'captureMs'>,signal:AbortSignal,options:{transcribeOnly?:boolean;onEvent?:(event:VoiceEvent)=>void}={}):Promise<{result:TranscriptResult;spec?:CreationSpec}> {
  const metadata=VoiceRequestSchema.parse({...request,captureMs:recording.captureMs});
  const form=new FormData();form.append('options',JSON.stringify(metadata));form.append('audio',recording.blob,'recording');
  const timeout=TRANSCRIPTION_DEADLINE_MS+(options.transcribeOnly?0:PIPELINE_DEADLINE_MS)+5000;
  const response=await fetch(options.transcribeOnly?'/api/voice/transcriptions':'/api/voice/creations',{
    method:'POST',body:form,signal:AbortSignal.any([signal,AbortSignal.timeout(timeout)]),
  });
  if (!response.ok) {
    const body:unknown=await response.json().catch(()=>undefined);
    const error=PipelineErrorSchema.safeParse(body&&typeof body==='object'&&'error'in body?body.error:undefined);
    throw new VoiceRequestError(error.success?error.data:{code:'PROVIDER_ERROR',message:'The server rejected the voice request.'});
  }
  if (options.transcribeOnly) return {result:TranscriptResultSchema.parse(await response.json())};
  let completed:{result:TranscriptResult;spec:CreationSpec}|undefined, failure:VoiceRequestError|undefined;
  await readEventStream(response,VoiceEventSchema.parse,event=>{
    options.onEvent?.(event);
    if (event.type==='complete') completed={result:event.result,spec:event.spec};
    if (event.type==='failed') failure=new VoiceRequestError(event.error);
  },event=>event.type==='complete'||event.type==='failed');
  if (failure) throw failure;
  if (!completed) throw new Error('Voice generation ended without a creation.');
  return completed;
}
export interface AudioCreationClient<T=CreationSpec> {
  generateAudio(recording:Recording,options:{signal:AbortSignal;onProgress:(phase:'transcribing'|'generating',message:string,transcript?:string)=>void}):Promise<T>;
}
export function createAudioCreationClient(configuration:()=>Omit<VoiceRequest,'captureMs'>):AudioCreationClient {
  return {async generateAudio(recording,options) {
    const response=await requestVoice(recording,configuration(),options.signal,{onEvent:event=>{
      if (event.type==='transcript') options.onProgress('generating','Creating while you fall…',event.result.text);
      if (event.type==='generation' && event.event.type==='stage') options.onProgress('generating',
        {design:'Designing while you fall…',geometry:'Building your creation…',validation:'Validating creation…'}[event.event.stage]);
    }});
    if (!response.spec) throw new Error('No creation was returned.');
    return response.spec;
  }};
}
