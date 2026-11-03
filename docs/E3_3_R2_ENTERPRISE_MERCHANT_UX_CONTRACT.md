# E3.3-R2 — Enterprise Merchant UX Contract (Actions)

**Status:** FROZEN for subsequent R2 implementation slices (docs only until separately approved)
**Baseline verified:** `main` @ `293c67c` — `fix(actions): improve decision brief scrolling and responsive UX`
**Authority when docs conflict:**

| Concern | Authority |
|---|---|
| R2 Actions **presentation** density, queue scannability, evidence chrome, spacing tokens, screenshot acceptance | **This contract** |
| Decision Brief **content sections, Field&lt;T&gt;, grounding, generator rules** | `docs/M7_4E_AI_NATIVE_DECISION_BRIEF_CONTRACT.md` (E0) |
| AI adapter / soft-enable / validators | `docs/M7_4E_E3_AI_EXPLANATION_ADAPTER_CONTRACT.md` (E3) + E1 `lib/decision-brief/*` |
| Actions shell IA / demo isolation / no-save controls | `docs/M7_4A_DECISION_FIRST_UX_CONTRACT.md` |
| R1 scroll owner, sticky banner clearance, sheet a11y | Preserved as **R2 prerequisites** (shipped on baseline `293c67c`); R2 must not regress |
| Commercial truth (action type, qty, confidence, reason codes) | M0.6 / `lib/decision-engine/*` — **unchanged** |
| Visual quality bar | `docs/DESIGN_SYSTEM.md` (≥9/10) |
| Competitive prioritization context | `docs/COMPETITIVE_UX_MERCHANT_PAIN_POINT_ROADMAP.md` (advisory; yields to freezes) |

**This freeze does not authorize** application code, fixture invention of live metrics, AI provider/SDK changes, E0–E3.3 validator/math changes, M5–M7 calculation changes, M7.3 RPC wiring, persistence, SQL, workers/cron/HTTP, hosted operations, purchasing, supplier contact, payments, inventory mutation, dependencies, or Git operations.

---

## 0. Verdict

| Gate | Result |
|---|---|
| Freeze this R2 enterprise merchant UX contract (docs only) | **GO** |
| Implement R2 UI slices under §10 after explicit slice approval | **GO** only after this freeze |
| Regress R1 scroll owner / banner clearance / sheet Esc-focus / selection scroll reset | **NO-GO** |
| Fabricate live inventory, ROI, MOQ savings, prevented stockouts, freshness timestamps, or KPI strips | **FORBIDDEN** |
| Change AI enablement, live LLM, or brief grounding validators | **NO-GO** |
| Wire demo Try controls to M7.3 lifecycle RPCs | **NO-GO** |
| Expand search/sort beyond fields present on synthetic fixtures | **NO-GO** |
| Copy Prediko table chrome / column-letter density / dashboard wallpaper | **FORBIDDEN** |

**Product intent:** Elevate the synthetic Actions workspace to a **premium, merchant-first decision operating surface** (≥9/10): compact scannable queue, unmistakable recommendation hierarchy, honest Unknown/stale/synthetic evidence, enterprise rhythm — without becoming an analytics spreadsheet and without implying production eligibility.

---

## 1. Preconditions (locked)

R2 implementation may start only when all are true:

1. Baseline includes E3.3 synthetic Decision Brief path + E3.3 soft-enable gates (unchanged by R2).
2. **E3.3-R1** behaviors are present on `main` (verified at `293c67c`):
   - Single desktop brief scroll owner: `data-actions-brief-scroll="true"` wraps recommendation → evidence → uncertainty → next step → **DemoApprovalCluster** → Technical details.
   - Desktop inspector shell clears synthetic banner (`sticky top-[4.25rem]`, definite `100dvh` height, `overflow-hidden`).
   - Selection change resets `briefScroll.scrollTop = 0`.
   - Mobile sheet: sole scroll owner `data-actions-sheet-scroll="true"`, Esc/backdrop/close, focus restore, ≥44px close control.
   - Filter discoverability: swipe hint + thin scrollbar + edge fades below `lg`.
