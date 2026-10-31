# M7.4a — Premium Decision-First UX Contract Freeze

**Status:** FROZEN for M7.4b demonstration UI engineering
**Baseline verified:** `main` @ `5791158` — `test(decisions): close dormant action lifecycle E2E verification`
**Authority when docs conflict:** this freeze for M7.4 merchant-facing demonstration UX; M7.2/M7.3 persistence and lifecycle remain dormant/fail-closed; M0.6 engine/math remain frozen; visual quality gated by `docs/DESIGN_SYSTEM.md`.

This freeze does **not** authorize production decision generation, production decision writers, M7.3 lifecycle RPC wiring from the UI, merchant approval persistence, M5/M6 data loaders, workers/cron/HTTP enablement, E.4 canary operations, purchase orders, supplier contact, payments, inventory mutation, hosted activation, or Git operations.

---

## 0. Verdict

| Gate | Result |
|---|---|
| Freeze this UX contract (M7.4a docs only) | **GO** |
| M7.4b demonstration Actions UI under this contract | **GO** after M7.4a freeze |
| Activate shell Actions nav | **GO only after** M7.4b UI acceptance passes |
| Wire Approve / Edit / Dismiss to M7.3 lifecycle RPCs or production actions | **NO-GO** |
| Invent live inventory, forecasts, savings, MOQ, supplier quotes, or prevented stockouts | **FORBIDDEN** |
| Imply automatic buying, supplier outreach, or payment | **FORBIDDEN** |

**Product intent:** StoreAgent must feel like a premium AI-era inventory decision workspace — decision first, evidence second, charts third — not a conventional analytics dashboard. M7.4 ships a **demonstration** of that workspace using explicit synthetic fixtures while production decision pipelines remain disabled.

---

## 1. Frozen UX decisions (approved)

1. Introduce `/app/[organizationId]/actions` as a **demonstration-only** route.
2. Activate the AppShell **Actions** nav item only when **M7.4b has passed UI acceptance**.
3. Keep Overview honest; **no** invented live opportunity counts or fake KPI strips.
4. Main desktop workspace: **decision queue + persistent evidence inspector**.
5. Mobile: **full-width queue + accessible detail sheet**.
6. Persistent messaging: **“Synthetic demonstration data — not live inventory”**.
7. Present **REORDER / REDUCE / PROMOTE / WATCH** distinctly; **HEALTHY** is a separate non-action state (never an `InventoryAction` card).
8. Show recommended quantities only when grounded in supplied synthetic fixture facts (REORDER only in V1 fixtures).
9. No invented live financial impact, forecast quality, MOQ, supplier quotes, or prevented stockouts.
10. Include a **local-only interactive Edit Quantity prototype** for REORDER that never submits an approval.
11. Approve / Edit / Dismiss remain **disabled for production**; every demo interaction clearly communicates that **no action was saved**.
12. No M7.3 RPC calls, production persistence, M5/M6 data loaders, buying, or supplier contact from this UI.
13. Accessible keyboard interactions; meaningful loading / empty / error / WATCH states.
14. Responsive from **320px** through ultrawide; avoid tight spacing and long cramped card stacks.
15. Motion communicates selection, detail reveal, and interaction feedback; honor **`prefers-reduced-motion`**.
16. Target **≥ 9/10** on `docs/DESIGN_SYSTEM.md` UX acceptance criteria.

---

## 2. Resolved design questions (A–H)

### A. Information architecture and route / navigation

| Surface | Path / placement | M7.4 rule |
|---|---|---|
| Overview | `/app/[organizationId]` (existing) | Unchanged honesty: foundation / empty real data; optional text link to demo Actions **without** fake opportunity counts |
| Actions (demo) | `/app/[organizationId]/actions` | Primary M7.4 workspace; demonstration only |
| Inventory / Forecasting / Data quality | Existing “Later” stubs | Remain inactive in M7.4 |
| AppShell Actions nav | `components/app-shell/*` | Stay **“Later” / disabled** until M7.4b acceptance; then become current for Actions route |
| Demo banner | Sticky under header / above workspace | Always visible on Actions (and any Overview deep-link copy that mentions demo) |

**Three-click rule:** Organization context → Actions → specific decision detail (desktop: select row; mobile: open sheet).

**Role chrome:** Present `organization_members.role` as today. Decide roles (`owner` / `admin` / `operator`) see disabled Approve cluster with demo messaging. `analyst` sees read-only presentation (controls hidden or explicitly “View only — demonstration”).

