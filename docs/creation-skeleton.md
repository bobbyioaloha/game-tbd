# Legacy creation demo and v2 API

The main race and lab now support recorded speech with opt-in live generation: see [voice implementation](voice-input-plan.md). This guide describes the separate simulated regression demo and the compatible CreationSpec v2 / legacy API.

## When to use this reference

Use this guide when maintaining `CreationSpec` v2, `/api/creations`, or the retained simulated demo. For the current race, read [the architecture guide](architecture.md) and [v4 safety drills](safety-drills.md). The standalone Fixtures page and old demo navigation are no longer routed by the main app.

To inspect v2 generation today, run `bun run dev`, open [the local Generation lab](http://localhost:5173/#/dev/generation), and select **Asset generation**. See [the pipeline guide](prompt-to-mesh-pipeline.md) for its setup and testing workflow.

`CreationDemoPage` remains a small integration example in the source. If explicitly mounted for development, it uses a text field as simulated speech, a gold Voice Power Up, continuously falling movement, and collection-triggered effects. It makes no microphone or paid API calls. The v1 fixture data and compatible API remain available; see [the v1 reference](legacy-powerups.md).

## Architecture
- `packages/shared/src/creation.ts`: CreationSpec v2, bounded mesh validation, v1 adapter, typed client and distinct VoicePickup / CreationPickup.
- `packages/shared/src/creation-fixtures.ts`: hand-authored mesh plus adapted original fixtures.
- `apps/web/src/game/creation-loop.ts`: voice/generation lifecycle and session cancellation only.
- `apps/web/src/game/demo-game.ts`: world integration, collision, and pickup events.
- `apps/web/src/game/player-controller.ts` and `use-game-input.ts`: replaceable movement and controls.
- `apps/web/src/game/effects.ts`: effect handlers and timers.

See [the controls handoff](controls-handoff.md) before replacing movement.
- `apps/web/src/voice/simulated-transcriber.ts`: replaceable VoiceTranscriber implementation.
- `apps/web/src/generation/creation-client.ts`: browser mock and HTTP implementations.
- `apps/server/src/generation/provider.ts`: CreationProvider interface and server mock.
- `apps/server/src/generation/routes.ts`: provider boundary, deadlines, input/output validation.
- `apps/web/src/pages/GenerationLabPage.tsx`: independent text-to-preview test bench.

Voice pickups are authored opportunities, not generated content. They are consumed on collision. A creation contains appearance and effects; collection activates those effects. There is only one Voice Power Up per demo run, so overlapping grants are impossible.

State flow: available → prompted → recording → transcribing → generating → spawned → activated or missed. Failures consume the attempt and do not refund the pickup. The prompt expires after 10 seconds; simulated recording auto-submits after 8 seconds. Losing focus cancels an unsubmitted attempt. End/reset/navigation cancels pending work and rejects stale completions. No automatic generation retries.

The player continues falling during speaking and generation. A result spawns at current player X/Z, three seconds ahead at current fall speed (minimum 18 m). Nearby obstacles are removed from the spawn volume. This is a simple reachable spawn rule, not a future obstacle-path planner. Each pickup uses the fixed 1 m radius; mesh dimensions never control pickup reach. Missed pickups despawn.

## CreationSpec v2
Appearance is either `{type:"primitives", primitives:[...]}` or `{type:"mesh", vertices:[...], triangles:[...], faceColors:[...]}`.
- 3–256 vertices, with finite local coordinates in [-3,3] meters per axis.
- 1–512 triangles; each references three distinct, existing integer vertex indices.
- Reject cross-product squared magnitude below 1e-12 (triangle area below 5e-7 square meters).
- Exactly one #RRGGBB color per face.
- Mesh triangles should use outward, counterclockwise winding. Preview uses double-sided flat shading and calculates normals. Holes, intersecting surfaces, disconnected components, and duplicate faces are not rejected.
- v1 right-handed axes are unchanged: X right, Y up, Z toward the model face. Mesh positions are local; no generated code, external URLs, textures, or collision metadata.
- Name, description, identity, and bounded effect rules remain from v1. `adaptPowerUpV1` explicitly converts legacy specs; the new endpoint accepts only v2 output.

Effect classes currently map to: movement → reduceFallSpeed, protection → invulnerability, environment → clearNearbyObstacles. The exhaustive handler map uses concrete effect types. Extend schema and handler together when adding an effect. Slow/protection refresh rather than stack; obstacle clearing applies once. Timers use simulated gameplay seconds. The demo clamps each simulation step to 100 ms; browser background throttling is not real-time multiplayer behavior.

## Compatible server contract
`POST /api/creations` accepts `{"text":"a wind crystal"}` (1–10 whitespace-separated words; 200 characters; 4 KiB request limit).
- 200: raw validated CreationSpec v2 with server-assigned UUID.
- 400: `{"error":{"code":"INVALID_REQUEST","message":"..."}}`.
- 502: same envelope with INVALID_SPEC.
- 500: same envelope with GENERATION_FAILED, including a provider timeout.
- `GET /api/creations/status`: `{"mode":"mock","schemaVersion":2}`.

The route invokes its provider exactly once, enforces a 30-second deadline, aborts on disconnect, and validates unknown provider output. The HTTP client validates again and uses a 35-second deadline. The in-game controller guards long transcription/generation phases separately. Provider errors are not forwarded to the client.

The main race uses `/api/voice/drills` with v4 safety drills; `/api/voice/events` retains v3 compatibility. The Asset generation lab uses `/api/voice/creations` for v2 voice results; `/api/creations` remains the compatible mocked raw-spec endpoint. See [voice contracts](voice-input-plan.md#http-and-adapter-reference).

## Verification
`bun run build`, `bun run typecheck`, and `bun run test`.
Tests cover v1 compatibility, invalid mesh data, one-attempt semantics, current-position spawning, stale results, missed creations, and structured server failures/timeouts. For browser testing, use the current lab and game paths described in [the voice guide](voice-input-plan.md), keeping their v4/v3 behavior separate from this legacy demo.
