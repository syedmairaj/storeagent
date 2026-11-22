# CONN-MP-0 — Multi-Provider Architecture Proposal

**Status:** ACCEPTED — DOCS-ONLY ARCHITECTURE FREEZE; D13/D14 DEFERRED; implementation separately gated
**As-of:** 2026-11-22 (amendment pass)
**Baseline:** `main` @ `a918217` (`feat(shopify): add CONN-1c alpha offline credential persistence foundation`)
**Mode:** Docs-only. No application code, SQL, tests, OAuth, network calls, workers, JWT, or M6/M7 activation.

**Product vision**

> One inventory intelligence workspace for every channel you sell through. Connect your stores, understand what is selling, identify stock risks, and make better buying decisions.

**Objective**

Design provider-independent ecommerce connections supporting Shopify, Amazon, Noon, WooCommerce, and future approved local marketplaces, without breaking the existing canonical inventory engine.

**Authority chain (frozen — do not silently redesign)**

| Authority | Path |
|---|---|
| Provider anti-corruption | `docs/PROVIDER_ADAPTERS.md` (M0.7.1–M0.7.12 + Shopify RO.1–RO.3) |
| Shopify transport | `docs/SHOPIFY_RO2_TRANSPORT.md` |
| Shopify security | `docs/SHOPIFY_CONN_0_SECURITY_ARCHITECTURE.md` |
| Credential vault | `docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md` |
| CONN-1a schema evidence | `docs/SHOPIFY_CONN_1A_SCHEMA_IMPLEMENTATION_REPORT.md` + `supabase/migrations/20261121120000_shopify_conn_1a_integration_credential_vault.sql` |
| CONN-1b crypto evidence | `docs/SHOPIFY_CONN_1B_CRYPTO_IMPLEMENTATION_REPORT.md` + `lib/integration-credentials/*` |
| CONN-1c-α persistence evidence | `docs/SHOPIFY_CONN_1C_ALPHA_IMPLEMENTATION_REPORT.md` + `supabase/migrations/20261122120000_shopify_conn_1c_alpha_credential_persistence.sql` |
| Integration identity | `supabase/migrations/20261011143000_m2_6_integration_identity.sql` |
| Tenancy | `docs/TENANCY_MODEL.md`, `docs/SERVER_TENANT_RESOLUTION.md`, `docs/CROSS_ORG_THREAT_MODEL.md` |
| Canonical persistence | `docs/M2_CANONICAL_PERSISTENCE.md`, `docs/DOMAIN_MODEL.md`, `docs/DOMAIN_INVARIANTS.md` |
| Metrics / decisions | `docs/INVENTORY_FORMULAS.md`, M5/M6/M7 contracts (production create still blocked) |
| Status pointer | `docs/IMPLEMENTATION_STATUS.md` → living ledger |

**Legend for every decision below**

| Class | Meaning |
|---|---|
| **REUSE** | Existing frozen contract/code is sufficient; multi-provider work must obey it |
| **ADDITIVE** | New tables/enums/UX/docs that do not weaken frozen invariants |
| **CONTRACT_CHANGE_REQUIRED** | Owner must explicitly amend a frozen CHECK, enum, or uniqueness rule before implementation |

**Owner-directed disposition legend (this amendment pass)**

| Disposition | Meaning |
|---|---|
| **ACCEPT** | Owner accepted the decision intent; wording below reflects that intent |
| **AMEND** | Owner amended the decision; wording below is the amended rule |
| **DEFER** | Remains unresolved; no silent change to prior CONN-1 defaults |

This amended document itself is **READY FOR OWNER ACCEPTANCE** of the full freeze — disposition of D1–D15 is **not** the same as acceptance of the whole proposal.

**Non-claims**

- Does not authorize CONN-1c-β, CONN-2 OAuth, live Shopify/Amazon/Noon/Woo calls, hosted vault apply, workers/cron, PE1.b.6b JWT, M6 production forecast, M7 create/purchasing, billing implementation, or App Store / SP-API / Noon partner approval.
- Preserves **`CREDENTIAL_BINDING_AUTHORIZATION_STATUS = NOT_YET_VERIFIED`** (CONN-1c-α).
- Preserves CONN-1a / CONN-1b / CONN-1c-α frozen implementations unchanged by this docs pass.
- Production runtime credential ops and hosted migrations remain **BLOCKED**.
- Does not claim merchant-facing “Connect / supported” for any live channel until runtime security, authorization, and provider-specific readiness gates pass.
- Does not claim one-click connect for platforms that require partner approval or manual credentials.

---

## 1. Existing architecture findings (with file references)

### 1.1 Preflight (this proposal)

| Check | Result |
|---|---|
| Branch | `main` |
| HEAD | `a9182177310c1bfd73581b7a4172f5afd785d021` (= baseline `a918217`) |
| Staging | empty |
| Dirty tree | Unrelated local modifications/untracked paths present; **must be preserved** (see report) |
| `AGENTS.md` | Present (Next.js agent-rules stub only) |
| `CLAUDE.md` | Absent |

### 1.2 Connection / integration identity already exists

Merchant connections are already modeled as **`public.integrations`** (M2.6):

- Tenant: `organization_id` (required); optional `store_id`
- Provider string + status (`pending` / `active` / `degraded` / `disconnected` / `revoked` / `error`)
- `configuration` jsonb = **non-secret only**
- Unique `(organization_id, id)` and `(organization_id, id, provider)` — **not** unique `(organization_id, provider)`

