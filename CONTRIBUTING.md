# Contributing to Falling Standards

Thanks for taking a look. This began as two frontend developers' first game, so a useful contribution can be a clearer button, a better dinosaur pose, a reproducible bug report, or a small gameplay improvement.

Start by [running the game locally](README.md#run-locally). No API key is required. Play one race without voice, then try a prepared creation in mock mode to see the main mechanic.

## Find a place to start

| You want to improve... | Start here | Useful background |
| --- | --- | --- |
| Steering, rivals, obstacles, or ordinary items | `apps/web/src/game` | [Race mechanics](docs/race-playground-handoff.md) and [controls](docs/controls-handoff.md) |
| Menus, setup, HUD, or readability | `apps/web/src/game/MovementTest.tsx`, `RaceSetup.tsx`, and their styles | [Architecture](docs/architecture.md) |
| Characters and animation | `scripts/build-greg.py`, `apps/web/src/game/GregModel.tsx` | [Character art](docs/dinosaur-art-direction.md) |
| Generated effects and their feedback | `apps/web/src/race-events`, `packages/shared/src/race-event*.ts` | [Shared race effects](docs/race-events-handoff.md) |
| Speech or generated objects | `apps/web/src/voice`, `apps/web/src/generation`, `apps/server/src` | [Voice guide](docs/voice-input-plan.md) and [Generation lab](docs/prompt-to-mesh-pipeline.md) |
| Setup instructions or bug reports | `README.md`, `docs`, or a repository issue | Describe the confusing step or a repeatable failure. |

Some filenames reflect earlier prototypes. `MovementTest.tsx` runs the current game; `CreationDemoPage.tsx` is a retained regression demo. The [architecture guide](docs/architecture.md) explains those distinctions.

Small, useful first changes include improving a control hint, checking HUD readability at a narrow desktop width, tuning an existing event's visual feedback, or adding a regression case for a reproduced bug. These are starting points, not claims that specific bugs are still open.

## Make a focused change

1. Start from the current branch agreed with the team and create a branch for your change.
2. Locate the relevant module and its nearby tests. Describe the intended behavior before changing a shared interface.
3. Keep the diff focused. Leave unrelated formatting, generated assets, and dependency upgrades for separate changes.
4. Test the behavior you changed, then run the checks below for code changes.
5. Open a pull request explaining the player-visible result and how you checked it.

Gameplay and generation can be developed independently. Coordinate changes to `packages/shared`, root configuration, and the lockfile because both sides depend on them. Keep existing v1/v2 clients working when extending v3 events.

## Boundaries that keep the game predictable

- **Movement has one clock.** `RaceScene` advances the simulation. Effects provide forces and impulses for that update to apply; a renderer or microphone callback should not also move the player.
- **AI supplies data.** Validate requests and results using shared schemas. Never run generated JavaScript or allow the model to define collision rules.
- **Looks and contact are separate.** A thin umbrella and a bulky hippo need a fair chance of collection. The game defines pickup bounds independently of their mesh dimensions.
- **A voice star grants one attempt.** Cancellation or failure must not automatically retry, refund, or spawn a late object in the next race. Test reset and pause as well as the success path.
- **Paid tests are deliberate.** Builds, tests, and ordinary development use mocks. Keep keys in the ignored server environment file, never in frontend code, `VITE_` variables, logs, screenshots, or PRs. Recording audio stays in memory.

For a new effect, discuss the behavior first, then update its shared schema and preset, runtime interpretation, visual feedback, and fixture/tests together. Verify that any racer can trigger it and that creator and triggerer participate like everyone else. See the [effect integration reference](docs/race-events-handoff.md).

## Check your work

For code changes, run from the repository root:

```sh
bun run build
bun run typecheck
bun run test
```

Use `bun run test`, which runs the configured Node/TypeScript test suite. Tests use fixtures and intercepted provider calls; no real API key is needed. For documentation-only changes, check links, command names, and formatting instead of rerunning the game suite.

For a visible or gameplay change, also test the affected path in desktop Chrome or Edge. Useful checks include steering/braking, pause/resume, restarting, item use, and finishing a race. For creation work, try [free event fixtures and replay](docs/race-events-handoff.md#free-gameplay-check), then the mock voice path. Confirm that resetting during a request cannot spawn an object in the next run.

Automated tests cannot establish whether an effect is readable or a camera feels good. Include a screenshot or short recording for visual changes, and say which browser you used. Only perform a paid quality test when explicitly intended; failed dispatched attempts can still cost money.

## Open a pull request

A short description should answer:

- What changed, and why does it help a player or contributor?
- How can a reviewer try it?
- Which checks passed, and what still needs manual verification?

Mention shared-contract or setup changes explicitly and update the relevant guide. Include source changes needed to reproduce a rebuilt asset, along with the asset itself. Commit `bun.lock` when dependencies change, not local environment files or build output.

## Report a bug or contribute a playtest

Include the browser/OS, local or hosted game, steps to reproduce, expected behavior, and what actually happened. For voice problems, say whether you selected **Mock** or **Live AI**, which stage failed, and the safe error code. A screenshot and elapsed timings are useful; keys and audio recordings are not needed.

Feedback about control feel, effect visibility, or confusing instructions is valuable even without a code fix. Explain the moment where you got lost and what you expected to happen.

## Working with Codex

[AGENTS.md](AGENTS.md) contains working rules for coding agents. Contributors should understand and review their changes regardless of which tools helped produce them. Keep task instructions scoped, inspect the resulting diff, and report the checks actually performed.
