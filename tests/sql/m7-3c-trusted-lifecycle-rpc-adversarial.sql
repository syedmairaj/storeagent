\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M7.3c TRUSTED LIFECYCLE RPC ADVERSARIAL (fail-closed eligibility) ==='

\set org_a '73009000-0000-4000-8000-000000000001'
\set org_b '73009000-0000-4000-8000-000000000011'
\set store_a '73009000-0000-4000-8000-000000000002'
\set store_b '73009000-0000-4000-8000-000000000012'
\set location_a '73009000-0000-4000-8000-000000000003'
\set location_b '73009000-0000-4000-8000-000000000023'
\set product_a '73009000-0000-4000-8000-000000000004'
\set product_b '73009000-0000-4000-8000-000000000014'
\set variant_a '73009000-0000-4000-8000-000000000005'
\set variant_b '73009000-0000-4000-8000-000000000025'
\set user_owner '73009000-0000-4000-8000-000000000007'
\set user_admin '73009000-0000-4000-8000-000000000017'
\set user_operator '73009000-0000-4000-8000-000000000027'
\set user_analyst '73009000-0000-4000-8000-000000000037'
\set user_foreign '73009000-0000-4000-8000-000000000008'

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
(
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm73c-owner@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_admin'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm73c-admin@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_operator'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm73c-operator@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_analyst'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm73c-analyst@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_foreign'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'm73c-foreign@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'M7.3c Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'M7.3c Org B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (:'org_a'::uuid, :'user_owner'::uuid, 'owner'),
  (:'org_a'::uuid, :'user_admin'::uuid, 'admin'),
  (:'org_a'::uuid, :'user_operator'::uuid, 'operator'),
  (:'org_a'::uuid, :'user_analyst'::uuid, 'analyst'),
  (:'org_b'::uuid, :'user_foreign'::uuid, 'owner');

INSERT INTO public.stores (id, organization_id, name, status, currency, timezone)
VALUES
  (:'store_a'::uuid, :'org_a'::uuid, 'M73c Store A', 'active', 'USD', 'UTC'),
  (:'store_b'::uuid, :'org_b'::uuid, 'M73c Store B', 'active', 'USD', 'UTC');

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

\echo '--- Grants ---'

DO $$
DECLARE
  exec_auth boolean;
  exec_service boolean;
  exec_anon boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.transition_inventory_action_merchant(uuid,text,integer,text,text)',
    'EXECUTE'
  ) INTO exec_auth;
  SELECT has_function_privilege(
    'service_role',
    'public.transition_inventory_action_merchant(uuid,text,integer,text,text)',
    'EXECUTE'
  ) INTO exec_service;
  SELECT has_function_privilege(
    'anon',
    'public.transition_inventory_action_merchant(uuid,text,integer,text,text)',
    'EXECUTE'
  ) INTO exec_anon;
  IF NOT exec_auth OR exec_service OR exec_anon THEN
    RAISE EXCEPTION 'merchant RPC EXECUTE grants incorrect';
  END IF;

  SELECT has_function_privilege(
    'service_role',
    'public.expire_inventory_action_system(uuid,text,text)',
    'EXECUTE'
  ) INTO exec_service;
  SELECT has_function_privilege(
    'authenticated',
    'public.expire_inventory_action_system(uuid,text,text)',
    'EXECUTE'
  ) INTO exec_auth;
  IF NOT exec_service OR exec_auth THEN
    RAISE EXCEPTION 'expire RPC EXECUTE grants incorrect';
  END IF;

  SELECT has_function_privilege(
    'service_role',
    'public.supersede_inventory_action_system(uuid,uuid,text,text)',
    'EXECUTE'
  ) INTO exec_service;
  SELECT has_function_privilege(
    'authenticated',
    'public.supersede_inventory_action_system(uuid,uuid,text,text)',
    'EXECUTE'
  ) INTO exec_auth;
  IF NOT exec_service OR exec_auth THEN
    RAISE EXCEPTION 'supersede RPC EXECUTE grants incorrect';
  END IF;
END;
$$;

\echo '--- Helpers ---'

