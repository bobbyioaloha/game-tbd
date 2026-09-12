import { CreationSpecSchema, GenerationRequestSchema, GenerationErrorSchema, mockCreationForText, type CreationClient } from '@sky/shared';
const invalid = {ok: false as const, error: {code: 'INVALID_REQUEST' as const, message: 'Use one to ten words, at most 200 characters.'}};
export const mockCreationClient: CreationClient = {
  async generate(request, options) {
    const input = GenerationRequestSchema.safeParse(request);
    if (!input.success) return invalid;
    await new Promise<void>((resolve, reject) => {
      const signal = options?.signal;
      if (signal?.aborted) { reject(new Error('Cancelled')); return; }
      const abort = () => { clearTimeout(timer); reject(new Error('Cancelled')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 1400);
      signal?.addEventListener('abort', abort, {once: true});
    });
    return {ok: true, spec: CreationSpecSchema.parse(mockCreationForText(input.data.text.toLowerCase()))};
  },
};
export const httpCreationClient: CreationClient = {
  async generate(request, options) {
    const input = GenerationRequestSchema.safeParse(request);
    if (!input.success) return invalid;
    try {
      const signal = options?.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(35000)])
        : AbortSignal.timeout(35000);
      const response = await fetch('/api/creations', {
        method: 'POST', signal,
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input.data),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const error = GenerationErrorSchema.safeParse(data);
        return {ok: false, error: error.success ? error.data.error : {code: 'GENERATION_FAILED', message: 'Unexpected server response.'}};
      }
      const spec = CreationSpecSchema.safeParse(data);
      return spec.success ? {ok: true, spec: spec.data} : {ok: false, error: {code: 'INVALID_SPEC', message: 'Server returned an invalid creation.'}};
    } catch {
      return {ok: false, error: {code: 'GENERATION_FAILED', message: 'Request cancelled, timed out, or could not reach the server.'}};
    }
  },
};
