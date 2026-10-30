-- StoreAgent M6 P3d.1
-- Local forecast publication foundation (LOCAL-ONLY until hosted approval).
--
-- Immutable sku_forecast_publications + one sku_forecast_current pointer
-- per (organization_id, store_id, location_id, variant_id).
--
-- persist != publish != M7 eligibility.
--
-- publish_sku_forecast(p_forecast_run_id):
--   1) Load completed historical run + 1:1 sku_forecast.
--   2) Same-run published replay returns immediately (no pointer move).
--   3) Acquire transaction-scoped per-grain advisory lock
--      pg_advisory_xact_lock(1347765297, hashtext(org|store|location|variant))
--      so first-pointer and existing-pointer publishers serialize. No table SHARE.
--   4) AFTER the lock: re-read current pointer and revalidate via
--      forecast_sku_demand_source_snapshot; recheck sourceToken, pending
--      corrections, and body eligibility BEFORE advancing the pointer.
--   5) Never publish mode=unavailable or daily_demand IS NULL.
--      Known zero (0) may publish. Low confidence may publish as artifact;
--      m7_eligible is always false in this foundation.
--   6) Older forecast_as_of cannot replace newer current (withhold).
--   7) Equal as_of ordering: later completed_at wins; on timestamp equality,
--      stable forecast_run_id text ordering (higher id wins). source_token
--      differences never override that version ordering.
--   8) Withheld attempts insert immutable events; pointer unchanged.
--
-- Bounds: statement_timeout=15s, lock_timeout=2s (re-asserted after nested
-- snapshot). Advisory/lock waits fail closed with no partial pointer writes.
--
-- Remaining race (documented, not claimed solved):
--   Commerce/evidence may change after the post-lock revalidation snapshot and
--   before commit. Publication proves identity for the validated source_token
--   at check time only. Pointer is NOT a freshness claim. M7 must revalidate
--   separately and must not treat low-confidence publication as eligibility.

-- -----------------------------------------------------------------------------
-- Immutability for publication events only (pointer remains mutable via owner)
-- -----------------------------------------------------------------------------

create or replace function public.prevent_forecast_publication_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    using
      errcode = 'P0001',
      message = format(
        'forecast publication rows are immutable (%s on %s)',
        tg_op,
        tg_table_name
      );
end;
$$;

-- -----------------------------------------------------------------------------
-- sku_forecast_publications (append-only events)
-- -----------------------------------------------------------------------------

create table public.sku_forecast_publications (
  id uuid primary key
    default gen_random_uuid(),

  forecast_run_id uuid not null,
  sku_forecast_id uuid not null,

  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,

  forecast_as_of date not null,
  source_token text not null,

  outcome text not null,
  withhold_reason text null,

  supersedes_publication_id uuid null,

  algorithm_version text not null,
  configuration_version text not null,
  reproducibility_fingerprint text not null,

  daily_demand numeric null,
  mode text not null,
  data_sufficiency text not null,
  confidence text not null,

  -- P3d.1 never grants M7 eligibility; reader policy is separate.
  m7_eligible boolean not null
    default false,

  persist_claims_post_commit_freshness boolean not null
    default false,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint sku_forecast_publications_run_fk
    foreign key (forecast_run_id)
    references public.forecast_runs (id)
    on delete restrict,

  constraint sku_forecast_publications_forecast_fk
    foreign key (sku_forecast_id)
    references public.sku_forecasts (id)
    on delete restrict,

  constraint sku_forecast_publications_organization_fk
    foreign key (organization_id)
    references public.organizations (id)
    on delete restrict,

  constraint sku_forecast_publications_store_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete restrict,

  constraint sku_forecast_publications_location_fk
    foreign key (organization_id, store_id, location_id)
    references public.locations (organization_id, store_id, id)
    on delete restrict,

  constraint sku_forecast_publications_variant_fk
    foreign key (organization_id, store_id, variant_id)
    references public.product_variants (organization_id, store_id, id)
    on delete restrict,

  constraint sku_forecast_publications_supersedes_fk
    foreign key (supersedes_publication_id)
    references public.sku_forecast_publications (id)
    on delete restrict,

  constraint sku_forecast_publications_outcome_check
    check (outcome in ('published', 'withheld')),

  constraint sku_forecast_publications_withhold_reason_check
    check (
      (
        outcome = 'published'
        and withhold_reason is null
      )
      or (
        outcome = 'withheld'
        and withhold_reason is not null
        and withhold_reason in (
          'STALE_SOURCE_TOKEN',
          'PENDING_CORRECTION',
          'MODE_UNAVAILABLE',
          'NULL_DEMAND',
          'INSUFFICIENT_EVIDENCE',
          'OLDER_AS_OF_THAN_CURRENT',
          'OLDER_SOURCE_VERSION'
        )
      )
    ),

  constraint sku_forecast_publications_source_token_check
    check (source_token ~ '^[a-f0-9]{32}$'),

  constraint sku_forecast_publications_m7_eligible_false
    check (m7_eligible = false),

  constraint sku_forecast_publications_no_freshness_claim
    check (persist_claims_post_commit_freshness = false),

  constraint sku_forecast_publications_mode_check
    check (mode in ('standard', 'limited_history', 'unavailable')),

  constraint sku_forecast_publications_confidence_check
    check (confidence in ('high', 'medium', 'low', 'none'))
);

