# M6-HV2 — Hosted Identity & Authorization Audit

**Mode:** AUDIT + OWNER EVIDENCE CLOSEOUT (docs only). Agent does **not** re-execute hosted SQL. No DDL/DML, migration apply, db push, configuration changes, secret/customer-data extraction, forecast publishing, eligibility activation, M7 changes, workers/cron enablement, or source/test edits.
**As-of:** 2026-11-05
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Baseline requested:** `main` @ `770afed`
**Verified HEAD:** `770afed5b18202ab70f057a227e3376e84d60d25` — `docs(forecast): record HV1 hosted schema verification`
**Dirty tree:** Unrelated dirty files preserved untouched except updates to **this** file.
**Parents / authority:**
- `docs/M6_HV1_HOSTED_FORECAST_VERIFICATION.md` (schema/metadata PASS; identity previously **UNVERIFIED** — now bound via §H pin)
- `docs/M6_PE1_B2_POLICY_CONSISTENCY_AND_DECISIONS.md` (tenant grain; attestation; PE1.c blockers)
- M6 migrations `20261030140000`–`20261030200000` (+ snapshot `20261030130000`)
- `lib/supabase/admin.ts`, `lib/persistence/metric-worker-runtime-env.ts`
- `docs/M5_HR1_A_ORG_SCOPED_RECOMPUTE_CONTRACT.md`, `docs/M5_HR1_B_ORG_SCOPED_ROLLOVER_CONTRACT.md`
- `docs/M5_HR3_VERCEL_PRODUCTION_RUNTIME_CONTRACT.md`, `docs/M5_HR3_2_VERCEL_DEPLOYMENT_READINESS.md`
- Pattern: `docs/M5_HR2_HOSTED_READINESS_VERIFICATION.md`

**Authority when docs conflict:** this document for **hosted project identity pinning, forecast RLS/RPC authorization verification plan, worker/cron evidence checklist, owner closeout verdict, and GO/NO-GO only**. It does **not** approve PE1.c, authorize mutating RPCs, prove JWT runtime isolation, or invent external scheduler evidence.

---

## 0. Executive verdict

| Gate | Call |
|---|---|
| Local RLS policy + RPC tenant-isolation inventory | **PASS** (repo HEAD) |
| HV1 schema/metadata SELECT evidence | **PASS** (scope-limited; prior closeout; pin now bound §H) |
| Hosted project identity pin | **PASS** (§H.0 — `qlsqminsfdntpqdkhxjx` / `postgres`) |
| Hosted RLS **policy definitions** vs repo | **PASS** (catalog; HV2-1…HV2-3) |
| Hosted RPC grants / empty `search_path` / tenant-guard **markers** | **PASS** (HV2-4…HV2-5; markers ≠ full body semantics) |
| Table ACLs (authenticated/service_role SELECT only) | **PASS** (HV2-6; 12 grants) |
| Local worker ENABLE / hosted `pg_cron` | **PASS** (F1, F8, F9, F10 local/repo/DB scope) |
| Vercel / external scheduler ENABLE inventory | **N/A** (F2–F7 — no Vercel project/deployment reported) |
| Runtime JWT cross-tenant isolation | **UNPROVEN** |
| Full RPC body semantic verification | **UNPROVEN** (markers only) |
| Production eligibility / PE1.c / publish / PB1 / M7 | **NO-GO** |
| Worker/cron **enablement** / purchasing | **NO-GO** |

**Overall (scope-limited):** **PASS** for hosted identity pin + forecast RLS policy catalog + RPC DEFINER/EXECUTE/empty `search_path` + tenant-guard **markers** + table SELECT ACLs + local/repo/`pg_cron` off-posture on the pinned project. **NO-GO** for production forecast lifecycle, PE1.c/eligibility, JWT runtime proof, full RPC body certification, worker/cron activation, or Vercel ENABLE claims.

---

## A. Repo-side security findings

### A.1 What HV1 already proved vs still open

