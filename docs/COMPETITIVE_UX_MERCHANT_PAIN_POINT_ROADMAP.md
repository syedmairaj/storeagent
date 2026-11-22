# StoreAgent — Competitive UX & Merchant Pain-Point Roadmap

**Status:** PROPOSED planning document (docs only)
**Baseline verified (original):** `main` @ `3723e16` — `feat(actions): add gated synthetic AI explanation delivery`
**Reconciled (2026-11-19):** Historical — then HEAD `7fc8f2a` (Shopify RO.2).
**Reconciled (2026-11-20 / DOC-2026-11):** Historical — then HEAD `fe29703` (RO.1.2); RO.3 then local uncommitted; AI-INV then mostly PLANNED.
**Reconciled (2026-11-22 / DOC-TRACK-1):** Current pins → living ledger § **2026-11-22** + `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md`. HEAD `173a357` (CONN-1c-β); RO.3 **CLOSED/PUSHED** @ `4f6ef0c` (live nested cert **FALSE**); AI-INV-1/1.1 **CLOSED/PUSHED** @ `38f63d6` (soft-enable OFF); UX-INV-1d **PLANNED** (merchant-first simplification + premium polish). Competitive themes below unchanged.
**Authoritative status table:** living ledger § 2026-11-22 DOC-TRACK-1 (not older header pins in this file).
**Merchant pain → AI capability map (canonical):** `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md` — do not fork a third contradictory pain matrix.
**Authority when docs conflict:** existing freezes win for shipped contracts — especially `docs/M7_4A_DECISION_FIRST_UX_CONTRACT.md`, `docs/M7_4E_AI_NATIVE_DECISION_BRIEF_CONTRACT.md`, `docs/M7_4E_E3_AI_EXPLANATION_ADAPTER_CONTRACT.md`, `docs/FORECASTING.md`, `docs/DECISION_ENGINE.md`, `docs/INVENTORY_FORMULAS.md`, M5–M7 persistence/lifecycle freezes, and `docs/IMPLEMENTATION_STATUS.md` / `docs/PROJECT_HANDOFF.md` / master handoff for operational truth. UX-INV-1 owns Overview/Inventory presentation; AI-INV owns grounded intelligence planning; this file owns competitive themes + Actions E3.3-R2 planning.
**Why edited under DOC-TRACK-1:** Header/§0a still claimed RO.3 “local uncommitted” and AI-INV “all PLANNED”, conflicting with CLOSED/PUSHED evidence — current-state consistency only; competitive analysis body preserved.
**This document does not authorize** UI implementation, SQL, hosted operations, workers/cron/HTTP enablement, live AI providers, purchasing, dependency changes, or Git operations. It does **not** alter E0–E3.3 Decision Brief math/validation, M5–M7 deterministic engines, or approval contracts.

---

## 0a. November 2026 alignment addendum

| Topic | Update |
|---|---|
| Positioning | Preserve **Inventory Decision Copilot / AI Inventory & Buying Agent** — not stock tracker / ERP / autonomous buyer |
| Actions E3.3-R2 | Functional acceptance **CLOSED** (`docs/E3_3_R2_E_ACCEPTANCE_CLOSEOUT.md`); visual ≥9/10 not claimed; R2.c deferred; still synthetic-only |
| Overview/Inventory | **UX-INV-1a–1c.1 CLOSED/PUSHED**; UX-INV-1d **PLANNED** (task→action→result + premium polish); no fake M7 queue |
| Connectors | CSV local PASS; Shopify RO.1–RO.3 offline **CLOSED/PUSHED** (RO.3 @ `4f6ef0c`; live nested cert **FALSE**); CONN-0A…1c-β **CLOSED/PUSHED** through `173a357` (PARTIAL; binding unverified); live OAuth/SyncRun still unclaimed |
| AI intelligence | AI-INV-1/1.1 **CLOSED/PUSHED** @ `38f63d6` (soft-enable OFF); AI-INV-2…6 + AI-MKT-0…4 **PLANNED** |
| Competitive sources | Prediko App Store reviews remain the dated public hypothesis set in §1; treat as individual merchant signals, not proof StoreAgent wins |
| Differentiation matrix | Expanded merchant-pain map lives in AI-INV roadmap; November plan §5 remains complementary — avoid duplicate contradictory P0 lists |
| ICP / 1,000 merchants | Hypothesis / aspirational goal only — not traction |

