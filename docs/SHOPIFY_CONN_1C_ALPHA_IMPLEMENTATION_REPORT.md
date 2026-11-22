# SHOPIFY_CONN_1C_ALPHA_IMPLEMENTATION_REPORT

**Status:** PARTIAL — OFFLINE FOUNDATION — **STOP for owner review**
**As-of:** 2026-11-22
**Baseline:** `main` @ `00557c7` (`00557c7cb721a85530064ba4cd7660d7b303baf6`)
**Mode:** Offline foundation only. No Git ops. No hosted DB. No CONN-1c-β. No full CONN-1c / CONN-1d claim.

| Gate | State |
|---|---|
| Offline persistence foundation (schema + crypto + RPC + repo) | **Accepted for offline close** under PARTIAL |
| Production authorization (`CREDENTIAL_BINDING_AUTHORIZATION_STATUS`) | **`NOT_YET_VERIFIED`** |
| Runtime credential operations (routes / workers / live resolver / admin client) | **BLOCKED** |

---

## 0. Offline acceptance gate (this review)

Read-only verification against working tree + prior disposable evidence. **SQL migration not edited in this gate.**

| Check | Result |
|---|---|
| 1. Ordinary repo ops require branded scope from TenantContext + ownership resolve | **PASS** — all create/replace/load/clear call `assertTrustedCredentialScope`; brand mint only via `resolveIntegrationOwnershipForTenant` → `buildTrustedCredentialScope` |
| 2. No production lookup / routes / workers / service client wiring | **PASS** — interface/port only; no `createSupabaseAdminClient`; no `app/` or workers imports |
| 3. Test-only lookup not imported into production runtime | **PASS** — `lookupWith` exists only in unit test file |
| 4. RPC / generation / bytea / active-lease fencing preserved | **PASS** — `rpc_failed` on error+throw; `parsePositiveSafeGeneration`; `parseCredentialBytea`; CAS/clear WHERE lease absent/expired |
| 5. SQL migration unchanged this gate; disposable evidence dated | **PASS** — migration body stable; disposable evidence dated **2026-11-22** (see §5) |
| 6. V1–V15 distinguishes prior schema/crypto vs current α tests | **PASS** — see §6 |

**Outstanding production gate (exact):** authorize and wire a trusted, org-scoped `IntegrationOwnershipLookup` against `public.integrations` (server-only, no browser path), then re-verify binding end-to-end. Until then runtime credential ops remain **BLOCKED**.

This does **not** complete CONN-1c (β lease RPCs) or CONN-1d.

---

## 0a. Final security hardening (prior narrow fix)

| Issue | Fix |
|---|---|
| Permissive / fabricated scope (pre-0b) | Superseded by §0b TenantContext + ownership resolve |
| Raw RPC `error.message` leak | `CredentialPersistenceError` allowlisted codes only |
| Permissive bytea decode | `parseCredentialBytea` strict hex / canonical Base64 |
| Ordinary ops vs unexpired lease | CAS → `conflict`; clear → `fenced` when lease unexpired |

---

## 0b. Final authorization hardening (prior narrow fix)

| Issue | Fix |
|---|---|
| Arbitrary integration claim object | Removed; require `TenantContext` + `resolveIntegrationOwnershipForTenant` + `buildTrustedCredentialScope` |
| End-to-end binding proof | **`NOT_YET_VERIFIED`** — no production DB lookup shipped |
| Thrown `client.rpc` exceptions | try/catch → `rpc_failed` |
| Unsafe generation | `parsePositiveSafeGeneration` / `Number.isSafeInteger` |

---

## 1. Exact eight-file inventory

