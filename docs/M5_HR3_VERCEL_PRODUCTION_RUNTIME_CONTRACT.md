# M5-HR3 — Vercel Production Runtime Architecture Contract

**Status:** FROZEN (audit + architecture contract only). Response-2 Option A accepted and re-verified against HEAD + current Vercel Cron docs. This freeze does **not** authorize implementation, `vercel.json` crons, deploy, worker ENABLE, hosted SQL, or canary execution.
**Baseline:** `main` @ `3bddeed9e5bcd784a02a8fa87694e13b7e067195` — `fix(metrics): enforce org-scoped HTTP rollover tick`
**As-of:** 2026-11-04 (re-verify pass)
**Parents:** `docs/M5_HR1_A_ORG_SCOPED_RECOMPUTE_CONTRACT.md`, `docs/M5_HR1_B_ORG_SCOPED_ROLLOVER_CONTRACT.md`, `docs/M5_HR2_HOSTED_READINESS_VERIFICATION.md`, `docs/M5_6E_3_CANARY_ISOLATION_DECISION.md`
**Vercel docs checked:** Cron Jobs (GET invocation); Managing Cron Jobs (`CRON_SECRET` → `Authorization: Bearer …`; sample fail-closed `!cronSecret`); project `crons` apply to **production** deployments.
**Authority when docs conflict:** this freeze for **Vercel hosting / scheduler / serverless runtime** only. HR1.a/HR1.b remain authority for org-scoped HTTP tick semantics. E.3 remains authority for SQL null=global claim/recover. HR2 remains authority for hosted SQL readiness evidence. M5.5 formula authority unchanged.

---

## 0. Verdict

| Gate | Result |
|---|---|
| Accept Response-2 Option A (thin GET cron adapters + shared in-process ticks) | **GO** (architecture direction) |
| Freeze this Vercel runtime contract (docs only) | **GO** |
| Implement cron adapters / `vercel.json` / deploy | **NO-GO** until a separate explicit implementation-slice approval |
| Enable `METRIC_*_WORKER_ENABLED=1` on Vercel | **NO-GO** (this freeze) |
| Active crons in repo / during development | **NO-GO** (`vercel.json` remains absent; HR3.1 must not add it) |
| SQL / migrations / hosted mutate / canary drain | **NO-GO** |
| E4 / M7.3 / AI / purchasing / payments | **NO-GO** |
| Continuous multi-tenant production workers | **NO-GO** — canary/single-org only when later approved |

**Product intent:** Define a fail-closed, Vercel-compatible way to host the Next.js app and (later) trigger the existing HR1.a/HR1.b **org-scoped**, **bounded**, **stateless** metric ticks against hosted Supabase—without weakening tenant isolation or inventing a second work queue.

### 0.1 Pre-freeze verification (six checks)

