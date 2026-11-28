# StoreAgent.si — AI Intelligence & Merchant Value Roadmap

**Document ID:** DOC-2026-11 / AI-INV
**Mode:** Planning & product vision only — **not authorization** to deploy live models, enable workers, run JWT, connect live Shopify, activate M6/M7, spend credits, or claim merchant ROI.
**As-of:** 2026-11-27 — **AI-MKT-1f** (`LOCAL_COMPLETE` offline; AI-MKT-1e CLOSED/PUSHED @ `59ff8b0`; AI-MKT-1d CLOSED/PUSHED @ `2f6ae43`; AI-MKT-1c CLOSED/PUSHED @ `553e239`; AI-MKT-1b CLOSED/PUSHED @ `211d8e9`; AI-MKT-1a CLOSED/PUSHED @ `f685c15`; AI-MKT-0 CLOSED/PUSHED @ `de01686`; AI-ARCH-1 CLOSED/PUSHED @ `c216ded`; DOC-CONTINUITY-6 schema pins preserved)
**Authoritative current status table:** `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md` § **2026-11-27 — AI-MKT-1f** (falls back to AI-MKT-1e / 1d / 1c / 1b / 1a / AI-MKT-0 / AI-ARCH-1f / AI-ARCH-0 / DOC-CONTINUITY-6)
**Compact handoff:** `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md`
**Related:** November execution plan · Merchant UX delivery · Competitive UX roadmap · PE1.b.6b handoff · Shopify RO / CONN reports · canonical DOCX §36–§37 · `docs/AI_ARCH_1F_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md` · `docs/AI_MKT_1A_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1B_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1D_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1E_IMPLEMENTATION_REPORT.md` · `docs/AI_MKT_1F_IMPLEMENTATION_REPORT.md`

### 2026-11-27 status pin (DOC-CONTINUITY-6 + AI-ARCH-1 + AI-MKT-0/1a–1f)

| Slice | Status |
|---|---|
| Git HEAD tip (committed) | `59ff8b0` — AI-MKT-1e **CLOSED/PUSHED** · AI-MKT-1d **CLOSED/PUSHED** @ `2f6ae43` · AI-MKT-1c **CLOSED/PUSHED** @ `553e239` · AI-MKT-1b **CLOSED/PUSHED** @ `211d8e9` · AI-MKT-1a **CLOSED/PUSHED** @ `f685c15` · AI-MKT-0 **CLOSED/PUSHED** @ `de01686` · AI-ARCH-1a–1f **CLOSED/PUSHED** @ `c216ded` · AI-MKT-1f **`LOCAL_COMPLETE`** (uncommitted) · hosted migrations **57/57** · post-catalog **23/23** · schema **DEPLOYED_VERIFIED** · activation **OFF** |
| AI-ARCH-0 | **PROPOSED** (design) · closed with DOC-CONTINUITY-6 @ `d12fd04` |
| AI-ARCH-1a–1f | **CLOSED/PUSHED** @ `c216ded` (1e `1c75de5`; 1a–1d `d56de33`); soft-enable **OFF**; 38/38 · 121/121 · 27/27 PASS |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` — feasibility + governance rule |
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` — contracts/registry/rights; offline **GO** / live **NO-GO** |
| AI-MKT-1b | **CLOSED/PUSHED** @ `211d8e9` — `lib/market-research/adapters/` + `docs/AI_MKT_1B_IMPLEMENTATION_REPORT.md`; offline **GO** / live **NO-GO** |
| AI-MKT-1c | **CLOSED/PUSHED** @ `553e239` — `lib/market-research/normalize/` + `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md`; offline **GO** / live **NO-GO** |
| AI-MKT-1d | **CLOSED/PUSHED** @ `2f6ae43` — `lib/market-research/orchestration/` + `docs/AI_MKT_1D_IMPLEMENTATION_REPORT.md`; offline **GO** / live **NO-GO** |
| AI-MKT-1e | **CLOSED/PUSHED** @ `59ff8b0` — guarded merchant research UX + `docs/AI_MKT_1E_IMPLEMENTATION_REPORT.md`; soft-show **OFF**; offline **GO** / live **NO-GO** |
| AI-MKT-1f | **`LOCAL_COMPLETE`** — adversarial evaluation + `docs/AI_MKT_1F_IMPLEMENTATION_REPORT.md`; offline **GO** / live **NO-GO** |
| AI-INV-1 / 1.1 | **CLOSED/PUSHED** @ `38f63d6`; soft-enable **OFF**; enablement/UX **PROPOSED** (not architecture substitute) |
| AI-INV-2…6 | **PLANNED** |
| AI-MKT-1.1 → 2 → 3 → 4 | **PLANNED** (IDs preserved); no live search / paid credits |
| COMP-1 · CREATIVE-0/1/2 · LOOP-1 | **PROPOSED** |
| UX-INV-1d | **PLANNED** |
| OAuth / SyncRun / workers / JWT / M6/M7 / launch | **BLOCKED / NOT AUTHORIZED** |

> Principle: *The AI controls the investigation. It does not control what counts as a fact.* Prefer this pin + master handoff for *current* truth. Dependency order unchanged.

### Dependency-aware intelligence sequence (AI-ARCH-0)

Not implementation permission. No invented competitor sales/ROAS. Licensed sources only. Human approval for actions. Deterministic inventory math remains canonical.

