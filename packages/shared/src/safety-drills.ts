import { z } from 'zod';
import { MeshAppearanceSchema, PrimitiveAppearanceSchema } from './creation.js';
import { PowerUpSpecSchema } from './schema.js';
import { RaceEventCreationSchema, raceEventPreset } from './race-events.js';

const StampedeCrossingRecipeSchema = z.object({
  family: z.literal('stampede'),
  formation: z.enum(['line', 'split']),
  direction: z.enum(['left', 'right', 'alternating']),
  reaction: z.enum(['steady', 'charge', 'scatter']),
  modifier: z.enum(['none', 'draft']),
}).strict();
const StampedeConvoyRecipeSchema = StampedeCrossingRecipeSchema.extend({
  formation: z.literal('convoy'),
  reaction: z.literal('steady'),
});
const RapidsRecipeSchema = z.object({
  family: z.literal('rapids'),
  layout: z.enum(['winding', 'forked', 'alternating']),
  flow: z.enum(['steady', 'pulsing']),
  modifier: z.enum(['none', 'eddies']),
}).strict();
// Encode compatibility structurally so runtime validation and the provider schema
// accept the same recipes. Refinements cannot describe these rules to the model.
export const SafetyDrillRecipeSchema = z.union([
  StampedeCrossingRecipeSchema, StampedeConvoyRecipeSchema, RapidsRecipeSchema,
]);
export type SafetyDrillRecipe = z.infer<typeof SafetyDrillRecipeSchema>;
export const SafetyDrillDesignSchema = z.object({
  displayName: PowerUpSpecSchema.shape.displayName,
  visualBrief: z.string().trim().min(1).max(700),
  drill: SafetyDrillRecipeSchema,
}).strict();
export type SafetyDrillDesign = z.infer<typeof SafetyDrillDesignSchema>;
export const SafetyDrillSpecSchema = z.object({
  version: z.literal(4), id: PowerUpSpecSchema.shape.id,
  displayName: PowerUpSpecSchema.shape.displayName,
  description: PowerUpSpecSchema.shape.description,
  appearance: z.union([MeshAppearanceSchema, PrimitiveAppearanceSchema]),
  drill: SafetyDrillRecipeSchema,
}).strict();
export type SafetyDrillSpec = z.infer<typeof SafetyDrillSpecSchema>;
export const RaceEncounterSchema = z.union([RaceEventCreationSchema, SafetyDrillSpecSchema]);
export type RaceEncounter = z.infer<typeof RaceEncounterSchema>;

/** Authored units: meters, seconds, m/s, m/s². Model output contains no numeric gameplay settings. */
export const SAFETY_DRILL_LIMITS = Object.freeze({
  durationSeconds: 10, warningSeconds: 1, actorCount: 8, maxBands: 4, maxActors: 32, maxCurrents: 64,
  actorRadius: 2.2, bandSpacing: 90, laneHalfWidth: 32, bandLeadMeters: 45, bandLengthMeters: 210,
  approachRadius: 36, reactionWarningSeconds: 0.65,
  crossingSpeed: 14, chargeSpeed: 28, scatterSpeed: 22, convoySpeed: 8, collisionImpulse: 16,
  wakeRadius: 4, draftAcceleration: 14, currentRadius: 7,
  currentAcceleration: 20, fastAcceleration: 28, eddyAcceleration: 8,
});
/** Validate before compiling even for callers outside the HTTP boundary. */
export function compileSafetyDrill(input: unknown) {
  return {...SAFETY_DRILL_LIMITS, recipe: SafetyDrillRecipeSchema.parse(input)};
}
export type CompiledSafetyDrill = ReturnType<typeof compileSafetyDrill>;
type DrillPresentation = {label: string; instruction: string};
type StampedeRecipe = Extract<SafetyDrillRecipe, {family: 'stampede'}>;
type RapidsRecipe = Extract<SafetyDrillRecipe, {family: 'rapids'}>;

// Keep each behavior's name and player instruction together. Record keys make
// newly added recipe options a type error until their player-facing copy exists.
const stampedeReactions = {
  steady: undefined,
  charge: {label: 'Charge Avoidance Drill', instruction: 'Approach to bait a charge, then dodge after the warning.'},
  scatter: {label: 'Scatter Response Drill', instruction: 'Approach to scatter the herd and follow the opening.'},
} satisfies Record<StampedeRecipe['reaction'], DrillPresentation | undefined>;
const crossing = {label: 'Cross-Traffic Drill', instruction: 'Find a gap through the crossing herd.'};
const stampedeFormations = {
  line: crossing,
  split: crossing,
  convoy: {label: 'Convoy Navigation Drill', instruction: 'Follow the convoy and avoid its bodies.'},
} satisfies Record<StampedeRecipe['formation'], DrillPresentation>;
const rapidsRoutes = {
  winding: {label: 'Current Navigation Drill', instruction: 'Steer along the winding current.'},
  forked: {label: 'Shortcut Assessment', instruction: 'Choose the wide current or the narrow fast shortcut.'},
  alternating: {label: 'Lane-Change Drill', instruction: 'Switch lanes with the alternating current.'},
} satisfies Record<RapidsRecipe['layout'], DrillPresentation>;

function drillPresentation(recipe: SafetyDrillRecipe): DrillPresentation {
  switch (recipe.family) {
    case 'stampede': {
      const base = stampedeReactions[recipe.reaction] ?? stampedeFormations[recipe.formation];
      const modifier = {
        none: '', draft: ' Cyan wakes speed your descent.',
      } satisfies Record<StampedeRecipe['modifier'], string>;
      const label = recipe.reaction === 'steady' && recipe.modifier === 'draft'
        ? recipe.formation === 'convoy' ? 'Slipstream Formation Drill' : 'Cross-Traffic & Drafting Drill'
        : base.label;
      return {label, instruction: base.instruction + modifier[recipe.modifier]};
    }
    case 'rapids': {
      const base = rapidsRoutes[recipe.layout];
      const flow = {
        steady: {prefix: '', instruction: ''},
        pulsing: {prefix: 'Pulsing ', instruction: ' Time entry between pulses.'},
      } satisfies Record<RapidsRecipe['flow'], {prefix: string; instruction: string}>;
      const modifier = {
        none: '', eddies: ' Green eddies slow your fall.',
      } satisfies Record<RapidsRecipe['modifier'], string>;
      return {label: flow[recipe.flow].prefix + base.label,
        instruction: base.instruction + flow[recipe.flow].instruction + modifier[recipe.modifier]};
    }
    default: {
      const unsupported: never = recipe;
      throw new Error(`Unsupported safety drill: ${unsupported}`);
    }
  }
}
export function safetyDrillInstruction(recipe: SafetyDrillRecipe): string {
  return drillPresentation(recipe).instruction;
}
/** Label the implemented behavior, not just its internal family or generated noun. */
export function safetyDrillLabel(recipe: SafetyDrillRecipe): string {
  return drillPresentation(recipe).label;
}
export function encounterDurationSeconds(spec: RaceEncounter): number {
  return spec.version === 4 ? SAFETY_DRILL_LIMITS.durationSeconds : spec.effect.durationSeconds;
}
export function encounterKind(spec: RaceEncounter) {
  return spec.version === 4 ? spec.drill.family : spec.effect.type;
}
export function encounterLabel(spec: RaceEncounter): string {
  return spec.version === 4 ? safetyDrillLabel(spec.drill) : raceEventPreset(spec.effect.type).label;
}
export function encounterInstruction(spec: RaceEncounter): string {
  return spec.version === 4 ? safetyDrillInstruction(spec.drill) : spec.description;
}
