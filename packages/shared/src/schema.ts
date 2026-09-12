import { z } from 'zod';
const bounded = (min: number, max: number) => z.number().finite().min(min).max(max);
const vector = (min: number, max: number) => z.tuple([bounded(min,max), bounded(min,max), bounded(min,max)]);
export const PrimitiveSchema = z.object({
  type: z.enum(['box','sphere','cylinder','cone']),
  position: vector(-3,3),
  rotation: vector(-Math.PI,Math.PI),
  scale: vector(0.05,4),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).strict();
export const EffectSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('reduceFallSpeed'), multiplier:bounded(0.2,0.9), durationSeconds:bounded(1,15)}).strict(),
  z.object({type:z.literal('invulnerability'), durationSeconds:bounded(1,10)}).strict(),
  z.object({type:z.literal('clearNearbyObstacles'), radiusMeters:bounded(1,20)}).strict(),
]);
export const PowerUpSpecSchema = z.object({
  version:z.literal(1),
  id:z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  displayName:z.string().trim().min(1).max(48),
  description:z.string().trim().min(1).max(160),
  appearance:z.object({primitives:z.array(PrimitiveSchema).min(1).max(24)}).strict(),
  effects:z.array(EffectSchema).min(1).max(3).refine(
    effects => new Set(effects.map(effect => effect.type)).size === effects.length,
    'Duplicate effects are not allowed',
  ),
}).strict();
export type PowerUpSpec = z.infer<typeof PowerUpSpecSchema>;
export type Primitive = z.infer<typeof PrimitiveSchema>;
export type PowerUpEffect = z.infer<typeof EffectSchema>;
// Gameplay owns this constant. Visual dimensions never change collection reach.
export const COLLECTIBLE_RADIUS_METERS = 1;
export const GenerationRequestSchema = z.object({
  text:z.string().trim().min(1).max(200).refine(text => text.split(/\s+/u).length <= 10, 'Use ten words or fewer'),
}).strict();
export const GenerationErrorSchema = z.object({
  error:z.object({
    code:z.enum(['INVALID_REQUEST','GENERATION_FAILED','INVALID_SPEC']),
    message:z.string().min(1).max(200),
  }).strict(),
}).strict();
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;
export type GenerationError = z.infer<typeof GenerationErrorSchema>;
export type GenerationResult = {ok:true; spec:PowerUpSpec} | {ok:false; error:GenerationError['error']};
export interface GenerationClient {
  generate(request:GenerationRequest):Promise<GenerationResult>;
}

