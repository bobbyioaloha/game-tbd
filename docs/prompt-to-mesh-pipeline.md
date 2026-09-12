# Prompt-to-3D generation lab

The lab compares two visual methods behind the same **design → visuals** pipeline. It is isolated from the game, with a shared 30-second deadline, one effect per creation, and no automatic retries or repair calls.

## Start and try the mock

Run `bun install`, then `bun run dev`. Open http://localhost:5173 and select **Generation lab**.

1. Keep **Procedural parts** and **Mock two-stage pipeline** selected.
2. Choose any of the twelve comparison presets, such as **giant rubber duck**, **red rocket with fins**, or **spiky pink shield**.
3. Click **Load mock example** to see its design, completed visual, effect, and timing.
4. Inspect it at 7, 15, or 30 meters; rotation and **Spin preview** are viewer controls.
5. Switch to **Raw mesh · experimental** to exercise the original vertex/face path.

Every listed procedural prompt has its own authored model. Selection also accepts an exact display name and ignores letter case and repeated whitespace. Unsupported custom ideas return an explicit error; they never silently fall back to a duck. Use a live profile for arbitrary requests. Mock raw geometry always returns the original wind crystal. This validates the pipeline and rendering, not the models' interpretation or latency.

The final procedural visual is baked into one render mesh. Its short appearance animation and optional preview spin are authored lab presentation; they do not modify the spec or execute gameplay effects.

## Enable live testing

1. Copy `.env.example` to `apps/server/.env` only if the latter does not exist.
2. Set `OPENAI_API_KEY` there using your editor. Credentials remain server-side.
3. Restart `bun run dev` and click **Refresh profiles**.
4. Select a live profile, choose the visual method, and submit a short prompt.

Adding a key never triggers an automatic call. The button explicitly identifies live API submissions. A nonblank OPENAI_API_KEY takes precedence over legacy AI_API_KEY; blank or unset values fall back to AI_API_KEY. Profile availability indicates configuration only, not verified account/model access.

## Run a comparison

The lab supplies 12 varied prompts and supports custom text up to ten whitespace-separated words / 200 characters. Run the same prompt once per method with the same model profile. Each button submission is a separate attempt; there is no automatic paid batch.

Rate recognizable silhouette and requested features as Clear, Partial, or Unclear. Check multiple angles and the distance selector. Its 45-degree camera is an inspection aid, not a reproduction of the race camera.

**Compare attempts** retains the last 60 attempts, including failures and cancellations. Summaries separate model configurations, visual methods, and mock/live transport. Median successful time excludes unsuccessful attempts; the ready/attempt count includes all attempts. Missing token usage is displayed as unavailable, not zero.

**Export comparison JSON** creates a visible, selectable JSON snapshot and a download link. Copy the text if the browser does not support downloads. It includes prompts, full profile settings, methods, events, specs, ratings, timing and outcomes. Export before navigating away, reloading, or editing code during development; history is component memory only.

Keep 30 seconds as the failure ceiling. A 5–10 second typical result is an evaluation target, not a measured guarantee. Retain both methods until live samples establish recognizable-result rate, latency, and usage. Single-call generation, additional shapes, material presets, and generated animation are future experiments.

## Models and budgets

Server profiles in `apps/server/src/generation/pipeline-config.ts`:
- `mock`: deterministic two-stage transport.
- `sol-astra`: Sol design → Astra visuals.
- `sol-sol`: Sol for both stages.
- `configured`: environment-selected models and output budgets.

| Variable | Default |
| --- | --- |
| DESIGN_MODEL | gpt-5.6-sol |
| DESIGN_REASONING | low |
| DESIGN_MAX_OUTPUT_TOKENS | 2048 |
| GEOMETRY_MODEL | gpt-6-astra |
| GEOMETRY_REASONING | low |
| GEOMETRY_MAX_OUTPUT_TOKENS | 12000 |

Both visual methods use the selected geometry-stage settings. Supported IDs remain gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra, and gpt-5.6-luna. Reasoning is low, medium, or high; output budgets are integers 256–16000. Budgets include reasoning tokens. Incomplete responses fail.

Calls use the official Responses API with strict Structured Outputs, no tools, store:false and maxRetries:0. Stage one has at most 8 seconds; stage two receives the remaining overall time. Geometry receives only the validated visual brief, never the original prompt or gameplay effect. Failed validation consumes the attempt; no silent fallback is applied to live results.

## Visual contracts and rendering

CreationSpec v2 already supports both representations, so no new game-spec version is introduced. The generated-result schema accepts either appearance with exactly one supported effect. Legacy v1 and broader v2 contracts remain compatible.

**Procedural parts**

