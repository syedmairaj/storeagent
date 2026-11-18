import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  inventoryEvidenceSourceDetail,
  inventoryEvidenceSourceLabel,
} from "@/lib/inventory-readiness/inventory-source";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("inventory evidence source UX", () => {
  it("labels CSV without implying a live connected integration", () => {
    expect(inventoryEvidenceSourceLabel("csv")).toBe("CSV import");
    expect(inventoryEvidenceSourceDetail("csv")).toMatch(
      /not a live connected integration/i,
    );
    expect(inventoryEvidenceSourceDetail("csv")).not.toMatch(
      /connected live sync/i,
    );
  });

  it("keeps Shopify wording reserved and explicit for future connectors", () => {
    expect(inventoryEvidenceSourceLabel("shopify")).toBe("Shopify");
    expect(inventoryEvidenceSourceDetail("shopify")).toMatch(
      /when connected and authorized/i,
    );
  });

  it("wires CSV source helpers into Inventory without live-connector claims", () => {
    const page = read("app/(app)/app/[organizationId]/inventory/page.tsx");
    expect(page).toContain('INVENTORY_SOURCE_KIND = "csv"');
    expect(page).toContain("inventoryEvidenceSourceLabel");
    expect(page).toContain("inventoryEvidenceSourceDetail");
    expect(page).not.toContain("Live inventory is connected");
    expect(page).not.toContain("live connected");

    const source = read("lib/inventory-readiness/inventory-source.ts");
    expect(source).toContain('"csv" | "shopify" | "unknown"');
  });
});