**Finding:** Multiple integrations per organization, including multiple accounts of the same provider, are already schema-legal. There is **no** database hard-cap of three connections.

Canonical TypeScript: `Integration` / `ProviderType` in `lib/commerce-domain/types.ts`.

### 1.3 Provider vocabulary is frozen but incomplete for Amazon/Noon

Current `ProviderType` / SQL CHECKs:

```text
csv | shopify | woocommerce | square | lightspeed | other
```

Evidence: `lib/commerce-domain/types.ts`; `integrations_provider_check` / `provider_bindings_provider_check` in M2.6; mirrored CHECKs on `integration_credentials` and `integration_external_accounts` in CONN-1a.

**Finding:** WooCommerce is already a first-class provider token. Amazon and Noon are **not**. Square/Lightspeed exist as reserved tokens without connector milestones. Using `'other'` for Amazon/Noon would hide provider-specific ownership, vault credential profiles, and adapter isolation — rejected as a long-term identity strategy.

### 1.4 Provider adapter law is already multi-provider

`docs/PROVIDER_ADAPTERS.md` freezes:

- Transport → raw payload → adapter → canonical candidate → binding/persistence → metrics → forecast → decisions
- ProviderBinding durable identity: `(organization_id, integration_id, provider, resource_type, normalized external_id)`
- Unknown ≠ zero; quarantine fail-closed; no parallel calculation engines
- Credentials never in `integrations.configuration`, bindings, or SyncRun metadata
- CSV under `lib/providers/csv/`; Shopify under `lib/providers/shopify/`
- Shopify RO.1–RO.3 offline closed; live nested completeness **FALSE**; OAuth/SyncRun blocked

### 1.5 CONN-1 vault is provider-neutral storage with Shopify-first token kind

| Layer | State at baseline |
|---|---|
| CONN-0A | ACCEPTED @ `965e6d7` |
| CONN-1 vault contract | Design freeze (provider-neutral table intended for Woo/Amazon later) |
| CONN-1a | Schema: `integration_credentials` + `integration_external_accounts` |
| CONN-1b | Server-only AES-256-GCM envelope / AAD / KEK resolver |
| CONN-1c-α | Offline RPC + trusted-scope repository; **production authorization `NOT_YET_VERIFIED`** |
| CONN-1c-β / CONN-2+ | Not started |

Critical constraints for multi-provider reuse:

1. **One credential set per integration** — `UNIQUE (organization_id, integration_id)`.
2. **`token_kind` CHECK currently allows only `offline_expiring`**.
3. Refresh envelope required when `token_kind = offline_expiring`.
4. AAD binds `organization_id || integration_id || provider || token_kind || key_version` (+ seal purpose in CONN-1b).
5. Global active ownership uniqueness on `(provider, external_account_id)` and `(provider, external_handle)`.
6. Shopify handle shape enforced only when `provider = 'shopify'`; other providers may use normalized lowercase handles.

**Amendment note (D7):** Physical `access_*` / `refresh_*` column names must not silently be overloaded to mean “secret A / secret B” for API-key providers. Credential **purpose** is defined by an explicit later credential-profile contract, not by column nickname reuse.

### 1.6 Canonical inventory engine is provider-independent

| Layer | Grain / rule | Implication for multi-channel |
|---|---|---|
| Product / variant | Org + store; SKU required; **no org-wide SKU uniqueness** (`M2_CANONICAL_PERSISTENCE.md`) | Cross-channel SKU identity is a product policy, not automatic DB uniqueness |
| InventorySnapshot | Org + store + **location** + variant; append-only | Channel inventory must map through canonical Location; never silent cross-location aggregation (`PROVIDER_ADAPTERS` / CONN-0) |
| Orders / demand | Canonical OrderStatus; unknown fails closed | Marketplace order statuses need explicit adapter maps |
| M5 metrics | Org/store/location/variant/date/algorithm | Multi-channel demand/inventory must land in same grains or be explicitly scoped; Location + M5 invariants preserved |
| M6 / M7 | Production forecast/create **BLOCKED** | New providers must not invent parallel ROQ/decision engines |

### 1.7 Domain already separates Store from provider connection

`docs/DOMAIN_MODEL.md`: a Store is a logical selling operation; **not** synonymous with a provider connection. Organization already carries country/timezone/currency and billing entitlement concepts.

### 1.8 Shopify connector roadmap remains the first live path

CONN-0 §10 order: CONN-1 → CONN-2 OAuth → CONN-3 webhooks → CONN-4 live nested cert → CONN-5 SyncRun → CONN-6 health UX. Implementation status still lists WooCommerce / Amazon as **Planned after Shopify**.

**Owner disposition D12 ACCEPT:** Shopify-first live sequence remains authoritative.

### 1.9 Hosted vs local drift note (compatibility)

Hosted migration ledger historically pinned at **52** migrations (`IMPLEMENTATION_STATUS.md`). CONN-1a / CONN-1c-α migrations are newer additive files on `main` and are **not** claimed hosted-applied by this proposal. Multi-provider work must not assume hosted vault availability. Production runtime and hosted migrations remain **BLOCKED**.

---

## 2. Proposed provider and connection contracts

### 2.A Provider registry

**Decision class: ADDITIVE** (registry catalog + dual readiness layers).
**CONTRACT_CHANGE_REQUIRED** only for extending `ProviderType` / SQL provider CHECKs to add `amazon`, `noon` (and later approved locals). Do **not** overload `'other'`.

