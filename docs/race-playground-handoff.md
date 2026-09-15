# Race mechanics and playtesting

The main game is a four-racer skydiving race: one human and three simulated rivals. Character selection, voice setup, the race, and results all run through `MovementTest.tsx`, despite its prototype-era name. Voice-generated shared effects are connected through `RaceEventHost`.

Read [the README](../README.md#controls) for player controls and [the architecture guide](architecture.md) for a broader tour. This guide helps contributors find race mechanics and test a change.

## Find the relevant code

| File under `apps/web/src/game` | What it owns |
| --- | --- |
| `MovementTest.tsx` | Selection/setup/countdown, keyboard events, rebinding, pause/reset, and HUD composition. |
| `RaceScene.tsx` | The sole 120 Hz simulation clock, camera, and screen-space target selection. |
| `practice-race.ts` | Standings, ordinary items/combat, pickups, boost fuel, dodge, and finish state. |
| `freefall-controller.ts` | Movement integration and bounded external event forces. |
| `rival-planner.ts` | Computer-controlled rivals' routes. |
| `race-course.ts` | Course obstacles and colliders. |
| `RaceObjects.tsx`, `skydiving-scenery.tsx`, `RaceOverlay.tsx` | World scenery and HUD rendering. |
| `target-lock.ts` | Item target acquisition. |
| `race-event-host.ts`, `race-event-config.ts` | Voice pickup, generated-object placement, and game-owned contact/presentation sizes. |

Keep microphone/provider work out of movement integration. Shared effects enter through the event bridge during the existing race step; see [controls boundaries](controls-handoff.md) and [event integration](race-events-handoff.md#gameplay-integration).

## Ordinary items versus generated events

Ordinary boxes can grant the jellyfish umbrella, ghost cloak, or angry sun. These are authored inventory mechanics: a homing slow projectile, temporary protection, and a stationary blast. Their behavior is implemented in `practice-race.ts`; sharing names with original fixtures does not make them generated v3 effects.

The yellow star grants one speaking attempt. A successfully generated object waits ahead for any racer to collect it, then activates a shared event. Generated events do not replace inventory or its timers. Their four effect types and current presets are in [the event reference](race-events-handoff.md#contract).

Movement speeds, cooldowns, and course parameters are defined in the source. When tuning them, check the corresponding HUD text and tests rather than relying on numbers from an older handoff.

## Playtest a change

Run `bun run dev` and open [the local game](http://localhost:5173). Choose a character, then begin a race without voice to try basic mechanics and a selected prepared safety drill, or enable the microphone with a prepared mock prompt for voice work. The no-voice drill uses normal course placement and makes no capture or provider calls.

1. Steer to each boundary, brake, pause/resume, and restart.
2. Rebind an action in Settings and check both the displayed hint and actual key.
3. Collect an item, acquire a target, fire while looking down/up, and try dodging a projectile.
4. Use the sun near a rival, checking that the blast expires and protection behaves as expected.
5. Collect boost fuel and check acceleration, fuel use, and braking.
6. Check standings, progress, finish results, and HUD readability at a narrower desktop window.
7. For generated effects, use [free fixtures/replay](race-events-handoff.md#free-gameplay-check), then try the [mock microphone flow](voice-input-plan.md#try-the-game-without-spending-credits). Restart during a request to check that stale results cannot enter the next race.
8. If you changed shared generation/rendering code, also inspect the local Generation lab.

Follow [the contributor checks](../CONTRIBUTING.md#check-your-work) before handing off code. Automated movement and event tests do not establish visual quality, camera feel, or low-end device performance; report the browser and the manual path you actually tested.
