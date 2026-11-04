# M5-HR1.a — Org-Scoped Metric Recompute HTTP Tick Contract (Freeze)

**Status:** FROZEN (documentation only). This freeze does **not** authorize implementation, deploy, enablement, cron, hosted ops, or SQL.
**Baseline:** `main` @ `0d9bbf1`
**Origin:** `docs/PRA_1_PRODUCTION_READINESS_AUDIT.md` §F item 2 (M5-HR1); P0-3 global HTTP tick risk
**SQL primitives (already shipped):** M5.6B org-scoped consume; M5.6E.3 optional org on claim/recover (`20261028100000`)
**Parent decision:** `docs/M5_6E_3_CANARY_ISOLATION_DECISION.md`
**Authority when docs conflict:** this freeze for the **opt-in org-scoped recompute HTTP tick** only. E.3 remains authority for optional SQL/TS claim-recover null=global semantics, advisory lock `5606003`, and the global active-lease ceiling. M5.5 formula authority is unchanged. Rollover HTTP is **HR1.b** (out of scope).

---

## 0. Verdict

| Gate | Result |
|---|---|
| Freeze this HR1.a contract (docs only) | **GO** |
| Implement TS wiring under this contract | **NO-GO** until a separate explicit implementation-slice approval |
| Enable `METRIC_RECOMPUTE_WORKER_ENABLED=1` locally or hosted | **NO-GO** (this freeze) |
| Cron / `vercel.json` / scheduler | **NO-GO** |
| SQL / RPC / migrations / hosted mutate | **NO-GO** |
| Automatic fallback to global consume/claim/recover | **FORBIDDEN** |
| Rollover HTTP org wiring | **NO-GO** (deferred to HR1.b) |
| E4 / M7.3 / AI / purchasing / inventory mutation | **NO-GO** |

**Product intent:** Authorize a future, **fail-closed**, **env-gated**, **single-organization** recompute HTTP tick that closes PRA-1 P0-3 for the canary path—without changing historical E.3 global null semantics for non-HTTP / null-scoped callers, and without enabling workers in this freeze.

---

## 1. Reconciliation with M5.6E.3

### 1.1 What E.3 froze (preserved)

| E.3 rule | HR1.a posture |
|---|---|
| Optional `p_organization_id` on claim/recover; `NULL` = global candidates/recovery | **Preserved** for library callers that intentionally pass null/omit (non-HTTP, scripts, live tests of global path) |
| Active-lease ceiling remains **global** (max `p_max_active`) even when org is set | **Preserved** |
| Advisory lock `5606003` unchanged | **Preserved** |
| start / complete / fail remain full-grain PK + owner + token fenced | **Preserved** |
| Do not enable workers in the E.3 change set | **Preserved** (still OFF; enablement is a later approval) |
| Architecture: optional TS `organizationId` on claim/recover | **Preserved** as the library surface; HTTP tick becomes a stricter consumer |

E.3 §3.2 explicitly deferred HTTP route changes to a **separate canary-only approval**. **This freeze is that approval—for contract only**, not for code.

### 1.2 What HR1.a supersedes (narrow)

HR1.a supersedes E.3 **only** for the **enabled recompute HTTP tick** (`POST /api/internal/metric-recompute` when `METRIC_RECOMPUTE_WORKER_ENABLED=1`):

1. That path **must not** pass `p_organization_id: null`.
2. That path **must not** omit organization scope on consume, recover, or claim.
3. That path **must not** fall back to global processing when org env is missing or invalid.
4. That path treats missing/invalid `METRIC_RECOMPUTE_ORGANIZATION_ID` as **misconfiguration** (503), not as “run global.”

Outside that enabled HTTP tick, E.3 global-null semantics remain valid and intentional.

### 1.3 What HR1.a does **not** rewrite

- Does not edit `docs/M5_6E_3_CANARY_ISOLATION_DECISION.md`.
- Does not require dropping null defaults from SQL.
- Does not require hosted schema changes (E.3 migration already defines the signatures).
- Does not authorize changing E.3 architecture **tenant-safety** assertions in this docs-only pass; the later implementation slice may **update** the route assertion that currently forbids any `organizationId` string in the route file, but only to an equivalent-or-stronger safety assertion (see §8).

---

## 2. Runtime model

### 2.1 Trusted organization scope