#### Provider identity ≠ merchant connection identity

| Concept | Identity | Durable home |
|---|---|---|
| **Provider** | Platform capability descriptor (`shopify`, `amazon`, …) | Code + versioned registry document/table (proposed) |
| **Merchant connection** | One `integrations` row | Existing M2.6 `integrations` |
| **External account ownership** | Verified `(provider, external_account_id \| external_handle)` — provider-specific uniqueness rules deferred where noted | Existing `integration_external_accounts` |
| **External resource binding** | ProviderBinding key | Existing M0.7.8 / M2.6 |

#### Dual readiness model (D2 AMEND)

Architecture/implementation readiness is **separate** from merchant-facing connect availability.

| Layer | Purpose | Examples |
|---|---|---|
| **Architecture / implementation readiness** | What StoreAgent has designed, scaffolded, or offline-proven | Contracts frozen; offline adapters; vault schema present; Shopify RO.* offline PASS |
| **Merchant-facing connect availability** | What the product may honestly offer as Connect | Requires runtime security, authorization, and provider-specific readiness gates to pass |

**Hard rule:** No merchant-facing **`connect_available` / “supported → Connect”** claim until **all** of the following pass for that provider in the target environment:

1. Runtime security boundary (server-only credentials; no plaintext in configuration; redaction)
2. Authorization / tenant binding verified for credential and connection ops (Shopify today: CONN-1c-α remains **`NOT_YET_VERIFIED`**)
3. Provider-specific readiness (OAuth or guided credential path authorized; transport/normalizer gates for claimed resources; honesty about approval programs)

Until then, UX may show roadmap/planned/coming-soon or import fallback — **not** Connect.

#### Registry state vocabularies

**Implementation readiness (internal / docs):**

| State | Meaning |
|---|---|
| `architecture_proposed` | Spec only |
| `offline_scaffolded` | Adapters/transport offline or mocked |
| `runtime_gated` | Code may exist but production/runtime gates incomplete |
| `runtime_ready` | Security + authorization + provider readiness gates passed for a named environment |

**Merchant-facing connect availability (product UX):**

| State | Merchant meaning | Connect UX |
|---|---|---|
| `connect_available` | Connect path authorized for this environment | Connect → Authorize → Confirm **or** guided credentials (honest to auth model) |
| `planned` | On roadmap; not connectable | Coming soon; CSV/import fallback |
| `approval_required` | Platform/partner approval or merchant credential provisioning still required | Guided explanation; **no** Connect claim that skips approval |
| `unavailable` | Explicitly not offered | Hidden or disabled; CSV fallback |

Country-specific **recommendations** bias ordering and messaging. They **must not** hard-block a provider that is otherwise `connect_available` solely because org country differs (owner may later add compliance deny-lists as a separate gate). **D3 ACCEPT.**

#### Initial registry rows (proposal — amended honesty)

| `provider_id` | Implementation readiness | Merchant connect availability | Notes |
|---|---|---|---|
| `csv` | Import path exists (local) | Import available as fallback — **not** a live-channel Connect slot | Separate usage/storage limits (D5); not billed here |
| `shopify` | Offline RO.1–RO.3 + CONN-1a/1b/1c-α foundation; OAuth/SyncRun **gated** | **`unavailable` / `planned` for Connect** until CONN-2+ **and** binding authorization verified | Do **not** claim Connect from architecture alone |
| `woocommerce` | Architecture proposed | `planned` (may become `approval_required` if self-hosted complexity demands) | Consumer key/secret; needs credential-profile contract |
| `amazon` | Architecture proposed | `planned` / `approval_required` | Seller ≠ region ≠ marketplace ≠ inventory scope (D8) |
| `noon` | Architecture proposed | `planned` / `approval_required` | Partner facts TBD (**D9 ACCEPT** keep approval honesty) |
| `square` / `lightspeed` | Reserved tokens only | `unavailable` until owner promotes | Already in CHECK; no connector claim |
| Future local marketplace | Architecture only after owner approval | `approval_required` until authorized | Explicit registry entry required |

**REUSE:** Adapter isolation directories (`lib/providers/{provider}/`), SyncRun, ProviderBinding.
**ADDITIVE:** Versioned `ProviderRegistry` with dual readiness layers (docs first).
**CONTRACT_CHANGE_REQUIRED:** Add `amazon` and `noon` to `ProviderType` and all provider CHECKs in lockstep when first needed (**D1 ACCEPT**).

### 2.B Merchant connection model

**Decision class: mostly REUSE + ADDITIVE configuration.**

#### Cardinality

| Rule | Class | Detail |
|---|---|---|
| Multiple connections per org | **REUSE** | Already allowed by M2.6 |
| Multiple accounts same provider | **REUSE** | Same |
| Live-channel plan limit (example: 3) | **ADDITIVE** (entitlement) | Enforce in entitlement layer only — **never** a DB CHECK of `count(*) <= 3` (**D4 ACCEPT**) |
| CSV / import usage | **ADDITIVE** (separate limits) | Does **not** consume live-channel entitlement slots (**D5 AMEND**); reserve separate usage/storage limits; **do not implement billing** in this track |
| One vault row per connection | **REUSE** | CONN-1a uniqueness |
| One external-account ownership row per connection | **REUSE** | CONN-1a uniqueness |

