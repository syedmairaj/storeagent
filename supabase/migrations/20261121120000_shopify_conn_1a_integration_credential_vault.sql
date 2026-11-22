-- StoreAgent SHOPIFY-CONN-1a
-- Additive credential vault schema + verified external-account ownership.
--
-- Authority:
--   docs/SHOPIFY_CONN_1_VAULT_CONTRACT.md (CONN-1B freeze)
--   docs/SHOPIFY_CONN_0_SECURITY_ARCHITECTURE.md
--   docs/SERVICE_ROLE_BOUNDARY.md
--   docs/CROSS_ORG_THREAT_MODEL.md
--
-- Scope (this slice only):
--   public.integration_credentials
--   public.integration_external_accounts
--   RLS + explicit privilege revocation
--   identity immutability triggers
--   Phase A ownership uniqueness (active rows only)
--
-- Out of scope:
--   encrypt/decrypt APIs, KEK custody, OAuth, refresh, webhooks, SyncRun,
--   SECURITY DEFINER vault RPCs, hosted apply, plaintext token columns.
--
-- Referenced M2.6 unique (no change to frozen identity behavior):
--   public.integrations (organization_id, id, provider)
--     constraint integrations_organization_id_provider_unique
--
-- Encrypted-envelope representation (CONN-1b must implement; schema only here):
--   Future algorithm: AES-256-GCM (AEAD) with envelope DEK/KEK.
--   Each sealed field is an independent encrypt operation and MUST carry its
--   own cryptographically random 12-byte nonce and 16-byte auth tag.
--   Never reuse (key, nonce) across operations — including DEK wrapping.
--   Shared single-nonce storage is intentionally rejected as ambiguous.

-- -----------------------------------------------------------------------------
-- A. integration_credentials — provider-neutral sealed credential set
-- -----------------------------------------------------------------------------

create table public.integration_credentials (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  integration_id uuid not null,
  provider text not null,

  token_kind text not null,

  -- Access-token AEAD seal (independent encrypt operation).
  access_ciphertext bytea not null,
  access_nonce bytea not null,
  access_auth_tag bytea not null,

  -- Refresh-token AEAD seal (required for offline_expiring; independent op).
  refresh_ciphertext bytea null,
  refresh_nonce bytea null,
  refresh_auth_tag bytea null,

  -- DEK wrapped under KEK (independent AEAD seal; own nonce + tag).
  dek_wrapped bytea not null,
  dek_wrap_nonce bytea not null,
  dek_wrap_auth_tag bytea not null,

  key_version integer not null,

  access_expires_at timestamptz null,
  refresh_expires_at timestamptz null,
  scope text null,

  refresh_lock_expires_at timestamptz null,
  last_rotated_at timestamptz null,

  created_at timestamptz not null
    default pg_catalog.now(),
  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint integration_credentials_integration_provider_fk
    foreign key (
      organization_id,
      integration_id,
      provider
    )
    references public.integrations (
      organization_id,
      id,
      provider
    )
    on delete restrict,

  constraint integration_credentials_provider_check
    check (
      provider in (
        'csv',
        'shopify',
        'woocommerce',
        'square',
        'lightspeed',
        'other'
      )
    ),

  constraint integration_credentials_token_kind_check
    check (
      token_kind in (
        'offline_expiring'
      )
    ),

  constraint integration_credentials_key_version_positive
    check (key_version > 0),

  constraint integration_credentials_access_ciphertext_not_empty
    check (pg_catalog.length(access_ciphertext) > 0),

  -- AES-256-GCM: 96-bit nonce, 128-bit auth tag (per sealed operation).
  constraint integration_credentials_access_nonce_gcm
    check (pg_catalog.length(access_nonce) = 12),

  constraint integration_credentials_access_auth_tag_gcm
    check (pg_catalog.length(access_auth_tag) = 16),

  constraint integration_credentials_dek_wrapped_not_empty
    check (pg_catalog.length(dek_wrapped) > 0),

  constraint integration_credentials_dek_wrap_nonce_gcm
    check (pg_catalog.length(dek_wrap_nonce) = 12),

  constraint integration_credentials_dek_wrap_auth_tag_gcm
    check (pg_catalog.length(dek_wrap_auth_tag) = 16),

  -- Offline expiring pair must be a complete independent refresh seal.
  constraint integration_credentials_offline_pair_complete
    check (
      token_kind <> 'offline_expiring'
      or (
        refresh_ciphertext is not null
        and pg_catalog.length(refresh_ciphertext) > 0
        and refresh_nonce is not null
        and pg_catalog.length(refresh_nonce) = 12
        and refresh_auth_tag is not null
        and pg_catalog.length(refresh_auth_tag) = 16
      )
    ),

  -- When refresh seal fields are present, they must form one complete envelope.
  constraint integration_credentials_refresh_envelope_consistent
    check (
      (
        refresh_ciphertext is null
        and refresh_nonce is null
        and refresh_auth_tag is null
      )
      or (
        refresh_ciphertext is not null
        and pg_catalog.length(refresh_ciphertext) > 0
        and refresh_nonce is not null
        and pg_catalog.length(refresh_nonce) = 12
        and refresh_auth_tag is not null
        and pg_catalog.length(refresh_auth_tag) = 16
      )
    ),

  constraint integration_credentials_scope_not_blank
    check (
      scope is null
      or pg_catalog.length(pg_catalog.btrim(scope)) > 0
    ),

  -- Exactly one current credential set per integration.
  constraint integration_credentials_org_integration_unique
    unique (
      organization_id,
      integration_id
    )
);

