-- StoreAgent M7-PB1.h.4.3
-- Dormant transactional create-evidence fence scaffold (local SQL only).
--
-- Implements fencing contract §1.2–§1.3 lock order + in-TX revalidation as a
-- diagnostic-only helper. Returns typed PASS/REJECT. NEVER inserts
-- inventory_actions. NEVER unlocks m5_sku_daily_metric_bound_v1. NEVER flips
-- inventory_action_is_merchant_approvable. NOT wired into
-- persist_inventory_action_recommendation.
--
-- Frozen lock order (READ COMMITTED–safe with cooperating writers):
--   1. Metric-grain advisory 71010402
--   2. Supplier org+variant advisory 71010401
--   3. Source SHARE (canonical M5): stores → orders → order_items →
--      return_refunds → inventory_snapshots → purchase_orders →
--      purchase_order_items → store_incoming_evidence_attestations
--   4. sku_daily_metrics row FOR UPDATE
--   5. Matching sku_daily_metric_recompute_requests row FOR UPDATE (if any)
--   6. Selected supplier_products row FOR UPDATE
--   7. Recheck evidence axes under held locks
--   8. Return diagnostic only (no action insert)
--
-- Depends on PB1.h.4.1 (71010401) + PB1.h.4.2 (71010402) helpers.
-- Reuses sku_daily_metric_source_snapshot (SA008) — no new token algorithm.
--
-- Residual bypass (disclosed; not closed by this scaffold):
--   Privileged direct INSERT into public.sku_daily_metric_source_events is
--   NOT serialized by the canonical source SHARE list (events are a separate
--   table). A concurrent direct event INSERT could race the final in-window
--   event recheck under READ COMMITTED. Authorized source writers
--   (orders/PO/snapshots/attestations) remain blocked by SHARE. Contract
--   §1.2.1 retains this residual.
--
-- Bounds: lock_timeout=2s, statement_timeout=15s (transaction-local).
-- Privileges: service_role EXECUTE only; no anon/authenticated.
--
-- Does NOT:
--   - enable production decision create or merchant approval
--   - alter PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE
--   - activate workers / cron / HTTP / UI
--   - fork M5 formulas or source-token generation

-- -----------------------------------------------------------------------------
-- create-evidence fence scaffold
-- -----------------------------------------------------------------------------

