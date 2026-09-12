// Implement recording/transcription here; generation receives text, never audio.
// Call start on push-to-talk keydown, stop on keyup. Ignore repeated keydown.
export interface VoiceTranscriber {
  start(onLimit?:()=>void):Promise<void>;
  stop():Promise<string>;
  // Invalidate pending start/stop work and release recording resources.
  cancel():void;
}
// Validate the completed transcript with GenerationRequestSchema before generation.
// Handle microphone permission, focus loss, cancellation, and >10 words in voice UI.

export type PromptCapture = VoiceTranscriber | import('./recorder').AudioCapture;