create index integration_credentials_organization_provider_idx
  on public.integration_credentials (
    organization_id,
    provider
  );

create trigger integration_credentials_set_updated_at
before update on public.integration_credentials
for each row
execute function public.set_updated_at();

create or replace function public.prevent_integration_credential_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.integration_id is distinct from old.integration_id
    or new.provider is distinct from old.provider
  then
    raise exception
      'integration credential tenant/identity fields cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger integration_credentials_prevent_identity_reassignment
before update on public.integration_credentials
for each row
execute function public.prevent_integration_credential_identity_reassignment();

-- PostgreSQL grants EXECUTE to PUBLIC on CREATE FUNCTION. Clear ambient
-- execute from browser roles; table-owner trigger firing remains intact.
revoke all
on function public.prevent_integration_credential_identity_reassignment()
from public;

revoke all
on function public.prevent_integration_credential_identity_reassignment()
from anon;

revoke all
on function public.prevent_integration_credential_identity_reassignment()
from authenticated;

revoke all
on function public.prevent_integration_credential_identity_reassignment()
from service_role;

alter table public.integration_credentials
  enable row level security;

-- Explicit browser + ambient service_role privilege boundary.
-- Hosted default privileges commonly GRANT ALL on new tables to service_role
-- independent of PUBLIC; clear that ambient grant. CONN-1a ships no vault
-- RPCs and grants no direct table privileges to service_role (RPC-only mutate
-- deferred to a later authorized slice).
revoke all
on table public.integration_credentials
from public;

revoke all
on table public.integration_credentials
from anon;

revoke all
on table public.integration_credentials
from authenticated;

revoke all
on table public.integration_credentials
from service_role;

-- -----------------------------------------------------------------------------
-- B. integration_external_accounts — verified external ownership
-- -----------------------------------------------------------------------------

