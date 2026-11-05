# M6-HV1 — Hosted Forecast Readiness Verification

**Mode:** AUDIT + SELECT-PACK EVIDENCE CLOSEOUT. No new hosted SQL in the agent session that records this closeout; no DDL/DML, migration apply, db push, writes, credential exposure, forecast publication, eligibility activation, canary, workers/cron, PB1/M7/CHECK changes, E4, AI, or purchasing.
**As-of:** 2026-11-05 (evidence closeout)
**Repo:** `/Users/syedmairaj/Documents/storeagent`
**Baseline requested:** `main` @ `38a7b31`
**Verified HEAD:** `38a7b31ab1d784fa711367f67e8251d862bba542` — `docs(forecast): reconcile PE1.b policy and close PE1.b.2`
**Dirty tree:** Unrelated dirty files preserved untouched except updates to **this** file.
**Parents / authority:**
- `docs/M6_PE1_B_CANARY_FORECAST_ELIGIBILITY_POLICY.md` §11 (SELECT pack shape)
- `docs/M6_PE1_B2_POLICY_CONSISTENCY_AND_DECISIONS.md` §D.4 / P0-5
- Local M6 migrations `20261030100000`–`20261030200000` (+ optional M7 adjacency `20261031100000`+)
- Pattern: `docs/M5_HR2_HOSTED_READINESS_VERIFICATION.md` (SELECT-only; do not infer hosted from local)
- Historical (stale-until-reproven for identity): `docs/M5_6_HANDOFF.md`, `docs/IMPLEMENTATION_STATUS.md` M6 hosted-applied claims

**Authority when docs conflict:** this document for **M6 hosted forecast SELECT-pack preparation, owner evidence closeout, scope-limited schema/metadata verdict, and GO/NO-GO only**. It does **not** invent project identity, prove RLS policy semantics or RPC bodies, approve PE1.c, activate eligibility, or authorize any mutating RPC.

**Rule honored:** deployed hosted state is proven only by owner-executed §B results recorded in §H. Local migrations alone are not hosted proof. Project identity remains **UNVERIFIED** until separately confirmed (§E / §H.0).

---

## 0. Executive verdict

| Gate | Call |
|---|---|
| Local M6 schema / security expectations inventory | **PASS** (repo HEAD) |
| Owner-executed HV1 SELECT-only pack (schema/metadata) | **PASS** (§H evidence matrix) — scope-limited |
| Project / environment identity (HV1-0 pin) | **UNVERIFIED** — not separately confirmed; do not invent |
| Hosted M6 migrations / CHECKs / RLS flags / RPC EXECUTE posture | **PASS** (metadata observed) |
| RLS **policy semantics** / RPC **authorization bodies** | **UNPROVEN** by this pack |
| Live worker / cron / ENABLE configuration | **UNKNOWN** (console; not SQL) |
| Hosted forecast lifecycle / accuracy evidence | **ABSENT** |
| Production eligibility policy decisions | **UNRESOLVED** (`POLICY_DECISION_REQUIRED`) |
| Production forecast publish / eligibility / PE1.c | **NO-GO** |
| SELECT pack preparation + safety audit | **PASS** |

**Overall (scope-limited):** **GO** for recording HV1 schema/metadata SELECT evidence as **PASS**.
**NO-GO** for full hosted forecast readiness, production eligibility, PE1.c, workers/cron enablement, or claiming a verified project pin.

---

## A. Expected repo schema (local HEAD — not hosted proof)

### A.1 Required M6 migration versions (minimum for PE1.b §11)

