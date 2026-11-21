# SHOPIFY-CONN-0 — Security Architecture Contract

**Status:** ACCEPTED / CLOSED — CONN-0A owner-approved via Git on `main` @ `965e6d7` (`docs(shopify): freeze CONN-0A security architecture`)
**Baseline:** `main` @ `965e6d7`
**As-of:** 2026-11-20 (CONN-0A freeze); acceptance label corrected 2026-11-21 (CONN-1B docs)
**Mode:** Architecture / security freeze only. No OAuth, vault schema, SyncRun, workers, JWT, M6/M7, or live Shopify implementation in this milestone.

**Authority chain:** This contract gates CONN-1…CONN-6. Vault schema/crypto details are frozen in `docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md` (CONN-1B). It does not supersede RO.1–RO.3 law in `docs/PROVIDER_ADAPTERS.md` / `docs/SHOPIFY_RO2_TRANSPORT.md`, tenancy in `docs/CROSS_ORG_THREAT_MODEL.md`, or service-role rules in `docs/SERVICE_ROLE_BOUNDARY.md`.

**Legend**
- **Verified** — required or documented by Shopify platform docs (cited).
- **StoreAgent proposal** — StoreAgent.si product/security choice frozen by CONN-0A acceptance; vault implementation detail lives in the CONN-1 vault contract.

**Non-claims:** This document does **not** claim Shopify App Store submission, review, or approval. Public-distribution readiness is architectural only. Acceptance of CONN-0A does **not** authorize CONN-1 implementation, migrations, or runtime code.

---

## 1. Product distribution (independent SaaS)

### Decision (StoreAgent proposal — recommended)

| Choice | Recommendation |
|---|---|
| UX host | **Standalone StoreAgent.si SaaS** (merchant UI on StoreAgent; not Shopify Admin App Bridge) |
| Shopify auth style | **Authorization-code grant** for a **standalone / API-only** app |
| Token type | **Expiring offline** access tokens (`expiring=1`) + refresh rotation for background SyncRun |
| Near-term testing | **Development-store installs first** (authorized test path) |
| Unrelated merchant pilots (future) | **Public-distribution-ready** architecture (same standalone OAuth + vault + webhooks). Custom distribution is **not** that route |

### Custom distribution — corrected limits (Verified)

