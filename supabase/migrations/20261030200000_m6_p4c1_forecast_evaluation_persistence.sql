-- StoreAgent M6 P4c.1
-- Immutable forecast evaluation persistence (LOCAL-ONLY until hosted approval).
--
-- Diagnostic sink for P4a/P4b results. Does not publish forecasts, change
-- algorithm defaults, grant M7 eligibility, or claim production approval.
--
-- Identity: grain + fixture_fingerprint + origin window + lookback +
-- harness/integrity/metric/config/orchestrator versions +
-- algorithm_versions_fingerprint.
--
-- Accepted controlled PIT diagnostics (preliminary / insufficient sample)
-- persist three model-score children. Integrity rejections and
-- non-scored dispositions persist audit-only runs with ZERO score children.
--
-- Idempotent same-body replay; same-key different-body → conflict.
-- No trustedCompleteDates. No full per-origin JSON in V1.

-- -----------------------------------------------------------------------------
-- Immutability
-- -----------------------------------------------------------------------------

create or replace function public.prevent_forecast_evaluation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    using
      errcode = 'P0001',
      message = format(
        'forecast evaluation rows are immutable (%s on %s)',
        tg_op,
        tg_table_name
      );
end;
$$;

-- -----------------------------------------------------------------------------
-- forecast_evaluation_runs
-- -----------------------------------------------------------------------------

create table public.forecast_evaluation_runs (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,

  origin_start date not null,
  origin_end date not null,
  lookback_days integer not null,
  harness_horizon_days integer not null
    default 1,

  harness_version text not null,
  integrity_version text not null,
  backtest_metric_version text not null,
  orchestrator_version text not null,
  configuration_version text not null,
  algorithm_versions jsonb not null,
  algorithm_versions_fingerprint text not null,

  fixture_fingerprint text not null,
  origins_hash text not null,
  result_fingerprint text not null,
  body_hash text not null,

  pinned_time_zone text not null,

  integrity_source_class text not null,
  integrity_disposition text not null,
  integrity_reason_codes jsonb not null
    default '[]'::jsonb,

  evaluation_disposition text not null,
  harness_reason_codes jsonb not null
    default '[]'::jsonb,

  demand_class text not null,
  origin_count integer not null,
  scored_dates date[] not null
    default '{}'::date[],
  segments jsonb not null
    default '[]'::jsonb,

  -- True only when three model-score children were persisted.
  is_scored_evaluation boolean not null,

  claims_production_approval boolean not null
    default false,
  claims_m7_numeric_eligibility boolean not null
    default false,
  algorithm_approved boolean not null
    default false,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint forecast_evaluation_runs_window_check
    check (origin_start <= origin_end),

  constraint forecast_evaluation_runs_lookback_check
    check (lookback_days >= 1 and lookback_days <= 365),

  constraint forecast_evaluation_runs_horizon_check
    check (harness_horizon_days = 1),

  constraint forecast_evaluation_runs_origin_count_check
    check (origin_count >= 0),

  constraint forecast_evaluation_runs_scored_dates_len_check
    check (pg_catalog.cardinality(scored_dates) = origin_count),

  constraint forecast_evaluation_runs_integrity_source_class_check
    check (
      integrity_source_class in (
        'controlled_pit_fixture',
        'unsupported_live_canonical',
        'partial_append_only'
      )
    ),

  constraint forecast_evaluation_runs_integrity_disposition_check
    check (
      integrity_disposition in (
        'accepted',
        'UNSUPPORTED_HISTORICAL_REPLAY',
        'INVALID_HISTORY'
      )
    ),

  constraint forecast_evaluation_runs_evaluation_disposition_check
    check (
      evaluation_disposition in (
        'preliminary',
        'INSUFFICIENT_BACKTEST_POINTS',
        'NO_ELIGIBLE_ORIGINS',
        'INVALID_HISTORY',
        'UNSUPPORTED_HISTORICAL_REPLAY'
      )
    ),

  constraint forecast_evaluation_runs_demand_class_check
    check (
      demand_class in ('smooth', 'intermittent', 'unknown')
    ),

  constraint forecast_evaluation_runs_trust_hard_false_check
    check (
      claims_production_approval = false
      and claims_m7_numeric_eligibility = false
      and algorithm_approved = false
    ),

  constraint forecast_evaluation_runs_scored_gate_check
    check (
      (
        is_scored_evaluation = true
        and integrity_disposition = 'accepted'
        and integrity_source_class = 'controlled_pit_fixture'
        and evaluation_disposition in (
          'preliminary',
          'INSUFFICIENT_BACKTEST_POINTS'
        )
        and origin_count >= 1
      )
      or (
        is_scored_evaluation = false
        and origin_count = 0
        and pg_catalog.cardinality(scored_dates) = 0
      )
    ),

  constraint forecast_evaluation_runs_versions_not_blank
    check (
      pg_catalog.length(pg_catalog.btrim(harness_version)) > 0
      and pg_catalog.length(pg_catalog.btrim(integrity_version)) > 0
      and pg_catalog.length(pg_catalog.btrim(backtest_metric_version)) > 0
      and pg_catalog.length(pg_catalog.btrim(orchestrator_version)) > 0
      and pg_catalog.length(pg_catalog.btrim(configuration_version)) > 0
      and pg_catalog.length(pg_catalog.btrim(pinned_time_zone)) > 0
      and pg_catalog.length(pg_catalog.btrim(fixture_fingerprint)) > 0
      and pg_catalog.length(pg_catalog.btrim(origins_hash)) > 0
      and pg_catalog.length(pg_catalog.btrim(result_fingerprint)) > 0
      and pg_catalog.length(pg_catalog.btrim(body_hash)) > 0
    ),

  constraint forecast_evaluation_runs_algo_fp_check
    check (algorithm_versions_fingerprint ~ '^[a-f0-9]{32}$'),

  constraint forecast_evaluation_runs_json_array_checks
    check (
      jsonb_typeof(algorithm_versions) = 'object'
      and jsonb_typeof(integrity_reason_codes) = 'array'
      and jsonb_typeof(harness_reason_codes) = 'array'
      and jsonb_typeof(segments) = 'array'
    ),

  constraint forecast_evaluation_runs_organization_fk
    foreign key (organization_id)
    references public.organizations (id)
    on delete restrict,

  constraint forecast_evaluation_runs_store_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete restrict,

  constraint forecast_evaluation_runs_location_fk
    foreign key (organization_id, store_id, location_id)
    references public.locations (organization_id, store_id, id)
    on delete restrict,

  constraint forecast_evaluation_runs_variant_fk
    foreign key (organization_id, store_id, variant_id)
    references public.product_variants (organization_id, store_id, id)
    on delete restrict
);

