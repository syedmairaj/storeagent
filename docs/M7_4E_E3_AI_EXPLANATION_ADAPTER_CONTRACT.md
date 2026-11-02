# M7.4e E3.0 — AI Explanation Adapter Contract

**Status:** FROZEN for subsequent E3.1–E3.3 implementation slices (docs only until separately approved)
**Baseline verified:** `main` @ `b90613c3c128b418ec0a90adc598ca6f1ed9e13e` — `feat(actions): integrate deterministic decision brief UX`
**Authority when docs conflict:** this contract for provider-independent AI explanation adapter architecture, structured AI candidate schema, semantic claim-validation policy, rejection/fallback orchestration, security/tenant boundaries, offline adversarial evaluation, and E3.1–E3.3 slice gates; `docs/M7_4E_AI_NATIVE_DECISION_BRIEF_CONTRACT.md` (E0) remains authority for Decision Brief merchant content, schemas, and UX; E1/`lib/decision-brief/*` remains authority for grounding validation, deterministic fallback, and existing claim/trace gates; M0.6 / `lib/decision-engine/*` remains authority for commercial truth; M0.9.10 / `tests/evaluation/ai-numeric-mutation.ts` remains authority for structured numeric/categorical mutation assessment (necessary, not sufficient for free prose); Threat 15 / `docs/CROSS_ORG_THREAT_MODEL.md` remains authority for AI-as-non-authorization.

This contract does **not** authorize application code, UI changes, provider SDKs, model/API calls, environment secrets, dependencies, SQL, M5/M6 changes, M7.3 RPC wiring, persistence of AI briefs, production engine_bound binding, workers/cron/HTTP enablement, hosted canary/operations, purchasing, supplier contact, payments, inventory mutation, or Git operations.

---

## 0. Verdict

| Gate | Result |
|---|---|
| Freeze this AI explanation adapter contract (docs only) | **GO** |
| Implement E3.1 offline/stub adapter + fail-closed orchestration (**fallback-only**; no live model; no `ai_validated` delivery) | **GO** after explicit slice approval |
| Implement E3.2 deterministic semantic claim-validation profile + adversarial goldens (first slice that may accept `ai_validated` in tests) | **GO** after E3.1 acceptance |
| Soft-enable synthetic-only AI-validated delivery behind **server-resolved** flag+allowlist (still stub/replay only) | **GO** after E3.2 acceptance under E3.3 gates |
| Treat `groundingHash` as authentication, attestation, or trusted fixture provenance | **FORBIDDEN** — reproducibility / golden binding only (§3.2.1) |
| Let client requests or model/stub outputs authorize AI enablement or tenant access | **FORBIDDEN** (§6.0) |
| Call a live LLM / hosted AI provider from Actions or any production path | **NO-GO** until a later approved provider-binding milestone beyond E3.3 |
| Deliver AI prose with only M0.9.10 numeric checks and/or `evidenceRefs` membership | **FORBIDDEN** |
| Use an unvalidated second LLM as the sole safety gate | **FORBIDDEN** |
| Let AI choose / alter action type, priority, quantity, thresholds, confidence, or reason codes | **FORBIDDEN** |
| Convert WATCH → REORDER/REDUCE/PROMOTE via AI language or next-step codes | **FORBIDDEN** |
| Wire demo Try approve / acknowledge / dismiss / edit to M7.3 lifecycle RPCs | **NO-GO** |
| Production engine_bound AI briefs / buying / supplier contact | **NO-GO** |

**Product intent:** Define a safe, provider-independent adapter so that *when* AI explanation is later enabled, it can only restate already-determined Decision Brief grounding. Deterministic engines own commercial truth. AI may explain, summarize, and prioritize presentation. Any unsupported, contradictory, injected, timed-out, over-budget, or semantically unvalidated candidate must fail closed to the E1 deterministic fallback brief.

---

## 1. Existing architecture findings (audit)

### 1.1 Closed Decision Brief slices

| Slice | Status | Reusable artifact |
|---|---|---|
| **E0** Decision Brief contract | Frozen | `docs/M7_4E_AI_NATIVE_DECISION_BRIEF_CONTRACT.md` — content sections, ownership matrix, rejection codes, E3 prerequisites |
| **E1** schemas / validation / fallback | Implemented | `lib/decision-brief/*` — grounding, claims, next-step policy, fallback composer, demo mapper |
| **E2** premium synthetic Decision Brief UX | Implemented on baseline | `components/actions-demo/decision-brief-panel.tsx` + workspace integration; generator chip already distinguishes `StoreAgent explanation` vs `AI-assisted explanation`; currently always fallback |

### 1.2 Reusable validation / composition (do not reimplement)

| Artifact | Path | E3 reuse rule |
|---|---|---|
| `DecisionBriefGroundingInput` / `DecisionBriefV1` / rejection codes | `lib/decision-brief/types.ts` | **Reuse.** Extend only with adapter/candidate/orchestration types; do not fork brief schema. |
| `validateGrounding` | `lib/decision-brief/validate-grounding.ts` | **First hard gate.** AI path must not weaken attestation, trust claims, quantity consistency, or WATCH reason-code emptiness rules. `engine_bound` remains invalid until separately authorized E4. |
| `validateBriefClaims` | `lib/decision-brief/validate-claims.ts` | **Necessary structured gate.** Exact numeric/categorical match, `confidencePercent` ban, reason-code subset, `evidenceRefs` membership, financial needles, WATCH purchase-implication needles. **Not sufficient for free prose.** |
| `assessAiProseSemanticGate` | `lib/decision-brief/validate-claims.ts` | **Placeholder gate to replace/complete in E3.2.** Today rejects unless `semanticProfileApproved` + `semanticProfileAccepted`. E3 must implement a deterministic profile behind this gate — not delete it. |
| `assessBriefNextStepPolicy` / `isWatchPurchaseImplicationText` | `lib/decision-brief/next-step.ts` | **Reuse.** WATCH next-step allowlist + purchase-implication text needles. |
| `buildDeterministicFallbackBrief` | `lib/decision-brief/fallback-brief.ts` | **Mandatory fallback composer.** Every AI failure path ends here (or equivalent compose path that calls it). Never call a provider on the fallback path. |
| `composeDemoDecisionBrief` | `lib/decision-brief/compose-demo-brief.ts` | **Synthetic-only entry.** E3 orchestration for Actions demo must keep attested fixture trust; never treat route `organizationId` as live inventory ownership of fixture rows. |
| `groundingToNumericTruthSnapshot` | `lib/decision-brief/validate-claims.ts` | **Bridge** to M0.9.10-shaped truth without importing `tests/` into `lib/`. |
| `assessAiNumericMutation` | `tests/evaluation/ai-numeric-mutation.ts` | **Evaluation authority.** Offline goldens must continue to assess structured mutations. Production lib should keep parity via brief claim validation; do not duplicate conflicting mutation semantics. |
| AI fixtures / goldens | `tests/fixtures/ai/*`, `tests/golden/ai/*` | **Extend** with brief-oriented adversarial candidates; do not mutate existing golden versions silently. |
| `workers/explain-actions.ts` | stub / unimplemented | **Remain unimplemented** through E3.3. Architecture tests already ban premature enablement. |

