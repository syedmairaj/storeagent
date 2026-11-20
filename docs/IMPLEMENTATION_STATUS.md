# StoreAgent Implementation Status (pointer)

The full living status ledger is:

`docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md`

**Authoritative current-state table (use this, not older pins):** ledger § **2026-11-20 — post-closure reconciliation (RO.3 + AI-INV-1/1.1)**.

> **Superseded current-status pointer:** ledger § 2026-11-20 DOC-2026-11 (pre-closure pins `fe29703` / RO.3 uncommitted / AI-INV PLANNED) remains **historical evidence** — do not treat as fresher than the post-closure section.

Historical snapshot: `docs/archive/IMPLEMENTATION_STATUS.md`

**November 2026 execution plan:** `docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md`
**AI + merchant-value roadmap:** `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`
**Overview/Inventory UX delivery:** `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md`
**Session bootstrap:** `docs/PROJECT_HANDOFF.md`
**Canonical DOCX:** `docs/StoreAgent_Master_Roadmap_Updated_2026-11-10.docx` — **Section 36+ Markdown sync PENDING** (do not treat older DOCX status tables as fresher than this pointer + ledger post-closure section).

## Git baseline (current — 2026-11-20 post-closure)

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `38f63d6` — `feat(ai-inv-1): grounded inventory explainer with situational guidance` |
| vs locally recorded `origin/main` | **Aligned** (same SHA at acceptance; **no CI claim**) |
| Shopify RO.3 | **CLOSED/PUSHED** @ `4f6ef0c` (`shopify-ro.3-v1`); offline mocks; live nested cert **FALSE** |
| AI-INV-1 / 1.1 | **CLOSED/PUSHED** @ `38f63d6`; offline/local PASS; soft-enable **OFF**; not live-certified |
| Prior pins (ancestors) | `4f6ef0c` RO.3 · `fe29703` RO.1.2 · `7fc8f2a` RO.2 · `0072a04` RO.1 · `0402564` UX-INV-1c.1 |
| Closure evidence (AI-INV) | Focused **32/32** PASS; typecheck/lint/build PASS; **2** pre-existing lint warnings (migration script) |

> **STALE WARNING:** Any doc still pinning HEAD `fe29703` / “RO.3 uncommitted” / “AI-INV PLANNED or Git pending” as *current* truth is **superseded** by ledger § post-closure. Prefer that section + this pointer.

## Shopify connector track

| Slice | State |
|---|---|
| M0.7 adapter boundary freezes | Implemented (contracts) |
| RO.1 offline normalizers | **CLOSED/PUSHED** @ `0072a04` (fixtures **not** live-certified) |
| RO.2 GraphQL transport | **CLOSED/PUSHED** @ `7fc8f2a`; docs `SHOPIFY_RO2_TRANSPORT.md` |
| RO.1.2 schema compatibility | **CLOSED/PUSHED** @ `fe29703` (`shopify-ro.1.2-v1`) |
| RO.3 nested pagination completeness | **CLOSED/PUSHED** @ `4f6ef0c` (`shopify-ro.3-v1`); offline mocked tests; **live nested-completeness certification FALSE** |
| Nested pagination as SyncRun “complete” | **Hard gate** — offline RO.3 ≠ live SyncRun complete |
| OAuth / SyncRun / quarantine UX / live shop | **Blocked / Planned** |
| WooCommerce / Amazon | **Planned** after Shopify |

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

**Migration deployment COMPLETE ≠ operational activation.** Workers OFF, cron OFF, PE1.b.6b LIMITED JWT gates unchanged, M7 production-create rejection preserved (`PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE`), merchant eligibility=false, purchasing disabled.

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
| Disk / hosted ledger (owner-reported) | 52 migrations; versions aligned; `db push --remote --dry-run` → up to date |
| GitHub Actions execution | **NOT YET VERIFIED** on GitHub |
| Hosted schema/RLS equivalence | **NOT PROVEN** by this gate |
| Disposable migration replay | **NOT IMPLEMENTED** |
| Hosted JWT isolation (PE1.b.6b) | Still **BLOCKED** |
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
| Implementation HEAD pin (acceptance) | Inventory/CSV/freshness/replenishment UX on `main` @ `457a516` (+ readiness `970bab0`); UX-INV through `0402564`; Shopify through RO.3 `4f6ef0c`; **current HEAD** `38f63d6` (AI-INV-1/1.1) |

### Boundary (do not collapse)

| Claim class | State |
|---|---|
| Local synthetic snapstore acceptance | **COMPLETE** |
| Hosted merchant onboarding / ops readiness | **Not proven** by this gate |
| Production REORDER/REDUCE/PROMOTE/WATCH recommendations | **Forbidden** (M7 create blocked) |
| Actual merchant business outcomes / savings | **Not claimed** |
| Overview/Inventory merchant-first UX | **UX-INV-1a through 1c.1 CLOSED/PUSHED**; UX-INV-1d planned (`MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md`) |
| AI Inventory Explainer / Decision Agent | AI-INV-1/1.1 **CLOSED/PUSHED** @ `38f63d6` (offline; soft-enable OFF); AI-INV-2…6 + AI-MKT **PLANNED**; AI ≠ numeric authority |

### Remaining risks (explicit)

- Inventory/sales still rely on **manual CSV** updates (no live commerce sync).
- **Shopify** RO.1/RO.2/RO.1.2/RO.3 offline **CLOSED/PUSHED**; live nested-completeness certification **FALSE**; OAuth/SyncRun/live shop **pending**; Woo/Amazon later.
- Incoming evidence remains **unknown** until merchant attestation / trusted PO path.
- **Multi-store / multi-location** owner acceptance **pending**.
- Workers/cron **OFF**; hosted JWT isolation **BLOCKED**; M7 production actions and purchasing **prohibited**.
- Local synthetic data must **never** promote into production migrations, seeds, or hosted copies.
- Authenticated browser 320–ultrawide certification remains **BLOCKED** for automation.

Detail: living ledger `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md` (§ **2026-11-20 post-closure**). Session bootstrap: `docs/PROJECT_HANDOFF.md`.