**Pilot hypotheses (shared with November plan; not outcome claims):** faster attention identification; higher trust from fail-closed unknowns; Shopify read-only sync reducing CSV burden once complete; Approve/Edit/Dismiss preferred over opaque auto-PO.

---

## 0. Purpose and method

Plan merchant-first improvements informed by **individual Prediko Shopify App Store merchant reports**, without copying Prediko’s product surface and without expanding current implementation scope.

**Sources consulted (public reviews, not StoreAgent telemetry):**

- https://apps.shopify.com/prediko/reviews
- https://apps.shopify.com/prediko/reviews?ratings%5B%5D=1

**Interpretation rules:**

1. Treat critical themes as **hypotheses from individual merchants**, not proven universal defects in Prediko or StoreAgent.
2. Preserve **positive competitive benchmarks** repeatedly praised by merchants: easy/quick onboarding, replenishment & purchasing planning workflows, Shopify/warehouse integrations, responsive hands-on support, and continuous improvement.
3. StoreAgent wins by **decision-first clarity + deterministic commercial truth + fail-closed unknowns**, not by denser analytics dashboards or intrusive AI.

---

## 1. Competitive feedback themes → StoreAgent implications

| Theme (individual reports) | Illustrative merchant signal | StoreAgent implication (proposed) | Non-goals |
|---|---|---|---|
| Screen inefficiency | Space-heavy columns / low information density (e.g. mid-tier review citing inefficient layout) | **E3.3-R2**: denser queue + brief without losing evidence readability or ≥44px targets | Do not copy Prediko table chrome; no KPI wallpaper |
| Unreliable metrics / filters | Reports of data “weirdness,” bugs, hard-to-trust narrowing | **Data reliability**: provenance, Unknown/stale, filter correctness contracts | Do not invent live metric tiles before M5/M6 merchant surfaces exist |
| Opaque forecasts | Desire for clearer forecasting that “makes decisions clearer” (positive) vs distrust when opaque | **Forecast explainability**: trusted inputs, formulas, confidence/uncertainty | No opaque ML as V1 truth; AI must not own forecast numbers |
| Limited customization | Expectation that planning adapts to merchant assumptions | **Safe scenarios** (human-controlled assumptions) — future | No silent auto-tuning that mutates production truth |
| Intrusive AI / communication | Onboarding spam / noise reducing trust (1★ report about email flood) | **Optional unobtrusive AI**: explain-in-place, opt-in, never spam-as-product | No autonomous outreach; no AI-as-authorization |
| Bundle forecasting gaps | Explicit 1★: platform “not capable of handling our bundle predictions” | **Bundle/component inventory** — separately scoped domain milestone | Do not bolt bundles into E3.3-R2 UX |
| Raw-material / manufacturing onboarding | 1★: day/week of raw-material entry without seeing makeable finished goods / Shopify orders | Manufacturing visibility is **out of V1 Actions**; capture as later BOM/MRP adjacency | Do not imply StoreAgent ships MRP |

**Positive benchmarks StoreAgent should meet or exceed (planned product north star, not shipped connectors):**

- Fast path from connect → first trustworthy recommendation
- Replenishment workflow clarity (REORDER-first, evidence-backed)
- Provider integrations that feel reliable (CSV → Shopify → WooCommerce → Amazon sequence)
- Support/onboarding that teaches without nagging

---

