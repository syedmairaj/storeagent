# M7.3a — Human Approval Lifecycle Contract Freeze

**Status:** FROZEN for M7.3b local schema/RPC engineering
**Baseline verified:** `main` @ `df8a590` — `test(decisions): close M7 dormant persistence E2E verification`
**Authority when docs conflict:** this freeze for M7.3 human lifecycle; M7.2 persistence remains frozen under `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md`; M0.6 engine/math remain frozen under `lib/decision-engine/*` and `lib/metrics/inventory-math.ts`.

This freeze does **not** authorize production decision generation, production decision writers, merchant HTTP/UI activation, workers/cron/schedulers, E.4 canary operations, purchase orders, supplier contact, payments, inventory mutation, M5/M6 contract changes, hosted deploy, or Git operations.

---

## 0. Verdict

| Gate | Result |
|---|---|
| Freeze this lifecycle contract (M7.3a docs only) | **GO** |
| M7.3b local schema + lifecycle RPC + adversarial reject/structure tests | **GO** under this contract |
| Merchant approval success against harness/dormant rows | **NO-GO** (unapprovable by design) |
| Production-eligible merchant approve success path | **NO-GO** until separate trusted M5/M6 source-of-create approval |
| Workers / cron / HTTP / merchant UI for approvals | **NO-GO** |
| Treating approval/completion/dismissal as PO, supplier, payment, or inventory mutation | **FORBIDDEN** |
| Folding anomalous raw persist `23505` into M7.3 lifecycle | **NO-GO** — track separately (§8) |

**Why fail-closed on merchant success today:** every M7.2-persisted row is harness/dormant with hard-false trust flags. Production eligibility remains unsettable until a trusted source-of-create is separately approved. Lifecycle infrastructure may still be engineered locally.

---

## 1. Frozen decisions

### 1.1 Approved local engineering posture

1. Reuse the existing domain status-transition matrix in `lib/commerce-domain/history-policy.ts`. **Do not invent new statuses or event types.**
2. Recommendation quantity, evidence, confidence, algorithms, provenance, hashes, trust/source columns, and grain ids remain **immutable** after insert.
3. Only lifecycle **`status`** and **`superseded_by_action_id`** may change on `inventory_actions`, and **only** through trusted transition RPCs.
4. `REORDER` + `accepted_with_edit` requires a positive integer `editedQuantity` different from the original recommendation. The edit lives **only** on `ActionEvent`.
5. `REDUCE` / `PROMOTE` / `WATCH` **cannot** carry `editedQuantity` (must be null on every event for those action types).
6. Roles (verified SQL + domain): `owner` \| `admin` \| `analyst` \| `operator`. Decide roles: **owner / admin / operator**. **Analyst** is read-only for decisions (`actions.decide = no`).
7. Merchant actor identity comes only from trusted auth context (`auth.uid()`) plus `organization_members` membership/role. Never trust client-supplied actor identity. **`service_role` alone is never merchant consent.**
8. Harness / fixture / dormant actions are **unapprovable**. Production eligibility predicate remains **fail-closed** until a separate trusted M5/M6 source-of-create is approved.
9. `action_events` are append-only, with idempotency, replay, body-conflict, and row-level concurrency control.
10. Atomic `created` ActionEvent is **reserved** for future production action creation. **Do not** backfill `created` events onto existing harness rows.
11. Expire / supersede RPCs may be designed and locally tested. **No workers or scheduler** in M7.3.
12. Approval, completion, and dismissal **never** create POs, contact suppliers, charge payments, or mutate inventory.
13. Preserve original M7.2 persistence behavior and source rejection (`persist_inventory_action_recommendation` unchanged in commercial meaning).
14. Anomalous raw persist `23505` (unique_violation re-raise when replay SELECT finds no row) is a **separate** pre-production hardening issue (§8).

### 1.2 Resolved design questions (A–G)

#### A. Exact status / event transition matrix

Authority: `canTransitionActionStatus` / `isTerminalActionStatus` / `supersedeAction` / `actionEventPreservesOriginalRecommendation` in `lib/commerce-domain/history-policy.ts`, aligned with `docs/DOMAIN_INVARIANTS.md` §§16–18 and `docs/HISTORY_AND_IMMUTABILITY.md`.

**Statuses** (`InventoryActionStatus`):
`new` \| `accepted` \| `accepted_with_edit` \| `dismissed` \| `completed` \| `expired` \| `superseded`

