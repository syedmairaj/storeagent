\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M2.6 INTEGRATION IDENTITY ADVERSARIAL VERIFICATION ==='

\set org_a 'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'
\set org_b 'bbbbbbbb-bbbb-4bbb-8bbb-266666666602'

\set store_a 'aaaaaaaa-aaaa-4aaa-8aaa-266666666611'
\set store_b 'bbbbbbbb-bbbb-4bbb-8bbb-266666666612'

\set product_a 'aaaaaaaa-aaaa-4aaa-8aaa-266666666621'
\set product_b 'bbbbbbbb-bbbb-4bbb-8bbb-266666666622'

\set variant_a 'aaaaaaaa-aaaa-4aaa-8aaa-266666666631'
\set variant_b 'bbbbbbbb-bbbb-4bbb-8bbb-266666666632'

\set integration_a 'aaaaaaaa-aaaa-4aaa-8aaa-266666666641'
\set integration_org 'aaaaaaaa-aaaa-4aaa-8aaa-266666666642'
\set integration_b 'bbbbbbbb-bbbb-4bbb-8bbb-266666666643'

\set binding_upper 'aaaaaaaa-aaaa-4aaa-8aaa-266666666651'
\set binding_lower 'aaaaaaaa-aaaa-4aaa-8aaa-266666666652'

\set sync_a 'aaaaaaaa-aaaa-4aaa-8aaa-266666666661'

INSERT INTO public.organizations (
  id,
  name,
  default_currency,
  timezone
)
VALUES
(
  :'org_a'::uuid,
  'M2.6 Org A',
  'USD',
  'UTC'
),
(
  :'org_b'::uuid,
  'M2.6 Org B',
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
  'M2.6 Store A',
  'active',
  'USD',
  'UTC'
),
(
  :'store_b'::uuid,
  :'org_b'::uuid,
  'M2.6 Store B',
  'active',
  'USD',
  'UTC'
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
  'M2.6 Product A',
  'active'
),
(
  :'product_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'M2.6 Product B',
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
  'M26-A',
  'active'
),
(
  :'variant_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  :'product_b'::uuid,
  'M26-B',
  'active'
);

INSERT INTO public.integrations (
  id,
  organization_id,
  store_id,
  provider,
  status,
  display_name,
  configuration
)
VALUES
(
  :'integration_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  'csv',
  'active',
  'Store A CSV',
  '{"delimiter": ","}'::jsonb
),
(
  :'integration_org'::uuid,
  :'org_a'::uuid,
  null,
  'csv',
  'active',
  'Org A CSV',
  null
),
(
  :'integration_b'::uuid,
  :'org_b'::uuid,
  :'store_b'::uuid,
  'shopify',
  'active',
  'Store B Shopify',
  null
);

\echo 'PASS: trusted integration fixtures inserted'

-- ---------------------------------------------------------------------------
-- Valid durable binding.
-- ---------------------------------------------------------------------------

INSERT INTO public.provider_bindings (
  id,
  organization_id,
  integration_id,
  provider,
  resource_type,
  canonical_entity_id,
  external_id,
  external_parent_id,
  source_metadata
)
VALUES (
  :'binding_upper'::uuid,
  :'org_a'::uuid,
  :'integration_a'::uuid,
  'csv',
  'product_variant',
  :'variant_a'::uuid,
  'SKU-AbC',
  null,
  '{"row": 1}'::jsonb
);

\echo 'PASS: valid provider binding inserted'

-- Same identity cannot bind twice.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666641'::uuid,
      'csv',
      'product_variant',
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666631'::uuid,
      'SKU-AbC'
    );

    RAISE EXCEPTION
      'M2.6 FAIL: duplicate durable provider identity succeeded';

  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: duplicate provider identity rejected'

-- Case is preserved and therefore a different durable external identity.
INSERT INTO public.provider_bindings (
  id,
  organization_id,
  integration_id,
  provider,
  resource_type,
  canonical_entity_id,
  external_id
)
VALUES (
  :'binding_lower'::uuid,
  :'org_a'::uuid,
  :'integration_a'::uuid,
  'csv',
  'product_variant',
  :'variant_a'::uuid,
  'sku-abc'
);

\echo 'PASS: external-ID case remains significant'

