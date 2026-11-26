# StoreAgent Implementation Status (pointer)

The full living status ledger is:

`docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md`

**Canonical compact handoff:** `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md` (**DOC-TRACK-1** … **DOC-TRACK-5**).

**Authoritative current-state table (use this, not older pins):** ledger § **2026-11-26 — DOC-TRACK-5 FE-ACCEPT-1C continuity**. Current V1–V15 status and owner decisions: `docs/SHOPIFY_CONN_1D_F_SECURITY_EXIT_READINESS_REPORT.md`. Offline readiness: `docs/CONN_HR_1_HOSTED_READINESS_RUNBOOK.md`.

> **Superseded current-status pointers:** ledger § 2026-11-25 DOC-TRACK-4 (HEAD `454f7ec`), § 2026-11-24 DOC-TRACK-3 (HEAD `5de98cf`), § 2026-11-23 CONN-1d-D (HEAD `b3ac033`), § 2026-11-22 DOC-TRACK-2 (HEAD `5c1c76b`), § 2026-11-22 DOC-TRACK-1 (HEAD `173a357`, CONN-1d not started), § 2026-11-20 post-closure (HEAD `38f63d6`) and § DOC-2026-11 pre-closure (`fe29703` / RO.3 uncommitted / AI-INV PLANNED) remain **historical evidence** — do not treat as fresher than § 2026-11-26.

Historical snapshot: `docs/archive/IMPLEMENTATION_STATUS.md`

**November 2026 execution plan:** `docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md`
**AI + merchant-value roadmap:** `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`
**Overview/Inventory UX delivery:** `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md`
**Session bootstrap:** `docs/PROJECT_HANDOFF.md`
**Canonical DOCX:** `docs/StoreAgent_Master_Roadmap_Updated_2026-11-10.docx` — **Section 36+ Markdown sync PENDING** (do not treat older DOCX status tables as fresher than this pointer + ledger § 2026-11-26).

## Git baseline (current — 2026-11-26 DOC-TRACK-5)

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `1edc1ff` — `test(e2e): automate FE-ACCEPT-1C magic-link merchant acceptance` |
| vs `origin/main` | **Aligned** (same SHA; **no CI claim**) |
| FE-ACCEPT-1C | **CLOSED/PUSHED** @ `1edc1ff` — local authenticated browser certification **PASS** (≠ hosted/production) |
| DOC-TRACK-3 | **CLOSED/PUSHED** @ `7bd2e8b` (docs-only) |
| CONN-HR-0 | **CLOSED** (LOCAL-ONLY read-only preflight; chat evidence; no hosted SQL) |
| CONN-HR-1 | **CLOSED/PUSHED** @ `454f7ec` — offline readiness package; PARTIAL; hosted P1–P9 **not run** |
| Apply method | CLI `db push` of #5 **BLOCKED** (`25P01`); Option B single-txn `psql` disposable **PASS**; hosted apply **NO-GO** |
| CONN-1d-E | **CLOSED/PUSHED** @ `5de98cf` — DB + app JSON secret guards; offline **PARTIAL**; migration `20261124120000`; not hosted-applied |
| CONN-1d-D | **CLOSED/PUSHED** @ `40d5888` (docs) — historical V1–V15 re-matrix |
| V1–V15 / CONN-1 exit | 14 offline PASS · V11 **PARTIAL**; V8 offline PASS under §11, hosted **NOT VERIFIED**; §11 unchanged; **CONN-1 exit UNMET** |
| DOC-TRACK-2 | **CLOSED/PUSHED** @ `b3ac033` (docs-only) |
| CONN-1d-C | **CLOSED/PUSHED** @ `5c1c76b` — terminal fence + lease-aware disconnect/revoke + Phase A ownership release; offline **PARTIAL**; migration `20261122140000` |
| CONN-1d-B | **CLOSED/PUSHED** @ `0f3e1d2` — V8 offline SQL role + claim-stub **PASS**; hosted JWT/PostgREST **NOT VERIFIED** |
| CONN-1d-A | **CLOSED/PUSHED** @ `636725c` — V12 offline **PASS**; app-layer V11 guards (superseded in part by 1d-E) |
| DOC-TRACK-1 | **CLOSED/PUSHED** @ `0e2fc33` (docs-only) |
| Migration inventory | **57** files / **57** manifest entries (latest `20261124120000`); hosted schema track still **52** |
| Hosted CONN migrations | **Not applied / not authorized** — `20261121120000` → `20261122120000` → `20261122130000` → `20261122140000` → `20261124120000` |
| Production binding | **`NOT_YET_VERIFIED`**; D13/D14 **not resolved (DEFERRED)** |
| CONN-1c-β | **CLOSED/PUSHED** @ `173a357` — PARTIAL offline; V5 two-session disposable PG PASS |
| CONN-MP-0 | **CLOSED/PUSHED** @ `1e18029` — docs-only; D13/D14 **DEFERRED** |
| CONN-1c-α / 1b / 1a / 0A | **CLOSED/PUSHED** @ `a918217` / `00557c7` / `3d1f6ad` / `965e6d7` — hosted vault migrations **not applied** |
| Shopify RO.3 | **CLOSED/PUSHED** @ `4f6ef0c`; live nested cert **FALSE** |
| AI-INV-1 / 1.1 | **CLOSED/PUSHED** @ `38f63d6`; soft-enable **OFF**; not live-certified |
| UX-INV-1a–1c.1 | **CLOSED/PUSHED** through `0402564`; local FE-ACCEPT-1C browser cert **PASS** @ `1edc1ff`; UX-INV-1d **PLANNED** |
| Prior pins (ancestors) | `454f7ec` CONN-HR-1 · `5de98cf` 1d-E · `7bd2e8b` DOC-TRACK-3 · `38f63d6` AI-INV · `4f6ef0c` RO.3 · `fe29703` RO.1.2 · `7fc8f2a` RO.2 · `0072a04` RO.1 |
| Next eng | **CONN-HR-2** (after DOC-TRACK-5 docs Git closure; hosted P1–P9 + reviewed Option B artifact; no apply alone) — STOP without owner authorization |

