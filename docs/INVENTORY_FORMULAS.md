# StoreAgent Inventory Formula Specification

## Purpose

StoreAgent inventory decisions must be deterministic, reproducible and testable.

AI does not calculate inventory truth.

All inventory formulas must define:

- inputs
- outputs
- null/zero behavior
- assumptions
- edge cases
- algorithm version

---

## 1. Sales velocity

Sales velocity is units sold per day over a fixed lookback window.

Supported V1 windows:

- 7 days
- 14 days
- 30 days
- 90 days

Basic formula:

velocity =
net demand units
/
eligible demand days

Where:

net demand units =
sold units
- cancelled units
- configured returned units treatment

Stockout-censored days may later be excluded or adjusted according to the forecasting specification.

If there are no eligible demand days:

velocity = null

Zero demand over a valid window:

velocity = 0

Unknown demand history:

velocity = null

---

## 2. Days of stock

Days of stock estimates how many days current available inventory can support recent demand.

Formula:

daysOfStock =
availableQuantity
/
dailyDemand

Rules:

availableQuantity = null
-> daysOfStock = null

dailyDemand = null
-> daysOfStock = null

dailyDemand = 0
-> daysOfStock = null
-> reason code ZERO_DEMAND

availableQuantity = 0 and dailyDemand > 0
-> daysOfStock = 0

Infinity must not be persisted.

---

## 3. Safety stock

V1 safety stock supports a simple deterministic baseline.

Initial formula:

safetyStockUnits =
dailyDemand
*
safetyStockDays

Where:

safetyStockDays is merchant-configured or organization default.

Rules:

dailyDemand = null
-> safetyStockUnits = null

safetyStockDays = null
-> safetyStockUnits = null

Result is rounded upward to whole units.

Later statistical safety-stock models may replace this only after backtesting.

---

## 4. Reorder point

Reorder point represents the inventory position at which replenishment should begin.

Formula:

reorderPointUnits =
expectedLeadTimeDemand
+
safetyStockUnits

Where:

expectedLeadTimeDemand =
dailyDemand
*
leadTimeDays

Rules:

unknown lead time without trusted default
-> reorderPointUnits = null

unknown demand
-> reorderPointUnits = null

Result is rounded upward to whole units.

---

## 5. Target stock

Target stock represents desired inventory after replenishment.

Formula:

targetStockUnits =
dailyDemand
*
(leadTimeDays + reviewPeriodDays)
+
safetyStockUnits

Where:

reviewPeriodDays is merchant/store configuration.

Result is rounded upward to whole units.

---

## 6. Recommended order quantity

Base formula:

rawNeed =
targetStockUnits
- availableQuantity
- validIncomingQuantity

Then:

recommendedOrderQuantity =
max(0, rawNeed)

Rules:

targetStockUnits = null
-> recommendation unavailable

availableQuantity = null
-> recommendation unavailable

validIncomingQuantity = null
-> use 0 only when StoreAgent has explicitly determined there is no known incoming stock

Unknown incoming stock must not automatically become zero if source completeness is uncertain.

Supplier constraints are applied after base need is calculated.

---

## 7. Supplier MOQ

If MOQ exists and recommended need is positive:

final quantity must be at least MOQ.

Example:

raw need = 5
MOQ = 12

result = 12

MOQ must be a positive integer.

---

## 8. Pack-size rounding

If pack size exists:

recommended quantity must be rounded upward to a valid pack multiple.

Example:

raw need = 25
pack size = 6

result = 30

If both MOQ and pack size exist:

1. apply minimum order requirement
2. round upward to valid pack multiple

Example:

raw need = 5
MOQ = 12
pack size = 6

result = 12

Example:

raw need = 13
MOQ = 12
pack size = 6

result = 18

---

## 9. Incoming inventory

Only valid incoming inventory may reduce reorder need.

Valid incoming stock may include:

- confirmed purchase order quantity
- submitted/confirmed PO quantity according to policy
- partially received remaining quantity

Cancelled purchase orders contribute zero.

Fully received purchase orders are no longer incoming.

Unknown inbound state must reduce confidence.

---

## 10. Sell-through

V1 baseline:

sellThroughRate =
unitsSold
/
unitsAvailableForSale

The exact denominator must be consistent for the selected measurement window.

If denominator = 0:

sellThroughRate = null

Ratios use decimal form:

0.5 = 50%

---

## 11. Inventory age

Inventory age estimates how long stock has been held.