| Order | ID | Scope | Status |
|---|---|---|---|
| 0 | **AI-ARCH-0** | Orchestrator & evidence architecture (Commerce Decision Loop) | **PROPOSED** (design closed @ `d12fd04`) |
| 1 | **AI-ARCH-1** | Bounded read-only agent (L1) | **CLOSED/PUSHED** @ `c216ded` (1a–1f) |
| 1b | AI-INV-1.1 enablement | Soft-enable / merchant UX iteration (code CLOSED @ `38f63d6`) | **PROPOSED** (parallel UX path) |
| 2 | **AI-MKT-0** | Data/source/licensing feasibility | **CLOSED/PUSHED** @ `de01686` |
| 3a | **AI-MKT-1a** | Research contracts / registry / rights | **CLOSED/PUSHED** @ `f685c15` |
| 3b | **AI-MKT-1b** | Offline provider adapters & fixtures | **CLOSED/PUSHED** @ `211d8e9` |
| 3c | **AI-MKT-1c** | Evidence normalization & matching | **CLOSED/PUSHED** @ `553e239` |
| 3d | **AI-MKT-1d** | Bounded research orchestration & claim validation | **CLOSED/PUSHED** @ `2f6ae43` |
| 3e | **AI-MKT-1e** | Guarded merchant research UX | **CLOSED/PUSHED** @ `59ff8b0` |
| 3f | **AI-MKT-1f** | Adversarial evaluation & offline acceptance | **`LOCAL_COMPLETE`** (offline) |
| 4 | AI-MKT-1.1 | Credits and cost control | PLANNED |
| 5 | AI-MKT-2 | Zero-sales detective | PLANNED |
| 6 | COMP-1 | Competitor/customer sentiment workspace | **PROPOSED** |
| 7 | AI-MKT-3 | Product/country opportunity advisor | PLANNED |
| 8 | CREATIVE-0 | Ad-platform data feasibility | **PROPOSED** |
| 9 | CREATIVE-1 | Owned creative/campaign analytics | **PROPOSED** |
| 10 | CREATIVE-2 | Creative experiments and learning | **PROPOSED** |
| 11 | AI-MKT-4 | Outcome and buying intelligence | PLANNED / wording **PROPOSED** |
| 12 | LOOP-1 | Measured decision-learning system | **PROPOSED** |

---

## 1. Product position (frozen thesis + AI-ARCH-0 framing)

StoreAgent.si is a **provider-independent AI Commerce Intelligence & Buying Agent** (Inventory Decision Copilot) built on one **evidence-grounded Commerce Decision Loop**.

| It is | It is not |
|---|---|
| Evidence-backed commerce intelligence + buying workspace | Another inventory spreadsheet |
| Deterministic metrics + forecast + decision engines with AI investigation/explanation | A generic chatbot bolted onto stock tables |
| Provider-independent canonical domain (CSV → Shopify → Woo → Amazon) | A Shopify-only widget or ERP replacement |
| Merchant-controlled Approve/Edit/Dismiss for consequential actions | An autonomous purchasing bot that invents facts |

**Thesis (unchanged math authority):** Data determines reality. Deterministic forecasting and inventory logic calculate decisions. AI plans investigations, retrieves scoped evidence, explains, and assists. Merchants approve actions until automation earns trust. **AI-ARCH-0 principle:** *The AI controls the investigation. It does not control what counts as a fact.*

**Initial ICP (hypothesis to validate — not achieved traction):** SMB / mid-market merchants ≈ **200–5,000 SKUs**, regular replenishment, spreadsheet/ops pain.
**Long-term goal:** **1,000 merchants** — aspirational product goal, **not** current customers, paying launch, or guaranteed market success.

**Paying-customer launch:** **NO-GO** until independent launch acceptance.

---

## AI-ARCH-0 — AI Commerce Intelligence Architecture (**PROPOSED**)

> **Status:** **PROPOSED** documentation only — **not** implemented, **not** authorization for live models, paid research, OAuth, workers, SyncRun, credentials, M6/M7 activation, or purchasing.
> **Milestone IDs:** `AI-ARCH-0` (this architecture) · `AI-ARCH-1` (bounded read-only agent — **PROPOSED**, after AI-ARCH-0). No prior ID collision found (2026-11-27).
> **Non-negotiable principle:** *The AI controls the investigation. It does not control what counts as a fact.*

### Product framing (reconciled)

StoreAgent.si is an **AI Commerce Intelligence & Buying Agent**: one **provider-independent**, **evidence-grounded** **Commerce Decision Loop**. Deterministic inventory/forecast/decision engines remain numeric authority. Merchants approve consequential actions until higher autonomy is separately authorized.

| LLMs may | LLMs must not |
|---|---|
| Plan investigations within approved tools | Fabricate business facts or competitor performance |
| Choose typed, permissioned tools | Override canonical inventory / forecast / decision math |
| Synthesize *sourced* evidence and explain | Select another tenant/org/store |
| Draft recommendations for merchant review | Invent revenue, units sold, CPA, ROAS, demand, conversion |
| Abstain when evidence is missing/stale | Bypass approval, spend, or policy gates |

---

### A. Central layers (separation of responsibilities)

| # | Layer | Responsibility |
|---|---|---|
| 1 | Merchant natural-language interface | Capture intent; show provenance, abstentions, and decision workspace — not a free-form fact oracle |
| 2 | Tenant / store / SKU / country context resolution | Bind every investigation to org → store → location → SKU/variant → country/currency; fail closed on ambiguity |
| 3 | Bounded Commerce Intelligence Orchestrator | Run the Decision Loop with step/time/cost caps; schedule tool calls; never invent facts |
| 4 | Typed, permissioned tool registry | Allowlisted tools only; least privilege; per-tenant policy; idempotent where side-effecting |
| 5 | Canonical commerce domain + data adapters | Provider-independent domain; adapters normalize CSV/Shopify/…; unknown ≠ zero |
| 6 | Internal + external evidence repository | Typed evidence records with provenance; licensed/authorized external sources only |
| 7 | Deterministic calculation / decision engine | M5 metrics → M6 forecast → M7 decisions remain sole numeric truth |
| 8 | Claim verification, policy & risk gates | Claim-level checks; licensing; spend caps; injection resistance; human-review triggers |
| 9 | Merchant decision workspace | Approve / Edit / Dismiss; scenario compare; no silent action |
| 10 | Outcome measurement / learning | Record approved tests → measured outcomes → updated evidence (tenant-private) |
| 11 | Model-independent LLM router | Server-side router; provider swappable; schema-validated I/O; budgeted; auditable |

