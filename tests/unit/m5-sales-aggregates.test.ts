import { describe, expect, it } from "vitest";

import type { OrderStatus } from "@/lib/commerce-domain/types";
import { calculateSalesVelocity } from "@/lib/metrics/inventory-math";
import {
  aggregateSales,
  type SalesAggregateInput,
} from "@/lib/metrics/sales-aggregates";

const ORG = "org-a";
const STORE = "store-a";
const LOCATION = "loc-a";
const OTHER_LOCATION = "loc-b";
const VARIANT = "variant-a";

function input(
  overrides: Partial<SalesAggregateInput> = {},
): SalesAggregateInput {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    metricDate: "2026-10-14",
    timeZone: "Asia/Dubai",
    orders: [],
    orderItems: [],
    returnRefunds: [],
    inventorySnapshots: [],
    ...overrides,
  };
}

function sale(
  status: OrderStatus,
  quantity: number,
  orderedAt = "2026-10-14T08:00:00Z",
  locationId: string | null = LOCATION,
) {
  return {
    orders: [
      {
        id: "order-1",
        organizationId: ORG,
        storeId: STORE,
        status,
        orderedAt,
      },
    ],
    orderItems: [
      {
        id: "item-1",
        organizationId: ORG,
        storeId: STORE,
        orderId: "order-1",
        variantId: VARIANT,
        locationId,
        quantity,
      },
    ],
  };
}

