\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== MERCHANT PLANNING INPUTS V1 ADVERSARIAL ==='

\set org_a '88001000-0000-4000-8000-000000000001'
\set org_b '88001000-0000-4000-8000-000000000011'
\set user_owner '88001000-0000-4000-8000-000000000007'
\set user_admin '88001000-0000-4000-8000-000000000017'
\set user_analyst '88001000-0000-4000-8000-000000000037'
\set user_foreign '88001000-0000-4000-8000-000000000008'

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
(
  :'user_owner'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'plan-owner@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_admin'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'plan-admin@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_analyst'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'plan-analyst@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
),
(
  :'user_foreign'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'plan-foreign@example.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO public.organizations (id, name, default_currency, timezone)
VALUES
  (:'org_a'::uuid, 'Planning Org A', 'USD', 'UTC'),
  (:'org_b'::uuid, 'Planning Org B', 'USD', 'UTC');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (:'org_a'::uuid, :'user_owner'::uuid, 'owner'),
  (:'org_a'::uuid, :'user_admin'::uuid, 'admin'),
  (:'org_a'::uuid, :'user_analyst'::uuid, 'analyst'),
  (:'org_b'::uuid, :'user_foreign'::uuid, 'owner');

CREATE FUNCTION pg_temp.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE FUNCTION pg_temp.clear_user()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END;
$$;

\echo '--- Privilege inventory ---'

DO $$
DECLARE
  exec_auth boolean;
  exec_anon boolean;
  exec_service boolean;
  non_select integer;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.upsert_current_user_organization_planning_inputs(uuid,integer,integer,integer)',
    'EXECUTE'
  ) INTO exec_auth;
  SELECT has_function_privilege(
    'anon',
    'public.upsert_current_user_organization_planning_inputs(uuid,integer,integer,integer)',
    'EXECUTE'
  ) INTO exec_anon;
  SELECT has_function_privilege(
    'service_role',
    'public.upsert_current_user_organization_planning_inputs(uuid,integer,integer,integer)',
    'EXECUTE'
  ) INTO exec_service;

  IF NOT exec_auth OR exec_anon OR exec_service THEN
    RAISE EXCEPTION 'planning RPC EXECUTE grants incorrect (auth=%, anon=%, service=%)',
      exec_auth, exec_anon, exec_service;
  END IF;

  SELECT count(*)::integer
  INTO non_select
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'organization_planning_inputs'
    AND grantee = 'authenticated'
    AND privilege_type <> 'SELECT';

  IF non_select <> 0 THEN
    RAISE EXCEPTION 'authenticated must be SELECT-only on organization_planning_inputs';
  END IF;
END;
$$;

\echo '--- Owner partial upsert + zero vs unknown ---'

SELECT pg_temp.as_user(:'user_owner'::uuid);

SELECT *
FROM public.upsert_current_user_organization_planning_inputs(
  :'org_a'::uuid,
  7,
  NULL,
  0
);

DO $$
DECLARE
  lead_days integer;
  safety_days integer;
  review_days integer;
BEGIN
  SELECT lead_time_days, safety_stock_days, review_period_days
  INTO lead_days, safety_days, review_days
  FROM public.organization_planning_inputs
  WHERE organization_id = '88001000-0000-4000-8000-000000000001'::uuid;

  IF lead_days IS DISTINCT FROM 7
     OR safety_days IS NOT NULL
     OR review_days IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'partial/zero persistence failed: %, %, %',
      lead_days, safety_days, review_days;
  END IF;
END;
$$;

\echo '--- Edit + clear to unknown ---'

SELECT *
FROM public.upsert_current_user_organization_planning_inputs(
  :'org_a'::uuid,
  NULL,
  3,
  NULL
);

DO $$
DECLARE
  lead_days integer;
  safety_days integer;
  review_days integer;