create unique index forecast_evaluation_runs_idempotency_uidx
  on public.forecast_evaluation_runs (
    organization_id,
    store_id,
    location_id,
    variant_id,
    fixture_fingerprint,
    origin_start,
    origin_end,
    lookback_days,
    harness_version,
    integrity_version,
    backtest_metric_version,
    configuration_version,
    orchestrator_version,
    algorithm_versions_fingerprint
  );

create index forecast_evaluation_runs_org_store_idx
  on public.forecast_evaluation_runs (
    organization_id,
    store_id,
    origin_start
  );

create trigger forecast_evaluation_runs_immutable
before update or delete on public.forecast_evaluation_runs
for each row
execute function public.prevent_forecast_evaluation_mutation();

alter table public.forecast_evaluation_runs enable row level security;

revoke all
on table public.forecast_evaluation_runs
from public, anon, authenticated, service_role;

grant select
on table public.forecast_evaluation_runs
to authenticated, service_role;

create policy forecast_evaluation_runs_select_member
on public.forecast_evaluation_runs
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where
      membership.organization_id =
        forecast_evaluation_runs.organization_id
      and membership.user_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- forecast_evaluation_model_scores
-- -----------------------------------------------------------------------------

create table public.forecast_evaluation_model_scores (
  id uuid primary key
    default gen_random_uuid(),

  evaluation_run_id uuid not null,

  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,

  model text not null,

  observation_count integer not null,
  mae numeric null,
  wape numeric null,
  bias_ratio numeric null,
  mase numeric null,

  total_actual_demand numeric not null,
  total_predicted_demand numeric not null,
  total_absolute_error numeric not null,
  total_signed_error numeric not null,

  metric_reason_codes jsonb not null
    default '[]'::jsonb,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint forecast_evaluation_model_scores_run_fk
    foreign key (evaluation_run_id)
    references public.forecast_evaluation_runs (id)
    on delete restrict,

  constraint forecast_evaluation_model_scores_store_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete restrict,

  constraint forecast_evaluation_model_scores_location_fk
    foreign key (organization_id, store_id, location_id)
    references public.locations (organization_id, store_id, id)
    on delete restrict,

  constraint forecast_evaluation_model_scores_variant_fk
    foreign key (organization_id, store_id, variant_id)
    references public.product_variants (organization_id, store_id, id)
    on delete restrict,

  constraint forecast_evaluation_model_scores_model_check
    check (model in ('candidate', 'naive_lag1', 'zero')),

  constraint forecast_evaluation_model_scores_observation_check
    check (observation_count >= 1),

  constraint forecast_evaluation_model_scores_totals_finite_check
    check (
      total_actual_demand >= 0
      and total_predicted_demand >= 0
      and total_absolute_error >= 0
    ),

  constraint forecast_evaluation_model_scores_json_array_check
    check (jsonb_typeof(metric_reason_codes) = 'array'),

  constraint forecast_evaluation_model_scores_run_model_unique
    unique (evaluation_run_id, model)
);

