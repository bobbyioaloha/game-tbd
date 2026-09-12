import OpenAI from 'openai';
import { setTimeout as delay } from 'node:timers/promises';
import { meshFixture, mockRaceEventForText, mockCreationForText, mockProceduralForText, appearanceToRecipe, type GeometryMode, type StageConfig, type StageMetric } from '@sky/shared';
import { PipelineFailure } from './pipeline-errors.js';
import { providerFailure, translateProviderError } from './provider-errors.js';

export type ModelStageRequest = {
  geometryMode?:GeometryMode;
  product?:'legacy'|'race-event';
  stage:'design'|'geometry'; config:StageConfig; instructions:string; input:string;
  schema:Record<string,unknown>; signal:AbortSignal;
};
export type ModelStageResponse = {data:unknown; usage?:StageMetric['usage']};
export interface StageTransport {run(request:ModelStageRequest):Promise<ModelStageResponse>}

export function openAITransport(apiKey:string, fetchImpl?: typeof fetch):StageTransport {
  // The pipeline owns the total/design deadlines via performance.now() and signal.
  // Keep the SDK's longer default fallback: its response-body timer uses Date.now(),
  // so a second 30s deadline can fire early when the host clock is corrected.
  const client = new OpenAI({apiKey,baseURL:'https://api.openai.com/v1',logLevel:'off',maxRetries:0,fetch:fetchImpl});
  return {
    async run(request) {
      const response = await client.responses.create({
        model:request.config.model, instructions:request.instructions, input:request.input,
        reasoning:{effort:request.config.reasoning},
        max_output_tokens:request.config.maxOutputTokens, store:false,
        text:{format:{type:'json_schema',name:request.stage+'_'+(request.geometryMode ?? 'mesh')+'_output',strict:true,schema:request.schema}},
      }, {signal:request.signal, maxRetries:0}).catch((error:unknown) => {
        if (request.signal.aborted) throw request.signal.reason;
        throw translateProviderError(error,request.config.model);
      });
      if (response.status === 'failed') {
        throw providerFailure({status:200,code:response.error?.code,requestId:response._request_id},request.config.model);
      }
      if (response.output.some(item => item.type === 'message' && item.content.some(content => content.type === 'refusal'))) {
        throw new PipelineFailure('REFUSED','The model declined this request.');
      }
      if (response.status !== 'completed') {
        throw new PipelineFailure('INCOMPLETE','The model response was incomplete. No retry was made.');
      }
      let data:unknown;
      try {data = JSON.parse(response.output_text);}
      catch {throw new PipelineFailure(request.stage === 'design' ? 'INVALID_DESIGN' : request.geometryMode === 'primitives' ? 'INVALID_RECIPE' : 'INVALID_MESH','The model returned unreadable structured data.');}
      return {data, ...(response.usage ? {usage:{
        inputTokens:response.usage.input_tokens, outputTokens:response.usage.output_tokens,
        reasoningTokens:response.usage.output_tokens_details.reasoning_tokens,
      }} : {})};
    },
  };
}
export const mockStageTransport:StageTransport = {
  async run(request) {
    await delay(request.stage === 'design' ? 450 : 900,undefined,{signal:request.signal});
    if(request.product==='race-event') {
      const fixture=mockRaceEventForText(request.input);
      if(!fixture)throw new PipelineFailure('INVALID_REQUEST','Event mocks support the four listed event prompts. Use a live profile for other ideas.');
      if(request.stage==='design')return {data:fixture.design};
      if(request.geometryMode!=='primitives')throw new PipelineFailure('INVALID_REQUEST','Event mock fixtures use Procedural parts. Raw mesh requires a live profile.');
      if(fixture.spec.appearance.type!=='primitives')throw new Error('Missing event fixture parts.');
      return {data:appearanceToRecipe(fixture.spec.appearance)};
    }
    if (request.geometryMode === 'primitives') {
      const fixture = mockProceduralForText(request.input);
      if (!fixture) throw new PipelineFailure('INVALID_REQUEST',
        'Mock mode only supports the listed comparison presets. Choose a preset or use a live profile for custom ideas.');
      return {data: request.stage === 'design' ? fixture.design : appearanceToRecipe(fixture.appearance)};
    }
    if (request.stage === 'design') {
      const fixture = mockCreationForText(request.input.toLowerCase());
      return {data:{displayName:fixture.displayName,description:fixture.description,
        visualBrief:'A faceted floating crystal with pointed ends and cyan, blue and lavender triangular faces.',
        effect:fixture.effects[0]}};
    }
    const mesh = meshFixture.appearance;
    if (mesh.type !== 'mesh') throw new Error('Mock mesh fixture is missing');
    return {data:{
      vertices:mesh.vertices.map(([x,y,z]) => ({x,y,z})),
      faces:mesh.triangles.map(([a,b,c],i) => ({a,b,c,color:mesh.faceColors[i]})),
    }};
  },
};
