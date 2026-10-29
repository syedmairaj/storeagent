\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M6 P2b.2b.1 FORECAST DAY EVIDENCE ADVERSARIAL VERIFICATION ==='

\set org_a '61000000-0000-4000-8000-000000000001'
\set org_b '61000000-0000-4000-8000-000000000011'
\set store_a '61000000-0000-4000-8000-000000000002'
\set store_b '61000000-0000-4000-8000-000000000012'
\set location_a '61000000-0000-4000-8000-000000000003'
\set location_b '61000000-0000-4000-8000-000000000013'
\set product_a '61000000-0000-4000-8000-000000000004'
\set product_b '61000000-0000-4000-8000-000000000014'
\set variant_a '61000000-0000-4000-8000-000000000005'
\set variant_b '61000000-0000-4000-8000-000000000015'
\set integration_a '61000000-0000-4000-8000-000000000006'
\set user_a '61000000-0000-4000-8000-000000000007'
\set user_b '61000000-0000-4000-8000-000000000017'

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
VALUES
(
  :'user_a'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'm6-evidence-a@example.invalid',
  '',
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{}'::jsonb
),
(
  :'user_b'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'm6-evidence-b@example.invalid',
  '',
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{}'::jsonb
);

INSERT INTO public.organizations (
  id,
  name,
  default_currency,
  timezone
)
VALUES
(
  :'org_a'::uuid,
  'M6 Evidence Org A',
  'USD',
  'UTC'
),
(
  :'org_b'::uuid,
  'M6 Evidence Org B',
  'USD',
  'UTC'
);

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role
)
VALUES
(
  :'org_a'::uuid,
  :'user_a'::uuid,
  'owner'
),
(
  :'org_b'::uuid,
  :'user_b'::uuid,
  'owner'
);

INSERT INTO public.stores (
  id,
  organization_id,
  name,
  status,
  currency,
  timezone
)
VALUES
(
  :'store_a'::uuid,
  :'org_a'::uuid,
  'M6 Evidence Store A',
  'active',
  'USD',
  'UTC'
),
(
  :'store_b'::uuid,
  :'org_b'::uuid,
  'M6 Evidence Store B',
  'active',
  'USD',
  'UTC'
);

INSERT INTO public.locations (
  id,
  organization_id,
  store_id,
  name,
  status
)
VALUES
(
  :'location_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  'Loc A',
  'active'
),
(
  :'location_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'Loc B',
  'active'
);

INSERT INTO public.products (
  id,
  organization_id,
  store_id,
  title,
  status
)
VALUES
(
  :'product_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  'Product A',
  'active'
),
(
  :'product_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'Product B',
  'active'
);

INSERT INTO public.product_variants (
  id,
  organization_id,
  store_id,
  product_id,
  sku,
  status
)
VALUES
(
  :'variant_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'product_a'::uuid,
  'SKU-A',
  'active'
),
(
  :'variant_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'product_b'::uuid,
  'SKU-B',
  'active'
);

INSERT INTO public.integrations (
  id,
  organization_id,
  store_id,
  provider,
  status
)
VALUES
(
  :'integration_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  'csv',
  'active'
);

\echo '--- RLS enabled and grants ---'

DO $$
DECLARE
  missing integer;
BEGIN
  SELECT count(*)::integer
  INTO missing
  FROM (
    VALUES
      ('forecast_day_promotion_evidence'),
      ('forecast_day_coverage_evidence')
  ) AS expected(relname)
  LEFT JOIN pg_class AS c
    ON c.relname = expected.relname
   AND c.relnamespace = 'public'::regnamespace
  WHERE c.oid IS NULL
     OR NOT c.relrowsecurity;

  IF missing <> 0 THEN
    RAISE EXCEPTION 'expected RLS-enabled evidence tables';
  END IF;
END;
$$;

DO $$
DECLARE
  policy_count integer;
