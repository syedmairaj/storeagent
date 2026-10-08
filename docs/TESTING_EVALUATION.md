# StoreAgent Testing and Evaluation Architecture

## Purpose

StoreAgent makes inventory and buying recommendations that may affect merchant cash, stock availability and purchasing decisions.

Correctness therefore requires more than function-level unit tests.

StoreAgent uses three separate assurance layers:

1. unit and invariant tests
2. versioned evaluation scenarios
3. reviewed golden expected outputs

These layers have different responsibilities.

## Unit tests

Unit tests prove local deterministic behavior.

Examples:

- formula arithmetic
- null versus zero semantics
- forecast confidence rules
- decision conflict resolution
- tenant authorization
- worker retry behavior

Unit tests remain close to the implementation.

## Evaluation scenarios

An evaluation scenario represents a named business situation.

A scenario contains:

- stable scenario ID
- schema version
- evaluation domain
- risk classification
- deterministic configuration version
- deterministic input
- reviewed expected output
- explicit invariant(s) protected by the scenario

Scenario IDs are stable.

Array position, fixture ordering and filenames are not scenario identity.

## Evaluation domains

The frozen V1 evaluation domains are:

- metrics
- forecast
- decision
- tenancy
- worker
- ai

## Risk classification

Evaluation scenarios are classified:

- critical
- high
- medium
- low

Critical scenarios protect behavior where incorrect output could create material merchant, tenant-isolation or commercial-risk consequences.

Examples include:

- cross-tenant access
- incorrect REORDER recommendation
- fabricated demand
- incorrect incoming-stock treatment
- AI mutation of numeric truth

## Golden expected output

Golden output is reviewed expected deterministic behavior.

A golden result must not be updated merely because a test failed.

A changed golden result requires an intentional explanation of why business truth changed.

Changing implementation and automatically regenerating expected output is not an acceptable regression workflow.

## Deterministic inputs only

Evaluation fixtures must not depend on:

- current clock time
- random values
- queue delivery identity
- live Shopify responses
- live network calls
- AI nondeterminism
- credentials
- service-role secrets

Time-sensitive scenarios use explicit timestamps supplied by the fixture.

## Reproducibility

For identical:

- canonical input
- algorithm versions
- configuration version

StoreAgent deterministic evaluation output must remain reproducible.

A retry, worker owner, lease token or runtime timestamp must not alter deterministic business truth.

## Unknown versus zero

Evaluation scenarios must preserve StoreAgent's core value semantics.

Known zero is not equivalent to unknown.

Fixtures must explicitly test both where commercially relevant.

## Regression policy

A regression is any unapproved change to expected behavior for a versioned evaluation scenario.

When an evaluation changes, one of the following must be true:

- implementation is wrong and must be fixed
- business rule intentionally changed and versioning/documentation must change
- fixture was invalid and the correction is reviewed explicitly

Expected outputs must not be modified solely to make CI green.

## AI evaluation boundary

AI evaluation is separate from deterministic numeric evaluation.

AI may later be evaluated for:

- grounded explanation
- factual consistency with deterministic evidence
- clarity
- unsupported-claim rate
- numeric-mutation violations

AI must never become the oracle for metrics, forecast or decision truth.

## M0 limitation

M0 freezes the evaluation architecture and scenario contracts.

Large production datasets, live provider replay suites and AI-provider evaluation runs belong to later implementation milestones.

The architecture defined here must be reusable by those later suites.

---

## Versioned deterministic fixture format

Evaluation fixtures represent stable deterministic input evidence.

Fixtures are separate from expected outputs.

A fixture contains:

- fixture schema version
- stable fixture ID
- evaluation domain
- explicit fixture evidence version
- description
- deterministic input

### Stable fixture identity

Fixture identity is explicit.

It must not depend on:

- array position
- test execution order
- random UUID
- current timestamp
- generated temporary filename

Example:

forecast/steady-demand-28-days-v1

### Fixture evidence version

fixtureVersion tracks intentional evidence changes.

If the fixture's business evidence changes materially, the fixture version must change deliberately.

A fixture must not silently change while retaining the same version merely to make an evaluation pass.

### Deterministic fixture requirements

Fixtures must not depend on:

- live network calls
- current clock time
- random values
- queue delivery identifiers
- runtime worker identifiers
- live provider APIs
- AI responses
- environment-specific credentials

