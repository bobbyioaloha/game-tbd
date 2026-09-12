# Voice-to-creation skeleton

## Try it
Run `bun run dev` from the repository, then open http://localhost:5173.

**Generation lab** is the default page. Enter up to ten words and click **Generate creation**. The default source calls the real Fastify `POST /api/creations` route, whose provider is currently a deterministic mock. The other source runs offline in the browser. Both use the v2 contract. Inspect the result's geometry/effects, rotate it, or expand the JSON inspector. Errors preserve the previous preview. Requests can be cancelled; retries are explicit test submissions. This lab deliberately bypasses gameplay's one-attempt gate.

Mock mapping: “ghost” selects Ghost cloak; “sun”, “angry”, or “clear” selects Angry sun; “jelly” or “umbrella” selects Jellyfish umbrella; everything else selects Wind crystal, a hand-authored freeform mesh. This does not synthesize arbitrary geometry yet.

**Game** is a small integration scene. Before starting, set the simulated transcript. Start a run and remain centered to collect the gold Voice Power Up after about 2.4 seconds. Hold Space (or the hold-to-speak button) and release to submit. WASD moves on X/Z while falling on -Y. The creation spawns ahead and is collected automatically on collision if you remain in its path. Red cubes end the run unless protection is active. Try “ghost cloak” or “angry sun” for the other effects. Start a new run to obtain another Voice Power Up.

No microphone or paid API calls are made. The transcription adapter returns the text field value; it is explicitly a simulation. The original Fixtures page and v1 API remain available.

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

Voice pickups are authored opportunities, not generated content. They are consumed on collision. A creation contains appearance and effects; collection activates those effects. There is only one Voice Power Up per skeleton run, so overlapping grants are impossible.

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

Effect classes currently map to: movement → reduceFallSpeed, protection → invulnerability, environment → clearNearbyObstacles. The exhaustive handler map uses concrete effect types. Extend schema and handler together when adding an effect. Slow/protection refresh rather than stack; obstacle clearing applies once. Timers use simulated gameplay seconds. The skeleton clamps each simulation step to 100 ms; browser background throttling is not real-time multiplayer behavior.

## Server contract and next implementation
`POST /api/creations` accepts `{"text":"a wind crystal"}` (1–10 whitespace-separated words; 200 characters; 4 KiB request limit).
- 200: raw validated CreationSpec v2 with server-assigned UUID.
- 400: `{"error":{"code":"INVALID_REQUEST","message":"..."}}`.
- 502: same envelope with INVALID_SPEC.
- 500: same envelope with GENERATION_FAILED, including a provider timeout.
- `GET /api/creations/status`: `{"mode":"mock","schemaVersion":2}`.

The route invokes its provider exactly once, enforces a 30-second deadline, aborts on disconnect, and validates unknown provider output. The HTTP client validates again and uses a 35-second deadline. The in-game controller guards long transcription/generation phases separately. Provider errors are not forwarded to the client.

Next, implement an Astra-backed CreationProvider and inject it through `buildApp({creationProvider})` in the server entry point. The provider accepts validated text plus AbortSignal and returns unknown data. Configure credentials server-side; disable SDK retries; bound model output; handle refusal/incomplete output; use structured data followed by the existing geometric checks. No SDK, key handling, or live provider is implemented in this step. Update the lab's provider labels/status when enabling live mode.

Then test varied text prompts in Generation lab before switching GamePage's DemoGame client argument from mockCreationClient to httpCreationClient. Real audio capture and server transcription can subsequently replace the simulated transcriber without changing the generation contract.

## Verification
`bun run build`, `bun run typecheck`, and `bun run test`.
Tests cover v1 compatibility, invalid mesh data, one-attempt semantics, current-position spawning, stale results, missed creations, and structured server failures/timeouts. Browser verification covers server generation and the in-game pickup-to-activation flow.
