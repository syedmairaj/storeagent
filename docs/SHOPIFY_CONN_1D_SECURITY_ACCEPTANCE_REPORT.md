# SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT

**Milestone:** CONN-1d-D — docs-only security acceptance report + V1–V15 re-matrix
**Status:** **PARTIAL** — offline evidence review only — **STOP for owner review** (pending its own Git closure)
**As-of:** 2026-11-23 (Asia/Dubai)
**Baseline:** `main` @ `b3ac033` (`b3ac0338a6a17aa9a1eb8f20552dc903bb7a5724`) ≡ `origin/main`
**Mode:** Documentation only. No source, test, SQL, migration, hosted DB, KEK, OAuth, Shopify HTTP, SyncRun, worker, JWT or Git operation.

| Gate | State |
|---|---|
| Offline V1–V15 re-matrix | **13 offline PASS · 2 PARTIAL (V8, V11)** |
| CONN-1 exit (vault contract §11: "V1–V15 PASS on disposable evidence") | **UNMET** — V11 is PARTIAL |
| Production authorization (`CREDENTIAL_BINDING_AUTHORIZATION_STATUS`) | **`NOT_YET_VERIFIED`** |
| Hosted apply of the four CONN vault migrations | **NOT AUTHORIZED / not applied** |
| D13 revoke retention · D14 KEK custody | **DEFERRED** |
| OAuth · Shopify HTTP · webhooks · SyncRun · workers/cron | **BLOCKED** |

This report does **not** mark CONN-1 CLOSED or CERTIFIED, does **not** change the vault contract §11 acceptance conditions, and does **not** claim hosted JWT, production or OAuth readiness.

---

## 1. Baseline and evidence provenance

### 1.1 Git baseline (verified 2026-11-23)

| Check | Value |
|---|---|
| Branch | `main` |
| HEAD | `b3ac033` — `docs(storeagent): reconcile CONN-1d-A/B/C security milestones` (DOC-TRACK-2) |
| `origin/main` | Same SHA (no CI claim) |
| Staging | Empty |
| Migration inventory | **56** files = **56** `supabase/migrations.sha256` entries (latest `20261122140000`); `node scripts/check-migration-integrity.mjs` PASS (read-only) |
| Runtime paths since `abb407d` | No diff in `app/`, `components/`, `workers/`, `vercel.json`, `lib/config`, `lib/persistence`, `supabase/functions`, `package.json` |
| Protected dirty tree | Modified `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`; deleted tracked `docs/StoreAgent_Roadmap_2026.docx`; untracked `.tmp/`, `.vitest/`, `AGENTS.md`, `S2/S3/S4_COMPLETE_TRANSACTION.sql`, M5 readiness docs, dated handoff draft, DOCX/archives, `supabase/snippets/` — untouched |

### 1.2 CONN commit chain

| Commit | Slice | Migration |
|---|---|---|
| `965e6d7` | CONN-0A security architecture | — |
| `abb407d` | CONN-1 vault contract (§11 = V1–V15) | — |
| `3d1f6ad` | CONN-1a vault schema + security tests | `20261121120000` |
| `00557c7` | CONN-1b server-only AES-256-GCM + KEK API | — |
| `a918217` | CONN-1c-α persistence (load / create-CAS / clear) | `20261122120000` |
| `1e18029` | CONN-MP-0 multi-provider freeze (D13/D14 DEFER) | — |
| `173a357` | CONN-1c-β refresh lease (acquire / rotate / release) | `20261122130000` |
| `0e2fc33` | DOC-TRACK-1 | — |
| `636725c` | CONN-1d-A secret ingestion guards + redaction | — |
| `0f3e1d2` | CONN-1d-B V8 isolation (tests only) | — |
| `5c1c76b` | CONN-1d-C disconnect/revoke + α terminal fence | `20261122140000` |
| `b3ac033` | DOC-TRACK-2 | — |

### 1.3 Evidence provenance rules