Preferred source:

receipt history

Fallback when receipt history is unavailable:

documented approximation

StoreAgent must expose whether inventory age is:

- exact
- estimated
- unavailable

Do not fabricate exact age from incomplete data.

---

## 12. Demand trend

V1 deterministic trend compares recent demand with a prior comparable window.

Conceptual example:

recent velocity
vs
prior velocity

Output:

- rising
- stable
- falling
- unknown

Thresholds must be explicitly versioned.

Do not classify trend when either comparison window has insufficient data.

---

## 13. Stockout risk

Stockout risk is based on whether expected inventory coverage is shorter than replenishment horizon.

Conceptual baseline:

daysOfStock
vs
leadTimeDays + safety/review buffer

Possible deterministic output later:

- high
- medium
- low
- unknown

Unknown lead time or demand reduces confidence.

---

## 14. Overstock risk

Overstock risk compares available + incoming stock with expected demand over a defined horizon.

Conceptual baseline:

inventoryPosition =
availableQuantity
+ validIncomingQuantity

If inventoryPosition materially exceeds expected demand + safety buffer:

overstock risk increases.

Thresholds must be versioned and backtested.

---

## 15. Null and zero rules

Null means unknown.

Zero means known zero.

Examples:

dailyDemand = null
-> unknown demand

dailyDemand = 0
-> known zero demand

incomingQuantity = null
-> incoming state unknown

incomingQuantity = 0
-> known zero incoming inventory

These meanings must never be mixed.

---

## 16. Integer rules

V1 inventory quantities are whole units.

All final recommended quantities must be integers.

Rounding direction:

- demand-derived stock thresholds: round upward
- reorder quantities: round upward when supplier constraints require it
- never round downward below required need

---

## 17. Negative values

Calculated reorder quantity may never be negative.

Use:

max(0, calculatedNeed)

Negative source inventory is a data-quality issue and should not silently participate in trusted calculation.

---

## 18. Formula provenance

Every important derived commercial value must eventually record:

- algorithm version
- source window
- calculation timestamp
- assumptions/defaults used
- reason codes when fallback/default behavior applies

---

## 19. Initial algorithm versions

Suggested initial version vocabulary:

sales-velocity-v1
days-of-stock-v1
safety-stock-v1
reorder-point-v1
target-stock-v1
order-quantity-v1
sell-through-v1
inventory-age-v1
demand-trend-v1
stockout-risk-v1
overstock-risk-v1

Any formula change that may alter commercial output requires a new version.

---

## M0.4 gate

Before formula architecture closes:

- formulas are deterministic
- null/zero behavior is explicit
- rounding rules are explicit
- incoming stock treatment is explicit
- supplier MOQ/pack rules are explicit
- algorithm versioning is explicit
- negative reorder quantities are impossible
- AI has no formula ownership


## M0.4.8 frozen V1 semantics

### Sell-through

V1 receives a trusted same-window `unitsAvailableForSale` denominator.

Formula:

sellThroughRate =
unitsSold / unitsAvailableForSale

Rules:

- denominator zero -> null
- known zero sales -> 0
- units sold greater than units available for sale -> data-quality failure
- result is stored as decimal ratio from 0 to 1

### Inventory age

V1 exposes inventory-age provenance.

Priority:

1. exact age from trusted receipt/inbound history
2. documented estimated age
3. unavailable

An estimate must never be presented as exact.

### Demand trend

`demand-trend-v1` compares recent daily demand with prior comparable daily demand.

Stable band:

-10% through +10%

Greater than +10% -> rising

Less than -10% -> falling

Inside the band -> stable

Both windows at zero -> stable.

Prior zero with positive recent demand -> rising, while relative change ratio remains undefined.

Unknown comparison input -> unknown.


## M0.4.9 frozen risk semantics

### Stockout risk V1

Inputs:

- days of stock
- lead time days
- safety-stock days

Classification:

- coverage <= lead time -> HIGH
- lead time < coverage <= lead time + safety-stock days -> MEDIUM
- coverage > lead time + safety-stock days -> LOW

Unknown coverage, lead time or safety-stock configuration produces unknown risk.

The classification must expose coverage and replenishment horizon as evidence.

### Overstock risk V1

Inventory position:

available inventory
+ valid incoming inventory

Compare inventory position with deterministic target stock.

Classification:

- position <= target -> LOW
- target < position <= 1.5 x target -> MEDIUM
- position > 1.5 x target -> HIGH

