# game-tbd
TAI x OpenAI Hackathon September 2026

## Controls handoff
Controls and movement are isolated from voice/generation. Start with [the partner handoff guide](docs/controls-handoff.md).

## Prompt-to-mesh lab
The Generation lab compares **procedural parts** with **raw mesh generation**, using a configurable design → visuals pipeline and a shared 30-second deadline. Try the duck, toaster, and shield in mock mode immediately; live OpenAI profiles need a server API key and explicit paid-mode startup. Twelve comparison prompts, distance previews, ratings, timing, and JSON export help evaluate the two approaches. See [setup and API details](docs/prompt-to-mesh-pipeline.md). Voice input is available in both the lab and main race; see [voice setup and API details](docs/voice-input-plan.md).

## Current skeleton
The default **Generation lab** supports typed or recorded prompts, visual methods, pipeline profiles, a 3D preview, cancellation, and exportable comparison history. **Game → Movement test** integrates microphone capture into the main race: collect a Voice Power Up, hold Space, release to transcribe and generate, then collect the creation to activate its effect. The separate **Voice / creation demo** remains a deterministic simulated regression scene.

Everything defaults to mock mode. Real speech recognition and generation require a server key, explicit `bun run dev:live` startup, and consent for each attempt. See [voice testing](docs/voice-input-plan.md) and [the creation contract](docs/creation-skeleton.md).

The v1 contract and fixture API remain available for compatibility alongside the v2 creation pipeline.