create or replace function public.evaluate_pb1_create_evidence_fence(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_metric_date date,
  p_algorithm_version text,
  p_pinned_time_zone text,
  p_bound_source_token text,
  p_expected_metric_source_watermark text,
  p_supplier_id uuid default null,
  p_bound_supplier_product_id uuid default null,
  p_bound_supplier_product_updated_at timestamptz default null,
  p_bound_lead_time_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  metric_algorithm_version constant text := 'm5-derived-metrics-v1';
  fence_version constant text := 'm7-pb1-create-evidence-fence-v1';
  watermark_version constant text := 'm7-pb1-metric-source-watermark-v1';
  v_store_timezone text;
  v_as_of date;
  v_metric public.sku_daily_metrics%rowtype;
  v_request public.sku_daily_metric_recompute_requests%rowtype;
  v_request_found boolean := false;
  v_supplier public.supplier_products%rowtype;
  v_preferred_count integer;
  v_snapshot jsonb;
  v_current_token text;
  v_snapshot_tz text;
  v_watermark text;
  v_window_start date;
  v_dirty_events integer;
  v_selection_mode text;
  v_open_statuses text[] := array[
    'queued',
    'claimed',
    'running',
    'retry_wait',
    'failed'
  ];
begin
  -- Transaction-local bounds (align M5.5 / trusted-incoming commit).
  perform pg_catalog.set_config('lock_timeout', '2s', true);
  perform pg_catalog.set_config('statement_timeout', '15s', true);

  -- Fail closed on incomplete caller evidence claims (no silent defaults).
  if p_organization_id is null
    or p_store_id is null
    or p_location_id is null
    or p_variant_id is null
    or p_metric_date is null
    or p_algorithm_version is null
    or p_pinned_time_zone is null
    or btrim(p_pinned_time_zone) = ''
    or p_bound_source_token is null
    or btrim(p_bound_source_token) = ''
    or p_expected_metric_source_watermark is null
    or btrim(p_expected_metric_source_watermark) = ''
  then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'FENCE_ATTESTATION_INVALID',
      'detail', 'Create-evidence fence requires organization, store, location, variant, metric_date, algorithm, pinned_time_zone, bound_source_token, and expected_metric_source_watermark.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'unproven'
    );
  end if;

  if p_algorithm_version is distinct from metric_algorithm_version then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'UNSUPPORTED_METRIC_ALGORITHM',
      'detail', format('algorithm_version must be %s', metric_algorithm_version),
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'unproven'
    );
  end if;

  -- Partial bound supplier claims are rejected (all-or-nothing revision check).
  if (
    p_bound_supplier_product_id is not null
    or p_bound_supplier_product_updated_at is not null
    or p_bound_lead_time_days is not null
  )
  and (
    p_bound_supplier_product_id is null
    or p_bound_supplier_product_updated_at is null
    or p_bound_lead_time_days is null
  ) then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'FENCE_ATTESTATION_INVALID',
      'detail', 'Bound supplier revision requires supplier_product_id, updated_at, and lead_time_days together.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'unproven'
    );
  end if;

  -- §1.2 step 1: grain advisory (closes first dirty-request race).
  perform public.acquire_sku_daily_metric_grain_xact_lock(
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id,
    p_metric_date,
    p_algorithm_version
  );

  -- §1.2 step 2: supplier org+variant advisory (closes preferred phantoms).
  perform public.acquire_supplier_products_org_variant_xact_lock(
    p_organization_id,
    p_variant_id
  );

  -- §1.2 step 3: source SHARE in canonical M5 commit order (before metric).
  lock table public.stores in share mode;
  lock table public.orders in share mode;
  lock table public.order_items in share mode;
  lock table public.return_refunds in share mode;
  lock table public.inventory_snapshots in share mode;
  lock table public.purchase_orders in share mode;
  lock table public.purchase_order_items in share mode;
  lock table public.store_incoming_evidence_attestations in share mode;

  -- Tenant + store timezone under SHARE.
  select s.timezone
  into v_store_timezone
  from public.stores s
  where
    s.organization_id = p_organization_id
    and s.id = p_store_id;

  if v_store_timezone is null then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'FOREIGN_TENANT_REJECTED',
      'detail', 'Store not found for organization_id/store_id under create-evidence fence.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  if p_pinned_time_zone is distinct from v_store_timezone then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'METRIC_DATE_NOT_CURRENT',
      'detail', 'pinned_time_zone must equal trusted store timezone.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  begin
    v_as_of := (pg_catalog.timezone(v_store_timezone, pg_catalog.now()))::date;
  exception
    when others then
      return jsonb_build_object(
        'ok', false,
        'disposition', 'REJECT',
        'code', 'FENCE_ATTESTATION_INVALID',
        'detail', 'Store timezone could not be applied for as-of date.',
        'fenceVersion', fence_version,
        'productionCreateEligible', false,
        'commercialActionsEligible', false,
        'inventoryActionCreated', false,
        'merchantApprovable', false,
        'transactionSafety', 'locks_held_in_caller_tx'
      );
  end;

  if p_metric_date is distinct from v_as_of then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'METRIC_DATE_NOT_CURRENT',
      'detail', 'metric_date must equal store-local as-of date under pinned timezone.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  if not exists (
    select 1
    from public.locations l
    where
      l.organization_id = p_organization_id
      and l.store_id = p_store_id
      and l.id = p_location_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'FOREIGN_TENANT_REJECTED',
      'detail', 'Location not found for organization/store under create-evidence fence.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  if not exists (
    select 1
    from public.product_variants pv
    where
      pv.organization_id = p_organization_id
      and pv.store_id = p_store_id
      and pv.id = p_variant_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'FOREIGN_TENANT_REJECTED',
      'detail', 'Variant not found for organization/store under create-evidence fence.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  -- §1.2 step 4: exact metric row FOR UPDATE (after SHARE).
  select m.*
  into v_metric
  from public.sku_daily_metrics m
  where
    m.organization_id = p_organization_id
    and m.store_id = p_store_id
    and m.location_id = p_location_id
    and m.variant_id = p_variant_id
    and m.metric_date = p_metric_date
    and m.algorithm_version = p_algorithm_version
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'METRIC_EVIDENCE_UNPROVEN',
      'detail', 'No sku_daily_metrics row for the requested grain/date/algorithm.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  if v_metric.algorithm_version is distinct from metric_algorithm_version then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'UNSUPPORTED_METRIC_ALGORITHM',
      'detail', 'Locked metric algorithm_version is unsupported.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  v_watermark :=
    watermark_version
    || '|' || v_metric.metric_date::text
    || '|' || v_metric.algorithm_version
    || '|' || (to_jsonb(v_metric.updated_at) #>> '{}');

  if v_watermark is distinct from p_expected_metric_source_watermark then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'METRIC_WATERMARK_MISMATCH',
      'detail', 'Locked metric watermark does not match expected_metric_source_watermark.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx',
      'metricSourceWatermark', v_watermark
    );
  end if;

  -- §1.2 step 5: matching recompute request FOR UPDATE if present.
  select r.*
  into v_request
  from public.sku_daily_metric_recompute_requests r
  where
    r.organization_id = p_organization_id
    and r.store_id = p_store_id
    and r.location_id = p_location_id
    and r.variant_id = p_variant_id
    and r.metric_date = p_metric_date
    and r.algorithm_version = p_algorithm_version
  for update;

  if found then
    v_request_found := true;
    if v_request.dirty_generation is distinct from v_request.applied_generation
      or v_request.status = any (v_open_statuses)
    then
      return jsonb_build_object(
        'ok', false,
        'disposition', 'REJECT',
        'code', 'PENDING_RECOMPUTE',
        'detail', 'Open or dirty recompute request rejects create-evidence freshness (generation axis).',
        'fenceVersion', fence_version,
        'productionCreateEligible', false,
        'commercialActionsEligible', false,
        'inventoryActionCreated', false,
        'merchantApprovable', false,
        'transactionSafety', 'locks_held_in_caller_tx',
        'recomputeStatus', v_request.status,
        'dirtyGeneration', v_request.dirty_generation,
        'appliedGeneration', v_request.applied_generation
      );
    end if;
  end if;

  -- 90-day inclusive source window [metric_date-89, metric_date].
  v_window_start := p_metric_date - 89;

  select count(*)::integer
  into v_dirty_events
  from public.sku_daily_metric_source_events e
  where
    e.organization_id = p_organization_id
    and e.store_id = p_store_id
    and e.location_id = p_location_id
    and e.variant_id = p_variant_id
    and e.algorithm_version = p_algorithm_version
    and e.consumed_at is null
    and e.source_date >= v_window_start
    and e.source_date <= p_metric_date;

  if v_dirty_events > 0 then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'METRIC_SOURCE_WINDOW_DIRTY',
      'detail', 'Unconsumed in-window source events reject create-evidence freshness.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx',
      'relevantUnconsumedEventCount', v_dirty_events,
      'windowStartDate', v_window_start,
      'windowEndDate', p_metric_date
    );
  end if;

  -- Mandatory SA008 under held SHARE (reuse M5 snapshot; no new token impl).
  v_snapshot := public.sku_daily_metric_source_snapshot(
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id
  );

  v_current_token := v_snapshot->>'sourceToken';
  v_snapshot_tz := v_snapshot->>'timeZone';

  if v_current_token is null
    or btrim(v_current_token) = ''
    or v_snapshot_tz is null
    or btrim(v_snapshot_tz) = ''
  then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'SOURCE_TOKEN_EVIDENCE_UNPROVEN',
      'detail', 'Source snapshot token/timezone missing under SHARE.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  if v_snapshot_tz is distinct from p_pinned_time_zone then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'METRIC_DATE_NOT_CURRENT',
      'detail', 'Source snapshot timezone diverges from pinned_time_zone.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  if v_current_token is distinct from p_bound_source_token then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'SA008',
      'detail', 'Source token mismatch under SHARE (STALE_SOURCE_TOKEN).',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  -- §1.2 step 6: supplier row FOR UPDATE (explicit or sole preferred).
  if p_supplier_id is not null then
    v_selection_mode := 'explicit';

    select sp.*
    into v_supplier
    from public.supplier_products sp
    where
      sp.organization_id = p_organization_id
      and sp.supplier_id = p_supplier_id
      and sp.variant_id = p_variant_id
    for update;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'disposition', 'REJECT',
        'code', 'SUPPLIER_MAPPING_NOT_FOUND',
        'detail', 'Explicit supplier_products mapping not found for org/supplier/variant.',
        'fenceVersion', fence_version,
        'productionCreateEligible', false,
        'commercialActionsEligible', false,
        'inventoryActionCreated', false,
        'merchantApprovable', false,
        'transactionSafety', 'locks_held_in_caller_tx',
        'selectionMode', v_selection_mode
      );
    end if;
  else
    v_selection_mode := 'implicit_preferred';

    select count(*)::integer
    into v_preferred_count
    from public.supplier_products sp
    where
      sp.organization_id = p_organization_id
      and sp.variant_id = p_variant_id
      and sp.preferred is true
      and sp.lead_time_days is not null;

    if v_preferred_count = 0 then
      return jsonb_build_object(
        'ok', false,
        'disposition', 'REJECT',
        'code', 'SUPPLIER_FACTS_ABSENT',
        'detail', 'No preferred supplier_products row with non-null lead_time_days; org/default LT forbidden.',
        'fenceVersion', fence_version,
        'productionCreateEligible', false,
        'commercialActionsEligible', false,
        'inventoryActionCreated', false,
        'merchantApprovable', false,
        'transactionSafety', 'locks_held_in_caller_tx',
        'selectionMode', v_selection_mode
      );
    end if;

    if v_preferred_count > 1 then
      return jsonb_build_object(
        'ok', false,
        'disposition', 'REJECT',
        'code', 'SUPPLIER_FACTS_AMBIGUOUS',
        'detail', 'Multiple preferred supplier_products mappings with lead_time_days.',
        'fenceVersion', fence_version,
        'productionCreateEligible', false,
        'commercialActionsEligible', false,
        'inventoryActionCreated', false,
        'merchantApprovable', false,
        'transactionSafety', 'locks_held_in_caller_tx',
        'selectionMode', v_selection_mode,
        'preferredCount', v_preferred_count
      );
    end if;

    select sp.*
    into v_supplier
    from public.supplier_products sp
    where
      sp.organization_id = p_organization_id
      and sp.variant_id = p_variant_id
      and sp.preferred is true
      and sp.lead_time_days is not null
    for update;
  end if;

  if v_supplier.lead_time_days is null then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'SUPPLIER_FACTS_ABSENT',
      'detail', 'Selected supplier_products.lead_time_days is null; no org/default fallback.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx',
      'selectionMode', v_selection_mode
    );
  end if;

  if v_supplier.lead_time_days < 0 then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'SUPPLIER_FACTS_INVALID',
      'detail', 'Selected supplier_products.lead_time_days is invalid.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx',
      'selectionMode', v_selection_mode
    );
  end if;

  if p_bound_supplier_product_id is not null then
    if v_supplier.id is distinct from p_bound_supplier_product_id then
      return jsonb_build_object(
        'ok', false,
        'disposition', 'REJECT',
        'code', 'SUPPLIER_PRODUCT_ID_MISMATCH',
        'detail', 'Locked supplier_products.id diverges from bound supplier_product_id.',
        'fenceVersion', fence_version,
        'productionCreateEligible', false,
        'commercialActionsEligible', false,
        'inventoryActionCreated', false,
        'merchantApprovable', false,
        'transactionSafety', 'locks_held_in_caller_tx',
        'selectionMode', v_selection_mode
      );
    end if;

    if v_supplier.updated_at is distinct from p_bound_supplier_product_updated_at
      or v_supplier.lead_time_days is distinct from p_bound_lead_time_days
    then
      return jsonb_build_object(
        'ok', false,
        'disposition', 'REJECT',
        'code', 'SUPPLIER_FACTS_STALE',
        'detail', 'Locked supplier revision/lead_time diverges from bound supplier facts.',
        'fenceVersion', fence_version,
        'productionCreateEligible', false,
        'commercialActionsEligible', false,
        'inventoryActionCreated', false,
        'merchantApprovable', false,
        'transactionSafety', 'locks_held_in_caller_tx',
        'selectionMode', v_selection_mode
      );
    end if;
  end if;

  -- §1.2 step 7: final freshness revalidation while locks remain held.
  select m.updated_at
  into v_metric.updated_at
  from public.sku_daily_metrics m
  where m.id = v_metric.id
  for update;

  v_watermark :=
    watermark_version
    || '|' || v_metric.metric_date::text
    || '|' || v_metric.algorithm_version
    || '|' || (to_jsonb(v_metric.updated_at) #>> '{}');

  if v_watermark is distinct from p_expected_metric_source_watermark then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'METRIC_WATERMARK_MISMATCH',
      'detail', 'Final metric watermark recheck failed under held locks.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  if v_request_found then
    select r.*
    into v_request
    from public.sku_daily_metric_recompute_requests r
    where
      r.organization_id = p_organization_id
      and r.store_id = p_store_id
      and r.location_id = p_location_id
      and r.variant_id = p_variant_id
      and r.metric_date = p_metric_date
      and r.algorithm_version = p_algorithm_version
    for update;

    if v_request.dirty_generation is distinct from v_request.applied_generation
      or v_request.status = any (v_open_statuses)
    then
      return jsonb_build_object(
        'ok', false,
        'disposition', 'REJECT',
        'code', 'PENDING_RECOMPUTE',
        'detail', 'Final recompute generation recheck failed under held locks.',
        'fenceVersion', fence_version,
        'productionCreateEligible', false,
        'commercialActionsEligible', false,
        'inventoryActionCreated', false,
        'merchantApprovable', false,
        'transactionSafety', 'locks_held_in_caller_tx'
      );
    end if;
  else
    -- Absence still covered by grain advisory; confirm still absent.
    if exists (
      select 1
      from public.sku_daily_metric_recompute_requests r
      where
        r.organization_id = p_organization_id
        and r.store_id = p_store_id
        and r.location_id = p_location_id
        and r.variant_id = p_variant_id
        and r.metric_date = p_metric_date
        and r.algorithm_version = p_algorithm_version
    ) then
      return jsonb_build_object(
        'ok', false,
        'disposition', 'REJECT',
        'code', 'PENDING_RECOMPUTE',
        'detail', 'Recompute request appeared under held grain advisory; fail closed.',
        'fenceVersion', fence_version,
        'productionCreateEligible', false,
        'commercialActionsEligible', false,
        'inventoryActionCreated', false,
        'merchantApprovable', false,
        'transactionSafety', 'locks_held_in_caller_tx'
      );
    end if;
  end if;

  select count(*)::integer
  into v_dirty_events
  from public.sku_daily_metric_source_events e
  where
    e.organization_id = p_organization_id
    and e.store_id = p_store_id
    and e.location_id = p_location_id
    and e.variant_id = p_variant_id
    and e.algorithm_version = p_algorithm_version
    and e.consumed_at is null
    and e.source_date >= v_window_start
    and e.source_date <= p_metric_date;

  if v_dirty_events > 0 then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'METRIC_SOURCE_WINDOW_DIRTY',
      'detail', 'Final in-window source-event recheck failed under held locks.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  v_snapshot := public.sku_daily_metric_source_snapshot(
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id
  );

  if (v_snapshot->>'sourceToken') is distinct from p_bound_source_token
    or (v_snapshot->>'timeZone') is distinct from p_pinned_time_zone
  then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'SA008',
      'detail', 'Final SA008/source-token recheck failed under held SHARE.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx'
    );
  end if;

  select sp.*
  into v_supplier
  from public.supplier_products sp
  where sp.id = v_supplier.id
  for update;

  if not found
    or v_supplier.lead_time_days is null
    or (
      p_bound_supplier_product_id is not null
      and (
        v_supplier.id is distinct from p_bound_supplier_product_id
        or v_supplier.updated_at is distinct from p_bound_supplier_product_updated_at
        or v_supplier.lead_time_days is distinct from p_bound_lead_time_days
      )
    )
  then
    return jsonb_build_object(
      'ok', false,
      'disposition', 'REJECT',
      'code', 'SUPPLIER_FACTS_STALE',
      'detail', 'Final supplier revision recheck failed under held locks.',
      'fenceVersion', fence_version,
      'productionCreateEligible', false,
      'commercialActionsEligible', false,
      'inventoryActionCreated', false,
      'merchantApprovable', false,
      'transactionSafety', 'locks_held_in_caller_tx',
      'selectionMode', v_selection_mode
    );
  end if;

  -- §1.2 step 8 intentionally omitted: NO inventory_actions INSERT.
  return jsonb_build_object(
    'ok', true,
    'disposition', 'PASS',
    'code', null,
    'detail', 'Create-evidence fence passed under held locks; no inventory action created; production create remains unavailable.',
    'fenceVersion', fence_version,
    'productionCreateEligible', false,
    'commercialActionsEligible', false,
    'inventoryActionCreated', false,
    'merchantApprovable', false,
    'transactionSafety', 'locks_held_in_caller_tx',
    'selectionMode', v_selection_mode,
    'organizationId', p_organization_id,
    'storeId', p_store_id,
    'locationId', p_location_id,
    'variantId', p_variant_id,
    'metricDate', p_metric_date,
    'algorithmVersion', metric_algorithm_version,
    'pinnedTimeZone', p_pinned_time_zone,
    'metricSourceWatermark', v_watermark,
    'sourceTokenMatched', true,
    'requestPresence', case when v_request_found then 'observed_present' else 'observed_absent' end,
    'supplierId', v_supplier.supplier_id,
    'supplierProductId', v_supplier.id,
    'supplierProductUpdatedAt', to_jsonb(v_supplier.updated_at) #>> '{}',
    'leadTimeDays', v_supplier.lead_time_days,
    'provenanceKind', 'stated_supplier_product_terms',
    'notVerifiedDeliveryPerformance', true,
    'lockOrder', jsonb_build_array(
      'grain_advisory_71010402',
      'supplier_advisory_71010401',
      'source_share_canonical_m5',
      'metric_for_update',
      'recompute_request_for_update',
      'supplier_product_for_update',
      'revalidate'
    ),
    'notes', jsonb_build_array(
      'DORMANT_CREATE_EVIDENCE_FENCE_SCAFFOLD',
      'NOT_production_decision_create',
      'NOT_m7_3_approvable',
      'NO_inventory_actions_insert'
    )
  );
end;
$$;

comment on function public.evaluate_pb1_create_evidence_fence(
  uuid, uuid, uuid, uuid, date, text, text, text, text, uuid, uuid, timestamptz, integer
) is
  'PB1.h.4.3: dormant create-evidence fence scaffold. Acquires §1.2 locks, revalidates metric/source/supplier evidence, returns PASS/REJECT diagnostic only. Does not insert inventory_actions or unlock production create/approve.';

revoke all
on function public.evaluate_pb1_create_evidence_fence(
  uuid, uuid, uuid, uuid, date, text, text, text, text, uuid, uuid, timestamptz, integer
)
from public, anon, authenticated;

grant execute
on function public.evaluate_pb1_create_evidence_fence(
  uuid, uuid, uuid, uuid, date, text, text, text, text, uuid, uuid, timestamptz, integer
)
to service_role;