**Orchestrator owns investigation control flow. Engines + evidence repository own facts. Merchants own consequential actions.**

---

### B. Dynamic merchant query flow (Commerce Decision Loop)

```text
UNDERSTAND → RESOLVE CONTEXT → PLAN → COLLECT → NORMALIZE → VALIDATE
→ ANALYZE → VERIFY → RESPOND → TRACK OUTCOME
```

| Stage | Meaning |
|---|---|
| UNDERSTAND | Parse merchant question; classify intent (inventory Q, zero-sales, market, creative, reorder) |
| RESOLVE CONTEXT | Org/store/SKU/country/currency; refuse cross-tenant; ask clarifying Q if ambiguous |
| PLAN | Orchestrator selects approved tools only; declare max steps/deadline/cost |
| COLLECT | Invoke tools; gather internal metrics + authorized external signals |
| NORMALIZE | Map into canonical domain + typed evidence DTOs |
| VALIDATE | Freshness, coverage, country/variant match, licensing, contradictions |
| ANALYZE | Deterministic engines compute; LLM may hypothesize **labeled** inferences only |
| VERIFY | Claim-level provenance; arithmetic re-check; policy/risk gates |
| RESPOND | Answer with observed vs sourced vs inferred vs missing; recommend actions |
| TRACK OUTCOME | If merchant approves a test/action, record outcome evidence for LOOP-1 |

**Bounds (PROPOSED defaults — tune per slice):** max N tool steps; wall-clock deadline; per-org token/credit budget; cancellable mid-run; on budget/timeout → **safe fallback** = deterministic facts only + abstention (no invented fill). Bounded retries only for transient tool failures — never retry to “guess” a fact.

**Coverage by query class**

| Class | Internal first | External (gated) | Decision output |
|---|---|---|---|
| Simple inventory | M5 reads + AI-INV-1 | None | Explained facts + next steps |
| Zero-sales diagnosis | AI-INV-1.1 situations + AI-MKT-2 | Optional AI-MKT-1 after confirm | Hypotheses labeled untested |
| Competitor / country | COMP-1 + AI-MKT-1 | Licensed/API/permitted only | No invented competitor sales |
| Product opportunity | AI-MKT-3 | Same | Opportunity ≠ guaranteed demand |
| Creative / campaign | CREATIVE-1/2 | Ad-platform APIs after CREATIVE-0 | CPA/ROAS only if source provides |
| Reorder / buying | M5/M6/M7 + AI-INV-6 | — | Merchant Approve/Edit/Dismiss only |

#### Sample investigation (illustrative — not live data)

**Merchant:** “Why isn’t SKU Blue Mug selling in AE, and should I reorder?”

| Class | Content |
|---|---|
| Observed facts (internal) | Org/store scoped: available qty 42; units sold last 28d = 0; cover days high; last inventory observation 2026-11-20; listing status active *(hypothetical illustration)* |
| Sourced external signals | Search-interest snippet for “blue mug UAE” from approved research adapter — **signal class = search interest ≠ units sold** |
| Inferences (untested) | Possible demand mismatch **or** listing discoverability issue — **hypothesis, not confirmed** |
| Missing evidence | Ad spend/ROAS for this SKU; competitor unit sales; returns rate; trusted unit cost for cash claim |
| Recommended actions | (1) Confirm listing visibility in AE channel (2) Optional licensed market research with credit confirm (3) Do **not** auto-reorder — REORDER only after M7 gates + merchant approval |

---

### C. Evidence & accuracy contract (**PROPOSED** typed shapes)

| Contract | Required fields (conceptual) |
|---|---|
| Query context | `org_id`, `store_id?`, `location_id?`, `sku_id?`, `variant_id?`, `country?`, `currency?`, `as_of`, actor |
| Tool request/response | `tool_id`, args schema, permission scope, idempotency key, status, latency, cost |
| Evidence record | `evidence_id`, claim text, value, unit, `claim_class` ∈ {observed_fact, sourced_signal, estimate, hypothesis, unknown} |
| Provenance / citations | Source system/URL/provider, retrieval time, observation period, license/permit flag |
| Observation vs inference | Explicit separation; inferences never silently upgraded to facts |
| Country / currency / variant match | Match quality + fail-closed on mismatch |
| Timestamps / freshness | `observed_at`, `as_of`, staleness class |
| Coverage / contradictions | Coverage %, conflicting evidence list |
| Decision recommendation | Action class, engine version, inputs hash, confidence class, human-required flag |
| Merchant approval | Approve/Edit/Dismiss, actor, timestamp, edited fields |
| Outcome / experiment | Baseline, treatment, metrics actually available, result class ∈ {correlation, hypothesis, controlled_causal} |

**Invariants:** claim-level provenance · deterministic arithmetic · tenant isolation · source licensing · permission checks · abstention · human review for consequential actions.
**Forbidden inventions:** competitor revenue/units, CPA/ROAS, demand volume, conversion rates — unless the authorized source literally provides them (then cite). Web-grounded AI research is **not** proof of sales.

---

### D. Autonomy and security

| Level | Meaning | Gate |
|---|---|---|
| **L1** | Autonomous **read-only** investigation | **First** — AI-ARCH-1; still soft-enable / budgets / audit |
| **L2** | Monitored recommendations & experiments | Separate auth; merchant confirm; spend caps |
| **L3** | Bounded approved **external** actions | Separate auth; provider permissions; safety + release gates; idempotency |

**Security controls (all levels):** prompt-injection resistance (tool outputs treated as untrusted data); least-privilege tools; source isolation; full audit trail; idempotent side effects; spending/credit controls.
**Current production:** OAuth, workers, cron, SyncRun, live AI spend, credential ops remain **OFF**.

---

### E. Closed-loop intelligence (LOOP-1 target)