The 1.5 threshold belongs specifically to `overstock-risk-v1`.

It is not treated as universal inventory truth and may only change through a versioned algorithm revision supported by later backtesting.

If target stock is zero:

- zero inventory position -> LOW
- positive inventory position -> HIGH

No division-by-zero ratio is persisted.

Unknown inventory, target stock or incoming state produces unknown risk.


## M0.4.10 frozen supplier constraint semantics

Supplier constraints are applied only after deterministic base reorder need is known.

Order:

1. calculate base required quantity
2. if quantity is zero, keep zero
3. apply MOQ when positive need is below MOQ
4. round upward to the nearest pack-size multiple

Rules:

- MOQ must be a positive integer when present
- pack size must be a positive integer when present
- final quantity must never be lower than required need
- final quantity must never be lower than MOQ for a positive order
- final quantity must satisfy pack-size multiple when pack size exists
- supplier constraints never create an order from a zero base need

Examples:

need 5, MOQ 12, no pack -> 12

need 25, pack 6 -> 30

need 5, MOQ 12, pack 6 -> 12

need 13, MOQ 12, pack 6 -> 18


## M0.4.11 frozen incoming-stock semantics

Incoming stock may reduce reorder need only when its state is trustworthy.

Canonical purchase-order status treatment:

- draft -> 0 valid incoming
- submitted -> full ordered quantity counts
- confirmed -> full ordered quantity counts
- partially_received -> ordered minus received quantity
- received -> 0 valid incoming
- cancelled -> 0 valid incoming
- unknown -> incoming state unknown

For partially received orders, received quantity must be known.

If received quantity exceeds ordered quantity:

- do not produce negative incoming
- mark inbound state untrustworthy
- surface a data-quality reason
- do not suppress reorder need using that line

Aggregation rule:

If all relevant PO lines are trustworthy, sum their valid remaining incoming quantities.

If any relevant PO line is ambiguous or inconsistent, aggregate incoming state becomes unknown.

StoreAgent must not subtract a partial known incoming total when other inbound inventory for the same calculation scope is ambiguous.

An empty trusted set of incoming lines represents known zero incoming quantity.


## M5.1 frozen derived-metric contract

M5 calculates deterministic derived metrics. M6 owns forecast horizons, stockout censoring, and lost-sales estimation. M7 owns REORDER, REDUCE, PROMOTE, WATCH, recommended order quantity, and confidence. M5 does not persist risk labels, revenue, or supplier order constraints. Persisted storage is recorded in `IMPLEMENTATION_STATUS.md`.

### Grain and row lifetime

Initial persisted grain:

organization + store + location + variant + metric_date + algorithm_version

Location is required. M5 does not persist a null-location row or a store rollup.

`metric_date` is the store-local business date. Source timestamps remain UTC. The server timezone is not a commercial day boundary.

A row is a recomputable cache, not canonical truth. Recalculation of the same algorithm version may replace that row when canonical facts change. A new algorithm version inserts a distinct row and does not overwrite the older version.

Order items and returns with a null location do not enter this grain. M5 does not allocate them across locations.

### Order demand

Order items have quantity and no status of their own. Demand uses the parent order status.

| Order status | Sold units | Cancelled units | Neither |
|---|---|---|---|
| completed | yes | no | no |
| refunded | yes | no | no |
| partially_refunded | yes | no | no |
| cancelled | no | yes | no |
| pending | no | no | yes |
| open | no | no | yes |
| unknown | no | no | yes |

Sold units for a location, variant, and metric date are the sum of item quantities whose order status contributes sold, whose item location and variant match, and whose `ordered_at` falls on that store-local date.

Cancelled order quantities are excluded from sold units. They are not subtracted again. The sales-velocity input `cancelledUnits` is therefore 0 for this aggregation. No status is in both the sold set and the cancelled set.

`pending`, `open`, and `unknown` contribute neither. `unknown` must not be treated as completed demand.

### Returns and refunds

`returned_quantity` is physical units. `refunded_amount` and the order statuses `refunded` and `partially_refunded` are financial facts. A refund does not mean inventory returned.

Physical `returned_quantity` reduces units only with usable location attribution: the return location must match the metric location. Returned units for a location, variant, and metric date are the sum of those non-null quantities whose variant matches and whose `occurred_at` falls on that store-local date. Financial refund status alone does not reduce demand.

A null `returned_quantity` subtracts nothing and is not coerced to zero.

