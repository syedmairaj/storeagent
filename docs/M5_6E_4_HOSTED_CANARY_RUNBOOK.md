# M5.6E.4 — Hosted Canary Runbook (Final Safety)

**HARD RULE:** No hosted operation may `ALTER TABLE … DISABLE/ENABLE TRIGGER` (table-wide). Hosted fixture SQL is INSERT-only.

**Milestone status:** M5.6E.4 **CLOSED** for **hosted canary verification only** (Stages 0–4). This does **not** authorize production HTTP workers, cron, or M5.6D milestone closure.

---

## 0. Verdict

| Call | Scope |
|---|---|
| **CLOSED (hosted canary)** | Stages 0–4 complete — see §0.2 / §0.3 / §8 |
| **NO-GO** | Worker ENABLE, cron, HTTP `/api/internal/metric-*`, null-org RPCs, hosted trigger-toggle teardown, further Stage 3/4 mutate without new approval |
| **NOT CLOSED** | M5.6D milestone; production worker/rollover enablement |

Global workers / cron / internal metric routes remain **OFF**. Stage 3 execute authorization revoked; runner in preflight mode. Final canary queue `queued` / `dirty_generation=2` is **intentional** after Stage 4 enrollment — **do not** claim/recompute that dirtied row as part of E.4 closeout.

### 0.1 Expected metric values (from fixture) — **VERIFIED**

Source: `scripts/m5-6e4/canary-fixture-hosted-create.sql` — one inventory snapshot only (`available_quantity = 7` at `2026-06-15T12:00:00+00`); **no** orders, order items, or returns.

| Column | Expected | Hosted result |
|---|---|---|
| `units_sold` | **0** | **0** |
| `net_units_sold` | **0** | **0** |
| `available_quantity` | **7** | **7** |

```sql
select units_sold, net_units_sold, available_quantity, algorithm_version
from public.sku_daily_metrics
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid
  and store_id = 'e46e4000-0000-4000-8000-000000000002'::uuid
  and location_id = 'e46e4000-0000-4000-8000-000000000003'::uuid
  and variant_id = 'e46e4000-0000-4000-8000-000000000005'::uuid
  and metric_date = '2026-06-15'
  and algorithm_version = 'm5-derived-metrics-v1';
-- VERIFIED: 0, 0, 7, m5-derived-metrics-v1
```

### 0.2 Stage 3 completion evidence (operator-verified)

| Check | Result |
|---|---|
| Stage 3 preflight Vitest | 3/3 PASS |
| Stage 3 one-shot execute Vitest | 3/3 PASS; `completion=succeeded` |
| Request status | `succeeded` |
| Generations | `dirty_generation=1`, `claimed_generation=1`, `applied_generation=1` |
| Attempt count | `1` |
| Lease fields | owner, token, and expiry **cleared** |
| Metrics | `units_sold=0`, `net_units_sold=0`, `available_quantity=7` |
| Foreign-tenant fingerprint | unchanged: `59d7d64dbcc254544f04cdb81ccff699` |
| Post-execute ops | `M56E4_STAGE3_EXECUTE_OK` removed; `M56E4_STAGE3_MODE=preflight`; workers/cron/internal routes still disabled |

Do **not** re-execute Stage 3 against this grain without a new approved claim path.

### 0.3 Stage 4 completion evidence (operator-verified)

Both enqueue calls used frozen `as_of = 2026-06-15T12:00:00+00` and explicit canary `p_organization_id`.

| Check | Result |
|---|---|
| First rollover | `storesSelected=1`, `runsOpened=1`, `runsCompleted=1`, `runsFailed=0`, `grainsEnrolled=1` |
| Second rollover | `storesSelected=0`, `runsOpened=0`, `runsCompleted=0`, `runsFailed=0`, `grainsEnrolled=0` (idempotent; completed run no longer actionable) |
| Final request status | `queued` |
| Final generations | `dirty_generation=2`, `claimed_generation=1`, `applied_generation=1` |
| Final attempt_count | `0` |
| Lease fields | all cleared |
| Metrics (unchanged by rollover) | still `0` / `0` / `7` |
| Foreign-tenant fingerprint | unchanged: `59d7d64dbcc254544f04cdb81ccff699` |
| Workers / cron / HTTP metric routes | still disabled |

