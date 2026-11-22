# Merchant UX Delivery — Overview & Inventory Intelligence (UX-INV-1)

**Status:** UX-INV-1a **CLOSED/PUSHED** (`10d9de6`) · UX-INV-1b **CLOSED/PUSHED** · UX-INV-1c **CLOSED/PUSHED** · UX-INV-1c.1 **CLOSED/PUSHED** (`0402564`, latest UX) · UX-INV-1d still **PLANNED**
**Authorizes:** Overview honesty + Inventory stock-health / cover-availability presentation only.
**Does not authorize** engine formula changes, M7 activation, workers, JWT, Shopify live sync, purchasing, or Git operations.
**Parent plan:** `docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md`
**AI + premium homepage roadmap:** `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md` §4 (CURRENT vs FUTURE)
**Compact handoff:** `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md`
**Authoritative status:** ledger § 2026-11-22 DOC-TRACK-1
**Yields to:** M5 metrics contracts, `docs/INVENTORY_FORMULAS.md`, inventory readiness types, M7.4a / E3.3-R2 (Actions demo), `docs/DESIGN_SYSTEM.md`.

### 2026-11-22 DOC-TRACK-1 note (UX-INV-1d scope — PLANNED only)

Current local screenshots show excessive explanations, repeated readiness warnings, and limited action prominence. **UX-INV-1d remains PLANNED** (not implementation permission under DOC-TRACK-1):

- Merchant-first **task → action → result** dashboard simplification + premium responsive polish
- One primary next safe task; actionable attention queue; short merchant-friendly explanations
- Expandable evidence/provenance; clear results and next step
- Preserve honest Unknown/stale states; **no fake M7 action authorization**

---

## 1. Problem

Local Inventory → Metrics → Planning is **engineering-accepted** on synthetic snapstore data, but the merchant Overview and Inventory surfaces still read as an **operations/readiness console**, not a **decision copilot**.

Browser/source review findings (presentation issues; calculations remain authoritative):

| Finding | Source signal |
|---|---|
| Overview H1 is operational (“Imported inventory is available.”) | `app/(app)/app/[organizationId]/page.tsx` |
| Current State can claim sales/planning still missing while readiness may show them present | Hardcoded commercial-block sentence on Overview |
| “Tenant boundary active” dominates as a primary card | Overview foundation aside |
| “Known cover” + green checkmark = calculable cover, not healthy stock | `statusLabel("valid")` → “Known cover” |
| Zero/low stock can still appear “known/good” when cover is valid at 0 days | Valid cover path uses emerald `CheckCircle2` |
| Repeated limited-history chips (e.g. 3/30, 4/30) create noise | History chip on many rows |
| “Zero demand” can sound definitive under sparse history | Cover copy + filter label |
| Incoming attestation is accurate but hard to interpret | Readiness / incoming unknown fence |
| Replenishment settings show assumptions without impact framing | Settings UX (placeholders ≠ defaults already honest) |
| Long table, weak attention hierarchy, technical labels | Inventory workspace |

---

## 2. Product goals for this milestone

Help merchants:

1. See **what deserves attention first** (stock risk / excess review), not only whether import/metrics exist.
2. Distinguish **data availability** from **stock health**.
3. Trust **limitations** (unknown incoming, short history, synthetic Actions).
4. Know the **next safe step** (import, refresh, set planning days, review SKUs) without unlocking forbidden commercial actions.

**Non-goals**

- Fake production decision queue or live REORDER/REDUCE/PROMOTE/WATCH.
- Changing SS/ROP/target formulas, metric writers, or server actions.
- Invented confidence, cost, savings, or stockout prevention claims.
- Enabling M7, workers, JWT, or Shopify live connection.

---

## 3. Information architecture

### 3.1 Overview (decision-first)

Above the fold (one composition):

1. **Brand/product context** (existing shell) + store/location scope chip.
2. **Attention headline** — e.g. what needs review now (derived only from accepted readiness + metric fields), not “import succeeded.”
3. **One supporting sentence** — freshness + honesty fence (commercial recommendations remain separately gated).
4. **CTA group** — next safe step (Inventory attention / import / replenishment settings / synthetic Actions clearly labeled).
5. **Secondary:** data freshness + planning completeness as supporting evidence, not the hero.

