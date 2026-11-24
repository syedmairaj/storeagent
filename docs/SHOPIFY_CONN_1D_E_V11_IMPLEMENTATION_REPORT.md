# SHOPIFY CONN-1d-E — V11 JSON Secret Guard Implementation Report

Status: **LOCAL / DISPOSABLE ONLY — STOP FOR OWNER REVIEW**
Baseline: `main @ 40d5888` ≡ `origin/main`, staging empty, 18 protected dirty/untracked entries preserved.
Hosted apply: **NOT AUTHORIZED / NOT PERFORMED.**
V11 recommendation: **PARTIAL** (see §J). CONN-1 exit: **UNMET**.

Hard gates unchanged: Binding NOT_YET_VERIFIED · V8 hosted JWT NOT VERIFIED · D13/D14 DEFERRED ·
no hosted apply, OAuth, KEK, workers, live SyncRun, Shopify HTTP, M6/M7 or provider expansion ·
no git operations.

Disposable target for every DB command: PostgreSQL 17.11 at `127.0.0.1:55427`
(restore-scratch datadir `batch38to52-unblock-20261111T072540Z`). Ports `:54322` / `:55322` and hosted were never used.

Revision: this report includes the **final security corrections** that followed the final acceptance gate:
- the confirmed `service_role` TRIGGER bypass and its fix (§C.1);
- future-migration regression protection (§C.3);
- sparse-array hole rejection (§D);
- corrected claims (§H, §J).

---

## A. Baseline and Phase 0 proofs

| # | Assumption | Result |
|---|---|---|
| 1 | Strict jsonpath `$.**{9 to last}` matches app depth (root = 0, array elements count) | PASS — 8 accepted / 9 rejected for objects, arrays, mixed, empty containers, null |
| 2 | `jsonb::text` expansion of compact JSON ≤ 1.5× except exponent numbers | PASS — exponents explode (`1e300` → 308 bytes), so the app rejects exponent/non-finite numbers |
| 3 | PostgreSQL ARE `\b` is a word boundary | **FALSE** — it is backspace (`\y` is the boundary); the guard uses no boundary assertions |
| 4 | Exotic Unicode (Kelvin sign, long s) under `~*` | Matches neither engine; NBSP after `Bearer` is rejected by the app only (allowed direction) |
| 5 | Trigger fires for `service_role` without EXECUTE; direct call denied | PASS — direct call → `insufficient_privilege`; verbose errors show only SA011 + message + CONTEXT |
| 6 | Trigger order | `zz_` sorts last; an earlier hostile `NEW`-rewriting trigger is caught; a later-named `zzz_` trigger **bypasses** (see §C.1 / §C.3) |
| 7 | Legacy rows | Status-only and same-value updates pass; change to a new secret is denied |
| 8 | Migration lock race | Writer blocked ~2 s then rejected by the new trigger; `lock_timeout` aborts; `LOCK` outside a transaction errors; deadlocks 0 |
| 9 | Liveness hazard (rejected complete/fail leaving a run `running`) | Confirmed in SQL; production callers pass constants, and a rejected complete is finalized through fail with constants |
| 10 | Full-chain replay | All migrations replay on the disposable bootstrap |

The Phase 0 STOP rule wasn't triggered. Finding 3 changed the pattern text, not the architecture.

Harness-fidelity corrections (disposable only, not product changes):
- The `extensions` schema with `pgcrypto` is required by M7.2b. It is now created in the full-chain bootstrap.
- The disposable `service_role` lacked `BYPASSRLS`, unlike Supabase. The bootstrap now sets `alter role service_role bypassrls`.

## B. Exact changed paths

| Path | Change |
|---|---|
| `supabase/migrations/20261124120000_shopify_conn_1d_e_json_secret_guard.sql` | NEW, additive (guard function, 3 triggers, EXECUTE revoke, **TRIGGER revoke**) |
| `supabase/migrations.sha256` | +1 line `cf4ac08fb9d387e294b5f2e69bb672ad3eee6989cca7bba1ff006c1236de81b0  20261124120000_shopify_conn_1d_e_json_secret_guard.sql` |
| `lib/security/secret-ingestion.ts` | REWRITTEN (same exports, error class and boundary type) |
| `tests/sql/shopify-conn-1d-e-full-chain-bootstrap.sql` | NEW |
| `tests/sql/shopify-conn-1d-e-json-secret-guard-adversarial.sql` | NEW |
| `tests/sql/shopify-conn-1d-e-v15-rollback-additive.sql` | NEW |
| `tests/unit/shopify-conn-1d-e-secret-guard-canonical.test.ts` | NEW |
| `tests/unit/shopify-conn-1d-e-app-db-parity.live.test.ts` | NEW |
| `docs/SHOPIFY_CONN_1D_E_V11_IMPLEMENTATION_REPORT.md` | NEW (this file) |

