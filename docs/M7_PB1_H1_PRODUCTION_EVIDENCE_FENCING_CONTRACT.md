# M7-PB1.h.1 — Production Evidence-Fencing Contract Freeze

**Status:** FROZEN for subsequent local fencing validators / writer design (docs only until separately approved)
**Baseline verified:** `main` @ `b0e70590912a1bae27a77e18f3863d723f9a34c4` — `test(m7): verify persisted-grain REORDER diagnostic locally`
**Origin:** PB1.h production readiness & evidence-fencing audit (local diagnostic PROMOTE/REORDER proven; production create/approve blocked)
**Authority when docs conflict:** this freeze for **future** create-time / approval-time evidence fencing, supplier phantom-race strategy, metric freshness coverage, dual lead-time disclosure, and unlock prerequisites. Existing freezes remain authoritative for current behavior:
- PB1 diagnostic binding: `docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md`
- M7.2 persistence (dormant / harness): `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md`
- M7.3 lifecycle (fail-closed merchant approve): `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md`
- M5 formulas / SA008 / generations: `docs/INVENTORY_FORMULAS.md`, `lib/metrics/*`, `supabase/migrations/20261015110000_m5_5_sku_daily_metric_recompute.sql`, M5.6B/C migrations
- PE1.b.6b: worksheet + runtime evidence (JWT **UNPROVEN**)

This freeze does **not** authorize TypeScript, SQL, tests, schema, UI, migrations, ledger repair, hosted access, workers/cron/HTTP enablement, M7.2 production create, M7.3 merchant-approvable success, formula changes, purchasing, inventory mutation, or Git operations.

---

## 0. Verdict

| Gate | Result |
|---|---|
| Freeze create-time + approval-time evidence-fencing contract (docs only) | **GO** |
| Implement pure-TS fence validators under this contract | **GO** only after explicit local slice approval |
| Unlock `m5_sku_daily_metric_bound_v1` create path | **NO-GO** (successor prerequisite listed; not granted) |
| Flip `inventory_action_is_merchant_approvable` | **NO-GO** |
| Repair local migration ledger / hosted deploy / PE1.b.6b J-matrix | **NO-GO** (separate tracks) |
| Invent verified supplier delivery performance or org-default LT as supplier facts | **FORBIDDEN** |

**Product intent:** Freeze the **minimum safe** metric + supplier fencing design required before any future trusted production decision create or merchant approval, without enabling either. PB1.c/f/d/g remain **diagnostic preparation only**.

---

## 1. Create-time transaction (normative successor)

Applies only to a **future** approved production create writer that persists `evidence_source_class = m5_sku_daily_metric_bound_v1`. Today’s RPC **always rejects** that class (`PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE`).

### 1.1 Authorization (before TX body)

| Requirement | Rule |
|---|---|
| Caller privilege | `service_role`-only `SECURITY DEFINER` create RPC (same posture as M7.2 harness persist) |
| Tenant scope | Param `organization_id` / `store_id` / `location_id` / `variant_id` must match durable grain FKs; payload IDs must echo params |
| Evidence class | Only after separate unlock: `m5_sku_daily_metric_bound_v1` |
| Trust claims | Production create may set merchant/production claim columns **only** under a later M7.2/M7.3 unlock freeze; until then hard-false / rejected |
| `service_role` meaning | Privilege ≠ evidence provenance (unchanged from M7.2a) |
| Forecast | `forecast_run_id` remains null until separate M6 production eligibility approval |

### 1.2 Lock order (deadlock-safe)

Fixed order inside one transaction. Do not invent alternate lock graphs without amending this freeze.

