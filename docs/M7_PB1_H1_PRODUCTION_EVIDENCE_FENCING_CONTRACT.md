# M7-PB1.h.1 — Production Evidence-Fencing Contract Freeze

**Status:** FROZEN for **design intent** + **PB1.h.1a safety clarifications** + **PB1.h.4.0 transactional fencing protocol selection**; create-time guarantees remain **PROPOSED / UNENFORCED** until cooperating writers + TX protocol are implemented and proven (see §0.1, §0.2, §1.6, §2.3, §14)
**Baseline verified (h.4.0 amendment):** `main` @ `9558df7351a60da924083578f1669b8242eef0a1` — `test(m7): verify PB1 evidence freshness and supplier concurrency races` (PB1.h.3 gap tests present; TX protocols still unenforced)
**Prior h.1a baseline:** `75db88553bb4774b1afe40b6ce324343a9875c5a`
**Prior h.1 baseline:** `b0e70590912a1bae27a77e18f3863d723f9a34c4`
**Amendments:**
- **PB1.h.1a** — corrects supplier-phantom overclaim, optional SA008/false-ready wording, and conflated freshness axes (docs only)
- **PB1.h.4.0** — freezes chosen supplier + metric serialization protocol, corrected lock order, proof obligations, and successor slices (docs only; **no** SQL/TS implementation claim)
**Origin:** PB1.h production readiness & evidence-fencing audit (local diagnostic PROMOTE/REORDER proven; production create/approve blocked)
**Authority when docs conflict:** this freeze for **future** create-time / approval-time evidence fencing design, dual lead-time disclosure, and unlock prerequisites. Existing freezes remain authoritative for current behavior:
- PB1 diagnostic binding: `docs/M7_PB1_TRUSTED_METRIC_DECISION_BINDING_CONTRACT.md`
- M7.2 persistence (dormant / harness): `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md`
- M7.3 lifecycle (fail-closed merchant approve): `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md`
- M5 formulas / SA008 / generations: `docs/INVENTORY_FORMULAS.md`, `lib/metrics/*`, `supabase/migrations/20261015110000_m5_5_sku_daily_metric_recompute.sql`, M5.6B/C migrations, `20261108180000_trusted_incoming_evidence_v1.sql`
- PE1.b.6b: worksheet + runtime evidence (JWT **UNPROVEN** / **NO-GO**)

This freeze does **not** authorize TypeScript, SQL, tests, schema, UI, migrations, ledger repair, hosted access, workers/cron/HTTP enablement, M7.2 production create, M7.3 merchant-approvable success, formula changes, purchasing, inventory mutation, or Git operations.

**Legend:** **PROVEN** = true in current repo behavior. **PROPOSED** = required successor design; **not** currently enforceable; must not be treated as shipping safety. **UNENFORCED** = gap reproduced or design accepted but not implemented. **BLOCKED** = production create/approve must not proceed until proven.

---

## 0. Verdict

| Gate | Result |
|---|---|
| Freeze fencing **design** + h.1a clarifications (docs only) | **GO** |
| Freeze h.4.0 chosen TX protocol (docs only; still **PROPOSED**) | **GO** |
| Claim supplier preferred phantoms are prevented today | **NO-GO** (§2.3 **PROPOSED** / **UNENFORCED**; h.3 A1–A5) |
| Claim atomic create-time freshness is solved today | **NO-GO** (§1.6 **BLOCKED** / **PROPOSED**; h.3 B1–B5, C1) |
| Implement pure-TS fence validators (read-model helpers only) | **DONE locally (PB1.h.2)** — validators ≠ production TX proof; `transactionSafety` always unproven |
| Local adversarial gap documentation (PB1.h.3) | **DONE locally** — proves gaps; does **not** close them |
| Unlock `m5_sku_daily_metric_bound_v1` create path | **NO-GO** / **BLOCKED** until §1.6 + §2.3 + §7 proven |
| Flip `inventory_action_is_merchant_approvable` | **NO-GO** |
| Repair local migration ledger / hosted deploy / PE1.b.6b J-matrix | **NO-GO** (separate tracks; retained) |
| Invent verified supplier delivery performance or org-default LT as supplier facts | **FORBIDDEN** |

**Product intent:** Document the **minimum safe** metric + supplier fencing design required before any future trusted production decision create or merchant approval, without enabling either, and without overclaiming concurrency safety the repository cannot yet prove. PB1.c/f/d/g remain **diagnostic preparation only**.

### 0.1 PB1.h.1a correction summary (source-backed)

| Gap | Correction |
|---|---|
| Create-only advisory lock claimed “enforceable” | **PROPOSED**; `csv_reconcile_supplier_product` does **not** share org+variant advisory serialization (proven: `FOR UPDATE` on exact supplier+variant only) |
| SA008 / source `SHARE` marked optional | **Mandatory** for production create; last-moment recheck alone insufficient |
| Freshness axes conflated under one event window | Split: sales window vs inventory token+events vs planning generation vs attestation generation vs PO events+dirty+token |

### 0.2 PB1.h.4.0 protocol selection summary (still **PROPOSED** / **UNENFORCED**)

| Decision | Frozen design (not implemented) |
|---|---|
| Supplier primary | **A:** DB `BEFORE INSERT OR UPDATE OR DELETE` trigger on `supplier_products` acquires org+variant **transaction** advisory lock; future create/approve use the **identical** lock (§2.3). Partial unique preferred = **deferred DiD**. `SERIALIZABLE` rejected as primary. |
| Metric / first-request | Grain advisory shared by future create **and** every relevant enqueue/write path, including missing-request insertion (§1.2 step 1, §3.4). |
| Lock order | **Corrected:** grain advisory → supplier advisory → source `SHARE` (canonical M5 order) → metric `FOR UPDATE` → request `FOR UPDATE` → supplier row `FOR UPDATE` → SA008/freshness recheck → hypothetical insert. Prior h.1 metric-before-SHARE order is **superseded** (deadlocks with `commit_sku_daily_metric`). |
| Shipping safety | **Forbidden** until live dual-TX proof obligations in §8.1 **PASS**. |

