import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, CanvasTexture, SRGBColorSpace, type Group } from 'three';
import type { PracticeRace } from './practice-race';

// Cosmetic inspection only; the race remains the sole owner of racer movement.
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
    {[-.25,.25].map(x=><group key={x}><mesh position={[x,.55,0]}><cylinderGeometry args={[.19,.16,1.05,6]}/><meshStandardMaterial fog={false} color="#334664"/></mesh><mesh position={[x,.12,.13]}><boxGeometry args={[.4,.24,.65]}/><meshStandardMaterial fog={false} color="#443849"/></mesh></group>)}
    <mesh position={[0,1.02,0]}><cylinderGeometry args={[.38,.38,.10,6]}/><meshStandardMaterial fog={false} color="#473c46"/></mesh>
    <mesh position={[0,1.45,0]}><cylinderGeometry args={[.48,.36,1,6]}/><meshStandardMaterial fog={false} color={index===1?'#ffb638':'#c9e844'}/></mesh>
    {[-.29,.29].map(x=><mesh key={x} position={[x,1.45,.42]}><boxGeometry args={[.12,.9,.025]}/><meshStandardMaterial fog={false} color="#fff4db"/></mesh>)}
    <group ref={head} position={[0,2.15,0]}><mesh><icosahedronGeometry args={[.36,1]}/><meshStandardMaterial fog={false} color={['#c28c61','#efd0a2','#8e604a'][index]}/></mesh><mesh position={[0,.35,0]}><sphereGeometry args={[.39,10,5,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial fog={false} color="#ffe575"/></mesh><mesh position={[0,.31,.04]}><cylinderGeometry args={[.44,.44,.055,10]}/><meshStandardMaterial fog={false} color="#e9b943"/></mesh><mesh position={[0,-.04,.34]}><boxGeometry args={[.11,.12,.14]}/><meshStandardMaterial fog={false} color="#c79872"/></mesh>{[-.14,.14].map(x=><mesh key={x} position={[x,.035,.27]}><boxGeometry args={[.07,.055,.02]}/><meshBasicMaterial color="#273348"/></mesh>)}</group>
    <group ref={arm} position={[.60,1.8,0]}><mesh position={[0,-.35,0]}><cylinderGeometry args={[.17,.12,.8,6]}/><meshStandardMaterial fog={false} color="#dfb87c"/></mesh><mesh position={[-.12,-.6,.2]} rotation={[-.5,0,0]}><boxGeometry args={[.6,.75,.07]}/><meshStandardMaterial fog={false} color="#eee1b6"/></mesh></group>
    <mesh position={[-.60,1.35,0]} rotation={[0,0,-.15]}><cylinderGeometry args={[.17,.12,.9,6]}/><meshStandardMaterial fog={false} color="#dfb87c"/></mesh>
  </group>;
}
export function SafetyInspection({race,paused}:{race:PracticeRace;paused:boolean}){
  const sign=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=160;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#403957';ctx.fillRect(0,0,768,160);
    ctx.strokeStyle='#efcb79';ctx.lineWidth=8;ctx.strokeRect(4,4,760,152);
    ctx.fillStyle='#ffe9af';ctx.textAlign='center';ctx.font='bold 42px Arial';ctx.fillText('SAFETY INSPECTION',384,70);ctx.font='24px monospace';ctx.fillText('PLEASE HAVE YOUR EXCUSES READY',384,120);
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
  },[]);
  useEffect(()=>()=>sign.dispose(),[sign]);
  return <group>
    <mesh position={[10,3.5,-36.2]}><planeGeometry args={[10,2.08]}/><meshStandardMaterial fog={false} map={sign} roughness={1}/></mesh>
    <group position={[10,0,-39]}><mesh position={[0,1.3,0]}><boxGeometry args={[9,.25,2]}/><meshStandardMaterial fog={false} color="#9e663f"/></mesh>{[-3.5,3.5].map(x=><mesh key={x} position={[x,.6,0]}><boxGeometry args={[.25,1.2,1.5]}/><meshStandardMaterial fog={false} color="#5c466d"/></mesh>)}<mesh position={[0,5,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[3.1,3.1,12,3]}/><meshStandardMaterial fog={false} color="#8660a8" flatShading/></mesh>{[-5,5].map(x=><mesh key={x} position={[x,2.5,0]}><boxGeometry args={[.15,5,.15]}/><meshStandardMaterial fog={false} color="#ffe0a1"/></mesh>)}</group>
    {[-1,1].map(side=><group key={side} position={[side*19,0,-42]}>
      <mesh position={[0,.7,0]}><boxGeometry args={[2.4,1.4,1.8]}/><meshStandardMaterial fog={false} color="#b88b55"/></mesh>
      {[-.8,.8].map(x=><mesh key={x} position={[x,.7,.92]}><boxGeometry args={[.12,1.4,.06]}/><meshStandardMaterial fog={false} color="#65563d"/></mesh>)}
      <mesh position={[0,1.8,0]}><boxGeometry args={[1.5,.8,1.4]}/><meshStandardMaterial fog={false} color="#5d7b82"/></mesh>
    </group>)}
    {[0,1,2].map(index=><Inspector key={index} index={index} race={race} paused={paused}/>)}
  </group>;
}
