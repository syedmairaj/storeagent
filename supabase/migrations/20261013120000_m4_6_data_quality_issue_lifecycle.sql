-- StoreAgent M4.6
-- Trusted data-quality issue lifecycle transitions.
--
-- Legal transitions from OPEN only:
--   resolve    -> resolved, resolved_at = explicit occurred_at
--   ignore     -> ignored, resolved_at stays null
--   supersede  -> superseded, resolved_at stays null
--
-- RESOLVED, IGNORED, and SUPERSEDED are terminal for lifecycle mutation.
-- M4.6 does not reopen them. M4.5 still inserts a new OPEN row after a
-- resolved occurrence. Ignored and superseded history continues to block
-- that insert.
--
-- The target row is locked with SELECT ... FOR UPDATE before the status
-- check, so a concurrent transition or M4.5 reconciliation cannot apply
-- a stale status.
--
-- Identity columns are not assigned. Tenant scope is the trusted
-- organization id plus issue id. source_context is not consulted.
--
-- Chronology is checked on the locked row, before the status
-- transition. occurred_at must be at or after detected_at.
-- created_at, updated_at, and last_detected_at are not used.
--
-- SQLSTATE:
--   SA005 illegal lifecycle transition
--   SA006 issue is not in the trusted organization
--   SA007 lifecycle timestamp precedes issue detection

create or replace function public.transition_data_quality_issue(
  p_organization_id uuid,
  p_issue_id uuid,
  p_transition text,
  p_occurred_at timestamptz
)
returns table (
  issue_id uuid,
  previous_status text,
  status text,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.data_quality_issues%rowtype;
  next_status text;
  next_resolved_at timestamptz;
begin
  if p_organization_id is null then
    raise exception
      'data quality issue organization is required';
  end if;

  if p_issue_id is null then
    raise exception
      'data quality issue id is required';
  end if;

  if p_occurred_at is null then
    raise exception
      'data quality issue occurred_at is required';
  end if;

  if p_transition is null or p_transition not in (
    'resolve',
    'ignore',
    'supersede'
  ) then
    raise exception
      'data quality issue transition is not supported';
  end if;

  select issue.*
  into existing
  from public.data_quality_issues issue
  where
    issue.organization_id = p_organization_id
    and issue.id = p_issue_id
  for update;

  if not found then
    raise exception
      using
        errcode = 'SA006',
        message =
          'data quality issue is not in the trusted organization';
  end if;

  if p_occurred_at < existing.detected_at then
    raise exception
      using
        errcode = 'SA007',
        message =
          'lifecycle timestamp precedes issue detection';
  end if;

  if existing.status is distinct from 'open' then
    raise exception
      using
        errcode = 'SA005',
        message =
          'data quality issue lifecycle transition is illegal';
  end if;

  if p_transition = 'resolve' then
    next_status := 'resolved';
    next_resolved_at := p_occurred_at;
  elsif p_transition = 'ignore' then
    next_status := 'ignored';
    next_resolved_at := null;
  else
    next_status := 'superseded';
    next_resolved_at := null;
  end if;

  update public.data_quality_issues issue
  set
    status = next_status,
    resolved_at = next_resolved_at
  where
    issue.id = existing.id
    and issue.organization_id = p_organization_id
  returning issue.*
  into existing;

  return query
  select
    existing.id,
    'open'::text,
    existing.status,
    existing.resolved_at;
end;
$$;

revoke all
on function public.transition_data_quality_issue(
  uuid,
  uuid,
  text,
  timestamptz
)
from public, anon, authenticated;

grant execute
on function public.transition_data_quality_issue(
  uuid,
  uuid,
  text,
  timestamptz
)
to service_role;
