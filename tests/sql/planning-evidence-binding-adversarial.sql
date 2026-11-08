\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== PLANNING EVIDENCE BINDING V1 ADVERSARIAL ==='

\set org_a '88002000-0000-4000-8000-000000000001'
\set org_b '88002000-0000-4000-8000-000000000011'
\set user_owner '88002000-0000-4000-8000-000000000007'
\set store_a1 '88002000-0000-4000-8000-000000000002'
\set store_a2 '88002000-0000-4000-8000-000000000022'
\set store_b '88002000-0000-4000-8000-000000000012'
\set loc_a1 '88002000-0000-4000-8000-000000000003'
\set loc_a2 '88002000-0000-4000-8000-000000000023'
\set loc_b '88002000-0000-4000-8000-000000000013'
\set product_a '88002000-0000-4000-8000-000000000004'
\set product_b '88002000-0000-4000-8000-000000000014'
\set variant_a1 '88002000-0000-4000-8000-000000000005'
\set variant_a2 '88002000-0000-4000-8000-000000000025'
\set variant_b '88002000-0000-4000-8000-000000000015'

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
(
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'plan-bind-owner@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'Planning Bind Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'Planning Bind Org B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (:'org_a'::uuid, :'user_owner'::uuid, 'owner');

INSERT INTO public.stores (id, organization_id, name, status, currency, timezone)
VALUES
  (:'store_a1'::uuid, :'org_a'::uuid, 'Store A1 UTC', 'active', 'USD', 'UTC'),
  (:'store_a2'::uuid, :'org_a'::uuid, 'Store A2 Dubai', 'active', 'USD', 'Asia/Dubai'),
  (:'store_b'::uuid, :'org_b'::uuid, 'Store B', 'active', 'USD', 'UTC');

INSERT INTO public.locations (id, organization_id, store_id, name, status)
VALUES
  (:'loc_a1'::uuid, :'org_a'::uuid, :'store_a1'::uuid, 'Loc A1', 'active'),
  (:'loc_a2'::uuid, :'org_a'::uuid, :'store_a2'::uuid, 'Loc A2', 'active'),
  (:'loc_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, 'Loc B', 'active');

INSERT INTO public.products (id, organization_id, store_id, title, status)
VALUES
  (:'product_a'::uuid, :'org_a'::uuid, :'store_a1'::uuid, 'Product A', 'active'),
  ('88002000-0000-4000-8000-000000000044'::uuid, :'org_a'::uuid, :'store_a2'::uuid, 'Product A2', 'active'),
  (:'product_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, 'Product B', 'active');

INSERT INTO public.product_variants (
  id, organization_id, store_id, product_id, sku, status
)
VALUES
  (:'variant_a1'::uuid, :'org_a'::uuid, :'store_a1'::uuid, :'product_a'::uuid, 'SKU-A1', 'active'),
  (:'variant_a2'::uuid, :'org_a'::uuid, :'store_a2'::uuid, '88002000-0000-4000-8000-000000000044'::uuid, 'SKU-A2', 'active'),
  (:'variant_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, :'product_b'::uuid, 'SKU-B', 'active');

CREATE FUNCTION pg_temp.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE FUNCTION pg_temp.clear_user()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END;
$$;

CREATE FUNCTION pg_temp.insert_metric(
  p_org uuid,
  p_store uuid,
  p_location uuid,
  p_variant uuid,
  p_metric_date date
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.sku_daily_metrics (
    organization_id, store_id, location_id, variant_id,
    metric_date, algorithm_version,
    units_sold, returned_units, net_units_sold,
    eligible_days_7d, eligible_days_14d, eligible_days_30d, eligible_days_90d,
    coverage_ratio_7d, coverage_ratio_14d, coverage_ratio_30d, coverage_ratio_90d,
    sales_velocity_7d_reason_code, sales_velocity_14d_reason_code,
    sales_velocity_30d_reason_code, sales_velocity_90d_reason_code,
    eligible_incoming_reason_code, days_of_stock_reason_code,
    safety_stock_reason_code, reorder_point_reason_code, target_stock_reason_code,
    inventory_age_quality, inventory_age_reason_code,
    demand_trend, demand_trend_reason_code
  ) VALUES (
    p_org, p_store, p_location, p_variant,
    p_metric_date, 'm5-derived-metrics-v1',
    0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    'no_eligible_days', 'no_eligible_days', 'no_eligible_days', 'no_eligible_days',
    'incoming_state_unknown', 'demand_unknown',
    'safety_stock_days_unknown', 'lead_time_unknown', 'lead_time_unknown',
    'unavailable', 'inventory_age_unknown',
    'unknown', 'trend_input_unknown'
  );
END;
$$;

\echo '--- Privilege inventory for binding RPCs ---'

DO $$
DECLARE
  plan_auth boolean;
  plan_anon boolean;
  plan_service boolean;
  inv_auth boolean;
  inv_anon boolean;
  inv_service boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.sku_daily_metric_organization_planning_settings(uuid)',
    'EXECUTE'
  ) INTO plan_auth;
  SELECT has_function_privilege(
    'anon',
    'public.sku_daily_metric_organization_planning_settings(uuid)',
    'EXECUTE'
  ) INTO plan_anon;
  SELECT has_function_privilege(
    'service_role',
    'public.sku_daily_metric_organization_planning_settings(uuid)',
    'EXECUTE'
  ) INTO plan_service;

  SELECT has_function_privilege(
    'authenticated',
    'public.enqueue_sku_daily_metric_planning_invalidation(uuid)',
    'EXECUTE'
  ) INTO inv_auth;
  SELECT has_function_privilege(
    'anon',
    'public.enqueue_sku_daily_metric_planning_invalidation(uuid)',
    'EXECUTE'
  ) INTO inv_anon;
  SELECT has_function_privilege(
    'service_role',
    'public.enqueue_sku_daily_metric_planning_invalidation(uuid)',
    'EXECUTE'
  ) INTO inv_service;

  IF plan_auth OR plan_anon OR NOT plan_service THEN
    RAISE EXCEPTION 'planning settings RPC grants incorrect (auth=%, anon=%, service=%)',
      plan_auth, plan_anon, plan_service;
  END IF;

  IF inv_auth OR inv_anon OR NOT inv_service THEN
    RAISE EXCEPTION 'planning invalidation RPC grants incorrect (auth=%, anon=%, service=%)',
      inv_auth, inv_anon, inv_service;
  END IF;
END;
$$;

\echo '--- Missing planning row returns all-null JSON ---'

DO $$
DECLARE
  settings jsonb;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT public.sku_daily_metric_organization_planning_settings(
    '88002000-0000-4000-8000-000000000001'::uuid
  )
  INTO settings;
  RESET ROLE;

  IF settings IS DISTINCT FROM jsonb_build_object(
    'leadTimeDays', null,
    'safetyStockDays', null,
    'reviewPeriodDays', null
  ) THEN
    RAISE EXCEPTION 'missing planning must return all-null settings: %', settings;
  END IF;
END;
$$;

\echo '--- Seed current + stale metrics across orgs/stores ---'

DO $$
DECLARE
  today_utc date := (pg_catalog.timezone('UTC', pg_catalog.now()))::date;
  today_dubai date := (pg_catalog.timezone('Asia/Dubai', pg_catalog.now()))::date;
  yesterday_utc date := today_utc - 1;
BEGIN
  PERFORM pg_temp.insert_metric(
    '88002000-0000-4000-8000-000000000001'::uuid,
    '88002000-0000-4000-8000-000000000002'::uuid,
    '88002000-0000-4000-8000-000000000003'::uuid,
    '88002000-0000-4000-8000-000000000005'::uuid,
    today_utc
  );
  PERFORM pg_temp.insert_metric(
    '88002000-0000-4000-8000-000000000001'::uuid,
    '88002000-0000-4000-8000-000000000002'::uuid,
    '88002000-0000-4000-8000-000000000003'::uuid,
    '88002000-0000-4000-8000-000000000005'::uuid,
    yesterday_utc
  );
  PERFORM pg_temp.insert_metric(
    '88002000-0000-4000-8000-000000000001'::uuid,
    '88002000-0000-4000-8000-000000000022'::uuid,
    '88002000-0000-4000-8000-000000000023'::uuid,
    '88002000-0000-4000-8000-000000000025'::uuid,
    today_dubai
  );
  PERFORM pg_temp.insert_metric(
    '88002000-0000-4000-8000-000000000011'::uuid,
    '88002000-0000-4000-8000-000000000012'::uuid,
    '88002000-0000-4000-8000-000000000013'::uuid,
    '88002000-0000-4000-8000-000000000015'::uuid,
    today_utc
  );
END;
$$;

\echo '--- Owner upsert dirties only org A current grains ---'

SELECT pg_temp.as_user(:'user_owner'::uuid);

SELECT *
FROM public.upsert_current_user_organization_planning_inputs(
  :'org_a'::uuid,
  7,
  3,
  14
);

SELECT pg_temp.clear_user();

DO $$
DECLARE
  org_a_current integer;
  org_a_stale integer;
  org_b_current integer;
  settings jsonb;
BEGIN
  SELECT count(*)::integer
  INTO org_a_current
  FROM public.sku_daily_metric_recompute_requests
  WHERE organization_id = '88002000-0000-4000-8000-000000000001'::uuid
    AND dirty_generation >= 1
    AND metric_date IN (
      (pg_catalog.timezone('UTC', pg_catalog.now()))::date,
      (pg_catalog.timezone('Asia/Dubai', pg_catalog.now()))::date
    );

  SELECT count(*)::integer
  INTO org_a_stale
  FROM public.sku_daily_metric_recompute_requests
  WHERE organization_id = '88002000-0000-4000-8000-000000000001'::uuid
    AND metric_date = (pg_catalog.timezone('UTC', pg_catalog.now()))::date - 1;

  SELECT count(*)::integer
  INTO org_b_current
  FROM public.sku_daily_metric_recompute_requests
  WHERE organization_id = '88002000-0000-4000-8000-000000000011'::uuid;

  IF org_a_current < 2 THEN
    RAISE EXCEPTION 'expected multi-store current invalidation for org A, got %',
      org_a_current;
  END IF;

  IF org_a_stale <> 0 THEN
    RAISE EXCEPTION 'stale metric_date must not be invalidated, got %', org_a_stale;
  END IF;

  IF org_b_current <> 0 THEN
    RAISE EXCEPTION 'cross-org invalidation leak into org B: %', org_b_current;
  END IF;

  SET LOCAL ROLE service_role;
  SELECT public.sku_daily_metric_organization_planning_settings(
    '88002000-0000-4000-8000-000000000001'::uuid
  )
  INTO settings;
  RESET ROLE;

  IF settings IS DISTINCT FROM jsonb_build_object(
    'leadTimeDays', 7,
    'safetyStockDays', 3,
    'reviewPeriodDays', 14
  ) THEN
    RAISE EXCEPTION 'planning settings read mismatch: %', settings;
  END IF;
END;
$$;

\echo '--- Repeated invalidation bumps dirty_generation without cross-org ---'

DO $$
DECLARE
  first_dirty bigint;
  second_dirty bigint;
  bumped integer;
BEGIN
  SELECT dirty_generation
  INTO first_dirty
  FROM public.sku_daily_metric_recompute_requests
  WHERE organization_id = '88002000-0000-4000-8000-000000000001'::uuid
    AND store_id = '88002000-0000-4000-8000-000000000002'::uuid
  LIMIT 1;

  SET LOCAL ROLE service_role;
  SELECT public.enqueue_sku_daily_metric_planning_invalidation(
    '88002000-0000-4000-8000-000000000001'::uuid
  )
  INTO bumped;
  RESET ROLE;

  SELECT dirty_generation
  INTO second_dirty
  FROM public.sku_daily_metric_recompute_requests
  WHERE organization_id = '88002000-0000-4000-8000-000000000001'::uuid
    AND store_id = '88002000-0000-4000-8000-000000000002'::uuid
  LIMIT 1;

  IF bumped < 1 OR second_dirty <> first_dirty + 1 THEN
    RAISE EXCEPTION 'dirty bump failed: bumped=%, first=%, second=%',
      bumped, first_dirty, second_dirty;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sku_daily_metric_recompute_requests
    WHERE organization_id = '88002000-0000-4000-8000-000000000011'::uuid
  ) THEN
    RAISE EXCEPTION 'foreign org request created by planning invalidation';
  END IF;
END;
$$;

\echo '--- Authenticated cannot call service planning RPCs ---'

DO $$
BEGIN
  PERFORM pg_temp.as_user('88002000-0000-4000-8000-000000000007'::uuid);
  BEGIN
    PERFORM public.sku_daily_metric_organization_planning_settings(
      '88002000-0000-4000-8000-000000000001'::uuid
    );
    RAISE EXCEPTION 'authenticated must not execute planning settings RPC';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  BEGIN
    PERFORM public.enqueue_sku_daily_metric_planning_invalidation(
      '88002000-0000-4000-8000-000000000001'::uuid
    );
    RAISE EXCEPTION 'authenticated must not execute planning invalidation RPC';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
  PERFORM pg_temp.clear_user();
END;
$$;

\echo '--- Claimed lease preserved while dirty_generation advances ---'

DO $$
DECLARE
  before_dirty bigint;
  after_dirty bigint;
  after_status text;
  after_claimed bigint;
  after_token text;
  bumped integer;
BEGIN
  UPDATE public.sku_daily_metric_recompute_requests
  SET
    status = 'claimed',
    lease_owner_id = 'planning-bind-lease',
    lease_claim_token = 'claim-token-keep',
    lease_claimed_at = pg_catalog.now(),
    lease_expires_at = pg_catalog.now() + interval '5 minutes',
    claimed_generation = dirty_generation,
    attempt_count = 1
  WHERE organization_id = '88002000-0000-4000-8000-000000000001'::uuid
    AND store_id = '88002000-0000-4000-8000-000000000002'::uuid;

  SELECT dirty_generation
  INTO before_dirty
  FROM public.sku_daily_metric_recompute_requests
  WHERE organization_id = '88002000-0000-4000-8000-000000000001'::uuid
    AND store_id = '88002000-0000-4000-8000-000000000002'::uuid
  LIMIT 1;

  SET LOCAL ROLE service_role;
  SELECT public.enqueue_sku_daily_metric_planning_invalidation(
    '88002000-0000-4000-8000-000000000001'::uuid
  )
  INTO bumped;
  RESET ROLE;

  SELECT dirty_generation, status, claimed_generation, lease_claim_token
  INTO after_dirty, after_status, after_claimed, after_token
  FROM public.sku_daily_metric_recompute_requests
  WHERE organization_id = '88002000-0000-4000-8000-000000000001'::uuid
    AND store_id = '88002000-0000-4000-8000-000000000002'::uuid
  LIMIT 1;

  IF bumped < 1
     OR after_dirty <> before_dirty + 1
     OR after_status IS DISTINCT FROM 'claimed'
     OR after_claimed IS DISTINCT FROM before_dirty
     OR after_token IS DISTINCT FROM 'claim-token-keep'
  THEN
    RAISE EXCEPTION
      'claimed lease/dirty fencing broken: bumped=%, dirty %->%, status=%, claimed=%, token=%',
      bumped, before_dirty, after_dirty, after_status, after_claimed, after_token;
  END IF;

  IF after_dirty <= after_claimed THEN
    RAISE EXCEPTION 'dirty_generation must exceed claimed_generation after planning bump';
  END IF;
END;
$$;

\echo '--- Upsert+invalidation atomic rollback on invalidation failure ---'

DO $$
DECLARE
  planning_count integer;
  request_count integer;
BEGIN
  -- Break store-local date evaluation so invalidation fails after write attempt.
  UPDATE public.stores
  SET timezone = 'Not/ARealZone'
  WHERE id = '88002000-0000-4000-8000-000000000002'::uuid;

  PERFORM pg_temp.as_user('88002000-0000-4000-8000-000000000007'::uuid);
  BEGIN
    PERFORM public.upsert_current_user_organization_planning_inputs(
      '88002000-0000-4000-8000-000000000001'::uuid,
      9,
      9,
      9
    );
    RAISE EXCEPTION 'upsert should fail when store timezone is invalid';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%upsert should fail%' THEN
        RAISE;
      END IF;
      -- expected invalidation failure
      NULL;
  END;
  PERFORM pg_temp.clear_user();

  SELECT count(*)::integer
  INTO planning_count
  FROM public.organization_planning_inputs
  WHERE organization_id = '88002000-0000-4000-8000-000000000001'::uuid
    AND lead_time_days = 9
    AND safety_stock_days = 9
    AND review_period_days = 9;

  IF planning_count <> 0 THEN
    RAISE EXCEPTION 'planning write must roll back with invalidation failure';
  END IF;

  -- Restore timezone for later assertions in this txn.
  UPDATE public.stores
  SET timezone = 'UTC'
  WHERE id = '88002000-0000-4000-8000-000000000002'::uuid;

  SELECT count(*)::integer
  INTO request_count
  FROM public.sku_daily_metric_recompute_requests
  WHERE organization_id = '88002000-0000-4000-8000-000000000011'::uuid;

  IF request_count <> 0 THEN
    RAISE EXCEPTION 'foreign org must remain untouched after failed upsert';
  END IF;
END;
$$;

\echo '--- Historical metric_date excluded from current fanout ---'

DO $$
DECLARE
  stale_requests integer;
  current_only integer;
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM public.enqueue_sku_daily_metric_planning_invalidation(
    '88002000-0000-4000-8000-000000000001'::uuid
  );
  RESET ROLE;

  SELECT count(*)::integer
  INTO stale_requests
  FROM public.sku_daily_metric_recompute_requests
  WHERE organization_id = '88002000-0000-4000-8000-000000000001'::uuid
    AND metric_date = (pg_catalog.timezone('UTC', pg_catalog.now()))::date - 1;

  SELECT count(*)::integer
  INTO current_only
  FROM public.sku_daily_metric_recompute_requests req
  JOIN public.stores store
    ON store.organization_id = req.organization_id
   AND store.id = req.store_id
  WHERE req.organization_id = '88002000-0000-4000-8000-000000000001'::uuid
    AND req.metric_date =
      (pg_catalog.timezone(store.timezone, pg_catalog.now()))::date;

  IF stale_requests <> 0 THEN
    RAISE EXCEPTION 'historical grains must not be dirtied: %', stale_requests;
  END IF;

  IF current_only < 1 THEN
    RAISE EXCEPTION 'expected at least one current store-local grain request';
  END IF;
END;
$$;

\echo '=== PLANNING EVIDENCE BINDING V1 ADVERSARIAL PASS ==='

ROLLBACK;