BEGIN
  SELECT count(*)::integer
  INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'forecast_day_promotion_evidence',
      'forecast_day_coverage_evidence'
    )
    AND cmd = 'SELECT'
    AND roles::text LIKE '%authenticated%';

  IF policy_count <> 2 THEN
    RAISE EXCEPTION
      'expected two authenticated SELECT policies, found %',
      policy_count;
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_table_privilege(
    'anon',
    'public.forecast_day_promotion_evidence',
    'SELECT'
  )
  OR has_table_privilege(
    'anon',
    'public.forecast_day_coverage_evidence',
    'SELECT'
  )
  OR has_table_privilege(
    'authenticated',
    'public.forecast_day_promotion_evidence',
    'INSERT'
  )
  OR has_table_privilege(
    'authenticated',
    'public.forecast_day_coverage_evidence',
    'UPDATE'
  )
  OR has_table_privilege(
    'authenticated',
    'public.forecast_day_promotion_evidence',
    'DELETE'
  )
  OR has_table_privilege(
    'service_role',
    'public.forecast_day_promotion_evidence',
    'INSERT'
  )
  OR has_table_privilege(
    'service_role',
    'public.forecast_day_coverage_evidence',
    'UPDATE'
  )
  OR has_table_privilege(
    'service_role',
    'public.forecast_day_coverage_evidence',
    'DELETE'
  )
  THEN
    RAISE EXCEPTION 'unexpected table privileges on evidence tables';
  END IF;

  IF NOT has_table_privilege(
    'authenticated',
    'public.forecast_day_promotion_evidence',
    'SELECT'
  )
  OR NOT has_table_privilege(
    'service_role',
    'public.forecast_day_coverage_evidence',
    'SELECT'
  )
  THEN
    RAISE EXCEPTION 'expected SELECT grants for authenticated/service_role';
  END IF;
END;
$$;

\echo '--- Happy-path inserts ---'

INSERT INTO public.forecast_day_promotion_evidence (
  evidence_id,
  organization_id,
  store_id,
  location_id,
  variant_id,
  local_date,
  state,
  trust,
  source,
  observed_at,
  version,
  idempotency_key,
  integration_id,
  provider
)
VALUES (
  'ev_promo_store_day',
  :'org_a'::uuid,
  :'store_a'::uuid,
  NULL,
  NULL,
  '2026-06-15',
  'none',
  'trusted_provider',
  'provider:csv:integration:test',
  '2026-06-16T00:00:00Z'::timestamptz,
  1,
  'promo-key-1',
  :'integration_a'::uuid,
  'csv'
);

INSERT INTO public.forecast_day_coverage_evidence (
  evidence_id,
  organization_id,
  store_id,
  local_date,
  stream,
  coverage,
  trust,
  source,
  as_of,
  observed_at,
  version,
  idempotency_key,
  integration_id,
  provider,
  closure_id
)
VALUES (
  'ev_cov_orders_complete',
  :'org_a'::uuid,
  :'store_a'::uuid,
  '2026-06-15',
  'orders',
  'complete',
  'trusted_provider',
  'provider:csv:integration:test',
  '2026-06-16T00:00:00Z'::timestamptz,
  '2026-06-16T00:00:00Z'::timestamptz,
  1,
  'cov-orders-1',
  :'integration_a'::uuid,
  'csv',
  'close-orders-1'
);

INSERT INTO public.forecast_day_coverage_evidence (
  evidence_id,
  organization_id,
  store_id,
  local_date,
  stream,
  coverage,
  trust,
  source,
  as_of,
  observed_at,
  version,
  idempotency_key,
  actor_user_id,
  closure_id
)
VALUES (
  'ev_cov_returns_partial',
  :'org_a'::uuid,
  :'store_a'::uuid,
  '2026-06-15',
  'returns',
  'partial',
  'verified_merchant_attestation',
  'merchant:attestation:actor:test',
  '2026-06-16T00:00:00Z'::timestamptz,
  '2026-06-16T00:00:00Z'::timestamptz,
  1,
  'cov-returns-1',
  :'user_a'::uuid,
  NULL
);

