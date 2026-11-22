-- SHOPIFY-CONN-1d-C disposable adversarial checks (offline / isolated PG only).
\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== SHOPIFY-CONN-1d-C DISCONNECT/REVOKE ADVERSARIAL ==='

\set org_a 'c011d0c0-0000-4000-8000-000000000001'
\set org_b 'c011d0c0-0000-4000-8000-000000000011'
\set store_a 'c011d0c0-0000-4000-8000-000000000002'
\set store_b 'c011d0c0-0000-4000-8000-000000000012'
\set integ_a 'c011d0c0-0000-4000-8000-000000000003'
\set integ_a2 'c011d0c0-0000-4000-8000-000000000004'
\set integ_b 'c011d0c0-0000-4000-8000-000000000013'

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'CONN-1d-C Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'CONN-1d-C Org B', 'USD', 'UTC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stores (
  id, organization_id, name, status, currency, timezone
)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'CONN-1d-C Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'CONN-1d-C Store B', 'active', 'USD', 'UTC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.integrations (
  id, organization_id, store_id, provider, status, display_name
)
VALUES
  (
    :'integ_a'::uuid, :'org_a'::uuid, :'store_a'::uuid,
    'shopify', 'active', 'Org A Shopify 1d-C'
  ),
  (
    :'integ_a2'::uuid, :'org_a'::uuid, :'store_a'::uuid,
    'shopify', 'active', 'Org A Shopify 1d-C lease'
  ),
  (
    :'integ_b'::uuid, :'org_b'::uuid, :'store_b'::uuid,
    'shopify', 'active', 'Org B Shopify 1d-C'
  )
ON CONFLICT (id) DO NOTHING;

