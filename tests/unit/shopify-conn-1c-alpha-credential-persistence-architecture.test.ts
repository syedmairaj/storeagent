import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const MIGRATION =
  "supabase/migrations/20261122120000_shopify_conn_1c_alpha_credential_persistence.sql";
const REPOSITORY =
  "lib/integration-credentials/repository.ts";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("SHOPIFY-CONN-1c-α credential persistence architecture", () => {
  it("marks repository server-only and keeps crypto barrel free of RPCs", () => {
    const repo = read(REPOSITORY);
    expect(repo.startsWith('import "server-only"')).toBe(true);
    expect(repo).toContain("assertServiceOperationScope");
    expect(repo).toContain("assertTrustedCredentialScope");
    expect(repo).toContain("resolveIntegrationOwnershipForTenant");
    expect(repo).toContain("buildTrustedCredentialScope");
    expect(repo).toContain("CREDENTIAL_BINDING_AUTHORIZATION_STATUS");
    expect(repo).toContain("NOT_YET_VERIFIED");
    expect(repo).toContain("TRUSTED_CREDENTIAL_SCOPE_BRAND");
    expect(repo).toContain("RESOLVED_INTEGRATION_OWNERSHIP_BRAND");
    expect(repo).toContain("CredentialPersistenceError");
    expect(repo).toContain("parseCredentialBytea");
    expect(repo).toContain("parsePositiveSafeGeneration");
    expect(repo).toContain("Number.isSafeInteger");
    expect(repo).not.toContain("buildTrustedCredentialScopeFromIntegration");
    expect(repo).not.toMatch(/result\.error\.message/);
    expect(repo).toMatch(/catch\s*\{[\s\S]*rpc_failed/);
    expect(repo).not.toMatch(/NEXT_PUBLIC_/);
    expect(repo).not.toContain("createSupabaseAdminClient");
    expect(repo).not.toContain("oauth");
    expect(repo).not.toContain("shopify.com");

    const barrel = read("lib/integration-credentials/index.ts");
    expect(barrel).not.toContain("repository");
    expect(barrel).not.toMatch(/\.rpc\(/);
  });

  it("migration is RPC-only mutate with empty search_path and ambient revoke", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain("credential_generation");
    expect(sql).toContain("refresh_lock_token");
    expect(sql).toContain("refresh_lock_owner_id");
    expect(sql).toContain("refresh_lock_claimed_at");

    expect(sql).toContain("load_integration_credential_envelope");
    expect(sql).toContain("replace_integration_credential_set");
    expect(sql).toContain("clear_integration_credentials");

    expect(sql).not.toMatch(/acquire_integration_credential_refresh_lock/i);
    expect(sql).not.toMatch(/rotate_integration_credential_set/i);
    expect(sql).not.toMatch(/release_integration_credential_refresh_lock/i);

    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path\s*=\s*''/i);
    expect(sql).not.toMatch(/EXECUTE\s+immediate/i);
    expect(sql).not.toMatch(/format\s*\(\s*'select/i);

    expect(sql).toMatch(
      /revoke all\s+on table public\.integration_credentials\s+from service_role/i,
    );
    expect(sql).toMatch(
      /revoke all[\s\S]*on function public\.load_integration_credential_envelope[\s\S]*from service_role/i,
    );
    expect(sql).toMatch(
      /grant execute[\s\S]*on function public\.load_integration_credential_envelope[\s\S]*to service_role/i,
    );

    expect(sql).toContain("on conflict on constraint");
    expect(sql).toContain("p_expected_generation");
    expect(sql).toContain("outcome := 'conflict'");
    expect(sql).toContain("return 'fenced'");
    expect(sql).toContain("refresh_lock_expires_at <=");
    expect(sql).not.toMatch(/update\s+public\.integrations\b/i);
    expect(sql).not.toMatch(
      /set\s+[\s\S]{0,80}\bstatus\s*=\s*'(revoked|disconnected|error)'/i,
    );
  });

  it("repository never clears on crypto failure paths", () => {
    const repo = read(REPOSITORY);
    expect(repo).toContain("isCredentialCryptoError");
    expect(repo).toContain("loadAndDecryptIntegrationCredentials");
    expect(repo).toMatch(
      /Fail closed without vault mutation|does NOT clear stored credentials/i,
    );

    const clearIdx = repo.indexOf("export async function clearIntegrationCredentials");
    const decryptIdx = repo.indexOf("export async function loadAndDecryptIntegrationCredentials");
    expect(clearIdx).toBeGreaterThan(-1);
    expect(decryptIdx).toBeGreaterThan(-1);

    const decryptFn = repo.slice(
      decryptIdx,
      clearIdx > decryptIdx ? clearIdx : undefined,
    );
    expect(decryptFn).not.toContain("clear_integration_credentials");
    expect(decryptFn).not.toContain("clearIntegrationCredentials(");
  });

  it("does not add client routes or env KEK wiring", () => {
    const repo = read(REPOSITORY);
    expect(repo).not.toContain("readServerEnvironment");
    expect(repo).not.toContain("INTEGRATION_CREDENTIALS_KEK");
    expect(repo).not.toContain("app/api");

    const env = read("lib/config/env.ts");
    expect(env).not.toContain("INTEGRATION_CREDENTIALS_KEK");
  });
});
