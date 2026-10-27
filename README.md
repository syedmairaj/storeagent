# StoreAgent.si

AI Inventory & Buying Agent.

## Product thesis

Data determines reality.

Deterministic forecasting and inventory logic calculate decisions.
AI explains, prioritizes, and communicates those decisions.

Merchants approve actions until automation earns trust.

## Current status

Canonical milestone state is `docs/IMPLEMENTATION_STATUS.md`.

NEXT STEP = M5.6C NATIVE LOCAL SUPABASE VERIFICATION AND REVIEW

M5.5 persistence and recomputation are closed: implemented, tested, committed at `6dc4ed2`, and hosted migrations deployed. Verification did not recompute hosted merchant data. M5.6A source-event capture is closed at `b549fe0`, and M5.6B recompute-request generation is closed at `118d9b5`. Both hosted migrations are deployed. M5.6C worker orchestration is implemented and verified on a local PostgreSQL role shim only. Native local Supabase verification is pending, the hosted migration is not deployed, and the worker is disabled. M5.6D is not started. Hosted metrics are not automatically recalculated, and hosted source events are not automatically consumed. The handoff is `docs/M5_6_HANDOFF.md`.
