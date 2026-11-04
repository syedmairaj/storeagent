# M5-HR1.b — Org-Scoped Metric Rollover HTTP Tick Contract (Freeze)

**Status:** FROZEN (documentation only). This freeze does **not** authorize implementation, deploy, enablement, cron, hosted ops, or SQL.
**Baseline:** `main` @ `d196338` (HR1.a org-scoped recompute HTTP already present on HEAD)
**Origin:** `docs/PRA_1_PRODUCTION_READINESS_AUDIT.md` §F item 2 (M5-HR1); P0-3 class risk for global HTTP ticks; rollover half deferred from HR1.a
**SQL primitives (already shipped):** M5.6D `enqueue_sku_daily_metric_daily_rollover(p_limit, p_max_stores, p_organization_id, p_as_of)` with optional org filter (`20261020100000`)
**Parent decisions:** `docs/M5_6E_3_CANARY_ISOLATION_DECISION.md`; `docs/M5_HR1_A_ORG_SCOPED_RECOMPUTE_CONTRACT.md`
**Authority when docs conflict:** this freeze for the **opt-in org-scoped rollover HTTP tick** only. M5.6D remains authority for eligibility, enrollment ledger, advisory lock `5606004`, lookahead completion, and invalid-IANA recovery. E.3 remains authority for recompute claim/recover null=global. HR1.a remains authority for recompute HTTP. M5.5 formula authority is unchanged.

---

## 0. Verdict

| Gate | Result |
|---|---|
| Freeze this HR1.b contract (docs only) | **GO** |
| Implement TS wiring under this contract | **NO-GO** until a separate explicit implementation-slice approval |
| Enable `METRIC_ROLLOVER_WORKER_ENABLED=1` locally or hosted | **NO-GO** (this freeze) |
| Cron / `vercel.json` / scheduler | **NO-GO** |
| SQL / RPC / migrations / hosted mutate | **NO-GO** (not required for HR1.b; also not authorized) |
| Automatic fallback to global enqueue (`p_organization_id: null`) on the enabled HTTP path | **FORBIDDEN** |
| Recompute HTTP / HR1.a changes | **NO-GO** (out of scope; already shipped at baseline) |
| E4 / M7.3 / AI / purchasing / inventory mutation | **NO-GO** |

**Product intent:** Authorize a future, **fail-closed**, **env-gated**, **single-organization** rollover HTTP tick that closes the rollover half of PRA-1 M5-HR1 for the canary path—without changing historical M5.6D null=global semantics for non-HTTP / null-scoped callers, and without enabling the worker in this freeze.

**SQL blocker:** **None.** Org-scoped enqueue already exists. Do not open a migration for HR1.b.

---

## 1. Exact risk and file evidence

### 1.1 Cross-tenant risk (confirmed)

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| HR1B-1 | **P0** | Enabled HTTP rollover tick calls `enqueue()` with **no** `organizationId`, so the library defaults `p_organization_id` to **null** and the RPC selects **any** actionable store across tenants | `app/api/internal/metric-rollover/route.ts` → `await queue.enqueue()`; `lib/persistence/metric-rollover.ts` (`organizationId` undefined → `null`); SQL `where (p_organization_id is null or store.organization_id = p_organization_id)` in `20261020100000` |
| HR1B-2 | **P0** | Under null org, rollover opens/resumes runs, enrolls grains, and **dirty-bumps** `sku_daily_metric_recompute_requests` for foreign orgs | Same migration: insert into `sku_daily_metric_rollover_runs` / `_enqueues` / `sku_daily_metric_recompute_requests` using selected store’s `organization_id` |
| HR1B-3 | **P1** | Soft operational gates (ENABLE off, empty queues) are not enforceable isolation; any ENABLE=1 with a valid secret against a multi-tenant DB is globally scoped today | Route ENABLE/`Bearer` gates only; no org gate; E.3 §2 finding E3-2 class |
| HR1B-4 | **P2** | `sku_daily_metric_rollover_stats()` is global counts-only; not called by the HTTP route today—must stay unused for tenant selection | `metric-rollover.ts` `stats()`; route never calls it |

