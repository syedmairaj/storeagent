import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

function read(
  relativePath: string,
): string {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

describe("provider purchase-order boundary", () => {
  it("keeps provider PO normalization independent from incoming-stock calculation", () => {
    const source = read(
      "lib/providers/purchase-order-status.ts",
    );

    expect(
      source.includes(
        "calculateValidIncomingPurchaseOrderLine",
      ),
    ).toBe(false);

    expect(
      source.includes(
        "@/lib/metrics",
      ),
    ).toBe(false);
  });

  it("keeps incoming-stock truth in the metrics layer", () => {
    const metrics = read(
      "lib/metrics/inventory-math.ts",
    );

    expect(metrics).toContain(
      "incoming-stock-v1",
    );

    expect(metrics).toContain(
      "calculateValidIncomingPurchaseOrderLine",
    );
  });

  it("keeps unknown canonical PO status fail-closed downstream", () => {
    const metrics = read(
      "lib/metrics/inventory-math.ts",
    );

    expect(metrics).toContain(
      'case "unknown":',
    );

    expect(metrics).toContain(
      '"PURCHASE_ORDER_STATUS_UNKNOWN"',
    );
  });
});
