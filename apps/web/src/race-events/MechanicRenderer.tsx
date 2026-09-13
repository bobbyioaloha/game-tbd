import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, Object3D, Vector3, type Group, type InstancedMesh } from 'three';
import { SAFETY_DRILL_LIMITS, type EventVector, type RaceEventPort, type SafetyDrillSpec } from '@sky/shared';
import { PowerUpInstances } from '../components/PowerUpModel';

const {maxTethers:TETHERS,maxOrbits:ORBITS,maxObservers:OBSERVERS}=SAFETY_DRILL_LIMITS;
/** Extra spatial cues only. Physics and visibility state come from the shared runtime snapshot. */
export function MechanicRenderer({events,appearance,debug}:{events:RaceEventPort;appearance:SafetyDrillSpec['appearance'];debug:boolean}) {
  const root=useRef<Group>(null),models=useRef<InstancedMesh>(null),links=useRef<InstancedMesh>(null);
  const fields=useRef<InstancedMesh>(null),rings=useRef<InstancedMesh>(null),arrows=useRef<InstancedMesh>(null),cones=useRef<InstancedMesh>(null);
  const {scratch,color,axis,up,front}=useMemo(()=>({scratch:new Object3D(),color:new Color(),axis:new Vector3(),up:new Vector3(0,1,0),front:new Vector3(0,0,1)}),[]);
  useFrame(()=>{
    const state=events.getSnapshot(),drill=state.drill;
    if(root.current)root.current.visible=state.phase==='active'&&Boolean(drill);
    if(!drill||!models.current||!links.current||!fields.current||!rings.current||!arrows.current||!cones.current)return;
    let modelCount=0;
    const place=(mesh:InstancedMesh,index:number,position:EventVector,size:EventVector,tint:string)=>{
      scratch.position.set(...position);scratch.scale.set(...size);scratch.updateMatrix();
      mesh.setMatrixAt(index,scratch.matrix);mesh.setColorAt(index,color.set(tint));
    };
    for(const [index,tether] of (drill.tethers??[]).entries()) {
      const center:EventVector=[(tether.from[0]+tether.to[0])/2,(tether.from[1]+tether.to[1])/2,(tether.from[2]+tether.to[2])/2];
      axis.set(tether.to[0]-tether.from[0],tether.to[1]-tether.from[1],tether.to[2]-tether.from[2]);
      const distance=axis.length();scratch.quaternion.setFromUnitVectors(up,axis.normalize());
      const width=tether.active?0.12+0.18*Math.min(1,tether.tension):0.06;
      place(links.current,index,center,[width,Math.max(distance,0.001),width],tether.active?(tether.tension>0?'#ffd36a':'#75e2f4'):'#65889b');
      scratch.rotation.set(0,state.elapsedSeconds*0.7,0);place(models.current,modelCount++,center,[3.8,3.8,3.8],'#ffffff');
    }
    for(const [index,orbit] of (drill.orbits??[]).entries()) {
      const tint=orbit.active?'#aa95ff':'#ffda6e';
      scratch.rotation.set(0,state.elapsedSeconds*orbit.direction,0);
      place(models.current,modelCount++,orbit.position,[orbit.coreRadius*2,orbit.coreRadius*2,orbit.coreRadius*2],'#ffffff');
      scratch.rotation.set(0,0,0);place(fields.current,index,orbit.position,[orbit.radius,orbit.height,orbit.radius],tint);
      for(let ring=0;ring<3;ring++) {
        scratch.rotation.set(Math.PI/2,0,0);
        place(rings.current,index*3+ring,[orbit.position[0],orbit.position[1]+(ring-1)*orbit.height/3,orbit.position[2]],[orbit.radius,orbit.radius,orbit.radius],tint);
      }
      const angle=state.elapsedSeconds*orbit.direction,radial=orbit.radius*0.7;
      axis.set(-Math.sin(angle)*orbit.direction,0,Math.cos(angle)*orbit.direction);scratch.quaternion.setFromUnitVectors(up,axis);
      place(arrows.current,index,[orbit.position[0]+Math.cos(angle)*radial,orbit.position[1],orbit.position[2]+Math.sin(angle)*radial],[1,3,1],tint);
    }
    for(const [index,observer] of (drill.observers??[]).entries()) {
      axis.set(...observer.direction);scratch.quaternion.setFromUnitVectors(front,axis);
      place(models.current,modelCount++,observer.position,[6,6,6],'#ffffff');
      const radius=observer.range*Math.sqrt(1/(observer.cosHalfAngle**2)-1);
      // A Three cone points along +Y; its apex is at the observer and its base lies down the viewing direction.
      axis.negate();scratch.quaternion.setFromUnitVectors(up,axis);
      const center:EventVector=observer.position.map((value,i)=>value+observer.direction[i]*observer.range/2) as [number,number,number];
      place(cones.current,index,center,[radius,observer.range,radius],observer.warning?'#ffd36a':observer.watching?'#ff665d':'#518ba6');
    }
    models.current.count=modelCount;links.current.count=drill.tethers?.length??0;
    fields.current.count=drill.orbits?.length??0;rings.current.count=fields.current.count*3;arrows.current.count=fields.current.count;
    cones.current.count=drill.observers?.length??0;
    for(const mesh of [models.current,links.current,fields.current,rings.current,arrows.current,cones.current]){
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
  });
  return <group ref={root} visible={false}>
    <PowerUpInstances appearance={appearance} meshRef={models} capacity={TETHERS+ORBITS+OBSERVERS}/>
    <instancedMesh ref={links} args={[undefined,undefined,TETHERS]} count={0} frustumCulled={false}>
      <cylinderGeometry args={[1,1,1,8]}/><meshBasicMaterial/>
    </instancedMesh>
    <instancedMesh ref={fields} args={[undefined,undefined,ORBITS]} count={0} frustumCulled={false}>
      <cylinderGeometry args={[1,1,1,32,1,true]}/><meshBasicMaterial wireframe={debug} transparent opacity={0.045} side={DoubleSide} depthWrite={false}/>
    </instancedMesh>
    <instancedMesh ref={rings} args={[undefined,undefined,ORBITS*3]} count={0} frustumCulled={false}>
      <torusGeometry args={[1,0.012,6,48]}/><meshBasicMaterial transparent opacity={0.65} depthWrite={false}/>
    </instancedMesh>
    <instancedMesh ref={arrows} args={[undefined,undefined,ORBITS]} count={0} frustumCulled={false}>
      <coneGeometry args={[1,1,8]}/><meshBasicMaterial/>
    </instancedMesh>
    <instancedMesh ref={cones} args={[undefined,undefined,OBSERVERS]} count={0} frustumCulled={false}>
      <coneGeometry args={[1,1,32,1,true]}/><meshBasicMaterial wireframe={debug} transparent opacity={0.12} side={DoubleSide} depthWrite={false}/>
    </instancedMesh>
  </group>;
}
