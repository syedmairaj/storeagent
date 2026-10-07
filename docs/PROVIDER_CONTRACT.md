# StoreAgent Provider Contract

## Purpose

Providers translate external commerce data into StoreAgent canonical semantics.

Providers are adapters.

They do not define StoreAgent's domain model or business logic.

## Conceptual contract

CommerceProvider supports:

- syncProducts(cursor?)
- syncInventory(cursor?)
- syncOrders(cursor?)
- syncReturns(cursor?)
- syncLocations(cursor?)
- syncPurchaseOrders(cursor?) when the provider supports it

## Initial providers

1. CsvProvider
2. ShopifyProvider

Future candidates:

- WooCommerce
- Square
- Lightspeed
- other POS/commerce systems

## Mandatory adapter responsibilities

Every adapter must:

- validate provider payloads
- identify source records deterministically
- normalize provider fields into canonical StoreAgent input
- resolve ProviderBinding
- preserve organization/store boundaries
- support retry/idempotency
- record SyncRun
- expose counts
- quarantine invalid or ambiguous records
- avoid silent data loss

## Adapter prohibition

Provider adapters must not calculate:

- reorder quantity
- forecast demand
- safety stock
- action priority
- stockout risk
- commercial confidence

Those belong to deterministic StoreAgent engines.

## Canonical parity

Equivalent provider data must normalize to equivalent canonical semantics.

CSV and Shopify should therefore produce comparable downstream:

provider data
-> canonical data
-> metrics
-> forecast
-> decisions

See:

docs/PROVIDER_BINDING_SEMANTICS.md
