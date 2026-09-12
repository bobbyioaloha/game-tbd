import type { PlayerController, PlayerMotion, PlayerSnapshot, Position, SteeringInput, MovementModifiers } from './player-controller';

export const GRAVITY = 9.81;
export const TERMINAL_SPEED = 30;
export const BRAKE_SPEED = 8;
export const BRAKE_DECELERATION = 20;
export const STEER_SPEED = 20;

// No keyboard or world ownership. The existing demo may inject this controller.
export class FreefallController implements PlayerController {
  private state: PlayerSnapshot = {position: [0, 0, 0], fallSpeed: 0};
  constructor(private bound = Infinity, private startX = 0, private startZ = 0) { this.reset(); }
  braking = false;
  reset() { this.state = {position: [this.startX, 0, this.startZ], fallSpeed: 0}; this.braking = false; }
  setFallSpeed(speed:number){this.state.fallSpeed=Math.max(0,speed);}
  impact(multiplier: number, knockback: Position) {
    this.state.fallSpeed *= multiplier;
    this.state.position[0] = Math.max(-this.bound, Math.min(this.bound, this.state.position[0]+knockback[0]));
    this.state.position[2] = Math.max(-this.bound, Math.min(this.bound, this.state.position[2]+knockback[2]));
  }
  getSnapshot(): PlayerSnapshot { return {...this.state, position: [...this.state.position]}; }
  step(delta: number, input: SteeringInput, modifiers: MovementModifiers & {maxFallSpeed?: number;steerSpeed?:number}): PlayerMotion {
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const previousPosition = [...this.state.position] as [number, number, number];
    const multiplier = Math.max(0, Math.min(1, modifiers.fallSpeedMultiplier));
    const limit = (this.braking ? BRAKE_SPEED : (modifiers.maxFallSpeed ?? TERMINAL_SPEED)) * multiplier;
    const start = this.state.fallSpeed;
    const acceleration = start > limit ? -BRAKE_DECELERATION : GRAVITY;
    // Integrate to the speed limit, then coast for the remainder of the step.
    const rampTime = Math.min(dt, Math.abs(limit - start) / Math.abs(acceleration));
    const end = start + acceleration * rampTime;
    const distance = start * rampTime + 0.5 * acceleration * rampTime ** 2 + end * (dt - rampTime);
    const x = Math.max(-1, Math.min(1, input.x));
    const z = Math.max(-1, Math.min(1, input.z));
    const length = Math.max(1, Math.hypot(x, z));
    this.state = {
      position: [Math.max(-this.bound, Math.min(this.bound, previousPosition[0] + x / length * (modifiers.steerSpeed??STEER_SPEED) * dt)), previousPosition[1] - distance, Math.max(-this.bound, Math.min(this.bound, previousPosition[2] + z / length * (modifiers.steerSpeed??STEER_SPEED) * dt))],
      fallSpeed: end,
    };
    return {...this.getSnapshot(), previousPosition};
  }
}
