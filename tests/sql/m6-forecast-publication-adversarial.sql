\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M6 P3d.1 FORECAST PUBLICATION ADVERSARIAL ==='

\set org_a '6100a000-0000-4000-8000-000000000001'
\set org_b '6100a000-0000-4000-8000-000000000011'
\set store_a '6100a000-0000-4000-8000-000000000002'
\set store_b '6100a000-0000-4000-8000-000000000012'
\set location_a '6100a000-0000-4000-8000-000000000003'
\set location_b '6100a000-0000-4000-8000-000000000023'
\set product_a '6100a000-0000-4000-8000-000000000004'
\set product_b '6100a000-0000-4000-8000-000000000014'
\set variant_a '6100a000-0000-4000-8000-000000000005'
\set variant_b '6100a000-0000-4000-8000-000000000025'
\set user_owner '6100a000-0000-4000-8000-000000000007'
\set user_foreign '6100a000-0000-4000-8000-000000000008'
\set order_a '6100a000-0000-4000-8000-000000000021'
\set item_a '6100a000-0000-4000-8000-000000000022'

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
(
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm6-pub-owner@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_foreign'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm6-pub-foreign@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'M6 Pub Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'M6 Pub Org B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (:'org_a'::uuid, :'user_owner'::uuid, 'owner'),
  (:'org_b'::uuid, :'user_foreign'::uuid, 'owner');

INSERT INTO public.stores (id, organization_id, name, status, currency, timezone)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'Pub Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'Pub Store B', 'active', 'USD', 'UTC');

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
  'ev_pub_orders',
  :'org_a'::uuid, :'store_a'::uuid, null, null,
  '2026-07-01', 'orders', 'complete', 'verified_merchant_attestation',
  'merchant:attestation',
  '2026-07-02T00:00:00Z'::timestamptz,
  '2026-07-02T00:00:00Z'::timestamptz,
  1, null, null, 'pub-orders', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_pub_orders'
),
(
  'ev_pub_returns',
  :'org_a'::uuid, :'store_a'::uuid, :'location_a'::uuid, :'variant_a'::uuid,
  '2026-07-01', 'returns', 'complete', 'verified_merchant_attestation',
  'merchant:attestation',
  '2026-07-02T00:00:00Z'::timestamptz,
  '2026-07-02T00:00:00Z'::timestamptz,
  1, null, null, 'pub-returns', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_pub_returns'
);

DELETE FROM public.forecast_coverage_correction_events
WHERE organization_id IN (:'org_a'::uuid, :'org_b'::uuid);

\echo '--- Privileges: no direct DML; service_role EXECUTE only ---'

DO $$
DECLARE
  insert_priv boolean;
  exec_auth boolean;
  exec_service boolean;
BEGIN
  SELECT has_table_privilege('authenticated', 'public.sku_forecast_publications', 'INSERT')
  INTO insert_priv;
  IF insert_priv THEN
    RAISE EXCEPTION 'authenticated must not INSERT publications';
  END IF;

  SELECT has_table_privilege('service_role', 'public.sku_forecast_current', 'UPDATE')
  INTO insert_priv;
  IF insert_priv THEN
    RAISE EXCEPTION 'service_role must not directly UPDATE current pointer';
  END IF;

  SELECT has_function_privilege(
    'authenticated',
    'public.publish_sku_forecast(uuid)',
    'EXECUTE'
  ) INTO exec_auth;
  SELECT has_function_privilege(
    'service_role',
    'public.publish_sku_forecast(uuid)',
    'EXECUTE'
  ) INTO exec_service;

  IF exec_auth OR NOT exec_service THEN
    RAISE EXCEPTION 'publish RPC grants incorrect';
  END IF;
END;
$$;

\echo '--- Helpers: persist publishable / withheld forecast bodies ---'

