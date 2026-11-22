-- SHOPIFY-CONN-1c-β disposable adversarial checks (offline / isolated PG only).
\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== SHOPIFY-CONN-1c-β REFRESH LEASE ADVERSARIAL ==='

\set org_a 'c011c0b0-0000-4000-8000-000000000001'
\set org_b 'c011c0b0-0000-4000-8000-000000000011'
\set store_a 'c011c0b0-0000-4000-8000-000000000002'
\set store_b 'c011c0b0-0000-4000-8000-000000000012'
\set integ_a 'c011c0b0-0000-4000-8000-000000000003'
\set integ_a2 'c011c0b0-0000-4000-8000-000000000004'
\set integ_rev 'c011c0b0-0000-4000-8000-000000000005'
\set integ_b 'c011c0b0-0000-4000-8000-000000000013'

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'CONN-1c-β Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'CONN-1c-β Org B', 'USD', 'UTC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stores (
  id, organization_id, name, status, currency, timezone
)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'CONN-1c-β Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'CONN-1c-β Store B', 'active', 'USD', 'UTC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.integrations (
  id, organization_id, store_id, provider, status, display_name
)
VALUES
  (
    :'integ_a'::uuid, :'org_a'::uuid, :'store_a'::uuid,
    'shopify', 'active', 'Org A Shopify β'
  ),
  (
    :'integ_a2'::uuid, :'org_a'::uuid, :'store_a'::uuid,
    'shopify', 'degraded', 'Org A Shopify β degraded'
  ),
  (
    :'integ_rev'::uuid, :'org_a'::uuid, :'store_a'::uuid,
    'shopify', 'active', 'Org A Shopify β revoked'
  ),
  (
    :'integ_b'::uuid, :'org_b'::uuid, :'store_b'::uuid,
    'shopify', 'active', 'Org B Shopify β'
  )
ON CONFLICT (id) DO NOTHING;

\echo '--- B1: grants matrix ---'

DO $$
DECLARE
  role_name text;
  priv text;
  allowed boolean;
  fn text;
