# M6-PE1.b.6b — Owner Authorization Worksheet

**Mode:** OFFLINE DOCS ONLY — A3 **OWNER-APPROVED (YES)** recorded from owner dashboard exclusivity + signed phrase. No agent hosted/local DB requests, logins, SQL, tokens, migrations, backups/restores, subscription/project changes, account/provisioning, JWT minting, production activation, commit/push. No J1–J13 this session.
**As-of:** 2026-11-06 (A3 OWNER-APPROVED; A1/A4/A6 still NOT APPROVED; JWT UNPROVEN)
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Baseline:** `main` @ `b99799e` — **Verified HEAD:** `b99799ecd69cc67ea00a3aec190ff89696909768` (this session reconfirm: match)
**Dirty tree:** Unrelated dirty/untracked preserved. This file updated in place only; other dirty files untouched.
**Normative parents:**
- `docs/M6_PE1_B6A_HOSTED_JWT_ISOLATION_PREFLIGHT.md` (§A–§E) — approval IDs / matrix / stop rules authoritative
- `docs/M6_PE1_B6B_HOSTED_JWT_RUNTIME_EVIDENCE.md` (Phase 2 not executed; JWT still UNPROVEN)
- `docs/M6_PE1_B6B_SESSION_HANDOVER.md` — Cursor + **ChatGPT** continuity prompts; commit with this worksheet
- `docs/PROJECT_HANDOFF.md` — product bootstrap (points here for PE1.b.6b)
- HV1 / HV2 closeouts (schema + pin + RLS catalog; JWT runtime UNPROVEN)

**Rule:** Owner **context / clarification** ≠ formal gate **YES** except where an owner explicitly signs a named gate below. Silence or unsigned A1/A3/A4/A6 = **NOT APPROVED**. A2 YES ≠ A1/A3/A4/A6 YES and ≠ PE1.b.6b execution. Do **not** invent tenant IDs, JWTs, proof, or test results. Completing this preflight ≠ PE1.c / D1–D7 / allowlist activation.

**Legend:**
| Label | Meaning |
|---|---|
| **OWNER-DECLARED** | Stated by owner; claim only |
| **OWNER-PROVIDED (screenshot)** | Owner manual dashboard/screenshot evidence; abbreviated IDs only; not agent-verified |
| **OWNER-APPROVED** | Named gate explicitly signed YES by owner in this worksheet |
| **CANDIDATE** | Earlier screenshot mapping; superseded as **PROPOSED** for A3 when so labeled |
| **PROPOSED (A3)** | Owner-designated for A3 before signature; superseded when A3 is **OWNER-APPROVED** |
| **OWNER-APPROVED (A3)** | A3 exclusivity + exact phrase signed YES by StoreAgent owner |
| **PRIOR CLOSEOUT** | From HV1/HV2 (or related) docs; not re-verified this session |
| **INDEPENDENTLY VERIFIED** | Confirmed by approved hosted/console probe in a later session |
| **NOT APPROVED** | Normative gate not satisfied |
| **TECHNICAL** | Engineering readiness judgment (not authorization) |
| **DEFERRED PLAN** | Future intent only; **not** execution authorization |

---

## 0. Purpose

Separate **technical readiness** for a minimal hosted JWT tenant-isolation pack from **formal authorization** (A1–A4/A6). Until **A1, A3, A4, and A6** (plus already-signed A2) are owner-signed **YES**, PE1.b.6b execution remains **NO-GO**.

---

## 0.1 Owner context

| Fact | Value | Class |
|---|---|---|
| Product stage | StoreAgent.si still under development | **OWNER-DECLARED** |
| Source location | Local on Mac | **OWNER-DECLARED** |
| Hosted project ref | `qlsqminsfdntpqdkhxjx` (Supabase **trial**) | **OWNER-DECLARED** (matches HV2 / PE1.b.6a expected pin) |
| Intended use of hosted project | Development & testing | **OWNER-DECLARED** |
| Launch / live merchants | **Not launched**; **no** live merchants | **OWNER-DECLARED** |
| Production traffic | **None** | **OWNER-DECLARED** |
| Supabase branch UI | `main` labeled **PRODUCTION** | **OWNER-PROVIDED** — platform label ≠ operationally live SaaS (see §4.2) |
| PE1.b.6a env class (A2) | **Other** / Development & Testing — PE1.b.6b **planning only** | **OWNER-APPROVED** (§4.2) |

