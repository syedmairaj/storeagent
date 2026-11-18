# StoreAgent Implementation Status (pointer)

The full living status ledger is:

`docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md`

Historical snapshot: `docs/archive/IMPLEMENTATION_STATUS.md`

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