---

## 1. Create-time transaction (**PROPOSED** successor; production create **BLOCKED**)

Applies only to a **future** approved production create writer that persists `evidence_source_class = m5_sku_daily_metric_bound_v1`. Today’s RPC **always rejects** that class (`PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE`) — **PROVEN** fail-closed (`persist_inventory_action_recommendation` in `20261031100000_m7_2b_inventory_action_persistence.sql`).

Until §1.6 exit criteria are met, treat the protocol below as **PROPOSED design**, not a solved shipping guarantee.

### 1.1 Authorization (before TX body)

| Requirement | Rule |
|---|---|
| Caller privilege | `service_role`-only `SECURITY DEFINER` create RPC (same posture as M7.2 harness persist) |
| Tenant scope | Param `organization_id` / `store_id` / `location_id` / `variant_id` must match durable grain FKs; payload IDs must echo params |
| Evidence class | Only after separate unlock: `m5_sku_daily_metric_bound_v1` |
| Trust claims | Production create may set merchant/production claim columns **only** under a later M7.2/M7.3 unlock freeze; until then hard-false / rejected |
| `service_role` meaning | Privilege ≠ evidence provenance (unchanged from M7.2a) |
| Forecast | `forecast_run_id` remains null until separate M6 production eligibility approval |

### 1.2 Lock order (**PROPOSED**; h.4.0 corrected; deadlock-safe target vs M5 commit)

Fixed order inside one create transaction. Do **not** invent alternate lock graphs without amending this freeze. **h.4.0 supersedes** the earlier h.1 ordering that placed metric `FOR UPDATE` before source `SHARE` (that inversion deadlocks with `commit_sku_daily_metric`: SHARE → metric upsert).

Successor create TX must set `lock_timeout` explicitly (default proposal: **2s**, align with M5.5/trusted-incoming commit) and a bounded `statement_timeout`.

| Step | Acquisition (**PROPOSED**) | Notes |
|---|---|---|
| **1** | **Grain advisory** — `pg_advisory_xact_lock(71010402, hashtext(grain_key))` where `grain_key = organization_id \|\| ':' \|\| store_id \|\| ':' \|\| location_id \|\| ':' \|\| variant_id \|\| ':' \|\| metric_date::text \|\| ':' \|\| algorithm_version` | Shared with every enqueue path that INSERT/UPSERTs `sku_daily_metric_recompute_requests` for that grain (§3.4). Closes first dirty-request race when no request row exists. |
| **2** | **Supplier org+variant advisory** — `pg_advisory_xact_lock(71010401, hashtext(organization_id::text \|\| ':' \|\| variant_id::text))` | Identical key to §2.3 trigger protocol. Create/approve **must** acquire before preferred/explicit supplier reads. |
| **3** | **Source `LOCK TABLE … IN SHARE MODE`** in **canonical M5 commit order** (PROVEN in `commit_sku_daily_metric` / `20261108180000_trusted_incoming_evidence_v1.sql`): `stores` → `orders` → `order_items` → `return_refunds` → `inventory_snapshots` → `purchase_orders` → `purchase_order_items` → `store_incoming_evidence_attestations` | Mandatory. Holds through validate→insert. Reuse SA008 snapshot under these locks. |
| **4** | **Metric** row — `SELECT … FOR UPDATE` on `sku_daily_metrics` natural key `(organization_id, store_id, location_id, variant_id, metric_date, algorithm_version)` | After SHARE to avoid create↔commit deadlock. |
| **5** | **Recompute request** row — `SELECT … FOR UPDATE` on matching `sku_daily_metric_recompute_requests` **if present** | Absence is covered by step 1 grain advisory (not by metric row lock alone — parent metric `FOR UPDATE` does **not** block request INSERT). |
| **6** | **Supplier row** — `SELECT … FOR UPDATE` on chosen / sole-preferred `supplier_products` row (after step 2) | Exact-row LT UPDATE/DELETE already **PROVEN** blocked under `FOR UPDATE` (h.3 A3). Phantoms require step 2 + trigger. |
| **7** | **Final freshness revalidation** (§1.3) | While steps 1–6 remain held. |
| **8** | **Hypothetical insert** `inventory_actions` (+ reserved atomic `created` ActionEvent when separately approved) | Only after step 7 passes. Today’s persist path still rejects production class. |

Optional store-row `SELECT … FOR SHARE` for timezone/existence may occur **only** if it does not invert the SHARE/metric order above (prefer relying on step 3 `stores` SHARE + snapshot timezone).

**Abort / retry:** any lock timeout (`55P03`), SA008/token mismatch, generation/window failure, or supplier stale/phantom/ambiguous result → full TX rollback; caller may retry with fresh evidence. No insert on failed fence.

#### 1.2.1 Lock-order audit vs existing M5 writers (**PROVEN** today / **PROPOSED** create)

