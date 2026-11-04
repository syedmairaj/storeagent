# PRA-1 — Production Readiness & Next Milestone Audit

**Mode:** AUDIT ONLY (docs deliverable). No implementation authorization.
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Verified baseline:** `main` @ `bd93b49316f4f2b714270e6d5fe21e230dc83520` — `docs(actions): close R2 enterprise UX functional acceptance`
**Ancestor check:** `bd93b49` == HEAD (exact match).
**Dirty tree at audit time (preserved; not reconciled):**
`M README.md`, `M docs/BACKGROUND_JOBS.md`, `M docs/SERVICE_ROLE_BOUNDARY.md`, `D docs/StoreAgent_Roadmap_2026.docx`, `?? .vitest/`, `?? docs/COMPETITIVE_UX_MERCHANT_PAIN_POINT_ROADMAP.md`, `?? docs/M5_6E_2_HOSTED_CANARY_READINESS.md`, `?? docs/StoreAgent_Updated_Roadmap.docx`, `?? docs/archive/`, `?? supabase/snippets/`
**CLAUDE.md / AGENTS.md:** absent.
**As-of:** 2026-11-04.

**Authority when docs conflict:** verified code, migrations, and tests over stale status prose. Notable drift: `docs/IMPLEMENTATION_STATUS.md` / dirty `README.md` still describe pre-M7 / pre-E.4 postures; HEAD already includes M7.2–M7.4e and E3.3-R2.e.

This audit does **not** authorize app code, SQL, RLS, workers, hosted ops, live AI, E4, M7.3 activation, inventory mutation, purchasing, payments, dependency changes, or Git operations.

---

## Executive verdict

**NO-GO for production merchant decisions, live AI, continuous hosted workers, M7.3 approval success, and purchasing.**

StoreAgent has a strong **local / fail-closed** stack (CSV→canonical persistence, M5 metrics, M6 forecast schema, M7 decision engine, dormant persistence/lifecycle, synthetic Decision Brief E0–E3.3 + R2 UX). It does **not** yet have a **trusted production path** from live commerce facts → continuous metrics → eligible forecasts → production decisions → merchant approval.

Passing unit/architecture tests and the Actions Playwright suite prove **contracts and synthetic UX**, not production readiness.

---

## A. Verified baseline and current architecture

### A.1 Verified git state

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `bd93b49` |
| Prior product closeout on HEAD | E3.3-R2.e functional acceptance (`docs/E3_3_R2_E_ACCEPTANCE_CLOSEOUT.md`) |
| Dirty files | Present (listed above); intentionally untouched by this audit |

### A.2 Product pipeline (intended)

```
provider data (CSV → Shopify → …)
  → canonical M2 persistence + bindings
  → M4 data-quality issues
  → M5 sku_daily_metrics (+ source events / recompute queue)
  → M6 forecast persist/publish (production NOT APPROVED)
  → M7 decideInventoryAction → inventory_actions (production writer dormant)
  → Decision Brief (synthetic today; engine_bound blocked until E4)
  → human approval (M7.3 RPCs exist; always unapprovable today)
  → purchasing / POs (FORBIDDEN / not built)
```

Thesis (README / PROJECT_HANDOFF): data owns reality; deterministic engines own commercial truth; AI explains only; merchants approve until automation earns trust.

### A.3 What HEAD actually ships (verified)