Net units for a day are `max(0, sold units - returned units)`. The floor prevents a negative demand result. It does not create a second cancellation subtraction.

### Eligible days

Lookback windows end on `metric_date` and include that date. M5 does not remove stockout days and does not estimate lost sales.

A store-local date inside the window is eligible only when demand for that location and variant is known:

- at least one sold-status order item or non-null returned quantity falls on that date, or
- a snapshot on that date has a non-null `available_quantity`, including a known zero

The approved M5.3 clarification below requires that evidence to match the metric organization, store, location, and variant. That section governs this attribution.

A date with neither a demand fact nor a known available quantity is not eligible. It is unknown, not zero. A known available quantity of zero with no sales is eligible known-zero demand. Excluding that day is stockout censoring and belongs to M6.

`eligibleDays` is the count of eligible dates in the window. Zero eligible dates makes the velocity null with `NO_ELIGIBLE_DAYS`.

Each velocity window also preserves `eligibleDays` and `coverageRatio = eligibleDays / windowDays` as deterministic metric metadata. That coverage is not a confidence score.

### Velocity

Windows are 7, 14, 30, and 90 store-local dates.

```
net demand = max(0, sold units - returned units)
velocity = net demand / eligibleDays
```

Cancelled units are already absent from sold units.

No eligible days yields null, not zero. Eligible days with net demand 0 yield 0.

### Sell-through

Ending available quantity is `available_quantity` from the latest snapshot for that organization, store, location, and variant whose `observed_at` falls on the metric date and whose `available_quantity` is non-null. Latest means greatest `observed_at`, then greatest snapshot id. If no such snapshot exists, ending available quantity is null. M5 does not copy an earlier day's quantity forward and does not substitute zero.

```
unitsAvailableForSale = net units sold + ending available quantity
```

when ending available quantity is non-null. Otherwise `unitsAvailableForSale` is null and sell-through is null.

Denominator 0 yields null with `SELL_THROUGH_DENOMINATOR_ZERO`. A known zero numerator over a positive denominator yields 0. The ratio is a decimal from 0 to 1. When net units sold exceed `unitsAvailableForSale`, no ratio is stored and sell-through is null.

### Days of stock and planning thresholds

`daysOfStock = availableQuantity / dailyDemand` using `days-of-stock-v1`. Null available quantity, null demand, or zero demand yields null. Zero available quantity with positive demand yields 0.

`safetyStock`, `reorderPoint`, and `targetStock` are numeric thresholds only. They use `safety-stock-v1`, `reorder-point-v1`, and `target-stock-v1`. Their `dailyDemand` is observed `salesVelocity30d`. That input is not a forecast. Missing lead time, safety-stock days, or review period yields null. If `salesVelocity30d` is null, safety stock, reorder point, target stock, and days of stock are null. Known zero velocity stays 0 and is distinct from unknown demand. `daysOfStock` uses the same observed `salesVelocity30d`; zero demand still yields null with `ZERO_DEMAND`. M5 does not calculate recommended order quantity, supplier MOQ, pack size, or an action.

### Incoming inventory

Valid incoming quantity uses the existing purchase-order treatment:

- draft: 0
- submitted: full ordered quantity
- confirmed: full ordered quantity
- partially_received: ordered minus received, and received quantity must be known
- received: 0
- cancelled: 0
- unknown: incoming state unknown

Received quantity greater than ordered quantity does not become negative incoming. That line is untrustworthy. If any contributing line in the scope is untrustworthy, the aggregate incoming quantity is null. M5 does not sum only the trusted subset. An empty trusted set is known zero.

### Demand trend

`demand-trend-v1` compares two non-negative daily-demand rates. The stable band is -10% through +10%. Both rates at 0 are stable. Prior 0 with positive recent demand is rising, and the change ratio stays undefined. A null input yields null trend.

The recent window is the 7 store-local dates ending on `metric_date`. The prior window is the immediately preceding 7 store-local dates. The windows do not overlap. Each rate uses the velocity rule above. Either window with no eligible day yields null trend with `TREND_INPUT_UNKNOWN`. The ±10% band is unchanged.

### Negative inventory

Persisted inventory snapshots reject negative `on_hand_quantity`, `available_quantity`, `committed_quantity`, and `incoming_quantity`. The checks allow null or a value greater than or equal to 0. Order-item quantity and `returned_quantity` are likewise null-or-non-negative.

