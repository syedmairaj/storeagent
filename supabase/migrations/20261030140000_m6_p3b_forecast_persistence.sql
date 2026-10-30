-- StoreAgent M6 P3b
-- Local forecast persistence foundation (LOCAL-ONLY until hosted approval).
--
-- Completed-only durable forecast_runs + 1:1 sku_forecasts.
-- Failed attempts create no historical row (atomic rollback).
--
-- persist_forecast_sku_demand_result:
--   1) Validate org/store/location/variant linkage independently of JSON.
--   2) Re-call forecast_sku_demand_source_snapshot INSIDE this transaction.
--   3) Reject source_token mismatch (STALE_SOURCE_TOKEN); no insert.
--   4) Insert run + forecast atomically. Idempotent on natural key.
--
-- No global SHARE locks. Snapshot uses its own statement_timeout/lock_timeout.
--
-- Remaining race (documented, not claimed solved):
--   Commerce/evidence may change after the in-TX revalidation snapshot and
--   before commit completes. Persisted rows prove identity for the validated
--   source_token only. They do NOT prove permanent freshness after commit.
--   P3d publication must revalidate separately.
--
-- No current pointer, publication, CI fabrication, or M7 eligibility.

-- -----------------------------------------------------------------------------
-- Immutability guard
-- -----------------------------------------------------------------------------

create or replace function public.prevent_forecast_persistence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    using
      errcode = 'P0001',
      message = format(
        'forecast persistence rows are immutable (%s on %s)',
        tg_op,
        tg_table_name
      );
end;
$$;

-- -----------------------------------------------------------------------------
-- forecast_runs
-- -----------------------------------------------------------------------------

create table public.forecast_runs (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,

  forecast_as_of date not null,
  lookback_days integer not null,
  time_zone text not null,
  input_start_date date not null,
  input_end_date date not null,

  status text not null
    default 'completed',

  algorithm_name text not null,
  algorithm_version text not null,
  configuration_version text not null,
  algorithm_versions jsonb not null,

  source_token text not null,
  reproducibility_fingerprint text not null,

  parameters jsonb not null
    default '{}'::jsonb,
  provenance jsonb not null,

  started_at timestamptz not null
    default pg_catalog.now(),
  completed_at timestamptz not null
    default pg_catalog.now(),
  created_at timestamptz not null
    default pg_catalog.now(),

  constraint forecast_runs_status_check
    check (status = 'completed'),

  constraint forecast_runs_lookback_check
    check (lookback_days >= 1 and lookback_days <= 365),

  constraint forecast_runs_window_check
    check (
      input_end_date = forecast_as_of
      and input_start_date <= input_end_date
    ),

  constraint forecast_runs_source_token_check
    check (source_token ~ '^[a-f0-9]{32}$'),

  constraint forecast_runs_fingerprint_not_blank
    check (pg_catalog.length(pg_catalog.btrim(reproducibility_fingerprint)) > 0),

  constraint forecast_runs_algorithm_not_blank
    check (
      pg_catalog.length(pg_catalog.btrim(algorithm_name)) > 0
      and pg_catalog.length(pg_catalog.btrim(algorithm_version)) > 0
      and pg_catalog.length(pg_catalog.btrim(configuration_version)) > 0
      and pg_catalog.length(pg_catalog.btrim(time_zone)) > 0
    ),

  constraint forecast_runs_organization_fk
    foreign key (organization_id)
    references public.organizations (id)
    on delete restrict,

  constraint forecast_runs_store_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete restrict,

  constraint forecast_runs_location_fk
    foreign key (organization_id, store_id, location_id)
    references public.locations (organization_id, store_id, id)
    on delete restrict,

  constraint forecast_runs_variant_fk
    foreign key (organization_id, store_id, variant_id)
    references public.product_variants (organization_id, store_id, id)
    on delete restrict
);

create unique index forecast_runs_idempotency_uidx
  on public.forecast_runs (
    organization_id,
    store_id,
    location_id,
    variant_id,
    forecast_as_of,
    algorithm_version,
    configuration_version,
    source_token
  );

create index forecast_runs_org_store_as_of_idx
  on public.forecast_runs (
    organization_id,
    store_id,
    forecast_as_of
  );

create trigger forecast_runs_immutable
before update or delete on public.forecast_runs
for each row
execute function public.prevent_forecast_persistence_mutation();

alter table public.forecast_runs enable row level security;

revoke all
on table public.forecast_runs
from public, anon, authenticated, service_role;

grant select
on table public.forecast_runs
to authenticated, service_role;

create policy forecast_runs_select_member
on public.forecast_runs
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where
      membership.organization_id = forecast_runs.organization_id
      and membership.user_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- sku_forecasts (1:1 with completed run)
-- -----------------------------------------------------------------------------

