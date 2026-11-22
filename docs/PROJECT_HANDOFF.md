# StoreAgent project handoff

Bootstrap for new ChatGPT / Cursor sessions.

**Read first (compact current truth):** `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md` (**DOC-TRACK-1**).
**Active PE1.b.6b continuity (JWT / authorization work):** `docs/M6_PE1_B6B_SESSION_HANDOVER.md`
Canonical status pointer: `docs/IMPLEMENTATION_STATUS.md` → living ledger `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md` § **2026-11-22 — DOC-TRACK-1 master milestone reconciliation**.
**November 2026 execution plan:** `docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md`
**AI + merchant-value roadmap:** `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`
**Overview/Inventory UX delivery:** `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md` (UX-INV-1a–**1c.1 CLOSED**; 1d **PLANNED** merchant-first simplification + premium polish)

Hosted 38→52 schema track: **CLOSED** at 52/52 (`docs/HOSTED_38to52_MIGRATION_RUNBOOK.md`). DB drift prevention Phase 1: `docs/DB_DRIFT_PREVENTION_PHASE1.md` (local checks PASS; Actions run **not** yet verified; JWT still BLOCKED). **Local Inventory CSV → Demand Metrics → Replenishment Planning acceptance (snapstore/Main, 2026-11-18): COMPLETE** — synthetic local only; ≠ hosted/JWT/M7 unlock. Shopify **RO.1–RO.3 CLOSED/PUSHED** (RO.3 @ `4f6ef0c`; live nested cert **FALSE**). **CONN-0A…1c-β CLOSED/PUSHED** through `173a357` (PARTIAL offline; binding **NOT_YET_VERIFIED**; hosted vault migrations **not applied**). **CONN-MP-0 CLOSED/PUSHED** @ `1e18029` (D13/D14 deferred). AI-INV-1 / 1.1 **CLOSED/PUSHED** @ `38f63d6` (soft-enable **OFF**). M5.6/M5.7: `docs/M5_6_HANDOFF.md`. Product roadmap DOCX — do not overwrite casually; Markdown is sync source until DOCX Section 36+ is authorized.

## 1. Thesis and non-negotiables

Data determines reality. Deterministic forecasting and inventory logic calculate decisions. AI explains, prioritizes, retrieves scoped evidence, and communicates those decisions. Merchants approve actions until automation earns trust.

- AI never owns quantities, dates, prices, confidence scores, or forecast/decision numeric truth.
- Fail closed on uncertainty; no sync≡complete; no fabricated forecasts.
- Provider-independent canonical domain; adapters normalize into it.
- Sequence: **M6 forecasting → M7 decisions → approval-gated buying** (AI-INV explains in parallel under separate gates).
- **Paying-customer launch:** **NO-GO** until separate launch acceptance (security + ops + merchant journey). PE1.b.6b ≠ launch.

## 2. Baseline

| Field | Value |
|---|---|
| Repository | StoreAgent.si |
| Branch | `main` |
| HEAD (verify) | Expect `173a357` — CONN-1c-β offline refresh fencing (ancestors: CONN-MP-0 `1e18029`; 1c-α `a918217`; 1b `00557c7`; 1a `3d1f6ad`; AI-INV `38f63d6`; RO.3 `4f6ef0c`; UX `0402564`) |
| Remote | **Aligned with `origin/main`** at DOC-TRACK-1 verification (same SHA). **No CI verification claimed** without evidence. |
| As-of | 2026-11-22 — **DOC-TRACK-1**; CONN-1c-β CLOSED/PUSHED (PARTIAL); binding **NOT_YET_VERIFIED**; PE1.b.6b JWT still BLOCKED; snapstore local planning COMPLETE (2026-11-18) |
| Hosted pin | `qlsqminsfdntpqdkhxjx` (trial; PE1 env class **Other** / Development & Testing per worksheet A2); CONN vault migrations **not hosted-applied** |

> **Superseded current-status pins:** Text expecting HEAD `38f63d6` / `1e18029` / `fe29703`, or “CONN-1c-β not begun”, is **historical**. Prefer this baseline + ledger § 2026-11-22 + `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md`.

Confirm with `git rev-parse HEAD` and `git log -1 --oneline` before editing. Preserve dirty/untracked work; no drive-by Git.

## 3. Status matrix

**Note:** M7 persistence / lifecycle **foundations** and hosted S1–S14 schema are present (ledger **52/52**); **production merchant activation** remains **BLOCKED**. Prefer `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md` + living ledger § **2026-11-22 DOC-TRACK-1** + November plan + AI-INV roadmap + this matrix + PE1.b.6b handover for current truth. Schema deploy ≠ workers/cron/JWT/M7 unlock; CONN offline close ≠ hosted vault / binding verified.

