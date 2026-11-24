-- SHOPIFY-CONN-1d-E
-- Authoritative DB rejection of secret material in the four non-vault JSON
-- columns:
--
--   integrations.configuration
--   provider_bindings.source_metadata
--   sync_runs.error_summary
--   sync_runs.reconciliation_metadata
--
-- Security:
--   One self-contained trigger function; no callable validation helper.
--   EXECUTE revoked from public, anon, authenticated and service_role
--   (trigger firing does not check EXECUTE; direct calls are denied).
--   TRIGGER revoked on the three tables from the same roles; the table
--   owner and superusers can still disable or out-order the guard.
--   INSERT always validates. UPDATE validates only a changed column value,
--   so status-only updates (CONN-1d-C disconnect) and coalesce carry-forward
--   (csv_complete/fail_sync_run) are never blocked by a stored value.
--   Trigger name sorts last among BEFORE row triggers so it sees final NEW.
--   Fixed SQLSTATE SA011; message names table/column only, never the value.
--
-- Policy (mirrored by lib/security/secret-ingestion.ts, which is stricter):
--   octet_length(value::text) <= 8192
--   JSON depth <= 8 (strict jsonpath; root = level 0)
--   keys: ASCII ^[A-Za-z][A-Za-z0-9_-]{0,63}$; folded (lowercase, no _ or -)
--     key must not contain a credential fragment, except token_kind and
--     key_version
--   keys and string values: no Shopify opaque, Bearer, JWT, Basic or
--     stringified token/secret key forms
--   PostgreSQL ARE: \b is backspace, so no word-boundary assertions are used.
--
-- Migration:
--   Requires a transaction (LOCK TABLE fails outside one).
--   Tables are locked before the existing-row scan and trigger creation.
--   Any existing violating row aborts the migration; counts only are
--   reported and no stored value is rewritten.

set local lock_timeout = '5s';

lock table
  public.integrations,
  public.provider_bindings,
  public.sync_runs
in share row exclusive mode;

create function public.conn_1d_e_reject_secret_json()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_column text;
  v_value jsonb;
  v_node jsonb;
  v_key text;
  v_folded text;
  v_text text;
  v_bad boolean;
begin
  foreach v_column in array tg_argv loop
    v_value := pg_catalog.to_jsonb(new) operator(pg_catalog.->) v_column;

    if v_value is null
      or pg_catalog.jsonb_typeof(v_value) = 'null'
    then
      continue;
    end if;

    if tg_op = 'UPDATE'
      and v_value is not distinct from
        (pg_catalog.to_jsonb(old) operator(pg_catalog.->) v_column)
    then
      continue;
    end if;

    v_bad :=
      pg_catalog.octet_length(v_value::text) > 8192
      or pg_catalog.jsonb_path_exists(v_value, 'strict $.**{9 to last}');

    if not v_bad then
      for v_node in
        select q.node
        from pg_catalog.jsonb_path_query(v_value, 'strict $.**') as q(node)
      loop
        exit when v_bad;

        if pg_catalog.jsonb_typeof(v_node) = 'object' then
          for v_key in
            select pg_catalog.jsonb_object_keys(v_node)
          loop
            v_folded := pg_catalog.lower(
              pg_catalog.translate(v_key, '_-', '')
            );

            if v_key !~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'
              or (
                v_folded not in ('tokenkind', 'keyversion')
                and (
                  v_folded in ('session', 'accessnonce', 'refreshnonce')
                  or v_folded ~ '(token|secret|password|passwd|credential|ciphertext|authorization|cookie|bearer|apikey|privatekey|authtag|dekwrap|servicerole)'
                )
              )
              or v_key ~* 'shp(at|ca|pa|ss|rt)_[a-z0-9_]'
            then
              v_bad := true;
              exit;
            end if;
          end loop;

        elsif pg_catalog.jsonb_typeof(v_node) = 'string' then
          v_text := v_node operator(pg_catalog.#>>) '{}';

          v_bad :=
            v_text ~* 'shp(at|ca|pa|ss|rt)_[a-z0-9_]'
            or v_text ~* 'bearer[ \t\n\r\f\v]+[a-z0-9._~+/=-]'
            or v_text ~* 'eyj[a-z0-9_-]+\.[a-z0-9_-]+\.'
            or v_text ~ 'Basic[ \t\n\r\f\v]+[A-Za-z0-9+/]{8,}'
            or v_text ~* '"(access|refresh|id)_?token"[ \t\n\r\f\v]*:'
            or v_text ~* '"client_?secret"[ \t\n\r\f\v]*:';
        end if;
      end loop;
    end if;

    if v_bad then
      raise exception using
        errcode = 'SA011',
        message = pg_catalog.format(
          'secret material rejected at JSON boundary (%s.%s)',
          tg_table_name,
          v_column
        );
    end if;
  end loop;

  return new;
end;
$$;

revoke all
on function public.conn_1d_e_reject_secret_json()
from public, anon, authenticated, service_role;

-- A role with TRIGGER could attach a later-sorting BEFORE trigger that
-- rewrites NEW after validation. DML grants and RLS are unchanged.
revoke trigger
on table
  public.integrations,
  public.provider_bindings,
  public.sync_runs
from public, anon, authenticated, service_role;

-- Existing-row scan through the same function (no duplicated policy).
do $$
declare
  v_source text;
  v_payload jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_total bigint := 0;
begin
  create temporary table conn_1d_e_scan (
    payload jsonb
  ) on commit drop;

  create trigger zz_conn_1d_e_secret_json_guard
  before insert on pg_temp.conn_1d_e_scan
  for each row
  execute function public.conn_1d_e_reject_secret_json('payload');

  for v_source, v_payload in
    select 'integrations.configuration', i.configuration
    from public.integrations i
    where i.configuration is not null
    union all
    select 'provider_bindings.source_metadata', pb.source_metadata
    from public.provider_bindings pb
    where pb.source_metadata is not null
    union all
    select 'sync_runs.error_summary', sr.error_summary
    from public.sync_runs sr
    where sr.error_summary is not null
    union all
    select 'sync_runs.reconciliation_metadata', sr.reconciliation_metadata
    from public.sync_runs sr
    where sr.reconciliation_metadata is not null
  loop
    begin
      insert into pg_temp.conn_1d_e_scan (payload) values (v_payload);
    exception
      when sqlstate 'SA011' then
        v_total := v_total + 1;
        v_counts := pg_catalog.jsonb_set(
          v_counts,
          array[v_source],
          pg_catalog.to_jsonb(
            coalesce((v_counts operator(pg_catalog.->>) v_source)::bigint, 0) + 1
          )
        );
    end;
  end loop;

  if v_total > 0 then
    raise exception using
      errcode = 'SA011',
      message = pg_catalog.format(
        'CONN-1d-E existing-row scan rejected %s value(s): %s',
        v_total,
        v_counts::text
      );
  end if;
end;
$$;

create trigger zz_conn_1d_e_secret_json_guard
before insert or update on public.integrations
for each row
execute function public.conn_1d_e_reject_secret_json('configuration');

create trigger zz_conn_1d_e_secret_json_guard
before insert or update on public.provider_bindings
for each row
execute function public.conn_1d_e_reject_secret_json('source_metadata');

create trigger zz_conn_1d_e_secret_json_guard
before insert or update on public.sync_runs
for each row
execute function public.conn_1d_e_reject_secret_json(
  'error_summary',
  'reconciliation_metadata'
);