-- One successful publish event per historical run.
create unique index sku_forecast_publications_published_run_uidx
  on public.sku_forecast_publications (forecast_run_id)
  where outcome = 'published';

create index sku_forecast_publications_grain_created_idx
  on public.sku_forecast_publications (
    organization_id,
    store_id,
    location_id,
    variant_id,
    created_at
  );

create trigger sku_forecast_publications_immutable
before update or delete on public.sku_forecast_publications
for each row
execute function public.prevent_forecast_publication_mutation();

alter table public.sku_forecast_publications enable row level security;

revoke all
on table public.sku_forecast_publications
from public, anon, authenticated, service_role;

grant select
on table public.sku_forecast_publications
to authenticated, service_role;

create policy sku_forecast_publications_select_member
on public.sku_forecast_publications
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where
      membership.organization_id =
        sku_forecast_publications.organization_id
      and membership.user_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- sku_forecast_current (mutable pointer; owner-only via SECURITY DEFINER)
-- -----------------------------------------------------------------------------

create table public.sku_forecast_current (
  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,

  publication_id uuid not null,
  forecast_run_id uuid not null,
  sku_forecast_id uuid not null,

  forecast_as_of date not null,
  source_token text not null,

  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint sku_forecast_current_pk
    primary key (
      organization_id,
      store_id,
      location_id,
      variant_id
    ),

  constraint sku_forecast_current_publication_fk
    foreign key (publication_id)
    references public.sku_forecast_publications (id)
    on delete restrict,

  constraint sku_forecast_current_run_fk
    foreign key (forecast_run_id)
    references public.forecast_runs (id)
    on delete restrict,

  constraint sku_forecast_current_forecast_fk
    foreign key (sku_forecast_id)
    references public.sku_forecasts (id)
    on delete restrict,

  constraint sku_forecast_current_organization_fk
    foreign key (organization_id)
    references public.organizations (id)
    on delete restrict,

  constraint sku_forecast_current_store_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete restrict,

  constraint sku_forecast_current_location_fk
    foreign key (organization_id, store_id, location_id)
    references public.locations (organization_id, store_id, id)
    on delete restrict,

  constraint sku_forecast_current_variant_fk
    foreign key (organization_id, store_id, variant_id)
    references public.product_variants (organization_id, store_id, id)
    on delete restrict,

  constraint sku_forecast_current_source_token_check
    check (source_token ~ '^[a-f0-9]{32}$')
);

alter table public.sku_forecast_current enable row level security;

revoke all
on table public.sku_forecast_current
from public, anon, authenticated, service_role;

grant select
on table public.sku_forecast_current
to authenticated, service_role;

create policy sku_forecast_current_select_member
on public.sku_forecast_current
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where
      membership.organization_id =
        sku_forecast_current.organization_id
      and membership.user_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- Publish RPC
-- -----------------------------------------------------------------------------

