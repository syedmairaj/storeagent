# CONN-HR-1 — Hosted Readiness Operator Runbook

**Status:** Offline package COMPLETE — **CLOSED/PUSHED** @ `454f7ec` (historical package baseline below remains `7bd2e8b`)
**Continuity (DOC-CONTINUITY-6, 2026-11-27):** Hosted CONN migrations **DEPLOYED_VERIFIED** (57/57; history md5 `900da6949dfd6f7818a454b7f28ddf33`; post-catalog 23/23 PASS). This runbook remains the **offline Option B / disposable** authority; it does **not** authorize OAuth, workers, cron, SyncRun, KEK writes, or JWT unlock. Current HEAD pin: `78c1d45`. See master handoff + living ledger § 2026-11-27.
**Baseline (package creation):** `main` @ `7bd2e8b` · 57 migrations · staging empty
**Mode (original slice):** No hosted SQL, migration apply, JWT, OAuth, KEK, workers, SyncRun, or Git writes in the HR-1 docs slice.

| Gate | State |
|---|---|
| V11 | **PARTIAL** (unchanged) |
| CONN-1 exit (§11) | **UNMET** |
| Binding | **`NOT_YET_VERIFIED`** |
| D13 / D14 | Unresolved |
| Hosted apply | **NOT AUTHORIZED** |
| Recommended apply method | **Single-transaction `psql` (Option B)** — CLI `db push` **BLOCKED** for #5 |

Authority: CONN-HR-0 preflight · `docs/SHOPIFY_CONN_1D_F_SECURITY_EXIT_READINESS_REPORT.md` · vault contract §9/§11.

---

## 1. What this package is

Offline readiness only:

| Path | Purpose |
|---|---|
| `scripts/conn-hr-1/readonly/01…10_*.sql` | Parameter-free SELECT-only hosted probes (owner-run later) |
| `scripts/conn-hr-1/disposable/*` | Disposable replay / parity / failure tooling |
| `tests/sql/conn-hr-1-disposable-single-transaction-candidate.psql` | **Disposable-gated** single-txn apply candidate — **not** a hosted apply script |
| `tests/unit/conn-hr-1-readonly-sql-static.test.ts` | Static safety of the SQL package |
| This runbook | Operator sequence, fingerprints, GO/NO-GO, V8 plan |

**There is no runnable hosted apply or reverse-migration script in this slice.** Hosted deployment commands below are **specifications** until a separate owner authorization produces a reviewed hosted artifact.

---

## 2. Fingerprints (proven on disposable PG 17.11)

| Item | Value |
|---|---|
| HEAD | `7bd2e8b` |
| History before (52) `versions_md5` | `d3a7a37c1b0175595e65aa85e07f81cf` · max `20261110140000` |
| History after (57) `versions_md5` | `900da6949dfd6f7818a454b7f28ddf33` · max `20261124120000` |
| Five CONN SHAs | See `supabase/migrations.sha256` (integrity gate PASS) |
| Post-apply `functions_md5` | `b3b15a5e6a8d8fa9cfddc42f9cb93834` |
| Post-apply `vault_schema_md5` | `e8061599efc7703a435a393e409f1547` |
| Post-apply `guard_triggers_md5` | `0921691fa4a622ada27eb402d0228eeb` |
| Protected `.vitest` SHA-1 | `55661591291aea593f7b3bfc623d547e09dccbfb` |

Five CONN migrations, in order:

1. `20261121120000` — CONN-1a vault tables
2. `20261122120000` — CONN-1c-α load/replace/clear
3. `20261122130000` — CONN-1c-β refresh lease
4. `20261122140000` — CONN-1d-C disconnect/revoke
5. `20261124120000` — CONN-1d-E JSON secret guard

---

## 3. Precheck sequence (hosted — owner-run, not executed here)

Wrapper (every probe session):

```text
-- SPECIFICATION ONLY — do not run without separate hosted authorization
start transaction read only;
-- \i each scripts/conn-hr-1/readonly/0N_*.sql in order
rollback;
```

| Step | File | GO requires |
|---|---|---|
| P1 | `01_platform.sql` | PG 17.x; regex probes `t,t,t,t,f,f` (or documented equivalent) |
| P2 | `02_migration_history.sql` | 52 rows · md5 `d3a7a37c…` · `conn_versions_present = 0` |
| P3 | `03_prerequisites.sql` | Prerequisites present; vault/guard absent; no name collisions |
| P4 | `04_ownership_acl.sql` | Guarded tables owned by `postgres`; no unexpected TRIGGER grantors |
| P5 | `05_roles_rls_definer.sql` | Review unexpected roles; `service_role` BYPASSRLS; no `service_role`∈`postgres` |
| P6 | `06_publications_triggers.sql` | **STOP** if any `puballtables` |
| P7 | `07_json_guard_prescan.sql` | **STOP** if any `violating_rows > 0` (remediation needs separate approval) |
| P8 | `08_logging_indicators.sql` | Review allowlisted settings; redacted db-role settings only |
| P9 | `09_workload_locks.sql` | No long writers / locks on guarded tables; workers/cron still OFF |

Then SHA-verify the five migration files against `supabase/migrations.sha256` on the operator machine at exact HEAD.

