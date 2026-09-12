import type { Position } from './player-controller';
export const distance = (a: Position, b: Position) => Math.hypot(...a.map((value, axis) => value-b[axis]));
export function creationSpawnPosition(player: Position, speed: number): Position {
  return [player[0], player[1]-Math.max(18, Math.abs(speed)*3), player[2]];
}
// Swept point/sphere collision accounts for lateral and vertical movement.
export function sweptPickup(from: Position, to: Position, center: Position, radius: number): boolean {
  const direction = to.map((value, axis) => value-from[axis]);
  const lengthSquared = direction.reduce((sum, value) => sum+value*value, 0);
  const projection = lengthSquared === 0 ? 0 : center.reduce((sum, value, axis) => sum+(value-from[axis])*direction[axis], 0)/lengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  const closest: Position = [from[0]+direction[0]*t, from[1]+direction[1]*t, from[2]+direction[2]*t];
  return distance(closest, center) <= radius;
}
