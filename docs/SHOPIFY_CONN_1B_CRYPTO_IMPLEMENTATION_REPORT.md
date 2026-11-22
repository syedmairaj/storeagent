# SHOPIFY_CONN_1B_CRYPTO_IMPLEMENTATION_REPORT

**Status:** PASS (incl. final crypto hardening) — **STOP for owner review**
**As-of:** 2026-11-22
**Baseline:** `main` @ `3d1f6ad` (`3d1f6adc0280d86f11eb4e2e52a23c529f08cd0b`)
**Mode:** Scoped local implementation only. No Git ops. No DB persistence. No hosted ops. No CONN-1c.

---

## 0. Final crypto hardening (narrow fix)

| Item | Change |
|---|---|
| `lib/integration-credentials/kek.ts` | Canonical standard Base64 only for 32-byte KEKs (alphabet + padding + exact round-trip); reject whitespace/URL-safe/unpadded; reject ambiguous env names (`INTEGRATION_CREDENTIALS_KEK`, `…_V01`, `…_V1_BACKUP`, etc.); invalid current-version strings → `malformed_input`; missing current → `missing_key_version`; wrong decoded length → `invalid_key_length`. Exported `parseCanonicalBase64Kek`. |
| `lib/integration-credentials/aead.ts` | Removed caller-controlled `nonce` from production `aeadSeal`; always `generateNonce()` internally; runtime `hasOwnProperty` reject if `nonce` present. 12-byte nonce / 16-byte tag / CONN-1a column shape unchanged. |
| `lib/integration-credentials/index.ts` | Re-export `parseCanonicalBase64Kek`. |
| Focused tests | Added negative coverage: malformed Base64, ambiguous/invalid version names, nonce API restriction. |
| Preserved | AAD encoding, DEK/KEK envelope, server-only boundaries, unrelated dirty tree, no migration/DB/OAuth. |

---

## 1. Baseline and exact changed paths

| Check | Result |
|---|---|
| Branch | `main` |
| HEAD | `3d1f6adc0280d86f11eb4e2e52a23c529f08cd0b` (= `3d1f6ad`, CONN-1a CLOSED) |
| Staging | **empty** (untouched) |
| Unrelated dirty tree | **preserved** (BACKGROUND_JOBS, SERVICE_ROLE_BOUNDARY, DOCX, archives, snippets, `.tmp/`, etc.) |

### Exact paths for CONN-1b (implementation + hardening)

| Path | Role |
|---|---|
| `lib/integration-credentials/index.ts` | Server-only public barrel |
| `lib/integration-credentials/types.ts` | Sizes, seal purposes, envelope types |
| `lib/integration-credentials/errors.ts` | Code-only `CredentialCryptoError` |
| `lib/integration-credentials/aad.ts` | Canonical versioned AAD encode/decode |
| `lib/integration-credentials/aead.ts` | AES-256-GCM seal/open; internal random nonces only |
| `lib/integration-credentials/kek.ts` | Versioned KEK resolver; canonical Base64; strict env names |
| `lib/integration-credentials/envelope.ts` | Credential-set encrypt/decrypt + bytea column mapper |
| `tests/unit/shopify-conn-1b-credential-crypto.test.ts` | Offline adversarial crypto tests |
| `tests/unit/shopify-conn-1b-credential-crypto-architecture.test.ts` | Server-only / boundary architecture tests |
| `docs/SHOPIFY_CONN_1B_CRYPTO_IMPLEMENTATION_REPORT.md` | This report |

**Not modified:** CONN-1a migration, `lib/config/env.ts`, `lib/observability/redact.ts`, package dependencies, any SQL, any app/client routes.
---

## 2. Crypto / envelope / AAD design

### Algorithm

- **AES-256-GCM** via Node `crypto` (`createCipheriv` / `createDecipheriv`)
- Auth tag length **16**; nonce length **12**; key length **32**
- Ciphertext and auth tag stored as **separate** Buffers (matches CONN-1a independent `*_ciphertext` / `*_auth_tag` bytea columns)
- No new npm crypto dependency

### Envelope (DEK / KEK)

