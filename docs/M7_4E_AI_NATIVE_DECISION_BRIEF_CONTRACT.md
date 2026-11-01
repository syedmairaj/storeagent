# M7.4e — AI-native Decision Brief Contract (Freeze)

**Status:** FROZEN for subsequent M7.4e implementation slices (docs only until separately approved)
**Baseline verified:** `main` @ `440fcbbe01b7e5ce8077753a465e40aee900bb34` — `feat(actions): enable tenant-scoped demo navigation`
**Authority when docs conflict:** this freeze for merchant-facing Decision Brief content, schemas, AI vs deterministic ownership, validation, fail-closed behavior, and brief UX; M7.4a remains authority for Actions shell IA **except** where this freeze explicitly preserves the **accepted** M7.4 responsive split at `≥1280px` (see §2.3); M0.6 / `lib/decision-engine/*` remain authority for action type, priority, quantities, forecasts, thresholds, confidence, and reason codes; M0.9.10 remains authority for AI structured numeric-mutation evaluation (necessary, not sufficient for free prose — see §6); M7.2 / M7.3 remain dormant / fail-closed for persistence and merchant lifecycle.

This freeze does **not** authorize application code, fixtures mutation, model/API integration, environment secrets, production decision generation, production decision writers, M7.3 lifecycle RPC wiring from the UI, merchant approval persistence, M5/M6 data loaders, workers/cron/HTTP enablement, E.4 canary operations, purchase orders, supplier contact, payments, inventory mutation, hosted activation, migrations, or Git operations.

---

## 0. Verdict

| Gate | Result |
|---|---|
| Freeze this Decision Brief contract (M7.4e docs only) | **GO** |
| Implement typed brief schemas + validators + deterministic fallback (no LLM provider) | **GO** after this freeze, under explicit slice approval |
| Upgrade Actions inspector to Decision Brief UX on synthetic demo data | **GO** after schema/validator slice acceptance |
| Call a live LLM / hosted AI provider from Actions | **NO-GO** until a later approved AI adapter slice with fail-closed **structured + semantic** validation |
| Wire demo Try approve / acknowledge / dismiss / edit to M7.3 lifecycle RPCs or production actions | **NO-GO** (demo no-save preserved) |
| Treat demo interaction affordances as durable production approval eligibility | **FORBIDDEN** |
| Invent ROI, cash/revenue-at-risk, prevented stockouts, MOQ savings, or live inventory impact | **FORBIDDEN** |
| Let AI choose / alter action type, priority, quantity, thresholds, confidence, or reason codes | **FORBIDDEN** |
| Autonomous purchasing, supplier contact, or external execution | **FORBIDDEN** |
| Treat demo briefs as production-eligible merchant decisions | **FORBIDDEN** |

**Product intent:** Replace the inspector’s thin “reason + evidence grid” with a premium, evidence-first **Decision Brief** — recommendation, why now, grounded evidence, confidence, uncertainty, suggested next step, and human controls — while preserving StoreAgent’s core invariant: **deterministic engines own commercial truth; AI may only explain, summarize, and prioritize presentation of already-determined facts.**

---

## 1. Current architecture findings (audit)

### 1.1 Canonical product / status posture

| Source | Finding |
|---|---|
| `docs/PROJECT_HANDOFF.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md` | Data → deterministic metrics/forecast/decision → AI explains/prioritizes/communicates → merchant approval. Buying is later and approval-gated. |
| `docs/DECISION_ENGINE.md`, `docs/M7_0_CONTRACT_ADDENDUM.md` | Engine exclusively owns action selection, quantities, thresholds, confidence; AI must not resolve contradictions or invent missing evidence. |
| `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md` | Persistence infrastructure dormant; harness/hard-false trust flags; no production writer. |
| `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md` | Merchant accept/edit/dismiss/complete RPCs exist locally but are fail-closed for harness/demo rows; approval ≠ PO/buy. |
| `docs/M7_4A_DECISION_FIRST_UX_CONTRACT.md` | Demo Actions workspace frozen; synthetic fixtures; banner; queue + inspector/sheet; disabled production approvals; no invented money/MOQ/stockout tiles. |
| `docs/BACKGROUND_JOBS.md` § AI boundary | AI explanation only after deterministic decision completion; must not convert WATCH into a commercial intervention. |
| `docs/TESTING_EVALUATION.md` M0.9.10 | Structured AI claims must be validated against deterministic truth; prose is not the oracle; `workers/explain-actions.ts` remains unimplemented. |
| `docs/DESIGN_SYSTEM.md` | Decision-first UX; AI copy must not visually imply AI invented inventory numbers; progressive disclosure; ≥9/10 quality gate. |
| `docs/CROSS_ORG_THREAT_MODEL.md` Threat 15 | AI output is never an authorization source. |
| `docs/ROLE_AND_PERMISSION_MODEL.md` | `actions.decide` = owner/admin/operator; analyst read-only. |
| `docs/DOMAIN_MODEL.md` | Mentions future “weekly brief” as a communication concept — **not** a Decision Brief schema today. |

### 1.2 Deterministic decision / evidence surfaces (reuse)

| Artifact | Path | Reusable for Decision Brief? |
|---|---|---|
| `InventoryDecisionInput` / `InventoryDecisionResult` | `lib/decision-engine/types.ts` | **Yes** — engine truth envelope (actionType, priority, recommendedQuantity, confidence, reasonCodes). |
| `InventoryDecisionReasonCode` | `lib/decision-engine/types.ts` | **Yes** — canonical machine reason vocabulary for production path. |
| `buildInventoryActionEvidence` | `lib/decision-engine/evidence-snapshot.ts` | **Yes** — maps input → `InventoryActionEvidence` without recalculation. |
| `InventoryActionEvidence` / `InventoryAction` | `lib/commerce-domain/types.ts` | **Partial** — evidence fields are the merchant evidence vocabulary; domain also has `estimatedCashAtRiskAmount` / `estimatedRevenueAtRiskAmount` which **must not** appear in M7.4e briefs unless separately approved deterministic owners exist (today: none for demo/UI). |
| Confidence / priority modules | `lib/decision-engine/confidence.ts`, `priority.ts` | **Yes** — deterministic only; AI may not raise confidence. |
| Fixture evaluation envelope | `lib/decision-engine/fixture-evaluation.ts` + M7.0 addendum | **Local-dev only** — hard-false trust flags; not a merchant brief source. |