1. **Store** row (`stores`) for `(organization_id, store_id)` — `SELECT … FOR SHARE` (timezone / existence).
2. **Metric** row (`sku_daily_metrics`) for natural key `(organization_id, store_id, location_id, variant_id, metric_date, algorithm_version)` — `SELECT … FOR UPDATE`.
3. **Recompute request** row(s) for the same grain + algorithm (if any) — `SELECT … FOR UPDATE` on matching `sku_daily_metric_recompute_requests`.
4. **Supplier product** row (when decision uses supplier LT / REORDER constraints) — see §2.
5. **Optional SHARE** on commerce source tables only if create revalidates an SA008-class source token in-TX (same five-table family as M5.5 commit: stores already held; orders / order_items / return_refunds / inventory_snapshots). Prefer reusing `sku_daily_metric_source_snapshot` + token compare under those locks rather than a new lock protocol.
6. **Insert** `inventory_actions` (+ reserved atomic `created` ActionEvent when that path is separately approved).

If any lock wait exceeds the project’s bounded create `lock_timeout` (successor must set an explicit timeout; default proposal: align with M5.5 2s commit posture unless a later freeze proves otherwise) → abort; do not partial-commit.

### 1.3 Source reads + evidence validation (in-TX)

After locks:

| Check | Fail closed when |
|---|---|
| Algorithm | `algorithm_version ≠ m5-derived-metrics-v1` |
| Store-local date | Locked metric `metric_date` ≠ store-local as-of date for `stores.timezone` at TX start |
| Timezone | Create `pinned_time_zone` ≠ trusted store timezone |
| Metric watermark | Locked `updated_at` (and date/algo) ≠ create `metric_source_watermark` / provenance token |
| Generations | Open request exists with `dirty_generation ≠ applied_generation` **or** status ∈ `{queued,claimed,running,retry_wait,failed}` for this grain → reject `PENDING_RECOMPUTE` |
| Window pending | Any **unconsumed** `sku_daily_metric_source_events` for this grain with `source_date ∈ [metric_date − 89, metric_date]` → reject (see §3) |
| Source token | If create binds SA008 token: re-snapshot under locks; mismatch → `SA008` / `STALE_SOURCE_TOKEN` |
| Incoming | Persisted `eligible_incoming_*` nullability/reason coupling intact; commercial REORDER/REDUCE require known incoming |
| Supplier facts | §2 + §4 |
| Dual LT disclosure | §5 fields present on create payload / evidence provenance |
| Engine | Frozen `decideInventoryAction` / binding rules only — **no formula fork** |
| Body / provenance hashes | Re-derive in RPC; mismatch → reject (M7.2 posture) |

### 1.4 Canonical decision binding

1. Map locked metric (+ locked supplier facts) → `InventoryDecisionInput` using PB1 mapping rules (forecast remains ineligible unless separate M6 unlock).
2. Evaluate frozen engine once inside the writer (or accept precomputed body only if RPC re-derives and verifies hashes from locked facts — prefer **recompute-in-TX** for production).
3. Persist immutable recommendation body per M7.2a (grain, action, quantity, evidence snapshot, provenance fingerprints, hashes).

### 1.5 Idempotency + rollback

| Case | Behavior |
|---|---|
| First insert of M7.2 idempotency identity | `disposition=created` |
| Same identity + same `decision_body_hash` | `disposition=replayed` |
| Same identity + divergent body | `DECISION_IDEMPOTENCY_BODY_CONFLICT` |
| Any validation / lock / engine failure | Full TX rollback; no action row; no merchant event |
| Partial writer crash after insert | Replay uses idempotency; no overwrite of immutable fields |

PB1 diagnostic loaders remain **out of band** and are **not** the production create RPC.

---

## 2. Supplier concurrency + phantom-race strategy

### 2.1 Exact mapping fence

Production create/approve that consumes supplier LT must bind:

| Field | Role |
|---|---|
| `organization_id` | Tenant |
| `supplier_id` | Chosen supplier |
| `variant_id` | SKU grain variant |
| `supplier_product_id` | Durable `supplier_products.id` |
| `supplier_product_updated_at` | Watermark (revision). No separate revision column exists today — **`updated_at` is the revision token** |