Per [About app distribution](https://shopify.dev/docs/apps/launch/distribution) and [Select a distribution method](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method):

| Allowed under custom | Not allowed under custom |
|---|---|
| A **single** Shopify store | Installs across **unrelated** merchants / different organizations |
| Multiple stores only when they belong to the **same Plus organization** | Treating custom as a general multi-tenant SaaS install channel |
| **Development stores** | Silent “share with any shop” |

Shopify states distribution method **cannot be changed after selection**. Custom is therefore unsuitable as the long-term path for StoreAgent’s unrelated-merchant SaaS connectivity.

Shopify API terms likewise restrict Custom Applications to a single Merchant (a Merchant may have multiple stores). See [Shopify API License and Terms of Use](https://www.shopify.com/legal/api-terms).

### Authorized path (StoreAgent proposal)

1. **Phase A — development stores:** Build and validate OAuth, vault, webhooks, and read-only GraphQL against development stores. No production SyncRun claims; live nested cert remains **FALSE**.
2. **Phase B — public-distribution-ready architecture:** Design install/OAuth/vault/webhook/SyncRun contracts so a **public** distribution app can later serve unrelated merchants. Optionally use limited App Store visibility when/if listing is authorized later ([App listing visibility](https://shopify.dev/docs/apps/launch/distribution/visibility)).
3. **Do not** use custom distribution as the general route for multiple unrelated merchant stores.
4. If a one-off single-merchant or single Plus-org engagement is needed, that may use a **separate** custom-distributed app — never the multi-merchant production identity.

### Rationale

1. StoreAgent is an independent multi-provider SaaS (CSV → Shopify → Woo → Amazon). Embedding would couple UX/tenancy to one channel.
2. Standalone/API-only apps use authorization-code grant ([Authenticate a standalone or API-only app](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps)).
3. Unrelated merchants require **public** distribution capabilities; custom cannot lawfully/productively serve that model.
4. Development-store-first reduces blast radius before any merchant production data.

### Rejected for default path

| Option | Why not default |
|---|---|
| Embedded Admin app + token exchange | Conflicts with independent SaaS UX; session tokens are not the SyncRun credential model. |
| Client-credentials-only | Only for stores in the **app developer’s own** Shopify organization — not merchant installs. |
| Custom distribution as multi-merchant SaaS channel | Violates Shopify custom limits; blocks unrelated merchant pilots on that app. |
| Non-expiring offline tokens | Wrong default for new apps; larger leak blast radius (see §4 deadlines). |
| Claiming App Store approval in this contract | Not obtained; out of scope for CONN-0. |

### Owner unresolved

- Whether the **production-bound** Shopify app selects **public** distribution from creation (recommended if unrelated merchants are the goal), vs a separate throwaway custom/dev app for experiments only.
- Exact production redirect URI host(s).
- Whether limited App Store visibility is desired when public listing is later authorized (not claimed here).

---

## 2. Least-privilege Admin GraphQL scopes (`2026-10`)

Pinned API version remains **`2026-10`** (`SHOPIFY_ADMIN_API_VERSION` / RO.2). Mutations remain forbidden in StoreAgent transport (`lib/providers/shopify/operations.ts`, `transport.ts`).

### Operation → scope validation (required set)

Validated against actual RO.2 / RO.3 documents in `lib/providers/shopify/operations.ts`:

| GraphQL operation / fields | File evidence | Required scope(s) | Citation |
|---|---|---|---|
| `products` (+ nested `variants`, `shop.currencyCode`) | `SHOPIFY_RO2_PRODUCTS_QUERY`; RO.3 `productVariants` | `read_products` | [Access scopes](https://shopify.dev/docs/api/usage/access-scopes) |
| `locations` (`id`, `name`, `isActive`) | `SHOPIFY_RO2_LOCATIONS_QUERY` | `read_locations` | [Migrate to read_locations](https://shopify.dev/docs/apps/build/inventory-management-apps/migrate-to-read-locations) |
| `inventoryItems` (+ `inventoryLevels`, nested `location { id }`, quantities) | `SHOPIFY_RO2_INVENTORY_ITEMS_QUERY`; RO.3 level/variant continuations | `read_inventory` (+ `read_locations` for Location fields beyond id where needed) | Access scopes + locations migration |
| `orders` (+ `lineItems`, money sets, status displays) | `SHOPIFY_RO2_ORDERS_QUERY`; RO.3 `orderLineItems` | `read_orders` (**last 60 days** by default) | [Orders permissions](https://shopify.dev/docs/api/usage/access-scopes) |
| `Order.fulfillmentOrders` (+ `assignedLocation.location.id`, FO `lineItems`) | Same orders query; RO.3 FO continuations | `read_merchant_managed_fulfillment_orders` for merchant-managed FO locations used by RO.1.2 location provenance | [FulfillmentOrder](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder) |

**Minimum required read scopes (default grant):**

```text
read_products,read_inventory,read_locations,read_orders,read_merchant_managed_fulfillment_orders
```

No `write_*` scopes. No standing `read_customers` / `write_customers`.

### Optional, explicitly justified permissions (not default)

These are **not** part of the minimum grant. Request only with written owner justification and install-time scope diff recording.

| Optional scope | Justification gate | Failure mode if absent |
|---|---|---|
| `read_all_orders` | Required **only** when SyncRun must backfill demand **older than 60 days**. Must be paired with `read_orders`. Does **not** grant write. Shopify approval requirements may apply. | Treat older history as **out of scope**; never invent zeros or fabricate demand |
| `read_third_party_fulfillment_orders` | Required **only** when FO location provenance for **third-party** fulfillment locations is necessary for planning accuracy on that shop | FO rows for third-party locations remain incomplete/quarantined; do not guess locations |

### Explicitly forbidden

- Any `write_*` scope
- Using marketplace-only order scopes as a substitute for shop-wide `read_orders`
- Declaring optional scopes as silently “required” in default OAuth

### Minimal order-linked PII + protected customer data

**RO.2 field selection (code fact):** `SHOPIFY_RO2_ORDERS_QUERY` requests operational order fields only (`id`, `name`, timestamps, financial/fulfillment **display** statuses, currency, money sets, line item ids/qty/prices, FO ids/status/location id linkage). It does **not** select customer name, email, phone, or shipping/billing address fields.

**Platform fact (Verified):** Declaring `read_orders` (and related fulfillment access) still implicates **protected customer data** policy for public / non–development stores. Until PCD access is configured/approved as required, Shopify may redact protected fields on non-dev stores ([Work with protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data), [Manage access scopes](https://shopify.dev/docs/apps/build/authentication-authorization/manage-access-scopes)).

**StoreAgent handling rules (proposal)**

| Rule | Detail |
|---|---|
| Select minimal fields | Keep GraphQL selection free of direct customer PII unless a later milestone proves need |
| Persist minimal | Store demand/inventory planning facts (ids, quantities, money, statuses, location links) — not customer contact PII |
| Logs | Never log raw customer PII; use `redactObservabilityValue` |
| Dev vs non-dev | Development-store testing first; non-dev / public installs must satisfy applicable PCD requirements before relying on unredacted order payloads |
| No claim | This contract does **not** assert PCD approval has been granted |

### Grant verification (StoreAgent proposal)

After token exchange, compare returned `scope` to the **requested** set. Missing any **required** minimum scope → integration `error` / install incomplete; **do not** start SyncRun. Missing an **optional** scope → feature-gate that capability only; do not fail the entire install unless owner marked it required for that merchant.

---

## 3. OAuth, install identity, reconnect, cross-org

### Verified platform flow (standalone)

1. Merchant provides `shop` → validate domain → create `state` nonce → redirect to
   `https://{shop}/admin/oauth/authorize` with `client_id`, `scope`, `redirect_uri`, `state`.
2. Callback must validate, in order: **state**, **HMAC**, **shop domain**, then exchange `code` at
   `POST https://{shop}/admin/oauth/access_token` with `expiring=1` for offline tokens.
3. `redirect_uri` must **exactly** match Dev Dashboard / TOML allowlist.

Source: [Authenticate a standalone or API-only app](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps).

### Shop-domain validation (Verified)

Anchored pattern only:

```text
^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$
```

Reject open suffixes (e.g. `shop.myshopify.com.attacker.example`). Normalize to lowercase before persist.

### State / CSRF (Verified + StoreAgent proposal)

| Rule | Detail |
|---|---|
| Nonce | Cryptographically random; single-use |
| Binding | Server-side store (preferred) or signed HttpOnly cookie bound to **authenticated StoreAgent tenant session** + shop |
| TTL | Short (proposal: ≤ 10 minutes) |
| Mismatch | HTTP 403; no token exchange |

### Callback HMAC (Verified)

Remove `hmac`, sort remaining query params, HMAC-SHA256 with **app client secret**, constant-time compare. Failure → 403; no token exchange.

### Installation identity (StoreAgent proposal; aligns Threat 7 / 20)

| Field | Role |
|---|---|
| `organization_id` | Authoritative tenant (from trusted StoreAgent session — never from Shopify alone) |
| `store_id` | Optional StoreAgent store scope when integration is store-scoped |
| `provider` | `'shopify'` |
| `shop_domain` | Normalized `*.myshopify.com` (non-secret configuration) |
| `shopify_shop_id` | Opaque shop id from Shopify when available (install/webhook) |
| `integrations.id` | Durable integration row |

**Rules**
- Provider external IDs never establish tenant ownership (`docs/CROSS_ORG_THREAT_MODEL.md` Threat 7).
- Reconnect must match **trusted shop identity** (domain + shop id) to an existing integration in the **same** organization — never “first Shopify integration” (Threat 20).
- If shop is already bound to **another** organization → **DENY** with explicit conflict; no silent reassignment.
- Same org reconnect → rotate vault credentials; preserve integration id when identity matches.
- `integrations.configuration` may hold non-secret metadata (`shop_domain`, granted scopes list, API version pin). **Never** tokens.

### Online tokens

Not used for SyncRun. Offline expiring tokens only for server sync. (Online tokens are staff-scoped and have no refresh token — see Shopify access-token docs.)

---

## 4. Expiring offline token vault

### Verified token behavior and adoption deadlines

| Item | Value | Source |
|---|---|---|
| Request form | Include `expiring=1` on authorization-code token exchange for offline tokens | [Standalone auth](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps) |
| Access token TTL | Read `expires_in` (typically **3600** seconds) | [Access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens) |
| Refresh token TTL | Read `refresh_token_expires_in` (typically **90 days** / `7776000` seconds) | same |
| Refresh | `grant_type=refresh_token` → new access **and** new refresh; persist both | Standalone auth — refresh |
| One current offline token | Acquiring/refreshing retires prior expiring offline tokens for app+shop | Access tokens |
| Refresh concurrency | Do not acquire and refresh concurrently for the same shop; presented refresh stays usable until the replacement is used (retry-safe on transient 5xx) | same |

**Shopify adoption deadlines (Verified — plan to them even during dev-store testing):**

| Deadline | Applies to | Requirement |
|---|---|---|
| **2026-04-01** | **Public** apps created on or after this date | Must use expiring offline access tokens for Admin API |
| **2026-12-01** | **All other** apps created on or after this date | Must use expiring offline access tokens for Admin API |

Source: [Authenticate a standalone or API-only app](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps) (expiring offline mandate). StoreAgent default is expiring offline **now**, regardless of which deadline would otherwise apply.

### Vault invariants (StoreAgent proposal)

**Normative detail:** `docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md` freezes table design, AEAD/envelope rules, grants, and shop-ownership uniqueness. Summary invariants below remain binding; where wording differed historically (“platform KMS” / production secret manager as primary), CONN-1’s dedicated encrypted table + app AES-256-GCM + server-only KEK (production secret-manager **gated**) is authoritative.

1. **Separate** from `public.integrations.configuration` (M2.6 already forbids credentials there).
2. **Server-only** decrypt path; never `NEXT_PUBLIC_*`; never browser; never AI tools.
3. Encrypt at rest with **AES-256-GCM** (application AEAD) and envelope DEK/KEK; KEK is server-only (env for Phase A; production secret-manager product separately gated in CONN-1).
4. Store ciphertext for `access_token` + `refresh_token`, plus `access_expires_at`, `refresh_expires_at`, `scope`, `integration_id`, `organization_id`.
5. **Row-level tenant binding:** vault row FK to `(organization_id, integration_id)`; service-role reads must filter by those ids (`docs/SERVICE_ROLE_BOUNDARY.md`).
6. **Redaction:** logs/observability use `redactObservabilityValue`; never log tokens, client secret, or raw OAuth codes (`lib/observability/redact.ts` pattern).
7. **Rotation:** on refresh success, atomically replace ciphertext pair; on refresh `invalid_request` / hard 401 → mark integration `revoked` or `disconnected`, clear vault, require re-OAuth.
8. **Concurrency:** per-integration refresh lock / single-flight so two SyncRuns cannot race dual refresh into inconsistent storage.
9. **Revocation triggers:** `app/uninstalled`, hard auth failures, owner disconnect, client-secret rotation playbook.
10. App **client secret** lives only in server env — never in DB rows returned to clients.

---

## 5. Webhooks — HMAC, replay, uninstall, privacy

### HMAC (Verified)

For HTTPS webhooks: HMAC-SHA256 of **raw body** with client secret; compare to `X-Shopify-Hmac-SHA256` (base64) with constant-time compare. Invalid → **401**. Capture raw body before JSON parse.
Source: [Verify webhook deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries).

### Processing pipeline (StoreAgent proposal; aligns service-role §7)

```text
verify HMAC → parse topic → resolve integration by shop domain / shop id
  → trusted organization_id → tenant-scoped handler
```

Never resolve tenant by email or shop display name.

### Replay / idempotency (StoreAgent proposal)

| Mechanism | Rule |
|---|---|
| Event id | Persist `X-Shopify-Webhook-Id` (or equivalent) with processing outcome; duplicate delivery → idempotent 200 |
| Timestamp skew | Reject stale deliveries outside configured window (proposal: 5 minutes) after HMAC ok |
| Ordering | Uninstall/revoke beats later data sync attempts |

### Operational topic (StoreAgent proposal)

| Topic | Action |
|---|---|
| `app/uninstalled` | Immediately invalidate vault tokens; set integration `revoked` or `disconnected`; stop SyncRun claims |

### Privacy compliance webhooks (Verified mandatory for App Store / public)

| Topic | Obligation |
|---|---|
| `customers/data_request` | Export/view customer data the app stores; ack 2xx; complete within **30 days** |
| `customers/redact` | Delete/anonymize customer data; ack 2xx; complete within **30 days** |
| `shop/redact` | Delete shop data after uninstall; ack 2xx; complete within **30 days** |

Source: [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance).

**StoreAgent proposal (public-distribution-ready):** Implement HMAC-verified privacy handlers in the architecture even while Phase A uses development stores, so a later public app does not require a security redesign. Mandatory App Store enforcement applies when publicly distributed; this contract still does **not** claim listing/review/approval. Data retention for planning facts vs PII redaction must be owner-approved before CONN-3.

### Sync data webhooks

Optional later (products/inventory/orders). Not required to freeze CONN-0; pull SyncRun remains source of truth until authorized.

---

## 6. Shopify → StoreAgent location mapping

Frozen adapter law (`docs/PROVIDER_ADAPTERS.md` M0.7.11):

- Inventory is **variant + location** scoped.
- Shopify Location GIDs are opaque ProviderBindings.
- **Never** silently aggregate inventory across Shopify locations.

### Mapping contract (StoreAgent proposal)

| Rule | Detail |
|---|---|
| Explicit map | Each Shopify Location used in sync must map to exactly one StoreAgent Location (same org; store-scoped when required) |
| Unmapped | Inventory/order FO locations without a map → **quarantine** / incomplete sync — not guessed |
| No invent | Adapter must not invent StoreAgent locations from Shopify names |
| Changes | Remap is a merchant-controlled reconciliation action; SyncRun must not auto-merge |
| Isolation | Location bindings are integration-scoped; cross-org location ids DENY |

---

## 7. RO.3 fail-closed + live certification FALSE

| Flag / gate | Value | Meaning |
|---|---|---|
| Offline RO.3 | `shopify-ro.3-v1` CLOSED/PUSHED | Mocked nested pagination proof only |
| `SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED` | **false** | Must stay false until live gate |
| `SHOPIFY_RO3_LIVE_NESTED_COMPLETENESS_CERTIFIED` | **false** | Must stay false until live gate |
| Incomplete nested pages | Fail closed via `mayAcceptAsCompleteShopifySyncInput` / RO.3 evidence | Incomplete ≠ complete catalog |

**Invariant:** Offline unit PASS never flips live flags and never authorizes SyncRun `completed` for a live shop.

---

## 8. SyncRun checkpoints, partial failure, completion

Reuses provider-neutral `sync_runs` + idempotency (`lib/providers/sync-run-idempotency.ts`). Shopify-specific orchestration is CONN-5+.

### Binding

Every Shopify SyncRun requires: `organization_id`, `integration_id`, optional `store_id`, `idempotency_key`. Location mapping must be loadable for resources that need it.

### Checkpoints (StoreAgent proposal)

| Field use | Meaning |
|---|---|
| `cursor_before` / `cursor_after` | Opaque Shopify cursors + resource checkpoint metadata (JSON in reconciliation_metadata as needed) |
| Per-resource watermark | products / locations / inventoryItems / orders advanced independently |
| Nested evidence | RO.3 completeness evidence retained for audit; missing evidence → cannot complete |

### Modes

| Mode | Behavior |
|---|---|
| Full / backfill | Read approved resources; default order window = 60 days under `read_orders`. Older history only if optional `read_all_orders` was explicitly justified and granted |
| Incremental | Resume from durable cursors/watermarks only; no fabricated gaps |

### Accounting

Quarantine / skip / fail counts follow `docs/PROVIDER_ADAPTERS.md` M0.7.9. Ambiguous normalization quarantines; unknown ≠ zero.

### Completion conditions (hard)

SyncRun may reach `completed` or `completed_with_errors` **only if all** hold:

1. Trusted integration + vault credential usable for the run.
2. Required location maps present for imported inventory/FO-linked demand (or those rows quarantined and not treated as complete catalog truth).
3. Top-level pagination finished **and** nested completeness proven (RO.3 pagination proof or explicit offline attestation — live shops require **live** certification flag true).
4. No unresolved transport hard-fail that truncates a required resource without durable incomplete attestation.
5. Counts consistent; quarantined rows do not silently become canonical zeros.

Otherwise: `failed`, or durable **incomplete** attestation with **non-complete** merchant health — never “fully imported.”

Auth loss mid-run → fail closed; mark connection unhealthy; do not partial-complete as success.

---

## 9. Offline adversarial tests vs live certification gates

### Offline / deterministic (acceptable without live shop)

| Suite / assertion | Intent |
|---|---|
| Existing `provider-shopify-*.test.ts` | RO.1.2 / RO.2 / RO.3 offline behavior preserved |
| Shop domain regex adversarial | Reject unsuffixed / open-suffix hosts |
| OAuth state mismatch / callback HMAC fail | No token exchange (CONN-2+) |
| Vault redaction | Tokens never appear in redact output / Integration configuration |
| Scope allowlist | Write scopes rejected; required minimum enforced; optional scopes feature-gated |
| Webhook HMAC fail → 401; replay id → idempotent | CONN-3+ |
| Cross-org reconnect DENY | Shop bound to org A cannot install into org B |
| Location unmapped → quarantine / incomplete | No invented maps |
| Nested incomplete → `mayAcceptAsCompleteShopifySyncInput === false` | Preserve RO.3 gate |
| Live flags remain `false` | Architecture + fixture guards |

### Live certification (separate owner gate — CONN-4)

| Gate | Requirement |
|---|---|
| **Development store first** | Controlled **development-store** Admin GraphQL `2026-10` reads via vaulted token before any non-dev pilot |
| Nested completeness pack | Prove closed nested `pageInfo` on required connections for that shop |
| Flag flip | Only owner authorization may set `SHOPIFY_RO3_LIVE_NESTED_COMPLETENESS_CERTIFIED = true` for attested environments |
| Non-goals | Not SyncRun `completed` for production merchants; not workers/cron ON; not JWT unlock; **not** App Store approval |

---

## 10. CONN-1…CONN-6 — dependency-ordered contracts

Each milestone needs **separate owner authorization**. None are started by CONN-0A docs freeze.

| ID | Scope | Depends on | Explicit exclusions | Exit evidence |
|---|---|---|---|---|
| **CONN-1** | Credential vault schema + encrypt/decrypt API + RLS/service-role denial tests (no Shopify network) | CONN-0A accepted + `docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md` owner-accepted; separate implementation authorization | OAuth UI, live calls, SyncRun, workers | Migration + unit/adversarial PASS |
| **CONN-2** | OAuth authorize/callback (state, HMAC, shop validate, install identity, scope check) → vault write; **dev-store oriented** | CONN-1 + app credentials | SyncRun complete, live nested cert flip, write scopes, App Store submission | Offline OAuth mock + adversarial PASS |
| **CONN-3** | Webhook HMAC, `app/uninstalled`, privacy trio handlers, replay idempotency | CONN-1/2 | Data topic fan-out sync, workers ON, App Store approval claim | Webhook unit/adversarial PASS |
| **CONN-4** | Live nested-completeness certification on **development store** first (+ controlled live reads) | CONN-2; development shop | Production SyncRun complete; JWT; workers; App Store approval | Owner-signed live pack; flag policy documented |
| **CONN-5** | Read-only Shopify SyncRun v1 (full/backfill), checkpoints, quarantine, fail-closed completion | CONN-4 live cert **or** explicit incomplete-attestation mode | Incremental polish, M7, purchasing | SyncRun tests; no false complete |
| **CONN-6** | Incremental cursors + connection health UX (expiry/revocation/freshness) | CONN-5 | M6 production forecast, M7 create, purchasing, billing, AI spend | Health signals + incremental tests |

### Frozen global exclusions (all CONN-*)

PE1.b.6b JWT execution; workers/cron activation; M6 production forecast operation; M7 create/purchasing; billing charges; live AI/search paid spend; Shopify write-back; false-complete SyncRun; cross-org guesswork; claiming Shopify App Store review/approval without a separate owner gate.

---

## 11. Security invariants (checklist)

1. StoreAgent remains independent SaaS; Shopify is a provider adapter, not the product shell.
2. Admin API `2026-10` read-only; transport forbids GraphQL mutations.
3. No write scopes in requested or accepted grants; optional scopes require explicit justification.
4. OAuth: state + callback HMAC + anchored shop domain + exact redirect URI.
5. Tenant from StoreAgent auth / trusted integration — never from Shopify shop alone.
6. Credentials only in vault; never in `integrations.configuration`, ProviderBinding, or logs.
7. Webhooks: HMAC before trust; uninstall revokes; privacy webhooks designed for public-distribution readiness.
8. Location maps explicit; no cross-location inventory aggregation.
9. Live nested cert flags stay **false** until CONN-4 owner gate.
10. Incomplete evidence ≠ SyncRun complete; unknown ≠ zero.
11. Service-role webhook/sync paths require trusted `organization_id` (`docs/SERVICE_ROLE_BOUNDARY.md`).
12. M5 deterministic metrics remain authoritative; Shopify sync does not invent metric truth.
13. Custom distribution is not a multi-unrelated-merchant channel; development-store testing precedes non-dev pilots.
14. M6 production forecast, M7 create/purchasing, PE1.b.6b JWT, and workers/cron remain **BLOCKED** unless separately authorized.

---

## 12. Official citations (platform-specific)

| Topic | URL |
|---|---|
| Standalone OAuth | https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps |
| Access tokens / refresh | https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens |
| Access scopes | https://shopify.dev/docs/api/usage/access-scopes |
| Manage scopes / 60-day orders | https://shopify.dev/docs/apps/build/authentication-authorization/manage-access-scopes |
| `read_locations` migration | https://shopify.dev/docs/apps/build/inventory-management-apps/migrate-to-read-locations |
| Protected customer data | https://shopify.dev/docs/apps/launch/protected-customer-data |
| App distribution | https://shopify.dev/docs/apps/launch/distribution |
| Select distribution method | https://shopify.dev/docs/apps/launch/distribution/select-distribution-method |
| App listing visibility | https://shopify.dev/docs/apps/launch/distribution/visibility |
| Webhook HMAC | https://shopify.dev/docs/apps/build/webhooks/verify-deliveries |
| Privacy compliance webhooks | https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance |
| FulfillmentOrder scopes | https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder |
| API terms (custom app single merchant) | https://www.shopify.com/legal/api-terms |

---

## 13. Acceptance / STOP

### Acceptance (current)

CONN-0A is **ACCEPTED / CLOSED** by owner-approved Git closure on `main` @ `965e6d7`.

Vault design detail is separately frozen in `docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md`. CONN-1 **implementation** (migrations, encrypt/decrypt code, tests) still requires explicit owner authorization after that contract is accepted.

### Historical STOP evidence (preserved)

At CONN-0A freeze time, this document stated:

> Owner must accept or amend this document before any CONN-1 implementation.
>
> **STOP.** Do not start CONN-1, OAuth, vault migrations, live Shopify calls, workers, JWT, M6/M7, App Store submission, or Git commit/push under this freeze alone.

That STOP remains historically true for the CONN-0 freeze alone: accepting CONN-0A does not start CONN-1 code, OAuth, vault migrations, live Shopify calls, workers, JWT, M6/M7, App Store submission, or Git operations under CONN-0 alone.

**Current STOP (post-acceptance):** Do not implement CONN-1 until the CONN-1 vault contract is owner-accepted **and** a separate implementation slice is authorized. OAuth, live Shopify, SyncRun, workers, JWT, M6/M7, and App Store submission remain blocked.
