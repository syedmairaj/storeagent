-- StoreAgent M6 P2c.1
-- Gated forecast sku-demand source snapshot (LOCAL-ONLY until hosted approval).
--
-- One SECURITY DEFINER RPC. service_role EXECUTE only.
--
-- Concurrency / isolation model (read-only snapshot; does not change M5):
--   1) statement_timeout = 15s — fail closed on unbounded query runtime.
--   2) lock_timeout = 2s — fail closed if incidental lock waits (e.g. DDL /
--      ACCESS EXCLUSIVE) block the read. No table-level SHARE locks: a
--      single-grain forecast must not stall unrelated tenant writers.
--   3) One SQL statement builds token + payloads + pending fence so READ
--      COMMITTED cannot tear token vs body (same single-statement MVCC
--      discipline as M5.5 source_snapshot_consistency, without M5's commit
--      SHARE quiesce — unnecessary for a pure read).
--
-- Publication freshness boundary (NOT solved by this RPC):
--   sourceToken proves the identity of rows visible to THIS statement's
--   MVCC snapshot. A correction (or commerce write) that commits after the
--   statement's snapshot is taken is outside the token. Callers must treat
--   the returned payload as point-in-time evidence identity, not a claim that
--   the published world remains complete afterward. Re-snapshot (or rely on
--   later invalidation) before treating completeness as still current.
--
-- No trustedCompleteDates. Sync success is not completeness.
-- Pending corrections are returned and each active coverage row is stamped
-- with pendingCorrection using arrival-watermark fencing + null-conservative
-- matching (forecast_coverage_has_pending_corrections).