Unique key today: `(organization_id, supplier_id, variant_id)` on `supplier_products` (`20261011133000_m2_5_suppliers_purchase_orders.sql`). **Not** unique on `preferred`.

### 2.2 Explicit vs implicit selection

| Mode | Create-time rule |
|---|---|
| **Explicit** | Caller supplies `supplier_id` (+ resolved `supplier_product_id`). Lock that exact row. Preference flags ignored except for audit echo. |
| **Implicit preferred** | No `supplier_id`. Under transactional lock coverage (§2.3), require **exactly one** row with `preferred = true` and non-null valid `lead_time_days`. 0 → `SUPPLIER_FACTS_ABSENT`; >1 → `SUPPLIER_FACTS_AMBIGUOUS`. |

Org planning defaults and `suppliers.default_lead_time_days` remain **forbidden** substitutes (`ORG_PLANNING_DEFAULTS_FORBIDDEN` / `SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN`).

### 2.3 Phantom preferred INSERT/UPDATE races

**Problem (proven by schema):** two sessions can flip/insert preferred rows between non-transactional PB1.f reads (PB1.g TOCTOU documentation). A naïve `SELECT preferred …` without range protection allows phantoms.

**Frozen strategy (enforceable successor):**

1. **Always lock the chosen `supplier_products` row** with `SELECT … FOR UPDATE` by primary key after identity resolution.
2. **Implicit preferred path — serialization:** before counting preferred rows, take a **transaction-scoped advisory lock** keyed by `(organization_id, variant_id)` (deterministic hash; document exact lock namespace in implementation slice). Then:
   - `SELECT … FOR UPDATE` **all** `supplier_products` rows for that org+variant (or at least all `preferred = true` rows plus any candidate being promoted).
   - Re-evaluate preferred-with-LT cardinality under those locks.
3. **Explicit path:** advisory lock optional; PK `FOR UPDATE` + watermark compare is mandatory.
4. **Constraint follow-up (separate owner-authorized migration, not this freeze):** optional partial unique index “at most one preferred per (organization_id, variant_id)” as defense-in-depth. Until present, advisory + multi-row `FOR UPDATE` remains the concurrency authority.
5. Concurrent DELETE of locked row → not found → `SUPPLIER_MAPPING_NOT_FOUND` / revoked.
6. Concurrent LT/preferred UPDATE → wait on lock → re-read; if `updated_at` ≠ create watermark or LT invalid → reject `SUPPLIER_FACTS_STALE` / `SUPPLIER_FACTS_INVALID`.

No caching of supplier facts across create attempts.

---

## 3. Metric freshness coverage

### 3.1 Why current-day-only pending is insufficient

`docs/IMPLEMENTATION_STATUS.md` already records: exact current-date grain checks have a **false-ready gap** because historical source events for the same grain still affect current-day velocity windows (`source_date ∈ [metric_date − 89, metric_date]` per M5.6C completion / M5.6B dirtying).

**Frozen rule:** production create freshness **must** use **grain + 90-day relevance window + generation state**, not “current-day request only.”

Org-wide pending (`lib/metrics-activation/pending-work.ts`) remains an acceptable **conservative diagnostic** fence (false-blocks unrelated grains). It is **not** sufficient as the sole production create definition once grain-scoped fencing exists.

### 3.2 Mandatory create-time freshness checks

| Axis | Pass condition |
|---|---|
| Source token / SA008 | Create watermark matches in-TX snapshot when token-bound; includes inventory snapshots, orders/items/returns, and (after trusted-incoming) PO + attestation contributions to the token |
| Generations | No open dirty work: for the grain, either no request row or `dirty_generation = claimed_generation = applied_generation` with terminal success semantics; any `dirty ≠ applied` or open status → reject |
| Window events | Zero unconsumed events for grain with `source_date` between `metric_date − 89` and `metric_date` inclusive |
| Store-local date | Metric date equals store-local as-of; date rollover mid-TX → reject `METRIC_DATE_NOT_CURRENT` |
| Algorithm | `m5-derived-metrics-v1` only |
| Planning invalidation | Planning upsert dirties via `enqueue_sku_daily_metric_planning_invalidation` — covered by generation / window / pending checks after dirty |
| Incoming attestation | PB1.e trigger dirties store-local current grains on attestation INSERT/UPDATE/DELETE — covered by generation/window; stale known-zero cannot qualify while dirty |
| PO mutations | Trusted-incoming capture path enqueues metric source events — covered by window unconsumed check |

