# StoreAgent project handoff

Bootstrap for new ChatGPT / Cursor sessions. Canonical detail: `docs/IMPLEMENTATION_STATUS.md`. M5.6/M5.7 worker detail: `docs/M5_6_HANDOFF.md`. Product roadmap (Gemini-aligned): `docs/StoreAgent_Master_Roadmap_2026_Updated_7_Day_Trial.docx` — do not overwrite casually.

## 1. Thesis and non-negotiables

Data determines reality. Deterministic forecasting and inventory logic calculate decisions. AI explains, prioritizes, and communicates those decisions. Merchants approve actions until automation earns trust.

- AI never owns quantities, dates, prices, confidence scores, or forecast/decision numeric truth.
- Fail closed on uncertainty; no sync≡complete; no fabricated forecasts.
- Provider-independent canonical domain; adapters normalize into it.
- Sequence: **M6 forecasting → M7 decisions → approval-gated buying**.

## 2. Baseline

| Field | Value |
|---|---|
| Repository | StoreAgent.si |
| Branch | `main` |
| HEAD | `6136874` — `feat(forecasting): add diagnostic evaluation reporting` |
| As-of | M6 hosted schema closeout (P1–P4d local + hosted migrations through `20261030200000`) |

Confirm with `git rev-parse HEAD` and `git log -1 --oneline` before editing.

## 3. Status matrix

| Area | Implemented | Local verified | Hosted verified | Planned / blocked |
|---|---|---|---|---|
| M5.6D daily rollover | Yes | Yes | Schema + E.4 Stage 4 support only | HTTP/cron/multi-store/TZ **blocked** |
| M5.7 adversarial | Yes | Yes (local) | F1/T4 schema only | Worker runtime **blocked** |
| M5 workers / cron / HTTP | Code present | — | **OFF (repo config)**; live host env **not verified** | Enablement **blocked** |
| E.4 canary queue | — | — | Intentionally `queued` dirty=2 claimed=1 | **Do not drain** |
| M6 P1–P4d (local) | Yes through `6136874` | Yes | — | Production forecast operation **NOT APPROVED** |
| M6 hosted schema | Yes | — | **CLOSED** through `20261030200000` | Schema ≠ operation |
| M6 production persist/publish/eval callers | Code present | Local/tests | Row counts verified **0** at closeout | Activation **blocked** |
| Live historical PIT replay | — | Fixture diagnostics only | Unsupported | Unsupported |
| M7 decisions | — | — | — | After M6 operational gates |
| CSV → Shopify → Woo → Amazon | Product locked | — | — | Planned |
| 7-day trial / decision-first UX | Product locked | — | — | Planned |

## 4. M5 snapshot

- **M5.6D:** CLOSED for implementation + native verification. Hosted schema deployed. Rollover HTTP **disabled**.
- **M5.7:** CLOSED for **local** adversarial engineering only. Hosted F1/T4 schema applied; worker runtime **unauthorized**.
- **Workers / cron / HTTP metric routes:** OFF by repo configuration (`.env.example` unset; no `vercel.json`/cron; gated internal routes only). Live hosting environment settings were **not** verified at M6 schema closeout.
- **E.4 canary:** Stages 0–4 closed; final request `queued` at `dirty_generation=2`, `claimed_generation=1` — leave untouched.
- Detail: `docs/M5_6_HANDOFF.md`.

## 5. M6 snapshot (through P4d + hosted schema)

Local implementation/testing committed on `main` through **`6136874`** (P1 → P4d).

| Phase | Commit(s) | Notes |
|---|---|---|
| P1 orchestrator | `cb5c371` | Deterministic forecast orchestrator |
| P2a commerce facts | `0df9666` | Bounded commerce adapter |
| P2b.1 evidence model | `d363c72`, `210f92d` | Promotion/coverage evidence |
| P2b.2a/b schema/RPCs/persistence | `d776876`, `aeff78d`, `37699c4` | Hosted `100000` / `110000` |
| P2b.2c.1 attestation | `e76a8cc` | Merchant attestation boundary |
| P2b.2c.3b outbox | `fb160e9` | Hosted `20261030120000` applied + verified |
| P2c.1 snapshot RPC | `92853fa` | Hosted `20261030130000` applied + verified |
| P2c.2–P2c.3 loader | `7f6ba7f`, `7cbd8e9` | Gated TS loader + E2E |
| P3b persistence | `c915079`, `6e40bbf` | Hosted `20261030140000` |
| P3d publication + fresh reader | `091a29c`, `a71faff`, `83c29b0` | Hosted `150000` / `160000` |
| P4a/P4b harness + integrity | `d4a91b2`, `24fa202` | Fixture-only diagnostics; live PIT unsupported |
| P4c evaluation persistence | `f179516`, `42c6111`, `4dfa844` | Hosted `20261030200000` |
| P4d diagnostic reporting | `6136874` | Pure-TS report; hard-false trust flags |

