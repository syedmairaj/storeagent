import { describe, expect, it } from "vitest";

import { resolveEligibleIncoming } from "@/lib/metrics/resolve-eligible-incoming";
import type { IncomingPurchaseOrderLineInput } from "@/lib/metrics/types";

function line(
  partial: Partial<IncomingPurchaseOrderLineInput> &
    Pick<IncomingPurchaseOrderLineInput, "status">,
): IncomingPurchaseOrderLineInput {
  return {
    orderedQuantity: partial.orderedQuantity ?? 10,
    receivedQuantity:
      partial.receivedQuantity === undefined
        ? null
        : partial.receivedQuantity,
    status: partial.status,
  };
}

describe("resolveEligibleIncoming", () => {
  const asOf = new Date("2026-11-08T12:00:00.000Z");

  it("keeps historical metric dates unknown without inventing zero", () => {
    const result = resolveEligibleIncoming({
      metricDate: "2026-11-07",
      timeZone: "UTC",
      purchaseOrderLines: [line({ status: "confirmed", orderedQuantity: 4 })],
      incomingEvidenceComplete: true,
      asOfInstant: asOf,
    });
    expect(result.incomingStateKnown).toBe(false);
    expect(result.eligibleIncomingQuantity).toBeNull();
    expect(result.eligibleIncomingReasonCode).toBe("INCOMING_STATE_UNKNOWN");
  });

  it("uses store-local current date for Asia/Dubai", () => {
    // 2026-11-08 22:00 UTC → 2026-11-09 02:00 Asia/Dubai
    const dubaiInstant = new Date("2026-11-08T22:00:00.000Z");
    const historical = resolveEligibleIncoming({
      metricDate: "2026-11-08",
      timeZone: "Asia/Dubai",
      purchaseOrderLines: [line({ status: "confirmed", orderedQuantity: 3 })],
      incomingEvidenceComplete: false,
      asOfInstant: dubaiInstant,
    });
    expect(historical.eligibleIncomingQuantity).toBeNull();

    const current = resolveEligibleIncoming({
      metricDate: "2026-11-09",
      timeZone: "Asia/Dubai",
      purchaseOrderLines: [line({ status: "confirmed", orderedQuantity: 3 })],
      incomingEvidenceComplete: false,
      asOfInstant: dubaiInstant,
    });
    expect(current.eligibleIncomingQuantity).toBe(3);
    expect(current.eligibleIncomingReasonCode).toBeNull();
  });

  it("does not treat empty lines as verified zero without attestation", () => {
    const result = resolveEligibleIncoming({
      metricDate: "2026-11-08",
      timeZone: "UTC",
      purchaseOrderLines: [],
      incomingEvidenceComplete: false,
      asOfInstant: asOf,
    });
    expect(result.eligibleIncomingQuantity).toBeNull();
    expect(result.eligibleIncomingReasonCode).toBe("INCOMING_STATE_UNKNOWN");
  });

  it("persists known zero only when empty and attested complete", () => {
    const result = resolveEligibleIncoming({
      metricDate: "2026-11-08",
      timeZone: "UTC",
      purchaseOrderLines: [],
      incomingEvidenceComplete: true,
      asOfInstant: asOf,
    });
    expect(result.eligibleIncomingQuantity).toBe(0);
    expect(result.eligibleIncomingReasonCode).toBeNull();
    expect(result.incomingStateKnown).toBe(true);
  });

  it("covers frozen status and quantity combinations", () => {
    const cases: Array<{
      lines: IncomingPurchaseOrderLineInput[];
      qty: number | null;
      reason: string | null;
    }> = [
      { lines: [line({ status: "draft" })], qty: 0, reason: null },
      {
        lines: [line({ status: "submitted", orderedQuantity: 7 })],
        qty: 7,
        reason: null,
      },
      {
        lines: [line({ status: "confirmed", orderedQuantity: 5 })],
        qty: 5,
        reason: null,
      },
      {
        lines: [
          line({
            status: "partially_received",
            orderedQuantity: 10,
            receivedQuantity: 4,
          }),
        ],
        qty: 6,
        reason: null,
      },
      {
        lines: [
          line({
            status: "partially_received",
            orderedQuantity: 10,
            receivedQuantity: null,
          }),
        ],
        qty: null,
        reason: "RECEIVED_QUANTITY_UNKNOWN",
      },
      { lines: [line({ status: "received" })], qty: 0, reason: null },
      { lines: [line({ status: "cancelled" })], qty: 0, reason: null },
      {
        lines: [line({ status: "unknown" })],
        qty: null,
        reason: "PURCHASE_ORDER_STATUS_UNKNOWN",
      },
      {
        lines: [
          line({
            status: "partially_received",
            orderedQuantity: 2,
            receivedQuantity: 5,
          }),
        ],
        qty: null,
        reason: "RECEIVED_EXCEEDS_ORDERED",
      },
    ];

    for (const entry of cases) {
      const result = resolveEligibleIncoming({
        metricDate: "2026-11-08",
        timeZone: "UTC",
        purchaseOrderLines: entry.lines,
        incomingEvidenceComplete: false,
        asOfInstant: asOf,
      });
      expect(result.eligibleIncomingQuantity).toBe(entry.qty);
      expect(result.eligibleIncomingReasonCode).toBe(entry.reason);
    }
  });

  it("fails closed at the whole grain when any line is invalid", () => {
    const result = resolveEligibleIncoming({
      metricDate: "2026-11-08",
      timeZone: "UTC",
      purchaseOrderLines: [
        line({ status: "confirmed", orderedQuantity: 4 }),
        line({ status: "unknown", orderedQuantity: 1 }),
      ],
      incomingEvidenceComplete: true,
      asOfInstant: asOf,
    });
    expect(result.eligibleIncomingQuantity).toBeNull();
    expect(result.eligibleIncomingReasonCode).toBe(
      "PURCHASE_ORDER_STATUS_UNKNOWN",
    );
  });
});