3. Fixtures remain `m7-synthetic-demonstration-v1`; `productionApprovalEligible=false`.
4. Page sticky banner remains visible and honest.

**R1 sticky-controls note:** E0 §2.3 historically described “sticky header: recommendation + controls.” **R1 superseded that layout.** R2 **must keep controls inside the single brief scroller** so REORDER quantity editors and Technical details remain reachable on short desktops.

---

## 2. Information architecture

### 2.1 Surfaces (unchanged topology)

```
AppShell
└─ OrganizationActionsDemoPage
   ├─ DemoDataBanner                    // sticky synthetic disclosure
   └─ ActionsDemoWorkspace
      ├─ StoreLocationContextBar        // synthetic store/location labels
      ├─ PageHeader                     // “Decision queue” + demo count
      ├─ ActionTypeFilter               // ALL | types | HEALTHY
      ├─ [R2] QueueTools (optional)     // search + sort — fixture fields only
      ├─ DecisionQueue
      │   ├─ ActionRow[]                // compact scannable rows (not KPI cards)
      │   └─ HealthySkimSection         // non-action; never approvable brief
      ├─ EvidenceInspector (xl+)        // Decision Brief, heightMode=contained
      ├─ InlineBrief (md–xl stack)      // heightMode=flow under selected row
      └─ ActionDetailSheet (<md)        // heightMode=flow; sheet owns scroll
```

**Three-click rule preserved:** org context → Actions → decision detail (select row / open sheet).

### 2.2 Merchant hierarchy (required reading order)

Merchants must perceive this order **without hunting**:

| Order | Signal | Queue | Brief |
|---|---|---|---|
| 1 | **Priority** | Badge (critical/high/medium/low); color not sole cue | Badge in recommendation strip |
| 2 | **Action** | Type chip (REORDER/REDUCE/PROMOTE/WATCH) | Type chip + human label |
| 3 | **Quantity** | Show **only** when REORDER + grounded positive qty; else omit (do not show “—” as fake qty) | Recommended quantity block; REORDER unknown → **Unknown** (not editable) |
| 4 | **Why** | One-line `conciseReason` (line-clamp 2 on narrow) | Why now / Grounded signals |
| 5 | **Evidence** | Optional 1 micro-fact max on xl queue (see §4); never a mini-dashboard | Key evidence grid |
| 6 | **Uncertainty** | WATCH: explicit “Incomplete evidence — watch only” (or equivalent) | Confidence & uncertainty section; WATCH uncertainty-first |
| 7 | **Next step** | Not on queue | Suggested next step → demo controls → Technical details |

**HEALTHY** remains a skim-only non-action. No Decision Brief, no Approve.

### 2.3 Action-type queue presentation

| Type | Queue must show | Queue must not imply |
|---|---|---|
| **REORDER** | Priority, type, product/variant, why, grounded qty when known | Auto-buy / PO created |
| **REDUCE** | Priority, type, product/variant, why | Price/discount execution |
| **PROMOTE** | Priority, type, product/variant, why | Ad publish / channel writeback |
| **WATCH** | Priority, type, product/variant, uncertainty framing | “Order anyway” / conversion to REORDER |

---

## 3. Responsive specifications

| Breakpoint | Width | Layout | Scroll ownership |
|---|---|---|---|
| Mobile S | **320** | Full-width queue; filters sticky under header+banner; row opens sheet | Sheet: `data-actions-sheet-scroll` |
| Mobile M | **390** | Same as 320; slightly more why text visible | Same |
| Tablet | **768** | Queue + **inline stacked** brief under selection; no desktop split | Page scroll; brief `flow` |
| Tablet/Laptop | **1024** | Same stack; **no** `xl` split | Page scroll; brief `flow` |
| Desktop | **1280** | Split ≈42% queue / ≈58% inspector (`xl` grid) | Brief: `data-actions-brief-scroll`; page not trapped |
| Desktop+ | **1440** | Same split; use extra width for readable evidence columns, not empty hero chrome | Same as 1280 |

**MatchMedia contracts (preserve):** desktop `(min-width: 1280px)`; tablet `(min-width: 768px)`; sheet only when neither.

