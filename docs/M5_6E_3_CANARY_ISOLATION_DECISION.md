# M5.6E.3 — Canary Isolation Decision

**Status:** Option C implemented (migration `20261028100000`, TS + tests). **Hosted E.3 schema deployed** (operator-verified). Workers off.

**Historical note (decision-time):** Hosted canary *execution* was deferred to `docs/M5_6E_4_HOSTED_CANARY_RUNBOOK.md` and was **not** part of the E.3 implementation pass. This record does not supersede later E.4 evidence.

**Clarification vs early draft:** active-lease ceiling remains **global** (max four) even when `p_organization_id` is set. Org scope filters claim **candidates** and recover **targets** only; it does **not** narrow the global active-lease count.

**Baseline:** `4d219c8` · Evidence base: `docs/M5_6E_2_HOSTED_CANARY_READINESS.md`, M5.6A–D migrations, `lib/persistence/metric-recompute-queue.ts`, `lib/persistence/metric-rollover.ts`, worker routes, live tests.

---

## 1. Verdict

| Question | Answer |
|---|---|
| Can Option A (SQL-only, current RPCs) **guarantee** isolation of one dedicated org through claim, recovery, retries, fencing, supersession, and rollover? | **No** |
| Recommended path | **Option C** — additive optional `p_organization_id` on claim + recover; default `null` preserves today’s global production behavior |
| Option B alone | **Reject** as insufficient (HTTP/TS filter without claim SQL scope) |
| Hosted canary execution (decision-time) | **NO-GO** until Option C is implemented, locally verified, and SELECT-preflighted on hosted |
| Workers / cron | Remain **OFF** |

---

## 2. Option evaluation against actual SQL

### Option A — SQL-orchestrated canary, no schema change

| Stage | Org filter today? | Isolated under A? |
|---|---|---|
| Consume | Yes (`p_organization_id`) | Yes, if caller always passes canary org |
| Rollover enqueue | Yes | Yes, if caller always passes canary org |
| start / complete / fail | Full grain PK | Yes, if only canary PKs are invoked |
| Retries / supersession / fencing | Row-scoped on that PK | Yes for rows already claimed |
| **Claim** | **None** — global candidates + global active-lease cap (`5606003`) | **Not guaranteed** |
| **Recover** | **None** — all expired `claimed`/`running` | **Not guaranteed** |

**Why A cannot prove isolation**

1. `claim_sku_daily_metric_recompute_requests` selects any claimable row (`queued` / ready `retry_wait`) with `FOR UPDATE SKIP LOCKED` and enforces a **global** active-lease budget (`supabase/migrations/20261018100000_m5_6c_metric_recompute_worker.sql`).
2. `recover_expired_sku_daily_metric_recompute_leases` updates up to 1000 expired leases **across all orgs**.
3. Soft gates (“queue empty”, “workers off”) are operational, not enforceable: any concurrent global consume/claim/recover/HTTP tick breaks the canary; recover can mutate merchant leases during intentional lease-expiry tests.
4. HTTP routes remain globally scoped (`metric-recompute-queue.ts` hard-codes `p_organization_id: null`; rollover route calls `enqueue()` with null org).

A is acceptable only as a **best-effort** lab procedure, not as a hosted isolation proof.

### Option B — TS/env canary org on routes + pre-claim SELECT gate

- Can scope consume/enqueue in TypeScript.
- Claim SQL stays global → race between SELECT gate and claim; foreign work can still be claimed.
- Does not fix recover.
- **Reject** as the isolation solution.

### Option C — Optional org scope on claim + recover (recommended)

- Add `p_organization_id uuid DEFAULT NULL` to claim and recover.
- `NULL` → identical global semantics (production / current workers unchanged).
- Non-NULL → claim **candidates** and recover **targets** restricted to that organization; **active-lease counting remains global**; advisory lock key unchanged (`5606003`).
- start/complete/fail/consume/rollover unchanged (already row- or org-scoped as needed).
- Smallest backward-compatible SQL change that makes a one-org canary **provable**.

---

## 3. Option C design (implementation scope — do not build yet)

### 3.1 Migration (new file only; do not edit deployed C/D bodies in place)

Suggested name: `supabase/migrations/20261028100000_m5_6e3_org_scoped_claim_recover.sql`

1. `DROP FUNCTION` existing 4-arg claim and 3-arg recover signatures.
2. Recreate with trailing `p_organization_id uuid DEFAULT NULL`.
3. Claim changes when org is non-null:
   - Active lease count: **global** (unchanged ceiling of `p_max_active`).
   - Candidate `WHERE`: existing status predicates **and** `organization_id = p_organization_id`.
   - Per-grain active-lease check: unchanged.
4. Recover changes when org is non-null:
   - Expired lease pick `WHERE` adds `organization_id = p_organization_id`.
5. Keep `SECURITY DEFINER`, `search_path=''`, `REVOKE` from `public/anon/authenticated`, `GRANT EXECUTE` to `service_role` on **new** signatures.
6. No table/RLS/grant changes on request rows; no M5.5 formula edits; no worker ENABLE changes.

**Default production behavior:** workers and `createMetricRecomputeQueue` continue omitting the new argument (or pass null) → `NULL` → global claim/recover as today.

### 3.2 TypeScript (minimal, after SQL)

- Extend `claim` / `recover` in `lib/persistence/metric-recompute-queue.ts` with optional `organizationId?: string | null` (default null).
- Do **not** enable workers or change HTTP routes in the same change set unless a separate canary-only approval asks for env-gated org pass-through.
- First hosted canary should still prefer **direct SQL / scripted RPC** with explicit canary org, workers OFF.

### 3.3 Local tests (required before any hosted apply)

