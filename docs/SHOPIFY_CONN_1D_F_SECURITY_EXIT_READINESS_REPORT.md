# SHOPIFY CONN-1d-F — Security Exit & Production Readiness Decision Record

**Milestone:** CONN-1d-F — read-only security exit / production readiness audit, recorded by **DOC-TRACK-3**
**Status:** **PARTIAL** — decision record only — **STOP for owner review** (pending DOC-TRACK-3 Git closure)
**As-of:** 2026-11-24 (Asia/Dubai)
**Baseline:** `main` @ `5de98cf` (`5de98cff025162e296f9c14524e0fa69d5691794`) ≡ `origin/main`
**Mode:** Documentation only. The CONN-1d-F audit was read-only: no source, test, SQL, migration, hosted DB, JWT, KEK, OAuth, Shopify HTTP, SyncRun, worker or Git write operation. No test suite was re-executed (running suites writes to the protected `.vitest/` directory).

| Gate | State |
|---|---|
| CONN-1d-E | **CLOSED/PUSHED** @ `5de98cf` (offline / disposable only) |
| Vault contract §11 | **Unchanged** |
| V11 | **PARTIAL** |
| V8 | Offline **PASS** under §11; hosted JWT/PostgREST **NOT VERIFIED** |
| CONN-1 exit (§11) | **UNMET** |
| `CREDENTIAL_BINDING_AUTHORIZATION_STATUS` | **`NOT_YET_VERIFIED`** |
| D13 revoke retention · D14 KEK custody | **Not resolved (DEFERRED)** |
| Hosted apply of five CONN migrations | **NOT AUTHORIZED / not applied** |
| Next milestone | **CONN-HR-0** (after DOC-TRACK-3) |
| OAuth · Shopify HTTP · webhooks · SyncRun · workers/cron | **BLOCKED** |

This record does **not** amend the vault contract, mark CONN-1 CLOSED or CERTIFIED, authorize hosted apply, or claim hosted, production or OAuth readiness. Historical implementation reports are not modified.

---

## 1. Baseline evidence (verified 2026-11-24)

| Check | Value |
|---|---|
| Branch / HEAD | `main` @ `5de98cf` — `security(shopify): close CONN-1d-E offline JSON secret guards` |
| `origin/main` | Same SHA (no CI claim) |
| Staging | Empty |
| Migration inventory | **57** files = **57** `supabase/migrations.sha256` entries; latest `20261124120000` sha256 `cf4ac08f…81b0`; `node scripts/check-migration-integrity.mjs` PASS |
| Protected entries | 18 dirty/untracked entries, untouched |
| Runtime exposure | No module in `app/`, `components/`, `workers/` or `supabase/functions` imports `lib/integration-credentials`; no `vercel.json` (no cron) |

Commits since the previous canonical pin (`b3ac033`):

| Commit | Slice | Migration |
|---|---|---|
| `40d5888` | CONN-1d-D security acceptance report + V1–V15 re-matrix (docs) | — |
| `5de98cf` | CONN-1d-E V11 JSON secret guards (DB trigger + app guard + tests + report) | `20261124120000` |

---

## 2. V1–V15 status at `5de98cf`

Vault contract §11 states its own scope: *"Offline / disposable only. No Shopify network. No hosted JWT."* Each ID therefore carries an offline §11 status and a separate hosted/production status. Evidence is dated 2026-11-22 to 2026-11-24 on disposable PostgreSQL 17.11 (`127.0.0.1:55427`); it was not re-executed by CONN-1d-F.