**Intentional post-Stage-4 queue state:** enrollment bumped `dirty_generation` 1→2 and requeued the grain. E.4 closeout **stops here** — no additional recompute/claim.

---

## 1. SQL assets (separated)

| File | Hosted? | Contents |
|---|---|---|
| `scripts/m5-6e4/canary-fixture-hosted-create.sql` | **YES** | INSERT-only; fails if canary org exists; **no** trigger changes, DELETE, TRUNCATE |
| `scripts/m5-6e4/canary-fixture-local-teardown.sql` | **NO — LOCAL ONLY** | Deletes canary rows; briefly disables snapshot delete trigger (**table-wide**) |
| `scripts/m5-6e4/canary-fixture.sql` | **NO — LOCAL ONLY** | `\ir` teardown then hosted-create wrapper |

Fixed identity / clock: org `e46e4000-…0001` … variant `…0005`; `as_of` = `2026-06-15T12:00:00+00`; metric date `2026-06-15`; TZ `UTC`.

Runner: `lib/canary/m5-6e4-single-grain-recompute.ts` — requires approval phrase `M5_6E4_CANARY_APPROVED`, expected org, grain, owner, claim token, **and claimed_generation**; rejects mismatches.

Stage 3 one-shot: `lib/canary/m5-6e4-stage3-oneshot.ts` — fail-closed unless `M56E4_HOSTED_SUPABASE_URL` is `https://qlsqminsfdntpqdkhxjx.supabase.co`; credentials from process env only (never `.env.local` / `createSupabaseAdminClient`); never enables workers or HTTP worker routes.

---

## 2. Stage boundaries (hosted)

Each stage ends with an **evidence review**. Do not start the next stage without recorded PASS.

### Stage 0 — Preflight (SELECT-only)

```sql
-- Migrations A–D + E.3 present
select version from supabase_migrations.schema_migrations
where version in (
  '20261015140000','20261016100000','20261018100000',
  '20261020100000','20261028100000'
) order by 1;

-- Org-scoped claim signature present; no old overload
select proname, pg_get_function_identity_arguments(oid)
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'claim_sku_daily_metric_recompute_requests',
    'consume_sku_daily_metric_source_events',
    'enqueue_sku_daily_metric_daily_rollover'
  );

select count(*) filter (where consumed_at is null) as unconsumed
from public.sku_daily_metric_source_events;
-- EXPECT: 0

select count(*) as active_leases
from public.sku_daily_metric_recompute_requests
where status in ('claimed','running')
  and lease_expires_at > clock_timestamp();
-- EXPECT: 0

select count(*) as foreign_claimable
from public.sku_daily_metric_recompute_requests
where organization_id <> 'e46e4000-0000-4000-8000-000000000001'::uuid
  and status in ('queued','claimed','running','retry_wait');
-- EXPECT: 0 (or document + STOP if unexpected)

select count(*) as canary_org_exists
from public.organizations
where id = 'e46e4000-0000-4000-8000-000000000001'::uuid;
-- EXPECT: 0 before first create
```

**Ops:** `METRIC_RECOMPUTE_WORKER_ENABLED` ≠ `1`; `METRIC_ROLLOVER_WORKER_ENABLED` ≠ `1`; no scheduler/cron; no `vercel.json`.

**Capture `FINGERPRINT_BEFORE`** using `foreignPipelineFingerprintSql` from `tests/support/m5-6e4-canary-fixture.ts` (covers foreign requests, metrics, rollover runs, enrollments, **and** source events).

**Evidence review 0:** migrations OK; leases 0; workers OFF; fingerprint recorded; canary org absent.

---

### Stage 1 — Fixture creation (first hosted write)

```bash
psql "$HOSTED_URL" -v ON_ERROR_STOP=1 \
  -f scripts/m5-6e4/canary-fixture-hosted-create.sql
```

**FORBIDDEN here:** local teardown file; `DISABLE TRIGGER`; any DELETE/TRUNCATE.