**Event types** (`ActionEventType`):
`created` \| `accepted` \| `accepted_with_edit` \| `dismissed` \| `completed` \| `expired` \| `superseded`

| From status | Event type | To status | Actor class | Extra rules |
|---|---|---|---|---|
| _(insert)_ | `created` | `new` | system (future production create only) | Atomic with production insert; **not** emitted for M7.2 harness rows; **no backfill** |
| `new` | `accepted` | `accepted` | merchant (decide role) | `editedQuantity` **must be null**; action must pass eligibility (§C) |
| `new` | `accepted_with_edit` | `accepted_with_edit` | merchant (decide role) | **REORDER only**; `editedQuantity` integer `> 0` and `≠ recommended_quantity`; edit on event only |
| `new` | `dismissed` | `dismissed` | merchant (decide role) | `editedQuantity` null; terminal |
| `new` | `expired` | `expired` | system | `editedQuantity` null; terminal; no worker required to *design* RPC |
| `new` | `superseded` | `superseded` | system | sets `superseded_by_action_id`; evidence untouched |
| `accepted` | `completed` | `completed` | merchant (decide role) | manual completion ack only; **not** PO/buy; terminal |
| `accepted_with_edit` | `completed` | `completed` | merchant (decide role) | same as above |
| `accepted` | `superseded` | `superseded` | system | sets `superseded_by_action_id` |
| `accepted_with_edit` | `superseded` | `superseded` | system | sets `superseded_by_action_id` |
| terminal (`dismissed` \| `completed` \| `expired` \| `superseded`) | any | — | — | **Reject**; history never reopens |

**Forbidden:**

- `accepted_with_edit` on `REDUCE` / `PROMOTE` / `WATCH`
- any non-null `editedQuantity` except on `accepted_with_edit`
- `editedQuantity === recommended_quantity`
- `editedQuantity <= 0` or non-integer
- merchant events on ineligible / harness / fixture / dormant rows
- rewriting recommendation columns during any transition

Same-status identity (`from === to`) in `canTransitionActionStatus` is **not** a merchant write path. Merchant/system RPCs use append-event + legal transition only; retries use idempotency (§E), not silent status no-ops.

#### B. Role / actor authorization matrix

Verified role names: `organization_members.role ∈ {owner, admin, analyst, operator}`
(`supabase/migrations/20261009090000_m1_3_canonical_foundation.sql`, `OrganizationMemberRole`, `docs/ROLE_AND_PERMISSION_MODEL.md`).

| Capability | owner | admin | analyst | operator | service_role (no user) |
|---|---|---|---|---|---|
| Read actions / events (RLS member) | yes | yes | yes | yes | operator/tooling only |
| `accepted` / `accepted_with_edit` / `dismissed` / `completed` | yes | yes | **no** | yes | **no** (not consent) |
| System `expired` / `superseded` RPC EXECUTE | no\* | no\* | no | no | yes (system path) |
| Client-direct UPDATE/DELETE on actions/events | no | no | no | no | no (RPC only) |
| Supply `actor_user_id` in payload | ignored / rejected | same | same | same | n/a |

\*Authenticated roles do not call system expire/supersede as merchant consent. System RPCs are `service_role` EXECUTE only and record `actor_user_id = null`.

**Merchant actor binding:**

1. `auth.uid()` must be non-null.
2. Row in `organization_members` for action’s `organization_id`.
3. Role ∈ `{owner, admin, operator}` (permission `actions.decide`).
4. Persist `actor_user_id = auth.uid()` on the event. Client-supplied actor fields are rejected or ignored.

**Invariant:** `service_role` privilege proves database privilege only. It never substitutes for merchant membership consent on accept/edit/dismiss/complete.

#### C. Action eligibility requirements

**Merchant lifecycle eligibility (fail-closed).** All of the following must be true, or the merchant transition RPC rejects:

| Requirement | Rule |
|---|---|
| Source class | Not harness / fixture / dormant vocabulary: reject `m7_persistence_contract_harness_v1`, `controlled_fixture_only`, and any non-approved class |
| `claims_merchant_facing` | must be `true` |
| `claims_m7_production_eligibility` | must be `true` |
| `algorithm_approved` | must be `true` |
| `is_scored_merchant_decision` | must be `true` |
| Production source-of-create | Source class must be an **approved** production create class under a separate M5/M6 trust approval (today: **none approved**; `m5_sku_daily_metric_bound_v1` remains unavailable for create) |
| Forecast claim | If `claims_production_forecast_approval` is used commercially later, it remains gated by separate forecast approval; M7.3 does not loosen M7.2 forecast null rules |

