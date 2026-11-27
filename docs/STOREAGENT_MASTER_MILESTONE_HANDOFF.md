# StoreAgent.si — Master Milestone Handoff

| Field | Value |
|---|---|
| Document ID | DOC-TRACK-1…5 · DOC-CONTINUITY-6 · AI-ARCH-0 · **AI-ARCH-1f** (`LOCAL_COMPLETE`) |
| Canonical path | `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md` |
| As-of | 2026-11-27 (Asia/Dubai) — AI-ARCH-1f |
| Mode | Living compact handoff — **not** a substitute for frozen contracts, audit reports, or original decision docs |
| Update policy | After **every** milestone completion or block, refresh current-state §§2–4/7/8 + append §11 **before** starting the next milestone. Never rely on ChatGPT thread length. Never silently rewrite historical approvals or promote schema deploy to connector activation |
| Migration sync rule | `.cursor/rules/migration-synchronization-policy.mdc` — DoD: `LOCAL_COMPLETE` ≠ `HOSTED_SYNC_PENDING` ≠ `DEPLOYED_VERIFIED` |

> **Untracked dated draft** `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF_2026-11-22.md` is a **pre-β snapshot** (HEAD pin `1e18029`, “CONN-1c-β not begun”). Prefer **this file**. Do not delete the dated draft under DOC-TRACK-1.

---

## 1. Project vision and frozen architecture

**North star:** One inventory intelligence workspace for every channel you sell through. Connect stores, understand what is selling, identify stock risks, and make better buying decisions.

| Frozen rule | Meaning |
|---|---|
| Independent SaaS | StoreAgent.si hosts merchant UX; Shopify is first native connector (standalone OAuth later), then Woo / Amazon / Noon by separate gates |
| One canonical commerce domain | Adapters normalize into one domain; **never** separate calculation engines per provider; unknown ≠ zero |
| Deterministic spine | M5 metrics → M6 forecasting → M7 REORDER / REDUCE / PROMOTE / WATCH; AI **investigates/explains**, never owns numbers |
| AI-ARCH principle | *The AI controls the investigation. It does not control what counts as a fact.* (AI-ARCH-0 **PROPOSED**) |
| No auto SKU merge | Cross-channel linking requires merchant approval; do not double-count shared physical stock |
| Security / tenancy | Org/store/location isolation; provider-specific external identity; no plaintext secrets in `integrations.configuration`; vault browser access denied |
| Evidence classes | designed ≠ coded ≠ local-tested ≠ Git-closed ≠ hosted-schema-applied ≠ runtime-authorized ≠ live-merchant-proven |
| Non-claims | No merchant ROI, autonomous purchasing, live AI research, or paying-launch readiness from this handoff |

**Authority chain (contracts — do not duplicate here):** `docs/DOMAIN_MODEL.md`, `docs/PROVIDER_ADAPTERS.md`, `docs/SHOPIFY_CONN_0_SECURITY_ARCHITECTURE.md`, `docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md`, `docs/CONN_MP_0_MULTI_PROVIDER_ARCHITECTURE_PROPOSAL.md`, M5/M6/M7 contracts, `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md`, `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md`.

---

## 2. Current Git baseline

