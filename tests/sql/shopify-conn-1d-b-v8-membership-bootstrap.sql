-- SHOPIFY-CONN-1d-B — test-only membership / JWT-claim-stub bootstrap.
-- Disposable PostgreSQL ONLY. Does NOT modify product migrations.
--
-- Provenance:
--   organization_members shape → M1.3 (20261009090000)
--   organization_members grants + select-self policy → M1.5 (20261009150000)
--   integrations SELECT grant + integrations_select_member → M2.7 (20261011153000)
--     using clause copied verbatim from tracked product SQL.
--
-- Requires prior apply of CONN-1a disposable bootstrap + CONN-1a/α (β optional).

\set ON_ERROR_STOP on

\echo '=== CONN-1d-B V8 membership bootstrap (test-only) ==='

-- -----------------------------------------------------------------------------
-- Minimal auth.users stub (FK target for organization_members). Test-only.
-- -----------------------------------------------------------------------------

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

-- -----------------------------------------------------------------------------
-- organization_members (M1.3 shape) — absent from CONN-1a disposable bootstrap
-- -----------------------------------------------------------------------------

create table if not exists public.organization_members (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,

  user_id uuid not null,

  role text not null,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint organization_members_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint organization_members_user_fk
    foreign key (user_id)
    references auth.users(id)
    on delete cascade,

  constraint organization_members_role_check
    check (
      role in (
        'owner',
        'admin',
        'analyst',
        'operator'
      )
    ),

  constraint organization_members_organization_user_unique
    unique (
      organization_id,
      user_id
    )
);

alter table public.organization_members
  enable row level security;

-- M1.5 privilege boundary (tracked semantics)
revoke all
on table public.organization_members
from anon;

grant select
on table public.organization_members
to authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.organization_members
from authenticated;

drop policy if exists organization_members_select_self
  on public.organization_members;

-- Verbatim M1.5 policy body
create policy organization_members_select_self
on public.organization_members
for select
to authenticated
using (
  user_id = (select auth.uid())
);

-- -----------------------------------------------------------------------------
-- integrations browser SELECT grant + M2.7 membership policy (verbatim)
-- -----------------------------------------------------------------------------

revoke all
on table public.integrations
from anon;

grant select
on table public.integrations
to authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.integrations
from authenticated;

-- Ensure RLS remains enabled (CONN-1a disposable bootstrap already enables it)
alter table public.integrations
  enable row level security;

drop policy if exists integrations_select_member
  on public.integrations;

-- Verbatim from supabase/migrations/20261011153000_m2_7_rls_tenant_enforcement.sql
create policy integrations_select_member
on public.integrations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      integrations.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- Fixture identities (CONN-1d-B namespace)
-- -----------------------------------------------------------------------------

-- org A / B
-- users: active (A), revoked-former (A then DELETE in adversarial), foreign (B), none

insert into auth.users (id)
values
  ('c01d0b00-0000-4000-8000-0000000000a1'::uuid),
  ('c01d0b00-0000-4000-8000-0000000000a2'::uuid),
  ('c01d0b00-0000-4000-8000-0000000000b1'::uuid),
  ('c01d0b00-0000-4000-8000-0000000000c1'::uuid)
on conflict (id) do nothing;

insert into public.organizations (
  id, name, default_currency, timezone
)
values
  (
    'c01d0b00-0000-4000-8000-000000000001'::uuid,
    'CONN-1d-B Org A',
    'USD',
    'UTC'
  ),
  (
    'c01d0b00-0000-4000-8000-000000000011'::uuid,
    'CONN-1d-B Org B',
    'USD',
    'UTC'
  )
on conflict (id) do nothing;

insert into public.stores (
  id, organization_id, name, status, currency, timezone
)
values
  (
    'c01d0b00-0000-4000-8000-000000000002'::uuid,
    'c01d0b00-0000-4000-8000-000000000001'::uuid,
    'Store A',
    'active',
    'USD',
    'UTC'
  ),
  (
    'c01d0b00-0000-4000-8000-000000000012'::uuid,
    'c01d0b00-0000-4000-8000-000000000011'::uuid,
    'Store B',
    'active',
    'USD',
    'UTC'
  )
on conflict (id) do nothing;

insert into public.integrations (
  id, organization_id, store_id, provider, status, display_name, configuration
)
values
  (
    'c01d0b00-0000-4000-8000-000000000003'::uuid,
    'c01d0b00-0000-4000-8000-000000000001'::uuid,
    'c01d0b00-0000-4000-8000-000000000002'::uuid,
    'shopify',
    'active',
    'Shopify A',
    '{"shop_domain":"org-a.myshopify.com"}'::jsonb
  ),
  (
    'c01d0b00-0000-4000-8000-000000000013'::uuid,
    'c01d0b00-0000-4000-8000-000000000011'::uuid,
    'c01d0b00-0000-4000-8000-000000000012'::uuid,
    'shopify',
    'active',
    'Shopify B',
    '{"shop_domain":"org-b.myshopify.com"}'::jsonb
  )
on conflict (id) do nothing;

delete from public.organization_members
where organization_id in (
  'c01d0b00-0000-4000-8000-000000000001'::uuid,
  'c01d0b00-0000-4000-8000-000000000011'::uuid
)
  and user_id in (
    'c01d0b00-0000-4000-8000-0000000000a1'::uuid,
    'c01d0b00-0000-4000-8000-0000000000a2'::uuid,
    'c01d0b00-0000-4000-8000-0000000000b1'::uuid,
    'c01d0b00-0000-4000-8000-0000000000c1'::uuid
  );

insert into public.organization_members (
  organization_id, user_id, role
)
values
  (
    'c01d0b00-0000-4000-8000-000000000001'::uuid,
    'c01d0b00-0000-4000-8000-0000000000a1'::uuid,
    'owner'
  ),
  (
    'c01d0b00-0000-4000-8000-000000000001'::uuid,
    'c01d0b00-0000-4000-8000-0000000000a2'::uuid,
    'analyst'
  ),
  (
    'c01d0b00-0000-4000-8000-000000000011'::uuid,
    'c01d0b00-0000-4000-8000-0000000000b1'::uuid,
    'owner'
  );

-- Seed sealed vault row for org A (table owner path; not a browser write).
delete from public.integration_credentials
where organization_id = 'c01d0b00-0000-4000-8000-000000000001'::uuid
  and integration_id = 'c01d0b00-0000-4000-8000-000000000003'::uuid;

insert into public.integration_credentials (
  organization_id,
  integration_id,
  provider,
  token_kind,
  access_ciphertext,
  access_nonce,
  access_auth_tag,
  refresh_ciphertext,
  refresh_nonce,
  refresh_auth_tag,
  dek_wrapped,
  dek_wrap_nonce,
  dek_wrap_auth_tag,
  key_version,
  scope
)
values (
  'c01d0b00-0000-4000-8000-000000000001'::uuid,
  'c01d0b00-0000-4000-8000-000000000003'::uuid,
  'shopify',
  'offline_expiring',
  decode('aa', 'hex'),
  decode('0102030405060708090a0b0c', 'hex'),
  decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex'),
  decode('bb', 'hex'),
  decode('1112131415161718191a1b1c', 'hex'),
  decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex'),
  decode('cc', 'hex'),
  decode('2122232425262728292a2b2c', 'hex'),
  decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex'),
  1,
  'read_products'
);

\echo 'CONN-1d-B V8 membership bootstrap PASS'
