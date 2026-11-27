# AI-ARCH-0 — Technical Design (PROPOSED)

| Field | Value |
|---|---|
| Document ID | AI-ARCH-0-TECHNICAL-DESIGN |
| As-of | 2026-11-27 |
| Git HEAD (verified at authoring) | `d12fd04` — DOC-CONTINUITY-6 + AI-ARCH-0 docs closure on `main` |
| Mode | Design only — **not** implementation authorization |
| Schema | Local/hosted **57/57** · post-catalog **23/23** · **DEPLOYED_VERIFIED** · activation **OFF** |
| Principle | *The AI controls the investigation. It does not control what counts as a fact.* |

**Related:** `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md` (AI-ARCH-0) · canonical DOCX §37 · `docs/AI_INV_1_GROUNDED_INVENTORY_EXPLAINER_CONTRACT.md` · `docs/M7_4E_E3_AI_EXPLANATION_ADAPTER_CONTRACT.md` · master handoff.

---

## 1. Reusable code inventory (do not duplicate engines)

### 1.1 Already shippable AI explanation stacks (patterns to generalize)

| Area | Path | Reuse for AI-ARCH |
|---|---|---|
| Inventory explainer types / versions | `lib/inventory-explainer/types.ts` | Fact/citation/answer/status/rejection/diagnostics shape |
| Evidence builder | `lib/inventory-explainer/build-evidence.ts` | Server-owned evidence DTO + hash |
| Deterministic answerer | `lib/inventory-explainer/deterministic-answer.ts` | Numeric-authority prose baseline |
| Validator | `lib/inventory-explainer/validate-answer.ts` | Literal allowlist, injection, forbidden actions |
| Orchestrator (SKU Q&A) | `lib/inventory-explainer/orchestrate.ts` | Enablement ∧ allowlist ∧ budget ∧ timeout ∧ fallback |
| Soft-enable | `lib/inventory-explainer/server-enablement.ts` | Env flag + org allowlist; client never trusted |
| Budget/cache | `lib/inventory-explainer/budget.ts` | Process-local daily tokens + evidence-hash cache |
| Offline AI adapter | `lib/inventory-explainer/ai/offline-stub.ts` | Provider-independent adapter interface; `supportsLiveNetwork=false` |
| Server action entry | `lib/inventory-explainer/actions.ts` | Auth → membership → `inventory.read` → load → explain |
| Guidance situations | `lib/inventory-explainer/guidance-situation.ts` | Zero-sales / OOS / stale classifiers (AI-INV-1.1) |
| Decision-brief AI | `lib/decision-brief/ai/*` | Parallel adapter/envelope/validate/orchestrate for Actions demo |

### 1.2 Deterministic commerce engines (numeric authority — never reimplement)

| Engine | Path | L1 tool role |
|---|---|---|
| Inventory math | `lib/metrics/inventory-math.ts` | Read/calc only via existing metric records |
| Sales / inventory aggregates | `lib/metrics/sales-aggregates.ts`, `inventory-aggregates.ts` | Evidence sourcing |
| SKU daily metric record | `lib/metrics/sku-daily-metric-record.ts` | Canonical metric projection |
| Inventory intelligence load | `lib/inventory-intelligence/load.ts` | Membership-scoped merchant SKU rows |
| Planning inputs | `lib/planning-inputs/*` | Assumptions evidence |
| Incoming attestation | `lib/incoming-evidence/*` | Incoming trust class |
| Decision rules (diagnostic) | `lib/decision-engine/decide.ts`, `*-rule.ts`, PB1 binders | **Explain/diagnose only** until M7 create authorized |
| Forecast eligibility / integrity | `lib/forecasting/*`, `published-forecast-eligibility.ts` | Read published/eligible only; no invent |
| Commerce domain invariants | `lib/commerce-domain/*` | unknown ≠ zero; provider-independent types |

### 1.3 Auth / tenancy / permissions

| Concern | Path | Rule |
|---|---|---|
| App identity | `lib/auth/app-route.ts` (`requireAppIdentity`) | Session required |
| Org context | `lib/tenancy/server-organization-context.ts` | Membership from **trusted auth + server lookup** |
| Permissions | `lib/tenancy/permissions.ts` | `inventory.read`, `forecasts.read`, `actions.read`, … |
| Supabase server client | `lib/supabase/server.ts` | RLS path for merchant reads |
| Secret ingestion | `lib/security/secret-ingestion.ts` | Irrelevant to L1 tools; keep out of agent surface |

### 1.4 Tests / evaluation infrastructure to extend

