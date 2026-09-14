import type { RecorderSnapshot } from '../voice/recorder';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box3, DoubleSide, Shape, Vector3, type Group } from 'three';
import { encounterLabel, encounterKind, encounterInstruction, type RaceEncounter } from '@sky/shared';
import { drillAssessment } from './drill-feedback';
import { EffectCue } from './EffectCue';
import { RaceEventRenderer } from '../race-events/RaceEventRenderer';
import { RACE_CREATION_MODEL_DIAMETER, RACE_CREATION_PICKUP_RADIUS, RACE_VOICE_ATTEMPTS } from './race-event-config';
import { PowerUpModel } from '../components/PowerUpModel';
import type { RaceEventHost } from './race-event-host';
import type { initialRaceHud } from './RaceScene';

const impulseLabels:Record<Exclude<ReturnType<typeof encounterKind>,'observation'>,string>={
  gravityWell:'GRAVITY SHIFT!',debrisShower:'DEBRIS HIT!',repulsionBurst:'SHOCKWAVE!',protectiveZone:'PROTECTION ACTIVE!',
  stampede:'EQUIPMENT CONTACT!',rapids:'CURRENT BOOST!',pinball:'BOUNCE!',buddy:'BUDDY ASSIST!',
  orbit:'SLINGSHOT!',reconstruction:'ECHO CONTACT!',
};

// Presentation only: model transforms never change the host's pickup/collision bounds.
export function RaceCreations({host}:{host:RaceEventHost}) {
  useSyncExternalStore(host.loop.subscribe,host.loop.getSnapshot);
  useSyncExternalStore(host.subscribe,host.getSnapshot);
  const creation=host.creation;
  const world=useRef<Group>(null), star=useRef<Group>(null);
  const shape=useMemo(()=>{
    const outline=new Shape();
    for(let i=0;i<10;i++) {
      const angle=Math.PI/2+i*Math.PI/5, radius=i%2?1.05:2.4;
      const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
      if(i===0)outline.moveTo(x,y);else outline.lineTo(x,y);
    }
    outline.closePath();return outline;
  },[]);
  useFrame(({camera})=>{
    if(world.current)world.current.position.y=-host.race.snapshot(host.race.racers[0]).position[1];
    const time=host.race.elapsed;
    if(star.current){star.current.quaternion.copy(camera.quaternion);star.current.rotateZ(time*0.35);star.current.scale.setScalar(1+Math.sin(time*3)*0.08);}
  });
  return <group ref={world}>
    {host.voice&&<group position={host.voice.position} ref={star}>
      <mesh><shapeGeometry args={[shape]}/><meshStandardMaterial color="#fff176" emissive="#ffd52a" emissiveIntensity={2} side={DoubleSide}/></mesh>
      {[2.7,3.2,3.8].map((radius,i)=><mesh key={radius} position={[0,0,-0.06-i*0.01]}>
        <ringGeometry args={[radius-0.24,radius,48]}/><meshBasicMaterial color="#ffe66b" transparent opacity={0.4-i*0.1} side={DoubleSide} depthWrite={false}/>
      </mesh>)}
    </group>}
    {creation&&<RaceEventRenderer key={creation.instanceId} events={host.race.events!} modelDiameter={RACE_CREATION_MODEL_DIAMETER} modelTilt={[0.55,0.15]} pickupContactRadius={RACE_CREATION_PICKUP_RADIUS}/>}
  </group>;
}

function TrophyModel({spec}:{spec:RaceEncounter}) {
  const frame=useRef<Group>(null),content=useRef<Group>(null);
  useLayoutEffect(()=>{
    if(!content.current)return;
    content.current.position.set(0,0,0);content.current.scale.setScalar(1);
    const box=new Box3().setFromObject(content.current),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
    const scale=2.3/Math.max(size.x,size.y,size.z,0.01);
    content.current.scale.setScalar(scale);content.current.position.copy(center.multiplyScalar(-scale));
  },[spec]);
  useFrame((_,delta)=>{if(frame.current)frame.current.rotation.y+=Math.min(delta,0.1)*0.45;});
  return <group ref={frame}><group ref={content}><PowerUpModel spec={spec}/></group></group>;
}

