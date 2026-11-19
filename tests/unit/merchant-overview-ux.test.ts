import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  HIGH_COVER_REVIEW_DAYS,
  LOW_COVER_ATTENTION_DAYS,
  parseInventoryAttentionFilter,
  summarizeMerchantAttention,
} from "@/lib/inventory-intelligence/attention";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import { assessMerchantDecisionReadiness } from "@/lib/inventory-readiness/assess";
import { buildMerchantOverviewPresentation } from "@/lib/inventory-readiness/overview-presentation";
import type { EvidencePresence } from "@/lib/inventory-readiness/types";
import { EMPTY_MERCHANT_PLANNING_INPUTS } from "@/lib/planning-inputs/types";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function presence(
  partial: Omit<
    EvidencePresence,
    | "planning"
    | "trustedIncoming"
    | "hasCurrentDayInventoryObservation"
    | "hasCurrentDayMetrics"
    | "primaryAsOfMetricDate"
    | "inventoryPlaceFreshnessKind"
  > & {
    planning?: EvidencePresence["planning"];
    hasCurrentDayInventoryObservation?: boolean;
    hasCurrentDayMetrics?: boolean;
    primaryAsOfMetricDate?: string | null;
  },
): EvidencePresence {
  const hasCurrentDayInventoryObservation =
    partial.hasCurrentDayInventoryObservation ??
    partial.knownAvailableSkuCount > 0;
  return {
    ...partial,
    hasCurrentDayInventoryObservation,
    inventoryPlaceFreshnessKind:
      partial.knownAvailableSkuCount <= 0
        ? "empty"
        : hasCurrentDayInventoryObservation
          ? "all_current"
          : "all_stale",
    hasCurrentDayMetrics:
      partial.hasCurrentDayMetrics ?? partial.grainAlignedKnownDemandCount > 0,
    primaryAsOfMetricDate:
      partial.primaryAsOfMetricDate === undefined
        ? "2026-11-18"
        : partial.primaryAsOfMetricDate,
    planning: partial.planning ?? { ...EMPTY_MERCHANT_PLANNING_INPUTS },
    trustedIncoming: {
      hasPurchaseOrderItemRows: false,
      evidenceCompleteStoreCount: 0,
      knownIncomingGrainCount: 0,
      knownZeroGrainCount: 0,
      positiveIncomingGrainCount: 0,
    },
  };
}

function row(
  overrides: Partial<MerchantInventoryIntelligenceRow> & {
    grainKey: string;
    coverStatus: MerchantInventoryIntelligenceRow["coverStatus"];
  },
): MerchantInventoryIntelligenceRow {
  return {
    snapshotId: "s",
    organizationId: "o",
    storeId: "st",
    locationId: "l",
    variantId: "v",
    sku: overrides.sku ?? overrides.grainKey,
    productTitle: null,
    storeName: "Main",
    locationName: "Front",
    availableQuantity: 10,
    onHandQuantity: 10,
    observedAt: "2026-11-18T00:00:00.000Z",
    asOfMetricDate: "2026-11-18",
    metricDate: "2026-11-18",
    salesVelocity30d: 1,
    salesVelocity30dReasonCode: null,
    eligibleDays30d: 20,
    coverageRatio30d: 1,
    daysOfStock: 20,
    daysOfStockReasonCode: null,
    evidenceLabel: "x",
    ...overrides,
  };
}

