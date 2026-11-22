# SHOPIFY_CONN_1A_SCHEMA_IMPLEMENTATION_REPORT

**Status:** PASS (schema slice + final security hardening) — **STOP for owner review**
**As-of:** 2026-11-22
**Baseline:** `main` @ `abb407d` (`abb407df34b5d0ae251b33ca3fdf6b161258c1de`)
**Mode:** Narrow local review/fix only. No Git ops. No hosted DB. No CONN-1b crypto.

---

## Security hardening — before / after

### Q1. Encrypted-envelope representation (nonce + auth tag)

| | Before | After |
|---|---|---|
| Finding | Single shared `nonce bytea` for access, refresh, and DEK wrap — ambiguous under AES-256-GCM (“unique per encryption; never reuse with same key”). Auth tags not represented. | Per-operation envelope columns: `access_{ciphertext,nonce,auth_tag}`, `refresh_{ciphertext,nonce,auth_tag}`, `dek_wrapped` + `dek_wrap_{nonce,auth_tag}` |
| Schema guarantee | Length `> 0` on one nonce only | Nonce length **= 12**, auth tag length **= 16** per seal; offline pair requires full refresh envelope; refresh fields all-null or all-complete |
| Crypto code | Not implemented (still CONN-1b) | Not implemented; migration comments freeze CONN-1b duty: independent random nonce per seal including DEK wrap |

### Q2. Trigger function EXECUTE defaults

| | Before | After |
|---|---|---|
| Finding | `CREATE FUNCTION` left ambient **EXECUTE for PUBLIC** on both identity-guard functions | `REVOKE ALL … FROM public, anon, authenticated, service_role` on both functions |
| Evidence | (pre-hardening) PUBLIC execute granted by default | `has_function_privilege` → PUBLIC/anon/authenticated/service_role = **false**; owner `postgres` = **true**; identity UPDATE trigger still fires |

### Q3. `active` requires `verified_at`

| | Before | After |
|---|---|---|
| Finding | `ownership_status='active'` allowed with `verified_at NULL` — unverified INSERT could become an authoritative uniqueness claim | CHECK `integration_external_accounts_active_requires_verified`: active ⇒ `verified_at IS NOT NULL` |
| Uniqueness | Partial unique on `ownership_status='active'` | **Unchanged** — still on all active rows (not narrowed by `verified_at`); uniqueness not weakened |
| Contract basis | §4 “verified external account ownership” / “matching verified identity” | Treated as resolved by contract wording; not an invented authorization model |

**No STOP:** contract language is sufficient for requiring verification before active authority. Production revoke-retention policy remains the only §4 unresolved choice (Phase A release default retained).

---

## 1. Baseline and changed-file inventory

| Item | Value |
|---|---|
| HEAD | `abb407d…` on `main` |
| Staging | empty (untouched) |
| 55322 | untouched — ledger 52; no vault tables |

**Paths changed in this hardening pass:**

| Path |
|---|
| `supabase/migrations/20261121120000_shopify_conn_1a_integration_credential_vault.sql` |
| `tests/sql/shopify-conn-1a-credential-vault-schema-adversarial.sql` |
| `tests/unit/shopify-conn-1a-credential-vault-schema.test.ts` |
| `tests/unit/shopify-conn-1a-credential-vault.live.test.ts` |
| `docs/SHOPIFY_CONN_1A_SCHEMA_IMPLEMENTATION_REPORT.md` |

Unrelated dirty tree paths preserved (BACKGROUND_JOBS, SERVICE_ROLE_BOUNDARY, DOCX, archives, snippets, etc.).

---

## 2. Exact tables / FKs / constraints / grants (post-hardening)

### A. `public.integration_credentials`

