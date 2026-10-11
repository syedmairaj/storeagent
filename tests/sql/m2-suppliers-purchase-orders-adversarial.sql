\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M2.5 SUPPLIERS + PURCHASE ORDERS ADVERSARIAL VERIFICATION ==='

\set org_a 'aaaaaaaa-aaaa-4aaa-8aaa-255555555501'
\set org_b 'bbbbbbbb-bbbb-4bbb-8bbb-255555555502'

\set store_a 'aaaaaaaa-aaaa-4aaa-8aaa-255555555511'
\set store_b 'bbbbbbbb-bbbb-4bbb-8bbb-255555555512'

\set location_a 'aaaaaaaa-aaaa-4aaa-8aaa-255555555521'
\set location_b 'bbbbbbbb-bbbb-4bbb-8bbb-255555555522'

\set product_a 'aaaaaaaa-aaaa-4aaa-8aaa-255555555531'
\set product_b 'bbbbbbbb-bbbb-4bbb-8bbb-255555555532'

\set variant_a 'aaaaaaaa-aaaa-4aaa-8aaa-255555555541'
\set variant_b 'bbbbbbbb-bbbb-4bbb-8bbb-255555555542'

\set supplier_a 'aaaaaaaa-aaaa-4aaa-8aaa-255555555551'
\set supplier_b 'bbbbbbbb-bbbb-4bbb-8bbb-255555555552'

\set supplier_product_a 'aaaaaaaa-aaaa-4aaa-8aaa-255555555561'

\set po_a 'aaaaaaaa-aaaa-4aaa-8aaa-255555555571'
\set po_unknown 'aaaaaaaa-aaaa-4aaa-8aaa-255555555572'

\set po_item_a 'aaaaaaaa-aaaa-4aaa-8aaa-255555555581'
\set po_item_unknown 'aaaaaaaa-aaaa-4aaa-8aaa-255555555582'

-- ---------------------------------------------------------------------------
-- Canonical fixtures.
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
  'M2.5 Org A',
  'USD',
  'UTC'
),
(
  :'org_b'::uuid,
  'M2.5 Org B',
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
  'M2.5 Store A',
  'active',
  'USD',
  'UTC'
),
(
  :'store_b'::uuid,
  :'org_b'::uuid,
  'M2.5 Store B',
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
  'M2.5 Location A',
  'active'
),
(
  :'location_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'M2.5 Location B',
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
  'M2.5 Product A',
  'active'
),
(
  :'product_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'M2.5 Product B',
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
  'M25-A',
  'active'
),
(
  :'variant_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'product_b'::uuid,
  'M25-B',
  'active'
);

INSERT INTO public.suppliers (
  id,
  organization_id,
  name,
  default_lead_time_days
)
VALUES
(
  :'supplier_a'::uuid,
  :'org_a'::uuid,
  'Supplier A',
  7
),
(
  :'supplier_b'::uuid,
  :'org_b'::uuid,
  'Supplier B',
  null
);

\echo 'PASS: canonical supplier fixtures inserted'

-- ---------------------------------------------------------------------------
-- SupplierProduct valid relationship and nullable values.
-- ---------------------------------------------------------------------------

INSERT INTO public.supplier_products (
  id,
  organization_id,
  supplier_id,
  variant_id,
  supplier_sku,
  unit_cost_amount,
  currency,
  lead_time_days,
  minimum_order_quantity,
  pack_size,
  preferred
)
VALUES (
  :'supplier_product_a'::uuid,
  :'org_a'::uuid,
  :'supplier_a'::uuid,
  :'variant_a'::uuid,
  null,
  null,
  null,
  null,
  null,
  null,
  true
);

DO $$
DECLARE
  matched integer;
BEGIN
  SELECT count(*)
  INTO matched
  FROM public.supplier_products
  WHERE
    id =
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555561'::uuid
    AND supplier_sku is null
    AND unit_cost_amount is null
    AND currency is null
    AND lead_time_days is null
    AND minimum_order_quantity is null
    AND pack_size is null;

  IF matched <> 1 THEN
    RAISE EXCEPTION
      'M2.5 FAIL: unknown supplier-product values did not remain NULL';
  END IF;
END
$$;

\echo 'PASS: unknown supplier-product values remain NULL'

-- ---------------------------------------------------------------------------
-- Cross-org supplier link must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.supplier_products (
      organization_id,
      supplier_id,
      variant_id,
      preferred
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555501'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-255555555552'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555541'::uuid,
      false
    );

    RAISE EXCEPTION
      'M2.5 FAIL: cross-organization supplier link succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-organization supplier ownership rejected'

