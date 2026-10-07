import { describe, expect, it } from "vitest";

import type {
  InventoryAction,
  InventoryActionEvidence,
  ProductVariant,
  ProviderBinding,
  SkuForecast,
} from "@/lib/commerce-domain/types";

describe("canonical commerce domain", () => {
  it("models provider identity separately from canonical identity", () => {
    const binding: ProviderBinding = {
      id: "binding-1",
      organizationId: "org-1",
      integrationId: "integration-1",
      provider: "shopify",
      resourceType: "product_variant",
      canonicalEntityId: "variant-1",
      externalId: "gid://shopify/ProductVariant/123",
      externalParentId: null,
      sourceMetadata: null,
      createdAt: "2026-10-07T00:00:00Z",
      updatedAt: "2026-10-07T00:00:00Z",
    };

    expect(binding.externalId).not.toBe(binding.canonicalEntityId);
  });

  it("allows unknown commercial data to remain null", () => {
    const variant: ProductVariant = {
      id: "variant-1",
      organizationId: "org-1",
      storeId: "store-1",
      productId: "product-1",
      sku: "SKU-001",
      barcode: null,
      title: null,
      status: "active",
      costAmount: null,
      sellingPriceAmount: null,
      currency: null,
      createdAt: "2026-10-07T00:00:00Z",
      updatedAt: "2026-10-07T00:00:00Z",
    };

    expect(variant.costAmount).toBeNull();
  });

  it("keeps forecast values outside AI ownership", () => {
    const forecast: SkuForecast = {
      id: "forecast-1",
      organizationId: "org-1",
      storeId: "store-1",
      locationId: null,
      variantId: "variant-1",
      forecastRunId: "run-1",
      horizonStart: "2026-10-08",
      horizonEnd: "2026-11-07",
      expectedDemandUnits: 24,
      lowerDemandUnits: 18,
      upperDemandUnits: 31,
      confidence: "medium",
      dataSufficiency: "sufficient",
      qualityMetadata: null,
      createdAt: "2026-10-07T00:00:00Z",
    };

    expect(forecast.expectedDemandUnits).toBe(24);
  });

  it("preserves original recommendation evidence separately from merchant events", () => {
    const evidence: InventoryActionEvidence = {
      availableQuantity: 8,
      incomingQuantity: 0,
      demandVelocity: 2,
      daysOfStock: 4,
      leadTimeDays: 7,
      safetyStockUnits: 4,
      reorderPointUnits: 18,
      targetStockUnits: 32,
      inventoryAgeDays: 20,
      forecastExpectedDemandUnits: 28,
      dataQualityScore: 95,
      reasonCodes: ["BELOW_REORDER_POINT"],
    };

    const action: InventoryAction = {
      id: "action-1",
      organizationId: "org-1",
      storeId: "store-1",
      locationId: "location-1",
      variantId: "variant-1",
      actionType: "REORDER",
      priority: "high",
      status: "new",
      recommendedQuantity: 24,
      recommendedActionDate: "2026-10-07",
      confidence: "high",
      confidenceReasonCodes: ["SUFFICIENT_HISTORY"],
      estimatedStockoutDate: "2026-10-11",
      estimatedCashAtRiskAmount: null,
      estimatedRevenueAtRiskAmount: null,
      currency: null,
      evidenceSnapshot: evidence,
      forecastRunId: "run-1",
      algorithmVersion: "decision-v1",
      createdAt: "2026-10-07T00:00:00Z",
      expiresAt: null,
      supersededByActionId: null,
    };

    expect(action.evidenceSnapshot.reorderPointUnits).toBe(18);
    expect(action.recommendedQuantity).toBe(24);
  });
});
