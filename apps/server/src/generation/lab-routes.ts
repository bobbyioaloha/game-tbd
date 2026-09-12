import type { FastifyInstance } from 'fastify';
import { PIPELINE_DEADLINE_MS, DESIGN_BUDGET_MS, PipelineRequestSchema, type PipelineEvent } from '@sky/shared';
import type { CreationPipeline } from './pipeline.js';
export function registerLabRoutes(app:FastifyInstance,pipeline:CreationPipeline) {
  app.get('/api/lab/profiles',async (_request,reply) => {
    reply.header('Cache-Control','no-store');
    return {profiles:pipeline.profiles,liveUsage:pipeline.liveUsage,deadlineMs:PIPELINE_DEADLINE_MS,designBudgetMs:DESIGN_BUDGET_MS};
  });
  app.post('/api/lab/creations',async (request,reply) => {
    const parsed = PipelineRequestSchema.safeParse(request.body);
    const profile = parsed.success ? pipeline.profiles.find(item => item.id === parsed.data.profileId) : undefined;
    if (!parsed.success || !profile) return reply.code(400).send({error:{code:'INVALID_REQUEST',message:'Use one to ten words and select a known profile.'}});
    if (profile.mode === 'live' && request.headers.origin) {
      // The unauthenticated development lab is local-only; reject cross-origin websites.
      let localOrigin = false;
      try {
        const origin = new URL(request.headers.origin);
        localOrigin = ['http:','https:'].includes(origin.protocol) && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
      } catch { /* Invalid origins are rejected. */ }
      if (!localOrigin) return reply.code(403).send({error:{code:'INVALID_REQUEST',message:'Paid lab requests must originate from localhost.'}});
    }
    if (profile.mode === 'live' && !pipeline.liveUsage.enabled) return reply.code(403).send({error:{code:'LIVE_DISABLED',message:'Paid generation is disabled. Start bun run dev:live to opt in.'}});
    if (profile.mode === 'live' && !parsed.data.paidAttempt) return reply.code(400).send({error:{code:'CONSENT_REQUIRED',message:'Allow this paid attempt before generating.'}});
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