| Rule | Requirement |
|---|---|
| Source | Server environment only: `METRIC_RECOMPUTE_ORGANIZATION_ID` |
| Shape | Exactly one UUID matching `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` (same regex already used by `metric-recompute-queue.ts`) |
| Absent / empty / whitespace / non-UUID / multiple values | **Invalid** |
| HTTP body / query / custom headers claiming org or grain | **Ignored**; must never select tenant |
| Bearer secret | Authorizes the **route** only; never selects or widens tenant |

### 2.2 Decision table (HTTP `POST /api/internal/metric-recompute`)

Evaluate in order. **Zero** consume / recover / claim / start / complete / fail RPCs before a successful gate path reaches the tick.

| # | `METRIC_RECOMPUTE_WORKER_ENABLED` | Secret (≥32 chars) | Bearer auth | `METRIC_RECOMPUTE_ORGANIZATION_ID` | HTTP status | Queue ops |
|---|---|---|---|---|---|---|
| 1 | ≠ `"1"` (default) | any | any | any | **404** `not_found` | none |
| 2 | `"1"` | missing/short | any | any | **503** `worker_not_configured` or `worker_misconfigured` | none |
| 3 | `"1"` | valid | fail | any | **401** `unauthorized` | none |
| 4 | `"1"` | valid | pass | missing/invalid | **503** `worker_misconfigured` (or dedicated `organization_scope_required`) | **none** |
| 5 | `"1"` | valid | pass | one valid UUID | **200** with counts-only body, or **500** `worker_tick_failed` if tick throws after gates | org-scoped tick only |

Notes:

- Rows 1–4 are **fail closed**: no global fallback.
- Existing concurrency env fail-closed parsing (`METRIC_RECOMPUTE_MAX_ACTIVE` / `CLAIM_LIMIT`) remains; malformed → 503 via `MetricRecomputeWorkerConfigError`, still with **zero** queue ops.
- Response bodies remain counts / `requestId` / error codes only—no claim tokens, no raw SQL, no foreign org identifiers beyond what existing tick telemetry already emits for **claimed** work under the trusted scope.

### 2.3 Tick wiring (when row 5 applies)

1. Resolve trusted `organizationId` from env (already validated).
2. Bounded consume batches: pass **non-null** `organizationId` into consume RPC (`consume_sku_daily_metric_source_events`).
3. Each recover call: pass **non-null** `organizationId`.
4. Each claim call: pass **non-null** `organizationId`.
5. For each claimed row: apply mismatch gate (§3) **before** `start`.
6. On match: existing start → M5.5 executor → complete/fail path unchanged.
7. Preserve existing settings: lease 120s, item deadline 40s, tick budget 45s, defaults `maxActive=1` / `claimLimit=1`, retry policy from `workers/retry.ts`.

### 2.4 No global fallback

Forbidden behaviors under HR1.a HTTP mode:

- Treating unset org env as “global canary convenience”
- Retrying the same tick with `null` after an org-scoped RPC error
- Dual-path “if org set scope else global” inside the HTTP route or `runMetricRecomputeTick` when invoked from that route
- Reading org from the request to “fix gaps”

Library-level optional null on `claim`/`recover` may remain for non-HTTP callers; the **HTTP entrypoint and the tick invocation it uses** must require non-null scope.

---

## 3. Claim mismatch and error handling

### 3.1 Foreign or malformed claimed rows

After `claim` returns, **before** `start` / `complete` / `fail`:

| Condition | Action |
|---|---|
| `claim.organizationId !==` trusted env UUID (case-insensitive hex compare consistent with existing UUID parse) | **Do not** call start/complete/fail. Emit error telemetry (`scope_denied` or dedicated `ORG_SCOPE_MISMATCH`). Count as tick `queueErrors` (or dedicated mismatch counter if added). Leave row leased → expires into **org-scoped** recover on a later correctly configured tick |
| Claim row fails existing Zod/schema parse (malformed UUID/date/generation/token) | Same: no start/complete/fail; surface as queue/parse failure; no cross-tenant mutation |
| Existing `assertWorkerExecutionScope` failure | Unchanged: no start; lease expires into recovery |

Defense in depth: SQL org filter is primary isolation; TS mismatch gate is mandatory secondary. A mismatch must never be “best-effort executed.”

### 3.2 Queue / RPC failures mid-tick

Preserve current semantics:

- Consume/recover/claim throw → increment `queueErrors`, stop or break per existing tick control flow; **do not** widen scope.
- Mid-item queue failure → lease expires into recovery (org-scoped when later ticks pass org).
- Fenced start/complete/fail → existing counters and telemetry.
- Generation supersession / deferred unconsumed events / retry_wait / dead-letter (`failed` after exhaustion) → unchanged.

### 3.3 Idempotency

