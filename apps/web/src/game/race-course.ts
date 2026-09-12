import { Euler, Quaternion, Vector3 } from 'three';
import type { Position } from './player-controller';

export type Item = 'umbrella' | 'cloak' | 'sun';
export const ITEM_NAMES: Record<Item,string> = {umbrella:'Jellyfish umbrella',cloak:'Ghost cloak',sun:'Angry sun'};
export type ObstacleKind = 'balloon'|'fridge'|'satellite'|'sofa'|'duct'|'duck'|'toilet'|'piano'|'rock';
export type Collider = {center:Position; size:Position; sphere?:number; penalty:number};
export type Obstacle = {id:number;kind:ObstacleKind;position:Position;rotation:Position;active:boolean;hitAt:number};
export const OBSTACLE_RULES: Record<ObstacleKind,{heft:string;flail:number;knockback:number;colliders:Collider[]}> = {
  duck:{heft:'rubbery',flail:0.35,knockback:5,colliders:[{center:[0,0,0],size:[4,3,4],sphere:2,penalty:0.75}]},
  toilet:{heft:'porcelain',flail:0.6,knockback:3,colliders:[{center:[0,0,0],size:[2.5,3.2,3.5],penalty:0.45}]},
  piano:{heft:'very heavy',flail:0.7,knockback:4,colliders:[{center:[0,0,0],size:[5,3,3],penalty:0.35}]},
  rock:{heft:'space rock',flail:0.55,knockback:3,colliders:[{center:[0,0,0],size:[4,4,4],sphere:2,penalty:0.5}]},
  duct:{heft:'pipe wall',flail:0.6,knockback:2,colliders:[
    {center:[-6.5,0,0],size:[1,24,14],penalty:0.5},{center:[6.5,0,0],size:[1,24,14],penalty:0.5},
    {center:[0,0,-6.5],size:[12,24,1],penalty:0.5},{center:[0,0,6.5],size:[12,24,1],penalty:0.5},
  ]},
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
  const kinds:ObstacleKind[]=['satellite','fridge','balloon','sofa','duck','toilet','piano','rock'];
  const junk=Array.from({length:192},(_,i):Obstacle=>{
    const row=Math.floor(i/4),slot=(i%4+row%5)%5;
    return {id:i,kind:kinds[i%kinds.length],position:[-30+slot*15,-160-row*65,((row*17+i%4*13)%61)-30],
      rotation:[i*0.21,i*0.73,i*0.13],active:true,hitAt:-1};
  });
  const ducts=makeDucts();
  return [...junk.filter(o=>!ducts.some(d=>Math.abs(o.position[1]-d.position[1])<28&&Math.hypot(o.position[0]-d.position[0],o.position[2]-d.position[2])<18)),...ducts];
}
export function makeDucts():Obstacle[]{
  return [650,1650,2650].flatMap((depth,course)=>Array.from({length:3},(_,section)=>({
    id:1000+course*3+section,kind:'duct' as const,
    position:[(course%2?-18:10)+section*4,-depth-section*24,course%2?16:-16] as Position,
    rotation:[0,0,0] as Position,active:true,hitAt:-1,
  })));
}
export function obstaclePose(obstacle:Obstacle,time:number) {
  if(obstacle.kind==='duct')return {position:obstacle.position,rotation:obstacle.rotation};
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

// Keep randomized boxes away from junk, pipe walls, and one another.
export function makeItemBoxes(obstacles:Obstacle[],random:()=>number) {
  return Array.from({length:14},(_,section)=>{
    const positions:Position[]=[];
    return Array.from({length:5},(_,index)=>{
      const y=-100-section*250-index%3*6;
      const clear=(x:number,z:number)=>positions.every(p=>Math.hypot(p[0]-x,p[2]-z)>=9)&&
        obstacles.every(o=>Math.abs(o.position[1]-y)>(o.kind==='duct'?30:12)||
          Math.hypot(o.position[0]-x,o.position[2]-z)>(o.kind==='duct'?19:10));
      let position:Position|undefined;
      for(let attempt=0;attempt<40;attempt++){
        const x=random()*56-28,z=random()*56-28;
        if(clear(x,z)){position=[x,y,z];break;}
      }
      // Bounded fallback also keeps seeded tests and unlucky rolls safe.
      if(!position)for(let x=-28;x<=28&&!position;x+=7)for(let z=-28;z<=28;z+=7){
        if(clear(x,z)){position=[x,y,z];break;}
      }
      if(!position)throw new Error('No clear item-box placement.');
      positions.push(position);
      return {id:section*5+index,position,rotation:[random()*Math.PI*2,random()*Math.PI*2,random()*Math.PI*2] as Position,active:true};
    });
  }).flat();
}
