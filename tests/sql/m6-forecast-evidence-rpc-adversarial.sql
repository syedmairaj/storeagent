\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M6 P2b.2b.2 FORECAST EVIDENCE RPC ADVERSARIAL VERIFICATION ==='

\set org_a '61001000-0000-4000-8000-000000000001'
\set org_b '61001000-0000-4000-8000-000000000011'
\set store_a '61001000-0000-4000-8000-000000000002'
\set store_b '61001000-0000-4000-8000-000000000012'
\set integration_a '61001000-0000-4000-8000-000000000006'
\set user_owner '61001000-0000-4000-8000-000000000007'
\set user_analyst '61001000-0000-4000-8000-000000000008'
\set user_b '61001000-0000-4000-8000-000000000017'

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
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'm6-rpc-owner@example.invalid',
  '',
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{}'::jsonb
),
(
  :'user_analyst'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'm6-rpc-analyst@example.invalid',
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
  'm6-rpc-b@example.invalid',
  '',
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'M6 RPC Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'M6 RPC Org B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (:'org_a'::uuid, :'user_owner'::uuid, 'owner'),
  (:'org_a'::uuid, :'user_analyst'::uuid, 'analyst'),
  (:'org_b'::uuid, :'user_b'::uuid, 'owner');

INSERT INTO public.stores (
  id, organization_id, name, status, currency, timezone
)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'Store B', 'active', 'USD', 'UTC');

INSERT INTO public.integrations (
  id, organization_id, store_id, provider, status
)
VALUES
  (:'integration_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'csv', 'active');

\echo '--- EXECUTE grants ---'

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.issue_trusted_provider_promotion_evidence(uuid,uuid,uuid,date,text,timestamptz,text,uuid,uuid,integer,text)',
    'EXECUTE'
  )
  OR has_function_privilege(
    'authenticated',
    'public.issue_merchant_attestation_coverage_evidence(uuid,uuid,uuid,date,text,text,timestamptz,timestamptz,text,boolean,uuid,uuid,integer,text)',
    'EXECUTE'
  )
  OR NOT has_function_privilege(
    'service_role',
    'public.invalidate_forecast_day_coverage_evidence(uuid,text,timestamptz,timestamptz,uuid,uuid)',
    'EXECUTE'
  )
  THEN
    RAISE EXCEPTION 'unexpected forecast evidence RPC EXECUTE grants';
  END IF;
END;
$$;

\echo '--- Provider promotion create + replay + conflict ---'

SELECT *
FROM public.issue_trusted_provider_promotion_evidence(
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'integration_a'::uuid,
  '2026-06-15'::date,
  'none',
  '2026-06-16T00:00:00Z'::timestamptz,
  'promo-rpc-1'
);

SELECT *
FROM public.issue_trusted_provider_promotion_evidence(
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'integration_a'::uuid,
  '2026-06-15'::date,
  'none',
  '2026-06-16T00:00:00Z'::timestamptz,
  'promo-rpc-1'
);

DO $$
DECLARE
  trust_value text;
BEGIN
  SELECT trust INTO trust_value
  FROM public.forecast_day_promotion_evidence
  WHERE idempotency_key = 'promo-rpc-1';

  IF trust_value IS DISTINCT FROM 'trusted_provider' THEN
    RAISE EXCEPTION 'provider RPC must stamp trusted_provider';
  END IF;

  BEGIN
    PERFORM *
    FROM public.issue_trusted_provider_promotion_evidence(
      '61001000-0000-4000-8000-000000000001'::uuid,
      '61001000-0000-4000-8000-000000000002'::uuid,
      '61001000-0000-4000-8000-000000000006'::uuid,
      '2026-06-15'::date,
      'promotion',
      '2026-06-16T00:00:00Z'::timestamptz,
      'promo-rpc-1'
    );
    RAISE EXCEPTION 'conflicting replay should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%conflicting payload%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

\echo '--- Provider complete fail-closed; partial ok ---'

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.issue_trusted_provider_coverage_evidence(
      '61001000-0000-4000-8000-000000000001'::uuid,
      '61001000-0000-4000-8000-000000000002'::uuid,
      '61001000-0000-4000-8000-000000000006'::uuid,
      '2026-06-15'::date,
      'orders',
      'complete',
      '2026-06-16T00:00:00Z'::timestamptz,
      '2026-06-16T00:00:00Z'::timestamptz,
      'cov-complete-denied'
    );
    RAISE EXCEPTION 'provider complete should fail closed';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%no authoritative day/stream closure%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

SELECT *
FROM public.issue_trusted_provider_coverage_evidence(
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'integration_a'::uuid,
  '2026-06-15'::date,
  'orders',
  'partial',
  '2026-06-16T00:00:00Z'::timestamptz,
  '2026-06-16T00:00:00Z'::timestamptz,
  'cov-partial-1'
);

