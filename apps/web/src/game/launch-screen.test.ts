import assert from 'node:assert/strict';
import test from 'node:test';
import { launchFrustum } from '../launch/launch-framing';

test('launch framing keeps Greg and the platform above the action dock after resize', () => {
  for (const [width, height, dockHeight] of [[1280, 720, 104], [1920, 1080, 104], [940, 720, 164], [390, 384, 164], [320, 344, 164], [2560, 900, 104]] as const) {
    const frame = launchFrustum(width, height, dockHeight);
    const screenY = (worldY: number) => (frame.top - worldY) / (frame.top - frame.bottom) * height;
    // Greg reaches the bottom of the approved 1670 x 942 composition.
    assert.ok(screenY(-32 * 942 / 1670 / 2) <= height - dockHeight + 1e-8);
    assert.ok(screenY(-6.85) < height - dockHeight, 'the complete landing pad stays visible');
    assert.ok(frame.left <= -16 && frame.right >= 16, 'the artwork is not cropped horizontally');
    const projectedAspect = (frame.right - frame.left) / (frame.top - frame.bottom);
    assert.ok(Math.abs(projectedAspect - width / height) < 1e-10, 'characters keep their proportions');
  }
});

test('launch framing remains finite during a zero-size canvas mount', () => {
  const frame = launchFrustum(0, 0, 104);
  assert.ok(Object.values(frame).every(Number.isFinite));
  assert.ok(frame.right > frame.left && frame.top > frame.bottom);
});
