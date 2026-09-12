import { useLayoutEffect, useMemo, useRef } from 'react';
import { fitModelToDiameter } from './model-presentation';
import { useFrame } from '@react-three/fiber';
import { Object3D, Color, DoubleSide, type Group, type InstancedMesh, type Mesh, type MeshBasicMaterial } from 'three';
import { RACE_EVENT_LIMITS, type RaceEventPort } from '@sky/shared';
import { PowerUpModel } from '../components/PowerUpModel';
const tint={gravityWell:'#bb8cff',debrisShower:'#ffcc73',repulsionBurst:'#ff9d55',protectiveZone:'#7ee9f1'};
/** Reads simulation state only. Rendering never advances event time or applies effects. */
export function RaceEventRenderer({events,debug=false,modelScale=1,modelDiameter,modelTilt=[0,0],pickupContactRadius=RACE_EVENT_LIMITS.collectibleRadius+RACE_EVENT_LIMITS.racerRadius}:
  {events:RaceEventPort;debug?:boolean;modelScale?:number;modelDiameter?:number;modelTilt?:readonly [number,number];pickupContactRadius?:number}) {
  const initial=events.getSnapshot();
  const root=useRef<Group>(null),model=useRef<Group>(null),content=useRef<Group>(null),field=useRef<Mesh>(null),pickup=useRef<Mesh>(null),outline=useRef<Mesh>(null),debris=useRef<InstancedMesh>(null);
  const {scratch,color}=useMemo(()=>({scratch:new Object3D(),color:new Color()}),[]);
  useLayoutEffect(()=>{
    if(content.current&&modelDiameter!==undefined)fitModelToDiameter(content.current,modelDiameter);
  },[initial.instance?.spec,modelDiameter]);
  useFrame(()=>{
    const state=events.getSnapshot();if(!root.current)return;
    root.current.visible=state.phase==='collectible'||state.phase==='active';
    root.current.position.set(...state.position);
    if(model.current) {
      model.current.rotation.set(modelTilt[0],state.elapsedSeconds*0.7,modelTilt[1]);
      model.current.scale.setScalar(modelScale*(state.phase==='active'?1+Math.sin(state.elapsedSeconds*5)*0.08:1));
    }
    const displayRadius=debug?state.radius:Math.min(34,state.radius);
    const waveRadius=state.instance?.spec.effect.type==='repulsionBurst'&&!debug?34*Math.min(1,state.elapsedSeconds/0.45):displayRadius;
    if(field.current){field.current.visible=state.phase==='active'&&state.radius>0;field.current.scale.setScalar(waveRadius);}
    if(outline.current){outline.current.visible=state.phase==='collectible'||state.radius>0;outline.current.scale.setScalar(state.phase==='collectible'?pickupContactRadius:waveRadius);
      if(state.instance)(outline.current.material as MeshBasicMaterial).color.set(state.phase==='collectible'?'#ffe16c':tint[state.instance.spec.effect.type]);}
    if(pickup.current)pickup.current.visible=state.phase==='collectible';
    if(debris.current) {
      debris.current.count=state.debris.length;
      state.debris.forEach((particle,i)=>{
        scratch.position.set(particle.position[0]-state.position[0],particle.position[1]-state.position[1],particle.position[2]-state.position[2]);
        scratch.rotation.set(state.elapsedSeconds+i,state.elapsedSeconds*0.8+i,0);
        scratch.scale.setScalar(particle.collidable?RACE_EVENT_LIMITS.debrisRadius:0.4);scratch.updateMatrix();
        debris.current!.setMatrixAt(i,scratch.matrix);
        debris.current!.setColorAt(i,color.set(particle.collidable?'#ffbd63':'#85cbd8'));
      });
      debris.current.instanceMatrix.needsUpdate=true;
      if(debris.current.instanceColor)debris.current.instanceColor.needsUpdate=true;
    }
  });
  if(!initial.instance)return null;
  const spec=initial.instance.spec;
  return <group ref={root}>
    <group ref={model}><group ref={content}><PowerUpModel spec={spec}/></group></group>
    <mesh ref={field}>
      <sphereGeometry args={[1,32,20]}/>
      <meshBasicMaterial color={tint[spec.effect.type]} wireframe={debug} transparent opacity={debug?0.18:0.17} side={DoubleSide} depthWrite={false}/>
    </mesh>
    <mesh ref={pickup} visible={false}><sphereGeometry args={[pickupContactRadius,16,12]}/><meshBasicMaterial wireframe={debug} color="#ffda6e" transparent opacity={debug?0.3:0.07} side={DoubleSide} depthWrite={false}/></mesh>
    <mesh ref={outline} rotation={[-Math.PI/2,0,0]}>
      <ringGeometry args={[0.94,1,64]}/><meshBasicMaterial color="#ffe16c" transparent opacity={0.85} side={DoubleSide} depthWrite={false}/>
    </mesh>
    <instancedMesh ref={debris} args={[undefined,undefined,RACE_EVENT_LIMITS.maxDebris]} frustumCulled={false}>
      <icosahedronGeometry args={[1,0]}/><meshStandardMaterial roughness={0.65}/>
    </instancedMesh>
  </group>;
}