| Test | Assert |
|---|---|
| Unit/architecture | New migration text: default null, org predicate, grants, `search_path` |
| Live: null org claim | Unchanged global behavior vs two-org fixture |
| Live: org-scoped claim | Only canary org claimed while foreign org has older queued work |
| Live: global four-lease cap | Org-scoped claim still blocked when four foreign unexpired leases are active |
| Live: org-scoped recover | Expired canary lease recovered; foreign expired lease untouched |
| Live: null recover | Still recovers both (regression) |
| Live: fencing/supersession | Unchanged on canary PK after org-scoped claim |
| Regression | Existing M5.6C/D live suites green |

### 3.4 Hosted SELECT-only preflight (before applying E.3 migration)

```sql
-- Expect C/D already present; E.3 migration absent
select version from supabase_migrations.schema_migrations
where version in ('20261018100000','20261020100000','20261028100000')
order by 1;

-- Current claim/recover arities (expect no org arg until E.3)
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_sku_daily_metric_recompute_requests',
    'recover_expired_sku_daily_metric_recompute_leases'
  );

-- Queue empty / workers still ops-verified OFF
select count(*) filter (where consumed_at is null) as unconsumed
from public.sku_daily_metric_source_events;
select status, count(*) from public.sku_daily_metric_recompute_requests group by 1;
```

Do **not** call claim/consume/enqueue in preflight.

### 3.5 Bounded canary steps (after E.3 hosted apply — future milestone)

1. Gates: workers OFF; unconsumed/claimable empty or canary-only; invalid TZ count 0.
2. Create dedicated `m56e2-canary-*` org/store/location/variant only.
3. Emit one A event via canary commerce write.
4. `consume_sku_daily_metric_source_events(10, :canary_org)`.
5. `claim_...(owner, 1, 120, 4, :canary_org)` — assert claimed org = canary even if foreign queued rows exist (isolation proof).
6. start → M5.5 recompute → complete; duplicate complete → `fenced`.
7. Optional: fail retryable → `retry_wait`; org-scoped recover after lease expiry on canary only.
8. `enqueue_sku_daily_metric_daily_rollover(20, 1, :canary_org, :as_of)`; second enqueue → no duplicate enrollment dirty bump.
9. SELECT assertions scoped to `:canary_org`; confirm zero non-canary request/metric/rollover deltas.

**Stop if:** any non-canary row mutates; claim returns foreign org; recover touches foreign lease; ENABLE becomes `1`; unexpected `failed` on canary.

---

## 4. Findings

| ID | Sev | Finding |
|---|---|---|
| E3-1 | **P0** | Claim + recover are global; Option A cannot guarantee one-org isolation |
| E3-2 | **P0** | HTTP workers remain globally scoped; keep OFF for canary |
| E3-3 | **P1** | Hosted **runtime** still unverified (schema deploy ≠ runtime proof) |
| E3-4 | **P1** | Option C required before isolation-proven hosted canary |
| E3-5 | **P2** | Docs previously said C/D “not deployed” after schema deploy — corrected in this pass |
| E3-6 | **P2** | B `available_at` hygiene / rollover fairness unchanged |

---

## 5. Documentation drift correction (this pass)

Clarify everywhere relevant:

- **Hosted schema:** M5.6C (`20261018100000`) and M5.6D (`20261020100000`) **migrations are deployed** (operator-verified).
- **Hosted runtime:** **not** verified — no approved worker ticks, no cron, no evidenced canary execution.
- **Workers:** both ENABLE flags remain off/unset; no scheduler.

Updated: `docs/IMPLEMENTATION_STATUS.md`, `docs/M5_6_HANDOFF.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, `docs/BACKGROUND_JOBS.md`, and a pointer in `docs/M5_6E_2_HOSTED_CANARY_READINESS.md`.

---

## 6. Exact next implementation scope (when approved)

1. Add E.3 migration (org-scoped claim/recover, default null).
2. Minimal TS optional `organizationId` on claim/recover.
3. Local unit + live isolation tests + M5.6C/D regression.
4. Hosted SELECT preflight → approve schema apply of E.3 only.
5. Separate approval for SQL canary execution (workers still OFF).

**Out of scope now:** worker ENABLE, cron, HTTP canary mode, hosted writes, editing frozen M5.5 formulas, DOCX/archive.

---

## 7. Hosted SELECT-only preflight (before applying E.3)

```sql
select version from supabase_migrations.schema_migrations
where version in ('20261018100000','20261020100000','20261028100000')
order by 1;
-- Expect C+D present; E.3 ABSENT

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_sku_daily_metric_recompute_requests',
    'recover_expired_sku_daily_metric_recompute_leases'
  )
order by 1;
-- Expect 4-arg claim and 3-arg recover (no uuid trailing arg yet)

select count(*) filter (where consumed_at is null) as unconsumed
from public.sku_daily_metric_source_events;
select status, count(*) from public.sku_daily_metric_recompute_requests group by 1;
```

## 8. Hosted SELECT-only post-deploy checks (after E.3 apply; still no workers)

```sql
select version from supabase_migrations.schema_migrations
where version = '20261028100000';

select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef,
       coalesce(p.proconfig::text,''),
       has_function_privilege('service_role', p.oid, 'EXECUTE') as sr,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_sku_daily_metric_recompute_requests',
    'recover_expired_sku_daily_metric_recompute_leases'
  )
order by 1;
-- Expect exactly one signature each, trailing uuid arg;
-- no leftover 3-arg/4-arg overloads; sr true; anon/auth false; search_path=""
```

Do **not** call claim/consume/enqueue in preflight or post-deploy verification.

## 9. Recommendation summary

**Local Option C: complete.** Hosted E.3 schema deploy requires separate approval after section 7 preflight. Hosted canary and worker enablement remain later, separate approvals. Keep workers off.
