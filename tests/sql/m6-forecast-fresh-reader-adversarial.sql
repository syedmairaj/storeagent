\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M6 P3d.3 FRESH PUBLISHED FORECAST READER ADVERSARIAL ==='

\set org_a '6100d000-0000-4000-8000-000000000001'
\set org_b '6100d000-0000-4000-8000-000000000011'
\set store_a '6100d000-0000-4000-8000-000000000002'
\set store_b '6100d000-0000-4000-8000-000000000012'
\set location_a '6100d000-0000-4000-8000-000000000003'
\set location_b '6100d000-0000-4000-8000-000000000013'
\set product_a '6100d000-0000-4000-8000-000000000004'
\set product_b '6100d000-0000-4000-8000-000000000014'
\set variant_a '6100d000-0000-4000-8000-000000000005'
\set variant_b '6100d000-0000-4000-8000-000000000015'
\set user_owner '6100d000-0000-4000-8000-000000000007'
\set order_a '6100d000-0000-4000-8000-000000000021'
\set item_a '6100d000-0000-4000-8000-000000000022'

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm6-fresh-reader@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone) VALUES
  (:'org_a'::uuid, 'M6 Fresh A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'M6 Fresh B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES (:'org_a'::uuid, :'user_owner'::uuid, 'owner');

INSERT INTO public.stores (id, organization_id, name, status, currency, timezone) VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'B', 'active', 'USD', 'UTC');

