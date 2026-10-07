import { describe, expect, it } from "vitest";

import {
  membershipAuthorizesOrganization,
  tenantContextMatchesOrganization,
  tenantContextMatchesRequestedScope,
} from "@/lib/tenancy/guards";

describe("StoreAgent tenancy guards", () => {
  it("requires user and organization to match membership", () => {
    const membership = {
      userId: "user-1",
      organizationId: "org-1",
      role: "owner" as const,
    };

    expect(
      membershipAuthorizesOrganization(
        membership,
        "user-1",
        "org-1",
      ),
    ).toBe(true);

    expect(
      membershipAuthorizesOrganization(
        membership,
        "user-2",
        "org-1",
      ),
    ).toBe(false);

    expect(
      membershipAuthorizesOrganization(
        membership,
        "user-1",
        "org-2",
      ),
    ).toBe(false);
  });

  it("rejects cross-organization tenant context", () => {
    const context = {
      userId: "user-1",
      organizationId: "org-a",
      role: "admin" as const,
      storeId: null,
    };

    expect(
      tenantContextMatchesOrganization(context, "org-a"),
    ).toBe(true);

    expect(
      tenantContextMatchesOrganization(context, "org-b"),
    ).toBe(false);
  });

  it("accepts an organization request when no store is selected", () => {
    const context = {
      userId: "user-1",
      organizationId: "org-a",
      role: "analyst" as const,
      storeId: null,
    };

    expect(
      tenantContextMatchesRequestedScope(context, {
        organizationId: "org-a",
      }),
    ).toBe(true);
  });

  it("rejects a different organization even when store IDs are absent", () => {
    const context = {
      userId: "user-1",
      organizationId: "org-a",
      role: "analyst" as const,
      storeId: null,
    };

    expect(
      tenantContextMatchesRequestedScope(context, {
        organizationId: "org-b",
      }),
    ).toBe(false);
  });

  it("rejects conflicting selected store scope", () => {
    const context = {
      userId: "user-1",
      organizationId: "org-a",
      role: "operator" as const,
      storeId: "store-a",
    };

    expect(
      tenantContextMatchesRequestedScope(context, {
        organizationId: "org-a",
        storeId: "store-b",
      }),
    ).toBe(false);
  });

  it("accepts matching organization and selected store", () => {
    const context = {
      userId: "user-1",
      organizationId: "org-a",
      role: "operator" as const,
      storeId: "store-a",
    };

    expect(
      tenantContextMatchesRequestedScope(context, {
        organizationId: "org-a",
        storeId: "store-a",
      }),
    ).toBe(true);
  });
});