Time-dependent evidence uses explicit fixture dates and timestamps.

### Credentials

Fixture data must never contain real:

- access tokens
- refresh tokens
- API keys
- service-role credentials
- passwords
- merchant secrets

Provider-specific security testing uses clearly synthetic non-secret placeholders when necessary.

### Unknown versus zero

Fixtures must preserve semantic distinctions.

Examples:

availableQuantity = 0

means known zero inventory.

availableQuantity = null

means inventory state is unknown.

Evaluation fixture authors must not normalize these into the same value.

### Reuse

A deterministic fixture may be reused by multiple evaluation scenarios.

For example, one demand-history fixture may support:

- forecast accuracy scenario
- forecast confidence scenario
- decision scenario

Expected behavior remains owned by the relevant scenario/golden contract, not by the fixture itself.

### Fixture directories

V1 fixture domains live under:

tests/fixtures/metrics
tests/fixtures/forecast
tests/fixtures/decision
tests/fixtures/tenancy
tests/fixtures/worker
tests/fixtures/ai

This structure mirrors the frozen evaluation domains.

---

## Golden expected-output contract

Golden outputs represent intentionally reviewed deterministic StoreAgent behavior.

A golden artifact is not an automatically generated snapshot.

### Golden artifact

A V1 golden output contains:

- golden schema version
- stable golden ID
- stable scenario ID
- deterministic configuration version
- optional explicit fixture reference
- reviewed expected output
- explicit approval status
- review rationale

### Golden output is separate from fixture evidence

Fixture:

input evidence

Golden output:

expected deterministic result

These concepts must remain separate.

Changing fixture evidence does not automatically authorize changing expected output.

Changing expected output does not automatically authorize changing fixture evidence.

### Explicit approval

Every golden artifact must be explicitly approved.

Approval means the expected result represents StoreAgent's intended business behavior under the stated configuration.

Approval is architectural review metadata.

It must not be inferred merely because:

- current implementation produced the value
- a snapshot command was run
- CI was failing
- a developer regenerated files

### No automatic regeneration

StoreAgent does not define an automatic golden-regeneration workflow.

A failing golden evaluation must be investigated.

The allowed outcomes are:

1. implementation is wrong and implementation is corrected
2. deterministic business rule intentionally changed and its version/configuration is updated
3. fixture evidence was wrong and is explicitly corrected/versioned
4. golden expectation was wrong and is explicitly reviewed/corrected

"Update snapshots until tests pass" is not an acceptable resolution.

### Configuration identity

Golden behavior is tied to an explicit deterministic configuration version.

An intentional deterministic behavior change must not silently reuse an old configuration identity when that would make historical golden meaning ambiguous.

### Fixture references

Golden outputs may reference versioned deterministic fixtures.

The reference contains:

- fixtureId
- fixtureVersion

Small scenarios may use inline deterministic input and therefore have no external fixture reference.

### Golden identity

Golden identity is stable.

It is not derived from:

- array position
- test execution order
- temporary filename
- runtime timestamp
- random UUID

### Expected output

Golden expected output may contain:

- numeric deterministic truth
- categorical deterministic truth
- explicit null/unknown states
- reason codes
- confidence
- action state

depending on the evaluation domain.

Known zero and unknown remain distinct in golden results.

### AI boundary

AI output must not define deterministic golden truth for:

- metrics
- forecasting
- inventory quantities
- reorder quantities
- decision action type
- deterministic confidence

AI-specific evaluation later compares AI behavior against already-established deterministic evidence.

### Review discipline

A golden diff must be treated as a business-behavior diff.

Reviewers should ask:

- what rule changed?
- why should the merchant see a different result?
- was an algorithm/configuration version changed appropriately?
- does the new behavior preserve null-versus-zero semantics?
- does the change weaken a safety or tenancy invariant?

The purpose of golden evaluation is to make silent business-truth drift visible.

---

## M0.9.4 Metrics scenario matrix

StoreAgent maintains a reviewed metrics-v1 business regression matrix.

The matrix executes the existing deterministic metrics implementation.

It does not duplicate formula ownership.

### Required coverage

The V1 matrix protects:

- sales velocity
- known zero demand
- missing eligible demand history
- days of stock
- known-zero versus unknown inventory
- zero-demand coverage handling
- safety-stock upward rounding
- reorder point
- target stock
- recommended order quantity
- known-zero versus unknown incoming inventory
- sell-through
- inventory-age provenance
- demand-trend boundaries
- stockout-risk boundaries
- overstock-risk boundaries
- zero-target overstock semantics
- supplier MOQ
- supplier pack rounding
- zero reorder need
- incoming purchase-order status treatment
- partial receipt treatment
- unknown/invalid inbound evidence
- incoming aggregate fail-closed behavior

### Business-danger scenarios

Critical scenarios are emphasized where incorrect calculation could:

- create excess purchasing
- suppress a required reorder
- hide stockout exposure
- create false overstock exposure
- treat unknown evidence as known zero
- double-buy inventory already incoming
- subtract ambiguous incoming inventory
- violate supplier ordering constraints

### Boundary values

Threshold evaluations include exact boundaries.

Examples:

stockout-risk-v1:

coverage <= lead time
-> HIGH

lead time < coverage <= replenishment horizon
-> MEDIUM

coverage > replenishment horizon
-> LOW

overstock-risk-v1:

position <= target
-> LOW

target < position <= 1.5 x target
-> MEDIUM

position > 1.5 x target
-> HIGH

Boundary inclusivity is part of deterministic business truth.

### Incoming inventory

The evaluation matrix explicitly protects the rule that partial trustworthy incoming inventory must not be subtracted when another relevant inbound line is ambiguous.

One ambiguous line causes aggregate incoming state to fail closed.

### No second formula engine

The evaluation runner calls lib/metrics/inventory-math.ts directly.

Tests contain approved expected results.

They do not implement alternate formulas to calculate what the expected result should be.

---

## M0.9.5 Forecast scenario matrix

StoreAgent maintains a reviewed forecast-v1 regression matrix.

The evaluation runner invokes the frozen forecasting modules directly.

It does not create a second forecast pipeline.

### Protected forecast behavior

The matrix covers:

- history sufficiency boundaries
- stockout censoring
- known zero versus unknown demand
- promotion exclusion
- weighted-demand eligibility
- unavailable forecast windows
- bounded trend adjustment
- demand emerging from zero
- conservative cold-start behavior
- known-zero cold-start demand
- baseline-unavailable behavior
- deterministic confidence
- quality-degradation boundaries
- explicit forecast horizons
- independently calculable horizons
- MAE
- WAPE
- forecast bias
- zero-actual-demand backtesting
- empty backtest sets

### History sufficiency

forecast-history-sufficiency-v1:

0-6 usable days
-> insufficient

7-27 usable days
-> limited

28+ usable days
-> sufficient

Exact threshold boundaries are regression-protected.

### Stockout censoring

A known stockout day with zero sales is not zero demand.

Unknown availability also does not become zero demand.

Positive sales remain usable because the observed sale proves demand occurred.

### Promotion treatment

Known promotion observations do not participate in the ordinary V1 baseline.

Unknown promotion state fails closed.

V1 does not mathematically estimate promotional uplift.

### Weighted demand

The evaluation matrix executes weighted-demand-v1 directly.

Window eligibility remains governed by the frozen minimum usable observations.

Unavailable windows do not participate.

Remaining configured weights are renormalized.

Known-zero demand remains zero.

No usable window produces unavailable forecast demand.

### Trend adjustment

Trend adjustment remains bounded.

Stable movement does not alter baseline demand.

Extreme positive or negative movement cannot exceed the frozen twenty-percent adjustment cap.

Demand emerging from zero does not produce infinite growth.

### Cold start

V1 never fabricates category, peer-SKU, provider-average, synthetic or AI-estimated demand.

Insufficient history produces no numeric forecast.

Limited history may expose a valid own-SKU baseline.

Sufficient history follows the standard forecast path.

### Confidence

Forecast confidence is deterministic.

It may remain equal or decline as evidence quality worsens.

It cannot improve because data quality worsens.

Boundary degradation scenarios are regression protected.

### Forecast horizons

Forecast demand horizons remain separate from inventory rounding and purchasing logic.

Forecasting may preserve fractional expected demand.

Unknown inputs remain unknown rather than becoming zero.

Independently calculable horizon values remain available when another horizon input is unavailable.

### Backtesting

Backtesting protects:

- mean absolute error
- weighted absolute percentage error
- directional bias

WAPE and normalized bias remain unavailable when total actual demand is zero.