| ID | Offline §11 status | Hosted / production | Scope limit | Evidence |
|---|---|---|---|---|
| V1 | PASS | Not hosted | — | 1b crypto unit · `00557c7` |
| V2 | PASS | Not hosted | — | 1b AAD transplant; α cross-org SQL · `a918217` |
| V3 | PASS (scoped) | NOT VERIFIED | KEK re-wrap of existing rows not tested (contract §5) | 1b, α CAS, β rotate · `173a357` |
| V4 | PASS | Not hosted | — | 1a CHECK; α/β incomplete-refresh DENY |
| V5 | PASS (scoped) | NOT VERIFIED | Lease expiry simulated, not real clock | β C1–C5c; 1d-C R1–R6 · `5c1c76b` |
| V6 | PASS | NOT VERIFIED (hosted ACLs) | — | 1a/β/1d-B/1d-C live grants |
| V7 | PASS (scoped) | **BLOCKED** — binding `NOT_YET_VERIFIED` | DB RPCs trust `service_role`-supplied org/integration ids; tenant scope enforced by app-layer brand only | 1d-B V8-S1–S3 · `0f3e1d2` |
| V8 | **PASS** (owner decision; §11 excludes hosted JWT) | **NOT VERIFIED** | `auth.uid()` claim stub, not real JWT → PostgREST | 1d-B SQL + live · `0f3e1d2` |
| V9 | PASS | Not hosted | — | 1a adversarial SQL; α/β cross-org DENY |
| V10 | PASS (schema level) | DEFERRED to CONN-2 / D13 | No bind RPC exists | 1a partial unique indexes; 1d-C D5/D10–D12 |
| **V11** | **PARTIAL** | NOT VERIFIED | See §3 | 1d-A `636725c`; 1d-E `5de98cf` |
| V12 | PASS (scoped) | — | Not universal redaction (stringified JSON values, non-Shopify shapes, logger-routed output only) | `636725c` |
| V13 | PASS (scoped) | — | API-envelope half not tested (no API exists) | 1b/α/β/1d-C error codes |
| V14 | PASS | — | Live cert flags `false` | RO.1/RO.3 fixtures; architecture tests |
| V15 | PASS (asymmetric by design) | NOT VERIFIED | 1d-C rollback keeps the α terminal fence; 1d-E rollback keeps the TRIGGER revoke | Per-slice V15 SQL incl. `tests/sql/shopify-conn-1d-e-v15-rollback-additive.sql` |

**Tally:** 14 offline PASS (V3, V5, V7, V10, V12, V13 scoped; V15 asymmetric) · **1 PARTIAL (V11)**.

**Reconciliation with CONN-1d-D.** `docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md` recorded V8 as PARTIAL overall while stating it passed on disposable evidence. Per owner decision 4 (§6), V8 is recorded as offline PASS under §11's own scope, and the hosted JWT gap is carried as a hosted gate. The CONN-1d-D tally (13 PASS · 2 PARTIAL) remains historical evidence and is not rewritten. Either way, CONN-1 exit depends only on V11.

---

## 3. V11 against the original contract

§11 V11: *"`integrations.configuration` round-trip never stores access/refresh tokens."*

| Class | State | Evidence / limit |
|---|---|---|
| App/DB structural and known-token protection | Offline PASS | 1d-E trigger `zz_conn_1d_e_secret_json_guard` on `integrations.configuration`, `provider_bindings.source_metadata`, `sync_runs.error_summary` / `reconciliation_metadata`; stricter app guard; app-accept ⇒ DB-accept on the tested corpus; static future-migration regression model; 1d-E report §§C–G |
| `service_role` later-trigger bypass | Closed offline | `revoke trigger … from public, anon, authenticated, service_role` in `20261124120000`; adversarial E5/E6 |
| Opaque / encoded secrets | **Not detectable** | Base64/URL-encoded, split, opaque or non-Shopify tokens under benign keys pass; no universal secret-detection claim (1d-E report §H) |
| Owner / superuser trust | **Residual** | Table owner (`postgres`), superusers, owner-role members and `session_replication_role = replica` can disable, drop or out-order the guard |
| Hosted verification | **NOT VERIFIED** | `20261124120000` not hosted-applied; hosted roles outside the model (e.g. `authenticator`, dashboard roles) and default privileges unverified |

**V11 remains PARTIAL and §11 is unchanged (owner decision 2).** PASS is not redefined. An unqualified "never" cannot be established by any pattern-based guard. Reaching CONN-1 exit would require a separate, explicitly recorded owner decision (for example a formal §11 amendment that splits V11 into structural, by-construction, owner-trust and hosted sub-claims); no such amendment is made or implied here.

---

## 4. Findings

### 4.1 Production authorization (binding stays `NOT_YET_VERIFIED`)

