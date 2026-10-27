# M5.6 development handoff

Resume from this file. Canonical milestone state remains `docs/IMPLEMENTATION_STATUS.md`.

## 1. Baseline

- Repository: StoreAgent.si
- Branch: `main`
- Last commit before M5.6C: `8c2af57fdda45a4dad67548ba4fad1f664b2d687` (`docs: sync M5.6A-B closeout and M5.6C handoff`)
- M5.6B commit: `118d9b511070d3f690d1852478230cb61b6d2527` (`118d9b5`)
- M5.6A commit: `b549fe0b78173acc9a5e75e115866a135fbbcf65` (`b549fe0`)
- M5.5 persistence commit: `6dc4ed249ddc32e278452e8b608c007c0567c01b` (`6dc4ed2`)

Hosted Supabase migration history matches local history up to M5.6B:

- `20261015110000`, `20261015120000`, `20261015130000` — M5.5, deployed
- `20261015140000` — M5.6A, deployed
- `20261016100000` — M5.6B, deployed
- `20261018100000` — M5.6C, **local only, not deployed**

No hosted events have been consumed and no hosted metrics have been recalculated by any M5.6 work.

## 2. Milestone state

| Milestone | State |
|---|---|
| M0 – M5.5 | Closed |
| M5.6A source-event capture | Closed; hosted migration deployed |
| M5.6B recompute-request generation | Closed; hosted migration deployed |
| M5.6C worker orchestration | Implemented; verified locally on a PostgreSQL role shim only (see section 11); hosted migration not deployed; worker not enabled; not closed |
| M5.6D daily rollover | Not started |

M5.6C must not be labelled closed until it passes native local Supabase verification and is reviewed. Deployment and enablement are separate, explicitly approved steps.

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

## 10. M5.6D (not started)

A daily rollover that enqueues only `metric_date` equal to store-local today, and only for an active grain. A grain is active when at least one order item, return, or snapshot has a store-local date in today through the preceding 89 days. Inactive historical grains do not get a today row.

Rollover is not a substitute for consumption and must not recalculate metrics by itself. It should feed the existing request table and reuse the M5.6C claim path. Do not add a second queue.

Out of scope for M5.6D unless a later milestone opens it: CSV reconciliation changes, purchase-order incoming quantity, inventory position, inventory age, forecasting, decisions, AI, billing, connectors, merchant UI, and store timezone correction.

## 11. Verification evidence (M5.6C)

Local Supabase (PostgreSQL 17, PostgREST, auth) was **not** reachable from the environment that implemented M5.6C. Live tests ran against **PostgreSQL 16 with Supabase role shims**: `anon`, `authenticated`, `service_role` with BYPASSRLS, a minimal `auth` schema, and Supabase-style default privileges. This is not equivalent to native Supabase verification.

| Gate | Result |
|---|---|
| M5.6C unit tests (3 files) | 40 passed |
| M5.5 + M5.6A + M5.6B + M5.6C live, one command, shim | 36 passed |
| M5 and worker non-live suites | 335 passed |
| Full suite, non-live | 1899 passed; 1 file fails: `provider-csv-supabase-persistence.live.test.ts`, which needs Supabase env keys |
| Full suite, live on shim | 1944 passed; 4 files fail identically on untouched `8c2af57`, because they need the native Supabase HTTP API or auth schema |
| `npx tsc --noEmit` | pass |
| `npx eslint .` | pass |
| `git diff --check` | pass |
| `npm run build` (Turbopack) | **not verified**: the environment cannot reach Google Fonts (`next/font` Inter) |
| `next build --webpack` with mocked Google Fonts | pass; Next.js type check pass; `/api/internal/metric-recompute` is a dynamic route |

The M5.6C live suite refuses to run if claimable or active requests exist outside its own test tenants, because claims are global.

## 12. Next steps for Cursor

1. Confirm branch `main`. If M5.6C has been committed, start from that commit; otherwise from `8c2af57` plus the uncommitted M5.6C files listed in section 8.
2. Start the native local stack (`supabase start`, database port 55322), then reset it with `supabase db reset`. The database must contain migration `20261018100000`.
3. Run native verification:

   ```bash
   npx vitest run tests/unit/m5-6c-recompute-worker.test.ts tests/unit/m5-6c-recompute-worker-architecture.test.ts tests/unit/m5-6c-failure-classification.test.ts
   RUN_SUPABASE_LIVE=1 npx vitest run \
     tests/unit/m5-6a-source-events.live.test.ts \
     tests/unit/m5-6b-recompute-requests.live.test.ts \
     tests/unit/m5-persistence.live.test.ts \
     tests/unit/m5-6c-recompute-worker.live.test.ts
   RUN_SUPABASE_LIVE=1 npm test
   npx tsc --noEmit && npm run lint && npm run build && git diff --check
   ```

4. Record the native results in `docs/IMPLEMENTATION_STATUS.md` and this file. Only then consider marking M5.6C closed.
5. Do not deploy the M5.6C migration, enable the worker, configure a scheduler, consume hosted events, or recompute hosted metrics without separate explicit approval.
6. When enablement is approved, follow this order:
   1. Apply the migration.
   2. Read `sku_daily_metric_recompute_queue_stats` (read-only) to size the backlog.
   3. Set a secret of at least 32 characters.
   4. Set `METRIC_RECOMPUTE_WORKER_ENABLED=1`.
   5. Trigger manually and inspect the counts.
   6. Only then add a scheduler.
7. Start M5.6D only on explicit request, using section 10.
8. Never stage `docs/StoreAgent_Roadmap_2026.docx`, `docs/StoreAgent_Master_Roadmap_2026_Updated_7_Day_Trial.docx`, `docs/StoreAgent_Roadmap_2026_Connectivity_Update.docx`, or `docs/archive/`.

Live order tests share advisory lock `561606` (`tests/support/orders-live-lock.ts`). Run the M5.5, M5.6A, M5.6B, and M5.6C live files in one Vitest command.
