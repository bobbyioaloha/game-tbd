import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Shape, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import type { PlayerSnapshot } from './player-controller';

// An authored placeholder, independent of generated collectible visuals.
export function StarfishDiver({color = '#ff9875'}: {color?: string}) {
  const shape = useMemo(() => {
    const star = new Shape();
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 === 0 ? 1.55 : 0.65;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i === 0) star.moveTo(x, y); else star.lineTo(x, y);
    }
    star.closePath();
    return star;
  }, []);
  return <group>
    <mesh rotation={[-Math.PI/2,0,0]}>
      <extrudeGeometry args={[shape, {depth: 0.25, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 2, steps: 1}]}/>
      <meshStandardMaterial color={color} roughness={0.7}/>
    </mesh>
    {[-0.23,0.23].map(x => <mesh key={x} position={[x,0.4,-0.35]}>
      <sphereGeometry args={[0.09,12,8]}/><meshStandardMaterial color="#233148"/>
    </mesh>)}
  </group>;
}

const clouds = Array.from({length: 64}, (_, index) => ({
  x: ((index * 73) % 160) - 80,
  z: ((index * 47) % 160) - 80,
  depth: ((index * 31) % 180),
  scale: 0.8 + (index % 5) * 0.3,
}));
const puffs: [number, number, number, number][] = [
  [0,0,0,3.5], [-3,0.1,0.6,2.7], [3,0,0,2.9], [-0.8,0.6,-2,2.8], [1.8,0.3,2,2.5],
];
const wrap = (value: number, span: number) => ((value % span) + span) % span;

// All scenery follows world distance, not wall-clock time: pause freezes clouds,
// and braking makes their approach visibly slower. Recycling bounds scene size.
export function CloudField({snapshot}: {snapshot: () => PlayerSnapshot}) {
  const field = useRef<Group>(null);
  useFrame(() => {
    const {position: [x,y,z]} = snapshot();
    field.current?.children.forEach((cloud, index) => {
      const seed = clouds[index];
      const relativeY = wrap(-y - seed.depth, 180) - 170;
      cloud.position.set(x + wrap(seed.x-x+80,160)-80, relativeY, z + wrap(seed.z-z+80,160)-80);
      const opacity = Math.min(0.85, Math.max(0, (-relativeY - 2) / 14));
      cloud.children.forEach(child => {
        ((child as Mesh).material as MeshStandardMaterial).opacity = opacity;
      });
    });
  });
  return <group ref={field}>{clouds.map((cloud,index) =>
    <group key={index} scale={cloud.scale}>
      {puffs.map(([x,y,z,radius], puff) => <mesh key={puff} position={[x,y,z]} scale={[1,0.45,0.8]}>
        <sphereGeometry args={[radius,10,7]}/>
        <meshStandardMaterial color="#f4f9ff" roughness={1} transparent opacity={0.8} depthWrite={false}/>
      </mesh>)}
    </group>
  )}</group>;
}
