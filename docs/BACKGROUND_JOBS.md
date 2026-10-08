# StoreAgent Background Job Architecture

## Purpose

StoreAgent background work must be:

- tenant-scoped
- purpose-scoped
- retry-safe
- observable
- deterministic where commercial truth is involved
- recoverable from worker interruption

M0.8 freezes architecture only.

It does not select or implement a production queue provider.

---

## M0.8.1 Worker tenancy and trusted scope

Workers do not inherit a human application role.

A background worker may execute with privileged/service-role infrastructure access, but privileged access does not remove tenant boundaries.

Every tenant-owned job must carry or safely derive:

- organizationId
- optional storeId
- explicit job purpose

Worker execution must reuse the frozen service-role policy.

### Declared scope is not sufficient proof

A worker payload may declare:

organizationId = Org A
storeId = Store A

but referenced canonical records must still be validated independently.

The worker must not assume that:

- storeId belongs to organizationId
- integrationId belongs to organizationId
- SyncRun belongs to organizationId
- ForecastRun belongs to organizationId
- variant/location/action IDs belong to the declared tenant

Ownership must be established from trusted canonical records.

### Cross-organization mismatch

Example:

organizationId = Org A
storeId = Store B

where Store B belongs to Org B.

Required outcome:

DENY before business processing.

### Store mismatch

For a store-scoped job, a referenced store-scoped canonical record must belong to the declared store.

Organization-level canonical records may remain storeId = null.

### Trusted scope source

Worker scope must originate from an already-authorized or trusted canonical operation.

Examples include:

- authenticated application operation creating scheduled work
- trusted Integration lookup after a verified provider event
- trusted canonical run record
- scheduler-created job whose canonical ownership is validated

Worker tenant scope must never be inferred from:

- provider external IDs
- arbitrary client organization IDs
- arbitrary webhook payload tenant fields
- Shopify GIDs
- CSV row identities

### Service-role access

Workers may eventually use service-role database access.

Every privileged query must still apply explicit organization scope before data is returned to business logic.

RLS bypass is not permission for broad unscoped queries.

### Purpose scope

Every worker job requires an explicit technical purpose.

M0.8.1 deliberately does not freeze the final job-purpose vocabulary.

That vocabulary is owned by M0.8.2.

### No queue implementation yet

M0.8.1 introduces no:

- queue vendor
- Redis dependency
- worker process runtime
- database migration
- scheduler
- cron implementation
- background API
- retry engine

Those are separate architecture concerns.

---

## M0.8.2 Job vocabulary and payload envelope

StoreAgent background execution uses a versioned infrastructure job envelope.

The job envelope is not a canonical commerce entity.

It does not replace:

- SyncRun
- ForecastRun
- InventoryAction
- ActionEvent
- DataQualityIssue

Those records retain their existing domain ownership.

### Initial job vocabulary

The frozen initial background-job vocabulary is:

- provider_sync
- provider_reconciliation
- metrics_aggregation
- forecast_generation
- action_generation
- explanation_generation
- notification_delivery

Adding or materially changing a job type requires an explicit architecture/version change.

### Envelope V1

Every V1 job carries:

- version
- jobType
- organizationId
- optional storeId
- idempotencyKey
- zero or more canonical subject references
- requestedAt

The envelope contains execution metadata and identifiers only.

### Subject references

A subject reference contains:

- resourceType
- resourceId

A subject reference does not prove:

- ownership
- authorization
- tenant membership
- canonical relationship validity

Workers must resolve referenced canonical records and apply M0.8.1 ownership validation before processing.

### Idempotency key

Every background job carries an idempotency key.

M0.8.2 only requires that the key be present and non-empty.

Exact deterministic key construction and replay semantics belong to M0.8.3.

### requestedAt

requestedAt is execution provenance.

It must be an explicit UTC ISO-8601 timestamp.

It is not:

- an order timestamp
- an inventory observation timestamp
- a forecast business window
- a merchant action timestamp

Business-event timestamps remain owned by canonical records.

### Payload prohibition

The generic job envelope must not carry commercial truth such as:

- forecast values
- sales velocity
- safety stock
- reorder point
- recommended order quantity
- action priority
- decision confidence

It must also not carry:

- access tokens
- refresh tokens
- API secrets
- provider credentials
- arbitrary raw provider payloads

Workers resolve authoritative data from trusted storage after tenant validation.

### Queue independence

The job contract is infrastructure-provider independent.

M0.8 does not yet select:

- Inngest
- Trigger.dev
- BullMQ
- pg-boss
- Redis
- Supabase queue infrastructure
- another hosted queue

A future runtime must adapt to this StoreAgent contract rather than redefining it.

---

## M0.8.3 Deterministic idempotency-key contract

Background job retries and duplicate deliveries must resolve to the same logical execution identity.

StoreAgent therefore owns deterministic job-level idempotency independently of any queue vendor.

### Logical identity

The V1 worker idempotency key is derived from:

- idempotency-key version
- job type
- organizationId
- optional storeId
- deterministic operationKey
- canonical subject references

