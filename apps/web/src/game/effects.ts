import type { PowerUpEffect } from '@sky/shared';
import type { Position } from './player-controller';
import { distance } from './world-geometry';
export type Obstacle = {id: number; position: Position};
export type EffectState = {slow: {multiplier: number; remaining: number}; protectionSeconds: number};
export const initialEffects = (): EffectState => ({slow: {multiplier: 1, remaining: 0}, protectionSeconds: 0});
export type EffectWorld = {effects: EffectState; obstacles: Obstacle[]};
type HandlerMap = {[K in PowerUpEffect['type']]: (world: EffectWorld, player: Position, effect: Extract<PowerUpEffect, {type: K}>) => void};
export const effectHandlers: HandlerMap = {
  reduceFallSpeed(world, _player, effect) {
    world.effects.slow = {multiplier: effect.multiplier, remaining: effect.durationSeconds};
  },
  invulnerability(world, _player, effect) { world.effects.protectionSeconds = effect.durationSeconds; },
  clearNearbyObstacles(world, player, effect) {
    world.obstacles = world.obstacles.filter(obstacle => distance(obstacle.position, player) > effect.radiusMeters);
  },
};
export function applyEffect(world: EffectWorld, player: Position, effect: PowerUpEffect) {
  switch (effect.type) {
    case 'reduceFallSpeed': effectHandlers.reduceFallSpeed(world, player, effect); break;
    case 'invulnerability': effectHandlers.invulnerability(world, player, effect); break;
    case 'clearNearbyObstacles': effectHandlers.clearNearbyObstacles(world, player, effect); break;
  }
}
export function stepEffects(effects: EffectState, dt: number) {
  effects.slow.remaining = Math.max(0, effects.slow.remaining-dt);
  effects.protectionSeconds = Math.max(0, effects.protectionSeconds-dt);
}
