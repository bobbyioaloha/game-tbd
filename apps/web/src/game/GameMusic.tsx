import { useEffect, useRef, useState } from 'react';
import { MusicPlayer, type MusicTrack } from './music-player';
import './game-music.css';

type MusicPlayback = {track: MusicTrack; paused: boolean; recording: boolean};

/** Keep playback alive while title controls and the settings panel come and go. */
export function useGameMusic({track, paused, recording}: MusicPlayback) {
  const player = useRef<MusicPlayer | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(35);
  const [status, setStatus] = useState('Click or press a key to start music.');
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    const music = new MusicPlayer(audio, setStatus);
    player.current = music;
    const unlock = () => music.unlock();
    const visibility = () => music.setHidden(document.hidden);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility);
    visibility();
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visibility);
      music.dispose();
      player.current = null;
    };
  }, []);
  useEffect(() => {
    player.current?.update(track, paused || recording, muted ? 0 : volume / 100);
  }, [track, paused, recording, muted, volume]);
  return {muted, volume, status, setVolume, toggleMuted: () => setMuted(value => !value)};
}

export function MusicControls({music, compact = false}: {music: ReturnType<typeof useGameMusic>; compact?: boolean}) {
  return <section className={'game-music' + (compact ? ' game-music-compact' : '')} aria-label="Music controls">
    {!compact && <h3>Music</h3>}
    <div className="music-controls-row">
      <button type="button" aria-pressed={music.muted} onClick={music.toggleMuted}>{music.muted ? 'Unmute music' : 'Mute music'}</button>
      <label>Music volume <input type="range" min="0" max="100" value={music.volume} onChange={event => music.setVolume(Number(event.target.value))}/><span>{music.volume}%</span></label>
    </div>
    {!compact && <>
      <p className="music-status" role="status">{music.status}</p>
      <details className="music-credits">
        <summary>Music credits</summary>
        <ul>
          <li>Title &amp; character selection: “Sneaky Snitch”</li>
          <li>Race: “Ready Aim Fire”</li>
          <li>Win screen: “Winner Winner!”</li>
        </ul>
        <p>Kevin MacLeod (<a href="https://incompetech.com" target="_blank" rel="noreferrer">incompetech.com</a>)<br/>
          Licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Creative Commons: By Attribution 4.0</a>.
        </p>
        <p>Original recordings. Menu and race music repeat during play; playback volume is adjusted.</p>
      </details>
    </>}
  </section>;
}
