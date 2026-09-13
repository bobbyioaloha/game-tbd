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
| `UPSTASH_REDIS_REST_URL` | Config | HTTPS REST endpoint from a dedicated Upstash Redis database |
| `UPSTASH_REDIS_REST_TOKEN` | Secret | REST token from that database |

Existing model/token-limit configuration in `.env.example` remains supported. Do not set `LIVE_MAX_ATTEMPTS=100`: that setting belongs to the separate local per-start gate (default 3, maximum 10). The hosted allowance lives in Redis.

Vercel stores variables encrypted at rest; Secret values are hidden after saving but available to executing server/build code. The provider reads `process.env.OPENAI_API_KEY` only in server modules. Never use `VITE_` for credentials, serialize environment variables into client configuration, print them, or download production secrets for local checks. The Git/CLI ignore rules exclude local `.env` files and `.vercel` state. The browser receives validated data, not credentials.

Key presence does not authorize spending. Hosted live mode additionally requires the production environment, explicit enable flag, valid origin, shared Redis permission, and per-attempt consent. Preview deployments always remain mock-only, even if a live flag is accidentally inherited. Origin checks supplement deployment protection; they are not authentication.

## Shared allowance: one-time setup

Create one dedicated Upstash Redis database. No SDK or new package dependency is required; the server uses its HTTPS REST endpoint. Audio, prompts, generated meshes, and game state are never stored in Redis.

In the private Upstash console, run this **once**, before enabling paid mode:

```text
HSET skyfall:{live}:budget enabled 0 limit 100 used 0
```

Do not run the initialization on redeploy: it resets the counter. Missing or invalid configuration blocks paid requests. The keys are stable across all instances and deployments:

- `skyfall:{live}:budget`: enabled flag, limit, and used count.
- `skyfall:{live}:attempts`: consumed UUIDs, retained across replenishment.
- `skyfall:{live}:lease`: active request token, with a 90-second expiry.

After protection and deployment checks pass, enable admission in the console:

```text
HSET skyfall:{live}:budget enabled 1
```

Set `HOSTED_LIVE_ENABLED=true` in Vercel and redeploy. New live requests must originate from `APP_ORIGIN`; use that canonical URL for testing. Adding keys or visiting a health endpoint never starts a provider call.

Reservation checks consent, duplicate IDs, the active lease, and the allowance before any paid dispatch. Redis atomically records the ID, increments usage, and takes the lease. A voice attempt holds it across transcription, design, and geometry. One attempt can make up to three paid calls; 100 attempts is not a dollar ceiling.

Failures, cancellation, or a crash after reservation consume the attempt. Ambiguous Redis responses are not retried and never lead to provider dispatch. Redis outages block paid work. Normal completion releases only the owner's lease; after a crash or function termination it expires after 90 seconds. Provider work already dispatched can still incur charges. App budgets remain 8 seconds capture, 10 seconds upload/transcription, and 30 seconds generation.

## Disable, inspect, and replenish

Stop admitting new paid attempts immediately:

```text
HSET skyfall:{live}:budget enabled 0
HGETALL skyfall:{live}:budget
PTTL skyfall:{live}:lease
```

Already-dispatched work may finish. Keep admission disabled and wait until `PTTL` returns `-2` (no active lease), then deliberately replenish:

```text
HSET skyfall:{live}:budget used 0 limit 100
HSET skyfall:{live}:budget enabled 1
```

Do not delete the consumed-ID set or active lease. Redeploying or rolling back never resets the allowance. The approved store contains only metadata; no game-facing administration UI is added.

## Verification and recovery

Before sharing: run build/typecheck/tests, verify the game and GLBs load over HTTPS, confirm the lab page/code is absent, and check that unauthenticated browser and API requests are protected. Test mock text/voice event generation, microphone permission in Chrome/Edge, collection/effects, streamed progress, and cancellation on reset/navigation. Live-mode health reports configured mode only; it does not probe providers or indicate remaining budget.

The test suite uses fake provider credentials and intercepted transports. To additionally run the atomic scripts against a temporary local Redis process, install Redis test binaries and set `REDIS_TEST_SERVER` and `REDIS_TEST_CLI` to their paths before `bun run test`. These tests start Redis on a private temporary Unix socket and stop it afterward; no cloud keys are needed.

Authorize one paid end-to-end test separately after the mock and access checks pass. Confirm the count increases once and repeated IDs do not run again. Review stage timings and safe error codes; do not log audio, provider keys, or raw provider errors.

To recover, disable Redis admission first, then roll back to a known-good deployment. Environment changes require a new deployment and do not update old deployments. For key rotation, save the replacement Secret, redeploy, and revoke the old key; keep Redis disabled until the new deployment is checked.

References: [Services](https://vercel.com/docs/services), [Fastify](https://vercel.com/docs/frameworks/backend/fastify), [deployment protection](https://vercel.com/docs/deployment-protection), [Secret variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables), [Upstash atomic scripts](https://upstash.com/blog/lua-scripting-on-upstash-redis-atomic-operations-over-http).