-- ---------------------------------------------------------------------------
-- Cross-org variant link must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.supplier_products (
      organization_id,
      supplier_id,
      variant_id,
      preferred
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555501'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555551'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-255555555542'::uuid,
      false
    );

    RAISE EXCEPTION
      'M2.5 FAIL: cross-organization supplier-product variant succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-organization supplier-product variant rejected'

-- ---------------------------------------------------------------------------
-- Invalid supplier constraints fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.supplier_products (
      organization_id,
      supplier_id,
      variant_id,
      minimum_order_quantity,
      preferred
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555501'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555551'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555541'::uuid,
      0,
      false
    );

    RAISE EXCEPTION
      'M2.5 FAIL: zero MOQ succeeded';

  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: zero MOQ rejected'

DO $$
BEGIN
  BEGIN
    UPDATE public.suppliers
    SET default_lead_time_days = -1
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555551'::uuid;

    RAISE EXCEPTION
      'M2.5 FAIL: negative supplier lead time succeeded';

  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: negative supplier lead time rejected'

-- ---------------------------------------------------------------------------
-- Purchase order with known supplier.
-- ---------------------------------------------------------------------------

INSERT INTO public.purchase_orders (
  id,
  organization_id,
  store_id,
  supplier_id,
  external_reference,
  status,
  ordered_at,
  expected_at,
  received_at,
  currency,
  source
)
VALUES (
  :'po_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'supplier_a'::uuid,
  'PO-A',
  'confirmed',
  '2026-10-11T06:00:00Z',
  '2026-10-18T06:00:00Z',
  null,
  'USD',
  'csv'
);

\echo 'PASS: purchase order with known supplier inserted'

-- ---------------------------------------------------------------------------
-- Purchase order with incomplete/unknown supplier and timing.
-- ---------------------------------------------------------------------------

INSERT INTO public.purchase_orders (
  id,
  organization_id,
  store_id,
  supplier_id,
  external_reference,
  status,
  ordered_at,
  expected_at,
  received_at,
  currency,
  source
)
VALUES (
  :'po_unknown'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  null,
  null,
  'draft',
  null,
  null,
  null,
  null,
  'other'
);

DO $$
DECLARE
  matched integer;
BEGIN
  SELECT count(*)
  INTO matched
  FROM public.purchase_orders
  WHERE
    id =
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555572'::uuid
    AND supplier_id is null
    AND external_reference is null
    AND ordered_at is null
    AND expected_at is null
    AND received_at is null
    AND currency is null;

  IF matched <> 1 THEN
    RAISE EXCEPTION
      'M2.5 FAIL: incomplete purchase-order truth was not preserved';
  END IF;
END
$$;

\echo 'PASS: incomplete purchase-order truth remains NULL'

-- ---------------------------------------------------------------------------
-- Cross-org supplier on purchase order must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.purchase_orders (
      organization_id,
      store_id,
      supplier_id,
      status,
      source
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555501'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555511'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-255555555552'::uuid,
      'draft',
      'csv'
    );

    RAISE EXCEPTION
      'M2.5 FAIL: cross-organization PO supplier succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-organization purchase-order supplier rejected'

-- ---------------------------------------------------------------------------
-- Purchase-order items: known and unknown receipt truth.
-- ---------------------------------------------------------------------------

INSERT INTO public.purchase_order_items (
  id,
  organization_id,
  store_id,
  purchase_order_id,
  variant_id,
  destination_location_id,
  ordered_quantity,
  received_quantity,
  unit_cost_amount,
  currency
)
VALUES
(
  :'po_item_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'po_a'::uuid,
  :'variant_a'::uuid,
  :'location_a'::uuid,
  12,
  0,
  9.50,
  'USD'
),
(
  :'po_item_unknown'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'po_unknown'::uuid,
  :'variant_a'::uuid,
  null,
  0,
  null,
  null,
  null
);

DO $$
DECLARE
  zero_received integer;
  unknown_received integer;
BEGIN
  SELECT count(*)
  INTO zero_received
  FROM public.purchase_order_items
  WHERE
    id =
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555581'::uuid
    AND received_quantity = 0;

  IF zero_received <> 1 THEN
    RAISE EXCEPTION
      'M2.5 FAIL: known zero received quantity was not preserved';
  END IF;

  SELECT count(*)
  INTO unknown_received
  FROM public.purchase_order_items
  WHERE
    id =
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555582'::uuid
    AND received_quantity is null
    AND unit_cost_amount is null
    AND currency is null;

  IF unknown_received <> 1 THEN
    RAISE EXCEPTION
      'M2.5 FAIL: unknown PO-item values did not remain NULL';
  END IF;
