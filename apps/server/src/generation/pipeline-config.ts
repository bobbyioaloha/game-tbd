import { StageConfigSchema, type PipelineProfile, type StageConfig } from '@sky/shared';
const baseDesign:StageConfig = {model:'gpt-5.6-sol',reasoning:'low',maxOutputTokens:2048};
const baseGeometry:StageConfig = {model:'gpt-6-astra',reasoning:'low',maxOutputTokens:12000};
const supported = new Set(['gpt-6-astra','gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna']);
export function resolveAPIKey(env:NodeJS.ProcessEnv = process.env):string | undefined {
  return env.OPENAI_API_KEY?.trim() || env.AI_API_KEY?.trim() || undefined;
}
export function pipelineProfiles(env:NodeJS.ProcessEnv = process.env, liveEnabled = false):PipelineProfile[] {
  const available = liveEnabled && Boolean(resolveAPIKey(env));
  const unavailableReason = !liveEnabled ? 'Paid generation is disabled. Start bun run dev:live to opt in.'
    : 'Set OPENAI_API_KEY in apps/server/.env and restart bun run dev:live.';
  const live = {mode:'live' as const, available, ...(available ? {} : {unavailableReason})};
  function configured(prefix:'DESIGN'|'GEOMETRY', defaults:StageConfig):StageConfig {
    const config = StageConfigSchema.parse({
      model:env[prefix+'_MODEL'] ?? defaults.model,
      reasoning:env[prefix+'_REASONING'] ?? defaults.reasoning,
      maxOutputTokens:env[prefix+'_MAX_OUTPUT_TOKENS'] === undefined ? defaults.maxOutputTokens : Number(env[prefix+'_MAX_OUTPUT_TOKENS']),
    });
    if (!supported.has(config.model)) throw new Error(prefix+'_MODEL must be a supported model listed in pipeline-config.ts');
    return config;
  }
  return [
    {id:'mock',label:'Mock two-stage pipeline',mode:'mock',available:true,design:{...baseDesign,model:'mock-design'},geometry:{...baseGeometry,model:'mock-geometry'}},
    {id:'sol-astra',label:'Sol design → Astra visuals',...live,design:baseDesign,geometry:baseGeometry},
    {id:'sol-sol',label:'Sol design → Sol visuals',...live,design:baseDesign,geometry:{...baseGeometry,model:'gpt-5.6-sol'}},
    {id:'configured',label:'Server-configured models',...live,design:configured('DESIGN',baseDesign),geometry:configured('GEOMETRY',baseGeometry)},
  ];
}
