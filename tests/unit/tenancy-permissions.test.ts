import { describe, expect, it } from "vitest";

import {
  permissionsForRole,
  roleHasPermission,
} from "@/lib/tenancy/permissions";

describe("StoreAgent role permissions", () => {
  it("allows owner full organization authority", () => {
    expect(
      roleHasPermission("owner", "ownership.transfer"),
    ).toBe(true);

    expect(
      roleHasPermission("owner", "billing.manage"),
    ).toBe(true);

    expect(
      roleHasPermission("owner", "actions.decide"),
    ).toBe(true);
  });

  it("prevents admin ownership transfer", () => {
    expect(
      roleHasPermission("admin", "ownership.transfer"),
    ).toBe(false);

    expect(
      roleHasPermission("admin", "organization.delete"),
    ).toBe(false);
  });

  it("keeps analyst decision workflow read-only", () => {
    expect(
      roleHasPermission("analyst", "actions.read"),
    ).toBe(true);

    expect(
      roleHasPermission("analyst", "actions.decide"),
    ).toBe(false);

    expect(
      roleHasPermission("analyst", "suppliers.manage"),
    ).toBe(false);
  });

  it("allows operator inventory-action decisions without administration", () => {
    expect(
      roleHasPermission("operator", "actions.decide"),
    ).toBe(true);

    expect(
      roleHasPermission("operator", "members.manage"),
    ).toBe(false);

    expect(
      roleHasPermission("operator", "billing.manage"),
    ).toBe(false);

    expect(
      roleHasPermission("operator", "integrations.manage"),
    ).toBe(false);
  });

  it("keeps role permission sets stable and read-only to callers", () => {
    const ownerPermissions = permissionsForRole("owner");
    const analystPermissions = permissionsForRole("analyst");

    expect(ownerPermissions.has("organization.delete")).toBe(true);
    expect(analystPermissions.has("organization.delete")).toBe(false);
  });
});
