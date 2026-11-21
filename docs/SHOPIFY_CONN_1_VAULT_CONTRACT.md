# SHOPIFY-CONN-1 — Credential Vault Contract

**Status:** DESIGN FREEZE (CONN-1B) — awaiting owner acceptance before any implementation
**Baseline:** `main` @ `965e6d7` (CONN-0A CLOSED/PUSHED)
**As-of:** 2026-11-21
**Mode:** Docs-only design freeze. No migrations, encrypt/decrypt code, OAuth, SyncRun, workers, JWT, hosted DB, or live Shopify in this milestone.

**Authority chain**
- Parent: `docs/SHOPIFY_CONN_0_SECURITY_ARCHITECTURE.md` (CONN-0A ACCEPTED @ `965e6d7`)
- Tenancy: `docs/CROSS_ORG_THREAT_MODEL.md`
- Service-role: `docs/SERVICE_ROLE_BOUNDARY.md`
- Provider law: `docs/PROVIDER_ADAPTERS.md`, `docs/M2_CANONICAL_PERSISTENCE.md`
- Identity schema: `supabase/migrations/20261011143000_m2_6_integration_identity.sql`, `…/20261011153000_m2_7_rls_tenant_enforcement.sql`
- Preflight evidence: CONN-1A vault preflight (chat audit; not a repo file)

**Legend**
- **Approved design** — frozen by this contract once owner-accepted; implementation must match.
- **Unresolved production choice** — owner must decide before hosted/production use; Phase A local design may proceed with the stated default.
- **Not implemented** — no vault table, AEAD module, env keys, or tests exist in the repo at baseline.

**Non-claims:** This contract does not authorize implementation, hosted migration, OAuth, live Shopify calls, SyncRun completion, workers/cron, PE1.b.6b JWT, M6 production forecast, M7 create/purchasing, billing, or live AI/search. Shopify Admin API remains pinned to **`2026-10`**. Live nested-completeness certification remains **FALSE**.

---

## 1. Separation of concerns

| Layer | State at CONN-1B |
|---|---|
| CONN-0A security architecture | **Approved** (Git @ `965e6d7`) |
| This vault contract | **Design freeze** — owner acceptance required |
| Vault schema / crypto / RPCs / tests | **Not implemented** |
| Production KEK secret-manager product | **Unresolved production choice** (gated) |
| OAuth / refresh against Shopify / webhooks / SyncRun | **Out of scope** (CONN-2+) |

---

## 2. Storage decision (approved design)

### Decision

Use a **provider-neutral dedicated credential table** in Postgres with **application-layer AES-256-GCM**, not:

- `integrations.configuration` (forbidden — M2.6 / CONN-0A / PROVIDER_ADAPTERS)
- `provider_bindings.source_metadata`
- Supabase Vault / `supabase_vault` as the CONN-1 primary store
- External secret manager as the primary token store (optional later for **KEK only**)

### Rationale

1. Atomic access+refresh rotation with integration status in one DB transaction.
2. Composite tenant FKs match M2.6 `(organization_id, integration_id)`.
3. Offline adversarial RLS/grant testing matches existing StoreAgent patterns.
4. No new hosted extension dependency for CONN-1.

### Rejected for CONN-1 primary store

| Option | Why rejected now |
|---|---|
| Ciphertext in `integrations.configuration` | Explicitly forbidden |
| Plaintext tokens in DB | Unacceptable blast radius |
| Supabase Vault as sole store | Not in product migrations; weak composite FK + atomic status story |
| External SM as sole token store | Cross-system rotation races; harder offline adversarial proof |

---

## 3. Table design (approved design)

### Name

`public.integration_credentials`

Provider-neutral. Shopify is the first consumer; Woo/Amazon/etc. may reuse later.

### Row cardinality

Exactly **one** current credential set per integration:

```text
UNIQUE (organization_id, integration_id)
```

Expiring offline Shopify tokens retire prior offline tokens for app+shop; StoreAgent stores only the current pair.

### Columns (logical — exact SQL types fixed at implementation)

