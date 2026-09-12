import { z } from 'zod';
import { PrimitiveSchema } from './schema.js';
import { PrimitiveAppearanceSchema, type PrimitiveAppearance } from './creation.js';

// Structured Outputs uses named coordinates; the game keeps its existing tuples.
const xyz = (value: z.ZodNumber) => z.object({x: value, y: value, z: value}).strict();
export const PrimitiveRecipeWireSchema = z.object({
  parts: z.array(z.object({
    type: PrimitiveSchema.shape.type,
    position: xyz(PrimitiveSchema.shape.position.items[0]),
    rotation: xyz(PrimitiveSchema.shape.rotation.items[0]),
    scale: xyz(PrimitiveSchema.shape.scale.items[0]),
    color: PrimitiveSchema.shape.color,
  }).strict()).min(1).max(24),
}).strict();
export type PrimitiveRecipeWire = z.infer<typeof PrimitiveRecipeWireSchema>;
export function recipeToAppearance(data: unknown): PrimitiveAppearance {
  const recipe = PrimitiveRecipeWireSchema.parse(data);
  const tuple = ({x, y, z}: {x: number; y: number; z: number}): [number, number, number] => [x, y, z];
  return PrimitiveAppearanceSchema.parse({type: 'primitives', primitives: recipe.parts.map(part => ({
    type: part.type, color: part.color,
    position: tuple(part.position), rotation: tuple(part.rotation), scale: tuple(part.scale),
  }))});
}
export function appearanceToRecipe(appearance: PrimitiveAppearance): PrimitiveRecipeWire {
  const xyz = ([x, y, z]: [number, number, number]) => ({x, y, z});
  return PrimitiveRecipeWireSchema.parse({parts: appearance.primitives.map(part => ({
    type: part.type, color: part.color,
    position: xyz(part.position), rotation: xyz(part.rotation), scale: xyz(part.scale),
  }))});
}
