import { describe, expect, it } from "vitest";

import {
  resolveTenantContext,
} from "@/lib/tenancy/resolve-context";

import {
  providerBindingKey,
} from "@/lib/providers/bindings";

import {
  roleHasPermission,
} from "@/lib/tenancy/permissions";

import {
  isSafeServiceRoleEnvironmentVariable,
  serviceOperationHasTrustedScope,
} from "@/lib/tenancy/service-role-policy";

const memberships = [
  {
    userId: "attacker-user",
    organizationId: "org-a",
    role: "operator" as const,
  },
  {
    userId: "other-user",
    organizationId: "org-b",
    role: "owner" as const,
  },
];

const stores = [
  {
    id: "store-a",
    organizationId: "org-a",
  },
  {
    id: "store-b",
    organizationId: "org-b",
  },
];

describe("StoreAgent cross-organization threat model", () => {
  it("blocks malicious organization selection", () => {
    const result = resolveTenantContext({
      identity: {
        userId: "attacker-user",
      },
      requested: {
        organizationId: "org-b",
      },
      memberships,
      stores,
    });

    expect(result).toEqual({
      ok: false,
      code: "membership_not_found",
    });
  });

  it("blocks foreign store selection inside an authorized organization request", () => {
    const result = resolveTenantContext({
      identity: {
        userId: "attacker-user",
      },
      requested: {
        organizationId: "org-a",
        storeId: "store-b",
      },
      memberships,
      stores,
    });

    expect(result).toEqual({
      ok: false,
      code: "store_wrong_organization",
    });
  });

  it("does not reuse another user's valid membership", () => {
    const result = resolveTenantContext({
      identity: {
        userId: "attacker-user",
      },
      requested: {
        organizationId: "org-b",
      },
      memberships,
      stores,
    });

    expect(result.ok).toBe(false);
  });

  it("keeps identical provider external IDs separate across integrations", () => {
    const orgAProviderIdentity = providerBindingKey({
      integrationId: "integration-org-a",
      resourceType: "product_variant",
      externalId: "123",
    });

    const orgBProviderIdentity = providerBindingKey({
      integrationId: "integration-org-b",
      resourceType: "product_variant",
      externalId: "123",
    });

    expect(orgAProviderIdentity).not.toBe(orgBProviderIdentity);
  });

  it("does not allow operator role to escalate account administration", () => {
    expect(
      roleHasPermission("operator", "members.manage"),
    ).toBe(false);

    expect(
      roleHasPermission("operator", "ownership.transfer"),
    ).toBe(false);

    expect(
      roleHasPermission("operator", "organization.delete"),
    ).toBe(false);
  });

  it("rejects service operations without trusted tenant scope", () => {
    expect(
      serviceOperationHasTrustedScope({
        operation: "export_inventory",
        scope: null,
      }),
    ).toBe(false);
  });

  it("forbids browser-exposable service-role environment variables", () => {
    expect(
      isSafeServiceRoleEnvironmentVariable(
        "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
      ),
    ).toBe(false);
  });
});
