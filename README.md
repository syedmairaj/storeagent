# StoreAgent.si

AI Inventory & Buying Agent.

## Product thesis

Data determines reality.

Deterministic forecasting and inventory logic calculate decisions.
AI explains, prioritizes, and communicates those decisions.

Merchants approve actions until automation earns trust.

## Current status

Canonical milestone state is `docs/IMPLEMENTATION_STATUS.md`.

Database drift prevention (Phase 1): `docs/DB_DRIFT_PREVENTION_PHASE1.md` — run `npm run check:migrations` before migration PRs. Local integrity checks PASS; GitHub Actions execution not yet verified; hosted JWT isolation remains BLOCKED. Do not promote local synthetic inventory/sales into production migrations or seeds.

NEXT STEP = M5.6D REVIEW (DO NOT MARK CLOSED WITHOUT EXPLICIT APPROVAL)

M5.5 persistence and recomputation are closed: implemented, tested, committed at `6dc4ed2`, and hosted migrations deployed. Verification did not recompute hosted merchant data. M5.6A source-event capture is closed at `b549fe0`, and M5.6B recompute-request generation is closed at `118d9b5`. Both hosted migrations are deployed. M5.6C worker orchestration is closed at `5cc0e6f` for local implementation and native local Supabase PostgreSQL 17 verification. M5.6D daily rollover is implemented and verified on native local Supabase PostgreSQL 17 but is not closed. Hosted M5.6A–D and M5.6E.3 **schema** migrations are deployed; hosted **runtime** is not verified. Recompute and rollover triggers remain disabled; no scheduler is configured. Schema verification is not runtime verification. Canary runbook (not executed): `docs/M5_6E_4_HOSTED_CANARY_RUNBOOK.md`. Handoff: `docs/M5_6_HANDOFF.md`.
