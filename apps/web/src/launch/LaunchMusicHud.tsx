import type { useGameMusic } from '../game/GameMusic';

export function LaunchMusicHud({music}: {music: ReturnType<typeof useGameMusic>}) {
  const muteLabel = music.muted ? 'Unmute music' : 'Mute music';
  return <section className="launch-music-hud" aria-label="Music controls">
    <button type="button" aria-label={muteLabel} title={muteLabel} aria-pressed={music.muted} onClick={music.toggleMuted}>
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 4 6 8H3v8h3l5 4Z"/>
        {music.muted ? <path d="m16 9 6 6m0-6-6 6"/> : <><path d="M15 8a6 6 0 0 1 0 8"/><path d="M18 5a10 10 0 0 1 0 14"/></>}
      </svg>
    </button>
    <label>
      <span>Music</span>
      <input aria-label="Music volume" aria-valuetext={`${music.volume}%${music.muted ? ', muted' : ''}`} type="range" min="0" max="100" value={music.volume} onChange={event => music.setVolume(Number(event.target.value))}/>
    </label>
    <output aria-hidden="true">{music.muted ? 'Off' : `${music.volume}%`}</output>
  </section>;
}
