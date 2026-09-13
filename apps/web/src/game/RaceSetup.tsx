import { useEffect, useRef, useState } from 'react';
import { RaceVoiceSetup, type RaceVoiceController } from '../voice/RaceVoiceControls';

const BRIEFING_SEEN_KEY = 'falling-standards.briefing-seen.v1';
// Keep returning players' preference across the product rename.
const LEGACY_BRIEFING_SEEN_KEY = 'mandatory-safety-exercise.briefing-seen.v1';
function hasSeenBriefing() {
  try {
    const current = localStorage.getItem(BRIEFING_SEEN_KEY);
    return (current ?? localStorage.getItem(LEGACY_BRIEFING_SEEN_KEY)) === 'true';
  }
  catch { return false; }
}

export function RaceBriefing({steeringHelp, actionHelp}: {steeringHelp: string; actionHelp: string}) {
  return <>
    <p>Race three rivals to the finish. Steer around obstacles.</p>
    <ol className="race-briefing-steps">
      <li><strong>Collect an Inspection Request (yellow star).</strong> Each star grants one attempt; up to two stars can appear per run.</li>
      <li><strong>Hold Space and speak.</strong> Report a hazard and what it does in 10 words or fewer. Release to submit; recording stops after 8 seconds.</li>
      <li><strong>Keep racing.</strong> Your object appears ahead when it is ready.</li>
      <li><strong>Fly through its glowing halo.</strong> The first racer to reach it starts a shared safety drill. Bait charges, find gaps, or ride currents; everyone participates, including you.</li>
    </ol>
    <p className="race-essential-controls">{steeringHelp}</p>
    <details><summary>All controls</summary><p>{actionHelp}</p></details>
  </>;
}

export function RaceSetup({voice, steeringHelp, actionHelp, onStart, onSkipVoice, onBack}: {
  voice: RaceVoiceController;
  steeringHelp: string;
  actionHelp: string;
  onStart: () => boolean;
  onSkipVoice: () => boolean;
  onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [briefingOpen, setBriefingOpen] = useState(() => !hasSeenBriefing());
  const readiness = voice.getReadiness();
  useEffect(() => { heading.current?.focus(); }, []);
  const begin = (start: () => boolean) => {
    if (!start()) return;
    // Store only the briefing preference, never consent, prompts, or audio.
    try { localStorage.setItem(BRIEFING_SEEN_KEY, 'true'); } catch { /* Storage is optional. */ }
  };
  return <section className="race-setup" aria-labelledby="race-setup-title">
    <span className="safety-label">PRE-FLIGHT BRIEFING</span>
    <h1 ref={heading} id="race-setup-title" tabIndex={-1}>Ready for the exercise?</h1>
    <div className="race-setup-columns">
      <div>
        <details open={briefingOpen} onToggle={event => setBriefingOpen(event.currentTarget.open)}>
          <summary>How to play</summary>
          <RaceBriefing steeringHelp={steeringHelp} actionHelp={actionHelp}/>
        </details>
        {!briefingOpen && <p>{steeringHelp}<br/>Collect ★ → report a hazard → activate the drill.</p>}
      </div>
      <RaceVoiceSetup voice={voice}/>
    </div>
    <div className="race-setup-actions">
      <p role="status">{readiness.message}</p>
      <div>
        <button className="begin-exercise" disabled={!readiness.ready} onClick={() => begin(onStart)}>Start with voice</button>
        <button onClick={() => begin(onSkipVoice)}>Play without voice</button>
        <button onClick={onBack}>Back to personnel</button>
      </div>
      <small>Playing without voice removes the yellow stars for this run. You can still race and use ordinary items.</small>
    </div>
  </section>;
}
