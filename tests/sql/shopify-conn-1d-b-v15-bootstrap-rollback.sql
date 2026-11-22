-- SHOPIFY-CONN-1d-B — remove only V8 test bootstrap fixtures/objects.
-- Leaves M2.6 integrations, CONN-1a vault tables, α/β RPCs intact.

\set ON_ERROR_STOP on

\echo '=== CONN-1d-B V8 bootstrap rollback ==='

-- Fixture rows first (FK order)
delete from public.integration_credentials
where organization_id in (
  'c01d0b00-0000-4000-8000-000000000001'::uuid,
  'c01d0b00-0000-4000-8000-000000000011'::uuid
);

delete from public.integration_external_accounts
where organization_id in (
  'c01d0b00-0000-4000-8000-000000000001'::uuid,
  'c01d0b00-0000-4000-8000-000000000011'::uuid
);

delete from public.organization_members
where organization_id in (
  'c01d0b00-0000-4000-8000-000000000001'::uuid,
  'c01d0b00-0000-4000-8000-000000000011'::uuid
)
  or user_id in (
    'c01d0b00-0000-4000-8000-0000000000a1'::uuid,
    'c01d0b00-0000-4000-8000-0000000000a2'::uuid,
    'c01d0b00-0000-4000-8000-0000000000b1'::uuid,
    'c01d0b00-0000-4000-8000-0000000000c1'::uuid
  );

delete from public.integrations
where id in (
  'c01d0b00-0000-4000-8000-000000000003'::uuid,
  'c01d0b00-0000-4000-8000-000000000013'::uuid
);

delete from public.stores
where id in (
  'c01d0b00-0000-4000-8000-000000000002'::uuid,
  'c01d0b00-0000-4000-8000-000000000012'::uuid
);

delete from public.organizations
where id in (
  'c01d0b00-0000-4000-8000-000000000001'::uuid,
  'c01d0b00-0000-4000-8000-000000000011'::uuid
);

delete from auth.users
where id in (
  'c01d0b00-0000-4000-8000-0000000000a1'::uuid,
  'c01d0b00-0000-4000-8000-0000000000a2'::uuid,
  'c01d0b00-0000-4000-8000-0000000000b1'::uuid,
  'c01d0b00-0000-4000-8000-0000000000c1'::uuid
);

-- Drop test-only policies created by V8 bootstrap (not product migrations on this DB)
drop policy if exists integrations_select_member
  on public.integrations;

drop policy if exists organization_members_select_self
  on public.organization_members;

-- Drop test-only membership table created by bootstrap on disposable DB.
-- Safe: CONN-1a disposable baseline never shipped organization_members.
drop table if exists public.organization_members;

-- Keep auth.users stub (empty) — harmless; do not drop auth schema/auth.uid.

DO $$
BEGIN
  IF to_regclass('public.integrations') IS NULL THEN
    RAISE EXCEPTION 'rollback damaged public.integrations';
  END IF;
  IF to_regclass('public.integration_credentials') IS NULL THEN
    RAISE EXCEPTION 'rollback damaged public.integration_credentials';
  END IF;
  IF to_regprocedure(
    'public.load_integration_credential_envelope(uuid,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'rollback damaged α load RPC';
  END IF;
  IF to_regprocedure(
    'public.acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'rollback damaged β acquire RPC';
  END IF;
  IF to_regclass('public.organization_members') IS NOT NULL THEN
    RAISE EXCEPTION 'organization_members should be dropped by V8 rollback';
  END IF;
END;
$$;

\echo 'V15 CONN-1d-B V8 bootstrap rollback PASS'
