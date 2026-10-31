\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M7.2b INVENTORY ACTION PERSISTENCE ADVERSARIAL ==='

\set org_a '71009000-0000-4000-8000-000000000001'
\set org_b '71009000-0000-4000-8000-000000000011'
\set store_a '71009000-0000-4000-8000-000000000002'
\set store_b '71009000-0000-4000-8000-000000000012'
\set location_a '71009000-0000-4000-8000-000000000003'
\set location_b '71009000-0000-4000-8000-000000000023'
\set product_a '71009000-0000-4000-8000-000000000004'
\set product_b '71009000-0000-4000-8000-000000000014'
\set variant_a '71009000-0000-4000-8000-000000000005'
\set variant_b '71009000-0000-4000-8000-000000000025'
\set user_owner '71009000-0000-4000-8000-000000000007'
\set user_foreign '71009000-0000-4000-8000-000000000008'

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
(
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm7-action-owner@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_foreign'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm7-action-foreign@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'M7 Action Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'M7 Action Org B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (:'org_a'::uuid, :'user_owner'::uuid, 'owner'),
  (:'org_b'::uuid, :'user_foreign'::uuid, 'owner');

INSERT INTO public.stores (id, organization_id, name, status, currency, timezone)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'Action Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'Action Store B', 'active', 'USD', 'UTC');

INSERT INTO public.locations (id, organization_id, store_id, name, status)
VALUES
  (:'location_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'Loc A', 'active'),
  (:'location_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, 'Loc B', 'active');

INSERT INTO public.products (id, organization_id, store_id, title, status)
VALUES
  (:'product_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, 'Product A', 'active'),
  (:'product_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, 'Product B', 'active');

INSERT INTO public.product_variants (
  id, organization_id, store_id, product_id, sku, status
)
VALUES
  (:'variant_a'::uuid, :'org_a'::uuid, :'store_a'::uuid, :'product_a'::uuid, 'SKU-A', 'active'),
  (:'variant_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, :'product_b'::uuid, 'SKU-B', 'active');

\echo '--- Privileges: no direct DML; service_role EXECUTE only ---'

DO $$
DECLARE
  insert_priv boolean;
  update_priv boolean;
  delete_priv boolean;
  exec_auth boolean;
  exec_anon boolean;
  exec_service boolean;
BEGIN
  SELECT
    has_table_privilege('authenticated', 'public.inventory_actions', 'INSERT'),
    has_table_privilege('authenticated', 'public.inventory_actions', 'UPDATE'),
    has_table_privilege('authenticated', 'public.inventory_actions', 'DELETE')
  INTO insert_priv, update_priv, delete_priv;

  IF insert_priv OR update_priv OR delete_priv THEN
    RAISE EXCEPTION 'authenticated must not have inventory_actions DML';
  END IF;

  SELECT
    has_table_privilege('service_role', 'public.inventory_actions', 'INSERT'),
    has_table_privilege('service_role', 'public.inventory_actions', 'UPDATE'),
    has_table_privilege('service_role', 'public.inventory_actions', 'DELETE')
  INTO insert_priv, update_priv, delete_priv;

  IF insert_priv OR update_priv OR delete_priv THEN
    RAISE EXCEPTION 'service_role must not have direct inventory_actions DML';
  END IF;

  SELECT has_function_privilege(
    'authenticated',
    'public.persist_inventory_action_recommendation(uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) INTO exec_auth;
  SELECT has_function_privilege(
    'anon',
    'public.persist_inventory_action_recommendation(uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) INTO exec_anon;
  SELECT has_function_privilege(
    'service_role',
    'public.persist_inventory_action_recommendation(uuid,uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) INTO exec_service;

  IF exec_auth OR exec_anon THEN
    RAISE EXCEPTION 'persist RPC must not be executable by anon/authenticated';
  END IF;
  IF NOT exec_service THEN
    RAISE EXCEPTION 'persist RPC must be executable by service_role';
  END IF;
END;
$$;

\echo '--- Helpers ---'

CREATE FUNCTION pg_temp.m7_base_evidence()
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'availableQuantity', 2,
    'incomingQuantity', 0,
    'demandVelocity', 1.5,
    'daysOfStock', 1,
    'leadTimeDays', 7,
    'safetyStockUnits', 3,
    'reorderPointUnits', 10,
    'targetStockUnits', 20,
    'inventoryAgeDays', 12,
    'forecastExpectedDemandUnits', null,
    'dataQualityScore', 0.9,
    'reasonCodes', jsonb_build_array('REORDER_QUANTITY_POSITIVE', 'BELOW_REORDER_POINT')
  );
$$;

CREATE FUNCTION pg_temp.m7_algorithm_versions()
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'reorder', 'reorder-rule-v1',
    'reduce', 'reduce-rule-v1',
    'promote', 'promote-rule-v1',
    'watchHealthy', 'watch-healthy-rule-v1',
    'conflict', 'decision-conflict-v1',
    'primaryAction', 'primary-action-v1',
    'priority', 'decision-priority-v1',
    'confidence', 'decision-confidence-v1'
  );
$$;

CREATE FUNCTION pg_temp.m7_base_payload(
  p_org uuid,
  p_store uuid,
  p_loc uuid,
  p_variant uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  payload jsonb;
  hashes jsonb;
BEGIN
  payload := jsonb_build_object(
    'organizationId', p_org::text,
    'storeId', p_store::text,
    'locationId', p_loc::text,
    'variantId', p_variant::text,
    'decisionAsOfDate', '2026-10-30',
    'pinnedTimeZone', 'UTC',
    'actionType', 'REORDER',
    'compatibleSecondaryActionTypes', '[]'::jsonb,
    'priority', 'high',
    'status', 'new',
    'recommendedQuantity', 12,
    'recommendedActionDate', '2026-10-30',
    'confidence', 'medium',
    'evidenceSnapshot', pg_temp.m7_base_evidence(),
    'incomingStateKnown', true,
    'evidenceSourceClass', 'm7_persistence_contract_harness_v1',
    'metricDate', '2026-10-30',
    'metricAlgorithmVersion', 'sku-daily-metrics-v1',
    'metricSourceWatermark', '2026-10-30T12:00:00.000Z',
    'forecastRunId', null,
    'algorithmVersion', 'inventory-decision-v1',
    'configurationVersion', 'm7-persistence-harness-config-v1',
    'algorithmVersions', pg_temp.m7_algorithm_versions(),
    'decisionReproducibilityFingerprint', 'abcd1234',
    'claimsMerchantFacing', false,
    'claimsProductionForecastApproval', false,
    'claimsM7ProductionEligibility', false,
    'algorithmApproved', false,
    'isScoredMerchantDecision', false
  );

  hashes := public.inventory_action_derive_hashes(payload);
  payload := payload
    || jsonb_build_object(
      'evidenceProvenanceFingerprint',
        hashes->>'evidenceProvenanceFingerprint',
      'decisionBodyHash',
        hashes->>'decisionBodyHash'
    );

  RETURN payload;
END;
$$;

\echo '--- Valid harness insert + identical replay ---'

DO $$
DECLARE
  payload jsonb;
  created jsonb;
  replayed jsonb;
  row_count integer;
  action_row public.inventory_actions%rowtype;
BEGIN
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );

  created := public.persist_inventory_action_recommendation(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid,
    payload
  );

  IF created->>'disposition' <> 'created' THEN
    RAISE EXCEPTION 'expected created, got %', created;
  END IF;
  IF created->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'response ok must be true: %', created;
  END IF;
  IF (created->>'claimsMerchantFacing')::boolean
    OR (created->>'claimsProductionForecastApproval')::boolean
    OR (created->>'claimsM7ProductionEligibility')::boolean
    OR (created->>'algorithmApproved')::boolean
    OR (created->>'isScoredMerchantDecision')::boolean
  THEN
    RAISE EXCEPTION 'response trust flags must be hard-false: %', created;
  END IF;
  IF created->>'decisionBodyHash' IS NULL
    OR created->>'evidenceProvenanceFingerprint' IS NULL
    OR created->>'inventoryActionId' IS NULL
  THEN
    RAISE EXCEPTION 'response contract missing ids/hashes: %', created;
  END IF;

  replayed := public.persist_inventory_action_recommendation(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid,
    payload
  );

  IF replayed->>'disposition' <> 'replayed' THEN
    RAISE EXCEPTION 'expected replayed, got %', replayed;
  END IF;
  IF replayed->>'inventoryActionId'
    IS DISTINCT FROM created->>'inventoryActionId'
  THEN
    RAISE EXCEPTION 'replay must return same inventoryActionId';
  END IF;

  SELECT count(*) INTO row_count FROM public.inventory_actions;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one row after replay, got %', row_count;
  END IF;

  SELECT * INTO action_row
  FROM public.inventory_actions
  WHERE id = (created->>'inventoryActionId')::uuid;

  IF action_row.status <> 'new'
    OR action_row.forecast_run_id IS NOT NULL
    OR action_row.claims_merchant_facing
    OR action_row.evidence_source_class
      <> 'm7_persistence_contract_harness_v1'
  THEN
    RAISE EXCEPTION 'stored row violated dormant contract: %', action_row;
  END IF;
END;
$$;

\echo '--- Same-key altered body → DECISION_IDEMPOTENCY_BODY_CONFLICT ---'

DO $$
DECLARE
  payload jsonb;
  altered jsonb;
  hashes jsonb;
  raised boolean := false;
BEGIN
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );

  -- Quantity/priority are outside provenance fingerprint ⇒ same identity,
  -- different material body ⇒ conflict (not a new historical row).
  altered := payload || jsonb_build_object(
    'recommendedQuantity', 99,
    'priority', 'critical'
  );
  altered := altered - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  hashes := public.inventory_action_derive_hashes(altered);
  altered := altered || hashes;

  IF (hashes->>'evidenceProvenanceFingerprint')
    IS DISTINCT FROM (payload->>'evidenceProvenanceFingerprint')
  THEN
    RAISE EXCEPTION
      'test setup broken: quantity change must not alter provenance fingerprint';
  END IF;

  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid,
      altered
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%DECISION_IDEMPOTENCY_BODY_CONFLICT%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'expected BODY_CONFLICT, got %', SQLERRM;
      END IF;
  END;

  IF NOT raised THEN
    RAISE EXCEPTION 'expected DECISION_IDEMPOTENCY_BODY_CONFLICT';
  END IF;
END;
$$;

\echo '--- Different evidence provenance → distinct historical rows ---'

DO $$
DECLARE
  payload jsonb;
  other jsonb;
  hashes jsonb;
  result jsonb;
  row_count integer;
BEGIN
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );

  other := payload || jsonb_build_object(
    'metricSourceWatermark', '2026-10-30T18:00:00.000Z',
    'recommendedQuantity', 15
  );
  other := other - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  hashes := public.inventory_action_derive_hashes(other);
  other := other || hashes;

  IF (hashes->>'evidenceProvenanceFingerprint')
    = (payload->>'evidenceProvenanceFingerprint')
  THEN
    RAISE EXCEPTION 'watermark change must alter provenance fingerprint';
  END IF;

  result := public.persist_inventory_action_recommendation(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid,
    other
  );

  IF result->>'disposition' <> 'created' THEN
    RAISE EXCEPTION 'distinct provenance should create, got %', result;
  END IF;

  SELECT count(*) INTO row_count FROM public.inventory_actions;
  IF row_count <> 2 THEN
    RAISE EXCEPTION 'expected two historical rows, got %', row_count;
  END IF;
END;
$$;

\echo '--- Foreign grain rejected ---'

DO $$
DECLARE
  payload jsonb;
  raised boolean := false;
BEGIN
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );

  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000023'::uuid, -- foreign location
      '71009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%DECISION_PERSISTENCE_SCOPE_ERROR%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected: %', SQLERRM;
      END IF;
  END;

  IF NOT raised THEN
    RAISE EXCEPTION 'foreign location must raise SCOPE_ERROR';
  END IF;
END;
$$;

\echo '--- Invalid quantities / HEALTHY / WATCH rules ---'

DO $$
DECLARE
  payload jsonb;
  hashes jsonb;
  raised boolean;
BEGIN
  -- Negative REORDER quantity
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );
  payload := (payload || jsonb_build_object('recommendedQuantity', -1))
    - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  hashes := public.inventory_action_derive_hashes(payload);
  payload := payload || hashes;
  raised := false;
  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%DECISION_PERSISTENCE_INVALID_PAYLOAD%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected negative qty error: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'negative REORDER quantity must be rejected';
  END IF;

  -- HEALTHY forbidden
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );
  payload := (
    payload || jsonb_build_object(
      'actionType', 'HEALTHY',
      'recommendedQuantity', null
    )
  ) - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  hashes := public.inventory_action_derive_hashes(payload);
  payload := payload || hashes;
  raised := false;
  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%DECISION_PERSISTENCE_INVALID_PAYLOAD%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected HEALTHY error: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'HEALTHY must be rejected';
  END IF;

  -- WATCH with quantity forbidden
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );
  payload := (
    payload || jsonb_build_object(
      'actionType', 'WATCH',
      'recommendedQuantity', 3,
      'evidenceSnapshot', jsonb_build_object(
        'availableQuantity', 2,
        'incomingQuantity', null,
        'demandVelocity', null,
        'daysOfStock', null,
        'leadTimeDays', null,
        'safetyStockUnits', null,
        'reorderPointUnits', null,
        'targetStockUnits', null,
        'inventoryAgeDays', null,
        'forecastExpectedDemandUnits', null,
        'dataQualityScore', null,
        'reasonCodes', jsonb_build_array('MATERIAL_UNCERTAINTY')
      )
    )
  ) - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  hashes := public.inventory_action_derive_hashes(payload);
  payload := payload || hashes;
  raised := false;
  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%DECISION_PERSISTENCE_INVALID_PAYLOAD%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected WATCH qty error: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'WATCH with quantity must be rejected';
  END IF;

  -- WATCH without reasons forbidden
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );
  payload := (
    payload || jsonb_build_object(
      'actionType', 'WATCH',
      'recommendedQuantity', null,
      'evidenceSnapshot', jsonb_build_object(
        'availableQuantity', 2,
        'incomingQuantity', null,
        'demandVelocity', null,
        'daysOfStock', null,
        'leadTimeDays', null,
        'safetyStockUnits', null,
        'reorderPointUnits', null,
        'targetStockUnits', null,
        'inventoryAgeDays', null,
        'forecastExpectedDemandUnits', null,
        'dataQualityScore', null,
        'reasonCodes', '[]'::jsonb
      )
    )
  ) - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  hashes := public.inventory_action_derive_hashes(payload);
  payload := payload || hashes;
  raised := false;
  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%DECISION_PERSISTENCE_INVALID_PAYLOAD%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected WATCH reasons error: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'WATCH without reasons must be rejected';
  END IF;
