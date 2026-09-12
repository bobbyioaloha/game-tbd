import type { FastifyInstance } from 'fastify';
import { PipelineRequestSchema, type PipelineEvent } from '@sky/shared';
import type { CreationPipeline } from './pipeline.js';
export function registerLabRoutes(app:FastifyInstance,pipeline:CreationPipeline) {
  app.get('/api/lab/profiles',async () => ({profiles:pipeline.profiles,deadlineMs:30000,designBudgetMs:8000}));
  app.post('/api/lab/creations',async (request,reply) => {
    const parsed = PipelineRequestSchema.safeParse(request.body);
    const profile = parsed.success ? pipeline.profiles.find(item => item.id === parsed.data.profileId) : undefined;
    if (!parsed.success || !profile) return reply.code(400).send({error:{code:'INVALID_REQUEST',message:'Use one to ten words and select a known profile.'}});
    if (!profile.available) return reply.code(503).send({error:{code:'NOT_CONFIGURED',message:profile.unavailableReason ?? 'Provider unavailable.'}});
    const controller = new AbortController();
    const disconnect = () => {if (!reply.raw.writableEnded) controller.abort();};
    reply.raw.on('close',disconnect);
    reply.hijack();
    reply.raw.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
    const emit = (event:PipelineEvent) => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(JSON.stringify(event)+'\n');
    };
    try {await pipeline.run(parsed.data,{signal:controller.signal,emit});}
    catch {/* The pipeline has emitted one terminal failure event. */}
    finally {
      reply.raw.off('close',disconnect);
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });
}
