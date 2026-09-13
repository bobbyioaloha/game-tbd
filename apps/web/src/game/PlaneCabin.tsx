import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

function Panel({position,size,color='#526976',rotation=[0,0,0]}:{position:[number,number,number];size:[number,number,number];color?:string;rotation?:[number,number,number]}){
  return <mesh position={position} rotation={rotation}><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.8}/></mesh>;
}
export function PlaneCabin(){
  const sign=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#203641';ctx.fillRect(0,0,1024,128);
    ctx.strokeStyle='#e5bd52';ctx.lineWidth=8;ctx.strokeRect(4,4,1016,120);
    ctx.fillStyle='#ffe5a1';ctx.font='bold 48px monospace';ctx.textAlign='center';ctx.fillText('STAND BY • MANDATORY DESCENT',512,80);
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
  },[]);
  useEffect(()=>()=>sign.dispose(),[sign]);
  return <group>
    <Panel position={[0,-.15,-1]} size={[11,.3,20]} color="#485760"/>
    {[-3.6,-1.8,0,1.8,3.6].map(x=><Panel key={x} position={[x,.012,-1]} size={[.025,.025,19]} color="#8f9c9d"/>)}
    {Array.from({length:10},(_,i)=><Panel key={i} position={[0,.018,-9+i*1.8]} size={[10,.025,.025]} color="#283e49"/>)}
    {[-1.7,1.7].map(x=><Panel key={x} position={[x,.025,-1]} size={[.09,.03,18]} color="#e5bd52"/>)}
    {[-1,1].map(side=><group key={side}>
      <Panel position={[side*5,2,-1]} size={[.25,4,20]}/>
      <Panel position={[side*4.4,4.1,-1]} size={[1.8,.18,20]} rotation={[0,0,side*-.6]} color="#526575"/>
      {[-7,-4,-1,2,5].map(z=><group key={z}>
        <Panel position={[side*4.82,2.65,z]} size={[.08,1.15,1.55]} color="#253c4a"/>
        <Panel position={[side*4.76,2.65,z]} size={[.08,.86,1.2]} color="#aadbf3"/>
        <Panel position={[side*4.6,2,z+1.05]} size={[.12,3.8,.12]} color="#879598"/>
        <Panel position={[side*4.0,.65,z]} size={[1.3,.18,1.7]} color="#84634c"/>
        <Panel position={[side*4.55,1.15,z]} size={[.18,.9,1.7]} color="#aa7957"/>
        <Panel position={[side*4,.3,z]} size={[.12,.6,1.5]} color="#293c46"/>
        <Panel position={[side*4.40,1.25,z]} size={[.08,.8,.10]} color="#25323b"/>
      </group>)}
      <Panel position={[side*3.5,4.38,-1]} size={[.3,.06,15]} color="#ffe1a1"/>
    </group>)}
    <Panel position={[0,4.7,-1]} size={[7.7,.2,20]} color="#394e60"/>
    <Panel position={[-3.7,2.2,-9.5]} size={[3,4.4,.25]} color="#627881"/>
    <Panel position={[3.7,2.2,-9.5]} size={[3,4.4,.25]} color="#627881"/>
    <Panel position={[0,4,-9.5]} size={[5,1.4,.25]} color="#627881"/>
    <mesh position={[0,3.75,-9.32]}><planeGeometry args={[5,.625]}/><meshBasicMaterial map={sign}/></mesh>
    <mesh position={[0,1.5,-12]}><planeGeometry args={[8,6]}/><meshBasicMaterial color="#9bd4f4"/></mesh>
    <Panel position={[0,-.3,-10.8]} size={[4,.2,3.4]} rotation={[-.12,0,0]} color="#6c7780"/>
    {[-2.3,2.3].map(x=><mesh key={x} position={[x,3.0,-9.25]}><sphereGeometry args={[.12,8,6]}/><meshBasicMaterial color="#efae45"/></mesh>)}
    <pointLight position={[-2,3,3]} color="#ffdab0" intensity={28} distance={14}/>
    <pointLight position={[0,3,-8]} color="#bce8ff" intensity={32} distance={16}/>
  </group>;
}
