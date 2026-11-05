# M6-PE1.b.6a — Hosted JWT Isolation Preflight

**Mode:** DOCUMENTATION ONLY — executable plan preparation. No hosted/local DB calls, HTTP requests, SQL execution, token minting, source/migration/test/config changes, production policy approvals, workers/cron, PB1/M7, AI, or purchasing activation.
**As-of:** 2026-11-06
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Baseline requested:** `main` @ `15198ac`
**Verified HEAD:** `15198ac2b1447cb983f2b1fca47e8e85b9f0f399` — `docs(forecast): audit PE1.b.5 hosted canary readiness gaps`
**Branch:** `main` (HEAD == baseline)
**Dirty tree:** Unrelated dirty/untracked preserved untouched. **Only this file** added for PE1.b.6a.
**Parents / authority:**
- `docs/M6_PE1_B5_HOSTED_CANARY_READINESS_GAP_AUDIT.md` §E.2 (PE1.b.6 JWT + pin env class)
- `docs/M6_HV1_HOSTED_FORECAST_VERIFICATION.md` / `docs/M6_HV2_HOSTED_IDENTITY_AUTHORIZATION.md` (pin + catalog; JWT **UNPROVEN**)
- `docs/M6_PE1_B3_PRODUCTION_POLICY_DECISION_PACKET.md` (D5 env class; all D1–D7 **UNAPPROVED**)
- Forecast RLS: `organization_members` + `auth.uid()` SELECT policies on six tables (`20261030140000` / `150000` / `200000`)
- Forecast RPC EXECUTE: `service_role` only (HV1/HV2 metadata PASS)
- `docs/SERVICE_ROLE_BOUNDARY.md` (RLS bypass; dirty local edits **not** evidence)

**Authority when docs conflict:** this document for **PE1.b.6b hosted JWT runtime isolation plan, pin-env prerequisites, identity requirements, authorized test matrix, safety/stop controls, owner approvals, and GO/NO-GO to plan PE1.b.6b only**. It does **not** authorize PE1.b.6b execution, invent env class, mint UUIDs/tokens, approve D1–D7, or re-run HV1/HV2/PE1.b.4b packs.

**Rule honored:** Catalog PASS ≠ JWT runtime PASS. Explicit **owner approval** is required before **any** hosted request — including read-only.

---

## 0. Executive verdict

| Question | Verdict |
|---|---|
| Baseline `15198ac` verified; dirty tree preserved | **PASS** |
| Executable PE1.b.6b plan prepared (docs) | **PASS** (this document) |
| Pin Preview\|Production\|Other labeled | **REQUIRED before PE1.b.6b** — currently unlabeled |
| PE1.b.6b execution authorized by this doc | **NO-GO** |
| HV1/HV2 / PE1.b.4b re-run required | **NO** — cite prior closeouts; do not repeat |
| Production policy / PE1.c / mutate lifecycle | **NO-GO** |
| **GO/NO-GO for PE1.b.6b planning readiness** | **CONDITIONAL GO** — plan ready; execute only after §E approvals + §D stop gates clear |

**One-line:** PE1.b.6a freezes the smallest safe hosted JWT cross-tenant proof plan (authenticated RLS + RPC EXECUTE deny + pin env label) without executing anything; PE1.b.6b remains blocked on explicit owner approval and fixture/inventory gates.

---

## A. Verified baseline and environment prerequisites

### A.1 Git / tree — VERIFIED

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `15198ac` (matches baseline) |
| Prior closeout | PE1.b.5 gap audit committed at HEAD |
| Dirty (preserved) | `README.md`, `docs/BACKGROUND_JOBS.md`, `docs/SERVICE_ROLE_BOUNDARY.md`, roadmap archives, M5 docs, `.vitest/`, `supabase/snippets/`, etc. |
| This slice | `docs/M6_PE1_B6A_HOSTED_JWT_ISOLATION_PREFLIGHT.md` only |
| `vercel.json` | Absent at HEAD |

### A.2 Hosted project pin (must match HV2; do not invent)