create table public.integration_external_accounts (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null,
  integration_id uuid not null,
  provider text not null,

  -- Opaque provider account id (Shopify shop id) when known.
  external_account_id text null,

  -- Normalized external handle (Shopify: lowercase *.myshopify.com).
  external_handle text not null,

  -- Phase A ownership semantics (CONN-1 vault contract §4):
  --   active        — holds global uniqueness reservation; MUST be verified
  --   revoked       — reservation released (reinstall via explicit OAuth later)
  --   disconnected  — reservation released (same)
  ownership_status text not null
    default 'active',

  -- Contract: "verified external account ownership" / "matching verified
  -- identity". Active rows are authoritative only when verified_at is set.
  -- Unverified inserts cannot become active ownership claims.
  verified_at timestamptz null,
  revoked_at timestamptz null,

  created_at timestamptz not null
    default pg_catalog.now(),
  updated_at timestamptz not null
    default pg_catalog.now(),

  constraint integration_external_accounts_integration_provider_fk
    foreign key (
      organization_id,
      integration_id,
      provider
    )
    references public.integrations (
      organization_id,
      id,
      provider
    )
    on delete restrict,

  constraint integration_external_accounts_provider_check
    check (
      provider in (
        'csv',
        'shopify',
        'woocommerce',
        'square',
        'lightspeed',
        'other'
      )
    ),

  constraint integration_external_accounts_ownership_status_check
    check (
      ownership_status in (
        'active',
        'revoked',
        'disconnected'
      )
    ),

  constraint integration_external_accounts_external_account_id_not_blank
    check (
      external_account_id is null
      or (
        pg_catalog.length(pg_catalog.btrim(external_account_id)) > 0
        and external_account_id = pg_catalog.btrim(external_account_id)
      )
    ),

  -- Normalized lowercase myshopify.com domain for Shopify; other providers
  -- must still supply a non-blank lowercase handle (shape enforced when shopify).
  constraint integration_external_accounts_external_handle_normalized
    check (
      external_handle = pg_catalog.lower(external_handle)
      and pg_catalog.length(pg_catalog.btrim(external_handle)) > 0
      and external_handle = pg_catalog.btrim(external_handle)
      and (
        provider <> 'shopify'
        or external_handle ~
          '^[a-z0-9][a-z0-9\-]*\.myshopify\.com$'
      )
    ),

  -- Active ownership is verified ownership (contract §4). Do not allow
  -- ownership_status='active' with verified_at NULL — that would make an
  -- unverified INSERT authoritative. Uniqueness indexes remain on all
  -- active rows (not narrowed by verified_at) so uniqueness is not weakened.
  constraint integration_external_accounts_active_requires_verified
    check (
      ownership_status <> 'active'
      or verified_at is not null
    ),

  constraint integration_external_accounts_revocation_timestamps
    check (
      (
        ownership_status = 'active'
        and revoked_at is null
        and verified_at is not null
      )
      or (
        ownership_status in ('revoked', 'disconnected')
        and revoked_at is not null
      )
    ),

  -- One ownership row per integration (current verified identity).
  constraint integration_external_accounts_org_integration_unique
    unique (
      organization_id,
      integration_id
    )
);

-- Global active ownership: at most one non-revoked owner per provider account id.
-- Predicate is ownership_status='active' only (not verified_at) so uniqueness
-- cannot be bypassed by omitting verification — active already requires verified_at.
create unique index integration_external_accounts_active_account_uidx
  on public.integration_external_accounts (
    provider,
    external_account_id
  )
  where
    ownership_status = 'active'
    and external_account_id is not null;

-- Global active ownership: at most one non-revoked owner per normalized handle.
create unique index integration_external_accounts_active_handle_uidx
  on public.integration_external_accounts (
    provider,
    external_handle
  )
  where ownership_status = 'active';

create index integration_external_accounts_organization_provider_idx
  on public.integration_external_accounts (
    organization_id,
    provider
  );

create trigger integration_external_accounts_set_updated_at
before update on public.integration_external_accounts
for each row
execute function public.set_updated_at();

create or replace function public.prevent_integration_external_account_identity_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    new.organization_id is distinct from old.organization_id
    or new.integration_id is distinct from old.integration_id
    or new.provider is distinct from old.provider
  then
    raise exception
      'integration external account tenant/identity fields cannot be reassigned';
  end if;

  return new;
end;
$$;

create trigger integration_external_accounts_prevent_identity_reassignment
before update on public.integration_external_accounts
for each row
execute function public.prevent_integration_external_account_identity_reassignment();

revoke all
on function public.prevent_integration_external_account_identity_reassignment()
from public;

revoke all
on function public.prevent_integration_external_account_identity_reassignment()
from anon;

revoke all
on function public.prevent_integration_external_account_identity_reassignment()
from authenticated;

revoke all
on function public.prevent_integration_external_account_identity_reassignment()
from service_role;

alter table public.integration_external_accounts
  enable row level security;

revoke all
on table public.integration_external_accounts
from public;

revoke all
on table public.integration_external_accounts
from anon;

revoke all
on table public.integration_external_accounts
from authenticated;

revoke all
on table public.integration_external_accounts
from service_role;
