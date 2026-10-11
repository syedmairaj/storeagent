\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M1.8 LIVE DATABASE ADVERSARIAL VERIFICATION ==='

-- ---------------------------------------------------------------------------
-- Fixed ephemeral fixture identifiers.
-- Everything is rolled back at the end.
-- ---------------------------------------------------------------------------

\set user_a '11111111-1111-4111-8111-111111111111'
\set user_b '22222222-2222-4222-8222-222222222222'

\set org_a 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set org_b 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

-- ---------------------------------------------------------------------------
-- Auth fixtures
--
-- These users exist only inside this transaction.
-- Password authentication is not required because this test exercises
-- PostgreSQL RLS directly using authenticated JWT claim context.
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
VALUES
(
  :'user_a'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'm18-a@example.invalid',
  '',
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{}'::jsonb
),
(
  :'user_b'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'm18-b@example.invalid',
  '',
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Canonical organization fixtures
-- ---------------------------------------------------------------------------

INSERT INTO public.organizations (
  id,
  name,
  default_currency,
  timezone
)
VALUES
(
  :'org_a'::uuid,
  'M1.8 Org A',
  'XXX',
  'UTC'
),
(
  :'org_b'::uuid,
  'M1.8 Org B',
  'XXX',
  'UTC'
);

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role
)
VALUES
(
  :'org_a'::uuid,
  :'user_a'::uuid,
  'owner'
),
(
  :'org_b'::uuid,
  :'user_b'::uuid,
  'owner'
);

-- ---------------------------------------------------------------------------
-- Helper: act as authenticated User A.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  :'user_a',
  true
);

SELECT set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

\echo ''
\echo '--- User A: own organization visible ---'

DO $$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*)
  INTO visible_count
  FROM public.organizations
  WHERE id =
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;

  IF visible_count <> 1 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: User A cannot read Org A';
  END IF;
END
$$;

\echo 'PASS: User A can read Org A'

\echo ''
\echo '--- User A: foreign organization hidden ---'

DO $$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*)
  INTO visible_count
  FROM public.organizations
  WHERE id =
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid;

  IF visible_count <> 0 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: User A can read Org B';
  END IF;
END
$$;

\echo 'PASS: User A cannot read Org B'

\echo ''
\echo '--- User A: membership visibility self-only ---'

DO $$
DECLARE
  own_count integer;
  foreign_count integer;
BEGIN
  SELECT count(*)
  INTO own_count
  FROM public.organization_members
  WHERE user_id =
    '11111111-1111-4111-8111-111111111111'::uuid;

  SELECT count(*)
  INTO foreign_count
  FROM public.organization_members
  WHERE user_id =
    '22222222-2222-4222-8222-222222222222'::uuid;

  IF own_count <> 1 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: User A cannot read own membership';
  END IF;

  IF foreign_count <> 0 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: User A can read User B membership';
  END IF;
END
$$;

\echo 'PASS: User A sees own membership only'

\echo ''
\echo '--- User A: direct organization INSERT denied ---'

DO $$
BEGIN
  BEGIN
    INSERT INTO public.organizations (
      id,
      name,
      default_currency,
      timezone
    )
    VALUES (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
      'Forbidden Org',
      'XXX',
      'UTC'
    );

    RAISE EXCEPTION
      'M1.8 FAIL: authenticated browser insert unexpectedly succeeded';

  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      NULL;
  END;
END
$$;

\echo 'PASS: direct organization INSERT denied'

\echo ''
\echo '--- User A: direct membership UPDATE denied ---'

DO $$
DECLARE
  affected integer;
BEGIN
  BEGIN
    UPDATE public.organization_members
    SET role = 'admin'
    WHERE
      organization_id =
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      AND
      user_id =
        '11111111-1111-4111-8111-111111111111'::uuid;

    GET DIAGNOSTICS affected = ROW_COUNT;

    IF affected <> 0 THEN
      RAISE EXCEPTION
        'M1.8 FAIL: authenticated membership UPDATE succeeded';
    END IF;

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: direct membership UPDATE denied'

\echo ''
\echo '--- User A: direct organization DELETE denied ---'

DO $$
DECLARE
  affected integer;
BEGIN
  BEGIN
    DELETE FROM public.organizations
    WHERE id =
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;

    GET DIAGNOSTICS affected = ROW_COUNT;

    IF affected <> 0 THEN
      RAISE EXCEPTION
        'M1.8 FAIL: authenticated organization DELETE succeeded';
    END IF;

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: direct organization DELETE denied'

-- ---------------------------------------------------------------------------
-- User B symmetry.
-- ---------------------------------------------------------------------------

SELECT set_config(
  'request.jwt.claim.sub',
  :'user_b',
  true
);

\echo ''
\echo '--- User B: own organization visible ---'

DO $$
DECLARE
  own_count integer;
  foreign_count integer;
BEGIN
  SELECT count(*)
  INTO own_count
  FROM public.organizations
  WHERE id =
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid;

  SELECT count(*)
  INTO foreign_count
  FROM public.organizations
  WHERE id =
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;

  IF own_count <> 1 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: User B cannot read Org B';
  END IF;

  IF foreign_count <> 0 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: User B can read Org A';
  END IF;
END
$$;

\echo 'PASS: User B isolation symmetric'

-- ---------------------------------------------------------------------------
-- Anonymous isolation.
-- ---------------------------------------------------------------------------

RESET ROLE;

SET LOCAL ROLE anon;

SELECT set_config(
  'request.jwt.claim.sub',
  '',
  true
);

SELECT set_config(
  'request.jwt.claim.role',
  'anon',
  true
);

\echo ''
\echo '--- Anonymous: organizations hidden ---'

DO $$
DECLARE
  visible_count integer;
BEGIN
  BEGIN
    SELECT count(*)
    INTO visible_count
    FROM public.organizations
    WHERE id IN (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
    );

    IF visible_count <> 0 THEN
      RAISE EXCEPTION
        'M1.8 FAIL: anonymous user can read organizations';
    END IF;

  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

\echo 'PASS: anonymous organization SELECT denied'

-- ---------------------------------------------------------------------------
-- Database policy configuration.
-- ---------------------------------------------------------------------------

RESET ROLE;

\echo ''
\echo '--- RLS enabled on all M1 foundation tables ---'

DO $$
DECLARE
  disabled_count integer;
BEGIN
  SELECT count(*)
  INTO disabled_count
  FROM pg_class c
  JOIN pg_namespace n
    ON n.oid = c.relnamespace
  WHERE
    n.nspname = 'public'
    AND c.relname IN (
      'organizations',
      'organization_members',
      'stores',
      'locations'
    )
    AND NOT c.relrowsecurity;

  IF disabled_count <> 0 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: one or more foundation tables have RLS disabled';
  END IF;
END
$$;

\echo 'PASS: RLS enabled on organizations'
\echo 'PASS: RLS enabled on organization_members'
\echo 'PASS: RLS enabled on stores'
\echo 'PASS: RLS enabled on locations'

\echo ''
\echo '--- Exactly four foundation policies remain installed ---'

DO $$
DECLARE
  policy_count integer;
BEGIN
  SELECT count(*)
  INTO policy_count
  FROM pg_policies
  WHERE
    schemaname = 'public'
    AND tablename IN (
      'organizations',
      'organization_members',
      'stores',
      'locations'
    );

  IF policy_count <> 4 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: expected 4 foundation RLS policies, found %',
      policy_count;
  END IF;
END
$$;

\echo 'PASS: exactly four foundation RLS policies installed'

\echo ''
\echo '=== M1.8 DATABASE ADVERSARIAL CHECKS PASS ==='

ROLLBACK;
