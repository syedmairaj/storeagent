-- M5.6E.4 local convenience wrapper.
-- Applies LOCAL-ONLY teardown, then HOSTED-SAFE create.
--
-- Do NOT use this file against hosted Supabase (teardown disables a
-- table-wide trigger). Hosted canary stage 1 uses only:
--   scripts/m5-6e4/canary-fixture-hosted-create.sql
--
-- Local usage:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 55322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/m5-6e4/canary-fixture.sql

\ir canary-fixture-local-teardown.sql
\ir canary-fixture-hosted-create.sql
