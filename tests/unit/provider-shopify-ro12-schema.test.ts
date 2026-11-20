import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SHOPIFY_ADMIN_API_VERSION,
} from "@/lib/providers/shopify/api-version";

import {
  normalizeShopifyInventoryLevelPayload,
} from "@/lib/providers/shopify/inventory-normalization";

import {
  SHOPIFY_RO1_RESOURCE_MAPPING,
  mapShopifyRo1OrderStatus,
} from "@/lib/providers/shopify/mapping";

import {
  assessShopifyConnectionCompleteness,
  describeShopifyRo2NestedIncompletenessGate,
  mayAcceptAsCompleteShopifySyncInput,
  SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS,
} from "@/lib/providers/shopify/nested-completeness";

import {
  normalizeShopifyOrderLineItemPayload,
  normalizeShopifyOrderPayload,
  resolveShopifyOrderLineItemLocations,
} from "@/lib/providers/shopify/order-normalization";

import {
  normalizeShopifyProductVariantPayload,
} from "@/lib/providers/shopify/product-normalization";

import {
  SHOPIFY_RO1_ADAPTER_VERSION,
} from "@/lib/providers/shopify/version";

import {
  SHOPIFY_RO1_FIXTURES_API_VERSION_CERTIFIED,
  SHOPIFY_RO1_FIXTURES_PINNED_ADMIN_API_VERSION,
  SHOPIFY_RO1_FIXTURE_VERSION,
  SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED,
  shopifyRo1Adversarial,
  shopifyRo1FulfillmentOrderAssignedLocationOnly,
  shopifyRo1OrderExpiredFinancial,
  shopifyRo1OrderFulfillmentNotRequired,
  shopifyRo1OrderFulfillmentOrders,
  shopifyRo1OrderFulfillmentOrdersTruncated,
  shopifyRo1OrderLineItem,
  shopifyRo1OrderRequestDeclined,
  shopifyRo1ShopCurrencyCode,
  shopifyRo1VariantWithSku,
} from "@/tests/fixtures/shopify/ro1-v1/payloads";

