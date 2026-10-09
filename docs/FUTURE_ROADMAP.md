# StoreAgent Future Roadmap

This document records strategically approved capabilities that are intentionally
deferred until the core StoreAgent inventory workflow is proven.

These items are not part of the currently active milestone unless explicitly
promoted into IMPLEMENTATION_STATUS.md.

---

## Supplier Intelligence / Reorder Sourcing Advisor

Status: APPROVED FOR FUTURE ROADMAP

Timing:

Implement after the core inventory workflow is operational and StoreAgent can
reliably produce evidence-backed REORDER decisions.

The feature must extend StoreAgent's inventory intelligence rather than turn the
product into a generic dropshipping or product-sourcing platform.

### Product promise

When StoreAgent recommends a reorder, help the merchant answer:

> Who should I buy from, at what true landed cost, how much cash will this
> require, and does the purchase still meet my margin and inventory-risk goals?

### V1 scope

Supplier Intelligence V1 should support:

- supplier records relevant to an inventory item
- supplier quote entry
- supplier unit cost
- minimum order quantity (MOQ)
- quantity-break information where available
- shipping/freight cost
- duties/taxes/fees entered or supplied from trusted data
- payment terms
- stated supplier lead time
- landed-cost calculation
- landed unit cost
- MOQ impact
- cash required
- expected margin after landed cost
- lead-time risk against StoreAgent forecast
- stockout exposure
- excess-inventory exposure caused by MOQ
- deterministic supplier comparison
- preferred supplier recommendation
- backup supplier recommendation
- deterministic explanation/evidence for the recommendation
- RFQ drafting
- supplier follow-up drafting

### Decision principle

StoreAgent must not select a supplier merely because its quoted unit price is
lowest.

Supplier comparison should consider, where trusted data exists:

- recommended reorder quantity
- MOQ
- product cost
- freight
- duties/taxes/fees
- landed unit cost
- cash required
- lead time
- predicted stockout date
- expected margin
- inventory excess created by MOQ
- supplier reliability history when available

Example:

A cheaper supplier with a high MOQ and long lead time may be inferior to a
higher-price supplier if the cheaper supplier:

- requires excessive working capital
- creates material overstock
- arrives after projected stockout
- produces unacceptable margin or inventory risk

### Relationship to deterministic StoreAgent truth

Supplier Intelligence consumes existing trusted StoreAgent outputs.

Expected direction:

canonical inventory data
-> metrics
-> forecast
-> REORDER decision
-> supplier comparison
-> purchasing recommendation
-> AI explanation / RFQ draft

Supplier Intelligence must not redefine:

- inventory formulas
- forecast truth
- reorder quantity
- stockout risk
- tenant ownership

Any new supplier-selection calculations must be deterministic and evidence
backed.

### Merchant control boundary

StoreAgent may:

- calculate
- compare
- recommend
- explain
- draft RFQs
- draft supplier messages
- draft follow-ups
- remind the merchant

StoreAgent must not, without explicit merchant approval:

- place an order
- make a payment
- contact a supplier
- send an email
- accept a quote
- create a binding commercial commitment

### Potential V2 capabilities

After V1 proves useful:

- supplier price history
- supplier lead-time history
- promised vs actual lead time
- late-delivery rate
- supplier reliability score
- received-vs-ordered quantity accuracy
- quality/return issue history
- supplier price-change alerts
- purchase-order history
- automatic replacement-supplier suggestions
- supplier performance incorporated into replenishment planning

A particularly valuable future signal is:

> stated lead time versus actual historical lead time

StoreAgent should eventually prefer observed supplier performance over an
unverified supplier promise when sufficient history exists.

### Explicitly deferred / excluded from V1

Do not build these as part of Supplier Intelligence V1:

- generic "winning product" discovery
- dropshipping product hunting
- internet-wide competitor scraping
- automatic supplier marketplace discovery
- Alibaba/AliExpress-style supplier crawling
- Apify-dependent sourcing workflows
- TrendTrack-dependent workflows
- country-law compliance certification
- legal/regulatory approval claims
- automatic HS-code legal conclusions
- automatic Gmail outreach
- automatic purchasing
- automatic payments
- uncontrolled autonomous supplier contact

These capabilities introduce materially greater data cost, regulatory risk,
operational complexity, or product-positioning drift.

### Compliance boundary

StoreAgent must not claim that a product is legally compliant merely from AI
research.

A future compliance capability would require:

- authoritative jurisdiction-specific sources
- effective-date/version tracking
- category-specific rules
- evidence provenance
- conservative unknown/needs-review states
- explicit merchant/professional review where appropriate

It is therefore not part of the initial Supplier Intelligence feature.

### Positioning

Do not position this feature primarily as:

> Winning Product Finder

Preferred positioning:

> Supplier Intelligence

or

> Reorder Sourcing Advisor

Core merchant value:

> StoreAgent tells you what inventory decision to make and helps you make the
> financially best purchasing decision before you place the order.

### Roadmap promotion rule

This feature should be promoted into the active implementation roadmap only
after the core inventory pipeline is proven:

data ingestion
-> canonical inventory state
-> metrics
-> forecasting
-> deterministic actions
-> merchant-facing evidence

Until then it remains intentionally deferred.
