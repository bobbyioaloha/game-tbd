import type { CSSProperties } from 'react';
import { MusicControls, type useGameMusic } from '../game/GameMusic';
import { LaunchArtwork } from './LaunchArtwork';
import './launch-screen.css';

// Shared by the camera reservation and the visible button dock.
const ACTION_HEIGHT = 104;

type LaunchScreenProps = {
  onCommence: () => void;
  music: ReturnType<typeof useGameMusic>;
  steeringHelp: string;
  actionHelp: string;
};

export function LaunchScreen({onCommence, music, steeringHelp, actionHelp}: LaunchScreenProps) {
  return <section className="training-title" aria-label="Falling Standards">
    <div className="launch-screen-stage" style={{'--launch-action-height': `${ACTION_HEIGHT}px`} as CSSProperties}>
      <LaunchArtwork framing="launch" reservedBottom={ACTION_HEIGHT} motion/>
      <div className="launch-screen-composition" aria-hidden="true"/>
      <div className="launch-screen-cta">
        <button autoFocus type="button" className="commence-training" onClick={onCommence}>
          Commence Training <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
    <div className="training-title-actions">
      <MusicControls music={music} compact/>
      <details>
        <summary>Training essentials</summary>
        <p>{steeringHelp}<br/>{actionHelp}</p>
        <p>Choose your trainee, then complete the briefing. Voice creation is optional.</p>
      </details>
    </div>
  </section>;
}
