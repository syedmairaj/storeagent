\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M2.4 ORDERS + DEMAND ADVERSARIAL VERIFICATION ==='

\set org_a 'aaaaaaaa-aaaa-4aaa-8aaa-244444444401'
\set org_b 'bbbbbbbb-bbbb-4bbb-8bbb-244444444402'

\set store_a 'aaaaaaaa-aaaa-4aaa-8aaa-244444444411'
\set store_b 'bbbbbbbb-bbbb-4bbb-8bbb-244444444412'

\set location_a 'aaaaaaaa-aaaa-4aaa-8aaa-244444444421'
\set location_b 'bbbbbbbb-bbbb-4bbb-8bbb-244444444422'

\set product_a 'aaaaaaaa-aaaa-4aaa-8aaa-244444444431'
\set product_b 'bbbbbbbb-bbbb-4bbb-8bbb-244444444432'

\set variant_a 'aaaaaaaa-aaaa-4aaa-8aaa-244444444441'
\set variant_b 'bbbbbbbb-bbbb-4bbb-8bbb-244444444442'

\set order_a 'aaaaaaaa-aaaa-4aaa-8aaa-244444444451'
\set order_b 'bbbbbbbb-bbbb-4bbb-8bbb-244444444452'

\set item_a 'aaaaaaaa-aaaa-4aaa-8aaa-244444444461'
\set item_b 'bbbbbbbb-bbbb-4bbb-8bbb-244444444462'

\set refund_a 'aaaaaaaa-aaaa-4aaa-8aaa-244444444471'

INSERT INTO public.organizations (
  id,
  name,
  default_currency,
  timezone
)
VALUES
(
  :'org_a'::uuid,
  'M2.4 Org A',
  'USD',
  'UTC'
),
(
  :'org_b'::uuid,
  'M2.4 Org B',
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
  'M2.4 Store A',
  'active',
  'USD',
  'UTC'
),
(
  :'store_b'::uuid,
  :'org_b'::uuid,
  'M2.4 Store B',
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
  'M2.4 Location A',
  'active'
),
(
  :'location_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'M2.4 Location B',
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
  'M2.4 Product A',
  'active'
),
(
  :'product_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'M2.4 Product B',
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
  'M24-A',
  'active'
),
(
  :'variant_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'product_b'::uuid,
  'M24-B',
  'active'
);

INSERT INTO public.orders (
  id,
  organization_id,
  store_id,
  external_reference,
  status,
  ordered_at,
  currency,
  gross_amount,
  discount_amount,
  net_amount,
  source
)
VALUES
(
  :'order_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  'ORDER-A',
  'completed',
  '2026-10-11T06:00:00Z',
  'USD',
  100,
  10,
  90,
  'csv'
),
(
  :'order_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'ORDER-B',
  'completed',
  '2026-10-11T06:00:00Z',
  'USD',
  null,
  null,
  null,
  'shopify'
);

\echo 'PASS: valid canonical orders inserted'

DO $$
DECLARE
  unknown_count integer;
BEGIN
  SELECT count(*)
  INTO unknown_count
  FROM public.orders
  WHERE
    id =
      'bbbbbbbb-bbbb-4bbb-8bbb-244444444452'::uuid
    AND gross_amount is null
    AND discount_amount is null
    AND net_amount is null;

  IF unknown_count <> 1 THEN
    RAISE EXCEPTION
      'M2.4 FAIL: unknown order money did not remain NULL';
  END IF;
END
$$;

\echo 'PASS: unknown order commercial values remain NULL'

INSERT INTO public.order_items (
  id,
  organization_id,
  store_id,
  order_id,
  variant_id,
  location_id,
  quantity,
  unit_price_amount,
  discount_amount,
  unit_cost_amount,
  currency
)
VALUES
(
  :'item_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'order_a'::uuid,
  :'variant_a'::uuid,
  :'location_a'::uuid,
  2,
  50,
  5,
  null,
  'USD'
),
(
  :'item_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'order_b'::uuid,
  :'variant_b'::uuid,
  null,
  1,
  null,
  null,
  null,
  null
);

\echo 'PASS: valid canonical order items inserted'

DO $$
BEGIN
  BEGIN
    INSERT INTO public.order_items (
      organization_id,
      store_id,
      order_id,
      variant_id,
      quantity
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444401'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444411'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-244444444452'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444441'::uuid,
      1
    );

    RAISE EXCEPTION
      'M2.4 FAIL: cross-organization order item/order linkage succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-organization order ownership rejected'

