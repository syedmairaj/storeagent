# Shopify-RO.2 Read-Only GraphQL Transport

**As-of:** 2026-11-18
**Transport version:** `shopify-ro.2-v1`
**Pinned Admin API version:** `2026-10`
**Baseline:** RO.1.2 offline normalizers (`shopify-ro.1.2-v1`) aligned to Admin API `2026-10`

## Scope

RO.2 defines a deterministic, injectable, **read-only** Shopify Admin GraphQL transport contract:

- pinned API version
- typed minimal query operations for approved resources
- injectable HTTP (no live network in tests; no SDK)
- cursor pagination safeguards
- throttling / cost-budget pacing
- bounded retries
- typed error classification

RO.2 does **not**:

- perform OAuth or store credentials
- call live Shopify endpoints from the repo test suite
- write to the database / SyncRun
- change normalizer mappings without an adapter-version bump
- enable workers/cron/JWT/M7
- alter the canonical engine

## Separation of concerns

```
injectable HTTP
  -> ShopifyRo2GraphqlTransport (this milestone)
  -> raw GraphQL page nodes (unknown / provider-observed)
  -> RO.1.2 normalizers (shopify-ro.1.2-v1 / 2026-10 shapes)
  -> binding / persistence (later)
  -> canonical domain / metrics / forecast / decisions
```

## API version pin

| Field | Value |
|---|---|
| Version | `2026-10` |
| Status at selection | Latest stable (Shopify versioning table, 2026-11-18) |
| Endpoint shape | `https://{shop}/admin/api/2026-10/graphql.json` |
| Source | Official Shopify Admin GraphQL docs + versioning schedule |

Constant: `SHOPIFY_ADMIN_API_VERSION` in `lib/providers/shopify/api-version.ts`.

## Approved read-only resources

| Operation | Root field | Purpose |
|---|---|---|
| `products` | `products` (+ nested `variants`, `shop.currencyCode`) | Catalog + variant identity/price |
| `locations` | `locations` | Location identity/status |
| `inventoryItems` | `inventoryItems` (+ nested `inventoryLevels.quantities`) | Variant+location inventory states |
| `orders` | `orders` (+ `lineItems`, `fulfillmentOrders`) | Demand + fulfillment location provenance |

Documents live in `lib/providers/shopify/operations.ts`. Mutations are forbidden.

Inventory quantity names requested explicitly (required by schema):

`on_hand`, `available`, `committed`, `incoming`

## Transport behavior

### Injectable HTTP

`ShopifyGraphqlHttp.request(...)` is required. Production may wrap a platform HTTP client later. Unit tests must inject mocks — the transport module never calls global `fetch`.

### Pagination safeguards

- cursors remain opaque (`normalizeShopifyCursor`)
- `pageSize` clamped to 1–250 (default 50)
- `maxPages` hard stop (default 100)
- repeated request cursor → `PAGINATION_CURSOR_LOOP`
- `hasNextPage: true` without `endCursor` → `MALFORMED_RESPONSE`

### Throttling / cost budget

Reads GraphQL `extensions.cost.throttleStatus`:

- `currentlyAvailable`
- `restoreRate`
- `maximumAvailable`

When available points fall below `minAvailableCostBudget` (default 50), transport waits for restore before continuing.

### Retries (bounded)

Retryable:

- HTTP `429`
- GraphQL `THROTTLED`
- HTTP `5xx`

Not retryable:

- `401` / `403`
- `MAX_COST_EXCEEDED`
- partial GraphQL errors
- malformed responses
- pagination guard failures

Default `maxRetries = 3`. Exhaustion → `RETRY_EXHAUSTED`.

Backoff uses `Retry-After` header, GraphQL `extensions.retryAfter`, or exponential base backoff (min 1s, max 30s).

### Error codes

`AUTH_UNAUTHORIZED`, `AUTH_FORBIDDEN`, `HTTP_RATE_LIMITED`, `GRAPHQL_THROTTLED`, `MAX_COST_EXCEEDED`, `PARTIAL_GRAPHQL_ERRORS`, `MALFORMED_RESPONSE`, `PAGINATION_CURSOR_LOOP`, `PAGINATION_PAGE_LIMIT`, `RETRY_EXHAUSTED`, `HTTP_ERROR`, `TRANSPORT_MISCONFIGURED`.