- All test evidence is **dated 2026-11-22**, taken from the committed tests and the slice reports (`docs/SHOPIFY_CONN_1A_SCHEMA_IMPLEMENTATION_REPORT.md`, `…_1B_CRYPTO_…`, `…_1C_ALPHA_…`, `…_1C_BETA_…`, `…_1D_B_V8_…`, `…_1D_C_DISCONNECT_REVOKE_…`).
- Disposable host for all live/SQL evidence: Homebrew PostgreSQL 17.11 on `127.0.0.1:55427` with a StoreAgent restore-scratch datadir. Not `:55322`, `:54322` or hosted.
- **No fresh execution** of unit, live or SQL suites was performed for CONN-1d-D. The only command executed was the read-only migration integrity check. Running suites would write to the protected `.vitest/` directory and needs the disposable PG instance.
- CONN-1d-A has no standalone implementation report. Its evidence is commit `636725c` (`lib/security/secret-ingestion.ts`, `lib/observability/redact.ts`, `tests/unit/shopify-conn-1d-a-secret-ingestion-boundaries.test.ts`, `tests/unit/application-observability-redaction.test.ts`) plus the CONN-1d-A final acceptance gate held in chat. §4 of this report records that gate's residual findings in the repository for the first time.
- The CONN-1d security preflight (V1–V15 + disconnect protocol design) and the CONN-1d-D final preflight were chat-only and are summarised here; they are not separate repo files.

---

## 2. V1–V15 individually scoped matrix

All statuses are **offline / disposable**. None is a hosted or production certification.

