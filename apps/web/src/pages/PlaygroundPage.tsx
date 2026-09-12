import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { fixtures, type PowerUpSpec } from '@sky/shared';
import { PowerUpModel } from '../components/PowerUpModel';
import { mockGenerationClient } from '../generation/client';
export function PlaygroundPage() {
  const [spec,setSpec]=useState<PowerUpSpec>(fixtures[0]);
  const [angle,setAngle]=useState(0);
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  return <main className="lab">
    <section className="intro"><span className="eyebrow">EXPERIMENT 001 / POWER-UP PLAYGROUND</span><h1>A little imagination.<br/><em>A softer landing.</em></h1><p>Three ideas, ready for freefall. Inspect the shared models before they take to the sky.</p></section>
    <div className="workspace"><section className="viewport" aria-label="3D power-up viewer">
      <div className="viewer-label"><span>LIVE MODEL</span><span>SPEC V1 · METERS</span></div>
      <Canvas camera={{position:[0,1.1,6.5],fov:45}} fallback={<p>WebGL is unavailable. Use a browser with hardware acceleration.</p>}>
        <ambientLight intensity={1.5}/><directionalLight position={[3,5,4]} intensity={3}/>
        <pointLight position={[-3,1,-2]} color="#ab9eff" intensity={12}/>
        <group rotation={[0,angle,0]}><PowerUpModel spec={spec}/></group>
      </Canvas>
      <label className="rotation">Rotate model <input aria-label="Rotate model" type="range" min={-3.14} max={3.14} step={0.01} value={angle} onChange={e=>setAngle(Number(e.target.value))}/></label>
    </section>
    <aside><span className="eyebrow">CHOOSE A COLLECTIBLE</span><div className="fixture-list">{fixtures.map((fixture,i)=><button className={spec.id===fixture.id?'fixture selected':'fixture'} key={fixture.id} onClick={()=>{setSpec(fixture);setMessage('');}}><span className="number">0{i+1}</span><span>{fixture.displayName}<small>{['SLOW DESCENT','INVULNERABILITY','CLEAR OBSTACLES'][i]}</small></span><span>↗</span></button>)}</div>
      <h2>{spec.displayName}</h2><p>{spec.description}</p><div className="tags"><span>{spec.appearance.primitives.length} primitives</span><span>{spec.effects.length} effect</span><span>1 m pickup radius</span></div>
      <form onSubmit={async e=>{e.preventDefault();setBusy(true);try {const result=await mockGenerationClient.generate({text});if(result.ok){setSpec(result.spec);setMessage('Mock complete. Your collectible is ready.');}else setMessage(result.error.message);}finally{setBusy(false);}}}>
        <label htmlFor="request">TRY A REQUEST <small>10 words max · mock generator</small></label>
        <input id="request" value={text} onChange={e=>setText(e.target.value)} placeholder="Give me an angry sun" maxLength={200}/>
        <button className="generate" disabled={busy}>{busy?'Assembling…':'Generate power-up →'}</button>
        <p role="status" className="status">{message}</p>
      </form>
    </aside></div><footer>DECLARATIVE MODELS. BOUNDED EFFECTS. UNBOUNDED IDEAS.</footer>
  </main>;
}
