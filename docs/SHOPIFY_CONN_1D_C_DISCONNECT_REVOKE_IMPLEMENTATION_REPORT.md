# SHOPIFY_CONN_1D_C_DISCONNECT_REVOKE_IMPLEMENTATION_REPORT

**Status:** PARTIAL — OFFLINE / DISPOSABLE ONLY — **STOP for owner review**
**As-of:** 2026-11-22
**Baseline:** `main` @ `0f3e1d2` (`0f3e1d22f55e0dd105f98d33a3c440a793fda60e`)
**Mode:** Local offline 1d-C disconnect/revoke + α terminal fence. No production authorization. No Git ops.

| Gate | State |
|---|---|
| Offline 1d-C foundation (α fence + disconnect RPC + wrappers + disposable tests) | **Accepted for offline close** under PARTIAL |
| Production authorization (`CREDENTIAL_BINDING_AUTHORIZATION_STATUS`) | **`NOT_YET_VERIFIED`** |
| D13 retention / D14 binding / OAuth / Shopify HTTP / hosted | **DEFERRED / BLOCKED** |
| CONN-1d-D | **Not started** |

---

## A. Baseline and changed paths

| Check | Result |
|---|---|
| Branch | `main` |
| HEAD | `0f3e1d2` (= `origin/main`) |
| Staging | empty (no `git add` / commit / push) |
| Protected dirty tree | **Preserved** |

### Exact ten paths (frozen manifest)

1. `supabase/migrations/20261122140000_shopify_conn_1d_c_disconnect_revoke.sql`
2. `supabase/migrations.sha256`
3. `lib/integration-credentials/repository.ts`
4. `tests/sql/shopify-conn-1d-c-disconnect-revoke-adversarial.sql`
5. `tests/sql/shopify-conn-1d-c-v15-rollback-additive.sql`
6. `tests/unit/shopify-conn-1d-c-disconnect-revoke-architecture.test.ts`
7. `tests/unit/shopify-conn-1d-c-disconnect-revoke-repository.test.ts`
8. `tests/unit/shopify-conn-1d-c-disconnect-revoke.live.test.ts`
9. `docs/SHOPIFY_CONN_1D_C_DISCONNECT_REVOKE_IMPLEMENTATION_REPORT.md` (this file)
10. `tests/sql/shopify-conn-1c-beta-refresh-lease-adversarial.sql`

Path 10 is an owner-approved β fixture correction: `integ_rev` is seeded `active`, its credential is created via α, and it is flipped to `revoked` before B10, because the 1d-C terminal fence correctly rejects α create on a revoked integration. The full β adversarial suite passes on both α+β and α+β+1d-C schemas (see §G).

**Not modified:** historical α/β migration file bytes, CONN-1a/1b crypto, `env.ts`, routes, workers, OAuth, CONN-MP-0, unrelated dirty files.

---

## B. Alpha terminal-fence evidence

`CREATE OR REPLACE public.replace_integration_credential_set` (same signature/grants):

- Lock order: `integrations FOR UPDATE` → credential insert/CAS
- `status ∈ {disconnected, revoked}` → **`fenced`** (create and CAS)
- Nonterminal statuses preserve original create-only / CAS / lease-fence behavior
- Historical `20261122120000_…alpha…sql` file **unchanged**; fence is additive OR REPLACE only

Disposable proof (adversarial D6 + live R2): after terminal clear, α create returns `fenced` and vault row count stays 0.

---

## C. Disconnect RPC / state machine

`disconnect_or_revoke_integration_credentials(uuid,uuid,text,bigint,text,text)`

| Contract | Enforcement |
|---|---|
| DEFINER + `search_path=''` | Yes |
| EXECUTE `service_role` only; vault/external DML revoked | Yes (live grants matrix) |
| Lock order | integrations → credentials → external_accounts |
| Reason map | merchant→disconnected; uninstall/hard_auth→revoked; mismatch `22023` |
| Upgrade | disconnected→revoked allowed; reverse → `conflict` |
| Generation | NULL **only** if vault absent; present requires exact positive match |
| `lease_held` | terminal committed; vault retained; ownership **not** released |
| `completed` | vault cleared (or was absent) + ownership released if was active |
| Edge C | vault absent + ownership active → release + `completed` |
| `already_terminal` | only when no cleanup remains |
| No force-clear / advisory / generation bypass | Architecture + SQL review |

