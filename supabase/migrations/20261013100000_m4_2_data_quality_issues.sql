-- StoreAgent M4.2
-- Durable data-quality issue persistence and tenant RLS.
--
-- Ownership:
--   Organization remains the tenant boundary.
--   Store, location, and variant links are optional and composite.
--   A location or variant requires the same organization and store.
--   source_context never establishes tenant ownership.
--
-- Identity:
--   Open issues are unique per organization and issue_key.
--   Issue-key construction belongs to a later milestone.
--   Canonical identity columns cannot be reassigned.
--   Lifecycle fields remain mutable for later trusted workflows.
--
-- RLS:
--   Authenticated members may read issues in their organization.
--   Browser insert, update, and delete are denied.

-- -----------------------------------------------------------------------------
-- data_quality_issues
-- -----------------------------------------------------------------------------

create table public.data_quality_issues (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid null,
  location_id uuid null,
  variant_id uuid null,

  issue_code text not null,
  issue_key text not null,

  severity text not null,
  status text not null,

  message text not null,
  remediation_hint text null,

  source_context jsonb null,

  detected_at timestamptz not null,
  last_detected_at timestamptz not null,

  occurrence_count integer not null
    default 1,

  resolved_at timestamptz null,

  created_at timestamptz not null
    default pg_catalog.now(),
  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint data_quality_issues_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint data_quality_issues_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint data_quality_issues_location_ownership_fk
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

  constraint data_quality_issues_variant_ownership_fk
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

  constraint data_quality_issues_location_requires_store
    check (
      location_id is null
      or store_id is not null
    ),

  constraint data_quality_issues_variant_requires_store
    check (
      variant_id is null
      or store_id is not null
    ),

  constraint data_quality_issues_issue_code_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(issue_code)
      ) > 0
    ),

  constraint data_quality_issues_issue_key_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(issue_key)
      ) > 0
    ),

  constraint data_quality_issues_message_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(message)
      ) > 0
    ),

  constraint data_quality_issues_remediation_hint_not_blank
    check (
      remediation_hint is null
      or pg_catalog.length(
        pg_catalog.btrim(remediation_hint)
      ) > 0
    ),

  constraint data_quality_issues_severity_check
    check (
      severity in (
        'critical',
        'high',
        'medium',
        'low',
        'info'
      )
    ),

  constraint data_quality_issues_status_check
    check (
      status in (
        'open',
        'resolved',
        'ignored',
        'superseded'
      )
    ),

  constraint data_quality_issues_occurrence_count_positive
    check (occurrence_count >= 1),

  constraint data_quality_issues_detection_order
    check (last_detected_at >= detected_at),

  constraint data_quality_issues_resolved_status
    check (
      (status = 'resolved')
        = (resolved_at is not null)
    )
);

create unique index data_quality_issues_open_identity_unique
  on public.data_quality_issues (
    organization_id,
    issue_key
  )
  where status = 'open';

create index data_quality_issues_organization_status_idx
  on public.data_quality_issues (
    organization_id,
    status
  );

create index data_quality_issues_organization_store_status_idx
  on public.data_quality_issues (
    organization_id,
    store_id,
    status
  );

create trigger data_quality_issues_set_updated_at
before update on public.data_quality_issues
for each row
execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Canonical identity reassignment guard.
--
-- Lifecycle fields may change in later trusted workflows.
-- Tenant scope, optional parents, issue identity, and first detection may not.
-- -----------------------------------------------------------------------------

create or replace function public.prevent_data_quality_issue_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.store_id is distinct from old.store_id
    or new.location_id is distinct from old.location_id
    or new.variant_id is distinct from old.variant_id
    or new.issue_code is distinct from old.issue_code
    or new.issue_key is distinct from old.issue_key
    or new.detected_at is distinct from old.detected_at
  then
    raise exception
      'data quality issue canonical identity cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger data_quality_issues_prevent_identity_reassignment
before update on public.data_quality_issues
for each row
execute function public.prevent_data_quality_issue_identity_reassignment();

alter table public.data_quality_issues
enable row level security;

-- -----------------------------------------------------------------------------
-- Explicit browser privilege boundary
-- -----------------------------------------------------------------------------

revoke all
on table public.data_quality_issues
from anon;

grant select
on table public.data_quality_issues
to authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.data_quality_issues
from authenticated;

-- -----------------------------------------------------------------------------
-- Tenant SELECT policy
-- -----------------------------------------------------------------------------

create policy data_quality_issues_select_member
on public.data_quality_issues
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      data_quality_issues.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);