create index forecast_evaluation_model_scores_org_idx
  on public.forecast_evaluation_model_scores (
    organization_id,
    store_id,
    evaluation_run_id
  );

create trigger forecast_evaluation_model_scores_immutable
before update or delete on public.forecast_evaluation_model_scores
for each row
execute function public.prevent_forecast_evaluation_mutation();

alter table public.forecast_evaluation_model_scores enable row level security;

revoke all
on table public.forecast_evaluation_model_scores
from public, anon, authenticated, service_role;

grant select
on table public.forecast_evaluation_model_scores
to authenticated, service_role;

create policy forecast_evaluation_model_scores_select_member
on public.forecast_evaluation_model_scores
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where
      membership.organization_id =
        forecast_evaluation_model_scores.organization_id
      and membership.user_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.forecast_evaluation_assert_finite_numeric(
  p_value numeric,
  p_field text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null then
    return;
  end if;

  if p_value = 'nan'::numeric
    or p_value = 'infinity'::numeric
    or p_value = '-infinity'::numeric
  then
    raise exception
      using
        errcode = 'P0001',
        message = format(
          'forecast evaluation rejects non-finite %s',
          p_field
        );
  end if;
end;
$$;

revoke all
on function public.forecast_evaluation_assert_finite_numeric(numeric, text)
from public, anon, authenticated;

grant execute
on function public.forecast_evaluation_assert_finite_numeric(numeric, text)
to service_role;

-- -----------------------------------------------------------------------------
-- persist_forecast_evaluation_result
-- -----------------------------------------------------------------------------

create or replace function public.persist_forecast_evaluation_result(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_existing public.forecast_evaluation_runs%rowtype;
  v_score_count integer;
  v_disposition text;
  v_is_scored boolean;
  v_origin_count integer;
  v_scored_dates date[];
  v_models jsonb;
  v_model jsonb;
  v_model_name text;
  v_mae numeric;
  v_wape numeric;
  v_bias numeric;
  v_mase numeric;
  v_obs integer;
  v_integrity_source text;
  v_integrity_disp text;
  v_eval_disp text;
  v_fixture_fp text;
  v_algo_fp text;
  v_body_hash text;
  v_claims_prod boolean;
  v_claims_m7 boolean;
  v_algo_approved boolean;
  v_expected_models integer;
begin
  if p_organization_id is null
    or p_store_id is null
    or p_location_id is null
    or p_variant_id is null
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evaluation persistence requires grain and object payload';
  end if;

  if p_payload ? 'trustedCompleteDates' then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evaluation persistence rejects trustedCompleteDates';
  end if;

  -- Independent grain validation (do not trust JSON ids).
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
        message = 'forecast evaluation persistence scope error: store';
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
        message = 'forecast evaluation persistence scope error: location';
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
        message = 'forecast evaluation persistence scope error: variant';
  end if;

  if (p_payload->>'organizationId') is distinct from p_organization_id::text
    or (p_payload->>'storeId') is distinct from p_store_id::text
    or (p_payload->>'locationId') is distinct from p_location_id::text
    or (p_payload->>'variantId') is distinct from p_variant_id::text
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evaluation persistence payload grain does not match authorized scope';
  end if;

  v_claims_prod := coalesce((p_payload->>'claimsProductionApproval')::boolean, false);
  v_claims_m7 := coalesce((p_payload->>'claimsM7NumericEligibility')::boolean, false);
  v_algo_approved := coalesce((p_payload->>'algorithmApproved')::boolean, false);

  if v_claims_prod or v_claims_m7 or v_algo_approved then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evaluation persistence rejects production/M7/algorithm approval claims';
  end if;

  v_integrity_source := p_payload->>'integritySourceClass';
  v_integrity_disp := p_payload->>'integrityDisposition';
  v_eval_disp := p_payload->>'evaluationDisposition';
  v_fixture_fp := p_payload->>'fixtureFingerprint';
  v_algo_fp := p_payload->>'algorithmVersionsFingerprint';
  v_body_hash := p_payload->>'bodyHash';
  v_origin_count := coalesce((p_payload->>'originCount')::integer, -1);

  if v_fixture_fp is null
    or pg_catalog.length(pg_catalog.btrim(v_fixture_fp)) = 0
    or v_algo_fp is null
    or v_algo_fp !~ '^[a-f0-9]{32}$'
    or v_body_hash is null
    or pg_catalog.length(pg_catalog.btrim(v_body_hash)) = 0
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evaluation persistence requires fixtureFingerprint, algorithmVersionsFingerprint, and bodyHash';
  end if;

  if p_payload->>'harnessVersion' is null
    or p_payload->>'integrityVersion' is null
    or p_payload->>'backtestMetricVersion' is null
    or p_payload->>'orchestratorVersion' is null
    or p_payload->>'configurationVersion' is null
    or p_payload->>'originStart' is null
    or p_payload->>'originEnd' is null
    or p_payload->>'lookbackDays' is null
    or p_payload->>'pinnedTimeZone' is null
    or p_payload->>'originsHash' is null
    or p_payload->>'resultFingerprint' is null
    or p_payload->>'demandClass' is null
    or jsonb_typeof(p_payload->'algorithmVersions') <> 'object'
    or jsonb_typeof(p_payload->'integrityReasonCodes') is distinct from 'array'
    or jsonb_typeof(p_payload->'harnessReasonCodes') is distinct from 'array'
    or jsonb_typeof(p_payload->'segments') is distinct from 'array'
    or jsonb_typeof(p_payload->'scoredDates') is distinct from 'array'
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evaluation persistence payload missing required fields';
  end if;

  if coalesce((p_payload->>'harnessHorizonDays')::integer, 1) <> 1 then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evaluation persistence harnessHorizonDays must be 1';
  end if;

  select coalesce(
    array_agg(elem::date order by ordinality),
    '{}'::date[]
  )
  into v_scored_dates
  from jsonb_array_elements_text(p_payload->'scoredDates')
    with ordinality as t(elem, ordinality);

  v_models := coalesce(p_payload->'models', '[]'::jsonb);
  if jsonb_typeof(v_models) <> 'array' then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast evaluation persistence models must be a jsonb array';
  end if;

  v_expected_models := jsonb_array_length(v_models);

  -- Scored vs audit-only gate.
  if v_integrity_disp = 'accepted'
    and v_integrity_source = 'controlled_pit_fixture'
    and v_eval_disp in ('preliminary', 'INSUFFICIENT_BACKTEST_POINTS')
  then
    v_is_scored := true;
    if v_origin_count < 1 then
      raise exception
        using
          errcode = 'P0001',
          message = 'scored forecast evaluation requires originCount >= 1';
    end if;
    if v_expected_models <> 3 then
      raise exception
        using
          errcode = 'P0001',
          message = 'scored forecast evaluation requires exactly three model scores';
    end if;
  else
    v_is_scored := false;
    if v_expected_models <> 0 then
      raise exception
        using
          errcode = 'P0001',
          message = 'audit-only forecast evaluation must persist zero model scores';
    end if;
    if v_origin_count <> 0 then
      raise exception
        using
          errcode = 'P0001',
          message = 'audit-only forecast evaluation requires originCount = 0';
    end if;
  end if;

  -- Rejections must never count as scored evaluations.
  if v_integrity_disp in ('INVALID_HISTORY', 'UNSUPPORTED_HISTORICAL_REPLAY')
    and v_is_scored
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'rejected integrity must not persist as scored evaluation';
  end if;

  begin
    insert into public.forecast_evaluation_runs (
      organization_id,
      store_id,
      location_id,
      variant_id,
      origin_start,
      origin_end,
      lookback_days,
      harness_horizon_days,
      harness_version,
      integrity_version,
      backtest_metric_version,
      orchestrator_version,
      configuration_version,
      algorithm_versions,
      algorithm_versions_fingerprint,
      fixture_fingerprint,
      origins_hash,
      result_fingerprint,
      body_hash,
      pinned_time_zone,
      integrity_source_class,
      integrity_disposition,
      integrity_reason_codes,
      evaluation_disposition,
      harness_reason_codes,
      demand_class,
      origin_count,
      scored_dates,
      segments,
      is_scored_evaluation,
      claims_production_approval,
      claims_m7_numeric_eligibility,
      algorithm_approved
    ) values (
      p_organization_id,
      p_store_id,
      p_location_id,
      p_variant_id,
      (p_payload->>'originStart')::date,
      (p_payload->>'originEnd')::date,
      (p_payload->>'lookbackDays')::integer,
      1,
      p_payload->>'harnessVersion',
      p_payload->>'integrityVersion',
      p_payload->>'backtestMetricVersion',
      p_payload->>'orchestratorVersion',
      p_payload->>'configurationVersion',
      p_payload->'algorithmVersions',
      v_algo_fp,
      v_fixture_fp,
      p_payload->>'originsHash',
      p_payload->>'resultFingerprint',
      v_body_hash,
      p_payload->>'pinnedTimeZone',
      v_integrity_source,
      v_integrity_disp,
      p_payload->'integrityReasonCodes',
      v_eval_disp,
      p_payload->'harnessReasonCodes',
      p_payload->>'demandClass',
      v_origin_count,
      v_scored_dates,
      p_payload->'segments',
      v_is_scored,
      false,
      false,
      false
    )
    returning id into v_run_id;

    if v_is_scored then
      for v_model in
        select value
        from jsonb_array_elements(v_models)
      loop
        v_model_name := v_model->>'model';
        if v_model_name is null
          or v_model_name not in ('candidate', 'naive_lag1', 'zero')
        then
          raise exception
            using
              errcode = 'P0001',
              message = 'forecast evaluation model must be candidate, naive_lag1, or zero';
        end if;

        v_obs := (v_model->>'observationCount')::integer;
        if v_obs is null or v_obs < 1 or v_obs is distinct from v_origin_count then
          raise exception
            using
              errcode = 'P0001',
              message = 'forecast evaluation model observationCount must equal originCount';
        end if;

        v_mae := nullif(v_model->>'mae', '')::numeric;
        v_wape := nullif(v_model->>'wape', '')::numeric;
        v_bias := nullif(v_model->>'biasRatio', '')::numeric;
        v_mase := nullif(v_model->>'mase', '')::numeric;

        perform public.forecast_evaluation_assert_finite_numeric(v_mae, 'mae');
        perform public.forecast_evaluation_assert_finite_numeric(v_wape, 'wape');
        perform public.forecast_evaluation_assert_finite_numeric(v_bias, 'biasRatio');
        perform public.forecast_evaluation_assert_finite_numeric(v_mase, 'mase');
        perform public.forecast_evaluation_assert_finite_numeric(
          (v_model->>'totalActualDemand')::numeric,
          'totalActualDemand'
        );
        perform public.forecast_evaluation_assert_finite_numeric(
          (v_model->>'totalPredictedDemand')::numeric,
          'totalPredictedDemand'
        );
        perform public.forecast_evaluation_assert_finite_numeric(
          (v_model->>'totalAbsoluteError')::numeric,
          'totalAbsoluteError'
        );
        perform public.forecast_evaluation_assert_finite_numeric(
          (v_model->>'totalSignedError')::numeric,
          'totalSignedError'
        );

        if jsonb_typeof(v_model->'metricReasonCodes') is distinct from 'array' then
          raise exception
            using
              errcode = 'P0001',
              message = 'forecast evaluation model metricReasonCodes must be an array';
        end if;

        insert into public.forecast_evaluation_model_scores (
          evaluation_run_id,
          organization_id,
          store_id,
          location_id,
          variant_id,
          model,
          observation_count,
          mae,
          wape,
          bias_ratio,
          mase,
          total_actual_demand,
          total_predicted_demand,
          total_absolute_error,
          total_signed_error,
          metric_reason_codes
        ) values (
          v_run_id,
          p_organization_id,
          p_store_id,
          p_location_id,
          p_variant_id,
          v_model_name,
          v_obs,
          v_mae,
          v_wape,
          v_bias,
          v_mase,
          (v_model->>'totalActualDemand')::numeric,
          (v_model->>'totalPredictedDemand')::numeric,
          (v_model->>'totalAbsoluteError')::numeric,
          (v_model->>'totalSignedError')::numeric,
          v_model->'metricReasonCodes'
        );
      end loop;
    end if;

    v_disposition := 'created';
  exception
    when unique_violation then
      select *
      into v_existing
      from public.forecast_evaluation_runs as r
      where
        r.organization_id = p_organization_id
        and r.store_id = p_store_id
        and r.location_id = p_location_id
        and r.variant_id = p_variant_id
        and r.fixture_fingerprint = v_fixture_fp
        and r.origin_start = (p_payload->>'originStart')::date
        and r.origin_end = (p_payload->>'originEnd')::date
        and r.lookback_days = (p_payload->>'lookbackDays')::integer
        and r.harness_version = p_payload->>'harnessVersion'
        and r.integrity_version = p_payload->>'integrityVersion'
        and r.backtest_metric_version = p_payload->>'backtestMetricVersion'
        and r.configuration_version = p_payload->>'configurationVersion'
        and r.orchestrator_version = p_payload->>'orchestratorVersion'
        and r.algorithm_versions_fingerprint = v_algo_fp;

      if not found then
        raise;
      end if;

      select count(*)::integer
      into v_score_count
      from public.forecast_evaluation_model_scores as s
      where s.evaluation_run_id = v_existing.id;

      if v_existing.body_hash is distinct from v_body_hash
        or v_existing.result_fingerprint
          is distinct from (p_payload->>'resultFingerprint')
        or v_existing.origins_hash is distinct from (p_payload->>'originsHash')
        or v_existing.evaluation_disposition is distinct from v_eval_disp
        or v_existing.integrity_disposition is distinct from v_integrity_disp
        or v_existing.integrity_source_class is distinct from v_integrity_source
        or v_existing.origin_count is distinct from v_origin_count
        or v_existing.is_scored_evaluation is distinct from v_is_scored
        or v_existing.demand_class is distinct from (p_payload->>'demandClass')
        or v_existing.algorithm_versions is distinct from (p_payload->'algorithmVersions')
        or v_existing.integrity_reason_codes
          is distinct from (p_payload->'integrityReasonCodes')
        or v_existing.harness_reason_codes
          is distinct from (p_payload->'harnessReasonCodes')
        or v_existing.segments is distinct from (p_payload->'segments')
        or v_existing.scored_dates is distinct from v_scored_dates
        or v_existing.pinned_time_zone
          is distinct from (p_payload->>'pinnedTimeZone')
        or (v_is_scored and v_score_count <> 3)
        or (not v_is_scored and v_score_count <> 0)
      then
        raise exception
          using
            errcode = 'P0001',
            message = 'forecast evaluation persistence EVALUATION_IDEMPOTENCY_BODY_CONFLICT';
      end if;

      -- For scored replays, also require model bodies to match payload.
      if v_is_scored then
        for v_model in
          select value
          from jsonb_array_elements(v_models)
        loop
          if not exists (
            select 1
            from public.forecast_evaluation_model_scores as s
            where
              s.evaluation_run_id = v_existing.id
              and s.model = v_model->>'model'
              and s.observation_count = (v_model->>'observationCount')::integer
              and s.mae is not distinct from nullif(v_model->>'mae', '')::numeric
              and s.wape is not distinct from nullif(v_model->>'wape', '')::numeric
              and s.bias_ratio
                is not distinct from nullif(v_model->>'biasRatio', '')::numeric
              and s.mase is not distinct from nullif(v_model->>'mase', '')::numeric
              and s.total_actual_demand
                = (v_model->>'totalActualDemand')::numeric
              and s.total_predicted_demand
                = (v_model->>'totalPredictedDemand')::numeric
              and s.total_absolute_error
                = (v_model->>'totalAbsoluteError')::numeric
              and s.total_signed_error
                = (v_model->>'totalSignedError')::numeric
              and s.metric_reason_codes
                is not distinct from (v_model->'metricReasonCodes')
          ) then
            raise exception
              using
                errcode = 'P0001',
                message = 'forecast evaluation persistence EVALUATION_IDEMPOTENCY_BODY_CONFLICT';
          end if;
        end loop;
      end if;

      v_run_id := v_existing.id;
      v_disposition := 'replayed';
  end;

  return jsonb_build_object(
    'ok', true,
    'disposition', v_disposition,
    'evaluationRunId', v_run_id,
    'isScoredEvaluation', v_is_scored,
    'claimsProductionApproval', false,
    'claimsM7NumericEligibility', false,
    'algorithmApproved', false
  );
end;
$$;

revoke all
on function public.persist_forecast_evaluation_result(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.persist_forecast_evaluation_result(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb
)
to service_role;