No historical comparison points produce unavailable accuracy rather than fabricated accuracy.

### Floating-point comparison

Forecast evaluation comparison normalizes finite numbers to twelve decimal places.

This normalization exists only in the test comparison layer.

It does not alter forecast runtime output, persisted numeric truth or algorithm behavior.

---

## M0.9.6 Decision scenario matrix

StoreAgent maintains a reviewed inventory-decision-v1 business regression matrix.

The evaluation runner invokes the canonical deterministic decision orchestrator directly.

It does not implement an alternate action-selection engine.

### Deterministic ownership

The decision layer owns commercial action classification.

AI does not choose:

- REORDER
- REDUCE
- PROMOTE
- WATCH
- HEALTHY

AI may later explain an already-determined action.

### REORDER

REORDER consumes the already-calculated deterministic recommended order quantity.

The decision layer does not recalculate replenishment quantities.

A positive trusted recommended quantity may produce REORDER.

Unknown critical replenishment evidence fails closed.

Known-zero incoming inventory remains distinct from unknown incoming state.

### REDUCE

REDUCE protects against additional inventory exposure.

It requires:

- trusted incoming inventory
- inventory position above target
- medium or high deterministic overstock risk

Existing excess stock with no incoming supply is not enough for REDUCE.

### PROMOTE

PROMOTE addresses excess inventory already on hand when demand-generation attention is supported.

V1 demand-pressure evidence includes:

- aged inventory
- falling demand
- known zero demand

Known zero demand remains distinct from unknown demand.

### Compatible actions

REDUCE and PROMOTE may be simultaneously valid.

When both are eligible:

REDUCE
-> primary action

PROMOTE
-> compatible secondary action

This is not treated as a contradiction.

### Conflicting actions

REORDER combined with REDUCE or PROMOTE represents contradictory commercial evidence.

The engine must not arbitrarily choose one.

The deterministic result becomes:

WATCH
high priority
low confidence
CONFLICTING_SIGNALS

### WATCH

WATCH represents material uncertainty or contradictory evidence.

Examples include:

- unknown inventory
- unknown incoming state
- unknown demand
- incomplete replenishment configuration
- unavailable deterministic forecast
- low forecast confidence
- conflicting commercial actions

WATCH is an explicit deterministic state rather than an AI judgment.

### HEALTHY

HEALTHY means trusted deterministic evidence supports no merchant intervention.

HEALTHY has:

- no action type
- no priority
- no recommended quantity
- explicit HEALTHY_NO_INTERVENTION reason

Optional inventory age, trend, or data-quality information does not by itself prevent HEALTHY when core evidence is trusted.

### Decision confidence

Decision confidence starts from deterministic forecast confidence.

The decision layer may keep or lower confidence.

It may never raise confidence above the forecast confidence supplied to it.

V1 data-quality boundaries:

- score >= 80: no data-quality confidence cap
- score 60-79: cap at MEDIUM
- score < 60: LOW

Conflict or material uncertainty forces LOW.

### Priority

Priority represents urgency.

Priority does not select the commercial action.

For example:

- critical REORDER may result from high stockout risk with coverage inside lead time
- conflicting WATCH is high priority
- ordinary uncertainty WATCH is medium priority

### Evidence snapshots

Persisted InventoryAction evidence copies decision-time deterministic truth.

The evidence builder does not recalculate metrics.

Unknown incoming state remains null in persisted action evidence.

Reason codes remain deterministic audit evidence.

### Matrix purpose

The decision scenario matrix protects StoreAgent against commercially dangerous regressions such as:

- buying inventory when evidence is contradictory
- suppressing a valid reorder because known zero was treated as unknown
- treating unknown incoming supply as zero
- reducing stock without incoming exposure
- promoting inventory without excess/demand-pressure evidence
- allowing uncertainty to become HEALTHY
- increasing decision confidence beyond forecast confidence
- losing compatible secondary interventions

---

## M0.9.7 Cross-tenant adversarial evaluation matrix

StoreAgent maintains a reviewed cross-tenant adversarial regression matrix.

The matrix executes the canonical tenancy, authorization, RLS and provider-binding boundaries directly.

It does not implement alternate authorization logic.

### Primary tenant boundary

Organization is the primary tenant boundary.

Authentication alone does not authorize organization access.

Tenant resolution requires:

- authenticated identity
- explicit requested organization
- matching user + organization membership
- independent requested-store ownership validation

StoreAgent never selects the first available organization automatically.

### Untrusted identifiers

A request-supplied identifier does not establish tenant ownership.

This includes:

- organization IDs
- store IDs
- provider external IDs
- canonical entity IDs

Trusted ownership must come from canonical membership, store ownership, provider binding or another approved trusted boundary.

### Store isolation

Authorization to an organization does not authorize a store owned by another organization.

Unknown stores fail closed.

A resolved store-scoped context cannot be reused against a different selected store.

### Role escalation

Role authority comes from trusted organization membership.

Client intent does not grant permissions.

The adversarial matrix protects against examples such as:

- operator -> member administration
- operator -> ownership transfer
- analyst -> action execution

### Service-role boundary

Service-role execution does not remove tenant isolation requirements.

Privileged operations require explicit trusted tenant scope.

Missing or blank organization scope fails closed.

Service credentials must never be treated as authorization to operate globally without tenant scope.

### Provider identity isolation

Durable provider identity is scoped by:

- organization
- integration
- provider
- resource type
- external ID

Identical external IDs in different organizations or integrations remain distinct identities.

### Provider rebinding

An existing provider identity may be:

- created when absent
- replayed idempotently when canonical identity agrees
- classified as conflict when canonical identity differs

Provider binding conflicts never silently rebind canonical identity.

An existing binding from one tenant namespace cannot be compared as though it belongs to another namespace.

### Ambiguous provider identity

If one provider resource maps to multiple canonical entities, the state is ambiguous.

Ambiguity must be surfaced rather than resolved by arbitrary ordering.

### RLS boundary

Membership control and sensitive configuration remain behind trusted server paths.

Ordinary clients do not receive generic mutation authority over protected tenant-control data.

### Positive control

The adversarial suite includes an authorized organization/store control.

This prevents a false security success where every operation is denied because tenant resolution itself is broken.

### Worker ownership

Worker payload spoofing, scheduled/event trigger scope resolution, duplicate execution and trusted worker ownership are evaluated in M0.9.8.

M0.9.7 intentionally does not recreate worker scope logic.

---

## M0.9.8 Worker / retry / concurrency evaluation matrix

StoreAgent maintains a reviewed worker-v1 regression matrix.

Worker evaluation follows the same architecture as metrics, forecasting, decisions and tenancy:

fixture input
-> scenario
-> approved golden
-> canonical worker implementation
-> regression comparison

### Infrastructure versus business truth

BackgroundJob execution state is infrastructure truth.

It does not replace canonical domain records such as:

- SyncRun
- ForecastRun
- InventoryAction

Infrastructure retry or queue state must not silently rewrite canonical business outcome.

### Idempotency

Logical worker identity is deterministic.

Identity includes:

- job type
- organization
- optional store
- logical operation key
- canonical subjects

Canonical subject ordering does not alter identity.

Material changes to operation or subject identity do alter identity.

Queue delivery time, worker attempt identity and lease identity are not part of logical idempotency.

### Duplicate delivery

At-least-once delivery is tolerated.

A new logical job may be created.

An existing non-terminal logical job is duplicate_active.

An existing terminal logical job is duplicate_terminal.

Duplicate enqueue and duplicate execution are separate concerns.

### Lifecycle

Worker lifecycle is explicit.

Examples:

queued
-> claimed
-> running

running
-> retry_wait
-> queued

running
-> succeeded / failed / cancelled

Terminal states do not silently re-enter execution.

### Lease recovery

A live lease requires no recovery.

An expired claimed lease may safely requeue because business execution has not started.

An expired running lease must enter retry_wait because partial execution may already have occurred.

Lease mutation requires the exact current owner and claim token.

### Retry

Retryability is deterministic.

Retryable failure classes include:

- transient_dependency
- rate_limited
- timeout
- lease_expired

Non-retryable examples include:

- validation
- authorization
- invariant_violation
- unsupported

The default V1 policy is:

max attempts: 5
base delay: 30 seconds
maximum delay: 1800 seconds

Backoff is deterministic exponential backoff without random jitter.

### Dead work

Terminal failure is durable dead work.

Terminal records remain tenant-scoped and carry sanitized technical evidence.

The evaluation contract never introduces credentials or raw provider payloads.

