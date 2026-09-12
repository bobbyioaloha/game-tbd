# Shared foundation
- TypeScript npm workspaces: apps/web (React/Vite/R3F), apps/server (Fastify), packages/shared (Zod contracts, inferred types, fixtures).
- Run npm install, npm run dev; verify with npm run build, npm run typecheck, npm test.
- Gameplay developer owns apps/web/src/pages/GamePage.tsx and future gameplay modules. Use PowerUpModel for visuals and shared effect types for interpretation.
- Generation developer owns apps/server, apps/web/src/generation, and apps/web/src/voice. Voice returns text; generation returns validated data.
- Coordinate changes to packages/shared, root configs, and lockfile before editing. Preserve the v1 contract or explicitly coordinate a new version.
- AI may return declarative data only. Validate at server and client boundaries; never evaluate generated code. Credentials stay server-side.
- Keep collectible collision independent of appearance. Do not add physics, database, authentication, or multiplayer to this foundation.
- Inspect existing work and avoid unrelated changes. Run relevant checks before handoff.
