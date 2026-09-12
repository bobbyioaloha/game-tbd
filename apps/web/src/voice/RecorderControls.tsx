import { useSyncExternalStore } from 'react';
import { RECORDING_LIMIT_MS } from '@sky/shared';
import type { MicrophoneRecorder } from './recorder';
export function RecorderControls({recorder,disabled=false,onStart,onFinish,onCancel,setupDisabled=false,mode}:{
  recorder:MicrophoneRecorder;mode:'mock'|'live';disabled?:boolean;setupDisabled?:boolean;onStart:()=>void;onFinish:()=>void;onCancel:()=>void;
}) {
  const state=useSyncExternalStore(recorder.subscribe,recorder.getSnapshot);
  return <div className="voice-controls">
    <button type="button" disabled={setupDisabled||state.phase==='preparing'||state.phase==='recording'} onClick={()=>{void recorder.prepare();}}>{state.ready?'Check microphone permission':'Enable microphone'}</button>
    <p role="status">{state.message}</p>
    <meter aria-label="Microphone input level" min={0} max={1} value={state.level}/>
    <span> {((RECORDING_LIMIT_MS-state.elapsedMs)/1000).toFixed(1)} s recording time left</span>
    <button type="button" className="generate" disabled={disabled||!state.ready}
      onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);onStart();}}
      onPointerUp={onFinish} onPointerCancel={onCancel}
      onKeyDown={event=>{if ((event.code==='Space'||event.code==='Enter')&&!event.repeat) {event.preventDefault();event.stopPropagation();onStart();}}}
      onKeyUp={event=>{if(event.code==='Space'||event.code==='Enter'){event.preventDefault();event.stopPropagation();onFinish();}}}
    >{state.phase==='recording'?(mode==='mock'?'Release to load mock':'Release to submit'):state.phase==='preparing'?'Preparing microphone…':mode==='mock'?'Hold to test mock':'Hold to speak'}</button>
  </div>;
}
