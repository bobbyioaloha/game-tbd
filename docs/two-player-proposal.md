# Two-player proposal

Status: proposal; implementation has not started.
Prepared: 2026-09-13.
Assessment baseline: `70cc5ef` on `main`.

## Summary and effort

Local split-screen is a moderate refactor. Online two-player adds a substantial networking and session-management subsystem. Both can reuse the existing movement, course, characters, inventory, combat, and shared event effects.

The simplest starting field is **two humans plus two bots**, retaining the current four racers.

| Mode | Basic prototype | Usable first release |
| --- | --- | --- |
| Local split-screen | A few focused days | 1–2 weeks |
| Online private invite rooms | 2–3 weeks | 4–8 weeks |

These are rough engineering estimates for one developer familiar with the code, using existing assets. The ranges cover Phases 1 and 2 for each mode, with voice disabled or mocked during development. Polished controller support and Phase 3's complete two-player voice workflow add scope. The online range includes the common refactor; building a complete local mode is not a prerequisite.

Recommended first step: separate player identity, input, simulation, and presentation. If the preferred mode remains undecided, use a local split-screen prototype to evaluate human-versus-human racing. If separate-computer play is the priority, proceed from the common refactor directly to private-room online play.

## Current foundation

- [PracticeRace](../apps/web/src/game/practice-race.ts) already owns four independent racers with controllers, inventory, boost, dodge, collision, projectiles, and finish state. Its `step` method accepts only one human input and explicitly treats racer `0` as human.
- [FreefallController](../apps/web/src/game/freefall-controller.ts) is independent of keyboard input and rendering. There is no need to replace the movement simulation or introduce a physics engine.
- [RaceScene](../apps/web/src/game/RaceScene.tsx) owns the sole 120 Hz simulation clock and also reads controls, selects targets, positions the camera, and reports one HUD.
- [MovementTest](../apps/web/src/game/MovementTest.tsx) owns one control configuration, character selection, voice setup, and race UI. Losing focus currently pauses the race.
- [RaceObjects](../apps/web/src/game/RaceObjects.tsx) and other presentation code position or hide objects relative to racer `0`. Adding a second camera alone will not produce two correct views.
- [RaceEventRuntime](../apps/web/src/race-events/runtime.ts) already applies effects by racer ID and resolves a generated object's first swept contact globally. Events remain available after their creator finishes.
- The [Fastify app](../apps/server/src/app.ts) serves generation and voice HTTP APIs. There is no race server, room protocol, or player account system.

See the [architecture guide](architecture.md) for module responsibilities and retained demo paths.

## Phase 1: Common multiplayer foundation

1. **Represent control ownership explicitly.** Give each racer a stable identity and a human/bot control source. Accept steering, braking, boost, dodge, and item actions by racer ID. Do not reorder identities differently on each online client just to make its local player racer `0`.
2. **Separate the session clock from views.** Keep one authoritative simulation advance per session. Local mode retains one 120 Hz clock; online mode moves authoritative stepping to the race service. Cameras and HUDs consume state without advancing the shared race.
3. **Separate per-player state.** Each human needs their own input, target lock, feedback, standings gaps, HUD, and voice-attempt state. Human-versus-human targeting warnings must include human locks, not only the current AI locks.
4. **Extract reusable simulation boundaries where needed.** Online mode needs a module the browser and Node server can use without React or DOM ownership. Existing collision math and shared-event integration must remain equivalent.
5. **Preserve the existing game.** Keep one-player behavior and retained demo callers working. Extend shared contracts without breaking the existing v1/v2 generation APIs or changing v3 effect limits.

Acceptance: two independent input streams can control two racers in one simulation, with no cross-control, duplicate stepping, or unintended AI actions on human racers. Existing movement and combat behavior remains covered.

## Phase 2A: Local split-screen

- Add two-player character selection and independent control bindings. Shared-keyboard play needs conflict handling; gamepads need a new input adapter and device assignment.
- Render two views of one race, each following its assigned racer with independent look-up mode and targeting.
- Make world transforms, visibility, scenery, pickup rings, generated-object markers, and landing presentation correct for each view. A ring consumed by one racer must still display appropriately for the other.
- Provide two readable HUDs and per-player feedback. Define results and presentation when one human lands before the other.
- Keep pause and restart shared. Clear both players' held inputs on pause or focus loss; define controller-disconnect behavior if gamepads are included.
- Check frame rate and readability with two views. Simulation is shared, but drawing the scene twice increases rendering work.

**Why split-screen:** racers can separate substantially in altitude and independently look up or down. A shared camera would require a separate camera/gameplay design, such as stronger zooming or restrictions on separation. It is not assumed to be a cheaper equivalent.

Acceptance: both humans can complete a race, use items against each other and bots, see relevant pickups, pause/resume, restart, and finish independently. The two views remain correct even when players are far apart.

## Phase 2B: Online private rooms

This branch can follow Phase 1 without completing split-screen.

