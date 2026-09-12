import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { raceEventFixtures, type VoiceRequest } from '@sky/shared';
import { RaceEventHost } from '../game/race-event-host';
import type { PracticeRace } from '../game/practice-race';
import { loadPipelineProfiles } from '../generation/pipeline-client';
import { MicrophoneRecorder } from './recorder';
import { createAudioRaceEventClient } from './race-event-voice-client';
import { RecorderControls } from './RecorderControls';

type Configuration=Omit<VoiceRequest,'captureMs'>;
export function useRaceVoice(race:PracticeRace) {
  const [recorder]=useState(()=>new MicrophoneRecorder());
  const [profileId,setProfileId]=useState('mock'),[mockText,setMockText]=useState(raceEventFixtures[0].prompt);
  const [armed,setArmed]=useState(false),[refresh,setRefresh]=useState(0);
  const [profiles,setProfiles]=useState<Awaited<ReturnType<typeof loadPipelineProfiles>>>();
  const [error,setError]=useState('');
  const attempt=useRef<Configuration>({profileId:'mock',geometryMode:'primitives',mockText});
  const [host]=useState(()=>new RaceEventHost(race,recorder,createAudioRaceEventClient(()=>attempt.current)));
  const state=useSyncExternalStore(host.loop.subscribe,host.loop.getSnapshot);
  const mic=useSyncExternalStore(recorder.subscribe,recorder.getSnapshot);
  const profile=profiles?.profiles.find(item=>item.id===profileId);
  const live=profile?.mode==='live';
  const paidAvailable=Boolean(profiles?.transcription?.available&&profiles.liveUsage.enabled&&!profiles.liveUsage.busy&&profiles.liveUsage.attemptsRemaining>0);
  useEffect(()=>{
    const controller=new AbortController();
    void loadPipelineProfiles(controller.signal).then(data=>{if(!controller.signal.aborted){setProfiles(data);setError('');}})
      .catch(()=>{if(!controller.signal.aborted){setProfiles(undefined);setError('Cannot load voice profiles. Start the server and refresh.');}});
    return()=>controller.abort();
  },[refresh]);
  useEffect(()=>{host.reset();return()=>host.dispose();},[host]);
  useEffect(()=>{setArmed(false);},[profileId,mockText]);
  useEffect(()=>{if(['spawned','failed','ended'].includes(state.phase))setRefresh(value=>value+1);},[state.phase]);
  const start=()=>{
    if (host.loop.getSnapshot().phase!=='prompted'||!mic.ready||!profile?.available||(live&&(!armed||!paidAvailable))) return;
    attempt.current={profileId,geometryMode:'primitives',...(!live?{mockText}:{}),...(live?{paidAttempt:{id:crypto.randomUUID(),confirmed:true as const}}:{})};
    setArmed(false);host.loop.startRecording();
  };
  const reset=()=>{setArmed(false);attempt.current={profileId:'mock',geometryMode:'primitives',mockText};host.reset();};
  return {host,recorder,profileId,setProfileId,mockText,setMockText,armed,setArmed,profiles,error,profile,live,paidAvailable,state,
    start,finish:()=>{void host.loop.finishRecording();},cancel:()=>host.loop.cancelRecording(),reset,refresh:()=>setRefresh(value=>value+1)};
}
export function RaceVoiceControls({voice,paused}:{voice:ReturnType<typeof useRaceVoice>;paused:boolean}) {
  const configuring=paused&&voice.host.race.elapsed===0;
  const active=['preparing','recording','transcribing','generating'].includes(voice.state.phase);
  const canHold=!paused&&(['recording','preparing'].includes(voice.state.phase)||
    (voice.state.phase==='prompted'&&Boolean(voice.profile?.available)&&(!voice.live||(voice.armed&&voice.paidAvailable))));
  return <section className="race-voice">
    <h2>Voice creation</h2>
    <p>Yellow star: one speaking attempt, 10 words maximum. Hold Space after collecting it. Release submits automatically. Any racer can activate your creation; its effect can reach everyone.</p>
    <label>Voice profile<select aria-label="Race voice profile" value={voice.profileId} disabled={!configuring} onChange={event=>voice.setProfileId(event.target.value)}>
      {voice.profiles?.profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.label}{profile.available?'':' · unavailable'}</option>)}
    </select></label>
    {!voice.live&&<label>Simulated transcript<select aria-label="Race simulated transcript" disabled={!configuring} value={voice.mockText} onChange={event=>voice.setMockText(event.target.value)}>
      {raceEventFixtures.map(({prompt})=><option key={prompt}>{prompt}</option>)}
    </select></label>}
    {voice.live?<p>Live: speech → design → geometry. Up to 3 paid API calls for this run’s one attempt.</p>:<div className="voice-mode-notice" role="note">
      <strong>Mock mode · speech recognition is off</strong>
      <p>This attempt uses “{voice.mockText}”, regardless of what you say. No AI calls.</p>
      <p>{voice.profiles?.liveUsage.enabled?'For real speech, select a live Voice profile and allow the paid attempt before starting the race.':'For real speech, start bun run dev:live, select a live Voice profile, and allow the paid attempt before starting the race.'}{!configuring?' Restart the race to change its profile.':''}</p>
    </div>}
    {voice.live&&<label className="voice-consent"><input type="checkbox" checked={voice.armed} disabled={!configuring||!voice.paidAvailable||!voice.profile?.available} onChange={event=>voice.setArmed(event.target.checked)}/>Allow this run’s one paid voice attempt</label>}
    {voice.profiles&&<p>{voice.profiles.liveUsage.attemptsRemaining} / {voice.profiles.liveUsage.maxAttempts} paid attempts remaining this server start.</p>}
    {voice.error&&<p role="alert">{voice.error}</p>}
    {voice.profile?.unavailableReason&&<p>{voice.profile.unavailableReason}</p>}
    <RecorderControls recorder={voice.recorder} mode={voice.live?'live':'mock'} disabled={!canHold} setupDisabled={!paused||active} onStart={voice.start} onFinish={voice.finish} onCancel={voice.cancel}/>
    <p role="status">{voice.state.message}</p>
    {voice.state.transcript&&<p>{voice.live?'Heard':'Simulated transcript'}: “{voice.state.transcript}”</p>}
    {active&&<button onClick={voice.cancel}>Cancel voice attempt</button>}
    <button onClick={voice.refresh} disabled={active}>Refresh voice profiles</button>
    <small>8 s recording · 10 s transcription · 30 s generation. Pausing cancels an active attempt.</small>
  </section>;
}
