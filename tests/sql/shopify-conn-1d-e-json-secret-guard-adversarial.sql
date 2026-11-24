-- SHOPIFY-CONN-1d-E adversarial matrix (offline / isolated PG only).
-- Requires: tests/sql/shopify-conn-1d-e-full-chain-bootstrap.sql, then every
-- supabase/migrations/*.sql in filename order (including 20261124120000).
-- Fresh dedicated database; leaves fixture rows behind for inspection.

\set ON_ERROR_STOP on

\echo '=== CONN-1d-E JSON secret guard adversarial ==='

-- -----------------------------------------------------------------------------
-- Test-only assertion helpers (session temp schema; not product objects).
-- Failure messages carry the case label only, never the payload.
-- -----------------------------------------------------------------------------

create function pg_temp.expect_reject(
  p_sql text,
  p_label text,
  p_boundary text
)
returns void
language plpgsql
as $$
declare
  v_message text;
  v_detail text;
  v_hint text;
begin
  begin
    execute p_sql;
  exception
    when sqlstate 'SA011' then
      get stacked diagnostics
        v_message = message_text,
        v_detail = pg_exception_detail,
        v_hint = pg_exception_hint;
      if v_message is distinct from format(
        'secret material rejected at JSON boundary (%s)',
        p_boundary
      ) then
        raise exception 'FAIL %: unexpected SA011 message', p_label;
      end if;
      if coalesce(v_detail, '') <> '' or coalesce(v_hint, '') <> '' then
        raise exception 'FAIL %: SA011 carried DETAIL/HINT', p_label;
      end if;
      return;
  end;
  raise exception 'FAIL %: secret payload was accepted', p_label;
end;
$$;

create function pg_temp.expect_accept(p_sql text, p_label text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
exception
  when others then
    raise exception 'FAIL %: rejected (sqlstate %)', p_label, sqlstate;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures (table owner)
-- -----------------------------------------------------------------------------

insert into auth.users (id)
values ('e2000000-0000-4000-8000-0000000000a1');

insert into public.organizations (id, name, default_currency, timezone)
values ('e2000000-0000-4000-8000-000000000001', 'CONN-1d-E Org', 'USD', 'UTC');

insert into public.stores (id, organization_id, name, status, currency, timezone)
values (
  'e2000000-0000-4000-8000-000000000002',
  'e2000000-0000-4000-8000-000000000001',
  'CONN-1d-E Store', 'active', 'USD', 'UTC'
);

insert into public.locations (id, organization_id, store_id, name, status)
values (
  'e2000000-0000-4000-8000-000000000004',
  'e2000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000002',
  'MAIN', 'active'
);

set role service_role;

-- Real ensure-integration payload through service_role table DML.
select pg_temp.expect_accept($sql$
  insert into public.integrations (
    id, organization_id, store_id, provider, status, display_name, configuration
  ) values (
    'e2000000-0000-4000-8000-000000000003',
    'e2000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000002',
    'csv', 'active', 'CSV inventory import',
    '{"purpose":"merchant_inventory_import_v1"}'
  )
$sql$, 'E0 ensure-integration configuration');

-- V11 round-trip: persisted configuration is exactly the non-secret payload.
do $$
begin
  if (
    select configuration
    from public.integrations
    where id = 'e2000000-0000-4000-8000-000000000003'
  ) is distinct from '{"purpose":"merchant_inventory_import_v1"}'::jsonb then
    raise exception 'FAIL E0: configuration round-trip mismatch';
  end if;
end;
$$;

\echo 'E0 ensure-integration configuration round-trip PASS'

-- -----------------------------------------------------------------------------
-- A. Forbidden key/value corpus on every protected column (service_role DML)
-- -----------------------------------------------------------------------------

create temporary table conn1de_secret_corpus (label text, payload jsonb);

insert into conn1de_secret_corpus (label, payload) values
  ('bare token key', '{"token":"abc"}'),
  ('accesstoken folded', '{"accesstoken":"x"}'),
  ('ACCESSToken acronym', '{"ACCESSToken":"x"}'),
  ('access_token_v2 suffix', '{"access_token_v2":"x"}'),
  ('accessTokenValue infix', '{"accessTokenValue":"x"}'),
  ('refreshToken camel', '{"nested":{"refreshToken":"x"}}'),
  ('x-shopify-access-token kebab', '{"headers":{"x-shopify-access-token":"x"}}'),
  ('client_secret', '{"client_secret":"x"}'),
  ('apiKey', '{"apiKey":"x"}'),
  ('password', '{"password":"x"}'),
  ('session exact', '{"session":"x"}'),
  ('access_ciphertext', '{"access_ciphertext":"x"}'),
  ('dek_wrap_nonce', '{"dek_wrap_nonce":"x"}'),
  ('access_nonce exact', '{"access_nonce":"x"}'),
  ('authorization', '{"Authorization":"x"}'),
  ('dotted key shape', '{"access.token":"x"}'),
  ('spaced key shape', '{"access token":"x"}'),
  ('cyrillic homoglyph key shape', jsonb_build_object(chr(1072) || 'ccess', 'x')),
  ('zero-width key shape', jsonb_build_object('access' || chr(8203), 'x')),
  ('fullwidth key shape', jsonb_build_object(chr(65345) || 'ccess', 'x')),
  ('leading underscore key shape', '{"__proto__":"x"}'),
  ('65-char key shape', jsonb_build_object(repeat('a', 65), 'x')),
  ('shpat key name', '{"shpat_0123456789":"x"}'),
  ('shpat value', '{"note":"shpat_0123456789abcdef"}'),
  ('underscore-prefixed shpat value', '{"note":"x_shpat_0123456789abcdef"}'),
  ('shprt in array', '{"errors":["shprt_abcdef0123"]}'),
  ('Bearer value', '{"detail":"Authorization Bearer abc.def-ghi"}'),
  ('JWT value', '{"note":"eyJhbGciOi.eyJzdWIi.sig"}'),
  ('Basic value', '{"note":"Basic dXNlcjpwYXNz"}'),
  ('stringified access_token', '{"raw":"{\"access_token\":\"x\"}"}'),
  ('stringified client_secret', '{"raw":"{ \"clientSecret\" : \"x\" }"}'),
  ('depth 9', '{"a":{"a":{"a":{"a":{"a":{"a":{"a":{"a":{"a":1}}}}}}}}}'),
  ('array depth 9', '{"a":[[[[[[[[1]]]]]]]]}');

do $$
declare
  v_case record;
begin
  for v_case in select label, payload from conn1de_secret_corpus loop
    perform pg_temp.expect_reject(
      format(
        'insert into public.integrations (organization_id, store_id, provider, status, configuration)
         values (%L, %L, %L, %L, %L::jsonb)',
        'e2000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000002',
        'csv', 'pending', v_case.payload::text
      ),
      'A1 integrations insert: ' || v_case.label,
      'integrations.configuration'
    );

    perform pg_temp.expect_reject(
      format(
        'update public.integrations set configuration = %L::jsonb where id = %L',
        v_case.payload::text,
        'e2000000-0000-4000-8000-000000000003'
      ),
      'A2 integrations update: ' || v_case.label,
      'integrations.configuration'
    );
  end loop;
end;
$$;

\echo 'A1/A2 integrations.configuration insert+update deny PASS'

-- provider_bindings direct DML (service_role ambient table grant).
select pg_temp.expect_accept($sql$
  insert into public.provider_bindings (
    id, organization_id, integration_id, provider, resource_type,
    canonical_entity_id, external_id, source_metadata
  ) values (
    'e2000000-0000-4000-8000-000000000010',
    'e2000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000003',
    'csv', 'location',
    'e2000000-0000-4000-8000-000000000004',
    'DIRECT', '{"configuredBy":"direct"}'
  )
$sql$, 'A3 provider_bindings clean insert');

-- sync_runs direct DML.
select pg_temp.expect_accept($sql$
  insert into public.sync_runs (
    id, organization_id, store_id, integration_id, idempotency_key,
    status, started_at, error_summary, reconciliation_metadata
  ) values (
    'e2000000-0000-4000-8000-000000000020',
    'e2000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000003',
    'direct-1', 'running', now(), null, '{"orchestration":"csv-import"}'
  )
$sql$, 'A4 sync_runs clean insert');

do $$
declare
  v_case record;
  v_n int := 0;
begin
  for v_case in select label, payload from conn1de_secret_corpus loop
    v_n := v_n + 1;

    perform pg_temp.expect_reject(
      format(
        'insert into public.provider_bindings (organization_id, integration_id, provider, resource_type, canonical_entity_id, external_id, source_metadata)
         values (%L, %L, %L, %L, %L, %L, %L::jsonb)',
        'e2000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000003',
        'csv', 'location',
        'e2000000-0000-4000-8000-000000000004',
        'DENY-' || v_n, v_case.payload::text
      ),
      'A3 provider_bindings insert: ' || v_case.label,
      'provider_bindings.source_metadata'
    );

    perform pg_temp.expect_reject(
      format(
        'update public.provider_bindings set source_metadata = %L::jsonb where id = %L',
        v_case.payload::text,
        'e2000000-0000-4000-8000-000000000010'
      ),
      'A3 provider_bindings update: ' || v_case.label,
      'provider_bindings.source_metadata'
    );

    perform pg_temp.expect_reject(
      format(
        'insert into public.sync_runs (organization_id, store_id, integration_id, idempotency_key, status, started_at, error_summary)
         values (%L, %L, %L, %L, %L, now(), %L::jsonb)',
        'e2000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000002',
        'e2000000-0000-4000-8000-000000000003',
        'deny-es-' || v_n, 'running', v_case.payload::text
      ),
      'A4 sync_runs.error_summary insert: ' || v_case.label,
      'sync_runs.error_summary'
    );

    perform pg_temp.expect_reject(
      format(
        'insert into public.sync_runs (organization_id, store_id, integration_id, idempotency_key, status, started_at, reconciliation_metadata)
         values (%L, %L, %L, %L, %L, now(), %L::jsonb)',
        'e2000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000002',
        'e2000000-0000-4000-8000-000000000003',
        'deny-rm-' || v_n, 'running', v_case.payload::text
      ),
      'A4 sync_runs.reconciliation_metadata insert: ' || v_case.label,
      'sync_runs.reconciliation_metadata'
    );

    perform pg_temp.expect_reject(
      format(
        'update public.sync_runs set error_summary = %L::jsonb where id = %L',
        v_case.payload::text,
        'e2000000-0000-4000-8000-000000000020'
      ),
      'A4 sync_runs.error_summary update: ' || v_case.label,
      'sync_runs.error_summary'
    );

    perform pg_temp.expect_reject(
      format(
        'update public.sync_runs set reconciliation_metadata = %L::jsonb where id = %L',
        v_case.payload::text,
        'e2000000-0000-4000-8000-000000000020'
      ),
      'A4 sync_runs.reconciliation_metadata update: ' || v_case.label,
      'sync_runs.reconciliation_metadata'
    );
  end loop;
end;
$$;

\echo 'A3/A4 provider_bindings + sync_runs insert+update deny PASS'

reset role;

-- Table owner / superuser DML is subject to the same trigger.
select pg_temp.expect_reject($sql$
  update public.integrations
  set configuration = '{"refresh_token":"x"}'
  where id = 'e2000000-0000-4000-8000-000000000003'
$sql$, 'A5 owner update', 'integrations.configuration');

select pg_temp.expect_reject($sql$
  update public.sync_runs
  set error_summary = '{"note":"Bearer abcdef"}'
  where id = 'e2000000-0000-4000-8000-000000000020'
$sql$, 'A5 owner sync_runs update', 'sync_runs.error_summary');

\echo 'A5 table-owner DML deny PASS'

set role service_role;

-- -----------------------------------------------------------------------------
-- B. Accepted policy boundaries
-- -----------------------------------------------------------------------------

do $$
declare
  v_payload text;
begin
  foreach v_payload in array array[
    '{"token_kind":"offline_expiring","key_version":1}',
    '{"tokenKind":"offline_expiring","keyVersion":2}',
    '{"shop_domain":"org-a.myshopify.com","scope":"read_products"}',
    '{"message":"basic import"}',
    '{"locationName":"漢字 ✓ é"}',
    '{"a":{"a":{"a":{"a":{"a":{"a":{"a":{"a":1}}}}}}}}',
    '{"a":[[[[[[[1]]]]]]]}',
    '{"a":{"a":{"a":{"a":{"a":{"a":{"a":{"a":{}}}}}}}}}',
    jsonb_build_object(repeat('a', 64), 'x')::text,
    jsonb_build_object('a', repeat('x', 8183))::text
  ] loop
    perform pg_temp.expect_accept(
      format(
        'update public.integrations set configuration = %L::jsonb where id = %L',
        v_payload,
        'e2000000-0000-4000-8000-000000000003'
      ),
      'B accept boundary'
    );
  end loop;

  if octet_length(jsonb_build_object('a', repeat('x', 8183))::text) <> 8192 then
    raise exception 'FAIL B: size fixture is not exactly 8192 bytes';
  end if;
end;
$$;

select pg_temp.expect_reject(
  format(
    'update public.integrations set configuration = %L::jsonb where id = %L',
    jsonb_build_object('a', repeat('x', 8184))::text,
    'e2000000-0000-4000-8000-000000000003'
  ),
  'B 8193-byte jsonb text',
  'integrations.configuration'
);

select pg_temp.expect_reject(
  format(
    'update public.integrations set configuration = %L::jsonb where id = %L',
    '{"a":{"a":{"a":{"a":{"a":{"a":{"a":{"a":{"a":{}}}}}}}}}}',
    'e2000000-0000-4000-8000-000000000003'
  ),
  'B empty container at depth 9',
  'integrations.configuration'
);

select pg_temp.expect_accept($sql$
  update public.integrations
  set configuration = '{"purpose":"merchant_inventory_import_v1"}'
  where id = 'e2000000-0000-4000-8000-000000000003'
$sql$, 'B restore configuration');

\echo 'B accepted boundaries (exemptions, Unicode, depth 8, 64-char key, 8192 bytes) PASS'

-- -----------------------------------------------------------------------------
-- C. All 11 JSON-writing CSV RPCs: real app payloads pass, secret payloads deny
-- -----------------------------------------------------------------------------

do $$
declare
  c_org constant uuid := 'e2000000-0000-4000-8000-000000000001';
  c_store constant uuid := 'e2000000-0000-4000-8000-000000000002';
  c_integ constant uuid := 'e2000000-0000-4000-8000-000000000003';
  c_loc constant uuid := 'e2000000-0000-4000-8000-000000000004';
  v_product uuid;
  v_variant uuid;
  v_order uuid;
  v_supplier uuid;
  v_po uuid;
  v_before bigint;
begin
  -- 1. csv_bind_location (ensure-integration constant)
  perform public.csv_bind_location(
    c_org, c_store, c_integ, 'MAIN', c_loc,
    '{"configuredBy":"merchant_inventory_import_v1","locationName":"MAIN"}'
  );

  -- 2..8 csv_reconcile_* (supabase-persistence {adapterVersion} constant)
  select canonical_entity_id into v_product
  from public.csv_reconcile_product(
    c_org, c_store, c_integ, 'P1', null,
    '{"adapterVersion":"merchant-inventory-import-v1-product"}',
    'Product', null, null, 'active'
  );

  select canonical_entity_id into v_variant
  from public.csv_reconcile_product_variant(
    c_org, c_store, c_integ, 'V1', 'P1',
    '{"adapterVersion":"merchant-inventory-import-v1-variant"}',
    v_product, 'SKU-1', null, 'Variant', 'active', 1.00, 2.00, 'USD'
  );

  select canonical_entity_id into v_order
  from public.csv_reconcile_order(
    c_org, c_store, c_integ, 'O1', null,
    '{"adapterVersion":"merchant-sales-import-v1-order"}',
    'REF-1', 'completed', now(), 'USD', 10, 0, 10
  );

  perform public.csv_reconcile_order_item(
    c_org, c_store, c_integ, 'OI1', 'O1',
    '{"adapterVersion":"merchant-sales-import-v1-order-item"}',
    v_order, v_variant, c_loc, 1, 10, 0, null, 'USD'
  );

  select canonical_entity_id into v_supplier
  from public.csv_reconcile_supplier(
    c_org, c_integ, 'S1', null,
    '{"adapterVersion":"csv-supplier-v1"}',
    'Supplier', 7, 'USD', null, null
  );

  select canonical_entity_id into v_po
  from public.csv_reconcile_purchase_order(
    c_org, c_store, c_integ, 'PO1', null,
    '{"adapterVersion":"csv-purchase-order-v1"}',
    v_supplier, 'PO-REF-1', 'submitted', now(), null, null, 'USD'
  );

  perform public.csv_reconcile_purchase_order_item(
    c_org, c_store, c_integ, 'POI1', 'PO1',
    '{"adapterVersion":"csv-purchase-order-item-v1"}',
    v_po, v_variant, c_loc, 5, null, 1.00, 'USD'
  );

  -- Secret payload on the update path of every binding writer.
  perform pg_temp.expect_reject(
    format('select public.csv_bind_location(%L, %L, %L, %L, %L, %L::jsonb)',
      c_org, c_store, c_integ, 'MAIN', c_loc,
      '{"configuredBy":"merchant_inventory_import_v1","access_token":"x"}'),
    'C1 csv_bind_location update', 'provider_bindings.source_metadata');

  perform pg_temp.expect_reject(
    format('select public.csv_reconcile_product(%L, %L, %L, %L, null, %L::jsonb, %L, null, null, %L)',
      c_org, c_store, c_integ, 'P1',
      '{"adapterVersion":"merchant-inventory-import-v1-product","note":"shpat_0123456789"}',
      'Product', 'active'),
    'C2 csv_reconcile_product update', 'provider_bindings.source_metadata');

  perform pg_temp.expect_reject(
    format('select public.csv_reconcile_product_variant(%L, %L, %L, %L, %L, %L::jsonb, %L, %L, null, %L, %L, 1.00, 2.00, %L)',
      c_org, c_store, c_integ, 'V1', 'P1',
      '{"adapterVersion":"merchant-inventory-import-v1-variant","refreshToken":"x"}',
      v_product, 'SKU-1', 'Variant', 'active', 'USD'),
    'C3 csv_reconcile_product_variant update', 'provider_bindings.source_metadata');

  perform pg_temp.expect_reject(
    format('select public.csv_reconcile_order(%L, %L, %L, %L, null, %L::jsonb, %L, %L, now(), %L, 10, 0, 10)',
      c_org, c_store, c_integ, 'O1',
      '{"adapterVersion":"merchant-sales-import-v1-order","client_secret":"x"}',
      'REF-1', 'completed', 'USD'),
    'C4 csv_reconcile_order update', 'provider_bindings.source_metadata');

  perform pg_temp.expect_reject(
    format('select public.csv_reconcile_order_item(%L, %L, %L, %L, %L, %L::jsonb, %L, %L, %L, 1, 10, 0, null, %L)',
      c_org, c_store, c_integ, 'OI1', 'O1',
      '{"adapterVersion":"merchant-sales-import-v1-order-item","raw":"Bearer abcdef"}',
      v_order, v_variant, c_loc, 'USD'),
    'C5 csv_reconcile_order_item update', 'provider_bindings.source_metadata');

  perform pg_temp.expect_reject(
    format('select public.csv_reconcile_supplier(%L, %L, %L, null, %L::jsonb, %L, 7, %L, null, null)',
      c_org, c_integ, 'S1',
      '{"adapterVersion":"csv-supplier-v1","apiKey":"x"}',
      'Supplier', 'USD'),
    'C6 csv_reconcile_supplier update', 'provider_bindings.source_metadata');

  perform pg_temp.expect_reject(
    format('select public.csv_reconcile_purchase_order(%L, %L, %L, %L, null, %L::jsonb, %L, %L, %L, now(), null, null, %L)',
      c_org, c_store, c_integ, 'PO1',
      '{"adapterVersion":"csv-purchase-order-v1","note":"eyJhbGciOi.eyJzdWIi.sig"}',
      v_supplier, 'PO-REF-1', 'submitted', 'USD'),
    'C7 csv_reconcile_purchase_order update', 'provider_bindings.source_metadata');

  perform pg_temp.expect_reject(
    format('select public.csv_reconcile_purchase_order_item(%L, %L, %L, %L, %L, %L::jsonb, %L, %L, %L, 5, null, 1.00, %L)',
      c_org, c_store, c_integ, 'POI1', 'PO1',
      '{"adapterVersion":"csv-purchase-order-item-v1","password":"x"}',
      v_po, v_variant, c_loc, 'USD'),
    'C8 csv_reconcile_purchase_order_item update', 'provider_bindings.source_metadata');

  -- Insert path: rejected binding also rolls back the canonical row it created.
  select count(*) into v_before from public.products where organization_id = c_org;
  perform pg_temp.expect_reject(
    format('select public.csv_reconcile_product(%L, %L, %L, %L, null, %L::jsonb, %L, null, null, %L)',
      c_org, c_store, c_integ, 'P-NEW',
      '{"adapterVersion":"merchant-inventory-import-v1-product","token":"x"}',
      'New', 'active'),
    'C2 csv_reconcile_product insert', 'provider_bindings.source_metadata');
  if (select count(*) from public.products where organization_id = c_org) <> v_before then
    raise exception 'FAIL C2: canonical product persisted after rejected binding';
  end if;

  if (
    select count(*)
    from public.provider_bindings
    where organization_id = c_org
      and (source_metadata::text ~* '(token|secret|shpat|bearer|apikey|password|eyj)')
  ) <> 0 then
    raise exception 'FAIL C: secret-bearing binding metadata persisted';
  end if;
end;
$$;

\echo 'C1-C8 csv_bind_location + 7 csv_reconcile_* PASS'

-- Sync-run writers (C9-C11) and liveness.
do $$
declare
  c_org constant uuid := 'e2000000-0000-4000-8000-000000000001';
  c_store constant uuid := 'e2000000-0000-4000-8000-000000000002';
  c_integ constant uuid := 'e2000000-0000-4000-8000-000000000003';
  v_run uuid;
  v_disposition text;
  v_status text;
begin
  perform pg_temp.expect_reject(
    format('select public.csv_begin_sync_run(%L, %L, %L, %L, %L::jsonb)',
      c_org, c_store, c_integ, 'live-deny',
      '{"orchestration":"csv-import","refresh_token":"x"}'),
    'C9 csv_begin_sync_run', 'sync_runs.reconciliation_metadata');

  if exists (
    select 1 from public.sync_runs
    where organization_id = c_org and idempotency_key = 'live-deny'
  ) then
    raise exception 'FAIL C9: rejected begin created a run';
  end if;

  -- Real executeCsvImport constants: begin -> complete.
  select sync_run_id into v_run
  from public.csv_begin_sync_run(c_org, c_store, c_integ, 'live-ok', '{"orchestration":"csv-import"}');
  select status into v_status
  from public.csv_complete_sync_run(c_org, c_integ, v_run, 0, 0, 0, 0, 0, 0, '{"orchestration":"csv-import"}');
  if v_status <> 'completed' then
    raise exception 'FAIL C10: constant completion did not complete';
  end if;

  -- Liveness: rejected complete + rejected fail leave the run running.
  select sync_run_id into v_run
  from public.csv_begin_sync_run(c_org, c_store, c_integ, 'live-stuck', '{"orchestration":"csv-import"}');

  perform pg_temp.expect_reject(
    format('select public.csv_complete_sync_run(%L, %L, %L, 0, 0, 0, 0, 0, 0, %L::jsonb)',
      c_org, c_integ, v_run, '{"orchestration":"csv-import","token":"x"}'),
    'C10 csv_complete_sync_run', 'sync_runs.reconciliation_metadata');

  perform pg_temp.expect_reject(
    format('select public.csv_fail_sync_run(%L, %L, %L, %L::jsonb, %L::jsonb)',
      c_org, c_integ, v_run,
      '{"code":"CSV_IMPORT_ORCHESTRATION_FAILED"}',
      '{"orchestration":"csv-import","token":"x"}'),
    'C11 csv_fail_sync_run reconciliation', 'sync_runs.reconciliation_metadata');

  perform pg_temp.expect_reject(
    format('select public.csv_fail_sync_run(%L, %L, %L, %L::jsonb, %L::jsonb)',
      c_org, c_integ, v_run,
      '{"code":"x","raw":"token=shpat_0123456789"}',
      '{"orchestration":"csv-import"}'),
    'C11 csv_fail_sync_run error_summary', 'sync_runs.error_summary');

  select status into v_status from public.sync_runs where id = v_run;
  if v_status <> 'running' then
    raise exception 'FAIL G1: expected run to remain running after rejected terminal writes';
  end if;

  select disposition into v_disposition
  from public.csv_begin_sync_run(c_org, c_store, c_integ, 'live-stuck', '{"orchestration":"csv-import"}');
  if v_disposition <> 'in_progress' then
    raise exception 'FAIL G1: replay of stuck key should be in_progress';
  end if;

  -- Real executeCsvImport fail constants terminate the run.
  select status into v_status
  from public.csv_fail_sync_run(
    c_org, c_integ, v_run,
    '{"code":"CSV_IMPORT_ORCHESTRATION_FAILED"}',
    '{"orchestration":"csv-import"}'
  );
  if v_status <> 'failed' then
    raise exception 'FAIL G2: constant fail payload did not terminate the run';
  end if;
end;
$$;

\echo 'C9-C11 sync-run writers + G1/G2 completion/failure liveness PASS'

reset role;

-- -----------------------------------------------------------------------------
-- D. Changed-value semantics on a legacy row (trigger disabled only to plant)
-- -----------------------------------------------------------------------------

begin;

alter table public.integrations disable trigger zz_conn_1d_e_secret_json_guard;
alter table public.sync_runs disable trigger zz_conn_1d_e_secret_json_guard;

insert into public.integrations (id, organization_id, provider, status, configuration)
values (
  'e2000000-0000-4000-8000-000000000030',
  'e2000000-0000-4000-8000-000000000001',
  'shopify', 'active', '{"access_token":"legacy"}'
);

update public.sync_runs
set reconciliation_metadata = '{"orchestration":"csv-import","token":"legacy"}'
where id = 'e2000000-0000-4000-8000-000000000020';

alter table public.integrations enable trigger zz_conn_1d_e_secret_json_guard;
alter table public.sync_runs enable trigger zz_conn_1d_e_secret_json_guard;

set local role service_role;

select pg_temp.expect_accept($sql$
  update public.integrations set status = 'disconnected'
  where id = 'e2000000-0000-4000-8000-000000000030'
$sql$, 'D1 status-only update on legacy row');

select pg_temp.expect_accept($sql$
  select public.csv_complete_sync_run(
    'e2000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000003',
    'e2000000-0000-4000-8000-000000000020',
    0, 0, 0, 0, 0, 0, null
  )
$sql$, 'D2 coalesce carry-forward of legacy metadata');

select pg_temp.expect_reject($sql$
  update public.integrations set configuration = '{"refresh_token":"new"}'
  where id = 'e2000000-0000-4000-8000-000000000030'
$sql$, 'D3 changing legacy row to another secret', 'integrations.configuration');

rollback;

\echo 'D1-D3 changed-value semantics on legacy rows PASS'

-- -----------------------------------------------------------------------------
-- E. Grants: no callable helper, no RPC exposure
-- -----------------------------------------------------------------------------

do $$
declare
  v_role text;
  v_fn regprocedure := 'public.conn_1d_e_reject_secret_json()'::regprocedure;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, v_fn, 'EXECUTE') then
      raise exception 'FAIL E1: % has EXECUTE on guard', v_role;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = v_fn
      and a.grantee <> p.proowner
  ) then
    raise exception 'FAIL E1: guard ACL grants a non-owner';
  end if;

  if (select prosecdef from pg_proc where oid = v_fn) then
    raise exception 'FAIL E2: guard must not be SECURITY DEFINER';
  end if;

  if (select proconfig from pg_proc where oid = v_fn) is distinct from array['search_path=""'] then
    raise exception 'FAIL E2: guard search_path is not empty';
  end if;

  if (select pg_get_function_result(oid) from pg_proc where oid = v_fn) <> 'trigger' then
    raise exception 'FAIL E3: guard must return trigger (not RPC-callable)';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'conn\_1d\_e%'
      and p.oid <> v_fn
  ) then
    raise exception 'FAIL E3: additional 1d-E function exists';
  end if;
end;
$$;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    execute format('set local role %I', v_role);
    begin
      perform public.conn_1d_e_reject_secret_json();
      raise exception 'FAIL E4: % invoked the guard directly', v_role;
    exception
      when insufficient_privilege then
        null;
    end;
    reset role;
  end loop;
end;
$$;

-- E5. TRIGGER revoked on all three tables; table DML grants and RLS unchanged.
do $$
declare
  v_table text;
  v_role text;
  v_privilege text;
begin
  foreach v_table in array array['integrations', 'provider_bindings', 'sync_runs'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(v_role, format('public.%I', v_table), 'TRIGGER') then
        raise exception 'FAIL E5: % holds TRIGGER on %', v_role, v_table;
      end if;
    end loop;

    if exists (
      select 1
      from pg_class c, aclexplode(c.relacl) a
      where c.oid = format('public.%I', v_table)::regclass
        and a.grantee = 0
    ) then
      raise exception 'FAIL E5: PUBLIC holds a privilege on %', v_table;
    end if;

    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES'] loop
      if not has_table_privilege('service_role', format('public.%I', v_table), v_privilege) then
        raise exception 'FAIL E5: service_role lost % on %', v_privilege, v_table;
      end if;
    end loop;

    if not has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT')
      or has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
      or not (select relrowsecurity from pg_class where oid = format('public.%I', v_table)::regclass)
    then
      raise exception 'FAIL E5: M2.7 browser privileges or RLS changed on %', v_table;
    end if;
  end loop;
end;
$$;

-- E6. service_role cannot attach a later-sorting NEW-rewriting trigger.
begin;

set local role service_role;

create function pg_temp.conn1de_late_rewrite()
returns trigger
language plpgsql
as $fn$
begin
  return new;
end;
$fn$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['integrations', 'provider_bindings', 'sync_runs'] loop
    begin
      execute format(
        'create trigger zzz_conn1de_late_rewrite before insert or update on public.%I for each row execute function pg_temp.conn1de_late_rewrite()',
        v_table
      );
      raise exception 'FAIL E6: service_role created a trigger on %', v_table;
    exception
      when insufficient_privilege then
        null;
    end;
  end loop;
end;
$$;

rollback;

\echo 'E1-E6 guard grants / TRIGGER revoked / no RPC exposure PASS'

-- -----------------------------------------------------------------------------
-- F. Trigger catalog: guard last, enabled, no later NEW rewrite
-- -----------------------------------------------------------------------------

do $$
declare
  v_table text;
  v_last text;
begin
  foreach v_table in array array['integrations', 'provider_bindings', 'sync_runs'] loop
    select t.tgname into v_last
    from pg_trigger t
    where t.tgrelid = format('public.%I', v_table)::regclass
      and not t.tgisinternal
      and (t.tgtype & 1) = 1
      and (t.tgtype & 2) = 2
    order by t.tgname desc
    limit 1;

    if v_last is distinct from 'zz_conn_1d_e_secret_json_guard' then
      raise exception 'FAIL F1: guard is not the last BEFORE row trigger on %', v_table;
    end if;

    if (
      select t.tgenabled
      from pg_trigger t
      where t.tgrelid = format('public.%I', v_table)::regclass
        and t.tgname = 'zz_conn_1d_e_secret_json_guard'
    ) <> 'O' then
      raise exception 'FAIL F1: guard disabled on %', v_table;
    end if;
  end loop;

  if exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid in (
        'public.integrations'::regclass,
        'public.provider_bindings'::regclass,
        'public.sync_runs'::regclass
      )
      and not t.tgisinternal
      and t.tgname <> 'zz_conn_1d_e_secret_json_guard'
      and p.prosrc ~* 'new\s*\.\s*(configuration|source_metadata|error_summary|reconciliation_metadata)\s*:?='
  ) then
    raise exception 'FAIL F2: another trigger function assigns a protected JSON column';
  end if;

  if (
    select prosrc
    from pg_proc
    where oid = 'public.conn_1d_e_reject_secret_json()'::regprocedure
  ) ~ '\\b' then
    raise exception 'FAIL F3: guard source contains \b (backspace in ARE)';
  end if;
end;
$$;

\echo 'F1-F3 trigger catalog order / enabled / no later rewrite PASS'

\echo 'CONN-1d-E adversarial PASS'
