# StoreAgent.si — November 2026 Execution Plan

**Mode:** Documentation / planning reconciliation only
**As-of current truth:** 2026-11-28 — **DOC-LAUNCH-1** (`DOCS_ONLY_COMPLETE`; AI-MKT-1f-R1 CLOSED/PUSHED @ `38d63da`; DOC-GLOBAL-1 CLOSED/PUSHED @ `6b16caa`; AI-MKT-1f CLOSED/PUSHED @ `e6943ce`; AI-MKT-1e…0 / AI-ARCH-1 prior pins preserved; DOC-CONTINUITY-6 schema pins preserved)
**Git HEAD verified tip (2026-11-28):** `38d63da` — AI-MKT-1f-R1 CLOSED/PUSHED; DOC-GLOBAL-1 CLOSED/PUSHED @ `6b16caa`; AI-MKT-1f CLOSED/PUSHED @ `e6943ce`; AI-MKT-1e…0 / AI-ARCH-1a–1f prior pins; DOC-LAUNCH-1 DOCS_ONLY_COMPLETE (uncommitted)
**Remote:** `main` tracking `origin/main` at `38d63da` (**no CI claim**)
**Compact handoff:** `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md`
**AI + merchant-value roadmap:** `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`
**Launch-first strategy:** `docs/DOC_LAUNCH_1_COMMERCIAL_READINESS_STRATEGY.md`
**Global strategy:** `docs/DOC_GLOBAL_1_FOUR_MARKET_LAUNCH_STRATEGY.md`
**AI-MKT-0 feasibility:** `docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md` (AE-primary commercial geography **superseded**)
**AI-MKT-1a report:** `docs/AI_MKT_1A_IMPLEMENTATION_REPORT.md`
**AI-MKT-1b report:** `docs/AI_MKT_1B_IMPLEMENTATION_REPORT.md`
**AI-MKT-1c report:** `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md`
**AI-MKT-1d report:** `docs/AI_MKT_1D_IMPLEMENTATION_REPORT.md`
**AI-MKT-1e report:** `docs/AI_MKT_1E_IMPLEMENTATION_REPORT.md`
**AI-MKT-1f report:** `docs/AI_MKT_1F_IMPLEMENTATION_REPORT.md`
**AI-MKT-1f-R1 report:** `docs/AI_MKT_1F_R1_IMPLEMENTATION_REPORT.md`
**Authoritative status table:** living ledger § **2026-11-28 — DOC-LAUNCH-1**
**Authority:** Augments the canonical master roadmap DOCX. Does **not** destructively rewrite frozen architecture, PE1.b gates, M5–M7 contracts, or historical ledger evidence.
**DOCX synchronization:** §36 DOC-CONTINUITY-6 present; **§37 AI Commerce Intelligence Architecture (PROPOSED)** appended for AI-ARCH-0. §§1–36 preserved. Refresh Word Contents if needed.

---

## 0U. 2026-11-28 DOC-LAUNCH-1 — Launch-first commercial readiness (`DOCS_ONLY_COMPLETE`)

> **Authority for current *priority / next-eng* pins.** Schema/activation pins remain as in §0H. Soft-show / live / paid research / activation **NO-GO**. Supersedes §0T “GEO-1 next” for *implementation priority*.

| Field | Value |
|---|---|
| HEAD / origin | **Aligned** @ `38d63da` |
| AI-MKT-1f-R1 | **CLOSED/PUSHED** @ `38d63da` |
| DOC-LAUNCH-1 | **`DOCS_ONLY_COMPLETE`** · `docs/DOC_LAUNCH_1_COMMERCIAL_READINESS_STRATEGY.md` |
| Tracks | **A** core revenue · **B** premium AI-MKT · **C** expansion |
| Pilot | CSV-first US-led 5–10; M7-GAD-1 + BILL-1; paid research OFF |
| AI-MKT-1.1 | Paid research gate only — not core subscription gate |
| Adapters | Max two initial (1 general + 1 structured REST); rights-aware cache; no cross-tenant reuse; **no** unbounded MCP |
| DATA-0 candidates | **DataForSEO** + **Pangolinfo** priority structured Amazon candidates — **not** approved; evaluate batched New Releases/category/keyword; free eval → prepaid/PAYG preferred |
| Premium scope | COMP-1 / AI-MKT-3 Product Opportunity Scanner / AI-MKT-1.1 depth tiers / AI-MKT-4 consented monitor — clarified; **no new milestone** |
| Workers | Preserve M0.8; WORKER-PROD-1 gaps; no duplicate queue |
| Residuals | M03 title; optional country/depth skip; correlation + fail-closed success-response → GEO-1/prereq |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · **OFF** |
| Next | Owner review → authorize **M7-GAD-1**; STOP |

## 0T. 2026-11-28 AI-MKT-1f-R1 — Opaque merchant public IDs (CLOSED/PUSHED @ `38d63da`)

> **Authority (historical eng pin).** Later **CLOSED/PUSHED** @ `38d63da`. Schema/activation pins remain as in §0H. Soft-show / live / paid **NO-GO**. Eng next-step superseded by §0U.

| Field | Value |
|---|---|
| HEAD / origin | **Aligned** @ `38d63da` (authoring tip historically `6b16caa`) |
| DOC-GLOBAL-1 | **CLOSED/PUSHED** @ `6b16caa` |
| AI-MKT-1f-R1 | **CLOSED/PUSHED** @ `38d63da` · `docs/AI_MKT_1F_R1_IMPLEMENTATION_REPORT.md` |
| Design | Response-scoped `mev_`/`mfd_`/`mcf_` HMAC public IDs; internals/hashes/claim validation unchanged |
| Tests | Matrix **59/59** PASS · SKIP **0** · R1 **8/8** · AI-MKT **176/176** · AI-ARCH **121/121** · AI-INV **27/27** |
| Owner sequence (historical) | Was **R1 → GEO-1 → DATA-0 → 1.1 → DATA-1** — now Track B after DOC-LAUNCH-1 |
| Geography notes | AE fixture-only after GEO-1; billing ≠ domicile; legal rights before providers; multi-country must not delay Shopify |
| Targets | US/GB/CA/AU acquisition numbers = flexible **KPIs only** (never caps/entitlements) |
| Live / credits / soft-show | **NO-GO**; authenticated commercial UX **NOT CERTIFIED** |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · **OFF** |
| Next (historical) | Was AI-MKT-GEO-1 — see §0U |

## 0S. 2026-11-28 DOC-GLOBAL-1 — Four-market launch strategy (CLOSED/PUSHED @ `6b16caa`)

> **Authority for current *strategy* pins.** Later CLOSED/PUSHED @ `6b16caa`. Schema/activation pins remain as in §0H. §0I remains architecture design authority. Eng next-step superseded by §0T.