END;
$$;

\echo '--- Valid WATCH persists ---'

DO $$
DECLARE
  payload jsonb;
  hashes jsonb;
  result jsonb;
BEGIN
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );
  payload := (
    payload || jsonb_build_object(
      'actionType', 'WATCH',
      'recommendedQuantity', null,
      'recommendedActionDate', null,
      'priority', 'medium',
      'metricSourceWatermark', 'watch-watermark-v1',
      'evidenceSnapshot', jsonb_build_object(
        'availableQuantity', null,
        'incomingQuantity', null,
        'demandVelocity', null,
        'daysOfStock', null,
        'leadTimeDays', null,
        'safetyStockUnits', null,
        'reorderPointUnits', null,
        'targetStockUnits', null,
        'inventoryAgeDays', null,
        'forecastExpectedDemandUnits', null,
        'dataQualityScore', null,
        'reasonCodes', jsonb_build_array(
          'MATERIAL_UNCERTAINTY',
          'INVENTORY_STATE_UNKNOWN'
        )
      ),
      'incomingStateKnown', false
    )
  ) - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  hashes := public.inventory_action_derive_hashes(payload);
  payload := payload || hashes;

  result := public.persist_inventory_action_recommendation(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid,
    payload
  );

  IF result->>'disposition' <> 'created' THEN
    RAISE EXCEPTION 'valid WATCH should create, got %', result;
  END IF;