| Version | File | Role |
|---|---|---|
| `20261030100000` | `m6_p2b2b1_forecast_day_evidence.sql` | Day evidence tables / foundation |
| `20261030110000` | `m6_p2b2b2_forecast_evidence_rpcs.sql` | Evidence SECURITY DEFINER RPCs |
| `20261030120000` | `m6_p2b2c3b_forecast_coverage_correction_outbox.sql` | Coverage correction outbox |
| `20261030130000` | `m6_p2c1_forecast_sku_demand_source_snapshot.sql` | `forecast_sku_demand_source_snapshot` |
| `20261030140000` | `m6_p3b_forecast_persistence.sql` | `forecast_runs`, `sku_forecasts`, `persist_forecast_sku_demand_result` |
| `20261030150000` | `m6_p3d1_forecast_publication.sql` | Publications, current pointer, `publish_sku_forecast`, hard-false CHECKs |
| `20261030160000` | `m6_p3d3_fresh_published_forecast_reader.sql` | `read_fresh_published_sku_forecast` |
| `20261030200000` | `m6_p4c1_forecast_evaluation_persistence.sql` | Evaluation runs/scores + trust hard-false CHECK |

**Optional adjacency (if claiming M7 coexistence):**

| Version | Role |
|---|---|
| `20261031100000` | M7.2 inventory actions — `forecast_run_id is null`; production eligibility claim false |
| `20261031120000` / `20261031130000` | M7.3 lifecycle schema/RPCs (merchant approvable hard-false track) |

### A.2 Core forecast tables (expected present)

| Table | Keys / notable constraints (local) |
|---|---|
| `public.forecast_runs` | PK `id`; `source_token ~ '^[a-f0-9]{32}$'`; RLS on; SELECT to authenticated + service_role |
| `public.sku_forecasts` | Grain FKs (org/store/location/variant); RLS on; SELECT to authenticated + service_role |
| `public.sku_forecast_publications` | Immutable trigger; unique published-per-run; `source_token` hex32; **`m7_eligible = false`**; **`persist_claims_post_commit_freshness = false`**; RLS on |
| `public.sku_forecast_current` | PK `(organization_id, store_id, location_id, variant_id)`; `source_token` hex32; RLS on; SELECT only (writes via DEFINER publish) |
| `public.forecast_evaluation_runs` | Trust hard-false CHECK; RLS on |
| `public.forecast_evaluation_model_scores` | RLS on |

### A.3 Hard-false CHECK constraints (must exist hosted)

| Constraint name | Expression (local) |
|---|---|
| `sku_forecast_publications_m7_eligible_false` | `m7_eligible = false` |
| `sku_forecast_publications_no_freshness_claim` | `persist_claims_post_commit_freshness = false` |
| `sku_forecast_publications_source_token_check` | `source_token ~ '^[a-f0-9]{32}$'` |
| `sku_forecast_current_source_token_check` | `source_token ~ '^[a-f0-9]{32}$'` |
| `forecast_runs_source_token_check` | `source_token ~ '^[a-f0-9]{32}$'` |
| `forecast_evaluation_runs_trust_hard_false_check` | `claims_production_approval = false AND claims_m7_numeric_eligibility = false AND algorithm_approved = false` |

### A.4 Critical SECURITY DEFINER RPCs (local posture)

| Function | Args (identity) | `search_path` | EXECUTE |
|---|---|---|---|
| `forecast_sku_demand_source_snapshot` | org/store/location/variant + lookback args | `''` | **service_role only** (anon/authenticated revoked) |
| `persist_forecast_sku_demand_result` | grain + as_of/lookback/token/payload | `''` | service_role only |
| `publish_sku_forecast` | `p_forecast_run_id uuid` | `''` | service_role only |
| `read_fresh_published_sku_forecast` | `p_organization_id, p_store_id, p_location_id, p_variant_id` | `''` | service_role only |
| `persist_forecast_evaluation_result` | grain + jsonb payload | `''` | service_role only |

Grain identity protections (reader/publish local semantics): exact 4-tuple match across current/publication/run/forecast; `source_token` consistency across pointer/run/publication; live snapshot token mismatch → `STALE`; pending corrections → `PENDING_CORRECTION`. Check-time limitation string is frozen in reader SQL/TS (does **not** prove post-return freshness or age).

### A.5 Table grant / RLS posture (local)