| Column | Purpose |
|---|---|
| `id` | UUID PK |
| `organization_id` | Tenant scope (NOT NULL) |
| `integration_id` | Integration scope (NOT NULL) |
| `provider` | Must match integration provider (`shopify`, …) |
| `token_kind` | e.g. `offline_expiring` |
| `access_ciphertext` | AEAD sealed access token |
| `refresh_ciphertext` | AEAD sealed refresh token (required for `offline_expiring`) |
| `dek_wrapped` | Envelope-wrapped data encryption key (or sealed with KEK version) |
| `key_version` | Integer KEK/envelope version used |
| `nonce` / IV material | Unique per encryption; never reuse with same key |
| `access_expires_at` | From provider `expires_in` |
| `refresh_expires_at` | From provider `refresh_token_expires_in` |
| `scope` | Granted scope string (non-secret metadata) |
| `refresh_lock_expires_at` | Optional lease for single-flight refresh |
| `last_rotated_at` | Audit |
| `created_at` / `updated_at` | Audit |

Plaintext tokens **never** appear as columns.

### Composite tenant FK (approved)

```text
FOREIGN KEY (organization_id, integration_id, provider)
  REFERENCES public.integrations (organization_id, id, provider)
  ON DELETE RESTRICT
```

Reuse M2.6 uniqueness on `integrations (organization_id, id, provider)`.

Identity reassignment of `organization_id` / `integration_id` / `provider` on a credential row is forbidden (trigger or immutable columns), mirroring `prevent_integration_identity_reassignment`.

### Non-secret Shopify metadata (not in vault table)

`shop_domain`, granted scopes list, API version pin may live in `integrations.configuration` as non-secret objects. Tokens must not.

---

## 4. Global verified Shopify shop identity ownership (approved design)

### Problem

CONN-0A / Threat 7 / Threat 20: a shop already bound to org A must not silently install into org B; reconnect must not match “first Shopify integration.”

### Durable ownership rule (approved)

Introduce a **provider-neutral verified external account ownership** uniqueness for Shopify installs:

| Field | Rule |
|---|---|
| `provider` | `'shopify'` |
| `external_shop_id` | Opaque Shopify shop id when available (authoritative) |
| `shop_domain` | Normalized `^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$` (lowercase) |

**Approved uniqueness**

1. At most one **active/non-revoked** StoreAgent integration may own a given `(provider, external_shop_id)` globally when `external_shop_id` is known.
2. At most one **active/non-revoked** integration may own a given `(provider, shop_domain)` globally (normalized domain).
3. Conflict with another `organization_id` → **DENY** (no silent reassignment).
4. Same-org reconnect with matching verified identity → rotate vault credentials; **preserve** `integrations.id`.
5. Provider external IDs never establish tenant by themselves — ownership rows always include `organization_id` + `integration_id` from trusted StoreAgent session / prior trusted integration.

### Placement (approved design; exact DDL at implementation)

Prefer a dedicated table e.g. `public.integration_external_accounts` (or equivalent) with:

- `organization_id`, `integration_id`, `provider`
- `external_account_id` (Shopify shop id; nullable until known)
- `external_handle` (normalized shop domain)
- Partial unique indexes enforcing global ownership for non-revoked rows
- FK to `integrations (organization_id, id, provider)`

Do **not** encode ownership solely as unconstrained JSON inside `configuration`.

### Unresolved production choice

Whether revoked/disconnected rows retain a soft unique reservation vs allow another org to claim after uninstall + retention window. **Default for Phase A (dev stores):** after vault clear + integration `revoked`/`disconnected`, uniqueness may release so a reinstall into the **same** or a **different** org can proceed only through explicit OAuth (CONN-2) with conflict checks at bind time. Final production retention policy is owner-gated before public multi-merchant pilots.

---

## 5. Cryptography (approved design)

### Algorithm

- **AES-256-GCM** (AEAD)
- Node `crypto` preferred (already used for `randomBytes` / `timingSafeEqual` elsewhere)
- No custom MAC-then-encrypt

### Nonce / IV

- Cryptographically random
- **Unique per encryption** under a given key
- Never reuse `(key, nonce)` pairs
- Store nonce alongside ciphertext