**Not a claim/recover problem.** Unlike recompute, rollover has **no** HTTP claim/recover/start/complete loop. Isolation for the tick is entirely: trusted env org → non-null `p_organization_id` on enqueue. Do **not** assume recompute RPC semantics apply.

### 1.2 What is already safe when org is passed

- Store candidate filter: `p_organization_id is null or store.organization_id = p_organization_id`
- In-progress resume, timezone-fail, and new-day open paths only iterate that filtered store set
- Enrollment + dirty bump inherit `v_run.organization_id` from the selected store/run (cannot enroll a foreign org grain from an org-scoped store selection)
- Enrollment ledger PK prevents duplicate dirty bump for the same grain/day
- Advisory lock `5606004` is **global serialization** (shared), not a mutation of foreign rows when org is set
- HTTP already ignores body/query for tenant selection (`request.json` / `searchParams` absent; architecture test freezes this)

### 1.3 Severity relative to PRA-1

Same **class** as P0-3 (global HTTP tick unsafe to enable). Recompute half addressed by HR1.a at `d196338`. Rollover half remains open until this contract is implemented and separately enablement-approved.

---

## 2. Reconciliation with existing freezes

### 2.1 Relationship to M5.6D

| M5.6D rule | HR1.b posture |
|---|---|
| `enqueue_sku_daily_metric_daily_rollover` optional `p_organization_id`; null = all stores | **Preserved** for library / SQL / live-test callers that intentionally pass null |
| Eligibility, enrollment ledger, lookahead `v_batch_limit + 1`, invalid-IANA recovery | **Unchanged** |
| Advisory lock `5606004` | **Unchanged** |
| HTTP trigger disabled unless `METRIC_ROLLOVER_WORKER_ENABLED=1`; secret ≥32; counts only; no scheduler | **Preserved** and **strengthened** with org fail-closed |
| No second work queue; dirty bump only into existing recompute requests | **Unchanged** |

### 2.2 Relationship to E.3

E.3 §2.3: “start/complete/fail/consume/rollover unchanged (already row- or org-scoped as needed).” Rollover **SQL** org filter was already present; E.3 did not require claim/recover changes for rollover. HR1.b does **not** reopen E.3 SQL. E.3’s note that HTTP routes were globally scoped is the gap this freeze contracts—for **rollover only**.

### 2.3 Relationship to HR1.a

| HR1.a pattern | Apply to HR1.b? |
|---|---|
| Server-only env UUID; never from HTTP caller | **Yes** |
| ENABLE≠1 → 404; bad secret → 503; bad bearer → 401; missing/invalid org → 503; no RPCs | **Yes** (parallel table) |
| No global fallback when org missing | **Yes** |
| Dedicated org env var per worker family | **Yes** → `METRIC_ROLLOVER_ORGANIZATION_ID` (do **not** reuse `METRIC_RECOMPUTE_ORGANIZATION_ID` as the sole required var; independent enablement gates) |
| Claim mismatch gate before start | **N/A** — rollover returns counts only; no claimed row loop |
| consume/recover/claim must pass non-null org | **N/A** — single enqueue RPC |
| Update E.3 “route must not contain organizationId” assertion | **N/A** — that assertion targeted recompute; M5.6D rollover architecture already forbids body/query tenant selection |

HR1.b must **not** edit HR1.a sources or weaken recompute gates.

### 2.4 What HR1.b does **not** rewrite

- Does not edit `docs/M5_6E_3_CANARY_ISOLATION_DECISION.md` or `docs/M5_HR1_A_ORG_SCOPED_RECOMPUTE_CONTRACT.md` except by existing cross-reference intent
- Does not require dropping null defaults from SQL
- Does not require hosted schema changes
- Does not authorize ENABLE, cron, or draining the E.4 canary leftover grain

---

## 3. Verified execution architecture (inspect baseline)

