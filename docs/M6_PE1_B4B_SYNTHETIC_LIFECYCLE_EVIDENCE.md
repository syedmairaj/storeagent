# M6-PE1.b.4b — Synthetic Lifecycle Evidence (Offline Env-A)

**Mode:** LOCAL / DISPOSABLE EVIDENCE CLOSEOUT. Not hosted production readiness.
**As-of:** 2026-11-06
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Baseline requested:** `main` @ `773bd2a`
**Verified HEAD:** `773bd2a83bad2bae943a8cd49e65332eae0921c3` — `docs(forecast): close PE1.b.4a synthetic lifecycle preflight`
**Branch:** `main` (ahead of / tracking `origin/main`; PE1.b.4b artifacts uncommitted)
**Dirty tree:** Unrelated dirty/untracked preserved. In-scope PE1.b.4b additions listed in §A.
**Parents / authority:**
- `docs/M6_PE1_B4A_SYNTHETIC_LIFECYCLE_PREFLIGHT.md` (isolation contract)
- `docs/M6_PE1_B3_PRODUCTION_POLICY_DECISION_PACKET.md` §H (Env-A)
- PE1.a binder + PE1.b.1 canary policy + M7-PB1 metric binder (hard-false)
- M6 migrations through forecast publish / fresh-read / evaluation persistence
**Authority when docs conflict:** this freeze for **offline disposable Env-A synthetic single-grain lifecycle evidence only**. Does **not** authorize hosted canary, production allowlisting, attestation activation, PB1/M7 production flips, workers/cron, or PE1.c.

---

## 0. Executive verdict

| Question | Verdict |
|---|---|
| Disposable local stack isolation (`storeagent-pe1b4b`) | **PASS** (owner-verified) |
| Architecture lock | **16/16 PASS** |
| Live integration (Env-A lifecycle) | **4/4 PASS** |
| Combined | **20/20 PASS**, exit 0 |
| Hard-false SQL / PE1 / PB1 in this path | **PASS** (`m7_eligible=false`, no `production_eligible`) |
| Workers / cron / `vercel.json` | **UNCHANGED** (absent / disabled) |
| Original `storeagent` volumes + 6 protected orgs | **RESTORED** (fingerprints match backup) |
| Hosted / production readiness | **NOT CLAIMED** |
| **GO/NO-GO for scoped commit of PE1.b.4b artifacts** | **GO** (docs + three test/support files only) |
| **GO/NO-GO for hosted / production eligibility** | **NO-GO** |

**One-line:** Offline synthetic calculate→persist→publish→fresh-read→PE1.a→PE1.b.1→PB1 (ineligible) is **evidenced on a disposable local stack**; production hard-false gates remain closed; original development DB was restored.

---

## A. Files in scope

| Path | Role |
|---|---|
| `tests/support/m6-pe1b4-local-supabase.ts` | Loopback API/DB pins; ignore `M56E4_HOSTED_*` presence; fail closed on remote effective targets |
| `tests/unit/m6-pe1b4-synthetic-lifecycle.live.test.ts` | Opt-in live suite (`RUN_SUPABASE_LIVE=1`); Env-A fixtures; lifecycle + negatives |
| `tests/unit/m6-pe1b4-synthetic-lifecycle-architecture.test.ts` | Non-DB architecture locks (16 tests) |
| `docs/M6_PE1_B4B_SYNTHETIC_LIFECYCLE_EVIDENCE.md` | This closeout |