## 2. Capability status matrix (existing / planned / proposed)

Legend: **Existing** = implemented or contract-frozen on current `main` (may still be demo-only or dormant). **Planned** = product-locked in handoff/roadmap but not shipped as merchant production. **Proposed** = this document only.

| Capability | Status | Notes |
|---|---|---|
| Deterministic inventory formulas / metrics contracts (M5) | **Existing** (engine/schema); merchant Inventory intelligence workspace **partial** (local); hosted workers gated | Snapstore local metrics acceptance 2026-11-18; workers/HTTP production operation remain gated |
| Deterministic forecasting contracts + local/hosted schema (M6) | **Existing** (schema/diagnostics); **production forecast operation NOT APPROVED** | Fixture diagnostics ≠ merchant performance |
| Decision engine REORDER/REDUCE/PROMOTE/WATCH (M0.6 / M7 path) | **Existing** as engine contracts; **production M7 activation blocked** | Fixture/demo paths ≠ production decisions |
| M7.2 immutable persistence / M7.3 lifecycle RPCs | **Existing** dormant / fail-closed infrastructure | Not merchant-production writers |
| Actions demo + Decision Brief E0–E3.3 (synthetic) | **Existing** (baseline historically `3723e16`; later R2.e closeout) | Synthetic banner; `productionApprovalEligible=false`; stub/replay AI only |
| E3.3-R1 scroll/UX remediation | **Existing** (prerequisite for R2) | Does not change decision math |
| E3.3-R2 premium Actions UX | **Existing** functional closeout; visual certification **not claimed**; R2.c **deferred** | Demo-only |
| Premium decision-first UX (M7.4a) | **Existing** contract + demo UI | Not live inventory |
| Overview/Inventory decision-first overhaul (UX-INV-1) | **Existing** local through 1c.1 (`0402564`); 1d **Planned** | Read-only metrics signals OK; no fake M7 queue; browser cert blocked |
| CSV → Shopify → WooCommerce → Amazon connectors | CSV **existing** local; Shopify RO.1/RO.2/RO.1.2 **existing** offline pushed; RO.3 **local uncommitted**; Woo/Amazon **Planned** | No live sync claimed |
| Grounded AI Inventory Explainer / Decision Agent (AI-INV) | **Proposed / Planned** | `AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`; AI ≠ numbers |
| 7-day trial | **Planned** | Not implemented by this plan |
| Approval-gated buying / POs | **Planned** after decisions | Approval ≠ buy today |
| Supplier intelligence | **Planned** (`docs/FUTURE_ROADMAP.md` + AI-INV-5) | After reliable REORDER evidence |
| Metric/filter provenance UX | **Partial** on Inventory (UX-INV-1) | Honest data surfaces |
| Forecast explainability UI | **Proposed** (AI-INV-4) | Consumes M6 explainability fields when eligible |
| Human-controlled planning scenarios | **Proposed** (future-safe) | Separate from production truth |
| Bundle/component inventory | **Proposed** (separate scope) | Domain + forecast + decisions |
| Live provider AI explanations | **Proposed** beyond E3.3 | Remains fail-closed + optional |

---

## 3. Workstreams

### 3.1 E3.3-R2 — Premium merchant UX (compact queue, evidence clarity, density, responsive)

**Problem hypothesis:** Merchants punish tools that waste viewport on low-value chrome while hiding the “what should I do / why” answer.

**Existing foundation (do not rebuild):** M7.4a IA (queue + inspector/sheet), Decision Brief sections, E3.3 soft-enable gates, R1 single scroll-owner / sticky banner / mobile sheet a11y.

**Proposed R2 outcomes (demo-first, synthetic-only until live Actions):**

