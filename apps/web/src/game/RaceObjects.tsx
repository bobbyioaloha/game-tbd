import { useRef, useMemo, useEffect, createContext, useContext } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import { wornSurface, cargoLabel } from './scenery-materials';
import type { Texture } from 'three';
import { AirCanister, AirCanisterExhaust, BubbleWrapProtection, DeployedParachute, PackedParachute } from './SafetyItemModels';
import { obstaclePose, type ObstacleKind } from './race-course';
import { AIR_CANISTER_DURATION, type PracticeRace } from './practice-race';

const SurfaceContext=createContext<Texture|null>(null);
const LabelContext=createContext<Texture|null>(null);
function CargoLabel({position,scale=1}:{position:[number,number,number];scale?:number}){
  const map=useContext(LabelContext);
  return <mesh position={position} scale={scale}><planeGeometry args={[.72,.9]}/><meshStandardMaterial map={map} roughness={1} polygonOffset polygonOffsetFactor={-1}/></mesh>;
}
function Block({position=[0,0,0],size,color}:{position?:[number,number,number];size:[number,number,number];color:string}){
  const map=useContext(SurfaceContext);
  return <mesh position={position}><boxGeometry args={size}/><meshStandardMaterial color={color} map={map} roughness={.94}/></mesh>;
}
function ObstacleModel({kind}:{kind:ObstacleKind}){
  const surface=useContext(SurfaceContext);
  if(kind==='cone')return <group>
    <Block position={[0,-1.35,0]} size={[3,.3,3]} color="#28333b"/>
    <mesh><coneGeometry args={[1.25,2.7,8]}/><meshStandardMaterial color="#f48637" roughness={.8}/></mesh>
    <mesh position={[0,.1,0]}><cylinderGeometry args={[.43,.68,.5,8]}/><meshStandardMaterial color="#fff4d3"/></mesh>
  </group>;
  if(kind==='extinguisher')return <group>
    <mesh position={[0,-.15,0]}><cylinderGeometry args={[.7,.7,2.8,12]}/><meshStandardMaterial color="#c83f35" roughness={.65}/></mesh>
    <Block position={[0,1.4,0]} size={[.9,.2,.45]} color="#303d46"/>
    <Block position={[.75,.2,0]} size={[.18,2,.22]} color="#25323c"/>
    <Block position={[0,0,.7]} size={[.65,1,.05]} color="#fff0cd"/>
    <Block position={[0,0,.74]} size={[.12,.65,.03]} color="#c83f35"/>
    <Block position={[0,0,.74]} size={[.45,.12,.03]} color="#c83f35"/>
  </group>;
  if(kind==='barrier')return <group>
    <Block position={[0,.35,0]} size={[5,1.35,.3]} color="#ffd04b"/>
    {[-2,-1,0,1,2].map(x=><group key={x} position={[x,.35,.18]} rotation={[0,0,-.35]}><Block size={[.4,1.2,.06]} color="#283640"/></group>)}
    {[-1.9,1.9].map(x=><group key={x}><Block position={[x,-.65,0]} size={[.18,1.7,.25]} color="#bcc9c5"/><Block position={[x,-1.4,0]} size={[.6,.2,1.6]} color="#36454c"/></group>)}
  </group>;
  if(kind==='crate')return <group>
    <Block size={[3.4,3.4,3.4]} color="#9e8455"/>
    {[-1.3,1.3].map(x=><Block key={x} position={[x,0,0]} size={[.2,3.5,3.5]} color="#43545b"/>)}
    <CargoLabel position={[0,0,1.71]} scale={1.5}/>
  </group>;
  if(kind==='capsule')return <group>
    <mesh position={[0,.25,0]}><cylinderGeometry args={[.9,2,3.6,10]}/><meshStandardMaterial color="#d1d5cc" map={surface} roughness={.85}/></mesh>
    <mesh position={[0,-1.8,0]}><cylinderGeometry args={[2,1.8,.55,10]}/><meshStandardMaterial color="#394655"/></mesh>
    <mesh position={[0,.7,1.1]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.55,.55,.12,10]}/><meshStandardMaterial color="#5794b8" metalness={.3} roughness={.3}/></mesh>
    <CargoLabel position={[0,-.7,1.77]} scale={.8}/>
  </group>;
  if(kind==='duct')return <group>
    {[-6.5,6.5].map(x=><Block key={'x'+x} position={[x,0,0]} size={[1,24,14]} color="#7b8581"/>)}
    {[-6.5,6.5].map(z=><Block key={'z'+z} position={[0,0,z]} size={[12,24,1]} color="#626e6b"/>)}
    {[-11.6,11.6].flatMap(y=>[-6.5,6.5].map(x=><Block key={x+','+y} position={[x,y,0]} size={[1.2,0.7,14.2]} color="#c8ac50"/>))}
    {[-11.6,11.6].flatMap(y=>[-6.5,6.5].map(z=><Block key={z+','+y} position={[0,y,z]} size={[12,0.7,1.2]} color="#c8ac50"/>))}

  </group>;
  if(kind==='fridge')return <group>
    <CargoLabel position={[-.25,.2,1.015]} scale={1.05}/>
    {[-.88,.88].map(x=><Block key={x} position={[x,0,.94]} size={[.06,3.4,.06]} color="#807f6e"/>)}
    <Block size={[2,3.6,1.8]} color="#bcbcad"/>
    <Block position={[0,0.8,0.94]} size={[1.9,1.7,0.08]} color="#d4d2c0"/>
    <Block position={[0,-0.9,0.94]} size={[1.9,1.6,0.08]} color="#d4d2c0"/>
    <Block position={[0.65,0.65,1.05]} size={[0.12,0.8,0.12]} color="#657782"/>
    <Block position={[0.65,-0.6,1.05]} size={[0.12,0.6,0.12]} color="#657782"/>
  </group>;
  if(kind==='satellite')return <group>
    <CargoLabel position={[0,0,1.21]}/>
    <Block size={[3,.12,.12]} color="#858678"/>
    <Block size={[2.4,2.4,2.4]} color="#aa935a"/>
    {[-4,4].map(x=><group key={x} position={[x,0,0]}>
      <Block size={[5,0.3,3]} color="#293e51"/>
      {[-2,-1,0,1,2].map(line=><Block key={line} position={[line,0.17,0]} size={[0.06,0.03,3]} color="#70808a"/>)}
    </group>)}
    <mesh position={[0,2,0]} rotation={[Math.PI,0,0]}><coneGeometry args={[1.4,0.8,16,1,true]}/><meshStandardMaterial map={surface} roughness={.92} color="#f5e9bc" side={2}/></mesh>
  </group>;
  if(kind==='balloon')return <group>
    <mesh position={[0,1,0]} scale={[1,1.3,1]}><sphereGeometry args={[2,16,12]}/><meshStandardMaterial map={surface} roughness={.92} color="#e1e3d6"/></mesh>
    <Block position={[0,-2.4,0]} size={[1.2,0.8,1.2]} color="#d69c43"/>
    {[-0.5,0.5].map(x=><Block key={x} position={[x,-1.4,0]} size={[0.04,1.4,0.04]} color="#eee3ca"/>)}
  </group>;
  return <group>
    <CargoLabel position={[1.6,.7,1.215]}/>
    {[-1.8,1.8].flatMap(x=>[-.8,.8].map(z=><Block key={x+','+z} position={[x,-.6,z]} size={[.22,.5,.22]} color="#443e31"/>))}
    <Block size={[4.8,0.8,2.4]} color="#774b38"/>
    <Block position={[0,0.8,0.95]} size={[4.8,1.2,0.5]} color="#a26447"/>
    {[-2.1,2.1].map(x=><Block key={x} position={[x,0.5,0]} size={[0.6,1,2.4]} color="#a26447"/>)}
    {[-1.2,0,1.2].map(x=><Block key={x} position={[x,0.5,-0.1]} size={[1.1,0.3,1.8]} color="#b77853"/>)}
  </group>;
}
function BoostSign(){
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#103b38';ctx.fillRect(0,0,256,64);
    ctx.font='bold 34px sans-serif';ctx.textAlign='center';ctx.fillStyle='#8fffe0';ctx.fillText('FUEL +50%',128,48);
    return new CanvasTexture(canvas);
  },[]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <sprite position={[0,0,-7]} scale={[8,2,1]}><spriteMaterial map={texture} depthWrite={false}/></sprite>;
}
export function RaceObjects({race}:{race:PracticeRace}){
  const surface=useMemo(wornSurface,[]),label=useMemo(cargoLabel,[]);
  useEffect(()=>()=>{surface.dispose();label.dispose();},[surface,label]);
  const effects=useRef<Group>(null);
  const obstacles=useRef<Group>(null),boxes=useRef<Group>(null),rings=useRef<Group>(null),shots=useRef<Group>(null);
  useFrame(()=>{
    const y=race.snapshot(race.racers[0]).position[1];
    effects.current?.children.forEach((group,index)=>{
      const racer=race.racers[index],p=race.snapshot(racer).position;
      group.visible=racer.finishTime===undefined&&Math.abs(p[1]-y)<230;
      group.position.set(p[0],p[1]-y+.3,p[2]);
      const canister=group.children[0],parachute=group.children[1],wrap=group.children[2];
      const remaining=racer.airCanisterUntil-race.elapsed;
      canister.visible=remaining>0;
      const exhaust=canister.children[1];
      exhaust.scale.y=.9+.12*Math.sin((AIR_CANISTER_DURATION-remaining)*30);
      parachute.visible=race.elapsed<racer.slowUntil;
      wrap.visible=race.elapsed<racer.shieldUntil;
    });
    obstacles.current?.children.forEach((group,i)=>{
      const obstacle=race.obstacles[i],pose=obstaclePose(obstacle,race.elapsed);
      const age=obstacle.active?0:race.elapsed-obstacle.hitAt;
      group.visible=Math.abs(pose.position[1]-y)<230&&(obstacle.active||age<0.8);
      if(!group.visible)return;
      group.position.set(pose.position[0]+age*12,pose.position[1]-y,pose.position[2]);
      group.rotation.set(pose.rotation[0]+age*6,pose.rotation[1],pose.rotation[2]+age*4);
      group.scale.setScalar(obstacle.active?1:Math.max(0,1-age));
      group.traverse(child=>{
        const material=(child as Mesh).material as MeshStandardMaterial|undefined;
        if(material?.emissive)material.emissive.set(obstacle.active||age>0.18?'#000000':'#ffbd48');
      });
    });
    boxes.current?.children.forEach((group,i)=>{
      const box=race.boxes[i];group.visible=box.active&&Math.abs(box.position[1]-y)<230;
      group.position.set(box.position[0],box.position[1]-y,box.position[2]);
      group.rotation.set((box.rotation?.[0]??0)+race.elapsed*0.4,(box.rotation?.[1]??0)+race.elapsed,(box.rotation?.[2]??0.3));group.scale.setScalar(1.75);
    });
    rings.current?.children.forEach((group,i)=>{
      const ring=race.rings[i];group.visible=!ring.used.has(0)&&Math.abs(ring.position[1]-y)<230;
      group.position.set(ring.position[0],ring.position[1]-y,ring.position[2]);
      group.scale.setScalar((ring.radius??5)/5);
    });
    shots.current?.children.forEach((group,i)=>{
      const shot=race.projectiles[i];group.visible=!!shot;
      if(shot){
        group.position.set(shot.position[0],shot.position[1]-y,shot.position[2]);
        group.rotation.set(race.elapsed*4+i,race.elapsed*2,0);
      }
    });
  });
  return <>
    <group ref={effects}>{race.racers.map(racer=><group key={racer.id}>
      <group position={[1.7,.2,.4]} rotation={[0,0,-.25]} visible={false}>
        <AirCanister/>
        <group position={[0,1.1,0]}><AirCanisterExhaust/></group>
        <mesh position={[-.75,-.38,0]}><boxGeometry args={[1.15,.12,.13]}/><meshStandardMaterial color="#46544e" roughness={1}/></mesh>
      </group>
      <group visible={false}><DeployedParachute/></group>
      <group visible={false}><BubbleWrapProtection/></group>
    </group>)}</group>
    <SurfaceContext.Provider value={surface}><LabelContext.Provider value={label}><group ref={obstacles}>{race.obstacles.map(o=><group key={o.id}><ObstacleModel kind={o.kind}/></group>)}</group></LabelContext.Provider></SurfaceContext.Provider>
    <group ref={boxes}>{race.boxes.map(box=><group key={box.id}>
      <Block size={[1.5,1.5,1.5]} color="#ffe273"/>
      <Block size={[1.6,0.25,1.6]} color="#a26aff"/><Block size={[0.25,1.6,1.6]} color="#a26aff"/>
    </group>)}</group>
    <group ref={rings}>{race.rings.map(ring=><group key={ring.id}>
      <mesh rotation={[-Math.PI/2,0,0]}><torusGeometry args={[5,0.55,12,48]}/><meshStandardMaterial color={(ring.fuel??2)>2?'#ffdf75':'#6dffde'} emissive={(ring.fuel??2)>2?'#de9b18':'#19c69a'} emissiveIntensity={2}/></mesh>
      <BoostSign/>
      {[-2,0,2].map(z=><mesh key={z} position={[0,0,z]} rotation={[Math.PI,0,0]}>
        <coneGeometry args={[0.65,1.2,3]}/><meshStandardMaterial color="#d3fff1" emissive="#5effc9" emissiveIntensity={1}/>
      </mesh>)}
    </group>)}</group>
    <group ref={shots}>{Array.from({length:16},(_,i)=><group key={i} scale={1.1} visible={false}><PackedParachute/></group>)}</group>
  </>;
}
