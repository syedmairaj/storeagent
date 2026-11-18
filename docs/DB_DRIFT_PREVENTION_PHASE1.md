# Database Drift Prevention — Phase 1

**Status:** Implementation complete (local file gates + docs). Owner documentation closure 2026-11-18.
**Mode:** Non-mutating. Does **not** authorize hosted writes, JWT probes, workers/cron, M7, purchasing, or local `db reset`.

**Pins (owner-verified baseline):**
- Local API `127.0.0.1:55321` → Postgres `127.0.0.1:55322`
- Hosted production ref `qlsqminsfdntpqdkhxjx` (38→52 schema track CLOSED at **52/52**; ops activation still forbidden)
- Disk migrations: **52** files; latest `20261110140000`
- Owner-reported: local/remote migration versions aligned; `supabase db push --remote --dry-run` → “Remote database is up to date”

---

## Verification matrix (do not collapse these)

| Claim | State |
|---|---|
| Phase 1 implementation (checker, manifest, tests, workflow file, seed disable) | **Complete** |
| `npm run check:migrations` | **PASS** (local) |
| `tests/unit/migration-integrity-gate.test.ts` | **8/8 PASS** (local) |
| GitHub Actions `db-drift-prevention` run on GitHub | **NOT YET VERIFIED** (workflow authored; no green run required for this closure) |
| Hosted schema / RLS / grant equivalence vs disk | **NOT PROVEN** by this gate (ledger dry-run alignment is owner-reported; object-level RLS proof is separate) |
| Disposable CI migration replay (empty → full chain) | **NOT IMPLEMENTED** |
| Hosted JWT isolation (PE1.b.6b) | **BLOCKED** / UNPROVEN |
| Workers / cron / M7 production create / purchasing | **OFF** / forbidden |

Historical note: `docs/M5_HR3_2_VERCEL_DEPLOYMENT_READINESS.md` recorded `.github/workflows` as **Absent**. Phase 1 adds `.github/workflows/db-drift-prevention.yml` only; that does not unlock Vercel cron or metric workers.

---

## What Phase 1 ships

| Artifact | Role |
|---|---|
| `scripts/check-migration-integrity.mjs` | Filename pattern, duplicate versions, UTF-8 integrity, top-level merchant DML ban, seed policy, SHA baseline verify/write |
| `supabase/migrations.sha256` | Trusted content baseline; detects same-name tampering / unreviewed edits |
| `npm run check:migrations` | Local/CI entrypoint (**no database connection**) |
| `tests/unit/migration-integrity-gate.test.ts` | Regression coverage for the gate + CI workflow hygiene |
| `.github/workflows/db-drift-prevention.yml` | PR/main/`workflow_dispatch`: integrity script + selected schema architecture unit tests |
| `[db.seed] enabled = false` | Prevents accidental seed load on local `db reset` while `seed.sql` is absent |

**Deferred:** full migration replay against disposable Postgres. Existing PB1.h.4.x disposable proofs remain owner-triggered and must **never** reset `55322`.

---

## Local commands (safe)

```bash
npm run check:migrations
npx vitest run tests/unit/migration-integrity-gate.test.ts

# After an intentional, reviewed migration edit only:
node scripts/check-migration-integrity.mjs --write-manifest
```

**SHA baseline limits:** hashes detect byte-level edits to committed migration files when the manifest is reviewed with the change. They do **not** prove hosted apply state, semantic equivalence of rewritten SQL, or protect against deleting+renaming a version without updating the manifest in the same PR (CI fails until both are updated together).

Do **not** run `supabase db reset` against the owner local stack as part of this gate.

---

## Manual release verification (owner)

Prefer CLI v3 local-by-default semantics; use `--remote` only when intentionally targeting hosted.

```bash
# 1) File integrity (no DB)
npm run check:migrations

# 2) Local ledger (default in CLI v3)
supabase migration list

# 3) Hosted ledger (explicit; owner auth — read-only list)
supabase migration list --remote

# 4) Dry-run schema push (must report up to date; do not omit --dry-run)
supabase db push --remote --dry-run
```

**Interpretation:**
- Disk files under `supabase/migrations/` = *intended* schema.
- Applied ledgers = `supabase_migrations.schema_migrations` (local and remote).
- Disk-only version = pending apply (**owner-authorized only**).
- Remote-only version = unexpected drift / repair territory (**do not auto-repair**).

### Hosted schema / privilege drift (read-only; not automated)

| Check | How | Fail signal |
|---|---|---|
| Migration ledger | `migration list --remote` vs disk | Version set mismatch |
| Dry-run push | `db push --remote --dry-run` | Pending SQL / not “up to date” |
| Privilege spot checks | Catalog SQL for sensitive RPCs/tables | Unexpected `service_role` / `anon` EXECUTE or DML |
| Fingerprint (optional) | Process in `docs/HOSTED_38to52_MIGRATION_RUNBOOK.md` | Fingerprint change without approved migration |