Repository: `disconnectOrRevokeIntegrationCredentials` requires branded `TrustedCredentialScope`; `credentialsDestroyed` true **only** for `completed` / `already_terminal` (never `lease_held`). Binding remains **`NOT_YET_VERIFIED`**.

---

## D. Real concurrency results

Disposable host: Homebrew PG 17.11 `127.0.0.1:55427` / `conn1d_c_verify`
Datadir under StoreAgent restore-scratch (not `/var/lib/postgresql/data`)
**Not used:** `:55322`, `:54322`, hosted

Two-connection races (distinct `pg_backend_pid`, `pg_blocking_pids` barriers, `deadlocks` delta = 0):

| Case | Result |
|---|---|
| R1 α CAS vs disconnect | CAS wins gen bump; disconnect `conflict`; vault+ownership intact |
| R2 disconnect then α create | create `fenced`; vault 0; ownership released |
| R3 disconnect vs β acquire | acquire denied; vault cleared; status revoked |
| R4 lease_held → expiry retry | held then `completed` + ownership release; rotate fenced while held |
| R5 parallel disconnect/revoke | one `completed`; other `conflict`; no deadlock |
| R6 terminal upgrade + lease | status→revoked; `lease_held`; ownership stays active |

---

## E. Ownership and rollback evidence

- Phase A uniqueness released **only** on `completed` (adversarial D5/D10/D11/D12)
- V15 drops disconnect RPC only; **α terminal fence retained**
- V15 explicitly **flags unsafe α downgrade** (behavioral probe expects `fenced` under disconnected)
- Owner decision honored: no rollback restores credential resurrection

---

## F. Tests / V-matrix

```text
npx vitest run 1d-C architecture + repository + α/β architecture/repository
→ 6 files / 35 tests PASS

RUN_CONN1D_C_ISOLATED_LIVE=1 … vitest run shopify-conn-1d-c-disconnect-revoke.live.test.ts
→ 10/10 PASS (grants, D1–D14 adversarial, R1–R6 races, V15)

npm run check:migrations → PASS (56 entries; latest 20261122140000)
tsc --noEmit → PASS
eslint (scoped 1d-C paths) → PASS
git diff --check (scoped) → PASS
```

---

## G. Remaining risks and blockers

1. **β adversarial fixture corrected** (owner-approved, `tests/sql/shopify-conn-1c-beta-refresh-lease-adversarial.sql`): `integ_rev` is now seeded `active`, its credential is created via α while active, and the integration is flipped to `revoked` before B10. B10 acquire DENY / no-secret assertions are unchanged; no RPC or fence was weakened. Full β adversarial suite **PASS** on α+β and **PASS** on α+β+1d-C. α isolation suite **PASS** on an α-only schema; it is not claimed to pass on the combined schema, because its "β RPC absent" assertion is α-only by design.
2. Production binding / JWT / hosted PostgREST still **`NOT_YET_VERIFIED`**.
3. D13 retention / D14 / OAuth / workers / CONN-1d-D not started.
4. Operational obligation: callers must retry after `lease_held` expiry until `completed`.

---

## H. Exact Git staging manifest (for owner)

```text
supabase/migrations/20261122140000_shopify_conn_1d_c_disconnect_revoke.sql
supabase/migrations.sha256
lib/integration-credentials/repository.ts
tests/sql/shopify-conn-1d-c-disconnect-revoke-adversarial.sql
tests/sql/shopify-conn-1d-c-v15-rollback-additive.sql
tests/unit/shopify-conn-1d-c-disconnect-revoke-architecture.test.ts
tests/unit/shopify-conn-1d-c-disconnect-revoke-repository.test.ts
tests/unit/shopify-conn-1d-c-disconnect-revoke.live.test.ts
docs/SHOPIFY_CONN_1D_C_DISCONNECT_REVOKE_IMPLEMENTATION_REPORT.md
tests/sql/shopify-conn-1c-beta-refresh-lease-adversarial.sql
```

The tenth path is the owner-approved β fixture correction; it passes on both α+β and α+β+1d-C schemas.

**Do not stage** protected dirty tree paths.

---

## I. PASS / PARTIAL / BLOCKED

| Item | Verdict |
|---|---|
| Offline 1d-C implementation + disposable verification | **PASS** (under PARTIAL / offline-only) |
| Production authorization / hosted apply | **BLOCKED** |
| Overall slice close | **PARTIAL** — STOP for owner review; no commit/push |

**STOP.** No Git ops performed.