| Layer | Evidence | Production posture |
|---|---|---|
| CSV provider library | `lib/providers/csv/*`, many `tests/unit/provider-csv-*.test.ts` | Library + SyncRun orchestration; **no** `app/` CSV import route found |
| Shopify | `lib/providers/shopify/{types,identity,pagination,status}.ts` + `tests/unit/provider-shopify-architecture.test.ts` | Boundary only; **no** SDK / sync |
| M4 data quality | `lib/data-quality/*`; status CLOSED in IMPLEMENTATION_STATUS | Local foundation; not a merchant trust UI |
| M5 metrics + queue | migrations `20261014*`–`20261028*`; `lib/metrics/*`; `workers/aggregate-metrics.ts`; internal routes | Local closed; hosted schema + E.4 one-shot canary closed; **HTTP workers OFF** |
| M6 forecasting | `lib/forecasting/*`; migrations through `20261030200000` | Local + hosted **schema** closed; **production operation NOT APPROVED** |
| M7 engine | `lib/decision-engine/*` (`decideInventoryAction`) | Deterministic rules; fixture/eval path; **not** live M5/M6 bound |
| M7.2 persistence | `20261031100000_*`; `lib/persistence/persist-inventory-action.ts` | Dormant harness-only; hard-false trust |
| M7.3 lifecycle | `20261031120000_*`, `20261031130000_*` | RPCs local; `inventory_action_is_merchant_approvable` **always false** |
| Actions UX + Brief | `app/(app)/app/[organizationId]/actions/*`, `components/actions-demo/*`, `lib/decision-brief/*`, `lib/demo/*` | Synthetic attestation `m7-synthetic-demonstration-v1`; R2.e closed |
| AI explanation | `lib/decision-brief/ai/*`; no OpenAI/Anthropic deps in `package.json` | Default OFF; stub/replay; soft-enable server flag |
| Workers stubs | `workers/generate-actions.ts`, `workers/explain-actions.ts` | **Empty files** |

---

## B. Readiness matrix (six areas)

Legend: **IMPLEMENTED** / **PARTIAL** / **MISSING** / **BLOCKED**. Severity reflects production merchant risk if treated as ready.

### 1. Data ingestion — **PARTIAL** (P1 overall; returns P1; Shopify sync P2 for V1 sequence)

| Topic | Status | Evidence |
|---|---|---|
| CSV normalize + persist orchestration | **IMPLEMENTED** (library) | `lib/providers/csv/import-execution.ts`, `import-assembly.ts`, SyncRun lifecycle/idempotency; M3 docs + unit/live CSV tests |
| Merchant/ops CSV HTTP surface | **MISSING** | No `app/api/**` CSV import route matched |
| Returns/refunds CSV normalization | **MISSING** | Domain type includes `return_refund` (`lib/commerce-domain/types.ts`); **zero** `return_refund` usage under `lib/providers/csv/`; IMPLEMENTATION_STATUS M3.5 notes returns out of that slice |
| Provider-independent identity | **IMPLEMENTED** | `lib/providers/bindings.ts`, `external-identity.ts`, CSV identity helpers |
| Tenant/store/location/variant isolation | **IMPLEMENTED** (persistence contracts) | Trusted CSV context + M2 RLS migrations; CSV content cannot establish org ownership (M3 contract) |
| Idempotency / duplicates / conflicts | **IMPLEMENTED** (library) | SyncRun idempotency; duplicate analysis; history conflict quarantine |
| Shopify connector | **PARTIAL** (architecture only) | Shopify files + architecture test forbids SDK/metrics/forecast/decision deps; product sequence still CSV→Shopify |
| Stale/missing input fail-closed | **PARTIAL** | Null-vs-zero preserved in metrics/CSV; merchant-facing freshness UX still synthetic/Unknown |

### 2. Deterministic inventory engine — **PARTIAL** (P0 for production use; P2 for local engine math)

| Topic | Status | Evidence |
|---|---|---|
| M5 sales/inventory metrics math + schema | **IMPLEMENTED** (local); hosted schema/canary **PARTIAL** | `lib/metrics/*`; `sku_daily_metrics` migration; E.4 verified 0/0/7 on canary grain |
| M5 continuous recompute | **BLOCKED** (ops) | Routes require `METRIC_*_WORKER_ENABLED=1`; `.env.example` empty; no `vercel.json`; consume path hardcodes `p_organization_id: null` |
| M6 forecast engine + persistence/publication | **IMPLEMENTED** (code/schema); production **BLOCKED** | Local P1–P4d; hosted schema CLOSED; handoff: production persist/publish/eval **NOT APPROVED**; trust flags hard-false on diagnostics |
| M7 REORDER/REDUCE/PROMOTE/WATCH | **IMPLEMENTED** (pure engine) | `lib/decision-engine/{decide,reorder,reduce,promote,watch-healthy,conflict-resolution,confidence,priority}.ts` |
| Qty / confidence / reason provenance | **IMPLEMENTED** (engine); **PARTIAL** (production linkage) | Engine reason codes + evidence snapshot; demo uses separate presentation codes (`below_reorder_point` vs `BELOW_REORDER_POINT`) |
| Unit vs integration coverage | **PARTIAL** | Strong unit/architecture + fixture evaluation (`tests/unit/decision-*.test.ts`, `m7-fixture-*`); **no** production M5→M6→M7 integration path; persistence adapter architecture tests **forbid** importing `decideInventoryAction` |

