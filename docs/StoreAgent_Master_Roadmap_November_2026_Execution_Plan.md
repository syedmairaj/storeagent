# StoreAgent.si — November 2026 Execution Plan

**Mode:** Documentation / planning reconciliation only
**As-of current truth:** 2026-11-20 (DOC-2026-11) — supersedes stale HEAD pins in §1 below
**Git HEAD verified (2026-11-20):** `fe29703` — `feat(shopify): align RO.1.2 offline normalizers to Admin API 2026-10`
**Remote:** `main` **aligned with `origin/main`**
**AI + merchant-value roadmap:** `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`
**Authoritative status table:** living ledger § **2026-11-20 — DOC-2026-11 Master Roadmap reconciliation**
**Authority:** Augments the canonical master roadmap DOCX (`docs/StoreAgent_Master_Roadmap_Updated_2026-11-10.docx`). Does **not** destructively rewrite frozen architecture, PE1.b gates, M5–M7 contracts, or historical ledger evidence.
**DOCX synchronization:** **PENDING** — propose non-destructive **Section 36+** addendum pointing here + AI-INV doc + ledger § 2026-11-20. Do not rewrite/delete DOCX body in docs-only passes.

---

## 0A. 2026-11-20 reconciliation addendum (DOC-2026-11)

> Historical §1 / Part A tables that still say HEAD `7fc8f2a`, “RO.2 push pending”, “RO.1.2 Planned”, or “UX-INV-1c planned” are **preserved as 2026-11-19 snapshots**. Prefer this §0A + the living ledger for current truth.

| Topic | Current state |
|---|---|
| UX-INV-1a–1c.1 | **CLOSED/PUSHED**; latest UX `0402564` |
| Shopify RO.1 / RO.2 / RO.1.2 | **CLOSED/PUSHED** @ `0072a04` / `7fc8f2a` / `fe29703` |
| Shopify-RO.3 | **LOCAL IMPLEMENTED + TESTED** offline (`shopify-ro.3-v1`); **uncommitted**; **not** live-certified; owner Git acceptance **pending** |
| AI-INV-1…6 | Documented as **PLANNED**; AI-INV-1 offline/mock read-only slice is a **proposed** parallel — not authorization |
| PE1.b.6b / workers / M7 / live Shopify / paying launch | **Unchanged BLOCKED / NO-GO** |
| ICP / 1,000 merchants | Hypothesis / aspirational goal — **not** traction claim |

### Proposed next sequence (dependency-aware; not guaranteed)

0. RO.3 owner acceptance + separate Git closure (pending)
1. Documentation reconciliation closure (this pass)
2. Shopify secure connectivity architecture/security + nested live-cert gates
3. AI-INV-1 safe read-only foundation (parallelizable if independently gated)
4. OAuth / SyncRun read-only
5. Data Health / onboarding / reliability
6. Forecast validation + M6 production gates (after JWT where required)
7. M7 inbox/create + guarded approvals (after hosted security gates)
8. Cash/supplier + scenarios
9. Pilot / billing / launch gates
10. Premium marketing hero timed to shipped capabilities
11. WooCommerce → Amazon by demand/feasibility

Full matrix, pain map, and AI gates: `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`.

---

## 0. Executive product direction

StoreAgent.si is a **premium, provider-independent, evidence-backed AI Inventory & Buying Agent** — an **Inventory Decision Copilot**, not a stock tracker, generic ERP, Shopify-only widget, or unsupported autonomous purchasing system.

**Frozen thesis (unchanged):** Data determines reality. Deterministic forecasting and inventory logic calculate decisions. AI explains, prioritizes, and communicates those decisions. Merchants approve actions until automation earns trust.

**Merchant outcomes (PRODUCT GOALS — not delivered/measured claims):**

1. Reduce avoidable stockouts and missed sales.
2. Identify excess stock and cash tied up in inventory.
3. Help merchants understand what deserves attention first.
4. Support better replenishment and supplier decisions.
5. Reduce spreadsheet work and decision uncertainty.
6. Explain every recommendation with trustworthy evidence.
7. Keep merchants in control of consequential actions.