| # | Check | Result | Evidence / correction |
|---|---|---|---|
| 1 | GET cron adapter security + `CRON_SECRET` fail-closed | **PASS (contract strengthened)** | Vercel Cron = HTTP **GET**; sends `Authorization: Bearer <CRON_SECRET>` when set. Official sample rejects missing secret (`!cronSecret`). HR3 requires present secret, prefer ≥32 (stricter than Vercel’s ≥16 guidance), **timing-safe** compare (stricter than sample `!==`), never treat UA / `x-vercel-cron-schedule` as auth. Unset/empty/short → **401**, zero RPCs. |
| 2 | Reuse shared gated worker logic **without** HTTP-to-POST | **PASS (contract tightened)** | POST routes already call `runMetricRecomputeTick` / `queue.enqueue` in-process after gates. Cron adapters must do the same. **Forbidden:** `fetch`/`POST` to `/api/internal/metric-*` from cron routes. **Forbidden:** reusing `evaluateMetric*HttpGate` as cron auth (those gates require `METRIC_*_WORKER_SECRET`). Cron uses a dedicated `CRON_SECRET` check, then the same ENABLE/org + tick/enqueue path. |
| 3 | 45s tick budget vs 60s `maxDuration`; lease safety | **PASS** | Settings: `tickBudgetMs=45_000`, `itemDeadlineMs=40_000`, `completionReserveMs=2_000`, `leaseSeconds=120`, route `maxDuration=60`. Validator enforces `itemDeadline+reserve < lease*1000` (42s < 120s). Wall margin under platform kill ≈ 15s after tick budget for cold start/response. Platform kill mid-tick leaves DB leases ≤120s → org-scoped recover on a later tick. Do not raise `tickBudgetMs` without raising `maxDuration`. |
| 4 | Production / Preview + default-OFF | **PASS** | `.env.example` ENABLE empty; config requires exact `"1"`. Preview must keep ENABLE unset. Vercel `crons` target **production** deployments; Preview still must not set ENABLE=1 against prod Supabase. |
| 5 | Provider-independent workers + dedicated-worker portability | **PASS (made explicit)** | `workers/aggregate-metrics.ts` and queue libraries have no Vercel imports; HTTP/cron routes are thin triggers. Future non-Vercel runner (Option C external POST or later dedicated process) must call the same tick/enqueue helpers—never embed metric logic only inside Vercel route files. |
| 6 | No active `vercel.json` cron during development | **PASS** | Repo has **no** `vercel.json` at HEAD. Proposed cron JSON remains docs-only until a separate HR3.4 enablement approval. HR3.1 **must not** create `vercel.json`. |

---

## 1. Verified baseline and current surface

### 1.1 Git / tree (this session)

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `3bddeed` (exact) |
| `vercel.json` | **Absent** |
| `.github/workflows` | **Absent** |
| Dirty tree | Preserved; only this deliverable added |

### 1.2 Stack facts (repo)

| Layer | Evidence |
|---|---|
| Framework | Next.js `^16.4.0` App Router (`package.json`) |
| Config | `next.config.ts` — no edge/cron/scheduler; `poweredByHeader: false` |
| Scripts | `dev` / `build` / `start` / `check` — no deploy script |
| Worker routes | `POST` only: `app/api/internal/metric-recompute/route.ts`, `.../metric-rollover/route.ts` |
| Runtime exports | `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 60` |
| Tick budgets | Recompute: `tickBudgetMs=45_000`, `itemDeadlineMs=40_000`, `leaseSeconds=120`, defaults `maxActive=1` / `claimLimit=1` |
| Rollover | Single `enqueue` RPC; library defaults `limit=100`, `maxStores=4` |
| Auth today | Per-worker bearer ≥32 chars; constant-time hash compare; ENABLE exact `"1"`; org UUID from server env only |
| Admin client | `createSupabaseAdminClient()` — `server-only`; URL + service_role from env; no session persistence |
| Middleware | **No** root `middleware.ts` |
| Durable correctness | PostgreSQL claim/lease/generation fencing + enrollment ledger (not process memory) |

### 1.3 HR2 / SQL readiness note

Repo `docs/M5_HR2_HOSTED_READINESS_VERIFICATION.md` recorded **this-session** hosted SELECT as not performed. Operator context for HR3 may treat hosted E.3 / RPC signatures as confirmed outside git. **This freeze does not re-query hosted SQL.** Any future ENABLE still requires archived HR2 §H (or equivalent) evidence plus live Vercel env verification.

### 1.4 Explicit non-goals

- No `vercel.json` created in this milestone (especially no active `crons`)
- No GET adapters, route edits, workers, SQL, migrations, deploys
- No M7.2/M7.3 hosted apply (noted pending; out of HR3 scope)
- No pg_cron, Supabase Edge Functions, or second queue product

---

## 2. Assessment matrix (twelve topics)

### 2.1 Vercel Node.js runtime compatibility — **COMPATIBLE (with bounds)**

| Concern | Finding |
|---|---|
| App Router + Node route handlers | Already used; matches Vercel Functions Node runtime |
| Edge runtime | **Must not** be used for metric ticks (needs `server-only`, crypto, service_role, long I/O) |
| `maxDuration = 60` | Fits Fluid Compute defaults (Hobby/Pro default/max ≥ 300s). Tick budget 45s + HTTP overhead fits 60s; do not raise tick budget without raising `maxDuration` |
| Native modules / filesystem | Workers do not require durable local FS; OK for serverless |
| Next 16 on Vercel | First-class; `npm run build` is the deploy artifact gate |