#### Proposed connection profile (non-secret)

Store in `integrations.configuration` and/or dedicated nullable columns later (columns only if JSON becomes unsafe for constraints):

| Field | Purpose |
|---|---|
| `provider` | Canonical provider id (column already) |
| `marketplace_id` / `region` / auth region | Non-secret; **must not collapse distinct Amazon dimensions** (D8) |
| `external_account_id` / handle | Mirrored for UX; **authoritative ownership remains** `integration_external_accounts` once uniqueness rules are frozen per provider |
| `api_version` / adapter version pins | Non-secret transport pins |
| `granted_scopes` / permission summary | Non-secret; tokens stay in vault |
| `store_id` | Optional binding to canonical Store (existing) |
| Inventory / fulfillment scope metadata | Non-secret descriptors of what stock/fulfillment this connection observes (D8 / D11) |

#### Amazon identity dimensions (D8 AMEND) — distinct, uniqueness deferred

For Amazon, the following are **architecturally distinct** and must not be collapsed into one opaque handle prematurely:

| Dimension | Role |
|---|---|
| Seller / account identity | Who authorized StoreAgent |
| SP-API authorization region | Which API endpoint/auth region applies |
| Marketplace id(s) | Where the merchant sells (may be many under one auth) |
| Inventory / fulfillment scope | What stock pools / fulfillment programs this connection observes (e.g. FBA vs FBM / location mapping) |

**Exact global ownership uniqueness** for Amazon external accounts is **deferred** until an Amazon security preflight (CONN-0-style) freezes the key. Do not invent composite uniqueness in MP-0 beyond this separation requirement.

#### Tenant isolation, ownership, disconnect/reconnect

**REUSE** CONN-0 / CONN-1 rules generalized (Shopify-proven patterns; other providers inherit after their security preflight):

1. Tenant comes from StoreAgent `TenantContext` / trusted integration — never from marketplace account alone.
2. Active global ownership uniqueness applies where provider-specific rules are frozen (Shopify today); Amazon uniqueness deferred (D8).
3. Cross-org claim → **DENY** when uniqueness is defined.
4. Same-org reconnect matching verified identity → rotate vault; **preserve** `integrations.id`.
5. Disconnect / revoke → clear vault credentials; set integration `disconnected`/`revoked`; Phase A releases uniqueness (production retention **D13 DEFER** — unresolved).
6. Service-role vault access remains org-scoped; CONN-1c-α production binding remains **`NOT_YET_VERIFIED`** (**D15 ACCEPT**).

#### Entitlement sketch (non-implementation; D4 ACCEPT + D5 AMEND)

```text
plan.max_active_live_channel_connections (example default 3)
  -> evaluated at live-channel connect-intent time
  -> counts live-channel integrations in {pending, active, degraded}
     (exact status set owner-approved at entitlement implementation)
  -> CSV / approved import does NOT consume these slots
  -> CSV/import governed by separate usage and/or storage limits (TBD)
  -> billing product NOT implemented in this architecture track
```

**Non-goal:** Hardcoding three in Postgres. **Non-goal:** Implementing billing.

---

## 3. Credential capability matrix

### 3.1 Provider auth shapes (architecture comparison)

| Provider | Auth model (high level) | Secret material | Rotation / expiry | Connect UX reality |
|---|---|---|---|---|
| **Shopify** | Standalone OAuth; **expiring offline** access + refresh | Access + refresh tokens | Refresh rotation; hard fail → clear vault + re-OAuth | Connect only after CONN-2+ **and** authorization verified |
| **Amazon** | Login with Amazon (LWA) + Selling Partner API | LWA refresh (+ access); possibly restricted data tokens | Refresh grants; **auth region** scoped separately from marketplaces | Often `approval_required`; seller/region/marketplace/scope distinct |
| **Noon** | Partner / seller API credentials (exact product flow owner-gated) | API keys and/or OAuth-like secrets per Noon program | Provider-specific; may be long-lived keys | Guided credential entry + approval; **no fictional one-click** |
| **WooCommerce** | REST API keys (consumer key/secret) over HTTPS store URL | Two long-lived secrets; optional app password variants | Usually manual revoke/recreate | Guided setup only when connect availability gates pass |
| **CSV** | No provider credential | N/A | N/A | Import mapping workflow (existing) |

### 3.2 What CONN-1 already reusable vs what must extend

| CONN-1 capability | Shopify offline_expiring | Amazon LWA | Noon credentials | WooCommerce keys |
|---|---|---|---|---|
| Dedicated `integration_credentials` table | **REUSE** | **REUSE** | **REUSE** | **REUSE** |
| AES-256-GCM + DEK/KEK envelope | **REUSE** | **REUSE** | **REUSE** | **REUSE** |
| AAD binding org/integration/provider/token_kind/key_version | **REUSE** | **REUSE** | **REUSE** | **REUSE** |
| RLS deny browser; RPC-only mutate posture | **REUSE** | **REUSE** | **REUSE** | **REUSE** |
| `integration_external_accounts` ownership | **REUSE** (shop id/domain) | **ADDITIVE** after Amazon security preflight (D8) | **ADDITIVE** Noon handle rules | **ADDITIVE** store-host rules |
| `token_kind = offline_expiring` only | Fits | **CONTRACT_CHANGE_REQUIRED** — new kinds via credential-profile contract | **CONTRACT_CHANGE_REQUIRED** | **CONTRACT_CHANGE_REQUIRED** |
| Column semantics | access + refresh purposes | Must not overload refresh purpose for unrelated secrets (**D7**) | Same | Same |
| CONN-1c-α load/replace/clear RPCs | Shopify-shaped validation in α | Generalize only after credential-profile + migration compatibility freeze | Same | Same |
| Never store plaintext in `configuration` | **REUSE** — absolute | Absolute | Absolute | Absolute |

