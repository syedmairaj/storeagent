-- SHOPIFY-CONN-1c-α disposable adversarial checks (offline / isolated PG only).
\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== SHOPIFY-CONN-1c-α CREDENTIAL PERSISTENCE ADVERSARIAL ==='

\set org_a 'c011c000-0000-4000-8000-000000000001'
\set org_b 'c011c000-0000-4000-8000-000000000011'
\set store_a 'c011c000-0000-4000-8000-000000000002'
\set store_b 'c011c000-0000-4000-8000-000000000012'
\set integ_a 'c011c000-0000-4000-8000-000000000003'
\set integ_a2 'c011c000-0000-4000-8000-000000000004'
\set integ_b 'c011c000-0000-4000-8000-000000000013'
\set integ_missing 'c011c000-0000-4000-8000-000000000099'

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'CONN-1c Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'CONN-1c Org B', 'USD', 'UTC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stores (
  id, organization_id, name, status, currency, timezone
)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'CONN-1c Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'CONN-1c Store B', 'active', 'USD', 'UTC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.integrations (
  id, organization_id, store_id, provider, status, display_name
)
VALUES
  (
    :'integ_a'::uuid, :'org_a'::uuid, :'store_a'::uuid,
    'shopify', 'active', 'Org A Shopify'
  ),
  (
    :'integ_a2'::uuid, :'org_a'::uuid, :'store_a'::uuid,
    'shopify', 'active', 'Org A Shopify 2'
  ),
  (
    :'integ_b'::uuid, :'org_b'::uuid, :'store_b'::uuid,
    'shopify', 'active', 'Org B Shopify'
  )
ON CONFLICT (id) DO NOTHING;

\echo '--- Fence columns present; table privileges still revoked ---'

DO $$
DECLARE
  role_name text;
  priv text;
  allowed boolean;
  missing text;
BEGIN
  SELECT c.column_name
  INTO missing
  FROM (
    VALUES
      ('credential_generation'),
      ('refresh_lock_token'),
      ('refresh_lock_owner_id'),
      ('refresh_lock_claimed_at'),
      ('refresh_lock_expires_at')
  ) AS required(column_name)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'integration_credentials'
   AND c.column_name = required.column_name
  WHERE c.column_name IS NULL
  LIMIT 1;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'missing fence/lease column: %', missing;
  END IF;

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
          '% must not have % on integration_credentials',
          role_name, priv;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

\echo '--- RPC EXECUTE matrix: service_role only ---'

DO $$
DECLARE
  role_name text;
  allowed boolean;
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.load_integration_credential_envelope(uuid,uuid,text)',
    'public.replace_integration_credential_set(uuid,uuid,text,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,integer,timestamptz,timestamptz,text,bigint)',
    'public.clear_integration_credentials(uuid,uuid,text,bigint)'
  ]
  LOOP
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role must EXECUTE %', fn;
    END IF;

    FOREACH role_name IN ARRAY ARRAY['public', 'anon', 'authenticated']
    LOOP
      SELECT has_function_privilege(role_name, fn, 'EXECUTE')
      INTO allowed;
      IF allowed THEN
        RAISE EXCEPTION '% must not EXECUTE %', role_name, fn;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

\echo '--- No lease RPC symbols in α ---'

