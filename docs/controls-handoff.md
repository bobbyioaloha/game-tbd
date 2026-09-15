# Controls and movement reference

This is the code-level guide for changing controls or movement. For ordinary contribution steps, start with [CONTRIBUTING.md](../CONTRIBUTING.md); for a project tour, read [the architecture guide](architecture.md).

## Main race

The actual game uses `MovementTest`, `RaceScene`, `PracticeRace`, and `freefall-controller.ts`.

- `MovementTest.tsx` owns the selection → setup → countdown → race flow, keyboard input and rebinding. New runs reset before setup; countdown only starts the prepared run, preserving its consent. `RaceSetup.tsx` presents the briefing and reuses `RaceVoiceSetup`; gameplay movement stays in its existing owner. Space press/release invokes `useRaceVoice` actions; WASD/K/I/J remain in the existing handler. Do not add a second movement listener for voice.
- `RaceScene.tsx` retains the sole 120 Hz fixed-step integration. Inside `race.step`, the event bridge supplies optional forces/impulses/protection and resolves all-racer movement segments. Afterwards `RaceEventHost.step` receives the player segment for the authored voice star and attempt timing.
- `PracticeRace` applies optional per-racer event inputs through the controller; keep inventory and combat timers separate. `applyCreationEffects` remains for legacy v2 regression coverage.
- `race-event-host.ts` owns the authored voice pickup and v3 request lifecycle. It reads the latest player position when spawning; the race event runtime owns the shared collectible, contacts and effect lifetime. The old `race-creation-host.ts` is a v2 compatibility adapter.
- `voice/RaceVoiceControls.tsx` owns microphone/profile setup and per-run paid consent. Pause, reset, finish, and unmount must cancel active voice work and invalidate late results.

Manual check: open the game → choose a character → Begin as [name] → keep Mock mode → choose a prepared prompt → Enable microphone → Start with voice → fall without steering → collect the gold pickup at 180 m → hold/release Space → follow the radar to the creation later in the course; any racer can activate it. Play without voice removes both stars, clears consent, and places the selected prepared safety drill ahead using normal placement. Any racer can activate its glowing halo; ordinary items remain available, and no microphone or provider calls run. Restart returns to setup with fresh consent required. The Generation lab remains at `/#/dev/generation`; the standalone Fixtures tab is removed. Mock audio uses the selected simulated transcript, not speech recognition. See [voice testing and contracts](voice-input-plan.md).

## Separate regression demo

`CreationDemoPage` is retained regression code and is not mounted by the current `GamePage`. It uses these older, injectable entry points:
- `apps/web/src/game/use-game-input.ts`: keyboard bindings → steering axes and semantic voice actions.
- `apps/web/src/game/player-controller.ts`: simple falling/steering PlayerController.
- `apps/web/src/pages/CreationDemoPage.tsx`: compose DemoGame and its simulated transcriber.

## Legacy demo movement interface
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

Inject your implementation at the existing composition point in CreationDemoPage:
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

Voice inputs call startRecording(), finishRecording(), and cancelRecording(). Demo keyboard bindings are in use-game-input.ts; the page's accessible hold-to-speak button sends the same actions. Recording and generation must not pause the player.

## Checks
Run `bun run build`, `bun run typecheck`, and `bun run test`. Lifecycle tests require no player at all; demo tests cover integration and an injected alternate controller.

The retained demo is covered by automated integration tests. If you deliberately mount it for development, its free check is: start a run, stay centered for the gold pickup, hold/release Space, then collect the creation and observe the fall-speed change. This is not the current game navigation path.


## Shared race-event integration

See [race-events-handoff.md](race-events-handoff.md) for the implemented v3 path. The main race injects an event runtime into `PracticeRace`; the existing sole fixed tick applies its inputs through `FreefallController`. Controls, item odds, dodge reactions, camera follow, and course generation retain their own modules. Keep microphone and provider logic in `RaceEventHost`/voice adapters, and event forces in the controller's optional `eventInput` boundary. The v2 demo continues through `CreationLoop` and its existing host interface.
