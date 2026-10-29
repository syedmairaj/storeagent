# M5.6 development handoff

Resume from this file. Canonical milestone state remains `docs/IMPLEMENTATION_STATUS.md`.

## 1. Baseline

- Repository: StoreAgent.si
- Branch: `main`
- M5.6C commit: `5cc0e6fd21f87a8975c1cec91aa76e6b6c85d4b8` (`5cc0e6f`)
- Last commit before M5.6C: `8c2af57fdda45a4dad67548ba4fad1f664b2d687` (`docs: sync M5.6A-B closeout and M5.6C handoff`)
- M5.6B commit: `118d9b511070d3f690d1852478230cb61b6d2527` (`118d9b5`)
- M5.6A commit: `b549fe0b78173acc9a5e75e115866a135fbbcf65` (`b549fe0`)
- M5.5 persistence commit: `6dc4ed249ddc32e278452e8b608c007c0567c01b` (`6dc4ed2`)

Hosted Supabase migration history (schema):

- `20261015110000`, `20261015120000`, `20261015130000` — M5.5, deployed
- `20261015140000` — M5.6A, deployed
- `20261016100000` — M5.6B, deployed
- `20261018100000` — M5.6C, **hosted schema deployed**; hosted **one-shot recompute** verified via E.4 Stage 3; HTTP worker still disabled
- `20261020100000` — M5.6D, **hosted schema deployed**; hosted **org-scoped rollover** exercised in E.4 Stage 4 (M5.6D milestone still **not** closed); HTTP rollover trigger still disabled
- `20261028100000` — M5.6E.3 org-scoped claim/recover, **hosted schema deployed**; org-scoped consume/claim exercised in canary
- `20261028210000` — M5.7 F1 deferred-attempt reset — **APPLIED AND VERIFIED ON HOSTED** (schema/grants; not worker enablement)
- `20261028220000` — M5.7 T4 busy-grain claim exclusion — **APPLIED AND VERIFIED ON HOSTED** (schema/grants; not worker enablement)

**Hosted canary verification ≠ production worker enablement.** Workers remain disabled; no scheduler. M5.6E.4 **CLOSED** (Stages 0–4; metrics 0/0/7; Stage 4 ×2; fingerprint `59d7d64dbcc254544f04cdb81ccff699`; final queue `queued` dirty=2 intentional). Isolation: `docs/M5_6E_3_CANARY_ISOLATION_DECISION.md`. Runbook: `docs/M5_6E_4_HOSTED_CANARY_RUNBOOK.md`.

## 2. Milestone state

| Milestone | State |
|---|---|
| M0 – M5.5 | Closed |
| M5.6A source-event capture | Closed; hosted migration deployed |
| M5.6B recompute-request generation | Closed; hosted migration deployed |
| M5.6C worker orchestration | **Closed** locally (see section 11). **Hosted schema deployed.** Hosted one-shot recompute verified (E.4 Stage 3). HTTP worker disabled. No scheduler. |
| M5.6D daily rollover | **Implemented locally; native verification in section 10. Not closed.** **Hosted schema deployed.** Org-scoped rollover path used in E.4 Stage 4 — does **not** close M5.6D. Rollover HTTP trigger disabled. No scheduler. |
| M5.6E.3 org-scoped claim/recover | **Hosted schema deployed** (`20261028100000`). Org-scoped consume/claim used in canary. Workers off. See `docs/M5_6E_3_CANARY_ISOLATION_DECISION.md`. |
| M5.6E.4 hosted canary | **CLOSED** (hosted canary verification only). See runbook §0 / §8. |
| M5.7 adversarial verification | **CLOSED** for **local adversarial engineering only** (section 12). Hosted F1/T4 schema **APPLIED AND VERIFIED**. Hosted worker/runtime activation **not** authorized. |

Worker/rollover HTTP enablement and scheduling remain separate, explicitly approved steps. Do not claim/recompute the E.4 canary grain left `queued` at dirty=2 as part of M5.7 or E.4 closeout. Canonical next: **M5.6D independent acceptance review** and **hosted operational-readiness planning**.