| Claim | HV1 status |
|---|---|
| Eight required M6 migrations present | **PASS** |
| Six forecast tables present; zero rows | **PASS** |
| Named hard-false / token CHECKs present | **PASS** |
| RLS **enabled** flag; FORCE RLS false | **PASS** (flag only) |
| Five RPCs: DEFINER, empty `search_path`, service_role EXECUTE, anon/auth no EXECUTE | **PASS** (metadata flags) |
| Project / Preview vs Prod identity | Was **UNVERIFIED** in HV1 → **PASS** in HV2 §H.0 (same pin) |
| RLS **policy** names/expressions/roles | Was **UNPROVEN** → **PASS** catalog (HV2-1…3); JWT runtime still **UNPROVEN** |
| RPC **body** tenant predicates | Markers **PASS** (HV2-5); full body semantics still **UNPROVEN** |
| Workers / cron live config | Local/repo/`pg_cron` **PASS** (F1/F8/F9/F10); Vercel **N/A** (F2–F7) |

### A.2 Expected RLS policies (six forecast tables)

Local migrations define **exactly one** `FOR SELECT` policy per table, role **`authenticated`**, membership predicate via `organization_members`:

| Table | Policy name | Migration |
|---|---|---|
| `forecast_runs` | `forecast_runs_select_member` | `20261030140000` |
| `sku_forecasts` | `sku_forecasts_select_member` | `20261030140000` |
| `sku_forecast_publications` | `sku_forecast_publications_select_member` | `20261030150000` |
| `sku_forecast_current` | `sku_forecast_current_select_member` | `20261030150000` |
| `forecast_evaluation_runs` | `forecast_evaluation_runs_select_member` | `20261030200000` |
| `forecast_evaluation_model_scores` | `forecast_evaluation_model_scores_select_member` | `20261030200000` |

**Normative `USING` shape (all six):**

```sql
exists (
  select 1
  from public.organization_members as membership
  where
    membership.organization_id = <table>.organization_id
    and membership.user_id = (select auth.uid())
)
```

**Observed grant pattern:** `REVOKE ALL` from `public, anon, authenticated, service_role` then `GRANT SELECT` to `authenticated, service_role`. No authenticated INSERT/UPDATE/DELETE policies in these migrations.

**Critical boundary:** Postgres **`service_role` bypasses RLS**. Table SELECT to `service_role` + admin client (`createSupabaseAdminClient`) is a **trusted server-only** path. Tenant isolation for admin/service_role depends on **application grain arguments + RPC DEFINER bodies**, not RLS. Authenticated clients rely on the membership policies above.

### A.3 SECURITY DEFINER RPC tenant predicates (local)

| RPC | Null-grain reject | Cross-row org/grain match | Trusted EXECUTE |
|---|---|---|---|
| `forecast_sku_demand_source_snapshot` | Requires org/store/location/variant (+ as_of) | Snapshot scoped to args | service_role only |
| `persist_forecast_sku_demand_result` | `p_organization_id` (and grain) null → exception | Persist bound to caller grain + token checks | service_role only |
| `publish_sku_forecast` | Run must exist; forecast grain must match run grain | `organization_id`/store/location/variant consistency between run and forecast | service_role only |
| `read_fresh_published_sku_forecast` | Null 4-tuple → exception | Current/publication/run/forecast org (and grain) must match `p_*`; else fail closed | service_role only |
| `persist_forecast_evaluation_result` | Null org/grain → exception | Evaluation rows keyed to grain; trust claims hard-false | service_role only |

All set `search_path = ''`. HV1 already verified EXECUTE grants; HV2 verifies **body predicates** still contain these guards on hosted.

**Trusted caller boundary (app):** forecast adapters import `server-only` and use `createSupabaseAdminClient()` (`lib/supabase/admin.ts`) with `SUPABASE_SERVICE_ROLE_KEY` from server env — never browser/anon paths.

### A.4 Cross-organization protections (repo)

1. Authenticated SELECT limited to orgs where `auth.uid()` is a member.
2. DEFINER RPCs require explicit non-null org/store/location/variant (or run id that resolves to a single grain) and compare related rows’ org/grain.
3. No anon EXECUTE on forecast mutate/read RPCs (HV1 metadata PASS).
4. Metric workers: org from **env only** (HR1); Preview hard-disable when `VERCEL_ENV=preview` (`metric-worker-runtime-env.ts`).