### B. Component hierarchy and layouts

**Hierarchy (reuse shell; add only what Actions needs):**

```
AppShell
└─ ActionsDemoPage
   ├─ DemoDataBanner
   ├─ StoreLocationContextBar          // synthetic store/location labels
   ├─ ActionsWorkspace
   │  ├─ ActionTypeFilter              // REORDER|REDUCE|PROMOTE|WATCH|+ optional Healthy skim
   │  ├─ ActionQueue
   │  │  └─ ActionRow[]                // not a dense analytics table
   │  └─ ActionEvidenceInspector       // desktop: persistent panel
   │     ├─ RecommendationHeader
   │     ├─ EvidencePanel
   │     ├─ ReasonCodeList
   │     ├─ DemoApprovalCluster        // disabled production semantics
   │     └─ ReorderEditQuantityPrototype  // REORDER only; non-submitting
   └─ ActionDetailSheet                // mobile/tablet sheet variant of inspector
```

**Desktop / ultrawide (≥1024px, within existing `max-w-[1360px]` content):**
- Horizontal split: queue ≈ 40% / inspector ≈ 60% (adjust for ultrawide without sparse emptiness or cramped stacks).
- Inspector remains persistent while selection changes (no full page navigation per SKU).
- Generous vertical rhythm; avoid long identical card towers — prefer compact **rows** with clear hierarchy.

**Tablet (768–1023px):**
- Queue dominant; inspector as large sheet or stacked panel below selection.

**Mobile (320–767px):**
- Full-width queue; selecting a row opens an accessible **detail sheet** (focus trap, Esc closes, return focus to row).
- Sticky filter chips; primary touch targets ≥ 44px.

**Out of layout scope:** forecast charts as primary chrome; multi-widget analytics dashboards; glassmorphism / rainbow AI gradients.

### C. Type-specific presentations and evidence formatting

Align labels with `InventoryActionType` / `InventoryHealthState` and evidence with `InventoryActionEvidence`.

| Kind | Queue presentation | Inspector |
|---|---|---|
| **REORDER** | Type chip + icon + label; priority; confidence; one-line why; recommended qty when fixture supplies it | Qty + recommended date (if present); Edit Quantity prototype; evidence fields |
| **REDUCE** | Distinct chip/icon/label; no qty | Explain reduce exposure; **no** qty edit |
| **PROMOTE** | Distinct chip/icon/label; no qty | Explain promote/clear; **no** qty edit |
| **WATCH** | Distinct uncertainty treatment (icon + text, not color alone) | Explicit reason codes; “insufficient / conflicting evidence” framing; no buy language |
| **HEALTHY** | **Not** in action queue as an action | Optional skim section: “No intervention — demonstration”; never Approve |

**Evidence panel fields (render only from fixture; null → “Unknown”):**
- `availableQuantity`, `incomingQuantity`
- `demandVelocity`, `daysOfStock`, `leadTimeDays`
- `safetyStockUnits`, `reorderPointUnits`, `targetStockUnits`
- `inventoryAgeDays`
- `forecastExpectedDemandUnits` (if null, show Unknown — do not invent quality scores beyond fixture `dataQualityScore`)
- `dataQualityScore` (fixture-provided only)
- `reasonCodes` (required non-empty for WATCH fixtures)

**Forbidden in M7.4 UI copy or tiles:** live cash-at-risk / revenue-at-risk as “real”; MOQ; supplier quotes; prevented stockouts; “algorithm approved”; “production eligible”.

**Confidence:** show fixture `confidence` + optional `confidenceReasonCodes`; color may not be the only indicator.

### D. Synthetic fixture schema and isolation strategy

**Module (M7.4b):** e.g. `lib/demo/m7-decision-demo-fixtures.ts` (exact path flexible; must be demo-scoped).

**Isolation rules:**
1. Fixtures are **compile-time / static** TypeScript (or JSON imported only by demo UI).
2. **No** imports from `lib/persistence/*` lifecycle/persist adapters, M5 metric loaders, M6 forecast loaders, or `evaluateFixtureInventoryDecision` as a live UI data path.
3. Every fixture root includes `demoAttestation: "m7-synthetic-demonstration-v1"` (or equivalent constant) checked by the page.
4. Banner + page title must include synthetic demonstration language; omit attestation → fail closed to empty/error demo state (do not render fake actions).
5. Fixture grain uses clearly fake demo UUIDs / labels (store, location, variant titles) — not production org data masquerading as live.
6. Shape should be **presentation-friendly** projections of domain concepts (action type, priority, confidence, recommendedQuantity for REORDER, evidence snapshot, reason codes). It must not claim M7.2 persist identity or trust flags as merchant-true.

