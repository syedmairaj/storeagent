# M7.2a — Immutable Decision Persistence Contract Freeze

**Status:** FROZEN for M7.2b dormant local schema/RPC engineering  
**Baseline verified:** `main` @ `a3e621b` — `feat(decisions): add fixture-only M7 evaluation foundation`  
**Authority when docs conflict:** this freeze for M7.2 persistence; M0.6 engine/math remain frozen under `lib/decision-engine/*` and `lib/metrics/inventory-math.ts`.

This freeze does **not** authorize production forecast operation, M5 worker/cron/HTTP enablement, E.4 canary drain, production decision writers, human-approval APIs, purchasing, inventory mutation, merchant UI, or hosted deploy.

---

## 0. Verdict

| Gate | Result |
|---|---|
| M7.2 local dormant persistence infrastructure (schema + RPC + local adversarial tests) | **GO** for M7.2b under this contract |
| Production decision writer / automatic create path | **NO-GO** |
| Production activation / hosted M7 operation | **NO-GO** |
| Treating `service_role` EXECUTE as proof of production-authorized evidence | **FORBIDDEN** |

**Why NO-GO on a production writer:** a trusted source-of-create cannot be established without an approved production M5 metric revalidation path and separate M6 forecast eligibility approval. `service_role` alone proves privilege, not evidence provenance. Fixture-only M7.1 outputs are never production-persistable. M7.2 therefore stops at **dormant persistence infrastructure**.

---

## 1. Frozen decisions

### 1.1 Approved local engineering posture

1. M7.2 may proceed as **local engineering only**. No production activation.
2. Existing M0.6 engine and math remain **frozen**. Persistence must not fork decision rules.
3. Inventory action grain is `(organization_id, store_id, location_id, variant_id)` with **non-null `location_id`** for V1 persistence.
4. Domain types may keep wider compatibility (`InventoryAction.locationId` nullable in TypeScript). The **M7 persistence boundary** rejects null/blank location.
5. `WATCH` is persistable with explicit reason codes and **null** `recommended_quantity`.
6. `HEALTHY` is a state, never an `InventoryAction`. Persist RPC must reject `action_type` null / HEALTHY-as-action.
7. Recommendation fields and evidence snapshot are **immutable** after insert.
8. No action status/supersede mutation in M7.2. Lifecycle operations are deferred to **M7.3**.
9. `forecast_run_id` must be **null** until a separate production forecast eligibility approval.
10. Preserve the existing M0.6 decision reproducibility fingerprint (fnv1a32). Use a **separate strong SHA-256 persistence body hash** for idempotent conflict authority.
11. Persist only through a `service_role`-only `SECURITY DEFINER` RPC. RLS on; **no direct table DML** for writers.
12. Fixture-only M7.1 outputs are **never** production-persistable and must be rejected by the RPC.
13. No public/client-supplied persistence API.
14. No automatic purchase, supplier outreach, inventory mutation, or approval workflow.

### 1.2 Resolved design questions (A–G)

#### A. Idempotency identity

**Rejected:** uniqueness on `(grain, decision_as_of_date, algorithm_version)` alone. That collapses distinct source evidence into one row and destroys history.

**Frozen idempotency identity** (unique index):

```
organization_id
store_id
location_id
variant_id
decision_as_of_date
algorithm_version          -- inventory-decision-v1
configuration_version
evidence_provenance_fingerprint
```

`evidence_provenance_fingerprint` is a **SHA-256 hex** digest of the canonical provenance payload (see §3.3). It identifies *which source evidence* was evaluated, not merely the calendar grain.

**Historical multiplicity rule:** repeated legitimate evaluations for the same grain/date/version **must create distinct historical actions** whenever evidence provenance differs (new metric watermark, changed evidence body, different source class/token, etc.). Same provenance + same body is retry/replay, not a new commercial recommendation.

#### B. Immutable recommendation vs future lifecycle

**Immutable at insert (M7.2 recommendation body):**