**Product loop (intended):** connect/import → trust checks → inventory metrics → forecast if eligible → evidence-backed REORDER/REDUCE/PROMOTE/WATCH → AI explanation → merchant review → authorized purchasing workflow → outcome learning.

**Paying-customer launch:** **NO-GO** until independent launch acceptance. Local synthetic acceptance ≠ production readiness. Hosted schema ≠ workers/JWT/M7 unlock.

---

## 1. Git and evidence baseline

### Historical snapshot (verified 2026-11-19) — STALE for HEAD

| Commit | Subject | Role (as of 2026-11-19) |
|---|---|---|
| `d73790a` | database drift Phase 1 | Drift gates on `main` |
| `457a516` | inventory CSV/freshness/replenishment UX | Local merchant inventory UX baseline |
| `970bab0` | inventory readiness correction | Ready-state / planning honesty fix |
| `0072a04` | Shopify RO.1 offline normalizers | On `origin/main` |
| `7fc8f2a` | Shopify RO.2 read-only Admin GraphQL transport | Then HEAD; then push pending |

**Local RO.2 unit evidence (2026-11-19 session):** `tests/unit/provider-shopify-transport.test.ts` — **17/17 PASS** (mock HTTP only; no live Shopify).

### Current extension (verified 2026-11-20)

| Commit / state | Subject | Role |
|---|---|---|
| `10d9de6` | Overview merchant stock attention | UX-INV-1a |
| `f1426c4` | SKU intelligence inspector | UX-INV-1b lineage |
| `0402564` | Replenishment/incoming clarification | UX-INV-1c.1 (latest UX) |
| `fe29703` | RO.1.2 Admin API 2026-10 normalizers | **HEAD**; **on origin** |
| Uncommitted RO.3 | `shopify-ro.3-v1` nested pagination | LOCAL IMPLEMENTED + TESTED offline; Git pending |

**Offline test evidence (2026-11-20):** owner-reported **13** RO.3 + **78** Shopify + **63** CSV/provider PASS under mocks — **no** live Shopify.

**Preserved snapstore/Main local acceptance (2026-11-18, synthetic only):**

| Evidence | Result |
|---|---|
| Positions / snapshots | 20 current / 60 snapshots |
| Orders / items | 25 / 25 |
| Current-day metrics | 20/20 |
| Planning days | lead 7 / safety 5 / review 7 |
| Thresholds | 20/20 SS/ROP/Target |
| Demand split | 12 positive-demand; 8 known-zero-demand; 0 unknown v30 |
| Incoming / actions | incoming unknown 20/20; `inventory_actions=0` |

**Dirty tree preserved:** modified `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`; deleted tracked `docs/StoreAgent_Roadmap_2026.docx` (archive copies exist); uncommitted RO.3 code/fixtures/docs hunks; untracked SQL snippets, archives, AGENTS.md, vitest cache, etc.

---

## 2. Part A — Reconciled engineering status matrix

Classification keys used below:

- **Implemented in code**
- **Tested locally**
- **Local E2E accepted**
- **Hosted schema applied**
- **Hosted runtime/security verified**
- **Live merchant validated**
- **Blocked**
- **Planned**

A workstream may hold multiple labels. Schema ≠ operation. Synthetic ≠ merchant.

