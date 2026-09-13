import { RECORDING_LIMIT_MS, TRANSCRIPTION_DEADLINE_MS, PIPELINE_DEADLINE_MS } from '@sky/shared';
import { FINISH_DEPTH } from './practice-race';
import { TERMINAL_SPEED } from './freefall-controller';
import type { Position } from './player-controller';

// Game-authored presentation and contact bounds. Generated geometry never sets these.
export const RACE_CREATION_PICKUP_RADIUS = 10;
export const RACE_CREATION_MODEL_DIAMETER = 12;

// Legacy v2 placement remains compatible with the creation demo.
export function raceCreationSpawnPosition(player:Position):Position {
  const depth=Math.min(FINISH_DEPTH-60,Math.max(FINISH_DEPTH*0.6,-player[1]+300));
  if(depth+player[1]<30)throw new Error('The finish is too close to spawn a reachable creation.');
  return [player[0],-depth,player[2]];
}

export const RACE_VOICE_ATTEMPTS = 2;
export const VOICE_STAR_LEAD_METERS = 120;
export const VOICE_STAR_DELAY_SECONDS = 4;
export const CREATION_REVEAL_DELAY_SECONDS = 2;
const APPROACH_SECONDS = 8;
const MAX_EFFECT_SECONDS = 10;
const FINISH_MARGIN_SECONDS = 2;

// Braking must not make a near-finish request look affordable. Boosts may still
// shorten a run after admission, so placement rechecks the available distance.
export function raceCreationTimeRemaining(position: Position, fallSpeed: number): number {
  return Math.max(0, FINISH_DEPTH + position[1]) / Math.max(TERMINAL_SPEED, fallSpeed);
}

export function raceVoiceTimeRequired(stage: 'star' | 'recording' | 'submission'): number {
  const capture = stage === 'submission' ? 0 : RECORDING_LIMIT_MS / 1000;
  const invitation = stage === 'star' ? VOICE_STAR_LEAD_METERS / TERMINAL_SPEED + 10 : 0;
  return invitation + capture + (TRANSCRIPTION_DEADLINE_MS + PIPELINE_DEADLINE_MS) / 1000 + CREATION_REVEAL_DELAY_SECONDS + APPROACH_SECONDS + MAX_EFFECT_SECONDS + FINISH_MARGIN_SECONDS;
}

/** V3 encounters follow the player, with time left to collect and play the effect. */
export function raceEventSpawnPosition(player: Position, fallSpeed: number, durationSeconds: number): Position {
  const speed = Math.max(TERMINAL_SPEED, fallSpeed);
  const depth = Math.min(FINISH_DEPTH - speed * (durationSeconds + FINISH_MARGIN_SECONDS), -player[1] + speed * APPROACH_SECONDS);
  if (depth + player[1] < speed * 3) throw new Error('The finish is too close to place and play this creation.');
  return [player[0], -depth, player[2]];
}
