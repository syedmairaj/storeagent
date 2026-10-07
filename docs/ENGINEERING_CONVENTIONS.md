# StoreAgent Engineering Conventions

## Architecture

StoreAgent is a modular monolith for V1.

Do not introduce microservices unless production workload proves they are necessary.

Primary layers:

- app/: Next.js routes, layouts and server entry points
- components/: presentation and product UI
- lib/commerce-domain/: provider-independent domain types
- lib/providers/: provider adapters and normalization
- lib/data-quality/: data trust rules
- lib/metrics/: deterministic inventory metrics
- lib/forecasting/: deterministic/statistical forecasting
- lib/decisions/: inventory recommendation generation
- lib/actions/: merchant action lifecycle
- lib/ai/: explanation and summarization only
- lib/tenancy/: organization/store boundaries
- lib/billing/: entitlement authority
- workers/: background workflows

## Truth boundary

Imported commerce data and explicit merchant configuration are authoritative.

Deterministic code owns:

- sales velocity
- days of stock
- safety stock
- reorder point
- target stock
- recommended quantity
- inventory value
- stockout estimates
- forecast values
- decision confidence

AI must not originate or modify these values.

## Dependency direction

Preferred direction:

provider input
-> canonical commerce domain
-> data quality
-> metrics
-> forecasting
-> decisions
-> actions
-> AI explanation
-> UI

Do not make lower-level deterministic modules depend on:

- React
- Next.js route code
- AI SDKs
- Stripe
- Shopify-specific types

## Provider independence

Canonical StoreAgent types must not contain provider-specific concepts unless represented as source metadata or provider bindings.

Shopify, CSV and future providers normalize into StoreAgent's canonical model.

## Determinism

For the same canonical input and algorithm version, deterministic calculations must return the same output.

No randomness inside:

- inventory mathematics
- forecasting baselines
- action generation
- confidence rules

unless a future algorithm explicitly requires it and is versioned.

## Money

Never use JavaScript floating-point values as the authoritative representation for persisted monetary values.

Database storage will use explicit numeric/decimal or integer minor-unit representations depending on the field.

Currency must always be explicit.

## Dates and time

Persist timestamps in UTC.

Store organization/store timezone separately.

Provider timestamps are normalized before deterministic processing.

Do not rely on the server machine timezone for commercial calculations.

## Nullability

Unknown data is different from zero.

Examples:

- unknown lead time != 0 days
- unknown cost != 0 cost
- unavailable inventory != 0 inventory

Never convert missing commercial data to zero merely for convenience.

## Failure behavior

Fail closed when trustworthy recommendations cannot be calculated.

Acceptable outcomes include:

- WATCH
- low confidence
- insufficient data
- quarantined input

Fabricated precision is never acceptable.

## Idempotency

The following must eventually be safe to retry:

- imports
- provider synchronization
- webhooks
- metric aggregation
- forecast generation
- action generation
- explanation generation

## Immutability

Historical evidence must not be silently rewritten.

Forecast runs, evidence snapshots and recommendation history are versioned artifacts.

A newer recommendation supersedes an older recommendation instead of mutating its historical evidence.

## Multi-tenancy

Every tenant-owned domain record must have a clear organization boundary.

No unscoped domain query is acceptable.

RLS and application-level organization resolution will both be tested.

## TypeScript

- strict mode is mandatory
- avoid `any`
- prefer unknown + validation at external boundaries
- external/provider payloads must be validated
- canonical types must not import provider SDK types
- exported deterministic functions should have explicit input/output types

## UI

UI follows docs/DESIGN_SYSTEM.md.

Business logic must not live inside React components.

Server-only code must remain server-only.

Interactive client components should be introduced only where interaction requires them.

## Testing

Important commercial formulas require unit and invariant tests.

Tenant boundaries require security tests.

Provider adapters require contract tests.

Cross-layer workflows require integration tests.

Merchant journeys require E2E tests.

Forecast models require backtesting before becoming production defaults.

## Repository hygiene

Do not commit:

- secrets
- .env files
- node_modules
- build output
- temporary Supabase state
- Playwright reports
- local editor configuration

Every milestone must finish with:

- typecheck
- lint
- tests
- production build
- git diff check