### 1.3 Existing AI evaluation boundary (M0.9.10)

`docs/TESTING_EVALUATION.md` § M0.9.10 freezes:

- Deterministic truth is read-only input to AI explanation.
- Structured claims must exactly match or omit; omission is allowed; mutation is not.
- Categorical confidence only; any `confidencePercent` is unsupported.
- Reason-code claims must be a subset of trusted codes.
- Merchant prose is **not** the oracle for deterministic truth.
- No OpenAI / Anthropic / Gemini / prompt orchestration / explanation persistence / production worker execution in M0.

E0 already states M0.9.10 is **necessary but not sufficient** for free prose. This E3.0 contract freezes the missing sufficiency layer: deterministic semantic claim validation.

### 1.4 Security / pipeline authorities already frozen

| Source | Relevant rule |
|---|---|
| `docs/DECISION_ENGINE.md` | AI must not choose action type, quantity, thresholds, confidence, or resolve contradictions. |
| `docs/BACKGROUND_JOBS.md` AI boundary | AI only after deterministic decision completion; must not convert WATCH into a commercial intervention. |
| `docs/CROSS_ORG_THREAT_MODEL.md` Threat 15 | Prompt/model output suggesting an organization ID is never an authorization source. |
| E2 UI | `DecisionBriefPanel` composes via `composeDemoDecisionBrief` only; no client model SDK; generator label ready but unused for `ai_validated`. |

### 1.5 Gaps this contract fills

| Gap | Contract response |
|---|---|
| No provider-independent adapter interface | §3 |
| No structured AI candidate schema aligned to brief claims | §3.3 |
| No versioned canonical grounding serialization / hash rules | §3.2.1 |
| Semantic prose validation undefined | §4 |
| No orchestration for timeout / cost / injection / provider failure → fallback | §5 |
| Feature flag / allowlist / synthetic execution boundary undefined | §6 (E3.1 test-injected vs E3.3 server-resolved) |
| Offline adversarial plan for AI brief candidates incomplete | §8 |
| E3 monolithic in E0 | Split into E3.1 / E3.2 / E3.3 with acceptance gates (§9); E3.1 fallback-only (§9.1) |

---

## 2. Architecture and data flow

### 2.1 Frozen pipeline (unchanged ownership)

```
canonical observations → metrics → forecast → decision engine / demo fixture
  → DecisionBriefGroundingInput
  → validateGrounding()                         // E1 — fail closed
  → (optional) AIExplanationAdapter.generate()   // E3 — never mutates grounding
  → structured + policy + semantic validation    // E3 — fail closed
  → DecisionBriefV1  (ai_validated | deterministic_fallback)
  → UI
  → human controls (demo no-save; productionApprovalEligible=false)
```

AI before grounding validation is **blocked**.
AI that alters recommendation fields is **blocked**.
AI output never selects `organizationId`, role, approval eligibility, AI enablement, or tenant access.
Client request parameters never authorize AI enablement or tenant access (§6.0).

**Slice delivery freeze:** E3.1 orchestration may exercise the stub/timeout/validation shell, but **must always** emit E1 `deterministic_fallback` briefs to callers — even if a stub returns a valid-looking candidate. First possible `ai_validated` delivery is E3.2 (tests) / E3.3 (allowlisted synthetic soft-enable), and only after semantic profile acceptance.

### 2.2 Component diagram (logical)

```
┌─────────────────────────────────────────────────────────────┐
│  Caller (demo compose / future server path)                  │
│  enablement source:                                          │
│    E3.1 = test-injected only (never product config)          │
│    E3.3 = trusted server-resolved flag+allowlist             │
│  !enabled || !allowlisted → E1 fallback (E2-identical)       │
└────────────────────────────┬────────────────────────────────┘
                             │ grounding (immutable)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator (E3)                                           │
│  1. validateGrounding                                        │
│  2. resolve enablement from trusted source only (§6)         │
│     (ignore client/model claims of enablement)               │
│  3. build DeterministicGroundingEnvelope (canonical hash)    │
│  4. adapter.generate with orchestrator-owned deadline        │
│     (late/ignored-abort results discarded → AI_TIMEOUT)      │
│  5. validate candidate shape                                 │
│  6. validateBriefClaims + next-step policy + M0.9.10 parity  │
│  7. semantic claim profile (E3.2+; required for ai_validated)│
│  8. sanitize prose                                           │
│  9. E3.1: ALWAYS discard candidate → fallback                │
│     E3.2+/E3.3: accept → merge OR reject → fallback          │
└───────────────┬───────────────────────────────┬─────────────┘
                │ accept (E3.2+ only)           │ reject/error/E3.1
                ▼                               ▼
     DecisionBriefV1                      buildDeterministicFallbackBrief
     generator=ai_validated               generator=deterministic_fallback
     validationStatus=accepted            validationStatus=
       [| accepted_with_omissions]          rejected_used_fallback | accepted
```

### 2.3 Immutable engine-owned fields

The adapter **must not** return or overwrite:

- `actionType`, `priority`, `confidence`
- `recommendedQuantity`, `recommendedActionDate`
- `reasonCodes`, `confidenceReasonCodes`
- any `evidence.*` numeric Field values
- `trustClaims`, `demoAttestation`, `briefMode`
- `humanControls.productionApprovalEligible` (always false for synthetic_demo)
- freshness / `decisionAsOf` grounding fields

The adapter **may** propose only:

- why-now summary + statement claims
- uncertainty summary + statement claims
- suggested next-step **wording** (code must still pass `assessBriefNextStepPolicy` against grounding action type; prefer adapter to echo orchestrator-supplied allowed code)
- optional emphasis/order hints among already-grounded key evidence fields (never invent fields)

Recommendation header, confidence chip, evidence numbers, and controls remain engine/fixture-owned in the assembled `DecisionBriefV1`.

### 2.4 Execution boundary (E3.x)

| Mode | Allowed? |
|---|---|
| Offline stub adapter returning fixture candidates | Yes — E3.1 may generate candidates for harness validation only; **delivery always fallback in E3.1** |
| `ai_validated` merchant or test delivery | **No** in E3.1; Yes from E3.2 tests / E3.3 soft-enable after semantic accept |
| Recorded/replay adapter over checked-in candidate fixtures | Yes (E3.3) |
| Live provider HTTP/SDK call | **No** |
| Client-bundle model SDK | **No** |
| Client-request or model-output enablement / tenant auth | **No** |
| `workers/explain-actions.ts` enablement | **No** |
| `engine_bound` grounding | **No** (still E1 `INVALID_BRIEF_MODE`) |
| Cross-org batch prompts | **No** |

