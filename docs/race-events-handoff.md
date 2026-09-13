# Shared race events: implementation and gameplay handoff

## Status and ownership

The v3 event runtime, renderer, fixtures and typed/voice API paths are integrated into the main four-racer game. `RaceEventHost` uses the existing microphone controls through `createAudioRaceEventClient`. `CreationAttempt<T>` shares recording, cancellation and one-attempt logic with the legacy v2 `CreationLoop` adapter. The old creation demo and Asset generation lab remain compatible.

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

- Gravity vortex (`gravityWell`): 8 seconds, 4,000 m reach, up to 36 m/s² combined force. A radial spring and tangential force send racers into wide orbits around the creation; the centre is finite and deterministic.
- Debris storm (`debrisShower`): 8 seconds, three waves sharing a total budget of 48 collidable + 80 cosmetic fragments. Rocks launch 24–32 m above each unfinished racer at their current velocity plus 30 m/s downward. Each wave aims some rocks at the current trajectory and scatters the rest; they never home after launch, so steering can dodge them. Collidable radius is 1.15 m, lifetime 2.4 seconds and hit impulse 20 m/s with a lateral component. Each fragment can hit each racer once; total per-tick velocity change is capped at 36 m/s.
- Shockwave (`repulsionBurst`): 2.5 seconds, expanding to 4,000 m in 0.25 seconds, one 32 m/s impulse per reached racer. Flattened vertical offsets and deterministic lateral directions at the centre make the shove readable while falling.
- Safe slipstream (`protectiveZone`): 8 seconds, 4,000 m reach, obstacle protection plus 18 m/s² extra descent acceleration. It has a noticeable speed benefit even without an obstacle contact. Custom/older specs that omit `descentAcceleration` keep protection only (default zero).

All active racers participate, including creator and triggerer. Effects are spatial: being outside a radius is not an ownership exemption. The 4,000 m preset radius covers this 3,600 m course, including racers well ahead or behind. Gravity and protection drift down at the pack's average vertical velocity at activation (capped at 100 m/s); repulsion stays at activation depth. Each debris wave launches around the unfinished racers' current positions. This foundation permits one collectible/active event at once. Reject overlapping spawns rather than silently replacing a live event.

## Gameplay integration

`MovementTest` creates one `PracticeRace` with an injected `RaceEventRuntime({pickupContactRadius:RACE_CREATION_PICKUP_RADIUS})`. `RaceScene` remains the sole 120 Hz clock. Inside `PracticeRace.step`, the bridge prepares inputs for all unfinished racers, controllers advance once, and the bridge resolves actual movement segments. Segments exclude instantaneous obstacle/combat displacement and carry a finish fraction so contacts after landing cannot win. Existing race construction without an event runtime preserves the legacy path for regression tests.

`FreefallController` keeps steering/brake/boost integration intact and overlays an external velocity capped at 42 m/s with exponential drag of 0.65/s. Acceleration is in m/s² and impulses in m/s; an impulse is consumed once, not multiplied by dt. World +Y is up; `getWorldVelocity()` publishes signed velocity. The positive `fallSpeed` snapshot reflects downward motion. Outward external velocity stops at lane boundaries; reset/finish clears it.

Protection is a per-tick `eventObstacleProtection` flag used only by normal obstacle collision. It does not overwrite inventory timers or grant projectile/sun immunity. Existing inventory/immunity protection is supplied to debris collision. Shared events do not change rival tactics or consume the race's item/reaction RNG.

`RaceCreations` retains the yellow star and mounts `RaceEventRenderer` with a world-height offset and instance key. Generated creations use a 10 m pickup contact radius and a matching visible halo. Meshes are recentered and fitted inside a 12 m presentation sphere, independent of the input geometry dimensions. The game settings live in `race-event-config.ts`; ordinary items and the yellow voice star retain their existing 3.5 m bounds. The existing radar and trophy show the shared object and actual triggerer; active event status can remain visible after the creator lands. The banner distinguishes waiting for pickup from activation and names the effect and affected racers. Colored racer auras, a screen-edge tint, impulse callouts and a widened camera FOV mark actual application. Non-debug field visuals use a maximum 34 m presentation radius; they are not the effect boundary. Debug shows the actual bounds.