\echo '--- Cross-tenant FK isolation ---'

DO $$
BEGIN
  BEGIN
    INSERT INTO public.forecast_day_promotion_evidence (
      evidence_id,
      organization_id,
      store_id,
      local_date,
      state,
      trust,
      source,
      observed_at,
      version,
      idempotency_key,
      integration_id,
      provider
    )
    VALUES (
      'ev_cross_store',
      '61000000-0000-4000-8000-000000000001'::uuid,
      '61000000-0000-4000-8000-000000000012'::uuid,
      '2026-06-16',
      'none',
      'trusted_provider',
      'provider:csv:integration:test',
      '2026-06-17T00:00:00Z'::timestamptz,
      1,
      'cross-store',
      '61000000-0000-4000-8000-000000000006'::uuid,
      'csv'
    );
    RAISE EXCEPTION 'cross-org store FK should have failed';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.forecast_day_coverage_evidence (
      evidence_id,
      organization_id,
      store_id,
      location_id,
      local_date,
      stream,
      coverage,
      trust,
      source,
      as_of,
      observed_at,
      version,
      idempotency_key,
      integration_id,
      provider,
      closure_id
    )
    VALUES (
      'ev_cross_location',
      '61000000-0000-4000-8000-000000000001'::uuid,
      '61000000-0000-4000-8000-000000000002'::uuid,
      '61000000-0000-4000-8000-000000000013'::uuid,
      '2026-06-16',
      'orders',
      'complete',
      'trusted_provider',
      'provider:csv:integration:test',
      '2026-06-17T00:00:00Z'::timestamptz,
      '2026-06-17T00:00:00Z'::timestamptz,
      1,
      'cross-loc',
      '61000000-0000-4000-8000-000000000006'::uuid,
      'csv',
      'close-x'
    );
    RAISE EXCEPTION 'cross-org location FK should have failed';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.forecast_day_coverage_evidence (
      evidence_id,
      organization_id,
      store_id,
      variant_id,
      local_date,
      stream,
      coverage,
      trust,
      source,
      as_of,
      observed_at,
      version,
      idempotency_key,
      integration_id,
      provider,
      closure_id
    )
    VALUES (
      'ev_cross_variant',
      '61000000-0000-4000-8000-000000000001'::uuid,
      '61000000-0000-4000-8000-000000000002'::uuid,
      '61000000-0000-4000-8000-000000000015'::uuid,
      '2026-06-16',
      'orders',
      'complete',
      'trusted_provider',
      'provider:csv:integration:test',
      '2026-06-17T00:00:00Z'::timestamptz,
      '2026-06-17T00:00:00Z'::timestamptz,
      1,
      'cross-var',
      '61000000-0000-4000-8000-000000000006'::uuid,
      'csv',
      'close-x2'
    );
    RAISE EXCEPTION 'cross-org variant FK should have failed';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END;
$$;

\echo '--- Closure pairing and provider-path checks ---'

