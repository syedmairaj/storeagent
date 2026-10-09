-- StoreAgent M1.3
-- Canonical foundation schema.
--
-- Ownership:
--   Organization is the primary tenant boundary.
--
-- Scope:
--   organizations
--   organization_members
--   stores
--   locations
--
-- RLS is enabled fail-closed.
-- Policies are intentionally deferred to M1.5.

-- -----------------------------------------------------------------------------
-- Shared updated_at behavior
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key
    default gen_random_uuid(),

  name text not null,

  country_code text null,

  default_currency text not null,

  timezone text not null,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint organizations_name_not_blank
    check (pg_catalog.length(pg_catalog.btrim(name)) > 0),

  constraint organizations_default_currency_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(default_currency)
      ) > 0
    ),

  constraint organizations_timezone_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(timezone)
      ) > 0
    ),

  constraint organizations_country_code_not_blank
    check (
      country_code is null
      or pg_catalog.length(
        pg_catalog.btrim(country_code)
      ) > 0
    )
);

create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- organization_members
-- -----------------------------------------------------------------------------

create table public.organization_members (
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

create index organization_members_user_organization_idx
  on public.organization_members (
    user_id,
    organization_id
  );

create index organization_members_organization_idx
  on public.organization_members (
    organization_id
  );

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row
execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- stores
-- -----------------------------------------------------------------------------

create table public.stores (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,

  name text not null,

  status text not null,

  currency text not null,

  timezone text not null,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint stores_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint stores_name_not_blank
    check (pg_catalog.length(pg_catalog.btrim(name)) > 0),

  constraint stores_status_check
    check (
      status in (
        'active',
        'inactive',
        'archived'
      )
    ),

  constraint stores_currency_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(currency)
      ) > 0
    ),

  constraint stores_timezone_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(timezone)
      ) > 0
    ),

  constraint stores_organization_id_unique
    unique (
      organization_id,
      id
    )
);

create index stores_organization_idx
  on public.stores (
    organization_id
  );

create trigger stores_set_updated_at
before update on public.stores
for each row
execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- locations
-- -----------------------------------------------------------------------------

create table public.locations (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,

  store_id uuid not null,

  name text not null,

  status text not null,

  code text null,

  created_at timestamptz not null
    default pg_catalog.now(),

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint locations_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint locations_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint locations_name_not_blank
    check (pg_catalog.length(pg_catalog.btrim(name)) > 0),

  constraint locations_status_check
    check (
      status in (
        'active',
        'inactive',
        'archived'
      )
    ),

  constraint locations_code_not_blank
    check (
      code is null
      or pg_catalog.length(
        pg_catalog.btrim(code)
      ) > 0
    ),

  constraint locations_organization_id_unique
    unique (
      organization_id,
      id
    )
);

create index locations_organization_idx
  on public.locations (
    organization_id
  );

create index locations_organization_store_idx
  on public.locations (
    organization_id,
    store_id
  );

create trigger locations_set_updated_at
before update on public.locations
for each row
execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
--
-- Enabled now so tenant tables fail closed.
-- M1.5 owns policy creation.
-- -----------------------------------------------------------------------------

alter table public.organizations
  enable row level security;

alter table public.organization_members
  enable row level security;

alter table public.stores
  enable row level security;

alter table public.locations
  enable row level security;