No historical migration and no writer module was edited. The four writers already persist the guard's return value: `ensure-integration.ts`, `location-binding.ts`, `supabase-persistence.ts` and `sync-run-persistence.ts`.

## C. DB trigger / grant evidence

- `public.conn_1d_e_reject_secret_json()` is `returns trigger`, plpgsql, `set search_path = ''`, not `security definer`.
- EXECUTE is revoked from `public, anon, authenticated, service_role`.
- Three triggers named `zz_conn_1d_e_secret_json_guard`, all `BEFORE INSERT OR UPDATE FOR EACH ROW`:
  - `integrations(configuration)`
  - `provider_bindings(source_metadata)`
  - `sync_runs(error_summary, reconciliation_metadata)`
- On UPDATE a column is validated only when `NEW.col IS DISTINCT FROM OLD.col`.
- Rejection uses fixed SQLSTATE `SA011` with the constant message `secret material rejected at JSON boundary (<table>.<column>)`, and no DETAIL or HINT. The existing-row scan reuses SA011 with a counts-only message.
- Migration safety:
  - `set local lock_timeout = '5s'`.
  - `LOCK ... IN SHARE ROW EXCLUSIVE` on all three tables before the scan.
  - The existing-row scan reuses the same function through a temp-table trigger and aborts with counts only.

### C.1 Confirmed `service_role` TRIGGER bypass and fix

**Bypass (before the correction).** Supabase-style default privileges give `service_role` ALL on the three tables, including `TRIGGER`. As `service_role` alone, I created a `pg_temp` function and attached a `zzz_rw` BEFORE UPDATE trigger to each table. Each update then stored a token after the guard had validated `NEW`:

```
integrations stored: {"access_token": "shpat_bypass000"}
provider_bindings stored: {"access_token": "shpat_bypass001"}
sync_runs stored: {"access_token": "shpat_bypass002"}
```

**Fix.** The 1d-E migration now runs:

```
revoke trigger on table public.integrations, public.provider_bindings, public.sync_runs
from public, anon, authenticated, service_role;
```

**After the fix** (fresh full chain, `conn1d_e_fix`), the same `create trigger` as `service_role` fails with `permission denied for table integrations`, then `provider_bindings`, then `sync_runs`. Adversarial E6 repeats this for all three tables.

**Effective privilege matrix after the fix** (`has_table_privilege`, which includes inheritance):

| Role | integrations / provider_bindings / sync_runs |
|---|---|
| `anon` | none |
| `authenticated` | SELECT (RLS on) |
| `service_role` | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES (**TRIGGER removed**) |
| `postgres` (owner) | all, including TRIGGER (owner; residual) |
| PUBLIC | no ACL entries |

Before the fix, `service_role` held the same set **plus TRIGGER**. DML grants and RLS (`relrowsecurity = t` on all three tables) are unchanged. No non-superuser, non-owner role in the cluster holds effective TRIGGER (L1 and L8 assertions).

### C.2 Trigger-order checks: what is enforced

| Check | Where | Runs in CI by default? |
|---|---|---|
| `TRIGGER` privilege absent for `anon`, `authenticated`, `service_role`; no PUBLIC ACL | adversarial E5, live L1/L8 | No (disposable live harness) |
| `service_role` `CREATE TRIGGER` denied on all three tables | adversarial E6 | No (disposable live harness) |
| Guard is the last enabled BEFORE row trigger (catalog) | adversarial F1 | No (disposable live harness) |
| No other trigger function assigns a protected column via `new.col :=` | adversarial F2 — **supplementary only**: it misses subscript and whole-row assignment; F1 is the real control | No |
| Static chronological migration model (§C.3) | canonical unit test | **Yes** (offline unit suite) |

### C.3 Future-migration regression protection (offline, fails closed)

`tests/unit/shopify-conn-1d-e-secret-guard-canonical.test.ts` contains a chronological static model of every `supabase/migrations/*.sql` file, evaluated in filename/timestamp order.