Subject references are normalized and sorted before key construction.

Caller ordering must not change logical identity.

### operationKey

operationKey identifies the specific logical execution request.

Examples may include:

- canonical SyncRun ID
- canonical ForecastRun ID
- deterministic provider synchronization window
- metric aggregation business date/window
- notification digest period

Exact orchestration-specific operation-key rules are frozen by later M0.8 stages.

operationKey must not be:

- random queue message ID
- worker process ID
- attempt number
- lease ID
- delivery ID
- requestedAt timestamp

### Retry semantics

Retries of the same logical operation must reuse the same idempotency key.

A later independent execution must use a different logical operationKey.

Example:

forecast generation for ForecastRun A

and

forecast generation for ForecastRun B

are distinct logical jobs even if they target the same store.

### requestedAt exclusion

requestedAt is execution provenance only.

It must not participate in logical idempotency.

Otherwise a retry created at a different timestamp would incorrectly become new work.

### Tenant isolation

organizationId participates in idempotency identity.

The same operation key in two organizations must produce different job keys.

storeId also participates when present.

Organization-scoped work and store-scoped work are therefore distinct identities.

### Subject identity

Canonical subject references participate in job identity.

External provider identifiers must not be substituted for tenant ownership.

Subjects remain references only; worker ownership validation is still required under M0.8.1.

### Serialization

V1 uses deterministic JSON-array serialization.

This avoids ambiguous delimiter concatenation.

Identifier case is preserved.

### SyncRun relationship

Generic worker idempotency does not replace SyncRun.idempotencyKey.

They protect different boundaries:

- worker idempotency protects logical background execution / queue replay
- SyncRun.idempotencyKey protects canonical synchronization execution

For provider synchronization, orchestration must make these identities consistent and deterministic without collapsing the two concepts.

The exact SyncRun orchestration relationship is frozen in M0.8.9.

### Persistence enforcement

Pure key construction alone cannot prevent concurrent duplicate execution.

Persistence/queue infrastructure must eventually enforce uniqueness or atomic claiming.

Concurrency and duplicate-execution protection are owned by M0.8.8.

### Queue independence

Logical job identity must remain stable if StoreAgent changes background-job infrastructure.

Queue-vendor message IDs are infrastructure metadata, not StoreAgent business execution identity.

---

## M0.8.4 Job lifecycle and state-machine contract

StoreAgent background execution has an infrastructure lifecycle separate from canonical business-run lifecycles.

### Worker lifecycle states

The frozen V1 infrastructure states are:

- queued
- claimed
- running
- retry_wait
- succeeded
- failed
- cancelled

### Allowed transitions

Allowed state transitions are:

queued
-> claimed
-> cancelled

claimed
-> queued
-> running
-> cancelled

running
-> retry_wait
-> succeeded
-> failed
-> cancelled

retry_wait
-> queued
-> cancelled

Terminal states are:

- succeeded
- failed
- cancelled

Terminal jobs do not re-enter execution.

### Why claimed exists

`claimed` distinguishes:

- work merely available for execution
- work reserved by a worker
- work whose business execution has actually started

Claim/lease mechanics are frozen separately in M0.8.5.

### Why retry_wait exists

A retryable execution failure is not terminal failure.

retry_wait represents work that:

- failed an execution attempt
- is eligible for retry
- must wait until retry policy permits another attempt

Retry count and backoff rules belong to M0.8.6.

### Lifecycle separation

WorkerJobStatus is infrastructure state.

It does not replace:

- SyncRunStatus
- ForecastRunStatus
- InventoryActionStatus
- IntegrationStatus

Example:

A provider-sync worker may enter retry_wait because of a transient provider timeout while the related SyncRun remains a canonical synchronization record with its own lifecycle.

The orchestration layer is responsible for mapping infrastructure outcomes into domain-run status when appropriate.

### Cancellation

Cancellation stops further infrastructure execution.

Cancellation semantics must not silently rewrite immutable commercial evidence.

Whether a related domain run becomes cancelled, failed, or retains another state is owned by that domain's orchestration contract.

### Attempt count

Worker lifecycle snapshots may retain attemptCount.

An attempt represents execution that actually started.

Queue delivery, inspection, or claim alone must not increment attemptCount.

Exact attempt and retry semantics are frozen in M0.8.6.

### Timestamps

Worker lifecycle timestamps describe infrastructure execution only.

They do not replace:

- SyncRun.startedAt / finishedAt
- ForecastRun.startedAt / completedAt
- order timestamps
- inventory observation timestamps
- action-event timestamps

### Fail closed

Undefined state transitions are invalid.

Runtime implementations must not silently coerce or skip lifecycle states merely because a queue vendor exposes a different internal vocabulary.

---

## M0.8.5 Claim, lease and crash-recovery semantics

StoreAgent background jobs use lease-based execution ownership.

M0.8 freezes the semantics but does not implement the persistence mechanism.

### Atomic claim

A queued job may be claimed by one worker.

The future persistence/runtime implementation must make claiming atomic.