### 3. Decision Brief / AI — **PARTIAL** (synthetic **IMPLEMENTED**; engine_bound / live AI **BLOCKED**)

| Topic | Status | Evidence |
|---|---|---|
| E0–E3.3 vs contracts | **IMPLEMENTED** (synthetic) | Contracts + `lib/decision-brief/*` + AI adapter/soft-enable tests; R2.e closeout |
| Evidence grounding + semantic validation | **IMPLEMENTED** (gates) | `validate-grounding.ts`, `validate-claims.ts`, `ai/validate-candidate.ts`; architecture bans provider SDKs |
| Default-off AI + safe fallbacks | **IMPLEMENTED** | `server-enablement.ts` defaults `enabled:false`, empty allowlist; orchestration falls back to `buildDeterministicFallbackBrief` |
| Synthetic-only vs engine-bound | **BLOCKED** (engine_bound) | `validateGrounding` rejects `briefMode === "engine_bound"` (`INVALID_BRIEF_MODE`); E1 tests assert E4 gate |
| AI changing commercial truth | **Mitigated / BLOCKED for live** | No AI SDK dependency; structured + semantic gates; merge paths force `productionApprovalEligible: false` |

### 4. Tenant security & data trust — **PARTIAL** (local controls strong; hosted worker enable **P0 risk**)

| Topic | Status | Evidence |
|---|---|---|
| organization_id RLS / membership | **IMPLEMENTED** | M1/M2 RLS migrations; `tests/unit/m2-rls-tenant-enforcement.test.ts`, `rls-policy.test.ts`, `foundation-rls-architecture.test.ts` |
| Service-role boundary | **PARTIAL** | `docs/SERVICE_ROLE_BOUNDARY.md` (dirty locally); workers use admin client / RLS bypass by design — tenant scope must come from durable rows |
| Cross-tenant isolation (HTTP workers) | **BLOCKED** if enabled naively | `createMetricRecomputeQueue.consume` always `p_organization_id: null`; tick recover/claim omit org → global; E.3 added optional org on claim/recover SQL but HTTP tick does not pass it |
| M7 merchant approval fail-closed | **IMPLEMENTED** | SQL `inventory_action_is_merchant_approvable` → `false` always (`20261031130000_m7_3c_trusted_lifecycle_rpcs.sql`) |
| Freshness / observation timestamps on Actions | **MISSING** / synthetic Unknown | Demo fixtures lack live `decision_as_of`; Brief contract requires Unknown/Synthetic, not live freshness |
| Auditability | **PARTIAL** | Append-only action_events design; harness rows unapprovable; production create path reserved |

### 5. Background processing & hosted readiness — **PARTIAL** (code **IMPLEMENTED**; production runtime **BLOCKED**)

| Topic | Status | Evidence |
|---|---|---|
| Ingestion/job infra (M5) | **IMPLEMENTED** (local) | Source events → recompute requests → claim/lease/generation fencing → complete/fail; rollover enrollment |
| Replay / retry / DLQ-ish | **IMPLEMENTED** (M5 queue) | Retry policy in `workers/retry.ts`; fail classes; deferred complete; terminal unknown |
| Idempotency | **IMPLEMENTED** | Worker idempotency key includes claimed generation; SyncRun keys for CSV |
| Local vs hosted | **PARTIAL** | Local adversarial/worker tests exist; E.4 Stages 0–4 hosted canary **CLOSED** (one-shot + rollover×2); continuous HTTP/cron **unverified / disabled** |
| Canary leftover | **BLOCKED** (ops ban) | Final canary request `queued` dirty=2 claimed=1 — **do not drain** (`docs/M5_6E_4_HOSTED_CANARY_RUNBOOK.md`) |
| Live host env flags | **UNKNOWN** | Repo config OFF; handoff: live hosting env **not** verified at M6 schema closeout |
| M7 / forecast workers | **MISSING** / stubs empty | `generate-actions.ts`, `explain-actions.ts` empty |
| M7 schema on hosted | **UNKNOWN** | Migrations exist locally (`202610311*`); PROJECT_HANDOFF hosted closeout stops at M6 `20261030200000` — operator must confirm apply state |

