import { CreationSpecSchema, adaptPowerUpV1 } from './creation.js';
import { fixtures } from './fixtures.js';

export const meshFixture = CreationSpecSchema.parse({
  version: 2,
  id: 'wind-crystal',
  displayName: 'Wind crystal',
  description: 'A pocket of still air. Fall at half speed for eight seconds.',
  appearance: {
    type: 'mesh',
    vertices: [[0,1.6,0], [1,0,0], [0,0,0.8], [-1,0,0], [0,0,-0.8], [0,-1.6,0]],
    triangles: [[0,2,1],[0,3,2],[0,4,3],[0,1,4],[5,1,2],[5,2,3],[5,3,4],[5,4,1]],
    faceColors: ['#9cf5ea','#72cfeb','#b6acf7','#a8e7ff','#59a9d9','#7bb8ed','#8c83d8','#72d9d0'],
  },
  effects: [{type: 'reduceFallSpeed', multiplier: 0.5, durationSeconds: 8}],
});
export const creationFixtures = [meshFixture, ...fixtures.map(adaptPowerUpV1)];
export function mockCreationForText(text: string) {
  return creationFixtures[text.includes('ghost') ? 2 : /sun|angry|clear/.test(text) ? 3 : /jelly|umbrella/.test(text) ? 1 : 0];
}
