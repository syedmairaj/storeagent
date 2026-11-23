# StoreAgent.si — Master Milestone Handoff

| Field | Value |
|---|---|
| Document ID | DOC-TRACK-1 (created) · DOC-TRACK-2 (CONN-1d-A/B/C reconciliation) · CONN-1d-D (security acceptance docs) |
| Canonical path | `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md` |
| As-of | 2026-11-23 (Asia/Dubai) — CONN-1d-D |
| Mode | Living compact handoff — **not** a substitute for frozen contracts, audit reports, or original decision docs |
| Update policy | After each owner-accepted milestone closure, append §11 dated log + refresh §§2–4/7. Never silently rewrite historical approvals or promote offline work to production-ready |

> **Untracked dated draft** `docs/STOREAGENT_MASTER_MILESTONE_HANDOFF_2026-11-22.md` is a **pre-β snapshot** (HEAD pin `1e18029`, “CONN-1c-β not begun”). Prefer **this file**. Do not delete the dated draft under DOC-TRACK-1.

---

## 1. Project vision and frozen architecture

**North star:** One inventory intelligence workspace for every channel you sell through. Connect stores, understand what is selling, identify stock risks, and make better buying decisions.

| Frozen rule | Meaning |
|---|---|
| Independent SaaS | StoreAgent.si hosts merchant UX; Shopify is first native connector (standalone OAuth later), then Woo / Amazon / Noon by separate gates |
| One canonical commerce domain | Adapters normalize into one domain; **never** separate calculation engines per provider; unknown ≠ zero |
| Deterministic spine | M5 metrics → M6 forecasting → M7 REORDER / REDUCE / PROMOTE / WATCH; AI **explains**, never owns numbers |
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
| HEAD | `b3ac033` — `docs(storeagent): reconcile CONN-1d-A/B/C security milestones` |
| Full SHA | `b3ac0338a6a17aa9a1eb8f20552dc903bb7a5724` |
| `origin/main` | **Aligned** (same SHA; no CI claim) |
| Last Git closure | **DOC-TRACK-2** CLOSED/PUSHED @ `b3ac033` (docs only) |
| Last engineering closure | **CONN-1d-C** CLOSED/PUSHED @ `5c1c76b` (PARTIAL offline) |
| Prior closures this cycle | DOC-TRACK-1 `0e2fc33` → CONN-1d-A `636725c` → CONN-1d-B `0f3e1d2` → CONN-1d-C `5c1c76b` → DOC-TRACK-2 `b3ac033` |
| Migration inventory | **56** files = **56** manifest entries (latest `20261122140000`); unchanged by DOC-TRACK-2 / CONN-1d-D |
| Staging | **Empty** (CONN-1d-D docs pass does not stage) |
| Dirty tree (preserve) | Modified `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`; deleted tracked `docs/StoreAgent_Roadmap_2026.docx`; untracked `.tmp/`, `.vitest/`, `AGENTS.md`, SQL snippets, DOCX/archives, `supabase/snippets/`, dated handoff draft, etc. **Never** auto stage/clean/reset/stash |