```
POST /api/internal/metric-rollover
  → readMetricRolloverWorkerConfig(env)
  → ENABLE≠1? 404
  → secret short/missing? 503 worker_not_configured
  → Bearer fail? 401
  → createSupabaseAdminClient() + createMetricRolloverQueue(admin)
  → queue.enqueue()                    # TODAY: no org → p_organization_id null
       → RPC enqueue_sku_daily_metric_daily_rollover(limit, maxStores, null, asOf)
            → pg_advisory_xact_lock(5606004)
            → select actionable stores (ALL orgs when null)
            → open/resume/fail runs; enroll grains; dirty-bump recompute_requests
  → 200 { requestId, result: counts } | 500 rollover_tick_failed
```

**There is no separate rollover worker process** beyond this HTTP tick + SQL RPC. No claim lease, no fencing tokens, no retry_wait loop in TypeScript. Idempotency for enrollment is SQL ledger `on conflict do nothing` + dirty bump rules inside the RPC.

Library surface already supports scope:

```ts
enqueue(input?: {
  limit?: number;
  maxStores?: number;
  organizationId?: string | null;  // undefined/null → p_organization_id null
  asOf?: string | null;
})
```

HTTP today never supplies `organizationId`. Config today has only `enabled` + `secret`—no org field.

---

## 4. Trusted scope mechanism and env configuration

### 4.1 Trusted organization scope

| Rule | Requirement |
|---|---|
| Source | Server environment only: `METRIC_ROLLOVER_ORGANIZATION_ID` |
| Shape | Exactly one UUID matching `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` (same regex as `metric-rollover.ts` / HR1.a) |
| Normalization | Lowercase hex on successful parse (match HR1.a `parseMetricRecomputeOrganizationId` behavior) |
| Absent / empty / whitespace / non-UUID / multi-value | **Invalid** → treat as null scope |
| HTTP body / query / custom headers claiming org, store, grain, `asOf`, limit | **Ignored**; must never select tenant or widen work |
| Bearer secret | Authorizes the **route** only; never selects or widens tenant |
| Relationship to recompute org env | Independent variable. Operators may set both to the same canary UUID; code must not read `METRIC_RECOMPUTE_ORGANIZATION_ID` as a fallback for rollover |

### 4.2 Decision table (HTTP `POST /api/internal/metric-rollover`)

Evaluate in order. **Zero** enqueue / stats RPCs before a successful gate path reaches the tick.

| # | `METRIC_ROLLOVER_WORKER_ENABLED` | Secret (≥32 chars) | Bearer auth | `METRIC_ROLLOVER_ORGANIZATION_ID` | HTTP status | Queue ops |
|---|---|---|---|---|---|---|
| 1 | ≠ `"1"` (default) | any | any | any | **404** `not_found` | none |
| 2 | `"1"` | missing/short | any | any | **503** `worker_not_configured` | none |
| 3 | `"1"` | valid | fail | any | **401** `unauthorized` | none |
| 4 | `"1"` | valid | pass | missing/invalid | **503** `organization_scope_required` (or `worker_misconfigured`) | **none** |
| 5 | `"1"` | valid | pass | one valid UUID | **200** with counts-only body, or **500** `rollover_tick_failed` if enqueue throws after gates | org-scoped enqueue only |

Notes:

- Rows 1–4 are **fail closed**: no global fallback.
- Prefer error code `organization_scope_required` for row 4 for parity with HR1.a.
- Response bodies remain counts / `requestId` / error codes only—no run tokens, no SQL, no foreign org identifiers.
- Do not call `stats()` from the HTTP tick.

### 4.3 Tick wiring (when row 5 applies)

1. Resolve trusted `organizationId` from env (already validated).
2. Call `queue.enqueue({ organizationId })` with that non-null UUID.
3. Preserve existing library defaults unless a later approved canary-ops slice changes them: `limit` default 100, `maxStores` default 4, `asOf` omitted/`null` (RPC uses `clock_timestamp()`).
4. Do **not** accept caller `asOf` / limit / maxStores from the HTTP request.
5. Do **not** retry the same tick with `null` org after an org-scoped RPC error.

### 4.4 No global fallback

Forbidden behaviors under HR1.b HTTP mode:

