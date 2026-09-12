import { pipelineProfiles, resolveAPIKey } from './pipeline-config.js';
import { CreationPipeline } from './pipeline.js';
import { mockStageTransport, openAITransport } from './stage-transport.js';
export function buildPipeline(env:NodeJS.ProcessEnv = process.env) {
  const apiKey = resolveAPIKey(env);
  return new CreationPipeline(pipelineProfiles(env),{
    mock:mockStageTransport,
    ...(apiKey ? {live:openAITransport(apiKey)} : {}),
  });
}