## 3. M5.6A source-event architecture

A committed source change inserts one row in `public.sku_daily_metric_source_events` per affected grain and store-local date. The grain is organization, store, location, variant, `source_date`, and algorithm version `m5-derived-metrics-v1`.

Store-local date is `(pg_catalog.timezone(store.timezone, source_timestamp))::date`. `consumed_at` stays null until M5.6B consumption. Rollback of the source transaction removes the event with it.

Captured changes:

- Order status or `ordered_at`: old and new store-local dates for every current item with a non-null location
- Order-item insert, quantity or location change, and delete: old and new non-null locations, dated from the current order
- Return insert, and changes to location, returned quantity, or `occurred_at`, plus delete
- Inventory-snapshot insert only

Null locations emit nothing. Commercial no-op updates emit nothing. Purchase orders are not captured. Snapshot update and delete stay blocked by the existing immutability triggers.

`event_id` is an identity column. Allocation order is not commit order. Consumers must not treat it as a watermark.

## 4. M5.6B consumption and request generation

`public.consume_sku_daily_metric_source_events(p_limit integer, p_organization_id uuid default null)` runs only when invoked.

In the caller’s transaction it:

1. Locks rows where `consumed_at is null`, ordered by `event_id`, with `for update skip locked`, up to `p_limit`. A non-null organization id limits the batch to that tenant.
2. Expands each source date `D` to affected metric dates.
3. Inserts one request per natural key, or adds the distinct event count to `dirty_generation`.
4. Sets `consumed_at` on those same locked events.

Expansion, and only these dates:

- `D` itself
- Store-local today, when today is inside `D` through `D + 89`
- Already persisted `sku_daily_metrics` dates for the same grain and algorithm version inside that inclusive window

A running or claimed request keeps its status, attempt count, and lease while `dirty_generation` increases. Succeeded, failed, cancelled, and `retry_wait` rows return to `queued`, with the attempt count reset and the lease cleared.

Invariants: consumption and request writes are atomic; request rows copy the event's tenant scope; no `event_id` cursor or watermark is used; both tables have RLS with no merchant policies and `service_role` SELECT only.

## 5. M5.6C contracts

### Migration

`supabase/migrations/20261018100000_m5_6c_metric_recompute_worker.sql` is additive. It does not edit any earlier object.

Nullable columns on `public.sku_daily_metric_recompute_requests`:

- `available_at` — retry eligibility; required when `status = 'retry_wait'`
- `last_error_class` — one of the `WorkerFailureClass` values
- `last_error_code` — `^[A-Za-z0-9_.:-]{1,64}$`
- `last_error_message` — fixed sanitized text, 1–300 characters
- `failed_reason` — one of the `WorkerTerminalFailureReason` values

It also adds a check that `claimed`/`running` rows carry a claim token, plus partial indexes for claimable rows, active leases, active grains, and unconsumed events by grain and date.

### RPCs

All six are `security definer` with `set search_path = ''`, use schema-qualified names, `REVOKE ALL` from `public, anon, authenticated`, and `GRANT EXECUTE` to `service_role` only. `service_role` still has only SELECT on the request table.

| RPC | Arguments | Returns |
|---|---|---|
| `recover_expired_sku_daily_metric_recompute_leases` | `p_max_attempts int, p_base_delay_seconds int, p_max_delay_seconds int` | `(requeued, retry_scheduled, failed)` |
| `claim_sku_daily_metric_recompute_requests` | `p_owner_id text, p_limit int (1–4), p_lease_seconds int (30–900), p_max_active int (1–4)` | claimed rows with grain, `claimed_generation`, `attempt_count`, `lease_claim_token`, `lease_expires_at` |
| `start_sku_daily_metric_recompute` | full key, owner, token, `p_lease_seconds` | `(attempt_count, claimed_generation, lease_expires_at)`, or no row when fenced |
| `complete_sku_daily_metric_recompute` | full key, owner, token | `succeeded` / `superseded` / `deferred` / `fenced` |
| `fail_sku_daily_metric_recompute` | full key, owner, token, class, code, message, `p_retry_delay_seconds`, `p_max_attempts` | `retry_scheduled` / `failed` / `superseded` / `fenced` |
| `sku_daily_metric_recompute_queue_stats` | none | counts and ages only, no tenant ids |

