\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M2.3 INVENTORY SNAPSHOTS ADVERSARIAL VERIFICATION ==='

\set org_a 'aaaaaaaa-aaaa-4aaa-8aaa-233333333301'
\set org_b 'bbbbbbbb-bbbb-4bbb-8bbb-233333333302'

\set store_a 'aaaaaaaa-aaaa-4aaa-8aaa-233333333311'
\set store_b 'bbbbbbbb-bbbb-4bbb-8bbb-233333333312'

\set location_a 'aaaaaaaa-aaaa-4aaa-8aaa-233333333321'
\set location_b 'bbbbbbbb-bbbb-4bbb-8bbb-233333333322'

\set product_a 'aaaaaaaa-aaaa-4aaa-8aaa-233333333331'
\set product_b 'bbbbbbbb-bbbb-4bbb-8bbb-233333333332'

\set variant_a 'aaaaaaaa-aaaa-4aaa-8aaa-233333333341'
\set variant_b 'bbbbbbbb-bbbb-4bbb-8bbb-233333333342'

\set snapshot_null 'aaaaaaaa-aaaa-4aaa-8aaa-233333333351'
\set snapshot_zero 'aaaaaaaa-aaaa-4aaa-8aaa-233333333352'
\set snapshot_later 'aaaaaaaa-aaaa-4aaa-8aaa-233333333353'

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
  'M2.3 Org A',
  'USD',
  'UTC'
),
(
  :'org_b'::uuid,
  'M2.3 Org B',
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
  'M2.3 Store A',
  'active',
  'USD',
  'UTC'
),
(
  :'store_b'::uuid,
  :'org_b'::uuid,
  'M2.3 Store B',
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
  'M2.3 Location A',
  'active'
),
(
  :'location_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'M2.3 Location B',
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
  'M2.3 Product A',
  'active'
),
(
  :'product_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'M2.3 Product B',
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
  'M23-A',
  'active'
),
(
  :'variant_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'product_b'::uuid,
  'M23-B',
  'active'
);

\echo 'PASS: M2.3 canonical fixtures inserted'

-- ---------------------------------------------------------------------------
-- Unknown quantities remain NULL.
-- ---------------------------------------------------------------------------

INSERT INTO public.inventory_snapshots (
  id,
  organization_id,
  store_id,
  location_id,
  variant_id,
  observed_at,
  on_hand_quantity,
  available_quantity,
  committed_quantity,
  incoming_quantity,
  source
)
VALUES (
  :'snapshot_null'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'location_a'::uuid,
  :'variant_a'::uuid,
  '2026-10-11T06:00:00Z',
  null,
  null,
  null,
  null,
  'csv'
);

DO $$
DECLARE
  known_count integer;
BEGIN
  SELECT count(*)
  INTO known_count
  FROM public.inventory_snapshots
  WHERE
    id =
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333351'::uuid
    AND (
      on_hand_quantity is not null
      OR available_quantity is not null
      OR committed_quantity is not null
      OR incoming_quantity is not null
    );

  IF known_count <> 0 THEN
    RAISE EXCEPTION
      'M2.3 FAIL: unknown inventory became known data';
  END IF;
END
$$;

\echo 'PASS: unknown inventory quantities remain NULL'

-- ---------------------------------------------------------------------------
-- Known zero remains distinct from NULL.
-- ---------------------------------------------------------------------------

INSERT INTO public.inventory_snapshots (
  id,
  organization_id,
  store_id,
  location_id,
  variant_id,
  observed_at,
  on_hand_quantity,
  available_quantity,
  committed_quantity,
  incoming_quantity,
  source
)
VALUES (
  :'snapshot_zero'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'location_a'::uuid,
  :'variant_a'::uuid,
  '2026-10-11T06:05:00Z',
  0,
  0,
  0,
  0,
  'csv'
);

DO $$
DECLARE
  zero_count integer;
BEGIN
  SELECT count(*)
  INTO zero_count
  FROM public.inventory_snapshots
  WHERE
    id =
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333352'::uuid
    AND on_hand_quantity = 0
    AND available_quantity = 0
    AND committed_quantity = 0
    AND incoming_quantity = 0;

  IF zero_count <> 1 THEN
    RAISE EXCEPTION
      'M2.3 FAIL: known zero inventory was not preserved';
  END IF;
END
$$;

\echo 'PASS: known zero remains distinct from NULL'

-- ---------------------------------------------------------------------------
-- Later observation creates another row.
-- ---------------------------------------------------------------------------

INSERT INTO public.inventory_snapshots (
  id,
  organization_id,
  store_id,
  location_id,
  variant_id,
  observed_at,
  on_hand_quantity,
  available_quantity,
  committed_quantity,
  incoming_quantity,
  source
)
VALUES (
  :'snapshot_later'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'location_a'::uuid,
  :'variant_a'::uuid,
  '2026-10-11T07:00:00Z',
  8,
  6,
  2,
  5,
  'csv'
);

DO $$
DECLARE
  snapshot_count integer;