| Existing writer | Locks today (PROVEN) | Create interaction under §1.2 |
|---|---|---|
| `commit_sku_daily_metric` | Table SHARE (canonical order) → SA008 → metric upsert; `lock_timeout=2s` | Compatible **if** create takes SHARE before metric `FOR UPDATE`. **Unresolved if** create reverts to metric-before-SHARE (**deadlock cycle**). |
| `claim_sku_daily_metric_recompute_requests` | Global advisory `5606003` + `FOR UPDATE SKIP LOCKED` on request rows | Create holding request `FOR UPDATE` → claim skips that grain (busy exclusion) or waits; create timeout → abort/retry. Global `5606003` ≠ grain `71010402` (no intentional sharing). |
| `consume_sku_daily_metric_source_events` | `FOR UPDATE SKIP LOCKED` on source events; UPSERT requests — **no** grain advisory today | **UNENFORCED** vs create until h.4.2 wraps enqueue with `71010402`. |
| Planning / incoming / rollover enqueue RPCs | UPSERT requests — **no** grain advisory today | Same — must join §3.4 protocol. |
| `csv_reconcile_supplier_product` | Exact `(org,supplier,variant)` `FOR UPDATE` only | **UNENFORCED** vs preferred-set until h.4.1 trigger / `71010401`. |
| Source-event **capture** triggers (orders/PO/etc.) | Fire on source DML; take row locks via writer | Blocked while create holds source SHARE (PROVEN pattern h.3 B6/D2). |

**Unresolved cycles / residual risks (do not claim closed):**

1. Create using **pre-h.4.0** metric-before-SHARE order vs commit → **deadlock** (design forbids that order).
2. Direct `INSERT` into `sku_daily_metric_recompute_requests` or `sku_daily_metric_source_events` bypassing enqueue RPCs / source tables → **bypass** until grants/DEFINER-only hardened (see §3.4).
3. Coarse table SHARE stalls unrelated org writers during create (same blast-radius as M5 commit; accepted; row-grain SHARE not claimed).
4. Hash advisory collision (theoretical) — see §2.3.2; mitigated by tenant+grain key width + dual-TX isolation tests, not by claiming perfect uniqueness.

### 1.3 Source reads + evidence validation (in-TX; **PROPOSED** until proven)

After locks from §1.2 are held — **and held through** the validate→insert window:

| Check | Fail closed when |
|---|---|
| Algorithm | `algorithm_version ≠ m5-derived-metrics-v1` |
| Store-local date | Locked metric `metric_date` ≠ store-local as-of date for `stores.timezone` at TX start |
| Timezone | Create `pinned_time_zone` ≠ trusted store timezone |
| Metric watermark | Locked `updated_at` (and date/algo) ≠ create `metric_source_watermark` / provenance token |
| Generations | Open request exists with `dirty_generation ≠ applied_generation` **or** status ∈ `{queued,claimed,running,retry_wait,failed}` for this grain → reject `PENDING_RECOMPUTE` |
| Window pending (sales/inventory/PO events) | Any **unconsumed** `sku_daily_metric_source_events` for this grain with `source_date ∈ [metric_date − 89, metric_date]` → reject (see §3) |
| Source token / SA008 | **Mandatory** for production create: re-snapshot under §1.2 source SHARE; mismatch → `SA008` / `STALE_SOURCE_TOKEN` |
| Incoming | Persisted `eligible_incoming_*` nullability/reason coupling intact; commercial REORDER/REDUCE require known incoming |
| Supplier facts | §2 + §4 — including `supplier_products.updated_at` revision recheck |
| Dual LT disclosure | §5 fields present on create payload / evidence provenance |
| Engine | Frozen `decideInventoryAction` / binding rules only — **no formula fork** |
| Body / provenance hashes | Re-derive in RPC; mismatch → reject (M7.2 posture) |

**Final revalidation before INSERT (mandatory, still not sufficient alone):** immediately before step 8, re-check generations, in-window unconsumed events, metric watermark, SA008/source token, algorithm/date, and supplier revision **while** grain advisory, supplier advisory, source SHARE, metric, request (if any), and supplier row locks remain held.

**False-ready prohibition (normative):** a last-minute recheck **without** continuing to hold serialization against concurrent source writers is **insufficient**. Under `READ COMMITTED`, a source mutation can commit after a check statement and before INSERT unless writers are blocked by shared locks / shared advisory protocol / equivalent isolation for the entire validate→insert window. Production create remains **BLOCKED** until that protocol is implemented and adversarially proven (§1.6). PB1.h.3 B1–B5 / C1 reproduce this gap today.

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

### 1.6 Production create freshness — **BLOCKED** until proven

Repository today **cannot** claim atomic create-time freshness. Exit criteria (each owner-authorized):

1. Create RPC implements §1.2–§1.3 with **mandatory** SA008/source serialization (not optional).
2. Adversarial dual-TX tests prove §8.1 matrix: concurrent order/PO/snapshot/attestation/planning mutations during validate→insert either **BLOCK**, **ABORT** create, or force **RETRY** — **never** a successful insert on stale evidence.
3. Missing recompute-request race is covered via grain advisory shared with enqueue paths (no false-ready when the first dirty request is inserted after an empty-request check).
4. Supplier phantom protocol (§2.3) implemented and phantom-proven.
5. Explicit owner approval then still required to accept `m5_sku_daily_metric_bound_v1` (§7).

Until then: production create = **BLOCKED** (in addition to today’s `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE`).

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

**PROVEN identity immutability:** `prevent_supplier_product_identity_reassignment` forbids UPDATE that changes `organization_id`, `supplier_id`, or `variant_id`. Successor protocol **preserves** that forbid. If identity reassignment were ever authorized in a future freeze, the writer **must** acquire advisories for **both** OLD and NEW `(organization_id, variant_id)` keys in **sorted key order** before mutation — until then, treat identity change as **forbidden**, not as an implemented dual-key path.

### 2.2 Explicit vs implicit selection