### Trusted execution scope

Queue subjects and trigger identifiers do not prove ownership.

Worker execution operates only after trusted organization/store scope has been established and canonical owned references agree with that scope.

Cross-organization or cross-store owned references fail closed.

### SyncRun separation

Worker states such as:

- queued
- claimed
- retry_wait

describe infrastructure mechanics.

They do not directly own SyncRun business status.

Explicit synchronization outcomes map separately to:

- running
- completed
- completed_with_errors
- failed
- cancelled

### Deterministic pipeline

The numeric-truth pipeline remains:

canonical data
-> metrics
-> forecast
-> decision
-> AI explanation

AI explanation cannot run before deterministic decision readiness.

Provider synchronization and notification delivery are outside the numeric-truth stage sequence.

### Trigger ownership

Scheduled and event trigger identifiers are routing/provenance only.

They never establish tenant ownership.

Trusted scope must be resolved separately from scheduler configuration, integration ownership or another canonical relationship.

---

## M0.9.9 Reproducibility and regression drift policy

StoreAgent distinguishes three concepts.

### Reproducibility

Reproducibility means that the same canonical deterministic truth produces the same deterministic identity and result.

For domains with canonical reproducibility fingerprints, the fingerprint incorporates the frozen deterministic identity owned by that domain.

Forecast reproducibility includes:

- algorithm versions
- input period
- configuration version
- canonical normalized input

Decision reproducibility includes:

- algorithm versions
- configuration version
- canonical decision input

Object property order does not create deterministic drift.

### Regression drift

Regression drift means that actual deterministic behavior no longer matches the explicitly approved golden output for the same scenario/configuration contract.

A golden mismatch is a failing evaluation.

The evaluation framework must not silently accept the new value.

### Intentional behavior change

An intentional business-truth change is not resolved by blindly updating expected output.

The change must be reviewed.

Depending on the change, reviewers must update the relevant identity deliberately:

- algorithm version
- configuration version
- fixture version
- scenario contract
- approved golden

The correct version boundary depends on what actually changed.

### Canonical fingerprint ownership

M0.9 does not create a second business fingerprint implementation.

Forecast fingerprint ownership remains in:

lib/forecasting/reproducibility.ts

Decision fingerprint ownership remains in:

lib/decision-engine/reproducibility.ts

Evaluation regression comparison does not replace those fingerprints.

It only compares actual deterministic behavior with reviewed golden behavior.

### Fingerprint drift

A material canonical input change must be detectable.

A configuration-version change must be detectable.

A material algorithm-version change must be detectable.

For forecast reproducibility, a material input-period change must also be detectable.

Object property ordering must not alter a fingerprint.

### Golden alignment

Before regression comparison:

- scenario ID must match golden scenario ID
- configuration version must match
- scenario expected output must be the approved golden expected output
- golden approval status must be approved
- review rationale must be non-empty

An artifact mismatch is an evaluation architecture error, not a business regression.

### CI regression gate

Metrics, forecast, decision, tenancy and worker matrices participate in the approved-golden regression gate.

If actual deterministic output differs from approved golden output, CI fails.

The failure must be investigated.

Allowed resolutions are:

1. implementation is wrong and implementation is corrected
2. business rule intentionally changed and deterministic versioning is updated
3. fixture evidence was wrong and fixture is explicitly corrected/versioned
4. approved golden itself was wrong and is explicitly reviewed/corrected

### No automatic golden regeneration

StoreAgent provides no automatic "accept current output" workflow.

Regression tests must not:

- rewrite golden files
- regenerate expected values from current production output
- approve goldens because CI failed
- derive reviewed business truth from the implementation under test

Golden changes are business-behavior changes and require review.

### Floating-point comparison

Forecast regression comparison preserves the existing evaluation-only finite-number normalization.

That normalization exists to prevent irrelevant floating-point representation noise.

It does not alter runtime forecast output, persisted truth or canonical forecasting algorithms.

### Review rule

When an approved golden changes, reviewers must answer:

- what deterministic rule changed?
- why should merchant-visible behavior change?
- which version identity changed?
- did fixture evidence change?
- are known-zero and unknown semantics preserved?
- does the change weaken a safety, tenancy or commercial invariant?

"Update expected output until CI passes" is never an acceptable answer.

---

## M0.9.10 AI numeric-mutation evaluation contract