An unresolved negative observation therefore cannot be a trusted snapshot input. If a metric input is negative before that rejection, M5 excludes it from the trusted metric and returns null. It is not coerced to zero. Inventory inputs use `INVENTORY_UNKNOWN`.

### Reason codes

M5 uses these existing codes and no confidence score:

- `NO_ELIGIBLE_DAYS`
- `DEMAND_UNKNOWN`
- `ZERO_DEMAND`
- `INVENTORY_UNKNOWN`
- `SAFETY_STOCK_DAYS_UNKNOWN`
- `SAFETY_STOCK_UNKNOWN`
- `LEAD_TIME_UNKNOWN`
- `REVIEW_PERIOD_UNKNOWN`
- `TARGET_STOCK_UNKNOWN`
- `INCOMING_STATE_UNKNOWN`
- `SELL_THROUGH_DENOMINATOR_ZERO`
- `INVENTORY_AGE_UNKNOWN`
- `TREND_INPUT_UNKNOWN`
- `PURCHASE_ORDER_STATUS_UNKNOWN`
- `RECEIVED_QUANTITY_UNKNOWN`
- `RECEIVED_EXCEEDS_ORDERED`

`STOCK_COVERAGE_UNKNOWN` remains on the metric type for the existing stockout-risk helper. M5 does not persist that helper's low, medium, or high label. Eligible-day count and coverage ratio are not confidence.

## M5.3 frozen sales-aggregate clarifications

M5.1 and M5.2 stay closed. This section records the approved aggregation rules. It does not restate the M5.1 formula contract and does not change `public.sku_daily_metrics`. Sales-aggregate code is not part of this freeze.

`calculateSalesVelocity()` stays unchanged. M5.3 calls it. It does not replace it.

### Window demand

For each 7, 14, 30, and 90 day window:

- `soldUnits` is the sum of qualifying daily `units_sold`
- `returnedUnits` is the sum of trusted daily `returned_units`
- `cancelledUnits` is 0

The window floor is applied once, inside `calculateSalesVelocity()`, to aggregate sold units minus returned units. Window demand is not the sum of daily `net_units_sold`.

Daily `net_units_sold` remains `max(0, daily units_sold - daily returned_units)`. Those daily nets are not necessarily additive to the window net demand used for velocity. A day with no sales and a return floors to 0, so later sales in the window are not reduced by that return when daily nets are summed. The window floor still subtracts the window's returned units from the window's sold units once.

### Return attribution

A return with null `location_id` is excluded from location-scoped aggregation. M5.3 does not copy a linked order item's location onto that return.

A trusted return uses its own explicit location, inside the same organization, store, and variant boundary as the metric grain. A sale item and a return may name different locations. The return stays on its own location. It is not moved to the sale location, and it is not discarded only because those locations differ.

Only a non-null physical `returned_quantity` is physical-return evidence. Financial refund status and refund amount do not imply returned units. The return's store-local business date comes from `return_refunds.occurred_at`.

The canonical evidence is the `return_refunds` row: organization, store, variant, `location_id`, `returned_quantity`, and `occurred_at`. Aggregation reads that row. It does not create an attribution table, a second return ledger, or another M5 persistence path. Later numeric persistence remains M5.5.

### Eligible days

A store-local date is eligible for one metric grain only when evidence for that date is attributed to the same organization, store, location, and variant:

- a sold-status order item at that grain, or
- a non-null physical `returned_quantity` whose return location is that grain, or
- a snapshot at that grain with non-null `available_quantity`, including a known zero

A null-location order item or return does not make a located grain eligible. A return at a different location does not make this location eligible.

### Store timezone

`stores.timezone` is the authoritative store-local timezone for `ordered_at` and `occurred_at`. M5.3 validates it as a recognized IANA timezone before calculating a business date.

`UTC` is a valid IANA timezone. A provisioned default of `UTC` is not an invalid-timezone failure. Whether that default is the merchant's real timezone is data readiness, not this validation.

An invalid or unrecognized timezone fails closed for that store's aggregation. The failure is an explicit aggregation error, the same class as an invalid metric input that throws rather than returning a metric result. No business date is calculated for that store.

That failure must not be stored or interpreted as known-zero demand, as `NO_ELIGIBLE_DAYS`, or as a new persisted M5 reason code. The M5.2 reason-code vocabulary stays unchanged. Downstream code must not treat a missing velocity from this failure as zero demand. M5.3 does not fall back to UTC, the organization timezone, or the server timezone.
