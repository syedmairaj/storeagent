# M5.6 development handoff

Resume from this file. Canonical milestone state remains `docs/IMPLEMENTATION_STATUS.md`.

## 1. Verified baseline

- Repository: StoreAgent.si
- Branch: `main`
- HEAD: `118d9b511070d3f690d1852478230cb61b6d2527` (`118d9b5 feat(metrics): close M5.6B durable recompute requests`)
- M5.6A commit: `b549fe0b78173acc9a5e75e115866a135fbbcf65` (`b549fe0`)
- M5.5 persistence commit: `6dc4ed249ddc32e278452e8b608c007c0567c01b` (`6dc4ed2`)

Hosted Supabase migration history matches local history for the M5.6 slices:

- `20261015140000` — M5.6A deployed
- `20261016100000` — M5.6B deployed

M5.5 hosted migrations `20261015110000`, `20261015120000`, and `20261015130000` remain deployed. This handoff did not recompute merchant data or consume hosted events.

## 2. Completed milestone summary

M0 through M5.5 are closed.

M5.6 is in progress and is not fully closed.

- M5.6A source-event capture — closed
- M5.6B event consumption and recompute-request generation — closed
- M5.6C worker orchestration — not started
- M5.6D daily rollover — not started

Next implementation is M5.6C. It must not start until explicitly requested.

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

`public.consume_sku_daily_metric_source_events(p_limit integer, p_organization_id uuid default null)` runs only when invoked. Deploying it does not start a worker.

In the caller’s transaction it:

1. Locks rows where `consumed_at is null`, ordered by `event_id`, with `for update skip locked`, up to `p_limit`. A non-null organization id limits the batch to that tenant.
2. Expands each source date `D` to affected metric dates.
3. Inserts one request per natural key, or adds the distinct event count to `dirty_generation`.
4. Sets `consumed_at` on those same locked events.

Expansion, and only these dates:

- `D` itself
- Store-local today, when today is inside `D` through `D + 89`
- Already persisted `sku_daily_metrics` dates for the same grain and algorithm version inside that inclusive window

Today uses the store’s current timezone at consume time. Stored `source_date` is not recomputed. Missing intermediate dates and dates after `D + 89` are not created. A future `D` produces that one date unless a persisted row already exists in its window.

A running or claimed request keeps its status, attempt count, and lease while `dirty_generation` increases. `claimed_generation` and `applied_generation` are unchanged. Succeeded, failed, cancelled, and `retry_wait` rows return to `queued`, with the attempt count reset and the lease cleared.

Creating or updating a request does not prove the metric is current.

## 5. Tables, functions, and migrations

M5.6A — `supabase/migrations/20261015140000_m5_6a_metric_source_events.sql`

- Table `public.sku_daily_metric_source_events`
- Functions: `capture_order_metric_source_events`, `capture_order_item_insert_metric_source_events`, `capture_order_item_update_metric_source_events`, `capture_order_item_delete_metric_source_events`, `capture_return_refund_insert_metric_source_events`, `capture_return_refund_update_metric_source_events`, `capture_return_refund_delete_metric_source_events`, `capture_inventory_snapshot_metric_source_events`
- Triggers on `orders`, `order_items`, `return_refunds`, and inventory-snapshot insert

M5.6B — `supabase/migrations/20261016100000_m5_6b_metric_recompute_requests.sql`

- Table `public.sku_daily_metric_recompute_requests`
- Function `public.consume_sku_daily_metric_source_events(integer, uuid)`

Frozen M5.5 calculation entry points, not to be edited:

- `public.sku_daily_metric_source_snapshot`
- `public.commit_sku_daily_metric`
- `lib/metrics/sku-daily-metric-record.ts`
- `lib/persistence/recompute-sku-daily-metric.ts`

Tests:

- `tests/unit/m5-6a-source-events.test.ts`
- `tests/unit/m5-6a-source-events.live.test.ts`
- `tests/unit/m5-6b-recompute-requests.test.ts`
- `tests/unit/m5-6b-recompute-requests.live.test.ts`
- `tests/support/orders-live-lock.ts`

## 6. Invariants

Generation. Each newly consumed event adds one to `dirty_generation` for every metric date it expands to. Distinct historical source dates stay independent. A newer generation is not cleared by an older in-flight claim.

Atomicity. Event consumption and request writes commit or roll back together. A crash or rollback leaves the events unconsumed.

Tenancy. Request rows copy the event’s organization, store, location, and variant. An organization-scoped consume does not write another tenant’s requests. `service_role` may pass a null organization id and then process every tenant; that role is trusted infrastructure, not a merchant path.

Event ordering. Unconsumed rows are selected independently. A later `event_id` may commit first and be consumed first. The earlier event remains unconsumed until a later call locks it. Do not use `max(event_id)` or a sequence cursor.

Security. Both new tables enable row level security and have no merchant policies. `anon` and `authenticated` have no access. `service_role` has `SELECT` on both tables and `EXECUTE` on the consume and capture functions. Capture and consume functions are `security definer` with an empty `search_path`. `service_role` bypasses row level security and still has no direct insert or update grant on these tables.

Worker vocabulary. Request status is `queued`, `claimed`, `running`, `retry_wait`, `succeeded`, `failed`, or `cancelled`. Lease columns match `workers/types.ts`: owner, claim token, claimed time, and expiry. `attempt_count` matches the worker lifecycle field. There is no second worker framework and no `worker_jobs` table.

## 7. Deployed versus operational

Deployed means the migrations are in local and hosted migration history.

Operational means a process claims requests and recalculates metrics. That process does not exist.