| Mode | Create-time rule |
|---|---|
| **Explicit** | Caller supplies `supplier_id` (+ resolved `supplier_product_id`). Under §2.3 lock, `FOR UPDATE` that exact row. Preference flags ignored except for audit echo. |
| **Implicit preferred** | No `supplier_id`. Under §2.3 org+variant serialization, require **exactly one** row with `preferred = true` and non-null valid `lead_time_days`. 0 → `SUPPLIER_FACTS_ABSENT`; >1 → `SUPPLIER_FACTS_AMBIGUOUS` (fail-closed; **multiple preferred remains allowed by schema today**). |

Org planning defaults and `suppliers.default_lead_time_days` remain **forbidden** substitutes (`ORG_PLANNING_DEFAULTS_FORBIDDEN` / `SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN`).

### 2.3 Phantom preferred INSERT/UPDATE races — **PROPOSED** primary (h.4.0); **UNENFORCED** today

**Problem (PROVEN — h.3 A1/A2/A4/A5):** non-transactional PB1.f reads allow TOCTOU (PB1.g). Schema allows multiple `preferred = true` rows per variant. Under `READ COMMITTED`, locking only existing rows does **not** block a concurrent **INSERT** of another preferred mapping (phantom). Create-side advisory alone does **not** stop non-participating writers.

**Proven writer behavior today:** `csv_reconcile_supplier_product` (`20261011184500_m3_9_csv_history_relationship_reconciliation.sql`) acquires `FOR UPDATE` on the exact `(organization_id, supplier_id, variant_id)` row (or inserts that row). It does **not** take an org+variant advisory lock, does **not** lock sibling preferred rows, and therefore does **not** participate in create-side preferred-set serialization. Direct SQL DML on `supplier_products` (service_role / superuser) likewise has no shared protocol. Authenticated browser INSERT/UPDATE/DELETE on `supplier_products` are **revoked** (M2.7) — residual writers are service_role RPCs and privileged SQL.

#### 2.3.1 Chosen primary strategy (**PROPOSED** → h.4.1 SQL authored; **UNENFORCED** until migration applied + §8.1 PASS)

**A — DB-enforced org+variant transaction advisory via BEFORE trigger + writer prelock**

1. Helper: `public.acquire_supplier_products_org_variant_xact_lock(p_organization_id uuid, p_variant_id uuid)` → `PERFORM pg_catalog.pg_advisory_xact_lock(71010401, pg_catalog.hashtext(p_organization_id::text || ':' || p_variant_id::text))` (blocking; selection + writer prelock).
2. Deadlock amendment (h.4.1 preflight): PostgreSQL locks the row **before** BEFORE ROW triggers on UPDATE/DELETE. Trigger-only **blocking** advisory after that row lock deadlocks with selection (`advisory → FOR UPDATE`). **Rejected.** Trigger instead uses `pg_try_advisory_xact_lock` (reentrant if prelocked; acquire if free; `55P03` if held by another TX). Writers that must wait call the blocking helper **before** row locks.
3. `BEFORE INSERT OR UPDATE OR DELETE` **row** trigger on `public.supplier_products` try-acquires for the row’s `(organization_id, variant_id)` (INSERT/UPDATE: NEW; DELETE: OLD). Direct DML cannot silently bypass.
4. Future production create / approve revalidation acquire the **identical** lock (§1.2 step 2) **before** preferred-set or explicit mapping reads.
5. After the advisory: `SELECT … FOR UPDATE` chosen row by PK; compare `updated_at` + LT; implicit path evaluate preferred-with-LT cardinality (0 / 1 / >1).
6. Concurrent DELETE of locked row → `SUPPLIER_MAPPING_NOT_FOUND`; concurrent LT/preferred UPDATE on locked row → wait → re-read → `SUPPLIER_FACTS_STALE` / `INVALID` if watermark/LT diverges.
7. Explicit `PERFORM` inside `csv_reconcile_supplier_product` **before** exact-row `FOR UPDATE` (required wait locus; trigger remains DiD).

**Create-side advisory lock alone remains insufficient** and must not be documented as enforceable (h.3 A4). FOR UPDATE alone remains insufficient even after h.4.1 (h.3 A1/A2).

#### 2.3.2 Lock namespace + collision considerations (**PROPOSED**)

| Item | Value |
|---|---|
| Namespace (int4 classid) | `71010401` — reserved for supplier org+variant fencing; **must not** reuse M5 claim `5606003`, rollover `5606004`, or forecast publication namespaces |
| Key (int4) | `hashtext(organization_id::text || ':' || variant_id::text)` |
| Scope | Transaction-scoped (`pg_advisory_xact_lock`) — released on commit/rollback |
| Collision | `hashtext` is 32-bit; distinct `(org,variant)` pairs can theoretically collide. Mitigations: stable delimiter `':'`; dual-TX cross-tenant tests must show Org-B writers are not spuriously blocked by Org-A create **in practice**; if collision ever proven harmful, successor may migrate to `hashtextextended` dual-int form under a new namespace — requires contract amendment |
| Tenant isolation | Key includes `organization_id`; no intentional cross-tenant sharing |

#### 2.3.3 Rejected / deferred alternatives

| Alternative | Status |
|---|---|
| **B. Partial unique** “at most one preferred per `(organization_id, variant_id)`” | **Deferred DiD** — requires multi-preferred data remediation policy first (schema allows multiples today). Multiple preferred remains **fail-closed** at create (`SUPPLIER_FACTS_AMBIGUOUS`), not DB-unique-enforced. |
| **C. SERIALIZABLE + retry** | **Rejected as primary** — M5 workers/consume/claim are READ COMMITTED; SSI abort surface under SHARE/claim load unproven for this workload. |
| Create-only advisory | **Rejected** as sole control (h.3 A4). |