| Workstream | Implemented | Tested locally | Local E2E accepted | Hosted schema | Hosted runtime/security | Live merchant | Blocked / Planned |
|---|---|---|---|---|---|---|---|
| M0–M4 foundations + commerce domain | Yes | Yes | Partial (CSV paths) | Partial historical | Partial RLS history | No | Hosted full onboarding **Planned** |
| CSV inventory + sales imports | Yes | Yes | **Yes** (snapstore 2026-11-18) | Schema present | Not merchant-proven | No | Hosted onboarding **Planned** |
| M5.1–M5.7 metrics / orchestration / adversarial | Yes | Yes (local adversarial closed) | Metrics+thresholds on snapstore | Canary/schema subsets + F1/T4 | Workers/cron/HTTP **OFF**; E.4 canary support only | No | M5.8 open; hosted worker/rollover HTTP **Blocked** |
| M5.8 closeout | Docs gate open | — | — | — | — | — | **Planned** (non-blocking for M6 eng) |
| M6 P1–P4d forecast foundations | Yes | Yes | Fixture/diagnostic | **CLOSED** through `20261030200000` | Production persist/publish/eval **not** approved; rows historically 0 | No | Production forecast operation **Blocked** |
| PE1.b.4a/4b synthetic lifecycle | Docs + code | Offline Env-A **PASS** | Disposable local | N/A | N/A | No | ≠ JWT |
| PE1.b.5 gap audit | Docs | — | — | Catalog cited | JWT **UNPROVEN** | No | PE1.c **NO-GO** |
| PE1.b.6a JWT preflight | Docs @ `7d42247` | — | — | Plan only | — | No | Execution needs A1–A4+A6 |
| PE1.b.6b JWT isolation | Worksheet + evidence shells | — | — | — | **NOT EXECUTED** (J1–J13 empty) | No | **Blocked** (A2 YES; A3 proposed; A1/A4/A6 open) |
| M7 engine + synthetic Actions / Decision Brief | Yes (demo path) | Units + Actions E2E (R2.e functional) | Synthetic demo only | S1–S14 in 38→52 | Production create reject preserved | No | Merchant activation / create success **Blocked** |
| M7 PB1 diagnostics / evidence fencing | Yes (dormant fences) | Local adversarial suites | — | Hosted via 38→52 | Production create **hard-false** | No | Commercial binding **Blocked** |
| Hosted 38→52 migration integrity | Disk 52 | Disposable rehearse reported | — | **CLOSED 52/52** fingerprint MATCH | Grant fixes S4–S6 PASS | No | Ops activation **not** authorized |
| DB drift prevention Phase 1 | Yes (`d73790a`) | `check:migrations` + 8/8 unit PASS | — | Dry-run owner-reported up to date | Actions run **unverified**; RLS equivalence **unproven** | No | Disposable replay **Planned**; JWT still blocked |
| Inventory intelligence workspace + replenishment UX | Yes (`457a516`+`970bab0`) | Units + snapstore acceptance | Local synthetic **COMPLETE** | — | — | No | Hosted onboarding unproven |
| Overview/Inventory UX-INV-1a–1c.1 | Yes (`10d9de6`…`0402564`) | Units + local UI | Local UI accepted | — | — | No | UX-INV-1d **Planned**; browser automation cert **Blocked** |
| AI-INV-1…6 grounded intelligence | Docs only | — | — | — | — | No | All **PLANNED** — see AI roadmap |
| Shopify M0.7 boundary freezes | Yes (docs/contracts) | Architecture tests | — | N/A | N/A | No | Continues as adapter law |
| Shopify RO.1 offline normalizers | Yes (`0072a04`) **CLOSED/PUSHED** | Unit normalization suites | Offline fixtures only | N/A | No live shop | No | Live cert **Blocked** |
| Shopify RO.2 transport | Yes (`7fc8f2a`) **CLOSED/PUSHED** | Transport unit PASS (suite grown since 17/17) | No live E2E | N/A | No live shop; no OAuth | No | Nested live completeness **Blocked** for SyncRun; OAuth/SyncRun **Planned** |
| Shopify RO.1.2 schema compatibility | Yes (`fe29703`) **CLOSED/PUSHED** | RO.1.2 unit suites | Offline fixtures | N/A | No live shop | No | Live shop **Blocked** |
| Shopify RO.3 nested pagination | Yes local `shopify-ro.3-v1` (**uncommitted**) | Offline mock **TESTED** (13+) | No live E2E | N/A | Live nested cert **false** | No | **Git closure pending**; SyncRun complete **Blocked**; OAuth **Planned** |
| OAuth / SyncRun / quarantine UX | Partial design in docs | — | — | — | — | No | **Planned / Blocked** on live nested completeness |
| WooCommerce / Amazon | Architecture reserved | — | — | — | — | No | **Planned** after Shopify |
| Supplier intelligence | Product scope + tables/lead-time inputs | Partial | — | Partial schema | — | No | Quotes/landed cost/RFQ **Planned**; no auto-outreach |
| Onboarding / billing / trial / observability / launch | Partial docs/code | — | — | — | — | No | Paying launch **NO-GO** / **Planned** |

