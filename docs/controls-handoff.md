# Controls and movement handoff

Your entry points:
- `apps/web/src/game/use-game-input.ts`: keyboard bindings → steering axes and semantic voice press/release actions. Replace or extend this for mouse, touch, or gamepad.
- `apps/web/src/game/player-controller.ts`: PlayerController interface and the simple falling/steering implementation. Own movement, acceleration, limits, and future player motion here.
- `apps/web/src/pages/GamePage.tsx`: compose your controller with the demo and choose rendering/camera.

## Movement interface
```ts
interface PlayerController {
  reset(): void;
  getSnapshot(): {position: [number, number, number]; fallSpeed: number};
  step(
    deltaSeconds: number,
    input: {x: number; z: number},
    modifiers: {fallSpeedMultiplier: number}
  ): {
    previousPosition: [number, number, number];
    position: [number, number, number];
    fallSpeed: number;
  };
}
```

All positions are world meters. +Y is up; falling travels toward -Y. fallSpeed is a positive downward magnitude in meters/second. The demo supplies bounded frame delta, axes, and the active movement-effect multiplier. Return the actual movement segment so collision checks work with your motion. reset restores a new run's initial state; getSnapshot must return the current position/speed without advancing movement.

Inject your implementation at the existing composition point in GamePage:
```ts
new DemoGame(creationClient, transcriber, new YourPlayerController());
```

The demo calls player.step exactly once per active frame. Do not also update player position from a second useFrame callback. For a custom input adapter, pass its axes to game.step(delta, input). New input dimensions or movement modifiers should be agreed at this small interface first.

## What stays separate
- `creation-loop.ts`: one-attempt rules, voice/transcription/generation, deadlines, stale-result rejection. Contains no player state, movement integration, collision geometry, or world effects.
- `demo-game.ts`: connects player movement to world pickups, obstacle collision, effects, and run lifecycle.
- `effects.ts`: movement/protection timers and environment effects.
- `world-geometry.ts`: spawn positioning and swept collision helpers.

The creation lifecycle receives collectVoice / missVoice and collectCreation(instanceId) / missCreation(instanceId) events from the world. It asks its CreationHost to spawnCreation(instanceId, spec) when generation finishes and applyEffects(effects) on collection. The host reads the player's current state at spawn time. It never asks the generation code to move the player.

The world owns pickup existence/removal and collision. Remove a pickup before reporting its event. CreationLoop additionally guards duplicate events and wrong instance IDs. The demo handles one Voice Power Up per run. If replacing the entire demo world, implement CreationHost and report these same events; reset/end must clear world pickups and invalidate lifecycle work together.

Voice inputs call startRecording(), finishRecording(), and cancelRecording(). Keyboard bindings are in use-game-input.ts; the page's accessible hold-to-speak button sends the same actions. Recording and generation must not pause the player.

## Checks
Run `bun run build`, `bun run typecheck`, and `bun run test`. Lifecycle tests require no player at all; demo tests cover integration and an injected alternate controller.

Manual check: Game → Start new run → stay centered for the gold pickup → hold/release Space → keep falling → collect the creation → observe the fall-speed change. The generation lab remains independent.
