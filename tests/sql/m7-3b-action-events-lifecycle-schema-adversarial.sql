\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M7.3b ACTION EVENTS / LIFECYCLE SCHEMA ADVERSARIAL ==='

\set org_a '72009000-0000-4000-8000-000000000001'
\set org_b '72009000-0000-4000-8000-000000000011'
\set store_a '72009000-0000-4000-8000-000000000002'
\set store_b '72009000-0000-4000-8000-000000000012'
\set location_a '72009000-0000-4000-8000-000000000003'
\set location_b '72009000-0000-4000-8000-000000000023'
\set product_a '72009000-0000-4000-8000-000000000004'
\set product_b '72009000-0000-4000-8000-000000000014'
\set variant_a '72009000-0000-4000-8000-000000000005'
\set variant_a2 '72009000-0000-4000-8000-000000000006'
\set variant_b '72009000-0000-4000-8000-000000000025'
\set user_owner '72009000-0000-4000-8000-000000000007'
\set user_foreign '72009000-0000-4000-8000-000000000008'
\set user_analyst '72009000-0000-4000-8000-000000000009'

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
(
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm73b-owner@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_foreign'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm73b-foreign@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_analyst'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm73b-analyst@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'M7.3b Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'M7.3b Org B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (:'org_a'::uuid, :'user_owner'::uuid, 'owner'),
  (:'org_a'::uuid, :'user_analyst'::uuid, 'analyst'),
  (:'org_b'::uuid, :'user_foreign'::uuid, 'owner');

INSERT INTO public.stores (id, organization_id, name, status, currency, timezone)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'M73b Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'M73b Store B', 'active', 'USD', 'UTC');

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
  (:'variant_a2'::uuid, :'org_a'::uuid, :'store_a'::uuid, :'product_a'::uuid, 'SKU-A2', 'active'),
  (:'variant_b'::uuid, :'org_b'::uuid, :'store_b'::uuid, :'product_b'::uuid, 'SKU-B', 'active');

\echo '--- Schema: status vocabulary + superseded_by + action_events exist ---'

DO $$
DECLARE
  status_check text;
  has_superseded boolean;
  has_events boolean;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
  INTO status_check
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'inventory_actions'
    AND c.conname = 'inventory_actions_status_check';

  IF status_check IS NULL
    OR status_check NOT ILIKE '%accepted_with_edit%'
    OR status_check NOT ILIKE '%superseded%'
  THEN
    RAISE EXCEPTION 'status check missing domain vocabulary: %', status_check;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'inventory_actions'
      AND c.conname = 'inventory_actions_status_new_only'
  ) THEN
    RAISE EXCEPTION 'status_new_only must be replaced';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_actions'
      AND column_name = 'superseded_by_action_id'
  ) INTO has_superseded;

  IF NOT has_superseded THEN
    RAISE EXCEPTION 'superseded_by_action_id missing';
  END IF;

  SELECT to_regclass('public.action_events') IS NOT NULL INTO has_events;
  IF NOT has_events THEN
    RAISE EXCEPTION 'action_events table missing';
  END IF;
END;
$$;

\echo '--- Privileges: no direct DML on action_events; SELECT only ---'

DO $$
DECLARE
  insert_priv boolean;
  update_priv boolean;
  delete_priv boolean;
BEGIN
  SELECT
    has_table_privilege('authenticated', 'public.action_events', 'INSERT'),
    has_table_privilege('authenticated', 'public.action_events', 'UPDATE'),
    has_table_privilege('authenticated', 'public.action_events', 'DELETE')
  INTO insert_priv, update_priv, delete_priv;

  IF insert_priv OR update_priv OR delete_priv THEN
    RAISE EXCEPTION 'authenticated must not have action_events DML';
  END IF;

  SELECT
    has_table_privilege('service_role', 'public.action_events', 'INSERT'),
    has_table_privilege('service_role', 'public.action_events', 'UPDATE'),
    has_table_privilege('service_role', 'public.action_events', 'DELETE')
  INTO insert_priv, update_priv, delete_priv;

  IF insert_priv OR update_priv OR delete_priv THEN
    RAISE EXCEPTION 'service_role must not have direct action_events DML';
  END IF;

  SELECT
    has_table_privilege('authenticated', 'public.inventory_actions', 'UPDATE'),
    has_table_privilege('service_role', 'public.inventory_actions', 'UPDATE')
  INTO update_priv, delete_priv;

  IF update_priv OR delete_priv THEN
    RAISE EXCEPTION 'inventory_actions UPDATE must remain ungated for roles';
  END IF;