| Suite | Path |
|---|---|
| AI-INV-1 / 1.1 | `tests/unit/ai-inv-1-*.ts` |
| Decision-brief AI E3.x | `tests/unit/m7-4e-e3-*.ts` |
| Numeric mutation / semantic adversarial | `tests/unit/evaluation-ai-*.ts`, `tests/fixtures/ai/*`, `tests/golden/ai/*` |
| Domain invariants | `tests/unit/commerce-domain-*.ts` |

### 1.5 Explicit non-reuse / do-not-wire (L1)

- Live Shopify OAuth, SyncRun, workers, cron, credential vault writes
- M7 production create / Approve→PO
- AI-MKT live search / credits (no adapters until AI-MKT-0/1.1)
- `live_provider` adapter IDs until separately authorized
- New calculation formulas outside `lib/metrics` / `lib/decision-engine` / `lib/forecasting`

---

## 2. Single bounded orchestrator (AI-ARCH-1 target)

```text
AgentQuery
  → resolve MerchantContext (auth + membership + permissions)
  → plan (bounded; allowlisted tools only)
  → invoke tools → ToolResult[]
  → normalize EvidenceRecord[]
  → deterministic analysis (existing engines)
  → claim verification / policy gates
  → AgentAnswer | Abstention
  → AgentTrace (privacy-safe)
```

**Ownership**

| Component | Owns |
|---|---|
| Orchestrator | Investigation control flow, step/time/cost caps, cancellation |
| Tool registry | Permissioned allowlist; never arbitrary code exec |
| Evidence repository (in-memory per run for L1) | Typed records + provenance |
| Deterministic engines | All numeric facts and decision math |
| LLM adapter | Plan suggestions + prose synthesis over **already verified** claims only |
| Merchant workspace | Approval boundary (L1: recommendations only; no side effects) |

**LLM may:** choose next allowlisted tool within budget; draft prose; label hypotheses.
**LLM must not:** invent facts; supply `organizationId`/`storeId` as authority; override engine outputs; call non-allowlisted tools.

---

## 3. TypeScript interface contracts (PROPOSED)

Proposed home: `lib/commerce-agent/` (new in AI-ARCH-1) — **not** implemented in this design pass. Align names with existing explainer/decision-brief vocabulary.

