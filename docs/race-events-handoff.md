# Shared race events: implementation and gameplay handoff

## Status and ownership

The v3 contract, four deterministic fixtures, simulation runtime, renderer, lab, and typed/voice API paths are implemented on `codex/race-event-foundation`. The main race remains on its existing v2 creation path. The existing in-game microphone flow is already connected and remains available. Connecting the new v3 events to that flow and to racer movement is a separate gameplay PR.

| Owner | Files / responsibilities |
| --- | --- |
| Generation / events | `packages/shared/src/race-event*.ts`, `apps/web/src/race-events/*`, server generation formats and event endpoints |
| Gameplay | `MovementTest.tsx`, `RaceScene.tsx`, `PracticeRace`, `FreefallController`, input, inventory, obstacles and rival planning |
| Small agreed boundary | `RaceEventPort`, `EventRacer`, `EventStepInputs`, `RaceEventBridge` |

Merge the contract and no-op port first. Both sides can work from that interface; use separate branches/worktrees rather than switching the same working directory while the other developer is editing. Do not refactor the other owner's files as part of integration.

## Try it without credits

Run `bun run dev`, open the Generation lab, and choose **Race events**. The four fixture buttons work without a server. Choose Run simulation, Step 0.5 s while paused, or Replay same seed. First racer changes which scripted racer reaches the object first. Gold fragments have collisions; small blue fragments are cosmetic. Debug shows field bounds and gravity vectors. Simulations stop after 15 seconds.

The local scene uses the real `RaceEventRuntime` and `RaceEventRenderer`, but its racer movement is intentionally simplified in `sandbox-model.ts`. Never import that model into the actual race. The **Asset generation** tab preserves the existing v2 lab and history.

The event panel accepts typed or recorded input, defaults to mock, and supports deliberate paid attempts only through `bun run dev:live` and per-attempt consent. Fixtures/replay/step/pause/inspection never call the server. Mock speech still records a clip but uses the selected simulated transcript. No audio is stored in history or files.

## Contract

`RaceEventCreationSchema` is v3: `{version:3,id,displayName,description,appearance,effect}`. Appearance reuses the bounded mesh/primitive schemas. `effect` is exactly one strict discriminated union. No `effects` array, target exceptions, generated code, colliders or renderer instructions are accepted. Legacy v1/v2 schemas and routes keep their existing meanings.

The design model returns `{displayName,visualBrief,effectType}`. The server selects balanced parameters and an honest description using `raceEventPreset`. Geometry receives only the visual brief. Models cannot choose strength, lifetime, targets or extra behaviours.

- Gravity well: 6 seconds, 18 m radius, up to 12 m/s² attraction, softened at the centre.
- Debris shower: 6 seconds, 16 collidable + 64 cosmetic fragments, seeded velocities up to 7 m/s, 5 m/s hit impulse. Each fragment can hit each racer once; the total per-tick velocity change is capped.
- Repulsion burst: 1.5 seconds, expanding to 20 m, one 12 m/s impulse per reached racer.
- Protective zone: 7 seconds, 12 m radius, obstacle protection while inside.

All active racers participate, including creator and triggerer. Effects are spatial: being outside a radius is not an ownership exemption. Gravity, debris and protection drift down at the pack's average vertical velocity at activation (capped at 60 m/s); repulsion stays at activation depth. This foundation permits one collectible/active event at once. Reject overlapping spawns rather than silently replacing a live event.

## Gameplay integration sequence

1. Create one `RaceEventRuntime` and `RaceEventBridge` per race. Alternatively inject `createNoopRaceEvents()` while developing movement support.
2. Supply current snapshots for **every racer** using `EventRacer`. IDs are stable strings (`String(racer.id)` is fine). Use world positions; `finished` comes from `finishTime !== undefined`. Existing immunity/obstacle protection feeds `protected`.
3. Around the existing sole 120 Hz race step, call the before/after methods below. Do not add another `useFrame` integrator.
4. Render `RaceEventRenderer` inside the same world-origin/camera-offset group as course objects. Remount it with `key={instanceId}` when a new creation is spawned; pass the runtime as `events`. Rendering only reads simulation state.
5. Wire the existing semantic voice actions and one-attempt lifecycle to `raceEventClient.generateVoice` (or `.generate` for typed input), then call `bridge.spawnAhead` with the validated v3 result and the creator's **current** snapshot. Keep microphone/consent logic out of movement code. The legacy `CreationLoop` validates v2 and is not a drop-in v3 client; its lifecycle must be adapted explicitly, never by casting v3 to v2.