### 3.3 Historical sales-window proof obligation

Successor tests must prove:

1. Unconsumed sales/inventory event with `source_date` inside `[metric_date − 89, metric_date]` blocks create even when no **current-day** request exists.
2. Unrelated-grain pending does **not** alone authorize create (grain fence required); diagnostic may still org-block.
3. After consume+recompute brings `applied_generation` current and window empty, create fence can pass **freshness** (production class unlock still separate).

---

## 4. Supplier fact provenance

| Rule | Normative |
|---|---|
| Provenance kind | `stated_supplier_product_terms` only |
| Attestation | `pb1_trusted_supplier_planning_v1` (diagnostic) / successor production echo must not claim verified delivery |
| `notVerifiedDeliveryPerformance` | Always true until a separate Supplier Intelligence freeze |
| Null LT | `SUPPLIER_FACTS_ABSENT` |
| Ambiguous preferred / duplicate mappings | `SUPPLIER_FACTS_AMBIGUOUS` |
| Missing / deleted / wrong org-variant | `SUPPLIER_MAPPING_NOT_FOUND` / `FOREIGN_TENANT_REJECTED` / `VARIANT_MISMATCH` |
| Org default / supplier default substitution | **Forbidden** |
| PO latency invention | **Forbidden** |

---

## 5. Dual lead time (disclosure; no formula change)

**Proven today:** M5 ROP/target/safety may reflect `organization_planning_inputs.lead_time_days` via planning-evidence binding; PB1 decision `leadTimeDays` binds stated `supplier_products.lead_time_days`. Thresholds are **not** recalculated with supplier LT in PB1.f/g.

**Frozen for future production create/approve payloads:**

| Field | Meaning |
|---|---|
| `thresholdLeadTimeProvenance` | `organization_planning_inputs` \| `unknown` \| future approved classes |
| `decisionLeadTimeProvenance` | `stated_supplier_product_terms` (V1) |
| `dualSourceLeadTimeNote` | Stable code: `M5_THRESHOLDS_MAY_USE_ORG_DEFAULT_LEAD_TIME_PB1_USES_SUPPLIER_PRODUCT_STATED_TERMS` |

Merchant-visible disclosure is mandatory before merchant-approvable REORDER. **No** M5/M7 frozen formula modification in this contract. Recalculating thresholds with supplier LT requires a **separate** formula/contract freeze.

---

## 6. Approval-time revalidation (M7.3 successor)

Today `inventory_action_is_merchant_approvable` is hard-coded `false`. When a future unlock allows merchant accept/edit/dismiss/complete:

### 6.1 Detect drift after create

On merchant transition RPC (`SELECT action FOR UPDATE` then):

| Drift | Detection |
|---|---|
| Metric changed | Current locked metric watermark ≠ action `metric_source_watermark` / provenance |
| Pending work | Grain generation/window freshness fails (§3) |
| Supplier changed | Locked `supplier_products.updated_at` / id / LT ≠ action supplier provenance |
| Quantity / body | Action immutable fields unchanged (already M7.3); edited quantity only via `accepted_with_edit` rules |
| Authorization | `auth.uid()` + membership + decide role; foreign tenant reject |
| Provenance / source class | Still approved production class; trust flags still satisfy §7 |

### 6.2 Behavior

