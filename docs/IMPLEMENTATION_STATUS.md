# StoreAgent Implementation Status (pointer)

The full living status ledger is:

`docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md`

**Authoritative current-state table (use this, not older pins):** ledger § **2026-11-20 — DOC-2026-11 Master Roadmap reconciliation**.

Historical snapshot: `docs/archive/IMPLEMENTATION_STATUS.md`

**November 2026 execution plan:** `docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md`
**AI + merchant-value roadmap:** `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`
**Overview/Inventory UX delivery:** `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md`
**Session bootstrap:** `docs/PROJECT_HANDOFF.md`
**Canonical DOCX:** `docs/StoreAgent_Master_Roadmap_Updated_2026-11-10.docx` — **Section 36+ Markdown sync PENDING** (do not treat older DOCX status tables as fresher than this pointer + ledger § 2026-11-20).

## Git baseline (verified 2026-11-20)

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `fe29703` — `feat(shopify): align RO.1.2 offline normalizers to Admin API 2026-10` |
| vs `origin/main` | **Aligned** |
| Latest UX | `0402564` — UX-INV-1c.1 replenishment/incoming clarification |
| Prior pins | `0072a04` RO.1 · `7fc8f2a` RO.2 · `10d9de6`/`f1426c4`/`0402564` UX-INV · `457a516`/`970bab0` inventory UX · `d73790a` drift Phase 1 |
| Shopify-RO.3 | **Local uncommitted** `shopify-ro.3-v1` (mocked HTTP); **not** Git-closed; **not** live-certified |
| Offline test evidence | Owner-reported session: **13** RO.3 + **78** Shopify + **63** CSV/provider PASS under mocks — **no** live Shopify |

> **STALE WARNING:** Any doc still pinning HEAD `7fc8f2a` or “RO.2 push pending” / “RO.1.2 Planned” / “UX-INV-1c planned” as *current* truth is historical. Prefer ledger § 2026-11-20.

## Shopify connector track

| Slice | State |
|---|---|
| M0.7 adapter boundary freezes | Implemented (contracts) |
| RO.1 offline normalizers | **CLOSED/PUSHED** @ `0072a04` (fixtures **not** live-certified) |
| RO.2 GraphQL transport | **CLOSED/PUSHED** @ `7fc8f2a`; docs `SHOPIFY_RO2_TRANSPORT.md` |
| RO.1.2 schema compatibility | **CLOSED/PUSHED** @ `fe29703` (`shopify-ro.1.2-v1`) |
| RO.3 nested pagination completeness | **LOCAL IMPLEMENTED + TESTED** offline (`shopify-ro.3-v1`); **Git closure pending**; live cert flags **false** |
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
| Implementation HEAD pin (acceptance) | Inventory/CSV/freshness/replenishment UX on `main` @ `457a516` (+ readiness `970bab0`); current HEAD `fe29703` for Shopify RO.1.2; UX-INV through `0402564` |

### Boundary (do not collapse)

| Claim class | State |
|---|---|
| Local synthetic snapstore acceptance | **COMPLETE** |
| Hosted merchant onboarding / ops readiness | **Not proven** by this gate |
| Production REORDER/REDUCE/PROMOTE/WATCH recommendations | **Forbidden** (M7 create blocked) |
| Actual merchant business outcomes / savings | **Not claimed** |
| Overview/Inventory merchant-first UX | **UX-INV-1a through 1c.1 CLOSED/PUSHED**; UX-INV-1d planned (`MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md`) |
| AI Inventory Explainer / Decision Agent | **PLANNED** only (`AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`) — not shipped |

### Remaining risks (explicit)

- Inventory/sales still rely on **manual CSV** updates (no live commerce sync).
- **Shopify** RO.1/RO.2/RO.1.2 offline closed; RO.3 local-only; OAuth/SyncRun/live shop **pending**; Woo/Amazon later.
- Incoming evidence remains **unknown** until merchant attestation / trusted PO path.
- **Multi-store / multi-location** owner acceptance **pending**.
- Workers/cron **OFF**; hosted JWT isolation **BLOCKED**; M7 production actions and purchasing **prohibited**.
- Local synthetic data must **never** promote into production migrations, seeds, or hosted copies.
- Authenticated browser 320–ultrawide certification remains **BLOCKED** for automation.

Detail: living ledger `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md` (§ 2026-11-20). Session bootstrap: `docs/PROJECT_HANDOFF.md`.