- Treating unset org env as “global canary convenience”
- Retrying enqueue with `null` after an org-scoped RPC error
- Dual-path “if org set scope else global” inside the HTTP route
- Reading org / `asOf` / store from the request to “fix gaps”
- Falling back to `METRIC_RECOMPUTE_ORGANIZATION_ID` when rollover org env is missing

Library-level optional null on `enqueue` may remain for non-HTTP callers and M5.6D live tests. The **HTTP entrypoint** must always supply a validated non-null UUID.

---

## 5. Org-scoped execution and foreign-row handling

### 5.1 Primary isolation (SQL)

When `p_organization_id` is the trusted UUID:

- Only stores with `organization_id = p_organization_id` are candidates
- Foreign in_progress runs are **not** resumed
- Foreign stores are **not** opened for new metric days
- Foreign enrollment / dirty bumps do **not** occur

### 5.2 Secondary isolation (TypeScript)

| Condition | Action |
|---|---|
| Enabled HTTP path would call enqueue without a validated non-null org | **Forbidden** — must 503 before RPC |
| Caller supplies forged org/store/`asOf` in body/query/headers | Ignored; trusted env only |
| Enqueue RPC throws | 500 `rollover_tick_failed`; do not widen scope; do not call stats |
| Malformed UUID passed into library `enqueue` outside HTTP | Existing Zod `uuid.parse` throw — non-HTTP concern |

**No claim-mismatch gate** is required: the RPC does not return per-row org identities for post-claim filtering. Isolation is enforce-at-call + SQL filter. Architecture/unit tests must prove the HTTP path never passes null.

### 5.3 Lease / fencing / retry / idempotency (rollover-specific)

| Concern | Rollover semantics (unchanged product rules) |
|---|---|
| Lease ownership | N/A at HTTP/TS layer; run rows use `FOR UPDATE` inside the RPC under lock `5606004` |
| Fencing tokens | N/A (recompute-only) |
| Retry | Partial progress via `in_progress` resume on a later **org-scoped** tick for the same org; foreign progress untouched |
| Idempotency | Enrollment ledger + conflict rules: one dirty bump per grain/day; second enqueue for same org/day enrolls zero duplicates |
| Failure | Invalid IANA → `failed` + `invalid_iana_timezone` for that store/day; recoverable after TZ correction on a later tick; other failures per M5.6D |

### 5.4 Shared-state / fallback paths

| Path | Cross-tenant mutation when HTTP org-scoped? |
|---|---|
| Advisory lock `5606004` | No mutation of foreign rows; may serialize behind foreign/global enqueue callers |
| Global null library enqueue (scripts/live tests) | Intentional non-HTTP; out of HR1.b HTTP mode |
| `stats()` | Read-only global counts; must not be invoked by HTTP tick |
| Downstream recompute worker | Separate ENABLE + HR1.a org gate; org-scoped rollover may enqueue canary dirty work only for the trusted org |

---

## 6. Exact proposed implementation scope (later slice only)

### 6.1 Permitted files (implementation slice — not this freeze)

| Path | Allowed change |
|---|---|
| `docs/M5_HR1_B_ORG_SCOPED_ROLLOVER_CONTRACT.md` | Already frozen; editorial fixes only if needed |
| `lib/persistence/metric-rollover.ts` | Parse `METRIC_ROLLOVER_ORGANIZATION_ID` into config; add HTTP gate helper (HR1.a-shaped); keep library `enqueue` optional-null for non-HTTP; **HTTP-facing config must fail closed** on missing/invalid org when enabled |
| `app/api/internal/metric-rollover/route.ts` | Enforce decision table §4.2; never read caller org/`asOf`; pass trusted org into `enqueue` |
| `.env.example` | Document empty `METRIC_ROLLOVER_ORGANIZATION_ID=` (disabled/unset by default) |
| `tests/unit/m5-6d-metric-rollover.test.ts` | Extend unit coverage for scoped config / enqueue args |
| `tests/unit/m5-6d-metric-rollover-architecture.test.ts` | Update only as needed for new invariants (keep no-body/query, no-scheduler, security-definer freezes) |
| **New** `tests/unit/m5-hr1b-org-scoped-rollover*.test.ts` (unit and/or architecture) | Adversarial isolation matrix §7 |