#### 2.3.4 Writers requiring participation (**PROPOSED** coverage list)

| Writer / path | Today (PROVEN) | Required change |
|---|---|---|
| BEFORE trigger on `supplier_products` | Absent (until h.4.1 applied) | **Required** — try-acquire closes direct DML bypass without row→advisory deadlock |
| `csv_reconcile_supplier_product` | Exact-row `FOR UPDATE` only (until h.4.1 applied) | Blocking prelock before `FOR UPDATE` + trigger DiD |
| Future create / approve revalidation | N/A (blocked) | Must take `71010401` before supplier reads |
| Authenticated client DML | Grants revoked (M2.7) | No change |
| Privileged/service_role SQL | Unrestricted table DML | Covered **only if** trigger present |

**Proof obligation:** §8.1 S-rows must PASS before any “phantom-safe” claim. Until then, supplier phantom prevention = **UNENFORCED / PROPOSED**; production REORDER create that depends on implicit preferred selection remains **BLOCKED**.

No caching of supplier facts across create attempts.

---

## 3. Metric freshness coverage

### 3.1 Why current-day-only pending is insufficient

`docs/IMPLEMENTATION_STATUS.md` already records: exact current-date grain checks have a **false-ready gap** because historical source events for the same grain still affect current-day velocity windows (`source_date ∈ [metric_date − 89, metric_date]` per M5.6C completion / M5.6B dirtying).

**Rule:** production create must not use a current-date-only shortcut. Coverage must span **every relevant source class** through the create transaction boundary (§1.2–§1.6), using the **correct axis** per class (§3.2).

Org-wide pending (`lib/metrics-activation/pending-work.ts`) remains an acceptable **conservative diagnostic** fence (false-blocks unrelated grains). It is **not** a production create freshness proof.

### 3.2 Freshness axes (separated; do not conflate)

| Source class | Invalidation / evidence axis (PROVEN mechanism today) | Create-time requirement (**PROPOSED** until §1.6) |
|---|---|---|
| **Historical sales** (orders / order_items / returns affecting velocity) | Source-event **capture** into `sku_daily_metric_source_events`; relevance `source_date ∈ [metric_date − 89, metric_date]` | Hold source SHARE through validate→insert; reject unconsumed in-window events; SA008 as applicable |
| **Inventory** snapshots | Source-event capture **and** SA008 token composition | Events + **mandatory** source token under SHARE |
| **Planning** defaults | **Generation-only** via `enqueue_sku_daily_metric_planning_invalidation` — **not** in SA008 token; **not** the 89-day event window | Grain advisory + dirty/claimed/applied (or no open request); do **not** assume window events cover planning |
| **Incoming attestation** (PB1.e) | **Generation** via trigger → `enqueue_sku_daily_metric_store_incoming_invalidation`; attestation also in SA008 token | Generation path + SHARE on attestation; token recheck when bound; stale known-zero cannot qualify while dirty |
| **PO / trusted incoming** | PO capture enqueues source events; SA008 includes PO + attestation | Events + dirty/generation + SA008 — all as applicable |

**Separation (normative):** source-event **capture** (commerce/PO/inventory writers → `sku_daily_metric_source_events`) is distinct from **generation-only invalidation** (planning upsert; attestation invalidate). Create must fence **both** families; SA008 alone does **not** cover planning.

Every relevant mutation class above must be unable to commit “under” a successful create without either blocking on shared locks/protocol or causing create abort/retry. Current-date-only request checks remain a **false-ready** anti-pattern.

### 3.3 Historical sales-window / axis proof obligation

Successor tests must prove (§8.1):

1. Unconsumed sales event with `source_date` inside `[metric_date − 89, metric_date]` blocks create even when no **current-day-only** heuristic would.
2. Planning-only dirty (no in-window sales event) still blocks via generation axis.
3. Attestation-only dirty still blocks via generation axis; attestation mutation also cannot slip under held SHARE / token.
4. Inventory/PO token drift under SHARE fails SA008 even if event table momentarily empty.
5. Unrelated-grain pending does **not** alone authorize create; diagnostic may still org-block.
6. After consume+recompute brings generations current and required axes clean, freshness can pass **only as a fence result** — production class unlock remains separate (§7).

### 3.4 Grain advisory + enqueue write-path coverage (**PROPOSED** / **UNENFORCED**)

**Namespace:** `71010402` + `hashtext(grain_key)` per §1.2 step 1. Distinct from supplier `71010401` and M5 `5606003` / `5606004`.

**Must acquire grain advisory before INSERT/UPSERT of `sku_daily_metric_recompute_requests` for that grain** (including first insert when row absent):

| Caller (PROVEN exists today) | Role |
|---|---|
| `consume_sku_daily_metric_source_events` | Consumes source events → UPSERT requests (`20261016100000_m5_6b_…`) |
| `enqueue_sku_daily_metric_daily_rollover` | Rollover dirties (`20261020100000_m5_6d_…`) |
| `enqueue_sku_daily_metric_planning_invalidation` | Planning generation dirty (`20261108170000_…`); also invoked from `upsert_current_user_organization_planning_inputs` |
| `enqueue_sku_daily_metric_store_incoming_invalidation` | Incoming/attestation generation dirty (`20261108180000_…`); PB1.e trigger `store_incoming_evidence_attestations_invalidate_metrics` (`20261109120000_…`) |

**Direct-DML bypass risks (residual until hardened):**

| Bypass | Risk |
|---|---|
| Direct `INSERT`/`UPDATE` on `sku_daily_metric_recompute_requests` | Skips grain advisory if not trigger-enforced; today table grants are service_role-centric — still a privileged SQL hole |
| Direct `INSERT` on `sku_daily_metric_source_events` | Skips commerce SHARE; can dirty windows without blocking on create’s source locks |
| Metric parent `FOR UPDATE` alone | **Insufficient** for first-request race (h.3 C1) — does not lock request inserts |