- Tables: `REVOKE ALL` from `public, anon, authenticated, service_role` then `GRANT SELECT` to `authenticated, service_role`.
- RLS **enabled**; authenticated SELECT gated by `organization_members` membership.
- No direct table INSERT/UPDATE/DELETE grants to anon/authenticated/service_role in these migrations — mutation via SECURITY DEFINER owners only.
- RPCs: `REVOKE ALL … FROM public, anon, authenticated`; `GRANT EXECUTE … TO service_role`.

### A.6 Historical hosted claims vs this session

| Source | Claim | HV1 treatment |
|---|---|---|
| `docs/M5_6_HANDOFF.md` / `IMPLEMENTATION_STATUS.md` | M6 `20261030100000`–`160000` (+ `200000`) **hosted applied and verified**; row counts 0 / pointers 0 at closeout | **Stale-until-reproven** — cite as history only |
| HR2 (`docs/M5_HR2_HOSTED_READINESS_VERIFICATION.md`) | Hosted M5 SELECT not re-run; workers env UNKNOWN | Pattern authority: hosted ≠ local |
| This session | No DB connection; no SELECT executed | Hosted M6 = **UNKNOWN** |

---

## B. Numbered SELECT-only SQL verification pack

**Owner-approved execution only.** Use SQL editor / `psql` with a controlled session.

### B.Safety — pack rules (normative)

1. **Read-only only:** every statement is a plain `SELECT` against catalogs/`information_schema`/count aggregates. No function **invocation** of forecast RPCs (catalog inspection of `pg_proc` is allowed; `SELECT publish_sku_forecast(...)` is forbidden).
2. **Forbidden:** DDL/DML; `DO` blocks; `SET`/`BEGIN`/`COMMIT`/`ROLLBACK`/`CALL`; `supabase db push`; migration apply; any persist/publish/eval/snapshot/fresh-reader **call**.
3. **Order + stop:** run HV1-0 → HV1-10 in order. **STOP** on any **FAIL**. Do not treat empty result sets as PASS — use §C cardinalities.
4. **Identity gate:** HV1-0 must **PASS** against the pre-declared project pin before HV1-1+.
5. **Table gate:** HV1-8b / HV1-9 require HV1-2 **and** HV1-8a all `PRESENT`. Otherwise **STOP** (relation errors are **FAIL**, never PASS).
6. **No secrets / dumps:** counts and catalog metadata only; no `SELECT *` of merchant rows; do not paste credentials into evidence notes.
7. **Eligibility/workers untouched:** this pack never enables workers, clears gates, or publishes.

### B.0 — Session identity (must match intended project)

**Pre-declare** before running: `intended_env` = Preview|Production, plus expected `database` / project ref / server identity from the console.

```sql
-- HV1-0 Identity (catalog/session only; read-only)
select
  current_database() as database,
  current_user as db_user,
  inet_server_addr() as server_addr,
  inet_server_port() as server_port,
  version() as pg_version;
```

**STOP** if identity does not match the pre-declared pin. If `server_addr` is null, require console project-ref confirmation; score **UNKNOWN** until confirmed, not PASS.

### B.1 — Required M6 migrations (exactly eight)

```sql
-- HV1-1a Required M6 migration versions (expect exactly 8 rows)
select version
from supabase_migrations.schema_migrations
where version in (
  '20261030100000',
  '20261030110000',
  '20261030120000',
  '20261030130000',
  '20261030140000',
  '20261030150000',
  '20261030160000',
  '20261030200000'
)
order by 1;
```

```sql
-- HV1-1b Optional M7 adjacency versions (informational; not required for M6 HV1 PASS)
select version
from supabase_migrations.schema_migrations
where version in (
  '20261031100000',
  '20261031120000',
  '20261031130000'
)
order by 1;
```

### B.2 — Core tables exist

```sql
-- HV1-2 Forecast / evaluation tables (expect exactly 6 rows)
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'forecast_runs',
    'sku_forecasts',
    'sku_forecast_publications',
    'sku_forecast_current',
    'forecast_evaluation_runs',
    'forecast_evaluation_model_scores'
  )
order by 1;
```

