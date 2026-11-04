# M5-HR3.2 — Vercel Deployment Readiness Plan

**Mode:** AUDIT + PLAN ONLY. No deployment, no Vercel linking, no env mutations, no `vercel.json`, no SQL, no worker ENABLE, no cron activation. **HR3.2b = production environment safety audit + docs only (no implementation).**
**As-of:** 2026-11-04 (updated with **HR3.2a** Preview hard-disable + **HR3.2b** Production environment safety audit)
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Baseline requested (HR3.2b):** `main` @ `3564e77`
**Prior plan baseline (HR3.2):** `main` @ `bcaae34` (still ancestor)
**Parents:** `docs/M5_HR3_VERCEL_PRODUCTION_RUNTIME_CONTRACT.md`, `docs/M5_HR2_HOSTED_READINESS_VERIFICATION.md`, `docs/M5_HR1_A_ORG_SCOPED_RECOMPUTE_CONTRACT.md`, `docs/M5_HR1_B_ORG_SCOPED_ROLLOVER_CONTRACT.md`
**Platform docs checked (this session):** Vercel Cron Jobs / Managing Cron Jobs; Vercel Environment Variables / Environments / Deployment Protection; Vercel Functions max duration (Fluid Compute); Supabase Auth Redirect URLs / Vercel preview guidance.
**Authority when docs conflict:** this plan for **first Vercel deployment readiness (workers OFF)** only. HR3 remains authority for cron/runtime architecture. HR1.a/b remain authority for org-scoped HTTP tick semantics. HR2 remains authority for hosted SQL readiness evidence. M5.5 formula authority unchanged.

---

## 0. Executive verdict

| Gate | Call |
|---|---|
| Repo HEAD matches HR3.2b baseline `3564e77` | **PASS** (includes HR3.1 + HR3.2a) |
| HR3.1 cron GET adapters present + default-OFF | **PASS** (code on HEAD) |
| Active `vercel.json` / in-repo cron schedules | **ABSENT** (required for this milestone) |
| Live Vercel project / Production env matrix verified | **UNKNOWN** (operator; no `.vercel/` in repo) |
| Code-level `VERCEL_ENV` Preview isolation for workers | **PRESENT** — exact `preview` hard-disable via `isMetricWorkerEnvEnabled` (§11 / §13) |
| First Production **web** deploy with workers **OFF**, no crons | **CONDITIONAL GO** after §5.1 / §13.6 operator gates |
| HR3.2a Preview ENABLE hard-disable | **IMPLEMENTED on HEAD** (`3564e77`); still prefer operator ENABLE unset on Preview |
| HR3.2b additional runtime guard before workers-OFF deploy | **NOT REQUIRED** (§13.5) |
| Worker ENABLE / canary drain / cron activation | **NO-GO** |
| E4 / M7.3 merchant success / AI / purchasing / payments | **NO-GO** |

**Overall readiness for a safe first Vercel deploy (app only, workers OFF):** **CONDITIONAL GO** (operator env/Auth gates; no new code slice).
**Overall readiness for production metric workers / cron:** **NO-GO** (architecture ready; activation not authorized; hosted env + HR2 §H still required).

---

## 1. Verified baseline (this session)

### 1.1 Git / tree — **VERIFIED** (HR3.2b re-verify)

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `3564e7730bc703c6121c8106aecc93645ee0f034` — `fix(metrics): disable metric workers in Vercel Preview` |
| HR3.2 plan ancestor | `bcaae34` (HR3.1 adapters) present |
| HR1.a / HR1.b | Present (`d196338` / `3bddeed` ancestors) |
| HR3 freeze docs | Present (`e224f2f`) |
| HR3.2a Preview guard | Present on HEAD (`3564e77`) |
| `vercel.json` | **Absent** (`git ls-files` / filesystem) |
| `.vercel/` | **Absent** |
| `.github/workflows` | **Absent** |
| Dirty tree | Preserved untouched except updates to **this** file |

**Pre-existing dirty / untracked (not modified by HR3.2b except this file):**

- Modified: `README.md`, `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`
- Deleted: `docs/StoreAgent_Roadmap_2026.docx`
- Untracked: `.vitest/`, `docs/COMPETITIVE_UX_MERCHANT_PAIN_POINT_ROADMAP.md`, `docs/M5_6E_2_HOSTED_CANARY_READINESS.md`, `docs/M5_HR2_HOSTED_READINESS_VERIFICATION.md`, `docs/M5_HR3_2_VERCEL_DEPLOYMENT_READINESS.md` (this file), `docs/StoreAgent_Updated_Roadmap.docx`, `docs/archive/`, `supabase/snippets/`

### 1.2 Stack facts — **VERIFIED**

| Layer | Evidence |
|---|---|
| Framework | Next.js `^16.4.0` App Router (`package.json`) |
| React | `^19.3.0` |
| Config | `next.config.ts` — `poweredByHeader: false`; no `trailingSlash`; no edge/cron/rewrites |
| Scripts | `dev` / `build` / `start` / `check` (`typecheck` + `lint` + `test` + `build`); **no** deploy script |
| Node engines | `"node": "22.x"` in `package.json` and root `package-lock.json` (`lockfileVersion: 3`) |
| Local Node | `v22.23.3`; `.nvmrc` = `22` |
| Lockfile | `package-lock.json` only (no yarn/pnpm lock) |
| Request proxy | Root `proxy.ts` → `refreshAuthSession` (`lib/supabase/proxy.ts`); publishable only; **no** root `middleware.ts` |
| Admin client | `lib/supabase/admin.ts` — `server-only`; `persistSession: false`; `autoRefreshToken: false` |
| Env schema | `lib/config/env.ts` — URL + publishable + service_role required for server |
| `VERCEL_ENV` / `NODE_ENV` in app runtime | **HR3.2a:** `VERCEL_ENV===preview` hard-disables metric worker ENABLE via `metric-worker-runtime-env.ts`. `NODE_ENV` still unused for isolation. |

### 1.3 Metric / cron surface on HEAD — **VERIFIED**

| Path | Method | Role |
|---|---|---|
| `/api/internal/metric-recompute` | POST | HR1.a ops/manual tick (`METRIC_*_WORKER_SECRET`) |
| `/api/internal/metric-rollover` | POST | HR1.b ops/manual enqueue |
| `/api/internal/cron/metric-recompute` | GET | HR3.1 Vercel Cron adapter (`CRON_SECRET`) |
| `/api/internal/cron/metric-rollover` | GET | HR3.1 Vercel Cron adapter (`CRON_SECRET`) |

Shared auth: `lib/persistence/metric-cron-auth.ts` — `CRON_SECRET` ≥32, timing-safe SHA-256 compare, ENABLE exact `"1"`, org from server env only.

Route envelope (POST + GET cron): `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 60`.

Worker budgets (`workers/aggregate-metrics.ts`): `tickBudgetMs=45_000`, `itemDeadlineMs=40_000`, `completionReserveMs=2_000`, `leaseSeconds=120`, defaults `maxActive=1` / `claimLimit=1`.

`.env.example`: all `METRIC_*_WORKER_ENABLED` empty; `CRON_SECRET=` documented empty.

Unit/architecture tests: `tests/unit/m5-hr3-cron-adapter.test.ts`, `tests/unit/m5-hr3-cron-adapter-architecture.test.ts`.

### 1.4 Explicit non-goals (this document)

- No Vercel project create/link, deploy, env write, or dashboard mutation
- No `vercel.json` / cron schedule creation
- No worker ENABLE, canary drain, E4, M7.3 activation, AI, purchasing, payments
- No SQL / migrations / hosted writes
- No code, test, dependency, or config changes beyond this markdown deliverable
- No Git commit/push

---

## 2. Evidence matrix (twelve verification topics)