### A.5 Worker / scheduler assumptions (repo — not live proof)

| Control | Repo evidence | Live hosted |
|---|---|---|
| `METRIC_RECOMPUTE_WORKER_ENABLED` / `METRIC_ROLLOVER_WORKER_ENABLED` | `.env.example` empty; effective enable only exact `"1"` after Preview guard | **UNKNOWN** until console |
| Preview hard-disable | `isVercelPreviewRuntime` → ENABLE treated false | **UNKNOWN** until `VERCEL_ENV` on deploy confirmed |
| `vercel.json` crons | **Absent** in repo | Deploy may still differ — **UNKNOWN** |
| Forecast-specific worker ENABLE | **No** forecast worker ENABLE flags in `.env.example` | Expect absent; confirm console |
| HR3 cron adapters | Contract frozen; enablement **NO-GO** without separate approval | Do not enable in HV2 |

### A.6 Repo-side authorization verdict

**PASS** for documented fail-closed design: membership RLS for authenticated SELECT; service_role-only DEFINER RPCs with null/grain checks; server-only admin client; metric workers default-OFF + Preview hard-disable in code.
**NOT a hosted proof.** Hosted identity, live policy text, live `prosrc`, and live ENABLE remain owner evidence.

---

## B. Project identity pinning procedure

**Goal:** Prove which Supabase project the HV1/HV2 SELECTs hit (Preview vs Production) **before** trusting env-specific conclusions.

### B.Safety — pack rules (normative)

1. **Read-only only:** HV2-0…HV2-6 are plain `SELECT` catalog/session queries. No RPC **invocation**, no `DO`/`SET`/`CALL`/DDL/DML, no dynamic SQL (`EXECUTE`), no `SELECT forecast_*(...)`.
2. **Inspect, do not execute:** RLS `qual` text and RPC body **markers** are catalog inspections (`pg_policies`, `pg_get_functiondef` used only inside `ilike` boolean expressions). Do **not** paste full `pg_get_functiondef` / `prosrc` into evidence.
3. **Independent pin first:** Complete §B.1 worksheet from the **console** (project ref / expected database) **before** any SQL. Do not invent refs.
4. **Identity gate:** HV2-0 must **PASS** against the pre-declared pin before HV2-1+. Mismatch → **FAIL / STOP**. Identity **UNKNOWN** (e.g. `server_addr` null without console ref proof) → **STOP** — do not run HV2-1+ and do not score later queries PASS.
5. **Cardinality:** Where §D expects N rows / N policies / N RPCs, empty or partial results = **FAIL**, never silent PASS. HV2-3’s expected **0** rows is the only intentional empty PASS.
6. **No secrets / customer data:** Do not paste service-role keys, JWTs, connection strings, `CRON_SECRET` values, or `SELECT *` from membership/commerce/forecast body tables into evidence.
7. **STOP** on any §D **FAIL** or §E.1 condition. Do not “confirm” by invoking publish/persist/reader RPCs.

### B.1 Pre-declare (owner worksheet — fill before SQL)

| Field | Pre-declared value |
|---|---|
| Intended env | Preview \| Production \| Other |
| Supabase project ref (console) | _(owner fills; do not invent)_ |
| Expected `current_database()` | _(owner fills)_ |
| Expected URL host (no secrets) | _(owner fills)_ |
| Operator + timestamp | _(owner fills)_ |

### B.2 Pin steps

1. Open the **intended** project in Supabase console; copy project ref / database name into §B.1 (**before** SQL).
2. Open SQL editor **for that same project** (or `psql` URL that matches it).
3. Run **HV2-0** (§C) only. Record `database`, `db_user`, `server_addr`, `server_port`, `pg_version`.
4. Compare to pre-declared worksheet.
   - Match → identity **PASS**; proceed to HV2-1+.
   - Mismatch → **FAIL / STOP**. Do **not** run HV2-1+.
   - `server_addr` null → require console project-ref screenshot/note; score **UNKNOWN** until confirmed — **not PASS**. Treat as **STOP** for HV2-1+ until PASS.