Successor h.4.2 should prefer wrapping the enumerated RPCs; optional BEFORE trigger on `sku_daily_metric_recompute_requests` is an allowed DiD if owner-authorized, but is **not** a substitute for create holding `71010402` during validate→insert.

### 3.5 SA008 / source token reuse (**PROPOSED** create mandatory; **PROVEN** on M5 commit)

Reuse current M5 `sku_daily_metric_source_snapshot` + SHARE mechanism. **No new competing metric formulas or tokens** unless a separate freeze requires and justifies them.

| Covered by token today (PROVEN) | Generation-only / not in token |
|---|---|
| Orders / order_items, return_refunds, inventory_snapshots, PO lines, incoming attestation | Planning defaults (`organization_planning_inputs`); recompute dirty/claimed/applied; supplier_products |

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

## 6. Approval-time revalidation (M7.3 successor — **PROPOSED**)

Today `inventory_action_is_merchant_approvable` is hard-coded `false` (**PROVEN**). When a future unlock allows merchant accept/edit/dismiss/complete:

### 6.1 Detect drift after create

On merchant transition RPC (`SELECT action FOR UPDATE` then), reuse **the same** §1.2 / §2.3 fencing protocol for freshness + supplier revision:

| Drift | Detection |
|---|---|
| Metric changed | Current locked metric watermark ≠ action `metric_source_watermark` / provenance |
| Pending work | Grain freshness fails on the correct §3.2 axes |
| Supplier changed | Locked `supplier_products.updated_at` / id / LT ≠ action supplier provenance under §2.3 protocol |
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

All of the following — each separately owner-authorized. **Fail-closed gates stay closed** until every item is done:

1. This fencing contract (including **h.1a** + **h.4.0**) accepted as design authority.
2. §1.6 create TX freshness protocol **implemented and adversarially proven** (mandatory SA008/serialization; grain advisory; no false-ready validate→insert gap).
3. §2.3 supplier BEFORE-trigger advisory protocol **implemented and phantom-proven** (partial unique remains deferred DiD, not a substitute unlock gate unless separately proven).
4. Local pure fence validators (h.2) + gap tests (h.3) as diagnostics — helpers/tests do **not** substitute for §1.6/§2.3.
5. Successor M7.2 writer freeze specifying the proven lock order + RPC surface.
6. Migration implementing create-time revalidation (may ship with class still rejected until explicit enable) — slice h.4.3.
7. Explicit owner approval to accept `m5_sku_daily_metric_bound_v1` (remove / gate `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE`).
8. Dual-LT disclosure fields persisted.
9. Local four-version migration-ledger discrepancy resolved or explicitly waived (**separate blocker**; **retained** — see §10).
10. Hosted schema/runtime approvals as applicable (**separate**); workers/cron remain off unless separately approved.
11. PE1.b.6b JWT J1–J13 remain **NO-GO / UNPROVEN** until a separate hosted session (**retained**).

### 7.2 Merchant-approvable predicate

All of §7.1 plus:

1. Successor M7.3 freeze for approve-time revalidation (§6) with the same freshness/supplier protocols.
2. Predicate returns true **only** for approved production source class + required trust columns + passing revalidation.
3. Harness / fixture / dormant rows remain unapprovable forever.
4. No UI wiring until predicate + create path approved.

**This document grants none of the unlocks above.** M7.2 production class rejection and M7.3 always-false merchant predicate remain **PROVEN** fail-closed.

---

## 8. Failure / negative matrix

| Scenario | Expected code / disposition |
|---|---|
| Concurrent supplier LT UPDATE under shared protocol | Wait → watermark/LT mismatch → `SUPPLIER_FACTS_STALE` / `INVALID` |
| Supplier DELETE / revoke mapping | `SUPPLIER_MAPPING_NOT_FOUND` |
| Preferred flip / INSERT phantom without shared protocol | **UNENFORCED today** (h.3); must not claim prevention; production create **BLOCKED** |
| Preferred flip / INSERT with proven §2.3 protocol | Wait / re-read → `SUPPLIER_FACTS_ABSENT` / `AMBIGUOUS` / stale reject |
| Explicit supplierId with null LT | `SUPPLIER_FACTS_ABSENT` |
| Org-default LT injection | `ORG_PLANNING_DEFAULTS_FORBIDDEN` |
| Unconsumed in-window **sales** event | `PENDING_RECOMPUTE` / `METRIC_SOURCE_WINDOW_DIRTY` |
| Planning/attestation dirty generation only | `PENDING_RECOMPUTE` |
| dirty ≠ applied / open request | `PENDING_RECOMPUTE` |
| First dirty-request INSERT racing empty check | Must **BLOCK** under grain advisory after h.4.2; today **GAP** (h.3 C1) |
| SA008 / source token mismatch (mandatory) | `SA008` / `STALE_SOURCE_TOKEN` |
| Source commit during validate→insert without held serialization | Must be impossible after §1.6; until then create **BLOCKED** |
| Stale attestation after dirty | Generation fail; cannot create on stale known-zero |
| Foreign tenant / store | `FOREIGN_TENANT_REJECTED` / scope error |
| Metric date ≠ store-local as-of / rollover | `METRIC_DATE_NOT_CURRENT` |
| Wrong algorithm | `UNSUPPORTED_METRIC_ALGORITHM` |
| Duplicate create same provenance+body | `replayed` |
| Duplicate create same identity divergent body | `DECISION_IDEMPOTENCY_BODY_CONFLICT` |
| Production class before unlock | `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE` |
| Merchant approve before predicate unlock | `ACTION_NOT_MERCHANT_APPROVABLE` |
| Approve after metric/supplier drift | `ACTION_EVIDENCE_STALE` (successor) |
| Fixture / harness as production | Reject (existing M7.2/M7.3) |