export function RaceCreationHud({enabled,host,paused,finished,marker,live,mockText,blockedReason,inputNotice,microphone,steeringKeys}:{steeringKeys:string;enabled:boolean;host:RaceEventHost;paused:boolean;finished:boolean;marker:typeof initialRaceHud.creationMarker;live:boolean;mockText:string;blockedReason:string;inputNotice:{id:number;text:string;phase:string};microphone:RecorderSnapshot}) {
  const state=useSyncExternalStore(host.loop.subscribe,host.loop.getSnapshot);
  const opportunity=useSyncExternalStore(host.subscribe,host.getSnapshot);
  const event=host.race.events!.getSnapshot();
  const effectLabel=event.instance?encounterLabel(event.instance.spec):'';
  const playerHit=event.affectedRacerIds?.includes('0') ?? false;
  const kind=event.instance?encounterKind(event.instance.spec):'';
  const assessment=drillAssessment(host.report);
  const playerImpulses=event.impact?.impulseCounts['0']??0;
  const triggerer=host.race.racers.find(racer=>String(racer.id)===event.triggererId)?.name;
  const [spec,setSpec]=useState<RaceEncounter>();
  const [announcement,setAnnouncement]=useState<{name:string;distance:number}>();
  const [notice,setNotice]=useState(true);
  const [collectedAt,setCollectedAt]=useState<number|null>(null);
  useEffect(()=>{
    if(event.phase==='active'){setCollectedAt(host.race.elapsed);if(event.instance)setSpec(event.instance.spec);}
  },[host,event.phase,event.instance?.instanceId]);
  const trophyAge=collectedAt===null?Infinity:host.race.elapsed-collectedAt;
  useEffect(()=>{
    const creation=host.creation;
    if(event.phase==='collectible'&&creation){
      setSpec(creation.spec);
      const player=host.race.snapshot(host.race.racers[0]).position;
      setAnnouncement({name:creation.spec.displayName,distance:Math.round(Math.hypot(...creation.position.map((value,axis)=>value-player[axis])))});
    }
  },[host,event.phase,event.instance?.instanceId]);
  useEffect(()=>{
    setNotice(true);
    if(paused)return;
    const timer=window.setTimeout(()=>setNotice(false),4500);
    return()=>window.clearTimeout(timer);
  },[state.phase,state.session,paused,inputNotice.id,opportunity.secondStar,opportunity.message]);
  if(paused)return null;
  const busy=['preparing','recording','transcribing','generating','ready'].includes(state.phase);
  const recording=microphone.phase==='recording';
  const inputHint=notice&&!busy&&inputNotice.phase===state.phase?inputNotice.text:'';
  const showVoiceNotice=!finished&&(Boolean(inputHint)||(notice||busy||state.phase==='prompted')&&!['activated','spawned','ended'].includes(state.phase));
  const showOpportunityNotice=Boolean(opportunity.message)&&(
    ['offered','collected'].includes(opportunity.secondStar)||
    (notice||finished)&&['missed','discarded'].includes(opportunity.secondStar));
  const showNotice=enabled&&(showVoiceNotice||showOpportunityNotice);
  const hint=state.phase==='available'?'Collect an Inspection Request (yellow star).'
    :state.phase==='preparing'?(microphone.phase==='preparing'?microphone.message:'Starting microphone…')
    :state.phase==='transcribing'?(live?'Understanding your request—keep racing.':'Loading the prepared prompt—keep racing.')
    :state.phase==='generating'?'The department is reproducing your concern. Keep racing.'
    :state.phase==='missed'?host.nextOpportunityMessage
    :state.message;
  return <>
    {event.phase==='active'&&event.instance&&<>
      {playerHit&&kind!=='observation'&&<div className={'event-screen-cue '+kind} aria-hidden="true"/>}
      {!finished&&<EffectCue event={event} position={host.race.snapshot(host.race.racers[0]).position} steeringKeys={steeringKeys}/>}
      {finished&&<div className={'race-event-status active '+kind} role="status">
        <strong>{event.instance.spec.version===4&&!effectLabel.startsWith('Mandatory ')?'MANDATORY · ':''}{effectLabel.toUpperCase()} · {event.remainingSeconds.toFixed(1)} s</strong>
        <span>{event.instance.spec.displayName} · {triggerer==='You'?'You activated it':triggerer+' activated it'}</span>
        <span>{event.impact?.affectedRacerIds.length??0}/{event.impact?.participants.length??0} racers affected · {playerHit?'DRILL INTERACTION RECORDED':'Choose your route'}</span>
      </div>}
      {playerImpulses>0&&kind!=='observation'&&<div key={event.instance.instanceId+'-'+playerImpulses} className="event-hit-callout" aria-hidden="true">
        {kind&&impulseLabels[kind]}
      </div>}
    </>}
    {event.phase==='collectible'&&event.instance&&<div className="race-event-status waiting" role="status">
      <strong>{event.instance.spec.displayName} → {effectLabel}</strong>
      <span>CREATED · Fly through the glowing halo to activate. Brake to line up. Any racer can trigger it.</span>
      <small>{encounterInstruction(event.instance.spec)}</small>
    </div>}
    {marker&&<div className={'creation-radar '+(marker.edge?'at-edge ':'')+(marker.left>50?'label-left':'')} style={{left:marker.left+'%',top:marker.top+'%'}}>
      <span className="creation-radar-symbol" style={marker.edge?{transform:'rotate('+marker.angle+'deg)'}:undefined}>{marker.edge?'↑':''}</span>
      <div className="creation-radar-label"><strong>{marker.name}</strong><small>{marker.gap}</small></div>
    </div>}
    {event.phase==='collectible'&&event.elapsedSeconds<3&&announcement&&<div className="creation-announcement" role="status">
      <strong>{announcement.name} created!</strong><span>AHEAD IN {announcement.distance} METERS!</span>
    </div>}
    {showNotice&&<div className={'creation-notice '+(recording?'is-recording':'')}>
      <small>{showVoiceNotice?<>INSPECTION REQUEST {host.attemptNumber} / {RACE_VOICE_ATTEMPTS}</>:'SECOND INSPECTION REQUEST'}</small>
      <strong role='status'>{showVoiceNotice?(recording?'● Recording · release Space to submit':inputHint||(state.phase==='prompted'?(blockedReason?'★ Voice unavailable':'★ Hold Space · report a hazard in 10 words'):hint)):opportunity.message}</strong>
      {showVoiceNotice&&showOpportunityNotice&&opportunity.message!==hint&&<span role="status">★ {opportunity.message}</span>}
      {recording&&<div className="race-recording-meter">
        <div><span>MIC INPUT</span><span>{(microphone.elapsedMs/1000).toFixed(1)} / 8 s</span></div>
        <meter aria-label="Recording microphone input level" min={0} max={1} value={microphone.level}/>
        <span>{microphone.level>0.025?'Picking up sound':'Listening · no sound detected'}</span>
        {!live&&<small>Mock mode uses the selected transcript.</small>}
      </div>}
      {state.phase==='prompted'&&<span>{blockedReason?'Voice attempt unavailable.':'Describe what it does · release to submit'}<br/>{blockedReason|| (live?'Live speech':'Mock: '+mockText)}</span>}
    </div>}
    {assessment&&trophyAge>=10&&trophyAge<16&&<div className="race-event-status drill-assessment" role="status">
      <strong>YOUR INSPECTION FINDINGS</strong><span>{assessment}</span>
    </div>}
    {event.triggererId&&spec&&trophyAge<10&&<div className="creation-trophy" role="status" style={{opacity:Math.min(1,(10-trophyAge)/0.5)}}>
      <div className="creation-trophy-model" aria-hidden="true"><Canvas camera={{position:[0,1,4.5],fov:42}} dpr={[1,1.5]} fallback={<span>★</span>}>
        <ambientLight intensity={2}/><directionalLight position={[3,4,5]} intensity={3}/><TrophyModel spec={spec}/>
      </Canvas></div>
      <div><small>★ YOU MADE THIS!</small><strong>{spec.displayName}</strong><span>{triggerer==='You'?'You activated it':triggerer+' activated it'}</span></div>
    </div>}
  </>;
}
