# Player-authored safety drills

Players collect an Inspection Request, report a hazard in ten words or fewer, and keep falling while the request is processed. The resulting object appears ahead. The first racer to collect it starts a shared ten-second drill, including its warning. The department reproduces the reported concern around the field; creator and collector receive no exemption.

The first two families are Stampede and Sky Rapids. Their behavior comes from the request, not just their appearance. Angry hippos can warn and charge once; nervous hippos scatter when approached; sleepy hippos form a draftable convoy. Rapids can wind, alternate lanes, or offer a wide route and a narrow fast shortcut. Pulses and recovery eddies change when and where to enter.

The displayed drill title describes the selected behavior: for example, **Charge Avoidance**, **Scatter Response**, or **Slipstream Formation**. These all use Stampede's moving-object engine but ask the player to act differently. Rapids titles distinguish current navigation, shortcuts, lane changes, and pulses. The lab also shows the design-stage selection before geometry completes.

Appearance-only requests are valid. The design model infers a supported interaction from traits such as friendliness, nervousness, gliding, or weather equipment. This remains a two-family vocabulary; a more specific title does not add a new mechanic. Live interpretation should be checked with actual prompts after deliberate paid opt-in.

## How a request becomes gameplay

The existing pipeline still handles optional transcription, design, and geometry. Design now produces a static visual brief and a bounded drill recipe. The geometry stage receives only the visual brief. It never receives gameplay data or the original request. Server and browser validate the completed result.

`SafetyDrillSpec` is version 4. It contains `id`, `displayName`, `description`, `appearance`, and `drill`. The appearance uses the same validated primitive/raw-mesh formats and budgets as before. `description` is authored from the validated recipe, so its instructions describe supported gameplay. One generated mesh is reused throughout one encounter.

Recipes have no numeric strengths or executable code:

```ts
// Stampede
{
  family: 'stampede',
  formation: 'line' | 'split' | 'convoy',
  direction: 'left' | 'right' | 'alternating',
  reaction: 'steady' | 'charge' | 'scatter',
  modifier: 'none' | 'draft',
}

// Sky Rapids
{
  family: 'rapids',
  layout: 'winding' | 'forked' | 'alternating',
  flow: 'steady' | 'pulsing',
  modifier: 'none' | 'eddies',
}
```

A convoy requires `steady`; reactive formations use `line` or `split`. Unknown fields, extra mechanics, strengths, durations, targets, and invalid combinations are rejected before geometry generation. The design instructions honor explicit behavior and infer behavior when omitted. Unsupported ideas receive a bounded interpretation whose actual behavior is explained by the game; the system does not promise arbitrary mechanics.

`compileSafetyDrill` validates a recipe and supplies authored settings from `SAFETY_DRILL_LIMITS`. Units are meters, seconds, m/s for velocity, and m/s² for acceleration; +Y is up. Collision and force volumes are independent of generated mesh dimensions. The runtime owns placement and shared seeded course bands at activation, using current race positions rather than stale generation-time coordinates. Actor/current counts are capped across the whole encounter. Charges commit once; objects never continually home on players.

## APIs and compatibility

- `POST /api/lab/drills` accepts the existing strict `PipelineRequest`: `text`, `profileId`, optional `geometryMode`, and explicit `paidAttempt` for a live request. It returns NDJSON parsed with `SafetyDrillPipelineEventSchema`.
- `POST /api/voice/drills` accepts the existing multipart audio plus `VoiceRequest` options. It returns NDJSON parsed with `SafetyDrillVoiceEventSchema`.
- Successful completion includes the validated v4 spec. Failed streams contain the existing structured pipeline error; no automatic repair or retry occurs.
- V1 and v2 APIs and fixtures remain unchanged. V3 `/api/lab/events` and `/api/voice/events` retain their fixed-preset behavior. `RaceEncounter` is the explicit v3/v4 union used by the shared runtime and replay UI.

Recording remains capped at eight seconds, upload/transcription has its own ten-second budget, and design/geometry share thirty seconds with at most eight seconds for design. Existing content checks, server-only credentials, origin checks, consent, shared busy slot, and per-instance allowance still apply. No additional model call is used for behavior or assessment. See [the pipeline documentation](prompt-to-mesh-pipeline.md), [voice flow](voice-input-plan.md), and [deployment controls](deployment.md).

## Working on this feature

- Shared recipes, compiler settings, fixtures, and stream schemas: `packages/shared/src/safety-drill*.ts`.
- Design format, protected coordinator, mock adapter, and endpoints: `apps/server/src/generation` and `apps/server/src/voice`.
- Encounter simulation, rendering, client, and free replay controls: `apps/web/src/race-events`.
- Main-race lifecycle and input adapters: `apps/web/src/game`.

`RaceScene` retains the only fixed-step clock. The runtime produces bounded acceleration, one-shot velocity deltas, and collision/protection results; it never reads input or moves racers itself. Keep the two fresh voice opportunities, one attempt per star, queued-result cleanup, and no encore. Pause/reset/end/navigation cancel pending requests and discard stale results. See [race integration](race-events-handoff.md) and [architecture](architecture.md).

## Free testing and evaluating the AI contribution