Legend: **V** = verified in repo this session · **P** = platform docs · **A** = assumption · **U** = unknown (operator)

### 2.1 Next.js / Node compatibility with Vercel — **COMPATIBLE (V+P)**

| Claim | Status | Evidence |
|---|---|---|
| App Router Node route handlers fit Vercel Functions | **V** | Metric + cron routes export `runtime = "nodejs"` |
| Edge runtime must not host metric ticks | **V** (contract) | Needs `server-only`, crypto, service_role, ≤60s I/O |
| Next 16 is first-class on Vercel | **P+A** | Official Next.js on Vercel; deploy artifact = `npm run build` |
| `maxDuration = 60` fits Fluid defaults | **P** | Fluid Compute default/max Hobby/Pro ≥ 300s (as of current Vercel Functions limits docs) |

**Verdict:** Fit for web/API + bounded HTTP ticks. Not a fit for always-on daemons (already designed as lease-fenced ticks).

### 2.2 Node version and lockfile consistency — **PASS (V)**

| Check | Result |
|---|---|
| `engines.node` | `22.x` |
| Lockfile engines | Matches `22.x` |
| `.nvmrc` | `22` |
| Package manager | npm (`package-lock.json` v3) |
| Conflicting lockfiles | None |

**Operator note:** Pin Vercel project Node to **22.x** (dashboard or `package.json` engines — already declared). Do not introduce a second lockfile.

### 2.3 Production / Preview / Development separation — **REQUIRED; LIVE STATE UNKNOWN (U)**