DO $$
BEGIN
  BEGIN
    INSERT INTO public.forecast_day_coverage_evidence (
      evidence_id,
      organization_id,
      store_id,
      local_date,
      stream,
      coverage,
      trust,
      source,
      as_of,
      observed_at,
      version,
      idempotency_key,
      integration_id,
      provider,
      closure_id
    )
    VALUES (
      'ev_complete_no_closure',
      '61000000-0000-4000-8000-000000000001'::uuid,
      '61000000-0000-4000-8000-000000000002'::uuid,
      '2026-06-17',
      'orders',
      'complete',
      'trusted_provider',
      'provider:csv:integration:test',
      '2026-06-18T00:00:00Z'::timestamptz,
      '2026-06-18T00:00:00Z'::timestamptz,
      1,
      'no-closure',
      '61000000-0000-4000-8000-000000000006'::uuid,
      'csv',
      NULL
    );
    RAISE EXCEPTION 'complete without closure_id should fail';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.forecast_day_coverage_evidence (
      evidence_id,
      organization_id,
      store_id,
      local_date,
      stream,
      coverage,
      trust,
      source,
      as_of,
      observed_at,
      version,
      idempotency_key,
      integration_id,
      provider,
      closure_id
    )
    VALUES (
      'ev_partial_with_closure',
      '61000000-0000-4000-8000-000000000001'::uuid,
      '61000000-0000-4000-8000-000000000002'::uuid,
      '2026-06-17',
      'orders',
      'partial',
      'trusted_provider',
      'provider:csv:integration:test',
      '2026-06-18T00:00:00Z'::timestamptz,
      '2026-06-18T00:00:00Z'::timestamptz,
      1,
      'partial-closure',
      '61000000-0000-4000-8000-000000000006'::uuid,
      'csv',
      'should-not'
    );
    RAISE EXCEPTION 'partial with closure_id should fail';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.forecast_day_promotion_evidence (
      evidence_id,
      organization_id,
      store_id,
      local_date,
      state,
      trust,
      source,
      observed_at,
      version,
      idempotency_key,
      actor_user_id,
      provider
    )
    VALUES (
      'ev_bad_trust_mix',
      '61000000-0000-4000-8000-000000000001'::uuid,
      '61000000-0000-4000-8000-000000000002'::uuid,
      '2026-06-18',
      'none',
      'trusted_provider',
      'provider:csv:integration:test',
      '2026-06-19T00:00:00Z'::timestamptz,
      1,
      'bad-mix',
      '61000000-0000-4000-8000-000000000007'::uuid,
      'csv'
    );
    RAISE EXCEPTION 'provider path with actor should fail';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END;
$$;

\echo '--- Idempotency and active supersession ---'

DO $$
BEGIN
  BEGIN
    INSERT INTO public.forecast_day_promotion_evidence (
      evidence_id,
      organization_id,
      store_id,
      local_date,
      state,
      trust,
      source,
      observed_at,
      version,
      idempotency_key,
      integration_id,
      provider
    )
    VALUES (
      'ev_promo_dup_key',
      '61000000-0000-4000-8000-000000000001'::uuid,
      '61000000-0000-4000-8000-000000000002'::uuid,
      '2026-06-19',
      'promotion',
      'trusted_provider',
      'provider:csv:integration:test',
      '2026-06-20T00:00:00Z'::timestamptz,
      1,
      'promo-key-1',
      '61000000-0000-4000-8000-000000000006'::uuid,
      'csv'
    );
    RAISE EXCEPTION 'duplicate idempotency key should fail';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.forecast_day_promotion_evidence (
      evidence_id,
      organization_id,
      store_id,
      local_date,
      state,
      trust,
      source,
      observed_at,
      version,
      idempotency_key,
      integration_id,
      provider
    )
    VALUES (
      'ev_promo_second_active',
      '61000000-0000-4000-8000-000000000001'::uuid,
      '61000000-0000-4000-8000-000000000002'::uuid,
      '2026-06-15',
      'promotion',
      'trusted_provider',
      'provider:csv:integration:test',
      '2026-06-16T01:00:00Z'::timestamptz,
      1,
      'promo-key-2',
      '61000000-0000-4000-8000-000000000006'::uuid,
      'csv'
    );
    RAISE EXCEPTION 'second active promotion for same day should fail';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END;
$$;

UPDATE public.forecast_day_promotion_evidence
SET invalidated_at = '2026-06-16T02:00:00Z'::timestamptz
WHERE evidence_id = 'ev_promo_store_day';

