import { describe, expect, it } from "vitest";

import {
  resolveTenantContext,
} from "@/lib/tenancy/resolve-context";

const memberships = [
  {
    userId: "user-1",
    organizationId: "org-a",
    role: "owner" as const,
  },
  {
    userId: "user-1",
    organizationId: "org-b",
    role: "analyst" as const,
  },
  {
    userId: "user-2",
    organizationId: "org-c",
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

describe("StoreAgent tenant resolution", () => {
  it("fails closed for unauthenticated users", () => {
    expect(
      resolveTenantContext({
        identity: null,
        requested: {
          organizationId: "org-a",
        },
        memberships,
        stores,
      }),
    ).toEqual({
      ok: false,
      code: "unauthenticated",
    });
  });

  it("requires explicit organization selection", () => {
    expect(
      resolveTenantContext({
        identity: {
          userId: "user-1",
        },
        requested: null,
        memberships,
        stores,
      }),
    ).toEqual({
      ok: false,
      code: "organization_required",
    });
  });

  it("does not choose the first organization automatically", () => {
    const result = resolveTenantContext({
      identity: {
        userId: "user-1",
      },
      requested: {
        organizationId: "org-c",
      },
      memberships,
      stores,
    });

    expect(result).toEqual({
      ok: false,
      code: "membership_not_found",
    });
  });

  it("resolves role from trusted membership", () => {
    const result = resolveTenantContext({
      identity: {
        userId: "user-1",
      },
      requested: {
        organizationId: "org-b",
      },
      memberships,
      stores,
    });

    expect(result).toEqual({
      ok: true,
      context: {
        userId: "user-1",
        organizationId: "org-b",
        role: "analyst",
        storeId: null,
      },
    });
  });

  it("rejects an unknown requested store", () => {
    const result = resolveTenantContext({
      identity: {
        userId: "user-1",
      },
      requested: {
        organizationId: "org-a",
        storeId: "missing-store",
      },
      memberships,
      stores,
    });

    expect(result).toEqual({
      ok: false,
      code: "store_not_found",
    });
  });

  it("rejects a store owned by another organization", () => {
    const result = resolveTenantContext({
      identity: {
        userId: "user-1",
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

  it("resolves matching user organization and store", () => {
    const result = resolveTenantContext({
      identity: {
        userId: "user-1",
      },
      requested: {
        organizationId: "org-a",
        storeId: "store-a",
      },
      memberships,
      stores,
    });

    expect(result).toEqual({
      ok: true,
      context: {
        userId: "user-1",
        organizationId: "org-a",
        role: "owner",
        storeId: "store-a",
      },
    });
  });
});