| Outcome | Behavior |
|---|---|
| No drift + eligible | Allow legal transition; append `action_events`; preserve audit history |
| Drift detected | Reject with stable code (e.g. `ACTION_EVIDENCE_STALE`); **no** silent status change |
| Merchant still wants action | Require **new** create (new evidence provenance fingerprint) → new `inventory_actions` row → new approval; do not mutate old recommendation body |
| System expire/supersede | May proceed without merchant eligibility for hygiene; never rewrite evidence; never imply consent |

Human authorization remains `auth.uid()` consent; `service_role` never substitutes.

---

## 7. M7.2 / M7.3 unlock prerequisites (no premature unlock)

### 7.1 Trusted production source-of-create

All of the following — each separately owner-authorized:

1. This fencing contract accepted.
2. Local pure fence validators + adversarial tests green (§9).
3. Successor M7.2 writer freeze specifying in-TX lock order + RPC surface.
4. Migration implementing create-time revalidation (still may ship with class rejected until explicit enable).
5. Explicit owner approval to accept `m5_sku_daily_metric_bound_v1` (remove / gate `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE`).
6. Dual-LT disclosure fields persisted.
7. Local four-version migration-ledger discrepancy resolved or explicitly waived (**separate blocker**).
8. Hosted schema/runtime approvals as applicable (**separate**); workers/cron remain off unless separately approved.

### 7.2 Merchant-approvable predicate

All of §7.1 plus:

1. Successor M7.3 freeze for approve-time revalidation (§6).
2. Predicate returns true **only** for approved production source class + required trust columns + passing revalidation.
3. Harness / fixture / dormant rows remain unapprovable forever.
4. No UI wiring until predicate + create path approved.

**This document grants none of the unlocks above.**

---

## 8. Failure / negative matrix

| Scenario | Expected code / disposition |
|---|---|
| Concurrent supplier LT UPDATE under lock | Wait → watermark/LT mismatch → `SUPPLIER_FACTS_STALE` / `INVALID` |
| Supplier DELETE / revoke mapping | `SUPPLIER_MAPPING_NOT_FOUND` |
| Preferred flip 0↔2 mid create (phantom) | Advisory+FOR UPDATE → `SUPPLIER_FACTS_ABSENT` / `AMBIGUOUS` |
| Preferred INSERT race (second preferred) | Same → `SUPPLIER_FACTS_AMBIGUOUS` |
| Explicit supplierId with null LT | `SUPPLIER_FACTS_ABSENT` |
| Org-default LT injection | `ORG_PLANNING_DEFAULTS_FORBIDDEN` |
| Unconsumed in-window source event | `PENDING_RECOMPUTE` / `METRIC_SOURCE_WINDOW_DIRTY` |
| dirty ≠ applied / open request | `PENDING_RECOMPUTE` |
| SA008 / source token mismatch | `SA008` / `STALE_SOURCE_TOKEN` |
| Stale attestation after dirty | Pending/generation fail; cannot create on stale known-zero |
| Foreign tenant / store | `FOREIGN_TENANT_REJECTED` / scope error |
| Metric date ≠ store-local as-of / rollover | `METRIC_DATE_NOT_CURRENT` |
| Wrong algorithm | `UNSUPPORTED_METRIC_ALGORITHM` |
| Duplicate create same provenance+body | `replayed` |
| Duplicate create same identity divergent body | `DECISION_IDEMPOTENCY_BODY_CONFLICT` |
| Production class before unlock | `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE` |
| Merchant approve before predicate unlock | `ACTION_NOT_MERCHANT_APPROVABLE` |
| Approve after metric/supplier drift | `ACTION_EVIDENCE_STALE` (successor) |
| Fixture / harness as production | Reject (existing M7.2/M7.3) |

---

## 9. Implementation slices

