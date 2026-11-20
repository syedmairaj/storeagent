# StoreAgent.si — AI Intelligence & Merchant Value Roadmap

**Document ID:** DOC-2026-11 / AI-INV
**Mode:** Planning & product vision only — **not authorization** to implement, deploy, enable workers, run JWT, connect live Shopify, activate M7, or claim merchant ROI.
**As-of:** 2026-11-20
**Authoritative current status table:** `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md` § **2026-11-20 — DOC-2026-11 Master Roadmap reconciliation**
**Related:** November execution plan · Merchant UX delivery · Competitive UX roadmap · PE1.b.6b handoff · Shopify RO transport docs

---

## 1. Product position (frozen thesis)

StoreAgent.si is a **provider-independent AI Inventory & Buying Agent / Inventory Decision Copilot**.

| It is | It is not |
|---|---|
| Evidence-backed inventory decision workspace | Another inventory spreadsheet |
| Deterministic metrics + forecast + decision engines with AI explanation | A generic chatbot bolted onto stock tables |
| Provider-independent canonical domain (CSV → Shopify → Woo → Amazon) | A Shopify-only widget or ERP replacement |
| Merchant-controlled Approve/Edit/Dismiss for consequential actions | An autonomous purchasing bot |

**Thesis (unchanged):** Data determines reality. Deterministic forecasting and inventory logic calculate decisions. AI explains, prioritizes, retrieves scoped evidence, and assists. Merchants approve actions until automation earns trust.

**Initial ICP (hypothesis to validate — not achieved traction):** SMB / mid-market merchants ≈ **200–5,000 SKUs**, regular replenishment, spreadsheet/ops pain.
**Long-term goal:** **1,000 merchants** — aspirational product goal, **not** current customers, paying launch, or guaranteed market success.

**Paying-customer launch:** **NO-GO** until independent launch acceptance.

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

## 3. Workstream AI-INV (all status: **PLANNED**)

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
| Status | **PLANNED** |
| Sequence note | **Proposed** that AI-INV-1 **may begin** as a safe offline/mock-backed read-only slice **before** live Shopify and **without** activating M6/M7 production — proposed only, **not authorization** |

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
| Inventory | Stock≠cover≠eligibility; SKU Intelligence inspector; replenishment/incoming copy (1b–1c.1) | Faster filters; AI contextual Q&A (AI-INV-1) |
| AI assistant | Synthetic Actions explain only (demo) | Contextual questions with citations; never empty generic bot |
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
| UX-INV-1d Premium polish | **PLANNED** |
| Marketing hero implementation | **PLANNED** — time to demonstrable shipped capabilities |
| Browser/merchant viewport certification | **BLOCKED** for automation without authorized session |

---

## 5. Dependency-aware sequence (proposed 90-day order — not guaranteed)

| Step | Work | Parallelizable? | Blocked by | Owner approval | Test / exit gate | Deliverable |
|---|---|---|---|---|---|---|
| 0 | **RO.3 owner acceptance + separate Git closure** | — | Owner review of offline nested pagination | **Pending** | Reported/local: 13 RO.3 + Shopify suite under mocks; **no** live cert | Commit/PR when authorized — still not live Shopify |
| 1 | **Documentation reconciliation closure** | — | Owner review of DOC-2026-11 | **This pass** | Cross-doc consistency | Markdown + DOCX sync plan |
| 2 | Shopify secure connectivity architecture + security approval + nested **live**-certification gates | Docs/architecture parallel | Live nested completeness; security review | Required | Live cert flags remain false until PASS | Architecture packet; live cert plan |
| 3 | **AI-INV-1** safe read-only foundation | **Yes** vs connector if independently gated | None for offline/mock slice; not M6/M7 | Separate slice approval | Golden Q&A + abstention + isolation | Offline explainer behind flag |
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
| Docs; UX-INV-1d polish; AI-INV-1 offline design/impl if approved; Shopify offline RO.3 Git closure | Live Shopify; OAuth/SyncRun; PE1.b.6b JWT J-matrix; workers/cron; M6 production; M7 create; purchasing; paying launch |

### Preserved security / hosted prerequisites (do not demote)

- Hosted schema **52/52** ≠ ops unlock
- PE1.b.6b JWT **NOT EXECUTED**
- Workers/cron **OFF**
- M7 production create **hard-false**
- E.4 canary leave `queued` dirty=2 / claimed=1
- Local synthetic ≠ production seeds/migrations

---

## 6. DOCX sync plan (non-destructive)

Canonical DOCX: `docs/StoreAgent_Master_Roadmap_Updated_2026-11-10.docx` remains **historical authority**.

**Proposed (owner-authorized later):** Add dated **Section 36+** addendum that points to:

1. This file (AI-INV + merchant value)
2. `docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md`
3. Living ledger § 2026-11-20 reconciliation (single status table)

**Do not** rewrite, delete, or replace DOCX body in the documentation pass that produced this Markdown.

---

## 7. Owner decisions requested

1. Accept DOC-2026-11 documentation reconciliation?
2. Accept RO.3 offline implementation for **separate Git closure** (still not live-certified)?
3. Authorize AI-INV-1 offline/mock read-only slice exploration (proposed sequence only until YES)?
4. Authorize non-destructive DOCX Section 36+ sync?
5. Keep PE1.b.6b / workers / M7 / live Shopify **BLOCKED** (recommended YES)?
