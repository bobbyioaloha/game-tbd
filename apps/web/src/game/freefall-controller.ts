import type { RacerEventInput } from '@sky/shared';
import type { PlayerController, PlayerMotion, PlayerSnapshot, Position, SteeringInput, MovementModifiers } from './player-controller';

export const GRAVITY = 9.81;
export const TERMINAL_SPEED = 30;
export const BRAKE_SPEED = 8;
export const BRAKE_DECELERATION = 20;
export const STEER_SPEED = 20;
export const BOOST_SPEED = 60;
export const BOOST_ACCELERATION = 30;
// External forces overlay existing controls; drag restores control after a field/impulse.
export const EVENT_DRAG = 0.65;
export const MAX_EXTERNAL_SPEED = 42;
const bounded = (values:Position):Position => {
  const factor=Math.min(1,MAX_EXTERNAL_SPEED/(Math.hypot(...values)||1));
  return values.map(value=>value*factor) as Position;
};

// No keyboard or world ownership. The existing demo may inject this controller.
export class FreefallController implements PlayerController {
  private state: PlayerSnapshot = {position: [0, 0, 0], fallSpeed: 0};
  constructor(private bound = Infinity, private startX = 0, private startZ = 0) { this.reset(); }
  private external:Position=[0,0,0];
  private lateralVelocity:Position=[0,0,0];
  braking = false;
  clearExternalMotion(){this.external=[0,0,0];this.lateralVelocity=[0,0,0];}
  getWorldVelocity():Position {return [this.lateralVelocity[0],-this.state.fallSpeed+this.external[1],this.lateralVelocity[2]];}
  reset() { this.state = {position: [this.startX, 0, this.startZ], fallSpeed: 0}; this.braking = false; this.clearExternalMotion(); }
  setFallSpeed(speed:number){this.state.fallSpeed=Math.max(0,speed);}
  impact(multiplier: number, knockback: Position) {
    this.state.fallSpeed *= multiplier;
    this.state.position[0] = Math.max(-this.bound, Math.min(this.bound, this.state.position[0]+knockback[0]));
    this.state.position[2] = Math.max(-this.bound, Math.min(this.bound, this.state.position[2]+knockback[2]));
  }
  getSnapshot(): PlayerSnapshot { return {...this.state, fallSpeed:Math.max(0,this.state.fallSpeed-this.external[1]), position: [...this.state.position]}; }
  step(delta: number, input: SteeringInput, modifiers: MovementModifiers & {maxFallSpeed?: number;steerSpeed?:number;boostSeconds?:number;eventInput?:RacerEventInput}): PlayerMotion {
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const previousPosition = [...this.state.position] as [number, number, number];
    const multiplier = Math.max(0, Math.min(1, modifiers.fallSpeedMultiplier));
    const normalLimit = modifiers.maxFallSpeed ?? TERMINAL_SPEED;
    const poweredTime = this.braking ? 0 : Math.min(dt, Math.max(0, modifiers.boostSeconds ?? 0));
    let end = this.state.fallSpeed, distance = 0;
    const integrate = (seconds:number, limit:number, upwardAcceleration:number) => {
      const start = end;
      const acceleration = start > limit ? -BRAKE_DECELERATION : upwardAcceleration;
      const rampTime = Math.min(seconds, Math.abs(limit - start) / Math.abs(acceleration));
      end = start + acceleration * rampTime;
      distance += start * rampTime + 0.5 * acceleration * rampTime ** 2 + end * (seconds - rampTime);
    };
    if (poweredTime > 0) integrate(poweredTime, BOOST_SPEED * multiplier, BOOST_ACCELERATION);
    if (dt > poweredTime) {
      // Race boost speed is available only for the funded portion of this step.
      // Keep ordinary braking and slow-effect deceleration below the normal cap.
      if (modifiers.boostSeconds !== undefined) end = Math.min(end, normalLimit);
      integrate(dt - poweredTime, (this.braking ? BRAKE_SPEED : normalLimit) * multiplier, GRAVITY);
    }
    const x = Math.max(-1, Math.min(1, input.x));
    const z = Math.max(-1, Math.min(1, input.z));
    const length = Math.max(1, Math.hypot(x, z));
    const acceleration=modifiers.eventInput?.acceleration??[0,0,0];
    const impulse=modifiers.eventInput?.velocityDelta??[0,0,0];
    if(![...acceleration,...impulse].every(Number.isFinite))throw new Error('Non-finite external motion.');
    const start=bounded(this.external.map((value,i)=>value+(dt>0?impulse[i]:0)) as Position);
    const decay=Math.exp(-EVENT_DRAG*dt), integral=(1-decay)/EVENT_DRAG;
    const offset=start.map((value,i)=>value*integral+acceleration[i]*(dt-integral)/EVENT_DRAG) as Position;
    this.external=bounded(start.map((value,i)=>value*decay+acceleration[i]*integral) as Position);
    // Clamp displacement as well as velocity under sustained force.
    const offsetLimit=MAX_EXTERNAL_SPEED*dt, offsetScale=Math.min(1,offsetLimit/(Math.hypot(...offset)||1));
    for(let axis=0;axis<3;axis++)offset[axis]*=offsetScale;
    this.state = {
      position: [Math.max(-this.bound, Math.min(this.bound, previousPosition[0] + x / length * (modifiers.steerSpeed??STEER_SPEED) * dt + offset[0])), previousPosition[1] - distance + offset[1], Math.max(-this.bound, Math.min(this.bound, previousPosition[2] + z / length * (modifiers.steerSpeed??STEER_SPEED) * dt + offset[2]))],
      fallSpeed: end,
    };
    for(const axis of [0,2]) {
      if(Math.abs(this.state.position[axis])>=this.bound&&Math.sign(this.external[axis])===Math.sign(this.state.position[axis]))this.external[axis]=0;
      this.lateralVelocity[axis]=dt>0?(this.state.position[axis]-previousPosition[axis])/dt:0;
    }
    return {...this.getSnapshot(), previousPosition};
  }
}
