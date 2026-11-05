# M6-PE1.b.4a — Synthetic Lifecycle Isolation Preflight

**Mode:** PREFLIGHT + CONTRACT ONLY. No SQL execution, migrations, resets, test-data writes, hosted connections, workers/cron, live publication, production eligibility, PB1/M7 changes, E4, AI, purchasing, or inventory mutation.
**As-of:** 2026-11-05
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Baseline requested:** `main` @ `81963c5`
**Verified HEAD:** `81963c5798dc41ae37189d6ce87f0eb33a9e476b` — `docs(forecast): close PE1.b.3 policy decision readiness`
**Branch:** `main`
**Dirty tree:** Unrelated dirty/untracked preserved; **only this file** added for PE1.b.4a.
**Parents / authority:**
- `docs/M6_PE1_B3_PRODUCTION_POLICY_DECISION_PACKET.md` **§H** (Env-A isolation + §H.5 PE1.b.4 milestone)
- `docs/M6_PE1_FORECAST_ELIGIBILITY_READINESS.md` (PE1.a binder readiness)
- `docs/M6_PE1_B_CANARY_FORECAST_ELIGIBILITY_POLICY.md` + PE1.b.1 evaluator
- M6 P1–P4 forecast lifecycle modules, migrations, live/adversarial tests
- Local `supabase/config.toml` + live-test isolation helpers
**Authority when docs conflict:** this freeze for **offline synthetic single-grain lifecycle isolation preflight and PE1.b.4b scope only**. Does **not** authorize PE1.b.4b implementation, synthetic execution, UUID production allowlisting, attestation activation, or PE1.c.

---

## 0. Executive verdict

| Question | Verdict |
|---|---|
| Environment isolation **contract** (local-only, no remote fallback, no merchant deps) | **PASS** |
| Local DB **runtime** up + M6 migrations applied | **UNKNOWN** (intentionally not probed) |
| Combined calculate → persist → publish → fresh-read → PE1.a → PE1.b.1 live suite | **MISSING** (expected; = PE1.b.4b) |
| Hard-false SQL / PE1.a / PE1.b.1 / PB1 gates preserved in source | **PASS** (static) |
| Workers / cron / `vercel.json` | **PASS** (disabled / absent) |
| Synthetic Env-A UUID namespace minted for PE1.b.4 | **NOT YET** (must be test-local in 4b; not production allowlist) |
| Production / merchant / PE1.c / attestation activation | **NO-GO** |
| **GO/NO-GO for synthetic execution** | **CONDITIONAL GO** — proceed to PE1.b.4b implementation under gates in §E; **NO-GO** to run until runtime DB + migration probes pass inside 4b |

**One-line:** Offline synthetic lifecycle isolation is **contract-ready**; staged M6 adapters and PE1.a/b.1 evaluators exist; a single-grain Env-A live binder test does **not** yet exist and local runtime state is **unverified** this session.

---

## A. Environment isolation verdict

