-- CONN-HR-1 disposable prescan parity — DISPOSABLE ONLY.
--
-- Proves that the predicate block in
-- scripts/conn-hr-1/readonly/07_json_guard_prescan.sql matches
-- public.conn_1d_e_reject_secret_json() on a corpus of planted values.
-- Refuses to run outside the CONN-HR-1 disposable cluster.
--
-- Requires: five CONN migrations already applied (guard function present).
-- Leaves no permanent rows: all work is in a transaction that ROLLs BACK,
-- using a TEMP table + the real trigger function.

\set ON_ERROR_STOP on

do $guard$
begin
  if current_setting('cluster_name') is distinct from 'storeagent-conn-hr-1-disposable' then
    raise exception 'CONN-HR-1 prescan parity refused: not the disposable cluster';
  end if;
  if pg_catalog.to_regprocedure('public.conn_1d_e_reject_secret_json()') is null then
    raise exception 'CONN-HR-1 prescan parity refused: guard function missing (apply CONN first)';
  end if;
end;
$guard$;

begin;

create temporary table conn_hr_1_prescan_cases (
  case_id text primary key,
  expect_reject boolean not null,
  payload jsonb not null
) on commit drop;

-- Corpus: accept / reject pairs covering size, depth, keys, string classes.
insert into conn_hr_1_prescan_cases (case_id, expect_reject, payload) values
  ('ok_empty_object', false, '{}'::jsonb),
  ('ok_purpose', false, '{"purpose":"csv_import","configuredBy":"merchant"}'::jsonb),
  ('ok_token_kind_exempt', false, '{"token_kind":"offline_expiring"}'::jsonb),
  ('ok_key_version_exempt', false, '{"key_version":1}'::jsonb),
  ('bad_access_token_key', true, '{"access_token":"x"}'::jsonb),
  ('bad_refresh_token_key', true, '{"refreshToken":"x"}'::jsonb),
  ('bad_api_key_key', true, '{"apiKey":"x"}'::jsonb),
  ('bad_client_secret_key', true, '{"client_secret":"x"}'::jsonb),
  ('bad_shpat_value', true, '{"note":"shpat_abc123"}'::jsonb),
  ('bad_bearer_value', true, '{"note":"Bearer abc.def"}'::jsonb),
  ('bad_jwt_value', true, '{"note":"eyJhbGciOiJIUzI1NiJ9.e30.sig"}'::jsonb),
  ('bad_basic_value', true, '{"note":"Basic dXNlcjpwYXNz"}'::jsonb),
  ('bad_stringified_token', true, '{"note":"\"access_token\": \"x\""}'::jsonb),
  ('bad_depth_9', true, '{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":1}}}}}}}}}'::jsonb),
  ('ok_depth_8', false, '{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":1}}}}}}}}'::jsonb),
  ('bad_key_chars', true, '{"bad key!":1}'::jsonb),
  ('ok_location_name', false, '{"locationName":"Main","code":"MAIN"}'::jsonb);

