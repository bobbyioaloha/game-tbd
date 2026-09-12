import { z } from 'zod';
import { PowerUpSpecSchema } from './schema.js';
import { MeshAppearanceSchema, PrimitiveAppearanceSchema } from './creation.js';

const finite = (min: number, max: number) => z.number().finite().min(min).max(max);
export const RaceEventTypeSchema = z.enum(['gravityWell', 'debrisShower', 'repulsionBurst', 'protectiveZone']);
export type RaceEventType = z.infer<typeof RaceEventTypeSchema>;
// These are gameplay parameters, never derived from mesh dimensions or model-written code.
export const RaceEventEffectSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('gravityWell'), durationSeconds:finite(1,8), radiusMeters:finite(4,24), acceleration:finite(1,16)}).strict(),
  z.object({type:z.literal('debrisShower'), durationSeconds:finite(1,8), collidableCount:z.number().int().min(1).max(20), visualCount:z.number().int().min(0).max(80), speed:finite(1,12), impulse:finite(1,8)}).strict(),
  z.object({type:z.literal('repulsionBurst'), durationSeconds:finite(0.5,3), radiusMeters:finite(4,24), impulse:finite(1,16)}).strict(),
  z.object({type:z.literal('protectiveZone'), durationSeconds:finite(1,8), radiusMeters:finite(4,24)}).strict(),
]);
export type RaceEventEffect = z.infer<typeof RaceEventEffectSchema>;
export const RaceEventCreationSchema = z.object({
  version:z.literal(3), id:PowerUpSpecSchema.shape.id,
  displayName:PowerUpSpecSchema.shape.displayName, description:PowerUpSpecSchema.shape.description,
  appearance:z.union([MeshAppearanceSchema,PrimitiveAppearanceSchema]), effect:RaceEventEffectSchema,
}).strict();
export type RaceEventCreation = z.infer<typeof RaceEventCreationSchema>;
export const RaceEventDesignSchema = z.object({
  displayName:PowerUpSpecSchema.shape.displayName,
  visualBrief:z.string().trim().min(1).max(700), effectType:RaceEventTypeSchema,
}).strict();
export type RaceEventDesign = z.infer<typeof RaceEventDesignSchema>;

// Balance lives here. The design model selects a type, never its strength or duration.
const catalogue:Record<RaceEventType,{label:string;description:string;effect:RaceEventEffect}> = {
  gravityWell:{label:'Gravity well',description:'A drifting gravity well pulls every nearby racer inward for 6 seconds.',
    effect:{type:'gravityWell',durationSeconds:6,radiusMeters:18,acceleration:12}},
  debrisShower:{label:'Debris shower',description:'A drifting shower scatters debris for 6 seconds. Solid fragments knock any racer they hit.',
    effect:{type:'debrisShower',durationSeconds:6,collidableCount:16,visualCount:64,speed:7,impulse:5}},
  repulsionBurst:{label:'Repulsion burst',description:'A 1.5-second shockwave pushes each racer it reaches outward once, up to 20 meters away.',
    effect:{type:'repulsionBurst',durationSeconds:1.5,radiusMeters:20,impulse:12}},
  protectiveZone:{label:'Protective zone',description:'A drifting shelter lasts 7 seconds. Every racer inside its 12-meter radius is protected from obstacles.',
    effect:{type:'protectiveZone',durationSeconds:7,radiusMeters:12}},
};
export function raceEventPreset(type:RaceEventType) {
  const entry=catalogue[type];
  return {...entry,effect:RaceEventEffectSchema.parse(entry.effect)};
}
export const RACE_EVENT_LIMITS = Object.freeze({
  collectibleRadius:1, racerRadius:0.6, debrisRadius:0.45, collectibleLifetime:20,
  maxStepSeconds:1/30, maxAcceleration:16, maxVelocityDelta:16, maxAnchorSpeed:60,
});
