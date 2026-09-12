import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { creationFixtures, GenerationRequestSchema, type CreationSpec } from '@sky/shared';
import { PowerUpModel } from '../components/PowerUpModel';
import { httpCreationClient, mockCreationClient } from '../generation/creation-client';

export function GenerationLabPage() {
  const [text, setText] = useState('a wind crystal');
  const [source, setSource] = useState('server');
  const [spec, setSpec] = useState<CreationSpec>(creationFixtures[0]);
  const [angle, setAngle] = useState(0);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState('Ready. The server provider is a mock until the live adapter is implemented.');
  const [result, setResult] = useState<unknown>(null);
  const pending = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const started = useRef(0);
  useEffect(() => () => { requestId.current++; pending.current?.abort(); }, []);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setElapsed((performance.now()-started.current)/1000), 100);
    return () => clearInterval(timer);
  }, [busy]);
  async function generate() {
    if (pending.current) return;
    const input = GenerationRequestSchema.safeParse({text});
    if (!input.success) { setStatus('Use one to ten words, at most 200 characters.'); return; }
    const id = ++requestId.current;
    const controller = new AbortController(); pending.current = controller;
    started.current = performance.now(); setElapsed(0); setBusy(true); setResult(null);
    setStatus(source === 'server' ? 'Requesting /api/creations…' : 'Generating in the browser mock…');
    try {
      const response = await (source === 'server' ? httpCreationClient : mockCreationClient).generate(input.data, {signal: controller.signal});
      if (id !== requestId.current) return;
      setResult(response);
      if (response.ok) { setSpec(response.spec); setStatus('Validated creation ready.'); }
      else setStatus(response.error.message);
    } catch {
      if (id === requestId.current) setStatus('Generation failed or was cancelled.');
    } finally {
      if (id === requestId.current) {
        pending.current = null; setBusy(false); setElapsed((performance.now()-started.current)/1000);
      }
    }
  }
  function cancel() {
    requestId.current++; pending.current?.abort(); pending.current = null;
    setBusy(false); setStatus('Cancelled. Start another test explicitly.');
  }
  return <main className="lab">
    <span className="eyebrow">SERVER GENERATION / TEST BENCH</span>
    <h1>Describe it. Inspect it.</h1>
    <p>Test creation generation without a game run or microphone. The current provider returns fixtures; no API key is needed.</p>
    <div className="workspace">
      <section className="viewport" aria-label="Creation preview">
        <div className="viewer-label"><span>{spec.displayName}</span><span>CREATION V2</span></div>
        <Canvas camera={{position:[0,0.5,7],fov:45}} fallback={<p>WebGL unavailable.</p>}>
          <ambientLight intensity={1.5}/><directionalLight position={[3,5,4]} intensity={3}/>
          <group rotation={[0,angle,0]}><PowerUpModel spec={spec}/></group>
        </Canvas>
        <label className="rotation">Rotate <input aria-label="Rotate creation" type="range" min={-3.14} max={3.14} step={0.01} value={angle} onChange={event => setAngle(Number(event.target.value))}/></label>
      </section>
      <aside>
        <form onSubmit={event => {event.preventDefault(); void generate();}}>
          <label htmlFor="creation-source">Generation source</label>
          <select id="creation-source" className="lab-input" value={source} disabled={busy} onChange={event => setSource(event.target.value)}>
            <option value="server">Server endpoint (mock provider)</option>
            <option value="browser">Browser mock (offline)</option>
          </select>
          <label htmlFor="creation-prompt">Describe your creation · 10 words maximum</label>
          <input id="creation-prompt" value={text} disabled={busy} maxLength={200} onChange={event => setText(event.target.value)}/>
          <button className="generate" disabled={busy}>{busy ? 'Generating…' : 'Generate creation'}</button>
          {busy && <button type="button" className="generate secondary" onClick={cancel}>Cancel request</button>}
        </form>
        <p role="status">{status}</p><p>Elapsed: {elapsed.toFixed(1)} s</p>
        <div className="lab-actions">{creationFixtures.map(fixture =>
          <button key={fixture.id} disabled={busy} onClick={() => {setSpec(fixture); setText(fixture.displayName); setResult(null); setStatus('Local fixture loaded. Submit to test the endpoint.');}}>{fixture.displayName}</button>
        )}</div>
        <h2>{spec.displayName}</h2><p>{spec.description}</p>
        <p>{spec.appearance.type === 'mesh' ? spec.appearance.vertices.length+' vertices · '+spec.appearance.triangles.length+' triangles' : spec.appearance.primitives.length+' primitives'}</p>
        <p>{spec.effects.map(effect => effect.type).join(', ')}</p>
      </aside>
    </div>
    <details className="json-inspector"><summary>Inspect validated spec / last response</summary><pre>{JSON.stringify(result ?? spec, null, 2)}</pre></details>
  </main>;
}
