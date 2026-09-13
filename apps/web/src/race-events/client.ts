import {
  RaceEventPipelineEventSchema, RaceEventVoiceEventSchema,
  type RaceEventCreation, type RaceEventPipelineEvent, type RaceEventVoiceEvent,
} from '@sky/shared';
import { createEncounterClient, type EncounterClient } from './encounter-client';
export { RaceEventRequestError } from './encounter-client';
export type RaceEventGenerationClient = EncounterClient<RaceEventCreation,RaceEventPipelineEvent,RaceEventVoiceEvent>;
export const raceEventClient:RaceEventGenerationClient = createEncounterClient({
  textUrl:'/api/lab/events',voiceUrl:'/api/voice/events',
  parseEvent:RaceEventPipelineEventSchema.parse,parseVoiceEvent:RaceEventVoiceEventSchema.parse,
});
