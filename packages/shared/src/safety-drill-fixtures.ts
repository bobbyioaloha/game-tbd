import type { Primitive } from './schema.js';
import type { PrimitiveAppearance } from './creation.js';
import { proceduralFixtures } from './procedural-fixtures.js';
import { raceEventFixtures } from './race-event-fixtures.js';
import { SafetyDrillDesignSchema, SafetyDrillSpecSchema, safetyDrillInstruction, type SafetyDrillRecipe } from './safety-drills.js';

const part = (type: Primitive['type'], position: Primitive['position'], scale: Primitive['scale'], color: string): Primitive =>
  ({type, position, scale, color, rotation: [0, 0, 0]});
const hippoAppearance: PrimitiveAppearance = {type: 'primitives', primitives: [
  part('sphere', [0, 0, 0], [1.9, 1.4, 2.3], '#a79ab9'),
  part('sphere', [0, 0.25, 0.95], [1.55, 1.15, 1.35], '#b4a4c6'),
  part('sphere', [0, 0.02, 1.65], [1.4, 0.6, 0.6], '#d4bdcd'),
  ...[-0.5, 0.5].flatMap(x => [
    part('sphere', [x, 0.9, 0.83], [0.38, 0.45, 0.35], '#a79ab9'),
    part('sphere', [x, 0.58, 1.42], [0.17, 0.17, 0.12], '#192834'),
    ...[-0.65, 0.65].map(z => part('cylinder', [x, -0.7, z], [0.42, 0.6, 0.42], '#8b7c9f')),
  ]),
]};
const hippoBrief = 'A chunky lavender hippopotamus with a wide barrel body, broad pink muzzle, four short legs, two round ears and small dark eyes.';
const jellyfish = raceEventFixtures.find(item => item.spec.effect.type === 'protectiveZone')!;
const duck = proceduralFixtures.find(item => item.prompt === 'giant rubber duck')!;
const rocket = proceduralFixtures.find(item => item.prompt === 'red rocket with fins')!;
const fish = proceduralFixtures.find(item => item.prompt === 'striped flying fish')!;
const appearances = [
  {name: 'Hippos', matches: /\bhippos?\b/i, brief: hippoBrief, appearance: hippoAppearance},
  {name: 'Jellyfish', matches: /\bjellyfish\b/i, brief: jellyfish.design.visualBrief, appearance: jellyfish.spec.appearance},
  {name: 'Rubber Ducks', matches: /\bducks?\b/i, brief: duck.design.visualBrief, appearance: duck.appearance},
  {name: 'Rockets', matches: /\brockets?\b/i, brief: rocket.design.visualBrief, appearance: rocket.appearance},
  {name: 'Flying Fish', matches: /\bfish\b/i, brief: fish.design.visualBrief, appearance: fish.appearance},
];
function fixture(id: string, prompt: string, name: string, drill: SafetyDrillRecipe, visual = appearances[0]) {
  const design = SafetyDrillDesignSchema.parse({displayName: name, visualBrief: visual.brief, drill});
  const spec = SafetyDrillSpecSchema.parse({version: 4, id, displayName: name,
    description: safetyDrillInstruction(drill), appearance: visual.appearance, drill});
  return {prompt, design, spec};
}
export const safetyDrillFixtures = [
  fixture('drill-angry-hippos', 'angry hippos charge when approached', 'Angry Hippos',
    {family: 'stampede', formation: 'line', direction: 'alternating', reaction: 'charge', modifier: 'none'}),
  fixture('drill-nervous-hippos', 'nervous hippos scatter when approached', 'Nervous Hippos',
    {family: 'stampede', formation: 'split', direction: 'alternating', reaction: 'scatter', modifier: 'none'}),
  fixture('drill-sleepy-hippos', 'sleepy hippos drifting together', 'Sleepy Hippos',
    {family: 'stampede', formation: 'convoy', direction: 'right', reaction: 'steady', modifier: 'draft'}),
  fixture('drill-jellyfish-forks', 'jellyfish river with dangerous shortcuts', 'Jellyfish River',
    {family: 'rapids', layout: 'forked', flow: 'steady', modifier: 'eddies'}, appearances[1]),
  fixture('drill-duck-rapids', 'rubber ducks in pulsing winding rapids', 'Rubber Duck Rapids',
    {family: 'rapids', layout: 'winding', flow: 'pulsing', modifier: 'none'}, appearances[2]),
  fixture('drill-rocket-herd', 'red rockets crossing from the left', 'Crossing Rockets',
    {family: 'stampede', formation: 'line', direction: 'left', reaction: 'steady', modifier: 'none'}, appearances[3]),
];
const normalize = (text: string) => text.trim().toLowerCase().replace(/[.!?]+$/u, '').replace(/\s+/gu, ' ');
/** Free deterministic examples, deliberately not a substitute for live language understanding. */
export function mockSafetyDrillForText(text: string) {
  const input = normalize(text);
  const exact = safetyDrillFixtures.find(item => [item.prompt, item.design.displayName].some(value => normalize(value) === input));
  if (exact) return exact;
  const visual = appearances.find(item => normalize(item.brief) === input || item.matches.test(input));
  if (!visual) return undefined;
  const explicitReaction = /\bscatter(?:s|ing)?\b/u.test(input) ? 'scatter'
    : /\bcharg(?:e|es|ing)\b/u.test(input) ? 'charge'
    : /\b(convoy|drift(?:s|ing)?|steady|follow)\b/u.test(input) ? 'steady' : undefined;
  const isRapids = /\b(river|rapids|current|stream|water)\b/u.test(input) || (!explicitReaction && /\bjellyfish\b/u.test(input));
  let drill: SafetyDrillRecipe;
  if (isRapids) {
    drill = {family: 'rapids', layout: /fork|split|shortcut/u.test(input) ? 'forked' : /alternat/u.test(input) ? 'alternating' : 'winding',
      flow: /puls|breath|surge/u.test(input) ? 'pulsing' : 'steady', modifier: /edd|calm|rest|safe|shortcut/u.test(input) ? 'eddies' : 'none'};
  } else {
    const reaction = explicitReaction ?? (/nervous|timid|shy/u.test(input) ? 'scatter' : /angry|rage/u.test(input) ? 'charge' : 'steady');
    const convoy = reaction === 'steady' && /sleep|convoy|drift|follow/u.test(input);
    drill = {family: 'stampede', formation: /split|scatter|nervous/u.test(input) ? 'split' : 'line',
      direction: /left/u.test(input) ? 'left' : /right/u.test(input) || convoy ? 'right' : 'alternating', reaction,
      modifier: convoy || /draft|wake/u.test(input) ? 'draft' : 'none'};
    if (convoy) drill = {...drill, formation: 'convoy', reaction: 'steady'};
  }
  return fixture('mock-drill-'+visual.name.toLowerCase().replace(/ /gu, '-'), text, visual.name, drill, visual);
}
