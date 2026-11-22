import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20261121120000_shopify_conn_1a_integration_credential_vault.sql";

const M26_PATH =
  "supabase/migrations/20261011143000_m2_6_integration_identity.sql";

const migration = readFileSync(join(process.cwd(), MIGRATION_PATH), "utf8");
const m26 = readFileSync(join(process.cwd(), M26_PATH), "utf8");

describe("SHOPIFY-CONN-1a credential vault schema (static)", () => {
  it("adds provider-neutral vault + ownership tables only (additive)", () => {
    expect(migration).toContain(
      "create table public.integration_credentials (",
    );
    expect(migration).toContain(
      "create table public.integration_external_accounts (",
    );
    expect(migration).not.toMatch(
      /alter\s+table\s+public\.integrations\b/i,
    );
    expect(migration).not.toMatch(
      /drop\s+table\s+public\.integrations\b/i,
    );
    expect(migration).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.prevent_integration_identity_reassignment/i,
    );
  });

  it("reuses M2.6 composite unique for tenant/integration/provider FK", () => {
    expect(m26).toContain("constraint integrations_organization_id_provider_unique");
    expect(migration).toContain(
      "constraint integration_credentials_integration_provider_fk",
    );
    expect(migration).toContain(
      "constraint integration_external_accounts_integration_provider_fk",
    );
    expect(migration).toMatch(
      /references\s+public\.integrations\s*\(\s*organization_id\s*,\s*id\s*,\s*provider\s*\)/i,
    );
  });

  it("stores per-seal GCM envelope columns (no shared nonce)", () => {
    expect(migration).toContain("access_ciphertext bytea not null");
    expect(migration).toContain("access_nonce bytea not null");
    expect(migration).toContain("access_auth_tag bytea not null");
    expect(migration).toContain("refresh_ciphertext bytea null");
    expect(migration).toContain("refresh_nonce bytea null");
    expect(migration).toContain("refresh_auth_tag bytea null");
    expect(migration).toContain("dek_wrapped bytea not null");
    expect(migration).toContain("dek_wrap_nonce bytea not null");
    expect(migration).toContain("dek_wrap_auth_tag bytea not null");
    expect(migration).toContain("key_version integer not null");
    expect(migration).toContain(
      "constraint integration_credentials_access_nonce_gcm",
    );
    expect(migration).toContain(
      "constraint integration_credentials_dek_wrap_auth_tag_gcm",
    );
    expect(migration).toContain(
      "constraint integration_credentials_offline_pair_complete",
    );
    expect(migration).not.toMatch(/^\s*nonce\s+bytea/m);
    expect(migration).not.toMatch(
      /^\s*(access_token|refresh_token|token)\s+/m,
    );
    expect(migration).not.toMatch(
      /create table[\s\S]*?\b(access_token|refresh_token)\b/i,
    );
  });

  it("enforces Phase A active ownership uniqueness + verified_at + revoke release", () => {
    expect(migration).toContain(
      "create unique index integration_external_accounts_active_account_uidx",
    );
    expect(migration).toContain(
      "create unique index integration_external_accounts_active_handle_uidx",
    );
    expect(migration).toContain(
      "constraint integration_external_accounts_active_requires_verified",
    );
    expect(migration).toContain("ownership_status = 'active'");
    expect(migration).toContain("'revoked'");
    expect(migration).toContain("'disconnected'");
    expect(migration).toContain(
      "'^[a-z0-9][a-z0-9\\-]*\\.myshopify\\.com$'",
    );
    // Uniqueness must stay on all active rows (not narrowed by verified_at).
    expect(migration).not.toMatch(
      /active_handle_uidx[\s\S]*verified_at is not null/i,
    );
  });

  it("enables RLS, revokes browser+service_role, and adds no stub RPCs", () => {
    expect(migration).toMatch(
      /alter table public\.integration_credentials\s+enable row level security/i,
    );
    expect(migration).toMatch(
      /alter table public\.integration_external_accounts\s+enable row level security/i,
    );
    expect(migration).toContain("revoke all");
    expect(migration).toContain("from service_role");
    expect(migration).toContain("from anon");
    expect(migration).toContain("from authenticated");
    expect(migration).not.toMatch(
      /^\s*grant\s+(select|insert|update|delete)\b/im,
    );
    expect(migration).not.toMatch(
      /create\s+(or\s+replace\s+)?function[\s\S]*security\s+definer/i,
    );
    expect(migration).not.toMatch(/^\s*create\s+policy\b/im);
  });

  it("makes tenant/identity fields immutable via triggers", () => {
    expect(migration).toContain(
      "prevent_integration_credential_identity_reassignment",
    );
    expect(migration).toContain(
      "prevent_integration_external_account_identity_reassignment",
    );
  });

  it("revokes EXECUTE on identity trigger functions from PUBLIC/browser/service_role", () => {
    expect(migration).toMatch(
      /revoke all\s+on function public\.prevent_integration_credential_identity_reassignment\(\)\s+from public/i,
    );
    expect(migration).toMatch(
      /revoke all\s+on function public\.prevent_integration_external_account_identity_reassignment\(\)\s+from public/i,
    );
    expect(migration).toMatch(
      /revoke all\s+on function public\.prevent_integration_credential_identity_reassignment\(\)\s+from anon/i,
    );
    expect(migration).toMatch(
      /revoke all\s+on function public\.prevent_integration_external_account_identity_reassignment\(\)\s+from authenticated/i,
    );
    expect(migration).toMatch(
      /revoke all\s+on function public\.prevent_integration_credential_identity_reassignment\(\)\s+from service_role/i,
    );
  });
});
