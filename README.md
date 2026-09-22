# Auvra

Give AI a task and a budget. Auvra handles the execution.

Auvra is a local-first Phase 1 MVP for running bounded autonomous missions with explicit permissions, conservative spending controls, and an auditable execution ledger. Application inference is provided exclusively through the server-side Orbio gateway.

## Architecture

- `apps/web` — React, Vite, and Tailwind interface.
- `apps/api` — Express API, Orbio adapter, agent runner, safe tools, and JSON persistence.
- `packages/shared` — shared domain models, API contracts, and validation.

Mission state is stored in `data/missions.json` using serialized, atomic file replacements. The executor creates a plan, enters a bounded action/observation loop, checks budget before every provider request, enforces tool permissions on the server, and records provider-reported usage and cost. A mission fails conservatively if Orbio omits cost information.

## Setup

Requirements: Node.js 22+ and pnpm 10+.

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

The public landing page is at `http://localhost:5173/`. Select **Open Workspace** or navigate to `/app` for the dashboard. The web app proxies `/api` to the API at `http://localhost:4000`. Existing mission links from `/missions/:id` redirect to `/app/missions/:id`.

## Environment

See `.env.example`. `ORBIO_API_KEY` is required to execute missions and is never sent to the browser. The default gateway is `https://api.orbio.so/api/v1` and the default model is `google/gemini-3.8-flash`.

### If Orbio reports “No provider is currently serving this model”

This is an upstream model-routing response, not proof that Auvra sent a tool request. Planning makes a text-only request before any tools are supplied. Confirm the selected model against live gateway metadata **without paid inference**:

```bash
node --env-file=.env scripts/orbio-diagnostic.mjs
```

To deliberately make **one paid, bounded text request** using the same minimal Chat Completions request shape as Auvra:

```bash
node --env-file=.env scripts/orbio-diagnostic.mjs --probe
```

To separately test client-side tool-call compatibility (also one paid request):

```bash
node --env-file=.env scripts/orbio-diagnostic.mjs --tool-probe
```

Only run the paid probes when you choose to. If the model remains unavailable, set `ORBIO_MODEL` to an exact, currently supported model ID from the gateway or Orbio dashboard and restart `pnpm dev`. Do not treat Settings → Configured as a live inference check. The server does not silently switch inference providers.

## Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

No automated test performs live inference. To run the inexpensive, explicit provider smoke test, set `AUVRA_LIVE_TEST=true`, configure `ORBIO_API_KEY`, then run `pnpm --filter @auvra/api test:live`.

## Security and billing boundary

This release is single-user/local-only. It has no production authentication or tenant isolation and must not be exposed publicly without an access-control review. Tools are allowlisted and permission-gated; no shell, arbitrary filesystem, wallet, token-transfer, or unrestricted network tool is available.

Budgets are USD-denominated. Auvra records Orbio's provider-reported cost as actual spend and stores preflight reservations as estimates; it does not equate USD with Orbio CREDIT units. Because provider reporting is observed after a request completes, upstream billing delays, retries outside Auvra, or inaccurate/missing provider metadata prevent an absolute spending guarantee. Auvra refuses another call when the configured conservative reserve does not fit and stops if actual cost is absent.

Wallet connections, signing, transfers, automatic top-ups, and on-chain transaction claims are intentionally outside Phase 1.

## Submission UX / reliability adjustments

- Mission results are presented as full-width readable documents (headings, lists, tables, code blocks) with copy support; untrusted output is rendered as text, not HTML.
- The default mission window is 360 seconds and the per-provider request window is 90 seconds. Existing `.env` values override these defaults: update `AUVRA_MISSION_TIMEOUT_MS=360000` and `AUVRA_PROVIDER_TIMEOUT_MS=90000` if still using the older values, then restart the API.
- No local request-rate limiter is installed. A provider timeout is not evidence of an HTTP 429 rate limit. Provider quotas cannot be disabled by Auvra. Definitive unavailable-model responses can use an approved fallback; uncertain requests are not auto-retried because they may still be billed.
- A failed mission can be copied into a new draft, which requires explicit approval to run. Historic mission records are preserved.
- The current safe toolset only supports arithmetic, time, and notes: it does not browse or verify real-world business leads yet.
- The workspace remains local-only, without public user authentication. Do not expose the backend publicly until access control and credential isolation are implemented.

## Public web research (opt-in)

Research requests such as finding Lagos restaurants run an approved public search before paid planning inference and require the explicit `web.search` permission and a server-side `BRAVE_SEARCH_API_KEY` from Brave Search API. Orbio is still used for planning/execution inference; Brave supplies public search results. Search results are candidate sources, not proof that a restaurant has a specific checkout product. Auvra must cite links and mark uncertain attributes for verification. Mission budget and recorded spend cover Orbio inference only; external search API billing is separate. No credentials are stored in the browser. The current application remains single-user/local-only and must not be publicly deployed without authentication.