describe("Shopify-RO.1.2 Admin API 2026-10 schema compatibility", () => {
  it("pins adapter + fixture versions to RO.1.2 against Admin API 2026-10", () => {
    expect(SHOPIFY_RO1_ADAPTER_VERSION).toBe("shopify-ro.1.2-v1");
    expect(SHOPIFY_RO1_FIXTURE_VERSION).toBe("shopify-ro.1.2-v1");
    expect(SHOPIFY_RO1_FIXTURES_PINNED_ADMIN_API_VERSION).toBe(
      SHOPIFY_ADMIN_API_VERSION,
    );
    expect(SHOPIFY_ADMIN_API_VERSION).toBe("2026-10");
    expect(SHOPIFY_RO1_FIXTURES_API_VERSION_CERTIFIED).toBe(true);
    expect(SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED).toBe(
      false,
    );
    expect(SHOPIFY_RO1_RESOURCE_MAPPING.adapterVersion).toBe(
      SHOPIFY_RO1_ADAPTER_VERSION,
    );
  });

  it("quarantines EXPIRED, FULFILLMENT_NOT_REQUIRED, and REQUEST_DECLINED conservatively", () => {
    expect(
      SHOPIFY_RO1_RESOURCE_MAPPING.knownFinancialStatuses,
    ).toContain("EXPIRED");
    expect(
      SHOPIFY_RO1_RESOURCE_MAPPING.knownFulfillmentStatuses,
    ).toContain("FULFILLMENT_NOT_REQUIRED");
    expect(
      SHOPIFY_RO1_RESOURCE_MAPPING.knownFulfillmentStatuses,
    ).toContain("REQUEST_DECLINED");

    expect(
      mapShopifyRo1OrderStatus({
        financialStatus: "EXPIRED",
        fulfillmentStatus: "UNFULFILLED",
        cancelledAt: null,
      }),
    ).toBeNull();

    expect(
      mapShopifyRo1OrderStatus({
        financialStatus: "PAID",
        fulfillmentStatus: "FULFILLMENT_NOT_REQUIRED",
        cancelledAt: null,
      }),
    ).toBeNull();

    expect(
      mapShopifyRo1OrderStatus({
        financialStatus: "PAID",
        fulfillmentStatus: "REQUEST_DECLINED",
        cancelledAt: null,
      }),
    ).toBeNull();

    expect(
      normalizeShopifyOrderPayload(shopifyRo1OrderExpiredFinancial)
        .disposition,
    ).toBe("quarantined");
    expect(
      normalizeShopifyOrderPayload(
        shopifyRo1OrderFulfillmentNotRequired,
      ).disposition,
    ).toBe("quarantined");
    expect(
      normalizeShopifyOrderPayload(shopifyRo1OrderRequestDeclined)
        .disposition,
    ).toBe("quarantined");
  });

  it("never infers line location from assignedLocation alone", () => {
    const resolution = resolveShopifyOrderLineItemLocations({
      fulfillmentOrders: shopifyRo1FulfillmentOrderAssignedLocationOnly,
      nestedCompletenessAttestation: { nestedChildrenComplete: true },
    });

    expect(resolution.locationsByLineItemGid.size).toBe(0);
    expect(
      resolution.issues.some((issue) =>
        /not inferred for sales lines/i.test(issue.message),
      ),
    ).toBe(true);
  });

  it("rejects invented LineItem.location and fabricated variant currency", () => {
    expect(
      normalizeShopifyOrderLineItemPayload(
        shopifyRo1Adversarial.orderLineItemWithInventedLocation,
        "gid://shopify/Order/6001",
      ).disposition,
    ).toBe("quarantined");

    expect(
      normalizeShopifyProductVariantPayload(shopifyRo1VariantWithSku)
        .disposition,
    ).toBe("quarantined");

    expect(
      normalizeShopifyProductVariantPayload(
        shopifyRo1Adversarial.variantWithFabricatedCurrency,
        { shopCurrencyCode: shopifyRo1ShopCurrencyCode },
      ).disposition,
    ).toBe("quarantined");
  });

  it("requires InventoryItem.variants connection with single-variant cardinality", () => {
    expect(
      normalizeShopifyInventoryLevelPayload(
        shopifyRo1Adversarial.inventoryDeprecatedSingularVariant,
      ).disposition,
    ).toBe("quarantined");

    expect(
      normalizeShopifyInventoryLevelPayload(
        shopifyRo1Adversarial.inventoryMultipleVariants,
      ).disposition,
    ).toBe("quarantined");
  });

  it("refuses truncated nested FO pages as complete sync input", () => {
    const truncated = assessShopifyConnectionCompleteness(
      shopifyRo1OrderFulfillmentOrdersTruncated,
      null,
    );
    expect(truncated.kind).toBe("incomplete");
    expect(truncated.acceptableAsCompleteSyncInput).toBe(false);

    const attestedWithoutPageInfo = assessShopifyConnectionCompleteness(
      shopifyRo1OrderFulfillmentOrders,
      { nestedChildrenComplete: true },
    );
    expect(attestedWithoutPageInfo.acceptableAsCompleteSyncInput).toBe(
      true,
    );

    const unattested = assessShopifyConnectionCompleteness(
      shopifyRo1OrderFulfillmentOrders,
      null,
    );
    expect(unattested.acceptableAsCompleteSyncInput).toBe(false);

    expect(
      mayAcceptAsCompleteShopifySyncInput({
        topLevelHasNextPage: false,
        nestedAssessments: [truncated],
      }),
    ).toBe(false);

    expect(
      mayAcceptAsCompleteShopifySyncInput({
        topLevelHasNextPage: false,
        nestedAssessments: [attestedWithoutPageInfo],
      }),
    ).toBe(true);

    expect(
      mayAcceptAsCompleteShopifySyncInput({
        topLevelHasNextPage: true,
        nestedAssessments: [attestedWithoutPageInfo],
      }),
    ).toBe(false);

    const truncatedResolution = resolveShopifyOrderLineItemLocations({
      fulfillmentOrders: shopifyRo1OrderFulfillmentOrdersTruncated,
    });
    expect(truncatedResolution.acceptableAsCompleteSyncInput).toBe(false);

    expect(SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS.orderLineItems.first).toBe(
      100,
    );
    expect(describeShopifyRo2NestedIncompletenessGate()).toMatch(
      /incomplete sync/i,
    );
  });

  it("keeps FO-linked location opaque and provider-observed incoming trust intact", () => {
    const locations = resolveShopifyOrderLineItemLocations({
      fulfillmentOrders: shopifyRo1OrderFulfillmentOrders,
      nestedCompletenessAttestation: { nestedChildrenComplete: true },
    });

    const line = normalizeShopifyOrderLineItemPayload(
      shopifyRo1OrderLineItem,
      "gid://shopify/Order/6001",
      {
        resolvedLocationExternalId: locations.locationsByLineItemGid.get(
          "gid://shopify/LineItem/8001",
        ),
      },
    );

    expect(line.disposition).toBe("accepted");
    if (line.disposition !== "accepted") {
      return;
    }

    expect(line.canonical.locationExternalId).toBe(
      "gid://shopify/Location/4001",
    );
    expect(line.canonical.provenance.sourceIds.locationGid).toBe(
      "gid://shopify/Location/4001",
    );
    expect(line.adapterVersion).toBe("shopify-ro.1.2-v1");
  });
});
