import { pipelineProfiles, resolveAPIKey } from './pipeline-config.js';
import { CreationPipeline } from './pipeline.js';
import { mockStageTransport, openAITransport } from './stage-transport.js';
export function buildPipeline(env:NodeJS.ProcessEnv = process.env, liveEnabled = false) {
  const apiKey = resolveAPIKey(env);
  const maxAttempts = env.LIVE_MAX_ATTEMPTS === undefined ? 3 : Number(env.LIVE_MAX_ATTEMPTS);
  return new CreationPipeline(pipelineProfiles(env,liveEnabled),{
    mock:mockStageTransport,
    ...(liveEnabled && apiKey ? {live:openAITransport(apiKey)} : {}),
  },undefined,{enabled:liveEnabled,maxAttempts});
}