\echo '--- Merchant authorization and complete attestation ---'

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.issue_merchant_attestation_promotion_evidence(
      '61001000-0000-4000-8000-000000000001'::uuid,
      '61001000-0000-4000-8000-000000000002'::uuid,
      '61001000-0000-4000-8000-000000000008'::uuid,
      '2026-06-16'::date,
      'none',
      '2026-06-17T00:00:00Z'::timestamptz,
      'merchant-denied'
    );
    RAISE EXCEPTION 'analyst merchant attestation should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%owner or admin%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM *
    FROM public.issue_merchant_attestation_coverage_evidence(
      '61001000-0000-4000-8000-000000000001'::uuid,
      '61001000-0000-4000-8000-000000000002'::uuid,
      '61001000-0000-4000-8000-000000000007'::uuid,
      '2026-06-15'::date,
      'returns',
      'complete',
      '2026-06-16T00:00:00Z'::timestamptz,
      '2026-06-16T00:00:00Z'::timestamptz,
      'merchant-complete-no-assert',
      false
    );
    RAISE EXCEPTION 'complete without assert should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%explicit day/stream closure%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

SELECT *
FROM public.issue_merchant_attestation_coverage_evidence(
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'user_owner'::uuid,
  '2026-06-15'::date,
  'returns',
  'complete',
  '2026-06-16T00:00:00Z'::timestamptz,
  '2026-06-16T00:00:00Z'::timestamptz,
  'merchant-complete-1',
  true
);

DO $$
DECLARE
  stamped_trust text;
  stamped_closure text;
  stamped_actor uuid;
  stamped_integration uuid;
  stamped_provider text;
BEGIN
  SELECT trust, closure_id, actor_user_id, integration_id, provider
  INTO stamped_trust, stamped_closure, stamped_actor, stamped_integration,
       stamped_provider
  FROM public.forecast_day_coverage_evidence
  WHERE idempotency_key = 'merchant-complete-1';

  IF stamped_trust IS DISTINCT FROM 'verified_merchant_attestation' THEN
    RAISE EXCEPTION 'merchant RPC must stamp verified_merchant_attestation';
  END IF;

  IF stamped_actor IS DISTINCT FROM '61001000-0000-4000-8000-000000000007'::uuid THEN
    RAISE EXCEPTION 'merchant complete must retain actor provenance';
  END IF;

  IF stamped_integration IS NOT NULL OR stamped_provider IS NOT NULL THEN
    RAISE EXCEPTION 'merchant complete must not look provider-verified';
  END IF;

  IF stamped_closure IS NULL
     OR stamped_closure NOT LIKE 'merchant_day_stream_closure:%'
  THEN
    RAISE EXCEPTION 'merchant complete must RPC-stamp closure_id';
  END IF;
END;
$$;

\echo '--- Forged merchant context ---'

DO $$
BEGIN
  -- Org B owner cannot attest into Org A.
  BEGIN
    PERFORM *
    FROM public.issue_merchant_attestation_promotion_evidence(
      '61001000-0000-4000-8000-000000000001'::uuid,
      '61001000-0000-4000-8000-000000000002'::uuid,
      '61001000-0000-4000-8000-000000000017'::uuid,
      '2026-06-20'::date,
      'none',
      '2026-06-21T00:00:00Z'::timestamptz,
      'forged-merchant'
    );
    RAISE EXCEPTION 'forged cross-org merchant actor should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%not an organization member%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

\echo '--- Cross-tenant integration/store rejection ---'

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.issue_trusted_provider_promotion_evidence(
      '61001000-0000-4000-8000-000000000011'::uuid,
      '61001000-0000-4000-8000-000000000012'::uuid,
      '61001000-0000-4000-8000-000000000006'::uuid,
      '2026-06-15'::date,
      'none',
      '2026-06-16T00:00:00Z'::timestamptz,
      'cross-tenant'
    );
    RAISE EXCEPTION 'cross-tenant integration should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%trusted integration%'
         AND SQLERRM NOT LIKE '%store scope%'
      THEN
        RAISE;
      END IF;
  END;
END;
$$;

\echo '--- Invalidation auth, fencing, cross-tenant, no resurrection ---'

DO $$
DECLARE
  target_id text;
