import OpenAI from 'openai';
import { setTimeout as delay } from 'node:timers/promises';
import { meshFixture, mockCreationForText, type StageConfig, type StageMetric } from '@sky/shared';
import { PipelineFailure } from './pipeline-errors.js';

export type ModelStageRequest = {
  stage:'design'|'geometry'; config:StageConfig; instructions:string; input:string;
  schema:Record<string,unknown>; signal:AbortSignal;
};
export type ModelStageResponse = {data:unknown; usage?:StageMetric['usage']};
export interface StageTransport {run(request:ModelStageRequest):Promise<ModelStageResponse>}

export function openAITransport(apiKey:string, fetchImpl?: typeof fetch):StageTransport {
  const client = new OpenAI({apiKey,maxRetries:0,timeout:30000,fetch:fetchImpl});
  return {
    async run(request) {
      const response = await client.responses.create({
        model:request.config.model, instructions:request.instructions, input:request.input,
        reasoning:{effort:request.config.reasoning},
        max_output_tokens:request.config.maxOutputTokens, store:false,
        text:{format:{type:'json_schema',name:request.stage+'_output',strict:true,schema:request.schema}},
      }, {signal:request.signal, maxRetries:0});
      if (response.output.some(item => item.type === 'message' && item.content.some(content => content.type === 'refusal'))) {
        throw new PipelineFailure('REFUSED','The model declined this request.');
      }
      if (response.status !== 'completed') {
        throw new PipelineFailure('INCOMPLETE','The model response was incomplete. No retry was made.');
      }
      let data:unknown;
      try {data = JSON.parse(response.output_text);}
      catch {throw new PipelineFailure(request.stage === 'design' ? 'INVALID_DESIGN' : 'INVALID_MESH','The model returned unreadable structured data.');}
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