### 3.3 Credential purpose separation and later credential-profile contract (D6 ACCEPT + D7 AMEND)

**Frozen now (architecture law):**

1. Credential **purposes** are explicit (examples: `access_token`, `refresh_token`, `consumer_key`, `consumer_secret`, `api_key`, …).
2. **No silent reuse** of refresh-token semantics, rotation rules, or AAD seal-purpose meaning for API-key / static-secret material.
3. Shopify `offline_expiring` remains as defined; do not redefine it to mean “any two secrets.”
4. Physical storage may still use the provider-neutral vault table and AEAD envelope (**REUSE**), but mapping from purpose → sealed field is defined only by a **credential-profile contract**, not by informal column nickname reuse.

**Required before any non-Shopify vault write coding:**

| Prerequisite | Content |
|---|---|
| Credential-profile contract | Per `token_kind` / profile: which purposes exist; which are required; rotation/replace rules; expiry fields |
| Authenticated binding rules | How purposes bind into AAD / seal purpose / profile id so decrypt cannot cross-purpose |
| Migration compatibility | How additive `token_kind` values and profiles interact with CONN-1a CHECKs, CONN-1c RPCs, and rollback |
| Owner authorization | Separate implementation slice after contract freeze |

Illustrative future kinds (names not frozen until credential-profile contract):

| Illustrative `token_kind` | Typical providers | Notes |
|---|---|---|
| `offline_expiring` | Shopify | Existing; refresh purpose required |
| `oauth_refresh` | Amazon LWA (similar) | Refresh purpose required; access purpose optional/short-lived |
| `api_key_pair` | WooCommerce; some Noon flows | Two **key** purposes — **not** access/refresh semantics |
| `api_key_single` | Future | Single key purpose |

**CONTRACT_CHANGE_REQUIRED:** Expand `integration_credentials_token_kind_check` and generalize CONN-1c validation **only after** the credential-profile contract freezes (**D6 ACCEPT** under that sequencing).
**Preserve:** Do **not** assume all providers use Shopify’s offline_expiring format.

### 3.4 Production authorization fence (unchanged — D15 ACCEPT)

CONN-1c-α:

```text
CREDENTIAL_BINDING_AUTHORIZATION_STATUS = "NOT_YET_VERIFIED"
```

Multi-provider architecture **must not** claim production credential binding verified. Runtime credential ops remain blocked until a separate owner gate wires trusted `IntegrationOwnershipLookup` and re-verifies end-to-end. Production KEK custody product remains **D14 DEFER**.

---

## 4. Country-aware UX and onboarding flow

### 4.1 Principles

1. **Honest capability:** Never advertise Connect / one-click unless merchant-facing `connect_available` gates pass (D2). Never advertise one-click for `approval_required` or credential-paste providers.
2. **Recommend, don’t imprison:** Org country orders recommended marketplaces; `connect_available` providers remain selectable (**D3 ACCEPT**).
3. **Reuse Connect → Authorize → Confirm** wherever the platform supports browser OAuth **and** connect availability is true (Shopify first when gated work completes; Amazon when approved).
4. **Guided setup** for WooCommerce URL+keys, Noon partner credentials, and any `approval_required` provider.
5. **CSV / approved import** is the always-available fallback for non-connectable providers; it does not consume live-channel entitlement slots (**D5**).
6. Surface **connection health**: status, permissions/scopes, last sync, data completeness, quarantine counts — aligned with future CONN-6, not fake “100% synced” without SyncRun gates.

### 4.2 Proposed merchant flow

```text
Connections
  -> Choose country context (defaults from organization.country)
  -> Recommended providers (ranked) + connect_available + planned/approval_required
  -> If live-channel entitlement exhausted: upgrade / disconnect path (no silent connect)
     (CSV/import still offered under separate limits — billing not implemented)
  -> Branch by merchant-facing availability:
        connect_available + OAuth  -> Connect -> Authorize -> Confirm identity/scopes
        connect_available + keys   -> Guided credentials -> Verify read probe (later) -> Confirm
        approval_required          -> Explain approval steps -> Continue when ready -> Guided connect
        planned / unavailable      -> CSV/import fallback CTA
  -> Post-connect: map locations / inventory scope / confirm store binding / show freshness
```

### 4.3 Country recommendation examples (illustrative, not compliance law)

| Org country signal | Recommend first (when honestly available) | Also show | Fallback |
|---|---|---|---|
| AE / GCC | Noon, Amazon AE, Shopify, Woo (each only if connect/approval state allows) | CSV | CSV |
| US / CA / EU (general) | Shopify, Amazon regional, Woo | Noon as planned/optional | CSV |
| Unknown country | Shopify + Woo (global) when connectable; else planned cards | Marketplace cards marked regional | CSV |

Exact ranking tables are **ADDITIVE** product config; legal geo-blocks are a separate owner gate.

### 4.4 Connection health panel (minimum fields)