1. `IntegrationOwnershipLookup` is an interface only (`lib/integration-credentials/repository.ts`); no production implementation exists.
2. `TenantContext` (`lib/tenancy/types.ts`) is an unbranded interface. `assertTrustedTenantContext` checks that fields are non-blank strings and calls `assertServiceOperationScope`; it does not prove membership. The branded `TrustedCredentialScope` proves "integration belongs to this org", not "this user is a member of this org".
3. Requirements for the binding slice (not implemented): tenant context minted only from `resolveTenantContext` with verified memberships; a role policy for connect/disconnect; an org-filtered ownership lookup (preferably through the user's RLS session, since M2.7 grants members `SELECT` on `integrations`) before any `service_role` vault RPC; the lookup-to-RPC membership-revocation window documented.

### 4.2 V8 hosted JWT — smallest safe verification (not authorized)

Immediately after an authorized hosted apply, while the vault tables are provably empty:

1. Catalog-only ACL snapshot (`has_table_privilege` / `has_function_privilege`) for `anon` and `authenticated` on vault tables and RPCs.
2. One synthetic user in a dedicated empty test org: real-JWT PostgREST `GET` on each vault table and `POST /rpc` on each vault RPC → denied.
3. The same as `anon`.
4. One malformed and one expired JWT → `401`.

No tenant data, no `service_role`. Fold into the hosted-apply verification or the PE1.b.6b J-matrix rather than a new gate.

### 4.3 Hosted readiness (no hosted execution performed)

Five migrations await hosted authorization, in this order:

| # | Migration | Slice |
|---|---|---|
| 1 | `20261121120000_shopify_conn_1a_integration_credential_vault.sql` | CONN-1a |
| 2 | `20261122120000_shopify_conn_1c_alpha_credential_persistence.sql` | CONN-1c-α |
| 3 | `20261122130000_shopify_conn_1c_beta_refresh_lease.sql` | CONN-1c-β |
| 4 | `20261122140000_shopify_conn_1d_c_disconnect_revoke.sql` | CONN-1d-C |
| 5 | `20261124120000_shopify_conn_1d_e_json_secret_guard.sql` | CONN-1d-E |

| Area | Finding to resolve in CONN-HR-0 |
|---|---|
| Ordering | Apply in timestamp order as one owner-operated batch. Applying #5 alone leaves #1–#4 pending; a later `db push` would then need `--include-all`. |
| Transactions | #5 requires a transaction (`LOCK TABLE`, `set local lock_timeout`). Confirm the apply mechanism wraps each file in a transaction. |
| Locks | Only #5 sets `lock_timeout` (`5s`); #1–#4 set none, and their FKs to `integrations` take `SHARE ROW EXCLUSIVE`. Plan a session `lock_timeout` and apply with workers off and CSV imports quiet. |
| Owner / ACLs / grants | Verify owners of `integrations`, `provider_bindings`, `sync_runs` and of the SECURITY DEFINER vault RPCs; effective TRIGGER holders (incl. roles outside the static model); `public` default privileges; `service_role` attributes. |
| PostgreSQL version | Disposable evidence used 17.11; confirm hosted major version, glibc collation and `~*` behaviour. |
| Log settings | Check `log_statement`, `log_min_duration_statement`, `log_min_error_statement`, `log_parameter_max_length[_on_error]` and pgaudit. Logged bind parameters would place full vault ciphertext in server logs (contract §9 rule 2 / V13). |
| Existing-row scan | CSV writers persist constants only (`purpose`, `configuredBy`, `locationName`, `code`); other hosted rows are unknown. A violation aborts #5 atomically with counts only. |
| Rollback | Per-slice V15 scripts in reverse order plus migration-history repair; safe only while the vault is empty (true until OAuth). Forward-fix preferred. |
| `FORCE ROW LEVEL SECURITY` | Not used on the guarded tables. |

### 4.4 D13 / D14 (not resolved; owner decisions required)

- **D13 revoke/retention** — required before the CONN-2 bind RPC is designed, not before hosted schema apply (no ownership rows exist until OAuth). Open questions: immediate release after `completed` (Phase A default) vs same-org reservation window; cross-org reclaim only via fresh OAuth + bind-time conflict check; ownership-history retention and interaction with `shop/redact` (CONN-3); acceptability of ownership staying reserved while a disconnect is `lease_held`.
- **D14 KEK custody** — required before any hosted vault write (i.e. before OAuth). Open questions: env-injected (named-environment sign-off) vs external secret manager (KEK only); distinct KEK per environment, never the production KEK on preview deployments; generation and escrow ownership (KEK loss forces merchant re-authorization); rotation cadence and re-wrap job timing (V3); fail-closed boot wiring of `createKekResolverFromEnv` (currently not wired).

### 4.5 Operational risks

| Risk | Gate |
|---|---|
| Nothing retries a `lease_held` disconnect; ownership stays reserved until `completed` | Before disconnect is merchant-facing (CONN-2/3) |
| `executeCsvImport` (`lib/providers/csv/import-execution.ts`) swallows fail-finalization errors with no sweeper; a run can remain `running`, and `begin` returns `in_progress` for that idempotency key (pre-existing; not fully traced) | Mandatory before Shopify SyncRun; optional for CSV now |
| Owner/superuser bypass; hosted roles outside the static model | Accepted residual; post-apply catalog check |
| Guard false positives: `Basic <8+ base64 chars>` matches prose (e.g. "Basic Settings"); any key containing `token` matches provider pagination keys such as `nextToken` | Fails closed; future provider work |
| The static model fails any later migration that mentions the guard, so extending patterns for new providers needs a documented amendment procedure | CONN-MP-CRED |
| V12 redaction not universal | Deferred |
| Workers/cron OFF (no `vercel.json`); `workers/` code present | Keep OFF |

### 4.6 Compatibility

1d-E validates UPDATEs only when a column value changes, so CONN-1d-C status-only updates and CSV `coalesce` carry-forward are not blocked. CONN-1a/α/β/1d-C live suites, all 11 CSV RPCs and the 1d-B V8 matrix passed with 1d-E applied (1d-E report §F). Shopify certification flags stay `false`. Key-based detection is provider-neutral; value patterns are Shopify plus generic Bearer/JWT/Basic. No provider enum, `token_kind` or M5–M7 contract change.

---

## 5. Dependency-ordered milestones

| Order | Milestone | Class | Depends on |
|---|---|---|---|
| 1 | **DOC-TRACK-3** — canonical docs reconciliation + this record | Mandatory before hosted apply | — |
| 2 | **CONN-HR-0** — hosted readiness package: owner-run read-only precheck plan for every §4.3 item, apply mechanism, lock/rollback plan; fresh disposable re-execution of CONN/CSV/1d-E suites at exact HEAD (needs an approved non-protected vitest cache path). Scope subject to owner authorization; no hosted execution | Mandatory before hosted apply | 1 |
| 3 | **Hosted apply of the five migrations** (owner-operated) + post-apply catalog checks + §4.2 V8 empty-vault probe | Mandatory before OAuth | 2 + separate owner authorization |
| 4 | **Production binding slice** (§4.1) — may proceed offline in parallel with 2–3 | Mandatory before OAuth | 1 |
| 5 | **D14 decision → KEK boot wiring** | Mandatory before any hosted vault write | Owner decision |
| 6 | **D13 decision** | Mandatory before CONN-2 bind RPC design | Owner decision |
| 7 | **CONN-2 OAuth** — carries V10 end-to-end bind/reclaim and a by-construction proof that token code paths cannot reach the four JSON writers | Gated | 3, 4, 5, 6 |
| 8 | **Operational slice** — `lease_held` retry path, SyncRun fail-finalization + stale-run handling, real-clock lease test | Mandatory before CONN-5 SyncRun (retry before CONN-3) | 4 |
| — | KEK re-wrap job (V3); universal redaction; non-Shopify token shapes (CONN-MP-CRED); V13 API envelope | Deferred | — |
| — | CSV stale-run sweeper now; `Basic` pattern tuning | Optional | — |

---

## 6. Owner decisions recorded (DOC-TRACK-3, 2026-11-24)

1. CONN-1d-E is **CLOSED/PUSHED** @ `5de98cf`.
2. V11 remains **PARTIAL**; vault contract §11 is **unchanged**.
3. CONN-1 exit remains **UNMET**.
4. V8 is offline **PASS** under §11; hosted JWT/PostgREST is **NOT VERIFIED**.
5. Binding remains **`NOT_YET_VERIFIED`**.
6. D13/D14 are **not yet resolved**.
7. Five migrations (§4.3) await hosted authorization.
8. **CONN-HR-0** is next after DOC-TRACK-3.
9. **No hosted application is authorized.**

### Still open (not decided here)

- Whether CONN-1 exit (or a §11 V11 amendment) is required before hosted schema apply.
- Hosted batch composition and apply mechanism (CONN-HR-0 input).
- Venue for hosted V8 verification (post-apply probe vs PE1.b.6b J-matrix).
- D13 and D14.
- How to reconcile protected `docs/SERVICE_ROLE_BOUNDARY.md` with the 1d-E TRIGGER revoke (not edited).

---

## 7. Verdict

### **PARTIAL**

| Layer | Verdict |
|---|---|
| Offline V1–V15 | 14 PASS (several scoped) · 1 PARTIAL (V11) |
| CONN-1 exit (§11) | **UNMET** |
| Hosted / production / runtime | **BLOCKED** |
| Binding | **`NOT_YET_VERIFIED`** |

UX-INV-1d, AI-INV-2–6, AI-MKT-0–4 and the multi-provider roadmap (CONN-MP-0) are unchanged.

**STOP for owner review.** No staging, commit or push performed.