DO $$
BEGIN
  IF to_regprocedure(
    'public.acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'acquire lease RPC must not exist in CONN-1c-α';
  END IF;
  IF to_regprocedure(
    'public.rotate_integration_credential_set(uuid,uuid,text,text,text,bigint)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rotate lease RPC must not exist in CONN-1c-α';
  END IF;
  IF to_regprocedure(
    'public.release_integration_credential_refresh_lock(uuid,uuid,text,text,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'release lease RPC must not exist in CONN-1c-α';
  END IF;
END;
$$;

\echo '--- SET ROLE denial for browser/table; service_role RPC path works ---'

DO $$
DECLARE
  failed boolean;
  outcome text;
  gen bigint;
  cred_id uuid;
  org_a uuid := 'c011c000-0000-4000-8000-000000000001'::uuid;
  org_b uuid := 'c011c000-0000-4000-8000-000000000011'::uuid;
  integ_a uuid := 'c011c000-0000-4000-8000-000000000003'::uuid;
  integ_a2 uuid := 'c011c000-0000-4000-8000-000000000004'::uuid;
  integ_missing uuid := 'c011c000-0000-4000-8000-000000000099'::uuid;
  access_ct bytea := decode('aa', 'hex');
  access_n bytea := decode('0102030405060708090a0b0c', 'hex');
  access_t bytea := decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex');
  refresh_ct bytea := decode('bb', 'hex');
  refresh_n bytea := decode('1112131415161718191a1b1c', 'hex');
  refresh_t bytea := decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex');
  dek_ct bytea := decode('cc', 'hex');
  dek_n bytea := decode('2122232425262728292a2b2c', 'hex');
  dek_t bytea := decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex');
BEGIN
  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM count(*) FROM public.integration_credentials;
    failed := false;
  EXCEPTION
    WHEN insufficient_privilege THEN
      failed := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT failed THEN
    RAISE EXCEPTION 'anon must not SELECT vault table';
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
    RAISE EXCEPTION 'authenticated must not SELECT vault table';
  END IF;

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
    RAISE EXCEPTION 'service_role must not SELECT vault table directly';
  END IF;

  EXECUTE 'SET ROLE service_role';

  SELECT r.credential_id, r.credential_generation, r.outcome
  INTO cred_id, gen, outcome
  FROM public.replace_integration_credential_set(
    org_a,
    integ_a,
    'shopify',
    'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1,
    now() + interval '1 hour',
    now() + interval '30 days',
    'read_products',
    NULL
  ) AS r;

  IF outcome <> 'inserted' OR gen <> 1 OR cred_id IS NULL THEN
    RAISE EXCEPTION 'create-only insert failed: % gen=%', outcome, gen;
  END IF;

  -- Create-only must not overwrite
  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_a,
    integ_a,
    'shopify',
    'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1,
    now() + interval '1 hour',
    now() + interval '30 days',
    'read_products',
    NULL
  ) AS r;

  IF outcome <> 'conflict' THEN
    RAISE EXCEPTION 'NULL generation overwrite expected conflict, got %', outcome;
  END IF;

  -- Wrong provider deny (no row for that provider binding)
  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_a,
    integ_a,
    'woocommerce',
    'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1,
    now() + interval '1 hour',
    now() + interval '30 days',
    'read_products',
    NULL
  ) AS r;

  IF outcome <> 'not_found' THEN
    RAISE EXCEPTION 'wrong provider expected not_found, got %', outcome;
  END IF;

  -- Cross-org deny
  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_b,
    integ_a,
    'shopify',
    'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1,
    now() + interval '1 hour',
    now() + interval '30 days',
    'read_products',
    NULL
  ) AS r;

  IF outcome <> 'not_found' THEN
    RAISE EXCEPTION 'cross-org expected not_found, got %', outcome;
  END IF;

  -- Missing integration deny
  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_a,
    integ_missing,
    'shopify',
    'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1,
    now() + interval '1 hour',
    now() + interval '30 days',
    'read_products',
    NULL
  ) AS r;

  IF outcome <> 'not_found' THEN
    RAISE EXCEPTION 'missing integration expected not_found, got %', outcome;
  END IF;

  -- CAS replace with matching generation
  access_ct := decode('dd', 'hex');
  refresh_ct := decode('ee', 'hex');
  SELECT r.credential_generation, r.outcome
  INTO gen, outcome
  FROM public.replace_integration_credential_set(
    org_a,
    integ_a,
    'shopify',
    'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    2,
    now() + interval '2 hours',
    now() + interval '60 days',
    'read_products,read_orders',
    1
  ) AS r;

  IF outcome <> 'replaced' OR gen <> 2 THEN
    RAISE EXCEPTION 'CAS replace failed: % gen=%', outcome, gen;
  END IF;

  -- Stale CAS → conflict
  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_a,
    integ_a,
    'shopify',
    'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    2,
    now() + interval '2 hours',
    now() + interval '60 days',
    'read_products',
    1
  ) AS r;

  IF outcome <> 'conflict' THEN
    RAISE EXCEPTION 'stale CAS expected conflict, got %', outcome;
  END IF;

  -- Load returns sealed pair only for matching tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.load_integration_credential_envelope(
      org_a, integ_a, 'shopify'
    ) AS loaded
    WHERE loaded.credential_generation = 2
      AND loaded.access_ciphertext = decode('dd', 'hex')
      AND loaded.refresh_ciphertext = decode('ee', 'hex')
      AND loaded.key_version = 2
  ) THEN
    RAISE EXCEPTION 'load envelope missing expected sealed pair';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.load_integration_credential_envelope(
      org_b, integ_a, 'shopify'
    )
  ) THEN
    RAISE EXCEPTION 'cross-org load must return empty';
  END IF;

  -- Stale clear → fenced; row preserved
  -- Note: clear/load run as DEFINER so they work under service_role;
  -- existence check below uses DEFINER path via load, not direct table SELECT.
  SELECT public.clear_integration_credentials(
    org_a, integ_a, 'shopify', 1
  ) INTO outcome;

  IF outcome <> 'fenced' THEN
    RAISE EXCEPTION 'stale clear expected fenced, got %', outcome;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.load_integration_credential_envelope(
      org_a, integ_a, 'shopify'
    ) AS loaded
    WHERE loaded.credential_generation = 2
  ) THEN
    RAISE EXCEPTION 'fenced clear must preserve ciphertext row';
  END IF;

  -- Matching clear
  SELECT public.clear_integration_credentials(
    org_a, integ_a, 'shopify', 2
  ) INTO outcome;

  IF outcome <> 'cleared' THEN
    RAISE EXCEPTION 'matching clear expected cleared, got %', outcome;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.load_integration_credential_envelope(
      org_a, integ_a, 'shopify'
    )
  ) THEN
    RAISE EXCEPTION 'cleared row still present';
  END IF;

  -- integrations.status untouched (still active)
  -- Direct SELECT on integrations may be permitted for service_role in
  -- disposable bootstrap; assert status value via owner after RESET.
  EXECUTE 'RESET ROLE';

  IF NOT EXISTS (
    SELECT 1 FROM public.integrations
    WHERE id = integ_a
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'clear must not mutate integrations.status';
  END IF;

  EXECUTE 'RESET ROLE';

  -- Seed integ_a2 credential with an unexpired refresh lease (owner DML for
  -- β foresight fixture only; ordinary α RPCs must not override it).
  INSERT INTO public.integration_credentials (
    organization_id,
    integration_id,
    provider,
    token_kind,
    access_ciphertext,
    access_nonce,
    access_auth_tag,
    refresh_ciphertext,
    refresh_nonce,
    refresh_auth_tag,
    dek_wrapped,
    dek_wrap_nonce,
    dek_wrap_auth_tag,
    key_version,
    credential_generation,
    refresh_lock_token,
    refresh_lock_owner_id,
    refresh_lock_claimed_at,
    refresh_lock_expires_at,
    last_rotated_at
  )
  VALUES (
    org_a,
    integ_a2,
    'shopify',
    'offline_expiring',
    decode('aa', 'hex'),
    decode('0102030405060708090a0b0c', 'hex'),
    decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex'),
    decode('bb', 'hex'),
    decode('1112131415161718191a1b1c', 'hex'),
    decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex'),
    decode('cc', 'hex'),
    decode('2122232425262728292a2b2c', 'hex'),
    decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex'),
    1,
    1,
    'lease-token-a2',
    'owner-a2',
    now(),
    now() + interval '10 minutes',
    now()
  );

  EXECUTE 'SET ROLE service_role';

  -- Unexpired lease blocks ordinary CAS replace
  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_a,
    integ_a2,
    'shopify',
    'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1,
    now() + interval '1 hour',
    now() + interval '30 days',
    'read_products',
    1
  ) AS r;

  IF outcome <> 'conflict' THEN
    RAISE EXCEPTION 'unexpired lease CAS expected conflict, got %', outcome;
  END IF;

  -- Unexpired lease blocks ordinary clear
  SELECT public.clear_integration_credentials(
    org_a, integ_a2, 'shopify', 1
  ) INTO outcome;

  IF outcome <> 'fenced' THEN
    RAISE EXCEPTION 'unexpired lease clear expected fenced, got %', outcome;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.load_integration_credential_envelope(
      org_a, integ_a2, 'shopify'
    ) AS loaded
    WHERE loaded.credential_generation = 1
      AND loaded.access_ciphertext = decode('aa', 'hex')
  ) THEN
    RAISE EXCEPTION 'lease-held row must be preserved after fenced ops';
  END IF;

  -- Incomplete refresh envelope denied
  BEGIN
    PERFORM * FROM public.replace_integration_credential_set(
      org_a,
      integ_a2,
      'shopify',
      'offline_expiring',
      access_ct, access_n, access_t,
      NULL, NULL, NULL,
      dek_ct, dek_n, dek_t,
      1,
      now() + interval '1 hour',
      now() + interval '30 days',
      'read_products',
      NULL
    );
    RAISE EXCEPTION 'incomplete refresh envelope must fail';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      NULL;
  END;

  EXECUTE 'RESET ROLE';

  -- Expired lease may be overridden by ordinary CAS (clears stale lock).
  UPDATE public.integration_credentials
  SET refresh_lock_expires_at = now() - interval '1 minute'
  WHERE organization_id = org_a
    AND integration_id = integ_a2;

  EXECUTE 'SET ROLE service_role';

  SELECT r.outcome, r.credential_generation
  INTO outcome, gen
  FROM public.replace_integration_credential_set(
    org_a,
    integ_a2,
    'shopify',
    'offline_expiring',
    decode('ff', 'hex'), access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1,
    now() + interval '1 hour',
    now() + interval '30 days',
    'read_products',
    1
  ) AS r;

  IF outcome <> 'replaced' OR gen <> 2 THEN
    RAISE EXCEPTION 'expired lease CAS expected replaced gen=2, got % gen=%',
      outcome, gen;
  END IF;

  EXECUTE 'RESET ROLE';
END;
$$;

\echo '--- CONN-1c-α adversarial checks PASS ---'

COMMIT;
