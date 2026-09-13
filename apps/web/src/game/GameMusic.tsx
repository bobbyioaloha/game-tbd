import { useEffect, useRef, useState } from 'react';
import { MusicPlayer, type MusicTrack } from './music-player';
import './game-music.css';

export function GameMusic({track, paused, recording}: {track: MusicTrack; paused: boolean; recording: boolean}) {
  const audio = useRef<HTMLAudioElement>(null);
  const player = useRef<MusicPlayer | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(35);
  const [status, setStatus] = useState('Click or press a key to start music.');
  useEffect(() => {
    if (!audio.current) return;
    const music = new MusicPlayer(audio.current, setStatus);
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
  return <aside className="game-music" aria-label="Music controls">
    <audio ref={audio} preload="none" aria-label="Game soundtrack"/>
    <button aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted ? 'Unmute music' : 'Mute music'}</button>
    <details>
      <summary>Music &amp; credits</summary>
      <div className="music-panel">
        <h2>Music</h2>
        <label>Music volume <input type="range" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))}/>{volume}%</label>
        <p role="status">{status}</p>
        <h3>Music credits</h3>
        <ul>
          <li>Title &amp; character selection: “Sneaky Snitch”</li>
          <li>Race: “Ready Aim Fire”</li>
          <li>Win screen: “Winner Winner!”</li>
        </ul>
        <p>Kevin MacLeod (<a href="https://incompetech.com" target="_blank" rel="noreferrer">incompetech.com</a>)<br/>
          Licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Creative Commons: By Attribution 4.0</a>.
        </p>
        <p>Original recordings. Menu and race music repeat during play; playback volume is adjusted.</p>
      </div>
    </details>
  </aside>;
}
