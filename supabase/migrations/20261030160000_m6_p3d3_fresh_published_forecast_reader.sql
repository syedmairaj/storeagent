-- StoreAgent M6 P3d.3
-- Freshness-gated published forecast reader (LOCAL-ONLY until hosted approval).
--
-- One SECURITY DEFINER RPC: read_fresh_published_sku_forecast.
-- service_role EXECUTE only. search_path = ''.
--
-- Purpose:
--   Read the current publication pointer for an exact grain, revalidate
--   sourceToken via forecast_sku_demand_source_snapshot, and decide whether
--   the published dailyDemand may be treated as V1 M7-numeric-eligible.
--
-- Guarantees:
--   1) Pointer existence is NOT freshness proof.
--   2) Token equality proves check-time identity only — not acceptable
--      forecast age. Forecast-age policy is reserved for M7.
--   3) Never falls back to historical / superseded publications.
--   4) No global table SHARE locks. Row FOR SHARE on the exact current
--      pointer serializes with publishers' FOR UPDATE.
--   5) Remaining race (documented): commerce/evidence may change after this
--      RPC returns. Result is check-time only.
--
-- Bounds: statement_timeout=15s, lock_timeout=2s.

create or replace function public.read_fresh_published_sku_forecast(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_freshness_limitation constant text :=
    'read_fresh_published_sku_forecast proves source_token identity and '
    'publication gates at check time only; it does not prove post-return '
    'freshness or acceptable forecast age. M7 owns forecast-age policy and '
    'must revalidate before acting.';

  v_current public.sku_forecast_current%rowtype;
  v_publication public.sku_forecast_publications%rowtype;
  v_run public.forecast_runs%rowtype;
  v_forecast public.sku_forecasts%rowtype;
  v_snapshot jsonb;
  v_snapshot_token text;
  v_pending_count integer;
  v_pending_stamp boolean;
  v_reread public.sku_forecast_current%rowtype;
  v_disposition text;
  v_daily_demand numeric;
begin
  perform pg_catalog.set_config('statement_timeout', '15s', true);
  perform pg_catalog.set_config('lock_timeout', '2s', true);

  if to_regprocedure(
    'public.forecast_sku_demand_source_snapshot(uuid,uuid,uuid,uuid,date,integer)'
  ) is null
  then
    raise exception
      using
        errcode = 'P0001',
        message =
          'fresh published forecast reader requires forecast_sku_demand_source_snapshot';
  end if;

  if p_organization_id is null
    or p_store_id is null
    or p_location_id is null
    or p_variant_id is null
  then
    raise exception
      using
        errcode = 'P0001',
        message =
          'fresh published forecast reader requires organization, store, location, and variant';
  end if;

  -- Exact current-pointer row lock only (no table SHARE).
  select *
  into v_current
  from public.sku_forecast_current as c
  where
    c.organization_id = p_organization_id
    and c.store_id = p_store_id
    and c.location_id = p_location_id
    and c.variant_id = p_variant_id
  for share;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'disposition', 'ABSENT',
      'm7NumericEligible', false,
      'dailyDemand', null,
      'claimsPostCommitFreshness', false,
      'freshnessLimitation', c_freshness_limitation,
      'grain', jsonb_build_object(
        'organizationId', p_organization_id,
        'storeId', p_store_id,
        'locationId', p_location_id,
        'variantId', p_variant_id
      ),
      'publicationId', null,
      'forecastRunId', null,
      'skuForecastId', null,
      'sourceToken', null,
      'forecastAsOf', null,
      'lookbackDays', null,
      'confidence', null,
      'mode', null,
      'dataSufficiency', null
    );
  end if;

  select *
  into v_publication
  from public.sku_forecast_publications as p
  where p.id = v_current.publication_id;

  if not found
    or v_publication.outcome is distinct from 'published'
  then
    return jsonb_build_object(
      'ok', true,
      'disposition', 'FORECAST_UNAVAILABLE',
      'm7NumericEligible', false,
      'dailyDemand', null,
      'claimsPostCommitFreshness', false,
      'freshnessLimitation', c_freshness_limitation,
      'grain', jsonb_build_object(
        'organizationId', p_organization_id,
        'storeId', p_store_id,
        'locationId', p_location_id,
        'variantId', p_variant_id
      ),
      'publicationId', v_current.publication_id,
      'forecastRunId', v_current.forecast_run_id,
      'skuForecastId', v_current.sku_forecast_id,
      'sourceToken', v_current.source_token,
      'forecastAsOf', v_current.forecast_as_of,
      'lookbackDays', null,
      'confidence', null,
      'mode', null,
      'dataSufficiency', null
    );
  end if;

  select *
  into v_run
  from public.forecast_runs as r
  where r.id = v_current.forecast_run_id;

  if not found
    or v_run.status is distinct from 'completed'
    or v_publication.forecast_run_id is distinct from v_current.forecast_run_id
    or v_publication.sku_forecast_id is distinct from v_current.sku_forecast_id
  then
    return jsonb_build_object(
      'ok', true,
      'disposition', 'FORECAST_UNAVAILABLE',
      'm7NumericEligible', false,
      'dailyDemand', null,
      'claimsPostCommitFreshness', false,
      'freshnessLimitation', c_freshness_limitation,
      'grain', jsonb_build_object(
        'organizationId', p_organization_id,
        'storeId', p_store_id,
        'locationId', p_location_id,
        'variantId', p_variant_id
      ),
      'publicationId', v_current.publication_id,
      'forecastRunId', v_current.forecast_run_id,
      'skuForecastId', v_current.sku_forecast_id,
      'sourceToken', v_current.source_token,
      'forecastAsOf', v_current.forecast_as_of,
      'lookbackDays', null,
      'confidence', null,
      'mode', null,
      'dataSufficiency', null
    );
  end if;

  select *
  into v_forecast
  from public.sku_forecasts as f
  where f.id = v_current.sku_forecast_id;

  if not found
    or v_forecast.forecast_run_id is distinct from v_run.id
  then
    return jsonb_build_object(
      'ok', true,
      'disposition', 'FORECAST_UNAVAILABLE',
      'm7NumericEligible', false,
      'dailyDemand', null,
      'claimsPostCommitFreshness', false,
      'freshnessLimitation', c_freshness_limitation,
      'grain', jsonb_build_object(
        'organizationId', p_organization_id,
        'storeId', p_store_id,
        'locationId', p_location_id,
        'variantId', p_variant_id
      ),
      'publicationId', v_current.publication_id,
      'forecastRunId', v_current.forecast_run_id,
      'skuForecastId', v_current.sku_forecast_id,
      'sourceToken', v_current.source_token,
      'forecastAsOf', v_current.forecast_as_of,
      'lookbackDays', v_run.lookback_days,
      'confidence', null,
      'mode', null,
      'dataSufficiency', null
    );
  end if;

  -- Full grain consistency across pointer, publication, run, and forecast.
  if v_current.organization_id is distinct from p_organization_id
    or v_current.store_id is distinct from p_store_id
    or v_current.location_id is distinct from p_location_id
    or v_current.variant_id is distinct from p_variant_id
    or v_publication.organization_id is distinct from p_organization_id
    or v_publication.store_id is distinct from p_store_id
    or v_publication.location_id is distinct from p_location_id
    or v_publication.variant_id is distinct from p_variant_id
    or v_run.organization_id is distinct from p_organization_id
    or v_run.store_id is distinct from p_store_id
    or v_run.location_id is distinct from p_location_id
    or v_run.variant_id is distinct from p_variant_id
    or v_forecast.organization_id is distinct from p_organization_id
    or v_forecast.store_id is distinct from p_store_id
    or v_forecast.location_id is distinct from p_location_id
    or v_forecast.variant_id is distinct from p_variant_id
    or v_current.forecast_as_of is distinct from v_run.forecast_as_of
    or v_current.forecast_as_of is distinct from v_publication.forecast_as_of
    or v_current.source_token is distinct from v_run.source_token
    or v_current.source_token is distinct from v_publication.source_token
  then
    return jsonb_build_object(
      'ok', true,
      'disposition', 'FORECAST_UNAVAILABLE',
      'm7NumericEligible', false,
      'dailyDemand', null,
      'claimsPostCommitFreshness', false,
      'freshnessLimitation', c_freshness_limitation,
      'grain', jsonb_build_object(
        'organizationId', p_organization_id,
        'storeId', p_store_id,
        'locationId', p_location_id,
        'variantId', p_variant_id
      ),
      'publicationId', v_current.publication_id,
      'forecastRunId', v_current.forecast_run_id,
      'skuForecastId', v_current.sku_forecast_id,
      'sourceToken', v_current.source_token,
      'forecastAsOf', v_current.forecast_as_of,
      'lookbackDays', v_run.lookback_days,
      'confidence', v_forecast.confidence,
      'mode', v_forecast.mode,
      'dataSufficiency', v_forecast.data_sufficiency
    );
  end if;

  perform pg_catalog.set_config('statement_timeout', '15s', true);
  perform pg_catalog.set_config('lock_timeout', '2s', true);

  v_snapshot := public.forecast_sku_demand_source_snapshot(
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id,
    v_run.forecast_as_of,
    v_run.lookback_days
  );

  perform pg_catalog.set_config('statement_timeout', '15s', true);
  perform pg_catalog.set_config('lock_timeout', '2s', true);

  v_snapshot_token := v_snapshot->>'sourceToken';
  if v_snapshot_token is distinct from v_current.source_token then
    v_disposition := 'STALE';
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
      v_disposition := 'PENDING_CORRECTION';
    elsif v_forecast.mode not in ('standard', 'limited_history')
      or v_forecast.data_sufficiency not in ('sufficient', 'limited')
      or v_forecast.daily_demand is null
    then
      v_disposition := 'FORECAST_UNAVAILABLE';
    elsif v_forecast.confidence in ('low', 'none') then
      v_disposition := 'FORECAST_CONFIDENCE_LOW';
    elsif v_forecast.confidence not in ('medium', 'high') then
      v_disposition := 'FORECAST_UNAVAILABLE';
    elsif v_forecast.daily_demand < 0
      or v_forecast.daily_demand <> v_forecast.daily_demand
    then
      v_disposition := 'FORECAST_UNAVAILABLE';
    else
      v_disposition := 'eligible';
      v_daily_demand := v_forecast.daily_demand;
    end if;
  end if;

  -- Defensive re-read under the same row share lock.
  select *
  into v_reread
  from public.sku_forecast_current as c
  where
    c.organization_id = p_organization_id
    and c.store_id = p_store_id
    and c.location_id = p_location_id
    and c.variant_id = p_variant_id
  for share;

  if not found
    or v_reread.publication_id is distinct from v_current.publication_id
    or v_reread.forecast_run_id is distinct from v_current.forecast_run_id
    or v_reread.sku_forecast_id is distinct from v_current.sku_forecast_id
    or v_reread.source_token is distinct from v_current.source_token
    or v_reread.forecast_as_of is distinct from v_current.forecast_as_of
  then
    v_disposition := 'STALE';
    v_daily_demand := null;
  end if;

  if v_disposition is distinct from 'eligible' then
    return jsonb_build_object(
      'ok', true,
      'disposition', v_disposition,
      'm7NumericEligible', false,
      'dailyDemand', null,
      'claimsPostCommitFreshness', false,
      'freshnessLimitation', c_freshness_limitation,
      'grain', jsonb_build_object(
        'organizationId', p_organization_id,
        'storeId', p_store_id,
        'locationId', p_location_id,
        'variantId', p_variant_id
      ),
      'publicationId', v_current.publication_id,
      'forecastRunId', v_current.forecast_run_id,
      'skuForecastId', v_current.sku_forecast_id,
      'sourceToken', v_current.source_token,
      'forecastAsOf', v_run.forecast_as_of,
      'lookbackDays', v_run.lookback_days,
      'confidence', v_forecast.confidence,
      'mode', v_forecast.mode,
      'dataSufficiency', v_forecast.data_sufficiency
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'disposition', 'eligible',
    'm7NumericEligible', true,
    'dailyDemand', v_daily_demand,
    'claimsPostCommitFreshness', false,
    'freshnessLimitation', c_freshness_limitation,
    'grain', jsonb_build_object(
      'organizationId', p_organization_id,
      'storeId', p_store_id,
      'locationId', p_location_id,
      'variantId', p_variant_id
    ),
    'publicationId', v_current.publication_id,
    'forecastRunId', v_current.forecast_run_id,
    'skuForecastId', v_current.sku_forecast_id,
    'sourceToken', v_current.source_token,
    'forecastAsOf', v_run.forecast_as_of,
    'lookbackDays', v_run.lookback_days,
    'confidence', v_forecast.confidence,
    'mode', v_forecast.mode,
    'dataSufficiency', v_forecast.data_sufficiency
  );
end;
$$;

revoke all
on function public.read_fresh_published_sku_forecast(uuid, uuid, uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.read_fresh_published_sku_forecast(uuid, uuid, uuid, uuid)
to service_role;
