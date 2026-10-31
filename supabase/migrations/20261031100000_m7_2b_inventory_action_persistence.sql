-- StoreAgent M7.2b
-- LOCAL-ONLY dormant inventory action persistence foundation.
--
-- Contract authority: docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md
--
-- Dormant infrastructure only:
--   - No production writer
--   - No action_events / lifecycle RPCs
--   - Fixture / M7.1 evidence rejected
--   - m5_sku_daily_metric_bound_v1 reserved and rejected
--   - Harness class accepted only with hard-false trust flags
--   - forecast_run_id must remain null
--
-- Body hash authority is SQL-derived SHA-256 over stable-serialized material
-- fields. Caller-supplied decisionBodyHash is verified, never trusted alone.

-- -----------------------------------------------------------------------------
-- Immutability guard
-- -----------------------------------------------------------------------------

create or replace function public.prevent_inventory_action_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    using
      errcode = 'P0001',
      message = format(
        'inventory_actions rows are immutable (%s on %s)',
        tg_op,
        tg_table_name
      );
end;
$$;

revoke all
on function public.prevent_inventory_action_mutation()
from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Stable serialize + SHA-256 helpers (trusted hash contract)
-- -----------------------------------------------------------------------------

create or replace function public.inventory_action_stable_serialize(
  p_value jsonb
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_type text;
  v_keys text[];
  v_key text;
  v_parts text[] := array[]::text[];
  v_elem jsonb;
begin
  if p_value is null then
    return 'null';
  end if;

  v_type := jsonb_typeof(p_value);

  if v_type = 'null' then
    return 'null';
  elsif v_type = 'boolean' then
    return p_value::text;
  elsif v_type = 'number' then
    return p_value::text;
  elsif v_type = 'string' then
    return pg_catalog.to_json(p_value #>> '{}')::text;
  elsif v_type = 'array' then
    for v_elem in
      select value
      from jsonb_array_elements(p_value)
    loop
      v_parts := array_append(
        v_parts,
        public.inventory_action_stable_serialize(v_elem)
      );
    end loop;

    return '[' || array_to_string(v_parts, ',') || ']';
  elsif v_type = 'object' then
    select array_agg(k order by k)
    into v_keys
    from jsonb_object_keys(p_value) as k;

    if v_keys is null then
      return '{}';
    end if;

    foreach v_key in array v_keys
    loop
      v_parts := array_append(
        v_parts,
        pg_catalog.to_json(v_key)::text
          || ':'
          || public.inventory_action_stable_serialize(p_value -> v_key)
      );
    end loop;

    return '{' || array_to_string(v_parts, ',') || '}';
  end if;

  raise exception
    using
      errcode = 'P0001',
      message = format(
        'inventory action stable serialize unsupported jsonb type: %s',
        v_type
      );
end;
$$;

create or replace function public.inventory_action_sha256_hex(
  p_input text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(coalesce(p_input, ''), 'sha256'),
    'hex'
  );
$$;

revoke all
on function public.inventory_action_stable_serialize(jsonb)
from public, anon, authenticated;

revoke all
on function public.inventory_action_sha256_hex(text)
from public, anon, authenticated;

grant execute
on function public.inventory_action_stable_serialize(jsonb)
to service_role;

grant execute
on function public.inventory_action_sha256_hex(text)
to service_role;

-- -----------------------------------------------------------------------------
-- inventory_actions
-- -----------------------------------------------------------------------------

create table public.inventory_actions (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,

  decision_as_of_date date not null,
  pinned_time_zone text not null,

  action_type text not null,
  compatible_secondary_action_types jsonb not null
    default '[]'::jsonb,
  priority text not null,
  status text not null
    default 'new',

  recommended_quantity integer null,
  recommended_action_date date null,
  confidence text not null,

  evidence_snapshot jsonb not null,
  incoming_state_known boolean not null,

  evidence_source_class text not null,
  metric_date date not null,
  metric_algorithm_version text not null,
  metric_source_watermark text not null,

  forecast_run_id uuid null,

  algorithm_version text not null,
  configuration_version text not null,
  algorithm_versions jsonb not null,

  decision_reproducibility_fingerprint text not null,
  evidence_provenance_fingerprint text not null,
  decision_body_hash text not null,

  claims_merchant_facing boolean not null
    default false,
  claims_production_forecast_approval boolean not null
    default false,
  claims_m7_production_eligibility boolean not null
    default false,
  algorithm_approved boolean not null
    default false,
  is_scored_merchant_decision boolean not null
    default false,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint inventory_actions_action_type_check
    check (
      action_type in (
        'REORDER',
        'REDUCE',
        'PROMOTE',
        'WATCH'
      )
    ),

  constraint inventory_actions_priority_check
    check (
      priority in (
        'critical',
        'high',
        'medium',
        'low'
      )
    ),

  constraint inventory_actions_confidence_check
    check (
      confidence in (
        'high',
        'medium',
        'low'
      )
    ),

  constraint inventory_actions_status_new_only
    check (status = 'new'),

  constraint inventory_actions_quantity_by_action
    check (
      (
        action_type = 'REORDER'
        and recommended_quantity is not null
        and recommended_quantity > 0
      )
      or (
        action_type in ('REDUCE', 'PROMOTE', 'WATCH')
        and recommended_quantity is null
      )
    ),

  constraint inventory_actions_secondary_is_array
    check (jsonb_typeof(compatible_secondary_action_types) = 'array'),

  constraint inventory_actions_evidence_is_object
    check (jsonb_typeof(evidence_snapshot) = 'object'),

  constraint inventory_actions_evidence_reason_codes_array
    check (
      jsonb_typeof(evidence_snapshot -> 'reasonCodes') = 'array'
    ),

  constraint inventory_actions_watch_requires_reasons
    check (
      action_type <> 'WATCH'
      or jsonb_array_length(evidence_snapshot -> 'reasonCodes') >= 1
    ),

  constraint inventory_actions_source_class_check
    check (
      evidence_source_class in (
        'm7_persistence_contract_harness_v1',
        'm5_sku_daily_metric_bound_v1',
        'controlled_fixture_only'
      )
    ),

  constraint inventory_actions_forecast_run_null
    check (forecast_run_id is null),

  constraint inventory_actions_trust_hard_false
    check (
      claims_merchant_facing = false
      and claims_production_forecast_approval = false
      and claims_m7_production_eligibility = false
      and algorithm_approved = false
      and is_scored_merchant_decision = false
    ),

  constraint inventory_actions_pinned_tz_not_blank
    check (pg_catalog.length(pg_catalog.btrim(pinned_time_zone)) > 0),

  constraint inventory_actions_metric_algo_not_blank
    check (
      pg_catalog.length(pg_catalog.btrim(metric_algorithm_version)) > 0
    ),

  constraint inventory_actions_metric_watermark_not_blank
    check (
      pg_catalog.length(pg_catalog.btrim(metric_source_watermark)) > 0
    ),

  constraint inventory_actions_algorithm_not_blank
    check (
      pg_catalog.length(pg_catalog.btrim(algorithm_version)) > 0
      and pg_catalog.length(pg_catalog.btrim(configuration_version)) > 0
    ),

  constraint inventory_actions_repro_fp_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(decision_reproducibility_fingerprint)
      ) > 0
    ),

  constraint inventory_actions_sha256_fp_check
    check (
      evidence_provenance_fingerprint ~ '^[a-f0-9]{64}$'
      and decision_body_hash ~ '^[a-f0-9]{64}$'
    ),

  constraint inventory_actions_algorithm_versions_object
    check (jsonb_typeof(algorithm_versions) = 'object'),

  constraint inventory_actions_organization_fk
    foreign key (organization_id)
    references public.organizations (id)
    on delete restrict,

  constraint inventory_actions_store_fk
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete restrict,

  constraint inventory_actions_location_fk
    foreign key (organization_id, store_id, location_id)
    references public.locations (organization_id, store_id, id)
    on delete restrict,

  constraint inventory_actions_variant_fk
    foreign key (organization_id, store_id, variant_id)
    references public.product_variants (organization_id, store_id, id)
    on delete restrict
);