---

## 4. Deployment-method comparison (proven)

| Method | Result on disposable CLI 2.122.0 / PG 17.11 |
|---|---|
| **A — `supabase db push`** | Applies #1–#4, then **fails on #5**: `LOCK TABLE can only be used in transaction blocks (25P01)`. History left at **56**. `SET LOCAL` is a no-op (WARNING) outside a real transaction. **BLOCKED for hosted #5 as written.** |
| **B — single-transaction `psql`** | One `BEGIN` … `\i` five files … history inserts … postchecks … `COMMIT`. **PASS**: 52→57, vault empty, post-apply catalog 23/23. Planted secret aborts #5 scan → full rollback → still 52, no CONN objects. |

**Recommendation:** Option B only, under a future hosted authorization. Do **not** change migration #5 SHA without a separate owner decision. Do **not** use `migration repair` without separate approval.

### Option B hosted specification (NOT executable in this slice)

```text
-- SPECIFICATION ONLY — future owner-authorized hosted artifact must:
-- 1) verify HEAD + five SHAs
-- 2) connect as postgres to the pinned project (db-url; no linked-project fallback)
-- 3) set lock_timeout / statement_timeout at session start if desired
-- 4) BEGIN; SET LOCAL lock_timeout='5s';
-- 5) fail-closed prechecks (history 52 / md5 / prerequisites / CONN absent)
-- 6) \i the five migrations in order
-- 7) INSERT five history rows (version, name) — statements may be NULL (same as S2–S4)
-- 8) fail-closed postchecks (equiv. readonly/10_post_apply_catalog.sql)
-- 9) COMMIT
-- Refuse if workers/cron are on, violating_rows>0, or puballtables.
```

The disposable candidate at `tests/sql/conn-hr-1-disposable-single-transaction-candidate.psql` implements this shape but **refuses** any server that is not `cluster_name=storeagent-conn-hr-1-disposable` on loopback.

---

## 5. Post-apply verification

1. Run `scripts/conn-hr-1/readonly/10_post_apply_catalog.sql` inside `start transaction read only` / `rollback`.
   **GO:** every `pass = true` (`all_pass = true`).
2. Confirm vault row counts remain `0,0`.
3. Confirm workers / cron / SyncRun / OAuth still OFF (no activation).

---

## 6. Hosted V8 post-apply plan (empty vault — not executed)

After post-apply GO, while vault tables are empty:

| Case | Caller | Expect |
|---|---|---|
| GET/HEAD vault tables (`Prefer: count=exact`) | anon | deny (401/403/404) |
| POST/PATCH/DELETE vault tables | anon | deny |
| POST `/rpc` for each of 7 vault RPCs + 3 trigger fns | anon | deny |
| Same three classes | synthetic user in dedicated empty test org | deny |
| Malformed / expired JWT | — | 401 |

Token rules: shell variables only, `set +x`, log status + PostgREST `code` only, unset after. Creating the synthetic user is a hosted write and needs its own authorization (or PE1.b.6b A1–A6).

---

## 7. Failure / interrupted-commit recovery

| Symptom | Safe action |
|---|---|
| Option B error before COMMIT | Nothing applied. Re-run prechecks; fix; retry. |
| Planted / existing JSON violation | Counts-only SA011. Remediate data (separate approval), then retry. |
| Client disconnect mid-txn | Transaction aborts; history unchanged (proven disposable F6). |
| Operator finds history 56 after a CLI attempt | #1–#4 present, #5 absent. **STOP.** Prefer forward path with Option B only for #5 after verifying objects #1–#4, **or** owner-approved repair — never silent `migration repair`. |
| Post-apply catalog fail | Prefer forward-fix migration with new timestamp. Never edit applied files / SHAs. |
| Vault rows > 0 unexpectedly | Freeze; incident. No OAuth/KEK until understood. |

Destructive rollback (drop vault objects + history revert) requires **separate owner approval** and emptiness guards. Existing V15 scripts are disposable/fixture-oriented and are **not** production rollback.

---

## 8. Conditions requiring separate owner approval

1. Any hosted SQL or apply
2. Changing migration #5 (or any historical SHA) to make CLI work
3. `supabase migration repair`
4. Remediating violating JSON rows
5. Destructive rollback / history rewrite
6. V8 JWT probe identities / PE1.b.6b
7. D14 KEK before any vault write; D13 before CONN-2 bind design
8. Editing protected `docs/SERVICE_ROLE_BOUNDARY.md`
9. OAuth, workers, SyncRun, Shopify HTTP, M6/M7 activation

---

## 9. GO / NO-GO for hosted apply

| Criterion | Required |
|---|---|
| Offline package review accepted | Yes |
| Hosted P1–P9 GO | Yes (owner-run) |
| Apply method = Option B reviewed artifact | Yes |
| Option A CLI push of #5 | **NO-GO** |
| V11 PARTIAL / CONN-1 exit UNMET accepted for schema-only apply | Owner decision |
| Binding / D13 / D14 / OAuth still blocked | Yes |

**Current verdict:** Hosted apply remains **NO-GO** until the owner authorizes a hosted session and P1–P9 pass. Offline readiness for that session is **PASS with residual blockers** (see implementation report §J).