Two workers must not both successfully acquire the same active claim.

### Lease

A claim carries:

- ownerId
- claimToken
- claimedAt
- expiresAt

The lease describes temporary infrastructure ownership only.

It is not:

- tenant identity
- canonical resource identity
- job idempotency identity
- merchant identity

### Claim token

claimToken is opaque execution ownership.

A worker mutating leased work must prove both:

- expected ownerId
- expected claimToken

This prevents a stale worker from updating work after another worker has reclaimed it.

Claim-token generation belongs to runtime infrastructure.

The pure M0.8 architecture layer does not generate random tokens.

### Lease expiry

A lease is expired when:

now >= expiresAt

Lease timestamps must be explicit UTC timestamps.

expiresAt must be later than claimedAt.

### Claimed-job crash recovery

If a worker dies while a job is only `claimed` and the lease expires:

claimed
-> queued

No execution attempt has started, so the job can be made available again without pretending a business attempt failed.

### Running-job crash recovery

If a worker dies after execution entered `running` and its lease expires:

running
-> retry_wait

The job must not jump directly to queued.

Execution may have partially affected an external system or canonical persistence.

Passing through retry_wait preserves the fact that an execution attempt occurred and allows retry/idempotency policy to control the next attempt.

### Terminal jobs

Expired historical lease information must not revive:

- succeeded
- failed
- cancelled

Terminal states remain terminal.

### Heartbeats / lease extension

A future runtime may extend a lease while work is healthy.

Any extension must:

- require the active claim owner/token
- update expiry atomically
- never change logical job idempotency
- never grant tenant authorization

Exact heartbeat persistence mechanics are implementation concerns.

### Reclaiming is not new logical work

A recovered/reclaimed job retains the same:

- job envelope
- logical idempotency key
- canonical run references

A new claim token represents a new execution lease, not a new logical job.

### Persistence requirement

Claiming, lease renewal, expiry recovery and stale-owner rejection ultimately require transactional persistence guarantees.

Application-level in-memory checks alone are insufficient against concurrent workers.

The concrete persistence mechanism is selected after M0 architecture is complete.

---

## M0.8.6 Retry and backoff policy

StoreAgent owns retry semantics independently of the selected queue runtime.

### V1 default policy

The frozen default policy is:

- maximum execution attempts: 5
- initial retry delay: 30 seconds
- backoff: deterministic exponential
- maximum retry delay: 1800 seconds / 30 minutes
- random jitter: none in the canonical policy

The resulting early retry schedule is:

attempt 1 failure
-> 30 seconds

attempt 2 failure
-> 60 seconds

attempt 3 failure
-> 120 seconds

attempt 4 failure
-> 240 seconds

attempt 5 failure
-> terminal failure

### Attempt semantics

attemptCount is the number of execution attempts that have actually started.

The failed attempt currently being evaluated is included.

Therefore:

attemptCount = 1

means the first execution attempt started and then failed.

The following do not increment attemptCount:

- queue delivery
- job inspection
- successful claim
- lease renewal

Execution entering `running` owns attempt-count progression.

### Retryable failure classes

V1 retryable classes are:

- transient_dependency
- rate_limited
- timeout
- lease_expired

These represent failures that may reasonably succeed without changing the logical job request.

### Non-retryable failure classes

V1 non-retryable classes are:

- validation
- authorization
- invariant_violation
- unsupported
- unknown

These fail closed.

In particular, StoreAgent must not repeatedly retry authorization or deterministic validation failures.

Unknown failure classification is not treated as transient automatically.

### Exponential backoff

For a failed attempt:

delay =
baseDelaySeconds * 2^(attemptCount - 1)

The result is capped by maxDelaySeconds.

Backoff calculation is deterministic.

### No random canonical jitter

The StoreAgent retry contract does not use random jitter.

Randomness must not change canonical retry eligibility.

A future queue/runtime may distribute polling or delivery operationally, but it must not make a job eligible earlier than the StoreAgent retry policy permits.

Any future deliberate deterministic staggering policy requires an explicit architecture change.

### Retry lifecycle

A retryable failed execution follows:

running
-> retry_wait
-> queued
-> claimed
-> running

A non-retryable failure or exhausted attempt budget follows:

running
-> failed

### Logical identity remains unchanged

Retrying does not create a new logical job.

Retries preserve:

- WorkerJobEnvelope
- idempotencyKey
- operationKey meaning
- organization scope
- store scope
- canonical subjects

Execution-specific infrastructure may change:

- worker owner
- claim token
- lease timestamps
- attempt count

### Crash recovery

An expired lease from running execution is classified as `lease_expired`.

It therefore enters retry policy rather than silently becoming new work.

An expired lease from `claimed` work that never entered execution may be safely requeued without consuming another attempt.

### Terminal failure

Once maxAttempts is reached, another execution attempt is not permitted.

The infrastructure job becomes terminally failed.

M0.8.7 freezes what durable failure/dead-work information must be retained at that point.

### Queue independence

Queue-vendor retry defaults are not authoritative.

