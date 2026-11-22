import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const MIGRATION =
  "supabase/migrations/20261122130000_shopify_conn_1c_beta_refresh_lease.sql";
const REPOSITORY =
  "lib/integration-credentials/repository.ts";
const ALPHA_MIGRATION =
  "supabase/migrations/20261122120000_shopify_conn_1c_alpha_credential_persistence.sql";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("SHOPIFY-CONN-1c-β refresh lease architecture", () => {
  it("β migration exposes exactly three lease RPCs with DEFINER + grants", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain("acquire_integration_credential_refresh_lock");
    expect(sql).toContain("rotate_integration_credential_set");
    expect(sql).toContain("release_integration_credential_refresh_lock");

    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path\s*=\s*''/i);
    expect(sql).not.toMatch(/pg_advisory_/i);
    expect(sql).not.toMatch(/\bp_force\b/i);
    expect(sql).not.toMatch(
      /create\s+(or\s+replace\s+)?function[\s\S]{0,80}force_clear/i,
    );
    expect(sql).not.toMatch(/update\s+public\.integrations\b/i);
    expect(sql).not.toMatch(
      /set\s+[\s\S]{0,80}\bstatus\s*=\s*'(revoked|disconnected|error)'/i,
    );
    expect(sql).not.toMatch(/EXECUTE\s+immediate/i);

    expect(sql).toMatch(
      /revoke all\s+on table public\.integration_credentials\s+from service_role/i,
    );
    expect(sql).toMatch(
      /grant execute[\s\S]*acquire_integration_credential_refresh_lock[\s\S]*to service_role/i,
    );
    expect(sql).toMatch(
      /grant execute[\s\S]*rotate_integration_credential_set[\s\S]*to service_role/i,
    );
    expect(sql).toMatch(
      /grant execute[\s\S]*release_integration_credential_refresh_lock[\s\S]*to service_role/i,
    );

    expect(sql).toContain("for update");
    expect(sql).toContain("'active', 'degraded'");
    expect(sql).toContain("p_lease_seconds < 30");
    expect(sql).toContain("p_lease_seconds > 300");
    expect(sql).toContain("clock_timestamp()");
  });

  it("α migration remains free of β lease RPC definitions", () => {
    const alpha = read(ALPHA_MIGRATION);
    expect(alpha).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.acquire_integration_credential_refresh_lock/i,
    );
    expect(alpha).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.rotate_integration_credential_set/i,
    );
    expect(alpha).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.release_integration_credential_refresh_lock/i,
    );
  });

  it("repository keeps server-only brands and NOT_YET_VERIFIED", () => {
    const repo = read(REPOSITORY);
    expect(repo.startsWith('import "server-only"')).toBe(true);
    expect(repo).toContain("CREDENTIAL_BINDING_AUTHORIZATION_STATUS");
    expect(repo).toContain("NOT_YET_VERIFIED");
    expect(repo).toContain("acquireIntegrationCredentialRefreshLock");
    expect(repo).toContain("rotateIntegrationCredentialsUnderLease");
    expect(repo).toContain("releaseIntegrationCredentialRefreshLock");
    expect(repo).toContain(
      "acquireAndDecryptIntegrationCredentialRefreshLock",
    );
    expect(repo).toContain("REFRESH_LOCK_LEASE_SECONDS_DEFAULT");
    expect(repo).not.toContain("createSupabaseAdminClient");
    expect(repo).not.toMatch(/NEXT_PUBLIC_/);
    expect(repo).not.toContain("oauth");
    expect(repo).not.toContain("shopify.com");
    expect(repo).not.toContain("readServerEnvironment");
    expect(repo).not.toMatch(/result\.error\.message/);

    const barrel = read("lib/integration-credentials/index.ts");
    expect(barrel).not.toContain("repository");
  });

  it("crypto-failure helper releases lease and never clears", () => {
    const repo = read(REPOSITORY);
    const start = repo.indexOf(
      "export async function acquireAndDecryptIntegrationCredentialRefreshLock",
    );
    const end = repo.indexOf(
      "export async function rotateIntegrationCredentialsUnderLease",
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fn = repo.slice(start, end);
    expect(fn).toContain("isCredentialCryptoError");
    expect(fn).toContain("releaseIntegrationCredentialRefreshLock");
    expect(fn).not.toContain("clear_integration_credentials");
    expect(fn).not.toContain("clearIntegrationCredentials");
  });
});
