# StoreAgent Frozen Decisions

These decisions come from the StoreAgent Master Product, Architecture & Delivery Roadmap.

## Product

- Cloud SaaS.
- Initial problem: inventory buying and replenishment decisions.
- CSV first.
- Shopify second.
- Core decisions: REORDER, REDUCE, PROMOTE, WATCH.
- Merchant approval before execution in V1.
- **DOC-GLOBAL-1 (2026-11-28):** Global, provider-independent AI Inventory / Market Intelligence / Buying Agent. Commercial launch markets **US, GB, CA, AU** (English-first). Registration targets 500/250/125/125 (not forecasts). UAE-first / AE-primary commercial geography **superseded**; Noon = regional example only. Full record: `docs/DOC_GLOBAL_1_FOUR_MARKET_LAUNCH_STRATEGY.md`.

## Architecture

- Provider-independent canonical commerce domain.
- Deterministic/statistical code owns numerical truth.
- AI explains and summarizes; AI does not calculate inventory truth.
- Evidence exists before recommendations.
- Derived artifacts are versioned/history-safe.
- Imports and jobs must be idempotent.
- Uncertain data fails closed.
- Data-quality problems must be visible.
- No forced Python or microservices at launch.

## V1 exclusions

- No full ERP.
- No WMS.
- No accounting replacement.
- No automatic purchase ordering.
- No automatic price changes.
- No warehouse picking/packing optimization.