-- Advisory predicate (must stay byte-identical to 07_json_guard_prescan.sql
-- between the PREDICATE markers; the static unit test enforces this).
create temporary view conn_hr_1_prescan_eval as
with src (source_column, v, case_id, expect_reject) as (
  select 'case.payload', c.payload, c.case_id, c.expect_reject
  from conn_hr_1_prescan_cases as c
),
-- CONN-HR-1 PREDICATE BEGIN
evaluated as (
  select
    s.*,
    pg_catalog.octet_length(s.v::text) > 8192 as too_large,
    pg_catalog.jsonb_path_exists(s.v, 'strict $.**{9 to last}') as too_deep,
    exists (
      select 1
      from pg_catalog.jsonb_path_query(s.v, 'strict $.**') as q(node)
      cross join lateral pg_catalog.jsonb_object_keys(
        case when pg_catalog.jsonb_typeof(q.node) = 'object' then q.node else '{}'::jsonb end
      ) as k(key)
      cross join lateral (
        select pg_catalog.lower(pg_catalog.translate(k.key, '_-', '')) as folded
      ) as f
      where k.key operator(pg_catalog.!~) '^[A-Za-z][A-Za-z0-9_-]{0,63}$'
        or (
          f.folded not in ('tokenkind', 'keyversion')
          and (
            f.folded in ('session', 'accessnonce', 'refreshnonce')
            or f.folded operator(pg_catalog.~) '(token|secret|password|passwd|credential|ciphertext|authorization|cookie|bearer|apikey|privatekey|authtag|dekwrap|servicerole)'
          )
        )
        or k.key operator(pg_catalog.~*) 'shp(at|ca|pa|ss|rt)_[a-z0-9_]'
    ) as bad_key,
    exists (
      select 1
      from pg_catalog.jsonb_path_query(s.v, 'strict $.**') as q(node)
      cross join lateral (select q.node operator(pg_catalog.#>>) '{}' as t) as x
      where pg_catalog.jsonb_typeof(q.node) = 'string'
        and (
          x.t operator(pg_catalog.~*) 'shp(at|ca|pa|ss|rt)_[a-z0-9_]'
          or x.t operator(pg_catalog.~*) 'bearer[ \t\n\r\f\v]+[a-z0-9._~+/=-]'
          or x.t operator(pg_catalog.~*) 'eyj[a-z0-9_-]+\.[a-z0-9_-]+\.'
          or x.t operator(pg_catalog.~) 'Basic[ \t\n\r\f\v]+[A-Za-z0-9+/]{8,}'
          or x.t operator(pg_catalog.~*) '"(access|refresh|id)_?token"[ \t\n\r\f\v]*:'
          or x.t operator(pg_catalog.~*) '"client_?secret"[ \t\n\r\f\v]*:'
        )
    ) as bad_string
  from src as s
  where pg_catalog.jsonb_typeof(s.v) <> 'null'
)
-- CONN-HR-1 PREDICATE END
select
  e.case_id,
  e.expect_reject,
  (e.too_large or e.too_deep or e.bad_key or e.bad_string) as advisory_reject
from evaluated as e;

-- Real trigger path: temp table + same function the migration installs.
create temporary table conn_hr_1_prescan_scan (
  payload jsonb
) on commit drop;

create trigger zz_conn_1d_e_secret_json_guard
before insert on pg_temp.conn_hr_1_prescan_scan
for each row
execute function public.conn_1d_e_reject_secret_json('payload');

create temporary table conn_hr_1_prescan_trigger_result (
  case_id text primary key,
  trigger_reject boolean not null
) on commit drop;

do $run$
declare
  r record;
  rejected boolean;
begin
  for r in select case_id, payload from conn_hr_1_prescan_cases order by case_id loop
    rejected := false;
    begin
      insert into pg_temp.conn_hr_1_prescan_scan (payload) values (r.payload);
    exception
      when sqlstate 'SA011' then
        rejected := true;
    end;
    insert into conn_hr_1_prescan_trigger_result (case_id, trigger_reject)
    values (r.case_id, rejected);
  end loop;
end;
$run$;

-- Fail closed on any advisory/trigger disagreement or expected-mismatch.
do $assert$
declare
  v_bad text;
  v_n bigint;
begin
  select pg_catalog.string_agg(a.case_id, ',' order by a.case_id)
  into v_bad
  from conn_hr_1_prescan_eval as a
  join conn_hr_1_prescan_trigger_result as t using (case_id)
  where a.advisory_reject is distinct from t.trigger_reject
     or a.advisory_reject is distinct from a.expect_reject
     or t.trigger_reject is distinct from a.expect_reject;

  if v_bad is not null then
    raise exception 'CONN-HR-1 prescan parity FAIL: %', v_bad;
  end if;

  select pg_catalog.count(*) into v_n from conn_hr_1_prescan_cases;
  if v_n < 10 then
    raise exception 'CONN-HR-1 prescan parity FAIL: corpus too small (%)', v_n;
  end if;

  raise notice 'CONN-HR-1 prescan parity PASS (% cases)', v_n;
end;
$assert$;

select a.case_id, a.expect_reject, a.advisory_reject, t.trigger_reject,
       a.advisory_reject = t.trigger_reject
         and a.advisory_reject = a.expect_reject as pass
from conn_hr_1_prescan_eval as a
join conn_hr_1_prescan_trigger_result as t using (case_id)
order by a.case_id;

rollback;

\echo 'CONN-HR-1 prescan parity: PASS (rolled back)'
