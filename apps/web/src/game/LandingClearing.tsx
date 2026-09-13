import { useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, Color, Vector3, type Group, type InstancedMesh } from 'three';
import type { PracticeRace } from './practice-race';

function Forest(){
  const trunks=useRef<InstancedMesh>(null),crowns=useRef<InstancedMesh>(null);
  const trees=useMemo(()=>Array.from({length:120},(_,i)=>{
    const angle=i*2.39996,radius=65+(i*37%180);
    return {x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,height:7+i%7*1.5};
  }).filter(tree=>!(tree.x>65&&tree.z<35&&tree.z>-95)),[]);
  useLayoutEffect(()=>{
    const dummy=new Object3D();
    trees.forEach((tree,i)=>{
      dummy.position.set(tree.x,tree.height*.4-1,tree.z);dummy.scale.set(.65,tree.height*.8,.65);dummy.updateMatrix();trunks.current!.setMatrixAt(i,dummy.matrix);
      dummy.position.y=tree.height*.8;dummy.scale.set(tree.height*.38,tree.height*.6,tree.height*.38);dummy.rotation.y=i;dummy.updateMatrix();crowns.current!.setMatrixAt(i,dummy.matrix);
      crowns.current!.setColorAt(i,new Color(['#49a844','#73bc42','#247d69','#9574c8'][i%4]));
    });
    trunks.current!.instanceMatrix.needsUpdate=true;crowns.current!.instanceMatrix.needsUpdate=true;
    if(crowns.current!.instanceColor)crowns.current!.instanceColor.needsUpdate=true;
  },[trees]);
  return <><instancedMesh ref={trunks} args={[undefined,undefined,trees.length]}><cylinderGeometry args={[.6,.9,1,6]}/><meshStandardMaterial color="#975a3c" roughness={1}/></instancedMesh>
    <instancedMesh ref={crowns} args={[undefined,undefined,trees.length]}><icosahedronGeometry args={[1,1]}/><meshStandardMaterial roughness={1}/></instancedMesh></>;
}
function Inspector({index,race,paused}:{index:number;race:PracticeRace;paused:boolean}){
  const inspectionTime=useRef(0);
  const target=useMemo(()=>new Vector3(),[]);
  const person=useRef<Group>(null),head=useRef<Group>(null),arm=useRef<Group>(null);
  useFrame((_,delta)=>{
    if(!person.current||paused)return;
    const player=race.racers[0],landed=player.finishTime!==undefined,p=race.snapshot(player).position;
    const x=landed?p[0]+(index-1)*3.2:10+(index-1)*3.2,z=landed?p[2]-5:-36;
    target.set(x,0,z);person.current.position.lerp(target,1-Math.exp(-delta*1.8));
    person.current.rotation.y=landed?Math.atan2(p[0]-person.current.position.x,p[2]-person.current.position.z):0;
    inspectionTime.current+=Math.min(delta,.1);
    const time=inspectionTime.current;
    if(head.current)head.current.rotation.x=.12+Math.sin(time*3+index)*.08;
    if(arm.current)arm.current.rotation.x=-.55+Math.sin(time*5+index)*.12;
  });
  return <group ref={person} position={[10+(index-1)*3.2,0,-36]} scale={1.15}>
    {[-.25,.25].map(x=><group key={x}><mesh position={[x,.55,0]}><boxGeometry args={[.32,1.05,.36]}/><meshStandardMaterial color="#334664"/></mesh><mesh position={[x,.12,.13]}><boxGeometry args={[.4,.24,.65]}/><meshStandardMaterial color="#443849"/></mesh></group>)}
    <mesh position={[0,1.45,0]}><boxGeometry args={[1,1,.52]}/><meshStandardMaterial color={index===1?'#ffb638':'#c9e844'}/></mesh>
    {[-.29,.29].map(x=><mesh key={x} position={[x,1.45,.27]}><boxGeometry args={[.12,.9,.025]}/><meshStandardMaterial color="#fff4db"/></mesh>)}
    <group ref={head} position={[0,2.15,0]}><mesh><boxGeometry args={[.57,.59,.52]}/><meshStandardMaterial color={['#c28c61','#efd0a2','#8e604a'][index]}/></mesh><mesh position={[0,.35,0]}><cylinderGeometry args={[.38,.43,.22,8]}/><meshStandardMaterial color="#ffe575"/></mesh>{[-.14,.14].map(x=><mesh key={x} position={[x,.035,.27]}><boxGeometry args={[.07,.055,.02]}/><meshBasicMaterial color="#273348"/></mesh>)}</group>
    <group ref={arm} position={[.60,1.8,0]}><mesh position={[0,-.35,0]}><boxGeometry args={[.25,.8,.3]}/><meshStandardMaterial color="#dfb87c"/></mesh><mesh position={[-.12,-.6,.2]} rotation={[-.5,0,0]}><boxGeometry args={[.6,.75,.07]}/><meshStandardMaterial color="#eee1b6"/></mesh></group>
    <mesh position={[-.60,1.35,0]} rotation={[0,0,-.15]}><boxGeometry args={[.25,.9,.3]}/><meshStandardMaterial color="#dfb87c"/></mesh>
  </group>;
}
export function LandingClearing({race,paused}:{race:PracticeRace;paused:boolean}){
  return <group>
    <mesh position={[0,-1.1,0]}><cylinderGeometry args={[115,118,2,64]}/><meshStandardMaterial color="#89bf4d" roughness={1}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.075,0]}><circleGeometry args={[48,48]}/><meshStandardMaterial color="#edc879" roughness={1}/></mesh>
    <mesh position={[113,-.25,-35]} rotation={[-Math.PI/2,0,0]} scale={[1,1.5,1]}><circleGeometry args={[42,48]}/><meshStandardMaterial color="#30c8cc" roughness={.22} metalness={.15}/></mesh>
    <mesh position={[113,-.3,-35]} rotation={[-Math.PI/2,0,0]} scale={[1,1.5,1]}><ringGeometry args={[42,48,48]}/><meshStandardMaterial color="#f3d698"/></mesh>
    <Forest/>
    {Array.from({length:24},(_,i)=><mesh key={i} position={[Math.sin(i*2.4)*(52+i%4*7),.5,Math.cos(i*2.4)*(52+i%4*7)]} scale={[2+i%3,1.5,2]}><dodecahedronGeometry args={[1,0]}/><meshStandardMaterial color={i%2?'#9b81b9':'#dbb486'} flatShading/></mesh>)}
    <group position={[10,0,-39]}><mesh position={[0,1.3,0]}><boxGeometry args={[9,.25,2]}/><meshStandardMaterial color="#9e663f"/></mesh>{[-3.5,3.5].map(x=><mesh key={x} position={[x,.6,0]}><boxGeometry args={[.25,1.2,1.5]}/><meshStandardMaterial color="#5c466d"/></mesh>)}<mesh position={[0,5,0]}><boxGeometry args={[12,.4,5]}/><meshStandardMaterial color="#aa75d5"/></mesh>{[-5,5].map(x=><mesh key={x} position={[x,2.5,0]}><boxGeometry args={[.15,5,.15]}/><meshStandardMaterial color="#ffe0a1"/></mesh>)}</group>
    {[0,1,2].map(index=><Inspector key={index} index={index} race={race} paused={paused}/>)}
  </group>;
}
