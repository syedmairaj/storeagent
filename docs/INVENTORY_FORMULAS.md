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