END;
$$;

\echo '--- Helpers ---'

CREATE FUNCTION pg_temp.m73b_base_evidence()
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

CREATE FUNCTION pg_temp.m73b_algorithm_versions()
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'decisionEngine', 'inventory-decision-v1',
    'metrics', 'm5-contract',
    'forecast', null
  );
$$;

CREATE FUNCTION pg_temp.m73b_base_payload(
  p_org uuid,
  p_store uuid,
  p_location uuid,
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
    'organizationId', p_org,
    'storeId', p_store,
    'locationId', p_location,
    'variantId', p_variant,
    'decisionAsOfDate', '2026-10-31',
    'pinnedTimeZone', 'UTC',
    'actionType', 'REORDER',
    'compatibleSecondaryActionTypes', '[]'::jsonb,
    'priority', 'high',
    'status', 'new',
    'recommendedQuantity', 40,
    'recommendedActionDate', '2026-10-31',
    'confidence', 'high',
    'evidenceSnapshot', pg_temp.m73b_base_evidence(),
    'incomingStateKnown', true,
    'evidenceSourceClass', 'm7_persistence_contract_harness_v1',
    'metricDate', '2026-10-31',
    'metricAlgorithmVersion', 'm5-test-v1',
    'metricSourceWatermark', 'm73b-watermark-reorder-v1',
    'forecastRunId', null,
    'algorithmVersion', 'inventory-decision-v1',
    'configurationVersion', 'm7-config-v1',
    'algorithmVersions', pg_temp.m73b_algorithm_versions(),
    'decisionReproducibilityFingerprint', 'abcd1234',
    'claimsMerchantFacing', false,
    'claimsProductionForecastApproval', false,
    'claimsM7ProductionEligibility', false,
    'algorithmApproved', false,
    'isScoredMerchantDecision', false
  );
  hashes := public.inventory_action_derive_hashes(payload);
  RETURN payload || hashes;
END;
$$;