-- ---------------------------------------------------------------------------
-- Provider must match trusted integration.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666641'::uuid,
      'shopify',
      'product_variant',
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666631'::uuid,
      'provider-mismatch'
    );

    RAISE EXCEPTION
      'M2.6 FAIL: binding provider mismatch succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;

    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.6 FAIL: binding provider mismatch succeeded'
      THEN
        RAISE;
      END IF;

      IF SQLERRM <>
        'provider binding integration is not trusted to this organization/provider'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: provider/integration mismatch rejected'

-- ---------------------------------------------------------------------------
-- Cross-organization canonical target must fail.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666641'::uuid,
      'csv',
      'product_variant',
      'bbbbbbbb-bbbb-4bbb-8bbb-266666666632'::uuid,
      'cross-org'
    );

    RAISE EXCEPTION
      'M2.6 FAIL: cross-organization canonical binding succeeded';

  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.6 FAIL: cross-organization canonical binding succeeded'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: cross-organization canonical binding rejected'

-- ---------------------------------------------------------------------------
-- Store-scoped integration cannot bind canonical entity from another store.
--
-- Use Org A org-scoped integration as control first.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  extra_store uuid :=
    'aaaaaaaa-aaaa-4aaa-8aaa-266666666613'::uuid;
  extra_product uuid :=
    'aaaaaaaa-aaaa-4aaa-8aaa-266666666623'::uuid;
  extra_variant uuid :=
    'aaaaaaaa-aaaa-4aaa-8aaa-266666666633'::uuid;
BEGIN
  INSERT INTO public.stores (
    id,
    organization_id,
    name,
    status,
    currency,
    timezone
  )
  VALUES (
    extra_store,
    'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'::uuid,
    'M2.6 Store A2',
    'active',
    'USD',
    'UTC'
  );

  INSERT INTO public.products (
    id,
    organization_id,
    store_id,
    title,
    status
  )
  VALUES (
    extra_product,
    'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'::uuid,
    extra_store,
    'M2.6 Product A2',
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
  VALUES (
    extra_variant,
    'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'::uuid,
    extra_store,
    extra_product,
    'M26-A2',
    'active'
  );

  -- Organization-scoped integration may bind it.
  INSERT INTO public.provider_bindings (
    organization_id,
    integration_id,
    provider,
    resource_type,
    canonical_entity_id,
    external_id
  )
  VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-266666666642'::uuid,
    'csv',
    'product_variant',
    extra_variant,
    'org-scope-ok'
  );

  BEGIN
    INSERT INTO public.provider_bindings (
      organization_id,
      integration_id,
      provider,
      resource_type,
      canonical_entity_id,
      external_id
    )
    VALUES (
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666641'::uuid,
      'csv',
      'product_variant',
      extra_variant,
      'wrong-store'
    );

    RAISE EXCEPTION
      'M2.6 FAIL: store-scoped integration bound another store';

  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.6 FAIL: store-scoped integration bound another store'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: store-scoped integration cannot bind another store'
\echo 'PASS: organization-scoped integration remains organization-wide'

-- ---------------------------------------------------------------------------
-- Binding identity cannot rebind canonical entity.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    UPDATE public.provider_bindings
    SET canonical_entity_id =
      'bbbbbbbb-bbbb-4bbb-8bbb-266666666632'::uuid
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666651'::uuid;

    RAISE EXCEPTION
      'M2.6 FAIL: provider binding canonical rebinding succeeded';

  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.6 FAIL: provider binding canonical rebinding succeeded'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: provider binding canonical rebinding rejected'

-- Metadata may reconcile without changing durable identity.
UPDATE public.provider_bindings
SET
  external_parent_id = 'Parent-1',
  source_metadata = '{"row": 2}'::jsonb
WHERE id =
  'aaaaaaaa-aaaa-4aaa-8aaa-266666666651'::uuid;

\echo 'PASS: non-identity provider metadata reconciliation remains allowed'

-- ---------------------------------------------------------------------------
-- Bound canonical entity cannot be deleted.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    DELETE FROM public.product_variants
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666631'::uuid;

    RAISE EXCEPTION
      'M2.6 FAIL: bound canonical entity delete succeeded';

  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.6 FAIL: bound canonical entity delete succeeded'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: bound canonical entity deletion rejected'

-- ---------------------------------------------------------------------------
-- Sync run.
-- ---------------------------------------------------------------------------

