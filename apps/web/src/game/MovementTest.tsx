import { Preview } from '../pages/CharacterPage';
import { CHARACTERS } from './characters';
import type { GregPose } from './GregModel';
import { RaceCreationHud } from './RaceCreationVisuals';
import { RaceVoiceControls, useRaceVoice } from '../voice/RaceVoiceControls';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas } from '@react-three/fiber';
import { PracticeRace } from './practice-race';
import { RaceScene, defaultBindings, initialRaceHud, type RaceRuntime } from './RaceScene';
import { RaceOverlay } from './RaceOverlay';
import { BRAKE_SPEED } from './freefall-controller';
import './movement-test.css';

const defaults = defaultBindings;
type Action = keyof typeof defaults;
const names: Record<Action, string> = {left: 'Left', right: 'Right', forward: 'Forward', backward: 'Back', brake: 'Air brake', look: 'Look up', use: 'Use item', boost:'Boost', dodge:'Dodge'};
type Bindings = typeof defaults;
type Runtime = RaceRuntime;
const label = (code: string) => code.replace(/^Key/, '').replace(/^Digit/, '');
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
const initialHud = initialRaceHud;

export function MovementTest() {
  const [screen,setScreen]=useState<'selection'|'viewer'|'race'|'countdown'>('selection');
  const [countdown,setCountdown]=useState(3);
  const [settings,setSettings]=useState(false);
  const screenRef=useRef(screen);screenRef.current=screen;
  const settingsRef=useRef(settings);settingsRef.current=settings;
  const [angle,setAngle]=useState(35),[zoom,setZoom]=useState(8);
  const [pose,setPose]=useState<GregPose>('Stand'),[previewPaused,setPreviewPaused]=useState(false),[take,setTake]=useState(0);
  const [race]=useState(()=>new PracticeRace());
  const voice=useRaceVoice(race);
  const microphone=useSyncExternalStore(voice.recorder.subscribe,voice.recorder.getSnapshot);
  const voiceBlockedReason=!microphone.ready?'Enable the microphone before starting the race.'
    :voice.error||(!voice.profiles?'Loading voice profiles…':!voice.profile?.available?(voice.profile?.unavailableReason||'Voice profile unavailable. Check the server and refresh profiles.')
    :voice.live&&!voice.paidAvailable?'Live voice is unavailable. Check the voice panel before starting.'
    :voice.live&&!voice.armed?'Allow this run’s paid attempt in the voice panel before starting.':'');
  const voiceBlocked=useRef(voiceBlockedReason);voiceBlocked.current=voiceBlockedReason;
  const [voiceInputNotice,setVoiceInputNotice]=useState({id:0,text:''});
  const voiceActions=useRef(voice);voiceActions.current=voice;
  const [runtime] = useState<Runtime>(() => ({race, voice:voice.host, keys: new Set(), paused: true, bindings: {...defaults}, clock: 0, generation: 0, fireRequested: false, dodgeRequested:false}));
  const [paused, setPaused] = useState(true);
  const [hud, setHud] = useState(initialHud);
  const [bindings, setBindings] = useState<Bindings>({...defaults});
  const [binding, setBinding] = useState<Action | null>(null);
  const [notice, setNotice] = useState('');
  const pause = useCallback((value: boolean) => {
    runtime.paused = value;
    if (value) runtime.voice?.pause(); else runtime.voice?.start();
    runtime.keys.clear(); runtime.fireRequested=false;runtime.dodgeRequested=false; runtime.target=undefined;
    runtime.race.racers[0].controller.braking = false;
    setPaused(value);
    setHud(current => ({...current, brake: false}));
  }, [runtime]);
  const reset = () => {
    pause(true);
    runtime.race.reset();voiceActions.current.reset(); runtime.clock = 0; runtime.generation++;
    setHud(initialHud);setVoiceInputNotice(current=>({id:current.id+1,text:''}));
  };

  const beginExercise=()=>{
    reset();setSettings(false);setBinding(null);setCountdown(3);setScreen('countdown');
  };
  useEffect(()=>{
    if(screen!=='countdown')return;
    const timer=window.setTimeout(()=>{
      if(countdown>1)setCountdown(value=>value-1);
      else{setScreen('race');pause(false);}
    },1000);
    return ()=>window.clearTimeout(timer);
  },[screen,countdown,pause]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (binding) {
        event.preventDefault();
        if (event.repeat) return;
        if (event.code === 'Escape') { setBinding(null); return; }
        if (!/^Key[A-Z]$/.test(event.code)) { setNotice('Choose a letter key. Escape cancels.'); return; }

        if (Object.entries(runtime.bindings).some(([action, code]) => action !== binding && code === event.code)) {
          setNotice('That key is already assigned. Choose another letter.'); return;
        }
        runtime.bindings = {...runtime.bindings, [binding]: event.code};
        setBindings(runtime.bindings);
        setBinding(null);
        setNotice('Binding updated for this session.');
        return;
      }
      if(screenRef.current!=='race'||settingsRef.current)return;
      if (event.code === 'Escape' && !event.repeat) {
        event.preventDefault(); if(runtime.paused&&runtime.race.elapsed===0){setCountdown(3);setScreen('countdown');}else pause(!runtime.paused); return;
      }
      if (typing(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code==='Space') {
        event.preventDefault();
        if (!runtime.paused&&!event.repeat) {
          const phase=voiceActions.current.host.loop.getSnapshot().phase;
          const reason=phase==='available'?'Collect the yellow star first.'
            :phase==='prompted'?voiceBlocked.current
            :['failed','missed','ended','activated'].includes(phase)?'Voice attempt finished. Restart the race for another star.':'';
          setVoiceInputNotice(current=>({id:current.id+1,text:reason}));
          voiceActions.current.start();
        }
        return;
      }
      if (Object.values(runtime.bindings).includes(event.code)) {
        event.preventDefault();
        if (!runtime.paused) {
          runtime.keys.add(event.code);
          if(event.code===runtime.bindings.use&&!event.repeat)runtime.fireRequested=true;
          if(event.code===runtime.bindings.dodge&&!event.repeat)runtime.dodgeRequested=true;
        }
      }
    };
    const up = (event: KeyboardEvent) => { runtime.keys.delete(event.code);if(event.code==='Space')voiceActions.current.finish(); };
    const blur = () => {pause(true);if(screenRef.current==='countdown')setScreen('race');};
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      runtime.keys.clear(); runtime.fireRequested=false;runtime.dodgeRequested=false; runtime.target=undefined;
      runtime.paused = true;
    };
  }, [runtime, binding, pause]);

  return <section className="movement-test">
    <div className="movement-layout">
      <div className={'movement-stage packaged-game '+(screen!=='race'?'personnel-menu':'')}>
        <div className="in-game-toolbar">
          <span>⚠ MANDATORY SAFETY EXERCISE</span>
          <div>
            {screen==='race'?<><button onClick={()=>{if(runtime.paused&&runtime.race.elapsed===0)beginExercise();else pause(!runtime.paused);}} disabled={binding!==null||settings}>{paused?'Resume':'Pause'}</button><button onClick={beginExercise}>Restart</button></>:null}
            <button aria-pressed={screen==='selection'} onClick={()=>{pause(true);setScreen('selection');setSettings(false);setBinding(null);setPose('Stand');setPreviewPaused(false);setTake(value=>value+1);}}>Personnel</button>
            <button aria-pressed={screen==='viewer'} onClick={()=>{pause(true);setScreen('viewer');setSettings(false);setBinding(null);}}>Inspect Greg</button>
            <button aria-pressed={settings} onClick={()=>{pause(true);if(screen==='countdown')setScreen('race');setSettings(value=>!value);setBinding(null);}}>Setup</button>
          </div>
        </div>
        <div className="in-game-display">
        <Canvas camera={{position: [0,32,0], up: [0,0,-1], fov: 65, far: 5000}} fallback={<p>WebGL is unavailable. Enable hardware acceleration to run this test.</p>}>
          {screen==='race'||screen==='countdown'?<RaceScene runtime={runtime} report={setHud}/>:<Preview key={screen+take} angle={screen==='selection'?-90:angle} zoom={zoom} pose={screen==='selection'?'Reach':pose} paused={screen==='selection'?false:previewPaused} loop={screen==='selection'} chase={false} inGame/>}
        </Canvas>
        {(screen==='selection'||screen==='viewer')&&!settings&&<div className="in-game-personnel">
          <span className="safety-label">{screen==='viewer'?'EQUIPMENT INSPECTION':'MANDATORY ATTENDANCE'}</span>
          <h1>{screen==='viewer'?'Inspect personnel':'Select personnel'}</h1>
          <h2>Greg <small>001 / Accounts payable</small></h2>
          <p>Regulation harness. Suitability assumed.</p>
          <div className="in-game-roster">{CHARACTERS.map(character=><button key={character.id} disabled={!character.ready} aria-pressed={character.ready}>
            <strong>{character.name}</strong><span>{character.species}</span><small>{character.ready?'ASSIGNED':'AWAITING EQUIPMENT'}</small>
          </button>)}</div>
          {screen==='viewer'&&<div className="in-game-inspection">
            <label>Rotate<input aria-label="Rotate Greg" type="range" min="-180" max="180" value={angle} onChange={event=>setAngle(Number(event.target.value))}/></label>
            {screen==='viewer'&&<label>Zoom<input aria-label="Greg preview zoom" type="range" min="5" max="12" step=".1" value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></label>}
            <label>Procedure<select aria-label="Greg procedure" value={pose} onChange={event=>{setPose(event.target.value as GregPose);setPreviewPaused(false);setTake(value=>value+1);if(event.target.value==='Reach')setAngle(150);}}>
              {(screen==='viewer'?['Stand','Dive','Reach','Brake','Bank left','Bank right','Impact']:['Stand','Reach']).map(value=><option key={value}>{value}</option>)}
            </select></label>
            {screen==='viewer'&&<div><button aria-pressed={previewPaused} onClick={()=>setPreviewPaused(value=>!value)}>{previewPaused?'Play':'Pause preview'}</button><button onClick={()=>{setPreviewPaused(false);setTake(value=>value+1);}}>Replay</button></div>}
          </div>}
          <button className="begin-exercise" onClick={beginExercise}>Begin exercise →</button>
          <small>Attendance is not optional.</small>
        </div>}
        {screen==='countdown'&&<div className="exercise-start-screen" role="status" aria-live="polite" aria-atomic="true">
          <span className="safety-caution">⚠ STAND BY</span>
          <h1>EXERCISE COMMENCING IN...</h1>
          <strong key={countdown} className="exercise-start-number">{countdown}</strong>
          <p>Remain calm. Follow the procedure.</p>
          <button onClick={()=>{pause(true);setScreen('selection');}}>Return to personnel</button>
        </div>}
        {screen==='race'&&<>
        <div className="movement-status">{paused ? 'PAUSED' : hud.look ? 'LOOKING UP' : hud.finish !== null ? 'LANDED' : hud.brake ? 'AIR BRAKE ACTIVE' : 'FREEFALL'}<span>{hud.speed.toFixed(0)} m/s · {Math.ceil(hud.remaining)} m to finish</span></div>
        <div className="race-place">{hud.place} / 4 <small>POSITION</small></div>
        <RaceOverlay hud={hud} paused={paused} useKey={label(bindings.use)} boostKey={label(bindings.boost)} dodgeKey={label(bindings.dodge)}/>
        {!paused && hud.finish === null && hud.remaining <= 100 && <div className="race-countdown">{Math.ceil(hud.remaining)} m<br/><small>PREPARE FOR LANDING</small></div>}
        {!paused && hud.finish !== null && <div className="race-result"><strong>EXERCISE COMPLETE · {hud.place} / 4</strong><span>{hud.finish.toFixed(2)} seconds · {hud.allFinished ? 'Everyone landed.' : 'Watch the others land…'}</span><button onClick={beginExercise}>Race again</button></div>}
        <RaceCreationHud key={voice.state.session} host={voice.host} paused={paused} finished={hud.finish!==null} marker={hud.creationMarker} live={!!voice.live} mockText={voice.mockText} blockedReason={voiceBlockedReason} inputNotice={voiceInputNotice} microphone={microphone}/>
        {paused && !settings && <div className="movement-pause"><span className="safety-caution">⚠ CAUTION</span><h2>Mandatory fall protection training</h2><p>{label(bindings.forward)}{label(bindings.left)}{label(bindings.backward)}{label(bindings.right)} to steer · hold {label(bindings.brake)} to brake</p>
          {runtime.race.elapsed===0&&<div className="race-mic-setup">
            <strong>★ Yellow star · voice creation</strong>
            <p role="status">{voiceBlockedReason||'Microphone ready. Collect the star, then hold Space until you finish speaking.'}</p>
            {!microphone.ready&&<><button disabled={microphone.phase==='preparing'} onClick={()=>{void voice.recorder.prepare();}}>{microphone.phase==='preparing'?'Preparing microphone…':'Enable microphone'}</button><small>{microphone.message}</small></>}
          </div>}
          <button disabled={binding !== null} onClick={event => {event.currentTarget.blur(); if(runtime.race.elapsed===0)beginExercise();else pause(false);}}>Begin / resume exercise</button>
          <small>Escape resumes · leaving this window pauses</small></div>}
        </>}
      {settings&&<div className="race-dashboard in-game-settings" role="dialog" aria-label="Exercise setup">
        <div className="settings-heading"><h2>Exercise setup</h2><button onClick={()=>{setSettings(false);setBinding(null);}}>Close setup</button></div>
        <details className="race-detail">
          <summary>Voice setup <small>{microphone.ready?'Microphone ready':'Enable microphone before racing'}</small></summary>
          <RaceVoiceControls voice={voice} paused={paused}/>
        </details>
        <details className="race-detail">
          <summary>Controls <small>Steering, items &amp; key bindings</small></summary>
          <p>Click a key to rebind. Changes last for this session.</p>
          <div className="movement-bindings">{(Object.keys(defaults) as Action[]).map(action=>
            <button key={action} aria-label={`Rebind ${names[action]}`} onClick={()=>{pause(true);setBinding(action);setNotice('Press a letter key. Escape cancels.');}}>
              <span>{names[action]}</span><kbd>{binding===action?'…':label(bindings[action])}</kbd>
            </button>)}</div>
          <p role="status">{notice}</p>
          <p>Hold Space after collecting the star. Release to submit.<br/>{label(bindings.dodge)} dodges · 15-second cooldown.</p>
        </details>
        <details className="race-detail">
          <summary>Race details <small>Stats &amp; pickup tips</small></summary>
          <p>{hud.time.toFixed(1)} s elapsed · 72 × 72 m lane<br/>X {hud.x.toFixed(1)} m · Z {hud.z.toFixed(1)} m</p>
          <p>Brake target: {BRAKE_SPEED} m/s · Steering: 20 m/s</p>
          <p>{hud.effects||'No active effects'}</p>
          <p>Jellyfish are more common near the back, suns in the middle, and ghosts in first. Gold pipe rings give double boost fuel.</p>
        </details>
      </div>}
        </div>
      </div>
    </div>
  </section>;
}
