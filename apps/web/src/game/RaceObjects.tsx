import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { PowerUpModel } from '../components/PowerUpModel';
import { fixtures } from '@sky/shared';
import { obstaclePose, type ObstacleKind } from './race-course';
import type { PracticeRace } from './practice-race';

function Block({position=[0,0,0],size,color}:{position?:[number,number,number];size:[number,number,number];color:string}){
  return <mesh position={position}><boxGeometry args={size}/><meshStandardMaterial color={color}/></mesh>;
}
function ObstacleModel({kind}:{kind:ObstacleKind}){
  if(kind==='fridge')return <group>
    <Block size={[2,3.6,1.8]} color="#d7ecee"/>
    <Block position={[0,0.8,0.94]} size={[1.9,1.7,0.08]} color="#fbffff"/>
    <Block position={[0,-0.9,0.94]} size={[1.9,1.6,0.08]} color="#fbffff"/>
    <Block position={[0.65,0.65,1.05]} size={[0.12,0.8,0.12]} color="#657782"/>
    <Block position={[0.65,-0.6,1.05]} size={[0.12,0.6,0.12]} color="#657782"/>
  </group>;
  if(kind==='satellite')return <group>
    <Block size={[2.4,2.4,2.4]} color="#c5a449"/>
    {[-4,4].map(x=><group key={x} position={[x,0,0]}>
      <Block size={[5,0.3,3]} color="#2449a0"/>
      {[-2,-1,0,1,2].map(line=><Block key={line} position={[line,0.17,0]} size={[0.06,0.03,3]} color="#88bfe7"/>)}
    </group>)}
    <mesh position={[0,2,0]} rotation={[Math.PI,0,0]}><coneGeometry args={[1.4,0.8,16,1,true]}/><meshStandardMaterial color="#f5e9bc" side={2}/></mesh>
  </group>;
  if(kind==='balloon')return <group>
    <mesh position={[0,1,0]} scale={[1,1.3,1]}><sphereGeometry args={[2,16,12]}/><meshStandardMaterial color="#f394b8"/></mesh>
    <Block position={[0,-2.4,0]} size={[1.2,0.8,1.2]} color="#98774c"/>
    {[-0.5,0.5].map(x=><Block key={x} position={[x,-1.4,0]} size={[0.04,1.4,0.04]} color="#eee3ca"/>)}
  </group>;
  return <group>
    <Block size={[4.8,0.8,2.4]} color="#8755ae"/>
    <Block position={[0,0.8,0.95]} size={[4.8,1.2,0.5]} color="#a377c5"/>
    {[-2.1,2.1].map(x=><Block key={x} position={[x,0.5,0]} size={[0.6,1,2.4]} color="#a377c5"/>)}
    {[-1.2,0,1.2].map(x=><Block key={x} position={[x,0.5,-0.1]} size={[1.1,0.3,1.8]} color="#bd93d9"/>)}
  </group>;
}
export function RaceObjects({race}:{race:PracticeRace}){
  const obstacles=useRef<Group>(null),boxes=useRef<Group>(null),rings=useRef<Group>(null),shots=useRef<Group>(null);
  useFrame(()=>{
    const y=race.snapshot(race.racers[0]).position[1];
    obstacles.current?.children.forEach((group,i)=>{
      const obstacle=race.obstacles[i],pose=obstaclePose(obstacle,race.elapsed);
      const age=obstacle.active?0:race.elapsed-obstacle.hitAt;
      group.visible=Math.abs(pose.position[1]-y)<230&&(obstacle.active||age<0.8);
      group.position.set(pose.position[0]+age*12,pose.position[1]-y,pose.position[2]);
      group.rotation.set(pose.rotation[0]+age*6,pose.rotation[1],pose.rotation[2]+age*4);
      group.scale.setScalar(obstacle.active?1:Math.max(0,1-age));
    });
    boxes.current?.children.forEach((group,i)=>{
      const box=race.boxes[i];group.visible=box.active&&Math.abs(box.position[1]-y)<230;
      group.position.set(box.position[0],box.position[1]-y,box.position[2]);
      group.rotation.set(race.elapsed*0.4,race.elapsed,0.3);
    });
    rings.current?.children.forEach((group,i)=>{
      const ring=race.rings[i];group.visible=!ring.used.has(0)&&Math.abs(ring.position[1]-y)<230;
      group.position.set(ring.position[0],ring.position[1]-y,ring.position[2]);
    });
    shots.current?.children.forEach((group,i)=>{
      const shot=race.projectiles[i];group.visible=!!shot;
      if(shot)group.position.set(shot.position[0],shot.position[1]-y,shot.position[2]);
    });
  });
  return <>
    <group ref={obstacles}>{race.obstacles.map(o=><group key={o.id}><ObstacleModel kind={o.kind}/></group>)}</group>
    <group ref={boxes}>{race.boxes.map(box=><group key={box.id}>
      <Block size={[1.5,1.5,1.5]} color="#ffe273"/>
      <Block size={[1.6,0.25,1.6]} color="#a26aff"/><Block size={[0.25,1.6,1.6]} color="#a26aff"/>
    </group>)}</group>
    <group ref={rings}>{race.rings.map(ring=><group key={ring.id}>
      <mesh rotation={[-Math.PI/2,0,0]}><torusGeometry args={[3,0.22,8,40]}/><meshStandardMaterial color="#6dffde" emissive="#19c69a" emissiveIntensity={1.5}/></mesh>
    </group>)}</group>
    <group ref={shots}>{Array.from({length:16},(_,i)=><group key={i} scale={0.5}><PowerUpModel spec={fixtures[0]}/></group>)}</group>
  </>;
}