5. Do **not** paste service-role keys, JWTs, or connection strings into evidence docs.
6. Optionally record whether HV1 evidence was taken on the **same** pin (same database + ref). If HV1 pin was UNVERIFIED, mark HV1 env binding as **retroactively UNKNOWN** until this pin matches a known console project.

### B.3 Explicit non-claims

- Historical HR2 ref `qlsqminsfdntpqdkhxjx` is **not** automatically this run’s pin.
- Local `.env.local` / `127.0.0.1` is **not** hosted identity.

---

## C. SELECT-only hosted verification queries

**Owner-approved execution only.** Plain `SELECT`s. No RPC **invocation**, no `DO`/`SET`/`CALL`/DDL/DML, no row dumps of merchant tables. See **§B.Safety**.

**Approved order:** HV2-0 → (identity **PASS** only) → HV2-1 → HV2-2 → HV2-3 → HV2-4 → HV2-5 → HV2-6. **STOP** on identity FAIL/UNKNOWN (unresolved) or any §D **FAIL** / §E.1 condition.

### HV2-0 — Session identity

```sql
-- HV2-0 Identity (must match pre-declared pin)
select
  current_database() as database,
  current_user as db_user,
  inet_server_addr() as server_addr,
  inet_server_port() as server_port,
  current_setting('server_version', true) as server_version_setting,
  version() as pg_version;
```

### HV2-1 — RLS policies on six forecast tables

```sql
-- HV2-1 Expect exactly 6 policies (one SELECT policy per table)
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'forecast_runs',
    'sku_forecasts',
    'sku_forecast_publications',
    'sku_forecast_current',
    'forecast_evaluation_runs',
    'forecast_evaluation_model_scores'
  )
order by tablename, policyname;
```

### HV2-2 — Policy predicate content (membership + auth.uid)

```sql
-- HV2-2 Each USING expr must reference organization_members and auth.uid()
select
  tablename,
  policyname,
  cmd,
  roles,
  (qual ilike '%organization_members%') as mentions_organization_members,
  (qual ilike '%auth.uid%') as mentions_auth_uid,
  (cmd = 'SELECT') as is_select_cmd,
  qual
from pg_policies
where schemaname = 'public'
  and tablename in (
    'forecast_runs',
    'sku_forecasts',
    'sku_forecast_publications',
    'sku_forecast_current',
    'forecast_evaluation_runs',
    'forecast_evaluation_model_scores'
  )
order by tablename, policyname;
```

### HV2-3 — No unexpected write policies on forecast tables

```sql
-- HV2-3 Expect zero non-SELECT policies on the six tables
select
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'forecast_runs',
    'sku_forecasts',
    'sku_forecast_publications',
    'sku_forecast_current',
    'forecast_evaluation_runs',
    'forecast_evaluation_model_scores'
  )
  and cmd <> 'SELECT'
order by 1, 2;
```

### HV2-4 — RPC DEFINER / search_path / EXECUTE (reconfirm + arity)

**Checker correction (closeout):** The original pack helper that cast `proconfig::text` and matched `'{search_path=}'` / regex forms is a **known false negative** on this hosted Postgres 17 build (text form may not equal those literals even when `search_path` is empty). Do **not** FAIL on that helper alone. Normative empty-`search_path` evidence is the **direct `proconfig` array diagnostic** below (owner-verified PASS).

```sql
-- HV2-4 Expect exactly 5 RPCs; flags match HV1; args match §A.3
-- Exact evidence: security_definer=true; empty search_path via proconfig array;
-- sr_exec=true; anon_exec=false; auth_exec=false. Privilege checks are read-only.
-- Do NOT use proconfig::text literal IN/regex alone (false-negative risk).
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  p.proconfig as proconfig_array,
  (
    p.proconfig is not null
    and cardinality(p.proconfig) >= 1
    and exists (
      select 1
      from unnest(p.proconfig) as cfg(setting)
      where cfg.setting in ('search_path=', 'search_path=""')
    )
    and not exists (
      select 1
      from unnest(p.proconfig) as cfg(setting)
      where cfg.setting like 'search_path=%'
        and cfg.setting not in ('search_path=', 'search_path=""')
    )
  ) as empty_search_path,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as sr_exec,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'forecast_sku_demand_source_snapshot',
    'persist_forecast_sku_demand_result',
    'publish_sku_forecast',
    'read_fresh_published_sku_forecast',
    'persist_forecast_evaluation_result'
  )
order by 1, 2;
```

