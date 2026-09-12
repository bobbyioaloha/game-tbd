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
      if (event.code === 'Escape' && !event.repeat) {
        event.preventDefault(); pause(!runtime.paused); return;
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
    const blur = () => pause(true);
    const visibility = () => { if (document.hidden) pause(true); };
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
    <div className="movement-heading"><div><span className="eyebrow">FOUR RACERS / CRASH-MAT SPRINT</span><h1>A little star. A lot of sky.</h1>
      <p>Race 3,600 m to the crash mat. {label(bindings.forward)}{label(bindings.left)}{label(bindings.backward)}{label(bindings.right)} steers within the lane; hold {label(bindings.look)} to check above you.</p></div>
      <div className="race-page-actions"><button onClick={()=>pause(!runtime.paused)} disabled={binding!==null}>{paused?'Resume':'Pause'} · Esc</button><button onClick={reset}>Restart race</button></div></div>
    <div className="movement-layout">
      <div className="movement-stage">
        <Canvas camera={{position: [0,32,0], up: [0,0,-1], fov: 65, far: 5000}} fallback={<p>WebGL is unavailable. Enable hardware acceleration to run this test.</p>}>
          <RaceScene runtime={runtime} report={setHud}/>
        </Canvas>
        <div className="movement-status">{paused ? 'PAUSED' : hud.look ? 'LOOKING UP' : hud.finish !== null ? 'LANDED' : hud.brake ? 'AIR BRAKE ACTIVE' : 'FREEFALL'}<span>{hud.speed.toFixed(0)} m/s · {Math.ceil(hud.remaining)} m to finish</span></div>
        <div className="race-place">{hud.place} / 4 <small>POSITION</small></div>
        <RaceOverlay hud={hud} paused={paused} useKey={label(bindings.use)} boostKey={label(bindings.boost)} dodgeKey={label(bindings.dodge)}/>
        {!paused && hud.finish === null && hud.remaining <= 100 && <div className="race-countdown">{Math.ceil(hud.remaining)} m<br/><small>BRACE FOR SQUISH</small></div>}
        {!paused && hud.finish !== null && <div className="race-result"><strong>SPLAT! {hud.place} / 4</strong><span>{hud.finish.toFixed(2)} seconds · {hud.allFinished ? 'Everyone landed.' : 'Watch the others land…'}</span><button onClick={reset}>Race again</button></div>}
        <RaceCreationHud key={voice.state.session} host={voice.host} paused={paused} finished={hud.finish!==null} marker={hud.creationMarker} live={!!voice.live} mockText={voice.mockText} blockedReason={voiceBlockedReason} inputNotice={voiceInputNotice} microphone={microphone}/>
        {paused && <div className="movement-pause"><h2>Paused</h2><p>{label(bindings.forward)}{label(bindings.left)}{label(bindings.backward)}{label(bindings.right)} to steer · hold {label(bindings.brake)} to brake</p>
          {runtime.race.elapsed===0&&<div className="race-mic-setup">
            <strong>★ Yellow star · voice creation</strong>
            <p role="status">{voiceBlockedReason||'Microphone ready. Collect the star, then hold Space until you finish speaking.'}</p>
            {!microphone.ready&&<><button disabled={microphone.phase==='preparing'} onClick={()=>{void voice.recorder.prepare();}}>{microphone.phase==='preparing'?'Preparing microphone…':'Enable microphone'}</button><small>{microphone.message}</small></>}
          </div>}
          <button disabled={binding !== null} onClick={event => {event.currentTarget.blur(); pause(false);}}>Resume / start fall</button>
          <small>Escape resumes · leaving this window pauses</small></div>}
      </div>
      <div className="race-dashboard">
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
      </div>
    </div>
  </section>;
}
