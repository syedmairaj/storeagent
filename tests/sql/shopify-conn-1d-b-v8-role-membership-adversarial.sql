-- SHOPIFY-CONN-1d-B — V8 disposable adversarial matrix.
-- Evidence class: SQL role impersonation + request.jwt.claim.sub stub.
-- NOT hosted PostgREST / real JWT verification.

\set ON_ERROR_STOP on

\echo '=== CONN-1d-B V8 adversarial matrix ==='

DO $$
DECLARE
  org_a uuid := 'c01d0b00-0000-4000-8000-000000000001'::uuid;
  org_b uuid := 'c01d0b00-0000-4000-8000-000000000011'::uuid;
  integ_a uuid := 'c01d0b00-0000-4000-8000-000000000003'::uuid;
  user_active uuid := 'c01d0b00-0000-4000-8000-0000000000a1'::uuid;
  user_revoked uuid := 'c01d0b00-0000-4000-8000-0000000000a2'::uuid;
  user_foreign uuid := 'c01d0b00-0000-4000-8000-0000000000b1'::uuid;
  user_none uuid := 'c01d0b00-0000-4000-8000-0000000000c1'::uuid;

  role_name text;
  priv text;
  allowed boolean;
  fn text;
  policy_count integer;
  failed boolean;
  n integer;
  loaded_ct bytea;
