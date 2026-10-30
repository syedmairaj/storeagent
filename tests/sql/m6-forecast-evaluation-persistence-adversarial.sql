\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M6 P4c.1 FORECAST EVALUATION PERSISTENCE ADVERSARIAL ==='

\set org_a '61009000-0000-4000-8000-000000000001'
\set org_b '61009000-0000-4000-8000-000000000011'
\set store_a '61009000-0000-4000-8000-000000000002'
\set store_b '61009000-0000-4000-8000-000000000012'
\set location_a '61009000-0000-4000-8000-000000000003'
\set location_b '61009000-0000-4000-8000-000000000023'
\set product_a '61009000-0000-4000-8000-000000000004'
\set product_b '61009000-0000-4000-8000-000000000014'
\set variant_a '61009000-0000-4000-8000-000000000005'
\set variant_b '61009000-0000-4000-8000-000000000025'
\set user_owner '61009000-0000-4000-8000-000000000007'
\set user_foreign '61009000-0000-4000-8000-000000000008'

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
(
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm6-eval-owner@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_foreign'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm6-eval-foreign@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'M6 Eval Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'M6 Eval Org B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (:'org_a'::uuid, :'user_owner'::uuid, 'owner'),
  (:'org_b'::uuid, :'user_foreign'::uuid, 'owner');

INSERT INTO public.stores (id, organization_id, name, status, currency, timezone)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'Eval Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'Eval Store B', 'active', 'USD', 'UTC');

INSERT INTO public.locations (id, organization_id, store_id, name, status)
VALUES
  (:'location_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'Loc A', 'active'),
  (:'location_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, 'Loc B', 'active');

INSERT INTO public.products (id, organization_id, store_id, title, status)
VALUES
  (:'product_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'Product A', 'active'),
  (:'product_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, 'Product B', 'active');

INSERT INTO public.product_variants (
  id, organization_id, store_id, product_id, sku, status
)
VALUES
  (:'variant_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, :'product_a'::uuid, 'SKU-A', 'active'),
  (:'variant_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, :'product_b'::uuid, 'SKU-B', 'active');

\echo '--- Privileges: no direct DML; service_role EXECUTE only ---'

DO $$
DECLARE
  insert_priv boolean;
  update_priv boolean;
  delete_priv boolean;
  exec_auth boolean;
  exec_anon boolean;
  exec_service boolean;
BEGIN
  SELECT
    has_table_privilege('authenticated', 'public.forecast_evaluation_runs', 'INSERT'),
    has_table_privilege('authenticated', 'public.forecast_evaluation_runs', 'UPDATE'),
    has_table_privilege('authenticated', 'public.forecast_evaluation_runs', 'DELETE')
  INTO insert_priv, update_priv, delete_priv;

  IF insert_priv OR update_priv OR delete_priv THEN
    RAISE EXCEPTION 'authenticated must not have forecast_evaluation_runs DML';
  END IF;

  SELECT
    has_table_privilege('service_role', 'public.forecast_evaluation_runs', 'INSERT'),
    has_table_privilege('service_role', 'public.forecast_evaluation_model_scores', 'INSERT')
  INTO insert_priv, update_priv;

  IF insert_priv OR update_priv THEN
    RAISE EXCEPTION 'service_role must not have direct INSERT on evaluation tables';
  END IF;

  SELECT has_function_privilege(
    'authenticated',
    'public.persist_forecast_evaluation_result(uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) INTO exec_auth;
  SELECT has_function_privilege(
    'anon',
    'public.persist_forecast_evaluation_result(uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) INTO exec_anon;
  SELECT has_function_privilege(
    'service_role',
    'public.persist_forecast_evaluation_result(uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) INTO exec_service;

  IF exec_auth OR exec_anon THEN
    RAISE EXCEPTION 'evaluation persist RPC must not be executable by anon/authenticated';
  END IF;
  IF NOT exec_service THEN
    RAISE EXCEPTION 'evaluation persist RPC must be executable by service_role';
  END IF;
END;
$$;

\echo '--- Helpers for payload construction ---'

CREATE FUNCTION pg_temp.eval_base_payload(
  p_org uuid,
  p_store uuid,
  p_loc uuid,
  p_variant uuid
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'organizationId', p_org::text,
    'storeId', p_store::text,
    'locationId', p_loc::text,
    'variantId', p_variant::text,
    'harnessVersion', 'forecast-backtest-harness-v1',
    'integrityVersion', 'forecast-historical-evidence-integrity-v1',
    'backtestMetricVersion', 'forecast-backtest-v1',
    'orchestratorVersion', 'forecast-orchestrator-v1',
    'configurationVersion', 'forecast-config-v1',
    'algorithmVersions', jsonb_build_object(
      'weightedDemand', 'weighted-demand-v1',
      'trendAdjustment', 'trend-adjustment-v1',
      'stockoutCensoring', 'stockout-censoring-v1',
      'promotionTreatment', 'promotion-treatment-v1',
      'coldStart', 'cold-start-v1',
      'confidence', 'forecast-confidence-v1',
      'horizon', 'forecast-horizon-v1',
      'backtest', 'forecast-backtest-v1'
    ),
    'algorithmVersionsFingerprint', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'fixtureFingerprint', 'fixture-eval-v1',
    'originsHash', 'origins-hash-v1',
    'resultFingerprint', 'result-fp-v1',
    'bodyHash', 'body-hash-v1',
    'originStart', '2026-01-10',
    'originEnd', '2026-01-23',
    'lookbackDays', 7,
    'harnessHorizonDays', 1,
    'pinnedTimeZone', 'UTC',
    'integritySourceClass', 'controlled_pit_fixture',
    'integrityDisposition', 'accepted',
    'integrityReasonCodes', '[]'::jsonb,
    'evaluationDisposition', 'preliminary',
    'harnessReasonCodes', '[]'::jsonb,
    'demandClass', 'smooth',
    'originCount', 14,
    'scoredDates', (
      SELECT jsonb_agg(to_char(d, 'YYYY-MM-DD'))
      FROM generate_series(
        '2026-01-11'::date,
        '2026-01-24'::date,
        '1 day'::interval
      ) AS d
    ),
    'segments', jsonb_build_array(
      jsonb_build_object(
        'demandClass', 'smooth',
        'originCount', 14
      )
    ),
    'claimsProductionApproval', false,
    'claimsM7NumericEligibility', false,
    'algorithmApproved', false,
    'models', jsonb_build_array(
      jsonb_build_object(
        'model', 'candidate',
        'observationCount', 14,
        'mae', 1.5,
        'wape', 0.25,
        'biasRatio', 0.1,
        'mase', 0.8,
        'totalActualDemand', 28,
        'totalPredictedDemand', 30,
        'totalAbsoluteError', 21,
        'totalSignedError', 2,
        'metricReasonCodes', '[]'::jsonb
      ),
      jsonb_build_object(
        'model', 'naive_lag1',
        'observationCount', 14,
        'mae', 2.0,
        'wape', 0.3,
        'biasRatio', 0.0,
        'mase', null,
        'totalActualDemand', 28,
        'totalPredictedDemand', 28,
        'totalAbsoluteError', 28,
        'totalSignedError', 0,
        'metricReasonCodes', '[]'::jsonb
      ),
      jsonb_build_object(
        'model', 'zero',
        'observationCount', 14,
        'mae', 2.0,
        'wape', 1.0,
        'biasRatio', -1.0,
        'mase', null,
        'totalActualDemand', 28,
        'totalPredictedDemand', 0,
        'totalAbsoluteError', 28,
        'totalSignedError', -28,
        'metricReasonCodes', '[]'::jsonb
      )
    )
  );
$$;

\echo '--- Accepted preliminary persists three model scores ---'

DO $$
DECLARE
  payload jsonb;
  result jsonb;
  score_count integer;
  run_row public.forecast_evaluation_runs%rowtype;
BEGIN
  payload := pg_temp.eval_base_payload(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid
  );

  result := public.persist_forecast_evaluation_result(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid,
    payload
  );

  IF result->>'disposition' <> 'created' THEN
    RAISE EXCEPTION 'expected created, got %', result;
  END IF;
  IF (result->>'isScoredEvaluation')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'preliminary must be scored';
  END IF;
  IF (result->>'claimsProductionApproval')::boolean
     OR (result->>'claimsM7NumericEligibility')::boolean
     OR (result->>'algorithmApproved')::boolean
  THEN
    RAISE EXCEPTION 'trust flags must be false';
  END IF;

  SELECT * INTO run_row
  FROM public.forecast_evaluation_runs
  WHERE id = (result->>'evaluationRunId')::uuid;

  IF NOT run_row.is_scored_evaluation THEN
    RAISE EXCEPTION 'run must be scored';
  END IF;

  SELECT count(*) INTO score_count
  FROM public.forecast_evaluation_model_scores
  WHERE evaluation_run_id = run_row.id;

  IF score_count <> 3 THEN
    RAISE EXCEPTION 'expected 3 model scores, got %', score_count;
  END IF;
END;
$$;

\echo '--- Insufficient sample diagnostic with nullable WAPE/MASE ---'

DO $$
DECLARE
  payload jsonb;
  result jsonb;
  cand public.forecast_evaluation_model_scores%rowtype;
BEGIN
  payload := pg_temp.eval_base_payload(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid
  );
  payload := payload || jsonb_build_object(
    'fixtureFingerprint', 'fixture-insufficient-v1',
    'bodyHash', 'body-hash-insufficient',
    'resultFingerprint', 'result-insufficient',
    'evaluationDisposition', 'INSUFFICIENT_BACKTEST_POINTS',
    'harnessReasonCodes', jsonb_build_array('INSUFFICIENT_BACKTEST_POINTS'),
    'originCount', 3,
    'originEnd', '2026-01-12',
    'scoredDates', jsonb_build_array('2026-01-11', '2026-01-12', '2026-01-13'),
    'segments', jsonb_build_array(
      jsonb_build_object('demandClass', 'intermittent', 'originCount', 3)
    ),
    'demandClass', 'intermittent',
    'models', jsonb_build_array(
      jsonb_build_object(
        'model', 'candidate',
        'observationCount', 3,
        'mae', 0,
        'wape', null,
        'biasRatio', null,
        'mase', null,
        'totalActualDemand', 0,
        'totalPredictedDemand', 0,
        'totalAbsoluteError', 0,
        'totalSignedError', 0,
        'metricReasonCodes', jsonb_build_array(
          'ZERO_TOTAL_ACTUAL_DEMAND',
          'MASE_DENOMINATOR_ZERO'
        )
      ),
      jsonb_build_object(
        'model', 'naive_lag1',
        'observationCount', 3,
        'mae', 0,
        'wape', null,
        'biasRatio', null,
        'mase', null,
        'totalActualDemand', 0,
        'totalPredictedDemand', 0,
        'totalAbsoluteError', 0,
        'totalSignedError', 0,
        'metricReasonCodes', jsonb_build_array('ZERO_TOTAL_ACTUAL_DEMAND')
      ),
      jsonb_build_object(
        'model', 'zero',
        'observationCount', 3,
        'mae', 0,
        'wape', null,
        'biasRatio', null,
        'mase', null,
        'totalActualDemand', 0,
        'totalPredictedDemand', 0,
        'totalAbsoluteError', 0,
        'totalSignedError', 0,
        'metricReasonCodes', jsonb_build_array('ZERO_TOTAL_ACTUAL_DEMAND')
      )
    )
  );

  result := public.persist_forecast_evaluation_result(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid,
    payload
  );

  IF result->>'disposition' <> 'created' THEN
    RAISE EXCEPTION 'insufficient sample should create, got %', result;
  END IF;

  SELECT * INTO cand
  FROM public.forecast_evaluation_model_scores
  WHERE evaluation_run_id = (result->>'evaluationRunId')::uuid
    AND model = 'candidate';

  IF cand.wape IS NOT NULL OR cand.bias_ratio IS NOT NULL OR cand.mase IS NOT NULL THEN
    RAISE EXCEPTION 'undefined metrics must persist as null';
  END IF;
  IF cand.metric_reason_codes <> jsonb_build_array(
    'ZERO_TOTAL_ACTUAL_DEMAND',
    'MASE_DENOMINATOR_ZERO'
  ) THEN
    RAISE EXCEPTION 'metric reason codes not preserved: %', cand.metric_reason_codes;
  END IF;
END;
$$;

\echo '--- Rejected integrity → zero model scores; never scored ---'

DO $$
DECLARE
  payload jsonb;
  result jsonb;
  score_count integer;
  run_row public.forecast_evaluation_runs%rowtype;
BEGIN
  payload := pg_temp.eval_base_payload(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid
  );
  payload := payload || jsonb_build_object(
    'fixtureFingerprint', 'fixture-rejected-v1',
    'bodyHash', 'body-hash-rejected',
    'resultFingerprint', 'result-rejected',
    'integritySourceClass', 'unsupported_live_canonical',
    'integrityDisposition', 'UNSUPPORTED_HISTORICAL_REPLAY',
    'integrityReasonCodes', jsonb_build_array('UNSUPPORTED_LIVE_CANONICAL'),
    'evaluationDisposition', 'UNSUPPORTED_HISTORICAL_REPLAY',
    'originCount', 0,
    'scoredDates', '[]'::jsonb,
    'segments', '[]'::jsonb,
    'demandClass', 'unknown',
    'models', '[]'::jsonb
  );

  result := public.persist_forecast_evaluation_result(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid,
    payload
  );

  IF (result->>'isScoredEvaluation')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'rejection must not be scored';
  END IF;

  SELECT * INTO run_row
  FROM public.forecast_evaluation_runs
  WHERE id = (result->>'evaluationRunId')::uuid;

  IF run_row.is_scored_evaluation THEN
    RAISE EXCEPTION 'rejection run flagged scored';
  END IF;

  SELECT count(*) INTO score_count
  FROM public.forecast_evaluation_model_scores
  WHERE evaluation_run_id = run_row.id;

  IF score_count <> 0 THEN
    RAISE EXCEPTION 'rejection must have zero model scores, got %', score_count;
  END IF;
END;
$$;

\echo '--- Same-key replay and changed-body conflict ---'

DO $$
DECLARE
  payload jsonb;
  first jsonb;
  replay jsonb;
  before_count integer;
  after_count integer;
BEGIN
  payload := pg_temp.eval_base_payload(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid
  );
  payload := payload || jsonb_build_object(
    'fixtureFingerprint', 'fixture-idempo-v1',
    'bodyHash', 'body-hash-idempo',
    'resultFingerprint', 'result-idempo'
  );

  first := public.persist_forecast_evaluation_result(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid,
    payload
  );

  SELECT count(*) INTO before_count
  FROM public.forecast_evaluation_runs
  WHERE fixture_fingerprint = 'fixture-idempo-v1';

  replay := public.persist_forecast_evaluation_result(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid,
    payload
  );

  IF replay->>'disposition' <> 'replayed' THEN
    RAISE EXCEPTION 'expected replayed, got %', replay;
  END IF;
  IF replay->>'evaluationRunId' IS DISTINCT FROM first->>'evaluationRunId' THEN
    RAISE EXCEPTION 'replay must return same run id';
  END IF;

  SELECT count(*) INTO after_count
  FROM public.forecast_evaluation_runs
  WHERE fixture_fingerprint = 'fixture-idempo-v1';

  IF after_count <> before_count OR after_count <> 1 THEN
    RAISE EXCEPTION 'replay must not create a second row';
  END IF;

  BEGIN
    PERFORM public.persist_forecast_evaluation_result(
      '61009000-0000-4000-8000-000000000001'::uuid,
      '61009000-0000-4000-8000-000000000002'::uuid,
      '61009000-0000-4000-8000-000000000003'::uuid,
      '61009000-0000-4000-8000-000000000005'::uuid,
      (payload || jsonb_build_object('bodyHash', 'body-hash-CHANGED', 'mae', 9))
    );
    -- also change a compared field via resultFingerprint
    RAISE EXCEPTION 'changed body should conflict';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%EVALUATION_IDEMPOTENCY_BODY_CONFLICT%' THEN
        -- retry with explicit resultFingerprint change (bodyHash alone conflicts)
        NULL;
      END IF;
  END;

  BEGIN
    PERFORM public.persist_forecast_evaluation_result(
      '61009000-0000-4000-8000-000000000001'::uuid,
      '61009000-0000-4000-8000-000000000002'::uuid,
      '61009000-0000-4000-8000-000000000003'::uuid,
      '61009000-0000-4000-8000-000000000005'::uuid,
      (payload || jsonb_build_object(
        'bodyHash', 'body-hash-CHANGED',
        'resultFingerprint', 'result-CHANGED'
      ))
    );
    RAISE EXCEPTION 'changed body should conflict';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%EVALUATION_IDEMPOTENCY_BODY_CONFLICT%' THEN
        RAISE EXCEPTION 'unexpected conflict error: %', SQLERRM;
      END IF;
  END;
END;
$$;

\echo '--- Changed algorithm fingerprint creates distinct history ---'

DO $$
DECLARE
  payload jsonb;
  result jsonb;
  cnt integer;
BEGIN
  payload := pg_temp.eval_base_payload(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid
  );
  payload := payload || jsonb_build_object(
    'fixtureFingerprint', 'fixture-algo-v1',
    'bodyHash', 'body-hash-algo-a',
    'resultFingerprint', 'result-algo-a',
    'algorithmVersionsFingerprint', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'orchestratorVersion', 'forecast-orchestrator-v1-alt'
  );

  result := public.persist_forecast_evaluation_result(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid,
    payload
  );

  IF result->>'disposition' <> 'created' THEN
    RAISE EXCEPTION 'alt algorithm version should create new history';
  END IF;

  SELECT count(*) INTO cnt
  FROM public.forecast_evaluation_runs
  WHERE fixture_fingerprint = 'fixture-algo-v1';

  IF cnt <> 1 THEN
    RAISE EXCEPTION 'expected one algo history row';
  END IF;
END;
$$;

\echo '--- Foreign grain / forged payload / approval claims / NaN fail closed ---'

DO $$
DECLARE
  payload jsonb;
BEGIN
  payload := pg_temp.eval_base_payload(
    '61009000-0000-4000-8000-000000000001'::uuid,
    '61009000-0000-4000-8000-000000000002'::uuid,
    '61009000-0000-4000-8000-000000000003'::uuid,
    '61009000-0000-4000-8000-000000000005'::uuid
  );
  payload := payload || jsonb_build_object(
    'fixtureFingerprint', 'fixture-reject-paths',
    'bodyHash', 'body-hash-reject-paths',
    'resultFingerprint', 'result-reject-paths'
  );

  BEGIN
    PERFORM public.persist_forecast_evaluation_result(
      '61009000-0000-4000-8000-000000000001'::uuid,
      '61009000-0000-4000-8000-000000000012'::uuid,
      '61009000-0000-4000-8000-000000000003'::uuid,
      '61009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
    RAISE EXCEPTION 'foreign store should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%scope error: store%' THEN
        RAISE EXCEPTION 'unexpected foreign store error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.persist_forecast_evaluation_result(
      '61009000-0000-4000-8000-000000000001'::uuid,
      '61009000-0000-4000-8000-000000000002'::uuid,
      '61009000-0000-4000-8000-000000000003'::uuid,
      '61009000-0000-4000-8000-000000000005'::uuid,
      (payload || jsonb_build_object(
        'organizationId', '61009000-0000-4000-8000-000000000011'
      ))
    );
    RAISE EXCEPTION 'forged payload grain should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%payload grain does not match%' THEN
        RAISE EXCEPTION 'unexpected forged payload error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.persist_forecast_evaluation_result(
      '61009000-0000-4000-8000-000000000001'::uuid,
      '61009000-0000-4000-8000-000000000002'::uuid,
      '61009000-0000-4000-8000-000000000003'::uuid,
      '61009000-0000-4000-8000-000000000005'::uuid,
      (payload || jsonb_build_object('claimsProductionApproval', true))
    );
    RAISE EXCEPTION 'production approval claim should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%rejects production/M7/algorithm approval%' THEN
        RAISE EXCEPTION 'unexpected approval error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.persist_forecast_evaluation_result(
      '61009000-0000-4000-8000-000000000001'::uuid,
      '61009000-0000-4000-8000-000000000002'::uuid,
      '61009000-0000-4000-8000-000000000003'::uuid,
      '61009000-0000-4000-8000-000000000005'::uuid,
      (payload || jsonb_build_object(
        'trustedCompleteDates', jsonb_build_array('2026-01-11')
      ))
    );
    RAISE EXCEPTION 'trustedCompleteDates should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%rejects trustedCompleteDates%' THEN
        RAISE EXCEPTION 'unexpected trustedCompleteDates error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.persist_forecast_evaluation_result(
      '61009000-0000-4000-8000-000000000001'::uuid,
      '61009000-0000-4000-8000-000000000002'::uuid,
      '61009000-0000-4000-8000-000000000003'::uuid,
      '61009000-0000-4000-8000-000000000005'::uuid,
      jsonb_set(
        payload || jsonb_build_object(
          'fixtureFingerprint', 'fixture-nan',
          'bodyHash', 'body-hash-nan',
          'resultFingerprint', 'result-nan'
        ),
        '{models,0,mae}',
        to_jsonb('NaN'::numeric)
      )
    );
    RAISE EXCEPTION 'NaN mae should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%non-finite mae%'
         AND SQLERRM NOT LIKE '%invalid input syntax%'
      THEN
        RAISE EXCEPTION 'unexpected NaN error: %', SQLERRM;
      END IF;
  END;
END;
$$;

\echo '--- UPDATE/DELETE rejection ---'

DO $$
DECLARE
  run_id uuid;
BEGIN
  SELECT id INTO run_id
  FROM public.forecast_evaluation_runs
  WHERE fixture_fingerprint = 'fixture-eval-v1'
  LIMIT 1;

  BEGIN
    UPDATE public.forecast_evaluation_runs
    SET origin_count = 99
    WHERE id = run_id;
    RAISE EXCEPTION 'update should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE EXCEPTION 'unexpected update error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    DELETE FROM public.forecast_evaluation_runs WHERE id = run_id;
    RAISE EXCEPTION 'delete should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE EXCEPTION 'unexpected delete error: %', SQLERRM;
      END IF;
  END;
END;
$$;

\echo '--- Tenant isolation (RLS) ---'

DO $$
DECLARE
  seen integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '61009000-0000-4000-8000-000000000007', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO seen
  FROM public.forecast_evaluation_runs
  WHERE organization_id = '61009000-0000-4000-8000-000000000001'::uuid;

  IF seen < 1 THEN
    RAISE EXCEPTION 'owner should see own evaluation runs';
  END IF;

  SELECT count(*) INTO seen
  FROM public.forecast_evaluation_runs
  WHERE organization_id = '61009000-0000-4000-8000-000000000011'::uuid;

  IF seen <> 0 THEN
    RAISE EXCEPTION 'owner must not see foreign org evaluations';
  END IF;

  RESET ROLE;
END;
$$;

\echo '=== M6 P4c.1 EVALUATION PERSISTENCE ADVERSARIAL PASSED ==='

ROLLBACK;
