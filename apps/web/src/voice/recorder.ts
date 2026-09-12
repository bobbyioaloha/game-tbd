import { AUDIO_UPLOAD_LIMIT_BYTES, RECORDING_LIMIT_MS } from '@sky/shared';

export type Recording = {blob:Blob;captureMs:number};
export type RecorderSnapshot = {phase:'idle'|'preparing'|'ready'|'recording'|'stopped'|'error';ready:boolean;elapsedMs:number;level:number;message:string};
export interface AudioCapture {
  readonly kind:'audio';
  start(onLimit?:()=>void,onError?:(error:Error)=>void):Promise<void>;
  stop():Promise<Recording>;
  cancel():void;
}
export type RecorderDependencies = {
  media():Promise<MediaStream>;
  recorder(stream:MediaStream):MediaRecorder;
  meter?(stream:MediaStream,report:(level:number)=>void):()=>void;
};
function browserDependencies():RecorderDependencies {
  return {
    async media() {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined') throw new Error('Microphone recording requires desktop Chrome/Edge on localhost or HTTPS.');
      return navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
    },
    recorder(stream) {
      const mimeType=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('This browser has no supported audio recording format. Use desktop Chrome/Edge.');
      return new MediaRecorder(stream,{mimeType,audioBitsPerSecond:32_000});
    },
    meter(stream,report) {
      const context=new AudioContext(),source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();
      analyser.fftSize=256;source.connect(analyser);
      const data=new Float32Array(analyser.fftSize);
      const timer=setInterval(()=>{analyser.getFloatTimeDomainData(data);report(Math.min(1,Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length)*5));},100);
      void context.resume().catch(()=>{});
      return ()=>{clearInterval(timer);source.disconnect();void context.close().catch(()=>{});};
    },
  };
}
const mediaMessage=(error:unknown)=> error instanceof DOMException
  ? error.name==='NotAllowedError' ? 'Microphone permission was denied. Enable it in browser settings.'
    : error.name==='NotFoundError' ? 'No microphone was found.' : 'The microphone is unavailable or in use.'
  : error instanceof Error ? error.message : 'Could not access the microphone.';

export class MicrophoneRecorder implements AudioCapture {
  readonly kind='audio' as const;
  private state:RecorderSnapshot={phase:'idle',ready:false,elapsedMs:0,level:0,message:'Enable the microphone before speaking.'};
  private listeners=new Set<()=>void>();
  private serial=0;
  private stream?:MediaStream;
  private mediaRecorder?:MediaRecorder;
  private stopMeter?:()=>void;
  private ticker?:ReturnType<typeof setInterval>;
  private limit?:ReturnType<typeof setTimeout>;
  private started=0;
  private completion?:Promise<Recording>;
  private reject?:(reason:unknown)=>void;
  private onError?:(error:Error)=>void;
  constructor(private deps:RecorderDependencies=browserDependencies(),private maxMs=RECORDING_LIMIT_MS) {}
  getSnapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private update(patch:Partial<RecorderSnapshot>) {this.state={...this.state,...patch};this.listeners.forEach(listener=>listener());}
  private release() {
    clearTimeout(this.limit);clearInterval(this.ticker);this.stopMeter?.();this.stopMeter=undefined;
    this.stream?.getTracks().forEach(track=>track.stop());this.stream=undefined;
  }
  prepare=async()=>{
    if (['preparing','recording'].includes(this.state.phase)) return;
    this.cancel();const token=++this.serial;this.update({phase:'preparing',message:'Requesting microphone permission…'});
    try {
      const stream=await this.deps.media();
      stream.getTracks().forEach(track=>track.stop());
      if (token!==this.serial) return;
      this.update({phase:'ready',ready:true,message:'Microphone ready. Hold to speak.'});
    } catch (error) {if (token===this.serial) this.update({phase:'error',ready:false,message:mediaMessage(error)});}
  };
  start=async(onLimit?:()=>void,onError?:(error:Error)=>void)=>{
    if (!this.state.ready) throw new Error('Enable the microphone before starting a voice attempt.');
    if (this.state.phase==='recording' || this.state.phase==='preparing') throw new Error('Recording is already starting.');
    this.cancel();const token=++this.serial;this.onError=onError;
    this.update({phase:'preparing',elapsedMs:0,message:'Preparing microphone…'});
    try {
      const stream=await this.deps.media();
      if (token!==this.serial) {stream.getTracks().forEach(track=>track.stop());throw new Error('Recording cancelled.');}
      this.stream=stream;
      const recorder=this.deps.recorder(stream);this.mediaRecorder=recorder;
      const chunks:Blob[]=[];let size=0;
      this.completion=new Promise<Recording>((resolve,reject)=>{
        this.reject=reject;
        recorder.ondataavailable=event=>{
          if (token!==this.serial) return;
          size+=event.data.size;
          if (size>AUDIO_UPLOAD_LIMIT_BYTES) {this.fail('Recording exceeded its size limit.');return;}
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onerror=()=>{if (token===this.serial) this.fail('The microphone stopped unexpectedly.');};
        recorder.onstop=()=>{
          if (token!==this.serial) return;
          this.release();
          const blob=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});
          const captureMs=Math.min(this.maxMs,Math.max(0,performance.now()-this.started));
          if (!blob.size) {this.fail('The recording was empty. Nothing was submitted.');return;}
          this.reject=undefined;this.onError=undefined;
          this.update({phase:'stopped',elapsedMs:captureMs,level:0,message:'Recording stopped.'});
          resolve({blob,captureMs});
        };
      });
      // Cancellation may reject before the UI awaits stop().
      void this.completion.catch(()=>{});
      this.stopMeter=this.deps.meter?.(stream,level=>{if (token===this.serial) this.update({level});});
      recorder.start(100);this.started=performance.now();
      this.update({phase:'recording',message:'Recording… release to submit.'});
      this.ticker=setInterval(()=>this.update({elapsedMs:Math.min(this.maxMs,performance.now()-this.started)}),100);
      this.limit=setTimeout(()=>{void this.stop().then(()=>{if (token===this.serial) onLimit?.();}).catch(()=>{});},this.maxMs);
    } catch (error) {
      if (token===this.serial) this.fail(mediaMessage(error));
      throw error;
    }
  };
  stop=async():Promise<Recording>=>{
    if (this.state.phase==='preparing') {this.cancel();throw new Error('Released before the microphone was ready. Nothing was submitted.');}
    if (!this.completion) throw new Error('No active recording.');
    if (this.mediaRecorder?.state==='recording') this.mediaRecorder.stop();
    this.release();
    return this.completion;
  };
  private fail(message:string) {
    const error=new Error(message),onError=this.onError;
    this.reject?.(error);this.reject=undefined;
    this.cancel();this.update({phase:'error',message});
    onError?.(error);
  }
  cancel=()=>{
    this.serial++;this.onError=undefined;
    if (this.mediaRecorder && this.mediaRecorder.state!=='inactive') this.mediaRecorder.stop();
    this.reject?.(new Error('Recording cancelled.'));this.reject=undefined;this.completion=undefined;this.mediaRecorder=undefined;
    this.release();this.update({phase:this.state.ready?'ready':'idle',elapsedMs:0,level:0,message:this.state.ready?'Microphone ready. Hold to speak.':'Enable the microphone before speaking.'});
  };
}