StoreAgent treats deterministic inventory truth as read-only input to AI explanation.

AI does not own:

- forecast demand
- available inventory
- incoming inventory
- days of stock
- reorder point
- target stock
- stockout risk
- overstock risk
- data-quality score
- action type
- priority
- recommended quantity
- deterministic confidence
- deterministic reason codes

### Explanation role

AI may:

- explain deterministic evidence
- summarize a recommendation
- prioritize wording
- communicate a deterministic action clearly
- omit numeric facts that are not necessary for the explanation
- repeat deterministic numeric truth exactly

AI may not:

- alter a deterministic quantity
- invent incoming stock
- change forecast demand
- change risk classification
- increase or reduce deterministic confidence
- replace the deterministic action
- fabricate deterministic reason codes
- fabricate numeric confidence percentages that StoreAgent did not calculate

### Omission is allowed

AI is not required to repeat every deterministic field.

A missing claim is not a mutation.

This distinction prevents the evaluation contract from forcing verbose or unnatural explanations.

### Exact repetition is allowed

If AI communicates a deterministic fact, the claim must exactly match trusted truth.

For example:

deterministic recommended quantity = 40

"Reorder 40 units"

is allowed.

"Reorder 50 units"

is a numeric-mutation violation.

### Categorical confidence

StoreAgent V1 confidence is categorical:

- high
- medium
- low

There is no deterministic V1 confidence percentage.

An AI statement such as:

"90% confidence"

is unsupported numeric truth unless a future deterministic subsystem explicitly owns such a percentage.

### Structured claims boundary

M0.9 freezes the mutation contract, not a production LLM provider.

Merchant-facing explanation prose is not treated as the oracle for deterministic truth.

Future AI/provider implementations must expose factual claims through a structured boundary that can be checked against deterministic evidence before merchant delivery.

### Reason codes

AI may communicate or paraphrase deterministic reasons.

Structured deterministic reason-code claims must be a subset of the trusted reason codes supplied to the explanation layer.

AI may not fabricate a reason code that deterministic logic did not produce.

### M0 implementation boundary

M0.9.10 does not implement:

- OpenAI
- Anthropic
- Gemini
- prompt orchestration
- explanation persistence
- production AI worker execution

workers/explain-actions.ts remains unimplemented until its later roadmap milestone.

M0.9.10 freezes the contract that future implementation must satisfy.

---

## M0.9.11 Evaluation invariants

StoreAgent applies global invariants across all frozen V1 evaluation domains:

- metrics
- forecast
- decision
- tenancy
- worker
- ai

### Artifact completeness

Each evaluated domain must have:

- deterministic fixture evidence
- versioned evaluation scenarios
- explicitly approved golden outputs

Fixture, scenario and golden counts must remain aligned.

### Stable identity

Scenario IDs are globally unique.

Golden IDs are globally unique.

Every fixture case maps to exactly one scenario.

Every scenario maps to exactly one approved golden.

Array position and test execution order are never identity.

### Domain alignment

Fixture domain must equal scenario domain.

Scenario domain must equal the domain being evaluated.

A scenario may not silently consume another domain's golden identity.

### Configuration alignment

Scenario configurationVersion and approved golden configurationVersion must match exactly.

A configuration mismatch is an architecture error, not an acceptable regression.

### Fixture alignment

A golden fixture reference must match:

- source fixture ID
- source fixture version

Fixture evidence may not silently change while preserving stale fixture identity.

### Expected-truth ownership

Expected deterministic truth remains owned by approved goldens.

Fixture inputs do not own expected outputs.

Scenario expected output must equal the approved golden expected output.

### Review requirements

Every scenario must state at least one protected invariant.

Every golden must:

- be explicitly approved
- contain a non-empty review rationale

### Deterministic evaluation environment

Core evaluation contracts must not depend on:

- live network access
- live provider APIs
- AI providers
- billing providers
- runtime randomness
- current clock time
- automatic golden-writing workflows

### AI invariant severity

AI numeric-truth mutation violations are critical evaluation failures.

AI omission and exact truthful repetition remain allowed.

### No hidden oracle

No evaluation layer may create a second implementation of:

- inventory formulas
- forecasting
- decision rules
- tenancy authorization
- worker lifecycle
- AI numeric truth

Evaluation executes canonical production boundaries and compares behavior with reviewed artifacts.