| Signal | Source |
|---|---|
| Integration status | `integrations.status` |
| Provider + marketplace / auth region / inventory scope | configuration / registry |
| External account handle | `integration_external_accounts` (when defined) |
| Permission/scope summary | non-secret scope string |
| Last SyncRun outcome | `sync_runs` (when CONN-5+) |
| Completeness / quarantine | SyncRun counts + data-quality issues |
| Credential health | expiry flags / degraded reasons — **never** tokens |

---

## 5. Cross-channel inventory correctness rules

**Goal:** One canonical inventory intelligence workspace — **not** one calculation engine per channel.

### 5.1 REUSE existing engines

| Concern | Authority | Rule |
|---|---|---|
| Normalization | `PROVIDER_ADAPTERS.md` | Provider quirks end at adapter boundary |
| Binding | M0.7.8 / M2.6 | Idempotent per integration namespace |
| Inventory semantics | M0.7.5 | on_hand / available / committed / incoming not interchangeable; missing stays null |
| Incoming trust | M0.4 / formulas | Provider-observed incoming ≠ trusted PO incoming |
| Metrics | M5 / `INVENTORY_FORMULAS.md` | Deterministic; unknown ≠ zero; Location-required grain preserved |
| Decisions | M7 contracts | Consume canonical facts only; production create blocked |

### 5.2 Proposed multi-channel correctness rules (ADDITIVE product policy)

1. **Channel demand is additive by sales channel; stock is not.**
   Orders from Shopify + Amazon + Noon may all contribute to demand **only after** normalizing into canonical order/order_item rows with distinct ProviderBindings. Inventory quantities that represent the **same physical stock** must not be summed across authorities.

2. **Canonical Location remains the inventory location grain.**
   Provider locations / FBA nodes / warehouses map into StoreAgent `Location` via ProviderBinding. Silent aggregation across locations remains forbidden (CONN-0 invariant 8). M5 continues to require organization/store/**location**/variant/date/algorithm.

3. **Cross-channel variant matches are suggestions only (D10 AMEND).**
   M2 permits duplicate SKUs. Multi-provider must:
   - keep per-integration ProviderBindings;
   - may **suggest** possible cross-channel variant matches (SKU, barcode, title signals);
   - require **explicit merchant confirmation** before any durable link;
   - **never** automatically merge variants based solely on matching identifiers;
   - **never** quarantine solely because identifiers match across channels (matching ≠ conflict).

4. **Inventory authority may be Location-scoped or finer (D11 AMEND).**
   When multiple channels observe stock:
   - designate inventory authority at **Location** grain by default;
   - allow **item / inventory-pool** granularity where necessary (e.g. one channel authoritative for a subset of variants or a named fulfillment pool at a Location);
   - at most one authority may contribute canonical on-hand/available (etc.) for a given authority grain;
   - other connections may contribute demand/catalog only for that grain;
   - conflicting dual authorities → reconciliation / degraded completeness, **not** averaged stock;
   - **never double-count shared physical stock**;
   - finer authority must still project into canonical Location + M5 invariants (no parallel metric engine, no null-location M5 rows).

5. **Missing / stale / incomplete channel data must be visible.**
   Sync incompleteness, quarantine, and freshness labels remain first-class. Metrics and decisions abstain or stay partial rather than inventing stock/demand. Incomplete evidence ≠ SyncRun complete (Shopify RO.3 / CONN-5 law generalized).

6. **No parallel ROQ / velocity / decision engines per provider.**
   All channels feed canonical domain → single M5/M6/M7 path.

### 5.3 Resource coverage expectation

Adapters (when authorized per provider) normalize into existing canonical resources:

`product`, `product_variant`, `location`, `inventory` (snapshots), `order`, `order_item`, `return_refund`, and later PO resources as supported — matching `ProviderResourceType`.

---

## 6. Compatibility assessment with existing frozen code

| Area | Verdict | Notes |
|---|---|---|
| M2.6 multiple integrations / same provider | **Compatible (REUSE)** | No org+provider uniqueness |
| Live-channel plan limit of three | **Compatible if ADDITIVE entitlement** | Must not add DB count CHECK; CSV excluded from live-channel quota (D5) |
| Separate CSV usage/storage limits | **Compatible (ADDITIVE)** | Not implemented here; billing not in this track |
| Provider CHECK / `ProviderType` | **Incompatible until CONTRACT_CHANGE** for Amazon/Noon | WooCommerce already present; D1 ACCEPT when first needed |
| CONN-1 vault storage/crypto | **Compatible (REUSE)** | Provider-neutral by design |
| `token_kind` CHECK | **Incompatible for non-Shopify secrets until CONTRACT_CHANGE** | Only after credential-profile contract (D6/D7) |
| Silent reuse of refresh columns for API keys | **Incompatible with D7** | Forbidden; profile contract required |
| CONN-1c-α RPCs | **Partially compatible** | Shopify offline_expiring only; generalization later; **`NOT_YET_VERIFIED` preserved** |
| `integration_external_accounts` | **Compatible for Shopify; Amazon uniqueness deferred (D8)** | Non-Shopify handles allowed if lowercase non-blank; Amazon key TBD in security preflight |
| PROVIDER_ADAPTERS / RO.* Shopify | **Compatible** | Shopify-first live path (D12) |
| Canonical M5–M7 | **Compatible if no parallel engines** | D11 finer authority must preserve Location + M5 grain |
| Auto SKU merge / match-only quarantine | **Rejected by D10** | Suggestions + explicit confirm only |
| CSV fallback | **Compatible (REUSE)** | Not a live-channel entitlement consumer |
| CONN-0 Shopify milestone order | **Compatible (D12 ACCEPT)** | Do not leapfrog Shopify CONN-2…5 for live Amazon/Noon |
| Hosted vault / production runtime | **BLOCKED / not assumed** | CONN-1a/1c not claimed hosted |
| Production credential binding | **`NOT_YET_VERIFIED` preserved (D15)** | |
| Production revoke-retention (CONN-1 §4) | **Unresolved (D13 DEFER)** | Phase A default unchanged |
| Production KEK custody (CONN-1 §6) | **Unresolved (D14 DEFER)** | Remains gated |