BEGIN
  -- -------------------------------------------------------------------------
  -- V8-G1: privilege matrix (table DML + RPC EXECUTE)
  -- -------------------------------------------------------------------------
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    LOOP
      SELECT has_table_privilege(
        role_name,
        'public.integration_credentials',
        priv
      ) INTO allowed;
      IF allowed THEN
        RAISE EXCEPTION
          'V8-G1 FAIL: % must not have % on integration_credentials',
          role_name, priv;
      END IF;

      SELECT has_table_privilege(
        role_name,
        'public.integration_external_accounts',
        priv
      ) INTO allowed;
      IF allowed THEN
        RAISE EXCEPTION
          'V8-G1 FAIL: % must not have % on integration_external_accounts',
          role_name, priv;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH fn IN ARRAY ARRAY[
    'public.load_integration_credential_envelope(uuid,uuid,text)',
    'public.replace_integration_credential_set(uuid,uuid,text,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,integer,timestamptz,timestamptz,text,bigint)',
    'public.clear_integration_credentials(uuid,uuid,text,bigint)'
  ]
  LOOP
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'V8-G1 FAIL: service_role must EXECUTE %', fn;
    END IF;

    FOREACH role_name IN ARRAY ARRAY['public', 'anon', 'authenticated']
    LOOP
      SELECT has_function_privilege(role_name, fn, 'EXECUTE')
      INTO allowed;
      IF allowed THEN
        RAISE EXCEPTION 'V8-G1 FAIL: % must not EXECUTE %', role_name, fn;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'V8-G1 PASS';

  -- -------------------------------------------------------------------------
  -- V8-G2: zero vault policies
  -- -------------------------------------------------------------------------
  SELECT count(*)::integer
  INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'integration_credentials',
      'integration_external_accounts'
    );

  IF policy_count <> 0 THEN
    RAISE EXCEPTION
      'V8-G2 FAIL: vault tables must have zero policies, found %',
      policy_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'integrations'
      AND policyname = 'integrations_select_member'
  ) THEN
    RAISE EXCEPTION
      'V8-G2 FAIL: integrations_select_member policy missing (bootstrap)';
  END IF;

  RAISE NOTICE 'V8-G2 PASS';

  -- -------------------------------------------------------------------------
  -- Helper: claim stub (NOT real JWT)
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_active::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- -------------------------------------------------------------------------
  -- V8-A1: active member cannot SELECT vault (privilege DENY)
  -- -------------------------------------------------------------------------
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM count(*) FROM public.integration_credentials;
    failed := false;
  EXCEPTION
    WHEN insufficient_privilege THEN
      failed := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT failed THEN
    RAISE EXCEPTION 'V8-A1 FAIL: authenticated SELECT vault must privilege-DENY';
  END IF;

  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM count(*) FROM public.integration_external_accounts;
    failed := false;
  EXCEPTION
    WHEN insufficient_privilege THEN
      failed := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT failed THEN
    RAISE EXCEPTION
      'V8-A1 FAIL: authenticated SELECT external_accounts must privilege-DENY';
  END IF;

  RAISE NOTICE 'V8-A1 PASS (privilege DENY)';

  -- -------------------------------------------------------------------------
  -- V8-A2: active member CAN SELECT own org integrations (RLS allow)
  -- -------------------------------------------------------------------------
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*)::integer
  INTO n
  FROM public.integrations
  WHERE organization_id = org_a;
  EXECUTE 'RESET ROLE';

  IF n <> 1 THEN
    RAISE EXCEPTION
      'V8-A2 FAIL: active member expected 1 org-A integration, got %', n;
  END IF;

  RAISE NOTICE 'V8-A2 PASS (RLS allow, % row)', n;

  -- -------------------------------------------------------------------------
  -- V8-A3: authenticated cannot EXECUTE vault RPCs (privilege DENY)
  -- -------------------------------------------------------------------------
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM * FROM public.load_integration_credential_envelope(
      org_a, integ_a, 'shopify'
    );
    failed := false;
  EXCEPTION
    WHEN insufficient_privilege THEN
      failed := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT failed THEN
    RAISE EXCEPTION 'V8-A3 FAIL: authenticated must not EXECUTE load RPC';
  END IF;

  RAISE NOTICE 'V8-A3 PASS (RPC privilege DENY)';

  -- -------------------------------------------------------------------------
  -- V8-R*: revoke former member via membership DELETE
  -- -------------------------------------------------------------------------
  DELETE FROM public.organization_members
  WHERE organization_id = org_a
    AND user_id = user_revoked;

  PERFORM set_config('request.jwt.claim.sub', user_revoked::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- V8-R1: integrations → RLS zero-row (GRANT present; membership gone)
  EXECUTE 'SET ROLE authenticated';
  SELECT count(*)::integer
  INTO n
  FROM public.integrations
  WHERE organization_id = org_a;
  EXECUTE 'RESET ROLE';

  IF n <> 0 THEN
    RAISE EXCEPTION
      'V8-R1 FAIL: revoked former member expected 0 integrations rows, got %',
      n;
  END IF;

  RAISE NOTICE 'V8-R1 PASS (RLS zero-row)';

  -- V8-R2: vault still privilege DENY
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM count(*) FROM public.integration_credentials;
    failed := false;
  EXCEPTION
    WHEN insufficient_privilege THEN
      failed := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT failed THEN
    RAISE EXCEPTION 'V8-R2 FAIL: revoked user vault SELECT must privilege-DENY';
  END IF;

  RAISE NOTICE 'V8-R2 PASS (privilege DENY)';

  -- -------------------------------------------------------------------------
  -- V8-N1: non-member
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_none::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  EXECUTE 'SET ROLE authenticated';
  SELECT count(*)::integer INTO n FROM public.integrations;
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN
    RAISE EXCEPTION 'V8-N1 FAIL: non-member expected 0 integrations, got %', n;
  END IF;

  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM count(*) FROM public.integration_credentials;
    failed := false;
  EXCEPTION
    WHEN insufficient_privilege THEN
      failed := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT failed THEN
    RAISE EXCEPTION 'V8-N1 FAIL: non-member vault SELECT must privilege-DENY';
  END IF;

  RAISE NOTICE 'V8-N1 PASS';

  -- -------------------------------------------------------------------------
  -- V8-X1/X2: cross-org (foreign is member of org B only)
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', user_foreign::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  EXECUTE 'SET ROLE authenticated';
  SELECT count(*)::integer
  INTO n
  FROM public.integrations
  WHERE organization_id = org_a;
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN
    RAISE EXCEPTION
      'V8-X1 FAIL: org-B member must not see org-A integrations, got %', n;
  END IF;

  EXECUTE 'SET ROLE authenticated';
  SELECT count(*)::integer
  INTO n
  FROM public.integrations
  WHERE organization_id = org_b;
  EXECUTE 'RESET ROLE';
  IF n <> 1 THEN
    RAISE EXCEPTION
      'V8-X1 FAIL: org-B member expected 1 own integration, got %', n;
  END IF;

  RAISE NOTICE 'V8-X1 PASS (RLS cross-org isolation)';

  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM count(*) FROM public.integration_credentials
    WHERE organization_id = org_b;
    failed := false;
  EXCEPTION
    WHEN insufficient_privilege THEN
      failed := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT failed THEN
    RAISE EXCEPTION 'V8-X2 FAIL: foreign user vault SELECT must privilege-DENY';
  END IF;

  RAISE NOTICE 'V8-X2 PASS (vault privilege DENY)';

  -- -------------------------------------------------------------------------
  -- V8-S1: service_role direct table SELECT DENY
  -- -------------------------------------------------------------------------
  BEGIN
    EXECUTE 'SET ROLE service_role';
    PERFORM count(*) FROM public.integration_credentials;
    failed := false;
  EXCEPTION
    WHEN insufficient_privilege THEN
      failed := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT failed THEN
    RAISE EXCEPTION 'V8-S1 FAIL: service_role must not SELECT vault table';
  END IF;

  RAISE NOTICE 'V8-S1 PASS';

  -- -------------------------------------------------------------------------
  -- V8-S2: service_role RPC load returns sealed envelope (not tenant auth)
  -- -------------------------------------------------------------------------
  EXECUTE 'SET ROLE service_role';
  SELECT access_ciphertext
  INTO loaded_ct
  FROM public.load_integration_credential_envelope(
    org_a, integ_a, 'shopify'
  );
  EXECUTE 'RESET ROLE';

  IF loaded_ct IS DISTINCT FROM decode('aa', 'hex') THEN
    RAISE EXCEPTION 'V8-S2 FAIL: scoped load did not return seeded ciphertext';
  END IF;

  -- Wrong-org load returns no row (RPC scoped args; still not browser auth)
  EXECUTE 'SET ROLE service_role';
  SELECT count(*)::integer
  INTO n
  FROM public.load_integration_credential_envelope(
    org_b, integ_a, 'shopify'
  );
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN
    RAISE EXCEPTION
      'V8-S2 FAIL: mismatched org/integration load must return 0 rows, got %',
      n;
  END IF;

  RAISE NOTICE
    'V8-S2 PASS (RPC EXECUTE ≠ tenant authorization; wrong scope empty)';

  -- Clear JWT stub
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);

  RAISE NOTICE 'CONN-1d-B V8 adversarial checks PASS';
END;
$$;

\echo 'CONN-1d-B V8 adversarial checks PASS'
