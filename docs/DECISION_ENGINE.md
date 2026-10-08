# StoreAgent Decision Engine

## Purpose

The decision engine converts deterministic inventory metrics and deterministic forecast outputs into merchant-facing inventory health states and actionable interventions.

The engine does not calculate source metrics or forecasts.

The engine does not ask AI to determine commercial truth.

Pipeline:

canonical observations
-> deterministic metrics
-> deterministic forecast
-> deterministic decision engine
-> HEALTHY or InventoryAction candidate
-> AI explanation / communication later

## Canonical outputs

StoreAgent uses the existing canonical domain types:

- `InventoryHealthState`
  - REORDER
  - REDUCE
  - PROMOTE
  - WATCH
  - HEALTHY

- `InventoryActionType`
  - REORDER
  - REDUCE
  - PROMOTE
  - WATCH

`HEALTHY` is a health state only.

StoreAgent must not persist an `InventoryAction` merely to represent HEALTHY.

## V1 decision principles

### Deterministic truth

The decision engine consumes only deterministic inputs.

AI must not:

- choose an action type
- calculate action quantity
- override decision thresholds
- raise decision confidence
- suppress deterministic evidence
- resolve contradictory inventory signals

AI may later explain, prioritize in natural language, or communicate an already-determined action.

### Evidence-first actions

An intervention may be emitted only when the evidence required for that intervention is present and trustworthy.

Missing evidence must not silently become:

- zero inventory
- zero incoming inventory
- zero demand
- zero lead time
- zero safety stock
- zero forecast demand

### Known zero versus unknown

Known zero is a valid commercial value.

Unknown is not zero.

Decision rules must preserve this distinction.

### Action-specific evidence gates

The engine does not require every possible metric before producing any decision.

Each action has its own evidence requirements.

For example:

- REORDER requires trusted replenishment evidence
- REDUCE requires trusted excess-inventory evidence
- PROMOTE requires trusted excess/age/demand evidence
- WATCH may be used when missing or contradictory evidence prevents a safer intervention

A missing non-essential metric must not block an otherwise fully supported action.

### No contradictory interventions

A single SKU/location evaluation must not emit conflicting action types.

Examples of conflicting intervention families include:

- REORDER together with REDUCE
- REORDER together with PROMOTE

If independently calculated deterministic signals simultaneously support incompatible intervention families, V1 fails closed to WATCH with explicit reason codes.

The engine must not arbitrarily choose a commercial action merely because one rule was evaluated first.

### No duplicate commercial truth

The decision engine consumes outputs from the metric and forecast layers.

It must not reimplement:

- sales velocity
- days of stock
- safety stock
- reorder point
- target stock
- recommended order quantity
- stockout risk
- overstock risk
- forecast baseline
- trend adjustment
- forecast confidence
- forecast horizons

Those calculations remain owned by their existing deterministic modules.

## V1 evaluation order

Evaluation order is an orchestration rule, not permission to hide contradictions.

1. Validate decision inputs.
2. Evaluate action-specific evidence availability.
3. Detect contradictory commercial signals.
4. Evaluate REORDER eligibility.
5. Evaluate excess-inventory branch:
   - REDUCE
   - PROMOTE
6. Evaluate WATCH conditions.
7. Otherwise return HEALTHY.

If contradictory signals are detected, WATCH takes precedence over incompatible commercial intervention.

If essential evidence for a proposed intervention is unavailable, the engine does not invent it.

## Action semantics

### REORDER

Meaning:

Current and expected inventory position is insufficient for deterministic replenishment needs.

REORDER may carry a deterministic recommended quantity.

Supplier MOQ and pack constraints remain deterministic.

### REDUCE

Meaning:

Inventory position or incoming supply is materially above supported demand or target and the appropriate merchant response is to reduce future inventory exposure.

Examples may later include:

- reduce replenishment
- reduce or cancel planned purchase quantity when commercially possible
- stop adding further supply

REDUCE does not mean discount the product.

### PROMOTE

Meaning:

Existing inventory needs demand-generation attention rather than more supply.

PROMOTE may later be supported by evidence such as:

- materially excessive stock
- aged inventory
- weak or falling demand
- poor sell-through

The decision engine determines whether PROMOTE is warranted.

AI may later explain or draft promotional messaging but does not decide that promotion is required.

### WATCH

Meaning:

StoreAgent has identified material risk, uncertainty, conflict, or an emerging condition that does not safely justify REORDER, REDUCE, or PROMOTE.

WATCH is an actionable intervention state and may be persisted as `InventoryAction`.

WATCH must contain explicit reason codes.

WATCH must not become a generic fallback for every missing optional field.

### HEALTHY

Meaning:

The available trusted evidence does not support an intervention and does not contain a material uncertainty requiring WATCH.

HEALTHY is not persisted as an InventoryAction.