**How it reads the SQL.** It splits statements while handling comments, quoted strings and dollar quotes. It also analyzes dollar-quoted bodies, which covers DO blocks, function bodies and `$q$` dynamic SQL. Identifiers are normalized: unquoted names are lowercased and quoted names keep their case. A protected table is `public.<name>` or an unqualified `<name>`.

**What it tracks:**
- Triggers on the three tables: create, create or replace, drop, rename, and disable / enable / enable replica / enable always, including `ALL` and `USER`.
- Definitions, alterations and drops of the guard function.
- `TRIGGER` holders, seeded with the ambient Supabase default-privilege roles. These are updated by `GRANT`/`REVOKE` with `TRIGGER` or `ALL [PRIVILEGES]` on the named tables or `ALL TABLES IN SCHEMA public`.
- Role-membership grants. Effective holders are resolved through inheritance, including membership in the owner role.

**It fails if:**
- the guard is missing, renamed or dropped on any table, or is not `BEFORE INSERT OR UPDATE FOR EACH ROW`;
- the guard does not execute the schema-qualified `public.conn_1d_e_reject_secret_json` with the exact column arguments, or is disabled or replica-only;
- a BEFORE INSERT/UPDATE row trigger sorts after the guard in byte order;
- the guard function is defined anywhere but the 1d-E migration, or is later altered or dropped;
- any non-owner role effectively holds `TRIGGER`;
- a protected table's owner changes;
- a later migration mentions the guard trigger or function name at all, which forces owner review and catches string-built dynamic SQL.

**Evidence.** The real chain gives zero violations, and the model reproduces the exact disposable trigger catalog for all three tables.
- **23 mutation-negative cases**, each failing with the expected violation:
  - later, quoted and unqualified triggers;
  - guard drop, rename, disable by name / `ALL` / `USER`, and enable replica;
  - function replace, `security definer` and drop;
  - `GRANT ALL`, `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public`, multi-privilege `TRIGGER` to PUBLIC;
  - inheritance from a TRIGGER holder, and `grant postgres to service_role`;
  - ownership change;
  - a dollar-quoted dynamic drop and a string-built reference;
  - the guard migration without the TRIGGER revoke, with an unqualified function, or with changed arguments.
- **8 benign cases** with no violations:
  - a later AFTER trigger, an earlier-sorting BEFORE trigger, and a BEFORE DELETE trigger;
  - a same-named table in another schema;
  - non-TRIGGER grants;
  - `ALTER DEFAULT PRIVILEGES` (new tables only);
  - a comment-only mention;
  - a historical pre-1d-E `GRANT ALL` that the 1d-E revoke supersedes.

**Static limits.** Fully dynamic SQL that builds the guard name from fragments, and roles or ACLs created outside migrations (hosted dashboard, ambient default privileges for roles other than the seeded four), are not visible to the static model. The live F1/E5/E6 catalog checks cover the disposable cluster only.

### C.4 Adversarial suite

Suite: `tests/sql/shopify-conn-1d-e-json-secret-guard-adversarial.sql`. Result on the fresh full chain with the correction: `CONN-1d-E adversarial PASS`.
- E0 — round-trip.
- A1–A5 — 34 secret payloads × 4 columns × insert/update, as `service_role` and as owner.
- B — 8192-byte exact accepted, 8193 rejected, depth 8/9.
- C1–C11 — all 11 JSON-writer CSV RPCs pass with real constants and deny secrets.
- G — liveness.
- D — legacy changed-value semantics.
- E1–E6 — grants, TRIGGER revoked, CREATE TRIGGER denied, no exposure.
- F — catalog order, enabled state, no `\b` in `prosrc`.

Negative control: the same suite on a chain without 1d-E fails at `FAIL A1 integrations insert: bare token key: secret payload was accepted`.

## D. App validation and serialization evidence

`assertNonSecretIngestionPayload`:
1. Walks the structure by own-property descriptor without invoking hooks. It rejects:
   - Proxy, accessors, non-plain prototypes, symbol keys
   - extra array properties and **sparse-array holes** (own index count ≠ `length`), cycles/shared references
   - function/bigint/symbol values, global `toJSON` pollution
2. Serializes once and enforces the 4096 UTF-8-byte cap.
3. Calls `JSON.parse` and validates the parsed copy: key shape and deny list, value patterns, depth ≤ 8, finite non-exponent numbers, no NUL or lone surrogates.
4. Returns the canonical copy, which is what callers persist.

Sparse-hole correction: before it, a hole was read through `Array.prototype` during `JSON.stringify`, so a polluted index getter ran once. The result was still validated. The guard now rejects holes before serialization, and the regression test asserts `reads === 0` with a polluted `Array.prototype[0]` getter. The public API is unchanged.