---

## 7. Decisions D1–D15 — owner-directed disposition

Amended proposal status: **ACCEPTED — DOCS-ONLY ARCHITECTURE FREEZE**; D13/D14 remain deferred.
D1–D15 dispositions below are owner-directed for this amendment pass; they do **not** by themselves mean the amended document is accepted.

| ID | Decision (amended text where applicable) | Class | Disposition |
|---|---|---|---|
| **D1** | Add `amazon` and `noon` to `ProviderType` + all SQL provider CHECKs in one coordinated migration when first needed; forbid long-term `'other'` for them | CONTRACT_CHANGE_REQUIRED | **ACCEPT** |
| **D2** | Versioned Provider Registry with **dual layers**: architecture/implementation readiness vs merchant-facing connect availability; no Connect/`connect_available` claim until runtime security, authorization, and provider-specific readiness pass | ADDITIVE | **AMEND** |
| **D3** | Country recommends but does not restrict `connect_available` providers (unless separate compliance deny-list) | ADDITIVE | **ACCEPT** |
| **D4** | Live-channel connection limits are entitlements only (example: 3 active); never DB hard-cap | ADDITIVE | **ACCEPT** |
| **D5** | CSV/import does **not** consume live-channel entitlement slots; reserve separate usage/storage limits; **do not implement billing** in this track | ADDITIVE | **AMEND** |
| **D6** | Expand `token_kind` vocabulary and generalize vault validation **after** credential-profile contract freeze | CONTRACT_CHANGE_REQUIRED | **ACCEPT** |
| **D7** | Freeze credential **purpose** separation; no silent reuse of refresh-token semantics for API-key material; require credential-profile contract, authenticated binding rules, and migration compatibility before coding | ADDITIVE (gates CONTRACT_CHANGE) | **AMEND** |
| **D8** | Amazon seller identity, SP-API authorization region, marketplaces, and inventory/fulfillment scope are distinct; **defer** exact ownership uniqueness until Amazon security preflight | ADDITIVE | **AMEND** |
| **D9** | Noon remains `planned` / `approval_required` until partner/credential facts are verified; no fictional one-click | ADDITIVE | **ACCEPT** |
| **D10** | Cross-channel variant matches are **suggestions only**; explicit merchant confirmation required before linking; no automatic SKU merge; no quarantine solely from matching identifiers | ADDITIVE | **AMEND** |
| **D11** | Inventory authority supports Location default and **item/inventory-pool** granularity where needed; preserve canonical Location + M5 invariants; never double-count shared physical stock | ADDITIVE | **AMEND** |
| **D12** | Shopify-first live milestone sequence (CONN-2…6 before Amazon/Noon live); docs/scaffold for others allowed after MP-0 acceptance | ADDITIVE | **ACCEPT** |
| **D13** | Production revoke-retention for external accounts (CONN-1 §4) | CONTRACT unresolved (existing) | **DEFER** |
| **D14** | Production KEK custody product (CONN-1 §6) | CONTRACT unresolved (existing) | **DEFER** |
| **D15** | Preserve CONN-1c-α `NOT_YET_VERIFIED` until dedicated authorization slice | REUSE | **ACCEPT** |

---

## 8. Recommended phased milestone order

All slices remain **separately owner-authorized**. This proposal does not start them.
**D12 ACCEPT:** Shopify live path before Amazon/Noon live.

| Phase | ID | Scope | Depends on | Explicit non-goals |
|---|---|---|---|---|
| **0** | **CONN-MP-0** (this doc) | Multi-provider architecture freeze (amended) | Baseline `a918217` | Implementation; claiming full-document acceptance until owner ACCEPT |
| **1** | CONN-MP-1 | Provider registry dual-readiness contract + UX honesty rules; live-channel vs CSV limit rules (docs/scaffold; **no billing**) | Owner ACCEPT of amended MP-0 | OAuth, vault writes, hosted, Connect claims |
| **2** | Shopify CONN-1c-β → CONN-2…CONN-6 | Credential runtime + OAuth + webhooks + live cert + SyncRun + health; only then Shopify `connect_available` | Existing CONN-0/1 gates; **binding authorization verified** | Amazon/Noon/Woo live; hosted without separate gate |
| **3** | CONN-MP-CRED | Credential-profile contract + purpose binding + migration compatibility + token_kind expansion design | MP-0 D6/D7; CONN-1a/1b/1c-α preserved | Provider network calls; coding before contract freeze |
| **4** | WooCommerce-0/1 | Adapter boundary + profile-backed vault kind + guided connect design → offline normalizers → transport | MP-CRED; M0.7 law; connect gates | Purchasing writeback; Connect before readiness |
| **5a** | Amazon-SEC-0 | Amazon security preflight: seller / auth region / marketplace / inventory-scope separation + ownership uniqueness proposal | MP-0 D8; MP-CRED | Live SP-API; inventing uniqueness without preflight |
| **5b** | Amazon-0/1 | Offline adapters → later connect path | Amazon-SEC-0; partner approval reality | Claiming SP-API production without approval |
| **6** | Noon-0/1 | Local marketplace architecture + guided credentials | MP-CRED; owner Noon program facts (D9) | Fake one-click |
| **7** | CONN-MP-XINV | Cross-channel **suggestion + confirm** linking + inventory-authority (Location and item/pool) implementation | Canonical domain; ≥2 channels with data; D10/D11 | Auto-merge; match-only quarantine; parallel metric engines |
| **8** | Future locals | Approval-gated registry entries | Owner provider approval | Silent Connect enable |