The model wire recipe is `{parts: [...]}`. Each part contains:
- type: box, sphere, cylinder, or cone.
- position, rotation, scale: named `{x,y,z}` coordinates.
- color: exactly #RRGGBB.

The server validates this recipe and converts coordinates into the existing v2 tuples:

```ts
{
  version: 2,
  appearance: {
    type: 'primitives',
    primitives: [
      {type: 'sphere', position: [0,0,0], rotation: [0,0,0], scale: [2,1,2], color: '#ffcc32'}
    ]
  },
  // id, displayName, description, and exactly one effect are assembled separately.
}
```

Recipes contain 1–24 parts. Position axes are [-3,3] meters, rotation axes [-π,π] radians, and scale axes [0.05,4] meters. Numbers must be finite. Coordinates are right-handed: +X right, +Y up, +Z toward the object's front. Transforms apply scale, XYZ Euler rotation, then translation. Box size is 1×1×1; sphere diameter is 1; cylinder/cone diameter and height are 1 along Y, with the cone tip at +Y. All base shapes are centered.

These match existing primitive semantics. They bound part transforms rather than imposing the raw mesh's six-meter total cube. Prompts target a compact visual roughly three meters across.

The trusted browser compiler fixes sphere resolution to 16×12 segments and cylinder/cone radial resolution to 16. It bakes transformed positions, normals and per-part colors into one geometry with one material, capped at 10,000 triangles. Even 24 spheres fit this bound. Temporary geometries are disposed during compilation; R3F owns the final geometry and material. No model-provided tessellation, scripts, modifiers, colliders, material settings or animation fields are accepted.

**Raw mesh**

The existing model wire format is vertices `{x,y,z}` and faces `{a,b,c,color}`. Limits remain 256 vertices, 512 triangles, coordinates [-3,3], distinct existing integer indices, nondegenerate faces, and one #RRGGBB color per face. This budget is independent of trusted procedural compilation. Valid geometry can still have a poor silhouette, holes, or disconnected surfaces.

## HTTP contract

- GET /api/lab/profiles: public profiles, availability, and budgets.
- POST /api/lab/creations:

```json
{"text":"giant rubber duck","profileId":"sol-astra","geometryMode":"primitives"}
```

`geometryMode` is `primitives` or `mesh`. Omission retains the existing raw-mesh behavior; the lab explicitly defaults to primitives. Unknown request fields and methods are rejected.

Invalid input or profile returns HTTP 400 with `{error:{code,message}}`; an unconfigured profile returns 503. Accepted attempts stream application/x-ndjson:

```text
stage(design)
design(validated design + metric)
stage(geometry)
geometry(metric)
stage(validation)
complete(validated spec + metrics + total elapsed)
```

The stage name `geometry` remains stable for both methods. A failure replaces remaining events with `failed(stage,error,metrics,elapsedMs)`. Inspect the terminal event after HTTP 200. Error codes include INVALID_RECIPE, INVALID_MESH, INVALID_DESIGN, TIMEOUT, CANCELLED, REFUSED, INCOMPLETE, and PROVIDER_ERROR. Provider internals are not exposed.

Disconnect/cancellation aborts active work and prevents later stages. It cannot guarantee that already-started provider work incurs no usage. The client validates every stream event. Partial recipes and mesh fragments are never rendered.

POST /api/creations still returns a raw spec and defaults to the pipeline's mock raw-mesh method. It never silently enables live calls.

## Game integration boundary

The updated Game tab contains **Movement test** (the race mechanics) and **Voice / creation demo**. Neither is wired to the live lab pipeline. Their controls, movement, collisions and effect timing remain separate.

The intended future flow stays: collect authored Voice Power Up → speak once while falling → generate while falling → validate → spawn ahead of the current player → collect the creation → activate its one effect. Collision is game-owned and independent of appearance. Loading or materialization visuals must not activate effects early.

## Implementation and verification

- shared `creation.ts`, `pipeline.ts`, `procedural.ts`: versioned contracts, recipe adapter, and events.
- shared `procedural-fixtures.ts`: twelve examples and evaluation prompts, derived from the same catalog.
- server `generation/pipeline.ts`, `visual-output.ts`: orchestration and validation.
- server `generation/model-schemas.ts`, `stage-transport.ts`: prompts, wire schemas, SDK/mock calls.
- web `generation/compile-primitives.ts`: bounded single-mesh compilation.
- web `pages/GenerationLabPage.tsx`, `generation/LabPreview.tsx`, `LabHistory.tsx`: testing UI.

Run `bun run build`, `bun run typecheck`, and `bun run test`. Automated tests use fixtures and intercepted SDK responses, never paid calls. Coverage includes recipe bounds, one-effect output, handoff isolation, raw API compatibility, cancellation/deadlines, compiler transforms and budgets, comparison accounting, and existing game/race tests.

References: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization), [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).