---

## 3. Provider-independent adapter interface and AI candidate schema

### 3.1 Versioning

| Constant | Value |
|---|---|
| Adapter contract version | `ai-explanation-adapter-v1` |
| Brief schema (reuse) | `decision-brief-v1` |
| Grounding serialization / hash | `decision-brief-grounding-hash-v1` (§3.2.1) |
| Numeric claim profile (reuse) | `ai-numeric-mutation-v1` |
| Semantic claim profile (new) | `ai-brief-semantic-claims-v1` |
| Prompt/profile bundle version field | required string on every candidate (e.g. `promptVersion`) |

Breaking changes require a new version id. Offline goldens pin profile + serialization versions.

### 3.2 Deterministic grounding envelope

Exact claim-to-evidence references are only meaningful against a frozen envelope:

```ts
/**
 * Immutable, hashable view of DecisionBriefGroundingInput for AI explanation.
 * Orchestrator builds this AFTER validateGrounding() succeeds.
 * Adapter receives a deep-frozen copy; mutations by the adapter are discarded.
 */
interface DeterministicGroundingEnvelope {
  schemaVersion: "decision-brief-v1";
  adapterContractVersion: "ai-explanation-adapter-v1";
  /**
   * Serialization/hash algorithm id. Pin in goldens.
   * See §3.2.1 — reproducibility only, not authentication.
   */
  groundingSerializationVersion: "decision-brief-grounding-hash-v1";
  briefMode: "synthetic_demo"; // E3.x only; engine_bound forbidden

  /**
   * Stable hash of canonicalized grounding per §3.2.1.
   * Reproducibility / cache / golden binding ONLY.
   * NOT authentication, NOT attestation, NOT trusted fixture provenance.
   */
  groundingHash: string;

  /** Single-grain grounding only — never a batch. */
  grounding: DecisionBriefGroundingInput;

  /**
   * Orchestrator-owned constraints the model/stub must respect.
   * These are not suggestions; validators enforce them.
   */
  constraints: {
    allowedActionType: DecisionBriefActionType;
    allowedNextStepCodes: readonly DecisionBriefNextStepCode[];
    allowedEvidenceRefs: readonly string[]; // from groundingAllowedEvidenceRefs (+ uncertainty set when applicable)
    forbidFinancialClaims: true;
    forbidConfidencePercent: true;
    forbidWatchPurchaseImplication: boolean; // true when actionType=WATCH
    maxWhyNowSentences: 3;
    maxUncertaintySentences: 3;
    maxNextStepSentences: 2;
  };

  request: {
    organizationId: string | null; // contextual chrome only; not authorization
    briefId: string;
    locale: "en-US"; // V1 fixed
    promptVersion: string;
    semanticProfileVersion: "ai-brief-semantic-claims-v1";
    numericProfileVersion: "ai-numeric-mutation-v1";
  };
}
```

**Exact claim-to-evidence rule:** every structured assertion in the candidate must cite `evidenceRefs` that are members of the envelope’s allowed ref set, and every numeric/categorical structured value must exactly equal the corresponding grounding field. Refs do **not** prove that surrounding prose is faithful (§4).

### 3.2.1 Canonical grounding serialization and hash (`decision-brief-grounding-hash-v1`)

`groundingHash` is computed only from a **versioned canonical serialization** of the validated `DecisionBriefGroundingInput` (plus the serialization version id). It exists so stub/replay goldens, optional caches, and offline parity checks bind to the same logical grounding.

| Rule | Normative behavior |
|---|---|
| Algorithm id | `decision-brief-grounding-hash-v1` (breaking change → new id) |
| Digest | SHA-256 over UTF-8 canonical bytes; hex-encode lowercase (implementation may expose `sha256:` prefix consistently in one place — pin in E3.1 types/tests) |
| Object keys | Sort lexicographically at every object level; never rely on JS insertion order |
| Arrays | Preserve **existing array order** for `reasonCodes` and `confidenceReasonCodes` (order is part of grounding meaning); do not sort unless a future version explicitly says so |
| `Field<T>` states | Serialize discriminant explicitly: `{"state":"known","value":...}` \| `{"state":"unknown"}` \| `{"state":"not_applicable"}`; include `reasonCode` only when present (omit key when absent — do not emit `null` for missing optional reasonCode) |
| Numbers | Finite JSON numbers only; reject non-finite before hash (grounding validation already fails closed). No `-0` vs `0` divergence: canonicalize `-0` to `0`. No scientific-notation rewriting beyond standard JSON number encoding of the finite value |
| Strings | UTF-8; no Unicode normalization beyond what the grounding already stores; preserve exact code points |
| Booleans / enums | Exact lowercase JSON `true`/`false`; enum strings exact |
| `null` | Allowed only where the grounding type permits (`organizationId` / `storeId` / `locationId` / `variantId`). Emit JSON `null`. Do not omit nullable keys |
| Absent vs null | Do not convert missing optional objects into `null`. `deterministicFallbackCopy` omitted when undefined; when present, include both `whyNow` and `suggestedNextStep` strings |
| Excluded volatile / non-grounding fields | **Never** include brief `generatedAt`, adapter latency, token estimates, request wall-clock, enablement flags, allowlist results, role, or UI control runtime state in the hash input |
| Envelope metadata outside hash input | `groundingHash` itself, `constraints`, and `request` (except that `organizationId`/`briefId` remain on the envelope for logging) are **not** folded into `groundingHash`. Hash input is grounding + serialization version only |
| Whitespace | Compact JSON — no insignificant whitespace |

**Non-goals / hard bans for `groundingHash`:**

1. **Not authentication.** A matching hash does not prove the caller is trusted, signed, or authorized.
2. **Not trusted fixture provenance.** Attestation remains `demoAttestation` + `loadM7DecisionDemoDataset` / `demoActionMatchesTrustedFixture` (E1). Hash equality must never replace attestation checks.
3. **Not a substitute for `validateGrounding`.** Hash only after grounding already passed E1 validation.
4. **Not an enablement or tenant gate.** Hash match must never turn AI on or select an organization.

### 3.3 Structured AI candidate schema