The full key is organization, store, location, variant, metric date, and algorithm version. Invalid arguments raise SQLSTATE `22023`.

### Lease, concurrency, retry and generation invariants

- **Claim lock.** Claim and recovery serialize on transaction advisory lock `5606003`, which is distinct from the test lock `561606`. This holds across independent processes.
- **Concurrency cap.** At most 4 unexpired `claimed`/`running` leases exist globally, and at most one unexpired lease per organization, store, location, and variant grain. Candidates are locked with `FOR UPDATE SKIP LOCKED`.
- **Claim.** The claim token comes from `gen_random_uuid()` in PostgreSQL. `claimed_generation` is copied from `dirty_generation` under the row lock. Claiming does not change `attempt_count`.
- **Start.** Start moves `claimed` to `running`, increments `attempt_count`, and renews the lease.
- **Fencing.** Start, complete, and fail require the full key, owner, token, correct status, and `lease_expires_at > clock_timestamp()`. A fenced call changes nothing. An expired lease is fenced even before recovery runs.
- **Generation precedence.** If `dirty_generation <> claimed_generation`, complete, fail, and recovery return the row to `queued` with `attempt_count = 0` and `applied_generation` unchanged. This check comes before retry exhaustion.
- **Recovery of expired leases:**
  - An expired `claimed` row returns to `queued`. Attempts are not incremented. They reset to 0 only if the generation changed while it was claimed.
  - An expired `running` row with a changed generation returns to `queued` with attempts 0.
  - An expired `running` row with `attempt_count >= max` becomes `failed` (`retry_exhausted`).
  - Any other expired `running` row becomes `retry_wait` with backoff.
- **Retry policy.** The policy is `workers/retry.ts`: 5 attempts, 30-second base, 30-minute cap, exponential with no jitter. Retryable classes are `transient_dependency`, `rate_limited`, `timeout`, and `lease_expired`. Unknown errors are terminal.
- **Generation as job identity.** Each generation is one logical job for retry purposes. The idempotency key includes the generation.
- **SA008.** SA008 retries happen inside the frozen M5.5 call (3 source reads) and never count as queue attempts.

### Failure classification

`workers/metric-recompute-failure.ts` classifies a failure from the structured SQLSTATE or HTTP status captured by the injected RPC client.

| Input | Class |
|---|---|
| SA008, 40001, 40P01, connection errors, HTTP 5xx, network | `transient_dependency` |
| 55P03, 57014, the local deadline | `timeout` |
| HTTP 429 | `rate_limited` |
| SA009 | `invariant_violation` |
| P0001, 22xxx, 23xxx | `validation` |
| 42501, HTTP 401/403 | `authorization` |
| Anything else | `unknown`, which is terminal |

Message text is used only for three frozen M5.5 errors that carry no code. Stored messages are fixed and sanitized.

## 6. Worker invocation and security

- Route: `POST /api/internal/metric-recompute` (`app/api/internal/metric-recompute/route.ts`), Node.js runtime, `maxDuration = 60`.
- Disabled unless `METRIC_RECOMPUTE_WORKER_ENABLED` is exactly `1`; otherwise it returns 404.
- Requires `METRIC_RECOMPUTE_WORKER_SECRET` with at least 32 characters; a shorter or missing secret returns 503 (fail closed). The bearer token is compared in constant time (SHA-256 then `timingSafeEqual`).
- Accepts no organization, store, or grain input. Work comes only from durable request rows; each item's tenant scope comes from its own row.
- Response: request id and operational counts only. Logs: structured worker telemetry with organization/store ids and a sanitized code; no claim tokens, payloads, or raw database errors.
- No scheduler is configured. No `vercel.json` exists.

