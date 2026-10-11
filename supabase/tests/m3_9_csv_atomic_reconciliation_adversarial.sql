begin;

-- This script expects the normal StoreAgent migration chain to be present.
-- It proves M3.9B RPC privilege and structural invariants without leaving data.

do $$
declare
  browser_can_execute boolean;
begin
  select has_function_privilege(
    'authenticated',
    'public.csv_reconcile_product(uuid,uuid,uuid,text,text,jsonb,text,text,text,text)',
    'execute'
  )
  into browser_can_execute;

  if browser_can_execute then
    raise exception
      'authenticated must not execute csv_reconcile_product';
  end if;
end;
$$;

do $$
declare
  service_can_execute boolean;
begin
  select has_function_privilege(
    'service_role',
    'public.csv_reconcile_product(uuid,uuid,uuid,text,text,jsonb,text,text,text,text)',
    'execute'
  )
  into service_can_execute;

  if not service_can_execute then
    raise exception
      'service_role must execute csv_reconcile_product';
  end if;
end;
$$;

do $$
declare
  browser_can_execute boolean;
begin
  select has_function_privilege(
    'authenticated',
    'public.csv_reconcile_purchase_order_item(uuid,uuid,uuid,text,text,jsonb,uuid,uuid,uuid,integer,integer,numeric,text)',
    'execute'
  )
  into browser_can_execute;

  if browser_can_execute then
    raise exception
      'authenticated must not execute csv_reconcile_purchase_order_item';
  end if;
end;
$$;

do $$
declare
  helper_browser_execute boolean;
begin
  select has_function_privilege(
    'authenticated',
    'public.assert_csv_reconciliation_scope(uuid,uuid,uuid,boolean)',
    'execute'
  )
  into helper_browser_execute;

  if helper_browser_execute then
    raise exception
      'authenticated must not execute CSV reconciliation scope helper';
  end if;
end;
$$;

rollback;
