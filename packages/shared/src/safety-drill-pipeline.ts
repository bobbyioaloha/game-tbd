import { z } from 'zod';
import { createPipelineEventSchema } from './pipeline.js';
import { createVoiceEventSchema } from './voice.js';
import { SafetyDrillSpecSchema, SafetyDrillDesignSchema } from './safety-drills.js';

export const SafetyDrillPipelineEventSchema = createPipelineEventSchema(SafetyDrillDesignSchema, SafetyDrillSpecSchema);
export type SafetyDrillPipelineEvent = z.infer<typeof SafetyDrillPipelineEventSchema>;
export const SafetyDrillVoiceEventSchema = createVoiceEventSchema(SafetyDrillPipelineEventSchema, SafetyDrillSpecSchema);
export type SafetyDrillVoiceEvent = z.infer<typeof SafetyDrillVoiceEventSchema>;