**Current milestone:** **CONN-1d-D** — docs-only security acceptance report `docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md` (13 offline PASS · 2 PARTIAL: V8, V11; **CONN-1 exit UNMET**). **PARTIAL**, written on the working tree, **pending its own Git closure**. **Proposed next gate:** **CONN-1d-E** — read-only V11 hardening preflight (**not authorized**). Parallel PLANNED: **UX-INV-1d** (separate UI slice).

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
| CONN-1a | CLOSED/PUSHED | `3d1f6ad` | Vault schema + security tests | Migration **not hosted-applied** | CONN-1b |
| CONN-1b | CLOSED/PUSHED | `00557c7` | Server-only AES-256-GCM + KEK API | No production KEK wired | CONN-1c-α |
| CONN-1c-α | CLOSED/PUSHED · PARTIAL | `a918217` | CAS/clear/load + trusted-scope repo | Binding **NOT_YET_VERIFIED**; migration not hosted | CONN-1c-β |
| CONN-1c-β | CLOSED/PUSHED · PARTIAL | `173a357` | Refresh-lease RPCs; V5 two-session races | Binding **NOT_YET_VERIFIED**; hosted apply **BLOCKED** | CONN-1d-A |
| CONN-1d-A | CLOSED/PUSHED · PARTIAL | `636725c` | Secret-ingestion guards + redaction | V12 offline **PASS**; V11 **PARTIAL** (DB-level bypass, unsupported object types, stringified/encoded payloads) | CONN-1d-B |
| CONN-1d-B | CLOSED/PUSHED · PARTIAL | `0f3e1d2` | V8 membership/role isolation (disposable) | V8 offline SQL role + claim-stub **PASS**; hosted JWT/PostgREST **NOT VERIFIED** | CONN-1d-C |
| CONN-1d-C | CLOSED/PUSHED · PARTIAL | `5c1c76b` / `20261122140000` | α terminal fence; lease-aware disconnect/revoke; Phase A ownership release; two-session races; β fixture compatibility | Binding **NOT_YET_VERIFIED**; migration **not hosted-applied** | CONN-1d-D |
| DOC-TRACK-2 | CLOSED/PUSHED (docs) | `b3ac033` | CONN-1d-A/B/C reconciliation | — | CONN-1d-D |
| CONN-1d-D | PARTIAL (docs only) · pending Git closure | `docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md` (uncommitted) | V1–V15 re-matrix: 13 offline PASS · V8/V11 PARTIAL; dated 2026-11-22 evidence reused, no fresh execution | **CONN-1 exit UNMET** (vault contract §11; V11 PARTIAL); owner review + Git closure | CONN-1d-E preflight |
| CONN-1d-E | PROPOSED (not authorized) | — | — | Read-only V11 hardening preflight; separate owner authorization | Then binding / KEK / hosted gates |
| CONN-2…6 | PLANNED / BLOCKED | CONN-0 sequence | — | OAuth, webhooks, live cert, SyncRun, health UX; V10 end-to-end bind/reclaim (with D13) | After CONN-1 exit + binding |
| CONN-MP-0 | CLOSED/PUSHED (docs) | `1e18029` | Multi-provider architecture freeze | D13/D14 **DEFERRED**; impl gated | CONN-MP-1 / CRED |
| Woo / Amazon / Noon | PLANNED | CONN-MP-0 | Design only | Amazon/Noon enum **CONTRACT_CHANGE**; partner approvals | After Shopify-first path |
| UX-INV-1a–1c.1 | CLOSED/PUSHED | `10d9de6`…`0402564` | Attention Overview + inspector + replenishment copy | Browser automation cert **BLOCKED** | UX-INV-1d |
| UX-INV-1d | PLANNED | Delivery doc §5 | — | Owner UI slice approval | Engines unchanged |
| AI-INV-1 / 1.1 | CLOSED/PUSHED | `38f63d6` | Grounded explainer + guidance | Soft-enable **OFF**; not live-certified | AI-INV-2… |
| AI-INV-2…6 | PLANNED | AI roadmap | — | Per-slice auth | Deps per slice |
| AI-MKT-0→4 | PLANNED | AI roadmap | Sequence frozen | Rights → research → credits → detective → opportunity → experiments | Licensed evidence only |
| Supplier Intelligence V1 | PLANNED AFTER CORE | AI-INV-5 | — | No auto-contact/buy | Trusted quotes |
| Hosted 38→52 | CLOSED (schema) | 52/52 ledger | S1–S14 + fingerprint MATCH | ≠ ops unlock | Workers/JWT still blocked |
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

### 4.6 CONN-0 / 1a / 1b / 1c-α / 1c-β / 1d-A–D

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
| CONN-1d-D | PARTIAL (docs only) · pending Git closure | `docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md` | V1–V15 re-matrix: V1–V7, V9, V10 (schema level), V12–V15 offline PASS; V8 PARTIAL (offline PASS, hosted JWT NOT VERIFIED); V11 PARTIAL. **CONN-1 exit UNMET**; contract §11 unchanged |
| CONN-1d-E | PROPOSED (not authorized) | — | Read-only V11 hardening preflight (DB-level ban, non-plain objects, stringified/encoded payloads, provider-neutral token shapes) |

Reports: `docs/SHOPIFY_CONN_1{A,B}_*_IMPLEMENTATION_REPORT.md`, `docs/SHOPIFY_CONN_1C_{ALPHA,BETA}_IMPLEMENTATION_REPORT.md`, `docs/SHOPIFY_CONN_1D_B_V8_IMPLEMENTATION_REPORT.md`, `docs/SHOPIFY_CONN_1D_C_DISCONNECT_REVOKE_IMPLEMENTATION_REPORT.md`, and the cross-slice **`docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md`** (V1–V15 re-matrix). CONN-1d-A has no standalone implementation report; evidence is commit `636725c` (`lib/security/secret-ingestion.ts`, `tests/unit/shopify-conn-1d-a-secret-ingestion-boundaries.test.ts`), and its residual V11/V12 limitations are recorded in §§3–4 of the acceptance report.

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

