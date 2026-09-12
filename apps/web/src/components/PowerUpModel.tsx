import type { PowerUpSpec } from '@sky/shared';
// Presentation only: callers validate external specs before rendering.
export function PowerUpModel({spec}:{spec:PowerUpSpec}) {
  return <group>{spec.appearance.primitives.map((part,index) =>
    <mesh key={index} position={part.position} rotation={part.rotation} scale={part.scale}>
      {part.type==='box' && <boxGeometry args={[1,1,1]}/>}
      {part.type==='sphere' && <sphereGeometry args={[0.5,24,16]}/>}
      {part.type==='cylinder' && <cylinderGeometry args={[0.5,0.5,1,24]}/>}
      {part.type==='cone' && <coneGeometry args={[0.5,1,24]}/>}
      <meshStandardMaterial color={part.color} roughness={0.45}/>
    </mesh>
  )}</group>;
}
