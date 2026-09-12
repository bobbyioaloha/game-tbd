import { useEffect, useRef } from 'react';
import type { SteeringInput } from './player-controller';
export interface VoiceInputActions {
  startRecording(): void;
  finishRecording(): Promise<void>;
  cancelRecording(): void;
}
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement &&
  (['INPUT','TEXTAREA','SELECT','BUTTON'].includes(target.tagName) || target.isContentEditable);

// Partner-owned input adapter. Replace with mouse/touch/gamepad inputs as needed.
// It emits steering axes and semantic voice actions, never player positions.
export function useGameInput(voice: VoiceInputActions) {
  const steering = useRef<SteeringInput>({x: 0, z: 0});
  useEffect(() => {
    const keys = new Set<string>();
    const update = () => { steering.current = {x: Number(keys.has('KeyD'))-Number(keys.has('KeyA')), z: Number(keys.has('KeyS'))-Number(keys.has('KeyW'))}; };
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (['KeyW','KeyA','KeyS','KeyD','Space'].includes(event.code)) event.preventDefault();
      keys.add(event.code); update();
      if (event.code === 'Space' && !event.repeat) voice.startRecording();
    };
    const up = (event: KeyboardEvent) => {
      keys.delete(event.code); update();
      if (event.code === 'Space') void voice.finishRecording();
    };
    const blur = () => { keys.clear(); update(); voice.cancelRecording(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      keys.clear(); update();
    };
  }, [voice]);
  return steering;
}
