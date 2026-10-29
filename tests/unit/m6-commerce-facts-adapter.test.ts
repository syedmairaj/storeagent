import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildForecastSkuDemandInput,
} from "@/lib/forecasting/commerce-facts";

import {
  forecastSkuDemand,
} from "@/lib/forecasting/orchestrate";

import {
  shiftForecastDate,
  type ForecastGrain,
} from "@/lib/forecasting/series";

const GRAIN: ForecastGrain = {
  organizationId: "org-a",
  storeId: "store-a",
  locationId: "loc-a",
  variantId: "var-a",
};

const AS_OF = "2026-06-15";
const TZ = "UTC";

function baseArgs(
  overrides: Partial<Parameters<typeof buildForecastSkuDemandInput>[0]> = {},
) {
  return {
    grain: GRAIN,
    forecastAsOf: AS_OF,
    timeZone: TZ,
    lookbackDays: 14,
    orders: [],
    orderItems: [],
    returnRefunds: [],
    inventorySnapshots: [],
    ...overrides,
  };
}

describe("M6 P2a commerce facts adapter", () => {
  it("rejects conflicting duplicate canonical identities", () => {
    expect(() =>
      buildForecastSkuDemandInput(
        baseArgs({
          orders: [
            {
              id: "ord-1",
              organizationId: GRAIN.organizationId,
              storeId: GRAIN.storeId,
              status: "completed",
              orderedAt: "2026-06-15T12:00:00.000Z",
            },
            {
              id: "ord-1",
              organizationId: GRAIN.organizationId,
              storeId: GRAIN.storeId,
              status: "cancelled",
              orderedAt: "2026-06-15T12:00:00.000Z",
            },
          ],
        }),
      ),
    ).toThrow(/duplicate order identity/);
  });

  it("counts sold statuses and excludes cancelled without double subtraction", () => {
    const input = buildForecastSkuDemandInput(
      baseArgs({
        orders: [
          {
            id: "sold",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            status: "completed",
            orderedAt: "2026-06-15T12:00:00.000Z",
          },
          {
            id: "refunded",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            status: "refunded",
            orderedAt: "2026-06-14T12:00:00.000Z",
          },
          {
            id: "cancelled",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            status: "cancelled",
            orderedAt: "2026-06-13T12:00:00.000Z",
          },
        ],
        orderItems: [
          {
            id: "i1",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            orderId: "sold",
            variantId: GRAIN.variantId,
            locationId: GRAIN.locationId,
            quantity: 5,
          },
          {
            id: "i2",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            orderId: "refunded",
            variantId: GRAIN.variantId,
            locationId: GRAIN.locationId,
            quantity: 3,
          },
          {
            id: "i3",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            orderId: "cancelled",
            variantId: GRAIN.variantId,
            locationId: GRAIN.locationId,
            quantity: 9,
          },
        ],
        returnRefunds: [
          {
            id: "r1",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            variantId: GRAIN.variantId,
            locationId: GRAIN.locationId,
            returnedQuantity: 2,
            occurredAt: "2026-06-15T18:00:00.000Z",
          },
        ],
      }),
    );

    const byDate = new Map(input.facts.map((fact) => [fact.date, fact]));

    expect(byDate.get("2026-06-15")?.unitsSold).toBe(3);
    expect(byDate.get("2026-06-14")?.unitsSold).toBe(3);
    expect(byDate.get("2026-06-13")?.unitsSold).toBe(0);
  });

  it("attributes store-local dates across a timezone boundary", () => {
    const input = buildForecastSkuDemandInput(
      baseArgs({
        timeZone: "America/New_York",
        orders: [
          {
            id: "ord-ny",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            status: "completed",
            // 2026-06-16 00:30 UTC -> 2026-06-15 20:30 EDT
            orderedAt: "2026-06-16T00:30:00.000Z",
          },
        ],
        orderItems: [
          {
            id: "item-ny",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            orderId: "ord-ny",
            variantId: GRAIN.variantId,
            locationId: GRAIN.locationId,
            quantity: 4,
          },
        ],
      }),
    );

    const fact = input.facts.find((row) => row.unitsSold === 4);

    expect(fact?.date).toBe("2026-06-15");
  });

  it("rejects invalid IANA timezones", () => {
    expect(() =>
      buildForecastSkuDemandInput(
        baseArgs({
          timeZone: "Not/AZone",
        }),
      ),
    ).toThrow(/IANA timezone/);
  });

  it("isolates location and ignores null or foreign return locations", () => {
    const input = buildForecastSkuDemandInput(
      baseArgs({
        orders: [
          {
            id: "ord-a",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            status: "completed",
            orderedAt: "2026-06-15T12:00:00.000Z",
          },
        ],
        orderItems: [
          {
            id: "own",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            orderId: "ord-a",
            variantId: GRAIN.variantId,
            locationId: GRAIN.locationId,
            quantity: 6,
          },
          {
            id: "other-loc",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            orderId: "ord-a",
            variantId: GRAIN.variantId,
            locationId: "loc-b",
            quantity: 8,
          },
          {
            id: "null-loc",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            orderId: "ord-a",
            variantId: GRAIN.variantId,
            locationId: null,
            quantity: 7,
          },
        ],
        returnRefunds: [
          {
            id: "ret-null",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            variantId: GRAIN.variantId,
            locationId: null,
            returnedQuantity: 5,
            occurredAt: "2026-06-15T13:00:00.000Z",
          },
          {
            id: "ret-other",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            variantId: GRAIN.variantId,
            locationId: "loc-b",
            returnedQuantity: 5,
            occurredAt: "2026-06-15T13:00:00.000Z",
          },
        ],
      }),
    );

    expect(
      input.facts.find((fact) => fact.date === "2026-06-15")?.unitsSold,
    ).toBe(6);
  });

  it("keeps sparse days without inventing observed zero demand", () => {
    const input = buildForecastSkuDemandInput(
      baseArgs({
        lookbackDays: 7,
        orders: [
          {
            id: "one",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            status: "completed",
            orderedAt: "2026-06-15T12:00:00.000Z",
          },
        ],
        orderItems: [
          {
            id: "one-item",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            orderId: "one",
            variantId: GRAIN.variantId,
            locationId: GRAIN.locationId,
            quantity: 2,
          },
        ],
      }),
    );

    expect(input.facts).toHaveLength(7);

    const empty = input.facts.filter((fact) => fact.date !== "2026-06-15");

    expect(empty.every((fact) => fact.unitsSold === 0)).toBe(true);
    expect(empty.every((fact) => fact.availability === "unknown")).toBe(true);
    expect(empty.every((fact) => fact.dataComplete === false)).toBe(true);
  });

  it("uses latest same-day snapshot by observed_at then id", () => {
    const input = buildForecastSkuDemandInput(
      baseArgs({
        inventorySnapshots: [
          {
            id: "snap-old",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            locationId: GRAIN.locationId,
            variantId: GRAIN.variantId,
            observedAt: "2026-06-15T08:00:00.000Z",
            availableQuantity: 9,
          },
          {
            id: "snap-new-a",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            locationId: GRAIN.locationId,
            variantId: GRAIN.variantId,
            observedAt: "2026-06-15T16:00:00.000Z",
            availableQuantity: 0,
          },
          {
            id: "snap-new-b",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            locationId: GRAIN.locationId,
            variantId: GRAIN.variantId,
            observedAt: "2026-06-15T16:00:00.000Z",
            availableQuantity: 4,
          },
        ],
      }),
    );

    expect(
      input.facts.find((fact) => fact.date === "2026-06-15")?.availability,
    ).toBe("available");
  });

  it("maps availability thresholds and keeps promotion/completeness fail-closed", () => {
    const input = buildForecastSkuDemandInput(
      baseArgs({
        lookbackDays: 3,
        inventorySnapshots: [
          {
            id: "zero",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            locationId: GRAIN.locationId,
            variantId: GRAIN.variantId,
            observedAt: "2026-06-14T12:00:00.000Z",
            availableQuantity: 0,
          },
          {
            id: "positive",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            locationId: GRAIN.locationId,
            variantId: GRAIN.variantId,
            observedAt: "2026-06-13T12:00:00.000Z",
            availableQuantity: 2,
          },
        ],
        trustedCompleteDates: ["2026-06-13"],
      }),
    );

    const byDate = new Map(input.facts.map((fact) => [fact.date, fact]));

    expect(byDate.get("2026-06-15")).toMatchObject({
      availability: "unknown",
      promotionState: "unknown",
      dataComplete: false,
    });
    expect(byDate.get("2026-06-14")).toMatchObject({
      availability: "unavailable",
      promotionState: "unknown",
      dataComplete: false,
    });
    expect(byDate.get("2026-06-13")).toMatchObject({
      availability: "available",
      promotionState: "unknown",
      dataComplete: true,
    });
  });

  it("excludes facts after forecastAsOf and rejects bad lookback", () => {
    const input = buildForecastSkuDemandInput(
      baseArgs({
        orders: [
          {
            id: "future",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            status: "completed",
            orderedAt: "2026-06-16T12:00:00.000Z",
          },
        ],
        orderItems: [
          {
            id: "future-item",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            orderId: "future",
            variantId: GRAIN.variantId,
            locationId: GRAIN.locationId,
            quantity: 11,
          },
        ],
      }),
    );

    expect(input.facts.every((fact) => fact.date <= AS_OF)).toBe(true);
    expect(input.facts.every((fact) => fact.unitsSold !== 11)).toBe(true);

    expect(() =>
      buildForecastSkuDemandInput(baseArgs({ lookbackDays: 0 })),
    ).toThrow(/lookbackDays/);
    expect(() =>
      buildForecastSkuDemandInput(baseArgs({ lookbackDays: 366 })),
    ).toThrow(/lookbackDays/);
  });

  it("ignores foreign-tenant commerce and remains fingerprint-stable", () => {
    const ownOrders = [
      {
        id: "own",
        organizationId: GRAIN.organizationId,
        storeId: GRAIN.storeId,
        status: "completed" as const,
        orderedAt: "2026-06-15T12:00:00.000Z",
      },
    ];
    const ownItems = [
      {
        id: "own-item",
        organizationId: GRAIN.organizationId,
        storeId: GRAIN.storeId,
        orderId: "own",
        variantId: GRAIN.variantId,
        locationId: GRAIN.locationId,
        quantity: 2,
      },
    ];

    const baseline = buildForecastSkuDemandInput(
      baseArgs({
        orders: ownOrders,
        orderItems: ownItems,
        trustedCompleteDates: [AS_OF],
      }),
    );

    const withForeign = buildForecastSkuDemandInput(
      baseArgs({
        orders: [
          ...ownOrders,
          {
            id: "foreign",
            organizationId: "org-b",
            storeId: GRAIN.storeId,
            status: "completed",
            orderedAt: "2026-06-15T12:00:00.000Z",
          },
        ],
        orderItems: [
          ...ownItems,
          {
            id: "foreign-item",
            organizationId: "org-b",
            storeId: GRAIN.storeId,
            orderId: "foreign",
            variantId: GRAIN.variantId,
            locationId: GRAIN.locationId,
            quantity: 99,
          },
        ],
        trustedCompleteDates: [AS_OF],
      }),
    );

    expect(withForeign.facts).toEqual(baseline.facts);

    const a = forecastSkuDemand(baseline);
    const b = forecastSkuDemand(withForeign);

    expect(a.reproducibilityFingerprint).toBe(b.reproducibilityFingerprint);
  });

  it("feeds forecastSkuDemand without loosening fail-closed promotion rules", () => {
    const lookbackDays = 28;
    const start = shiftForecastDate(AS_OF, -(lookbackDays - 1));
    const trusted = Array.from({ length: lookbackDays }, (_, index) =>
      shiftForecastDate(start, index),
    );

    const snapshots = trusted.map((date, index) => ({
      id: `snap-${index}`,
      organizationId: GRAIN.organizationId,
      storeId: GRAIN.storeId,
      locationId: GRAIN.locationId,
      variantId: GRAIN.variantId,
      observedAt: `${date}T12:00:00.000Z`,
      availableQuantity: 3,
    }));

    const withoutTrust = buildForecastSkuDemandInput(
      baseArgs({
        lookbackDays,
        inventorySnapshots: snapshots,
      }),
    );

    const abstain = forecastSkuDemand(withoutTrust);

    expect(abstain.dailyDemand).toBeNull();
    expect(
      withoutTrust.facts.every((fact) => fact.promotionState === "unknown"),
    ).toBe(true);
    expect(
      withoutTrust.facts.every((fact) => fact.dataComplete === false),
    ).toBe(true);

    // Even with trusted completeness, unknown promotion still fails closed.
    const withTrust = buildForecastSkuDemandInput(
      baseArgs({
        lookbackDays,
        inventorySnapshots: snapshots,
        trustedCompleteDates: trusted,
      }),
    );

    const stillAbstain = forecastSkuDemand(withTrust);

    expect(stillAbstain.dailyDemand).toBeNull();
    expect(stillAbstain.reasonCodes).toContain("NO_USABLE_FORECAST_WINDOWS");
  });
});
