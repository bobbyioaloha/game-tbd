# game-tbd
TAI x OpenAI Hackathon September 2026

## Controls handoff
Controls and movement are isolated from voice/generation. Start with [the partner handoff guide](docs/controls-handoff.md).

## Prompt-to-mesh lab
The Generation lab now runs a configurable **design → geometry** pipeline with a shared 30-second deadline. Mock mode works immediately; live OpenAI profiles need a server API key. See [setup and API details](docs/prompt-to-mesh-pipeline.md). The game still uses its independent mock.

## Current skeleton
The default **Generation lab** supports text prompts, pipeline profiles, intermediate design inspection, 3D preview, timing, cancellation, and JSON inspection. **Game** now demonstrates falling → Voice Power Up → simulated speech → creation → effect activation. Voice remains simulated; live generation is available only by explicit submission in the lab after configuring a key. See [the creation skeleton guide](docs/creation-skeleton.md) for controls, the v2 contract, lifecycle rules, and the live-provider implementation boundary.

The v1 contract and fixture API remain available for compatibility alongside the v2 creation pipeline.

## Start
Use Node 22.12+ and Bun 1.4.2+ (the package manager is pinned to bun@1.4.2). Install Bun using [its official instructions](https://bun.sh/docs/installation). On Windows with this repository in WSL, run these commands in a WSL terminal.

Copy the example environment file only if `apps/server/.env` does not already exist.

```sh
bun install
cp -n .env.example apps/server/.env
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

## Layout and parallel ownership
- `packages/shared/src/schema.ts`: versioned Zod contract and inferred types; no React or server dependencies.
- `packages/shared/src/fixtures.ts`: three validated models.
- `apps/web/src/components/PowerUpModel.tsx`: appearance-only renderer.
- `apps/web/src/pages/PlaygroundPage.tsx`: fixture selection, rotation, and mock text requests.
- `apps/web/src/pages/GamePage.tsx` and `apps/web/src/game`: falling demo, injectable controls, world integration, and the separate creation lifecycle.
- `apps/web/src/pages/GenerationLabPage.tsx`: isolated prompt-to-mesh testing.
- `apps/server/src/generation`: two-stage pipeline, model transport, configuration, and HTTP routes.
- `apps/web/src/generation/client.ts`: mock and HTTP implementations of shared GenerationClient.
- `apps/web/src/voice/types.ts`: separate transcription interface.
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

## Voice and next tasks
1. Gameplay developer: refine controls and movement through PlayerController and use-game-input.ts. The demo already supplies falling, collisions, forward spawning, and effect timers; see the controls handoff guide before extending them.
2. Generation developer: evaluate live model results in the isolated lab, then implement VoiceTranscriber in apps/web/src/voice and integrate the validated pipeline through CreationClient. Preserve the one-attempt rule, cancellation, and rejection of stale results.

The original v1 fixture playground remains available. The current Game skeleton implements movement, collision, and effects with simulated speech and generation; see the current skeleton guide above.