### Authenticated Additional Data (AAD)

AAD MUST bind at least:

```text
organization_id || integration_id || provider || token_kind || key_version
```

Decrypt with mismatched AAD → fail closed (no plaintext).

### Envelope DEK / KEK

| Layer | Role |
|---|---|
| DEK | Per-row (or per-rotation) data key encrypting token ciphertexts |
| KEK | Server-held key-encryption key wrapping the DEK |
| `key_version` | Selects which KEK material was used |

Plaintext DEK exists only briefly in server memory during encrypt/decrypt; never logged; never returned to clients.

### Key versioning and rotation

- New writes use current `key_version`
- Reads try row `key_version`; unknown/missing version → fail closed
- KEK rotation: re-wrap DEKs (or re-encrypt) under new version in a controlled job — **not** authorized in CONN-1 unless separately scoped
- Losing KEK material → ciphertext unrecoverable → require re-OAuth (expected failure mode)

### Failure / recovery rules

| Failure | Required behavior |
|---|---|
| Decrypt auth failure / bad AAD | DENY; do not return partial plaintext; mark health degraded if unexpected |
| Missing KEK for `key_version` | DENY; operator alert; no silent fallback to another version |
| Refresh hard-fail (`invalid_request` / hard 401) | Clear vault row; set integration `revoked` or `disconnected`; require re-OAuth |
| Backup restore without KEK | Credentials useless; merchants re-authorize |
| Backup restore with KEK | Ciphertext usable; still require tenant-scoped decrypt path |

---

## 6. Key custody (approved design + gated production choice)

### Approved for all environments

- KEK material is **server-only**
- Never `NEXT_PUBLIC_*`
- Never browser bundles
- Never AI tools / model context
- Never written into DB tables returned to clients
- Never committed to git
- App Shopify **client secret** remains server env only (CONN-0A); not a vault-row field

### Phase A / local default (approved design)

- KEK from server environment variable(s), e.g. conceptually `INTEGRATION_CREDENTIALS_KEK` / versioned `INTEGRATION_CREDENTIALS_KEK_V1` (exact names fixed at implementation)
- Extend `readServerEnvironment` (or a dedicated server-only reader) — **implementation later**
- Local/disposable tests use ephemeral test KEKs, never production material

### Production secret-manager decision (UNRESOLVED — GATED)

| Choice | Status |
|---|---|
| Keep env-injected KEK on the app host | Allowed only with owner sign-off for a named environment |
| External secret manager holds KEK only (AWS SM / GCP SM / etc.) | **Unresolved production choice** — requires separate owner authorization |
| External SM stores access/refresh tokens | **Rejected** as CONN-1 primary store (see §2) |

**STOP:** Do not bind a production secret-manager product in CONN-1 implementation without owner approval.

---

## 7. Access control, grants, and service-role (approved design)

### Browser / PostgREST clients

- RLS **enabled** on `integration_credentials` (and ownership table)
- **No** SELECT/INSERT/UPDATE/DELETE policies for `anon` or `authenticated`
- Explicit `REVOKE ALL` from `public`, `anon`, `authenticated`
- Merchants never receive ciphertext, nonces, wrapped DEKs, or plaintext

Contrast: M2.7 allows authenticated **SELECT** on `integrations` (non-secret). Vault is **stricter**.

### Service-role posture (approved)

Follow `docs/SERVICE_ROLE_BOUNDARY.md` and `assertServiceOperationScope` (`lib/tenancy/service-role-policy.ts`):

1. Every vault read/rotate/clear requires trusted `organizationId` (+ integration id) from:
   - resolved TenantContext, or
   - trusted Integration record, or
   - (later) verified webhook → trusted integration — CONN-3
2. Never trust client-supplied org id alone
3. Never `SELECT *` globally then filter in memory (Threat 9)
4. Prefer **SECURITY DEFINER RPCs** with empty `search_path`, `EXECUTE` granted only to `service_role`, after explicit `REVOKE ALL … FROM public, anon, authenticated, service_role` then least-privilege re-grant — matching hosted ambient-grant lessons (`docs/HOSTED_38to52_MIGRATION_RUNBOOK.md`)