create table public.sku_forecasts (
  id uuid primary key
    default gen_random_uuid(),

  forecast_run_id uuid not null
    unique,

  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,

  daily_demand numeric null,
  mode text not null,
  data_sufficiency text not null,
  confidence text not null,

  weighted_daily_demand numeric null,
  trend_applied boolean not null,
  trend_adjusted_daily_demand numeric null,

  active_windows jsonb not null,
  quality jsonb not null,
  horizons jsonb not null,
  reason_codes jsonb not null,
  classified_days jsonb not null,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint sku_forecasts_run_fk
    foreign key (forecast_run_id)
    references public.forecast_runs (id)
    on delete restrict,

  constraint sku_forecasts_organization_fk
    foreign key (organization_id)
    references public.organizations (id)
    on delete restrict,

  constraint sku_forecasts_store_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete restrict,

  constraint sku_forecasts_location_fk
    foreign key (organization_id, store_id, location_id)
    references public.locations (organization_id, store_id, id)
    on delete restrict,

  constraint sku_forecasts_variant_fk
    foreign key (organization_id, store_id, variant_id)
    references public.product_variants (organization_id, store_id, id)
    on delete restrict,

  constraint sku_forecasts_mode_check
    check (mode in ('standard', 'limited_history', 'unavailable')),

  constraint sku_forecasts_sufficiency_check
    check (
      data_sufficiency in ('sufficient', 'limited', 'insufficient')
    ),

  constraint sku_forecasts_confidence_check
    check (confidence in ('high', 'medium', 'low', 'none')),

  constraint sku_forecasts_json_array_checks
    check (
      jsonb_typeof(active_windows) = 'array'
      and jsonb_typeof(reason_codes) = 'array'
      and jsonb_typeof(classified_days) = 'array'
      and jsonb_typeof(quality) = 'object'
      and jsonb_typeof(horizons) = 'object'
    )
);

create index sku_forecasts_org_store_grain_idx
  on public.sku_forecasts (
    organization_id,
    store_id,
    location_id,
    variant_id
  );

create trigger sku_forecasts_immutable
before update or delete on public.sku_forecasts
for each row
execute function public.prevent_forecast_persistence_mutation();

alter table public.sku_forecasts enable row level security;

revoke all
on table public.sku_forecasts
from public, anon, authenticated, service_role;

grant select
on table public.sku_forecasts
to authenticated, service_role;

create policy sku_forecasts_select_member
on public.sku_forecasts
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where
      membership.organization_id = sku_forecasts.organization_id
      and membership.user_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- Persist RPC
-- -----------------------------------------------------------------------------