BEGIN
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

  FOREACH fn IN ARRAY ARRAY[
    'public.acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)',
    'public.rotate_integration_credential_set(uuid,uuid,text,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,integer,timestamptz,timestamptz,text,text,text,bigint)',
    'public.release_integration_credential_refresh_lock(uuid,uuid,text,text,text)'
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

\echo '--- Seed credentials + α regression helpers ---'

DO $$
DECLARE
  org_a uuid := 'c011c0b0-0000-4000-8000-000000000001';
  integ_a uuid := 'c011c0b0-0000-4000-8000-000000000003';
  integ_a2 uuid := 'c011c0b0-0000-4000-8000-000000000004';
  integ_rev uuid := 'c011c0b0-0000-4000-8000-000000000005';
  integ_b uuid := 'c011c0b0-0000-4000-8000-000000000013';
  access_ct bytea := decode('aa', 'hex');
  access_n bytea := decode('0102030405060708090a0b0c', 'hex');
  access_t bytea := decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex');
  refresh_ct bytea := decode('bb', 'hex');
  refresh_n bytea := decode('1112131415161718191a1b1c', 'hex');
  refresh_t bytea := decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex');
  dek_ct bytea := decode('cc', 'hex');
  dek_n bytea := decode('2122232425262728292a2b2c', 'hex');
  dek_t bytea := decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex');
  outcome text;
  gen bigint;
  cred_id uuid;
  acquired boolean;
  token text;
  token2 text;
  expires_at timestamptz;
  ct bytea;
  winner_token text;
  winner_gen bigint;
BEGIN
  EXECUTE 'SET ROLE service_role';

  -- Create via α RPC for integ_a / a2 / rev / b
  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_a, integ_a, 'shopify', 'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products', NULL
  ) AS r;
  IF outcome <> 'inserted' THEN
    RAISE EXCEPTION 'seed integ_a expected inserted, got %', outcome;
  END IF;

  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_a, integ_a2, 'shopify', 'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products', NULL
  ) AS r;
  IF outcome <> 'inserted' THEN
    RAISE EXCEPTION 'seed integ_a2 expected inserted, got %', outcome;
  END IF;

  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_a, integ_rev, 'shopify', 'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products', NULL
  ) AS r;
  IF outcome <> 'inserted' THEN
    RAISE EXCEPTION 'seed integ_rev expected inserted, got %', outcome;
  END IF;

  -- Terminal statuses fence α create, so integ_rev is seeded while active
  -- and revoked afterwards (B10 fixture).
  EXECUTE 'RESET ROLE';
  UPDATE public.integrations
  SET status = 'revoked'
  WHERE id = integ_rev;
  EXECUTE 'SET ROLE service_role';

  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    'c011c0b0-0000-4000-8000-000000000011'::uuid,
    integ_b, 'shopify', 'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products', NULL
  ) AS r;
  IF outcome <> 'inserted' THEN
    RAISE EXCEPTION 'seed integ_b expected inserted, got %', outcome;
  END IF;

  -- B2: acquire success returns secrets; deny returns none
  SELECT a.acquired, a.refresh_lock_token, a.credential_generation,
         a.access_ciphertext
  INTO acquired, token, gen, ct
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_a, 'shopify', 'owner-1', 60
  ) AS a;

  IF acquired IS NOT TRUE
    OR token IS NULL
    OR pg_catalog.length(pg_catalog.btrim(token)) = 0
    OR gen IS DISTINCT FROM 1
    OR ct IS DISTINCT FROM access_ct
  THEN
    RAISE EXCEPTION 'B2 acquire success shape failed';
  END IF;
  winner_token := token;
  winner_gen := gen;

  -- B3/B4: second acquire (same owner) denied; no secrets
  SELECT a.acquired, a.refresh_lock_token, a.access_ciphertext,
         a.credential_generation
  INTO acquired, token2, ct, gen
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_a, 'shopify', 'owner-1', 60
  ) AS a;

  IF acquired IS DISTINCT FROM false
    OR token2 IS NOT NULL
    OR ct IS NOT NULL
    OR gen IS NOT NULL
  THEN
    RAISE EXCEPTION 'B3/B4 same-owner reacquire must deny without secrets';
  END IF;

  SELECT a.acquired, a.refresh_lock_token, a.access_ciphertext
  INTO acquired, token2, ct
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_a, 'shopify', 'owner-2', 60
  ) AS a;

  IF acquired IS DISTINCT FROM false
    OR token2 IS NOT NULL
    OR ct IS NOT NULL
  THEN
    RAISE EXCEPTION 'B3 concurrent acquire loser must deny without secrets';
  END IF;

  -- B12: α CAS/clear blocked while lease held
  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_a, integ_a, 'shopify', 'offline_expiring',
    decode('dd', 'hex'), access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products', 1
  ) AS r;
  IF outcome <> 'conflict' THEN
    RAISE EXCEPTION 'B12 α CAS under lease expected conflict, got %', outcome;
  END IF;

  SELECT public.clear_integration_credentials(
    org_a, integ_a, 'shopify', 1
  ) INTO outcome;
  IF outcome <> 'fenced' THEN
    RAISE EXCEPTION 'B12 α clear under lease expected fenced, got %', outcome;
  END IF;

  -- B5: rotate success then stale rotate fenced
  SELECT r.outcome, r.credential_generation, r.credential_id
  INTO outcome, gen, cred_id
  FROM public.rotate_integration_credential_set(
    org_a, integ_a, 'shopify', 'offline_expiring',
    decode('ee', 'hex'), access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products',
    'owner-1', winner_token, winner_gen
  ) AS r;

  IF outcome <> 'rotated' OR gen <> 2 OR cred_id IS NULL THEN
    RAISE EXCEPTION 'B5 rotate expected rotated gen=2, got % gen=%',
      outcome, gen;
  END IF;

  EXECUTE 'RESET ROLE';
  IF EXISTS (
    SELECT 1 FROM public.integration_credentials c
    WHERE c.organization_id = org_a
      AND c.integration_id = integ_a
      AND (
        c.refresh_lock_token IS NOT NULL
        OR c.refresh_lock_owner_id IS NOT NULL
        OR c.refresh_lock_expires_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'B5 rotate must clear lease columns';
  END IF;
  EXECUTE 'SET ROLE service_role';

  SELECT r.outcome INTO outcome
  FROM public.rotate_integration_credential_set(
    org_a, integ_a, 'shopify', 'offline_expiring',
    decode('ff', 'hex'), access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products',
    'owner-1', winner_token, winner_gen
  ) AS r;
  IF outcome <> 'fenced' THEN
    RAISE EXCEPTION 'B5 stale rotate expected fenced, got %', outcome;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.load_integration_credential_envelope(
      org_a, integ_a, 'shopify'
    ) AS loaded
    WHERE loaded.access_ciphertext = decode('ee', 'hex')
      AND loaded.credential_generation = 2
  ) THEN
    RAISE EXCEPTION 'B5 ciphertext must remain winner pair';
  END IF;

  -- B9: invalid TTL fail closed
  BEGIN
    PERFORM * FROM public.acquire_integration_credential_refresh_lock(
      org_a, integ_a, 'shopify', 'owner-ttl', 29
    );
    RAISE EXCEPTION 'B9 TTL 29 must fail';
  EXCEPTION
    WHEN sqlstate '22023' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.acquire_integration_credential_refresh_lock(
      org_a, integ_a, 'shopify', 'owner-ttl', 301
    );
    RAISE EXCEPTION 'B9 TTL 301 must fail';
  EXCEPTION
    WHEN sqlstate '22023' THEN NULL;
  END;

  -- B8: acquire + release (unexpired)
  SELECT a.acquired, a.refresh_lock_token, a.credential_generation
  INTO acquired, token, gen
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_a, 'shopify', 'owner-rel', 60
  ) AS a;
  IF acquired IS NOT TRUE THEN
    RAISE EXCEPTION 'B8 acquire failed';
  END IF;

  SELECT public.release_integration_credential_refresh_lock(
    org_a, integ_a, 'shopify', 'owner-rel', token
  ) INTO outcome;
  IF outcome <> 'released' THEN
    RAISE EXCEPTION 'B8 release expected released, got %', outcome;
  END IF;

  -- B6/B7: expiry takeover + stale release/rotate
  SELECT a.acquired, a.refresh_lock_token, a.credential_generation
  INTO acquired, token, gen
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_a, 'shopify', 'owner-old', 60
  ) AS a;
  IF acquired IS NOT TRUE THEN
    RAISE EXCEPTION 'B6 initial acquire failed';
  END IF;

  -- Force expiry without clearing token (simulate abandoned lease).
  EXECUTE 'RESET ROLE';
  UPDATE public.integration_credentials
  SET refresh_lock_expires_at = clock_timestamp() - interval '1 second'
  WHERE organization_id = org_a AND integration_id = integ_a;
  EXECUTE 'SET ROLE service_role';

  SELECT a.acquired, a.refresh_lock_token, a.credential_generation
  INTO acquired, token2, winner_gen
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_a, 'shopify', 'owner-new', 60
  ) AS a;
  IF acquired IS NOT TRUE OR token2 IS NULL THEN
    RAISE EXCEPTION 'B6 takeover acquire failed';
  END IF;

  SELECT public.release_integration_credential_refresh_lock(
    org_a, integ_a, 'shopify', 'owner-old', token
  ) INTO outcome;
  IF outcome <> 'fenced' THEN
    RAISE EXCEPTION 'B7 expired prior-owner release expected fenced, got %',
      outcome;
  END IF;

  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (
    SELECT 1 FROM public.integration_credentials c
    WHERE c.organization_id = org_a
      AND c.integration_id = integ_a
      AND c.refresh_lock_token = token2
      AND c.refresh_lock_owner_id = 'owner-new'
  ) THEN
    RAISE EXCEPTION 'B7 successor lease must remain intact';
  END IF;
  EXECUTE 'SET ROLE service_role';

  SELECT r.outcome INTO outcome
  FROM public.rotate_integration_credential_set(
    org_a, integ_a, 'shopify', 'offline_expiring',
    decode('11', 'hex'), access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products',
    'owner-old', token, gen
  ) AS r;
  IF outcome <> 'fenced' THEN
    RAISE EXCEPTION 'B6 stale writer rotate expected fenced, got %', outcome;
  END IF;

  SELECT r.outcome INTO outcome
  FROM public.rotate_integration_credential_set(
    org_a, integ_a, 'shopify', 'offline_expiring',
    decode('22', 'hex'), access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products',
    'owner-new', token2, winner_gen
  ) AS r;
  IF outcome <> 'rotated' THEN
    RAISE EXCEPTION 'B6 successor rotate expected rotated, got %', outcome;
  END IF;

  -- B10: revoked status deny acquire
  SELECT a.acquired, a.refresh_lock_token, a.access_ciphertext
  INTO acquired, token, ct
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_rev, 'shopify', 'owner-rev', 60
  ) AS a;
  IF acquired IS DISTINCT FROM false
    OR token IS NOT NULL
    OR ct IS NOT NULL
  THEN
    RAISE EXCEPTION 'B10 revoked acquire must deny without secrets';
  END IF;

  -- B10b: degraded still allow acquire
  SELECT a.acquired, a.refresh_lock_token
  INTO acquired, token
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_a2, 'shopify', 'owner-deg', 60
  ) AS a;
  IF acquired IS NOT TRUE OR token IS NULL THEN
    RAISE EXCEPTION 'B10b degraded acquire must succeed';
  END IF;
  PERFORM public.release_integration_credential_refresh_lock(
    org_a, integ_a2, 'shopify', 'owner-deg', token
  );

  -- B11: status flip race — acquire then revoke then rotate fenced
  SELECT a.acquired, a.refresh_lock_token, a.credential_generation
  INTO acquired, token, gen
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_a2, 'shopify', 'owner-race', 60
  ) AS a;
  IF acquired IS NOT TRUE THEN
    RAISE EXCEPTION 'B11 acquire failed';
  END IF;

  EXECUTE 'RESET ROLE';
  UPDATE public.integrations
  SET status = 'disconnected'
  WHERE id = integ_a2;
  EXECUTE 'SET ROLE service_role';

  SELECT r.outcome INTO outcome
  FROM public.rotate_integration_credential_set(
    org_a, integ_a2, 'shopify', 'offline_expiring',
    decode('33', 'hex'), access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products',
    'owner-race', token, gen
  ) AS r;
  IF outcome <> 'fenced' THEN
    RAISE EXCEPTION 'B11 rotate after disconnect expected fenced, got %',
      outcome;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.load_integration_credential_envelope(
      org_a, integ_a2, 'shopify'
    ) AS loaded
    WHERE loaded.access_ciphertext = access_ct
      AND loaded.credential_generation = gen
  ) THEN
    RAISE EXCEPTION 'B11 ciphertext must be unchanged after fenced rotate';
  END IF;

  -- disconnected acquire deny
  SELECT a.acquired INTO acquired
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_a2, 'shopify', 'owner-race-2', 60
  ) AS a;
  IF acquired IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'B11 disconnected acquire must deny';
  END IF;

  -- B13: incomplete refresh on rotate raises; lease preserved
  EXECUTE 'RESET ROLE';
  UPDATE public.integrations
  SET status = 'active'
  WHERE id = integ_a2;
  -- restore lease (owner DML fixture) after status restore
  UPDATE public.integration_credentials
  SET
    refresh_lock_token = 'lease-incomplete',
    refresh_lock_owner_id = 'owner-inc',
    refresh_lock_claimed_at = clock_timestamp(),
    refresh_lock_expires_at = clock_timestamp() + interval '5 minutes'
  WHERE organization_id = org_a AND integration_id = integ_a2;
  EXECUTE 'SET ROLE service_role';

  BEGIN
    PERFORM * FROM public.rotate_integration_credential_set(
      org_a, integ_a2, 'shopify', 'offline_expiring',
      access_ct, access_n, access_t,
      NULL, NULL, NULL,
      dek_ct, dek_n, dek_t,
      1, now() + interval '1 hour', now() + interval '30 days',
      'read_products',
      'owner-inc', 'lease-incomplete', 1
    );
    RAISE EXCEPTION 'B13 incomplete refresh must fail';
  EXCEPTION
    WHEN sqlstate '22023' THEN NULL;
  END;

  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (
    SELECT 1 FROM public.integration_credentials c
    WHERE c.organization_id = org_a
      AND c.integration_id = integ_a2
      AND c.refresh_lock_token = 'lease-incomplete'
      AND c.access_ciphertext = access_ct
  ) THEN
    RAISE EXCEPTION 'B13 incomplete rotate must leave row+lease unchanged';
  END IF;
  EXECUTE 'SET ROLE service_role';

  -- B14: cross-org acquire deny
  SELECT a.acquired, a.refresh_lock_token, a.access_ciphertext
  INTO acquired, token, ct
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_b, 'shopify', 'owner-xorg', 60
  ) AS a;
  IF acquired IS DISTINCT FROM false
    OR token IS NOT NULL
    OR ct IS NOT NULL
  THEN
    RAISE EXCEPTION 'B14 cross-org acquire must deny without secrets';
  END IF;

  SELECT a.acquired INTO acquired
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_a, 'woocommerce', 'owner-prov', 60
  ) AS a;
  IF acquired IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'B14 wrong-provider acquire must deny';
  END IF;

  -- B17 markers: no advisory / force-clear symbols checked in architecture unit.
  -- Expired own release without takeover (B8 variant already covered).
  -- Force-expire own lease then release with matching token.
  EXECUTE 'RESET ROLE';
  UPDATE public.integration_credentials
  SET
    refresh_lock_token = 'lease-exp-own',
    refresh_lock_owner_id = 'owner-exp',
    refresh_lock_claimed_at = clock_timestamp() - interval '2 minutes',
    refresh_lock_expires_at = clock_timestamp() - interval '1 minute'
  WHERE organization_id = org_a AND integration_id = integ_a;
  EXECUTE 'SET ROLE service_role';

  SELECT public.release_integration_credential_refresh_lock(
    org_a, integ_a, 'shopify', 'owner-exp', 'lease-exp-own'
  ) INTO outcome;
  IF outcome <> 'released' THEN
    RAISE EXCEPTION 'B8 expired-own release expected released, got %', outcome;
  END IF;

  EXECUTE 'RESET ROLE';
END;
$$;

\echo '--- CONN-1c-β adversarial checks PASS ---'

COMMIT;