DO $$
BEGIN
  BEGIN
    INSERT INTO public.order_items (
      organization_id,
      store_id,
      order_id,
      variant_id,
      quantity
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444401'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444411'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444451'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-244444444442'::uuid,
      1
    );

    RAISE EXCEPTION
      'M2.4 FAIL: cross-organization variant linkage succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-organization variant ownership rejected'

DO $$
BEGIN
  BEGIN
    INSERT INTO public.order_items (
      organization_id,
      store_id,
      order_id,
      variant_id,
      location_id,
      quantity
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444401'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444411'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444451'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444441'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-244444444422'::uuid,
      1
    );

    RAISE EXCEPTION
      'M2.4 FAIL: cross-store location linkage succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-store location ownership rejected'

INSERT INTO public.return_refunds (
  id,
  organization_id,
  store_id,
  order_id,
  order_item_id,
  variant_id,
  location_id,
  returned_quantity,
  refunded_amount,
  currency,
  reason,
  occurred_at
)
VALUES (
  :'refund_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'order_a'::uuid,
  :'item_a'::uuid,
  :'variant_a'::uuid,
  :'location_a'::uuid,
  1,
  45,
  'USD',
  'Customer return',
  '2026-10-11T08:00:00Z'
);

\echo 'PASS: valid return/refund evidence inserted'

DO $$
BEGIN
  BEGIN
    INSERT INTO public.return_refunds (
      organization_id,
      store_id,
      order_id,
      order_item_id,
      variant_id,
      occurred_at
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444401'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444411'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444451'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444461'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-244444444442'::uuid,
      pg_catalog.now()
    );

    RAISE EXCEPTION
      'M2.4 FAIL: refund mismatched order-item variant succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: refund/order-item variant mismatch rejected'

DO $$
BEGIN
  BEGIN
    INSERT INTO public.return_refunds (
      organization_id,
      store_id,
      order_id,
      variant_id,
      returned_quantity,
      occurred_at
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444401'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444411'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444451'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444441'::uuid,
      -1,
      pg_catalog.now()
    );

    RAISE EXCEPTION
      'M2.4 FAIL: negative returned quantity succeeded';

  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: negative returned quantity rejected'

-- ---------------------------------------------------------------------------
-- Ownership cannot be reassigned during reconciliation.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    UPDATE public.orders
    SET
      organization_id =
        'bbbbbbbb-bbbb-4bbb-8bbb-244444444402'::uuid,
      store_id =
        'bbbbbbbb-bbbb-4bbb-8bbb-244444444412'::uuid
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444451'::uuid;

    RAISE EXCEPTION
      'M2.4 FAIL: order ownership reassignment succeeded';

  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.4 FAIL: order ownership reassignment succeeded'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: order ownership reassignment rejected'

-- Legitimate status reconciliation remains allowed.
UPDATE public.orders
SET status = 'partially_refunded'
WHERE id =
  'aaaaaaaa-aaaa-4aaa-8aaa-244444444451'::uuid;

DO $$
DECLARE
  matched integer;
BEGIN
  SELECT count(*)
  INTO matched
  FROM public.orders
  WHERE
    id =
      'aaaaaaaa-aaaa-4aaa-8aaa-244444444451'::uuid
    AND status = 'partially_refunded';

  IF matched <> 1 THEN
    RAISE EXCEPTION
      'M2.4 FAIL: legitimate order status reconciliation failed';
  END IF;
END
$$;

\echo 'PASS: legitimate order status reconciliation remains allowed'

-- ---------------------------------------------------------------------------
-- RLS enabled, M2.7 policies absent.
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
      'orders',
      'order_items',
      'return_refunds'
    )
    AND NOT c.relrowsecurity;

  IF disabled_count <> 0 THEN
    RAISE EXCEPTION
      'M2.4 FAIL: demand-history RLS is not enabled';
  END IF;

  SELECT count(*)
  INTO policy_count
  FROM pg_policies
  WHERE
    schemaname = 'public'
    AND tablename IN (
      'orders',
      'order_items',
      'return_refunds'
    );

  IF policy_count <> 0 THEN
    RAISE EXCEPTION
      'M2.4 FAIL: M2.7 demand-history policies introduced prematurely';
  END IF;
END
$$;

\echo 'PASS: M2.4 RLS enabled fail-closed'
\echo 'PASS: zero M2.7 demand-history policies installed'

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
    FROM public.orders;

    IF visible_count <> 0 THEN
      RAISE EXCEPTION
        'M2.4 FAIL: authenticated client sees orders before M2.7';
    END IF;

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: authenticated demand-history access remains fail-closed before M2.7'

RESET ROLE;

\echo ''
\echo '=== M2.4 ORDERS + DEMAND ADVERSARIAL CHECKS PASS ==='

ROLLBACK;