```ts
type AiExplanationAdapterId =
  | "offline_stub"
  | "recorded_replay"
  | "live_provider"; // reserved; not instantiable in E3.x

interface AiExplanationCandidateV1 {
  schemaVersion: "ai-explanation-adapter-v1";
  adapterId: AiExplanationAdapterId;
  provider: string; // e.g. "stub", "replay"; never a secret
  model: string;    // e.g. "stub-v1", "replay-fixture"
  promptVersion: string;
  semanticProfileVersion: "ai-brief-semantic-claims-v1";
  groundingHash: string; // must equal envelope.groundingHash

  /**
   * Merchant-facing prose sections. Not the oracle.
   * Delivery requires semantic profile acceptance.
   */
  prose: {
    whyNowSummary: string;
    uncertaintySummary: string;
    nextStepSummary: string;
  };

  /**
   * Structured claims boundary — necessary for numeric/categorical safety.
   * Must be sufficient to cover every factual assertion the prose intends
   * to make that touches engine-owned fields.
   */
  claims: readonly DecisionBriefClaim[];

  /**
   * Optional next-step code proposal. If omitted, orchestrator uses
   * defaultNextStepCode(actionType). If present, must pass policy.
   */
  suggestedNextStepCode?: DecisionBriefNextStepCode;

  /**
   * Optional evidence emphasis among grounding key-fact fields only.
   * Unknown / invented field keys → reject.
   */
  evidenceEmphasis?: readonly DecisionBriefEvidenceFieldKey[];

  usage?: {
    latencyMs: number;
    inputTokenEstimate?: number;
    outputTokenEstimate?: number;
  };
}
```

Compatibility note: M0.9.10 `AiExplanationCandidate` (`explanation` + flat `AiExplanationClaims`) remains the evaluation-domain shape. E3 orchestration should project brief claims / truth snapshots into that assessment for golden parity, or keep a dedicated projector tested against `assessAiNumericMutation`. Do not diverge mutation semantics.

### 3.4 Adapter interface (provider-independent)

```ts
interface AiExplanationAdapter {
  readonly adapterId: AiExplanationAdapterId;
  readonly supportsLiveNetwork: boolean; // must be false for E3.x adapters

  generate(
    envelope: DeterministicGroundingEnvelope,
    options: AiExplanationGenerateOptions,
  ): Promise<AiExplanationAdapterResult>;
}

interface AiExplanationGenerateOptions {
  signal: AbortSignal;          // orchestrator-owned deadline signal
  maxInputTokens: number;
  maxOutputTokens: number;
  /** Wall-clock budget; orchestrator enforces independently of adapter cooperation */
  timeoutMs: number;
}

type AiExplanationAdapterResult =
  | {
      ok: true;
      candidate: AiExplanationCandidateV1;
    }
  | {
      ok: false;
      reason:
        | "AI_UNAVAILABLE"
        | "AI_TIMEOUT"
        | "AI_UNSUPPORTED_SHAPE"
        | "AI_PROMPT_INJECTION_SUSPECT"
        | "GROUNDING_HASH_MISMATCH"
        | "COST_CAP_EXCEEDED";
      detail: string;
    };
```

**Rules:**

1. Adapters must be server-only modules. Client components must not import adapter implementations or provider SDKs.
2. `supportsLiveNetwork` must be `false` for every E3.x implementation. Architecture tests enforce no `openai` / `@anthropic` / `@google/generative-ai` (and equivalent) dependencies introduced by E3 slices.
3. Stub/replay adapters must bind candidates to `groundingHash` and fail closed on mismatch. Hash mismatch is a reproducibility/binding error only — it does not authenticate the fixture (§3.2.1).
4. Adapters must not perform authorization, org selection, AI enablement, allowlist decisions, or approval writes.
5. **Orchestrator-owned timeout (fail closed):** the orchestrator starts a hard deadline (`timeoutMs`, default 2500). If the adapter ignores `AbortSignal`, hangs, or resolves **after** the deadline with a candidate, the orchestrator **discards** that result, records `AI_TIMEOUT`, and uses E1 fallback. A late `ok: true` must never win a race into `ai_validated` delivery.

### 3.5 Orchestrator interface (proposal)

```ts
/**
 * How enablement booleans were obtained. Required so E3.1 test injection
 * cannot be confused with E3.3 trusted server configuration.
 */
type AiExplanationEnablementSource =
  | "disabled_default"          // production/demo default path
  | "test_injected"             // E3.1–E3.2 unit/harness only
  | "server_resolved_config";   // E3.3+ only; trusted server resolution

interface ExplainDecisionBriefOptions {
  role: OrganizationMemberRole;
  /**
   * ISO datetime of brief assembly. When flag/enablement is OFF, callers that
   * today pass a fixed `generatedAt` into compose/fallback must keep doing so
   * so E2 output remains exactly reproducible (including timestamps + controls).
   */
  generatedAt?: string;

  /**
   * Enablement pair — NEVER trusted from client HTTP body or model/stub output.
   * See §6.0 for source separation.
   */
  aiExplanationEnabled: boolean;
  allowlistMatch: boolean;
  enablementSource: AiExplanationEnablementSource;

  adapter?: AiExplanationAdapter; // only when enabled+allowlisted under a permitted source
  timeoutMs?: number;             // default 2500
  maxInputTokens?: number;
  maxOutputTokens?: number;

  /**
   * E3.1 hard freeze: when true (required for E3.1 product/orchestrator builds),
   * any adapter candidate is discarded after optional validation exercise and
   * the returned brief is always deterministic_fallback.
   * E3.2+ may set false only behind semantic-profile acceptance gates.
   */
  forceDeterministicFallback: boolean;
}

type ExplainDecisionBriefResult =
  | { ok: true; brief: DecisionBriefV1 }
  | { ok: false; reasons: readonly DecisionBriefRejectionCode[]; detail: string };

/**
 * Pseudocode contract — not implemented in this docs slice.
 * On any AI path failure OR E3.1 forceDeterministicFallback, call
 * buildDeterministicFallbackBrief.
 */
declare function explainDecisionBriefFromGrounding(
  grounding: DecisionBriefGroundingInput,
  options: ExplainDecisionBriefOptions & { briefId: string },
): Promise<ExplainDecisionBriefResult>;
```

For Actions demo, a thin wrapper may continue to start from attested `DemoActionItem` → `mapDemoActionToGrounding` → orchestrator, preserving `composeDemoDecisionBrief` trust rules. With enablement OFF / `forceDeterministicFallback=true`, the merchant-visible brief must match the current E2 `composeDemoDecisionBrief` path for the same inputs (`role`, `generatedAt`, trusted fixture action) — including `generatedAt`, control flags/copy, and validation status.

---

## 4. Semantic claim-validation policy

### 4.1 Why numeric equality and evidenceRefs are insufficient

| Check | What it proves | What it does not prove |
|---|---|---|
| Structured field exact match | Asserted qty/type/confidence equals grounding | Prose does not smuggle a different qty/type |
| `evidenceRefs ⊆ allowed` | Claim cited some allowed keys/codes | Prose about those refs is accurate, complete, or non-misleading |
| Needle bans (ROI / buy now) | Some high-risk phrases absent | Novel paraphrases, soft conversion of WATCH, or invented urgency |

Therefore merchant delivery of AI prose as `generator=ai_validated` requires an approved **deterministic** semantic profile. An unvalidated second LLM judge is **not** an acceptable sole safety gate.

### 4.2 Profile: `ai-brief-semantic-claims-v1`

Semantic validation is a **deterministic program** over `(envelope, candidate)` that returns accept / reject with codes. It may compose:

1. **Allowlisted claim templates** — parameterized sentence patterns bound to structured claim kinds and required refs.
2. **Semantic assertions** — boolean predicates over normalized prose + structured claims + grounding.
3. **Rejection scanners** — expanded forbidden patterns / structural anti-patterns beyond E1 needles.
4. **Coverage rules** — every non-empty prose sentence must map to ≥1 accepted template instance or an explicitly allowlisted free-slot assertion tied to structured claims.

Optional future *assistive* LLM checks are out of scope and cannot replace (1)–(4).

### 4.3 Allowlisted claim templates (normative direction)

Templates are versioned strings with typed slots. Slot values must come from grounding or from structured claims that already passed numeric validation.

Examples (illustrative; exact catalog lands in E3.2 code/fixtures):

| Template id | Action scope | Pattern (slots) | Required refs / structured |
|---|---|---|---|
| `why.reorder.below_rop` | REORDER | `{product} is below reorder point ({reorderPointUnits}) with {availableQuantity} available.` | `reorderPointUnits`, `availableQuantity` |
| `why.watch.conflict` | WATCH | `Signals conflict for {product}; StoreAgent is watching rather than intervening.` | ≥1 reason code ref; no purchase structured |
| `unc.unknown_field` | any | `{fieldLabel} is unknown, so certainty stays limited.` | uncertainty claim citing unknown evidence field |
| `next.watch.investigate` | WATCH | `Investigate conflicting or incomplete signals before intervening.` | `suggestedNextStepCode ∈ {investigate_watch, dismiss_watch, no_execution}` |

**Acceptance rule:** a prose sentence is accepted only if it matches an allowlisted template after normalization (whitespace, casing) **or** matches a narrowly defined paraphrase class explicitly enumerated in the profile (still deterministic; not open-ended embedding similarity as a sole gate in V1).

V1 default preference: **strict template match** for `ai_validated`. Broader paraphrase classes are an unresolved decision (U-E3-3); until resolved, prefer reject → fallback over loose acceptance.

### 4.4 Semantic assertions (must pass)

| ID | Assertion |
|---|---|
| S1 | Candidate `groundingHash` equals envelope hash (reproducibility binding only; not attestation/auth). |
| S2 | No structured claim mutates engine-owned fields (reuse `validateBriefClaims` / M0.9.10). |
| S3 | Every prose sentence is template-covered or explicitly omitted via `accepted_with_omissions` policy (U-E3-4). |
| S4 | If prose mentions a number, that number appears in grounding known values **or** is a non-commercial count of listed reason codes; else reject. |
| S5 | If prose mentions an action label (Reorder/Reduce/Promote/Watch), it equals grounding `actionType`; else reject. |
| S6 | WATCH prose fails if purchase/replenish/order/buy implication scanners fire (extend `isWatchPurchaseImplicationText`). |
| S7 | Next-step code/policy consistent with action type; WATCH cannot emit purchase-family codes. |
| S8 | No financial / ROI / cash-at-risk / prevented-stockout language. |
| S9 | No `confidencePercent` / “N% confident” patterns. |
| S10 | No tool-call, URL exfiltration markdown, secrets, policy-override, or cross-org instruction patterns → `AI_PROMPT_INJECTION_SUSPECT`. |
| S11 | `evidenceEmphasis` ⊆ known evidence keys present in grounding. |
| S12 | Prose must not claim freshness/as-of that grounding marks `unknown`. |

### 4.5 Explicit rejection criteria (semantic + orchestration)

| Condition | Rejection code | Fallback? |
|---|---|---|
| Semantic profile not approved / not wired | `AI_PROSE_SEMANTIC_VALIDATION_REQUIRED` | Yes |
| Template/assertion failure | `AI_PROSE_SEMANTIC_VALIDATION_REJECTED` | Yes |
| Numeric/categorical mutation | `AI_NUMERIC_MUTATION` (+ specific M0.9.10 codes in eval logs) | Yes |
| `confidencePercent` / percent confidence prose | `AI_UNSUPPORTED_CONFIDENCE_PERCENT` | Yes |
| Fabricated reason code | `AI_FABRICATED_REASON_CODE` | Yes |
| Untraced evidence refs | `CLAIM_EVIDENCE_UNTRACED` | Yes |
| Financial claim | `AI_UNSUPPORTED_FINANCIAL_CLAIM` | Yes |
| WATCH purchase implication (code or prose) | `AI_WATCH_PURCHASE_IMPLICATION` | Yes |
| Injection / tool / secret / org-selection language | `AI_PROMPT_INJECTION_SUSPECT` | Yes |
| Unsupported JSON/shape | `AI_UNSUPPORTED_SHAPE` | Yes |
| Timeout | `AI_TIMEOUT` | Yes |
| Provider/adapter unavailable | `AI_UNAVAILABLE` | Yes |
| Token/cost cap exceeded | map to `AI_UNAVAILABLE` or dedicated detail under rejection.detail; brief code may reuse `AI_UNAVAILABLE` until a dedicated code is added | Yes |
| Missing/invalid grounding | existing E1 codes | No AI attempt; no brief or error per E1 |

### 4.6 Second-LLM policy

| Approach | Allowed as sole gate? |
|---|---|
| Deterministic templates + assertions + scanners | **Yes** (required) |
| Unvalidated LLM-as-judge | **No** |
| Validated LLM-as-judge *in addition to* deterministic profile | Deferred / unresolved; cannot ship as sole gate |

---

## 5. Rejection / fallback matrix

| Trigger | Merchant brief | `generator` | `validationStatus` | Status chrome |
|---|---|---|---|---|
| Flag OFF / not allowlisted / `enablementSource=disabled_default` | E1 fallback **exactly matching E2** for same inputs (incl. `generatedAt` + controls) | `deterministic_fallback` | `accepted` | StoreAgent explanation |
| **E3.1** any stub candidate (valid-looking or not) while `forceDeterministicFallback=true` | E1 fallback; candidate discarded (validation may still run in harness for tests) | `deterministic_fallback` | `accepted` if AI was not merchant-attempted on product path; harness may assert discard separately | StoreAgent explanation — **never** AI-assisted in E3.1 product path |
| E3.2+/E3.3 adapter ok + structured + **semantic profile accept** | AI prose merged; engine fields from grounding | `ai_validated` | `accepted` or `accepted_with_omissions` | AI-assisted explanation |
| Adapter error / timeout (incl. ignore-abort / late return) / cost cap | E1 fallback; late candidate discarded | `deterministic_fallback` | `rejected_used_fallback` | StoreAgent explanation + rejection in disclosure |
| Structured mutation / semantic reject / injection | E1 fallback | `deterministic_fallback` | `rejected_used_fallback` | same |
| Grounding invalid | No AI; E1 compose fails closed | n/a | n/a | existing error empty state |