**Recommended fixture coverage (minimum):**
- ≥1 REORDER with positive recommended quantity
- ≥1 REDUCE, ≥1 PROMOTE
- ≥1 WATCH with ≥1 reason code and at least one null evidence field
- ≥1 HEALTHY skim entry (non-action)
- ≥1 stale/insufficient evidence example

### E. Demo control interaction contract and role-aware presentation

| Control | Visibility | Behavior in M7.4 |
|---|---|---|
| **Approve** | Decide roles: visible disabled-or-demo; Analyst: hidden/view-only | Click/activate → non-blocking demo feedback: **“Demonstration only — no action was saved.”** No RPC, no navigation that implies success persistence |
| **Dismiss** | Same | Same demo feedback; no status mutation |
| **Edit Quantity** (REORDER only) | Decide roles | Local React state stepper/input; validates positive integer ≠ displayed recommendation for UX teaching; **Commit / Apply** either absent or same “no action was saved” feedback; never calls `transition_inventory_action_merchant` |
| REDUCE/PROMOTE/WATCH | — | No quantity editor |

**Copy requirements on every demo control affordance:**
- Visible helper text or aria description: production approvals disabled; demonstration only.
- Success toasts that sound like real acceptance (**“Approved”**, **“PO created”**) are **forbidden**.

**Analyst:** may open inspector and read evidence; must not appear able to approve.

### F. Responsive tokens, accessibility, and motion

**Tokens / layout:** Prefer existing shell language (`bg-[#f7f8f7]`, zinc borders, generous `rounded-2xl`/`rounded-3xl`, `min-h-11` controls). Do not introduce purple-on-white AI cliché themes or warm-cream newspaper layouts. Spacious padding; no cramped multi-card grids.

**Breakpoints (contract intent):**
- 320px: usable queue + sheet; no horizontal overflow
- 768px: improved filter + sheet/panel
- 1024px+: split workspace
- Ultrawide: content capped by existing max width; inspector does not become an empty void

**Accessibility:**
- Color not sole status encoding (icon + text + chip label)
- Focus-visible rings consistent with shell
- Detail sheet: role dialog/sheet pattern, focus trap, Esc, restore focus
- Demo banner announced (e.g. `role="status"`)
- Keyboard: Tab through queue; Enter/Space opens detail; Esc closes sheet

**Motion:**
- Selection highlight transition
- Inspector/sheet enter-exit
- Demo feedback appearance
- Under `prefers-reduced-motion: reduce`: instant or opacity-only; no slide/scale requirement

**Quality bar:** Meet every `DESIGN_SYSTEM.md` UX release gate item at ≥9/10 visual hierarchy targets and PASS on responsive/a11y/empty/error/loading/overflow/cramped/generic-template checks.

### G. Acceptance tests and visual review checklist

**Automated (M7.4b+):**
1. Actions demo route renders with synthetic banner text.
2. Fixture attestation required; missing attestation → no action rows (fail closed).
3. No network/module calls to persist or lifecycle RPCs from Actions page/client graph (architecture test on imports).
4. REORDER shows qty when fixture provides it; REDUCE/PROMOTE/WATCH do not expose qty editor.
5. HEALTHY entries never appear as approvable action rows.
6. Approve/Dismiss/Edit commit paths do not mutate URL to a “saved” state and surface “no action was saved” messaging.
7. WATCH fixture shows reason codes and Unknown for null evidence fields.
8. Keyboard: open/close detail sheet; focus return.
9. Viewport 320 / 768 / 1280 / 1600: no unintended horizontal overflow (smoke).

**Manual visual review checklist:**
- [ ] Feels decision-first, not analytics-dashboard
- [ ] Desktop ≥9/10, mobile ≥9/10, hierarchy ≥9/10
- [ ] Evidence visually connected to the selected recommendation
- [ ] No invented live money/forecast/MOQ tiles
- [ ] Demo banner impossible to miss
- [ ] Reduced-motion path acceptable
- [ ] Analyst presentation clearly non-deciding