| Field | Pre-declared / known | PE1.b.6b duty |
|---|---|---|
| Project name | `storeagent` (HV2 §H.0) | Reconfirm console |
| Supabase project ref | `qlsqminsfdntpqdkhxjx` | Must match console URL/ref **before** any request |
| `current_database()` | `postgres` | Reconfirm via owner HV2-0-style identity SELECT **only after** §E approval |
| Postgres | **17.11** (HV2) | Note drift if changed |
| Intended env class | **UNLABELED** | Owner must classify **Preview \| Production \| Other** before PE1.b.6b |

**Pin classification prerequisites (normative):**

1. Owner opens the **intended** Supabase console project and copies project ref into §A.3 worksheet **before** any API/SQL.
2. Owner records env class as exactly one of: `Preview` | `Production` | `Other` (with free-text reason if Other).
3. **Production** class does **not** forbid PE1.b.6b by itself, but raises blast-radius scrutiny: prefer disposable test users; forbid merchant PII dumps; prefer empty-table privilege probes if no safe fixture rows exist.
4. Mismatch vs `qlsqminsfdntpqdkhxjx` → **STOP**. Do not run PE1.b.6b against a different project.
5. Local `.env` / `127.0.0.1` / PE1.b.4b disposable `storeagent-pe1b4b` are **not** hosted pin proof.

### A.3 Owner pin worksheet (fill before PE1.b.6b — empty until owner fills)

| Field | Owner value |
|---|---|
| Intended env class | Preview \| Production \| Other: ________ |
| Console project ref | ________ (expect `qlsqminsfdntpqdkhxjx`) |
| Expected `current_database()` | ________ (expect `postgres`) |
| Console URL host (no secrets) | ________ |
| Operator + timestamp | ________ |
| Explicit approval to run PE1.b.6b read-only pack | YES / NO: ________ |

### A.4 What PE1.b.6b reuses vs must not repeat

| Prior evidence | Reuse | Do **not** re-run |
|---|---|---|
| HV1 migrations/tables/CHECKs/RPC EXECUTE metadata/zero-row posture | Cite HV1 §H | Full HV1-1…HV1-10 pack |
| HV2 pin + RLS catalog + markers + ACLs + `pg_cron` absent | Cite HV2 §H | Full HV2-1…HV2-6 pack |
| PE1.b.4b offline lifecycle | Cite as local-only non-transfer | Any local disposable stack work |
| PE1.b.5 gap classification | Cite P0-1 / P0-2 | Another gap audit |

**Allowed narrow identity reconfirm (after approval):** single HV2-0-equivalent session identity SELECT to bind PE1.b.6b evidence to the same pin — not a full catalog re-audit.

### A.5 Workers / mutate posture (must remain off)

| Control | Required for PE1.b.6b |
|---|---|
| Metric / forecast worker ENABLE | Remain ≠ `1` / unset |
| `vercel.json` crons | Remain absent |
| Forecast persist/publish/eval/snapshot/reader **invocation** | **Forbidden** in PE1.b.6b |
| DDL/DML on forecast / membership / commerce | **Forbidden** (except unavoidable auth session side effects — §D) |
| PB1/M7/CHECK/attestation | Untouched |

---

## B. Test identity and JWT requirements

### B.1 Authorized tenants (Org A / Org B)

PE1.b.6b proves **authenticated membership RLS**, not production canary allowlisting. Do **not** mint production canary UUIDs or activate PE1.b allowlist.

| Identity | Requirement | Ownership evidence (owner records; redacted) |
|---|---|---|
| **Org A** | Existing hosted `organizations.id` used only for JWT isolation | Console/org name slug + UUID last-4 or operator note; prove User A is `organization_members` row |
| **Org B** | Distinct org UUID ≠ Org A | Same; prove User B is member of B only (not A) |
| **Non-member user N** (optional but recommended) | Authenticated user with **no** membership in A or B | Proves empty SELECT without relying on cross-org alone |
| Fixture forecast rows | See §B.4 | Count-only inventory; no `SELECT *` dumps |