```text
Observations (merchant / store / market / campaign)
→ evidence-backed hypotheses
→ scenario comparison
→ merchant-approved test
→ measured business outcomes
→ updated evidence & recommendations
```

Use sales, inventory, contribution margin, returns, creative metrics, CPA/ROAS **only when actually available from authorized sources**. Label **correlation** vs **hypothesis** vs **controlled causal** evidence. Tenant privacy: no uncontrolled cross-merchant sharing or model training on merchant data.

---

### F. Milestone roadmap (IDs verified — no collisions)

| Order | ID | Scope | Status | Depends on | Acceptance (docs/impl) | NOT included |
|---|---|---|---|---|---|---|
| 0 | **AI-ARCH-0** | Orchestrator & evidence architecture (this doc) | **PROPOSED** | Owner review | Cross-doc consistency; principle frozen | Live AI, spend |
| 1 | **AI-ARCH-1** | Bounded read-only agent (L1 loop) | **1a–1e CLOSED/PUSHED** (`d56de33`/`1c75de5`); **1f LOCAL_COMPLETE**; parent pending | AI-ARCH-0 | Offline tests; budgets; abstention; tenant isolation; soft-enable OFF | L2/L3 actions; paid research |
| — | AI-INV-1 / 1.1 | Grounded explainer + situational guidance | **CLOSED/PUSHED** @ `38f63d6` | — | Soft-enable **OFF** | Live model cert |
| 1b | AI-INV-1.1 enablement / UX | Soft-enable + merchant UX iteration | **PROPOSED** | Owner auth | Honesty review; flag still gated | OAuth/SyncRun |
| 2 | **AI-MKT-0** | Licensing / source feasibility | **CLOSED/PUSHED** @ `de01686` | AI-ARCH-0 (contract) | Legal allowlists recorded; unresolved LEGAL open | Live providers |
| 3a | **AI-MKT-1a** | Research contracts / registry / rights | **CLOSED/PUSHED** @ `f685c15` | AI-MKT-0 | Runtime DTO + rights/geo/tenant tests PASS | Live path |
| 3b | **AI-MKT-1b** | Offline adapters & fixtures | **CLOSED/PUSHED** @ `211d8e9` | AI-MKT-1a | Synthetic adapter + denial tests PASS | Live before 1.1 |
| 3c | **AI-MKT-1c** | Evidence normalization & matching | **CLOSED/PUSHED** @ `553e239` | AI-MKT-1b | Offline Evidence DTO + match tests PASS | Live before 1.1 |
| 3d | **AI-MKT-1d** | Bounded research orchestration & claim validation | **CLOSED/PUSHED** @ `2f6ae43` | AI-MKT-1c | Offline orchestration PASS | Live before 1.1 |
| 3e | **AI-MKT-1e** | Guarded merchant research UX | **CLOSED/PUSHED** @ `59ff8b0` | AI-MKT-1d | Offline UX + fixture browser PASS | Live before 1.1 |
| 3f | **AI-MKT-1f** | Adversarial evaluation & offline acceptance | **`LOCAL_COMPLETE`** | AI-MKT-1e | Offline eval PASS (168/168) | Live before 1.1 |
| 4 | AI-MKT-1.1 | Credits / cost control | **PLANNED** | Billing primitives | Idempotent reserve/settle | Silent spend |
| 5 | AI-MKT-2 | Zero-sales detective | **PLANNED** | AI-INV-1.1; optional AI-MKT-1 | Hypotheses labeled | Confirmed causes |
| 6 | **COMP-1** | Competitor & customer voice | **PROPOSED** | AI-MKT-0/1 | No invented competitor sales | Scraping without rights |
| 7 | AI-MKT-3 | Opportunity advisor | **PLANNED** | AI-MKT-1 | Comparison quality gates | Auto-buy |
| 8 | **CREATIVE-0** | Ads/creative data feasibility | **PROPOSED** | Licensing | Feasibility doc | Live ad APIs |
| 9 | **CREATIVE-1** | Owned campaign performance | **PROPOSED** | CREATIVE-0 | Metrics only from APIs | Invented ROAS |
| 10 | **CREATIVE-2** | Creative experiments | **PROPOSED** | CREATIVE-1; LOOP patterns | Merchant-approved tests | Uncontrolled spend |
| 11 | AI-MKT-4 | Outcome / buying intelligence | **PLANNED** | M7/supplier where actions | No auto-buy | Autonomous purchasing |
| 12 | **LOOP-1** | Decision/outcome learning | **PROPOSED** | AI-ARCH-0; outcomes plumbing | Tenant-private learning | Cross-merchant training |

**Preserved IDs:** AI-MKT-0/1/1.1/2/3/4 · AI-INV-1.1 CLOSED @ `38f63d6` · COMP-1 · CREATIVE-0…2 · LOOP-1.
**Feature gates:** connector activation, JWT, workers, live model, paid credits remain separately authorized.


---

## 2. Merchant pain → capability map

For each pain: merchant question → trusted inputs → current capability → future AI enhancement → safe decision/action → dependency → measurable pilot outcome (hypothesis).

