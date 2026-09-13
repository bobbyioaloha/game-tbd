import { encounterKind } from '@sky/shared';
import { LandingClearing } from './LandingClearing';
import { PrehistoricEarth } from './PrehistoricEarth';
import { DinosaurModel } from './GregModel';
import { followCameraAxis } from './camera-follow';
import { projectRivalMarker } from './rival-marker';
import { RaceCreations } from './RaceCreationVisuals';
import type { RaceEventHost } from './race-event-host';
import { useRef, useState } from 'react';
import { TargetLock } from './target-lock';
import type { Item } from './race-course';
import { RaceObjects } from './RaceObjects';
import { ITEM_NAMES } from './race-course';
import { useFrame } from '@react-three/fiber';
import { Vector3, PerspectiveCamera, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import { CloudField, StarfishDiver } from './skydiving-scenery';
import { PracticeRace, FINISH_DEPTH, LANE_HALF_WIDTH } from './practice-race';

const eventAuraColors={gravityWell:'#bb8cff',debrisShower:'#ffb94b',repulsionBurst:'#ff8555',protectiveZone:'#6dffff',stampede:'#ffbe55',rapids:'#62e9eb'};

export const defaultBindings = {left:'KeyA',right:'KeyD',forward:'KeyW',backward:'KeyS',brake:'KeyK',look:'KeyI',use:'KeyJ',boost:'KeyU',dodge:'KeyL'};
export type Action = keyof typeof defaultBindings;
export type RaceRuntime = {race:PracticeRace;voice?:RaceEventHost;keys:Set<string>;paused:boolean;bindings:typeof defaultBindings;clock:number;generation:number;fireRequested:boolean;dodgeRequested:boolean;target?:number};
export type Marker = {id:number;name:string;color:string;left:number;top:number;angle:number;edge:boolean;gap:string;locked:boolean;selected:boolean;progress:number};
export const initialRaceHud = {incidents:0,creationMarker:null as {left:number;top:number;angle:number;edge:boolean;name:string;gap:string}|null,speed:0,depth:0,x:-7.5,z:0,brake:false,look:false,time:0,place:1,finish:null as number|null,remaining:FINISH_DEPTH,markers:[] as Marker[],allFinished:false,item:'Empty',effects:'',targetName:'',itemKey:null as Item|null,feedback:'',boost:false,fuel:0,dodgeCooldown:0,threat:'',threatAngle:0,threatDistance:'',standings:new PracticeRace(false).standings()};

function RacerDinosaur({racer,race}:{racer:PracticeRace['racers'][number];race:PracticeRace}){
  const [landed,setLanded]=useState(racer.finishTime!==undefined);
  useFrame(()=>{const next=racer.finishTime!==undefined;if(next!==landed)setLanded(next);});
  return racer.model?<group position={[0,landed?0:-1.35,0]} rotation={[0,Math.PI,0]}>
    <DinosaurModel character={racer.model} pose={landed?'Stand':'Dive'} time={()=>landed?0:race.elapsed} wind={landed?undefined:()=>({time:race.elapsed,speed:race.snapshot(racer).fallSpeed})}/>
  </group>:null;
}

export function RaceScene({runtime,report}:{runtime:RaceRuntime;report:(hud:typeof initialRaceHud)=>void}) {
  const racers = useRef<Group>(null), mat = useRef<Group>(null), rails = useRef<Group>(null);
  const lock=useRef(new TargetLock());
  const accumulator = useRef(0), hudTime = useRef(0);
  const follow = useRef({x:-7.5,z:0,generation:-1});
  useFrame(({camera},delta) => {
    // Reset frame state before the new run consumes simulation time.
    if(follow.current.generation!==runtime.generation) {
      const [x,,z]=runtime.race.snapshot(runtime.race.racers[0]).position;
      follow.current={x,z,generation:runtime.generation};
      if(camera instanceof PerspectiveCamera)camera.fov=65;
      accumulator.current=0;hudTime.current=0;lock.current.reset();runtime.target=undefined;
    }
    const dt = Math.min(delta,0.1);
    const held = (action:Action) => Number(runtime.keys.has(runtime.bindings[action]));
    const input = {x:(held('right')-held('left'))*(held('look') ? -1 : 1),z:held('backward')-held('forward')};
    if(runtime.paused){accumulator.current=0;lock.current.reset();runtime.target=undefined;}
    else {
      runtime.clock+=dt;
      accumulator.current+=dt;
      while(accumulator.current>=1/120) {
        const before=runtime.race.snapshot(runtime.race.racers[0]).position;
        if(runtime.dodgeRequested){runtime.race.dodge(0,input);runtime.dodgeRequested=false;}
        runtime.race.step(1/120,input,!!held('brake'),!!held('boost'));
        const segment=runtime.race.movementSegments.find(item=>item.id==='0');
        runtime.voice?.step(1/120,segment?[...segment.from]:before,segment?[...segment.to]:runtime.race.snapshot(runtime.race.racers[0]).position);
        accumulator.current-=1/120;
      }
    }
    const race=runtime.race, player=race.racers[0], state=race.snapshot(player);
    const [x,y,z]=state.position;
    const landed=player.finishTime!==undefined;
    const look=!!held('look')&&!landed;
    if(!runtime.paused) {
      follow.current.x=followCameraAxis(follow.current.x,landed?0:x,dt);
      follow.current.z=followCameraAxis(follow.current.z,landed?0:z,dt);
    }
    const eventState=race.events?.getSnapshot();
    const affected=eventState?.phase==='active'&&eventState.affectedRacerIds.includes('0');
    if(camera instanceof PerspectiveCamera) {
      const extra=affected?(eventState.instance&&encounterKind(eventState.instance.spec)==='protectiveZone'?13:8):0;
      if(!runtime.paused)camera.fov+=((landed?55:65)+extra-camera.fov)*(1-Math.exp(-dt*7));
      camera.near=landed?1:2;camera.far=30000;
      camera.updateProjectionMatrix();
    }
    // A/D reverses in look-up mode to keep horizontal steering screen-relative.
    camera.up.set(0,0,-1);
    if(landed){camera.up.set(0,1,0);camera.position.set(x+10,7.5,z+13);camera.lookAt(x,1.8,z-2);}
    else{camera.position.set(follow.current.x,look?-16:16,follow.current.z);camera.lookAt(follow.current.x,0,follow.current.z);}
    camera.updateMatrixWorld();
    let aimScore=Infinity;
    let candidateId:number|undefined;
    for(const candidate of race.racers.slice(1)) {
      if(!race.eligibleTarget(0,candidate.id,look))continue;
      const p=race.snapshot(candidate).position;
      const projected=new Vector3(p[0],p[1]-y,p[2]).project(camera);
      const score=Math.hypot(projected.x,projected.y);
      const threshold=lock.current.target===candidate.id?0.48:0.36;
      const priority=score-(lock.current.target===candidate.id?0.2:0);
      if(projected.z>=-1&&projected.z<=1&&score<threshold&&priority<aimScore){candidateId=candidate.id;aimScore=priority;}
    }
    const eligible=lock.current.target===undefined||race.eligibleTarget(0,lock.current.target,look);
    if(!runtime.paused&&!landed&&player.item==='umbrella'){
      runtime.target=lock.current.update(candidateId,dt,look,eligible);
    }else{lock.current.reset();runtime.target=undefined;}
    if(runtime.fireRequested&&!runtime.paused){
      race.useItem(0,look,runtime.target);
      runtime.fireRequested=false;
      lock.current.reset();runtime.target=undefined;
    }
    racers.current?.children.forEach((group,index) => {
      const racer=race.racers[index], [rx,ry,rz]=race.snapshot(racer).position;
      const t=racer.finishTime===undefined ? -1 : runtime.clock-racer.finishTime;
      const bounce=t>0.15&&t<1.15 ? Math.sin((t-0.15)*Math.PI)*2.5 : 0;
      const squash=t>=0&&t<0.15 ? 0.2 : 1;
      const flail=racer.finishTime===undefined&&race.elapsed<racer.flailUntil;
      group.rotation.set(flail?race.elapsed*15:racer.id===0&&!runtime.paused?input.z*0.16:0,0,flail?race.elapsed*12:racer.id===0&&!runtime.paused?-input.x*0.16:0);
      if(race.elapsed<racer.dodgeUntil){
        const roll=(1-(racer.dodgeUntil-race.elapsed)/0.35)*Math.PI*2;
        group.rotation.x=racer.dodgeDirection.z*roll;group.rotation.z=-racer.dodgeDirection.x*roll;
      }
      const protectedNow=race.elapsed<racer.immuneUntil||race.elapsed<Math.max(racer.shieldUntil,racer.creationShieldUntil);
      group.visible=racer.finishTime!==undefined||!protectedNow||Math.floor(race.elapsed*12)%2===0;
      const aura=group.getObjectByName('event-aura') as Mesh|undefined;
      const eventOnRacer=eventState?.phase==='active'&&eventState.affectedRacerIds.includes(String(racer.id));
      if(aura) {
        aura.visible=Boolean(eventOnRacer)&&racer.finishTime===undefined;
        aura.scale.setScalar(1+Math.sin(race.elapsed*7+racer.id)*0.12);
        if(eventState?.instance)(aura.material as MeshBasicMaterial).color.set(eventAuraColors[encounterKind(eventState.instance.spec)]);
      }
      if(eventOnRacer&&eventState?.instance&&encounterKind(eventState.instance.spec)==='gravityWell')group.rotation.z+=Math.sin(race.elapsed*8+racer.id)*0.28;
      group.position.set(rx,ry-y+bounce+(racer.finishTime!==undefined?0:.3),rz);
      group.scale.set(1,squash,1);
    });
    if(mat.current) mat.current.position.y=-FINISH_DEPTH-y;
    if(rails.current) rails.current.position.y=0;
    hudTime.current+=delta;
    if(hudTime.current>=0.05) {
      hudTime.current=0;
      const markers=race.racers.slice(1).map(racer => {
        const [rx,ry,rz]=race.snapshot(racer).position;
        const world=new Vector3(rx,ry-y+0.3,rz);
        const marker=projectRivalMarker(world,camera);
        const difference=ry-y;
        return {id:racer.id,name:racer.name,color:racer.color,...marker,locked:runtime.target===racer.id,selected:lock.current.target===racer.id,progress:lock.current.target===racer.id?lock.current.progress:0,
          gap:racer.finishTime!==undefined ? 'Landed' : Math.abs(difference)<1 ? 'Level' : Math.round(Math.abs(difference))+' m '+(difference>0?'above':'below')};
      });
      const creation=runtime.voice?.creation;
      let creationMarker:typeof initialRaceHud.creationMarker=null;
      if(creation&&eventState?.phase==='collectible'&&Math.hypot(creation.position[0]-x,creation.position[1]-y,creation.position[2]-z)<=400){
        const point=new Vector3(creation.position[0],creation.position[1]-y,creation.position[2]);
        const behind=point.clone().applyMatrix4(camera.matrixWorldInverse).z>=0;
        const projected=point.project(camera);
        let px=projected.x*(behind?-1:1),py=projected.y*(behind?-1:1);
        const edge=behind||Math.abs(px)>0.65||Math.abs(py)>0.55||projected.z>1;
        if(edge){if(Math.abs(px)+Math.abs(py)<0.01)py=1;const scale=Math.max(Math.abs(px)/0.65,Math.abs(py)/0.55,0.001);px/=scale;py/=scale;}
        const gap=creation.position[1]-y;
        creationMarker={left:50+px*50,top:50-py*50,angle:Math.atan2(px,py)*180/Math.PI,edge,name:creation.spec.displayName,gap:Math.round(Math.hypot(creation.position[0]-x,gap,creation.position[2]-z))+' m · '+(gap>0?'above':'below')};
      }
      const threat=race.threat(0);
      const threatPoint=threat?new Vector3(threat.position[0],threat.position[1]-y,threat.position[2]):null;
      const behind=threatPoint?threatPoint.clone().applyMatrix4(camera.matrixWorldInverse).z>=0:false;
      const projection=threatPoint?.project(camera);
      const threatAngle=projection?Math.atan2(projection.x*(behind?-1:1),projection.y*(behind?-1:1))*180/Math.PI:0;
      report({incidents:player.incidents,creationMarker,standings:race.standings(),speed:state.fallSpeed,depth:-y,x,z,brake:!runtime.paused&&!landed&&!!held('brake'),look,
        time:race.elapsed,place:race.order().findIndex(r=>r.id===0)+1,finish:player.finishTime??null,
        remaining:Math.max(0,FINISH_DEPTH+y),markers,allFinished:race.finished,
        item:player.item?ITEM_NAMES[player.item]:'Empty',itemKey:player.item,feedback:race.feedbackUntil>race.elapsed?race.feedback:'',boost:player.boosting,fuel:player.boostFuel,dodgeCooldown:Math.max(0,player.dodgeReady-race.elapsed),threat:threat?.kind??'',threatAngle,threatDistance:threat?Math.round(Math.abs(threat.position[1]-y))+' m '+(threat.position[1]>y?'above':'below'):'',
        targetName:runtime.target===undefined?'':race.racers[runtime.target].name,
        effects:[
          race.elapsed<Math.max(player.slowUntil,player.creationSlowUntil)?'SLOWED '+(Math.max(player.slowUntil,player.creationSlowUntil)-race.elapsed).toFixed(1)+'s':'',
          race.elapsed<Math.max(player.shieldUntil,player.creationShieldUntil)?'GHOST '+(Math.max(player.shieldUntil,player.creationShieldUntil)-race.elapsed).toFixed(1)+'s':'',
          player.boosting?'BOOST ACTIVE':'',
          player.eventObstacleProtection?'IN PROTECTIVE ZONE':'',
          race.elapsed<player.flailUntil?'FLAILING':'',
          race.elapsed<player.sunUntil?'SUN BURST':'',
        ].filter(Boolean).join(' · ')});
    }
  });
  return <>
    <color attach="background" args={['#79bbed']}/><fog attach="fog" args={['#b3d4f1',180,850]}/>
    <hemisphereLight args={['#e0f1ff','#8c9952',1.9]}/><directionalLight position={[15,30,-10]} intensity={2.1}/>
    <group ref={racers}>{runtime.race.racers.map((racer,index)=><group key={index}>
      {racer.model
        ?<RacerDinosaur racer={racer} race={runtime.race}/>
        :<StarfishDiver color={racer.color} motion={()=>({time:runtime.race.elapsed,speed:runtime.race.snapshot(runtime.race.racers[index]).fallSpeed})}/>}
      <mesh name="event-aura" visible={false}><sphereGeometry args={[2.2,16,12]}/><meshBasicMaterial color="#7ee9f1" wireframe transparent opacity={0.5} depthWrite={false}/></mesh>
    </group>)}</group>
    <RaceObjects race={runtime.race}/>
    {runtime.voice&&<RaceCreations host={runtime.voice}/>}
    <PrehistoricEarth snapshot={()=>runtime.race.snapshot(runtime.race.racers[0])}/>
    <CloudField snapshot={()=>runtime.race.snapshot(runtime.race.racers[0])}/>
    <group ref={mat}><LandingClearing race={runtime.race} paused={runtime.paused}/></group>
    <group ref={rails}>{[-LANE_HALF_WIDTH,LANE_HALF_WIDTH].flatMap(x=>[-LANE_HALF_WIDTH,LANE_HALF_WIDTH].map(z=><mesh key={x+','+z} position={[x,0,z]}>
      <cylinderGeometry args={[0.08,0.08,300,6]}/><meshBasicMaterial color="#d5eafb" transparent opacity={0.3}/>
    </mesh>))}</group>
  </>;
}
