export type MusicTrack = 'menu' | 'race' | 'results';
export const MUSIC_TRACKS = {
  menu: {src: '/audio/music/sneaky-snitch.mp3', title: 'Sneaky Snitch', loop: true},
  race: {src: '/audio/music/ready-aim-fire.mp3', title: 'Ready Aim Fire', loop: true},
  results: {src: '/audio/music/winner-winner.mp3', title: 'Winner Winner!', loop: false},
} satisfies Record<MusicTrack, {src: string; title: string; loop: boolean}>;

type AudioOutput = Pick<HTMLAudioElement, 'src' | 'loop' | 'volume' | 'currentTime' | 'paused' | 'ended' | 'play' | 'pause'>;

/** One audio output, with stale play promises isolated from later screen changes. */
export class MusicPlayer {
  private track?: MusicTrack;
  private suspended = false;
  private hidden = false;
  private unlocked = false;
  private disposed = false;
  private serial = 0;
  private pending = false;
  constructor(private audio: AudioOutput, private report: (status: string) => void) {}
  update(track: MusicTrack, suspended: boolean, volume: number) {
    if (this.disposed) return;
    if (track !== this.track) {
      this.stop();
      this.track = track;
      this.audio.src = MUSIC_TRACKS[track].src;
      this.audio.currentTime = 0;
      this.audio.loop = MUSIC_TRACKS[track].loop;
    }
    this.suspended = suspended;
    this.audio.volume = Math.max(0, Math.min(1, volume));
    this.sync();
  }
  unlock() {
    if (this.disposed) return;
    this.unlocked = true;
    this.sync();
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.sync();
  }
  private stop() {
    this.serial++;
    this.pending = false;
    this.audio.pause();
  }
  private sync() {
    if (this.disposed || !this.track) return;
    if (this.suspended || this.hidden || this.audio.volume === 0) {
      this.stop();
      this.report(this.audio.volume === 0 ? 'Music muted.' : 'Music paused.');
      return;
    }
    if (!this.unlocked || this.pending || !this.audio.paused || (!this.audio.loop && this.audio.ended)) return;
    const serial = ++this.serial;
    this.pending = true;
    void this.audio.play().then(() => {
      if (serial !== this.serial || this.disposed) return;
      this.pending = false;
      this.report('Playing: ' + MUSIC_TRACKS[this.track!].title);
    }).catch((error: unknown) => {
      if (serial !== this.serial || this.disposed) return;
      this.pending = false;
      this.report(error instanceof Error && error.name === 'NotAllowedError'
        ? 'Click or press a key to start music.'
        : 'Music could not play. Check the audio file and try again.');
    });
  }
  dispose() {
    this.disposed = true;
    this.stop();
    this.audio.src = '';
  }
}
