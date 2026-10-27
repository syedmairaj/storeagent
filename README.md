# StoreAgent.si

AI Inventory & Buying Agent.

## Product thesis

Data determines reality.

Deterministic forecasting and inventory logic calculate decisions.
AI explains, prioritizes, and communicates those decisions.

Merchants approve actions until automation earns trust.

## Current status

Canonical milestone state is `docs/IMPLEMENTATION_STATUS.md`.

NEXT STEP = M5.6D REVIEW (DO NOT MARK CLOSED WITHOUT EXPLICIT APPROVAL)

M5.5 persistence and recomputation are closed: implemented, tested, committed at `6dc4ed2`, and hosted migrations deployed. Verification did not recompute hosted merchant data. M5.6A source-event capture is closed at `b549fe0`, and M5.6B recompute-request generation is closed at `118d9b5`. Both hosted migrations are deployed. M5.6C worker orchestration is closed at `5cc0e6f` for local implementation and native local Supabase PostgreSQL 17 verification. M5.6D daily rollover is implemented and verified on native local Supabase PostgreSQL 17 but is not closed. Hosted M5.6C and M5.6D migrations are not deployed; recompute and rollover triggers remain disabled; no scheduler is configured. Hosted metrics are not automatically recalculated, and hosted source events are not automatically consumed. The handoff is `docs/M5_6_HANDOFF.md`.