A production queue integration must be configured or wrapped so that StoreAgent's retry policy remains the source of truth.

---

## M0.8.7 Terminal failure and dead-work policy

Background jobs must never disappear silently after execution becomes terminally failed.

StoreAgent therefore treats terminal failed work as durable dead work requiring observability and explicit future resolution.

### Terminal failure

A worker job becomes terminally failed when:

- retry budget is exhausted
- deterministic validation fails
- authorization fails
- an invariant is violated
- the requested operation is unsupported
- a failure remains unknown and cannot safely be classified as transient

Retryable failures must not become terminal merely because one attempt failed.

### Terminal failure reasons

The frozen V1 terminal reasons are:

- retry_exhausted
- validation_failed
- authorization_failed
- invariant_violation
- unsupported
- unknown_failure

### Dead work

A terminally failed worker job is dead work.

Dead work is not automatically deleted.

It must remain observable for:

- debugging
- operator remediation
- merchant-impact assessment
- later controlled replay or replacement
- incident analysis

A future runtime may implement a queue-specific dead-letter mechanism, but queue DLQ state is not StoreAgent's canonical failure semantics.

### Required terminal failure evidence

Terminal failure evidence retains:

- logical idempotency key
- job type
- organizationId
- optional storeId
- attempt count
- terminal reason
- stable technical error code
- sanitized technical error summary
- failedAt timestamp

This is infrastructure evidence.

It does not replace canonical SyncRun or ForecastRun error/status fields.

### No secrets

Terminal failure records must not persist:

- access tokens
- refresh tokens
- API keys
- credential material
- service-role keys
- arbitrary raw provider payloads

Diagnostics must be sanitized before durable persistence.

### No silent commercial mutation

Terminal job failure does not authorize the worker layer to rewrite canonical commercial truth.

The failure layer must not invent or modify:

- inventory
- demand
- metrics
- forecasts
- recommendations
- decision confidence

Domain-specific orchestration decides how related canonical run records reflect the terminal execution result.

### Retry exhaustion

When a retryable failure reaches maxAttempts:

running
-> failed

with reason:

retry_exhausted

The logical job identity remains unchanged.

### Non-retryable failure

Validation, authorization, invariant and unsupported failures go directly from running to terminal failure.

They must not enter repeated retry loops.

### Unknown failures

Unknown failures fail closed.

StoreAgent does not assume that an unclassified failure is transient.

This prevents infinite retry loops around deterministic defects.

### Cancellation and success

succeeded and cancelled are terminal infrastructure states but are not dead work.

Dead-work handling applies specifically to terminal failed execution.

### Future operator recovery

A future operator workflow may support:

- inspect
- acknowledge
- remediate
- explicitly replay
- supersede with a new logical job

Replay semantics must never silently bypass:

- tenant validation
- idempotency rules
- retry limits
- canonical domain ownership

Those operational controls are implementation work after M0 architecture is complete.

---

## M0.8.8 Concurrency and duplicate-execution protection

StoreAgent must remain correct when:

- the same logical job is enqueued more than once
- multiple workers poll concurrently
- a worker crashes and another worker reclaims execution
- a stale worker resumes after ownership has changed

Application-level best effort is insufficient.

### Duplicate enqueue

The logical idempotency key is the uniqueness boundary for background work.

If no job exists for the key:

create

If an active job exists for the same key:

duplicate_active

If a terminal job exists for the same key:

duplicate_terminal

A duplicate enqueue does not create another logical job.

### Active logical states

The following states still represent active logical work:

- queued
- claimed
- running
- retry_wait

An enqueue using the same idempotency key while any of these states exists is a duplicate.

### Terminal duplicate

The following are terminal:

- succeeded
- failed
- cancelled

Submitting the same logical idempotency key again must not silently create replacement work.

Explicit future replay or supersession requires a deliberate operator/orchestration policy.

### Persistence uniqueness

The future persistent job store must enforce uniqueness for logical idempotency identity.

A pattern such as:

SELECT existing job
-> none found
-> INSERT job

without transactional/unique enforcement is unsafe.

Two concurrent producers may both observe no existing row.

Therefore logical uniqueness must ultimately be enforced atomically by persistence or equivalent queue infrastructure.

### Atomic claim

Claiming executable work must be atomic.

Two workers must not both transition the same queued job into independent active claims.

The runtime must provide semantics equivalent to:

eligible job
-> exactly one active lease

### Lease fencing

Every mutation made by leased execution must prove:

- current ownerId
- current claimToken

If ownership has changed, the stale worker must be rejected.

This applies even if the stale worker still believes its previous lease was valid.

### Reclaim after crash

Reclaiming a job:

- does not create a new logical job
- does not change idempotencyKey
- does create a new claim token
- may use a different worker owner
- follows the M0.8.5 crash-recovery policy
- follows the M0.8.6 attempt/retry policy when execution had already started

### Duplicate execution versus duplicate enqueue

These are separate concerns.

Idempotency-key uniqueness protects against duplicate logical enqueue.

Atomic claim and lease fencing protect against simultaneous or stale execution.

