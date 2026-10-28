-- M5.6E.4 LOCAL-ONLY teardown for the allow-listed canary organization.
--
-- FORBIDDEN ON HOSTED: ALTER TABLE ... DISABLE/ENABLE TRIGGER is table-wide
-- and must never run against a shared production database.
--
-- Usage (local native Supabase only):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 55322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/m5-6e4/canary-fixture-local-teardown.sql

begin;

delete from public.sku_daily_metric_rollover_enqueues
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid;
delete from public.sku_daily_metric_rollover_runs
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid;
delete from public.sku_daily_metric_recompute_requests
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid;
delete from public.sku_daily_metrics
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid;
delete from public.sku_daily_metric_source_events
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid;

-- LOCAL ONLY: inventory_snapshots are immutable; delete protection is
-- table-wide, so this must never be copied into a hosted runbook step.
alter table public.inventory_snapshots
  disable trigger inventory_snapshots_prevent_delete;
delete from public.inventory_snapshots
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid;
alter table public.inventory_snapshots
  enable trigger inventory_snapshots_prevent_delete;

delete from public.product_variants
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid;
delete from public.products
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid;
delete from public.locations
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid;
delete from public.stores
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid;
delete from public.organizations
where id = 'e46e4000-0000-4000-8000-000000000001'::uuid;

commit;