| Layer | Behavior |
|---|---|
| DEK | Fresh random 256-bit key per `encryptCredentialSet` call |
| Token seals | Access (+ refresh for `offline_expiring`) sealed under DEK |
| DEK wrap | DEK sealed under versioned KEK as an independent AEAD operation |
| Nonces | Independent internal `randomBytes(12)` per seal (access, refresh, dek_wrap); `aeadSeal` rejects caller nonce |
| Tags | Independent 16-byte GCM tags per seal |

`toIntegrationCredentialByteaColumns()` maps the in-memory envelope onto CONN-1a column names (`access_*`, `refresh_*`, `dek_wrapped` / `dek_wrap_*`, `key_version`) without I/O.

### Canonical AAD (format version 1)

Big-endian binary layout:

```text
u8  aad_format_version (=1)
u8  seal_purpose       (1=access, 2=refresh, 3=dek_wrap)
u16+bytes organization_id (UTF-8)
u16+bytes integration_id (UTF-8)
u16+bytes provider (UTF-8)
u16+bytes token_kind (UTF-8)
u32 key_version
```

Binds the CONN-1 required fields and **distinguishes seal purpose** so access/refresh/DEK-wrap cannot authenticate interchangeably. Wrong org/integration/provider/token_kind/key_version/purpose → GCM auth failure → `decrypt_failed` (fail closed, no plaintext).

---

## 3. Key custody and version behavior

| Rule | Implementation |
|---|---|
| Server-only | Every module starts with `import "server-only"` |
| No `NEXT_PUBLIC_*` | Architecture test asserts absence; `env.ts` unchanged |
| Test injection | `createKekResolver({ keys, currentVersion })` |
| Phase A env names (fixed) | Exact `INTEGRATION_CREDENTIALS_KEK_V{n}` (canonical Base64 of 32 bytes), `INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION` via `createKekResolverFromEnv` |
| Canonical Base64 | Standard alphabet + correct padding; decode→re-encode must equal input; no trim/whitespace/URL-safe |
| Ambiguous env names | Fail closed (`malformed_input`) — unversioned `…_KEK`, leading-zero versions, suffixes |
| New writes | Use `kekResolver.currentVersion` |
| Reads | Resolve **exact** row `key_version`; unknown → `unknown_key_version`; missing current → `missing_key_version` |
| Seal nonces | Generated only inside `aeadSeal`; caller-supplied nonce rejected |
| No silent fallback | Wrong version / wrong KEK never tries another key |
| Memory | Best-effort `wipeBuffer` after encrypt/decrypt; **no claim of guaranteed JS zeroization** |
| Logging | No `console.*`; errors are stable codes only |

Production secret-manager product remains **gated / unresolved** per vault contract §6 — not bound here.

---

## 4. Tests and verification evidence

### Focused offline tests

```text
npx vitest run \
  tests/unit/shopify-conn-1b-credential-crypto.test.ts \
  tests/unit/shopify-conn-1b-credential-crypto-architecture.test.ts
→ Test Files  2 passed (2)
→ Tests       21 passed (21)
```

Coverage includes:

- V1 encrypt/decrypt + wrong key / wrong AAD
- V2 cross-org / cross-integration / wrong provider AAD denial
- V3 crypto portion: unknown/missing key_version; multi-version encrypt under current
- Nonce uniqueness across seals; independent auth tags
- Access/refresh swap denial (purpose-bound AAD)
- Wrong/missing KEK, malformed ciphertext, missing tag, wrong/short nonce
- Deterministic AAD encoding + purpose distinction
- No secrets in `CredentialCryptoError` messages
- **Hardening:** malformed Base64 DENY; ambiguous/invalid env version names DENY; caller nonce on `aeadSeal` DENY
- Architecture: server-only, no client imports, no DB/Shopify/OAuth, Node crypto only, internal nonce + canonical Base64 assertions, CONN-1a envelope shape preserved

### Verification commands (actual — post-hardening)

| Command | Result |
|---|---|
| Focused vitest (21) | **PASS** |
| `npm run typecheck` (`tsc --noEmit`) | **PASS** |
| `npm run lint` | **PASS** (0 errors; 2 pre-existing warnings in `scripts/check-migration-integrity.mjs`, unrelated) |
| `git diff --check` | **PASS** (clean) |

