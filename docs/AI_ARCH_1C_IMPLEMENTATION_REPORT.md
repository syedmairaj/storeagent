# AI_ARCH_1C_IMPLEMENTATION_REPORT

**Slice:** Bounded deterministic orchestrator only · **no** UI / live AI / migrations / Git / hosted ops
**Principle:** *The AI controls the investigation. It does not control what counts as a fact.*
**DoD:** `LOCAL_COMPLETE` · `HOSTED_SYNC_PENDING` N/A (schema-neutral) · activation **OFF**

---

## A. Starting baseline and protected files

| Field | Value |
|---|---|
| Verified HEAD | `d12fd04` |
| AI-ARCH-1a/1b | `LOCAL_COMPLETE`, still uncommitted under `lib/commerce-agent/` + tests |
| Migrations | **57 local / 57 hosted** (unchanged; no new migration files) |
| Post-catalog | **23/23 PASS** (prior evidence) |
| Production activation | **OFF** |
| Protected (untouched) | `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`, `AGENTS.md`, `.tmp/`, `.vitest/`, SQL/operator/archive dirties |

---

## B. Exact files changed

**Added (1c)**
- `lib/commerce-agent/orchestrator/enablement.ts`
- `lib/commerce-agent/orchestrator/plans.ts`
- `lib/commerce-agent/orchestrator/validate-plan.ts`
- `lib/commerce-agent/orchestrator/assemble.ts`
- `lib/commerce-agent/orchestrator/run.ts`
- `lib/commerce-agent/orchestrator/index.ts`
- `tests/unit/ai-arch-1c-bounded-orchestrator.test.ts`
- `docs/AI_ARCH_1C_IMPLEMENTATION_REPORT.md`

**Modified**
- `lib/commerce-agent/types.ts` (`AGENT_DISABLED`, `INVALID_PLAN`, `AgentRunResult` — from 1c prep)
- `lib/commerce-agent/index.ts` (re-exports orchestrator + `AgentRunResult`)

**Not modified:** M5–M7 calculation engines, inventory-explainer engines, PB1 diagnostics, live routes, UI, migrations, Git history.

---

## C. Supported intents and deterministic plans

Structured intent routing only (no NL LLM planner).

| Intent | Plan spine (literal) |
|---|---|
| `inventory_fact` | `planning.get_inputs` → `inventory.get_sku_intelligence` → `inventory.build_explainer_evidence` → `inventory.classify_guidance_situation` |
| `zero_sales_diagnosis` | same spine; assembly may surface untested hypotheses as non-verified |
| `data_gap` | same spine; preserves missing labels / uncertainty |
| `reorder_review` | same spine; stale → abstain; recommendation forced explain-only / blocked_until_m7 |

Unsupported intents (`competitor_research`, `creative_performance`, `market_opportunity`, `unsupported`, …) → `UNSUPPORTED_INTENT` abstention.

**Budgets:** max steps 6 · max tool calls 4 · default deadline 8000ms.

**Plan validation before execution:** known L1 tool IDs only · trusted merchant context permissions · read_only only · no duplicate/forged/write/forbidden tools · step/tool ceilings.

---

## D. Evidence / claim verification rules

- All tool calls go through `invokeL1Tool` (tenant, scope, evidence validation).
- Distinguishes tool `execution` vs `evidenceVerification` vs `recommendationEligibility`.
- Merchant findings assembled **only** from verified claims with class `observed_fact` | `engine_calculation` | `estimate`.
- Hypotheses never verified; zero-sales copy marks them untested.
- Conflicts → `CONFLICTING_EVIDENCE` abstention (no invented reconcile).
- `reorder_review` + `freshnessClass === "stale"` → `STALE_EVIDENCE` abstention.
- Zero verified findings → `INSUFFICIENT_EVIDENCE`.
- Recommendations require evidence hash authority; `reorder_candidate` downgraded to explain-only / `blocked_until_m7`.
- No fabricated metrics, numeric defaults, external research claims, or create/buy actions.

---

## E. Abstention and failure behavior

| Condition | Code |
|---|---|
| Soft-enable OFF / allowlist miss | `AGENT_DISABLED` |
| Unsupported intent / schema | `UNSUPPORTED_INTENT` |
| Org hint ≠ trusted context | `TENANT_SCOPE_MISMATCH` |
| Conflicting store/location/variant hint vs pin | `TENANT_SCOPE_MISMATCH` |
| Missing grain IDs | `INSUFFICIENT_EVIDENCE` |
| Missing `inventory.read` | `PERMISSION_DENIED` |
| Forged / unknown / write tool in plan | `INVALID_PLAN` / `FORBIDDEN_ACTION_CLAIM` |
| Buy/create/sync language in query | `FORBIDDEN_ACTION_CLAIM` |
| Tool exception | `TOOL_FAILURE` |
| Tool timeout / run deadline | `TIMEOUT` |
| Tool-call / step budget | `STEP_LIMIT` |
| Conflicting facts | `CONFLICTING_EVIDENCE` |
| Stale reorder review | `STALE_EVIDENCE` |
| Not found / empty bundle | `INSUFFICIENT_EVIDENCE` |

Agent trace (non-sensitive): selected tools, bounded steps, ok/latency, evidenceHash / guidance notes, abstention reasons. No secrets/service_role/tokens.

---

## F. Offline PASS/FAIL matrix

| Check | Result |
|---|---|
| Supported structured intent success | **PASS** |
| Unsupported intent abstention | **PASS** |
| Missing / partial / stale evidence | **PASS** |
| Conflicting / contradictory facts | **PASS** |
| Wrong tenant / store / SKU rejection | **PASS** |
| Missing permission | **PASS** |
| Forged tool ID / unsafe plan | **PASS** |
| Tool exception and timeout/deadline | **PASS** |
| Step / tool-call limits | **PASS** |
| Forbidden action request | **PASS** |
| No network / writes / paid AI in orchestrator sources | **PASS** |
| Focused Vitest 1a+1b+1c | **47/47 PASS** |
| `tsc --noEmit` | **PASS** |
| ESLint (`lib/commerce-agent` + 1a/1b/1c tests) | **PASS** |
| `git diff --check` | **PASS** |
| Migrations remain 57/57 | **PASS** |

---

## G. Activation / migration status

| Item | Status |
|---|---|
| `STOREAGENT_COMMERCE_AGENT_ENABLED` | Default **OFF** (server-side; distinct from inventory explainer) |
| `STOREAGENT_COMMERCE_AGENT_ORG_ALLOWLIST` | Empty by default; `mayRun` requires enabled ∧ allowlist match |
| Live route / UI wiring | **None** in 1c |
| Local / hosted migrations | **57 / 57** — no new files |
| Post-catalog | **23/23** (prior) |
| OAuth / SyncRun / workers / cron / billing | **OFF** / not wired |
| PB1 diagnostics | Kept **outside** merchant agent orchestration |
| DoD | AI-ARCH-1c **`LOCAL_COMPLETE`** · schema-neutral · activation **OFF** |

---

## H. AI-ARCH-1d recommended boundary

**Evidence-grounded answer validation + optional offline AI draft gate** (literal allowlist / injection / forbidden-action validator over orchestrator prose) — still no live provider, no UI enablement, no migrations. Reuse AI-INV `validate-answer` patterns against commerce-agent evidence allowlists; keep generator=`deterministic` as default until an explicitly injected offline stub is authorized.

**STOP FOR OWNER REVIEW.** No Git stage/commit/push. No hosted operations.
