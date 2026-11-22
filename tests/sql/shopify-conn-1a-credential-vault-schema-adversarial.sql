\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== SHOPIFY-CONN-1a CREDENTIAL VAULT SCHEMA ADVERSARIAL ==='
\echo 'Coverage: V6, V7 (schema grants), V9, V10, V15 schema portions'
\echo 'NOT YET TESTED in this file: V1–V5, V8, V11–V14 (crypto/runtime)'

\set org_a 'c011a000-0000-4000-8000-000000000001'
\set org_b 'c011a000-0000-4000-8000-000000000011'
\set store_a 'c011a000-0000-4000-8000-000000000002'
\set store_b 'c011a000-0000-4000-8000-000000000012'
\set integ_a 'c011a000-0000-4000-8000-000000000003'
\set integ_a2 'c011a000-0000-4000-8000-000000000004'
\set integ_b 'c011a000-0000-4000-8000-000000000013'
\set cred_a 'c011a000-0000-4000-8000-000000000021'
\set acct_a 'c011a000-0000-4000-8000-000000000031'

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'CONN-1a Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'CONN-1a Org B', 'USD', 'UTC');

INSERT INTO public.stores (
  id, organization_id, name, status, currency, timezone
)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'CONN-1a Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'CONN-1a Store B', 'active', 'USD', 'UTC');

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
  );

\echo '--- Schema objects exist ---'

DO $$
BEGIN
  IF to_regclass('public.integration_credentials') IS NULL THEN
    RAISE EXCEPTION 'integration_credentials missing';
  END IF;
  IF to_regclass('public.integration_external_accounts') IS NULL THEN
    RAISE EXCEPTION 'integration_external_accounts missing';
  END IF;
END;
$$;

\echo '--- V6/V7: effective privileges (anon/authenticated/service_role) ---'

DO $$
DECLARE
  role_name text;
  priv text;
  allowed boolean;
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
END;
$$;

\echo '--- Trigger function EXECUTE revoked from PUBLIC/browser/service_role ---'

DO $$
DECLARE
  role_name text;
  allowed boolean;
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.prevent_integration_credential_identity_reassignment()',
    'public.prevent_integration_external_account_identity_reassignment()'
  ]
  LOOP
    FOREACH role_name IN ARRAY ARRAY[
      'public', 'anon', 'authenticated', 'service_role'
    ]
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

\echo '--- No plaintext token columns; envelope columns present ---'

DO $$
DECLARE
  bad_col text;
  missing text;
BEGIN
  SELECT c.column_name
  INTO bad_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'integration_credentials'
    AND c.column_name IN (
      'access_token',
      'refresh_token',
      'access_token_plaintext',
      'refresh_token_plaintext',
      'token',
      'plaintext_token',
      'nonce'
    )
  LIMIT 1;

  IF bad_col IS NOT NULL THEN
    RAISE EXCEPTION 'forbidden/ambiguous token column: %', bad_col;
  END IF;

  SELECT c.column_name
  INTO missing
  FROM (
    VALUES
      ('access_nonce'),
      ('access_auth_tag'),
      ('refresh_nonce'),
      ('refresh_auth_tag'),
      ('dek_wrap_nonce'),
      ('dek_wrap_auth_tag')
  ) AS required(column_name)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'integration_credentials'
   AND c.column_name = required.column_name
  WHERE c.column_name IS NULL
  LIMIT 1;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'missing envelope column: %', missing;
  END IF;
END;
$$;

\echo '--- RLS enabled; no merchant policies ---'

DO $$
DECLARE
  creds_rls boolean;
  accts_rls boolean;
  policy_count integer;
BEGIN
  SELECT c.relrowsecurity
  INTO creds_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'integration_credentials';

  SELECT c.relrowsecurity
  INTO accts_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'integration_external_accounts';

  IF creds_rls IS DISTINCT FROM true OR accts_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RLS must be enabled on vault tables';
  END IF;

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
      'vault tables must have zero browser policies, found %',
      policy_count;
  END IF;
END;
$$;

\echo '--- Happy path: credential + ownership insert ---'

INSERT INTO public.integration_credentials (
  id,
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
  access_expires_at,
  refresh_expires_at,
  scope,
  last_rotated_at
)
VALUES (
  :'cred_a'::uuid,
  :'org_a'::uuid,
  :'integ_a'::uuid,
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
  now() + interval '1 hour',
  now() + interval '30 days',
  'read_products',
  now()
);

