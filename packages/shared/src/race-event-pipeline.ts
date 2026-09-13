import { z } from 'zod';
import { createPipelineEventSchema } from './pipeline.js';
import { createVoiceEventSchema } from './voice.js';
import { RaceEventCreationSchema, RaceEventDesignSchema } from './race-events.js';

export const RaceEventPipelineEventSchema = createPipelineEventSchema(RaceEventDesignSchema, RaceEventCreationSchema);
export type RaceEventPipelineEvent = z.infer<typeof RaceEventPipelineEventSchema>;
export const RaceEventVoiceEventSchema = createVoiceEventSchema(RaceEventPipelineEventSchema, RaceEventCreationSchema);
export type RaceEventVoiceEvent = z.infer<typeof RaceEventVoiceEventSchema>;