Vercel scopes env vars independently to Production, Preview, and Development ([Environment variables](https://vercel.com/docs/environment-variables)).

| Environment | Intended Supabase | Workers / cron | Auth |
|---|---|---|---|
| Local macOS (`.env.local`) | Local `127.0.0.1` (HR2 observed historically) | ENABLE off | localhost |
| Vercel Development (`vercel env pull`) | Prefer local or non-prod | ENABLE unset | localhost |
| Vercel Preview | Prefer **non-prod** Supabase project **or** publishable-only if unavoidable; never ENABLE=1 | ENABLE **must** unset; crons do not run on Preview (**P**) | Preview URL allowlist + Deployment Protection |
| Vercel Production | Hosted project (historical ref `qlsqminsfdntpqdkhxjx`) | ENABLE only after separate approval; **no** `vercel.json` crons in first deploy | Production Site URL + exact callback |

**Critical isolation rules (HR3.2a-refined):**

1. Prefer a dedicated Preview Supabase project (or Supabase preview branches) before sharing Production credentials with Preview.
2. Until then: set `SUPABASE_SERVICE_ROLE_KEY` **Production-only**; leave it unset on Preview for workers-OFF web (merchant UI uses publishable only).
3. Never set `METRIC_*_WORKER_ENABLED=1` or org/worker secrets on Preview.
4. **App-route evidence (HEAD):** under `app/`, `createSupabaseAdminClient()` is imported **only** by the four internal metric/cron routes, and those construct the admin client **after** ENABLE/auth gates. With ENABLE≠`1`, those routes return 404/401 **before** admin construction — so Preview+prod service_role does **not** currently mutate via those routes while workers stay OFF. Lib modules still *default* to admin if invoked later; keep service_role off Preview anyway.
5. Preview pointing publishable URL/key at Production still allows normal password auth against prod from Preview URLs — mitigate with Deployment Protection and/or a non-prod Supabase project.

### 2.4 Supabase URL / keys / service-role handling — **CODE PASS; LIVE UNKNOWN**

| Variable | Public? | Code rule |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Required URL (`lib/config/env.ts`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | **No** | Server-only; never `NEXT_PUBLIC_*` (architecture tests + `docs/SERVICE_ROLE_BOUNDARY.md`) |

| Client | Keys used | Evidence |
|---|---|---|
| Browser | Publishable only | `lib/supabase/browser.ts` + `tests/unit/supabase-client-architecture.test.ts` |
| Server session | Publishable only | `lib/supabase/server.ts`, `lib/supabase/proxy.ts` |
| Admin | Service role | `lib/supabase/admin.ts` (`server-only`) |

Admin client: no session persistence — correct for serverless (**V**).

**Startup / missing-secret behavior (V):** no boot-time env hard-fail. `readPublicEnvironment` / `readServerEnvironment` throw (Zod) when a client is constructed with missing/invalid values — request-time 500, not process crash at import. Worker ENABLE off does **not** require worker secrets or service_role. ENABLE=1 with short/missing worker secret → 503 `worker_not_configured` (POST). Cron missing/short `CRON_SECRET` → 401 before any DB work.

**U:** Whether any live Vercel project already holds these values; whether Preview shares Production service_role.

### 2.4a `VERCEL_ENV` / `NODE_ENV` handling — **CLOSED for Preview workers (V); residual for non-preview (V)**

| Signal | App usage on HEAD (`3564e77`) |
|---|---|
| `VERCEL_ENV` (`production` / `preview` / `development`) | Exact `"preview"` → `isMetricWorkerEnvEnabled` forces `enabled: false` in both worker config readers |
| `NODE_ENV` | Not used for worker/tenant isolation (test-only incidental) |

**Implication (post-HR3.2a):** Preview ENABLE=1 is hard-blocked in code. Missing/unknown/`development`/`production` `VERCEL_ENV` still honor ENABLE=`1` (preserves local). Operator ENABLE scoping remains required for Production and non-Preview. See §11 + §13.

### 2.5 Preview workers vs production Supabase — **FAIL-CLOSED IN CODE; OPS DISCIPLINE REQUIRED**

| Control | Repo default | Preview rule |
|---|---|---|
| `METRIC_*_WORKER_ENABLED` | empty / not `"1"` → 404 | **Must remain unset** |
| Org IDs / worker secrets | empty | **Must remain unset** on Preview |
| `CRON_SECRET` | empty | Optional; adapters still 404 when ENABLE≠1 |
| Vercel Cron | no `vercel.json` | Platform invokes crons on **Production only** (**P**) |

Platform does **not** schedule Preview crons ([Cron Jobs](https://vercel.com/docs/cron-jobs); troubleshooting: production deployments only). Code still must keep ENABLE off on Preview so manual GETs cannot tick production.

### 2.6 CRON_SECRET, worker secrets, ENABLE, org scope — **IMPLEMENTED FAIL-CLOSED (V)**

Frozen decision table (HR3 §2.4) is implemented in `metric-cron-auth.ts` + cron routes:

| Order | Condition | Status | Queue ops |
|---|---|---|---|
| 1 | `CRON_SECRET` missing/short (&lt;32) | 401 `cron_not_configured` | none |
| 2 | Bearer mismatch | 401 `unauthorized` | none |
| 3 | ENABLE ≠ `"1"` | 404 `not_found` | none |
| 4 | ENABLE=1, org missing/invalid | 503 `organization_scope_required` | none |
| 5 | ENABLE=1 + org UUID | 200 / 500 | org-scoped only |

POST routes keep separate `METRIC_*_WORKER_SECRET` gates (HR1.a/b). Cron adapters **do not** require worker secrets and **must not** HTTP-loopback to POST (**V** architecture tests).

Org is never taken from query/body/headers (**V**).

### 2.7 Serverless duration, retries, lease fencing — **ALIGNED (V+P)**

| Knob | Value | Implication |
|---|---|---|
| Route `maxDuration` | 60s | Within Fluid default 300s |
| Tick budget | 45s | ~15s margin under 60s |
| Item + reserve | 42s | Validator requires &lt; lease (120s) |
| Lease | 120s | Outlives one killed invocation; recover on later tick |
| Vercel Cron retries | Platform does not retry failed cron invocations as an app-level queue | Durable retry lives in Postgres (`retry_wait`); next schedule or manual POST is transport |
| Concurrency | default 1 | F2 containment |

**Invariant:** Platform kill mid-tick is safe if leases expire and a later correctly scoped tick recovers. Do not raise `tickBudgetMs` without raising `maxDuration`.

### 2.8 Auth callback URLs, domains, redirects — **PARTIAL (V); OPS REQUIRED (U)**

| Fact | Evidence |
|---|---|
| Callback route | `app/auth/callback/route.ts` — `exchangeCodeForSession`; provisioning; safe `next` via `safeAuthNextPath` |
| Redirect safety | Same-origin path only (`lib/auth/redirect.ts`) |
| Primary UI auth | Password sign-in (`components/auth/sign-in-form.tsx`) — no OAuth/magic-link UI in current product surface |
| `NEXT_PUBLIC_SITE_URL` | **Not** in `.env.example` |
| Supabase Site URL / Redirect allowlist | **Operator** on hosted Auth settings |

**Operator requirements before Production merchant login is claimed working:**

1. Supabase Auth **Site URL** = production origin (not `http://localhost:3000`).
2. Redirect allowlist includes exact Production callback, e.g. `https://<prod-domain>/auth/callback` (and `/**` only if intentionally broad).
3. For Preview auth testing: add Vercel wildcard per [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) — `https://*-<team-or-account-slug>.vercel.app/**` — and prefer Deployment Protection; do not set Production `NEXT_PUBLIC_SITE_URL` on Preview if introduced later.
4. Keep local `http://localhost:3000/**` for macOS dev.

Password-only first deploy may work with Site URL updated even before OAuth; still update Site URL so email templates / future code paths do not bounce to localhost.

### 2.9 Preview Deployment Protection — **RECOMMENDED (P); LIVE UNKNOWN (U)**

Use Vercel **Deployment Protection** (Standard Protection: protect non-production URLs) so Preview hosts are not anonymously browsable ([Deployment Protection](https://vercel.com/docs/deployment-protection)).

This does **not** replace ENABLE-off or service_role scoping; it reduces accidental exposure of Preview builds that may share identity providers or debug surfaces.

### 2.10 Logging, error reporting, secret redaction — **PARTIAL (V)**

| Layer | State |
|---|---|
| Shared observability redact | `lib/observability/redact.ts` — redacts bearer/JWT/sensitive keys |
| Auth failures | `logServerFailure` path on callback |
| Metric cron/POST | Counts-only `console.info` JSON; architecture tests forbid logging `CRON_SECRET` |
| Central error product (Sentry etc.) | **Not** wired as a required production dependency for workers; `docs/BACKGROUND_JOBS.md` mentions Sentry as non-current |

**Requirements for first deploy:**

1. Rely on Vercel Function logs + existing redaction helpers for server failures.
2. Never paste secrets, claim tokens, or service_role into tickets/docs.
3. Treat addition of a hosted error product as a **separate** observability slice (not blocking workers-OFF web deploy).

### 2.11 Build, smoke tests, rollback — **DEFINED BELOW (plan)**

Local gate: `npm run check` on the release commit (**V** script exists).
Live Vercel build/smoke: **U** until first deploy attempt under a separate approval.

### 2.12 M7 migrations and dependencies — **LOCAL PRESENT; HOSTED PENDING/UNKNOWN**

| Version | Local | Hosted (this session) |
|---|---|---|
| M5 queue stack through `20261028220000` | Present | Historical claims exist; **HR2 this-session SELECT not performed** |
| M6 through `20261030200000` | Present | PROJECT_HANDOFF / IMPLEMENTATION_STATUS claim hosted closed |
| M7.2b `20261031100000` | Present | **Unknown / pending** (PRA + HR3) |
| M7.3b `20261031120000` | Present | **Unknown / pending** |
| M7.3c `20261031130000` | Present | **Unknown / pending** |

**Dependency on first workers-OFF web deploy:** **None.** M7 hosted apply is **not** a P0 for serving the Next.js app with metric workers disabled.
**Dependency on M7 merchant approval success / production decisions:** still **NO-GO** (separate track).

### 2.13 No active cron; workers default OFF — **PASS (V)**

| Check | Result |
|---|---|
| `vercel.json` | Absent |
| `.env.example` ENABLE | Empty |
| Config parse | ENABLE requires exact `"1"` |
| Cron adapters | Present but inert without secret + ENABLE + org |
| Live Vercel schedules | **U** — no project linked in repo; assume none until operator confirms |

---

## 3. Vercel environment matrix (names only — no values)

### 3.1 Always required for a working app build/runtime

| Variable | Production | Preview | Development / local | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Hosted project URL | Non-prod URL preferred | Local URL | Never `127.0.0.1` on Vercel Production |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Prod publishable | Matching Preview project | Local publishable | Browser-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | Prod server-only | Prefer unset **or** non-prod key only | Local service_role | **Never** `NEXT_PUBLIC_*`; prefer Production-only until Preview DB exists |

### 3.2 Metric workers / cron (default OFF everywhere for first deploy)

| Variable | Production (first deploy) | Preview | Notes |
|---|---|---|---|
| `METRIC_RECOMPUTE_WORKER_ENABLED` | **unset** | **unset** | Exact `"1"` only after later approval |
| `METRIC_RECOMPUTE_WORKER_SECRET` | unset (or set only if manual POST ops planned later) | **unset** | ≥32 when used |
| `METRIC_RECOMPUTE_ORGANIZATION_ID` | **unset** | **unset** | Canary UUID only with ENABLE |
| `METRIC_RECOMPUTE_MAX_ACTIVE` | omit | unset | Default 1 |
| `METRIC_RECOMPUTE_CLAIM_LIMIT` | omit | unset | Default 1 |
| `METRIC_ROLLOVER_WORKER_ENABLED` | **unset** | **unset** | |
| `METRIC_ROLLOVER_WORKER_SECRET` | unset | **unset** | |
| `METRIC_ROLLOVER_ORGANIZATION_ID` | **unset** | **unset** | Never copy from recompute org env implicitly |
| `CRON_SECRET` | **unset** for first deploy (no crons) | unset / ignore | ≥32 when HR3.4 activates; Vercel injects `Authorization: Bearer …` |

### 3.3 Optional / future (do not invent values here)

| Variable | Guidance |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | If introduced: **Production only** = canonical origin; omit on Preview |
| System `VERCEL_ENV` / `VERCEL_URL` | Provided by Vercel when system env access enabled |

### 3.4 Isolation rules (non-negotiable)

1. **Preview ENABLE forbidden** while pointing at Production Supabase.
2. **Worker secrets / org IDs:** Production scope only until a dedicated staging project exists.
3. **Service role:** treat as production-grade secret; minimize Preview exposure.
4. **Crons:** absent from repo until HR3.4; even after add, platform targets Production only — still keep Preview ENABLE off.
5. **No tenant selectors** in HTTP input on internal/cron routes.

---

## 4. Safe first-deployment plan (workers OFF)

Goal: ship the Next.js app to Vercel Production without metric workers, without cron schedules, without disrupting local macOS + local Supabase development.

### 4.1 Preconditions

1. Release commit ≥ `bcaae34` (HR1.a + HR1.b + HR3.1).
2. `npm run check` green on that commit.
3. Local `.env.local` remains local-only; do not overwrite with Production secrets casually.
4. Operator has access to Vercel + hosted Supabase consoles (outside this audit).
5. HR2 §H SQL pack is **not** required for workers-OFF web deploy, but **is** required before any later ENABLE.

### 4.2 Create project (future ops — not this session)

1. Create Vercel project linked to this Git repo; Production branch = `main`.
2. Set Node.js version **22.x**.
3. Do **not** add `vercel.json`.
4. Enable Deployment Protection for Preview (recommended).
5. Configure env per §3 (Production Supabase trio; Preview without worker vars; prefer separate Preview DB).

### 4.3 Supabase Auth console (future ops)

1. Set Site URL to Production origin.
2. Add Production `/auth/callback` (exact) to Redirect URLs.
3. Keep localhost allowlist for local dev.
4. Add Preview wildcard only if Preview auth is required.

### 4.4 Deploy sequence

1. Deploy Production from `main` (Git integration or `vercel --prod` under separate approval).
2. Confirm build uses `next build` / install from `package-lock.json`.
3. **Do not** set any `METRIC_*_WORKER_ENABLED=1`.
4. **Do not** set `CRON_SECRET` unless needed for unrelated platform reasons; adapters remain 404 when ENABLE off even if secret exists.
5. Smoke §5.
6. Leave Preview ENABLE unset on all subsequent PR deploys.

### 4.5 What stays local / unchanged

- macOS `npm run dev` + local Supabase continue as primary engineering loop.
- No requirement to run workers on Vercel.
- No migration apply as part of first deploy.
- Dirty local docs/files remain operator-owned.

---

## 5. Operator checks and acceptance gates

### 5.1 Before first Production deploy

| # | Gate | Pass criteria |
|---|---|---|
| G1 | Commit | Deployed SHA ≥ `bcaae34` |
| G2 | `npm run check` | Green on release commit |
| G3 | No crons | Repo still has **no** `vercel.json` |
| G4 | Env matrix | Production: Supabase URL/publishable/service_role set; all worker ENABLE unset; Preview ENABLE unset |
| G5 | Node | Project Node 22.x |
| G6 | Auth | Site URL + redirect allowlist updated for Production domain |
| G7 | Protection | Preview Deployment Protection enabled (recommended) |
| G8 | Secrets hygiene | No service_role in `NEXT_PUBLIC_*`; values not pasted into chat/docs |

### 5.2 Smoke tests (post-deploy, workers OFF)

Perform against Production URL only with care; do not enable workers.

| # | Request | Expect |
|---|---|---|
| S1 | `GET /` (or sign-in page) | 200 HTML |
| S2 | Password sign-in with a known test user (if available) | Session + redirect to safe internal path |
| S3 | `POST /api/internal/metric-recompute` (no/forged auth) | **404** `not_found` when ENABLE off |
| S4 | `POST /api/internal/metric-rollover` | **404** when ENABLE off |
| S5 | `GET /api/internal/cron/metric-recompute` without Bearer | **401** `cron_not_configured` or `unauthorized` |
| S6 | `GET /api/internal/cron/metric-rollover` without Bearer | **401** |
| S7 | Vercel dashboard | No Cron Jobs configured |
| S8 | Env audit | ENABLE unset on Production + Preview |

Record status codes + request IDs only — never secrets.

### 5.3 Explicit non-acceptance (still NO-GO)

- Any `METRIC_*_WORKER_ENABLED=1`
- Any `vercel.json` crons
- Draining E.4 leftover dirty=2 canary grain
- Claiming hosted M7 applied without SELECT evidence
- Merchant production decision / M7.3 approval success / AI / purchasing

---

## 6. Rollback procedure

| Scenario | Action | Effect |
|---|---|---|
| Bad web deploy | Instant Rollback / redeploy previous Production deployment in Vercel | Restores prior build; local dev unaffected |
| Suspected worker misconfig | Unset `METRIC_*_WORKER_ENABLED` (or set ≠ `1`) on Production; redeploy if env cache requires | Gates return 404; zero queue RPCs |
| Cron ever added later | Remove `crons` from `vercel.json` (or delete schedules) **and** unset ENABLE; unset `CRON_SECRET` for belt-and-suspenders | Stops schedule + fails closed GET auth |
| Wrong Supabase project on Preview | Remove Preview service_role / point Preview to non-prod; protect previews | Stops Preview admin mutation of prod |
| Schema issue | **Not** rolled back via Vercel; SQL rollbacks are separate and generally avoided | App rollback ≠ DB rollback |

**Kill-switch priority:** ENABLE off → remove cron → redeploy prior app → rotate secrets if exposure suspected.

---

## 7. Minimal future implementation slices (separately approved)

| Slice | Intent | In | Out |
|---|---|---|---|
| **HR3.2a** | Local safety before Preview risk | Preview hard-disable of metric worker ENABLE when `VERCEL_ENV=preview` + tests (§11) | Deploy, ENABLE on Production, cron, SQL |
| **HR3.2 ops** | First Vercel Production deploy, workers OFF | Project link, env matrix, Auth URLs, Deployment Protection, smoke §5 | `vercel.json`, ENABLE, SQL, canary |
| **HR3.3** | Manual canary ENABLE without cron | Production ENABLE=1 + org UUID + worker secrets; manual POST only | Cron file, multi-tenant drain, E4 leftover drain without runbook |
| **HR3.4** | Activate cron last | First `vercel.json` crons → GET adapters only; `CRON_SECRET` ≥32 Production | Preview ENABLE, Edge runtime, HTTP-to-POST |
| **Preview DB isolation** | Hard Preview≠Prod data | Separate Supabase project or preview branches integration | Sharing Production service_role on Preview |
| **Observability product** | Optional Sentry/equivalent | Redaction-preserving server integration | Changing tick semantics |
| **M7 hosted apply** | Separate schema track | Operator migrations `202610311*` when approved | Bundling into first web deploy |
| **HR2 §H** | Re-verify hosted M5 RPC signatures | SELECT-only pack | Mutating RPCs / ENABLE |

Each slice needs its own explicit approval. This document authorizes **none** of the execution steps.

---

## 8. Risks and blockers

### 8.1 P0 — block unsafe deploy / activation

| ID | Blocker | Applies to |
|---|---|---|
| HR32-P0-1 | **No live Vercel project/env matrix verified** in repo (no `.vercel/`, operator-unknown) | First deploy until G4–G8 completed |
| HR32-P0-2 | **Preview ENABLE=1 while Preview shares Production Supabase** (URL ± service_role) | Preview deploys; **HR3.2a** hard-blocks exact `VERCEL_ENV=preview`; still keep ENABLE unset + prefer non-prod DB |
| HR32-P0-3 | **Worker ENABLE or cron activation before HR1/HR3 gates + org scope** | Worker/cron slices (not workers-OFF web) |
| HR32-P0-4 | **Hosted M5 RPC / live ENABLE state not re-verified** (HR2-P0) | Any future ENABLE / canary — not workers-OFF web |
| HR32-P0-5 | **Auth Site URL still localhost** on hosted Supabase | Production login/email correctness |

### 8.2 P1 — high priority before trusting Production

| ID | Risk | Mitigation |
|---|---|---|
| HR32-P1-1 | Doc drift (dirty `SERVICE_ROLE_BOUNDARY.md` still claims hosted E.3 undeployed in places) | Prefer HR2/HR3/E.3 decision docs + code over stale prose |
| HR32-P1-2 | E.4 leftover dirty=2 grain | Do not drain without runbook |
| HR32-P1-3 | Global active-lease ceiling couples canary to foreign leases | Ops awareness (E.3) |
| HR32-P1-4 | M7.2/M7.3 hosted apply unknown | Separate track; do not block workers-OFF web |
| HR32-P1-5 | No centralized error product | Vercel logs + redact; optional later slice |
| HR32-P1-6 | `NEXT_PUBLIC_SITE_URL` not standardized | Add only with Production-only scoping when OAuth/email links need it |
| HR32-P1-7 | PRA-1 P0-3 text is **stale vs HEAD** (global null HTTP) | Superseded by HR1.a/b on `bcaae34+`; do not re-open as code gap |
| HR32-P1-8 | Preview publishable credentials aimed at Production (auth against prod from Preview URLs) | Deployment Protection + prefer non-prod Supabase; not fixed by worker gates |
| HR32-P1-9 | Production `SUPABASE_SERVICE_ROLE_KEY` also set on Preview “for convenience” | Keep service_role Production-scoped; workers-OFF app routes currently avoid admin until ENABLE, but lib defaults remain a footgun |
| HR32-P1-10 | Missing/unknown `VERCEL_ENV` is **not** verified Production (guard only equality-blocks `preview`) | Documented in `metric-worker-runtime-env.ts` + unit test; keep operator ENABLE scoping |

### 8.3 Assumptions vs unknowns

| Item | Class |
|---|---|
| Fluid Compute enabled by default on new Vercel projects | **A** (current platform default per docs) |
| Hosted project ref `qlsqminsfdntpqdkhxjx` remains production Supabase | **A** (historical docs) |
| No existing Vercel crons outside repo | **U** (operator dashboard) |
| Live Production/Preview env values | **U** |
| Hosted M5/M7 migration rows | **U** (HR2 §H / M7 SELECT) |

---

## 9. GO / NO-GO

| Action | Decision |
|---|---|
| Accept this document as HR3.2 readiness plan (docs only) | **GO** |
| Implement **HR3.2a** Preview ENABLE hard-disable (§11) | **DONE** on HEAD `3564e77` |
| **HR3.2b** additional Production runtime guard / code slice | **NO-GO / NOT REQUIRED** (§13.5) |
| Execute first Vercel Production deploy with workers **OFF**, no `vercel.json` | **CONDITIONAL GO** after §5.1 / §13.6 operator gates |
| Set Preview ENABLE or Production ENABLE | **NO-GO** |
| Add active crons / create `vercel.json` | **NO-GO** (until HR3.4) |
| Hosted SQL mutate / M7.3 merchant success / AI / purchasing | **NO-GO** |
| Disrupt local macOS + local Supabase workflow | **NO-GO** |

**Production worker runtime overall:** **NO-GO**.
**First workers-OFF web hosting:** **CONDITIONAL GO** (operator gates only; no new code).
**HR3.2a implementation:** **DONE** on HEAD.
**HR3.2b audit:** **COMPLETE** (docs only) — see §13.

---

## 10. Ownership map — code vs Vercel vs Supabase

| Safety check | Belongs in | Notes |
|---|---|---|
| Node 22 / lockfile / `next build` | **Code + Vercel** | `package.json` `engines`; pin Node 22.x in project |
| `NEXT_PUBLIC_SUPABASE_*` per environment | **Vercel env** | Build-time inlining for public vars |
| `SUPABASE_SERVICE_ROLE_KEY` Production-only | **Vercel env** | Prefer unset on Preview for workers-OFF |
| `METRIC_*_WORKER_ENABLED` unset | **Vercel env** (primary) + **Code** gates | Exact `"1"` required; default empty in `.env.example` |
| Preview cannot ENABLE workers | **Code (HR3.2a on HEAD)** + **Vercel env** | `VERCEL_ENV=preview` hard-disable + operator ENABLE unset |
| `CRON_SECRET` / no `vercel.json` | **Vercel** (secret later) + **repo absence** | No schedule until HR3.4 |
| Deployment Protection on Preview | **Vercel settings** | Standard Protection recommended |
| Auth Site URL + redirect allowlist | **Supabase Auth settings** | Not expressible in app env alone |
| Same-origin post-auth `next` path | **Code** | `safeAuthNextPath` / sign-in form |
| Service-role not in browser bundle | **Code** | `server-only` admin + architecture tests |
| Hosted RPC signature readiness | **Supabase / operator SQL** | HR2 §H — not a workers-OFF web P0 |
| Worker tick budgets / leases | **Code** | Already aligned with `maxDuration=60` |

---

## 11. HR3.2a — Deployment safety preflight (audit)

### 11.1 Verified findings (file evidence)

| # | Check | Finding | Evidence |
|---|---|---|---|
| 1 | Prod vs Preview Supabase isolation | **Operator-only today.** No `VERCEL_ENV` branching in worker config. | Repo-wide grep: no app `VERCEL_ENV` reads |
| 2 | Service-role exposure | **Not client-exposed.** Browser/server/proxy use publishable; admin is `server-only`. Under `app/`, admin only on four metric/cron routes **after** gates. | `lib/supabase/{browser,server,admin,proxy}.ts`; `app/api/internal/**`; `tests/unit/supabase-client-architecture.test.ts` |
| 3 | `VERCEL_ENV` / `NODE_ENV` | **Unused** for isolation | Grep; proxy uses public env only |
| 4 | Auth Site URL / OAuth | Password UI primary; `/auth/callback` exists for code exchange; no OAuth/magic-link UI; Site URL is **Supabase console** work; `NEXT_PUBLIC_SITE_URL` absent | `components/auth/sign-in-form.tsx`; `app/auth/callback/route.ts`; `.env.example` |
| 5 | Workers / cron default-OFF | **PASS.** ENABLE exact `"1"`; empty `.env.example`; no `vercel.json`; cron 401/404 before admin | `.env.example`; HR1/HR3 gates; cron routes |
| 6 | Missing/invalid secrets | Request-time fail-closed; ENABLE off needs no secrets; short cron secret → 401; ENABLE=1 + bad worker secret → 503 | `lib/config/env.ts`; gate helpers |
| 7 | Node 22 / lockfile / build | **PASS.** `engines.node=22.x`, lockfile v3, `.nvmrc=22`, `npm run check` includes build | `package.json`, `package-lock.json` |
| 8 | Preview Deployment Protection | **Vercel setting** (recommended); not in repo | Platform docs; no `.vercel/` |
| 9 | Workers-OFF web prerequisites | Env matrix + Auth Site URL + Node 22 + no crons + smoke 404/401; HR3.2a recommended if Preview shares prod URL | §4–§5 |
| 10 | Ownership | See §10 | — |

### 11.2 HR3.2a code/test slice — **IMPLEMENTED** (local safety; not deploy)

**Goal:** Defense-in-depth so Preview cannot run metric workers even if an operator mistakenly sets ENABLE=1.

**Shipped paths:**

| Path | Change |
|---|---|
| `lib/persistence/metric-worker-runtime-env.ts` | Shared `isVercelPreviewRuntime` / `isMetricWorkerEnvEnabled` |
| `lib/persistence/metric-recompute-queue.ts` / `metric-rollover.ts` | Config readers force `enabled: false` when `VERCEL_ENV === "preview"` |
| `tests/unit/m5-hr3-2a-preview-worker-guard*.test.ts` | Unit + architecture: Preview ENABLE=1 → 404; forged headers ignored; local/Production preserved; missing/unknown `VERCEL_ENV` limitation locked |

**Required behaviors (met):**

1. `VERCEL_ENV=preview` → both configs `enabled: false` even if ENABLE=`1`.
2. POST and cron GET inherit via config readers → 404, zero RPCs / no admin client.
3. `VERCEL_ENV=production` or unset (local): existing HR1/HR3 ENABLE semantics unchanged.
4. No URL / `NODE_ENV` / header heuristics.
5. No `vercel.json`, deploy, or ENABLE activation.

**Limitation (documented + tested):** missing, empty, or unknown `VERCEL_ENV` is **not** a verified-Production attestation. Only exact `preview` is hard-blocked; non-preview values (including unset) still honor ENABLE=`1`. Rely on Vercel injecting `VERCEL_ENV=preview` on Preview plus operator ENABLE scoping.

**Out (unchanged):** Vercel linking, env mutations, SQL, cron, Production ENABLE, Edge runtime, auth Site URL automation, service_role Preview heuristics.

### 11.3 Operator-only configuration steps (no code)

1. Create/link Vercel project; Production branch `main`; Node **22.x**.
2. Production env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; leave all `METRIC_*_WORKER_ENABLED` / org / worker secrets / `CRON_SECRET` **unset**.
3. Preview env: publishable pair (prefer non-prod project); **omit** service_role and all worker/cron vars.
4. Enable Preview **Deployment Protection** (Standard Protection).
5. Supabase Auth: Site URL = Production origin; add exact `/auth/callback`; keep `http://localhost:3000/**` for local; add Preview wildcard only if Preview auth is required.
6. Confirm dashboard has **no** Cron Jobs; do not add `vercel.json`.
7. After deploy: smoke §5.2 (404/401 on internal/cron; no ENABLE).

### 11.4 Prerequisites for future workers-OFF web deployment

| # | Prerequisite | Owner |
|---|---|---|
| 1 | Commit ≥ `bcaae34` (+ HR3.2a if Preview shares prod URL) | Eng |
| 2 | `npm run check` green | Eng |
| 3 | No `vercel.json` | Eng / repo |
| 4 | Env matrix §3 applied | Operator (Vercel) |
| 5 | Auth Site URL + redirects | Operator (Supabase) |
| 6 | Preview Deployment Protection | Operator (Vercel) |
| 7 | Smoke §5.2 recorded (no secrets) | Operator |
| 8 | HR2 §H / ENABLE | **Not required** for workers-OFF web |

---

## 12. Freeze checklist

- [x] HEAD baseline `3564e77` (includes `bcaae34` + HR3.2a); dirty tree preserved aside from this doc
- [x] Ten safety checks evidenced; ownership mapped (code / Vercel / Supabase)
- [x] HR3.2a Preview hard-disable implemented + tested on HEAD
- [x] Missing/unknown `VERCEL_ENV` ≠ verified Production limitation documented
- [x] HR3.2b Production environment safety audit documented (§13)
- [ ] Vercel project wiring / deploy / ENABLE / cron — **not authorized**
- [ ] HR3.2b additional runtime-guard implementation — **not required / not authorized**

**STOP.** No deployment or worker activation under this approval.

---

## 13. HR3.2b — Production Environment Safety Audit

**Mode:** AUDIT + DOCUMENTATION ONLY. No source, test, dependency, SQL, migration, config, `vercel.json`, Vercel linking, env mutation, worker ENABLE, cron, canary, E4, M7.3, AI, or purchasing changes.
**As-of:** 2026-11-04
**Baseline:** `main` @ `3564e7730bc703c6121c8106aecc93645ee0f034` — `fix(metrics): disable metric workers in Vercel Preview`
**Parents:** §0–§12 of this document; `docs/M5_HR3_VERCEL_PRODUCTION_RUNTIME_CONTRACT.md`; HR1.a/b contracts; HR3.2a (`metric-worker-runtime-env.ts`).
**Dirty-tree rule:** Only this markdown file updated; all unrelated dirty/untracked files preserved.

### 13.0 Verdict (HR3.2b)

| Question | Answer |
|---|---|
| Confirmed client-bundle secret exposure? | **No** (VERIFIED) |
| Confirmed ungated admin HTTP surface under `app/`? | **No** — only four metric/cron routes, admin **after** gates (VERIFIED) |
| Workers default-OFF + Preview hard-disable on all four routes? | **Yes** (VERIFIED) |
| Additional runtime guard required before workers-OFF Vercel deploy? | **NO** |
| Smallest code/test slice for workers-OFF safety? | **None required** (operator gates only) |
| Workers-OFF Production web deploy | **CONDITIONAL GO** after §13.6 |
| Production ENABLE / cron / canary | **NO-GO** |

### 13.1 Evidence matrix (twelve audit topics)

Legend: **VERIFIED** = confirmed in repo this session · **PARTIAL** = code present but live/ops incomplete · **UNKNOWN** = operator / not observable from repo.

#### 1) Server-only secrets vs client-bundle exposure — **VERIFIED (no exploitable leak found)**

| Secret family | Public? | Evidence | Class |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | No | `lib/config/env.ts` server schema only; `lib/supabase/admin.ts` `server-only`; browser/server/proxy use publishable | Code PASS |
| `METRIC_*_WORKER_SECRET` | No | Server config readers + HTTP gates; absent from `.tsx` / browser | Code PASS |
| `CRON_SECRET` | No | `metric-cron-auth.ts` `server-only`; ≥32; timing-safe SHA-256 | Code PASS |
| API keys / AI / payments secrets | N/A for this surface | No worker/auth path reads such keys on HEAD for metric routes | Out of scope / unused |

| Check | Result | Status |
|---|---|---|
| No `NEXT_PUBLIC_*` wrapping of service_role / worker / cron secrets | `.env.example` + architecture tests (`supabase-client-architecture`, `service-role-policy`, `cross-org-threats`) | **VERIFIED** |
| No `.tsx` / client components reference server secrets | Repo grep across `*.tsx` / `*.jsx` | **VERIFIED** |
| Live Vercel env values / leakage history | No `.vercel/` in repo | **UNKNOWN** (operator) |

**Exploitable defect:** none confirmed.
**Operator misconfig risk:** pasting secrets into chat/docs/tickets; assigning secrets to wrong Vercel environment scope.

#### 2) Supabase browser / server / admin separation + tenant boundaries — **VERIFIED (HTTP); PARTIAL (lib defaults)**

| Client | Keys | Session | Evidence |
|---|---|---|---|
| Browser | Publishable | Cookie/session via SSR browser client | `lib/supabase/browser.ts` `"use client"` |
| Server / proxy | Publishable | Cookie refresh only; **no** org/store auth in proxy | `lib/supabase/server.ts`, `lib/supabase/proxy.ts`, root `proxy.ts` |
| Admin | Service role | `persistSession: false`, `autoRefreshToken: false` | `lib/supabase/admin.ts` |

| Surface | Admin usage | Status |
|---|---|---|
| `app/` route handlers | **Only** the four internal metric/cron routes; `createSupabaseAdminClient()` **after** ENABLE/auth gates | **VERIFIED** |
| `components/` | No admin imports | **VERIFIED** |
| `lib/persistence/*`, `lib/providers/csv/*`, `lib/data-quality/*` | Several modules **default** to `createSupabaseAdminClient()` when caller omits client | **VERIFIED** code shape; **not** currently imported from `app/` / `components/` |

**Tenant boundary (workers):** org UUID from server env only when ENABLE=`1`; never from query/body/headers (HR1.a/b + HR3.1) — **VERIFIED**.

**Exploitable defect (current HTTP surface):** none confirmed for workers-OFF.
**Operator / future footgun (PARTIAL):** if Preview has Production `SUPABASE_SERVICE_ROLE_KEY` and a **future** ungated `app/` route imports an admin-default lib helper, Preview could mutate Production. Prefer unset service_role on Preview (§3.1 / §13.6).

#### 3) `NEXT_PUBLIC_*` usage and accidental secret propagation — **VERIFIED**

| Variable in repo product surface | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server session key |

No other `NEXT_PUBLIC_*` product secrets in `.env.example`. `NEXT_PUBLIC_SITE_URL` **absent** (optional future; Production-only if introduced). Naming policy forbids `NEXT_PUBLIC_` + service_role (`lib/tenancy/service-role-policy.ts`).

**Status:** **VERIFIED** in code. Live Vercel public-var contents: **UNKNOWN**.

#### 4) `VERCEL_ENV` = production / preview / development / missing / unknown — **VERIFIED**

| `VERCEL_ENV` | Worker ENABLE behavior (`isMetricWorkerEnvEnabled`) |
|---|---|
| exact `preview` | Forced **OFF** even if ENABLE=`1` |
| `production` | Honors ENABLE exact `"1"` |
| `development` | Honors ENABLE (does **not** hard-disable) |
| missing / empty / unknown / wrong case (`Preview`) | Honors ENABLE — **not** a verified-Production attestation |

Evidence: `lib/persistence/metric-worker-runtime-env.ts`; both config readers; unit + architecture tests `tests/unit/m5-hr3-2a-preview-worker-guard*.test.ts`.

Local macOS (unset) preserved for intentional ENABLE=`1` tests.
**Do not** add a positive `VERCEL_ENV===production` requirement for ENABLE — that would break legitimate local development.

#### 5) Worker default-OFF + Preview hard-disable across all four HTTP routes — **VERIFIED**

| Route | Method | Gate chain | Preview ENABLE=1 |
|---|---|---|---|
| `/api/internal/metric-recompute` | POST | `readMetricRecomputeWorkerConfig` → `evaluateMetricRecomputeHttpGate` → admin | 404 `not_found` |
| `/api/internal/metric-rollover` | POST | `readMetricRolloverWorkerConfig` → `evaluateMetricRolloverHttpGate` → admin | 404 |
| `/api/internal/cron/metric-recompute` | GET | `CRON_SECRET` → config → `evaluateMetricRecomputeCronGate` → admin | 401 (bad/missing secret) or 404 (auth OK, ENABLE forced off) |
| `/api/internal/cron/metric-rollover` | GET | same pattern for rollover | same |

Also: `.env.example` ENABLE empty; no `vercel.json`; architecture test asserts all four routes inherit config readers and do not re-check ENABLE/`VERCEL_ENV` locally.

#### 6) Production ENABLE=`1` prerequisites (auth, org scope, trusted runtime) — **VERIFIED (code); activation NO-GO**

Ordered fail-closed prerequisites already implemented:

1. **POST:** ENABLE effective true → worker secret ≥32 + timing-safe match → org UUID from server env → then admin + tick.
2. **Cron GET:** `CRON_SECRET` ≥32 + timing-safe Bearer → ENABLE effective true → org UUID → then admin + tick.
3. Missing/invalid org when enabled → **503** `organization_scope_required`, **zero** queue RPCs.
4. Preview cannot satisfy (1)/(2) ENABLE even if env set (HR3.2a).

Trusted runtime context for ticks remains Node route handlers (`runtime = "nodejs"`, `maxDuration = 60`), not Edge. Org never from HTTP input.

**Activation still NO-GO** until separate approval + HR2 §H + Production env matrix + no Preview ENABLE.

#### 7) Missing / unknown `VERCEL_ENV` without breaking local — **VERIFIED (intentional)**

Hard-block only exact `preview`. Unset/`development`/unknown continue to honor ENABLE so local macOS and intentional local ENABLE tests remain valid. Documented + unit-tested limitation; operator ENABLE scoping is the compensator for non-Preview.

**No code change recommended** for this item.

#### 8) Preview → Production Supabase credential crossover — **PARTIAL (code mitigates workers; ops residual)**

| Risk | Mitigation today | Residual |
|---|---|---|
| Preview ENABLE=1 + Production URL/service_role | HR3.2a hard-disable on all four routes | **Closed for workers** (VERIFIED) |
| Preview holds Production `SUPABASE_SERVICE_ROLE_KEY` | Prefer unset on Preview; current `app/` admin only post-gate | **Operator misconfig** + future ungated admin import footgun (PARTIAL) |
| Preview publishable points at Production | Password auth against prod from Preview URLs | **Operator** — Deployment Protection + prefer non-prod Supabase (P1) |

**Exploitable worker defect:** none confirmed post-HR3.2a.
**Operator risk:** still prefer dedicated Preview Supabase (or omit service_role on Preview).

#### 9) Auth callback / Site URL / deployment isolation — **PARTIAL**

| Control | Evidence | Status |
|---|---|---|
| Callback code exchange + provisioning | `app/auth/callback/route.ts` uses **server** (publishable) client | **VERIFIED** |
| Open-redirect hardening | `safeAuthNextPath` same-origin path only; sign-in form mirrors | **VERIFIED** |
| Primary UI auth | Password (`components/auth/sign-in-form.tsx`); no OAuth/magic-link UI | **VERIFIED** |
| Hosted Site URL + Redirect allowlist | Supabase Auth console (not in app env) | **UNKNOWN** live; **operator required** |
| Preview vs Production auth host isolation | Deployment Protection + redirect allowlist / wildcard policy | **UNKNOWN** live |

**P0 operator (not code):** hosted Site URL still `localhost` breaks Production login/email correctness (HR32-P0-5).

#### 10) Serverless logs / errors / secret redaction — **PARTIAL**

| Layer | State | Status |
|---|---|---|
| Shared redact | `lib/observability/redact.ts` — bearer/JWT/sensitive keys | **VERIFIED** |
| `logServerFailure` / application logger | Redacts message + metadata before emit | **VERIFIED** |
| Metric POST/cron `console.info` | Counts-only JSON; architecture forbids logging `CRON_SECRET` | **VERIFIED** pattern; does **not** pipe through `redactObservabilityValue` |
| Central error product (Sentry etc.) | Not required for workers-OFF | **PARTIAL** / optional later |

**Exploitable log-leak defect:** none confirmed on metric routes (counts-only).
**Gap (P2):** metric telemetry bypasses shared redact helper — acceptable while payloads stay counts-only; do not add raw errors/secrets to those `console.info` calls.

#### 11) Unit / architecture coverage and genuine gaps — **VERIFIED coverage; PARTIAL gaps**

| Covered | Evidence |
|---|---|
| Preview hard-disable + local/Production preservation | `m5-hr3-2a-preview-worker-guard.test.ts` |
| Four routes inherit guard; no `vercel.json` | `m5-hr3-2a-preview-worker-guard-architecture.test.ts` |
| Cron auth / no HTTP-to-POST / secret hygiene | `m5-hr3-cron-adapter*.test.ts` |
| Org-scoped HTTP gates | `m5-hr1a-*`, `m5-hr1b-*` |
| Browser vs admin separation | `supabase-client-architecture.test.ts` |
| Observability redaction | `application-observability-redaction.test.ts` |

| Genuine gap | Severity | Notes |
|---|---|---|
| No architecture lock that `app/` admin imports ⊆ four gated routes | P2 | Would catch future ungated admin HTTP; **not** required for workers-OFF |
| Live Vercel Production/Preview env matrix | P0 ops | Cannot be unit-tested from repo |
| Hosted Auth Site URL / redirect allowlist | P0 ops | Operator console |
| Metric `console.info` not using shared redact | P2 | Counts-only today |

#### 12) Environment-variable ownership (code vs Vercel vs Supabase) — **VERIFIED (map)**

| Concern | Owner |
|---|---|
| Exact `"1"` ENABLE + Preview hard-disable + org/secret gates | **Code** (HEAD) |
| Which env values exist on Production vs Preview vs Development | **Vercel operator** |
| `SUPABASE_SERVICE_ROLE_KEY` Production-scoped; Preview omit preferred | **Vercel operator** |
| No `vercel.json` / no Cron Jobs for first deploy | **Repo absence** + **Vercel dashboard** |
| Auth Site URL + Redirect URLs | **Supabase Auth console** |
| Preview Deployment Protection | **Vercel project settings** |
| Node 22.x | **Code** `engines` + **Vercel** project pin |
| Local `.env.local` contents | **Developer machine** (never commit) |

Code cannot fully substitute for Vercel/Supabase operator settings. HR3.2a is defense-in-depth for Preview workers only.

### 13.2 Findings register (severity + evidence + confidence)

Separate **exploitable defects** from **operator misconfiguration risks**. No secret values recorded.

| ID | Severity | Class | Finding | Evidence | Confidence |
|---|---|---|---|---|---|
| HR32b-F1 | — | Defect | No client-bundle exposure of service_role / worker / cron secrets found | `lib/supabase/{browser,server,admin,proxy}.ts`; `lib/config/env.ts`; `.env.example`; architecture tests; no `.tsx` secret refs | **VERIFIED** |
| HR32b-F2 | — | Defect | No ungated `app/` admin HTTP path; four routes construct admin only after gates | `app/api/internal/**`; gate-before-admin order in route files | **VERIFIED** |
| HR32b-F3 | — | Defect | Workers default-OFF; Preview ENABLE hard-disabled on all four routes | `metric-worker-runtime-env.ts`; config readers; HR3.2a tests; no `vercel.json` | **VERIFIED** |
| HR32b-F4 | P0 | **Operator** | Live Vercel project / Production+Preview env matrix not verifiable from repo | No `.vercel/`; no linked project in tree | **UNKNOWN** |
| HR32b-F5 | P0 | **Operator** | Hosted Supabase Auth Site URL / redirect allowlist not verified | Console-only; `NEXT_PUBLIC_SITE_URL` absent | **UNKNOWN** |
| HR32b-F6 | P1 | **Operator** | Preview publishable credentials aimed at Production → auth against prod from Preview URLs | §2.3 / §8; not fixed by worker gates | **PARTIAL** |
| HR32b-F7 | P1 | **Operator** | Production `SUPABASE_SERVICE_ROLE_KEY` also set on Preview “for convenience” | Lib admin defaults remain a footgun for **future** routes | **PARTIAL** |
| HR32b-F8 | P1 | Residual design | Missing/unknown `VERCEL_ENV` is not verified Production (ENABLE still honored) | Intentional; preserves local; documented + tested | **VERIFIED** |
| HR32b-F9 | P2 | Gap | No architecture test locking `app/` admin import set = four gated routes | Grep-only this session | **VERIFIED** gap |
| HR32b-F10 | P2 | Gap | Metric route `console.info` bypasses shared redact helper | Acceptable while counts-only | **VERIFIED** |
| HR32b-F11 | P0 | Activation (not workers-OFF) | Worker ENABLE / cron before HR2 §H + org scope + approval | HR3 / HR2 authority | **VERIFIED** policy |

**P0/P1 blockers for a safe workers-OFF first deploy:** HR32b-F4, HR32b-F5 (operator). F6/F7 are strong recommendations before relying on Preview against shared identity/data. F11 blocks ENABLE/cron, **not** workers-OFF web.

**No P0/P1 exploitable code defect** requiring a new runtime guard was confirmed on HEAD `3564e77`.

### 13.3 Minimum safe Production / Preview environment policy

**Production (first workers-OFF deploy):**

- Set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (hosted project; never localhost).
- **Unset:** all `METRIC_*_WORKER_ENABLED`, `METRIC_*_WORKER_SECRET`, `METRIC_*_ORGANIZATION_ID`, `CRON_SECRET`.
- Do **not** add `vercel.json` or Cron Jobs.
- Pin Node **22.x**.

**Preview:**

- Prefer **non-prod** Supabase URL + publishable key.
- **Omit** `SUPABASE_SERVICE_ROLE_KEY` and all worker/cron vars (defense beyond HR3.2a).
- Enable **Deployment Protection** (Standard Protection).
- Do not set ENABLE=`1` (code hard-blocks Preview workers anyway).

**Development / local macOS:**

- Keep `.env.local` on local Supabase (`127.0.0.1`).
- Leave ENABLE empty by default; intentional local ENABLE=`1` tests remain allowed when `VERCEL_ENV` is unset.
- Do not overwrite local env with Production secrets casually.

**Supabase Auth (operator):**

- Site URL = Production origin.
- Redirect allowlist: exact Production `/auth/callback`; keep `http://localhost:3000/**`; add Preview wildcard only if Preview auth is required.

### 13.4 Runtime guard needed? — **NO**

| Candidate guard | Needed for workers-OFF? | Why |
|---|---|---|
| Preview ENABLE hard-disable | Already shipped (HR3.2a) | HEAD `3564e77` |
| Require `VERCEL_ENV===production` for ENABLE | **No** | Breaks local ENABLE=`1`; contradicts HR3.2a limitation design |
| Hard-disable workers when `VERCEL_ENV` missing/unknown | **No** | Breaks local; operator ENABLE-off is sufficient for first deploy |
| Preview-block `createSupabaseAdminClient` globally | **No** for workers-OFF | No ungated `app/` admin path today; would be a **separate** future slice if Preview must hold service_role |

**Decision:** **NO new runtime guard** before a future workers-OFF Vercel deployment. Rely on (1) HR3.2a Preview worker hard-disable, (2) default-OFF ENABLE, (3) operator env matrix §13.3 / §13.6.

### 13.5 Recommended implementation scope (smallest slice)

| Slice | Recommendation |
|---|---|
| HR3.2b code / test / config changes | **NONE** — not supported by confirmed workers-OFF blockers |
| Optional later P2 (separate approval) | Architecture test: under `app/`, `createSupabaseAdminClient` / `@/lib/supabase/admin` imports ⊆ the four gated metric/cron routes |
| Optional later P2 | Route metric `console.info` through shared redact **only if** payloads grow beyond counts |
| HR3.2 ops | Operator: link project, apply §13.3, Auth URLs, Deployment Protection, smoke §5.2 — **no code** |
| HR3.3 / HR3.4 / ENABLE / cron | Still **NO-GO** |

**Local / Production behavior preservation:** do not change ENABLE semantics for unset/`production`/`development` `VERCEL_ENV`.
**Default-OFF + rollback:** keep ENABLE unset; kill-switch remains unset ENABLE (404) → remove cron if ever added → Instant Rollback → rotate secrets if exposure suspected (§6).

### 13.6 Operator-only prerequisites for future workers-OFF deployment

| # | Prerequisite | Owner | Blocks |
|---|---|---|---|
| 1 | Deploy SHA ≥ `3564e77` (HR3.1 + HR3.2a) | Eng | Deploy |
| 2 | `npm run check` green on release commit | Eng | Deploy |
| 3 | Repo still has **no** `vercel.json` | Eng / repo | Deploy |
| 4 | Production env matrix §13.3 (Supabase trio; workers/cron unset) | Vercel operator | Deploy trust |
| 5 | Preview: ENABLE/worker/cron unset; prefer omit service_role; prefer non-prod DB | Vercel operator | Preview safety |
| 6 | Auth Site URL + Production `/auth/callback` allowlist; localhost kept | Supabase operator | Merchant login |
| 7 | Preview Deployment Protection enabled | Vercel operator | Preview exposure |
| 8 | Smoke §5.2 (404/401 on internal/cron; dashboard no crons) | Operator | Acceptance |
| 9 | HR2 §H / M7 hosted / ENABLE | **Not required** for workers-OFF web | ENABLE only |

### 13.7 GO / NO-GO (HR3.2b)

| Action | Decision |
|---|---|
| Accept HR3.2b audit conclusions (this §13) | **GO** |
| Implement additional Production runtime guard / code slice now | **NO-GO** (not necessary) |
| First Vercel Production **web** deploy, workers **OFF**, no crons | **CONDITIONAL GO** after §13.6 operator gates |
| Set any `METRIC_*_WORKER_ENABLED=1` (Preview or Production) | **NO-GO** |
| Add `vercel.json` / activate Cron Jobs | **NO-GO** (until HR3.4) |
| Hosted SQL mutate / canary drain / E4 / M7.3 / AI / purchasing | **NO-GO** |
| Disrupt local macOS + local Supabase workflow | **NO-GO** |

**HR3.2b overall:** audit **COMPLETE**; additional hardening code **NOT REQUIRED** for workers-OFF; deploy readiness remains **CONDITIONAL GO** on operator configuration only.

**STOP before implementation.**