**Ordering rationale:** Preserve Shopify as the first live OAuth/SyncRun proof; freeze multi-provider identity/credential/UX rules early without claiming Connect; require credential-profile and Amazon security preflight before those providers write vault rows or assert ownership uniqueness.

---

## 9. Risks, STOP gates, and explicit non-goals

### 9.1 Risks

| Risk | Mitigation |
|---|---|
| Treating `'other'` as Amazon/Noon | D1 provider tokens |
| Claiming Connect from architecture alone | Dual readiness (D2) |
| Hardcoding `max 3` in DB | Entitlement-only (D4) |
| CSV consuming live-channel slots / sneaking billing | D5 separate limits; no billing in this track |
| Assuming all tokens are Shopify offline_expiring | D6 + credential-profile (D7) |
| Silent reuse of refresh columns for API keys | D7 purpose separation |
| Collapsing Amazon seller/region/marketplace/scope | D8 distinct dimensions + Amazon-SEC-0 |
| Double-counting multi-channel stock | D11 authority grains; never average conflicts |
| Auto-merging or match-only quarantining SKUs | D10 suggestions + explicit confirm |
| Claiming production vault binding ready | D15 `NOT_YET_VERIFIED` |
| Parallel per-channel engines | Forbidden by PROVIDER_ADAPTERS / M5–M7 |
| Country lockouts blocking real merchants | Recommend-only (D3) |
| Fake one-click for Noon/Amazon | `approval_required` + honest UX (D9) |
| Hosted/runtime assumed ready | Explicit BLOCKED; D13/D14 deferred |

### 9.2 STOP gates

1. **STOP** — no implementation until owner **ACCEPT** of this **amended** document (READY FOR OWNER ACCEPTANCE ≠ accepted).
2. **STOP** — no CONN-1c-β, production resolver, OAuth, or provider network calls under MP-0 alone.
3. **STOP** — no weakening of CONN-1a/1b/1c-α frozen implementations; no plaintext in configuration; no browser vault read; no cross-org ownership bypass.
4. **STOP** — no M6 production forecast / M7 create / workers / JWT unlock / hosted migration apply.
5. **STOP** — no credential-profile coding or `token_kind` migration before CONN-MP-CRED freeze.
6. **STOP** — no Amazon ownership uniqueness DDL before Amazon-SEC-0.
7. **STOP** — no merchant Connect claim without D2 readiness gates.
8. **STOP** — do not flip Shopify live nested completeness or SyncRun complete falsely.
9. **STOP** — D13/D14 remain deferred; do not silently resolve them here.

### 9.3 Explicit non-goals (MP-0)

- Application code, SQL migrations, tests
- Production resolver / CONN-1c-β
- OAuth or live Shopify/Amazon/Noon/Woo HTTP
- Live credentials, hosted DB apply, KEK wiring
- Workers, JWT, M6/M7 activation
- Billing product implementation
- Warehouse transfer optimization / OMS replacement
- Write-back purchasing to channels
- Claiming App Store / SP-API / Noon production approval
- Claiming this amended proposal is already owner-accepted

---

## 10. Decision classification summary

| Theme | REUSE | ADDITIVE | CONTRACT_CHANGE_REQUIRED |
|---|---|---|---|
| Provider registry & availability | Adapter dirs, SyncRun | Dual readiness layers; country ranking | `amazon`/`noon` in ProviderType + CHECKs (D1) |
| Merchant connections | `integrations`, multi-account | Live-channel entitlements; separate CSV limits; Amazon dimension fields | Amazon ownership uniqueness after SEC-0 |
| Credentials | Vault table, AEAD, Shopify ownership, RLS | Credential-profile contract; purpose separation (D7) | Expand `token_kind` CHECK + RPC validation after profile freeze (D6) |
| Normalization / engines | M0.7, M5–M7, CSV/Shopify packages | Suggest+confirm links; Location + item/pool authority | Reject parallel engines |
| UX | Future CONN-6 health direction | Honest connect gates; guided setup; CSV fallback | — |

---

## 11. Acceptance / STOP

**Status:** ACCEPTED — DOCS-ONLY ARCHITECTURE FREEZE; D13/D14 DEFERRED; implementation separately gated

Owner must explicitly **ACCEPT**, **AMEND**, or **REJECT** this amended document before any multi-provider implementation slice.

**STOP FOR OWNER REVIEW.** Do not implement CONN-MP-1+, credential-profile coding, token_kind migrations, OAuth, provider adapters beyond existing Shopify/CSV law, hosted apply, workers, JWT, or M6/M7 under this proposal alone. Do not claim the amended proposal is already owner-accepted.
