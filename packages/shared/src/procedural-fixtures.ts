import { fixtures } from './fixtures.js';
import type { Primitive } from './schema.js';
import { CreationDesignSchema, GeneratedCreationSchema } from './pipeline.js';
import { PrimitiveAppearanceSchema } from './creation.js';

const part = (type: Primitive['type'], position: Primitive['position'], scale: Primitive['scale'],
  color: string, rotation: Primitive['rotation'] = [0, 0, 0]): Primitive => ({type, position, scale, color, rotation});
function fixture(id: string, prompt: string, design: unknown, primitives: Primitive[]) {
  const validatedDesign = CreationDesignSchema.parse(design);
  const appearance = PrimitiveAppearanceSchema.parse({type: 'primitives', primitives});
  const spec = GeneratedCreationSchema.parse({
    version: 2, id, displayName: validatedDesign.displayName, description: validatedDesign.description,
    appearance, effects: [validatedDesign.effect],
  });
  return {prompt, design: validatedDesign, appearance, spec};
}

export const proceduralFixtures = [
  fixture('procedural-duck', 'giant rubber duck', {
    displayName: 'Rubber duck', description: 'Float through the sky with slower descent for eight seconds.',
    visualBrief: 'A yellow rubber duck: plump ellipsoid body, smaller round head, broad orange beak pointing forward along +Z, two black eyes, and a raised tail.',
    effect: {type: 'reduceFallSpeed', multiplier: 0.5, durationSeconds: 8},
  }, [
    part('sphere', [0, -0.35, 0], [2.1, 1.5, 2.3], '#ffcc32'),
    part('sphere', [0, 0.65, 0.6], [1.3, 1.3, 1.3], '#ffdc43'),
    part('sphere', [0, 0.42, 1.22], [0.95, 0.28, 0.85], '#ff822d'),
    part('sphere', [-0.39, 0.88, 1.05], [0.16, 0.22, 0.16], '#17202b'),
    part('sphere', [0.39, 0.88, 1.05], [0.16, 0.22, 0.16], '#17202b'),
    part('cone', [0, 0.02, -0.96], [0.9, 1, 0.7], '#ffcc32', [-0.65, 0, 0]),
    part('sphere', [-0.93, -0.3, -0.1], [0.24, 0.72, 1.15], '#e8ab23'),
    part('sphere', [0.93, -0.3, -0.1], [0.24, 0.72, 1.15], '#e8ab23'),
  ]),
  fixture('procedural-toaster', 'evil spinning toaster', {
    displayName: 'Evil toaster', description: 'Clear nearby obstacles in a twelve-meter burst.',
    visualBrief: 'An evil toaster with a squat silver box body, two long dark slots on top, red slanted eyes on its +Z face, dark feet, and a black lever on its right side.',
    effect: {type: 'clearNearbyObstacles', radiusMeters: 12},
  }, [
    part('box', [0, 0, 0], [2.2, 1.55, 1.3], '#a6b4c7'),
    part('box', [0, 0.79, -0.28], [1.65, 0.06, 0.18], '#17202b'),
    part('box', [0, 0.79, 0.28], [1.65, 0.06, 0.18], '#17202b'),
    part('box', [-0.5, 0.25, 0.68], [0.55, 0.16, 0.08], '#ff433f', [0, 0, -0.3]),
    part('box', [0.5, 0.25, 0.68], [0.55, 0.16, 0.08], '#ff433f', [0, 0, 0.3]),
    part('box', [0, -0.3, 0.68], [0.75, 0.09, 0.08], '#17202b'),
    part('box', [1.19, 0.05, 0], [0.28, 0.18, 0.48], '#17202b'),
    part('box', [-0.72, -0.87, 0], [0.4, 0.25, 0.95], '#253442'),
    part('box', [0.72, -0.87, 0], [0.4, 0.25, 0.95], '#253442'),
  ]),
  fixture('procedural-shield', 'spiky pink shield', {
    displayName: 'Spiky pink shield', description: 'Ignore obstacle damage for six seconds.',
    visualBrief: 'A pink spiky shield: a flattened round pink central disc facing +Z, eight evenly spaced pale pink cone spikes pointing outward around its rim, and a small bright center.',
    effect: {type: 'invulnerability', durationSeconds: 6},
  }, [
    part('sphere', [0, 0, 0], [2.2, 2.2, 0.65], '#ec579e'),
    part('sphere', [0, 0, 0.3], [0.65, 0.65, 0.3], '#ffe3f2'),
    ...Array.from({length: 8}, (_, i) => {
      const angle = i * Math.PI / 4;
      const rotation = ((angle + Math.PI) % (2 * Math.PI)) - Math.PI;
      return part('cone', [-Math.sin(angle) * 1.25, Math.cos(angle) * 1.25, 0],
        [0.45, 0.9, 0.45], '#ffb6dc', [0, 0, rotation]);
    }),
  ]),

  ...fixtures.map((spec, index) => fixture('procedural-'+spec.id,
    ['jellyfish umbrella', 'ghost cloak', 'angry sun'][index], {
      displayName: spec.displayName, description: spec.description, effect: spec.effects[0],
      visualBrief: [
        'A jellyfish umbrella with a wide purple dome, slender central handle and four long cyan tentacles.',
        'A pale blue ghost cloak with a tapered sheet body, round head and two dark oval eyes on its front.',
        'An angry orange sun with a round yellow body, eight orange cone rays, dark slanted eyebrows and a frown.',
      ][index],
    }, spec.appearance.primitives)),
  fixture('procedural-hammer', 'huge crystal hammer', {
    displayName: 'Crystal hammer', description: 'Clear obstacles within fourteen meters.',
    visualBrief: 'A huge crystal hammer with a tall dark purple handle and a wide cyan box head capped with pointed blue crystals at each end.',
    effect: {type: 'clearNearbyObstacles', radiusMeters: 14},
  }, [
    part('cylinder', [0,-0.5,0], [0.25,2,0.25], '#6d448a'),
    part('box', [0,0.7,0], [2.2,0.8,0.8], '#69dbf5'),
    part('cone', [-1.35,0.7,0], [0.85,0.55,0.85], '#438ccc', [0,0,Math.PI/2]),
    part('cone', [1.35,0.7,0], [0.85,0.55,0.85], '#438ccc', [0,0,-Math.PI/2]),
    part('cylinder', [0,-1.45,0], [0.45,0.2,0.45], '#d7a8ff'),
  ]),
  fixture('procedural-pins', 'three angry bowling pins', {
    displayName: 'Angry bowling pins', description: 'Clear obstacles within ten meters.',
    visualBrief: 'Three angry bowling pins standing side by side, each with a white bulbous body, narrow neck, round head, red neck band and dark slanted eyebrows.',
    effect: {type: 'clearNearbyObstacles', radiusMeters: 10},
  }, [-0.95,0,0.95].flatMap(x => [
    part('sphere', [x,-0.4,0], [0.8,1.3,0.8], '#f4f1e9'),
    part('cylinder', [x,0.25,0], [0.32,0.7,0.32], '#f4f1e9'),
    part('sphere', [x,0.7,0], [0.55,0.55,0.55], '#f4f1e9'),
    part('cylinder', [x,0.4,0], [0.34,0.16,0.34], '#e3434b'),
    part('box', [x-0.12,0.75,0.25], [0.17,0.06,0.07], '#302738', [0,0,-0.3]),
    part('box', [x+0.12,0.75,0.25], [0.17,0.06,0.07], '#302738', [0,0,0.3]),
  ])),
  fixture('procedural-rocket', 'red rocket with fins', {
    displayName: 'Red rocket', description: 'Clear a twelve-meter path through nearby obstacles.',
    visualBrief: 'A red rocket pointing upward with a cylindrical body, pointed red nose, four white fins around its lower body, a blue circular window on the front and an orange exhaust flame.',
    effect: {type: 'clearNearbyObstacles', radiusMeters: 12},
  }, [
    part('cylinder', [0,0,0], [0.95,1.7,0.95], '#e84043'),
    part('cone', [0,1.15,0], [0.95,0.6,0.95], '#ff5d52'),
    part('sphere', [0,0.3,0.46], [0.5,0.5,0.12], '#e7f3ff'),
    part('sphere', [0,0.3,0.53], [0.35,0.35,0.08], '#398cdc'),
    part('box', [-0.6,-0.55,0], [0.55,0.75,0.16], '#e7f3ff', [0,0,-0.25]),
    part('box', [0.6,-0.55,0], [0.55,0.75,0.16], '#e7f3ff', [0,0,0.25]),
    part('box', [0,-0.55,-0.6], [0.16,0.75,0.55], '#e7f3ff', [-0.25,0,0]),
    part('box', [0,-0.55,0.6], [0.16,0.75,0.55], '#e7f3ff', [0.25,0,0]),
    part('cone', [0,-1.2,0], [0.65,0.85,0.65], '#ff9c31', [Math.PI,0,0]),
  ]),
  fixture('procedural-mushroom', 'purple mushroom hat', {
    displayName: 'Mushroom hat', description: 'Float down at half speed for eight seconds.',
    visualBrief: 'A purple mushroom hat with a broad flattened purple cap covered in pale round spots and a short cream-colored stalk.',
    effect: {type: 'reduceFallSpeed', multiplier: 0.5, durationSeconds: 8},
  }, [
    part('sphere', [0,0.4,0], [2.8,1.1,2.6], '#9f5ed4'),
    part('cylinder', [0,-0.5,0], [0.55,1.2,0.55], '#efdcba'),
    part('sphere', [-0.65,0.8,0.2], [0.45,0.13,0.45], '#f2ccff'),
    part('sphere', [0.55,0.77,0.35], [0.55,0.13,0.5], '#f2ccff'),
    part('sphere', [0.1,0.92,-0.4], [0.38,0.12,0.38], '#f2ccff'),
  ]),
  fixture('procedural-fish', 'striped flying fish', {
    displayName: 'Flying fish', description: 'Glide with slower descent for seven seconds.',
    visualBrief: 'A striped flying fish with a long orange body, three dark bands, wide yellow side fins, a forked tail and two black eyes near its front.',
    effect: {type: 'reduceFallSpeed', multiplier: 0.55, durationSeconds: 7},
  }, [
    part('sphere', [0,0,0], [1.1,1.05,2.3], '#ff923d'),
    ...[-0.6,-0.15,0.3].map(z => part('sphere', [0,0,z], [1.12,1.07,0.1], '#3d4966')),
    part('sphere', [-0.3,0.23,0.98], [0.15,0.2,0.12], '#17202b'),
    part('sphere', [0.3,0.23,0.98], [0.15,0.2,0.12], '#17202b'),
    part('sphere', [-0.88,-0.1,-0.1], [1.2,0.12,1.1], '#ffdb68', [0,-0.35,0]),
    part('sphere', [0.88,-0.1,-0.1], [1.2,0.12,1.1], '#ffdb68', [0,0.35,0]),
    part('cone', [-0.3,0,-1.15], [0.65,0.95,0.15], '#ffdb68', [0,0,0.9]),
    part('cone', [0.3,0,-1.15], [0.65,0.95,0.15], '#ffdb68', [0,0,-0.9]),
  ]),
  fixture('procedural-cactus', 'green cactus balloon', {
    displayName: 'Cactus balloon', description: 'Slow your descent for nine seconds.',
    visualBrief: 'A green cactus balloon with a rounded upright body, two raised branching arms, small pale spikes and a thin dangling string.',
    effect: {type: 'reduceFallSpeed', multiplier: 0.5, durationSeconds: 9},
  }, [
    part('sphere', [0,0.3,0], [0.9,1.9,0.8], '#55b984'),
    part('cylinder', [-0.6,0,0], [0.35,0.9,0.35], '#55b984', [0,0,Math.PI/2]),
    part('sphere', [-0.95,0.35,0], [0.4,1.1,0.4], '#55b984'),
    part('cylinder', [0.6,-0.2,0], [0.35,0.9,0.35], '#55b984', [0,0,Math.PI/2]),
    part('sphere', [0.95,0.15,0], [0.4,1.1,0.4], '#55b984'),
    ...[-0.1,0.35,0.8].map(y => part('cone', [0,y,0.42], [0.12,0.3,0.12], '#fff0c5', [Math.PI/2,0,0])),
    part('cylinder', [0,-1.1,0], [0.05,1,0.05], '#e6d5c3'),
  ]),
];
// Mock selection is explicit. Unknown ideas must never silently become a duck.
const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/gu, ' ');
export function mockProceduralForText(text: string) {
  const input = normalize(text);
  return proceduralFixtures.find(fixture => [fixture.prompt, fixture.design.displayName, fixture.design.visualBrief]
    .some(value => normalize(value) === input));
}
// Keep the selector in sync with the actual supported mock catalog.
export const generationEvaluationPrompts = proceduralFixtures.map(fixture => fixture.prompt);