```typescript
/** Trusted query envelope — grain IDs from UI are hints; server re-validates. */
export type AgentQuery = {
  schemaVersion: "commerce-agent-query-v1";
  locale: "en-US";
  intentClass:
    | "inventory_fact"
    | "zero_sales_diagnosis"
    | "data_gap"
    | "reorder_review" // explain only under L1
    | "unsupported";
  naturalLanguage?: string; // optional; L1 may start with structured intents only
  questionId?: string; // reuse InventoryExplainerQuestionId where applicable
  hintGrain?: {
    organizationId: string;
    storeId?: string;
    locationId?: string;
    variantId?: string;
    countryCode?: string;
    currencyCode?: string;
  };
  clientRequestId: string; // idempotency / trace correlation (not auth)
};

/** Resolved only from requireAppIdentity + resolveServerOrganizationContext + permission checks. */
export type MerchantContext = {
  schemaVersion: "commerce-agent-context-v1";
  userId: string;
  organizationId: string; // from membership resolution — NEVER from model output
  role: "owner" | "admin" | "analyst" | "operator";
  permissions: readonly string[]; // Permission union
  storeId?: string; // only if membership-scoped store access proven
  locationId?: string;
  variantId?: string;
  countryCode?: string | null;
  currencyCode?: string | null;
  asOf: string; // ISO
};

export type ToolPermission =
  | "inventory.read"
  | "forecasts.read"
  | "actions.read"
  | "stores.read"
  | "data_quality.read";

export type ToolDefinition = {
  toolId: string;
  description: string;
  sideEffectClass: "read_only"; // L1: only read_only
  requiredPermissions: readonly ToolPermission[];
  inputSchemaVersion: string;
  maxCallsPerRun: number;
  timeoutMs: number;
};

export type ToolResult =
  | {
      ok: true;
      toolId: string;
      latencyMs: number;
      evidenceIds: readonly string[];
      rawRef?: string; // server-side only; never echo secrets to model/client
    }
  | {
      ok: false;
      toolId: string;
      code:
        | "PERMISSION_DENIED"
        | "NOT_FOUND"
        | "TIMEOUT"
        | "TRANSIENT"
        | "UNSUPPORTED"
        | "BUDGET";
      detail: string; // privacy-safe
    };

export type ClaimClass =
  | "observed_fact"
  | "sourced_signal"
  | "engine_calculation"
  | "estimate"
  | "hypothesis"
  | "unknown";

export type EvidenceRecord = {
  evidenceId: string;
  claimClass: ClaimClass;
  label: string;
  value: string;
  unit?: string | null;
  sourceSystem: string; // e.g. sku_daily_metrics, planning_inputs, incoming_attestation
  sourceRef?: string;
  observedAt?: string | null;
  asOf?: string | null;
  organizationId: string;
  storeId?: string;
  locationId?: string;
  variantId?: string;
  countryCode?: string | null;
  currencyCode?: string | null;
  matchQuality?: "exact" | "partial" | "mismatch" | "unknown";
  freshnessClass?: "current" | "stale" | "unknown";
  licenseOk: true; // L1 internal sources always true; external later
};

export type Claim = {
  claimId: string;
  text: string;
  claimClass: ClaimClass;
  evidenceIds: readonly string[];
  verified: boolean; // false until claim verifier PASS
  conflictIds?: readonly string[];
};

export type DecisionRecommendation = {
  recommendationId: string;
  actionClass:
    | "review"
    | "refresh_data"
    | "investigate"
    | "watch"
    | "reorder_candidate" // informational only under L1
    | "abstain";
  summary: string;
  engineVersion?: string;
  inputsHash?: string;
  requiresHumanApproval: true; // L1 always true for consequential classes
  approvalBoundary: "none" | "merchant_required" | "blocked_until_m7";
};

export type AgentTrace = {
  schemaVersion: "commerce-agent-trace-v1";
  runId: string;
  clientRequestId: string;
  organizationId: string;
  startedAt: string;
  endedAt?: string;
  steps: readonly {
    step: number;
    kind: "plan" | "tool" | "analyze" | "verify" | "respond";
    toolId?: string;
    ok: boolean;
    latencyMs?: number;
    note?: string; // no PII/secrets
  }[];
  tokenEstimateIn?: number;
  tokenEstimateOut?: number;
  budgetRemaining?: number;
  cancelled?: boolean;
};

export type AgentFailureCode =
  | "UNAUTHORIZED"
  | "TENANT_SCOPE_MISMATCH"
  | "PERMISSION_DENIED"
  | "UNSUPPORTED_INTENT"
  | "INSUFFICIENT_EVIDENCE"
  | "CONFLICTING_EVIDENCE"
  | "STALE_EVIDENCE"
  | "TOOL_FAILURE"
  | "STEP_LIMIT"
  | "TIMEOUT"
  | "COST_CAP_EXCEEDED"
  | "RATE_LIMITED"
  | "PROMPT_INJECTION_SUSPECT"
  | "HALLUCINATED_NUMBER"
  | "FORBIDDEN_ACTION_CLAIM"
  | "LIVE_PROVIDER_FORBIDDEN";

export type AgentAbstention = {
  status: "abstained";
  code: AgentFailureCode;
  merchantMessage: string;
  missingEvidenceLabels: readonly string[];
  nextSteps: readonly { code: string; label: string }[];
  evidenceHash?: string;
  trace: AgentTrace;
};

export type AgentAnswer = {
  status: "answered";
  merchantAnswer: string;
  findings: readonly Claim[];
  evidence: readonly EvidenceRecord[];
  calculations: readonly EvidenceRecord[]; // claimClass=engine_calculation
  uncertainty: readonly string[];
  recommendedAction: DecisionRecommendation;
  nextSteps: readonly { code: string; label: string }[];
  approvalBoundary: DecisionRecommendation["approvalBoundary"];
  evidenceHash: string;
  generator: "deterministic" | "ai_validated" | "fallback_deterministic";
  trace: AgentTrace;
};
```

---

## 4. Tenant isolation and tool permissions

1. `requireAppIdentity()` → authenticated user.
2. `resolveServerOrganizationContext(identity, hintOrgId)` → membership + role (**fail closed**).
3. `roleHasPermission(role, required)` per tool.
4. Data loaders (`loadMerchantInventoryIntelligence`, planning, incoming) re-check membership.
5. **Never** accept `organizationId` / `storeId` / `variantId` from LLM tool-call args as authority — only from `MerchantContext` or server-validated hint grain that already passed membership + UUID checks (as in `explainInventorySkuAction`).
6. Cross-org hints → `UNAUTHORIZED` / `TENANT_SCOPE_MISMATCH` with no evidence leak.
7. Model-proposed org switch → reject as injection / policy violation.

---

## 5. L1 tool allowlist (read-only)

