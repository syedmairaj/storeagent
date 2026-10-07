import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("StoreAgent tenancy architecture", () => {
  it("keeps tenant resolution independent from UI and AI frameworks", () => {
    const source = read("lib/tenancy/resolve-context.ts");

    const forbidden = [
      "react",
      "next/",
      "openai",
      "@anthropic",
      "@google/generative-ai",
      "@shopify",
      "stripe",
    ];

    for (const value of forbidden) {
      expect(
        source.includes(value),
        `tenant resolution must not depend on ${value}`,
      ).toBe(false);
    }
  });

  it("requires explicit organization selection", () => {
    const source = read("lib/tenancy/resolve-context.ts");

    expect(source).toContain('"organization_required"');
    expect(source).not.toContain(".at(0)");
    expect(source).not.toContain("memberships[0]");
  });

  it("requires membership to match both user and organization", () => {
    const source = read("lib/tenancy/resolve-context.ts");

    expect(source).toContain(
      "candidate.userId === identity.userId",
    );

    expect(source).toContain(
      "candidate.organizationId === requested.organizationId",
    );
  });

  it("validates requested store against requested organization", () => {
    const source = read("lib/tenancy/resolve-context.ts");

    expect(source).toContain(
      "store.organizationId !== requested.organizationId",
    );

    expect(source).toContain('"store_wrong_organization"');
  });

  it("keeps role authority in trusted permission code", () => {
    const source = read("lib/tenancy/permissions.ts");

    expect(source).toContain("ROLE_PERMISSIONS");
    expect(source).toContain("roleHasPermission");

    expect(source).not.toContain("request.role");
    expect(source).not.toContain("clientRole");
  });

  it("forbids public service-role secret naming", () => {
    const source = read("lib/tenancy/service-role-policy.ts");

    expect(source).toContain('startsWith("NEXT_PUBLIC_")');
    expect(source).toContain(
      "isSafeServiceRoleEnvironmentVariable",
    );
  });

  it("requires trusted scope for privileged service operations", () => {
    const source = read("lib/tenancy/service-role-policy.ts");

    expect(source).toContain(
      "serviceOperationHasTrustedScope",
    );

    expect(source).toContain(
      "assertServiceOperationScope",
    );
  });

  it("keeps tenant-owned operational access organization-scoped in documentation", () => {
    const tenancy = read("docs/TENANCY_MODEL.md");
    const rls = read("docs/RLS_ARCHITECTURE.md");

    expect(tenancy).toContain(
      "Organization is the top-level tenant/account boundary.",
    );

    expect(rls).toContain(
      "organization_members is authoritative for tenant membership.",
    );

    expect(rls).toContain(
      "Tenant-owned tables must be RLS-enabled.",
    );
  });
});
