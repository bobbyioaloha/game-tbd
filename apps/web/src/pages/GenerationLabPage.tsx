import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { creationFixtures, PipelineRequestSchema, type CreationDesign, type CreationSpec, type PipelineEvent, type PipelineProfile, type StageMetric } from '@sky/shared';
import { PowerUpModel } from '../components/PowerUpModel';
import { loadPipelineProfiles, runLabPipeline } from '../generation/pipeline-client';

type HistoryItem = {id:number;prompt:string;profile:string;outcome:string;elapsed:number;spec?:CreationSpec;events:PipelineEvent[]};
export function GenerationLabPage() {
  const [text,setText] = useState('a wind crystal');
  const [profiles,setProfiles] = useState<PipelineProfile[]>([]);
  const [profileId,setProfileId] = useState('mock');
  const [profileError,setProfileError] = useState('');
  const [refresh,setRefresh] = useState(0);
  const [spec,setSpec] = useState<CreationSpec>(creationFixtures[0]);
  const [design,setDesign] = useState<CreationDesign>();
  const [angle,setAngle] = useState(0);
  const [busy,setBusy] = useState(false);
  const [elapsed,setElapsed] = useState(0);
  const [status,setStatus] = useState('Choose a pipeline. One attempt runs design, then geometry.');
  const [events,setEvents] = useState<PipelineEvent[]>([]);
  const [metrics,setMetrics] = useState<StageMetric[]>([]);
  const [history,setHistory] = useState<HistoryItem[]>([]);
  const pending = useRef<AbortController | null>(null);
  const requestId = useRef(0), started = useRef(0);
  const profile = profiles.find(item => item.id === profileId);
  useEffect(() => {
    const controller = new AbortController();
    void loadPipelineProfiles(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setProfiles(data.profiles);setProfileError('');
    }).catch(() => {
      if (!controller.signal.aborted) {
        setProfiles([]);
        setProfileError('Cannot load profiles. Start the server and refresh.');
      }
    });
    return () => controller.abort();
  },[refresh]);
  useEffect(() => () => {requestId.current++;pending.current?.abort();},[]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setElapsed((performance.now()-started.current)/1000),100);
    return () => clearInterval(timer);
  },[busy]);
  async function generate() {
    if (pending.current) return;
    const input = PipelineRequestSchema.safeParse({text,profileId});
    if (!input.success) {setStatus('Use one to ten words, at most 200 characters.');return;}
    const id = ++requestId.current;
    const controller = new AbortController();pending.current = controller;
    started.current = performance.now();setElapsed(0);setBusy(true);setEvents([]);setMetrics([]);setDesign(undefined);
    setStatus('Starting attempt…');
    const collected:PipelineEvent[] = [];
    let outcome = 'Failed', resultSpec:CreationSpec | undefined;
    try {
      await runLabPipeline(input.data,controller.signal,event => {
        if (id !== requestId.current || controller.signal.aborted) return;
        collected.push(event);setEvents([...collected]);
        if (event.type === 'stage') setStatus({design:'Designing…',geometry:'Building mesh…',validation:'Validating mesh…'}[event.stage]);
        if (event.type === 'design') {setDesign(event.design);setMetrics([event.metric]);}
        if (event.type === 'geometry') setMetrics(previous => [...previous,event.metric]);
        if (event.type === 'complete') {
          resultSpec = event.spec;setSpec(event.spec);setMetrics(event.metrics);
          outcome = 'Ready';setStatus('Ready: one validated mesh, one effect.');
        }
        if (event.type === 'failed') {
          outcome = 'Failed: '+event.stage;setMetrics(event.metrics);
          setStatus(event.stage+' failed · '+event.error.code+': '+event.error.message);
        }
      });
    } catch (error) {
      outcome = controller.signal.aborted ? 'Cancelled' : 'Failed';
      if (id === requestId.current) setStatus(controller.signal.aborted ? 'Cancelled. The attempt will not retry.' : error instanceof Error ? error.message : 'Pipeline request failed.');
    } finally {
      if (id === requestId.current) {
        const duration = (performance.now()-started.current)/1000;
        pending.current = null;setBusy(false);setElapsed(duration);
        setHistory(previous => [{id,prompt:input.data.text,profile:profile?.label ?? profileId,outcome,elapsed:duration,spec:resultSpec,events:collected},...previous].slice(0,8));
      }
    }
  }
  function inspectAttempt(item:HistoryItem) {
    if (item.spec) setSpec(item.spec);
    setEvents(item.events);
    setElapsed(item.elapsed);
    setStatus('Inspecting '+item.outcome+' · '+item.profile);
    const terminal = item.events.find(event => event.type === 'complete' || event.type === 'failed');
    setMetrics(terminal?.metrics ?? []);
    const handoff = item.events.find(event => event.type === 'design');
    setDesign(handoff?.design);
  }
  return <main className="lab">
    <span className="eyebrow">TWO-STAGE GENERATION / ISOLATED TEST LAB</span>
    <h1>Design it. Build it.</h1>
    <p>One attempt. A design call, then a mesh call. Both share a 30-second deadline.</p>
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
        <form onSubmit={event => {event.preventDefault();void generate();}}>
          <label htmlFor="pipeline-profile">Pipeline profile</label>
          <select id="pipeline-profile" className="lab-input" value={profileId} disabled={busy} onChange={event => setProfileId(event.target.value)}>
            {profiles.map(item => <option key={item.id} value={item.id}>{item.label}{item.available ? '' : ' · key needed'}</option>)}
          </select>
          {profile && <p>Design: {profile.design.model} / {profile.design.reasoning}<br/>Geometry: {profile.geometry.model} / {profile.geometry.reasoning}<br/>
            Token budgets: {profile.design.maxOutputTokens} + {profile.geometry.maxOutputTokens}</p>}
          {profile?.unavailableReason && <p role="note">{profile.unavailableReason}</p>}
          {profileError && <p role="alert">{profileError}</p>}
          <label htmlFor="creation-prompt">Describe your creation · 10 words maximum</label>
          <input id="creation-prompt" value={text} disabled={busy} maxLength={200} onChange={event => setText(event.target.value)}/>
          <button className="generate" disabled={busy || !profile?.available}>{busy ? 'Generating…' : profile?.mode === 'live' ? 'Generate · live API' : 'Run mock pipeline'}</button>
          {busy && <button type="button" className="generate secondary" onClick={() => pending.current?.abort()}>Cancel attempt</button>}
        </form>
        <p role="status">{status}</p><p>Elapsed: {elapsed.toFixed(1)} s / 30 s</p>
        {profile?.mode === 'mock' && <p>Mock design selects a fixture effect. Mock geometry always returns the wind crystal. No API calls.</p>}
        <div className="lab-actions"><button disabled={busy} onClick={() => setRefresh(value => value+1)}>Refresh profiles</button></div>
        {metrics.map(metric => <p key={metric.stage}>{metric.stage}: {(metric.durationMs/1000).toFixed(2)} s · {metric.model}<br/>
          {metric.usage ? metric.usage.inputTokens+' input / '+metric.usage.outputTokens+' output tokens'+(metric.usage.reasoningTokens === undefined ? '' : ' ('+metric.usage.reasoningTokens+' reasoning)') : 'Token usage unavailable'}</p>)}
      </aside>
    </div>
    {design && <section className="json-inspector"><h2>Design handoff: {design.displayName}</h2><p>{design.visualBrief}</p><p>{design.description}</p><pre>{JSON.stringify(design.effect,null,2)}</pre></section>}
    <details className="json-inspector"><summary>Inspect validated spec and pipeline events</summary><pre>{JSON.stringify({spec,events},null,2)}</pre></details>
    <section className="json-inspector"><h2>Session history</h2><p>Last eight attempts in this tab. Select a result to inspect it.</p>
      {history.map(item => <div className="history-row" key={item.id}><span>{item.prompt} · {item.profile} · {item.outcome} · {item.elapsed.toFixed(1)} s</span>
        <button disabled={busy} onClick={() => inspectAttempt(item)}>Inspect</button></div>)}
    </section>
  </main>;
}
