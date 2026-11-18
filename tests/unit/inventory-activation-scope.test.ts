import { describe, expect, it } from "vitest";

import {
  isAuthorizedActivationPlace,
  resolveMerchantActivationScope,
} from "@/lib/inventory-readiness/activation-scope";

const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const LOC_A = "33333333-3333-4333-8333-333333333333";
const LOC_B = "44444444-4444-4444-8444-444444444444";
const LOC_UNAUTHORIZED = "55555555-5555-4555-8555-555555555555";

describe("resolveMerchantActivationScope", () => {
  it("resolves when inventory has exactly one store/location", () => {
    const result = resolveMerchantActivationScope({
      inventoryPlaces: [
        { storeId: STORE_A, locationId: LOC_A, storeName: "Main" },
        { storeId: STORE_A, locationId: LOC_A, locationName: "Front" },
      ],
    });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.scope.storeId).toBe(STORE_A);
      expect(result.scope.locationId).toBe(LOC_A);
      expect(result.reason).toBe("unique_inventory_place");
    }
  });

  it("fails closed when multiple inventory places exist", () => {
    const result = resolveMerchantActivationScope({
      inventoryPlaces: [
        { storeId: STORE_A, locationId: LOC_A },
        { storeId: STORE_B, locationId: LOC_B },
      ],
    });
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.places).toHaveLength(2);
      expect(result.message).toMatch(/will not guess/i);
    }
  });

  it("bootstraps a unique organization place when inventory is empty", () => {
    const result = resolveMerchantActivationScope({
      inventoryPlaces: [],
      organizationPlaces: [{ storeId: STORE_A, locationId: LOC_A }],
    });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.reason).toBe("unique_organization_place");
    }
  });

  it("fails closed when organization places are ambiguous and inventory is empty", () => {
    const result = resolveMerchantActivationScope({
      inventoryPlaces: [],
      organizationPlaces: [
        { storeId: STORE_A, locationId: LOC_A },
        { storeId: STORE_A, locationId: LOC_B },
      ],
    });
    expect(result.status).toBe("ambiguous");
  });

  it("returns missing when no authorized place exists", () => {
    const result = resolveMerchantActivationScope({
      inventoryPlaces: [],
      organizationPlaces: [],
    });
    expect(result.status).toBe("missing");
  });

  it("ignores non-uuid place ids", () => {
    const result = resolveMerchantActivationScope({
      inventoryPlaces: [{ storeId: "not-a-uuid", locationId: "also-bad" }],
      organizationPlaces: [{ storeId: STORE_A, locationId: LOC_A }],
    });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.reason).toBe("unique_organization_place");
    }
  });
});

describe("isAuthorizedActivationPlace", () => {
  it("authorizes only places present in the authorized set", () => {
    const authorized = [
      { storeId: STORE_A, locationId: LOC_A },
      { storeId: STORE_B, locationId: LOC_B },
    ];
    expect(
      isAuthorizedActivationPlace({
        candidate: { storeId: STORE_A, locationId: LOC_A },
        authorizedPlaces: authorized,
      }),
    ).toBe(true);
    expect(
      isAuthorizedActivationPlace({
        candidate: { storeId: STORE_A, locationId: LOC_UNAUTHORIZED },
        authorizedPlaces: authorized,
      }),
    ).toBe(false);
    expect(
      isAuthorizedActivationPlace({
        candidate: null,
        authorizedPlaces: authorized,
      }),
    ).toBe(false);
  });
});