**Sticky stack (preserve intent):**

- Banner: `top-16` below shell header; `lg:top-0` + `lg:z-20`.
- Filters: sticky below header+banner on `&lt;lg`; `lg:static`.
- Inspector shell: sticky top clears banner (~`4.25rem`); never paint brief under banner (including short height / browser zoom).

**Touch targets:** interactive controls ≥ **44×44px** (filter chips, row hit area, sheet close, demo steppers, Technical details summary).

**Keyboard:**

- Filter toolbar: arrow/focus as today; `aria-pressed` on chips.
- Queue rows: Enter/Space select; `aria-pressed` when selected.
- Sheet: focus trap, Esc closes, restore focus to triggering row.
- Brief: focus-visible rings; details/summary operable.
- Honor `prefers-reduced-motion`.

---

## 4. Queue density model (enterprise, not spreadsheet)

### 4.1 Desktop (≥1280) — compact list rhythm

**Chosen pattern:** **compact decision rows** (refined cards), **not** a multi-column analytics table.

Rationale (competitor-informed, not copied): merchants punish wasted column chrome and single-letter headers; StoreAgent wins with **decision rows** that scan like an ops inbox.

**Row anatomy (top → bottom, single column inside row):**

1. Leading priority accent (1–2px bar) + type chip + priority badge + confidence pill (confidence may truncate word “confidence” below ~380px).
2. Product title (semibold, truncate) + variant (muted, truncate).
3. Why line (`conciseReason`, max 2 lines).
4. REORDER qty line **only if grounded**; WATCH uncertainty line instead of why emphasis when applicable.

**Density targets:**

- Default vertical gap between rows: **8–10px** (`space-y-2`–`2.5`).
- Row padding: **12–14px** mobile / **14–16px** desktop (tighter than pre-R2 generous cards; not cramped).
- Avoid nested cards inside rows.
- Selected state: stronger border/ring; do not rely on color alone.

**Optional xl micro-evidence (slice R2.b):** at most **one** grounded numeric chip (e.g. days of stock) when `known`; if null, omit entirely — never show a gray “—” dashboard cell.

### 4.2 Tablet / mobile

- Same row hierarchy; slightly tighter title size on 320.
- No micro-evidence chips on `&lt;xl` (reduce noise).
- Sheet header remains compact: title + close + synthetic status strip.

---

## 5. Decision Brief presentation (R2 refinements)

Content ownership stays E0/E1. R2 refines **visual density and evidence chrome** only.

### 5.1 Brief section rhythm

Preserve section order from E0 / current panel:

1. Recommendation strip (type, priority, confidence, synthetic + generator badges, product/variant, qty if grounded)
2. Why now / Grounded signals
3. Key evidence
4. Confidence & uncertainty
5. Suggested next step
6. Demo controls (`DemoApprovalCluster`) — **inside scroller**
7. Technical details (`<details>`)

**Spacing:** reduce large empty bands between sections (~14–16px section gaps on desktop; ~12–14px mobile) while keeping section headers (`uppercase tracking`) readable.

### 5.2 Evidence presentation rules

| Rule | Requirement |
|---|---|
| Values | Tabular nums; readable `text-sm`+; no micro-10px primary values |
| Units | Append unit suffixes already provided by demo formatters (`days`, `/day`, etc.); do not invent units |
| **Unknown** | Literal “Unknown” + muted token (`text-zinc-400`); never `0` substitution |
| **Stale** | If fixture reason codes / confidence codes include stale signals (e.g. `stale_evidence`), surface merchant copy in uncertainty — **do not invent** `decisionAsOf` timestamps |
| **Synthetic provenance** | Page banner + brief badge `Synthetic demonstration`; Technical details may show briefMode / generator / `productionApprovalEligible=false` |
| Freshness | Demo freshness remains **unknown/synthetic**; UI must not claim “fresh live data” |
| Grid | Keep `grid-cols-1` → `min-[380px]:grid-cols-2` → `sm:grid-cols-3`; avoid 4+ cramped columns |

### 5.3 AI chrome (unchanged policy)