INSERT INTO public.sync_runs (
  id,
  organization_id,
  store_id,
  integration_id,
  idempotency_key,
  status,
  cursor_before,
  cursor_after,
  started_at
)
VALUES (
  :'sync_a'::uuid,
  :'org_a'::uuid,
  :'store_a'::uuid,
  :'integration_a'::uuid,
  'sync-2026-10-11-001',
  'running',
  null,
  null,
  '2026-10-11T08:00:00Z'
);

\echo 'PASS: valid sync run inserted'

-- Idempotent identity cannot duplicate.
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
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666611'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666641'::uuid,
      'sync-2026-10-11-001',
      'queued',
      pg_catalog.now()
    );

    RAISE EXCEPTION
      'M2.6 FAIL: duplicate sync idempotency key succeeded';

  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: duplicate sync idempotency identity rejected'

-- Cross-org integration must fail.
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
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666611'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-266666666643'::uuid,
      'cross-org-sync',
      'queued',
      pg_catalog.now()
    );

    RAISE EXCEPTION
      'M2.6 FAIL: cross-organization sync integration succeeded';

  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;

    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.6 FAIL: cross-organization sync integration succeeded'
      THEN
        RAISE;
      END IF;

      IF SQLERRM <>
        'sync run integration is not trusted to this organization'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: cross-organization sync integration rejected'

-- A store-scoped integration cannot run under another store.
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
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666601'::uuid,
      null,
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666641'::uuid,
      'wrong-store-scope',
      'queued',
      pg_catalog.now()
    );

    RAISE EXCEPTION
      'M2.6 FAIL: store-scoped integration sync scope mismatch succeeded';

  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.6 FAIL: store-scoped integration sync scope mismatch succeeded'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: sync-run store must match store-scoped integration'

-- Lifecycle reconciliation is allowed.
UPDATE public.sync_runs
SET
  status = 'completed',
  discovered_count = 10,
  imported_count = 8,
  updated_count = 1,
  skipped_count = 1,
  quarantined_count = 0,
  failed_count = 0,
  cursor_after = 'cursor-2',
  reconciliation_metadata =
    '{"reconciled": true}'::jsonb,
  finished_at = '2026-10-11T08:05:00Z'
WHERE id =
  'aaaaaaaa-aaaa-4aaa-8aaa-266666666661'::uuid;

\echo 'PASS: sync-run operational lifecycle reconciliation remains allowed'

-- Tenant/integration/idempotency identity cannot change.
DO $$
BEGIN
  BEGIN
    UPDATE public.sync_runs
    SET idempotency_key = 'different-key'
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666661'::uuid;

    RAISE EXCEPTION
      'M2.6 FAIL: sync-run identity reassignment succeeded';

  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.6 FAIL: sync-run identity reassignment succeeded'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: sync-run canonical identity reassignment rejected'

-- Operational history cannot be deleted.
DO $$
BEGIN
  BEGIN
    DELETE FROM public.sync_runs
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-266666666661'::uuid;

    RAISE EXCEPTION
      'M2.6 FAIL: sync-run deletion succeeded';

  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM =
        'M2.6 FAIL: sync-run deletion succeeded'
      THEN
        RAISE;
      END IF;
  END;
END
$$;

\echo 'PASS: sync-run deletion rejected'

-- ---------------------------------------------------------------------------
-- RLS fail-closed until M2.7.
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
      'integrations',
      'provider_bindings',
      'sync_runs'
    )
    AND NOT c.relrowsecurity;

  IF disabled_count <> 0 THEN
    RAISE EXCEPTION
      'M2.6 FAIL: integration identity RLS is not enabled';
  END IF;

  SELECT count(*)
  INTO policy_count
  FROM pg_policies
  WHERE
    schemaname = 'public'
    AND tablename IN (
      'integrations',
      'provider_bindings',
      'sync_runs'
    );

  IF policy_count <> 0 THEN
    RAISE EXCEPTION
      'M2.6 FAIL: M2.7 integration policies introduced prematurely';
  END IF;
END
$$;

\echo 'PASS: M2.6 RLS enabled fail-closed'
\echo 'PASS: zero M2.7 integration policies installed'

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
    FROM public.integrations;

    IF visible_count <> 0 THEN
      RAISE EXCEPTION
        'M2.6 FAIL: authenticated client sees integrations before M2.7';
    END IF;

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: authenticated integration access remains fail-closed before M2.7'

RESET ROLE;

\echo ''
\echo '=== M2.6 INTEGRATION IDENTITY ADVERSARIAL CHECKS PASS ==='

ROLLBACK;