| Field | Value |
|---|---|
| HEAD / origin | **Aligned** @ `6b16caa` |
| AI-MKT-1f | **CLOSED/PUSHED** @ `e6943ce` |
| DOC-GLOBAL-1 | **CLOSED/PUSHED** @ `6b16caa` · `docs/DOC_GLOBAL_1_FOUR_MARKET_LAUNCH_STRATEGY.md` |
| Launch markets | **US/USD/en-US · GB/GBP/en-GB · CA/CAD/en-CA · AU/AUD/en-AU** |
| Registration targets | 500 / 250 / 125 / 125 = flexible **KPIs only** (never caps/entitlements) |
| Geography supersession | UAE-first / AE-primary commercial narrative **superseded**; Noon = regional example only |
| Proposed next | **AI-MKT-GEO-1** · **AI-MKT-DATA-0** · **AI-MKT-DATA-1** · clarified **1.1 / 2 / COMP-1 / 3 / 4 / LOOP-1** |
| Connector sequence | CSV → Shopify → Woo → Amazon; eBay/regional later; never advertise planned as live |
| Residual | M01b residual **closed** by AI-MKT-1f-R1 |
| Live / credits / soft-show | **NO-GO**; authenticated commercial UX **NOT CERTIFIED** |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · **OFF** |
| Next (historical) | Was 1f-R1 / GEO-1 — see §0T |

## 0R. 2026-11-27 AI-MKT-1f — Adversarial evaluation & offline acceptance (CLOSED/PUSHED @ `e6943ce`)

> **Authority (historical eng pin).** Later **CLOSED/PUSHED** @ `e6943ce`. Schema/activation pins remain as in §0H. Offline **GO** ≠ live research. Superseded for *strategy/next-step* by §0S.

| Field | Value |
|---|---|
| AI-MKT-1e | **CLOSED/PUSHED** @ `59ff8b0` |
| AI-MKT-1f | **CLOSED/PUSHED** @ `e6943ce` · fixture/runner/Vitest + `docs/AI_MKT_1F_IMPLEMENTATION_REPORT.md` |
| Tests | 1f **66/66**; 1a–1f **168/168** (pre-R1); AI-ARCH **121/121**; AI-INV **27/27**; historical matrix **58** PASS + **1** SKIP — post-R1 see §0T (**59/59**) |
| Live / credits / soft-show unlock | **NO-GO** (soft-show default OFF; authenticated merchant browser NOT CERTIFIED) |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · **OFF** |
| Next (historical) | Was AI-MKT-1.1 — see §0S for revised proposed sequence |

## 0Q. 2026-11-27 AI-MKT-1e — Guarded merchant research UX (CLOSED/PUSHED @ `59ff8b0`)

> **Authority (historical eng pin).** Schema/activation pins remain as in §0H. Offline **GO** ≠ live research. Superseded for *next-step* by §0R.

| Field | Value |
|---|---|
| AI-MKT-1d | **CLOSED/PUSHED** @ `2f6ae43` |
| AI-MKT-1e | **CLOSED/PUSHED** @ `59ff8b0` · SKU Market Intelligence panel + guarded action + `docs/AI_MKT_1E_IMPLEMENTATION_REPORT.md` |
| Tests | Focused **19/19**; 1a–1e **102/102**; AI-ARCH **121/121**; AI-INV **27/27**; fixture browser 375→2560 **PASS** |
| Live / credits / soft-show unlock | **NO-GO** (soft-show default OFF; production never injects synthetic) |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · **OFF** |
| Next (historical) | Was AI-MKT-1f — see §0R |

## 0P. 2026-11-27 AI-MKT-1d — Bounded orchestration & claim validation (CLOSED/PUSHED @ `2f6ae43`)

> **Authority (historical eng pin).** Schema/activation pins remain as in §0H. Offline **GO** ≠ live research. Superseded for *next-step* by §0Q.

| Field | Value |
|---|---|
| AI-MKT-1c | **CLOSED/PUSHED** @ `553e239` |
| AI-MKT-1d | **CLOSED/PUSHED** @ `2f6ae43` · `lib/market-research/orchestration/` · `docs/AI_MKT_1D_IMPLEMENTATION_REPORT.md` |
| Tests | Focused **19/19**; 1a–1d **83/83**; AI-ARCH **121/121**; AI-INV **27/27** |
| Live / credits | **NO-GO** |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · **OFF** |
| Next (historical) | Was AI-MKT-1e — see §0Q |

## 0O. 2026-11-27 AI-MKT-1c — Evidence normalization & matching (CLOSED/PUSHED @ `553e239`)

> **Authority (historical eng pin).** Schema/activation pins remain as in §0H. Offline **GO** ≠ live research. Superseded for *next-step* by §0P.

| Topic | Current state |
|---|---|
| AI-ARCH-1a–1f | **CLOSED/PUSHED** @ `c216ded` · soft-enable **OFF** · 38/38 · 121/121 · 27/27 PASS |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` |
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` (18-file) |
| AI-MKT-1b | **CLOSED/PUSHED** @ `211d8e9` |
| AI-MKT-1c | **CLOSED/PUSHED** @ `553e239` · `lib/market-research/normalize/` · `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md` |
| Tests | Focused **19/19**; 1a+1b+1c **64/64**; AI-ARCH **121/121**; AI-INV **27/27**; typecheck/lint/build **PASS** |
| Live research / credits | **NO-GO** (live structurally forbidden; 1.1 before paid) |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · activation **OFF** |
| Next (historical) | Was AI-MKT-1d — see §0P |

---

## 0N. 2026-11-27 AI-MKT-1b — Offline adapters & research fixtures (CLOSED/PUSHED @ `211d8e9`)

> **SUPERSEDED for *eng next-step* pins** by §0O. Historical offline adapters acceptance retained. Schema/activation pins remain as in §0H. Offline **GO** ≠ live research.

| Topic | Current state |
|---|---|
| AI-ARCH-1a–1f | **CLOSED/PUSHED** @ `c216ded` · soft-enable **OFF** · 38/38 · 121/121 · 27/27 PASS |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` |
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` (18-file) |
| AI-MKT-1b | **CLOSED/PUSHED** @ `211d8e9` · `lib/market-research/adapters/` · `docs/AI_MKT_1B_IMPLEMENTATION_REPORT.md` |
| Tests | Focused **21/21**; 1a+1b **45/45**; AI-ARCH **121/121**; AI-INV **27/27**; typecheck/lint/build **PASS** |
| Live research / credits | **NO-GO** (live structurally forbidden; 1.1 before paid) |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · activation **OFF** |
| Next (historical) | Was AI-MKT-1c — see §0O |

---

## 0M. 2026-11-27 AI-MKT-1a — Research contracts, registry & rights (CLOSED/PUSHED @ `f685c15`)

> **SUPERSEDED for *eng next-step* pins** by §0O / §0N. Historical offline contracts acceptance retained. Schema/activation pins remain as in §0H. Offline **GO** ≠ live research.

| Topic | Current state |
|---|---|
| AI-ARCH-1a–1f | **CLOSED/PUSHED** @ `c216ded` · soft-enable **OFF** · 38/38 · 121/121 · 27/27 PASS |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` |
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` · `lib/market-research/` · `docs/AI_MKT_1A_IMPLEMENTATION_REPORT.md` |
| Tests | Focused **24/24**; AI-ARCH **121/121**; AI-INV **27/27**; typecheck/lint/build **PASS** |
| Live research / credits | **NO-GO** (live structurally forbidden in 1a; 1.1 before paid) |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · activation **OFF** |
| Next (historical) | Was AI-MKT-1b — see §0N |

---

## 0L. 2026-11-27 AI-MKT-0 — Market intelligence feasibility (CLOSED/PUSHED @ `de01686`)

