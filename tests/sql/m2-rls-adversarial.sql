\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M2.7 RLS + CROSS-TENANT ADVERSARIAL VERIFICATION ==='

\set user_a 'aaaaaaaa-aaaa-4aaa-8aaa-277777777701'
\set user_b 'bbbbbbbb-bbbb-4bbb-8bbb-277777777702'

\set org_a 'aaaaaaaa-aaaa-4aaa-8aaa-277777777711'
\set org_b 'bbbbbbbb-bbbb-4bbb-8bbb-277777777712'

\set store_a 'aaaaaaaa-aaaa-4aaa-8aaa-277777777721'
\set store_b 'bbbbbbbb-bbbb-4bbb-8bbb-277777777722'

\set location_a 'aaaaaaaa-aaaa-4aaa-8aaa-277777777731'
\set location_b 'bbbbbbbb-bbbb-4bbb-8bbb-277777777732'

\set product_a 'aaaaaaaa-aaaa-4aaa-8aaa-277777777741'
\set product_b 'bbbbbbbb-bbbb-4bbb-8bbb-277777777742'

\set variant_a 'aaaaaaaa-aaaa-4aaa-8aaa-277777777751'
\set variant_b 'bbbbbbbb-bbbb-4bbb-8bbb-277777777752'

\set order_a 'aaaaaaaa-aaaa-4aaa-8aaa-277777777761'
\set order_b 'bbbbbbbb-bbbb-4bbb-8bbb-277777777762'

\set supplier_a 'aaaaaaaa-aaaa-4aaa-8aaa-277777777771'
\set supplier_b 'bbbbbbbb-bbbb-4bbb-8bbb-277777777772'

\set integration_a 'aaaaaaaa-aaaa-4aaa-8aaa-277777777781'
\set integration_b 'bbbbbbbb-bbbb-4bbb-8bbb-277777777782'

-- ---------------------------------------------------------------------------
-- Auth identities.
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
VALUES
(
  :'user_a'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'm27-a@example.test',
  '',
  pg_catalog.now(),
  pg_catalog.now(),
  pg_catalog.now()
),
(
  :'user_b'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'm27-b@example.test',
  '',
  pg_catalog.now(),
  pg_catalog.now(),
  pg_catalog.now()
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
  'M2.7 Org A',
  'USD',
  'UTC'
),
(
  :'org_b'::uuid,
  'M2.7 Org B',
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
  'M2.7 Store A',
  'active',
  'USD',
  'UTC'
),
(
  :'store_b'::uuid,
  :'org_b'::uuid,
  'M2.7 Store B',
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
  'M2.7 Location A',
  'active'
),
(
  :'location_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'M2.7 Location B',
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
  'Org A Product',
  'active'
),
(
  :'product_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'Org B Product',
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
  'M27-A',
  'active'
),
(
  :'variant_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'product_b'::uuid,
  'M27-B',
  'active'
);

INSERT INTO public.inventory_snapshots (
  organization_id,
  store_id,
  location_id,
  variant_id,
  observed_at,
  on_hand_quantity,
  source
)
VALUES
(
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'location_a'::uuid,
  :'variant_a'::uuid,
  pg_catalog.now(),
  10,
  'csv'
),
(
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'location_b'::uuid,
  :'variant_b'::uuid,
  pg_catalog.now(),
  20,
  'csv'
);

INSERT INTO public.orders (
  id,
  organization_id,
  store_id,
  status,
  ordered_at,
  currency,
  source
)
VALUES
(
  :'order_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  'completed',
  pg_catalog.now(),
  'USD',
  'csv'
),
(
  :'order_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'completed',
  pg_catalog.now(),
  'USD',
  'csv'
);

INSERT INTO public.order_items (
  organization_id,
  store_id,
  order_id,
  variant_id,
  quantity
)
VALUES
(
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'order_a'::uuid,
  :'variant_a'::uuid,
  1
),
(
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'order_b'::uuid,
  :'variant_b'::uuid,
  1
);

INSERT INTO public.return_refunds (
  organization_id,
  store_id,
  order_id,
  variant_id,
  returned_quantity,
  occurred_at
)
VALUES
(
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'order_a'::uuid,
  :'variant_a'::uuid,
  0,
  pg_catalog.now()
),
(
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'order_b'::uuid,
  :'variant_b'::uuid,
  0,
  pg_catalog.now()
);

INSERT INTO public.suppliers (
  id,
  organization_id,
  name
)
VALUES
(
  :'supplier_a'::uuid,
  :'org_a'::uuid,
  'Supplier A'
),
(
  :'supplier_b'::uuid,
  :'org_b'::uuid,
  'Supplier B'
);

INSERT INTO public.supplier_products (
  organization_id,
  supplier_id,
  variant_id,
  preferred
)
VALUES
(
  :'org_a'::uuid,
  :'supplier_a'::uuid,
  :'variant_a'::uuid,
  true
),
(
  :'org_b'::uuid,
  :'supplier_b'::uuid,
  :'variant_b'::uuid,
  true
);