### Explicit non-claims

- No live merchant outcomes, savings, or prevented stockouts.
- No hosted JWT isolation PASS.
- No workers/cron/HTTP metric or forecast enablement.
- No M7 production create / Approve / purchasing.
- No Shopify live connection.
- RO.2 tests prove transport contract under mocks — not catalog completeness or SyncRun readiness.

---

## 3. Part B — Merchant experience overhaul (milestone UX-INV-1)

**Canonical delivery spec:** `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md`
**Related (do not duplicate):** Actions E3.3-R2 (`docs/E3_3_R2_*`), M7.4a decision-first contract, competitive UX roadmap.

### Observed contradictions (browser/source review; docs only)

| Issue | Evidence locus | Product risk |
|---|---|---|
| Overview H1 “Imported inventory is available.” | `app/(app)/app/[organizationId]/page.tsx` | Operational, not decision-oriented |
| Current State claims sales/planning still missing when inventory present | Same page hardcoded copy | False negative after snapstore planning PASS |
| “Tenant boundary active” as primary card | Overview aside | Developer trust signal over merchant attention |
| “Known cover” + green check conflates calculability with healthy stock | `inventory-intelligence-workspace.tsx` `statusLabel("valid")` | Zero/low stock can look “good” |
| Long table + repeated limited-history chips | Inventory workspace | Visual noise; weak prioritization |
| “Zero demand” reads definitive | Cover classifiers + labels | Sparse history may be insufficient signal |
| Incoming attestation / replenishment assumptions under-explained | Inventory readiness + settings UX | Merchants cannot interpret impact safely |
| Technical readiness prioritized over urgent stock problems | Filters / ranking | Misses “what needs attention first” |

### Intended UX outcomes (UI-only later; engines unchanged)

1. **Decision-first Overview** — urgent stock signals from accepted metrics, attention summary, freshness, next safe step; no fake M7 queue.
2. **Inventory intelligence workspace** — attention filters, SKU evidence, thresholds, cover vs risk semantics.
3. **Separate data availability from stock health.**
4. **Honest limitation labels** — no invented confidence, cost, or savings.
5. **Guided PO incoming evidence** with fail-closed completeness (later slice; safe rules only).
6. **Clear org/store/location + source freshness.**
7. **Responsive** mobile / tablet / desktop / ultrawide.
8. **Premium hierarchy** — spacing, motion, skeletons; not cramped admin chrome.
9. **Merchant language** with progressive disclosure of technical evidence.
10. **Keep existing safe server actions and calculations unchanged.**

**Hard fence:** Read-only stock signals may surface from accepted M5 metrics. They must **not** masquerade as authorized M7 REORDER/REDUCE/PROMOTE/WATCH production actions.

---

## 4. Part C — Differentiating capabilities audit

Legend: **Existing** / **Partial** / **Proposed** / **Gated**

### P0 — Stock Intelligence

| Capability | Class | Notes |
|---|---|---|
| Velocity, days-of-stock, SS/ROP/target formulas | Existing | Local snapstore verified |
| Cover classifiers (zero vs unknown vs short history vs stale) | Existing | Semantics exist; merchant labels need honesty pass |
| Stockout / low-cover / overstock **attention** UX | Partial → Proposed polish | Ranking exists; health vs availability conflated |
| Threshold proximity UX | Partial | Thresholds computed; merchant interpretation weak |
| Evidence freshness labels | Partial | Present; Overview contradicts when planning complete |
| Trend / available stock SKU surface | Partial | Inventory workspace; prioritize attention |
| Fake production decision queue | **Forbidden** | Gated behind M7 |

### P0 — Commerce Connectivity