### Hosted schema closeout (verified)

- Linked project: `qlsqminsfdntpqdkhxjx` (`storeagent`).
- Migrations applied and verified: `20261030100000`, `20261030110000`, `20261030120000`–`20261030160000`, `20261030200000`.
- **Hosted schema readiness: CLOSED.** Production forecast operation remains **NOT APPROVED**.
- Correction-outbox: **7** commerce triggers installed; pending events **0** at verification.
- Hosted row counts at verification: `forecast_runs` / `sku_forecasts` / publications / `sku_forecast_current` / evaluation runs+scores all **0**.
- No evidence of automatic persist, publish, or evaluation activation.
- Diagnostic backtesting is **fixture-controlled PIT only**; live historical PIT replay remains **unsupported**.
- Production algorithm approval, automatic publication, and M7 activation are **separate future gates**.

### Open P1 tracks (non-blocking)

1. Defense-in-depth: revoke default PUBLIC/anon EXECUTE on correction-outbox **trigger functions** (optional; not required for schema close).
2. Verify live hosting env vars (`METRIC_*_WORKER_ENABLED` and any forecast activation flags) remain unset — repo gates checked; live host env **not** probed.

## 6. Next three engineering steps

1. Treat M6 hosted schema as closed; do **not** enable production persist/publish/eval callers without a new explicit approval.
2. Keep M5 worker/rollover HTTP and forecast workers/cron **OFF**; optionally complete live host-env verification (P1).
3. Next product/engineering gates remain separate: production algorithm approval, automatic publication, then **M7** decisions — not authorized by this closeout.

## 7. Hard bans

- Do not enable M5 or forecast workers, cron, or HTTP metric/rollover routes without explicit approval.
- Do not claim/recompute the E.4 canary grain left `queued` at dirty=2 / claimed=1.
- Do not treat hosted schema deploy as production forecast operation, algorithm approval, or M7 eligibility.
- Do not claim live historical PIT replay or merchant performance from fixture diagnostics.
- Do not start M7, buying automation, or provider connector expansion under a schema-closeout task.
- Do not stage/overwrite roadmap DOCX / `docs/archive/` unless the user explicitly asks.

## 8. Product north star (preserve)

From the master roadmap / October 2026 Gemini-aligned addendum (do not rewrite the DOCX here):

- M6 forecasting → M7 decisions → approval-gated buying.
- M7 decision classes: **REORDER / REDUCE / PROMOTE / WATCH**.
- Available-stock planning, multi-location isolation, lead-time, supplier MOQ / supplier intelligence.
- Connectors: **CSV → Shopify → WooCommerce → Amazon** (planned until built).
- **7-day trial** (not 14), premium **decision-first** UX.
- AI explains only; deterministic engines own numbers.

## 9. Canonical docs index

| Doc | Use |
|---|---|
| `docs/IMPLEMENTATION_STATUS.md` | Milestone truth |
| `docs/PROJECT_HANDOFF.md` | This file — session start |
| `docs/M5_6_HANDOFF.md` | M5.6/M5.7 worker contracts |
| `docs/M5_6E_4_HOSTED_CANARY_RUNBOOK.md` | Canary ops (do not drain dirty=2) |
| `docs/M5_6E_3_CANARY_ISOLATION_DECISION.md` | Org-scoped canary isolation |
| `docs/FORECASTING.md` | Forecast architecture |
| `docs/DECISION_ENGINE.md` | M7 decision contracts |
| `docs/SERVICE_ROLE_BOUNDARY.md` | RPC / mutation authority |
| `docs/BACKGROUND_JOBS.md` | Job orchestration contracts |
| Master roadmap DOCX | Product / Gemini-aligned plan |

## 10. How to start a new chat

1. Paste or open this file plus confirm HEAD (`6136874` or newer stated baseline).
2. Ask the agent for a **read-only** confirm of §3–7 before code or hosted changes.
3. State the single next task (default: **no production forecast activation** — await separate approval).
4. Preserve unrelated dirty-tree files; no drive-by docs or Git unless requested.