### 8.1 Dual-TX proof obligations (no shipping safety until PASS)

Live dual-TX tests must demonstrate expected **BLOCK** / **ABORT** / **RETRY** outcomes. Passing h.2 validators or h.3 gap documentation does **not** satisfy this table.

| ID | Scenario | Expect after implementation |
|---|---|---|
| S1 | Preferred INSERT phantom while create holds §2.3 lock | **BLOCK** contender or create **ABORT**/re-read `AMBIGUOUS` |
| S2 | Sibling preferred UPDATE while create holds protocol | **BLOCK** / **ABORT** after re-read |
| S3 | Exact-row LT UPDATE/DELETE under `FOR UPDATE` | **BLOCK** `55P03` (**PROVEN** today as A3; retain) |
| S4 | `csv_reconcile_supplier_product` vs create | Serialize on `71010401` |
| S5 | Cross-tenant preferred INSERT while Org-A locked | Org-B **COMMIT** (isolation) |
| M1 | Historical in-window sales INSERT under create SHARE | **BLOCK** |
| M2 | Inventory snapshot / SA008 drift | **BLOCK** writer; stale token → create **ABORT** `SA008` |
| M3 | Planning upsert + enqueue under grain advisory | **BLOCK** or create **ABORT** `PENDING_RECOMPUTE` |
| M4 | Attestation INSERT/UPDATE under SHARE | **BLOCK** |
| M5 | PO item INSERT under SHARE | **BLOCK** |
| R1 | First dirty-request INSERT vs `observed_absent` | **BLOCK** under `71010402` (closes C1) |
| R2 | Claim vs create on same request row | Skip/wait; no false-ready create |
| D1 | Create↔commit lock order | No deadlock under §1.2; wrong order must fail review |
| D2 | `lock_timeout` | Contender/create **ABORT**/RETRY `55P03`; no partial action |

Until S1, M1, and R1 **PASS** under real dual-TX: phantom / false-ready / first-request remain **UNENFORCED** — report **BLOCKED**, not safe.

---

## 9. Implementation slices

| Slice | Scope | Authorization |
|---|---|---|
| **PB1.h.1** | Initial fencing design freeze | Done @ `75db885` |
| **PB1.h.1a** | Safety correction (docs) | Done |
| **PB1.h.2** | Pure-TS fence validators (**read-model only**) | **DONE locally** — `lib/decision-engine/pb1-metric-freshness-fence.ts`, `lib/decision-engine/pb1-supplier-concurrency-fence.ts` |
| **PB1.h.3** | Local adversarial / live tests documenting TOCTOU / false-ready / first-request gaps | **DONE locally** @ `9558df7` — proves gaps; does not close them |
| **PB1.h.4.0** | This transactional fencing protocol selection (docs only) | **This amendment** — still **PROPOSED/UNENFORCED** |
| **PB1.h.4.1** | Supplier BEFORE trigger + `71010401` helper (+ csv_reconcile prelock) + local dual-TX S1–S10 | **SQL + tests authored**; deadlock-safe protocol = **writer/selection blocking prelock + BEFORE ROW try-acquire**. **Isolated live S1–S10 PASS on disposable PG 17.11** (`sa-pb1h41-pg17` → `127.0.0.1:55432` / `pb1h41_isolated_verify` / `pb1test`; schema-only from local Supabase + h.4.1 SQL only). Existing `55322` **untouched** (`h41:false`, ledger 45). Opposite-order multi-variant direct DML may `40P01` (fail-closed; no torn writes). Migration **not** applied to local Supabase/`55322`. **no** create unlock |
| **PB1.h.4.2** | Grain advisory `71010402` on all §3.4 enqueue paths + local dual-TX R1/M3 | **Separate owner approval**; local only |
| **PB1.h.4.3** | Future create TX scaffold implementing §1.2–§1.3; **production source class still rejected** | **Separate owner approval**; no class unlock |
| **Later** | Partial unique preferred DiD; class enable; merchant predicate; UI; workers; hosted | **Separate owner authorization each**; production unlock **BLOCKED** until §8.1 proven |
| Ledger repair (`20261107090000`, `20261107120000`, `20261108180000`, `20261109120000`) | Objects-without-ledger risk | **Separate blocker** (**retained**) |
| PE1.b.6b J1–J13 | Hosted JWT | **Separate session**; remains **UNPROVEN** / **NO-GO** (**retained**) |

Forbidden in h.4.0: TS/SQL/tests/schema edits, persist adapters, lifecycle RPCs, workers, `app/**`, formula edits, claiming TX atomicity from docs or pure helpers.

---

## 10. Migration ledger + hosted / PE1.b.6b (out of scope; retained)

| Item | Status |
|---|---|
| Local ledger | **49** migration files vs **45** ledger entries; missing versions `20261107090000`, `20261107120000`, `20261108180000`, `20261109120000` with objects present — **separate blocker**; no repair here |
| PE1.b.6b | Owner A1–A4+A6 may be YES on worksheet; **J1–J13 NOT EXECUTED**; JWT **UNPROVEN** / **NO-GO** |
| Hosted deploy / workers / cron / HTTP metric | **Not authorized** by this freeze |
| Paying launch / purchasing | **NO-GO** |

---

## 11. Relationship to current code (informative)

