# SHOPIFY_CONN_1C_BETA_IMPLEMENTATION_REPORT

**Status:** PARTIAL — OFFLINE / DISPOSABLE ONLY — **STOP for owner review**
**As-of:** 2026-11-22
**Baseline:** `main` @ `1e18029` (`1e18029a6f9699d913f6fed683d369925bd104c3`)
**Mode:** Local offline β lease RPCs + repository wrappers. No production authorization. No Git ops.

| Gate | State |
|---|---|
| Offline β refresh-lease foundation (3 RPCs + wrappers + disposable tests) | **Accepted for offline close** under PARTIAL |
| Production authorization (`CREDENTIAL_BINDING_AUTHORIZATION_STATUS`) | **`NOT_YET_VERIFIED`** |
| Runtime credential ops / OAuth / Shopify HTTP / hosted | **BLOCKED** |
| CONN-1d / disconnect-revoke protocol | **Not started** |

---

## A. Git baseline

| Check | Result |
|---|---|
| Branch | `main` |
| HEAD | `1e18029` (= `origin/main`) |
| Staging | empty (no `git add` / commit / push) |
| Unrelated dirty tree | **Preserved** (`BACKGROUND_JOBS`, `SERVICE_ROLE_BOUNDARY`, DOCX/archives, `.tmp/`, snippets, etc.) |

---

## B. Exact changed paths

| Path | Role |
|---|---|
| `supabase/migrations/20261122130000_shopify_conn_1c_beta_refresh_lease.sql` | Additive acquire / rotate / release RPCs + grants |
| `supabase/migrations.sha256` | Manifest update (`check:migrations --write-manifest`); also backfills CONN-1a + α (see §D.3) |
| `lib/integration-credentials/repository.ts` | Server-only acquire / rotate / release (+ crypto-fail release helper) |
| `tests/sql/shopify-conn-1c-beta-refresh-lease-adversarial.sql` | Disposable B1–B17 matrix |
| `tests/sql/shopify-conn-1c-beta-v15-rollback-additive.sql` | β-only rollback; α + CONN-1a + M2 intact |
| `tests/unit/shopify-conn-1c-beta-refresh-lease-architecture.test.ts` | Architecture / grant / no-advisory / no-force |
| `tests/unit/shopify-conn-1c-beta-refresh-lease-repository.test.ts` | Wrapper validation + B15 crypto-fail release |
| `tests/unit/shopify-conn-1c-beta-refresh-lease.live.test.ts` | Isolated PG live harness + two-connection race tests C1–C5c |
| `docs/SHOPIFY_CONN_1C_BETA_IMPLEMENTATION_REPORT.md` | This report |

**Not modified:** α migration body, CONN-1a/1b crypto barrel, `env.ts`, app routes, workers, OAuth, CONN-MP-0, unrelated dirty files.

---

## C. RPC / grant evidence

### RPCs (exactly three)

1. `acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)`
2. `rotate_integration_credential_set(…envelope…, text, text, bigint)`
3. `release_integration_credential_refresh_lock(uuid,uuid,text,text,text)`

### Enforced protocol

- Lock order: `integrations FOR UPDATE` → `integration_credentials FOR UPDATE` (acquire/rotate)
- Eligibility: `integrations.status ∈ {active, degraded}`
- Single unexpired lease; same-owner reacquire **DENY**
- Success acquire returns sealed envelope + generation + claim token; deny returns **no** secrets
- Rotate: owner + claim token + generation + unexpired lease + eligibility; atomic pair + gen bump + clear locks
- Release: owner+token match only (expired own OK; successor mismatch → `fenced`)
- TTL 30–300; invalid → `22023`
- No advisory locks; no force-clear; no `integrations.status` mutation; α create/CAS/clear unchanged

### Grants

- Table `integration_credentials`: DML revoked from `public` / `anon` / `authenticated` / `service_role`
- β functions: `REVOKE ALL` then `GRANT EXECUTE` to `service_role` only
- Disposable live: table privileges empty for those roles; β EXECUTE true for `service_role`, false for browser roles

---

## D. Concurrency / race evidence

Disposable host: Homebrew PG 17.11 `127.0.0.1:55427` / `conn1c_beta_verify` (dropped + recreated per run)
Datadir: StoreAgent restore-scratch (not Supabase `/var/lib/postgresql/data`)
**Not used:** `:55322`, `:54322`, hosted

### D.1 Sequential single-session evidence (adversarial SQL, B1–B14)

`tests/sql/shopify-conn-1c-beta-refresh-lease-adversarial.sql` runs in **one** psql session, one statement after another. It proves fence/predicate logic, **not** overlapping transactions.

