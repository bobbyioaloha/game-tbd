# Shared foundation
- TypeScript Bun workspaces: apps/web (React/Vite/R3F), apps/server (Fastify), packages/shared (Zod contracts, inferred types, fixtures).
- Run bun install, bun run dev; verify with bun run build, bun run typecheck, bun run test.
- Controls/movement are owned separately: see docs/controls-handoff.md. Keep user input and player position updates out of creation-loop.ts.
- Gameplay developer owns apps/web/src/pages/GamePage.tsx and future gameplay modules. Use PowerUpModel for visuals and shared effect types for interpretation.
- Generation developer owns apps/server, apps/web/src/generation, and apps/web/src/voice. Voice returns text; generation returns validated data.
- Coordinate changes to packages/shared, root configs, and lockfile before editing. Preserve the v1 contract or explicitly coordinate a new version.
- AI may return declarative data only. Validate at server and client boundaries; never evaluate generated code. Credentials stay server-side.
- Keep collectible collision independent of appearance. Do not add physics, database, authentication, or multiplayer to this foundation.
- Inspect existing work and avoid unrelated changes. Run relevant checks before handoff.

- Voice Power Ups are authored one-attempt grants, separate from generated CreationSpec v2 objects. Keep v1 fixtures/API compatible.
- Preserve the one-attempt rule: no automatic retries, refunds, or stale results spawning into another run. Game voice and generation remain mocked; the isolated Generation lab can run the implemented two-stage live pipeline.
- CreationPipeline owns two-stage generation; CreationProvider is the adapter boundary for the existing raw-spec API. Generation lab is the manual text-to-3D test interface.

- PlayerController and use-game-input.ts are the controls extension points. DemoGame owns world integration; CreationLoop receives semantic pickup events and calls CreationHost. Avoid duplicate frame integration.

- Live lab attempts run design then geometry with a shared 30-second deadline and no SDK retries. Geometry receives only the visual brief. Preserve one mesh / one effect and keep controls/gameplay isolated. See docs/prompt-to-mesh-pipeline.md.

- Lab geometryMode selects bounded primitive recipes or raw meshes; omission preserves raw-mesh API behavior. Reuse CreationSpec v2 and keep exactly one effect.
- Procedural rendering compiles static parts into one mesh with fixed tessellation and a separate 10,000-triangle budget. Preserve raw mesh limits and keep model-written code, colliders, and arbitrary renderer settings rejected.
- GamePage contains the merged movement/race test and CreationDemoPage; lab experiments must not replace or wire into these game views implicitly.

- Paid calls are disabled by default, even when API keys exist. Only explicit server --live (root bun run dev:live) enables the local lab; never turn on live mode as part of builds, tests, previews, or health checks.
- Preserve server-side per-attempt consent, unique attempt IDs, one live request at a time and the bounded per-start allowance. Live server runs without watch/restart; failures and cancellation after dispatch consume attempts.
- Never read, print, commit, export, or place local API keys in client code/VITE_ variables. Tests use fake credentials and intercepted transports; do not run paid tests without explicit user authorization for that test.