- grain ids
- `action_type` (`REORDER` \| `REDUCE` \| `PROMOTE` \| `WATCH`)
- `compatible_secondary_action_types`
- `priority`
- `recommended_quantity` (non-null only for `REORDER`; must be null otherwise)
- `recommended_action_date` (nullable ISO date; may equal `decision_as_of_date` when set)
- `confidence`
- `reason_codes` / confidence-related reason codes carried in evidence
- `evidence_snapshot` (`InventoryActionEvidence`)
- `forecast_run_id` (= null in M7.2)
- `algorithm_version`, `configuration_version`, algorithm version map
- `decision_reproducibility_fingerprint` (M0.6 weak fingerprint; informational)
- `decision_body_hash` (strong; conflict authority)
- `evidence_provenance_fingerprint`
- provenance/trust columns (§3.4)
- `created_at`

**Deferred to M7.3 (not mutated in M7.2):**

- status transitions (`new` → accepted / dismissed / expired / superseded)
- `superseded_by_action_id`
- `ActionEvent` append stream
- merchant edited quantity
- expiry processing
- any UPDATE/DELETE path

M7.2 stores `status = 'new'` with a CHECK forcing `'new'` only. Immutability triggers forbid UPDATE/DELETE. There is **no** supersede RPC in M7.2.

#### C. Canonical persisted evidence + provenance

**Evidence snapshot** is exactly canonical `InventoryActionEvidence` (M0.6.10):

- `availableQuantity`, `incomingQuantity`
- `demandVelocity`, `daysOfStock`, `leadTimeDays`
- `safetyStockUnits`, `reorderPointUnits`, `targetStockUnits`
- `inventoryAgeDays`
- `forecastExpectedDemandUnits`
- `dataQualityScore`
- `reasonCodes` (deterministic; WATCH requires explicit codes including material-uncertainty/conflict codes when applicable)

**Not stuffed into evidence ad hoc** (may exist on the action row or remain absent in M7.2): forecast confidence, stockout/overstock risk, ROQ (ROQ appears only as `recommended_quantity` for REORDER).

**Required provenance columns** (separate from snapshot JSON):

| Field | Rule |
|---|---|
| `evidence_source_class` | Closed vocabulary (§3.2) |
| `decision_as_of_date` | Required store-local as-of date |
| `pinned_time_zone` | Required non-blank IANA TZ used for as-of interpretation |
| `incoming_state_known` | Required boolean; must be consistent with snapshot incoming nullability |
| `metric_date` | Required when source class is metric-bound; required for harness as declared fixture-of-contract date |
| `metric_algorithm_version` | Required non-blank when metric-bound; harness must supply declared version string |
| `metric_source_watermark` | Required non-blank opaque watermark string (e.g. metric `updated_at` RFC3339 or future source commit token) |
| `forecast_run_id` | Must be null |
| Trust flags | Hard-false for dormant/harness; see §4 |

#### D. Strong body-hash + DB conflict verification

1. Keep M0.6 `decision_reproducibility_fingerprint` as informational only.
2. `decision_body_hash` = `sha256` hex of stable-serialized **immutable body** (§3.5), excluding `id`, `created_at`, and any caller-supplied hash field.
3. Authoritative hash is derived by the persistence adapter (future) **and** re-derived/verified by the RPC from normalized payload fields. Mismatch → reject.
4. On idempotent replay, RPC compares stored `decision_body_hash` **and** material columns field-by-field. Any divergence → `DECISION_IDEMPOTENCY_BODY_CONFLICT`.

#### E. Fixture rejection and production trust

- M7.1 `evaluateFixtureInventoryDecision` outputs / `controlled_fixture_only` / `m7-controlled-local-fixture-v1` attestation → **reject**.
- Any payload with `claimsM7ProductionEligibility=true`, `claimsMerchantFacing=true`, `claimsProductionForecastApproval=true`, or `algorithmApproved=true` → **reject** in M7.2.
- `service_role` EXECUTE ≠ production-authorized evidence.
- Production-shaped source class `m5_sku_daily_metric_bound_v1` is **reserved** but M7.2b RPC **always rejects** it with `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE` until a future approved writer revalidates M5 source in-transaction (pattern: M6 `persist_forecast_sku_demand_result` source_token revalidation).
- Local adversarial success path uses only `m7_persistence_contract_harness_v1` (§3.2), which is explicitly non-merchant and hard-false.