**Today’s consequence:** every row creatable under M7.2 (harness + hard-false trust CHECKs) **fails** eligibility. Merchant accept/edit/dismiss/complete against those rows must return a stable rejection token (e.g. `ACTION_NOT_MERCHANT_APPROVABLE` / `ACTION_PRODUCTION_ELIGIBILITY_FAILED`).

**System expire/supersede** may target rows regardless of merchant eligibility (historical hygiene), still without rewriting evidence and without implying merchant approval.

**M7.2 create path unchanged:** harness accept-for-persist with hard-false flags; fixture/production-trust/source rejection preserved.

#### D. Immutable vs lifecycle-mutable fields

**Immutable forever after insert** (recommendation / provenance body):

- grain: `organization_id`, `store_id`, `location_id`, `variant_id`
- `decision_as_of_date`, `pinned_time_zone`
- `action_type`, `compatible_secondary_action_types`, `priority`
- `recommended_quantity`, `recommended_action_date`, `confidence`
- `evidence_snapshot`, `incoming_state_known`
- `evidence_source_class`, metric provenance columns
- `forecast_run_id`, algorithm/config/version map
- `decision_reproducibility_fingerprint`, `evidence_provenance_fingerprint`, `decision_body_hash`
- all trust / audience claim columns
- `created_at`
- future `expires_at` if added at create time (immutable after insert)

**Lifecycle-mutable only via trusted RPC:**

- `status`
- `superseded_by_action_id` (null → non-null on supersede; never cleared; never self-reference)

**Never mutable via lifecycle:** recommendation quantity, evidence, hashes, trust flags, source class.

**Schema implication:** replace M7.2 blanket `BEFORE UPDATE OR DELETE` immutability with a **narrow** trigger:

- `DELETE` still forbidden
- `UPDATE` allowed only when every non-lifecycle column is unchanged
- only `status` and `superseded_by_action_id` may differ
- expand status CHECK from `'new'`-only to the full domain vocabulary

#### E. Event identity / idempotency / concurrency contract

**`action_events` append-only.** No UPDATE/DELETE for clients; immutability trigger on events table.

**Minimal event columns** (domain `ActionEvent` + lifecycle audit):

| Column | Rule |
|---|---|
| `id` | uuid PK |
| `organization_id`, `store_id`, `variant_id` | denormalized from action; must match action grain |
| `inventory_action_id` | FK to `inventory_actions` |
| `event_type` | `ActionEventType` |
| `edited_quantity` | null except legal `accepted_with_edit` |
| `note` | nullable |
| `actor_user_id` | merchant = `auth.uid()`; system = null |
| `from_status`, `to_status` | recorded for audit |
| `idempotency_key` | required for merchant RPCs; required for system RPCs that may retry |
| `event_body_hash` | sha256 of canonical event body (type, edited qty, note, from/to status) |
| `occurred_at`, `created_at` | timestamptz |

**Idempotency identity (unique):**

```
organization_id
inventory_action_id
event_type
idempotency_key
```

| Case | Behavior |
|---|---|
| Same identity + same `event_body_hash` | **Replay** — return existing event id; no second row; action status unchanged if already applied |
| Same identity + different body hash | **Conflict** — reject (`ACTION_EVENT_IDEMPOTENCY_BODY_CONFLICT`); no overwrite |
| Concurrent two legal transitions on `new` | One wins under row lock; loser sees illegal from-status → reject |
| Illegal transition | Reject; no event insert; no status mutation |

**Concurrency:** merchant/system transition RPC must `SELECT … FOR UPDATE` the `inventory_actions` row (or equivalent transactional lock), re-read status, validate eligibility + transition, insert event, update lifecycle columns — **one transaction**.

**Tenant isolation:** membership org must match action `organization_id`; event org/store/variant must match action; cross-org SELECT denied by RLS.

#### F. Schema migration requirements (M7.3b)

Local engineering only. One (or tightly sequenced) SQL migration(s):