1. **Authoritative race service.** Run one race per room on a server. Clients submit validated controls; the server owns movement outcomes, item grants, obstacle destruction, projectile hits, generated-event activation, and finish order.
2. **Versioned network contracts.** Define room/run identity, player assignment, ready/start messages, sequenced input, state updates, and disconnect/rematch messages. Bind control authority to the joined player and reject stale, duplicate, malformed, or unauthorized actions.
3. **Shared initial conditions.** Agree on roster, course/rules version, race seed, and start tick. Keep event RNG separate from item/rival randomness.
4. **Responsive presentation.** Interpolate remote state and predict local movement where necessary, reconciling with the server. Network update frequency need not equal the 120 Hz simulation rate. Validate weapon target/lock eligibility on the authority.
5. **Resynchronization.** Design complete state snapshots or a reconstruction strategy. Current controller/event snapshots are presentation data, not a complete restore mechanism: hidden velocities, pending impulses, consumed contacts, and other state matter.
6. **Room lifecycle.** Implement create/join by invite, two-player readiness, countdown, finish/rematch, input timeout, and a defined disconnect policy. Decide whether a disconnected player can rejoin or forfeits. Opening a menu or switching tabs must not silently pause the other player's world.
7. **Hosting.** Choose how a room retains one simulation owner across connections and how failures affect a match.

An initial private-room release can avoid public matchmaking, accounts, leaderboards, and durable race history. Persistent room recovery and large-scale hosting are separate scope decisions.

A browser-hosted prototype is also possible, but host departure, background throttling, and host advantage would need handling. The proposed usable online release uses a server authority.

### Current hosting constraint

The checked-in [Vercel configuration](../vercel.json) gives the API a 60-second function limit. It is configured for bounded generation requests, not a complete shared race lifecycle.

As checked on 2026-09-13, Vercel Functions support WebSockets in beta. Connections still close at the function duration limit, and new connections are not guaranteed to reach the same instance. Room state and ownership therefore need coordination if hosted there. A separate persistent Node race service is another option; the existing frontend and generation API can remain on their current hosting.

Source: [Vercel WebSockets documentation](https://vercel.com/docs/functions/websockets). Recheck capabilities and limits when selecting the implementation.

Acceptance: two separate browsers join the same race and agree on pickups, hits, shared effects, and results under latency and temporary disruption. Reconnection or forfeit behavior is explicit and tested.

## Phase 3: Two-player voice creation

Use free fixtures and mock voice while developing both modes. Add live voice only after multiplayer ownership and cancellation behavior work.

[RaceEventHost](../apps/web/src/game/race-event-host.ts) currently assumes racer `0` owns placement, voice stars, and attempts. Its reset/dispose also resets the shared event bridge. Instantiating it twice unchanged would let one player's lifecycle erase the other's event.

Required changes:

- Move star scheduling, attempt state, consent, and cancellation into per-player ownership.
- Keep one race-owned coordinator for generated-object placement and the shared event slot. Preserve at most one collectible or active generated event; define fair handling of completed results waiting for that slot.
- Use run/player/attempt-scoped identifiers. Current local creation/voice serials are not sufficient across multiple owners.
- For local play, start with one microphone and explicit turn-taking. Independent microphones require additional capture/device UX.
- For online play, admit generation for the correct room/player, then distribute the same validated creation, seed, placement, and activation timing to both clients. Generate once per authorized attempt.
- Cancel an owner's pending work on the applicable pause/leave/finish/reset path without deleting an already-spawned shared event that other racers can still use. Discard stale results after a run changes.
- Decide whether the two-attempt allowance is per player or per race. Two attempts per player means up to four attempts per race, exceeding the current local server default of three.
- Preserve the single live-request slot, explicit consent, time budgets, schema validation, and no automatic retries/refunds. Define busy/queue behavior without silently raising paid limits. Audio remains in memory.

See [shared events](race-events-handoff.md), [voice lifecycle](voice-input-plan.md), and [deployment](deployment.md).

Acceptance: either player can create and trigger an event; simultaneous requests have defined outcomes; cancellation cannot spawn stale results; one player finishing or leaving does not erase an existing shared event.

## Decisions before implementation

- Prioritize local split-screen or online private rooms.
- Confirm the first field: two humans plus two bots, or a two-racer duel.
- Choose shared keyboard, gamepads, or both for local play.
- Define pause, early finish, disconnect, and rematch behavior.
- Decide voice ownership, shared-microphone turns, attempt allowance, and queue fairness.
- Select online room hosting and whether the initial release supports reconnecting mid-race.

## Validation plan

For implementation work, run from the repository root inside WSL:

```sh
bun run build
bun run typecheck
bun run test
```

Add meaningful regression coverage for independent inputs, human-versus-human combat/locks, shared pickup ownership, per-player finish behavior, one simulation clock, and voice cancellation. Online coverage must also exercise message validation, duplicate/stale actions, state correction, disconnects, and agreement on event activation and results.

Verify affected gameplay in desktop Chrome or Edge. Test local views at large player separation; test online in separate browsers with latency and connection loss. Use free fixtures/replay and mock voice, including pause/reset during requests. Paid tests require separate explicit authorization.

This proposal is based on source, architecture, and existing test inspection. No gameplay implementation, browser playtest, or test-suite execution was performed for the assessment.