| ID | Contract assertion (§11) | Status | Evidence (tests · migration · commit) | Scope limit |
|---|---|---|---|---|
| **V1** | Round-trip; wrong key / wrong AAD fails closed | **Offline PASS** | `tests/unit/shopify-conn-1b-credential-crypto.test.ts` · — · `00557c7`; α repository decrypt-fail-closed unit (`tests/unit/shopify-conn-1c-alpha-credential-repository.test.ts`) · `a918217` | — |
| **V2** | Org A ciphertext cannot decrypt under org B AAD | **Offline PASS** | 1b AAD transplant tests · `00557c7`; `tests/sql/shopify-conn-1c-alpha-credential-persistence-adversarial.sql` cross-org DENY · `20261122120000` · `a918217` | — |
| **V3** | `key_version` mismatch fails closed; rotation writes new version atomically | **Offline PASS** (scoped) | 1b unknown/missing version DENY · `00557c7`; α generation CAS · `20261122120000`; β rotate bumps generation · `20261122130000` · `173a357` | KEK re-wrap of existing rows **NOT TESTED** (not authorized; contract §5) |
| **V4** | Never persist access without refresh for `offline_expiring` | **Offline PASS** | 1a CHECK (refresh envelope all-null or complete; required for `offline_expiring`) · `20261121120000` · `3d1f6ad`; α incomplete-refresh DENY · `a918217`; β rotate incomplete → `22023` · `173a357` | — |
| **V5** | Concurrent rotate single-flight | **Offline PASS** (disposable, two-session) | `tests/unit/shopify-conn-1c-beta-refresh-lease.live.test.ts` C1–C5c (3 fresh runs, 11/11 each) · `173a357`; `tests/unit/shopify-conn-1d-c-disconnect-revoke.live.test.ts` R1–R6 · `20261122140000` · `5c1c76b` | Lease expiry simulated by fixture time travel, not real clock; 1d-C stability run count not stated |
| **V6** | `anon`/`authenticated` no vault DML | **Offline PASS** | `tests/unit/shopify-conn-1a-credential-vault.live.test.ts` · `3d1f6ad`; re-proven by β live grants, 1d-B V8-G1, 1d-C live grants | — |
| **V7** | `service_role` RPC-only; helpers need org+integration scope | **Offline PASS** | Table DML revoked from `service_role` (1a/α/β/1d-C migrations); RPC EXECUTE `service_role` only; 1d-B V8-S1/S2 SQL + V8-S3 unit (branded `TrustedCredentialScope`) · `0f3e1d2` | DB RPCs trust the org/integration ids passed by `service_role`; tenant scope is enforced by the app-layer brand only, and binding is `NOT_YET_VERIFIED` |
| **V8** | Revoked membership / user client cannot read vault | **PARTIAL** | Offline **PASS**: `tests/sql/shopify-conn-1d-b-v8-role-membership-adversarial.sql` (G1–G2, A1–A3, R1–R2, N1, X1–X2, S1–S2) + `tests/unit/shopify-conn-1d-b-v8-isolation.live.test.ts` + unit S3/T1 · `0f3e1d2` | `auth.uid()` is a disposable claim stub (`request.jwt.claim.sub`), not a real JWT; hosted JWT → PostgREST → vault denial **NOT VERIFIED** |
| **V9** | Cross-org FK insert / ciphertext transplant DENY | **Offline PASS** | `tests/sql/shopify-conn-1a-credential-vault-schema-adversarial.sql` · `3d1f6ad`; α/β cross-org and wrong-provider DENY | — |
| **V10** | Shop bound to org A → bind into org B DENY | **Offline PASS** (schema level) | 1a partial unique indexes on active ownership (`unique_violation` cases in 1a adversarial SQL) · `20261121120000`; 1d-C D5/D10–D12 ownership released only on `completed` · `5c1c76b` | No bind RPC/writer exists (CONN-2). End-to-end bind and cross-org reclaim after release **DEFERRED to CONN-2 / D13** |
| **V11** | `integrations.configuration` never stores access/refresh tokens | **PARTIAL** | `tests/unit/shopify-conn-1d-a-secret-ingestion-boundaries.test.ts` (real CSV writer boundaries) · `636725c` | Application-layer guard only; see §3 |
| **V12** | Redaction covers token fields, Bearer and Shopify-like opaque tokens | **Offline PASS** (with limitations) | `tests/unit/application-observability-redaction.test.ts`; `lib/observability/redact.ts` · `636725c` | Not universal redaction; see §4 |
| **V13** | Helper errors/logs/API envelopes never include plaintext or full ciphertext | **Offline PASS** (unit) | 1b `CredentialCryptoError` codes only · `00557c7`; α/β/1d-C repositories return allowlisted persistence codes; sealed RPC args asserted | No HTTP route or API envelope exists; API-envelope half **NOT TESTED** |
| **V14** | Live cert flags `false`; no Shopify network I/O | **Offline PASS** | `SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED` and `SHOPIFY_RO3_LIVE_NESTED_COMPLETENESS_CERTIFIED` = `false as const` in `tests/fixtures/shopify/ro{1,3}-v1/payloads.ts` (last changed `4f6ef0c`); CONN architecture tests forbid Shopify/OAuth imports | — |
| **V15** | Rollback/drop additive objects leaves M2.6/M2.7 intact | **Offline PASS** (asymmetric by design) | `tests/sql/shopify-conn-1a-v15-rollback-additive.sql`, `…-1c-alpha-v15-…`, `…-1c-beta-v15-…`, `…-1d-c-v15-rollback-additive.sql`; `tests/sql/shopify-conn-1d-b-v15-bootstrap-rollback.sql` | 1d-C rollback drops only the disconnect RPC and **keeps** the α terminal fence (owner decision; no credential resurrection). α isolation suite is α-only and not claimed on the combined schema |

**Tally:** 13 offline PASS (V1–V7, V9, V10, V12–V15) · 2 PARTIAL (V8, V11).

---

## 3. V11 bypass and containment limitations

Guarded writers (`636725c`), each guarded **before** the DB call:

| Writer | Boundary | Guard |
|---|---|---|
| `lib/inventory-import/ensure-integration.ts` | `integrations.configuration` | `assertNonSecretIngestionPayload` before insert |
| `lib/providers/csv/location-binding.ts` | `provider_bindings.source_metadata` | `guardOptionalNonSecretJson` in RPC args |
| `lib/providers/csv/supabase-persistence.ts` | binding `source_metadata` | assert before use as `p_source_metadata` |
| `lib/providers/csv/sync-run-persistence.ts` | `sync_runs.error_summary` / `reconciliation_metadata` | guards while building begin/complete/fail RPC args |

