# StoreAgent Value Semantics

## Purpose

StoreAgent must preserve the meaning of commercial data precisely.

Three areas are especially important:

- money
- time
- nullability

These rules are frozen before database implementation.

---

## 1. Money

Authoritative persisted monetary values must use exact decimal representation.

Examples:

- "10"
- "10.50"
- "1250.0000"

JavaScript `number` must not be treated as authoritative persisted commercial truth.

Examples of monetary fields:

- cost
- selling price
- discount
- refund
- inventory value
- cash at risk
- revenue at risk

Every monetary amount must have an explicit currency context.

Unknown monetary value is `null`, never zero.

StoreAgent must not invent currency conversion.

Currency conversion, if introduced later, must record:

- source currency
- target currency
- conversion rate
- rate source
- rate timestamp

---

## 2. Currency

Currency is represented by ISO-4217 code.

Examples:

- USD
- AED
- GBP
- EUR

A monetary amount without a known currency must not be used for cross-currency totals.

Organization default currency is a presentation/default setting.

It must not silently overwrite the currency of imported commercial records.

---

## 3. Time

Persist canonical timestamps in UTC.

Examples:

- createdAt
- observedAt
- orderedAt
- occurredAt
- startedAt
- completedAt

Store organization/store timezone separately.

StoreAgent must not rely on the operating system or server timezone for commercial calculations.

---

## 4. Business dates

Daily inventory and demand calculations are based on the merchant/store local business day.

Example:

An order created at:

2026-10-07T22:30:00Z

may belong to:

2026-10-08

for a store whose timezone is Asia/Dubai.

The source timestamp remains UTC.

The derived business date is calculated using the store timezone.

---

## 5. Date vs timestamp

Use a date when time-of-day has no business meaning.

Examples:

- metricDate
- horizonStart
- horizonEnd
- recommendedActionDate

Use a timestamp when sequence or exact observation time matters.

Examples:

- observedAt
- orderedAt
- occurredAt
- createdAt
- completedAt

---

## 6. Null vs zero

`null` means unknown, missing, or unavailable.

`0` means a known observed/calculated zero.

Examples:

leadTimeDays = null
-> StoreAgent does not know supplier lead time.

leadTimeDays = 0
-> supplier can replenish with effectively zero-day lead time.

availableQuantity = null
-> quantity is unavailable/unknown.

availableQuantity = 0
-> inventory is known to be zero.

costAmount = null
-> cost is unknown.

costAmount = "0"
-> cost is explicitly known to be zero.

These meanings must never be conflated.

---

## 7. Not applicable

Some values are not merely unknown; they may be not applicable.

When this distinction becomes important, StoreAgent should model it explicitly through status/reason codes rather than overloading numeric values.

Example:

daysOfStock may be unavailable because:

- demand is unknown
- demand is zero
- inventory is unknown
- calculation is not applicable

Do not use arbitrary sentinel numbers such as:

- -1
- 999999
- Infinity

for persisted business meaning.

---

## 8. Infinity

Infinity may be useful inside deterministic calculation code but must not be persisted as a commercial value.

Example:

available inventory > 0
and demand velocity = 0

may conceptually imply infinite coverage.

Persisted output should instead use:

- daysOfStock = null

plus an explicit reason code such as:

ZERO_DEMAND

---

## 9. Percentages and ratios

Ratios such as sell-through and confidence inputs must document their scale.

StoreAgent standard for V1:

- percentage/ratio values use decimal ratio form when used in calculations
- 0 = 0%
- 0.5 = 50%
- 1 = 100%

UI formatting converts ratios to percentage labels.

Do not mix `50` and `0.5` semantics.

---

## 10. Quantity semantics

V1 inventory quantities are whole units.

Authoritative inventory quantities must be integers.

Examples:

0
1
25
500

Fractional inventory is outside V1 scope.

If future verticals require fractional units, this decision must be revisited explicitly rather than silently changing current assumptions.

---

## 11. Negative values

Negative canonical inventory is considered a data-quality problem unless a provider-specific reconciliation state explicitly explains it.

A negative observed inventory value may be retained for audit/debugging, but must trigger a data-quality issue and may be excluded from trustworthy calculations.

Calculated reorder quantities must never be negative.

---

## 12. Missing data behavior

Missing commercial inputs must reduce confidence or prevent stronger recommendations.

StoreAgent may respond with:

- WATCH
- low confidence
- insufficient data
- data quality remediation

StoreAgent must not replace missing data with fabricated defaults unless the merchant has explicitly configured a default.

Example:

unknown SKU lead time
+ configured organization default lead time

may use the configured default with lowered confidence and recorded reason.

---

## 13. Derived-value provenance

Important derived values must be traceable to:

- authoritative source data
- merchant configuration/defaults
- algorithm version
- calculation timestamp

AI is never provenance for numeric commercial truth.
