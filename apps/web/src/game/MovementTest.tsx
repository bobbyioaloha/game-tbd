import { useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PracticeRace, RACER_COLORS } from './practice-race';
import { RaceScene, defaultBindings, initialRaceHud, type RaceRuntime } from './RaceScene';
import { BRAKE_SPEED } from './freefall-controller';
import './movement-test.css';

const defaults = defaultBindings;
type Action = keyof typeof defaults;
const names: Record<Action, string> = {left: 'Left', right: 'Right', forward: 'Forward', backward: 'Back', brake: 'Air brake', look: 'Look up', use: 'Use item'};
type Bindings = typeof defaults;
type Runtime = RaceRuntime;
const label = (code: string) => code.replace(/^Key/, '').replace(/^Digit/, '');
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
const initialHud = initialRaceHud;

export function MovementTest() {
  const [runtime] = useState<Runtime>(() => ({race: new PracticeRace(), keys: new Set(), paused: true, bindings: {...defaults}, clock: 0, generation: 0, fireRequested: false}));
  const [paused, setPaused] = useState(true);
  const [hud, setHud] = useState(initialHud);
  const [bindings, setBindings] = useState<Bindings>({...defaults});
  const [binding, setBinding] = useState<Action | null>(null);
  const [notice, setNotice] = useState('');
  const pause = useCallback((value: boolean) => {
    runtime.paused = value;
    runtime.keys.clear(); runtime.fireRequested=false; runtime.target=undefined;
    runtime.race.racers[0].controller.braking = false;
    setPaused(value);
    setHud(current => ({...current, brake: false}));
  }, [runtime]);
  const reset = () => {
    pause(true);
    runtime.race.reset(); runtime.clock = 0; runtime.generation++;
    setHud(initialHud);
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (binding) {
        event.preventDefault();
        if (event.repeat) return;
        if (event.code === 'Escape') { setBinding(null); return; }
        if (!/^Key[A-Z]$/.test(event.code)) { setNotice('Choose a letter key. Escape cancels.'); return; }
        if (['KeyL'].includes(event.code)) { setNotice('L is reserved for dodge.'); return; }
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
      if (Object.values(runtime.bindings).includes(event.code)) {
        event.preventDefault();
        if (!runtime.paused) {
          runtime.keys.add(event.code);
          if(event.code===runtime.bindings.use&&!event.repeat)runtime.fireRequested=true;
        }
      }
    };
    const up = (event: KeyboardEvent) => { runtime.keys.delete(event.code); };
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
      runtime.keys.clear(); runtime.fireRequested=false; runtime.target=undefined;
      runtime.paused = true;
    };
  }, [runtime, binding, pause]);

  return <section className="movement-test">
    <div className="movement-heading"><div><span className="eyebrow">FOUR RACERS / CRASH-MAT SPRINT</span><h1>A little star. A lot of sky.</h1>
      <p>Race 3,600 m to the crash mat. WASD steers within the lane; hold I to check above you.</p></div>
      <button onClick={reset}>Restart race</button></div>
    <div className="movement-layout">
      <div className="movement-stage">
        <Canvas camera={{position: [0,32,0], up: [0,0,-1], fov: 65, far: 5000}} fallback={<p>WebGL is unavailable. Enable hardware acceleration to run this test.</p>}>
          <RaceScene runtime={runtime} report={setHud}/>
        </Canvas>
        <div className="movement-status">{paused ? 'PAUSED' : hud.look ? 'LOOKING UP' : hud.finish !== null ? 'LANDED' : hud.brake ? 'AIR BRAKE ACTIVE' : 'FREEFALL'}<span>{Math.ceil(hud.remaining)} m to finish</span></div>
        <div className="race-place">{hud.place} / 4 <small>POSITION</small></div>
        {!paused && hud.finish === null && <div className={'race-reticle '+(hud.targetName?'locked':'')}><span>＋</span><small>{hud.targetName || (hud.look?'AIM UP':'AIM DOWN')}</small></div>}
        {!paused && <svg className="race-leaders" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {hud.markers.map((marker,index)=><line key={marker.id} x1={marker.left} y1={marker.top} x2="80" y2={25+index*17} stroke={RACER_COLORS[marker.id]} vectorEffect="non-scaling-stroke"/>)}
        </svg>}
        {!paused && hud.markers.map((marker,index)=><div key={marker.id}>
          <div className={'rival-box '+(marker.locked?'locked':'')} style={{left:marker.left+'%',top:marker.top+'%',color:RACER_COLORS[marker.id]}}>
            {marker.edge&&<span style={{display:'block',transform:'rotate('+marker.angle+'deg)'}}>↑</span>}
          </div>
          <div className="rival-label" style={{left:'80%',top:(25+index*17)+'%',color:RACER_COLORS[marker.id]}}><strong>{marker.name}</strong><small>{marker.gap}{marker.locked?' · TARGET':''}</small></div>
        </div>)}
        {!paused && hud.finish === null && hud.remaining <= 100 && <div className="race-countdown">{Math.ceil(hud.remaining)} m<br/><small>BRACE FOR SQUISH</small></div>}
        {!paused && hud.finish !== null && <div className="race-result"><strong>SPLAT! {hud.place} / 4</strong><span>{hud.finish.toFixed(2)} seconds · {hud.allFinished ? 'Everyone landed.' : 'Watch the others land…'}</span><button onClick={reset}>Race again</button></div>}
        {paused && <div className="movement-pause"><h2>Paused</h2><p>WASD to steer · hold {label(bindings.brake)} to brake</p>
          <button disabled={binding !== null} onClick={event => {event.currentTarget.blur(); pause(false);}}>Resume / start fall</button>
          <small>Escape resumes · leaving this window pauses</small></div>}
      </div>
      <aside className="movement-panel">
        <span className="eyebrow">DOWNWARD SPEED</span>
        <div className="movement-speed">{hud.speed.toFixed(1)} <small>m/s</small></div>
        <div className="movement-meter">
          <progress aria-label="Downward speed" value={hud.speed} max={45}/>
          <span className="movement-brake-mark" style={{left: `${BRAKE_SPEED/45*100}%`}}/>
        </div>
        <div className="movement-scale"><span>0</span><span>45 m/s boost cap</span></div>
        <p>Brake target: 8 m/s<br/>Gravity: 9.81 m/s²<br/>Steering: 12 m/s</p>
        <p>{hud.time.toFixed(1)} s elapsed · 40 × 40 m lane<br/>X {hud.x.toFixed(1)} m · Z {hud.z.toFixed(1)} m</p>
        <button onClick={() => pause(!runtime.paused)} disabled={binding !== null}>{paused ? 'Resume' : 'Pause'} · Esc</button>
        <h2>Held item</h2><p className="race-inventory">{hud.item}</p>
        <p>J: use / fire · {hud.look?'shoot upward':'shoot downward'}<br/>{hud.effects || 'No active effects'}</p>
        <p>Striped boxes: random item. Mint rings: 4-second boost. Fridges, satellites, balloons and sofas: dodge!</p>
        <h2>Controls</h2><p>Click a key to rebind. Uses physical key positions; changes last for this session.</p>
        <div className="movement-bindings">{(Object.keys(defaults) as Action[]).map(action =>
          <button key={action} aria-label={`Rebind ${names[action]}`} onClick={() => {pause(true); setBinding(action); setNotice('Press a letter key. Escape cancels.');}}>
            <span>{names[action]}</span><kbd>{binding === action ? '…' : label(bindings[action])}</kbd>
          </button>)}</div>
        <p role="status">{notice}</p>
        <small>Reserved: L dodge · Space voice.<br/>Rivals collect and use items. Dodge and voice are not connected.</small>
      </aside>
    </div>
  </section>;
}
