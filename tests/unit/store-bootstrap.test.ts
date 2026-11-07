import { describe, expect, it } from "vitest";

import {
  isOrganizationUuid,
  mapFirstStoreBootstrapError,
  parseFirstStoreBootstrapInput,
} from "@/lib/stores/bootstrap";

describe("first store bootstrap validation", () => {
  it("accepts normalized store fields", () => {
    expect(
      parseFirstStoreBootstrapInput({
        name: "  Harbor Downtown  ",
        currency: "usd",
        timezone: "America/New_York",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Harbor Downtown",
        currency: "USD",
        timezone: "America/New_York",
      },
    });
  });

  it("rejects blank names, bootstrap currency, and invalid timezones", () => {
    expect(
      parseFirstStoreBootstrapInput({
        name: "",
        currency: "USD",
        timezone: "UTC",
      }).ok,
    ).toBe(false);

    expect(
      parseFirstStoreBootstrapInput({
        name: "Harbor",
        currency: "XXX",
        timezone: "UTC",
      }).ok,
    ).toBe(false);

    expect(
      parseFirstStoreBootstrapInput({
        name: "Harbor",
        currency: "USD",
        timezone: "Not/AZone",
      }).ok,
    ).toBe(false);
  });

  it("maps trusted RPC failures to merchant-safe copy", () => {
    expect(
      mapFirstStoreBootstrapError("Organization already has a store."),
    ).toBe("This organization already has a store.");

    expect(
      mapFirstStoreBootstrapError("Store management requires owner or admin."),
    ).toBe("Only owners and admins can create the first store.");

    expect(isOrganizationUuid("not-a-uuid")).toBe(false);
    expect(
      isOrganizationUuid("11111111-1111-4111-8111-111111111111"),
    ).toBe(true);
  });
});