### A.1 Git / tree — VERIFIED

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `81963c5` (matches baseline) |
| Relevant ancestors | PE1.a → PE1.b.1 → PE1.b.2/b.3 (`81963c5`) + M6 P1–P4d migrations through `20261030200000` |
| Dirty (preserved) | `README.md`, `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, roadmap moves/archives, M5 docs, `.vitest/`, `supabase/snippets/` — **untouched** |
| This slice write | `docs/M6_PE1_B4A_SYNTHETIC_LIFECYCLE_PREFLIGHT.md` only |

### A.2 Local endpoint contract — PASS

| Surface | Evidence | Verdict |
|---|---|---|
| Project id | `supabase/config.toml` `project_id = "storeagent"` | Local project namespace |
| API | `[api] port = 55321` | Local-only default |
| Postgres | `[db] port = 55322`, `major_version = 17` | Matches live-test psql pins |
| Studio | `[studio] port = 55323` | Not used as API URL (e2e docs warn against `:55323`) |
| Live psql pin | All M6 `*.live.test.ts` use `-h 127.0.0.1 -p 55322 -U postgres -d postgres` | Hard local |
| Live API guard | `assertLocalSupabaseApiUrl` — hostname must be `127.0.0.1` \| `localhost`, protocol `http:` | **Refuses** hosted/`https`/`supabase.co` |
| Live gate | `RUN_SUPABASE_LIVE === "1"` else `describe.skip` | No accidental remote run |
| Env resolution | Prefer pre-set `NEXT_PUBLIC_SUPABASE_*` + service role **after** local assert; else `npx supabase status -o env` local keys | **No** hosted URL/key fallback path in M6 live suites |

### A.3 No remote Supabase URL/key fallback — PASS (harness)

| Check | Evidence |
|---|---|
| Non-local API URL | Throws: `Live suite refuses non-local Supabase API URL host …` |
| `createSupabaseAdminClient` | Reads `readServerEnvironment()` only — **no** localhost assertion inside admin client itself |
| PE1.b.4b duty | Call `assertLocalSupabaseApiUrl` **before** any admin client / RPC; refuse `DATABASE_URL` matching `supabase.co` / pooler (pattern already used in `m7-3d-lifecycle-e2e.live.test.ts`) |
| Hosted canary envs | `M56E4_HOSTED_*` paths are **out of scope** and must not be imported by PE1.b.4b |

**Gap (non-blocking for contract, blocking if ignored in 4b):** admin client alone does not refuse remote URLs. Isolation is enforced by the **live harness**, which PE1.b.4b must copy.

### A.4 No merchant / production data dependencies — PASS (design)

| Rule (§H.4) | Preflight finding |
|---|---|
| Dedicated synthetic identities | Existing M6 live suites use disposable `6100xxxx-…` namespaces; PE1 unit binders use `8100e000-…`. **No** real merchant UUIDs in forecast live fixtures reviewed |
| Data plane | Local PG only; fixture commerce + day-evidence inserts scoped by synthetic `organization_id` |
| No Production callers | PE1 readiness: no `loadForecastSkuDemand` / `publishForecastSkuDemand` / `readFreshPublished*` under `app/` or decision-engine production paths |
| No merchant deep-dive SELECTs required | Lifecycle evidence uses synthetic grain only |
| Env-B/C | **Out of scope** / **NO-GO** for this milestone |

### A.5 Workers / cron disabled — PASS

| Control | Evidence |
|---|---|
| `vercel.json` | **Absent** at HEAD |
| Metric ENABLE defaults | `.env.example` leaves `METRIC_*_WORKER_ENABLED=` empty (disabled unless `1`) |
| `CRON_SECRET` | Example unset; no scheduled adapters in-repo |
| Forecast workers | **MISSING** / no forecast ENABLE path (PE1 readiness A.2) |
| `pg_cron` | Not part of local synthetic path; hosted absence claimed by HV2 (not re-probed) |

### A.6 Isolation summary

| Layer | Verdict |
|---|---|
| **Contract / source harness** | **PASS** |
| **Runtime local DB availability** | **UNKNOWN** |
| **Migrations applied on local DB** | **UNKNOWN** |
| **Overall environment isolation for planning PE1.b.4b** | **PASS** (with runtime unknowns deferred to 4b start gates) |

---

## B. Required local schema / RPC evidence

### B.1 Migration set (repo — static PASS)

| Migration | Role |
|---|---|
| `20261030100000_m6_p2b2b1_forecast_day_evidence.sql` | Day coverage / evidence tables |
| `20261030110000_m6_p2b2b2_forecast_evidence_rpcs.sql` | Evidence RPCs |
| `20261030120000_m6_p2b2c3b_forecast_coverage_correction_outbox.sql` | Correction outbox / fence |
| `20261030130000_m6_p2c1_forecast_sku_demand_source_snapshot.sql` | `forecast_sku_demand_source_snapshot` |
| `20261030140000_m6_p3b_forecast_persistence.sql` | `persist_forecast_sku_demand_result` + history tables |
| `20261030150000_m6_p3d1_forecast_publication.sql` | `publish_sku_forecast` + `sku_forecast_publications` / `sku_forecast_current` |
| `20261030160000_m6_p3d3_fresh_published_forecast_reader.sql` | `read_fresh_published_sku_forecast` |
| `20261030200000_m6_p4c1_forecast_evaluation_persistence.sql` | Eval persistence (diagnostic only; **optional** for PE1.b.4 happy path) |

**Applied-on-local status:** **UNKNOWN** this session (no `\df` / `to_regprocedure` probe).

### B.2 RPC / adapter map (required for lifecycle)

| Stage | TS adapter | SQL RPC / pure | Hard-false marker |
|---|---|---|---|
| Calculate | `loadForecastSkuDemand` → `forecastSkuDemand` (`lib/forecasting/orchestrate.ts`) | `forecast_sku_demand_source_snapshot` + pure TS | No production eligibility |
| Persist | `persistForecastSkuDemand` / `persistLoadedForecastSkuDemand` | `persist_forecast_sku_demand_result` | `published: false`, `m7Eligible: false`; never publishes |
| Publish | `publishForecastSkuDemand` | `publish_sku_forecast` | Forces `m7Eligible: false`; SQL CHECK `sku_forecast_publications_m7_eligible_false` |
| Fresh-read | `readFreshPublishedSkuForecast` | `read_fresh_published_sku_forecast` | `claimsPostCommitFreshness: false` |
| PE1.a | `bindPublishedForecastEvidence` | N/A (pure TS) | Always `forecastEligibility: "ineligible"` |
| PE1.b.1 | `evaluateCanaryForecastEligibilityPolicy` | N/A (pure TS) | Age-D → `ineligible_age_unapproved`; never `production_eligible` |

### B.3 Hard-false SQL / type locks (static PASS)

| Gate | Locus |
|---|---|
| `m7_eligible = false` CHECK | `sku_forecast_publications_m7_eligible_false` in `20261030150000` |
| `persist_claims_post_commit_freshness = false` | Same migration publication CHECKs |
| Fresh-reader JSON always `claimsPostCommitFreshness: false` | `20261030160000` |
| Eval trust `algorithm_approved = false` | `20261030200000` (if eval touched; not required for core path) |
| Publish/persist TS `m7Eligible: false` | `publish-forecast-sku-demand.ts`, `persist-forecast-sku-demand.ts` |
| Architecture tests | `m6-forecast-publication-architecture.test.ts` expects `check (m7_eligible = false)` |

### B.4 Tenant / publication isolation tests (reuse, do not re-author)

| Artifact | Proves |
|---|---|
| `tests/sql/m6-forecast-*-adversarial.sql` | Cross-tenant FK/RLS, auth denials, fencing |
| `m6-forecast-publish-adapter.live.test.ts` | Foreign-grain reject, stale token, org A/B isolation |
| `m6-forecast-fresh-reader.live.test.ts` | Miss dispositions, grain mismatch |
| `m6-pe1b-canary-forecast-eligibility-policy.test.ts` | Cross-tenant allowlist / grain mismatch fail-closed |

---

## C. Synthetic lifecycle test design

### C.1 Goal (from §H.5)

Produce **actual** evidence on **one** synthetic 4-tuple under hard-false gates:

```
seed synthetic parents + commerce + day evidence
  → loadForecastSkuDemand + forecastSkuDemand          [CALCULATED]
  → persistForecastSkuDemand                           [PERSISTED]
  → publishForecastSkuDemand                           [PUBLISHED, m7_eligible=false]
  → readFreshPublishedSkuForecast                      [TECHNICAL fresh-read]
  → bindPublishedForecastEvidence                      [PE1.a — always ineligible]
  → evaluateCanaryForecastEligibilityPolicy            [PE1.b.1 — Age-D ineligible]