**STOP** if row count ≠ 6 before any table-body query (HV1-8b / HV1-9).

### B.3 — Hard-false + source-token CHECKs

```sql
-- HV1-3 CHECK constraints (expect exactly 6 named rows)
select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'c'
  and conname in (
    'sku_forecast_publications_m7_eligible_false',
    'sku_forecast_publications_no_freshness_claim',
    'sku_forecast_publications_source_token_check',
    'sku_forecast_current_source_token_check',
    'forecast_runs_source_token_check',
    'forecast_evaluation_runs_trust_hard_false_check'
  )
order by 1, 2;
```

Empty / partial result = **FAIL** (missing objects are not PASS).

### B.4 — RLS enabled

```sql
-- HV1-4 RLS flags (expect exactly 6 rows; rls_enabled must be true)
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'forecast_runs',
    'sku_forecasts',
    'sku_forecast_publications',
    'sku_forecast_current',
    'forecast_evaluation_runs',
    'forecast_evaluation_model_scores'
  )
order by 1;
```

### B.5 — Table privileges (anon / authenticated / service_role)

```sql
-- HV1-5 Table ACLs (catalog only; expect SELECT-only for authenticated+service_role; no write)
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

### B.6 — Critical RPC security posture (catalog only — does **not** execute RPCs)

```sql
-- HV1-6 Forecast RPC DEFINER / search_path / EXECUTE (expect exactly 5 functions)
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  coalesce(p.proconfig::text, '') as config,
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

**Expected identity args (local HEAD):**

| proname | args |
|---|---|
| `forecast_sku_demand_source_snapshot` | `p_organization_id uuid, p_store_id uuid, p_location_id uuid, p_variant_id uuid, p_forecast_as_of date, p_lookback_days integer` |
| `persist_forecast_sku_demand_result` | `p_organization_id uuid, p_store_id uuid, p_location_id uuid, p_variant_id uuid, p_forecast_as_of date, p_lookback_days integer, p_source_token text, p_payload jsonb` |
| `publish_sku_forecast` | `p_forecast_run_id uuid` |
| `read_fresh_published_sku_forecast` | `p_organization_id uuid, p_store_id uuid, p_location_id uuid, p_variant_id uuid` |
| `persist_forecast_evaluation_result` | `p_organization_id uuid, p_store_id uuid, p_location_id uuid, p_variant_id uuid, p_payload jsonb` |

Fewer than 5 rows = **FAIL** (missing RPC), not PASS.

### B.7 — Publication uniqueness / grain indexes (existence)

```sql
-- HV1-7 Key indexes (expect exactly 4 rows)
-- NOTE: PK index name is constraint name sku_forecast_current_pk (not *_pkey)
select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'sku_forecast_publications',
    'sku_forecast_current',
    'forecast_evaluation_runs'
  )
  and indexname in (
    'sku_forecast_publications_published_run_uidx',
    'sku_forecast_publications_grain_created_idx',
    'sku_forecast_current_pk',
    'forecast_evaluation_runs_idempotency_uidx'
  )
order by tablename, indexname;
```

### B.8 — Existence gate + row posture (counts only)

```sql
-- HV1-8a Existence gate (catalog only; expect 6 × PRESENT)
-- STOP before HV1-8b/HV1-9 if any MISSING
select
  v.table_name,
  case
    when to_regclass(format('public.%I', v.table_name)) is null then 'MISSING'
    else 'PRESENT'
  end as status
from (
  values
    ('forecast_runs'),
    ('sku_forecasts'),
    ('sku_forecast_publications'),
    ('sku_forecast_current'),
    ('forecast_evaluation_runs'),
    ('forecast_evaluation_model_scores')
) as v(table_name)
order by 1;
```