### 6. Production workflow & UX — **PARTIAL** (demo **IMPLEMENTED**; production workflow **MISSING**)

| Topic | Status | Evidence |
|---|---|---|
| Synthetic Actions demo | **IMPLEMENTED** | Fixtures + workspace + Decision Brief panel; synthetic banner assertions in Playwright |
| Gap vs real merchant decisions | **MISSING** bridge | Fixtures explicitly must not import M5/M6/lifecycle (`lib/demo/m7-decision-demo-fixtures.ts` header) |
| Trusted evidence / data-quality states in UI | **PARTIAL** | Unknown rendering on demo; no live DQ/provenance chips from M4/M5 |
| Production approval eligibility | **BLOCKED** | `productionApprovalEligible: false` in fallback/merge; M7.3 predicate always false |
| M7.3 lifecycle | **IMPLEMENTED** infra / **BLOCKED** success | Local schema+RPCs+E2E reject harness; no UI RPC wiring |
| Safe human approval ≠ purchasing | **IMPLEMENTED** (contract) | M7.3a forbids PO/supplier/payment/inventory mutation on approval |
| Playwright coverage | **PARTIAL** | `tests/e2e/actions-acceptance.spec.ts` — six viewports, synthetic only; R2.c search/sort deferred; operator-run outside sandbox per closeout |

---

## C. P0 / P1 / P2 gaps (file evidence)

### P0 — do not enable / do not claim ready

| ID | Gap | Evidence |
|---|---|---|
| P0-1 | No trusted production decision source-of-create (M5/M6 → M7 writer) | `persist-inventory-action.ts` harness-only; `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE`; architecture tests ban `decideInventoryAction` in persist adapter |
| P0-2 | Production forecasts ineligible; M6 operation NOT APPROVED | `docs/M7_0_CONTRACT_ADDENDUM.md` §D; PROJECT_HANDOFF; diagnostic trust hard-false |
| P0-3 | Enabling current HTTP metric tick is cross-tenant-unsafe without org-scoped consume/claim wiring | `metric-recompute-queue.ts` consume `p_organization_id: null`; `runMetricRecomputeTick` recover/claim without org; routes 404 unless ENABLE=1 |
| P0-4 | Merchant approval success path impossible by design (and must stay so until trusted create) | `inventory_action_is_merchant_approvable` always `false` |
| P0-5 | `engine_bound` Brief / E4 / live AI / purchasing would invent production trust | Grounding reject; no AI SDK; R2.e out-of-scope list |

### P1 — high value, blocks merchant trust path

| ID | Gap | Evidence |
|---|---|---|
| P1-1 | No merchant CSV import HTTP/API | Library only under `lib/providers/csv/*` |
| P1-2 | Returns/refunds CSV path missing → net demand / returns incomplete for real imports | No CSV `return_refund` implementation |
| P1-3 | Continuous hosted metrics (multi-store, TZ recovery, HTTP rollover) unverified | E.4 is canary one-shot + frozen as_of rollover support only |
| P1-4 | Incoming quantity / inventory age remain unknown without trustworthy history | IMPLEMENTATION_STATUS / DOMAIN_INVARIANTS notes |
| P1-5 | Status docs drift (M7 “NOT STARTED”, README NEXT STEP M5.6D) vs HEAD | `docs/IMPLEMENTATION_STATUS.md` L54–56; dirty `README.md` |
| P1-6 | Live host env worker/AI flags not operator-verified | Handoff §5 open P1; `STOREAGENT_AI_*` not in `.env.example` |

### P2 — important but not immediate production blockers

| ID | Gap | Evidence |
|---|---|---|
| P2-1 | Shopify sync not started (planned after CSV) | Architecture-only Shopify module |
| P2-2 | R2.c queue search/sort deferred | E3.3-R2.e closeout |
| P2-3 | Independent human visual ≥9/10 not claimed | R2.e §4 |
| P2-4 | Empty `generate-actions` / `explain-actions` workers | Empty files under `workers/` |
| P2-5 | Demo vs engine reason-code vocabulary divergence | M7.4e contract §1.5 |