| Case | Result |
|---|---|
| Same-owner / other-owner reacquire (sequential) | Second call denied, no secrets |
| Rotate then stale rotate | `rotated` then `fenced`; winner ciphertext kept |
| Expiry takeover + prior-owner release/rotate | Successor intact; prior `fenced` |
| α CAS/clear under live lease | `conflict` / `fenced` |
| Revoked / disconnected acquire | Deny |
| Acquire → disconnect → rotate | `fenced`; ciphertext unchanged |
| Cross-org / wrong provider | Deny |
| Incomplete refresh rotate | `22023`; row+lease unchanged |
| Expired own release (no takeover) | `released` |

### D.2 Genuine multi-session evidence (two-connection race tests, C1–C5c)

`tests/unit/shopify-conn-1c-beta-refresh-lease.live.test.ts` → `two-connection overlapping transactions (V5)`.

Method:

- Contenders A and B are two independent long-lived `psql` backends (distinct `pg_backend_pid`), driven over stdin; a third `GATE` backend is used only in C1. No new dependencies.
- Each session verifies `current_database()` = `conn1c_beta_verify` and `inet_server_port()` = `55427` before any statement; harness refuses any port other than `55427`.
- Barriers: an observer connection polls `pg_blocking_pids(<blocked>)` + `pg_stat_activity.wait_event_type = 'Lock'` until the waiting session is provably parked behind the holder (5 s bound, 20 ms poll). The blocked statement's promise is asserted still in flight. No sleep-based assertions.
- Bounds: `lock_timeout = 10s`, `statement_timeout = 20s`, `client_connection_check_interval = 1s`, per-statement 25 s client timeout; sessions killed in `afterEach`.
- Lease expiry is simulated by owner-side fixture time travel (`refresh_lock_expires_at` moved into the past), not by waiting.
- Dedicated fixture org/integration (`c0cc1c0b-…`) seeded via α `replace_*`, deleted before and after. Post-run: 0 leftover `conn1c_beta_*` backends, 0 fixture rows, `pg_stat_database.deadlocks = 0`.

| Case | Overlap proven by | Outcome |
|---|---|---|
| C1 simultaneous acquire (5 rounds) | GATE holds `integrations` row; A and B both blocked (queue behind GATE/each other), then released together | Exactly one `acquired = true`; loser all-NULL (no token/ciphertext/generation); lease = winner owner+token; generation + ciphertext unchanged |
| C2 credential-row wait | A holds only the credential row (open tx after `release` fenced); B's acquire blocked by A while `integrations` row `FOR UPDATE NOWAIT` fails (B holds it, parked on credential row) | After A commits, B wins; later A acquire denied with no secrets |
| C3 expired takeover vs stale rotate | B takes over expired lease in open tx; A's rotate (old token) blocked by B | A `fenced`; lease = B; generation, access + refresh ciphertext unchanged |
| C4 stale release vs successor | B takes over in open tx; A's release (old token) blocked by B | A `fenced`; B lease intact; A late rotate `fenced`; B rotate `rotated` gen+1, lease cleared |
| C5a terminal status first | B `UPDATE integrations SET status='disconnected'` in open tx; A's rotate blocked by B | A `fenced`; status disconnected; generation + ciphertext unchanged; no error / deadlock |
| C5b rotate first | A rotated in open tx; B's terminal status update blocked by A | B applies after A commits; gen+1, lease cleared, status revoked; later acquire denied; no deadlock |
| C5c non-terminal status first | B sets `degraded` in open tx; A's rotate blocked by B | A `rotated` (degraded eligible) — serialized, not over-fenced |

Stability: full live file passed on 3 consecutive fresh-database runs (11/11 each).

### D.3 Migration checksum backfill

| Fact | Value |
|---|---|
| `main` @ `1e18029` manifest entries | **52** |
| `main` @ `1e18029` migration files | **54** |
| Unlisted at baseline | `20261121120000_shopify_conn_1a_integration_credential_vault.sql`, `20261122120000_shopify_conn_1c_alpha_credential_persistence.sql` |
| Baseline `check:migrations` | Would **FAIL** (`scripts/check-migration-integrity.mjs` errors on any file missing from manifest) |
| This slice | `--write-manifest` appended CONN-1a + CONN-1c-α checksums (backfill) + new β checksum |
| Result | **55** entries = 55 files; `check:migrations` PASS |
| Historical migration content | **Unchanged** (no committed migration file modified; only manifest lines appended) |

---

## E. Tests and V1–V15