| Area | Implemented | Local verified | Hosted verified | Planned / blocked |
|---|---|---|---|---|
| M5.6D daily rollover | Yes | Yes | Schema + E.4 Stage 4 support only | HTTP/cron/multi-store/TZ **blocked** |
| M5.7 adversarial | Yes | Yes (local) | F1/T4 schema only | Worker runtime **blocked** |
| M5 workers / cron / HTTP | Code present | — | **OFF (repo config)**; live host env **not verified** | Enablement **blocked** |
| E.4 canary queue | — | — | Intentionally `queued` dirty=2 claimed=1 | **Do not drain** |
| M6 P1–P4d (local) | Yes through `6136874`+ | Yes | — | Production forecast operation **NOT APPROVED** |
| M6 hosted schema | Yes | — | **CLOSED** through `20261030200000` | Schema ≠ operation |
| PE1.b.4a / 4b synthetic lifecycle | Docs + local disposable evidence | **PASS** (offline Env-A) | N/A (not hosted proof) | ≠ JWT / PE1.c |
| PE1.b.5 gap audit | Docs | — | Catalog cited; JWT **UNPROVEN** | PE1.c **NO-GO** |
| PE1.b.6a JWT preflight | Docs @ `7d42247` | — | Plan only | Execution needs A1–A4+A6 |
| PE1.b.6b JWT runtime | Worksheet + evidence docs | — | **NOT EXECUTED** | A2 YES; A3 proposed; A1/A4/A6 open |
| M6 production persist/publish/eval | Code present | Local/tests | Row counts historically **0** | Activation **blocked** |
| M7 decisions / approvals | Schema + contracts **partial** | Partial (synthetic Actions) | Hosted S1–S14 schema **CLOSED** (52/52) | Merchant activation / create success **blocked** |
| Hosted 38→52 migrations | Disk 52 | Disposable rehearse PASS | **CLOSED** 52/52; fingerprint MATCH | Ops activation **not** authorized |
| DB drift prevention Phase 1 | Yes (file gates + workflow) | `check:migrations` + 8/8 unit PASS | Ledger dry-run owner-reported; Actions run **unverified**; RLS equivalence **unproven** | Disposable replay **not** implemented; JWT **BLOCKED**; auth `enable_signup` rename pending |
| Inventory CSV → metrics → replenishment planning | Yes (local UX + M5 binding) | **COMPLETE** snapstore/Main 2026-11-18 (20 SKUs; 7/5/7; SS/ROP/target 20/20) | — | Hosted onboarding **unproven**; incoming unknown; multi-store owner test **pending**; M7 **forbidden** |
| Overview/Inventory merchant-first UX | Spec + **UX-INV-1a–1c.1** | Unit suites; local UI | — | UX-INV-1d polish; browser automation cert **blocked**; no fake M7 queue |
| Shopify RO.1 / RO.2 / RO.1.2 | Yes offline @ `0072a04` / `7fc8f2a` / `fe29703` | Unit suites | — | Live shop **blocked** |
| Shopify RO.3 nested pagination | **CLOSED/PUSHED** @ `4f6ef0c` (`shopify-ro.3-v1`) | Offline mock tests PASS | — | Live nested cert **FALSE**; SyncRun **blocked**; OAuth **blocked** |
| CONN-0A…1c-β credential vault path | **CLOSED/PUSHED** through `173a357` | Disposable/offline suites (β V5 two-session PASS) | Migrations **not** hosted-applied | Binding **NOT_YET_VERIFIED**; CONN-1d **not started** |
| CONN-MP-0 multi-provider architecture | **CLOSED/PUSHED** @ `1e18029` (docs) | — | — | D13/D14 deferred; impl separately gated |
| CSV → Shopify → Woo → Amazon/Noon | Product locked; CSV local PASS; Shopify RO + CONN offline | CSV + RO + CONN offline | — | Live Shopify first; Woo/Amazon/Noon later |
| AI-INV-1 / 1.1 | **CLOSED/PUSHED** @ `38f63d6` | Offline/local focused **32/32** + typecheck/lint/build; soft-enable **OFF** | — | Not live-certified; no live model/search |
| AI-INV-2…6 / AI-MKT-0…4 | Docs / roadmap | — | — | **PLANNED**; AI ≠ numeric authority; no paid credits/live research |
| Billing / trial / ops | Partial docs/code | — | — | Paying launch **NO-GO** |

## 4. M5 snapshot

