# Legacy power-ups: v1 data and API reference

This is the original primitive-based contract, retained for fixture tests and compatible clients. Start with [the architecture guide](architecture.md) for the current game and its shared race effects. There is no standalone Fixtures tab in the app.

The 1 m demo collision radius and the three effects below apply to the older integration. Current race creations use their own game-authored presentation and contact settings.

## PowerUpSpec v1
The strict schema is the source of truth. Unknown properties, primitive kinds, effects, and versions are rejected. A spec has version:1, an ASCII alphanumeric/underscore/hyphen id (1–64 characters), displayName (1–48 characters), description (1–160 characters), appearance.primitives (1–24), and effects (1–3, no repeated effect types). Names and descriptions are trimmed and must be nonempty.

Coordinates use a right-handed system: +X right, +Y up, +Z toward the model's face/viewer; fall direction is -Y. Distances are meters and time is seconds. Positions are local to the collectible center, each axis in [-3,3]. Rotation is XYZ Euler radians, each axis in [-π,π]. Scale is each primitive's final local width/height/depth in meters, each in [0.05,4]. Scale applies before rotation and translation. All numbers must be finite.

Base box is 1×1×1; sphere has diameter 1; cylinder and cone have diameter 1 and height 1 along Y (cone tip at +Y). All geometries are centered on their origins. Nonuniform scale is allowed. Color is exactly #RRGGBB. Geometry segments are fixed by the renderer, never generated. These limits bound each primitive dimension to 4 m and all translated/rotated vertices within a conservative radius of 9 m of the model center.

Appearance has no collision authority. The legacy demo uses the independent COLLECTIBLE_RADIUS_METERS constant (1 m) for a spherical pickup volume centered at the collectible origin; never derive it from a visual bounding box.

Supported effect payloads:
| type | Parameters | Gameplay meaning |
| --- | --- | --- |
| reduceFallSpeed | multiplier 0.2–0.9; durationSeconds 1–15 | Multiply base downward speed for the duration. |
| invulnerability | durationSeconds 1–10 | Ignore obstacle damage for the duration. |
| clearNearbyObstacles | radiusMeters 1–20 | Once on pickup, remove obstacles whose centers lie within this distance of the player. |

Timers begin on pickup, using elapsed gameplay seconds (paused time excluded). On repeated pickups, refresh the same effect's duration; do not multiply slow effects together. Use the most recently collected slow multiplier. Invulnerability does not prevent collection. Effects are data only; the legacy demo's typed handlers implement these semantics.

## Generation API contract
This retained endpoint uses a deterministic mock. The current race uses v3 events; see [the architecture guide](architecture.md#which-data-contract-should-i-use) before choosing an API.

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

Messages must be safe, 1–200 characters; never expose credentials or provider internals. The typed GenerationClient converts HTTP success/error responses into an ok-discriminated result and validates the response again. The legacy mockGenerationClient and httpGenerationClient remain available to exercise this contract. Both choose ghost for text containing “ghost”, sun for “sun”, “angry”, or “clear”, otherwise jellyfish; they do not interpret arbitrary ideas. Fixture ids are reusable templates, not unique world-instance ids. Gameplay must allocate separate instance ids.

Keep OPENAI_API_KEY in apps/server/.env; never put secrets in VITE_ variables. The legacy AI_API_KEY is a fallback when OPENAI_API_KEY is unset or blank. Parse and validate AI output as declarative JSON; never evaluate it as JavaScript.

