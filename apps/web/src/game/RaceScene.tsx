import { useRef } from 'react';
import { RaceObjects } from './RaceObjects';
import { ITEM_NAMES } from './race-course';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { CloudField, StarfishDiver } from './skydiving-scenery';
import { PracticeRace, FINISH_DEPTH, RACER_COLORS } from './practice-race';

export const defaultBindings = {left:'KeyA',right:'KeyD',forward:'KeyW',backward:'KeyS',brake:'KeyK',look:'KeyI',use:'KeyJ'};
export type Action = keyof typeof defaultBindings;
export type RaceRuntime = {race:PracticeRace;keys:Set<string>;paused:boolean;bindings:typeof defaultBindings;clock:number;generation:number;fireRequested:boolean;target?:number};
export type Marker = {id:number;name:string;left:number;top:number;angle:number;edge:boolean;gap:string;locked:boolean};
export const initialRaceHud = {speed:0,depth:0,x:-7.5,z:0,brake:false,look:false,time:0,place:1,finish:null as number|null,remaining:FINISH_DEPTH,markers:[] as Marker[],allFinished:false,item:'Empty',effects:'',targetName:''};

function CrashMat() {
  return <group>
    <mesh position={[0,-1.8,0]}><boxGeometry args={[48,3.5,48]}/><meshStandardMaterial color="#ffc650" roughness={0.65}/></mesh>
    <mesh position={[0,-0.04,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[44,44]}/><meshStandardMaterial color="#f4efd9"/></mesh>
    {[14,10,6].map((radius,index) => <mesh key={radius} position={[0,0.01+index*0.01,0]} rotation={[-Math.PI/2,0,0]}>
      <ringGeometry args={[radius-2,radius,64]}/><meshStandardMaterial color={index%2 ? '#ffffff' : '#e25c61'}/>
    </mesh>)}
    {[-23,23].map(x => <mesh key={x} position={[x,0,0]}><boxGeometry args={[2,2,48]}/><meshStandardMaterial color="#f28e42"/></mesh>)}
  </group>;
}

export function RaceScene({runtime,report}:{runtime:RaceRuntime;report:(hud:typeof initialRaceHud)=>void}) {
  const racers = useRef<Group>(null), mat = useRef<Group>(null), rails = useRef<Group>(null);
  const accumulator = useRef(0), hudTime = useRef(0);
  const follow = useRef({x:-7.5,z:0,generation:-1});
  useFrame(({camera},delta) => {
    const dt = Math.min(delta,0.1);
    const held = (action:Action) => Number(runtime.keys.has(runtime.bindings[action]));
    const input = {x:(held('right')-held('left'))*(held('look') ? -1 : 1),z:held('backward')-held('forward')};
    if(runtime.paused) accumulator.current=0;
    else {
      runtime.clock+=dt;
      accumulator.current+=dt;
      while(accumulator.current>=1/120) {
        if(runtime.fireRequested) {
          runtime.race.useItem(0,!!held('look'),runtime.target);
          runtime.fireRequested=false;
        }
        runtime.race.step(1/120,input,!!held('brake'));
        accumulator.current-=1/120;
      }
    }
    const race=runtime.race, player=race.racers[0], state=race.snapshot(player);
    const [x,y,z]=state.position;
    const landed=player.finishTime!==undefined;
    const look=!!held('look')&&!landed;
    if(follow.current.generation!==runtime.generation) {
      follow.current={x,z,generation:runtime.generation}; accumulator.current=0;
    }
    if(!runtime.paused) {
      const target = (current:number,value:number) => landed ? 0 : input.x===0&&input.z===0&&runtime.target===undefined ? value : current+Math.sign(value-current)*Math.max(0,Math.abs(value-current)-5);
      const blend=1-Math.exp(-dt*3);
      follow.current.x+=(target(follow.current.x,x)-follow.current.x)*blend;
      follow.current.z+=(target(follow.current.z,z)-follow.current.z)*blend;
    }
    // A/D reverses in look-up mode to keep horizontal steering screen-relative.
    camera.up.set(0,0,-1);
    camera.position.set(follow.current.x,look ? -32 : landed ? 46 : 32,follow.current.z);
    camera.lookAt(follow.current.x,0,follow.current.z);
    camera.updateMatrixWorld();
    let aimScore=Infinity;
    runtime.target=undefined;
    for(const candidate of race.racers.slice(1)) {
      if(!race.eligibleTarget(0,candidate.id,look))continue;
      const p=race.snapshot(candidate).position;
      const projected=new Vector3(p[0],p[1]-y,p[2]).project(camera);
      const score=Math.hypot(projected.x,projected.y);
      if(projected.z>=-1&&projected.z<=1&&score<0.28&&score<aimScore){runtime.target=candidate.id;aimScore=score;}
    }
    racers.current?.children.forEach((group,index) => {
      const racer=race.racers[index], [rx,ry,rz]=race.snapshot(racer).position;
      const t=racer.finishTime===undefined ? -1 : runtime.clock-racer.finishTime;
      const bounce=t>0.15&&t<1.15 ? Math.sin((t-0.15)*Math.PI)*2.5 : 0;
      const squash=t>=0&&t<0.15 ? 0.2 : t>=1.15 ? 0.35 : 1;
      const flail=race.elapsed<racer.flailUntil;
      group.rotation.set(flail?race.elapsed*15:0,0,flail?race.elapsed*12:0);
      const protectedNow=race.elapsed<racer.immuneUntil||race.elapsed<racer.shieldUntil;
      group.visible=racer.finishTime!==undefined||!protectedNow||Math.floor(race.elapsed*12)%2===0;
      group.position.set(rx,ry-y+bounce+0.3,rz);
      group.scale.set(t>=0 ? 1.25 : 1,squash,t>=0 ? 1.25 : 1);
    });
    if(mat.current) mat.current.position.y=-FINISH_DEPTH-y;
    if(rails.current) rails.current.position.y=0;
    hudTime.current+=delta;
    if(hudTime.current>=0.05) {
      hudTime.current=0;
      const markers=race.racers.slice(1).map(racer => {
        const [rx,ry,rz]=race.snapshot(racer).position;
        const world=new Vector3(rx,ry-y+0.3,rz);
        const view=world.clone().applyMatrix4(camera.matrixWorldInverse);
        const projected=world.project(camera);
        const edge=view.z>=0 || Math.abs(projected.x)>0.85 || Math.abs(projected.y)>0.8 || projected.z>1;
        let px=projected.x,py=projected.y;
        if(view.z>=0) {px=-px;py=-py;}
        if(edge) {
          if(Math.abs(px)+Math.abs(py)<0.01) py=1;
          const scale=Math.max(Math.abs(px)/0.8,Math.abs(py)/0.75,0.001);
          px/=scale;py/=scale;
        }
        const difference=ry-y;
        return {id:racer.id,name:racer.name,left:50+px*50,top:50-py*50,angle:Math.atan2(px,py)*180/Math.PI,edge,locked:runtime.target===racer.id,
          gap:racer.finishTime!==undefined ? 'Landed' : Math.abs(difference)<1 ? 'Level' : Math.round(Math.abs(difference))+' m '+(difference>0?'above':'below')};
      });
      report({speed:state.fallSpeed,depth:-y,x,z,brake:!runtime.paused&&!landed&&!!held('brake'),look,
        time:race.elapsed,place:race.order().findIndex(r=>r.id===0)+1,finish:player.finishTime??null,
        remaining:Math.max(0,FINISH_DEPTH+y),markers,allFinished:race.finished,
        item:player.item?ITEM_NAMES[player.item]:'Empty',
        targetName:runtime.target===undefined?'':race.racers[runtime.target].name,
        effects:[
          race.elapsed<player.slowUntil?'SLOWED '+(player.slowUntil-race.elapsed).toFixed(1)+'s':'',
          race.elapsed<player.shieldUntil?'GHOST '+(player.shieldUntil-race.elapsed).toFixed(1)+'s':'',
          race.elapsed<player.boostUntil?'BOOST '+(player.boostUntil-race.elapsed).toFixed(1)+'s':'',
          race.elapsed<player.flailUntil?'FLAILING':'',
          race.elapsed<player.sunUntil?'SUN BURST':'',
        ].filter(Boolean).join(' · ')});
    }
  });
  return <>
    <color attach="background" args={['#75b8df']}/><fog attach="fog" args={['#b8ddef',80,250]}/>
    <ambientLight intensity={2}/><directionalLight position={[15,30,-10]} intensity={2.5}/>
    <group ref={racers}>{RACER_COLORS.map((color,index)=><group key={index}><StarfishDiver color={color}/></group>)}</group>
    <RaceObjects race={runtime.race}/>
    <CloudField snapshot={()=>runtime.race.snapshot(runtime.race.racers[0])}/>
    <group ref={mat}><CrashMat/></group>
    <group ref={rails}>{[-20,20].flatMap(x=>[-20,20].map(z=><mesh key={x+','+z} position={[x,0,z]}>
      <cylinderGeometry args={[0.08,0.08,300,6]}/><meshBasicMaterial color="#d5eafb" transparent opacity={0.3}/>
    </mesh>))}</group>
  </>;
}
