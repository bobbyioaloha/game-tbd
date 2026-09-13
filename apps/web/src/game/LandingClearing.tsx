import { SafetyInspection } from './SafetyInspection';
import type { PracticeRace } from './practice-race';
import { useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { Object3D, Color, BufferGeometry, Float32BufferAttribute, CylinderGeometry, IcosahedronGeometry, type InstancedMesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sceneryNoise } from './scenery-materials';
import { seededRandom } from './race-course';
import { landingTerrain } from './landing-terrain';

function ClearingGround(){
  const geometry=useMemo(()=>{
    const positions:number[]=[],colors:number[]=[],indices:number[]=[];
    const segments=96,rings=70;
    for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++){
      const angle=i/segments*Math.PI*2,radius=ring/rings*400,x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
      const sample=landingTerrain(x,z),height=Math.max(Math.abs(x),Math.abs(z))<44?-2:sample.height;
      const color=new Color(sample.river<48?'#5599b6':sample.river<65?'#b9b190':radius<58?'#909f77':'#638557');
      color.multiplyScalar(.88+sceneryNoise(x/7,z/7)*.18);
      positions.push(x,height,z);colors.push(color.r,color.g,color.b);
      if(ring<rings&&i<segments){const a=ring*(segments+1)+i,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}
    }
    const mesh=new BufferGeometry();mesh.setAttribute('position',new Float32BufferAttribute(positions,3));mesh.setAttribute('color',new Float32BufferAttribute(colors,3));mesh.setIndex(indices);mesh.computeVertexNormals();return mesh;
  },[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry}><meshStandardMaterial fog={false} vertexColors roughness={1}/></mesh>;
}
function Forest(){
  const trunks=useRef<InstancedMesh>(null),crowns=useRef<InstancedMesh>(null);
  const trees=useMemo(()=>{
    const random=seededRandom(737);
    return Array.from({length:3500},()=>{
      const angle=random()*Math.PI*2,radius=65+Math.sqrt(random())*2300;
      return {x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,height:16+random()*22};
    }).filter(tree=>landingTerrain(tree.x,tree.z).river>75);
  },[]);
  const geometry=useMemo(()=>{
    const wood=[new CylinderGeometry(.065,.13,1,7).translate(0,.5,0)];
    const leaves=[];
    for(let branch=0;branch<5;branch++){
      const angle=branch*2.4,x=Math.sin(angle),z=Math.cos(angle),y=.62+branch*.075;
      wood.push(new CylinderGeometry(.025,.055,.48,5).rotateZ(-.9).rotateY(-angle).translate(x*.13,y-.05,z*.13));
      leaves.push(new IcosahedronGeometry(1,1).scale(.30,.14,.30).rotateY(angle).translate(x*.23,y+.08,z*.23));
    }
    leaves.push(new IcosahedronGeometry(1,0).scale(.24,.22,.24).translate(0,1.12,0));
    const trunk=mergeGeometries(wood),crown=mergeGeometries(leaves);
    wood.forEach(g=>g.dispose());leaves.forEach(g=>g.dispose());return {trunk,crown};
  },[]);
  useEffect(()=>()=>{geometry.trunk.dispose();geometry.crown.dispose();},[geometry]);
  useLayoutEffect(()=>{
    const dummy=new Object3D();
    trees.forEach((tree,i)=>{
      dummy.position.set(tree.x,landingTerrain(tree.x,tree.z).height,tree.z);dummy.scale.setScalar(tree.height);dummy.rotation.set(0,i*1.3,Math.sin(i)*.06);dummy.updateMatrix();
      trunks.current!.setMatrixAt(i,dummy.matrix);crowns.current!.setMatrixAt(i,dummy.matrix);
      crowns.current!.setColorAt(i,new Color(['#416b48','#6f9253','#447361','#577a48','#7b9058'][i%5]));
    });
    trunks.current!.instanceMatrix.needsUpdate=true;crowns.current!.instanceMatrix.needsUpdate=true;
    if(crowns.current!.instanceColor)crowns.current!.instanceColor.needsUpdate=true;
    trunks.current!.computeBoundingSphere();crowns.current!.computeBoundingSphere();
  },[trees]);
  return <><instancedMesh ref={trunks} args={[geometry.trunk,undefined,trees.length]}><meshStandardMaterial fog={false} color="#795036" roughness={1}/></instancedMesh>
    <instancedMesh ref={crowns} args={[geometry.crown,undefined,trees.length]}><meshStandardMaterial fog={false} roughness={1} flatShading/></instancedMesh></>;
}
function FernBeds(){
  const plants=useRef<InstancedMesh>(null);
  const geometry=useMemo(()=>{
    const points:number[]=[];
    for(let leaf=0;leaf<9;leaf++){
      const a=leaf*Math.PI*2/9,dx=Math.cos(a),dz=Math.sin(a),length=1.4+leaf%3*.25;
      const root=[0,0,0],mid=[dx*.7,.7,dz*.7],tip=[dx*length,.25,dz*length];
      for(let side of [-1,1])points.push(...root,mid[0]-dz*.22*side,mid[1],mid[2]+dx*.22*side,...tip);
    }
    const mesh=new BufferGeometry();mesh.setAttribute('position',new Float32BufferAttribute(points,3));mesh.computeVertexNormals();return mesh;
  },[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useLayoutEffect(()=>{
    const dummy=new Object3D();
    for(let i=0;i<70;i++){
      const a=i*2.4,r=55+i%8*5;
      dummy.position.set(Math.cos(a)*r,0,Math.sin(a)*r);dummy.scale.setScalar(1+i%3*.4);dummy.rotation.y=i;dummy.updateMatrix();plants.current!.setMatrixAt(i,dummy.matrix);
      plants.current!.setColorAt(i,new Color(i%3?'#428a3f':'#a0be51'));
    }
    plants.current!.instanceMatrix.needsUpdate=true;plants.current!.instanceColor!.needsUpdate=true;plants.current!.computeBoundingSphere();
  },[]);
  return <instancedMesh ref={plants} args={[geometry,undefined,70]}><meshStandardMaterial fog={false} color="#68a64e" side={2} roughness={1}/></instancedMesh>;
}
// One non-overlapping colored surface keeps the target readable from altitude.
function LandingTarget(){
  const geometry=useMemo(()=>{
    const edges=[-42,-15,-6,6,15,42],positions:number[]=[],colors:number[]=[];
    for(let x=0;x<5;x++)for(let z=0;z<5;z++){
      const color=new Color(x===0||x===4||z===0||z===4?'#d8d7c8':x===2&&z===2?'#ede8d6':'#737e87');
      for(const [a,b] of [[x,z],[x,z+1],[x+1,z],[x+1,z],[x,z+1],[x+1,z+1]]){
        positions.push(edges[a],0,edges[b]);colors.push(color.r,color.g,color.b);
      }
    }
    const mesh=new BufferGeometry();mesh.setAttribute('position',new Float32BufferAttribute(positions,3));
    mesh.setAttribute('color',new Float32BufferAttribute(colors,3));mesh.computeVertexNormals();return mesh;
  },[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry}><meshStandardMaterial fog={false} vertexColors roughness={1}/></mesh>;
}
// The target is visual only; the existing lane-wide finish plane remains authoritative.
export function LandingClearing({race,paused}:{race:PracticeRace;paused:boolean}){
  return <group>
    <ClearingGround/><Forest/><FernBeds/><LandingTarget/>
    <SafetyInspection race={race} paused={paused}/>
    {[-43,43].flatMap(x=>[-43,43].map(z=><mesh key={x+','+z} position={[x,.3,z]}><boxGeometry args={[1,.6,1]}/><meshStandardMaterial fog={false} color="#ffcf4b" emissive="#ffbf32" emissiveIntensity={.3}/></mesh>))}
  </group>;
}