StoreAgent requires both.

### Side-effect safety

Infrastructure uniqueness alone cannot guarantee that every external side effect executes exactly once.

Workers must therefore combine:

- logical idempotency
- canonical persistence constraints
- provider/resource idempotency
- safe retry design
- claim fencing

Where an external provider exposes its own idempotency facility, later integration code should use it when appropriate.

### Exactly-once claim

StoreAgent does not assume distributed systems provide universal exactly-once execution.

The architecture targets:

- at-least-once delivery tolerance
- deterministic logical identity
- single active lease
- idempotent/replay-safe effects
- stale-worker fencing

This is stronger and more realistic than depending on queue marketing guarantees.

### Tenant scope

Concurrency protection never replaces tenant authorization.

A job that wins a claim must still pass M0.8.1 tenant/ownership validation before commercial processing.

### No commercial truth

Concurrency infrastructure does not calculate or modify:

- metrics
- forecasts
- inventory decisions
- confidence
- reorder quantity

It protects execution only.

---

## M0.8.9 SyncRun orchestration boundary

Provider synchronization background jobs orchestrate canonical SyncRun records.

They do not replace them.

### Ownership boundary

Worker job:

- owns infrastructure execution lifecycle
- owns claim/lease state
- owns retry timing
- owns worker attempt count
- owns worker terminal failure evidence

SyncRun:

- owns canonical synchronization execution
- owns integration relationship
- owns canonical synchronization idempotency key
- owns synchronization counts
- owns cursor progression
- owns reconciliation/error summary
- owns canonical startedAt / finishedAt
- owns canonical synchronization status

### Provider sync flow

The required orchestration sequence is:

1. receive provider_sync job
2. validate worker tenant scope
3. resolve canonical SyncRun
4. resolve canonical Integration
5. validate SyncRun and Integration ownership against job scope
6. acquire/validate execution lease
7. execute provider synchronization through provider adapters
8. persist canonical synchronization/reconciliation results
9. update SyncRun business status/counts/cursors/errors
10. complete worker infrastructure lifecycle

Provider external identifiers never establish tenant ownership.

### Status separation

WorkerJobStatus and SyncRunStatus are separate state machines.

The following worker infrastructure states do not directly represent canonical SyncRun outcome:

- queued
- claimed
- retry_wait

In particular:

retry_wait != SyncRun failed

A transient worker failure may leave the SyncRun logically in progress while StoreAgent waits for another execution attempt.

### Explicit synchronization outcomes

Canonical status changes occur from explicit orchestration outcomes.

Synchronization started:

SyncRun.status = running

Synchronization completed without material errors:

SyncRun.status = completed

Synchronization completed with accepted/quarantined partial errors:

SyncRun.status = completed_with_errors

Execution became terminally failed:

SyncRun.status = failed

Explicit synchronization cancellation:

SyncRun.status = cancelled

### Counts

Worker infrastructure does not fabricate SyncRun counts.

The canonical counts remain:

- discovered
- imported
- updated
- skipped
- quarantined
- failed

They must originate from actual provider ingestion/reconciliation execution.

Queue delivery count, worker attempts and retry count are not synchronization counts.

### Cursor ownership

cursorBefore and cursorAfter belong to SyncRun/provider synchronization semantics.

Worker retry infrastructure must not invent or advance provider cursors.

Cursor advancement must occur only through valid provider synchronization orchestration.

### Error ownership

Worker terminal failure evidence and SyncRun.errorSummary are related but different.

Worker failure evidence describes infrastructure execution failure.

SyncRun.errorSummary describes canonical synchronization outcome.

Orchestration may project sanitized relevant failure information into SyncRun.errorSummary when appropriate.

It must not copy secrets or arbitrary raw provider payloads.

### Idempotency relationship

Worker-job idempotency and SyncRun idempotency protect different boundaries.

Worker job idempotency protects:

- duplicate enqueue
- queue redelivery
- worker replay

SyncRun idempotency protects:

- duplicate canonical synchronization execution

Provider-sync orchestration must bind both identities deterministically to the same logical synchronization request.

They remain explicit separate values.

The worker layer must not silently regenerate or replace SyncRun.idempotencyKey.

### Retry behavior

A provider synchronization retry retains:

- the same logical worker job
- the same worker idempotency key
- the same canonical SyncRun
- the same SyncRun idempotency key

A retry does not create another SyncRun merely because another worker attempt started.

### Crash behavior

If execution crashes before business processing starts:

claimed
-> queued

No new SyncRun is created.

If execution crashes after business execution starts:

running
-> retry_wait

The existing SyncRun remains the canonical synchronization record.

Retry orchestration must inspect canonical state before resuming so that already-persisted work is not blindly duplicated.

### No provider logic in orchestration contract

This architecture layer does not:

- parse Shopify payloads
- parse CSV rows
- normalize products/orders/inventory
- calculate provider bindings
- calculate reconciliation counts

Those responsibilities remain in the provider adapter and reconciliation layers.

### No commercial truth

SyncRun orchestration does not calculate:

- sales velocity
- forecast values
- reorder points
- recommended quantities
- inventory decisions

Its responsibility is synchronization execution coordination only.

---

## M0.8.10 Metrics, forecast and decision pipeline orchestration

StoreAgent background orchestration coordinates deterministic intelligence stages without becoming a second calculation engine.

### Frozen pipeline order

The V1 inventory-intelligence dependency order is:

canonical commerce data
-> deterministic metrics
-> deterministic forecast
-> deterministic inventory decision
-> AI explanation

A later stage may not bypass an incomplete prerequisite stage.

### Canonical data prerequisite

Metrics may run only after trusted provider-independent canonical commerce data has been persisted.

The worker pipeline does not consume:

- arbitrary provider payloads
- Shopify response objects
- CSV rows directly
- provider SDK types

Provider adapters and synchronization own translation into canonical data.

### Metrics ownership

The metrics layer remains the owner of deterministic inventory formulas.

Examples include:

- sales velocity
- days of stock
- safety stock
- reorder point
- target stock
- recommended order quantity
- sell-through
- inventory age
- demand trend
- stockout risk
- overstock risk
- valid incoming purchase-order quantity

Worker orchestration does not duplicate these formulas.

### Metric completion versus known value

metricsReady means the deterministic metrics stage completed.

It does not mean every metric has a non-null value.

Unknown data remains unknown and is represented through the existing metric result/reason-code contracts.

Known zero must remain distinct from unknown.

### Forecast ownership

Forecasting remains composed from the frozen deterministic forecasting modules, including:

- history sufficiency
- stockout censoring
- promotion treatment
- weighted demand
- trend adjustment
- cold-start handling
- confidence
- horizon calculation
- backtesting
- reproducibility

The worker orchestration layer does not create a parallel forecasting algorithm.

### Forecast completion versus available forecast

forecastReady means the deterministic forecasting stage completed.

It does not guarantee that daily demand or horizon demand is non-null.

An unavailable deterministic forecast is still a valid completed forecast outcome when evidence is insufficient.

Downstream decision logic receives that uncertainty rather than fabricated demand.

### Decision ownership

The final deterministic inventory decision remains owned by the existing decision engine.

The worker layer does not choose:

- REORDER
- REDUCE
- PROMOTE
- WATCH
- HEALTHY

The worker layer also does not calculate:

- decision priority
- recommended quantity
- decision confidence
- decision reason codes

Those remain deterministic decision-engine outputs.

### Decision prerequisite

Decision execution requires:

- canonical data stage complete
- metrics stage complete
- forecast stage complete

The forecast may contain unavailable/null values.

The decision engine must receive those unknowns honestly and may therefore resolve to WATCH.

### AI boundary

AI explanation may run only after deterministic decision completion.

AI may:

- explain the deterministic result
- summarize evidence
- communicate merchant implications
- format or prioritize presentation based on existing deterministic truth

AI must not:

- calculate metrics
- generate numeric forecast truth
- assign forecast confidence
- choose inventory action type
- calculate recommended order quantity
- override decision thresholds
- convert WATCH into a commercial intervention

### HEALTHY and WATCH

Pipeline completion does not imply a commercial action exists.

A completed deterministic decision may legitimately produce:

- HEALTHY
- WATCH

Those are valid outcomes.

The orchestration layer must not treat them as incomplete processing.

### Stage readiness

The infrastructure orchestration contract tracks readiness only:

canonicalDataReady
metricsReady
forecastReady
decisionReady

These readiness flags describe pipeline progression.

They are not commercial values.

### Failure behavior

A stage must fail closed if an upstream prerequisite has not completed.

Examples:

forecast before metrics
-> blocked

decision before forecast stage completion
-> blocked

AI explanation before deterministic decision
-> blocked

The worker must not fabricate missing upstream results merely to continue the pipeline.

### Reproducibility

Metrics, forecast and decision outputs remain governed by their existing deterministic/versioned contracts.

Worker retries must not change their numeric truth merely because:

- worker owner changed
- claim token changed
- attempt count changed
- execution timestamp changed

For identical canonical inputs and configuration, deterministic outputs remain reproducible.

### No worker numeric engine

workers/pipeline.ts owns:

- stage mapping
- prerequisite validation
- orchestration ordering

It does not own numerical inventory intelligence.

This prevents the background-job layer from becoming an unauthorized second source of commercial truth.

---

## M0.8.11 Scheduled and event-triggered execution boundary

StoreAgent supports background work initiated by schedules and trusted events.

A trigger requests consideration of work.

A trigger does not itself authorize tenant access.

### Trigger kinds

The frozen V1 trigger categories are:

- scheduled
- event

Scheduled triggers represent time-based orchestration.

Event triggers represent a trusted external or canonical change signal.

### Trigger request

A trigger request may identify:

- job type
- trigger provenance
- stable logical operation key
- canonical subject references

Raw trigger data does not own tenant scope.

### Tenant resolution

Tenant scope must be resolved separately from trusted relationships.