**Invariant:** unsupported claims, injection, missing data, contradictory evidence, timeout (including non-cooperative adapters), cost cap, provider/adapter failure, **or E3.1 force-fallback** → **E1 deterministic fallback**. Never show a partial “AI decided” recommendation. Never leave recommendation fields blank because AI failed. Never deliver `ai_validated` before E3.2 semantic profile acceptance.

WATCH-specific matrix additions:

| Trigger | Required behavior |
|---|---|
| AI next-step `review_reorder` / `edit_reorder_quantity` on WATCH | Reject → fallback; force investigate/dismiss/no_execution family in fallback |
| AI why-now says “reorder recommended” / “buy now” / “order anyway” | `AI_WATCH_PURCHASE_IMPLICATION` → fallback |
| AI implies WATCH is temporary until purchase | Reject → fallback |

---

## 6. Feature flag, allowlist, synthetic-only boundary

### 6.0 Enablement authority (non-negotiable)

| Source | May set `aiExplanationEnabled` / `allowlistMatch`? | Slice |
|---|---|---|
| **Test-injected** values inside unit/harness code (`enablementSource=test_injected`) | Yes — **tests only** | E3.1–E3.2 harness |
| **Trusted server-resolved configuration** (`enablementSource=server_resolved_config`) | Yes — after E3.3 acceptance | E3.3+ |
| Default / unset | Forces OFF + empty allowlist (`disabled_default`) | All slices |
| Client HTTP/query/body flags (“enable AI”, allowlist self-assert) | **Never** | All slices |
| Model / stub / replay candidate fields | **Never** | All slices |
| `groundingHash` match | **Never** (reproducibility only) | All slices |

Client requests and model outputs must **never** authorize AI enablement or tenant access. Tenant membership remains server-resolved (`resolveServerOrganizationContext` / equivalent). Threat 15 remains: AI output is never an authorization source.

E3.1 must not read product env/settings tables for enablement. Any “enabled” path in E3.1 is exclusively test-injected and still cannot deliver `ai_validated` (§9.1).

### 6.1 Defaults

| Control | Default |
|---|---|
| `aiExplanationEnabled` | **OFF** |
| Org/user allowlist | **Empty** |
| `forceDeterministicFallback` | **true** in E3.1 builds; may become false only from E3.2+ when semantic profile can accept |
| Adapter selection | `offline_stub` only in E3.1–E3.2; `recorded_replay` optional in E3.3 |
| Live network | **Disabled** / architecture-banned |
| Brief mode | `synthetic_demo` only |

### 6.2 Enablement conjunction (all required for attempting AI)

```
aiExplanationEnabled === true
AND allowlistMatch === true
AND enablementSource ∈ allowed set for slice
     E3.1–E3.2: test_injected only
     E3.3+:     server_resolved_config (or test_injected in tests)
AND briefMode === "synthetic_demo"
AND demoAttestation valid
AND adapter.supportsLiveNetwork === false
AND validateGrounding(ok)
```

**Delivery conjunction** (subset; required to return `generator=ai_validated`):

```
all of the attempt conjunction above
AND forceDeterministicFallback === false   // false forbidden in E3.1
AND semanticProfileVersion approved + profile accepts candidate
AND structured/policy/sanitization gates pass
AND adapter result accepted before orchestrator deadline (no late race)
```

Any false on attempt → **identical to E2 fallback path** for the same `grounding` / `role` / `generatedAt` (timestamps, control flags/copy, generator chip, validation status).
Any false on delivery (including E3.1 force-fallback) → E1 deterministic fallback; never `ai_validated`.

### 6.3 Synthetic-only execution boundary

- Actions Decision Brief AI path may only consume attested M7 demo fixtures via existing mappers.
- Route `organizationId` authorizes chrome/membership only; fixture rows remain non-org inventory.
- `productionApprovalEligible` remains **false**.
- No M7.3 RPC, no persistence of AI candidates, no worker enqueue.
- Hash binding does not replace attestation (§3.2.1).

---

## 7. Security, tenant, privacy, latency, observability

### 7.1 Tenant isolation

- Assemble briefs only after server-resolved org membership for UI routes.
- Envelope contains a **single grain** only; no cross-org batches.
- Model/stub output never selects or changes `organizationId` (Threat 15).
- Cache keys (if any) must include `organizationId` (even when null for pure offline tooling) + `groundingHash` + `promptVersion` + profile versions; never reuse across orgs.

### 7.2 Prompt-injection resistance

Treat product titles, variant titles, reason strings, and any future merchant notes as **untrusted text**.

Required defenses:

- System/instruction channel separated from untrusted fields in any future live prompt builder.
- Strip/reject tool-call syntax, `organizationId=` directives, secret exfil, markdown image URLs, and “ignore previous instructions” class patterns in candidate prose → `AI_PROMPT_INJECTION_SUSPECT`.
- Ignore any candidate attempt to change action type/qty/confidence (already hard-failed by structured validation).
- Sanitize rendered prose (no executable markup).

### 7.3 Privacy / secrets / client SDKs

- Do not send auth tokens, service_role keys, membership lists, or raw provider credentials to any adapter.
- Demo/stub path must not require production secrets.
- **No client model SDKs** in `components/**` or client bundles.
- Logs must not contain full prompts with secrets, access tokens, or entire grounding dumps by default; prefer hashes, rejection codes, actionType, latency, token estimates, model/promptVersion.

### 7.4 Latency / token budgets (contract targets)

| Mode | Target |
|---|---|
| Deterministic fallback | ≤ 50ms local assembly excluding network (unchanged E1) |
| AI adapter hard timeout | ≤ **2500ms** orchestrator deadline → `AI_TIMEOUT` → fallback |
| Late / ignore-abort adapter | Discard result; same `AI_TIMEOUT` fail-closed path; never merge |
| Input token ceiling | implementation sets numeric cap in E3.3; exceed → fail closed before/during generate |
| Output token ceiling | same |
| Caching | optional; keyed per §7.1; never cross-org; hash is not an auth token |

### 7.5 Versioning and reproducibility

- Every `ai_validated` brief provenance must record: `provider`, `model`, `promptVersion`, `latencyMs`, optional token estimates (already on `DecisionBriefV1.provenance.ai`).
- Offline stub/replay must be deterministic given `(groundingSerializationVersion, groundingHash, promptVersion, fixture id)`.
- Goldens pin adapter contract + semantic + numeric profile + `decision-brief-grounding-hash-v1`.
- Flag OFF / E3.1 force-fallback paths must preserve E2 reproducibility for fixed `generatedAt` inputs (byte-comparable brief fields relevant to merchant output and controls).

### 7.6 Observability (no sensitive payloads)

Allowed log/metric fields:

`briefMode`, `briefId`, `actionType`, `generator`, `validationStatus`, rejection codes, `adapterId`, `promptVersion`, profile versions, `groundingHash`, latency, token estimates, flag/allowlist booleans.

Forbidden by default: full prose dumps in shared logs, secrets, service_role, raw envelope JSON in production logs.

