import { Euler, Quaternion, Vector3 } from 'three';
import type { Position } from './player-controller';

export type Item = 'umbrella' | 'cloak' | 'sun';
export const ITEM_NAMES: Record<Item,string> = {umbrella:'Jellyfish umbrella',cloak:'Ghost cloak',sun:'Angry sun'};
export type ObstacleKind = 'balloon'|'fridge'|'satellite'|'sofa';
export type Collider = {center:Position; size:Position; sphere?:number; penalty:number};
export type Obstacle = {id:number;kind:ObstacleKind;position:Position;rotation:Position;active:boolean;hitAt:number};
export const OBSTACLE_RULES: Record<ObstacleKind,{heft:string;flail:number;knockback:number;colliders:Collider[]}> = {
  balloon:{heft:'light',flail:0.3,knockback:1,colliders:[{center:[0,1,0],size:[3,4,3],sphere:2,penalty:0.8}]},
  fridge:{heft:'heavy',flail:0.6,knockback:3,colliders:[{center:[0,0,0],size:[2,3.6,1.8],penalty:0.4}]},
  satellite:{heft:'heavy body / light panels',flail:0.6,knockback:2,colliders:[
    {center:[0,0,0],size:[2.4,2.4,2.4],penalty:0.4},
    {center:[-4,0,0],size:[5,0.3,3],penalty:0.75},
    {center:[4,0,0],size:[5,0.3,3],penalty:0.75},
  ]},
  sofa:{heft:'bouncy',flail:0.45,knockback:5,colliders:[{center:[0,0,0],size:[4.8,2,2.4],penalty:0.6}]},
};
export function makeCourse() {
  const kinds:ObstacleKind[]=['satellite','fridge','balloon','sofa'];
  return Array.from({length:64},(_,i):Obstacle=>({
    id:i,kind:kinds[i%4],position:[((i*13)%35)-17,-220-i*49,((i*19)%35)-17],
    rotation:[i*0.21,i*0.73,i*0.13],active:true,hitAt:-1,
  }));
}
export function obstaclePose(obstacle:Obstacle,time:number) {
  const p:[number,number,number]=[...obstacle.position];
  if(obstacle.kind==='balloon') p[0]+=Math.sin(time*0.4+obstacle.id)*2;
  const rotation:Position=[obstacle.rotation[0]+(obstacle.kind==='fridge'?time*0.35:0),obstacle.rotation[1]+time*0.3,obstacle.rotation[2]];
  return {position:p,rotation};
}
export function segmentSphere(a:Position,b:Position,center:Position,radius:number) {
  const d=new Vector3(...b).sub(new Vector3(...a));
  const offset=new Vector3(...center).sub(new Vector3(...a));
  const t=Math.max(0,Math.min(1,offset.dot(d)/(d.lengthSq()||1)));
  return new Vector3(...a).addScaledVector(d,t).distanceToSquared(new Vector3(...center))<=radius*radius;
}
// Transform the swept player segment into each authored collider's local space.
// The expanded box is a conservative sphere-vs-box approximation at corners.
export function obstacleHit(a:Position,b:Position,obstacle:Obstacle,time:number):number|null {
  const pose=obstaclePose(obstacle,time);
  const inverse=new Quaternion().setFromEuler(new Euler(...pose.rotation)).invert();
  const local=(p:Position)=>new Vector3(...p).sub(new Vector3(...pose.position)).applyQuaternion(inverse);
  const start=local(a),end=local(b);
  for(const collider of OBSTACLE_RULES[obstacle.kind].colliders) {
    if(collider.sphere) {
      if(segmentSphere(start.toArray() as Position,end.toArray() as Position,collider.center,collider.sphere+0.65)) return collider.penalty;
      continue;
    }
    let near=0,far=1;
    for(let axis=0;axis<3;axis++) {
      const origin=start.getComponent(axis)-collider.center[axis];
      const delta=end.getComponent(axis)-start.getComponent(axis);
      const extent=collider.size[axis]/2+0.65;
      if(Math.abs(delta)<1e-9) {if(Math.abs(origin)>extent){far=-1;break;}}
      else {
        const lo=(-extent-origin)/delta,hi=(extent-origin)/delta;
        near=Math.max(near,Math.min(lo,hi));far=Math.min(far,Math.max(lo,hi));
      }
    }
    if(near<=far) return collider.penalty;
  }
  return null;
}
