import { z } from 'zod';
import { PipelineErrorSchema, PipelineStageSchema, StageMetricSchema } from './pipeline.js';
import { TranscriptResultSchema } from './voice.js';
import { RaceEventCreationSchema, RaceEventDesignSchema } from './race-events.js';
export const RaceEventPipelineEventSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('stage'),stage:PipelineStageSchema,elapsedMs:z.number().nonnegative()}).strict(),
  z.object({type:z.literal('design'),design:RaceEventDesignSchema,metric:StageMetricSchema}).strict(),
  z.object({type:z.literal('geometry'),metric:StageMetricSchema}).strict(),
  z.object({type:z.literal('complete'),spec:RaceEventCreationSchema,elapsedMs:z.number().nonnegative(),metrics:z.array(StageMetricSchema)}).strict(),
  z.object({type:z.literal('failed'),stage:PipelineStageSchema,error:PipelineErrorSchema,elapsedMs:z.number().nonnegative(),metrics:z.array(StageMetricSchema)}).strict(),
]);
export type RaceEventPipelineEvent=z.infer<typeof RaceEventPipelineEventSchema>;
export const RaceEventVoiceEventSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('transcribing')}).strict(),
  z.object({type:z.literal('transcript'),result:TranscriptResultSchema}).strict(),
  z.object({type:z.literal('generation'),event:RaceEventPipelineEventSchema}).strict(),
  z.object({type:z.literal('complete'),result:TranscriptResultSchema,spec:RaceEventCreationSchema,elapsedMs:z.number().nonnegative()}).strict(),
  z.object({type:z.literal('failed'),error:PipelineErrorSchema,elapsedMs:z.number().nonnegative()}).strict(),
]);
export type RaceEventVoiceEvent=z.infer<typeof RaceEventVoiceEventSchema>;