For scheduled execution, trusted scope may come from previously authorized scheduler configuration referencing canonical StoreAgent records.

For provider events, the required pattern is:

verified provider event
-> trusted Integration lookup
-> Integration.organizationId
-> optional validated Store relationship
-> worker scope

The following is forbidden:

untrusted event body
-> arbitrary organizationId
-> privileged worker execution

### Integration events

An Integration-backed event carries an Integration identity for trusted resolution.

The event source identifier is not itself tenant authorization.

The Integration record must be loaded from trusted persistence and its organization ownership validated before worker execution.

### Canonical events

Internal canonical events may identify a canonical entity.

The canonical relationship must still be resolved and validated under the worker tenant model.

### Trigger provenance

triggerKey records stable trigger provenance.

Examples may include:

- scheduler definition identity
- verified provider event identity
- canonical event identity

triggerKey is not automatically the worker logical idempotency key.

### Idempotency

Every triggered worker job must still pass the M0.8.3 deterministic idempotency contract.

Trigger delivery identity must not silently redefine logical work.

Example:

provider event delivery A
and redelivery B

may both refer to the same logical synchronization request.

If the orchestration operationKey is identical, they produce the same worker logical idempotency identity.

### Scheduled execution

A scheduler firing twice must not automatically create two logical jobs.

Logical work is determined by the explicit deterministic operationKey and StoreAgent idempotency contract.

Scheduler invocation IDs and execution timestamps are not sufficient logical identities.

### Event redelivery

Provider/webhook/event systems commonly redeliver events.

StoreAgent assumes at-least-once event delivery is possible.

Therefore event processing must tolerate:

- duplicate event delivery
- delayed delivery
- reordered delivery where the provider permits it

Duplicate-enqueue protection still applies.

### Verification boundary

Provider-specific webhook authentication and signature verification belong to the provider/webhook boundary.

Generic worker trigger policy does not implement:

- Shopify HMAC verification
- provider-specific signature parsing
- provider-specific event schema validation

Only verified/trusted event handling may resolve an Integration into tenant scope.

### Canonical subject references

Trigger subjects are identifiers only.

They do not prove:

- organization ownership
- store ownership
- authorization
- canonical relationship validity

M0.8.1 ownership validation still applies before execution.

### No trigger commercial truth

Triggers do not calculate or alter:

- metrics
- forecasts
- action types
- recommended quantities
- decision confidence

A trigger starts orchestration only.

### Queue and scheduler independence

The trigger contract does not depend on:

- Vercel Cron
- Inngest
- Trigger.dev
- BullMQ
- pg-boss
- Redis
- Supabase queue infrastructure

A future runtime adapts schedules/events into this StoreAgent contract rather than redefining its authorization or idempotency semantics.

---

## M0.8.12 Observability and safe payload/logging rules

StoreAgent background work must be diagnosable without turning logs into an uncontrolled copy of business or provider data.

### Structured telemetry

Worker observability uses structured events.

The minimum correlation context includes:

- logical worker idempotency key
- job type
- organizationId
- optional storeId
- optional executionId
- optional canonical run ID
- optional attempt count

### Correlation identities

Each identifier has a separate purpose.

idempotencyKey:
logical background work identity

executionId:
one runtime execution correlation identity

ownerId + claimToken:
lease ownership

canonicalRunId:
related SyncRun, ForecastRun, or equivalent canonical execution record

organizationId / storeId:
tenant scope

These identities must not be collapsed into one overloaded identifier.

### Telemetry events

The frozen V1 event vocabulary includes:

- job_enqueued
- job_duplicate
- job_claimed
- job_started
- job_retry_scheduled
- job_succeeded
- job_failed
- job_cancelled
- lease_expired
- scope_denied
- pipeline_blocked

### Levels

Telemetry supports:

- info
- warn
- error

The exact production routing of these levels belongs to the future logging/runtime integration.

### Safe diagnostic content

Telemetry may include:

- stable technical reason code
- sanitized technical message
- lifecycle state
- attempt count
- tenant-scoped identifiers
- canonical run identifiers
- timestamps
- duration/latency when later implemented

Telemetry must not become the source of canonical commercial truth.

### Prohibited log content

Worker telemetry must not persist arbitrary:

- access tokens
- refresh tokens
- API keys
- service-role credentials
- credential headers
- session secrets
- raw webhook bodies
- raw Shopify/provider payloads
- complete CSV rows
- arbitrary customer records

Provider payloads must be normalized and sanitized before any relevant technical evidence is emitted.

### Error logging

Do not serialize an arbitrary caught object directly into durable logs.

Production code should prefer:

- stable error code
- sanitized summary
- explicit safe metadata

over:

- full request payload
- provider response body
- credential-bearing headers
- uncontrolled object serialization

### Terminal failure relationship

WorkerTelemetryEvent and WorkerTerminalFailureRecord are separate concepts.

Telemetry is operational observation.

Terminal failure evidence is durable failed-work state.

Logging a failure does not replace persistence of terminal failure/dead-work evidence.

### Canonical run relationship

