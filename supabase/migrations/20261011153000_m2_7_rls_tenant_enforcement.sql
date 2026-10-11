-- StoreAgent M2.7
-- Canonical M2 RLS + browser privilege enforcement.
--
-- Frozen policy profile:
--
--   tenant_current_state:
--     authenticated client read allowed when organization membership exists
--     generic authenticated mutation denied
--
--   tenant_immutable_history:
--     authenticated client read allowed when organization membership exists
--     generic authenticated mutation denied
--
-- Membership remains the authorization bridge.
--
-- Provider IDs, integration IDs, store IDs, external IDs and other resource
-- identifiers never establish tenant authorization.
--
-- Trusted service-role/server workflows remain outside ordinary browser RLS
-- capability and must independently resolve trusted tenant scope.

-- -----------------------------------------------------------------------------
-- Explicit browser privilege boundary
-- -----------------------------------------------------------------------------

revoke all
on table
  public.products,
  public.product_variants,
  public.inventory_snapshots,
  public.orders,
  public.order_items,
  public.return_refunds,
  public.suppliers,
  public.supplier_products,
  public.purchase_orders,
  public.purchase_order_items,
  public.integrations,
  public.provider_bindings,
  public.sync_runs
from anon;

grant select
on table
  public.products,
  public.product_variants,
  public.inventory_snapshots,
  public.orders,
  public.order_items,
  public.return_refunds,
  public.suppliers,
  public.supplier_products,
  public.purchase_orders,
  public.purchase_order_items,
  public.integrations,
  public.provider_bindings,
  public.sync_runs
to authenticated;

revoke insert, update, delete, truncate, references, trigger
on table
  public.products,
  public.product_variants,
  public.inventory_snapshots,
  public.orders,
  public.order_items,
  public.return_refunds,
  public.suppliers,
  public.supplier_products,
  public.purchase_orders,
  public.purchase_order_items,
  public.integrations,
  public.provider_bindings,
  public.sync_runs
from authenticated;

-- -----------------------------------------------------------------------------
-- Tenant current-state SELECT policies
-- -----------------------------------------------------------------------------

create policy products_select_member
on public.products
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      products.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create policy product_variants_select_member
on public.product_variants
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      product_variants.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create policy suppliers_select_member
on public.suppliers
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      suppliers.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create policy supplier_products_select_member
on public.supplier_products
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      supplier_products.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create policy purchase_orders_select_member
on public.purchase_orders
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      purchase_orders.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create policy purchase_order_items_select_member
on public.purchase_order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      purchase_order_items.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create policy integrations_select_member
on public.integrations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      integrations.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create policy provider_bindings_select_member
on public.provider_bindings
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      provider_bindings.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- Tenant immutable/history SELECT policies
-- -----------------------------------------------------------------------------

create policy inventory_snapshots_select_member
on public.inventory_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      inventory_snapshots.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create policy orders_select_member
on public.orders
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      orders.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create policy order_items_select_member
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      order_items.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create policy return_refunds_select_member
on public.return_refunds
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      return_refunds.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);

create policy sync_runs_select_member
on public.sync_runs
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id =
      sync_runs.organization_id
      and membership.user_id =
        (select auth.uid())
  )
);
