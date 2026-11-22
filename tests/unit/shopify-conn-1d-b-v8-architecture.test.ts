import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assertTrustedCredentialScope,
  buildTrustedCredentialScope,
  CREDENTIAL_BINDING_AUTHORIZATION_STATUS,
  CredentialPersistenceError,
  resolveIntegrationOwnershipForTenant,
  type TrustedCredentialScope,
} from "@/lib/integration-credentials/repository";
import { resolveTenantContext } from "@/lib/tenancy/resolve-context";

const ROOT = process.cwd();

const BOOTSTRAP =
  "tests/sql/shopify-conn-1d-b-v8-membership-bootstrap.sql";
const ADVERSARIAL =
  "tests/sql/shopify-conn-1d-b-v8-role-membership-adversarial.sql";
const ROLLBACK =
  "tests/sql/shopify-conn-1d-b-v15-bootstrap-rollback.sql";
const LIVE =
  "tests/unit/shopify-conn-1d-b-v8-isolation.live.test.ts";
const M2_7 =
  "supabase/migrations/20261011153000_m2_7_rls_tenant_enforcement.sql";
const M1_5 =
  "supabase/migrations/20261009150000_m1_5_rls_tenant_enforcement.sql";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("SHOPIFY-CONN-1d-B V8 architecture", () => {
  it("keeps CREDENTIAL_BINDING_AUTHORIZATION_STATUS NOT_YET_VERIFIED", () => {
    expect(CREDENTIAL_BINDING_AUTHORIZATION_STATUS).toBe("NOT_YET_VERIFIED");
  });

  it("reuses verbatim M2.7 integrations_select_member and M1.5 membership policy", () => {
    const bootstrap = read(BOOTSTRAP);
    const m27 = read(M2_7);
    const m15 = read(M1_5);

    const normalize = (value: string) =>
      value.replace(/\s+/g, " ").trim().toLowerCase();

    const extractUsing = (source: string, policyName: string): string => {
      const start = source.indexOf(`create policy ${policyName}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const usingIdx = source.indexOf("using (", start);
      expect(usingIdx).toBeGreaterThan(start);
      const end = source.indexOf(");", usingIdx);
      expect(end).toBeGreaterThan(usingIdx);
      return normalize(source.slice(usingIdx, end + 2));
    };

    expect(extractUsing(bootstrap, "integrations_select_member")).toBe(
      extractUsing(m27, "integrations_select_member"),
    );
    expect(extractUsing(bootstrap, "organization_members_select_self")).toBe(
      extractUsing(m15, "organization_members_select_self"),
    );

    expect(bootstrap).toContain("grant select");
    expect(bootstrap).toContain("on table public.integrations");
    expect(bootstrap).toContain("to authenticated");
    expect(bootstrap).toContain("test-only");
    expect(bootstrap).not.toMatch(
      /create\s+table\s+public\.integration_credentials/i,
    );
  });

  it("adversarial SQL covers V8 matrix IDs and privilege vs RLS distinction", () => {
    const sql = read(ADVERSARIAL);
    for (const id of [
      "V8-G1",
      "V8-G2",
      "V8-A1",
      "V8-A2",
      "V8-A3",
      "V8-R1",
      "V8-R2",
      "V8-N1",
      "V8-X1",
      "V8-X2",
      "V8-S1",
      "V8-S2",
    ]) {
      expect(sql).toContain(id);
    }
    expect(sql).toContain("insufficient_privilege");
    expect(sql).toContain("privilege DENY");
    expect(sql).toContain("RLS zero-row");
    expect(sql).toContain("request.jwt.claim.sub");
    expect(sql).toContain("NOT real JWT");
    expect(sql).toContain("NOT hosted PostgREST");
    expect(sql).toContain("DELETE FROM public.organization_members");
    expect(sql).not.toMatch(/supabase\s+auth/i);
    expect(sql).not.toMatch(/http:\/\//i);
  });

  it("live harness enforces disposable port/datadir and applies only test SQL + tracked migrations", () => {
    const live = read(LIVE);
    expect(live).toContain("RUN_CONN1D_B_ISOLATED_LIVE");
    expect(live).toContain("55427");
    expect(live).toContain("55322");
    expect(live).toContain("54322");
    expect(live).toContain("restore-scratch");
    expect(live).toContain("/var/lib/postgresql/data");
    expect(live).toContain(BOOTSTRAP);
    expect(live).toContain(ADVERSARIAL);
    expect(live).toContain(ROLLBACK);
    expect(live).toContain(
      "20261121120000_shopify_conn_1a_integration_credential_vault.sql",
    );
    expect(live).toContain(
      "20261122120000_shopify_conn_1c_alpha_credential_persistence.sql",
    );
    expect(live).toContain(
      "20261122130000_shopify_conn_1c_beta_refresh_lease.sql",
    );
    expect(live).not.toContain("createSupabaseAdminClient");
    expect(live).not.toMatch(/oauth/i);
  });

  it("rollback drops only V8 bootstrap objects and asserts CONN RPCs remain", () => {
    const rollback = read(ROLLBACK);
    expect(rollback).toContain("drop table if exists public.organization_members");
    expect(rollback).toContain("drop policy if exists integrations_select_member");
    expect(rollback).toContain("load_integration_credential_envelope");
    expect(rollback).toContain("acquire_integration_credential_refresh_lock");
    expect(rollback).not.toMatch(/drop table.*integration_credentials/i);
    expect(rollback).toContain("V15 CONN-1d-B V8 bootstrap rollback PASS");
  });

  it("V8-S3: repository rejects fabricated/unbranded TrustedCredentialScope", () => {
    const fabricated = {
      organizationId: "c01d0b00-0000-4000-8000-000000000001",
      integrationId: "c01d0b00-0000-4000-8000-000000000003",
      provider: "shopify",
      storeId: null,
      source: "integration_binding",
    } as unknown as TrustedCredentialScope;

    expect(() =>
      assertTrustedCredentialScope(
        fabricated,
        "integration_credentials.load",
      ),
    ).toThrow(CredentialPersistenceError);

    expect(() =>
      buildTrustedCredentialScope(
        {
          userId: "c01d0b00-0000-4000-8000-0000000000a1",
          organizationId: "c01d0b00-0000-4000-8000-000000000001",
          role: "owner",
          storeId: null,
        },
        {
          integrationId: "c01d0b00-0000-4000-8000-000000000003",
          organizationId: "c01d0b00-0000-4000-8000-000000000001",
          storeId: null,
          provider: "shopify",
        } as never,
      ),
    ).toThrow(CredentialPersistenceError);
  });

  it("V8-T1: TenantContext fails closed without membership (revoked/non-member)", () => {
    expect(
      resolveTenantContext({
        identity: { userId: "user-1" },
        requested: { organizationId: "org-a" },
        memberships: [],
        stores: [],
      }),
    ).toEqual({
      ok: false,
      code: "membership_not_found",
    });
  });

  it("V8-S3 complement: cross-org lookup row is scope_mismatch", async () => {
    await expect(
      resolveIntegrationOwnershipForTenant({
        tenant: {
          userId: "c01d0b00-0000-4000-8000-0000000000a1",
          organizationId: "c01d0b00-0000-4000-8000-000000000001",
          role: "owner",
          storeId: null,
        },
        integrationId: "c01d0b00-0000-4000-8000-000000000003",
        lookup: {
          findByOrganizationAndId: async () => ({
            id: "c01d0b00-0000-4000-8000-000000000003",
            organizationId: "c01d0b00-0000-4000-8000-000000000011",
            storeId: null,
            provider: "shopify",
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "scope_mismatch" });
  });
});
