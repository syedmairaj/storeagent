-- StoreAgent M5.2
-- Durable sku_daily_metrics schema and tenant read boundary.
--
-- Grain:
--   organization + store + location + variant + metric_date
--   + algorithm_version
-- Location is required. This table has no store rollup.
--
-- The row is a recomputable derived cache, not canonical history.
-- The same natural key may later be updated by trusted M5 persistence.
-- A different algorithm_version is a different row.
--
-- Unknown numeric results stay null. This migration does not default
-- them to zero. There is no forecast, decision, confidence, or
-- recommended-quantity column.

create domain public.sku_daily_metric_reason_code as text
  constraint sku_daily_metric_reason_code_vocabulary
  check (
    value in (
      'no_eligible_days',
      'demand_unknown',
      'zero_demand',
      'inventory_unknown',
      'safety_stock_days_unknown',
      'safety_stock_unknown',
      'lead_time_unknown',
      'review_period_unknown',
      'target_stock_unknown',
      'incoming_state_unknown',
      'sell_through_denominator_zero',
      'inventory_age_unknown',
      'trend_input_unknown',
      'purchase_order_status_unknown',
      'received_quantity_unknown',
      'received_exceeds_ordered'
    )
  );

create table public.sku_daily_metrics (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  store_id uuid not null,
  location_id uuid not null,
  variant_id uuid not null,

  metric_date date not null,
  algorithm_version text not null,

  units_sold integer not null,
  returned_units integer not null,
  net_units_sold integer not null,

  eligible_days_7d integer not null,
  eligible_days_14d integer not null,
  eligible_days_30d integer not null,
  eligible_days_90d integer not null,

  coverage_ratio_7d numeric not null,
  coverage_ratio_14d numeric not null,
  coverage_ratio_30d numeric not null,
  coverage_ratio_90d numeric not null,

  sales_velocity_7d numeric null,
  sales_velocity_14d numeric null,
  sales_velocity_30d numeric null,
  sales_velocity_90d numeric null,

  sales_velocity_7d_reason_code
    public.sku_daily_metric_reason_code null,
  sales_velocity_14d_reason_code
    public.sku_daily_metric_reason_code null,
  sales_velocity_30d_reason_code
    public.sku_daily_metric_reason_code null,
  sales_velocity_90d_reason_code
    public.sku_daily_metric_reason_code null,

  available_quantity integer null,
  eligible_incoming_quantity integer null,
  eligible_incoming_reason_code
    public.sku_daily_metric_reason_code null,
  inventory_position integer null,

  days_of_stock numeric null,
  days_of_stock_reason_code
    public.sku_daily_metric_reason_code null,

  sell_through_rate numeric null,
  sell_through_reason_code
    public.sku_daily_metric_reason_code null,

  inventory_age_days integer null,
  inventory_age_quality text not null,
  inventory_age_reason_code
    public.sku_daily_metric_reason_code null,

  demand_trend text not null,
  demand_trend_reason_code
    public.sku_daily_metric_reason_code null,

  safety_stock integer null,
  safety_stock_reason_code
    public.sku_daily_metric_reason_code null,

  reorder_point integer null,
  reorder_point_reason_code
    public.sku_daily_metric_reason_code null,

  target_stock integer null,
  target_stock_reason_code
    public.sku_daily_metric_reason_code null,

  created_at timestamptz not null
    default pg_catalog.now(),
  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint sku_daily_metrics_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,

  constraint sku_daily_metrics_store_ownership_fk
    foreign key (
      organization_id,
      store_id
    )
    references public.stores (
      organization_id,
      id
    )
    on delete restrict,

  constraint sku_daily_metrics_location_ownership_fk
    foreign key (
      organization_id,
      store_id,
      location_id
    )
    references public.locations (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint sku_daily_metrics_variant_ownership_fk
    foreign key (
      organization_id,
      store_id,
      variant_id
    )
    references public.product_variants (
      organization_id,
      store_id,
      id
    )
    on delete restrict,

  constraint sku_daily_metrics_natural_key
    unique (
      organization_id,
      store_id,
      location_id,
      variant_id,
      metric_date,
      algorithm_version
    ),

  constraint sku_daily_metrics_algorithm_version_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(algorithm_version)
      ) > 0
    ),

  constraint sku_daily_metrics_units_sold_non_negative
    check (units_sold >= 0),

  constraint sku_daily_metrics_returned_units_non_negative
    check (returned_units >= 0),

  constraint sku_daily_metrics_net_units_sold_floor
    check (
      net_units_sold
        = greatest(
          0,
          units_sold - returned_units
        )
    ),

  constraint sku_daily_metrics_eligible_days_7d_range
    check (eligible_days_7d between 0 and 7),

  constraint sku_daily_metrics_eligible_days_14d_range
    check (eligible_days_14d between 0 and 14),

  constraint sku_daily_metrics_eligible_days_30d_range
    check (eligible_days_30d between 0 and 30),

  constraint sku_daily_metrics_eligible_days_90d_range
    check (eligible_days_90d between 0 and 90),

  constraint sku_daily_metrics_coverage_7d_identity
    check (coverage_ratio_7d * 7 = eligible_days_7d),

  constraint sku_daily_metrics_coverage_14d_identity
    check (coverage_ratio_14d * 14 = eligible_days_14d),

  constraint sku_daily_metrics_coverage_30d_identity
    check (coverage_ratio_30d * 30 = eligible_days_30d),

  constraint sku_daily_metrics_coverage_90d_identity
    check (coverage_ratio_90d * 90 = eligible_days_90d),

  constraint sku_daily_metrics_velocity_7d_non_negative
    check (
      sales_velocity_7d is null
      or sales_velocity_7d >= 0
    ),

  constraint sku_daily_metrics_velocity_14d_non_negative
    check (
      sales_velocity_14d is null
      or sales_velocity_14d >= 0
    ),

  constraint sku_daily_metrics_velocity_30d_non_negative
    check (
      sales_velocity_30d is null
      or sales_velocity_30d >= 0
    ),

  constraint sku_daily_metrics_velocity_90d_non_negative
    check (
      sales_velocity_90d is null
      or sales_velocity_90d >= 0
    ),

  constraint sku_daily_metrics_velocity_7d_reason
    check (
      (sales_velocity_7d is null)
        = (sales_velocity_7d_reason_code is not null)
    ),

  constraint sku_daily_metrics_velocity_14d_reason
    check (
      (sales_velocity_14d is null)
        = (sales_velocity_14d_reason_code is not null)
    ),

  constraint sku_daily_metrics_velocity_30d_reason
    check (
      (sales_velocity_30d is null)
        = (sales_velocity_30d_reason_code is not null)
    ),

  constraint sku_daily_metrics_velocity_90d_reason
    check (
      (sales_velocity_90d is null)
        = (sales_velocity_90d_reason_code is not null)
    ),

  constraint sku_daily_metrics_available_quantity_non_negative
    check (
      available_quantity is null
      or available_quantity >= 0
    ),

  constraint sku_daily_metrics_eligible_incoming_non_negative
    check (
      eligible_incoming_quantity is null
      or eligible_incoming_quantity >= 0
    ),

  constraint sku_daily_metrics_eligible_incoming_reason
    check (
      (eligible_incoming_quantity is null)
        = (eligible_incoming_reason_code is not null)
    ),

  constraint sku_daily_metrics_inventory_position_identity
    check (
      (
        available_quantity is null
        or eligible_incoming_quantity is null
      )
      and inventory_position is null
      or (
        available_quantity is not null
        and eligible_incoming_quantity is not null
        and inventory_position
          = available_quantity + eligible_incoming_quantity
      )
    ),

  constraint sku_daily_metrics_days_of_stock_non_negative
    check (
      days_of_stock is null
      or days_of_stock >= 0
    ),

  constraint sku_daily_metrics_days_of_stock_reason
    check (
      (days_of_stock is null)
        = (days_of_stock_reason_code is not null)
    ),

  constraint sku_daily_metrics_sell_through_ratio
    check (
      sell_through_rate is null
      or (
        sell_through_rate >= 0
        and sell_through_rate <= 1
      )
    ),

  constraint sku_daily_metrics_velocity_30d_dependents
    check (
      sales_velocity_30d is not null
      or (
        safety_stock is null
        and reorder_point is null
        and target_stock is null
        and days_of_stock is null
      )
    ),

  constraint sku_daily_metrics_zero_demand_days_of_stock
    check (
      sales_velocity_30d is distinct from 0
      or (
        days_of_stock is null
        and days_of_stock_reason_code = 'zero_demand'
      )
    ),

  constraint sku_daily_metrics_sell_through_reason
    check (
      (
        sell_through_rate is not null
        and sell_through_reason_code is null
      )
      or (
        sell_through_rate is null
        and (
          sell_through_reason_code is null
          or sell_through_reason_code
            = 'sell_through_denominator_zero'
        )
      )
    ),

  constraint sku_daily_metrics_inventory_age_non_negative
    check (
      inventory_age_days is null
      or inventory_age_days >= 0
    ),

  constraint sku_daily_metrics_inventory_age_quality_check
    check (
      inventory_age_quality in (
        'exact',
        'estimated',
        'unavailable'
      )
    ),

  constraint sku_daily_metrics_inventory_age_provenance
    check (
      (
        inventory_age_quality = 'unavailable'
        and inventory_age_days is null
        and inventory_age_reason_code is not null
      )
      or (
        inventory_age_quality in ('exact', 'estimated')
        and inventory_age_days is not null
        and inventory_age_reason_code is null
      )
    ),

  constraint sku_daily_metrics_demand_trend_check
    check (
      demand_trend in (
        'rising',
        'stable',
        'falling',
        'unknown'
      )
    ),

  constraint sku_daily_metrics_demand_trend_reason
    check (
      (demand_trend = 'unknown')
        = (demand_trend_reason_code is not null)
    ),

  constraint sku_daily_metrics_safety_stock_non_negative
    check (
      safety_stock is null
      or safety_stock >= 0
    ),

  constraint sku_daily_metrics_safety_stock_reason
    check (
      (safety_stock is null)
        = (safety_stock_reason_code is not null)
    ),

  constraint sku_daily_metrics_reorder_point_non_negative
    check (
      reorder_point is null
      or reorder_point >= 0
    ),

  constraint sku_daily_metrics_reorder_point_reason
    check (
      (reorder_point is null)
        = (reorder_point_reason_code is not null)
    ),

  constraint sku_daily_metrics_target_stock_non_negative
    check (
      target_stock is null
      or target_stock >= 0
    ),

  constraint sku_daily_metrics_target_stock_reason
    check (
      (target_stock is null)
        = (target_stock_reason_code is not null)
    )
);

create index sku_daily_metrics_organization_store_date_idx
  on public.sku_daily_metrics (
    organization_id,
    store_id,
    metric_date
  );

create trigger sku_daily_metrics_set_updated_at
before update on public.sku_daily_metrics
for each row
execute function public.set_updated_at();

alter table public.sku_daily_metrics
enable row level security;

revoke all
on table public.sku_daily_metrics
from anon;

grant select
on table public.sku_daily_metrics
to authenticated;

revoke insert, update, delete, truncate, references, trigger
on table public.sku_daily_metrics
from authenticated;

create policy sku_daily_metrics_select_member
on public.sku_daily_metrics
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      sku_daily_metrics.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);