### H. M7.4b / c / d implementation boundaries

| Phase | In scope | Out of scope / banned |
|---|---|---|
| **M7.4a** (this doc) | UX contract freeze only | UI code |
| **M7.4b** | Demo fixtures module; Actions route; banner; context bar; queue + inspector/sheet; type filter; evidence panel; loading/empty/error/WATCH states; architecture + acceptance tests; **keep Actions nav disabled** until acceptance | RPC wiring; nav activation; production loaders |
| **M7.4c** | DemoApprovalCluster + REORDER Edit Quantity prototype; role-aware chrome; interaction feedback polish | Persisted approvals; M7.3 calls |
| **M7.4d** | Motion/`prefers-reduced-motion`; ultrawide polish; visual gate sign-off; **then** enable Actions nav if acceptance passed | Hosted claim of live decisions; buying |

**After M7.4d nav enablement:** deep links and Overview text may point to Actions; Overview still must not invent live opportunity counts.

---

## 3. Relationship to backend M7

| Concern | Backend (M7.2/M7.3) | M7.4 UI |
|---|---|---|
| Decision create | Dormant / fail-closed writer | Synthetic fixtures only |
| Merchant approve | Fail-closed eligibility; RPCs exist | **Not called** |
| Evidence | Immutable snapshot on persisted rows | Demo evidence projection only |
| HEALTHY | Never an `InventoryAction` | Non-action skim only |
| Buying | Forbidden | Forbidden in copy and controls |

M7.4 success does **not** imply production algorithm approval, merchant-facing scored decisions, or lifecycle activation.

---

## 4. Documentation consistency checklist

This freeze is consistent with:
- `docs/DESIGN_SYSTEM.md` — decision-first, progressive disclosure, UX release gate, SKU inspector as side panel
- `docs/DECISION_ENGINE.md` — REORDER/REDUCE/PROMOTE/WATCH; HEALTHY non-action; WATCH reason codes; no invented evidence
- `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md` — approval ≠ PO/buy; merchant UI activation separate; eligibility fail-closed
- `docs/PROJECT_HANDOFF.md` — decision-first UX; 7-day trial product intent; M7 after M6 operational gates
- `lib/commerce-domain/types.ts` — action/evidence field vocabulary
- Existing `AppShell` — Overview live; Actions currently “Later” until post-acceptance enablement

---

## 5. Design risks and mitigations

| Risk | Mitigation |
|---|---|
| Merchants mistake demo for live inventory | Persistent banner + attestation fail-closed + “no action was saved” on every control |
| Edit Quantity looks like real acceptance | No submit-to-server; copy forbids “Approved”; local state only |
| DESIGN_SYSTEM Overview KPI list pressures fake metrics | M7.4 Overview stays honest; KPIs wait for trusted production data |
| Scope creep into full design-system rebuild | Reuse shell tokens; add only drawer/sheet, chips, skeletons needed for Actions |
| Accidental RPC/loader wiring | Architecture import bans in acceptance tests |
| HEALTHY confused with WATCH | Separate skim; different labels; HEALTHY never in approve cluster |
| Ultrawide emptiness or mobile overflow | Explicit split caps + 320px smoke tests |

---

## 6. GO / NO-GO recommendation

| Item | Recommendation |
|---|---|
| Freeze this contract (M7.4a) | **GO** |
| Implement **M7.4b** demonstration Actions UI per §2.H | **GO** |
| Enable Actions nav before M7.4b acceptance | **NO-GO** |
| Call M7.3 lifecycle / persist APIs from UI | **NO-GO** |
| Production decision writer or live metric/forecast UI binding | **NO-GO** |
| Buying / supplier / payment UX | **NO-GO** |

**Next authorized engineering step after this freeze:** M7.4b demonstration UI + fixtures + acceptance tests only. Stop before production wiring or nav enablement.

---

## 7. References

- `docs/DESIGN_SYSTEM.md`
- `docs/DECISION_ENGINE.md`
- `docs/PROJECT_HANDOFF.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/M7_0_CONTRACT_ADDENDUM.md`
- `docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md`
- `docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md`
- `lib/commerce-domain/types.ts` — `InventoryAction` / `InventoryActionEvidence` / health states
- `components/app-shell/app-shell.tsx` — navigation posture
- `app/(app)/app/[organizationId]/page.tsx` — honest Overview empty state
