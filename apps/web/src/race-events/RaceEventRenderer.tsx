import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, Color, DoubleSide, type Group, type InstancedMesh, type Mesh } from 'three';
import { RACE_EVENT_LIMITS, type RaceEventPort } from '@sky/shared';
import { PowerUpModel } from '../components/PowerUpModel';
const tint={gravityWell:'#bb8cff',debrisShower:'#ffcc73',repulsionBurst:'#ff9d55',protectiveZone:'#7ee9f1'};
/** Reads simulation state only. Rendering never advances event time or applies effects. */
export function RaceEventRenderer({events,debug=false}:{events:RaceEventPort;debug?:boolean}) {
  const initial=events.getSnapshot();
  const root=useRef<Group>(null),model=useRef<Group>(null),field=useRef<Mesh>(null),pickup=useRef<Mesh>(null),debris=useRef<InstancedMesh>(null);
  const scratch=useRef(new Object3D()),color=useRef(new Color());
  useFrame(()=>{
    const state=events.getSnapshot();if(!root.current)return;
    root.current.visible=state.phase==='collectible'||state.phase==='active';
    root.current.position.set(...state.position);
    if(model.current) {
      model.current.rotation.y=state.elapsedSeconds*0.7;
      model.current.scale.setScalar(state.phase==='active'?1+Math.sin(state.elapsedSeconds*5)*0.08:1);
    }
    if(field.current){field.current.visible=state.phase==='active'&&state.radius>0;field.current.scale.setScalar(state.radius);}
    if(pickup.current)pickup.current.visible=debug&&state.phase==='collectible';
    if(debris.current) {
      debris.current.count=state.debris.length;
      state.debris.forEach((particle,i)=>{
        scratch.current.position.set(particle.position[0]-state.position[0],particle.position[1]-state.position[1],particle.position[2]-state.position[2]);
        scratch.current.rotation.set(state.elapsedSeconds+i,state.elapsedSeconds*0.8+i,0);
        scratch.current.scale.setScalar(particle.collidable?RACE_EVENT_LIMITS.debrisRadius:0.16);scratch.current.updateMatrix();
        debris.current!.setMatrixAt(i,scratch.current.matrix);
        debris.current!.setColorAt(i,color.current.set(particle.collidable?'#ffbd63':'#85cbd8'));
      });
      debris.current.instanceMatrix.needsUpdate=true;
      if(debris.current.instanceColor)debris.current.instanceColor.needsUpdate=true;
    }
  });
  if(!initial.instance)return null;
  const spec=initial.instance.spec;
  return <group ref={root}>
    <group ref={model}><PowerUpModel spec={spec}/></group>
    <mesh ref={field}>
      <sphereGeometry args={[1,32,20]}/>
      <meshBasicMaterial color={tint[spec.effect.type]} wireframe={debug} transparent opacity={debug?0.18:0.075} side={DoubleSide} depthWrite={false}/>
    </mesh>
    <mesh ref={pickup} visible={false}><sphereGeometry args={[RACE_EVENT_LIMITS.collectibleRadius+RACE_EVENT_LIMITS.racerRadius,16,12]}/><meshBasicMaterial wireframe color="#ffda6e"/></mesh>
    <instancedMesh ref={debris} args={[undefined,undefined,100]} frustumCulled={false}>
      <icosahedronGeometry args={[1,0]}/><meshStandardMaterial roughness={0.65}/>
    </instancedMesh>
  </group>;
}