| Capability | Class | Notes |
|---|---|---|
| Provider-neutral adapters + CSV | Existing | Product sequence CSV → Shopify → Woo → Amazon |
| Shopify RO.1 normalizers | Existing (offline) | Fixture API version **not** live-certified |
| Shopify RO.2 transport | Existing (local code+tests); push pending | Nested bounds incompleteness hard gate |
| RO.1.2 schema compatibility | Proposed / next | Order-line location, shop currency, status enums, inventoryItem.variants |
| Nested pagination completeness | Gated | Required before SyncRun “complete” |
| OAuth + least-privilege credentials | Planned / Gated | Separate milestone |
| Location-scoped SyncRun, backfill, incremental, dedupe, quarantine UX | Planned | After RO.1.2 + nested pagination |
| WooCommerce / Amazon | Planned | Later |

### P1 — Decision Intelligence

| Capability | Class | Notes |
|---|---|---|
| Engine REORDER/REDUCE/PROMOTE/WATCH | Existing (engine) | Production create **Gated** |
| Synthetic Actions + Decision Brief | Existing (demo) | `productionApprovalEligible=false` |
| Merchant decision inbox (live) | Gated | Needs M7 create authorization |
| Approve/Edit/Dismiss | Contract Existing; live **Gated** | M7.3 separate |
| Stale evidence revalidation | Partial contracts / Gated writers | PB1 fencing foundations |
| Grounded “why this / why now / why qty” | Partial (demo) | Live **Gated** |

### P1 — Cash Intelligence

| Capability | Class | Notes |
|---|---|---|
| Excess capital / stockout $ exposure | Proposed | Only with trusted costs; no invented precision |
| Buying budget / cash required | Proposed | Depends on supplier quotes + ROQ |
| Margin / opportunity / what-if | Proposed (P2 adjacency) | Sandbox scenarios later |

### P1/P2 — Supplier Intelligence

| Capability | Class | Notes |
|---|---|---|
| Supplier tables / stated lead time | Partial | See `docs/FUTURE_ROADMAP.md` |
| Quotes, MOQ, pack, landed cost, RFQ drafts | Planned | No auto outreach/buy/pay |
| Preferred/backup comparison | Planned | After trusted REORDER evidence |

### P2 — Grounded AI Agent

| Capability | Class | Notes |
|---|---|---|
| Synthetic AI explanation adapter | Existing (gated soft-enable) | Demo only |
| Explain deterministic evidence / weekly brief | Proposed | Fail-closed; AI ≠ numeric truth |
| Outcome learning | Proposed | Measured only |

### P2 — Merchant value / retention

| Capability | Class | Notes |
|---|---|---|
| Guided onboarding / time-to-first-insight | Partial → Proposed | CSV path local; hosted unproven |
| Consent-based alerts | Planned | Workers gated |
| Billing / trial / support / rollback | Planned | 7-day trial product-locked; launch NO-GO |

---

## 5. Part D — Market and positioning

**Position:** Inventory Decision Copilot / AI Inventory & Buying Agent.
**Customer:** SMB/mid-market owner-buyer-ops (≈200–5,000 SKUs; regular replenishment; spreadsheet pain).
**Not:** stock tracker, ERP, WMS, chatbot, Shopify-only app, autonomous buyer.

### Competitive note (dated; source-backed hypotheses)

Primary public source already captured (2026-11 competitive UX doc): Prediko Shopify App Store reviews (individual merchant reports — **hypotheses**, not universal truths). Direct peers for matrix framing: Prediko, Inventory Planner, Fabrikatör, Assisty, and adjacent replenishment planners.

**Rule:** Do **not** claim StoreAgent beats competitors, saves money, or prevents stockouts without pilot merchant evidence.

### Differentiation matrix