**Verdict:** Vercel is a fit for the **web/API** surface and for **bounded HTTP ticks**. It is not a fit for long-running daemon workers; StoreAgent already designed ticks as short, lease-fenced invocations.

### 2.2 Existing POST worker routes vs Vercel Cron GET — **GAP (P0 for scheduling)**

Vercel Cron invokes the configured path with **HTTP GET** (docs: Cron Jobs). Existing internal metric routes export **`POST` only**.

| Path | Today | Vercel Cron native |
|---|---|---|
| `/api/internal/metric-recompute` | POST + HR1.a gates | GET required for cron |
| `/api/internal/metric-rollover` | POST + HR1.b gates | GET required for cron |

A cron hitting POST-only routes yields method failure / no tick. **Do not** “fix” by making the existing POST handler also accept unauthenticated GET.

### 2.3 Safe scheduler / trigger adapter alternatives

| Option | Pattern | Pros | Cons | HR3 recommendation |
|---|---|---|---|---|
| **A — Thin GET cron adapters** | New routes e.g. `/api/internal/cron/metric-recompute` (+ rollover) that auth then call the **same** tick/enqueue helpers as POST | Vercel-native; keeps POST ops path; clear auth boundary | Small new surface; must not read tenant from query | **Preferred** for Vercel |
| **B — Dual method on existing routes** | Add `GET` beside `POST` on the same paths | Fewer paths | Mixes ops bearer semantics with platform cron; easier to regress | Acceptable only if gates identical and tests lock both |
| **C — External HTTPS cron POST** | GitHub Actions / external scheduler POSTs with existing `METRIC_*_WORKER_SECRET` | No GET adapter; reuses HR1 routes as-is | Extra vendor; preview/prod URL discipline; secrets in Actions | **Fallback** if Vercel Cron deferred |
| **D — Supabase pg_cron / DB worker** | Schedule SQL inside Postgres | Close to data | Bypasses app gates; service_role in DB; hard to keep HR1 HTTP fail-closed | **Rejected** for M5 HTTP workers |
| **E — Always-on Node worker** | Separate process | Simple loops | Not the Vercel model; ops burden | **Out of scope** |

**Frozen choice:** Option **A** (Response 2) as the production Vercel design; Option **C** as an approved emergency/manual ops path using existing POST routes. Option D forbidden for this milestone family.

**In-process reuse rule (non-negotiable for Option A):**

```
GET cron adapter
  → auth CRON_SECRET (fail-closed)
  → read ENABLE + org from env (HR1 decision table rows 1/4)
  → createSupabaseAdminClient()
  → runMetricRecomputeTick(...)  OR  queue.enqueue({ organizationId })
```

No loopback HTTP. No `fetch` to POST routes. Shared helpers live in `workers/*` and `lib/persistence/*` so a future dedicated worker process can import the same entrypoints.

### 2.4 Authentication: `CRON_SECRET` vs existing internal bearer — **SPLIT TRUST DOMAINS**

| Secret | Role | Rules |
|---|---|---|
| `METRIC_RECOMPUTE_WORKER_SECRET` | Authorizes **ops/manual POST** recompute route | ≥32 chars; constant-time; never selects tenant |
| `METRIC_ROLLOVER_WORKER_SECRET` | Authorizes **ops/manual POST** rollover route | Same; independent of recompute |
| `CRON_SECRET` | Authorizes **Vercel Cron GET** adapters only | Platform injects `Authorization: Bearer <CRON_SECRET>` when the env var is set; require present; **≥32** for StoreAgent (stricter than Vercel’s ≥16); timing-safe compare; reject if unset/empty/short (never compare to `Bearer undefined`) |
| Org env vars | Select tenant | Server-only; UUID; independent per worker family |

**Frozen cron GET decision table** (evaluate in order; **zero** queue RPCs before success):