**Explicit non-claims (A2 YES alone):**

- Does **not** set A1 / A4 / A6 = YES (A3 is separately signed in §4.3).
- Does **not** authorize hosted JWT mint, SQL, PostgREST, or J1–J13.
- Does **not** invent missing UUID characters, forecast-row inventory, or JWT results.
- Does **not** prove runtime JWT isolation (remains **UNPROVEN**).
- Does **not** approve D1–D7, PE1.c, workers/cron, subscription upgrade, backups/restores, account changes, secrets handling, or production activation.
- Does **not** execute the future environment strategy (§0.2) — **DEFERRED PLAN** / planning only.

**A3 YES non-claims (this update):** Designates Org A/B + Users A/B for PE1.b.6b JWT RLS probes only. Does **not** approve A1 / A4 / A6, mint JWTs, run J1–J13, prove JWT runtime isolation, authorize PE1.c, or flip launch readiness.

### 0.1.1 Reconciliation with prior E6 stop

| Prior record | Clarified posture | Effect |
|---|---|---|
| E6 HARD STOP (live production traffic) | Not launched; no live merchants / production traffic; trial for Development & Testing | HARD STOP for live traffic **withdrawn**; **A2 signed Other** (§4.2) |
| D1–D6 questionnaire | Replaced by §1 simplified assessment | **Retired** |

### 0.2 Future environment strategy (**DEFERRED PLAN** — non-executable planning only)

| Decision | Status |
|---|---|
| Prefer upgrading the **existing** hosted project `qlsqminsfdntpqdkhxjx` to a **paid production** environment when launch-ready | **DEFERRED PLAN** |
| Preserve **validated backup and recovery** procedures (as a future requirement) | **DEFERRED PLAN** — **not** run or verified here |
| Plan a **separate isolated** development/staging project using **migrations** and **synthetic data** | **DEFERRED PLAN** |
| **Never** copy future real merchant data into development without an **approved sanitization** process | **OWNER-DECLARED** policy intent — **DEFERRED PLAN** |
| Subscription upgrade, backup/restore ops, new project creation, or sanitization workflows now | **NOT AUTHORIZED / NOT EXECUTED** |
| This section authorizes PE1.b.6b JWT pack or any hosted ops | **NO** |

---

## 1. Simplified environment assessment (TECHNICAL)

| Topic | Offline evidence | Assessment |
|---|---|---|
| Pin | HV2 §H.0 **PRIOR CLOSEOUT**: `storeagent` / `qlsqminsfdntpqdkhxjx` / `postgres` / PG 17.11; owner reaffirms same ref | **TECHNICAL OK** to *plan* against this pin; console reconfirm still owed at execution (J13 / E1) |
| Env class | **A2 OWNER-APPROVED:** Other / Development & Testing; Supabase UI PRODUCTION ≠ PE1 Production | **A2 YES**; **A3 YES**; A1/A4/A6 still open |
| Data / traffic posture | Owner: no paying customers, merchant data, or production traffic | **OWNER-DECLARED**; aligns with low blast-radius **LIMITED** JWT pack |
| Forecast tables | HV1 **PRIOR CLOSEOUT**: global counts **0** on all six | Stale-until-reproven; implies **LIMITED** mode unless fresh dual-org rows appear |
| RLS catalog | HV2: six membership + `auth.uid()` SELECT policies; no write policies; RPC EXECUTE service_role only | **TECHNICAL OK** as catalog baseline; JWT **runtime** still **UNPROVEN** |
| Workers / cron / `vercel.json` | PE1.b.6a / HV2: workers off posture; no `vercel.json` at baseline | Must remain off during any future pack |
| Source of truth | App code local; hosted DB is trial pin | Hosted JWT tests prove **DB RLS/EXECUTE**, not local unit tests |