### HV2-5 — RPC body tenant-guard markers (catalog text only — does **not** execute RPCs)

```sql
-- HV2-5 Body must contain null-org / grain isolation markers (substring checks)
-- Evidence = boolean columns only. Do NOT select/paste full pg_get_functiondef/prosrc.
select
  p.proname,
  (pg_get_functiondef(p.oid) ilike '%p_organization_id is null%') as rejects_null_org,
  (pg_get_functiondef(p.oid) ilike '%organization_id is distinct from%') as checks_org_distinct,
  (pg_get_functiondef(p.oid) ilike '%set search_path%') as mentions_search_path,
  (pg_get_functiondef(p.oid) ilike '%security definer%') as mentions_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'forecast_sku_demand_source_snapshot',
    'persist_forecast_sku_demand_result',
    'publish_sku_forecast',
    'read_fresh_published_sku_forecast',
    'persist_forecast_evaluation_result'
  )
order by 1;
```

**Interpretation note:** `publish_sku_forecast` takes `p_forecast_run_id` (not `p_organization_id`); expect `rejects_null_org=false` but `checks_org_distinct=true` (run vs forecast grain). Reader/persist/snapshot/eval should show `rejects_null_org=true`. Exactly **5** rows required; fewer = **FAIL** (missing RPC), not PASS on a subset.

### HV2-6 — Table ACLs (reconfirm SELECT-only; no writes)

```sql
-- HV2-6 Table grants for anon/authenticated/service_role/public
-- Exact evidence: authenticated + service_role → SELECT only; no INSERT/UPDATE/DELETE/TRUNCATE
-- for listed grantees; anon/public absent or without table DML.
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'forecast_runs',
    'sku_forecasts',
    'sku_forecast_publications',
    'sku_forecast_current',
    'forecast_evaluation_runs',
    'forecast_evaluation_model_scores'
  )
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
group by table_name, grantee
order by table_name, grantee;
```

### Explicit non-goals (do **not** run)

- Any `SELECT <forecast_rpc>(...)` / `CALL` / dynamic `EXECUTE`
- `SELECT pg_get_functiondef(...)` (or `prosrc`) as a dumped column into evidence
- `SELECT *` from `organization_members`, commerce, or forecast body tables
- INSERT/UPDATE/DELETE/DO/SET/CALL/DDL
- Enabling workers, adding `vercel.json` crons, publish/persist/eval

---

## D. Expected PASS / FAIL / UNKNOWN results

| Query | PASS | FAIL | UNKNOWN |
|---|---|---|---|
| **HV2-0** | Matches pre-declared console pin (`database` + project ref) | Wrong project → **STOP**; do not run HV2-1+ | `server_addr` null without console ref proof → **STOP** HV2-1+ until PASS |
| **HV2-1** | Exactly **6** rows/policies; names match §A.2; all `cmd=SELECT` | **0**/partial/`>6` rows; missing/extra/renamed policies | — |
| **HV2-2** | Exactly **6** rows; all `is_select_cmd`; `mentions_organization_members` + `mentions_auth_uid` true | **0**/partial rows; predicate drift / missing membership or `auth.uid` | — |
| **HV2-3** | Exactly **0** rows | Any INSERT/UPDATE/DELETE/ALL policy row | — |
| **HV2-4** | Exactly **5** rows; `security_definer=true`; `empty_search_path=true` via **proconfig array** diagnostic; `sr_exec=true`; `anon_exec=false`; `auth_exec=false`; args match HV1/§A.3 | Missing RPC (`<5`); wrong args; non-DEFINER; polluted/`NULL` search_path; anon/auth EXECUTE | Legacy `proconfig::text` literal matcher false negative — **not** FAIL by itself; re-check with array diagnostic before UNKNOWN |
| **HV2-5** | Exactly **5** rows; reader/persist/snapshot/eval: `rejects_null_org=true`; publish: `rejects_null_org=false` + `checks_org_distinct=true`; others `checks_org_distinct` as applicable | `<5` rows; missing tenant markers on expected RPCs | Substring false negative if SQL reformatted oddly — investigate, **do not PASS blindly** |
| **HV2-6** | Per table: `authenticated` and `service_role` have **SELECT only**; no write privileges for listed grantees | Any INSERT/UPDATE/DELETE/TRUNCATE (or broader write) for listed grantees | Empty ACL set for a present table / unexpected grantee shape — investigate, **do not PASS** |