- Generator chip may show `AI-assisted explanation` only when E3.3 soft-enable delivers validated brief.
- R2 must not add chat composers, streaming theater, or intrusive AI callouts.
- AI remains explain-only; never implies AI decided quantity/type.

---

## 6. Search, filter, sorting (fixture-backed only)

### 6.1 Filter (existing — preserve + correctness)

Chips: `ALL`, `REORDER`, `REDUCE`, `PROMOTE`, `WATCH`, `HEALTHY`.

| Requirement | Rule |
|---|---|
| Membership | Counts = exact fixture membership for that key |
| Empty | Honest empty state; no invented rows |
| HEALTHY | Shows skim only; clears action selection; no brief |
| Discoverability | Preserve R1 swipe hint / thin scrollbar / fades on narrow |

### 6.2 Search (optional R2 slice — client-only)

**Allowed query fields (synthetic fixtures only):**

- `productTitle`
- `variantTitle`
- `conciseReason`
- human action-type label

**Rules:**

- Case-insensitive substring; local state only.
- Combines with type filter (AND).
- Empty query = no search constraint.
- No fuzzy ranking ML; no server calls; no “smart” inventory search claims.
- If omitted from a slice, queue remains filter-only (acceptable).

### 6.3 Sort (optional R2 slice — client-only)

**Allowed sort keys from fixtures:**

1. **Fixture order** (default — current behavior)
2. **Priority** — `critical → high → medium → low`, stable tie-break by fixture order
3. **Action type** — `REORDER → REDUCE → PROMOTE → WATCH`, stable tie-break by fixture order

**Forbidden:** sort by fabricated impact, cash-at-risk, forecast accuracy, or any field not on `DemoActionItem`.

---

## 7. Design tokens & spacing (R2 Actions surface)

R2 should **define CSS variables** on the Actions workspace (or reuse if already global) — implementation maps these to Tailwind utilities. Values are targets, not a new brand redesign.

### 7.1 Color (restrained)

| Token | Role | Guidance |
|---|---|---|
| `--sa-actions-bg` | Page wash | Near `#f7f8f7` (existing) — not purple, not cream-newspaper |
| `--sa-actions-surface` | Row/brief surface | White |
| `--sa-actions-border` | Default border | Zinc-200 |
| `--sa-actions-border-selected` | Selected row | Zinc-950 |
| `--sa-actions-text` | Primary text | Zinc-950 |
| `--sa-actions-text-muted` | Secondary | Zinc-500/600 |
| `--sa-actions-unknown` | Unknown values | Zinc-400 |
| `--sa-actions-banner` | Synthetic disclosure | Amber-50 / amber-200 border / amber-950 text |
| `--sa-actions-watch` | Uncertainty emphasis | Zinc-300 border + zinc-50 fill (not alarm red) |
| Priority/confidence | Existing badge system | Color **not** sole encoding |

**Forbidden:** rainbow AI gradients, glow stacks, dark-mode Actions chrome, Prediko-like dense grid lines as primary language.

### 7.2 Typography

| Role | Guidance |
|---|---|
| Page title | Semibold; tracking tight; `~1.25rem` mobile → `~1.5–1.875rem` desktop (avoid oversized marketing hero) |
| Row product | `15px`/`16px` semibold; truncate |
| Brief H2 product | `lg`/`xl` semibold; not louder than product truth |
| Section labels | `11–12px` uppercase tracking ~0.14em; zinc-500 |
| Evidence values | `text-sm` semibold tabular-nums |
| Body why | `text-sm` leading-6 |

Prefer expressive system fonts already used by the app shell; **do not** introduce a new font dependency in R2 unless separately approved.

### 7.3 Spacing scale (Actions)

| Token | px | Use |
|---|---|---|
| `--sa-space-1` | 4 | Micro gaps |
| `--sa-space-2` | 8 | Chip gaps, tight stacks |
| `--sa-space-3` | 12 | Row padding mobile, section gaps mobile |
| `--sa-space-4` | 16 | Row padding desktop, section gaps desktop |
| `--sa-space-5` | 20 | Brief header padding |
| `--sa-space-6` | 24 | Rare; avoid large empty hero bands |