| # | `CRON_SECRET` (≥32) | Bearer matches | `METRIC_*_WORKER_ENABLED` | `METRIC_*_ORGANIZATION_ID` | Status | Queue ops |
|---|---|---|---|---|---|---|
| 1 | missing/short | any | any | any | **401** `unauthorized` (or `cron_not_configured`) | none |
| 2 | valid | fail | any | any | **401** `unauthorized` | none |
| 3 | valid | pass | ≠ `"1"` | any | **404** `not_found` | none |
| 4 | valid | pass | `"1"` | missing/invalid | **503** `organization_scope_required` | none |
| 5 | valid | pass | `"1"` | one UUID | **200** counts / **500** tick failure | org-scoped tick only |

**Frozen auth model for Option A:**

1. Cron GET adapters authenticate **only** `CRON_SECRET` (timing-safe), then still require `METRIC_*_WORKER_ENABLED=1` and valid `METRIC_*_ORGANIZATION_ID`.
2. Cron adapters **do not** require `METRIC_*_WORKER_SECRET` and **must not** call `evaluateMetric*HttpGate` for cron auth (those helpers bind the worker bearer).
3. POST routes keep HR1.a/HR1.b bearer semantics unchanged (`evaluateMetric*HttpGate`).
4. **Forbidden:** treating `CRON_SECRET` as a tenant selector; accepting org/store/`asOf` from query/body/headers; using User-Agent `vercel-cron/1.0` or `x-vercel-cron-schedule` alone as auth.
5. Preview/staging: leave ENABLE unset; if `CRON_SECRET` exists for platform reasons, adapters still 404 when ENABLE≠1 (row 3).

### 2.5 No tenant selection from untrusted HTTP input — **ALREADY CONTRACTED; MUST PRESERVE**

HR1.a/HR1.b: trusted org from env only. Cron GET must inherit the same rule. Query string schedules, `x-vercel-cron-schedule`, and path segments must never widen tenant scope.

### 2.6 Timeouts, batches, concurrency, retries — **SERVERLESS-ALIGNED**

| Knob | Value | Vercel implication |
|---|---|---|
| Route `maxDuration` | 60s (both POST routes today; cron GET must match) | Platform must allow ≥60s (true on current Fluid defaults ≥300s) |
| `tickBudgetMs` | 45s | ~15s wall margin under 60s for cold start + JSON response |
| `itemDeadlineMs` | 40s | Single item bounded |
| `completionReserveMs` | 2s | Enforced with item deadline against lease |
| `leaseSeconds` | 120s | **Outlives** one 60s invocation (and item+reserve=42s); recover on later tick if killed |
| `maxActive` / `claimLimit` | default 1 | F2 containment; optional env 1–4 |
| Consume batches | ≤4 × 500 | Bounded; backlog drains across ticks |
| Retry policy | 5 attempts; 30s base; 30m cap | Durable in DB (`retry_wait`); **Vercel Cron does not retry failed invocations** — next schedule / manual POST is the retry transport |
| Rollover | one enqueue / request | Typically short; still org-scoped; same 60s `maxDuration` envelope |

**Invariants:**

1. Platform kill / `FUNCTION_INVOCATION_TIMEOUT` mid-tick is safe: leases expire at DB clock; org-scoped recover on a later correctly configured tick.
2. No in-memory retry loop across invocations.
3. Cron GET adapters inherit `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 60` (same as POST).
4. Never set `tickBudgetMs ≥ maxDuration * 1000`.

### 2.7 Stateless serverless execution — **COMPATIBLE**

| State | Location |
|---|---|
| Claim leases / tokens / generations | Postgres |
| Enrollment / dirty bumps | Postgres |
| Worker process memory | Ephemeral; must not be treated as durable |
| `ownerId` | Per-invocation (`metric-recompute:${uuid}`) |

Fluid Compute may reuse instances; code must not store cross-request tenant/work state in module globals.

### 2.8 Supabase connectivity, secrets, tenant isolation