**Cardinality rule:** empty or partial result where §D expects N>0 = **FAIL**, never silent PASS. HV2-3 expected empty is the exception.

**Authorization certification PASS (scope-limited):** HV2-0 **PASS** + HV2-1…HV2-6 **PASS**.
Still **does not** prove: runtime RLS with real JWTs, service_role app misuse, live ENABLE, PE1.c.

---

## E. P0 / P1 discrepancies and STOP conditions

### E.1 STOP conditions (immediate)

1. HV2-0 identity mismatch vs pre-declared pin → **STOP**; do not run HV2-1+.
2. HV2-0 identity **UNKNOWN** (unresolved console pin / null `server_addr` without ref proof) → **STOP**; do not run HV2-1+; do not certify.
3. HV2-1/2: not exactly 6 membership/`auth.uid` SELECT policies.
4. HV2-3 non-SELECT policies on forecast tables.
5. HV2-4: `<5` RPCs, anon/auth EXECUTE, non-DEFINER, or non-empty/polluted search_path.
6. HV2-5: `<5` RPCs or missing null-org / org-distinct guards on expected RPCs.
7. Any temptation to “confirm” by invoking publish/persist/reader RPCs or dumping full function bodies → **STOP** (out of scope).

### E.2 P0

| ID | Status | Blocker / note |
|---|---|---|
| HV2-P0-1 | **CLEARED** | Project identity pinned (§H.0) |
| HV2-P0-2 | **CLEARED** (catalog) | Six membership SELECT policies verified; JWT runtime still P1 |
| HV2-P0-3 | **CLEARED** (markers) | Tenant-guard markers PASS; full RPC body semantics still P1 |
| HV2-P0-4 | **OPEN** | service_role RLS bypass — app must remain server-only; misuse = tenant breach |
| HV2-P0-5 | **PARTIAL** | Local/repo/`pg_cron` off **PASS**; Vercel F2–F7 **N/A** (no project reported) — not a Vercel ENABLE PASS |
| HV2-P0-6 | **OPEN / NO-GO** | Production eligibility / PE1.c / publish / PB1 / M7 / purchasing |

### E.3 P1

| ID | Status | Gap |
|---|---|---|
| HV2-P1-1 | **OPEN** | No live JWT cross-tenant negative test in this pack |
| HV2-P1-2 | **OPEN** | Correction-outbox / evidence RPC authorization matrix not covered |
| HV2-P1-3 | **CLEARED** | HV1 schema evidence bound to verified pin `qlsqminsfdntpqdkhxjx` (§H.0) |
| HV2-P1-4 | **OPEN** | M7 / PB1 adjacency absent (if later claimed) |
| HV2-P1-5 | **OPEN** | Canary UUID / TZ still `POLICY_DECISION_REQUIRED` |
| HV2-P1-6 | **OPEN** | Full RPC body semantic verification beyond substring markers |
| HV2-P1-7 | **OPEN** | External/non-Vercel scheduler inventory beyond hosted `pg_cron` absence |

---

## F. Worker / cron evidence checklist (console — not SQL)