> **SUPERSEDED for *eng next-step* pins** by §0M. Historical docs feasibility retained. Schema/activation pins remain as in §0H. Docs **GO** ≠ live research.

| Topic | Current state |
|---|---|
| AI-ARCH-1a–1f | **CLOSED/PUSHED** @ `c216ded` · soft-enable **OFF** · 38/38 · 121/121 · 27/27 prior PASS |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` · `docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md` |
| Governance rule | `.cursor/rules/commerce-intelligence-governance.mdc` (`alwaysApply: true`); migration rule unchanged |
| MVP design | OpenAI `web_search` primary · Gemini grounding fallback (display/cache-restricted) · AE allowlist · SKU/country + zero-sales internal-first |
| Live research / credits | **NO-GO** until AI-MKT-1.1 + applicable security gates |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · activation **OFF** |
| Next (historical) | Was AI-MKT-1 — see §0M |

---

## 0K. 2026-11-27 AI-ARCH-1f — Evaluation & release readiness (CLOSED/PUSHED @ `c216ded`)

> **SUPERSEDED for *eng next-step* pins** by §0N / §0M / §0L. Historical offline eng acceptance retained. Schema/activation pins remain as in §0H. Offline eng **GO** ≠ production activation.

| Topic | Current state |
|---|---|
| AI-ARCH-1a–1d | **CLOSED/PUSHED** @ `d56de33` · 62/62 PASS |
| AI-ARCH-1e | **CLOSED/PUSHED** @ `1c75de5` · soft-enable **OFF** · fixture browser PASS |
| AI-ARCH-1f | **CLOSED/PUSHED** @ `c216ded` · report `docs/AI_ARCH_1F_IMPLEMENTATION_REPORT.md` |
| Eval | §9 + adversarial fixtures; real orchestrator/validators; **38/38** cases · Vitest **121/121** AI-ARCH |
| Bounds / budget | **6/4/8000** enforced; live spend **0**; credits **not** implemented |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · activation **OFF** |
| Next (historical) | Was AI-MKT-0 — see §0L / §0M |

---

## 0J. 2026-11-27 AI-ARCH-1e — Guarded merchant intelligence UX (CLOSED/PUSHED @ `1c75de5`)

> **SUPERSEDED for *eng next-step* pins** by §0M / §0L / §0K. Historical UX acceptance retained. Schema/activation pins remain as in §0H.

| Topic | Current state |
|---|---|
| AI-ARCH-1a–1d | **CLOSED/PUSHED** @ `d56de33` · 62/62 PASS |
| AI-ARCH-1e | **CLOSED/PUSHED** @ `1c75de5` · soft-enable **OFF** · final acceptance recorded |
| UX | Structured intents in SKU inspector; no chatbot / no Actions redesign |
| Security | Auth + membership + `inventory.read` + enablement before evidence/tools |
| Browser | Fixture matrix 375→2560 **PASS**; live soft-enable inventory **NOT EXECUTED** |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · activation **OFF** |
| Next (historical) | Was AI-ARCH-1f — see §0K |

---

## 0I. 2026-11-27 AI-ARCH-0 — Commerce Decision Loop architecture (**PROPOSED**)

> **SUPERSEDED for *eng next-step* pins** by §0N. Remains authority for AI-ARCH-0 design framing. Schema/activation pins remain as in §0H.

| Topic | Current state |
|---|---|
| Product framing | AI Commerce Intelligence & Buying Agent · one evidence-grounded Commerce Decision Loop |
| Principle | *The AI controls the investigation. It does not control what counts as a fact.* |
| AI-ARCH-0 | **PROPOSED** (design) — closed with DOC-CONTINUITY-6 @ `d12fd04` |
| AI-ARCH-1 | **CLOSED/PUSHED** @ `c216ded` (1a–1f) |
| AI-INV-1 / 1.1 | **CLOSED/PUSHED** @ `38f63d6`; soft-enable **OFF**; enablement/UX **PROPOSED** |
| AI-MKT-0 | **CLOSED/PUSHED** @ `de01686` |
| AI-MKT-1a | **CLOSED/PUSHED** @ `f685c15` |
| AI-MKT-1b | **CLOSED/PUSHED** @ `211d8e9` |
| AI-MKT-1c | **CLOSED/PUSHED** @ `553e239` |
| AI-MKT-1d | **CLOSED/PUSHED** @ `2f6ae43` |
| AI-MKT-1e | **CLOSED/PUSHED** @ `59ff8b0` |
| AI-MKT-1f | **CLOSED/PUSHED** @ `e6943ce` |
| DOC-GLOBAL-1 | **CLOSED/PUSHED** @ `6b16caa` — US/GB/CA/AU launch strategy |
| AI-MKT-1f-R1 | **CLOSED/PUSHED** @ `38d63da` — opaque public IDs; M01b PASS |
| DOC-LAUNCH-1 | **`DOCS_ONLY_COMPLETE`** — Track A revenue ahead of Track B AI |
| GEO-1 / DATA-0 / DATA-1 | **PROPOSED** Track B (not revenue gate) |
| AI-MKT-1.1…4 | **PLANNED** (1.1 = paid research gate only) |
| COMP-1 · CREATIVE-0…2 · LOOP-1 | **PROPOSED** Track B |
| Autonomy | L1 read-only first; L2/L3 separately authorized |
| Schema / activation | **57/57** · **23/23** · **DEPLOYED_VERIFIED** · OAuth/workers/SyncRun/credentials **OFF** |

### Proposed next sequence (dependency-aware; each step separately authorized)

0. Owner review of **DOC-LAUNCH-1** — STOP; do not start M7-GAD-1 without auth
1. **Track A:** **M7-GAD-1** → **BILL-1** → **PILOT-CSV-1** → **LAUNCH-ACCEPT-1** (CSV-first US 5–10 pilot; paid research OFF)
2. **Track A parallel:** **AI-INV-2** Data Health · **UX-INV-1d** · **WORKER-PROD-1** (reuse M0.8; no new queue)
3. **Shopify join (non-bypass):** V8 JWT → binding → D14/D13 → CONN-2 OAuth → SyncRun → **PILOT-SHOPIFY-1**
4. **Track B (non-blocking):** **AI-MKT-GEO-1** (close R1 residuals) → **DATA-0** → **AI-MKT-1.1** → **DATA-1** (≤2 adapters)
5. AI-MKT-2 → **COMP-1** → AI-MKT-3 → **CREATIVE-0…2** → AI-MKT-4 → **LOOP-1**
6. M6 prod / M7 create / paying launch only under separate gates

---

## 0H. 2026-11-27 DOC-CONTINUITY-6 reconciliation (hosted CONN 57/57)

> **SUPERSEDED for *architecture* next-step pins** by §0I. Remains authority for hosted schema **57/57** / post-catalog **23/23** / activation **OFF**. §0G and older remain historical for “hosted schema 52 / apply NO-GO”.

| Topic | Current state |
|---|---|
| HEAD | `78c1d45` · local **57** / hosted **57** · pending migrations **none** |
| CONN Option B | Five migrations **COMMITTED**; history md5 `900da6949dfd6f7818a454b7f28ddf33` |
| Post-catalog | **23/23 PASS** · evidence `conn-hr-2c-postcatalog-20261127T040549Z` |
| Migration DoD | Schema **`DEPLOYED_VERIFIED`** · activation **OFF** |
| DR residual | Backup checksum PASS · full Supabase DR **NOT ESTABLISHED** |
| V8 / binding / D13/D14 / CONN-1 exit | Hosted JWT **NOT VERIFIED** · binding **NOT_YET_VERIFIED** · D13/D14 **DEFERRED** · exit **UNMET** |
| Intelligence roadmap | See §0I (AI-ARCH-0); AI-MKT/COMP/CREATIVE/LOOP unchanged class |
| PE1.b.6b / workers / M6/M7 / OAuth / SyncRun / launch | **Unchanged BLOCKED / NO-GO** |

---

## 0G. 2026-11-26 DOC-TRACK-5 reconciliation (FE-ACCEPT-1C local browser cert)

> **SUPERSEDED for current-status pins** by §0I / §0H (hosted schema now 57). Retained as FE-ACCEPT-1C continuity evidence.
> **Historical authority note.** Prefer living ledger § 2026-11-27 AI-ARCH-0 / DOC-CONTINUITY-6 + master handoff for current pins.

| Topic | Current state |
|---|---|
| HEAD | `1edc1ff` — FE-ACCEPT-1C; `main` ≡ `origin/main`; 57 migrations (hosted schema still 52) |
| FE-ACCEPT-1C | **CLOSED/PUSHED** @ `1edc1ff` — local authenticated browser certification **PASS** (Mailpit magic-link; merchant 6/6; Actions 6/6; Actions-1280 8/8) — **≠ hosted/production** |
| DOC-TRACK-3 · CONN-HR-0 · CONN-HR-1 | Unchanged: `7bd2e8b` · LOCAL-ONLY · `454f7ec` offline PARTIAL |
| Apply method | CLI `db push` of #5 **BLOCKED** (`25P01`); Option B single-txn `psql` disposable **PASS**; hosted apply **NO-GO** |
| V1–V15 / CONN-1 exit | 14 offline PASS · V11 **PARTIAL**; V8 offline PASS under §11, hosted **NOT VERIFIED**; §11 unchanged; **CONN-1 exit UNMET** |
| Binding / D13 / D14 | Binding **NOT_YET_VERIFIED**; D13/D14 **DEFERRED** |
| Hosted CONN migrations | Five **not applied / not authorized** (hosted schema still 52) |
| UX-INV-1d / AI-INV-2…6 / AI-MKT-0…4 / multi-provider | **Unchanged** (PLANNED; sequence preserved) |
| PE1.b.6b / workers / M6 prod / M7 create / purchasing / live Shopify / live model / launch | **Unchanged BLOCKED / NO-GO** |

### Proposed next sequence (dependency-aware; each step separately authorized)

0. Owner review and docs Git closure of DOC-TRACK-5 — **this pass**
1. **CONN-HR-2** — hosted P1–P9 prechecks + reviewed Option B hosted apply specification/artifact (still no apply until gate 2)
2. Hosted apply of the five CONN migrations via **Option B only** + post-apply catalog checks + hosted V8 empty-vault JWT probe
3. Production binding slice (parallelizable offline with 1–2); D14 → KEK wiring; D13 decision → CONN-2 OAuth → operational slice (`lease_held` retry, SyncRun finalization) → SyncRun
4. **UX-INV-1d** (parallelizable UI slice)
5. AI-INV-2…6 / AI-MKT-0…4 only under separate authorizations
6. Data Health / onboarding / reliability → forecast validation + M6 gates → M7 inbox/create → cash/supplier, pilot/billing/launch; Woo/Amazon/Noon by demand

---

## 0F. 2026-11-25 DOC-TRACK-4 reconciliation (CONN-HR-0/HR-1 + apply-method decision)

> **SUPERSEDED for current-status pins** by §0G above. Retained as historical CONN-HR-0/HR-1 / apply-method evidence (HEAD then `454f7ec`).
> **Authority for current-status pins (historical).** §0E / §0D / §0C / §0B / §0A and older Part A / Part E snapshots remain **historical evidence** — not rewritten. Prefer living ledger § 2026-11-26 DOC-TRACK-5 + `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md` for current pins.

| Topic | Current state |
|---|---|
| HEAD | `454f7ec` — CONN-HR-1; `main` ≡ `origin/main`; 57 migrations |
| DOC-TRACK-3 | **CLOSED/PUSHED** @ `7bd2e8b` (docs-only) |
| CONN-HR-0 | **CLOSED** LOCAL-ONLY read-only preflight (chat evidence; no hosted SQL) |
| CONN-HR-1 | **CLOSED/PUSHED** @ `454f7ec` — offline package PARTIAL; hosted P1–P9 **not run** |
| Apply method | CLI `db push` of #5 **BLOCKED** (`25P01`); Option B single-txn `psql` disposable **PASS**; hosted apply **NO-GO** |
| V1–V15 / CONN-1 exit | 14 offline PASS · V11 **PARTIAL**; V8 offline PASS under §11, hosted **NOT VERIFIED**; §11 unchanged; **CONN-1 exit UNMET** |
| Binding / D13 / D14 | Binding **NOT_YET_VERIFIED**; D13/D14 **not resolved** |
| Hosted CONN migrations | Five **not applied / not authorized** (hosted schema still 52): `20261121120000` → `20261122120000` → `20261122130000` → `20261122140000` → `20261124120000` |
| UX-INV-1d / AI-INV-2…6 / AI-MKT-0…4 / multi-provider | **Unchanged** (PLANNED; sequence preserved) |
| PE1.b.6b / workers / M6 prod / M7 create / purchasing / live Shopify / live model / launch | **Unchanged BLOCKED / NO-GO** |

### Proposed next sequence (dependency-aware; each step separately authorized)

0. Owner review and docs Git closure of DOC-TRACK-4 — **this pass**
1. **CONN-HR-2** — hosted P1–P9 prechecks + reviewed Option B hosted apply specification/artifact (still no apply until gate 2)
2. Hosted apply of the five CONN migrations via **Option B only** + post-apply catalog checks + hosted V8 empty-vault JWT probe
3. Production binding slice (parallelizable offline with 1–2); D14 → KEK wiring; D13 decision → CONN-2 OAuth → operational slice (`lease_held` retry, SyncRun finalization) → SyncRun
4. **UX-INV-1d** (parallelizable UI slice)
5. AI-INV-2…6 / AI-MKT-0…4 only under separate authorizations
6. Data Health / onboarding / reliability → forecast validation + M6 gates → M7 inbox/create → cash/supplier, pilot/billing/launch; Woo/Amazon/Noon by demand

---

## 0E. 2026-11-24 DOC-TRACK-3 reconciliation (CONN-1d-D/E closures + CONN-1d-F decisions)

> **SUPERSEDED for current-status pins** by §0F above. Retained as historical evidence (HEAD `5de98cf`; CONN-HR then not started).
> **Authority for current-status pins (historical).** §0D / §0C / §0B / §0A and older Part A / Part E snapshots remain **historical evidence** — not rewritten. Prefer this §0E + living ledger § 2026-11-24 DOC-TRACK-3 + `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md` + `docs/SHOPIFY_CONN_1D_F_SECURITY_EXIT_READINESS_REPORT.md`.

| Topic | Current state |
|---|---|
| HEAD | `5de98cf` — CONN-1d-E; `main` ≡ `origin/main`; 57 migrations |
| DOC-TRACK-2 · CONN-1d-D | **CLOSED/PUSHED** @ `b3ac033` · `40d5888` (docs-only) |
| CONN-1d-E | **CLOSED/PUSHED** @ `5de98cf` — DB + app JSON secret guards, `service_role` TRIGGER revoke; disposable only; migration `20261124120000` not hosted-applied |
| V1–V15 / CONN-1 exit | 14 offline PASS · V11 **PARTIAL**; V8 offline PASS under §11, hosted **NOT VERIFIED**; vault contract §11 unchanged; **CONN-1 exit UNMET** |
| Binding / D13 / D14 | Binding **NOT_YET_VERIFIED**; D13/D14 **not resolved** |
| Hosted CONN migrations | Five **not applied / not authorized**: `20261121120000` → `20261122120000` → `20261122130000` → `20261122140000` → `20261124120000` |
| UX-INV-1d / AI-INV-2…6 / AI-MKT-0…4 / multi-provider | **Unchanged** (PLANNED; sequence preserved) |
| PE1.b.6b / workers / M6 prod / M7 create / purchasing / live Shopify / live model / launch | **Unchanged BLOCKED / NO-GO** |

### Proposed next sequence (dependency-aware; each step separately authorized)

0. Owner review and docs Git closure of DOC-TRACK-3 — **this pass**
1. **CONN-HR-0** — hosted readiness package (no hosted execution)
2. Hosted apply of the five CONN migrations + post-apply catalog checks + hosted V8 empty-vault JWT probe
3. Production binding slice (parallelizable offline with 1–2); D14 → KEK wiring; D13 decision → CONN-2 OAuth → operational slice (`lease_held` retry, SyncRun finalization) → SyncRun
4. **UX-INV-1d** (parallelizable UI slice)
5. AI-INV-2…6 / AI-MKT-0…4 only under separate authorizations
6. Data Health / onboarding / reliability → forecast validation + M6 gates → M7 inbox/create → cash/supplier, pilot/billing/launch; Woo/Amazon/Noon by demand

---

## 0D. 2026-11-22 DOC-TRACK-2 reconciliation (CONN-1d-A/B/C closures)

> **SUPERSEDED for current-status pins** by §0E above. Retained as historical evidence (HEAD `5c1c76b`; CONN-1d-D then not started).
> **Authority for current-status pins (historical).** §0C / §0B / §0A and older Part A / Part E snapshots remain **historical evidence** — not rewritten. Prefer this §0D + living ledger § 2026-11-22 DOC-TRACK-2 + `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md`.

| Topic | Current state |
|---|---|
| HEAD | `5c1c76b` — CONN-1d-C; `main` ≡ `origin/main`; 56 migrations |
| DOC-TRACK-1 | **CLOSED/PUSHED** @ `0e2fc33` (docs-only) |
| CONN-1d-A | **CLOSED/PUSHED** @ `636725c` — V12 offline **PASS**; V11 **PARTIAL** (DB-level bypass, unsupported object types, stringified/encoded payloads) |
| CONN-1d-B | **CLOSED/PUSHED** @ `0f3e1d2` — V8 offline SQL role + claim-stub **PASS**; hosted JWT/PostgREST **NOT VERIFIED** |
| CONN-1d-C | **CLOSED/PUSHED** @ `5c1c76b` — terminal fence, lease-aware disconnect/revoke, Phase A ownership release, two-session races, β fixture compatibility; offline **PARTIAL** |
| CONN-1d-D | **PLANNED / not started** — optional docs-only acceptance report + V1–V15 re-matrix; STOP without owner authorization |
| Binding / D13 / D14 / hosted vault apply | Binding **NOT_YET_VERIFIED**; D13/D14 **DEFERRED**; four CONN vault migrations **not applied** |
| UX-INV-1d / AI-INV-2…6 / AI-MKT-0…4 / multi-provider | **Unchanged** (PLANNED; sequence preserved) |
| PE1.b.6b / workers / M6 prod / M7 create / purchasing / live Shopify / live model / launch | **Unchanged BLOCKED / NO-GO** |

### Proposed next sequence (dependency-aware; not guaranteed)

0. Owner review of DOC-TRACK-2 (optional docs Git closure) — **this pass**
1. **CONN-1d-D** (docs-only; explicit owner authorization only)
2. Production binding + KEK / hosted vault apply, V11 gap decision, hosted V8 JWT verification (separate gates) → then OAuth / SyncRun path
3. **UX-INV-1d** (parallelizable UI slice)
4. AI-INV-2…6 / AI-MKT-0…4 only under separate authorizations
5. Data Health / onboarding / reliability → forecast validation + M6 gates → M7 inbox/create → cash/supplier, pilot/billing/launch; Woo/Amazon/Noon by demand

---

## 0C. 2026-11-22 DOC-TRACK-1 reconciliation (CONN path + handoff)

> **SUPERSEDED for current-status pins** by §0D above. Retained as historical evidence (HEAD `173a357`; CONN-1d then not started).
> **Authority for current-status pins (historical).** §0B / §0A and older Part A snapshots remain **historical evidence** — not rewritten. Prefer this §0C + living ledger § 2026-11-22 + `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md`.

| Topic | Current state |
|---|---|
| HEAD | `173a357` — CONN-1c-β; `main` ≡ `origin/main` |
| CONN-0A…1c-β | **CLOSED/PUSHED** through `173a357` (PARTIAL offline; V5 two-session PASS); binding **NOT_YET_VERIFIED**; hosted vault migrations **not applied** |
| CONN-MP-0 | **CLOSED/PUSHED** @ `1e18029` (docs-only; D13/D14 **DEFERRED**) |
| CONN-1d | **PLANNED / not started** — STOP without owner authorization |
| UX-INV-1a–1c.1 | **CLOSED/PUSHED**; UX-INV-1d **PLANNED** (merchant-first task→action→result + premium polish) |
| Shopify RO.1–RO.3 | **CLOSED/PUSHED**; live nested cert **FALSE** |
| AI-INV-1 / 1.1 | **CLOSED/PUSHED** @ `38f63d6`; soft-enable **OFF** |
| AI-INV-2…6 / AI-MKT-0…4 | **PLANNED** (sequence preserved) |
| PE1.b.6b / workers / M6 prod / M7 create / purchasing / live Shopify / live model / launch | **Unchanged BLOCKED / NO-GO** |

### Proposed next sequence (dependency-aware; not guaranteed)

0. Owner review of DOC-TRACK-1 / master handoff (optional docs Git closure) — **this pass**
1. **CONN-1d** (explicit owner authorization only)
2. Production binding + KEK / hosted vault apply (separate gates) → then OAuth / SyncRun path
3. **UX-INV-1d** (parallelizable UI slice)
4. AI-INV-2…6 / AI-MKT-0…4 only under separate authorizations
5. Data Health / onboarding / reliability
6. Forecast validation + M6 production gates (after JWT where required)
7. M7 inbox/create + guarded approvals
8. Cash/supplier + scenarios; pilot / billing / launch; Woo/Amazon/Noon by demand

---

## 0B. 2026-11-20 post-closure reconciliation (RO.3 + AI-INV-1/1.1)

> **SUPERSEDED for current-status pins** by §0C above. Retained as historical evidence of RO.3 + AI-INV Git-closure pins (HEAD `38f63d6`). §0A and older §1 / Part A snapshots remain **historical evidence** — not rewritten.

| Topic | Current state |
|---|---|
| HEAD | `38f63d6` — AI-INV-1/1.1; `main` aligned with locally recorded `origin/main` |
| UX-INV-1a–1c.1 | **CLOSED/PUSHED**; latest UX `0402564` |
| Shopify RO.1 / RO.2 / RO.1.2 | **CLOSED/PUSHED** @ `0072a04` / `7fc8f2a` / `fe29703` |
| Shopify-RO.3 | **CLOSED/PUSHED** @ `4f6ef0c` (`shopify-ro.3-v1`); offline mocked tests; live nested-completeness certification **FALSE** |
| AI-INV-1 / 1.1 | **CLOSED/PUSHED** @ `38f63d6`; offline/local focused **32/32** PASS; typecheck/lint/build PASS; **2** pre-existing lint warnings; soft-enable **OFF**; not live-certified |
| AI-INV-2…6 | **PLANNED** |
| AI-MKT-0 → 1 → 1.1 → 2 → 3 → 4 | **PLANNED** (sequence preserved); no live market research / paid credits |
| PE1.b.6b / workers / M6 prod / M7 create / purchasing / live Shopify / live model / launch | **Unchanged BLOCKED / NO-GO** |
| ICP / 1,000 merchants | Hypothesis / aspirational goal — **not** traction claim |

### Proposed next sequence (dependency-aware; not guaranteed)

0. Owner review of this **post-closure docs** reconciliation (optional separate docs Git closure) — **this pass**
1. Shopify secure connectivity architecture/security + nested **live**-certification gates
2. OAuth / SyncRun read-only (after live nested cert + security)
3. AI-INV-2…6 / AI-MKT-0…4 only under separate authorizations
4. Data Health / onboarding / reliability
5. Forecast validation + M6 production gates (after JWT where required)
6. M7 inbox/create + guarded approvals (after hosted security gates)
7. Cash/supplier + scenarios
8. Pilot / billing / launch gates
9. Premium marketing hero timed to shipped capabilities
10. WooCommerce → Amazon by demand/feasibility

Full matrix, pain map, and AI gates: `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`.

---

## 0A. 2026-11-20 reconciliation addendum (DOC-2026-11)

> **SUPERSEDED for current-status pins** by §0B above. Retained as historical evidence of the pre-RO.3/AI-INV Git-closure documentation pass. Historical §1 / Part A tables that still say HEAD `7fc8f2a`, “RO.2 push pending”, “RO.1.2 Planned”, or “UX-INV-1c planned” are **preserved as 2026-11-19 snapshots**.

| Topic | State as recorded (pre-closure) |
|---|---|
| UX-INV-1a–1c.1 | **CLOSED/PUSHED**; latest UX `0402564` |
| Shopify RO.1 / RO.2 / RO.1.2 | **CLOSED/PUSHED** @ `0072a04` / `7fc8f2a` / `fe29703` |
| Shopify-RO.3 | **LOCAL IMPLEMENTED + TESTED** offline (`shopify-ro.3-v1`); **uncommitted**; **not** live-certified; owner Git acceptance **pending** |
| AI-INV-1…6 / AI-MKT | AI-INV-1/1.1 local implemented (Git pending); AI-INV-2…6 + AI-MKT-0…4 **PLANNED**; no live market research |
| PE1.b.6b / workers / M7 / live Shopify / paying launch | **Unchanged BLOCKED / NO-GO** |
| ICP / 1,000 merchants | Hypothesis / aspirational goal — **not** traction claim |

### Proposed next sequence (as recorded pre-closure — historical)

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

### Current extension (verified 2026-11-20 pre-closure) — historical pins

> **SUPERSEDED for HEAD / RO.3 / AI-INV current pins** by §0B. Table below is the pre-closure snapshot.

| Commit / state | Subject | Role (as of pre-closure) |
|---|---|---|
| `10d9de6` | Overview merchant stock attention | UX-INV-1a |
| `f1426c4` | SKU intelligence inspector | UX-INV-1b lineage |
| `0402564` | Replenishment/incoming clarification | UX-INV-1c.1 (latest UX) |
| `fe29703` | RO.1.2 Admin API 2026-10 normalizers | Then **HEAD**; **on origin** |
| Uncommitted RO.3 | `shopify-ro.3-v1` nested pagination | LOCAL IMPLEMENTED + TESTED offline; Git pending |

### Post-closure Git extension (verified 2026-11-20)

| Commit | Subject | Role |
|---|---|---|
| `4f6ef0c` | Shopify RO.3 offline nested pagination | **CLOSED/PUSHED**; live nested cert **FALSE** |
| `38f63d6` | AI-INV-1/1.1 grounded explainer + situational guidance | **HEAD**; **CLOSED/PUSHED**; soft-enable **OFF** |

**Offline test evidence (RO.3, 2026-11-20):** owner-reported **13** RO.3 + **78** Shopify + **63** CSV/provider PASS under mocks — **no** live Shopify.
**Offline test evidence (AI-INV-1/1.1):** focused vitest **32/32 PASS**; typecheck/lint/build PASS; **2** pre-existing lint warnings — **no** live model/search.

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

**Dirty tree preserved (post-closure docs pass):** modified `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`; deleted tracked `docs/StoreAgent_Roadmap_2026.docx` (archive copies exist); untracked SQL snippets, archives, AGENTS.md, vitest cache, `.tmp`, etc. RO.3 and AI-INV-1/1.1 are **no longer** uncommitted — both **CLOSED/PUSHED**.

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
| AI-INV-1 / 1.1 grounded explainer | Yes (`38f63d6`) **CLOSED/PUSHED** | Focused **32/32** + typecheck/lint/build | Offline/local only | N/A | Soft-enable **OFF**; not live-certified | No | Live model/search **Blocked**; AI-INV-2…6 **PLANNED** |
| AI-MKT-0 | Docs / feasibility | — | — | — | — | No | **CLOSED/PUSHED** @ `de01686` — see §0L |
| AI-MKT-1a | Contracts/registry/rights | — | — | — | — | No | **CLOSED/PUSHED** @ `f685c15` — see §0M |
| AI-MKT-1b | Offline adapters/fixtures | Yes (`211d8e9`) | — | — | — | No | **CLOSED/PUSHED** — see §0N |
| AI-MKT-1c | Evidence normalization/matching | Yes (`553e239`) | — | — | — | No | **CLOSED/PUSHED** — see §0O |
| AI-MKT-1d | Bounded orchestration/claim validation | — | — | — | — | No | **CLOSED/PUSHED** @ `2f6ae43` — see §0P |
| AI-MKT-1e | Guarded merchant research UX | — | — | — | — | No | **`LOCAL_COMPLETE`** offline — see §0Q |
| AI-INV-2…6 / AI-MKT-1.1…4 | Docs / roadmap | — | — | — | — | No | **PLANNED** — sequence 1.1 → 2 → 3 → 4 (1f LOCAL_COMPLETE) |
| Shopify M0.7 boundary freezes | Yes (docs/contracts) | Architecture tests | — | N/A | N/A | No | Continues as adapter law |
| Shopify RO.1 offline normalizers | Yes (`0072a04`) **CLOSED/PUSHED** | Unit normalization suites | Offline fixtures only | N/A | No live shop | No | Live cert **Blocked** |
| Shopify RO.2 transport | Yes (`7fc8f2a`) **CLOSED/PUSHED** | Transport unit PASS (suite grown since 17/17) | No live E2E | N/A | No live shop; no OAuth | No | Nested live completeness **Blocked** for SyncRun; OAuth/SyncRun **Planned** |
| Shopify RO.1.2 schema compatibility | Yes (`fe29703`) **CLOSED/PUSHED** | RO.1.2 unit suites | Offline fixtures | N/A | No live shop | No | Live shop **Blocked** |
| Shopify RO.3 nested pagination | Yes (`4f6ef0c`) **CLOSED/PUSHED** | Offline mock **TESTED** (13+) | No live E2E | N/A | Live nested cert **FALSE** | No | SyncRun complete **Blocked**; OAuth **Planned** |
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

### NOW (docs + dependency-ready slices) — updated 2026-11-20 post-closure

| ID | Merchant problem | Current state | Intended outcome | Scope / non-goals | Dependencies | Security gates | Acceptance | Evidence / release |
|---|---|---|---|---|---|---|---|---|
| DOC-2026-11-POST | Post-closure status drift | RO.3 + AI-INV Git-closed; docs lagging | One authoritative matrix @ `38f63d6` | Docs only | Git verify `38f63d6` | No hosted writes | Owner PASS review | Ledger § post-closure + AI roadmap |
| DOC-2026-11 | Conflicting status / vision sources | **Historical** pre-closure pass (`fe29703` pins) | One matrix + AI-INV roadmap | Docs only | — | No hosted writes | Pre-closure review | Keep as history; superseded by POST |
| DOC-NOV26 | (historical) | Closed into DOC-2026-11 | — | Historical | — | — | 2026-11-19 docs | Keep as history |
| UX-INV-1a–1c.1 | Overview/Inventory confusion | **CLOSED/PUSHED** through `0402564` | Decision-first local UI | No fake M7 queue | M5 reads | No engine/M7 | Local UI + units; browser cert blocked | Delivery doc |
| SHOP-RO2-GIT | RO.2 remote | **DONE** — on origin via later commits | — | — | — | — | Remote contains `7fc8f2a`+ | Historical |
| SHOP-RO1.2 | Schema vs Admin `2026-10` | **CLOSED/PUSHED** @ `fe29703` | Offline compatibility | No OAuth | RO.2 | Fail-closed | Mapping tests | Ancestor of HEAD |
| SHOP-RO3-GIT | Nested pagination offline | **CLOSED/PUSHED** @ `4f6ef0c` | Offline completeness under mocks | No live Shopify | RO.1.2 | No JWT/workers | Offline tests PASS; live cert **FALSE** | Pushed — not live SyncRun |
| AI-INV-1 / 1.1 | Unexplained inventory facts | **CLOSED/PUSHED** @ `38f63d6` | Safe read-only explainer + situational guidance | Offline/mock; soft-enable OFF; no M6/M7 | M5 reads | Abstention + isolation | Focused **32/32** + typecheck/lint/build | **HEAD**; not live-certified |
| AI-MKT-0 | Research/data rights & country feasibility | **CLOSED/PUSHED** @ `de01686` | Source matrix + MVP GO | Docs only; no live providers | Owner/legal unresolved items | Licensed sources; consent | `docs/AI_MKT_0_FEASIBILITY_AND_SOURCE_ARCHITECTURE.md` | See §0M |
| AI-MKT-1a | Contracts / registry / rights | **CLOSED/PUSHED** @ `f685c15` | Runtime DTOs + deny-by-default rights | No live/network | LEGAL open | Licensed sources; consent | `docs/AI_MKT_1A_IMPLEMENTATION_REPORT.md` | See §0N |
| AI-MKT-1b | Offline adapters / fixtures | **CLOSED/PUSHED** @ `211d8e9` | Synthetic OpenAI/Gemini adapters | No SDK/live | LEGAL open; live forbidden | Licensed sources; consent | `docs/AI_MKT_1B_IMPLEMENTATION_REPORT.md` | Closed |
| AI-MKT-1c | Evidence normalization / matching | **CLOSED/PUSHED** @ `553e239` | Normalize + product/geo match | No credits | LEGAL open; live forbidden | Licensed sources; consent | `docs/AI_MKT_1C_IMPLEMENTATION_REPORT.md` | Closed |
| AI-MKT-1d | Bounded orchestration / claim validation | **CLOSED/PUSHED** @ `2f6ae43` | Orchestration + claim validation | No live/credits | LEGAL open; live forbidden | Licensed sources; consent | `docs/AI_MKT_1D_IMPLEMENTATION_REPORT.md` | Closed — see §0P |
| AI-MKT-1e | Guarded merchant research UX | **CLOSED/PUSHED** @ `59ff8b0` | SKU panel + guarded action + safe DTO | Soft-show OFF; no live/paid | LEGAL open; live forbidden | Licensed sources; consent | `docs/AI_MKT_1E_IMPLEMENTATION_REPORT.md` | Closed |
| AI-MKT-1f | Adversarial evaluation & offline acceptance | **CLOSED/PUSHED** @ `e6943ce` | Eval fixture/runner/Vitest | Soft-show OFF; no live/paid; post-R1 **59/59** | LEGAL open; live forbidden | Licensed sources; consent | `docs/AI_MKT_1F_IMPLEMENTATION_REPORT.md` | Closed — see §0R |
| DOC-GLOBAL-1 | Four-market launch strategy | **CLOSED/PUSHED** @ `6b16caa` | US/GB/CA/AU; KPI≠cap | No runtime | UAE-first superseded | One commerce domain | `docs/DOC_GLOBAL_1_FOUR_MARKET_LAUNCH_STRATEGY.md` | Closed — see §0S |
| AI-MKT-1f-R1 | Opaque public IDs | **CLOSED/PUSHED** @ `38d63da` | `mev_`/`mfd_`/`mcf_` mapping | Soft-show still OFF | M01b PASS | Fail closed | `docs/AI_MKT_1F_R1_IMPLEMENTATION_REPORT.md` | See §0T / §0U |
| DOC-LAUNCH-1 | Launch-first readiness | **`DOCS_ONLY_COMPLETE`** | Track A/B/C; CSV pilot; M7-GAD-1 next | No runtime | Paid research OFF for core SaaS | Preserve M0.8 / gates | `docs/DOC_LAUNCH_1_COMMERCIAL_READINESS_STRATEGY.md` | See §0U |
| GEO-1 / DATA-0/1 | Registry · sources | **PROPOSED** | Docs only until authorized | Soft-show / paid gated | Separate auth each | Fail closed | AI roadmap + DOC-GLOBAL-1 | Not started |
| AI-MKT-1.1…4 | Credits → detective → opportunity → monitoring | **PLANNED only** | Scope clarified by DOC-GLOBAL-1 | No live web/AI/billing in this plan | GEO/DATA as applicable; 1.1 before paid | Licensed sources; consent | Spec in AI roadmap | Future — not authorized |

### NEXT

| ID | Focus | Notes |
|---|---|---|
| AI-MKT-1f-R1 review | Owner accept opaque public IDs | Git checkpoint when authorized; soft-show still OFF |
| AI-MKT-GEO-1 | US/GB/CA/AU registry; AE fixture-only | Next eng; before four-market research UX |
| SHOP-RO-SAFE | Secure connectivity + nested **live**-cert plan; then OAuth / SyncRun | Offline RO.3 **CLOSED/PUSHED** ≠ live nested cert; SyncRun still blocked |
| UX-INV-1d | Premium responsive polish | Parallelizable; engines unchanged; no M7 writes |
| DATA-HEALTH | Freshness, multi-store evidence, limitation noise reduction | Honest labels; no invented confidence |
| PE1.b.6b | Hosted JWT A/B isolation | Separately authorized; still BLOCKED |
| AI-INV-2/3 | Data readiness + connected context | After SyncRun signals / OAuth |
| AI-MKT-0 | Research/data rights & country/category feasibility | **CLOSED/PUSHED** @ `de01686` — no live providers; see §0L |
| AI-MKT-1a | Research contracts / registry / rights | **CLOSED/PUSHED** @ `f685c15` — live NO-GO; see §0M |
| AI-MKT-1b | Offline adapters / research fixtures | **CLOSED/PUSHED** @ `211d8e9` — live NO-GO; see §0N |
| AI-MKT-1c | Evidence normalization / matching | **CLOSED/PUSHED** @ `553e239` — live NO-GO; see §0O |
| AI-MKT-1d | Bounded orchestration / claim validation | **CLOSED/PUSHED** @ `2f6ae43` — live NO-GO; see §0P |
| AI-MKT-1e | Guarded merchant research UX | **`LOCAL_COMPLETE`** offline — live NO-GO; see §0Q |

### LATER

| ID | Focus | Gate |
|---|---|---|
| M7-INBOX / AI-INV-6 | Commercial decision inbox + decision agent | Explicit M7.2 create-class approval + hosted security |
| AI-INV-4/5 | Forecast/scenario + cash/supplier | M6 eligibility; trusted costs/quotes; no auto-buy |
| AI-MKT-1…4 | On-demand market research, credits, opportunity advisor, experiments | After AI-MKT-0; provider-independent web_search/Search-grounding adapters; never equate LLM search with verified sales |
| M6-VAL | Forecast validation / alerts | Production forecast eligibility + consent |
| WOO-AMZ | WooCommerce / Amazon | After Shopify reliability |
| LAUNCH | Billing/trial/pilot/observability | Independent launch sign-off; still NO-GO now |
| LANDING-HERO | Premium marketing hero | Timed to demonstrable shipped capabilities |

### Parallelism map

| Parallelizable now | Blocked on hosted JWT | Blocked on workers/cron | Blocked on M7 authorization |
|---|---|---|---|
| Docs post-closure review; UX-INV-1d polish; AI-INV-2…6 / AI-MKT design only if approved | PE1.c forecast canary, multi-tenant runtime claims | M5.8 hosted rollover HTTP, alert jobs | Live decision inbox, Approve/Edit/Dismiss, PO drafts |
| Shopify secure connectivity / live-cert plan (docs/architecture) | Hosted security PASS claims | Background sync schedulers | Production REORDER create |
| Landing content design (truthful CTA) | — | — | Live AI purchase claims; live model/search |

### Next smallest implementation milestone (recommended)

1. **Owner:** accept DOC-2026-11 **post-closure** docs reconciliation (RO.3 + AI-INV-1/1.1 already **CLOSED/PUSHED**).
2. **Docs:** optional DOCX Section 36+ sync (non-destructive).
3. **Next eng (separate authorization):** Shopify secure connectivity / live nested-completeness certification plan — **not** SyncRun, OAuth, or AI-MKT spend.

---

## 7. Premium responsive UX acceptance (summary)

Full detail: `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md` §Acceptance.

Viewports: 320 / 390 / 768 / 1024 / 1280 / 1440(+ ultrawide). Touch targets ≥44px. One primary attention story above the fold. Stock health ≠ calculation availability. Synthetic/demo labeled. No invented ROI. Skeletons for loading. Motion purposeful (2–3 cues), not noise.

---

## 8. Files and sync policy

| Artifact | Role |
|---|---|
| `docs/StoreAgent_Master_Roadmap_Updated_2026-11-10.docx` | Canonical DOCX — §36 DOC-CONTINUITY-6 + **§37 AI-ARCH-0 (PROPOSED)**; §§1–36 preserved; refresh Word Contents if needed |
| This file | November 2026 Markdown planning source |
| `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md` | AI-INV + merchant pain/value + 90-day sequence |
| `docs/IMPLEMENTATION_STATUS.md` | Concise pointer + current status |
| `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md` | Living ledger — authoritative matrix |
| `docs/PROJECT_HANDOFF.md` | Next-session bootstrap |
| `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md` | Overview/Inventory UX delivery |
| `docs/COMPETITIVE_UX_MERCHANT_PAIN_POINT_ROADMAP.md` | Aligned competitive UX (Actions + INV) |
| `docs/PROVIDER_ADAPTERS.md` / `SHOPIFY_RO2_TRANSPORT.md` | Shopify RO.2/RO.3 law (committed; live cert still FALSE) |

---

## 9. Owner review gate

| Gate | Verdict |
|---|---|
| Documentation reconciliation (DOC-2026-11 **post-closure**) | **PASS** (pending owner read) — **STOP FOR OWNER REVIEW** |
| DOCX non-destructive Section 36 sync | **DONE** 2026-11-27 (DOC-CONTINUITY-6; Git closure still owner-gated) |
| DOCX Section 37 AI-ARCH-0 architecture | **DONE** 2026-11-27 (**PROPOSED** only; not implementation) |
| RO.3 Git closure | **CLOSED/PUSHED** @ `4f6ef0c` — live nested cert still **FALSE** |
| RO.2 remote publish | **DONE** (historical; on origin) |
| AI-INV-1 / 1.1 offline slice | **CLOSED/PUSHED** @ `38f63d6`; soft-enable **OFF**; not live-certified |
| AI-INV-2…6 | **PLANNED** |
| AI-MKT Market Brain + launch tracks | **AI-MKT-0…1f CLOSED/PUSHED** through `e6943ce`; **DOC-GLOBAL-1** @ `6b16caa`; **AI-MKT-1f-R1 CLOSED/PUSHED** @ `38d63da`; **DOC-LAUNCH-1 DOCS_ONLY_COMPLETE** — Track A (M7-GAD-1/BILL-1/PILOT-CSV-1) ahead of Track B (GEO/DATA/1.1); 1.1…4 **PLANNED** — no live web/AI, credits, soft-show, or billing execution |
| Application/UI implementation beyond approved slices | **NO-GO** until separate slice approval |
| Workers / JWT / M6 prod / M7 / live Shopify / live model / purchasing / launch | **BLOCKED** unchanged |
