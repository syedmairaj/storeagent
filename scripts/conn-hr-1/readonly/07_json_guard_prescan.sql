-- CONN-HR-1 read-only preflight 07 — counts-only existing-row scan mirroring
-- public.conn_1d_e_reject_secret_json() from 20261124120000.
-- SELECT-only. Parameter-free. Outputs counts per column only; never a value,
-- key, row id or organization id.
--
-- Advisory: the migration's own scan is authoritative. Parity of the predicate
-- block below with the real trigger function is proven on the disposable
-- cluster by scripts/conn-hr-1/disposable/prescan-parity.sql, which reuses the
-- exact text between the PREDICATE markers. Any violating_rows > 0 is a STOP;
-- remediating stored data needs separate owner approval.

with src (source_column, v) as (
  select 'integrations.configuration', i.configuration
  from public.integrations as i
  where i.configuration is not null
  union all
  select 'provider_bindings.source_metadata', pb.source_metadata
  from public.provider_bindings as pb
  where pb.source_metadata is not null
  union all
  select 'sync_runs.error_summary', sr.error_summary
  from public.sync_runs as sr
  where sr.error_summary is not null
  union all
  select 'sync_runs.reconciliation_metadata', sr.reconciliation_metadata
  from public.sync_runs as sr
  where sr.reconciliation_metadata is not null
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
  e.source_column,
  pg_catalog.count(*) as non_null_rows,
  pg_catalog.count(*) filter (where e.too_large or e.too_deep or e.bad_key or e.bad_string)
    as violating_rows,
  pg_catalog.count(*) filter (where e.too_large) as too_large_rows,
  pg_catalog.count(*) filter (where e.too_deep) as too_deep_rows,
  pg_catalog.count(*) filter (where e.bad_key) as bad_key_rows,
  pg_catalog.count(*) filter (where e.bad_string) as bad_string_rows
from evaluated as e
group by e.source_column
order by e.source_column;