### 6.2 Explicitly forbidden in HR1.b implementation

- Any file under `supabase/migrations/`
- Hosted SQL sessions, resets, applies, canary drains
- `app/api/internal/metric-recompute/**`, `workers/aggregate-metrics.ts`, `lib/persistence/metric-recompute-queue.ts` (HR1.a)
- Worker ENABLE defaults flipping to on; cron; `vercel.json` schedulers
- M5.5 metric arithmetic / persistence formula edits
- E4, M7, AI, purchasing, inventory mutation paths
- Editing frozen E.3 / HR1.a / PRA-1 / BACKGROUND_JOBS / SERVICE_ROLE / README / roadmap docs except a one-line pointer **if** a later doc-alignment pass is separately approved
- Dependency / lockfile changes
- Git commit/push unless explicitly requested

### 6.3 Library null semantics (clarification)

`MetricRolloverQueue.enqueue` may keep `organizationId?: string | null` for non-HTTP callers and M5.6D regression/live tests. The **HTTP tick path** must always supply a validated non-null UUID. Silent null inside the enabled HTTP path is a contract violation.

---

## 7. Isolation / adversarial test matrix (implementation slice)

| ID | Case | Expect |
|---|---|---|
| T1 | ENABLE≠1 | 404; no RPC |
| T2 | ENABLE=1, secret short/missing | 503; no RPC |
| T3 | ENABLE=1, bad bearer | 401; no RPC |
| T4 | ENABLE=1, auth OK, org env absent | 503; no RPC |
| T5 | ENABLE=1, auth OK, org env non-UUID / whitespace / multi-value | 503; no RPC |
| T6 | Body/query/header forged foreign org or `asOf` | Ignored; trusted env org used; enqueue args use trusted org only |
| T7 | Unit: enqueue called with trusted org UUID; `p_organization_id` never null on HTTP success path | Pass |
| T8 | Library still allows explicit null for non-HTTP callers | Preserved |
| T9 | Duplicate enqueue same org/day (unit or existing live semantics) | Idempotent enrollment / no invented second identity |
| T10 | Architecture: route never selects tenant from request body/query | Static assertion (existing + strengthened) |
| T11 | Architecture: enabled HTTP path never hard-codes / omits org into null enqueue | Static or unit assertion |
| T12 | Architecture: route does not call `stats()` | Static assertion |
| T13 | Architecture: no scheduler / no cron / no metrics formula imports | Existing M5.6D assertions remain |
| T14 | ENABLE default / `.env.example` unset | Workers remain OFF by documentation and config defaults |
| T15 | Does not read `METRIC_RECOMPUTE_ORGANIZATION_ID` as rollover fallback | Unit/architecture |

Live hosted tests are **out of HR1.b implementation** unless separately approved; local unit/architecture are required for the implementation slice. Existing M5.6D live suite remains regression authority for SQL org filter behavior.

---

## 8. Rollback and operational safeguards

### 8.1 Operational rollback (any environment)

1. Unset or set `METRIC_ROLLOVER_WORKER_ENABLED` to anything other than `"1"` → immediate **404**, zero ticks.
2. Unset `METRIC_ROLLOVER_ORGANIZATION_ID` while ENABLE remains `1` → **503**, zero queue ops (fail closed; **not** global).
3. No code rollback is required to stop risk if flags are correct.

### 8.2 Implementation rollback

If the implementation slice is reverted: repository returns to today’s global-null HTTP enqueue **shape**, which remains **unsafe to enable**. Reversion must keep ENABLE off. Re-enabling global HTTP rollover against multi-tenant stores remains **NO-GO**.

### 8.3 Fail-closed invariants (non-negotiable)

- Disabled by default.
- Enabled without valid org → 503, not global.
- Caller cannot choose tenant or `asOf`.
- No SQL privilege expansion.
- No silent catch that retries without org.
- No dependency on recompute org env as substitute scope.

---

## 9. Hosted prerequisites (not part of this freeze or of HR1.b code)

Before **any** future enablement approval (separate from HR1.b implement and from this freeze):