Demote “Tenant boundary active” to Settings/security disclosure or footer meta — not a primary merchant card.

**Current State rules**

- If sales history + aligned demand + planning days are present, **do not** say they are missing.
- If commercial create is blocked, say **recommendations stay unauthorized** — not “waiting for sales/planning” when those exist.
- Prefer readiness summary fields already computed in `loadMerchantDecisionReadiness` / assess outputs over hardcoded contradictory copy.

### 3.2 Inventory intelligence workspace

Primary job: **attention-ranked SKU evidence**.

| Layer | Merchant language | Technical evidence (progressive) |
|---|---|---|
| Attention filters | Needs stock review / Excess cover review / No recent sales / Data gaps | Maps to existing cover/priority enums without renaming engines |
| Stock health | Low/zero on-hand, near ROP, high days cover | Separate from “cover calculable” |
| Calculation availability | Cover available / unavailable + reason | Keep reason codes; soften labels |
| History honesty | “Limited sales history” not “forecast confidence” | Eligible days chip; collapse repeats into filter/summary |
| Incoming | “Incoming not confirmed” | Unknown ≠ 0; guided attestation later |
| Planning | “Your replenishment assumptions” + impact plain language | lead/safety/review → SS/ROP/target relationship |

### 3.3 Semantics that must not collapse

| Concept | Means | Must not imply |
|---|---|---|
| Known / calculable cover | Days-of-stock could be computed | Stock is healthy |
| Zero on-hand | Adverse stock condition | Always “zero demand” |
| Known-zero demand | Observed velocity 0 with known metric | Permanent “never sells” certainty |
| Short / limited history | Sparse eligible days | High-confidence zero or trend |
| Incoming unknown | No trusted PO incoming evidence | Incoming is 0 |
| Planning complete | Org days present; thresholds computable | M7 commercial eligibility |
| Read-only stock signal | Derived from accepted M5 metrics | Authorized M7 action |

---

## 4. Copy direction (examples — not final microcopy)

| Avoid | Prefer |
|---|---|
| Imported inventory is available. | Review stock that needs attention. |
| …blocked until sales and planning evidence arrive. (when present) | Recommendations stay off until separately authorized. Sales and planning inputs are present for N SKUs. |
| Tenant boundary active (hero) | Organization secured · details in Settings |
| Known cover (green = good) | Cover calculated · N days — or Stock health: critical/low/adequate/excess |
| ZERO DEMAND | No sales in window · limited history if sparse |
| Incoming attestation jargon alone | Incoming not confirmed — available stock may be incomplete |

---

## 5. Delivery slices (implementation later)

| Slice | Scope | Engine changes | Unlock |
|---|---|---|---|
| **UX-INV-1a** | Overview honesty + attention summary + demote tenant card | None | **CLOSED/PUSHED** @ `10d9de6` |
| **UX-INV-1b** | Inventory stock-health vs cover availability; filter/label pass; history noise reduction; SKU inspector lineage | None (presentation/ranking only) | **CLOSED/PUSHED** (inspector `f1426c4`) |
| **UX-INV-1c** | Replenishment impact copy + incoming guided explanation (read-only) | None | **CLOSED/PUSHED** |
| **UX-INV-1c.1** | Clarification pass on replenishment/incoming evidence merchant UX | None | **CLOSED/PUSHED** @ `0402564` |
| **UX-INV-1d** | Merchant-first task→action→result simplification + premium responsive polish (skeletons, motion, density); reduce repeated readiness chrome; increase action prominence | None | **PLANNED** (DOC-TRACK-1 recorded; not authorized to implement here) |
| **UX-INV-PO** (later) | Guided PO incoming evidence workflow | Only if separately contracted attestation writers | Fail-closed completeness rules |
| **Marketing hero / Decision Inbox / AI assistant** | See AI roadmap §4 | Separately gated | **FUTURE** — no fabricated metrics or active buying |

Actions E3.3-R2 remains the **demo decision inbox** track. Do not merge live M7 into Overview under UX-INV-1.