**Documented claims ≠ verified production:** hosted canary metrics, M6 schema row counts=0, and Playwright PASS are **historical/operator** records. This session did not re-query hosted SQL or re-run Playwright.

---

## D. Security and data-integrity blockers

1. **Service-role workers bypass RLS** — safe only with durable grain/org scope. Current HTTP tick still **globally consumes** and **globally claims** when enabled → P0 for multi-tenant hosted enablement.
2. **Harness/dormant decisions must remain unapprovable** — already enforced in SQL; any UI wiring that implies success is a trust bug.
3. **AI output is never authorization** (Threat 15) — keep soft-enable server-resolved; never client flags.
4. **Null ≠ zero** — preserve across CSV, M5, M7; do not fill missing incoming/returns with 0 to force REORDER.
5. **E.4 canary dirty=2/claimed=1** — leave untouched; draining under global workers risks confusing canary with foreign work if queue non-empty.
6. **Approval ≠ buy** — M7.3 must never create POs / contact suppliers / mutate inventory.

---

## E. Local vs hosted verification status

| Capability | Local | Hosted (per docs; not re-probed here) |
|---|---|---|
| CSV library + PG conflict tests | Yes (unit/live) | Unknown / not a hosted import product |
| M5 schema + worker SQL | Yes | Schema deployed through M5.7 F1/T4; E.4 canary Stages 0–4 closed |
| M5 HTTP workers / cron | Code present; disabled | OFF by repo; live env **unknown** |
| M6 schema + adapters | Yes | Schema CLOSED through `20261030200000`; operation NOT APPROVED; rows 0 at closeout |
| M7.2/M7.3 schema/RPCs | Yes (migrations + live tests) | **Unknown** apply state |
| Actions Playwright | Operator-recorded PASS (R2.e) | N/A (local auth demo) |
| Live AI provider | Absent | Absent |

---

## F. Recommended next 3 engineering milestones (dependency order)

1. **M7-PB1 — Production Decision Binding Prerequisites (fail-closed adapter + source-of-create contract)**
   Map trusted M5 grains → `InventoryDecisionInput` with `forecastEligibility=ineligible` until M6 production approval; hard-false merchant eligibility; **no** Actions production banner removal; **no** M7.3 success; **no** AI; **no** worker ENABLE.

2. **M5-HR1 — Org-scoped hosted metric runtime (canary-only)**
   Wire HTTP/SQL callers to pass explicit `organization_id` on consume+claim+recover+rollover; verify live host env flags; optional drain of **new** canary work only under isolation proof. Do **not** globally ENABLE against merchant queues.

3. **M6-PE1 → E4-prep — Production forecast eligibility for a single canary grain, then engine_bound Brief**
   Only after (1)+(2): approve algorithm/publication for canary; then E4 grounding that cannot mutate quantities; still keep M7.3 success gated on production source-of-create + eligibility predicate change under a **separate** approval.

Purchasing / Shopify sync / live LLM providers remain **later** and out of this sequence.

---

## G. ONE recommended immediate milestone

### Name

**M7-PB1 — Trusted Metric→Decision Binding Gate (contract + fail-closed adapter)**

### Why now (after E3.3-R2)

R2 closed the **synthetic merchant UX** track. The highest-value remaining gap is not more demo chrome or live AI — it is the missing **honest bridge** from durable M5 facts to `decideInventoryAction` without pretending forecasts/approvals exist. This advances the thesis (“data → deterministic decisions”) while preserving every fail-closed gate.

### Narrow scope

**In:**
- Docs freeze: production source-of-create eligibility predicates; forecast-ineligible ⇒ WATCH / abstention rules already in M0.6/M7.0.
- Pure TS adapter: selected `sku_daily_metrics` (+ known supplier lead-time fields only when present) → `InventoryDecisionInput`.
- Architecture/unit tests: adapter never sets production trust/approval true; never calls AI; never writes via merchant lifecycle RPCs; never enables workers.
- Optional local-only harness evaluation using existing `evaluateFixtureInventoryDecision` patterns for comparison — **not** merchant UI.

**Out:**
- E4 `engine_bound` UI delivery
- Live LLM / soft-enable expansion
- M7.3 predicate flip / UI RPC wiring
- M5/M6 HTTP worker ENABLE, cron, canary drain
- CSV HTTP route (follow-on; do not block PB1)
- Shopify, buying, payments, inventory mutation
- Reconciling dirty roadmap/README files unless separately requested

