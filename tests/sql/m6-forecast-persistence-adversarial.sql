\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M6 P3b FORECAST PERSISTENCE ADVERSARIAL ==='

\set org_a '61007000-0000-4000-8000-000000000001'
\set org_b '61007000-0000-4000-8000-000000000011'
\set store_a '61007000-0000-4000-8000-000000000002'
\set store_b '61007000-0000-4000-8000-000000000012'
\set location_a '61007000-0000-4000-8000-000000000003'
\set location_b '61007000-0000-4000-8000-000000000023'
\set product_a '61007000-0000-4000-8000-000000000004'
\set product_b '61007000-0000-4000-8000-000000000014'
\set variant_a '61007000-0000-4000-8000-000000000005'
\set variant_b '61007000-0000-4000-8000-000000000025'
\set integration_a '61007000-0000-4000-8000-000000000006'
\set user_owner '61007000-0000-4000-8000-000000000007'
\set user_foreign '61007000-0000-4000-8000-000000000008'
\set order_a '61007000-0000-4000-8000-000000000021'
\set item_a '61007000-0000-4000-8000-000000000022'

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
(
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm6-persist-owner@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_foreign'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm6-persist-foreign@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'M6 Persist Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'M6 Persist Org B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (:'org_a'::uuid, :'user_owner'::uuid, 'owner'),
  (:'org_b'::uuid, :'user_foreign'::uuid, 'owner');

INSERT INTO public.stores (id, organization_id, name, status, currency, timezone)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'Persist Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'Persist Store B', 'active', 'USD', 'UTC');

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

INSERT INTO public.integrations (id, organization_id, store_id, provider, status)
VALUES (:'integration_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'csv', 'active');

INSERT INTO public.orders (
  id, organization_id, store_id, status, ordered_at, currency, source
)
VALUES (
  :'order_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'completed',
  '2026-07-01T12:00:00Z'::timestamptz, 'USD', 'csv'
);

INSERT INTO public.order_items (
  id, organization_id, store_id, order_id, variant_id, location_id, quantity
)
VALUES (
  :'item_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, :'order_a'::uuid,
  :'variant_a'::uuid, :'location_a'::uuid, 3
);

INSERT INTO public.forecast_day_coverage_evidence (
  evidence_id, organization_id, store_id, location_id, variant_id,
  local_date, stream, coverage, trust, source,
  as_of, observed_at, version, invalidated_at, supersedes_evidence_id,
  idempotency_key, integration_id, actor_user_id, provider, closure_id
)
VALUES
(
  'ev_persist_orders',
  :'org_a'::uuid, :'store_a'::uuid, null, null,
  '2026-07-01', 'orders', 'complete', 'verified_merchant_attestation',
  'merchant:attestation',
  '2026-07-02T00:00:00Z'::timestamptz,
  '2026-07-02T00:00:00Z'::timestamptz,
  1, null, null, 'persist-orders', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_persist_orders'
),
(
  'ev_persist_returns',
  :'org_a'::uuid, :'store_a'::uuid, :'location_a'::uuid, :'variant_a'::uuid,
  '2026-07-01', 'returns', 'complete', 'verified_merchant_attestation',
  'merchant:attestation',
  '2026-07-02T00:00:00Z'::timestamptz,
  '2026-07-02T00:00:00Z'::timestamptz,
  1, null, null, 'persist-returns', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_persist_returns'
);

DELETE FROM public.forecast_coverage_correction_events
WHERE organization_id IN (:'org_a'::uuid, :'org_b'::uuid);

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
    has_table_privilege('authenticated', 'public.forecast_runs', 'INSERT'),
    has_table_privilege('authenticated', 'public.forecast_runs', 'UPDATE'),
    has_table_privilege('authenticated', 'public.forecast_runs', 'DELETE')
  INTO insert_priv, update_priv, delete_priv;

  IF insert_priv OR update_priv OR delete_priv THEN
    RAISE EXCEPTION 'authenticated must not have forecast_runs DML';
  END IF;

  SELECT
    has_table_privilege('service_role', 'public.forecast_runs', 'INSERT'),
    has_table_privilege('service_role', 'public.sku_forecasts', 'INSERT')
  INTO insert_priv, update_priv;

  IF insert_priv OR update_priv THEN
    RAISE EXCEPTION 'service_role must not have direct INSERT on forecast tables';
  END IF;

  SELECT has_function_privilege(
    'authenticated',
    'public.persist_forecast_sku_demand_result(uuid,uuid,uuid,uuid,date,integer,text,jsonb)',
    'EXECUTE'
  ) INTO exec_auth;
  SELECT has_function_privilege(
    'anon',
    'public.persist_forecast_sku_demand_result(uuid,uuid,uuid,uuid,date,integer,text,jsonb)',
    'EXECUTE'
  ) INTO exec_anon;
  SELECT has_function_privilege(
    'service_role',
    'public.persist_forecast_sku_demand_result(uuid,uuid,uuid,uuid,date,integer,text,jsonb)',
    'EXECUTE'
  ) INTO exec_service;

  IF exec_auth OR exec_anon THEN
    RAISE EXCEPTION 'persist RPC must not be executable by anon/authenticated';
  END IF;
  IF NOT exec_service THEN
    RAISE EXCEPTION 'persist RPC must be executable by service_role';
  END IF;
END;
$$;

\echo '--- Foreign grain / forged payload / forged token fail closed ---'

DO $$
DECLARE
  snap jsonb;
  token text;
  payload jsonb;
  before_runs integer;
  after_runs integer;
  result jsonb;
BEGIN
  snap := public.forecast_sku_demand_source_snapshot(
    '61007000-0000-4000-8000-000000000001'::uuid,
    '61007000-0000-4000-8000-000000000002'::uuid,
    '61007000-0000-4000-8000-000000000003'::uuid,
    '61007000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  token := snap->>'sourceToken';

  payload := jsonb_build_object(
    'algorithmVersion', 'forecast-orchestrator-v1',
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
    'organizationId', '61007000-0000-4000-8000-000000000001',
    'storeId', '61007000-0000-4000-8000-000000000002',
    'locationId', '61007000-0000-4000-8000-000000000003',
    'variantId', '61007000-0000-4000-8000-000000000005',
    'forecastAsOf', '2026-07-01',
    'dailyDemand', null,
    'mode', 'unavailable',
    'dataSufficiency', 'insufficient',
    'confidence', 'none',
    'weightedDailyDemand', null,
    'trendApplied', false,
    'trendAdjustedDailyDemand', null,
    'activeWindows', '[]'::jsonb,
    'quality', jsonb_build_object('completeDays', 0, 'incompleteDays', 1),
    'horizons', jsonb_build_object('leadTimeDemand', null),
    'reproducibilityFingerprint', 'abcd1234',
    'reasonCodes', jsonb_build_array('INSUFFICIENT_HISTORY'),
    'classifiedDays', '[]'::jsonb,
    'parameters', '{}'::jsonb,
    'provenance', jsonb_build_object('source', 'adversarial')
  );

  SELECT count(*) INTO before_runs FROM public.forecast_runs
  WHERE organization_id = '61007000-0000-4000-8000-000000000001'::uuid;

  BEGIN
    PERFORM public.persist_forecast_sku_demand_result(
      '61007000-0000-4000-8000-000000000001'::uuid,
      '61007000-0000-4000-8000-000000000012'::uuid,
      '61007000-0000-4000-8000-000000000003'::uuid,
      '61007000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      90,
      token,
      payload
    );
    RAISE EXCEPTION 'foreign store should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%scope error: store%'
         AND SQLERRM NOT LIKE '%scope error: location%'
      THEN
        RAISE EXCEPTION 'unexpected foreign store error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.persist_forecast_sku_demand_result(
      '61007000-0000-4000-8000-000000000001'::uuid,
      '61007000-0000-4000-8000-000000000002'::uuid,
      '61007000-0000-4000-8000-000000000023'::uuid,
      '61007000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      90,
      token,
      payload
    );
    RAISE EXCEPTION 'foreign location should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%scope error: location%' THEN
        RAISE EXCEPTION 'unexpected foreign location error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.persist_forecast_sku_demand_result(
      '61007000-0000-4000-8000-000000000001'::uuid,
      '61007000-0000-4000-8000-000000000002'::uuid,
      '61007000-0000-4000-8000-000000000003'::uuid,
      '61007000-0000-4000-8000-000000000025'::uuid,
      '2026-07-01'::date,
      90,
      token,
      payload
    );
    RAISE EXCEPTION 'foreign variant should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%scope error: variant%' THEN
        RAISE EXCEPTION 'unexpected foreign variant error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.persist_forecast_sku_demand_result(
      '61007000-0000-4000-8000-000000000001'::uuid,
      '61007000-0000-4000-8000-000000000002'::uuid,
      '61007000-0000-4000-8000-000000000003'::uuid,
      '61007000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      90,
      token,
      (payload || jsonb_build_object(
        'organizationId', '61007000-0000-4000-8000-000000000011'
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
    PERFORM public.persist_forecast_sku_demand_result(
      '61007000-0000-4000-8000-000000000001'::uuid,
      '61007000-0000-4000-8000-000000000002'::uuid,
      '61007000-0000-4000-8000-000000000003'::uuid,
      '61007000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      90,
      'ffffffffffffffffffffffffffffffff',
      payload
    );
    RAISE EXCEPTION 'forged token should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%STALE_SOURCE_TOKEN%' THEN
        RAISE EXCEPTION 'unexpected forged token error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.persist_forecast_sku_demand_result(
      '61007000-0000-4000-8000-000000000001'::uuid,
      '61007000-0000-4000-8000-000000000002'::uuid,
      '61007000-0000-4000-8000-000000000003'::uuid,
      '61007000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      90,
      token,
      (payload || jsonb_build_object('trustedCompleteDates', '["2026-07-01"]'::jsonb))
    );
    RAISE EXCEPTION 'trustedCompleteDates should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%trustedCompleteDates%' THEN
        RAISE EXCEPTION 'unexpected trustedCompleteDates error: %', SQLERRM;
      END IF;
  END;

  SELECT count(*) INTO after_runs FROM public.forecast_runs
  WHERE organization_id = '61007000-0000-4000-8000-000000000001'::uuid;

  IF after_runs <> before_runs THEN
    RAISE EXCEPTION 'fail-closed paths must not create forecast_runs rows';
  END IF;

  -- Happy path: withheld null demand persists as NULL.
  result := public.persist_forecast_sku_demand_result(
    '61007000-0000-4000-8000-000000000001'::uuid,
    '61007000-0000-4000-8000-000000000002'::uuid,
    '61007000-0000-4000-8000-000000000003'::uuid,
    '61007000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    payload
  );

  IF result->>'disposition' IS DISTINCT FROM 'created' THEN
    RAISE EXCEPTION 'first persist should create';
  END IF;
  IF result->>'persistClaimsPostCommitFreshness' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'persist must not claim post-commit freshness';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sku_forecasts f
    JOIN public.forecast_runs r ON r.id = f.forecast_run_id
    WHERE r.source_token = token
      AND f.daily_demand IS NULL
      AND f.mode = 'unavailable'
  ) THEN
    RAISE EXCEPTION 'nullable withheld demand must store as NULL';
  END IF;
END;
$$;

\echo '--- Idempotent replay; same-key body conflict; new token = new history ---'

DO $$
DECLARE
  snap jsonb;
  token text;
  token2 text;
  payload jsonb;
  altered jsonb;
  result jsonb;
  run_count integer;
  forecast_count integer;
BEGIN
  snap := public.forecast_sku_demand_source_snapshot(
    '61007000-0000-4000-8000-000000000001'::uuid,
    '61007000-0000-4000-8000-000000000002'::uuid,
    '61007000-0000-4000-8000-000000000003'::uuid,
    '61007000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  token := snap->>'sourceToken';

  payload := jsonb_build_object(
    'algorithmVersion', 'forecast-orchestrator-v1',
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
    'organizationId', '61007000-0000-4000-8000-000000000001',
    'storeId', '61007000-0000-4000-8000-000000000002',
    'locationId', '61007000-0000-4000-8000-000000000003',
    'variantId', '61007000-0000-4000-8000-000000000005',
    'forecastAsOf', '2026-07-01',
    'dailyDemand', null,
    'mode', 'unavailable',
    'dataSufficiency', 'insufficient',
    'confidence', 'none',
    'weightedDailyDemand', null,
    'trendApplied', false,
    'trendAdjustedDailyDemand', null,
    'activeWindows', '[]'::jsonb,
    'quality', jsonb_build_object('completeDays', 0, 'incompleteDays', 1),
    'horizons', jsonb_build_object('leadTimeDemand', null),
    'reproducibilityFingerprint', 'abcd1234',
    'reasonCodes', jsonb_build_array('INSUFFICIENT_HISTORY'),
    'classifiedDays', '[]'::jsonb,
    'parameters', '{}'::jsonb,
    'provenance', jsonb_build_object('source', 'adversarial')
  );

  result := public.persist_forecast_sku_demand_result(
    '61007000-0000-4000-8000-000000000001'::uuid,
    '61007000-0000-4000-8000-000000000002'::uuid,
    '61007000-0000-4000-8000-000000000003'::uuid,
    '61007000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    payload
  );
  IF result->>'disposition' IS DISTINCT FROM 'replayed' THEN
    RAISE EXCEPTION 'identical retry must replay, got %', result->>'disposition';
  END IF;

  altered := payload || jsonb_build_object('dailyDemand', 1.5, 'mode', 'standard');
  BEGIN
    PERFORM public.persist_forecast_sku_demand_result(
      '61007000-0000-4000-8000-000000000001'::uuid,
      '61007000-0000-4000-8000-000000000002'::uuid,
      '61007000-0000-4000-8000-000000000003'::uuid,
      '61007000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      90,
      token,
      altered
    );
    RAISE EXCEPTION 'same-key altered body must reject';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%IDEMPOTENCY_BODY_CONFLICT%' THEN
        RAISE EXCEPTION 'unexpected body conflict error: %', SQLERRM;
      END IF;
  END;

  -- Force a new sourceToken via pending correction, then persist new history.
  INSERT INTO public.forecast_coverage_correction_events (
    organization_id, store_id, stream, local_date,
    location_id, variant_id, business_at, arrived_at,
    source_table, source_op
  )
  VALUES (
    '61007000-0000-4000-8000-000000000001'::uuid,
    '61007000-0000-4000-8000-000000000002'::uuid,
    'orders', '2026-07-01',
    null, null,
    '2026-07-01T08:00:00Z'::timestamptz,
    '2026-07-03T00:00:00Z'::timestamptz,
    'order_items', 'update'
  );

  snap := public.forecast_sku_demand_source_snapshot(
    '61007000-0000-4000-8000-000000000001'::uuid,
    '61007000-0000-4000-8000-000000000002'::uuid,
    '61007000-0000-4000-8000-000000000003'::uuid,
    '61007000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  token2 := snap->>'sourceToken';
  IF token2 IS NOT DISTINCT FROM token THEN
    RAISE EXCEPTION 'pending correction must change sourceToken';
  END IF;

  BEGIN
    PERFORM public.persist_forecast_sku_demand_result(
      '61007000-0000-4000-8000-000000000001'::uuid,
      '61007000-0000-4000-8000-000000000002'::uuid,
      '61007000-0000-4000-8000-000000000003'::uuid,
      '61007000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      90,
      token,
      payload
    );
    RAISE EXCEPTION 'stale prior token must fail after source change';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%STALE_SOURCE_TOKEN%' THEN
        RAISE EXCEPTION 'unexpected stale token error: %', SQLERRM;
      END IF;
  END;

  result := public.persist_forecast_sku_demand_result(
    '61007000-0000-4000-8000-000000000001'::uuid,
    '61007000-0000-4000-8000-000000000002'::uuid,
    '61007000-0000-4000-8000-000000000003'::uuid,
    '61007000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token2,
    payload
  );
  IF result->>'disposition' IS DISTINCT FROM 'created' THEN
    RAISE EXCEPTION 'changed sourceToken must create new history';
  END IF;

  SELECT count(*) INTO run_count
  FROM public.forecast_runs
  WHERE organization_id = '61007000-0000-4000-8000-000000000001'::uuid
    AND variant_id = '61007000-0000-4000-8000-000000000005'::uuid;

  SELECT count(*) INTO forecast_count
  FROM public.sku_forecasts
  WHERE organization_id = '61007000-0000-4000-8000-000000000001'::uuid
    AND variant_id = '61007000-0000-4000-8000-000000000005'::uuid;

  IF run_count <> 2 OR forecast_count <> 2 THEN
    RAISE EXCEPTION 'expected 2 historical run/forecast pairs, got % / %',
      run_count, forecast_count;
  END IF;
END;
$$;

\echo '--- Immutability + member SELECT / foreign denied ---'

DO $$
DECLARE
  run_id uuid;
  member_count integer;
  foreign_count integer;
BEGIN
  SELECT id INTO run_id
  FROM public.forecast_runs
  WHERE organization_id = '61007000-0000-4000-8000-000000000001'::uuid
  LIMIT 1;

  BEGIN
    UPDATE public.forecast_runs SET status = 'completed' WHERE id = run_id;
    RAISE EXCEPTION 'UPDATE forecast_runs should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE EXCEPTION 'unexpected update error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    DELETE FROM public.forecast_runs WHERE id = run_id;
    RAISE EXCEPTION 'DELETE forecast_runs should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE EXCEPTION 'unexpected delete error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    UPDATE public.sku_forecasts SET mode = 'standard' WHERE forecast_run_id = run_id;
    RAISE EXCEPTION 'UPDATE sku_forecasts should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE EXCEPTION 'unexpected sku_forecasts update error: %', SQLERRM;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', '61007000-0000-4000-8000-000000000007', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO member_count
  FROM public.forecast_runs
  WHERE organization_id = '61007000-0000-4000-8000-000000000001'::uuid;

  IF member_count < 1 THEN
    RAISE EXCEPTION 'member should SELECT own org forecast_runs';
  END IF;

  SELECT count(*) INTO foreign_count
  FROM public.forecast_runs
  WHERE organization_id = '61007000-0000-4000-8000-000000000011'::uuid;

  IF foreign_count <> 0 THEN
    RAISE EXCEPTION 'member must not see foreign org forecast_runs';
  END IF;

  RESET ROLE;
END;
$$;

\echo '--- Authorization absence: authenticated EXECUTE denied; no partial rows ---'

DO $$
DECLARE
  before_runs integer;
  after_runs integer;
  snap jsonb;
  token text;
  payload jsonb;
BEGIN
  SELECT count(*) INTO before_runs FROM public.forecast_runs;

  snap := public.forecast_sku_demand_source_snapshot(
    '61007000-0000-4000-8000-000000000001'::uuid,
    '61007000-0000-4000-8000-000000000002'::uuid,
    '61007000-0000-4000-8000-000000000003'::uuid,
    '61007000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  token := snap->>'sourceToken';
  payload := jsonb_build_object(
    'algorithmVersion', 'forecast-orchestrator-v1',
    'configurationVersion', 'forecast-config-v1',
    'algorithmVersions', '{}'::jsonb,
    'dailyDemand', 9,
    'mode', 'standard',
    'dataSufficiency', 'sufficient',
    'confidence', 'high',
    'weightedDailyDemand', 9,
    'trendApplied', false,
    'trendAdjustedDailyDemand', null,
    'activeWindows', '[]'::jsonb,
    'quality', '{}'::jsonb,
    'horizons', '{}'::jsonb,
    'reproducibilityFingerprint', 'deadbeef',
    'reasonCodes', '[]'::jsonb,
    'classifiedDays', '[]'::jsonb,
    'parameters', '{}'::jsonb,
    'provenance', '{}'::jsonb
  );

  PERFORM set_config('request.jwt.claim.sub', '61007000-0000-4000-8000-000000000007', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.persist_forecast_sku_demand_result(
      '61007000-0000-4000-8000-000000000001'::uuid,
      '61007000-0000-4000-8000-000000000002'::uuid,
      '61007000-0000-4000-8000-000000000003'::uuid,
      '61007000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      90,
      token,
      payload
    );
    RAISE EXCEPTION 'authenticated persist should be denied';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN others THEN
      IF SQLERRM NOT LIKE '%permission denied%'
         AND SQLERRM NOT LIKE '%must be owner%'
      THEN
        RAISE EXCEPTION 'unexpected auth denial: %', SQLERRM;
      END IF;
  END;

  RESET ROLE;

  SELECT count(*) INTO after_runs FROM public.forecast_runs;
  IF after_runs <> before_runs THEN
    RAISE EXCEPTION 'authorization denial must leave no partial rows';
  END IF;
END;
$$;

\echo '--- In-TX revalidation note documented in function body ---'

DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.persist_forecast_sku_demand_result(uuid,uuid,uuid,uuid,date,integer,text,jsonb)'::regprocedure
  ) INTO def;

  IF def !~* 'forecast_sku_demand_source_snapshot' THEN
    RAISE EXCEPTION 'persist RPC must call snapshot for revalidation';
  END IF;
  IF def !~* 'STALE_SOURCE_TOKEN' THEN
    RAISE EXCEPTION 'persist RPC must reject token mismatch';
  END IF;
  IF position('security definer' in lower(def)) = 0 THEN
    RAISE EXCEPTION 'persist RPC must be SECURITY DEFINER';
  END IF;
  IF position('search_path' in lower(def)) = 0 THEN
    RAISE EXCEPTION 'persist RPC must set search_path';
  END IF;
END;
$$;

\echo '--- Multi-session concurrency proofs live in ---'
\echo '--- tests/unit/m6-forecast-persistence-concurrency.live.test.ts ---'

\echo '=== M6 P3b FORECAST PERSISTENCE ADVERSARIAL PASSED ==='

ROLLBACK;