Complete on the **same** pinned environment as HV2-0. Record PASS/FAIL/UNKNOWN/**N/A** only; **do not** set ENABLE=`1`. Surfaces are distinct — do not conflate local app, Vercel, and hosted DB.

| # | Surface | Check | How | Expected |
|---|---|---|---|---|
| F1 | **Local app** | Effective `METRIC_*_WORKER_ENABLED` in local runtime / `.env.local` (if used) | Local env inspection only — **no values pasted** | unset / ≠ `1` (or N/A if not running locally) |
| F2 | **Vercel** | `METRIC_RECOMPUTE_WORKER_ENABLED` | Vercel project env (Preview + Production as applicable) | unset / ≠ `1` |
| F3 | **Vercel** | `METRIC_ROLLOVER_WORKER_ENABLED` | Vercel project env | unset / ≠ `1` |
| F4 | **Vercel** | No forecast worker ENABLE vars present | Vercel project env | absent / off |
| F5 | **Vercel** | `VERCEL_ENV` on Preview deployments | Deploy metadata | `preview` if Preview (hard-disable applies) |
| F6 | **Vercel** | Production ENABLE still off unless separate approval | Vercel Production env | ≠ `1` for HV2 |
| F7 | **Vercel** | No active crons scheduling metric/forecast workers | Vercel project cron / schedule settings | none active for forecast/metric workers |
| F8 | **Repo** | No `vercel.json` crons at HEAD | `git` / tree at verified HEAD | absent |
| F9 | **Hosted DB** | No `pg_cron` (or equivalent) jobs scheduling forecast publish/persist | Console / catalog **SELECT-only** if separately approved; else leave **UNKNOWN** | none for forecast; default **UNKNOWN** if not inspected |
| F10 | **Vercel / Local** | `CRON_SECRET` / worker secrets | Presence only — **do not paste values** | optional; ENABLE off remains primary kill |

**Interpretation:** F1≠F2/F3 (local off does not prove Vercel off). F8≠F7 (repo absent does not prove deployed cron absent). F9 is hosted DB only — not proven by Vercel env. If any F2–F4 / F6 is `1` without explicit approval → **P0** for activation posture (document; do not “fix” by leaving on). **N/A** is required when the surface does not exist (e.g. no Vercel project) — do not score those rows PASS.

---

## G. GO / NO-GO matrix

| Action | Decision |
|---|---|
| Accept HV2 audit pack + safety rules | **GO** (docs) |
| Record owner HV2 SELECT + §F evidence as scope-limited auth **PASS** (§H) | **GO** |
| Scoped documentation commit of **this file only** (when owner requests) | **GO** |
| Claim JWT runtime isolation or full RPC body semantics proven | **NO-GO** |
| Claim Vercel ENABLE off from F2–F7 | **NO-GO** (**N/A**, not PASS) |
| Invoke forecast RPCs / publish / enable workers / add crons | **NO-GO** |
| PE1.c / eligibility activation / PB1 / M7 flips / purchasing | **NO-GO** |
| Invent project ref or paste secrets into docs | **NO-GO** |

---

## H. Owner SELECT-pack evidence closeout (2026-11-05)

**Source:** Owner-executed reviewed HV2 SELECT-only pack + §F checklist on remote Supabase / local config.
**Agent session:** records evidence only; does **not** re-execute SQL; does **not** invent additional project refs or Vercel deployments.

### H.0 Project identity

| Field | Result |
|---|---|
| Project name | `storeagent` |
| Supabase project ref | `qlsqminsfdntpqdkhxjx` |
| `current_database()` | `postgres` |
| Postgres version | **17.11** |
| HV2-0 vs pre-declared pin | **PASS** |
| HV1 binding | Same pin now binds prior HV1 schema/metadata evidence (clears HV2-P1-3) |

### H.1 Evidence matrix (HV2-0…HV2-6)

| Check | Observed | Verdict |
|---|---|---|
| HV2-0 Session identity | Pin match: `storeagent` / `qlsqminsfdntpqdkhxjx` / `postgres` / PG 17.11 | **PASS** |
| HV2-1 RLS policies | Exactly **6** authenticated `SELECT` membership policies (names per §A.2) | **PASS** |
| HV2-2 Predicate markers | Membership + `auth.uid` present on all six | **PASS** (catalog text) |
| HV2-3 Non-SELECT policies | **0** write policies on forecast tables | **PASS** |
| HV2-4 RPC flags / grants | Exactly **5** DEFINER RPCs; `service_role` EXECUTE only; anon/auth denied | **PASS** |
| HV2-4 empty `search_path` | Confirmed via **direct `proconfig` array** diagnostic; original `proconfig::text` literal/regex helper = **false negative** (not used as FAIL) | **PASS** |
| HV2-5 Tenant-guard markers | Null-org / org-distinct patterns match expected per RPC (§C note) | **PASS** (markers only) |
| HV2-6 Table ACLs | **12** grants: `authenticated` + `service_role` **SELECT only** (six tables × two grantees) | **PASS** |

### H.2 Worker / cron matrix (§F)

| # | Surface | Observed | Verdict |
|---|---|---|---|
| F1 | Local app | `.env.local` metric worker ENABLE flags **UNSET** | **PASS** |
| F2–F7 | Vercel | No Vercel project/deployment reported for this closeout | **N/A** (not PASS; not FAIL) |
| F8 | Repo | No `vercel.json` at verified HEAD `770afed` | **PASS** |
| F9 | Hosted DB | `pg_cron` absent; `cron.job` relation absent | **PASS** |
| F10 | Local | `CRON_SECRET` + two metric worker secrets **UNSET** (presence check only; no values recorded) | **PASS** |

### H.3 Scope-limited verdict

**PASS — hosted M6 identity & authorization SELECT posture** on pin `qlsqminsfdntpqdkhxjx` for: project identity, six forecast membership RLS policies (catalog), absence of forecast write policies, five DEFINER RPCs with service_role-only EXECUTE, empty `search_path` (array diagnostic), tenant-guard **markers**, authenticated/service_role SELECT-only table ACLs, and local/repo/hosted-`pg_cron` off-posture checks performed.

**This PASS does not include:**

| Area | Status |
|---|---|
| Runtime JWT / cross-tenant RLS enforcement | **UNPROVEN** |
| Full RPC body semantic verification (beyond markers) | **UNPROVEN** |
| service_role trusted-caller misuse resistance | **OPEN** (app boundary; P0-4) |
| Vercel / external PaaS ENABLE + cron inventory | **N/A** / not inventoried |
| Non-`pg_cron` external schedulers | **UNKNOWN** (P1-7) |
| Hosted forecast lifecycle (persist→publish→fresh-read) | **NO EVIDENCE** |
| Production eligibility / PE1.c / PB1 / M7 | **NO-GO** |
| Worker/cron **enablement** / purchasing | **NO-GO** |

### H.4 Remaining dependencies (summary)

**P0 still open:** service_role app-trust boundary (P0-4); PE1.c / eligibility / publish / PB1 / M7 / purchasing (P0-6). Vercel ENABLE is **N/A**, not cleared as off.
**P1 still open:** JWT negative tests; outbox/evidence RPC matrix; full RPC body semantics; M7 adjacency if claimed; canary UUID/TZ; external scheduler inventory beyond `pg_cron`.

---

## Freeze checklist

- [x] HEAD `770afed` verified; dirty tree preserved aside from this file
- [x] HV1 vs HV2 open claims distinguished
- [x] Six forecast RLS policies inventoried from migrations
- [x] DEFINER RPC tenant predicates + service_role boundary recorded
- [x] Admin client server-only + worker default-OFF / Preview hard-disable / no vercel.json noted
- [x] Identity pinning procedure + SELECT-only pack + PASS/FAIL/UNKNOWN + STOP/P0/P1 + worker checklist
- [x] Final safety audit: read-only, identity gate, cardinality FAIL, no function-body dumps
- [x] HV2-4 `proconfig::text` false negative corrected; array diagnostic recorded as normative
- [x] Owner HV2-0…HV2-6 + §F evidence recorded (§H) with PASS / N/A / UNPROVEN distinctions
- [x] Limitations preserved: JWT, full RPC semantics, external schedulers, lifecycle, eligibility
- [ ] Production forecast operation / PE1.c / workers / cron enablement — **not authorized**

**M6-HV2 hosted identity & authorization evidence CLOSEOUT COMPLETE (scope-limited PASS).**
**STOP.** No PE1.c, eligibility, PB1/M7, publish, workers, cron enablement, or purchasing.