**Expect:** `fixture_org=1`, `unconsumed_events=1`, `frozen_as_of=2026-06-15T12:00:00+00`.

**Evidence review 1:**
- Canary org/store/location/variant/snapshot exist
- Exactly one unconsumed canary event `source_date=2026-06-15`
- `FINGERPRINT_AFTER_CREATE` == `FINGERPRINT_BEFORE`
- Snapshot delete trigger still enabled:

```sql
select tgenabled
from pg_trigger
where tgname = 'inventory_snapshots_prevent_delete';
-- EXPECT: enabled (O = origin/enabled in pg_trigger.tgenabled)
```

**STOP** if fingerprint changed or trigger disabled.

---

### Stage 2 — Consume / claim (org-scoped RPCs only)

```sql
select public.consume_sku_daily_metric_source_events(
  10, 'e46e4000-0000-4000-8000-000000000001'::uuid
);
-- EXPECT >= 1; second call EXPECT 0

select * from public.claim_sku_daily_metric_recompute_requests(
  'm56e4-hosted-canary', 1, 120, 4,
  'e46e4000-0000-4000-8000-000000000001'::uuid
);
-- EXPECT 1 row; organization_id = canary; metric_date = 2026-06-15
```

Record owner, token, claimed_generation, full grain.

**Evidence review 2:** claimed org = canary; foreign fingerprint unchanged; no foreign claimable/active rows introduced by canary.

---

### Stage 3 — Recompute / complete (one-shot only)

**HARD RULES**

- No `METRIC_*_WORKER_ENABLED=1`, no cron, no `/api/internal/metric-*`.
- Do **not** edit `.env.local`. Supply credentials only for this process via `M56E4_HOSTED_*`.
- Default mode is `preflight` (SELECT + verify only). `execute` mutates only after lease is proven unexpired.
- Treat leases as expired unless a fresh DB check proves `lease_expires_at > now()`.

#### 3a. Credentials (process env only)

```bash
# Paste into the current shell only. Never echo / commit the key or claim token.
export M56E4_HOSTED_SUPABASE_URL='https://qlsqminsfdntpqdkhxjx.supabase.co'
export M56E4_HOSTED_SERVICE_ROLE_KEY='…'   # hosted service_role for qlsqminsfdntpqdkhxjx
export M56E4_CANARY_APPROVAL='M5_6E4_CANARY_APPROVED'
export M56E4_EXPECTED_OWNER='m56e4-hosted-canary'
export M56E4_CLAIM_TOKEN='…'               # fresh claim token only (never reuse disclosed)
export M56E4_CLAIMED_GENERATION='1'
export M56E4_STAGE3_MODE='preflight'
export M56E4_STAGE3_RUN='1'
# After any token disclosure, revoke it (blocks preflight + execute):
# export M56E4_REVOKED_CLAIM_TOKENS='…disclosed…'
# Optional: M56E4_PREFLIGHT_TIMEOUT_MS=30000 M56E4_NETWORK_TIMEOUT_MS=10000
```

#### 3b. Preflight (required, read-only)

Uses `runM56E4Stage3PreflightOnlyFromEnv` (SELECT + verify only). Vitest timeout is **30s**; per-request network timeout is **10s**. This path cannot call start/complete/recover/claim/recompute even if `M56E4_STAGE3_MODE=execute` is set.

```bash
export M56E4_STAGE3_MODE='preflight'
export M56E4_STAGE3_RUN='1'
# unset execute gates so they cannot be confused with preflight:
unset M56E4_STAGE3_EXECUTE_OK
npx vitest run tests/unit/m5-6e4-stage3-oneshot.hosted.test.ts
```

**Expect:** JSON summary with `supabaseUrl` pinned, `serviceRole` / `claimToken` as `{ present, length }` only, canary org/grain match, `leaseExpired` reported, `completion: null`.

If `leaseExpired: true` **or** token was disclosed → **STOP**. Do not execute. Follow **§7 org-scoped recover / reclaim**, set `M56E4_REVOKED_CLAIM_TOKENS` to the disclosed token, then re-claim and re-run preflight with the **new** token/generation.

