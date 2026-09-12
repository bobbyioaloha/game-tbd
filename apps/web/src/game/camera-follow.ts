// Continuous, frame-rate-independent follow: a small trail while steering,
// with roughly 90% of the remaining gap closed in 0.23 seconds after stopping.
export function followCameraAxis(current:number,target:number,seconds:number):number {
  return target+(current-target)*Math.exp(-10*Math.max(0,seconds));
}