| Merchant pain | Competitor baseline (hypothesis) | StoreAgent current ability | Desired differentiation | Evidence / dependency | Priority | Validation |
|---|---|---|---|---|---|---|
| Unclear what to do first | Dense dashboards / forecast opacity reports | Local metrics + cover; Overview operational | Decision-first attention + honest unknowns | UX-INV-1; M5 reads only | P0 | Pilot task-time / trust survey |
| Distrust of numbers | “Weird metrics” review themes | Fail-closed null≠0; reason codes | Provenance + freshness + limitation labels | Existing classifiers + copy pass | P0 | Confusion tests on Inventory |
| Integration friction | Shopify-first apps praised when sync works | CSV accepted locally; Shopify RO.1/RO.2 offline | Reliable read-only Shopify SyncRun + quarantine UX | RO.1.2, nested pagination, OAuth | P0 | Sync completeness audits |
| Opaque AI / spam | Intrusive AI/comms complaints | Synthetic gated AI explain | Opt-in grounded explain; no spam growth | E3.3 validators; post-live AI | P2 | Explanation usefulness + opt-in rates |
| Replenishment uncertainty | Strong when PO workflows clear | Thresholds + planning inputs; M7 gated | Evidence-backed REORDER with human Approve | M7 create + lifecycle gates | P1 | Decision accept/edit/dismiss rates |
| Cash tied in excess | Often secondary analytics | Cover days exist; $ exposure absent | Excess capital only with trusted cost | Cost provenance | P1 | Pilot cash-release anecdotes (measured) |
| Supplier choice complexity | Partial in planners | Future roadmap approved | Landed-cost/MOQ/lead-time compare; no auto-buy | Supplier Intelligence V1 | P2 | RFQ draft usefulness |

### Pilot hypotheses (measurable; not claims)

1. Merchants identify top attention SKUs faster on decision-first Overview/Inventory than on current readiness-first UI.
2. Fail-closed unknown/incoming labeling increases trust vs fabricated completeness.
3. Shopify read-only sync (once complete) reduces spreadsheet re-import burden without write-back risk.
4. Evidence-backed REORDER with Approve/Edit/Dismiss is preferred over opaque auto-PO.

---

## 6. Part E — Phased execution roadmap

### NOW (docs + dependency-ready slices) — updated 2026-11-20

| ID | Merchant problem | Current state | Intended outcome | Scope / non-goals | Dependencies | Security gates | Acceptance | Evidence / release |
|---|---|---|---|---|---|---|---|---|
| DOC-2026-11 | Conflicting status / vision sources | Stale HEAD pins across docs | One authoritative matrix + AI-INV roadmap | Docs only | Git verify `fe29703` | No hosted writes | Owner PASS review | Ledger § 2026-11-20 + AI roadmap |
| DOC-NOV26 | (historical) | Closed into DOC-2026-11 | — | Historical | — | — | 2026-11-19 docs | Keep as history |
| UX-INV-1a–1c.1 | Overview/Inventory confusion | **CLOSED/PUSHED** through `0402564` | Decision-first local UI | No fake M7 queue | M5 reads | No engine/M7 | Local UI + units; browser cert blocked | Delivery doc |
| SHOP-RO2-GIT | RO.2 remote | **DONE** — on origin via later commits | — | — | — | — | Remote contains `7fc8f2a`+ | Historical |
| SHOP-RO1.2 | Schema vs Admin `2026-10` | **CLOSED/PUSHED** @ `fe29703` | Offline compatibility | No OAuth | RO.2 | Fail-closed | Mapping tests | HEAD |
| SHOP-RO3-GIT | Nested pagination offline | Local `shopify-ro.3-v1` uncommitted | Owner accept + Git closure | No live Shopify | RO.1.2 | No JWT/workers | Offline tests PASS; live cert still false | **Pending owner** |
| AI-INV-1 | Unexplained inventory facts | **PLANNED** | Safe read-only explainer | Offline/mock OK; no M6/M7 | M5 reads | Abstention + isolation | Golden Q&A | Proposed parallel |

### NEXT

| ID | Focus | Notes |
|---|---|---|
| SHOP-RO-SAFE | OAuth, least-privilege, credential security, location SyncRun | Blocked on **live** nested-completeness certification (offline RO.3 insufficient) |
| UX-INV-1d | Premium responsive polish | Parallelizable; engines unchanged; no M7 writes |
| DATA-HEALTH | Freshness, multi-store evidence, limitation noise reduction | Honest labels; no invented confidence |
| PE1.b.6b | Hosted JWT A/B isolation | Separately authorized; still BLOCKED |
| AI-INV-2/3 | Data readiness + connected context | After SyncRun signals / OAuth |