- FK `(organization_id, integration_id, provider) → integrations(...)` ON DELETE RESTRICT
- Unique `(organization_id, integration_id)`
- Envelope columns (no shared `nonce`):
  - access: `access_ciphertext`, `access_nonce` (12), `access_auth_tag` (16)
  - refresh: `refresh_ciphertext`, `refresh_nonce`, `refresh_auth_tag` (complete or all null; required complete for `offline_expiring`)
  - DEK wrap: `dek_wrapped`, `dek_wrap_nonce` (12), `dek_wrap_auth_tag` (16)
- Identity immutability trigger + `set_updated_at`
- RLS on; zero policies; `REVOKE ALL` table grants from public/anon/authenticated/service_role
- Function EXECUTE revoked on `prevent_integration_credential_identity_reassignment()`

### B. `public.integration_external_accounts`

- Same composite FK pattern
- Unique `(organization_id, integration_id)`
- Partial unique active account/handle indexes (**predicate = `ownership_status = 'active'` only**)
- `active` requires `verified_at`; revoke/disconnect require `revoked_at` and release uniqueness
- Identity immutability trigger; RLS; table + function privilege revocation as above

---

## 3. Effective privilege evidence (disposable)

Host: Homebrew PG 17.11 `127.0.0.1:55427` / `conn1a_isolated_verify`
Datadir: StoreAgent restore-scratch (not Supabase `/var/lib/postgresql/data`)

**Tables:** anon/authenticated/service_role/public → SELECT/INSERT/UPDATE/DELETE all **false**

**Functions:**

| Role | credential identity fn EXECUTE | external-account identity fn EXECUTE |
|---|---|---|
| public | false | false |
| anon | false | false |
| authenticated | false | false |
| service_role | false | false |
| postgres (owner) | true | true |

---

## 4. Focused test results

```text
npx vitest run tests/unit/shopify-conn-1a-credential-vault-schema.test.ts
  → 7/7 PASS

RUN_CONN1A_ISOLATED_LIVE=1 \
CONN1A_PGHOST=127.0.0.1 CONN1A_PGPORT=55427 \
CONN1A_PGDATABASE=conn1a_isolated_verify CONN1A_PGUSER=postgres \
npx vitest run tests/unit/shopify-conn-1a-credential-vault.live.test.ts
  → 6/6 PASS

git diff --check → clean
55322 → ledger 52; integration_credentials absent
```

Added coverage: per-seal envelope shape, short-nonce DENY, active-without-`verified_at` DENY, function EXECUTE matrix, trigger still denies identity reassignment for owner.

---

## 5. V6 / V7 / V9 / V10 / V15

| ID | Status |
|---|---|
| V6 | **PASS** |
| V7 | **PASS** (table DML/SELECT denied; trigger EXECUTE denied; no vault RPCs yet) |
| V9 | **PASS** |
| V10 | **PASS** |
| V15 | **PASS** |
| V1–V5, V8, V11–V14 | **NOT TESTED** (crypto/runtime) |

---

## 6. Remaining risks

- CONN-1b must still generate unique random nonces per seal and verify tags; schema encodes shape only.
- No vault SECURITY DEFINER RPCs yet — intentional; owner DML remains the only write path for tests.
- Production ownership retention after revoke/disconnect still owner-gated (Phase A release default).
- Migration not applied to local Supabase `55322` or hosted.

---

## 7. Proposed staging manifest (do not stage now)

```text
supabase/migrations/20261121120000_shopify_conn_1a_integration_credential_vault.sql
tests/sql/shopify-conn-1a-disposable-bootstrap.sql
tests/sql/shopify-conn-1a-credential-vault-schema-adversarial.sql
tests/sql/shopify-conn-1a-v15-rollback-additive.sql
tests/unit/shopify-conn-1a-credential-vault-schema.test.ts
tests/unit/shopify-conn-1a-credential-vault.live.test.ts
docs/SHOPIFY_CONN_1A_SCHEMA_IMPLEMENTATION_REPORT.md
```

---

## 8. Verdict

**PASS**

**STOP for owner review.** No commit/push, hosted migrate, OAuth, Shopify APIs, crypto implementation, workers, JWT, or M6/M7 activation.