```sql
-- HV1-8b Row counts (metadata posture only; NO SELECT * / NO row dumps)
-- Run ONLY if HV1-2 and HV1-8a are all PRESENT
select 'forecast_runs' as table_name, count(*)::bigint as n from public.forecast_runs
union all
select 'sku_forecasts', count(*) from public.sku_forecasts
union all
select 'sku_forecast_publications', count(*) from public.sku_forecast_publications
union all
select 'sku_forecast_current', count(*) from public.sku_forecast_current
union all
select 'forecast_evaluation_runs', count(*) from public.forecast_evaluation_runs
union all
select 'forecast_evaluation_model_scores', count(*) from public.forecast_evaluation_model_scores
order by 1;
```

### B.9 — Impossible eligibility incident scan

```sql
-- HV1-9 P0 incident probe (counts only; run ONLY if HV1-8a all PRESENT)
select count(*)::bigint as m7_eligible_true_rows
from public.sku_forecast_publications
where m7_eligible is distinct from false;

select count(*)::bigint as freshness_claim_true_rows
from public.sku_forecast_publications
where persist_claims_post_commit_freshness is distinct from false;

select count(*)::bigint as eval_trust_true_rows
from public.forecast_evaluation_runs
where claims_production_approval
   or claims_m7_numeric_eligibility
   or algorithm_approved;
```

Relation “does not exist” errors here = **FAIL** (skipped gate), never PASS.

### B.10 — Optional M7 adjacency CHECKs (safe if table absent)

```sql
-- HV1-10 M7.2 forecast binding hard-false (optional)
-- If inventory_actions missing → table_present=false, constraint cols null → UNKNOWN/SKIP
-- Do NOT score as PASS for M7 adjacency unless both named CHECKs appear
select
  to_regclass('public.inventory_actions') is not null as table_present,
  c.conname,
  case
    when c.oid is null then null
    else pg_get_constraintdef(c.oid)
  end as definition
from (select 1) as _
left join pg_constraint c
  on to_regclass('public.inventory_actions') is not null
 and c.conrelid = to_regclass('public.inventory_actions')
 and c.contype = 'c'
 and c.conname in (
   'inventory_actions_forecast_run_null',
   'inventory_actions_trust_hard_false'
 )
order by 2 nulls first;
```

### B.11 — Explicit non-goals (do **not** run)

- `select publish_sku_forecast(...)`
- `select persist_forecast_sku_demand_result(...)`
- `select persist_forecast_evaluation_result(...)`
- `select forecast_sku_demand_source_snapshot(...)` (any invocation)
- `select read_fresh_published_sku_forecast(...)` (any invocation)
- Any `INSERT`/`UPDATE`/`DELETE`/`DO`/`SET`/`CALL`/DDL
- Worker ENABLE flips, cron, Vercel deploy, PE1.c publish, eligibility activation

---

## C. Expected safe results — PASS / FAIL / UNKNOWN

| Query | PASS | FAIL | UNKNOWN |
|---|---|---|---|
| **HV1-0** | Pre-declared pin matches `database` (+ server/project ref) | Wrong env / mismatch → **STOP** | `server_addr` null without console project-ref proof |
| **HV1-1a** | Exactly **8** M6 versions listed | `<8` or wrong versions | `schema_migrations` unreadable (ops/permissions) |
| **HV1-1b** | N/A for M6 PASS | N/A | Absent M7 rows = optional skip; present = note only |
| **HV1-2** | Exactly **6** tables | `<6` → **STOP** before HV1-8b/9 | — |
| **HV1-3** | Exactly **6** named CHECKs; defs match §A.3 hard-false / hex32 | Missing/altered/partial rows | — |
| **HV1-4** | Exactly **6** rows; all `rls_enabled = true` | Any false/missing row | — |
| **HV1-5** | authenticated+service_role have SELECT only; no INSERT/UPDATE/DELETE for anon/authenticated/service_role/public | Any write grant; unexpected anon table DML/DDL | Empty ACL view for expected grantees (investigate; do not PASS) |
| **HV1-6** | Exactly **5** RPCs; args match table above; `security_definer=true`; `search_path` empty in `config`; `sr_exec=true`; `anon_exec=false`; `auth_exec=false` | Missing RPC, wrong args, non-DEFINER, bad search_path, anon/auth EXECUTE | — |
| **HV1-7** | Exactly **4** indexes including `sku_forecast_current_pk` | Missing/renamed index (incl. wrong `*_pkey`) | — |
| **HV1-8a** | 6 × `PRESENT` | Any `MISSING` → **STOP** | — |
| **HV1-8b** | `n = 0` **or** non-zero with written canary-only inventory | Relation error (gate skipped) | Non-zero without inventory → treat as **FAIL-to-inventory** (P1) before PE1.c |
| **HV1-9** | All three counts `0` | Any `>0` (**P0 incident**) or relation error | — |
| **HV1-10** | `table_present=true` **and** both named CHECKs present with null/`false` hard-false defs | Wrong/missing CHECK while claiming M7 adjacency | `table_present=false` or not claiming adjacency → **SKIP/UNKNOWN** (not M6 PASS) |

