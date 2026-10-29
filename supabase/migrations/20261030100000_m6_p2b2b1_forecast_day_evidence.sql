-- StoreAgent M6 P2b.2b.1
-- Additive forecast day promotion/coverage evidence schema + tenant RLS.
--
-- Authority:
--   Rows are durable evidence for M6 forecasting. Trust labels are stamped
--   only by future service_role SECURITY DEFINER RPCs (not in this migration).
--   Raw service_role / authenticated INSERT, UPDATE, and DELETE are revoked.
--
-- Ownership:
--   Organization is the tenant boundary. Store is required (store-day grain).
--   Location and variant are optional narrowing under the same org/store.
--   Supersession references stay in-tenant via composite FK.
--
-- Active assertion:
--   At most one non-invalidated row per store-day scope (and stream for
--   coverage). Superseding requires invalidating the prior active row first
--   (or in the same future RPC transaction) so concurrent active claims
--   cannot coexist.
--
-- Closure:
--   coverage.closure_id is provenance only. It is required when
--   coverage='complete' for structural consistency with P2b.2a issuance,
--   but the column alone is not a trusted completion proof for forecasting.
--
-- This migration does not emit evidence from discounts, sync_runs, or CSV.

-- -----------------------------------------------------------------------------
-- Shared invalidation-only mutation guard
-- -----------------------------------------------------------------------------

create or replace function public.prevent_forecast_day_evidence_body_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'forecast day evidence rows cannot be deleted';
  end if;

  -- Only allow a one-way invalidated_at stamp. All other columns are frozen.
  if
    old.invalidated_at is null
    and new.invalidated_at is not null
    and to_jsonb(new) - 'invalidated_at'
      = to_jsonb(old) - 'invalidated_at'
  then
    return new;
  end if;

  raise exception
    'forecast day evidence body is immutable; only invalidated_at may be set once';
end;
$$;

-- -----------------------------------------------------------------------------
-- forecast_day_promotion_evidence
-- -----------------------------------------------------------------------------

create table public.forecast_day_promotion_evidence (
  evidence_id text primary key,

  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid null,
  variant_id uuid null,

  local_date date not null,

  state text not null,
  trust text not null,
  source text not null,

  observed_at timestamptz not null,
  version integer not null,

  invalidated_at timestamptz null,
  supersedes_evidence_id text null,

  idempotency_key text not null,

  integration_id uuid null,
  actor_user_id uuid null,
  provider text null,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint forecast_day_promotion_evidence_id_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(evidence_id)
      ) > 0
      and evidence_id = pg_catalog.btrim(evidence_id)
    ),

  constraint forecast_day_promotion_evidence_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint forecast_day_promotion_evidence_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint forecast_day_promotion_evidence_location_ownership_fk
    foreign key (
      organization_id,
      store_id,
      location_id
    )
    references public.locations (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint forecast_day_promotion_evidence_variant_ownership_fk
    foreign key (
      organization_id,
      store_id,
      variant_id
    )
    references public.product_variants (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint forecast_day_promotion_evidence_integration_ownership_fk
    foreign key (
      organization_id,
      integration_id
    )
    references public.integrations (
      organization_id,
      id
    )
    on delete restrict,

  constraint forecast_day_promotion_evidence_actor_user_fk
    foreign key (actor_user_id)
    references auth.users(id)
    on delete restrict,

  constraint forecast_day_promotion_evidence_org_evidence_unique
    unique (
      organization_id,
      evidence_id
    ),

  constraint forecast_day_promotion_evidence_supersedes_fk
    foreign key (
      organization_id,
      supersedes_evidence_id
    )
    references public.forecast_day_promotion_evidence (
      organization_id,
      evidence_id
    )
    on delete restrict,

  constraint forecast_day_promotion_evidence_location_requires_store
    check (
      location_id is null
      or store_id is not null
    ),

  constraint forecast_day_promotion_evidence_variant_requires_store
    check (
      variant_id is null
      or store_id is not null
    ),

  constraint forecast_day_promotion_evidence_state_check
    check (
      state in (
        'none',
        'promotion'
      )
    ),

  constraint forecast_day_promotion_evidence_trust_check
    check (
      trust in (
        'trusted_provider',
        'verified_merchant_attestation'
      )
    ),

  constraint forecast_day_promotion_evidence_source_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(source)
      ) > 0
    ),

  constraint forecast_day_promotion_evidence_idempotency_key_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(idempotency_key)
      ) > 0
      and idempotency_key =
        pg_catalog.btrim(idempotency_key)
    ),

  constraint forecast_day_promotion_evidence_version_positive
    check (version >= 1),

  constraint forecast_day_promotion_evidence_provider_path
    check (
      (
        trust = 'trusted_provider'
        and integration_id is not null
        and actor_user_id is null
        and provider is not null
        and pg_catalog.length(
          pg_catalog.btrim(provider)
        ) > 0
      )
      or (
        trust = 'verified_merchant_attestation'
        and actor_user_id is not null
        and integration_id is null
        and provider is null
      )
    )
);

create unique index forecast_day_promotion_evidence_idempotency_unique
  on public.forecast_day_promotion_evidence (
    organization_id,
    trust,
    idempotency_key,
    version
  );

-- One non-invalidated promotion assertion per store-day scope.
create unique index forecast_day_promotion_evidence_active_unique
  on public.forecast_day_promotion_evidence (
    organization_id,
    store_id,
    location_id,
    variant_id,
    local_date
  )
  nulls not distinct
  where invalidated_at is null;

create index forecast_day_promotion_evidence_org_store_date_idx
  on public.forecast_day_promotion_evidence (
    organization_id,
    store_id,
    local_date
  );

create trigger forecast_day_promotion_evidence_immutable_body
before update or delete on public.forecast_day_promotion_evidence
for each row
execute function public.prevent_forecast_day_evidence_body_mutation();

