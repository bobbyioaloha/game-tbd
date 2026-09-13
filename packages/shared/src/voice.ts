import { z } from 'zod';
import { GenerationRequestSchema } from './schema.js';
import { GeneratedCreationSchema, PipelineErrorSchema, PipelineEventSchema, PipelineRequestSchema } from './pipeline.js';

export const RECORDING_LIMIT_MS = 8_000;
export const TRANSCRIPTION_DEADLINE_MS = 10_000;
export const AUDIO_UPLOAD_LIMIT_BYTES = 1_048_576;
export const AUDIO_MIME_TYPES = ['audio/webm','audio/mp4','audio/wav'] as const;
export const VoiceRequestSchema = PipelineRequestSchema.omit({text:true}).extend({
  captureMs:z.number().finite().min(0).max(RECORDING_LIMIT_MS),
  // Explicit simulated input only; live transcription ignores this field.
  mockText:GenerationRequestSchema.shape.text.optional(),
}).strict();
export type VoiceRequest = z.infer<typeof VoiceRequestSchema>;
export const TranscriptionMetricSchema = z.object({model:z.string().min(1).max(80),durationMs:z.number().finite().nonnegative()}).strict();
export type TranscriptionMetric = z.infer<typeof TranscriptionMetricSchema>;
export const TranscriptResultSchema = z.object({text:GenerationRequestSchema.shape.text,metric:TranscriptionMetricSchema}).strict();
export type TranscriptResult = z.infer<typeof TranscriptResultSchema>;
/** Text and voice share the same version-specific generation envelope. */
export function createVoiceEventSchema<E extends z.ZodTypeAny, S extends z.ZodTypeAny>(event: E, spec: S) {
  return z.discriminatedUnion('type',[
    z.object({type:z.literal('transcribing')}).strict(),
    z.object({type:z.literal('transcript'),result:TranscriptResultSchema}).strict(),
    z.object({type:z.literal('generation'),event}).strict(),
    z.object({type:z.literal('complete'),result:TranscriptResultSchema,spec,elapsedMs:z.number().nonnegative()}).strict(),
    z.object({type:z.literal('failed'),error:PipelineErrorSchema,elapsedMs:z.number().nonnegative()}).strict(),
  ]);
}
export const VoiceEventSchema = createVoiceEventSchema(PipelineEventSchema, GeneratedCreationSchema);
export type VoiceEvent = z.infer<typeof VoiceEventSchema>;
