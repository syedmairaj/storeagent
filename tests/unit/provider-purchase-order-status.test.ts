import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeCanonicalPurchaseOrderStatus,
} from "@/lib/providers/purchase-order-status";

describe("provider purchase-order-status normalization", () => {
  it("preserves canonical draft", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "draft",
      ),
    ).toBe("draft");
  });

  it("preserves canonical submitted", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "submitted",
      ),
    ).toBe("submitted");
  });

  it("preserves canonical confirmed", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "confirmed",
      ),
    ).toBe("confirmed");
  });

  it("preserves canonical partially_received", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "partially_received",
      ),
    ).toBe("partially_received");
  });

  it("preserves canonical received", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "received",
      ),
    ).toBe("received");
  });

  it("preserves cancelled and normalizes canceled spelling", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "cancelled",
      ),
    ).toBe("cancelled");

    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "canceled",
      ),
    ).toBe("cancelled");
  });

  it("preserves canonical unknown", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "unknown",
      ),
    ).toBe("unknown");
  });

  it("trims whitespace and normalizes case", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "  PARTIALLY_RECEIVED  ",
      ),
    ).toBe("partially_received");
  });

  it("maps blank status to unknown", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "   ",
      ),
    ).toBe("unknown");
  });

  it("maps missing status to unknown", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        null,
      ),
    ).toBe("unknown");

    expect(
      normalizeCanonicalPurchaseOrderStatus(
        undefined,
      ),
    ).toBe("unknown");
  });

  it("does not guess unsupported provider statuses", () => {
    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "in_transit",
      ),
    ).toBe("unknown");

    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "approved",
      ),
    ).toBe("unknown");

    expect(
      normalizeCanonicalPurchaseOrderStatus(
        "closed",
      ),
    ).toBe("unknown");
  });
});
