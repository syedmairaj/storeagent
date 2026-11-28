# DOC-LAUNCH-1 — Launch-First Architecture & Commercial Readiness

| Field | Value |
|---|---|
| Document ID | DOC-LAUNCH-1-COMMERCIAL-READINESS-STRATEGY |
| Slice | **DOC-LAUNCH-1** |
| Mode | **DOCS ONLY** — planning / decision record · **not** implementation authorization |
| DoD | **`DOCS_ONLY_COMPLETE`** |
| As-of | 2026-11-28 (Asia/Dubai) — Product Opportunity Intelligence addendum |
| Verified HEAD | `38d63da` — AI-MKT-1f-R1 **CLOSED/PUSHED** |
| Full SHA | `38d63da5e68288fffbc2c78a19fd6ea691db455b` |
| `origin/main` | **Aligned** at `38d63da` (`main...origin/main` · left/right `0 0`) |
| Migrations | **57/57** prior · **DEPLOYED_VERIFIED** · activation **OFF** |
| Principle | *The AI controls the investigation. It does not control what counts as a fact.* |
| Related | `docs/DOC_GLOBAL_1_FOUR_MARKET_LAUNCH_STRATEGY.md` · `docs/AI_MKT_1F_R1_IMPLEMENTATION_REPORT.md` · `docs/BACKGROUND_JOBS.md` · `docs/FUTURE_ROADMAP.md` · `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md` |

---

## 0. Verdict

| Gate | Result |
|---|---|
| Docs-only launch-first commercial readiness strategy | **COMPLETE** (incl. DATA-0 candidates + Product Opportunity Intelligence scope) |
| Runtime / migrations / deps / env / providers / subscriptions / API calls / MCP / live hosted ops / Git | **NOT EXECUTED** (forbidden this slice) |
| Soft-show / live research / paid AI credits / connector activation | **NO-GO** |
| Paying-customer launch | **NO-GO** until independent launch acceptance |
| Authenticated merchant browser / integrated commercial UX | **NOT CERTIFIED** (unchanged) |
| Structured Amazon candidates (DATA-0) | **DataForSEO** + **Pangolinfo** = priority **candidates only** — **not** approved providers |
| Living-priority supersession | **Track A (core revenue)** ahead of speculative Track B AI expansion; prior “GEO-1 next” **superseded** for *implementation priority* only |
| Next eng (owner-gated) | **M7-GAD-1** — Guarded Action & Delivery (buying-plan CSV + reviewable PO drafts) |

**STOP for owner review.** No Git stage/commit/push.

---

## 1. Baseline reconciliation (Git-verified)

