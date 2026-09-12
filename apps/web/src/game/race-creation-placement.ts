import { FINISH_DEPTH } from './practice-race';
import type { Position } from './player-controller';

// Main-race placement stays separate from the creation demo's short lead time.
export function raceCreationSpawnPosition(player:Position):Position {
  const depth=Math.min(FINISH_DEPTH-60,Math.max(FINISH_DEPTH*0.6,-player[1]+300));
  if(depth+player[1]<30)throw new Error('The finish is too close to spawn a reachable creation.');
  return [player[0],-depth,player[2]];
}