`metricRecomputeIdempotencyKey` continues to include organization, store, algorithm, metric date, and **claimed generation**. Org-scoped ticks must not invent a second logical identity for the same grain+generation.

---

## 4. Exact proposed implementation scope (later slice only)

### 4.1 Permitted files (implementation slice — not this freeze)

| Path | Allowed change |
|---|---|
| `docs/M5_HR1_A_ORG_SCOPED_RECOMPUTE_CONTRACT.md` | Already frozen; editorial fixes only if needed |
| `lib/persistence/metric-recompute-queue.ts` | Extend `consume` to accept required/optional org for callers; parse `METRIC_RECOMPUTE_ORGANIZATION_ID` in config; keep claim/recover org pass-through; **HTTP-facing config must fail closed** on missing/invalid org when enabled |
| `workers/aggregate-metrics.ts` | Thread required `organizationId` into consume/recover/claim for the org-scoped tick path; enforce pre-start mismatch gate |
| `app/api/internal/metric-recompute/route.ts` | Enforce decision table §2.2; never read caller org; pass trusted org into tick |
| `.env.example` | Document empty `METRIC_RECOMPUTE_ORGANIZATION_ID=` (disabled/unset by default) |
| `tests/unit/m5-6c-recompute-worker.test.ts` | Extend unit coverage for scoped tick / config |
| `tests/unit/m5-6c-recompute-worker-architecture.test.ts` | Update only as needed for new invariants |
| `tests/unit/m5-6e3-org-scoped-claim-architecture.test.ts` | **Update** route assertion per §8 (replace “route has no organizationId” with stronger env-only / no-body-org assertions)—do not weaken SQL/tenant protections |
| **New** `tests/unit/m5-hr1a-org-scoped-recompute*.test.ts` (unit and/or architecture) | Adversarial isolation matrix §5 |

### 4.2 Explicitly forbidden in HR1.a implementation

- Any file under `supabase/migrations/`
- Hosted SQL sessions, resets, applies, canary drains
- `app/api/internal/metric-rollover/**` (HR1.b)
- Worker ENABLE defaults flipping to on; cron; `vercel.json` schedulers
- M5.5 metric arithmetic / persistence formula edits
- E4, M7, AI, purchasing, inventory mutation paths
- Editing frozen E.3 / PRA-1 / BACKGROUND_JOBS / SERVICE_ROLE docs except a one-line pointer **if** a later doc-alignment pass is separately approved
- Dependency / lockfile changes
- Git commit/push unless explicitly requested

### 4.3 Library null semantics (clarification)

`MetricRecomputeQueue.claim` / `recover` may keep `organizationId?: string | null` for non-HTTP callers and E.3 regression tests. The **HTTP tick path** must always supply a validated non-null UUID. `consume` today hard-codes null; the implementation slice must stop that hard-code for the HTTP/tick path (either by required argument on consume for that path, or by a scoped consume API the route exclusively uses). Silent null inside the enabled HTTP path is a contract violation.

---

## 5. Isolation / retry test matrix (implementation slice)

| ID | Case | Expect |
|---|---|---|
| T1 | ENABLE≠1 | 404; no RPC |
| T2 | ENABLE=1, secret short/missing | 503; no RPC |
| T3 | ENABLE=1, bad bearer | 401; no RPC |
| T4 | ENABLE=1, auth OK, org env absent | 503; no RPC |
| T5 | ENABLE=1, auth OK, org env non-UUID | 503; no RPC |
| T6 | Body/query/header forged foreign org | Ignored; trusted env org used; never claim foreign |
| T7 | Two-org fixture; trusted=org A; older queued work for org B | Claim/recover/consume only A |
| T8 | Claim stub returns foreign `organization_id` | No start/complete/fail; mismatch fail-closed |
| T9 | Duplicate tick / same generation | Idempotency key stable; no double logical success identity |
| T10 | Retryable fail → `retry_wait` → later org-scoped recover/claim | Retry/DLQ semantics preserved; still org-scoped |
| T11 | Fenced complete/fail (wrong token / expired lease) | Existing fence outcomes; no scope widen |
| T12 | Malformed concurrency env | 503; no RPC |
| T13 | Architecture: route never selects tenant from request body/query | Static assertion |
| T14 | Architecture: enabled HTTP path never passes `p_organization_id: null` for consume/recover/claim | Static or unit assertion |
| T15 | ENABLE default / `.env.example` unset | Workers remain OFF by documentation and config defaults |

Live hosted tests are **out of HR1.a implementation** unless separately approved; local unit/architecture are required for the implementation slice.