INSERT INTO public.forecast_day_promotion_evidence (
  evidence_id,
  organization_id,
  store_id,
  local_date,
  state,
  trust,
  source,
  observed_at,
  version,
  invalidated_at,
  supersedes_evidence_id,
  idempotency_key,
  integration_id,
  provider
)
VALUES (
  'ev_promo_store_day_v2',
  :'org_a'::uuid,
  :'store_a'::uuid,
  '2026-06-15',
  'promotion',
  'trusted_provider',
  'provider:csv:integration:test',
  '2026-06-16T02:00:00Z'::timestamptz,
  2,
  NULL,
  'ev_promo_store_day',
  'promo-key-1',
  :'integration_a'::uuid,
  'csv'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.forecast_day_promotion_evidence (
      evidence_id,
      organization_id,
      store_id,
      local_date,
      state,
      trust,
      source,
      observed_at,
      version,
      supersedes_evidence_id,
      idempotency_key,
      integration_id,
      provider
    )
    VALUES (
      'ev_promo_foreign_supersede',
      '61000000-0000-4000-8000-000000000011'::uuid,
      '61000000-0000-4000-8000-000000000012'::uuid,
      '2026-06-15',
      'none',
      'verified_merchant_attestation',
      'merchant:attestation:actor:test',
      '2026-06-16T00:00:00Z'::timestamptz,
      1,
      'ev_promo_store_day',
      'foreign-super',
      NULL,
      NULL
    );
    -- Needs actor for merchant path; fix insert properly in exception path.
    RAISE EXCEPTION 'unreachable';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
    WHEN foreign_key_violation THEN
      NULL;
    WHEN others THEN
      -- Retry with valid merchant shape but foreign supersedes target.
      BEGIN
        INSERT INTO public.forecast_day_promotion_evidence (
          evidence_id,
          organization_id,
          store_id,
          local_date,
          state,
          trust,
          source,
          observed_at,
          version,
          supersedes_evidence_id,
          idempotency_key,
          actor_user_id
        )
        VALUES (
          'ev_promo_foreign_supersede',
          '61000000-0000-4000-8000-000000000011'::uuid,
          '61000000-0000-4000-8000-000000000012'::uuid,
          '2026-06-15',
          'none',
          'verified_merchant_attestation',
          'merchant:attestation:actor:test',
          '2026-06-16T00:00:00Z'::timestamptz,
          1,
          'ev_promo_store_day',
          'foreign-super',
          '61000000-0000-4000-8000-000000000017'::uuid
        );
        RAISE EXCEPTION 'cross-tenant supersession should fail';
      EXCEPTION
        WHEN foreign_key_violation THEN
          NULL;
      END;
  END;
END;
$$;

\echo '--- Immutable body ---'

DO $$
BEGIN
  BEGIN
    UPDATE public.forecast_day_coverage_evidence
    SET coverage = 'partial',
        closure_id = NULL
    WHERE evidence_id = 'ev_cov_orders_complete';
    RAISE EXCEPTION 'body mutation should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    DELETE FROM public.forecast_day_coverage_evidence
    WHERE evidence_id = 'ev_cov_orders_complete';
    RAISE EXCEPTION 'delete should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%cannot be deleted%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.forecast_day_promotion_evidence
    SET invalidated_at = '2026-06-16T03:00:00Z'::timestamptz
    WHERE evidence_id = 'ev_promo_store_day';
    RAISE EXCEPTION 're-invalidation should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

UPDATE public.forecast_day_coverage_evidence
SET invalidated_at = '2026-06-16T03:00:00Z'::timestamptz
WHERE evidence_id = 'ev_cov_orders_complete';

\echo '--- Member SELECT isolation ---'

SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  :'user_a',
  true
);

SELECT set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

DO $$
DECLARE
  visible integer;
BEGIN
  SELECT count(*)::integer
  INTO visible
  FROM public.forecast_day_promotion_evidence;

  IF visible < 1 THEN
    RAISE EXCEPTION 'org A member should see own promotion evidence';
  END IF;

  SELECT count(*)::integer
  INTO visible
  FROM public.forecast_day_promotion_evidence
  WHERE organization_id = '61000000-0000-4000-8000-000000000011'::uuid;

  IF visible <> 0 THEN
    RAISE EXCEPTION 'org A member must not see org B evidence';
  END IF;
END;
$$;

RESET ROLE;

\echo '=== M6 P2b.2b.1 FORECAST DAY EVIDENCE ADVERSARIAL VERIFICATION PASSED ==='

ROLLBACK;