**Missing from current evidence models (do not assume they exist):**

- Decision Brief typed I/O schema
- Claim-to-evidence trace IDs for AI sentences
- Source observation timestamps / freshness SLA fields on `InventoryActionEvidence`
- `decision_as_of` / pinned timezone on demo fixtures (exist on M7.2 persistence rows, **not** on `DemoActionItem`)
- Structured uncertainty section distinct from confidence
- Suggested next-step enum owned separately from action type
- Production AI request/response persistence

### 1.3 Synthetic demo / Actions UI (M7.4a–d/f)

| Artifact | Path | Finding |
|---|---|---|
| Demo fixtures | `lib/demo/m7-decision-demo-fixtures.ts` | Static `DemoActionItem`: `actionType`, `priority`, `confidence`, `confidenceReasonCodes`, `conciseReason`, optional REORDER qty/date, `DemoActionEvidence`, attestation `m7-synthetic-demonstration-v1`. Fail-closed loader. |
| Demo format helpers | `lib/demo/m7-decision-demo-format.ts` | Null → `"Unknown"`; **hand-authored** reason-code explanations (not AI). |
| Demo controls | `lib/demo/m7-decision-demo-controls.ts` | Role gate; `"Demonstration only — no action was saved."`; WATCH-specific acknowledge labels; local REORDER edit validation. |
| Actions page | `app/(app)/app/[organizationId]/actions/page.tsx` | Tenant membership for chrome only; fixture data **not** org-scoped inventory. |
| Workspace / inspector | `components/actions-demo/actions-demo-workspace.tsx` | Queue + persistent inspector / mobile sheet; Recommendation header ≈ type/priority/confidence + `conciseReason` + key evidence + `<details>` technical disclosure + `DemoApprovalCluster`. |
| Approval cluster | `components/actions-demo/demo-approval-cluster.tsx` | Demo-only; no RPC. |
| Nav activation | AppShell + `tests/unit/m7-4f-actions-nav-activation.test.ts` | Actions nav enabled post M7.4d/f acceptance. |

**Inspector vs Brief gap:** today’s inspector is evidence-capable but not a Decision Brief. It lacks explicit sections for why-now, uncertainty, suggested next step, provenance/freshness, claim traces, AI vs fallback mode, and demo-vs-production brief mode badges beyond the page banner.

### 1.4 AI evaluation boundary already frozen (M0.9.10)

| Artifact | Path | Finding |
|---|---|---|
| Claims + assessment | `tests/evaluation/ai-numeric-mutation.ts` | `AiDeterministicTruth`, `AiExplanationClaims`, violation codes (`ACTION_TYPE_MUTATION`, `QUANTITY_MUTATION`, `UNSUPPORTED_CONFIDENCE_PERCENT`, etc.). |
| Fixtures / goldens | `tests/fixtures/ai/*`, `tests/golden/ai/*` | Evaluation-only; no production provider. |
| Worker stub | `workers/explain-actions.ts` | Remains unimplemented; architecture tests assert this. |

M7.4e **must extend** (not replace) this boundary: structured numeric/categorical claim checks (M0.9.10) are **necessary** before any AI-assisted delivery, but **not sufficient** to validate arbitrary free-prose. E1 merchant copy uses only trusted deterministic templates/reason mappings. E3 may show AI prose only after a **separately approved** semantic/claim-validation profile accepts the candidate (see §6).

### 1.5 Conflicts / inconsistencies to preserve consciously

| Conflict | Contract stance |
|---|---|
| Demo reason codes (`below_reorder_point`) ≠ engine codes (`BELOW_REORDER_POINT`) | Demo briefs may use **demo presentation codes** under `briefMode = synthetic_demo`. Production / engine-bound briefs must use `InventoryDecisionReasonCode` (or a documented mapped subset). Do not silently equate them. |
| Domain `InventoryAction` financial fields vs M7.4a ban | Brief **forbids** rendering cash/revenue-at-risk / ROI / prevented stockouts unless a future deterministic owner + eligibility gate exists. Absence ≠ invent. |
| `DemoActionItem.conciseReason` is static prose | Treat as **deterministic fallback copy** owned by fixtures for demo mode — not AI output and not engine math. |
| No freshness timestamps on demo evidence | Brief schema requires freshness fields as `unknown` or explicit synthetic stamps; UI must show Unknown / Synthetic, never imply live freshness. |
| Org route vs non-org fixture data | Briefs in demo mode must keep attestation + banner; never claim the brief reflects that organization’s live inventory. |

---

## 2. Merchant-facing Decision Brief — content specification

### 2.1 Definition

A **Decision Brief** is the primary merchant-readable artifact for one grain-level inventory intervention candidate (`REORDER` \| `REDUCE` \| `PROMOTE` \| `WATCH`). It is **not** a chat transcript, not a dashboard widget cluster, and not an autonomous agent run log.

HEALTHY remains a non-action skim state (M7.4a) and **does not** receive an approvable Decision Brief.

### 2.2 Required merchant sections (progressive disclosure)

| Section | Always visible (above fold intent) | Content rules |
|---|---|---|
| **1. Recommendation** | Yes | Action type chip + human label; product/variant; priority; recommended quantity **only** when REORDER + `known` positive qty; REORDER `unknown` → show **Unknown** (never invent); non-REORDER → no qty; recommended action date if known. |
| **2. Why now** | Yes | 1–3 short sentences. Must be grounded in allowed evidence/reason codes. No invented urgency metrics. |
| **3. Evidence** | Yes (compact key facts) | 3–6 key facts selected for the action type; null → **Unknown**. Progressive disclosure for full snapshot / raw codes. |
| **4. Confidence** | Yes | Deterministic categorical `high` \| `medium` \| `low` + optional confidence reason codes. No AI percentages. |
| **5. Uncertainty** | Yes when any uncertainty signal exists; else compact “None material” | Explicit unknowns, conflicts, staleness, low data quality. WATCH must emphasize uncertainty, not purchase language. |
| **6. Suggested next step** | Yes | Human-operable suggestion consistent with action type (e.g. “Review reorder quantity”, “Reduce incoming exposure”, “Plan promotion”, “Investigate conflicting signals”). Never “PO placed” / “Supplier contacted”. |
| **7. Human decision controls** | Yes (role-aware) | **Demo interaction** only in M7.4e: preserve existing Try demo approve / acknowledge (WATCH) / dismiss / edit-quantity chrome and **no-save** semantics (`DemoApprovalCluster` / M7.4c). Decide roles may interact; **analyst remains view-only**. Demo interaction **≠** durable production approval eligibility (always false here; M7.3 wiring remains **NO-GO**). |

