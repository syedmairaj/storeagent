-- CONN-HR-1 read-only preflight 09 — active workload, locks, data volume and
-- worker / cron / SyncRun activation gates.
-- SELECT-only. Parameter-free. Counts and role names only; no query text,
-- client addresses or row values.
-- cron.job and net.http_request_queue may not exist; they are read through
-- query_to_xml with constant count(*) queries only when to_regclass finds them.

select
  pg_catalog.count(*) as other_client_sessions,
  pg_catalog.count(*) filter (where a.state = 'active') as active_sessions,
  pg_catalog.count(*) filter (where a.state like 'idle in transaction%') as idle_in_transaction,
  pg_catalog.count(*) filter (where a.xact_start < pg_catalog.now() - interval '1 minute')
    as transactions_older_than_1m,
  pg_catalog.count(*) filter (where a.wait_event_type = 'Lock') as waiting_on_locks
from pg_catalog.pg_stat_activity as a
where a.datname = pg_catalog.current_database()
  and a.pid <> pg_catalog.pg_backend_pid()
  and a.backend_type = 'client backend';

select
  coalesce(a.usename::text, '<none>') as role_name,
  pg_catalog.count(*) as sessions,
  pg_catalog.count(*) filter (where a.state <> 'idle') as non_idle_sessions
from pg_catalog.pg_stat_activity as a
where a.datname = pg_catalog.current_database()
  and a.pid <> pg_catalog.pg_backend_pid()
  and a.backend_type = 'client backend'
group by 1
order by 1;

select
  c.relname as table_name,
  l.mode as lock_mode,
  l.granted,
  pg_catalog.count(*) as lock_count
from pg_catalog.pg_locks as l
join pg_catalog.pg_class as c on c.oid = l.relation
where l.pid <> pg_catalog.pg_backend_pid()
  and c.oid in (
    pg_catalog.to_regclass('public.integrations'),
    pg_catalog.to_regclass('public.provider_bindings'),
    pg_catalog.to_regclass('public.sync_runs'),
    pg_catalog.to_regclass('supabase_migrations.schema_migrations')
  )
group by 1, 2, 3
order by 1, 2, 3;

-- Size of what 20261124120000 locks and scans.
select
  c.relname as table_name,
  pg_catalog.pg_total_relation_size(c.oid) as total_bytes,
  c.reltuples::bigint as estimated_rows
from pg_catalog.pg_class as c
where c.oid in (
  pg_catalog.to_regclass('public.integrations'),
  pg_catalog.to_regclass('public.provider_bindings'),
  pg_catalog.to_regclass('public.sync_runs')
)
order by 1;

select
  (select pg_catalog.count(*) from public.integrations) as integrations_rows,
  (select pg_catalog.count(*) from public.provider_bindings) as provider_bindings_rows,
  (select pg_catalog.count(*) from public.sync_runs) as sync_runs_rows;

select s.status as sync_run_status, pg_catalog.count(*) as runs,
       pg_catalog.count(*) filter (where s.started_at < pg_catalog.now() - interval '1 hour')
         as started_over_1h_ago
from public.sync_runs as s
group by 1
order by 1;

select
  exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') as pg_cron_installed,
  case when pg_catalog.to_regclass('cron.job') is not null then
    (pg_catalog.xpath('/row/n/text()',
      pg_catalog.query_to_xml('select count(*) as n from cron.job where active', false, true, ''))
    )[1]::text::bigint
  end as active_cron_jobs,
  exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') as pg_net_installed,
  case when pg_catalog.to_regclass('net.http_request_queue') is not null then
    (pg_catalog.xpath('/row/n/text()',
      pg_catalog.query_to_xml('select count(*) as n from net.http_request_queue', false, true, ''))
    )[1]::text::bigint
  end as queued_http_requests;
