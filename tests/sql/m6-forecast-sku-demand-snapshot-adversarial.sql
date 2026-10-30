\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M6 P2c.1 FORECAST SKU DEMAND SNAPSHOT ADVERSARIAL ==='

\set org_a '61005000-0000-4000-8000-000000000001'
\set org_b '61005000-0000-4000-8000-000000000011'
\set store_a '61005000-0000-4000-8000-000000000002'
\set store_b '61005000-0000-4000-8000-000000000012'
\set location_a '61005000-0000-4000-8000-000000000003'
\set location_a2 '61005000-0000-4000-8000-000000000013'
\set location_b '61005000-0000-4000-8000-000000000023'
\set product_a '61005000-0000-4000-8000-000000000004'
\set product_b '61005000-0000-4000-8000-000000000014'
\set variant_a '61005000-0000-4000-8000-000000000005'
\set variant_a2 '61005000-0000-4000-8000-000000000015'
\set variant_b '61005000-0000-4000-8000-000000000025'
\set integration_a '61005000-0000-4000-8000-000000000006'
\set user_owner '61005000-0000-4000-8000-000000000007'
\set order_a '61005000-0000-4000-8000-000000000021'
\set item_a '61005000-0000-4000-8000-000000000022'
\set refund_a '61005000-0000-4000-8000-000000000023'

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES (
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm6-snap-owner@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'M6 Snap Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'M6 Snap Org B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES (:'org_a'::uuid, :'user_owner'::uuid, 'owner');

INSERT INTO public.stores (id, organization_id, name, status, currency, timezone)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'Snap Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'Snap Store B', 'active', 'USD', 'UTC');

INSERT INTO public.locations (id, organization_id, store_id, name, status)
VALUES
  (:'location_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'Loc A', 'active'),
  (:'location_a2'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'Loc A2', 'active'),
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
  (:'variant_a2'::uuid, :'org_a'::uuid, :'store_a'::uuid, :'product_a'::uuid, 'SKU-A2', 'active'),
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

INSERT INTO public.return_refunds (
  id, organization_id, store_id, order_id, order_item_id, variant_id,
  location_id, returned_quantity, occurred_at
)
VALUES (
  :'refund_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, :'order_a'::uuid,
  :'item_a'::uuid, :'variant_a'::uuid, :'location_a'::uuid, 1,
  '2026-07-01T18:00:00Z'::timestamptz
);

INSERT INTO public.forecast_day_coverage_evidence (
  evidence_id, organization_id, store_id, location_id, variant_id,
  local_date, stream, coverage, trust, source,
  as_of, observed_at, version, invalidated_at, supersedes_evidence_id,
  idempotency_key, integration_id, actor_user_id, provider, closure_id
)
VALUES
(
  'ev_snap_orders',
  :'org_a'::uuid, :'store_a'::uuid, null, null,
  '2026-07-01', 'orders', 'complete', 'verified_merchant_attestation',
  'merchant:attestation',
  '2026-07-02T00:00:00Z'::timestamptz,
  '2026-07-02T00:00:00Z'::timestamptz,
  1, null, null, 'snap-orders', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_snap_orders'
),
(
  'ev_snap_returns',
  :'org_a'::uuid, :'store_a'::uuid, :'location_a'::uuid, :'variant_a'::uuid,
  '2026-07-01', 'returns', 'complete', 'verified_merchant_attestation',
  'merchant:attestation',
  '2026-07-02T00:00:00Z'::timestamptz,
  '2026-07-02T00:00:00Z'::timestamptz,
  1, null, null, 'snap-returns', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_snap_returns'
);

INSERT INTO public.forecast_day_promotion_evidence (
  evidence_id, organization_id, store_id, location_id, variant_id,
  local_date, state, trust, source, observed_at, version,
  invalidated_at, supersedes_evidence_id, idempotency_key,
  integration_id, actor_user_id, provider
)
VALUES (
  'ev_snap_promo',
  :'org_a'::uuid, :'store_a'::uuid, null, null,
  '2026-07-01', 'none', 'verified_merchant_attestation',
  'merchant:attestation', '2026-07-02T00:00:00Z'::timestamptz, 1,
  null, null, 'snap-promo', null, :'user_owner'::uuid, null
);

\echo '--- Grants / SECURITY DEFINER / search_path ---'

DO $$
DECLARE
  def text;
BEGIN
  IF has_function_privilege(
    'anon',
    'public.forecast_sku_demand_source_snapshot(uuid,uuid,uuid,uuid,date,integer)',
    'EXECUTE'
  )
  OR has_function_privilege(
    'authenticated',
    'public.forecast_sku_demand_source_snapshot(uuid,uuid,uuid,uuid,date,integer)',
    'EXECUTE'
  )
  OR NOT has_function_privilege(
    'service_role',
    'public.forecast_sku_demand_source_snapshot(uuid,uuid,uuid,uuid,date,integer)',
    'EXECUTE'
  )
  THEN
    RAISE EXCEPTION 'unexpected snapshot EXECUTE grants';
  END IF;

  SELECT pg_get_functiondef(
    'public.forecast_sku_demand_source_snapshot(uuid,uuid,uuid,uuid,date,integer)'::regprocedure
  ) INTO def;

  IF def !~* 'security definer'
    OR def !~* 'search_path'
    OR def !~* 'statement_timeout'
    OR def !~* '''15s'''
    OR def !~* 'lock_timeout'
    OR def !~* '''2s'''
    OR def ~* 'lock table'
    OR def ~* 'pg_advisory'
    OR def !~* 'forecast_coverage_correction_events'
    OR def ~* 'trustedCompleteDates'
  THEN
    RAISE EXCEPTION 'snapshot RPC missing required security/timeout contract';
  END IF;
END;
$$;

\echo '--- Lookback bounds and scope isolation ---'

DO $$
BEGIN
  BEGIN
    PERFORM public.forecast_sku_demand_source_snapshot(
      '61005000-0000-4000-8000-000000000001'::uuid,
      '61005000-0000-4000-8000-000000000002'::uuid,
      '61005000-0000-4000-8000-000000000003'::uuid,
      '61005000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      0
    );
    RAISE EXCEPTION 'lookback 0 should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%1 to 365%' THEN
        RAISE EXCEPTION 'unexpected lookback error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.forecast_sku_demand_source_snapshot(
      '61005000-0000-4000-8000-000000000001'::uuid,
      '61005000-0000-4000-8000-000000000002'::uuid,
      '61005000-0000-4000-8000-000000000003'::uuid,
      '61005000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      366
    );
    RAISE EXCEPTION 'lookback 366 should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%1 to 365%' THEN
        RAISE EXCEPTION 'unexpected lookback error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.forecast_sku_demand_source_snapshot(
      '61005000-0000-4000-8000-000000000001'::uuid,
      '61005000-0000-4000-8000-000000000012'::uuid,
      '61005000-0000-4000-8000-000000000003'::uuid,
      '61005000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      90
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
    PERFORM public.forecast_sku_demand_source_snapshot(
      '61005000-0000-4000-8000-000000000001'::uuid,
      '61005000-0000-4000-8000-000000000002'::uuid,
      '61005000-0000-4000-8000-000000000023'::uuid,
      '61005000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      90
    );
    RAISE EXCEPTION 'foreign location should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%scope error: location%' THEN
        RAISE EXCEPTION 'unexpected foreign location error: %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM public.forecast_sku_demand_source_snapshot(
      '61005000-0000-4000-8000-000000000001'::uuid,
      '61005000-0000-4000-8000-000000000002'::uuid,
      '61005000-0000-4000-8000-000000000003'::uuid,
      '61005000-0000-4000-8000-000000000025'::uuid,
      '2026-07-01'::date,
      90
    );
    RAISE EXCEPTION 'foreign variant should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%scope error: variant%' THEN
        RAISE EXCEPTION 'unexpected foreign variant error: %', SQLERRM;
      END IF;
  END;
