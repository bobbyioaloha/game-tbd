import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { CreationSpecSchema, GenerationRequestSchema } from '@sky/shared';
import { mockCreationProvider, type CreationProvider } from './provider.js';

export function registerCreationRoutes(app: FastifyInstance, provider: CreationProvider = mockCreationProvider, timeoutMs = 30000) {
  app.get('/api/creations/status', async () => ({mode: provider.mode, schemaVersion: 2}));
  app.post('/api/creations', async (request, reply) => {
    const input = GenerationRequestSchema.safeParse(request.body);
    if (!input.success) {
      return reply.code(400).send({error: {code: 'INVALID_REQUEST', message: 'Use one to ten words, at most 200 characters.'}});
    }
    const controller = new AbortController();
    const disconnect = () => { if (!reply.raw.writableEnded) controller.abort(); };
    reply.raw.on('close', disconnect);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Generation timed out')); }, timeoutMs);
      });
      // Exactly one provider invocation. No automatic repair or retry.
      const candidate = await Promise.race([provider.generate(input.data, {signal: controller.signal}), deadline]);
      const parsed = CreationSpecSchema.safeParse(candidate);
      if (!parsed.success) {
        return reply.code(502).send({error: {code: 'INVALID_SPEC', message: 'Provider returned invalid creation data.'}});
      }
      return {...parsed.data, id: randomUUID()};
    } catch {
      return reply.code(500).send({error: {code: 'GENERATION_FAILED', message: 'Creation generation failed or timed out.'}});
    } finally {
      clearTimeout(timer);
      reply.raw.off('close', disconnect);
    }
  });
}