create or replace function public.persist_forecast_sku_demand_result(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_forecast_as_of date,
  p_lookback_days integer,
  p_source_token text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_snapshot_token text;
  v_time_zone text;
  v_input_start date;
  v_input_end date;
  v_lookback integer;
  v_algorithm_version text;
  v_configuration_version text;
  v_algorithm_versions jsonb;
  v_fingerprint text;
  v_provenance jsonb;
  v_parameters jsonb;
  v_daily_demand numeric;
  v_mode text;
  v_data_sufficiency text;
  v_confidence text;
  v_weighted numeric;
  v_trend_applied boolean;
  v_trend_adjusted numeric;
  v_active_windows jsonb;
  v_quality jsonb;
  v_horizons jsonb;
  v_reason_codes jsonb;
  v_classified_days jsonb;
  v_run_id uuid;
  v_forecast_id uuid;
  v_existing_run public.forecast_runs%rowtype;
  v_existing_forecast public.sku_forecasts%rowtype;
  v_disposition text;
begin
  if to_regprocedure(
    'public.forecast_sku_demand_source_snapshot(uuid,uuid,uuid,uuid,date,integer)'
  ) is null
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence requires forecast_sku_demand_source_snapshot';
  end if;

  if p_organization_id is null
    or p_store_id is null
    or p_location_id is null
    or p_variant_id is null
    or p_forecast_as_of is null
    or p_source_token is null
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence requires grain, as_of, source_token, and object payload';
  end if;

  v_lookback := coalesce(p_lookback_days, 90);
  if v_lookback < 1 or v_lookback > 365 then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence lookbackDays must be an integer from 1 to 365';
  end if;

  if p_source_token !~ '^[a-f0-9]{32}$' then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence source_token must be an md5 hex digest';
  end if;

  -- Independent grain linkage (do not trust JSON scope).
  if not exists (
    select 1
    from public.stores as s
    where
      s.organization_id = p_organization_id
      and s.id = p_store_id
  ) then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence scope error: store';
  end if;

  if not exists (
    select 1
    from public.locations as l
    where
      l.organization_id = p_organization_id
      and l.store_id = p_store_id
      and l.id = p_location_id
  ) then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence scope error: location';
  end if;

  if not exists (
    select 1
    from public.product_variants as pv
    where
      pv.organization_id = p_organization_id
      and pv.store_id = p_store_id
      and pv.id = p_variant_id
  ) then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence scope error: variant';
  end if;

  -- Reject forged grain inside payload when present.
  if (
    p_payload ? 'organizationId'
    and p_payload->>'organizationId' is distinct from p_organization_id::text
  )
  or (
    p_payload ? 'storeId'
    and p_payload->>'storeId' is distinct from p_store_id::text
  )
  or (
    p_payload ? 'locationId'
    and p_payload->>'locationId' is distinct from p_location_id::text
  )
  or (
    p_payload ? 'variantId'
    and p_payload->>'variantId' is distinct from p_variant_id::text
  )
  or (
    p_payload ? 'forecastAsOf'
    and p_payload->>'forecastAsOf' is distinct from p_forecast_as_of::text
  )
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence payload grain does not match authorized scope';
  end if;

  if p_payload ? 'trustedCompleteDates' then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence rejects trustedCompleteDates';
  end if;

  -- In-TX sourceToken revalidation (same transaction as insert).
  v_snapshot := public.forecast_sku_demand_source_snapshot(
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id,
    p_forecast_as_of,
    v_lookback
  );

  v_snapshot_token := v_snapshot->>'sourceToken';
  if v_snapshot_token is distinct from p_source_token then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence STALE_SOURCE_TOKEN';
  end if;

  v_time_zone := v_snapshot->>'timeZone';
  v_input_start := (v_snapshot->>'inputStartDate')::date;
  v_input_end := (v_snapshot->>'inputEndDate')::date;

  if v_time_zone is null
    or v_input_start is null
    or v_input_end is null
    or v_input_end is distinct from p_forecast_as_of
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence snapshot window is malformed';
  end if;

  v_algorithm_version := nullif(pg_catalog.btrim(p_payload->>'algorithmVersion'), '');
  v_configuration_version := nullif(
    pg_catalog.btrim(p_payload->>'configurationVersion'),
    ''
  );
  v_algorithm_versions := p_payload->'algorithmVersions';
  v_fingerprint := nullif(
    pg_catalog.btrim(p_payload->>'reproducibilityFingerprint'),
    ''
  );
  v_provenance := coalesce(p_payload->'provenance', '{}'::jsonb);
  v_parameters := coalesce(p_payload->'parameters', '{}'::jsonb);

  if v_algorithm_version is null
    or v_configuration_version is null
    or v_algorithm_versions is null
    or jsonb_typeof(v_algorithm_versions) <> 'object'
    or v_fingerprint is null
    or jsonb_typeof(v_provenance) <> 'object'
    or jsonb_typeof(v_parameters) <> 'object'
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence payload missing required version/fingerprint/provenance';
  end if;

  if p_payload->'dailyDemand' is null
    or jsonb_typeof(p_payload->'dailyDemand') = 'null'
  then
    -- Nullable/withheld demand is stored as SQL NULL (never invented).
    v_daily_demand := null;
  else
    begin
      v_daily_demand := (p_payload->>'dailyDemand')::numeric;
    exception
      when others then
        raise exception
          using
            errcode = 'P0001',
            message = 'forecast persistence dailyDemand is malformed';
    end;
  end if;

  v_mode := p_payload->>'mode';
  v_data_sufficiency := p_payload->>'dataSufficiency';
  v_confidence := p_payload->>'confidence';
  v_trend_applied := coalesce((p_payload->>'trendApplied')::boolean, false);
  v_active_windows := coalesce(p_payload->'activeWindows', '[]'::jsonb);
  v_quality := p_payload->'quality';
  v_horizons := p_payload->'horizons';
  v_reason_codes := coalesce(p_payload->'reasonCodes', '[]'::jsonb);
  v_classified_days := coalesce(p_payload->'classifiedDays', '[]'::jsonb);

  if v_mode is null
    or v_data_sufficiency is null
    or v_confidence is null
    or v_quality is null
    or jsonb_typeof(v_quality) <> 'object'
    or v_horizons is null
    or jsonb_typeof(v_horizons) <> 'object'
    or jsonb_typeof(v_active_windows) <> 'array'
    or jsonb_typeof(v_reason_codes) <> 'array'
    or jsonb_typeof(v_classified_days) <> 'array'
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast persistence payload missing required forecast body fields';
  end if;

  if p_payload->'weightedDailyDemand' is null
    or jsonb_typeof(p_payload->'weightedDailyDemand') = 'null'
  then
    v_weighted := null;
  else
    v_weighted := (p_payload->>'weightedDailyDemand')::numeric;
  end if;

  if p_payload->'trendAdjustedDailyDemand' is null
    or jsonb_typeof(p_payload->'trendAdjustedDailyDemand') = 'null'
  then
    v_trend_adjusted := null;
  else
    v_trend_adjusted := (p_payload->>'trendAdjustedDailyDemand')::numeric;
  end if;

  -- Stamp write-time token validation into provenance (still not post-commit freshness).
  v_provenance := v_provenance || jsonb_build_object(
    'sourceToken', p_source_token,
    'sourceTokenRevalidatedInPersistTx', true,
    'persistClaimsPostCommitFreshness', false
  );

  begin
    insert into public.forecast_runs (
      organization_id,
      store_id,
      location_id,
      variant_id,
      forecast_as_of,
      lookback_days,
      time_zone,
      input_start_date,
      input_end_date,
      status,
      algorithm_name,
      algorithm_version,
      configuration_version,
      algorithm_versions,
      source_token,
      reproducibility_fingerprint,
      parameters,
      provenance
    ) values (
      p_organization_id,
      p_store_id,
      p_location_id,
      p_variant_id,
      p_forecast_as_of,
      v_lookback,
      v_time_zone,
      v_input_start,
      v_input_end,
      'completed',
      'forecast-orchestrator',
      v_algorithm_version,
      v_configuration_version,
      v_algorithm_versions,
      p_source_token,
      v_fingerprint,
      v_parameters,
      v_provenance
    )
    returning id into v_run_id;

    insert into public.sku_forecasts (
      forecast_run_id,
      organization_id,
      store_id,
      location_id,
      variant_id,
      daily_demand,
      mode,
      data_sufficiency,
      confidence,
      weighted_daily_demand,
      trend_applied,
      trend_adjusted_daily_demand,
      active_windows,
      quality,
      horizons,
      reason_codes,
      classified_days
    ) values (
      v_run_id,
      p_organization_id,
      p_store_id,
      p_location_id,
      p_variant_id,
      v_daily_demand,
      v_mode,
      v_data_sufficiency,
      v_confidence,
      v_weighted,
      v_trend_applied,
      v_trend_adjusted,
      v_active_windows,
      v_quality,
      v_horizons,
      v_reason_codes,
      v_classified_days
    )
    returning id into v_forecast_id;

    v_disposition := 'created';
  exception
    when unique_violation then
      select *
      into v_existing_run
      from public.forecast_runs as r
      where
        r.organization_id = p_organization_id
        and r.store_id = p_store_id
        and r.location_id = p_location_id
        and r.variant_id = p_variant_id
        and r.forecast_as_of = p_forecast_as_of
        and r.algorithm_version = v_algorithm_version
        and r.configuration_version = v_configuration_version
        and r.source_token = p_source_token;

      if not found then
        raise;
      end if;

      select *
      into v_existing_forecast
      from public.sku_forecasts as f
      where f.forecast_run_id = v_existing_run.id;

      if not found then
        raise exception
          using
            errcode = 'P0001',
            message = 'forecast persistence idempotency found run without sku_forecast';
      end if;

      if v_existing_run.reproducibility_fingerprint is distinct from v_fingerprint
        or v_existing_forecast.daily_demand is distinct from v_daily_demand
        or v_existing_forecast.mode is distinct from v_mode
        or v_existing_forecast.data_sufficiency is distinct from v_data_sufficiency
        or v_existing_forecast.confidence is distinct from v_confidence
        or v_existing_forecast.weighted_daily_demand is distinct from v_weighted
        or v_existing_forecast.trend_applied is distinct from v_trend_applied
        or v_existing_forecast.trend_adjusted_daily_demand
          is distinct from v_trend_adjusted
        or v_existing_forecast.active_windows is distinct from v_active_windows
        or v_existing_forecast.quality is distinct from v_quality
        or v_existing_forecast.horizons is distinct from v_horizons
        or v_existing_forecast.reason_codes is distinct from v_reason_codes
        or v_existing_forecast.classified_days is distinct from v_classified_days
        or v_existing_run.algorithm_versions is distinct from v_algorithm_versions
      then
        raise exception
          using
            errcode = 'P0001',
            message = 'forecast persistence IDEMPOTENCY_BODY_CONFLICT';
      end if;

      v_run_id := v_existing_run.id;
      v_forecast_id := v_existing_forecast.id;
      v_disposition := 'replayed';
  end;

  return jsonb_build_object(
    'ok', true,
    'disposition', v_disposition,
    'forecastRunId', v_run_id,
    'skuForecastId', v_forecast_id,
    'sourceToken', p_source_token,
    'status', 'completed',
    'persistClaimsPostCommitFreshness', false
  );
end;
$$;

revoke all
on function public.persist_forecast_sku_demand_result(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  integer,
  text,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.persist_forecast_sku_demand_result(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  integer,
  text,
  jsonb
)
to service_role;