| # | Merchant pain | Merchant question | Trusted inputs | Current capability (2026-11-20) | Future AI enhancement | Safe decision / action | Dependency | Measurable pilot outcome (hypothesis) |
|---|---|---|---|---|---|---|---|---|
| P1 | Lost sales from stockouts | What is at risk of running out soon? | Available qty, velocity, cover days, freshness, planning days | Local M5 metrics + UX-INV attention (OOS / low cover); no live stockout prevention claim | AI-INV-1/4: explain cover + uncertainty; later alerts | Review SKU; refresh data; set planning; **not** auto-buy | Trusted metrics; later M6 eligibility + consent | Time-to-identify at-risk SKUs; merchant-rated usefulness |
| P2 | Excess / slow-moving stock tying up cash | Where is cash trapped in inventory? | Cover days, cost provenance (when trusted), velocity | High-cover **review** heuristics only — **no** $ cash claims | AI-INV-5: cash exposure only with trusted cost | Review / REDUCE / PROMOTE candidates after M7 gates | Trusted unit cost; M7 create authorization | Pilot cash-release anecdotes with measured baseline |
| P3 | Unclear what to reorder and when | What should I buy next, and why that qty? | SS/ROP/target, lead/safety/review, incoming evidence | Thresholds + replenishment UX; ROQ/incoming fail-closed when unknown | AI-INV-1 then AI-INV-6: explain REORDER evidence | Merchant Approve/Edit/Dismiss after M7 | M7.2/M7.3 + PB1 fencing | Accept/edit/dismiss rates; qty edit frequency |
| P4 | Unreliable forecasts / unexplained quantities | Why this forecast or target? | Eligible history, algorithm version, confidence class | M6 foundations + synthetic explain; production forecast **Blocked** | AI-INV-4: explain validated published forecasts only | Use forecast for decisions only when eligible | PE1.b.6b + M6 production gates | Explanation trust survey; no invented accuracy claims |
| P5 | Supplier LT / MOQ / landed-cost uncertainty | Which supplier option is safer/cheaper under my constraints? | Quotes, MOQ, pack, stated LT, landed-cost inputs | Tables + stated LT inputs; no reliability score claims | AI-INV-5: compare grounded quotes; RFQ draft assist | Merchant-approved RFQ draft only — no auto-outreach | Supplier Intelligence V1; trusted quotes | RFQ draft usefulness; time-to-compare options |
| P6 | Disconnected sales, inventory, PO records | Is my picture complete and consistent? | Sync health, quarantine, freshness, multi-store scope | CSV local accepted; Shopify RO offline; SyncRun live **Blocked** | AI-INV-2/3: data readiness + scoped retrieval | Fix import/sync gaps; attest incoming | RO.3 live cert → OAuth → SyncRun | Sync completeness audits; re-import burden ↓ |
| P7 | Time-consuming manual reviews | What deserves attention first today? | Attention ranking from trusted metrics | UX-INV-1a–1c.1 attention + SKU inspector | AI-INV-1 contextual Q&A; later Decision Inbox | Prioritized review queue (read-only until M7) | UX polish; grounded AI | Task-time vs readiness-first UI |
| P8 | Multi-store / warehouse + poor freshness | Which location is stale or incomplete? | Store/location scope, observation dates, sync as-of | Explicit store/location UX; multi-store owner acceptance **pending** | AI-INV-2 freshness gaps by scope | Scope-correct refresh / import | Multi-store acceptance; SyncRun | Freshness SLA incidents; scope error rate |
| P9 | Difficulty deciding what matters first | Why this SKU over that one? | Priority/attention signals, evidence reasons | Attention filters + inspector; no fake M7 queue | AI-INV-6 priority rationale after authorization | WATCH vs act with evidence | M7 + AI grounding | Priority agreement with merchant judgment |

**Non-claims:** No measured stockout prevention, savings, or 1,000-customer traction from this map.

---

## 3. Workstream AI-INV

> **Status legend (2026-11-20 post-closure):** AI-INV-1 / 1.1 = **CLOSED/PUSHED** (offline; soft-enable OFF). AI-INV-2…6 = **PLANNED**. AI-MKT-0…4 = **PLANNED**.

### Shared AI safety law (all gates)

- AI **never invents** inventory, sales, profit, stockout dates, ROQ, supplier facts, or financial savings.
- **Deterministic engines** remain numeric authority; AI explains, retrieves scoped evidence, summarizes, and assists.
- Required controls: **server-side model router**, schema validation, tenant isolation, audit + cost budgets, prompt-injection defense, grounded abstention.
- Demo / synthetic labels must remain honest until production gates pass.
- This roadmap does **not** authorize live model providers, M6/M7 activation, or purchasing.

### AI-INV-1 — Grounded Inventory Explainer

| Field | Content |
|---|---|
| Scope | Read-only SKU Q&A over verified facts (qty, dates, cover, thresholds, freshness, planning assumptions) with citations and abstention |
| Dependencies | Trusted M5 reads (CSV/local path sufficient for offline/mock); UX-INV surfaces; **not** live Shopify required for first offline slice |
| Architecture | Server-side router → retrieval over org-scoped evidence DTOs → schema-validated answer → abstain if unverified |
| UX | Contextual questions beside SKU inspector / Overview attention — **not** empty generic chatbot |
| Evaluation | Golden Q&A; hallucination/refusal tests; tenant isolation; cost budget caps |
| Safety | No invented numbers; refuse when evidence missing/stale; no commercial action verbs as authorization |
| Cost controls | Per-org daily token budget; cache identical fact answers; short context windows |
| Exit criteria | Offline/mock-backed PASS suite; merchant honesty review; no M6/M7 unlock |
| Exclusions | Live SyncRun, forecast inventing, REORDER create, purchasing |
| Status | **CLOSED/PUSHED** @ `38f63d6` (AI-INV-1 + AI-INV-1.1 guidance); soft-enable default **OFF**; not live-certified |
| Closure evidence | Focused vitest **32/32 PASS**; typecheck/lint/build PASS; **2** pre-existing lint warnings (`scripts/check-migration-integrity.mjs`) |
| Sequence note | Offline/mock read-only slice shipped **before** live Shopify and **without** activating M6/M7 production |

### AI-INV-1.1 — Contextual guidance upgrade (companion to AI-INV-1)

| Field | Content |
|---|---|
| Scope | Situation-specific merchant guidance (recorded OOS + sales vs in-stock zero sales vs stale/short history) with prioritized 1–3 next steps and untested zero-sales hypotheses |
| Safety | Hypotheses labeled **untested**; never confirmed causes; no invented demand/profit/lost sales/forecasts/buy qty |
| Status | **CLOSED/PUSHED** @ `38f63d6` with AI-INV-1 — soft-enable **OFF**; not live-certified |

### AI-INV-2 — Data Readiness Assistant