#### 3c. Execute (only after preflight PASS + unexpired + non-revoked lease)

Requires **both** `M56E4_STAGE3_MODE=execute` and `M56E4_STAGE3_EXECUTE_OK=STAGE3_EXECUTE_APPROVED`.

```bash
export M56E4_STAGE3_MODE='execute'
export M56E4_STAGE3_EXECUTE_OK='STAGE3_EXECUTE_APPROVED'
npx vitest run tests/unit/m5-6e4-stage3-oneshot.hosted.test.ts
```

Under the hood: SELECT verify → `start` → frozen `recomputeSkuDailyMetric` → `complete` via `runM56E4SingleGrainCanaryRecompute` (exact approval, owner, token, generation, org, grain).

Then optional re-complete → expect `fenced`.

**Evidence review 3:** **PASSED** (see §0.2). Request `succeeded`; `applied_generation = claimed_generation = 1`; metrics **0/0/7**; foreign fingerprint `59d7d64dbcc254544f04cdb81ccff699` unchanged; workers OFF; execute auth revoked.

---

### Stage 4 — Rollover (fixed as_of twice) — **PASSED**

Executed twice with frozen `as_of` and canary org scope. Evidence: §0.3.

```sql
-- Historical commands (already executed; do not re-run for closeout)
select public.enqueue_sku_daily_metric_daily_rollover(
  20, 1,
  'e46e4000-0000-4000-8000-000000000001'::uuid,
  '2026-06-15T12:00:00+00'::timestamptz
);
-- VERIFIED first: storesSelected=1; runsOpened=1; runsCompleted=1; runsFailed=0; grainsEnrolled=1

select public.enqueue_sku_daily_metric_daily_rollover(
  20, 1,
  'e46e4000-0000-4000-8000-000000000001'::uuid,
  '2026-06-15T12:00:00+00'::timestamptz
);
-- VERIFIED second: storesSelected=0; runs*/grainsEnrolled=0; dirty_generation remained 2
```

**Final evidence review:** **PASSED** — fingerprint `59d7d64dbcc254544f04cdb81ccff699`; enrollment idempotency OK; workers still OFF; final queue `queued` / dirty `2` intentional.

---

## 3. Stop conditions (any stage)

1. Hosted SQL containing `DISABLE TRIGGER` / `ENABLE TRIGGER` / `TRUNCATE` / unscoped DELETE
2. Null `p_organization_id` on consume/claim/enqueue/recover
3. Claim/runner org or grain/owner/token mismatch
4. Foreign fingerprint drift
5. Worker ENABLE or HTTP worker invocation
6. Active foreign leases blocking claim (global cap) — escalate; do not claim globally
7. Second rollover re-enrolls or bumps dirty for the same key

---

## 4. Cleanup policy

| Environment | Policy |
|---|---|
| Hosted | **Retain** canary org by default. No trigger toggles. Cleanup = separate approval with a hosted-safe plan that does **not** disable triggers (e.g. leave immutable snapshots; soft-abandon org). |
| Local | May use `canary-fixture-local-teardown.sql` only |

---

## 5. Local verification commands

```bash
export PGPASSWORD=postgres
export RUN_SUPABASE_LIVE=1

npx vitest run \
  tests/unit/m5-6e4-fixture-safety-architecture.test.ts \
  tests/unit/m5-6e4-hosted-target.test.ts \
  tests/unit/m5-6e4-single-grain-recompute.test.ts \
  tests/unit/m5-6e4-stage3-oneshot.test.ts \
  tests/unit/m5-6e4-stage3-oneshot.hosted.test.ts \
  tests/unit/m5-6e4-hosted-canary.live.test.ts

npx tsc --noEmit && npm run lint && npm run build && git diff --check
```

(`m5-6e4-stage3-oneshot.hosted.test.ts` stays **skipped** unless `M56E4_STAGE3_RUN=1`.)

---

## 6. Residual risks