### CURRENT UI vs FUTURE (honesty fence)

| CURRENT (shipped local) | FUTURE (not shipped; do not advertise as live) |
|---|---|
| Attention-first Overview; stock≠cover≠eligibility; SKU Intelligence inspector; replenishment/incoming copy | Grounded AI Q&A (AI-INV-1); live Decision Inbox; Approve/Edit/Dismiss; cash/$ impact; marketing hero claiming AI buying agent |
| Synthetic Actions entry explicitly labeled | Production REORDER/REDUCE/PROMOTE/WATCH |
| Manual CSV freshness | Live Shopify SyncRun health |

**Acceptance (premium):** 320px–ultrawide; accessible; performant; motion-respectful; no flicker; no cramped admin-table experience; progressive disclosure; no fabricated AI recommendations or active buying buttons on CURRENT surfaces.

---

## 6. Acceptance specification

### 6.1 Functional / honesty

- [x] Overview never claims sales/planning missing when readiness marks them available. *(UX-INV-1a)*
- [x] Overview never presents a production decision queue. *(UX-INV-1a)*
- [x] Zero/low on-hand is never styled as “healthy” solely because cover is calculable. *(Inventory UX-INV-1b)*
- [x] Known-zero demand rows disclose limited history when eligible days are sparse. *(UX-INV-1b)*
- [x] Incoming unknown remains visually distinct from zero. *(UX-INV-1c)*
- [x] Planning complete ≠ commercial eligibility messaging. *(UX-INV-1a)*
- [x] Synthetic Actions entry remains explicitly synthetic. *(UX-INV-1a)*
- [x] No new invented confidence, cost, or savings figures. *(UX-INV-1a)*

### 6.2 Responsive / a11y

| Viewport | Expectation |
|---|---|
| 320 / 390 | Single column; primary attention + one CTA; table → stacked cards or horizontal scroll with sticky identity |
| 768 | Filters usable; no nested scroll traps |
| 1024 / 1280 | Attention summary + table without cramped chrome |
| 1440+ | Generous spacing; no sparse “empty dashboard” look; avoid wallpaper KPI cards |

- Touch targets ≥44px.
- Focus order logical; status not color-only.
- Skeletons for metric/inventory loads; empty/error honest.

### 6.3 Visual quality

- Premium hierarchy aligned with `docs/DESIGN_SYSTEM.md` bar.
- Motion: ≥2 purposeful cues (e.g. attention list entrance, filter transition) — not decorative noise.
- Prefer existing design tokens; avoid generic purple/dashboard clichés called out in design rules when introducing new chrome.

### 6.4 Verification (when implementation authorized)

- Update/extend `tests/unit/inventory-workflow-ux.test.ts` for Overview copy contracts.
- Inventory unit coverage for health vs availability labels.
- Manual or Playwright viewport checklist (320–1440).
- typecheck / lint / build; no formula golden drift.

---

## 7. Dependencies and fences

| Depends on | Does not depend on |
|---|---|
| Existing readiness + inventory intelligence reads | PE1.b.6b JWT PASS |
| Local snapstore metric semantics (for fixtures) | Hosted workers/cron |
| Design system | M7 production create |
| Separate UI slice approval | Shopify live SyncRun |

---

## 8. GO / NO-GO

| Action | Verdict |
|---|---|
| Keep this as the Overview/Inventory UX delivery contract | **GO** (docs) |
| Implement UX-INV-1a under a later explicit slice | **CLOSED/PUSHED** (2026-11-19) |
| Implement UX-INV-1b Inventory stock-health / SKU attention | **CLOSED/PUSHED** (browser cert BLOCKED) |
| Implement UX-INV-1c / 1c.1 replenishment + incoming | **CLOSED/PUSHED** @ `0402564` (browser cert BLOCKED without authorized session) |
| UX-INV-1d merchant-first simplification + premium polish | **PLANNED** — requires separate UI slice authorization |
| Ship fake M7 inbox on Overview | **NO-GO** |
| Change formulas / enable workers / JWT / live Shopify from this doc | **NO-GO** |