Hosted capture triggers can append events when hosted source rows change. Hosted consumption does not run unless something calls `consume_sku_daily_metric_source_events`. This handoff does not claim that accumulated hosted events have been consumed. Hosted `sku_daily_metrics` rows are not automatically recalculated.

## 8. M5.6C must implement

Claim `sku_daily_metric_recompute_requests` and execute the frozen M5.5 recompute for that grain and metric date.

Use the existing status, lease, retry, and idempotency contracts:

- Copy `claimed_generation` at claim.
- Advance `applied_generation` only when the claim token still matches, `dirty_generation` still equals `claimed_generation`, and no relevant unconsumed source event is visible.
- Do not mark a running request complete because generation succeeded earlier.
- Keep lock order: relevant unconsumed events by `event_id`, then the request row, then the frozen M5.5 `SHARE` locks inside `commit_sku_daily_metric`.
- Retry `transient_dependency`, `rate_limited`, `timeout`, and `lease_expired` under `workers/retry.ts` (`maxAttempts` 5, base delay 30 seconds, max delay 30 minutes).
- Keep the existing `SA008` retries inside one claim. `lib/persistence/recompute-sku-daily-metric.ts` allows 3 source-read attempts. Those retries must not increment the queue `attempt_count`.
- Include the claimed generation in the idempotency operation key so `workers/idempotency.ts` does not treat a new generation as a duplicate terminal job. Job type is `metrics_aggregation`.
- Stop at metrics. `workers/pipeline.ts` still knows later stages. M5.6C must not call forecast, decision, or AI.

Do not add a second queue. Do not edit M5.5 formulas or the M5.5 migrations.

## 9. M5.6D must implement

A daily rollover that enqueues only `metric_date` equal to store-local today, and only for an active grain.

A grain is active when at least one order item, return, or snapshot has a store-local date in today through the preceding 89 days. Inactive historical grains do not get a today row from rollover.

Newly imported facts do not wait for rollover. M5.6B expansion already enqueues `D` when `D` is on or before today, plus today when today falls in the window. A future source date remains the single future request from M5.6B.

Rollover is not a substitute for consumption, and it must not recalculate metrics by itself.

## 10. Exclusions and frozen M5.5 boundaries

Do not change:

- `lib/metrics/inventory-math.ts`
- `lib/metrics/sales-aggregates.ts`
- `lib/metrics/inventory-aggregates.ts`
- `lib/metrics/sku-daily-metric-record.ts`
- `lib/persistence/recompute-sku-daily-metric.ts`
- Migrations `20261015110000`, `20261015120000`, `20261015130000`, `20261015140000`, and `20261016100000`

Algorithm version remains `m5-derived-metrics-v1`. Coverage identity, `SA008`, and the 2-second commit `lock_timeout` stay as deployed. A lock timeout is not `SA008`.

Out of scope for M5.6C and M5.6D unless a later milestone explicitly opens them: CSV reconciliation changes, purchase-order incoming quantity, inventory position, inventory age, forecasting, decisions, AI, billing, connectors, and merchant UI.

Ordinary `stores.timezone` edits are not a metric rewrite. Already stored `source_date` values stay as captured.

## 11. Known risks and unresolved decisions

- Hosted events can accumulate with `consumed_at` null. No scheduler calls the consume function.
- A queued request can be stale before a worker exists, and a succeeded request becomes stale when a newer event is consumed.
- `commit_sku_daily_metric` takes table-level `SHARE` locks. Concurrent source writes can hit the 2-second lock timeout.
- Location and variant hard delete is restricted while an event or request row exists. Archival is a status change. Tests must delete source rows, then events and requests, then parent rows. Deleting an order item recreates an event.
- Live order tests share `tests/support/orders-live-lock.ts` key `561606`. The lock must be released with SQL on the same session.
- One in-flight claim per grain and a global cap of four recomputes were discussed for M5.6C and are not implemented. M5.6C still needs an explicit concurrency bound before it runs against hosted data.
- Whether M5.6C consumption is global or organization-scoped on each poll is an implementation choice. The function already accepts either form.
- Store timezone correction remains a separate controlled operation. It is not part of M5.6C or M5.6D.

## 12. Test commands and verification gates

Focused tests:

```bash
npx vitest run tests/unit/m5-6a-source-events.test.ts tests/unit/m5-6b-recompute-requests.test.ts
```

Local live database tests, with the local Supabase database already running:

```bash
RUN_SUPABASE_LIVE=1 npx vitest run \
  tests/unit/m5-6a-source-events.live.test.ts \
  tests/unit/m5-6b-recompute-requests.live.test.ts \
  tests/unit/m5-persistence.live.test.ts
```

Run the M5.6A, M5.6B, and M5.5 live files in one Vitest command when they might overlap. They share the orders advisory lock.

Gates for a later M5.6C or M5.6D change:

```bash
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Do not apply hosted migrations, consume hosted events, or recompute hosted merchant metrics as part of reading this handoff.

## 13. Next-session startup checklist

1. Confirm branch `main` and HEAD `118d9b511070d3f690d1852478230cb61b6d2527`, unless a later commit says otherwise.
2. Read this file, `docs/IMPLEMENTATION_STATUS.md`, `docs/SERVICE_ROLE_BOUNDARY.md` section 17, and `docs/BACKGROUND_JOBS.md` section “M5.6 metric recompute requests”.
3. Treat M5.5, M5.6A, and M5.6B migrations as frozen.
4. Start M5.6C only after an explicit request. Do not start M5.6D inside that same change unless asked.
5. Do not call `consume_sku_daily_metric_source_events` against the hosted project during implementation.
6. Do not stage `docs/StoreAgent_Roadmap_2026.docx`, `docs/StoreAgent_Roadmap_2026_Connectivity_Update.docx`, or `docs/archive/`.