alter table public.forecast_day_promotion_evidence
enable row level security;

revoke all
on table public.forecast_day_promotion_evidence
from public, anon, authenticated, service_role;

grant select
on table public.forecast_day_promotion_evidence
to authenticated;

grant select
on table public.forecast_day_promotion_evidence
to service_role;

create policy forecast_day_promotion_evidence_select_member
on public.forecast_day_promotion_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      forecast_day_promotion_evidence.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- forecast_day_coverage_evidence
-- -----------------------------------------------------------------------------

create table public.forecast_day_coverage_evidence (
  evidence_id text primary key,

  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid null,
  variant_id uuid null,

  local_date date not null,

  stream text not null,
  coverage text not null,

  trust text not null,
  source text not null,

  -- Watermark for late-correction fencing. Not itself a trust proof.
  as_of timestamptz not null,
  observed_at timestamptz not null,
  version integer not null,

  invalidated_at timestamptz null,
  supersedes_evidence_id text null,

  idempotency_key text not null,

  integration_id uuid null,
  actor_user_id uuid null,
  provider text null,

  -- Provenance for explicit_day_stream_closure only. NOT trusted completion
  -- proof by itself; forecasting must still apply P2b.1 resolver rules.
  closure_id text null,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint forecast_day_coverage_evidence_id_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(evidence_id)
      ) > 0
      and evidence_id = pg_catalog.btrim(evidence_id)
    ),

  constraint forecast_day_coverage_evidence_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint forecast_day_coverage_evidence_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint forecast_day_coverage_evidence_location_ownership_fk
    foreign key (
      organization_id,
      store_id,
      location_id
    )
    references public.locations (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint forecast_day_coverage_evidence_variant_ownership_fk
    foreign key (
      organization_id,
      store_id,
      variant_id
    )
    references public.product_variants (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint forecast_day_coverage_evidence_integration_ownership_fk
    foreign key (
      organization_id,
      integration_id
    )
    references public.integrations (
      organization_id,
      id
    )
    on delete restrict,

  constraint forecast_day_coverage_evidence_actor_user_fk
    foreign key (actor_user_id)
    references auth.users(id)
    on delete restrict,

  constraint forecast_day_coverage_evidence_org_evidence_unique
    unique (
      organization_id,
      evidence_id
    ),

  constraint forecast_day_coverage_evidence_supersedes_fk
    foreign key (
      organization_id,
      supersedes_evidence_id
    )
    references public.forecast_day_coverage_evidence (
      organization_id,
      evidence_id
    )
    on delete restrict,

  constraint forecast_day_coverage_evidence_location_requires_store
    check (
      location_id is null
      or store_id is not null
    ),

  constraint forecast_day_coverage_evidence_variant_requires_store
    check (
      variant_id is null
      or store_id is not null
    ),

  constraint forecast_day_coverage_evidence_stream_check
    check (
      stream in (
        'orders',
        'returns'
      )
    ),

  constraint forecast_day_coverage_evidence_coverage_check
    check (
      coverage in (
        'complete',
        'partial'
      )
    ),

  constraint forecast_day_coverage_evidence_trust_check
    check (
      trust in (
        'trusted_provider',
        'verified_merchant_attestation'
      )
    ),

  constraint forecast_day_coverage_evidence_source_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(source)
      ) > 0
    ),

  constraint forecast_day_coverage_evidence_idempotency_key_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(idempotency_key)
      ) > 0
      and idempotency_key =
        pg_catalog.btrim(idempotency_key)
    ),

  constraint forecast_day_coverage_evidence_version_positive
    check (version >= 1),

  -- Structural pairing with P2b.2a issuance. closure_id is not trust.
  constraint forecast_day_coverage_evidence_closure_pairing
    check (
      (
        coverage = 'complete'
        and closure_id is not null
        and pg_catalog.length(
          pg_catalog.btrim(closure_id)
        ) > 0
      )
      or (
        coverage = 'partial'
        and closure_id is null
      )
    ),

  constraint forecast_day_coverage_evidence_provider_path
    check (
      (
        trust = 'trusted_provider'
        and integration_id is not null
        and actor_user_id is null
        and provider is not null
        and pg_catalog.length(
          pg_catalog.btrim(provider)
        ) > 0
      )
      or (
        trust = 'verified_merchant_attestation'
        and actor_user_id is not null
        and integration_id is null
        and provider is null
      )
    )
);

create unique index forecast_day_coverage_evidence_idempotency_unique
  on public.forecast_day_coverage_evidence (
    organization_id,
    trust,
    idempotency_key,
    version
  );

-- One non-invalidated coverage assertion per store-day scope + stream.
create unique index forecast_day_coverage_evidence_active_unique
  on public.forecast_day_coverage_evidence (
    organization_id,
    store_id,
    location_id,
    variant_id,
    local_date,
    stream
  )
  nulls not distinct
  where invalidated_at is null;

create index forecast_day_coverage_evidence_org_store_date_idx
  on public.forecast_day_coverage_evidence (
    organization_id,
    store_id,
    local_date,
    stream
  );

create trigger forecast_day_coverage_evidence_immutable_body
before update or delete on public.forecast_day_coverage_evidence
for each row
execute function public.prevent_forecast_day_evidence_body_mutation();

alter table public.forecast_day_coverage_evidence
enable row level security;

revoke all
on table public.forecast_day_coverage_evidence
from public, anon, authenticated, service_role;

grant select
on table public.forecast_day_coverage_evidence
to authenticated;

grant select
on table public.forecast_day_coverage_evidence
to service_role;

create policy forecast_day_coverage_evidence_select_member
on public.forecast_day_coverage_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      forecast_day_coverage_evidence.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);