| Topic | Contract |
|---|---|
| URL | Production Vercel env `NEXT_PUBLIC_SUPABASE_URL` = hosted project URL (not `127.0.0.1`) |
| Browser key | Publishable only |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; Vercel encrypted env; never `NEXT_PUBLIC_*`; never client bundles |
| Admin client | `persistSession: false`, `autoRefreshToken: false` — correct for serverless |
| RLS bypass | By design for workers; isolation = durable org on rows + HR1 env org + SQL filters |
| Connection | Prefer Supabase HTTP/RPC via JS client (current); avoid holding long pooled TCP in short functions unless separately designed |
| Preview | Must not point preview ENABLE=1 at production DB; prefer preview ENABLE off always |

### 2.9 Production / preview separation — **REQUIRED**

| Environment | Workers | Cron | Supabase |
|---|---|---|---|
| Local macOS | ENABLE off by default | N/A | Local Supabase |
| Vercel Preview | ENABLE **must** be unset/≠1; no active crons targeting workers | No | Prefer non-prod project or read-only; never canary-enable against prod |
| Vercel Production | ENABLE only after explicit approval; org UUID = canary (initially) | Only after adapter + inactive→active cron approval | Hosted `qlsqminsfdntpqdkhxjx` (or successor) |

Vercel env scoping: set worker secrets / ENABLE / org IDs for **Production** only until a dedicated staging project exists.

### 2.10 Deployment and rollback safety

| Control | Behavior |
|---|---|
| Instant kill switch | Set ENABLE ≠ `1` (or unset) → 404, zero RPCs |
| Misconfig kill | ENABLE=1 without org → 503, zero RPCs (no global) |
| Cron kill | Remove/disable cron entries or unset `CRON_SECRET` so GET adapters 401; ENABLE off remains primary |
| Code rollback | Redeploy previous Vercel deployment; keep ENABLE off if HR1 gates absent on old revision |
| Schema rollback | Not via Vercel; SQL rollbacks are separate and generally avoided |
| Deploy order | (1) code with adapters default-safe, (2) verify ENABLE off, (3) optional canary ENABLE without cron, (4) cron last |

### 2.11 Observability, failures, cost

| Topic | Contract |
|---|---|
| Logs | Existing counts-only `console.info` JSON (`tick_summary`, gate errors). No claim tokens, no raw SQL, no foreign org dumps |
| Platform | Vercel function logs + status codes (404/401/503/200/500) |
| Failure transport | DB retry_wait / lease recover; cron non-retry means schedule cadence must be frequent enough for canary (e.g. every 5–15 min) without overlapping stampedes |
| Cost drivers | Invocation count × duration; keep `claimLimit=1`, short tick budget; avoid ENABLE on preview |
| Alerting (future) | 5xx rate, `queueErrors`, sustained `organization_scope_required`, unexpected ENABLE |

### 2.12 What can be validated locally before deployment

| Check | Local method |
|---|---|
| `next build` / `npm run check` | CI-equivalent |
| HR1.a/HR1.b unit + architecture tests | Vitest |
| POST gates (404/401/503/org) | Existing unit tests |
| Future GET adapters | Unit tests with Request fixtures; no Vercel required |
| Tick timeout math | Assert `tickBudgetMs + margin ≤ maxDuration * 1000` |
| Env fail-closed | Parse config helpers with mock env |
| Not local | Real Vercel Cron delivery, Fluid cold starts against hosted latency, live Production env matrix |

Vercel docs: crons do **not** run under `vercel dev` / `next dev` — local validation remains synthetic GET/POST.

---