**Whitespace rule:** useful breathing room between hierarchy levels; eliminate large unused vertical voids between title → filters → first row on desktop.

### 7.4 Motion

- Selection / sheet present: ≤200ms opacity/slide; `motion-reduce:animate-none`.
- No continuous animation; no bounce.

---

## 8. Competitor-informed improvements (non-copy)

| Merchant pain theme | R2 response | Explicit non-copy |
|---|---|---|
| Screen inefficiency | Compact rows + tighter brief rhythm | No letter-column tables |
| Distrust of numbers | Unknown/stale/synthetic chrome | No fake “fixed” metrics |
| Opaque why | Why line on queue + Why now in brief | No black-box AI primary story |
| Intrusive AI | Keep generator chip quiet; no chat | No onboarding spam surfaces |
| Bundle/raw-material | **Out of R2** | No fake BOM UI |

Positive benchmarks to emulate in **quality**, not UI clone: clear replenishment recommendation path, fast comprehension, trustworthy support messaging — here expressed as honest demo disclosure + decision-first hierarchy.

---

## 9. Screenshot-based acceptance criteria

Capture authenticated (or local) Actions demo at each viewport. **PASS** requires all bullets for that width.

### 9.1 Shared (all viewports)

- [ ] Synthetic banner visible; copy states not live inventory
- [ ] No horizontal overflow / page-level sideways scroll
- [ ] Touch/click targets ≥44px for filters, rows, sheet close, demo controls
- [ ] Unknown values render as “Unknown” (muted), never as `0` fill
- [ ] WATCH never shows purchase CTA language
- [ ] Demo controls show no-save / demonstration messaging
- [ ] `productionApprovalEligible` not implied true
- [ ] Color not the only status encoding
- [ ] Visual quality ≥9/10 vs `docs/DESIGN_SYSTEM.md` bar (human review)

### 9.2 320× (mobile S)

- [ ] Filters sticky; “Filters” + swipe affordance when overflow
- [ ] Queue rows show priority → action → (qty if grounded) → why/uncertainty
- [ ] Opening a row shows sheet; single sheet scroller; all brief sections reachable including Technical details
- [ ] Esc / backdrop / close restore focus to row
- [ ] Banner does not permanently obscure first queue row after scroll settle

### 9.3 390× (mobile M)

- [ ] Same as 320 with improved why readability (fewer truncations)
- [ ] Confidence pill readable; product title not colliding with badges

### 9.4 768× (tablet)

- [ ] No desktop split
- [ ] Selecting a row shows **inline** brief under that row
- [ ] Full brief reachable via page scroll (flow mode; no nested trap)
- [ ] Filters usable; Healthy skim reachable

### 9.5 1024×

- [ ] Still **stacked** (no `xl` split)
- [ ] Brief readable; evidence grid ≥2 columns where `min-[380px]` applies
- [ ] No inspector sticky shell (desktop shell is `xl` only)

### 9.6 1280×800 (desktop short)

- [ ] Split queue | brief visible
- [ ] Banner never covers brief content
- [ ] One brief scroll owner; can reach qty editor (REORDER), demo controls, Technical details
- [ ] Switching decisions resets brief scroll to top
- [ ] Queue remains scannable without oversized empty gaps

### 9.7 1440×900

- [ ] Same as 1280 with comfortable evidence density (not sparse emptiness)
- [ ] Optional micro-evidence chip (if implemented) does not clutter row hierarchy

### 9.8 Automated gates (every R2 slice)

- Focused E1/E2/E3.1–E3.3 + M7.4d a11y/responsive architecture tests PASS
- R1 scroll/banner/sheet contract tests still PASS
- `npm run typecheck` / `lint` / `build` PASS
- `git diff --check` clean on touched files

---

## 10. Implementation slices & GO/NO-GO

Slices are **narrow UI/docs/tests only**. Each requires explicit approval before coding.

