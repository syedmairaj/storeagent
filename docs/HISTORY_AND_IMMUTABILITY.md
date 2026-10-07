# StoreAgent History and Immutability Model

## Purpose

StoreAgent must preserve historical truth.

Inventory decisions are only trustworthy when the system can explain:

- what data existed at the time
- which algorithm version was used
- what StoreAgent recommended
- what the merchant actually did
- what happened afterward

Historical evidence must not be silently rewritten.

## Current-state entities

These may change over time:

- Organization
- OrganizationMember
- Store
- Location
- Product
- ProductVariant
- Supplier
- SupplierProduct
- Integration
- NotificationPreference
- BillingEntitlement

## Immutable/history entities

These represent historical truth:

- InventorySnapshot
- completed Order historical facts
- OrderItem historical facts
- ReturnRefund
- SyncRun
- ForecastRun
- SkuForecast
- InventoryAction evidence
- ActionEvent

## Inventory snapshots

InventorySnapshot is append-only.

A new observation creates a new record.

Old snapshots are not rewritten.

## Orders and returns

Original order history remains intact.

Returns and refunds are separate events.

Example:

gross sold = 10
returned = 2
net retained = 8

Do not rewrite the original sale quantity from 10 to 8.

## Forecast history

ForecastRun and SkuForecast are versioned historical artifacts.

A new forecasting algorithm creates a new ForecastRun.

Historical forecasts must never be rewritten to improve apparent accuracy.

## Inventory actions

InventoryAction is a versioned recommendation.

After creation, original recommendation evidence is immutable, including:

- action type
- recommended quantity
- recommended action date
- confidence
- evidence snapshot
- forecast reference
- algorithm version
- creation timestamp

## Action supersession

A new recommendation supersedes an old one.

Do not rewrite the old recommendation.

Old action:
- status becomes superseded
- supersededByActionId references the new action

New action:
- gets new evidence
- gets new recommendation data
- keeps its own algorithm/version context

## Merchant actions

Merchant interaction belongs in ActionEvent.

ActionEvent is append-only.

Examples:

- accepted
- accepted_with_edit
- dismissed
- completed
- expired
- superseded

If the merchant edits quantity:

- original StoreAgent quantity remains unchanged
- merchant quantity is recorded separately

## Algorithm versioning

Any deterministic change that may alter commercial output requires a new algorithm version.

Examples:

- reorder formula
- forecast weighting
- demand trend
- confidence rules
- MOQ rounding

## Evidence versioning

InventoryAction.evidenceSnapshot represents the exact evidence available when the recommendation was created.

Later changes to inventory, supplier settings, demand, forecast, or merchant settings must not alter old evidence.

## Integration lifecycle

Disconnecting an integration does not destroy:

- historical orders
- inventory snapshots
- forecasts
- actions
- sync history

## Audit reconstruction

StoreAgent must eventually be able to reconstruct:

source data
-> canonical record
-> metrics
-> forecast
-> recommendation
-> evidence
-> merchant decision
-> outcome

## Future learning

Immutable history allows StoreAgent to compare:

StoreAgent recommended 40 units
vs
Merchant ordered 25 units
vs
Actual demand became 33 units

## M0.2.6 gate

Before this step closes:

- immutable entity classes are documented
- action evidence is immutable
- merchant events are append-only
- forecasts are versioned
- provider disconnect preserves history
- supersession replaces mutation
- algorithm versions are mandatory