Start `bun run dev` and use the development Generation lab's drill fixtures/replay or the game's mock voice path. Mocks are deterministic authored examples for hippos, jellyfish, ducks, rockets, and fish. They can vary supported behavior words, but they are not a language model. Unknown objects return a clear error instead of silently becoming a rubber duck. Mock recording uses the selected prepared prompt rather than recognizing microphone speech.

Keep the mesh and seed constant when comparing angry, nervous, and sleepy hippos: the warning, reaction, opening, and useful wake should change the player's decision. Then keep the behavior constant and change the object; the mechanics should remain consistent while the generated geometry changes. Check deliberate drafting, dodging a committed charge, approaching to scatter, choosing the fast fork, and recovering in an eddy.

Run `bun run build`, `bun run typecheck`, and `bun run test`. Contract/server coverage checks strict rejection, compatibility, visual-only handoff, cancellation/deadlines, content checks, and shared paid admission with intercepted providers. Runtime and browser checks cover the actual movement consequences and lifecycle. A real model evaluation requires a separate explicit paid-test opt-in; fixtures alone do not establish that an unfamiliar live prompt will be interpreted correctly.

## Adding actions without rebuilding the pipeline

An **action** is a player interaction (dodge a charge, follow a wake, choose a shortcut). A **recipe** combines supported options. A **family** implements the underlying movement or force rules. There are currently two families and 54 valid recipe combinations; that does not mean there are 54 distinct mechanics.

Use this division when expanding to ten or more actions. New combinations reuse the current engines. Genuinely different mechanics get explicit runtime code; they do not need another voice client, API endpoint, generation pipeline, or simulation clock.

| What you are adding | Where to work |
| --- | --- |
| Another example using existing behavior, such as a friendly drafting convoy | Add a fixture in `packages/shared/src/safety-drill-fixtures.ts`. Update mock matching only if that example needs it. Live requests already use the existing vocabulary. |
| A new option within a family, such as another Stampede reaction | Add its strict recipe option in `packages/shared/src/safety-drills.ts`, implement its runtime branch, and add its title/instruction and tests. Describe its actual semantics in the server design prompt. |
| A new mechanic, such as Inspection Gates or Orbital Slingshots | Add a strict family branch and authored limits. Implement setup/tick/contact behavior in a focused module under `apps/web/src/race-events`, called by `SafetyDrillRuntime`. Add any genuinely new snapshot, renderer, rival-planning, and assessment support together. |

The recipe schema is the source of truth for allowed combinations. Convoys are represented as a strict branch with `reaction: 'steady'`, rather than a hidden refinement. `drillFormat` derives the provider's recipe JSON schema using the installed OpenAI SDK helper; do not maintain a second enum list. Only the outer display-name/visual-brief wire bounds stay explicit because their Zod trim transforms are not supported by that converter. Keep these fields aligned if their limits change.

Titles and instructions are paired in typed presentation tables in `safety-drills.ts`. New reactions, formations, routes, flows, or modifiers require corresponding copy. Runtime family setup, tick dispatch, and reactive behavior use exhaustive switches; a new family/reaction cannot silently become Rapids or Scatter. Keep those checks exhaustive instead of adding a permissive default.

The renderer and rivals consume spatial snapshots, not the generated noun or prompt. Existing `DrillActor`, wake, and current capsules can represent many new interactions without renderer changes. Their bounds also drive contacts and forces. Add a new snapshot primitive only when existing volumes cannot truthfully represent the mechanic; update rendering and rival awareness in the same change. Assessment text in `game/drill-feedback.ts` must describe measured local results. Record a new metric before claiming the player performed a new action.

Keep family-specific state and equations out of the generic collection/voice lifecycle. The current two-family runtime remains compact; there is no dynamic registry or general-purpose scripting system. When a new family needs substantial code, give it a module with explicit calls from the existing runtime. This keeps future additions reviewable without building a framework in advance.

### Extension checklist

1. Define the player's decision and the visible cue. Start with a deterministic fixture and make it playable for the player and rivals before exposing it to AI.
2. Add or update the strict recipe branch, authored bounds, honest title/instruction, and relevant runtime implementation. Keep compatibility rules structural so the model sees them too. AI still supplies no numeric strengths, targets, or code.
3. Extend the server prompt's semantic explanation and free mock examples. Schema derivation handles the accepted fields; it does not teach the model what the new behavior means.
4. Extend recipe/schema parity and runtime tests. Cover valid and invalid combinations, global count/force limits, harmless warnings, protection, creator/collector equality, finished racers, determinism, and actual movement consequences. Extend the option lists in the combination tests when adding an option.
5. Check collection, completion, pause/reset, and queued second results. Text/voice progress schemas reuse `createPipelineEventSchema` and `createVoiceEventSchema`; each endpoint still validates only its own v2, v3, or v4 payload. Adding a family requires no new transport.
6. Run `bun run build`, `bun run typecheck`, and `bun run test`, then inspect the new fixture in the lab and actual race. Test unfamiliar live prompts only with explicit paid-test approval; mocks and intercepted SDK tests cannot establish interpretation quality.

Existing v4 recipes must remain valid. If adding a family to v4, deploy server and client together: an older client will correctly reject an unfamiliar family. Breaking field/meaning changes require an explicit version migration. Keep v1-v3 endpoints and their exercised demo/regression adapters; old does not mean unused.