END;
$$;

\echo '--- forecastRunId / fixture / reserved M5 / forged trust ---'

DO $$
DECLARE
  payload jsonb;
  hashes jsonb;
  raised boolean;
BEGIN
  -- forecastRunId non-null
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );
  payload := payload || jsonb_build_object(
    'forecastRunId', '71009000-0000-4000-8000-000000000099',
    'metricSourceWatermark', 'forecast-forbidden-v1'
  );
  payload := payload - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  hashes := public.inventory_action_derive_hashes(payload);
  payload := payload || hashes;
  raised := false;
  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%FORECAST_RUN_FORBIDDEN%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected forecast error: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'non-null forecastRunId must be rejected';
  END IF;

  -- controlled_fixture_only
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );
  payload := payload || jsonb_build_object(
    'evidenceSourceClass', 'controlled_fixture_only',
    'metricSourceWatermark', 'fixture-reject-v1'
  );
  raised := false;
  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%FIXTURE_EVIDENCE_REJECTED%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected fixture class error: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'controlled_fixture_only must be rejected';
  END IF;

  -- fixtureAttestation marker
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );
  payload := payload || jsonb_build_object(
    'fixtureAttestation', 'm7-controlled-local-fixture-v1',
    'metricSourceWatermark', 'fixture-attestation-v1'
  );
  raised := false;
  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%FIXTURE_EVIDENCE_REJECTED%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected fixtureAttestation error: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'fixtureAttestation must be rejected';
  END IF;

  -- reserved M5 source
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );
  payload := payload || jsonb_build_object(
    'evidenceSourceClass', 'm5_sku_daily_metric_bound_v1',
    'metricSourceWatermark', 'm5-reserved-v1'
  );
  raised := false;
  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected m5 source error: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'm5 source class must be rejected as dormant';
  END IF;

  -- forged merchant/M7/algorithm approval
  payload := pg_temp.m7_base_payload(
    '71009000-0000-4000-8000-000000000001'::uuid,
    '71009000-0000-4000-8000-000000000002'::uuid,
    '71009000-0000-4000-8000-000000000003'::uuid,
    '71009000-0000-4000-8000-000000000005'::uuid
  );
  payload := payload || jsonb_build_object(
    'claimsMerchantFacing', true,
    'claimsM7ProductionEligibility', true,
    'algorithmApproved', true,
    'metricSourceWatermark', 'forged-trust-v1'
  );
  payload := payload - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  hashes := public.inventory_action_derive_hashes(payload);
  payload := payload || hashes;
  raised := false;
  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%PRODUCTION_TRUST_CLAIM_REJECTED%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected forged trust error: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'forged trust claims must be rejected';
  END IF;