| Field | Content |
|---|---|
| Scope | Explain missing evidence, sync gaps, quarantine reasons, next recovery steps |
| Dependencies | Sync health / quarantine UX; CSV + future Shopify SyncRun signals |
| Architecture | Rule-first readiness graph + AI narrative over structured gap codes |
| UX | “Why can’t we decide yet?” panels; guided next safe step |
| Evaluation | Gap-code fidelity; no fabricated sync complete |
| Safety | Fail closed; never claim SyncRun complete without nested-completeness proof |
| Cost controls | Prefer templates for known codes; LLM only for multi-gap synthesis |
| Exit criteria | Correct next-step suggestions on fixture + pilot gap set |
| Exclusions | Auto-healing writes; credential bypass |
| Status | **PLANNED** |

### AI-INV-3 — Connected Business Context

| Field | Content |
|---|---|
| Scope | Authorized Shopify (then other) orders/inventory/locations; scoped retrieval |
| Dependencies | OAuth least-privilege; SyncRun; nested live completeness; tenant isolation |
| Architecture | Connector-scoped retrieval indexes; no cross-org leakage |
| UX | “From your connected store” citations with as-of |
| Evaluation | Scope ACL tests; injection via product titles/notes |
| Safety | PE1.b.6b / RLS gates; prompt-injection defense on merchant content |
| Cost controls | Bound retrieval pages; deny unbounded catalog dumps to model |
| Exit criteria | Scoped retrieval PASS on authorized read-only sync |
| Exclusions | Write-back; auto-PO; unscoped web browse |
| Status | **PLANNED** |

### AI-INV-4 — Forecast & Scenario Intelligence

| Field | Content |
|---|---|
| Scope | Explain validated published forecasts; deterministic scenario math; evidence-based uncertainty |
| Dependencies | M6 production eligibility; PE1.b.6b; published forecast reads |
| Architecture | AI narrates engine outputs + scenario inputs merchants control |
| UX | Forecast rationale panel; human-controlled what-if (sandbox ≠ production truth) |
| Evaluation | No numeric drift vs engine; scenario math golden tests |
| Safety | AI never computes demand; fixture diagnostics ≠ merchant quality |
| Cost controls | Scenario runs server-side deterministic; AI summarizes deltas only |
| Exit criteria | Eligible orgs only; monitoring + rollback |
| Exclusions | Opaque ML as V1 truth; auto-tuning production assumptions |
| Status | **PLANNED** |

### AI-INV-5 — Cash & Supplier Advisor

| Field | Content |
|---|---|
| Scope | Trusted cost/MOQ/quote/lead-time comparisons; merchant-approved RFQ drafts |
| Dependencies | Supplier Intelligence V1; trusted cost provenance; REORDER evidence quality |
| Architecture | Comparison tables from merchant-provided quotes; AI drafts language only |
| UX | Option A/B compare; RFQ draft review before any send |
| Evaluation | No invented landed cost; draft contains only grounded fields |
| Safety | No auto-outreach, payment, or buy; reliability scores only with measured PO outcomes |
| Cost controls | Draft templates; LLM polish optional |
| Exit criteria | Pilot RFQ usefulness without unauthorized sends |
| Exclusions | Autonomous supplier contact; unverified savings claims |
| Status | **PLANNED** |

### AI-INV-6 — Decision Agent

| Field | Content |
|---|---|
| Scope | REORDER/REDUCE/PROMOTE/WATCH explanations + merchant review |
| Dependencies | **Only after** M6/M7 activation gates + PB1 fencing + hosted security where required |
| Architecture | Bind to immutable decision evidence snapshots; AI explains, never creates authority |
| UX | Decision Inbox: priority, evidence, impact only where grounded; Approve/Edit/Dismiss |
| Evaluation | Explanation groundedness; no action without human where required |
| Safety | Production create separate from explain; hard-false until authorized |
| Cost controls | Per-decision explanation budget; reuse brief sections |
| Exit criteria | Authorized create + explanation + lifecycle PASS on pilot org |
| Exclusions | Auto-buy; silent approval; invented impact $ |
| Status | **PLANNED** |

### Workstream AI-MKT — Credit-based AI Market Intelligence Advisor (**ALL PLANNED**)

**Thesis:** Optional, merchant-confirmed external market research sits **outside** free internal inventory Q&A. Credits apply only to authorized external research. LLM web search ≠ verified transaction sales.

**Future provider-independent interfaces (architecture only — NOT live):**

| Interface | Role |
|---|---|
| OpenAI Responses + `web_search` tool | Sourced web retrieval behind a StoreAgent research adapter |
| Gemini Search grounding | Alternate grounded-search adapter with the same evidence contract |

Adapters must normalize to one research evidence DTO; product code never binds to a single vendor SDK in V1 design.

#### Research evidence contract (required fields)

| Field | Requirement |
|---|---|
| Source | URL + provider id |
| Time | Retrieval date + underlying observation period |
| Scope | Country / currency / category / product / variant |
| Claim class | `observed_fact` \| `estimate` \| `hypothesis` |
| Signal class | Search interest ≠ advertising popularity ≠ sales ranking ≠ **actual units sold** |
| Quality | Comparison quality, limitations, permitted usage |
| Fail-closed | Explicit `unknown` / `insufficient_evidence` when sources do not support a claim |

**Never:** equate web search with verified sales; invent trend/market-share; skip licensed-source / consent gates where required.

#### Credit model (proposed)

| Class | Billing |
|---|---|
| Internal grounded Q&A (AI-INV-1.x) | Included in product — no external research credits |
| Optional external market research | Merchant confirmation → idempotent credit **reservation** → settlement / refund on failure |

Controls: per-org caps, cache identical research keys, clear confirmation UX, no silent spend.