One tick (`workers/aggregate-metrics.ts`):

1. Consume source events in up to 4 batches of 500 (global, null organization).
2. Recover expired leases.
3. Claim up to 4 requests.
4. For each claim, run start, then the frozen `recomputeSkuDailyMetric`, then complete or fail.
5. Repeat while a full item deadline still fits in the budget.

Settings: lease 120 s, item deadline 40 s, tick budget 45 s. The deadline aborts the HTTP wait through supabase-js `abortSignal()`. It may not cancel a database statement that is already running. A late commit is still correct, because the M5.5 commit revalidates its source token under SHARE locks. Request state is decided by the lease, not by process timers.

The tick stops at persisted metrics. It does not call forecast, decision, AI, or SyncRun code.

## 7. Source-event freshness

Completion requeues instead of succeeding when either of these holds:

- The generation changed since claim.
- An unconsumed source event for the same grain and algorithm version is visible with `source_date` from `metric_date - 89` through `metric_date`.

That window is exactly the set of dates whose M5.6B expansion can include `metric_date`. The event check reads without locking, so it never waits on consumption.

What `succeeded` with `applied_generation = g` guarantees:

- The metric row equals the deterministic M5.5 result for the source state at its commit.
- Every event consumed up to generation `g` was covered.
- No relevant unconsumed event was visible when completion ran.

What it does not guarantee:

- It does not keep the metric current afterwards.
- Under READ COMMITTED, an event whose transaction commits after the completion check is invisible to that check.
- Such an event stays unconsumed and discoverable, with no cursor involved. When it is consumed later, M5.6B reopens the request, because the metric date is now persisted inside the event's window.
- Freshness therefore depends on consumption continuing to run.

## 8. Files

M5.6C:

- `supabase/migrations/20261018100000_m5_6c_metric_recompute_worker.sql`
- `lib/persistence/metric-recompute-queue.ts`
- `workers/metric-recompute-failure.ts`
- `workers/aggregate-metrics.ts`
- `app/api/internal/metric-recompute/route.ts`
- `tests/unit/m5-6c-recompute-worker.test.ts`
- `tests/unit/m5-6c-recompute-worker-architecture.test.ts`
- `tests/unit/m5-6c-failure-classification.test.ts`
- `tests/unit/m5-6c-recompute-worker.live.test.ts`
- `.env.example` (two disabled worker variables)

Frozen and unchanged:

- `lib/metrics/*`
- `lib/persistence/recompute-sku-daily-metric.ts`
- Migrations `20261015110000` through `20261016100000`

Algorithm version remains `m5-derived-metrics-v1`. Coverage identity, SA008, and the 2-second commit `lock_timeout` are unchanged.

## 9. Known operational risks

- `commit_sku_daily_metric` takes table-level SHARE locks on five source tables. While any recompute commits, source writes for all tenants wait; either side can hit the 2-second lock timeout.
- Concurrent consume calls can deadlock on request upserts (existing M5.6B behaviour). PostgreSQL aborts one; the tick counts a queue error and the events stay unconsumed for the next tick.
- Hosted events have been accumulating since M5.6A deployment. The first enabled tick will consume a backlog; consumption is bounded per tick.
- The host must allow 60-second requests. If the process is killed, its leases expire and are recovered; correctness is preserved but work is delayed.
- One-per-grain and the cap of four count unexpired leases. A process that stalls past its 120-second lease can overlap with a new claim on the same grain; metric values stay correct through the source-token check, and the stale worker is fenced.
- The claim scans at most 500 candidates per call. A very large backlog on four active grains can reduce throughput for a tick; it does not block progress.
- A crash loop can exhaust attempts and mark a request `failed` even though its metric committed; the next consumed event reopens it.

## 10. M5.6D daily rollover (implemented locally; not closed)

Migration: `supabase/migrations/20261020100000_m5_6d_metric_daily_rollover.sql` (local only).

A daily rollover that enqueues only `metric_date` equal to a store-local business day, and only for an active grain. A grain is active when at least one order item, return, or snapshot has a store-local date in that day through the preceding 89 days and a source timestamp `<= eligible_cutoff_at`. Inactive historical grains do not get a today row.