1. **Compact queue rows** — tighter primary hierarchy (type, product, one-line why, qty when known) without analytics-table density or single-letter column waste.
2. **Evidence clarity** — key facts remain scannable; Unknown stays visually distinct; Technical details stay progressive disclosure.
3. **Density with rhythm** — reduce empty vertical waste on desktop split; preserve readable line-length and touch targets ≥44px.
4. **Responsive behavior** — keep ≥1280px desktop split, 768–1023 tablet stack, &lt;768 sheet; no nested scroll traps (preserve R1 contracts).
5. **Merchant-first copy** — shorten instructional chrome; keep synthetic disclosure honest.

**Release boundary:** UI/docs/tests only on Actions **demonstration** path. **Forbidden:** inventing live KPIs, ROI, MOQ savings, prevented stockouts; changing E0–E3.3 validators/math; wiring M7.3 RPCs.

**Dependencies:** R1 acceptance (scroll/banner/sheet) preferred before R2 density changes.
**Acceptance (draft):** viewport checklist 320/390/768/1024/1280×800/1440×900; all brief sections reachable; filters discoverable; no banner occlusion; a11y focus/Esc preserved; focused UX tests + typecheck/lint/build.

---

### 3.2 Data reliability — provenance, unknown/stale, filter correctness

**Problem hypothesis:** Merchants lose trust faster from wrong/opaque numbers than from missing features.

**Existing foundation:** nullable metrics without zero-defaults; reason-code vocabularies; data-quality issues (M4); Decision Brief Unknown rendering; hard-false trust flags on harness/demo paths; fail-closed WATCH.

**Proposed (phased):**

| Phase | Scope | Boundary |
|---|---|---|
| P0 (demo) | Explicit **Unknown / Synthetic / Not live** labeling consistency across queue + brief + filters | No fake freshness timestamps |
| P1 (when live Actions bind M5/M6) | Show **metric/forecast provenance** (algorithm version, as-of, source class) and **stale/incomplete** indicators from trusted fields only | No invented SLA badges |
| P1 | **Filter correctness contract** — filter chips must match typed action classes; empty states honest; counts = visible membership | No “smart” filters that hide WATCH uncertainty |
| P2 | Cross-surface consistency (Overview later, Inventory later) so the same SKU grain does not contradict Actions | Only after those surfaces exist |

**Release boundary:** Presentation + contracts; **no** change to M5/M6 formulas. Incomplete evidence → Unknown/WATCH, never filled zeros.

---

### 3.3 Forecast explainability — trusted inputs, formulas, confidence/uncertainty

**Problem hypothesis:** Merchants praise forecasts that clarify decisions; they punish black boxes.

**Existing foundation:** `docs/FORECASTING.md` (WMA + deterministic adjustments, history sufficiency, censoring, confidence, backtesting philosophy); M6 persistence/publication schema (operation gated); Decision Brief confidence & uncertainty sections on **synthetic** path.

**Proposed:**

1. Merchant-facing **Forecast rationale panel** (later Forecasting route or brief disclosure): inputs used, exclusions (stockout-censored / insufficient history), formula family/version, confidence class, uncertainty summary.
2. Bind only to **approved published forecast reads** when production operation is separately approved.
3. Keep AI limited to explaining those fields; **AI never computes demand**.

**Release boundary:** Docs/UX contracts first; implementation only after M6 production eligibility for the org. Fixture diagnostics must never be labeled as merchant forecast quality.

---

### 3.4 Future safe planning scenarios (human-controlled assumptions)

**Problem hypothesis:** Merchants want “what if lead time / promo / MOQ changes?” without corrupting system of record.

**Proposed model:**

- Scenarios are **explicit merchant assumptions** (lead time override, demand uplift%, promo window, MOQ constraint) applied in a **sandbox evaluator**.
- Outputs labeled **Scenario — not production recommendation** until merchant promotes via approval lifecycle.
- Deterministic engine remains sole calculator; scenarios pass alternate inputs, not alternate secret math.

**Release boundary:** After production decisions exist. **Out of R2.** No silent overwrite of canonical metrics/forecasts/actions.