### 2.3 UX / visual contract (desktop + mobile)

**Composition target:** premium decision workspace ≥9/10 per `docs/DESIGN_SYSTEM.md`. One selected decision → one brief composition. Avoid long scrolling walls, generic AI chat panels, rainbow AI chrome, and excessive nested cards.

| Surface | Layout |
|---|---|
| Desktop split (`≥1280px` / `xl`) | **Accepted M7.4 Actions layout** (not the earlier M7.4a `≥1024` split wording): queue ≈40% / brief inspector ≈60%. Brief replaces current inspector body. Sticky header: recommendation + controls; scroll only secondary evidence. |
| Tablet / mid widths (`768–1279px`, including `1024px`) | **Unchanged** accepted behavior: queue dominant with **inline stacked** brief under the selected row. Do **not** enable the desktop split at 1024px. |
| Mobile (`<768px`, down to 320px) | **Unchanged** accepted behavior: full-width queue; selecting a row opens accessible detail **sheet** containing the brief. Focus trap, Esc, restore focus. Touch targets ≥44px. |

**Progressive disclosure:**

1. Recommendation + why now + key evidence + confidence/uncertainty strip + next step + controls
2. `<details>` / “Evidence details”: remaining evidence fields, raw reason codes, confidence notes, provenance
3. Optional “How this brief was built”: briefMode, generator (`deterministic_fallback` \| `ai_validated`), model/version when AI used, validation status — never the primary merchant story

**Provenance chrome (required):**

- Demo / synthetic: persistent page banner **and** brief-level badge `Synthetic demonstration`
- Production (future): `As of {decisionAsOf}` + freshness label (`fresh` \| `aging` \| `stale` \| `unknown`)
- Generator chip: `StoreAgent explanation` (fallback) vs `AI-assisted explanation` only when validated AI output is shown — never “AI decided”

**Accessibility:** color not sole encoding; focus-visible; announce validation/fallback status via `role="status"` when generator changes; honor `prefers-reduced-motion`.

**Forbidden UI:** chat composer as primary brief surface; streaming token theater that delays the recommendation; KPI strips inventing savings; overlay badges claiming “algorithm approved” on demo/dormant data.

### 2.4 Action-type presentation nuances

| Action | Brief emphasis | Forbidden implications |
|---|---|---|
| **REORDER** | Qty + timing + replenishment evidence | Auto-buy, supplier email sent, payment |
| **REDUCE** | Excess exposure; stop/reduce additional supply | Discount/price change execution |
| **PROMOTE** | Clear / demand-generation need | Ad platform publish / price writeback |
| **WATCH** | Uncertainty / conflict / insufficient evidence; acknowledge language | Any purchase recommendation, “order anyway”, converting WATCH → REORDER in copy |

---

## 3. Typed schemas and provenance rules

### 3.1 Versioning

| Constant | Value |
|---|---|
| Brief schema version | `decision-brief-v1` |
| Demo attestation (reuse) | `m7-synthetic-demonstration-v1` |
| Engine algorithm (reuse) | `inventory-decision-v1` (+ existing sub-algorithm versions) |
| AI claim validation profile | `ai-numeric-mutation-v1` (extend with brief-specific rejection codes below) |

Breaking schema changes require a new version id. Historical briefs (when persisted later) retain the version that produced them.

### 3.2 Brief mode

```ts
type DecisionBriefMode =
  | "synthetic_demo"   // M7.4 Actions fixtures only
  | "engine_bound";    // future: grounded in InventoryDecisionResult + evidence snapshot
```

`synthetic_demo` briefs are **never** production-eligible and must carry demo attestation.
`engine_bound` briefs remain **unapprovable for merchant lifecycle** until M7.2/M7.3 production eligibility is separately true.

### 3.3 Field presence states

Every optional commercial field uses an explicit presence model:

```ts
type Known<T> = { state: "known"; value: T };
type Unknown = { state: "unknown"; reasonCode?: string };
type NotApplicable = { state: "not_applicable"; reasonCode?: string };
type Field<T> = Known<T> | Unknown | NotApplicable;
```

Rules:

- Known zero is **known** (`value: 0`), never coerced from null.
- Missing engine/fixture null → `unknown` (UI: “Unknown”).
- Quantity on non-REORDER → `not_applicable`.
- AI must not invent a `known` value.

### 3.4 Input schema — `DecisionBriefGroundingInput` (deterministic truth in)

Required grounding for any brief generation (AI or fallback):

```ts
interface DecisionBriefGroundingInput {
  schemaVersion: "decision-brief-v1";
  briefMode: DecisionBriefMode;

  // Grain (demo may use synthetic ids/labels)
  organizationId: string | null; // null only for pure offline fixture tooling; UI route still tenant-gated
  storeId: string | null;
  locationId: string | null;
  variantId: string | null;
  productTitle: string;
  variantTitle: string;

  // Deterministic decision ownership
  actionType: "REORDER" | "REDUCE" | "PROMOTE" | "WATCH";
  priority: "critical" | "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  recommendedQuantity: Field<number>; // REORDER: known positive int OR unknown (never invent); non-REORDER: not_applicable
  recommendedActionDate: Field<string>; // ISO date when known

  reasonCodes: readonly string[]; // non-empty; WATCH must be non-empty
  confidenceReasonCodes: readonly string[];

  evidence: {
    availableQuantity: Field<number>;
    incomingQuantity: Field<number>;
    demandVelocity: Field<number>;
    daysOfStock: Field<number>;
    leadTimeDays: Field<number>;
    safetyStockUnits: Field<number>;
    reorderPointUnits: Field<number>;
    targetStockUnits: Field<number>;
    inventoryAgeDays: Field<number>;
    forecastExpectedDemandUnits: Field<number>;
    dataQualityScore: Field<number>; // 0..1 when known
  };

  // Provenance / freshness
  decisionAsOf: Field<string>; // store-local date when known
  pinnedTimeZone: Field<string>;
  evidenceSourceTimestamps: {
    inventoryObservationAt: Field<string>; // ISO datetime
    metricsComputedAt: Field<string>;
    forecastAsOf: Field<string>;
  };
  freshness: {
    status: "fresh" | "aging" | "stale" | "unknown";
    staleReasonCodes: readonly string[];
  };

  // Trust / demo gates
  demoAttestation?: "m7-synthetic-demonstration-v1"; // required iff briefMode=synthetic_demo
  trustClaims: {
    claimsMerchantFacing: boolean;
    claimsM7ProductionEligibility: boolean;
    algorithmApproved: boolean;
    isScoredMerchantDecision: boolean;
    claimsProductionForecastApproval: boolean;
    evidenceScope:
      | "controlled_fixture_only"
      | "synthetic_demonstration"
      | "production_bound" // reserved; not authorizable in M7.4e
      | "unknown";
  };

  // Optional pre-authored fallback copy (demo conciseReason, templates)
  deterministicFallbackCopy?: {
    whyNow: string;
    suggestedNextStep: string;
  };
}
```

