-- StoreAgent M1.8
-- One-time password-recovery challenges.
--
-- Issued only after the application verifies a recovery token_hash
-- through Supabase Auth (verifyOtp type=recovery).
-- Ordinary authenticated sessions cannot mint or reuse challenges
-- through direct table access.

create table public.password_recovery_challenges (
  id uuid primary key
    default gen_random_uuid(),

  user_id uuid not null,

  secret_hash text not null,

  expires_at timestamptz not null,

  consumed_at timestamptz null,

  created_at timestamptz not null
    default pg_catalog.now(),

  constraint password_recovery_challenges_user_fk
    foreign key (user_id)
    references auth.users (id)
    on delete cascade,

  constraint password_recovery_challenges_secret_hash_not_blank
    check (
      pg_catalog.length(
        pg_catalog.btrim(secret_hash)
      ) > 0
    ),

  constraint password_recovery_challenges_expiry_after_create
    check (expires_at > created_at)
);

create index password_recovery_challenges_user_open_idx
  on public.password_recovery_challenges (
    user_id,
    expires_at
  )
  where consumed_at is null;

alter table public.password_recovery_challenges
  enable row level security;

revoke all
on table public.password_recovery_challenges
from public;

revoke all
on table public.password_recovery_challenges
from anon;

revoke all
on table public.password_recovery_challenges
from authenticated;

-- Supabase hosted default privileges commonly GRANT ALL on new tables to
-- service_role (role-specific, independent of PUBLIC). Clear that ambient
-- grant, then re-grant least privilege for issue/consume only.
revoke all
on table public.password_recovery_challenges
from service_role;

grant select, insert, update
on table public.password_recovery_challenges
to service_role;

-- No policies: authenticated clients cannot read or mutate challenges.
-- Application service-role code issues and consumes rows after Auth verification.
-- No plaintext recovery tokens are stored; only secret_hash.
