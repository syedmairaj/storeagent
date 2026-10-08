import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildShopifyInventoryScopeKey,
  normalizeShopifyGid,
  normalizeShopifyInventoryScope,
  normalizeShopifyResourceGid,
} from "@/lib/providers/shopify/identity";

import {
  normalizeShopifyCursor,
} from "@/lib/providers/shopify/pagination";

import {
  mapShopifyOrderStatus,
  mapShopifyPurchaseOrderStatus,
} from "@/lib/providers/shopify/status";

describe("Shopify provider boundary", () => {
  it("preserves Shopify GIDs as opaque strings", () => {
    expect(
      normalizeShopifyGid(
        "  gid://shopify/ProductVariant/123  ",
      ),
    ).toBe(
      "gid://shopify/ProductVariant/123",
    );
  });

  it("rejects plain numeric Shopify IDs at the generic Shopify boundary", () => {
    expect(() =>
      normalizeShopifyGid(
        "123",
      ),
    ).toThrow(
      "Shopify identity must be a valid Shopify GID.",
    );
  });

  it("rejects non-Shopify GIDs", () => {
    expect(() =>
      normalizeShopifyGid(
        "gid://other/Product/123",
      ),
    ).toThrow(
      "Shopify identity must be a valid Shopify GID.",
    );
  });

  it("validates expected Shopify GraphQL resource type", () => {
    expect(
      normalizeShopifyResourceGid(
        "gid://shopify/ProductVariant/123",
        "ProductVariant",
      ),
    ).toBe(
      "gid://shopify/ProductVariant/123",
    );

    expect(() =>
      normalizeShopifyResourceGid(
        "gid://shopify/Product/123",
        "ProductVariant",
      ),
    ).toThrow(
      "Shopify GID must reference ProductVariant.",
    );
  });

  it("requires inventory to retain variant and location scope", () => {
    expect(
      normalizeShopifyInventoryScope(
        "gid://shopify/ProductVariant/123",
        "gid://shopify/Location/456",
      ),
    ).toEqual({
      variantGid:
        "gid://shopify/ProductVariant/123",
      locationGid:
        "gid://shopify/Location/456",
    });
  });

  it("produces different inventory scope keys for different locations", () => {
    const first =
      buildShopifyInventoryScopeKey({
        variantGid:
          "gid://shopify/ProductVariant/123",
        locationGid:
          "gid://shopify/Location/1",
      });

    const second =
      buildShopifyInventoryScopeKey({
        variantGid:
          "gid://shopify/ProductVariant/123",
        locationGid:
          "gid://shopify/Location/2",
      });

    expect(first).not.toBe(
      second,
    );
  });

  it("treats Shopify cursor as opaque transport provenance", () => {
    expect(
      normalizeShopifyCursor(
        "  opaque-cursor-value==  ",
      ),
    ).toBe(
      "opaque-cursor-value==",
    );
  });

  it("preserves absent Shopify cursor as null", () => {
    expect(
      normalizeShopifyCursor(
        null,
      ),
    ).toBeNull();

    expect(
      normalizeShopifyCursor(
        "   ",
      ),
    ).toBeNull();
  });

  it("does not guess Shopify order status without explicit mapping", () => {
    expect(
      mapShopifyOrderStatus(
        "PAID",
        {},
      ),
    ).toBe("unknown");
  });

  it("maps Shopify order status only when explicitly configured", () => {
    expect(
      mapShopifyOrderStatus(
        "CLOSED",
        {
          CLOSED:
            "completed",
        },
      ),
    ).toBe("completed");
  });

  it("does not guess Shopify purchase-order status without explicit mapping", () => {
    expect(
      mapShopifyPurchaseOrderStatus(
        "OPEN",
        {},
      ),
    ).toBe("unknown");
  });

  it("maps Shopify purchase-order status only when explicitly configured", () => {
    expect(
      mapShopifyPurchaseOrderStatus(
        "AUTHORIZED",
        {
          AUTHORIZED:
            "confirmed",
        },
      ),
    ).toBe("confirmed");
  });
});