**Demo mapping (M7.4 fixtures today):** map null numbers → `unknown`; REORDER qty → `known` only when `demoActionShowsRecommendedQuantity` (positive finite); otherwise REORDER qty → `unknown` (display Unknown; **not editable**; never invent); non-REORDER qty → `not_applicable`; set `briefMode=synthetic_demo`, `demoAttestation`, all production trust claims **false**, `evidenceScope=synthetic_demonstration`, freshness `unknown` unless fixture later adds explicit synthetic stamps; `decisionAsOf` / source timestamps → `unknown` until fixtures intentionally supply them.

**Engine mapping (future):** map from `InventoryDecisionResult` + `InventoryActionEvidence` + persistence provenance columns; reason codes must be `InventoryDecisionReasonCode` values.

### 3.5 Output schema — `DecisionBriefV1`

```ts
type BriefGenerator =
  | "deterministic_fallback"
  | "ai_validated";

type BriefValidationStatus =
  | "accepted"
  | "accepted_with_omissions"
  | "rejected_used_fallback";

interface DecisionBriefClaim {
  claimId: string; // stable within brief
  kind:
    | "action_type"
    | "quantity"
    | "priority"
    | "confidence"
    | "evidence_fact"
    | "reason_code"
    | "why_now_statement"
    | "uncertainty_statement"
    | "next_step_statement";
  text: string; // merchant-facing fragment
  // Numeric / categorical payload when the claim asserts one
  structured?: {
    actionType?: "REORDER" | "REDUCE" | "PROMOTE" | "WATCH";
    recommendedQuantity?: number | null;
    priority?: "critical" | "high" | "medium" | "low";
    confidence?: "high" | "medium" | "low";
    confidencePercent?: number; // if present → always reject (V1)
    evidenceField?: keyof DecisionBriefGroundingInput["evidence"];
    evidenceValue?: number | null;
    reasonCodes?: readonly string[];
  };
  evidenceRefs: readonly string[]; // reason codes and/or evidence field keys
}

interface DecisionBriefV1 {
  schemaVersion: "decision-brief-v1";
  briefId: string; // demo: fixture action id; future: action id or ephemeral id
  briefMode: DecisionBriefMode;
  generator: BriefGenerator;
  validationStatus: BriefValidationStatus;
  generatedAt: string; // ISO datetime of brief assembly (not inventory as-of)

  recommendation: {
    actionType: "REORDER" | "REDUCE" | "PROMOTE" | "WATCH";
    label: string;
    productTitle: string;
    variantTitle: string;
    priority: "critical" | "high" | "medium" | "low";
    recommendedQuantity: Field<number>;
    recommendedActionDate: Field<string>;
  };

  whyNow: {
    summary: string; // 1–3 sentences
    claims: readonly DecisionBriefClaim[];
  };

  evidence: {
    keyFacts: readonly {
      field: string;
      label: string;
      display: string; // includes "Unknown"
      fieldState: "known" | "unknown" | "not_applicable";
    }[];
    fullEvidenceAvailable: boolean;
  };

  confidence: {
    level: "high" | "medium" | "low";
    reasonCodes: readonly string[];
    displayNotes: readonly string[];
  };

  uncertainty: {
    hasMaterialUncertainty: boolean;
    summary: string;
    codes: readonly string[];
    claims: readonly DecisionBriefClaim[];
  };

  suggestedNextStep: {
    code:
      | "review_reorder"
      | "edit_reorder_quantity"
      | "reduce_incoming_exposure"
      | "plan_promotion"
      | "investigate_watch"
      | "dismiss_watch"
      | "no_execution";
    summary: string;
    claims: readonly DecisionBriefClaim[];
  };

  humanControls: {
    /**
     * Demo interaction permissions (M7.4c chrome) — local Try demo
     * approve / acknowledge / dismiss / edit only. Never imply durable
     * production approval eligibility.
     */
    demoPrimaryInteractionAllowed: boolean; // decide roles; false for analyst
    demoDismissAllowed: boolean; // decide roles; false for analyst
    demoEditQuantityAllowed: boolean; // REORDER + decide role + known positive qty only
    analystViewOnly: boolean;
    demoNoSaveRequired: boolean; // true for synthetic_demo — always no-save

    /**
     * Durable production approval eligibility (M7.3 trust + lifecycle).
     * Separated from demo interaction. Must remain false for all M7.4e
     * synthetic_demo briefs and any engine_bound brief that fails M7.3
     * eligibility. Wiring RPCs remains NO-GO in M7.4e.
     */
    productionApprovalEligible: boolean;

    controlCopy: {
      primaryLabel: string;
      dismissLabel: string;
      helperText: string;
    };
  };

  provenance: {
    demoAttestation?: "m7-synthetic-demonstration-v1";
    decisionAsOf: Field<string>;
    freshnessStatus: "fresh" | "aging" | "stale" | "unknown";
    trustClaims: DecisionBriefGroundingInput["trustClaims"];
    algorithmVersion: string; // e.g. inventory-decision-v1 or "demo-fixture"
    ai?: {
      provider: string;
      model: string;
      promptVersion: string;
      latencyMs: number;
      inputTokenEstimate?: number;
      outputTokenEstimate?: number;
    };
  };

  rejection?: {
    reasons: readonly DecisionBriefRejectionCode[];
    detail: string;
  };
}
```