INSERT INTO public.purchase_orders (
  organization_id,
  store_id,
  supplier_id,
  status,
  source
)
VALUES
(
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'supplier_a'::uuid,
  'draft',
  'csv'
),
(
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'supplier_b'::uuid,
  'draft',
  'csv'
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
),
(
  :'integration_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'csv',
  'active'
);

INSERT INTO public.provider_bindings (
  organization_id,
  integration_id,
  provider,
  resource_type,
  canonical_entity_id,
  external_id
)
VALUES
(
  :'org_a'::uuid,
  :'integration_a'::uuid,
  'csv',
  'product_variant',
  :'variant_a'::uuid,
  'M27-A'
),
(
  :'org_b'::uuid,
  :'integration_b'::uuid,
  'csv',
  'product_variant',
  :'variant_b'::uuid,
  'M27-B'
);

INSERT INTO public.sync_runs (
  organization_id,
  store_id,
  integration_id,
  idempotency_key,
  status,
  started_at
)
VALUES
(
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'integration_a'::uuid,
  'm27-sync-a',
  'completed',
  pg_catalog.now()
),
(
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'integration_b'::uuid,
  'm27-sync-b',
  'completed',
  pg_catalog.now()
);

\echo 'PASS: two-tenant M2 fixture graph inserted'

-- ---------------------------------------------------------------------------
-- RLS enabled + exactly 13 M2 policies.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  disabled_count integer;
  policy_count integer;
BEGIN
  SELECT count(*)
  INTO disabled_count
  FROM pg_class c
  JOIN pg_namespace n
    ON n.oid = c.relnamespace
  WHERE
    n.nspname = 'public'
    AND c.relname IN (
      'products',
      'product_variants',
      'inventory_snapshots',
      'orders',
      'order_items',
      'return_refunds',
      'suppliers',
      'supplier_products',
      'purchase_orders',
      'purchase_order_items',
      'integrations',
      'provider_bindings',
      'sync_runs'
    )
    AND NOT c.relrowsecurity;

  IF disabled_count <> 0 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: one or more M2 tables have RLS disabled';
  END IF;

  SELECT count(*)
  INTO policy_count
  FROM pg_policies
  WHERE
    schemaname = 'public'
    AND tablename IN (
      'products',
      'product_variants',
      'inventory_snapshots',
      'orders',
      'order_items',
      'return_refunds',
      'suppliers',
      'supplier_products',
      'purchase_orders',
      'purchase_order_items',
      'integrations',
      'provider_bindings',
      'sync_runs'
    );

  IF policy_count <> 13 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: expected 13 M2 policies, found %',
      policy_count;
  END IF;
END
$$;

\echo 'PASS: RLS enabled on all 13 M2 tables'
\echo 'PASS: exactly 13 M2 SELECT policies installed'

-- ---------------------------------------------------------------------------
-- ACL layer.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  anon_privileges integer;
  authenticated_non_select integer;
  authenticated_selects integer;
BEGIN
  SELECT count(*)
  INTO anon_privileges
  FROM information_schema.role_table_grants
  WHERE
    table_schema = 'public'
    AND grantee = 'anon'
    AND table_name IN (
      'products',
      'product_variants',
      'inventory_snapshots',
      'orders',
      'order_items',
      'return_refunds',
      'suppliers',
      'supplier_products',
      'purchase_orders',
      'purchase_order_items',
      'integrations',
      'provider_bindings',
      'sync_runs'
    );

  IF anon_privileges <> 0 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: anon still has M2 privileges';
  END IF;

  SELECT count(*)
  INTO authenticated_non_select
  FROM information_schema.role_table_grants
  WHERE
    table_schema = 'public'
    AND grantee = 'authenticated'
    AND table_name IN (
      'products',
      'product_variants',
      'inventory_snapshots',
      'orders',
      'order_items',
      'return_refunds',
      'suppliers',
      'supplier_products',
      'purchase_orders',
      'purchase_order_items',
      'integrations',
      'provider_bindings',
      'sync_runs'
    )
    AND privilege_type <> 'SELECT';

  IF authenticated_non_select <> 0 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: authenticated still has non-SELECT M2 privileges';
  END IF;

  SELECT count(*)
  INTO authenticated_selects
  FROM information_schema.role_table_grants
  WHERE
    table_schema = 'public'
    AND grantee = 'authenticated'
    AND table_name IN (
      'products',
      'product_variants',
      'inventory_snapshots',
      'orders',
      'order_items',
      'return_refunds',
      'suppliers',
      'supplier_products',
      'purchase_orders',
      'purchase_order_items',
      'integrations',
      'provider_bindings',
      'sync_runs'
    )
    AND privilege_type = 'SELECT';

  IF authenticated_selects <> 13 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: expected 13 authenticated SELECT grants, found %',
      authenticated_selects;
  END IF;