BEGIN
  SELECT lead_time_days, safety_stock_days, review_period_days
  INTO lead_days, safety_days, review_days
  FROM public.organization_planning_inputs
  WHERE organization_id = '88001000-0000-4000-8000-000000000001'::uuid;

  IF lead_days IS NOT NULL
     OR safety_days IS DISTINCT FROM 3
     OR review_days IS NOT NULL THEN
    RAISE EXCEPTION 'clear/reload persistence failed: %, %, %',
      lead_days, safety_days, review_days;
  END IF;
END;
$$;

\echo '--- Negative rejection ---'

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.upsert_current_user_organization_planning_inputs(
      '88001000-0000-4000-8000-000000000001'::uuid,
      -1,
      NULL,
      NULL
    );
    RAISE EXCEPTION 'negative lead time should have failed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT ILIKE '%non-negative%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

\echo '--- Analyst denied ---'

SELECT pg_temp.clear_user();
SELECT pg_temp.as_user(:'user_analyst'::uuid);

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.upsert_current_user_organization_planning_inputs(
      '88001000-0000-4000-8000-000000000001'::uuid,
      5,
      5,
      5
    );
    RAISE EXCEPTION 'analyst write should have failed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT ILIKE '%owner or admin%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

\echo '--- Foreign org denied ---'

SELECT pg_temp.clear_user();
SELECT pg_temp.as_user(:'user_foreign'::uuid);

DO $$
BEGIN
  BEGIN
    PERFORM *
    FROM public.upsert_current_user_organization_planning_inputs(
      '88001000-0000-4000-8000-000000000001'::uuid,
      9,
      9,
      9
    );
    RAISE EXCEPTION 'foreign-org write should have failed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM NOT ILIKE '%membership required%'
         AND SQLERRM NOT ILIKE '%owner or admin%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

DO $$
DECLARE
  seen integer;
BEGIN
  SELECT count(*)::integer
  INTO seen
  FROM public.organization_planning_inputs
  WHERE organization_id = '88001000-0000-4000-8000-000000000001'::uuid;

  IF seen <> 0 THEN
    RAISE EXCEPTION 'foreign member must not SELECT org A planning inputs';
  END IF;
END;
$$;

\echo '--- Direct table mutation denied ---'

SELECT pg_temp.clear_user();
SELECT pg_temp.as_user(:'user_owner'::uuid);

DO $$
BEGIN
  BEGIN
    UPDATE public.organization_planning_inputs
    SET lead_time_days = 99
    WHERE organization_id = '88001000-0000-4000-8000-000000000001'::uuid;
    RAISE EXCEPTION 'direct UPDATE should have failed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.organization_planning_inputs (
      organization_id, lead_time_days
    ) VALUES (
      '88001000-0000-4000-8000-000000000011'::uuid,
      1
    );
    RAISE EXCEPTION 'direct INSERT should have failed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END;
$$;

\echo '--- Admin authorized control path ---'

SELECT pg_temp.clear_user();
SELECT pg_temp.as_user(:'user_admin'::uuid);

SELECT *
FROM public.upsert_current_user_organization_planning_inputs(
  :'org_a'::uuid,
  4,
  2,
  14
);

DO $$
DECLARE
  lead_days integer;
  safety_days integer;
  review_days integer;
BEGIN
  SELECT lead_time_days, safety_stock_days, review_period_days
  INTO lead_days, safety_days, review_days
  FROM public.organization_planning_inputs
  WHERE organization_id = '88001000-0000-4000-8000-000000000001'::uuid;

  IF lead_days IS DISTINCT FROM 4
     OR safety_days IS DISTINCT FROM 2
     OR review_days IS DISTINCT FROM 14 THEN
    RAISE EXCEPTION 'admin upsert failed: %, %, %',
      lead_days, safety_days, review_days;
  END IF;
END;
$$;

SELECT pg_temp.clear_user();

\echo '=== MERCHANT PLANNING INPUTS V1 ADVERSARIAL PASSED ==='

ROLLBACK;