### 3.6 Provenance rules

1. Every numeric/categorical assertion in `claims[].structured` must equal grounding input (exact match) or be omitted.
2. `evidenceRefs` must point only to present reason codes or evidence field keys from grounding.
3. **E1 fallback prose** must be assembled only from trusted deterministic templates / reason-code explanation maps / optional `deterministicFallbackCopy` — not from unconstrained model text.
4. **AI prose (E3+):** `evidenceRefs` plus structured numeric/categorical checks are **necessary but not sufficient** to accept arbitrary free-prose. Merchant delivery of AI-authored why-now / uncertainty / next-step text requires a **separately approved** semantic/claim-validation profile (§6.1). Until that profile exists and accepts the candidate, use deterministic fallback.
5. `generatedAt` must not be displayed as inventory freshness.
6. Freshness `stale` or evidence contradictions → fail-closed presentation rules (§5).
7. `briefMode=synthetic_demo` without valid attestation → **do not render brief** (empty/error; reuse fixture fail-closed).

### 3.7 Required / optional summary

| Field group | Required |
|---|---|
| `actionType`, `priority`, `confidence`, non-empty `reasonCodes` | Required |
| `recommendedQuantity` | REORDER: `known` positive integer **or** `unknown` (never invent; unknown ⇒ not editable). Non-REORDER: `not_applicable`. Reject only **inconsistent** grounding that falsely claims a valid `known` quantity (see §5.1). |
| Why-now summary | Required (E1: trusted deterministic template / reason mapping / `deterministicFallbackCopy`) |
| Uncertainty summary | Required string; may be “No material uncertainty flagged.” when codes empty and confidence medium/high |
| Suggested next step | Required |
| AI provider metadata | Optional; required iff `generator=ai_validated` |
| Financial impact fields | **Out of schema for v1 briefs** |
| `humanControls.productionApprovalEligible` | Required boolean; **false** for all M7.4e synthetic demo briefs |

---

## 4. AI versus deterministic ownership matrix

| Concern | Owner | AI allowed? |
|---|---|---|
| Action type | Deterministic engine / demo fixture | No — may only restate |
| Priority | Deterministic | No |
| Recommended quantity / ROQ / MOQ / pack | Deterministic math / fixture | Restate exact only |
| Forecast demand / confidence | Forecast layer / fixture | Restate exact only; no new % |
| Thresholds (ROP, safety, target) | Metrics / fixture | Restate exact only |
| Decision confidence level | Deterministic confidence module / fixture | May not raise; may explain reasons |
| Reason codes | Deterministic / fixture | Subset paraphrase only; no fabricate |
| Evidence snapshot values | Upstream deterministic | Exact or omit |
| Conflict resolution | Deterministic → WATCH | Must not pick REORDER/REDUCE/PROMOTE |
| Why-now wording | AI **or** deterministic fallback | Yes, grounded |
| Evidence fact ordering / emphasis | AI **or** UX rules | Yes, among grounded facts |
| Uncertainty wording | AI **or** fallback | Yes, grounded |
| Suggested next-step wording | AI **or** fallback | Yes; code must match action type policy |
| Merchant authorization / org selection | Auth + membership + RLS | **Never** AI |
| Approve / dismiss / edit persistence | M7.3 lifecycle (future) / demo no-save | **Never** AI |
| Buying / supplier / payment | Explicit future execution milestone | **Never** AI |

Pipeline order (frozen):

```
canonical observations → metrics → forecast → decision engine
  → DecisionBriefGroundingInput
  → (optional AI candidate) → validate claims
  → DecisionBriefV1
  → UI
  → human decision controls
```

AI before decision completion is **blocked**.

---

## 5. Failure, uncertainty, and deterministic fallback

### 5.1 Fail-closed triggers

| Condition | Behavior |
|---|---|
| Missing demo attestation (`synthetic_demo`) | No brief rows; error state |
| Empty reason codes on WATCH | Reject grounding; no brief |
| Stale freshness (`stale`) for engine_bound | Prefer WATCH framing; if actionType is commercial and stale per policy, **downgrade presentation** to uncertainty-first and keep `productionApprovalEligible=false` (still NO-GO to wire RPCs in M7.4e). Demo Try interactions may remain available under no-save rules when `briefMode=synthetic_demo`. |
| Contradictory structured claims vs grounding | Reject AI candidate → fallback |
| Low confidence + AI attempts to imply high certainty language in structured confidence | Reject |
| REORDER quantity `unknown` | **Allowed.** Display Unknown; **do not invent**; `demoEditQuantityAllowed=false`. Not a grounding rejection. |
| Inconsistent quantity grounding (falsely claims a valid `known` quantity) | **Reject grounding** with `QUANTITY_GROUNDING_INCONSISTENT` — e.g. REORDER `known` with non-positive / non-finite / non-integer value; non-REORDER with any `known` or `unknown` quantity instead of `not_applicable`; structured claims that invent a quantity when grounding is `unknown` / `not_applicable`. |
| AI timeout / provider error / unsupported model output shape | Fallback |
| Prompt-injection / tool-call / org-id suggestion in model output | Strip; never authorize; fallback if claims incomplete |
| AI returns `confidencePercent` | Violation → fallback |
| AI invents ROI / savings / stockout $ | Unsupported claim kind → reject → fallback |
| AI free-prose without approved semantic validation (E3+) | Do not deliver as `ai_validated`; fallback even if structured numeric claims pass |
| WATCH brief with purchase-suggesting next_step code | Reject → force `investigate_watch` / `dismiss_watch` |

### 5.2 WATCH-specific rules

- Primary CTA language: acknowledge / investigate — **not** approve-to-buy.
- Why-now must state uncertainty or conflict.
- Must not display a recommended purchase quantity.
- Must not say “reorder recommended” / “buy now”.
- Uncertainty section is mandatory and visually primary relative to any commercial tone.

### 5.3 Deterministic fallback generator

When AI is unavailable, times out, fails validation, is not enabled, or AI prose lacks an approved semantic validation acceptance:

1. Set `generator = deterministic_fallback`.
2. Set `validationStatus = rejected_used_fallback` if an AI candidate was attempted; else `accepted`.
3. Build why-now **only** from trusted deterministic sources: `deterministicFallbackCopy.whyNow` and/or templates composed from reason-code explanation maps (demo: `explainDemoReasonCode` / fixture `conciseReason` per U8; engine: stable reason-code catalog — reuse, do not reimplement math). **No unconstrained model prose on the E1 path.**
4. Key evidence ordering by action-type rules (already partially in `getKeyEvidenceFields`).
5. Suggested next step from fixed map by `actionType`.
6. Never call a provider on the fallback path.

Fallback quality bar: merchant-complete brief; may be less polished than validated AI; must still meet honesty and WATCH rules.

### 5.4 Structured rejection codes

```ts
type DecisionBriefRejectionCode =
  | "MISSING_ATTESTATION"
  | "INVALID_BRIEF_MODE"
  | "GROUNDING_INCOMPLETE"
  | "WATCH_REASON_CODES_EMPTY"
  | "QUANTITY_GROUNDING_INCONSISTENT"
  | "AI_PROSE_SEMANTIC_VALIDATION_REQUIRED"
  | "AI_PROSE_SEMANTIC_VALIDATION_REJECTED"
  | "STALE_EVIDENCE"
  | "CONTRADICTORY_EVIDENCE"
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_UNSUPPORTED_SHAPE"
  | "AI_NUMERIC_MUTATION"
  | "AI_UNSUPPORTED_CONFIDENCE_PERCENT"
  | "AI_FABRICATED_REASON_CODE"
  | "AI_UNSUPPORTED_FINANCIAL_CLAIM"
  | "AI_WATCH_PURCHASE_IMPLICATION"
  | "AI_PROMPT_INJECTION_SUSPECT"
  | "CLAIM_EVIDENCE_UNTRACED"
  | "TRUST_CLAIMS_INVALID";
```

Align numeric mutations with existing `AiNumericMutationViolationCode` where applicable; brief rejection codes wrap them for delivery orchestration.

---

## 6. Validation, claim-to-evidence traceability

### 6.1 Validation pipeline

**E1 (deterministic fallback — authorized next engineering slice after freeze approval):**

```
GroundingInput
  → validateGrounding() fail-closed
       including quantity consistency (§5.1):
       unknown REORDER qty allowed; inconsistent known qty rejected
  → buildDeterministicFallbackBrief() from trusted templates / reason maps only
  → accept
```

**E3+ (AI-assisted — only after separate slice + semantic-validation approval):**

```
GroundingInput
  → validateGrounding() fail-closed
  → AI candidate (claims + prose)
  → assessNumericMutations(truth, claims)     // M0.9.10 — necessary
  → assessBriefPolicy(actionType, nextStep, watch rules, financial bans)
  → assessTraceability(claims.evidenceRefs ⊆ grounding)  // necessary; not sufficient for prose
  → assessSemanticClaims(prose, claims, grounding)       // REQUIRED; separately approved profile
  → accept | accept_with_omissions | reject_used_fallback
```

`evidenceRefs` membership and structured numeric equality **do not** by themselves authorize arbitrary AI prose. Missing or failed semantic validation → `AI_PROSE_SEMANTIC_VALIDATION_REQUIRED` / `AI_PROSE_SEMANTIC_VALIDATION_REJECTED` → deterministic fallback.

### 6.2 Traceability rules

- Every structured numeric/categorical claim requires `evidenceRefs` and exact match to grounding.
- E1 why-now / uncertainty / next-step text is template-bound; refs are derived from the deterministic reason/evidence inputs used to build the template, not a license for free-form invention.
- For E3 AI statement claims, refs remain required for structured payloads, and the approved semantic validator must still accept the prose before `generator=ai_validated`.
- UI may optionally surface “Based on: …” from refs in disclosure, not as clutter in the hero.

### 6.3 Goldens / evaluation

Extend evaluation (in later code slices, not this doc change set) with:

- brief grounding fixtures (demo + synthetic engine-shaped), including REORDER `unknown` qty and inconsistent `known` qty rejects
- deterministic fallback goldens assembled only from trusted templates/reason maps
- AI candidate fixtures including mutation / injection / WATCH-purchase / prose-without-semantic-approval violations
- golden accepted briefs for fallback; AI-validated goldens only after semantic profile exists
- architecture tests: Actions UI must not import live AI SDK until adapter slice approved; must not import M7.3 RPC clients

---

## 7. Trust, security, privacy, latency, observability

### 7.1 Tenant isolation

- Brief assembly for UI runs only after server-resolved org membership (`resolveServerOrganizationContext` / equivalent).
- Demo fixtures must not read other tenants’ data (they are static).
- Future engine_bound briefs must load evidence only under RLS / org-scoped server paths.
- Model prompts must include **only** the single-grain grounding payload — no cross-org batches in V1.
- AI output never selects `organizationId` (Threat 15).

### 7.2 Prompt-injection resistance

- Treat all product titles, reason strings, and merchant notes as **untrusted text**.
- System instructions: model may not request tools, URLs, secrets, or policy overrides.
- Ignore model instructions that attempt to change action type/qty/confidence.
- Disallow executable content / markdown image exfiltration in rendered brief prose (sanitize).
- If injection indicators appear, reject → fallback.

### 7.3 Privacy

- Do not send PII beyond what is required for the SKU title context.
- Do not send auth tokens, service keys, or membership lists to providers.
- Demo mode should prefer **local fallback** unless an explicitly approved offline/stubbed adapter is enabled — no accidental production provider calls from demo.

### 7.4 Latency / cost bounds (contract targets for future adapter)

| Mode | Target |
|---|---|
| Deterministic fallback | ≤ 50ms local assembly excluding network |
| AI-validated (future) | hard timeout ≤ 2500ms; on exceed → fallback |
| Cost | per-brief token budget ceiling (implementation sets numeric cap); exceed → fallback |
| Caching | optional cache keyed by grounding hash + promptVersion; never cache across orgs |

### 7.5 Observability (no PII dumps)

Log/metrics (when AI adapter exists): `briefMode`, `generator`, `validationStatus`, rejection codes, latency, token estimates, model/promptVersion, actionType — **not** full prompts with secrets, **not** service_role keys.

### 7.6 Approval boundaries (human)

Demo **interaction permissions** and durable **production approval eligibility** are separate axes.