\echo '--- D1: grants matrix ---'

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

      SELECT has_table_privilege(
        role_name,
        'public.integration_external_accounts',
        priv
      ) INTO allowed;
      IF allowed THEN
        RAISE EXCEPTION
          '% must not have % on integration_external_accounts',
          role_name, priv;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH fn IN ARRAY ARRAY[
    'public.disconnect_or_revoke_integration_credentials(uuid,uuid,text,bigint,text,text)',
    'public.replace_integration_credential_set(uuid,uuid,text,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,integer,timestamptz,timestamptz,text,bigint)'
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

\echo '--- D2–D14: status/gen/lease/ownership/α fence matrix ---'

DO $$
DECLARE
  org_a uuid := 'c011d0c0-0000-4000-8000-000000000001';
  org_b uuid := 'c011d0c0-0000-4000-8000-000000000011';
  integ_a uuid := 'c011d0c0-0000-4000-8000-000000000003';
  integ_a2 uuid := 'c011d0c0-0000-4000-8000-000000000004';
  integ_b uuid := 'c011d0c0-0000-4000-8000-000000000013';
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
  status text;
  gen bigint;
  vault_present boolean;
  lease_exp timestamptz;
  released boolean;
  cred_count integer;
  own_status text;
  active_handle_count integer;
  acquired boolean;
  token text;
BEGIN
  -- Fixture ownership rows require table-owner DML (service_role has none).
  INSERT INTO public.integration_external_accounts (
    organization_id, integration_id, provider,
    external_account_id, external_handle,
    ownership_status, verified_at
  )
  VALUES (
    org_a, integ_a, 'shopify',
    'gid://shopify/Shop/1dca', 'conn1dc-a.myshopify.com',
    'active', now()
  );

  EXECUTE 'SET ROLE service_role';

  -- Seed integ_a / integ_a2 credentials via α RPC
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

  -- D2: reason/status mismatch → 22023
  BEGIN
    PERFORM *
    FROM public.disconnect_or_revoke_integration_credentials(
      org_a, integ_a, 'shopify', 1, 'revoked', 'merchant_disconnect'
    );
    RAISE EXCEPTION 'D2 expected 22023 mismatch';
  EXCEPTION
    WHEN invalid_parameter_value THEN
      NULL;
  END;

  -- D3: NULL generation with vault present → conflict (no status mutate)
  SELECT d.outcome, d.integration_status, d.vault_present
  INTO outcome, status, vault_present
  FROM public.disconnect_or_revoke_integration_credentials(
    org_a, integ_a, 'shopify', NULL, 'disconnected', 'merchant_disconnect'
  ) AS d;
  IF outcome <> 'conflict' OR vault_present IS NOT TRUE THEN
    RAISE EXCEPTION 'D3 expected conflict+vault, got % / %', outcome, vault_present;
  END IF;
  RESET ROLE;
  SELECT i.status INTO status FROM public.integrations i
  WHERE i.id = integ_a;
  IF status <> 'active' THEN
    RAISE EXCEPTION 'D3 must not mutate status, got %', status;
  END IF;
  EXECUTE 'SET ROLE service_role';

  -- D4: stale generation → conflict
  SELECT d.outcome INTO outcome
  FROM public.disconnect_or_revoke_integration_credentials(
    org_a, integ_a, 'shopify', 99, 'disconnected', 'merchant_disconnect'
  ) AS d;
  IF outcome <> 'conflict' THEN
    RAISE EXCEPTION 'D4 stale gen expected conflict, got %', outcome;
  END IF;

  -- D5: completed merchant disconnect + ownership release
  SELECT
    d.outcome, d.integration_status, d.vault_present,
    d.external_account_released, d.credential_generation
  INTO outcome, status, vault_present, released, gen
  FROM public.disconnect_or_revoke_integration_credentials(
    org_a, integ_a, 'shopify', 1, 'disconnected', 'merchant_disconnect'
  ) AS d;
  IF outcome <> 'completed'
    OR status <> 'disconnected'
    OR vault_present
    OR released IS NOT TRUE
    OR gen IS NOT NULL
  THEN
    RAISE EXCEPTION
      'D5 expected completed disconnected released, got %/%/%/%/%',
      outcome, status, vault_present, released, gen;
  END IF;

  RESET ROLE;
  SELECT count(*) INTO cred_count
  FROM public.integration_credentials
  WHERE integration_id = integ_a;
  IF cred_count <> 0 THEN
    RAISE EXCEPTION 'D5 vault must be cleared';
  END IF;

  SELECT ownership_status INTO own_status
  FROM public.integration_external_accounts
  WHERE integration_id = integ_a;
  IF own_status <> 'disconnected' THEN
    RAISE EXCEPTION 'D5 ownership expected disconnected, got %', own_status;
  END IF;

  SELECT count(*) INTO active_handle_count
  FROM public.integration_external_accounts
  WHERE provider = 'shopify'
    AND external_handle = 'conn1dc-a.myshopify.com'
    AND ownership_status = 'active';
  IF active_handle_count <> 0 THEN
    RAISE EXCEPTION 'D5 active uniqueness must be released';
  END IF;
  EXECUTE 'SET ROLE service_role';

  -- D6: α create resurrection after terminal → fenced
  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_a, integ_a, 'shopify', 'offline_expiring',
    access_ct, access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products', NULL
  ) AS r;
  IF outcome <> 'fenced' THEN
    RAISE EXCEPTION 'D6 α create under disconnected expected fenced, got %',
      outcome;
  END IF;
  RESET ROLE;
  SELECT count(*) INTO cred_count
  FROM public.integration_credentials WHERE integration_id = integ_a;
  IF cred_count <> 0 THEN
    RAISE EXCEPTION 'D6 resurrection must not create vault row';
  END IF;
  EXECUTE 'SET ROLE service_role';

  -- D7: already_terminal idempotent (no cleanup left)
  SELECT d.outcome, d.external_account_released, d.vault_present
  INTO outcome, released, vault_present
  FROM public.disconnect_or_revoke_integration_credentials(
    org_a, integ_a, 'shopify', NULL, 'disconnected', 'merchant_disconnect'
  ) AS d;
  IF outcome <> 'already_terminal'
    OR released
    OR vault_present
  THEN
    RAISE EXCEPTION 'D7 expected already_terminal, got %/%/%',
      outcome, released, vault_present;
  END IF;

  -- D8: disconnected → revoked upgrade
  SELECT d.outcome, d.integration_status INTO outcome, status
  FROM public.disconnect_or_revoke_integration_credentials(
    org_a, integ_a, 'shopify', NULL, 'revoked', 'uninstall'
  ) AS d;
  IF outcome <> 'completed' OR status <> 'revoked' THEN
    RAISE EXCEPTION 'D8 upgrade expected completed/revoked, got %/%',
      outcome, status;
  END IF;

  -- D9: reverse downgrade denied
  SELECT d.outcome, d.integration_status INTO outcome, status
  FROM public.disconnect_or_revoke_integration_credentials(
    org_a, integ_a, 'shopify', NULL, 'disconnected', 'merchant_disconnect'
  ) AS d;
  IF outcome <> 'conflict' OR status <> 'revoked' THEN
    RAISE EXCEPTION 'D9 downgrade expected conflict/revoked, got %/%',
      outcome, status;
  END IF;

  -- D10: lease_held — terminal committed, vault retained, no ownership release
  SELECT a.acquired, a.refresh_lock_token INTO acquired, token
  FROM public.acquire_integration_credential_refresh_lock(
    org_a, integ_a2, 'shopify', 'owner-1d-c', 120
  ) AS a;
  IF acquired IS NOT TRUE OR token IS NULL THEN
    RAISE EXCEPTION 'D10 acquire expected success';
  END IF;

  RESET ROLE;
  INSERT INTO public.integration_external_accounts (
    organization_id, integration_id, provider,
    external_account_id, external_handle,
    ownership_status, verified_at
  )
  VALUES (
    org_a, integ_a2, 'shopify',
    'gid://shopify/Shop/1dca2', 'conn1dc-a2.myshopify.com',
    'active', now()
  );
  EXECUTE 'SET ROLE service_role';

  SELECT
    d.outcome, d.integration_status, d.vault_present,
    d.external_account_released, d.credential_generation
  INTO outcome, status, vault_present, released, gen
  FROM public.disconnect_or_revoke_integration_credentials(
    org_a, integ_a2, 'shopify', 1, 'revoked', 'hard_auth_failure'
  ) AS d;
  IF outcome <> 'lease_held'
    OR status <> 'revoked'
    OR vault_present IS NOT TRUE
    OR released
    OR gen <> 1
  THEN
    RAISE EXCEPTION
      'D10 expected lease_held revoked vault retained, got %/%/%/%/%',
      outcome, status, vault_present, released, gen;
  END IF;

  RESET ROLE;
  SELECT ownership_status INTO own_status
  FROM public.integration_external_accounts WHERE integration_id = integ_a2;
  IF own_status <> 'active' THEN
    RAISE EXCEPTION 'D10 ownership must remain active under lease_held';
  END IF;
  EXECUTE 'SET ROLE service_role';

  -- D10b: α CAS under terminal + lease → fenced (no rewrite)
  SELECT r.outcome INTO outcome
  FROM public.replace_integration_credential_set(
    org_a, integ_a2, 'shopify', 'offline_expiring',
    decode('dd', 'hex'), access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products', 1
  ) AS r;
  IF outcome <> 'fenced' THEN
    RAISE EXCEPTION 'D10b α CAS under revoked expected fenced, got %', outcome;
  END IF;

  -- D10c: β rotate under terminal → fenced
  SELECT r.outcome INTO outcome
  FROM public.rotate_integration_credential_set(
    org_a, integ_a2, 'shopify', 'offline_expiring',
    decode('dd', 'hex'), access_n, access_t,
    refresh_ct, refresh_n, refresh_t,
    dek_ct, dek_n, dek_t,
    1, now() + interval '1 hour', now() + interval '30 days',
    'read_products', 'owner-1d-c', token, 1
  ) AS r;
  IF outcome <> 'fenced' THEN
    RAISE EXCEPTION 'D10c rotate under revoked expected fenced, got %', outcome;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.load_integration_credential_envelope(
      org_a, integ_a2, 'shopify'
    ) AS loaded
    WHERE loaded.access_ciphertext = access_ct
      AND loaded.credential_generation = 1
  ) THEN
    RAISE EXCEPTION 'D10c ciphertext must be preserved';
  END IF;

  -- D11: expiry + authorized retry → completed + ownership release
  -- Lease time-travel requires table-owner DML.
  RESET ROLE;
  UPDATE public.integration_credentials
  SET
    refresh_lock_claimed_at = clock_timestamp() - interval '120 seconds',
    refresh_lock_expires_at = clock_timestamp() - interval '60 seconds'
  WHERE integration_id = integ_a2;
  EXECUTE 'SET ROLE service_role';

  SELECT
    d.outcome, d.vault_present, d.external_account_released
  INTO outcome, vault_present, released
  FROM public.disconnect_or_revoke_integration_credentials(
    org_a, integ_a2, 'shopify', 1, 'revoked', 'uninstall'
  ) AS d;
  IF outcome <> 'completed' OR vault_present OR released IS NOT TRUE THEN
    RAISE EXCEPTION 'D11 retry expected completed released, got %/%/%',
      outcome, vault_present, released;
  END IF;

  -- D12: vault absent + ownership still active → completed + release
  RESET ROLE;
  UPDATE public.integrations
  SET status = 'active'
  WHERE id = integ_b;

  INSERT INTO public.integration_external_accounts (
    organization_id, integration_id, provider,
    external_account_id, external_handle,
    ownership_status, verified_at
  )
  VALUES (
    org_b, integ_b, 'shopify',
    'gid://shopify/Shop/1dcb', 'conn1dc-b.myshopify.com',
    'active', now()
  );
  EXECUTE 'SET ROLE service_role';

  SELECT
    d.outcome, d.external_account_released, d.vault_present,
    d.integration_status
  INTO outcome, released, vault_present, status
  FROM public.disconnect_or_revoke_integration_credentials(
    org_b, integ_b, 'shopify', NULL, 'disconnected', 'merchant_disconnect'
  ) AS d;
  IF outcome <> 'completed'
    OR released IS NOT TRUE
    OR vault_present
    OR status <> 'disconnected'
  THEN
    RAISE EXCEPTION 'D12 ownership-only cleanup expected completed, got %/%/%/%',
      outcome, released, vault_present, status;
  END IF;

  -- D13: non-NULL gen when vault absent → conflict
  SELECT d.outcome INTO outcome
  FROM public.disconnect_or_revoke_integration_credentials(
    org_b, integ_b, 'shopify', 1, 'disconnected', 'merchant_disconnect'
  ) AS d;
  IF outcome <> 'conflict' THEN
    RAISE EXCEPTION 'D13 non-NULL gen absent vault expected conflict, got %',
      outcome;
  END IF;

  -- D14: not_found
  SELECT d.outcome INTO outcome
  FROM public.disconnect_or_revoke_integration_credentials(
    org_a, 'c011d0c0-0000-4000-8000-999999999999'::uuid,
    'shopify', NULL, 'disconnected', 'merchant_disconnect'
  ) AS d;
  IF outcome <> 'not_found' THEN
    RAISE EXCEPTION 'D14 expected not_found, got %', outcome;
  END IF;

  RAISE NOTICE 'D2–D14 PASS';
END;
$$;

\echo '--- SHOPIFY-CONN-1d-C ADVERSARIAL PASS ---'

COMMIT;
