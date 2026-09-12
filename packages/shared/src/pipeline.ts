import { z } from 'zod';
import { EffectSchema, GenerationRequestSchema, PowerUpSpecSchema } from './schema.js';
import { MeshAppearanceSchema } from './creation.js';

export const CreationDesignSchema = z.object({
  displayName: PowerUpSpecSchema.shape.displayName,
  description: PowerUpSpecSchema.shape.description,
  visualBrief: z.string().trim().min(1).max(700),
  effect: EffectSchema,
}).strict();
// Stricter production output; the broader v2 contract stays compatible with the game.
export const GeneratedCreationSchema = PowerUpSpecSchema.extend({
  version: z.literal(2), appearance: MeshAppearanceSchema, effects: z.array(EffectSchema).length(1),
});
export type CreationDesign = z.infer<typeof CreationDesignSchema>;
export type GeneratedCreation = z.infer<typeof GeneratedCreationSchema>;
export const PipelineRequestSchema = GenerationRequestSchema.extend({profileId: z.string().min(1).max(48)});
export type PipelineRequest = z.infer<typeof PipelineRequestSchema>;
export const StageConfigSchema = z.object({
  model: z.string().min(1).max(80),
  reasoning: z.enum(['low','medium','high']),
  maxOutputTokens: z.number().int().min(256).max(16000),
}).strict();
export type StageConfig = z.infer<typeof StageConfigSchema>;
export const PipelineProfileSchema = z.object({
  id: z.string(), label: z.string(), mode: z.enum(['mock','live']),
  available: z.boolean(), unavailableReason: z.string().optional(),
  design: StageConfigSchema, geometry: StageConfigSchema,
}).strict();
export type PipelineProfile = z.infer<typeof PipelineProfileSchema>;
export const PipelineProfilesSchema = z.object({
  profiles: z.array(PipelineProfileSchema), deadlineMs: z.literal(30000), designBudgetMs: z.literal(8000),
}).strict();
export const PipelineStageSchema = z.enum(['design','geometry','validation']);
export type PipelineStage = z.infer<typeof PipelineStageSchema>;
const usage = z.object({inputTokens:z.number().nonnegative(), outputTokens:z.number().nonnegative(), reasoningTokens:z.number().nonnegative().optional()}).strict();
export const StageMetricSchema = z.object({
  stage: z.enum(['design','geometry']), model: z.string(), durationMs:z.number().nonnegative(), usage:usage.optional(),
}).strict();
export type StageMetric = z.infer<typeof StageMetricSchema>;
export const PipelineErrorSchema = z.object({
  code:z.enum(['INVALID_REQUEST','NOT_CONFIGURED','INVALID_DESIGN','INVALID_MESH','TIMEOUT','CANCELLED','REFUSED','INCOMPLETE','PROVIDER_ERROR']),
  message:z.string().min(1).max(240),
}).strict();
export type PipelineErrorData = z.infer<typeof PipelineErrorSchema>;
export const PipelineEventSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('stage'), stage:PipelineStageSchema, elapsedMs:z.number().nonnegative()}).strict(),
  z.object({type:z.literal('design'), design:CreationDesignSchema, metric:StageMetricSchema}).strict(),
  z.object({type:z.literal('geometry'), metric:StageMetricSchema}).strict(),
  z.object({type:z.literal('complete'), spec:GeneratedCreationSchema, elapsedMs:z.number().nonnegative(), metrics:z.array(StageMetricSchema)}).strict(),
  z.object({type:z.literal('failed'), stage:PipelineStageSchema, error:PipelineErrorSchema, elapsedMs:z.number().nonnegative(), metrics:z.array(StageMetricSchema)}).strict(),
]);
export type PipelineEvent = z.infer<typeof PipelineEventSchema>;

const coordinate = z.number().finite().min(-3).max(3);
const vertexIndex = z.number().int().min(0).max(255);
export const GeometryWireSchema = z.object({
  vertices:z.array(z.object({x:coordinate,y:coordinate,z:coordinate}).strict()).min(3).max(256),
  faces:z.array(z.object({a:vertexIndex,b:vertexIndex,c:vertexIndex,color:z.string().regex(/^#[0-9a-fA-F]{6}$/)}).strict()).min(1).max(512),
}).strict();
