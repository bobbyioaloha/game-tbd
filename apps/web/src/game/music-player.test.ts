import assert from 'node:assert/strict';
import test from 'node:test';
import { MusicPlayer } from './music-player';

function fixture() {
  const audio = {
    src: '', loop: false, volume: 1, currentTime: 0, paused: true, ended: false, plays: 0,
    play: async () => { audio.paused = false; audio.plays++; },
    pause: () => { audio.paused = true; },
  };
  const statuses: string[] = [];
  return {audio, statuses, player: new MusicPlayer(audio, text => statuses.push(text))};
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('menu continues through selection; race and results start their own tracks', async () => {
  const {audio, player} = fixture();
  player.update('menu', false, .35);
  assert.equal(audio.plays, 0);
  player.unlock(); await flush();
  audio.currentTime = 25;
  player.update('menu', false, .35);
  assert.equal(audio.currentTime, 25);
  assert.equal(audio.plays, 1);
  player.update('race', false, .35); await flush();
  assert.match(audio.src, /ready-aim-fire/);
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.loop, true);
  player.update('results', false, .35); await flush();
  assert.match(audio.src, /winner-winner/);
  assert.equal(audio.loop, false);
  audio.ended = true; audio.paused = true;
  player.unlock(); await flush();
  assert.equal(audio.plays, 3, 'results do not replay on another keypress');
});
test('pause, capture suspension, mute and hidden tab retain playback position', async () => {
  const {audio, player} = fixture();
  player.update('race', false, .35); player.unlock(); await flush();
  audio.currentTime = 18;
  player.update('race', true, .35);
  assert.equal(audio.paused, true);
  player.unlock();
  assert.equal(audio.paused, true);
  player.update('race', false, .35); await flush();
  assert.equal(audio.currentTime, 18);
  player.setHidden(true);
  assert.equal(audio.paused, true);
  player.setHidden(false); await flush();
  player.update('race', false, 0);
  assert.equal(audio.paused, true);
  player.update('race', false, .6); await flush();
  assert.equal(audio.volume, .6);
  player.dispose(); player.unlock();
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
});
test('late rejected play cannot overwrite a newer track status', async () => {
  const {audio, player, statuses} = fixture();
  let reject!: (error: Error) => void;
  audio.play = () => new Promise<void>((_resolve, failure) => { reject = failure; });
  player.update('menu', false, .35); player.unlock();
  audio.play = async () => { audio.paused = false; };
  player.update('race', false, .35); await flush();
  reject(new Error('old playback aborted')); await flush();
  assert.equal(statuses.at(-1), 'Playing: Ready Aim Fire');
});
test('autoplay rejection is handled and a later gesture can retry', async () => {
  const {audio, player, statuses} = fixture();
  audio.play = async () => { throw Object.assign(new Error('blocked'), {name: 'NotAllowedError'}); };
  player.update('menu', false, .35); player.unlock(); await flush();
  assert.match(statuses.at(-1)!, /Click or press/);
  audio.play = async () => { audio.paused = false; };
  player.unlock(); await flush();
  assert.equal(statuses.at(-1), 'Playing: Sneaky Snitch');
});
