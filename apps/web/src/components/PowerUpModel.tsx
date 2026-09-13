import { useMemo, type RefObject } from 'react';
import { Color, DoubleSide, type BufferGeometry, type InstancedMesh } from 'three';
import { compilePrimitiveAppearance } from '../generation/compile-primitives';
import type { CreationSpec, MeshAppearance, PrimitiveAppearance, PowerUpSpec, RaceEventCreation, SafetyDrillSpec } from '@sky/shared';

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
function ProceduralModel({appearance}: {appearance: PrimitiveAppearance}) {
  const {positions, normals, colors} = useMemo(() => compilePrimitiveAppearance(appearance), [appearance]);
  return <mesh>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[positions, 3]}/>
      <bufferAttribute attach="attributes-normal" args={[normals, 3]}/>
      <bufferAttribute attach="attributes-color" args={[colors, 3]}/>
    </bufferGeometry>
    <meshStandardMaterial vertexColors roughness={0.45}/>
  </mesh>;
}
// Callers validate external data before rendering. Appearance never sets collision bounds.
export function PowerUpModel({spec}: {spec: PowerUpSpec | CreationSpec | RaceEventCreation | SafetyDrillSpec}) {
  if ('type' in spec.appearance && spec.appearance.type === 'mesh') {
    return <MeshModel key={spec.id} appearance={spec.appearance}/>;
  }
  if ('type' in spec.appearance && spec.appearance.type === 'primitives') {
    return <ProceduralModel key={spec.id} appearance={spec.appearance}/>;
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

function fitInstanceGeometry(geometry:BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds=geometry.boundingBox;
  if(bounds){
    const width=bounds.max.x-bounds.min.x,height=bounds.max.y-bounds.min.y,depth=bounds.max.z-bounds.min.z;
    const scale=1/Math.max(Math.hypot(width,height,depth),0.001);
    geometry.center();geometry.scale(scale,scale,scale);
  }
  geometry.computeVertexNormals();
}

/** Compile once for every instance of an encounter's generated appearance. */
export function PowerUpInstances({appearance,meshRef,capacity,opacity=1}:{
  appearance:MeshAppearance|PrimitiveAppearance;
  meshRef:RefObject<InstancedMesh|null>;
  capacity:number;
  opacity?:number;
}) {
  const attributes=useMemo(()=>{
    if(appearance.type==='primitives')return compilePrimitiveAppearance(appearance);
    const positions:number[]=[],colors:number[]=[];
    appearance.triangles.forEach((triangle,face)=>{
      const color=new Color(appearance.faceColors[face]);
      for(const index of triangle){positions.push(...appearance.vertices[index]);colors.push(color.r,color.g,color.b);}
    });
    return {positions:new Float32Array(positions),colors:new Float32Array(colors)};
  },[appearance]);
  return <instancedMesh ref={meshRef} args={[undefined,undefined,capacity]} count={0} frustumCulled={false}>
    <bufferGeometry key={appearance.type} onUpdate={fitInstanceGeometry}>
      <bufferAttribute attach="attributes-position" args={[attributes.positions,3]}/>
      <bufferAttribute attach="attributes-color" args={[attributes.colors,3]}/>
    </bufferGeometry>
    <meshStandardMaterial vertexColors roughness={0.5} flatShading side={DoubleSide} transparent={opacity<1} opacity={opacity} depthWrite={opacity>=1}/>
  </instancedMesh>;
}
