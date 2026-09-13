import OpenAI from 'openai';
import { PipelineFailure } from './pipeline-errors.js';
import {
  CONTENT_CHECK_BUDGET_MS, CONTENT_REFUSAL_MESSAGE, CONTENT_UNAVAILABLE_MESSAGE,
  MODERATION_CATEGORIES, normalizeContent,
} from './content-policy.js';

export interface ContentGuard {
  check(texts: readonly string[], signal: AbortSignal): Promise<'allow' | 'block'>;
}
export type ContentGuards = {mock: ContentGuard; live?: ContentGuard};
const unavailable = () => new PipelineFailure('PROVIDER_UNAVAILABLE', CONTENT_UNAVAILABLE_MESSAGE);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validate the external response and apply game policy, never just its aggregate flag. */
export function moderationDecision(response: unknown, inputCount: number): 'allow' | 'block' {
  if (!record(response) || !Array.isArray(response.results) ||
    inputCount < 1 || response.results.length !== inputCount) throw unavailable();
  let blocked = false;
  for (const result of response.results) {
    if (!record(result) || typeof result.flagged !== 'boolean' || !record(result.categories)) throw unavailable();
    const categories = result.categories;
    if (!MODERATION_CATEGORIES.every(category => typeof categories[category] === 'boolean') ||
      Object.values(categories).some(value => typeof value !== 'boolean')) throw unavailable();
    const flagged = Object.entries(categories).filter(([, value]) => value);
    // An unexplained aggregate flag cannot be treated as an approval.
    if (result.flagged && flagged.length === 0) throw unavailable();
    if (flagged.some(([category]) => category !== 'violence')) blocked = true;
  }
  return blocked ? 'block' : 'allow';
}

export function openAIContentGuard(apiKey: string, fetchImpl?: typeof fetch): ContentGuard {
  const client = new OpenAI({
    apiKey, baseURL: 'https://api.openai.com/v1', logLevel: 'off', maxRetries: 0, fetch: fetchImpl,
  });
  return {
    async check(texts, signal) {
      signal.throwIfAborted();
      try {
        const response = await client.moderations.create({
          model: 'omni-moderation-latest', input: texts.map(normalizeContent),
        }, {signal, maxRetries: 0});
        signal.throwIfAborted();
        return moderationDecision(response, texts.length);
      } catch {
        if (signal.aborted) throw signal.reason;
        // Never forward provider messages, echoed input, scores or credentials.
        throw unavailable();
      }
    },
  };
}

// Deterministic UX fixtures, not a classifier or a fallback for live screening.
// Production mock generation only returns game-authored assets.
export const mockContentGuard: ContentGuard = {
  async check(texts, signal) {
    signal.throwIfAborted();
    const inputs = texts.map(text => normalizeContent(text).toLowerCase());
    if (inputs.includes('unavailable mock screening')) throw unavailable();
    return inputs.includes('blocked mock request') ? 'block' : 'allow';
  },
};

/** Own the timeout even when an injected adapter ignores AbortSignal. */
export async function screenContent(
  guard: ContentGuard, texts: readonly string[], signal: AbortSignal,
  budgetMs = CONTENT_CHECK_BUDGET_MS,
): Promise<void> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const forward = () => controller.abort(signal.reason);
  signal.addEventListener('abort', forward, {once: true});
  const timer = setTimeout(() => controller.abort(unavailable()), Math.max(0, budgetMs));
  let rejectAbort: (reason: unknown) => void = () => {};
  const abort = () => rejectAbort(controller.signal.reason);
  const started = performance.now();
  try {
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
      controller.signal.addEventListener('abort', abort, {once: true});
    });
    controller.signal.throwIfAborted();
    const decision = await Promise.race([guard.check(texts, controller.signal), aborted]);
    controller.signal.throwIfAborted();
    if (performance.now() - started >= budgetMs) throw unavailable();
    if (decision === 'block') throw new PipelineFailure('REFUSED', CONTENT_REFUSAL_MESSAGE);
    if (decision !== 'allow') throw unavailable();
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof PipelineFailure && error.code === 'REFUSED') {
      throw new PipelineFailure('REFUSED', CONTENT_REFUSAL_MESSAGE);
    }
    throw unavailable();
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', forward);
    controller.signal.removeEventListener('abort', abort);
  }
}
