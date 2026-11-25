-- CONN-HR-1 read-only preflight 01 — PostgreSQL version, collation, extensions,
-- regex behaviour probes.
-- SELECT-only. Parameter-free. Allowlisted output fields only.
-- Version-dependent pg_database columns are read through to_jsonb(row) so a
-- missing column yields NULL instead of an error.

select
  pg_catalog.current_setting('server_version_num')::integer as server_version_num,
  pg_catalog.split_part(pg_catalog.current_setting('server_version'), ' ', 1) as server_version,
  pg_catalog.current_database() = 'postgres' as database_is_postgres,
  current_user as current_role_name,
  pg_catalog.current_setting('transaction_read_only') as transaction_read_only;

select
  pg_catalog.pg_encoding_to_char(d.encoding) as encoding,
  d.datcollate as lc_collate,
  d.datctype as lc_ctype,
  pg_catalog.to_jsonb(d) ->> 'datlocprovider' as locale_provider,
  coalesce(
    pg_catalog.to_jsonb(d) ->> 'datlocale',
    pg_catalog.to_jsonb(d) ->> 'daticulocale'
  ) as provider_locale,
  pg_catalog.to_jsonb(d) ->> 'datcollversion' as collation_version
from pg_catalog.pg_database as d
where d.datname = pg_catalog.current_database();

select
  e.extname as extension_name,
  e.extversion as extension_version,
  n.nspname as extension_schema
from pg_catalog.pg_extension as e
join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
where e.extname in (
  'plpgsql', 'pgcrypto', 'uuid-ossp', 'pg_graphql', 'pg_cron', 'pg_net',
  'pgaudit', 'pg_stat_statements', 'supabase_vault', 'pgsodium', 'pgjwt'
)
order by e.extname;

select pg_catalog.count(*) as other_extension_count
from pg_catalog.pg_extension as e
where e.extname not in (
  'plpgsql', 'pgcrypto', 'uuid-ossp', 'pg_graphql', 'pg_cron', 'pg_net',
  'pgaudit', 'pg_stat_statements', 'supabase_vault', 'pgsodium', 'pgjwt'
);

-- Synthetic probes of the 1d-E guard regex classes. Expected (disposable
-- PostgreSQL 17.11, C.UTF-8): t, t, t, t, f, f. Any difference on hosted means
-- the guard behaves differently there: STOP.
select
  'SHPAT_ABC' operator(pg_catalog.~*) 'shp(at|ca|pa|ss|rt)_[a-z0-9_]' as probe_case_fold_token,
  E'BEARER\tx' operator(pg_catalog.~*) 'bearer[ \t\n\r\f\v]+[a-z0-9._~+/=-]' as probe_bearer_tab,
  'EYJA.B.' operator(pg_catalog.~*) 'eyj[a-z0-9_-]+\.[a-z0-9_-]+\.' as probe_jwt_case_fold,
  'Basic dXNlcjpwYXNz' operator(pg_catalog.~) 'Basic[ \t\n\r\f\v]+[A-Za-z0-9+/]{8,}' as probe_basic,
  E'\u017Fhpat_a' operator(pg_catalog.~*) 'shp(at|ca|pa|ss|rt)_[a-z0-9_]' as probe_long_s_not_folded,
  E'shpat_\u212A' operator(pg_catalog.~*) 'shp(at|ca|pa|ss|rt)_[a-z0-9_]' as probe_kelvin_not_folded;