- **M5.6D:** CLOSED for implementation + native verification. Hosted schema deployed. Rollover HTTP **disabled**.
- **M5.7:** CLOSED for **local** adversarial engineering only. Hosted F1/T4 schema applied; worker runtime **unauthorized**.
- **Workers / cron / HTTP metric routes:** OFF by repo configuration (`.env.example` unset; no `vercel.json`/cron; gated internal routes only). Live hosting environment settings were **not** verified at M6 schema closeout.
- **E.4 canary:** Stages 0–4 closed; final request `queued` at `dirty_generation=2`, `claimed_generation=1` — leave untouched.
- Detail: `docs/M5_6_HANDOFF.md`.

## 5. M6 snapshot (through P4d + hosted schema)

Local implementation/testing committed on `main` through **`6136874`** (P1 → P4d).

| Phase | Commit(s) | Notes |
|---|---|---|
| P1 orchestrator | `cb5c371` | Deterministic forecast orchestrator |
| P2a commerce facts | `0df9666` | Bounded commerce adapter |
| P2b.1 evidence model | `d363c72`, `210f92d` | Promotion/coverage evidence |
| P2b.2a/b schema/RPCs/persistence | `d776876`, `aeff78d`, `37699c4` | Hosted `100000` / `110000` |
| P2b.2c.1 attestation | `e76a8cc` | Merchant attestation boundary |
| P2b.2c.3b outbox | `fb160e9` | Hosted `20261030120000` applied + verified |
| P2c.1 snapshot RPC | `92853fa` | Hosted `20261030130000` applied + verified |
| P2c.2–P2c.3 loader | `7f6ba7f`, `7cbd8e9` | Gated TS loader + E2E |
| P3b persistence | `c915079`, `6e40bbf` | Hosted `20261030140000` |
| P3d publication + fresh reader | `091a29c`, `a71faff`, `83c29b0` | Hosted `150000` / `160000` |
| P4a/P4b harness + integrity | `d4a91b2`, `24fa202` | Fixture-only diagnostics; live PIT unsupported |
| P4c evaluation persistence | `f179516`, `42c6111`, `4dfa844` | Hosted `20261030200000` |
| P4d diagnostic reporting | `6136874` | Pure-TS report; hard-false trust flags |

### Hosted schema closeout (verified)

- Linked project: `qlsqminsfdntpqdkhxjx` (`storeagent`).
- Migrations applied and verified: `20261030100000`, `20261030110000`, `20261030120000`–`20261030160000`, `20261030200000`.
- **Hosted schema readiness: CLOSED.** Production forecast operation remains **NOT APPROVED**.
- Correction-outbox: **7** commerce triggers installed; pending events **0** at verification.
- Hosted row counts at verification: `forecast_runs` / `sku_forecasts` / publications / `sku_forecast_current` / evaluation runs+scores all **0**.
- No evidence of automatic persist, publish, or evaluation activation.
- Diagnostic backtesting is **fixture-controlled PIT only**; live historical PIT replay remains **unsupported**.
- Production algorithm approval, automatic publication, and M7 activation are **separate future gates**.

### Open P1 tracks (non-blocking)

1. Defense-in-depth: revoke default PUBLIC/anon EXECUTE on correction-outbox **trigger functions** (optional; not required for schema close).
2. Verify live hosting env vars (`METRIC_*_WORKER_ENABLED` and any forecast activation flags) remain unset — repo gates checked; live host env **not** probed.

## 6. Next three engineering steps

1. **Owner review of DOC-TRACK-1** (`docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md`) — optional docs Git closure; **not** authorization for CONN-1d, hosted vault apply, live Shopify, or live AI.
2. **CONN-1d** (after explicit owner authorization) — then production binding / KEK / hosted vault apply gates before OAuth; offline RO.3 ≠ SyncRun complete.
3. **Parallel PLANNED:** UX-INV-1d merchant-first simplification + premium polish (separate UI slice). **Keep blocked:** PE1.b.6b JWT, workers/cron, M6 production forecast, M7 create/purchasing, real model/search, AI-MKT paid credits, paying launch. AI-INV-2…6 and AI-MKT-0…4 remain **PLANNED** only.

## 7. Hard bans

