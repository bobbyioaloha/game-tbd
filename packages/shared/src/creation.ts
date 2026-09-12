import { z } from 'zod';
import { PrimitiveSchema, PowerUpSpecSchema, type PowerUpSpec, type GenerationRequest, type GenerationError } from './schema.js';

const vertex = z.tuple([z.number().finite().min(-3).max(3), z.number().finite().min(-3).max(3), z.number().finite().min(-3).max(3)]);
const index = z.number().int().min(0).max(255);
export const MeshAppearanceSchema = z.object({
  type: z.literal('mesh'),
  vertices: z.array(vertex).min(3).max(256),
  triangles: z.array(z.tuple([index, index, index])).min(1).max(512),
  faceColors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(512),
}).strict().superRefine((mesh, ctx) => {
  if (mesh.faceColors.length !== mesh.triangles.length) {
    ctx.addIssue({code: 'custom', path: ['faceColors'], message: 'Exactly one color per triangle is required'});
  }
  mesh.triangles.forEach((triangle, i) => {
    if (new Set(triangle).size !== 3 || triangle.some(value => !Number.isInteger(value) || value < 0 || value >= mesh.vertices.length)) {
      ctx.addIssue({code: 'custom', path: ['triangles', i], message: 'Triangle must reference three distinct existing vertices'});
      return;
    }
    const [a, b, c] = triangle.map(value => mesh.vertices[value]);
    const u = b.map((value, axis) => value - a[axis]);
    const v = c.map((value, axis) => value - a[axis]);
    const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    if (cross.reduce((sum, value) => sum + value*value, 0) < 1e-12) {
      ctx.addIssue({code: 'custom', path: ['triangles', i], message: 'Triangle area is too small'});
    }
  });
});
export const PrimitiveAppearanceSchema = z.object({
  type: z.literal('primitives'), primitives: z.array(PrimitiveSchema).min(1).max(24),
}).strict();
export type PrimitiveAppearance = z.infer<typeof PrimitiveAppearanceSchema>;
export const CreationSpecSchema = PowerUpSpecSchema.extend({
  version: z.literal(2),
  appearance: z.union([
    PrimitiveAppearanceSchema,
    MeshAppearanceSchema,
  ]),
});
export type CreationSpec = z.infer<typeof CreationSpecSchema>;
export type MeshAppearance = z.infer<typeof MeshAppearanceSchema>;
export type CreationResult = {ok: true; spec: CreationSpec} | {ok: false; error: GenerationError['error']};
export interface CreationClient {
  generate(request: GenerationRequest, options?: {signal?: AbortSignal}): Promise<CreationResult>;
}
export function adaptPowerUpV1(spec: PowerUpSpec): CreationSpec {
  return CreationSpecSchema.parse({...spec, version: 2, appearance: {type: 'primitives', ...spec.appearance}});
}
// Voice pickups are authored by the game and never produced by AI.
export type VoicePickup = {kind: 'voice'; instanceId: string; position: [number, number, number]};
export type CreationPickup = {kind: 'creation'; instanceId: string; position: [number, number, number]; spec: CreationSpec};

