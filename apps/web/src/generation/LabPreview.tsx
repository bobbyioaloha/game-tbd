import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import type { CreationSpec } from '@sky/shared';
import { PowerUpModel } from '../components/PowerUpModel';

function PreviewObject({spec, angle, spin}: {spec: CreationSpec; angle: number; spin: boolean}) {
  const root = useRef<Group>(null), age = useRef(0), rotation = useRef(0);
  useFrame((_, delta) => {
    age.current += Math.min(delta, 0.1);
    if (spin) rotation.current += delta * 0.5;
    if (!root.current) return;
    root.current.rotation.y = angle + rotation.current;
    root.current.scale.setScalar(1 - 0.95 * Math.pow(1 - Math.min(age.current / 0.35, 1), 3));
  });
  return <group ref={root}><PowerUpModel spec={spec}/></group>;
}
function CameraDistance({distance}: {distance: number}) {
  const camera = useThree(state => state.camera);
  useEffect(() => {camera.position.set(0, distance * 0.18, distance); camera.lookAt(0, 0, 0);}, [camera, distance]);
  return null;
}
export function LabPreview({spec, angle, distance, spin}: {
  spec: CreationSpec; angle: number; distance: number; spin: boolean;
}) {
  return <Canvas camera={{position: [0, 1.26, 7], fov: 45}} fallback={<p>WebGL unavailable.</p>}>
    <ambientLight intensity={1.5}/><directionalLight position={[3, 5, 4]} intensity={3}/>
    <CameraDistance distance={distance}/>
    <PreviewObject key={spec.id} spec={spec} angle={angle} spin={spin}/>
  </Canvas>;
}