**Technical readiness (environment):** **CONDITIONAL GO** for planning a **LIMITED**, read-only / deny-only JWT pack on `qlsqminsfdntpqdkhxjx` — **subject to formal A1, A4, A6** (A2 + A3 already YES).

**Authorization readiness:** **NO-GO** for execution (A2 + A3 YES; A1/A4/A6 still **NOT APPROVED**).

---

## 2. Existing usable test identity evidence

### 2.1 Repo / prior offline (unchanged limits)

| Evidence | Result |
|---|---|
| PE1.b.4b disposable stack identities | **Local-only** — not hosted pin proof |
| Live-test / fixture UUIDs in source | **Not** hosted evidence; do not copy as A/B |
| Policy shape | HV2 catalog: membership + `auth.uid()` SELECT |

### 2.2 Owner dashboard inspection (this update)

| Fact | Value | Class |
|---|---|---|
| Project inspected | `qlsqminsfdntpqdkhxjx` | **OWNER-PROVIDED (screenshot)** |
| Auth users present | **Two** Auth users exist | **OWNER-PROVIDED (screenshot)** |
| `organization_members` Table Editor | Owner inspected complete displayed view; **exactly two** membership rows | **OWNER-PROVIDED** (dashboard; not agent SQL) |
| New accounts / orgs needed now | **None** | **OWNER-DECLARED** |
| Third organization | Existing **M5 canary fixture** — **EXCLUDE** from PE1.b.6b Org A/B | **OWNER-DECLARED** |
| Runtime JWT isolation | Still **UNPROVEN** | — |

### 2.3 A3 identities (abbreviated — do not invent missing chars)

**Normative A3 requirements (PE1.b.6a §E / §B.1–§B.3):** Distinct Org A ≠ Org B; User A member of **A only**; User B member of **B only**; optional User N with no A/B membership; ≠ production canary allowlist; redacted IDs OK; no JWT mint in designation.

| Label | Abbreviated id (as supplied) | Role / link | Status |
|---|---|---|---|
| **User A** | `37e2d8a3…` | → **Org A** `17e5f502…` as **owner**; A∈A **only** | **OWNER-APPROVED (A3)** |
| **User B** | `0e0024e4…` | → **Org B** `feacd560…` as **owner**; B∈B **only** | **OWNER-APPROVED (A3)** |
| Org A | `17e5f502…` | Distinct from Org B (prefix differs); not M5 canary | **OWNER-APPROVED (A3)** |
| Org B | `feacd560…` | Distinct from Org A; not M5 canary | **OWNER-APPROVED (A3)** |
| M5 canary org | (not designated) | **Excluded** from JWT A/B pair | Out of scope |
| User N | — | Not designated | **SKIP** (optional; PE1.b.6a recommended but not required for A3) |

### 2.3.1 A3 evidence checklist

| # | Required (PE1.b.6a) | Status |
|---|---|---|
| E-A3-1 | Owner **signed** exact A3 approval statement (§4.3) | **RECORDED** — exact phrase unchanged; StoreAgent owner; 2026-11-06 |
| E-A3-2 | Explicit **A∈A only** — User A has **no** membership in Org B (and no other memberships in complete table view) | **YES** — owner Table Editor: User A `37e2d8a3…` → Org A `17e5f502…` only; role `owner`; complete view had exactly two membership rows total |
| E-A3-3 | Explicit **B∈B only** — User B has **no** membership in Org A | **YES** — owner Table Editor: User B `0e0024e4…` → Org B `feacd560…` only; role `owner`; no other memberships present |
| E-A3-4 | Org display name/slug (optional but preferred with redacted id) | **MISSING** — abbreviated ids only (optional; not blocking after E-A3-1…E-A3-3) |
| E-A3-5 | Expand ellipsis to full UUIDs | **NOT REQUIRED** for A3 (redacted OK); **FORBIDDEN** for agent to invent |

