import { useEffect, useMemo } from 'react';
import { BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, SphereGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Authored safety equipment is presentation only; it never defines contact bounds.
export function PackedParachute(){
  return <group>
    <mesh><boxGeometry args={[.95,.6,1.2]}/><meshStandardMaterial color="#b99543" roughness={1}/></mesh>
    {[-.31,.31].map(x=><mesh key={x} position={[x,0,0]}><boxGeometry args={[.12,.65,1.25]}/><meshStandardMaterial color="#303d40" roughness={1}/></mesh>)}
    <mesh position={[0,.34,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.37,.48]}/><meshStandardMaterial color="#eee5cd" roughness={1}/></mesh>
    <mesh position={[.49,.12,.2]} rotation={[0,Math.PI/2,0]}><torusGeometry args={[.16,.045,5,8]}/><meshStandardMaterial color="#e6c54f" roughness={.8}/></mesh>
  </group>;
}

export function DeployedParachute(){
  const lines=useMemo(()=>{
    const positions:number[]=[];
    for(const x of [-1,1])for(const z of [-1,1])positions.push(x*.55,0,z*.35,x*1.85,3.3,2.7+z*1.85);
    return new BufferGeometry().setAttribute('position',new Float32BufferAttribute(positions,3));
  },[]);
  useEffect(()=>()=>lines.dispose(),[lines]);
  return <group>
    <lineSegments geometry={lines}><lineBasicMaterial color="#ddd5ba"/></lineSegments>
    <group position={[0,3.3,2.7]} scale={[1,.4,1]}>
      {Array.from({length:8},(_,i)=><mesh key={i}>
        <sphereGeometry args={[2.65,4,5,i*Math.PI/4,Math.PI/4,0,Math.PI/2]}/>
        <meshStandardMaterial color={i%2?'#e3dcc3':'#b59445'} roughness={1} side={DoubleSide} flatShading/>
      </mesh>)}
    </group>
    <mesh position={[0,3.3,2.7]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[2.65,.045,4,24]}/><meshStandardMaterial color="#5b6259" roughness={1}/></mesh>
    <group position={[0,.1,0]} scale={.65}><PackedParachute/></group>
  </group>;
}

export function BubbleWrapProtection(){
  const bubbles=useMemo(()=>{
    const cells:SphereGeometry[]=[];
    // Small flattened pockets sit on a single sheet, leaving head and tail clear.
    for(let row=0;row<5;row++)for(let column=0;column<16;column++){
      const angle=column*Math.PI/8+(row%2)*Math.PI/16;
      const cell=new SphereGeometry(.26,8,4);
      cell.scale(1,.38,1);
      cell.rotateZ(angle-Math.PI/2);
      cell.translate(Math.cos(angle)*1.6,.25+Math.sin(angle)*1.05,(row-2)*.53);
      cells.push(cell);
    }
    const geometry=mergeGeometries(cells)!;
    cells.forEach(cell=>cell.dispose());
    return geometry;
  },[]);
  const sleeve=useMemo(()=>{
    const geometry=new CylinderGeometry(1,1,2.75,20,1,true);
    geometry.rotateX(Math.PI/2);
    geometry.scale(1.6,1.05,1);
    geometry.translate(0,.25,0);
    return geometry;
  },[]);
  useEffect(()=>()=>{bubbles.dispose();sleeve.dispose();},[bubbles,sleeve]);
  return <group>
    <mesh geometry={sleeve}><meshStandardMaterial color="#bfd6cc" transparent opacity={.12} depthWrite={false} roughness={.55} side={DoubleSide}/></mesh>
    <mesh geometry={bubbles}><meshStandardMaterial color="#d7e6df" transparent opacity={.38} depthWrite={false} roughness={.5}/></mesh>
    {[-1.35,1.35].map(z=><mesh key={z} position={[0,.25,z]} rotation={[Math.PI/2,0,0]} scale={[1.6,1.05,1]}>
      <torusGeometry args={[1,.055,4,16]}/><meshStandardMaterial color="#ddd3b2" roughness={1}/>
    </mesh>)}
    <mesh position={[0,1.4,-.5]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.85,.43]}/><meshStandardMaterial color="#c8aa57" roughness={1}/></mesh>
    {[-.2,0,.2].map(x=><mesh key={x} position={[x,1.405,-.5]} rotation={[-Math.PI/2,0,.25]}>
      <planeGeometry args={[.055,.31]}/><meshStandardMaterial color="#4a4e43" roughness={1}/>
    </mesh>)}
  </group>;
}

export function AirCanister(){
  return <group>
    <mesh><cylinderGeometry args={[.48,.48,1.25,10]}/><meshStandardMaterial color="#c9ad50" roughness={.88}/></mesh>
    {[-.6,.6].map(y=><mesh key={y} position={[0,y,0]}><cylinderGeometry args={[.49,.49,.12,10]}/><meshStandardMaterial color="#53605c" roughness={.82}/></mesh>)}
    <mesh position={[0,.76,0]}><cylinderGeometry args={[.14,.19,.26,8]}/><meshStandardMaterial color="#525e5a" roughness={.7}/></mesh>
    <mesh position={[0,.95,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.25,.055,5,8]}/><meshStandardMaterial color="#863d35" roughness={.9}/></mesh>
    <mesh position={[.29,.72,0]} rotation={[0,0,-Math.PI/4]}><cylinderGeometry args={[.19,.19,.1,10]}/><meshStandardMaterial color="#e6dfcb" roughness={.8}/></mesh>
    <mesh position={[.3,.8,0]} rotation={[0,0,-.9]}><boxGeometry args={[.025,.025,.23]}/><meshStandardMaterial color="#394841"/></mesh>
    <mesh position={[0,0,.487]}><planeGeometry args={[.52,.64]}/><meshStandardMaterial color="#e8e0c4" roughness={1}/></mesh>
    <mesh position={[0,0,.491]}><boxGeometry args={[.09,.39,.006]}/><meshStandardMaterial color="#3d504b" roughness={1}/></mesh>
    {[-.38,.38].map(y=><mesh key={y} position={[0,y,0]}><cylinderGeometry args={[.49,.49,.09,10]}/><meshStandardMaterial color="#46544e" roughness={1}/></mesh>)}
  </group>;
}

export function AirCanisterExhaust(){
  return <group>
    <mesh position={[0,1,0]}><cylinderGeometry args={[.5,.035,2,7,1,true]}/><meshBasicMaterial color="#d9e6dc" transparent opacity={.25} depthWrite={false} side={DoubleSide}/></mesh>
    <mesh position={[0,.45,0]}><cylinderGeometry args={[.2,.025,.9,7,1,true]}/><meshBasicMaterial color="#f0f2e5" transparent opacity={.55} depthWrite={false} side={DoubleSide}/></mesh>
    {[-1,1].map(side=><mesh key={side} position={[side*.28,1.3,side*.15]} scale={[.25,.55,.25]}>
      <octahedronGeometry args={[1,0]}/><meshBasicMaterial color="#d9e6dc" transparent opacity={.2} depthWrite={false}/>
    </mesh>)}
  </group>;
}