Rejected: forbidden secret keys (normalized camelCase/kebab → snake_case, nested to depth 8), `shp(at|ca|pa|ss|rt)_…` values, `Bearer …` values, cycles, and bigint/function/symbol. Errors carry the boundary name only and never echo the payload.

**Known bypasses / limitations (not fixed):**

1. **No DB-level enforcement.** No CHECK or trigger bans secret keys in JSON columns; `service_role`, raw SQL or any future writer that skips the guard can store secrets (stated in the `secret-ingestion.ts` header).
2. **Non-plain objects.** `Map`, `Date` and similar objects expose no own entries and pass the walker (2026-11-22 runtime smoke).
3. **Stringified JSON.** A value such as `'{"access_token":"x"}'` without a Shopify/Bearer shape passes.
4. **Encoded payloads.** Base64- or URL-encoded secrets pass.
5. **Non-Shopify opaque tokens.** Secrets without Shopify-prefix or Bearer shape (including future WooCommerce/Amazon/Noon credential forms) are out of scope.
6. **Coverage is writer-scoped.** Only the four CSV-path writers above are guarded; Shopify connector writers do not exist yet.

---

## 4. V12 redaction limitations

`redactObservabilityValue` (`lib/observability/redact.ts`, used by `lib/observability/logger.ts`) redacts sensitive key names (including vault envelope and lease fields), `Bearer …`, JWT-shaped `eyJ…` values and `shp(at|ca|pa|ss|rt)_…` tokens. It preserves `token_kind`/`key_version`, ids, `shop_domain` and hex fingerprints.

It does **not** provide universal redaction:

1. A secret key inside a **stringified JSON** value under a non-sensitive key is not redacted.
2. Hex/Base64 ciphertext under a non-sensitive key is not redacted (deliberate, to avoid wiping business identifiers).
3. Only **Shopify** opaque prefixes are recognised; other providers' token shapes are not.
4. Coverage applies only to values routed through the observability logger/redactor; other output paths are not covered.
5. Depth > 6 becomes `[TRUNCATED]`; arrays are capped at 50 items and objects at 100 keys (dropped, not leaked).

---

## 5. Lease, terminal-fence, concurrency and rollback evidence

| Slice | Evidence type | Result |
|---|---|---|
| α (`a918217`) | Sequential SQL | Create never overwrites; CAS under unexpired lease → `conflict`; clear under unexpired lease → `fenced`; decrypt failure never clears |
| β (`173a357`) | Sequential B1–B14; two-session C1–C5c | Single unexpired lease; loser receives no secrets; stale rotate/release `fenced`; expired takeover; terminal-status-first fences rotate (C5a); rotate-first then terminal applies (C5b); `degraded` not over-fenced (C5c); deadlocks 0; 3 stable runs |
| β B15 (unit) | Repository | Decrypt failure after acquire calls release, never clear |
| 1d-C (`5c1c76b`) | Sequential D1–D14; two-session R1–R6 | α create/CAS `fenced` on `disconnected`/`revoked`; disconnect under held lease → `lease_held` (terminal committed, vault retained, ownership not released); retry after expiry → `completed` + ownership release; parallel disconnect → one `completed`, one `conflict`; lock order integrations → credentials → external accounts; no force-clear, advisory lock or generation bypass |
| Rollback | V15 scripts | Each slice drops only its additive objects; 1d-C rollback keeps the α fence and flags an unsafe α downgrade |

**Residual operational risks:** nothing yet performs the "retry after `lease_held` until `completed`" step (workers/cron OFF); a lease can be orphaned for up to its TTL (≤ 300 s); `integrations FOR UPDATE` blocks FK-child inserts for the RPC's duration; hosted owner of the SECURITY DEFINER functions is not verified.

---

## 6. Untested subclaims