- Do not enable M5 or forecast workers, cron, or HTTP metric/rollover routes without explicit approval.
- Do not claim/recompute the E.4 canary grain left `queued` at dirty=2 / claimed=1.
- Do not treat hosted schema deploy as production forecast operation, algorithm approval, or M7 eligibility.
- Do not claim live historical PIT replay or merchant performance from fixture diagnostics.
- Do not start M7 production create, buying automation, or live Shopify connection under a docs/UX-spec task.
- Do not treat RO.3 offline CLOSED/PUSHED (`4f6ef0c`) or unit PASS as SyncRun completeness or live nested-pagination certification (`SHOPIFY_RO3_LIVE_NESTED_COMPLETENESS_CERTIFIED` remains **false**).
- Do not treat AI-INV-1/1.1 CLOSED/PUSHED as live model enablement, market research, credits, or purchasing.
- Do not treat CONN-1c-β CLOSED/PUSHED as production binding verified, hosted vault applied, OAuth, or SyncRun.
- Do not start CONN-1d, hosted vault apply, or production resolver without explicit owner authorization.
- Do not claim shipped AI Inventory Agent, merchant ROI, or 1,000 customers.
- Do not stage/overwrite roadmap DOCX / `docs/archive/` / protected dirty files unless the user explicitly asks; prefer Markdown until DOCX sync is authorized.

## 8. Product north star (preserve)

From the master roadmap / October–November 2026 addenda (do not rewrite the DOCX here):

- M6 forecasting → M7 decisions → approval-gated buying.
- M7 decision classes: **REORDER / REDUCE / PROMOTE / WATCH**.
- Available-stock planning, multi-location isolation, lead-time, supplier MOQ / supplier intelligence.
- Connectors: **CSV → Shopify → WooCommerce → Amazon** (Shopify RO offline closed through RO.3 @ `4f6ef0c`; live nested cert / OAuth / SyncRun pending).
- **7-day trial** (not 14), premium **decision-first** UX.
- AI explains only; deterministic engines own numbers.
- Position: **Inventory Decision Copilot / AI Inventory & Buying Agent** — not a stock dashboard.

## 9. Canonical docs index

| Doc | Use |
|---|---|
| `docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md` | November 2026 execution plan (DOCX sync pending) |
| `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md` | **AI-INV + merchant pain/value + 90-day sequence** |
| `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md` | Overview/Inventory UX-INV-1 delivery |
| `docs/COMPETITIVE_UX_MERCHANT_PAIN_POINT_ROADMAP.md` | Competitive UX + pain themes |
| `docs/M6_PE1_B6B_SESSION_HANDOVER.md` | **PE1.b.6b / ChatGPT–Cursor continuity** |
| `docs/M6_PE1_B6B_OWNER_AUTHORIZATION_WORKSHEET.md` | Live A1–A6 status |
| `docs/M6_PE1_B6A_HOSTED_JWT_ISOLATION_PREFLIGHT.md` | Normative JWT plan |
| `docs/M6_PE1_B6B_HOSTED_JWT_RUNTIME_EVIDENCE.md` | J1–J13 results (still empty) |
| `docs/M6_PE1_B5_HOSTED_CANARY_READINESS_GAP_AUDIT.md` | Hosted readiness gaps |
| `docs/M6_PE1_B4A_*` / `B4B_*` | Offline synthetic lifecycle contract + evidence |
| `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md` | **DOC-TRACK-1 compact current truth** |
| `docs/PROJECT_HANDOFF.md` | This file — longer session start |
| `docs/IMPLEMENTATION_STATUS.md` | Pointer → living status ledger |
| `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md` | Living milestone ledger |
| `docs/HOSTED_38to52_MIGRATION_RUNBOOK.md` | Hosted 38→52 closeout (CLOSED 52/52) |
| `docs/SHOPIFY_RO2_TRANSPORT.md` / `docs/PROVIDER_ADAPTERS.md` | Shopify RO.2/RO.3 / adapter law |
| `docs/M5_6_HANDOFF.md` | M5.6/M5.7 worker contracts |
| `docs/M5_6E_4_HOSTED_CANARY_RUNBOOK.md` | Canary ops (do not drain dirty=2) |
| `docs/FORECASTING.md` / `docs/DECISION_ENGINE.md` | Forecast / M7 contracts |
| `docs/SERVICE_ROLE_BOUNDARY.md` / `docs/BACKGROUND_JOBS.md` | Authority / jobs |
| Master roadmap DOCX | Product plan (Section 36+ sync pending) |

## 10. How to start a new chat

1. Confirm HEAD (`173a357` or newer verified closure). Confirm `main` ≡ `origin/main`. Preserve unrelated dirty-tree files.
2. Read `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md` + ledger § **2026-11-22 DOC-TRACK-1** first.
3. For PE1.b.6b: open `docs/M6_PE1_B6B_SESSION_HANDOVER.md` and paste the ChatGPT or Cursor prompt from that file.
4. For Overview/Inventory UI: read `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md` — UX-INV-1d still PLANNED; engines unchanged; no fake M7 queue.
5. Default ban: **no** CONN-1d / hosted vault apply / production forecast / workers / PE1.c / live Shopify / M7 create / paying launch without explicit approval.
6. Preserve unrelated dirty-tree files; no drive-by Git unless requested.