```
npx vitest run tests/unit/shopify-conn-1d-e-secret-guard-canonical.test.ts tests/unit/shopify-conn-1d-a-secret-ingestion-boundaries.test.ts
→ Tests 94 passed (94)   (canonical alone: 84)
```

## E. Cross-layer parity

```
RUN_CONN1D_E_ISOLATED_LIVE=1 CONN1D_E_PGHOST=127.0.0.1 CONN1D_E_PGPORT=55427 \
CONN1D_E_PGDATABASE=conn1d_e_fixlive{1,2} CONN1D_E_PGUSER=postgres \
npx vitest run tests/unit/shopify-conn-1d-e-app-db-parity.live.test.ts
→ Tests 8 passed (8) on each fresh empty DB (post-correction), identical results
corpus seed=122385 size=2500
{"appAccept":628,"dbAccept":695,"bothReject":1309,"appOnlyReject":67,"unstorable":496,"injected":1019}
```

Invariants held:
- Every app-accepted value is DB-accepted.
- Accepted `jsonb::text` ≤ 6144 bytes.
- All 1019 injected secrets were rejected by both layers.

Boundaries (L4):
- 4096-byte compact numeric array: accepted by both, at ≤ 6144 bytes.
- 4097 bytes: app-rejected.
- CJK 4096-byte string: accepted by both.
- 8193-byte jsonb text: DB-rejected.

Unicode case-folding probes (dotted and dotless i, long s, Kelvin sign, fullwidth letters) agreed with the app under C, C.UTF-8, en_US.UTF-8, tr_TR.UTF-8 and ICU collations on macOS libc.

The parity claim is bounded to this corpus and generator. The corpus is plain data only, and it isn't a proof over all JSON.

## F. CSV / α / β / 1d-B / 1d-C regressions (post-correction)

Each suite ran unchanged on a fresh DB built from the full-chain bootstrap, the non-CONN migrations and the corrected 1d-E migration. `service_role` TRIGGER was `f` in every DB. The suite then applied its own CONN migrations, so 1d-E was applied before the CONN vault migrations there; there is no dependency between them.

| Suite | Result | Deadlocks |
|---|---|---|
| `shopify-conn-1a-credential-vault.live` | 6/6 PASS | 0 |
| `shopify-conn-1c-alpha-credential-persistence.live` | 4/4 PASS | 0 |
| `shopify-conn-1c-beta-refresh-lease.live` | 11/11 PASS | 0 |
| `shopify-conn-1d-c-disconnect-revoke.live` | 10/10 PASS | 0 |
| `shopify-conn-1d-b-v8-isolation.live`, V8 matrix only (`-t`), full chain + 1d-E | 1/1 PASS (V15 skipped) | 0 |
| `shopify-conn-1d-b-v8-isolation.live`, full suite, native empty-DB harness | 2/2 PASS | — |

The 1d-B V15 script (`tests/sql/shopify-conn-1d-b-v15-bootstrap-rollback.sql`) assumes the minimal 1d-B bootstrap. On a full-chain DB it drops the real M2.7 policy `integrations_select_member`, then fails at `drop table public.organization_members` (no CASCADE, real dependents). It must not be run against a full-chain DB, and was not in this correction round. This is pre-existing and unrelated to 1d-E.

CSV RPCs: all 11 success and secret-rejection paths pass in adversarial C1–C11/G. The direct `ensure-integration` INSERT as `service_role` passes in E0.

Offline unit set (all non-live `shopify-conn-1*`, `provider-csv-*` and `*observability*` tests): **45 files, 496/496 PASS**.

`provider-csv-*.live` suites: **NOT RUN.** They need the local Supabase stack, which is a forbidden target.

Static checks:
- `npm run check:migrations` → exit 0, count=57, latest_sha256=`cf4ac08f…81b0`
- `npx tsc --noEmit` → exit 0
- scoped `eslint` → exit 0, no warnings
- `git diff --check` → exit 0; the untracked new files are also whitespace-clean

## G. Migration, concurrency and rollback evidence