### Narrowly reviewed RPC surface (approved design intent)

| RPC / server API (conceptual) | Behavior |
|---|---|
| Upsert/replace credential pair | Requires org+integration; AEAD seal; atomic write |
| Load-for-use (decrypt) | Server-only; returns plaintext only to trusted in-process caller; never HTTP response |
| Clear credentials | Deletes/nulls ciphertext; used on revoke/uninstall/hard auth fail |
| Refresh lock acquire/release | Single-flight lease per integration |

Exact RPC names fixed at implementation. Each must document trusted-scope precondition.

### Unresolved production choice

Whether service_role retains any direct table DML vs **RPC-only** mutate. **Default approved for CONN-1 design:** RPC-only mutate + `SELECT` only if required for RPC body; otherwise revoke direct DML from service_role on the table (same pattern as metric/action fences). Final grant matrix confirmed in migration review.

---

## 8. Token lifecycle (approved design)

### Token kind

Shopify SyncRun uses **expiring offline** tokens only (`expiring=1`). Online staff tokens are out of scope for vault SyncRun use (CONN-0A).

### Atomic pair rotation

On successful refresh or OAuth exchange:

1. Encrypt new access + new refresh under current key_version
2. In **one transaction**, replace both ciphertexts + expiry fields + `last_rotated_at`
3. Never commit access without refresh for `offline_expiring`
4. Prior plaintext discarded; prior ciphertext overwritten

### Concurrency / single-flight

- Per-integration refresh lock (row lease and/or `pg_advisory_xact_lock` keyed by integration)
- Two concurrent SyncRuns must not dual-refresh into inconsistent storage
- Shopify guidance: do not acquire and refresh concurrently for the same shop; presented refresh stays usable until replacement is used (retry-safe on transient 5xx) — CONN-0A §4

### Expiry

- Honor `access_expires_at` / `refresh_expires_at`
- Access expired → refresh path (CONN-2+/CONN-5), not silent reuse
- Refresh expired → clear vault; integration unhealthy; re-OAuth required

### Revocation and reinstall

| Trigger | Vault action | Integration status |
|---|---|---|
| Owner disconnect | Clear credentials | `disconnected` or `revoked` |
| `app/uninstalled` (CONN-3) | Clear credentials | `revoked` or `disconnected` |
| Hard auth / refresh invalid | Clear credentials | `revoked` or `disconnected` / `error` per CONN-0A |
| Same-org reinstall matching identity | Rotate vault; keep `integrations.id` | return to `active` when scopes OK |
| Cross-org claim | DENY | no write |

Webhook and OAuth handlers are **not** implemented in CONN-1; vault APIs must support clear/rotate for those future callers.

---

## 9. Observability and leak prevention (approved design)

### Rules

1. Use `redactObservabilityValue` (`lib/observability/redact.ts`) on all vault-related logs/errors/analytics.
2. Never log plaintext tokens, OAuth codes, client secrets, DEKs, KEKs, full ciphertexts, or raw nonces+ciphertext pairs.
3. Never place tokens in `integrations.configuration`, ProviderBinding metadata, SyncRun `error_summary` / `reconciliation_metadata`, caches, or HTTP responses.
4. Safe diagnostics may include: organization_id, integration_id, provider, token_kind, key_version, expiry timestamps, boolean health flags, error **classes** (e.g. `decrypt_failed`, `refresh_required`).

### Redaction gap to close at implementation (approved requirement)

Extend redaction tests so Shopify-like opaque token strings (e.g. `shpat_…` fixtures) and vault field names (`access_ciphertext`, `refresh_token`, `dek_wrapped`) cannot appear unredacted in observability fixtures. Exact pattern list fixed in CONN-1 tests — design requires coverage, not a specific regex in this doc.

---

## 10. Migration plan (approved design)

### Additive only

- New tables / indexes / triggers / RPCs only
- No destructive change to `integrations`, `provider_bindings`, `sync_runs`
- No rewrite of M2.6/M2.7 policies on existing tables except **no** weakening

### Local / disposable first