describe("UX-INV-1a merchant overview honesty", () => {
  it("never claims sales/planning are missing when readiness marks them available", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: presence({
        inventorySnapshotCount: 20,
        distinctSkuCount: 20,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 20,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 12,
        hasPendingMetricWork: false,
        planning: {
          leadTimeDays: 7,
          safetyStockDays: 5,
          reviewPeriodDays: 7,
        },
      }),
    });

    const presentation = buildMerchantOverviewPresentation({
      organizationId: readiness.organizationId,
      storeName: "Snapstore",
      readiness,
      attention: summarizeMerchantAttention([]),
    });

    expect(presentation.evidenceHonesty).toMatch(/Sales and planning inputs are present/i);
    expect(presentation.evidenceHonesty).not.toMatch(
      /blocked until sales and planning evidence arrive/i,
    );
    expect(presentation.evidenceHonesty).not.toMatch(/sales evidence is still missing/i);
    expect(presentation.commercialFence).toMatch(/separately authorized/i);
    expect(presentation.commercialFence).toMatch(/not a production REORDER/i);
    expect(readiness.commercialActionsEligible).toBe(false);
  });

  it("distinguishes known-zero stock from unknown stock and limited history", () => {
    const attention = summarizeMerchantAttention([
      row({
        grainKey: "oos",
        coverStatus: "valid",
        availableQuantity: 0,
        daysOfStock: 0,
      }),
      row({
        grainKey: "unknown-stock",
        coverStatus: "unknown_stock",
        availableQuantity: null,
        daysOfStock: null,
        salesVelocity30d: null,
      }),
      row({
        grainKey: "low",
        coverStatus: "valid",
        daysOfStock: LOW_COVER_ATTENTION_DAYS - 1,
      }),
      row({
        grainKey: "high",
        coverStatus: "valid",
        daysOfStock: HIGH_COVER_REVIEW_DAYS,
      }),
      row({
        grainKey: "limited",
        coverStatus: "valid",
        daysOfStock: 20,
        eligibleDays30d: 3,
      }),
      row({
        grainKey: "stale",
        coverStatus: "stale",
        daysOfStock: null,
        salesVelocity30d: null,
        metricDate: "2026-11-11",
      }),
    ]);

    expect(attention.lastRecordedOutOfStockCount).toBe(1);
    // Known-zero available with valid 0-day cover is both out-of-stock and low-cover.
    expect(attention.coverSignalEvaluation).toBe("evaluated");
    expect(attention.lowCoverCount).toBe(2);
    expect(attention.highCoverReviewCount).toBe(1);
    expect(attention.limitedHistoryCount).toBe(1);
    expect(attention.unknownDemandCount).toBe(1);
    expect(attention.staleOrPendingCount).toBe(1);
    expect(attention.limitedOrUnknownEvidenceCount).toBe(3);
    expect(attention.calculableCoverCount).toBe(4);
  });

  it("builds merchant-oriented headlines instead of import-status copy", () => {
    const readiness = assessMerchantDecisionReadiness({
      organizationId: "11111111-1111-4111-8111-111111111111",
      presence: presence({
        inventorySnapshotCount: 4,
        distinctSkuCount: 4,
        distinctStoreCount: 1,
        distinctLocationCount: 1,
        knownAvailableSkuCount: 4,
        hasSalesHistory: true,
        hasSkuDailyMetrics: true,
        grainAlignedKnownDemandCount: 4,
        hasPendingMetricWork: false,
        planning: {
          leadTimeDays: 7,
          safetyStockDays: 5,
          reviewPeriodDays: 7,
        },
      }),
    });

    const withOos = buildMerchantOverviewPresentation({
      organizationId: readiness.organizationId,
      storeName: "Snapstore",
      readiness,
      attention: summarizeMerchantAttention([
        row({
          grainKey: "oos",
          coverStatus: "valid",
          availableQuantity: 0,
          daysOfStock: 0,
        }),
      ]),
    });

    expect(withOos.headline).toMatch(/out of stock/i);
    expect(withOos.headline).not.toMatch(/Imported inventory is available/i);
    expect(withOos.primaryCta.href).toContain("filter=out_of_stock");
    expect(withOos.primaryCta.href).toContain("#inventory-evidence");
    expect(withOos.signals.find((s) => s.id === "out_of_stock")?.count).toBe(1);
    expect(
      withOos.signals.find((s) => s.id === "limited_history")?.filter,
    ).toBe("limited_history");
    expect(
      withOos.signals.find((s) => s.id === "low_cover")?.description,
    ).toMatch(/Review heuristic/i);
    expect(
      withOos.signals.find((s) => s.id === "high_cover_review")?.description,
    ).toMatch(/not overstock-risk-v1/i);
    expect(withOos.secondaryCta?.label).toMatch(/not live/i);
    expect(withOos.sourceLabel).toBe("CSV import");
    expect(withOos.freshnessLabel).toBe("Current");
  });

  it("falls back invalid Inventory filter query values to all", () => {
    expect(parseInventoryAttentionFilter("bogus")).toBeNull();
    expect(parseInventoryAttentionFilter("limited_or_unknown")).toBe(
      "limited_or_unknown",
    );
  });

  it("keeps Overview architecture permission-safe and tenant chrome demoted", () => {
    const overviewPage = read("app/(app)/app/[organizationId]/page.tsx");
    const dashboard = read(
      "components/overview/merchant-overview-dashboard.tsx",
    );
    const inventoryPage = read(
      "app/(app)/app/[organizationId]/inventory/page.tsx",
    );

    expect(overviewPage).toContain("requireAppIdentity");
    expect(overviewPage).toContain("resolveServerOrganizationContext");
    expect(overviewPage).toContain("organization_access_denied");
    expect(overviewPage).toContain("loadMerchantDecisionReadiness");
    expect(overviewPage).toContain("loadMerchantInventoryIntelligence");
    expect(overviewPage).toContain("buildMerchantOverviewPresentation");
    expect(overviewPage).not.toContain("Imported inventory is available.");
    expect(overviewPage).not.toContain(
      "Commercial recommendations stay blocked until sales and planning evidence arrive.",
    );
    expect(overviewPage).not.toContain("decideInventoryAction");
    expect(overviewPage).not.toContain("REORDER");

    expect(dashboard).toContain("data-overview-tenant-meta");
    expect(dashboard).toContain("Organization secured");
    expect(dashboard).not.toContain("Tenant boundary active");
    expect(dashboard).toContain("data-commercial-queue=\"false\"");
    expect(dashboard).toContain("min-h-11");
    expect(dashboard).toContain("focus-visible:outline");
    expect(dashboard).toContain("sm:grid-cols-2");
    expect(dashboard).toContain("xl:grid-cols-3");
    expect(dashboard).toContain("xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.7fr)]");
    expect(dashboard).toContain("data-overview-desktop-columns=\"xl\"");
    expect(dashboard).toContain("data-overview-layout=\"responsive\"");
    expect(dashboard).toContain("w-full min-w-0");
    expect(dashboard).not.toContain("overflow-hidden border-b");
    expect(dashboard).toContain("sa-overview-fade");
    expect(dashboard).toContain("sa-overview-rise");
    expect(dashboard).toContain("prefers-reduced-motion");
    expect(dashboard).toContain("data-synthetic-actions");
    expect(dashboard).toContain("data-synthetic-actions-note");
    expect(dashboard).toContain("Synthetic only");
    expect(dashboard).toContain("data-overview-signal-evaluation");
    expect(dashboard).toContain("data-overview-signal-priority");
    expect(dashboard).toContain("data-overview-data-health-next");
    expect(dashboard).toContain("data-overview-attention-empty");
    expect(
      read("lib/inventory-readiness/overview-presentation.ts"),
    ).toContain("not live");
    expect(inventoryPage).toContain("INVENTORY_EVIDENCE_ANCHOR");
    expect(inventoryPage).toContain("attentionDeepLink");
    expect(inventoryPage).toContain("data-attention-deep-link");

    expect(inventoryPage).toContain("parseInventoryAttentionFilter");
    expect(inventoryPage).toContain("initialFilter");
    expect(inventoryPage).toContain("searchParams");
  });

  it("loads an informative Overview loading state without inventing metrics", () => {
    const loading = read("app/(app)/app/[organizationId]/loading.tsx");
    expect(loading).toContain("data-overview-loading");
    expect(loading).toContain("Loading overview");
    expect(loading).not.toContain("REORDER");
    expect(loading).not.toContain("savings");
  });
});