> **STALE WARNING:** Any doc still pinning HEAD `454f7ec` / `5de98cf` / `7bd2e8b` / `b3ac033` / `5c1c76b` / `173a357` / `38f63d6` / `1e18029` / `fe29703`, 56 migrations, four pending CONN migrations, “CONN-HR-0 next”, “browser automation cert BLOCKED” as *current* truth, or “CONN-1d-D/1d-E not started”, as *current* truth is **superseded** by ledger § 2026-11-26 DOC-TRACK-5 + `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md`.

## Shopify connector track

| Slice | State |
|---|---|
| M0.7 adapter boundary freezes | Implemented (contracts) |
| RO.1 offline normalizers | **CLOSED/PUSHED** @ `0072a04` (fixtures **not** live-certified) |
| RO.2 GraphQL transport | **CLOSED/PUSHED** @ `7fc8f2a`; docs `SHOPIFY_RO2_TRANSPORT.md` |
| RO.1.2 schema compatibility | **CLOSED/PUSHED** @ `fe29703` (`shopify-ro.1.2-v1`) |
| RO.3 nested pagination completeness | **CLOSED/PUSHED** @ `4f6ef0c` (`shopify-ro.3-v1`); offline mocked tests; **live nested-completeness certification FALSE** |
| Nested pagination as SyncRun “complete” | **Hard gate** — offline RO.3 ≠ live SyncRun complete |
| CONN-0A / 1 vault / 1a / 1b / 1c-α / 1c-β | **CLOSED/PUSHED** through `173a357` (PARTIAL offline; binding **NOT_YET_VERIFIED**; hosted apply **BLOCKED**) |
| CONN-1d-A / 1d-B / 1d-C | **CLOSED/PUSHED** @ `636725c` / `0f3e1d2` / `5c1c76b` (PARTIAL offline; V12 + V8 offline PASS; V11 PARTIAL; hosted JWT NOT VERIFIED; hosted apply **BLOCKED**) |
| CONN-1d-D | **CLOSED/PUSHED** @ `40d5888` (docs-only re-matrix) |
| CONN-1d-E | **CLOSED/PUSHED** @ `5de98cf` (V11 DB + app guards; PARTIAL offline; `20261124120000` not hosted-applied) |
| CONN-1d-F / DOC-TRACK-3 | Read-only audit + owner decisions recorded; **CLOSED/PUSHED** @ `7bd2e8b`; CONN-1 exit **UNMET** |
| CONN-HR-0 / HR-1 | HR-0 **CLOSED** LOCAL-ONLY; HR-1 **CLOSED/PUSHED** @ `454f7ec` (offline PARTIAL; CLI #5 **25P01**; Option B disposable PASS; hosted **NO-GO**) |
| CONN-HR-2 | **NEXT** — hosted P1–P9 + reviewed Option B artifact (not started) |
| OAuth / SyncRun / live shop | **Blocked / Planned** |
| CONN-MP-0 | **CLOSED/PUSHED** @ `1e18029` (docs-only; D13/D14 deferred) |
| WooCommerce / Amazon / Noon | **Planned** after Shopify-first path (Amazon/Noon enum needs contract change) |

## Hosted 38→52 migration alignment — CLOSED (2026-11-11)

| Field | Value |
|---|---|
| Project | `qlsqminsfdntpqdkhxjx` |
| Ledger | **52/52** |
| Latest | `20261110140000` |
| Deployed | S1–S14 (`db push` completed successfully) |
| S4 EXECUTE | authenticated/anon/service_role = true/false/false |
| S5 table grants | auth no DML; service_role SELECT/INSERT/UPDATE (no DELETE) — **PASS** |
| S6 EXECUTE | authenticated/anon/service_role = true/false/false — **PASS** |
| M5.6E.4 canary | `queued`, dirty=2 / claimed=1 / applied=1 / attempt=0; leases NULL; metric 0/0/7 |
| Foreign fingerprint | `59d7d64dbcc254544f04cdb81ccff699` **MATCH** |
| Runbook | `docs/HOSTED_38to52_MIGRATION_RUNBOOK.md` |

**Migration deployment COMPLETE ≠ operational activation.** Workers OFF, cron OFF, PE1.b.6b LIMITED JWT gates unchanged, M7 production-create rejection preserved (`PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE`), merchant eligibility=false, purchasing disabled. Hosted schema pin remains **52**; five CONN migrations (53–57) are **not** on this hosted ledger.

### Grant-hardening notes (hosted default privileges)

| Step | Issue | Fix |
|---|---|---|
| S4 | Initial hosted fail: ambient `service_role` EXECUTE on profile RPC | Explicit `REVOKE ALL … FROM service_role`; SHA `b8fd3741…` |
| S5 | Ambient table ALL left `service_role` DELETE | `REVOKE ALL` then `GRANT SELECT,INSERT,UPDATE`; SHA `8385aa77…` |
| S6 | Ambient `service_role` EXECUTE on first-store RPC | Explicit `REVOKE ALL … FROM service_role`; SHA `e312967f…` |

Backup / disposable restore / batch rehearsal evidence lives under `~/Library/Application Support/StoreAgent/` (not committed). See runbook for paths and SHA manifest.

## Database drift prevention — Phase 1 (2026-11-18)

Authoritative detail: `docs/DB_DRIFT_PREVENTION_PHASE1.md`.

| Field | Value |
|---|---|
| Implementation | **Complete** — integrity checker, `supabase/migrations.sha256`, `npm run check:migrations`, unit tests, `.github/workflows/db-drift-prevention.yml`, `[db.seed] enabled = false` |
| Local checks | `check:migrations` **PASS**; migration-integrity unit tests **8/8 PASS** |
| Disk / hosted ledger (owner-reported) | Disk **57**; hosted schema track still **52** (CONN not applied); `db push --remote --dry-run` historically up to date at 52 |
| GitHub Actions execution | **NOT YET VERIFIED** on GitHub |
| Hosted schema/RLS equivalence | **NOT PROVEN** by this gate |
| Disposable migration replay | CONN-HR-1 disposable tooling **EXISTS** (offline); hosted JWT isolation (PE1.b.6b) still **BLOCKED** |
| Auth config | `[auth.email|sms] enable_signup` deprecated (CLI v3) — **WARN only**; pending compatibility work; **not changed** |
| Seed / merchant data | Local synthetic inventory/sales must **never** promote to production migrations, seeds, or hosted copies |

**Phase 1 ≠ release unlock.** Workers/cron remain OFF; M7 production create and purchasing remain forbidden.

## Local Inventory → Demand Metrics → Replenishment Planning — COMPLETE (2026-11-18)

Synthetic **local** acceptance only (`snapstore` / America/Chicago). **≠** hosted readiness, production recommendations, or measured merchant outcomes.

| Field | Evidence |
|---|---|
| Scope | Local Supabase API `:55321` / Postgres `:55322`; org planning + store metrics for snapstore/Main |
| Chicago business date | **2026-11-18** |
| Inventory | **20** latest positions / **60** snapshots (Nov 11 + 12 + 18 ×20) |
| Sales | **25** orders / **25** items — unchanged through planning save |
| Demand metrics | **20/20** current-day grains; source events consumed; recompute succeeded; **0** open work |
| Replenishment settings | Persisted `organization_planning_inputs`: **lead=7, safety=5, review=7** |
| Thresholds | **20/20** match `SS=ceil(v30×5)`, `ROP=ceil(v30×7+SS)`, `Target=ceil(v30×14+SS)` |
| Demand semantics | **12** positive v30; **8** known-zero v30 (`SS/ROP/Target=0`, cover `zero_demand`) — **0** unknown v30 |
| Incoming / actions | Incoming **unknown** 20/20; `inventory_position` null; **no** invented ROQ; `inventory_actions=0` |
| Merchant UX | CSV kind detection; one next action; freshness labels; explicit store/location scope; responsive evidence workspace; **Replenishment settings** copy; ready-state banner reflects planning unknown/partial/complete without unlocking commercial eligibility |
| Implementation HEAD pin (acceptance) | Inventory/CSV/freshness/replenishment UX on `main` @ `457a516` (+ readiness `970bab0`); UX-INV through `0402564`; Shopify RO through `4f6ef0c`; AI-INV @ `38f63d6`; CONN-HR-1 @ `454f7ec`; **current HEAD** `1edc1ff` (FE-ACCEPT-1C) |

### Boundary (do not collapse)

| Claim class | State |
|---|---|
| Local synthetic snapstore acceptance | **COMPLETE** |
| Hosted merchant onboarding / ops readiness | **Not proven** by this gate |
| Production REORDER/REDUCE/PROMOTE/WATCH recommendations | **Forbidden** (M7 create blocked) |
| Actual merchant business outcomes / savings | **Not claimed** |
| Overview/Inventory merchant-first UX | **UX-INV-1a through 1c.1 CLOSED/PUSHED**; UX-INV-1d **PLANNED** (task→action→result + premium polish; no fake M7) |
| AI Inventory Explainer / Decision Agent | AI-INV-1/1.1 **CLOSED/PUSHED** @ `38f63d6` (offline; soft-enable OFF); AI-INV-2…6 + AI-MKT **PLANNED**; AI ≠ numeric authority |
| Shopify credential vault / refresh fencing / disconnect-revoke / JSON secret guards | CONN-1a…1d-E **CLOSED/PUSHED** through `5de98cf` (PARTIAL offline; CONN-1 exit **UNMET**); CONN-HR-1 offline package @ `454f7ec`; FE-ACCEPT-1C local browser @ `1edc1ff`; production binding **NOT_YET_VERIFIED**; five hosted migrations **not applied** |

### Remaining risks (explicit)

- Inventory/sales still rely on **manual CSV** updates (no live commerce sync).
- **Shopify** RO.1/RO.2/RO.1.2/RO.3 offline **CLOSED/PUSHED**; live nested-completeness certification **FALSE**; OAuth/SyncRun/live shop **pending**; Woo/Amazon later.
- Incoming evidence remains **unknown** until merchant attestation / trusted PO path.
- **Multi-store / multi-location** owner acceptance **pending**.
- Workers/cron **OFF**; hosted JWT isolation **BLOCKED**; M7 production actions and purchasing **prohibited**.
- Local synthetic data must **never** promote into production migrations, seeds, or hosted copies.
- Local authenticated browser certification **PASS** @ `1edc1ff` (FE-ACCEPT-1C; merchant/Actions/1280) — **≠** hosted/production browser certification.
- Do **not** use CLI `db push` for CONN migration #5 as written; hosted Option B apply is separately gated.

Detail: living ledger `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md` (§ **2026-11-26 DOC-TRACK-5**). Compact handoff: `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md`. Session bootstrap: `docs/PROJECT_HANDOFF.md`.
