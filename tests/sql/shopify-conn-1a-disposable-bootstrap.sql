-- SHOPIFY-CONN-1a disposable bootstrap (offline / isolated PG only).
-- Creates the minimum M1.3 + M2.6 surfaces required to apply the CONN-1a
-- additive vault migration. Not for hosted or local Supabase 55322.

\set ON_ERROR_STOP on

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text null,
  default_currency text not null,
  timezone text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint organizations_name_not_blank
    check (pg_catalog.length(pg_catalog.btrim(name)) > 0),
  constraint organizations_default_currency_not_blank
    check (pg_catalog.length(pg_catalog.btrim(default_currency)) > 0),
  constraint organizations_timezone_not_blank
    check (pg_catalog.length(pg_catalog.btrim(timezone)) > 0)
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  status text not null,
  currency text not null,
  timezone text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint stores_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,
  constraint stores_status_check
    check (status in ('active', 'inactive', 'archived')),
  constraint stores_organization_id_unique
    unique (organization_id, id)
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid null,
  provider text not null,
  status text not null,
  display_name text null,
  configuration jsonb null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint integrations_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,
  constraint integrations_store_ownership_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete restrict,
  constraint integrations_provider_check
    check (
      provider in (
        'csv', 'shopify', 'woocommerce', 'square', 'lightspeed', 'other'
      )
    ),
  constraint integrations_status_check
    check (
      status in (
        'pending', 'active', 'degraded', 'disconnected', 'revoked', 'error'
      )
    ),
  constraint integrations_configuration_object
    check (
      configuration is null
      or pg_catalog.jsonb_typeof(configuration) = 'object'
    ),
  constraint integrations_organization_id_unique
    unique (organization_id, id),
  constraint integrations_organization_id_provider_unique
    unique (organization_id, id, provider)
);

create or replace function public.prevent_integration_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.store_id is distinct from old.store_id
    or new.provider is distinct from old.provider
  then
    raise exception
      'integration canonical scope cannot be reassigned';
  end if;
  return new;
end;
$$;

drop trigger if exists integrations_prevent_identity_reassignment
  on public.integrations;
create trigger integrations_prevent_identity_reassignment
before update on public.integrations
for each row
execute function public.prevent_integration_identity_reassignment();

alter table public.organizations enable row level security;
alter table public.stores enable row level security;
alter table public.integrations enable row level security;

-- Simulate hosted ambient default privilege hazard before CONN-1a apply.
alter default privileges in schema public
  grant all on tables to service_role;