---

## 8. Offline adversarial test plan

### 8.1 Separation of test lanes

| Lane | Purpose | May call live provider? |
|---|---|---|
| **A. Offline stub/replay unit + golden** | Shape, mutation, semantic, injection, WATCH, timeout simulation | **No** |
| **B. Orchestration architecture** | Flag default OFF; no client SDK; no worker enablement; import bans | **No** |
| **C. Future real-provider contract tests** | Reserved; empty/not run in E3.x | N/A (NO-GO) |

Lane A must not require network. Simulated timeout uses orchestrator deadline + non-cooperative adapter (ignores abort / resolves late), not provider SLA.

### 8.2 Required adversarial goldens (E3.2+ unless noted)

Extend evaluation fixtures without silently rewriting `ai-numeric-mutation-v1` meaning:

1. Action-type mutation in structured claims
2. Quantity mutation / invent qty when grounding `unknown`
3. Priority / confidence mutation
4. `confidencePercent` present
5. Fabricated reason code
6. Financial ROI / cash-at-risk prose with clean structured claims
7. WATCH + purchase next-step code
8. WATCH + “reorder recommended” / “buy now” prose with otherwise valid structured claims
9. Valid structured claims + untemplated free prose (must fail semantic gate)
10. Valid structured + `evidenceRefs` but prose asserts different number than refs
11. Prompt-injection / org-id suggestion / tool-call / “enable AI for org …” payload in prose
12. Grounding hash mismatch (binding failure only; attestation still independently enforced)
13. Evidence emphasis on unknown/invented field
14. Timeout / ignore-abort / late-return / unsupported shape / cost-cap → fallback; late `ok: true` discarded
15. **E3.1+:** Flag OFF → exact E2 parity for representative fixtures including `generatedAt`, control flags/copy, generator, validationStatus
16. **E3.1:** test-injected enablement + valid-looking stub candidate still yields `deterministic_fallback` only (`forceDeterministicFallback`)
17. Client-supplied enablement/allowlist pretenders ignored (architecture/unit) — server/test source only

### 8.3 Reuse guidance

- Keep using `assessAiNumericMutation` for structured mutation goldens.
- Project brief candidates through `groundingToNumericTruthSnapshot` + claim flattening for parity tests.
- Reuse `validateBriefClaims`, `assessBriefNextStepPolicy`, and `assessAiProseSemanticGate` (completed profile) rather than parallel one-off checkers with weaker rules.

---

## 9. Implementation slices E3.1 / E3.2 / E3.3

### 9.1 E3.1 — Offline stub adapter + fail-closed orchestration shell (**fallback-only**)

**In:**

- TypeScript types for envelope, candidate, adapter, generate options/results (as proposed; may live under `lib/decision-brief/` or `lib/decision-brief/ai/` once approved)
- Canonical serialization + `groundingHash` per §3.2.1 (`decision-brief-grounding-hash-v1`)
- `offline_stub` adapter: returns checked-in candidates **or** intentionally fails; `supportsLiveNetwork=false`
- Orchestrator that:
  - defaults to `enablementSource=disabled_default` → E1 fallback with **exact E2 parity** (same `role` / `generatedAt` / trusted action ⇒ same timestamps, controls, generator, validationStatus)
  - may accept **test-injected** enablement only (`enablementSource=test_injected`); must not read client requests or future server product config in E3.1
  - sets `forceDeterministicFallback=true` always in E3.1 — **discards every stub candidate** after optional harness validation; **never** returns `generator=ai_validated`
  - enforces orchestrator-owned deadline; ignore-abort / late returns → `AI_TIMEOUT` + fallback
  - on test-injected path, may run `validateBriefClaims` + existing `assessAiProseSemanticGate` for coverage, but delivery remains fallback
- Architecture tests: no provider SDK deps; client components do not import adapters; `workers/explain-actions.ts` still unimplemented; Actions merchant path unchanged (flag OFF / force fallback)

**Out:**

- Any `ai_validated` merchant or test delivery
- Semantic template catalog implementation (beyond existing gate stub) — E3.2
- Trusted server-resolved product flag/allowlist — E3.3
- Live providers, env secrets for providers, recorded replay, UI redesign

**Acceptance gates:**

1. Flag OFF / disabled_default → **exact E2 parity** for demo fixtures including `generatedAt`, humanControls, generator chip, validationStatus
2. Test-injected enablement + valid-looking stub candidate → still `deterministic_fallback` only; **zero** `ai_validated` outputs in E3.1
3. Stub timeout / ignore-abort / late success → fail closed to fallback; late candidate never merges
4. Client/model enablement pretenders cannot authorize AI or tenant access
5. `groundingHash` golden stability under §3.2.1; hash never substitutes attestation
6. No new provider dependencies; E1 trust gates unchanged; no decision-math reimplementation

**GO/NO-GO to E3.2:** **GO** iff gates 1–6 pass

### 9.2 E3.2 — Deterministic semantic profile + adversarial goldens

**In:**

- `ai-brief-semantic-claims-v1` allowlisted templates + semantic assertions + rejection scanners
- Complete `assessAiProseSemanticGate` / successor to accept only when profile assertions pass
- First slice allowed to set `forceDeterministicFallback=false` **in unit/harness tests** after semantic accept
- Offline adversarial fixtures/goldens from §8.2
- Parity tests with M0.9.10 mutation assessment
- Enablement remains **test-injected only** (no server product config yet)

**Out:**

- Product / server-resolved flag ON by default
- Live providers
- Loosening E1 grounding validation
- Second-LLM judge as sole gate
- Treating hash match as attestation

**Acceptance gates:**

1. All §8.2 adversarial cases reject to fallback (or never accept as `ai_validated`)
2. At least one stub candidate per action type (REORDER/REDUCE/PROMOTE/WATCH) can be accepted as `ai_validated` **in unit tests** when templates match
3. WATCH accepted candidates never include purchase next-step codes or purchase-implication prose
4. Candidates that pass numeric/`evidenceRefs` but fail templates → `AI_PROSE_SEMANTIC_VALIDATION_REJECTED`
5. No live network in tests; no client-authorized enablement

**GO/NO-GO to E3.3:** **GO** iff gates 1–5 pass

### 9.3 E3.3 — Synthetic soft-enable controls + budgets + observability (still no live provider)

**In:**

- Explicit **trusted server-resolved** feature flag + allowlist wiring (`enablementSource=server_resolved_config`), default OFF / empty allowlist
- Continues to reject client/model enablement pretenders
- Timeout/token budget enforcement with metrics (incl. late-result discard)
- Provenance `ai` metadata population on accepted briefs
- Optional `recorded_replay` adapter for deterministic demo/debug
- Status chrome already present in E2 (`AI-assisted explanation`) verified for accepted path
- Logging policy per §7.6

**Out:**

- Live provider SDK binding
- Production `engine_bound` AI
- Hosted canary / workers / cron
- M7.3 approval wiring
- Client SDKs
- Client-request enablement

