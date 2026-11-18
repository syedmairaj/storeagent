import {
  describe,
  expect,
  it,
} from "vitest";

import {
  analyzeShopifyDuplicates,
  shopifyInventoryDuplicateIdentity,
  shopifyResourceDuplicateIdentity,
} from "@/lib/providers/shopify/duplicate-analysis";

import {
  normalizeShopifyInventoryLevelPayload,
} from "@/lib/providers/shopify/inventory-normalization";

import {
  normalizeShopifyLocationPayload,
} from "@/lib/providers/shopify/location-normalization";

import {
  SHOPIFY_RO1_RESOURCE_MAPPING,
  mapShopifyRo1OrderStatus,
} from "@/lib/providers/shopify/mapping";

import {
  normalizeShopifyOrderLineItemPayload,
  normalizeShopifyOrderPayload,
} from "@/lib/providers/shopify/order-normalization";

import {
  normalizeShopifyProductPayload,
  normalizeShopifyProductVariantPayload,
} from "@/lib/providers/shopify/product-normalization";

import {
  SHOPIFY_RO1_ADAPTER_VERSION,
} from "@/lib/providers/shopify/version";

import {
  shopifyRo1Adversarial,
  shopifyRo1DraftOrderSkipped,
  shopifyRo1InventoryLevelComplete,
  shopifyRo1InventoryLevelMissingAvailable,
  shopifyRo1InventoryLevelNoQuantities,
  shopifyRo1InventoryLevelZeroAvailable,
  shopifyRo1LocationMain,
  shopifyRo1OrderCancelled,
  shopifyRo1OrderLineItem,
  shopifyRo1OrderPaidFulfilled,
  shopifyRo1OrderPaidRestockedAmbiguous,
  shopifyRo1OrderPaidUnfulfilled,
  shopifyRo1OrderRefunded,
  shopifyRo1OrderUnknownFinancial,
  shopifyRo1ProductActive,
  shopifyRo1VariantWithSku,
  shopifyRo1VariantWithoutSku,
} from "@/tests/fixtures/shopify/ro1-v1/payloads";