CREATE FUNCTION pg_temp.m73c_evidence()
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

CREATE FUNCTION pg_temp.m73c_as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE FUNCTION pg_temp.m73c_eligibility_def()
RETURNS text
LANGUAGE sql
AS $$
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'inventory_action_is_merchant_approvable';
$$;

CREATE FUNCTION pg_temp.m73c_persist_harness(p_watermark text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  payload jsonb;
  hashes jsonb;
  result jsonb;
BEGIN
  payload := jsonb_build_object(
    'organizationId', '73009000-0000-4000-8000-000000000001'::uuid,
    'storeId', '73009000-0000-4000-8000-000000000002'::uuid,
    'locationId', '73009000-0000-4000-8000-000000000003'::uuid,
    'variantId', '73009000-0000-4000-8000-000000000005'::uuid,
    'decisionAsOfDate', '2026-10-31',
    'pinnedTimeZone', 'UTC',
    'actionType', 'REORDER',
    'compatibleSecondaryActionTypes', '[]'::jsonb,
    'priority', 'high',
    'status', 'new',
    'recommendedQuantity', 40,
    'recommendedActionDate', '2026-10-31',
    'confidence', 'high',
    'evidenceSnapshot', pg_temp.m73c_evidence(),
    'incomingStateKnown', true,
    'evidenceSourceClass', 'm7_persistence_contract_harness_v1',
    'metricDate', '2026-10-31',
    'metricAlgorithmVersion', 'm5-test-v1',
    'metricSourceWatermark', p_watermark,
    'forecastRunId', null,
    'algorithmVersion', 'inventory-decision-v1',
    'configurationVersion', 'm7-config-v1',
    'algorithmVersions', jsonb_build_object('decisionEngine', 'inventory-decision-v1'),
    'decisionReproducibilityFingerprint', 'abcd1234',
    'claimsMerchantFacing', false,
    'claimsProductionForecastApproval', false,
    'claimsM7ProductionEligibility', false,
    'algorithmApproved', false,
    'isScoredMerchantDecision', false
  );
  hashes := public.inventory_action_derive_hashes(payload);
  payload := payload || hashes;
  result := public.persist_inventory_action_recommendation(
    '73009000-0000-4000-8000-000000000001'::uuid,
    '73009000-0000-4000-8000-000000000002'::uuid,
    '73009000-0000-4000-8000-000000000003'::uuid,
    '73009000-0000-4000-8000-000000000005'::uuid,
    payload
  );
  RETURN (result->>'inventoryActionId')::uuid;
END;
$$;

\echo '--- Deployed schema: fail-closed eligibility + forged trust / probe rejected ---'

DO $$
DECLARE
  harness_id uuid;
  raised boolean;
  trust_ck text;
  source_ck text;
  eligible boolean;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
  INTO trust_ck
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'inventory_actions'
    AND c.conname = 'inventory_actions_trust_hard_false';

  IF trust_ck IS NULL OR trust_ck NOT ILIKE '%claims_merchant_facing = false%' THEN
    RAISE EXCEPTION 'universal trust_hard_false missing: %', trust_ck;
  END IF;

  SELECT pg_get_constraintdef(c.oid)
  INTO source_ck
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'inventory_actions'
    AND c.conname = 'inventory_actions_source_class_check';

  IF source_ck ILIKE '%m7_lifecycle_eligibility_probe_v1%' THEN
    RAISE EXCEPTION 'deployable source_class must not include eligibility probe';
  END IF;

  harness_id := pg_temp.m73c_persist_harness('m73c-harness-failclosed-v1');
  PERFORM set_config('m73c.harness_id', harness_id::text, true);

  SELECT public.inventory_action_is_merchant_approvable(a)
  INTO eligible
  FROM public.inventory_actions a
  WHERE a.id = harness_id;
  IF eligible IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'deployed eligibility must be false for harness';
  END IF;

  -- Owner cannot approve harness under deployed eligibility
  PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000007'::uuid);
  raised := false;
  BEGIN
    PERFORM public.transition_inventory_action_merchant(
      harness_id, 'accepted', null, null, 'harness-accept'
    );
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%ACTION_NOT_MERCHANT_APPROVABLE%' THEN
        RAISE EXCEPTION 'expected NOT_MERCHANT_APPROVABLE, got: %', SQLERRM;
      END IF;
  END;
  RESET ROLE;
  IF NOT raised THEN
    RAISE EXCEPTION 'harness merchant accept must fail under deployed schema';
  END IF;

  -- Privileged INSERT with forged trust flags blocked by CHECK
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
      '73009000-0000-4000-8000-000000000001'::uuid,
      '73009000-0000-4000-8000-000000000002'::uuid,
      '73009000-0000-4000-8000-000000000003'::uuid,
      '73009000-0000-4000-8000-000000000005'::uuid,
      '2026-11-01', 'UTC',
      'REORDER', 'high', 'new',
      10, '2026-11-01', 'high',
      pg_temp.m73c_evidence(), true,
      'm7_persistence_contract_harness_v1', '2026-11-01', 'm5-test-v1',
      'forged-trust-v1', null,
      'inventory-decision-v1', 'm7-config-v1', '{}'::jsonb,
      'abcd1234',
      repeat('a', 64), repeat('b', 64),
      true, false, true, true, true
    );
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'forged trust flags must violate trust_hard_false';
  END IF;

  -- Probe source class rejected by CHECK
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
      '73009000-0000-4000-8000-000000000001'::uuid,
      '73009000-0000-4000-8000-000000000002'::uuid,
      '73009000-0000-4000-8000-000000000003'::uuid,
      '73009000-0000-4000-8000-000000000005'::uuid,
      '2026-11-02', 'UTC',
      'REORDER', 'high', 'new',
      10, '2026-11-02', 'high',
      pg_temp.m73c_evidence(), true,
      'm7_lifecycle_eligibility_probe_v1', '2026-11-02', 'm5-test-v1',
      'probe-class-v1', null,
      'inventory-decision-v1', 'm7-config-v1', '{}'::jsonb,
      'abcd1234',
      repeat('c', 64), repeat('d', 64),
      false, false, false, false, false
    );
  EXCEPTION
    WHEN check_violation THEN
      raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'eligibility probe source class must be rejected by CHECK';
  END IF;

  -- Fixture / M5 persist rejected (unapprovable create paths)
  raised := false;
  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '73009000-0000-4000-8000-000000000001'::uuid,
      '73009000-0000-4000-8000-000000000002'::uuid,
      '73009000-0000-4000-8000-000000000003'::uuid,
      '73009000-0000-4000-8000-000000000005'::uuid,
      jsonb_build_object(
        'evidenceSourceClass', 'controlled_fixture_only',
        'fixtureAttestation', 'm7-controlled-local-fixture-v1'
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%FIXTURE_EVIDENCE_REJECTED%' THEN
        RAISE EXCEPTION 'expected FIXTURE_EVIDENCE_REJECTED, got: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'fixture persist must fail';
  END IF;

  raised := false;
  BEGIN
    PERFORM public.persist_inventory_action_recommendation(
      '73009000-0000-4000-8000-000000000001'::uuid,
      '73009000-0000-4000-8000-000000000002'::uuid,
      '73009000-0000-4000-8000-000000000003'::uuid,
      '73009000-0000-4000-8000-000000000005'::uuid,
      (
        SELECT payload || public.inventory_action_derive_hashes(payload)
        FROM (
          SELECT jsonb_build_object(
            'organizationId', '73009000-0000-4000-8000-000000000001'::uuid,
            'storeId', '73009000-0000-4000-8000-000000000002'::uuid,
            'locationId', '73009000-0000-4000-8000-000000000003'::uuid,
            'variantId', '73009000-0000-4000-8000-000000000005'::uuid,
            'decisionAsOfDate', '2026-10-31',
            'pinnedTimeZone', 'UTC',
            'actionType', 'REORDER',
            'compatibleSecondaryActionTypes', '[]'::jsonb,
            'priority', 'high',
            'status', 'new',
            'recommendedQuantity', 40,
            'recommendedActionDate', '2026-10-31',
            'confidence', 'high',
            'evidenceSnapshot', pg_temp.m73c_evidence(),
            'incomingStateKnown', true,
            'evidenceSourceClass', 'm5_sku_daily_metric_bound_v1',
            'metricDate', '2026-10-31',
            'metricAlgorithmVersion', 'm5-test-v1',
            'metricSourceWatermark', 'm5-unapproved-v1',
            'forecastRunId', null,
            'algorithmVersion', 'inventory-decision-v1',
            'configurationVersion', 'm7-config-v1',
            'algorithmVersions', '{}'::jsonb,
            'decisionReproducibilityFingerprint', 'abcd1234',
            'claimsMerchantFacing', false,
            'claimsProductionForecastApproval', false,
            'claimsM7ProductionEligibility', false,
            'algorithmApproved', false,
            'isScoredMerchantDecision', false
          ) AS payload
        ) s
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE%' THEN
        RAISE EXCEPTION 'expected PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE, got: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'unapproved M5 persist must fail';
  END IF;
END;
$$;

\echo '--- Auth / role / foreign rejection (deployed fail-closed) ---'

DO $$
DECLARE
  harness_id uuid := current_setting('m73c.harness_id')::uuid;
  raised boolean;
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  raised := false;
  BEGIN
    PERFORM public.transition_inventory_action_merchant(
      harness_id, 'accepted', null, null, 'no-auth'
    );
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%ACTION_LIFECYCLE_AUTH_REQUIRED%' THEN
        RAISE EXCEPTION 'expected AUTH_REQUIRED, got: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'missing auth must fail';
  END IF;

  PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000037'::uuid);
  raised := false;
  BEGIN
    PERFORM public.transition_inventory_action_merchant(
      harness_id, 'accepted', null, null, 'analyst-deny'
    );
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%ACTION_LIFECYCLE_ROLE_DENIED%' THEN
        RAISE EXCEPTION 'expected ROLE_DENIED, got: %', SQLERRM;
      END IF;
  END;
  RESET ROLE;
  IF NOT raised THEN
    RAISE EXCEPTION 'analyst must be denied';
  END IF;

  PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000008'::uuid);
  raised := false;
  BEGIN
    PERFORM public.transition_inventory_action_merchant(
      harness_id, 'accepted', null, null, 'foreign-deny'
    );
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%ACTION_LIFECYCLE_MEMBERSHIP_REQUIRED%' THEN
        RAISE EXCEPTION 'expected MEMBERSHIP_REQUIRED, got: %', SQLERRM;
      END IF;
  END;
  RESET ROLE;
  IF NOT raised THEN
    RAISE EXCEPTION 'foreign member must be denied';
  END IF;
END;
$$;

\echo '--- System expire/supersede + ungated mutation blocked ---'

DO $$
DECLARE
  harness_id uuid := current_setting('m73c.harness_id')::uuid;
  target_id uuid;
  result jsonb;
  raised boolean;
  action_row public.inventory_actions%rowtype;
BEGIN
  target_id := pg_temp.m73c_persist_harness('m73c-supersede-target-v1');

  result := public.expire_inventory_action_system(
    harness_id, 'system expire', 'expire-harness-1'
  );
  IF result->>'disposition' <> 'applied' OR result->>'toStatus' <> 'expired' THEN
    RAISE EXCEPTION 'harness expire failed: %', result;
  END IF;

  result := public.expire_inventory_action_system(
    harness_id, 'system expire', 'expire-harness-1'
  );
  IF result->>'disposition' <> 'replayed' THEN
    RAISE EXCEPTION 'expire replay failed: %', result;
  END IF;

  SELECT * INTO action_row FROM public.inventory_actions WHERE id = harness_id;
  IF action_row.recommended_quantity <> 40
    OR action_row.evidence_source_class <> 'm7_persistence_contract_harness_v1'
  THEN
    RAISE EXCEPTION 'expire mutated immutable fields: %', action_row;
  END IF;

  result := public.supersede_inventory_action_system(
    target_id, harness_id, 'replaced', 'supersede-1'
  );
  -- harness is expired terminal; cannot be supersede target as new action for
  -- coherence of superseded_by pointing at expired is allowed (FK only).
  -- supersede_inventory_action_system only requires target exists same org.
  IF result->>'disposition' <> 'applied' THEN
    RAISE EXCEPTION 'supersede failed: %', result;
  END IF;

  PERFORM set_config('storeagent.inventory_action_lifecycle_gate', '', true);
  raised := false;
  BEGIN
    UPDATE public.inventory_actions SET status = 'accepted' WHERE id = target_id;
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%immutable%' THEN
        RAISE EXCEPTION 'expected immutability, got: %', SQLERRM;
      END IF;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'ungated status UPDATE must fail';
  END IF;
END;
$$;

\echo '--- Isolated test-only eligibility override for transition matrix ---'

DO $$
DECLARE
  v_orig_def text := pg_temp.m73c_eligibility_def();
  v_orig_hash text := encode(extensions.digest(v_orig_def, 'sha256'), 'hex');
  v_after_def text;
  v_after_hash text;
  accept_id uuid;
  edit_id uuid;
  dismiss_id uuid;
  reduce_id uuid;
  concurrent_id uuid;
  atomic_id uuid;
  result jsonb;
  raised boolean;
  action_row public.inventory_actions%rowtype;
  status_after text;
BEGIN
  IF v_orig_def IS NULL OR v_orig_def NOT ILIKE '%select case when p_action is null then false else false end%' THEN
    RAISE EXCEPTION 'unexpected deployed eligibility definition';
  END IF;

  BEGIN
    -- TEST-ONLY override (must be restored before leaving this block).
    EXECUTE $override$
      CREATE OR REPLACE FUNCTION public.inventory_action_is_merchant_approvable(
        p_action public.inventory_actions
      )
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SET search_path = ''
      AS $f$
        SELECT case when p_action is null then false else true end;
      $f$
    $override$;

    accept_id := pg_temp.m73c_persist_harness('m73c-matrix-accept-v1');

    -- Missing auth still fails before eligibility success matters
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    raised := false;
    BEGIN
      PERFORM public.transition_inventory_action_merchant(
        accept_id, 'accepted', null, null, 'override-no-auth'
      );
    EXCEPTION
      WHEN OTHERS THEN
        raised := true;
        IF SQLERRM NOT ILIKE '%ACTION_LIFECYCLE_AUTH_REQUIRED%' THEN
          RAISE EXCEPTION 'expected AUTH_REQUIRED under override, got: %', SQLERRM;
        END IF;
    END;
    IF NOT raised THEN
      RAISE EXCEPTION 'auth required even under test override';
    END IF;

    PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000007'::uuid);
    result := public.transition_inventory_action_merchant(
      accept_id, 'accepted', null, 'ok', 'owner-accept'
    );
    RESET ROLE;
    IF result->>'disposition' <> 'applied' OR result->>'toStatus' <> 'accepted' THEN
      RAISE EXCEPTION 'owner accept failed under override: %', result;
    END IF;

    SELECT * INTO action_row FROM public.inventory_actions WHERE id = accept_id;
    IF action_row.recommended_quantity <> 40 THEN
      RAISE EXCEPTION 'accept mutated recommendation';
    END IF;

    PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000007'::uuid);
    result := public.transition_inventory_action_merchant(
      accept_id, 'accepted', null, 'ok', 'owner-accept'
    );
    RESET ROLE;
    IF result->>'disposition' <> 'replayed' THEN
      RAISE EXCEPTION 'expected replay, got: %', result;
    END IF;

    PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000007'::uuid);
    raised := false;
    BEGIN
      PERFORM public.transition_inventory_action_merchant(
        accept_id, 'accepted', null, 'different-note', 'owner-accept'
      );
    EXCEPTION
      WHEN OTHERS THEN
        raised := true;
        IF SQLERRM NOT ILIKE '%ACTION_EVENT_IDEMPOTENCY_BODY_CONFLICT%' THEN
          RAISE EXCEPTION 'expected BODY_CONFLICT, got: %', SQLERRM;
        END IF;
    END;
    RESET ROLE;
    IF NOT raised THEN
      RAISE EXCEPTION 'body conflict must raise';
    END IF;

    edit_id := pg_temp.m73c_persist_harness('m73c-matrix-edit-v1');
    PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000017'::uuid);
    result := public.transition_inventory_action_merchant(
      edit_id, 'accepted_with_edit', 25, 'admin edit', 'admin-edit'
    );
    RESET ROLE;
    IF result->>'disposition' <> 'applied'
      OR (result->>'editedQuantity')::int <> 25
      OR (result->>'recommendedQuantity')::int <> 40
    THEN
      RAISE EXCEPTION 'admin edit failed: %', result;
    END IF;

    PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000027'::uuid);
    result := public.transition_inventory_action_merchant(
      edit_id, 'completed', null, null, 'operator-complete'
    );
    RESET ROLE;
    IF result->>'toStatus' <> 'completed' THEN
      RAISE EXCEPTION 'operator complete failed: %', result;
    END IF;

    dismiss_id := pg_temp.m73c_persist_harness('m73c-matrix-dismiss-v1');
    PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000027'::uuid);
    result := public.transition_inventory_action_merchant(
      dismiss_id, 'dismissed', null, 'nope', 'op-dismiss'
    );
    RESET ROLE;
    IF result->>'toStatus' <> 'dismissed' THEN
      RAISE EXCEPTION 'dismiss failed: %', result;
    END IF;

    -- REDUCE cannot accepted_with_edit
    DECLARE
      payload jsonb;
      hashes jsonb;
    BEGIN
      payload := jsonb_build_object(
        'organizationId', '73009000-0000-4000-8000-000000000001'::uuid,
        'storeId', '73009000-0000-4000-8000-000000000002'::uuid,
        'locationId', '73009000-0000-4000-8000-000000000003'::uuid,
        'variantId', '73009000-0000-4000-8000-000000000005'::uuid,
        'decisionAsOfDate', '2026-10-31',
        'pinnedTimeZone', 'UTC',
        'actionType', 'REDUCE',
        'compatibleSecondaryActionTypes', jsonb_build_array('PROMOTE'),
        'priority', 'high',
        'status', 'new',
        'recommendedQuantity', null,
        'recommendedActionDate', '2026-10-31',
        'confidence', 'high',
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
          'reasonCodes', jsonb_build_array('OVERSTOCK_RISK_HIGH')
        ),
        'incomingStateKnown', true,
        'evidenceSourceClass', 'm7_persistence_contract_harness_v1',
        'metricDate', '2026-10-31',
        'metricAlgorithmVersion', 'm5-test-v1',
        'metricSourceWatermark', 'm73c-matrix-reduce-v1',
        'forecastRunId', null,
        'algorithmVersion', 'inventory-decision-v1',
        'configurationVersion', 'm7-config-v1',
        'algorithmVersions', '{}'::jsonb,
        'decisionReproducibilityFingerprint', 'abcd1234',
        'claimsMerchantFacing', false,
        'claimsProductionForecastApproval', false,
        'claimsM7ProductionEligibility', false,
        'algorithmApproved', false,
        'isScoredMerchantDecision', false
      );
      hashes := public.inventory_action_derive_hashes(payload);
      payload := payload || hashes;
      reduce_id := (
        public.persist_inventory_action_recommendation(
          '73009000-0000-4000-8000-000000000001'::uuid,
          '73009000-0000-4000-8000-000000000002'::uuid,
          '73009000-0000-4000-8000-000000000003'::uuid,
          '73009000-0000-4000-8000-000000000005'::uuid,
          payload
        )->>'inventoryActionId'
      )::uuid;
    END;

    PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000007'::uuid);
    raised := false;
    BEGIN
      PERFORM public.transition_inventory_action_merchant(
        reduce_id, 'accepted_with_edit', 3, null, 'reduce-edit'
      );
    EXCEPTION
      WHEN OTHERS THEN
        raised := true;
        IF SQLERRM NOT ILIKE '%ACTION_EVENT_EDIT_REQUIRES_REORDER%' THEN
          RAISE EXCEPTION 'expected EDIT_REQUIRES_REORDER, got: %', SQLERRM;
        END IF;
    END;
    RESET ROLE;
    IF NOT raised THEN
      RAISE EXCEPTION 'REDUCE edit must fail';
    END IF;

    concurrent_id := pg_temp.m73c_persist_harness('m73c-matrix-concurrent-v1');
    PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000007'::uuid);
    result := public.transition_inventory_action_merchant(
      concurrent_id, 'accepted', null, null, 'concurrent-a'
    );
    IF result->>'disposition' <> 'applied' THEN
      RAISE EXCEPTION 'first concurrent accept failed: %', result;
    END IF;
    raised := false;
    BEGIN
      PERFORM public.transition_inventory_action_merchant(
        concurrent_id, 'dismissed', null, null, 'concurrent-b'
      );
    EXCEPTION
      WHEN OTHERS THEN
        raised := true;
        IF SQLERRM NOT ILIKE '%ACTION_LIFECYCLE_TRANSITION_ILLEGAL%' THEN
          RAISE EXCEPTION 'expected TRANSITION_ILLEGAL, got: %', SQLERRM;
        END IF;
    END;
    RESET ROLE;
    IF NOT raised THEN
      RAISE EXCEPTION 'second conflicting lifecycle must fail';
    END IF;

    atomic_id := pg_temp.m73c_persist_harness('m73c-matrix-atomic-v1');
    PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000007'::uuid);
    raised := false;
    BEGIN
      PERFORM public.transition_inventory_action_merchant(
        atomic_id, 'accepted_with_edit', 40, null, 'same-qty'
      );
    EXCEPTION
      WHEN OTHERS THEN
        raised := true;
        IF SQLERRM NOT ILIKE '%ACTION_EVENT_EDITED_QUANTITY_INVALID%' THEN
          RAISE EXCEPTION 'expected EDITED_QUANTITY_INVALID, got: %', SQLERRM;
        END IF;
    END;
    RESET ROLE;
    SELECT status INTO status_after
    FROM public.inventory_actions WHERE id = atomic_id;
    IF NOT raised OR status_after <> 'new' THEN
      RAISE EXCEPTION 'failed edit must leave status new, got %', status_after;
    END IF;

    -- Always restore deployed fail-closed definition.
    EXECUTE v_orig_def;
  EXCEPTION
    WHEN OTHERS THEN
      BEGIN
        EXECUTE v_orig_def;
      EXCEPTION
        WHEN OTHERS THEN
          NULL; -- outer assert will fail
      END;
      RAISE;
  END;

  v_after_def := pg_temp.m73c_eligibility_def();
  v_after_hash := encode(extensions.digest(v_after_def, 'sha256'), 'hex');
  IF v_after_hash IS DISTINCT FROM v_orig_hash THEN
    RAISE EXCEPTION 'eligibility helper was not restored after test override';
  END IF;

  -- Post-restore: merchant success must fail again on a fresh harness row
  accept_id := pg_temp.m73c_persist_harness('m73c-post-restore-v1');
  PERFORM pg_temp.m73c_as_user('73009000-0000-4000-8000-000000000007'::uuid);
  raised := false;
  BEGIN
    PERFORM public.transition_inventory_action_merchant(
      accept_id, 'accepted', null, null, 'post-restore-accept'
    );
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
      IF SQLERRM NOT ILIKE '%ACTION_NOT_MERCHANT_APPROVABLE%' THEN
        RAISE EXCEPTION 'expected NOT_MERCHANT_APPROVABLE after restore, got: %', SQLERRM;
      END IF;
  END;
  RESET ROLE;
  IF NOT raised THEN
    RAISE EXCEPTION 'deployed fail-closed eligibility must hold after restore';
  END IF;

  IF public.inventory_action_is_merchant_approvable(
    (SELECT a FROM public.inventory_actions a WHERE a.id = accept_id)
  ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'is_merchant_approvable must return false after restore';
  END IF;
END;
$$;

\echo '=== M7.3c TRUSTED LIFECYCLE RPC ADVERSARIAL PASSED ==='

ROLLBACK;
