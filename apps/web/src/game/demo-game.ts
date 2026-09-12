import { COLLECTIBLE_RADIUS_METERS, type CreationClient, type CreationPickup, type VoicePickup } from '@sky/shared';
import type { VoiceTranscriber } from '../voice/types';
import { CreationLoop, type CreationSnapshot } from './creation-loop';
import { SimplePlayerController, type PlayerController, type Position, type SteeringInput } from './player-controller';
import { applyEffect, initialEffects, stepEffects, type EffectWorld } from './effects';
import { creationSpawnPosition, distance, sweptPickup } from './world-geometry';

type WorldState = EffectWorld & {voice?: VoicePickup; creation?: CreationPickup; elapsed: number};
export type GameSnapshot = WorldState & CreationSnapshot & {player: Position; fallSpeed: number};

// Integration/demo owner: world pickups, collision, effects, and frame ordering.
// Replace the injected PlayerController without touching CreationLoop.
export class DemoGame {
  readonly creations: CreationLoop;
  private world!: WorldState;
  private snapshot!: GameSnapshot;
  private listeners = new Set<() => void>();
  constructor(client: CreationClient, voice: VoiceTranscriber, readonly player: PlayerController = new SimplePlayerController()) {
    this.creations = new CreationLoop(client, voice, {
      spawnCreation: (instanceId, spec) => {
        const current = this.player.getSnapshot();
        const position = creationSpawnPosition(current.position, current.fallSpeed);
        this.world.obstacles = this.world.obstacles.filter(obstacle => distance(obstacle.position, position) > 3);
        this.world.creation = {kind: 'creation', instanceId, spec, position};
      },
      applyEffects: effects => {
        for (const effect of effects) applyEffect(this.world, this.player.getSnapshot().position, effect);
      },
    });
    this.resetWorld();
    this.creations.subscribe(this.emit);
    this.emit();
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit = () => {
    this.snapshot = {...this.world, ...this.creations.getSnapshot(), player: this.player.getSnapshot().position, fallSpeed: this.player.getSnapshot().fallSpeed};
    this.listeners.forEach(listener => listener());
  };
  private resetWorld() {
    this.player.reset();
    this.world = {
      elapsed: 0, effects: initialEffects(),
      voice: {kind: 'voice', instanceId: 'voice-'+this.creations.getSnapshot().session, position: [0,-24,0]},
      obstacles: Array.from({length: 18}, (_, i) => ({id: i, position: [i%2 ? 4 : -4, -40-i*7, 0]})),
    };
  }
  startNewRun = () => { this.creations.reset(); this.resetWorld(); this.creations.start(); this.emit(); };
  end = (message?: string) => {
    this.world.voice = undefined; this.world.creation = undefined;
    this.creations.end(message);
  };
  dispose = () => { this.creations.dispose(); };
  step(delta: number, input: SteeringInput) {
    if (!this.creations.getSnapshot().running) return;
    const dt = Math.min(Math.max(Number.isFinite(delta) ? delta : 0, 0), 0.1);
    const world = this.world;
    const motion = this.player.step(dt, input, {
      fallSpeedMultiplier: world.effects.slow.remaining > 0 ? world.effects.slow.multiplier : 1,
    });
    world.elapsed += dt;
    stepEffects(world.effects, dt);
    const touched = (position: Position) => sweptPickup(motion.previousPosition, motion.position, position, COLLECTIBLE_RADIUS_METERS);
    if (world.voice && touched(world.voice.position)) { world.voice = undefined; this.creations.collectVoice(); }
    if (world.voice && motion.position[1] < world.voice.position[1]-5) { world.voice = undefined; this.creations.missVoice(); }
    if (world.creation && touched(world.creation.position)) {
      const id = world.creation.instanceId; world.creation = undefined;
      this.creations.collectCreation(id);
    }
    if (world.creation && motion.position[1] < world.creation.position[1]-5) {
      const id = world.creation.instanceId; world.creation = undefined;
      this.creations.missCreation(id);
    }
    if (world.obstacles.some(obstacle => touched(obstacle.position)) && world.effects.protectionSeconds <= 0) {
      this.end('Obstacle hit. Start a new run.'); return;
    }
    world.obstacles = world.obstacles.filter(obstacle => obstacle.position[1] < motion.position[1]+8);
    this.creations.advanceTime(dt);
  }
}
