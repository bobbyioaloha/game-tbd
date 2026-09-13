import { useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, type Group } from 'three';
import { DinosaurModel, type DinosaurCharacter, type GregPose } from '../game/GregModel';
import { CHARACTERS, DEFAULT_CHARACTER_ANGLE } from '../game/characters';
import './characters.css';

export function Preview({angle,zoom,pose,paused,chase,inGame=false,loop=false,character='greg'}:{angle:number;zoom:number;pose:GregPose;paused:boolean;chase:boolean;inGame?:boolean;loop?:boolean;character?:DinosaurCharacter}) {
  const rig=useRef<Group>(null),windTime=useRef(0);
  const {camera,size}=useThree();
  useFrame((_,delta)=>{
    if(camera instanceof PerspectiveCamera&&camera.fov!==42){camera.fov=42;camera.updateProjectionMatrix();}
    if(!paused)windTime.current+=Math.min(delta,.1);
    if(chase){camera.up.set(0,0,-1);camera.position.set(0,10,0);camera.lookAt(0,1.35,0);}else{camera.up.set(0,1,0);camera.position.set(0,2.6,inGame&&size.width<=700?zoom+2:zoom);camera.lookAt(inGame&&size.width>700?1.6:0,inGame&&size.width<=700?.1:1.45,0);}
    if(rig.current)rig.current.rotation.y=angle*Math.PI/180;
  });
  return <>
    <color attach="background" args={[inGame?'#75b8df':'#60777e']}/>
    <fog attach="fog" args={[inGame?'#b8ddef':'#60777e',16,32]}/>
    <ambientLight intensity={0.85}/><directionalLight position={[-4,7,5]} intensity={2.1}/>
    <group ref={rig}><DinosaurModel character={character} pose={pose} loop={loop} paused={paused} wind={pose==='Stand'||pose==='Reach'||pose==='Checklist'||pose==='Diagnostics'||pose==='Equipment check'?undefined:()=>({time:windTime.current,speed:pose==='Brake'?12:45})}/></group>
    <mesh position={[0,-0.08,0]}><cylinderGeometry args={[3.4,3.4,0.15,32]}/><meshLambertMaterial color="#30434a"/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.003,0]}><ringGeometry args={[3.1,3.16,48]}/><meshBasicMaterial color="#d8bd5b"/></mesh>
    {!inGame&&<gridHelper args={[40,40,'#7c9093','#6a8187']} position={[0,-0.17,0]}/>}
  </>;
}
export function CharacterPage({viewer=false,onStart}:{viewer?:boolean;onStart?:(character:DinosaurCharacter)=>void}) {
  const [inspected,setInspected]=useState<DinosaurCharacter>('greg');
  const person=CHARACTERS.find(character=>character.id===inspected)!;
  const employee=String(CHARACTERS.indexOf(person)+1).padStart(3,'0');
  const [angle,setAngle]=useState(DEFAULT_CHARACTER_ANGLE),[zoom,setZoom]=useState(8);
  const [chase,setChase]=useState(false);
  const [pose,setPose]=useState<GregPose>('Stand'),[paused,setPaused]=useState(false),[take,setTake]=useState(0);
  return <main className="personnel-page">
    <div className="personnel-heading"><div><span className="document-code">DEPARTMENT OF WORKPLACE SAFETY / FORM 04-B</span>
      <h1>{viewer?'Equipment inspection':'Select personnel'}</h1>
      <p>{viewer?'Character viewer · temporary inspection station':'Mandatory descent exercise. Attendance is not optional.'}</p></div>
      <span className="personnel-stamp">{viewer?'VISUAL REVIEW':'TRAINING / 001'}</span></div>
    <div className="personnel-layout">
      <section className="personnel-preview" aria-label={`Interactive 3D preview of ${person.name}`}>
        <div className="preview-caption"><span>{person.name.toUpperCase()} / EMPLOYEE {employee}</span><span>REGULATION HARNESS</span></div>
        <Canvas dpr={[0.75,1]} gl={{antialias:false}} camera={{position:[0,2.6,8],fov:42}} fallback={<p>3D preview requires WebGL. All personnel can still be selected below.</p>}>
          <Preview character={inspected} key={inspected+take} angle={angle} zoom={zoom} pose={viewer?pose:(person.introPose??'Stand')} loop={!viewer||pose==='Checklist'||pose==='Diagnostics'||pose==='Equipment check'} paused={paused} chase={chase}/>
        </Canvas>
        <div className="preview-footnote">ISSUED AS STANDARD. FIT MAY VARY.</div>
      </section>
      <section className="personnel-file" aria-label="Personnel roster">
        <span className="document-code">ASSIGNED PARTICIPANT</span><h2>{person.name}</h2><p className="personnel-species">{person.species} / {person.department}</p>
        <p className="personnel-quote">{person.personality}</p>
        <dl><div><dt>Employee no.</dt><dd>{employee}</dd></div><div><dt>Exercise</dt><dd>Controlled descent</dd></div><div><dt>Equipment</dt><dd>Standard issue</dd></div></dl>
        <div className="personnel-roster">{CHARACTERS.map((character,index)=><button key={character.id} disabled={!character.model} aria-pressed={character.id===person.id} className={character.id===person.id?'assigned':''} onClick={()=>{if(character.model){setInspected(character.model);setAngle(DEFAULT_CHARACTER_ANGLE);setPose(character.introPose??'Stand');setPaused(false);setTake(value=>value+1);}}}>
          <span className="roster-index" style={{borderColor:character.color}}>{String(index+1).padStart(2,'0')}</span>
          <span><strong>{character.name}</strong><small>{character.species}</small></span><span className="roster-state">{viewer&&character.id===person.id?'INSPECTING':character.id===person.id?'SELECTED':character.model?'PLAYABLE':'PLACEHOLDER'}</span>
        </button>)}</div>
        {!viewer&&<button className="report-button" onClick={()=>onStart?.(inspected)}>{'Report as '+person.name+' →'}</button>}
        <p className="personnel-note">{viewer?'Inspect the same character models used in the race.':'All four personnel are equipped and cleared for the exercise.'}</p>
      </section>
    </div>
    <section className="inspection-controls" aria-label="Model inspection controls">
      <div><label htmlFor="greg-angle">Rotate · {angle}°</label><input id="greg-angle" type="range" min="-180" max="180" value={angle} onChange={event=>setAngle(Number(event.target.value))}/></div>
      <div><label htmlFor="greg-zoom">Viewing distance</label><input id="greg-zoom" type="range" min="5" max="12" step=".1" value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></div>
      <div className="inspection-buttons"><button onClick={()=>setAngle(0)}>Front</button><button onClick={()=>setAngle(90)}>Side</button><button onClick={()=>setAngle(180)}>Back</button></div>
      <div><label htmlFor="greg-pose">Procedure preview</label><select id="greg-pose" value={pose} onChange={event=>{setPose(event.target.value as GregPose);setPaused(false);setTake(value=>value+1);}}>
        {(viewer?['Stand','Dive','Reach','Brake','Bank left','Bank right','Impact',...(inspected==='linda'?['Checklist']:inspected==='steve'?['Diagnostics']:inspected==='susan'?['Equipment check']:[])]:['Stand','Reach']).map(value=><option key={value} value={value}>{value==='Reach'?'Check ripcord reach':value}</option>)}
      </select></div>
      <div className="inspection-buttons">{viewer&&<button aria-pressed={chase} onClick={()=>{setChase(value=>!value);setPose(chase?'Stand':'Dive');setAngle(0);setTake(value=>value+1);}}>Top-down preview</button>}<button aria-pressed={paused} onClick={()=>setPaused(value=>!value)}>{paused?'Play':'Pause'}</button><button onClick={()=>{setPaused(false);setTake(value=>value+1);}}>Replay</button></div>
    </section>
  </main>;
}