BEGIN
  SELECT count(*)
  INTO snapshot_count
  FROM public.inventory_snapshots
  WHERE
    organization_id =
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333301'::uuid
    AND store_id =
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333311'::uuid
    AND location_id =
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333321'::uuid
    AND variant_id =
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333341'::uuid;

  IF snapshot_count <> 3 THEN
    RAISE EXCEPTION
      'M2.3 FAIL: inventory history did not preserve multiple observations';
  END IF;
END
$$;

\echo 'PASS: later observation appended without replacing history'

-- ---------------------------------------------------------------------------
-- Cross-organization location attack must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.inventory_snapshots (
      organization_id,
      store_id,
      location_id,
      variant_id,
      observed_at,
      source
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333301'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333311'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-233333333322'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333341'::uuid,
      pg_catalog.now(),
      'csv'
    );

    RAISE EXCEPTION
      'M2.3 FAIL: cross-organization location linkage succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-organization location ownership rejected'

-- ---------------------------------------------------------------------------
-- Cross-store location attack must fail.
--
-- Org A intentionally tries to use Store B's location while claiming Store A.
-- The composite ownership FK must reject it.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.inventory_snapshots (
      organization_id,
      store_id,
      location_id,
      variant_id,
      observed_at,
      source
    )
    VALUES (
      'bbbbbbbb-bbbb-4bbb-8bbb-233333333302'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333311'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-233333333322'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-233333333342'::uuid,
      pg_catalog.now(),
      'csv'
    );

    RAISE EXCEPTION
      'M2.3 FAIL: cross-store location linkage succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-store location ownership rejected'

-- ---------------------------------------------------------------------------
-- Cross-organization variant attack must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.inventory_snapshots (
      organization_id,
      store_id,
      location_id,
      variant_id,
      observed_at,
      source
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333301'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333311'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333321'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-233333333342'::uuid,
      pg_catalog.now(),
      'csv'
    );

    RAISE EXCEPTION
      'M2.3 FAIL: cross-organization variant linkage succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: cross-organization variant ownership rejected'

-- ---------------------------------------------------------------------------
-- Negative quantities must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.inventory_snapshots (
      organization_id,
      store_id,
      location_id,
      variant_id,
      observed_at,
      on_hand_quantity,
      source
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333301'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333311'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333321'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333341'::uuid,
      pg_catalog.now(),
      -1,
      'csv'
    );

    RAISE EXCEPTION
      'M2.3 FAIL: negative inventory quantity succeeded';

  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: negative inventory quantity rejected'

-- ---------------------------------------------------------------------------
-- Invalid provider source must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.inventory_snapshots (
      organization_id,
      store_id,
      location_id,
      variant_id,
      observed_at,
      source
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333301'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333311'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333321'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333341'::uuid,
      pg_catalog.now(),
      'not-a-provider'
    );

    RAISE EXCEPTION
      'M2.3 FAIL: invalid provider source succeeded';

  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: invalid provider source rejected'

-- ---------------------------------------------------------------------------
-- Existing snapshot cannot be updated.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    UPDATE public.inventory_snapshots
    SET on_hand_quantity = 999
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333353'::uuid;

    RAISE EXCEPTION
      'M2.3 FAIL: immutable snapshot update succeeded';

  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.3 FAIL: immutable snapshot update succeeded'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: snapshot update rejected by immutable-history guard'

-- ---------------------------------------------------------------------------
-- Existing snapshot cannot be deleted.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    DELETE FROM public.inventory_snapshots
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-233333333353'::uuid;

    RAISE EXCEPTION
      'M2.3 FAIL: immutable snapshot delete succeeded';

  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.3 FAIL: immutable snapshot delete succeeded'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: snapshot delete rejected by immutable-history guard'

-- ---------------------------------------------------------------------------
-- RLS must be enabled, with policies deferred until M2.7.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rls_enabled boolean;
  policy_count integer;
BEGIN
  SELECT c.relrowsecurity
  INTO rls_enabled
  FROM pg_class c
  JOIN pg_namespace n
    ON n.oid = c.relnamespace
  WHERE
    n.nspname = 'public'
    AND c.relname = 'inventory_snapshots';

  IF rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'M2.3 FAIL: inventory snapshot RLS is not enabled';
  END IF;

  SELECT count(*)
  INTO policy_count
  FROM pg_policies
  WHERE
    schemaname = 'public'
    AND tablename = 'inventory_snapshots';

  IF policy_count <> 0 THEN
    RAISE EXCEPTION
      'M2.3 FAIL: M2.7 inventory policies introduced prematurely';
  END IF;
END
$$;

\echo 'PASS: inventory snapshot RLS enabled fail-closed'
\echo 'PASS: zero M2.7 inventory policies installed'

-- ---------------------------------------------------------------------------
-- Authenticated access remains fail-closed before M2.7.
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
    FROM public.inventory_snapshots;

    IF visible_count <> 0 THEN
      RAISE EXCEPTION
        'M2.3 FAIL: authenticated client sees inventory before M2.7';
    END IF;

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: authenticated inventory access remains fail-closed before M2.7'

RESET ROLE;

\echo ''
\echo '=== M2.3 INVENTORY SNAPSHOTS ADVERSARIAL CHECKS PASS ==='

ROLLBACK;