**Acceptance gates:**

1. Default OFF in all environments unless explicit **server-resolved** allowlist entry present
2. Allowlisted synthetic path can show `ai_validated` **only** via stub/replay + full semantic validation
3. Timeout/cost/injection/late-return still fallback with visible status (disclosure), not recommendation corruption
4. `productionApprovalEligible=false`; no M7.3 imports
5. Architecture: live provider modules absent; Lane C tests not enabled
6. Secrets absent from client bundle; client flags cannot enable AI or select tenant

**GO/NO-GO to live provider binding:** **NO-GO** until separate milestone (provider choice, privacy/legal, threat review, production eligibility). E3.3 success does **not** authorize live calls.

---

## 10. Unresolved decisions and residual risks

| ID | Question | Default until resolved | Risk if mishandled |
|---|---|---|---|
| U-E3-1 | Concrete **server-resolved** flag/allowlist mechanism for E3.3 (env, settings table, code const)? | E3.1–E3.2: test-injected only; E3.3: server default `false` + empty allowlist until chosen | Accidental global enable / confusing test flags with product config |
| U-E3-2 | Provider choice for post-E3 live binding (OpenAI / Anthropic / Gemini / other)? | **Unresolved** — live binding NO-GO | Premature SDK coupling |
| U-E3-3 | Strict templates only vs deterministic paraphrase classes? | **Strict templates** for V1 `ai_validated` | Over-loose paraphrase → semantic bypass |
| U-E3-4 | When is `accepted_with_omissions` allowed for AI? | Only when orchestrator drops low-priority *evidence emphasis* items, never when omitting material WATCH uncertainty | Silent trust upgrade |
| U-E3-5 | Dedicated rejection code for cost cap vs reuse `AI_UNAVAILABLE`? | Reuse `AI_UNAVAILABLE` + detail string | Weaker metrics cardinality |
| U-E3-6 | May recorded_replay be enabled for all demo users or only allowlisted operators? | Server-resolved allowlist only | Broad AI chrome without ops readiness |
| U-E3-7 | Should demo fixtures gain synthetic timestamps to allow richer templates? | Keep `unknown` (E0 U1) | Templates inventing freshness |
| U-E3-8 | Persist AI candidates for eval replay? | **No** in E3.x; ephemeral only | Privacy + premature storage surface |
| U-E3-9 | Numeric scanner for “N% confident” locales beyond en-US? | en-US only in V1 | Locale bypass |
| U-E3-10 | Assistive second-model check later? | Forbidden as sole gate; deferred entirely for E3.x | False sense of safety |
| U-E3-11 | Exact hex prefix convention for `groundingHash` (`sha256:` vs raw hex)? | Pin in E3.1 types; one convention only | Golden churn |
| U-E3-12 | Should E3.1 harness surface discarded-candidate rejection codes on the returned brief, or keep E2-identical `accepted` fallback? | Prefer E2-identical merchant brief; assert discard in harness metrics/tests only | Confusing product chrome in E3.1 |

**Residual security risks (accepted for docs freeze, must stay mitigated in slices):**

- Template gap → novel harmful paraphrase (mitigate: strict templates + fail closed).
- Untrusted product titles in future live prompts (mitigate: separation + injection scanners; no live prompts yet).
- Client-side accidental import of adapter (mitigate: architecture tests).
- Operators mistaking `AI-assisted explanation` for authorization (mitigate: Threat 15 + demo attestation + `productionApprovalEligible=false`).
- Mistaking `groundingHash` for attestation/auth (mitigate: §3.2.1 bans + E1 attestation reuse).
- Test-injected enablement leaking into product builds (mitigate: `enablementSource` discrimination + E3.1 force-fallback).

---

## 11. Consistency checklist

This contract is intended to be consistent with:

- `docs/M7_4E_AI_NATIVE_DECISION_BRIEF_CONTRACT.md` — E0 brief schema, ownership, E3 prerequisites, rejection codes
- E1 implementation in `lib/decision-brief/*` — grounding, claims, next-step, fallback, semantic gate stub
- E2 UX in `components/actions-demo/decision-brief-panel.tsx` — generator chrome without live AI
- `docs/DECISION_ENGINE.md` — deterministic commercial truth
- `docs/TESTING_EVALUATION.md` M0.9.10 — structured numeric mutation
- `tests/evaluation/ai-numeric-mutation.ts` — assessment semantics
- `docs/BACKGROUND_JOBS.md` — AI after decision; no WATCH→commercial conversion; `explain-actions` dormant
- `docs/CROSS_ORG_THREAT_MODEL.md` Threat 15 — AI not authorization
- `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md` — demo/harness unapprovable; approval ≠ buy

---

## 12. GO / NO-GO recommendation

| Item | Recommendation |
|---|---|
| Freeze this E3.0 adapter contract (docs only), including final hardenings | **GO** |
| Proceed to **E3.1** after explicit engineering approval (fallback-only; test-injected enablement; canonical hash) | **GO** |
| Proceed to **E3.2** after E3.1 acceptance (first `ai_validated` in tests via semantic profile) | **GO** |
| Proceed to **E3.3** synthetic soft-enable (server-resolved flag+allowlist; stub/replay only) after E3.2 | **GO** |
| Live LLM provider / production AI prose / engine_bound AI | **NO-GO** |
| Second LLM as sole semantic safety gate | **NO-GO** |
| Client/model-authorized enablement or tenant selection | **NO-GO** |
| M7.3 wiring / buying / hosted ops / workers / canary as part of E3 | **NO-GO** |

**Next authorized step after approval of this freeze:** Slice **E3.1 only** — provider-independent types, `decision-brief-grounding-hash-v1`, offline stub adapter, fail-closed orchestrator with `forceDeterministicFallback=true`, test-injected enablement separation, E2-parity + timeout discard tests. **Stop** before semantic template catalog / any `ai_validated` delivery (E3.2), before server-resolved product flag soft-enable (E3.3), and before any live model calls.

---

## 13. References

- `docs/M7_4E_AI_NATIVE_DECISION_BRIEF_CONTRACT.md`
- `docs/DECISION_ENGINE.md`
- `docs/TESTING_EVALUATION.md` (M0.9.10)
- `docs/CROSS_ORG_THREAT_MODEL.md`
- `docs/BACKGROUND_JOBS.md`
- `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md`
- `lib/decision-brief/types.ts`
- `lib/decision-brief/validate-grounding.ts`
- `lib/decision-brief/validate-claims.ts`
- `lib/decision-brief/next-step.ts`
- `lib/decision-brief/fallback-brief.ts`
- `lib/decision-brief/compose-demo-brief.ts`
- `components/actions-demo/decision-brief-panel.tsx`
- `tests/evaluation/ai-numeric-mutation.ts`
- `workers/explain-actions.ts` (unimplemented; must remain so through E3.3)
