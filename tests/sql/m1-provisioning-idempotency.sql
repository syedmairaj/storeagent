\set ON_ERROR_STOP on

BEGIN;

\echo ''
\echo '=== M1.8 PROVISIONING IDEMPOTENCY VERIFICATION ==='

\set test_user '33333333-3333-4333-8333-333333333333'

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
VALUES (
  :'test_user'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'm18-provision@example.invalid',
  '',
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{}'::jsonb
);

SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  :'test_user',
  true
);

SELECT set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

\echo ''
\echo '--- First provisioning call ---'

SELECT public.ensure_current_user_provisioned();

\echo ''
\echo '--- Second provisioning call ---'

SELECT public.ensure_current_user_provisioned();

RESET ROLE;

\echo ''
\echo '--- Verify exactly one membership exists ---'

DO $$
DECLARE
  membership_count integer;
BEGIN
  SELECT count(*)
  INTO membership_count
  FROM public.organization_members
  WHERE user_id =
    '33333333-3333-4333-8333-333333333333'::uuid;

  IF membership_count <> 1 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: expected exactly one membership after repeated provisioning, found %',
      membership_count;
  END IF;
END
$$;

\echo 'PASS: repeated provisioning produced exactly one membership'

\echo ''
\echo '--- Verify membership is owner ---'

DO $$
DECLARE
  owner_count integer;
BEGIN
  SELECT count(*)
  INTO owner_count
  FROM public.organization_members
  WHERE
    user_id =
      '33333333-3333-4333-8333-333333333333'::uuid
    AND role = 'owner';

  IF owner_count <> 1 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: provisioned membership is not exactly one owner membership';
  END IF;
END
$$;

\echo 'PASS: provisioned membership role is owner'

\echo ''
\echo '--- Verify exactly one organization is owned by test user ---'

DO $$
DECLARE
  organization_count integer;
BEGIN
  SELECT count(*)
  INTO organization_count
  FROM public.organizations o
  JOIN public.organization_members m
    ON m.organization_id = o.id
  WHERE
    m.user_id =
      '33333333-3333-4333-8333-333333333333'::uuid;

  IF organization_count <> 1 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: expected exactly one provisioned organization, found %',
      organization_count;
  END IF;
END
$$;

\echo 'PASS: repeated provisioning produced exactly one organization'

\echo ''
\echo '--- Verify canonical defaults ---'

DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*)
  INTO bad_count
  FROM public.organizations o
  JOIN public.organization_members m
    ON m.organization_id = o.id
  WHERE
    m.user_id =
      '33333333-3333-4333-8333-333333333333'::uuid
    AND (
      o.name <> 'My Organization'
      OR o.default_currency <> 'XXX'
      OR o.timezone <> 'UTC'
    );

  IF bad_count <> 0 THEN
    RAISE EXCEPTION
      'M1.8 FAIL: provisioning defaults changed';
  END IF;
END
$$;

\echo 'PASS: provisioning defaults remain canonical'

\echo ''
\echo '=== M1.8 PROVISIONING IDEMPOTENCY CHECKS PASS ==='

ROLLBACK;