### Acceptance criteria

1. Contract doc states explicit NO-GO list matching this audit §H.
2. Adapter rejects missing org/store/location/variant grain; never invents incoming/returns/forecast.
3. With forecast ineligible, commercial REORDER/REDUCE/PROMOTE only when M0.6 evidence gates pass **without** production forecast claims; otherwise WATCH with explicit codes.
4. Architecture tests: no import of AI providers; no `productionApprovalEligible=true`; no lifecycle RPC success expectations.
5. typecheck/lint/focused tests PASS.
6. Actions demo path unchanged (still synthetic attestation).

### Rollback / fail-closed

- Adapter behind explicit server flag default **OFF** (or not referenced from any route).
- No migration that weakens `inventory_action_is_merchant_approvable`.
- No change to AI enablement defaults.
- If any trust flag accidental true in tests → fail the suite (hard).
- Instant rollback = revert flag/adapter commit; demo UX unaffected.

---

## H. Explicit GO / NO-GO

| Gate | Call | Rationale |
|---|---|---|
| **E4 engine binding** (Brief `engine_bound` delivery) | **NO-GO** | Grounding rejects mode; no trusted production decision stream; forecast ineligible |
| **Live AI** (hosted LLM provider) | **NO-GO** | Beyond E3.3; no SDK; soft-enable defaults OFF; synthetic stub/replay only |
| **Hosted canary / continuous workers** | **NO-GO** (enablement) | E.4 verification closed; leftover dirty=2 banned; HTTP tick still globally consumes/claims; live env unverified |
| **M7.3 approval success** | **NO-GO** | Predicate hard-false; no production source-of-create; demo must not wire RPCs |
| **Purchasing / supplier contact / payments / inventory mutation** | **NO-GO** | Explicitly forbidden across M7.3/M7.4/E3 contracts; not implemented |

| Gate | Call |
|---|---|
| Continue synthetic Actions demo / R2 maintenance | **GO** (already closed functionally) |
| Docs-only audits / PB1 contract+adapter under explicit approval | **GO** after separate implementation approval |
| Read-only hosted SELECT verification of env/flags/M7 migration history | **GO** (operator) |

---

## I. Unknowns requiring operator verification

1. Live hosting environment: confirm `METRIC_RECOMPUTE_WORKER_ENABLED`, `METRIC_ROLLOVER_WORKER_ENABLED`, secrets, and any `STOREAGENT_AI_*` remain unset/disabled.
2. Hosted migration history: are `20261031100000` / `120000` / `130000` (M7.2/M7.3) applied on project `qlsqminsfdntpqdkhxjx`?
3. Non-canary hosted queue depth / foreign claimable rows (before any future org-scoped canary work).
4. Whether dirty local edits to `README.md`, `BACKGROUND_JOBS.md`, `SERVICE_ROLE_BOUNDARY.md` are intentional WIP vs accidental drift.
5. Re-confirm E.4 canary grain still `queued` dirty=2 claimed=1 and foreign fingerprint unchanged — **SELECT only**.
6. Playwright auth artifact freshness for future UX gates (not re-run in this audit).

---

## References (primary)

- `docs/E3_3_R2_E_ACCEPTANCE_CLOSEOUT.md`
- `docs/M7_4E_AI_NATIVE_DECISION_BRIEF_CONTRACT.md`
- `docs/M7_4E_E3_AI_EXPLANATION_ADAPTER_CONTRACT.md`
- `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md`
- `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md`
- `docs/M7_0_CONTRACT_ADDENDUM.md`
- `docs/M5_6E_4_HOSTED_CANARY_RUNBOOK.md`
- `docs/M5_6E_3_CANARY_ISOLATION_DECISION.md`
- `docs/PROJECT_HANDOFF.md` / `docs/IMPLEMENTATION_STATUS.md` (drift noted)
- Code: `lib/decision-engine/*`, `lib/decision-brief/*`, `lib/providers/csv/*`, `lib/persistence/metric-recompute-queue.ts`, `workers/aggregate-metrics.ts`, `supabase/migrations/20261031130000_m7_3c_trusted_lifecycle_rpcs.sql`

---

**STOP.** Await explicit approval before any implementation.