describe("M5.3 sales aggregates", () => {
  it.each([
    "completed",
    "refunded",
    "partially_refunded",
  ] as const)("counts %s as sold units", (status) => {
    const result = aggregateSales(input(sale(status, 4)));

    expect(result.windows[7]).toMatchObject({
      soldUnits: 4,
      returnedUnits: 0,
      eligibleDays: 1,
      velocity: 4,
      reasonCode: null,
    });
  });

  it.each(["pending", "open", "cancelled", "unknown"] as const)(
    "counts %s as zero sold units",
    (status) => {
      const result = aggregateSales(input(sale(status, 4)));

      expect(result.windows[7]).toMatchObject({
        soldUnits: 0,
        eligibleDays: 0,
        velocity: null,
        reasonCode: "NO_ELIGIBLE_DAYS",
      });
    },
  );

  it("does not subtract cancelled quantity from completed sales", () => {
    const completed = sale("completed", 4);
    const result = aggregateSales(
      input({
        orders: [
          ...completed.orders,
          {
            id: "order-2",
            organizationId: ORG,
            storeId: STORE,
            status: "cancelled",
            orderedAt: "2026-10-14T08:00:00Z",
          },
        ],
        orderItems: [
          ...completed.orderItems,
          {
            id: "item-2",
            organizationId: ORG,
            storeId: STORE,
            orderId: "order-2",
            variantId: VARIANT,
            locationId: LOCATION,
            quantity: 9,
          },
        ],
      }),
    );

    expect(result.windows[7].soldUnits).toBe(4);
    expect(result.windows[7].velocity).toBe(
      calculateSalesVelocity({
        soldUnits: 4,
        cancelledUnits: 0,
        returnedUnits: 0,
        eligibleDays: 1,
      }).value,
    );
  });

  it("does not infer returned units from a financial refund", () => {
    const result = aggregateSales(input(sale("refunded", 8)));

    expect(result.windows[7]).toMatchObject({
      soldUnits: 8,
      returnedUnits: 0,
      velocity: 8,
    });
  });

  it("ignores a null returned quantity", () => {
    const result = aggregateSales(
      input({
        returnRefunds: [
          {
            id: "return-1",
            organizationId: ORG,
            storeId: STORE,
            variantId: VARIANT,
            locationId: LOCATION,
            returnedQuantity: null,
            occurredAt: "2026-10-14T08:00:00Z",
          },
        ],
      }),
    );

    expect(result.windows[7].reasonCode).toBe("NO_ELIGIBLE_DAYS");
    expect(result.windows[7].returnedUnits).toBe(0);
  });

  it("excludes a null order-item location", () => {
    const result = aggregateSales(input(sale("completed", 4, undefined, null)));

    expect(result.windows[7].soldUnits).toBe(0);
    expect(result.windows[7].reasonCode).toBe("NO_ELIGIBLE_DAYS");
  });

  it("does not inherit an order-item location for a null return location", () => {
    const result = aggregateSales(
      input({
        ...sale("completed", 4),
        returnRefunds: [
          {
            id: "return-1",
            organizationId: ORG,
            storeId: STORE,
            variantId: VARIANT,
            locationId: null,
            returnedQuantity: 3,
            occurredAt: "2026-10-14T08:00:00Z",
          },
        ],
      }),
    );

    expect(result.windows[7]).toMatchObject({
      soldUnits: 4,
      returnedUnits: 0,
      velocity: 4,
    });
  });

  it("keeps an explicit return on its own location when the sale location differs", () => {
    const facts = {
      ...sale("completed", 4),
      returnRefunds: [
        {
          id: "return-1",
          organizationId: ORG,
          storeId: STORE,
          variantId: VARIANT,
          locationId: OTHER_LOCATION,
          returnedQuantity: 3,
          occurredAt: "2026-10-14T08:00:00Z",
        },
      ],
    };
    const saleLocation = aggregateSales(input(facts));
    const returnLocation = aggregateSales(
      input({
        ...facts,
        locationId: OTHER_LOCATION,
      }),
    );

    expect(saleLocation.windows[7]).toMatchObject({
      soldUnits: 4,
      returnedUnits: 0,
    });
    expect(returnLocation.windows[7]).toMatchObject({
      soldUnits: 0,
      returnedUnits: 3,
      eligibleDays: 1,
      velocity: 0,
      reasonCode: null,
    });
  });

  it("ignores another organization, store, or variant", () => {
    const result = aggregateSales(
      input({
        orders: [
          {
            id: "order-1",
            organizationId: "org-b",
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-10-14T08:00:00Z",
          },
        ],
        orderItems: [
          {
            id: "item-1",
            organizationId: "org-b",
            storeId: STORE,
            orderId: "order-1",
            variantId: VARIANT,
            locationId: LOCATION,
            quantity: 4,
          },
          {
            id: "item-2",
            organizationId: ORG,
            storeId: "store-b",
            orderId: "order-1",
            variantId: VARIANT,
            locationId: LOCATION,
            quantity: 4,
          },
          {
            id: "item-3",
            organizationId: ORG,
            storeId: STORE,
            orderId: "order-1",
            variantId: "variant-b",
            locationId: LOCATION,
            quantity: 4,
          },
        ],
      }),
    );

    expect(result.windows[7].soldUnits).toBe(0);
  });

  it("sums multiple physical returns without joining them to sales", () => {
    const result = aggregateSales(
      input({
        ...sale("completed", 10),
        returnRefunds: [
          {
            id: "return-1",
            organizationId: ORG,
            storeId: STORE,
            variantId: VARIANT,
            locationId: LOCATION,
            returnedQuantity: 2,
            occurredAt: "2026-10-14T08:00:00Z",
          },
          {
            id: "return-2",
            organizationId: ORG,
            storeId: STORE,
            variantId: VARIANT,
            locationId: LOCATION,
            returnedQuantity: 3,
            occurredAt: "2026-10-14T09:00:00Z",
          },
        ],
      }),
    );

    expect(result.windows[7]).toMatchObject({
      soldUnits: 10,
      returnedUnits: 5,
      eligibleDays: 1,
      velocity: 5,
    });
  });

  it("counts duplicate snapshot evidence as one eligible day", () => {
    const result = aggregateSales(
      input({
        inventorySnapshots: [
          {
            id: "snap-1",
            organizationId: ORG,
            storeId: STORE,
            locationId: LOCATION,
            variantId: VARIANT,
            observedAt: "2026-10-14T08:00:00Z",
            availableQuantity: 0,
          },
          {
            id: "snap-2",
            organizationId: ORG,
            storeId: STORE,
            locationId: LOCATION,
            variantId: VARIANT,
            observedAt: "2026-10-14T18:00:00Z",
            availableQuantity: 5,
          },
        ],
      }),
    );

    expect(result.windows[7]).toMatchObject({
      eligibleDays: 1,
      soldUnits: 0,
      returnedUnits: 0,
      velocity: 0,
      reasonCode: null,
      coverageRatio: 1 / 7,
    });
  });

  it("treats a return-only day as eligible known-zero net demand", () => {
    const result = aggregateSales(
      input({
        returnRefunds: [
          {
            id: "return-1",
            organizationId: ORG,
            storeId: STORE,
            variantId: VARIANT,
            locationId: LOCATION,
            returnedQuantity: 4,
            occurredAt: "2026-10-14T08:00:00Z",
          },
        ],
      }),
    );

    expect(result.windows[7]).toMatchObject({
      soldUnits: 0,
      returnedUnits: 4,
      eligibleDays: 1,
      velocity: 0,
      reasonCode: null,
    });
  });

  it("treats known zero availability as eligible and missing evidence as unknown", () => {
    const knownZero = aggregateSales(
      input({
        inventorySnapshots: [
          {
            id: "snap-1",
            organizationId: ORG,
            storeId: STORE,
            locationId: LOCATION,
            variantId: VARIANT,
            observedAt: "2026-10-14T08:00:00Z",
            availableQuantity: 0,
          },
        ],
      }),
    );
    const unknown = aggregateSales(input());

    expect(knownZero.windows[7]).toMatchObject({
      eligibleDays: 1,
      velocity: 0,
      reasonCode: null,
    });
    expect(unknown.windows[7]).toMatchObject({
      eligibleDays: 0,
      velocity: null,
      reasonCode: "NO_ELIGIBLE_DAYS",
      coverageRatio: 0,
    });
  });

  it("keeps 7, 14, 30, and 90 windows on store-local calendar dates", () => {
    const result = aggregateSales(
      input({
        orders: [
          {
            id: "inside-7",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-10-08T08:00:00Z",
          },
          {
            id: "outside-7",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-10-07T08:00:00Z",
          },
          {
            id: "outside-30",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-09-14T08:00:00Z",
          },
          {
            id: "inside-90",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-07-17T08:00:00Z",
          },
          {
            id: "outside-90",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-07-16T08:00:00Z",
          },
        ],
        orderItems: [
          "inside-7",
          "outside-7",
          "outside-30",
          "inside-90",
          "outside-90",
        ].map((orderId, index) => ({
          id: `item-${index}`,
          organizationId: ORG,
          storeId: STORE,
          orderId,
          variantId: VARIANT,
          locationId: LOCATION,
          quantity: 1,
        })),
      }),
    );

    expect(result.windows[7].soldUnits).toBe(1);
    expect(result.windows[14].soldUnits).toBe(2);
    expect(result.windows[30].soldUnits).toBe(2);
    expect(result.windows[90].soldUnits).toBe(4);
    expect(result.days).toHaveLength(90);
    expect(result.days[0]?.metricDate).toBe("2026-07-17");
    expect(result.days[89]?.metricDate).toBe("2026-10-14");
  });

  it("places 2026-10-07T22:30:00Z on 2026-10-08 in Asia/Dubai", () => {
    const facts = sale("completed", 1, "2026-10-07T22:30:00Z");
    const endingOnSeventh = aggregateSales(
      input({
        ...facts,
        metricDate: "2026-10-07",
      }),
    );
    const endingOnEighth = aggregateSales(
      input({
        ...facts,
        metricDate: "2026-10-08",
      }),
    );

    expect(endingOnSeventh.windows[7].soldUnits).toBe(0);
    expect(endingOnEighth.windows[7].soldUnits).toBe(1);
  });

  it("uses local calendar dates across a daylight-saving transition", () => {
    const spring = aggregateSales(
      input({
        metricDate: "2026-03-08",
        timeZone: "America/New_York",
        orders: [
          {
            id: "before-window",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-03-02T04:59:00Z",
          },
          {
            id: "window-start",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-03-02T05:00:00Z",
          },
          {
            id: "before-jump",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-03-08T06:59:00Z",
          },
          {
            id: "after-jump",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-03-08T07:30:00Z",
          },
        ],
        orderItems: [
          "before-window",
          "window-start",
          "before-jump",
          "after-jump",
        ].map((orderId, index) => ({
          id: `item-${index}`,
          organizationId: ORG,
          storeId: STORE,
          orderId,
          variantId: VARIANT,
          locationId: LOCATION,
          quantity: 1,
        })),
      }),
    );
    const autumn = aggregateSales(
      input({
        metricDate: "2026-11-01",
        timeZone: "America/New_York",
        orders: [
          {
            id: "before-window",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-10-26T03:59:00Z",
          },
          {
            id: "window-start",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-10-26T04:00:00Z",
          },
          {
            id: "before-fallback",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-11-01T05:59:00Z",
          },
          {
            id: "after-fallback",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-11-01T06:30:00Z",
          },
        ],
        orderItems: [
          "before-window",
          "window-start",
          "before-fallback",
          "after-fallback",
        ].map((orderId, index) => ({
          id: `item-${index}`,
          organizationId: ORG,
          storeId: STORE,
          orderId,
          variantId: VARIANT,
          locationId: LOCATION,
          quantity: 1,
        })),
      }),
    );

    expect(spring.windows[7].soldUnits).toBe(3);
    expect(spring.days.at(-7)?.metricDate).toBe("2026-03-02");
    expect(spring.days.at(-1)?.metricDate).toBe("2026-03-08");
    expect(autumn.windows[7].soldUnits).toBe(3);
    expect(autumn.days).toHaveLength(90);
  });

  it("fails closed for an unrecognized timezone without returning zero demand", () => {
    expect(() =>
      aggregateSales(
        input({
          timeZone: "Not/AZone",
          ...sale("completed", 4),
        }),
      ),
    ).toThrow("stores.timezone must be a recognized IANA timezone.");
    expect(() =>
      aggregateSales(input({ timeZone: "Not/AZone" })),
    ).toThrow("stores.timezone must be a recognized IANA timezone.");
  });

  it("accepts UTC as a configured IANA timezone", () => {
    const result = aggregateSales(
      input({
        timeZone: "UTC",
        ...sale("completed", 2, "2026-10-07T22:30:00Z"),
        metricDate: "2026-10-07",
      }),
    );

    expect(result.windows[7].soldUnits).toBe(2);
  });

  it("floors window demand once instead of summing daily floors", () => {
    const result = aggregateSales(
      input({
        orders: [
          {
            id: "order-1",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-10-14T08:00:00Z",
          },
        ],
        orderItems: [
          {
            id: "item-1",
            organizationId: ORG,
            storeId: STORE,
            orderId: "order-1",
            variantId: VARIANT,
            locationId: LOCATION,
            quantity: 3,
          },
        ],
        returnRefunds: [
          {
            id: "return-1",
            organizationId: ORG,
            storeId: STORE,
            variantId: VARIANT,
            locationId: LOCATION,
            returnedQuantity: 5,
            occurredAt: "2026-10-13T08:00:00Z",
          },
        ],
      }),
    );
    const dailyNetSum = result.days.reduce(
      (sum, day) => sum + day.netUnitsSold,
      0,
    );

    expect(dailyNetSum).toBe(3);
    expect(result.windows[7]).toMatchObject({
      soldUnits: 3,
      returnedUnits: 5,
      eligibleDays: 2,
      velocity: 0,
      reasonCode: null,
    });
    expect(
      calculateSalesVelocity({
        soldUnits: 3,
        cancelledUnits: 0,
        returnedUnits: 5,
        eligibleDays: 2,
      }).value,
    ).toBe(0);
  });

  it("does not mutate source records", () => {
    const facts = input({
      ...sale("completed", 4),
      returnRefunds: [
        {
          id: "return-1",
          organizationId: ORG,
          storeId: STORE,
          variantId: VARIANT,
          locationId: LOCATION,
          returnedQuantity: 1,
          occurredAt: "2026-10-14T08:00:00Z",
        },
      ],
      inventorySnapshots: [
        {
          id: "snap-1",
          organizationId: ORG,
          storeId: STORE,
          locationId: LOCATION,
          variantId: VARIANT,
          observedAt: "2026-10-14T08:00:00Z",
          availableQuantity: 0,
        },
      ],
    });
    const before = structuredClone(facts);

    aggregateSales(facts);

    expect(facts).toEqual(before);
  });

  it("counts identical order items and returns once", () => {
    const completed = sale("completed", 4);
    const result = aggregateSales(
      input({
        orders: [...completed.orders, ...completed.orders],
        orderItems: [...completed.orderItems, ...completed.orderItems],
        returnRefunds: [
          {
            id: "return-1",
            organizationId: ORG,
            storeId: STORE,
            variantId: VARIANT,
            locationId: LOCATION,
            returnedQuantity: 2,
            occurredAt: "2026-10-14T08:00:00Z",
          },
          {
            id: "return-1",
            organizationId: ORG,
            storeId: STORE,
            variantId: VARIANT,
            locationId: LOCATION,
            returnedQuantity: 2,
            occurredAt: "2026-10-14T08:00:00Z",
          },
        ],
      }),
    );

    expect(result.windows[7]).toMatchObject({
      soldUnits: 4,
      returnedUnits: 2,
    });
  });

  it("fails closed when the same canonical identity conflicts", () => {
    const completed = sale("completed", 4);

    expect(() =>
      aggregateSales(
        input({
          ...completed,
          orderItems: [
            ...completed.orderItems,
            {
              ...completed.orderItems[0],
              quantity: 9,
            },
          ],
        }),
      ),
    ).toThrow("duplicate order item identity has conflicting evidence.");

    expect(() =>
      aggregateSales(
        input({
          returnRefunds: [
            {
              id: "return-1",
              organizationId: ORG,
              storeId: STORE,
              variantId: VARIANT,
              locationId: LOCATION,
              returnedQuantity: 2,
              occurredAt: "2026-10-14T08:00:00Z",
            },
            {
              id: "return-1",
              organizationId: ORG,
              storeId: STORE,
              variantId: VARIANT,
              locationId: OTHER_LOCATION,
              returnedQuantity: 2,
              occurredAt: "2026-10-14T08:00:00Z",
            },
          ],
        }),
      ),
    ).toThrow("duplicate return identity has conflicting evidence.");

    expect(() =>
      aggregateSales(
        input({
          orders: [
            {
              id: "order-1",
              organizationId: ORG,
              storeId: STORE,
              status: "completed",
              orderedAt: "2026-10-14T08:00:00Z",
            },
            {
              id: "order-1",
              organizationId: ORG,
              storeId: STORE,
              status: "cancelled",
              orderedAt: "2026-10-14T08:00:00Z",
            },
          ],
        }),
      ),
    ).toThrow("duplicate order identity has conflicting evidence.");
  });

  it("keeps distinct canonical ids countable in the same grain", () => {
    const result = aggregateSales(
      input({
        orders: [
          {
            id: "order-1",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-10-14T08:00:00Z",
          },
          {
            id: "order-2",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2026-10-14T08:00:00Z",
          },
        ],
        orderItems: [
          {
            id: "item-1",
            organizationId: ORG,
            storeId: STORE,
            orderId: "order-1",
            variantId: VARIANT,
            locationId: LOCATION,
            quantity: 4,
          },
          {
            id: "item-2",
            organizationId: ORG,
            storeId: STORE,
            orderId: "order-2",
            variantId: VARIANT,
            locationId: LOCATION,
            quantity: 4,
          },
        ],
      }),
    );

    expect(result.windows[7].soldUnits).toBe(8);
  });

  it("ignores a negative snapshot without discarding valid sales", () => {
    const result = aggregateSales(
      input({
        ...sale("completed", 4),
        inventorySnapshots: [
          {
            id: "snap-negative",
            organizationId: ORG,
            storeId: STORE,
            locationId: LOCATION,
            variantId: VARIANT,
            observedAt: "2026-10-13T08:00:00Z",
            availableQuantity: -1,
          },
        ],
      }),
    );
    const onlyNegative = aggregateSales(
      input({
        inventorySnapshots: [
          {
            id: "snap-negative",
            organizationId: ORG,
            storeId: STORE,
            locationId: LOCATION,
            variantId: VARIANT,
            observedAt: "2026-10-14T08:00:00Z",
            availableQuantity: -1,
          },
        ],
      }),
    );

    expect(result.windows[7]).toMatchObject({
      soldUnits: 4,
      eligibleDays: 1,
      velocity: 4,
      reasonCode: null,
    });
    expect(onlyNegative.windows[7]).toMatchObject({
      eligibleDays: 0,
      velocity: null,
      reasonCode: "NO_ELIGIBLE_DAYS",
    });
  });

  it("accepts Etc/UTC and rejects legacy timezone abbreviations", () => {
    const etc = aggregateSales(
      input({
        timeZone: "Etc/UTC",
        ...sale("completed", 2, "2026-10-07T22:30:00Z"),
        metricDate: "2026-10-07",
      }),
    );

    expect(etc.windows[7].soldUnits).toBe(2);
    expect(() => aggregateSales(input({ timeZone: "EST" }))).toThrow(
      "stores.timezone must be a recognized IANA timezone.",
    );
    expect(() => aggregateSales(input({ timeZone: "GMT" }))).toThrow(
      "stores.timezone must be a recognized IANA timezone.",
    );
  });

  it("keeps leap-day and year-boundary dates on the store calendar", () => {
    const leap = aggregateSales(
      input({
        metricDate: "2024-02-29",
        timeZone: "America/New_York",
        orders: [
          {
            id: "leap-day",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2024-03-01T04:30:00Z",
          },
          {
            id: "after-leap",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2024-03-01T05:00:00Z",
          },
        ],
        orderItems: ["leap-day", "after-leap"].map((orderId, index) => ({
          id: `item-${index}`,
          organizationId: ORG,
          storeId: STORE,
          orderId,
          variantId: VARIANT,
          locationId: LOCATION,
          quantity: 1,
        })),
      }),
    );
    const year = aggregateSales(
      input({
        metricDate: "2026-01-01",
        timeZone: "Asia/Dubai",
        orders: [
          {
            id: "new-year",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2025-12-31T20:30:00Z",
          },
          {
            id: "prior-year",
            organizationId: ORG,
            storeId: STORE,
            status: "completed",
            orderedAt: "2025-12-25T19:30:00Z",
          },
        ],
        orderItems: ["new-year", "prior-year"].map((orderId, index) => ({
          id: `item-${index}`,
          organizationId: ORG,
          storeId: STORE,
          orderId,
          variantId: VARIANT,
          locationId: LOCATION,
          quantity: 1,
        })),
      }),
    );

    expect(leap.windows[7].soldUnits).toBe(1);
    expect(leap.days.at(-1)?.metricDate).toBe("2024-02-29");
    expect(year.windows[7].soldUnits).toBe(1);
    expect(year.days.at(-7)?.metricDate).toBe("2025-12-26");
    expect(year.days.at(-1)?.metricDate).toBe("2026-01-01");
    expect(() =>
      aggregateSales(input({ metricDate: "2025-02-29" })),
    ).toThrow("metricDate must be a YYYY-MM-DD calendar date.");
  });
});