**Evidence source:** Owner dashboard verification of `public.organization_members` in Supabase project `qlsqminsfdntpqdkhxjx` (Table Editor) and explicit A3 authorization in ChatGPT on 2026-11-06. **Not** agent-executed SQL. **Not** JWT runtime proof.

**Explicit:** Agent did **not** expand ellipsis UUIDs. No JWTs minted. No provisioning. Positive `role = owner` alone was **not** treated as exclusivity; exclusivity follows from complete two-row membership inventory.

### 2.4 Reuse / designation verdict

| Question | Verdict |
|---|---|
| A3 A/B pairs recorded? | **YES** — §2.3 **OWNER-APPROVED (A3)** |
| Formal A3 approved? | **YES** — **OWNER-APPROVED** (E-A3-1…E-A3-3 satisfied) |
| New Auth users / orgs required? | **NO** (owner) |
| Invent / complete UUID characters? | **FORBIDDEN** |

---

## 3. Minimum JWT / RLS test plan (TECHNICAL — not executed)

### 3.1 Mode prerequisite

| Mode | When | Claim strength |
|---|---|---|
| **LIMITED** (default recommendation) | Forecast counts still 0 or only one org has rows; **no fixture INSERT in 6b** | Privilege / EXECUTE deny + “no foreign rows visible”; **cannot** claim full same-tenant positive proof for both tenants |
| **FULL** | Count-only inventory shows ≥1 forecast row in Org A **and** ≥1 in Org B (fixtures only if separately pre-approved) | Same-tenant positive + cross-tenant negative |

**Test-data prerequisite:** For **LIMITED**: two authenticated users with correct exclusive memberships (and anon key for negatives). Forecast rows **not** required. For **FULL**: additionally dual-org forecast rows already present — **do not create in PE1.b.6b**.

### 3.2 Minimum required cases (subset of PE1.b.6a §C.4)

| ID | Why minimum | Expected |
|---|---|---|
| **J13** | Bind pack to pin | Identity matches worksheet |
| **J6** | Unauthenticated boundary | Anon: empty / denied; no org rows |
| **J7** | Write deny | Authenticated INSERT/UPDATE/DELETE denied |
| **J8** | RPC EXECUTE deny (auth) | Five forecast RPCs denied |
| **J9** | RPC EXECUTE deny (anon) | Same denied |
| **J10** | Fail-closed malformed Bearer | 401/denied; no rows |
| **J11** | Fail-closed expired/foreign JWT | 401/denied; no rows |
| **J2** (+ **J3** as capacity allows) | Cross-tenant / unfiltered leak check | User A sees **0** for Org B; unfiltered = A-visible only |
| **J1** / **J4** | Membership path (LIMITED: may be empty counts) | Document empty-with-membership; FULL needs ≥1 |
| **J5** | Optional strengthen | User N → 0 |
| **J12** | Optional (A5) | service_role contrast — **not** JWT PASS |

**Out of scope:** successful RPC bodies; fixture INSERT; HV1/HV2 full re-audit; workers/cron; PE1.c; D1–D7; PB1/M7/CHECK flips.

### 3.3 Recommended one minimal controlled execution plan

**Only after A1–A4 + A6 are signed YES** (separate session):

1. Console-confirm pin ref `qlsqminsfdntpqdkhxjx` (E1) + record env class **Other** (Development trial).
2. Formally designate §2.3 **CANDIDATES** as Org A/B + Users A/B under **A3** (exclude M5 canary); optional N = SKIP unless added.
3. Declare **LIMITED** unless fresh count-only inventory proves FULL.
4. Mint user JWTs via owner Auth on this pin only — **never** paste tokens into git.
5. Run **J13 → J6 → J10 → J11 → J7 → J8 → J9 → J2/J3 → J1/J4** (J5/J12 optional).
6. Count-only; zero-write check on six forecast tables before/after; stop on any leak or unexpected RPC/DML success.
7. Record redacted PASS/FAIL/SKIP in A6 retention location.

---

## 4. Formal authorization (A1–A4 / A6) — A2 + A3 done; A1/A4/A6 still required

### 4.1 Separation