DO $$
DECLARE
  snap jsonb;
  token text;
  payload jsonb;
  persisted jsonb;
  published jsonb;
  run_id uuid;
  zero_run uuid;
  null_run uuid;
  low_run uuid;
  older_run uuid;
  pointer_run uuid;
  withhold jsonb;
  replay jsonb;
  stale jsonb;
  pending jsonb;
  member_count integer;
  foreign_count integer;
  pub_count integer;
  as_of_new date := '2026-07-02';
  snap_new jsonb;
  token_new text;
  order_new uuid := '6100a000-0000-4000-8000-000000000031';
  item_new uuid := '6100a000-0000-4000-8000-000000000032';
BEGIN
  snap := public.forecast_sku_demand_source_snapshot(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
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
    'organizationId', '6100a000-0000-4000-8000-000000000001',
    'storeId', '6100a000-0000-4000-8000-000000000002',
    'locationId', '6100a000-0000-4000-8000-000000000003',
    'variantId', '6100a000-0000-4000-8000-000000000005',
    'forecastAsOf', '2026-07-01',
    'dailyDemand', 0,
    'mode', 'standard',
    'dataSufficiency', 'sufficient',
    'confidence', 'medium',
    'weightedDailyDemand', 0,
    'trendApplied', false,
    'trendAdjustedDailyDemand', null,
    'activeWindows', '[]'::jsonb,
    'quality', jsonb_build_object('totalDays', 1),
    'horizons', jsonb_build_object('leadTimeDemand', null),
    'reproducibilityFingerprint', 'zero0001',
    'reasonCodes', '[]'::jsonb,
    'classifiedDays', '[]'::jsonb,
    'parameters', '{}'::jsonb,
    'provenance', jsonb_build_object('source', 'pub-adversarial')
  );

  -- Known-zero publishable.
  persisted := public.persist_forecast_sku_demand_result(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    payload
  );
  zero_run := (persisted->>'forecastRunId')::uuid;

  published := public.publish_sku_forecast(zero_run);
  IF published->>'disposition' IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'known-zero should publish, got %', published;
  END IF;
  IF published->>'m7Eligible' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'publication must not imply M7 eligibility';
  END IF;
  IF published->>'persistClaimsPostCommitFreshness' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'publication must not claim freshness';
  END IF;
  IF published->>'pointerAdvanced' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'first publish should advance pointer';
  END IF;

  SELECT forecast_run_id INTO pointer_run
  FROM public.sku_forecast_current
  WHERE organization_id = '6100a000-0000-4000-8000-000000000001'::uuid
    AND variant_id = '6100a000-0000-4000-8000-000000000005'::uuid;
  IF pointer_run IS DISTINCT FROM zero_run THEN
    RAISE EXCEPTION 'pointer should establish on known-zero run';
  END IF;

  -- Same-run replay.
  replay := public.publish_sku_forecast(zero_run);
  IF replay->>'disposition' IS DISTINCT FROM 'replayed' THEN
    RAISE EXCEPTION 'same-run should replay';
  END IF;
  IF replay->>'pointerAdvanced' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'replay must not claim pointer advance';
  END IF;

  -- Null / unavailable withheld.
  persisted := public.persist_forecast_sku_demand_result(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    (payload || jsonb_build_object(
      'dailyDemand', null,
      'mode', 'unavailable',
      'dataSufficiency', 'insufficient',
      'confidence', 'low',
      'reproducibilityFingerprint', 'null0001',
      -- Force distinct natural key via algorithm_version change is not allowed
      -- for orchestrator; use configurationVersion to diversify key.
      'configurationVersion', 'forecast-config-v1-null'
    ))
  );
  null_run := (persisted->>'forecastRunId')::uuid;
  withhold := public.publish_sku_forecast(null_run);
  IF withhold->>'disposition' IS DISTINCT FROM 'withheld' THEN
    RAISE EXCEPTION 'null/unavailable must withhold';
  END IF;
  IF withhold->>'withholdReason' NOT IN ('MODE_UNAVAILABLE', 'NULL_DEMAND', 'INSUFFICIENT_EVIDENCE') THEN
    RAISE EXCEPTION 'unexpected null withhold reason %', withhold->>'withholdReason';
  END IF;
  IF withhold->>'pointerAdvanced' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'withhold must not advance pointer';
  END IF;

  SELECT forecast_run_id INTO pointer_run
  FROM public.sku_forecast_current
  WHERE organization_id = '6100a000-0000-4000-8000-000000000001'::uuid
    AND variant_id = '6100a000-0000-4000-8000-000000000005'::uuid;
  IF pointer_run IS DISTINCT FROM zero_run THEN
    RAISE EXCEPTION 'withheld attempt must leave prior pointer';
  END IF;

  -- Low-confidence artifact policy (first-pointer path avoided: already have
  -- zero current). Equal-as_of completed_at ties are TX-stable here; version
  -- ordering / same-token supersession are proved in live multi-session tests.
  persisted := public.persist_forecast_sku_demand_result(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    (payload || jsonb_build_object(
      'dailyDemand', 1.25,
      'mode', 'limited_history',
      'dataSufficiency', 'limited',
      'confidence', 'low',
      'weightedDailyDemand', 1.25,
      'reproducibilityFingerprint', 'low00001',
      'configurationVersion', 'forecast-config-v1-low'
    ))
  );
  low_run := (persisted->>'forecastRunId')::uuid;
  published := public.publish_sku_forecast(low_run);
  IF published->>'disposition' = 'published' THEN
    IF published->>'m7Eligible' IS DISTINCT FROM 'false' THEN
      RAISE EXCEPTION 'low confidence must not imply M7 eligibility';
    END IF;
  ELSIF published->>'withholdReason' IS DISTINCT FROM 'OLDER_SOURCE_VERSION' THEN
    RAISE EXCEPTION 'low-confidence equal-as_of must publish or OLDER_SOURCE_VERSION, got %',
      published;
  END IF;

  SELECT forecast_run_id INTO pointer_run
  FROM public.sku_forecast_current
  WHERE organization_id = '6100a000-0000-4000-8000-000000000001'::uuid
    AND variant_id = '6100a000-0000-4000-8000-000000000005'::uuid;

  -- Already-published run still replays (no pointer rollback).
  replay := public.publish_sku_forecast(zero_run);
  IF replay->>'disposition' IS DISTINCT FROM 'replayed' THEN
    RAISE EXCEPTION 'already-published run must replay';
  END IF;
  IF (
    SELECT forecast_run_id
    FROM public.sku_forecast_current
    WHERE organization_id = '6100a000-0000-4000-8000-000000000001'::uuid
      AND variant_id = '6100a000-0000-4000-8000-000000000005'::uuid
  ) IS DISTINCT FROM pointer_run THEN
    RAISE EXCEPTION 'replay must not move pointer';
  END IF;

  -- Stale unpublished run: persist, then mutate source before first publish.
  UPDATE public.order_items
  SET quantity = 4
  WHERE id = '6100a000-0000-4000-8000-000000000022'::uuid;
  DELETE FROM public.forecast_coverage_correction_events
  WHERE organization_id = '6100a000-0000-4000-8000-000000000001'::uuid;

  snap := public.forecast_sku_demand_source_snapshot(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  token := snap->>'sourceToken';
  persisted := public.persist_forecast_sku_demand_result(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    (payload || jsonb_build_object(
      'dailyDemand', 2,
      'mode', 'standard',
      'dataSufficiency', 'sufficient',
      'confidence', 'high',
      'weightedDailyDemand', 2,
      'reproducibilityFingerprint', 'stale001',
      'configurationVersion', 'forecast-config-v1-stale'
    ))
  );
  UPDATE public.order_items
  SET quantity = 5
  WHERE id = '6100a000-0000-4000-8000-000000000022'::uuid;
  DELETE FROM public.forecast_coverage_correction_events
  WHERE organization_id = '6100a000-0000-4000-8000-000000000001'::uuid;

  stale := public.publish_sku_forecast((persisted->>'forecastRunId')::uuid);
  IF stale->>'disposition' IS DISTINCT FROM 'withheld'
     OR stale->>'withholdReason' IS DISTINCT FROM 'STALE_SOURCE_TOKEN'
  THEN
    RAISE EXCEPTION 'stale unpublished run must withhold STALE_SOURCE_TOKEN, got %', stale;
  END IF;
  IF (
    SELECT forecast_run_id
    FROM public.sku_forecast_current
    WHERE organization_id = '6100a000-0000-4000-8000-000000000001'::uuid
      AND variant_id = '6100a000-0000-4000-8000-000000000005'::uuid
  ) IS DISTINCT FROM pointer_run THEN
    RAISE EXCEPTION 'stale withhold must leave prior pointer unchanged';
  END IF;

  -- Pending correction withhold after persist under matching token.
  snap := public.forecast_sku_demand_source_snapshot(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  token := snap->>'sourceToken';
  persisted := public.persist_forecast_sku_demand_result(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    (payload || jsonb_build_object(
      'dailyDemand', 3,
      'mode', 'standard',
      'confidence', 'medium',
      'weightedDailyDemand', 3,
      'reproducibilityFingerprint', 'pend0001',
      'configurationVersion', 'forecast-config-v1-pend'
    ))
  );
  INSERT INTO public.forecast_coverage_correction_events (
    organization_id, store_id, stream, local_date,
    location_id, variant_id, business_at, arrived_at,
    source_table, source_op
  ) VALUES (
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    'returns', '2026-07-01',
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01T09:00:00Z'::timestamptz,
    '2026-07-03T02:00:00Z'::timestamptz,
    'return_refunds', 'insert'
  );
  pending := public.publish_sku_forecast((persisted->>'forecastRunId')::uuid);
  IF pending->>'disposition' IS DISTINCT FROM 'withheld'
     OR pending->>'withholdReason' NOT IN ('PENDING_CORRECTION', 'STALE_SOURCE_TOKEN')
  THEN
    RAISE EXCEPTION 'pending/stale must withhold, got %', pending;
  END IF;

  -- Older as_of cannot replace newer pointer: establish newer as_of current.
  DELETE FROM public.forecast_coverage_correction_events
  WHERE organization_id = '6100a000-0000-4000-8000-000000000001'::uuid;

  INSERT INTO public.orders (
    id, organization_id, store_id, status, ordered_at, currency, source
  ) VALUES (
    order_new, '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid, 'completed',
    '2026-07-02T12:00:00Z'::timestamptz, 'USD', 'csv'
  );
  INSERT INTO public.order_items (
    id, organization_id, store_id, order_id, variant_id, location_id, quantity
  ) VALUES (
    item_new, '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid, order_new,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid, 1
  );
  INSERT INTO public.forecast_day_coverage_evidence (
    evidence_id, organization_id, store_id, location_id, variant_id,
    local_date, stream, coverage, trust, source,
    as_of, observed_at, version, invalidated_at, supersedes_evidence_id,
    idempotency_key, integration_id, actor_user_id, provider, closure_id
  ) VALUES
  (
    'ev_pub_orders_2',
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid, null, null,
    as_of_new, 'orders', 'complete', 'verified_merchant_attestation',
    'merchant:attestation',
    '2026-07-03T00:00:00Z'::timestamptz,
    '2026-07-03T00:00:00Z'::timestamptz,
    1, null, null, 'pub-orders-2', null,
    '6100a000-0000-4000-8000-000000000007'::uuid, null,
    'merchant_day_stream_closure:ev_pub_orders_2'
  ),
  (
    'ev_pub_returns_2',
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    as_of_new, 'returns', 'complete', 'verified_merchant_attestation',
    'merchant:attestation',
    '2026-07-03T00:00:00Z'::timestamptz,
    '2026-07-03T00:00:00Z'::timestamptz,
    1, null, null, 'pub-returns-2', null,
    '6100a000-0000-4000-8000-000000000007'::uuid, null,
    'merchant_day_stream_closure:ev_pub_returns_2'
  );
  DELETE FROM public.forecast_coverage_correction_events
  WHERE organization_id = '6100a000-0000-4000-8000-000000000001'::uuid;

  snap_new := public.forecast_sku_demand_source_snapshot(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    as_of_new,
    90
  );
  token_new := snap_new->>'sourceToken';
  persisted := public.persist_forecast_sku_demand_result(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    as_of_new,
    90,
    token_new,
    (payload || jsonb_build_object(
      'forecastAsOf', as_of_new::text,
      'dailyDemand', 4,
      'mode', 'standard',
      'confidence', 'high',
      'weightedDailyDemand', 4,
      'reproducibilityFingerprint', 'asofnew1'
    ))
  );
  published := public.publish_sku_forecast((persisted->>'forecastRunId')::uuid);
  IF published->>'disposition' IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'newer as_of should publish';
  END IF;

  -- Build older as_of run under current Jul-01 token and attempt publish.
  snap := public.forecast_sku_demand_source_snapshot(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  token := snap->>'sourceToken';
  persisted := public.persist_forecast_sku_demand_result(
    '6100a000-0000-4000-8000-000000000001'::uuid,
    '6100a000-0000-4000-8000-000000000002'::uuid,
    '6100a000-0000-4000-8000-000000000003'::uuid,
    '6100a000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90,
    token,
    (payload || jsonb_build_object(
      'dailyDemand', 5,
      'mode', 'standard',
      'confidence', 'high',
      'weightedDailyDemand', 5,
      'reproducibilityFingerprint', 'asofold1',
      'configurationVersion', 'forecast-config-v1-old'
    ))
  );
  older_run := (persisted->>'forecastRunId')::uuid;
  withhold := public.publish_sku_forecast(older_run);
  IF withhold->>'withholdReason' IS DISTINCT FROM 'OLDER_AS_OF_THAN_CURRENT' THEN
    RAISE EXCEPTION 'older as_of must withhold, got %', withhold;
  END IF;

  -- Immutability + RLS.
  SELECT id INTO run_id
  FROM public.sku_forecast_publications
  WHERE organization_id = '6100a000-0000-4000-8000-000000000001'::uuid
  LIMIT 1;

  BEGIN
    UPDATE public.sku_forecast_publications
    SET outcome = 'withheld'
    WHERE id = run_id;
    RAISE EXCEPTION 'publication UPDATE should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE EXCEPTION 'unexpected publication update error: %', SQLERRM;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', '6100a000-0000-4000-8000-000000000007', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO member_count
  FROM public.sku_forecast_publications
  WHERE organization_id = '6100a000-0000-4000-8000-000000000001'::uuid;
  IF member_count < 1 THEN
    RAISE EXCEPTION 'member should SELECT own publications';
  END IF;

  SELECT count(*) INTO foreign_count
  FROM public.sku_forecast_publications
  WHERE organization_id = '6100a000-0000-4000-8000-000000000011'::uuid;
  IF foreign_count <> 0 THEN
    RAISE EXCEPTION 'member must not see foreign publications';
  END IF;

  BEGIN
    PERFORM public.publish_sku_forecast(older_run);
    RAISE EXCEPTION 'authenticated publish should be denied';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN others THEN
      IF SQLERRM NOT LIKE '%permission denied%' THEN
        RAISE EXCEPTION 'unexpected auth denial: %', SQLERRM;
      END IF;
  END;

  RESET ROLE;

  SELECT count(*) INTO pub_count
  FROM public.sku_forecast_publications
  WHERE outcome = 'withheld';
  IF pub_count < 1 THEN
    RAISE EXCEPTION 'expected withheld events recorded';
  END IF;
END;
$$;

\echo '--- Multi-session concurrency proofs live in ---'
\echo '--- tests/unit/m6-forecast-publication-concurrency.live.test.ts ---'

\echo '=== M6 P3d.1 FORECAST PUBLICATION ADVERSARIAL PASSED ==='

ROLLBACK;