The following is the intended gameplay-owned hook; `readRacers` and applying `eventInputs` inside `race.step` are integration work, not methods already present in `PracticeRace`:

```ts
const eventInputs = bridge.beforeStep(dt, readRacers());
// Existing race.step advances all racers exactly once, applying eventInputs per racer.
race.step(/* existing inputs, plus the agreed event inputs */);
bridge.afterStep(readRacers());
```

`beforeStep` returns `Record<racerId, {acceleration,velocityDelta,obstacleProtection}>`:
- positions: world meters; +Y up, falling toward -Y.
- velocity/velocityDelta: signed world m/s, not the positive `fallSpeed` magnitude. A vertical velocity is `[vx,-fallSpeed,vz]`.
- acceleration: m/s²; integrate `acceleration * dt` into velocity once per tick.
- velocityDelta: a one-time m/s impulse; **do not multiply it by dt** or apply it twice.
- obstacleProtection: OR into current obstacle protection for this tick; never overwrite inventory timers. Do not leave a persistent shield after exiting the zone.

The current controller stores fall speed and steers directly by position. Gameplay must add bounded external lateral/vertical motion support; do not translate an acceleration directly into a position offset or abuse the existing `impact()` displacement method. Publish actual velocity, or derive signed velocity from successive fixed-step positions for the snapshot.

The bridge copies pre-step positions, then resolves actual movement segments after the game step. Earliest sphere contact wins; equal contact fractions use stable racer IDs. Newly activated effects start on the next tick. Debris hits also deliver impulses on the next tick. Supply exactly one before/after pair, with `dt` in `(0,1/30]`. There is no internal timer.

## Lifecycle and race rules

- Only the player collecting the authored Voice Power Up gets the speaking attempt. Once created, the event object is shared and any racer can trigger it.
- `spawnAhead` uses the current creator position and a lead of `max(18 m, 3 seconds of vertical speed)`. The race must reject a spawn too near the finish or other unreachable space before calling it.
- Do not clear the object when only its creator passes/finishes. It expires when all active racers pass it, its 20-second pickup lifetime ends, or the whole race ends.
- The runtime ignores finished racers. End-of-race reset clears pending impulses, fragments, contact records and protection.
- Pause stops both race and event ticks. Continue the existing cancellation rules for pending voice/generation. Resume must not catch up paused wall-clock time.
- Reset/navigation abort pending requests and invalidate their completions before resetting the bridge. A late generation must not spawn into another run.
- Keep the existing one-attempt rule and paid consent. Finishing the creator can cancel their pending request, but must not remove an already-spawned event that other racers can still reach.
- The world owns finish checks and normal obstacle collision. Generation does not alter rivals' steering or inventory.

## API paths

- `POST /api/lab/events`: same strict body as `PipelineRequestSchema`; NDJSON parsed with `RaceEventPipelineEventSchema`.
- `POST /api/voice/events`: same multipart `options` + `audio` contract as voice creations; NDJSON parsed with `RaceEventVoiceEventSchema`.
- Legacy `/api/lab/creations`, `/api/voice/creations`, `/api/creations`, `/api/powerups`, and transcription-only remain unchanged.

Example free request:

```json
{"text":"hungry purple planet","profileId":"mock","geometryMode":"primitives"}
```

Event mock prompts are exactly the four fixture prompts (display names also match). No silent duck or generic-shape fallback. Raw mesh generation is supported by live event requests; authored event mocks and the new UI use procedural parts.

All event requests reuse the existing pipeline instance: same admission gate, consent UUIDs, busy slot, per-start allowance, 8-second design budget within 30-second generation, and separate 10-second upload/transcription budget. There are no retries or additional generation calls.

## Verification / integration acceptance

Run `bun run typecheck`, `bun run test`, `bun run build`. Tests use fixtures, fake credentials and intercepted transports. Browser checks use mock mode; paid quality/latency evaluation is a deliberate user action.

Before enabling v3 in the main race, verify: a rival triggers first; the creator is affected; both left/right racers respond; mesh scale does not change pickup bounds; finished racers do not trigger; pausing freezes event time; resetting during generation prevents stale spawn; protected racers ignore ordinary obstacle hits while inside the zone; and all effects/debris disappear at expiration.
