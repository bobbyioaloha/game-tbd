import { fixtures, GenerationRequestSchema, PowerUpSpecSchema, GenerationErrorSchema, type GenerationClient } from '@sky/shared';
export const mockGenerationClient:GenerationClient = {
  async generate(request) {
    const parsed=GenerationRequestSchema.safeParse(request);
    if (!parsed.success) return {ok:false,error:{code:'INVALID_REQUEST',message:'Use one to ten words, at most 200 characters.'}};
    await new Promise(resolve => setTimeout(resolve,400));
    const text=parsed.data.text.toLowerCase();
    return {ok:true,spec:PowerUpSpecSchema.parse(fixtures[text.includes('ghost') ? 1 : /sun|angry|clear/.test(text) ? 2 : 0])};
  },
};
export const httpGenerationClient:GenerationClient = {
  async generate(request) {
    const parsed=GenerationRequestSchema.safeParse(request);
    if (!parsed.success) return {ok:false,error:{code:'INVALID_REQUEST',message:'Use one to ten words, at most 200 characters.'}};
    try {
      const response=await fetch('/api/powerups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed.data)});
      const data:unknown=await response.json();
      if (!response.ok) {
        const error=GenerationErrorSchema.safeParse(data);
        return {ok:false,error:error.success ? error.data.error : {code:'GENERATION_FAILED',message:'Unexpected server response.'}};
      }
      const spec=PowerUpSpecSchema.safeParse(data);
      return spec.success ? {ok:true,spec:spec.data} : {ok:false,error:{code:'INVALID_SPEC',message:'Server returned an invalid power-up.'}};
    } catch {
      return {ok:false,error:{code:'GENERATION_FAILED',message:'Could not reach the generation service.'}};
    }
  },
};
