import { z } from 'zod';
import { PowerUpSpecSchema } from './schema.js';
import { MeshAppearanceSchema, PrimitiveAppearanceSchema } from './creation.js';

const finite = (min: number, max: number) => z.number().finite().min(min).max(max);
export const RaceEventTypeSchema = z.enum(['gravityWell', 'debrisShower', 'repulsionBurst', 'protectiveZone']);
export type RaceEventType = z.infer<typeof RaceEventTypeSchema>;
// These are gameplay parameters, never derived from mesh dimensions or model-written code.
export const RaceEventEffectSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('gravityWell'), durationSeconds:finite(1,10), radiusMeters:finite(4,4000), acceleration:finite(1,36)}).strict(),
  z.object({type:z.literal('debrisShower'), durationSeconds:finite(1,10), collidableCount:z.number().int().min(1).max(48), visualCount:z.number().int().min(0).max(80), speed:finite(1,36), impulse:finite(1,24)}).strict(),
  z.object({type:z.literal('repulsionBurst'), durationSeconds:finite(0.5,3), radiusMeters:finite(4,4000), impulse:finite(1,36)}).strict(),
  z.object({type:z.literal('protectiveZone'), durationSeconds:finite(1,10), radiusMeters:finite(4,4000), descentAcceleration:finite(0,24).default(0)}).strict(),
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
  gravityWell:{label:'Gravity vortex',description:'An 8-second vortex pulls the whole race into wide orbits around the creation.',
    effect:{type:'gravityWell',durationSeconds:8,radiusMeters:4000,acceleration:32}},
  debrisShower:{label:'Debris storm',description:'Three waves of large debris rain toward every racer for 8 seconds. Steer away from the incoming rocks!',
    effect:{type:'debrisShower',durationSeconds:8,collidableCount:48,visualCount:80,speed:30,impulse:20}},
  repulsionBurst:{label:'Shockwave',description:'A race-wide shockwave throws every racer outward once with a powerful impulse.',
    effect:{type:'repulsionBurst',durationSeconds:2.5,radiusMeters:4000,impulse:32}},
  protectiveZone:{label:'Safe slipstream',description:'Every racer gets 8 seconds of obstacle protection and faster descent. Weapons still work.',
    effect:{type:'protectiveZone',durationSeconds:8,radiusMeters:4000,descentAcceleration:18}},
};
export function raceEventPreset(type:RaceEventType) {
  const entry=catalogue[type];
  return {...entry,effect:RaceEventEffectSchema.parse(entry.effect)};
}
export const RACE_EVENT_LIMITS = Object.freeze({
  collectibleRadius:1, maxPickupContactRadius:16, racerRadius:0.6, debrisRadius:1.15, collectibleLifetime:20,
  maxStepSeconds:1/30, maxAcceleration:36, maxVelocityDelta:36, maxAnchorSpeed:100, maxDebris:128, debrisWaves:3, debrisLifetime:2.4,
});
