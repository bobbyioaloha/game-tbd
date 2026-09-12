import type { AudioCreationClient } from '../voice/voice-client';
import { CreationSpecSchema, GenerationRequestSchema, type CreationClient, type CreationSpec, type PowerUpEffect } from '@sky/shared';
import type { PromptCapture } from '../voice/types';

export type Phase = 'available' | 'prompted' | 'preparing' | 'recording' | 'transcribing' | 'generating' | 'spawned' | 'activated' | 'missed' | 'failed' | 'ended';
export type CreationSnapshot = {
  session: number; running: boolean; phase: Phase; message: string; phaseSeconds: number; transcript?:string;
};
export interface CreationHost {
  // Host chooses the position from its current player state when generation completes.
  spawnCreation(instanceId: string, spec: CreationSpec): void;
  applyEffects(effects: PowerUpEffect[]): void;
}
// Owns one-attempt voice/generation state only. No player, geometry, input bindings,
// obstacle state, movement integration, collision detection, or effect timers.
export class CreationLoop {
  private listeners = new Set<() => void>();
  private abort?: AbortController;
  private recordingStart?: Promise<void>;
  private serial = 0;
  private pendingCreation?: {instanceId: string; spec: CreationSpec};
  private state!: CreationSnapshot;
  constructor(private client: CreationClient, private voice: PromptCapture, private host: CreationHost, private audioClient?:AudioCreationClient) { this.reset(); }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.state = {...this.state}; this.listeners.forEach(listener => listener()); }
  reset = () => {
    this.abort?.abort(); this.voice.cancel(); this.serial++;
    this.pendingCreation = undefined;
    this.state = {session: this.serial, running: false, phase: 'available', phaseSeconds: 0,
      message: 'Start a run and fly into the gold Voice Power Up.'};
    this.emit();
  };
  start = () => { if (this.state.phase === 'available') { this.state.running = true; this.emit(); } };
  end = (message = 'Run ended. Late results are discarded.') => {
    this.abort?.abort(); this.voice.cancel(); this.serial++; this.pendingCreation = undefined;
    this.state.running = false; this.state.phase = 'ended'; this.state.message = message; this.emit();
  };
  dispose = () => { this.abort?.abort(); this.serial++; this.voice.cancel(); };
  private current(token: number) { return this.serial === token && this.state.running; }
  private fail(message: string) {
    this.abort?.abort(); this.voice.cancel(); this.state.phase = 'failed';
    this.state.message = message+' Attempt consumed.'; this.emit();
  }
  // The world reports collisions. Duplicate events cannot grant extra attempts.
  collectVoice = () => {
    if (!this.state.running || this.state.phase !== 'available') return;
    this.state.phase = 'prompted'; this.state.phaseSeconds = 0;
    this.state.message = 'Voice Power Up collected. Hold Space, then release. One attempt.'; this.emit();
  };
  missVoice = () => {
    if (!this.state.running || this.state.phase !== 'available') return;
    this.state.phase = 'missed'; this.state.message = 'Voice Power Up missed. Start a new run to try again.'; this.emit();
  };
  collectCreation = (instanceId: string) => {
    if (!this.state.running || this.state.phase !== 'spawned' || this.pendingCreation?.instanceId !== instanceId) return;
    const effects = this.pendingCreation.spec.effects;
    this.pendingCreation = undefined;
    this.state.phase = 'activated'; this.state.message = 'Creation collected. Effect activated.';
    this.host.applyEffects(effects); this.emit();
  };
  missCreation = (instanceId: string) => {
    if (!this.state.running || this.state.phase !== 'spawned' || this.pendingCreation?.instanceId !== instanceId) return;
    this.pendingCreation = undefined; this.state.phase = 'missed';
    this.state.message = 'Creation missed. Attempt consumed.'; this.emit();
  };
  startRecording = () => {
    if (!this.state.running || this.state.phase !== 'prompted') return;
    const token = this.serial;
    const recordingActive = () => this.current(token) && ['preparing', 'recording', 'transcribing'].includes(this.state.phase);
    const audio='kind' in this.voice && this.voice.kind==='audio';
    this.state.phase = audio ? 'preparing' : 'recording'; this.state.phaseSeconds = 0;
    this.state.message = audio ? 'Preparing microphone…' : 'Recording simulation… release to submit.'; this.emit();
    this.recordingStart = Promise.resolve().then(async () => {
      if (!recordingActive()) return;
      const onLimit=()=>{void this.finishRecording();};
      if ('kind' in this.voice && this.voice.kind==='audio') {
        await this.voice.start(onLimit,error=>{if(recordingActive())this.fail(error.message);});
      } else await this.voice.start(onLimit);
      if (recordingActive() && this.state.phase==='preparing') {
        this.state.phase='recording';this.state.phaseSeconds=0;this.state.message='Recording… release to submit.';this.emit();
      }
    });
    void this.recordingStart.catch(() => { if (recordingActive()) this.fail('Could not start recording.'); });
  };
  finishRecording = async () => {
    if (this.state.phase==='preparing') {this.cancelRecording();return;}
    if (!this.state.running || this.state.phase !== 'recording') return;
    const token = this.serial;
    this.state.phase = 'transcribing'; this.state.phaseSeconds = 0;
    this.state.message = 'Transcribing…'; this.emit();
    try {
      await this.recordingStart;
      if (!this.current(token) || this.getSnapshot().phase !== 'transcribing') return;
      const captured = await this.voice.stop();
      if (!this.current(token) || this.getSnapshot().phase !== 'transcribing') return;
      this.abort = new AbortController();
      let result:import('@sky/shared').CreationResult;
      if (typeof captured==='string') {
        const input = GenerationRequestSchema.safeParse({text:captured});
        if (!input.success) {this.fail('Use one to ten words, at most 200 characters.');return;}
        this.state.transcript=input.data.text;
        this.state.phase='generating';this.state.phaseSeconds=0;this.state.message='Creating while you fall…';this.emit();
        result=await this.client.generate(input.data,{signal:this.abort.signal});
      } else {
        if (!this.audioClient) throw new Error('Audio generation is not configured.');
        const spec=await this.audioClient.generateAudio(captured,{signal:this.abort.signal,onProgress:(phase,message,transcript)=>{
          if (!this.current(token) || !['transcribing','generating'].includes(this.state.phase)) return;
          if (phase!==this.state.phase) this.state.phaseSeconds=0;
          this.state.phase=phase;this.state.message=message;
          if (transcript) this.state.transcript=transcript;
          this.emit();
        }});
        result={ok:true,spec};
        if (this.current(token) && this.state.phase==='transcribing') this.state.phase='generating';
      }
      if (!this.current(token) || this.getSnapshot().phase !== 'generating') return;
      if (!result.ok) { this.fail(result.error.message); return; }
      const parsed = CreationSpecSchema.safeParse(result.spec);
      if (!parsed.success) { this.fail('Invalid creation returned.'); return; }
      const instanceId = 'creation-'+token;
      this.pendingCreation = {instanceId, spec: parsed.data};
      this.host.spawnCreation(instanceId, parsed.data);
      this.state.phase = 'spawned'; this.state.phaseSeconds = 0;
      this.state.message = parsed.data.displayName+' is ahead. Fly into it to activate.'; this.emit();
    } catch (error) {
      if (this.current(token) && this.getSnapshot().phase !== 'failed') this.fail(error instanceof Error ? error.message : 'Recording or generation failed.');
    } finally {if (this.current(token)) this.voice.cancel();}
  };
  cancelRecording = () => {
    if (['prompted','preparing','recording','transcribing','generating'].includes(this.state.phase)) this.fail('Input cancelled.');
  };
  // Host supplies gameplay seconds; this advances only voice/generation deadlines.
  advanceTime(dt: number) {
    if (!this.state.running) return;
    const previousTick=Math.floor(this.state.phaseSeconds*10);
    this.state.phaseSeconds += dt;
    if (this.state.phase === 'prompted' && this.state.phaseSeconds > 10) this.fail('Speaking window expired.');
    if (this.state.phase === 'recording' && this.state.phaseSeconds > 8) void this.finishRecording();
    if (!('kind' in this.voice) && ['transcribing','generating'].includes(this.state.phase) && this.state.phaseSeconds > 30) this.fail('Request timed out.');
    if (Math.floor(this.state.phaseSeconds*10)!==previousTick) this.emit();
  }
}
