-- M5.6E.4 HOSTED-SAFE fixture creation (also used after local teardown).
--
-- INSERT-ONLY. No table alterations, no trigger toggles, no DELETE,
-- no TRUNCATE, no UPDATE of merchant rows.
--
-- Fails closed if the allow-listed canary organization already exists
-- (immutable snapshots cannot be safely removed on hosted).
--
-- Fixed as_of / metric_date: 2026-06-15T12:00:00+00 / 2026-06-15 (UTC store).
--
-- Usage:
--   psql ... -v ON_ERROR_STOP=1 -f scripts/m5-6e4/canary-fixture-hosted-create.sql

begin;

do $$
begin
  if exists (
    select 1
    from public.organizations
    where id = 'e46e4000-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception
      using
        errcode = 'P0001',
        message = 'm56e4 canary organization already exists; refuse hosted-safe create';
  end if;
end
$$;

insert into public.organizations (
  id, name, default_currency, timezone
) values (
  'e46e4000-0000-4000-8000-000000000001'::uuid,
  'm56e4-canary-20260615-fixture',
  'USD',
  'UTC'
);

insert into public.stores (
  id, organization_id, name, status, currency, timezone
) values (
  'e46e4000-0000-4000-8000-000000000002'::uuid,
  'e46e4000-0000-4000-8000-000000000001'::uuid,
  'm56e4-canary-store',
  'active',
  'USD',
  'UTC'
);

insert into public.locations (
  id, organization_id, store_id, name, status
) values (
  'e46e4000-0000-4000-8000-000000000003'::uuid,
  'e46e4000-0000-4000-8000-000000000001'::uuid,
  'e46e4000-0000-4000-8000-000000000002'::uuid,
  'm56e4-canary-location',
  'active'
);

insert into public.products (
  id, organization_id, store_id, title, status
) values (
  'e46e4000-0000-4000-8000-000000000004'::uuid,
  'e46e4000-0000-4000-8000-000000000001'::uuid,
  'e46e4000-0000-4000-8000-000000000002'::uuid,
  'm56e4-canary-product',
  'active'
);

insert into public.product_variants (
  id, organization_id, store_id, product_id, sku, status
) values (
  'e46e4000-0000-4000-8000-000000000005'::uuid,
  'e46e4000-0000-4000-8000-000000000001'::uuid,
  'e46e4000-0000-4000-8000-000000000002'::uuid,
  'e46e4000-0000-4000-8000-000000000004'::uuid,
  'M56E4-CANARY-SKU',
  'active'
);

insert into public.inventory_snapshots (
  organization_id,
  store_id,
  location_id,
  variant_id,
  observed_at,
  available_quantity,
  source
) values (
  'e46e4000-0000-4000-8000-000000000001'::uuid,
  'e46e4000-0000-4000-8000-000000000002'::uuid,
  'e46e4000-0000-4000-8000-000000000003'::uuid,
  'e46e4000-0000-4000-8000-000000000005'::uuid,
  '2026-06-15T12:00:00+00'::timestamptz,
  7,
  'csv'
);

commit;

select 'fixture_org' as check, count(*)::text as value
from public.organizations
where id = 'e46e4000-0000-4000-8000-000000000001'::uuid
union all
select 'unconsumed_events', count(*)::text
from public.sku_daily_metric_source_events
where organization_id = 'e46e4000-0000-4000-8000-000000000001'::uuid
  and consumed_at is null
  and source_date = '2026-06-15'::date
union all
select 'frozen_as_of', '2026-06-15T12:00:00+00';
