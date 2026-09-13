import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, Object3D, Vector3, type Group, type InstancedMesh } from 'three';
import { SAFETY_DRILL_LIMITS, type RaceEventPort, type SafetyDrillSpec, type DrillCurrent, type EventVector } from '@sky/shared';
import { PowerUpInstances } from '../components/PowerUpModel';

// Shared runtime caps are 32 herd actors / 64 current segments. Two bank markers per segment.
const ACTORS=SAFETY_DRILL_LIMITS.maxActors,CURRENTS=SAFETY_DRILL_LIMITS.maxCurrents,MARKERS=CURRENTS*2;
const flowColor={flow:'#48dfee',fast:'#ffd36a',eddy:'#85f1b4'};

/** Visualizes the runtime's actual hazard and current bounds. Never advances simulation. */
export function DrillRenderer({events,spec,debug=false}:{events:RaceEventPort;spec:SafetyDrillSpec;debug?:boolean}) {
  const root=useRef<Group>(null),appearance=useRef<InstancedMesh>(null),bounds=useRef<InstancedMesh>(null);
  const telegraphs=useRef<InstancedMesh>(null),aims=useRef<InstancedMesh>(null);
  const currents=useRef<InstancedMesh>(null),caps=useRef<InstancedMesh>(null),arrows=useRef<InstancedMesh>(null),wakes=useRef<InstancedMesh>(null),wakeCaps=useRef<InstancedMesh>(null);
  const {scratch,color,direction,up}=useMemo(()=>({scratch:new Object3D(),color:new Color(),direction:new Vector3(),up:new Vector3(0,1,0)}),[]);
  useFrame(()=>{
    const state=events.getSnapshot(),drill=state.drill;
    if(root.current)root.current.visible=state.phase==='active'&&Boolean(drill);
    if(!drill||!appearance.current||!bounds.current||!currents.current||!caps.current||!arrows.current||!wakes.current||!wakeCaps.current||!telegraphs.current||!aims.current)return;
    let appearanceCount=0,wakeCount=0,telegraphCount=0;
    const place=(mesh:InstancedMesh,index:number,x:number,y:number,z:number,sx:number,sy=sx,sz=sx,tint='#ffffff')=>{
      scratch.position.set(x,y,z);scratch.scale.set(sx,sy,sz);scratch.updateMatrix();
      mesh.setMatrixAt(index,scratch.matrix);mesh.setColorAt(index,color.set(tint));
    };
    const orientSegment=(from:EventVector,to:EventVector)=>{
      direction.set(to[0]-from[0],to[1]-from[1],to[2]-from[2]);
      const distance=direction.length();
      scratch.quaternion.setFromUnitVectors(up,direction.normalize());
      return Math.max(distance,0.001);
    };
    // Currents and drafting wakes share exactly the capsule supplied by the simulation.
    const placeCapsule=(body:InstancedMesh,ends:InstancedMesh,index:number,
      capsule:Pick<DrillCurrent,'from'|'to'|'position'|'radius'>,tint:string)=>{
      const {from,to,position,radius}=capsule;
      const distance=orientSegment(from,to);
      place(body,index,...position,radius,distance,radius,tint);
      scratch.rotation.set(0,0,0);
      place(ends,index*2,...from,radius,radius,radius,tint);
      place(ends,index*2+1,...to,radius,radius,radius,tint);
    };
    for(const [index,actor] of drill.actors.entries()){
      scratch.rotation.set(0,Math.atan2(actor.velocity[0],actor.velocity[2]),0);
      place(appearance.current,appearanceCount++,...actor.position,actor.radius*2);
      const tint=actor.state==='warning'?'#ffda6e':actor.state==='scattering'?'#8bf5e0':'#ff775f';
      scratch.rotation.set(0,0,0);
      place(bounds.current,index,...actor.position,actor.radius,actor.radius,actor.radius,tint);
      if(actor.telegraph){
        const {from,to}=actor.telegraph;
        const distance=orientSegment(from,to);
        place(telegraphs.current,telegraphCount,(from[0]+to[0])/2,(from[1]+to[1])/2,(from[2]+to[2])/2,actor.radius,distance,actor.radius,'#ffda6e');
        place(aims.current,telegraphCount++,...to,actor.radius*0.7,actor.radius*1.5,actor.radius*0.7,'#ffda6e');
      }
      if(actor.wake){
        placeCapsule(wakes.current,wakeCaps.current,wakeCount++,actor.wake,'#81e5f5');
      }
    }
    for(const [index,current] of drill.currents.entries()){
      placeCapsule(currents.current,caps.current,index,current,flowColor[current.kind]);
      direction.set(...current.direction);
      const strength=current.strength;
      if(direction.lengthSq()>0)scratch.quaternion.setFromUnitVectors(up,direction.normalize());
      place(arrows.current,index,...current.position,0.6,Math.max(0.02,Math.min(3,strength/10)),0.6,flowColor[current.kind]);
      // Appearance is a bank marker, never an invisible collision source.
      scratch.rotation.set(0,state.elapsedSeconds*0.35,0);
      for(const sign of [-1,1])place(appearance.current,appearanceCount++,current.position[0]+current.radius*sign,current.position[1],current.position[2],2.6);
    }
    appearance.current.count=appearanceCount;bounds.current.count=drill.actors.length;
    currents.current.count=drill.currents.length;caps.current.count=drill.currents.length*2;
    telegraphs.current.count=telegraphCount;aims.current.count=telegraphCount;
    arrows.current.count=drill.currents.length;wakes.current.count=wakeCount;wakeCaps.current.count=wakeCount*2;
    for(const mesh of [appearance.current,bounds.current,currents.current,caps.current,arrows.current,wakes.current,wakeCaps.current,telegraphs.current,aims.current]){
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
  });
  return <group ref={root} visible={false}>
    <PowerUpInstances appearance={spec.appearance} meshRef={appearance} capacity={MARKERS}/>
    <instancedMesh ref={telegraphs} args={[undefined,undefined,ACTORS]} count={0} frustumCulled={false}>
      <cylinderGeometry args={[1,1,1,12,1,true]}/><meshBasicMaterial transparent opacity={0.18} depthWrite={false} side={DoubleSide}/>
    </instancedMesh>
    <instancedMesh ref={aims} args={[undefined,undefined,ACTORS]} count={0} frustumCulled={false}>
      <coneGeometry args={[1,1,6]}/><meshBasicMaterial transparent opacity={0.75} depthWrite={false}/>
    </instancedMesh>
    <instancedMesh ref={bounds} args={[undefined,undefined,ACTORS]} count={0} frustumCulled={false}>
      <sphereGeometry args={[1,12,8]}/><meshBasicMaterial wireframe transparent opacity={debug?0.65:0.22} depthWrite={false} side={DoubleSide}/>
    </instancedMesh>
    <instancedMesh ref={wakes} args={[undefined,undefined,ACTORS]} count={0} frustumCulled={false}>
      <cylinderGeometry args={[1,1,1,12,1,true]}/><meshBasicMaterial wireframe={debug} transparent opacity={debug?0.35:0.16} depthWrite={false} side={DoubleSide}/>
    </instancedMesh>
    <instancedMesh ref={wakeCaps} args={[undefined,undefined,ACTORS*2]} count={0} frustumCulled={false}>
      <sphereGeometry args={[1,12,8]}/><meshBasicMaterial wireframe={debug} transparent opacity={0.08} depthWrite={false} side={DoubleSide}/>
    </instancedMesh>
    <instancedMesh ref={currents} args={[undefined,undefined,CURRENTS]} count={0} frustumCulled={false}>
      <cylinderGeometry args={[1,1,1,12,1,true]}/><meshBasicMaterial wireframe={debug} transparent opacity={debug?0.3:0.2} depthWrite={false} side={DoubleSide}/>
    </instancedMesh>
    <instancedMesh ref={caps} args={[undefined,undefined,CURRENTS*2]} count={0} frustumCulled={false}>
      <sphereGeometry args={[1,12,8]}/><meshBasicMaterial wireframe={debug} transparent opacity={0.08} depthWrite={false} side={DoubleSide}/>
    </instancedMesh>
    <instancedMesh ref={arrows} args={[undefined,undefined,CURRENTS]} count={0} frustumCulled={false}>
      <coneGeometry args={[1,1,6]}/><meshBasicMaterial/>
    </instancedMesh>
  </group>;
}