CREATE FUNCTION pg_temp.m73b_event_hash(p_seed text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT encode(extensions.digest(p_seed, 'sha256'), 'hex');
$$;

\echo '--- Persist harness REORDER + REDUCE (M7.2 path preserved) ---'

DO $$
DECLARE
  payload jsonb;
  result jsonb;
  reorder_id uuid;
  reduce_id uuid;
  action_row public.inventory_actions%rowtype;
  event_count bigint;
BEGIN
  payload := pg_temp.m73b_base_payload(
    '72009000-0000-4000-8000-000000000001'::uuid,
    '72009000-0000-4000-8000-000000000002'::uuid,
    '72009000-0000-4000-8000-000000000003'::uuid,
    '72009000-0000-4000-8000-000000000005'::uuid
  );

  result := public.persist_inventory_action_recommendation(
    '72009000-0000-4000-8000-000000000001'::uuid,
    '72009000-0000-4000-8000-000000000002'::uuid,
    '72009000-0000-4000-8000-000000000003'::uuid,
    '72009000-0000-4000-8000-000000000005'::uuid,
    payload
  );
  IF result->>'disposition' <> 'created' THEN
    RAISE EXCEPTION 'REORDER create failed: %', result;
  END IF;
  reorder_id := (result->>'inventoryActionId')::uuid;

  -- Replay same body
  result := public.persist_inventory_action_recommendation(
    '72009000-0000-4000-8000-000000000001'::uuid,
    '72009000-0000-4000-8000-000000000002'::uuid,
    '72009000-0000-4000-8000-000000000003'::uuid,
    '72009000-0000-4000-8000-000000000005'::uuid,
    payload
  );
  IF result->>'disposition' <> 'replayed'
    OR (result->>'inventoryActionId')::uuid IS DISTINCT FROM reorder_id
  THEN
    RAISE EXCEPTION 'REORDER replay failed: %', result;
  END IF;

  SELECT * INTO action_row FROM public.inventory_actions WHERE id = reorder_id;
  IF action_row.status <> 'new'
    OR action_row.superseded_by_action_id IS NOT NULL
    OR action_row.claims_merchant_facing
    OR action_row.claims_m7_production_eligibility
    OR action_row.evidence_source_class
      <> 'm7_persistence_contract_harness_v1'
  THEN
    RAISE EXCEPTION 'harness row must remain dormant/new: %', action_row;
  END IF;

  SELECT count(*) INTO event_count
  FROM public.action_events
  WHERE inventory_action_id = reorder_id;
  IF event_count <> 0 THEN
    RAISE EXCEPTION 'must not backfill created events on harness rows';
  END IF;

  -- REDUCE sibling for edit-qty rejection
  payload := (
    payload || jsonb_build_object(
      'actionType', 'REDUCE',
      'recommendedQuantity', null,
      'priority', 'high',
      'compatibleSecondaryActionTypes', jsonb_build_array('PROMOTE'),
      'metricSourceWatermark', 'm73b-watermark-reduce-v1',
      'evidenceSnapshot', jsonb_build_object(
        'availableQuantity', 40,
        'incomingQuantity', 10,
        'demandVelocity', 0.5,
        'daysOfStock', 80,
        'leadTimeDays', 7,
        'safetyStockUnits', 3,
        'reorderPointUnits', 10,
        'targetStockUnits', 20,
        'inventoryAgeDays', 30,
        'forecastExpectedDemandUnits', null,
        'dataQualityScore', 0.8,
        'reasonCodes', jsonb_build_array('OVERSTOCK_RISK_HIGH', 'ABOVE_TARGET_STOCK')
      )
    )
  ) - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  payload := payload || public.inventory_action_derive_hashes(payload);

  result := public.persist_inventory_action_recommendation(
    '72009000-0000-4000-8000-000000000001'::uuid,
    '72009000-0000-4000-8000-000000000002'::uuid,
    '72009000-0000-4000-8000-000000000003'::uuid,
    '72009000-0000-4000-8000-000000000005'::uuid,
    payload
  );
  IF result->>'disposition' <> 'created' THEN
    RAISE EXCEPTION 'REDUCE create failed: %', result;
  END IF;
  reduce_id := (result->>'inventoryActionId')::uuid;

  PERFORM set_config('m73b.reorder_id', reorder_id::text, true);
  PERFORM set_config('m73b.reduce_id', reduce_id::text, true);
END;
$$;

\echo '--- Full-row immutability still blocks status / superseded_by UPDATE ---'

DO $$
DECLARE
  reorder_id uuid := current_setting('m73b.reorder_id')::uuid;
  raised boolean;
BEGIN
  raised := false;
  BEGIN
    UPDATE public.inventory_actions
    SET status = 'accepted'
    WHERE id = reorder_id;
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%immutable%' THEN
        RAISE EXCEPTION 'expected immutability error, got: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'status UPDATE must remain blocked without lifecycle RPC gate';
  END IF;

  raised := false;
  BEGIN
    UPDATE public.inventory_actions
    SET recommended_quantity = 99
    WHERE id = reorder_id;
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%immutable%' THEN
        RAISE EXCEPTION 'expected immutability error, got: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'recommendation UPDATE must remain blocked';
  END IF;
END;
$$;

\echo '--- Status CHECK accepts domain vocabulary / rejects unknown ---'

DO $$
DECLARE
  raised boolean;
BEGIN
  -- Direct INSERT as table owner to prove vocabulary CHECK (not a public path).
  raised := false;
  BEGIN
    INSERT INTO public.inventory_actions (
      organization_id, store_id, location_id, variant_id,
      decision_as_of_date, pinned_time_zone,
      action_type, priority, status,
      recommended_quantity, recommended_action_date, confidence,
      evidence_snapshot, incoming_state_known,
      evidence_source_class, metric_date, metric_algorithm_version,
      metric_source_watermark, forecast_run_id,
      algorithm_version, configuration_version, algorithm_versions,
      decision_reproducibility_fingerprint,
      evidence_provenance_fingerprint, decision_body_hash,
      claims_merchant_facing, claims_production_forecast_approval,
      claims_m7_production_eligibility, algorithm_approved,
      is_scored_merchant_decision
    ) VALUES (
      '72009000-0000-4000-8000-000000000001'::uuid,
      '72009000-0000-4000-8000-000000000002'::uuid,
      '72009000-0000-4000-8000-000000000003'::uuid,
      '72009000-0000-4000-8000-000000000005'::uuid,
      '2026-11-01', 'UTC',
      'WATCH', 'low', 'not_a_status',
      null, null, 'low',
      jsonb_build_object(
        'availableQuantity', 1, 'incomingQuantity', 0, 'demandVelocity', 0,
        'daysOfStock', 1, 'leadTimeDays', 1, 'safetyStockUnits', 1,
        'reorderPointUnits', 1, 'targetStockUnits', 1, 'inventoryAgeDays', 1,
        'forecastExpectedDemandUnits', null, 'dataQualityScore', 0.5,
        'reasonCodes', jsonb_build_array('MATERIAL_UNCERTAINTY')
      ),
      true,
      'm7_persistence_contract_harness_v1', '2026-11-01', 'm5-test-v1',
      'status-vocab-reject', null,
      'inventory-decision-v1', 'm7-config-v1', '{}'::jsonb,
      'abcd1234',
      repeat('a', 64), repeat('b', 64),
      false, false, false, false, false
    );
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'unknown status must violate status check';
  END IF;
END;
$$;

\echo '--- Event INSERT: valid REORDER accepted_with_edit; append-only ---'

DO $$
DECLARE
  reorder_id uuid := current_setting('m73b.reorder_id')::uuid;
  reduce_id uuid := current_setting('m73b.reduce_id')::uuid;
  event_id uuid;
  raised boolean;
BEGIN
  -- M7.3c+ requires the trusted lifecycle gate even for owner structural inserts.
  PERFORM set_config(
    'storeagent.inventory_action_lifecycle_gate',
    'trusted_lifecycle_rpc_v1',
    true
  );

  INSERT INTO public.action_events (
    organization_id, store_id, variant_id, inventory_action_id,
    event_type, edited_quantity, note, actor_user_id,
    from_status, to_status, idempotency_key, event_body_hash
  ) VALUES (
    '72009000-0000-4000-8000-000000000001'::uuid,
    '72009000-0000-4000-8000-000000000002'::uuid,
    '72009000-0000-4000-8000-000000000005'::uuid,
    reorder_id,
    'accepted_with_edit', 25, 'schema proof only',
    '72009000-0000-4000-8000-000000000007'::uuid,
    'new', 'accepted_with_edit', 'edit-1',
    pg_temp.m73b_event_hash('edit-1')
  )
  RETURNING id INTO event_id;

  raised := false;
  BEGIN
    UPDATE public.action_events
    SET note = 'mutated'
    WHERE id = event_id;
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%immutable%' THEN
        RAISE EXCEPTION 'expected event immutability, got: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'action_events UPDATE must be blocked';
  END IF;

  raised := false;
  BEGIN
    DELETE FROM public.action_events WHERE id = event_id;
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%immutable%' THEN
        RAISE EXCEPTION 'expected event immutability, got: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'action_events DELETE must be blocked';
  END IF;

  -- REDUCE cannot carry editedQuantity / accepted_with_edit
  PERFORM set_config(
    'storeagent.inventory_action_lifecycle_gate',
    'trusted_lifecycle_rpc_v1',
    true
  );
  raised := false;
  BEGIN
    INSERT INTO public.action_events (
      organization_id, store_id, variant_id, inventory_action_id,
      event_type, edited_quantity, note, actor_user_id,
      from_status, to_status, idempotency_key, event_body_hash
    ) VALUES (
      '72009000-0000-4000-8000-000000000001'::uuid,
      '72009000-0000-4000-8000-000000000002'::uuid,
      '72009000-0000-4000-8000-000000000005'::uuid,
      reduce_id,
      'accepted_with_edit', 3, null, null,
      'new', 'accepted_with_edit', 'reduce-edit-forbidden',
      pg_temp.m73b_event_hash('reduce-edit-forbidden')
    );
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%ACTION_EVENT_EDIT_REQUIRES_REORDER%' THEN
        RAISE EXCEPTION 'expected EDIT_REQUIRES_REORDER, got: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'REDUCE accepted_with_edit must be rejected';
  END IF;

  -- editedQuantity equal to recommendation rejected
  PERFORM set_config(
    'storeagent.inventory_action_lifecycle_gate',
    'trusted_lifecycle_rpc_v1',
    true
  );
  raised := false;
  BEGIN
    INSERT INTO public.action_events (
      organization_id, store_id, variant_id, inventory_action_id,
      event_type, edited_quantity, note, actor_user_id,
      from_status, to_status, idempotency_key, event_body_hash
    ) VALUES (
      '72009000-0000-4000-8000-000000000001'::uuid,
      '72009000-0000-4000-8000-000000000002'::uuid,
      '72009000-0000-4000-8000-000000000005'::uuid,
      reorder_id,
      'accepted_with_edit', 40, null, null,
      'new', 'accepted_with_edit', 'edit-same-qty',
      pg_temp.m73b_event_hash('edit-same-qty')
    );
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%ACTION_EVENT_EDITED_QUANTITY_INVALID%' THEN
        RAISE EXCEPTION 'expected EDITED_QUANTITY_INVALID, got: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'same-quantity edit must be rejected';
  END IF;

  -- Grain mismatch rejected (same org/store FK-valid variant, wrong for action)
  PERFORM set_config(
    'storeagent.inventory_action_lifecycle_gate',
    'trusted_lifecycle_rpc_v1',
    true
  );
  raised := false;
  BEGIN
    INSERT INTO public.action_events (
      organization_id, store_id, variant_id, inventory_action_id,
      event_type, edited_quantity, note, actor_user_id,
      from_status, to_status, idempotency_key, event_body_hash
    ) VALUES (
      '72009000-0000-4000-8000-000000000001'::uuid,
      '72009000-0000-4000-8000-000000000002'::uuid,
      '72009000-0000-4000-8000-000000000006'::uuid,
      reorder_id,
      'dismissed', null, null, null,
      'new', 'dismissed', 'grain-mismatch',
      pg_temp.m73b_event_hash('grain-mismatch')
    );
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%ACTION_EVENT_GRAIN_MISMATCH%' THEN
        RAISE EXCEPTION 'expected ACTION_EVENT_GRAIN_MISMATCH, got: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'cross-grain event insert must fail';
  END IF;

  -- Idempotency unique conflict
  PERFORM set_config(
    'storeagent.inventory_action_lifecycle_gate',
    'trusted_lifecycle_rpc_v1',
    true
  );
  raised := false;
  BEGIN
    INSERT INTO public.action_events (
      organization_id, store_id, variant_id, inventory_action_id,
      event_type, edited_quantity, note, actor_user_id,
      from_status, to_status, idempotency_key, event_body_hash
    ) VALUES (
      '72009000-0000-4000-8000-000000000001'::uuid,
      '72009000-0000-4000-8000-000000000002'::uuid,
      '72009000-0000-4000-8000-000000000005'::uuid,
      reorder_id,
      'accepted_with_edit', 26, null, null,
      'new', 'accepted_with_edit', 'edit-1',
      pg_temp.m73b_event_hash('edit-1-conflict-body')
    );
  EXCEPTION
    WHEN unique_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'duplicate idempotency identity must conflict';
  END IF;
END;
$$;

\echo '--- Tenant FK: superseded_by cannot point across organizations ---'

DO $$
DECLARE
  local_id uuid := current_setting('m73b.reorder_id')::uuid;
  foreign_payload jsonb;
  foreign_result jsonb;
  foreign_id uuid;
  raised boolean;
BEGIN
  foreign_payload := pg_temp.m73b_base_payload(
    '72009000-0000-4000-8000-000000000011'::uuid,
    '72009000-0000-4000-8000-000000000012'::uuid,
    '72009000-0000-4000-8000-000000000023'::uuid,
    '72009000-0000-4000-8000-000000000025'::uuid
  );
  foreign_payload := (
    foreign_payload || jsonb_build_object(
      'metricSourceWatermark', 'm73b-foreign-watermark-v1'
    )
  ) - 'decisionBodyHash' - 'evidenceProvenanceFingerprint';
  foreign_payload :=
    foreign_payload || public.inventory_action_derive_hashes(foreign_payload);

  foreign_result := public.persist_inventory_action_recommendation(
    '72009000-0000-4000-8000-000000000011'::uuid,
    '72009000-0000-4000-8000-000000000012'::uuid,
    '72009000-0000-4000-8000-000000000023'::uuid,
    '72009000-0000-4000-8000-000000000025'::uuid,
    foreign_payload
  );
  foreign_id := (foreign_result->>'inventoryActionId')::uuid;

  -- Coherence + tenant FK cannot be exercised via UPDATE (immutable).
  -- Prove composite FK definition rejects cross-org pairing via a constrained
  -- INSERT attempt that would set superseded_by to a foreign id while keeping
  -- local organization_id (CHECK also demands status=superseded).
  raised := false;
  BEGIN
    INSERT INTO public.inventory_actions (
      organization_id, store_id, location_id, variant_id,
      decision_as_of_date, pinned_time_zone,
      action_type, priority, status,
      recommended_quantity, recommended_action_date, confidence,
      evidence_snapshot, incoming_state_known,
      evidence_source_class, metric_date, metric_algorithm_version,
      metric_source_watermark, forecast_run_id,
      algorithm_version, configuration_version, algorithm_versions,
      decision_reproducibility_fingerprint,
      evidence_provenance_fingerprint, decision_body_hash,
      claims_merchant_facing, claims_production_forecast_approval,
      claims_m7_production_eligibility, algorithm_approved,
      is_scored_merchant_decision, superseded_by_action_id
    ) VALUES (
      '72009000-0000-4000-8000-000000000001'::uuid,
      '72009000-0000-4000-8000-000000000002'::uuid,
      '72009000-0000-4000-8000-000000000003'::uuid,
      '72009000-0000-4000-8000-000000000005'::uuid,
      '2026-11-02', 'UTC',
      'WATCH', 'low', 'superseded',
      null, null, 'low',
      jsonb_build_object(
        'availableQuantity', 1, 'incomingQuantity', 0, 'demandVelocity', 0,
        'daysOfStock', 1, 'leadTimeDays', 1, 'safetyStockUnits', 1,
        'reorderPointUnits', 1, 'targetStockUnits', 1, 'inventoryAgeDays', 1,
        'forecastExpectedDemandUnits', null, 'dataQualityScore', 0.5,
        'reasonCodes', jsonb_build_array('MATERIAL_UNCERTAINTY')
      ),
      true,
      'm7_persistence_contract_harness_v1', '2026-11-02', 'm5-test-v1',
      'cross-org-supersede', null,
      'inventory-decision-v1', 'm7-config-v1', '{}'::jsonb,
      'abcd1234',
      repeat('c', 64), repeat('d', 64),
      false, false, false, false, false,
      foreign_id
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'cross-org superseded_by must violate tenant-safe FK';
  END IF;

  -- Self-supersede rejected by CHECK even on INSERT
  raised := false;
  BEGIN
    INSERT INTO public.inventory_actions (
      id, organization_id, store_id, location_id, variant_id,
      decision_as_of_date, pinned_time_zone,
      action_type, priority, status,
      recommended_quantity, recommended_action_date, confidence,
      evidence_snapshot, incoming_state_known,
      evidence_source_class, metric_date, metric_algorithm_version,
      metric_source_watermark, forecast_run_id,
      algorithm_version, configuration_version, algorithm_versions,
      decision_reproducibility_fingerprint,
      evidence_provenance_fingerprint, decision_body_hash,
      claims_merchant_facing, claims_production_forecast_approval,
      claims_m7_production_eligibility, algorithm_approved,
      is_scored_merchant_decision, superseded_by_action_id
    ) VALUES (
      '72009000-0000-4000-8000-0000000000aa'::uuid,
      '72009000-0000-4000-8000-000000000001'::uuid,
      '72009000-0000-4000-8000-000000000002'::uuid,
      '72009000-0000-4000-8000-000000000003'::uuid,
      '72009000-0000-4000-8000-000000000005'::uuid,
      '2026-11-03', 'UTC',
      'WATCH', 'low', 'superseded',
      null, null, 'low',
      jsonb_build_object(
        'availableQuantity', 1, 'incomingQuantity', 0, 'demandVelocity', 0,
        'daysOfStock', 1, 'leadTimeDays', 1, 'safetyStockUnits', 1,
        'reorderPointUnits', 1, 'targetStockUnits', 1, 'inventoryAgeDays', 1,
        'forecastExpectedDemandUnits', null, 'dataQualityScore', 0.5,
        'reasonCodes', jsonb_build_array('MATERIAL_UNCERTAINTY')
      ),
      true,
      'm7_persistence_contract_harness_v1', '2026-11-03', 'm5-test-v1',
      'self-supersede', null,
      'inventory-decision-v1', 'm7-config-v1', '{}'::jsonb,
      'abcd1234',
      repeat('e', 64), repeat('f', 64),
      false, false, false, false, false,
      '72009000-0000-4000-8000-0000000000aa'::uuid
    );
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'self-supersede must violate CHECK';
  END IF;

  PERFORM set_config('m73b.foreign_id', foreign_id::text, true);
  PERFORM set_config('m73b.local_id', local_id::text, true);
END;
$$;

\echo '--- RLS: member SELECT; cross-org denied; no authenticated INSERT ---'

DO $$
DECLARE
  reorder_id uuid := current_setting('m73b.reorder_id')::uuid;
  visible_owner int;
  visible_foreign int;
  raised boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '72009000-0000-4000-8000-000000000007', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO visible_owner
  FROM public.action_events
  WHERE inventory_action_id = reorder_id;

  raised := false;
  BEGIN
    INSERT INTO public.action_events (
      organization_id, store_id, variant_id, inventory_action_id,
      event_type, edited_quantity, note, actor_user_id,
      from_status, to_status, idempotency_key, event_body_hash
    ) VALUES (
      '72009000-0000-4000-8000-000000000001'::uuid,
      '72009000-0000-4000-8000-000000000002'::uuid,
      '72009000-0000-4000-8000-000000000005'::uuid,
      reorder_id,
      'dismissed', null, 'client insert', null,
      'new', 'dismissed', 'auth-insert',
      encode(extensions.digest('auth-insert', 'sha256'), 'hex')
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
    WHEN OTHERS THEN
      raised := true;
  END;

  RESET ROLE;

  IF visible_owner < 1 THEN
    RAISE EXCEPTION 'org member must SELECT own action_events';
  END IF;
  IF NOT raised THEN
    RAISE EXCEPTION 'authenticated INSERT on action_events must fail';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '72009000-0000-4000-8000-000000000008', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO visible_foreign
  FROM public.action_events
  WHERE inventory_action_id = reorder_id;

  RESET ROLE;

  IF visible_foreign <> 0 THEN
    RAISE EXCEPTION 'foreign org must not see action_events';
  END IF;
END;
$$;

\echo '=== M7.3b ACTION EVENTS / LIFECYCLE SCHEMA ADVERSARIAL PASSED ==='

ROLLBACK;