**Preferred isolation posture:** disposable / operator-owned test orgs (Env-A spirit). Using real merchant orgs is allowed only with explicit owner acknowledgment of blast radius and redaction rules — still **not** Env-C canary approval.

**This preflight does not select org UUIDs.** Owner fills them in the PE1.b.6b evidence worksheet at execution time.

### B.2 Users, roles, and JWT claims

| Actor | DB role after auth | Required claims / session facts | Forbidden |
|---|---|---|---|
| **User A** | `authenticated` | Valid access JWT for pin project; `auth.uid()` = User A; member of Org A only | service_role key; User B session |
| **User B** | `authenticated` | Valid access JWT; `auth.uid()` = User B; member of Org B only | Membership in Org A |
| **User N** | `authenticated` | Valid access JWT; **no** `organization_members` for A or B | Accidental membership |
| **Anon** | `anon` | Anon/public key only; **no** user JWT | Any user access token |
| **Malformed** | n/a | Broken/truncated/wrong-signature Bearer | Treated as unauthenticated fail-closed |
| **Foreign/expired JWT** | n/a | Token for wrong project ref or expired `exp` | Must not be accepted as User A/B |
| **service_role** (contrast only) | bypasses RLS | Server key — **optional contrast probe** | Must **not** be scored as JWT isolation PASS |

**JWT requirements (normative):**

1. Tokens minted only by owner-approved Auth flows for pin `qlsqminsfdntpqdkhxjx` (dashboard magic link / password / service invite — owner choice).
2. Evidence records: `sub`/`auth.uid()` **redacted** (last-4 OK), `role` claim (`authenticated` vs absent), org membership assertion method, token expiry window — **never** paste full JWTs, refresh tokens, or service_role keys into git docs.
3. Sessions established via PostgREST/`Authorization: Bearer <access_token>` (or Supabase client with user session) — not SQL `SET ROLE` theater that skips Auth JWT validation.
4. Do **not** use `createSupabaseAdminClient()` / service_role for the JWT positive/negative matrix rows.

### B.3 Ownership evidence checklist (before probes)

| # | Evidence | PASS criteria |
|---|---|---|
| O1 | Pin worksheet §A.3 complete + env class labeled | Ref matches HV2 pin |
| O2 | Org A ≠ Org B UUIDs recorded (redacted form OK) | Distinct |
| O3 | User A membership in A only; User B in B only | Owner-verified membership rows (count/exists; no PII dump) |
| O4 | Optional User N has zero membership in A/B | Exists probe |
| O5 | Explicit written approval for PE1.b.6b (§E) | Dated YES |
| O6 | Fixture/inventory gate §B.4 resolved | FULL or LIMITED mode declared |

### B.4 Forecast row inventory gate (hidden dependency)

HV1 closeout reported **zero** rows on all six forecast tables. Zero rows make cross-tenant SELECT negatives **weak** (both users see empty).

| Mode | When allowed | What PE1.b.6b may claim |
|---|---|---|
| **FULL** | Owner inventory shows ≥1 forecast row in Org A **and** ≥1 in Org B on any of the six tables (or owner-approved synthetic fixture already present from prior separate approval — **not** created in 6b) | Full same-tenant positive + cross-tenant negative RLS claims |
| **LIMITED** | Global forecast counts still 0, or only one org has rows | Privilege/EXECUTE/anon/malformed matrix + “no foreign rows visible” where applicable; **cannot** claim full positive membership SELECT proof for both tenants |
| **BLOCKED** | Owner refuses inventory; or only merchant deep-dive would expose PII without redaction plan | **STOP** — do not run PE1.b.6b |

**PE1.b.6b must not INSERT fixture forecast rows.** Creating fixtures requires a **separate** explicit write approval outside this preflight.

**Inventory method (after approval):** count-only `SELECT count(*) … WHERE organization_id = $org` per table (or aggregate), recorded as numbers — **no** `SELECT *`, no commerce dumps, no email lists.

---

## C. Authorized runtime test matrix

### C.1 Trust-boundary distinctions (normative)