| Layer | Status |
|---|---|
| **Technical readiness** (§1–§3) | **CONDITIONAL GO** to *plan* LIMITED pack |
| **Formal authorization** | **NO-GO** for execution until A1 + A4 + A6 also YES (A2 + A3 done) |

### 4.2 Gate A2 — Env class

| | |
|---|---|
| **Normative (PE1.b.6a §E)** | Label Preview \| Production \| **Other**. ≠ D5 / Env-A/B/C canary approval. Free-text reason required for Other. |
| **Owner approval statement** | APPROVE A2 for project `qlsqminsfdntpqdkhxjx` as **Other / Development & Testing**, for **PE1.b.6b planning only**. |
| **Approved classification phrase** | “I classify hosted project ref `qlsqminsfdntpqdkhxjx` as env class **Other** for PE1.b.6b planning only. This is not D5 canary UUID / Env-A/B/C production approval.” |
| **Classification rationale (Other reason)** | StoreAgent.si has **not launched**, has **no live merchants** or **production traffic**. Supabase `main` is labeled **PRODUCTION**; this **platform label is acknowledged** and does **not** mean the SaaS is **operationally live**. PE1 env class **Other** ≠ Supabase PRODUCTION branch label and ≠ D5 / Env-A/B/C. |
| **Future environment strategy** | See §0.2 — **non-executable planning only** (prefer paid upgrade of existing project when launch-ready; preserve validated backup/recovery; separate isolated dev/staging via migrations + synthetic data; never copy future real merchant data into development without approved sanitization). |
| **Status** | **OWNER-APPROVED (YES)** — 2026-11-06 |

| Field | Value |
|---|---|
| Env class | **Other** |
| Subtype / purpose | Development & Testing |
| Scope | PE1.b.6b **planning only** |
| A2 signed YES / NO | **YES** |
| Signature + date | Owner decision recorded 2026-11-06 (this worksheet update) |

**A2 non-effects:** Does **not** approve A1/A4/A6 or JWT pack execution by itself; A3 is separately recorded in §4.3. Does **not** authorize migrations, backup/restore operations, account changes, secrets handling, subscription/production activation, or new project creation.

### 4.3 Gate A3 — Org A / Org B (/ User N)

| | |
|---|---|
| **Normative (PE1.b.6a §E)** | Designate Org A / Org B (/ User N) for probes; ≠ production canary allowlist. |
| **Exact owner approval statement** (copy unchanged to sign) | See box below — **signed unchanged**. |
| **Evidence on hand** | §2.3 abbreviated pairs; owner Table Editor exclusivity on `organization_members`; M5 canary **excluded**. |
| **Missing for YES** | None for A3 (E-A3-1…E-A3-3 satisfied). E-A3-4 org name/slug still optional/missing. |
| **Status** | **OWNER-APPROVED (YES)** — 2026-11-06 |

**Exact A3 owner approval statement (signed unchanged):**

> I designate Org A and Org B (distinct) and Users A/B for PE1.b.6b JWT RLS probes only. Memberships: A∈A only, B∈B only. Optional User N has no A/B membership. This is not a production canary allowlist and does not mint PE1 UUIDs for eligibility.

| Field | Value |
|---|---|
| Org A (abbreviated id) | **DESIGNATED** `17e5f502…` |
| Org B (abbreviated id) | **DESIGNATED** `feacd560…` |
| User A → Org A (owner) | **DESIGNATED** `37e2d8a3…` |
| User A member of A **only**? | **YES** — owner Table Editor; complete view; exactly two membership rows project-wide; A→A only |
| User B → Org B (owner) | **DESIGNATED** `0e0024e4…` |
| User B member of B **only**? | **YES** — owner Table Editor; B→B only; no other memberships |
| User N (optional) | **SKIP** |
| Exclude M5 canary from A/B? | **YES** (owner) |
| Exact phrase above copied without alteration? | **YES** |
| A3 signed YES / NO | **YES** |
| Signature + date | StoreAgent owner; 2026-11-06 (ChatGPT authorization + dashboard verification; recorded in this worksheet) |