```

**Not in path:** production attestation, Age-A/B/C numeric SLA, algorithm pin activation, Cov-B production bar, PB1 create, M7.2/M7.3, workers/cron, hosted URLs, eval-as-accuracy claim, inventory mutation.

### C.2 Recommended Env-A identity namespace (mint in PE1.b.4b tests only)

Avoid collisions with existing live namespaces (`61002…`–`6100c…`, unit `8100e000`):

| Role | Proposed UUID (test-constant; not production allowlist) |
|---|---|
| organizationId | `8100f400-0000-4000-8000-000000000001` |
| storeId | `8100f400-0000-4000-8000-000000000002` |
| locationId | `8100f400-0000-4000-8000-000000000003` |
| variantId | `8100f400-0000-4000-8000-000000000004` |
| productId / userId / order/item | `8100f400-…005` / `…007` / `…021` / `…022` |

**Rules:** exact 4-tuple grain; PE1.b.1 `canaryAllowlist` contains **exactly one** active entry matching that grain for the happy observation path; empty/revoked cases covered as negatives. Do **not** write these into a production allowlist module.

### C.3 Happy-path assertions (acceptance evidence)

| Step | Must observe |
|---|---|
| Persist | `disposition` created\|replayed; `published === false`; `m7Eligible === false` |
| Publish | Row in `sku_forecast_publications` with `m7_eligible = false`; current pointer set |
| Fresh-read | Prefer `disposition === "eligible"` + `m7NumericEligible === true` **or** document technical miss if fixture insufficient — still continue to PE1.a/b.1 |
| Fresh-read | `claimsPostCommitFreshness === false` always |
| PE1.a | `ok: true`; `forecastEligibility === "ineligible"`; `forecastExpectedDemandUnits === null` |
| PE1.b.1 | `decisionState === "ineligible_age_unapproved"`; notes include `AGE_POLICY_NOT_APPROVED`, `ALGORITHM_PIN_MISS`, `PRODUCTION_ATTESTATION_INACTIVE`; never `production_eligible` |
| PB1 spot | Optional pure call: reject non-`"ineligible"` forecastEligibility (no DB) |

### C.4 Existing stage coverage vs gap

| Stage | Existing live/unit | Combined PE1.b.4 path |
|---|---|---|
| Calculate (loader→orchestrator) | `m6-forecast-sku-demand-loader.live.test.ts` | Compose |
| Persist | `m6-forecast-persist-adapter.live.test.ts` | Compose |
| Publish | `m6-forecast-publish-adapter.live.test.ts` | Compose |
| Fresh-read | `m6-forecast-fresh-reader.live.test.ts` | Compose |
| PE1.a | `m6-pe1a-*.test.ts` (unit, forged-shaped) | Bind **live** fresh-reader JSON |
| PE1.b.1 | `m6-pe1b-*.test.ts` (unit) | Evaluate on PE1.a mint from live evidence |
| **Full chain** | **MISSING** | **PE1.b.4b deliverable** |

### C.5 Authenticity class for synthetic run

Use `evidenceAuthenticity: "fresh_reader_shaped_structural_only"` **or**, if 4b explicitly records service-role RPC issuance under local pin, document as **local** `db_rpc_fresh_reader_v1` **without** claiming hosted SELECT-pack verification. Prefer structural class for first evidence artifact to avoid overclaiming; note `HOSTED_SELECT_PACK_UNVERIFIED` remains expected in mapping notes.

---

## D. Safety / cleanup and failure matrix

### D.1 Fixture lifecycle (safe + repeatable)

| Phase | Action |
|---|---|
| Preflight (4b start) | Assert psql `127.0.0.1:55322`; `assertLocalSupabaseApiUrl`; refuse `supabase.co`; confirm RPCs via `to_regprocedure` |
| Setup | Seed **only** `8100f400-…` parents, membership, commerce, day evidence |
| Wipe between cases | `TRUNCATE` forecast history/publication tables (`CASCADE`) as existing live suites; `DELETE` commerce/corrections **where organization_id in synthetic tenants only** |
| Teardown | Same scoped wipe; do **not** `db reset` as default; do **not** touch other namespaces |
| Repeatability | `RUN_SUPABASE_LIVE=1` + local stack; deterministic `as_of` / lookback; idempotent parent inserts (`ON CONFLICT DO NOTHING`) |

### D.2 Failure / stop matrix

| Condition | Action |
|---|---|
| Non-local API URL / hosted keys detected | **STOP** — fail test; no writes |
| `psql` cannot connect to `127.0.0.1:55322` | **STOP** — local stack not up |
| Required M6 RPC missing (`to_regprocedure` null) | **STOP** — migrations not applied; do not invent schema |
| `m7_eligible !== false` on publish/read | **STOP** — hard-false broken |
| `claimsPostCommitFreshness !== false` | **STOP** |
| PE1.a emits non-`ineligible` or non-null demand units for M7 | **STOP** |
| PE1.b.1 emits `production_eligible` | **STOP** |
| Age-D notes missing (`AGE_POLICY_NOT_APPROVED` / `ALGORITHM_PIN_MISS`) on technical+allowlisted path | **STOP** |
| Worker ENABLE accidentally `1` in process env for this suite | **STOP** or force-assert unset (do not enable) |
| Any import of hosted canary / Production URL helpers | **STOP** — architecture test must forbid |
| Desire to clear PB1 gate / flip CHECK / mint production attestation | **OUT OF SCOPE** — refuse |

### D.3 Negative cases (minimum for 4b)

1. Empty allowlist → `ineligible_allowlist` + Age-D notes still present
2. Revoked allowlist entry → allowlist miss/revoked
3. Cross-org publish/read attempt → foreign-grain / isolation failure
4. Stale `sourceToken` publish → fail-closed
5. Forged `evidenceAuthenticity: "db_rpc_fresh_reader_v1"` without real issuance → PE1.b.1 `ok:false` / authenticity reject
6. Assert publication CHECK rejects `m7_eligible=true` (SQL or adapter reject) without relaxing CHECK

### D.4 Explicit non-goals (preserve)

No PB1/M7 schema changes; no E4; no AI; no purchasing; no inventory mutation; no workers/cron; no hosted ops; no production eligibility attestation; no Env-B/C merchant grains.

---

## E. Blockers and exact acceptance criteria

### E.1 Blockers before synthetic **execution**

| ID | Blocker | Class |
|---|---|---|
| B4A-1 | Combined PE1.b.4 live binder test **not implemented** | Expected — cleared by PE1.b.4b |
| B4A-2 | Local Supabase **runtime** up/down **UNKNOWN** | Cleared by 4b start probe |
| B4A-3 | Local M6 migrations **applied** state **UNKNOWN** | Cleared by `to_regprocedure` probes |
| B4A-4 | Env-A UUID constants not yet minted in a PE1.b.4 test file | Cleared in 4b |
| B4A-5 | Separate **implementation approval** for PE1.b.4b still required (§H.5) | Process gate |

**Non-blockers for planning:** staged adapters, PE1.a/b.1 units, hard-false SQL in migrations, worker-off posture, local port contract.

### E.2 Acceptance criteria for this preflight (4a)

- [x] HEAD `81963c5` verified; dirty tree preserved aside from this file
- [x] §H Env-A + §H.5 path mapped to concrete modules/RPCs
- [x] Isolation contract PASS; runtime UNKNOWN explicitly labeled
- [x] No remote fallback in M6 live harness pattern documented
- [x] Hard-false gates listed and must remain untouched
- [x] PE1.b.4b smallest scope + proposed files named
- [x] GO/NO-GO recorded

### E.3 Acceptance criteria for PE1.b.4b execution evidence (§H.5 mapped)

1. Synthetic grain only; Env-A isolation rules held (local API + scoped wipe).
2. Publication rows `m7_eligible=false`.
3. Fresh-read check-time only; `claimsPostCommitFreshness=false`.
4. PE1.a always ineligible; PE1.b.1 Age-D → `ineligible_age_unapproved` with required blockers.
5. PB1 still requires `forecastEligibility="ineligible"` (spot-check).
6. No production attestation; `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED` unsatisfied.
7. Evidence artifact (doc or CI log excerpt) without secrets.

**Unlocks:** offline lifecycle evidence for PE1.c **planning** only.
**Does not unlock:** production age/alg/accuracy/coverage; PE1.c; CHECK relaxation; merchant canary.

---

## F. Smallest PE1.b.4b implementation scope

### F.1 In scope

| Item | Detail |
|---|---|
| Live binder test | `tests/unit/m6-pe1b4-synthetic-lifecycle.live.test.ts` — single-file compose of existing adapters + PE1.a + PE1.b.1 |
| Architecture lock | `tests/unit/m6-pe1b4-synthetic-lifecycle-architecture.test.ts` — local host pins, no `vercel.json`, no hosted URL imports, hard-false string locks, no worker ENABLE |
| Evidence doc (post-run) | `docs/M6_PE1_B4_SYNTHETIC_LIFECYCLE_EVIDENCE.md` — tokens, dispositions, mapping notes, row counts (**after** execution; not this preflight) |
| Fixture style | Copy patterns from `m6-forecast-persist-adapter.live.test.ts` + publish + fresh-reader (assertLocal, wipe, seed) |

### F.2 Out of scope

Shared production allowlist module; hosted SELECT pack; numeric age SLA; algorithm approval; eval accuracy claims; PB1/M7 flips; workers/cron; E4/AI/purchasing; Env-B/C; migration changes; CHECK changes; credential/env commits.

### F.3 Proposed test files

1. **`tests/unit/m6-pe1b4-synthetic-lifecycle.live.test.ts`** — primary evidence producer (`RUN_SUPABASE_LIVE=1`).
2. **`tests/unit/m6-pe1b4-synthetic-lifecycle-architecture.test.ts`** — static isolation / hard-false / forbid hosted imports.
3. **Optional (only if needed for DRY):** `tests/support/m6-pe1b4-local-supabase.ts` — shared `assertLocalSupabaseApiUrl` + psql helpers (**local-only**). Prefer inline copy from existing live suites if DRY would tempt reuse of hosted helpers.

### F.4 Suggested 4b command (for future execution approval — not run now)

```bash
RUN_SUPABASE_LIVE=1 npx vitest run tests/unit/m6-pe1b4-synthetic-lifecycle.live.test.ts tests/unit/m6-pe1b4-synthetic-lifecycle-architecture.test.ts
```

Requires local `supabase start` (or equivalent) with M6 migrations applied — verified inside the live suite, not assumed from this preflight.

---

## G. GO / NO-GO

| Action | Decision |
|---|---|
| Accept this PE1.b.4a isolation preflight (docs only) | **GO** |
| Treat isolation **runtime** as proven | **NO-GO** — UNKNOWN until 4b probes |
| Implement PE1.b.4b smallest live binder under §F (separate approval) | **GO to plan** — **CONDITIONAL GO to implement** after owner approval |
| Execute synthetic lifecycle on local Supabase | **CONDITIONAL GO** — only after 4b exists + local DB/RPC probes pass + workers remain off |
| Hosted / merchant / Env-B/C / PE1.c | **NO-GO** |
| Activate attestation / clear PB1 / set `m7_eligible=true` / enable workers/cron | **NO-GO** |
| Claim production forecast eligibility from synthetic evidence | **NO-GO** |

### G.1 Final call for synthetic execution

**CONDITIONAL GO** for offline Env-A synthetic lifecycle execution **after** PE1.b.4b lands and runtime gates clear.

**Isolation contract:** **PASS**
**Isolation runtime:** **UNKNOWN**
**Overall preflight for planning:** **GO**
**Overall for immediate execution without 4b:** **NO-GO**

---

## Freeze checklist

- [x] HEAD `81963c5` verified; unrelated dirty tree preserved
- [x] §H / §H.4 / §H.5 mapped
- [x] Local endpoint + no-remote-fallback harness documented
- [x] Required migrations/RPCs inventoried; applied state UNKNOWN
- [x] Synthetic lifecycle design + negatives + stop conditions
- [x] Hard-false protections retained as non-negotiable
- [x] Smallest PE1.b.4b file scope proposed
- [x] GO/NO-GO recorded
- [ ] PE1.b.4b implementation — **not authorized by this document alone**
- [ ] Synthetic execution — **not performed**
- [ ] Production eligibility — **not granted**
