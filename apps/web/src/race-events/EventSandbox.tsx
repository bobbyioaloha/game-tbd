import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Vector3, type ArrowHelper, type Group, type Mesh } from 'three';
import { encounterLabel, encounterInstruction, type RaceEncounter } from '@sky/shared';
import { EventSandboxModel, SANDBOX_RACERS } from './sandbox-model';
import { RaceEventRenderer } from './RaceEventRenderer';
import { length } from './math';
import { drillMetricSummary } from './drill-metrics';
function Racer({model,index,debug}:{model:EventSandboxModel;index:number;debug:boolean}) {
  const group=useRef<Group>(null),shield=useRef<Mesh>(null),arrow=useRef<ArrowHelper>(null),vector=useRef(new Vector3());
  const item=SANDBOX_RACERS[index];
  useFrame(()=>{
    const racer=model.racers[index];group.current?.position.set(...racer.position);
    if(shield.current)shield.current.visible=Boolean(model.inputs[item.id]?.obstacleProtection);
    const force=model.inputs[item.id]?.acceleration??[0,0,0];
    if(arrow.current){arrow.current.visible=debug&&length(force)>0.01;vector.current.set(...force);if(vector.current.length()>0){arrow.current.setDirection(vector.current.normalize());arrow.current.setLength(Math.min(8,length(force)*0.6),0.7,0.35);}}
  });
  return <group ref={group}>
    <mesh><sphereGeometry args={[0.6,16,12]}/><meshStandardMaterial color={item.color}/></mesh>
    <mesh position={[0,0.7,0]}><coneGeometry args={[0.4,0.7,5]}/><meshStandardMaterial color={item.color}/></mesh>
    <mesh ref={shield} visible={false}><sphereGeometry args={[1,16,12]}/><meshBasicMaterial color="#7df5ef" wireframe/></mesh>
    <arrowHelper ref={arrow} args={[new Vector3(0,1,0),new Vector3(),1,'#e9fbff']}/>
  </group>;
}
function Obstacle({model,index}:{model:EventSandboxModel;index:number}) {
  const ref=useRef<Mesh>(null);useFrame(()=>{if(ref.current)ref.current.visible=!model.obstacles[index].hit;});
  return <mesh ref={ref} position={[...model.obstacles[index].position]}><boxGeometry args={[1.4,1.4,1.4]}/><meshStandardMaterial color="#77829b"/></mesh>;
}
function Scene({model,running,debug,onTick}:{model:EventSandboxModel;running:boolean;debug:boolean;onTick:()=>void}) {
  const accumulator=useRef(0),lastReport=useRef(0);
  useFrame(({camera},delta)=>{
    if(running&&model.elapsed<15) {
      accumulator.current+=Math.min(delta,0.1);
      while(accumulator.current>=1/120){model.step(1/120);accumulator.current-=1/120;}
      if(model.elapsed-lastReport.current>0.1){lastReport.current=model.elapsed;onTick();}
    } else accumulator.current=0;
    const center=model.racers.reduce((sum,racer)=>sum+racer.position[1],0)/model.racers.length;
    camera.position.set(26,center+18,38);camera.lookAt(0,center-3,0);
  });
  return <>
    <color attach="background" args={['#0a1323']}/><ambientLight intensity={1.7}/><directionalLight position={[12,15,18]} intensity={3}/>
    <RaceEventRenderer events={model.events} debug={debug}/>
    {SANDBOX_RACERS.map((item,index)=><Racer key={item.id} model={model} index={index} debug={debug}/>)}
    {model.obstacles.map((_,index)=><Obstacle key={index} model={model} index={index}/>)}
    {[-20,20].flatMap(x=>[-12,12].map(z=><mesh key={x+','+z} position={[x,-55,z]}><cylinderGeometry args={[0.05,0.05,180,6]}/><meshBasicMaterial color="#35476c"/></mesh>))}
  </>;
}
export function EventSandbox({spec}:{spec:RaceEncounter}) {
  const [triggerer,setTriggerer]=useState('rival-a'),[seed,setSeed]=useState(7),[debug,setDebug]=useState(false);
  const [model,setModel]=useState(()=>new EventSandboxModel(spec,'rival-a',7));
  const [running,setRunning]=useState(false),[replay,setReplay]=useState(0),[,setTick]=useState(0);
  const state=model.events.getSnapshot();
  const restart=(who=triggerer,value=seed)=>{setModel(new EventSandboxModel(spec,who,value));setReplay(n=>n+1);setRunning(true);};
  return <section className="event-sandbox" aria-label="Safety drill sandbox">
    <div className="event-stage"><Canvas camera={{fov:55}} fallback={<p>WebGL unavailable.</p>}>
      <Scene key={replay} model={model} running={running} debug={debug} onTick={()=>setTick(n=>n+1)}/>
    </Canvas><div className="event-stage-label"><strong>{spec.displayName}</strong><span>{encounterLabel(spec)} · {state.phase} · {state.remainingSeconds.toFixed(1)} s</span></div></div>
    <div className="event-controls">
      <button onClick={()=>restart()}>Replay same seed</button>
      <button onClick={()=>setRunning(value=>!value)} disabled={model.elapsed>=15}>{running&&model.elapsed<15?'Pause':'Run simulation'}</button>
      <button disabled={running||model.elapsed>=15} onClick={()=>{for(let i=0;i<60&&model.elapsed<15;i++)model.step(1/120);setTick(n=>n+1);}}>Step 0.5 s</button>
      <label>First racer<select aria-label="First racer" value={triggerer} onChange={event=>{setTriggerer(event.target.value);restart(event.target.value);}}>
        {SANDBOX_RACERS.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}
      </select></label>
      <label>Seed<input aria-label="Event seed" type="number" min={0} max={4294967295} value={seed} onChange={event=>{const value=Number(event.target.value);if(Number.isInteger(value)&&value>=0&&value<=4294967295)setSeed(value);}}/></label>
      <label><input type="checkbox" checked={debug} onChange={event=>setDebug(event.target.checked)}/> Collision bounds and force arrows</label>
    </div>
    <p role="status">{state.triggererId?'Triggered by '+(SANDBOX_RACERS.find(item=>item.id===state.triggererId)?.label??state.triggererId)+'. Shared event; no ownership exemption.':'Choose Run simulation. The first collision activates the event.'}</p>
    <p className="drill-instruction">{encounterInstruction(spec)}</p>
    {state.drill&&<p role="status">{state.drill.warningSeconds>0?`Mandatory drill starts in ${state.drill.warningSeconds.toFixed(1)} s. Prepare for the reported hazard.`:`${state.drill.actors.length} objects · ${state.drill.currents.length} currents · ${state.drill.tethers?.length??0} buddy links · ${state.drill.orbits?.length??0} orbit fields · ${state.drill.observers?.length??0} inspectors`}</p>}
    <div className="event-racers">{SANDBOX_RACERS.map(item=><div key={item.id} style={{borderColor:item.color}}>
      <strong>{item.label}</strong><span>{state.affectedRacerIds.includes(item.id)?'Affected this tick':'Outside / no current contact'}</span>
      <small>{model.impulseCounts[item.id]??0} impulses received</small>
      {state.impact?.drill&&spec.version===4&&<small>{drillMetricSummary(spec.drill.family,state.impact.drill,item.id)}</small>}
      <small>{model.inputs[item.id]?.obstacleProtection?'Protected':(length(model.inputs[item.id]?.acceleration??[0,0,0])).toFixed(1)+' m/s² force'}</small>
    </div>)}</div>
    <small>Local sandbox · scripted racers · {model.elapsed.toFixed(1)} / 15 s · {model.obstacleHits} obstacle hits. {spec.version===4?'Amber marks warnings; solid bounds mark contacts. Gold bumpers bounce, purple ghosts replay paths, buddy lines show tension, orbital arrows show spin, and red cones inspect movement. Cyan wakes and gold currents accelerate; green eddies slow descent.':'Gold debris collides; small blue fragments are visual only.'} Replay, pause and inspection make no API calls.</small>
  </section>;
}