Rollover is not a substitute for consumption and must not recalculate metrics by itself. It feeds the existing `sku_daily_metric_recompute_requests` table and reuses the M5.6C claim path. There is no second work queue.

### Objects

| Object | Role |
|---|---|
| `sku_daily_metric_rollover_runs` | Resumable per-store-day progress (`in_progress` / `completed` / `failed`) |
| `sku_daily_metric_rollover_enqueues` | Enrollment ledger; one dirty bump per grain/day |
| `enqueue_sku_daily_metric_daily_rollover(limit, max_stores, organization_id, as_of)` | Bounded fair enqueue RPC |
| `sku_daily_metric_rollover_stats()` | Counts only |

Both tables enable RLS, revoke all from `public`/`anon`/`authenticated`/`service_role`, then grant `SELECT` to `service_role` only. RPCs are `security definer` with `search_path = ''`, `EXECUTE` for `service_role` only. Advisory lock `5606004`.

TypeScript: `lib/persistence/metric-rollover.ts`. Trigger: `POST /api/internal/metric-rollover`, disabled unless `METRIC_ROLLOVER_WORKER_ENABLED=1`, secret ≥ 32 chars, counts only. No scheduler.

### Progress, batching and late-event recovery

- Freeze `eligible_cutoff_at` and `metric_date` at run open.
- Walk `(location_id, variant_id)` with a durable cursor. Lookahead of `batch + 1` decides completion so exact multiples do not false-complete.
- Enrollment insert `ON CONFLICT DO NOTHING` gates `dirty_generation += 1` in the same transaction as cursor advancement.
- Drain `in_progress` runs before opening new store-days. Fairness: action class first, then least-recent `last_progress_at`, shared grain budget across up to `p_max_stores`.
- Midnight during backlog preserves the frozen older `metric_date` until completed.
- Late / backdated commerce after the cursor is **not** re-scanned by rollover. M5.6A capture inserts source events; M5.6B expansion includes store-local **clock** today when today ∈ `[D, D+89]`. Rollover `p_as_of` does not change consume’s today.

### Invalid timezone correction and recovery

- An unrecognized `stores.timezone` fails closed: run status `failed`, `fail_reason = invalid_iana_timezone`, zero enrollments and zero request dirty bumps. The failure key uses `(as_of AT TIME ZONE 'UTC')::date` only because the store zone cannot be applied.
- After the store timezone becomes a recognized IANA name, the next `enqueue_sku_daily_metric_daily_rollover` call recovers automatically:
  - If the corrected store-local `metric_date` equals the failed row’s date, that failed run is reopened as `in_progress` (cutoff refreshed, cursor cleared). No manual table writes.
  - If the corrected local date differs from the UTC-derived failure key, a new run opens for the corrected date and the old failed row remains as historical evidence.
- Only `invalid_iana_timezone` failures are reopened. Other `failed` reasons stay terminal. `completed` and healthy `in_progress` runs are unchanged.
- Enrollment uniqueness still prevents duplicate dirty-generation bumps under concurrent recovery.
- Store timezone *correction* (choosing the merchant’s real zone) remains a data-readiness concern outside M5.6D product scope; this recovery only unblocks rollover after a previously invalid value becomes valid.

### Native verification (local PG17)

| Gate | Result |
|---|---|
| M5.6D unit + architecture | pass (includes TZ recovery architecture assertions) |
| M5.6D live acceptance matrix | pass (includes invalid-TZ fail-closed, same-day recovery, UTC≠local recovery, concurrent recovery, unrelated-failure non-reopen) |
| M5.5–M5.6C + M5.6D combined | pass after TZ1 correction |
| typecheck, lint, `git diff --check`, `npm run build` | pass |

Hosted M5.6D **schema deployed**; E.4 Stage 4 exercised org-scoped rollover on the canary only. Rollover HTTP trigger **disabled**. No scheduler. M5.6D is **not closed**.

