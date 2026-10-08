import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeCanonicalOrderStatus,
} from "@/lib/providers/order-status";

describe("provider order-status normalization", () => {
  it("preserves canonical pending", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "pending",
      ),
    ).toBe("pending");
  });

  it("preserves canonical open", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "open",
      ),
    ).toBe("open");
  });

  it("preserves canonical completed", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "completed",
      ),
    ).toBe("completed");
  });

  it("normalizes canceled spelling to cancelled", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "canceled",
      ),
    ).toBe("cancelled");
  });

  it("preserves canonical refunded", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "refunded",
      ),
    ).toBe("refunded");
  });

  it("preserves canonical partially_refunded", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "partially_refunded",
      ),
    ).toBe(
      "partially_refunded",
    );
  });

  it("trims whitespace and normalizes case", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "  COMPLETED  ",
      ),
    ).toBe("completed");
  });

  it("maps blank status to unknown", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "   ",
      ),
    ).toBe("unknown");
  });

  it("maps missing status to unknown", () => {
    expect(
      normalizeCanonicalOrderStatus(
        null,
      ),
    ).toBe("unknown");

    expect(
      normalizeCanonicalOrderStatus(
        undefined,
      ),
    ).toBe("unknown");
  });

  it("maps unsupported status to unknown instead of completed", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "fulfilled",
      ),
    ).toBe("unknown");
  });

  it("never guesses provider-specific paid status into completed", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "paid",
      ),
    ).toBe("unknown");
  });

  it("never guesses provider-specific processing status into open", () => {
    expect(
      normalizeCanonicalOrderStatus(
        "processing",
      ),
    ).toBe("unknown");
  });
});