| Path | Role |
|---|---|
| `supabase/migrations/20261122120000_shopify_conn_1c_alpha_credential_persistence.sql` | Additive fence columns + load/create-CAS/clear RPCs |
| `lib/integration-credentials/repository.ts` | Server-only trusted-scope persistence adapter |
| `tests/sql/shopify-conn-1c-alpha-credential-persistence-adversarial.sql` | Disposable grant/CAS/clear/lease adversarial matrix |
| `tests/sql/shopify-conn-1c-alpha-v15-rollback-additive.sql` | α-only rollback; CONN-1a + M2.6 intact |
| `tests/unit/shopify-conn-1c-alpha-credential-repository.test.ts` | Trust boundary + RPC/bytea/generation unit tests |
| `tests/unit/shopify-conn-1c-alpha-credential-persistence-architecture.test.ts` | Server-only / RPC-only / no lease RPC symbols |
| `tests/unit/shopify-conn-1c-alpha-credential-persistence.live.test.ts` | Isolated PG live harness |
| `docs/SHOPIFY_CONN_1C_ALPHA_IMPLEMENTATION_REPORT.md` | This report |

**Not modified for production activation:** CONN-1a/1b crypto barrel, `env.ts`, app routes, workers, OAuth, hosted apply. Unrelated dirty tree preserved.

---

## 2. Schema / RPC signatures and grants

### Additive columns on `public.integration_credentials`

| Column | Notes |
|---|---|
| `credential_generation bigint not null default 1` | CHECK `> 0` |
| `refresh_lock_token` / `refresh_lock_owner_id` / `refresh_lock_claimed_at` | Planned lease metadata only (no α lease RPCs) |

### RPCs (service_role EXECUTE only; table DML revoked from public/anon/authenticated/service_role)

| Function | Behavior |
|---|---|
| `load_integration_credential_envelope` | Sealed columns only |
| `replace_integration_credential_set` | NULL gen → insert-only; set gen → CAS; unexpired lease → `conflict` |
| `clear_integration_credentials` | Generation + lease fence; unexpired lease → `fenced`; no `integrations.status` mutate |

`SECURITY DEFINER`, `search_path=''`, fully qualified names, no dynamic SQL.

---

## 3. Trusted-scope enforcement (offline)

- Ordinary credential ops **cannot** accept a plain `{org, integration, provider}` object — brand required.
- Brand mint path: trusted `TenantContext` → org-scoped `IntegrationOwnershipLookup` → branded ownership → `buildTrustedCredentialScope`.
- Fabricated ownership/scope → `invalid_scope`; cross-org lookup row → `scope_mismatch`; missing → `integration_not_found`.
- **`CREDENTIAL_BINDING_AUTHORIZATION_STATUS = "NOT_YET_VERIFIED"`**.
- No production lookup implementation; crypto barrel does not re-export repository.

---

## 4. CAS / create / clear behavior

| Case | Outcome |
|---|---|
| Create (`expected_generation NULL`) | `inserted` or `conflict` (never overwrite) |
| CAS + matching gen + no/expired lease | `replaced` |
| CAS + matching gen + **unexpired lease** | `conflict` |
| Clear + matching gen + **unexpired lease** | `fenced` |
| Decrypt / unknown KEK | crypto error; **never** clear |

---

## 5. Disposable test evidence (dated)

**Date of disposable live run:** 2026-11-22 (CONN-1c-α hardening / lease-fence acceptance).
**Host:** Homebrew PG 17.11 `127.0.0.1:55427` / `conn1c_isolated_verify`
**Datadir:** StoreAgent restore-scratch (not Supabase `/var/lib/postgresql/data`)
**Not used:** `:55322`, `:54322`, hosted

This offline gate did **not** re-apply SQL (migration unchanged). Prior disposable PASS remains the dated SQL evidence.

```text
# Prior disposable suite (2026-11-22) — 19 tests incl. live SQL
RUN_CONN1C_ISOLATED_LIVE=1 … vitest … → 3 files / 19 tests PASS

# This offline gate (focused, non-destructive)
npx vitest run \
  tests/unit/shopify-conn-1c-alpha-credential-repository.test.ts \
  tests/unit/shopify-conn-1c-alpha-credential-persistence-architecture.test.ts
→ focused unit/architecture PASS

npm run typecheck → PASS
npm run lint → PASS (0 errors; 2 pre-existing unrelated warnings)
git diff --check (α report + repo/tests touched this gate) → PASS
```