| Slice | Scope | Out of scope | Exit GO when |
|---|---|---|---|
| **R2.0 Contract freeze** | This document | Any code | Stakeholder accepts §0–§11 |
| **R2.a Queue density** | Compact `ActionRow` hierarchy, spacing, selected states, copy trim | Search/sort; evidence micro-chips; AI changes | Screenshot PASS 320/390/768/1024/1280/1440 for queue; tests green; R1 preserved |
| **R2.b Brief evidence chrome** | Unknown/stale emphasis, evidence value readability, section spacing, provenance badge consistency | New evidence fields; freshness invention; AI | Brief screenshot PASS; Unknown/WATCH cases PASS; R1 scroll reachability PASS |
| **R2.c Queue tools (optional)** | Client search and/or priority/type sort on fixture fields | Server search; new fixture fields; impact sort | Filter+search/sort correctness tests; empty states honest |
| **R2.d Token polish** | CSS variables / spacing rhythm / typography tweaks on Actions surfaces | Global redesign; new fonts/deps; dark mode | ≥9/10 human review; no a11y regressions |
| **R2.e Acceptance closeout** | Update architecture tests for R2 contracts; manual screenshot checklist signed | Hosted ops; live data | All §9 checklists + automated gates PASS |

### Slice gate table

| Action | Verdict |
|---|---|
| Freeze R2.0 (this doc) | **GO** |
| Implement R2.a–R2.e under this contract after per-slice approval | **GO** |
| Start R2 before R1 behaviors present | **NO-GO** |
| Alter E0–E3.3 validators, AI soft-enable semantics, or M5–M7 math | **NO-GO** |
| Add live metrics/KPI wallpaper / buying / M7.3 wiring | **NO-GO** |
| Bundle/BOM, scenarios, connector UX | **NO-GO** (separate roadmaps) |

---

## 11. Unresolved decisions (explicit)

These are **not** silently assumed. Resolve in R2.a–R2.c slice approvals:

| ID | Decision | Options | Default if unresolved at R2.a start |
|---|---|---|---|
| U1 | Desktop queue pattern | Compact rows (recommended) vs true multi-column table | **Compact rows** |
| U2 | Ship search in R2? | R2.c yes / defer | **Defer** (filter-only) unless slice explicitly includes R2.c |
| U3 | Default sort | Fixture order vs priority sort | **Fixture order** |
| U4 | xl micro-evidence chip | One known fact / none | **None** until R2.b/R2.a explicitly enables |
| U5 | Stale visual treatment | Copy-only in uncertainty vs additional “Stale evidence” pill on queue for WATCH fixtures with `stale_evidence` | **Copy-only in brief uncertainty** for R2.a; optional queue pill in R2.b |
| U6 | Page title size | Keep current / further reduce on xl | **Slightly compact** per §7.2; no marketing hero |
| U7 | Token delivery | Tailwind-only classes vs CSS variables on workspace root | **Tailwind-first**; variables optional in R2.d |

---

## 12. Non-goals (hard)

- Live inventory, forecasts, or org-scoped production decisions
- Fabricated financial impact, MOQ, supplier quotes, prevented stockouts
- AI provider changes, prompt changes, or new AI surfaces
- M7.3 persistence/approval wiring
- Workers, SQL, hosted canary/operations
- Prediko clone UI
- Bundle/component inventory
- Planning scenarios
- New npm dependencies / font packages (unless separately approved outside R2)

---

## 13. References

- `docs/COMPETITIVE_UX_MERCHANT_PAIN_POINT_ROADMAP.md`
- `docs/M7_4A_DECISION_FIRST_UX_CONTRACT.md`
- `docs/M7_4E_AI_NATIVE_DECISION_BRIEF_CONTRACT.md`
- `docs/M7_4E_E3_AI_EXPLANATION_ADAPTER_CONTRACT.md`
- `docs/DESIGN_SYSTEM.md`
- `components/actions-demo/*` (current implementation baseline)
- `tests/unit/m7-4e-e2-decision-brief-ux.test.ts` (R1 scroll contracts)
- `tests/unit/m7-4d-actions-ux-accessibility.test.ts`
- `lib/demo/m7-decision-demo-fixtures.ts`

---

**End of E3.3-R2 contract.** Implementation requires a separate explicit slice approval. STOP.