Observability does not replace:

- SyncRun.errorSummary
- ForecastRun evaluation metadata
- DataQualityIssue
- InventoryAction evidence

Those remain canonical domain artifacts.

Logs correlate to them by identifier when appropriate.

### Tenant safety

Logging must not weaken tenant isolation.

organizationId and storeId may be used for scoped correlation, but service-role logging code must never retrieve broad cross-tenant data merely to enrich a log message.

### UTC timestamps

Worker telemetry timestamps use explicit UTC ISO-8601 values.

Execution timestamps remain infrastructure provenance, not business-event timestamps.

### Vendor independence

The M0 observability contract does not choose:

- Sentry
- Datadog
- New Relic
- Better Stack
- Axiom
- Pino
- Winston
- another logging provider

A later implementation may emit this structured contract into an appropriate provider.

### No direct console ownership

The architecture helper builds validated telemetry objects.

It does not own console output, network delivery, or durable logging persistence.

Those concerns belong to the future runtime adapter.

### No commercial calculation

Observability must never calculate or override:

- sales velocity
- forecast demand
- safety stock
- reorder point
- recommended quantity
- action type
- action priority
- forecast or decision confidence

It observes execution only.

---

## M0.8.13 Background-job invariants

The following invariants apply across the complete StoreAgent background-work subsystem.

These rules are architectural gates, not runtime suggestions.

### Invariant 1 — Worker execution is tenant scoped

Every privileged worker operation requires trusted organization scope.

Store scope is also required where the operation is store-specific.

Trigger identifiers, provider identifiers and queue metadata never establish tenant ownership.

### Invariant 2 — Logical identity is deterministic

A logical job is identified by deterministic StoreAgent idempotency semantics.

Retry attempts, lease changes, queue delivery IDs, worker ownership and timestamps do not create replacement logical identity.

### Invariant 3 — Duplicate enqueue is not duplicate logical work

Repeated submission of the same logical idempotency key must resolve to the existing active or terminal logical job.

It must not silently create another logical job.

### Invariant 4 — Only one active lease owns execution

Concurrent delivery does not authorize concurrent mutation.

Execution ownership is fenced by current ownerId and claimToken.

A stale worker must fail closed.

### Invariant 5 — Delivery is allowed to be at least once

StoreAgent does not depend on universal exactly-once queue semantics.

Correctness comes from:

- deterministic logical identity
- atomic persistence uniqueness
- single active lease
- stale-worker fencing
- idempotent/replay-safe effects

### Invariant 6 — Retry state is infrastructure state

retry_wait does not mean canonical business execution failed.

SyncRun, ForecastRun and future canonical execution records retain their own business state machines.

### Invariant 7 — Canonical runs remain canonical

Worker jobs do not replace:

- SyncRun
- ForecastRun
- reconciliation evidence
- DataQualityIssue
- InventoryAction evidence

Workers orchestrate these records.

They do not redefine them.

### Invariant 8 — Deterministic truth flows forward only

The frozen inventory-intelligence order is:

canonical commerce data
-> deterministic metrics
-> deterministic forecast
-> deterministic decision
-> AI explanation

Later stages may not bypass incomplete earlier stages.

### Invariant 9 — Unknown is never fabricated into known truth

A completed metrics or forecasting stage may legitimately contain null/unknown values with explicit reason codes.

Workers do not fabricate numeric values merely to continue execution.

Known zero remains distinct from unknown.

### Invariant 10 — AI is downstream of deterministic truth

AI may explain, summarize, prioritize presentation and communicate deterministic results.

AI does not own:

- inventory quantities
- sales velocity
- forecast demand
- forecast confidence
- reorder point
- safety stock
- recommended order quantity
- inventory action type
- decision confidence

### Invariant 11 — Terminal failure remains observable

Terminal failed work becomes durable dead work.

It must not disappear silently merely because retry budget was exhausted or execution became non-retryable.

### Invariant 12 — Logs are evidence, not a shadow database

Telemetry may correlate execution by safe identifiers.

It must not become an uncontrolled copy of:

- provider payloads
- credentials
- webhook bodies
- CSV rows
- customer records
- commercial truth

### Invariant 13 — Provider and queue vendors remain adapters

StoreAgent worker architecture does not depend on the semantics of a specific:

- provider SDK
- queue vendor
- scheduler vendor
- logging vendor
- AI provider

Infrastructure adapts to StoreAgent contracts.

StoreAgent contracts do not adapt their correctness rules to vendor-specific behavior.

### Invariant 14 — Worker attempts do not change deterministic truth

For the same canonical input and deterministic configuration:

- a retry
- a different worker
- a new lease token
- a later execution timestamp

must not by themselves change metrics, forecast or decision truth.

### Invariant 15 — Workers orchestrate; domain modules calculate

The worker subsystem owns:

- execution intent
- tenancy enforcement
- job lifecycle
- claim/lease semantics
- retries
- duplicate protection
- trigger boundaries
- stage ordering
- telemetry correlation

Domain modules remain the owners of commercial calculation and canonical records.
