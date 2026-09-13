# Vercel deployment

## Build and deployment

```sh
bun install --frozen-lockfile
bun run build:deploy
bun run typecheck
bun run test
```

`build:deploy` builds shared contracts, the Node backend, and the game-only Vite frontend. It does not upload files, start servers, fetch secrets, or call providers. Ordinary production builds also omit the Generation lab module and route. The lab remains available with `bun run dev`.

Import the GitHub repository into a Vercel Hobby project with the **repository root** as Root Directory. Use the checked-in `vercel.json` Services configuration; do not override its service-specific build commands with a top-level command. Services is currently beta. The web service publishes `apps/web/dist`; the API service uses the explicit `src/vercel.ts` Fastify entry point, Node 22, a 60-second function limit, and request cancellation. Bun 1.4.2 is pinned in install/build commands. Both service builds include the shared workspace.

Routing sends `/api/*` to Fastify and everything else to Vite. The game continues to use relative API URLs. `/api/lab/profiles` and event endpoints are gameplay dependencies, even though the Generation lab UI is not shipped. Character GLBs remain static frontend assets.

First deploy with **no secrets and paid mode disabled**. Configure Vercel Authentication with **All Deployments** before enabling live mode. This covers the production domain and direct deployment URLs, including their APIs. Hobby currently permits one external authenticated user and one revocable shareable link per account. Anyone receiving a shareable link can use it. Check private-repository collaboration restrictions when connecting both developers' commits; Hobby does not support private-repository team collaboration.

## Production configuration

Set these directly in the Vercel project's Environment Variables settings, targeting **Production only**:

| Name | Type | Value |
| --- | --- | --- |
| `HOSTED_LIVE_ENABLED` | Config | `false` initially; deliberately change to `true` after setup |
| `APP_ORIGIN` | Config | Exact game origin, e.g. `https://your-game.vercel.app`, without a trailing slash |
| `OPENAI_API_KEY` | Secret | Enter the provider key directly in Vercel |
| `LIVE_MAX_ATTEMPTS` | Config, optional | Defaults to **100 per server instance** when unset; accepts 1-100 |

No database or additional service is required. Existing model/token-limit configuration in `.env.example` remains supported. Local `bun run dev:live` defaults to 3 attempts per start; do not copy that local allowance into Vercel unless you want to override its hosted default.

Vercel stores variables encrypted at rest; Secret values are hidden after saving but available to executing server/build code. The provider reads `process.env.OPENAI_API_KEY` only in server modules. Never use `VITE_` for credentials, serialize environment variables into client configuration, print them, or download production secrets for local checks. The Git/CLI ignore rules exclude local `.env` files and `.vercel` state. The browser receives validated data, not credentials.

Key presence does not authorize spending. Hosted live mode additionally requires the production environment, explicit enable flag, valid origin, and per-attempt consent. Preview deployments always remain mock-only, even if a live flag is accidentally inherited. Origin checks supplement deployment protection; they are not authentication.

After the protected mock deployment passes the checks below, set `HOSTED_LIVE_ENABLED=true` and redeploy. Use the canonical `APP_ORIGIN` URL for live testing. Adding keys or visiting a health endpoint never starts a provider call.

## In-memory allowance

Each server instance keeps its own count, consumed attempt IDs, and one busy slot in memory. It allows up to **100 paid attempts** by default. Tabs and profiles reaching that instance share the allowance, and a voice attempt holds the slot across transcription, design, and geometry. Duplicate IDs are rejected within that instance. Failures and cancellation after dispatch consume the attempt; completion or cancellation releases the busy slot. There are no automatic provider retries.

This is an approximate safeguard, **not a global spending cap**. Vercel can run several instances; each has its own allowance and can accept work concurrently. Cold starts and redeployments start fresh, including duplicate-ID history. The remaining count shown in the game belongs to whichever instance served the request and may change between requests. No data is persisted to a database.

One voice attempt can make up to three paid calls, so 100 attempts is not a dollar ceiling. Already-dispatched work may still incur charges after cancellation. App budgets remain 8 seconds capture, 10 seconds upload/transcription, and 30 seconds generation.

## Verification and recovery

Before sharing: run build/typecheck/tests, verify the game and GLBs load over HTTPS, confirm the lab page/code is absent, and check that unauthenticated browser and API requests are protected. Test mock text/voice event generation, microphone permission in Chrome/Edge, collection/effects, streamed progress, and cancellation on reset/navigation. Live-mode health reports configured mode only; it does not probe providers or indicate remaining allowance.

The test suite uses fake provider credentials and intercepted transports. It covers hosted opt-in, preview isolation, exact origins, the 100-attempt allowance, streaming, and disconnect cancellation without paid calls or external services.

Authorize one paid end-to-end test separately after the mock and access checks pass. Review stage timings and safe error codes; do not log audio, provider keys, or raw provider errors. Instance-level usage and duplicate rejection are tested locally; do not interpret hosted counters as durable totals.

To disable paid mode, set `HOSTED_LIVE_ENABLED=false` and redeploy. Environment changes do not update old deployments, which may still have live mode enabled. Keep all deployment URLs protected; revoke the provider key if you need to stop access across old deployments. Already-dispatched work may finish and incur charges. For rollback, choose a known-good mock-only deployment. For key rotation, save the replacement Secret, redeploy, and revoke the old key.

References: [Services](https://vercel.com/docs/services), [Fastify](https://vercel.com/docs/frameworks/backend/fastify), [deployment protection](https://vercel.com/docs/deployment-protection), [Secret variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).
