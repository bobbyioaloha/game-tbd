import {
  SafetyDrillPipelineEventSchema, SafetyDrillVoiceEventSchema,
  type SafetyDrillSpec, type SafetyDrillPipelineEvent, type SafetyDrillVoiceEvent,
} from '@sky/shared';
import { createEncounterClient, type EncounterClient } from './encounter-client';
export type SafetyDrillGenerationClient = EncounterClient<SafetyDrillSpec,SafetyDrillPipelineEvent,SafetyDrillVoiceEvent>;
export const safetyDrillClient:SafetyDrillGenerationClient = createEncounterClient({
  textUrl:'/api/lab/drills',voiceUrl:'/api/voice/drills',
  parseEvent:SafetyDrillPipelineEventSchema.parse,parseVoiceEvent:SafetyDrillVoiceEventSchema.parse,
});
