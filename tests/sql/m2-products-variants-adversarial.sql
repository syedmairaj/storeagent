\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M2.2 PRODUCTS + VARIANTS ADVERSARIAL VERIFICATION ==='

\set org_a 'aaaaaaaa-aaaa-4aaa-8aaa-222222222201'
\set org_b 'bbbbbbbb-bbbb-4bbb-8bbb-222222222202'

\set store_a 'aaaaaaaa-aaaa-4aaa-8aaa-222222222211'
\set store_b 'bbbbbbbb-bbbb-4bbb-8bbb-222222222212'

\set product_a 'aaaaaaaa-aaaa-4aaa-8aaa-222222222221'
\set product_b 'bbbbbbbb-bbbb-4bbb-8bbb-222222222222'

\set variant_a 'aaaaaaaa-aaaa-4aaa-8aaa-222222222231'
\set variant_a2 'aaaaaaaa-aaaa-4aaa-8aaa-222222222232'

-- ---------------------------------------------------------------------------
-- Foundation fixtures.
-- ---------------------------------------------------------------------------

INSERT INTO public.organizations (
  id,
  name,
  default_currency,
  timezone
)
VALUES
(
  :'org_a'::uuid,
  'M2.2 Org A',
  'USD',
  'UTC'
),
(
  :'org_b'::uuid,
  'M2.2 Org B',
  'USD',
  'UTC'
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
  'M2.2 Store A',
  'active',
  'USD',
  'UTC'
),
(
  :'store_b'::uuid,
  :'org_b'::uuid,
  'M2.2 Store B',
  'active',
  'USD',
  'UTC'
);

-- ---------------------------------------------------------------------------
-- Valid canonical products.
-- ---------------------------------------------------------------------------

INSERT INTO public.products (
  id,
  organization_id,
  store_id,
  title,
  brand,
  category,
  status
)
VALUES
(
  :'product_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  'Product A',
  null,
  null,
  'active'
),
(
  :'product_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'Product B',
  'Brand B',
  'Category B',
  'draft'
);

\echo 'PASS: valid canonical products inserted'

-- ---------------------------------------------------------------------------
-- Cross-organization/store product ownership must fail.
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
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222201'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-222222222212'::uuid,
      'Cross tenant product',
      'active'
    );

    RAISE EXCEPTION
      'M2.2 FAIL: cross-organization product/store ownership succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-organization product/store ownership rejected'

-- ---------------------------------------------------------------------------
-- Valid variant with unknown commercial values.
-- ---------------------------------------------------------------------------

INSERT INTO public.product_variants (
  id,
  organization_id,
  store_id,
  product_id,
  sku,
  barcode,
  title,
  status,
  cost_amount,
  selling_price_amount,
  currency
)
VALUES (
  :'variant_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'product_a'::uuid,
  'SKU-DUPLICATE',
  null,
  null,
  'active',
  null,
  null,
  null
);

\echo 'PASS: variant with unknown commercial values inserted'

DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*)
  INTO bad_count
  FROM public.product_variants
  WHERE
    id =
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222231'::uuid
    AND (
      cost_amount is not null
      OR selling_price_amount is not null
      OR currency is not null
    );

  IF bad_count <> 0 THEN
    RAISE EXCEPTION
      'M2.2 FAIL: unknown commercial values were not preserved as NULL';
  END IF;
END
$$;

\echo 'PASS: NULL commercial values remain unknown'

-- ---------------------------------------------------------------------------
-- Known zero must remain distinct from NULL.
-- Duplicate SKU must also remain permitted.
-- ---------------------------------------------------------------------------

INSERT INTO public.product_variants (
  id,
  organization_id,
  store_id,
  product_id,
  sku,
  status,
  cost_amount,
  selling_price_amount,
  currency
)
VALUES (
  :'variant_a2'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'product_a'::uuid,
  'SKU-DUPLICATE',
  'active',
  0,
  0,
  'USD'
);

DO $$
DECLARE
  duplicate_count integer;
  zero_count integer;