**Not run / out of scope:** Shopify network, DB writes, hosted Supabase, production keys, vault CRUD.
---

## 5. V1–V15 matrix

| ID | Status | Notes |
|---|---|---|
| **V1** | **PASS** | Round-trip; wrong key / wrong AAD fail closed |
| **V2** | **PASS** | Org/integration/provider AAD transplant DENY |
| **V3** | **PARTIAL** | Crypto mismatch DENY **PASS**; atomic DB rotation write **NOT TESTED** (no persistence in 1b) |
| **V4** | **NOT TESTED** | Atomic DB replace — CONN-1c+ |
| **V5** | **NOT TESTED** | Concurrent rotate single-flight — runtime |
| **V6** | **PASS** | Already closed in CONN-1a (schema grants); not re-litigated |
| **V7** | **PASS** | Already closed in CONN-1a (schema grants); helpers still not DB-activated |
| **V8** | **NOT TESTED** | Membership revoke / user client path — runtime |
| **V9** | **PASS** | Already closed in CONN-1a (FK/transplant schema) |
| **V10** | **PASS** | Already closed in CONN-1a (ownership uniqueness) |
| **V11** | **NOT TESTED** | `integrations.configuration` token prohibition — later slice |
| **V12** | **NOT TESTED** | Observability redaction extension for vault fields — later (redact.ts untouched) |
| **V13** | **PASS** | Crypto helper errors are codes only; no plaintext/ciphertext dumps |
| **V14** | **PASS** | Suite performs no Shopify network I/O; cert flags untouched |
| **V15** | **PASS** | Already closed in CONN-1a; migration not edited |

---

## 6. Security risks, STOP conditions, deviations

### Security invariants (hardened)

- Unique cryptographically random 12-byte nonce per seal; never caller-supplied on `aeadSeal`
- KEK env material accepted only as canonical standard Base64 of exactly 32 bytes
- Ambiguous KEK env names under `INTEGRATION_CREDENTIALS_KEK*` fail closed
- Errors remain code-only (`malformed_input` / `invalid_key_length` / …) — no secret material in messages

### Risks (accepted for this slice)

- JS cannot guarantee DEK/KEK zeroization (documented; best-effort wipe only).
- KEK env reader exists but is **not** wired into app boot / `readServerEnvironment` (intentional — no runtime activation).
- V12 redaction patterns for `shpat_` / vault field names not extended in this slice (crypto errors already safe).
- No vault persistence adapter yet — ciphertext exists only in-process during tests.
### STOP conditions checked

| Condition | Outcome |
|---|---|
| Schema/crypto incompatibility with CONN-1a | **None** — 12/16 nonce/tag sizes and per-seal columns match |
| Frozen contract silent change | **None** — migration and contract docs not edited |
| Hosted / DB / OAuth / workers / JWT / M6/M7 | **Not started** |
| Staging / commit / push | **Not performed** |
| Real keys in env files | **None added** |

### Deviations

- None vs CONN-1 vault crypto design. AAD adds explicit **format version** + **seal purpose** (required by this slice brief; compatible with contract “MUST bind at least …” fields).

---

## 7. Exact Git staging manifest

**Current staging area: empty.**

### Proposed staging manifest (do **not** stage now)

```text
lib/integration-credentials/index.ts
lib/integration-credentials/types.ts
lib/integration-credentials/errors.ts
lib/integration-credentials/aad.ts
lib/integration-credentials/aead.ts
lib/integration-credentials/kek.ts
lib/integration-credentials/envelope.ts
tests/unit/shopify-conn-1b-credential-crypto.test.ts
tests/unit/shopify-conn-1b-credential-crypto-architecture.test.ts
docs/SHOPIFY_CONN_1B_CRYPTO_IMPLEMENTATION_REPORT.md
```

---

## 8. Verdict

**PASS**

**STOP for owner review.** Do not begin CONN-1c (vault CRUD/RPC, persistence, refresh, OAuth, or runtime activation) until accepted. No staging/commit/push performed.