create unique index inventory_actions_idempotency_uidx
  on public.inventory_actions (
    organization_id,
    store_id,
    location_id,
    variant_id,
    decision_as_of_date,
    algorithm_version,
    configuration_version,
    evidence_provenance_fingerprint
  );

create index inventory_actions_org_store_as_of_idx
  on public.inventory_actions (
    organization_id,
    store_id,
    decision_as_of_date
  );

create trigger inventory_actions_immutable
before update or delete on public.inventory_actions
for each row
execute function public.prevent_inventory_action_mutation();

alter table public.inventory_actions enable row level security;

revoke all
on table public.inventory_actions
from public, anon, authenticated, service_role;

grant select
on table public.inventory_actions
to authenticated, service_role;

create policy inventory_actions_select_member
on public.inventory_actions
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where
      membership.organization_id =
        inventory_actions.organization_id
      and membership.user_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- Hash derivation (shared by RPC; also usable by local harness tests)
-- -----------------------------------------------------------------------------

create or replace function public.inventory_action_derive_hashes(
  p_payload jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_provenance jsonb;
  v_body jsonb;
  v_provenance_fp text;
  v_body_hash text;
  v_secondary jsonb;
  v_evidence jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
  end if;

  v_secondary := coalesce(
    p_payload -> 'compatibleSecondaryActionTypes',
    '[]'::jsonb
  );
  v_evidence := p_payload -> 'evidenceSnapshot';

  v_provenance := jsonb_build_object(
    'decisionAsOfDate', p_payload ->> 'decisionAsOfDate',
    'evidenceSnapshot', v_evidence,
    'evidenceSourceClass', p_payload ->> 'evidenceSourceClass',
    'forecastRunId', null,
    'incomingStateKnown', (p_payload ->> 'incomingStateKnown')::boolean,
    'locationId', p_payload ->> 'locationId',
    'metricAlgorithmVersion', p_payload ->> 'metricAlgorithmVersion',
    'metricDate', p_payload ->> 'metricDate',
    'metricSourceWatermark', p_payload ->> 'metricSourceWatermark',
    'organizationId', p_payload ->> 'organizationId',
    'pinnedTimeZone', p_payload ->> 'pinnedTimeZone',
    'storeId', p_payload ->> 'storeId',
    'variantId', p_payload ->> 'variantId'
  );

  v_provenance_fp := public.inventory_action_sha256_hex(
    public.inventory_action_stable_serialize(v_provenance)
  );

  v_body := jsonb_build_object(
    'actionType', p_payload ->> 'actionType',
    'algorithmApproved', false,
    'algorithmVersion', p_payload ->> 'algorithmVersion',
    'algorithmVersions', p_payload -> 'algorithmVersions',
    'claimsM7ProductionEligibility', false,
    'claimsMerchantFacing', false,
    'claimsProductionForecastApproval', false,
    'compatibleSecondaryActionTypes', v_secondary,
    'confidence', p_payload ->> 'confidence',
    'configurationVersion', p_payload ->> 'configurationVersion',
    'decisionAsOfDate', p_payload ->> 'decisionAsOfDate',
    'decisionReproducibilityFingerprint',
      p_payload ->> 'decisionReproducibilityFingerprint',
    'evidenceProvenanceFingerprint', v_provenance_fp,
    'evidenceSnapshot', v_evidence,
    'evidenceSourceClass', p_payload ->> 'evidenceSourceClass',
    'forecastRunId', null,
    'incomingStateKnown', (p_payload ->> 'incomingStateKnown')::boolean,
    'isScoredMerchantDecision', false,
    'locationId', p_payload ->> 'locationId',
    'metricAlgorithmVersion', p_payload ->> 'metricAlgorithmVersion',
    'metricDate', p_payload ->> 'metricDate',
    'metricSourceWatermark', p_payload ->> 'metricSourceWatermark',
    'organizationId', p_payload ->> 'organizationId',
    'pinnedTimeZone', p_payload ->> 'pinnedTimeZone',
    'priority', p_payload ->> 'priority',
    'recommendedActionDate', p_payload -> 'recommendedActionDate',
    'recommendedQuantity', p_payload -> 'recommendedQuantity',
    'status', 'new',
    'storeId', p_payload ->> 'storeId',
    'variantId', p_payload ->> 'variantId'
  );

  -- Normalize optional date/quantity nulls to JSON null (not missing keys).
  if p_payload ->> 'recommendedActionDate' is null then
    v_body := jsonb_set(v_body, '{recommendedActionDate}', 'null'::jsonb, true);
  else
    v_body := jsonb_set(
      v_body,
      '{recommendedActionDate}',
      to_jsonb(p_payload ->> 'recommendedActionDate'),
      true
    );
  end if;

  if p_payload -> 'recommendedQuantity' is null
    or jsonb_typeof(p_payload -> 'recommendedQuantity') = 'null'
  then
    v_body := jsonb_set(v_body, '{recommendedQuantity}', 'null'::jsonb, true);
  end if;

  v_body_hash := public.inventory_action_sha256_hex(
    public.inventory_action_stable_serialize(v_body)
  );

  return jsonb_build_object(
    'evidenceProvenanceFingerprint', v_provenance_fp,
    'decisionBodyHash', v_body_hash
  );
end;
$$;

revoke all
on function public.inventory_action_derive_hashes(jsonb)
from public, anon, authenticated;

grant execute
on function public.inventory_action_derive_hashes(jsonb)
to service_role;

-- -----------------------------------------------------------------------------
-- persist_inventory_action_recommendation
-- -----------------------------------------------------------------------------

create or replace function public.persist_inventory_action_recommendation(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action_id uuid;
  v_existing public.inventory_actions%rowtype;
  v_hashes jsonb;
  v_provenance_fp text;
  v_body_hash text;
  v_supplied_body_hash text;
  v_supplied_provenance_fp text;
  v_action_type text;
  v_priority text;
  v_confidence text;
  v_status text;
  v_source_class text;
  v_algorithm_version text;
  v_configuration_version text;
  v_decision_as_of date;
  v_metric_date date;
  v_recommended_qty integer;
  v_recommended_action_date date;
  v_incoming_known boolean;
  v_secondary jsonb;
  v_evidence jsonb;
  v_algorithm_versions jsonb;
  v_repro_fp text;
  v_pinned_tz text;
  v_metric_algo text;
  v_metric_watermark text;
  v_secondary_elem text;
  v_claims_merchant boolean;
  v_claims_forecast boolean;
  v_claims_m7 boolean;
  v_algo_approved boolean;
  v_scored_merchant boolean;
  v_disposition text;
begin
  if p_organization_id is null
    or p_store_id is null
    or p_location_id is null
    or p_variant_id is null
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
  end if;

  -- Fixture / M7.1 markers (fail closed before any insert).
  if p_payload ? 'fixtureAttestation'
    or p_payload->>'evidenceScope' = 'controlled_fixture_only'
    or p_payload->>'evidenceSourceClass' = 'controlled_fixture_only'
    or p_payload->>'fixtureAttestation' = 'm7-controlled-local-fixture-v1'
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'FIXTURE_EVIDENCE_REJECTED';
  end if;

  v_source_class := p_payload->>'evidenceSourceClass';

  if v_source_class = 'm5_sku_daily_metric_bound_v1' then
    raise exception
      using
        errcode = 'P0001',
        message = 'PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE';
  end if;

  if v_source_class is distinct from 'm7_persistence_contract_harness_v1' then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
  end if;

  -- Independent grain ownership (do not trust JSON ids).
  if not exists (
    select 1
    from public.stores as s
    where
      s.organization_id = p_organization_id
      and s.id = p_store_id
  ) then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_SCOPE_ERROR';
  end if;

  if not exists (
    select 1
    from public.locations as l
    where
      l.organization_id = p_organization_id
      and l.store_id = p_store_id
      and l.id = p_location_id
  ) then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_SCOPE_ERROR';
  end if;

  if not exists (
    select 1
    from public.product_variants as pv
    where
      pv.organization_id = p_organization_id
      and pv.store_id = p_store_id
      and pv.id = p_variant_id
  ) then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_SCOPE_ERROR';
  end if;

  if (p_payload->>'organizationId') is distinct from p_organization_id::text
    or (p_payload->>'storeId') is distinct from p_store_id::text
    or (p_payload->>'locationId') is distinct from p_location_id::text
    or (p_payload->>'variantId') is distinct from p_variant_id::text
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_SCOPE_ERROR';
  end if;

  -- Trust claims: reject forged true values; never persist true.
  v_claims_merchant := coalesce(
    (p_payload->>'claimsMerchantFacing')::boolean,
    false
  );
  v_claims_forecast := coalesce(
    (p_payload->>'claimsProductionForecastApproval')::boolean,
    false
  );
  v_claims_m7 := coalesce(
    (p_payload->>'claimsM7ProductionEligibility')::boolean,
    false
  );
  v_algo_approved := coalesce(
    (p_payload->>'algorithmApproved')::boolean,
    false
  );
  v_scored_merchant := coalesce(
    (p_payload->>'isScoredMerchantDecision')::boolean,
    false
  );

  if v_claims_merchant
    or v_claims_forecast
    or v_claims_m7
    or v_algo_approved
    or v_scored_merchant
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'PRODUCTION_TRUST_CLAIM_REJECTED';
  end if;

  if p_payload ? 'forecastRunId'
    and p_payload -> 'forecastRunId' is not null
    and jsonb_typeof(p_payload -> 'forecastRunId') <> 'null'
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'FORECAST_RUN_FORBIDDEN';
  end if;

  v_action_type := p_payload->>'actionType';
  v_priority := p_payload->>'priority';
  v_confidence := p_payload->>'confidence';
  v_status := coalesce(p_payload->>'status', 'new');
  v_algorithm_version := p_payload->>'algorithmVersion';
  v_configuration_version := p_payload->>'configurationVersion';
  v_repro_fp := p_payload->>'decisionReproducibilityFingerprint';
  v_pinned_tz := p_payload->>'pinnedTimeZone';
  v_metric_algo := p_payload->>'metricAlgorithmVersion';
  v_metric_watermark := p_payload->>'metricSourceWatermark';
  v_secondary := coalesce(
    p_payload -> 'compatibleSecondaryActionTypes',
    '[]'::jsonb
  );
  v_evidence := p_payload -> 'evidenceSnapshot';
  v_algorithm_versions := p_payload -> 'algorithmVersions';
  v_supplied_provenance_fp := p_payload->>'evidenceProvenanceFingerprint';
  v_supplied_body_hash := p_payload->>'decisionBodyHash';

  if v_action_type is null
    or v_action_type = 'HEALTHY'
    or v_action_type not in ('REORDER', 'REDUCE', 'PROMOTE', 'WATCH')
    or v_priority is null
    or v_priority not in ('critical', 'high', 'medium', 'low')
    or v_confidence is null
    or v_confidence not in ('high', 'medium', 'low')
    or v_status is distinct from 'new'
    or v_algorithm_version is distinct from 'inventory-decision-v1'
    or v_configuration_version is null
    or pg_catalog.length(pg_catalog.btrim(v_configuration_version)) = 0
    or v_repro_fp is null
    or pg_catalog.length(pg_catalog.btrim(v_repro_fp)) = 0
    or v_pinned_tz is null
    or pg_catalog.length(pg_catalog.btrim(v_pinned_tz)) = 0
    or v_metric_algo is null
    or pg_catalog.length(pg_catalog.btrim(v_metric_algo)) = 0
    or v_metric_watermark is null
    or pg_catalog.length(pg_catalog.btrim(v_metric_watermark)) = 0
    or p_payload->>'decisionAsOfDate' is null
    or p_payload->>'metricDate' is null
    or p_payload->>'incomingStateKnown' is null
    or jsonb_typeof(v_secondary) is distinct from 'array'
    or jsonb_typeof(v_evidence) is distinct from 'object'
    or jsonb_typeof(v_algorithm_versions) is distinct from 'object'
    or jsonb_typeof(v_evidence -> 'reasonCodes') is distinct from 'array'
    or v_supplied_provenance_fp is null
    or pg_catalog.length(pg_catalog.btrim(v_supplied_provenance_fp)) = 0
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
  end if;

  begin
    v_decision_as_of := (p_payload->>'decisionAsOfDate')::date;
    v_metric_date := (p_payload->>'metricDate')::date;
    v_incoming_known := (p_payload->>'incomingStateKnown')::boolean;
  exception
    when others then
      raise exception
        using
          errcode = 'P0001',
          message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
  end;

  -- Evidence required keys (canonical InventoryActionEvidence).
  if not (
    v_evidence ? 'availableQuantity'
    and v_evidence ? 'incomingQuantity'
    and v_evidence ? 'demandVelocity'
    and v_evidence ? 'daysOfStock'
    and v_evidence ? 'leadTimeDays'
    and v_evidence ? 'safetyStockUnits'
    and v_evidence ? 'reorderPointUnits'
    and v_evidence ? 'targetStockUnits'
    and v_evidence ? 'inventoryAgeDays'
    and v_evidence ? 'forecastExpectedDemandUnits'
    and v_evidence ? 'dataQualityScore'
    and v_evidence ? 'reasonCodes'
  ) then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
  end if;

  if v_action_type = 'WATCH'
    and jsonb_array_length(v_evidence -> 'reasonCodes') < 1
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
  end if;

  -- incoming_state_known consistency: unknown ⇒ null incoming in snapshot.
  if not v_incoming_known
    and v_evidence -> 'incomingQuantity' is distinct from 'null'::jsonb
    and v_evidence ->> 'incomingQuantity' is not null
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
  end if;

  -- Quantity rules.
  if p_payload -> 'recommendedQuantity' is null
    or jsonb_typeof(p_payload -> 'recommendedQuantity') = 'null'
  then
    v_recommended_qty := null;
  else
    begin
      v_recommended_qty := (p_payload->>'recommendedQuantity')::integer;
    exception
      when others then
        raise exception
          using
            errcode = 'P0001',
            message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
    end;
  end if;

  if v_action_type = 'REORDER' then
    if v_recommended_qty is null or v_recommended_qty <= 0 then
      raise exception
        using
          errcode = 'P0001',
          message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
    end if;
  elsif v_recommended_qty is not null then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
  end if;

  if p_payload ->> 'recommendedActionDate' is null then
    v_recommended_action_date := null;
  else
    begin
      v_recommended_action_date := (p_payload->>'recommendedActionDate')::date;
    exception
      when others then
        raise exception
          using
            errcode = 'P0001',
            message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
    end;
  end if;

  -- Secondary actions: allowed vocab; never duplicates primary.
  for v_secondary_elem in
    select jsonb_array_elements_text(v_secondary)
  loop
    if v_secondary_elem not in ('REORDER', 'REDUCE', 'PROMOTE', 'WATCH')
      or v_secondary_elem = v_action_type
    then
      raise exception
        using
          errcode = 'P0001',
          message = 'DECISION_PERSISTENCE_INVALID_PAYLOAD';
    end if;
  end loop;

  -- Derive authoritative hashes inside the trusted SQL contract.
  v_hashes := public.inventory_action_derive_hashes(p_payload);
  v_provenance_fp := v_hashes->>'evidenceProvenanceFingerprint';
  v_body_hash := v_hashes->>'decisionBodyHash';

  if v_supplied_provenance_fp is distinct from v_provenance_fp then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_BODY_HASH_MISMATCH';
  end if;

  if v_supplied_body_hash is not null
    and pg_catalog.length(pg_catalog.btrim(v_supplied_body_hash)) > 0
    and v_supplied_body_hash is distinct from v_body_hash
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'DECISION_BODY_HASH_MISMATCH';
  end if;

  begin
    insert into public.inventory_actions (
      organization_id,
      store_id,
      location_id,
      variant_id,
      decision_as_of_date,
      pinned_time_zone,
      action_type,
      compatible_secondary_action_types,
      priority,
      status,
      recommended_quantity,
      recommended_action_date,
      confidence,
      evidence_snapshot,
      incoming_state_known,
      evidence_source_class,
      metric_date,
      metric_algorithm_version,
      metric_source_watermark,
      forecast_run_id,
      algorithm_version,
      configuration_version,
      algorithm_versions,
      decision_reproducibility_fingerprint,
      evidence_provenance_fingerprint,
      decision_body_hash,
      claims_merchant_facing,
      claims_production_forecast_approval,
      claims_m7_production_eligibility,
      algorithm_approved,
      is_scored_merchant_decision
    ) values (
      p_organization_id,
      p_store_id,
      p_location_id,
      p_variant_id,
      v_decision_as_of,
      v_pinned_tz,
      v_action_type,
      v_secondary,
      v_priority,
      'new',
      v_recommended_qty,
      v_recommended_action_date,
      v_confidence,
      v_evidence,
      v_incoming_known,
      v_source_class,
      v_metric_date,
      v_metric_algo,
      v_metric_watermark,
      null,
      v_algorithm_version,
      v_configuration_version,
      v_algorithm_versions,
      v_repro_fp,
      v_provenance_fp,
      v_body_hash,
      false,
      false,
      false,
      false,
      false
    )
    returning id into v_action_id;

    v_disposition := 'created';
  exception
    when unique_violation then
      select *
      into v_existing
      from public.inventory_actions as a
      where
        a.organization_id = p_organization_id
        and a.store_id = p_store_id
        and a.location_id = p_location_id
        and a.variant_id = p_variant_id
        and a.decision_as_of_date = v_decision_as_of
        and a.algorithm_version = v_algorithm_version
        and a.configuration_version = v_configuration_version
        and a.evidence_provenance_fingerprint = v_provenance_fp;

      if not found then
        raise;
      end if;

      if v_existing.decision_body_hash is distinct from v_body_hash
        or v_existing.action_type is distinct from v_action_type
        or v_existing.compatible_secondary_action_types
          is distinct from v_secondary
        or v_existing.priority is distinct from v_priority
        or v_existing.status is distinct from 'new'
        or v_existing.recommended_quantity
          is distinct from v_recommended_qty
        or v_existing.recommended_action_date
          is distinct from v_recommended_action_date
        or v_existing.confidence is distinct from v_confidence
        or v_existing.evidence_snapshot is distinct from v_evidence
        or v_existing.incoming_state_known is distinct from v_incoming_known
        or v_existing.evidence_source_class is distinct from v_source_class
        or v_existing.metric_date is distinct from v_metric_date
        or v_existing.metric_algorithm_version is distinct from v_metric_algo
        or v_existing.metric_source_watermark
          is distinct from v_metric_watermark
        or v_existing.forecast_run_id is not null
        or v_existing.algorithm_versions is distinct from v_algorithm_versions
        or v_existing.decision_reproducibility_fingerprint
          is distinct from v_repro_fp
        or v_existing.pinned_time_zone is distinct from v_pinned_tz
        or v_existing.claims_merchant_facing
        or v_existing.claims_production_forecast_approval
        or v_existing.claims_m7_production_eligibility
        or v_existing.algorithm_approved
        or v_existing.is_scored_merchant_decision
      then
        raise exception
          using
            errcode = 'P0001',
            message = 'DECISION_IDEMPOTENCY_BODY_CONFLICT';
      end if;

      v_action_id := v_existing.id;
      v_body_hash := v_existing.decision_body_hash;
      v_provenance_fp := v_existing.evidence_provenance_fingerprint;
      v_disposition := 'replayed';
  end;

  return jsonb_build_object(
    'ok', true,
    'disposition', v_disposition,
    'inventoryActionId', v_action_id,
    'decisionBodyHash', v_body_hash,
    'evidenceProvenanceFingerprint', v_provenance_fp,
    'claimsMerchantFacing', false,
    'claimsProductionForecastApproval', false,
    'claimsM7ProductionEligibility', false,
    'algorithmApproved', false,
    'isScoredMerchantDecision', false
  );
end;
$$;

revoke all
on function public.persist_inventory_action_recommendation(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.persist_inventory_action_recommendation(
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb
)
to service_role;