INSERT INTO public.integration_external_accounts (
  id,
  organization_id,
  integration_id,
  provider,
  external_account_id,
  external_handle,
  ownership_status,
  verified_at
)
VALUES (
  :'acct_a'::uuid,
  :'org_a'::uuid,
  :'integ_a'::uuid,
  'shopify',
  'gid://shopify/Shop/1001',
  'acme-store.myshopify.com',
  'active',
  now()
);

\echo '--- Active ownership requires verified_at DENY ---'

DO $$
BEGIN
  BEGIN
    INSERT INTO public.integration_external_accounts (
      organization_id,
      integration_id,
      provider,
      external_account_id,
      external_handle,
      ownership_status,
      verified_at
    )
    VALUES (
      'c011a000-0000-4000-8000-000000000001'::uuid,
      'c011a000-0000-4000-8000-000000000004'::uuid,
      'shopify',
      'gid://shopify/Shop/7777',
      'unverified-store.myshopify.com',
      'active',
      NULL
    );
    RAISE EXCEPTION 'expected active-without-verified_at DENY';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END;
$$;

\echo '--- Offline pair completeness DENY ---'

DO $$
BEGIN
  BEGIN
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
      key_version
    )
    VALUES (
      'c011a000-0000-4000-8000-000000000001'::uuid,
      'c011a000-0000-4000-8000-000000000004'::uuid,
      'shopify',
      'offline_expiring',
      decode('11', 'hex'),
      decode('0102030405060708090a0b0c', 'hex'),
      decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex'),
      NULL,
      NULL,
      NULL,
      decode('22', 'hex'),
      decode('2122232425262728292a2b2c', 'hex'),
      decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex'),
      1
    );
    RAISE EXCEPTION 'expected offline pair completeness DENY';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END;
$$;

\echo '--- Shared/short nonce envelope DENY ---'

DO $$
BEGIN
  BEGIN
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
      key_version
    )
    VALUES (
      'c011a000-0000-4000-8000-000000000001'::uuid,
      'c011a000-0000-4000-8000-000000000004'::uuid,
      'shopify',
      'offline_expiring',
      decode('11', 'hex'),
      decode('abcd', 'hex'),
      decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex'),
      decode('22', 'hex'),
      decode('1112131415161718191a1b1c', 'hex'),
      decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex'),
      decode('33', 'hex'),
      decode('2122232425262728292a2b2c', 'hex'),
      decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex'),
      1
    );
    RAISE EXCEPTION 'expected short access_nonce DENY';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END;
$$;

\echo '--- V9: cross-org FK insert DENY ---'

DO $$
BEGIN
  BEGIN
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
      key_version
    )
    VALUES (
      'c011a000-0000-4000-8000-000000000011'::uuid,
      'c011a000-0000-4000-8000-000000000003'::uuid,
      'shopify',
      'offline_expiring',
      decode('11', 'hex'),
      decode('0102030405060708090a0b0c', 'hex'),
      decode('a1a2a3a4a5a6a7a8a9aaabacadaeafb0', 'hex'),
      decode('22', 'hex'),
      decode('1112131415161718191a1b1c', 'hex'),
      decode('b1b2b3b4b5b6b7b8b9babbbcbdbebfc0', 'hex'),
      decode('33', 'hex'),
      decode('2122232425262728292a2b2c', 'hex'),
      decode('c1c2c3c4c5c6c7c8c9cacbcccdcecfd0', 'hex'),
      1
    );
    RAISE EXCEPTION 'expected cross-org credential FK DENY';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.integration_external_accounts (
      organization_id,
      integration_id,
      provider,
      external_account_id,
      external_handle,
      ownership_status,
      verified_at
    )
    VALUES (
      'c011a000-0000-4000-8000-000000000011'::uuid,
      'c011a000-0000-4000-8000-000000000003'::uuid,
      'shopify',
      'gid://shopify/Shop/9999',
      'other-store.myshopify.com',
      'active',
      now()
    );
    RAISE EXCEPTION 'expected cross-org external account FK DENY';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END;
$$;

\echo '--- V10: active shop identity uniqueness / cross-org DENY ---'