Grant regressions historically seen on hosted default privileges: S4/S5/S6 in the 38→52 runbook.

---

## Least-privilege hosted verification (Phase 2 design — do not automate in Phase 1)

| Requirement | Decision |
|---|---|
| Credentials | Dedicated **read-only** role/token — **not** `service_role` in GitHub Actions |
| Network | Manual / separately approved; **no** default PR job talks to hosted |
| Allowed | `migration list --remote`, optional read-only catalog selects |
| Forbidden | `db push`, `db reset`, `migration repair`, `config push`, `secrets set`, any DML/DDL |
| Secrets in repo | **None** in Phase 1 |

Suggested future workflow: `hosted-migration-ledger-readonly.yml` with `environment: hosted-readonly` and manual `workflow_dispatch` only.

---

## Seed / synthetic data policy

| Surface | Rule |
|---|---|
| `supabase/migrations/*.sql` | Schema/RPC/grants only. Gate fails on **top-level** `INSERT`/`COPY` into merchant commerce tables (RPC bodies excluded) |
| `supabase/seed.sql` | Must not exist with inventory/sales/metrics; local-only if ever added |
| `[db.seed]` | **Disabled** (`enabled = false`) |
| App CSV fixtures / local snapstore data | `tests/fixtures` or local DB only — **never** promote to production migrations, seeds, or hosted data copies |

`supabase db push` does not apply seeds. `db reset` would — keep seed disabled until an intentional local-only seed exists.

---

## Recommended development → production workflow

```text
Local development
  → npm run check:migrations (+ schema unit tests)
  → PR (drift-prevention workflow when Actions are verified)
  → Isolated disposable migration replay          [FUTURE — Phase 2]
  → Staging verification (backup + dry-run + grants) [FUTURE]
  → Owner-approved production deploy (backup first)
  → Post-release: migration list --remote, dry-run up to date,
    grant spot checks; workers/cron/M7 remain off unless separately authorized
```

1. **Author** migration on a feature branch; update `migrations.sha256` via `--write-manifest` in the same change.
2. **Disposable replay** (future): empty → full chain on CI/ephemeral PG17 — never reset owner `55322`.
3. **PR review** + drift CI green; no production secrets in PR.
4. **Staging** (when available): owner-approved apply after backup; privilege spot checks.
5. **Production backup** (timestamped; checksums) before apply.
6. **Production apply** only with explicit owner approval; CLI v3 confirmation for hosted mutations.
7. **Failure:** stop; no `migration repair` without a separate incident runbook; restore from backup if schema is torn.
8. **Rollback:** prefer forward-fix migration; hard restore only from pre-apply backup with owner approval.

---

## Deprecated auth config (pending compatibility — not changed)

Supabase CLI v3 deprecates (removed in v4):

| Current (`supabase/config.toml`) | Compatible replacement | Risk if changed blindly |
|---|---|---|
| `[auth.email] enable_signup` | `[auth.email] enabled` | `enabled=false` disables the **entire** email provider (existing users cannot sign in). To block **new** signups only, use `[auth] enable_signup = false`. |
| `[auth.sms] enable_signup` | `[auth.sms] enabled` | Same provider on/off semantics for phone. |

Integrity checker **WARNs** on these keys. Do **not** rename them until a dedicated auth compatibility check (local signup/signin + recovery templates) is scheduled.

Also note: `config push` now applies `[auth.sms] enable_confirmations` as written (v2 inverted). Run `supabase config diff` before any future hosted config push.

Already compatible: `[local_smtp]` (not legacy `[inbucket]`).

---

## Phase 2 follow-ups

- Verify GitHub Actions execution of `db-drift-prevention` on a real PR/`workflow_dispatch`.
- Disposable migration replay job (ephemeral Postgres only).
- Least-privilege hosted ledger/readonly workflow (manual environment protection).
- Object-level hosted schema/RLS/grant equivalence proof (beyond migration version list).
- Auth `enable_signup` → `enabled` compatibility change (separate gate).
- PE1.b.6b hosted JWT isolation remains a **separate BLOCKED** security track.

## Remaining risks

- Local ledger vs disk can diverge if SQL is applied outside migrations.
- Dual local Next servers / env confusion can make app writes appear “missing” while migrations are fine.
- Inventory/CSV/freshness/replenishment UX + local snapstore planning acceptance docs are unrelated to schema promotion and must not be mixed into production migration/seed promotion (local acceptance COMPLETE 2026-11-18; see `docs/IMPLEMENTATION_STATUS.md`).