| Field | Verified value |
|---|---|
| Repository | `/Users/syedmairaj/Documents/storeagent` · `syedmairaj/storeagent` |
| Branch | `main` |
| HEAD tip | `1c75de5` — `feat(ai-arch): add guarded merchant intelligence UX (1e)` |
| Full SHA | `1c75de51b68512a59adeebd4133659ad332f6916` |
| `origin/main` | **Aligned** at tip (`main...origin/main`; no CI claim) |
| Last Git closure on tip | **AI-ARCH-1e** @ `1c75de5` (1a–1d @ `d56de33`) |
| Prior continuity pins | AI-ARCH-1a–1d `d56de33` → DOC-CONTINUITY-6 + AI-ARCH-0 @ `d12fd04` → DOC-TRACK-5 `78c1d45` → FE-ACCEPT-1C `1edc1ff` → … |
| Local migrations | **57** files = **57** `migrations.sha256` entries (latest `20261124120000`) |
| Hosted migrations | **57** (owner-confirmed; Option B apply of five CONN migrations) |
| Hosted history fingerprint | `versions_md5=900da6949dfd6f7818a454b7f28ddf33` |
| Hosted post-catalog | **23/23 PASS** · evidence `~/StoreAgentEvidence/conn-hr-2c-postcatalog-20261127T040549Z` · `post_catalog_utc=2026-11-27T04:06:14Z` |
| Migration DoD | Schema path **`DEPLOYED_VERIFIED`** for CONN 53–57 + catalog · **≠** connector production activation |
| Staging | Dirty/untracked work present (incl. AI-ARCH-1f); **do not** auto-stage |
| Dirty tree (preserve) | Modified `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, `next-env.d.ts`; deleted tracked `docs/StoreAgent_Roadmap_2026.docx`; untracked `.cursor/` (incl. migration sync rule), `.tmp/`, `.vitest/`, `AGENTS.md`, `scripts/conn-hr-1/operator/`, SQL snippets, DOCX/archives, `supabase/snippets/`, dated handoff draft, AI-ARCH-1f files, etc. **Never** auto stage/clean/reset/stash |

**Current milestone:** **AI-ARCH-1f** — Evaluation & Release Readiness (`LOCAL_COMPLETE`; parent AI-ARCH-1 closure **pending owner**). Prior: AI-ARCH-1e **CLOSED/PUSHED** @ `1c75de5`; AI-ARCH-1a–1d **CLOSED/PUSHED** @ `d56de33`; AI-ARCH-0 design **PROPOSED** / DOC-CONTINUITY-6 @ `d12fd04`. Schema baseline unchanged: **57/57** · **23/23** · **DEPLOYED_VERIFIED** ≠ OAuth / workers / cron / SyncRun / credential activation (all **OFF**). Commerce-agent soft-enable **OFF**. V11 **PARTIAL**; V8 hosted JWT **NOT VERIFIED**; binding **`NOT_YET_VERIFIED`**; D13/D14 **DEFERRED**; CONN-1 exit **UNMET**; full Supabase DR **NOT ESTABLISHED**. **Exact next (owner-gated):** accept AI-ARCH-1f / parent AI-ARCH-1 Git checkpoint → then **AI-MKT-0** (docs/legal) only under separate auth, while reconciling CONN-1 exit / V8 JWT / binding before any market-research production use. AI-INV-1/1.1 code remains **CLOSED/PUSHED** @ `38f63d6` (soft-enable **OFF**). AI-MKT/COMP/CREATIVE/LOOP dependency order preserved.

---

## 3. Compact milestone matrix

**Status legend:** **CLOSED/PUSHED** · **PARTIAL** · **LOCAL-ONLY** · **PLANNED** · **BLOCKED** · **DEFERRED**

| ID | Status | Commit / evidence | Delivered | Remaining gate | Next dependency |
|---|---|---|---|---|---|
| M0–M4 foundations | CLOSED/PUSHED | Domain / tenancy / CSV / bindings (ledger) | Canonical domain, auth shell, CSV path | Hosted ops ≠ foundation close | M5+ |
| M5.1–M5.5 metrics | CLOSED/PUSHED | M5 commits through persistence | Deterministic sales/inventory metrics + recompute | Runtime activation separate | M5.6 workers |
| M5.6A–D / M5.7 | CLOSED/PUSHED (eng); ops BLOCKED | `docs/M5_6_HANDOFF.md` | Events, recompute, rollover, local adversarial | HTTP/cron/workers **OFF**; E.4 leave dirty=2 | Hosted worker auth |
| M5.6E.4 canary | LOCAL/hosted LIMITED | E.4 runbook | Stages 0–4; grain `queued` | **Do not drain** | Ops policy |
| M6 P1–P4d | CLOSED/PUSHED local; schema CLOSED | through `6136874` + hosted M6 migrations | Forecast foundations + hosted schema | Production forecast **NOT APPROVED** | PE1.b.6b + policy |
| PE1.b.6b JWT | BLOCKED / LIMITED | worksheet + empty J1–J13 | Preflight/docs only | Live JWT **NOT EXECUTED** | Owner A1–A4+A6 |
| M7 foundations | PARTIAL / BLOCKED prod | PB1 + E3.3-R2 synthetic | Persistence/lifecycle/demo Actions | Production create **hard-false** | JWT + evidence fences |
| CSV snapstore planning | LOCAL-ONLY COMPLETE | 2026-11-18 acceptance | 20 SKU metrics + 7/5/7 planning | ≠ hosted merchant proof | Multi-store / SyncRun |
| Shopify RO.1–RO.3 | CLOSED/PUSHED | `0072a04` / `7fc8f2a` / `fe29703` / `4f6ef0c` | Offline normalizers + transport + nested mocks | Live nested cert **FALSE**; OAuth/SyncRun **BLOCKED** | CONN security path |
| CONN-0A | CLOSED/PUSHED | `965e6d7` | Security architecture freeze | — | CONN-1 vault |
| CONN-1 vault contract | CLOSED/PUSHED (design) | `abb407d` | Vault contract freeze | D13/D14 deferred | CONN-1a |
| CONN-1a | CLOSED/PUSHED · schema DEPLOYED_VERIFIED | `3d1f6ad` / `20261121120000` | Vault schema + security tests | Binding / KEK / activation still gated | CONN-1b |
| CONN-1b | CLOSED/PUSHED | `00557c7` | Server-only AES-256-GCM + KEK API | No production KEK wired | CONN-1c-α |
| CONN-1c-α | CLOSED/PUSHED · PARTIAL · schema DEPLOYED_VERIFIED | `a918217` / `20261122120000` | CAS/clear/load + trusted-scope repo | Binding **NOT_YET_VERIFIED** | CONN-1c-β |
| CONN-1c-β | CLOSED/PUSHED · PARTIAL · schema DEPLOYED_VERIFIED | `173a357` / `20261122130000` | Refresh-lease RPCs; V5 two-session races | Binding **NOT_YET_VERIFIED** | CONN-1d-A |
| CONN-1d-A | CLOSED/PUSHED · PARTIAL | `636725c` | Secret-ingestion guards + redaction | V12 offline **PASS**; V11 **PARTIAL** (DB-level bypass, unsupported object types, stringified/encoded payloads) | CONN-1d-B |
| CONN-1d-B | CLOSED/PUSHED · PARTIAL | `0f3e1d2` | V8 membership/role isolation (disposable) | V8 offline SQL role + claim-stub **PASS**; hosted JWT/PostgREST **NOT VERIFIED** | CONN-1d-C |
| CONN-1d-C | CLOSED/PUSHED · PARTIAL · schema DEPLOYED_VERIFIED | `5c1c76b` / `20261122140000` | α terminal fence; lease-aware disconnect/revoke; Phase A ownership release; two-session races; β fixture compatibility | Binding **NOT_YET_VERIFIED** | CONN-1d-D |
| DOC-TRACK-2 | CLOSED/PUSHED (docs) | `b3ac033` | CONN-1d-A/B/C reconciliation | — | CONN-1d-D |
| CONN-1d-D | CLOSED/PUSHED (docs) · PARTIAL | `40d5888` · `docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md` | V1–V15 re-matrix: 13 offline PASS · V8/V11 PARTIAL (historical tally; V8 reconciled by DOC-TRACK-3) | **CONN-1 exit UNMET** (vault contract §11; V11 PARTIAL) | CONN-1d-E |
| CONN-1d-E | CLOSED/PUSHED · PARTIAL · schema DEPLOYED_VERIFIED | `5de98cf` / `20261124120000` · `docs/SHOPIFY_CONN_1D_E_V11_IMPLEMENTATION_REPORT.md` | DB trigger guard on 4 JSON columns; `service_role` TRIGGER revoke; stricter app guard; app⇒DB parity corpus; static future-migration model | V11 **PARTIAL**; hosted JWT still **NOT VERIFIED** | DOC-TRACK-3 |
| CONN-1d-F | Read-only audit · decisions recorded | `docs/SHOPIFY_CONN_1D_F_SECURITY_EXIT_READINESS_REPORT.md` (closed with DOC-TRACK-3 @ `7bd2e8b`) | Security exit / readiness audit; owner decisions 1–9 | CONN-1 exit **UNMET**; D13/D14 not resolved; binding **NOT_YET_VERIFIED** | DOC-TRACK-3 |
| DOC-TRACK-3 | CLOSED/PUSHED (docs) | `7bd2e8b` | Canonical HEAD/status reconciliation + CONN-1d-F record | — | CONN-HR-0 |
| CONN-HR-0 | CLOSED (read-only preflight) · LOCAL-ONLY | Chat evidence `CONN_HR_0_HOSTED_READINESS_PREFLIGHT_REPORT` (no separate committed report file) | Migration inventory; CLI transaction analysis; hosted SELECT-only check design; disposable plan; V8 post-apply plan; failure/recovery; GO/NO-GO | No hosted SQL executed | CONN-HR-1 |
| CONN-HR-1 | CLOSED/PUSHED · PARTIAL (offline package) | `454f7ec` · `docs/CONN_HR_1_HOSTED_READINESS_RUNBOOK.md` | Readonly SQL 01–10; disposable tooling; Option B candidate; CLI #5 **25P01 BLOCKED** | Historical offline package; superseded for *hosted apply* status by CONN-HR-2/2C | CONN-HR-2 |
| DOC-TRACK-4 | CLOSED (docs) | 2026-11-25 continuity | Reconcile DOC-TRACK-3 + CONN-HR-0/HR-1 + apply-method decision | — | FE-ACCEPT-1C / DOC-TRACK-5 |
| FE-ACCEPT-1C | CLOSED/PUSHED · LOCAL-ONLY | `1edc1ff` · `npm run test:e2e:fe-accept-1c` | Automated local Mailpit magic-link auth; merchant/Actions E2E + stress | ≠ hosted/production browser certification | DOC-TRACK-5 |
| DOC-TRACK-5 | CLOSED/PUSHED (docs) | `78c1d45` | FE-ACCEPT-1C continuity + readiness pins on `main` | — | CONN-HR-2 / DOC-CONTINUITY-6 |
| CONN-HR-2 / 2B / 2C | LOCAL-ONLY · schema **DEPLOYED_VERIFIED** | Chat + outside-Git evidence; untracked `scripts/conn-hr-1/operator/` | Hosted P0–P9 PASS; Option B apply COMMITTED; post-catalog 23/23 PASS (parser fix); migration sync rule installed | Operator scripts **not** Git-closed; activation **OFF**; V8 hosted JWT still open | Binding / D14 / D13 / CONN-2 |
| DOC-CONTINUITY-6 | CLOSED/PUSHED (docs) | `d12fd04` | Record 57/57 + 23/23 closeout; §36 DOCX | — | AI-ARCH-0 / AI-ARCH-1 |
| **AI-ARCH-0** | **PROPOSED** (docs) | `d12fd04` · AI roadmap + Nov §0I + DOCX §37 | Orchestrator & evidence architecture; Commerce Decision Loop; L1–L3 autonomy model | Design authority retained | AI-ARCH-1 |
| **AI-ARCH-1a–1d** | **CLOSED/PUSHED** | `d56de33` · reports 1A–1D | Contracts, L1 tools, orchestrator, grounded draft validation | Soft-enable **OFF** | AI-ARCH-1e |
| **AI-ARCH-1e** | **CLOSED/PUSHED** | `1c75de5` · reports 1E + final acceptance | Guarded structured-intent UX in SKU inspector + server action | Soft-enable **OFF** | AI-ARCH-1f |
| **AI-ARCH-1f** | **LOCAL_COMPLETE** | uncommitted · `docs/AI_ARCH_1F_IMPLEMENTATION_REPORT.md` | Offline §9 evaluation + adversarial pack; 121/121 PASS | Parent AI-ARCH-1 owner accept / Git checkpoint; soft-enable **OFF** | AI-MKT-0 (after CONN/security reconcile for prod use) |
| CONN-2…6 | PLANNED / BLOCKED | CONN-0 sequence | — | OAuth, webhooks, live cert, SyncRun, health UX; V10 bind/reclaim (with D13) | After binding + D13/D14 + separate auth |
| CONN-MP-0 | CLOSED/PUSHED (docs) | `1e18029` | Multi-provider architecture freeze | D13/D14 **DEFERRED**; impl gated | CONN-MP-1 / CRED |
| Woo / Amazon / Noon | PLANNED | CONN-MP-0 | Design only | Amazon/Noon enum **CONTRACT_CHANGE**; partner approvals | After Shopify-first path |
| UX-INV-1a–1c.1 | CLOSED/PUSHED | `10d9de6`…`0402564` | Attention Overview + inspector + replenishment copy | Local FE-ACCEPT-1C browser cert **PASS** @ `1edc1ff` (≠ hosted) | UX-INV-1d |
| UX-INV-1d | PLANNED | Delivery doc §5 | — | Owner UI slice approval | Engines unchanged |
| AI-INV-1 / 1.1 | CLOSED/PUSHED | `38f63d6` | Grounded explainer + situational guidance | Soft-enable **OFF**; not live-certified | Enablement/UX **PROPOSED** (parallel to AI-ARCH-1) |
| AI-INV-2…6 | PLANNED | AI roadmap | — | Per-slice auth | Deps per slice |
| AI-MKT-0→4 | PLANNED | AI roadmap | Existing sequence preserved | Licensed evidence only; no live spend | AI-MKT-0 first (after AI-ARCH contracts) |
| COMP-1 · CREATIVE-0…2 · LOOP-1 | **PROPOSED** | AI-ARCH-0 / AI roadmap | Competitor/sentiment · creative · measured learning loop | Owner must approve before implementation | After AI-MKT deps as listed in AI roadmap |
| Supplier Intelligence V1 | PLANNED AFTER CORE | AI-INV-5 | — | No auto-contact/buy | Trusted quotes |
| Hosted schema ledger | **DEPLOYED_VERIFIED** @ **57/57** | Owner evidence 2026-11-27 | 38→52 historical closeout + CONN 53–57 Option B + catalog 23/23 | ≠ OAuth/workers/SyncRun unlock; full DR **NOT ESTABLISHED** | Binding / JWT / ops gates |
| DB drift Phase 1 | CLOSED/PUSHED local | `d73790a` | Manifest + CI workflow file | Actions run **NOT YET VERIFIED** | — |
| Paying launch | BLOCKED / NO-GO | — | — | Launch acceptance | Security + ops + journey |

---

## 4. Stream detail (by workstream)

### 4.1 M0–M4 foundations

Closed engineering foundations: tenancy, auth session, RLS architecture, canonical persistence (M2), CSV ingestion (M3), data-quality (M4). Evidence in living ledger + domain docs. Still **BLOCKED** for paying launch and live commerce sync.

### 4.2 M5 metrics / workers

| Slice | Status |
|---|---|
| M5.1–M5.5 | CLOSED/PUSHED |
| M5.6A–D / M5.7 local | CLOSED/PUSHED engineering |
| Workers / cron / HTTP metric+rollover | **BLOCKED** (OFF in repo; live host env not claimed verified) |
| E.4 canary | Intentionally `queued` dirty=2 / claimed=1 — **do not drain** |

### 4.3 M6 forecasting

Local P1–P4d + hosted schema readiness **CLOSED**. Production persist/publish/eval **NOT APPROVED**. PE1.b.6b JWT isolation **NOT EXECUTED**. Fixture PIT ≠ live historical PIT.

### 4.4 M7 decisions / approval / buying

Foundations + PB1 fencing + synthetic Actions E3.3-R2 **PARTIAL**. Production create fails closed (`PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE` class). Purchasing **disabled**. No fake merchant ROQ authorization in UX.

### 4.5 CSV and Shopify RO.1–RO.3

| Slice | Status | Commit |
|---|---|---|
| CSV → metrics → planning (snapstore) | LOCAL-ONLY COMPLETE (2026-11-18) | UX lineage `457a516` / `970bab0` |
| RO.1 offline normalizers | CLOSED/PUSHED | `0072a04` |
| RO.2 GraphQL transport | CLOSED/PUSHED | `7fc8f2a` |
| RO.1.2 schema compatibility | CLOSED/PUSHED | `fe29703` |
| RO.3 nested pagination | CLOSED/PUSHED | `4f6ef0c`; live nested cert **FALSE** |

### 4.6 CONN-0 / 1a / 1b / 1c-α / 1c-β / 1d-A–F

| Slice | Status | Commit / migration | Note |
|---|---|---|---|
| CONN-0A | CLOSED/PUSHED | `965e6d7` | Security architecture |
| CONN-1 vault contract | CLOSED/PUSHED design | `abb407d` | D13/D14 unresolved product |
| CONN-1a | CLOSED/PUSHED | `3d1f6ad` / `20261121120000` | **Not hosted-applied** |
| CONN-1b | CLOSED/PUSHED | `00557c7` | No production KEK |
| CONN-1c-α | CLOSED/PUSHED · PARTIAL | `a918217` / `20261122120000` | Binding **NOT_YET_VERIFIED**; not hosted-applied |
| CONN-1c-β | CLOSED/PUSHED · PARTIAL | `173a357` / `20261122130000` | V5 two-session disposable PG PASS; not hosted-applied |
| CONN-1d-A | CLOSED/PUSHED · PARTIAL | `636725c` (no migration) | V12 offline PASS; V11 PARTIAL — guarded CSV paths only; DB-level bypass, unsupported object types and stringified/encoded payloads remain gaps |
| CONN-1d-B | CLOSED/PUSHED · PARTIAL | `0f3e1d2` (tests only) | V8 offline SQL role + claim-stub PASS; claim stub ≠ real JWT; hosted JWT/PostgREST **NOT VERIFIED** |
| CONN-1d-C | CLOSED/PUSHED · PARTIAL | `5c1c76b` / `20261122140000` | α create/CAS fenced on terminal status; disconnect/revoke with `lease_held` pending cleanup; ownership released only on `completed`; two-session races PASS; β fixture passes on α+β and α+β+1d-C; rollback keeps fence; not hosted-applied |
| CONN-1d-D | CLOSED/PUSHED (docs) · PARTIAL | `40d5888` · `docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md` | Historical V1–V15 re-matrix (13 offline PASS · V8/V11 PARTIAL). **CONN-1 exit UNMET**; contract §11 unchanged |
| CONN-1d-E | CLOSED/PUSHED · PARTIAL | `5de98cf` / `20261124120000` | `zz_conn_1d_e_secret_json_guard` BEFORE INSERT/UPDATE triggers on `integrations.configuration`, `provider_bindings.source_metadata`, `sync_runs.error_summary` / `reconciliation_metadata`; TRIGGER revoked from `public`/`anon`/`authenticated`/`service_role`; app guard rewritten (same exports). V11 stays **PARTIAL**: opaque/encoded secrets undetectable, owner/superuser bypass residual, hosted unverified. Not hosted-applied |
| CONN-1d-F | Read-only audit · decisions recorded by DOC-TRACK-3 @ `7bd2e8b` | `docs/SHOPIFY_CONN_1D_F_SECURITY_EXIT_READINESS_REPORT.md` | 14 offline PASS · 1 PARTIAL (V11); V8 offline PASS under §11 (hosted NOT VERIFIED); binding gaps (§4.1), hosted readiness items (§4.3), D13/D14 questions (§4.4), operational risks (§4.5) |
| CONN-HR-0 | CLOSED (read-only preflight) · LOCAL-ONLY | Chat `CONN_HR_0_HOSTED_READINESS_PREFLIGHT_REPORT` | Preflight design for five CONN migrations; CLI per-file semantics analyzed; no hosted SQL | Unverified hosted ACLs / logs / collation | CONN-HR-1 |
| CONN-HR-1 | CLOSED/PUSHED · PARTIAL | `454f7ec` · `docs/CONN_HR_1_HOSTED_READINESS_RUNBOOK.md` | Offline package: readonly probes, disposable replay, Option B `psql` candidate; CLI #5 **25P01 BLOCKED**; Option B disposable **PASS** (52→57; post-apply 23/23; abort→52) | Hosted P1–P9 not run; no hosted apply artifact executable in-repo | CONN-HR-2 |

Reports: `docs/SHOPIFY_CONN_1{A,B}_*_IMPLEMENTATION_REPORT.md`, `docs/SHOPIFY_CONN_1C_{ALPHA,BETA}_IMPLEMENTATION_REPORT.md`, `docs/SHOPIFY_CONN_1D_B_V8_IMPLEMENTATION_REPORT.md`, `docs/SHOPIFY_CONN_1D_C_DISCONNECT_REVOKE_IMPLEMENTATION_REPORT.md`, `docs/SHOPIFY_CONN_1D_E_V11_IMPLEMENTATION_REPORT.md`, the cross-slice **`docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md`** (historical V1–V15 re-matrix), **`docs/SHOPIFY_CONN_1D_F_SECURITY_EXIT_READINESS_REPORT.md`** (V1–V15 status and decisions), and **`docs/CONN_HR_1_HOSTED_READINESS_RUNBOOK.md`** (offline readiness / Option B). Implementation reports are historical evidence; their "STOP for owner review" / "pending Git closure" headers predate their closures and are not rewritten. CONN-1d-A has no standalone implementation report; evidence is commit `636725c` (`lib/security/secret-ingestion.ts`, `tests/unit/shopify-conn-1d-a-secret-ingestion-boundaries.test.ts`), and its residual V11/V12 limitations are recorded in §§3–4 of the acceptance report.

### 4.7 CONN-MP-0 and future Woo / Amazon / Noon

**CONN-MP-0 CLOSED/PUSHED** @ `1e18029` — docs-only architecture freeze; accepted with D2/D5/D7/D8/D10/D11 amendments; **D13/D14 DEFERRED**. WooCommerce token already in provider vocabulary; Amazon/Noon require **CONTRACT_CHANGE** before SQL enum expansion. Never use `other` as permanent Amazon/Noon alias. Implementation slices (CONN-MP-1, CONN-MP-CRED, Amazon-SEC-0, etc.) separately gated after Shopify-first path.

### 4.8 UX-INV-1a–1d

| Slice | Status | Commit |
|---|---|---|
| 1a Overview attention | CLOSED/PUSHED | `10d9de6` |
| 1b SKU inspector / filters | CLOSED/PUSHED | `f1426c4` |
| 1c / 1c.1 replenishment + incoming | CLOSED/PUSHED | `0402564` |
| **1d** merchant-first simplification + premium responsive polish | **PLANNED** | — |

**UX-INV-1d goals (PLANNED — not implementation permission):**

1. Task → action → result dashboard simplification (one primary next safe task).
2. Actionable attention queue; short merchant-friendly explanations.
3. Expandable evidence/provenance; clear results and next step.
4. Premium responsive landing/dashboard polish.
5. Preserve honest Unknown/stale states; **no fake M7 action authorization**.
6. Reduce excessive explanations / repeated readiness warnings; increase action prominence.

DOC-TRACK-1 does **not** implement UX-INV-1d.

### 4.9 AI-INV-1 / 1.1 / 2–6

| Slice | Status |
|---|---|
| AI-INV-1 + 1.1 | CLOSED/PUSHED @ `38f63d6`; soft-enable **OFF**; offline/local; not live-certified |
| AI-INV-2 Data readiness | PLANNED |
| AI-INV-3 Connected context | PLANNED (needs SyncRun/OAuth) |
| AI-INV-4 Forecast explain | PLANNED (needs M6 production) |
| AI-INV-5 Cash/supplier | PLANNED |
| AI-INV-6 Decision agent | PLANNED (needs M7 authorization) |

### 4.10 AI-ARCH + AI-MKT + proposed intelligence expansion (AI-ARCH-0)

**Architecture (PROPOSED design):** AI-ARCH-0 Commerce Decision Loop + evidence contracts. **L1 eng:** AI-ARCH-1a–1d **CLOSED/PUSHED** @ `d56de33`; AI-ARCH-1e **CLOSED/PUSHED** @ `1c75de5`; AI-ARCH-1f **LOCAL_COMPLETE** (soft-enable **OFF**). Principle: *The AI controls the investigation. It does not control what counts as a fact.* Full detail: `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md` · DOCX §37 · `docs/AI_ARCH_1F_IMPLEMENTATION_REPORT.md`.

**Existing PLANNED sequence (unchanged IDs):** AI-MKT-0 → 1 → 1.1 → 2 → 3 → 4. External research requires authorized/licensed evidence. OpenAI/Gemini grounding are **future adapters**, not retail transaction DBs. Credits/billing/live research remain **unimplemented**.

**PROPOSED dependency-aware product sequence (owner approval required; order unchanged):**

| Order | ID | Intent | Status |
|---|---|---|---|
| 0 | **AI-ARCH-0** | Orchestrator & evidence architecture | **PROPOSED** (design @ `d12fd04`) |
| 1 | **AI-ARCH-1** | Bounded read-only agent (L1) | **1a–1e CLOSED/PUSHED** (`d56de33`/`1c75de5`); **1f LOCAL_COMPLETE**; parent closure pending |
| 1b | AI-INV-1.1 enablement | Soft-enable / merchant UX (code CLOSED @ `38f63d6`) | **PROPOSED** |
| 2 | AI-MKT-0 | Data/source/licensing feasibility | PLANNED |
| 3 | AI-MKT-1 | Grounded SKU/country research | PLANNED |
| 4 | AI-MKT-1.1 | Credits and cost control | PLANNED |
| 5 | AI-MKT-2 | Zero-sales detective | PLANNED |
| 6 | **COMP-1** | Competitor/customer sentiment workspace | **PROPOSED** |
| 7 | AI-MKT-3 | Product/country opportunity advisor | PLANNED |
| 8 | **CREATIVE-0** | Ad-platform data feasibility | **PROPOSED** |
| 9 | **CREATIVE-1** | Owned creative/campaign analytics | **PROPOSED** |
| 10 | **CREATIVE-2** | Creative experiments and learning | **PROPOSED** |
| 11 | AI-MKT-4 | Outcome / buying intelligence | PLANNED / wording **PROPOSED** |
| 12 | **LOOP-1** | Measured decision-learning system | **PROPOSED** |

**Principles (frozen):** provider-independent commerce engine; Shopify first; evidence before AI conclusions; country-aware research; authorized/licensed sources only; no invented competitor sales/ROAS; human approval for actions; deterministic inventory math canonical; premium/responsive merchant UX; **no feature activation by documentation**.

### 4.11 Supplier Intelligence and future merchant UX

Supplier Intelligence V1 **PLANNED AFTER CORE** — compare merchant-provided quotes / draft RFQs; no auto-contact, purchase, payment, or supplier marketplace search. Marketing/landing premium Problem vs Solution and decision-first workspace = **PLANNED DESIGN** slices, separate from CONN SQL work.

### 4.12 Hosted / JWT / security / launch readiness

| Gate | State |
|---|---|
| Hosted schema ledger | **57/57 DEPLOYED_VERIFIED** (historical 38→52 CLOSED; CONN 53–57 Option B + catalog 23/23) ≠ activation unlock |
| CONN migrations hosted apply | **DEPLOYED_VERIFIED** — `20261121120000`…`20261124120000` applied; do **not** re-apply |
| Apply method (historical) | CLI `db push` of #5 **25P01 BLOCKED**; Option B **used** for hosted 53–57 |
| CONN-HR-0 / HR-1 / HR-2C | HR-0/1 offline **CLOSED**; HR-2B/2C schema path complete; operator scripts may still be untracked; activation **OFF** |
| CONN-1 exit (vault contract §11) | **UNMET** — V11 PARTIAL; §11 unchanged; not CLOSED, not CERTIFIED |
| V8 | Offline **PASS** under §11 (SQL role + claim stub); hosted JWT/PostgREST **NOT VERIFIED** |
| V10 end-to-end bind / cross-org reclaim | **DEFERRED** to CONN-2 / D13 (schema-level uniqueness offline PASS only) |
| V11 secret-ingestion | **PARTIAL** — DB + app guard offline PASS for defined key/value classes and non-owner roles (1d-E); opaque/encoded secrets undetectable; owner/superuser bypass residual; hosted not verified |
| V12 redaction | Offline **PASS** with limitations — not universal redaction (stringified JSON values, non-Shopify token shapes, logger-routed output only) |
| Production credential binding | **`NOT_YET_VERIFIED`** |
| Production KEK custody (D14) | **DEFERRED** |
| Revoke retention (D13) | **DEFERRED** |
| PE1.b.6b JWT | **BLOCKED** (not executed) |
| Workers / cron | **OFF / BLOCKED** |
| M6 production forecast | **NOT APPROVED** |
| M7 create / purchasing | **BLOCKED** |
| Paying-customer launch | **NO-GO** |

---

## 5. Status class definitions (use consistently)

| Class | Meaning |
|---|---|
| **CLOSED/PUSHED** | Accepted on `main` with verified commit SHA; may still be PARTIAL offline |
| **LOCAL-ONLY** | Accepted on local/disposable evidence; not production/hosted claim |
| **PARTIAL** | Offline/foundation closed; production authorization or hosted apply incomplete |
| **PLANNED** | Specified or roadmapped; not authorized to implement in current session |
| **BLOCKED** | Explicit stop gate; do not proceed without owner authorization |
| **DEFERRED** | Owner consciously postponed (e.g. D13/D14) |

---

## 6. Outstanding owner decisions and security STOP gates

### Owner decisions open

**Recorded 2026-11-27 (DOC-CONTINUITY-6):** Hosted CONN migrations **DEPLOYED_VERIFIED** — local **57** / hosted **57**; history md5 `900da6949dfd6f7818a454b7f28ddf33`; post-catalog **23/23 PASS** (`~/StoreAgentEvidence/conn-hr-2c-postcatalog-20261127T040549Z`). Option B apply COMMITTED; parser-mismatch incident resolved offline. Backup checksum verified; **full Supabase DR NOT ESTABLISHED**. OAuth / workers / cron / SyncRun / credentials **OFF**. Migration sync Cursor rule installed. HEAD `78c1d45`. (Prior DOC-TRACK-5 @ `78c1d45` / FE-ACCEPT-1C `1edc1ff` unchanged for local browser cert ≠ hosted.)

1. Accept **AI-ARCH-0** architecture + IDs (`AI-ARCH-0`, `AI-ARCH-1`) as **PROPOSED**; authorize combined docs Git closure with DOC-CONTINUITY-6 when ready.
2. Accept or revise the **PROPOSED** sequence (AI-ARCH-0 → AI-ARCH-1 / AI-INV-1.1 enablement → AI-MKT-0… → COMP-1 → CREATIVE-0…2 → AI-MKT-4 → LOOP-1).
3. Authorize **next eng slice**: **AI-ARCH-1** (L1) **and/or** AI-INV-1.1 soft-enable / UX **or** UX-INV-1d (presentation only).
4. Choose hosted **V8 JWT/PostgREST** verification venue (empty-vault probe or PE1.b.6b J-matrix) — still **NOT VERIFIED**.
5. Authorize production **binding** slice; resolve **D14** KEK before any vault **write**; **D13** before CONN-2 bind design.
6. Reconcile protected `docs/SERVICE_ROLE_BOUNDARY.md` with 1d-E TRIGGER revoke (not edited here).
7. Decide Git closure of untracked `scripts/conn-hr-1/operator/` (optional; separate from activation).
8. Canonical DOCX **§36** + **§37** present; refresh Word Contents field if needed.
9. Keep PE1.b.6b / workers / M6 prod / M7 create / OAuth / SyncRun / live model / AI-MKT spend / launch **BLOCKED** (recommended YES).
10. Accept residual recovery risk: local backup verified; vault/managed/platform full restore **NOT ESTABLISHED**.

### Hard STOP gates (do not unlock from docs alone)

- Production binding; production KEK; Shopify OAuth; live nested cert; SyncRun; webhooks; workers; cron
- Hosted JWT J-matrix; M6 production publish; M7 create/purchasing
- Paid AI market research / credits / billing; live model enablement
- Amazon/Noon partner paths without contract change
- Drain E.4 canary grain; promote synthetic snapstore data to production seeds
- Re-apply CONN migrations / `db push` #5 / `migration repair` without separate approval
- Treat schema **DEPLOYED_VERIFIED** as connector production activation

---

## 7. Next milestones (dependency order)

Each step needs its own owner authorization. Migration DoD classes: `LOCAL_COMPLETE` / `HOSTED_SYNC_PENDING` / `DEPLOYED_VERIFIED`.

**Completed (schema / local — not activation)**
1. DOC-TRACK-3…5 · FE-ACCEPT-1C · CONN-HR-0/1 · CONN-1a…1d-E offline closes (as prior logs).
2. **CONN hosted migrations 53–57** — **DEPLOYED_VERIFIED** (57/57; md5 `900da694…`; post-catalog 23/23).
3. Migration synchronization policy rule installed.

**Immediate**
4. Owner review of **AI-ARCH-1f** (`LOCAL_COMPLETE`) + parent **AI-ARCH-1** Git checkpoint when authorized.

**Recommended next eng (separately gated; after AI-ARCH-1 closure)**
5. **AI-MKT-0** (docs/legal feasibility — no live providers). Parallel: **AI-INV-1.1** soft-enable / UX (**PROPOSED**; soft-enable stays OFF until auth) **or** **UX-INV-1d**.
5b. **Before AI-MKT production use:** reconcile CONN-1 exit / hosted **V8 JWT** / binding / D13/D14 (still UNMET / NOT VERIFIED / NOT_YET_VERIFIED / DEFERRED).

**Before OAuth / runtime credential ops**
6. Hosted **V8 JWT** empty-vault / PostgREST probe (still NOT VERIFIED).
7. **Production binding** · **D14** KEK (before vault writes) · **D13** (before CONN-2 bind design).
8. **CONN-2 OAuth** — V10 bind/reclaim; token paths cannot reach the four JSON writers.

**Before SyncRun:** `lease_held` retry · fail-finalization / stale-run · real-clock lease test.

**PROPOSED intelligence track (dependency order unchanged; no live spend without AI-MKT-1.1):**
**AI-ARCH-0 → AI-ARCH-1 (1a–1e CLOSED/PUSHED; 1f LOCAL_COMPLETE; parent pending)** → AI-MKT-0 → 1 → 1.1 → 2 → **COMP-1** → AI-MKT-3 → **CREATIVE-0→1→2** → AI-MKT-4 → **LOOP-1** (AI-INV-1.1 enablement may run in parallel as UX; CONN/security gates before market production use).

**Still later / blocked:** live nested cert → SyncRun → AI-INV-2…6 → M6 production (post-JWT) → M7 inbox → Woo/Amazon/Noon → paying launch.

---

## 8. Fresh Cursor / ChatGPT session bootstrap

```text
Continue StoreAgent.si as engineering reviewer/planner, not an autonomous production operator.
1) Verify: git branch=main, HEAD tip=1c75de5 (AI-ARCH-1e CLOSED/PUSHED); AI-ARCH-1f may be uncommitted LOCAL_COMPLETE; origin aligned; preserve protected dirty/untracked files.
2) Read first: docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md (this file), docs/AI_ARCH_1F_IMPLEMENTATION_REPORT.md, docs/SHOPIFY_CONN_1D_F_SECURITY_EXIT_READINESS_REPORT.md, docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md, then the frozen contract for the authorized slice.
3) Frozen truth: Hosted migrations 57/57 DEPLOYED_VERIFIED; history md5 900da6949dfd6f7818a454b7f28ddf33; post-catalog 23/23 PASS (evidence conn-hr-2c-postcatalog-20261127T040549Z). FE-ACCEPT-1C @ 1edc1ff local browser cert PASS ≠ hosted. V11 PARTIAL; V8 hosted JWT NOT VERIFIED; CONN-1 exit UNMET; binding NOT_YET_VERIFIED; D13/D14 DEFERRED; OAuth/workers/cron/SyncRun OFF; full Supabase DR NOT ESTABLISHED. AI-INV-1/1.1 @ 38f63d6 soft-enable OFF. AI-ARCH-0 PROPOSED; AI-ARCH-1a–1d CLOSED/PUSHED @ d56de33; AI-ARCH-1e CLOSED/PUSHED @ 1c75de5; AI-ARCH-1f LOCAL_COMPLETE soft-enable OFF. Principle: AI controls investigation, not facts. Migration sync rule: .cursor/rules/migration-synchronization-policy.mdc.
4) Next: owner review of AI-ARCH-1f → parent AI-ARCH-1 Git checkpoint → AI-MKT-0 only under separate auth (reconcile CONN/security before market production) — not OAuth/SyncRun/activation from docs alone.
5) Bans: no OAuth/SyncRun/workers/JWT/M6-prod/M7-create/purchasing/live AI research; no migration reapply/repair; no fake ROI or autonomous buying; no drive-by Git on protected dirties.
6) After EVERY milestone (including BLOCKED): update this handoff current-state + §11 + living ledger pins BEFORE the next milestone. Do not rely on chat length.
```

---

## 9. Milestone closure / update protocol (short)

1. Confirm branch, HEAD, origin, dirty tree, local vs hosted migration counts, and **approved change manifest**.
2. Close only with evidence: tests, report, commit SHA, status class + migration DoD (`LOCAL_COMPLETE` / `HOSTED_SYNC_PENDING` / `DEPLOYED_VERIFIED`).
3. **Before starting the next milestone:** refresh §§2–4/7/8; append §11; update living ledger + pointer *current* pins; record blocked state explicitly if blocked (`HOSTED_MIGRATION_BLOCKED` when applicable).
4. Stage **only** approved paths; `git diff --cached --check`; trailing-whitespace scan.
5. Commit/push only after owner review. Record remote SHA after independent verify.
6. Never treat this handoff as authorization for OAuth, workers, purchasing, or live AI spend. Schema deploy ≠ activation.

---

## 10. Authority index (links — avoid duplicating contracts)

| Doc | Role |
|---|---|
| `docs/IMPLEMENTATION_STATUS.md` | Short pointer |
| `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md` | Living ledger |
| `docs/PROJECT_HANDOFF.md` | Session bootstrap (longer) |
| `docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md` | November execution sequence |
| `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md` | AI-ARCH-0 + AI-INV + AI-MKT + COMP/CREATIVE/LOOP |
| `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md` | UX-INV-1 delivery |
| `docs/COMPETITIVE_UX_MERCHANT_PAIN_POINT_ROADMAP.md` | Competitive themes (historical pins possible) |
| `docs/PROVIDER_ADAPTERS.md` / `docs/SHOPIFY_RO2_TRANSPORT.md` | Adapter + Shopify RO law |
| `docs/SHOPIFY_CONN_0_SECURITY_ARCHITECTURE.md` | CONN-0A |
| `docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md` | Vault contract |
| `docs/SHOPIFY_CONN_1{A,B}_*_IMPLEMENTATION_REPORT.md` | 1a/1b evidence |
| `docs/SHOPIFY_CONN_1C_{ALPHA,BETA}_IMPLEMENTATION_REPORT.md` | 1c-α/β evidence |
| `docs/SHOPIFY_CONN_1D_B_V8_IMPLEMENTATION_REPORT.md` | 1d-B V8 evidence |
| `docs/SHOPIFY_CONN_1D_C_DISCONNECT_REVOKE_IMPLEMENTATION_REPORT.md` | 1d-C disconnect/revoke evidence |
| `docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md` | CONN-1d-D V1–V15 re-matrix (historical tally) |
| `docs/SHOPIFY_CONN_1D_E_V11_IMPLEMENTATION_REPORT.md` | 1d-E V11 JSON secret guard evidence |
| `docs/SHOPIFY_CONN_1D_F_SECURITY_EXIT_READINESS_REPORT.md` | Current V1–V15 status; CONN-1 exit; hosted/production blockers; owner decisions |
| `docs/CONN_HR_1_HOSTED_READINESS_RUNBOOK.md` | CONN-HR-1 offline readiness / Option B package (historical offline); hosted apply completed under CONN-HR-2/2C evidence |
| `.cursor/rules/migration-synchronization-policy.mdc` | Permanent local↔hosted migration sync DoD |
| `docs/CONN_MP_0_MULTI_PROVIDER_ARCHITECTURE_PROPOSAL.md` | Multi-provider freeze |
| `docs/M5_6_HANDOFF.md` / `docs/M6_PE1_B6B_SESSION_HANDOVER.md` | Workers / JWT continuity |
| `docs/HOSTED_38to52_MIGRATION_RUNBOOK.md` | Hosted schema closeout |
| Master roadmap DOCX | `docs/StoreAgent_Master_Roadmap_Updated_2026-11-10.docx` — §§1–35 historical + **§36 DOC-CONTINUITY-6** + **§37 AI-ARCH-0 (PROPOSED)** |

---

## 11. New information log (append-only)

- **2026-11-22 (pre-β draft, untracked):** Dated file `STOREAGENT_MASTER_MILESTONE_HANDOFF_2026-11-22.md` recorded HEAD `1e18029` (CONN-MP-0) and “CONN-1c-β not begun” — **superseded for current pins** by this canonical file after β Git close.
- **2026-11-22 (DOC-TRACK-1):** Verified `main` @ `173a357` ≡ `origin/main`. **CONN-1c-beta CLOSED/PUSHED** (PARTIAL offline; V5 genuine two-session disposable PG PASS). Prior CLOSED/PUSHED preserved: CONN-MP-0 `1e18029`, CONN-1c-α `a918217`, CONN-1b `00557c7`, CONN-1a `3d1f6ad`, CONN-0A `965e6d7`, AI-INV-1/1.1 `38f63d6`, RO.3 `4f6ef0c`, UX through `0402564`. Binding **NOT_YET_VERIFIED**. Hosted CONN migrations **not applied**. UX-INV-1d recorded **PLANNED** (merchant-first simplification + premium polish). Next eng: **CONN-1d** (not started). DOC-TRACK-1 = docs-only; STOP for owner review.
- **2026-11-22 (DOC-TRACK-2):** Verified `main` @ `5c1c76b` ≡ `origin/main`; staging empty. DOC-TRACK-1 closed @ `0e2fc33`. **CONN-1d-A CLOSED/PUSHED** @ `636725c` — V12 offline PASS; V11 PARTIAL (DB-level bypass, unsupported object types, stringified/encoded payload gaps). **CONN-1d-B CLOSED/PUSHED** @ `0f3e1d2` — V8 offline SQL role + claim-stub PASS; hosted JWT/PostgREST NOT VERIFIED. **CONN-1d-C CLOSED/PUSHED** @ `5c1c76b` — α terminal create/CAS fence, lease-aware disconnect/revoke (`lease_held` = pending cleanup, never "credentials destroyed"), Phase A ownership release only on `completed`, two-session races PASS, β fixture compatible with α+β and α+β+1d-C, rollback keeps the fence; offline PARTIAL. Migration inventory **56**. Binding **NOT_YET_VERIFIED**; D13/D14 **DEFERRED**; hosted CONN vault migrations (incl. `20261122140000`) **not applied**. **CONN-1d-D PLANNED**, not started. UX-INV-1d, AI-INV-2–6, AI-MKT-0–4 and multi-provider roadmap unchanged. DOC-TRACK-2 = docs-only; STOP for owner review.
- **2026-11-23 (CONN-1d-D):** Verified `main` @ `b3ac033` ≡ `origin/main`; staging empty. **DOC-TRACK-2 CLOSED/PUSHED** @ `b3ac033`. CONN-1d-A/B/C closure SHAs unchanged (`636725c` / `0f3e1d2` / `5c1c76b`). New `docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md`: V1–V15 re-matrix from dated 2026-11-22 offline evidence (no fresh execution) — **13 offline PASS** (V1–V7, V9, V10 schema level, V12, V13, V14, V15) and **2 PARTIAL**: V8 (offline SQL role + claim-stub PASS; hosted JWT NOT VERIFIED) and V11 (application-layer guards only). V12 offline PASS with recorded limitations (not universal redaction). V10 end-to-end bind/reclaim deferred to CONN-2 / D13. Vault contract §11 **unchanged**; **CONN-1 exit UNMET** (V11 PARTIAL); CONN-1 not CLOSED or CERTIFIED. Binding **NOT_YET_VERIFIED**; D13/D14 **DEFERRED**; four CONN vault migrations **not hosted-applied**; OAuth, Shopify HTTP, SyncRun, workers **BLOCKED**. §6 owner-decision numbering corrected (duplicate "8." → 1–10). **CONN-1d-D = docs-only PARTIAL, pending its own Git closure.** Proposed next: **CONN-1d-E** read-only V11 hardening preflight (not authorized). UX-INV-1d, AI-INV-2–6, AI-MKT-0–4 unchanged. STOP for owner review.
- **2026-11-24 (DOC-TRACK-3):** Verified `main` @ `5de98cf` ≡ `origin/main`; staging empty; **57** migrations = 57 manifest entries (latest `20261124120000`); integrity check PASS. **CONN-1d-D CLOSED/PUSHED** @ `40d5888` (docs). **CONN-1d-E CLOSED/PUSHED** @ `5de98cf` — DB trigger guard on the four non-vault JSON columns, `service_role` TRIGGER revoke, stricter app guard, parity corpus and static future-migration model; disposable PostgreSQL 17.11 only; not hosted-applied. CONN-1d-F read-only audit recorded in `docs/SHOPIFY_CONN_1D_F_SECURITY_EXIT_READINESS_REPORT.md`. Owner decisions: V11 **PARTIAL**, §11 **unchanged**, **CONN-1 exit UNMET**; V8 offline **PASS** under §11, hosted JWT/PostgREST **NOT VERIFIED**; binding **NOT_YET_VERIFIED**; D13/D14 not resolved; five migrations (`20261121120000` → `20261122120000` → `20261122130000` → `20261122140000` → `20261124120000`) await hosted authorization; **no hosted application authorized**; **CONN-HR-0** next. Vault contract and historical implementation reports unchanged; protected `docs/SERVICE_ROLE_BOUNDARY.md` not edited. DOC-TRACK-3 = docs-only, pending its own Git closure. STOP for owner review.
- **2026-11-25 (DOC-TRACK-4):** Verified `main` @ `454f7ec` ≡ `origin/main`; staging empty; **57** migrations = 57 manifest entries; integrity check PASS. **DOC-TRACK-3 CLOSED/PUSHED** @ `7bd2e8b` (docs). **CONN-HR-0** read-only preflight **CLOSED** (LOCAL-ONLY chat evidence `CONN_HR_0_HOSTED_READINESS_PREFLIGHT_REPORT`; no hosted SQL). **CONN-HR-1 CLOSED/PUSHED** @ `454f7ec` — offline package: `scripts/conn-hr-1/readonly/*`, disposable tooling, Option B single-transaction `psql` candidate, `docs/CONN_HR_1_HOSTED_READINESS_RUNBOOK.md`. Offline apply-method evidence: CLI `supabase db push` of migration #5 (`20261124120000`) **BLOCKED** (SQLSTATE **25P01** — `LOCK TABLE` cannot run inside a multi-statement transaction); Option B disposable **PASS** (history 52→57; post-apply catalog 23/23; abort restores 52). Hosted P1–P9 **not run**; hosted apply **NO-GO**. V11 **PARTIAL**; §11 unchanged; **CONN-1 exit UNMET**; V8 hosted JWT **NOT VERIFIED**; binding **`NOT_YET_VERIFIED`**; D13/D14 unresolved; five CONN migrations still **not hosted-applied**. **Next: CONN-HR-2** (hosted P1–P9 + reviewed Option B artifact; apply remains separately gated). DOC-TRACK-4 = docs-only, pending its own Git closure. STOP for owner review.
- **2026-11-26 (DOC-TRACK-5):** Verified `main` @ `1edc1ff` ≡ `origin/main`; staging empty; **57** migrations = 57 manifest entries; hosted schema track still **52**; integrity check PASS. **FE-ACCEPT-1C CLOSED/PUSHED** @ `1edc1ff` (16 files) — automated local Mailpit magic-link authentication **PASS**; merchant E2E 6/6 **PASS**; Actions E2E 6/6 **PASS**; Actions-1280 stress 8/8 **PASS** (queue-row `lg:scroll-mt-[4.25rem]` under sticky DemoDataBanner). Local authenticated browser certification **PASS** — **not** hosted/production certification. CONN-HR-0/HR-1 pins unchanged (`7bd2e8b` / `454f7ec`); CLI #5 **25P01 BLOCKED**; Option B disposable **PASS**; hosted P1–P9 **not run**; hosted apply **NO-GO**. V11 **PARTIAL**; §11 unchanged; **CONN-1 exit UNMET**; V8 hosted JWT **NOT VERIFIED**; binding **`NOT_YET_VERIFIED`**; D13/D14 **DEFERRED**; five CONN migrations still **not hosted-applied**. OAuth / SyncRun / workers / M6 production / M7 production / buying / launch remain **BLOCKED**. **Next: CONN-HR-2**. DOC-TRACK-5 later Git-closed on tip `78c1d45`.
- **2026-11-27 (DOC-CONTINUITY-6):** Verified `main` @ `78c1d45` ≡ `origin/main` tracking. Owner-confirmed hosted migration ledger **57/57** after Option B apply of CONN `20261121120000`…`20261124120000`; history md5 **`900da6949dfd6f7818a454b7f28ddf33`**; hosted post-catalog **23/23 PASS** (exit 0) evidence `~/StoreAgentEvidence/conn-hr-2c-postcatalog-20261127T040549Z` (`post_catalog_utc=2026-11-27T04:06:14Z`). Apply evidence `~/StoreAgentEvidence/conn-hr-2c-apply-20261127T033439Z` (COMMIT observed; interim parser false-fail resolved by pipe-delimiter fix — incident preserved). Backup checksum verified; **full Supabase DR NOT ESTABLISHED**. Schema path **DEPLOYED_VERIFIED**; OAuth / workers / cron / SyncRun / credentials **OFF**; V8 hosted JWT **NOT VERIFIED**; V11 **PARTIAL**; binding **NOT_YET_VERIFIED**; D13/D14 **DEFERRED**; CONN-1 exit **UNMET**. Migration sync rule `.cursor/rules/migration-synchronization-policy.mdc` installed. PROPOSED intelligence sequence recorded (AI-INV-1.1 enablement NEXT; COMP-1 / CREATIVE-0…2 / LOOP-1 new). Docs-only; pending Git closure.
- **2026-11-27 (AI-ARCH-0):** Docs-only architecture reconciliation (later closed with DOC-CONTINUITY-6 @ `d12fd04`; historical authoring also referenced tip `78c1d45`). StoreAgent framed as **AI Commerce Intelligence & Buying Agent** with one evidence-grounded **Commerce Decision Loop**. New **PROPOSED** IDs: **AI-ARCH-0** (orchestrator & evidence architecture), **AI-ARCH-1** (bounded L1 read-only agent). Principle: *The AI controls the investigation. It does not control what counts as a fact.* Autonomy L1 first; L2/L3 separately gated. Evidence contracts, query flow, closed-loop/LOOP-1 target, and security invariants recorded in AI roadmap + Nov plan §0I + DOCX **§37**. AI-INV-1/1.1 remains **CLOSED/PUSHED** @ `38f63d6` (soft-enable **OFF**); enablement/UX only **PROPOSED**. AI-MKT-0…4 IDs preserved **PLANNED**; COMP/CREATIVE/LOOP remain **PROPOSED**. Schema pins unchanged (57/57 · 23/23 · DEPLOYED_VERIFIED · activation OFF). Historical note: “not implemented” applied at authoring; superseded for L1 eng status by AI-ARCH-1a–1e entries below.
- **2026-11-27 (AI-ARCH-1a–1d):** **CLOSED/PUSHED** @ `d56de33` — contracts, L1 tool registry, bounded orchestrator, grounded draft validation; Vitest **62/62 PASS**; soft-enable **OFF**; no UI/live AI/migrations. Historical reports preserve their own STOP/pending headers.
- **2026-11-27 (AI-ARCH-1e):** Verified tip `d56de33` ≡ `origin/main`. Guarded merchant intelligence UX **`LOCAL_COMPLETE`** (uncommitted; Git checkpoint pending). Thin structured-intent panel in SKU inspector; server action with auth/membership/`inventory.read`/enablement-before-tools; merchant-safe DTO; soft-enable **OFF**. Vitest 1e **14/14** · combined 1a–1e **76/76** · typecheck/lint/build **PASS**. Schema **57/57** · post-catalog **23/23** prior · **DEPLOYED_VERIFIED** · activation **OFF**. Protected dirty/untracked set preserved. Report: `docs/AI_ARCH_1E_IMPLEMENTATION_REPORT.md`.
- **2026-11-27 (AI-ARCH-1e final acceptance):** Config safety PASS (`.env.example` docs-only; no real env enablement). Security denial + zero evidence-load PASS. Isolated fixture browser matrix **375/768/1280/1440/2560 PASS** (evidence `.tmp/ai-arch-1e-accept/artifacts/`); live soft-enable inventory browser **NOT EXECUTED**. Final report: `docs/AI_ARCH_1E_FINAL_ACCEPTANCE_REPORT.md`. Owner Git checkpoint **GO** (allowlist only). Historical note: acceptance authored while tip was still `d56de33` with 1e uncommitted.
- **2026-11-27 (AI-ARCH-1e Git closure):** **CLOSED/PUSHED** @ `1c75de5` ≡ `origin/main`. Soft-enable **OFF**. Continuity pins reconciled from prior LOCAL_COMPLETE/uncommitted wording.
- **2026-11-27 (AI-ARCH-1f):** Verified tip `1c75de5` ≡ `origin/main`. Offline evaluation & release-readiness **`LOCAL_COMPLETE`** (uncommitted; parent AI-ARCH-1 Git checkpoint pending). Versioned fixture `ai/ai-arch-1f-eval-v1` + runner exercises real orchestrator/validators/guarded investigation/DTO; design §9 + adversarial matrix **38/38 case PASS**; Vitest 1f **45/45** · combined 1a–1f **121/121** · AI-INV **27/27** · typecheck/lint/build **PASS**. Bounds **6/4/8000** verified. Budget honesty: zero live spend; credits/daily token cost enforcement **not** implemented. Schema **57/57** · post-catalog **23/23** prior · **DEPLOYED_VERIFIED** · activation **OFF**. No migrations/deps/env/UI/product fixes. Protected dirty/untracked set preserved. Offline eng **GO** / production activation **NO-GO**. Report: `docs/AI_ARCH_1F_IMPLEMENTATION_REPORT.md`. **Exact next after parent AI-ARCH-1 closure:** AI-MKT-0 (docs/legal) under separate auth; reconcile CONN-1 exit / V8 JWT / binding before market production use. STOP for owner review.
