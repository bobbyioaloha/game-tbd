# Shared foundation
- TypeScript Bun workspaces: apps/web (React/Vite/R3F), apps/server (Fastify), packages/shared (Zod contracts, inferred types, fixtures).
- Run bun install, bun run dev; verify with bun run build, bun run typecheck, bun run test.
- Controls/movement are owned separately: see docs/controls-handoff.md. Keep user input and player position updates out of creation-loop.ts.
- Gameplay developer owns apps/web/src/pages/GamePage.tsx and future gameplay modules. Use PowerUpModel for visuals and shared effect types for interpretation.
- Generation developer owns apps/server, apps/web/src/generation, and apps/web/src/voice. Microphone capture returns audio; server transcription returns validated text; generation returns validated data.
- Coordinate changes to packages/shared, root configs, and lockfile before editing. Preserve the v1 contract or explicitly coordinate a new version.
- AI may return declarative data only. Validate at server and client boundaries; never evaluate generated code. Credentials stay server-side.
- Keep collectible collision independent of appearance. Do not add physics, database, authentication, or multiplayer to this foundation.
- Inspect existing work and avoid unrelated changes. Run relevant checks before handoff.

- Voice Power Ups are authored one-attempt grants, separate from generated objects (v3 shared events in the main race, v2 in the legacy demo). Keep v1 fixtures/API compatible.
- Preserve the one-attempt rule: no automatic retries, refunds, or stale results spawning into another run. Main race and Generation lab default to mocks and support explicitly opted-in paid speech/generation. The separate creation demo remains simulated.
- CreationPipeline owns shared paid admission, optional transcription, and two-stage generation; CreationProvider is the adapter boundary for the existing raw-spec API. Generation lab is the text/voice-to-3D test interface.

- Main race controls live in MovementTest and freefall-controller.ts; RaceScene owns its sole fixed-step loop. PlayerController/use-game-input.ts and DemoGame remain the separate demo extension points; CreationLoop receives semantic pickup events and calls CreationHost. Avoid duplicate frame integration.

- Live lab attempts run design then geometry with a shared 30-second deadline and no SDK retries. Geometry receives only the visual brief. Preserve one mesh / one effect and keep controls/gameplay isolated. See docs/prompt-to-mesh-pipeline.md.

- Legacy lab geometryMode selects bounded primitive recipes or raw meshes; omission preserves raw-mesh API behavior. Reuse CreationSpec v2 and keep exactly one effect.
- Procedural rendering compiles static parts into one mesh with fixed tessellation and a separate 10,000-triangle budget. Preserve raw mesh limits and keep model-written code, colliders, and arbitrary renderer settings rejected.
- GamePage contains the merged movement/race test and CreationDemoPage; lab experiments must not replace or wire into these game views implicitly.

- Paid calls are disabled by default, even when API keys exist. Only explicit server --live (root bun run dev:live) enables local paid speech/generation; never turn on live mode as part of builds, tests, previews, or health checks.
- Preserve server-side per-attempt consent, unique attempt IDs, one live request at a time and the bounded per-start allowance. Live server runs without watch/restart; failures and cancellation after dispatch consume attempts.
- Never read, print, commit, export, or place local API keys in client code/VITE_ variables. Tests use fake credentials and intercepted transports; do not run paid tests without explicit user authorization for that test.

- Voice uses shared contracts in packages/shared/src/voice.ts and replaceable capture/client/provider adapters in apps/web/src/voice and apps/server/src/voice. See docs/voice-input-plan.md.
- Preserve 8-second capture, separate 10-second upload/transcription and 30-second generation budgets; one paid gate covers the full voice attempt. Never store audio in files, logs, or history exports.
- RaceEventHost owns main-race voice pickup/spawn integration; the legacy RaceCreationHost remains available for v2 regression coverage; it consumes the race's swept movement segment and never moves the player. Pause/reset/end/navigation abort voice work and discard stale results. Generated effects use their validated parameters and do not replace inventory.

- Race-event v3 work is isolated in packages/shared/src/race-event*.ts and apps/web/src/race-events. See docs/race-events-handoff.md. Existing v1/v2 schemas and game flow remain compatible.
- RaceEventRuntime never moves racers or reads input; gameplay applies its bounded acceleration (m/s²), one-shot velocityDelta (m/s) and per-tick obstacleProtection. PracticeRace calls RaceEventBridge.beforeStep/afterStep inside the update driven by RaceScene’s sole fixed-step clock. Never add a second event integrator.
- Any active racer can trigger an event once; creator/triggerer have no exemption. Keep shared objects alive after their creator passes/finishes. One live event at a time; seeded debris is bounded and cosmetic fragments never collide.
- Event sandbox, v3 endpoints, and main-race lifecycle/controller integration are implemented. The microphone uses createAudioRaceEventClient; CreationAttempt shares lifecycle logic with the legacy v2 adapter. Do not cast v3 specs into the old CreationLoop or import sandbox movement into gameplay.

- Preserve later-course placement for generated objects (the manual fixture/replay panel has an explicit 30 m quick mode) and the game-authored travel budget (30–600 s) for pickups; active effects keep their short validated durations. Main-race pickup contact radius is 3.5 m independently of mesh scale. Keep event RNG independent of item/rival randomness.

- Strong event presets cover the course while remaining bounded. Debris uses three dodgeable waves sharing a maximum 128 particles, never homing after launch. Keep impact counters cumulative and the last result/replay in memory only; never retain audio or make provider calls from fixture/replay controls.