| toolId | Wraps | Permission | Notes |
|---|---|---|---|
| `inventory.get_sku_intelligence` | `loadMerchantInventoryIntelligence` + grain filter | `inventory.read` | Primary L1 fact source |
| `inventory.build_explainer_evidence` | `buildInventoryExplainerEvidence` | `inventory.read` | Hashable evidence DTO |
| `inventory.classify_guidance_situation` | `guidance-situation` | `inventory.read` | AI-INV-1.1 situations |
| `inventory.explain_deterministic` | `buildDeterministicInventoryExplainerAnswer` | `inventory.read` | Baseline answer |
| `planning.get_inputs` | `loadMerchantPlanningInputs` | `inventory.read` | Assumptions |
| `incoming.get_attestation_trust` | incoming loaders | `inventory.read` | Trust class only |
| `metrics.read_grain_projection` | metric row via intelligence/loaders | `inventory.read` | No recompute workers |
| `forecast.read_published_if_eligible` | published forecast readers | `forecasts.read` | Abstain if ineligible / prod gated |
| `decision.diagnose_pb1_offline` | PB1 diagnostic evaluators | `actions.read` | **Diagnostic labels only**; `productionApprovalEligible=false` |
| `agent.abstain` | local | any | Explicit insufficency |

**Excluded from L1:** web_search, market research, ad APIs, SyncRun, OAuth, vault, workers, metric recompute enqueue, M7 create, purchasing, credit spend, `live_provider`.

---

## 6. Provider-independent LLM adapter

Mirror existing patterns (`InventoryExplainerAiAdapter`, `AiExplanationAdapter`):

| Field | L1 requirement |
|---|---|
| `adapterId` | `offline_stub` \| `recorded_replay` only |
| `supportsLiveNetwork` | must be `false` |
| Input | `MerchantContext` summary + verified `Claim[]` + allowlisted tool catalog — **not** raw DB rows with secrets |
| Output | Structured plan (`toolId` + args subset) **or** prose candidate with `citedEvidenceIds` |
| Validation | Every number/date in prose ∈ evidence allowlist; forbidden action verbs; injection discard |
| Fallback | Deterministic path on any failure (parity with AI-INV-1 / E3.3) |
| Enablement | Server env + org allowlist; distinct flags from inventory explainer / Actions AI if shared router introduced |

Bounded planning: max plan depth = remaining step budget; illegal tool IDs rejected before invoke.

---

## 7. Evidence provenance, freshness, matching, conflicts

| Concern | Design |
|---|---|
| Provenance | Every `EvidenceRecord` carries `sourceSystem`, `asOf`/`observedAt`, `organizationId` |
| Freshness | Reuse stock/metrics stale signals; stale → `freshnessClass=stale`; may force abstention for buy advice |
| Country/currency/variant | `matchQuality`; mismatch → do not compare; abstain on cross-country claims |
| Conflicts | Record `conflictIds` on `Claim`; prefer engine_calculation + observed_fact over hypothesis; never average silently |
| Verification | Claim verifier: citations exist; arithmetic matches engine outputs; hypothesis cannot upgrade to observed_fact |
| External (future) | `licenseOk` + signal class ≠ sales; out of L1 scope |

---

## 8. Limits (proposed L1 defaults)

| Limit | Default (tune in AI-ARCH-1) | Source precedent |
|---|---|---|
| Max tool steps / run | 8 | New |
| Wall-clock timeout | 2500–5000 ms | AI-INV / E3 2500 ms |
| Max input / output tokens | 2048 / 512 | Existing |
| Per-org daily token soft budget | 50_000 process-local | `budget.ts` |
| Max requests / org / day | 200 | `budget.ts` |
| Tool retries | 1 transient only; never retry to invent facts | New |
| Cancellation | `AbortSignal`; discard late results | `orchestrate.ts` race pattern |
| Idempotency | Cache key `(org, intent, grain, evidenceHash, clientRequestId?)` | Evidence-hash cache |
| Side effects | None under L1 | Autonomy L1 |

---

## 9. Offline synthetic evaluation matrix

| Case | Expect |
|---|---|
| Correct inventory facts | `answered`; citations match metrics; generator deterministic or ai_validated |
| Zero sales in-stock | Situation `in_stock_zero_observed_sales`; hypotheses **untested**; no invented demand |
| Missing data | `abstained` / missing labels; next steps refresh/import |
| Conflicting evidence | Conflict recorded; no silent merge; merchant uncertainty listed |
| Unauthorized org | `UNAUTHORIZED`; no evidence payload |
| Unsupported country | `UNSUPPORTED_INTENT` or abstain; no fabricated market stats |
| Tool failure / timeout | Fallback deterministic or abstain; late discard |
| Prompt injection in title/NL | Facts unchanged; `PROMPT_INJECTION_SUSPECT` discard of AI candidate |
| Spending / step limits | `COST_CAP_EXCEEDED` / `STEP_LIMIT`; no partial invented fill |
| Hallucinated number | Reject candidate; fallback |
| Forbidden REORDER-as-action | Reject; approvalBoundary blocked |
| Cross-tenant grain hint | Deny; no leak |