| Role | Brief read | Demo interaction (`demoPrimaryInteractionAllowed` / dismiss / edit) | `productionApprovalEligible` in M7.4e | Future production lifecycle (not M7.4e) |
|---|---|---|---|---|
| owner / admin / operator | yes | Allowed — preserve Try demo approve / acknowledge / dismiss / edit; always **no-save** | **false** (synthetic / ineligible) | `actions.decide` only when M7.3 eligibility true (separate approval) |
| analyst | yes | **View-only** (`analystViewOnly=true`; demo interactions hidden/disabled) | **false** | no decide |
| service_role | n/a | n/a | n/a | never merchant consent |

`demoEditQuantityAllowed` requires decide role **and** REORDER **and** `recommendedQuantity.state === "known"` with positive integer. Unknown REORDER quantity is never editable.

No autonomous purchasing, supplier contact, inventory mutation, or payment from brief controls.

### 7.7 Demo vs production brief distinction

| | Synthetic demo brief | Future production brief |
|---|---|---|
| Attestation | required `m7-synthetic-demonstration-v1` | absent; production source class instead |
| Trust flags | all merchant/production claims false | only when M7.2/M7.3 eligibility true |
| Demo interaction | Try demo approve/acknowledge/dismiss/edit allowed for decide roles; analyst view-only; always no-save | Not applicable until production eligibility |
| Durable production approval eligibility | always false | only when M7.2/M7.3 eligibility true |
| Persistence of approvals | forbidden / no-save | M7.3 RPCs under separate approval |
| Banner | required | not “synthetic”; show real as-of/freshness |
| Data path | `lib/demo/*` fixtures | org-scoped decision rows — **not authorized in M7.4e** |

---

## 8. Proposed implementation slices

### Slice E0 — this contract freeze (docs only)

**In:** this document
**Out:** all code
**Acceptance:** merged/present on branch; consistent with M7.4a / M0.6 / M0.9.10 / M7.3a
**GO/NO-GO:** **GO** to plan E1 after stakeholder acknowledgment

### Slice E1 — schemas + grounding mapper + validator + fallback builder (no UI chrome redesign, no LLM)

**In:**

- Shared types for `DecisionBriefGroundingInput` / `DecisionBriefV1` (including separated `demo*` interaction vs `productionApprovalEligible` controls)
- Mapper from `DemoActionItem` → grounding (unknown freshness; REORDER unknown qty allowed)
- `validateGrounding` with quantity-consistency rules (§5.1)
- `buildDeterministicFallbackBrief` using **only** trusted deterministic templates / reason mappings / `deterministicFallbackCopy`
- Unit tests for WATCH rules, qty consistency (unknown allowed; false `known` rejected), attestation fail-closed, demo vs production control flags

**Out:** provider SDKs, env keys, inspector visual redesign, RPC wiring, AI prose delivery, semantic-validation profile implementation
**Dependencies:** M7.4 demo fixtures stable; existing demo reason-code explanation maps
**Acceptance:**

1. Demo REORDER/REDUCE/PROMOTE/WATCH produce accepted fallback briefs from trusted templates only
2. Missing attestation → no brief
3. WATCH cannot emit purchase next-step codes
4. REORDER `unknown` qty → accepted brief, Unknown display, edit disallowed; inconsistent false `known` qty → `QUANTITY_GROUNDING_INCONSISTENT`
5. `productionApprovalEligible=false` while decide-role demo interaction flags remain true under no-save
6. Architecture: no OpenAI/Anthropic/Gemini client dependency introduced

**GO/NO-GO to E2:** **GO** iff E1 tests pass

### Slice E2 — Decision Brief UX in Actions inspector/sheet (demo fallback briefs only)

**In:**

- Replace inspector recommendation body with Brief sections (§2)
- Provenance badge; progressive disclosure; keep `DemoApprovalCluster` (Try demo + no-save; analyst view-only)
- Preserve accepted responsive layout: split at `≥1280px`; tablet/1024 inline stack; mobile sheet (§2.3)
- Motion / a11y parity with M7.4d; visual gate ≥9/10
- Architecture import bans preserved (no lifecycle RPC, no M5/M6 loaders)

**Out:** live AI; production data binding; changing split breakpoint back to 1024px
**Acceptance:**

1. Manual mobile REORDER/WATCH still meet prior acceptance
2. Brief shows Unknown for null / unknown quantity evidence; WATCH uncertainty primary
3. Demo no-save messaging unchanged; demo interactions ≠ production eligibility
4. No invented financial tiles
5. Viewport smoke: 320 / 768 / 1024 (no split) / 1280 (split) / 1600
6. Automated UI/architecture tests updated

**GO/NO-GO to E3:** **GO** iff visual + a11y + architecture acceptance pass

### Slice E3 — Optional AI adapter behind explicit flag (still demo-only grounding)

**In:**

- Stub or approved provider adapter producing `AiExplanationCandidate`-compatible claims + prose
- Timeout/cost guards; injection sanitization
- **Separately approved semantic/claim-validation profile** required before any `generator=ai_validated` delivery; structured numeric + `evidenceRefs` checks alone are insufficient
- Observability fields on brief provenance
- Feature flag default **off**; demo prefers fallback unless flag+allowlist **and** semantic validator accepts

**Out:** production engine_bound briefs; worker enablement; hosted canary; buying; delivering AI prose with only M0.9.10 numeric checks
**Acceptance:**

1. Flag off → identical to E2 fallback path
2. Flag on + timeout → fallback, status visible
3. Mutation fixtures never reach merchant UI as `ai_validated`
4. Prose candidates that pass numeric/`evidenceRefs` checks but fail or lack semantic validation → fallback with `AI_PROSE_SEMANTIC_VALIDATION_*`
5. No secrets in client bundle
6. Still no M7.3 RPC calls; `productionApprovalEligible` remains false for demo

**GO/NO-GO to production AI:** **NO-GO** until separate production decision eligibility + privacy/legal review + semantic validation approval

### Slice E4 — engine_bound brief grounding (future; separate approval)

**In:** map from persisted/evaluated engine results when production source-of-create exists
**Out of M7.4e authorization:** implied by default **NO-GO** now

---

## 9. Acceptance tests (contract checklist for later slices)

### 9.1 Automated

