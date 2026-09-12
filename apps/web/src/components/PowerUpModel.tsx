import { useMemo } from 'react';
import { Color, DoubleSide } from 'three';
import type { CreationSpec, MeshAppearance, PowerUpSpec } from '@sky/shared';

function MeshModel({appearance}: {appearance: MeshAppearance}) {
  const {positions, colors} = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    appearance.triangles.forEach((triangle, face) => {
      const color = new Color(appearance.faceColors[face]);
      for (const index of triangle) {
        positions.push(...appearance.vertices[index]);
        colors.push(color.r, color.g, color.b);
      }
    });
    return {positions: new Float32Array(positions), colors: new Float32Array(colors)};
  }, [appearance]);
  return <mesh>
    {/* R3F owns and disposes this geometry on replacement/unmount. */}
    <bufferGeometry onUpdate={geometry => geometry.computeVertexNormals()}>
      <bufferAttribute attach="attributes-position" args={[positions, 3]}/>
      <bufferAttribute attach="attributes-color" args={[colors, 3]}/>
    </bufferGeometry>
    <meshStandardMaterial vertexColors flatShading side={DoubleSide} roughness={0.55}/>
  </mesh>;
}
// Callers validate external data before rendering. Appearance never sets collision bounds.
export function PowerUpModel({spec}: {spec: PowerUpSpec | CreationSpec}) {
  if ('type' in spec.appearance && spec.appearance.type === 'mesh') {
    return <MeshModel key={spec.id} appearance={spec.appearance}/>;
  }
  const primitives = 'primitives' in spec.appearance ? spec.appearance.primitives : [];
  return <group>{primitives.map((part, index) =>
    <mesh key={index} position={part.position} rotation={part.rotation} scale={part.scale}>
      {part.type === 'box' && <boxGeometry args={[1,1,1]}/>}
      {part.type === 'sphere' && <sphereGeometry args={[0.5,24,16]}/>}
      {part.type === 'cylinder' && <cylinderGeometry args={[0.5,0.5,1,24]}/>}
      {part.type === 'cone' && <coneGeometry args={[0.5,1,24]}/>}
      <meshStandardMaterial color={part.color} roughness={0.45}/>
    </mesh>
  )}</group>;
}