## Placement and lifecycle

- `raceCreationSpawnPosition` preserves the later-course rule: last 40% of the course, normally 300 m ahead, at most 60 m above the finish; reject less than 30 m lead.
- `eventPlacement` tries bounded nearby clear positions without deleting obstacles. Pickup lifetime is the greatest remaining racer-to-object distance / 8 m/s plus 30 seconds, clamped to 30–600 seconds. These are game-authored spawn options; the model cannot supply them. The lab keeps its default 20-second pickup lifetime and 1.6 m contact distance.
- A missed creation expires only after all unfinished racers pass below the full pickup sphere plus a 5 m margin; crossing its centre alone is not a miss.
- One collectible/active event at a time. Any unfinished racer can activate once; creator and triggerer have no exemption. Passing/finishing as creator does not remove a shared event. All racers passing, the pickup budget, or the whole race ending cleans it up.
- Persistent gravity/protection centers drift at activation-time pack velocity. Debris waves follow current racer positions only at launch. The repulsion center stays fixed and expands to full radius in 0.25 seconds so falling racers cannot outrun the front; its configured lifetime and one impulse per racer remain unchanged.
- Pause stops race/event ticks. Pending voice work is cancelled under the existing rules. Reset/navigation aborts requests, invalidates late results, and clears the event bridge and motion. Creator finish cancels pending requests while already spawned objects remain shared.
- The one speaking attempt, explicit paid consent, server allowance, and separate 8/10/30-second capture/transcription/generation budgets remain unchanged.

## Free gameplay check

Run `bun run dev`, open Game → Settings, expand Event fixtures, select a fixture before starting, then resume. **Quick encounter** defaults to spawning 30 m ahead so a check takes seconds; uncheck it to test normal later-course placement. Follow the object radar and fly through the glowing pickup halo; braking gives more time to line up. Restart to select another. This development-only panel never records or calls a provider. For voice mocks, choose Play as Greg, select one of the four prepared prompts in Mock mode, enable the microphone, and Start with voice. Restart returns to setup and clears paid consent. Play without voice removes the star for that run. The lab remains available for quick replay and inspection.

The **Event result** panel in Setup retains the last creation, selected effect, triggerer, cumulative affected racers, impulse counts, actual debris hits, blocked debris and unique obstacle blocks after the effect expires. Pause (or finish), then choose **Restart & replay this creation nearby · free** to reuse its exact mesh/effect in a new race. Only the last result is held in memory; it survives a race restart, not page navigation, and contains no audio. Replay never calls transcription or generation. Normal voice placement is unchanged.

Restart your existing development server after updating presets so new server-generated creations use them. Do not restart a live server automatically: its paid-attempt allowance is per server start.

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

Gameplay acceptance checks: a rival triggers first; the creator is affected; both left/right racers respond; mesh scale does not change pickup bounds; finished racers do not trigger; pausing freezes event time; resetting during generation prevents stale spawn; protected racers ignore ordinary obstacle hits while inside the zone; all effects/debris disappear at expiration; widely separated racers are reached; the vortex and shockwave produce more than 10 m of lateral movement; the slipstream measurably accelerates descent; and seeded debris can hit all racers while remaining dodgeable.

### Verification on this integration

Automated coverage includes unchanged no-event movement/inventory RNG, all four effects through real racer controllers, rival-first activation, finish-fraction contacts, exclusion of teleport knockback, protection versus weapons, bounded seeded debris, cancellation/late results, safe spawn placement, and completed full-course runs. The game UI accepted a local fixture in the in-app browser. That browser reports WebGL unavailable, so visual effect readability and feel still need a Chrome/Edge gameplay pass. No paid provider calls were made.

The stronger presets passed 205 automated tests, typecheck and build. A deterministic full-course comparison (seed 0.42, idle player, normal rival AI) reached all four racers: vortex maximum player lateral displacement about 21 m, debris about 26 m with 15 total hits, shockwave about 39 m, and slipstream peak speed increase about 28 m/s. These are simulation measurements, not a visual playtest. The in-app browser verified quick-fixture selection and free replay; its WebGL limitation still requires a Chrome/Edge check of the 3D presentation.