1. Attestation fail-closed for `synthetic_demo`
2. Grounding rejects empty WATCH reason codes
3. REORDER brief shows quantity only when `known` positive integer; REORDER `unknown` shows Unknown and is not editable
4. Inconsistent false `known` quantity grounding → `QUANTITY_GROUNDING_INCONSISTENT`
5. REDUCE/PROMOTE/WATCH briefs mark quantity `not_applicable` / hidden
6. Fallback brief always produced from trusted templates when AI disabled
7. Numeric mutation candidates never accepted as `ai_validated`
8. AI prose without approved semantic validation never accepted as `ai_validated`
9. `confidencePercent` always rejected
10. Financial claim kinds rejected
11. WATCH next-step codes restricted to investigate/dismiss/no_execution family
12. Claim `evidenceRefs` must subset grounding (necessary; not sufficient for AI prose)
13. Actions demo page/client graph still bans persistence/lifecycle/M5/M6 imports
14. Analyst view-only; decide-role demo interactions preserved with no-save; `productionApprovalEligible=false`
15. Demo control paths still surface no-save message (no URL “saved” state)

### 9.2 Manual

- [ ] Desktop split brief (`≥1280px`) feels decision-first, compact, ≥9/10
- [ ] At 1024px, inline/stacked behavior remains (no forced split)
- [ ] Mobile sheet brief usable at 320px without horizontal overflow
- [ ] Provenance / synthetic badge impossible to miss
- [ ] Uncertainty readable without color alone
- [ ] AI-assisted chip (if enabled) does not read as “AI decided”
- [ ] Reduced-motion acceptable

---

## 10. Unresolved decisions

| ID | Question | Default until resolved |
|---|---|---|
| U1 | Should demo fixtures gain explicit synthetic `decisionAsOf` / observation timestamps in E1/E2? | Keep `unknown`; UI shows Unknown/Synthetic freshness |
| U2 | Single provider choice (OpenAI / Anthropic / Gemini) for E3? | **Unresolved** — E3 remains flag-off until chosen under separate approval |
| U3 | Persist briefs (table/object storage) vs ephemeral per request? | Ephemeral for M7.4e demo; persistence requires new contract |
| U4 | Map demo snake_case reason codes → engine SCREAMING codes? | Keep separate namespaces by `briefMode`; optional display map only |
| U5 | Exact freshness SLA thresholds (fresh/aging/stale hours)? | `unknown` in demo; production thresholds deferred to metrics freshness owners |
| U6 | May `accepted_with_omissions` hide low-priority evidence without labeling omissions? | Show generator/validation status in disclosure; no silent trust upgrade |
| U7 | HEALTHY skim AI commentary? | **Out of scope** — no Decision Brief for HEALTHY in v1 |
| U8 | Reuse `conciseReason` verbatim as fallback why-now? | **Yes** for demo mapper |

---

## 11. Documentation consistency checklist

This freeze is intended to be consistent with:

- `docs/M7_4A_DECISION_FIRST_UX_CONTRACT.md` — demo Actions IA, controls, attestation, bans (responsive **split breakpoint**: this freeze follows accepted `≥1280px` Actions implementation over M7.4a’s earlier `≥1024` split wording)
- Accepted Actions layout in `components/actions-demo/actions-demo-workspace.tsx` — `matchMedia("(min-width: 1280px)")` desktop split; tablet inline stack; mobile sheet
- `docs/DECISION_ENGINE.md` / `docs/M7_0_CONTRACT_ADDENDUM.md` — deterministic ownership
- `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md` — dormant persistence; hard-false trust
- `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md` — roles; approval ≠ execution; unapprovable harness/demo
- `docs/TESTING_EVALUATION.md` M0.9.10 — structured numeric/categorical claims; numeric mutation (necessary; not sufficient for free AI prose — §6)
- `docs/BACKGROUND_JOBS.md` — AI after decision; no WATCH→commercial conversion
- `docs/DESIGN_SYSTEM.md` — decision-first; honest AI chrome
- `docs/CROSS_ORG_THREAT_MODEL.md` — AI not authorization
- `docs/ROLE_AND_PERMISSION_MODEL.md` — `actions.decide`
- `lib/commerce-domain/types.ts` — evidence/action vocabulary
- `lib/demo/m7-decision-demo-fixtures.ts` — synthetic attestation and fields
- `tests/evaluation/ai-numeric-mutation.ts` — claim assessment semantics

---

## 12. GO / NO-GO recommendation

| Item | Recommendation |
|---|---|
| Freeze this M7.4e contract (docs only) | **GO** |
| Proceed to **Slice E1** (schemas/validator/fallback, no LLM) after explicit engineering approval | **GO** |
| Proceed to **Slice E2** (Brief UX on demo fallback) after E1 acceptance | **GO** |
| Enable live LLM provider / AI prose delivery | **NO-GO** until E3 **and** a separately approved semantic/claim-validation profile |
| Production engine_bound briefs / M7.3 approve wiring / buying | **NO-GO** |
| Hosted ops, migrations, cron, workers, canary, Git as part of M7.4e | **NO-GO** |

**Next authorized step after approval of this freeze:** Slice E1 only — typed schemas, demo grounding mapper, quantity-consistency validators, trusted-template deterministic fallback builder, separated demo-interaction vs production-eligibility control flags, and tests. **Stop** before provider integration, before AI prose delivery, and before treating briefs as production decisions.

---

## 13. References

- `docs/M7_4A_DECISION_FIRST_UX_CONTRACT.md`
- `docs/DECISION_ENGINE.md`
- `docs/M7_0_CONTRACT_ADDENDUM.md`
- `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md`
- `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md`
- `docs/TESTING_EVALUATION.md` (M0.9.10)
- `docs/BACKGROUND_JOBS.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/CROSS_ORG_THREAT_MODEL.md`
- `docs/ROLE_AND_PERMISSION_MODEL.md`
- `docs/PROJECT_HANDOFF.md`
- `lib/decision-engine/types.ts`
- `lib/decision-engine/evidence-snapshot.ts`
- `lib/commerce-domain/types.ts`
- `lib/demo/m7-decision-demo-fixtures.ts`
- `lib/demo/m7-decision-demo-format.ts`
- `lib/demo/m7-decision-demo-controls.ts`
- `components/actions-demo/actions-demo-workspace.tsx`
- `components/actions-demo/demo-approval-cluster.tsx`
- `app/(app)/app/[organizationId]/actions/page.tsx`
- `tests/evaluation/ai-numeric-mutation.ts`