---

### 3.5 Bundle / component inventory (separately scoped)

**Problem hypothesis:** Bundle/kit forecasting and raw-material onboarding without finished-good visibility destroy trust for manufacturing-adjacent merchants.

**Proposed separate milestone family (not R2):**

1. Canonical **bundle/BOM** domain (component variants, coefficients, waste factors) via provider-normalized facts.
2. Exploded demand / available-to-promise rules that remain deterministic and location-aware.
3. Decision evidence that cites component constraints explicitly.
4. Onboarding that shows **what can be made / what blocks replenishment** before asking for exhaustive raw-material entry.

**Release boundary:** Own contracts + migrations + adapters; must not patch demo fixtures to fake BOM support. Manufacturing MRP completeness is **not** implied.

---

### 3.6 Optional unobtrusive AI explanations

**Problem hypothesis:** AI adds value when it clarifies an already-determined decision; it destroys trust when noisy, autonomy-suggestive, or hard to dismiss.

**Existing foundation:** E0–E3.3 — provider-independent adapter, semantic validation, deterministic fallback, synthetic soft-enable, Threat 15 (AI ≠ authorization).

**Proposed:**

1. Keep explanations **inline in Decision Brief**, collapsed by default when deterministic copy is sufficient.
2. Org/server allowlist + explicit merchant-visible “AI-assisted explanation” badge (already gated).
3. No email/push “AI tips” spam as a growth loop.
4. Live provider binding only in a **post–E3.3** milestone with the same fail-closed validators.

**Release boundary:** No live LLM in R2. No change to quantities/confidence/action type.

---

## 4. Prioritized backlog (P0 / P1 / P2)

### P0 — Near-term, demo-safe, trust-critical

| ID | Item | Depends on | Acceptance criteria (draft) | Release boundary |
|---|---|---|---|---|
| P0.1 | Close **E3.3-R1** (scroll owner, banner clearance, sheet a11y) if not yet on `main` | E3.3 | R1 acceptance checklist green; tests/typecheck/lint/build | Demo UX only — **treat as done** relative to R2.e closeout |
| P0.2 | **E3.3-R2** density & evidence clarity | P0.1 | Compact queue + readable brief; responsive matrix; no math/contract drift | Demo UX only — **functional CLOSED**; visual cert separate; R2.c deferred |
| P0.3 | Honesty pass: Unknown/Synthetic labeling consistency | E3.3 brief | No live/freshness implication on demo | Docs + demo UI |
| P0.4 | Filter correctness tests for demo action classes + empty/Healthy skim | M7.4 filters | Counts match membership; WATCH not mislabeled | Demo only |
| P0.5 | **UX-INV-1a** Overview honesty + attention summary | Inventory readiness fields | No false “sales/planning missing”; no fake M7 queue; tenant chrome demoted | Spec: `MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md`; UI separately approved |
| P0.6 | **UX-INV-1b** stock health ≠ cover availability; history noise reduction | P0.5 | Zero/low stock not styled healthy solely for calculable cover | Presentation only; formulas unchanged |

### P1 — After live data / forecast / decision eligibility gates

| ID | Item | Depends on | Acceptance criteria (draft) | Release boundary |
|---|---|---|---|---|
| P1.1 | Metric provenance & stale indicators on live Actions/brief | M5 trusted reads + live Actions binding approval | Provenance fields from source of truth only; null → Unknown | No formula changes |
| P1.2 | Forecast explainability panel bound to published forecasts | M6 production operation approval | Inputs/formula version/confidence visible; fixture diagnostics excluded | No AI-owned demand |
| P1.3 | Connector reliability UX (sync health, last success, partial failure) | CSV/Shopify connector milestones as built | Merchants see sync truth without fake “100% healthy” | Per-provider adapters |
| P1.4 | Optional live AI explanations (fail-closed) | Post–E3.3 provider-binding approval | Semantic+structured validation; fallback; opt-in | No spam channels |

