import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const MIGRATION =
  "supabase/migrations/20261122140000_shopify_conn_1d_c_disconnect_revoke.sql";
const REPOSITORY =
  "lib/integration-credentials/repository.ts";
const ALPHA_MIGRATION =
  "supabase/migrations/20261122120000_shopify_conn_1c_alpha_credential_persistence.sql";
const V15 =
  "tests/sql/shopify-conn-1d-c-v15-rollback-additive.sql";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("SHOPIFY-CONN-1d-C disconnect/revoke architecture", () => {
  it("1d-C migration fences α replace and adds disconnect RPC with grants", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain("disconnect_or_revoke_integration_credentials");
    expect(sql).toContain("replace_integration_credential_set");
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path\s*=\s*''/i);
    expect(sql).not.toMatch(/pg_advisory_/i);
    expect(sql).not.toMatch(/\bp_force\b/i);
    expect(sql).not.toMatch(
      /create\s+(or\s+replace\s+)?function[\s\S]{0,80}force_clear/i,
    );

    expect(sql).toContain("for update");
    expect(sql).toContain("integration_external_accounts");
    expect(sql).toContain("'disconnected', 'revoked'");
    expect(sql).toContain("merchant_disconnect");
    expect(sql).toContain("hard_auth_failure");
    expect(sql).toContain("lease_held");
    expect(sql).toContain("already_terminal");
    expect(sql).toContain("outcome := 'fenced'");

    expect(sql).toMatch(
      /revoke all\s+on table public\.integration_credentials\s+from service_role/i,
    );
    expect(sql).toMatch(
      /grant execute[\s\S]*disconnect_or_revoke_integration_credentials[\s\S]*to service_role/i,
    );
    expect(sql).toMatch(
      /grant execute[\s\S]*replace_integration_credential_set[\s\S]*to service_role/i,
    );
  });

  it("historical α migration file is unchanged (fence is additive OR REPLACE)", () => {
    const alpha = read(ALPHA_MIGRATION);
    expect(alpha).not.toContain("disconnect_or_revoke_integration_credentials");
    // Historical file still lacks terminal fence — 1d-C OR REPLACE supplies it.
    expect(alpha).not.toMatch(
      /v_status in \('disconnected', 'revoked'\)/,
    );
  });

  it("repository keeps brands, NOT_YET_VERIFIED, and never equates lease_held to destroyed", () => {
    const repo = read(REPOSITORY);
    expect(repo.startsWith('import "server-only"')).toBe(true);
    expect(repo).toContain("CREDENTIAL_BINDING_AUTHORIZATION_STATUS");
    expect(repo).toContain("NOT_YET_VERIFIED");
    expect(repo).toContain("disconnectOrRevokeIntegrationCredentials");
    expect(repo).toContain("credentialsDestroyed");
    expect(repo).toContain("lease_held");
    expect(repo).toMatch(
      /credentialsDestroyed\s*=\s*[\s\S]*outcome === "completed"[\s\S]*already_terminal/,
    );
    expect(repo).not.toContain("createSupabaseAdminClient");
    expect(repo).not.toMatch(/NEXT_PUBLIC_/);
    expect(repo).not.toContain("oauth");
    expect(repo).not.toContain("shopify.com");
    expect(repo).not.toContain("readServerEnvironment");
    expect(repo).not.toMatch(/result\.error\.message/);

    const barrel = read("lib/integration-credentials/index.ts");
    expect(barrel).not.toContain("repository");
  });

  it("V15 rollback drops disconnect only and flags unsafe α downgrade", () => {
    const v15 = read(V15);
    expect(v15).toContain("drop function if exists");
    expect(v15).toContain("disconnect_or_revoke_integration_credentials");
    expect(v15).toMatch(/UNSAFE ALPHA DOWNGRADE/i);
    expect(v15).toContain("expected fenced");
    expect(v15).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.replace_integration_credential_set/i,
    );
  });
});