END
$$;

\echo 'PASS: known zero and unknown received quantity remain distinct'

-- ---------------------------------------------------------------------------
-- Cross-store variant must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.purchase_order_items (
      organization_id,
      store_id,
      purchase_order_id,
      variant_id,
      ordered_quantity
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555501'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555511'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555571'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-255555555542'::uuid,
      1
    );

    RAISE EXCEPTION
      'M2.5 FAIL: cross-store/cross-org PO variant succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-store purchase-order variant rejected'

-- ---------------------------------------------------------------------------
-- Cross-store destination location must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.purchase_order_items (
      organization_id,
      store_id,
      purchase_order_id,
      variant_id,
      destination_location_id,
      ordered_quantity
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555501'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555511'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555571'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555541'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-255555555522'::uuid,
      1
    );

    RAISE EXCEPTION
      'M2.5 FAIL: cross-store destination location succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-store destination location rejected'

-- ---------------------------------------------------------------------------
-- Negative quantities must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.purchase_order_items (
      organization_id,
      store_id,
      purchase_order_id,
      variant_id,
      ordered_quantity
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555501'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555511'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555571'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555541'::uuid,
      -1
    );

    RAISE EXCEPTION
      'M2.5 FAIL: negative ordered quantity succeeded';

  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: negative ordered quantity rejected'

-- ---------------------------------------------------------------------------
-- Ownership reassignment must fail.
-- Supplier may legitimately become known later on the same org/store.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    UPDATE public.purchase_orders
    SET
      organization_id =
        'bbbbbbbb-bbbb-4bbb-8bbb-255555555502'::uuid,
      store_id =
        'bbbbbbbb-bbbb-4bbb-8bbb-255555555512'::uuid
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555572'::uuid;

    RAISE EXCEPTION
      'M2.5 FAIL: purchase-order ownership reassignment succeeded';

  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.5 FAIL: purchase-order ownership reassignment succeeded'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: purchase-order ownership reassignment rejected'

UPDATE public.purchase_orders
SET supplier_id =
  'aaaaaaaa-aaaa-4aaa-8aaa-255555555551'::uuid
WHERE id =
  'aaaaaaaa-aaaa-4aaa-8aaa-255555555572'::uuid;

DO $$
DECLARE
  matched integer;
BEGIN
  SELECT count(*)
  INTO matched
  FROM public.purchase_orders
  WHERE
    id =
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555572'::uuid
    AND supplier_id =
      'aaaaaaaa-aaaa-4aaa-8aaa-255555555551'::uuid;

  IF matched <> 1 THEN
    RAISE EXCEPTION
      'M2.5 FAIL: same-org supplier reconciliation failed';
  END IF;
END
$$;

\echo 'PASS: same-org supplier reconciliation remains allowed'

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
      'suppliers',
      'supplier_products',
      'purchase_orders',
      'purchase_order_items'
    )
    AND NOT c.relrowsecurity;

  IF disabled_count <> 0 THEN
    RAISE EXCEPTION
      'M2.5 FAIL: supplier/PO RLS is not enabled';
  END IF;

  SELECT count(*)
  INTO policy_count
  FROM pg_policies
  WHERE
    schemaname = 'public'
    AND tablename IN (
      'suppliers',
      'supplier_products',
      'purchase_orders',
      'purchase_order_items'
    );

  IF policy_count <> 0 THEN
    RAISE EXCEPTION
      'M2.5 FAIL: M2.7 supplier/PO policies introduced prematurely';
  END IF;
END
$$;

\echo 'PASS: M2.5 RLS enabled fail-closed'
\echo 'PASS: zero M2.7 supplier/PO policies installed'

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
    FROM public.suppliers;

    IF visible_count <> 0 THEN
      RAISE EXCEPTION
        'M2.5 FAIL: authenticated client sees suppliers before M2.7';
    END IF;

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: authenticated supplier/PO access remains fail-closed before M2.7'

RESET ROLE;

\echo ''
\echo '=== M2.5 SUPPLIERS + PURCHASE ORDERS ADVERSARIAL CHECKS PASS ==='

ROLLBACK;