| Id | Scope | Status | Dependencies |
|---|---|---|---|
| **AI-MKT-0** | Research/data rights & country/category feasibility | **CLOSED/PUSHED** @ `de01686` | See `docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md`; unresolved LEGAL items remain |
| **AI-MKT-1a** | Research contracts, source registry & rights enforcement | **CLOSED/PUSHED** @ `f685c15` | `lib/market-research/` + `docs/AI_MKT_1A_IMPLEMENTATION_REPORT.md`; offline GO / live NO-GO |
| **AI-MKT-1b** | Offline provider adapters & research fixtures | **CLOSED/PUSHED** @ `211d8e9` | `lib/market-research/adapters/` + `docs/AI_MKT_1B_IMPLEMENTATION_REPORT.md`; offline GO / live NO-GO |
| **AI-MKT-1c** | Evidence normalization & product/geographic matching | **CLOSED/PUSHED** @ `553e239` | `lib/market-research/normalize/` + `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md`; offline GO / live NO-GO |
| **AI-MKT-1d** | Bounded research orchestration & claim validation | **CLOSED/PUSHED** @ `2f6ae43` | `lib/market-research/orchestration/` + `docs/AI_MKT_1D_IMPLEMENTATION_REPORT.md`; offline GO / live NO-GO |
| **AI-MKT-1e** | Guarded merchant research UX | **CLOSED/PUSHED** @ `59ff8b0` | SKU inspector panel + guarded action + `docs/AI_MKT_1E_IMPLEMENTATION_REPORT.md`; offline GO / live NO-GO |
| **AI-MKT-1f** | Adversarial evaluation & offline acceptance | **`LOCAL_COMPLETE`** | Fixture/runner/Vitest + `docs/AI_MKT_1F_IMPLEMENTATION_REPORT.md`; offline GO / live NO-GO |
| **AI-MKT-1** (umbrella) | On-demand sourced SKU/country market research | **IN PROGRESS** (1a–1f offline) | Offline path: 1a → 1b → 1c → 1d → 1e → 1f; evidence contract; no paid calls before 1.1 |
| **AI-MKT-1.1** | Credit ledger, cost caps, cache, billing controls | **PLANNED** | Billing primitives; idempotent reserve/settle |
| **AI-MKT-2** | Zero-Sales Detective: internal analytics + market hypotheses | **PLANNED** | AI-INV-1.1 situations; AI-MKT-1 for optional external |
| **AI-MKT-3** | Country/Product/Color/Variant Opportunity Advisor | **PLANNED** | AI-MKT-1 + comparison quality gates |
| **AI-MKT-4** | Controlled experiments, outcome tracking, supplier/cash scenarios | **PLANNED** | M7/supplier gates where actions apply; no auto-buy |

**Exclusions until separately authorized:** live web/AI calls, paid tool spend, billing execution, schema/migrations for credits, OAuth/SyncRun, workers, hosted JWT unlock, M6/M7 activation.

---

## 4. Premium merchant UX / homepage roadmap

**Canonical UX-INV delivery:** `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md`
**Design bar:** `docs/DESIGN_SYSTEM.md`
Distinguish **CURRENT UI** (shipped local) vs **FUTURE** mockups/features. No fabricated metrics, AI recommendations, or active buying buttons.

### 4.1 Marketing hero (FUTURE implementation; content can be designed now)

| Element | Requirement |
|---|---|
| Problem | Stockouts, cash in slow stock, spreadsheet uncertainty |
| Value | Evidence-backed inventory decisions with merchant control |
| Target | SMB/mid-market replenishment operators (hypothesis ICP) |
| Differentiation | Provider-independent Decision Copilot; deterministic truth + grounded AI explain |
| CTA | Truthful only (e.g. early access / product preview) — match onboarding reality |
| Visual | Problem vs Solution: pain → evidence-backed decision workspace; full-bleed product atmosphere; no fake KPI stickers |

**Landing claim fence:** See November plan / status ledger — do not claim live AI purchase recommendations, Shopify sync, or stockout prevention guarantees.

### 4.2 Merchant surfaces

| Surface | CURRENT (2026-11-20) | FUTURE |
|---|---|---|
| Overview | Attention-first “what needs review”; honesty fences; no M7 queue (UX-INV-1a) | Richer prioritization; optional grounded explainer |
| Inventory | Stock≠cover≠eligibility; SKU Intelligence inspector; replenishment/incoming copy (1b–1c.1); grounded explainer panel (AI-INV-1/1.1 behind soft-enable **OFF**) | Faster filters; live-model enablement only after separate gate |
| AI assistant | Offline grounded explainer **CLOSED/PUSHED** @ `38f63d6` (flag OFF) + synthetic Actions explain (demo) | Live model + market research only after separate gates; never empty generic bot |
| Decision Inbox | Synthetic Actions E3.3-R2 demo | Live inbox after M7 authorization |
| Supplier / cash | Partial inputs | Trusted compare + RFQ drafts (AI-INV-5) |
| Sync health | CSV freshness; Shopify offline only | OAuth SyncRun health + quarantine UX |
| Onboarding | Local CSV path accepted | Guided hosted onboarding + outcome tracking |
| Progressive disclosure | Merchant language + technical evidence on demand | Same law across AI panels |

### 4.3 Acceptance criteria (premium responsive)

- Viewports **320px–ultrawide**; no cramped admin-table hero; no flicker; motion-respectful (`prefers-reduced-motion`).
- Touch ≥44px; status not color-only; skeletons for loads; honest empty/error.
- One job per section; merchant language first; provenance on demand.
- **CURRENT UI** must not show fabricated AI recommendations or active buying CTAs.
- **FUTURE** Decision Inbox shows impact **only where grounded**; Approve/Edit/Dismiss only after authorization.
- Visual quality gate remains aspirational ≥9/10 per design system — **not** claimed achieved for all surfaces.

### 4.4 UX delivery status