## Schema verification vs RO.1 fixtures (2026-10)

Official schema pages consulted (no live shop calls):

- InventoryLevel / InventoryQuantity
- MoneyV2
- LineItem / Order / FulfillmentOrder / FulfillmentOrderAssignedLocation
- ProductVariant
- OrderDisplayFinancialStatus / OrderDisplayFulfillmentStatus
- GraphQL Admin rate-limit / cost extensions

### Assumptions that hold

| Assumption | Verdict |
|---|---|
| MoneyV2 `{ amount, currencyCode }` with decimal string amounts | **OK** — prefer string amounts; floats fail closed in RO.1 |
| MoneyBag.shopMoney for order totals | **OK** |
| Inventory quantity names `on_hand` / `available` / `committed` / `incoming` | **OK** — must be requested via `quantities(names: [...])` |
| Inventory is variant + location scoped via InventoryLevel | **OK** |
| `displayFinancialStatus` / `displayFulfillmentStatus` exist on Order | **OK** |
| ProductVariant.price is a shop-currency decimal scalar | **OK** (type `Money!`) |
| Location.isActive | **OK** |

### RO.1.2 mapping / fixture alignment (applied offline)

Shopify-RO.1.2 (`shopify-ro.1.2-v1`) applies the 2026-10 compatibility
updates below. RO.2 transport documents remain the query contract;
normalizers now consume the same shapes offline.

1. **Order line location** — **DONE (RO.1.2)**
   `LineItem.location` is rejected. Location comes only from
   `resolveShopifyOrderLineItemLocations` via FO
   `assignedLocation.location` **joined through**
   `fulfillmentOrder.lineItems[].lineItem.id`.
   `assignedLocation` alone never stamps sales lines.

2. **Variant currency field** — **DONE (RO.1.2)**
   Selling-price currency requires `Shop.currencyCode`
   (`normalizeShopifyProductVariantPayload(..., { shopCurrencyCode })`).
   Fabricated `currency` / `priceCurrencyCode` fields quarantine.
   Optional `inventoryItem.unitCost` MoneyV2 is accepted when present.

3. **Financial status `EXPIRED`** — **DONE (RO.1.2)**
   Recognized on the known list and **quarantined** conservatively
   (no invented cancelled/refunded mapping).

4. **Fulfillment statuses `FULFILLMENT_NOT_REQUIRED`, `REQUEST_DECLINED`**
   — **DONE (RO.1.2)**
   Recognized and **quarantined** conservatively.

5. **InventoryLevel.quantities argument**
   Schema requires `names: [String!]!` in live queries (RO.2). Offline
   fixtures remain post-selection named quantity arrays.

6. **InventoryItem.variant (singular)** — **DONE (RO.1.2)**
   Deprecated singular `variant` is rejected. Require
   `variants` connection with **exactly one** ProductVariant node;
   0 or >1 quarantines.

7. **Fixture certification limits**
   `SHOPIFY_RO1_FIXTURES_API_VERSION_CERTIFIED = true` for offline
   2026-10 **schema-shape** packs.
   `SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED = false` —
   global/live SyncRun nested completeness remains uncertified.
   RO.3 (`shopify-ro.3-v1`) implements offline nested pagination proof;
   `SHOPIFY_RO3_LIVE_NESTED_COMPLETENESS_CERTIFIED = false` until a
   separate live-certification gate.
   Still **not** live shop response packs (no network/OAuth).

## Credentials / network policy

- Access tokens are ephemeral constructor inputs only.
- Transport never logs, returns, or persists tokens.
- Unit tests inject mock HTTP — no live Shopify requests.
- No OAuth, webhook, or SDK dependency in this milestone.

## Nested connection incompleteness (hard gate)

RO.2 top-level connections expose `pageInfo { hasNextPage endCursor }`.

