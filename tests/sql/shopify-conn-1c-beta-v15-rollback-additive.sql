-- V15 (CONN-1c-β): drop β lease RPCs only; preserve α + CONN-1a + M2.6.
\set ON_ERROR_STOP on

begin;

drop function if exists
  public.acquire_integration_credential_refresh_lock(
    uuid, uuid, text, text, integer
  );

drop function if exists
  public.rotate_integration_credential_set(
    uuid, uuid, text, text,
    bytea, bytea, bytea,
    bytea, bytea, bytea,
    bytea, bytea, bytea,
    integer, timestamptz, timestamptz, text,
    text, text, bigint
  );

drop function if exists
  public.release_integration_credential_refresh_lock(
    uuid, uuid, text, text, text
  );

do $$
begin
  if to_regprocedure(
    'public.acquire_integration_credential_refresh_lock(uuid,uuid,text,text,integer)'
  ) is not null then
    raise exception 'acquire RPC still present after β rollback';
  end if;

  if to_regprocedure(
    'public.rotate_integration_credential_set(uuid,uuid,text,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,integer,timestamptz,timestamptz,text,text,text,bigint)'
  ) is not null then
    raise exception 'rotate RPC still present after β rollback';
  end if;

  if to_regprocedure(
    'public.release_integration_credential_refresh_lock(uuid,uuid,text,text,text)'
  ) is not null then
    raise exception 'release RPC still present after β rollback';
  end if;

  -- α RPCs must remain
  if to_regprocedure(
    'public.load_integration_credential_envelope(uuid,uuid,text)'
  ) is null then
    raise exception 'α load RPC missing after β rollback';
  end if;

  if to_regprocedure(
    'public.replace_integration_credential_set(uuid,uuid,text,text,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,bytea,integer,timestamptz,timestamptz,text,bigint)'
  ) is null then
    raise exception 'α replace RPC missing after β rollback';
  end if;

  if to_regprocedure(
    'public.clear_integration_credentials(uuid,uuid,text,bigint)'
  ) is null then
    raise exception 'α clear RPC missing after β rollback';
  end if;

  if to_regclass('public.integration_credentials') is null then
    raise exception 'CONN-1a integration_credentials damaged by β rollback';
  end if;

  if to_regclass('public.integrations') is null then
    raise exception 'M2.6 integrations damaged by β rollback';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integration_credentials'
      and column_name = 'credential_generation'
  ) then
    raise exception 'α fence column missing after β rollback';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integration_credentials'
      and column_name = 'refresh_lock_token'
  ) then
    raise exception 'α lease metadata column missing after β rollback';
  end if;
end;
$$;

\echo '--- V15 CONN-1c-β rollback PASS; α + CONN-1a + M2.6 intact ---'

commit;
