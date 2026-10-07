import { describe, expect, it } from "vitest";

import {
  belongsToSameOrganization,
  belongsToSameStore,
  hasValidSupplierConstraints,
  isValidNonNegativeQuantity,
  isValidPositiveQuantity,
  isVariantConsistentWithProduct,
} from "@/lib/commerce-domain/invariants";

describe("commerce domain invariants", () => {
  it("rejects cross-organization relationships", () => {
    expect(belongsToSameOrganization("org-a", "org-b")).toBe(false);
  });

  it("rejects cross-store relationships", () => {
    expect(belongsToSameStore("store-a", "store-b")).toBe(false);
  });

  it("requires variant/product organization and store consistency", () => {
    const product = {
      id: "product-1",
      organizationId: "org-1",
      storeId: "store-1",
    };

    const validVariant = {
      productId: "product-1",
      organizationId: "org-1",
      storeId: "store-1",
    };

    const crossStoreVariant = {
      productId: "product-1",
      organizationId: "org-1",
      storeId: "store-2",
    };

    expect(
      isVariantConsistentWithProduct(validVariant, product),
    ).toBe(true);

    expect(
      isVariantConsistentWithProduct(crossStoreVariant, product),
    ).toBe(false);
  });

  it("distinguishes positive quantities from zero", () => {
    expect(isValidPositiveQuantity(1)).toBe(true);
    expect(isValidPositiveQuantity(0)).toBe(false);
    expect(isValidPositiveQuantity(-1)).toBe(false);
  });

  it("allows zero where non-negative quantities are valid", () => {
    expect(isValidNonNegativeQuantity(0)).toBe(true);
    expect(isValidNonNegativeQuantity(3)).toBe(true);
    expect(isValidNonNegativeQuantity(-1)).toBe(false);
  });

  it("rejects invalid supplier constraints", () => {
    expect(
      hasValidSupplierConstraints({
        minimumOrderQuantity: 12,
        packSize: 6,
        leadTimeDays: 7,
      }),
    ).toBe(true);

    expect(
      hasValidSupplierConstraints({
        minimumOrderQuantity: 0,
        packSize: 6,
        leadTimeDays: 7,
      }),
    ).toBe(false);

    expect(
      hasValidSupplierConstraints({
        minimumOrderQuantity: 12,
        packSize: -1,
        leadTimeDays: 7,
      }),
    ).toBe(false);

    expect(
      hasValidSupplierConstraints({
        minimumOrderQuantity: 12,
        packSize: 6,
        leadTimeDays: -3,
      }),
    ).toBe(false);
  });
});