### P2 — Differentiated, separately scoped

| ID | Item | Depends on | Acceptance criteria (draft) | Release boundary |
|---|---|---|---|---|
| P2.1 | Human-controlled planning scenarios | Production decisions + approval UX | Sandbox labeled; promote via human controls | No silent production mutation |
| P2.2 | Bundle/component domain + forecast explosion | Canonical BOM model + adapters | Bundle SKUs explainable; component stock gates decisions | Separate milestone family |
| P2.3 | Manufacturing visibility adjacency (makeable qty / blockers) | P2.2 | Onboarding shows value before raw-material burden | Not full MRP |
| P2.4 | Supplier intelligence V1 | Reliable REORDER evidence (`FUTURE_ROADMAP`) | Landed-cost compare; no auto-buy | Existing future roadmap |

---

## 5. Proposed milestones (concise)

| Milestone | Intent | Gate |
|---|---|---|
| **M-UX-R1 close** | Ship accepted R1 scroll/a11y remediation | Demo-only commit approval |
| **M-UX-R2** | Premium compact Decision queue/brief | Docs freeze → UI slice approval; no engine changes |
| **M-Trust-Live** | Provenance/stale/filter correctness on live bindings | Requires M5/M6/M7 live eligibility approvals |
| **M-Forecast-Explain** | Merchant forecast rationale surface | Requires M6 production operation approval |
| **M-AI-Live-Optional** | Provider AI explain-in-place | Post–E3.3; validators mandatory |
| **M-Scenario-Safe** | Assumption sandbox | After production decisions |
| **M-Bundle-BOM** | Component inventory & exploded planning | Separate domain approval |
| **M-Connect** | CSV → Shopify → Woo → Amazon (product sequence) | Existing planned track; not redefined here |

---

## 6. Architecture invariants (non-negotiable)

1. **Deterministic commercial truth** — metrics, forecasts, action type, quantities, confidence, reason codes remain engine-owned.
2. **AI explains only** — never authorizes, never mutates numbers, never converts WATCH into buy.
3. **Provider independence** — Shopify/Woo/Amazon/CSV differences stop at adapters.
4. **Fail closed** — unknown/stale/incomplete → honest Unknown/WATCH, not fabricated certainty.
5. **Approval-gated buying** — UI affordances ≠ purchase orders, payments, or supplier contact.
6. **Demo ≠ production** — synthetic fixtures and soft-enable AI remain explicitly labeled until separate activation gates.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Copying competitor chrome → dashboard drift | Keep decision-first IA; density without table sprawl |
| Premature “live metrics” claims | Status matrix + synthetic banners + hard-false trust flags |
| Scenario mode contaminating production actions | Explicit sandbox label + separate promote path |
| Bundle work exploding scope into R2 | Hard separate milestone; no fixture faking |
| Intrusive AI / notification fatigue | In-brief opt-in only; no spam growth loops |
| Doc conflicting with freezes | This file yields to E0–E3.3 / M5–M7 contracts |

---

## 8. GO / NO-GO

| Action | Verdict |
|---|---|
| Keep this **docs-only** competitive UX & pain-point plan | **GO** |
| Use it to prioritize **E3.3-R2** planning after R1 close | **GO** |
| Start UI/SQL/workers/live AI/purchasing from this document alone | **NO-GO** |
| Alter E0–E3.3 validators, M5–M7 math, or approval contracts under this plan | **NO-GO** |
| Claim connectors, live forecasts, or production decisions as shipped | **NO-GO** |

**Recommended next approval (2026-11-19):** authorize **UX-INV-1a** Overview honesty/attention presentation slice per `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md` (engines unchanged; no M7 queue). In parallel, owner may push Shopify RO.2 (`7fc8f2a`) and separately approve RO.1.2 offline mapping — still without live Shopify, workers, JWT, or M7 create.
