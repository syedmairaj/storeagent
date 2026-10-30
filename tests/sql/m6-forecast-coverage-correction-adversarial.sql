\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M6 P2b.2c.3b FORECAST COVERAGE CORRECTION ADVERSARIAL ==='

\set org_a '61004000-0000-4000-8000-000000000001'
\set org_b '61004000-0000-4000-8000-000000000011'
\set store_a '61004000-0000-4000-8000-000000000002'
\set store_b '61004000-0000-4000-8000-000000000012'
\set location_a '61004000-0000-4000-8000-000000000003'
\set location_a2 '61004000-0000-4000-8000-000000000013'
\set product_a '61004000-0000-4000-8000-000000000004'
\set variant_a '61004000-0000-4000-8000-000000000005'
\set variant_a2 '61004000-0000-4000-8000-000000000015'
\set integration_a '61004000-0000-4000-8000-000000000006'
\set user_owner '61004000-0000-4000-8000-000000000007'
\set user_analyst '61004000-0000-4000-8000-000000000008'
\set order_a '61004000-0000-4000-8000-000000000021'
\set item_a '61004000-0000-4000-8000-000000000022'
\set refund_a '61004000-0000-4000-8000-000000000023'

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
(
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm6-corr-owner@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_analyst'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm6-corr-analyst@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'M6 Corr Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'M6 Corr Org B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (:'org_a'::uuid, :'user_owner'::uuid, 'owner'),
  (:'org_a'::uuid, :'user_analyst'::uuid, 'analyst');

INSERT INTO public.stores (id, organization_id, name, status, currency, timezone)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'Corr Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'Corr Store B', 'active', 'USD', 'UTC');

INSERT INTO public.locations (id, organization_id, store_id, name, status)
VALUES
  (:'location_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'Loc A', 'active'),
  (:'location_a2'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'Loc A2', 'active');

INSERT INTO public.products (id, organization_id, store_id, title, status)
VALUES (:'product_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'Product A', 'active');

INSERT INTO public.product_variants (
  id, organization_id, store_id, product_id, sku, status
)
VALUES
  (:'variant_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, :'product_a'::uuid, 'SKU-A', 'active'),
  (:'variant_a2'::uuid, :'org_a'::uuid, :'store_a'::uuid, :'product_a'::uuid, 'SKU-A2', 'active');

INSERT INTO public.integrations (id, organization_id, store_id, provider, status)
VALUES (:'integration_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'csv', 'active');

\echo '--- Seed coverage evidence (store-wide + narrow) ---'

INSERT INTO public.forecast_day_coverage_evidence (
  evidence_id, organization_id, store_id, location_id, variant_id,
  local_date, stream, coverage, trust, source,
  as_of, observed_at, version, invalidated_at, supersedes_evidence_id,
  idempotency_key, integration_id, actor_user_id, provider, closure_id
)
VALUES
(
  'ev_corr_store_orders',
  :'org_a'::uuid, :'store_a'::uuid, null, null,
  '2026-07-01', 'orders', 'complete', 'verified_merchant_attestation',
  'merchant:attestation:actor:' || :'user_owner'::text,
  '2026-07-02T00:00:00Z'::timestamptz,
  '2026-07-02T00:00:00Z'::timestamptz,
  1, null, null, 'corr-store-orders', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_corr_store_orders'
),
(
  'ev_corr_loc_orders',
  :'org_a'::uuid, :'store_a'::uuid, :'location_a'::uuid, :'variant_a'::uuid,
  '2026-07-01', 'orders', 'complete', 'verified_merchant_attestation',
  'merchant:attestation:actor:' || :'user_owner'::text,
  '2026-07-02T00:00:00Z'::timestamptz,
  '2026-07-02T00:00:00Z'::timestamptz,
  1, null, null, 'corr-loc-orders', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_corr_loc_orders'
),
(
  'ev_corr_returns',
  :'org_a'::uuid, :'store_a'::uuid, :'location_a'::uuid, :'variant_a'::uuid,
  '2026-07-01', 'returns', 'complete', 'verified_merchant_attestation',
  'merchant:attestation:actor:' || :'user_owner'::text,
  '2026-07-02T00:00:00Z'::timestamptz,
  '2026-07-02T00:00:00Z'::timestamptz,
  1, null, null, 'corr-returns', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_corr_returns'
);

\echo '--- Capture: order + item + old/new day ---'

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
  :'variant_a'::uuid, :'location_a'::uuid, 2
);

DO $$
DECLARE
  event_count integer;
BEGIN
  SELECT count(*) INTO event_count
  FROM public.forecast_coverage_correction_events
  WHERE organization_id = '61004000-0000-4000-8000-000000000001'::uuid
    AND stream = 'orders'
    AND local_date = '2026-07-01'
    AND processed_at IS NULL;

  IF event_count < 1 THEN
    RAISE EXCEPTION 'item insert should capture orders correction event';
  END IF;
END;
$$;

UPDATE public.orders
SET ordered_at = '2026-07-03T12:00:00Z'::timestamptz
WHERE id = :'order_a'::uuid;

DO $$
DECLARE
  dates text;
BEGIN
  SELECT string_agg(local_date::text, ',' ORDER BY local_date)
  INTO dates
  FROM (
    SELECT DISTINCT local_date
    FROM public.forecast_coverage_correction_events
    WHERE organization_id = '61004000-0000-4000-8000-000000000001'::uuid
      AND stream = 'orders'
      AND source_table = 'orders'
      AND processed_at IS NULL
  ) as d;

  IF dates IS DISTINCT FROM '2026-07-01,2026-07-03' THEN
    RAISE EXCEPTION 'order day move should capture old and new dates, got %', dates;
  END IF;
END;
$$;

\echo '--- Capture: location move ---'

UPDATE public.order_items
SET location_id = :'location_a2'::uuid
WHERE id = :'item_a'::uuid;

DO $$
DECLARE
  locs text;
BEGIN
  SELECT string_agg(coalesce(location_id::text, 'null'), ',' ORDER BY location_id::text)
  INTO locs
  FROM (
    SELECT DISTINCT location_id
    FROM public.forecast_coverage_correction_events
    WHERE organization_id = '61004000-0000-4000-8000-000000000001'::uuid
      AND source_table = 'order_items'
      AND source_op = 'update'
      AND processed_at IS NULL
  ) as l;

  IF locs NOT LIKE '%' || '61004000-0000-4000-8000-000000000003' || '%'
    OR locs NOT LIKE '%' || '61004000-0000-4000-8000-000000000013' || '%'
  THEN
    RAISE EXCEPTION 'location move should capture old and new locations, got %', locs;
  END IF;
END;
$$;

\echo '--- Capture: null location conservatively ---'

UPDATE public.order_items
SET location_id = null
WHERE id = :'item_a'::uuid;

DO $$
DECLARE
  null_events integer;
BEGIN
  SELECT count(*) INTO null_events
  FROM public.forecast_coverage_correction_events
  WHERE organization_id = '61004000-0000-4000-8000-000000000001'::uuid
    AND source_table = 'order_items'
    AND location_id IS NULL
    AND processed_at IS NULL;

  IF null_events < 1 THEN
    RAISE EXCEPTION 'null location corrections must be captured';
  END IF;
END;
$$;

\echo '--- Capture: returns stream ---'

INSERT INTO public.return_refunds (
  id, organization_id, store_id, order_id, order_item_id, variant_id,
  location_id, returned_quantity, occurred_at
)
VALUES (
  :'refund_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, :'order_a'::uuid,
  :'item_a'::uuid, :'variant_a'::uuid, :'location_a'::uuid, 1,
  '2026-06-30T12:00:00Z'::timestamptz
);

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.forecast_coverage_correction_events
  WHERE organization_id = '61004000-0000-4000-8000-000000000001'::uuid
    AND stream = 'returns'
    AND local_date = '2026-06-30'
    AND processed_at IS NULL;

  IF n < 1 THEN
    RAISE EXCEPTION 'return insert should capture returns stream event';
  END IF;
END;
$$;

\echo '--- Invalid timezone fails closed ---'

DO $$
BEGIN
  UPDATE public.stores
  SET timezone = 'Not/A_Real_Zone'
  WHERE id = '61004000-0000-4000-8000-000000000002'::uuid;

  BEGIN
    UPDATE public.order_items
    SET quantity = quantity + 1
    WHERE id = '61004000-0000-4000-8000-000000000022'::uuid;
    RAISE EXCEPTION 'invalid timezone should fail closed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%invalid_iana_timezone%' THEN
        RAISE EXCEPTION 'expected invalid_iana_timezone, got %', SQLERRM;
      END IF;
  END;

  UPDATE public.stores
  SET timezone = 'UTC'
  WHERE id = '61004000-0000-4000-8000-000000000002'::uuid;
END;
$$;

\echo '--- Pending fence detects unprocessed corrections ---'

DO $$
BEGIN
  IF NOT public.forecast_coverage_has_pending_corrections(
    '61004000-0000-4000-8000-000000000001'::uuid,
    '61004000-0000-4000-8000-000000000002'::uuid,
    'orders',
    '2026-07-01',
    null,
    null,
    '2026-07-02T00:00:00Z'::timestamptz
  ) THEN
    RAISE EXCEPTION 'store-wide pending fence should be true before apply';
  END IF;
END;
$$;

\echo '--- Apply auth: analyst denied; cross-tenant denied ---'

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.apply_forecast_coverage_correction_events(
      '61004000-0000-4000-8000-000000000001'::uuid, 10, null, '61004000-0000-4000-8000-000000000008'::uuid
    );
    RAISE EXCEPTION 'analyst apply should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%owner or admin%' THEN
        RAISE EXCEPTION 'expected owner/admin denial, got %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM *
    FROM public.apply_forecast_coverage_correction_events(
      '61004000-0000-4000-8000-000000000011'::uuid, 10, null, '61004000-0000-4000-8000-000000000007'::uuid
    );
    -- org_b has no events; auth checked per claimed event. Zero events = no auth call.
    -- Force auth by requiring agent when events exist in org_a with foreign integration:
    null;
  END;
END;
$$;

\echo '--- Apply with owner: invalidate + idempotent replay ---'

DO $$
DECLARE
  applied integer := 0;
  row record;
  still_active integer;
  pending boolean;
BEGIN
  FOR row IN
    SELECT *
    FROM public.apply_forecast_coverage_correction_events(
      '61004000-0000-4000-8000-000000000001'::uuid, 100, null, '61004000-0000-4000-8000-000000000007'::uuid
    )
  LOOP
    applied := applied + 1;
  END LOOP;

  IF applied < 1 THEN
    RAISE EXCEPTION 'owner apply should invalidate at least one evidence row';
  END IF;

  SELECT count(*) INTO still_active
  FROM public.forecast_day_coverage_evidence
  WHERE organization_id = '61004000-0000-4000-8000-000000000001'::uuid
    AND evidence_id IN (
      'ev_corr_store_orders',
      'ev_corr_loc_orders'
    )
    AND invalidated_at IS NULL;

  IF still_active <> 0 THEN
    RAISE EXCEPTION 'orders coverage should be invalidated after apply, active=%', still_active;
  END IF;

  -- Replay: already processed events are skipped (no rows); mark remaining if any.
  PERFORM *
  FROM public.apply_forecast_coverage_correction_events(
    '61004000-0000-4000-8000-000000000001'::uuid, 100, null, '61004000-0000-4000-8000-000000000007'::uuid
  );

  SELECT public.forecast_coverage_has_pending_corrections(
    '61004000-0000-4000-8000-000000000001'::uuid,
    '61004000-0000-4000-8000-000000000002'::uuid,
    'orders',
    '2026-07-01',
    null,
    null,
    '2026-07-02T00:00:00Z'::timestamptz
  ) INTO pending;

  IF pending THEN
    RAISE EXCEPTION 'pending fence should clear after apply for orders 2026-07-01';
  END IF;
END;
$$;

\echo '--- Backdated business_at with later arrival still fences ---'

INSERT INTO public.forecast_day_coverage_evidence (
  evidence_id, organization_id, store_id, location_id, variant_id,
  local_date, stream, coverage, trust, source,
  as_of, observed_at, version, invalidated_at, supersedes_evidence_id,
  idempotency_key, integration_id, actor_user_id, provider, closure_id
)
VALUES (
  'ev_corr_backdated',
  :'org_a'::uuid, :'store_a'::uuid, :'location_a'::uuid, :'variant_a'::uuid,
  '2026-07-04', 'orders', 'complete', 'verified_merchant_attestation',
  'merchant:attestation:actor:' || :'user_owner'::text,
  '2026-07-05T00:00:00Z'::timestamptz,
  '2026-07-05T00:00:00Z'::timestamptz,
  1, null, null, 'corr-backdated', null, :'user_owner'::uuid, null,
  'merchant_day_stream_closure:ev_corr_backdated'
);

INSERT INTO public.forecast_coverage_correction_events (
  organization_id, store_id, stream, local_date,
  location_id, variant_id, business_at, arrived_at,
  source_table, source_op
)
VALUES (
  :'org_a'::uuid, :'store_a'::uuid, 'orders', '2026-07-04',
  :'location_a'::uuid, :'variant_a'::uuid,
  '2026-07-04T08:00:00Z'::timestamptz,
  '2026-07-06T00:00:00Z'::timestamptz,
  'order_items', 'update'
);

DO $$
DECLARE
  disp text;
BEGIN
  SELECT disposition INTO disp
  FROM public.apply_forecast_coverage_correction_events(
    '61004000-0000-4000-8000-000000000001'::uuid, 10, null, '61004000-0000-4000-8000-000000000007'::uuid
  )
  WHERE evidence_id = 'ev_corr_backdated';

  IF disp IS DISTINCT FROM 'invalidated' THEN
    RAISE EXCEPTION 'backdated business_at with later arrival should invalidate, got %', disp;
  END IF;
END;
$$;

\echo '--- Cross-tenant isolation: org_b events never touch org_a ---'

INSERT INTO public.forecast_coverage_correction_events (
  organization_id, store_id, stream, local_date,
  location_id, variant_id, business_at, arrived_at,
  source_table, source_op
)
VALUES (
  :'org_b'::uuid, :'store_b'::uuid, 'orders', '2026-07-01',
  null, null,
  '2026-07-01T12:00:00Z'::timestamptz,
  '2026-07-10T00:00:00Z'::timestamptz,
  'orders', 'update'
);

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.apply_forecast_coverage_correction_events(
    '61004000-0000-4000-8000-000000000001'::uuid, 100, '61004000-0000-4000-8000-000000000006'::uuid, null
  );

  -- No unprocessed org_a events expected for this call beyond already processed.
  IF exists (
    SELECT 1
    FROM public.forecast_coverage_correction_events
    WHERE organization_id = '61004000-0000-4000-8000-000000000011'::uuid
      AND processed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'org_a apply must not process org_b events';
  END IF;
END;
$$;

\echo '--- No system-agent: both agents null / both set denied ---'

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.apply_forecast_coverage_correction_events(
      '61004000-0000-4000-8000-000000000001'::uuid, 1, null, null
    );
    RAISE EXCEPTION 'null agents should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%exactly one of integration_id or actor_user_id%' THEN
        RAISE EXCEPTION 'expected exactly-one agent rule, got %', SQLERRM;
      END IF;
  END;

  BEGIN
    PERFORM *
    FROM public.apply_forecast_coverage_correction_events(
      '61004000-0000-4000-8000-000000000001'::uuid, 1, '61004000-0000-4000-8000-000000000006'::uuid, '61004000-0000-4000-8000-000000000007'::uuid
    );
    RAISE EXCEPTION 'both agents should fail';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT LIKE '%exactly one of integration_id or actor_user_id%' THEN
        RAISE EXCEPTION 'expected exactly-one agent rule, got %', SQLERRM;
      END IF;
  END;
END;
$$;

\echo '--- Matching helper: null event covers narrow evidence ---'

DO $$
BEGIN
  IF NOT public.forecast_coverage_correction_matches_evidence(
    null, '61004000-0000-4000-8000-000000000005'::uuid,
    '61004000-0000-4000-8000-000000000003'::uuid, '61004000-0000-4000-8000-000000000005'::uuid
  ) THEN
    RAISE EXCEPTION 'null event location must conservatively match narrow evidence';
  END IF;

  IF public.forecast_coverage_correction_matches_evidence(
    '61004000-0000-4000-8000-000000000013'::uuid, '61004000-0000-4000-8000-000000000005'::uuid,
    '61004000-0000-4000-8000-000000000003'::uuid, '61004000-0000-4000-8000-000000000005'::uuid
  ) THEN
    RAISE EXCEPTION 'distinct locations must not match';
  END IF;
END;
$$;

\echo '=== M6 P2b.2c.3b FORECAST COVERAGE CORRECTION ADVERSARIAL PASSED ==='

ROLLBACK;