## Start
Use Node 22.12+ and Bun 1.4.2+ (the package manager is pinned to bun@1.4.2). Install Bun using [its official instructions](https://bun.sh/docs/installation). On Windows with this repository in WSL, run these commands in a WSL terminal.

Copy the example environment file only if `apps/server/.env` does not already exist.

```sh
bun install
cp -n .env.example apps/server/.env
chmod 600 apps/server/.env
bun run dev
```

Commit bun.lock for reproducible installs; use bun install --frozen-lockfile in CI. Bun manages dependencies and scripts; the backend and existing tests still run on Node. Use bun run test to run the project test script.

Open http://localhost:5173. One command builds shared types first and starts the shared watcher, Vite, and Fastify. Ctrl+C stops all three. The server defaults to http://127.0.0.1:3001; GET /api/health reports mock mode. No credentials are needed. Vite proxies /api to port 3001; if you change PORT, also update the proxy target in apps/web/vite.config.ts.

```sh
bun run build
bun run typecheck
bun run test
```

Build output lives in each workspace's dist directory. After building, `bun run --filter @sky/server start` runs the server. Deploy the web dist separately with a same-origin /api reverse proxy. The development servers are not a production deployment.

## Secure, opt-in API keys

Save `OPENAI_API_KEY` only in `apps/server/.env`, using your editor. The file is ignored by Git; commit only the empty `.env.example`. Do not paste keys into chat, terminal commands/history, `VITE_` variables, or frontend files. One standard project API key serves transcription and both generation stages. Each developer uses their own local key.

- `bun run dev` and the normal server `start` command keep paid calls disabled, even with a key or inherited enable environment variables.
- Stop the default server, then run `bun run dev:live` to explicitly enable local paid speech and generation. Its server does **not** watch/restart on edits; restarting deliberately resets the allowance. Vite still supports frontend hot reload.
- The lab always starts on **Mock two-stage pipeline**. For live work select a live profile, check **Allow this paid attempt**, then click **Generate · up to 2 API calls**. Changing the prompt, method, or profile clears consent; each attempt clears it too.
- `LIVE_MAX_ATTEMPTS=3` allows three dispatched live attempts per server start, shared across typed/voice lab tests, gameplay, profiles, and browser tabs. Configure an integer from 1 to 10. Failed and cancelled dispatched attempts count. Only one live attempt runs at a time; repeated attempt IDs never dispatch again. Restarting resets the allowance, so it is not a monthly dollar cap.
- The browser sees availability, models, token budgets and remaining attempts, never credentials. Refreshing profiles is local-only and does not validate the key against OpenAI. Startup, builds, tests, previews, game mocks, and changing a prompt do not call OpenAI.
- Keep this unauthenticated development lab on localhost. Both dev servers bind to loopback by default; live server startup rejects non-loopback HOST settings. Vite refuses to serve `.env` and server source files. Public deployment needs a separate access-control design.

Set a small project **hard spend limit** in the OpenAI dashboard as an additional limit; spend alerts alone do not stop traffic, and hard-limit enforcement can slightly overshoot. See [OpenAI spend limits](https://developers.openai.com/api/docs/guides/spend-limits). Cancel/timeout does not guarantee already-dispatched work is free. No automatic retries or paid connectivity checks are made.

For a deployed backend, inject the key through the host's secret manager, never into the web build. See [API key handling](https://developers.openai.com/api/reference/overview#authentication) and [the lab contract](docs/prompt-to-mesh-pipeline.md).

## Test voice input

- **Mock lab:** Input source → Voice, select a comparison prompt, Enable microphone, then hold/release the button. Mock mode uses that simulated transcript; it does not recognize audio. Transcribe only returns text without generating.
- **Mock race:** Game → Movement test. Before starting, choose a simulated transcript and Enable microphone. Stay at the starting X/Z for the gold pickup at 180 m, then hold Space and release. Falling continues, and the creation spawns ahead for collection.
- **Paid:** start `bun run dev:live`, select a live profile, and allow that voice attempt (or arm one attempt before a race). Speech-only makes up to 1 API call; speech-to-creation up to 3. Reuse the existing key. `TRANSCRIPTION_MODEL` defaults to `gpt-transcribe`.

Desktop Chrome/Edge, English first. Limits: 8 s recording, 10 s upload/transcription, then 30 s generation. Empty or over-ten-word transcripts stop the attempt. Pause/focus loss/reset/navigation cancels active work. Audio is held in memory for the request and never saved in lab history or exports. See [voice architecture and contracts](docs/voice-input-plan.md).

## Layout and parallel ownership
- `packages/shared/src/schema.ts`: versioned Zod contract and inferred types; no React or server dependencies.
- `packages/shared/src/fixtures.ts`: three validated models.
- `apps/web/src/components/PowerUpModel.tsx`: appearance-only renderer.
- `apps/web/src/pages/PlaygroundPage.tsx`: fixture selection, rotation, and mock text requests.
- `apps/web/src/pages/GamePage.tsx` and `apps/web/src/game`: falling demo, injectable controls, world integration, and the separate creation lifecycle.
- `apps/web/src/pages/GenerationLabPage.tsx`: isolated prompt-to-mesh testing.
- `apps/server/src/generation`: two-stage pipeline, model transport, configuration, and HTTP routes.
- `apps/web/src/generation/client.ts`: mock and HTTP implementations of shared GenerationClient.
- `apps/web/src/voice`: recorder, typed voice client, shared controls, lab UI, and race setup.
- `apps/server/src/voice`: bounded uploads and replaceable transcription providers.
- `packages/shared/src/voice.ts`: strict audio metadata, transcript, and event contracts.
- `apps/server/src/app.ts`: injectable Fastify API; legacy endpoints default to mocks and the lab exposes explicit live profiles.

Developer A can implement gameplay within the web game modules while Developer B implements generation, server provider integration, and voice. Both consume the shared contract. Coordinate shared schema and root configuration changes.

## PowerUpSpec v1
The strict schema is the source of truth. Unknown properties, primitive kinds, effects, and versions are rejected. A spec has version:1, an ASCII alphanumeric/underscore/hyphen id (1–64 characters), displayName (1–48 characters), description (1–160 characters), appearance.primitives (1–24), and effects (1–3, no repeated effect types). Names and descriptions are trimmed and must be nonempty.

Coordinates use a right-handed system: +X right, +Y up, +Z toward the model's face/viewer; fall direction is -Y. Distances are meters and time is seconds. Positions are local to the collectible center, each axis in [-3,3]. Rotation is XYZ Euler radians, each axis in [-π,π]. Scale is each primitive's final local width/height/depth in meters, each in [0.05,4]. Scale applies before rotation and translation. All numbers must be finite.

Base box is 1×1×1; sphere has diameter 1; cylinder and cone have diameter 1 and height 1 along Y (cone tip at +Y). All geometries are centered on their origins. Nonuniform scale is allowed. Color is exactly #RRGGBB. Geometry segments are fixed by the renderer, never generated. These limits bound each primitive dimension to 4 m and all translated/rotated vertices within a conservative radius of 9 m of the model center.

Appearance has no collision authority. Gameplay uses the independent COLLECTIBLE_RADIUS_METERS constant (1 m) for a spherical pickup volume centered at the collectible origin; never derive it from a visual bounding box.

Supported effect payloads:
| type | Parameters | Gameplay meaning |
| --- | --- | --- |
| reduceFallSpeed | multiplier 0.2–0.9; durationSeconds 1–15 | Multiply base downward speed for the duration. |
| invulnerability | durationSeconds 1–10 | Ignore obstacle damage for the duration. |
| clearNearbyObstacles | radiusMeters 1–20 | Once on pickup, remove obstacles whose centers lie within this distance of the player. |

Timers begin on pickup, using elapsed gameplay seconds (paused time excluded). On repeated pickups, refresh the same effect's duration; do not multiply slow effects together. Use the most recently collected slow multiplier. Invulnerability does not prevent collection. Effects are data only; the current skeleton's typed handlers implement these semantics.

## Generation API contract
The foundation implements the future endpoint with a deterministic mock. Replace fixture selection with a provider adapter without changing the wire contract.

`POST /api/powerups`, Content-Type: application/json
```json
{"text":"give me a jellyfish umbrella"}
```

Input is trimmed, 1–200 characters and 1–10 whitespace-separated words. This is a simple deterministic word-count rule, not a linguistic tokenizer. Unknown request fields are rejected. Body limit: 4 KiB.

200 returns a raw validated PowerUpSpec (no wrapper). Example:
```json
{
  "version": 1,
  "id": "sample-umbrella",
  "displayName": "Umbrella",
  "description": "Slow your fall for eight seconds.",
  "appearance": {
    "primitives": [
      {"type":"sphere","position":[0,0,0],"rotation":[0,0,0],"scale":[2,0.5,2],"color":"#b99aff"}
    ]
  },
  "effects": [{"type":"reduceFallSpeed","multiplier":0.5,"durationSeconds":8}]
}
```

Errors return `{"error":{"code":"INVALID_REQUEST","message":"..."}}`.
- 400 INVALID_REQUEST: invalid JSON, input, content type, or oversized body.
- 502 INVALID_SPEC: provider output does not pass PowerUpSpecSchema.
- 500 GENERATION_FAILED: internal/provider failure. Future provider timeouts should also use this structured error contract.

Messages must be safe, 1–200 characters; never expose credentials or provider internals. The typed GenerationClient converts HTTP success/error responses into an ok-discriminated result and validates the response again. The default playground uses mockGenerationClient; swap to httpGenerationClient to exercise the server. Both choose ghost for text containing “ghost”, sun for “sun”, “angry”, or “clear”, otherwise jellyfish; they do not interpret arbitrary ideas. Fixture ids are reusable templates, not unique world-instance ids. Gameplay must allocate separate instance ids.

Keep OPENAI_API_KEY in apps/server/.env; never put secrets in VITE_ variables. The legacy AI_API_KEY is a fallback when OPENAI_API_KEY is unset or blank. Parse and validate AI output as declarative JSON; never evaluate it as JavaScript.

## Next tasks
1. Gameplay: refine pickup placement, HUD, controls, and effect feedback through the race modules. Preserve the single movement loop and semantic voice actions; see the controls handoff.
2. Generation: deliberately test real English speech and evaluate recognition, latency, and mesh quality in the lab. Extend effects by changing the shared schema and typed race handlers together.

The original v1 fixture playground and the simulated creation demo remain available.


## Shared race-event sandbox

Generation lab now opens **Race events**: choose Gravity well, Debris shower, Repulsion burst or Protective zone, then Run simulation. Any scripted racer can trigger the shared effect. Replay same seed, pause, step by 0.5 seconds, and inspect collision bounds/forces without API calls. **Asset generation** retains the earlier v2 lab.

The new panel also supports mock or explicitly opted-in live text/voice generation through `/api/lab/events` and `/api/voice/events`. Ordinary `bun run dev` stays mock-only. Live mode uses the existing consent, allowance and deadlines, with no extra model call.

The reusable v3 event runtime and adapter are ready for parallel gameplay integration; the main race retains its working microphone and v2 creation flow. Connecting the new shared events to actual gameplay is reserved for the next PR. See [the implementation and gameplay handoff](docs/race-events-handoff.md) for ownership, units, exact hooks, lifecycle rules, and verification.