## Conflict policy

V1 is fail-closed for incompatible commercial signals.

Examples:

- replenishment evidence says order more while overstock evidence says reduce inventory
- high stockout risk and high overstock risk simultaneously
- required-order quantity is positive while the same canonical inventory position indicates material excess

Such cases produce:

WATCH
+
CONFLICTING_SIGNALS

The contradiction should be investigated rather than hidden.

## Confidence boundary

Decision confidence is deterministic.

Forecast confidence may contribute to decision confidence but does not automatically equal it.

Decision confidence may stay the same or degrade when:

- forecast evidence is weak
- data quality is incomplete
- inventory state is uncertain
- incoming purchase-order state is uncertain
- required metrics are unavailable

Decision confidence must never be raised by AI.

Exact V1 decision-confidence rules will be frozen in a later M0.6 sub-step.

## Evidence snapshots

Every persisted InventoryAction must preserve the evidence used at decision time through `InventoryActionEvidence`.

The evidence snapshot is historical truth.

Later data refreshes must not silently rewrite the evidence that produced an earlier action.

## Algorithm versioning

Decision rules capable of changing commercial output require explicit algorithm versioning.

V1 decision algorithms use explicit version constants.

Historical actions retain the algorithm version that created them.

## Non-goals for M0.6

The deterministic decision engine does not:

- generate natural-language explanations
- generate advertisements
- write promotional copy
- send email, SMS, or WhatsApp
- automatically place purchase orders
- mutate Shopify inventory
- execute merchant actions

Those capabilities belong to later milestones and require explicit approval or automation policy.


## M0.6.2 frozen reason-code contract

Decision reason codes are stable machine-readable evidence identifiers.

They are not merchant-facing prose.

Reason-code families:

- conflict
- replenishment
- excess inventory
- promotion
- uncertainty
- healthy/no intervention

Reason codes must explain why a deterministic state or action was selected.

Commercial signals use specific evidence codes such as:

- `REORDER_QUANTITY_POSITIVE`
- `STOCKOUT_RISK_HIGH`
- `BELOW_REORDER_POINT`
- `OVERSTOCK_RISK_HIGH`
- `ABOVE_TARGET_STOCK`
- `AGED_INVENTORY`
- `FALLING_DEMAND`
- `ZERO_DEMAND`

Missing or weak evidence uses explicit uncertainty codes rather than fabricated values.

Examples include:

- `INCOMING_STATE_UNKNOWN`
- `INVENTORY_STATE_UNKNOWN`
- `DEMAND_STATE_UNKNOWN`
- `LEAD_TIME_UNKNOWN`
- `TARGET_STOCK_UNKNOWN`
- `REORDER_POINT_UNKNOWN`
- `FORECAST_UNAVAILABLE`
- `FORECAST_CONFIDENCE_LOW`
- `DATA_QUALITY_LOW`

Contradictory commercial evidence uses:

`CONFLICTING_SIGNALS`

HEALTHY uses:

`HEALTHY_NO_INTERVENTION`

Known zero and unknown remain semantically different.

Reason codes are deterministic inputs to later UI explanations and AI communication.

AI may translate a reason code into merchant-friendly language but may not create evidence that the deterministic engine did not emit.

Existing historical reason-code meanings must not be silently changed.


## M0.6.3 frozen REORDER rule

`reorder-rule-v1` consumes deterministic metric outputs.

It does not recalculate inventory formulas.

REORDER eligibility requires:

- available inventory known
- incoming inventory state known
- demand velocity known
- lead time known
- reorder point known
- target stock known
- deterministic recommended order quantity greater than zero

A positive recommended order quantity is the primary deterministic quantity gate.

Supporting evidence may include:

- high stockout risk
- medium stockout risk
- inventory position below reorder point

Inventory position for evidence comparison is:

available inventory
+
known valid incoming inventory

When incoming state is known and incoming quantity is null, V1 treats that as known zero incoming inventory.

When incoming state is unknown, REORDER fails closed.

Missing required evidence does not become zero.

The REORDER rule does not resolve conflicting overstock or promotion signals.

Conflict resolution belongs to the orchestration layer and may later replace an otherwise valid REORDER candidate with WATCH.

The REORDER rule does not:

- calculate sales velocity
- calculate reorder point
- calculate target stock
- calculate order quantity
- apply supplier MOQ
- apply supplier pack-size rounding

Those values must already be produced by the deterministic metric layer.


## M0.6.4 frozen REDUCE rule

`reduce-rule-v1` protects the merchant from additional inventory exposure.

REDUCE is distinct from PROMOTE.

REDUCE means:

prevent or reduce additional incoming inventory exposure.

PROMOTE means:

generate demand for inventory already sitting on hand.

REDUCE eligibility requires:

- available inventory known
- incoming inventory state known
- target stock known
- known incoming inventory greater than zero
- inventory position above target stock
- medium or high deterministic overstock risk

Inventory position is:

available inventory
+
known valid incoming inventory

Known zero incoming inventory is not REDUCE evidence.

Unknown incoming inventory fails closed.

Existing excess stock without incoming supply does not automatically produce REDUCE.

That condition may later qualify for PROMOTE if the PROMOTE evidence gate is satisfied.

A high overstock-risk signal alone is not enough.

Inventory position must also be above deterministic target stock.

The REDUCE rule does not calculate:

- target stock
- incoming purchase-order quantity
- overstock risk
- demand forecast
- purchase-order cancellation quantity

Those values remain owned by their deterministic source layers.

REDUCE does not automatically mutate or cancel a purchase order.

Execution requires later merchant approval or explicit automation policy.


## M0.6.5 frozen PROMOTE rule

`promote-rule-v1` identifies inventory already on hand that needs demand-generation attention.

PROMOTE is not a replenishment action.

PROMOTE eligibility requires:

- available inventory known and greater than zero
- target stock known
- demand state known
- available inventory above target stock
- medium or high deterministic overstock risk
- at least one demand-pressure signal

V1 demand-pressure signals are:

- inventory age at least 90 days
- falling deterministic demand trend
- known zero demand

The 90-day age threshold belongs specifically to `promote-rule-v1`.

Known zero demand is valid evidence.

Unknown demand is not zero.

Overstock risk alone is not enough to produce PROMOTE.

Excess position and demand-pressure evidence must both exist.

PROMOTE does not:

- calculate overstock risk
- calculate target stock
- calculate inventory age
- calculate demand trend
- create promotional copy
- select a discount
- execute a campaign

Those responsibilities remain outside the deterministic decision rule.

AI may later explain a PROMOTE action or draft campaign content, but AI does not decide that promotion is required.


## M0.6.6 frozen WATCH and HEALTHY rules

`watch-healthy-rule-v1` is evaluated after REORDER, REDUCE, and PROMOTE candidate rules.

If a commercial candidate already exists, this fallback rule returns no state.

WATCH represents material decision uncertainty.

V1 material uncertainty includes unavailable core evidence such as:

- inventory state unknown
- incoming inventory state unknown
- demand state unknown
- lead time unknown
- reorder point unknown
- target stock unknown
- deterministic forecast unavailable
- forecast confidence low

WATCH must include:

`MATERIAL_UNCERTAINTY`

plus specific evidence reason codes.

WATCH is not a generic response to every missing field.

The following are not independently required for HEALTHY:

- inventory age
- demand trend
- data-quality score

Those values may support stronger later rules when available, but their absence alone does not force WATCH.

Known zero remains distinct from unknown.

Known zero demand does not automatically become WATCH.

HEALTHY is returned only when:

- no REORDER candidate exists
- no REDUCE candidate exists
- no PROMOTE candidate exists
- no material uncertainty exists

HEALTHY uses:

`HEALTHY_NO_INTERVENTION`

HEALTHY is a state, not a persisted `InventoryAction`.


## M0.6.7 frozen conflict resolution

`decision-conflict-v1` detects incompatible deterministic commercial candidates before primary-action selection.

V1 conflicts are:

- REORDER + REDUCE
- REORDER + PROMOTE
- REORDER + REDUCE + PROMOTE

These combinations fail closed because StoreAgent must not simultaneously tell a merchant to increase inventory and reduce or promote excess inventory.

Conflict output includes:

`CONFLICTING_SIGNALS`

A conflict is resolved later as WATCH.

### REDUCE + PROMOTE

REDUCE and PROMOTE are not inherently contradictory.

They may coexist when:

- incoming inventory exposure should be reduced
- existing on-hand inventory also needs demand-generation attention

Both belong to the excess-inventory family.

M0.6.8 primary-action precedence determines which intervention is surfaced first.

Conflict detection must not arbitrarily select a commercial winner.

Conflict detection also must not recalculate inventory metrics or forecasts.


## M0.6.8 frozen primary-action precedence and priority

Primary-action selection and urgency are separate deterministic concerns.

### Primary-action precedence

`primary-action-v1` operates only after conflict detection.

Compatible candidate behavior:

- REORDER alone -> REORDER
- REDUCE alone -> REDUCE
- PROMOTE alone -> PROMOTE
- REDUCE + PROMOTE -> REDUCE primary, PROMOTE compatible secondary

REDUCE precedes PROMOTE when both are valid because preventing additional inventory exposure is the first corrective action.

PROMOTE evidence is preserved as a compatible secondary intervention.

REORDER combined with REDUCE or PROMOTE must never be resolved by precedence.

Those combinations are conflicts and must surface as WATCH.

### Priority

`decision-priority-v1` answers urgency only.

Priority must not choose the action type.