**Certification PASS rule:** HV1-0 PASS + HV1-1a PASS + HV1-2…HV1-7 PASS + HV1-8a PASS + HV1-9 PASS.
**HV1-8b** zero-or-inventoried required before PE1.c planning.
**HV1-1b / HV1-10** do not block M6 schema certification.
Empty result where cardinality > 0 expected = **FAIL**, never silent PASS.
Historical handoff “rows=0” is **not** a substitute for HV1-8b.

---

## D. P0 / P1 discrepancy matrix (post-evidence)

### D.1 P0 — block full readiness / PE1.c / production eligibility

| ID | Status | Notes |
|---|---|---|
| HV1-P0-1 | **CLEARED** (schema/metadata pack) | Owner executed SELECT-only pack; results in §H |
| HV1-P0-2 | **CLEARED** | All 8 required M6 migrations present |
| HV1-P0-3 | **CLEARED** (constraint presence) | Hard-false / freshness / token CHECKs present as named |
| HV1-P0-4 | **CLEARED** (constraint presence) | Evaluation trust hard-false CHECK present |
| HV1-P0-5 | **CLEARED** (EXECUTE / DEFINER / search_path flags) | Five RPCs match expected metadata posture |
| HV1-P0-6 | **CLEARED** (RLS **enabled** flag) | All six tables `relrowsecurity=true`; FORCE RLS false |
| HV1-P0-7 | **CLEARED** (row probe) | Eval trust-true count = 0; publication tables empty (zero rows) |
| HV1-P0-8 | **OPEN** | Project identity **UNVERIFIED** — separate pin confirmation required |
| HV1-P0-9 | **OPEN** | Live worker/cron/ENABLE **UNKNOWN** |
| HV1-P0-10 | **OPEN** | Production eligibility / PE1.c policy still **NO-GO** |
| HV1-P0-11 | **OPEN** | RLS **policy semantics** + RPC **body** authorization unproven by metadata pack |

### D.2 P1 — before controlled canary publish planning

| ID | Status | Notes |
|---|---|---|
| HV1-P1-1 | **CLEARED** for zero-row posture | All six forecast tables `n = 0` |
| HV1-P1-2 | **OPEN / UNKNOWN** | Optional M7 migrations none; `inventory_actions` absent — adjacency not claimed |
| HV1-P1-3 | **PARTIAL** | Live schema/metadata re-proven; project pin still UNVERIFIED |
| HV1-P1-4 | **OPEN** | Correction-outbox / evidence RPC deep grant matrix not in pack |
| HV1-P1-5 | **OPEN** | Canary UUID / store IANA timezone still `POLICY_DECISION_REQUIRED` |
| HV1-P1-6 | **OPEN** | Metric worker ENABLE / M5 E.4 leftover grain — console/ops |
| HV1-P1-7 | **OPEN** | No hosted forecast lifecycle (persist→publish→fresh-read) or accuracy evidence |
| HV1-P1-8 | **OPEN** | Remaining PE1.b/PE1.b.2 production eligibility decisions unresolved |

---

## E. Environment / project identity verification procedure