### 4.10 AI-MKT-0 / 1 / 1.1 / 2 / 3 / 4 (Market Brain)

**Sequence preserved:** AI-MKT-0 → 1 → 1.1 → 2 → 3 → 4. All **PLANNED**. External research requires authorized/licensed evidence. OpenAI/Gemini grounding are **future reasoning adapters**, not retail transaction databases. Credits, billing, and live market research remain **unimplemented**.

### 4.11 Supplier Intelligence and future merchant UX

Supplier Intelligence V1 **PLANNED AFTER CORE** — compare merchant-provided quotes / draft RFQs; no auto-contact, purchase, payment, or supplier marketplace search. Marketing/landing premium Problem vs Solution and decision-first workspace = **PLANNED DESIGN** slices, separate from CONN SQL work.

### 4.12 Hosted / JWT / security / launch readiness

| Gate | State |
|---|---|
| Hosted schema 38→52 | CLOSED 52/52 ≠ ops unlock |
| CONN vault migrations hosted apply | **NOT authorized / not applied** (`20261121120000`, `20261122120000`, `20261122130000`, `20261122140000`) |
| CONN-1 exit (vault contract §11) | **UNMET** — V11 PARTIAL; not CLOSED, not CERTIFIED |
| V8 hosted JWT/PostgREST | **NOT VERIFIED** (offline SQL role + claim-stub PASS only) |
| V10 end-to-end bind / cross-org reclaim | **DEFERRED** to CONN-2 / D13 (schema-level uniqueness offline PASS only) |
| V11 secret-ingestion | **PARTIAL** (DB-level bypass, unsupported object types, stringified/encoded payload gaps) |
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

1. Review **CONN-1d-D** docs (`docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md` + this handoff + living ledger) and authorize its separate three-path docs Git closure. (DOC-TRACK-1 closed @ `0e2fc33`; CONN-1d-A/B/C closed @ `636725c` / `0f3e1d2` / `5c1c76b`; DOC-TRACK-2 closed @ `b3ac033`.)
2. Authorize **CONN-1d-E** read-only V11 hardening preflight — **proposed, not authorized**.
3. Authorize production `IntegrationOwnershipLookup` wiring and re-verify binding end-to-end.
4. Resolve **D13** revoke/retention and **D14** KEK custody (deferred).
5. Authorize hosted apply of CONN-1a/α/β/1d-C migrations (separate from Git close).
6. Decide whether V11 must reach PASS (CONN-1 exit per vault contract §11) before hosted apply.
7. Authorize hosted JWT/PostgREST verification of V8 (with PE1.b.6b or separately).
8. Authorize **UX-INV-1d** implementation slice (presentation only).
9. Non-destructive DOCX Section 36+ sync (**PENDING**).
10. Keep PE1.b.6b / workers / M6 prod / M7 create / OAuth / SyncRun / live model / AI-MKT spend / launch **BLOCKED** (recommended YES).

### Hard STOP gates (do not unlock from docs alone)

- Hosted vault migrations; production binding; production KEK
- Shopify OAuth, live nested cert, SyncRun, webhooks, workers, cron
- Hosted JWT J-matrix; M6 production publish; M7 create/purchasing
- Paid AI market research / credits / billing
- Amazon/Noon partner paths and provider-enum expansion without contract change
- Drain E.4 canary grain; promote synthetic snapstore data to production seeds

---

## 7. Next 3 milestones (dependency order)

1. **CONN-1d-D Git closure** (docs only; three paths) after owner review, then **CONN-1d-E** — read-only V11 hardening preflight (proposed; requires explicit owner authorization; any implementation is a further separate gate). No production claims; binding stays `NOT_YET_VERIFIED`.
2. **Production binding + KEK / hosted vault apply** (may split into sub-gates; includes the V11 / CONN-1 exit decision and hosted V8 JWT verification) — required before any runtime credential ops; then **CONN-2 OAuth** (still separately gated; carries V10 end-to-end bind/reclaim with D13).
3. **UX-INV-1d** — merchant-first task→action→result simplification + premium responsive polish (**parallelizable** with connector docs/security work; engines/authorization unchanged).

**After those (separately gated):** live nested cert → SyncRun → AI-INV-2… / AI-MKT-0… → M6 production (post-JWT) → M7 inbox → Woo/Amazon/Noon.

---

## 8. Fresh Cursor / ChatGPT session bootstrap