describe("Shopify-RO.1 offline normalization", () => {
  it("exposes a frozen adapter version and resource mapping", () => {
    expect(SHOPIFY_RO1_ADAPTER_VERSION).toBe("shopify-ro.1-v1");
    expect(
      SHOPIFY_RO1_RESOURCE_MAPPING.adapterVersion,
    ).toBe(SHOPIFY_RO1_ADAPTER_VERSION);
    expect(
      SHOPIFY_RO1_RESOURCE_MAPPING.inventoryQuantityName.on_hand,
    ).toBe("onHandQuantity");
  });

  it("normalizes product identity with opaque Product GID provenance", () => {
    const result = normalizeShopifyProductPayload(
      shopifyRo1ProductActive,
    );

    expect(result.disposition).toBe("accepted");

    if (result.disposition !== "accepted") {
      return;
    }

    expect(result.externalId).toBe("gid://shopify/Product/1001");
    expect(result.adapterVersion).toBe(SHOPIFY_RO1_ADAPTER_VERSION);
    expect(result.canonical.title).toBe("Trail Bottle");
    expect(result.canonical.status).toBe("active");
    expect(result.canonical.brand).toBe("SnapStore");
    expect(result.canonical.provenance.sourceIds.productGid).toBe(
      "gid://shopify/Product/1001",
    );
  });

  it("normalizes variant identity with opaque GIDs and inventory item provenance", () => {
    const result = normalizeShopifyProductVariantPayload(
      shopifyRo1VariantWithSku,
    );

    expect(result.disposition).toBe("accepted");

    if (result.disposition !== "accepted") {
      return;
    }

    expect(result.externalId).toBe(
      "gid://shopify/ProductVariant/2001",
    );
    expect(result.externalParentId).toBe(
      "gid://shopify/Product/1001",
    );
    expect(result.canonical.sku).toBe("TB-500");
    expect(result.canonical.sellingPriceAmount).toBe("19.99");
    expect(result.canonical.currency).toBe("USD");
    expect(result.canonical.inventoryItemExternalId).toBe(
      "gid://shopify/InventoryItem/3001",
    );
    expect(result.canonical.costAmount).toBeNull();
  });

  it("skips SKU-less variants as valid out-of-scope records", () => {
    const result = normalizeShopifyProductVariantPayload(
      shopifyRo1VariantWithoutSku,
    );

    expect(result.disposition).toBe("skipped");

    if (result.disposition !== "skipped") {
      return;
    }

    expect(result.issues[0]?.code).toBe("UNSUPPORTED_RESOURCE");
  });

  it("normalizes location identity with opaque Location GID", () => {
    const result = normalizeShopifyLocationPayload(
      shopifyRo1LocationMain,
    );

    expect(result.disposition).toBe("accepted");

    if (result.disposition !== "accepted") {
      return;
    }

    expect(result.externalId).toBe("gid://shopify/Location/4001");
    expect(result.canonical.status).toBe("active");
  });

  it("preserves exact variant/inventory-item/location inventory identity", () => {
    const result = normalizeShopifyInventoryLevelPayload(
      shopifyRo1InventoryLevelComplete,
    );

    expect(result.disposition).toBe("accepted");

    if (result.disposition !== "accepted") {
      return;
    }

    expect(result.variantExternalId).toBe(
      "gid://shopify/ProductVariant/2001",
    );
    expect(result.locationExternalId).toBe(
      "gid://shopify/Location/4001",
    );
    expect(result.inventoryItemExternalId).toBe(
      "gid://shopify/InventoryItem/3001",
    );
    expect(result.canonical.onHandQuantity).toBe(100);
    expect(result.canonical.availableQuantity).toBe(80);
    expect(result.canonical.committedQuantity).toBe(20);
    expect(result.canonical.incomingQuantity).toBe(40);
    expect(result.canonical.incomingQuantityTrust).toBe(
      "provider_observed",
    );
    expect(result.canonical.observedAt).toBe(
      "2026-10-11T08:00:00.000Z",
    );
  });

  it("distinguishes missing, zero, and positive inventory quantities", () => {
    const zero = normalizeShopifyInventoryLevelPayload(
      shopifyRo1InventoryLevelZeroAvailable,
    );
    const missing = normalizeShopifyInventoryLevelPayload(
      shopifyRo1InventoryLevelMissingAvailable,
    );

    expect(zero.disposition).toBe("accepted");
    expect(missing.disposition).toBe("accepted");

    if (
      zero.disposition !== "accepted" ||
      missing.disposition !== "accepted"
    ) {
      return;
    }

    expect(zero.canonical.availableQuantity).toBe(0);
    expect(zero.canonical.onHandQuantity).toBe(0);
    expect(zero.canonical.incomingQuantityTrust).toBe(
      "provider_observed",
    );
    expect(missing.canonical.availableQuantity).toBeNull();
    expect(missing.canonical.onHandQuantity).toBe(12);
    expect(missing.canonical.incomingQuantity).toBeNull();
    expect(missing.canonical.incomingQuantityTrust).toBe(
      "provider_observed",
    );
  });

  it("marks Shopify incoming as provider-observed, never M0.4 trusted", () => {
    const result = normalizeShopifyInventoryLevelPayload(
      shopifyRo1InventoryLevelComplete,
    );

    expect(result.disposition).toBe("accepted");

    if (result.disposition !== "accepted") {
      return;
    }

    expect(result.canonical.incomingQuantity).toBe(40);
    expect(result.canonical.incomingQuantityTrust).toBe(
      "provider_observed",
    );
    expect(result.canonical.incomingQuantityTrust).not.toBe(
      "trusted_m0_4",
    );
  });

  it("quarantines inventory with no known quantities", () => {
    const result = normalizeShopifyInventoryLevelPayload(
      shopifyRo1InventoryLevelNoQuantities,
    );

    expect(result.disposition).toBe("quarantined");

    if (result.disposition !== "quarantined") {
      return;
    }

    expect(
      result.issues.some(
        (issue) => issue.code === "AMBIGUOUS_INVENTORY_SEMANTICS",
      ),
    ).toBe(true);
  });

  it("maps paid+fulfilled orders to completed without inventing refunds", () => {
    const result = normalizeShopifyOrderPayload(
      shopifyRo1OrderPaidFulfilled,
    );

    expect(result.disposition).toBe("accepted");

    if (result.disposition !== "accepted") {
      return;
    }

    expect(result.canonical.status).toBe("completed");
    expect(result.canonical.grossAmount).toBe("39.98");
    expect(result.canonical.orderedAt).toBe(
      "2026-10-10T10:00:00.000Z",
    );
    expect(result.canonical.financialStatus).toBe("PAID");
    expect(result.canonical.fulfillmentStatus).toBe("FULFILLED");
    expect(result.canonical.provenance.sourceIds.orderGid).toBe(
      "gid://shopify/Order/6001",
    );
  });

  it("maps paid+unfulfilled to open and cancelledAt to cancelled", () => {
    const open = normalizeShopifyOrderPayload(
      shopifyRo1OrderPaidUnfulfilled,
    );
    const cancelled = normalizeShopifyOrderPayload(
      shopifyRo1OrderCancelled,
    );
    const refunded = normalizeShopifyOrderPayload(
      shopifyRo1OrderRefunded,
    );

    expect(open.disposition).toBe("accepted");
    expect(cancelled.disposition).toBe("accepted");
    expect(refunded.disposition).toBe("accepted");

    if (
      open.disposition !== "accepted" ||
      cancelled.disposition !== "accepted" ||
      refunded.disposition !== "accepted"
    ) {
      return;
    }

    expect(open.canonical.status).toBe("open");
    expect(cancelled.canonical.status).toBe("cancelled");
    expect(refunded.canonical.status).toBe("refunded");
  });

  it("fails closed for unknown and ambiguous Shopify order statuses", () => {
    const unknown = normalizeShopifyOrderPayload(
      shopifyRo1OrderUnknownFinancial,
    );
    const ambiguous = normalizeShopifyOrderPayload(
      shopifyRo1OrderPaidRestockedAmbiguous,
    );

    expect(unknown.disposition).toBe("quarantined");
    expect(ambiguous.disposition).toBe("quarantined");

    expect(
      mapShopifyRo1OrderStatus({
        financialStatus: "PAID",
        fulfillmentStatus: "RESTOCKED",
        cancelledAt: null,
      }),
    ).toBeNull();
  });

  it("skips draft orders without treating them as demand", () => {
    const result = normalizeShopifyOrderPayload(
      shopifyRo1DraftOrderSkipped,
    );

    expect(result.disposition).toBe("skipped");
  });

  it("normalizes order line items with opaque LineItem and variant GIDs", () => {
    const result = normalizeShopifyOrderLineItemPayload(
      shopifyRo1OrderLineItem,
      "gid://shopify/Order/6001",
    );

    expect(result.disposition).toBe("accepted");

    if (result.disposition !== "accepted") {
      return;
    }

    expect(result.externalId).toBe("gid://shopify/LineItem/8001");
    expect(result.canonical.quantity).toBe(2);
    expect(result.canonical.unitPriceAmount).toBe("19.99");
    expect(result.canonical.unitCostAmount).toBeNull();
    expect(result.canonical.locationExternalId).toBe(
      "gid://shopify/Location/4001",
    );
  });

  it("quarantines adversarial malformed Shopify payloads", () => {
    expect(
      normalizeShopifyProductPayload(
        shopifyRo1Adversarial.productMissingId,
      ).disposition,
    ).toBe("quarantined");

    expect(
      normalizeShopifyProductPayload(
        shopifyRo1Adversarial.productNumericId,
      ).disposition,
    ).toBe("quarantined");

    expect(
      normalizeShopifyInventoryLevelPayload(
        shopifyRo1Adversarial.inventoryMissingLocation,
      ).disposition,
    ).toBe("quarantined");

    expect(
      normalizeShopifyInventoryLevelPayload(
        shopifyRo1Adversarial.inventoryFloatMoneyQuantity,
      ).disposition,
    ).toBe("quarantined");

    expect(
      normalizeShopifyOrderPayload(
        shopifyRo1Adversarial.orderFloatingMoney,
      ).disposition,
    ).toBe("quarantined");

    expect(
      normalizeShopifyOrderPayload(
        shopifyRo1Adversarial.orderTimezoneLess,
      ).disposition,
    ).toBe("quarantined");
  });

  it("classifies duplicate/replayed identities without double-counting", () => {
    const fingerprintCanonical = {
      onHandQuantity: 100,
      availableQuantity: 80,
    };

    const decisions = analyzeShopifyDuplicates<
      Record<string, string | number>
    >([
      {
        index: 0,
        identity: shopifyInventoryDuplicateIdentity({
          variantExternalId: "gid://shopify/ProductVariant/2001",
          locationExternalId: "gid://shopify/Location/4001",
          inventoryItemExternalId: "gid://shopify/InventoryItem/3001",
          observedAt: "2026-10-11T08:00:00.000Z",
        }),
        payload: fingerprintCanonical,
      },
      {
        index: 1,
        identity: shopifyInventoryDuplicateIdentity({
          variantExternalId: "gid://shopify/ProductVariant/2001",
          locationExternalId: "gid://shopify/Location/4001",
          inventoryItemExternalId: "gid://shopify/InventoryItem/3001",
          observedAt: "2026-10-11T08:00:00.000Z",
        }),
        payload: fingerprintCanonical,
      },
      {
        index: 2,
        identity: shopifyResourceDuplicateIdentity({
          resourceType: "order",
          externalId: "gid://shopify/Order/6001",
        }),
        payload: { status: "completed" },
      },
      {
        index: 3,
        identity: shopifyResourceDuplicateIdentity({
          resourceType: "order",
          externalId: "gid://shopify/Order/6001",
        }),
        payload: { status: "open" },
      },
    ]);

    expect(decisions.get(0)?.disposition).toBe("representative");
    expect(decisions.get(1)?.disposition).toBe("redundant");
    expect(decisions.get(2)?.disposition).toBe("conflict");
    expect(decisions.get(3)?.disposition).toBe("conflict");
  });

  it("is deterministic under replay of the same payload", () => {
    const first = normalizeShopifyInventoryLevelPayload(
      shopifyRo1InventoryLevelComplete,
    );
    const second = normalizeShopifyInventoryLevelPayload(
      shopifyRo1InventoryLevelComplete,
    );

    expect(first).toEqual(second);

    const orderFirst = normalizeShopifyOrderPayload(
      shopifyRo1OrderPaidFulfilled,
    );
    const orderSecond = normalizeShopifyOrderPayload(
      shopifyRo1OrderPaidFulfilled,
    );

    expect(orderFirst).toEqual(orderSecond);
  });
});