1. **Read-only** confirm hosted function exposes:
   - `enqueue_sku_daily_metric_daily_rollover(p_limit integer, p_max_stores integer, p_organization_id uuid, p_as_of timestamptz)`
2. Confirm live env: both ENABLE flags ≠ `1`, no scheduler.
3. Canary org id recorded; agree that HTTP rollover uses **only** that org via `METRIC_ROLLOVER_ORGANIZATION_ID`.
4. Confirm HR1.a org-scoped recompute is the only approved path if recompute ENABLE is ever considered in the same window (separate approval).
5. Do **not** drain the E.4 leftover canary grain unless a later runbook explicitly authorizes it.

This freeze does **not** run those checks and does **not** authorize them.

---

## 10. Local versus hosted verification gaps

| Layer | Local today | Hosted today | HR1.b impact |
|---|---|---|---|
| M5.6D schema + org filter SQL | Verified (native + unit/architecture) | Schema deployed (operator-recorded) | Sufficient for TS-only org wiring |
| HTTP rollover org gate | **Missing** (global null) | N/A (ENABLE off / unverified) | This contract |
| Continuous HTTP/cron | Disabled | Unverified / disabled | Remains NO-GO |
| Multi-store fairness / TZ recovery under HTTP | Local SQL verified; HTTP path unused | Unverified | Not required to freeze/implement org gate; still not ENABLE |
| E.4 Stage 4 org-scoped rollover ×2 | — | Direct SQL canary evidence (not HTTP) | Supports SQL capability; does not close HTTP |

---

## 11. Relationship to PRA-1 / later milestones

| Item | Status under this freeze |
|---|---|
| PRA-1 M5-HR1 rollover half | Addressed **by contract** for a future org-scoped enablement path; **not** closed in production until implement + hosted verify + separate ENABLE approval |
| HR1.a recompute HTTP | Out of scope; already on baseline `d196338` |
| M7-PB1 / E4 / M7.3 / AI | Unchanged; still separate tracks |
| Continuous multi-tenant production rollover | **Not** authorized; HR1.b is canary/single-org opt-in only |

---

## 12. Explicit GO / NO-GO

| Action | Decision |
|---|---|
| Accept this document as the HR1.b freeze | **GO** (docs only) |
| Start HR1.b TypeScript implementation | **NO-GO** until explicit “implement HR1.b” approval citing this file |
| Commit this freeze document | Only if the user explicitly requests a commit |
| Deploy / enable workers / cron / hosted canary drain | **NO-GO** |
| Change SQL/RPC/migrations | **NO-GO** (unnecessary and unauthorized) |
| Fall back to global HTTP enqueue | **FORBIDDEN** |
| Query hosted infrastructure as part of this freeze | **NO-GO** |
| Modify unrelated dirty tree files | **NO-GO** |

---

## 13. Recommended smallest implementation slice (post-approval)

1. Add org parse + HTTP gate to `metric-rollover.ts` (mirror HR1.a shape; dedicated env var).
2. Wire `route.ts` through the gate; `enqueue({ organizationId })` only on success.
3. Document `METRIC_ROLLOVER_ORGANIZATION_ID=` in `.env.example`.
4. Add `m5-hr1b-*` unit/architecture tests for §7; extend M5.6D unit/architecture only as needed.
5. **Stop.** No ENABLE, no SQL, no hosted ops, no HR1.a edits.

---

## 14. Freeze checklist (this session)

- [x] Contract path created: `docs/M5_HR1_B_ORG_SCOPED_ROLLOVER_CONTRACT.md`
- [x] Risk + file evidence recorded
- [x] Reconciliation with M5.6D / E.3 / HR1.a stated
- [x] Runtime decision table frozen
- [x] Foreign-row / fail-closed rules frozen
- [x] Permitted implementation files listed
- [x] Test matrix listed
- [x] Rollback / hosted prereqs / GO-NO-GO listed
- [x] SQL/migration blocker assessed: **none**
- [ ] Implementation — **not authorized**
- [ ] Enablement — **not authorized**

**STOP.** No code, tests, SQL, hosted ops, or further milestones under this approval.
