# Two-stage prompt-to-mesh pipeline

## Try the lab
Run `bun install`, then `bun run dev`. Open http://localhost:5173 and use **Generation lab**.

The default **Mock two-stage pipeline** needs no key. It runs the same orchestration and semantic validation as live generation, with deterministic model responses. Mock design selects a fixture effect by text; mock geometry always returns the hand-authored wind crystal, regardless of the visual request. It measures mock delays, not real model latency. No live API call is made automatically.

To enable live testing:
1. Copy `.env.example` to `apps/server/.env` if that file does not already exist.
2. Set `OPENAI_API_KEY` there using your editor. Do not put the key in chat, frontend variables, or committed files.
3. Restart `bun run dev` so the server reloads environment configuration.
4. Click **Refresh profiles**, choose **Sol design → Astra mesh**, and submit a short prompt.
5. Inspect the intermediate design, final mesh, stage timings, token usage and terminal status.

Live profiles are disabled when no key is configured. Availability means a key is configured; it does not verify model/account access. Invalid keys, account limits and inaccessible models produce a safe provider failure.

## Profiles and configuration
Profiles are defined server-side in `apps/server/src/generation/pipeline-config.ts`.
- `mock`: deterministic design and geometry transports.
- `sol-astra`: GPT-5.6 Sol design → GPT-6 Astra geometry, both low reasoning.
- `sol-sol`: GPT-5.6 Sol for both stages.
- `configured`: environment-selected stages.

The configured profile accepts:
| Variable | Default |
| --- | --- |
| DESIGN_MODEL | gpt-5.6-sol |
| DESIGN_REASONING | low |
| DESIGN_MAX_OUTPUT_TOKENS | 2048 |
| GEOMETRY_MODEL | gpt-6-astra |
| GEOMETRY_REASONING | low |
| GEOMETRY_MAX_OUTPUT_TOKENS | 12000 |

Supported model IDs: gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna. Reasoning choices are low, medium, high. Output budgets are integers from 256 to 16000. These are experimental settings, not a guarantee of completion within the deadline. API output budgets include reasoning tokens; incomplete responses fail instead of being repaired.

A nonblank OPENAI_API_KEY takes precedence over the legacy AI_API_KEY variable. Unset or blank values fall back to AI_API_KEY. The lab receives approved profile metadata only; no credential or arbitrary API endpoint can be supplied by the browser.

## One attempt, two calls
1. Validate text: 1–10 whitespace-separated words, maximum 200 characters.
2. Start an overall 30-second deadline.
3. Call design once, with at most 8 seconds.
4. Validate CreationDesign: name, description, visualBrief (1–700 characters), exactly one supported bounded effect.
5. Send only visualBrief to geometry. It does not receive the original request or effect.
6. Call geometry once, with the remaining overall time.
7. Validate geometry, assemble the final spec using the original design effect, assign a UUID, and validate the final result.
8. Return one mesh and one effect, or one structured terminal failure.

Both calls use the official OpenAI Responses API, strict Structured Outputs, no tools, store:false, and maxRetries:0. There are no automatic repair calls, retry attempts, or fallback models. A failure in design prevents the geometry call. Cancellation/disconnection aborts the active request and prevents later stages. Local cancellation cannot guarantee that already-started provider work incurs no usage.

The SDK returns complete data per stage. Progress streaming is between our server and the lab; partially generated mesh vertices are never rendered.

## Contracts
`packages/shared/src/pipeline.ts` defines the validated design, narrow final schema, profile metadata, model wire geometry, stream events, errors, and metrics. The broad CreationSpec v2 and legacy v1 contracts are preserved.

The API-compatible geometry wire format uses objects:
```ts
{
  vertices: Array<{x:number; y:number; z:number}>;
  faces: Array<{a:number; b:number; c:number; color:string}>;
}
```
The adapter converts these to the game's coordinate/index tuples, without repairing geometry or changing semantics. Strict validation rejects extra fields, including attempted effect overrides.

Limits remain 256 vertices, 512 faces, coordinates in [-3,3] meters, distinct existing integer indices, nondegenerate triangles and one #RRGGBB color per face. Prompts target approximately 16–48 vertices and 32–96 faces to keep results compact. Mesh topology can still be visually poor despite passing validation; holes/disconnected surfaces are allowed.

## Lab API
- `GET /api/lab/profiles`: public profiles, availability and timing budgets.
- `POST /api/lab/creations`: `{"text":"a wind crystal","profileId":"sol-astra"}`.
- Invalid input/unknown profile: HTTP 400, structured error envelope.
- Unconfigured live profile: HTTP 503, structured error envelope.
- Accepted requests: HTTP 200 with newline-delimited JSON and Content-Type application/x-ndjson.

Event flow:
```text
stage(design)
design(validated design + metric)
stage(geometry)
geometry(metric)
stage(validation)
complete(spec + metrics + total elapsed)
```
A failure replaces the remaining events with `failed(stage, error, metrics, elapsedMs)`. After headers are sent, inspect the terminal event rather than relying on HTTP status. Codes include INVALID_DESIGN, INVALID_MESH, TIMEOUT, CANCELLED, REFUSED, INCOMPLETE and PROVIDER_ERROR. Raw provider errors are never returned.

Per-stage metrics include elapsed wall time and token usage when the SDK supplies it. Failed/aborted calls may have no usage information. The lab keeps the last eight attempts in component memory; reloading or leaving the page clears history. It preserves the previous valid mesh when an attempt fails.

The existing `POST /api/creations` remains a raw-spec interface and defaults to this pipeline's mock profile. It never silently enables live calls when a key is added.

## Isolation
GamePage, controls, PlayerController, collision, effect execution, voice capture and the in-game CreationClient remain unchanged. The game still uses its browser mock. The lab has a separate streaming client. Integrate the live pipeline with the game only in a later explicit change.

Useful files:
- `pipeline.ts`: orchestration and deadlines.
- `stage-transport.ts`: SDK call and response handling, plus mocked stages.
- `model-schemas.ts`: model response schemas and version-controlled prompts.
- `pipeline-config.ts`: approved profiles.
- `lab-routes.ts`: HTTP progress streaming and disconnect handling.
- `GenerationLabPage.tsx`: manual testing and session history.

All server paths above are under apps/server/src/generation. The lab page is under apps/web/src/pages.

## Verification and evaluation
Run `bun run build`, `bun run typecheck`, and `bun run test`. Tests use fake model responses and intercepted SDK HTTP, never real credentials or paid calls. Coverage includes handoff isolation, validation, timeouts, cancellation, refusal, incomplete output, disabled retries, streaming and existing gameplay tests.

Before choosing defaults, manually compare the same varied prompts across live profiles. Record recognizable silhouette, valid-result rate, latency, and token usage. No live model quality or latency has been established by the mock tests.

Official references: [Responses API](https://developers.openai.com/api/docs/guides/responses), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).
