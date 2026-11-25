-- CONN-HR-1 read-only preflight 06 — publications, replication slots, event
-- triggers and BEFORE-trigger order on the three guarded tables.
-- SELECT-only. Parameter-free. Allowlisted output fields only.

-- A FOR ALL TABLES publication would publish the new vault tables: STOP.
select
  p.pubname as publication_name,
  p.puballtables as for_all_tables,
  p.pubinsert, p.pubupdate, p.pubdelete, p.pubtruncate,
  pg_catalog.pg_get_userbyid(p.pubowner) as owner_role
from pg_catalog.pg_publication as p
order by 1;

select pt.pubname as publication_name, pt.tablename as table_name
from pg_catalog.pg_publication_tables as pt
where pt.schemaname = 'public'
  and pt.tablename in (
    'integrations', 'provider_bindings', 'sync_runs',
    'integration_credentials', 'integration_external_accounts'
  )
order by 1, 2;

select
  pg_catalog.count(*) as replication_slots,
  pg_catalog.count(*) filter (where s.active) as active_replication_slots,
  pg_catalog.count(*) filter (where s.slot_type = 'logical') as logical_slots
from pg_catalog.pg_replication_slots as s;

-- Event triggers can grant or alter objects created by DDL.
select
  e.evtname as event_trigger_name,
  e.evtevent as event,
  e.evtenabled as enabled,
  pg_catalog.pg_get_userbyid(e.evtowner) as owner_role,
  e.evtfoid::pg_catalog.regproc::text as function_name
from pg_catalog.pg_event_trigger as e
order by 1;

-- User triggers on the guarded tables in firing order (byte order of name).
-- After apply the last enabled BEFORE INSERT/UPDATE row trigger must be
-- zz_conn_1d_e_secret_json_guard on all three tables.
select
  c.relname as table_name,
  t.tgname as trigger_name,
  t.tgenabled as enabled,
  (t.tgtype & 1) <> 0 as for_each_row,
  (t.tgtype & 2) <> 0 as is_before,
  (t.tgtype & 4) <> 0 as on_insert,
  (t.tgtype & 16) <> 0 as on_update,
  p.oid::pg_catalog.regprocedure::text as trigger_function
from pg_catalog.pg_trigger as t
join pg_catalog.pg_class as c on c.oid = t.tgrelid
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
join pg_catalog.pg_proc as p on p.oid = t.tgfoid
where n.nspname = 'public'
  and c.relname in ('integrations', 'provider_bindings', 'sync_runs')
  and not t.tgisinternal
order by c.relname, t.tgname collate "C";
