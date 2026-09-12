import { buildPipeline } from './generation/pipeline-bootstrap.js';
import { registerLabRoutes } from './generation/lab-routes.js';
import type { CreationPipeline } from './generation/pipeline.js';
import { registerCreationRoutes } from './generation/routes.js';
import type { CreationProvider } from './generation/provider.js';
import Fastify from 'fastify';
import { fixtures, GenerationRequestSchema, PowerUpSpecSchema } from '@sky/shared';
export function buildApp(options: {liveEnabled?:boolean; creationProvider?: CreationProvider; creationTimeoutMs?: number; pipeline?: CreationPipeline} = {}) {
  const app=Fastify({logger:{redact:['req.headers.authorization','req.headers.cookie']},bodyLimit:4096});
  const pipeline = options.pipeline ?? buildPipeline(process.env,options.liveEnabled ?? false);
  registerLabRoutes(app, pipeline);
  registerCreationRoutes(app, options.creationProvider ?? {
    mode:'mock', generate:(request, options) => pipeline.run({...request,profileId:'mock'},options),
  }, options.creationTimeoutMs);
  app.get('/api/health',async () => ({status:'ok',mode:'mock'}));
  app.post('/api/powerups',async (request,reply) => {
    const parsed=GenerationRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({error:{code:'INVALID_REQUEST',message:'Provide text containing one to ten words, at most 200 characters.'}});
    // Replace this fixture selection with a server-side provider adapter.
    const text=parsed.data.text.toLowerCase();
    const candidate=fixtures[text.includes('ghost') ? 1 : /sun|angry|clear/.test(text) ? 2 : 0];
    const spec=PowerUpSpecSchema.safeParse(candidate);
    if (!spec.success) return reply.code(502).send({error:{code:'INVALID_SPEC',message:'Generation returned an invalid power-up.'}});
    return spec.data;
  });
  app.setErrorHandler((error,_request,reply) => {
    const statusCode=typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
    const badRequest=typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500;
    return reply.code(badRequest ? 400 : 500).send({error:{code:badRequest ? 'INVALID_REQUEST' : 'GENERATION_FAILED',message:badRequest ? 'Invalid JSON request or request too large.' : 'Power-up generation failed.'}});
  });
  return app;
}

