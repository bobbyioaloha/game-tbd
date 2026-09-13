import { useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, Color, Vector3, CanvasTexture, SRGBColorSpace, BufferGeometry, Float32BufferAttribute, CylinderGeometry, IcosahedronGeometry, type Group, type InstancedMesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sceneryNoise } from './scenery-materials';
import type { PracticeRace } from './practice-race';

function ClearingGround(){
  const geometry=useMemo(()=>{
    const positions:number[]=[],colors:number[]=[],indices:number[]=[];
    const segments=96,rings=70;
    for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++){
      const angle=i/segments*Math.PI*2,radius=ring/rings*400,x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
      const pond=Math.hypot((x-112)/46,(z+35)/65);
      const sand=radius<50+Math.sin(angle*5)*3||Math.abs(x-10)<4&&z<0&&z>-44;
      let height=-.15+sceneryNoise(x/16,z/16)*.08;
      if(radius>290)height-=Math.pow((radius-290)/110,2)*14;
      if(pond<1)height=-1.3;
      const color=new Color(pond<1?'#31bac5':pond<1.14?'#edd291':sand?'#e5c789':'#78a943');
      color.multiplyScalar(.88+sceneryNoise(x/7,z/7)*.18);
      positions.push(x,height,z);colors.push(color.r,color.g,color.b);
      if(ring<rings&&i<segments){const a=ring*(segments+1)+i,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}
    }
    const mesh=new BufferGeometry();mesh.setAttribute('position',new Float32BufferAttribute(positions,3));mesh.setAttribute('color',new Float32BufferAttribute(colors,3));mesh.setIndex(indices);mesh.computeVertexNormals();return mesh;
  },[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry}><meshStandardMaterial vertexColors roughness={1} fog={false}/></mesh>;
}
function Forest(){
  const trunks=useRef<InstancedMesh>(null),crowns=useRef<InstancedMesh>(null);
  const trees=useMemo(()=>Array.from({length:120},(_,i)=>{
    const angle=i*2.39996,radius=65+(i*37%180);
    return {x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,height:8+i%7*1.7};
  }).filter(tree=>!(tree.x>60&&tree.z<45&&tree.z>-115)),[]);
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
      dummy.position.set(tree.x,-.3,tree.z);dummy.scale.setScalar(tree.height);dummy.rotation.set(0,i*1.3,Math.sin(i)*.06);dummy.updateMatrix();
      trunks.current!.setMatrixAt(i,dummy.matrix);crowns.current!.setMatrixAt(i,dummy.matrix);
      crowns.current!.setColorAt(i,new Color(['#4d963e','#82b54d','#328768','#5c9a45','#9a7cbb'][i%5]));
    });
    trunks.current!.instanceMatrix.needsUpdate=true;crowns.current!.instanceMatrix.needsUpdate=true;
    if(crowns.current!.instanceColor)crowns.current!.instanceColor.needsUpdate=true;
    trunks.current!.computeBoundingSphere();crowns.current!.computeBoundingSphere();
  },[trees]);
  return <><instancedMesh ref={trunks} args={[geometry.trunk,undefined,trees.length]}><meshStandardMaterial color="#795036" roughness={1}/></instancedMesh>
    <instancedMesh ref={crowns} args={[geometry.crown,undefined,trees.length]}><meshStandardMaterial roughness={1} flatShading/></instancedMesh></>;
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
  return <instancedMesh ref={plants} args={[geometry,undefined,70]}><meshStandardMaterial color="#68a64e" side={2} roughness={1}/></instancedMesh>;
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
    {[-.25,.25].map(x=><group key={x}><mesh position={[x,.55,0]}><cylinderGeometry args={[.19,.16,1.05,6]}/><meshStandardMaterial color="#334664"/></mesh><mesh position={[x,.12,.13]}><boxGeometry args={[.4,.24,.65]}/><meshStandardMaterial color="#443849"/></mesh></group>)}
    <mesh position={[0,1.02,0]}><cylinderGeometry args={[.38,.38,.10,6]}/><meshStandardMaterial color="#473c46"/></mesh>
    <mesh position={[0,1.45,0]}><cylinderGeometry args={[.48,.36,1,6]}/><meshStandardMaterial color={index===1?'#ffb638':'#c9e844'}/></mesh>
    {[-.29,.29].map(x=><mesh key={x} position={[x,1.45,.42]}><boxGeometry args={[.12,.9,.025]}/><meshStandardMaterial color="#fff4db"/></mesh>)}
    <group ref={head} position={[0,2.15,0]}><mesh><icosahedronGeometry args={[.36,1]}/><meshStandardMaterial color={['#c28c61','#efd0a2','#8e604a'][index]}/></mesh><mesh position={[0,.35,0]}><sphereGeometry args={[.39,10,5,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial color="#ffe575"/></mesh><mesh position={[0,.31,.04]}><cylinderGeometry args={[.44,.44,.055,10]}/><meshStandardMaterial color="#e9b943"/></mesh><mesh position={[0,-.04,.34]}><boxGeometry args={[.11,.12,.14]}/><meshStandardMaterial color="#c79872"/></mesh>{[-.14,.14].map(x=><mesh key={x} position={[x,.035,.27]}><boxGeometry args={[.07,.055,.02]}/><meshBasicMaterial color="#273348"/></mesh>)}</group>
    <group ref={arm} position={[.60,1.8,0]}><mesh position={[0,-.35,0]}><cylinderGeometry args={[.17,.12,.8,6]}/><meshStandardMaterial color="#dfb87c"/></mesh><mesh position={[-.12,-.6,.2]} rotation={[-.5,0,0]}><boxGeometry args={[.6,.75,.07]}/><meshStandardMaterial color="#eee1b6"/></mesh></group>
    <mesh position={[-.60,1.35,0]} rotation={[0,0,-.15]}><cylinderGeometry args={[.17,.12,.9,6]}/><meshStandardMaterial color="#dfb87c"/></mesh>
  </group>;
}
export function LandingClearing({race,paused}:{race:PracticeRace;paused:boolean}){
  const sign=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=160;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#403957';ctx.fillRect(0,0,768,160);
    ctx.strokeStyle='#efcb79';ctx.lineWidth=8;ctx.strokeRect(4,4,760,152);
    ctx.fillStyle='#ffe9af';ctx.textAlign='center';ctx.font='bold 42px Arial';ctx.fillText('SAFETY INSPECTION',384,70);ctx.font='24px monospace';ctx.fillText('PLEASE HAVE YOUR EXCUSES READY',384,120);
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
  },[]);
  useEffect(()=>()=>sign.dispose(),[sign]);
  return <group>
    <ClearingGround/>
    <Forest/><FernBeds/>
    <mesh position={[10,3.5,-36.2]}><planeGeometry args={[10,2.08]}/><meshStandardMaterial map={sign} roughness={1}/></mesh>
    {Array.from({length:24},(_,i)=><mesh key={i} position={[Math.sin(i*2.4)*(52+i%4*7),.5,Math.cos(i*2.4)*(52+i%4*7)]} scale={[2+i%3,1.5,2]}><dodecahedronGeometry args={[1,0]}/><meshStandardMaterial color={i%2?'#9b81b9':'#dbb486'} flatShading/></mesh>)}
    <group position={[10,0,-39]}><mesh position={[0,1.3,0]}><boxGeometry args={[9,.25,2]}/><meshStandardMaterial color="#9e663f"/></mesh>{[-3.5,3.5].map(x=><mesh key={x} position={[x,.6,0]}><boxGeometry args={[.25,1.2,1.5]}/><meshStandardMaterial color="#5c466d"/></mesh>)}<mesh position={[0,5,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[3.1,3.1,12,3]}/><meshStandardMaterial color="#8660a8" flatShading/></mesh>{[-5,5].map(x=><mesh key={x} position={[x,2.5,0]}><boxGeometry args={[.15,5,.15]}/><meshStandardMaterial color="#ffe0a1"/></mesh>)}</group>
    {[-1,1].map(side=><group key={side} position={[side*19,0,-42]}>
      <mesh position={[0,.7,0]}><boxGeometry args={[2.4,1.4,1.8]}/><meshStandardMaterial color="#b88b55"/></mesh>
      {[-.8,.8].map(x=><mesh key={x} position={[x,.7,.92]}><boxGeometry args={[.12,1.4,.06]}/><meshStandardMaterial color="#65563d"/></mesh>)}
      <mesh position={[0,1.8,0]}><boxGeometry args={[1.5,.8,1.4]}/><meshStandardMaterial color="#5d7b82"/></mesh>
    </group>)}
    {[0,1,2].map(index=><Inspector key={index} index={index} race={race} paused={paused}/>)}
  </group>;
}