Out of scope unless a later milestone opens it: CSV reconciliation changes, purchase-order incoming quantity, inventory position, inventory age, forecasting, decisions, AI, billing, connectors, merchant UI, and store timezone correction as a merchant data product.

## 11. Verification evidence (M5.6C)

M5.6C is **closed** for local implementation and verification.

### Native local Supabase (authoritative closeout)

Native local stack: Supabase PostgreSQL **17.11**, PostgREST, auth. Database port `55322`, API `http://127.0.0.1:55321`. Migration `20261018100000` was applied to this local database for verification (additive; no `db reset` required once M5.6B was present). Hosted Supabase was not modified.

| Gate | Result |
|---|---|
| M5.6C unit tests (3 files) | 40 passed |
| M5.5 + M5.6A + M5.6B + M5.6C live, one Vitest command, native PG17 | 36 passed |
| `npx tsc --noEmit` | pass |
| `npx eslint .` | pass |
| `git diff --check` | pass |
| `npm run build` (Turbopack) | pass; `/api/internal/metric-recompute` is a dynamic route |

Still true after closeout, hosted schema deploy, and E.4 Stage 3:

- Hosted M5.6C **schema deployed**; HTTP worker **disabled** (`METRIC_RECOMPUTE_WORKER_ENABLED` not `1`)
- No scheduler / no `vercel.json`
- Hosted one-shot canary recompute verified (E.4 Stage 3); do not treat as worker enablement
- Hosted org-scoped rollover verified on canary (E.4 Stage 4); do not treat as M5.6D close or HTTP rollover enablement
- M5.6E.4 **CLOSED** (canary only)
- M5.7 **CLOSED** locally only (section 12); hosted F1/T4 schema applied and verified; workers still disabled

### Earlier shim evidence (historical)

Before native verification, an implementing environment ran the same suites against PostgreSQL 16 with Supabase role shims (40 unit, 36 live, typecheck/lint, webpack build with mocked fonts). That shim evidence is superseded by the native closeout above for milestone closure.

The M5.6C live suite refuses to run if claimable or active requests exist outside its own test tenants, because claims are global.

## 12. M5.7 adversarial verification (CLOSED — local engineering only)

Baseline at local closeout: `main` @ `312bd9c`.

**Scope closed:** local adversarial architecture audit, corrective migrations on local PostgreSQL 17, concurrency/containment tests, and single-flight worker defaults in application code on `main`.

**Scope not closed / not authorized by this section:** hosted worker or rollover HTTP enablement, hosted metric-worker runtime verification, cron/scheduler, draining the E.4 canary `queued` dirty=2 request, or marking M5.6D closed. Hosted F1/T4 **schema** deploy is recorded below and does **not** authorize those runtime steps.

### Local vs hosted

| Layer | State |
|---|---|
| Local adversarial engineering (Phases 1–5B) | **Closed** |
| Hosted schema through M5.6E.3 (`20261028100000`) | Deployed (prior operator verification) |
| Hosted M5.7 F1 (`20261028210000`) | **APPLIED AND VERIFIED ON HOSTED** |
| Hosted M5.7 T4 (`20261028220000`) | **APPLIED AND VERIFIED ON HOSTED** |
| Hosted F1/T4 grant/definer checks | Both claim/complete paths `SECURITY DEFINER=true`, `search_path=""`; `service_role` EXECUTE only; `anon` / `authenticated` / `PUBLIC` denied |
| Workers / cron / HTTP metric routes | **DISABLED** |
| Hosted worker/runtime activation | **Unauthorized** (separate from schema deploy) |
| M5.6D milestone | **NOT CLOSED** |
| E.4 canary final queue | Intentionally `queued` at `dirty_generation=2`, `claimed_generation=1`, `applied_generation=1`, `attempt_count=0`, lease fields cleared; do not drain for this closeout |

### Phase outcomes

1. **Phase 1 — Architecture audit.** READ-ONLY review of M5.6 recompute/rollover claim, lease fencing, generation rules, and commit locking. High findings: F1 deferred completions burned `attempt_count`; F2 table SHARE holds create cross-tenant writer lock-wait risk; Medium: T4 busy-grain claim starvation under `LIMIT 500`.