1. Author migration under `supabase/migrations/` only after owner authorizes CONN-1 implementation
2. Apply on disposable local Postgres
3. Run adversarial matrix V1–V15
4. Neg-test rollback / drop of additive objects leaves M2 intact

### Hosted prerequisites (blocked until separate owner gate)

- Disposable PASS evidence
- Explicit grant plan for ambient `service_role` defaults (`REVOKE ALL` then least privilege)
- Owner authorization for hosted apply
- Hosted schema ≠ workers ON ≠ JWT unlock ≠ OAuth live

### Rollback

Drop additive vault objects; merchants with no live Shopify yet are unaffected. If ciphertext existed, rollback without KEK retention implies re-OAuth after re-deploy.

---

## 11. Adversarial acceptance matrix (from CONN-1A)

Offline / disposable only. No Shopify network. No hosted JWT.

| ID | Assertion |
|---|---|
| **V1** | Encrypt→decrypt round-trip; wrong key / wrong AAD fails closed |
| **V2** | Ciphertext for org A cannot decrypt under org B AAD |
| **V3** | `key_version` mismatch fails closed; rotation writes new version atomically |
| **V4** | Atomic replace: never persist access without refresh (and vice versa) for `offline_expiring` |
| **V5** | Concurrent rotate single-flight: one winner; loser retries or sees consistent pair |
| **V6** | `anon`/`authenticated`: no SELECT/INSERT/UPDATE/DELETE on vault table |
| **V7** | `service_role` direct DML denied if RPC-only model; helpers cannot load without org+integration scope |
| **V8** | Revoked membership / user client cannot read vault |
| **V9** | Cross-org FK insert DENY; ciphertext transplant DENY |
| **V10** | Shop bound to org A → bind into org B DENY |
| **V11** | `integrations.configuration` round-trip never stores access/refresh tokens |
| **V12** | Redaction covers token fields, Bearer, and Shopify-like opaque tokens in fixtures |
| **V13** | Vault helper errors/logs/API envelopes never include plaintext or full ciphertext dumps |
| **V14** | Live cert flags remain `false`; suite performs no Shopify network I/O |
| **V15** | Rollback/drop additive objects leaves M2.6/M2.7 intact |

CONN-1 implementation exit requires V1–V15 PASS on disposable evidence.

---

## 12. Frozen global exclusions

Unchanged from CONN-0A / roadmap:

- Shopify Admin GraphQL **`2026-10`** only; transport forbids mutations
- `SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED` / `SHOPIFY_RO3_LIVE_NESTED_COMPLETENESS_CERTIFIED` remain **FALSE**
- PE1.b.6b JWT execution **BLOCKED**
- Workers/cron activation **BLOCKED**
- M6 production forecast operation **BLOCKED**
- M7 create/purchasing **BLOCKED**
- Billing charges / live AI/search paid spend **BLOCKED**
- OAuth UI, live Shopify HTTP, SyncRun orchestration, webhooks — **not CONN-1**
- Unknown ≠ zero; M5 deterministic metrics remain authoritative

---

## 13. Mapping to future CONN milestones

| Milestone | Uses this vault |
|---|---|
| CONN-1 | Schema + encrypt/decrypt + grants + V1–V15 |
| CONN-2 | OAuth exchange → vault write; shop ownership bind |
| CONN-3 | Uninstall/privacy → vault clear |
| CONN-4+ | Live reads via decrypt; still no false SyncRun complete without gates |

---

## 14. Acceptance / STOP

Owner must **ACCEPT** or **AMEND** this document before any CONN-1 migration or encrypt/decrypt implementation.

**STOP.** Do not create vault migrations, AEAD modules, env keys, OAuth, live Shopify calls, workers, JWT, M6/M7 activation, App Store submission, or Git commit/push under this design freeze alone.

---

## 15. Checklist (post-acceptance implementation gate)

Before coding CONN-1:

- [ ] This contract owner-accepted
- [ ] Separate implementation authorization recorded
- [ ] Production KEK custody decision deferred or explicitly scoped
- [ ] Unrelated dirty tree paths left untouched
- [ ] Hosted apply not implied by local work
