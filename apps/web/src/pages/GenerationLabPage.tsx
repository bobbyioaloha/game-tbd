import { useEffect, useRef, useState } from 'react';
import { PIPELINE_DEADLINE_MS, proceduralFixtures, generationEvaluationPrompts, PipelineRequestSchema, type GeometryMode, type CreationDesign, type CreationSpec, type PipelineEvent, type PipelineProfile, type StageMetric, type LiveUsage } from '@sky/shared';
import { LabPreview } from '../generation/LabPreview';
import { LabHistory } from '../generation/LabHistory';
import { attemptMetrics, geometryModeLabels, HISTORY_LIMIT, type LabAttempt } from '../generation/lab-history';
import { loadPipelineProfiles, runLabPipeline } from '../generation/pipeline-client';

export function GenerationLabPage() {
  const [text,setText] = useState('giant rubber duck');
  const [geometryMode,setGeometryMode] = useState<GeometryMode>('primitives');
  const [distance,setDistance] = useState(7);
  const [spin,setSpin] = useState(false);
  const [profiles,setProfiles] = useState<PipelineProfile[]>([]);
  const [profileId,setProfileId] = useState('mock');
  const [paidConsent,setPaidConsent] = useState(false);
  const [liveUsage,setLiveUsage] = useState<LiveUsage>();
  const [profileError,setProfileError] = useState('');
  const [refresh,setRefresh] = useState(0);
  const [spec,setSpec] = useState<CreationSpec>(proceduralFixtures[0].spec);
  const [design,setDesign] = useState<CreationDesign>();
  const [angle,setAngle] = useState(-0.35);
  const [busy,setBusy] = useState(false);
  const [elapsed,setElapsed] = useState(0);
  const [status,setStatus] = useState('Choose a pipeline. One attempt runs design, then geometry.');
  const [events,setEvents] = useState<PipelineEvent[]>([]);
  const [metrics,setMetrics] = useState<StageMetric[]>([]);
  const [history,setHistory] = useState<LabAttempt[]>([]);
  const pending = useRef<AbortController | null>(null);
  const requestId = useRef(0), started = useRef(0);
  const profile = profiles.find(item => item.id === profileId);
  const liveAttemptAvailable = Boolean(profile?.available && liveUsage?.enabled && !liveUsage.busy && liveUsage.attemptsRemaining > 0);
  const canGenerate = !busy && Boolean(profile?.available) && (profile?.mode !== 'live' || (liveAttemptAvailable && paidConsent));
  const terminal = events.at(-1);
  const providerDiagnostic = terminal?.type === 'failed' ? terminal.error.provider : undefined;
  useEffect(() => {
    const controller = new AbortController();
    void loadPipelineProfiles(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setProfiles(data.profiles);setLiveUsage(data.liveUsage);setProfileError('');
    }).catch(() => {
      if (!controller.signal.aborted) {
        setProfiles([]);setLiveUsage(undefined);
        setProfileError('Cannot load profiles. Start the server and refresh.');
      }
    });
    return () => controller.abort();
  },[refresh]);
  useEffect(() => () => {requestId.current++;pending.current?.abort();},[]);
  useEffect(() => {setPaidConsent(false);},[text,profileId,geometryMode,refresh]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setElapsed((performance.now()-started.current)/1000),100);
    return () => clearInterval(timer);
  },[busy]);
  async function generate() {
    if (pending.current || !profile || !canGenerate) return;
    const input = PipelineRequestSchema.safeParse({text,profileId,geometryMode,
      ...(profile.mode === 'live' ? {paidAttempt:{id:crypto.randomUUID(),confirmed:true}} : {}),
    });
    if (!input.success) {setStatus('Use one to ten words, at most 200 characters.');return;}
    setPaidConsent(false);
    const id = ++requestId.current;
    const controller = new AbortController();pending.current = controller;
    started.current = performance.now();setElapsed(0);setBusy(true);setEvents([]);setMetrics([]);setDesign(undefined);
    setStatus('Starting attempt…');
    const collected:PipelineEvent[] = [];
    let outcome:LabAttempt['outcome'] = 'failed', resultSpec:CreationSpec | undefined;
    let message = 'Pipeline request failed.';
    try {
      await runLabPipeline(input.data,controller.signal,event => {
        if (id !== requestId.current || controller.signal.aborted) return;
        collected.push(event);setEvents([...collected]);
        if (event.type === 'stage') setStatus({design:'Designing…',geometry:geometryMode === 'primitives' ? 'Composing parts…' : 'Building mesh…',validation:'Validating visual…'}[event.stage]);
        if (event.type === 'design') {setDesign(event.design);setMetrics([event.metric]);}
        if (event.type === 'geometry') setMetrics(previous => [...previous,event.metric]);
        if (event.type === 'complete') {
          resultSpec = event.spec;setSpec(event.spec);setMetrics(event.metrics);
          outcome = 'ready';message = 'Ready: '+geometryModeLabels[geometryMode]+', one effect.';setStatus(message);
        }
        if (event.type === 'failed') {
          outcome = 'failed';setMetrics(event.metrics);
          message = event.stage+' failed · '+event.error.code+': '+event.error.message;setStatus(message);
        }
      });
    } catch (error) {
      outcome = controller.signal.aborted ? 'cancelled' : 'failed';
      resultSpec = undefined;
      message = controller.signal.aborted ? 'Cancelled. The attempt will not retry.' : error instanceof Error ? error.message : 'Pipeline request failed.';
      if (id === requestId.current) setStatus(message);
    } finally {
      if (id === requestId.current) {
        const duration = (performance.now()-started.current)/1000;
        pending.current = null;setBusy(false);setElapsed(duration);
        setRefresh(value => value+1);
        setHistory(previous => [{id,prompt:input.data.text,profile,geometryMode,outcome,message,elapsedMs:duration*1000,spec:resultSpec,events:collected,recognition:'unrated' as const},...previous].slice(0,HISTORY_LIMIT));
      }
    }
  }
  function inspectAttempt(item:LabAttempt) {
    if (item.spec) setSpec(item.spec);
    setEvents(item.events);
    setElapsed(item.elapsedMs/1000);
    setStatus('Inspecting '+item.prompt+' / '+geometryModeLabels[item.geometryMode]+': '+item.message);
    setMetrics(attemptMetrics(item.events));
    const handoff = item.events.find(event => event.type === 'design');
    setDesign(handoff?.design);
  }
  return <main className="lab">
    <span className="eyebrow">TWO-STAGE GENERATION / ISOLATED TEST LAB</span>
    <h1>Design it. Build it.</h1>
    <p>Compare procedural parts with raw mesh generation. One design call, one visual call, a {PIPELINE_DEADLINE_MS/1000}-second deadline.</p>
    <div className="workspace generation-workspace">
      <section className="viewport" aria-label="Creation preview">
        <div className="viewer-label"><span>{spec.displayName}</span><span>CREATION V2</span></div>
        <LabPreview spec={spec} angle={angle} distance={distance} spin={spin}/>
        <label className="rotation">Rotate <input aria-label="Rotate creation" type="range" min={-3.14} max={3.14} step={0.01} value={angle} onChange={event => setAngle(Number(event.target.value))}/></label>
      </section>
      <aside>
        <p>Preview shows the last valid result. {spec.appearance.type === 'primitives'
          ? spec.appearance.primitives.length+' parts compiled into one mesh.'
          : spec.appearance.triangles.length+' raw triangles.'}</p>
        <div className="preview-controls">
          <label>Viewing distance <select aria-label="Viewing distance" value={distance} onChange={event => setDistance(Number(event.target.value))}>
            <option value={7}>Close · 7 m</option><option value={15}>15 m</option><option value={30}>30 m</option>
          </select></label>
          <label><input type="checkbox" checked={spin} onChange={event => setSpin(event.target.checked)}/> Spin preview</label>
        </div>
        <form onSubmit={event => {event.preventDefault();void generate();}}>
          <label htmlFor="geometry-mode">Visual method</label>
          <select id="geometry-mode" className="lab-input" value={geometryMode} disabled={busy} onChange={event => setGeometryMode(event.target.value as GeometryMode)}>
            <option value="primitives">Procedural parts</option><option value="mesh">Raw mesh · experimental</option>
          </select>
          <label htmlFor="pipeline-profile">Pipeline profile</label>
          <select id="pipeline-profile" className="lab-input" value={profileId} disabled={busy} onChange={event => setProfileId(event.target.value)}>
            {profiles.map(item => <option key={item.id} value={item.id}>{item.label}{item.available ? '' : ' · unavailable'}</option>)}
          </select>
          {profile && <p>Design: {profile.design.model} / {profile.design.reasoning}<br/>Visuals: {profile.geometry.model} / {profile.geometry.reasoning}<br/>
            Token budgets: {profile.design.maxOutputTokens} + {profile.geometry.maxOutputTokens}</p>}
          {profile?.unavailableReason && <p role="note">{profile.unavailableReason}</p>}
          {profileError && <p role="alert">{profileError}</p>}
          {profile?.mode === 'mock' && <p role="note">{geometryMode === 'primitives'
            ? 'Mock mode loads a preset model for each listed prompt. It does not use AI; custom ideas require a live profile.'
            : 'Raw mesh mock always loads the wind crystal, regardless of the prompt. Use a live profile to generate other meshes.'}</p>}
          <label htmlFor="evaluation-prompt">Comparison prompt</label>
          <select id="evaluation-prompt" className="lab-input" disabled={busy} value={generationEvaluationPrompts.find(prompt => prompt === text) ?? ''} onChange={event => setText(event.target.value)}>
            <option value="" disabled>Custom prompt</option>
            {generationEvaluationPrompts.map(prompt => <option key={prompt}>{prompt}</option>)}
          </select>
          <label htmlFor="creation-prompt">Describe your creation · 10 words maximum</label>
          <input id="creation-prompt" value={text} disabled={busy} maxLength={200} onChange={event => setText(event.target.value)}/>
          {profile?.mode === 'live' && <div className="paid-attempt">
            <p role="note">Paid attempt: up to two API calls using the models and token limits above. Failed or cancelled calls may still incur charges.</p>
            {liveUsage && <p role="status">{liveUsage.enabled ? 'Paid lab enabled' : 'Paid lab disabled'} · {liveUsage.attemptsRemaining} / {liveUsage.maxAttempts} attempts remaining this server start.{liveUsage.busy ? ' Another paid attempt is running.' : ''}</p>}
            {liveUsage?.attemptsRemaining === 0 && <p role="note">Allowance exhausted. Restart bun run dev:live deliberately to reset it.</p>}
            <label><input type="checkbox" checked={paidConsent}
              disabled={busy || !liveAttemptAvailable}
              onChange={event => setPaidConsent(event.target.checked)}/> Allow this paid attempt</label>
          </div>}
          <button className="generate" disabled={!canGenerate}>{busy ? 'Generating…' : profile?.mode === 'live' ? 'Generate · up to 2 API calls' : 'Load mock example'}</button>
          {busy && <button type="button" className="generate secondary" onClick={() => pending.current?.abort()}>Cancel attempt</button>}
        </form>
        <p role="status">{status}</p>
        {providerDiagnostic && <div className="provider-diagnostic" role="note" aria-label="API error details">
          <p>Model: <code>{providerDiagnostic.model}</code>
            {providerDiagnostic.httpStatus !== undefined && <> · HTTP {providerDiagnostic.httpStatus}</>}
            {providerDiagnostic.code && <><br/>Provider code: <code>{providerDiagnostic.code}</code></>}
            {providerDiagnostic.transportCode && <><br/>Connection code: <code>{providerDiagnostic.transportCode}</code></>}
            {providerDiagnostic.parameter && <><br/>Parameter: <code>{providerDiagnostic.parameter}</code></>}
            {providerDiagnostic.requestId && <><br/>Request ID: <code>{providerDiagnostic.requestId}</code></>}
          </p>
        </div>}
        <p>Elapsed: {elapsed.toFixed(1)} s · Limit: {PIPELINE_DEADLINE_MS/1000} s total</p>
        {profile?.mode === 'mock' && <p>{geometryMode === 'primitives' ? 'Each listed prompt has its own authored model. Unsupported custom prompts are rejected.' : 'Mock raw geometry always returns the wind crystal.'} No API calls. Mock timings and shapes do not measure model quality.</p>}
        <div className="lab-actions"><button disabled={busy} onClick={() => setRefresh(value => value+1)}>Refresh profiles</button></div>
        {metrics.map(metric => <p key={metric.stage}>{metric.stage}: {(metric.durationMs/1000).toFixed(2)} s · {metric.model}<br/>
          {metric.usage ? metric.usage.inputTokens+' input / '+metric.usage.outputTokens+' output tokens'+(metric.usage.reasoningTokens === undefined ? '' : ' ('+metric.usage.reasoningTokens+' reasoning)') : 'Token usage unavailable'}</p>)}
      </aside>
    </div>
    {design && <section className="json-inspector"><h2>Design handoff: {design.displayName}</h2><p>{design.visualBrief}</p><p>{design.description}</p><pre>{JSON.stringify(design.effect,null,2)}</pre></section>}
    <details className="json-inspector"><summary>Inspect validated spec and pipeline events</summary><pre>{JSON.stringify({spec,events},null,2)}</pre></details>
    <LabHistory history={history} busy={busy} onInspect={inspectAttempt}
      onRate={(id,recognition) => setHistory(previous => previous.map(item => item.id === id ? {...item,recognition} : item))}/>
  </main>;
}