```text
Continue StoreAgent.si as engineering reviewer/planner, not an autonomous production operator.
1) Verify: git branch=main, HEAD=b3ac033 (or newer after verified closure), origin aligned, staging empty; preserve unrelated dirty files.
2) Read first: docs/STOREAGENT_MASTER_MILESTONE_HANDOFF.md (this file), docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md, then the frozen contract for the authorized slice.
3) Frozen truth: CONN-1d-A @ 636725c (V12 offline PASS; V11 PARTIAL), CONN-1d-B @ 0f3e1d2 (V8 offline SQL/claim-stub PASS; hosted JWT NOT VERIFIED), CONN-1d-C @ 5c1c76b (terminal fence + lease-aware disconnect/revoke; PARTIAL offline) all CLOSED/PUSHED; DOC-TRACK-2 CLOSED/PUSHED @ b3ac033; CONN-1d-D docs PARTIAL (13 offline PASS, V8/V11 PARTIAL; CONN-1 exit UNMET); 56 migrations; binding NOT_YET_VERIFIED; hosted CONN migrations NOT applied; CONN-MP-0 CLOSED/PUSHED @ 1e18029 (D13/D14 deferred); AI-INV-1/1.1 CLOSED/PUSHED @ 38f63d6 soft-enable OFF; AI-INV-2–6 and AI-MKT-0–4 PLANNED; UX-INV-1d PLANNED.
4) Next: CONN-1d-D Git closure, then CONN-1d-E read-only V11 preflight — each only after explicit owner authorization; do not begin from this bootstrap alone.
5) Bans: no OAuth/SyncRun/workers/JWT/M6-prod/M7-create/purchasing/live AI research/hosted vault apply; no fake ROI or autonomous buying claims; no drive-by Git on protected dirty files.
6) After each accepted closure: update this handoff + append living-ledger reconciliation; stage only an approved manifest.
```

---

## 9. Milestone closure / update protocol (short)

1. Confirm branch, HEAD, origin, dirty tree, and **approved change manifest**.
2. Close only with evidence: tests, report, commit SHA, status class (CLOSED/PUSHED vs PARTIAL vs LOCAL-ONLY).
3. Append §11 log here; refresh §§2–4/7; append living ledger + update pointer docs’ *current* pins only.
4. Stage **only** approved paths; `git diff --cached --check`; trailing-whitespace scan.
5. Commit/push only after owner review. Record remote SHA after independent verify.
6. Never treat this handoff as authorization for hosted DB, OAuth, workers, or purchasing.

---

## 10. Authority index (links — avoid duplicating contracts)

| Doc | Role |
|---|---|
| `docs/IMPLEMENTATION_STATUS.md` | Short pointer |
| `docs/StoreAgent_IMPLEMENTATION_STATUS_Updated_2026-11-10.md` | Living ledger |
| `docs/PROJECT_HANDOFF.md` | Session bootstrap (longer) |
| `docs/StoreAgent_Master_Roadmap_November_2026_Execution_Plan.md` | November execution sequence |
| `docs/AI_INTELLIGENCE_MERCHANT_VALUE_ROADMAP.md` | AI-INV + AI-MKT |
| `docs/MERCHANT_UX_OVERVIEW_INVENTORY_DELIVERY.md` | UX-INV-1 delivery |
| `docs/COMPETITIVE_UX_MERCHANT_PAIN_POINT_ROADMAP.md` | Competitive themes (historical pins possible) |
| `docs/PROVIDER_ADAPTERS.md` / `docs/SHOPIFY_RO2_TRANSPORT.md` | Adapter + Shopify RO law |
| `docs/SHOPIFY_CONN_0_SECURITY_ARCHITECTURE.md` | CONN-0A |
| `docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md` | Vault contract |
| `docs/SHOPIFY_CONN_1{A,B}_*_IMPLEMENTATION_REPORT.md` | 1a/1b evidence |
| `docs/SHOPIFY_CONN_1C_{ALPHA,BETA}_IMPLEMENTATION_REPORT.md` | 1c-α/β evidence |
| `docs/SHOPIFY_CONN_1D_B_V8_IMPLEMENTATION_REPORT.md` | 1d-B V8 evidence |
| `docs/SHOPIFY_CONN_1D_C_DISCONNECT_REVOKE_IMPLEMENTATION_REPORT.md` | 1d-C disconnect/revoke evidence |
| `docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md` | CONN-1d-D V1–V15 re-matrix; CONN-1 exit status |
| `docs/CONN_MP_0_MULTI_PROVIDER_ARCHITECTURE_PROPOSAL.md` | Multi-provider freeze |
| `docs/M5_6_HANDOFF.md` / `docs/M6_PE1_B6B_SESSION_HANDOVER.md` | Workers / JWT continuity |
| `docs/HOSTED_38to52_MIGRATION_RUNBOOK.md` | Hosted schema closeout |
| Master roadmap DOCX | Historical product plan — Section 36+ sync **PENDING** |

