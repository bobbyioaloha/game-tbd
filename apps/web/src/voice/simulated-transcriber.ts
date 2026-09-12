import type { VoiceTranscriber } from './types';
// Development adapter: no microphone permission, recording, or transcription service.
export function createSimulatedTranscriber(readText: () => string): VoiceTranscriber {
  let recording = false;
  return {
    async start() { recording = true; },
    async stop() {
      if (!recording) throw new Error('No active recording');
      recording = false;
      return readText();
    },
    cancel() { recording = false; },
  };
}