- **Invalid-row atomicity:** two planted violations abort with `CONN-1d-E existing-row scan rejected 2 value(s): {"integrations.configuration": 2}`. No function or trigger is created and the planted row is untouched. Remediation followed by reapply works. Parity L7 repeats this.
- **Two-session migration lock** (L6): the writer is blocked during the apply, then the bad writer is rejected and the clean writer succeeds. Deadlocks 0.
- **Two-session `csv_bind_location` race** (L5): imported/skipped as before. Deadlocks unchanged.
- **V15 rollback** (`tests/sql/shopify-conn-1d-e-v15-rollback-additive.sql`): drops only the 3 triggers and the function. It asserts the following are intact:
  - RLS and the M2.7 grants/policies
  - the M2.6 triggers
  - all 11 CSV RPCs, `replace_integration_credential_set` and `disconnect_or_revoke_integration_credentials`
  - the vault tables

  It proves the DB control is **removed**; rollback makes no claim that V11 enforcement continues. The TRIGGER revoke is a privilege change, not an additive object, so rollback deliberately leaves it in place. This is asserted, together with `service_role` INSERT/UPDATE. Restoring the exact pre-1d-E ACL would need an explicit owner `grant trigger`, which is not recommended. Result: PASS.
- **Reapply** restores 3 triggers and enforcement (an `apiKey` insert as `service_role` → SA011), with no non-owner TRIGGER holder (L8).

## H. Remaining risks

- **Owner / superuser bypass (not fixed, by design).** The table owner (`postgres`) or a superuser can disable, drop, replace or out-order the guard, or write with `session_replication_role = replica`. Any role granted membership in the owner role inherits this. The static model flags such grants in migrations but cannot see grants made outside them.
- **Later-trigger bypass.** It's prevented for `anon`, `authenticated` and `service_role` by the TRIGGER revoke, and detected in migrations by the static model. The live F1 catalog check covers the disposable cluster only. F2 is supplementary.
- **Roles outside the model.** Hosted roles other than `public`, `anon`, `authenticated` and `service_role` (for example `authenticator` or dashboard-created roles), and hosted default privileges, are **unverified**.
- **Detection is pattern- and key-based.** Encoded, opaque, split or non-Shopify tokens under benign keys are not detected. **No universal secret-detection claim is made.**
- **Server logs.** A rejected literal SQL statement can be logged (`log_min_error_statement = error`). Parameter values from RPC or PostgREST calls are not logged when `log_parameter_max_length_on_error = 0`. **No log-secrecy claim is made.**
- **Hosted unknowns.** Collation, ctype and regex behaviour under Linux glibc, ownership, `service_role` attributes and lock duration on hosted data volume are unverified.
- **Liveness.** A rejected terminal write leaves the run `running` in SQL. Production callers pass constants, and the pre-existing swallow of fail-finalization errors in `executeCsvImport` (no sweeper) is unrelated to 1d-E.
- **False positives.** The `Basic <8+ base64 chars>` pattern can flag benign prose.
- **In-process pollution.** App-guard pollution of the `JSON` or `Buffer` globals inside the same process is out of scope.

## I. Exact staging manifest (owner action; not performed)

```
supabase/migrations/20261124120000_shopify_conn_1d_e_json_secret_guard.sql
supabase/migrations.sha256
lib/security/secret-ingestion.ts
tests/sql/shopify-conn-1d-e-full-chain-bootstrap.sql
tests/sql/shopify-conn-1d-e-json-secret-guard-adversarial.sql
tests/sql/shopify-conn-1d-e-v15-rollback-additive.sql
tests/unit/shopify-conn-1d-e-secret-guard-canonical.test.ts
tests/unit/shopify-conn-1d-e-app-db-parity.live.test.ts
docs/SHOPIFY_CONN_1D_E_V11_IMPLEMENTATION_REPORT.md
```

`AGENTS.md`, `.vitest/` (sha1 `55661591291aea593f7b3bfc623d547e09dccbfb`, unchanged) and the other 16 protected entries were preserved and are not part of this manifest.

## J. Recommendation

**Offline PASS** for these subclaims:
- DB rejection of the defined key and value classes on all four scoped columns, for `anon`, `authenticated` and `service_role`. These roles can neither bypass the trigger nor attach a later trigger. **The table owner and superusers can still bypass it.**
- the stricter app guard
- app-accept ⇒ DB-accept on the tested corpus
- offline fail-closed detection of guard regressions in future migrations
- additive migration safety and rollback

**V11 overall: PARTIAL.** The original contract says the `integrations.configuration` round-trip *never* stores access/refresh tokens. That is only established for detectable token shapes and key names, for non-owner roles, on the disposable cluster. Undetectable token encodings, owner/superuser bypass and hosted application all remain unverified.

**CONN-1 exit: UNMET.**

STOP FOR OWNER REVIEW.