**Not in scope / untouched for this closeout:** production app sources, PB1/M7 validators, CHECK definitions, workers/cron, hosted canary docs, unrelated dirty files (`README.md`, `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, roadmap archives, M5 docs, `.vitest/`, `supabase/snippets/`, etc.).

---

## B. Final evidence matrix

### B.1 Runtime isolation (owner-verified)

| Item | Result |
|---|---|
| Disposable `project_id` | `storeagent-pe1b4b` |
| Volumes | Independent `supabase_*_storeagent-pe1b4b` (original `*_storeagent` preserved) |
| API / DB | `http://127.0.0.1:55321` / `127.0.0.1:55322` |
| Migrations / RPCs | M6 snapshot, persist, publish, fresh-read present |
| Hard-false CHECKs | Present (`m7_eligible = false`, no post-commit freshness claim) |
| Hosted ops | **None** |

### B.2 Test results (owner-verified)

| Suite | Result |
|---|---|
| Architecture | **16/16 PASS** |
| Live | **4/4 PASS** |
| Total | **20/20 PASS**, exit 0 |

Live cases covered:
1. Happy path: calculate→persist→publish→fresh-read→PE1.a→PE1.b.1→PB1 (`forecastEligibility=ineligible`, hard-false claims)
2. PE1.b.1 fail-closed: empty/revoked allowlist + forged DB authenticity
3. Cross-org publish rejection (`ForecastPublishForeignGrainError`)
4. Stale `sourceToken` persist-loaded + publish (`ForecastPersistStaleTokenError` / `ForecastPublishStaleTokenError` + withheld `STALE_SOURCE_TOKEN`)

### B.3 Database residue on disposable (owner-verified, post-run)

| Table / fact | Count / value |
|---|---|
| `forecast_runs` (Env-A) | **2** |
| `sku_forecasts` | **2** |
| `sku_forecast_publications` | **2** |
| Publications `m7_eligible` | **false** (both) |
| Publications `persist_claims_post_commit_freshness` | **false** (both) |
| `sku_forecast_current` | **0** (mutable cleanup removed pointer; expected) |
| Immutable rows | Retained (runs/forecasts/publications/evidence/inventory_snapshots) — no trigger bypass |

### B.4 Prior failures and corrections (accurate history)

| Failure | Cause | Correction |
|---|---|---|
| Setup: `M56E4_HOSTED_SUPABASE_URL` remote marker | Presence guard too broad; PE1.b.4b does not consume hosted canary env | Ignore `M56E4_HOSTED_*` presence; keep fail-closed on **effective** API/DB |
| Teardown: DELETE `inventory_snapshots` | Immutable evidence trigger | Remove from mutable cleanup; retain |
| Happy path: `publication_id` column | PK is `id` | Query `where id = …` |
| Stale publish: `disposition=replayed` | Cleared correction → replayed already-published run | Keep first correction; require new `created` run ≠ happy-path |
| Collision: 11 identity rows on original DB | Prior PE1.b.4b seed retained | Disposable second stack; do not reset original |
| `protectedOrgCount >= 1` | Fresh disposable has 0 non-Env-A orgs | Identity snapshot (empty allowed); exact pre/post equality |
| PB1 `ok=false` | `"UTC"` not in `Intl.supportedValuesOf("timeZone")` | Fixture `STORE_TIME_ZONE = "America/New_York"`; PB1 validator unchanged |

### B.5 Local vs hosted (explicit)

| Claim | Status |
|---|---|
| Offline Env-A synthetic lifecycle on disposable local Supabase | **EVIDENCED** |
| Hosted Supabase / production merchant grain | **NOT EVIDENCED / NO-GO** |
| Production forecast eligibility / attestation / Age SLA / algorithm pin | **NOT ACTIVATED** |
| UUID production allowlisting of `8100f400-…` | **FORBIDDEN** — test-local only |

---

## C. Safety and restoration proof

### C.1 Safety properties preserved in harness

| Control | Mechanism |
|---|---|
| Local pins | API `http://127.0.0.1:55321`; DB `127.0.0.1:55322` |
| Hosted refusal | Remote markers on effective URL/DB; never copy `M56E4_HOSTED_*` into admin client |
| Pre-write vacancy | Fail closed on reserved identity / order / order_item / owned rows |
| Tenant isolation | Non-Env-A org identity snapshot; synthetic org-scoped cleanup only |
| Immutability | No trigger disable; mutable cleanup only (orders/items/corrections/current) |
| Hard-false | Assert `m7Eligible=false`, PE1.b.1 ≠ `production_eligible`, PB1 ineligible + block strings |
| Opt-in | `RUN_SUPABASE_LIVE=1` else skip |
| Workers / cron | No `vercel.json`; architecture forbids ENABLE / cron wiring |

### C.2 Restoration (owner-verified)

| Check | Result |
|---|---|
| Disposable stopped | Yes |
| Original `storeagent` restarted | Yes |
| Full org inventory | **8** match backup fingerprint |
| Protected non-Env-A | **6** match backup fingerprint |
| Local backup | Preserved outside repo |
| Original volumes | Not deleted (`--no-backup` never used) |

### C.3 Residual limitations

1. **Rerun requires vacant Env-A** (or a fresh disposable volume). Immutable `8100f400` rows remain on the disposable DB after a successful run; collision probe refuses overwrite.
2. **PB1 timezone fixture** must stay on a `supportedValuesOf`-listed IANA zone (`America/New_York`); `"UTC"` still fails the current PB1 helper on this Node — production PB1 validator was **not** changed.
3. Evidence is **offline disposable only** — not a substitute for hosted readiness or merchant Env-B/C.
4. `sku_forecast_current=0` after cleanup is expected; publication history remains for audit.

---

## D. Remaining blockers / next milestone

### D.1 Outstanding P0 / P1 (outside this closeout)

| Priority | Item |
|---|---|
| P0 | Do **not** treat this as hosted/production eligibility evidence |
| P0 | Keep production attestation / Age / algorithm pin / `m7_eligible` CHECK closed |
| P1 | Hosted / merchant Env-B–C canary (separate milestone; not PE1.b.4b) |
| P1 | Optional PB1 IANA helper hardening for `UTC`/`Etc/UTC` (product decision; not required for 4b) |
| P1 | PE1.c / production policy activation packet (blocked until B3 gates clear) |

### D.2 Next smallest milestone

**Recommend:** PE1.b.4 closeout commit of the four in-scope files, then the **smallest next forecast-policy milestone already gated by B3** (typically PE1.c prep or hosted readiness planning) — **without** enabling workers/cron, flipping CHECKs, or minting production attestation.

---

## E. Scoped commit readiness

| Question | Verdict |
|---|---|
| PE1.b.4b test/support + this evidence doc accurate? | **YES** |
| Unrelated dirty files excluded? | **YES** (must remain unstaged) |
| Production sources / PB1 validator / CHECKs changed? | **NO** |
| **GO/NO-GO for scoped commit** | **GO** — only the four §A paths when explicitly requested |
| **GO/NO-GO for hosted / production** | **NO-GO** |

---

**STOP.** No live DB, migration, hosted, worker/cron, or production-source changes in this closeout session.