create or replace function public.forecast_sku_demand_source_snapshot(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_forecast_as_of date,
  p_lookback_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lookback integer;
  v_start date;
  result jsonb;
begin
  if to_regclass('public.forecast_coverage_correction_events') is null
    or to_regprocedure(
      'public.forecast_coverage_has_pending_corrections(uuid,uuid,text,date,uuid,uuid,timestamptz)'
    ) is null
    or to_regprocedure(
      'public.forecast_coverage_correction_matches_evidence(uuid,uuid,uuid,uuid)'
    ) is null
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast sku demand snapshot requires correction outbox and fence helpers';
  end if;

  if p_organization_id is null
    or p_store_id is null
    or p_location_id is null
    or p_variant_id is null
    or p_forecast_as_of is null
  then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast sku demand snapshot requires organization, store, location, variant, and forecast_as_of';
  end if;

  v_lookback := coalesce(p_lookback_days, 90);

  if v_lookback < 1 or v_lookback > 365 then
    raise exception
      using
        errcode = 'P0001',
        message = 'forecast sku demand lookbackDays must be an integer from 1 to 365';
  end if;

  v_start := p_forecast_as_of - (v_lookback - 1);

  -- Bound total runtime and incidental lock waits; fail closed.
  -- No table SHARE: single-statement MVCC keeps token/payload/fence consistent
  -- without cross-tenant write blocking.
  perform pg_catalog.set_config('statement_timeout', '15s', true);
  perform pg_catalog.set_config('lock_timeout', '2s', true);

  with
  store_row as (
    select
      s.timezone,
      exists (
        select 1
        from pg_catalog.pg_timezone_names as tz
        where tz.name = s.timezone
      ) as timezone_recognized
    from public.stores as s
    where
      s.organization_id = p_organization_id
      and s.id = p_store_id
  ),
  location_ok as (
    select 1 as present
    from public.locations as l
    where
      l.organization_id = p_organization_id
      and l.store_id = p_store_id
      and l.id = p_location_id
  ),
  variant_ok as (
    select 1 as present
    from public.product_variants as pv
    where
      pv.organization_id = p_organization_id
      and pv.store_id = p_store_id
      and pv.id = p_variant_id
  ),
  scope_error as (
    select
      case
        when not exists (select 1 from store_row) then 'store'
        when exists (
          select 1 from store_row as s where not s.timezone_recognized
        ) then 'invalid_iana_timezone'
        when not exists (select 1 from location_ok) then 'location'
        when not exists (select 1 from variant_ok) then 'variant'
        else null
      end as code
  ),
  tz as (
    select s.timezone
    from store_row as s
    where s.timezone_recognized
  ),
  scoped_items as (
    select
      i.id as item_id,
      i.organization_id,
      i.store_id,
      i.order_id,
      i.variant_id,
      i.location_id,
      i.quantity,
      o.status,
      o.ordered_at,
      (pg_catalog.timezone((select timezone from tz), o.ordered_at))::date
        as local_date,
      pg_catalog.concat_ws(
        '|',
        'order_item',
        i.id::text,
        o.id::text,
        o.status,
        o.ordered_at::text,
        i.variant_id::text,
        coalesce(i.location_id::text, ''),
        i.quantity::text
      ) as line
    from public.order_items as i
    join public.orders as o
      on o.organization_id = i.organization_id
      and o.store_id = i.store_id
      and o.id = i.order_id
    where
      exists (select 1 from tz)
      and i.organization_id = p_organization_id
      and i.store_id = p_store_id
      and i.location_id = p_location_id
      and i.variant_id = p_variant_id
      and (pg_catalog.timezone((select timezone from tz), o.ordered_at))::date
        between v_start and p_forecast_as_of
  ),
  scoped_returns as (
    select
      r.id,
      r.organization_id,
      r.store_id,
      r.variant_id,
      r.location_id,
      r.returned_quantity,
      r.occurred_at,
      (pg_catalog.timezone((select timezone from tz), r.occurred_at))::date
        as local_date,
      pg_catalog.concat_ws(
        '|',
        'return',
        r.id::text,
        r.variant_id::text,
        coalesce(r.location_id::text, ''),
        coalesce(r.returned_quantity::text, ''),
        r.occurred_at::text
      ) as line
    from public.return_refunds as r
    where
      exists (select 1 from tz)
      and r.organization_id = p_organization_id
      and r.store_id = p_store_id
      and r.location_id = p_location_id
      and r.variant_id = p_variant_id
      and (pg_catalog.timezone((select timezone from tz), r.occurred_at))::date
        between v_start and p_forecast_as_of
  ),
  scoped_inventory as (
    select
      n.id,
      n.organization_id,
      n.store_id,
      n.location_id,
      n.variant_id,
      n.observed_at,
      n.available_quantity,
      (pg_catalog.timezone((select timezone from tz), n.observed_at))::date
        as local_date,
      pg_catalog.concat_ws(
        '|',
        'snapshot',
        n.id::text,
        n.variant_id::text,
        n.location_id::text,
        n.observed_at::text,
        coalesce(n.available_quantity::text, '')
      ) as line
    from public.inventory_snapshots as n
    where
      exists (select 1 from tz)
      and n.organization_id = p_organization_id
      and n.store_id = p_store_id
      and n.location_id = p_location_id
      and n.variant_id = p_variant_id
      and (pg_catalog.timezone((select timezone from tz), n.observed_at))::date
        between v_start and p_forecast_as_of
  ),
  scoped_promotion as (
    select
      p.evidence_id,
      p.organization_id,
      p.store_id,
      p.location_id,
      p.variant_id,
      p.local_date,
      p.state,
      p.trust,
      p.source,
      p.observed_at,
      p.version,
      p.invalidated_at,
      p.supersedes_evidence_id,
      pg_catalog.concat_ws(
        '|',
        'promo',
        p.evidence_id,
        p.local_date::text,
        coalesce(p.location_id::text, ''),
        coalesce(p.variant_id::text, ''),
        p.state,
        p.trust,
        p.version::text,
        p.observed_at::text,
        coalesce(p.invalidated_at::text, '')
      ) as line
    from public.forecast_day_promotion_evidence as p
    where
      exists (select 1 from tz)
      and p.organization_id = p_organization_id
      and p.store_id = p_store_id
      and p.local_date between v_start and p_forecast_as_of
      and p.invalidated_at is null
      and (p.location_id is null or p.location_id = p_location_id)
      and (p.variant_id is null or p.variant_id = p_variant_id)
  ),
  scoped_coverage as (
    select
      c.evidence_id,
      c.organization_id,
      c.store_id,
      c.location_id,
      c.variant_id,
      c.local_date,
      c.stream,
      c.coverage,
      c.trust,
      c.source,
      c.as_of,
      c.observed_at,
      c.version,
      c.invalidated_at,
      c.supersedes_evidence_id,
      c.closure_id,
      public.forecast_coverage_has_pending_corrections(
        c.organization_id,
        c.store_id,
        c.stream,
        c.local_date,
        c.location_id,
        c.variant_id,
        c.as_of
      ) as pending_correction,
      pg_catalog.concat_ws(
        '|',
        'coverage',
        c.evidence_id,
        c.local_date::text,
        c.stream,
        c.coverage,
        coalesce(c.location_id::text, ''),
        coalesce(c.variant_id::text, ''),
        c.trust,
        c.as_of::text,
        c.version::text,
        coalesce(c.closure_id, ''),
        coalesce(c.invalidated_at::text, '')
      ) as line
    from public.forecast_day_coverage_evidence as c
    where
      exists (select 1 from tz)
      and c.organization_id = p_organization_id
      and c.store_id = p_store_id
      and c.local_date between v_start and p_forecast_as_of
      and c.invalidated_at is null
      and (c.location_id is null or c.location_id = p_location_id)
      and (c.variant_id is null or c.variant_id = p_variant_id)
  ),
  scoped_pending as (
    select
      e.event_id,
      e.organization_id,
      e.store_id,
      e.stream,
      e.local_date,
      e.location_id,
      e.variant_id,
      e.business_at,
      e.arrived_at,
      e.source_table,
      e.source_op,
      pg_catalog.concat_ws(
        '|',
        'pending',
        e.event_id::text,
        e.stream,
        e.local_date::text,
        coalesce(e.location_id::text, ''),
        coalesce(e.variant_id::text, ''),
        e.arrived_at::text,
        e.business_at::text
      ) as line
    from public.forecast_coverage_correction_events as e
    where
      exists (select 1 from tz)
      and e.organization_id = p_organization_id
      and e.store_id = p_store_id
      and e.local_date between v_start and p_forecast_as_of
      and e.processed_at is null
      and public.forecast_coverage_correction_matches_evidence(
        e.location_id,
        e.variant_id,
        p_location_id,
        p_variant_id
      )
  ),
  evidence_lines as (
    select line from scoped_items
    union all
    select line from scoped_returns
    union all
    select line from scoped_inventory
    union all
    select line from scoped_promotion
    union all
    select line from scoped_coverage
    union all
    select line from scoped_pending
  )
  select
    case
      when (select code from scope_error) is not null then
        pg_catalog.jsonb_build_object(
          'ok', false,
          'error', (select code from scope_error)
        )
      else
        pg_catalog.jsonb_build_object(
          'ok', true,
          'timeZone', (select timezone from tz),
          'forecastAsOf', p_forecast_as_of,
          'lookbackDays', v_lookback,
          'inputStartDate', v_start,
          'inputEndDate', p_forecast_as_of,
          'sourceToken', pg_catalog.md5(
            pg_catalog.concat_ws(
              E'\n',
              'timezone=' || (select timezone from tz),
              'as_of=' || p_forecast_as_of::text,
              'lookback=' || v_lookback::text,
              'grain=' || p_organization_id::text || '|' || p_store_id::text
                || '|' || p_location_id::text || '|' || p_variant_id::text,
              coalesce((
                select pg_catalog.string_agg(evidence_lines.line, E'\n' order by evidence_lines.line)
                from evidence_lines
              ), '')
            )
          ),
          'orders', coalesce((
            select pg_catalog.jsonb_agg(order_row.payload order by order_row.order_id)
            from (
              select distinct on (scoped_items.order_id)
                scoped_items.order_id,
                pg_catalog.jsonb_build_object(
                  'id', scoped_items.order_id,
                  'organizationId', scoped_items.organization_id,
                  'storeId', scoped_items.store_id,
                  'status', scoped_items.status,
                  'orderedAt', scoped_items.ordered_at
                ) as payload
              from scoped_items
              order by scoped_items.order_id, scoped_items.item_id
            ) as order_row
          ), '[]'::jsonb),
          'orderItems', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', scoped_items.item_id,
                'organizationId', scoped_items.organization_id,
                'storeId', scoped_items.store_id,
                'orderId', scoped_items.order_id,
                'variantId', scoped_items.variant_id,
                'locationId', scoped_items.location_id,
                'quantity', scoped_items.quantity
              )
              order by scoped_items.item_id
            )
            from scoped_items
          ), '[]'::jsonb),
          'returnRefunds', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', scoped_returns.id,
                'organizationId', scoped_returns.organization_id,
                'storeId', scoped_returns.store_id,
                'variantId', scoped_returns.variant_id,
                'locationId', scoped_returns.location_id,
                'returnedQuantity', scoped_returns.returned_quantity,
                'occurredAt', scoped_returns.occurred_at
              )
              order by scoped_returns.id
            )
            from scoped_returns
          ), '[]'::jsonb),
          'inventorySnapshots', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', scoped_inventory.id,
                'organizationId', scoped_inventory.organization_id,
                'storeId', scoped_inventory.store_id,
                'locationId', scoped_inventory.location_id,
                'variantId', scoped_inventory.variant_id,
                'observedAt', scoped_inventory.observed_at,
                'availableQuantity', scoped_inventory.available_quantity
              )
              order by scoped_inventory.id
            )
            from scoped_inventory
          ), '[]'::jsonb),
          'promotionEvidence', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'evidenceId', scoped_promotion.evidence_id,
                'organizationId', scoped_promotion.organization_id,
                'storeId', scoped_promotion.store_id,
                'locationId', scoped_promotion.location_id,
                'variantId', scoped_promotion.variant_id,
                'localDate', scoped_promotion.local_date,
                'state', scoped_promotion.state,
                'trust', scoped_promotion.trust,
                'source', scoped_promotion.source,
                'observedAt', scoped_promotion.observed_at,
                'version', scoped_promotion.version,
                'invalidatedAt', scoped_promotion.invalidated_at,
                'supersedesEvidenceId', scoped_promotion.supersedes_evidence_id
              )
              order by scoped_promotion.evidence_id
            )
            from scoped_promotion
          ), '[]'::jsonb),
          'coverageEvidence', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'evidenceId', scoped_coverage.evidence_id,
                'organizationId', scoped_coverage.organization_id,
                'storeId', scoped_coverage.store_id,
                'locationId', scoped_coverage.location_id,
                'variantId', scoped_coverage.variant_id,
                'localDate', scoped_coverage.local_date,
                'stream', scoped_coverage.stream,
                'coverage', scoped_coverage.coverage,
                'trust', scoped_coverage.trust,
                'source', scoped_coverage.source,
                'asOf', scoped_coverage.as_of,
                'observedAt', scoped_coverage.observed_at,
                'version', scoped_coverage.version,
                'invalidatedAt', scoped_coverage.invalidated_at,
                'supersedesEvidenceId', scoped_coverage.supersedes_evidence_id,
                'closureId', scoped_coverage.closure_id,
                'pendingCorrection', scoped_coverage.pending_correction
              )
              order by scoped_coverage.evidence_id
            )
            from scoped_coverage
          ), '[]'::jsonb),
          'pendingCorrections', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'eventId', scoped_pending.event_id,
                'organizationId', scoped_pending.organization_id,
                'storeId', scoped_pending.store_id,
                'stream', scoped_pending.stream,
                'localDate', scoped_pending.local_date,
                'locationId', scoped_pending.location_id,
                'variantId', scoped_pending.variant_id,
                'businessAt', scoped_pending.business_at,
                'arrivedAt', scoped_pending.arrived_at,
                'sourceTable', scoped_pending.source_table,
                'sourceOp', scoped_pending.source_op
              )
              order by scoped_pending.event_id
            )
            from scoped_pending
          ), '[]'::jsonb)
        )
    end
  into result
  from scope_error;

  if result->>'ok' = 'false' then
    raise exception
      using
        errcode = 'P0001',
        message = format(
          'forecast sku demand snapshot scope error: %s',
          result->>'error'
        );
  end if;

  return result;
end;
$$;

revoke all
on function public.forecast_sku_demand_source_snapshot(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  integer
)
from public, anon, authenticated;

grant execute
on function public.forecast_sku_demand_source_snapshot(
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  integer
)
to service_role;
