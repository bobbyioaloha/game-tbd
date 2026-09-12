import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { DemoGame } from '../game/demo-game';
import { useGameInput } from '../game/use-game-input';
import type { SteeringInput } from '../game/player-controller';
import { mockCreationClient } from '../generation/creation-client';
import { createSimulatedTranscriber } from '../voice/simulated-transcriber';
import { PowerUpModel } from '../components/PowerUpModel';

function Scene({game, steering}: {game: DemoGame; steering: React.RefObject<SteeringInput>}) {
  const state = useSyncExternalStore(game.subscribe, game.getSnapshot);
  useFrame((_, dt) => game.step(dt, steering.current));
  return <>
    <ambientLight intensity={1.6}/><directionalLight position={[4,10,8]} intensity={3}/>
    <mesh position={[state.player[0],0,state.player[2]]}>
      <sphereGeometry args={[0.45,16,12]}/>
      <meshStandardMaterial color={state.effects.protectionSeconds > 0 ? '#bca5ff' : '#ffffff'}/>
    </mesh>
    <group position={[0,-state.player[1],0]}>
      {state.voice && <group position={state.voice.position}>
        <mesh rotation={[0,0,Math.PI/4]}><boxGeometry args={[1.4,1.4,0.7]}/><meshStandardMaterial color="#ffcf65" emissive="#775000"/></mesh>
      </group>}
      {state.creation && <group position={state.creation.position}><PowerUpModel spec={state.creation.spec}/></group>}
      {state.obstacles.map(obstacle => <mesh key={obstacle.id} position={obstacle.position}>
        <boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#eb7b78"/>
      </mesh>)}
    </group>
    {Array.from({length: 14}, (_, i) => <mesh key={i} position={[-10, ((i*5 + -state.player[1])%70)-40, -3]}>
      <boxGeometry args={[0.1,1,0.1]}/><meshBasicMaterial color="#66879c"/>
    </mesh>)}
  </>;
}
export function GamePage() {
  const [text, setText] = useState('a wind crystal');
  const transcript = useRef(text); transcript.current = text;
  // Inject your partner's PlayerController as DemoGame's third argument.
  const game = useMemo(() => new DemoGame(mockCreationClient, createSimulatedTranscriber(() => transcript.current)), []);
  const loop = game.creations;
  const steering = useGameInput(loop);
  const state = useSyncExternalStore(game.subscribe, game.getSnapshot);
  useEffect(() => () => game.dispose(), [game]);
  return <main className="lab">
    <span className="eyebrow">VOICE → CREATION / PLAYABLE SKELETON</span>
    <h1>Catch an opportunity.</h1>
    <p>Gold diamond: Voice Power Up. White orb: you. WASD to steer. Red cubes: obstacles.</p>
    <div className="workspace">
      <section className="viewport game-view" aria-label="Falling game">
        <Canvas camera={{position:[0,-8,35],fov:65}} fallback={<p>WebGL unavailable.</p>}><Scene game={game} steering={steering}/></Canvas>
        <div className="viewer-label"><span>{Math.round(-state.player[1])} m fallen</span><span>{state.phase.toUpperCase()}</span></div>
      </section>
      <aside>
        <h2>One pickup. One attempt.</h2>
        <p role="status">{state.message}</p>
        <label htmlFor="transcript">Simulated transcript</label>
        <input id="transcript" className="lab-input" value={text} onChange={event => setText(event.target.value)} disabled={!['available','prompted'].includes(state.phase)}/>
        <p>No microphone or AI calls yet. Hold Space after the gold pickup, or hold the button below. Releasing submits this text.</p>
        <button className="generate" disabled={!['prompted','recording'].includes(state.phase)}
          onPointerDown={event => {event.currentTarget.setPointerCapture(event.pointerId); loop.startRecording();}}
          onPointerUp={() => {void loop.finishRecording();}}
          onPointerCancel={loop.cancelRecording}
          onKeyDown={event => {if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {event.preventDefault(); loop.startRecording();}}}
          onKeyUp={event => {if (event.key === ' ' || event.key === 'Enter') {event.preventDefault(); void loop.finishRecording();}}}
        >{state.phase === 'recording' ? 'Release to submit' : 'Hold to speak (simulation)'}</button>
        <div className="lab-actions">
          <button onClick={event => {event.currentTarget.blur(); game.startNewRun();}}>Start new run</button>
          <button onClick={() => game.end()} disabled={!state.running}>End run</button>
        </div>
        <p>Fall speed: {state.fallSpeed} m/s<br/>
        Slow: {state.effects.slow.remaining.toFixed(1)} s · Protection: {state.effects.protectionSeconds.toFixed(1)} s<br/>
        Obstacles remaining: {state.obstacles.length}</p>
        <small>10 seconds to begin speaking; 8 seconds maximum recording. Failures consume the attempt. New runs are explicit.</small>
      </aside>
    </div>
  </main>;
}