2. **Phase 2 — F1 deferred-attempt correction.** Migration `supabase/migrations/20261028210000_m5_7_deferred_completion_attempt_reset.sql` sets `attempt_count = 0` on deferred completion after fencing/supersession checks. Commit `a23d37f`.

3. **Phase 3 / 3B — Adversarial concurrency and T4 fix.** Live tests cover busy-grain exclusion, SHARE contention observation (`55P03`), SA008 stale-token fencing, and related isolation cases. Migration `supabase/migrations/20261028220000_m5_7_claim_busy_grain_exclusion.sql` excludes busy grains before the claim `LIMIT`. Commit `5db70f7`.

4. **Phase 4 — F2 SHARE decision.** **Keep** the existing five-table SHARE locks plus SA008 source-token revalidation. Do not replace with SERIALIZABLE, row-only locks, or grain advisory locks without an equivalence proof. Prefer bounded execution/observability (Phase 5).

5. **Phase 5A / 5B — Single-flight containment.** Defaults `maxActive=1` and `claimLimit=1` in `METRIC_RECOMPUTE_WORKER_SETTINGS`; optional env `METRIC_RECOMPUTE_MAX_ACTIVE` / `METRIC_RECOMPUTE_CLAIM_LIMIT` accept only integers `1`–`4` and fail closed. HTTP route wires those settings; activation gates unchanged. Commit `312bd9c`. Local Phase 5B validation included containment adversarial tests C1–C7 plus related M5.6/M5.7 regression (122 reported tests), TypeScript, ESLint, and `git diff --check`.

Tests (local): `tests/unit/m5-7-deferred-attempt-reset-architecture.test.ts`, `tests/unit/m5-7-claim-busy-grain-exclusion-architecture.test.ts`, `tests/unit/m5-7-adversarial-concurrency.live.test.ts`, `tests/unit/m5-7-f2-containment-architecture.test.ts`, `tests/unit/m5-7-f2-containment.live.test.ts`.

## 13. Next steps for Cursor

1. Confirm branch `main` at `312bd9c` (includes M5.7 local closeout commits through Phase 5B). Hosted M5.7 F1/T4 schema is applied and verified; that is not runtime enablement.
2. Do not enable workers/rollover, configure a scheduler, consume hosted events, or recompute hosted metrics without separate explicit approval.
3. **Next:** M5.6D independent acceptance review (section 10). Do not mark M5.6D closed without explicit approval after review.
4. In parallel or after M5.6D review: hosted operational-readiness planning (containment defaults, secrets, kill switch, backlog sizing) — still not authorization to enable HTTP.
5. When M5.6C **runtime** enablement is later approved (separate from this closeout):
   1. Reconfirm hosted F1/T4 remain applied.
   2. Confirm containment defaults (`maxActive=1` / `claimLimit=1`) or approved env overrides.
   3. Read `sku_daily_metric_recompute_queue_stats` (read-only) to size the backlog.
   4. Set a secret of at least 32 characters.
   5. Set `METRIC_RECOMPUTE_WORKER_ENABLED=1` only under explicit approval.
   6. Trigger manually and inspect the counts.
   7. Only then consider a scheduler under further approval.
6. M5.6D hosted **runtime** enablement remains a separate approval after recompute enablement policy is clear.
7. Do not drain the E.4 canary grain left `queued` at `dirty_generation=2` as closeout work.
8. Never stage `docs/StoreAgent_Roadmap_2026.docx`, `docs/StoreAgent_Master_Roadmap_2026_Updated_7_Day_Trial.docx`, `docs/StoreAgent_Roadmap_2026_Connectivity_Update.docx`, or `docs/archive/`.

Live order tests share advisory lock `561606` (`tests/support/orders-live-lock.ts`). Run the M5.5, M5.6A, M5.6B, M5.6C, and M5.6D live files in one Vitest command when verifying the full chain.