---

## 11. New information log (append-only)

- **2026-11-22 (pre-β draft, untracked):** Dated file `STOREAGENT_MASTER_MILESTONE_HANDOFF_2026-11-22.md` recorded HEAD `1e18029` (CONN-MP-0) and “CONN-1c-β not begun” — **superseded for current pins** by this canonical file after β Git close.
- **2026-11-22 (DOC-TRACK-1):** Verified `main` @ `173a357` ≡ `origin/main`. **CONN-1c-beta CLOSED/PUSHED** (PARTIAL offline; V5 genuine two-session disposable PG PASS). Prior CLOSED/PUSHED preserved: CONN-MP-0 `1e18029`, CONN-1c-α `a918217`, CONN-1b `00557c7`, CONN-1a `3d1f6ad`, CONN-0A `965e6d7`, AI-INV-1/1.1 `38f63d6`, RO.3 `4f6ef0c`, UX through `0402564`. Binding **NOT_YET_VERIFIED**. Hosted CONN migrations **not applied**. UX-INV-1d recorded **PLANNED** (merchant-first simplification + premium polish). Next eng: **CONN-1d** (not started). DOC-TRACK-1 = docs-only; STOP for owner review.
- **2026-11-22 (DOC-TRACK-2):** Verified `main` @ `5c1c76b` ≡ `origin/main`; staging empty. DOC-TRACK-1 closed @ `0e2fc33`. **CONN-1d-A CLOSED/PUSHED** @ `636725c` — V12 offline PASS; V11 PARTIAL (DB-level bypass, unsupported object types, stringified/encoded payload gaps). **CONN-1d-B CLOSED/PUSHED** @ `0f3e1d2` — V8 offline SQL role + claim-stub PASS; hosted JWT/PostgREST NOT VERIFIED. **CONN-1d-C CLOSED/PUSHED** @ `5c1c76b` — α terminal create/CAS fence, lease-aware disconnect/revoke (`lease_held` = pending cleanup, never "credentials destroyed"), Phase A ownership release only on `completed`, two-session races PASS, β fixture compatible with α+β and α+β+1d-C, rollback keeps the fence; offline PARTIAL. Migration inventory **56**. Binding **NOT_YET_VERIFIED**; D13/D14 **DEFERRED**; hosted CONN vault migrations (incl. `20261122140000`) **not applied**. **CONN-1d-D PLANNED**, not started. UX-INV-1d, AI-INV-2–6, AI-MKT-0–4 and multi-provider roadmap unchanged. DOC-TRACK-2 = docs-only; STOP for owner review.
- **2026-11-23 (CONN-1d-D):** Verified `main` @ `b3ac033` ≡ `origin/main`; staging empty. **DOC-TRACK-2 CLOSED/PUSHED** @ `b3ac033`. CONN-1d-A/B/C closure SHAs unchanged (`636725c` / `0f3e1d2` / `5c1c76b`). New `docs/SHOPIFY_CONN_1D_SECURITY_ACCEPTANCE_REPORT.md`: V1–V15 re-matrix from dated 2026-11-22 offline evidence (no fresh execution) — **13 offline PASS** (V1–V7, V9, V10 schema level, V12, V13, V14, V15) and **2 PARTIAL**: V8 (offline SQL role + claim-stub PASS; hosted JWT NOT VERIFIED) and V11 (application-layer guards only). V12 offline PASS with recorded limitations (not universal redaction). V10 end-to-end bind/reclaim deferred to CONN-2 / D13. Vault contract §11 **unchanged**; **CONN-1 exit UNMET** (V11 PARTIAL); CONN-1 not CLOSED or CERTIFIED. Binding **NOT_YET_VERIFIED**; D13/D14 **DEFERRED**; four CONN vault migrations **not hosted-applied**; OAuth, Shopify HTTP, SyncRun, workers **BLOCKED**. §6 owner-decision numbering corrected (duplicate "8." → 1–10). **CONN-1d-D = docs-only PARTIAL, pending its own Git closure.** Proposed next: **CONN-1d-E** read-only V11 hardening preflight (not authorized). UX-INV-1d, AI-INV-2–6, AI-MKT-0–4 unchanged. STOP for owner review.