END;
$$;

\echo '--- Happy path: commerce + evidence, deterministic token ---'

DO $$
DECLARE
  snap1 jsonb;
  snap2 jsonb;
BEGIN
  snap1 := public.forecast_sku_demand_source_snapshot(
    '61005000-0000-4000-8000-000000000001'::uuid,
    '61005000-0000-4000-8000-000000000002'::uuid,
    '61005000-0000-4000-8000-000000000003'::uuid,
    '61005000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );
  snap2 := public.forecast_sku_demand_source_snapshot(
    '61005000-0000-4000-8000-000000000001'::uuid,
    '61005000-0000-4000-8000-000000000002'::uuid,
    '61005000-0000-4000-8000-000000000003'::uuid,
    '61005000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );

  IF snap1->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'snapshot should succeed';
  END IF;
  IF snap1->>'timeZone' IS DISTINCT FROM 'UTC' THEN
    RAISE EXCEPTION 'timezone should be UTC';
  END IF;
  IF snap1->>'lookbackDays' IS DISTINCT FROM '90' THEN
    RAISE EXCEPTION 'default lookback should be 90';
  END IF;
  IF jsonb_array_length(snap1->'orderItems') < 1 THEN
    RAISE EXCEPTION 'order items missing';
  END IF;
  IF jsonb_array_length(snap1->'returnRefunds') < 1 THEN
    RAISE EXCEPTION 'returns missing';
  END IF;
  IF jsonb_array_length(snap1->'coverageEvidence') < 2 THEN
    RAISE EXCEPTION 'coverage evidence missing';
  END IF;
  IF jsonb_array_length(snap1->'promotionEvidence') < 1 THEN
    RAISE EXCEPTION 'promotion evidence missing';
  END IF;
  IF snap1->>'sourceToken' IS DISTINCT FROM snap2->>'sourceToken' THEN
    RAISE EXCEPTION 'sourceToken must be deterministic for identical inputs';
  END IF;
  IF snap1 ? 'trustedCompleteDates' THEN
    RAISE EXCEPTION 'trustedCompleteDates must not appear in snapshot';
  END IF;
END;
$$;

\echo '--- Pending correction stamps coverage; processed clears ---'

DO $$
DECLARE
  snap jsonb;
  pending_flag boolean;
BEGIN
  INSERT INTO public.forecast_coverage_correction_events (
    organization_id, store_id, stream, local_date,
    location_id, variant_id, business_at, arrived_at,
    source_table, source_op
  )
  VALUES (
    '61005000-0000-4000-8000-000000000001'::uuid,
    '61005000-0000-4000-8000-000000000002'::uuid,
    'orders', '2026-07-01',
    null, null,
    '2026-07-01T08:00:00Z'::timestamptz,
    '2026-07-03T00:00:00Z'::timestamptz,
    'order_items', 'update'
  );

  snap := public.forecast_sku_demand_source_snapshot(
    '61005000-0000-4000-8000-000000000001'::uuid,
    '61005000-0000-4000-8000-000000000002'::uuid,
    '61005000-0000-4000-8000-000000000003'::uuid,
    '61005000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );

  IF jsonb_array_length(snap->'pendingCorrections') < 1 THEN
    RAISE EXCEPTION 'pending corrections should be present';
  END IF;

  SELECT (elem->>'pendingCorrection')::boolean INTO pending_flag
  FROM jsonb_array_elements(snap->'coverageEvidence') as elem
  WHERE elem->>'evidenceId' = 'ev_snap_orders';

  IF pending_flag IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'store-wide orders coverage must be pendingCorrection=true';
  END IF;

  UPDATE public.forecast_coverage_correction_events
  SET processed_at = now()
  WHERE organization_id = '61005000-0000-4000-8000-000000000001'::uuid
    AND processed_at IS NULL;

  snap := public.forecast_sku_demand_source_snapshot(
    '61005000-0000-4000-8000-000000000001'::uuid,
    '61005000-0000-4000-8000-000000000002'::uuid,
    '61005000-0000-4000-8000-000000000003'::uuid,
    '61005000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );

  IF jsonb_array_length(snap->'pendingCorrections') <> 0 THEN
    RAISE EXCEPTION 'processed corrections must not appear as pending';
  END IF;

  SELECT (elem->>'pendingCorrection')::boolean INTO pending_flag
  FROM jsonb_array_elements(snap->'coverageEvidence') as elem
  WHERE elem->>'evidenceId' = 'ev_snap_orders';

  IF pending_flag IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'after process, pendingCorrection should be false';
  END IF;
END;
$$;

\echo '--- Null-scope pending + backdated business / late arrival ---'

DO $$
DECLARE
  snap jsonb;
  pending_flag boolean;
BEGIN
  INSERT INTO public.forecast_coverage_correction_events (
    organization_id, store_id, stream, local_date,
    location_id, variant_id, business_at, arrived_at,
    source_table, source_op
  )
  VALUES (
    '61005000-0000-4000-8000-000000000001'::uuid,
    '61005000-0000-4000-8000-000000000002'::uuid,
    'returns', '2026-07-01',
    null, null,
    '2026-06-30T12:00:00Z'::timestamptz,
    '2026-07-04T00:00:00Z'::timestamptz,
    'return_refunds', 'insert'
  );

  snap := public.forecast_sku_demand_source_snapshot(
    '61005000-0000-4000-8000-000000000001'::uuid,
    '61005000-0000-4000-8000-000000000002'::uuid,
    '61005000-0000-4000-8000-000000000003'::uuid,
    '61005000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );

  SELECT (elem->>'pendingCorrection')::boolean INTO pending_flag
  FROM jsonb_array_elements(snap->'coverageEvidence') as elem
  WHERE elem->>'evidenceId' = 'ev_snap_returns';

  IF pending_flag IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'null-scope late arrival must fence narrow returns coverage';
  END IF;
END;
$$;

\echo '--- Invalid timezone fails closed ---'

DO $$
BEGIN
  UPDATE public.stores
  SET timezone = 'Not/A_Real_Zone'
  WHERE id = '61005000-0000-4000-8000-000000000002'::uuid;

  BEGIN
    PERFORM public.forecast_sku_demand_source_snapshot(
      '61005000-0000-4000-8000-000000000001'::uuid,
      '61005000-0000-4000-8000-000000000002'::uuid,
      '61005000-0000-4000-8000-000000000003'::uuid,
      '61005000-0000-4000-8000-000000000005'::uuid,
      '2026-07-01'::date,
      90
    );
    RAISE EXCEPTION 'invalid timezone should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%invalid_iana_timezone%' THEN
        RAISE EXCEPTION 'expected invalid_iana_timezone, got %', SQLERRM;
      END IF;
  END;

  UPDATE public.stores
  SET timezone = 'UTC'
  WHERE id = '61005000-0000-4000-8000-000000000002'::uuid;
END;
$$;

\echo '--- Cross-org commerce exclusion ---'

DO $$
DECLARE
  snap jsonb;
BEGIN
  INSERT INTO public.orders (
    id, organization_id, store_id, status, ordered_at, currency, source
  )
  VALUES (
    '61005000-0000-4000-8000-000000000091'::uuid,
    '61005000-0000-4000-8000-000000000011'::uuid,
    '61005000-0000-4000-8000-000000000012'::uuid,
    'completed', '2026-07-01T12:00:00Z'::timestamptz, 'USD', 'csv'
  );

  INSERT INTO public.order_items (
    id, organization_id, store_id, order_id, variant_id, location_id, quantity
  )
  VALUES (
    '61005000-0000-4000-8000-000000000092'::uuid,
    '61005000-0000-4000-8000-000000000011'::uuid,
    '61005000-0000-4000-8000-000000000012'::uuid,
    '61005000-0000-4000-8000-000000000091'::uuid,
    '61005000-0000-4000-8000-000000000025'::uuid,
    '61005000-0000-4000-8000-000000000023'::uuid,
    9
  );

  snap := public.forecast_sku_demand_source_snapshot(
    '61005000-0000-4000-8000-000000000001'::uuid,
    '61005000-0000-4000-8000-000000000002'::uuid,
    '61005000-0000-4000-8000-000000000003'::uuid,
    '61005000-0000-4000-8000-000000000005'::uuid,
    '2026-07-01'::date,
    90
  );

  IF snap::text LIKE '%61005000-0000-4000-8000-000000000091%' THEN
    RAISE EXCEPTION 'foreign org order leaked into snapshot';
  END IF;
END;
$$;

\echo '--- Multi-session concurrency proofs live in ---'
\echo '--- tests/unit/m6-forecast-sku-demand-snapshot-concurrency.live.test.ts ---'

\echo '=== M6 P2c.1 FORECAST SKU DEMAND SNAPSHOT ADVERSARIAL PASSED ==='

ROLLBACK;