---

## 6. V1–V15 status (evidence sources distinguished)

| ID | Status | Evidence source |
|---|---|---|
| **V1** | **PASS** | Prior CONN-1b crypto + current repo decrypt-fail-closed unit |
| **V2** | **PASS** | Prior CONN-1b AAD + prior disposable SQL cross-org DENY (2026-11-22) |
| **V3** | **PASS** (α portion) | Prior unit unknown key_version; CAS generation via disposable SQL |
| **V4** | **PASS** | Prior disposable SQL incomplete-refresh DENY + atomic pair |
| **V5** | **PARTIAL** | Prior disposable: α refuses unexpired-lease override; β acquire/rotate/release **not** claimed |
| **V6** | **PASS** | Prior disposable table grants (2026-11-22) |
| **V7** | **PASS** | Prior disposable RPC EXECUTE matrix (2026-11-22) |
| **V8** | **PARTIAL** | No authenticated vault path; membership revoke not runtime-tested |
| **V9** | **PASS** | Prior disposable cross-org / wrong-provider (2026-11-22) |
| **V10** | **NOT RETESTED** | Prior CONN-1a ownership uniqueness; α does not mutate ownership |
| **V11** | **NOT TESTED** | configuration token ban deferred |
| **V12** | **NOT TESTED** | redact.ts vault patterns deferred |
| **V13** | **PASS** | Current unit: sealed RPC args; allowlisted persistence errors |
| **V14** | **PASS** | Suites perform no Shopify network I/O |
| **V15** | **PASS** | Prior disposable α rollback (2026-11-22) |

**Do not claim CONN-1c-β concurrency acceptance or full CONN-1c / CONN-1d.**

---

## 7. Risks / blockers

| Item | State |
|---|---|
| Production ownership resolution | **BLOCKER** — outstanding gate in §0 |
| Runtime credential operations | **BLOCKED** |
| Hosted migration / OAuth / SyncRun / workers / JWT / M6/M7 | **BLOCKED** (unchanged roadmap) |
| TenantContext authenticity | Depends on existing session resolution (out of α) |
| Lease acquire/rotate/release | CONN-1c-β only |

---

## 8. Exact eight-file Git manifest

Do **not** stage/commit/push under this gate alone.

```text
supabase/migrations/20261122120000_shopify_conn_1c_alpha_credential_persistence.sql
lib/integration-credentials/repository.ts
tests/sql/shopify-conn-1c-alpha-credential-persistence-adversarial.sql
tests/sql/shopify-conn-1c-alpha-v15-rollback-additive.sql
tests/unit/shopify-conn-1c-alpha-credential-repository.test.ts
tests/unit/shopify-conn-1c-alpha-credential-persistence-architecture.test.ts
tests/unit/shopify-conn-1c-alpha-credential-persistence.live.test.ts
docs/SHOPIFY_CONN_1C_ALPHA_IMPLEMENTATION_REPORT.md
```

---

## 9. Verdict

**PARTIAL — OFFLINE FOUNDATION**

α may close as an **offline foundation**: sealed persistence RPCs, crypto reuse, CAS/lease fencing, and structural TenantContext+lookup boundary are in place for disposable/offline use.

**Production authorization remains `NOT_YET_VERIFIED`.**
**Runtime credential operations remain BLOCKED** until the outstanding ownership-lookup gate in §0 is closed.

**STOP for owner review.** Do not implement the production resolver, CONN-1c-β, OAuth, Shopify HTTP, SyncRun, hosted migration, workers, JWT, or M6/M7 under this gate. No staging/commit/push performed by this review.