```text
# fresh disposable DB (port 55427 + restore-scratch datadir asserted first)
DROP DATABASE IF EXISTS conn1c_beta_verify; CREATE DATABASE conn1c_beta_verify;

RUN_CONN1C_ISOLATED_LIVE=1 \
CONN1C_PGHOST=127.0.0.1 CONN1C_PGPORT=55427 \
CONN1C_PGDATABASE=conn1c_beta_verify CONN1C_PGUSER=postgres \
npx vitest run tests/unit/shopify-conn-1c-beta-refresh-lease.live.test.ts
→ 11/11 PASS (grants, sequential B1–B14, two-connection C1–C5c, V15) ×3 runs

# β + α + 1b focused regression (live enabled)
npx vitest run α repository/architecture + 1b crypto/architecture
  + β repository/architecture + β live
→ 7 files / 59 tests PASS

npm run typecheck → PASS
npm run lint → PASS (0 errors; 2 pre-existing unrelated warnings)
npm run check:migrations → PASS (55 migrations; latest 20261122130000)
git diff --check (β paths) + trailing-whitespace scan (untracked β paths) → PASS
```

B-matrix evidence type: B1–B14 sequential single-session SQL; B3/B6/B7/B11 race variants additionally proven multi-session by C1–C5c; B15 unit only; B16 = V15; B17 architecture test.

| ID | Status | Notes |
|---|---|---|
| **V1–V4** | Prior PASS | 1b/α |
| **V5** | **PASS (β disposable, two-connection)** | Sequential fences (D.1) + genuine overlapping-transaction races C1–C5c (D.2) |
| **V6–V7** | **PASS** | re-proven with β RPCs |
| **V8** | PARTIAL | unchanged (no authenticated vault path) |
| **V9** | **PASS** | cross-org/provider deny |
| **V10** | Prior 1a | β does not mutate ownership |
| **V11–V12** | NOT TESTED | deferred |
| **V13** | **PASS** | allowlisted errors; no secret leak in unit |
| **V14** | **PASS** | no Shopify network |
| **V15** | **PASS** | β-only drop; α + CONN-1a + M2 intact |

B15 (unit): decrypt failure after acquire calls `release_*`, never `clear_*`.

---

## F. Remaining blockers

| Item | State |
|---|---|
| `CREDENTIAL_BINDING_AUTHORIZATION_STATUS` | **`NOT_YET_VERIFIED`** |
| Production ownership lookup / runtime credential ops | **BLOCKED** |
| Disconnect/revoke authorization-gated protocol | **Not implemented** (by design; no force-clear in β) |
| OAuth / Shopify refresh HTTP / SyncRun / webhooks | **BLOCKED** |
| Hosted migration / KEK wiring / workers / JWT / M6/M7 | **BLOCKED** |
| Amazon/Noon / `token_kind` expansion | **BLOCKED** (CONN-MP-0 / CONN-MP-CRED) |
| CONN-1d | **Do not start** under this gate |

Non-blocking residual risks (availability / hygiene, not security):

- Lease orphaned until TTL (≤ 300 s) if acquire is granted but the repository rejects the response (malformed bytea / scope mismatch), or decrypt throws a non-`CredentialCryptoError`. Fails closed.
- `integrations FOR UPDATE` also blocks concurrent FK-child inserts for the RPC's duration; `FOR NO KEY UPDATE` would suffice (owner decision, future slice).
- Caller-supplied malformed `claimToken` surfaces as `malformed_rpc_response` (label only).
- Any future disconnect/revoke protocol must lock `integrations` before `integration_credentials` in the same transaction; reversing that order against a concurrent rotate would deadlock.
- β function owner = applying role; hosted owner not verified (no hosted apply).

---

## G. Proposed exact staging manifest

Do **not** stage/commit/push under this gate alone. When owner authorizes Git:

```text
supabase/migrations/20261122130000_shopify_conn_1c_beta_refresh_lease.sql
supabase/migrations.sha256
lib/integration-credentials/repository.ts
tests/sql/shopify-conn-1c-beta-refresh-lease-adversarial.sql
tests/sql/shopify-conn-1c-beta-v15-rollback-additive.sql
tests/unit/shopify-conn-1c-beta-refresh-lease-architecture.test.ts
tests/unit/shopify-conn-1c-beta-refresh-lease-repository.test.ts
tests/unit/shopify-conn-1c-beta-refresh-lease.live.test.ts
docs/SHOPIFY_CONN_1C_BETA_IMPLEMENTATION_REPORT.md
```

---

## H. PASS / PARTIAL / BLOCKED

### **PARTIAL — OFFLINE FOUNDATION**

β offline refresh-lease RPCs, fencing, grants, repository wrappers, sequential B1–B17 evidence, and genuine two-connection V5 race evidence (C1–C5c) are in place.

**Production authorization remains `NOT_YET_VERIFIED`.**
**Runtime credential operations, OAuth, hosted apply, and CONN-1d remain BLOCKED.**

**STOP for owner review.** Do not start CONN-1d, production resolver, OAuth, Shopify HTTP, workers, JWT, or M6/M7 under this gate. No staging/commit/push performed.
