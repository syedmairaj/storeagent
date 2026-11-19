# Shopify-RO.2 Read-Only GraphQL Transport

**As-of:** 2026-11-18
**Transport version:** `shopify-ro.2-v1`
**Pinned Admin API version:** `2026-10`
**Baseline:** RO.1 offline normalizers at `0072a04` (`shopify-ro.1-v1`)

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
- change RO.1 normalizer mappings
- enable workers/cron/JWT/M7
- alter the canonical engine

## Separation of concerns

```
injectable HTTP
  -> ShopifyRo2GraphqlTransport (this milestone)
  -> raw GraphQL page nodes (unknown / provider-observed)
  -> RO.1 normalizers (unchanged)
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

### Required RO.1 mapping / fixture changes (NOT applied in RO.2)

RO.2 does **not** silently alter RO.1. Owner review required before changing `shopify-ro.1-v1`:

1. **Order line location**
   Admin API `LineItem` has **no** `location` field on `2026-10`.
   RO.1 fixtures/normalizer accept `lineItem.location.id`.
   Live transport must derive location from
   `Order.fulfillmentOrders[].assignedLocation.location.id` joined through
   `fulfillmentOrder.lineItems[].lineItem.id`.
   **Action:** redesign RO.1 order-line location provenance (adapter version bump).

2. **Variant currency field**
   `ProductVariant` has no `currency` / `priceCurrencyCode` field.
   Currency is shop default (`Shop.currencyCode`) or MoneyV2 on `inventoryItem.unitCost`.
   RO.1 fixtures invent `currency` beside `price`.
   **Action:** transport should supply shop currency alongside variant payloads before normalization; bump RO.1 if payload contract changes.

3. **Financial status `EXPIRED`**
   `OrderDisplayFinancialStatus` includes `EXPIRED` (not in RO.1 known list → quarantine today).
   **Action:** decide explicit mapping or keep fail-closed quarantine; document in mapping bump.

4. **Fulfillment statuses `FULFILLMENT_NOT_REQUIRED`, `REQUEST_DECLINED`**
   Present on `2026-10`; absent from RO.1 known list → quarantine.
   **Action:** decide mapping vs quarantine; bump adapter version if accepted.

5. **InventoryLevel.quantities argument**
   Schema requires `names: [String!]!`. Fixtures are post-selection shapes (OK offline) but are **not** live-query certified until consumers use RO.2 operations.

6. **InventoryItem.variant (singular) is deprecated on 2026-10**
   Prefer `InventoryItem.variants` connection. RO.2 transport queries `variants(first: 1)`.
   RO.1 fixtures still use `item.variant { id }` offline shapes.
   **Action:** when certifying fixtures, accept `variants.edges[0].node` (or keep a
   compatibility reader) and bump adapter version if canonical candidate construction changes.

7. **RO.1 fixtures remain uncertified as live response packs**
   `SHOPIFY_RO1_FIXTURES_API_VERSION_CERTIFIED = false` stays false until a follow-up certifies fixture packs against `2026-10` after the mapping changes above.

## Credentials / network policy

- Access tokens are ephemeral constructor inputs only.
- Transport never logs, returns, or persists tokens.
- Unit tests inject mock HTTP — no live Shopify requests.
- No OAuth, webhook, or SDK dependency in this milestone.

## Nested connection incompleteness (hard gate)

RO.2 top-level connections expose `pageInfo { hasNextPage endCursor }`.

Several nested connections are intentionally bounded with `first:N` and
**do not** request nested `pageInfo`:

| Parent operation | Nested selection | Bound |
|---|---|---|
| `products` | `variants` | `first: 100` |
| `inventoryItems` | `inventoryLevels` | `first: 50` |
| `inventoryItems` | `variants` | `first: 1` |
| `orders` | `lineItems` | `first: 100` |
| `orders` | `fulfillmentOrders` | `first: 20` |
| `orders` / FO | `fulfillmentOrders.lineItems` | `first: 100` |

**Hard gate for SyncRun / full-catalog acceptance:**

- A successful RO.2 page (or a finished top-level `iterateResource` loop)
  must **never** be interpreted as a complete catalog, inventory, or order
  sync while these nested bounds lack independent pagination evidence.
- Downstream SyncRun completion, reconciliation “synced”, or merchant
  “fully imported” claims are **forbidden** until nested connections are
  either (a) paginated with opaque cursors + pageInfo safeguards, or
  (b) explicitly attested incomplete / truncated with durable provenance.
- Top-level `hasNextPage: false` alone is insufficient completeness proof.

This gate is regression-tested in
`tests/unit/provider-shopify-transport.test.ts`
(`Shopify-RO.2 nested connection completeness gate`).

## Next acceptance gates (owner)

1. Review required RO.1 changes listed above; authorize adapter-version bump plan.
2. Certify RO.1 fixture packs against `2026-10` after mapping updates.
3. Separate milestone: OAuth / secure credential storage (still blocked).
4. Separate milestone: SyncRun persistence + incremental cursors — **blocked**
   on nested connection incompleteness hard gate above until resolved.
5. Keep JWT / workers / cron / M7 **BLOCKED**.
