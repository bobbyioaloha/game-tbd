import { useCallback, useEffect, useState } from 'react';
import { LaunchArtwork, useArtworkReducedMotion } from '../launch/LaunchArtwork';
import './launch-preview.css';

export function LaunchPreviewPage() {
  const [reference, setReference] = useState(false);
  const [motion, setMotion] = useState(false);
  const [reset, setReset] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const reducedMotion = useArtworkReducedMotion();
  const onReady = useCallback(() => setReady(true), []);
  const onUnavailable = useCallback(() => setFailed(true), []);
  const animate = motion && !reducedMotion;
  useEffect(() => { if (reducedMotion) setMotion(false); }, [reducedMotion]);
  const artworkView = () => {
    setReset(value => value + 1);
    setMotion(false);
    setReference(false);
  };

  return <main className="launch-study">
    <header className="launch-study-toolbar">
      <div className="launch-study-heading"><a href="#/" aria-label="Back to game">←</a><h1>LAUNCH SCREEN <span>/ 3D STUDY</span></h1></div>
      <nav aria-label="Artwork inspection">
        <button type="button" aria-pressed={reference} onClick={() => setReference(value => !value)}>Reference</button>
        <button type="button" onClick={artworkView} disabled={failed || !ready}>Artwork view</button>
        <button type="button" aria-pressed={animate} disabled={reducedMotion || failed || reference || !ready} onClick={() => setMotion(value => !value)} title={reducedMotion ? 'Your system preference reduces motion.' : 'Subtle drift and pointer parallax'}>Motion: {animate ? 'on' : 'off'}</button>
      </nav>
    </header>
    <div className="launch-study-content">
      <div className="launch-study-artwork">
        <LaunchArtwork reference={reference} motion={animate} reset={reset} onReady={onReady} onUnavailable={onUnavailable}/>
      </div>
    </div>
    <footer className="launch-study-footer"><span>{reference ? 'Original illustration' : failed ? 'Launch illustration fallback' : 'Drag or use arrow keys to inspect · Artwork view resets'}</span><span>{reducedMotion ? 'Reduced motion' : 'Blender composition study'}</span></footer>
  </main>;
}
