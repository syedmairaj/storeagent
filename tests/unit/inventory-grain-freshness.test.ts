import { describe, expect, it } from "vitest";

import { summarizeGrainInventoryFreshness } from "@/lib/inventory-readiness/grain-freshness";

const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const LOC_A = "33333333-3333-4333-8333-333333333333";
const LOC_B = "44444444-4444-4444-8444-444444444444";

describe("summarizeGrainInventoryFreshness", () => {
  it("marks all places current when every known grain matches as-of", () => {
    const summary = summarizeGrainInventoryFreshness([
      {
        storeId: STORE_A,
        locationId: LOC_A,
        availableQuantity: 4,
        observedLocalDate: "2026-11-18",
        asOfMetricDate: "2026-11-18",
      },
      {
        storeId: STORE_A,
        locationId: LOC_A,
        availableQuantity: 2,
        observedLocalDate: "2026-11-18",
        asOfMetricDate: "2026-11-18",
      },
    ]);
    expect(summary.kind).toBe("all_current");
    expect(summary.allKnownPlacesCurrent).toBe(true);
    expect(summary.currentPlaceCount).toBe(1);
  });

  it("fails closed for mixed fresh and stale locations", () => {
    const summary = summarizeGrainInventoryFreshness([
      {
        storeId: STORE_A,
        locationId: LOC_A,
        storeName: "Main",
        locationName: "Front",
        availableQuantity: 10,
        observedLocalDate: "2026-11-18",
        asOfMetricDate: "2026-11-18",
      },
      {
        storeId: STORE_B,
        locationId: LOC_B,
        storeName: "Annex",
        locationName: "Back",
        availableQuantity: 3,
        observedLocalDate: "2026-11-12",
        asOfMetricDate: "2026-11-18",
      },
    ]);
    expect(summary.kind).toBe("mixed");
    expect(summary.allKnownPlacesCurrent).toBe(false);
    expect(summary.currentPlaceCount).toBe(1);
    expect(summary.stalePlaceCount).toBe(1);
  });

  it("treats null available as non-evidence and ignores it", () => {
    const summary = summarizeGrainInventoryFreshness([
      {
        storeId: STORE_A,
        locationId: LOC_A,
        availableQuantity: null,
        observedLocalDate: "2026-11-12",
        asOfMetricDate: "2026-11-18",
      },
    ]);
    expect(summary.kind).toBe("empty");
    expect(summary.allKnownPlacesCurrent).toBe(false);
  });

  it("fails a place closed when any SKU at that place is stale", () => {
    const summary = summarizeGrainInventoryFreshness([
      {
        storeId: STORE_A,
        locationId: LOC_A,
        availableQuantity: 1,
        observedLocalDate: "2026-11-18",
        asOfMetricDate: "2026-11-18",
      },
      {
        storeId: STORE_A,
        locationId: LOC_A,
        availableQuantity: 2,
        observedLocalDate: "2026-11-10",
        asOfMetricDate: "2026-11-18",
      },
    ]);
    expect(summary.kind).toBe("all_stale");
    expect(summary.places[0]?.status).toBe("stale");
    expect(summary.allKnownPlacesCurrent).toBe(false);
  });
});
