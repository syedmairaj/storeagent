import { describe, expect, it } from "vitest";

import { collectMerchantSalesOrders } from "@/lib/sales-import/build-csv-plan";
import { collectSalesHistoryConflicts } from "@/lib/sales-import/conflict-policy";
import { interpretMerchantSalesTimestamp } from "@/lib/sales-import/interpret-timestamp";
import { parseMerchantSalesCsv } from "@/lib/sales-import/parse-merchant-sales-csv";

const KNOWN = new Set(["WIDGET-S", "WIDGET-M"]);

describe("merchant sales CSV parse", () => {
  it("accepts a valid template-shaped CSV", () => {
    const source = [
      "order_id,line_id,sku,quantity,ordered_at,status,currency,unit_price",
      "ORD-1,LINE-1,WIDGET-S,2,2026-10-01 14:30:00,completed,USD,12.50",
      "ORD-1,LINE-2,WIDGET-M,1,2026-10-01 14:30:00,completed,USD,18.00",
    ].join("\n");

    const parsed = parseMerchantSalesCsv({
      source,
      storeTimezone: "UTC",
      storeCurrency: "USD",
      knownSkus: KNOWN,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.readyCount).toBe(2);
    expect(parsed.rejectedCount).toBe(0);
    expect(parsed.velocityEligibleCount).toBe(2);
    expect(parsed.rows[0]?.orderedAtIso).toMatch(/2026-10-01T14:30:00/);
  });

  it("rejects unknown SKUs without fabricating mappings", () => {
    const source = [
      "order_id,line_id,sku,quantity,ordered_at",
      "ORD-1,LINE-1,UNKNOWN-SKU,1,2026-10-01T12:00:00Z",
    ].join("\n");

    const parsed = parseMerchantSalesCsv({
      source,
      storeTimezone: "UTC",
      storeCurrency: "USD",
      knownSkus: KNOWN,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.readyCount).toBe(0);
    expect(parsed.rows[0]?.errors[0]?.code).toBe("UNKNOWN_SKU");
  });

  it("rejects duplicate line IDs", () => {
    const source = [
      "order_id,line_id,sku,quantity,ordered_at",
      "ORD-1,LINE-1,WIDGET-S,1,2026-10-01T12:00:00Z",
      "ORD-2,LINE-1,WIDGET-M,1,2026-10-02T12:00:00Z",
    ].join("\n");

    const parsed = parseMerchantSalesCsv({
      source,
      storeTimezone: "UTC",
      storeCurrency: "USD",
      knownSkus: KNOWN,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.rows[1]?.errors.some((error) => error.code === "DUPLICATE_LINE_ID")).toBe(
      true,
    );
  });

  it("rejects missing timestamps", () => {
    const source = [
      "order_id,line_id,sku,quantity,ordered_at",
      "ORD-1,LINE-1,WIDGET-S,1,",
    ].join("\n");

    const parsed = parseMerchantSalesCsv({
      source,
      storeTimezone: "UTC",
      storeCurrency: "USD",
      knownSkus: KNOWN,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(
      parsed.rows[0]?.errors.some((error) => error.code === "REQUIRED_FIELD"),
    ).toBe(true);
  });

  it("rejects deferred return columns instead of claiming net sales", () => {
    const source = [
      "order_id,line_id,sku,quantity,ordered_at,return_quantity",
      "ORD-1,LINE-1,WIDGET-S,1,2026-10-01T12:00:00Z,1",
    ].join("\n");

    const parsed = parseMerchantSalesCsv({
      source,
      storeTimezone: "UTC",
      storeCurrency: "USD",
      knownSkus: KNOWN,
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }
    expect(parsed.code).toBe("RETURNS_DEFERRED");
  });

  it("marks cancelled lines ready but not velocity-eligible", () => {
    const source = [
      "order_id,line_id,sku,quantity,ordered_at,status",
      "ORD-1,LINE-1,WIDGET-S,1,2026-10-01T12:00:00Z,cancelled",
    ].join("\n");

    const parsed = parseMerchantSalesCsv({
      source,
      storeTimezone: "UTC",
      storeCurrency: "USD",
      knownSkus: KNOWN,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.readyCount).toBe(1);
    expect(parsed.velocityEligibleCount).toBe(0);
    expect(parsed.rows[0]?.contributesToVelocity).toBe(false);
  });

  it("rejects conflicting order headers across lines", () => {
    const source = [
      "order_id,line_id,sku,quantity,ordered_at,status",
      "ORD-1,LINE-1,WIDGET-S,1,2026-10-01T12:00:00Z,completed",
      "ORD-1,LINE-2,WIDGET-M,1,2026-10-02T12:00:00Z,completed",
    ].join("\n");

    const parsed = parseMerchantSalesCsv({
      source,
      storeTimezone: "UTC",
      storeCurrency: "USD",
      knownSkus: KNOWN,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(
      parsed.rows[1]?.errors.some(
        (error) => error.code === "ORDER_HEADER_CONFLICT",
      ),
    ).toBe(true);
  });
});

describe("merchant sales timestamp interpretation", () => {
  it("preserves explicit-offset timestamps", () => {
    expect(
      interpretMerchantSalesTimestamp("2026-10-01T14:30:00Z", "UTC"),
    ).toBe("2026-10-01T14:30:00.000Z");
  });

  it("interprets naive timestamps in the store timezone", () => {
    const iso = interpretMerchantSalesTimestamp(
      "2026-10-01 14:30:00",
      "America/New_York",
    );
    expect(iso).toMatch(/^2026-10-01T14:30:00/);
    expect(iso).toMatch(/[+-]\d{2}:\d{2}$|Z$/);
  });

  it("rejects timestamps more than 24 hours in the future", () => {
    expect(() =>
      interpretMerchantSalesTimestamp("2099-01-01T00:00:00Z", "UTC"),
    ).toThrow(/24 hours in the future/i);
  });

  it("rejects timestamps before year 2000", () => {
    expect(() =>
      interpretMerchantSalesTimestamp("1999-12-31T00:00:00Z", "UTC"),
    ).toThrow(/2000/i);
  });
});

describe("merchant sales conflict policy", () => {
  it("allows identical replays", () => {
    const conflicts = collectSalesHistoryConflicts({
      proposedOrders: [
        {
          orderExternalId: "ORD-1",
          status: "completed",
          orderedAtIso: "2026-10-01T12:00:00.000Z",
          currency: "USD",
          externalReference: "ORD-1",
        },
      ],
      existingOrders: [
        {
          orderExternalId: "ORD-1",
          status: "completed",
          orderedAtIso: "2026-10-01T12:00:00.000Z",
          currency: "USD",
          externalReference: "ORD-1",
        },
      ],
      proposedItems: [
        {
          lineExternalId: "L1",
          orderExternalId: "ORD-1",
          variantSku: "SKU-A",
          quantity: 2,
          currency: "USD",
          unitPrice: "10.00",
        },
      ],
      existingItems: [
        {
          lineExternalId: "L1",
          orderExternalId: "ORD-1",
          variantSku: "SKU-A",
          quantity: 2,
          currency: "USD",
          unitPrice: "10.0000",
        },
      ],
    });
    expect(conflicts).toEqual([]);
  });

  it("rejects quantity or status conflicts that would rewrite history", () => {
    const conflicts = collectSalesHistoryConflicts({
      proposedOrders: [
        {
          orderExternalId: "ORD-1",
          status: "cancelled",
          orderedAtIso: "2026-10-01T12:00:00.000Z",
          currency: "USD",
          externalReference: "ORD-1",
        },
      ],
      existingOrders: [
        {
          orderExternalId: "ORD-1",
          status: "completed",
          orderedAtIso: "2026-10-01T12:00:00.000Z",
          currency: "USD",
          externalReference: "ORD-1",
        },
      ],
      proposedItems: [
        {
          lineExternalId: "L1",
          orderExternalId: "ORD-1",
          variantSku: "SKU-A",
          quantity: 9,
          currency: "USD",
          unitPrice: null,
        },
      ],
      existingItems: [
        {
          lineExternalId: "L1",
          orderExternalId: "ORD-1",
          variantSku: "SKU-A",
          quantity: 2,
          currency: "USD",
          unitPrice: null,
        },
      ],
    });
    expect(conflicts.some((message) => /status/i.test(message))).toBe(true);
    expect(conflicts.some((message) => /quantity/i.test(message))).toBe(true);
  });
});

describe("merchant sales order collection", () => {
  it("fails closed on conflicting ready order headers", () => {
    expect(() =>
      collectMerchantSalesOrders([
        {
          rowNumber: 2,
          orderId: "ORD-1",
          lineId: "L1",
          sku: "WIDGET-S",
          quantity: 1,
          orderedAtIso: "2026-10-01T12:00:00.000Z",
          orderStatus: "completed",
          currency: "USD",
          unitPrice: null,
          contributesToVelocity: true,
          importStatus: "ready",
          errors: [],
        },
        {
          rowNumber: 3,
          orderId: "ORD-1",
          lineId: "L2",
          sku: "WIDGET-M",
          quantity: 1,
          orderedAtIso: "2026-10-02T12:00:00.000Z",
          orderStatus: "completed",
          currency: "USD",
          unitPrice: null,
          contributesToVelocity: true,
          importStatus: "ready",
          errors: [],
        },
      ]),
    ).toThrow(/conflicting header/i);
  });
});