END
$$;

\echo 'PASS: anon has zero M2 table privileges'
\echo 'PASS: authenticated has SELECT-only M2 privileges'

-- ---------------------------------------------------------------------------
-- User A can see Org A and cannot see Org B.
-- ---------------------------------------------------------------------------

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
  count_a integer;
  count_b integer;
BEGIN
  SELECT count(*)
  INTO count_a
  FROM public.products
  WHERE organization_id =
    'aaaaaaaa-aaaa-4aaa-8aaa-277777777711'::uuid;

  SELECT count(*)
  INTO count_b
  FROM public.products
  WHERE organization_id =
    'bbbbbbbb-bbbb-4bbb-8bbb-277777777712'::uuid;

  IF count_a <> 1 OR count_b <> 0 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: products tenant isolation failed';
  END IF;
END
$$;

\echo 'PASS: user A sees own products and not tenant B products'

DO $$
DECLARE
  visible integer;
BEGIN
  SELECT count(*)
  INTO visible
  FROM public.inventory_snapshots;

  IF visible <> 1 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: snapshot tenant isolation failed';
  END IF;
END
$$;

\echo 'PASS: immutable inventory history tenant-isolated'

DO $$
DECLARE
  visible integer;
BEGIN
  SELECT count(*)
  INTO visible
  FROM public.orders;

  IF visible <> 1 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: order history tenant isolation failed';
  END IF;
END
$$;

\echo 'PASS: order history tenant-isolated'

DO $$
DECLARE
  visible integer;
BEGIN
  SELECT count(*)
  INTO visible
  FROM public.suppliers;

  IF visible <> 1 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: supplier tenant isolation failed';
  END IF;
END
$$;

\echo 'PASS: supplier current-state tenant-isolated'

DO $$
DECLARE
  visible integer;
BEGIN
  SELECT count(*)
  INTO visible
  FROM public.integrations;

  IF visible <> 1 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: integration tenant isolation failed';
  END IF;
END
$$;

\echo 'PASS: integrations tenant-isolated'

DO $$
DECLARE
  visible integer;
BEGIN
  SELECT count(*)
  INTO visible
  FROM public.provider_bindings;

  IF visible <> 1 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: provider binding tenant isolation failed';
  END IF;
END
$$;

\echo 'PASS: provider bindings tenant-isolated'

DO $$
DECLARE
  visible integer;
BEGIN
  SELECT count(*)
  INTO visible
  FROM public.sync_runs;

  IF visible <> 1 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: sync-run tenant isolation failed';
  END IF;
END
$$;

\echo 'PASS: sync-run history tenant-isolated'

-- ---------------------------------------------------------------------------
-- Direct browser mutations must fail at ACL boundary.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.products (
      organization_id,
      store_id,
      title,
      status
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-277777777711'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-277777777721'::uuid,
      'Browser Write',
      'active'
    );

    RAISE EXCEPTION
      'M2.7 FAIL: authenticated product INSERT succeeded';

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: authenticated INSERT denied'

DO $$
BEGIN
  BEGIN
    UPDATE public.products
    SET title = 'Browser Rewrite'
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-277777777741'::uuid;

    RAISE EXCEPTION
      'M2.7 FAIL: authenticated product UPDATE succeeded';

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: authenticated UPDATE denied'

DO $$
BEGIN
  BEGIN
    DELETE FROM public.products
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-277777777741'::uuid;

    RAISE EXCEPTION
      'M2.7 FAIL: authenticated product DELETE succeeded';

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: authenticated DELETE denied'

-- History writes denied too.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.sync_runs (
      organization_id,
      store_id,
      integration_id,
      idempotency_key,
      status,
      started_at
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-277777777711'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-277777777721'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-277777777781'::uuid,
      'browser-sync',
      'queued',
      pg_catalog.now()
    );

    RAISE EXCEPTION
      'M2.7 FAIL: authenticated history INSERT succeeded';

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: authenticated history mutation denied'

RESET ROLE;

-- ---------------------------------------------------------------------------
-- No membership means no rows.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  '99999999-9999-4999-8999-999999999999',
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
  SELECT count(*)
  INTO visible
  FROM public.products;

  IF visible <> 0 THEN
    RAISE EXCEPTION
      'M2.7 FAIL: non-member can see M2 tenant rows';
  END IF;
END
$$;

\echo 'PASS: authenticated non-member sees zero M2 rows'

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Anonymous role has no table privilege.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM 1
    FROM public.products
    LIMIT 1;

    RAISE EXCEPTION
      'M2.7 FAIL: anon SELECT unexpectedly succeeded';

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: anonymous M2 access denied'

RESET ROLE;

\echo ''
\echo '=== M2.7 RLS + CROSS-TENANT ADVERSARIAL CHECKS PASS ==='

ROLLBACK;