END;
$$;

\echo '--- Body hash mismatch when caller tampers decisionBodyHash ---'

DO $$
DECLARE
  payload jsonb;
  raised boolean := false;
BEGIN
  payload := (
    pg_temp.m7_base_payload(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid
    ) || jsonb_build_object(
      'metricSourceWatermark', 'hash-tamper-v1'
    )
  );
  payload := payload - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  payload := payload || public.inventory_action_derive_hashes(payload);
  payload := jsonb_set(
    payload,
    '{decisionBodyHash}',
    to_jsonb(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'::text
    ),
    true
  );

  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '71009000-0000-4000-8000-000000000001'::uuid,
      '71009000-0000-4000-8000-000000000002'::uuid,
      '71009000-0000-4000-8000-000000000003'::uuid,
      '71009000-0000-4000-8000-000000000005'::uuid,
      payload
    );
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%DECISION_BODY_HASH_MISMATCH%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected hash mismatch error: %', SQLERRM;
      END IF;
  END;

  IF NOT raised THEN
    RAISE EXCEPTION 'tampered decisionBodyHash must be rejected';
  END IF;
END;
$$;

\echo '--- Immutable UPDATE/DELETE ---'

DO $$
DECLARE
  action_id uuid;
  raised boolean;
BEGIN
  SELECT id INTO action_id
  FROM public.inventory_actions
  LIMIT 1;

  raised := false;
  BEGIN
    UPDATE public.inventory_actions
    SET priority = 'low'
    WHERE id = action_id;
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%immutable%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected update error: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'UPDATE must be blocked';
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.inventory_actions WHERE id = action_id;
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%immutable%' THEN
        raised := true;
      ELSE
        RAISE EXCEPTION 'unexpected delete error: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'DELETE must be blocked';
  END IF;
END;
$$;

\echo '--- RLS member select isolation ---'

DO $$
DECLARE
  visible_owner integer;
  visible_foreign integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '71009000-0000-4000-8000-000000000007', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO visible_owner
  FROM public.inventory_actions
  WHERE organization_id = '71009000-0000-4000-8000-000000000001'::uuid;

  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '71009000-0000-4000-8000-000000000008', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO visible_foreign
  FROM public.inventory_actions
  WHERE organization_id = '71009000-0000-4000-8000-000000000001'::uuid;

  RESET ROLE;

  IF visible_owner < 1 THEN
    RAISE EXCEPTION 'owner must see own org inventory_actions';
  END IF;
  IF visible_foreign <> 0 THEN
    RAISE EXCEPTION 'foreign member must not see org A actions';
  END IF;
END;
$$;

\echo '=== M7.2b INVENTORY ACTION PERSISTENCE ADVERSARIAL PASSED ==='

ROLLBACK;
