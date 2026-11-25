-- CONN-HR-1 disposable bootstrap — Supabase-like role / ACL surface.
--
-- DISPOSABLE ONLY. Run as the cluster superuser (supabase_admin) on an EMPTY
-- database owned by postgres, inside the CONN-HR-1 disposable cluster
-- (cluster_name = storeagent-conn-hr-1-disposable). Refuses anything else.
--
-- Approximates hosted Supabase where the product migrations run:
--   postgres            LOGIN, NOT superuser, CREATEDB CREATEROLE REPLICATION BYPASSRLS
--   supabase_admin      cluster superuser (bootstrap only)
--   anon / authenticated / service_role (service_role BYPASSRLS), authenticator
--   dashboard_user, supabase_read_only_user (pg_read_all_data + BYPASSRLS),
--   supabase_auth_admin, supabase_storage_admin, supabase_replication_admin,
--   supabase_realtime_admin, pgbouncer
--   default privileges FOR ROLE postgres and FOR ROLE supabase_admin granting
--   ALL on new public tables / functions / sequences to anon, authenticated,
--   service_role (the ambient-grant hazard in HOSTED_38to52_MIGRATION_RUNBOOK.md)
--   extensions schema + pgcrypto; auth.users + auth.uid() claim stub
--   empty publication supabase_realtime (not FOR ALL TABLES)
--
-- Not a byte-exact hosted replica: role membership details, event triggers,
-- pg_graphql, pgaudit and platform-managed grants are not reproduced.

\set ON_ERROR_STOP on

do $guard$
begin
  if current_setting('cluster_name') is distinct from 'storeagent-conn-hr-1-disposable' then
    raise exception 'CONN-HR-1 bootstrap refused: not the disposable cluster';
  end if;
  if not (select rolsuper from pg_catalog.pg_roles where rolname = current_user) then
    raise exception 'CONN-HR-1 bootstrap refused: must run as disposable superuser';
  end if;
  if (select pg_catalog.pg_get_userbyid(datdba) from pg_catalog.pg_database
      where datname = current_database()) is distinct from 'postgres' then
    raise exception 'CONN-HR-1 bootstrap refused: database must be owned by postgres';
  end if;
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'supabase_migrations') then
    raise exception 'CONN-HR-1 bootstrap refused: database is not empty';
  end if;
end;
$guard$;

-- Cluster-global roles (idempotent across disposable databases).
do $roles$
declare
  v_role text;
begin
  foreach v_role in array array[
    'anon', 'authenticated', 'service_role', 'authenticator', 'dashboard_user',
    'supabase_read_only_user', 'supabase_auth_admin', 'supabase_storage_admin',
    'supabase_replication_admin', 'supabase_realtime_admin', 'pgbouncer'
  ] loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
      execute pg_catalog.format('create role %I nologin', v_role);
    end if;
  end loop;
end;
$roles$;

alter role postgres nosuperuser createdb createrole replication bypassrls login;
alter role anon nologin noinherit;
alter role authenticated nologin noinherit;
alter role service_role nologin noinherit bypassrls;
alter role authenticator login noinherit;
alter role dashboard_user nologin createdb createrole replication;
alter role supabase_read_only_user login bypassrls;
alter role supabase_auth_admin login noinherit createrole;
alter role supabase_storage_admin login noinherit createrole;
alter role supabase_replication_admin login replication;
alter role supabase_realtime_admin nologin noinherit;
alter role pgbouncer login;

grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;
grant pg_read_all_data to supabase_read_only_user;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

create schema if not exists auth authorization supabase_auth_admin;

create table if not exists auth.users (
  id uuid primary key
);
alter table auth.users owner to supabase_auth_admin;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid;
$$;
alter function auth.uid() owner to supabase_auth_admin;

grant usage on schema auth to postgres, anon, authenticated, service_role;
-- Fixture INSERT for disposable adversarial suites (not a hosted grant claim).
grant select, insert, update, delete, references on auth.users to postgres;
grant execute on function auth.uid() to postgres, anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;

alter default privileges for role supabase_admin in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public
  grant all on sequences to anon, authenticated, service_role;

create publication supabase_realtime;