#### F. Concurrent create / replay / conflict

| Situation | Result |
|---|---|
| First insert of idempotency identity | `disposition=created` |
| Concurrent duplicate insert, same body | one creates; loser `unique_violation` → load + body match → `disposition=replayed` |
| Same identity, different `decision_body_hash` / material fields | raise `DECISION_IDEMPOTENCY_BODY_CONFLICT` |
| Different `evidence_provenance_fingerprint` | distinct rows (history), not conflict |
| UPDATE/DELETE on table | immutability trigger raises |
| Direct INSERT by roles other than definer path | revoked; fail |

No upsert that overwrites recommendation fields.

#### G. FKs, RLS, ownership, grants

- Composite FKs (M6 style):
  - `(organization_id) → organizations`
  - `(organization_id, store_id) → stores`
  - `(organization_id, store_id, location_id) → locations`
  - `(organization_id, store_id, variant_id) → product_variants`
- `forecast_run_id` column exists as nullable UUID with CHECK `forecast_run_id IS NULL` for M7.2 (no FK activation until forecast eligibility approval).
- RLS enabled; authenticated org-member **SELECT** only; anon none; no client INSERT/UPDATE/DELETE.
- Revoke ALL table privileges from `PUBLIC`, `anon`, `authenticated`, `service_role`; grant `SELECT` to `authenticated` (policy-bounded) and `service_role` as needed for operators; writes only via RPC.
- RPC `SECURITY DEFINER`, `search_path = ''`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE TO service_role` only.
- Function owner follows existing M5/M6 migration convention (postgres / supabase admin role used by prior migrations).

---

## 2. Unresolved blockers (explicit)

These are **not** solved by M7.2a/b and remain separate approvals:

1. **Trusted production source-of-create** — in-TX revalidation against durable M5 metric source (and any supplier constraint source) analogous to forecast `source_token`.
2. **Production M6 forecast eligibility** — required before non-null `forecast_run_id` or forecast-backed evidence may persist.
3. **Production decision writer / job** — server orchestration that reads trusted sources, runs frozen engine, calls RPC.
4. **M7.3 lifecycle** — status, supersede, ActionEvent, merchant edit.
5. **Hosted schema deploy / production activation**.
6. **M5 worker/cron/HTTP and E.4 canary** — unchanged bans.

Until (1)–(3) are separately approved, M7.2 remains dormant infrastructure.

---

## 3. Proposed tables and RPC

### 3.1 Table: `public.inventory_actions`

Smallest M7.2 recommendation store. One row = one immutable versioned recommendation.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `organization_id` | `uuid` NOT NULL | |
| `store_id` | `uuid` NOT NULL | |
| `location_id` | `uuid` NOT NULL | persistence requires non-null |
| `variant_id` | `uuid` NOT NULL | |
| `decision_as_of_date` | `date` NOT NULL | |
| `pinned_time_zone` | `text` NOT NULL | |
| `action_type` | `text` NOT NULL | `REORDER\|REDUCE\|PROMOTE\|WATCH` |
| `compatible_secondary_action_types` | `jsonb` NOT NULL DEFAULT `[]` | array of action types; V1 REDUCE+PROMOTE only |
| `priority` | `text` NOT NULL | `critical\|high\|medium\|low` |
| `status` | `text` NOT NULL DEFAULT `'new'` | CHECK `= 'new'` only |
| `recommended_quantity` | `integer` NULL | whole units; REORDER only; `> 0` when set |
| `recommended_action_date` | `date` NULL | |
| `confidence` | `text` NOT NULL | `high\|medium\|low` |
| `evidence_snapshot` | `jsonb` NOT NULL | canonical `InventoryActionEvidence` |
| `incoming_state_known` | `boolean` NOT NULL | |
| `evidence_source_class` | `text` NOT NULL | §3.2 |
| `metric_date` | `date` NOT NULL | |
| `metric_algorithm_version` | `text` NOT NULL | |
| `metric_source_watermark` | `text` NOT NULL | |
| `forecast_run_id` | `uuid` NULL | CHECK NULL in M7.2 |
| `algorithm_version` | `text` NOT NULL | `inventory-decision-v1` |
| `configuration_version` | `text` NOT NULL | |
| `algorithm_versions` | `jsonb` NOT NULL | M0.6 version map |
| `decision_reproducibility_fingerprint` | `text` NOT NULL | M0.6 fnv1a32 hex; informational |
| `evidence_provenance_fingerprint` | `text` NOT NULL | sha256 hex; part of unique key |
| `decision_body_hash` | `text` NOT NULL | sha256 hex; conflict authority |
| `claims_merchant_facing` | `boolean` NOT NULL | must be false in M7.2 |
| `claims_production_forecast_approval` | `boolean` NOT NULL | must be false |
| `claims_m7_production_eligibility` | `boolean` NOT NULL | must be false |
| `algorithm_approved` | `boolean` NOT NULL | must be false |
| `is_scored_merchant_decision` | `boolean` NOT NULL | must be false |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

**Checks (non-exhaustive, required intent):**

- action/priority/confidence vocabularies
- WATCH/REDUCE/PROMOTE ⇒ `recommended_quantity IS NULL`
- REORDER ⇒ `recommended_quantity > 0`
- evidence JSON object with required keys; `reasonCodes` array; WATCH ⇒ `jsonb_array_length(reasonCodes) >= 1`
- all trust flags false
- `forecast_run_id IS NULL`
- hash columns match `^[a-f0-9]{64}$` for sha256 fields; reproducibility fingerprint non-blank (8-char fnv allowed)
- secondary action array contains only allowed types and never duplicates primary

**Indexes:**

- unique idempotency index on §1.2.A columns
- supporting `(organization_id, store_id, decision_as_of_date)`

**Triggers:** BEFORE UPDATE OR DELETE → immutability exception (reuse M6 pattern).

**Out of M7.2 scope:** `action_events` table, supersede columns, cash/revenue-at-risk estimates, AI explanation fields.

### 3.2 `evidence_source_class` vocabulary

| Class | M7.2b RPC behavior | Meaning |
|---|---|---|
| `m7_persistence_contract_harness_v1` | **Accept** when trust flags hard-false and payload valid | Local adversarial/contract harness only. Never merchant-facing. Never production eligibility. |
| `m5_sku_daily_metric_bound_v1` | **Reject** `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE` | Reserved production-shaped class. Requires future in-TX M5 revalidation writer. |
| `controlled_fixture_only` | **Reject** `FIXTURE_EVIDENCE_REJECTED` | M7.1 fixture scope |
| any other / missing | **Reject** | Fail closed |

Harness rows prove RPC/idempotency/RLS behavior only. They must never be reported as merchant decisions or algorithm approval.

### 3.3 `evidence_provenance_fingerprint` payload

Stable-serialize then SHA-256:

```
{
  evidenceSourceClass,
  organizationId, storeId, locationId, variantId,
  decisionAsOfDate,
  pinnedTimeZone,
  metricDate,
  metricAlgorithmVersion,
  metricSourceWatermark,
  incomingStateKnown,
  evidenceSnapshot,          // canonical InventoryActionEvidence
  forecastRunId              // always null in M7.2
}
```

Key order is alphabetical via the repo’s existing stable-serialize discipline (same spirit as forecast evaluation / decision reproducibility helpers). Changing commercial evidence or watermarks changes the fingerprint ⇒ new historical action identity.

### 3.4 Trust / audience columns

For every M7.2 insert (including harness):

- `claims_merchant_facing = false`
- `claims_production_forecast_approval = false`
- `claims_m7_production_eligibility = false`
- `algorithm_approved = false`
- `is_scored_merchant_decision = false`

RPC rejects true values. Table CHECKs enforce false.

### 3.5 `decision_body_hash` payload

Stable-serialize then SHA-256 (exclude hashes/id/timestamps):

```
{
  organizationId, storeId, locationId, variantId,
  decisionAsOfDate, pinnedTimeZone,
  actionType, compatibleSecondaryActionTypes, priority, status,
  recommendedQuantity, recommendedActionDate, confidence,
  evidenceSnapshot, incomingStateKnown,
  evidenceSourceClass, metricDate, metricAlgorithmVersion, metricSourceWatermark,
  forecastRunId,
  algorithmVersion, configurationVersion, algorithmVersions,
  decisionReproducibilityFingerprint,
  evidenceProvenanceFingerprint,
  claimsMerchantFacing, claimsProductionForecastApproval,
  claimsM7ProductionEligibility, algorithmApproved, isScoredMerchantDecision
}
```

### 3.6 RPC: `public.persist_inventory_action_recommendation`

```
persist_inventory_action_recommendation(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_payload jsonb
) returns jsonb
```

**Authorization:** `service_role` EXECUTE only; `SECURITY DEFINER`; `search_path=''`.

**Independent grain validation (do not trust JSON ids):** verify store/location/variant ownership composite FKs exist for the four UUID args; require payload grain ids to match args exactly.

**Payload (required keys):** fields needed to populate §3.1 + precomputed `evidenceProvenanceFingerprint` and optional client `decisionBodyHash` that must match RPC-computed hash.

**Result:**

```
{
  "ok": true,
  "disposition": "created" | "replayed",
  "inventoryActionId": "<uuid>",
  "decisionBodyHash": "<sha256>",
  "evidenceProvenanceFingerprint": "<sha256>",
  "claimsMerchantFacing": false,
  "claimsProductionForecastApproval": false,
  "claimsM7ProductionEligibility": false,
  "algorithmApproved": false,
  "isScoredMerchantDecision": false
}
```

**Failure codes (message tokens; fail closed):**

| Token | When |
|---|---|
| `DECISION_PERSISTENCE_SCOPE_ERROR` | grain/ownership mismatch |
| `DECISION_PERSISTENCE_INVALID_PAYLOAD` | missing/malformed fields, HEALTHY, bad quantity rules |
| `FIXTURE_EVIDENCE_REJECTED` | fixture/M7.1 attestation or `controlled_fixture_only` |
| `PRODUCTION_TRUST_CLAIM_REJECTED` | any production/merchant/algorithm-approved claim true |
| `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE` | `m5_sku_daily_metric_bound_v1` (dormant) |
| `FORECAST_RUN_FORBIDDEN` | non-null `forecastRunId` |
| `DECISION_BODY_HASH_MISMATCH` | supplied hash ≠ RPC digest |
| `DECISION_IDEMPOTENCY_BODY_CONFLICT` | same identity, different body |
| immutability errors | UPDATE/DELETE attempts |

No HTTP route, no cron, no worker, no browser client.

---

## 4. Trust boundary and failure matrix

| Caller / evidence | Persist? | Notes |
|---|---|---|
| Browser / `anon` / `authenticated` RPC | No | EXECUTE revoked |
| Arbitrary `service_role` with fixture M7.1 result | No | `FIXTURE_EVIDENCE_REJECTED` |
| Arbitrary `service_role` claiming production eligibility | No | trust flags rejected; privilege ≠ provenance |
| `m5_sku_daily_metric_bound_v1` without approved writer | No | `PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE` |
| Local harness class + hard-false flags | Yes (local only) | Contract/adversarial proof only |
| Production writer after future approvals | Future | Must revalidate M5 source in-TX; still no client API |

**Invariant:** persistence success never implies algorithm approval, merchant-facing authority, or forecast eligibility.

---

## 5. Idempotency and concurrency guarantees

1. **Identity** = grain + `decision_as_of_date` + algorithm/config versions + `evidence_provenance_fingerprint`.
2. **Replay:** same identity + same body → `replayed`, same `inventoryActionId`.
3. **Conflict:** same identity + different body → exception; no overwrite.
4. **History:** different provenance fingerprint → additional immutable row.
5. **Concurrency:** rely on unique index + `unique_violation` replay path (M6 P4c pattern); no recommendation mutation.
6. **M0.6 fingerprint** does not participate in uniqueness or conflict authority.

---

## 6. Exact M7.2b implementation scope

### In scope (local only)

1. Docs already frozen by this file; do not expand into product roadmap DOCX.
2. One SQL migration:
   - `inventory_actions` table, constraints, composite FKs, unique idempotency index
   - immutability trigger/function
   - RLS + grants
   - `persist_inventory_action_recommendation`
3. Local adversarial SQL/vitest coverage (native local Postgres), including:
   - harness create → replay same body
   - same identity different body → conflict
   - distinct provenance → two rows
   - null location rejected
   - HEALTHY / null action rejected
   - WATCH without reasons rejected; WATCH quantity must be null
   - REORDER quantity rules
   - fixture / controlled_fixture / M7.1 attestation rejected
   - production trust claims rejected
   - `m5_sku_daily_metric_bound_v1` rejected as dormant
   - non-null `forecast_run_id` rejected
   - authenticated cannot INSERT/UPDATE/DELETE/EXECUTE
   - cross-org SELECT denied
   - UPDATE/DELETE blocked by immutability trigger
4. Optional minimal pure-TS **harness payload builder + hash helpers** used only by local tests (not a production writer; must not call M5/M6 production loaders; must not import fixture evaluation as a persist source).

### Out of scope / banned in M7.2b

- Production writer / background job / cron / HTTP
- M5/M6 contract or loader changes
- Hosted migration apply / production activation
- `action_events`, supersede, approval, buying, inventory mutation
- Wiring `evaluateFixtureInventoryDecision` into persistence
- Non-null forecast references
- E.4 canary operations
- Git commit/push unless separately requested
- Unrelated dirty-tree files

### Suggested acceptance for M7.2b close

- local `db reset` + targeted adversarial tests green
- `tsc` / eslint / `git diff --check` on touched files
- explicit closeout note: **dormant**; no production writer; no hosted claim

---

## 7. GO / NO-GO recommendation

| Item | Recommendation |
|---|---|
| Freeze this contract (M7.2a) | **GO** |
| Implement M7.2b local dormant schema/RPC/adversarial tests per §6 | **GO** |
| Implement production decision persistence writer | **NO-GO** (blocked on trusted M5 source-of-create + separate approvals) |
| Persist M7.1 fixture evaluations into `inventory_actions` | **NO-GO** |
| Enable hosted M7 / workers / HTTP / forecast-backed actions | **NO-GO** |

**Next authorized engineering step after this freeze:** M7.2b local SQL + adversarial tests only. Stop before any production writer.

---

## 8. References

- `docs/M7_0_CONTRACT_ADDENDUM.md` — M7.1 fixture-only evaluation
- `docs/DECISION_ENGINE.md` — M0.6 frozen engine
- `docs/HISTORY_AND_IMMUTABILITY.md` — immutable recommendations; lifecycle via events/supersede (M7.3+)
- `docs/DOMAIN_INVARIANTS.md` §§16–19
- `docs/M2_CANONICAL_PERSISTENCE.md` — canonical persistence rules
- `docs/RLS_ARCHITECTURE.md` / `docs/SERVICE_ROLE_BOUNDARY.md`
- M6 analogs: `forecast_runs` source_token idempotency; `persist_forecast_evaluation_result` body-hash conflict
- `lib/commerce-domain/types.ts` — `InventoryAction` / `InventoryActionEvidence`
- `lib/decision-engine/*` — frozen engine + M7.1 fixture adapter (non-persistable)