RO.3 (`shopify-ro.3-v1`) adds nested `pageInfo { hasNextPage endCursor }` on
required child connections and parent-scoped continuation queries so nested
cursors can be followed through the injectable RO.2 transport.

| Parent operation | Nested selection | Bound | RO.3 continuation |
|---|---|---|---|
| `products` | `variants` | `first: 100` | `product(id) { variants }` |
| `inventoryItems` | `inventoryLevels` | `first: 50` | `inventoryItem(id) { inventoryLevels }` |
| `inventoryItems` | `variants` | `first: 1` | cardinality check (never multi-page complete) |
| `orders` | `lineItems` | `first: 100` | `order(id) { lineItems }` |
| `orders` | `fulfillmentOrders` | `first: 20` | `order(id) { fulfillmentOrders }` |
| `orders` / FO | `fulfillmentOrders.lineItems` | `first: 100` | `fulfillmentOrder(id) { lineItems }` |

**Hard gate for SyncRun / full-catalog acceptance:**

- A successful RO.2 page (or a finished top-level `iterateResource` loop)
  must **never** be interpreted as a complete catalog, inventory, or order
  sync without RO.3 nested pagination proof (or explicit offline attestation).
- A full nested `first:N` page, top-level `hasNextPage: false`, or an empty
  partial page is **not** nested completeness proof by itself.
- Downstream SyncRun completion, reconciliation “synced”, or merchant
  “fully imported” claims remain **forbidden** until every required nested
  connection is proven complete (closed nested pageInfo after following
  opaque cursors) or durable incomplete attestation is recorded.
- Offline RO.3 unit PASS does **not** flip live-shop nested completeness
  certification (`SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED`
  remains `false`; `SHOPIFY_RO3_LIVE_NESTED_COMPLETENESS_CERTIFIED` is
  `false`).

Implementation: `lib/providers/shopify/nested-pagination.ts`
Regression: `tests/unit/provider-shopify-nested-pagination.test.ts` and
`tests/unit/provider-shopify-transport.test.ts`.

## Shopify-RO.3 nested pagination completeness

**As-of:** 2026-11-20
**Pagination version:** `shopify-ro.3-v1`
**Implementation status:** Offline nested pagination (`shopify-ro.3-v1`) is **implemented and unit-tested** under mocked HTTP. Live nested completeness certification (`SHOPIFY_RO3_LIVE_NESTED_COMPLETENESS_CERTIFIED = false`), OAuth, and SyncRun persistence/“complete” acceptance remain **blocked**.
**Transport:** reuses RO.2 injectable HTTP, throttle/retry/page-limit

RO.3 responsibilities:

- request nested `pageInfo` on approved child connections
- continue truncated children via read-only parent-scoped queries
- accumulate children deterministically per parent + connection identity
- detect repeated/missing cursors, page-limit exhaustion, partial GraphQL
  errors, malformed nodes, conflicting duplicates, parent mismatches
- handle `inventoryItem.variants` cardinality conservatively (exactly one)
- return per-connection completeness evidence and fail closed otherwise
- preserve opaque GIDs, parent-child links, FO line/location associations
- keep `incomingQuantityTrust=provider_observed` (no invented PO incoming)

RO.3 non-goals (still blocked):

- live Shopify calls / OAuth / credential storage
- SyncRun persistence or “complete” certification of live shops
- workers / cron / hosted JWT / M7
- purchasing / mutations / canonical formula changes

## Next acceptance gates (owner)

1. Shopify-RO.1.2 offline schema compatibility — **DONE** (`shopify-ro.1.2-v1`).
2. Nested connection pagination proof module — **DONE offline** (`shopify-ro.3-v1`).
   Live-shop nested completeness certification and SyncRun “complete”
   acceptance remain **blocked** until a separate live-certification gate.
3. Separate milestone: OAuth / secure credential storage (still blocked).
4. Separate milestone: SyncRun persistence + incremental cursors — **blocked**
   on live nested-completeness certification (offline RO.3 proof is a
   prerequisite, not sufficient).
5. Keep JWT / workers / cron / M7 **BLOCKED**.