## 3. Frozen target architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Vercel Production (Next.js App Router)                      │
│                                                             │
│  Merchant UI / App Router pages                             │
│       └─ user session → Supabase SSR (publishable)          │
│                                                             │
│  POST /api/internal/metric-recompute   (ops / Option C)     │
│  POST /api/internal/metric-rollover    (ops / Option C)     │
│       └─ HR1.a/b: ENABLE + worker secret + org env          │
│                                                             │
│  GET  /api/internal/cron/metric-recompute  (future Option A)│
│  GET  /api/internal/cron/metric-rollover   (future Option A)│
│       └─ CRON_SECRET → ENABLE → org env (no worker secret)  │
│                                                             │
│  Both paths → in-process tick/enqueue helpers (no HTTP hop) │
│       └─ createSupabaseAdminClient() → hosted RPCs          │
│            (org-scoped consume/claim/recover/enqueue)       │
│                                                             │
│  Portability: workers/* + lib/persistence/* stay            │
│  provider-agnostic (no Vercel SDK required to run a tick)   │
└─────────────────────────────┬───────────────────────────────┘
                              │ service_role RPC only
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Hosted Supabase Postgres                                    │
│  Durable queue, leases, generations, enrollment ledger      │
│  No pg_cron for M5 workers in this architecture             │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Vercel web/API responsibilities

- Serve App Router UI and authenticated merchant APIs.
- Host internal metric triggers (POST now; GET cron adapters later).
- Hold secrets and ENABLE/org configuration.
- Emit counts-only logs.
- **Not** responsible for durable job state, multi-hour daemons, or SQL migrations.
- **Not** the sole home of worker business logic — ticks must remain importable outside Vercel.

### 3.2 Scheduler and bounded worker design

- Scheduler = Vercel Cron GET → thin adapter → one bounded tick/enqueue.
- Default cadence (proposal only, not activated): recompute every 5–15 minutes; rollover hourly or daily UTC — finalize in an enablement runbook.
- Overlap: rely on PG advisory locks (`5606003` / `5606004`) + lease fencing; keep concurrency at 1 for canary.
- No in-function sleep-retry across lease windows.

### 3.3 Org-scoped queue execution

Unchanged from HR1.a/HR1.b:

- Recompute tick: non-null org on consume, recover, claim; mismatch gate before start.
- Rollover: `enqueue({ organizationId })` only.
- Null org forbidden on enabled HTTP/cron paths.
- Canary: both org env vars set to the same approved canary UUID initially.
- Do not drain E.4 leftover dirty=2 grain unless a separate runbook authorizes it.

### 3.4 Required environment configuration

**Always (web app):**

| Name | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Hosted URL in Production |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Production only as needed for server routes |

**Workers (default empty / off):**

| Name | Production canary (future) | Preview |
|---|---|---|
| `METRIC_RECOMPUTE_WORKER_ENABLED` | unset until approval; then `1` | unset |
| `METRIC_RECOMPUTE_WORKER_SECRET` | ≥32 if POST ops used | unset |
| `METRIC_RECOMPUTE_ORGANIZATION_ID` | canary UUID when ENABLE=1 | unset |
| `METRIC_RECOMPUTE_MAX_ACTIVE` / `CLAIM_LIMIT` | omit → 1 | unset |
| `METRIC_ROLLOVER_WORKER_ENABLED` | unset until approval | unset |
| `METRIC_ROLLOVER_WORKER_SECRET` | ≥32 if POST ops used | unset |
| `METRIC_ROLLOVER_ORGANIZATION_ID` | canary UUID when ENABLE=1 | unset |
| `CRON_SECRET` | ≥32 when cron adapters ship | optional; adapters still ENABLE-gated |

### 3.5 Default-OFF activation and rollback

Activation ladder (each step separately approved):

1. Deploy code (adapters present but ENABLE off; **no active crons**).
2. Confirm Production env ENABLE off; preview ENABLE off.
3. Optional: manual POST canary tick with secrets + org (still no cron).
4. Add `vercel.json` crons **disabled/absent** until enablement approval; when approved, add minimal cron paths to GET adapters only.
5. Rollback = ENABLE off and/or remove cron entries and/or redeploy prior build.

### 3.6 Proposed future `vercel.json` shape (DO NOT ADD DURING DEVELOPMENT / HR3.1)

Documented for **HR3.4 enablement** only. **Do not create this file in HR3.1 or any development slice.** Active crons while ENABLE is off still generate GET traffic and auth noise; keep the file absent until a deliberate production enablement approval.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/internal/cron/metric-recompute",
      "schedule": "*/10 * * * *"
    },
    {
      "path": "/api/internal/cron/metric-rollover",
      "schedule": "5 * * * *"
    }
  ]
}
```

Cron timezone is UTC. Paths must not redirect (Vercel cron does not follow redirects). Trailing-slash policy must match `next.config`. Vercel applies configured crons to **production** deployments; Preview still requires ENABLE≠1.

### 3.7 Deployment validation gates

Before first Production deploy of worker-capable code:

1. `npm run check` green on the release commit.
2. HR1.a/HR1.b architecture tests green.
3. Confirm no active `vercel.json` crons unless enablement approved.
4. Vercel Production env: ENABLE unset; org unset; service_role present for app; preview ENABLE unset.
5. HR2 §H (or equivalent) SQL signature evidence archived.
6. Smoke: Production URL `POST` internal routes without ENABLE → 404; with forged bearer → still 404 when disabled.
7. After adapters exist: `GET` cron paths without secret → 401; with secret but ENABLE off → 404.

Before any ENABLE=1:

1. Org UUID recorded; both worker families scoped.
2. Deployed revision ≥ HR1.a + HR1.b (+ cron adapters if cron will be used).
3. Canary leftover policy acknowledged.
4. On-call rollback owner named.

---

## 4. Security and tenant-isolation risks

| ID | Sev | Risk | Mitigation (contract) |
|---|---|---|---|
| HR3-1 | **P0** | Cron GET without adapter auth → public trigger | Decision table §2.4: missing/short/mismatch `CRON_SECRET` → 401; ENABLE still required |
| HR3-2 | **P0** | Preview ENABLE=1 against prod Supabase | Env separation; preview ENABLE forbidden |
| HR3-3 | **P0** | Old deploy without HR1 org gates + ENABLE | Never ENABLE until revision verified |
| HR3-4 | **P0** | Tenant from query/`asOf`/headers on cron | Forbidden; architecture tests |
| HR3-5 | **P1** | `CRON_SECRET` short / unset compare bugs | Require present; prefer ≥32; timing-safe; fail closed |
| HR3-6 | **P1** | Service role leaked to client | Keep `server-only` admin; no NEXT_PUBLIC service key |
| HR3-7 | **P1** | Global lease ceiling starves/blocks canary | Ops awareness (E.3); keep foreign claimable low |
| HR3-8 | **P2** | Cron non-retry + sparse schedule → lag | Cadence + manual POST fallback |
| HR3-9 | **P2** | Log volume / cost under high cadence | Keep claimLimit=1; canary-only org |

---

## 5. Gaps vs frozen architecture (current HEAD)

| Gap | Status |
|---|---|
| GET cron adapter routes | **Missing** (by design until implementation approval) |
| `vercel.json` / GitHub workflows | **Absent** |
| `CRON_SECRET` in `.env.example` | **Absent** (document in implementation slice) |
| Vercel project / env matrix verified live | **Unknown** (operator) |
| Hosted SQL re-verified in-repo HR2 session | See HR2; treat as gate not as this freeze |
| M7.2/M7.3 hosted migrations | **Pending** — unrelated to M5 tick hosting |
| Root middleware | Absent — not required for internal bearer gates |

---

## 6. Minimal implementation milestones (future, separately approved)

### M5-HR3.1 — Exact implementation scope (code only, ENABLE off, no cron config)

**Goal:** Add Vercel-Cron-ready GET adapters that reuse existing gated worker logic in-process, default-OFF, with no deploy and no `vercel.json`.

**In (permitted files):**

| Path | Change |
|---|---|
| `app/api/internal/cron/metric-recompute/route.ts` | **New** GET-only; `runtime="nodejs"`; `maxDuration=60`; `CRON_SECRET` gate → ENABLE/org → `runMetricRecomputeTick` (same deps pattern as POST) |
| `app/api/internal/cron/metric-rollover/route.ts` | **New** GET-only; same envelope; `enqueue({ organizationId })` only |
| `lib/persistence/metric-recompute-queue.ts` and/or small new `lib/persistence/metric-cron-auth.ts` (or equivalent under `lib/`) | Shared `CRON_SECRET` parse + timing-safe bearer helper; optional cron gate composer that does **not** require `METRIC_*_WORKER_SECRET` |
| `lib/persistence/metric-rollover.ts` | Only if needed to share ENABLE/org parse without duplicating; must not weaken HR1.b |
| `.env.example` | Document empty `CRON_SECRET=` (unset by default) |
| `tests/unit/m5-hr3-cron-adapter*.test.ts` (unit and/or architecture) | Decision table §2.4; no HTTP self-call; no body/query tenant; `maxDuration=60`; no `vercel.json` created |

**Required behaviors:**

1. Fail-closed `CRON_SECRET`: missing/empty/short (&lt;32) / mismatch → 401; zero RPCs.
2. ENABLE≠1 → 404; missing/invalid org when ENABLE=1 → 503; no global null.
3. Call `runMetricRecomputeTick` / `createMetricRolloverQueue(...).enqueue` **in-process** after gates — **never** HTTP POST to existing internal routes.
4. Do not invent a second tick implementation inside the route file beyond wiring.
5. Keep `workers/aggregate-metrics.ts` and queue libraries free of Vercel-specific imports (portability).
6. Counts-only responses; no claim tokens; ignore query/body for tenant/`asOf`.

**Out (forbidden in HR3.1):**

- Creating or committing `vercel.json` / `vercel.ts` / any active `crons`
- Worker ENABLE, deploy, hosted SQL, canary drain, cron activation
- Changing HR1.a/HR1.b POST semantics or SQL/migrations
- Edge runtime; internal HTTP-to-POST; using UA as auth
- E4 / M7.3 / AI / purchasing / payments
- Git commit/push unless separately requested

**Acceptance (when HR3.1 is later approved):** focused unit/architecture tests green; `npm run check` green; repo still has **no** `vercel.json`; ENABLE defaults remain off in `.env.example`.

### M5-HR3.2 — Vercel project wiring (ops + docs)

- Create/link Vercel project; Production env for Supabase URL/keys
- Preview: ENABLE forced off
- Deploy with adapters; **no crons**
- Record smoke 404/401 evidence

### M5-HR3.3 — Canary ENABLE without cron

- Production ENABLE=1 + org UUID + worker secrets
- Manual POST ticks only
- Observe counts; confirm no foreign mutation

### M5-HR3.4 — Activate cron (last)

- Add `vercel.json` crons to GET adapters only (first time this file may appear)
- `CRON_SECRET` set (≥32) on Production
- Short canary cadence; rollback = remove cron + ENABLE off

**Each milestone needs its own explicit approval. This freeze authorizes none of them.**

---

## 7. Explicit GO / NO-GO

| Action | Decision |
|---|---|
| Accept this document as the HR3 freeze | **GO** (docs only) |
| Deploy StoreAgent web app to Vercel with workers **OFF** | **CONDITIONAL GO** after separate deploy approval + env gates (§3.7) |
| Implement HR3.1 cron adapters | **NO-GO** until “implement HR3.1” approval |
| Add active `vercel.json` crons | **NO-GO** |
| ENABLE workers on Vercel | **NO-GO** |
| Production continuous multi-tenant workers | **NO-GO** |
| E4 / M7.3 / AI / buying / payments | **NO-GO** |
| pg_cron metric workers | **FORBIDDEN** under this architecture |

**Production worker runtime overall:** **NO-GO** (architecture ready to implement later; not authorized to run).

---

## 8. Freeze checklist (this session)

- [x] HEAD verified `3bddeed`; dirty tree preserved; `vercel.json` absent
- [x] Response-2 Option A accepted as architecture direction
- [x] Six pre-freeze checks verified against code + Vercel docs (§0.1)
- [x] No HTTP-to-POST reuse rule frozen; portability of `workers/*` frozen
- [x] Cron GET decision table + 45s/60s/120s lease safety frozen
- [x] Exact HR3.1 scope listed (§6); no active crons during development
- [x] Deliverable updated: `docs/M5_HR3_VERCEL_PRODUCTION_RUNTIME_CONTRACT.md`
- [ ] Implementation — **not authorized**
- [ ] Deploy / cron / ENABLE — **not authorized**

**STOP.** No implementation or activation under this approval.