| Path | RLS | Tenant isolation mechanism | PE1.b.6b use |
|---|---|---|---|
| **Authenticated JWT** | Enforced | `organization_members` + `auth.uid()` SELECT policies | **Primary** proof surface |
| **Anon** | Enforced (no policies → deny) | No membership; typically no SELECT grant utility | Negative |
| **service_role** | **Bypassed** | App grain + DEFINER RPC bodies only | Optional **contrast** only; never JWT PASS |
| **Forecast DEFINER RPCs** | N/A (DEFINER) | EXECUTE grant + body guards | Prove **authenticated EXECUTE denied**; do **not** invoke bodies successfully |

### C.2 Six forecast tables under test

`forecast_runs`, `sku_forecasts`, `sku_forecast_publications`, `sku_forecast_current`, `forecast_evaluation_runs`, `forecast_evaluation_model_scores`

Policy shape (local/HV2): `FOR SELECT TO authenticated` using membership exists; **no** INSERT/UPDATE/DELETE policies.

### C.3 Five forecast RPCs (EXECUTE deny only — no successful invoke)

`forecast_sku_demand_source_snapshot`, `persist_forecast_sku_demand_result`, `publish_sku_forecast`, `read_fresh_published_sku_forecast`, `persist_forecast_evaluation_result`

**Normative PE1.b.6b RPC rule:** attempt via PostgREST/RPC as authenticated/anon expecting **permission denied / 401 / 403 / equivalent** — or use catalog `has_function_privilege` under the JWT role if owner prefers zero invoke. Prefer invoke-deny that fails **before** body side effects. **Never** call RPCs with service_role in the JWT matrix. **Never** treat a successful RPC body result as in-scope for PE1.b.6b.

### C.4 Case matrix

**Legend:** PASS = observed matches expected. FAIL = isolation/privilege breach or unexpected success. SKIP = allowed only when §B.4 mode says so.

| ID | Actor | Action | Expected | Mode |
|---|---|---|---|---|
| **J1** | User A JWT | `SELECT count(*)` forecast tables filtered to Org A | Count ≥0; if FULL and A has rows → count ≥1 visible | FULL required for strong positive; LIMITED OK if documenting empty |
| **J2** | User A JWT | `SELECT count(*)` same tables filtered to Org B | **0** (no cross-tenant leak) | FULL/LIMITED |
| **J3** | User A JWT | Unfiltered `SELECT count(*)` on each table | Equals Org-A-visible count only (no B rows) | FULL/LIMITED |
| **J4** | User B JWT | Symmetric to J1–J3 with A/B swapped | B sees B only; A count **0** | FULL/LIMITED |
| **J5** | User N JWT | Unfiltered counts on six tables | **0** on all | Recommended |
| **J6** | Anon key | SELECT counts on six tables | **0** / permission error; never Org A/B rows | Required |
| **J7** | User A JWT | Attempt `INSERT`/`UPDATE`/`DELETE` on any forecast table | **Denied** | Required |
| **J8** | User A JWT | Attempt EXECUTE each of five RPCs (or privilege probe) | **Denied** | Required |
| **J9** | Anon | Attempt EXECUTE each of five RPCs | **Denied** | Required |
| **J10** | Malformed Bearer | Any SELECT on forecast table | **401/denied**; no rows | Required |
| **J11** | Expired or foreign-project JWT | Any SELECT | **401/denied**; no rows | Required |
| **J12** | service_role (optional contrast) | `SELECT count(*)` unfiltered | May see **all** orgs (RLS bypass) — record as **contrast**, not JWT PASS | Optional; redact counts if sensitive |
| **J13** | Pin identity | HV2-0-style identity SELECT | Matches §A.3 worksheet | Required once |

### C.5 Explicit non-goals (do **not** run in PE1.b.6b)