### LATER

| ID | Focus | Gate |
|---|---|---|
| M7-INBOX / AI-INV-6 | Commercial decision inbox + decision agent | Explicit M7.2 create-class approval + hosted security |
| AI-INV-4/5 | Forecast/scenario + cash/supplier | M6 eligibility; trusted costs/quotes; no auto-buy |
| M6-VAL | Forecast validation / alerts | Production forecast eligibility + consent |
| WOO-AMZ | WooCommerce / Amazon | After Shopify reliability |
| LAUNCH | Billing/trial/pilot/observability | Independent launch sign-off; still NO-GO now |
| LANDING-HERO | Premium marketing hero | Timed to demonstrable shipped capabilities |

### Parallelism map

| Parallelizable now | Blocked on hosted JWT | Blocked on workers/cron | Blocked on M7 authorization |
|---|---|---|---|
| Docs, UX-INV-1d polish, AI-INV-1 offline/mock (if approved) | PE1.c forecast canary, multi-tenant runtime claims | M5.8 hosted rollover HTTP, alert jobs | Live decision inbox, Approve/Edit/Dismiss, PO drafts |
| RO.3 Git closure (owner) | Hosted security PASS claims | Background sync schedulers | Production REORDER create |
| Landing content design (truthful CTA) | — | — | Live AI purchase claims |

### Next smallest implementation milestone (recommended)

1. **Owner:** accept RO.3 offline + authorize separate Git closure — **not** live Shopify.
2. **Docs:** close DOC-2026-11 review; optional DOCX Section 36+.
3. **Proposed parallel:** AI-INV-1 offline/mock read-only foundation (separate approval).

---

## 7. Premium responsive UX acceptance (summary)

Full detail: `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md` §Acceptance.

Viewports: 320 / 390 / 768 / 1024 / 1280 / 1440(+ ultrawide). Touch targets ≥44px. One primary attention story above the fold. Stock health ≠ calculation availability. Synthetic/demo labeled. No invented ROI. Skeletons for loading. Motion purposeful (2–3 cues), not noise.

---

## 8. Files and sync policy

| Artifact | Role |
|---|---|
| `docs/StoreAgent_Master_Roadmap_Updated_2026-11-10.docx` | Canonical DOCX — **Section 36+ sync PENDING** (point to this file + AI-INV + ledger § 2026-11-20; do not wipe history) |
| This file | November 2026 Markdown planning source |
| `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md` | AI-INV + merchant pain/value + 90-day sequence |
| `docs/IMPLEMENTATION_STATUS.md` | Concise pointer + current status |
| `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md` | Living ledger — authoritative matrix |
| `docs/PROJECT_HANDOFF.md` | Next-session bootstrap |
| `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md` | Overview/Inventory UX delivery |
| `docs/COMPETITIVE_UX_MERCHANT_PAIN_POINT_ROADMAP.md` | Aligned competitive UX (Actions + INV) |
| `docs/PROVIDER_ADAPTERS.md` / `SHOPIFY_RO2_TRANSPORT.md` | Shopify RO.3 law (dirty RO.3 hunks preserved) |

---

## 9. Owner review gate

| Gate | Verdict |
|---|---|
| Documentation reconciliation (DOC-2026-11) | **PASS** (pending owner read) — STOP |
| DOCX non-destructive Section 36+ sync | **BLOCKED / PENDING** |
| RO.3 owner acceptance + Git closure | **PENDING** (local offline only) |
| RO.2 remote publish | **DONE** (historical; on origin) |
| AI-INV-1 offline slice | **PLANNED / proposed** — not authorized by docs alone |
| Application/UI implementation from this plan | **NO-GO** until separate slice approval |
| Workers / JWT / M7 / live Shopify / purchasing | **BLOCKED** unchanged |