1. **`action_events` table** — columns §E; append-only immutability trigger; RLS (member SELECT; no client DML); grants aligned with M7.2 pattern.
2. **`inventory_actions.superseded_by_action_id`** — nullable uuid FK to `inventory_actions(id)`; CHECK `≠ id`.
3. **Replace** `inventory_actions_status_new_only` with full status vocabulary CHECK.
4. **Replace** blanket update immutability with narrow lifecycle-column allowlist (§D). Keep DELETE forbidden.
5. **Preserve** M7.2 unique idempotency index, trust CHECKs (still hard-false on create), source-class reject behavior, and `persist_inventory_action_recommendation` commercial semantics.
6. **RPCs (SECURITY DEFINER, `search_path=''`):**
   - `transition_inventory_action_merchant(...)` — accept / accept_with_edit / dismiss / complete; `authenticated` EXECUTE; requires `auth.uid()` + decide role + eligibility
   - `expire_inventory_action_system(...)` — `service_role` only; `actor_user_id` null
   - `supersede_inventory_action_system(...)` — `service_role` only; sets `superseded_by_action_id`; `actor_user_id` null
7. **No** HTTP routes, workers, cron, or production writer changes.
8. **No** automatic `created` backfill for existing rows.
9. Optional nullable `expires_at` on `inventory_actions` only if set at create and left immutable; not required to ship expire-by-id RPC.

#### G. M7.3b / M7.3c / M7.3d sequence and acceptance tests

| Phase | Scope | Acceptance focus |
|---|---|---|
| **M7.3a** (this doc) | Contract freeze only | Docs consistency; `git diff --check`; no SQL |
| **M7.3b** | Local SQL schema + triggers + RLS + RPC stubs/bodies | Status CHECK expanded; narrow immutability; events append-only; merchant RPC rejects harness/ineligible; bad transitions rejected; recommendation columns immutable under lifecycle UPDATE attempt; role deny for analyst; cross-org deny; system expire/supersede on harness without merchant consent flags; M7.2 persist create/replay/reject still green |
| **M7.3c** | TS adapter(s) for lifecycle RPCs (local/test harness only) | No production HTTP; actor never taken from client; maps error tokens; does not enable buying |
| **M7.3d** | Adversarial + unit closure | Transition matrix parity with `history-policy.ts`; edit-qty rules for REORDER vs non-REORDER; idempotency replay/conflict; concurrent accept conflict; eligibility fail-closed; no PO/inventory side effects in SQL surface |

**Merchant success-path E2E** against a truly production-eligible row remains **blocked** until a separate trusted source-of-create can insert eligible rows. M7.3b/d must still prove the **reject** and structural paths completely.

**Out of scope / banned through M7.3d:**

- production writer / M5–M6 modifications
- workers / cron / schedulers / HTTP / merchant UI activation
- hosted migration apply as production activation claim
- purchase / supplier / payment / inventory mutation
- backfilling `created` onto harness rows
- Git commit/push unless separately requested
- unrelated dirty-tree files

---

## 2. RPC behavioral contracts (design freeze)

### 2.1 Merchant transition RPC

Illustrative signature (exact names may match repo SQL style):

```
transition_inventory_action_merchant(
  p_inventory_action_id uuid,
  p_event_type text,              -- accepted | accepted_with_edit | dismissed | completed
  p_edited_quantity integer,      -- required only for accepted_with_edit
  p_note text,
  p_idempotency_key text
) returns jsonb
```

**Must:**

1. Require `auth.uid()`.
2. Lock action row; load grain + status + recommendation + trust/source columns.
3. Verify membership + decide role for `organization_id`.
4. Verify eligibility (§C).
5. Validate transition matrix + edit-qty rules (§A).
6. Idempotency replay/conflict (§E).
7. Insert `action_events` then update `status` only (and never `superseded_by` on merchant path).
8. Return disposition `applied` \| `replayed` plus event/action ids.

**Must not:** call purchasing, supplier, payment, or inventory mutation logic; trust client actor id; succeed for harness/dormant rows.

### 2.2 System expire / supersede RPCs

- EXECUTE: `service_role` only.
- Append `expired` or `superseded` event with `actor_user_id` null.
- Supersede requires `p_new_action_id ≠ p_inventory_action_id` and legal from-status.
- No scheduler in M7.3; callers are local tests or future approved jobs only.

### 2.3 Future production create (reserved; not M7.3 implement)

When a trusted production create path is separately approved, it may atomically insert `inventory_actions` + `created` ActionEvent. That path is **out of M7.3 scope** and must not backfill historical harness rows.

---

## 3. Non-effects invariant (approval ≠ execution)

Human lifecycle success means **only**:

- an append-only `ActionEvent` exists
- `inventory_actions.status` (and optionally `superseded_by_action_id`) reflects the decision

It does **not** mean:

- purchase order created
- supplier contacted
- payment authorized or captured
- on-hand / incoming inventory mutated
- forecast or metric recomputed
- algorithm approved
- production eligibility granted

