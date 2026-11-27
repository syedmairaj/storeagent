# AI_ARCH_1D_IMPLEMENTATION_REPORT

**Slice:** Grounded answer-draft validation + offline stub only · **no** UI / live AI / migrations / Git / hosted ops
**Principle:** *The AI controls the investigation. It does not control what counts as a fact.*
**DoD:** `LOCAL_COMPLETE` · schema-neutral · activation **OFF**

---

## A. Baseline and exact changes

| Field | Value |
|---|---|
| Verified HEAD | `d12fd04` |
| Prior slices | AI-ARCH-1a/1b/1c `LOCAL_COMPLETE` (uncommitted) |
| Migrations | **57 local / 57 hosted** (unchanged) |
| Post-catalog | **23/23 PASS** (prior) |
| Activation | **OFF** |

**Added**
- `lib/commerce-agent/validation/types.ts`
- `lib/commerce-agent/validation/detect.ts`
- `lib/commerce-agent/validation/validate-draft.ts`
- `lib/commerce-agent/validation/apply-draft.ts`
- `lib/commerce-agent/validation/offline-stub.ts`
- `lib/commerce-agent/validation/index.ts`
- `tests/unit/ai-arch-1d-grounded-answer-validation.test.ts`
- `docs/AI_ARCH_1D_IMPLEMENTATION_REPORT.md`

**Modified**
- `lib/commerce-agent/index.ts` (re-exports 1d validation surface)
- `lib/commerce-agent/orchestrator/run.ts` (optional `draftAdapter` polish; default unchanged)
- `lib/commerce-agent/orchestrator/index.ts` (re-export adapter type)

**Not modified:** M5–M7 engines, AI-INV engines, PB1, live routes, UI, migrations, Git history, feature-flag defaults.

---

## B. Draft / claim validation contract

`CommerceAgentAnswerDraft` (`commerce-agent-answer-draft-v1`):
- `evidenceHash`, `merchantAnswer`, `citedEvidenceIds`, optional `citedClaimIds` / `assertedClaims` / `recommendedAction` / `suggestedNextStepCodes`
- Adapter ids: `offline_stub` | `recorded_replay` (live rejected)

`validateCommerceAgentAnswerDraft` checks:
1. Schema + evidenceHash match (bundle **and** deterministic baseline)
2. Answer length bounds (8–2000)
3. Prompt injection / forbidden actions / market-competitor-CPA-ROAS-demand claims
4. Hypothesis-as-proven and estimate-as-fact (prose + asserted claim-class upgrades)
5. Every material number ∈ allowlisted evidence literals (+ baseline numbers)
6. Citations only to authorized evidence/claim IDs
7. No invented sources; ISO timestamps must appear in evidence
8. Grain/SKU/country/unit scope vs trusted context + bundle
9. Next-step codes ⊆ bundle next steps
10. Recommendation eligibility + inputsHash; no action-class upgrade vs baseline
11. Unauthorized tool requests in prose

Accepted drafts become `generator: "ai_validated"` **without** mutating findings/evidence/calculations. Rejected drafts never reach merchants.

---

## C. Provenance and numeric safeguards

| Rule | Enforcement |
|---|---|
| Numbers | Must appear in bundle `allowlistedLiterals` / evidence values / baseline prose |
| Units | Adjacent unit tokens must be authorized when present |
| Product/store scope | Foreign UUIDs / wrong `SKU-*` / unauthorized country → reject |
| Claim classes | Ranked; upgrades (`estimate`→`observed_fact`, hypothesis verified) rejected |
| Estimates | Must stay labeled; promotion prose rejected |
| Hypotheses | Cannot be presented as proven |
| Sources | Only evidence `sourceSystem` values; invented labels (e.g. bloomberg) rejected |
| Timestamps | ISO literals must match evidence `observedAt` / `asOf` |
| Recommendations | `recommendationHasEvidenceAuthority` + no stronger action than baseline |

---

## D. Fallback and abstention behavior

| Event | Outcome |
|---|---|
| Valid draft | `ai_validated` answer; facts from deterministic baseline |
| Validation reject | `fallback_deterministic` with original baseline prose |
| Stub error / timeout / hang | `fallback_deterministic` |
| `live_provider` / `supportsLiveNetwork` | Rejected closed → `fallback_deterministic` |
| No baseline (API helper) | Typed abstention (`UNSUPPORTED_EVIDENCE`) |

Orchestrator: without `draftAdapter`, behavior remains pure 1c deterministic. With injectable offline stub, polish is optional and fail-closed.

---

## E. Offline PASS/FAIL tests

| Case | Result |
|---|---|
| Valid evidence-grounded draft accepted | **PASS** |
| Hallucinated numeric value rejected | **PASS** |
| Wrong units / product SKU rejected | **PASS** |
| Fake citation / invented source rejected | **PASS** |
| Estimate promoted to fact rejected | **PASS** |
| Hypothesis presented as proven rejected | **PASS** |
| Evidence-hash mismatch rejected | **PASS** |
| Forbidden purchase/advertising action rejected | **PASS** |
| Prompt-injection rejected | **PASS** |
| Malformed / oversized rejected | **PASS** |
| Stub timeout / error → safe fallback | **PASS** |
| Live provider closed | **PASS** |
| Optional orchestrator polish + default deterministic path | **PASS** |
| No network / writes / paid AI in validation sources | **PASS** |

Focused Vitest 1d: **15/15 PASS**

---

## F. Existing regression results

| Check | Result |
|---|---|
| Vitest 1a+1b+1c+1d | **62/62 PASS** |
| `tsc --noEmit` | **PASS** |
| ESLint (`lib/commerce-agent` + 1a–1d tests) | **PASS** |
| `git diff --check` | **PASS** |
| Migration file count | **57** |

---

## G. Activation and migration status

| Item | Status |
|---|---|
| `STOREAGENT_COMMERCE_AGENT_*` | Default **OFF** (unchanged) |
| Live LLM / SDK / web search | **None** — offline stub only |
| UI / routes / credits / billing | **None** |
| OAuth / SyncRun / workers / cron | **OFF** / not wired |
| Local / hosted migrations | **57 / 57** — no new files |
| DoD | AI-ARCH-1d **`LOCAL_COMPLETE`** · activation **OFF** |

---

## H. Proposed AI-ARCH-1e boundary

**Thin UI entry** (SKU inspector or Actions) for structured intents only — soft-enable OFF by default, FE honesty fences (`generator` / abstention codes visible), no live provider, no create/buy, no migration. Wire server action that builds trusted `MerchantContext` + injectable L1 deps, calls `runCommerceAgent`, returns validated answer/abstention.

---

## I. Protected-file status

Untouched dirty/untracked protected set remains intact:
`docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, `AGENTS.md`, `.tmp/`, `.vitest/`, SQL/operator/archive dirties.

**STOP FOR OWNER REVIEW.** No Git stage/commit/push. No hosted operations.