| Slice | Status |
|---|---|
| UX-INV-1a Overview | **CLOSED/PUSHED** @ `10d9de6` |
| UX-INV-1b Stock health / attention | **CLOSED/PUSHED** (with 1a lineage; inspector `f1426c4`) |
| UX-INV-1c Replenishment / incoming | **CLOSED/PUSHED** |
| UX-INV-1c.1 Clarification pass | **CLOSED/PUSHED** @ `0402564` (latest UX) |
| UX-INV-1d Merchant-first task→action→result + premium responsive polish | **PLANNED** (DOC-TRACK-1; not implementation permission) |
| Marketing hero implementation | **PLANNED** — time to demonstrable shipped capabilities |
| Browser/merchant viewport certification | **BLOCKED** for automation without authorized session |

---

## 5. Dependency-aware sequence (proposed 90-day order — not guaranteed)

| Step | Work | Parallelizable? | Blocked by | Owner approval | Test / exit gate | Deliverable |
|---|---|---|---|---|---|---|
| 0 | **RO.3 + AI-INV-1/1.1 Git closure** | — | — | **DONE** @ `4f6ef0c` / `38f63d6` | Offline mocks / focused **32/32**; live cert **FALSE**; soft-enable **OFF** | Pushed — still not live Shopify / live model |
| 0b | **CONN-0A…1c-β + CONN-MP-0** | — | — | **DONE** through `173a357` / `1e18029` | PARTIAL offline; binding **NOT_YET_VERIFIED**; D13/D14 deferred | Not hosted vault / OAuth / SyncRun |
| 1 | **DOC-TRACK-1 master handoff reconciliation** | — | Owner review of DOC-TRACK-1 | **This pass** | Cross-doc consistency | `STOREAGENT_MASTER_MILESTONE_HANDOFF.md` + pointer updates |
| 2 | **CONN-1d** then binding/KEK/hosted apply → nested **live**-cert / OAuth / SyncRun | Docs/architecture parallel | Owner auth per gate | Required | Live cert flags remain false until PASS; binding verified separately | Security path before live Shopify |
| 3 | **AI-INV-2…6** / **AI-MKT-0 → 1 → 1.1 → 2 → 3 → 4** (sequence preserved) | Partial vs connector if independently gated | Per-slice deps; not M6/M7 unless gated | Separate slice approval | Per-slice exit criteria; no paid credits without AI-MKT-1.1 | Next AI/market slices only when authorized |
| 4 | OAuth / least-privilege credentials + authorized read-only SyncRun | After 2 | RO.3 live cert + security | Required | SyncRun incomplete≠complete; audit | Credential vault + SyncRun v1 |
| 5 | Data Health / reconciliation, onboarding, reliability | Partial parallel with 4 | Sync signals | Product | Quarantine UX; multi-store | Data Health surface |
| 6 | Forecast validation + **M6 production gates** | — | **PE1.b.6b JWT**, workers policy | Required | Eligibility policy + monitoring | Authorized forecast operation (limited) |
| 7 | **M7** decision inbox / create + guarded approvals | After 6 where forecast required; M5-only paths still fenced | Hosted JWT/security; M7.2/M7.3 auth | Required | PB1 fences; create-class approval | Live inbox (pilot) |
| 8 | Cash/supplier intelligence + scenarios + explainable expansion | After trusted costs + REORDER evidence | AI-INV-5 deps | Required | No invented $ | Supplier/cash V1 |
| 9 | Merchant pilot, pricing/trial/billing, observability, support, launch gates | Late | Security + ops + journey | Launch sign-off | Launch checklist | Still **NO-GO** until then |
| 10 | Premium marketing hero timed to shipped capabilities | Content earlier; impl late | Truthful CTA | Marketing + eng | Claim fence audit | Landing refresh |
| 11 | WooCommerce → Amazon SP-API | Demand/feasibility | Shopify reliability | Product | Adapter law | Later connectors |

### Parallel vs blocked (summary)

| Parallelizable now (with separate gates) | Still blocked |
|---|---|
| Docs; UX-INV-1d merchant-first + polish; AI-INV-2…6 / AI-MKT-0…4 design only if approved | CONN-1d without owner auth; hosted vault apply; live Shopify; OAuth/SyncRun; PE1.b.6b JWT J-matrix; workers/cron; M6 production; M7 create; purchasing; live model/search; paid credits; paying launch |

### Preserved security / hosted prerequisites (do not demote)

- Hosted schema **57/57 DEPLOYED_VERIFIED** ≠ ops / activation unlock
- PE1.b.6b JWT **NOT EXECUTED**
- Workers/cron **OFF**
- M7 production create **hard-false**
- E.4 canary leave `queued` dirty=2 / claimed=1
- Local synthetic ≠ production seeds/migrations

---

## 6. DOCX sync plan (non-destructive)

Canonical DOCX: `docs/StoreAgent_Master_Roadmap_Updated_2026-11-10.docx` — §§1–35 historical authority; **§36 DOC-CONTINUITY-6** (status consolidation); **§37 AI Commerce Intelligence Architecture (PROPOSED)** — AI-ARCH-0. Markdown living truth: this file + November plan §0I + living ledger § AI-ARCH-0 + master handoff.

**Do not** rewrite or delete DOCX §§1–36; append-only addenda only. Do not create a competing canonical roadmap.

---

## 7. Owner decisions requested

1. Accept **AI-ARCH-0** architecture framing + milestone IDs (`AI-ARCH-0`, `AI-ARCH-1`) as **PROPOSED**?
2. Keep AI-INV-1.1 **CLOSED** @ `38f63d6` (soft-enable OFF); treat enablement/UX as separate **PROPOSED** slice?
3. Authorize DOC-CONTINUITY-6 + AI-ARCH-0 **docs Git closure** when ready (selective paths only)?
4. Keep PE1.b.6b / workers / M6 prod / M7 create / live Shopify / live model / AI-MKT spend / paying launch **BLOCKED** (recommended YES)?
5. Keep AI-MKT-0…4 **PLANNED**; COMP/CREATIVE/LOOP **PROPOSED**; UX-INV-1d **PLANNED** until separately authorized?