REORDER:

- high stockout risk and days of stock <= lead time -> critical
- high stockout risk -> high
- medium stockout risk -> medium
- otherwise -> low

REDUCE:

- high overstock risk -> high
- medium overstock risk -> medium
- otherwise -> low

PROMOTE:

- high overstock risk plus aged inventory or known zero demand -> high
- high or medium overstock risk otherwise -> medium
- otherwise -> low

WATCH:

- conflicting commercial signals -> high
- material uncertainty without commercial conflict -> medium

Priority consumes existing deterministic evidence.

It does not recalculate stockout risk, overstock risk, inventory age, demand, or forecast truth.

A conflicting non-WATCH action is invalid.


## M0.6.9 frozen decision confidence

`decision-confidence-v1` derives decision confidence deterministically.

Decision confidence starts from forecast confidence.

The decision layer may preserve or reduce confidence.

It must never raise confidence above deterministic forecast confidence.

V1 data-quality policy:

- score 80 through 100 -> no additional downgrade
- score 60 through 79 -> confidence capped at MEDIUM
- score below 60 -> LOW

The thresholds belong specifically to `decision-confidence-v1`.

A null data-quality score does not silently become zero and does not independently downgrade confidence.

Material uncertainty forces LOW confidence.

Conflicting commercial signals force LOW confidence.

WATCH priority and WATCH confidence are separate concepts.

For example:

- conflicting WATCH may be HIGH priority
- while decision confidence remains LOW because the underlying commercial signals disagree

AI cannot raise, assign, or override decision confidence.

Decision confidence does not choose the action type.

Priority does not choose decision confidence.

Primary-action precedence does not choose decision confidence.


## M0.6.10 frozen evidence snapshot mapping

`buildInventoryActionEvidence` maps already-calculated deterministic decision inputs into canonical `InventoryActionEvidence`.

The mapper does not recalculate metrics, forecasts, risk, or action quantities.

Persisted evidence fields are:

- available quantity
- incoming quantity
- demand velocity
- days of stock
- lead time
- safety stock
- reorder point
- target stock
- inventory age
- forecast expected demand
- data-quality score
- deterministic reason codes

Known zero remains distinct from unknown.

Unknown values remain null.

If incoming inventory state is not trustworthy, persisted incoming quantity is null even if an untrusted numeric value happens to be present upstream.

Decision-only inputs that are not part of canonical `InventoryActionEvidence` are not added ad hoc.

Examples include:

- forecast confidence
- stockout risk
- overstock risk
- recommended order quantity

Those values may exist elsewhere on the canonical action or in their source records.

Reason codes are copied into the snapshot.

The stored evidence snapshot represents historical decision-time truth.

Later data refreshes must not silently rewrite an earlier action's evidence snapshot.


## M0.6.11 frozen versioning and reproducibility

Decision output must be reproducible.

Given identical:

- canonical deterministic decision inputs
- decision algorithm versions
- decision configuration version

StoreAgent must produce identical deterministic decision behavior.

V1 decision versions are:

- reorder-rule-v1
- reduce-rule-v1
- promote-rule-v1
- watch-healthy-rule-v1
- decision-conflict-v1
- primary-action-v1
- decision-priority-v1
- decision-confidence-v1

A reproducibility fingerprint may be persisted with decision provenance.

Changing commercial decision behavior requires an explicit algorithm or configuration version change.

Historical actions retain their original decision algorithm version.

V1 decision logic permits no uncontrolled randomness.

AI output is not part of the deterministic decision fingerprint.


## M0.6.12 frozen orchestration and invariants

`inventory-decision-v1` is the canonical deterministic orchestration path.

Evaluation sequence:

1. evaluate REORDER candidate
2. evaluate REDUCE candidate
3. evaluate PROMOTE candidate
4. detect incompatible commercial conflicts
5. fail closed to WATCH when conflict exists
6. otherwise select the primary compatible action
7. when no commercial action exists, evaluate WATCH / HEALTHY
8. calculate priority
9. calculate decision confidence
10. preserve deterministic reason codes

The orchestrator does not recalculate metrics or forecasts.

REORDER is the only V1 action that carries `recommendedQuantity`.

HEALTHY has:

- `actionType = null`
- `priority = null`
- `recommendedQuantity = null`

WATCH is a persisted action type when material uncertainty or conflicting commercial evidence requires merchant attention.

Compatible REDUCE + PROMOTE candidates preserve REDUCE as primary and PROMOTE as a compatible secondary intervention.

Incompatible REORDER + excess-inventory candidates fail closed to WATCH.

Decision confidence cannot be raised above deterministic forecast confidence.

Known zero remains distinct from unknown.

AI, UI frameworks, persistence SDKs, commerce-provider SDKs, and billing SDKs are forbidden dependencies inside deterministic decision-engine modules.