BEGIN
  SELECT count(*)
  INTO duplicate_count
  FROM public.product_variants
  WHERE
    organization_id =
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222201'::uuid
    AND
    store_id =
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222211'::uuid
    AND
    sku = 'SKU-DUPLICATE';

  IF duplicate_count <> 2 THEN
    RAISE EXCEPTION
      'M2.2 FAIL: duplicate SKU policy changed';
  END IF;

  SELECT count(*)
  INTO zero_count
  FROM public.product_variants
  WHERE
    id =
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222232'::uuid
    AND cost_amount = 0
    AND selling_price_amount = 0;

  IF zero_count <> 1 THEN
    RAISE EXCEPTION
      'M2.2 FAIL: known zero commercial values were not preserved';
  END IF;
END
$$;

\echo 'PASS: duplicate SKU accepted'
\echo 'PASS: known zero remains distinct from NULL'

-- ---------------------------------------------------------------------------
-- Cross-organization product linkage must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.product_variants (
      organization_id,
      store_id,
      product_id,
      sku,
      status
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222201'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222211'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-222222222222'::uuid,
      'INVALID-CROSS-PRODUCT',
      'active'
    );

    RAISE EXCEPTION
      'M2.2 FAIL: cross-organization product variant linkage succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-organization variant/product ownership rejected'

-- ---------------------------------------------------------------------------
-- Cross-store variant ownership must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.product_variants (
      organization_id,
      store_id,
      product_id,
      sku,
      status
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222201'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-222222222212'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222221'::uuid,
      'INVALID-CROSS-STORE',
      'active'
    );

    RAISE EXCEPTION
      'M2.2 FAIL: cross-store variant ownership succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-store variant ownership rejected'

-- ---------------------------------------------------------------------------
-- Negative commercial values must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.product_variants (
      organization_id,
      store_id,
      product_id,
      sku,
      status,
      cost_amount
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222201'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222211'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222221'::uuid,
      'NEGATIVE-COST',
      'active',
      -1
    );

    RAISE EXCEPTION
      'M2.2 FAIL: negative cost succeeded';

  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: negative commercial value rejected'

-- ---------------------------------------------------------------------------
-- Blank canonical identity must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.product_variants (
      organization_id,
      store_id,
      product_id,
      sku,
      status
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222201'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222211'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-222222222221'::uuid,
      '   ',
      'active'
    );

    RAISE EXCEPTION
      'M2.2 FAIL: blank SKU succeeded';

  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: blank SKU rejected'

-- ---------------------------------------------------------------------------
-- RLS must already be enabled, while M2.7 policies must not exist yet.
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
      'product_variants'
    )
    AND NOT c.relrowsecurity;

  IF disabled_count <> 0 THEN
    RAISE EXCEPTION
      'M2.2 FAIL: product RLS is not enabled';
  END IF;

  SELECT count(*)
  INTO policy_count
  FROM pg_policies
  WHERE
    schemaname = 'public'
    AND tablename IN (
      'products',
      'product_variants'
    );

  IF policy_count <> 0 THEN
    RAISE EXCEPTION
      'M2.2 FAIL: M2.7 product policies were introduced prematurely';
  END IF;
END
$$;

\echo 'PASS: product RLS enabled fail-closed'
\echo 'PASS: zero M2.7 product policies installed'

-- ---------------------------------------------------------------------------
-- Authenticated client still sees no product rows until M2.7.
-- Privilege denial or zero visible rows are both fail-closed.
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
  visible_count integer;
BEGIN
  BEGIN
    SELECT count(*)
    INTO visible_count
    FROM public.products;

    IF visible_count <> 0 THEN
      RAISE EXCEPTION
        'M2.2 FAIL: authenticated client can read products before M2.7';
    END IF;

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: authenticated product access remains fail-closed before M2.7'

RESET ROLE;

\echo ''
\echo '=== M2.2 PRODUCTS + VARIANTS ADVERSARIAL CHECKS PASS ==='

ROLLBACK;