create or replace function public.publish_sku_forecast(
  p_forecast_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Namespace key for per-grain publication serialization ('P3d1').
  c_publish_lock_ns constant integer := 1347765297;
  v_run public.forecast_runs%rowtype;
  v_forecast public.sku_forecasts%rowtype;
  v_snapshot jsonb;
  v_snapshot_token text;
  v_pending_count integer;
  v_pending_stamp boolean;
  v_existing_pub public.sku_forecast_publications%rowtype;
  v_current public.sku_forecast_current%rowtype;
  v_current_run public.forecast_runs%rowtype;
  v_publication_id uuid;
  v_supersedes uuid;
  v_disposition text;
  v_withhold_reason text;
  v_grain_lock_key integer;
  v_current_found boolean := false;
begin
  -- Bound waits; do not hold global SHARE locks across tenants.
  perform pg_catalog.set_config('statement_timeout', '15s', true);
  perform pg_catalog.set_config('lock_timeout', '2s', true);

  if to_regprocedure(
    'public.forecast_sku_demand_source_snapshot(uuid,uuid,uuid,uuid,date,integer)'
  ) is null
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast publication requires forecast_sku_demand_source_snapshot';
  end if;

  if p_forecast_run_id is null then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast publication requires forecast_run_id';
  end if;

  select *
  into v_run
  from public.forecast_runs as r
  where r.id = p_forecast_run_id;

  if not found then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast publication run not found';
  end if;

  if v_run.status is distinct from 'completed' then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast publication requires a completed historical run';
  end if;

  select *
  into v_forecast
  from public.sku_forecasts as f
  where f.forecast_run_id = v_run.id;

  if not found then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast publication requires 1:1 sku_forecast for run';
  end if;

  if v_forecast.organization_id is distinct from v_run.organization_id
    or v_forecast.store_id is distinct from v_run.store_id
    or v_forecast.location_id is distinct from v_run.location_id
    or v_forecast.variant_id is distinct from v_run.variant_id
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast publication grain mismatch between run and sku_forecast';
  end if;

  -- Same-run published replay: never roll pointer backward.
  select *
  into v_existing_pub
  from public.sku_forecast_publications as p
  where
    p.forecast_run_id = v_run.id
    and p.outcome = 'published';

  if found then
    return jsonb_build_object(
      'ok', true,
      'disposition', 'replayed',
      'outcome', 'published',
      'publicationId', v_existing_pub.id,
      'forecastRunId', v_run.id,
      'skuForecastId', v_forecast.id,
      'sourceToken', v_existing_pub.source_token,
      'm7Eligible', false,
      'persistClaimsPostCommitFreshness', false,
      'pointerAdvanced', false
    );
  end if;

  -- Serialize all publishers for this grain (including first-pointer).
  v_grain_lock_key := pg_catalog.hashtext(
    v_run.organization_id::text
    || chr(31)
    || v_run.store_id::text
    || chr(31)
    || v_run.location_id::text
    || chr(31)
    || v_run.variant_id::text
  );
  perform pg_catalog.pg_advisory_xact_lock(
    c_publish_lock_ns,
    v_grain_lock_key
  );

  -- Post-lock revalidation (eligibility before any pointer advance).
  perform pg_catalog.set_config('statement_timeout', '15s', true);
  perform pg_catalog.set_config('lock_timeout', '2s', true);

  v_snapshot := public.forecast_sku_demand_source_snapshot(
    v_run.organization_id,
    v_run.store_id,
    v_run.location_id,
    v_run.variant_id,
    v_run.forecast_as_of,
    v_run.lookback_days
  );

  perform pg_catalog.set_config('statement_timeout', '15s', true);
  perform pg_catalog.set_config('lock_timeout', '2s', true);

  v_snapshot_token := v_snapshot->>'sourceToken';
  if v_snapshot_token is distinct from v_run.source_token then
    v_withhold_reason := 'STALE_SOURCE_TOKEN';
  else
    v_pending_count := coalesce(
      jsonb_array_length(v_snapshot->'pendingCorrections'),
      0
    );
    select coalesce(
      bool_or((cov->>'pendingCorrection')::boolean),
      false
    )
    into v_pending_stamp
    from jsonb_array_elements(
      coalesce(v_snapshot->'coverageEvidence', '[]'::jsonb)
    ) as cov;

    if v_pending_count > 0 or v_pending_stamp then
      v_withhold_reason := 'PENDING_CORRECTION';
    elsif v_forecast.mode = 'unavailable'
      or v_forecast.data_sufficiency = 'insufficient'
    then
      if v_forecast.mode = 'unavailable' then
        v_withhold_reason := 'MODE_UNAVAILABLE';
      else
        v_withhold_reason := 'INSUFFICIENT_EVIDENCE';
      end if;
    elsif v_forecast.daily_demand is null then
      v_withhold_reason := 'NULL_DEMAND';
    end if;
  end if;

  if v_withhold_reason is not null then
    insert into public.sku_forecast_publications (
      forecast_run_id,
      sku_forecast_id,
      organization_id,
      store_id,
      location_id,
      variant_id,
      forecast_as_of,
      source_token,
      outcome,
      withhold_reason,
      supersedes_publication_id,
      algorithm_version,
      configuration_version,
      reproducibility_fingerprint,
      daily_demand,
      mode,
      data_sufficiency,
      confidence,
      m7_eligible,
      persist_claims_post_commit_freshness
    ) values (
      v_run.id,
      v_forecast.id,
      v_run.organization_id,
      v_run.store_id,
      v_run.location_id,
      v_run.variant_id,
      v_run.forecast_as_of,
      v_run.source_token,
      'withheld',
      v_withhold_reason,
      null,
      v_run.algorithm_version,
      v_run.configuration_version,
      v_run.reproducibility_fingerprint,
      v_forecast.daily_demand,
      v_forecast.mode,
      v_forecast.data_sufficiency,
      v_forecast.confidence,
      false,
      false
    )
    returning id into v_publication_id;

    return jsonb_build_object(
      'ok', true,
      'disposition', 'withheld',
      'outcome', 'withheld',
      'withholdReason', v_withhold_reason,
      'publicationId', v_publication_id,
      'forecastRunId', v_run.id,
      'skuForecastId', v_forecast.id,
      'sourceToken', v_run.source_token,
      'm7Eligible', false,
      'persistClaimsPostCommitFreshness', false,
      'pointerAdvanced', false
    );
  end if;

  -- Read pointer under the grain advisory lock.
  select *
  into v_current
  from public.sku_forecast_current as c
  where
    c.organization_id = v_run.organization_id
    and c.store_id = v_run.store_id
    and c.location_id = v_run.location_id
    and c.variant_id = v_run.variant_id
  for update;

  v_current_found := found;
  v_withhold_reason := null;

  if v_current_found then
    select *
    into v_current_run
    from public.forecast_runs as r
    where r.id = v_current.forecast_run_id;

    if v_run.forecast_as_of < v_current.forecast_as_of then
      v_withhold_reason := 'OLDER_AS_OF_THAN_CURRENT';
    elsif v_run.forecast_as_of = v_current.forecast_as_of then
      if v_run.id = v_current.forecast_run_id then
        v_withhold_reason := null;
      elsif v_current_run.completed_at > v_run.completed_at then
        v_withhold_reason := 'OLDER_SOURCE_VERSION';
      elsif v_current_run.completed_at < v_run.completed_at then
        v_withhold_reason := null;
      elsif v_current_run.id::text > v_run.id::text then
        -- Equal completed_at: stable forecast_run_id tie-break (higher wins).
        v_withhold_reason := 'OLDER_SOURCE_VERSION';
      else
        v_withhold_reason := null;
      end if;
      -- source_token differences never override completed_at / id ordering.
    end if;
  end if;

  if v_withhold_reason is not null then
    insert into public.sku_forecast_publications (
      forecast_run_id,
      sku_forecast_id,
      organization_id,
      store_id,
      location_id,
      variant_id,
      forecast_as_of,
      source_token,
      outcome,
      withhold_reason,
      supersedes_publication_id,
      algorithm_version,
      configuration_version,
      reproducibility_fingerprint,
      daily_demand,
      mode,
      data_sufficiency,
      confidence,
      m7_eligible,
      persist_claims_post_commit_freshness
    ) values (
      v_run.id,
      v_forecast.id,
      v_run.organization_id,
      v_run.store_id,
      v_run.location_id,
      v_run.variant_id,
      v_run.forecast_as_of,
      v_run.source_token,
      'withheld',
      v_withhold_reason,
      null,
      v_run.algorithm_version,
      v_run.configuration_version,
      v_run.reproducibility_fingerprint,
      v_forecast.daily_demand,
      v_forecast.mode,
      v_forecast.data_sufficiency,
      v_forecast.confidence,
      false,
      false
    )
    returning id into v_publication_id;

    return jsonb_build_object(
      'ok', true,
      'disposition', 'withheld',
      'outcome', 'withheld',
      'withholdReason', v_withhold_reason,
      'publicationId', v_publication_id,
      'forecastRunId', v_run.id,
      'skuForecastId', v_forecast.id,
      'sourceToken', v_run.source_token,
      'm7Eligible', false,
      'persistClaimsPostCommitFreshness', false,
      'pointerAdvanced', false
    );
  end if;

  if v_current_found then
    v_supersedes := v_current.publication_id;
  else
    v_supersedes := null;
  end if;

  begin
    insert into public.sku_forecast_publications (
      forecast_run_id,
      sku_forecast_id,
      organization_id,
      store_id,
      location_id,
      variant_id,
      forecast_as_of,
      source_token,
      outcome,
      withhold_reason,
      supersedes_publication_id,
      algorithm_version,
      configuration_version,
      reproducibility_fingerprint,
      daily_demand,
      mode,
      data_sufficiency,
      confidence,
      m7_eligible,
      persist_claims_post_commit_freshness
    ) values (
      v_run.id,
      v_forecast.id,
      v_run.organization_id,
      v_run.store_id,
      v_run.location_id,
      v_run.variant_id,
      v_run.forecast_as_of,
      v_run.source_token,
      'published',
      null,
      v_supersedes,
      v_run.algorithm_version,
      v_run.configuration_version,
      v_run.reproducibility_fingerprint,
      v_forecast.daily_demand,
      v_forecast.mode,
      v_forecast.data_sufficiency,
      v_forecast.confidence,
      false,
      false
    )
    returning id into v_publication_id;

    v_disposition := 'published';
  exception
    when unique_violation then
      select *
      into v_existing_pub
      from public.sku_forecast_publications as p
      where
        p.forecast_run_id = v_run.id
        and p.outcome = 'published';

      if not found then
        raise;
      end if;

      return jsonb_build_object(
        'ok', true,
        'disposition', 'replayed',
        'outcome', 'published',
        'publicationId', v_existing_pub.id,
        'forecastRunId', v_run.id,
        'skuForecastId', v_forecast.id,
        'sourceToken', v_existing_pub.source_token,
        'm7Eligible', false,
        'persistClaimsPostCommitFreshness', false,
        'pointerAdvanced', false
      );
  end;

  insert into public.sku_forecast_current (
    organization_id,
    store_id,
    location_id,
    variant_id,
    publication_id,
    forecast_run_id,
    sku_forecast_id,
    forecast_as_of,
    source_token,
    updated_at
  ) values (
    v_run.organization_id,
    v_run.store_id,
    v_run.location_id,
    v_run.variant_id,
    v_publication_id,
    v_run.id,
    v_forecast.id,
    v_run.forecast_as_of,
    v_run.source_token,
    pg_catalog.now()
  )
  on conflict on constraint sku_forecast_current_pk
  do update set
    publication_id = excluded.publication_id,
    forecast_run_id = excluded.forecast_run_id,
    sku_forecast_id = excluded.sku_forecast_id,
    forecast_as_of = excluded.forecast_as_of,
    source_token = excluded.source_token,
    updated_at = pg_catalog.now();

  return jsonb_build_object(
    'ok', true,
    'disposition', v_disposition,
    'outcome', 'published',
    'publicationId', v_publication_id,
    'forecastRunId', v_run.id,
    'skuForecastId', v_forecast.id,
    'sourceToken', v_run.source_token,
    'm7Eligible', false,
    'persistClaimsPostCommitFreshness', false,
    'pointerAdvanced', true,
    'supersedesPublicationId', v_supersedes
  );
end;
$$;

revoke all
on function public.publish_sku_forecast(uuid)
from public, anon, authenticated;

grant execute
on function public.publish_sku_forecast(uuid)
to service_role;