**A3 non-effects:** Does **not** approve A1 / A4 / A6, authorize JWT mint or J1–J13, prove JWT runtime isolation, approve PE1.c, or change launch NO-GO.

### 4.4 Gate A4 — FULL vs LIMITED

| | |
|---|---|
| **Recommendation** | **LIMITED** (HV1 historical zero rows; no fixture INSERT in 6b) |
| **Status** | **NOT APPROVED** |

| Field | Value |
|---|---|
| Mode | FULL / LIMITED: ________ |
| Inventory summary (counts only) | ________ |
| A4 signed YES / NO | ________ |

### 4.5 Gate A6 — Evidence retention

| | |
|---|---|
| **Status** | **NOT APPROVED** |

| Field | Value |
|---|---|
| Retention location (path/ticket) | ________ |
| A6 signed YES / NO | ________ |

### 4.6 Gate A1 — Execute pack (last)

| | |
|---|---|
| **Phrase skeleton** | “I approve PE1.b.6b read-only hosted JWT isolation probes on project ref `qlsqminsfdntpqdkhxjx`, env class `Other`, mode `<FULL\|LIMITED>`, using designated test users only. No forecast RPC success path, no workers, no PE1.c.” |
| **Status** | **NOT APPROVED** — requires A2 (done) + A3 (done) + A4 + A6 already YES |

| Field | Value |
|---|---|
| A1 signed YES / NO | ________ (**NOT APPROVED**) |
| Operator + timestamp | ________ |

### 4.7 Optional A5 — J12

| Status | **N/A** unless owner opts in: ________ |

---

## 5. Sign-off rollup

| Gate | Status | Note |
|---|---|---|
| Technical env readiness | **CONDITIONAL GO** | Plan LIMITED pack |
| A3 identities (§2.3) | **OWNER-APPROVED** | Abbreviated; exclusivity + phrase recorded |
| A2 Env class | **OWNER-APPROVED (YES)** | Other / Development & Testing; planning only |
| A3 Org/users | **OWNER-APPROVED (YES)** | E-A3-1…E-A3-3 satisfied 2026-11-06 |
| A4 Mode | **NOT APPROVED** | LIMITED recommended |
| A6 Retention | **NOT APPROVED** | |
| A1 Execute | **NOT APPROVED** | Last; after A4 + A6 |
| A5 J12 | **N/A** (optional) | |
| Phase 2 J1–J13 | **NOT EXECUTED** | JWT runtime **UNPROVEN** |
| PE1.c / paying launch | **NO-GO** | Unchanged |
| Future env strategy (§0.2) | **DEFERRED PLAN** | Non-executable planning only |

### 5.1 Next single owner action

Declare **A4** mode (**LIMITED** recommended; no fixture INSERT in PE1.b.6b), then **A6** retention location, then **A1** execute phrase — still **no** JWT mint / SQL / J-matrix until all remaining gates are YES.

---

## 6. GO / NO-GO

| Action | Decision |
|---|---|
| Reconfirm HEAD `b99799e`; preserve dirty tree; update this worksheet only | **GO** |
| Record A3 exclusivity + signed exact phrase | **GO** (done) |
| Mark A3 APPROVED without exclusivity YES + signed phrase | **NO-GO** (historical; now satisfied) |
| Invent UUID characters | **NO-GO** |
| Alter A1 / A4 / A6 status | **NO-GO** (remain **NOT APPROVED**) |
| Execute PE1.b.6b / mint JWTs / run SQL this session | **NO-GO** |
| Begin A4 / J1–J13 in this documentation slice | **NO-GO** |
| After A1 + A4 + A6 also signed YES | **GO to execute** minimal §3.3 plan (separate session) |

**Overall:** **A3 OWNER-APPROVED (YES)**. **A1 / A4 / A6 NOT APPROVED**. **AUTHORIZATION NO-GO** for PE1.b.6b execution. A2 remains YES. JWT runtime **UNPROVEN**. PE1.c / launch **NO-GO**.

---

**STOP.** A3 authorization recorded. No hosted ops. No invented UUID characters. No commit/push. Do not begin A4 or execute J1–J13.