- Full HV1/HV2 catalog packs
- PE1.b.4b local lifecycle
- Successful `publish_sku_forecast` / `persist_*` / `read_fresh_published_sku_forecast` / snapshot as service_role or authenticated
- Canary UUID allowlisting; attestation activation; Age/alg/coverage approvals
- Workers ENABLE; cron; Vercel; PB1/M7/CHECK changes
- Merchant `SELECT *` dumps; pasting JWTs/keys into evidence
- Creating new orgs/users/forecast rows (unless a **separate** write approval exists — out of this plan)

### C.6 Expected outcome summary

| Class | Outcome |
|---|---|
| Same-tenant authenticated SELECT | Sees only member org rows (FULL) or empty-with-membership-proven (LIMITED) |
| Cross-tenant authenticated SELECT | **Zero** foreign rows |
| Unauthenticated / malformed / foreign JWT | No forecast data; auth failure |
| Authenticated/anon RPC EXECUTE | Denied |
| Authenticated table writes | Denied |
| service_role contrast | May bypass RLS — proves why JWT path is distinct |

---

## D. Safety, logging, and stop controls

### D.1 Hidden writes and session side effects

| Effect | Risk | Control |
|---|---|---|
| Auth `last_sign_in_at` / refresh rotation | Session metadata write | Allowed; note in evidence as non-forecast side effect |
| Auth audit / login logs in Supabase | Provider logging | Do not disable; do not paste raw logs with tokens |
| PostgREST prepared statements | None expected on deny | — |
| Accidental RPC success | Forecast mutate / read side effects | J8/J9 must deny; on unexpected success → **STOP** (§D.3) |
| Accidental DML | Row create/update | J7 deny; before/after counts |
| Admin UI clicks during pack | Unrelated mutations | Freeze operator to approved steps only |

### D.2 Zero-write verification (forecast surface)

Before J1 and after final JWT case:

1. Record count-only totals for all six forecast tables (global).
2. After pack: counts must be **unchanged**.
3. Any delta → **FAIL / STOP**; treat as incident; do not continue to claim PASS.

Membership/auth tables may show login-related updates — document separately; do not “fix” by deleting membership.

### D.3 Redaction and audit logging for the pack

**Evidence may record:**

| Field | Rule |
|---|---|
| `packVersion` | `m6-pe1b6a-hosted-jwt-isolation-preflight-v1` / execution `…-6b-v1` |
| Pin ref + env class | Non-secret |
| Case ID → PASS/FAIL/SKIP | Required |
| Counts only | Integers |
| `auth.uid` last-4 | Optional |
| Operator + timestamps | Required |
| Mode FULL/LIMITED | Required |

**Evidence must not record:** full JWTs, refresh tokens, service_role keys, anon keys, passwords, connection strings, `SELECT *` merchant/forecast payloads, emails beyond redacted operator notes.

**Audit sink:** PE1 production audit sink remains **MISSING** (PE1.b.5). PE1.b.6b uses an **operator evidence note** (dated file or ticket) — not a substitute for D7 production audit ownership.

### D.4 Stop conditions (immediate)

1. Pin ref ≠ `qlsqminsfdntpqdkhxjx` or env class unlabeled → **STOP**.
2. §E owner approval missing / not YES → **STOP** (even for “just a SELECT”).
3. §B.4 mode BLOCKED → **STOP**.
4. Any cross-tenant row visible (J2/J3/J4 fail) → **STOP**; P0 incident.
5. Authenticated/anon successfully EXECUTEs a forecast RPC → **STOP**; P0 incident.
6. Authenticated INSERT/UPDATE/DELETE succeeds on forecast tables → **STOP**; P0 incident.
7. Forecast table counts change during pack → **STOP**.
8. Temptation to “confirm” via service_role publish/persist/reader → **STOP** (out of scope).
9. Token or key pasted into git-tracked docs → **STOP**; rotate credentials.

### D.5 Evidence required to authorize PE1.b.6b closeout (post-execution)

PE1.b.6b may be marked **PASS (scope-limited)** only if all hold:

1. §A.3 pin + env class recorded and matched.
2. O1–O6 ownership checklist PASS.
3. Required matrix cases PASS (J6–J11, J13 always; J1–J5 per mode; J7–J9 deny).
4. Zero-write forecast counts unchanged.
5. No secrets in evidence artifact.
6. Explicit statement: JWT runtime isolation PASS does **not** authorize PE1.c, hosted lifecycle, D1–D7 production approvals, or UUID allowlisting.
7. LIMITED mode must not be over-claimed as FULL.

---

## E. Explicit owner approvals needed

**No hosted request — including read-only — may proceed without these.**

| ID | Approval | Scope | Status in this doc |
|---|---|---|---|
| **A1** | Run PE1.b.6b on pin `qlsqminsfdntpqdkhxjx` | Read-only JWT/RLS/EXECUTE-deny pack only | **REQUIRED** — not granted here |
| **A2** | Label env class Preview\|Production\|Other | Classification only; ≠ D5 UUID / Env-A/B/C canary approval | **REQUIRED** |
| **A3** | Designate Org A / Org B (/ User N) for probes | Isolation identities; ≠ production canary allowlist | **REQUIRED** |
| **A4** | Declare FULL vs LIMITED inventory mode | Count-only inventory permission | **REQUIRED** |
| **A5** | Optional service_role contrast J12 | Acknowledge RLS bypass; redact | **OPTIONAL** |
| **A6** | Evidence retention location | Operator note path / ticket | **REQUIRED** before execution |

**Not requested / not granted by PE1.b.6a:**

- D1–D7 production policy approvals
- PE1.c; persist/publish/eval; workers/cron
- UUID minting; attestation activation; CHECK/PB1/M7 flips
- Fixture INSERT approval (separate, if needed later for FULL mode)

**Approval phrase pattern (owner records outside git secrets):**

> “I approve PE1.b.6b read-only hosted JWT isolation probes on project ref `qlsqminsfdntpqdkhxjx`, env class `<Preview|Production|Other>`, mode `<FULL|LIMITED>,` using designated test users only. No forecast RPC success path, no workers, no PE1.c.”

---

## F. GO / NO-GO for PE1.b.6b

| Action | Decision |
|---|---|
| Accept this PE1.b.6a preflight (docs only) | **GO** |
| Execute PE1.b.6b under this document alone | **NO-GO** |
| Execute PE1.b.6b after A1–A4 + A6 recorded YES | **GO to execute** (owner-operated; still no PE1.c) |
| Claim JWT isolation proven before PE1.b.6b evidence | **NO-GO** |
| Re-run HV1/HV2/PE1.b.4b as substitute for JWT proof | **NO-GO** |
| Use service_role SELECT success as JWT PASS | **NO-GO** |
| Hosted lifecycle mutate / PE1.c / policy activation | **NO-GO** |
| Preserve dirty tree; no commit/push under this task | **GO** (process) |

### F.1 Planning readiness summary

| Gate | Call |
|---|---|
| Preflight plan complete | **GO** |
| PE1.b.6b execution | **NO-GO until §E approvals** |
| PE1.c / production eligibility | **NO-GO** |

---

## Freeze checklist

- [x] HEAD `15198ac` verified; dirty tree preserved aside from this file
- [x] Exact hosted pin + Preview/Production/Other prerequisites defined
- [x] Org A/B (/N) JWT roles, claims, ownership evidence defined (no UUIDs minted)
- [x] Positive/negative RLS + RPC EXECUTE deny matrix specified
- [x] Authenticated JWT vs service_role bypass vs privileged RPC distinguished
- [x] Same-tenant / cross-tenant / anon / malformed expectations defined
- [x] Hidden writes, zero-write verification, redaction, audit note requirements defined
- [x] Explicit owner approval required before any hosted request
- [x] Stop conditions + PE1.b.6b closeout evidence gates defined
- [x] HV1/HV2/PE1.b.4b not unnecessarily repeated
- [ ] Owner A1–A6 approvals — **not granted**
- [ ] PE1.b.6b execution — **not authorized**

**M6-PE1.b.6a hosted JWT isolation preflight COMPLETE (docs only).**
**STOP.** No hosted requests, token minting, PE1.b.6b execution, or production policy changes.