Buying automation remains a later, separately gated milestone.

---

## 4. Relationship to M7.2 persistence

| Concern | M7.2 (frozen) | M7.3 (this freeze) |
|---|---|---|
| Create recommendation | `persist_inventory_action_recommendation` | unchanged |
| Status at create | `new` only | still created as `new` |
| Trust flags at create | hard-false CHECKs | unchanged |
| Harness source class | persistable, non-merchant | **unapprovable** via merchant RPC |
| UPDATE recommendation | forbidden | still forbidden |
| UPDATE status | forbidden (blanket) | allowed **only** via lifecycle RPC + narrow trigger |
| Events | none | append-only `action_events` |
| Supersede column | absent | added |

---

## 5. Documentation consistency checklist

This freeze is consistent with:

- `lib/commerce-domain/history-policy.ts` transition + edit preservation helpers
- `lib/commerce-domain/types.ts` statuses, event types, roles, `ActionEvent`
- `docs/DOMAIN_INVARIANTS.md` §§16–18
- `docs/HISTORY_AND_IMMUTABILITY.md` merchant events + supersede
- `docs/RLS_ARCHITECTURE.md` §5 / §8 (trusted lifecycle writes; analyst read / operator decide)
- `docs/ROLE_AND_PERMISSION_MODEL.md` (`actions.decide` matrix)
- `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md` (dormant create; lifecycle deferred here)

M7.3a does **not** rewrite those documents beyond this freeze file. Later implementation milestones may add cross-links when SQL lands.

---

## 6. GO / NO-GO recommendation

| Item | Recommendation |
|---|---|
| Freeze this contract (M7.3a) | **GO** |
| Implement **M7.3b local SQL** (schema + narrow immutability + events + lifecycle RPCs + reject/structure adversarial tests) | **GO** |
| Claim merchant approval works on current harness rows | **NO-GO** |
| Production writer / eligible-row create | **NO-GO** (blocked on trusted M5/M6 source-of-create) |
| Workers / cron / HTTP / UI / hosted activation | **NO-GO** |
| Purchase / supplier / payment / inventory mutation from lifecycle | **NO-GO** |
| Fix anomalous persist raw `23505` inside M7.3 | **NO-GO** — separate hardening (§8) |

**Next authorized engineering step after this freeze:** M7.3b local SQL + adversarial tests only. Stop before production eligibility, HTTP, workers, or buying.

---

## 7. Unresolved blockers (outside this freeze)

These are **documented**, not silently decided:

1. **Trusted production source-of-create** (M5 metric revalidation writer + M6/forecast policy as applicable) — required before any merchant approve success path.
2. **Exact production `evidence_source_class` allowlist** for eligibility — reserved; fail-closed until approved.
3. **Whether `completed` later gains a post-buy outcome signal** — M7.3 freezes completed as **manual merchant ack only**; future outcome linkage is a separate contract.
4. **Scheduler for expire** — RPC may exist; enabling a worker/cron needs a separate authorization.
5. **Anomalous raw `23505`** on decision persist replay miss — §8.

No blocker prevents M7.3b local schema/RPC engineering under fail-closed eligibility.

---

## 8. Separate pre-production hardening (not M7.3)

**Issue:** `persist_inventory_action_recommendation` on `unique_violation` re-selects by idempotency identity; if `NOT FOUND`, it re-raises the raw unique violation (`23505`) instead of a named domain token.

**Tracking:** separate pre-production persist hardening item.
**Not** part of human approval lifecycle scope.
**Do not** couple its fix to M7.3b acceptance.

---

## 9. References

- `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md` — dormant immutable create
- `docs/M7_0_CONTRACT_ADDENDUM.md` — fixture-only evaluation
- `docs/DECISION_ENGINE.md` — frozen engine; execution requires later approval
- `docs/HISTORY_AND_IMMUTABILITY.md`
- `docs/DOMAIN_INVARIANTS.md` §§16–19
- `docs/RLS_ARCHITECTURE.md` §8
- `docs/ROLE_AND_PERMISSION_MODEL.md`
- `docs/SERVICE_ROLE_BOUNDARY.md`
- `lib/commerce-domain/history-policy.ts`
- `lib/commerce-domain/types.ts` — `InventoryAction` / `ActionEvent` / roles
- `supabase/migrations/20261031100000_m7_2b_inventory_action_persistence.sql`
- `tests/sql/m7-inventory-action-persistence-adversarial.sql` (+ M7.2d live/unit suites)