DO $$
BEGIN
  BEGIN
    INSERT INTO public.integration_external_accounts (
      organization_id,
      integration_id,
      provider,
      external_account_id,
      external_handle,
      ownership_status,
      verified_at
    )
    VALUES (
      'c011a000-0000-4000-8000-000000000011'::uuid,
      'c011a000-0000-4000-8000-000000000013'::uuid,
      'shopify',
      'gid://shopify/Shop/1001',
      'different-store.myshopify.com',
      'active',
      now()
    );
    RAISE EXCEPTION 'expected active external_account_id uniqueness DENY';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.integration_external_accounts (
      organization_id,
      integration_id,
      provider,
      external_account_id,
      external_handle,
      ownership_status,
      verified_at
    )
    VALUES (
      'c011a000-0000-4000-8000-000000000011'::uuid,
      'c011a000-0000-4000-8000-000000000013'::uuid,
      'shopify',
      'gid://shopify/Shop/2002',
      'acme-store.myshopify.com',
      'active',
      now()
    );
    RAISE EXCEPTION 'expected active external_handle uniqueness DENY';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END;
$$;

\echo '--- Revoked/disconnected ownership releases uniqueness ---'

UPDATE public.integration_external_accounts
SET
  ownership_status = 'revoked',
  revoked_at = now()
WHERE id = :'acct_a'::uuid;

INSERT INTO public.integration_external_accounts (
  organization_id,
  integration_id,
  provider,
  external_account_id,
  external_handle,
  ownership_status,
  verified_at
)
VALUES (
  :'org_b'::uuid,
  :'integ_b'::uuid,
  'shopify',
  'gid://shopify/Shop/1001',
  'acme-store.myshopify.com',
  'active',
  now()
);

UPDATE public.integration_external_accounts
SET
  ownership_status = 'disconnected',
  revoked_at = now()
WHERE organization_id = :'org_b'::uuid
  AND integration_id = :'integ_b'::uuid;

INSERT INTO public.integration_external_accounts (
  organization_id,
  integration_id,
  provider,
  external_account_id,
  external_handle,
  ownership_status,
  verified_at
)
VALUES (
  :'org_a'::uuid,
  :'integ_a2'::uuid,
  'shopify',
  'gid://shopify/Shop/1001',
  'acme-store.myshopify.com',
  'active',
  now()
);

\echo '--- Identity immutability DENY (trigger still fires for owner) ---'

DO $$
BEGIN
  BEGIN
    UPDATE public.integration_credentials
    SET organization_id = 'c011a000-0000-4000-8000-000000000011'::uuid
    WHERE id = 'c011a000-0000-4000-8000-000000000021'::uuid;
    RAISE EXCEPTION 'expected credential org reassignment DENY';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT ILIKE '%cannot be reassigned%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.integration_credentials
    SET provider = 'woocommerce'
    WHERE id = 'c011a000-0000-4000-8000-000000000021'::uuid;
    RAISE EXCEPTION 'expected credential provider reassignment DENY';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT ILIKE '%cannot be reassigned%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.integration_external_accounts
    SET organization_id = 'c011a000-0000-4000-8000-000000000011'::uuid
    WHERE integration_id = 'c011a000-0000-4000-8000-000000000004'::uuid;
    RAISE EXCEPTION 'expected external account org reassignment DENY';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT ILIKE '%cannot be reassigned%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

\echo '--- One credential set per integration ---'

DO $$
BEGIN
  BEGIN
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
      key_version
    )
    VALUES (
      'c011a000-0000-4000-8000-000000000001'::uuid,
      'c011a000-0000-4000-8000-000000000003'::uuid,
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
      1
    );
    RAISE EXCEPTION 'expected one-credential-per-integration DENY';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END;
$$;

\echo '--- Shop domain normalization DENY ---'

DELETE FROM public.integration_external_accounts
WHERE ownership_status IN ('revoked', 'disconnected');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.integration_external_accounts (
      organization_id,
      integration_id,
      provider,
      external_handle,
      ownership_status,
      verified_at
    )
    VALUES (
      'c011a000-0000-4000-8000-000000000011'::uuid,
      'c011a000-0000-4000-8000-000000000013'::uuid,
      'shopify',
      'Acme-Store.myshopify.com',
      'active',
      now()
    );
    RAISE EXCEPTION 'expected uppercase domain DENY';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.integration_external_accounts (
      organization_id,
      integration_id,
      provider,
      external_handle,
      ownership_status,
      verified_at
    )
    VALUES (
      'c011a000-0000-4000-8000-000000000011'::uuid,
      'c011a000-0000-4000-8000-000000000013'::uuid,
      'shopify',
      'not-a-myshopify-domain.example.com',
      'active',
      now()
    );
    RAISE EXCEPTION 'expected invalid shopify domain DENY';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END;
$$;

\echo '--- CONN-1a adversarial checks PASS ---'

ROLLBACK;