1. **Choose target explicitly** before opening SQL editor: Preview vs Production. Prefer Preview for first HV1 pass (PE1.b Option B/C isolation posture).
2. Confirm console project ref / URL matches the intended environment (do **not** paste secrets into this doc).
3. Run **HV1-0**; compare `current_database()`, `current_user`, `inet_server_addr()` to the expected pin record (operator runbook note).
4. If mismatch → **STOP**. Do not run HV1-1+.
5. Separately (console, not SQL): confirm forecast workers/cron absent; metric `*_WORKER_ENABLED` ≠ `1`; no Vercel forecast cron. Record UNKNOWN if not inspected.
6. Do not treat local `.env.local` (`127.0.0.1`) as hosted proof (HR2 pattern).

**Historical project ref cited in HR2:** `qlsqminsfdntpqdkhxjx` — re-confirm; do not assume still correct.

---

## F. Hosted execution instructions for owner approval

### F.1 Preconditions (owner)

- [ ] Explicit approval to run **read-only** HV1 pack on a named environment
- [ ] Operator understands §B.11 forbidden RPCs
- [ ] Results will be pasted into a dated operator evidence note (not committed with secrets)
- [ ] No PE1.c / publish / eligibility activation implied by a green pack

### F.2 Execution steps

1. Pin environment (§E); write intended `database` / project ref **before** HV1-0.
2. Open Supabase SQL editor (or `psql`) as a role that can read `pg_catalog` / `supabase_migrations` / `public` metadata. Do not paste secrets into evidence.
3. Execute in order: **HV1-0 → HV1-1a → HV1-1b → HV1-2 → HV1-3 → HV1-4 → HV1-5 → HV1-6 → HV1-7 → HV1-8a → (only if 8a PASS) HV1-8b → HV1-9 → HV1-10**.
4. **STOP** immediately on HV1-0 FAIL, HV1-2 FAIL, HV1-8a FAIL, or any other §C **FAIL**. Never continue to table-body counts after a missing-table gate.
5. For each query, record: timestamp, row cardinality / key values, **PASS/FAIL/UNKNOWN** vs §C. Empty-where-rows-expected = FAIL.
6. If any **P0** fail → file discrepancy; do not invoke publish/persist/eval/snapshot/reader RPCs.
7. If certification PASS rule in §C met → mark `HOSTED_SELECT_PACK` **VERIFIED** for that project pin + date; PE1.c still needs separate policy decisions + approval.

### F.3 What a green pack does **not** authorize

- Production forecast persistence/publication/evaluation callers
- Clearing `M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED`
- Relaxing `m7_eligible=false`
- Canary UUID selection / algorithm approval / age SLA numbers
- Worker ENABLE, cron, M7.2 `forecast_run_id`, M7.3 merchant success

---

## G. GO / NO-GO matrix

| Action | Decision |
|---|---|
| Accept HV1 pack preparation + safety audit | **GO** (docs) |
| Record owner SELECT evidence as scope-limited schema/metadata **PASS** (§H) | **GO** |
| Claim project identity verified | **NO-GO** (UNVERIFIED) |
| Claim full hosted forecast readiness / production readiness | **NO-GO** |
| Claim RLS policy semantics or RPC bodies proven | **NO-GO** |
| Claim workers/cron OFF from this pack | **NO-GO** (UNKNOWN) |
| Production publish / eligibility activation / PE1.c | **NO-GO** |
| Mutating RPC smoke tests / DDL/DML / migration apply | **NO-GO** |
| Workers / cron / E4 / AI / purchasing / PB1/M7 flips | **NO-GO** |
| Proceed to PE1.c | **NO-GO** until identity pin + policy decisions + separate approval |

---

## H. Owner SELECT-pack evidence closeout (2026-11-05)

**Source:** Owner-executed reviewed HV1 SELECT-only pack on remote Supabase.
**Agent session:** records evidence only; does **not** re-execute SQL; does **not** invent project identity.

### H.0 Project identity

