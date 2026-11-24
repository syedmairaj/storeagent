-- SHOPIFY-CONN-1d-E full-chain disposable bootstrap (offline / isolated PG only).
-- Run once on an EMPTY dedicated database before replaying every file in
-- supabase/migrations/ in filename order. Not for hosted or local Supabase
-- 55322 / 54322.
--
-- Simulates the hosted Supabase surfaces the product migrations depend on:
--   roles anon / authenticated / service_role (service_role BYPASSRLS)
--   extensions schema with pgcrypto (extensions.digest)
--   auth.users(id) and auth.uid() claim stub (request.jwt.claim.sub)
--   role-specific default privileges granting ALL on new tables, functions
--   and sequences in public to anon, authenticated and service_role
--   (the ambient-grant hazard recorded in HOSTED_38to52_MIGRATION_RUNBOOK.md)

\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

-- Hosted service_role bypasses RLS; a pre-existing disposable role may not.
alter role service_role bypassrls;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

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

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