| Component | Role vs this freeze |
|---|---|
| `pb1-trusted-persisted-metric-promote-loader.ts` | Diagnostic membership load; org-wide pending — not create TX |
| `pb1-trusted-supplier-planning-facts.ts` / lead-time loader | Read-time stated terms; no FOR UPDATE; no advisory |
| `pb1-metric-freshness-fence.ts` / `pb1-supplier-concurrency-fence.ts` | h.2 read-model only; `transactionSafety=unproven` |
| `m7-pb1h3-adversarial-concurrency.live.test.ts` | Proves supplier phantom / false-ready / first-request gaps |
| `csv_reconcile_supplier_product` | Exact-row `FOR UPDATE` only — **no** shared org+variant preferred protocol |
| `pb1-evidence-qualified-*-diagnostic.ts` | Hard-false diagnostic only |
| `persist_inventory_action_recommendation` | Rejects production class (**PROVEN**) |
| `inventory_action_is_merchant_approvable` | Always false (**PROVEN**) |
| Planning / PB1.e invalidation | Generation dirty paths — distinct from sales event window |
| M5.5 / trusted-incoming SA008 SHARE + token | Pattern to **reuse mandatorily** for production create — not optional |
| `prevent_supplier_product_identity_reassignment` | **PROVEN** forbid org/supplier/variant UPDATE reassignment |

### 11.1 Classification snapshot (h.4.0)

| Class | Items |
|---|---|
| **Confirmed existing protections** | Exact-row supplier `FOR UPDATE` (h.3 A3); M5 SHARE+SA008 on commit; generation/open-status h.2 checks; production class reject; merchant approvable false; supplier identity reassignment forbid; browser supplier DML revoke |
| **Proposed enforceable fixes** | Supplier BEFORE-trigger advisory `71010401`; grain advisory `71010402` on §3.4 paths; create SHARE-before-metric order; mandatory SA008 under held SHARE through insert |
| **Contract amendments in this doc** | Lock-order correction; primary strategy A; first-request = grain advisory; planning ≠ SA008-only |
| **Deferred** | Partial unique preferred; SERIALIZABLE primary; new tokens/formulas; row-level SHARE optimization; ledger repair; hosted/JWT |

---

## 12. GO / NO-GO summary

| Item | Call |
|---|---|
| PB1.h.1a docs correction | **GO** (prior) |
| PB1.h.4.0 protocol freeze (docs only) | **GO** |
| Claim phantom-safe / atomic-fresh create today | **NO-GO** |
| Local pure validators (PB1.h.2) | **GO (done; helpers only)** |
| Local adversarial gap tests (PB1.h.3) | **GO (done; documents gaps)** |
| PB1.h.4.1 supplier trigger implementation | **SQL+tests authored**; **CONDITIONAL GO** to apply + live-prove after explicit owner approval; until then **UNENFORCED** |
| PB1.h.4.2 / h.4.3 | **CONDITIONAL GO** each after separate approval |
| Production create / merchant approve unlock | **NO-GO** / **BLOCKED** |
| Formula changes / org-default LT promotion / delivery fabrication | **NO-GO** |
| Ledger repair / hosted JWT execution / workers | **NO-GO** (separate; retained) |

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
- `lib/decision-engine/pb1-metric-freshness-fence.ts`
- `lib/decision-engine/pb1-supplier-concurrency-fence.ts`
- `tests/unit/m7-pb1h3-adversarial-concurrency.live.test.ts`
- `supabase/migrations/20261031100000_m7_2b_inventory_action_persistence.sql`
- `supabase/migrations/20261031130000_m7_3c_trusted_lifecycle_rpcs.sql`
- `supabase/migrations/20261109120000_pb1e_attestation_freshness_invalidation.sql`
- `supabase/migrations/20261108170000_planning_evidence_binding_v1.sql`
- `supabase/migrations/20261108180000_trusted_incoming_evidence_v1.sql` (`commit_sku_daily_metric` SHARE order + SA008)
- `supabase/migrations/20261011133000_m2_5_suppliers_purchase_orders.sql`
- `supabase/migrations/20261011184500_m3_9_csv_history_relationship_reconciliation.sql` (`csv_reconcile_supplier_product`)
- `supabase/migrations/20261016100000_m5_6b_metric_recompute_requests.sql` (`consume_sku_daily_metric_source_events`)

---

## 14. Immutability note (h.1a / h.4.0)

Contract text may be corrected for **safety honesty** and **protocol selection** (h.1a, h.4.0). Claims of shipping concurrency/freshness safety become immutable only after the corresponding **PROPOSED** protocols are implemented, adversarially dual-TX tested (§8.1), and separately owner-authorized. Until then, overclaiming is forbidden; production create/approve remain fail-closed.

---

### PB1.h.2 local implementation note

Pure validators are **LOCAL read-model checks only**. They accept caller-supplied projections, return structured PASS/FAIL with stable reason codes, and always set `transactionSafety: "unproven"` / `productionCreateEligible: false`. They do **not** replace §1.6 create TX serialization, §2.3 shared supplier-writer / phantom proof, M7.2 source-of-create unlock, or M7.3 merchant-approvable unlock.

### PB1.h.3 local implementation note

Adversarial live tests document **current** UNENFORCED / GAP boundaries. Observed COMMIT of phantom preferred INSERT, unlocked source mutations, and first dirty-request INSERT prove the need for h.4.1–h.4.3 — they do **not** implement those protocols.

### PB1.h.4.0 docs note

This amendment freezes the **chosen** serialization design only. Namespaces `71010401` / `71010402`, trigger shape, and lock order are **PROPOSED**. No SQL objects are created by this docs change.

**STOP.** Await owner authorization before PB1.h.4.1 supplier trigger implementation or any production unlock.
