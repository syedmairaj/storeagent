-- CONN-HR-1 read-only preflight 02 — migration history equivalence.
-- SELECT-only. Parameter-free. Allowlisted output fields only.
-- The optional name / statements columns are read through to_jsonb(row) so an
-- older history table shape does not error.
--
-- Expected before apply: 52 rows, max 20261110140000,
--   versions_md5 d3a7a37c1b0175595e65aa85e07f81cf, conn_versions_present 0.
-- Expected after apply: 57 rows, max 20261124120000,
--   versions_md5 900da6949dfd6f7818a454b7f28ddf33, conn_versions_present 5.

select pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null
  as history_table_present;

select
  pg_catalog.count(*) as history_rows,
  pg_catalog.min(h.version) as min_version,
  pg_catalog.max(h.version) as max_version,
  pg_catalog.md5(pg_catalog.string_agg(h.version, ',' order by h.version)) as versions_md5,
  pg_catalog.count(*) filter (where h.version > '20261110140000') as rows_after_20261110140000,
  pg_catalog.count(*) filter (
    where h.version in (
      '20261121120000', '20261122120000', '20261122130000',
      '20261122140000', '20261124120000'
    )
  ) as conn_versions_present,
  pg_catalog.count(*) filter (
    where coalesce(pg_catalog.jsonb_typeof(pg_catalog.to_jsonb(h) -> 'statements'), 'null') <> 'array'
  ) as rows_without_statements
from supabase_migrations.schema_migrations as h;

-- Per-version digest. statements_md5 is comparable only for rows written by
-- the same CLI statement splitter; rows applied through hand-written wrappers
-- (S2–S4) have no statements.
select
  h.version,
  pg_catalog.to_jsonb(h) ->> 'name' as migration_name,
  coalesce(pg_catalog.jsonb_typeof(pg_catalog.to_jsonb(h) -> 'statements'), 'null') = 'array'
    as has_statements,
  case
    when pg_catalog.jsonb_typeof(pg_catalog.to_jsonb(h) -> 'statements') = 'array'
      then pg_catalog.jsonb_array_length(pg_catalog.to_jsonb(h) -> 'statements')
  end as statement_count,
  case
    when pg_catalog.jsonb_typeof(pg_catalog.to_jsonb(h) -> 'statements') = 'array'
      then pg_catalog.md5((pg_catalog.to_jsonb(h) -> 'statements')::text)
  end as statements_md5
from supabase_migrations.schema_migrations as h
order by h.version;
