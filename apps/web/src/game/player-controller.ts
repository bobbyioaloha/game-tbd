export type Position = [number, number, number];
export type SteeringInput = {x: number; z: number};
export type MovementModifiers = {fallSpeedMultiplier: number};
export type PlayerSnapshot = {position: Position; fallSpeed: number};
export type PlayerMotion = PlayerSnapshot & {previousPosition: Position};

// Partner-owned boundary. No React, keyboard, voice, generation, or collision code.
// Positions are world meters; +Y is up. fallSpeed is positive downward m/s.
export interface PlayerController {
  reset(): void;
  getSnapshot(): PlayerSnapshot;
  step(deltaSeconds: number, input: SteeringInput, modifiers: MovementModifiers): PlayerMotion;
}
export const BASE_FALL_SPEED = 10;
export class SimplePlayerController implements PlayerController {
  private state: PlayerSnapshot = {position: [0,0,0], fallSpeed: BASE_FALL_SPEED};
  reset() { this.state = {position: [0,0,0], fallSpeed: BASE_FALL_SPEED}; }
  getSnapshot() { return this.state; }
  step(dt: number, input: SteeringInput, modifiers: MovementModifiers): PlayerMotion {
    const previousPosition: Position = [...this.state.position];
    const axis = (value: number) => Math.max(-1, Math.min(1, value));
    const fallSpeed = BASE_FALL_SPEED * modifiers.fallSpeedMultiplier;
    const position: Position = [
      Math.max(-8, Math.min(8, previousPosition[0]+axis(input.x)*7*dt)),
      previousPosition[1]-fallSpeed*dt,
      Math.max(-4, Math.min(4, previousPosition[2]+axis(input.z)*7*dt)),
    ];
    this.state = {position, fallSpeed};
    return {...this.state, previousPosition};
  }
}
