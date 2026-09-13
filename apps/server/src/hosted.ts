import { buildApp } from './app.js';
import { buildPipeline } from './generation/pipeline-bootstrap.js';
import { RedisAttempts } from './generation/redis-attempts.js';
import { resolveAPIKey } from './generation/pipeline-config.js';

export function buildHostedApp(env:NodeJS.ProcessEnv = process.env) {
  // Keys alone cannot enable spending. Previews always stay mock-only.
  const liveEnabled = env.VERCEL_ENV === 'production' && env.HOSTED_LIVE_ENABLED === 'true';
  let origin:string|undefined;
  let attempts:RedisAttempts|undefined;
  if (liveEnabled) {
    if (!resolveAPIKey(env) || !env.APP_ORIGIN || !env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Hosted live mode requires the provider key, APP_ORIGIN, and Upstash REST credentials.');
    }
    const parsed = new URL(env.APP_ORIGIN);
    if (parsed.protocol !== 'https:' || parsed.origin !== env.APP_ORIGIN) {
      throw new Error('APP_ORIGIN must be the exact HTTPS origin, without a trailing slash or path.');
    }
    origin = parsed.origin;
    attempts = new RedisAttempts(env.UPSTASH_REDIS_REST_URL,env.UPSTASH_REDIS_REST_TOKEN);
  }
  const pipeline = buildPipeline(env,liveEnabled,attempts);
  if (!liveEnabled) for (const profile of pipeline.profiles) {
    if (profile.mode === 'live') profile.unavailableReason = 'Paid generation is disabled on this deployment.';
  }
  return buildApp({pipeline,allowedOrigin:value=>origin !== undefined && value === origin});
}