---

## 6. Rollback and fail-closed requirements

### 6.1 Operational rollback (any environment)

1. Unset or set `METRIC_RECOMPUTE_WORKER_ENABLED` to anything other than `"1"` → immediate **404**, zero ticks.
2. Unset `METRIC_RECOMPUTE_ORGANIZATION_ID` while ENABLE remains `1` → **503**, zero queue ops (fail closed; **not** global).
3. No code rollback is required to stop risk if flags are correct.

### 6.2 Implementation rollback

If the implementation slice is reverted: repository returns to today’s global-null HTTP tick **shape**, which remains **unsafe to enable**. Reversion must keep ENABLE off. Re-enabling global HTTP tick against multi-tenant queues remains **NO-GO**.

### 6.3 Fail-closed invariants (non-negotiable)

- Disabled by default.
- Enabled without valid org → 503, not global.
- Caller cannot choose tenant.
- No SQL privilege expansion.
- No silent catch that retries without org.

---

## 7. Hosted prerequisites (not part of this freeze or of HR1.a code)

Before **any** future enablement approval (separate from HR1.a implement and from this freeze):

1. **Read-only** confirm hosted functions expose E.3 trailing `p_organization_id uuid` on:
   - `claim_sku_daily_metric_recompute_requests`
   - `recover_expired_sku_daily_metric_recompute_leases`
2. Confirm consume still accepts `p_organization_id`.
3. Confirm live env: ENABLE ≠ `1`, rollover ENABLE ≠ `1`, no scheduler.
4. Canary org id recorded; non-canary claimable policy agreed under a later runbook.

This freeze does **not** run those checks and does **not** authorize them.

---

## 8. E.3 architecture test handling

Current freeze in `tests/unit/m5-6e3-org-scoped-claim-architecture.test.ts`:

- Asserts optional TS `organizationId` on claim/recover.
- Asserts `ROUTE` does **not** contain `organizationId` (locks pre-HR1 HTTP global shape).

**This docs freeze does not change that test.**

**Later implementation slice must:**

1. **Keep** migration security, null-default SQL, global lease-ceiling, and service_role-only execute assertions.
2. **Replace** the brittle “route must not contain the substring `organizationId`” check with assertions that preserve equal or stronger tenant safety, for example:
   - Route does not read organization from body/query.
   - Route / config require env `METRIC_RECOMPUTE_ORGANIZATION_ID` when enabled.
   - Enabled path never hard-codes `p_organization_id: null` for consume/recover/claim.
3. Never remove org-filter or grant/search_path protections from the E.3 architecture suite.

---

## 9. Relationship to PRA-1 / HR1.b / later milestones

| Item | Status under this freeze |
|---|---|
| PRA-1 P0-3 (global HTTP tick) | Addressed **by contract** for a future org-scoped enablement path; **not** closed in production until implement + hosted verify + separate ENABLE approval |
| HR1.b rollover HTTP org scope | Explicitly excluded |
| M7-PB1 / E4 / M7.3 / AI | Unchanged; still separate tracks |
| Continuous multi-tenant production worker | **Not** authorized; HR1.a is canary/single-org opt-in only |

---

## 10. Explicit GO / NO-GO

| Action | Decision |
|---|---|
| Accept this document as the HR1.a freeze | **GO** (docs only) |
| Start HR1.a TypeScript implementation | **NO-GO** until explicit “implement HR1.a” approval citing this file |
| Commit this freeze document | Only if the user explicitly requests a commit |
| Deploy / enable workers / cron / hosted canary drain | **NO-GO** |
| Change SQL/RPC/migrations | **NO-GO** |
| Implement rollover org HTTP (HR1.b) | **NO-GO** under this freeze |
| Fall back to global HTTP processing | **FORBIDDEN** |
| Query hosted infrastructure as part of this freeze | **NO-GO** |

---

## 11. Freeze checklist (this session)

- [x] Contract path created: `docs/M5_HR1_A_ORG_SCOPED_RECOMPUTE_CONTRACT.md`
- [x] E.3 reconciliation stated (narrow supersession; global null preserved elsewhere)
- [x] Runtime decision table frozen
- [x] Claim mismatch / fail-closed rules frozen
- [x] Permitted implementation files listed
- [x] Test matrix listed
- [x] Rollback / hosted prereqs / GO-NO-GO listed
- [ ] Implementation — **not authorized**
- [ ] Enablement — **not authorized**

**STOP.** No code, tests, SQL, hosted ops, or further milestones under this approval.