| Subclaim | Related ID | State |
|---|---|---|
| KEK re-wrap / rotation job over existing rows | V3 | NOT TESTED (not authorized) |
| Real-clock lease expiry | V5 | NOT TESTED (simulated) |
| Hosted JWT → PostgREST → vault denial | V8 | NOT VERIFIED |
| End-to-end shop bind and cross-org reclaim after release | V10 | DEFERRED to CONN-2 / D13 |
| DB-level JSON secret ban; Map/Date/stringified/encoded inputs | V11 | NOT IMPLEMENTED |
| Non-Shopify token shapes; stringified JSON in values | V12 | NOT COVERED |
| HTTP/API error envelopes | V13 | NOT TESTED (no API exists) |
| Fresh re-execution of all suites at `b3ac033` | All | NOT PERFORMED for CONN-1d-D |

Pre-existing and unrelated: `tests/unit/merchant-sales-import-architecture.test.ts` fails identically on clean HEAD (the inventory page does not contain `inventory/sales-import`). No "full suite green" claim is made.

---

## 7. Vault contract §11 exit status

`docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md` §11: *"CONN-1 implementation exit requires V1–V15 PASS on disposable evidence."*

- §11 is **unchanged** by this report.
- V11 is **PARTIAL** on disposable evidence, so **CONN-1 exit is UNMET**.
- V8 is PASS on disposable evidence but recorded PARTIAL overall because hosted JWT is not verified.
- CONN-1 is **not** CLOSED and **not** CERTIFIED.

---

## 8. Hosted / production blockers

| Gate | State |
|---|---|
| Production `IntegrationOwnershipLookup` | Interface only (`lib/integration-credentials/repository.ts`); no implementation in `lib/`, `app/` or `workers/` |
| `CREDENTIAL_BINDING_AUTHORIZATION_STATUS` | `"NOT_YET_VERIFIED"` |
| Hosted apply of `20261121120000`, `20261122120000`, `20261122130000`, `20261122140000` | NOT AUTHORIZED / not applied |
| V8 hosted JWT/PostgREST · PE1.b.6b | NOT VERIFIED / BLOCKED |
| D13 revoke retention · D14 KEK custody (`createKekResolverFromEnv` not boot-wired) | DEFERRED (CONN-MP-0) |
| OAuth · Shopify HTTP · webhooks · SyncRun | BLOCKED |
| Workers · cron · E.4 canary · M6 production forecast · M7 create/purchasing | BLOCKED / unchanged |
| Paying launch | NO-GO |

---

## 9. Proposed next gate: CONN-1d-E (read-only preflight — NOT authorized)

**CONN-1d-E — V11 hardening preflight.** STRICT READ-ONLY; proposal only. Implementation would need a separate owner authorization.

Questions it would answer:

1. Feasibility and risk of DB-level enforcement (CHECK constraint or trigger on `integrations.configuration`, `provider_bindings.source_metadata`, `sync_runs.error_summary` / `reconciliation_metadata`) and its interaction with existing rows and hosted grants.
2. Rejecting non-plain objects (`Map`, `Set`, `Date`, class instances) at the application guard.
3. Detecting stringified JSON and common encodings without false positives on business identifiers.
4. Provider-neutral token-shape policy, coordinated with CONN-MP-CRED (no `token_kind` or provider expansion).
5. Matching V12 redaction gaps (stringified JSON values, non-Shopify shapes).
6. Whether V11 must reach PASS before any hosted vault apply.

CONN-1d-E does not unlock hosted apply, binding, KEK, OAuth, SyncRun or workers.

---

## 10. Verdict

### **PARTIAL**

| Layer | Verdict |
|---|---|
| Offline V1–V15 evidence review | **13 PASS · 2 PARTIAL (V8, V11)** |
| CONN-1 exit (contract §11) | **UNMET** (V11 PARTIAL) |
| Hosted / production / runtime | **BLOCKED** |
| Binding | **`NOT_YET_VERIFIED`** |

UX-INV-1d, AI-INV-2–6, AI-MKT-0–4 and the multi-provider roadmap are unchanged.

**STOP for owner review.** No staging, commit or push performed.
