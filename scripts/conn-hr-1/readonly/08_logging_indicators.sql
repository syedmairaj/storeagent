-- CONN-HR-1 read-only preflight 08 — non-sensitive logging / timeout
-- indicators.
-- SELECT-only. Parameter-free. Only allowlisted setting names are returned.
-- pg_db_role_setting can hold secrets on some projects (for example a JWT
-- secret stored as a custom database setting), so its values are redacted
-- unless the setting name is on a short allowlist. Never replace this with a
-- raw setconfig select.

select s.name as setting_name, s.setting as setting_value, s.unit, s.source
from pg_catalog.pg_settings as s
where s.name in (
  'log_statement', 'log_min_duration_statement', 'log_min_duration_sample',
  'log_statement_sample_rate', 'log_transaction_sample_rate',
  'log_min_error_statement', 'log_min_messages', 'log_error_verbosity',
  'log_parameter_max_length', 'log_parameter_max_length_on_error',
  'log_duration', 'log_lock_waits', 'log_connections', 'log_disconnections',
  'track_activity_query_size', 'compute_query_id',
  'pgaudit.log', 'pgaudit.log_parameter', 'pgaudit.log_relation',
  'pgaudit.log_statement_once', 'pgaudit.role',
  'auto_explain.log_min_duration', 'auto_explain.log_parameter_max_length',
  'auto_explain.log_analyze',
  'shared_preload_libraries', 'session_preload_libraries',
  'deadlock_timeout', 'lock_timeout', 'statement_timeout',
  'idle_in_transaction_session_timeout', 'session_replication_role',
  'default_transaction_read_only', 'standard_conforming_strings',
  'max_locks_per_transaction', 'synchronous_commit', 'wal_level'
)
order by 1;

select
  coalesce(r.rolname, '<all roles>') as role_scope,
  case when d.setdatabase = 0 then '<all databases>' else 'current database' end as database_scope,
  pg_catalog.split_part(cfg, '=', 1) as setting_name,
  case
    when pg_catalog.split_part(cfg, '=', 1) in (
      'lock_timeout', 'statement_timeout', 'idle_in_transaction_session_timeout',
      'log_statement', 'log_min_duration_statement', 'log_min_error_statement',
      'search_path', 'session_replication_role', 'pgaudit.log'
    ) then pg_catalog.substr(cfg, pg_catalog.strpos(cfg, '=') + 1)
    else '<redacted>'
  end as setting_value
from pg_catalog.pg_db_role_setting as d
left join pg_catalog.pg_roles as r on r.oid = d.setrole
cross join lateral pg_catalog.unnest(d.setconfig) as cfg
where d.setdatabase in (
  0,
  (select db.oid from pg_catalog.pg_database as db where db.datname = pg_catalog.current_database())
)
order by 1, 2, 3;