INSERT INTO public.locations (id, organization_id, store_id, name, status) VALUES
  (:'location_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'A', 'active'),
  (:'location_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, 'B', 'active');

INSERT INTO public.products (id, organization_id, store_id, title, status) VALUES
  (:'product_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'A', 'active'),
  (:'product_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, 'B', 'active');

INSERT INTO public.product_variants (
  id, organization_id, store_id, product_id, sku, status
) VALUES
  (:'variant_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, :'product_a'::uuid, 'A1', 'active'),
  (:'variant_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, :'product_b'::uuid, 'B1', 'active');

INSERT INTO public.orders (
  id, organization_id, store_id, status, ordered_at, currency, source
) VALUES (
  :'order_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'completed',
  '2026-07-01T12:00:00Z'::timestamptz, 'USD', 'csv'
);

INSERT INTO public.order_items (
  id, organization_id, store_id, order_id, variant_id, location_id, quantity
) VALUES (
  :'item_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, :'order_a'::uuid,
  :'variant_a'::uuid, :'location_a'::uuid, 3
);

INSERT INTO public.forecast_day_coverage_evidence (
  evidence_id, organization_id, store_id, location_id, variant_id,
  local_date, stream, coverage, trust, source,
  as_of, observed_at, version, invalidated_at, supersedes_evidence_id,
  idempotency_key, integration_id, actor_user_id, provider, closure_id
) VALUES
(
  'ev_fresh_orders',
  :'org_a'::uuid, :'store_a'::uuid, null, null,
  '2026-07-01', 'orders', 'complete', 'verified_merchant_attestation',
  'merchant:attestation',
  '2026-07-02T00:00:00Z'::timestamptz,
  '2026-07-02T00:00:00Z'::timestamptz,
  1, null, null, 'fresh-orders', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_fresh_orders'
),
(
  'ev_fresh_returns',
  :'org_a'::uuid, :'store_a'::uuid, :'location_a'::uuid, :'variant_a'::uuid,
  '2026-07-01', 'returns', 'complete', 'verified_merchant_attestation',
  'merchant:attestation',
  '2026-07-02T00:00:00Z'::timestamptz,
  '2026-07-02T00:00:00Z'::timestamptz,
  1, null, null, 'fresh-returns', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_fresh_returns'
);

\echo '--- Privileges ---'
DO $$
DECLARE
  exec_auth boolean;
  exec_service boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.read_fresh_published_sku_forecast(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) INTO exec_auth;
  SELECT has_function_privilege(
    'service_role',
    'public.read_fresh_published_sku_forecast(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) INTO exec_service;
  IF exec_auth OR NOT exec_service THEN
    RAISE EXCEPTION 'reader RPC grants incorrect';
  END IF;
END;
$$;

\echo '--- Reader dispositions ---'
DO $$
DECLARE
  snap jsonb;
  token text;
  payload jsonb;
  persisted jsonb;
  published jsonb;
  read_result jsonb;
  low_run uuid;
  zero_run uuid;
  med_run uuid;
  base_payload jsonb;
BEGIN
  DELETE FROM public.forecast_coverage_correction_events
  WHERE organization_id = '6100d000-0000-4000-8000-000000000001'::uuid;

  SET LOCAL ROLE service_role;

  read_result := public.read_fresh_published_sku_forecast(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid
  );
  IF read_result->>'disposition' IS DISTINCT FROM 'ABSENT'
     OR read_result->>'dailyDemand' IS NOT NULL
     OR (read_result->>'m7NumericEligible')::boolean IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'missing pointer must be ABSENT, got %', read_result;
  END IF;
  IF read_result->>'freshnessLimitation' NOT ILIKE '%forecast age%' THEN
    RAISE EXCEPTION 'ABSENT must document forecast-age limitation';
  END IF;

  snap := public.forecast_sku_demand_source_snapshot(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  token := snap->>'sourceToken';

  base_payload := jsonb_build_object(
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
    'organizationId', '6100d000-0000-4000-8000-000000000001',
    'storeId', '6100d000-0000-4000-8000-000000000002',
    'locationId', '6100d000-0000-4000-8000-000000000003',
    'variantId', '6100d000-0000-4000-8000-000000000005',
    'forecastAsOf', '2026-07-01',
    'trendApplied', false,
    'trendAdjustedDailyDemand', null,
    'activeWindows', '[]'::jsonb,
    'quality', jsonb_build_object('totalDays', 1),
    'horizons', jsonb_build_object('leadTimeDemand', null),
    'reasonCodes', '[]'::jsonb,
    'classifiedDays', '[]'::jsonb,
    'parameters', '{}'::jsonb,
    'provenance', jsonb_build_object('source', 'fresh-adv')
  );

  -- Known-zero medium confidence: eligible.
  persisted := public.persist_forecast_sku_demand_result(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    base_payload || jsonb_build_object(
      'dailyDemand', 0,
      'mode', 'standard',
      'dataSufficiency', 'sufficient',
      'confidence', 'medium',
      'weightedDailyDemand', 0,
      'reproducibilityFingerprint', 'freshzero1'
    )
  );
  zero_run := (persisted->>'forecastRunId')::uuid;
  published := public.publish_sku_forecast(zero_run);
  IF published->>'disposition' IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'zero demand should publish, got %', published;
  END IF;

  read_result := public.read_fresh_published_sku_forecast(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid
  );
  IF read_result->>'disposition' IS DISTINCT FROM 'eligible'
     OR (read_result->>'m7NumericEligible')::boolean IS DISTINCT FROM true
     OR (read_result->>'dailyDemand')::numeric IS DISTINCT FROM 0
     OR read_result->>'confidence' IS DISTINCT FROM 'medium'
     OR read_result->>'forecastAsOf' IS DISTINCT FROM '2026-07-01'
  THEN
    RAISE EXCEPTION 'known-zero medium must be eligible, got %', read_result;
  END IF;

  -- Low confidence published artifact → FORECAST_CONFIDENCE_LOW.
  -- Replace pointer state: same-TX now() ties make supersession flaky.
  RESET ROLE;
  TRUNCATE TABLE public.sku_forecast_current,
    public.sku_forecast_publications,
    public.sku_forecasts,
    public.forecast_runs
  CASCADE;
  UPDATE public.order_items
  SET quantity = quantity + 1
  WHERE id = '6100d000-0000-4000-8000-000000000022'::uuid;
  DELETE FROM public.forecast_coverage_correction_events
  WHERE organization_id = '6100d000-0000-4000-8000-000000000001'::uuid;
  SET LOCAL ROLE service_role;

  snap := public.forecast_sku_demand_source_snapshot(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  token := snap->>'sourceToken';
  persisted := public.persist_forecast_sku_demand_result(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    base_payload || jsonb_build_object(
      'dailyDemand', 2,
      'mode', 'standard',
      'dataSufficiency', 'sufficient',
      'confidence', 'low',
      'weightedDailyDemand', 2,
      'reproducibilityFingerprint', 'freshlow01',
      'configurationVersion', 'forecast-config-v1-low'
    )
  );
  low_run := (persisted->>'forecastRunId')::uuid;
  published := public.publish_sku_forecast(low_run);
  IF published->>'disposition' IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'low confidence may publish as artifact, got %', published;
  END IF;

  read_result := public.read_fresh_published_sku_forecast(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid
  );
  IF read_result->>'disposition' IS DISTINCT FROM 'FORECAST_CONFIDENCE_LOW'
     OR read_result->>'dailyDemand' IS NOT NULL
     OR (read_result->>'m7NumericEligible')::boolean IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'low confidence must miss, got %', read_result;
  END IF;

  -- High confidence eligible (fresh pointer; same-TX now() ties make
  -- supersession flaky, so replace publication state instead).
  RESET ROLE;
  TRUNCATE TABLE public.sku_forecast_current,
    public.sku_forecast_publications,
    public.sku_forecasts,
    public.forecast_runs
  CASCADE;
  UPDATE public.order_items
  SET quantity = quantity + 1
  WHERE id = '6100d000-0000-4000-8000-000000000022'::uuid;
  DELETE FROM public.forecast_coverage_correction_events
  WHERE organization_id = '6100d000-0000-4000-8000-000000000001'::uuid;
  SET LOCAL ROLE service_role;

  snap := public.forecast_sku_demand_source_snapshot(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  token := snap->>'sourceToken';
  persisted := public.persist_forecast_sku_demand_result(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    base_payload || jsonb_build_object(
      'dailyDemand', 4,
      'mode', 'standard',
      'dataSufficiency', 'sufficient',
      'confidence', 'high',
      'weightedDailyDemand', 4,
      'reproducibilityFingerprint', 'freshhigh1',
      'configurationVersion', 'forecast-config-v1-high'
    )
  );
  med_run := (persisted->>'forecastRunId')::uuid;
  published := public.publish_sku_forecast(med_run);
  IF published->>'disposition' IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'high confidence should publish, got %', published;
  END IF;

  read_result := public.read_fresh_published_sku_forecast(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid
  );
  IF read_result->>'disposition' IS DISTINCT FROM 'eligible'
     OR (read_result->>'dailyDemand')::numeric IS DISTINCT FROM 4
     OR read_result->>'confidence' IS DISTINCT FROM 'high'
  THEN
    RAISE EXCEPTION 'high confidence must be eligible, got %', read_result;
  END IF;

  -- Stale token after commerce change.
  RESET ROLE;
  UPDATE public.order_items
  SET quantity = quantity + 1
  WHERE id = '6100d000-0000-4000-8000-000000000022'::uuid;
  -- Force STALE via token mismatch only (clear pending outbox).
  DELETE FROM public.forecast_coverage_correction_events
  WHERE organization_id = '6100d000-0000-4000-8000-000000000001'::uuid;
  SET LOCAL ROLE service_role;

  read_result := public.read_fresh_published_sku_forecast(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid
  );
  IF read_result->>'disposition' IS DISTINCT FROM 'STALE'
     OR read_result->>'dailyDemand' IS NOT NULL
  THEN
    RAISE EXCEPTION 'changed token must be STALE, got %', read_result;
  END IF;

  -- Persist+publish a fresh eligible run then add pending.
  RESET ROLE;
  DELETE FROM public.forecast_coverage_correction_events
  WHERE organization_id = '6100d000-0000-4000-8000-000000000001'::uuid;
  SET LOCAL ROLE service_role;
  snap := public.forecast_sku_demand_source_snapshot(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  token := snap->>'sourceToken';
  persisted := public.persist_forecast_sku_demand_result(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    base_payload || jsonb_build_object(
      'dailyDemand', 5,
      'mode', 'standard',
      'dataSufficiency', 'sufficient',
      'confidence', 'medium',
      'weightedDailyDemand', 5,
      'reproducibilityFingerprint', 'freshpend1',
      'configurationVersion', 'forecast-config-v1-pend'
    )
  );
  published := public.publish_sku_forecast((persisted->>'forecastRunId')::uuid);
  IF published->>'disposition' IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'pending setup publish failed: %', published;
  END IF;

  RESET ROLE;
  INSERT INTO public.forecast_coverage_correction_events (
    organization_id, store_id, stream, local_date,
    location_id, variant_id, business_at, arrived_at,
    source_table, source_op
  ) VALUES (
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    'orders', '2026-07-01',
    null, null,
    '2026-07-01T08:00:00Z'::timestamptz,
    '2026-07-03T00:00:00Z'::timestamptz,
    'order_items', 'update'
  );
  SET LOCAL ROLE service_role;

  read_result := public.read_fresh_published_sku_forecast(
    '6100d000-0000-4000-8000-000000000001'::uuid,
    '6100d000-0000-4000-8000-000000000002'::uuid,
    '6100d000-0000-4000-8000-000000000003'::uuid,
    '6100d000-0000-4000-8000-000000000005'::uuid
  );
  -- New correction events are part of sourceToken identity, so post-publish
  -- arrivals surface as STALE (fail-closed). PENDING_CORRECTION is reserved
  -- for token-stable pending fences and is covered by the unit decoder.
  IF read_result->>'disposition' IS DISTINCT FROM 'STALE'
     OR read_result->>'dailyDemand' IS NOT NULL
     OR (read_result->>'m7NumericEligible')::boolean IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'post-publish correction must miss closed, got %', read_result;
  END IF;

  -- Foreign grain ABSENT (org B has no pointer).
  read_result := public.read_fresh_published_sku_forecast(
    '6100d000-0000-4000-8000-000000000011'::uuid,
    '6100d000-0000-4000-8000-000000000012'::uuid,
    '6100d000-0000-4000-8000-000000000013'::uuid,
    '6100d000-0000-4000-8000-000000000015'::uuid
  );
  IF read_result->>'disposition' IS DISTINCT FROM 'ABSENT' THEN
    RAISE EXCEPTION 'foreign grain without pointer must be ABSENT, got %', read_result;
  END IF;

  -- RLS: member SELECT current for own org; not foreign.
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '6100d000-0000-4000-8000-000000000007', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  IF (
    SELECT count(*) FROM public.sku_forecast_current
    WHERE organization_id = '6100d000-0000-4000-8000-000000000001'::uuid
  ) < 1 THEN
    RAISE EXCEPTION 'member should SELECT own current pointer';
  END IF;

  IF (
    SELECT count(*) FROM public.sku_forecast_current
    WHERE organization_id = '6100d000-0000-4000-8000-000000000011'::uuid
  ) <> 0 THEN
    RAISE EXCEPTION 'member must not see foreign current pointer';
  END IF;
END;
$$;

\echo '=== M6 P3d.3 FRESH PUBLISHED FORECAST READER ADVERSARIAL PASSED ==='
ROLLBACK;
