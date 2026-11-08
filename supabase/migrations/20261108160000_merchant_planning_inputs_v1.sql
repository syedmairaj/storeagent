-- StoreAgent Merchant Planning Inputs V1
-- Organization-default planning days for future M7 threshold derivation.
--
-- Canonical grain: organization defaults (INVENTORY_FORMULAS / VALUE_SEMANTICS).
-- Fields map 1:1 to InventoryPlanningSettings:
--   lead_time_days, safety_stock_days, review_period_days
--
-- null = unknown (never silently defaulted)
-- 0 = explicit known zero (allowed by inventory-math / supplier lead checks)
--
-- Authenticated clients remain SELECT-only (M1.5).
-- Owner/admin writes go through a trusted SECURITY DEFINER RPC.
-- Does not recompute M5 metrics or unlock commercial actions.

create table public.organization_planning_inputs (
  organization_id uuid primary key,

  lead_time_days integer null,
  safety_stock_days integer null,
  review_period_days integer null,

  updated_at timestamptz not null
    default pg_catalog.now(),
  updated_by_user_id uuid null,

  constraint organization_planning_inputs_organization_fk
    foreign key (organization_id)
    references public.organizations (id)
    on delete restrict,

  constraint organization_planning_inputs_updated_by_user_fk
    foreign key (updated_by_user_id)
    references auth.users (id)
    on delete set null,

  constraint organization_planning_inputs_lead_time_non_negative
    check (
      lead_time_days is null
      or lead_time_days >= 0
    ),

  constraint organization_planning_inputs_safety_stock_non_negative
    check (
      safety_stock_days is null
      or safety_stock_days >= 0
    ),

  constraint organization_planning_inputs_review_period_non_negative
    check (
      review_period_days is null
      or review_period_days >= 0
    )
);

comment on table public.organization_planning_inputs is
  'Merchant organization planning assumptions (defaults). Not verified supplier or SKU facts. null means unknown; 0 means explicit zero. Does not invent M5 unit thresholds or unlock M7 commercial actions.';

comment on column public.organization_planning_inputs.lead_time_days is
  'Merchant-assumed organization default lead time in whole days. Not a verified supplier/SKU fact. null = unknown.';

comment on column public.organization_planning_inputs.safety_stock_days is
  'Merchant-assumed organization default safety stock cover in whole days. null = unknown.';

comment on column public.organization_planning_inputs.review_period_days is
  'Merchant-assumed organization default review period in whole days. null = unknown.';

alter table public.organization_planning_inputs
  enable row level security;

revoke all
on table public.organization_planning_inputs
from anon;

revoke all
on table public.organization_planning_inputs
from authenticated;

grant select
on table public.organization_planning_inputs
to authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.organization_planning_inputs
from authenticated;

create policy organization_planning_inputs_select_member
on public.organization_planning_inputs
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      organization_planning_inputs.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create or replace function public.upsert_current_user_organization_planning_inputs(
  p_organization_id uuid,
  p_lead_time_days integer,
  p_safety_stock_days integer,
  p_review_period_days integer
)
returns table (
  organization_id uuid,
  lead_time_days integer,
  safety_stock_days integer,
  review_period_days integer,
  updated_at timestamptz,
  updated_by_user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid;
  member_role text;
  org_exists boolean;
  written_organization_id uuid;
  written_lead_time_days integer;
  written_safety_stock_days integer;
  written_review_period_days integer;
  written_updated_at timestamptz;
  written_updated_by_user_id uuid;
begin
  authenticated_user_id := auth.uid();

  if authenticated_user_id is null then
    raise exception
      'Authentication required.'
      using errcode = '42501';
  end if;

  if p_organization_id is null then
    raise exception
      'Organization is required.'
      using errcode = '22023';
  end if;

  if p_lead_time_days is not null and p_lead_time_days < 0 then
    raise exception
      'Lead time days must be a non-negative integer or null.'
      using errcode = '22023';
  end if;

  if p_safety_stock_days is not null and p_safety_stock_days < 0 then
    raise exception
      'Safety stock days must be a non-negative integer or null.'
      using errcode = '22023';
  end if;

  if p_review_period_days is not null and p_review_period_days < 0 then
    raise exception
      'Review period days must be a non-negative integer or null.'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.organizations as organization
    where organization.id = p_organization_id
  )
  into org_exists;

  if not org_exists then
    raise exception
      'Organization not found.'
      using errcode = 'P0002';
  end if;

  select membership.role
  into member_role
  from public.organization_members as membership
  where membership.organization_id = p_organization_id
    and membership.user_id = authenticated_user_id;

  if member_role is null then
    raise exception
      'Organization membership required.'
      using errcode = '42501';
  end if;

  if member_role not in ('owner', 'admin') then
    raise exception
      'Planning inputs require owner or admin.'
      using errcode = '42501';
  end if;

  insert into public.organization_planning_inputs as planning (
    organization_id,
    lead_time_days,
    safety_stock_days,
    review_period_days,
    updated_at,
    updated_by_user_id
  )
  values (
    p_organization_id,
    p_lead_time_days,
    p_safety_stock_days,
    p_review_period_days,
    pg_catalog.now(),
    authenticated_user_id
  )
  on conflict on constraint organization_planning_inputs_pkey do update
  set
    lead_time_days = excluded.lead_time_days,
    safety_stock_days = excluded.safety_stock_days,
    review_period_days = excluded.review_period_days,
    updated_at = pg_catalog.now(),
    updated_by_user_id = authenticated_user_id
  where exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = planning.organization_id
      and membership.user_id = authenticated_user_id
      and membership.role in ('owner', 'admin')
  )
  returning
    planning.organization_id,
    planning.lead_time_days,
    planning.safety_stock_days,
    planning.review_period_days,
    planning.updated_at,
    planning.updated_by_user_id
  into
    written_organization_id,
    written_lead_time_days,
    written_safety_stock_days,
    written_review_period_days,
    written_updated_at,
    written_updated_by_user_id;

  if written_organization_id is null then
    raise exception
      'Planning inputs require owner or admin.'
      using errcode = '42501';
  end if;

  return query
  select
    written_organization_id,
    written_lead_time_days,
    written_safety_stock_days,
    written_review_period_days,
    written_updated_at,
    written_updated_by_user_id;
end;
$$;

revoke all
on function public.upsert_current_user_organization_planning_inputs(
  uuid,
  integer,
  integer,
  integer
)
from public, anon, service_role;

grant execute
on function public.upsert_current_user_organization_planning_inputs(
  uuid,
  integer,
  integer,
  integer
)
to authenticated;