| Field | Verified value |
|---|---|
| HEAD / `origin/main` | `38d63da` · `fix(ai-mkt): harden merchant evidence identifiers (1f-R1)` |
| AI-MKT-1f-R1 | **CLOSED/PUSHED** @ `38d63da` (reconciled from prior `LOCAL_COMPLETE` / uncommitted wording) |
| DOC-GLOBAL-1 | **CLOSED/PUSHED** @ `6b16caa` |
| AI-MKT-1f | **CLOSED/PUSHED** @ `e6943ce` |
| AI-MKT-1e…0 / AI-ARCH-1 | Prior CLOSED/PUSHED pins unchanged |
| Prior eval (R1 report) | Matrix **59/59** · SKIP **0**; AI-MKT **176/176**; AI-ARCH **121/121**; AI-INV **27/27** |
| Schema | **57/57** · catalog **23/23** prior · activation **OFF** |
| CONN-1 / V8 JWT / binding / D13/D14 / PE1.b | **UNMET** / **NOT VERIFIED** / **`NOT_YET_VERIFIED`** / **DEFERRED** / **BLOCKED** |
| Protected dirties | Untouched (incl. `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md`, `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, `AGENTS.md`, `.tmp/`, `.vitest/`, SQL/operator/archives, deleted roadmap DOCX) |

### Retained R1 residuals (not closed by this slice)

| Residual | Disposition |
|---|---|
| M03 title overstates tested mismatch axes (fixture probes `country` only) | **Retain** — fix title/coverage in **AI-MKT-GEO-1** or narrow prerequisite |
| Optional `responseCountryCode` / `responseDepth` `undefined` skips those comparison axes | **Retain** — intentional 1e helper behavior; do not weaken |
| Behavioral correlation tests + fail-closed **success-response** handling | **Required** during **AI-MKT-GEO-1** or a narrow prerequisite slice; preserve valid **error-response** contract |

---

## 2. Owner strategy (frozen for living docs)

**Objective:** accelerate first merchant revenue without weakening security, deterministic authority, or evidence governance.

### 2.1 Three roadmap tracks

| Track | Focus | Priority |
|---|---|---|
| **A — Core production readiness** | Shopify (when gated), workers, data health, M6/M7, buying outputs, **subscription billing**, US-led 5–10 merchant pilot | **Primary** — first revenue |
| **B — Premium market intelligence** | AI-MKT GEO/DATA, credits (**AI-MKT-1.1**), advanced research adapters, COMP/CREATIVE/LOOP | **Secondary** — after or parallel *only* when it does not delay Track A |
| **C — Expansion** | Additional connectors, countries, infrastructure scaling | **Deferred** until pilot product proven |

### 2.2 Explicit living-priority supersession

| Prior living authority | Status after DOC-LAUNCH-1 |
|---|---|
| “Exact next eng = **AI-MKT-GEO-1**” (post-R1 / DOC-GLOBAL-1 living pins) | **Superseded for implementation priority.** GEO-1 remains **PROPOSED** on Track B; not the revenue-critical next slice |
| DOC-GLOBAL-1 US/GB/CA/AU geography, KPI≠cap, English-first | **Preserved** |
| AI-MKT-1.1 before **paid external research** | **Preserved** — **does not** block core subscription launch with paid research **disabled** |
| Historical AI-MKT / AI-ARCH / CONN / R1 reports | **Preserved** — do not invent completion evidence |

### 2.3 Additional owner rules (this slice)

1. **Preserve** existing M0.8 worker/job architecture (`docs/BACKGROUND_JOBS.md`). Identify production gaps; **no** duplicate queue architecture or vendor commitment.
2. **Maximum two** initial external research adapters: one general research + one structured **REST** provider. Others deferred. Rights-aware caching only; **no** unauthorized cross-tenant reuse. **No** direct unbounded MCP execution as a research path.
3. **AI-MKT-1.1** required before paid external research — **not** automatically before core SaaS subscription launch with paid research off. All enabled billable features need cost controls. Prefer free evaluation → prepaid/PAYG → low fixed costs.
4. Preserve **US/GB/CA/AU** commercial strategy; English-first; global-ready configuration. **US-led 5–10 merchant pilot**; no US-only hardcoding. Registration targets remain **KPIs, never caps**. Native currency calculations; defer unnecessary FX aggregation. Split **minimum launch geography** from advanced **AI-MKT-GEO-1** scope.
5. Explicit **Guarded Action & Delivery** layer within M7 / PB1 / supplier roadmap: buying-plan CSV, reviewable PO drafts, approval audit; RFQ / alerts / outcome reconciliation **progressively**. Approval **does not** authorize sending, purchasing, payment, or external mutation.
6. Launch acceptance spans trusted data health, onboarding TTV, sync recovery, subscription entitlements, privacy/security, authenticated merchant UX, operational monitoring, support, and product analytics.
7. Governance unchanged: one canonical commerce domain; M5–M7 deterministic engines; Evidence & Accuracy Contract; Commerce Decision Loop; CONN-1/V8/binding/D13/D14/PE1.b/worker/M6/M7 gates; migration baseline; activation **OFF**; protected dirties.

---

## 3. Revised architecture (launch-first)

```text
                    ┌─────────────────────────────────────┐
                    │  Merchant UX (auth) + entitlements  │
                    │  BILL-1 subscription · paid AI OFF  │
                    └─────────────────┬───────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
   Track A Core                 Guarded Action                Track B Premium
   CSV / Shopify*               & Delivery (M7)               AI-MKT (offline→paid)
   Data Health                  buying-plan CSV               GEO-1 / DATA-0
   Workers (M0.8)               reviewable PO drafts          AI-MKT-1.1 credits
   M5 → M6 → M7 spine           approval audit                DATA-1 adapters (≤2)
         │                            │                            │
         └──────────────┬─────────────┴────────────────────────────┘
                        ▼
              Canonical commerce domain
              M5 metrics · M6 forecast · M7 decisions
              Evidence & Accuracy Contract
              Commerce Decision Loop (AI investigates; engines own facts)
```

\*Shopify production remains behind CONN-1 exit / V8 JWT / binding / D13/D14 / OAuth / SyncRun — **not** bypassed by CSV pilot.

### Separated commercial dimensions (from DOC-GLOBAL-1 — preserved)

Merchant domicile ≠ billing currency ≠ locale ≠ timezone ≠ selling marketplace ≠ warehouse ≠ research geography. Unknown/unsupported → fail closed.

### Minimum launch geography vs GEO-1

| Scope | Requirement |
|---|---|
| **Minimum pilot / subscription launch** | English-first UX; org can operate in **US/GB/CA/AU** commercial configuration (native currency, timezone, locale); no AE-as-launch-default in *strategy*; no US-only hardcoding |
| **AI-MKT-GEO-1 (Track B)** | Versioned country/capability registry; dynamic selectors; AE fixture-only; fifth synthetic market via config; correlation/success-response residuals closed |

---

## 4. Reuse-vs-new matrix

| Capability | Reuse (existing) | New / extend (proposed IDs) | Do not build |
|---|---|---|---|
| Canonical domain / adapters | DOMAIN_MODEL, PROVIDER_ADAPTERS, CSV path | — | Per-country engines |
| Metrics / forecast / decisions | M5–M7, PB1 fences | **M7-GAD-1** delivery surfaces | LLM-owned ROQ/math |
| Human approval lifecycle | M7.3 schema/RPCs, PB1 | Approval audit in GAD | Auto-send / auto-pay |
| Supplier compare / RFQ | FUTURE_ROADMAP Supplier Intelligence V1 | Progressive after GAD | Auto-outreach |
| Background jobs | M0.8 contracts (tenancy, envelope, idempotency, lease, retry, concurrency) | **WORKER-PROD-1** gap closure against existing contracts | Second queue product / premature vendor lock |
| Connector security | CONN-0…1d-E, vault, V8/V11 | Binding · D14 · D13 · CONN-2 | Bypass for pilot |
| CSV → metrics → planning | LOCAL-ONLY snapstore acceptance | **PILOT-CSV-1** hosted/onboarding cert | Fake production seeds from synthetic |
| Shopify live | RO.1–RO.3 offline; CONN schema DEPLOYED_VERIFIED | CONN-2… after security gates | Live nested cert claims |
| Subscription billing | BillingEntitlement domain concept | **BILL-1** (ops scope limits; paid research OFF) | AI-token-as-primary billing |
| Market research offline | AI-MKT-1a…1f + R1 | GEO-1 / DATA-0 / 1.1 / DATA-1 (≤2 adapters) | >2 initial providers; cross-tenant cache |
| L1 inventory AI | AI-ARCH-1, AI-INV-1/1.1 | Soft-enable separately | Soft-show without gates |
| UX polish | UX-INV-1a–1c.1 | UX-INV-1d parallel | Fake M7 CTAs |
| Multi-provider | CONN-MP-0 | Track C later | Advertise unshipped connectors as live |

---

## 5. Worker / job production gaps (architecture preserved)

Authority: `docs/BACKGROUND_JOBS.md` (M0.8). Architecture **frozen**; production runtime **not** selected; workers/cron **OFF**.

| Gap | Contract status | Production status |
|---|---|---|
| Scheduler / cron | Out of M0.8.1 freeze (explicitly deferred) | **Missing** — no production scheduler |
| Webhook ingest dedupe | Idempotency + SyncRun relationship frozen later stages | **Missing** for live webhooks (webhooks **OFF**) |
| Resumable backfill | Bounded/orchestration stages | **Missing** as production path |
| Bounded batches | Purpose-scoped jobs | **Partial** eng; not production-certified |
| Leases / claim tokens | M0.8.5 semantics frozen | **Not** production-persisted/activated |
| Per-tenant concurrency | M0.8.8 | **Not** production-enforced runtime |
| Retries / backoff | M0.8.6 policy frozen | **Not** production-wired |
| Crash recovery / dead work | M0.8.5 / M0.8.7 | **Not** operator-observable in prod |
| Observability | Required by M0.8 purpose | **Insufficient** for paying launch |
| Queue vendor | Explicitly **not** selected | **No commitment** this strategy |

**Rule:** Close gaps via **WORKER-PROD-1** (and SyncRun-adjacent slices) **reusing** M0.8 — do not invent a parallel job system.

---

## 6. External research adapter policy (Track B)

| Rule | Decision |
|---|---|
| Initial adapters | **At most two:** (1) general research (e.g. authorized web-search class) · (2) **one** structured REST provider |
| Structured Amazon priority candidates (DATA-0) | **DataForSEO** and **Pangolinfo** — evaluate side-by-side; pick **at most one** for the structured slot |
| Candidate ≠ approved | Neither DataForSEO nor Pangolinfo is an approved provider, licensed source, or live adapter until **AI-MKT-DATA-0** + LEGAL + (**AI-MKT-1.1** if paid) clear |
| Cost preference | Free evaluation first → prepaid / PAYG → low fixed costs; refuse silent spend |
| MCP | **No** direct unbounded MCP execution as a research/data path (allowlisted, bounded, audited tools only if ever authorized) |
| Others | Deferred (Keepa / Jungle Scout / Bright Data / Everydata / etc. only after LEGAL + economics) |
| Caching | Rights-aware; tenant-private; **no** unauthorized cross-tenant reuse |
| Paid path gate | **AI-MKT-1.1** before any paid external research |
| Core SaaS launch | **Independent** of premium market research — allowed with paid research **disabled** if BILL-1 + pilot acceptance pass |

### 6.1 AI-MKT-DATA-0 — structured Amazon candidate evaluation matrix

**Status:** docs feasibility checklist only. **No** subscriptions, API calls, scrapes, MCP runs, or provider commitments in this slice. All cells below are **evaluation requirements** for the future **AI-MKT-DATA-0** pass — current evidence class = **UNKNOWN** until that slice records verified findings.

**Priority structured candidates (side-by-side):**

| Candidate | Role | Class |
|---|---|---|
| **DataForSEO** | Structured REST / marketplace & SEO-adjacent datasets (incl. Amazon-oriented surfaces where offered) | **Priority candidate** — not approved |
| **Pangolinfo** | Structured REST Amazon-oriented product/market data surfaces | **Priority candidate** — not approved |

**General-research slot (separate; not chosen here):** authorized web-search class (e.g. OpenAI `web_search` lineage from AI-MKT-0) remains the intended general adapter candidate — still separately gated.

#### Evaluation axes (must pass before DATA-1 adapter work)

| Axis | What DATA-0 must record (per candidate) | Fail-closed rule |
|---|---|---|
| **US/GB/CA/AU endpoint coverage** | Which marketplaces/locales/endpoints exist for Amazon.com / co.uk / ca / com.au (or equivalents); gaps labeled | Unsupported market → `UNSUPPORTED_GEO` / abstain — do not invent coverage |
| **Localized postal-code pricing** | Whether price/offer APIs accept postal/ZIP; currency native to market; delivery-region semantics | Missing locality → do not claim localized price; no unauthorized FX fill |
| **Product / category / bestseller / new-release** | Availability of product detail, category browse, bestseller, and new-release endpoints; freshness SLAs | Absent class → omit from investigations; never fabricate ranks/lists |
| **Batched New Releases / category / keyword observations** | Whether Pangolinfo/DataForSEO support bounded batch pulls of New Releases, category listings, and keyword-scoped observations; max batch size; pagination; dedupe keys; freshness | Unbounded scrape forbidden; batch only under AI-MKT-1.1 depth tiers + hard budgets |
| **Accuracy** | Documented accuracy claims vs independent spot-checks (when authorized); error modes for batch New Releases / category / keyword | Unverified accuracy → label uncertainty; do not upgrade to observed_fact |
| **Niche metric provenance** | Origin of BSR, share-of-voice, estimated sales, review counts, etc.; claim_class mapping | BSR/search/reviews/estimates ≠ verified units sold; New Releases **rank/reviews ≠ sales**; unknown ≠ zero |
| **Commercial SaaS rights** | License allows StoreAgent multi-tenant SaaS display/use for merchant customers | **UNKNOWN rights → fail closed**; no production use |
| **AI processing** | Permission to send payloads to LLMs / store embeddings / derive hypotheses | Deny-by-default if AI processing disallowed or silent |
| **Retention / cache / export** | Allowed TTL, tenant-private cache keys, export/download, deletion; reuse of permitted batch observations across depth tiers | No unauthorized cross-tenant cache; respect retention caps |
| **Cost per successful investigation** | Unit economics under AI-MKT-1.1 tariffs for batch scan → selected validation → deep research; prepaid/PAYG preferred | Hard budgets; abort to deterministic-only fallback |

#### Selection rule (after DATA-0)

```text
General research adapter (slot 1)  +  at most ONE of {DataForSEO, Pangolinfo, …} (slot 2)
        │
        └─► Only after: GEO-1 readiness as applicable · DATA-0 recorded · LEGAL rights clear
                        · AI-MKT-1.1 if any paid call · bounded REST adapter (no unbounded MCP)
```

Losing structured candidates remain deferred — not deleted from future consideration.

#### Honesty / evidence classes (unchanged + opportunity-specific)

- Rankings, BSR, New Releases rank, search interest, reviews, “estimated sales,” and AI synthesis are **not** verified transaction volumes.
- **New Releases rank / reviews ≠ sales.**
- **Missing title/feature text ≠ proof that features are absent** — label as unobserved / incomplete evidence.
- No unsupported demand, profitability, or causal claims.
- Historical snapshots must not masquerade as current.
- Merchant observations ≠ engine calculations ≠ external observations ≠ proxies ≠ hypotheses.

### 6.2 Product Opportunity Intelligence (premium Track B scope — no new milestone)

**Mode:** Clarifies existing **AI-MKT-DATA-0 / COMP-1 / AI-MKT-3 / AI-MKT-1.1 / AI-MKT-4** living scope only. **Not** a new milestone ID. **Not** implementation authorization. Does **not** change Track A launch-first critical path.

**Inspiration (non-authority):** public teardown patterns such as [Amazon New Releases + AI analysis write-ups](https://medium.com/@pangolinfo/how-to-analyze-amazon-new-releases-with-ai-a-30-product-teardown-prompts-included-cdf4547d6111) may inform *investigation design questions* only — they do **not** approve Pangolinfo, authorize scraping/APIs, define StoreAgent evidence classes, or bypass rights/credit gates.

#### COMP-1 — comparable intelligence (scope clarified)

| Capability | Requirement |
|---|---|
| Segmentation & matching | Comparable product segmentation and attribute matching (variant/pack/condition-aware); match quality labeled; fail closed on weak match |
| Price statistics | **Deterministic** median / percentile / outlier detection and price-per-unit analysis — engines own numbers; LLM may explain only |
| Normalization | Pack-size, currency, variant, and condition normalization before compare; unauthorized FX forbidden |
| Voice / complaints | Rating/review coverage when sourced; authorized customer-complaint clustering only — no invented competitor sales or causal “why they’re winning” claims |

#### AI-MKT-3 — Product Opportunity Scanner (scope clarified)

| Capability | Requirement |
|---|---|
| Candidates | Emerging product candidates; feature gaps; bundle and variant opportunities — each with evidence IDs / honesty class |
| Merchant fit | Merchant-specific relevance; supplier feasibility; landed cost; MOQ; margin; capital; inventory risk — consume M5–M7 / supplier inputs when trusted; never invent cost/margin |
| Action hypotheses | Labeled **Investigate / Test / Watch / Avoid** only |
| Forbidden claims | No “guaranteed winning product,” no autonomous buying, no unsupported demand/profitability/causality |

#### AI-MKT-1.1 — progressive research depth (scope clarified)

```text
bounded batch scan  →  selected product validation  →  authorized deep research
        │                        │                              │
   reuse permitted          reserve credits                reserve credits
   observations             before paid exec               before paid exec
```

| Rule | Decision |
|---|---|
| Depth tiers | Batch scan (bounded) → selected validation → deep research — escalate only with merchant/policy authority + budget |
| Credits | Idempotent **reserve** before any paid execution; settle/refund; hard per-org ceilings |
| Reuse | Prefer rights-allowed cached/prior observations before new paid pulls |
| Authority order | **Deterministic calculations before LLM synthesis** |
| Model routing | Economical model routing **subject to evaluation** — never sacrifice claim provenance for cheaper models |
| Core SaaS | Progressive research remains **OFF** for Track A launch unless separately enabled |

#### AI-MKT-4 — monitoring (scope clarified)

May monitor **comparable observations over time** only with merchant **consent**, cleared **rights**, and **budgets**. No silent refresh, no unauthorized cross-tenant learning, no auto-buy.

---

## 7. Minimum commercially useful pilot product

### 7.1 Product definition (CSV-first feasible)

**StoreAgent Pilot V0 — Inventory Decision Copilot (CSV-first)**

A US-led cohort of **5–10** merchants can:

1. Authenticate and create/join an org (server-owned membership).
2. Import inventory/sales via **CSV** into the canonical domain with **visible data-health** (unknown ≠ zero; quarantine honest).
3. See attention / cover / replenishment signals from **M5** (deterministic).
4. Receive **M7 decision candidates** (REORDER / REDUCE / PROMOTE / WATCH) only behind existing PB1 / create fences — no fake authorization.
5. Export a **buying-plan CSV** and review **PO drafts** under **Guarded Action & Delivery**; Approve/Edit/Dismiss with audit — **never** send/purchase/pay from approval alone.
6. Hold an active **subscription entitlement** (BILL-1) with clear feature flags; **paid AI research OFF**.
7. Operate with English-first UX; org currency/timezone/locale configured for US/GB/CA/AU without US-only hardcoding.

**Out of pilot V0:** live Shopify OAuth/SyncRun (unless separately certified), live/paid market research, Woo/Amazon, autonomous purchasing, advanced GEO registry UX, competitor sales invention, FX aggregation dashboards.

### 7.2 CSV-first certification rule

CSV-first pilot is **allowed** if independently certifiable **without bypassing** Shopify security gates. CSV acceptance ≠ Shopify production acceptance. Do not weaken CONN-1 / V8 / binding / D13/D14 to “make Shopify fit the pilot date.”

### 7.3 Pilot acceptance criteria

| # | Criterion | Pass signal |
|---|---|---|
| P1 | Trusted data health | Import issues visible; no silent zero-fill; merchant can act on quarantine |
| P2 | Onboarding TTV | First useful attention/replenishment view within agreed pilot SLA after CSV import |
| P3 | Sync recovery (CSV path) | Failed/partial import recoverable; idempotent re-import; no duplicate canonical corruption |
| P4 | Subscription entitlements | BILL-1 enforces plan limits server-side; paid research remains OFF |
| P5 | Privacy / security | Org isolation; no vault/OAuth required for CSV path; no secret leakage in DTOs |
| P6 | Authenticated merchant UX | Hosted/auth path certified for pilot orgs (local FE-ACCEPT-1C ≠ hosted) |
| P7 | Buying delivery | Buying-plan CSV + reviewable PO draft + approval audit under M7-GAD-1 |
| P8 | Ops monitoring | Job/import failures observable; support can triage tenant impact |
| P9 | Support + product analytics | Pilot support playbook; basic funnel/TTV analytics without inventing ROI |
| P10 | Governance | M5–M7 authority intact; Evidence contract intact; activation unrelated gates remain OFF |

---

## 8. Exact launch critical path (existing + proposed IDs)

```text
Track A (revenue-critical)
──────────────────────────
[Foundations CLOSED] M0–M5 eng · CSV local · UX-INV-1a–1c.1 · AI-INV-1/1.1 (soft OFF)
        │
        ├─► AI-INV-2 Data readiness / Data Health UX          [PLANNED]
        ├─► M7-GAD-1 Guarded Action & Delivery               [PROPOSED — NEXT]
        ├─► BILL-1 Subscription entitlements (research OFF)  [PROPOSED]
        ├─► PILOT-CSV-1 Hosted CSV pilot certification       [PROPOSED]
        ├─► UX-INV-1d polish (parallel)                      [PLANNED]
        ├─► WORKER-PROD-1 close M0.8 production gaps         [PROPOSED]
        │         (needed harder for Shopify; partial for CSV)
        ├─► PE1.b.6b JWT → M6 production (limited)           [BLOCKED → gated]
        ├─► M7 create authorization (pilot org fence)        [BLOCKED → gated]
        └─► LAUNCH-ACCEPT-1 independent launch sign-off      [PROPOSED]
                    │
                    └─► US 5–10 merchant pilot → first revenue

Shopify join (parallel, non-bypass)
───────────────────────────────────
CONN-1 exit · V8 hosted JWT · binding · D14 · D13 · CONN-2 OAuth · SyncRun
· live nested cert · webhook dedupe · WORKER-PROD-1
        └─► PILOT-SHOPIFY-1 (after security) — not required for CSV V0

Track B (premium AI — not revenue gate)
───────────────────────────────────────
AI-MKT-1f-R1 CLOSED @ 38d63da
  → GEO-1 (+ correlation/success-response residuals)
  → DATA-0 (≤2 adapter candidates; LEGAL)
  → AI-MKT-1.1 credits
  → DATA-1 adapters
  → AI-MKT-2 / COMP-1 / 3 / 4 / LOOP-1 …

Track C
───────
Woo → Amazon → eBay/regional · country expansion · infra scale
```

### Dependencies / blockers / offline / deferred

| Class | Items |
|---|---|
| **Hard blockers (Track A Shopify)** | CONN-1 exit UNMET; V8 JWT NOT VERIFIED; binding NOT_YET_VERIFIED; D13/D14 DEFERRED; OAuth/SyncRun/workers OFF; PE1.b.6b BLOCKED |
| **Hard blockers (paying launch)** | LAUNCH-ACCEPT-1 unmet; hosted auth UX not certified; BILL-1 unimplemented; M7-GAD-1 unimplemented; full DR NOT ESTABLISHED |
| **Reusable foundations** | Canonical domain; M5–M7/PB1; M0.8 jobs; CSV local path; AI-ARCH L1 offline; AI-MKT offline stack; CONN schema 57/57; FE-ACCEPT-1C local |
| **Independent offline work** | UX-INV-1d; M7-GAD-1 contract; BILL-1 design; GEO-1 registry design; DATA-0 LEGAL matrix; correlation-test prerequisite |
| **Deferred (Track B/C)** | Paid research; >2 adapters; COMP/CREATIVE/LOOP; Woo/Amazon; advanced FX; AE launch eligibility; soft-show without gates |

---

## 9. Deferred premium features (explicit)

- Live / paid external market research and **AI-MKT-1.1** credit spend
- AI-MKT-GEO-1 merchant UX as a **revenue** dependency (remains Track B quality work)
- AI-MKT-DATA-1 beyond two initial adapters; Keepa/Jungle Scout/etc.; second structured Amazon provider after one is chosen
- Approving DataForSEO or Pangolinfo without DATA-0 + LEGAL (+ 1.1 if paid)
- AI-MKT-2 / COMP-1 / AI-MKT-3 Product Opportunity Scanner / CREATIVE / AI-MKT-4 / LOOP-1 as launch blockers
- Soft-show / authenticated commercial research UX certification
- Autonomous purchasing, auto supplier contact, auto payment; “guaranteed winning product” claims
- Multi-country selling-market UX beyond configuration readiness
- WooCommerce / Amazon / eBay / regional connectors
- Queue vendor selection / second job architecture
- Unnecessary FX aggregation layers

---

## 10. Single recommended next implementation

| Field | Value |
|---|---|
| ID | **M7-GAD-1** |
| Name | Guarded Action & Delivery layer |
| Why first | Converts existing M5/M7/PB1 foundations into the smallest **commercially visible** buying output (CSV + reviewable PO drafts + approval audit) without Shopify OAuth, without paid AI, and without authorizing send/purchase/pay |
| Depends on | Existing M7/PB1 fences; CSV/canonical metrics path; owner authorization |
| Non-goals | External mutation; RFQ send; payment; M7 production create unlock beyond draft/export surfaces; AI-MKT live; worker vendor choice |
| Parallel offline | BILL-1 design; AI-INV-2 Data Health; UX-INV-1d; Track B GEO-1 design only if capacity permits |
| After M7-GAD-1 | BILL-1 → PILOT-CSV-1 → LAUNCH-ACCEPT-1 (CSV V0); Shopify security track continues in parallel |

**Do not start M7-GAD-1 from this document alone** — owner authorization required.

---

## 11. Proposed milestone IDs (not started)

| ID | Track | Status | Intent |
|---|---|---|---|
| **M7-GAD-1** | A | **PROPOSED** (next) | Buying-plan CSV, reviewable PO drafts, approval audit |
| **BILL-1** | A | **PROPOSED** | Subscription entitlements; paid research OFF; cost controls for any enabled billables |
| **PILOT-CSV-1** | A | **PROPOSED** | Hosted/onboarding CSV pilot certification |
| **WORKER-PROD-1** | A | **PROPOSED** | Close M0.8 production gaps (scheduler, dedupe, backfill, batches, leases, concurrency, retries, recovery, observability) — no new queue architecture |
| **LAUNCH-ACCEPT-1** | A | **PROPOSED** | Independent launch acceptance checklist execution |
| **PILOT-SHOPIFY-1** | A | **PROPOSED** | Shopify pilot after CONN/security gates |
| AI-MKT-GEO-1 | B | **PROPOSED** | Registry + residuals (M03 / correlation / success-response) |
| AI-MKT-DATA-0 / 1.1 / DATA-1 | B | **PROPOSED / PLANNED** | Feasibility (DataForSEO + Pangolinfo priority candidates) → credits → ≤2 adapters (1 general + 1 structured REST) |
| AI-INV-2 | A | **PLANNED** | Data readiness / health |
| UX-INV-1d | A | **PLANNED** | Merchant-first polish (parallel) |

---

## 12. Governance restatement

- One canonical commerce domain; provider-independent adapters.
- M5–M7 deterministic engines own inventory/sales/forecast/reorder math.
- Evidence & Accuracy Contract + Commerce Decision Loop (AI-ARCH-0).
- BSR / search / reviews / rank ≠ verified sales; unknown ≠ zero.
- Human approval for purchasing, ads, supplier contact, inventory mutation.
- CONN-1 / V8 / binding / D13 / D14 / PE1.b / workers / M6 / M7 gates unchanged by docs.
- Migrations **57/57** · activation **OFF** · protected dirties preserved.
- Historical reports preserved; living priorities superseded **explicitly** here.

---

## 13. Exact checkpoint allowlist (when owner authorizes Git)

Stage **only** these paths:

```text
docs/DOC_LAUNCH_1_COMMERCIAL_READINESS_STRATEGY.md
docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md
docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md
docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md
docs/IMPLEMENTATION_STATUS.md
docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md
docs/PROJECT_HANDOFF.md
docs/DECISIONS.md
```

**Do not stage:** `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md`, `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, `AGENTS.md`, `.tmp/`, `.vitest/`, SQL/operator/archives, deleted roadmap DOCX, runtime/test sources, migrations, env.

---

## 14. Status pin

| Item | Value |
|---|---|
| Slice | DOC-LAUNCH-1 (Product Opportunity Intelligence addendum) |
| DoD | **`DOCS_ONLY_COMPLETE`** |
| HEAD | `38d63da` |
| AI-MKT-1f-R1 | **CLOSED/PUSHED** @ `38d63da` |
| Activation | **OFF** |
| Paying launch | **NO-GO** |
| DATA-0 structured candidates | DataForSEO + Pangolinfo (**candidates only**) |
| Premium scope clarified | COMP-1 · AI-MKT-3 scanner · AI-MKT-1.1 depth tiers · AI-MKT-4 consented monitor — **no new milestone** |
| Next proposed eng | **M7-GAD-1** (owner-gated; not started) |
| Track B next (non-blocking) | AI-MKT-GEO-1 (residuals retained); DATA-0 after |

**STOP FOR OWNER REVIEW.**