| Slice | Scope | Authorization |
|---|---|---|
| **PB1.h.1** | This docs freeze | **Done when this file lands** |
| **PB1.h.2** | Pure-TS fence validators: grain window pending, generation equality, supplier watermark/preferred cardinality helpers (no RPC unlock) | **LOCAL-ONLY** after explicit approval |
| **PB1.h.3** | Local adversarial / live tests for TOCTOU, window false-ready, preferred phantoms (diagnostic composition; still hard-false) | **LOCAL-ONLY** after explicit approval |
| **PB1.h.4+** | SQL create writer, class enable, merchant predicate, UI, workers, hosted | **Separate owner authorization each** |
| Ledger repair (`20261107090000`, `20261107120000`, `20261108180000`, `20261109120000`) | Objects-without-ledger risk | **Separate blocker** — not part of h.2/h.3 |
| PE1.b.6b J1–J13 | Hosted JWT | **Separate session**; remains UNPROVEN |

Suggested paths for h.2 (non-normative names): `lib/decision-engine/pb1-metric-freshness-fence.ts`, `lib/decision-engine/pb1-supplier-concurrency-fence.ts`. Forbidden: persist adapters, lifecycle RPCs, workers, `app/**`, formula edits.

---

## 10. Migration ledger + hosted / PE1.b.6b (out of scope)

| Item | Status |
|---|---|
| Local ledger | **49** migration files vs **45** ledger entries; missing versions `20261107090000`, `20261107120000`, `20261108180000`, `20261109120000` with objects present — **separate blocker**; no repair here |
| PE1.b.6b | Owner A1–A4+A6 may be YES on worksheet; **J1–J13 NOT EXECUTED**; JWT **UNPROVEN** |
| Hosted deploy / workers / cron / HTTP metric | **Not authorized** by this freeze |
| Paying launch / purchasing | **NO-GO** |

---

## 11. Relationship to current code (informative)

| Component | Role vs this freeze |
|---|---|
| `pb1-trusted-persisted-metric-promote-loader.ts` | Diagnostic membership load; org-wide pending — not create TX |
| `pb1-trusted-supplier-planning-facts.ts` / lead-time loader | Read-time stated terms; no FOR UPDATE |
| `pb1-evidence-qualified-*-diagnostic.ts` | Hard-false diagnostic only |
| `m7-pb1g-persisted-grain-reorder.live.test.ts` | Proves diagnostic REORDER + documents supplier TOCTOU |
| `persist_inventory_action_recommendation` | Rejects production class |
| `inventory_action_is_merchant_approvable` | Always false |
| PB1.e attestation invalidation | Necessary dirty path; covered by §3 once create fence exists |

---

## 12. GO / NO-GO summary

| Item | Call |
|---|---|
| Freeze PB1.h.1 fencing contract | **GO** |
| Local pure validators / adversarial tests after approval | **CONDITIONAL GO** |
| Production create / merchant approve unlock | **NO-GO** |
| Formula changes / org-default LT promotion / delivery fabrication | **NO-GO** |
| Ledger repair / hosted JWT execution / workers | **NO-GO** (separate) |

---

## 13. References

- `docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md`
- `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md`
- `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md`
- `docs/M7_0_CONTRACT_ADDENDUM.md`
- `docs/IMPLEMENTATION_STATUS.md` (grain pending / dual LT notes)
- `docs/M6_PE1_B6B_OWNER_AUTHORIZATION_WORKSHEET.md`
- `docs/M6_PE1_B6B_HOSTED_JWT_RUNTIME_EVIDENCE.md`
- `lib/metrics-activation/pending-work.ts`
- `lib/decision-engine/pb1-trusted-supplier-planning-facts.ts`
- `supabase/migrations/20261031100000_m7_2b_inventory_action_persistence.sql`
- `supabase/migrations/20261031130000_m7_3c_trusted_lifecycle_rpcs.sql`
- `supabase/migrations/20261109120000_pb1e_attestation_freshness_invalidation.sql`
- `supabase/migrations/20261011133000_m2_5_suppliers_purchase_orders.sql`

---

**STOP.** Await owner review before PB1.h.2 implementation.