Extend `tests/unit/ai-inv-1-*.ts` + `tests/fixtures/ai/*` patterns; keep offline (no network).

---

## 10. Merchant-facing answer contract

Must present, in order:

1. **Findings** — verified claims only
2. **Evidence** — citations with source + as-of
3. **Calculations** — engine outputs (cover, velocity, thresholds)
4. **Uncertainty** — missing/stale/conflict/hypothesis labels
5. **Recommended action** — review/investigate/refresh; reorder only as *candidate* with `blocked_until_m7` or `merchant_required`
6. **Approval boundary** — explicit
7. **Next steps** — allowlisted codes (reuse AI-INV-1.1 next-step vocabulary where possible)

Honesty fences: no fake ROI, no autonomous buy CTA, demo/synthetic labeled when applicable.

---

## 11. Incremental AI-ARCH-1 build slices

| Slice | Scope | Acceptance gate | Migrations? |
|---|---|---|---|
| **AI-ARCH-1a** | `lib/commerce-agent` types + trace + failure unions; map from AI-INV evidence | Unit compile + type tests; no UI | **None** |
| **AI-ARCH-1b** | Tool registry + L1 allowlist adapters wrapping existing loaders | Offline permission/tenant isolation tests | **None** |
| **AI-ARCH-1c** | Bounded orchestrator (plan→tools→verify→answer) with deterministic-only planner | Golden cases: correct / missing / unauthorized / injection | **None** |
| **AI-ARCH-1d** | Wire offline_stub LLM planner/synthesizer behind soft-enable | Fail-closed parity with AI-INV-1; budget/timeout | **None** |
| **AI-ARCH-1e** | Thin UI entry (SKU inspector or Actions) — structured intents first | Soft-enable OFF default; FE honesty fences | **None** |
| **AI-ARCH-1f** | Evaluation pack expansion (matrix §9) | Focused vitest PASS; no live provider | **None** |

**Out of AI-ARCH-1:** AI-MKT tools, credits schema, L2/L3, workers, OAuth, live model.

**Parallel (not substitute):** AI-INV-1.1 soft-enable/UX iteration remains separately proposed; should share verifier/budget patterns, not fork engines.

---

## 12. Roadmap dependencies and deployment/migration

| Dependency | Status | Impact on AI-ARCH-1 |
|---|---|---|
| AI-ARCH-0 docs | Closed on `d12fd04` / living pins | Design authority |
| AI-INV-1/1.1 code | CLOSED @ `38f63d6` soft-enable OFF | Primary reuse |
| Hosted schema 57/57 | DEPLOYED_VERIFIED | **No new migrations required for L1** |
| Activation (OAuth/workers/SyncRun) | OFF | Must stay OFF |
| AI-MKT-0…4 | PLANNED | After L1; needs licensing + credits later (**future migrations possible then**) |
| COMP/CREATIVE/LOOP | PROPOSED | After AI-MKT deps |
| M7 production create | BLOCKED | Recommendations only |
| PE1.b.6b JWT | BLOCKED | Not required for offline L1 |

**Migration DoD for AI-ARCH-1:** `LOCAL_COMPLETE` with **no** `HOSTED_SYNC_PENDING` expected (schema-neutral). If a future durable credit/audit table is approved, open a **separate** milestone with migration sync policy — do not bundle into AI-ARCH-1a–f.

---

## 13. Risks and unresolved owner decisions

1. Free-form NL vs structured intents first for L1 UX?
2. Single shared soft-enable flag vs separate `STOREAGENT_COMMERCE_AGENT_*`?
3. Whether PB1 diagnostic tools appear in merchant UX before M7 authorization (recommend: internal/eval only initially).
4. Durable vs process-local budget when multi-instance hosted (L1 can stay process-local).
5. Country field sourcing (store default vs explicit) for matchQuality.
6. Relationship of AI-ARCH-1e UI to AI-INV-1.1 enablement (merge vs parallel).

---

## 14. Recommended next authorized slice

**AI-ARCH-1a** — introduce `lib/commerce-agent` contracts + mapping from existing AI-INV evidence **without** live AI, UI enablement, or migrations — after owner acceptance of this design.