| Field | Result |
|---|---|
| HV1-0 / console project pin | **UNVERIFIED** |
| Intended Preview vs Production | **Not confirmed in this closeout** |
| Action required | Separate identity confirmation per §E before any PE1.c or env-specific claims |

Do **not** backfill historical project refs as proven for this run.

### H.1 Evidence matrix

| Check | Observed | Verdict |
|---|---|---|
| HV1-1a Required M6 migrations | All **8** present | **PASS** |
| HV1-1b Optional M7 migrations | **None** returned | **UNKNOWN/SKIP** (adjacency not claimed) |
| HV1-2 Six forecast tables | All **present** | **PASS** |
| HV1-3 Six expected CHECK constraints | All **present** | **PASS** (presence; defs as returned by owner pack) |
| HV1-4 RLS enabled | Enabled on all **six**; **FORCE RLS = false** | **PASS** (flag only) |
| HV1-6 Five forecast RPCs | `SECURITY DEFINER`; empty `search_path`; `service_role` EXECUTE **true**; anon/auth EXECUTE **false** | **PASS** (metadata only) |
| HV1-7 Four expected indexes | All **present** | **PASS** |
| HV1-8b Row counts | All **six** tables **zero** rows | **PASS** |
| HV1-9 Eval production-trust-true rows | **Zero** | **PASS** |
| HV1-10 `inventory_actions` | **Absent** | **UNKNOWN/SKIP** (optional M7) |

### H.2 Scope-limited verdict

**PASS — hosted M6 schema/metadata SELECT posture** for migrations, table presence, named CHECKs, RLS enabled flags, RPC DEFINER/search_path/EXECUTE grants, expected indexes, and zero-row / zero trust-true probes.

**This PASS does not include:**

| Area | Status |
|---|---|
| Project / environment identity | **UNVERIFIED** |
| RLS **policy** correctness (member predicates, bypass paths) | **UNPROVEN** |
| RPC **function bodies** / runtime authorization beyond EXECUTE grants | **UNPROVEN** |
| Live worker / cron / ENABLE configuration | **UNKNOWN** |
| Hosted forecast lifecycle (persist→publish→fresh-read) | **NO EVIDENCE** |
| Forecast accuracy / evaluation quality | **NO EVIDENCE** |
| Production eligibility attestation / PE1.c / PB1 gate clear | **NO-GO / unresolved policy** |

`HOSTED_SELECT_PACK_UNVERIFIED` may be considered **cleared for schema/metadata** on the **unidentified** remote target only after identity is separately pinned; until HV1-0 is verified, env-specific certification remains **incomplete**.

### H.3 Remaining blockers (summary)

**P0 still open:** identity pin (P0-8); workers/cron UNKNOWN (P0-9); production eligibility / PE1.c (P0-10); RLS/RPC semantic proof (P0-11).
**P1 still open:** M7 adjacency absent (if later claimed); deep grant matrix; canary UUID/TZ; metric leftover grain; lifecycle/accuracy evidence; PE1 policy decisions.

---

## Freeze checklist

- [x] HEAD `38a7b31` verified; dirty tree preserved aside from this file
- [x] Required M6 migration versions inventoried from repo
- [x] Tables / CHECKs / RLS / grants / DEFINER RPCs / source-token + grain protections listed from local SQL
- [x] Numbered SELECT-only pack with expected results + failure meanings
- [x] Final safety audit: read-only, no RPC invocation, identity/table stop gates, cardinality FAIL rules, PK index name fix
- [x] Owner SELECT evidence recorded (§H); project identity left **UNVERIFIED**
- [x] Schema/metadata PASS distinguished from unproven RLS/RPC semantics, workers, lifecycle, eligibility
- [x] Remaining P0/P1 + GO/NO-GO updated
- [ ] Project identity separately confirmed
- [ ] Production forecast operation — **not authorized**

**M6-HV1 schema/metadata evidence CLOSEOUT COMPLETE (scope-limited PASS).**
**STOP.** No production eligibility, PE1.c, workers, or identity claim.