BEGIN
  SELECT evidence_id INTO target_id
  FROM public.forecast_day_coverage_evidence
  WHERE idempotency_key = 'cov-partial-1'
    AND version = 1;

  BEGIN
    PERFORM *
    FROM public.invalidate_forecast_day_coverage_evidence(
      '61001000-0000-4000-8000-000000000001'::uuid,
      target_id,
      '2026-06-16T12:00:00Z'::timestamptz,
      '2026-06-16T12:00:00Z'::timestamptz
    );
    RAISE EXCEPTION 'invalidation without tenant agent should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%exactly one of integration_id or actor_user_id%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM *
    FROM public.invalidate_forecast_day_coverage_evidence(
      '61001000-0000-4000-8000-000000000011'::uuid,
      target_id,
      '2026-06-16T12:00:00Z'::timestamptz,
      '2026-06-16T12:00:00Z'::timestamptz,
      null,
      '61001000-0000-4000-8000-000000000017'::uuid
    );
    RAISE EXCEPTION 'cross-tenant invalidation should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%not found in organization%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM *
    FROM public.invalidate_forecast_day_coverage_evidence(
      '61001000-0000-4000-8000-000000000001'::uuid,
      target_id,
      '2026-06-16T12:00:00Z'::timestamptz,
      '2026-06-16T12:00:00Z'::timestamptz,
      null,
      '61001000-0000-4000-8000-000000000017'::uuid
    );
    RAISE EXCEPTION 'forged actor invalidation should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%not an organization member%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM *
    FROM public.invalidate_forecast_day_coverage_evidence(
      '61001000-0000-4000-8000-000000000001'::uuid,
      target_id,
      '2026-06-16T12:00:00Z'::timestamptz,
      '2026-06-15T12:00:00Z'::timestamptz,
      '61001000-0000-4000-8000-000000000006'::uuid,
      null
    );
    RAISE EXCEPTION 'stale late-event should fail fencing';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%after coverage as_of%' THEN
        RAISE;
      END IF;
  END;

  PERFORM *
  FROM public.invalidate_forecast_day_coverage_evidence(
    '61001000-0000-4000-8000-000000000001'::uuid,
    target_id,
    '2026-06-16T12:00:00Z'::timestamptz,
    '2026-06-16T12:00:00Z'::timestamptz,
    '61001000-0000-4000-8000-000000000006'::uuid,
    null
  );

  BEGIN
    PERFORM *
    FROM public.invalidate_forecast_day_coverage_evidence(
      '61001000-0000-4000-8000-000000000001'::uuid,
      target_id,
      '2026-06-17T00:00:00Z'::timestamptz,
      '2026-06-17T00:00:00Z'::timestamptz,
      null,
      '61001000-0000-4000-8000-000000000007'::uuid
    );
    RAISE EXCEPTION 're-invalidation should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%already invalidated%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.forecast_day_coverage_evidence
    SET invalidated_at = NULL
    WHERE evidence_id = target_id;
    RAISE EXCEPTION 'resurrection should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

\echo '--- Coverage supersession after invalidation ---'

SELECT *
FROM public.issue_trusted_provider_coverage_evidence(
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'integration_a'::uuid,
  '2026-06-15'::date,
  'orders',
  'partial',
  '2026-06-16T13:00:00Z'::timestamptz,
  '2026-06-16T13:00:00Z'::timestamptz,
  'cov-partial-1',
  null,
  null,
  2,
  (
    SELECT evidence_id
    FROM public.forecast_day_coverage_evidence
    WHERE idempotency_key = 'cov-partial-1'
      AND version = 1
  )
);

\echo '--- Promotion supersession + concurrent active conflict ---'

SELECT *
FROM public.issue_trusted_provider_promotion_evidence(
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'integration_a'::uuid,
  '2026-06-15'::date,
  'promotion',
  '2026-06-16T02:00:00Z'::timestamptz,
  'promo-rpc-1',
  null,
  null,
  2,
  (
    SELECT evidence_id
    FROM public.forecast_day_promotion_evidence
    WHERE idempotency_key = 'promo-rpc-1'
      AND version = 1
  )
);

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.issue_trusted_provider_promotion_evidence(
      '61001000-0000-4000-8000-000000000001'::uuid,
      '61001000-0000-4000-8000-000000000002'::uuid,
      '61001000-0000-4000-8000-000000000006'::uuid,
      '2026-06-15'::date,
      'none',
      '2026-06-16T03:00:00Z'::timestamptz,
      'promo-rpc-active-conflict'
    );
    RAISE EXCEPTION 'second active promotion same day should fail';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  BEGIN
    PERFORM *
    FROM public.issue_trusted_provider_promotion_evidence(
      '61001000-0000-4000-8000-000000000001'::uuid,
      '61001000-0000-4000-8000-000000000002'::uuid,
      '61001000-0000-4000-8000-000000000006'::uuid,
      '2026-06-22'::date,
      'none',
      '2026-06-23T00:00:00Z'::timestamptz,
      'promo-scope-mismatch',
      null,
      null,
      1,
      (
        SELECT evidence_id
        FROM public.forecast_day_promotion_evidence
        WHERE idempotency_key = 'promo-rpc-1'
          AND version = 2
      )
    );
    RAISE EXCEPTION 'cross-day supersession should fail';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%scope mismatch%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

\echo '=== M6 P2b.2b.2 FORECAST EVIDENCE RPC ADVERSARIAL VERIFICATION PASSED ==='

ROLLBACK;
