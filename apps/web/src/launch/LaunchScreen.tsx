import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { useGameMusic } from '../game/GameMusic';
import { LaunchArtwork } from './LaunchArtwork';
import { LaunchMusicHud } from './LaunchMusicHud';
import './launch-screen.css';

type LaunchScreenProps = {
  onCommence: () => void;
  music: ReturnType<typeof useGameMusic>;
};

export function LaunchScreen({onCommence, music}: LaunchScreenProps) {
  const dock = useRef<HTMLDivElement>(null);
  const commence = useRef<HTMLButtonElement>(null);
  const [reservedBottom, setReservedBottom] = useState(104);
  const [settled, setSettled] = useState(false);
  const onSettled = useCallback(() => setSettled(true), []);
  useLayoutEffect(() => {
    const element = dock.current;
    if (!element) return;
    const measure = () => setReservedBottom(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // Keep keyboard launch available without taking focus from the music HUD.
    if (settled && document.activeElement === document.body) commence.current?.focus({preventScroll: true});
  }, [settled]);

  return <section className="training-title" aria-label="Falling Standards">
    <div className="launch-screen-stage">
      <LaunchArtwork framing="launch" reservedBottom={reservedBottom} motion onReady={onSettled} onUnavailable={onSettled}/>
      <div className="launch-screen-composition" aria-hidden="true"/>
      <div className="launch-screen-dock" ref={dock}>
        <div className="launch-screen-cta">
          <button ref={commence} type="button" className="commence-training" disabled={!settled} onClick={onCommence}>
            Commence Training <span aria-hidden="true">→</span>
          </button>
        </div>
        <LaunchMusicHud music={music}/>
      </div>
    </div>
  </section>;
}
