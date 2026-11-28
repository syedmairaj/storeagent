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
- **DOC-LAUNCH-1 (2026-11-28):** Launch-first commercial readiness. Prioritize first merchant revenue (Track A) over speculative AI expansion (Track B). CSV-first 5–10 merchant pilot feasible without bypassing Shopify gates. **AI-MKT-1.1** gates paid external research only — not core subscription launch with paid research disabled; progressive depth = bounded batch scan → selected validation → authorized deep research (reserve credits first; deterministic calc before LLM). Max two initial research adapters (1 general + 1 structured REST). **AI-MKT-DATA-0** priority structured Amazon candidates: **DataForSEO** and **Pangolinfo** (candidates only — not approved; no unbounded MCP); evaluate batched New Releases / category / keyword. **COMP-1** / **AI-MKT-3** Product Opportunity Scanner / **AI-MKT-4** consented comparable monitoring clarified (no new milestone). New Releases rank/reviews ≠ sales; missing title features ≠ absent features. Guarded Action & Delivery within M7/PB1; approval ≠ send/purchase/pay. Preserve M0.8 workers; KPIs never caps. Full record: `docs/DOC_LAUNCH_1_COMMERCIAL_READINESS_STRATEGY.md`.

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
- Background jobs reuse M0.8 contracts; production gaps closed without a second queue architecture or premature vendor lock (DOC-LAUNCH-1).

## V1 exclusions

- No full ERP.
- No WMS.
- No accounting replacement.
- No automatic purchase ordering.
- No automatic price changes.
- No warehouse picking/packing optimization.
- No autonomous supplier contact / payment / external mutation from approval alone (DOC-LAUNCH-1 Guarded Action & Delivery).
