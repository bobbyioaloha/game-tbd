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
const avocadoAppearance: PrimitiveAppearance = {type: 'primitives', primitives: [
  part('sphere', [0, 0, 0], [1.9, 2.5, 1.2], '#365f28'),
  part('sphere', [0, 0.08, 0.32], [1.64, 2.2, 0.76], '#aaca56'),
  part('sphere', [0, -0.38, 0.72], [0.86, 0.94, 0.5], '#985630'),
  ...[-0.36, 0.36].map(x => part('sphere', [x, 0.63, 0.76], [0.15, 0.2, 0.12], '#172827')),
  part('box', [0, 0.34, 0.8], [0.43, 0.09, 0.1], '#172827'),
]};
const staplerAppearance: PrimitiveAppearance = {type: 'primitives', primitives: [
  part('box', [0, -0.5, 0], [1.1, 0.28, 2.7], '#cf394d'),
  part('box', [0, 0.3, -0.1], [1.2, 0.6, 2.5], '#e75465'),
  part('cylinder', [0, -0.08, -1], [0.85, 0.8, 0.65], '#667785'),
  part('box', [0, -0.26, 0.65], [0.7, 0.12, 1.08], '#d2e0e5'),
  part('box', [0, -0.12, 1.04], [0.62, 0.24, 0.24], '#85979e'),
  ...[-0.25, 0.25].map(x => part('sphere', [x, 0.36, 1.18], [0.15, 0.17, 0.12], '#182731')),
]};
const planetAppearance: PrimitiveAppearance = {type: 'primitives', primitives: [
  part('sphere', [0, 0, 0], [1.8, 1.8, 1.8], '#c785ee'),
  ...Array.from({length: 10}, (_, index) => {
    const angle = index * Math.PI / 5;
    return part('sphere', [Math.cos(angle) * 1.42, Math.sin(angle) * 0.24, Math.sin(angle) * 1.42], [0.62, 0.13, 0.62], '#f4ce70');
  }),
  ...[-0.32, 0.32].map(x => part('sphere', [x, 0.2, 0.85], [0.17, 0.22, 0.12], '#352e66')),
]};
const copierAppearance: PrimitiveAppearance = {type: 'primitives', primitives: [
  part('box', [0, -0.14, 0], [2.15, 1.9, 1.6], '#9aabbb'),
  part('box', [0, 0.96, -0.08], [2.3, 0.26, 1.75], '#455d71'),
  part('box', [0.98, 0.4, 0.7], [0.65, 0.5, 0.64], '#355169'),
  part('box', [1.01, 0.66, 0.76], [0.35, 0.06, 0.34], '#6cf1c2'),
  part('box', [-1.23, 0.38, 0], [0.63, 0.1, 1.12], '#edf0e5'),
  part('box', [0, -0.6, 0.84], [1.62, 0.14, 0.1], '#293e51'),
  ...[-0.45, 0.45].map(x => part('sphere', [x, 0.23, 0.82], [0.26, 0.32, 0.12], '#c0ffe9')),
]};
const gooseAppearance: PrimitiveAppearance = {type: 'primitives', primitives: [
  part('sphere', [0, -0.22, 0], [1.45, 1.4, 2.1], '#f1f0df'),
  part('cylinder', [0, 0.64, 0.64], [0.46, 1.8, 0.46], '#f7f6e9'),
  part('sphere', [0, 1.55, 0.72], [0.83, 0.78, 0.86], '#f1f0df'),
  part('cone', [0, 1.47, 1.28], [0.36, 0.64, 0.5], '#eda42d'),
  ...[-0.32, 0.32].flatMap(x => [
    part('sphere', [x, 1.69, 0.97], [0.12, 0.16, 0.1], '#242e31'),
    part('box', [x, -1.04, 0.16], [0.44, 0.13, 0.75], '#eda42d'),
  ]),
  ...[-0.67, 0.67].map(x => part('sphere', [x, -0.18, -0.16], [0.34, 0.9, 1.45], '#d3d8d1')),
]};
const appearances = [
  {name: 'Hippos', matches: /\bhippos?\b/i, brief: hippoBrief, appearance: hippoAppearance},
  {name: 'Jellyfish', matches: /\bjellyfish\b/i, brief: jellyfish.design.visualBrief, appearance: jellyfish.spec.appearance},
  {name: 'Rubber Ducks', matches: /\bducks?\b/i, brief: duck.design.visualBrief, appearance: duck.appearance},
  {name: 'Rockets', matches: /\brockets?\b/i, brief: rocket.design.visualBrief, appearance: rocket.appearance},
  {name: 'Flying Fish', matches: /\bfish\b/i, brief: fish.design.visualBrief, appearance: fish.appearance},
  {name: 'Avocado', matches: /\bavocados?\b/i, brief: 'A halved avocado with dark green pear-shaped skin, light yellow-green flesh, a large round brown pit, two small eyes and a tiny mouth.', appearance: avocadoAppearance},
  {name: 'Stapler', matches: /\bstaplers?\b/i, brief: 'A red desktop stapler with a long rounded rectangular top, flat base, silver jaw, chunky back hinge and two eyes on the front.', appearance: staplerAppearance},
  {name: 'Planet', matches: /\bplanets?\b/i, brief: 'A lavender spherical planet with a broad tilted golden ring and two wide dark eyes on its front.', appearance: planetAppearance},
  {name: 'Photocopier', matches: /\b(photocopiers?|copiers?)\b/i, brief: 'A boxy gray photocopier with a dark scanner lid, bright mint control screen, white paper tray and two pale glowing eyes on the front.', appearance: copierAppearance},
  {name: 'Goose', matches: /\b(goose|geese)\b/i, brief: 'A white goose with a plump body, long upright neck, small head, orange beak and flat feet, gray folded wings and suspicious dark eyes.', appearance: gooseAppearance},
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
  fixture('drill-bouncy-avocado', 'an aggressively bouncy rubber avocado', 'Bouncy Avocado',
    {family: 'pinball', layout: 'staggered', bounce: 'springy'}, appearances[5]),
  fixture('drill-clingy-stapler', 'a clingy emotional support stapler', 'Clingy Stapler',
    {family: 'buddy', pairing: 'nearest', tether: 'elastic'}, appearances[6]),
  fixture('drill-attention-planet', 'a planet desperate for attention', 'Attention-Seeking Planet',
    {family: 'orbit', direction: 'clockwise', pull: 'clingy'}, appearances[7]),
  fixture('drill-haunted-copier', 'a haunted photocopier making terrible copies', 'Haunted Photocopier',
    {family: 'reconstruction', pattern: 'trail', cadence: 'steady'}, appearances[8]),
  fixture('drill-suspicious-goose', 'a suspicious goose inspecting everyone', 'Suspicious Goose',
    {family: 'observation', scan: 'sweep', temperament: 'strict'}, appearances[9]),
];
const normalize = (text: string) => text.trim().toLowerCase().replace(/[.!?]+$/u, '').replace(/\s+/gu, ' ');
/** Free deterministic examples, deliberately not a substitute for live language understanding. */
export function mockSafetyDrillForText(text: string) {
  const input = normalize(text);
  const exact = safetyDrillFixtures.find(item => [item.prompt, item.design.displayName].some(value => normalize(value) === input));
  if (exact) return exact;
  const visual = appearances.find(item => normalize(item.brief) === input || item.matches.test(input));
  if (!visual) return undefined;
  // Explicit verbs beat inferred traits, even when the appearance belongs to another family.
  const explicit: Array<[RegExp, SafetyDrillRecipe['family']]> = [
    [/\b(bounc(?:e|es|ing)|ricochet(?:s|ing)?|pinball)\b/u, 'pinball'],
    [/\b(tether(?:s|ing)?|buddy|pair(?:s|ing)?|connect(?:s|ing)?|link(?:s|ing)?)\b/u, 'buddy'],
    [/\b(orbit(?:s|ing)?|slingshot(?:s|ting)?|gravity)\b/u, 'orbit'],
    [/\b(replay(?:s|ing)?|reconstruct(?:s|ing)?|mirror(?:s|ing)?|copy(?:ing)?|copies|duplicate(?:s|ing)?)\b/u, 'reconstruction'],
    [/\b(inspect(?:s|ing)?|watch(?:es|ing)?|observ(?:e|es|ing)|scan(?:s|ning)?)\b/u, 'observation'],
    [/\b(scatter(?:s|ing)?|charg(?:e|es|ing)|convoy|drift(?:s|ing)?|follow(?:s|ing)?)\b/u, 'stampede'],
    [/\b(river|rapids|current|stream|water|flow(?:s|ing)?|slid(?:e|es|ing))\b/u, 'rapids'],
  ];
  const family = explicit.find(([pattern]) => pattern.test(input))?.[1]
    ?? (/bouncy|springy|rubber avocado/u.test(input) ? 'pinball'
      : /planet|attention.seeking/u.test(input) ? 'orbit'
      : /clingy|emotional support|buddy|stapler/u.test(input) ? 'buddy'
      : /photocopier|copier/u.test(input) ? 'reconstruction'
      : /suspicious|watchful|goose|geese/u.test(input) ? 'observation'
      : /jellyfish|aquatic|slippery|gliding/u.test(input) ? 'rapids'
      : /avocado/u.test(input) ? 'pinball' : 'stampede');
  let drill: SafetyDrillRecipe;
  switch (family) {
    case 'pinball':
      drill = {family, layout: /funnel|narrow/u.test(input) ? 'funnel' : 'staggered',
        bounce: /ricochet|reflect/u.test(input) ? 'ricochet' : 'springy'};
      break;
    case 'buddy':
      drill = {family, pairing: /across|crossfield|distant/u.test(input) ? 'crossfield' : 'nearest',
        tether: /puls|rhythm/u.test(input) ? 'pulsing' : 'elastic'};
      break;
    case 'orbit':
      drill = {family, direction: /counterclockwise|anticlockwise/u.test(input) ? 'counterclockwise' : 'clockwise',
        pull: /gentle|loose|calm/u.test(input) ? 'gentle' : 'clingy'};
      break;
    case 'reconstruction':
      drill = {family, pattern: /mirror/u.test(input) ? 'mirror' : 'trail',
        cadence: /burst|batch/u.test(input) ? 'bursts' : 'steady'};
      break;
    case 'observation':
      drill = {family, scan: /alternat/u.test(input) ? 'alternating' : 'sweep',
        temperament: /patient|sleepy|gentle|friendly/u.test(input) ? 'patient' : 'strict'};
      break;
    case 'rapids':
      drill = {family, layout: /fork|split|shortcut/u.test(input) ? 'forked' : /alternat/u.test(input) ? 'alternating' : 'winding',
        flow: /puls|breath|surge/u.test(input) ? 'pulsing' : 'steady', modifier: /edd|calm|rest|safe|shortcut/u.test(input) ? 'eddies' : 'none'};
      break;
    case 'stampede': {
      const explicitReaction = /\bscatter(?:s|ing)?\b/u.test(input) ? 'scatter'
        : /\bcharg(?:e|es|ing)\b/u.test(input) ? 'charge'
        : /\b(convoy|drift(?:s|ing)?|steady|follow(?:s|ing)?)\b/u.test(input) ? 'steady' : undefined;
      const reaction = explicitReaction ?? (/nervous|timid|shy/u.test(input) ? 'scatter' : /angry|rage/u.test(input) ? 'charge' : 'steady');
      const convoy = reaction === 'steady' && /sleep|convoy|drift|follow/u.test(input);
      drill = {family, formation: /split|scatter|nervous/u.test(input) ? 'split' : 'line',
        direction: /left/u.test(input) ? 'left' : /right/u.test(input) || convoy ? 'right' : 'alternating', reaction,
        modifier: convoy || /draft|wake/u.test(input) ? 'draft' : 'none'};
      if (convoy) drill = {...drill, formation: 'convoy', reaction: 'steady'};
      break;
    }
    default: {const unsupported: never = family; throw new Error(`Unsupported mock drill: ${unsupported}`);}
  }
  return fixture('mock-drill-'+visual.name.toLowerCase().replace(/ /gu, '-'), text, visual.name, drill, visual);
}