| ID | Sev | Risk |
|---|---|---|
| R1 | P1 | Global active-lease cap can block org-scoped claim |
| R2 | P1 | Concurrent merchant activity can change fingerprint mid-window → STOP |
| R3 | P0 if violated | Accidental use of local teardown on hosted |
| R4 | P2 | Canary request left `queued` at dirty=2 — do not treat as production backlog or auto-enable workers |
| R5 | P2 | Historical: expired/disclosed claim tokens — recover/reclaim + revoke list |
| R6 | P1 | Hosted canary ≠ production worker enablement; HTTP workers/cron still require separate approval |
| R7 | P1 | M5.6D milestone acceptance remains separate from E.4 canary close |

---

## 7. Org-scoped expired-lease recover / reclaim

Use **only** when Stage 3 preflight reports `leaseExpired: true` (or SELECT shows `status in ('claimed','running')` and `lease_expires_at <= now()` for the canary grain).

**FORBIDDEN:** null `p_organization_id` on recover/claim; worker ENABLE; HTTP workers.

### 7a. Confirm (SELECT-only)

```sql
select
  organization_id, store_id, location_id, variant_id, metric_date,
  status, lease_owner_id, lease_claim_token, claimed_generation,
  lease_expires_at,
  lease_expires_at <= clock_timestamp() as lease_expired
from public.sku_daily_metric_recompute_requests
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid
  and store_id = 'e46e4000-0000-4000-8000-000000000002'::uuid
  and location_id = 'e46e4000-0000-4000-8000-000000000003'::uuid
  and variant_id = 'e46e4000-0000-4000-8000-000000000005'::uuid
  and metric_date = '2026-06-15'
  and algorithm_version = 'm5-derived-metrics-v1';
```

### 7b. Recover (canary org only)

```sql
select * from public.recover_expired_sku_daily_metric_recompute_leases(
  5,    -- p_max_attempts
  30,   -- p_base_delay_seconds
  300,  -- p_max_delay_seconds
  'e46e4000-0000-4000-8000-000000000001'::uuid  -- REQUIRED org scope
);
```

Expect the canary grain to leave `claimed`/`running` (typically `queued` or `retry_wait`).

### 7c. Reclaim (canary org only)

```sql
select * from public.claim_sku_daily_metric_recompute_requests(
  'm56e4-hosted-canary',  -- same owner string Stage 3 expects
  1,    -- p_limit
  120,  -- p_lease_seconds
  4,    -- p_max_active (global cap unchanged)
  'e46e4000-0000-4000-8000-000000000001'::uuid
);
```

Record the **new** `lease_claim_token` and `claimed_generation`. Update `M56E4_CLAIM_TOKEN` / `M56E4_CLAIMED_GENERATION`, re-run Stage 3 **preflight**, then execute only if `leaseExpired: false`.

### 7d. Abort if

- Recover/claim without org UUID
- Foreign fingerprint drifts
- Global active-lease cap blocks claim — escalate; do not widen to null-org claim

No new migration required.

---

## 8. Documentation closeout — M5.6E.4 CLOSED (hosted canary only)

**Scope closed:** isolation-safe hosted canary verification through Stages 0–4 (org-scoped consume/claim, one-shot recompute, frozen-as_of rollover ×2, foreign fingerprint unchanged).

**Explicitly not authorized by this closeout:**

- `METRIC_RECOMPUTE_WORKER_ENABLED=1` / `METRIC_ROLLOVER_WORKER_ENABLED=1`
- Cron / `vercel.json` / HTTP `/api/internal/metric-*` production ticking
- M5.6D milestone closure (separate acceptance)
- Further claim/recompute of the canary grain left `queued` at `dirty_generation=2`

| Stage | Hosted status |
|---|---|
| 0–2 | PASSED |
| 3 Preflight + execute | PASSED (§0.2); metrics 0/0/7; execute auth revoked |
| 4 Rollover ×2 | PASSED (§0.3); final queue `queued` dirty=2 intentional |
| Foreign fingerprint | `59d7d64dbcc254544f04cdb81ccff699` unchanged |
| Workers / cron / HTTP routes | OFF throughout |

**Next canonical milestone:** M5.7 adversarial verification (`docs/IMPLEMENTATION_STATUS.md`).
